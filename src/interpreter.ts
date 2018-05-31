import { Opcode } from "./bytecode";

export function execute(bytecodeArray : number[],
                        out : (s : string) => void) {
  let offset = 0;
  const registers : number[] = [];
  while (offset < bytecodeArray.length) {
    const bytecode = bytecodeArray[offset++];
    switch (bytecode) {
      case Opcode.LoadInteger: {
        const register = bytecodeArray[offset++];
        const value = bytecodeArray[offset++];
        registers[register] = value;
        break;
      }
      case Opcode.Load: {
        const destination = bytecodeArray[offset++];
        const source = bytecodeArray[offset++];
        registers[destination] = registers[source];
        break;
      }
      case Opcode.Add: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        registers[result] = registers[left] + registers[right];
        break;
      }
      case Opcode.Sub: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        registers[result] = registers[left] - registers[right];
        break;
      }
      case Opcode.Mul: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        registers[result] = registers[left] * registers[right];
        break;
      }
      case Opcode.Div: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        registers[result] = registers[left] / registers[right];
        break;
      }
      case Opcode.TestEqual: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        // TODO Fix to return boolean.
        registers[result] = +(registers[left] === registers[right]);
        break;
      }
      case Opcode.TestLessThan: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        // TODO Fix to return boolean.
        registers[result] = +(registers[left] < registers[right]);
        break;
      }
      case Opcode.TestLessThanOrEqual: {
        const result = bytecodeArray[offset++];
        const left = bytecodeArray[offset++];
        const right = bytecodeArray[offset++];
        // TODO Fix to return boolean.
        registers[result] = +(registers[left] <= registers[right]);
        break;
      }
      case Opcode.Jump:
      case Opcode.JumpLoop: {
        const target = bytecodeArray[offset++];
        offset = target;
        break;
      }
      case Opcode.JumpIfTrue: {
        const condition = bytecodeArray[offset++];
        const target = bytecodeArray[offset++];
        if (registers[condition] !== 0) {
          offset = target;
        }
        break;
      }
      case Opcode.JumpIfFalse: {
        const condition = bytecodeArray[offset++];
        const target = bytecodeArray[offset++];
        if (registers[condition] === 0) {
          offset = target;
        }
        break;
      }
      case Opcode.Print: {
        const register = bytecodeArray[offset++];
        out(registers[register].toString());
        break;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (offset - 1));
    }
  }
}
