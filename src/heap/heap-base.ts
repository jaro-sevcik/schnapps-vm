import * as assert from "assert";

export const kPointerNaNTag = 0x7ffc0000;
export const kInt32NaNTag = 0x7ffe0000;
export const kInt32Size = 4;
export const kTaggedSize = 8;

enum ValueTag {
  kInt32,
  kPointer,
  kFloat64,
}

export class TaggedValue {
  payload : number;
  tag : ValueTag;

  constructor(tag : ValueTag, payload : number) {
    this.tag = tag;
    this.payload = payload;
  }

  isInt32() : boolean {
    return this.tag === ValueTag.kInt32;
  }

  isPointer() : boolean {
    return this.tag === ValueTag.kPointer;
  }

  isFloat64() : boolean {
    return this.tag === ValueTag.kFloat64;
  }

  toNumber() : number {
    assert(!this.isPointer());
    return this.payload;
  }

  toPointer() : number {
    assert(this.isPointer());
    return this.payload;
  }
}

export class HeapBase {
  baseDataView : DataView;
  baseAddress : number;

  constructor(view : DataView, address : number) {
    this.baseDataView = view;
    this.baseAddress = address;
  }

  baseGetInt32(offset : number) : number {
    return this.baseDataView.getInt32(this.baseAddress + offset);
  }

  baseSetInt32(offset : number, value : number) : void {
    this.baseDataView.setInt32(this.baseAddress + offset, value);
  }

  baseGetTaggedPointer(offset : number) : number {
    assert.strictEqual(
      this.baseDataView.getUint32(this.baseAddress + offset + 4),
      kPointerNaNTag);
    return this.baseDataView.getUint32(this.baseAddress + offset);
  }

  baseSetTaggedPointer(offset : number, pointer : number) : void {
    this.baseDataView.setUint32(this.baseAddress + offset, pointer);
    this.baseDataView.setUint32(this.baseAddress + offset + 4, kPointerNaNTag);
  }

  baseGetTagged(offset : number) : TaggedValue {
    const tag = this.baseDataView.getUint32(this.baseAddress + offset + 4);
    if (tag === kPointerNaNTag) {
      return new TaggedValue(
        ValueTag.kPointer,
        this.baseDataView.getUint32(this.baseAddress + offset));
    } else if (tag === kInt32NaNTag) {
      return new TaggedValue(
        ValueTag.kInt32,
        this.baseDataView.getInt32(this.baseAddress + offset));
    } else {
      return new TaggedValue(
        ValueTag.kFloat64,
        this.baseDataView.getFloat64(this.baseAddress + offset));
    }
  }

  baseSetTagged(offset : number, value : TaggedValue) : void {
    switch (value.tag) {
      case ValueTag.kInt32:
        this.baseDataView.setInt32(this.baseAddress + offset, value.payload);
        this.baseDataView.setUint32(this.baseAddress + offset + 4,
          kInt32NaNTag);
        break;
      case ValueTag.kPointer:
        this.baseDataView.setUint32(this.baseAddress + offset, value.payload);
        this.baseDataView.setUint32(this.baseAddress + offset + 4,
          kPointerNaNTag);
        break;
      case ValueTag.kFloat64:
        this.baseDataView.setFloat64(this.baseAddress + offset, value.payload);
        break;
    }
  }
}
