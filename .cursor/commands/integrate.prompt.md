Write the integration test for the current node, exactly as the node describes.

Exercise the real implementations of the functions being integrated; mock only at the
outer boundary of the integrated scope, never the functions under integration. Every block
carries the full four-field contract header and the inline markers, plus this scope's
`Boundary` and `Mocked` fields — `Mocked` naming what this test therefore does not prove.

Conforms to: `docs/agents/tests.md#integration`.

Do only the integration test. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
