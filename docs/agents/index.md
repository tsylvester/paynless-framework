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
