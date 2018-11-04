import * as Parser from "esprima";
import * as BytecodeGenerator from "./bytecode-generator";
import { SharedFunctionInfo } from "./function";
import * as Heap from "./heap/heap";
import * as Interpreter from "./interpreter";
import { VMConfig } from "./vm-config";

export class VirtualMachine {
  execute(code : string, config : VMConfig) {
    const ast = Parser.parse(code, { loc: true });
    const wasmMemory = new WebAssembly.Memory({ initial : 32, maximum : 32 });
    const memory = new DataView(wasmMemory.buffer);
    const stackStart = 0;
    const heapStart = 1024 * 1024;
    const heapSize = 1024 * 1024;
    const heap = new Heap.Heap(heapStart, memory);
    heap.setup(heapSize);
    memory.setFloat64(stackStart, -1, true);
    const bytecodeArray =
        BytecodeGenerator.generate(ast, wasmMemory, heap, config);
    const shared = new SharedFunctionInfo("<top-level>", bytecodeArray, 0);
    Interpreter.execute(wasmMemory, stackStart, heapStart, shared,
      config.flags);
  }
}
