import { printBytecode } from "./bytecode";

export class BytecodeArray {
  bytecodes : number[];
  constants : SharedFunctionInfo[];
  register_count : number;
  profile_counter : number = 0;

  constructor(bytecodes : number[], register_count : number,
              constants : SharedFunctionInfo[]) {
    this.bytecodes = bytecodes;
    this.register_count = register_count;
    this.constants = constants;
  }
}

export function printBytecodeArray(a : BytecodeArray) {
    console.log(`  Register count: ${a.register_count}`);
    printBytecode(a.bytecodes);
    // TODO Print constants.
}

export interface IForeignFunction {
    parameter_count : number;
    fn : (...args : number[]) => number;
}

export class SharedFunctionInfo {
    parameter_count : number;
    bytecode_or_foreign : BytecodeArray | IForeignFunction;
    code : (memory : Float64Array, frame_ptr : number) => number;
    name : string;

    constructor(name : string,
                bytecode_or_foreign : BytecodeArray | IForeignFunction,
                parameter_count : number)  {
      this.name = name;
      this.bytecode_or_foreign = bytecode_or_foreign;
      this.parameter_count = parameter_count;
    }
}

export function printSharedFunctionInfo(f : SharedFunctionInfo) {
    console.log(`Function ${f.name} (param count ${f.parameter_count}):`);
    if (f.bytecode_or_foreign instanceof BytecodeArray) {
        printBytecodeArray(f.bytecode_or_foreign);
    } else {
        console.log("   <native>");
    }
}
