import * as assert from "assert";

export const kWordSize : number = 8;

export class HeapHeader {
  static readonly kTopOffset = 0;
  static readonly kLimitOffset = HeapHeader.kTopOffset + kWordSize;
  static readonly kStartOffset = HeapHeader.kLimitOffset + kWordSize;
  static readonly kHeapHeaderSize =
    HeapHeader.kStartOffset + kWordSize;

  private address : number;
  private memory : DataView;

  constructor(address : number, memory : DataView) {
    this.address = address;
    this.memory = memory;
  }

  get top() : number {
    return this.memory.getUint32(this.address + HeapHeader.kTopOffset);
  }

  set top(value : number) {
    this.memory.setUint32(this.address + HeapHeader.kTopOffset, value);
  }

  get limit() : number {
    return this.memory.getUint32(this.address + HeapHeader.kLimitOffset);
  }

  set limit(value : number) {
    this.memory.setUint32(this.address + HeapHeader.kLimitOffset, value);
  }
}

export class Heap {
  heapHeader : HeapHeader;

  constructor(address : number, memory : DataView) {
    this.heapHeader = new HeapHeader(address, memory);
  }

  allocateRaw(size : number) : number {
    let result = this.bumpAllocate(size);
    if (result !== 0) return result;

    // Try to find free space in some other free list block.
    if (!this.findFreeSpace(size)) {
      // Could not find a free entry, collect garbage.
      this.collectGarbage();
      if (!this.findFreeSpace(size)) {
        throw new Error("Heap full.");
      }
    }

    result = this.bumpAllocate(size);
    assert.notStrictEqual(result, 0);
    return result;
  }

  bumpAllocate(size : number) : number {
    const result = this.heapHeader.top;
    const newTop = result + size;
    // If it can fit into the current semi-space, just bump the pointer
    // and return.
    if (newTop < this.heapHeader.limit) {
      this.heapHeader.top = newTop;
      return result;
    }
    return 0;
  }

  findFreeSpace(objectSize : number) : boolean {
    return false;
  }

  collectGarbage() {
    this.mark();
    this.sweep();
  }

  mark() {
    return;
  }

  sweep() {
    return;
  }
}
