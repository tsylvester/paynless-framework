# Integration test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files)
and [fixture rules](tests.md#fixtures-call-the-builder-directly) apply here.

Cited by: construction view (workplan node `integration.test` element) and
implementation view (integrate prompt). Governed by all Process topics.

Exercises real code across an approved boundary (API, service, repository, external
adapter).

- Mock **only** at the outer boundary of the integrated scope. Use the **real**
  implementation for every function being integrated — never mocks, mock factories,
  or utilities for those.
- For an integration covering `f(x) → … → f(z)` where `f(x)` consumes `f(a)` and
  `f(z)` calls `f(b)`: mock `f(a)` and `f(b)`, run the real `f(x) … f(z)`.
- Integration fixtures are built from the mock file's builders (see [mocks](mocks.md)).

### The contract header here

This scope takes the **full four-field header and the inline markers** (see
[tests](tests.md#every-test-states-its-contract)), plus two fields the other scopes do not
have:

- **Boundary** — the approved boundary this test crosses, and the chain of real functions
  it runs.
- **Mocked** — what is mocked at the outer edge, and therefore what this test does **not**
  prove.

Naming what is mocked is what lets an audit catch a test that proves a mock instead of the
integrated chain — an asserted value that originated in a mock and was only relayed is a
tautological pass (see [tests](tests.md#audit)).
