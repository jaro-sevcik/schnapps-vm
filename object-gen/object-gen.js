"use strict";

const fs = require("fs");

console.log(process.argv.length)
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

const sizeField = "size_";

function outputClass(def, defs, writeLn) {
  const extendsClause = `extends ${def.base || "HeapBase"} `;
  writeLn("");
  writeLn(`class ${def.name} ${extendsClause}{`);

  let currentOffset = def.base ? `${def.base}.${sizeField}` : "0";

  for (const f of def.fields) {
    if (!currentOffset) {
      throw new Error(`Class ${def.name} has an array that is not last.`);
    }
    let s = `  static const ${f.name}Offset = ${currentOffset};`;
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
        currentOffset = `${f.name}Offset + ${size}`;
        break;
      }
      case "array": {
        currentOffset = null;
        break;
      }
    }
  }
  if (currentOffset !== null) {
    writeLn(`  static const ${sizeField} = ${currentOffset};`);
    typeSizes.set(def.name, `${def.name}.${sizeField}`);
  }

  for (const f of def.fields) {
    switch (f.kind) {
      case "plain": {
        let suffix = memSuffix.get(f.type);
        if (suffix) {
          writeLn(`  get ${f.name}() : number { ` + 
                  `return view_.get${suffix}(this.address_); }`)
          writeLn(`  set ${f.name}(v : number) { ` +
                  `return view_.set${suffix}(this.address_, v); }`)
        } else if (f.type === "tagged") {
          writeLn(`  get ${f.name}() : JSValue { ` + 
                  `return view_.get${suffix}(this.address_); }`)
          writeLn(`  set ${f.name}(v : JSValue) { ` +
                  `return view_.set${suffix}(this.address_, v); }`)
        } else if (defs.has(f.type)) {
          writeLn(`  get ${f.name}() : ${f.type} { ` + 
                  `return view_.get${suffix}(this.address_); }`)
          writeLn(`  set ${f.name}(v : ${f.type}) { ` +
                  `return view_.set${suffix}(this.address_, v); }`)          
        } else {
          console.log("UNKNOW");
        }
        break;
      }
      case "array": {
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
