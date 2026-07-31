# Interface test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files)
apply here. **The fixture rule is the one exception:** interface tests never call builders —
they use typed literals for owned types and type-only assertions for imported ones, as shown below.

Cited by: construction view (workplan node `interface.test` element) and implementation
view (interfaceTest prompt). Governed by all Process topics.

Written **before** the interface (TDD). Proves the interface's contract by typed
assignment.

- Contains only type/interface imports, type-only assertions, test blocks,
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

### Imported object contracts: do not use `declare const`

Owned types are proven with typed literals, as above. When a contract contains a
value whose type another interface owns — a database row, a config, or a payload from
elsewhere — do not construct that value in this interface test. Its builder belongs to
the owning interface's tests, and an ambient binding cannot be referenced by an
executed test.

Test the object contract owned by the interface under test by enumerating its required
keys in a boolean surface record. The record is a witness for the key surface, not an
instance of the production object. The imported object's own fields and nested
contracts are tested by that object's interface test, not re-tested here with a
self-comparison.

```ts
import type { MyObject } from "./myObject.interface.ts";

test("MyObject has the required surface", () => {
  const surface: Record<keyof MyObject, true> = {
    arg1: true,
    arg2: true,
  };
  assert(Object.keys(surface).length === 2);
});
```

If the interface under test accepts an imported object as a field, enumerate that
field in the owning interface's surface test. Do not add a database-row fixture,
import its builder, or compare the field with the same imported row type: those steps
either construct the value or prove only `ImportedType extends ImportedType`.

**Function types are proven without stubbing them.** A value that inhabits a
function type *is* an implementation, however empty; `const fn: MyFunction = () => …` is a
function body and does not belong in the test. There is no stub that is not an
implementation. Do not use `declare const` for the function or its arguments, and
never call an ambient function. Prove each parameter object's required surface with
an explicit boolean record derived from `Parameters<MyFunction>`; no function value
is constructed or referenced.

```ts
import type {
  MyFunction,
} from "./myFunction.interface.ts";

test("MyFunction has the required deps surface", () => {
  const surface: Record<keyof Parameters<MyFunction>[0], true> = {
    dep1: true,
    dep2: true,
  };
  assert(Object.keys(surface).length === 2);
});

test("MyFunction has the required params surface", () => {
  const surface: Record<keyof Parameters<MyFunction>[1], true> = {
    arg1: true,
    arg2: true,
  };
  assert(Object.keys(surface).length === 2);
});
```

Prove the return type against the function's **declared** return. Pick the form that
matches the signature — do not reason about it, copy the matching one:

```ts
import type {
  MyFunction,
  MyFunctionSuccessReturn,
  MyFunctionErrorReturn,
  MyFunctionReturn,
} from "./myFunction.interface.ts";

// SYNC — MyFunction returns MyFunctionReturn
test("MyFunction returns its declared success type", () => {
  const success: MyFunctionSuccessReturn = { createdCount: 1 };
  const returned: ReturnType<MyFunction> = success;
  const declared: MyFunctionReturn = returned;
  assert(declared === success);
});

test("MyFunction returns its declared error type", () => {
  const error: MyFunctionErrorReturn = { error: "failed" };
  const returned: ReturnType<MyFunction> = error;
  const declared: MyFunctionReturn = returned;
  assert(declared === error);
});

// ASYNC — MyFunction returns Promise<MyFunctionReturn>
test("MyFunction resolves to its declared success type", () => {
  const success: MyFunctionSuccessReturn = { createdCount: 1 };
  const returned: ReturnType<MyFunction> = Promise.resolve(success);
  const declared: Promise<MyFunctionReturn> = returned;
  assert(declared instanceof Promise);
});

test("MyFunction resolves to its declared error type", () => {
  const error: MyFunctionErrorReturn = { error: "failed" };
  const returned: ReturnType<MyFunction> = Promise.resolve(error);
  const declared: Promise<MyFunctionReturn> = returned;
  assert(declared instanceof Promise);
});
```

An async function's `ReturnType` is the `Promise`, so the annotation is
`Promise<MyFunctionReturn>` — never unwrap it with `await` (there is nothing to run) or
`Awaited<…>` (that would assert the wrong contract). Match the `Promise` exactly.

Do not write a `declare const` binding for an interface test. If you begin writing a
function body — even `throw`, even `return
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
or its builder — instead of a type-only surface assertion; using `declare const` in an
interface test; stubbing a function to inhabit its type (`const fn: MyFunction = …`);
a broad primitive where a narrow type exists; redefining an imported type locally. A
file that compiles cleanly at this stage is a failed task.
