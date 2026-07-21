Write the interface for the current node's function, exactly as the node describes.

It declares the signature — deps, params, payload, and the `Success | Error` return
union — and every type the function emits, composed down to primitives.

Conforms to: `docs/agents/composition.md`, `docs/agents/types.md`,
`docs/agents/errors-and-returns.md`, `docs/agents/dependency-injection.md`.

Do only the interface. Follow `docs/agents/loop.md` and `docs/agents/precedence.md`.
