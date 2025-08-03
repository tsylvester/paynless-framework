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

*   `[✅]` 3. **[BE] [REFACTOR] Update Planner and Worker Logic**
    *   `[✅]` 3.a. `[BE]` Modify `supabase/functions/dialectic-worker/continueJob.ts` to construct and pass the `canonicalPathParams` object in the new payload it creates.
    *   `[✅]` 3.b. `[BE]` Modify `supabase/functions/dialectic-worker/processJob.ts` where it transforms a simple job into an execute job (line 93) to correctly create the `canonicalPathParams` object. For simple jobs, this will be a basic object containing just the `contributionType`.
*   `[✅]` 4. **[TEST-UNIT] [REFACTOR] Update Test Files**
    *   `[✅]` 4.a. `[TEST-UNIT]` In `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts`, update all instances of mock `DialecticExecuteJobPayload` objects to remove `originalFileName` and include a mock `canonicalPathParams` object.
    *   `[✅]` 4.b. `[TEST-UNIT]` In `supabase/functions/dialectic-worker/task_isolator.test.ts`, update mock payloads to use the new `canonicalPathParams` structure.
    *   `[✅]` 4.c. `[TEST-UNIT]` In `supabase/functions/_shared/utils/type_guards.test.ts`, update the test cases for `isDialecticExecuteJobPayload` to check for the presence of `canonicalPathParams` and the absence of `originalFileName`.
*   `[✅]` 5. **[BE] [REFACTOR] Update Type Guards and Verifiers**
    *   `[✅]` 5.a. `[BE]` In `supabase/functions/_shared/utils/type_guards.ts`, update the `isDialecticExecuteJobPayload` type guard to validate the new structure (checking for `canonicalPathParams` object).
    *   `[✅]` 5.b. `[BE]` In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, review the logic that consumes the payload to ensure it aligns with the new contract.
    *   `[✅]` 5.c. `[BE]` In `supabase/functions/dialectic-worker/task_isolator.ts`, ensure the mapping of planner-generated payloads to final job rows correctly handles the `canonicalPathParams` object.
*   `[✅]` 6. **[COMMIT] `refactor(worker): update all consumers of DialecticExecuteJobPayload to use canonical contract`**


---

## Phase 2: Evolve the Contract for Dynamic, Human-Readable Uniqueness (TDD)

**Objective:** To resolve the filename collision by enhancing the canonical contract with dynamic, descriptive primitives. Instead of hardcoding for a "thesis," we will identify the primary "Anchor Document" by its role, making the system robust and adaptable. We will follow a strict TDD workflow.

*   `[✅]` 7. **[BE] [REFACTOR] Evolve the Canonical Interfaces for Dynamic Anchors**
    *   `[✅]` 7.a. `[BE]` In `supabase/functions/_shared/types/file_manager.types.ts`, update the `CanonicalPathParams` interface to use generic "anchor" properties:
        *   **Action:** Remove `sourceContributionIdShort?: string`.
        *   **Action:** Add `sourceAnchorType?: string;` (e.g., 'thesis', 'outline')
        *   **Action:** Add `sourceAnchorModelSlug?: string;` (e.g., 'claude-3-opus')
    *   `[✅]` 7.b. `[BE]` In the same file, update the `PathContext` interface to match:
        *   **Action:** Remove `sourceContributionIdShort?: string`.
        *   **Action:** Add `sourceAnchorType?: string;`
        *   **Action:** Add `sourceAnchorModelSlug?: string;`

*   `[✅]` 8. **[DOCS] [TEST-UNIT] Update Specifications and Tests for Dynamic Anchors**
    *   `[✅]` 8.a. `[DOCS]` In `supabase/functions/_shared/utils/path_constructor.readme.md`, update the `pairwise_synthesis_chunk` primitive to be fully dynamic:
        *   **New Primitive:** `{model_slug}_from_{source_model_slugs}_on_{source_anchor_type}_by_{source_anchor_model_slug}_{n}_{contribution_type}.md`
    *   `[✅]` 8.b. `[TEST-UNIT]` In `canonical_context_builder.test.ts`, write a **new, failing test**. This test must assert that when `createCanonicalPathParams` is called with a set of documents *and an explicitly provided anchor document*, it correctly extracts the anchor's `contribution_type` into `sourceAnchorType` and `model_name` into `sourceAnchorModelSlug`.
    *   `[✅]` 8.c. `[TEST-UNIT]` In `path_constructor.test.ts`, update the `pairwise_synthesis_chunk` test to **expect the new, dynamic filename**. This test should now pass a `PathContext` containing `sourceAnchorType` and `sourceAnchorModelSlug` and assert the filename matches the new primitive. This test must also **fail**.

*   `[✅]` 9. **[BE] [REFACTOR] Implement Changes to Pass Failing Tests**
    *   `[✅]` 9.a. `[BE]` In `canonical_context_builder.ts`, modify the `createCanonicalPathParams` function.
        *   **Action:** Change its signature to explicitly require the anchor document: `(sourceDocs: SourceDocument[], outputType: string, anchorDoc: SourceDocument): CanonicalPathParams`.
        *   **Action:** The implementation will no longer search for a 'thesis'. It will directly pull `contribution_type` and `model_name` from the provided `anchorDoc`.
        *   **Outcome:** The test from step 8.b should now pass.
    *   `[✅]` 9.b. `[BE]` In `path_constructor.ts`, modify `constructStoragePath`.
        *   **Action:** Update the `case` for `pairwise_synthesis_chunk` to use `sourceAnchorType` and `sourceAnchorModelSlug` to build the new filename. Add validation to ensure both are present for this file type.
        *   **Outcome:** The test from step 8.c should now pass.

*   `[✅]` 10. **[BE] [REFACTOR] Update Planners to Fulfill the Evolved Contract**
    *   `[✅]` 10.a. `[BE]` In `planPairwiseByOrigin.ts`, update the logic to identify the anchor document (the `thesis`) from its inputs and pass it as the new required argument to `createCanonicalPathParams`.
    *   `[✅]` 10.b. `[BE]` In `planPerSourceDocument.ts`, update its logic to call `createCanonicalPathParams`, passing the source document itself as the `anchorDoc`.
    *   `[✅]` 10.c. `[TEST-UNIT]` Update the unit tests for both planners. The tests must now assert that `createCanonicalPathParams` is called with the correct `anchorDoc`.

*   `[✅]` 11. **[COMMIT] `feat(worker): implement dynamic, human-readable unique filenames`**

---

*   `[✅]` 8. **[BE] [REFACTOR] Update Path Constructor to Consume the Contract**
    *   `[✅]` 8.a. `[BE]` In `path_constructor.ts`, refactor the `constructStoragePath` function. For all contribution-related `FileType`s (`model_contribution_main`, `pairwise_synthesis_chunk`, etc.), completely remove any logic that reads or depends on the `originalFileName` field from the `PathContext`.
    *   `[✅]` 8.b. `[BE]` Implement the new filename generation logic. This logic must generate filenames *solely* from the canonical context primitives now available in the `PathContext` (`modelSlug`, `contributionType`, `sourceModelSlugs`, `sourceContributionIdShort`, etc.), strictly adhering to the formats defined in `path_constructor.readme.md`.
    *   `[✅]` 8.c. `[TEST-UNIT]` Update `path_constructor.test.ts`. Add new, comprehensive test cases that pass a `PathContext` containing the new canonical primitives and assert that the full, descriptive, and unique filenames are generated correctly for all relevant scenarios (critique, pairwise synthesis, etc.).
    *   `[✅]` 8.d. `[DOCUMENT]` `path_constructor.readme.md` is the canonical expression of the file tree and file name construction method. The `path_constructor.ts` must produce these outputs exactly under all conditions for the tests to pass. 

*   `[✅]` 5. **[COMMIT] `feat(worker): implement formal contract for canonical path context`**

## Phase 3: Resolve Parenthesis Stage Logic Bomb

**Objective:** To correct the job creation logic for simple stages (like `Parenthesis`) by ensuring the `target_contribution_id` is not incorrectly passed from a `plan` job to a transformed `execute` job. This prevents the file manager from incorrectly incrementing file attempt numbers and causing `409 Conflict` errors.

*   `[✅]` 12. **[TEST-UNIT] Create a Failing Test to Prove the Logic Bomb**
    *   `[✅]` 12.a. `[TEST-UNIT]` In the existing file `supabase/functions/dialectic-worker/processJob.test.ts`, add a new test case named `'should clear target_contribution_id when transforming a simple plan job'`.
        *   **Action:** This test simulates the worker processing a `plan` job for a simple stage which has a `target_contribution_id`.
        *   **Assertion:** The test must assert that when `processSimpleJob` is called with the transformed `execute` payload, the `target_contribution_id` property on the payload is `undefined`.
        *   **Outcome:** This test failed as expected, proving that the `target_contribution_id` was being incorrectly passed down.

*   `[✅]` 13. **[BE] Fix `processJob` to Clear `target_contribution_id`**
    *   `[✅]` 13.a. `[BE]` In `supabase/functions/dialectic-worker/processJob.ts`, modify the logic that creates the `executePayload` for simple stages.
        *   **Action:** When destructuring the `plan` payload and building the `execute` payload, explicitly set `target_contribution_id: undefined`. This ensures that the downstream processor treats it as a new contribution, not a continuation.
    *   `[✅]` 13.b. `[TEST-UNIT]` Run the test from step 12.
        *   **Outcome:** The test from step 12 now passes, confirming the fix.

## Phase 3: Validation

*   `[ ]` 11. **[TEST-INT] Re-run Integration Test**
    *   `[ ]` 11.a. `[TEST-INT]` Execute the `dialectic_pipeline.integration.test.ts`.
    *   `[ ]` 11.b. `[TEST-INT]` Analyze the new `test.log.md` and confirm that all `409 Conflict` errors are resolved.
    *   `[ ]` 11.c. `[TEST-INT]` Manually inspect the database or storage (if possible via test outputs) to confirm that the filenames generated for Antithesis, Synthesis, and Parenthesis now follow the new, descriptive, and unique format specified in the readme.
*   `[ ]` 12. **[COMMIT] `test(pipeline): confirm fix for filename collisions and parenthesis logic`**
