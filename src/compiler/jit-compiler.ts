import { generateCode } from "./../compiler/code-generator";
import { buildGraph } from "./../compiler/graph-builder";
import { SharedFunctionInfo } from "./../function";
import { IVMFlags } from "./../vm-config";

export const kCompileTickCount : number = 1000;

export function tryCompile(
      shared : SharedFunctionInfo,
      memory : WebAssembly.Memory,
      vmFlags : IVMFlags) : (f : number) => number {
    // Build graph.
    const graph = buildGraph(shared);
    if (!graph) return null;

    if (vmFlags.printGraph) {
      console.log(`>>> Graph for "${shared.name}".`);
      graph.print();
    }

    // Generate code.
    const code = generateCode(shared, graph, memory, vmFlags);
    if (!code) {
      return null;
    }
    return code;
}


export function compile(shared : SharedFunctionInfo,
                        memory : WebAssembly.Memory,
                        traceFlags : IVMFlags) : boolean {
  const code = tryCompile(shared, memory, traceFlags);
  if (code) {
    shared.code = code;
    return true;
  } else {
    shared.markCannotOptimize();
  }
  return false;
}
