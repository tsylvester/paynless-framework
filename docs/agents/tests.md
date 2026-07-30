# Tests

Tests define a function's requirements and assert that they are met. This topic owns
test authoring. It splits into five scope files — [interface](interfaceTest.md),
[guard](guardTest.md), [unit](unitTest.md), [integration](integrationTest.md),
[e2e](e2eTest.md). Load only the scope you are working; the shared standards and
fixture rules below apply to every scope.

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
  guard checklist) are requirements, not open-ended enumeration.
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

## Fixtures: call the builder directly

Applies to every scope that uses fixtures — [guard](guardTest.md), [unit](unitTest.md),
[integration](integrationTest.md). [Interface tests](interfaceTest.md) are the exception:
they never call builders, using typed literals and `declare const` instead.

Every fixture is a direct call to the mock's builder, passing **only** the overrides
that test needs; the builder fills every other field with a valid default. The builder
call *is* the fixture — there is nothing to stage, spread, or assemble around it, and no
fixture in the file is exempt.

```ts
// RIGHT — call the builder at each point of need, overriding only what matters
const active  = buildMyObject({ status: "active" });
const expired = buildMyObject({ status: "expired" });
```

Each of the following defeats the builder and is forbidden — the builder already does
every one of them for you:

```ts
// FORBIDDEN 1 — a hand-written object the builder would produce
const x = { id: "1", status: "active", createdAt: 0 /* ...every field by hand... */ };

// FORBIDDEN 2 — build once, then spread into variants
const base = buildMyObject();
const a = { ...base, status: "active" };    // → buildMyObject({ status: "active" })
const b = { ...base, status: "expired" };   // → buildMyObject({ status: "expired" })

// FORBIDDEN 3 — spread a built value back through the builder
buildMyObject({ ...base, status: "active" });   // the ...base is redundant

// FORBIDDEN 4 — decompose fields, then reassemble by hand
const id = "1"; const status = "active";
const x = { id, status /* ... */ };

// FORBIDDEN 5 — re-wrap the builder in a local helper
const make = (o) => buildMyObject({ ...fixed, ...o });   // buildMyObject already is that helper
```

If you catch yourself writing a local object, spreading a built value, reassembling
fields by hand, or wrapping the builder, stop — the builder replaces all of it. One
direct `buildMyObject({ … })` per fixture, with only the overrides that fixture needs.
The same applies to invalidators: `invalidateMyObject({ … })` directly, never staged or
spread.

**Overrides are scoped to the test's objective.** Pass only the fields this test asserts
on or depends on; every other field takes the builder's default. When adapting an
existing test, do not carry the old literal's incidental values into the builder call —
overriding `irrelevantField` merely because the pre-builder object happened to set it
rebuilds the hand-rolled object one override at a time, which is the same defeat. Ask of
each field: does this test's objective depend on it? If not, omit the override and let
the default stand.

## Test scopes

Each scope is its own topic file. Load only the one you are working; the shared
standards and fixture rules above apply to all of them.

<a id="interface"></a>
- **[Interface test](interfaceTest.md)** — proves the interface's contract by typed
  assignment, before the interface exists (TDD RED).
<a id="guard"></a>
- **[Guard test](guardTest.md)** — proves a guard has no false positives and no false
  negatives, per the mechanical case checklist.
<a id="unit"></a>
- **[Unit test](unitTest.md)** — validates behavior, before the implementation exists
  (TDD RED).
<a id="integration"></a>
- **[Integration test](integrationTest.md)** — exercises real code across an approved
  boundary, mocking only at that boundary.
<a id="e2e"></a>
- **[End-to-end test](e2eTest.md)** — reserved; full-stack against real infrastructure,
  in an isolated pipeline, outside the ordinary node cycle.

## Precedence

This topic outranks the workplan. A node step that silences a RED compiler error,
defines the thing under test inside its test, hand-rolls fixtures, re-tests shape or
guard correctness in a unit test, mocks a function that is supposed to be integrated,
or leaves existing tests stale during a requirements change is defective — comply
with this topic and report the discrepancy.
