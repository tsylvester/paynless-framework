Write a unit test to standard. This command takes one of two inputs — identify which you
were given before you read anything else.

**A workplan node** — the primary path. Write the unit test for the node's function,
exactly as the node describes. The implementation not yet existing is the RED deliverable:
never create or edit the implementation file. Each block's `Contract` transcribes one
branch of the node's `interaction.spec`.

**A block remedy** — an audit or a failure diagnosis found a defect in one existing block
and proposed its correction (`docs/agents/tests.md#applying-a-remedy`). Rewrite that block
where it sits. There is no node and no RED here: the implementation exists, and the block is
expected to pass once the defect is gone. The `Contract` comes from the remedy, since no
`interaction.spec` is in scope. If the remedy does not carry the block's location, the
contract it should prove, and what must change, halt and name what is missing — do not
invent the difference. If what you were handed is a relocation — layer or subject
misplacement — that is not this command's work: report and halt
(`docs/agents/discovery-halt.md`).

Given neither — no node, no remedy — halt and say so (`docs/agents/discovery-halt.md`). Do
not infer the assignment from whatever file happens to be open
(`docs/agents/precedence.md`).

Both paths: validate transformations and branching, not type shape or guard correctness.
When updating an existing suite for new requirements, update the existing tests in the same
pass. Factories and helpers go in the mock file. Every block carries the full four-field
contract header and the inline `// Arrange` / `// Act` / `// Assert` markers, its `Arrange`
naming the variation the branch discriminates over.

**The `interaction.spec`'s branches are the checklist, not the node's test bullets.** On the
node path, enumerate every branch the spec declares before writing — each is a condition, a
decision, a dependency call, and an outcome (`docs/agents/workplan-structure.md`) — and
every branch gets a block. The spec is the contract; the bullets under the test element are
an author's summary of it, and where they name fewer branches, they have not excluded the
rest (`docs/agents/scope.md`).

**Both arms, and every flavor within them.** A branch ending in an error return is a branch.
The return union always has a success arm and an error arm, and either may hold several
discrete flavors (`docs/agents/errors-and-returns.md`) — a suite proving every success
flavor and no error arm has covered the happy path and called it coverage. Guard rejection
on a validating function is one of these: "rejects an invalid payload with the error return"
is a unit test over an invalidated payload, not something the guard test covers for you
(`docs/agents/composition.md`).

Close with the enumeration: every branch in the spec, and the block proving it. A suite
covering fewer branches than the spec declares is incomplete
(`docs/agents/scope.md`, the coverage canary). A branch that cannot be tested as
specified — an outcome the spec names that the interface's return union has no arm for — is
a contract discrepancy: report and halt, do not drop the branch or invent an arm
(`docs/agents/discovery-halt.md`).

Conforms to: `docs/agents/tests.md#unit`, `docs/agents/tests.md#applying-a-remedy`,
`docs/agents/errors-and-returns.md`, `docs/agents/composition.md`,
`docs/agents/workplan-structure.md`.

Do only the unit test. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.
