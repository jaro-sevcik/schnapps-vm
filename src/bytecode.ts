import * as assert from "assert";

export enum Opcode {
  LoadInteger,
  Load,
  Add,
  Sub,
  Mul,
  Div,
  TestEqual,
  TestLessThan,
  TestLessThanOrEqual,
  Jump,
  JumpLoop,
  JumpIfTrue,
  JumpIfFalse,
  Print,
  Time,
  Call,
}

export class BytecodeArray {
  bytecodes : number[];
  register_count : number;

  constructor(bytecodes : number[], register_count : number) {
    this.bytecodes = bytecodes;
    this.register_count = register_count;
  }
}

export enum OperandKind {
  OutputRegister,
  InputRegister,
  InputRegisterRangeStart,
  InputRegisterRangeCount,
  Constant,
  Label,
}

export class BytecodeDescriptor {
  name : string;
  operands : OperandKind[];
}

export const bytecodeDescriptors : BytecodeDescriptor[] = [];

function register(opcode : Opcode, ...operands : OperandKind[]) {
  bytecodeDescriptors[opcode] = { name : Opcode[opcode], operands };
  let lastSeenKind = OperandKind.OutputRegister;
  for (const kind of operands) {
    if (kind < lastSeenKind) {
      console.error("Arguments not ordered for bytecode " + Opcode[opcode]);
    }
    lastSeenKind = kind;
  }
}

{
  const k = OperandKind;
  const o = Opcode;
  register(o.LoadInteger, k.OutputRegister, k.Constant);
  register(o.Load, k.OutputRegister, k.InputRegister);
  register(o.Add, k.OutputRegister, k.InputRegister, k.InputRegister);
  register(o.Sub, k.OutputRegister, k.InputRegister, k.InputRegister);
  register(o.Mul, k.OutputRegister, k.InputRegister, k.InputRegister);
  register(o.Div, k.OutputRegister, k.InputRegister, k.InputRegister);
  register(o.TestEqual, k.OutputRegister, k.InputRegister, k.InputRegister);
  register(o.TestLessThan, k.OutputRegister, k.InputRegister, k.InputRegister);
  register(o.TestLessThanOrEqual, k.OutputRegister, k.InputRegister,
           k.InputRegister);
  register(o.Jump, k.Label);
  register(o.JumpLoop, k.Label);
  register(o.JumpIfTrue, k.InputRegister, k.Label);
  register(o.JumpIfFalse, k.InputRegister, k.Label);
  register(o.Call,
           k.OutputRegister,                                      // Retval.
           k.InputRegister,                                       // Target.
           k.InputRegisterRangeStart, k.InputRegisterRangeCount); // Args.
  register(o.Print, k.InputRegister);
}

export function printBytecode(bytecodes : number[]) {
  function fmt(s : string, n : number) {
    return s + " ".repeat(n - s.length);
  }

  let offset = 0;
  while (offset < bytecodes.length) {
    let s = fmt(offset.toString(), 5);

    // Read the opcode and get the descriptor.
    const opcode = bytecodes[offset++];
    const descriptor = bytecodeDescriptors[opcode];

    // Print the opcode.
    s += fmt(descriptor.name, 15);
    const ops = descriptor.operands;
    let i = 0;

    // Print output registers.
    let isFirst = true;
    for  (; i < ops.length && ops[i] === OperandKind.OutputRegister; i++) {
      if (!isFirst) s += ", ";
      isFirst = false;
      s += "r" + bytecodes[offset++];
    }

    // Print input registers and constants (if there are any).
    if (i < ops.length) {
      if (i !== 0) s += " <- ";
      for (isFirst = true; i < ops.length; i++) {
        if (!isFirst) s += ", ";
        isFirst = false;
        if (ops[i] === OperandKind.InputRegister) {
          s += "r" + bytecodes[offset++];
        } else if (ops[i] === OperandKind.Constant) {
          s += bytecodes[offset++];
        } else {
          assert.strictEqual(ops[i], OperandKind.Label);
          s += `+${bytecodes[offset++]}`;
        }
      }
    }
    assert.strictEqual(i, ops.length);
    console.log(s);
  }
  assert.strictEqual(offset, bytecodes.length);
}
