import { VirtualMachine } from "./vm";

test("run_print_42", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("print(42)", (s) => { out += s; });
    expect(out).toBe("42");
});

test("run_print_plus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("print(42 + 1)", (s) => { out += s; });
    expect(out).toBe("43");
});

test("run_print_var", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; print(x)", (s) => { out += s; });
    expect(out).toBe("42");
});

test("run_print_var_plus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; print(2 + x)", (s) => { out += s; });
    expect(out).toBe("44");
});

test("run_print_var_minus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; print(2 - x)", (s) => { out += s; });
    expect(out).toBe("-40");
});

test("run_print_var_times", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; print(2 * x)", (s) => { out += s; });
    expect(out).toBe("84");
});

test("run_print_var_div", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; print(84 / x)", (s) => { out += s; });
    expect(out).toBe("2");
});

test("run_print_var_var_plus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; var y = 1; print(y + x)",
               (s) => { out += s; });
    expect(out).toBe("43");
});

test("run_print_eq_plus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 2; print((x == 1) + 0)",
               (s) => { out += s; });
    expect(out).toBe("0");
});

test("run_print_eq_plus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 1; print((x == 1) + 0)",
               (s) => { out += s; });
    expect(out).toBe("1");
});
