import * as BC from "./../bytecode";
import * as IR from "./../compiler/ir-graph";
import { SharedFunctionInfo } from "./../function";

class Environment {
  private parameter_count : number;
  private local_count : number;
  private block : IR.BasicBlock;
  private values : IR.Node[] = [];

  constructor(block : IR.GraphStartBlock,
              parameter_count : number,
              local_count : number) {
    this.block = block;
    this.parameter_count = parameter_count;
    this.local_count = local_count;

    // Initialize parameters.
    for (let i = 0; i < this.parameter_count; i++) {
        this.values.push(block.getParameter(i));
    }

    // Initialize locals.
    for (let i = 0; i < this.local_count; i++) {
        this.values.push(block.getUndefinedConstant());
    }
  }

  getBlock() : IR.BasicBlock {
    return this.block;
  }

  setBlock(block : IR.BasicBlock) {
    this.block = block;
  }

  localIndexToValueIndex(index : number) {
    return index + this.parameter_count;
  }

  getLocal(index : number) : IR.Node {
    return this.values[this.localIndexToValueIndex(index)];
  }

  setLocal(index : number, value : IR.Node) {
    this.values[this.localIndexToValueIndex(index)] = value;
  }

  getStackTop() : IR.Node {
    return this.values[this.values.length - 1];
  }

  popStack() : IR.Node {
    return this.values.pop();
  }

  pushStack(value : IR.Node) {
    this.values.push(value);
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

export function buildGraph(shared : SharedFunctionInfo) : IR.Graph | undefined {
    const bytecode_array = shared.bytecode;
    const bytecodes = bytecode_array.bytecodes;
    const constants = bytecode_array.constants;
    const environments_to_merge = new Map<number, Environment>();

    const graph = new IR.Graph(shared.parameter_count);
    const env = newEnvironment(graph.entry, graph.exit, shared);

    let pc = 0;
    while (pc < bytecode_array.bytecodes.length) {
        switch (bytecodes[pc++]) {
            case BC.Opcode.Dup:
                env.pushStack(env.getStackTop());
                break;

            case BC.Opcode.Drop:
                env.popStack();
                break;

            case BC.Opcode.LoadLocal: {
                const local = bytecodes[pc++];
                env.pushStack(env.getLocal(local));
                break;
            }

            case BC.Opcode.LoadInteger: {
                const value = bytecodes[pc++];
                const constant = new IR.NumberConstantNode(value);
                env.getBlock().appendNode(constant);
                env.pushStack(constant);
                break;
            }

            case BC.Opcode.Add: {
                const right = env.popStack();
                const left = env.popStack();
                const value = new IR.BinopNode(IR.Opcode.kJSAdd,
                                               left,
                                               right);
                env.getBlock().appendNode(value);
                env.pushStack(value);
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
                const value = env.popStack();
                const return_node = new IR.ReturnNode(value);
                env.getBlock().appendNode(return_node);
                // TODO set the environment to be unreachable.
                break;
            }
        }
    }

    return graph;
}
