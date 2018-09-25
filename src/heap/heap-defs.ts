const kWordSize : number = 8;
const kInt32Size : number = 4;
const kTaggedSize : number = 8;


class Address {
  address : number;
}

class JSValue {
  numeric? : number;
  address? : Address;
}
