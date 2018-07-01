import * as CG from "./../compiler/code-generator";
import * as IR from "./../compiler/ir-graph";

test("simple_order", () => {
  const g = new IR.Graph(1);
  const order = CG.computeBlockOrderForTesting(g.entry);
  expect(order.reverse()).toEqual([g.entry, g.exit]);
});

test("simple_order_2", () => {
  const g = new IR.Graph(1);

  g.entry.removeSuccessor(g.exit);

  const bb = new IR.BasicBlock(g);

  g.entry.addSuccessor(bb);
  bb.addSuccessor(g.exit);

  const order = CG.computeBlockOrderForTesting(g.entry);
  expect(order.reverse()).toEqual([g.entry, bb, g.exit]);
});

test("simple_conditional", () => {
  const g = new IR.Graph(1);

  g.entry.removeSuccessor(g.exit);

  const bb = new IR.BasicBlock(g);
  const t = new IR.BasicBlock(g);
  const f = new IR.BasicBlock(g);

  g.entry.addSuccessor(bb);
  bb.addSuccessor(t);
  bb.addSuccessor(f);
  t.addSuccessor(g.exit);
  f.addSuccessor(g.exit);

  const order = CG.computeBlockOrderForTesting(g.entry);
  // This over-constraining the order - it would be still correct
  // if f and t would be swapped.
  expect(order.reverse()).toEqual([g.entry, bb, f, t, g.exit]);
});

test("simple_loop_exit_true", () => {
  const g = new IR.Graph(1);

  g.entry.removeSuccessor(g.exit);

  const l = new IR.BasicBlock(g);
  const t = new IR.BasicBlock(g);
  const f = new IR.BasicBlock(g);

  console.log(`entry: ${g.entry.id}`);
  console.log(`exit: ${g.exit.id}`);
  console.log(`l: ${l.id}`);
  console.log(`t: ${t.id}`);
  console.log(`f: ${f.id}`);

  g.entry.addSuccessor(l);
  l.addSuccessor(t);
  l.addSuccessor(f);
  t.addSuccessor(g.exit);
  f.addSuccessor(l);

  const order = CG.computeBlockOrderForTesting(g.entry);
  expect(l.containingLoop).toBeNull();
  expect(f.containingLoop).toBe(l);
  expect(t.containingLoop).toBeNull();
  expect(g.entry.containingLoop).toBeNull();
  expect(g.exit.containingLoop).toBeNull();

  expect(order.reverse()).toEqual([g.entry, l, f, t, g.exit]);
});

test("simple_loop_exit_false", () => {
  const g = new IR.Graph(1);

  g.entry.removeSuccessor(g.exit);

  const l = new IR.BasicBlock(g);
  const t = new IR.BasicBlock(g);
  const f = new IR.BasicBlock(g);

  g.entry.addSuccessor(l);
  l.addSuccessor(t);
  l.addSuccessor(f);
  t.addSuccessor(l);
  f.addSuccessor(g.exit);

  const order = CG.computeBlockOrderForTesting(g.entry);

  expect(l.containingLoop).toBeNull();
  expect(f.containingLoop).toBeNull();
  expect(t.containingLoop).toBe(l);
  expect(g.entry.containingLoop).toBeNull();
  expect(g.exit.containingLoop).toBeNull();

  expect(order.reverse()).toEqual([g.entry, l, t, f, g.exit]);
});

test("nested_loop", () => {
  const g = new IR.Graph(1);

  g.entry.removeSuccessor(g.exit);

  const l = new IR.BasicBlock(g);
  const t = new IR.BasicBlock(g);
  const nl = new IR.BasicBlock(g);
  const nt = new IR.BasicBlock(g);
  const nf = new IR.BasicBlock(g);
  const f = new IR.BasicBlock(g);

  g.entry.addSuccessor(l);
  l.addSuccessor(t);
  l.addSuccessor(f);
  t.addSuccessor(nl);
  nl.addSuccessor(nt);
  nl.addSuccessor(nf);
  nt.addSuccessor(nl);
  nf.addSuccessor(l);
  f.addSuccessor(g.exit);

  const order = CG.computeBlockOrderForTesting(g.entry);

  expect(l.containingLoop).toBeNull();
  expect(f.containingLoop).toBeNull();
  expect(t.containingLoop).toBe(l);
  expect(nl.containingLoop).toBe(l);
  expect(nt.containingLoop).toBe(nl);
  expect(nf.containingLoop).toBe(l);
  expect(g.entry.containingLoop).toBeNull();
  expect(g.exit.containingLoop).toBeNull();

  expect(order.reverse()).toEqual([g.entry, l, t, nl, nt, nf, f, g.exit]);
});
