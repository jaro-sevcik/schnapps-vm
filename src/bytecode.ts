import * as assert from "assert";

export enum Opcode {
  Drop,               // Remove the top of the stack.
  Dup,                // Duplicate the top of the stack.
  LoadInteger,
  LoadLocal,
  StoreLocal,
  Add,
  Sub,
  Mul,
  Div,
  TestEqual,
  TestLessThan,
  TestLessThanOrEqual,
  Jump,
  JumpIfTrue,
  JumpIfFalse,
  LoopHeader,
  JumpLoop,
  Call,
  Return,
}

export enum OperandKind {
  // Index of local variable.
  LocalIndex,
  // Count of inputs consumed from the stack (e.g., for calls).
  Count,
  // Numeric constant.
  NumberConstant,
  // Other constant (currently used for functions).
  Constant,
  // Jump target id.
  Label,
}

export class BytecodeDescriptor {
  name : string;
  operands : OperandKind[];
}

export const fixedSlotCount : number = 2;

export const bytecodeDescriptors : BytecodeDescriptor[] = [];

function register(opcode : Opcode, ...operands : OperandKind[]) {
  bytecodeDescriptors[opcode] = { name : Opcode[opcode], operands };
}

{
  const k = OperandKind;
  const o = Opcode;
  register(o.Drop);
  register(o.Dup);
  register(o.LoadInteger, k.NumberConstant);
  register(o.LoadLocal, k.LocalIndex);
  register(o.StoreLocal, k.LocalIndex);
  register(o.Add);
  register(o.Sub);
  register(o.Mul);
  register(o.Div);
  register(o.TestEqual);
  register(o.TestLessThan);
  register(o.TestLessThanOrEqual);
  register(o.Jump, k.Label);
  register(o.JumpIfTrue, k.Label);
  register(o.JumpIfFalse, k.Label);
  register(o.JumpLoop, k.Label);
  register(o.LoopHeader);
  register(o.Call, k.Constant, k.Count);
  register(o.Return);
}

export function printBytecode(bytecodes : number[]) {
  function fmt(s : string, n : number) {
    return s + " ".repeat(n - s.length);
  }

  let offset = 0;
  while (offset < bytecodes.length) {
    let s = "    " + fmt(offset.toString(), 5);

    // Read the opcode and get the descriptor.
    const opcode = bytecodes[offset++];
    const descriptor = bytecodeDescriptors[opcode];

    // Print the opcode.
    s += fmt(descriptor.name, 15);

    function localName(r : number) : string {
      if (r >= 0) {
        return `r${r}`;
      } else {
        return `a${- r - 1}`;
      }
    }

    const args = [];
    const ops = descriptor.operands;

    // Print input registers and constants (if there are any).
    for (const op of ops) {
      switch (op) {
        case OperandKind.LocalIndex:
          args.push(localName(bytecodes[offset++]));
          break;
        case OperandKind.Count:
          args.push(bytecodes[offset++]);
          break;
        case OperandKind.NumberConstant:
          args.push(bytecodes[offset++]);
          break;
        case OperandKind.Constant:
          args.push(`[${bytecodes[offset++]}]`);
          break;
        case OperandKind.Label:
          args.push(`+${bytecodes[offset++]}`);
          break;
      }
    }
    console.log(s + args.join(", "));
  }
  assert.strictEqual(offset, bytecodes.length);
}
