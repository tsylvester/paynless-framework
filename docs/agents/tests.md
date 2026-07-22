# Tests

Tests define a function's requirements and assert that they are met. This topic
owns test authoring. It has four element anchors — [interface](#interface),
[guard](#guard), [unit](#unit), [integration](#integration) — each cited by its
own node element and prompt.

Cited by: construction view (workplan node `interface.test`, `guard.test`,
`unit.test`, `integration.test` elements) and implementation view (interfaceTest,
guardTest, unitTest, integrate prompts). Governed by all Process topics.

## Shared standards (all test files)

- Tests define the requirements for the code to be correct and complete, and
  assert those requirements are met.
- Assert the desired **passing** state. No RED/GREEN labels in names. New tests are
  appended to the end of the file.
- Tests are not stateful — no "was", "used to be", or "will later". Prior iterations
  of the file or function are irrelevant.
- Requirements are finite and bounded; negative conditions are infinite. Assert the
  bounded requirements. Bounded negative cases derived from a requirement (e.g. the
  guard checklist below) are requirements, not open-ended enumeration.
- Each test covers **one** behavior, so a failure names the exact defect.
- Use production types, objects, helpers, and mocks. Never invent parallel types or
  shadow implementations. Each mock must name the production type it mirrors.
- Never change an assertion to match broken code — fix the code.
- Fixtures come from the mock file's builders and invalidators (see
  [mocks](mocks.md)), never hand-rolled.
- Test files mirror the source tree and may split by behavior
  (`bar.basic.test.ts`, `bar.error.test.ts`, `bar.edge.test.ts`); group related
  tests in nested `Deno.test` / `t.step` blocks.
- The agent never runs tests (see [environment](environment.md)). A test's RED or
  GREEN state is proven by compiler/linter output, not by execution.
- Examples in this topic use `test(...)` for a test block and `assert(...)` for a truthy
  assertion as neutral placeholders. Substitute your project's own runner and assertion
  library — `Deno.test` + `@std/assert`, `test` / `it` + `expect`, and so on — and its
  module-resolution convention for import paths.

---

<a id="interface"></a>
## Interface test

Written **before** the interface (TDD). Proves the interface's contract by typed
assignment.

- Contains only imports, test blocks, and typed assertions — nothing else.
- Every type and symbol is imported from the interface file by its production name.
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

**RED is the interface not yet providing the symbols.** Whether the interface file
does not exist yet (greenfield) or exists without the new exports (extension), the
resulting compiler errors — missing module or missing export — **are the deliverable**.
Report them verbatim and stop. That is success, not a halt.

- Never create or edit the interface file. "I'm only creating the file" is editing it.
- Halt applies to one case only: the test needs a type owned by a **different**
  interface that does not exist in its home — a dependency-ordering violation. Report
  and halt (see [discovery-halt](discovery-halt.md)).

Forbidden: defining types locally ("temporary, I'll move it later"); silencing the
compiler (`@ts-expect-error`, `as`, `satisfies`, `unknown`); importing mocks,
builders, or guards; a broad primitive where a narrow type exists; redefining an
imported type locally. A file that compiles cleanly at this stage is a failed task.

---

<a id="guard"></a>
## Guard test

The interface and mock file exist and compile. The guard file may not export the
guard yet. Proves the guard has no false positives and no false negatives.

- Only imports, test blocks, and assertions. Guards imported by production name
  (`isObjectName`); fixtures from builders and invalidators.
- The compiler reports missing exports from the **guard file and nothing else** —
  interface and mock imports resolve cleanly. An error elsewhere means the test is
  broken, not RED.
- No cast anywhere: the guard takes `unknown` and the invalidator returns `unknown`.
  If you reach for `as`, `satisfies`, or a fitting annotation, the fixture is built
  wrong — use the builder or invalidator.

### Case checklist — mechanical, per owned guard

For `isOwnedObject`:

1. `buildOwnedObject()` → `true`
2. `buildOwnedObject({ ...valid overrides... })` → `true`
3. `null`, `undefined`, a primitive, an array → `false`
4. Each property corrupted: `invalidateOwnedObject({ property: <wrong value> })` →
   `false` — one case per property, including imported-typed properties (one
   corruption proves the guard delegates; the imported type's own invalid states are
   its own guard test's job).
5. Each required property omitted (rest-destructure the builder output) → `false`
6. Each optional property absent → `true`; present but corrupted → `false`

Rendered — copy this shape, one test file per owned guard:

```ts
import { isOwnedObject } from "./myInterface.guard.ts";
import { buildOwnedObject, invalidateOwnedObject } from "./myInterface.mock.ts";

test("isOwnedObject accepts the valid default", () => {
  assert(isOwnedObject(buildOwnedObject()));
});

test("isOwnedObject accepts valid overrides", () => {
  assert(isOwnedObject(buildOwnedObject({ foo: someValidFoo })));
});

test("isOwnedObject rejects non-objects", () => {
  for (const x of [null, undefined, 7, "x", []]) assert(!isOwnedObject(x));
});

test("isOwnedObject rejects each corrupted property", () => {
  assert(!isOwnedObject(invalidateOwnedObject({ foo: null })));
  assert(!isOwnedObject(invalidateOwnedObject({ bar: 42 })));
});

test("isOwnedObject rejects each omitted required property", () => {
  const { foo: _f, ...missingFoo } = buildOwnedObject();
  assert(!isOwnedObject(missingFoo));
});
```

Scope: test only guards for types this interface owns. A foreign guard is tested in
its home package and is exercised here only indirectly through case 4 — never
imported into this test.

Forbidden: creating/editing the guard file; defining a guard in the test; silencing
the compiler; hand-rolled fixtures duplicating builders; testing a foreign guard;
hand-building fixtures for imported types. If the mock file lacks a needed builder or
invalidator, add it there in the four-symbol form (see [mocks](mocks.md)); if it
belongs to an imported type, find it in its home or halt.

---

<a id="unit"></a>
## Unit test

Written **before** the implementation (TDD). Validates behavior.

- Only imports, test blocks, and assertions. Import the function from its
  implementation file.
- **RED is the implementation not yet existing.** Import from its path; the compiler
  error is the deliverable; never create or edit the implementation file. Missing
  producer owned by another interface → halt (same rule as the interface test).
- Factories and helpers go in the **mock file**, never in the test (see
  [mocks](mocks.md)). Do not build mocks for imported functions — use theirs.
- **When updating an existing suite for new requirements, update the existing tests
  in the same pass.** Do not leave stale tests for a second pass after the
  implementation changes — add the new tests and correct the existing ones together.
- Focus on correct transformations and branching logic. Do **not** re-test type
  shape (interface test) or guard correctness (guard test).
- One behavior per test.

---

<a id="integration"></a>
## Integration test

Exercises real code across an approved boundary (API, service, repository, external
adapter).

- Mock **only** at the outer boundary of the integrated scope. Use the **real**
  implementation for every function being integrated — never mocks, mock factories,
  or utilities for those.
- For an integration covering `f(x) → … → f(z)` where `f(x)` consumes `f(a)` and
  `f(z)` calls `f(b)`: mock `f(a)` and `f(b)`, run the real `f(x) … f(z)`.
- Integration fixtures are built from the mock file's builders (see [mocks](mocks.md)).

---

<a id="e2e"></a>
## End-to-end test

Reserved for real end-to-end validation of the full stack against real infrastructure.
Keep E2E tests minimal and run them in a dedicated, isolated pipeline — they are not
part of the ordinary node cycle. Reach for one only when a behavior genuinely cannot be
proven at the unit or integration tier.

---

## Precedence

This topic outranks the workplan. A node step that silences a RED compiler error,
defines the thing under test inside its test, hand-rolls fixtures, re-tests shape or
guard correctness in a unit test, mocks a function that is supposed to be integrated,
or leaves existing tests stale during a requirements change is defective — comply
with this topic and report the discrepancy.
