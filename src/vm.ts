import * as Parser from "esprima";
import * as BytecodeGenerator from "./bytecode-generator";
import { SharedFunctionInfo } from "./function";
import * as Heap from "./heap/heap";
import * as Interpreter from "./interpreter";
import { VMConfig } from "./vm-config";

export class VirtualMachine {
  execute(code : string, config : VMConfig) {
    const ast = Parser.parse(code, { loc: true });
    const memory = new WebAssembly.Memory({ initial : 16, maximum : 16 });
    const stack = new DataView(memory.buffer);
    const stackStart = 0;
    stack.setFloat64(stackStart, -1, true);
    const bytecodeArray =
        BytecodeGenerator.generate(ast, memory, config);
    const shared = new SharedFunctionInfo("<top-level>", bytecodeArray, 0);
    Interpreter.execute(memory, stackStart, 0, shared, config.flags);
  }
}
