import { IForeignFunction } from "src/function";
import { VirtualMachine } from "src/vm";
import { VMConfig } from "src/vm-config";

class TestConfig extends VMConfig {
    out = "";
    ffi : Map<string, IForeignFunction>;

    constructor(printBytecode = false) {
        super(new Map([
            ["print", {
                        fn : (a : number) => { this.out += a; return 0; },
                        parameter_count : 1,
                      }]]));
        this.flags.printBytecode = printBytecode;
    }

    printerFunction = (s : string) => { this.out += s; };
}

test("run_while_add", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig(false);
    vm.execute(`function f(x) {
                    return x + 1;
                }
                var i = 0;
                var j = 0;
                while (i < 1000) {
                    i = f(i);
                    j = j + 2;
                }
                print(j);`, config);

    expect(config.out).toBe("2000");
});
