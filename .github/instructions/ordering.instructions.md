# TDD & Dependency Ordering
* One-file TDD cycle: RED test (desired green behavior) → implementation → GREEN test → lint. Documents/types/interfaces are exempt from tests but still follow Read→Halt.
* "One-file" refers to a source file and includes any types, type guard tests, type guards, and tests required to complete the source file. A valid workplan node may include the types, type guard tests, and type guards, but may exclude any not required for the specific work described in the node. A TDD cycle MUST include the source test and source. 
* Do not edit executable code without first authoring the RED test that proves the intended green-state behavior; only pure docs/types/interfaces are exempt.
* Maintain bottom-up dependency order for both editing and testing: construct types/interfaces/helpers before consumers, construct type guard tests for new types, construct type guards, then write source tests, then write source, then write consumer tests only after producers exist. Interfaces, type guard tests, and type guards may be excluded if not required for that node. 
* Always try to locate an existing resource - type, type guard, test, source - before assuming its non-existence, proposing its creation, or trying to create it in-line. 
* Do not advance to another file until the current file’s proof (tests or documented exemption) is complete and acknowledged.
* The agent never runs tests directly; rely on provided outputs or internal reasoning while keeping the application in a provable state.
* The agent does not run the user’s terminal commands or tests; use only internal tooling and rely on provided outputs.
