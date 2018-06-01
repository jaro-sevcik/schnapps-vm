import * as assert from "assert";
import * as Ast from "estree";
import { Opcode } from "./bytecode";

class Label {
  static Bound(offset : number) : Label {
    const l : Label = new Label();
    l.offset = offset;
    return l;
  }

  offset? : number;
  patchPositions : number[] = [];
}

const unboundLabelSentinel = -123;

class BytecodeGenerator {
  bytecodes : number[];
  variables = new Map<string, number>();
  liveRegisterCount : number;

  constructor() {
    this.bytecodes = [];
    this.liveRegisterCount = 0;
  }

  // Register management. We allocate register stack machine style.
  allocateRegister() : number {
    return this.liveRegisterCount++;
  }

  freeRegister(register : number) {
    this.liveRegisterCount--;
    assert.strictEqual(this.liveRegisterCount, register);
  }

  createLoopLabel() : Label {
    return new Label();
  }

  bindLabel(l : Label) {
    assert.strictEqual(l.offset, undefined);
    const currentOffset = this.bytecodes.length;
    for (const p of l.patchPositions) {
      assert.strictEqual(this.bytecodes[p], unboundLabelSentinel);
      this.bytecodes[p] = currentOffset;
    }
    l.offset = currentOffset;
    l.patchPositions.length = 0;
  }

  pushLabel(l : Label) {
    if (l.offset === undefined) {
      l.patchPositions.push(this.bytecodes.length);
      this.bytecodes.push(unboundLabelSentinel);
    } else {
      this.bytecodes.push(l.offset);
    }
  }

  emit(sequence : Array<number | Label>) {
    for (const b of sequence) {
      if (b instanceof Label) {
        this.pushLabel(b as Label);
      } else {
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
  visitProgram(program : Ast.Program) : number[] {
    this.visitStatementList(program.body);
    return this.bytecodes;
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
        this.visitExpression(expression, null);
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
    const loop = new Label();
    this.bindLabel(loop);
    // Visit the condition.
    const test_register = this.allocateRegister();
    this.visitExpression(s.test, test_register);
    const done = new Label();
    this.emit([Opcode.JumpIfFalse, test_register, done]);
    this.visitStatement(s.body);
    this.emit([Opcode.JumpLoop, loop]);
    this.bindLabel(done);
  }

  visitIfStatement(s : Ast.IfStatement) {
    const else_label = new Label();
    // Visit the condition.
    const test_register = this.allocateRegister();
    this.visitExpression(s.test, test_register);
    this.emit([Opcode.JumpIfFalse, test_register, else_label]);
    this.visitStatement(s.consequent);
    if (s.alternate) {
      const done_label = new Label();
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
    if (name !== "print") this.throwError(e);
    if (e.arguments.length !== 1) this.throwError(e);
    const register = this.allocateRegister();
    this.visitExpression(e.arguments[0] as Ast.Expression, register);
    this.emit([Opcode.Print, register]);
    this.freeRegister(register);
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
export function generate(program : Ast.Program) : number[] {
  return new BytecodeGenerator().visitProgram(program);
}
