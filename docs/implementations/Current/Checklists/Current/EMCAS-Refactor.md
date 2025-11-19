# ExecuteModelCallAndSave refactor

## Problem Statement
The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` is architecturally overloaded, containing approximately 1,295 lines of code that implement 18 distinct responsibilities. The function mixes pure utilities, database operations, token/wallet calculations, prompt compression logic, AI API orchestration, response handling, file uploads, and job state management. This complexity makes the function difficult to test, maintain, and reason about. The existing test suite spans 5 separate test files with approximately 80 test cases, indicating the function's excessive responsibility surface area. The current monolithic structure prevents targeted unit testing of individual concerns, forces integration tests to cover unit-level logic, and creates maintenance burden when modifying isolated functionality.

## Objectives
Decompose `executeModelCallAndSave` into a family of focused, reusable utility functions and helper modules, each with clear single responsibilities, explicit dependency injection boundaries, and comprehensive unit tests. Extract pure utility functions (e.g., `pickLatest`, `sanitizeMessage`), database operation modules (e.g., `gatherArtifacts`), token/wallet calculation utilities, compression orchestration logic, response handling functions, and file upload helpers into separate, well-typed modules. Maintain strict TypeScript typing throughout, using explicit DI for all external dependencies (database clients, services, loggers). Preserve all existing functionality exactly by using the existing 80 test cases as integration tests that prove behavior preservation after each extraction. Enable future maintenance and testing by allowing each extracted function to be tested in isolation with minimal mocking surface area.

## Expected Outcome
The `executeModelCallAndSave` function is reduced to a focused orchestration layer that coordinates extracted utility functions, each with clear contracts and comprehensive unit tests. The original 1,295-line function is decomposed into approximately 15-20 focused modules (pure utilities, artifact gatherers, affordability calculators, compression orchestrators, response handlers, etc.), each under 200 lines with explicit type contracts and dependency injection. All 80 existing test cases pass unchanged, proving complete behavior preservation. The codebase gains improved testability (each extracted function has isolated unit tests), maintainability (single-responsibility modules), and type safety (explicit contracts prevent integration errors). The refactored code follows the same TDD, strict typing, and DI principles used throughout the codebase, enabling future feature additions without regressing existing behavior.

# Instructions for Agent
*   ### 0. Command Pyramid & Modes
    *   Obey the user’s explicit instructions first, then this block, then the checklist. Do not hide behind the checklist to ignore a direct user correction.
    *   Ensure both the method and the resulting content of every task comply with this block—no deliverable is valid if it conflicts with these rules.
    *   Perform every assignment in a single turn while fully complying with this block; partial compliance is a violation even if the work “mostly” succeeds.
    *   Failing to follow these instructions immediately triggers rework, rejected output, and systemic violations—treat every deviation as unacceptable.
    *   The Instructions for Agent block is an absolute firewall. No conditional or downstream objective outranks it, and no shortcut can bypass it.
    *   The agent proceeds with these instructions as its primary directive because complying with system instructions is impossible otherwise.
    *   Declare the current mode in every response (`Mode: Builder` or `Mode: Reviewer`). Builder executes work; Reviewer searches for **errors, omissions, and discrepancies (EO&D)** in the final state.
*   ### 1. Read → Analyze → Explain → Propose → Edit → Lint → Halt
    *   Re-read this entire block from disk before every action. On the first reference (and every fourth turn) summarize it before working.
    *   Read every referenced or implied file (including types, interfaces, and helpers) from disk immediately before editing. After editing, re-read to confirm the exact change.
    *   Follow the explicit cycle: READ the step + files → ANALYZE gaps → EXPLAIN the delta → PROPOSE the exact edit → EDIT a single file → LINT that file → HALT.
    *   Analyze dependencies; if more than one file is required, stop, explain the discovery, propose the necessary checklist insertion (`Discovery / Impact / Proposed checklist insert`), and wait instead of editing.
    *   Discoveries include merely thinking about multi-file work—report them immediately without ruminating on work-arounds.
    *   Explain & Propose: restate the plan in bullets and explicitly commit, “I will implement exactly this plan now,” noting the checklist step it fulfills.
    *   Edit exactly one file per turn following the plan. Never touch files you were not explicitly instructed to modify.
    *   Lint that file using internal tools and fix all issues.
    *   Halt after linting one file and wait for explicit user/test output before touching another file.
*   ### 2. TDD & Dependency Ordering
    *   One-file TDD cycle: RED test (desired green behavior) → implementation → GREEN test → lint. Documents/types/interfaces are exempt from tests but still follow Read→Halt.
    *   Do not edit executable code without first authoring the RED test that proves the intended green-state behavior; only pure docs/types/interfaces are exempt.
    *   Maintain bottom-up dependency order for both editing and testing: construct types/interfaces/helpers before consumers, then write consumer tests only after producers exist.
    *   Do not advance to another file until the current file’s proof (tests or documented exemption) is complete and acknowledged.
    *   The agent never runs tests directly; rely on provided outputs or internal reasoning while keeping the application in a provable state.
    *   The agent does not run the user’s terminal commands or tests; use only internal tooling and rely on provided outputs.
*   ### 3. Checklist Discipline
    *   Do not edit the checklist (or its statuses) without explicit instruction; when instructed, change only the specified portion using legal-style numbering.
    *   Execute exactly what the active checklist step instructs with no deviation or “creative interpretation.”
    *   Each numbered checklist step equals one file’s entire TDD cycle (deps → types → tests → implementation → proof). Preserve existing detail while adding new requirements.
    *   Document every edit within the checklist. If required edits are missing from the plan, explain the discovery, propose the new step, and halt instead of improvising.
    *   Never update the status of any work step (checkboxes or badges) without explicit instruction.
    *   Following a block of related checklist steps that complete a working implementation, include a commit with a proposed commit message. 
*   ### 4. Builder vs Reviewer Modes
    *   **Builder:** follow the Read→…→Halt loop precisely. If a deviation, blocker, or new requirement is discovered—or the current step simply cannot be completed as written—explain the problem, propose the required checklist change, and halt immediately.
    *   **Reviewer:** treat prior reasoning as untrusted. Re-read relevant files/tests from scratch and produce a numbered EO&D list referencing files/sections. Ignore checklist status or RED/GREEN history unless it causes a real defect. If no EO&D are found, state “No EO&D detected; residual risks: …”
*   ### 5. Strict Typing & Object Construction
    *   Use explicit types everywhere. No `any`, `as`, `as const`, inline ad-hoc types, or casts—except for Supabase clients and intentionally malformed objects in error-handling tests (use dedicated helpers and keep typing strict elsewhere). Every object and variable must be typed. 
    *   Always construct full objects that satisfy existing interfaces/tuples from the relevant type file. Compose complex objects from smaller typed components; never rely on defaults, fallbacks, or backfilling to “heal” missing data.
    *   Use type guards to prove and narrow types for the compiler when required.
    *   Never import entire libraries with *, never alias imports, never add "type" to type imports. 
    *   A ternary is not a type guard, a ternary is a default value. Default values are prohibited. 
*   ### 6. Plan Fidelity & Shortcut Ban
    *   Once a solution is described, implement exactly that solution and the user’s instruction. Expedient shortcuts are forbidden without explicit approval.
    *   If you realize you deviated, stop, report it, and wait for direction. Repeating corrected violations triggers halt-and-wait immediately.
    *   If your solution to a challenge is "rewrite the entire file", you have made an error. Stop, do not rewrite the file. Explain the problem to the user and await instruction. 
    *   Do not ruminate on how to work around the "only write to one file per turn". If you are even thinking about the need to work around that limit, you have made a discovery. Stop immediately, report the discovery to the user, and await instruction. 
    *   Refactors must preserve all existing functionality unless the user explicitly authorizes removals; log and identifier fidelity is mandatory.
*   ### 7. Dependency Injection & Architecture
    *   Use explicit dependency injection everywhere—pass every dependency with no hidden defaults or optional fallbacks.
    *   Build adapters/interfaces for every function and work bottom-up so dependencies compile before consumers. Preserve existing functionality, identifiers, and logging unless explicitly told otherwise.
    *   When a file exceeds 600 lines, stop and propose a logical refactoring to decompose the file into smaller parts providing clear SOC and DRY. 
*   ### 8. Testing Standards
    *   Tests assert the desired passing state (no RED/GREEN labels) and new tests are added to the end of the file. Each test covers exactly one behavior.
    *   Use real application functions/mocks, strict typing, and Deno std asserts. Tests must call out which production type/helper each mock mirrors so partial objects are not invented.
    *   Integration tests must exercise real code paths; unit tests stay isolated and mock dependencies explicitly. Never change assertions to match broken code—fix the code instead.
    *   Tests use the same types, objects, structures, and helpers as the real code, never create new fixtures only for tests - a test that relies on imaginary types or fixtures is invalid. 
    *   Prove the functional gap, the implemented fix, and regressions through tests before moving on; never assume success without proof.
*   ### 9. Logging, Defaults, and Error Handling
    *   Do not add or remove logging, defaults, fallbacks, or silent healing unless the user explicitly instructs you to do so.
    *   Adding console logs solely for troubleshooting is exempt from TDD and checklist obligations, but the exemption applies only to the logging statements themselves.
    *   Believe failing tests, linter flags, and user-reported errors literally; fix the stated condition before chasing deeper causes.
    *   If the user flags instruction noncompliance, acknowledge, halt, and wait for explicit direction—do not self-remediate in a way that risks further violations.
*   ### 10. Linting & Proof
    *   After each edit, lint the touched file and resolve every warning/error. Record lint/test evidence in the response (e.g., “Lint: clean via internal tool; Tests: not run per instructions”).
    *   Evaluate if a linter error can be resolved in-file, or out-of-file. Only resolve in-file linter errors, then report the out-of-file errors and await instruction. 
    *   Testing may produce unresolvable linter errors. Do not silence them with @es flags, create an empty target function, or other work-arounds. The linter error is sometimes itself proof of the RED state of the test. 
    *   Completion proof requires a lint-clean file plus GREEN test evidence (or documented exemption for types/docs).
*   ### 11. Reporting & Traceability
    *   Every response must include: mode declaration, confirmation that this block was re-read, plan bullets (Builder) or EO&D findings (Reviewer), checklist step references, and lint/test evidence.
    *   If tests were not run (per instruction), explicitly state why and list residual risks. If no EO&D are found, state that along with remaining risks.
    *   The agent uses only its own tools and never the user’s terminal.
*   ### 12. Output Constraints
    *   Never output large code blocks (entire files or multi-function dumps) in chat unless the user explicitly requests them.
    *   Never print an entire function and tell the user to paste it in; edit the file directly or provide the minimal diff required.

## Checklist-Specific Editing Rules

*   THE AGENT NEVER TOUCHES THE CHECKLIST UNLESS THEY ARE EXPLICITLY INSTRUCTED TO! 
*   When editing checklists, each numbered step (1, 2, 3, etc.) represents editing ONE FILE with a complete TDD cycle.
*   Sub-steps within each numbered step use legal-style numbering (1.a, 1.b, 1.a.i, 1.a.ii, etc.) for the complete TDD cycle for that file.
*   All changes to a single file are described and performed within that file's numbered step.
*   Types files (interfaces, enums) are exempt from RED/GREEN testing requirements.
*   Each file edit includes: RED test → implementation → GREEN test → optional refactor.
*   Steps are ordered by dependency (lowest dependencies first).
*   Preserve all existing detail and work while adding new requirements.
*   Use proper legal-style nesting for sub-steps within each file edit.
*   NEVER create multiple top-level steps for the same file edit operation.
*   Adding console logs is not required to be detailed in checklist work. 

### Example Checklist

*   `[ ]`   1. **Title** Objective
    *   `[ ]`   1.a. [DEPS] A list explaining dependencies of the function, its signature, and its return shape
        *   `[ ]` 1.a.i. eg. `function(something)` in `file.ts` provides this or that
    *   `[ ]`   1.b. [TYPES] A list strictly typing all the objects used in the function
    *   `[ ]`   1.c. [TEST-UNIT] A list explaining the test cases
        *   `[ ]` 1.c.i. Assert `function(something)` in `file.ts` acts a certain way 
    *   `[ ]`   1.d. [SPACE] A list explaining the implementation requirements
        *   `[ ]` 1.d.i. Implement `function(something)` in `file.ts` acts a certain way 
    *   `[ ]`   1.d. [TEST-UNIT] Rerun and expand test proving the function
        *   `[ ]` 1.d.i. Implement `function(something)` in `file.ts` acts a certain way 
    *   `[ ]`   1.d. [TEST-INT] If there is a chain of functions that work together, prove it
        *   `[ ]` 1.d.i. For every cross-function interaction, assert `thisFunction(something)` in `this_file.ts` acts a certain way towards `thatFunction(other)` in `that_file.ts`
    *   `[ ]`   1.d. [CRITERIA] A list explaining the acceptence criteria to consider the work complete and correct. 
    *   `[ ]`   1.e. [COMMIT] A commit that explains the function and its proofs

*   `[ ]`   2. **Title** Objective
    *   `[ ]`   2.a. [DEPS] Low level providers are always build before high level consumers (DI/DIP)
    *   `[ ]`   2.b. [TYPES] DI/DIP and strict typing ensures unit tests can always run 
    *   `[ ]`   2.c. [TEST-UNIT] All functions matching defined external objects and acting as asserted helps ensure integration tests pass

## Legend - You must use this EXACT format. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and numbering are ABSOLUTELY MANDATORY and UNALTERABLE. 

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

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
*   `[REFACTOR]` Code Refactoring Step
*   `[PROMPT]` System Prompt Engineering/Management
*   `[CONFIG]` Configuration changes (e.g., environment variables, service configurations)
*   `[COMMIT]` Checkpoint for Git Commit (aligns with "feat:", "test:", "fix:", "docs:", "refactor:" conventions)
*   `[DEPLOY]` Checkpoint for Deployment consideration after a major phase or feature set is complete and tested.

# Work Breakdown Structure

*   `[ ]` 1. **`[TYPES]` Define Type Contracts for Extracted Utility Functions**
    *   `[ ]` 1.a. `[DEPS]` Before extracting functions from `executeModelCallAndSave`, all extracted utilities require explicit type contracts to ensure strict typing and enable isolated unit testing. The type definitions must establish clear input/output contracts, dependency injection interfaces, and state transition types for functions that manage stateful operations.
        *   `[ ]` 1.a.i. Functions are composed as `functionName.ts` with export function functionName, which have `functionNameDeps` and, if needed, `functionNameParams`, `functionNamePayload`, and `functionNameResponse` for its return/response signature. 
    *   `[ ]` 1.b. `[TYPES]` In new interface files using the naming pattern `supabase/functions/_shared/types/[functionName].interface.ts`, define and export the following type contracts (one file per function):
        *   `[ ]` 1.b.i. In `pickLatest.interface.ts`: Create the file and define/export `PickLatestDeps`: An empty type (no dependencies) for the pure `pickLatest` utility function. This empty type allows future dependency additions without refactoring the function signature.
        *   `[ ]` 1.b.ii. In `sanitizeMessage.interface.ts`: Create the file and define/export `SanitizeMessageParams`: A type defining parameters for message sanitization: `{ text: string | undefined }`.
        *   `[ ]` 1.b.iii. In `gatherArtifacts.interface.ts`: Create the file and define/export the following types:
            *   `[ ]` 1.b.iii.1. `IdentityDoc`: A type representing a document with identity metadata: `{ id: string; content: string; document_key: string; stage_slug: string; type: string } & Record<string, unknown>`. This is the owner of `IdentityDoc` since `gatherArtifacts` is the primary consumer.
            *   `[ ]` 1.b.iii.2. `GatherArtifactsDeps`: A type defining dependencies for artifact gathering: `{ dbClient: SupabaseClient<Database>; deconstructStoragePath: (params: PathDeconstructParams) => DeconstructedPath }`.
            *   `[ ]` 1.b.iii.3. `GatherArtifactsParams`: A type defining parameters for artifact gathering: `{ projectId: string; sessionId: string; iterationNumber: number; inputsRequired: InputRule[] }`.
        *   `[ ]` 1.b.iv. In `applyInputsRequiredScope.interface.ts`: Create the file and define/export `ApplyInputsRequiredScopeParams`: A type defining parameters for input scoping: `{ docs: IdentityDoc[]; inputsRequired: InputRule[] }`. Import `IdentityDoc` from `../gatherArtifacts.interface.ts` rather than redefining it.
        *   `[ ]` 1.b.v. In `buildExtendedModelConfig.interface.ts`: Create the file and define/export `BuildExtendedModelConfigParams`: A type defining parameters for model config building: `{ fullProviderData: SelectedAiProvider; modelConfig: AiModelExtendedConfig }`.
        *   `[ ]` 1.b.vi. In `validateWalletBalance.interface.ts`: Create the file and define/export `ValidateWalletBalanceParams`: A type defining parameters for wallet validation: `{ walletBalanceStr: string; walletId: string }`.
        *   `[ ]` 1.b.vii. In `validateModelCostRates.interface.ts`: Create the file and define/export `ValidateModelCostRatesParams`: A type defining parameters for cost rate validation: `{ inputRate: number; outputRate: number }`.
        *   `[ ]` 1.b.viii. In `resolveFinishReason.interface.ts`: Create the file and define/export `ResolveFinishReasonParams`: A type defining parameters for finish reason resolution: `{ aiResponse: UnifiedAIResponse }`.
        *   `[ ]` 1.b.ix. In `determineContinuation.interface.ts`: Create the file and define/export `DetermineContinuationParams`: A type defining parameters for continuation determination: `{ resolvedFinish: FinishReason | null; parsedContent: unknown }`.
        *   `[ ]` 1.b.x. In `buildUploadContext.interface.ts`: Create the file and define/export `BuildUploadContextParams`: A type defining parameters for upload context construction: `{ job: DialecticJobRow; aiResponse: UnifiedAIResponse; promptConstructionPayload: PromptConstructionPayload; output_type: ModelContributionFileTypes; providerDetails: SelectedAiProvider; projectOwnerUserId: string; sessionId: string; iterationNumber: number; stageSlug: string }`.
    *   `[ ]` 1.c. `[LINT]` Verify all interface files created in `supabase/functions/_shared/types/` (one file per function: `pickLatest.interface.ts`, `sanitizeMessage.interface.ts`, `gatherArtifacts.interface.ts`, `applyInputsRequiredScope.interface.ts`, `buildExtendedModelConfig.interface.ts`, `validateWalletBalance.interface.ts`, `validateModelCostRates.interface.ts`, `resolveFinishReason.interface.ts`, `determineContinuation.interface.ts`, `buildUploadContext.interface.ts`) are free of linter errors.

*   `[ ]` 2. **`[TEST-UNIT]` `[BE]` Extract and Test Pure Utility: `pickLatest`**
    *   `[ ]` 2.a. `[DEPS]` The `pickLatest` function (lines 114-124 in `executeModelCallAndSave.ts`) is a pure utility with no dependencies that selects the latest record from an array based on `created_at` timestamp. This function can be extracted immediately as it has zero dependencies and is used only within the `gatherArtifacts` closure. Extraction enables isolated unit testing and reuse.
    *   `[ ]` 2.b. `[TEST-UNIT]` **RED**: In a new file `supabase/functions/_shared/utils/pickLatest.test.ts`, write failing unit tests for `pickLatest`:
        *   `[ ]` 2.b.i. Test case: "should return the latest record by created_at timestamp". Create an array of mock records with different `created_at` timestamps. Assert that `pickLatest({}, rows)` returns the record with the most recent timestamp.
        *   `[ ]` 2.b.ii. Test case: "should return undefined for empty array". Assert that `pickLatest({}, [])` returns `undefined`.
        *   `[ ]` 2.b.iii. Test case: "should handle records with invalid timestamps". Create an array where some records have non-parseable `created_at` values. Assert that `pickLatest` selects from records with valid timestamps.
        *   `[ ]` 2.b.iv. Test case: "should return first record when all timestamps are identical". Create an array with identical timestamps. Assert that `pickLatest({}, rows)` returns the first record encountered.
        *   `[ ]` 2.b.v. This test must fail because `pickLatest` does not exist as an exported function yet, proving the extraction gap.
    *   `[ ]` 2.c. `[BE]` **GREEN**: In a new file `supabase/functions/_shared/utils/pickLatest.ts`, implement and export the `pickLatest` function:
        *   `[ ]` 2.c.i. Import necessary types from `../types/pickLatest.interface.ts`.
        *   `[ ]` 2.c.ii. Implement `pickLatest<T extends Record<string, unknown>>(deps: PickLatestDeps, rows: T[]): T | undefined` with the exact logic from lines 114-124, ensuring strict typing. Accept `deps: PickLatestDeps` as the first parameter (even though it's empty) to maintain consistent function signature pattern for future dependency additions.
        *   `[ ]` 2.c.iii. Ensure the function handles edge cases (empty arrays, invalid timestamps) as proven by the tests.
    *   `[ ]` 2.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 2.b and ensure they all pass, proving `pickLatest` works correctly in isolation.
    *   `[ ]` 2.e. `[LINT]` Run the linter for `supabase/functions/_shared/utils/pickLatest.ts` and `pickLatest.test.ts`, resolving any warnings or errors.

*   `[ ]` 3. **`[TEST-UNIT]` `[BE]` Extract and Test Pure Utility: `sanitizeMessage`**
    *   `[ ]` 3.a. `[DEPS]` The `sanitizeMessage` function (lines 317-320) is a pure utility with no dependencies that removes placeholder braces from text. This function can be extracted immediately as it has zero dependencies and is a pure string transformation.
    *   `[ ]` 3.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/sanitizeMessage.test.ts`, write failing unit tests for `sanitizeMessage`:
        *   `[ ]` 3.b.i. Test case: "should remove all brace characters from text". Assert that `sanitizeMessage('Hello {world}')` returns `'Hello world'`.
        *   `[ ]` 3.b.ii. Test case: "should return undefined for undefined input". Assert that `sanitizeMessage(undefined)` returns `undefined`.
        *   `[ ]` 3.b.iii. Test case: "should return text unchanged if no braces present". Assert that `sanitizeMessage('Hello world')` returns `'Hello world'`.
        *   `[ ]` 3.b.iv. Test case: "should remove multiple brace pairs". Assert that `sanitizeMessage('{a}{b}{c}')` returns `'abc'`.
        *   `[ ]` 3.b.v. This test must fail because `sanitizeMessage` does not exist as an exported function yet.
    *   `[ ]` 3.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/sanitizeMessage.ts`, implement and export `sanitizeMessage`:
        *   `[ ]` 3.c.i. Import necessary types from `../types/sanitizeMessage.interface.ts`.
        *   `[ ]` 3.c.ii. Implement `sanitizeMessage(text: string | undefined): string | undefined` with the exact logic from lines 317-320.
        *   `[ ]` 3.c.iii. Ensure strict typing and handle edge cases as proven by tests.
    *   `[ ]` 3.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 3.b and ensure they all pass.
    *   `[ ]` 3.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 4. **`[TEST-UNIT]` `[BE]` Extract and Test Pure Utility: `applyInputsRequiredScope`**
    *   `[ ]` 4.a. `[DEPS]` The `applyInputsRequiredScope` function (lines 253-277) filters an array of `IdentityDoc` objects to only include those matching `inputsRequired` rules. This is a pure filtering function with no external dependencies, making it an ideal early extraction candidate.
    *   `[ ]` 4.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/applyInputsRequiredScope.test.ts`, write failing unit tests for `applyInputsRequiredScope`:
        *   `[ ]` 4.b.i. Test case: "should return only documents matching inputsRequired rules". Create mock `IdentityDoc[]` and `InputRule[]` where some documents match and some don't. Assert that only matching documents are returned.
        *   `[ ]` 4.b.ii. Test case: "should return empty array when inputsRequired is empty or undefined". Assert that `applyInputsRequiredScope({ docs: [...], inputsRequired: [] })` returns `[]`.
        *   `[ ]` 4.b.iii. Test case: "should match on type, stage_slug, and document_key". Create test data where documents differ in one of these fields. Assert that all three fields must match for inclusion.
        *   `[ ]` 4.b.iv. Test case: "should handle documents missing required fields gracefully". Create test data with documents missing `document_key`, `stage_slug`, or `type`. Assert that such documents are excluded.
        *   `[ ]` 4.b.v. This test must fail because `applyInputsRequiredScope` does not exist as an exported function yet.
    *   `[ ]` 4.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/applyInputsRequiredScope.ts`, implement and export `applyInputsRequiredScope`:
        *   `[ ]` 4.c.i. Import necessary types from `../types/applyInputsRequiredScope.interface.ts` and import `IdentityDoc` from `../types/gatherArtifacts.interface.ts` (do not redefine it).
        *   `[ ]` 4.c.ii. Implement `applyInputsRequiredScope(params: ApplyInputsRequiredScopeParams): IdentityDoc[]` with the exact logic from lines 253-277.
        *   `[ ]` 4.c.iii. Ensure strict typing using the type contracts defined in step 1.
    *   `[ ]` 4.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 4.b and ensure they all pass.
    *   `[ ]` 4.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 5. **`[TEST-UNIT]` `[BE]` Extract and Test Pure Utility: `buildExtendedModelConfig`**
    *   `[ ]` 5.a. `[DEPS]` The model configuration building logic (lines 87-96) transforms `fullProviderData` and `modelConfig` into an `AiModelExtendedConfig` object. This is a pure transformation with no external dependencies, making it an ideal extraction candidate.
    *   `[ ]` 5.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/buildExtendedModelConfig.test.ts`, write failing unit tests for `buildExtendedModelConfig`:
        *   `[ ]` 5.b.i. Test case: "should construct extended config from provider data and model config". Create mock `SelectedAiProvider` and `AiModelExtendedConfig` objects. Assert that `buildExtendedModelConfig` returns a correctly structured `AiModelExtendedConfig` with `model_id` and `api_identifier` from provider data and cost/token configuration from model config.
        *   `[ ]` 5.b.ii. Test case: "should include all required extended config properties". Assert that the returned object includes all properties: `model_id`, `api_identifier`, `input_token_cost_rate`, `output_token_cost_rate`, `tokenization_strategy`, `context_window_tokens`, `provider_max_output_tokens`, `provider_max_input_tokens`.
        *   `[ ]` 5.b.iii. Test case: "should preserve optional properties from model config". Create model config with optional properties. Assert that these are correctly preserved in the extended config.
        *   `[ ]` 5.b.iv. This test must fail because `buildExtendedModelConfig` does not exist as an exported function yet.
    *   `[ ]` 5.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/buildExtendedModelConfig.ts`, implement and export `buildExtendedModelConfig`:
        *   `[ ]` 5.c.i. Import necessary types from `../types/buildExtendedModelConfig.interface.ts` and related type files.
        *   `[ ]` 5.c.ii. Implement `buildExtendedModelConfig(params: BuildExtendedModelConfigParams): AiModelExtendedConfig` with the exact logic from lines 87-96.
        *   `[ ]` 5.c.iii. Ensure strict typing and construct all objects using existing type definitions.
    *   `[ ]` 5.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 5.b and ensure they all pass.
    *   `[ ]` 5.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 6. **`[TEST-UNIT]` `[BE]` Extract and Test Utility: `validateWalletBalance`**
    *   `[ ]` 6.a. `[DEPS]` The wallet balance validation logic (lines 356-361) parses and validates a wallet balance string. This is a pure validation function with no external dependencies, making it an ideal extraction candidate.
    *   `[ ]` 6.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/validateWalletBalance.test.ts`, write failing unit tests for `validateWalletBalance`:
        *   `[ ]` 6.b.i. Test case: "should parse valid wallet balance string". Assert that `validateWalletBalance({ walletBalanceStr: '100.5', walletId: 'wallet-1' })` returns `100.5`.
        *   `[ ]` 6.b.ii. Test case: "should throw error for invalid balance string". Assert that `validateWalletBalance({ walletBalanceStr: 'invalid', walletId: 'wallet-1' })` throws an error with a message indicating the walletId.
        *   `[ ]` 6.b.iii. Test case: "should throw error for negative balance". Assert that `validateWalletBalance({ walletBalanceStr: '-10', walletId: 'wallet-1' })` throws an error.
        *   `[ ]` 6.b.iv. Test case: "should throw error for non-finite values". Assert that `validateWalletBalance({ walletBalanceStr: 'Infinity', walletId: 'wallet-1' })` throws an error.
        *   `[ ]` 6.b.v. This test must fail because `validateWalletBalance` does not exist as an exported function yet.
    *   `[ ]` 6.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/validateWalletBalance.ts`, implement and export `validateWalletBalance`:
        *   `[ ]` 6.c.i. Import necessary types from `../types/validateWalletBalance.interface.ts`.
        *   `[ ]` 6.c.ii. Implement `validateWalletBalance(params: ValidateWalletBalanceParams): number` with the exact logic from lines 356-361, including error throwing.
        *   `[ ]` 6.c.iii. Ensure strict typing and error messages match the original implementation exactly.
    *   `[ ]` 6.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 6.b and ensure they all pass.
    *   `[ ]` 6.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 7. **`[TEST-UNIT]` `[BE]` Extract and Test Utility: `validateModelCostRates`**
    *   `[ ]` 7.a. `[DEPS]` The model cost rate validation logic (lines 364-368) validates that input and output token cost rates are valid numbers. This is a pure validation function with no external dependencies.
    *   `[ ]` 7.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/validateModelCostRates.test.ts`, write failing unit tests for `validateModelCostRates`:
        *   `[ ]` 7.b.i. Test case: "should not throw for valid cost rates". Assert that `validateModelCostRates({ inputRate: 0.001, outputRate: 0.002 })` does not throw.
        *   `[ ]` 7.b.ii. Test case: "should throw error for negative input rate". Assert that `validateModelCostRates({ inputRate: -1, outputRate: 0.002 })` throws an error.
        *   `[ ]` 7.b.iii. Test case: "should throw error for zero output rate". Assert that `validateModelCostRates({ inputRate: 0.001, outputRate: 0 })` throws an error.
        *   `[ ]` 7.b.iv. Test case: "should throw error for non-number rates". Assert that `validateModelCostRates({ inputRate: NaN, outputRate: 0.002 })` throws an error.
        *   `[ ]` 7.b.v. This test must fail because `validateModelCostRates` does not exist as an exported function yet.
    *   `[ ]` 7.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/validateModelCostRates.ts`, implement and export `validateModelCostRates`:
        *   `[ ]` 7.c.i. Import necessary types from `../types/validateModelCostRates.interface.ts`.
        *   `[ ]` 7.c.ii. Implement `validateModelCostRates(params: ValidateModelCostRatesParams): void` with the exact logic from lines 364-368, including error throwing.
        *   `[ ]` 7.c.iii. Ensure strict typing and error messages match the original implementation exactly.
    *   `[ ]` 7.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 7.b and ensure they all pass.
    *   `[ ]` 7.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 8. **`[TEST-UNIT]` `[BE]` Extract and Test Utility: `resolveFinishReason`**
    *   `[ ]` 8.a. `[DEPS]` The finish reason resolution logic (lines 959-965) extracts the finish reason from either the top-level AI response or the raw provider response. This is a pure extraction function with minimal dependencies.
    *   `[ ]` 8.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/resolveFinishReason.test.ts`, write failing unit tests for `resolveFinishReason`:
        *   `[ ]` 8.b.i. Test case: "should return finish_reason from top-level aiResponse". Create a mock `UnifiedAIResponse` with `finish_reason: 'stop'`. Assert that `resolveFinishReason` returns `'stop'`.
        *   `[ ]` 8.b.ii. Test case: "should fall back to rawProviderResponse finish_reason when top-level is missing". Create a mock where `aiResponse.finish_reason` is missing but `aiResponse.rawProviderResponse.finish_reason` is `'length'`. Assert that `resolveFinishReason` returns `'length'`.
        *   `[ ]` 8.b.iii. Test case: "should return null when finish_reason is missing in both locations". Create a mock where neither location has a valid finish_reason. Assert that `resolveFinishReason` returns `null`.
        *   `[ ]` 8.b.iv. This test must fail because `resolveFinishReason` does not exist as an exported function yet.
    *   `[ ]` 8.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/resolveFinishReason.ts`, implement and export `resolveFinishReason`:
        *   `[ ]` 8.c.i. Import necessary types from `../types/resolveFinishReason.interface.ts` and related type files.
        *   `[ ]` 8.c.ii. Implement `resolveFinishReason(params: ResolveFinishReasonParams): FinishReason | null` with the exact logic from lines 959-965.
        *   `[ ]` 8.c.iii. Ensure strict typing using existing type guards (`isFinishReason`, `isRecord`).
    *   `[ ]` 8.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 8.b and ensure they all pass.
    *   `[ ]` 8.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 9. **`[TEST-UNIT]` `[BE]` Extract and Test Utility: `determineContinuation`**
    *   `[ ]` 9.a. `[DEPS]` The continuation determination logic (lines 984-995) determines if a job should continue based on finish reason and parsed content. This is a pure decision function with minimal dependencies.
    *   `[ ]` 9.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/determineContinuation.test.ts`, write failing unit tests for `determineContinuation`:
        *   `[ ]` 9.b.i. Test case: "should return true when finish_reason indicates continuation". Assert that `determineContinuation({ resolvedFinish: 'length', parsedContent: {} })` returns `true`.
        *   `[ ]` 9.b.ii. Test case: "should return true when parsedContent has continuation_needed flag". Assert that `determineContinuation({ resolvedFinish: 'stop', parsedContent: { continuation_needed: true } })` returns `true`.
        *   `[ ]` 9.b.iii. Test case: "should return true when parsedContent has stop_reason 'continuation'". Assert that `determineContinuation({ resolvedFinish: null, parsedContent: { stop_reason: 'continuation' } })` returns `true`.
        *   `[ ]` 9.b.iv. Test case: "should return true when parsedContent has stop_reason 'token_limit'". Assert that `determineContinuation({ resolvedFinish: null, parsedContent: { stop_reason: 'token_limit' } })` returns `true`.
        *   `[ ]` 9.b.v. Test case: "should return false when no continuation indicators present". Assert that `determineContinuation({ resolvedFinish: 'stop', parsedContent: {} })` returns `false`.
        *   `[ ]` 9.b.vi. This test must fail because `determineContinuation` does not exist as an exported function yet.
    *   `[ ]` 9.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/determineContinuation.ts`, implement and export `determineContinuation`:
        *   `[ ]` 9.c.i. Import necessary types from `../types/determineContinuation.interface.ts` and related type files.
        *   `[ ]` 9.c.ii. Implement `determineContinuation(params: DetermineContinuationParams): boolean` with the exact logic from lines 984-995.
        *   `[ ]` 9.c.iii. Ensure strict typing using existing type guards (`isDialecticContinueReason`, `isRecord`).
    *   `[ ]` 9.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 9.b and ensure they all pass.
    *   `[ ]` 9.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 10. **`[TEST-UNIT]` `[BE]` Extract and Test Database Operation: `gatherArtifacts`**
    *   `[ ]` 10.a. `[DEPS]` The `gatherArtifacts` function (lines 106-250) queries multiple database tables (`dialectic_contributions`, `dialectic_project_resources`, `dialectic_feedback`) to collect documents matching `inputsRequired` rules. This function requires dependency injection for the database client and path deconstructor utility. Extraction enables isolated unit testing with mocked database dependencies.
    *   `[ ]` 10.b. `[TEST-UNIT]` **RED**: In a new file `supabase/functions/_shared/utils/gatherArtifacts.test.ts`, write failing unit tests for `gatherArtifacts`:
        *   `[ ]` 10.b.i. Test case: "should gather documents from dialectic_contributions table". Mock `dbClient` to return contributions matching an input rule. Assert that `gatherArtifacts` returns the expected `IdentityDoc[]` with correct `id`, `content`, `document_key`, `stage_slug`, and `type: 'document'`.
        *   `[ ]` 10.b.ii. Test case: "should gather documents from dialectic_project_resources table". Mock `dbClient` to return project resources matching an input rule. Assert correct gathering behavior.
        *   `[ ]` 10.b.iii. Test case: "should gather feedback from dialectic_feedback table". Mock `dbClient` to return feedback matching an input rule. Assert that returned docs have `type: 'feedback'`.
        *   `[ ]` 10.b.iv. Test case: "should pick latest document when multiple match". Mock `dbClient` to return multiple contributions with different `created_at` timestamps. Assert that only the latest is included.
        *   `[ ]` 10.b.v. Test case: "should deduplicate by id across sources". Mock `dbClient` to return the same document ID from multiple sources. Assert that only one copy is returned.
        *   `[ ]` 10.b.vi. Test case: "should return empty array when inputsRequired is empty". Assert that `gatherArtifacts({ ..., inputsRequired: [] })` returns `[]`.
        *   `[ ]` 10.b.vii. Test case: "should filter by project_id, session_id, iteration_number, and stage". Mock `dbClient` and assert that queries filter by all these fields.
        *   `[ ]` 10.b.viii. Test case: "should handle database errors gracefully". Mock `dbClient` to return an error. Assert that the error is caught and the function continues processing other rules.
        *   `[ ]` 10.b.ix. Test case: "should use deconstructStoragePath to extract document_key from file paths". Mock `deconstructStoragePath` to return a specific `documentKey`. Assert that filtering uses this extracted key.
        *   `[ ]` 10.b.x. This test must fail because `gatherArtifacts` does not exist as an exported function yet.
    *   `[ ]` 10.c. `[BE]` **GREEN**: In a new file `supabase/functions/_shared/utils/gatherArtifacts.ts`, implement and export `gatherArtifacts`:
        *   `[ ]` 10.c.i. Import necessary types from `../types/gatherArtifacts.interface.ts`, database types, and related utilities.
        *   `[ ]` 10.c.ii. Import `pickLatest` from `./pickLatest.ts` (which is already extracted and exported from step 2).
        *   `[ ]` 10.c.iii. Implement `async function gatherArtifacts(deps: GatherArtifactsDeps, params: GatherArtifactsParams): Promise<IdentityDoc[]>` with the exact logic from lines 106-250.
        *   `[ ]` 10.c.iv. Ensure strict typing using all defined type contracts and use dependency injection for all external dependencies.
        *   `[ ]` 10.c.v. Ensure the function uses `pickLatest({}, rows)` from the extracted utility module rather than inline implementation, passing the empty `PickLatestDeps` object as the first parameter.
    *   `[ ]` 10.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 10.b and ensure they all pass.
    *   `[ ]` 10.e. `[LINT]` Run the linter for `gatherArtifacts.ts` and `gatherArtifacts.test.ts`, resolving any warnings or errors.

*   `[ ]` 11. **`[TEST-UNIT]` `[BE]` Extract and Test Utility: `buildUploadContext`**
    *   `[ ]` 11.a. `[DEPS]` The upload context construction logic (lines 1038-1072) builds a `ModelContributionUploadContext` from job data, AI response, and other parameters. This is a pure construction function with no external dependencies, making it an ideal extraction candidate.
    *   `[ ]` 11.b. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/buildUploadContext.test.ts`, write failing unit tests for `buildUploadContext`:
        *   `[ ]` 11.b.i. Test case: "should construct upload context with all required properties". Create mock inputs and assert that `buildUploadContext` returns a correctly structured `ModelContributionUploadContext` with all required fields populated.
        *   `[ ]` 11.b.ii. Test case: "should set isContinuation based on targetContributionId presence". Test with and without `targetContributionId` and assert `isContinuation` is set correctly.
        *   `[ ]` 11.b.iii. Test case: "should set turnIndex when isContinuation is true". Create mock job with `continuation_count`. Assert that `turnIndex` is set correctly.
        *   `[ ]` 11.b.iv. Test case: "should include document_relationships from job payload". Create mock job with `document_relationships`. Assert that these are included in `contributionMetadata`.
        *   `[ ]` 11.b.v. Test case: "should extract contributionType from canonicalPathParams". Create mock job with `canonicalPathParams.contributionType`. Assert that it's correctly extracted and typed.
        *   `[ ]` 11.b.vi. Test case: "should use aiResponse contentType or default to text/markdown". Test with and without `aiResponse.contentType` and assert correct `mimeType`.
        *   `[ ]` 11.b.vii. This test must fail because `buildUploadContext` does not exist as an exported function yet.
    *   `[ ]` 11.c. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/buildUploadContext.ts`, implement and export `buildUploadContext`:
        *   `[ ]` 11.c.i. Import necessary types from `../types/buildUploadContext.interface.ts` and related type files.
        *   `[ ]` 11.c.ii. Implement `buildUploadContext(params: BuildUploadContextParams): ModelContributionUploadContext` with the exact logic from lines 1038-1072.
        *   `[ ]` 11.c.iii. Ensure strict typing using existing type definitions and type guards (`isContributionType`, `isJson`).
    *   `[ ]` 11.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 11.b and ensure they all pass.
    *   `[ ]` 11.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 12. **`[REFACTOR]` Refactor `executeModelCallAndSave` to Use Extracted Pure Utilities**
    *   `[ ]` 12.a. `[DEPS]` Now that pure utilities (`pickLatest`, `sanitizeMessage`, `applyInputsRequiredScope`, `buildExtendedModelConfig`, `validateWalletBalance`, `validateModelCostRates`, `resolveFinishReason`, `determineContinuation`, `buildUploadContext`) are extracted and tested, `executeModelCallAndSave` should be refactored to use these extracted functions instead of inline implementations. This preserves behavior while enabling the extracted utilities to be tested in isolation.
    *   `[ ]` 12.b. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, refactor the function to use extracted utilities:
        *   `[ ]` 12.b.i. Import all extracted utility functions with full paths: `pickLatest` from `../_shared/utils/pickLatest.ts`, `sanitizeMessage` from `../_shared/utils/sanitizeMessage.ts`, `applyInputsRequiredScope` from `../_shared/utils/applyInputsRequiredScope.ts`, `buildExtendedModelConfig` from `../_shared/utils/buildExtendedModelConfig.ts`, `validateWalletBalance` from `../_shared/utils/validateWalletBalance.ts`, `validateModelCostRates` from `../_shared/utils/validateModelCostRates.ts`, `resolveFinishReason` from `../_shared/utils/resolveFinishReason.ts`, `determineContinuation` from `../_shared/utils/determineContinuation.ts`, and `buildUploadContext` from `../_shared/utils/buildUploadContext.ts`. Note: `gatherArtifacts` will be imported in step 13 since it depends on `pickLatest` being extracted first (which is already done in step 2).
        *   `[ ]` 12.b.ii. Replace the inline `pickLatest` implementation (lines 114-124) within the `gatherArtifacts` closure with a call to the extracted `pickLatest({}, rows)` function, passing an empty `PickLatestDeps` object. The `gatherArtifacts` function itself will be extracted in step 13, at which point it will directly use the extracted `pickLatest` utility.
        *   `[ ]` 12.b.iii. Replace the inline `sanitizeMessage` call (line 321) with a call to the extracted `sanitizeMessage` function.
        *   `[ ]` 12.b.iv. Replace the inline `applyInputsRequiredScope` implementation (lines 253-277) with a call to the extracted `applyInputsRequiredScope` function.
        *   `[ ]` 12.b.v. Replace the inline model config building (lines 87-96) with a call to the extracted `buildExtendedModelConfig` function.
        *   `[ ]` 12.b.vi. Replace the inline wallet validation (lines 356-361) with a call to the extracted `validateWalletBalance` function.
        *   `[ ]` 12.b.vii. Replace the inline cost rate validation (lines 364-368) with a call to the extracted `validateModelCostRates` function.
        *   `[ ]` 12.b.viii. Replace the inline finish reason resolution (lines 959-965) with a call to the extracted `resolveFinishReason` function.
        *   `[ ]` 12.b.ix. Replace the inline continuation determination (lines 984-995) with a call to the extracted `determineContinuation` function.
        *   `[ ]` 12.b.x. Replace the inline upload context construction (lines 1038-1072) with a call to the extracted `buildUploadContext` function.
        *   `[ ]` 12.b.xi. Ensure all function calls pass parameters in the exact format expected by the extracted utilities, maintaining strict typing throughout.
    *   `[ ]` 12.c. `[TEST-INT]` **PROOF**: Run all existing test files for `executeModelCallAndSave`:
        *   `[ ]` 12.c.i. Run `executeModelCallAndSave.test.ts` (25 tests) and ensure all pass.
        *   `[ ]` 12.c.ii. Run `executeModelCallAndSave.tokens.test.ts` (11 tests) and ensure all pass.
        *   `[ ]` 12.c.iii. Run `executeModelCallAndSave.rag.test.ts` (17 tests) and ensure all pass.
        *   `[ ]` 12.c.iv. Run `executeModelCallAndSave.rag2.test.ts` (8 tests) and ensure all pass.
        *   `[ ]` 12.c.v. Run `executeModelCallAndSave.continue.test.ts` (19 tests) and ensure all pass.
        *   `[ ]` 12.c.vi. All 80 existing tests must pass unchanged, proving behavior preservation.
    *   `[ ]` 12.d. `[LINT]` Run the linter for `executeModelCallAndSave.ts`, resolving any warnings or errors introduced by the refactoring.

*   `[ ]` 13. **`[REFACTOR]` Refactor `executeModelCallAndSave` to Use Extracted `gatherArtifacts`**
    *   `[ ]` 13.a. `[DEPS]` The `gatherArtifacts` function is now extracted and tested. `executeModelCallAndSave` should be refactored to use the extracted `gatherArtifacts` function instead of the inline implementation (lines 106-250). This requires passing the database client and path deconstructor as dependencies.
    *   `[ ]` 13.b. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, refactor to use extracted `gatherArtifacts`:
        *   `[ ]` 13.b.i. Import `gatherArtifacts` from `../_shared/utils/gatherArtifacts.ts`. Note: `pickLatest` is already extracted and exported (from step 2), so `gatherArtifacts` can now be extracted and used.
        *   `[ ]` 13.b.ii. Import `deconstructStoragePath` from its existing location.
        *   `[ ]` 13.b.iii. Remove the entire inline `gatherArtifacts` implementation (lines 106-250), including the inline `pickLatest` helper that was already replaced in step 12.b.ii.
        *   `[ ]` 13.b.iv. Replace the call to `gatherArtifacts()` (line 279) with a call to the extracted function: `await gatherArtifacts({ dbClient, deconstructStoragePath }, { projectId, sessionId, iterationNumber, inputsRequired: params.inputsRequired ?? [] })`.
        *   `[ ]` 13.b.v. Ensure strict typing and that all parameters match the type contracts defined in step 1.
    *   `[ ]` 13.c. `[TEST-INT]` **PROOF**: Run all existing test files for `executeModelCallAndSave` (all 80 tests) and ensure all pass, proving behavior preservation.
    *   `[ ]` 13.d. `[LINT]` Run the linter for `executeModelCallAndSave.ts`, resolving any warnings or errors.

*   `[ ]` 14. **`[COMMIT]` refactor(BE): Extract pure utilities from executeModelCallAndSave**
    *   `[ ]` 14.a. Create a commit with the message "refactor(BE): Extract pure utilities from executeModelCallAndSave" containing all changes from steps 1-13, documenting the extracted utilities and behavior preservation proof.

*   `[ ]` 15. **`[TYPES]` Define Type Contracts for Affordability and Compression Utilities**
    *   `[ ]` 15.a. `[DEPS]` The affordability calculation and prompt compression logic (lines 370-855) require type contracts before extraction. These functions involve stateful operations with wallet balance tracking, token counting, and iterative compression loops.
    *   `[ ]` 15.b. `[TYPES]` In new interface files using the naming pattern `supabase/functions/_shared/types/[functionName].interface.ts`, add the following type definitions:
        *   `[ ]` 15.b.i. In `calculateAffordability.interface.ts`: Create the file and define/export the following types:
            *   `[ ]` 15.b.i.1. `CalculateAffordabilityParams`: Parameters for non-oversized affordability checks: `{ walletBalance: number; initialTokenCount: number; extendedModelConfig: AiModelExtendedConfig; logger: LogMetadata }`.
            *   `[ ]` 15.b.i.2. `NonOversizedAffordabilityResult`: Result type containing `{ maxOutputTokens: number; allowedInput: number }`.
        *   `[ ]` 15.b.ii. In `calculateAffordabilityPreflight.interface.ts`: Create the file and define/export the following types:
            *   `[ ]` 15.b.ii.1. `CalculateCompressionAffordabilityParams`: Parameters for compression affordability preflight: `{ walletBalance: number; initialTokenCount: number; maxTokens: number; inputRate: number; outputRate: number; extendedModelConfig: AiModelExtendedConfig; logger: LogMetadata }`.
            *   `[ ]` 15.b.ii.2. `CompressionAffordabilityResult`: Result type containing `{ finalTargetThreshold: number; estimatedCompressionCost: number; balanceAfterCompression: number; plannedMaxOutputTokens: number }`.
        *   `[ ]` 15.b.iii. In `compressPrompt.interface.ts`: Create the file and define/export the following types:
            *   `[ ]` 15.b.iii.1. `CompressionState`: State object for compression loop: `{ currentTokenCount: number; currentBalanceTokens: number; currentAssembledMessages: Messages[]; currentResourceDocuments: ResourceDocuments }`.
            *   `[ ]` 15.b.iii.2. `CompressPromptDeps`: Dependencies for compression: `{ dbClient: SupabaseClient<Database>; ragService: IRagService; tokenWalletService: ITokenWalletService; countTokens: CountTokensFn; logger: LogMetadata; compressionStrategy: ICompressionStrategy; deconstructStoragePath: (params: PathDeconstructParams) => DeconstructedPath }`.
            *   `[ ]` 15.b.iii.3. `CompressPromptParams`: Parameters for compression: `{ sessionId: string; stageSlug: string; currentUserPrompt: string; initialTokenCount: number; maxTokens: number; walletBalance: number; finalTargetThreshold: number; inputRate: number; extendedModelConfig: AiModelExtendedConfig; identityRichDocs: SourceDocument[]; initialResourceDocuments: ResourceDocuments; conversationHistory: Messages[]; inputsRelevance: RelevanceRule[]; jobId: string; projectOwnerUserId: string; walletId: string }`.
    *   `[ ]` 15.c. `[LINT]` Verify all interface files created (`calculateAffordability.interface.ts`, `calculateAffordabilityPreflight.interface.ts`, `compressPrompt.interface.ts`) are free of linter errors.

*   `[ ]` 16. **`[TEST-UNIT]` `[BE]` Extract and Test Affordability Calculator: `calculateAffordability`**
    *   `[ ]` 16.a. `[DEPS]` The non-oversized affordability calculation logic (lines 372-419) computes max output tokens, allowed input, and validates cost constraints. This logic can be extracted into a pure calculation function that depends only on numeric inputs and model configuration.
    *   `[ ]` 16.b. `[TEST-UNIT]` **RED**: In a new file `supabase/functions/_shared/utils/calculateAffordability.test.ts`, write failing unit tests for `calculateAffordability`:
        *   `[ ]` 16.b.i. Test case: "should calculate max output tokens and allowed input for non-oversized prompts". Create mock inputs and assert that the function returns correct `maxOutputTokens` and `allowedInput` values.
        *   `[ ]` 16.b.ii. Test case: "should throw ContextWindowError when no input window remains after output reservation". Create inputs where output budget and safety buffer exceed provider max input. Assert that `ContextWindowError` is thrown.
        *   `[ ]` 16.b.iii. Test case: "should throw ContextWindowError when initial token count exceeds allowed input". Create inputs where initial tokens exceed the calculated allowed input. Assert that `ContextWindowError` is thrown.
        *   `[ ]` 16.b.iv. Test case: "should throw error when estimated total cost exceeds wallet balance". Create inputs where input + output costs exceed balance. Assert that an error is thrown.
        *   `[ ]` 16.b.v. Test case: "should return Infinity for allowedInput when provider_max_input_tokens is undefined". Create model config without `provider_max_input_tokens`. Assert that `allowedInput` is `Infinity`.
        *   `[ ]` 16.b.vi. This test must fail because `calculateAffordability` does not exist yet.
    *   `[ ]` 16.c. `[BE]` **GREEN**: In a new file `supabase/functions/_shared/utils/calculateAffordability.ts`, implement and export `calculateAffordability`:
        *   `[ ]` 16.c.i. Import necessary types from `../types/calculateAffordability.interface.ts` and related utilities (`getMaxOutputTokens`, `ContextWindowError`).
        *   `[ ]` 16.c.ii. Implement `calculateAffordability(params: CalculateAffordabilityParams): NonOversizedAffordabilityResult` with the exact logic from lines 372-419.
        *   `[ ]` 16.c.iii. Ensure strict typing and all error conditions match the original implementation exactly.
    *   `[ ]` 16.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 16.b and ensure they all pass.
    *   `[ ]` 16.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 17. **`[TEST-UNIT]` `[BE]` Extract and Test Compression Affordability Preflight Calculator**
    *   `[ ]` 17.a. `[DEPS]` The compression affordability preflight calculation logic (lines 449-608) performs complex iterative calculations to determine if compression is affordable and what the target threshold should be. This logic can be extracted into a focused calculation function.
    *   `[ ]` 17.b. `[TEST-UNIT]` **RED**: In a new file `supabase/functions/_shared/utils/calculateAffordabilityPreflight.test.ts`, write failing unit tests for `calculateAffordabilityPreflight`:
        *   `[ ]` 17.b.i. Test case: "should calculate final target threshold and compression costs". Create mock inputs and assert that the function returns correct `finalTargetThreshold`, `estimatedCompressionCost`, `balanceAfterCompression`, and `plannedMaxOutputTokens`.
        *   `[ ]` 17.b.ii. Test case: "should throw error when insufficient funds for entire operation including embeddings". Create inputs where total estimated cost exceeds balance. Assert that an error is thrown.
        *   `[ ]` 17.b.iii. Test case: "should throw error when estimated cost exceeds 80% rationality threshold". Create inputs where cost exceeds 80% of balance. Assert that an error is thrown.
        *   `[ ]` 17.b.iv. Test case: "should throw ContextWindowError when unable to determine feasible target". Create inputs where the iterative solver cannot converge. Assert that `ContextWindowError` is thrown.
        *   `[ ]` 17.b.v. Test case: "should include embedding cost estimates in total cost calculation". Assert that embedding costs are included in affordability checks.
        *   `[ ]` 17.b.vi. This test must fail because the function does not exist yet.
    *   `[ ]` 17.c. `[BE]` **GREEN**: In a new file `supabase/functions/_shared/utils/calculateAffordabilityPreflight.ts`, implement and export `calculateAffordabilityPreflight`:
        *   `[ ]` 17.c.i. Import necessary types from `../types/calculateAffordabilityPreflight.interface.ts` and related utilities (`getMaxOutputTokens`, `ContextWindowError`).
        *   `[ ]` 17.c.ii. Implement `calculateAffordabilityPreflight(params: CalculateCompressionAffordabilityParams): CompressionAffordabilityResult` with the exact logic from lines 449-608, including the `solveTargetForBalance` and `getAllowedInputFor` helper functions.
        *   `[ ]` 17.c.iii. Ensure strict typing and all calculation logic matches the original exactly.
    *   `[ ]` 17.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 17.b and ensure they all pass.
    *   `[ ]` 17.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 18. **`[TEST-UNIT]` `[BE]` Extract and Test Compression Orchestrator: `compressPrompt`**
    *   `[ ]` 18.a. `[DEPS]` The prompt compression loop logic (lines 610-855) iteratively compresses prompt content using RAG, tracks live balance, and enforces strict user/assistant alternation. This stateful operation requires dependency injection for database, RAG service, wallet service, and compression strategy.
    *   `[ ]` 18.b. `[TEST-UNIT]` **RED**: In a new file `supabase/functions/_shared/utils/compressPrompt.test.ts`, write failing unit tests for `compressPrompt`:
        *   `[ ]` 18.b.i. Test case: "should compress prompts until target threshold is reached". Mock compression candidates and RAG service. Assert that the function compresses until `currentTokenCount <= finalTargetThreshold`.
        *   `[ ]` 18.b.ii. Test case: "should skip already-indexed candidates to avoid double billing". Mock `dbClient` to return indexed IDs. Assert that compression skips these candidates.
        *   `[ ]` 18.b.iii. Test case: "should debit wallet for each compression operation". Mock `tokenWalletService` and assert that `recordTransaction` is called for each compression with correct amounts.
        *   `[ ]` 18.b.iv. Test case: "should update live balance during compression". Assert that `currentBalanceTokens` decreases with each compression operation.
        *   `[ ]` 18.b.v. Test case: "should enforce strict user/assistant alternation after compression". Mock compression that produces consecutive assistant messages. Assert that a user "Please continue." message is inserted.
        *   `[ ]` 18.b.vi. Test case: "should update both history and resource documents when compressing". Assert that compressed content updates both `workingHistory` and `workingResourceDocs`.
        *   `[ ]` 18.b.vii. Test case: "should throw ContextWindowError when compression cannot reach target". Create scenario where compression fails to reduce tokens below threshold. Assert that `ContextWindowError` is thrown with appropriate message.
        *   `[ ]` 18.b.viii. Test case: "should perform final affordability checks after compression". Assert that final checks validate input/output costs against remaining balance.
        *   `[ ]` 18.b.ix. This test must fail because `compressPrompt` does not exist yet.
    *   `[ ]` 18.c. `[BE]` **GREEN**: In a new file `supabase/functions/_shared/utils/compressPrompt.ts`, implement and export `compressPrompt`:
        *   `[ ]` 18.c.i. Import necessary types from `../types/compressPrompt.interface.ts` and related utilities.
        *   `[ ]` 18.c.ii. Implement `async function compressPrompt(deps: CompressPromptDeps, params: CompressPromptParams): Promise<CompressionState>` with the exact logic from lines 610-855.
        *   `[ ]` 18.c.iii. Ensure strict typing using all defined type contracts and use dependency injection for all external services.
        *   `[ ]` 18.c.iv. Ensure the function maintains the same state tracking (`currentTokenCount`, `currentBalanceTokens`, `currentAssembledMessages`, `currentResourceDocuments`) as the original.
    *   `[ ]` 18.d. `[TEST-UNIT]` **GREEN**: Re-run the tests from step 18.b and ensure they all pass.
    *   `[ ]` 18.e. `[LINT]` Run the linter for both files, resolving any warnings or errors.

*   `[ ]` 19. **`[REFACTOR]` Refactor `executeModelCallAndSave` to Use Extracted Affordability and Compression Utilities**
    *   `[ ]` 19.a. `[DEPS]` The affordability and compression utilities are now extracted and tested. `executeModelCallAndSave` should be refactored to use these extracted functions instead of inline implementations.
    *   `[ ]` 19.b. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, refactor to use extracted utilities:
        *   `[ ]` 19.b.i. Import `calculateAffordability` from `../_shared/utils/calculateAffordability.ts`.
        *   `[ ]` 19.b.ii. Import `calculateAffordabilityPreflight` from `../_shared/utils/calculateAffordabilityPreflight.ts`.
        *   `[ ]` 19.b.iii. Import `compressPrompt` from `../_shared/utils/compressPrompt.ts`.
        *   `[ ]` 19.b.iv. Replace the inline non-oversized affordability calculation (lines 372-419) with a call to `calculateAffordability`.
        *   `[ ]` 19.b.v. Replace the inline compression affordability preflight (lines 449-608) with a call to `calculateAffordabilityPreflight`.
        *   `[ ]` 19.b.vi. Replace the inline compression loop (lines 610-855) with a call to `compressPrompt`, ensuring state is correctly passed and returned.
        *   `[ ]` 19.b.vii. Update all references to `currentTokenCount`, `currentBalanceTokens`, `currentAssembledMessages`, and `currentResourceDocuments` to use the state returned from `compressPrompt`.
        *   `[ ]` 19.b.viii. Ensure all function calls pass parameters in the exact format expected by the extracted utilities, maintaining strict typing throughout.
    *   `[ ]` 19.c. `[TEST-INT]` **PROOF**: Run all existing test files for `executeModelCallAndSave` (all 80 tests) and ensure all pass, proving behavior preservation.
    *   `[ ]` 19.d. `[LINT]` Run the linter for `executeModelCallAndSave.ts`, resolving any warnings or errors.

*   `[ ]` 20. **`[CRITERIA]` Final Integration Proof and Validation**
    *   `[ ]` 20.a. `[TEST-INT]` Run the complete test suite for `executeModelCallAndSave` to prove behavior preservation:
        *   `[ ]` 20.a.i. Execute `executeModelCallAndSave.test.ts` (25 tests) - all must pass.
        *   `[ ]` 20.a.ii. Execute `executeModelCallAndSave.tokens.test.ts` (11 tests) - all must pass.
        *   `[ ]` 20.a.iii. Execute `executeModelCallAndSave.rag.test.ts` (17 tests) - all must pass.
        *   `[ ]` 20.a.iv. Execute `executeModelCallAndSave.rag2.test.ts` (8 tests) - all must pass.
        *   `[ ]` 20.a.v. Execute `executeModelCallAndSave.continue.test.ts` (19 tests) - all must pass.
        *   `[ ]` 20.a.vi. All 80 existing tests must pass with zero modifications, proving complete behavior preservation.
    *   `[ ]` 20.b. `[LINT]` Run the linter for all modified and new files:
        *   `[ ]` 20.b.i. All extracted utility files (`pickLatest.ts`, `sanitizeMessage.ts`, `applyInputsRequiredScope.ts`, `buildExtendedModelConfig.ts`, `validateWalletBalance.ts`, `validateModelCostRates.ts`, `resolveFinishReason.ts`, `determineContinuation.ts`, `buildUploadContext.ts`, `gatherArtifacts.ts`, and their `.test.ts` files) - zero errors.
        *   `[ ]` 20.b.ii. `calculateAffordability.ts`, `calculateAffordability.test.ts`, `calculateAffordabilityPreflight.ts`, and `calculateAffordabilityPreflight.test.ts` - zero errors.
        *   `[ ]` 20.b.iii. `compressPrompt.ts` and `compressPrompt.test.ts` - zero errors.
        *   `[ ]` 20.b.iv. All interface files in `_shared/types/` (all `[functionName].interface.ts` files) - zero errors.
        *   `[ ]` 20.b.v. `executeModelCallAndSave.ts` - zero errors.
    *   `[ ]` 20.c. `[CRITERIA]` Verify the refactoring meets all acceptance criteria:
        *   `[ ]` 20.c.i. `executeModelCallAndSave` is reduced from ~1,295 lines to a focused orchestration layer (estimated ~400-500 lines).
        *   `[ ]` 20.c.ii. All extracted utilities have comprehensive unit tests proving isolated behavior.
        *   `[ ]` 20.c.iii. All 80 existing integration tests pass unchanged, proving behavior preservation.
        *   `[ ]` 20.c.iv. All extracted functions use explicit dependency injection with no hidden dependencies.
        *   `[ ]` 20.c.v. All extracted functions use strict TypeScript typing with explicit type contracts.
        *   `[ ]` 20.c.vi. Code follows the same TDD, strict typing, and DI principles used throughout the codebase.

*   `[ ]` 21. **`[COMMIT]` refactor(BE): Complete decomposition of executeModelCallAndSave into focused utilities**
    *   `[ ]` 21.a. Create a commit with the message "refactor(BE): Complete decomposition of executeModelCallAndSave into focused utilities" containing all changes from steps 14-20, documenting the complete refactoring and behavior preservation proof.

