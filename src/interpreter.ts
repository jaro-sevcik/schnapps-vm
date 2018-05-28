import { Opcode } from "./bytecode";

export function execute(bytecodeArray : number[]) {
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
      case Opcode.Print: {
        const register = bytecodeArray[offset++];
        console.log(registers[register]);
        break;
      }
      default:
        console.error("Unknown bytecode " + bytecode + " at " + (offset - 1));
    }
  }
}
