import { HeapBase,
         TaggedValue,
} from "./../heap/heap-base";

class HeapHeader extends HeapBase {
  static readonly topOffset =
    0;
  static readonly limitOffset =
    HeapHeader.topOffset + kInt32Size;
  static readonly startOffset =
    HeapHeader.limitOffset + kInt32Size;
  static readonly freeListOffset =
    HeapHeader.startOffset + kInt32Size;
  static readonly stackTopOffset =
    HeapHeader.freeListOffset + kInt32Size;
  static readonly stackStartOffset =
    HeapHeader.stackTopOffset + kInt32Size;
  static readonly stackEndOffset =
    HeapHeader.stackStartOffset + kInt32Size;
  static readonly objectSize =
    HeapHeader.stackEndOffset + kInt32Size;

  constructor(view : DataView, address : number) {
    super(view, address);
  }

  get top() : number {
    return this.baseGetInt32(HeapHeader.topOffset);
  }
  set top(v : number) {
    this.baseSetInt32(HeapHeader.topOffset, v);
  }
  get limit() : number {
    return this.baseGetInt32(HeapHeader.limitOffset);
  }
  set limit(v : number) {
    this.baseSetInt32(HeapHeader.limitOffset, v);
  }
  get start() : number {
    return this.baseGetInt32(HeapHeader.startOffset);
  }
  set start(v : number) {
    this.baseSetInt32(HeapHeader.startOffset, v);
  }
  get freeList() : number {
    return this.baseGetInt32(HeapHeader.freeListOffset);
  }
  set freeList(v : number) {
    this.baseSetInt32(HeapHeader.freeListOffset, v);
  }
  get stackTop() : number {
    return this.baseGetInt32(HeapHeader.stackTopOffset);
  }
  set stackTop(v : number) {
    this.baseSetInt32(HeapHeader.stackTopOffset, v);
  }
  get stackStart() : number {
    return this.baseGetInt32(HeapHeader.stackStartOffset);
  }
  set stackStart(v : number) {
    this.baseSetInt32(HeapHeader.stackStartOffset, v);
  }
  get stackEnd() : number {
    return this.baseGetInt32(HeapHeader.stackEndOffset);
  }
  set stackEnd(v : number) {
    this.baseSetInt32(HeapHeader.stackEndOffset, v);
  }
}

class HeapObject extends HeapBase {
  static readonly instanceTypeOffset =
    0;
  static readonly heapObjectPaddingOffset =
    HeapObject.instanceTypeOffset + kInt32Size;
  static readonly objectSize =
    HeapObject.heapObjectPaddingOffset + kInt32Size;

  constructor(view : DataView, address : number) {
    super(view, address);
  }

  get instanceType() : number {
    return this.baseGetInt32(HeapObject.instanceTypeOffset);
  }
  set instanceType(v : number) {
    this.baseSetInt32(HeapObject.instanceTypeOffset, v);
  }
  get heapObjectPadding() : number {
    return this.baseGetInt32(HeapObject.heapObjectPaddingOffset);
  }
  set heapObjectPadding(v : number) {
    this.baseSetInt32(HeapObject.heapObjectPaddingOffset, v);
  }
}

class BytecodeConstants extends HeapObject {
  static readonly sizeOffset =
    HeapObject.objectSize;
  static readonly constantsOffset =
    BytecodeConstants.sizeOffset + kInt32Size;

  constructor(view : DataView, address : number) {
    super(view, address);
  }

  get size() : number {
    return this.baseGetInt32(BytecodeConstants.sizeOffset);
  }
  set size(v : number) {
    this.baseSetInt32(BytecodeConstants.sizeOffset, v);
  }
  constantsGet(i : number) : TaggedValue {
    return this.baseGetTagged(BytecodeConstants.constantsOffset + i);
  }
  constantsSet(i : number, v : TaggedValue) {
    this.baseSetTagged(BytecodeConstants.constantsOffset + i, v);
  }
}

class BytecodeArray extends HeapObject {
  static readonly registerCountOffset =
    HeapObject.objectSize;
  static readonly profilerCounterOffset =
    BytecodeArray.registerCountOffset + kInt32Size;
  static readonly bytecodeSizeOffset =
    BytecodeArray.profilerCounterOffset + kInt32Size;
  static readonly constantsOffset =
    BytecodeArray.bytecodeSizeOffset + kInt32Size;
  static readonly bytecodesOffset =
    BytecodeArray.constantsOffset + kTaggedSize;

  constructor(view : DataView, address : number) {
    super(view, address);
  }

  get registerCount() : number {
    return this.baseGetInt32(BytecodeArray.registerCountOffset);
  }
  set registerCount(v : number) {
    this.baseSetInt32(BytecodeArray.registerCountOffset, v);
  }
  get profilerCounter() : number {
    return this.baseGetInt32(BytecodeArray.profilerCounterOffset);
  }
  set profilerCounter(v : number) {
    this.baseSetInt32(BytecodeArray.profilerCounterOffset, v);
  }
  get bytecodeSize() : number {
    return this.baseGetInt32(BytecodeArray.bytecodeSizeOffset);
  }
  set bytecodeSize(v : number) {
    this.baseSetInt32(BytecodeArray.bytecodeSizeOffset, v);
  }
  get constants() : BytecodeConstants {
    return new BytecodeConstants(
      this.baseDataView,
      this.baseGetTaggedPointer(BytecodeArray.constantsOffset));
  }
  set constants(v : BytecodeConstants) {
    this.baseSetTaggedPointer(BytecodeArray.constantsOffset, v.baseAddress);
  }
  bytecodesGet(i : number) : number {
    return this.baseGetInt32(BytecodeArray.bytecodesOffset + i);
  }
  bytecodesSet(i : number, v : number) {
    this.baseSetInt32(BytecodeArray.bytecodesOffset + i, v);
  }
}
