# Tests

Tests define a function's requirements and assert that they are met. This topic owns test authoring. It splits into five scope files — [interface](interfaceTest.md), [guard](guardTest.md), [unit](unitTest.md), [integration](integrationTest.md), [e2e](e2eTest.md). Load only the scope you are working; the shared standards and fixture rules below apply to every scope.

Cited by: construction view (workplan node `interface.test`, `guard.test`, `unit.test`, `integration.test` elements) and implementation view (interfaceTest, guardTest, unitTest, integrate prompts). Governed by all Process topics.

## Shared standards (all test files)

- Tests define the requirements for the code to be correct and complete, and assert those requirements are met.
- Assert the desired **passing** state. No RED/GREEN labels in names. New tests are appended to the end of the file.
- Tests are not stateful — no "was", "used to be", or "will later". Prior iterations of the file or function are irrelevant.
- Requirements are finite and bounded; negative conditions are infinite. Assert the bounded requirements. Bounded negative cases derived from a requirement (e.g. the guard checklist) are requirements, not open-ended enumeration.
- Each test covers **one** behavior, so a failure names the exact defect.
- Use production types, objects, helpers, and mocks. Never invent parallel types or shadow implementations. Each mock must name the production type it mirrors.
- Never change an assertion to match broken code — fix the code.
- Fixtures come from the mock file's builders and invalidators (see [mocks](mocks.md)), never hand-rolled.
- Test files mirror the source tree and may split by behavior (`bar.basic.test.ts`, `bar.error.test.ts`, `bar.edge.test.ts`); group related tests in nested `Deno.test` / `t.step` blocks.
- The agent never runs tests (see [environment](environment.md)). A test's RED or GREEN state is proven by compiler/linter output, not by execution.
- Examples in this topic use `test(...)` for a test block and `assert(...)` for a truthy assertion as neutral placeholders. Substitute your project's own runner and assertion library — `Deno.test` + `@std/assert`, `test` / `it` + `expect`, and so on — and its module-resolution convention for import paths.

## Every test states its contract

A test file outlives the workplan node that specified it. The node's `interaction.spec` (see [workplan-structure](workplan-structure.md)) states, per branch, the condition, decision, dependency call, and outcome — and then the node is set aside. Unless that contract is carried into the test, the next reader reverse-engineers intent from the assertions, and an auditor has nothing to audit the assertions against.

So every test block carries its contract. In full form that is two places:

- a **fixed-field header comment** immediately above the block — `Contract`, `Arrange`, `Act`, `Assert`;
- **inline section markers** — `// Arrange`, `// Act`, `// Assert` — at the body's section boundaries.

The block's name is its title. Do not repeat the title inside the header.

- **Contract** transcribes the one branch this test proves, condition → outcome, from the node's `interaction.spec`. One test, one branch.
- **Arrange** names the fixture and the variation it establishes.
- **Act** names the single call under test.
- **Assert** names every property the body checks — no more, no fewer.

The four labels are fixed so they can be located mechanically. Prose in place of the labels is not a contract; it defeats the audit. What fills each field is scope-specific, and each scope file names what fills it there.

### The collapsed form

Where a scope's blocks are a single expression or a single typed assignment — the [guard](guardTest.md) and [interface](interfaceTest.md) scopes — the header collapses to the `Contract` line alone and the inline markers are omitted. Two reasons, both structural: the remaining three fields are **invariant for every block in that scope**, so repeating them per block is duplication, and stating them once in the scope file is the only non-duplicative place for them; and a single-expression body has no section boundaries for a marker to mark.

The [unit](unitTest.md) and [integration](integrationTest.md) scopes take the full form. Which form a scope takes is decided by the scope file, never by the author of an individual test — "this block felt simple enough" is not a collapse.

Rendered — the full form:

```ts
/**
 * Contract: given documents from more than one session, only the current session's
 *   documents are returned.
 * Arrange: two documents in the current session, one in a foreign session.
 * Act:     selectSessionDocuments over all three.
 * Assert:  both current-session ids are returned; the foreign id is absent.
 */
test("selectSessionDocuments returns only the current session's documents", () => {
  // Arrange
  const mine = buildDocument({ sessionId: "session-1" });
  const alsoMine = buildDocument({ sessionId: "session-1" });
  const foreign = buildDocument({ sessionId: "session-2" });

  // Act
  const result = selectSessionDocuments([mine, alsoMine, foreign], "session-1");

  // Assert
  assert(result.length === 2);
  assert(!result.includes(foreign));
});
```

The header states what the test **is**, never what it was — the no-stateful-tests standard above governs the header exactly as it governs the block name.

The header is a claim about the body, not a description of it. It is checked against the body and never trusted over it (see [Test derangements](#audit)).

**Contract canary.** A test block with no header, or whose `Assert` line names a property the body does not check, is discarded (see [traceability](traceability.md)).

## Fixtures: call the builder directly

Applies to every scope that uses fixtures — [guard](guardTest.md), [unit](unitTest.md), [integration](integrationTest.md). [Interface tests](interfaceTest.md) are the exception: they never call builders, using typed literals and `declare const` instead.

Every fixture is a direct call to the mock's builder, passing **only** the overrides that test needs; the builder fills every other field with a valid default. The builder call *is* the fixture — there is nothing to stage, spread, or assemble around it, and no fixture in the file is exempt.

```ts
// RIGHT — call the builder at each point of need, overriding only what matters
const active  = buildMyObject({ status: "active" });
const expired = buildMyObject({ status: "expired" });
```

Each of the following defeats the builder and is forbidden — the builder already does every one of them for you:

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

If you catch yourself writing a local object, spreading a built value, reassembling fields by hand, or wrapping the builder, stop — the builder replaces all of it. One direct `buildMyObject({ … })` per fixture, with only the overrides that fixture needs. The same applies to invalidators: `invalidateMyObject({ … })` directly, never staged or spread.

**Overrides are scoped to the test's objective.** Pass only the fields this test asserts on or depends on; every other field takes the builder's default. When adapting an existing test, do not carry the old literal's incidental values into the builder call — overriding `irrelevantField` merely because the pre-builder object happened to set it rebuilds the hand-rolled object one override at a time, which is the same defeat. Ask of each field: does this test's objective depend on it? If not, omit the override and let the default stand.

## Test scopes

Each scope is its own topic file. Load only the one you are working; the shared standards and fixture rules above apply to all of them.

<a id="interface"></a>
- **[Interface test](interfaceTest.md)** — proves the interface's contract by typed assignment, before the interface exists (TDD RED).
<a id="guard"></a>
- **[Guard test](guardTest.md)** — proves a guard has no false positives and no false negatives, per the mechanical case checklist.
<a id="unit"></a>
- **[Unit test](unitTest.md)** — validates behavior, before the implementation exists (TDD RED).
<a id="integration"></a>
- **[Integration test](integrationTest.md)** — exercises real code across an approved boundary, mocking only at that boundary.
<a id="e2e"></a>
- **[End-to-end test](e2eTest.md)** — reserved; full-stack against real infrastructure, in an isolated pipeline, outside the ordinary node cycle.

<a id="audit"></a>
## Test derangements

A green test is not evidence of a covered behavior. A test passes because the code is correct, or because the test was built such that it could never have failed. The two are indistinguishable by reading the result, so they are separated by **probe**, not by judgment: change something, and ask whether this test would have noticed.

Audit one test block at a time. A file-wide pass produces a summary, not an audit — the probes are per-block and must be run per-block.

Every derangement below is a defect in the **test**. Finding one is not a licence to edit the source.

### Incidental — the arrangement admits no counterfactual

The test asserts an outcome, but the fixture contains no subject the behavior would treat differently, so the assertion holds whether or not the behavior exists. A filtering test arranged with a single matching document passes with the filter deleted.

**Probe.** No-op the behavior under test — delete the filter, skip the transform, return the input unchanged. Does the test still pass? If yes, it is incidental.

**Remedy.** Populate the arrangement with the variation the behavior discriminates over — at least one subject that must be excluded, transformed differently, or rejected — and assert both sides: what survives and what does not. The `Arrange` line then names that variation, which is why it is a required field.

### Tautological — the expectation is derived from the arrangement

The test cannot fail because the answer was supplied to it. The input was constructed to be the expected output, or the expected value is computed by the same expression the implementation uses. A filtering test handed exactly the document that satisfies its assertion proves only that the document it was given is the document it was given.

**Probe.** Is any expected value produced by, derived from, or identical to the arrangement, rather than stated independently? If yes, it is tautological.

**Pass-through form.** The asserted value came from a builder default or a mock's return and the subject merely relayed it. The test proves the fixture, not the transform.

**Remedy.** State expectations as independent literals, and arrange inputs that are not already the answer. Where the value must originate in a builder, assert what the subject *did to it*, never the value itself.

The separator in one line: **incidental fails to vary the input; tautological derives the expectation from it.** Both pass; neither can fail.

### Contract–assertion mismatch

The header claims a property the body does not check, or the body checks a property the header does not claim. An unenforced comment drifts, and a drifted header is worse than no header — it tells the next auditor to stop looking.

**Probe.** Walk the `Assert` line and the body's assertions in both directions. Every claim has an assertion; every assertion has a claim.

**Remedy.** Correct whichever is wrong. If the body is right, restate the header. If the header is right, the missing assertion is the defect.

### Layer misplacement — the property belongs to another scope

Each scope owns a kind of property: shape and membership to the interface test, validity to the guard test, behavior and branching to the unit test, boundary crossing to the integration test.

**Probe.** Name the property the test asserts, then name the scope that owns it. If that is not this file's scope, the test is misplaced.

**Remedy.** Report the owning scope and where the property is already covered. Deleting a misplaced test that duplicates real coverage is correct; deleting one whose property is covered nowhere is a coverage loss — propose the move, not the deletion.

### Subject misplacement — the assertions exercise a collaborator

The behavior asserted belongs to a different function. The subject appears in the call but is incidental to the outcome: swap the subject for another implementation and the assertion still holds, because the value under assertion was produced by a dependency.

**Probe.** Which function must be correct for this assertion to hold? If it is not the subject, the test belongs to that function.

**Remedy.** Report the function the test actually covers, and propose it against that function's own node.

### Audit evidence — the carve-out from Reviewer mode

[modes](modes.md) requires each EO&D finding to be proven by a test that fails now and passes once the defect is fixed. A deranged test is the one exception: the defect **is** the test, so there is no failing test to write. The evidence is the probe result stated concretely — "no-op the filter and this test still passes," "the expected id is the id the fixture was built with." A fabricated failing test is not evidence, and a finding with no probe result is not a finding.

The audit reports and halts; it does not edit ([discovery-halt](discovery-halt.md)).

## Applying a remedy

A **block remedy** is an instruction to correct one existing test block. It is the input a test-authoring step takes when there is no workplan node — the block exists, the code it covers exists, and what is wrong is the block.

Two things produce one, and they are not interchangeable:

- **An audit** ([Test derangements](#audit)) — the block passes but could not have failed, or its header and body disagree. The evidence is the probe result.
- **A failure diagnosis** — the block fails, and the root cause is the block rather than the source: a stale expectation after a requirements change, or an assertion that never matched the contract. The evidence is the failure output and the requirement the block is wrong about.

A remedy from either producer carries the same three things forward, because the step that applies it has nothing else to work from: **the block's location**, **the contract it should prove**, and **what must change** for it to prove it. A remedy missing any of the three is not actionable, and the receiving step halts rather than inventing the difference (see [discovery-halt](discovery-halt.md)).

Neither producer edits. A remedy is applied in a later, separately instructed step, and two rules govern that step.

**A corrected block is fixed where it sits.** A defect *in* a block is remedied by rewriting that block in place. Do not append a corrected copy to the end of the file. The shared standard that new tests are appended (see [Shared standards](#shared-standards-all-test-files)) governs tests that did not exist before, not corrections to tests that did — appending a correction leaves the original sitting above it, still wrong, which is the defect now duplicated.

**A misplaced test moves; it is not rewritten.** Layer misplacement and subject misplacement are not corrected in place at all. The block's property belongs to another scope, or to another function, and the remedy relocates it there as those sections state. Rewriting a misplaced block where it sits preserves the misplacement.

## Precedence

This topic outranks the workplan. A node step that silences a RED compiler error, defines the thing under test inside its test, hand-rolls fixtures, specifies an arrangement that admits no counterfactual, derives a test's expectation from its own arrangement, re-tests shape or guard correctness in a unit test, mocks a function that is supposed to be integrated, or leaves existing tests stale during a requirements change is defective — comply with this topic and report the discrepancy.

