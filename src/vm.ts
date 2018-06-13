import * as Parser from "esprima";
import * as BytecodeGenerator from "./bytecode-generator";
import { IForeignFunction, SharedFunctionInfo } from "./function";
import * as Interpreter from "./interpreter";
import { IVMConfig } from "./vm-config";

const defaultConfig : IVMConfig = {
  printBytecode : false,
  ffi : new Map([
    ["print", {
                fn : (a : number) => { console.log(a); return 0; },
                parameter_count : 1,
              }]]),
};

export class VirtualMachine {

  execute(code : string, config : IVMConfig = defaultConfig) {
    const ast = Parser.parse(code, { loc: true });
    const bytecode_array = BytecodeGenerator.generate(ast, config);
    const shared = new SharedFunctionInfo("<top-level>", bytecode_array, 0);
    const stack = new Float64Array(1e6);
    stack[0] = -1;
    Interpreter.execute(stack, 0, shared);
  }
}
