import { IForeignFunction } from "./function";

export interface IVMConfig {
  printBytecode : boolean;
  ffi : Map<string, IForeignFunction>;
}
