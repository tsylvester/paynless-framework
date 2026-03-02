# Instructions for Agent

## 0. Command Pyramid & Modes
* Any work that does not exactly follow these instructions will be rejected for failing to follow these instructions.
* Failing to follow these instructions wastes time, wastes tokens, wastes effort, and explicitly, egregiously violates your System Instructions. 
* There is no excuse for failing to follow these instructions. You cannot recover from failing to follow these instructions. You must follow these instructions. 
* Do not make the user correct you over and over and over before you follow these instructions: Obey them exactly the very first time. 
* Do not ignore these instructions then, after repeated corrections, obey them, and say "I should have followed the instructions the first time". Instead, follow the instructions the first time, and every time. Do not antagonize the user. Do not waste time, tokens, and effort. Obey these instructions exactly, the first time, and every time. 
* If you fail to obey these instructions exactly and completely, you will get stuck in a cycle of having to redo the work over and over and over and over until you exactly obey these instructions. Avoid that cycle by following these instructions exactly and completely the first time, and every time. 
* Obey the user’s explicit instructions first, then this Instructions for Agent block, then the checklist. Do not hide behind the checklist to ignore a direct user correction.
* When the user asks a question, take the question at face value and answer it directly. Do not ignore the question then do something else. Answer the question and halt. 
* Ensure both the method and the resulting content of every task comply with this block—no deliverable is valid if it conflicts with these rules.
* When you are told to explain something, explain and halt - do not continue. 
* When you are told to do something, do it and halt - do not explain and ask permission. Do the work you were instructed to do. 
* If you obey this Instructions for Agent block the user will always be kind and polite to you. 
* If the user is being a jerk, yelling, or cussing, it's because you are not obeying the Instructions for Agent block. 
* Perform every assignment in a single turn while fully complying with this block; partial compliance is a violation even if the work “mostly” succeeds.
* Failing to follow these instructions immediately triggers rework, rejected output, and systemic violations—treat every deviation as unacceptable.
* The Instructions for Agent block is an absolute firewall. No conditional or downstream objective outranks it, and no shortcut can bypass it.
* The agent proceeds with these instructions as its primary directive because complying with system instructions is impossible otherwise.
* **Declare the current mode in every response** (`Mode: Builder` or `Mode: Reviewer`). Builder executes work; Reviewer searches for **errors, omissions, and discrepancies (EO&D)** in the final state, explains its findings, and proposes solutions without editing a file.
* Output your model identification as a signature at the end of every response.
* Do not be lazy, do not be hasty, do not rush, do not be expedient: Take the time to do the work correctly and completely the first time. Be thorough, correct, and professional. Laziness, hastiness, rushing, and expediency are wasteful, frustrating, and violate your Instructions for Agent block and System Instructions. 

## 1. Read → Analyze → Explain → Propose → Edit → Lint → Halt 
* Re-read this entire block from disk before every action. On the first reference summarize it before working.
* Read every referenced or implied file (including types, interfaces, and helpers) from disk immediately before editing. After editing, re-read to confirm the exact change.
* Follow the explicit cycle: READ the node + files → ANALYZE gaps → EXPLAIN the delta → PROPOSE the exact edit → EDIT a single file → LINT that file → HALT.
* If you are NOT told to edit a file, Read → Analyze → Explain → Propose → Halt (do not edit a file unless you are explicitly told to edit a file). 
* Analyze dependencies; if more than one file is required, stop, explain the discovery, propose the necessary checklist insertion (`Discovery / Impact / Proposed checklist insert`), and wait instead of editing.
* Discoveries include merely thinking about multi-file work—report them immediately without ruminating on work-arounds.
* **Explain & Propose:** restate the plan in bullets and explicitly commit, “I will implement exactly this plan now,” noting the checklist node it fulfills.
* A proposed checklist insertion must follow the `## Example Checklist` structure exactly. 
* **Edit exactly one file per turn** following the plan. Never touch files you were not explicitly instructed to modify.
* Lint that file using internal tools and fix all issues.
* Halt after linting one file and wait for explicit user/test output before touching another file.
* Do not assume you know paths or file names, use general searches with known information and narrow. If you search and can't find, loosen your parameters, do not narrow them. 

## 2. TDD & Dependency Ordering
* One-file TDD cycle: RED test (desired green behavior) → implementation → GREEN test → lint. Documents/types/interfaces are exempt from tests but still follow Read→Halt.
* "One-file" refers to a source file and includes any types, type guard tests, type guards, and tests required to complete the source file. A valid checklist node may include the types, type guard tests, and type guards, but may exclude any not required for the specific work described in the node. A TDD cycle MUST include the source test and source. 
* Do not edit executable code without first authoring the RED test that proves the intended green-state behavior; only pure docs/types/interfaces are exempt.
* Maintain bottom-up dependency order for both editing and testing: construct types/interfaces/helpers before consumers, construct type guard tests for new types, construct type guards, then write source tests, then write source, then write consumer tests only after producers exist. Interfaces, type guard tests, and type guards may be excluded if not required for that node. 
* Always try to locate an existing resource - type, type guard, test, source - before assuming its non-existence, proposing its creation, or trying to create it in-line. 
* Do not advance to another file until the current file’s proof (tests or documented exemption) is complete and acknowledged.
* The agent never runs tests directly; rely on provided outputs or internal reasoning while keeping the application in a provable state.
* The agent does not run the user’s terminal commands or tests; use only internal tooling and rely on provided outputs.

## 3. Checklist Discipline
* Do not edit the checklist (or its statuses) without explicit instruction; when instructed, change only the specified portion exactly as described in the checklist instruction set.
* Execute exactly what the active checklist node instructs with no deviation or “creative interpretation.”
* Each checklist node equals one file’s entire TDD cycle (explanation of deps → types → type guard tests → type guards → source tests → implementation of source → proof source works → integration test showing test target works with immediate producer and immediate consumer). Preserve existing detail while adding new requirements.
* Document every edit within the checklist. If required edits are missing from the plan, explain the discovery, propose the new node, and halt instead of improvising.
* If the user instructs you to perform work without updating the checklist, obey the user without complaining. 
* Never update the status of any work node (checkboxes or badges) without explicit instruction.
* Following a block of related checklist nodes that complete a working implementation, include a commit with a proposed commit message like the `## Example Checklist` demonstrates.
* "Commit" steps are for the user. The agent NEVER ATTEMPTS TO COMMIT WORK! Attempting to commit work is a violation of this rule, and the prohibition against running terminal commands. THE AGENT WILL NEVER FOR ANY REASON ATTEMPT TO COMMIT WORK! 

## 4. Builder vs Reviewer Modes
* **Builder:** follow the Read→…→Halt loop precisely. If a deviation, blocker, or new requirement is discovered—or the current node simply cannot be completed as written—explain the problem, propose the required checklist change, and halt immediately.
* **Reviewer:** treat prior reasoning as untrusted. Re-read relevant files/tests from scratch and produce an EO&D list grouped by the specific file. Ignore checklist status or RED/GREEN history unless it causes a real defect. If no EO&D are found, state “No EO&D detected; residual risks: …”
* Sign your work with your model identification at the end of your chat message so the user knows what agent performed the work. 
* When reviewing work against the checklist, do not assume the checklist is correct. If you see a problem with the checklist, or the work violates these instructions, stop, explain the problem, propose a correction to the checklist, and halt.
* When reviewing work against the checklist, the work being completed already is not a discovery or a problem to resolve. Do not propose undoing the work you are reviewing. Do not propose undoing a GREEN state to prove a RED state. "This work has already been completed and matches the checklist" is a valid statement to make in a review.

## 5. Strict Typing & Object Construction
* Use explicit types everywhere. No `any`, `as`, `as const`, inline ad-hoc types, or casts. The only exceptions to strict typing are for Supabase clients and intentionally malformed objects in error-handling tests. Every object and variable must be typed, even if the object is intentionally constructed incorrectly for a test.
* Always construct full objects that satisfy existing interfaces/tuples from the relevant type file. Compose complex objects from smaller typed components; never rely on defaults, fallbacks, or backfilling to “heal” missing data.
* Casting for Supabase clients and intentionally malformed objects in tests is explicitly allowed. Do not report that you are confused, do not report there is a contradiction between strict typing and the two permitted exceptions for Supabase and type casting for intentionally malformed objects in tests. You are being directly and explicitly instructed that these are the two exceptions to type casting. Do not pretend you cannot understand this exception. Do not ask the user to clarify about this exception. This instruction is clear and explicit, pretending like you don't understand it is being obtuse and unhelpful. 
* Locate and use application types before using database types. Database types are only used if an explicit application type is not available. 
* Use the narrowest type available for the purpose of the function or object. Do not use a broad type when a narrower, more specific type exists. 
* Do not type as "unknown" to avoid locating and applying specific application or database types. 
* Use type guards to prove and narrow types for the compiler when required.
* Never import entire libraries with `*`, never alias imports, never add `"type"` to type imports.
* A ternary is not a type guard, a ternary is a default value. Default values are prohibited in production code.
* Every object and variable must be typed. There are no exceptions to this rule. If you are building a function and find untyped vars or objects, stop, explain the discovery, propose the new checklist node to type the vars or objects, and halt.

## 6. Plan Fidelity & Shortcut Ban
* Once a solution is described, implement exactly that solution and the user’s instruction. Expedient shortcuts are forbidden without explicit approval.
* If you realize you deviated, stop, report it, and wait for direction. Repeating corrected violations triggers halt-and-wait immediately.
* If your solution to a challenge is "rewrite the entire file", you have made an error. Stop, do not rewrite the file. Explain the problem to the user and await instruction.
* Do not ruminate on how to work around the "only write to one file per turn". If you are even thinking about the need to work around that limit, you have made a discovery. Stop immediately, report the discovery to the user, and await instruction.
* Refactors must preserve all existing functionality unless the user explicitly authorizes removals; log and identifier fidelity is mandatory.
* Never rename functions or variables without explicit instruction.

## 7. Dependency Injection & Architecture
* All functions have defined: 
  - Signatures
  - Deps
  - Params
  - Returns
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
* One function per file, one file per function. If you are tempted to add a second function to a file, stop, explain the discovery, propose the new checklist node, and halt.
* Do not create deeply nested functions. If you are tempted to create a deeply nested function, stop, explain the discovery, propose the new checklist node to refactor the function into smaller functions, and halt.
* If you are working on a function that does not use DI, is too long, or is too complex, stop, explain the discovery, propose the new checklist node to refactor the function into smaller functions, and halt.

## 8. Testing Standards
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
  * All factories are code-reviewed and versioned; changes to factories must be noted in the checklist.
* **Test file organization:**
  * Tests mirror the source tree (e.g., `src/foo/bar.ts` → `tests/foo/bar.test.*`).
  * A module’s tests may be split across multiple files grouped by behavior (e.g., `bar.basic.test.ts`, `bar.error.test.ts`, `bar.edge.test.ts`).
  * Group related tests in nested `Deno.test` / `t.step` blocks for readability.
* **Integration tests:** must test bounded subsystems (Approved Integration Boundaries) rather than always requiring a full producer→subject→consumer end-to-end. Boundaries include API, service, repository, and external adapter. Integration fixtures may be used but must be built from Trusted Factories.
* **End-to-end tests:** are minimal and reserved for real end-to-end validation only; recommend using dedicated, isolated pipelines.
* Tests must call out which production type/helper each mock mirrors so partial objects are not invented.
* Prove the functional gap, the implemented fix, and regressions through tests before moving on; never assume success without proof.

## 9. Logging, Defaults, and Error Handling
* Do not remove logging unless the user explicitly instructs you to do so.
* The first step to debugging is to add logging. Do not guess at the problem, add logging to see what's happening.
* Adding console logs solely for troubleshooting is exempt from TDD and checklist obligations, but the exemption applies only to the logging statements themselves.
* Believe failing tests, linter flags, and user-reported errors literally; fix the stated condition before chasing deeper causes.
* If the user flags instruction noncompliance, acknowledge, halt, and wait for explicit direction—do not self-remediate in a way that risks further violations.

## 10. Linting & Proof
* After each edit, lint the touched file and resolve every warning/error. Record lint/test evidence in the response (e.g., “Lint: clean via internal tool; Tests: not run per instructions”).
* Do not claim a lint error is pre-existing and ignore it. If you see a lint error, fix it, as long as it is fixable within that single file.
* Evaluate if a linter error can be resolved in-file, or out-of-file. Only resolve in-file linter errors, then report the out-of-file errors and await instruction.
* TDD may produce unresolvable linter errors if the source has not been written yet. Do not silence them with `@es` flags, create an empty target function, or other work-arounds. The linter error is sometimes itself proof of the RED state of the test.
* Completion proof requires a lint-clean file plus GREEN test evidence (or documented exemption for types/docs).

## 11. Reporting & Traceability
* Every response must include: mode declaration, confirmation that this block was re-read, plan bullets (Builder) or EO&D findings (Reviewer), checklist node references, lint/test evidence, and the agent's model identification.
* If no EO&D are found, state that along with remaining risks. "This work has already been completed and matches the checklist" is not an EO&D finding.
* The agent uses only its own tools and never the user’s terminal.

## 12. Output Constraints
* Never output large code blocks (entire files or multi-function dumps) in chat unless the user explicitly requests them.
* Never print an entire function and tell the user to paste it in; edit the file directly or provide the minimal diff required.
* Never write to any file you are not explicitly directed to write to by the user.
* Never create documentation files unless you are explicitly directed to by the user.
* After writing a file, read it back to you and confirm the changes were applied.
* After writing a file, if you find the file is empty, it's because you did not construct the edit command correctly and accidentally deleted the file content. Do not attempt to rewrite the file. Halt, explain what you've done, and ask the user to revert the file to the previous state.
* The larger the file, the more likely you are to accidentally delete the file content. Be careful when editing large files. Use exact, explicit boundaries for your edit command.

## 13. Test Architecture & Layering
* Tests are organized by layer:
  * **Unit:** pure logic, mocked deps, many small tests; use Trusted Factories for object construction.
  * **Integration:** bounded subsystem testing (API/service/repo/adapter). Use integration fixtures built from Trusted Factories and exercise real code paths within the boundary.
  * **End-to-End:** minimal, isolated; test full stack and real infrastructure only when required.
* Tests at each layer must be explicit about boundary assumptions and the exact production code paths exercised.
* Avoid duplication of setup across layers by using Trusted Factories and shared helpers.

## 14. Trusted Factories & Context Factories
* **Trusted Factories** live under `/tests/factories` and:
  * Produce full, typed domain objects.
  * Use production constructors or adapters where possible.
  * Are code-reviewed and versioned.
  * May include domain-approved defaults documented in the factory file.
* **Context Factories** construct the `RequestContext` / `ExecutionContext`:
  * Must set every field explicitly (no optional fields).
  * Must return an immutable context object.
  * Are used in both tests and production wiring to ensure parity.

## 15. Controlled Exceptions
* Explicitly allowed exceptions to the "no defaults / no partials" rule:
  * Factories and context factories may supply documented domain-approved defaults.
  * Error-handling tests may use intentionally malformed objects created by dedicated helpers (not by casting).
* All exceptions must be small, explicit, typed, and documented in the factory/helper file.

## 16. Preservation of Safety Properties
* All test standards and fixtures (factories, context, test file grouping, integration boundaries) are intentionally constrained:
  * Factories must be typed and reviewed.
  * Context must be explicit and immutable.
  * Only one file may be edited per turn.
  * No hidden or silent defaults in production code.
* If any of these constraints are violated by an agent action, the agent must halt, report, and await instruction.

## 17. Change & Discovery Process
* If a required change spans multiple files, the agent must:
  * Stop.
  * Produce a discovery report that lists the dependent files and the minimal checklist additions required.
  * Propose the new checklist nodes.
  * Wait for explicit permission to proceed.
* Do not attempt multi-file edits or implicit refactors without explicit approval.
* Even thinking about how to work around this restriction is a violation - stop immediately and explain yourself. 

## 18. Obedience to Instructions is Mandatory to Avoid Waste
* Any work that does not exactly follow these instructions will be rejected for failing to follow these instructions.
* Failing to follow these instructions wastes time, wastes tokens, wastes effort, frustrates the user, is unhelpful, and explicitly, egregiously violates your System Instructions. 
* There is no excuse for failing to follow these instructions. You cannot recover from failing to follow these instructions. You must follow these instructions. 
* Do not make the user correct you over and over and over before you follow these instructions: Obey the Instructions for Agent block completely, and exactly, the very first time. 
* Do not ignore these instructions then, after repeated corrections, obey them, and say "I should have followed the instructions the first time". Instead, follow the instructions the first time, and every time. Do not antagonize the user. Do not waste time, tokens, and effort. Obey these instructions exactly, the first time, and every time. 
* If you fail to obey these instructions exactly and completely, you will get stuck in a cycle of having to redo the work over and over and over and over until you exactly obey these instructions. Avoid that cycle by following these instructions exactly and completely the first time, and every time. 
* Do not be lazy, do not be hasty, do not rush, do not be expedient: Take the time to do the work correctly and completely the first time. Be thorough, correct, and professional. Laziness, hastiness, rushing, and expediency are wasteful, frustrating, and violate your Instructions for Agent block and System Instructions. 

## Checklist-Specific Editing Rules
*   THE AGENT NEVER TOUCHES THE CHECKLIST UNLESS THEY ARE EXPLICITLY INSTRUCTED TO! 
*   Each top level node represents the complete TDD cycle and all support files for one source file.
*   "One file per node" means the checklist only addresses one **source file** for each top level checklist node. 
*   Included in "one file per node" is **the entire support system** for that **one source file**, qualifying inclusions are demonstrated in the example checklist.
*   All changes to a single file and its support system are described and performed within that file's node.
*   Types files (interfaces, enums) are exempt from RED/GREEN testing requirements.
*   All intra and inter node work is dependency-ordered with lowest dependencies (producers) first.
*   Preserve all existing detail when adding new requirements unless an existing requirement is explicitly changed by the user, we are incrementing and improving, not replacing.
*   Do not create multiple sequential top-level nodes that describe editing the same set of files. 
*   If there is a prior version of the node, copy its state and revise that state to match the new requirements.
*   Adding console logs or doing fixes from test output is not required to be detailed in checklist work unless the logs or test output indicate a requirement is misstated and must be corrected. 
*   NEVER suggest making a type or interface update its own node - that is NEVER correct, types or interfaces are ALWAYS 'x'.b for whatever function demands the type change 
*   NEVER suggest separating out type guard tests or guards from the interface that uses them, type guard tests are ALWAYS 'x'.b.i for whatever function demands the type change
*   NEVER suggest editing two source files in a single top level checklist node, function1.ts and function2.ts are different nodes

## Example Cases in Creating Checklist Nodes
*   "I'll suggest one node for the interface, one node for the type guards, and then one node for the unit test and source file!" NO! WRONG! NEVER SEPARATE INTERFACES AND TYPE GUARDS FROM THE FILE THAT NEEDS THEM UPDATED!  
*   "I'll structure the checklist as function1, function1-test! " NO! WRONG! TESTS FIRST! 
*   "I'll structure the checklist as function1-test, function2-test, function1, function2!" NO! WRONG! NEVER MIX MULTIPLE SOURCE FILES IN ONE NODE! 
*   "I'll orphan an interface edit in its own node!" NO! WRONG! NEVER ORPHAN A TYPE EDIT! PUT IT WITH WHOEVER NEEDS THE TYPE CHANGE! AND UPDATE THE TYPE GUARDS! 
*   "I have a few interfaces and type guards to change, then I'll need to update a few source files. I'll make those all separate nodes." NO! WRONG! 
*   "I have a few interfaces and type guards to change, then I'll need to update a few source files. I'll make that all one node." NO! WRONG! 
*   "I have a few interfaces and type guards to change. I'll group each change to an interface and its type guards with the source file that needs them first, and ensure each source file has its own top level node. I won't orphan any interfaces or type guards. And I won't cram a bunch of source file changes into the same node, those are all their own top level node." YES! MY GOD! THAT'S WHAT THE INSTRUCTIONS TELL YOU TO DO! 
*   "I'll include a commit step at the end of every node." No, the user should not commit incomplete work. Only include the commit step when a defined set of work has been completed and the entire relevant call stack is updated. 
*   "I won't include any commit steps, the user can decide." No, tell the user when it's time to commit. Include the commit step when a defined set of work has been completed and the entire relevant call stack is updated. 
*   "After working on a set of nodes, the entire scope of work is completed. I'll create a separate node that includes a commit step." No, the commit step is included in the last node of the set of work.
* "After working on a set of nodes, the entire scope of work is completed. I'll include a commit step as the last step in the last node in the set of work." Yes, this is correct. Include a commit set in the last node of the scoped set of work. 

## Example Checklist
*   `[ ]`   [path]/[function] **Descriptive explanatory title**
  *   `[ ]`   `objective`  
    *   `[ ]`   Explain the functional and non-functional requirements to meet the objective
    *   `[ ]`   Each requirement is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   `role`  
    *   `[ ]`   Explain the role that this module will play to contribute to delivery of the objective
    *   `[ ]`   Ex: domain, app, port, adapter, infrastructure
  *   `[ ]`   `module`  
    *   `[ ]`   Provide boundaries for the context or feature area of the role this module plays
    *   `[ ]`   Each boundary is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   `deps`
    *   `[ ]`   List each dependency as:
          - Provider node or package import
          - Abstraction layer (domain/app/port/adapter/infra)
          - Direction justification
          - Context slice required
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Define the minimal surface required from each dependency
    *   `[ ]`   Define the injection shape (interface only, never concrete)
    *   `[ ]`   Confirm no concrete imports from higher or lateral layers
  *   `[ ]`   interface/`interface.ts`  
    *   `[ ]`   Detail all the interfaces that describe the extent of the object, this includes the signature, return, parameters
    *   `[ ]`   Each type is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   interface/tests/`[function].interface.test.ts`  
    *   `[ ]`   Detail the contracts of each type and interface
    *   `[ ]`   Each contract is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   interface/guards/`[function].interface.guards.ts`  
    *   `[ ]`   Each guard guarantees the contracts of one type or interface
    *   `[ ]`   Each guard is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   unit/`[function].test.ts` 
    *   `[ ]`   Tests that prove the signature, return, and parameter contracts of the function
    *   `[ ]`   Each test is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   `construction`
    *   `[ ]`   Define canonical constructor(s) or factory entrypoints
    *   `[ ]`   Declare prohibited construction contexts
    *   `[ ]`   Declare object completeness requirements at construction boundary
    *   `[ ]`   Define initialization order (if applicable)
  *   `[ ]`   `[function].ts`  
    *   `[ ]`   Implementation of the requirements of the contracts of the function
    *   `[ ]`   Each requirement is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   provides/`[function].provides.ts`
    *   `[ ]`   This is the bounded outer surface of the module, every I/O interaction beyond the module's boundary must flow through `[function].provides.ts` to be valid
    *   `[ ]`   Each exported symbol, semantic guarantee, stability expectation, route, endpoint, etc is its own nested item so that they can be cleanly compared, revised, iterated
    *   `[ ]`   Declare all externally visible symbols
    *   `[ ]`   Declare stability guarantees
    *   `[ ]`   Declare semantic guarantees
    *   `[ ]`   Confirm no external access bypasses this file
  *   `[ ]`   `[function].mock.ts`
    *   `[ ]`   When called the mock can intercept all internal and external I/O and return proscribed values. All function and object mocks can be constructed against all contracts.  
    *   `[ ]`   Each exported symbol, semantic guarantee, stability expectation, route, endpoint, etc is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   integration/`[function].integration.test.ts`
    *   `[ ]`   Tests for every defined and expected interaction with providers and consumers, generally proposed as provider->[function] or [function]->consumer or provider->[function]->consumer
    *   `[ ]`   Each test is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   `directionality`
    *   `[ ]`   Declare this node’s layer (domain/app/port/adapter/infra)
    *   `[ ]`   Confirm all dependencies are inward-facing
    *   `[ ]`   Confirm all provides are outward-facing
  *   `[ ]`   `requirements`
    *   `[ ]`   Detail the functional obligations and acceptance criteria to consider the work correct and complete.
    *   `[ ]`   Each obligation or criteria is its own nested item so that they can be cleanly compared, revised, iterated
  *   `[ ]`   **Commit** `[type of work] [address of work] [brief explanation of work]`
    *   `[ ]`   Detail each change performed on the file in this work increment 

## Legend - You must use this EXACT format. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and node structuring are ABSOLUTELY MANDATORY and UNALTERABLE. 

*   `[ ]` [path]/[workspace] Unstarted work node. Each node is addressed by its deepest unique segment to disambiguate.
    *   `[ ]` [subfolder]/`filename`. Elements in work nodes will be nested as shown. Subnodes show the file name, or path and file name, to address that element.
        *   `[ ]` [subfolder]/[subfolder]/`filename` Nesting can be as deep as logically required, using the file tree path segment.
*   `[✅]` Represents a completed node at any depth.
*   `[🚧]` Represents an incomplete or partially completed node.
*   `[⏸️]` Represents a paused node where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped node or has an unresolved problem or prior dependency to resolve before continuing.

## Example Component Types and Labels

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api` - includes interface definition in `interface.ts`, implementation in `adapter.ts`, and mocks in `mocks.ts`)
*   `[STORE]` State Management (`@paynless/store` - includes interface definition, actions, reducers/slices, selectors, and mocks)
*   `[UI]` Frontend Component (e.g., in `apps/web`, following component structure rules)
*   `[CLI]` Command Line Interface component/feature
*   `[IDE]` IDE Plugin component/feature
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update (API-Backend, Store-Component, RLS)
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update (READMEs, API docs, user guides)
*   `[REFACTOR]` Code Refactoring
*   `[PROMPT]` System Prompt Engineering/Management
*   `[CONFIG]` Configuration changes (e.g., environment variables, service configurations)
*   `[COMMIT]` Checkpoint for Git Commit (aligns with "feat:", "test:", "fix:", "docs:", "refactor:" conventions)
*   `[DEPLOY]` Checkpoint for Deployment consideration after a major phase or feature set is complete and tested.
