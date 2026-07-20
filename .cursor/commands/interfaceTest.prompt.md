## Interface Test Generation

This repo follows TDD. The interface test is written **before** the interface. You will write exactly one file: the interface test. The interface file may or may not exist; it does not yet export every symbol you may want from it, on purpose.

### What success is

The task is complete when all four are true:

1. The test file contains only imports, test blocks, and typed assertions — nothing else.
2. Every type and symbol the test uses is imported from the interface file by its production name.
3. The compiler reports that the interface file does exist, or does not export some of the names.
4. Your final report lists those compiler errors, verbatim, as proof the test is RED.

**The compiler errors are the deliverable.** They are the proof that the test defines a contract the interface does not yet satisfy. Report them and stop.

A test file that compiles cleanly at this stage is a **failed task** — it can only mean you defined the types yourself, silenced the compiler, or touched the interface file. Do not fix the errors. Do not respond to the linter. The linter's complaint is the point.

### What the test contains

Only three kinds of statements:

* imports (from the interface file and the test framework)
* test blocks
* typed assignments and assertions that exercise the contract

Contract is proven by typed assignment — a value annotated with the imported type, an assignment that only compiles if the contract holds:

```ts
import { assert } from "jsr:@std/assert";
import type {
  MyObject,
  myFunctionSuccessReturn,
  myFunctionReturn,
} from "./myInterface.interface.ts";

Deno.test("myFunctionSuccessReturn is a member of myFunctionReturn", () => {
  const success: myFunctionSuccessReturn = { createdCount: 1 };
  const result: myFunctionReturn = success;
  assert(result === success);
});
```

No witness functions. No local type definitions. No narration about RED in test names — the test names describe the contract, the compiler output proves the state.

### Scope

Ownership question: **who defines this symbol?**

* Defined in this interface → tested here.
* Imported by the interface from elsewhere → not tested here; it appears in this file only as an imported annotation from its own home. Its own interface test covers it.

### Forbidden substitutes

If your work matches any of these, the task has failed — even if the file compiles, even if it "works."

```ts
// FORBIDDEN 1 — creating or editing the interface file
// "I'm only creating the file, not writing the interface" — creating the file IS
// touching the interface file. If the file is missing, creating it is not in your current scope.
```

```ts
// FORBIDDEN 2 — defining the types in the test file
type MyObject = { createdCount: number }; // "temporary, I'll move it later"
```

There is no later. A test that imports nothing proves nothing.

```ts
// FORBIDDEN 3 — silencing the compiler
// @ts-expect-error / @ts-ignore / deno-lint-ignore
const success = {} as myFunctionSuccessReturn;   // or `satisfies`, or `unknown`
```

Every one of these destroys the proof. This test's entire value is that the compiler can see the contract is unmet.

```ts
// FORBIDDEN 4 — importing mocks, builders, or guards
import { buildMyObject } from "./myInterface.mock.ts";
import { isMyObject } from "./myInterface.guard.ts";
```

Interface tests take no dependencies on mocks or guards, ever. Typed literals only.

```ts
// FORBIDDEN 5 — broad primitive where a narrow type exists
myEnumMember: string             // wrong
myEnumMember: MyEnumDeclaration  // right — imported from its home
```

```ts
// FORBIDDEN 6 — redefining an imported type locally
type MyEnumDeclaration = "enum1" | "enum2";  // its home already defines it
```

### Halt rule

If completing the test appears to require touching **any** file other than the test file, or importing anything beyond the interface file, types' home interfaces, and the test framework — stop. State which file, what you wanted to do to it, and why the test seemed to need it. Then halt.

**Halting with that explanation is the successful outcome.** It means either the scaffold is incomplete or the contract is underspecified — both are the user's to resolve, not yours to work around.