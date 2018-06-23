import * as Wabt from "wabt";
import * as WasmJit from "wasm-jit";
import * as BC from "./bytecode";
import { SharedFunctionInfo } from "./function";
import * as IR from "./ir-graph";

export const compileTickCount : number = 1000;

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

  add(s : InstructionAssembler) {
      this.code.push(...s.code.reverse());
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
  builder.addFunction("load", WasmJit.kSig_d_i)
      .addBody(code)  // --
      .exportAs("exported");
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
  function generateCodeForBlock(bb : IR.BasicBlock) {
    for (const s of bb.successors) {
      if (!visited.has(s)) {
        visited.add(s);
        if (!generateCodeForBlock(s)) return false;
      }
    }
    return generateCodeForNodes(bb.nodes, sequence);
  }
  if (!generateCodeForBlock(graph.entry)) return null;

  return createWebassemblyFunction(shared, sequence, memory);
}

function generateCodeForNode(
    node : IR.Node,
    sequence : ReversedInstructionSequence) : boolean {
  const a = new InstructionAssembler();
  const kFirstNodeIndex = 1;

  function emitGetNode(n : IR.Node) {
    a.getLocal(n.id + kFirstNodeIndex);
  }

  function emitSetNode(n : IR.Node) {
    a.setLocal(n.id + kFirstNodeIndex);
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
      f64LoadStack(-p.index - 1);
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

function generateCodeForNodes(nodes : IR.Node[],
                              sequence : ReversedInstructionSequence) {
  for (let i = nodes.length - 1; i >= 0; i-- ) {
    generateCodeForNode(nodes[i], sequence);
  }
}

export function compile(shared : SharedFunctionInfo,
                        memory : WebAssembly.Memory) : boolean {
    // Build graph.
    const graph = buildGraph(shared);
    if (!graph) return false;

    graph.print();

    // Generate code.
    const code = generateCode(shared, graph, memory);
    if (!code) return false;
    shared.code = code;

    process.exit(0);
    return false;
}
