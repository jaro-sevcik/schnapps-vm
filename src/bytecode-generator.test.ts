import { IVMConfig, VirtualMachine } from "./vm";

class TestConfig implements IVMConfig {
    out = "";
    printBytecode = false;
    printerFunction = (s : string) => { this.out += s; };
}

test("run_print_42", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("print(42)", config);
    expect(config.out).toBe("42");
});

test("run_print_plus", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("print(42 + 1)", config);
    expect(config.out).toBe("43");
});

test("run_print_var", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 42; print(x)", config);
    expect(config.out).toBe("42");
});

test("run_print_var_plus", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 42; print(2 + x)", config);
    expect(config.out).toBe("44");
});

test("run_print_var_minus", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 42; print(2 - x)", config);
    expect(config.out).toBe("-40");
});

test("run_print_var_times", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 42; print(2 * x)", config);
    expect(config.out).toBe("84");
});

test("run_print_var_div", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 42; print(84 / x)", config);
    expect(config.out).toBe("2");
});

test("run_print_var_var_plus", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 42; var y = 1; print(y + x)",
               config);
    expect(config.out).toBe("43");
});

test("run_print_not_eq_plus", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 2; print((x == 1) + 0)",
               config);
    expect(config.out).toBe("0");
});

test("run_print_eq_plus", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 1; print((x == 1) + 0)",
               config);
    expect(config.out).toBe("1");
});

test("run_print_assign", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute("var x = 1; x = x + 1; print(x)",
               config);
    expect(config.out).toBe("2");
});

test("run_while2", () => {
    const vm = new VirtualMachine();
    const config = new TestConfig();
    vm.execute(`var i = 0; var s = 0;
                while (i < 10) {
                    i = i + 1;
                    s = s + 2;
                }
                print(s);
               `, config);
    expect(config.out).toBe("2");
});
