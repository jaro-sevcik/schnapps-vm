import * as Parser from "esprima";
import { printBytecode } from "./bytecode";
import * as BytecodeGenerator from "./bytecode-generator";
import * as Interpreter from "./interpreter";

export class VirtualMachine {

  execute(code : string) {
    const ast = Parser.parse(code);
    const bytecode = BytecodeGenerator.generate(ast);
    printBytecode(bytecode);
    Interpreter.execute(bytecode);
  }
}
