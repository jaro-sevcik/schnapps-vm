import * as assert from "assert";
import { Opcode, printBytecode } from "./bytecode";
import { BytecodeArray,
         IForeignFunction,
         SharedFunctionInfo } from "./function";

interface IStackEntry {
  arguments : number[];
  registers : number[];
  pc : number;
  bytecodes : number[];
  constants : SharedFunctionInfo[];
  result_reg : number;
}

export function execute(fun : SharedFunctionInfo,
                        args : number[]) {
  let pc = 0;
  let bytecode_array = fun.bytecode_or_foreign as BytecodeArray;
  let registers : number[] = new Array(bytecode_array.register_count);
  let bytecodes = bytecode_array.bytecodes;
  let constants = bytecode_array.constants;
  const stack : IStackEntry[] = [];

  function setRegister(i : number, value : number) {
    assert.ok(i < registers.length);
    registers[i] = value;
  }

  function getRegister(i : number) : number {
    assert.ok(i < registers.length);
    return registers[i];
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
          bytecode_array = callee.bytecode_or_foreign as BytecodeArray;
          stack.push({
            arguments : args,
            registers,
            pc,
            bytecodes,
            constants,
            result_reg : result,
          });
          args = [];
          for (let i = 0; i < args_count; i++) {
            args.push(getRegister(args_start + i));
          }
          registers = new Array(bytecode_array.register_count);
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
        args = top.arguments;
        registers = top.registers;
        bytecodes = top.bytecodes;
        constants = top.constants;
        pc = top.pc;
        registers[top.result_reg] = value;
        break;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (pc - 1));
    }
  }
}
