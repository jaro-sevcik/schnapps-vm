import * as assert from "assert";
import { Opcode } from "./bytecode";
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
  let bytecode_array = fun.bytecode_or_foreign as BytecodeArray;
  let values : number[] =
      new Array(fun.parameter_count +  bytecode_array.register_count);
  let bytecodes = bytecode_array.bytecodes;
  let constants = bytecode_array.constants;
  const stack : IStackEntry[] = [];

  function setRegister(i : number, value : number) {
    assert.ok(i < bytecode_array.register_count);
    i += values.length - bytecode_array.register_count;
    assert.ok(i >= 0);
    values[i] = value;
  }

  function getRegister(i : number) : number {
    assert.ok(i < bytecode_array.register_count);
    i += values.length - bytecode_array.register_count;
    assert.ok(i >= 0);
    return values[i];
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
        pc = target;
        break;
      }
      case Opcode.JumpIfTrue: {
        const condition = bytecodes[pc++];
        const target = bytecodes[pc++];
        if (getRegister(condition) !== 0) {
          pc = target;
        }
        break;
      }
      case Opcode.JumpIfFalse: {
        const condition = bytecodes[pc++];
        const target = bytecodes[pc++];
        if (getRegister(condition) === 0) {
          pc = target;
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
          stack.push({
            values,
            pc,
            bytecode_array,
            result_reg : result,
          });
          assert.strictEqual(args_count, callee.parameter_count);
          // Copy out the arguments to the new frame.
          const new_values = [];
          for (let i = args_count - 1; i >= 0; --i) {
            new_values.push(getRegister(args_start + i));
          }
          // Initialize registers in the new frame.
          bytecode_array = callee.bytecode_or_foreign as BytecodeArray;
          for (let i = 0; i < bytecode_array.register_count; i++) {
            new_values.push(0);
          }
          // Set the new frame as current frame.
          values = new_values;
          bytecodes = bytecode_array.bytecodes;
          constants = bytecode_array.constants;
          pc = 0;
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
        const top = stack.pop();
        values = top.values;
        bytecode_array = top.bytecode_array;
        bytecodes = bytecode_array.bytecodes;
        constants = bytecode_array.constants;
        pc = top.pc;
        setRegister(top.result_reg, value);
        break;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (pc - 1));
    }
  }
}
