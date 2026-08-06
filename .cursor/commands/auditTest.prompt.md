Audit **one** test block — a single `Deno.test`, `t.step`, `it`, or equivalent. The block
highlighted in the editor and attached to this command is your scope.

**One block, never a file.** A whole-file pass produces a summary, not an audit: the probes
in `docs/agents/tests.md#audit` are per-block, and each one needs that block's arrangement
held in full. If you were handed a file, audit its first block and report how many remain —
do not sweep. If the selection spans more than one block, say so and audit only the first.

Enter Reviewer mode (`docs/agents/modes.md`). Read-only: do not edit the test, the source,
or anything else, and do not run tests or the terminal (`docs/agents/environment.md`).

Before reasoning, read — this is a gate (`docs/agents/loop.md`):

1. The selected block in full: its title, its contract header, its body.
2. `docs/agents/tests.md` — the shared standards, the contract-header rule, and `#audit` in
   full — plus the scope file for the kind of test this is.
3. The function under test, from disk. You cannot judge whether a block could have failed
   without reading what it calls.

Produce the read manifest before any analysis.

Judge the block on five questions, in order:

- Does the title state a behavior, or does it merely name the function?
- Does the contract name one branch — and is that branch this function's to own?
- Does the arrangement contain the variation that branch discriminates over?
- Does the action call the subject, and is the subject the function this file tests?
- Do the assertions prove that contract, and could they have failed?

Then run every probe in `docs/agents/tests.md#audit` against the block — all five, named,
each with its result: incidental, tautological, contract–assertion mismatch, layer
misplacement, subject misplacement. Stopping at the first hit is not an audit; a block can
be two of these at once.

**If the block has no contract header** — expected, for tests written before the rule — that
is itself a finding (the contract canary). Audit it against its title, reconstruct the
contract its body actually proves, and propose the header as part of the remedy. Do not
write the header yourself.

**If the block is a skeleton** — a header with no body, or a body not yet implemented —
audit the *proposed* arrangement, action, and assertions. A contract whose stated
arrangement admits no counterfactual is incidental before a line of it is written, and
catching it there is the cheapest catch available.

State each finding's probe result concretely — "no-op the filter and this block still
passes," "the expected id is the id the fixture was built with." A deranged test is the
carve-out from Reviewer mode's failing-test requirement (`docs/agents/tests.md#audit`): do
not fabricate a failing test, and do not report a finding with no probe result.

"This block is sound" is a complete and valid outcome. Do not manufacture a finding to look
productive, and do not return "verify that" or "check whether" placeholders — this is the
verification, so perform it now (`docs/agents/precedence.md`).

This is not `check`. That reviews a completed node against the workplan; this judges one
test block on its own terms, with no node in scope. Do not go looking for one.

Conforms to: `docs/agents/tests.md#audit`, `docs/agents/modes.md`.

Explain, propose, halt. Do not edit (`docs/agents/output.md`, `docs/agents/discovery-halt.md`).
