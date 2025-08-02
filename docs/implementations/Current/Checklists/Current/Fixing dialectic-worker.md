# Fixing Dialectic-Worker Naming Collisions and Logic Bomb

This document provides a detailed, low-level implementation checklist for correcting the file naming collisions and resolving the critical logic errors discovered during integration testing.

## Legend

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

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

---

## Phase 1: Implement a Formal Contract for Canonical Path Context

**Objective:** To create a formal, type-safe contract for generating the context needed for canonical file paths. This will ensure data is handled correctly and robustly by centralizing the canonicalization logic into a dedicated, testable "builder" function that acts as a contract enforcer.

*   `[✅]` 1. **[BE] [REFACTOR] Define the Canonical Context Interfaces**
    *   `[✅]` 1.a. `[BE]` In `supabase/functions/_shared/types/file_manager.types.ts`, create the `CanonicalPathParams` interface. This is the formal contract for all path-related context.
```typescript
        export interface CanonicalPathParams {
          contributionType: string;
          sourceModelSlugs?: string[]; // Guaranteed to be alphabetically sorted
          sourceContributionIdShort?: string; 
        }
```
    *   `[✅]` 1.b. `[BE]` In `supabase/functions/dialectic-service/dialectic.interface.ts`, update the `DialecticExecuteJobPayload` interface to use the new contract:
        *   **Action:** Remove the `originalFileName?: string` property entirely to eliminate the old, unsafe mechanism.
        *   **Action:** Add the new contract property: `canonicalPathParams: CanonicalPathParams`.
    *   `[✅]` 1.c. `[BE]` In `supabase/functions/_shared/types/file_manager.types.ts`, update the `PathContext` interface to accept the primitives from the canonical contract, which will be passed down from the `FileManager`.
        *   **Action:** Add `sourceModelSlugs?: string[]`.
        *   **Action:** Add `sourceContributionIdShort?: string`.
    *   `[✅]` 1.d `[BE]` grep `DialecticExecuteJobPayload` to ensure that all consumers of that interface are prepared to use the new `CanonicalPathParams` contract. 

*   `[✅]` 2. **[BE] [REFACTOR] Create the Canonical Context Builder (The Contract Enforcer)**
    *   `[✅]` 2.a. `[BE]` Create a new file: `supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts`.
    *   `[✅]` 2.b. `[BE]` In this new file, implement the `createCanonicalPathParams` function. Its signature will be `(sourceDocs: SourceDocument[], outputType: string): CanonicalPathParams`. The implementation is critical: it must guarantee that the returned `sourceModelSlugs` array is unique and alphabetically sorted, thereby enforcing the contract.
    *   `[✅]` 2.c. `[TEST-UNIT]` Create a corresponding `canonical_context_builder.test.ts`. Write comprehensive unit tests to prove the builder function is robust. Test cases must verify correct sorting of model slugs, correct handling of empty or single-document inputs, and correct identification of the primary source ID for `sourceContributionIdShort`.

---
## Update All Consumers of `DialecticExecuteJobPayload`

**Objective:** Based on the grep results from step 1.d, update all consumers of the `DialecticExecuteJobPayload` interface to correctly use the new `canonicalPathParams` contract instead of the deprecated `originalFileName` property.

*   `[ ]` 3. **[BE] [REFACTOR] Update Planner and Worker Logic**
    *   `[✅]` 3.a. `[BE]` Modify `supabase/functions/dialectic-worker/continueJob.ts` to construct and pass the `canonicalPathParams` object in the new payload it creates.
    *   `[ ]` 3.b. `[BE]` Modify `supabase/functions/dialectic-worker/processJob.ts` where it transforms a simple job into an execute job (line 93) to correctly create the `canonicalPathParams` object. For simple jobs, this will be a basic object containing just the `contributionType`.
*   `[ ]` 4. **[TEST-UNIT] [REFACTOR] Update Test Files**
    *   `[ ]` 4.a. `[TEST-UNIT]` In `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts`, update all instances of mock `DialecticExecuteJobPayload` objects to remove `originalFileName` and include a mock `canonicalPathParams` object.
    *   `[ ]` 4.b. `[TEST-UNIT]` In `supabase/functions/dialectic-worker/task_isolator.test.ts`, update mock payloads to use the new `canonicalPathParams` structure.
    *   `[ ]` 4.c. `[TEST-UNIT]` In `supabase/functions/_shared/utils/type_guards.test.ts`, update the test cases for `isDialecticExecuteJobPayload` to check for the presence of `canonicalPathParams` and the absence of `originalFileName`.
*   `[ ]` 5. **[BE] [REFACTOR] Update Type Guards and Verifiers**
    *   `[ ]` 5.a. `[BE]` In `supabase/functions/_shared/utils/type_guards.ts`, update the `isDialecticExecuteJobPayload` type guard to validate the new structure (checking for `canonicalPathParams` object).
    *   `[ ]` 5.b. `[BE]` In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, review the logic that consumes the payload to ensure it aligns with the new contract.
    *   `[ ]` 5.c. `[BE]` In `supabase/functions/dialectic-worker/task_isolator.ts`, ensure the mapping of planner-generated payloads to final job rows correctly handles the `canonicalPathParams` object.
*   `[ ]` 6. **[COMMIT] `refactor(worker): update all consumers of DialecticExecuteJobPayload to use canonical contract`**


*   `[ ]` 7. **[BE] [REFACTOR] Refactor Planners to Use the Contract**
    *   `[ ]` 7.a. `[BE]` In `planPairwiseByOrigin.ts`:
        *   `[ ]` 7.a.i. **Action:** Remove all manual filename generation logic.
        *   `[ ]` 7.a.ii. **Action:** For each job it generates, it must now call the new `createCanonicalPathParams` function, passing the relevant source documents (e.g., the thesis/antithesis pair) to get the `canonicalPathParams` object for the payload.
        *   `[ ]` 7.a.iii. **Action:** Refactor the hardcoded `document_relationships` and `inputs` to use dynamic keys based on the `contribution_type` of the source documents. It is critical that the `source_group` key continues to be correctly populated with the ID of the primary originating document (e.g., the `thesis` document's ID).
    *   `[ ]` 7.b. `[BE]` In `planPerSourceDocument.ts`, perform the same refactoring: for each document, call `createCanonicalPathParams` to generate the payload's `canonicalPathParams`.
    *   `[ ]` 7.c. `[TEST-UNIT]` Update the unit tests for both planners. The tests should no longer assert anything about filenames. Instead, they must assert that `createCanonicalPathParams` is called with the correct set of source documents and that the resulting `canonicalPathParams` object is correctly placed in the generated job payload.

*   `[ ]` 8. **[BE] [REFACTOR] Update Path Constructor to Consume the Contract**
    *   `[ ]` 8.a. `[BE]` In `path_constructor.ts`, refactor the `constructStoragePath` function. For all contribution-related `FileType`s (`model_contribution_main`, `pairwise_synthesis_chunk`, etc.), completely remove any logic that reads or depends on the `originalFileName` field from the `PathContext`.
    *   `[ ]` 8.b. `[BE]` Implement the new filename generation logic. This logic must generate filenames *solely* from the canonical context primitives now available in the `PathContext` (`modelSlug`, `contributionType`, `sourceModelSlugs`, `sourceContributionIdShort`, etc.), strictly adhering to the formats defined in `path_constructor.readme.md`.
    *   `[ ]` 8.c. `[TEST-UNIT]` Update `path_constructor.test.ts`. Add new, comprehensive test cases that pass a `PathContext` containing the new canonical primitives and assert that the full, descriptive, and unique filenames are generated correctly for all relevant scenarios (critique, pairwise synthesis, etc.).
    *   `[ ]` 8.d. `[DOCUMENT]` `path_constructor.readme.md` is the canonical expression of the file tree and file name construction method. The `path_constructor.ts` must produce these outputs exactly under all conditions for the tests to pass. 

*   `[ ]` 5. **[COMMIT] `feat(worker): implement formal contract for canonical path context`**

## Phase 2: Resolve Parenthesis Stage Logic Bomb

**Objective:** To correct the behavior of the Parenthesis stage so that it only *reads* from the Synthesis stage to create its own new, unique documents, instead of attempting to re-upload them.

*   `[ ]` 9. **[BE] [REFACTOR] Correct Prompt Assembly and Job Creation Logic**
    *   `[ ]` 9.a. `[BE]` The primary focus is ensuring a clean separation between "context for a prompt" and "context for a new file". Verify in `supabase/functions/_shared/prompt-assembler.ts` that `gatherInputsForStage` correctly identifies `Synthesis` documents as the source context for the `Parenthesis` stage.
    *   `[ ]` 9.b. `[BE]` When a job for the `Parenthesis` stage is created by the worker, it is critical that it does not inherit any file-creation context (like `document_relationships` or the new `canonicalPathParams`) from the `Synthesis` documents it used for its prompt. The `canonicalPathParams` for a Parenthesis job must be generated fresh, based on its *own* context (which will be simple, likely without `sourceModelSlugs`), resulting in a clean filename like `{model_slug}_{n}_parenthesis.md`.
    *   `[ ]` 9.c. `[TEST-UNIT]` Enhance tests for `prompt-assembler.ts` and the worker's job creation logic to specifically cover the Parenthesis stage transition. Assert that input gathering is correct and that the created job payload is clean of any legacy file-creation context from the previous stage.
    *   `[ ]` 9.d. `[TEST-INT]` Prove that the Parenthesis stage does not attempt to re-upload Synthesis stage documents. 

*   `[ ]` 10. **[COMMIT] `fix(service): prevent parenthesis stage from re-uploading synthesis documents`**

## Phase 3: Validation

*   `[ ]` 11. **[TEST-INT] Re-run Integration Test**
    *   `[ ]` 11.a. `[TEST-INT]` Execute the `dialectic_pipeline.integration.test.ts`.
    *   `[ ]` 11.b. `[TEST-INT]` Analyze the new `test.log.md` and confirm that all `409 Conflict` errors are resolved.
    *   `[ ]` 11.c. `[TEST-INT]` Manually inspect the database or storage (if possible via test outputs) to confirm that the filenames generated for Antithesis, Synthesis, and Parenthesis now follow the new, descriptive, and unique format specified in the readme.
*   `[ ]` 12. **[COMMIT] `test(pipeline): confirm fix for filename collisions and parenthesis logic`**
