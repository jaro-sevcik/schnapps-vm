import * as WasmJit from "wasm-jit";

import * as IR from "./../compiler/ir-graph";

export class ReversedInstructionSequence {
  code : number[] = [];
  nodeIdToLocal : number[] = [];
  localTypes : WasmJit.Type[] = [WasmJit.Type.kI32];
  // TODO somehow name this constant.
  reservedLocals : number = 1;

  add(s : InstructionAssembler) {
    this.code.push(...s.code.reverse());
  }

  getLocalIndex(node : IR.Node) : number {
    let localId : undefined | number =  this.nodeIdToLocal[node.id];
    if (!localId) {
      localId = this.localTypes.length + this.reservedLocals;
      this.localTypes.push(WasmJit.Type.kF64);
      this.nodeIdToLocal[node.id] = localId;
    }
    return localId;
  }
}

export class InstructionAssembler {
  code : number[] = [];

  emit(s : number[]) {
      this.code.push(...s);
  }

  f64Load() {
    this.emit([WasmJit.Opcode.kF64Load, 0, 0]);
  }

  setLocal(local : number) {
    this.code.push(WasmJit.Opcode.kSetLocal);
    WasmJit.emitU32V(local, this.code);
  }

  getLocal(local : number) {
    this.code.push(WasmJit.Opcode.kGetLocal);
    WasmJit.emitU32V(local, this.code);
  }

  f64Constant(n : number) {
    this.code.push(WasmJit.Opcode.kF64Const);
    WasmJit.emitF64V(n, this.code);
  }

  i32Constant(n : number) {
    this.code.push(WasmJit.Opcode.kI32Const);
    WasmJit.emitI32V(n, this.code);
  }

  f64Add() {
    this.code.push(WasmJit.Opcode.kF64Add);
  }

  f64Sub() {
    this.code.push(WasmJit.Opcode.kF64Sub);
  }

  f64Eq() {
    this.code.push(WasmJit.Opcode.kF64Eq);
  }

  f64Le() {
    this.code.push(WasmJit.Opcode.kF64Le);
  }

  f64Lt() {
    this.code.push(WasmJit.Opcode.kF64Lt);
  }

  i32Add() {
    this.code.push(WasmJit.Opcode.kI32Add);
  }

  i32Shl() {
    this.code.push(WasmJit.Opcode.kI32Shl);
  }

  f64ConvertI32U() {
    this.code.push(WasmJit.Opcode.kF64ConvertI32U);
  }

  brIf(depth : number) {
    this.code.push(WasmJit.Opcode.kBrIf);
    WasmJit.emitU32V(depth, this.code);
  }

  br(depth : number) {
    this.code.push(WasmJit.Opcode.kBr);
    WasmJit.emitU32V(depth, this.code);
  }

  block() {
    this.code.push(WasmJit.Opcode.kBlock);
    this.code.push(WasmJit.Type.kStmt);
  }

  end() {
    this.code.push(WasmJit.Opcode.kEnd);
  }

  loop() {
    this.code.push(WasmJit.Opcode.kLoop);
    this.code.push(WasmJit.Type.kStmt);
  }

  ret() {
    this.code.push(WasmJit.Opcode.kReturn);
  }
}
