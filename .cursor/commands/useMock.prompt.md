This test file constructs objects inline — hand-written literals, staged-and-spread builds, or field-by-field assembly — for types that already have mock builders. Replace every in-test object construction with a direct call to the available builder.

- Work backwards up the file from the end to the beginning.
- Every point you encounter a hand-built object, find its builder.
- For every object, determine what the test actually requires to assert on.
- Where the defaults are valid for the test requirements, use them.
- Where the defaults must change for the test requirements, override them.
- Correct one single instance per tool call.
- Halt after fixing 10 instances for your work to be inspected.

Preserve what each test asserts — you are replacing construction, not changing assertions.

Use invalidators (`invalidateTypeName({ … })`) the same way for any intentionally malformed fixtures.

Conforms to: `docs/agents/tests.md` (Fixtures: call the builder directly), `docs/agents/mocks.md`. Follow the work loop (`docs/agents/loop.md`) and precedence (`docs/agents/precedence.md`) — read before you reason, and produce the read manifest first.

Follow `docs/agents/loop.md`, `docs/agents/scope.md`, and `docs/agents/precedence.md`.