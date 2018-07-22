import * as assert from "assert";
import * as Ast from "estree";
import { Opcode } from "./bytecode";
import * as Bytecode from "./bytecode";
import { BytecodeArray,
         IForeignFunction,
         printBytecodeArray,
         printSharedFunctionInfo,
         SharedFunctionInfo } from "./function";
import * as Interpreter from "./interpreter";
import { VMConfig } from "./vm-config";

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

interface IFunctionToCompile {
  shared : SharedFunctionInfo;
  declaration : Ast.FunctionDeclaration;
}

class BytecodeGenerator {
  bytecodes : number[] = [];
  constants : SharedFunctionInfo[] = [];
  external : Map<string, SharedFunctionInfo>;
  variables = new Map<string, number | SharedFunctionInfo>();
  // Register 0 is reserved for caller frame pointer,
  // Register 1 is reserved for shared function info.
  localCount : number = Bytecode.fixedSlotCount;
  functionsToCompile : IFunctionToCompile[];

  constructor(ffi : Map<string, SharedFunctionInfo>,
              functionsToCompile : IFunctionToCompile[]) {
    this.external = ffi;
    this.functionsToCompile = functionsToCompile;
  }

  allocateLocalVariable() : number {
    const index = this.localCount;
    this.localCount++;
    return index;
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
  throwError(n : Ast.Node, s? : string) : never {
    if (!s) s = "Unsupported Ast node of type " + n.type;
    throw new Error(`${n.loc.start.line}:${n.loc.start.column}: ${s}`);
  }

  // Entry point for generating bytecodes for the program.
  compileProgram(program : Ast.Program) : BytecodeArray {
    this.visitStatementList(program.body);
    return new BytecodeArray(this.bytecodes, this.localCount,
                             this.constants);
  }

  // Entry point for generating bytecodes for a function.
  compileFunction(f : IFunctionToCompile) : SharedFunctionInfo {
    // TODO add the variables to the scope.
    this.defineArguments(f.declaration.params);
    this.visitStatementList(f.declaration.body.body);
    // TODO Return undefined rather than 0 here.
    this.emit([Opcode.LoadInteger, 0]);
    this.emit([Opcode.Return]);
    const bytecodeArray = new BytecodeArray(
        this.bytecodes, this.localCount, this.constants);
    f.shared.bytecode = bytecodeArray;
    return f.shared;
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
      case "FunctionDeclaration":
        this.visitFunctionDeclaration(s as Ast.FunctionDeclaration);
        break;
      case "ExpressionStatement":
        const expression = (s as Ast.ExpressionStatement).expression;
        this.visitExpression(expression);
        this.emit([Opcode.Drop]);
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
      case "ReturnStatement":
        this.visitReturnStatement(s as Ast.ReturnStatement);
        break;
      default:
        this.throwError(s);
        break;
    }
  }

  defineArguments(params : Ast.Pattern[]) {
    const indexArg0 = - params.length;
    for (let i = 0; i < params.length; i++) {
      if (params[i].type !== "Identifier") {
        this.throwError(params[i],
          `Non-identifier parameters not supported.`);
      }
      const p = params[i] as Ast.Identifier;
      this.variables.set(p.name, indexArg0 + i);
    }
  }

  // Helper for defining variables. It allocates a local for the
  // variable.
  defineVariable(n : Ast.Node, name : string) : number {
    let variableIndex;
    if (this.variables.has(name)) {
      // If the variable name already exists, let us use it.
      // TODO Remove this check as soon as we can assign functions
      // to locals.
      if (typeof variableIndex !== "number") {
        this.throwError(n, `Variable ${name} duplicated as a function.`);
      }
      variableIndex = this.variables.get(name) as number;
    } else {
      // Otherwise, allocate a fresh register for the variable.
      variableIndex = this.allocateLocalVariable();
      this.variables.set(name, variableIndex);
    }
    return variableIndex;
  }

  visitFunctionDeclaration(d : Ast.FunctionDeclaration) {
    if (d.id.type !== "Identifier") this.throwError(d.id);
    const id = d.id as Ast.Identifier;
    const name = id.name;
    if (this.variables.has(name)) {
      // TODO this should not be an error.
      this.throwError(d, `Duplicate var name ${name}`);
    }
    const shared = new SharedFunctionInfo(name, undefined, d.params.length);
    this.functionsToCompile.push({ shared, declaration : d });
    this.variables.set(name, shared);
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
      const localIndex = this.defineVariable(id, id.name);
      // If init is not defined, we should store 'undefined'.
      this.visitExpression(d.init);
      this.emit([Opcode.StoreLocal, localIndex]);
    }
  }

  visitWhileStatement(s : Ast.WhileStatement) {
    const loop = new LabelOperand();
    this.bindLabel(loop);
    this.emit([Opcode.LoopHeader]);
    // Visit the condition.
    this.visitExpression(s.test);
    const done = new LabelOperand();
    this.emit([Opcode.JumpIfFalse, done]);
    this.visitStatement(s.body);
    this.emit([Opcode.JumpLoop, loop]);
    this.bindLabel(done);
  }

  visitIfStatement(s : Ast.IfStatement) {
    const elseLabel = new LabelOperand();
    // Visit the condition.
    this.visitExpression(s.test);
    this.emit([Opcode.JumpIfFalse, elseLabel]);
    this.visitStatement(s.consequent);
    if (s.alternate) {
      const doneLabel = new LabelOperand();
      this.emit([Opcode.Jump, doneLabel]);
      this.bindLabel(elseLabel);
      this.visitStatement(s.alternate);
      this.bindLabel(doneLabel);
    } else {
      this.bindLabel(elseLabel);
    }
  }

  visitReturnStatement(s : Ast.ReturnStatement) {
    // Visit the return value.
    if (s.argument) {
      this.visitExpression(s.argument);
    } else {
      // TODO should return undefined here.
      this.emit([Opcode.LoadInteger, 0]);

    }
    this.emit([Opcode.Return]);
  }

  visitExpression(e : Ast.Expression) {
    switch (e.type) {
      case "CallExpression":
        this.visitCallExpression(e as Ast.CallExpression);
        break;
      case "BinaryExpression":
        this.visitBinaryExpression(e as Ast.BinaryExpression);
        break;
      case "AssignmentExpression":
        this.visitAssignmentExpression(e as Ast.AssignmentExpression);
        break;
      case "Literal":
        this.visitLiteral(e as Ast.Literal);
        break;
      case "Identifier":
        this.visitVariable(e as Ast.Identifier);
        break;
      default:
        this.throwError(e);
        break;
    }
  }

  visitVariable(id : Ast.Identifier) {
    if (!this.variables.has(id.name)) this.throwError(id);
    const localIndex = this.variables.get(id.name);
    if (typeof localIndex !== "number") {
      // TODO Should not be an error.
      this.throwError(id, `Variable ${name} duplicated as a function.`);
    }
    this.emit([Opcode.LoadLocal, localIndex as number]);
  }

  visitLiteral(literal : Ast.Literal) {
    if (typeof literal.value !== "number") this.throwError(literal);
    this.emit([Opcode.LoadInteger, literal.value as number]);
  }

  visitCallExpression(e : Ast.CallExpression) {
    // At the moment, we only support calls to fixed functions.
    // Check that we only have identifier here.
    if (e.callee.type !== "Identifier") this.throwError(e);
    const name = (e.callee as Ast.Identifier).name;
    // TODO(jarin) Should lookup in variables.
    let target;
    if (this.external.has(name)) {
      target = this.external.get(name);
    } else if (this.variables.has(name)) {
      const targetVar = this.variables.get(name);
      if (targetVar instanceof SharedFunctionInfo) {
        target = targetVar as SharedFunctionInfo;
      } else {
        this.throwError(e, `Unknown function "${name}".`);
      }
    } else {
      this.throwError(e, `Unknown function "${name}".`);
    }
    // TODO(jarin) Argument adaptation?
    if (e.arguments.length !== target.parameterCount) {
      this.throwError(e,
        `Param count mismatch for function "${name}".`);
    }
    for (let i = 0; i < target.parameterCount; i++) {
      this.visitExpression(e.arguments[i] as Ast.Expression);
    }
    this.emit([Opcode.Call,
               this.createConstant(target),
               target.parameterCount]);
  }

  visitAssignmentExpression(e : Ast.AssignmentExpression) {
    if (e.operator !== "=") this.throwError(e);
    if (e.left.type !== "Identifier") this.throwError(e);
    const id = e.left as Ast.Identifier;
    if (!this.variables.has(id.name)) this.throwError(e);
    const localIndex = this.variables.get(id.name);
    if (typeof localIndex !== "number") {
      this.throwError(e, `Cannot assign to function ${name}.`);
    }
    this.visitExpression(e.right);
    this.emit([Opcode.Dup]);
    this.emit([Opcode.StoreLocal, localIndex as number]);
  }

  visitBinaryExpression(e : Ast.BinaryExpression) {
    this.visitExpression(e.left);
    this.visitExpression(e.right);
    // Emit bytecode for the actual operation.
    switch (e.operator) {
      case "+":
        this.emit([Opcode.Add]);
        break;
      case "-":
        this.emit([Opcode.Sub]);
        break;
      case "*":
        this.emit([Opcode.Mul]);
        break;
      case "/":
        this.emit([Opcode.Div]);
        break;
      case "==":
        this.emit([Opcode.TestEqual]);
        break;
      case "<":
        this.emit([Opcode.TestLessThan]);
        break;
      case "<=":
        this.emit([Opcode.TestLessThanOrEqual]);
        break;
      default:
        this.throwError(e);
    }
  }
}

// Returns the address of the function object.
export function generate(program : Ast.Program,
                         memory : WebAssembly.Memory,
                         config : VMConfig)
      : BytecodeArray {
  // We bake the stack into various trampolines in SharedFunctionInfo.
  const stack = new Float64Array(memory.buffer);

  // Turn the ffi functions to SharedFunctionInfos.
  const ffi = new Map<string, SharedFunctionInfo>();
  for (const f of config.ffi) {
    const foreign = f[1];
    // Create a trampoline that reads the arguments out from the stack
    // and passes them to the foreign function.
    const trampoline = (framePtr : number) : number => {
      const args = [];
      for (let i = 0; i < f[1].parameter_count; i++) {
        args.push(stack[framePtr - 1 - i]);
      }
      return foreign.fn(...args);
    };
    // Create the shared function info object and set its code object
    // to the trampoline.
    const shared = new SharedFunctionInfo(f[0], null, f[1].parameter_count);
    shared.code = trampoline;
    ffi.set(f[0], shared);
  }

  const functions : IFunctionToCompile[] = [];

  // Compile the top level code.
  const toplevelGenerator = new BytecodeGenerator(ffi, functions);
  const result = toplevelGenerator.compileProgram(program);
  if (config.flags.printBytecode) {
    console.log("Top level code:");
    printBytecodeArray(result);
  }

  // Compile inner functions.
  while (functions.length > 0) {
    const generator = new BytecodeGenerator(ffi, functions);
    const f = generator.compileFunction(functions.pop());
    f.code = (framePtr : number) => {
      return Interpreter.execute(stack, memory, framePtr, f, config.flags);
    };
    if (config.flags.printBytecode) {
      printSharedFunctionInfo(f);
    }
  }
  return result;
}
