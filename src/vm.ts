import * as Parser from "esprima";
import { printBytecode } from "./bytecode";
import * as BytecodeGenerator from "./bytecode-generator";
import { SharedFunctionInfo } from "./function";
import * as Interpreter from "./interpreter";

export interface IVMConfig {
  printBytecode : boolean;
  printerFunction : (out : string) => void;
}

const defaultConfig : IVMConfig = {
  printBytecode : false,
  printerFunction : console.log,
};

export class VirtualMachine {

  execute(code : string, config : IVMConfig = defaultConfig) {
    const ast = Parser.parse(code);
    const bytecode_array = BytecodeGenerator.generate(ast);
    if (config.printBytecode) {
      console.log("==================================");
      printBytecode(bytecode_array.bytecodes);
    }
    const s = new SharedFunctionInfo("<top-level>", bytecode_array, 0);
    Interpreter.execute(s, [], config.printerFunction);
  }
}
