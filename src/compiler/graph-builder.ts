import * as assert from "assert";
import * as BC from "./../bytecode";
import * as IR from "./../compiler/ir-graph";
import { SharedFunctionInfo } from "./../function";

function InitialEnvironmentValues(start_block : IR.GraphStartBlock,
                                  parameter_count : number,
                                  local_count : number) : IR.Node[] {
    const values : IR.Node[] = [];
    // Initialize parameters.
    for (let i = 0; i < parameter_count; i++) {
      values.push(start_block.getParameter(i));
    }

    // Initialize locals.
    for (let i = 0; i < local_count; i++) {
      values.push(start_block.getUndefinedConstant());
    }
    return values;
}

class Environment {
  private parameter_count : number;
  private local_count : number;
  private block : IR.BasicBlock;
  private values : IR.Node[] = [];

  constructor(block : IR.BasicBlock,
              parameter_count : number,
              local_count : number,
              values : IR.Node[]) {
    this.block = block;
    this.parameter_count = parameter_count;
    this.local_count = local_count;

    // Initialize parameters.
    this.values = values.slice();
  }

  copy() : Environment {
    return new Environment(this.block,
                           this.parameter_count,
                           this.local_count,
                           this.values);
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

  merge(other : Environment) {
    assert.strictEqual(this.values.length, other.values.length);
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i] !== other.values[i]) {
        // TODO
      }
    }
  }
}

function newEnvironment(start_block : IR.GraphStartBlock,
                        first_block : IR.BasicBlock,
                        shared : SharedFunctionInfo) : Environment {
  const initial_values = InitialEnvironmentValues(
      start_block,
      shared.parameter_count,
      shared.bytecode.register_count);
  const env = new Environment(start_block, shared.parameter_count,
                              shared.bytecode.register_count, initial_values);
  env.setBlock(first_block);
  return env;
}

const bytecodeOpToJSOpcode = new Map<BC.Opcode, IR.Opcode>([
  [ BC.Opcode.Add, IR.Opcode.kJSAdd],
  [ BC.Opcode.Sub, IR.Opcode.kJSSub ],
  [ BC.Opcode.Mul, IR.Opcode.kJSMul ],
  [ BC.Opcode.Div, IR.Opcode.kJSDiv ],
  [ BC.Opcode.Sub, IR.Opcode.kJSSub ],
  [ BC.Opcode.TestEqual, IR.Opcode.kJSTestEqual ],
  [ BC.Opcode.TestLessThan, IR.Opcode.kJSTestLessThan ],
  [ BC.Opcode.TestLessThanOrEqual, IR.Opcode.kJSTestLessThanOrEqual ],
]);

export function buildGraph(shared : SharedFunctionInfo) : IR.Graph | undefined {
  const bytecode_array = shared.bytecode;
  const bytecodes = bytecode_array.bytecodes;
  const constants = bytecode_array.constants;
  const environments_to_merge = new Map<number, Environment>();

  function mergeTo(target : number, envToMerge : Environment) {
    let target_environment;
    if (!environments_to_merge.has(target)) {
      const block = new IR.BasicBlock(graph);
      env.getBlock().addSuccessor(block);
      target_environment = env.copy();
      target_environment.setBlock(block);
      environments_to_merge.set(target, target_environment);
    } else {
      target_environment = environments_to_merge.get(target);
      env.getBlock().addSuccessor(target_environment.getBlock());
      target_environment.merge(envToMerge);
    }
  }

  const graph = new IR.Graph(shared.parameter_count);
  let env = newEnvironment(graph.entry, graph.exit, shared);

  let pc = 0;
  while (pc < bytecode_array.bytecodes.length) {
    if (environments_to_merge.has(pc)) {
      // If there are some jumps/branches merging here, we need to
      // merge them with the current environment.
      if (env) {
        mergeTo(pc, env);
      }
      env = environments_to_merge.get(pc);
    }

    const opcode = bytecodes[pc++];
    switch (opcode) {
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

      // Binops.
      case BC.Opcode.Add:
      case BC.Opcode.Sub:
      case BC.Opcode.Mul:
      case BC.Opcode.Div:
      case BC.Opcode.Sub:
      case BC.Opcode.TestEqual:
      case BC.Opcode.TestLessThan:
      case BC.Opcode.TestLessThanOrEqual: {
        const right = env.popStack();
        const left = env.popStack();
        const op = bytecodeOpToJSOpcode.get(opcode);
        const value = new IR.BinopNode(op, left, right);
        env.getBlock().appendNode(value);
        env.pushStack(value);
        break;
      }

      case BC.Opcode.JumpIfFalse: {
        const target = bytecodes[pc++];
        const condition = env.popStack();
        const value = new IR.BranchNode(condition);
        env.getBlock().appendNode(value);

        // Create a copy of the environment for branch target.
        mergeTo(target, env.copy());

        // Create a new basic block for fall-through.
        const fallthrough_block = new IR.BasicBlock(graph);
        env.getBlock().addSuccessor(fallthrough_block);
        env.setBlock(fallthrough_block);
        break;
      }

      // Jumps, branches.
      case BC.Opcode.Jump: {
        const target = bytecodes[pc++];
        mergeTo(target, env);
        // Mark the environment as unreachable.
        env = null;
        break;
      }

      case BC.Opcode.JumpLoop:
      case BC.Opcode.JumpIfTrue:
      case BC.Opcode.Call:
        throw new Error(`Not implemented yet ${BC.Opcode[opcode]}`);

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
