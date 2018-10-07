"use strict";

const fs = require("fs");

if (process.argv.length < 3) {
  console.error("Usage: object-gen.js <file0> <file1> ...");
  process.exit(1);
}

const scalarTypes = [ "int32", "tagged", "word" ];

const emptyLineRE = new RegExp("^(?://.*)?\\s*$");
const verbatimRE = new RegExp("^'''$");
const classRE =
  new RegExp("^\\s*class" +              // Leading whitespace + class.
             "\\s*(\\w+)" +              // Name.
             "\\s+" +                    // Whitespace.
             "(?:extends\\s+(\\w+))?" +  // Extends clause.
             "\\s*{\\s*$");              // Whitespace, open brace.
const classEndRE =  new RegExp("^\\s*}\\s*$");
const plainFieldRE =
  new RegExp("^\\s*" +                       // Leading whitespace.
             "(\\w+)" +                      // Name.
             "\\s*:\\s*" +                   // Colon, whitespace.
             "(\\w+)" +                      // Type.
             "(?:\\s+@offset\\s+(\\w+))?" +  // Optional offset.
             "\\s*$");                       // Whitespace, end.
const arrayFieldRE =
  new RegExp("^\\s*" +                       // Leading whitespace.
             "(\\w+)" +                      // Name.
             "\\s*:\\s*" +                   // Colon, whitespace.
             "(\\w+)" +                      // Type.
             "\\s*\\[\\s*(\\w+)\\s*]" +      // Length.
             "(?:\\s*@\\s*(\\w+))?" +        // Optional offset.
             "\\s*$");                       // Whitespace, end.

const typeSizes = new Map([
  [ "int32", "kInt32Size" ],
  [ "tagged", "kWordSize" ]
]);

const memSuffix = new Map([
  [ "int32", "Int32" ]
])

const sizeField = "objectSize";

function outputClass(def, defs, writeLn) {
  const extendsClause = `extends ${def.base || "HeapBase"} `;
  writeLn("");
  writeLn(`export class ${def.name} ${extendsClause}{`);

  let currentOffset = def.base ? `${def.base}.${sizeField}` : "0";

  for (const f of def.fields) {
    if (!currentOffset) {
      throw new Error(`Class ${def.name} has an array that is not last.`);
    }
    let s = `  static readonly ${f.name}Offset =\n    ${currentOffset};`;
    writeLn(s);
    switch (f.kind) {
      case "plain": {
        let size = typeSizes.get(f.type);
        if (!size) {
          // Not a primitive type, try to lookup in class definitions.
          if (!defs.has(f.type)) {
            throw new Error(`Unrecognized type ${f.type}`);
          }
          size = "kTaggedSize";
        }
        currentOffset = `${def.name}.${f.name}Offset + ${size}`;
        break;
      }
      case "array": {
        currentOffset = null;
        break;
      }
    }
  }
  if (currentOffset !== null) {
    writeLn(`  static readonly ${sizeField} =\n    ${currentOffset};`);
    typeSizes.set(def.name, `${def.name}.${sizeField}`);
  }

  writeLn("");
  writeLn("  constructor(view : DataView, address : number) {");
  writeLn("    super(view, address);")
  writeLn("  }")

  writeLn("");

  for (const f of def.fields) {
    switch (f.kind) {
      case "plain": {
        let suffix = memSuffix.get(f.type);
        let offset = `${def.name}.${f.name}Offset`;
        if (suffix) {
          writeLn(`  get ${f.name}() : number {\n` +
                  `    return this.baseGet${suffix}(${offset});\n  }`);
          writeLn(`  set ${f.name}(v : number) {\n` +
                  `    this.baseSet${suffix}(${offset}, v);\n  }`);
        } else if (f.type === "tagged") {
          writeLn(`  get ${f.name}() : TaggedValue {\n` +
                  `    return this.baseGetTagged(${offset});\n  }`);
          writeLn(`  set ${f.name}(v : TaggedValue) {\n` +
                  `    this.baseSetTagged(${offset}, v);\n  }`);
        } else if (defs.has(f.type)) {
          // TODO This must somehow cast to the right return type.
          writeLn(`  get ${f.name}() : ${f.type} {\n` +
                  `    return new ${f.type}(\n` +
                  `      this.baseDataView,\n` +
                  `      this.baseGetTaggedPointer(${offset}));\n  }`);
          writeLn(`  set ${f.name}(v : ${f.type}) {\n` +
                  `    this.baseSetTaggedPointer(${offset}, v.baseAddress);\n  }`);
        } else {
          console.log("UNKNOW");
        }
        break;
      }
      case "array": {
        let suffix = memSuffix.get(f.type);
        let offset = `${def.name}.${f.name}Offset + i`;
        if (suffix) {
          writeLn(`  ${f.name}Get(i : number) : number {\n` +
                  `    return this.baseGet${suffix}(${offset});\n  }`)
          writeLn(`  ${f.name}Set(i : number, v : number) {\n` +
                  `    this.baseSet${suffix}(${offset}, v);\n  }`)
        } else if (f.type === "tagged") {
          writeLn(`  ${f.name}Get(i : number) : TaggedValue {\n` +
                  `    return this.baseGetTagged(${offset});\n  }`)
          writeLn(`  ${f.name}Set(i : number, v : TaggedValue) {\n` +
                  `    this.baseSetTagged(${offset}, v);\n  }`)
        } else if (defs.has(f.type)) {
          // TODO This must somehow cast to the right return type.
          writeLn(`  ${f.name}Get(i : number) : ${f.type} {\n` +
                  `    return this.baseGetTagged(${offset});\n  }`)
          writeLn(`  ${f.name}Set(i : number, v : ${f.type}) {\n` +
                  `    this.baseSetTagged(${offset}, v);\n  }`)
        } else {
          console.log("UNKNOW");
        }
        break;
      }
    }
  }

  writeLn("}");
}

function processVerbatim(nextLine, defs) {
  let l = nextLine();
  while (!l.match(verbatimRE)) {
    defs.set(Symbol("verbatim"), l);
    l = nextLine();
  }
}

function processStruct(header, nextLine, defs) {
  const m = header.match(classRE);
  if (!m) throw Error(`Could not match header '${header}'`);

  let def = { name : m[1], base : m[2], fields : [] };

  let l = nextLine();
  for (; l && !l.match(classEndRE); l = nextLine()) {
    const plain_match = l.match(plainFieldRE);
    if (plain_match !== null) {
      def.fields.push({
        kind : "plain",
        name : plain_match[1],
        type : plain_match[2],
        offset : plain_match[3]
      });
      continue;
    }
    const array_match = l.match(arrayFieldRE);
    if (array_match !== null) {
      def.fields.push({
        kind : "array",
        name : array_match[1],
        type : array_match[2],
        size : array_match[3]
      });
      continue;
    }
    throw new Error(`Unrecognized field line '${l}'`);
  }
  if (!l) throw new Error("Unexpected end of file");

  defs.set(def.name, def);
}

for (let i = 2; i < process.argv.length; i++) {
  const lines = fs.readFileSync(process.argv[i], "utf8").split("\n");
  let j = 0;

  const defs = new Map();

  function nextLine(skipEmpty = true) {
    while (j < lines.length) {
      if (skipEmpty && lines[j].match(emptyLineRE)) {
        j++;
      } else {
        break;
      }
    }
    if (j < lines.length) {
      return lines[j++];
    }
    return null;
  }

  while (j < lines.length) {
    const header = nextLine();
    if (header !== null) {
      if (header.match(verbatimRE)) {
        processVerbatim(nextLine, defs);
      } else {
        processStruct(header, nextLine, defs);
      }
    }
  }

  for (const d of defs.values()) {
    if (typeof d === "string") {
      console.log(d);
    } else {
      outputClass(d, defs, console.log);
    }
  }
}
