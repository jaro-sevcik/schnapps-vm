import * as fs from "fs";
import * as process from "process";
import { VirtualMachine } from "./vm";


if (process.argv.length !== 3) {
  console.log("One argument expected");
  process.exit(1);
}

const file = process.argv[2];

fs.readFile(file, "utf8", (err : any, contents : string) => {
  if (err != null) {
    console.error('Could not read file "' + file + '".');
    process.exit(1);
  }
  const jsvm = new VirtualMachine();
  jsvm.execute(contents, console.log);
});
