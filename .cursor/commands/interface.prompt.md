Write the interface for the current node's function, exactly as the node describes.

It declares the signature — deps, params, payload, and the `Success | Error` return
union — and every type the function emits, composed down to primitives.

**Completeness is set by the contract, not by the node's bullets.** The node lists
elements, not symbols; where it names fewer types than the function's contract requires,
it has not excluded the rest (`docs/agents/scope.md`). Declare every type the
signature and its emissions need, recursing until a primitive, and supply every slot —
`deps`, `params`, `payload` — even one this function does not use yet
(`docs/agents/composition.md`). A slot left out because the node did not mention it is an
incomplete contract, not a tight scope.

**This element sets the checklist every later element is measured against.** The interface's
export surface is the enumeration the mock, guard, guard test, interface test, and provides
all work from. So close with that surface reported: every symbol this interface exports, and
its kind — object type, function type, union, enum or literal alias, or class. Downstream
elements check their coverage against this list, and they cannot do it if it was never
stated (`docs/agents/scope.md`, the coverage canary).

A type this interface should own but cannot declare from the node and the files alone is a
discovery, not a guess: report it and halt (`docs/agents/discovery-halt.md`). Do not type it
inline, do not widen it to `unknown`, and do not mint a union at a use site
(`docs/agents/types.md`).

Conforms to: `docs/agents/composition.md`, `docs/agents/types.md`,
`docs/agents/errors-and-returns.md`, `docs/agents/dependency-injection.md`.

Do only the interface. Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.
