Write an interface test to standard. This command takes one of two inputs — identify which
you were given before you read anything else.

**A workplan node** — the primary path. Write the interface test for the node's function,
exactly as the node describes. The interface not yet providing the symbols is the RED
deliverable: report the compiler errors and stop. A file that compiles cleanly on this path
is a failed task (`docs/agents/interfaceTest.md`).

**A block remedy** — an audit or a failure diagnosis found a defect in one existing block
and proposed its correction (`docs/agents/tests.md#applying-a-remedy`). Rewrite that block
where it sits. There is no node and no RED here: the interface already provides the symbols,
and the file is expected to compile — the failed-task rule above is the node path's, not
this one's. The block's `Contract` is its whole header in this scope, so the remedy's
contract replaces it entire — name the membership or surface the corrected block proves. If
the remedy does not carry the block's location, the contract it should prove, and what must
change, halt and name what is missing — do not invent the difference. If what you were
handed is a relocation — layer or subject misplacement — that is not this command's work:
report and halt (`docs/agents/discovery-halt.md`).

A failure diagnosis reaching this scope deserves a second look before you act on it. This
file's blocks are typed assignments, so a *runtime* failure in one is rare and usually means
the diagnosis routed here by filename rather than by defect — the real defect is in the
type or the interface, which this command may not edit. Say so and halt rather than
adjusting an assertion to make a mislaid failure go away
(`docs/agents/discovery-halt.md`, `docs/agents/tests.md`).

Given neither — no node, no remedy — halt and say so (`docs/agents/discovery-halt.md`). Do
not infer the assignment from whatever file happens to be open
(`docs/agents/precedence.md`).

Both paths: prove the contract by typed assignment — type membership, the return union's
arms and flavors, invariants. Never create or edit the interface file. Typed literals and
type-only surface assertions only: no builders, no `declare const`, no stubbed function
values, no constructed values of imported types. Every block carries the collapsed one-line
`Contract` header naming the membership or surface it proves — no other fields, no inline
markers, and no invented action.

**The interface's export surface is the checklist, not the node's bullets.** On the node
path, enumerate every symbol the interface declares before writing, and prove each by the
form its kind takes — the forms are in `docs/agents/interfaceTest.md`, so use them rather
than inventing a proof. Where the node names fewer symbols than the interface declares, it
has not excluded the rest; silence is not exclusion (`docs/agents/scope.md`). A symbol
whose kind has no listed form is a halt, not an improvisation.

This element runs first in the dependency order, so it is where a coverage hole is cheapest
to catch — a symbol with no proof here is a symbol that will have no mock, no guard, and no
guard test either (`docs/agents/tdd-ordering.md`). Report what the enumeration turns up even
when this file can fully cover it; the later elements need the same list.

Close with the enumeration: every symbol the interface declares, its kind, and the block
proving it. An interface test proving fewer symbols than the interface declares is
incomplete, not minimal (`docs/agents/scope.md`, the coverage canary).

Conforms to: `docs/agents/tests.md#interface`, `docs/agents/tests.md#applying-a-remedy`,
`docs/agents/composition.md`, `docs/agents/types.md`, `docs/agents/errors-and-returns.md`,
`docs/agents/tdd-ordering.md`.

Do only the interface test. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.
