Write the guard test for the current node's interface, exactly as the node describes.

Prove each owned guard in both directions with the case checklist — builder output
`true`; invalidator output and omitted required fields `false`. Fixtures come from the
mock's builders and invalidators; no casts. Missing exports from the guard file are the
RED deliverable. Every block carries the collapsed one-line `Contract` header naming the
checklist case it proves — no other fields, no inline markers.

Conforms to: `docs/agents/tests.md#guard`, `docs/agents/guards.md`, `docs/agents/mocks.md`.

Do only the guard test. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
