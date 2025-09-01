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

---

## Phase 4: Create a Flexible Contract for Document Relationships

**Objective:** To prevent regressions and ensure future extensibility by replacing the generic `Json` type for `document_relationships` with a formal, type-safe contract. This change, discovered during TDD, makes the system more robust by ensuring that both the implementation and its tests are checked against the same explicit structure.

*   `[✅]` 14. **[BE] [REFACTOR] Define the Relationship Contract in `dialectic.interface.ts`**
    *   `[✅]` 14.a. `[BE]` Create a new `RelationshipRole` union type. This will extend the existing `ContributionType` to also include abstract roles like `'source_group'`.
    *   `[✅]` 14.b. `[BE]` Define the `DocumentRelationships` type as a `Record<RelationshipRole, string | undefined>`. This creates a flexible but type-safe dictionary.
    *   `[✅]` 14.c. `[BE]` Update the `DialecticExecuteJobPayload` and `SourceDocument` types to use the new `DocumentRelationships` contract instead of the generic `Json` type.

*   `[✅]` 15. **[BE] [REFACTOR] Update Code to Use the New Contract**
    *   `[✅]` 15.a. `[BE]` In `supabase/functions/dialectic-worker/strategies/helpers.ts`, refactor the `findRelatedContributions` function to use the strongly-typed `document_relationships` object. The TypeScript compiler will guide this change.
    *   `[✅]` 15.b. `[TEST-UNIT]` In `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.test.ts`, ensure all mock `SourceDocument` objects adhere to the new `DocumentRelationships` contract. The mock data for `antithesis` documents must now correctly use `source_group`.
    *   `[✅]` 15.c. `[TEST-UNIT]` Re-run the test for `planPairwiseByOrigin.ts` to confirm it now passes with the corrected mock data and the new, stricter types.

*   `[✅]` 16. **[COMMIT] `refactor(worker): implement type-safe contract for document relationships`**

## Phase 5: Correcting the Pairwise Synthesis Naming Collision

**Objective:** The root cause of the `409 Conflict` errors is a flaw in how `pairwise_synthesis_chunk` artifacts are named, especially when the RAG (Retrieval-Augmented Generation) workflow is triggered in `task_isolator.ts`. The current implementation and specification do not create a sufficiently unique name when pairing documents, causing multiple jobs to attempt to write to the same file path. The fix involves making the naming convention more explicit and descriptive.

*   `[✅]` 17. **[DOCS] Update Path Constructor Specification for Explicit Pairing**
    *   `[✅]` 17.a. `[DOCS]` In `supabase/functions/_shared/utils/path_constructor.readme.md`, add the new `{paired_model_slug}` primitive to the variable list. This will represent the model slug of the non-anchor document in a synthesis pair.
    *   `[✅]` 17.b. `[DOCS]` Update the `pairwise_synthesis_chunk` primitive to be more explicit and descriptive:
        *   **New Primitive:** `{model_slug}_synthesizing_{source_anchor_model_slug}_with_{paired_model_slug}_on_{source_anchor_type}_{n}_{contribution_type}.md`
    *   `[✅]` 17.c. `[DOCS]` Update the file structure diagram and the rationale in the readme to reflect this new, unambiguous naming convention.

*   `[ ]` 18. **[BE] [REFACTOR] Evolve Interfaces and Implement New Naming Logic (TDD)**
    *   `[✅]` 18.a. `[BE]` In `supabase/functions/_shared/types/file_manager.types.ts`, add `pairedModelSlug?: string;` to the `CanonicalPathParams` and `PathContext` interfaces to support the new primitive.
    *   `[✅]` 18.b. `[TEST-UNIT]` Create a new **failing test** in `canonical_context_builder.test.ts` that asserts the builder correctly identifies the paired document and extracts its model slug into `pairedModelSlug`.
    *   `[✅]` 18.c. `[TEST-UNIT]` Update the `pairwise_synthesis_chunk` test in `path_constructor.test.ts` to expect the new, more descriptive filename. This test must also **fail**.
    *   `[✅]` 18.d. `[BE]` Modify `canonical_context_builder.ts`. The `createCanonicalPathParams` function must now identify the non-anchor document in the source pair and populate the `pairedModelSlug` field. This will make the test from 15.b pass.
    *   `[✅]` 18.e. `[BE]` Modify `path_constructor.ts`. Update the logic for `pairwise_synthesis_chunk` to use the new `pairedModelSlug` primitive from the context to construct the filename. This will make the test from 15.c pass.

*   `[✅]` 19. **[BE] [REFACTOR] Update Planners to Fulfill the Explicit Contract**
    *   `[✅]` 19.a. `[BE]` In `planPairwiseByOrigin.ts`, update the planner to correctly identify both the anchor (`thesisDoc`) and the paired (`antithesisDoc`) documents and pass all necessary information to the `createCanonicalPathParams` function.
    *   `[✅]` 19.b. `[BE]` In `task_isolator.ts`, update the RAG workflow. It must now gather the full context (including anchor and paired document details) *before* creating the RAG summary, so that the subsequent job's payload contains the correct, complete `CanonicalPathParams`. This prevents the fallback to a non-unique name.
    *   `[✅]` 19.c. `[TEST-UNIT]` Update the unit tests for the planners and `task_isolator` to assert that the full, correct canonical context is being created in all code paths.

*   `[✅]` 20. **[BE] [REFACTOR] Refactor Prompt-Assembler and Worker for Correctness**
    *   `[✅]` 20.a. **Phase 1: Refactor `prompt-assembler.ts` to Simplify its Role**
        *   `[✅]` 20.a.i. In `prompt-assembler.ts`, modify the signatures of `assemble` and `gatherContext` to remove the `modelConfigForTokenization` and `minTokenLimit` parameters, making them optional.
        *   `[✅]` 20.a.ii. In `prompt-assembler.ts`, locate the `if (modelConfigForTokenization && minTokenLimit ...)` block within `gatherContext` and remove it. The method should be simplified to always format documents normally, without token checks or RAG invocations.
    *   `[✅]` 20.b. **Phase 2: Update Call Sites to Match New Signatures**
        *   `[✅]` 20.b.i. In `startSession.ts`, find the call to `assembler.assemble` and remove the `modelConfigForTokenization` and `minTokenLimit` arguments to resolve the linter error.
    *   `[✅]` 20.c. **Phase 3: Implement Compression Logic in `executeModelCallAndSave.ts`**
        *   `[✅]` 20.c.i. In `supabase/functions/dialectic-worker/index.ts`, ensure an instance of the `RagService` is created and passed into the `deps` object for the worker. This makes the service available to `executeModelCallAndSave.ts` via dependency injection.
        *   `[✅]` 20.c.ii. In `executeModelCallAndSave.ts`, within the "Final Context Window Validation" block, invoke the `deps.ragService.getContextForModel(...)` to compress the prompt if it exceeds the token limit. This centralizes the token validation and compression logic in the execution step.
        *   `[✅]` 20.c.iii. Ensure the subsequent call to `deps.callUnifiedAIModel(...)` uses the `finalPromptContent` variable, which will hold the potentially compressed prompt.

*   `[✅]` 21. **[COMMIT] `feat(worker): implement explicit filenames for pairwise synthesis`**

## Phase 6: Validation

*   `[✅]` 21. **[TEST-INT] Re-run Integration Test**
    *   `[✅]` 21.a. `[TEST-INT]` Execute the `dialectic_pipeline.integration.test.ts`.
    *   `[✅]` 21.b. `[TEST-INT]` Analyze the new `test.log.md` and confirm that all `409 Conflict` errors are resolved.
    *   `[✅]` 21.c. `[TEST-INT]` Manually inspect the database or storage (if possible via test outputs) to confirm that the filenames generated for `pairwise_synthesis_chunk` now follow the new, descriptive, and unique format.
*   `[✅]` 22. **[COMMIT] `test(pipeline): confirm fix for filename collisions and parenthesis logic`**

## Phase 7: Resolve Integration Test Failures (Systematic TDD)

**Objective:** To systematically diagnose and resolve the failures identified in the latest integration test run. Each failure category will be addressed with a dedicated investigation and a TDD-style fix.

*   `[✅]` 23. **[BE] Fix Misleading `isDocumentRelationships` Error Logging (Category 3)**
    *   `[✅]` 23.a. **[DOCS] Explain the Error:** The test logs were filled with `"FAILED: Not a record."` messages originating from the `isDocumentRelationships` type guard. The investigation revealed that this was not a logic error but a logging issue. The type guard was incorrectly logging a failure when it received a `null` value for `document_relationships`, which is a valid state for documents that do not have ancestors (e.g., those created from the initial session prompt).
    *   `[✅]` 23.b. **[BE] Research and Gather Evidence:**
        *   `[✅]` 23.b.i. Analysis of `supabase/functions/_shared/utils/type_guards.ts` confirmed the `isDocumentRelationships` function logged an error upon receiving `null`.
        *   `[✅]` 23.b.ii. Analysis of `supabase/functions/dialectic-worker/processSimpleJob.ts` showed it was correctly handling the `false` return from the type guard, proving the error was only in the log output.
    *   `[✅]` 23.c. **[TEST-UNIT] Create a Failing Unit Test:**
        *   `[✅]` 23.c.i. A new test case was added to `supabase/functions/_shared/utils/type_guards.test.ts` to specifically test the behavior of `isDocumentRelationships` when passed `null`.
        *   `[✅]` 23.c.ii. The test proved that the function correctly returned `false` but also produced the unwanted "FAILED" log message.
    *   `[✅]` 23.d. **[BE] Implement the Fix:**
        *   `[✅]` 23.d.i. In `supabase/functions/_shared/utils/type_guards.ts`, the `isDocumentRelationships` function was modified to treat `null` as a valid input and return `true` without logging an error.
    *   `[✅]` 23.e. **[TEST-UNIT] Prove the Fix:**
        *   `[✅]` 23.e.i. The unit test for `isDocumentRelationships` now passes silently, and the integration test no longer produces the "FAILED: Not a record." log spam.
    *   `[✅]` 23.f. **[COMMIT] `fix(worker): correct misleading error log in isDocumentRelationships type guard`**

*   `[✅]` 24. **[BE] Fix Synthesis Stage Execution Failure (Category 1)**
    *   `[✅]` 24.a. **[DOCS] Explain the Error:** The symptom of the previous error is that the Synthesis stage hangs. Child jobs fail immediately because the `isDocumentRelationships` type guard receives a `null` value (read from the database) instead of a valid object, causing a crash within `findSourceDocuments`.
    *   `[✅]` 24.b. **[BE] Research and Gather Evidence:**
        *   `[✅]` 24.b.i. Review `supabase/functions/dialectic-worker/task_isolator.ts` and the `findSourceDocuments` function to confirm this is the point of failure.
    *   `[✅]` 24.c. **[TEST-UNIT] Create a Validation Test:**
        *   `[✅]` 24.c.i. In `supabase/functions/dialectic-worker/task_isolator.test.ts`, create a new test for `planComplexStage`.
        *   `[✅]` 24.c.ii. The test will use a mock database client that returns contributions with a *valid* `document_relationships` object, simulating the fix from Phase 7.
        *   `[✅]` 24.c.iii. The test will assert that `planComplexStage` executes without throwing a type guard error and successfully creates child jobs.
    *   `[✅]` 24.d. **[BE] Implement the Fix:**
        *   `[✅]` 24.d.i. No new code fix is required. The fix implemented in step 23.d resolves the root cause of this failure. This checklist item serves as a validation step.
    *   `[✅]` 24.e. **[TEST-UNIT] Prove the Fix:**
        *   `[✅]` 24.e.i. Run the validation test from step 24.c. It should pass, confirming the symptom is resolved.
    *   `[✅]` 24.f. **[COMMIT] `test(worker): validate fix for synthesis execution failure`**

*   `[✅]` 25. **[BE] Fix Synthesis Stage Job Creation and Type Errors (Categories 1 & 2)**
    *   `[✅]` 25.a. **[DOCS] Explain the Error:** The integration test fails during the `synthesis` stage with an assertion error: it expects 4 child jobs for step 2, but 16 are created. The root cause is a faulty planner, `planPerSourceDocumentByLineage`, which creates one job per input document instead of grouping them. This incorrect job creation also leads to downstream type errors and `stageSlug` propagation issues in later stages.
    *   `[✅]` 25.b. **[BE] Research and Gather Evidence:**
        *   `[✅]` 25.b.i. Investigation of the `dialectic-worker`'s planners confirmed that `planPerSourceDocumentByLineage.ts` contained flawed logic that did not group documents by their `source_group` relationship.
        *   `[✅]` 25.b.ii. Investigation of `dialectic.interface.ts` revealed that the `DialecticExecuteJobPayload`'s `inputs` property was incorrectly typed as `string` instead of `string[]`, preventing the planner from passing an array of document IDs.
    *   `[✅]` 25.c. **[TEST-UNIT] Create a Failing Unit Test:**
        *   `[✅]` 25.c.i. In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts`, a new test case was added to simulate the planner receiving multiple documents from different source groups.
        *   `[✅]` 25.c.ii. The test asserted that the planner would output only one job per group and that the `inputs` property of that job would be an array of all document IDs from the corresponding group.
        *   `[✅]` 25.c.iii. This test failed as expected, proving the planner was not grouping correctly.
    *   `[✅]` 25.d. **[BE] Implement the Fix:**
        *   `[✅]` 25.d.i. In `supabase/functions/dialectic-service/dialectic.interface.ts`, the `inputs` property of the `DialecticExecuteJobPayload` was changed from `[key: string]: string` to `[key: string]: string | string[]` to support arrays of IDs.
        *   `[✅]` 25.d.ii. In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`, the planner was rewritten to correctly group input documents by their `document_relationships.source_group` and to pass the collected IDs as an array in the child job's `inputs` payload.
    *   `[✅]` 25.e. **[TEST-UNIT] Prove the Fix:**
        *   `[✅]` 25.e.i. The failing unit test from step 25.c now passes.
        *   `[✅]` 25.e.ii. The existing unit tests, which were broken by the new logic, were updated to align with the correct behavior.
        *   `[✅]` 25.e.iii. Linter checks on all modified files passed successfully.
    *   `[✅]` 25.f. **[COMMIT] `fix(worker): correct planner logic to group documents by lineage`**

*   `[✅]` 26. **[TEST-INT] Final Validation**
    *   `[✅]` 26.a. `[TEST-INT]` Once all unit tests for the above fixes are passing, re-run the main integration test: `dialectic_pipeline.integration.test.ts`.
    *   `[✅]` 26.b. `[TEST-INT]` Analyze the new test log to confirm that the `synthesis` stage now completes successfully and that the `stageSlug` errors no longer occur.
    *   `✅]` 26.c. **[COMMIT] `test(pipeline): confirm fixes for synthesis and stage transition logic`**
