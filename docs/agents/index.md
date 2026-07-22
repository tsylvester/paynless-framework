# Agent Instruction Index

Single source of truth for how agents work in this repo. Every rule lives in
exactly one topic file below (DRY / SSOT / SRP). Nothing here is duplicated into
a harness's native path — each harness entry file (`CLAUDE.md`, `AGENTS.md`,
`.github/copilot-instructions.md`, `.cursor/rules/rules.mdc`) is a thin pointer
to this index.

## How to use this index

- **Process topics** govern every turn regardless of which file you touch. Read
  them first, every turn.
- **Standards topics** govern the content of one file/element. A workplan node
  element and its implementer prompt cite the **same** standards topic(s) — the
  two views never diverge.

## Process topics — govern every turn

- [precedence](precedence.md) — authority order, single-turn completeness, rejection-attribution
- [loop](loop.md) — Read → Analyze → Explain → Propose → (Edit → Lint) → Halt; one file per turn
- [discovery-halt](discovery-halt.md) — multi-file / underspecified → report, propose node, halt
- [modes](modes.md) — Builder vs Reviewer; EO&D review
- [traceability](traceability.md) — model signature, required report elements, canary mechanism
- [output](output.md) — no code in chat, no unbidden writes, safe edit boundaries
- [fidelity](fidelity.md) — no whole-file rewrites, preserve behavior on refactor, no unrequested renames
- [environment](environment.md) — tools / MCPs, language-server, worktrees, never run tests
- [linting-proof](linting-proof.md) — lint after edit, no silencing, linter error = RED proof
- [logging](logging.md) — debug by logging, believe failures literally

## Standards topics — govern file content

- [tdd-ordering](tdd-ordering.md) — TDD cycle + bottom-up dependency order
- [workplan-structure](workplan-structure.md) — node anatomy, one file per node
- [types](types.md) — strict typing, narrowest type, `unknown` only at a boundary
- [composition](composition.md) — function signature shape (deps / params / payload / return union)
- [dependency-injection](dependency-injection.md) — DI at the boundary, context factory
- [mocks](mocks.md) — builders, invalidators, function mocks
- [guards](guards.md) — guard everything, authorship, boundary litmus
- [tests](tests.md) — test authoring; anchors `#interface` `#guard` `#unit` `#integration` `#e2e`
- [errors-and-returns](errors-and-returns.md) — `Success | Error` handling
- [boundaries](boundaries.md) — provides / barrels, directionality

## Views

- **Construction view** (workplan author): the [workplan-structure](workplan-structure.md)
  node template names, per element, the standards topic(s) that element must conform to.
- **Implementation view** (file author): each element prompt points at the same
  standards topic(s) as its node element, plus all Process topics.

## Implementation routing

A map from the file you are building to the topic that governs it, the template or
example to copy, and its most common halt trigger. Every element is also governed by
all Process topics.

| Building | Conforms to | Copy from | Halt if |
|---|---|---|---|
| interface test | [tests](tests.md#interface), [composition](composition.md), [types](types.md), [errors-and-returns](errors-and-returns.md) | typed-assignment example ([tests#interface](tests.md#interface)) | a type it needs lives in another interface that does not exist yet |
| interface | [composition](composition.md), [types](types.md), [errors-and-returns](errors-and-returns.md), [dependency-injection](dependency-injection.md) | signature template ([composition](composition.md)) | a required type has no locatable definition |
| mock | [mocks](mocks.md) | builder / invalidator / function-mock templates ([mocks](mocks.md)) | an imported type's mock is missing from its home package |
| guard test | [tests](tests.md#guard), [guards](guards.md), [mocks](mocks.md) | case-checklist example ([tests#guard](tests.md#guard)) | a needed builder or invalidator belongs to an imported type and is absent |
| guard | [guards](guards.md) | guard skeleton + forbidden substitutes ([guards](guards.md)) | an imported type's guard is absent after the predicate search |
| unit test | [tests](tests.md#unit), [errors-and-returns](errors-and-returns.md), [composition](composition.md) | no positive template — the branch contract (§5) and the forbidden catalog | the implementation's producer does not exist yet |
| implementation | [composition](composition.md), [dependency-injection](dependency-injection.md), [types](types.md), [errors-and-returns](errors-and-returns.md), [guards](guards.md), [logging](logging.md) | guard-on-entry skeleton ([guards](guards.md)); body from the branch contract | an undeclared dependency or a missing guard is required |
| provides | [boundaries](boundaries.md) | export-surface example ([boundaries](boundaries.md)) | a symbol a consumer needs is not available to export |
| integration test | [tests](tests.md#integration) | boundary-mocking example ([tests#integration](tests.md#integration)) | a function in the integrated chain is not built yet |
