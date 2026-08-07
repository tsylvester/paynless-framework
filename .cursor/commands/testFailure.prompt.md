A test is failing. Read the provided test output, the test file, and the source. You do
not run the tests — reason from the output you were given (`docs/agents/environment.md`).
Read → Analyze → Explain → Propose → Halt (`docs/agents/loop.md`) — read-only.

Find the exact root cause. State whether the failure is a defect in the **test** or in
the **source** (`docs/agents/tests.md`). The presumption is the source: never propose
changing an assertion to match broken code (`docs/agents/tests.md`). A test defect means
the test is wrong about the requirement — a stale expectation after a requirements change,
or an assertion that never matched the contract — not that the test is inconvenient.

If several tests fail, group them by root cause and propose one solution per root cause.
Believe the failure literally (`docs/agents/logging.md`) — fix the stated condition, do not
reinterpret it.

**Name the successor.** A fix is applied in a later, separately instructed step, so a
diagnosis that does not say where it goes dead-ends. Close every root cause with the
command that executes it:

- **A defect in the source** — `implement`, against the function's node.
- **A defect in the test** — the command owning that test's scope: `unitTest`,
  `guardTest`, `interfaceTest`, or `integrate`. Name which, and carry the diagnosis
  forward: the block's location, the requirement it is wrong about, and what it must
  assert instead. That command has no node to work from — what you hand it is the whole of
  its input (`docs/agents/tests.md#applying-a-remedy`).
- **A defect spanning more than one file** — a discovery, not a fix: report the impact and
  the workplan insert it needs (`docs/agents/discovery-halt.md`).

Do not edit any file. Explain and halt.

Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.