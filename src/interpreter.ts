import * as assert from "assert";
import { Opcode } from "./bytecode";
import * as Bytecode from "./bytecode";
import { SharedFunctionInfo } from "./function";
import * as JIT from "./jit-compiler";
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
    stack[frame_ptr - 1 + i] = 0;
  }

  function setRegister(i : number, value : number) {
    assert.ok(i < bytecode_array.register_count);
    assert.ok(-i - 1 < shared.parameter_count);
    stack[frame_ptr + i] = value;
  }

  function getRegister(i : number) : number {
    assert.ok(i < bytecode_array.register_count);
    assert.ok(-i - 1 < shared.parameter_count);
    return stack[frame_ptr + i] as number;
  }

  function jumpTo(new_pc : number) {
    bytecode_array.profile_counter += pc - new_pc;
    pc = new_pc;
  }

  while (pc < bytecodes.length) {
    const bytecode = bytecodes[pc++];
    switch (bytecode) {
      case Opcode.LoadInteger: {
        const register = bytecodes[pc++];
        const value = bytecodes[pc++];
        setRegister(register, value);
        break;
      }
      case Opcode.Load: {
        const destination = bytecodes[pc++];
        const source = bytecodes[pc++];
        setRegister(destination, getRegister(source));
        break;
      }
      case Opcode.Add: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        setRegister(result, getRegister(left) + getRegister(right));
        break;
      }
      case Opcode.Sub: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        setRegister(result, getRegister(left) - getRegister(right));
        break;
      }
      case Opcode.Mul: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        setRegister(result, getRegister(left) * getRegister(right));
        break;
      }
      case Opcode.Div: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        setRegister(result, getRegister(left) / getRegister(right));
        break;
      }
      case Opcode.TestEqual: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        // TODO Fix to return boolean.
        setRegister(result, +(getRegister(left) === getRegister(right)));
        break;
      }
      case Opcode.TestLessThan: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        // TODO Fix to return boolean.
        setRegister(result, +(getRegister(left) < getRegister(right)));
        break;
      }
      case Opcode.TestLessThanOrEqual: {
        const result = bytecodes[pc++];
        const left = bytecodes[pc++];
        const right = bytecodes[pc++];
        // TODO Fix to return boolean.
        setRegister(result, +(getRegister(left) <= getRegister(right)));
        break;
      }
      case Opcode.Jump:
      case Opcode.JumpLoop: {
        const target = bytecodes[pc++];
        jumpTo(target);
        break;
      }
      case Opcode.JumpIfTrue: {
        const condition = bytecodes[pc++];
        const target = bytecodes[pc++];
        if (getRegister(condition) !== 0) {
          jumpTo(target);
        }
        break;
      }
      case Opcode.JumpIfFalse: {
        const condition = bytecodes[pc++];
        const target = bytecodes[pc++];
        if (getRegister(condition) === 0) {
          jumpTo(target);
        }
        break;
      }
      case Opcode.Call: {
        const result_reg = bytecodes[pc++];
        const callee = constants[bytecodes[pc++]];
        const args_start = bytecodes[pc++];
        const args_count = bytecodes[pc++];
        // Push current frame.
        let stack_top = frame_ptr + bytecode_array.register_count;
        assert.strictEqual(args_count, callee.parameter_count);
        // Push the arguments to the new frame.
        for (let i = args_count - 1; i >= 0; --i) {
          stack[stack_top++] = getRegister(args_start + i);
        }
        stack[stack_top] = frame_ptr;  // Frame pointer.
        const result = callee.code(stack_top);
        setRegister(result_reg, result);
        break;
      }
      case Opcode.Return: {
        const value = getRegister(bytecodes[pc++]);
        bytecode_array.profile_counter += pc;
        return value;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (pc - 1));
    }
  }
}
