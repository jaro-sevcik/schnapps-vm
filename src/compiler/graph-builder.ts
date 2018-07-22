import * as assert from "assert";
import * as BC from "./../bytecode";
import * as IR from "./../compiler/ir-graph";
import { SharedFunctionInfo } from "./../function";

function InitialEnvironmentValues(startBlock : IR.GraphStartBlock,
                                  parameterCount : number,
                                  localCount : number) : IR.Node[] {
    const values : IR.Node[] = [];
    // Initialize parameters.
    for (let i = 0; i < parameterCount; i++) {
      values.push(startBlock.getParameter(i));
    }

    // Initialize locals.
    for (let i = 0; i < localCount; i++) {
      values.push(startBlock.getUndefinedConstant());
    }

    return values;
}

class Environment {
  private parameterCount : number;
  private localCount : number;
  // Current basic block.
  private block : IR.BasicBlock;
  // Values in the environment. The values list is of the form
  // [par0, ... , parn, local0, ..., local m, stack_bottom, ..., stack_top]
  // where n is parameter_count and m is local_count.
  private values : IR.Node[] = [];

  constructor(block : IR.BasicBlock,
              parameterCount : number,
              localCount : number,
              values : IR.Node[]) {
    this.block = block;
    this.parameterCount = parameterCount;
    this.localCount = localCount;

    // Initialize parameters.
    this.values = values.slice();
  }

  copy() : Environment {
    return new Environment(this.block,
                           this.parameterCount,
                           this.localCount,
                           this.values);
  }

  getBlock() : IR.BasicBlock {
    return this.block;
  }

  setBlock(block : IR.BasicBlock) {
    this.block = block;
  }

  localIndexToValueIndex(index : number) {
    return index + this.parameterCount;
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
      let value = this.values[i];

      // If we are merging the same value and we are not merging to a loop
      // header, then there is nothing to do.
      if (value === other.values[i] && !this.getBlock().isLoopHeader) {
        continue;
      }

      // If we have not created a phi for this value, do so now.
      if (value.opcode !== IR.Opcode.kPhi ||
          !this.getBlock().containsPhi(value)) {
        value = new IR.PhiNode(value);
        this.getBlock().appendNode(value);

        this.values[i] = value;

      }

      // Add the other value to the phi.
      (value as IR.PhiNode).appendInput(other.values[i]);
    }
  }

  createPhisForLoop() {
    for (let i = 0; i < this.values.length; i++) {
      const value = new IR.PhiNode(this.values[i]);
      this.getBlock().appendNode(value);
      this.values[i] = value;
    }
  }

  stackHeight() : number {
    return this.values.length - this.parameterCount - this.localCount;
  }
}

function newEnvironment(startBlock : IR.GraphStartBlock,
                        firstBlock : IR.BasicBlock,
                        shared : SharedFunctionInfo) : Environment {
  const initialValues = InitialEnvironmentValues(
      startBlock,
      shared.parameterCount,
      shared.bytecode.registerCount);
  const env = new Environment(startBlock, shared.parameterCount,
                              shared.bytecode.registerCount, initialValues);
  env.setBlock(firstBlock);
  return env;
}

// This map is used for binary operations, where the graph is build
// uniformly for all binary operations; the only thing that differs
// for each bytecode is the IR opcode. The map below give sthis mapping.
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
  const bytecodeArray = shared.bytecode;
  const bytecodes = bytecodeArray.bytecodes;
  const constants = bytecodeArray.constants;
  const environmentsToMerge = new Map<number, Environment>();

  function mergeTo(target : number, envToMerge : Environment) {
    let targetEnvironment;
    if (!environmentsToMerge.has(target)) {
      const block = new IR.BasicBlock(graph);
      env.getBlock().addSuccessor(block);
      targetEnvironment = env.copy();
      targetEnvironment.setBlock(block);
      environmentsToMerge.set(target, targetEnvironment);
    } else {
      targetEnvironment = environmentsToMerge.get(target);
      env.getBlock().addSuccessor(targetEnvironment.getBlock());
      targetEnvironment.merge(envToMerge);
    }
  }

  const graph = new IR.Graph(shared.parameterCount);
  let env = newEnvironment(graph.entry, graph.exit, shared);

  let pc = 0;
  while (pc < bytecodeArray.bytecodes.length) {
    const instructionPc = pc;
    if (environmentsToMerge.has(pc)) {
      // If there are some jumps/branches merging here, we need to
      // merge them with the current environment.
      if (env) {
        mergeTo(pc, env);
      }
      env = environmentsToMerge.get(pc);
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

      case BC.Opcode.StoreLocal: {
        const local = bytecodes[pc++];
        env.setLocal(local, env.popStack());
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

      // Jumps, branches.
      case BC.Opcode.JumpIfFalse: {
        const target = bytecodes[pc++];
        const condition = env.popStack();
        const value = new IR.BranchNode(condition);
        env.getBlock().appendNode(value);

        // Create a copy of the environment for branch target.
        mergeTo(target, env.copy());

        // Create a new basic block for fall-through.
        const fallthroughBlock = new IR.BasicBlock(graph);
        env.getBlock().addSuccessor(fallthroughBlock);
        env.setBlock(fallthroughBlock);
        break;
      }

      case BC.Opcode.Jump:
      case BC.Opcode.JumpLoop: {
        const target = bytecodes[pc++];
        mergeTo(target, env);
        env = null;
        break;
      }

      case BC.Opcode.LoopHeader: {
        // Create an environment for the loop header, together with
        // a basic block and phis.

        // Create the loop header basic block and wire in the loop
        // predecessor edge.
        const loopHeader = new IR.BasicBlock(graph, true);
        env.getBlock().addSuccessor(loopHeader);
        // Create an environment for merging back edges.
        const loopHeaderEnv = env.copy();
        loopHeaderEnv.setBlock(loopHeader);
        loopHeaderEnv.createPhisForLoop();
        // Register the header environment for merging.
        environmentsToMerge.set(instructionPc, loopHeaderEnv);
        // Create a copy of the environment for loop body.
        env = loopHeaderEnv.copy();
        break;
      }

      case BC.Opcode.Return: {
        const value = env.popStack();
        const returnNode = new IR.ReturnNode(value);
        env.getBlock().appendNode(returnNode);
        // TODO set the environment to be unreachable.
        break;
      }

      case BC.Opcode.JumpLoop:
      case BC.Opcode.JumpIfTrue:
      case BC.Opcode.Call:

      default:
        throw new Error(`Not implemented yet ${BC.Opcode[opcode]}`);
    }
  }
  return graph;
}
