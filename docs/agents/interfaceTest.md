# Interface test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files)
apply here. **The fixture rule is the one exception:** interface tests never call builders —
they use typed literals for owned types and `declare const` for imported ones, as shown below.

Cited by: construction view (workplan node `interface.test` element) and implementation
view (interfaceTest prompt). Governed by all Process topics.

Written **before** the interface (TDD). Proves the interface's contract by typed
assignment.

- Contains only type/interface imports, ambient bindings (`declare const`), test blocks,
  and typed assertions — nothing else.
- Every type and symbol is imported from the interface file by its production name.
- Never relies on implementation details.
- Contract is proven by typed assignment — a value annotated with the imported type,
  an assignment that only compiles if the contract holds:

```ts
import type {
  MyFunctionSuccessReturn,
  MyFunctionReturn,
  EnqueuedReturn,
} from "./myFunction.interface.ts";

test("MyFunctionSuccessReturn is a member of MyFunctionReturn", () => {
  const success: MyFunctionSuccessReturn = { createdCount: 1 };  // typed literal, never a builder
  const result: MyFunctionReturn = success;   // compiles only if membership holds
  assert(result === success);
});

test("EnqueuedReturn is a member of MyFunctionSuccessReturn", () => {
  const enqueued: EnqueuedReturn = { enqueued: true, jobId: "job-1" };  // typed literal
  const success: MyFunctionSuccessReturn = enqueued;   // flavor membership (see errors-and-returns)
  assert(success === enqueued);
});
```

Prove **flavor membership** too: each flavor of an arm is assignable to its arm,
which is assignable to `Return` (see [errors-and-returns](errors-and-returns.md#either-arm-may-be-a-union-of-flavors)).

### Values of imported types: `declare const`, never construct them

Owned types are proven with typed literals, as above. When the contract takes a value
whose type **another** interface owns — a database row, a config, a payload from
elsewhere — prove the shape *accepts* that type without building an instance of it.
Constructing it means hand-rolling a literal (inventing its shape) or importing its
builder (forbidden here). The one sanctioned move is an ambient binding: `declare const`
emits no runtime value, asserts no cast, and annotates the type from its own home.

```ts
import type { MyFunctionParams } from "./myFunction.interface.ts";
import type { Database } from "../../types_db.ts";

type JobRow = Database["public"]["Tables"]["dialectic_generation_jobs"]["Row"];

declare const row: JobRow;   // typed as JobRow — no value built, no `as`, no mock

test("MyFunctionParams.parentJob accepts a database job row", () => {
  const params: MyFunctionParams = { parentJob: row /* ...remaining fields */ };
  assert(params.parentJob === row);   // compiles only if JobRow fits the contract
});
```

**Function types are proven the same way — never stub them.** A value that inhabits a
function type *is* an implementation, however empty; `const fn: MyFunction = () => …` is a
function body and does not belong in the test. There is no stub that is not an
implementation. Bind the function with `declare const`, then prove its shape with
`Parameters` and `ReturnType` against `declare const`-bound arguments. Never call an
ambient function — it has no runtime value.

```ts
import type {
  MyFunction,
  MyFunctionDeps,
  MyFunctionParams,
  MyFunctionReturn,
} from "./myFunction.interface.ts";

declare const fn: MyFunction;             // never called, never given a body
declare const deps: MyFunctionDeps;
declare const params: MyFunctionParams;
declare const ret: ReturnType<MyFunction>;

test("MyFunction accepts its declared parameter types", () => {
  const _0: Parameters<MyFunction>[0] = deps;
  const _1: Parameters<MyFunction>[1] = params;
  assert(true);   // the proof is that the assignments above compile
});
```

Prove the return type against the function's **declared** return. Pick the form that
matches the signature — do not reason about it, copy the matching one:

```ts
// SYNC — MyFunction returns MyFunctionReturn
test("MyFunction returns its declared return type", () => {
  const _r: MyFunctionReturn = ret;   // ret is ReturnType<MyFunction>
  assert(true);
});

// ASYNC — MyFunction returns Promise<MyFunctionReturn>
test("MyFunction resolves to its declared return type", () => {
  const _r: Promise<MyFunctionReturn> = ret;   // ret is ReturnType<MyFunction>
  assert(true);
});
```

An async function's `ReturnType` is the `Promise`, so the annotation is
`Promise<MyFunctionReturn>` — never unwrap it with `await` (there is nothing to run) or
`Awaited<…>` (that would assert the wrong contract). Match the `Promise` exactly.

`declare const` bindings sit at module top level — ambient declarations cannot be
block-scoped. If you begin writing a function body — even `throw`, even `return
undefined` — inside an interface test, stop: you have begun implementing, and the
contract is proven by types, never by a body.

**RED is the interface not yet providing the symbols.** Whether the interface file
does not exist yet (greenfield) or exists without the new exports (extension), the
resulting compiler errors — missing module or missing export — **are the deliverable**.
Report them verbatim and stop. That is success, not a halt.

- Never create or edit the interface file. "I'm only creating the file" is editing it.
- Halt applies to one case only: the test needs a type owned by a **different**
  interface that does not exist in its home — a dependency-ordering violation. Report
  and halt (see [discovery-halt](discovery-halt.md)).

Forbidden: importing an implementation, defining types locally ("temporary, I'll move it later"); silencing the
compiler (`@ts-expect-error`, `as`, `satisfies`, `unknown`); importing mocks,
builders, or guards; constructing a value of an imported type — a hand-rolled literal
or its builder — instead of `declare const`; stubbing a function to inhabit its type
(`const fn: MyFunction = …`) instead of `declare const`; a broad primitive where a
narrow type exists; redefining an imported type locally. A file that compiles cleanly
at this stage is a failed task.
