import * as assert from "assert";
import { Opcode } from "./bytecode";
import * as Bytecode from "./bytecode";
import * as JIT from "./compiler/jit-compiler";
import { SharedFunctionInfo } from "./function";
import { IVMFlags } from "./vm-config";

export function execute(stack : Float64Array,
                        memory : WebAssembly.Memory,
                        frame_ptr : number,
                        shared : SharedFunctionInfo,
                        vm_flags : IVMFlags) : number {
  if (shared.bytecode.profile_counter > JIT.kCompileTickCount) {
    // Optimize the code, and call the optimized code.
    shared.bytecode.profile_counter = 0;
    if (shared.isOptimizable() && JIT.compile(shared, memory, vm_flags)) {
      return shared.code(frame_ptr);
    }
  }

  let pc = 0;
  const bytecode_array = shared.bytecode;
  const bytecodes = bytecode_array.bytecodes;
  const constants = bytecode_array.constants;
  stack[frame_ptr + 1] = 0;  // Reserved for function.
  for (let i = Bytecode.fixedSlotCount;
       i < bytecode_array.register_count; i++) {
    stack[frame_ptr + i] = 0;
  }

  let stack_ptr = frame_ptr + bytecode_array.register_count;

  function setLocal(i : number, value : number) {
    assert.ok(i < bytecode_array.register_count);
    assert.ok(-i - 1 < shared.parameter_count);
    stack[frame_ptr + i] = value;
  }

  function getLocal(i : number) : number {
    assert.ok(i < bytecode_array.register_count);
    assert.ok(-i - 1 < shared.parameter_count);
    return stack[frame_ptr + i] as number;
  }

  function pushStack(value : number) {
    stack[stack_ptr++] = value;
  }

  function popStack() {
    return stack[--stack_ptr] as number;

  }
  function getStackTop() {
    return stack[stack_ptr - 1] as number;
  }

  function drop(n : number) {
    stack_ptr -= n;
  }

  function jumpTo(new_pc : number) {
    bytecode_array.profile_counter += pc - new_pc;
    pc = new_pc;
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
        const args_count = bytecodes[pc++];

        // Store the frame point on the stack.
        stack[stack_ptr] = frame_ptr;
        // Call the function, passing its frame pointer to it.
        const result = callee.code(stack_ptr);
        // Remove the frame arguments from the stack.
        drop(args_count);
        // Push the return value on the stack.
        pushStack(result);
        break;
      }
      case Opcode.Return: {
        bytecode_array.profile_counter += pc;
        return popStack();
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (pc - 1));
    }
  }
}
