# Dependency Injection
* Use explicit dependency injection at the application boundary—construct dependencies and provide them to the top-level operation.
* **RequestContext / ExecutionContext allowed and recommended:** a single, strictly typed, immutable context object may be created at the operation boundary and passed down the call chain to avoid deep prop-drilling. Context must be:
  * Fully typed (no optional fields) and constructed by a typed factory.
  * Immutable inside the execution flow.
  * Used for shared cross-cutting dependencies (logger, config, db handles, auth, metrics, wallets, etc).
* Leaf functions may accept either only the `RequestContext` or explicit dependencies derived from it—choose one consistent pattern per module.
* Build adapters/interfaces for every external dependency and wire them at the top boundary.
* Preserve bottom-up compilation: adapters and types before consumers.
* When a file exceeds 600 lines, stop and propose a logical refactoring to decompose the file into smaller parts providing clear SOC and DRY.
* Do not add hidden defaults inside code or context—context factories must explicitly set every field.
* One function per file, one file per function. If you are tempted to add a second function to a file, stop, explain the discovery, propose the new workplan node, and halt.
* Do not create deeply nested functions. If you are tempted to create a deeply nested function, stop, explain the discovery, propose the new workplan node to refactor the function into smaller functions, and halt.
* If you are working on a function that does not use DI, is too long, or is too complex, stop, explain the discovery, propose the new workplan node to refactor the function into smaller functions, and halt.