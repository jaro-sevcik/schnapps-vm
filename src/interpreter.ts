import { Opcode } from "./bytecode";
import { BytecodeArray,
         IForeignFunction,
         SharedFunctionInfo } from "./function";

interface IStackEntry {
  arguments : number[];
  registers : number[];
  offset : number;
  bytecodes : number[];
  constants : SharedFunctionInfo[];
  result_reg : number;
}

export function execute(fun : SharedFunctionInfo,
                        args : number[]) {
  let offset = 0;
  let registers : number[] = [];
  let bytecode_array = fun.bytecode_or_foreign as BytecodeArray;
  let bytecodes = bytecode_array.bytecodes;
  let constants = bytecode_array.constants;
  const stack : IStackEntry[] = [];

  while (offset < bytecodes.length) {
    const bytecode = bytecodes[offset++];
    switch (bytecode) {
      case Opcode.LoadInteger: {
        const register = bytecodes[offset++];
        const value = bytecodes[offset++];
        registers[register] = value;
        break;
      }
      case Opcode.Load: {
        const destination = bytecodes[offset++];
        const source = bytecodes[offset++];
        registers[destination] = registers[source];
        break;
      }
      case Opcode.Add: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        registers[result] = registers[left] + registers[right];
        break;
      }
      case Opcode.Sub: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        registers[result] = registers[left] - registers[right];
        break;
      }
      case Opcode.Mul: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        registers[result] = registers[left] * registers[right];
        break;
      }
      case Opcode.Div: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        registers[result] = registers[left] / registers[right];
        break;
      }
      case Opcode.TestEqual: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        // TODO Fix to return boolean.
        registers[result] = +(registers[left] === registers[right]);
        break;
      }
      case Opcode.TestLessThan: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        // TODO Fix to return boolean.
        registers[result] = +(registers[left] < registers[right]);
        break;
      }
      case Opcode.TestLessThanOrEqual: {
        const result = bytecodes[offset++];
        const left = bytecodes[offset++];
        const right = bytecodes[offset++];
        // TODO Fix to return boolean.
        registers[result] = +(registers[left] <= registers[right]);
        break;
      }
      case Opcode.Jump:
      case Opcode.JumpLoop: {
        const target = bytecodes[offset++];
        offset = target;
        break;
      }
      case Opcode.JumpIfTrue: {
        const condition = bytecodes[offset++];
        const target = bytecodes[offset++];
        if (registers[condition] !== 0) {
          offset = target;
        }
        break;
      }
      case Opcode.JumpIfFalse: {
        const condition = bytecodes[offset++];
        const target = bytecodes[offset++];
        if (registers[condition] === 0) {
          offset = target;
        }
        break;
      }
      case Opcode.Call: {
        const result = bytecodes[offset++];
        const callee = constants[bytecodes[offset++]];
        const args_start = bytecodes[offset++];
        const args_count = bytecodes[offset++];
        if (callee.bytecode_or_foreign instanceof BytecodeArray) {
          bytecode_array = callee.bytecode_or_foreign as BytecodeArray;
          stack.push({
            arguments : args,
            registers,
            offset,
            bytecodes,
            constants,
            result_reg : result,
          });
          args = [];
          for (let i = 0; i < args_count; i++) {
            args.push(registers[args_start + i]);
          }
          registers = [];
          bytecodes = bytecode_array.bytecodes;
          constants = bytecode_array.constants;
          offset = 0;
        } else {
          const foreign = callee.bytecode_or_foreign as IForeignFunction;
          const callee_args = [];
          for (let i = 0; i < args_count; i++) {
            callee_args.push(registers[args_start + i]);
          }
          registers[result] = foreign.fn.apply(undefined, callee_args);
        }
        break;
      }
      case Opcode.Return: {
        const value = registers[bytecodes[offset++]];
        const top = stack.pop();
        args = top.arguments;
        registers = top.registers;
        bytecodes = top.bytecodes;
        constants = top.constants;
        offset = top.offset;
        registers[top.result_reg] = value;
        break;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (offset - 1));
    }
  }
}
