import * as assert from "assert";
import * as Wabt from "wabt";
import * as WasmJit from "wasm-jit";

import {
  InstructionAssembler,
} from "./../compiler/instruction-assembler";
import * as IR from "./../compiler/ir-graph";
import { SharedFunctionInfo } from "./../function";
import { IVMFlags } from "./../vm-config";

export const kStackSlotLog2Size : number = 3;

// Utility class for building instruction sequence in reverse.
class ReversedInstructionSequence {
  code : number[] = [];
  localTypes : WasmJit.Type[] = [];

  private nodeIdToLocal : number[] = [];
  // TODO somehow name this constant.
  private reservedLocals : number = 1;

  add(s : InstructionAssembler) {
    this.code.push(...s.code.reverse());
  }

  getLocalIndex(node : IR.Node) : number {
    let localId : undefined | number =  this.nodeIdToLocal[node.id];
    if (localId === undefined) {
      localId = this.localTypes.length + this.reservedLocals;
      this.localTypes.push(WasmJit.Type.kF64);
      this.nodeIdToLocal[node.id] = localId;
    }
    return localId;
  }
}

function createWebassemblyFunction(
    shared : SharedFunctionInfo,
    sequence : ReversedInstructionSequence,
    mem : WebAssembly.Memory,
    vmFlags : IVMFlags) {
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
  if (vmFlags.printCode) {
    console.log(`>>> Code for "${shared.name}".`);
    console.log(
        Wabt.readWasm(new Uint8Array(builder.toBuffer()), {}).toText({}));
  }
  const i = builder.instantiate(
      { I : { imported_mem : mem }});
  return i.exports.exported;
}

// The {ControlFlowBuilder} class is used to emit control flow for basic
// blocks. To emit the structured control flow, as dictated by Wasm, we
// need to keep track of the control flow block stack.
class ControlFlowBuilder {
  // Stack of control flow statements. The elements are target basic blocks.
  // Note that we are building in reverse order, so for forward branches,
  // the corresponding elements have already been emitted, for loop back
  // edges, the target basic blocks (i.e., loop headers) have not been
  // emitted yet.
  private controlFlowStack : IR.BasicBlock[] = [];
  // Outstanding branch counts, indexed by basic blocks.
  // For each basic block, the array contains the number of
  // branches to the block that have not been emitted yet.
  private outstandingBranchCounts : number[] = [];
  private sequence : ReversedInstructionSequence;

  constructor(sequence : ReversedInstructionSequence) {
    this.sequence = sequence;
  }

  emitBlockStart(bb : IR.BasicBlock) {
    this.tryPopStack(bb);

    // Push the current basic block and create a block end for it.
    if (bb.predecessors.length > 0) {
      this.controlFlowStack.push(bb);
      this.outstandingBranchCounts[bb.id] =
        bb.isLoopHeader ? 1 : bb.predecessors.length;
      const a = new InstructionAssembler();
      a.end();
      this.sequence.add(a);
    }
  }

  // Returns the largest index of a non-branch instruction. That is an index
  // where the code generation should continue next.
  emitBlockEnd(bb : IR.BasicBlock) : number {
    let last = bb.nodes.length - 1;
    const lastNode = bb.nodes[last];

    switch (lastNode.opcode) {
      case IR.Opcode.kBranch: {
        const a = new InstructionAssembler();
        a.getLocal(this.sequence.getLocalIndex(lastNode.inputs[0]));
        a.f64Constant(0);
        a.f64Eq();
        a.brIf(this.depthOfBlock(bb.successors[0]));
        // Omit the fallthrough jump if target is the immediate successor.
        if (bb.orderIndex + 1 !== bb.successors[0].orderIndex) {
          a.br(this.depthOfBlock(bb.successors[1]));
        }
        this.sequence.add(a);
        this.outstandingBranchCounts[bb.successors[0].id]--;
        this.outstandingBranchCounts[bb.successors[1].id]--;

        last--;
        break;
      }
      default: {
        // Insert branch to the next block if necessary.
        if (bb.successors.length === 1) {
          if (bb.successors[0].orderIndex <= bb.orderIndex) {
            // Backedge of a loop.
            const a = new InstructionAssembler();
            a.br(0);
            a.end();
            this.sequence.add(a);
            this.controlFlowStack.push(bb.successors[0]);
            this.outstandingBranchCounts[bb.successors[0].id] = 1;
          } else {
            // Forward edge, omit if target is the immediate successor.
            if (bb.orderIndex + 1 !== bb.successors[0].orderIndex) {
              const a = new InstructionAssembler();
              a.br(this.depthOfBlock(bb.successors[0]));
              this.sequence.add(a);
            }
            this.outstandingBranchCounts[bb.successors[0].id]--;
          }
        } else {
          assert.strictEqual(bb.successors.length, 0);
        }
        break;
      }
    }

    this.buildPhiMoves(bb);

    return last;
  }

  finished() : boolean { return this.controlFlowStack.length === 0; }

  private buildPhiMoves(bb : IR.BasicBlock) {
    if (bb.successors.length > 0) {
      if (bb.successors[0].predecessors.length > 1) {
        const a = new InstructionAssembler();
        // Check that we are in split edge form.
        assert.strictEqual(bb.successors.length, 1);
        const succ = bb.successors[0];
        // Find out which predessor is {bb}.
        const predIndex = succ.predecessors.indexOf(bb);
        for (const n of succ.nodes) {
          // When we hit a non-phi node, we are done with the
          // initial sequence of phis.
          if (n.opcode !== IR.Opcode.kPhi) break;
          const source = n.inputs[predIndex];
          a.getLocal(this.sequence.getLocalIndex(source));
          a.setLocal(this.sequence.getLocalIndex(n));
        }
        this.sequence.add(a);
      }
    }
  }

  private tryPopStack(currentBlock : IR.BasicBlock) {
    while (this.controlFlowStack.length > 0) {
      const top = this.controlFlowStack[this.controlFlowStack.length - 1];
      if (this.outstandingBranchCounts[top.id] !== 0 &&
          currentBlock !== top) {
        break;
      }
      this.controlFlowStack.pop();
      const a = new InstructionAssembler();
      if (currentBlock === top) {
        assert.ok(currentBlock.isLoopHeader);
        a.loop();
      } else {
        a.block();
      }
      this.sequence.add(a);
    }
  }

  private depthOfBlock(bb : IR.BasicBlock) : number {
    const pos = this.controlFlowStack.indexOf(bb);
    assert.ok(pos >= 0);
    return this.controlFlowStack.length - pos - 1;
  }
}

export function generateCode(
    shared : SharedFunctionInfo,
    graph : IR.Graph,
    memory : WebAssembly.Memory,
    vmFlags : IVMFlags) : (f : number) => number  {
  const sequence = new ReversedInstructionSequence();

  const controlFlowBuilder = new ControlFlowBuilder(sequence);

  const reverseBlockOrder = computeReverseBlockOrder(graph.entry);
  for (const bb of reverseBlockOrder) {
    // Emit code for the block end, such as branches or phi moves.
    const last = controlFlowBuilder.emitBlockEnd(bb);
    // Generate code for the normal (non-branch, non-phi) nodes.
    if (!generateCodeForNodes(bb.nodes, last, sequence)) return null;
    // Emit code for block start, e.g., structure control flow block/loop
    // start or end.
    controlFlowBuilder.emitBlockStart(bb);
  }
  assert.ok(controlFlowBuilder.finished());

  {
    // Emit prologue.
    const a = new InstructionAssembler();
    // Multiply the frame pointer by 8.
    a.getLocal(0);
    a.i32Constant(kStackSlotLog2Size);
    a.i32Shl();
    a.setLocal(0);
    sequence.add(a);
  }

  return createWebassemblyFunction(shared, sequence, memory, vmFlags);
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
      // Ignore phis, they are handled separately at block boundary.
      break;

    case IR.Opcode.kGoto:
    case IR.Opcode.kBranch:
      throw new Error(
        `Codegen: Unsupported ${node.id}:${IR.Opcode[node.opcode]}`);

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

    case IR.Opcode.kJSSub: {
      const b = node as IR.BinopNode;
      emitGetNode(b.inputs[0]);
      emitGetNode(b.inputs[1]);
      a.f64Sub();
      emitSetNode(b);
      break;
    }

    case IR.Opcode.kJSAdd: {
      const b = node as IR.BinopNode;
      emitGetNode(b.inputs[0]);
      emitGetNode(b.inputs[1]);
      a.f64Add();
      emitSetNode(b);
      break;
    }

    case IR.Opcode.kJSTestEqual: {
      const b = node as IR.BinopNode;
      emitGetNode(b.inputs[0]);
      emitGetNode(b.inputs[1]);
      a.f64Eq();
      a.f64ConvertI32U();
      emitSetNode(b);
      break;
    }

    case IR.Opcode.kJSTestLessThan: {
      const b = node as IR.BinopNode;
      emitGetNode(b.inputs[0]);
      emitGetNode(b.inputs[1]);
      a.f64Lt();
      a.f64ConvertI32U();
      emitSetNode(b);
      break;
    }

    case IR.Opcode.kJSTestLessThanOrEqual: {
      const b = node as IR.BinopNode;
      emitGetNode(b.inputs[0]);
      emitGetNode(b.inputs[1]);
      a.f64Le();
      a.f64ConvertI32U();
      emitSetNode(b);
      break;
    }

    case IR.Opcode.kReturn:
      emitGetNode(node.inputs[0]);
      a.ret();
      break;

    default:
      throw new Error(
        `Codegen: Unsupported ${node.id}:${IR.Opcode[node.opcode]}`);
  }
  sequence.add(a);
  return true;
}

function generateCodeForNodes(
    nodes : IR.Node[],
    from : number,
    sequence : ReversedInstructionSequence) : boolean {
  for (let i = from; i >= 0; i-- ) {
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
    assert.ok(header.isLoopHeader);
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
    const leftOrder = getOrderIndexStack(left);
    const rightOrder = getOrderIndexStack(right);
    const end = Math.min(leftOrder.length, rightOrder.length);
    for (let i = 0; i < end; i++) {
      if (leftOrder[i] > rightOrder[i]) return 1;
      if (leftOrder[i] < rightOrder[i]) return -1;
    }
    if (leftOrder.length < rightOrder.length) return 1;
    if (leftOrder.length > rightOrder.length) return -1;
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
  const length = order.length;
  order.forEach((v, i) => { v.orderIndex = length - i - 1; });

  return order;
}
