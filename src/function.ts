import { printBytecode } from "./bytecode";

export class BytecodeArray {
  bytecodes : number[];
  constants : SharedFunctionInfo[];
  registerCount : number;
  profileCounter : number = 0;

  constructor(bytecodes : number[], registerCount : number,
              constants : SharedFunctionInfo[]) {
    this.bytecodes = bytecodes;
    this.registerCount = registerCount;
    this.constants = constants;
  }
}

export function printBytecodeArray(a : BytecodeArray) {
    console.log(`  Register count: ${a.registerCount}`);
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
    parameterCount : number;
    bytecode : BytecodeArray;
    // TODO(jarin) This should eventually take the function so that
    // we do not have to pass it through a closure. Ideally, this
    // would point directy to the interpreter's execute function.
    code : (framePtr : number, heapPtr : number) => number = undefined;
    name : string;
    flags : FunctionFlags = FunctionFlags.kOptimizable;

    constructor(name : string,
                bytecode : BytecodeArray,
                parameterCount : number)  {
      this.name = name;
      this.bytecode = bytecode;
      this.parameterCount = parameterCount;
    }

    markCannotOptimize() {
        this.flags &= ~FunctionFlags.kOptimizable;
    }

    isOptimizable() : boolean {
        return (this.flags & FunctionFlags.kOptimizable) !== 0;
    }
}

export function printSharedFunctionInfo(f : SharedFunctionInfo) {
    console.log(`Function ${f.name} (param count ${f.parameterCount}):`);
    if (f.bytecode) {
        printBytecodeArray(f.bytecode);
    } else {
        console.log("   <native>");
    }
}
