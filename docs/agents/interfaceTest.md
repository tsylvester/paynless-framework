# Interface test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files) apply here. **The fixture rule is the one exception:** interface tests never call builders — they use typed literals for owned types and type-only assertions for imported ones, as shown below.

Cited by: construction view (workplan node `interface.test` element) and implementation view (interfaceTest prompt). Governed by all Process topics.

Written **before** the interface (TDD). Proves the interface's contract by typed assignment.

- Contains only type/interface imports, contract headers, type-only assertions, test blocks, and typed assertions — nothing else.
- Every type and symbol is imported from the interface file by its production name.
- Never relies on implementation details.
- Contract is proven by typed assignment — a value annotated with the imported type, an assignment that only compiles if the contract holds:

```ts
import type {
  MyFunctionSuccessReturn,
  MyFunctionReturn,
  EnqueuedReturn,
} from "./myFunction.interface.ts";

/** Contract: MyFunctionSuccessReturn is a member of MyFunctionReturn. */
test("MyFunctionSuccessReturn is a member of MyFunctionReturn", () => {
  const success: MyFunctionSuccessReturn = { createdCount: 1 };  // typed literal, never a builder
  const result: MyFunctionReturn = success;   // compiles only if membership holds
  assert(result === success);
});

/** Contract: EnqueuedReturn is a flavor of the MyFunctionSuccessReturn arm. */
test("EnqueuedReturn is a member of MyFunctionSuccessReturn", () => {
  const enqueued: EnqueuedReturn = { enqueued: true, jobId: "job-1" };  // typed literal
  const success: MyFunctionSuccessReturn = enqueued;   // flavor membership (see errors-and-returns)
  assert(success === enqueued);
});
```

### Every exported symbol is proven

The interface's export surface is the checklist. **Every symbol the interface exports has at least one block proving it** — not the symbols the node happened to enumerate, and not the ones whose proof is convenient. A node lists elements, not symbols, and its silence on a symbol has not excluded it (see [scope](scope.md#node-silence-is-not-exclusion)).

Enumerate the export surface from the interface file before writing, and prove each symbol by the form its kind takes — every form below is already documented in this topic:

- **Object type** — the required-key surface record, `Record<keyof MyObject, true>`.
- **Function type** — a surface record for each exported parameter-object type, annotated with that exported type, plus the declared-return assertions in the sync or async form.
- **Union type** — membership by typed assignment, one block per member, plus flavor membership where an arm has flavors.
- **Enum or string-literal alias** — a typed literal assigned to the alias, one block covering its admitted values.
- **Class** — the surface record for its `ConstructorParams` object type. The class itself is proven by construction elsewhere, never by a literal here.

If a kind is not listed, it is not a kind this interface should export — report it and halt ([discovery-halt](discovery-halt.md)) rather than inventing a proof form.

The interface is the only source for this list. A symbol absent from the interface file is not proven here on the strength of the node mentioning it, and a symbol present in the interface file is proven here whether the node mentioned it or not.

**Report the enumeration** — the symbols the interface exports and each one's block — per the coverage canary ([scope](scope.md#coverage-canary)). A test file proving fewer symbols than the interface exports is incomplete, not minimal.

### Test the exported symbol, never an equivalent derivation

An interface test must prove the exported symbol named by the contract. Do not substitute a derived, reconstructed, projected, or structurally equivalent type and claim that it proves the exported symbol.

For a function type, `Parameters<MyFunction>[n]` describes the parameter slot exposed by the function type. It is not a substitute for the exported parameter type `MyFunctionParams`, `MyFunctionDeps`, or any other named contract type. The relationship between those types is itself part of the contract and must not be assumed.

Therefore, parameter-surface tests must annotate the witness with the exported symbol:

```ts
const surface: Record<keyof MyFunctionParams, true> = {
  arg1: true,
  arg2: true,
};
```

A witness annotated as `Record<keyof Parameters<MyFunction>[n], true>` is invalid as proof of `MyFunctionParams`. It proves only the derived parameter-slot shape, and may pass even when the exported symbol is absent, wrong, or disconnected from the function signature.

Use `Parameters<MyFunction>[n]` only to locate the relevant parameter slot or to test the function's declared signature separately. Never use it as a substitute for the exported parameter-object symbol.

The test must make the contract fail when the named exported symbol is changed or removed. If changing the named exported symbol would not make the test fail, the test is proving an equivocation rather than that symbol.

### Import and usage coverage

The interface test must have a one-to-one coverage relationship with the interface's export surface. Coverage is bidirectional: every interface export appears in the test's imported-symbol enumeration, and every imported contract symbol is consumed by a proof block; unused imports and unimported exports are both coverage failures.

Before writing assertions, enumerate every symbol exported by the interface. For each exported symbol:

1. Import it from the interface file by its production name.
2. Consume that imported symbol in at least one proof block.
3. Record the block that proves it.

Coverage fails in either direction:

- An exported symbol that is not imported is unproven.
- An imported symbol that is never consumed in a proof block is unproven.
- Importing a symbol without using it is not coverage.
- Proving a derived, projected, reconstructed, or equivalent type does not count as consuming the exported symbol.
- `Parameters<MyFunction>[n]` does not consume or prove `MyFunctionParams`, `MyFunctionDeps`, or any other exported parameter-object type.

The interface test is incomplete unless every exported symbol is both imported and consumed by its own appropriate proof form. The test file's imports and proof blocks must therefore be auditable against the interface file's export list in both directions.

### The contract header here

This scope collapses to a **one-line `Contract` header** naming the membership or surface the block proves. The remaining three fields are invariant for every block in the scope — arrange a typed literal or a `Record<keyof …, true>` surface, act by assigning it to the wider type, assert the identity that only compiles if the contract holds — so they are stated once, here, and never repeated per block. There are no inline markers: each statement is already its own section (see [tests](tests.md#every-test-states-its-contract)).

**There is no action in this scope, and none is invented.** The assignment is the act. If an `Act` field tempts you to write a call, a function value, or a body so there is “something to act on,” stop — that is implementing, and the contract is proven by types.

Prove **flavor membership** too: each flavor of an arm is assignable to its arm, which is assignable to `Return` (see [errors-and-returns](errors-and-returns.md#either-arm-may-be-union-of-flavors)).

### Imported object contracts: do not use `declare const`

Owned types are proven with typed literals, as above. When a contract contains a value whose type another interface owns — a database row, a config, or a payload from elsewhere — do not construct that value in this interface test. Its builder belongs to the owning interface's tests, and an ambient binding cannot be referenced by an executed test.

Test the object contract owned by the interface under test by enumerating its required keys in a boolean surface record. The record is a witness for the key surface, not an instance of the production object. The imported object's own fields and nested contracts are tested by that object's interface test, not re-tested here with a self-comparison.

```ts
import type { MyObject } from "./myObject.interface.ts";

/** Contract: MyObject's required key surface is exactly arg1 and arg2. */
test("MyObject has the required surface", () => {
  const surface: Record<keyof MyObject, true> = {
    arg1: true,
    arg2: true,
  };
  assert(Object.keys(surface).length === 2);
});
```

If the interface under test accepts an imported object as a field, enumerate that field in the owning interface's surface test. Do not add a database-row fixture, import its builder, or compare the field with the same imported row type: those steps either construct the value or prove only `ImportedType extends ImportedType`.

**Function types are proven without stubbing them.** A value that inhabits a function type *is* an implementation, however empty; `const fn: MyFunction = () => …` is a function body and does not belong in the test. There is no stub that is not an implementation. Do not use `declare const` for the function or its arguments, and never call an ambient function. Prove each exported parameter object's required surface with an explicit boolean record annotated by that exported type. Do not use `Parameters<MyFunction>[n]` as a substitute for the exported parameter-object type.

```ts
import type {
  MyFunction,
  MyFunctionDeps,
  MyFunctionParams,
} from "./myFunction.interface.ts";

/** Contract: MyFunctionDeps requires exactly dep1 and dep2. */
test("MyFunction has the required deps surface", () => {
  const surface: Record<keyof MyFunctionDeps, true> = {
    dep1: true,
    dep2: true,
  };
  assert(Object.keys(surface).length === 2);
});

/** Contract: MyFunctionParams requires exactly arg1 and arg2. */
test("MyFunction has the required params surface", () => {
  const surface: Record<keyof MyFunctionParams, true> = {
    arg1: true,
    arg2: true,
  };
  assert(Object.keys(surface).length === 2);
});
```

Prove the return type against the function's **declared** return. Pick the form that matches the signature — do not reason about it, copy the matching one:

```ts
import type {
  MyFunction,
  MyFunctionSuccessReturn,
  MyFunctionErrorReturn,
  MyFunctionReturn,
} from "./myFunction.interface.ts";

// SYNC — MyFunction returns MyFunctionReturn
/** Contract: MyFunction's declared return admits its success arm. */
test("MyFunction returns its declared success type", () => {
  const success: MyFunctionSuccessReturn = { createdCount: 1 };
  const returned: ReturnType<MyFunction> = success;
  const declared: MyFunctionReturn = returned;
  assert(declared === success);
});

/** Contract: MyFunction's declared return admits its error arm. */
test("MyFunction returns its declared error type", () => {
  const error: MyFunctionErrorReturn = { error: "failed" };
  const returned: ReturnType<MyFunction> = error;
  const declared: MyFunctionReturn = returned;
  assert(declared === error);
});

// ASYNC — MyFunction returns Promise<MyFunctionReturn>
/** Contract: MyFunction's declared Promise return admits its success arm. */
test("MyFunction resolves to its declared success type", () => {
  const success: MyFunctionSuccessReturn = { createdCount: 1 };
  const returned: ReturnType<MyFunction> = Promise.resolve(success);
  const declared: Promise<MyFunctionReturn> = returned;
  assert(declared instanceof Promise);
});

/** Contract: MyFunction's declared Promise return admits its error arm. */
test("MyFunction resolves to its declared error type", () => {
  const error: MyFunctionErrorReturn = { error: "failed" };
  const returned: ReturnType<MyFunction> = Promise.resolve(error);
  const declared: Promise<MyFunctionReturn> = returned;
  assert(declared instanceof Promise);
});
```

An async function's `ReturnType` is the `Promise`, so the annotation is `Promise<MyFunctionReturn>` — never unwrap it with `await` or `Awaited<…>`. Match the `Promise` exactly.

Do not write a `declare const` binding for an interface test. If you begin writing a function body — even `throw`, even `return undefined` — inside an interface test, stop: you have begun implementing, and the contract is proven by types, never by a body.

**RED is the interface not yet providing the symbols.** Whether the interface file does not exist yet or exists without the new exports, the resulting compiler errors — missing module or missing export — **are the deliverable**. Report them verbatim and stop. That is success, not a halt.

- Never create or edit the interface file. “I'm only creating the file” is editing it.
- Halt applies to one case only: the test needs a type owned by a **different** interface that does not exist in its home — a dependency-ordering violation. Report and halt (see [discovery-halt](discovery-halt.md)).

Forbidden: running any terminal commands, importing an implementation, defining types locally (“temporary, I'll move it later”); silencing the compiler (`@ts-expect-error`, `as`, `satisfies`, `unknown`); importing mocks, builders, or guards; constructing a value of an imported type — a hand-rolled literal or its builder — instead of a type-only surface assertion; using `declare const` in an interface test; stubbing a function to inhabit its type (`const fn: MyFunction = …`); using `Record<keyof Parameters<MyFunction>[n], true>` as proof of an exported parameter-object symbol; a broad primitive where a narrow type exists; redefining an imported type locally. A file that compiles cleanly at this stage is a failed task.