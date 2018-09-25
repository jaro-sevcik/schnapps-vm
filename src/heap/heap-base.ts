enum ObjectTag {
  kSmallInteger,
  kNumber,
  kReference,
}

class TaggedValue {
  tag : ObjectTag;
  payload : number;
}

class HeapBase {
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
}
