Write an integration test to standard. This command takes one of two inputs — identify which you were given before you read anything else.

**A workplan node** — the primary path. Write the integration test for the node, exactly as the node describes. A function in the integrated chain that is not built yet is not a RED deliverable here — it is a halt (`docs/agents/discovery-halt.md`), since this test runs the real chain.

**A block remedy** — an audit or a failure diagnosis found a defect in one existing block and proposed its correction (`docs/agents/tests.md#applying-a-remedy`). Rewrite that block where it sits. There is no node here: the chain exists, and the block is expected to pass once the defect is gone. `Contract` comes from the remedy; `Boundary` and `Mocked` come from what the block actually crosses and mocks, read from its body — a remedy carries a contract, not a boundary. If the remedy does not carry the block's location, the contract it should prove, and what must change, halt and name what is missing — do not invent the difference. If what you were handed is a relocation — layer or subject misplacement — that is not this command's work: report and halt (`docs/agents/discovery-halt.md`).

**Never widen the mocking to make a block pass.** This is the one temptation both producers lead to here, by different routes. An audit's tautological finding means an asserted value originated in a mock and was only relayed, and the remedy is to assert what the real chain did to the value (`docs/agents/integrationTest.md`). A failure diagnosis means the block fails against the real chain, and mocking more of that chain would make it pass while proving less than it did before. Either way the mocked surface stays at the outer boundary.

A failure diagnosis reaching this scope needs its root cause confirmed before you act. This test runs real implementations, so a failure here is more often a defect in one of those functions than in the block — and that is `implement`'s work against that function's node, in a file this command may not touch. If the block is right and the chain is wrong, say so and halt (`docs/agents/discovery-halt.md`, `docs/agents/tests.md`).

Given neither — no node, no remedy — halt and say so (`docs/agents/discovery-halt.md`). Do not infer the assignment from whatever file happens to be open (`docs/agents/precedence.md`).

Both paths: exercise the real implementations of the functions being integrated; mock only at the outer boundary of the integrated scope, never the functions under integration. Fixtures come from the mock file's builders. Every block carries the full four-field contract header and the inline markers, plus this scope's `Boundary` and `Mocked` fields — `Mocked` naming what this test therefore does not prove.

Conforms to: `docs/agents/tests.md#integration`, `docs/agents/tests.md#applying-a-remedy`.

Do only the integration test. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.

