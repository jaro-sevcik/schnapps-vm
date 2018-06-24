import * as Wabt from "wabt";
import * as WasmJit from "wasm-jit";
import * as BC from "./bytecode";
import { SharedFunctionInfo } from "./function";
import * as IR from "./ir-graph";

export const kCompileTickCount : number = 1000;
export const kStackSlotLog2Size : number = 3;

class Environment {
    private parameter_count : number;
    private register_count : number;
    private block : IR.BasicBlock;
    private values : IR.Node[] = [];

    constructor(block : IR.GraphStartBlock,
                parameter_count : number,
                register_count : number) {
        this.block = block;
        this.parameter_count = parameter_count;
        this.register_count = register_count;

        // Initialize parameters.
        for (let i = 0; i < this.parameter_count; i++) {
            this.values.push(block.getParameter(i));
        }

        // Initialize registers.
        for (let i = 0; i < this.register_count; i++) {
            this.values.push(block.getUndefinedConstant());
        }
    }

    getBlock() : IR.BasicBlock {
        return this.block;
    }

    setBlock(block : IR.BasicBlock) {
        this.block = block;
    }

    registerIndexToValueIndex(index : number) {
        return index + this.parameter_count;
    }

    getRegister(index : number) : IR.Node {
        return this.values[this.registerIndexToValueIndex(index)];
    }

    setRegister(index : number, value : IR.Node) {
        this.values[this.registerIndexToValueIndex(index)] = value;
    }
}

function newEnvironment(start_block : IR.GraphStartBlock,
                        first_block : IR.BasicBlock,
                        shared : SharedFunctionInfo) : Environment {
  const env = new Environment(start_block, shared.parameter_count,
                              shared.bytecode.register_count);
  env.setBlock(first_block);
  return env;
}

function buildGraph(shared : SharedFunctionInfo) : IR.Graph | undefined {
    const bytecode_array = shared.bytecode;
    const bytecodes = bytecode_array.bytecodes;
    const constants = bytecode_array.constants;
    const environments_to_merge = new Map<number, Environment>();

    const graph = new IR.Graph(shared.parameter_count);
    const env = newEnvironment(graph.entry, graph.exit, shared);

    let pc = 0;
    while (pc < bytecode_array.bytecodes.length) {
        switch (bytecodes[pc++]) {
            case BC.Opcode.Load: {
                const destination = bytecodes[pc++];
                const source = bytecodes[pc++];
                env.setRegister(destination, env.getRegister(source));
                break;
            }

            case BC.Opcode.LoadInteger: {
                const register = bytecodes[pc++];
                const value = bytecodes[pc++];
                const constant = new IR.NumberConstantNode(value);
                env.getBlock().appendNode(constant);
                env.setRegister(register, constant);
                break;
            }

            case BC.Opcode.Add: {
                const result = bytecodes[pc++];
                const left = bytecodes[pc++];
                const right = bytecodes[pc++];
                const value = new IR.BinopNode(IR.Opcode.kJSAdd,
                                                env.getRegister(left),
                                                env.getRegister(right));
                env.getBlock().appendNode(value);
                env.setRegister(result, value);
                break;
            }

            case BC.Opcode.Sub:
            case BC.Opcode.Mul:
            case BC.Opcode.Div:
            case BC.Opcode.Sub:
            case BC.Opcode.TestEqual:
            case BC.Opcode.TestLessThanOrEqual:
            case BC.Opcode.TestLessThan:
            // Binops.

            case BC.Opcode.Jump:

            case BC.Opcode.JumpLoop:

            case BC.Opcode.JumpIfTrue:
            case BC.Opcode.JumpIfFalse:

            case BC.Opcode.Call:
            throw new Error("Not implemented yet");

            case BC.Opcode.Return: {
                const value = env.getRegister(bytecodes[pc++]);
                const return_node = new IR.ReturnNode(value);
                env.getBlock().appendNode(return_node);
                // TODO set the environment to be unreachable.
                break;
            }
        }
    }

    return graph;
}

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
    mem : WebAssembly.Memory) {
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
  console.log(Wabt.readWasm(new Uint8Array(builder.toBuffer()), {}).toText({}));
  const i = builder.instantiate(
      { I : { imported_mem : mem }});
  return i.exports.exported;
}

function generateCode(
    shared : SharedFunctionInfo,
    graph : IR.Graph,
    memory : WebAssembly.Memory) : (f : number) => number  {
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

  return createWebassemblyFunction(shared, sequence, memory);
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

export function compile(shared : SharedFunctionInfo,
                        memory : WebAssembly.Memory) : boolean {
    // Build graph.
    const graph = buildGraph(shared);
    if (!graph) return false;

    graph.print();

    // Generate code.
    const code = generateCode(shared, graph, memory);
    if (!code) {
      console.log(`Code generation for "${shared.name}" failed.`);
      return false;
    }
    shared.code = code;
    return false;
}
