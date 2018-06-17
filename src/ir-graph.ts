import * as assert from "assert";

export class Graph {
    entry : GraphStartBlock;
    exit : BasicBlock;
    nextBlockId : number = 0;
    nextNodeId : number = 0;

    constructor(parameter_count : number) {
        this.entry = new GraphStartBlock(parameter_count, this);
        this.exit = new BasicBlock(this);
        this.entry.addSuccessor(this.exit);
        this.exit = this.entry;
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
    kJSAdd,
    kJSSub,
    kNumberConstant,

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
        if (this.inputs.length > 0) {
            s += `${this.inputs[0].id} `;
            for (let i = 1; i < this.inputs.length; i++) {
                s += `,${this.inputs[i].id} `;
            }
        }
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

export class BasicBlock {
    id : number;
    graph : Graph;
    successors : BasicBlock[];
    predecessors : BasicBlock[];
    nodes : Node[];

    constructor(graph : Graph) {
        this.graph = graph;
        this.id = graph.getNextBlockId();
    }

    appendNode(node : Node) {
        node.setId(this.graph.getNextNodeId());
        this.nodes.push(node);
    }

    addSuccessor(successor : BasicBlock) {
        this.successors.push(successor);
        successor.predecessors.push(this);
    }

    blockListToString(l : BasicBlock[]) {
        return l.map((b : BasicBlock) => "B" + b.id).join(", ");
    }

    print() {
        let s = `  Block ${this.id}`;
        if (this.predecessors.length > 0) {
            s += ` (preds: B${this.blockListToString(this.predecessors)})`;
        }
        if (this.successors.length > 0) {
            s += ` (preds: B${this.blockListToString(this.successors)})`;
        }
        console.log(s);
        for (const n of this.nodes) {
            console.log(`    ${n.toString()}`);
        }
    }
}

export class GraphStartBlock extends BasicBlock {
    parameters : Node[];
    undefinedConstant : Node;

    constructor(parameter_count : number, graph : Graph) {
        super(graph);
        for (let i = 0; i < parameter_count; i++) {
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
