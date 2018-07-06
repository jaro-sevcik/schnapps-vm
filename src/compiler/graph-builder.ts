import * as BC from "./../bytecode";
import * as IR from "./../compiler/ir-graph";
import { SharedFunctionInfo } from "./../function";

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
            case BC.Opcode.LoadLocal: {
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
