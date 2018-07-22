import * as assert from "assert";

export class Graph {
    entry : GraphStartBlock;
    exit : BasicBlock;
    nextBlockId : number = 0;
    nextNodeId : number = 0;

    constructor(parameterCount : number) {
        this.entry = new GraphStartBlock(parameterCount, this);
        this.exit = new BasicBlock(this);
        this.entry.addSuccessor(this.exit);
    }

    getNextBlockId() : number {
        return this.nextBlockId++;
    }

    getNextNodeId() : number {
        return this.nextNodeId++;
    }

    print() {
        const visited = new Set<BasicBlock>();
        const reverse : BasicBlock[] = [];
        function addBlocks(b : BasicBlock) {
            visited.add(b);
            for (const successor of b.successors) {
                if (!visited.has(successor)) {
                    addBlocks(successor);
                }
            }
            reverse.push(b);
        }
        addBlocks(this.entry);
        for (let i = reverse.length - 1; i >= 0; i--) {
            reverse[i].print();
        }
    }
}

export enum Opcode {
    kPhi,

    kParameter,
    kNumberConstant,

    // Binary operations.
    kJSAdd,
    kJSSub,
    kJSMul,
    kJSDiv,
    kJSTestEqual,
    kJSTestLessThan,
    kJSTestLessThanOrEqual,

    // Control opcodes.
    kGoto,
    kBranch,
    kReturn,
}

export class Node {
  static invalidId : number = -1;
  id : number = Node.invalidId;
  opcode : Opcode;
  inputs : Node[];

  constructor(opcode : Opcode, ...inputs : Node[]) {
    this.opcode = opcode;
    this.inputs = inputs;
  }

  setId(id : number) {
    assert.strictEqual(this.id, Node.invalidId);
    this.id = id;
  }

  debugDataString() : string {
    return "";
  }

  toString() {
    let s = `${this.id}: ${Opcode[this.opcode]}${this.debugDataString()}: `;
    s += this.inputs.map((n : Node) => n.id).join(", ");
    return s;
  }
}

export class ParameterNode extends Node {
    index : number;

    constructor(i : number) {
        super(Opcode.kParameter);
        this.index = i;
    }

    debugDataString() : string {
        return `[${this.index}]`;
    }
}

export class NumberConstantNode extends Node {
  n : number;

  constructor(n : number) {
    super(Opcode.kNumberConstant);
    this.n = n;
  }

  debugDataString() : string {
    return `[${this.n}]`;
  }
}

export class BinopNode extends Node {
  constructor(opcode : Opcode, left : Node, right : Node) {
    super(opcode, left, right);
  }
}

export class ReturnNode extends Node {
  constructor(value : Node) {
    super(Opcode.kReturn, value);
  }
}

export class BranchNode extends Node {
  constructor(condition : Node) {
    super(Opcode.kBranch, condition);
  }
}

export class PhiNode extends Node {
  constructor(value : Node) {
    super(Opcode.kPhi, value);
  }

  appendInput(n : Node) {
    this.inputs.push(n);
  }
}

export class BasicBlock {
    id : number;
    orderIndex : number = -1;
    containingLoop : BasicBlock = null;

    graph : Graph;

    successors : BasicBlock[] = [];
    predecessors : BasicBlock[] = [];
    nodes : Node[] = [];

    isLoopHeader : boolean = false;

    constructor(graph : Graph, isLoopHeader : boolean = false) {
        this.graph = graph;
        this.id = graph.getNextBlockId();
        this.isLoopHeader = isLoopHeader;
    }

    containsPhi(phi : Node) : boolean {
      for (const n of this.nodes) {
        if (n === phi) return true;
        if (n.opcode !== Opcode.kPhi) break;
      }
      return false;
    }

    appendNode(node : Node) {
        node.setId(this.graph.getNextNodeId());
        this.nodes.push(node);
    }

    addSuccessor(successor : BasicBlock) {
        this.successors.push(successor);
        successor.predecessors.push(this);
    }

    removeSuccessor(successor : BasicBlock) {
      const successorIndex = this.successors.indexOf(successor);
      assert.notStrictEqual(successorIndex, -1);
      this.successors.splice(successorIndex, 1);

      const predecessorIndex = successor.predecessors.indexOf(this);
      assert.notStrictEqual(predecessorIndex, -1);
      successor.predecessors.splice(predecessorIndex, 1);
    }

    blockListToString(l : BasicBlock[]) {
        return l.map((b : BasicBlock) => "B" + b.id).join(", ");
    }

    print() {
        let s = `  Block ${this.id}`;
        if (this.predecessors.length > 0) {
            s += ` (preds: ${this.blockListToString(this.predecessors)})`;
        }
        if (this.successors.length > 0) {
            s += ` (succ: ${this.blockListToString(this.successors)})`;
        }
        if (this.isLoopHeader) {
            s += ` (loop)`;
        }
        console.log(s);
        for (const n of this.nodes) {
            console.log(`    ${n.toString()}`);
        }
    }
}

export class GraphStartBlock extends BasicBlock {
    parameters : Node[] = [];
    undefinedConstant : Node;

    constructor(parameterCount : number, graph : Graph) {
        super(graph);
        for (let i = 0; i < parameterCount; i++) {
            const p = new ParameterNode(i);
            this.parameters.push(p);
            this.appendNode(p);
        }
        // TODO Fix to actual undefined!
        this.undefinedConstant = new NumberConstantNode(0);
        this.appendNode(this.undefinedConstant);
    }

    getParameter(i : number) : Node {
        return this.parameters[i];
    }

    getUndefinedConstant() : Node {
        return this.undefinedConstant;
    }
}
