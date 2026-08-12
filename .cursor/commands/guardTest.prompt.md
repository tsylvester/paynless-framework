Write a guard test to standard. This command takes one of two inputs — identify which you were given before you read anything else.

**A workplan node** — the primary path. Write the guard test for the node's interface, exactly as the node describes. Missing exports from the guard file are the RED deliverable.

**A block remedy** — an audit or a failure diagnosis found a defect in one existing block and proposed its correction (`docs/agents/tests.md#applying-a-remedy`). Rewrite that block where it sits. There is no node and no RED here: the guard exists and its exports resolve, and the block is expected to pass once the defect is gone. The block's `Contract` is its whole header in this scope, so the remedy's contract replaces it entire — name the checklist case the corrected block proves. If the remedy does not carry the block's location, the contract it should prove, and what must change, halt and name what is missing — do not invent the difference. If what you were handed is a relocation — layer or subject misplacement — that is not this command's work: report and halt (`docs/agents/discovery-halt.md`).

A guard-test remedy stays inside the case checklist. If the correction the remedy implies is a case the checklist does not cover — a property with no corruption case, a required field with no omission case — that is a coverage hole, not a block defect: report it and halt (`docs/agents/guards.md`, `docs/agents/discovery-halt.md`).

Given neither — no node, no remedy — halt and say so (`docs/agents/discovery-halt.md`). Do not infer the assignment from whatever file happens to be open (`docs/agents/precedence.md`).

Both paths: prove each owned guard in both directions with the case checklist — builder output `true`; invalidator output and omitted required fields `false`. Fixtures come from the mock's builders and invalidators; no casts. Every block carries the collapsed one-line `Contract` header naming the checklist case it proves — no other fields, no inline markers.

**Coverage here is two-dimensional: every owned guard, and every case per guard.** On the node path, enumerate both before writing — the guards from the guard file, and for each, the checklist cases the type's own properties generate (`docs/agents/tests.md#guard`). The node's bullets are not that list; where it names fewer guards or fewer cases than the type requires, it has not excluded the rest (`docs/agents/scope.md`).

The second dimension is where this scope actually leaks. A guard with a block or two reads as covered while the properties with no corruption case, and the required fields with no omission case, are exactly the ones the guard was never proven to check. Derive the cases from the type, never from what the guard's body happens to look at — deriving them from the body proves the guard agrees with itself.

Close with the enumeration: every owned guard, and for each, its cases and their blocks. A guard test covering fewer guards than the guard file exports, or fewer cases than the type generates, is incomplete (`docs/agents/scope.md`, the coverage canary). A case the checklist requires that cannot be written — no invalidator for it, no builder — is the coverage hole above: report and halt, do not quietly drop it.

Conforms to: `docs/agents/tests.md#guard`, `docs/agents/tests.md#applying-a-remedy`, `docs/agents/guards.md`, `docs/agents/mocks.md`, `docs/agents/tdd-ordering.md`.

Do only the guard test. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.

