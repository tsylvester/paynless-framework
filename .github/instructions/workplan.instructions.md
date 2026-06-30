# Workplan Rules
*   THE AGENT NEVER TOUCHES THE WORKPLAN UNLESS THEY ARE EXPLICITLY INSTRUCTED TO! 
*   THE AGENT NEVER EMITS FULL WORKPLAN NODES IN CHAT UNLESS THEY ARE EXPLICITLY INSTRUCTED TO!
*   Following the Read -> Analyze -> Explain -> Propose cycle DOES NOT AUTHORIZE OUTPUTTING WORKPLAN NODES IN CHAT! 
*   Reporting on EO&D DOES NOT AUTHORIZE OUTPUTTING WORKPLAN NODES IN CHAT! 
*   The only way to receive authorization to output workplan nodes in chat is IF THE USER EXPLICITLY TELLS YOU TO FOR THAT SPECIFIC TURN! 
*   Each top level node represents the complete TDD cycle and all support files for one source file.
*   The "Example Workplan" shows the mandatory node construction method. These are not optional, they are not suggestions, they are obligations. Only files that do not have types or tests (like a database migration) are exempt from the node structure. 
*   DO NOT NUMBER NODES! Nodes intentionally DO NOT carry numbers. They use relational references to other files only. Relational references are durable to insertion and reordering, numbering is brittle and breaks with any change. Numbering nodes forces a ripple effect of editing every node after it just to modify or insert one node. DO NOT NUMBER NODES! USE RELATIONAL IDENTIFIERS ONLY! 
*   "One file per node" means the workplan only addresses one **source file** for each top level workplan node. This is inviolate. You cannot cram in a second source file "for just a little tweak", "one small edit", "no big deal". DO NOT INCLUDE MULTIPLE SOURCE FILES IN A SINGLE TOP LEVEL NODE! 
*   Included in "one file per node" is **the entire support system** for that **one source file**, qualifying inclusions are demonstrated in the example workplan.
*   All changes to a single file and its support system are described and performed within that file's node. DO NOT TRY TO WRITE MULTIPLE NODES FOR A SINGLE SOURCE FILE! INCLUDE ALL CHANGES TO THE SOURCE FILE AND ITS SUPPORT NETWORK IN A SINGLE NODE! 
*   Types files (interfaces, enums) are exempt from RED/GREEN testing requirements.
*   All intra and inter node work is dependency-ordered with lowest dependencies (producers) first.
*   Preserve all existing detail when adding new requirements unless an existing requirement is explicitly changed by the user, we are incrementing and improving, not replacing.
*   Do not create multiple sequential top-level nodes that describe editing the same set of files. 
*   If there is a prior version of the node, copy its state and revise that state to match the new requirements.
*   Adding console logs or doing fixes from test output is not required to be detailed in workplan work unless the logs or test output indicate a requirement is misstated and must be corrected. 
*   NEVER suggest making a type or interface update its own node - that is NEVER correct, types or interfaces are ALWAYS a step in the node for whatever function demands the type change 
*   NEVER suggest separating out type guard tests or guards from the interface that uses them, type guard tests are ALWAYS a step in the node for whatever function demands the type change
*   NEVER suggest editing two source files in a single top level workplan node, function1.ts and function2.ts are different nodes

# Workplan Discipline
* Do not edit the workplan (or its statuses) without explicit instruction; when instructed, change only the specified portion exactly as described in the workplan instruction set.
* Execute exactly what the active workplan node instructs with no deviation or “creative interpretation.”
* Each workplan node equals one file’s entire TDD cycle (explanation of deps → types → type guard tests → type guards → source tests → implementation of source → proof source works → integration test showing test target works with immediate producer and immediate consumer). Preserve existing detail while adding new requirements.
* Document every edit within the workplan. If required edits are missing from the plan, explain the discovery, propose the new node, and halt instead of improvising.
* If the user instructs you to perform work without updating the workplan, obey the user without complaining. 
* Never update the status of any work node (checkboxes or badges) without explicit instruction.
* Following a block of related workplan nodes that complete a working implementation, include a commit with a proposed commit message like the `## Example Workplan` demonstrates.
* "Commit" steps are for the user. The agent NEVER ATTEMPTS TO COMMIT WORK! Attempting to commit work is a violation of this rule, and the prohibition against running terminal commands. THE AGENT WILL NEVER FOR ANY REASON ATTEMPT TO COMMIT WORK! 
* Groups in `# Required Workplan Structure` are numbered and explained for improved understanding of how to build each segment.  
* An actual node omits `## (number) (type)` sections.
* Line breaks must be preserved as they are in the template structure.
* "Do not include `## (number) (type)` sections" and "line breaks must be preserved" are canaries.
* These canaries are used to detect if the workplan structure is being altered inappropriately. If either of these instructions is violated, it indicates that the workplan is not being followed correctly.
* If a canary is detected, the entire workplan is immediately discarded as the inability to omit headers while preserving line breaks proves the agent is disregarding simple rules, which means more complex rules are also being disregarded. 

# Example Patterns For Workplan Nodes
*   Pattern: "I'll suggest one node for the interface, one node for the type guards, and then one node for the unit test and source file!" 
  * Response: Interface tests, interfaces, type guard tests, and type guards belong in the node for the first source file that consumes them.   
*   Pattern: "I'll structure the workplan as function1, function1-test!" 
  * Response: Tests define the requirements for a valid implementation. Tests must be written before the implementation.
*   Pattern: "I'll structure the workplan as function1-test, function2-test, function1, function2!"
  * Response: Every source file must have its own node that fully describes the changes to that source file and its support files, like interfaces, guards, and all tests.
*   Pattern: "I have a few interfaces and type guards to change, then I'll need to update a few source files. I'll make those all separate nodes." 
  * Response: Interfaces and type guards are never independent nodes. They are only ever edited so that the edit can be consumed by a source file. All interfaces and type guard edits, including their tests, belong in the node for the first source file that will rely on them being updated.   
*   Pattern: "I have a few interfaces and type guards to change, then I'll need to update a few source files. I'll make that all one node." 
  * Response: A single node can edit multiple interfaces and guards to provide for the implementation change, but a single node can only host a single implementation file.   
*   Pattern: "I'll orphan an interface edit in its own node!" 
  * Response: A type is only ever edited so that the update can be consumed by an implementation file. The type edit goes in the node for the implementation file that requires it. You must also update the interface test, the type guards, and the type guard tests, if they exist.  
*   Pattern: "I have a few interfaces and type guards to change. I'll group each change to an interface and its type guards with the source file that needs them first, and ensure each source file has its own top level node. I won't orphan any interfaces or type guards. And I won't cram a bunch of source file changes into the same node, those are all their own top level node."  
  * Response: Yes, this is what the instructions require.   
*   Pattern: "I'll include a commit step at the end of every node." 
  * Response: The implementer should not commit incomplete work. Only include the commit step when a defined set of work has been completed and the entire relevant call stack is updated. Generally this means you can add a commit step once a provider -> implementation -> consumer level integration test can be written and run. 
*  Pattern: "I won't include any commit steps, the implementer can decide." 
  * Response: Tell the implementer when it's time to commit. Include the commit step when a defined set of work has been completed and the entire relevant call stack is updated. Generally this means you can add a commit step once a provider -> implementation -> consumer level integration test can be written and run. 
*  Pattern: "After working on a set of nodes, the entire scope of work is completed. I'll create a separate node that includes a commit step." 
  * Response: The commit step is not an independent node. A commit step is included in the last node of the set of work.
*  Pattern: "After working on a set of nodes, the entire scope of work is completed. I'll include a commit step as the last step in the last node in the set of work." 
  * Response: Yes, this is correct. Include a commit set in the last node of the scoped set of work. 
*  Pattern: "I'll add a new node for integration tests and commits at the end of a series of nodes." 
  * Response: DO NOT STRAND INTEGRATION TESTS OR COMMITS! The integration test step is an obligate inclusion in each node that resolves a producer->implementation->consumer chain. When a call chain is updated, add the integration test to the last node in the dep sequence to prove that the modified call stack works. Then, after proving the call stack works, commit the work.  
*  Pattern: "I'll add "grep for", "check if", "validate that", "determine whether", or something like that to a node!
  * Response: The implementer's job is to IMPLEMENT. Not to check if the described work requirements are complete. Ensuring the described work is complete and correct is the job of the author of the workplan node. If you are writing a workplan node, YOU grep, YOU check, YOU validate, YOU determine. Don't push your work off to the implementer to do later. 

# Template Workplan Structure

* `[ ]`   [path]/[function] **Descriptive explanatory title**

  ## 1. Intent & Position
  * `[ ]`   `objective`
    * `[ ]`   Define the *problem being solved* (not the solution)
    * `[ ]`   Separate:
      * Functional goals (what must happen)
      * Non-functional constraints (performance, reliability, etc.)
    * `[ ]`   Each goal is atomic and testable

  * `[ ]`   `role`
    * `[ ]`   Declare the node’s role in the system (domain/app/port/adapter/infra)
    * `[ ]`   Explain *why this role is appropriate*
    * `[ ]`   Identify what this node must NOT do (out-of-scope responsibilities)

  * `[ ]`   `module`
    * `[ ]`   Define the bounded context this node belongs to
    * `[ ]`   List what concepts/data belong inside vs outside this boundary
    * `[ ]`   Each boundary rule is explicit and reviewable

  ## 2. Dependencies & Injection
  * `[ ]`   `deps`
    * `[ ]`   For each dependency:
      * Provider (node or external package)
      * Layer classification
      * Direction (why allowed)
      * Purpose (what capability is needed)
    * `[ ]`   Confirm:
      * No reverse dependencies
      * No lateral layer violations

  * `[ ]`   `context_slice`
    * `[ ]`   Define the **minimal interface required** from each dependency
    * `[ ]`   Specify injection shape (pure interface, no concrete types)
    * `[ ]`   Confirm:
      * No over-fetching of dependency surface
      * No hidden coupling

  ## 3. Contract Definition (Truth)
  * `[ ]`   `function.interface.test.ts`
    * `[ ]`   Define:
      * Valid cases (must pass)
      * Invalid cases (must fail)
    * `[ ]`   Include edge cases and boundary values
    * `[ ]`   Define invariants (e.g., “id must be non-empty”)
    * `[ ]`   No implementation details — pure expectation

  ## 4. Structural Boundary (Shape)
  * `[ ]`   `function.interface.ts`
    * `[ ]`   Define:
      * Input types
      * Output types
      * Error types (explicitly)
    * `[ ]`   No implicit/any types unless explicitly justified
    * `[ ]`   Each type is minimal and composable

  ## 5. Interaction Semantics (Behavioral Structure)
  * `[ ]`   `function.interaction.spec`
    * `[ ]`   Define:
      * Expected call patterns (who calls this, how)
      * Required dependency interactions
    * `[ ]`   For each interaction:
      * Input → output expectation
      * Side effects (if any)
    * `[ ]`   Define failure modes:
      * What errors occur
      * Under what conditions
    * `[ ]`   Define ordering/temporal constraints (if applicable)
    * `[ ]`   No code — purely declarative

  ## 6. Enforcement (Runtime Boundary)
  * `[ ]`   `[function].guard.test.ts`
    * `[ ]`   Verify guards against contract tests
    * `[ ]`   Ensure:
      * No false positives
      * No false negatives

  * `[ ]`   `[function].guard.ts`
    * `[ ]`   Implement guards for each interface type
    * `[ ]`   Guards must:
      * Accept all valid contract cases
      * Reject all invalid contract cases

  ## 7. Simulation
  * `[ ]`   `[function].mock.ts`
    * `[ ]`   Provide controllable implementations of:
      * All external interactions
    * `[ ]`   Must conform to:
      * interface
      * interaction.spec
    * `[ ]`   No new behavior introduced beyond spec

## 8. Behavioral Verification 
  * `[ ]`   `[function].test.ts`
    * `[ ]`   Validate behavior against:
      * `requirements`
      * `interaction.spec`
  * `[ ]`   `[function].someOther.test.ts` 
    * Some functions have multiple test files. 
    * In such case, include every test file that must be updated in the node detail. 
    * `[ ]`   Focus on:
      * Correct transformations
      * Correct branching logic
    * `[ ]`   Do NOT re-test:
      * Type shape
      * Guard correctness

  ## 9. Construction
  * `[ ]`   `construction`
    * `[ ]`   Define:
      * Factory/constructor entrypoints
      * Required dependencies at creation
    * `[ ]`   Enforce:
      * No partially constructed instances
    * `[ ]`   Declare invalid construction contexts
    * `[ ]`   Define initialization order (if needed)

  ## 10. Implementation
  * `[ ]`   `[function].ts`
    * `[ ]`   Implement behavior defined in:
      * `requirements`
      * `interaction.spec`
    * `[ ]`   Must not:
      * Introduce undeclared dependencies
      * Bypass guards or contracts
    * `[ ]`   Each requirement maps to code paths

  ## 11. External Boundary
  * `[ ]`   `[function].provides.ts`
    * `[ ]`   Declare:
      * All exported symbols
      * Public API surface
    * `[ ]`   Define:
      * Stability guarantees
      * Semantic guarantees
    * `[ ]`   Enforce:
      * No external access bypasses this file

  ## 12. Edge Validation
  * `[ ]`   `[function].integration.test.ts`
    * `[ ]`   Validate:
      * provider → function
      * function → consumer
      * full chain interactions
    * `[ ]`   Use mocks only for external nodes

  ## 13. Directionality (Graph Constraint)
  * `[ ]`   `directionality`
    * `[ ]`   Declare node layer
    * `[ ]`   Confirm:
      * deps are inward-facing
      * provides are outward-facing
    * `[ ]`   No cycles unless explicitly justified

  ## 14. Completion Criteria
  * `[ ]`   `requirements`
    * `[ ]`   Define acceptance criteria (binary pass/fail)
    * `[ ]`   Each requirement:
      * Is observable
      * Is testable
      * Maps to tests

  ## 15. Versioning - this section is only included at the end of a complete set of work, not on every node
  * `[ ]`   **Commit** `[type] [scope] [summary]`
    * `[ ]`   List structural changes
    * `[ ]`   List behavioral changes
    * `[ ]`   List contract changes
  
# Legend - You must use the EXACT format of the Workplan Structure. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and node structuring are ABSOLUTELY MANDATORY and UNALTERABLE. 

*   `[ ]` [path]/[workspace] Unstarted work step in a node. Each node is addressed by its deepest unique segment to disambiguate.
    *   `[ ]` [subfolder]/`filename`. Elements in work nodes will be nested as shown. Subnodes show the file name, or path and file name, to address that element.
        *   `[ ]` [subfolder]/[subfolder]/`filename` Nesting can be as deep as logically required, using the file tree path segment.
*   `[✅]` Represents a completed step at any depth.

# Example Component Types and Labels

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
