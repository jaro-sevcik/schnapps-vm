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

export enum FunctionFlags {
    kNone = 0,
    kOptimizable = 1,
}

export class SharedFunctionInfo {
    parameter_count : number;
    bytecode : BytecodeArray;
    // TODO(jarin) This should eventually take the function so that
    // we do not have to pass it through a closure. Ideally, this
    // would point directy to the interpreter's execute function.
    code : (frame_ptr : number) => number = undefined;
    name : string;
    flags : FunctionFlags = FunctionFlags.kOptimizable;

    constructor(name : string,
                bytecode : BytecodeArray,
                parameter_count : number)  {
      this.name = name;
      this.bytecode = bytecode;
      this.parameter_count = parameter_count;
    }

    markCannotOptimize() {
        this.flags &= ~FunctionFlags.kOptimizable;
    }

    isOptimizable() : boolean {
        return (this.flags & FunctionFlags.kOptimizable) !== 0;
    }
}

export function printSharedFunctionInfo(f : SharedFunctionInfo) {
    console.log(`Function ${f.name} (param count ${f.parameter_count}):`);
    if (f.bytecode) {
        printBytecodeArray(f.bytecode);
    } else {
        console.log("   <native>");
    }
}
