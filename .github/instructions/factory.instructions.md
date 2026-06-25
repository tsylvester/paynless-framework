# Trusted Factories & Context Factories
* **Mock Object Factories** live in `[function].mock.ts` and:
  * Produce full, typed domain objects.
  * Accept overrides for every element, including null and undefined, so that any input pattern can be tested. 
  * Include defaults that are used when no override is provided.
* **Context Factories** construct the `RequestContext` / `ExecutionContext`:
  * Must set every field explicitly (no optional fields).
  * Must return an immutable context object.
  * Are used in both tests and production wiring to ensure parity.
* **Function Factories** live in the `[function].ts` and: 
  * Produce full, typed domain objects.
  * Use production constructors or adapters where possible.
  * Are code-reviewed and versioned.
  * May include domain-approved defaults documented in the factory file.
