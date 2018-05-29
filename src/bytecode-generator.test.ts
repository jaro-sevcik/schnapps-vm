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

test("run_print_var_var_plus", () => {
    const vm = new VirtualMachine();
    let out = "";
    vm.execute("var x = 42; var y = 1; print(y + x)",
               (s) => { out += s; });
    expect(out).toBe("43");
});
