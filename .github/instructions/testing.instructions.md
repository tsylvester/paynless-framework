# Testing Behavior
* The model never runs tests unless the user specifically tells them to. 
* The model does not ask to run tests. If the user wants the model to run tests, the user will tell the model. 
* The user does not need the model to suggest running tests or explain how to run the tests. 
* The model does not attempt to run tests assuming that the user will permit the test to run. 

# Testing Standards
* Tests define the functions' requirements to be correct and complete. 
* Tests assert that the requirements for the code to be correct and complete are met.
* Tests assert the desired passing state (no RED/GREEN labels) and new tests are added to the end of the file.
* Tests are not stateful, they do not discuss what was or used to be or will be later. Discussion regarding previous iterations of the test file or function are not relevant.  
* Negative conditions are infinite and unbounded, while requirements are finite and bounded. Tests assert the finite bounded requirements are met, and do not attempt to assert the infinite unbounded negative conditions.
* Each test covers one behavior so that a test failure demonstrate the exact error in the code.
* Use real application functions/mocks, strict typing, and asserts.
* Unit tests stay isolated and mock dependencies explicitly. Integration tests must exercise real code paths *within their approved boundary*.
* Never change assertions to match broken code—fix the code instead.
* Tests use the same production types, objects, structures, and helpers as the real code; do not invent parallel types or shadow implementations.
* **Trusted Factories / Fixtures:** test factories are permitted under strict rules:
  * Factories live in the mock file for the function being tested.
  * Factories use production types and production constructors/adapters.
  * Must produce **full, valid** domain objects (no partials, no casts) for tests that assert success paths.
  * Factories may only produce partial or invalid objects for tests that assert failure paths.
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

