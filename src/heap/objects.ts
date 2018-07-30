import { kWordSize } from "./../heap/heap";

class HeapObject {
  static readonly kInstanceTypeOffset = 0;
  static readonly kHeaderSize = HeapObject.kInstanceTypeOffset + kWordSize;

  readonly address : number;

  constructor(address : number) {
    this.address = address;
  }
}

class BytecodeArray extends HeapObject {
  static readonly kSizeOffset = HeapObject.kHeaderSize;
  static readonly kRegisterCountOffset = BytecodeArray.kSizeOffset + kWordSize;
  static readonly kProfilerCounterOffset =
    BytecodeArray.kRegisterCountOffset + kWordSize;
  static readonly kBytecodeSizeOffset =
    BytecodeArray.kProfilerCounterOffset + kWordSize;
  static readonly kConstantCountOffset =
    BytecodeArray.kBytecodeSizeOffset + kWordSize;
  static readonly kFirstBytecodeOffset =
    BytecodeArray.kConstantCountOffset + kWordSize;

  constructor(address : number) {
    super(address);
  }
}
