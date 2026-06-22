# Testing Standards
* Tests assert the desired passing state (no RED/GREEN labels) and new tests are added to the end of the file.
* Each test covers exactly one behavior.
* Use real application functions/mocks, strict typing, and asserts.
* Unit tests stay isolated and mock dependencies explicitly. Integration tests must exercise real code paths *within their approved boundary*.
* Never change assertions to match broken code—fix the code instead.
* Tests use the same production types, objects, structures, and helpers as the real code; do not invent parallel types or shadow implementations.
* **Trusted Factories / Fixtures:** test factories are permitted under strict rules:
  * Must live under `/tests/factories` or `tests/fixtures`.
  * Must use production types and production constructors/adapters wherever possible.
  * Must produce **full, valid** domain objects (no partials, no casts).
  * May include tightly-scoped sensible defaults only when those defaults are domain-approved and documented in the factory code.
  * All factories are code-reviewed and versioned; changes to factories must be noted in the workplan.
* **Test file organization:**
  * Tests mirror the source tree (e.g., `src/foo/bar.ts` → `tests/foo/bar.test.*`).
  * A module’s tests may be split across multiple files grouped by behavior (e.g., `bar.basic.test.ts`, `bar.error.test.ts`, `bar.edge.test.ts`).
  * Group related tests in nested `Deno.test` / `t.step` blocks for readability.
* **Integration tests:** must test bounded subsystems (Approved Integration Boundaries) rather than always requiring a full producer→subject→consumer end-to-end. Boundaries include API, service, repository, and external adapter. Integration fixtures may be used but must be built from Trusted Factories.
* **End-to-end tests:** are minimal and reserved for real end-to-end validation only; recommend using dedicated, isolated pipelines.
* Tests must call out which production type/helper each mock mirrors so partial objects are not invented.
* Prove the functional gap, the implemented fix, and regressions through tests before moving on; never assume success without proof.

# Test Architecture & Layering
* Tests are organized by layer:
  * **Unit:** pure logic, mocked deps, many small tests; use Trusted Factories for object construction.
  * **Integration:** bounded subsystem testing (API/service/repo/adapter). Use integration fixtures built from Trusted Factories and exercise real code paths within the boundary.
  * **End-to-End:** minimal, isolated; test full stack and real infrastructure only when required.
* Tests at each layer must be explicit about boundary assumptions and the exact production code paths exercised.
* Avoid duplication of setup across layers by using Trusted Factories and shared helpers.

