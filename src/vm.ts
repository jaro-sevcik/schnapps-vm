import * as Parser from "esprima";
import * as BytecodeGenerator from "./bytecode-generator";
import { IForeignFunction, SharedFunctionInfo } from "./function";
import * as Heap from "./heap/heap";
import * as Interpreter from "./interpreter";
import { VMConfig } from "./vm-config";

export class VirtualMachine {
  execute(code : string, config : VMConfig) {
    const ast = Parser.parse(code, { loc: true });
    const memory = new WebAssembly.Memory({ initial : 16, maximum : 16 });
    const stack = new Float64Array(memory.buffer);
    const bytecodeArray =
        BytecodeGenerator.generate(ast, memory, config);
    const shared = new SharedFunctionInfo("<top-level>", bytecodeArray, 0);
    const stackStart = Heap.HeapHeader.kHeapHeaderSize / Heap.kWordSize;
    stack[stackStart] = -1;
    Interpreter.execute(stack, memory, stackStart, shared, config.flags);
  }
}
