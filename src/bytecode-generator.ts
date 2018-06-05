import * as assert from "assert";
import * as Ast from "estree";
import { Opcode } from "./bytecode";
import * as Bytecode from "./bytecode";
import { BytecodeArray,
         IForeignFunction,
         SharedFunctionInfo} from "./function";

class LabelOperand {
  static Bound(offset : number) : LabelOperand {
    const l : LabelOperand = new LabelOperand();
    l.offset = offset;
    return l;
  }

  offset? : number;
  patchPositions : number[] = [];
}

const unboundLabelSentinel = -123;

class BytecodeGenerator {
  bytecodes : number[] = [];
  constants : SharedFunctionInfo[] = [];
  external : Map<string, SharedFunctionInfo>;
  variables = new Map<string, number>();
  liveRegisterCount : number = 0;
  maxRegisterCount : number = 0;

  constructor(ffi : Map<string, SharedFunctionInfo>) {
    this.external = ffi;
  }

  // Register management. We allocate register stack machine style.
  allocateRegister() : number {
    return this.allocateRegisterRange(1);
  }

  allocateRegisterRange(n : number) : number {
    const reg = this.liveRegisterCount;
    this.liveRegisterCount += n;
    if (this.liveRegisterCount > this.maxRegisterCount) {
      this.maxRegisterCount = reg;
    }
    return reg;
  }

  freeRegisterRange(register : number, n : number) {
    this.liveRegisterCount -= n;
    assert.strictEqual(this.liveRegisterCount, register);
  }

  freeRegister(register : number) {
    return this.freeRegisterRange(register, 1);
  }

  createConstant(c : SharedFunctionInfo) : number {
    const i = this.constants.length;
    this.constants.push(c);
    return i;
  }

  createLoopLabel() : LabelOperand {
    return new LabelOperand();
  }

  bindLabel(l : LabelOperand) {
    assert.strictEqual(l.offset, undefined);
    const currentOffset = this.bytecodes.length;
    for (const p of l.patchPositions) {
      assert.strictEqual(this.bytecodes[p], unboundLabelSentinel);
      this.bytecodes[p] = currentOffset;
    }
    l.offset = currentOffset;
    l.patchPositions.length = 0;
  }

  pushLabel(l : LabelOperand) {
    if (l.offset === undefined) {
      l.patchPositions.push(this.bytecodes.length);
      this.bytecodes.push(unboundLabelSentinel);
    } else {
      this.bytecodes.push(l.offset);
    }
  }

  emit(sequence : Array<number | LabelOperand>) {
    const opcode = sequence[0] as number;
    this.bytecodes.push(opcode);
    const operandKinds = Bytecode.bytecodeDescriptors[opcode].operands;
    assert.strictEqual(sequence.length - 1, operandKinds.length);
    assert.notStrictEqual(Opcode[opcode], undefined);
    for (let i = 1; i < sequence.length; i++) {
      const b = sequence[i];
      if (b instanceof LabelOperand) {
        assert.strictEqual(operandKinds[i - 1], Bytecode.OperandKind.Label);
        this.pushLabel(b as LabelOperand);
      } else {
        assert.notStrictEqual(operandKinds[i - 1], Bytecode.OperandKind.Label);
        assert.strictEqual(typeof b, "number");
        this.bytecodes.push(b);
      }
    }
  }

  // Rudimentary error handling.
  throwError(n : Ast.Node) {
    throw new Error("Unsupported Ast node of type " + n.type);
  }

  // Entry point for generating bytecodes for the program.
  visitProgram(program : Ast.Program) : BytecodeArray {
    this.visitStatementList(program.body);
    return new BytecodeArray(this.bytecodes, this.maxRegisterCount,
                             this.constants);
  }

  // Generate bytecodes for a list of statements.
  visitStatementList(statements : Ast.Node[]) {
    statements.forEach((s) => this.visitStatement(s));
  }

  // Generate bytecodes for a given statement.
  visitStatement(s : Ast.Node) {
    switch (s.type) {
      case "VariableDeclaration":
        this.visitVariableDeclaration(s as Ast.VariableDeclaration);
        break;
      case "ExpressionStatement":
        const expression = (s as Ast.ExpressionStatement).expression;
        const dummy_result = this.allocateRegister();
        this.visitExpression(expression, dummy_result);
        this.freeRegister(dummy_result);
        break;
      case "WhileStatement":
        this.visitWhileStatement(s as Ast.WhileStatement);
        break;
      case "IfStatement":
        this.visitIfStatement(s as Ast.IfStatement);
        break;
      case "BlockStatement": {
        const b = s as Ast.BlockStatement;
        this.visitStatementList(b.body);
        break;
      }
      default:
        this.throwError(s);
        break;
    }
  }

  // Helper for defining variables. It allocates a register for the
  // variable, and then it stores the initial value there.
  defineVariable(name : string, init : number) {
    let register;
    if (this.variables.has(name)) {
      // If the variable name already exists, let us use it.
      register = this.variables.get(name);
    } else {
      // Otherwise, allocate a fresh register for the variable.
      register = this.allocateRegister();
      this.variables.set(name, register);
    }
    // Store the initial value.
    this.emit([Opcode.LoadInteger, register, init]);
  }

  visitVariableDeclaration(declaration : Ast.VariableDeclaration) {
    if (declaration.kind !== "var") this.throwError(declaration);
    for (const d of declaration.declarations) {
      // We require the variable declaration to be of the form:
      // VariableDeclarator {
      //   id : Identifier,
      //   init : Literal { value : number }
      // }
      if (d.type !== "VariableDeclarator") this.throwError(d);
      if (d.id.type !== "Identifier") this.throwError(d.id);
      const id = d.id as Ast.Identifier;
      if (d.init.type !== "Literal") this.throwError(d.init);
      const init = d.init as Ast.Literal;
      if (typeof init.value !== "number") this.throwError(init);
      this.defineVariable(id.name, init.value as number);
    }
  }

  visitWhileStatement(s : Ast.WhileStatement) {
    const loop = new LabelOperand();
    this.bindLabel(loop);
    // Visit the condition.
    const test_register = this.allocateRegister();
    this.visitExpression(s.test, test_register);
    const done = new LabelOperand();
    this.emit([Opcode.JumpIfFalse, test_register, done]);
    this.visitStatement(s.body);
    this.emit([Opcode.JumpLoop, loop]);
    this.bindLabel(done);
  }

  visitIfStatement(s : Ast.IfStatement) {
    const else_label = new LabelOperand();
    // Visit the condition.
    const test_register = this.allocateRegister();
    this.visitExpression(s.test, test_register);
    this.emit([Opcode.JumpIfFalse, test_register, else_label]);
    this.visitStatement(s.consequent);
    if (s.alternate) {
      const done_label = new LabelOperand();
      this.emit([Opcode.Jump, done_label]);

      this.bindLabel(else_label);
      this.visitStatement(s.alternate);
      this.bindLabel(done_label);
    } else {
      this.bindLabel(else_label);
    }
  }

  visitExpression(e : Ast.Expression, destination : number) {
    switch (e.type) {
      case "CallExpression":
        this.visitCallExpression(e as Ast.CallExpression, destination);
        break;
      case "BinaryExpression":
        this.visitBinaryExpression(e as Ast.BinaryExpression, destination);
        break;
      case "AssignmentExpression":
        this.visitAssignmentExpression(e as Ast.AssignmentExpression,
                                       destination);
        break;
      case "Literal":
        this.visitLiteral(e as Ast.Literal, destination);
        break;
      case "Identifier":
        this.visitVariable(e as Ast.Identifier, destination);
        break;
      default:
        this.throwError(e);
        break;
    }
  }

  visitVariable(id : Ast.Identifier, destination : number) {
    if (!this.variables.has(id.name)) this.throwError(id);
    const register = this.variables.get(id.name);
    this.emit([Opcode.Load, destination, register]);
  }

  visitLiteral(literal : Ast.Literal, destination : number) {
    if (typeof literal.value !== "number") this.throwError(literal);
    this.emit([Opcode.LoadInteger, destination, literal.value as number]);
  }

  visitCallExpression(e : Ast.CallExpression, destination : number) {
    // At the moment we only support calls to "print" with one argument.
    // Check that this is what we have here.
    if (e.callee.type !== "Identifier") this.throwError(e);
    const name = (e.callee as Ast.Identifier).name;
    // TODO(jarin) Should lookup in variables.
    if (!this.external.has(name)) {
      throw new Error(`Unknown function "${name}" (at ${e}).`);
    }
    const foreign = this.external.get(name);
    if (e.arguments.length !== foreign.parameter_count) {
      throw new Error(
        `Param count mismatch for function "${name}" (at ${e}).`);
    }
    const register = this.allocateRegisterRange(foreign.parameter_count);
    for (let i = 0; i < foreign.parameter_count; i++) {
      this.visitExpression(e.arguments[i] as Ast.Expression, register + i);
    }
    this.emit([Opcode.Call,
               destination,
               this.createConstant(foreign),
               register,
               foreign.parameter_count]);
    this.freeRegisterRange(register, foreign.parameter_count);
  }

  visitAssignmentExpression(e : Ast.AssignmentExpression,
                            destination : number) {
    if (e.operator !== "=") this.throwError(e);
    if (e.left.type !== "Identifier") this.throwError(e);
    const id = e.left as Ast.Identifier;
    if (!this.variables.has(id.name)) this.throwError(e);
    const register = this.variables.get(id.name);
    this.visitExpression(e.right, register);
  }

  visitBinaryExpression(e : Ast.BinaryExpression, destination : number) {
      // Visit the left operand, store the result in {destination}.
    const left = this.visitExpression(e.left, destination);
    // Allocate a new register for the right operand, and visit the operand.
    const rightRegister = this.allocateRegister();
    const right = this.visitExpression(e.right, rightRegister);
    // Emit bytecode for the actual operation.
    switch (e.operator) {
      case "+":
        this.emit([Opcode.Add, destination, destination, rightRegister]);
        break;
      case "-":
        this.emit([Opcode.Sub, destination, destination, rightRegister]);
        break;
      case "*":
        this.emit([Opcode.Mul, destination, destination, rightRegister]);
        break;
      case "/":
        this.emit([Opcode.Div, destination, destination, rightRegister]);
        break;
      case "==":
        this.emit([Opcode.TestEqual, destination, destination, rightRegister]);
        break;
      case "<":
        this.emit(
          [Opcode.TestLessThan, destination, destination, rightRegister]);
        break;
      case "<=":
        this.emit([Opcode.TestLessThanOrEqual,
                   destination,
                   destination,
                   rightRegister]);
        break;
      default:
        this.throwError(e);
    }
    // Free the register for the right operand. Note that we do not free
    // the register for the left operand because we used that for the
    // result.
    this.freeRegister(rightRegister);
  }
}

// Returns the address of the function object.
export function generate(program : Ast.Program,
                         external : Map<string, IForeignFunction>)
      : BytecodeArray {
  const ffi = new Map<string, SharedFunctionInfo>();
  for (const f of external) {
    ffi.set(f[0], new SharedFunctionInfo(f[0], f[1], f[1].parameter_count));
  }
  return new BytecodeGenerator(ffi).visitProgram(program);
}
