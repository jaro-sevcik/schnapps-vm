import * as assert from "assert";
import { Opcode } from "./bytecode";
import * as Bytecode from "./bytecode";
import * as JIT from "./compiler/jit-compiler";
import { SharedFunctionInfo } from "./function";
import * as Heap from "./heap/heap";
import { IVMFlags } from "./vm-config";

export function execute(stack : Float64Array,
                        wasmMemory : WebAssembly.Memory,
                        framePtr : number,
                        shared : SharedFunctionInfo,
                        vmFlags : IVMFlags) : number {

  const memory = new DataView(wasmMemory.buffer);

  if (shared.bytecode.profileCounter > JIT.kCompileTickCount) {
    // Optimize the code, and call the optimized code.
    shared.bytecode.profileCounter = 0;
    if (shared.isOptimizable() && JIT.compile(shared, wasmMemory, vmFlags)) {
      return shared.code(framePtr);
    }
  }

  let pc = 0;
  const bytecodeArray = shared.bytecode;
  const bytecodes = bytecodeArray.bytecodes;
  const constants = bytecodeArray.constants;
  // Reserved for function.
  memory.setFloat64(framePtr + Heap.kWordSize, 0, true);
  for (let i = Bytecode.fixedSlotCount;
       i < bytecodeArray.registerCount; i++) {
    memory.setFloat64(framePtr + i * Heap.kWordSize, 0, true);
  }

  let stackPtr = framePtr + bytecodeArray.registerCount * Heap.kWordSize;

  function setLocal(i : number, value : number) {
    assert.ok(i < bytecodeArray.registerCount);
    assert.ok(-i - 1 < shared.parameterCount);
    memory.setFloat64(framePtr + i * Heap.kWordSize, value, true);
  }

  function getLocal(i : number) : number {
    assert.ok(i < bytecodeArray.registerCount);
    assert.ok(-i - 1 < shared.parameterCount);
    return memory.getFloat64(framePtr + i * Heap.kWordSize, true);
  }

  function pushStack(value : number) {
    stack[stackPtr / 8] = value;
    stackPtr += Heap.kWordSize;
  }

  function popStack() {
    stackPtr -= Heap.kWordSize;
    return stack[stackPtr / 8] as number;
  }

  function getStackTop() {
    return stack[stackPtr / 8 - 1] as number;
  }

  function drop(n : number) {
    stackPtr -= n * Heap.kWordSize;
  }

  function jumpTo(newPc : number) {
    bytecodeArray.profileCounter += pc - newPc;
    pc = newPc;
  }

  while (pc < bytecodes.length) {
    const bytecode = bytecodes[pc++];
    switch (bytecode) {
      case Opcode.Drop: {
        popStack();
        break;
      }
      case Opcode.Dup: {
        pushStack(getStackTop());
        break;
      }
      case Opcode.LoadInteger: {
        const value = bytecodes[pc++];
        pushStack(value);
        break;
      }
      case Opcode.LoadLocal: {
        const local = bytecodes[pc++];
        const value = getLocal(local);
        pushStack(value);
        break;
      }
      case Opcode.StoreLocal: {
        const local = bytecodes[pc++];
        const value = popStack();
        setLocal(local, value);
        break;
      }
      case Opcode.Add: {
        const right = popStack();
        const left = popStack();
        pushStack(left + right);
        break;
      }
      case Opcode.Sub: {
        const right = popStack();
        const left = popStack();
        pushStack(left - right);
        break;
      }
      case Opcode.Mul: {
        const right = popStack();
        const left = popStack();
        pushStack(left * right);
        break;
      }
      case Opcode.Div: {
        const right = popStack();
        const left = popStack();
        pushStack(left / right);
        break;
      }
      case Opcode.TestEqual: {
        const right = popStack();
        const left = popStack();
        // TODO Fix to return boolean.
        pushStack(+(left === right));
        break;
      }
      case Opcode.TestLessThan: {
        const right = popStack();
        const left = popStack();
        // TODO Fix to return boolean.
        pushStack(+(left < right));
        break;
      }
      case Opcode.TestLessThanOrEqual: {
        const right = popStack();
        const left = popStack();
        // TODO Fix to return boolean.
        pushStack(+(left <= right));
        break;
      }
      case Opcode.Jump:
      case Opcode.JumpLoop: {
        const target = bytecodes[pc++];
        jumpTo(target);
        break;
      }
      case Opcode.LoopHeader:
        break;
      case Opcode.JumpIfTrue: {
        const target = bytecodes[pc++];
        if (popStack() !== 0) {
          jumpTo(target);
        }
        break;
      }
      case Opcode.JumpIfFalse: {
        const target = bytecodes[pc++];
        if (popStack() === 0) {
          jumpTo(target);
        }
        break;
      }
      case Opcode.Call: {
        // Read operands.
        const callee = constants[bytecodes[pc++]];
        const argsCount = bytecodes[pc++];

        // Store the frame point on the stack.
        stack[stackPtr / 8] = framePtr;
        // Call the function, passing its frame pointer to it.
        const result = callee.code(stackPtr);
        // Remove the frame arguments from the stack.
        drop(argsCount);
        // Push the return value on the stack.
        pushStack(result);
        break;
      }
      case Opcode.Return: {
        bytecodeArray.profileCounter += pc;
        return popStack();
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (pc - 1));
    }
  }
}
