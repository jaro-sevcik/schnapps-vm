import * as assert from "assert";
import * as Ast from "estree";
import { Opcode } from "./bytecode";

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

  // Rudimentary error handling.
  throwError(n : Ast.Node) {
    console.error("Unsupported Ast node of type " + n.type);
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
    this.bytecodes.push(Opcode.LoadInteger);
    this.bytecodes.push(register);
    this.bytecodes.push(init);
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

  visitExpression(e : Ast.Expression, destination : number) {
    switch (e.type) {
      case "CallExpression":
        this.visitCallExpression(e as Ast.CallExpression, destination);
        break;
      case "BinaryExpression":
        this.visitBinaryExpression(e as Ast.BinaryExpression, destination);
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
    this.bytecodes.push(Opcode.Load, destination, register);
  }

  visitLiteral(literal : Ast.Literal, destination : number) {
    if (typeof literal.value !== "number") this.throwError(literal);
    this.bytecodes.push(
        Opcode.LoadInteger, destination, literal.value as number);
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
    this.bytecodes.push(Opcode.Print, register);
    this.freeRegister(register);
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
        this.bytecodes.push(
            Opcode.Add, destination, destination, rightRegister);
        break;
      case "-":
        this.bytecodes.push(
            Opcode.Sub, destination, destination, rightRegister);
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
