Write the unit test for the description you have been given, exactly as described.

Validate transformations and branching — not type shape or guard correctness. The
implementation not yet existing is the RED deliverable: never create or edit the
implementation file. When updating an existing suite for new requirements, update the
existing tests in the same pass. Factories and helpers go in the mock file. Every block
carries the full four-field contract header and the inline `// Arrange` / `// Act` /
`// Assert` markers, its `Contract` transcribing one branch of the node's
`interaction.spec` and its `Arrange` naming the variation that branch discriminates over.

Conforms to: `docs/agents/tests.md#unit`, `docs/agents/errors-and-returns.md`,
`docs/agents/composition.md`.

Do only the unit test. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
