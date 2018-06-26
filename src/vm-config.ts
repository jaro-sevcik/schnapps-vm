import { IForeignFunction } from "./function";

export interface IVMFlags {
  printBytecode? : boolean;
  printCode? : boolean;
  printGraph? : boolean;
}

export class VMConfig {
  flags : IVMFlags = {};
  ffi : Map<string, IForeignFunction>;

  constructor(ffi : Map<string, IForeignFunction>) {
    this.ffi = ffi;
  }
}
