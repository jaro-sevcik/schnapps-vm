import { buildGraph } from "src/compiler/graph-builder";
import * as IR from "src/compiler/ir-graph";
import { SharedFunctionInfo } from "src/function";
import { IVMFlags } from "src/vm-config";
import * as Wabt from "wabt";
import * as WasmJit from "wasm-jit";

export const kCompileTickCount : number = 1000;
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

function generateCode(
    shared : SharedFunctionInfo,
    graph : IR.Graph,
    memory : WebAssembly.Memory,
    vm_flags : IVMFlags) : (f : number) => number  {
  const visited = new Set<IR.BasicBlock>();
  const sequence = new ReversedInstructionSequence();
  function generateCodeForBlock(bb : IR.BasicBlock) : boolean {
    for (const s of bb.successors) {
      if (!visited.has(s)) {
        visited.add(s);
        if (!generateCodeForBlock(s)) return false;
      }
    }
    return generateCodeForNodes(bb.nodes, sequence);
  }
  if (!generateCodeForBlock(graph.entry)) return null;

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

export function tryCompile(
      shared : SharedFunctionInfo,
      memory : WebAssembly.Memory,
      vm_flags : IVMFlags) : (f : number) => number {
    // Build graph.
    const graph = buildGraph(shared);
    if (!graph) return null;

    if (vm_flags.printGraph) {
      console.log(`>>> Graph for "${shared.name}".`);
      graph.print();
    }

    // Generate code.
    const code = generateCode(shared, graph, memory, vm_flags);
    if (!code) {
      return null;
    }
    return code;
}


export function compile(shared : SharedFunctionInfo,
                        memory : WebAssembly.Memory,
                        trace_flags : IVMFlags) : boolean {
  const code = tryCompile(shared, memory, trace_flags);
  if (code) {
    shared.code = code;
    return true;
  } else {
    shared.markCannotOptimize();
  }
  return false;
}
