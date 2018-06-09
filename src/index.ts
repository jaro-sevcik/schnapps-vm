import * as fs from "fs";
import * as process from "process";
import { VirtualMachine } from "./vm";
import { IVMConfig } from "./vm-config";

const config : IVMConfig = {
  printBytecode : false,
  ffi : new Map([
    ["print", {
                fn : (a : number) => { console.log(a); return 0; },
                parameter_count : 1,
              }]]),
};

let file : string | undefined;

for (let i = 2; i < process.argv.length; i++) {
  const p = process.argv[i];
  if (process.argv[i].startsWith("--")) {
    switch (process.argv[i]) {
      case "--print-bytecode":
        config.printBytecode = true;
        break;
      default:
        console.error(`Unsupported switch ${p}.`);
        process.exit(1);
        break;
    }
  } else {
    if (file) {
      console.error(`Only one JS file can be specified.`);
      process.exit(1);
    }
    file = p;
  }
}

if (!file) {
  console.error(`Only one JS file can be specified.`);
  process.exit(1);
}

fs.readFile(file, "utf8", (err : any, contents : string) => {
  if (err != null) {
    console.error('Could not read file "' + file + '".');
    process.exit(1);
  }
  const jsvm = new VirtualMachine();
  jsvm.execute(contents, config);
});
