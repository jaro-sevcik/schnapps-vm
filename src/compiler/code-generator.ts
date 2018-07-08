import * as Wabt from "wabt";
import * as WasmJit from "wasm-jit";

import * as IR from "./../compiler/ir-graph";
import { SharedFunctionInfo } from "./../function";
import { IVMFlags } from "./../vm-config";

export const kStackSlotLog2Size : number = 3;

class ReversedInstructionSequence {
  code : number[] = [];
  nodeIdToLocal : number[] = [];
  localTypes : WasmJit.Type[] = [WasmJit.Type.kI32];
  // TODO somehow name this constant.
  reservedLocals : number = 1;

  add(s : InstructionAssembler) {
    this.code.push(...s.code.reverse());
  }

  getLocalIndex(node : IR.Node) : number {
    let localId : undefined | number =  this.nodeIdToLocal[node.id];
    if (!localId) {
      localId = this.localTypes.length + this.reservedLocals;
      this.localTypes.push(WasmJit.Type.kF64);
      this.nodeIdToLocal[node.id] = localId;
    }
    return localId;
  }
}

class InstructionAssembler {
  code : number[] = [];

  emit(s : number[]) {
      this.code.push(...s);
  }

  f64Load() {
    this.emit([WasmJit.Opcode.kF64Load, 0, 0]);
  }

  setLocal(local : number) {
    this.code.push(WasmJit.Opcode.kSetLocal);
    WasmJit.emitU32V(local, this.code);
  }

  getLocal(local : number) {
    this.code.push(WasmJit.Opcode.kGetLocal);
    WasmJit.emitU32V(local, this.code);
  }

  f64Constant(n : number) {
    this.code.push(WasmJit.Opcode.kF64Const);
    WasmJit.emitF64V(n, this.code);
  }

  i32Constant(n : number) {
    this.code.push(WasmJit.Opcode.kI32Const);
    WasmJit.emitI32V(n, this.code);
  }

  f64Add() {
    this.code.push(WasmJit.Opcode.kF64Add);
  }

  i32Add() {
    this.code.push(WasmJit.Opcode.kI32Add);
  }

  i32Shl() {
    this.code.push(WasmJit.Opcode.kI32Shl);
  }

  ret() {
    this.code.push(WasmJit.Opcode.kReturn);
  }
}

function createWebassemblyFunction(
    shared : SharedFunctionInfo,
    sequence : ReversedInstructionSequence,
    mem : WebAssembly.Memory,
    vm_flags : IVMFlags) {
  const builder = new WasmJit.ModuleBuilder();
  const code = sequence.code.reverse();
  builder.addImportedMemory("I", "imported_mem");
  builder.addType(WasmJit.kSig_d_i);
  const locals : WasmJit.ILocal[] = [];
  for (const l of sequence.localTypes) {
    locals.push({ count : 1, type : l });
  }
  builder.addFunction("load", WasmJit.kSig_d_i)
      .addLocals(locals)
      .addBody(code)  // --
      .exportAs("exported");
  if (vm_flags.printCode) {
    console.log(`>>> Code for "${shared.name}".`);
    console.log(
        Wabt.readWasm(new Uint8Array(builder.toBuffer()), {}).toText({}));
  }
  const i = builder.instantiate(
      { I : { imported_mem : mem }});
  return i.exports.exported;
}

export function generateCode(
    shared : SharedFunctionInfo,
    graph : IR.Graph,
    memory : WebAssembly.Memory,
    vm_flags : IVMFlags) : (f : number) => number  {
  const sequence = new ReversedInstructionSequence();

  // Stack of basic block targets.
  const control_flow_stack : IR.BasicBlock[] = [];
  // Outstanding branch counts, indexed by basic blocks.
  // For each basic block, the array contains the number of
  // branches to the block that have not been emitted yet.
  const outstanding_branch_counts : number[] = [];
  const reverseBlockOrder = computeReverseBlockOrder(graph.entry);
  for (const bb of reverseBlockOrder) {
    // TODO Handle outgoing jumps.
    // TODO Handle phis from successors.

    if (!generateCodeForNodes(bb.nodes, sequence)) return null;

    // Pop all basic blocks that have all incoming branches resolved.
    while (control_flow_stack.length > 0) {
      const top_basic_block = control_flow_stack[control_flow_stack.length - 1];
      if (outstanding_branch_counts[top_basic_block.id] === 0) {
        control_flow_stack.pop();
      } else {
        break;
      }
    }

    // Push the current basic block.
    // TODO Handle loops.
    control_flow_stack.push(bb);
    outstanding_branch_counts[bb.id] = bb.predecessors.length;
  }

  // Emit prologue.
  const a = new InstructionAssembler();
  // Multiply the frame pointer by 8.
  a.getLocal(0);
  a.i32Constant(kStackSlotLog2Size);
  a.i32Shl();
  a.setLocal(0);
  sequence.add(a);

  return createWebassemblyFunction(shared, sequence, memory, vm_flags);
}

function generateCodeForNode(
    node : IR.Node,
    sequence : ReversedInstructionSequence) : boolean {
  const a = new InstructionAssembler();

  function emitGetNode(n : IR.Node) {
    a.getLocal(sequence.getLocalIndex(n));
  }

  function emitSetNode(n : IR.Node) {
    a.setLocal(sequence.getLocalIndex(n));
  }

  function f64LoadStack(index : number) {
    // Get the frame pointer.
    a.getLocal(0);
    // Add the index to it.
    a.i32Constant(index);
    a.i32Add();
    // Load the value.
    a.f64Load();
  }

  switch (node.opcode) {
    case IR.Opcode.kPhi:
      return false;

    case IR.Opcode.kParameter: {
      const p = node as IR.ParameterNode;
      f64LoadStack((-p.index - 1) << kStackSlotLog2Size);
      emitSetNode(p);
      break;
    }

    case IR.Opcode.kNumberConstant: {
      const c = node as IR.NumberConstantNode;
      a.f64Constant(c.n);
      emitSetNode(c);
      break;
    }

    case IR.Opcode.kJSSub:
      break;

    case IR.Opcode.kJSAdd: {
      const b = node as IR.BinopNode;
      emitGetNode(b.inputs[0]);
      emitGetNode(b.inputs[1]);
      a.f64Add();
      emitSetNode(b);
      break;
    }

    case IR.Opcode.kGoto:
    case IR.Opcode.kBranch:
      return false;

    case IR.Opcode.kReturn:
      emitGetNode(node.inputs[0]);
      a.ret();
      break;
  }
  sequence.add(a);
  return true;
}

function generateCodeForNodes(
    nodes : IR.Node[],
    sequence : ReversedInstructionSequence) : boolean {
  for (let i = nodes.length - 1; i >= 0; i-- ) {
    if (!generateCodeForNode(nodes[i], sequence)) {
      return false;
    }
  }
  return true;
}

class BasicBlockOrderData {
  visited : boolean = false;
  onStack : boolean = false;
  orderIndexStack : number[] = null;
}

class LoopInfo {
  header : IR.BasicBlock;
  backedges : IR.BasicBlock[] = [];

  constructor(backedge : IR.BasicBlock, header : IR.BasicBlock) {
    this.header = header;
    this.backedges.push(backedge);
  }

  addBackedge(backedge : IR.BasicBlock) {
    this.backedges.push(backedge);
  }
}

class Loops {
  infos : LoopInfo[] = [];

  addBackedge(backedge : IR.BasicBlock, header : IR.BasicBlock) {
    for (const l of this.infos) {
      if (l.header === header) {
        l.addBackedge(backedge);
        return;
      }
    }
    this.infos.push(new LoopInfo(backedge, header));
  }
}

export const computeBlockOrderForTesting = computeReverseBlockOrder;

function computeReverseBlockOrder(entry : IR.BasicBlock) : IR.BasicBlock[] {
  const order : IR.BasicBlock[] = [];
  const orderData : BasicBlockOrderData[] = [];
  const loops = new Loops();

  function getData(bb : IR.BasicBlock) : BasicBlockOrderData {
    let d = orderData[bb.id];
    if (!d) {
      d = new BasicBlockOrderData();
      orderData[bb.id] = d;
    }
    return d;
  }

  // Walk the CFG in DFS order, record all backedges. We also construct
  // a reversed topological sort by recording the nodes in post order.
  function processBlock(bb : IR.BasicBlock) {
    const blockData = getData(bb);
    blockData.onStack = true;
    blockData.visited = true;
    for (const s of bb.successors) {
      const successorData = getData(s);
      if (successorData.onStack) {
        // It is a backedge. Add it to our loop data structure. Since
        // we always have only reducible loops, the first pushed block
        // of any loop must be the loop header. As a result, the successor
        // of any backedge must be the loop header.
        loops.addBackedge(bb, s);
      } else if (!successorData.visited) {
        processBlock(s);
      }
    }
    blockData.onStack = false;

    // Capture the order index and push it to the ordered list.
    bb.orderIndex = order.length;
    order.push(bb);
  }

  // The tryMarkBlock function marks a basic block {bb} to belong
  // to loop with header {header}. If the the basic block belongs to
  // a nested loop, then it marks the least deeply nested header.
  //
  // The function returns the basic block, whose containgLoop field
  // was changed or null if the block was already marked to belong
  // to the loop.
  function tryMarkBlock(bb : IR.BasicBlock,
                        header : IR.BasicBlock) : IR.BasicBlock {
    let markedNode : IR.BasicBlock = null;
    const parent = header.containingLoop;

    while (true) {
      // If the block is already marked to be in the loop (or if it
      // is the header), just skip.
      if (bb === header) return null;
      if (bb === parent) {
        // We found the insertion point for the loop.
        markedNode.containingLoop = header;
        return markedNode;
      }
      markedNode = bb;
      bb = bb.containingLoop;
    }
  }

  // Walk the graph backwards until header is reached and mark all
  // basic blocks in the graph to belong to the loop.
  function markLoop(bb : IR.BasicBlock, header : IR.BasicBlock) {
    const markedNode = tryMarkBlock(bb, header);
    if (!markedNode) return;
    for (const pred of bb.predecessors) {
      markLoop(pred, header);
    }
  }

  function getOrderIndexStack(bb : IR.BasicBlock) {
    const d = getData(bb);
    if (!d.orderIndexStack) {
      const stack = [bb.orderIndex];
      bb = bb.containingLoop;
      while (bb) {
        stack.push(bb.orderIndex);
        bb = bb.containingLoop;
      }
      stack.reverse();
      d.orderIndexStack = stack;
    }
    return d.orderIndexStack;
  }

  // Comparator for basic block ordering. The comparator takes into account
  // the order of the containing loop first, so that basic blocks from
  // the same loop are kept together.
  function compareBlockOrder(left : IR.BasicBlock, right : IR.BasicBlock) {
    const left_order = getOrderIndexStack(left);
    const right_order = getOrderIndexStack(right);
    const end = Math.min(left_order.length, right_order.length);
    for (let i = 0; i < end; i++) {
      if (left_order[i] > right_order[i]) return 1;
      if (left_order[i] < right_order[i]) return -1;
    }
    if (left_order.length < right_order.length) return 1;
    if (left_order.length > right_order.length) return -1;
    return 0;
  }

  // Compute the topological order, disregarding loop back edges, but
  // recording them for later processing.
  processBlock(entry);

  // For each loop, mark all the loop member blocks to point to its
  // header.
  for (const l of loops.infos) {
    // Walk the graph from each backedge, and mark loop membership.
    for (const backedge of l.backedges) {
      markLoop(backedge, l.header);
    }
  }

  // Finally, resort the basic blocks to keep the basic blocks
  // from the same loop grouped together.
  order.sort(compareBlockOrder);

  // Update the orderIndex field in basic blocks to reflect the new order.
  order.forEach((v, i) => { v.orderIndex = i; });

  return order;
}