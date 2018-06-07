export class BytecodeArray {
  bytecodes : number[];
  constants : SharedFunctionInfo[];
  register_count : number;

  constructor(bytecodes : number[], register_count : number,
              constants : SharedFunctionInfo[]) {
    this.bytecodes = bytecodes;
    this.register_count = register_count;
    this.constants = constants;
  }
}

export interface IForeignFunction {
    parameter_count : number;
    fn : (...args : number[]) => number;
}

export class SharedFunctionInfo {
    parameter_count : number;
    bytecode_or_foreign : BytecodeArray | IForeignFunction;
    name : string;

    constructor(name : string,
                bytecode_or_foreign : BytecodeArray | IForeignFunction,
                parameter_count : number)  {
      this.name = name;
      this.bytecode_or_foreign = bytecode_or_foreign;
      this.parameter_count = parameter_count;
    }
}
