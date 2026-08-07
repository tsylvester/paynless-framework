This test file constructs objects inline — hand-written literals, staged-and-spread
builds, or field-by-field assembly — for types that already have mock builders. Replace
every in-test object construction with a direct call to the available builder.

First read the test file and each test's objective, then for every constructed object:

1. Find the builder for its type (search the predicate `buildTypeName`). If none exists
   in the type's home package, halt and report (`docs/agents/discovery-halt.md`).
2. Replace the construction with one direct `buildTypeName({ … })` at the point of need —
   no staged local, no spread of a built value, no local wrapper.
3. Pass only the overrides the test's objective requires; let the builder default every
   field the test does not assert on or depend on. Do not carry the old literal's
   incidental values into the overrides.

Preserve what each test asserts — you are replacing construction, not changing
assertions. Use invalidators (`invalidateTypeName({ … })`) the same way for any
intentionally malformed fixtures.

Conforms to: `docs/agents/tests.md` (Fixtures: call the builder directly),
`docs/agents/mocks.md`. Follow the work loop (`docs/agents/loop.md`) and precedence
(`docs/agents/precedence.md`) — read before you reason, and produce the read manifest
first.

Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.