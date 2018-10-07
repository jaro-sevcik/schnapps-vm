import * as assert from "assert";
import * as Objects from "./../heap/objects-def";

export const kWordSize : number = 8;

export class Heap {
  heapHeader : Objects.HeapHeader;

  constructor(address : number, memory : DataView) {
    this.heapHeader = new Objects.HeapHeader(memory, address);
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
    const markQueue : number[] = [];
    this.scanRoots(markQueue);
    while (markQueue.length > 0) {
      const object = markQueue.pop();

      // TODO
      // For all slots in the object.
      //  if (!marked(*slot)) { setmark(*slot); addtoqueue(*slot); }
    }
    return;
  }

  scanRoots(markQueue : number[]) {
    // TODO
  }

  sweep() {
    return;
  }
}
