import { IForeignFunction } from "./../function";
import { VirtualMachine } from "./../vm";
import { VMConfig } from "./../vm-config";

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

test("run_while_if", () => {
  const vm = new VirtualMachine();
  const config = new TestConfig(false);
  vm.execute(`function f(x) {
                  if (x < 200) return x + 1;
                  else return x + 2;
              }
              var i = 0;
              var j = 0;
              while (i < 600) {
                  i = f(i);
                  j = j + 2;
              }
              print(j);`, config);

  expect(config.out).toBe("800");
});

test("run_while_if2", () => {
  const vm = new VirtualMachine();
  const config = new TestConfig(false);
  vm.execute(`function f(x) {
                  if (x < 200) return x + 1;
                  else if (x < 400) return x + 5;
                  else return x + 2;
              }
              var i = 0;
              var j = 0;
              while (i < 600) {
                  i = f(i);
                  j = j + 2;
              }
              print(j);`, config);

  expect(config.out).toBe("680");
});

test("run_test_if_phi", () => {
  const vm = new VirtualMachine();
  const config = new TestConfig(false);
  vm.execute(`function f(x) {
                  var r = 0;
                  if (x < 200) r = x + 1;
                  else return r = x + 2;
                  return r;
              }
              var i = 0;
              var j = 0;
              while (i < 600) {
                  i = f(i);
                  j = j + 2;
              }
              print(j);`, config);

  expect(config.out).toBe("800");
});
