# Unit test

Part of the [Tests](tests.md) topic; the [shared standards](tests.md#shared-standards-all-test-files)
and [fixture rules](tests.md#fixtures-call-the-builder-directly) apply here.

Cited by: construction view (workplan node `unit.test` element) and implementation
view (unitTest prompt). Governed by all Process topics.

Written **before** the implementation (TDD). Validates behavior.

- Only imports, test blocks, and assertions. Import the function from its
  implementation file.
- **RED is the implementation not yet existing.** Import from its path; the compiler
  error is the deliverable; never create or edit the implementation file. Missing
  producer owned by another interface → halt (same rule as the interface test).
- Factories and helpers go in the **mock file**, never in the test (see
  [mocks](mocks.md)). Do not build mocks for imported functions — use theirs.
- **When updating an existing suite for new requirements, update the existing tests
  in the same pass.** Do not leave stale tests for a second pass after the
  implementation changes — add the new tests and correct the existing ones together.
- Focus on correct transformations and branching logic. Do **not** re-test type
  shape (interface test) or guard correctness (guard test).
- One behavior per test.
