import * as assert from "assert";
import { Opcode } from "./bytecode";
import * as Bytecode from "./bytecode";
import { BytecodeArray,
         IForeignFunction,
         SharedFunctionInfo } from "./function";

interface IStackEntry {
  values : number[];
  pc : number;
  bytecode_array : BytecodeArray;
  result_reg : number;
}

export function execute(fun : SharedFunctionInfo,
                        args : number[]) {
  let pc = 0;
  let shared = fun;
  let bytecode_array = shared.bytecode_or_foreign as BytecodeArray;
  let bytecodes = bytecode_array.bytecodes;
  let constants = bytecode_array.constants;
  const stack : Array<number | SharedFunctionInfo> = [];
  let frame_ptr : number = 0;
  stack[0] = -1;  // Frame pointer.
  stack[1] = shared;
  for (let i = Bytecode.fixedSlotCount;
       i < bytecode_array.register_count; i++) {
    stack[i] = 0;
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
        const result = bytecodes[pc++];
        const callee = constants[bytecodes[pc++]];
        const args_start = bytecodes[pc++];
        const args_count = bytecodes[pc++];
        if (callee.bytecode_or_foreign instanceof BytecodeArray) {
          // Push current frame.
          let stack_top = frame_ptr + bytecode_array.register_count;
          stack[stack_top++] = result;
          stack[stack_top++] = pc;
          assert.strictEqual(args_count, callee.parameter_count);
          // Push the arguments to the new frame.
          for (let i = args_count - 1; i >= 0; --i) {
            stack[stack_top++] = getRegister(args_start + i);
          }
          // Push the frame pointer and update the current frame pointer.
          stack[stack_top] = frame_ptr;
          frame_ptr = stack_top;
          stack_top++;
          // Push the function.
          // TODO Fix once we have tagging.
          stack[stack_top++] = shared;
          // Set the exec state to the new function.
          shared = callee;
          bytecode_array = callee.bytecode_or_foreign as BytecodeArray;
          bytecodes = bytecode_array.bytecodes;
          constants = bytecode_array.constants;
          pc = 0;
          // Initialize registers in the new frame.
          // TODO This is not really necessary, perhaps remove?.
          for (let i = 0; i < bytecode_array.register_count; i++) {
            stack[stack_top++] = 0;
          }
        } else {
          const foreign = callee.bytecode_or_foreign as IForeignFunction;
          const callee_args = [];
          for (let i = 0; i < args_count; i++) {
            callee_args.push(getRegister(args_start + i));
          }
          setRegister(result, foreign.fn.apply(undefined, callee_args));
        }
        break;
      }
      case Opcode.Return: {
        const value = getRegister(bytecodes[pc++]);
        let stack_top = frame_ptr - shared.parameter_count;
        const caller_frame = stack[frame_ptr] as number;
        const caller_pc = stack[--stack_top] as number;
        const result_reg = stack[--stack_top] as number;
        shared = stack[caller_frame + 1] as SharedFunctionInfo;
        bytecode_array = shared.bytecode_or_foreign as BytecodeArray;
        bytecodes = bytecode_array.bytecodes;
        constants = bytecode_array.constants;
        pc = caller_pc;
        frame_ptr = caller_frame;
        bytecode_array.profile_counter += pc;
        setRegister(result_reg, value);
        break;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (pc - 1));
    }
  }
}
