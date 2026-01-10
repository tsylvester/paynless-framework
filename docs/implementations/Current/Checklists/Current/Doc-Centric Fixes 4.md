# Doc-Centric Fixes

[ ] // So that find->replace will stop unrolling my damned instructions! 

## Problem Statement
-The doc-centric refactor has introduced bugs and inconsistencies that need resolved. 

## Objectives
- Fix all bugs and integration errors from the doc-centric refactor. 

## Expected Outcome
- Generate an entire dialectic end to end using the doc-centric method.

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn so that you remember your instructions. 

# Work Breakdown Structure

*   `[ ]` 21. **`[TEST-INT]` Prove Complete End-to-End Document Generation Flow: EXECUTE Job → Contribution Save → RENDER Job Enqueue → RENDER Job Process → Document Render → Stage Completion**
    *   `[ ]` 21.a. `[DEPS]` The document generation flow involves multiple interdependent functions that must work together correctly: (1) `executeModelCallAndSave` in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` saves AI model responses as contributions and conditionally enqueues RENDER jobs, (2) `shouldEnqueueRenderJob` in `supabase/functions/_shared/utils/shouldEnqueueRenderJob.ts` determines if an output type requires rendering by querying recipe steps, (3) `processRenderJob` in `supabase/functions/dialectic-worker/processRenderJob.ts` processes RENDER jobs and calls `renderDocument`, (4) `renderDocument` in `supabase/functions/_shared/services/document_renderer.ts` assembles document chunks and renders markdown files, (5) `processComplexJob` in `supabase/functions/dialectic-worker/processComplexJob.ts` orchestrates stage execution and determines when stages are complete, (6) `handle_job_completion` trigger in `supabase/migrations/20250905142613_fix_auth_header.sql` checks if all jobs for a stage are complete. The two critical problems are: (A) RENDER jobs are never enqueued despite EXECUTE jobs completing with valid JSON, and (B) stages restart even though all jobs complete. These problems occur because the flow has multiple data dependencies that must be satisfied in the correct sequence: `document_relationships` must be persisted before `documentIdentity` extraction, all 8 required RENDER job payload fields must be present (`user_jwt`, `projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `documentIdentity`, `documentKey`, `sourceContributionId`), `shouldEnqueueRenderJob` must correctly identify markdown documents, RENDER jobs must be processed successfully, and stage completion logic must correctly account for RENDER job completion. The fix requires: (1) creating a comprehensive integration test that exercises the ENTIRE flow from EXECUTE job creation through stage completion, (2) verifying ALL data dependencies at each step: contribution save → `document_relationships` persistence → `shouldEnqueueRenderJob` check → RENDER job payload construction → RENDER job insertion → trigger invocation → worker routing → `processRenderJob` validation → `renderDocument` query → document rendering → stage completion check, (3) proving that when an AI model returns valid JSON for a markdown document, the complete flow succeeds: RENDER job is enqueued with ALL required fields, RENDER job is processed successfully, document is rendered and saved, and stage is marked complete, (4) proving that `processComplexJob` correctly identifies stage completion when all EXECUTE and RENDER jobs are complete, (5) proving that `handle_job_completion` trigger correctly identifies stage completion when no jobs remain in pending/processing/retrying states.
    *   `[ ]` 21.b. `[TEST-INT]` **RED**: In `supabase/integration_tests/services/executeModelCallAndSave.document.integration.test.ts`, add a comprehensive end-to-end integration test that proves the complete document generation flow works correctly.
        *   `[ ]` 21.b.i. Add an integration test "should generate complete document end-to-end: EXECUTE job → contribution save → RENDER job enqueue → RENDER job process → document render → stage completion" that exercises the ENTIRE flow: (1) **Producer Setup**: Create a test session with a stage (e.g., 'thesis') that has an active recipe instance with recipe steps defining a markdown document output (e.g., `business_case` with `file_type: 'markdown'` in `outputs_required`), create an EXECUTE job with payload containing: `job_type: 'EXECUTE'`, `projectId` (string), `sessionId` (string), `iterationNumber` (number), `stageSlug: 'thesis'` (string), `output_type: 'business_case'` (string), `user_jwt` (string, valid JWT token), `document_key: 'business_case'` (string), `model_id` (string), and all other required EXECUTE job payload fields, (2) **Test Subject - Step 1**: Call `executeModelCallAndSave` with the EXECUTE job and verify: (a) the AI model response is saved as a contribution in `dialectic_contributions` with `output_type: 'business_case'`, `storage_path` and `file_name` populated, (b) for root chunks: `document_relationships` is initialized IMMEDIATELY after contribution save (before RENDER job creation) with `document_relationships[stageSlug] = contribution.id`, verify the database update occurs and the in-memory `contribution.document_relationships` is updated, (c) for continuation chunks: `document_relationships` is persisted IMMEDIATELY after contribution save (before RENDER job creation) from the job payload, verify the database update occurs and the in-memory `contribution.document_relationships` is updated, (d) `shouldEnqueueRenderJob` is called with `{ outputType: 'business_case', stageSlug: 'thesis' }` and returns `true` (proving the output type is correctly identified as a markdown document), (e) `documentIdentity` is extracted from `contribution.document_relationships[stageSlug]` AFTER `document_relationships` is persisted (verify extraction happens after persistence by checking call order or database state), (f) a RENDER job is inserted into `dialectic_generation_jobs` with: `job_type: 'RENDER'`, `parent_job_id` pointing to the EXECUTE job ID, `status: 'pending'`, and payload containing ALL 8 required fields: `user_jwt` (string, matching EXECUTE job payload), `projectId` (string, matching EXECUTE job payload), `sessionId` (string, matching EXECUTE job payload), `iterationNumber` (number, matching EXECUTE job payload), `stageSlug: 'thesis'` (string, matching EXECUTE job payload), `documentIdentity` (string, extracted from `document_relationships[stageSlug]`), `documentKey: 'business_case'` (FileType, validated), `sourceContributionId` (string, matching `contribution.id`), (g) the EXECUTE job status is updated to `'completed'` with `completed_at` timestamp, (3) **Test Subject - Step 2**: Verify the database trigger `invoke_worker_on_status_change` fires when the RENDER job is inserted with status 'pending', and verify: (a) the trigger extracts `user_jwt` from the RENDER job payload, (b) the trigger makes an HTTP POST call to the worker endpoint with Authorization header containing the JWT token, (c) the trigger logs the invocation in `dialectic_trigger_logs`, (4) **Test Subject - Step 3**: Simulate the worker entry point by calling `processJob` in `supabase/functions/dialectic-worker/processJob.ts` with the RENDER job record and verify: (a) `processJob` routes the RENDER job to `processRenderJob` (verify via function call or logs), (b) `processRenderJob` successfully validates ALL 7 required payload fields: `projectId` (string check passes), `sessionId` (string check passes), `iterationNumber` (number check passes), `stageSlug` (string check passes), `documentIdentity` (string check passes), `documentKey` (FileType check passes), `sourceContributionId` (string check passes), with no validation errors, (c) `processRenderJob` calls `renderDocument` with all 7 required `RenderDocumentParams` fields, (5) **Test Subject - Step 4**: Verify `renderDocument` in `supabase/functions/_shared/services/document_renderer.ts` successfully: (a) queries `dialectic_contributions` using `documentIdentity` with `.contains("document_relationships", { [stageSlug]: documentIdentity })` and finds the contribution(s) (for root chunks, finds 1 contribution; for continuation chunks, finds all related chunks in the document chain), (b) assembles the document chain correctly (root chunk first, then continuation chunks in order via `target_contribution_id` links), (c) renders the combined markdown content from all chunks, (d) saves the rendered markdown file to storage at the canonical document path (using `constructStoragePath` with correct path context), (e) returns `pathContext` with `sourceContributionId` set correctly, (6) **Test Subject - Step 5**: Verify `processRenderJob` successfully: (a) updates the RENDER job status to `'completed'` with `completed_at` timestamp, (b) saves `results.pathContext` with the correct path context from `renderDocument`, (c) creates a `dialectic_project_resources` record with: `resource_type = 'rendered_document'`, `session_id` matching the session ID, `iteration_number` matching the iteration number, `stage_slug: 'thesis'`, `file_name` matching the rendered document filename, `source_contribution_id` matching the `sourceContributionId` from the payload, (7) **Test Subject - Step 6**: Verify stage completion logic: (a) query `dialectic_generation_jobs` for all jobs with the same `sessionId`, `stageSlug`, and `iterationNumber`, (b) verify ALL EXECUTE jobs have status `'completed'`, (c) verify ALL RENDER jobs have status `'completed'` (not `'pending'` or `'processing'`), (d) call `processComplexJob` with the parent PLAN job and verify: it queries all child jobs (EXECUTE and RENDER jobs), it correctly identifies that all steps are complete (no jobs in pending/processing/retrying states), it marks the parent PLAN job as `'completed'` with `completed_at` timestamp, (e) verify the `handle_job_completion` trigger correctly identifies stage completion: when the last RENDER job reaches `'completed'` status, the trigger queries for jobs with status LIKE 'pending%' OR 'processing%' OR 'retrying%' and finds NONE, so it sets `v_is_stage_complete = true` and updates the session status accordingly, (8) **Consumer Assertion**: Verify the final state: (a) the rendered markdown file exists in storage and can be downloaded, (b) the `dialectic_project_resources` record exists with correct `source_contribution_id`, (c) the stage is marked complete (no jobs remain in pending/processing/retrying states), (d) the session status reflects stage completion. This test must initially fail if ANY of the data dependencies are missing or incorrect, proving the exact flaw in the flow.
        *   `[ ]` 21.b.ii. Add an integration test "should NOT enqueue RENDER job when shouldEnqueueRenderJob returns false (JSON-only artifacts)" that: (1) creates an EXECUTE job with `output_type: 'header_context'` (a JSON-only artifact that `shouldEnqueueRenderJob` should return `false` for), (2) calls `executeModelCallAndSave`, (3) verifies `shouldEnqueueRenderJob` is called and returns `false`, (4) verifies NO RENDER job is inserted into `dialectic_generation_jobs`, (5) verifies the contribution is saved correctly, (6) verifies `assembleAndSaveFinalDocument` is called for final chunks (if applicable). This test proves the conditional logic works correctly.
        *   `[ ]` 21.b.iii. Add an integration test "should handle continuation chunks correctly in end-to-end flow" that: (1) creates a root chunk EXECUTE job and calls `executeModelCallAndSave`, verifying a RENDER job is enqueued, (2) creates a continuation chunk EXECUTE job with `target_contribution_id` pointing to the root chunk and `document_relationships: { [stageSlug]: rootContributionId }` in the payload, (3) calls `executeModelCallAndSave` for the continuation chunk, (4) verifies `document_relationships` is persisted from the job payload BEFORE RENDER job creation, (5) verifies the continuation chunk's RENDER job payload contains `documentIdentity: rootContributionId` (not the continuation's ID) and `sourceContributionId: continuationContributionId` (the continuation's ID), (6) processes the continuation chunk's RENDER job via `processRenderJob`, (7) verifies `renderDocument` queries using `documentIdentity: rootContributionId` and finds BOTH the root chunk and continuation chunk, (8) verifies the rendered document contains content from both chunks in correct order, (9) verifies the stage completion logic correctly accounts for both RENDER jobs (root and continuation) when determining if the stage is complete. This test proves continuation chunks work correctly in the end-to-end flow.
        *   `[ ]` 21.b.iv. Add an integration test "should correctly identify stage completion when all EXECUTE and RENDER jobs complete" that: (1) creates a stage with multiple recipe steps, each producing a markdown document, (2) creates EXECUTE jobs for all steps and processes them via `executeModelCallAndSave`, (3) verifies RENDER jobs are enqueued for all markdown documents, (4) processes all RENDER jobs via `processRenderJob`, (5) verifies ALL RENDER jobs reach `'completed'` status, (6) calls `processComplexJob` with the parent PLAN job and verifies: it queries all child jobs (EXECUTE and RENDER), it correctly identifies that ALL steps are complete (no jobs in pending/processing/retrying states), it marks the parent PLAN job as `'completed'`, (7) verifies the `handle_job_completion` trigger correctly identifies stage completion when the last job reaches `'completed'` status, (8) verifies the session status is updated to reflect stage completion. This test proves the stage completion logic works correctly when all jobs complete.
        *   `[ ]` 21.b.v. Add an integration test "should NOT mark stage complete when RENDER jobs are stuck in pending status" that: (1) creates an EXECUTE job and processes it via `executeModelCallAndSave`, (2) verifies a RENDER job is enqueued with status `'pending'`, (3) simulates a condition where the RENDER job cannot be processed (e.g., missing `user_jwt` in payload, invalid payload fields), (4) verifies the RENDER job remains in `'pending'` status, (5) calls `processComplexJob` with the parent PLAN job and verifies: it queries all child jobs, it correctly identifies that the RENDER job is still pending, it does NOT mark the parent PLAN job as `'completed'`, it attempts to re-plan the step (if applicable), (6) verifies the `handle_job_completion` trigger correctly identifies that the stage is NOT complete (RENDER job is still in `'pending'` status). This test proves the stage completion logic correctly accounts for RENDER job status.
    *   `[ ]` 21.c. `[BE]` **GREEN**: Fix any flaws identified by the integration tests in step 21.b by ensuring ALL data dependencies are satisfied in the correct sequence.
        *   `[ ]` 21.c.i. If the test from 21.b.i fails because `document_relationships` is not persisted before RENDER job creation, verify that the fixes from step 20 are correctly applied: `document_relationships` initialization for root chunks occurs IMMEDIATELY after contribution save (before RENDER job creation), `document_relationships` persistence for continuation chunks occurs IMMEDIATELY after contribution save (before RENDER job creation), the in-memory `contribution.document_relationships` is updated after database persistence, `documentIdentity` extraction happens AFTER `document_relationships` is persisted.
        *   `[ ]` 21.c.ii. If the test from 21.b.i fails because RENDER job payload is missing required fields, verify that ALL 8 required fields are included: `user_jwt` (extracted from parent EXECUTE job payload at lines 910-920 in `executeModelCallAndSave.ts`), `projectId` (from parent job payload), `sessionId` (from parent job payload), `iterationNumber` (from parent job payload), `stageSlug` (from parent job payload), `documentIdentity` (extracted from `document_relationships[stageSlug]` after persistence), `documentKey` (validated FileType from `validatedDocumentKey`), `sourceContributionId` (from `contribution.id`). Verify each field is validated before RENDER job creation and that errors are thrown if any field is missing or invalid.
        *   `[ ]` 21.c.iii. If the test from 21.b.i fails because `shouldEnqueueRenderJob` returns `false` incorrectly, verify that: the function correctly queries `dialectic_stages` to get `active_recipe_instance_id`, the function correctly queries recipe steps (from `dialectic_stage_recipe_steps` if cloned, or `dialectic_recipe_template_steps` if not cloned), the function correctly extracts markdown document keys from `outputs_required` JSONB field, the function correctly identifies when `outputType` matches an extracted markdown document key. Add logging to trace the query results and extraction logic if needed.
        *   `[ ]` 21.c.iv. If the test from 21.b.i fails because `processRenderJob` validation fails, verify that: ALL 7 required payload fields are present and of correct types (`projectId` is string, `sessionId` is string, `iterationNumber` is number, `stageSlug` is string, `documentIdentity` is string, `documentKey` is FileType, `sourceContributionId` is string), validation errors are thrown with descriptive messages if any field is missing or invalid, the function does not proceed with rendering if validation fails.
        *   `[ ]` 21.c.v. If the test from 21.b.i fails because `renderDocument` cannot find contributions, verify that: `documentIdentity` is correctly extracted from `document_relationships[stageSlug]` (not from other keys or fallback values), `document_relationships` is persisted to the database before `documentIdentity` extraction, the query uses `.contains("document_relationships", { [stageSlug]: documentIdentity })` correctly, all related chunks have `document_relationships[stageSlug]` set to the same `documentIdentity` value (root's contribution.id).
        *   `[ ]` 21.c.vi. If the test from 21.b.iv fails because stage completion logic incorrectly identifies incomplete stages, verify that: `processComplexJob` queries ALL child jobs (EXECUTE and RENDER jobs) when determining step completion, `processComplexJob` correctly identifies jobs in pending/processing/retrying states and does NOT mark steps as complete if any jobs are in these states, `processComplexJob` correctly marks the parent PLAN job as `'completed'` only when ALL non-skipped, validated steps have ALL their child jobs (EXECUTE and RENDER) in terminal states (`'completed'`, `'retry_loop_failed'`, or `'failed'`), `handle_job_completion` trigger correctly queries for jobs with status LIKE 'pending%' OR 'processing%' OR 'retrying%' and identifies stage completion when no such jobs exist, the trigger correctly updates session status when stage completion is detected.
        *   `[ ]` 21.c.vii. Ensure ALL fixes preserve existing functionality: root chunks still work correctly, continuation chunks still work correctly, JSON-only artifacts still work correctly, stage completion logic still works for non-rendered outputs, error handling still works correctly.
    *   `[ ]` 21.d. `[TEST-INT]` **GREEN**: Re-run all tests from step 21.b and ensure they now pass. The tests should prove that the complete end-to-end flow works correctly: EXECUTE jobs complete and enqueue RENDER jobs with ALL required fields, RENDER jobs are processed successfully, documents are rendered and saved, and stages are marked complete when all jobs finish.
    *   `[ ]` 21.e. `[LINT]` Run the linter for all files modified in step 21.c and resolve any warnings or errors.
    *   `[ ]` 21.f. `[CRITERIA]` All requirements are met: (1) A comprehensive integration test exercises the ENTIRE flow from EXECUTE job creation through stage completion, (2) ALL data dependencies are verified at each step: contribution save → `document_relationships` persistence → `shouldEnqueueRenderJob` check → RENDER job payload construction → RENDER job insertion → trigger invocation → worker routing → `processRenderJob` validation → `renderDocument` query → document rendering → stage completion check, (3) When an AI model returns valid JSON for a markdown document, the complete flow succeeds: RENDER job is enqueued with ALL 8 required fields (`user_jwt`, `projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `documentIdentity`, `documentKey`, `sourceContributionId`), RENDER job is processed successfully (all 7 validation fields pass), document is rendered and saved to storage, `dialectic_project_resources` record is created with correct `source_contribution_id`, and stage is marked complete, (4) `processComplexJob` correctly identifies stage completion when all EXECUTE and RENDER jobs are complete (no jobs in pending/processing/retrying states), (5) `handle_job_completion` trigger correctly identifies stage completion when no jobs remain in pending/processing/retrying states, (6) Continuation chunks work correctly in the end-to-end flow: `document_relationships` is persisted from job payload, RENDER job payload contains correct `documentIdentity` (root's ID) and `sourceContributionId` (continuation's ID), `renderDocument` finds all related chunks and renders them correctly, (7) Stage completion logic correctly accounts for RENDER job status when determining if stages are complete (stages are NOT marked complete if RENDER jobs are stuck in pending status), (8) All integration tests pass, proving the complete flow works correctly for root chunks, continuation chunks, multiple documents, and stage completion, (9) All files are lint-clean, (10) The two critical problems are resolved: RENDER jobs are enqueued when EXECUTE jobs complete with valid JSON for markdown documents, and stages are correctly marked complete when all EXECUTE and RENDER jobs finish (stages do NOT restart unnecessarily).
    *   `[ ]` 21.g. `[COMMIT]` `fix(be): ensure complete end-to-end document generation flow works correctly with all data dependencies satisfied`


*   `[ ]` 31. **`[BE]` Fix Stage Completion Loop in `processComplexJob`**
    *   `[ ]` 31.a. `[DEPS]` The `processComplexJob` function depends on several database tables and other functions to correctly orchestrate a `PLAN` job.
        *   `[ ]` 31.a.i. `supabase/functions/dialectic-worker/processComplexJob.ts`: This is the function to be modified.
        *   `[ ]` 31.a.ii. `dialectic_generation_jobs`: The function reads the status of all child jobs (EXECUTE and RENDER) to determine if a stage is complete.
        *   `[ ]` 31.a.iii. `dialectic_recipe_template_steps` / `dialectic_stage_recipe_steps`: The function reads the recipe definition to know which steps are required for the stage to be considered complete.
    *   `[ ]` 31.b. `[TYPES]` No new types are required for this change.
        *   `[ ]` 31.b.i. The fix will utilize existing types from `dialectic.interface.ts` such as `DialecticJobRow`, `DialecticPlanJobPayload`, `DialecticRecipeTemplateStep`, and `DialecticStageRecipeStep`.
    *   `[ ]` 31.c. `[TEST-UNIT]` Create a failing unit test that proves the infinite loop exists.
        *   `[ ]` 31.c.i. In the appropriate test file for `supabase/functions/dialectic-worker/processComplexJob.ts`.
        *   `[ ]` 31.c.ii. Create a test titled "should mark the parent PLAN job as completed when all recipe steps are successfully completed".
        *   `[ ]` 31.c.iii. The test will mock the database client and set up a state where all child jobs for a given PLAN job are marked as `completed`.
        *   `[ ]` 31.c.iv. Call `processComplexJob` with the parent PLAN job.
        *   `[ ]` 31.c.v. Assert that the function updates the parent PLAN job's status to `completed`. This test will fail because the current logic will incorrectly re-plan instead of completing the job.
    *   `[ ]` 31.d. `[BE]` Implement the fix in `processComplexJob.ts`.
        *   `[ ]` 31.d.i. In `processComplexJob.ts`, refactor the logic at the beginning of the function to perform a definitive check for stage completion before attempting to find the next ready steps.
        *   `[ ]` 31.d.ii. The new logic will fetch all non-skipped recipe steps and all child jobs for the parent PLAN job.
        *   `[ ]` 31.d.iii. It will create a `Set` of all `step_slug`s that have `completed` child jobs.
        *   `[ ]` 31.d.iv. If all required recipe steps are present in the set of completed steps, the function will update the parent PLAN job's status to `completed` and `return`, breaking the loop.
    *   `[ ]` 31.e. `[TEST-UNIT]` Prove the fix works by re-running the unit test.
        *   `[ ]` 31.e.i. Re-run the unit test created in step 31.c. The test will now pass.
    *   `[ ]` 31.f. `[TEST-INT]` Defer integration testing until after the dependent trigger is fixed.
        *   `[ ]` 31.f.i. The integration test for this function will be created in step 32.f, after its dependent (`handle_job_completion`) is also fixed, to prove the entire completion chain works as intended.
    *   `[ ]` 31.g. `[CRITERIA]` The work is complete when the function correctly identifies that all child jobs are complete and updates the parent job, preventing an infinite loop.
        *   `[ ]` 31.g.i. When all child jobs for a PLAN job are complete, `processComplexJob` correctly identifies this state and updates the parent job to `completed`.
        *   `[ ]` 31.g.ii. The system no longer enters an infinite loop of re-planning a completed stage.
    *   `[ ]` 31.h. `[COMMIT]` Provide a commit message for this change.
        *   `[ ]` 31.h.i. `fix(BE): Correct stage completion logic in processComplexJob`

*   `[ ]` 32. **`[DB]` [REFACTOR] Implement a Unified, Recipe-Driven State Management Trigger**
    *   `[ ]` 32.a. [DEPS] The system's state management will be consolidated into a single, unified state management trigger (`on_job_state_propagation`) that executes the function `manage_dialectic_state()`. This new function will manage state based on the stage's recipe, which defines a full Directed Acyclic Graph (DAG) of job dependencies via the `dialectic_stage_recipe_edges` table.
        *   `[ ]` 32.a.i. **Architectural Note:** The existing `on_job_status_change` trigger and its `invoke_worker_on_status_change` function (asynchronous worker invocation) are a separate concern and will be preserved. The `manage_dialectic_state` function handles only synchronous, in-database state changes.
    *   `[ ]` 32.b. [LOGIC] The `manage_dialectic_state()` function must be a comprehensive state machine, executing the following four parts sequentially:
        *   `[ ]` 32.b.i. **Part 1: Immediate Parent Failure Propagation:** If the updated job (`NEW`) has a `parent_job_id` and has entered a terminal failure state (`failed` or `retry_loop_failed`), the function must immediately `UPDATE` the parent job's status to `failed`. This action must take precedence over all other logic.
        *   `[ ]` 32.b.ii. **Part 2: Parent/Child Completion Orchestration:** If the updated job (`NEW`) has a `parent_job_id` and has entered a terminal state, the function must query for all its siblings. If all siblings are now in a terminal state, the function determines the parent's final status: if any sibling has failed, the parent is marked `failed`; if all siblings have `completed`, the parent is marked `completed`.
        *   `[ ]` 32.b.iii. **Part 3: Job-to-Job State Propagation (DAG-Aware):** This part uses the recipe's `dialectic_stage_recipe_edges` table as the source of truth for the stage's DAG.
            *   `[ ]` 32.b.iii.i. **Fan-out Failure Logic:** If any job enters a terminal failure state, the failure propagates through the entire downstream dependency chain. The function must find all jobs that depend on the failed job and mark them as `failed`.
            *   `[ ]` 32.b.iii.ii. **Fan-in Success Logic:** When a job enters `completed` status, the function iterates through its dependent jobs. For each dependent job, it checks if *all* of its prerequisite jobs are `completed`. If so, its status is updated from `waiting_for_prerequisite` to `pending`.
        *   `[ ]` 32.b.iv. **Part 4: Session-Level State Projection:** The function dynamically loads the active recipe for the stage and compares the set of completed jobs against the required steps to correctly update `dialectic_sessions.status` to `generating_[stage_slug]`, `[stage_slug]_generation_failed`, or `[stage_slug]_generation_complete`.
    *   `[ ]` 32.c. [TEST-INT] The test suite `supabase/integration_tests/triggers/manage_dialectic_state.trigger.test.ts` must contain the following test cases to prove all functionality:
        *   `[ ]` 32.c.i. **Test Case (Immediate Parent Failure):**
            *   `[ ]` 32.c.i.i. **Arrange**: Create a `PLAN` job with several child `EXECUTE` jobs.
            *   `[ ]` 32.c.i.ii. **Act**: `UPDATE` one of the child jobs to `failed`.
            *   `[ ]` 32.c.i.iii. **Assert**: The trigger immediately marks the parent `PLAN` job as `failed`.
        *   `[ ]` 32.c.ii. **Test Case (Parent/Child Completion - Success):**
            *   `[ ]` 32.c.ii.i. **Arrange**: Create a `PLAN` job with two child `EXECUTE` jobs.
            *   `[ ]` 32.c.ii.ii. **Act**: `UPDATE` the first child job to `completed`, then `UPDATE` the second child job to `completed`.
            *   `[ ]` 32.c.ii.iii. **Assert**: After the first update, the parent `PLAN` job's status is unchanged. After the second update, the trigger automatically updates the parent `PLAN` job to `completed`.
        *   `[ ]` 32.c.iii. **Test Case (Parent/Child Completion - Failure):**
            *   `[ ]` 32.c.iii.i. **Arrange**: Create a `PLAN` job with two child `EXECUTE` jobs.
            *   `[ ]` 32.c.iii.ii. **Act**: `UPDATE` the first child job to `completed`, then `UPDATE` the second child job to `failed`.
            *   `[ ]` 32.c.iii.iii. **Assert**: After the second update, the trigger automatically updates the parent `PLAN` job to `failed`.
        *   `[ ]` 32.c.iv. **Test Case (Full DAG Failure Propagation):**
            *   `[ ]` 32.c.iv.i. **Arrange**: Set up jobs for a multi-step dependency chain (A -> B -> C).
            *   `[ ]` 32.c.iv.ii. **Act**: `UPDATE` job A to `failed`.
            *   `[ ]` 32.c.iv.iii. **Assert**: The trigger propagates failure, marking both job B and job C as `failed`.
        *   `[ ]` 32.c.v. **Test Case (Handling `retry_loop_failed`):**
            *   `[ ]` 32.c.v.i. **Arrange**: Create a `PLAN` job with a child `EXECUTE` job.
            *   `[ ]` 32.c.v.ii. **Act**: `UPDATE` the child job to `retry_loop_failed`.
            *   `[ ]` 32.c.v.iii. **Assert**: The trigger immediately marks the parent `PLAN` job as `failed`.
        *   `[ ]` 32.c.vi. **Test Case (DAG Fan-in Success - Many-to-One):**
            *   `[ ]` 32.c.vi.i. **Arrange**: Create a job C that depends on two prerequisite jobs (A and B).
            *   `[ ]` 32.c.vi.ii. **Act**: `UPDATE` job A to `completed`.
            *   `[ ]` 32.c.vi.iii. **Assert**: Job C remains `waiting_for_prerequisite`.
            *   `[ ]` 32.c.vi.iv. **Act**: `UPDATE` job B to `completed`.
            *   `[ ]` 32.c.vi.v. **Assert**: The trigger updates job C's status to `pending`.
        *   `[ ]` 32.c.vii. **Test Case (Full Lifecycle and Session Completion):**
            *   `[ ]` 32.c.vii.i. **Arrange**: Set up the full parent `PLAN` and child `EXECUTE` job structure for a stage.
            *   `[ ]` 32.c.vii.ii. **Act**: Sequentially `UPDATE` all child `EXECUTE` jobs to `completed`.
            *   `[ ]` 32.c.vii.iii. **Assert**: After the final child job is completed, the trigger first updates the parent `PLAN` job to `completed`. Subsequently, the trigger recognizes the stage is complete and updates the `dialectic_sessions.status` to `[stage_slug]_generation_complete`.
    *   `[ ]` 32.d. [DB] The migration `<timestamp>_implement_unified_state_trigger.sql` will perform the following actions:
        *   `[ ]` 32.d.i. Create the `manage_dialectic_state()` function containing all logic from 32.b.
        *   `[ ]` 32.d.ii. Create the `on_job_state_propagation` trigger on `dialectic_generation_jobs` that executes the function.
        *   `[ ]` 32.d.iii. `DROP` the obsolete triggers: `trigger_handle_job_completion_on_update` and `trigger_handle_job_completion_on_insert`.
        *   `[ ]` 32.d.iv. `DROP` the obsolete function: `handle_job_completion()`.
    *   `[ ]` 32.e. [CRITERIA] The system is fixed when the trigger correctly manages all parent/child relationships, all job-to-job dependencies according to the recipe's DAG, correctly propagates all terminal statuses, and the `dialectic_sessions.status` is accurately projected.

*   `[ ]` 36. **`[BE]` Fix Try-Catch Swallowing Exceptions in executeModelCallAndSave RENDER Job Enqueueing**
    *   `[ ]` 36.a. `[DEPS]` The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` (lines 1328-1425) contains a try-catch block that swallows ALL exceptions during RENDER job enqueueing, preventing error propagation to the caller (`processSimpleJob`). The function has three distinct failure points: (Point A, line 1331) `shouldEnqueueRenderJob()` database queries can fail, (Point B, lines 1336-1396) payload validation throws for missing/invalid fields, and (Point C, lines 1410-1421) database insert can fail for RLS/FK violations. **CRITICAL UNDERSTANDING:** EXECUTE and RENDER jobs share the same recipe step which is already validated before EXECUTE job creation. Therefore, validation at lines 1336-1396 checks that OUR CODE correctly extracted/passed data from the already-valid recipe step (not validating the recipe step itself). The current error handling is inconsistent: validation logic (Point B) throws exceptions for code bugs but the try-catch at lines 1423-1425 catches them all and only logs, lines 1416-1421 check `renderInsertError` but only log without throwing, and the function continues to line 1427+ as if RENDER job succeeded, with no error propagation to `processSimpleJob` which expects exceptions per its try-catch at lines 302-309. The `Promise<void>` return type forces exception-based error handling, but swallowing exceptions breaks this contract—the caller assumes success when the promise resolves. This makes debugging impossible: EXECUTE jobs complete successfully while RENDER jobs silently fail to be created, and errors are logged but hidden from job status. The fix requires: (1) removing the try-catch at lines 1423-1425 that swallows all errors, (2) categorizing database insert errors at lines 1416-1421: throw immediately for programmer errors (FK violations, constraint violations), implement retry or throw for transient errors (connection timeouts), (3) keeping validation exactly where it is (lines 1336-1396) since it checks code correctness, not recipe validity, (4) letting validation exceptions propagate naturally—if validation fails, it's a code bug that should fail EXECUTE to force developer to fix.
    *   `[ ]` 36.b. `[TYPES]` No TypeScript type changes required. The function already returns `Promise<void>` and uses strict typing for `renderPayload` with `isDialecticRenderJobPayload()` and `isJson()` type guards. The fix is purely about restructuring error handling flow, not changing types.
    *   `[ ]` 36.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.renderErrors.test.ts` (new file), add tests that prove the try-catch swallows exceptions and prevents error propagation.
        *   `[ ]` 36.c.i. Add a test case "executeModelCallAndSave throws exception when RENDER payload validation fails for missing documentKey" that: (1) creates an EXECUTE job with markdown `output_type`, (2) mocks `shouldEnqueueRenderJob` to return `true` (rendering required), (3) sets up state where `validatedDocumentKey` is undefined (simulating validation failure at lines 1350-1353), (4) calls `executeModelCallAndSave`, (5) asserts that the function THROWS an exception with message "documentKey is required for RENDER job", (6) asserts that the EXECUTE job does NOT complete successfully (error is propagated). This test must initially FAIL because the current try-catch (lines 1423-1425) swallows the validation exception, allowing the function to complete without throwing.
        *   `[ ]` 36.c.ii. Add a test case "executeModelCallAndSave throws exception when RENDER payload validation fails for missing documentIdentity" that: (1) creates an EXECUTE job with markdown `output_type`, (2) mocks `shouldEnqueueRenderJob` to return `true`, (3) sets up state where `documentIdentity` is undefined (simulating validation failure at lines 1354-1357), (4) calls `executeModelCallAndSave`, (5) asserts that the function THROWS an exception with message "documentIdentity is required for RENDER job", (6) asserts the error is propagated to the caller. This test must initially FAIL because the try-catch swallows the validation exception.
        *   `[ ]` 36.c.iii. Add a test case "executeModelCallAndSave throws exception when database insert fails for RENDER job" that: (1) creates an EXECUTE job with markdown `output_type` and valid payload, (2) mocks `shouldEnqueueRenderJob` to return `true`, (3) mocks the database insert (`dbClient.from('dialectic_generation_jobs').insert()`) to return an error (simulating RLS policy rejection or FK constraint violation), (4) calls `executeModelCallAndSave`, (5) asserts that the function THROWS an exception containing the database error details, (6) asserts the error is propagated to the caller. This test must initially FAIL because lines 1416-1421 only log the `renderInsertError` without throwing, and the try-catch swallows any exception that might occur.
        *   `[ ]` 36.c.iv. Add a test case "executeModelCallAndSave throws exception when shouldEnqueueRenderJob query fails" that: (1) creates an EXECUTE job with markdown `output_type`, (2) mocks `shouldEnqueueRenderJob` to throw a database error (simulating connection failure), (3) calls `executeModelCallAndSave`, (4) asserts that the function THROWS an exception containing the query error details, (5) asserts the error is propagated to the caller. This test must initially FAIL because the try-catch at lines 1423-1425 swallows the exception from `shouldEnqueueRenderJob`.
    *   `[ ]` 36.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, remove silent failure and categorize database errors.
        *   `[ ]` 36.d.i. **STEP 1 - Remove silent failure try-catch:** Remove the try-catch block at lines 1423-1425 that currently swallows all errors. This allows validation exceptions (code bugs) to propagate naturally to `processSimpleJob` which will mark the EXECUTE job as 'failed', forcing the developer to fix the code issue.
        *   `[ ]` 36.d.ii. **STEP 2 - Categorize database insert errors:** At lines 1416-1421, when `renderInsertError` exists, inspect the error details to determine if it's a programmer error or transient error. If programmer error (FK violation like "foreign key constraint", constraint violation like "unique constraint", RLS policy rejection): throw `RenderJobEnqueueError` immediately with descriptive message including error details. If transient error (connection timeout like "connection refused", "too many connections"): implement local retry with exponential backoff OR throw to trigger job-level retry via existing retry mechanism.
        *   `[ ]` 36.d.iii. **STEP 3 - Keep validation exactly where it is:** The validation logic at lines 1336-1396 stays in place unchanged. It checks that our code correctly extracted `validatedDocumentKey` and `documentIdentity` from the already-validated recipe step. If validation fails, it's a code bug (not a recipe problem), so the exception should propagate to fail the EXECUTE job and alert the developer.
        *   `[ ]` 36.d.iv. **ERROR CLASSES:** Use custom error classes from `supabase/functions/_shared/utils/errors.ts`: `RenderJobValidationError` (thrown by validation at lines 1350-1396 for code bugs extracting data from valid recipe step), `RenderJobEnqueueError` (thrown at lines 1416-1421 for programmer errors during database insert like FK violations). Import these at the top of the file.
        *   `[ ]` 36.d.v. Verify the restructured code follows this flow: (1) Validation logic (lines 1336-1396) remains in place, throws `RenderJobValidationError` for code bugs, (2) No try-catch wrapping validation—exceptions propagate naturally, (3) Database insert errors at lines 1416-1421 are categorized and thrown (programmer errors throw `RenderJobEnqueueError`, transient errors retry or throw), (4) All exceptions propagate to `processSimpleJob` which marks job as 'failed' with error details.
    *   `[ ]` 36.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 36.c and ensure they now pass. The tests should prove that: (1) Validation exceptions for missing `documentKey` are thrown and propagated (test 36.c.i passes), (2) Validation exceptions for missing `documentIdentity` are thrown and propagated (test 36.c.ii passes), (3) Database insert failures throw exceptions and are propagated (test 36.c.iii passes), (4) Query failures from `shouldEnqueueRenderJob` throw exceptions and are propagated (test 36.c.iv passes). All tests demonstrate that exceptions are no longer swallowed and errors reach the caller.
    *   `[ ]` 36.f. `[TEST-INT]` Prove error propagation works correctly with the caller `processSimpleJob` by adding test cases to `supabase/integration_tests/services/executeModelCallAndSave.integration.test.ts`
        *   `[ ]` 36.f.i. Assert that when `executeModelCallAndSave` in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` (test subject) throws an exception due to RENDER payload validation failure, `processSimpleJob` in `supabase/functions/dialectic-worker/processSimpleJob.ts` (consumer) catches the exception in its try-catch block (lines 302-309), marks the EXECUTE job status as 'failed', and updates the job record with error details. Create an integration test that: (1) sets up an EXECUTE job with markdown `output_type` and invalid state (missing `documentKey`), (2) calls `processSimpleJob` with the job, (3) verifies `executeModelCallAndSave` throws a validation exception, (4) verifies `processSimpleJob` catches the exception and updates the job status to 'failed' with appropriate error_details, (5) verifies the job does NOT complete successfully, proving validation errors are now visible at the job level.
        *   `[ ]` 36.f.ii. Assert that when `executeModelCallAndSave` (test subject) throws an exception due to database insert failure for RENDER job, `processSimpleJob` (consumer) catches it and marks the EXECUTE job as 'failed'. Create an integration test that: (1) sets up an EXECUTE job with markdown `output_type` and valid payload, (2) mocks the database insert to fail (simulating RLS rejection), (3) calls `processSimpleJob`, (4) verifies `executeModelCallAndSave` throws an exception containing database error details, (5) verifies `processSimpleJob` catches it and updates the job to 'failed', proving database errors are now propagated and visible.
        *   `[ ]` 36.f.iii. Assert that when `shouldEnqueueRenderJob` throws a query exception, the error propagates through `executeModelCallAndSave` (test subject) to `processSimpleJob` (consumer) and the EXECUTE job is marked as 'failed'. Create an integration test that: (1) sets up an EXECUTE job with markdown `output_type`, (2) mocks `shouldEnqueueRenderJob` to throw a database connection error, (3) calls `processSimpleJob`, (4) verifies the exception propagates and the job is marked 'failed', proving query failures are no longer silently swallowed.
    *   `[ ]` 36.g. `[LINT]` Run the linter for `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` and `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts`, and resolve any warnings or errors.
    *   `[ ]` 36.h. `[CRITERIA]` All requirements are met: (1) The try-catch at lines 1423-1425 that swallowed all errors has been removed, (2) Database insert errors at lines 1416-1421 are now categorized and thrown: programmer errors (FK violations, constraint violations) throw `RenderJobEnqueueError` immediately, transient errors (connection timeouts) retry or throw, (3) Validation logic (lines 1336-1396) remains in place unchanged, checking that code correctly extracted data from the already-validated recipe step, (4) Validation exceptions propagate naturally to `processSimpleJob` (no try-catch swallowing them), (5) The `Promise<void>` error handling contract is restored—exceptions are thrown on failures, not swallowed, (6) All tests pass, including tests that verify validation exceptions, database insert failures, and query failures are thrown and propagated, (7) Integration tests prove `processSimpleJob` receives exceptions and marks jobs as 'failed', (8) The file is lint-clean, (9) RENDER job failures are now visible: errors are logged AND propagated, EXECUTE jobs fail when RENDER job creation fails (instead of silently completing), errors are actionable (job status reflects failure, error_details contain diagnostic information), (10) The fix correctly understands that EXECUTE and RENDER share the same validated recipe step, so validation checks code correctness, not recipe validity.
    *   `[ ]` 36.i. `[COMMIT]` `fix(be): remove try-catch swallowing RENDER job errors and categorize database insert failures in executeModelCallAndSave`

*   `[ ]` 37. **[BE]** Fix validatedDocumentKey scope mismatch in executeModelCallAndSave
    *   `[✅]`   37.a. [DEPS] Identify variable scope issue between fileType and output_type
        *   `[✅]` 37.a.i. Line 1136: `const fileType: ModelContributionFileTypes = output_type;` - fileType initialized to output_type (the document key like 'business_requirements_document')
        *   `[✅]` 37.a.ii. Line 1219-1226: `validatedDocumentKey` is set IF `isDocumentKey(fileType)` returns true
        *   `[✅]` 37.a.iii. Line 1230-1232: `storageFileType` is computed - IF `isDocumentKey(fileType)` THEN use `FileType.ModelContributionRawJson` ELSE use original `fileType`
        *   `[✅]` 37.a.iv. Line 1237+: `uploadContext` uses `storageFileType` for file storage (raw_responses/ folder)
        *   `[✅]` 37.a.v. Line 1331: `shouldEnqueueRenderJob` checks ORIGINAL `output_type` (not modified fileType or storageFileType)
        *   `[✅]` 37.a.vi. Line 1350: RENDER job creation expects `validatedDocumentKey` to be defined
        *   `[✅]` 37.a.vii. **BUG**: `validatedDocumentKey` populated based on `fileType` at line 1220, but `shouldEnqueueRenderJob` uses `output_type` - these may diverge
        *   `[✅]` 37.a.viii. **BUG**: For document outputs, `isDocumentKey(fileType)` may return false if fileType was modified, causing `validatedDocumentKey` to remain undefined
    *   `[✅]`   37.b. [TYPES] Define correct variable usage for document key tracking
        *   `[✅]` 37.b.i. `output_type` (from job.payload): The semantic document key representing WHAT is being generated ('business_case')
        *   `[✅]` 37.b.ii. `fileType`: Physical file type for storage purposes (may be transformed to 'ModelContributionRawJson' for raw storage)
        *   `[✅]` 37.b.iii. `storageFileType`: Computed value for FileManagerService determining storage path
        *   `[✅]` 37.b.iv. `validatedDocumentKey`: Must represent the SEMANTIC document key (output_type), not the storage file type
        *   `[✅]` 37.b.v. `shouldEnqueueRenderJob({ outputType: output_type })`: Queries recipe using SEMANTIC document key
        *   `[✅]` 37.b.vi. **RULE**: `validatedDocumentKey` must be populated based on `output_type`, NOT `fileType`, because RENDER job needs the semantic document key
    *   `[✅]`   37.c. [TEST-UNIT] Write RED test proving validatedDocumentKey is undefined when it should be defined
        *   `[✅]` 37.c.i. Test: EXECUTE job with `output_type = 'business_case'` (a document key)
        *   `[✅]` 37.c.ii. Test: `isDocumentKey(output_type)` returns true, `shouldEnqueueRenderJob` returns true (markdown document)
        *   `[✅]` 37.c.iii. Test: Trace variable values through execution: `fileType = output_type`, then `storageFileType = FileType.ModelContributionRawJson`
        *   `[✅]` 37.c.iv. Assert: At line 1350, `validatedDocumentKey` should equal `job.payload.document_key`
        *   `[✅]` 37.c.v. Current behavior: If `isDocumentKey(fileType)` was checked AFTER `storageFileType` assignment, `validatedDocumentKey` may be undefined
        *   `[✅]` 37.c.vi. Expected: Test FAILS in current implementation (validatedDocumentKey undefined, line 1350 throws, exception silently caught)
    *   `[✅]`   37.d. [IMPLEMENTATION] Fix validatedDocumentKey to use output_type instead of fileType
        *   `[✅]` 37.d.i. Change line 1220 from `if (isDocumentKey(fileType))` to `if (isDocumentKey(output_type))`
        *   `[✅]` 37.d.ii. Rationale: `output_type` is the semantic document key that never changes, while `fileType` may be transformed for storage purposes
        *   `[✅]` 37.d.iii. Ensure `validatedDocumentKey` is set BEFORE any file type transformations occur
        *   `[✅]` 37.d.iv. Add assertion: `validatedDocumentKey` must be defined when entering RENDER job creation block (line 1337+)
        *   `[✅]` 37.d.v. Add logging: Log `output_type`, `fileType`, `storageFileType`, `validatedDocumentKey` before RENDER job creation for debugging
    *   `[✅]`   37.e. [TEST-UNIT] Rerun tests proving validatedDocumentKey is correctly populated
        *   `[✅]` 37.e.i. Test: Same scenario as 37.c - markdown document output
        *   `[✅]` 37.e.ii. Assert: `validatedDocumentKey === job.payload.document_key`
        *   `[✅]` 37.e.iii. Assert: RENDER job is created successfully with `documentKey: validatedDocumentKey`
        *   `[✅]` 37.e.iv. Assert: No exception thrown, no silent failure
    *   `[ ]`   37.f. [TEST-INT] Prove document generation → RENDER job → rendered output flow works end-to-end
        *   `[ ]` 37.f.i. Integration test: Create EXECUTE job for markdown document → executeModelCallAndSave → RENDER job created → processRenderJob → document_renderer → markdown file in dialectic_project_resources
        *   `[ ]` 37.f.ii. Assert: RENDER job payload contains correct `documentKey` matching original `output_type`
        *   `[ ]` 37.f.iii. Assert: Rendered markdown file exists in storage with correct path
    *   `[ ]`   37.g. [CRITERIA] validatedDocumentKey is always correctly populated for document outputs, RENDER jobs are created with correct documentKey, no scope-related failures occur
    *   `[ ]`   37.h. [COMMIT] Fix validatedDocumentKey scope bug - use output_type instead of fileType

*   `[ ]` 38. **[RESEARCH]** Design unified state management replacing handle_job_completion with manage_dialectic_state
    *   `[ ]`   38.a. [DEPS] Map complete state machine and identify conflicts
        *   `[ ]` 38.a.i. Current Triggers:
            *   `on_job_state_propagation` (from 20251217224555_implement_unified_state_trigger.sql) - Fires on INSERT or UPDATE of status, calls `manage_dialectic_state()`
            *   `on_job_status_change` (from 20251119160820_retrying_trigger.sql) - Fires on UPDATE to pending/retrying/pending_next_step/pending_continuation, calls `invoke_worker_on_status_change()`
            *   `on_job_terminal_state` (dropped by 20251217224555) - Previously fired on terminal states, called `handle_job_completion()` (now dropped)
        *   `[ ]` 38.a.ii. Current Functions:
            *   `manage_dialectic_state()` - Part 1: DAG-based job-to-job propagation, Part 2: Session-level completion detection
            *   `invoke_worker_on_status_change()` - HTTP POST to dialectic-worker when job reaches processable status
            *   `handle_job_completion()` (NOT dropped, still exists!) - Manages parent_job_id and prerequisite_job_id relationships, counts siblings, excludes RENDER jobs
        *   `[ ]` 38.a.iii. Application Functions:
            *   `processComplexJob()` - Lines 183-382: Tracks in-progress jobs, completed source documents, determines ready steps, plans child jobs
            *   `executeModelCallAndSave()` - Lines 1536-1544: Marks EXECUTE job as completed, updates attempt_count
        *   `[ ]` 38.a.iv. **CONFLICT IDENTIFIED**: `manage_dialectic_state()` Part 1 (lines 36-97) handles DAG edges but ignores `parent_job_id` and `prerequisite_job_id`
        *   `[ ]` 38.a.v. **CONFLICT IDENTIFIED**: `handle_job_completion()` lines 388-406 manages parent-child and sibling completion, but `manage_dialectic_state()` doesn't replicate this logic
        *   `[ ]` 38.a.vi. **CONFLICT IDENTIFIED**: `processComplexJob()` lines 282-285 excludes steps with ONLY completed jobs from re-planning, but `manage_dialectic_state()` Part 2 (lines 110-116) counts DISTINCT step_slugs without checking for mixed states
        *   `[ ]` 38.a.vii. **CONFLICT IDENTIFIED**: Step 32 migration drops `on_job_terminal_state` trigger but does NOT drop `handle_job_completion()` function - if trigger still exists from older migration, both triggers will fire
        *   `[ ]` 38.a.viii. **STATE TABLE**: Draw a current state table and a target state table that describes every table, row, trigger, and state required for the state machine to operate, showing the required state management, and the existing state management to prove every gap in the current system. The diff between current and target proves the gap. 
        *   `[ ]` 38.a.ix. **MERMAID DIAGRAM**: Draw a Mermaid diagram that graphs the flow and logic for all the state transitions, identifying the specific table, row, trigger, and conditions to change its state. 
        *   `[ ]` 38.a.x. **TRIGGER STATE MAP**: Draw a Mermaid diagram that graphs the flow and logic for all the state transitions, identifying the specific table, row, trigger, and conditions to change its state. The state map will define the logic for a new trigger or set of triggers that ensure all states are reachable and have the required logic. 
    *   `[ ]`   38.b. [TYPES] Define complete state transition table
        *   `[ ]` 38.b.i. Research Task: Document ALL possible job status values and transitions
        *   `[ ]` 38.b.ii. Research Task: Map which statuses require worker invocation vs. trigger-only state changes
        *   `[ ]` 38.b.iii. Research Task: Define terminal states, in-progress states, waiting states
        *   `[ ]` 38.b.iv. Research Task: Document relationship between job_type (PLAN/EXECUTE/RENDER) and status transitions
        *   `[ ]` 38.b.v. Research Task: Define when parent jobs transition based on child completion
        *   `[ ]` 38.b.vi. Research Task: Define when session status changes based on job completion
    *   `[ ]`   38.c. [TYPES] Define step completion tracking requirements
        *   `[ ]` 38.c.i. Problem: Recipe step may spawn N jobs (M models × P source documents × Q continuation chunks)
        *   `[ ]` 38.c.ii. Problem: Counting DISTINCT step_slug with status='completed' doesn't account for partial completion (some jobs complete, others pending)
        *   `[ ]` 38.c.iii. Problem: `processComplexJob` filters out steps with in-progress jobs (line 285), but trigger doesn't have this logic
        *   `[ ]` 38.c.iv. Research Task: Should trigger count (completed_jobs_for_step / total_jobs_for_step) per step, or rely on application to mark steps complete?
        *   `[ ]` 38.c.v. Research Task: Should we add `step_completion_status` table that `processComplexJob` updates, and trigger queries?
        *   `[ ]` 38.c.vi. Research Task: How do RENDER jobs (which are side-effects) factor into step completion? Currently excluded by `handle_job_completion` line 362
    *   `[ ]`   38.d. [RESEARCH] Investigate current production failures and looping
        *   `[ ]` 38.d.i. Research Task: Query production logs for `[processComplexJob]` entries showing repeated planning for same step_slug
        *   `[ ]` 38.d.ii. Research Task: Check if `completedStepSlugs.has(slug)` check (processComplexJob.ts:282) is preventing re-planning correctly
        *   `[ ]` 38.d.iii. Research Task: Verify trigger query `SELECT count(DISTINCT step_slug) ... WHERE status = 'completed'` is counting correctly
        *   `[ ]` 38.d.iv. Research Task: Check if session status is being set to `*_generation_complete` prematurely (trigger line 134)
        *   `[ ]` 38.d.v. Research Task: Verify `v_required_steps_count` (line 105-108) matches actual recipe step requirements
        *   `[ ]` 38.d.vi. Research Task: Check if in-progress RENDER jobs are preventing stage completion
    *   `[ ]`   38.e. [RESEARCH] Design single source of truth for state management
        *   `[ ]` 38.e.i. Option A: Triggers handle ALL state transitions, application functions are passive observers
        *   `[ ]` 38.e.ii. Option B: Application functions handle state transitions, triggers only invoke worker
        *   `[ ]` 38.e.iii. Option C: Hybrid - triggers handle prerequisite unblocking, application handles step/session completion
        *   `[ ]` 38.e.iv. Research Task: Evaluate which option aligns with current architecture (job-driven vs. event-driven)
        *   `[ ]` 38.e.v. Research Task: Consider transaction boundaries - can trigger and application update same job without conflicts?
        *   `[ ]` 38.e.vi. Research Task: Consider testing complexity - triggers are harder to test than application functions
    *   `[ ]`   38.f. [RESEARCH] Reconcile DAG edges with parent_job_id and prerequisite_job_id
        *   `[ ]` 38.f.i. Research Task: Are DAG edges (dialectic_stage_recipe_edges) and parent_job_id representing the same relationships?
        *   `[ ]` 38.f.ii. Research Task: When should prerequisite_job_id be used vs. DAG edge dependencies?
        *   `[ ]` 38.f.iii. Research Task: Can we eliminate parent_job_id in favor of DAG edges, or do they serve different purposes?
        *   `[ ]` 38.f.iv. Research Task: RENDER jobs have parent_job_id pointing to EXECUTE job - how does this fit into DAG model?
        *   `[ ]` 38.f.v. Research Task: Continuation jobs have target_contribution_id - is this a prerequisite_job_id relationship?
    *   `[ ]`   38.g. [CRITERIA] Complete state machine documented, conflicts identified, design decision made on single source of truth, integration plan created
    *   `[ ]`   38.h. **[HOLD]** Cannot proceed to implementation until research complete and design approved

*   `[ ]` 39. **[IMPLEMENTATION]** Implement unified state management solution
    *   `[ ]`   39.a. [DEPS] **TO BE DEFINED** - Based on Step 35 research findings
    *   `[ ]`   39.b. [TYPES] **TO BE DEFINED** - Based on Step 35 design decisions
    *   `[ ]`   39.c. [TEST-UNIT] **TO BE DEFINED** - Based on Step 35 requirements
    *   `[ ]`   39.d. [IMPLEMENTATION] **TO BE DEFINED** - Based on Step 35 approved design
    *   `[ ]`   39.e. [TEST-UNIT] **TO BE DEFINED** - Based on Step 35 success criteria
    *   `[ ]`   39.f. [TEST-INT] **TO BE DEFINED** - Based on Step 35 integration requirements
    *   `[ ]`   39.g. [CRITERIA] **TO BE DEFINED** - Based on Step 35 acceptance criteria
    *   `[ ]`   39.h. [COMMIT] **TO BE DEFINED** - Based on Step 35 scope

*   `[✅]` 46. **`[TYPES]` Define Job Context Interfaces**
    *   `[✅]` 46.a. `[DEPS]` Base context interfaces are the foundation of the hierarchical context system. They represent minimal, composable units of dependencies that can be combined into larger contexts. These interfaces have zero dependencies and are pure type definitions, making them the lowest layer in the dependency graph. Each base context represents a single concern: logging, file operations, AI model calls, RAG operations, token wallet, or notifications. Higher-level composed contexts will extend these base interfaces to create function-specific dependency bundles. This step creates a single file `supabase/functions/dialectic-worker/JobContext.interface.ts` that defines all six base context interfaces.
    *   `[✅]` 46.b. `[TYPES]` In new file `supabase/functions/dialectic-worker/JobContext.interface.ts`, define all base context interfaces:
        *   `[✅]` 46.b.i. Import required types: `ILogger` from `../../_shared/types.ts`, `IFileManager`, `DownloadFromStorageFn`, `DeleteFromStorageFn` from file manager types, `CallUnifiedAIModelFn`, `GetAiProviderAdapterFn`, `GetAiProviderConfigFn` from AI types, `IRagService`, `IIndexingService`, `IEmbeddingClient`, `CountTokensFn` from RAG types, `ITokenWalletService` from token wallet types, `NotificationServiceType` from notification types.
        *   `[✅]` 46.b.ii. Define base logging context:
            ```typescript
            /**
                * Base context providing logging capabilities.
            * All contexts extend this to ensure consistent logging.
            */
            export interface ILoggerContext {
            readonly logger: ILogger;
            }
            ```
        *   `[✅]` 46.b.iii. Define base file operations context:
            ```typescript
            /**
                * Base context providing file management and storage operations.
            * Used by functions that need to read/write files to Supabase Storage.
            */
            export interface IFileContext {
            readonly fileManager: IFileManager;
            readonly downloadFromStorage: DownloadFromStorageFn;
            readonly deleteFromStorage: DeleteFromStorageFn;
            }
            ```
        *   `[✅]` 46.b.iv. Define base AI model context:
            ```typescript
            /**
             * Base context providing AI model invocation and configuration.
            * Used by functions that need to call AI models or manage model providers.
            */
            export interface IModelContext {
            readonly callUnifiedAIModel: CallUnifiedAIModelFn;
            readonly getAiProviderAdapter: GetAiProviderAdapterFn;
            readonly getAiProviderConfig: GetAiProviderConfigFn;
            }
            ```
        *   `[✅]` 46.b.v. Define base RAG context:
            ```typescript
            /**
             * Base context providing RAG (Retrieval-Augmented Generation) operations.
            * Used by functions that need indexing, embeddings, or semantic search.
            */
            export interface IRagContext {
            readonly ragService: IRagService;
            readonly indexingService: IIndexingService;
            readonly embeddingClient: IEmbeddingClient;
            readonly countTokens: CountTokensFn;
            }
            ```
        *   `[✅]` 46.b.vi. Define base token wallet context:
            ```typescript
            /**
             * Base context providing token wallet operations.
            * Used by functions that need to debit/credit token wallets.
            */
            export interface ITokenContext {
            readonly tokenWalletService: ITokenWalletService;
            }
            ```
        *   `[✅]` 46.b.vii. Define base notification context:
            ```typescript
            /**
             * Base context providing notification services.
            * Used by functions that need to send user notifications.
            */
            export interface INotificationContext {
            readonly notificationService: NotificationServiceType;
            }
            ```
    *   `[✅]` 46.c. `[TYPE-GUARD-TESTS]` **RED**: In new file `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.test.ts`, write failing type guard tests:
        *   `[✅]` 46.c.i. Test `isILoggerContext` returns true for valid logger context: `{ logger: mockLogger }` → true
        *   `[✅]` 46.c.ii. Test `isILoggerContext` returns false for missing logger: `{}` → false
        *   `[✅]` 46.c.iii. Test `isIFileContext` returns true for valid file context: `{ fileManager, downloadFromStorage, deleteFromStorage }` → true
        *   `[✅]` 46.c.iv. Test `isIFileContext` returns false for partial file context: `{ fileManager }` → false (missing other fields)
        *   `[✅]` 46.c.v. Test `isIModelContext` returns true for valid model context with all three fields
        *   `[✅]` 46.c.vi. Test `isIRagContext` returns true for valid RAG context with all four fields
        *   `[✅]` 46.c.vii. Test `isITokenContext` returns true for valid token context
        *   `[✅]` 46.c.viii. Test `isINotificationContext` returns true for valid notification context
        *   `[✅]` 46.c.ix. This test must initially FAIL because type guard functions don't exist yet.
    *   `[✅]` 46.d. `[TYPE-GUARDS]` **GREEN**: In new file `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts`, implement type guards:
        *   `[✅]` 46.d.i. Import `isRecord` from `../../../_shared/utils/type-guards/type_guards.common.ts`
        *   `[✅]` 46.d.ii. Import context interfaces from `../JobContext.interface.ts`
        *   `[✅]` 46.d.iii. Implement type guards using `isRecord` pattern without type casting:
        ```typescript
        export function isILoggerContext(value: unknown): value is ILoggerContext {
            if (!isRecord(value)) {
                return false;
            }
            return 'logger' in value && typeof value.logger === 'object' && value.logger !== null;
        }

        export function isIFileContext(value: unknown): value is IFileContext {
            if (!isRecord(value)) {
                return false;
            }
            return (
                'fileManager' in value &&
                'downloadFromStorage' in value &&
                'deleteFromStorage' in value &&
                typeof value.fileManager === 'object' &&
                value.fileManager !== null &&
                typeof value.downloadFromStorage === 'function' &&
                typeof value.deleteFromStorage === 'function'
            );
        }

        export function isIModelContext(value: unknown): value is IModelContext {
            if (!isRecord(value)) {
                return false;
            }
            return (
                'callUnifiedAIModel' in value &&
                'getAiProviderAdapter' in value &&
                'getAiProviderConfig' in value &&
                typeof value.callUnifiedAIModel === 'function' &&
                typeof value.getAiProviderAdapter === 'function' &&
                typeof value.getAiProviderConfig === 'function'
            );
        }

        export function isIRagContext(value: unknown): value is IRagContext {
            if (!isRecord(value)) {
                return false;
            }
            return (
                'ragService' in value &&
                'indexingService' in value &&
                'embeddingClient' in value &&
                'countTokens' in value &&
                typeof value.ragService === 'object' &&
                value.ragService !== null &&
                typeof value.indexingService === 'object' &&
                value.indexingService !== null &&
                typeof value.embeddingClient === 'object' &&
                value.embeddingClient !== null &&
                typeof value.countTokens === 'function'
            );
        }

        export function isITokenContext(value: unknown): value is ITokenContext {
            if (!isRecord(value)) {
                return false;
            }
            return (
                'tokenWalletService' in value &&
                typeof value.tokenWalletService === 'object' &&
                value.tokenWalletService !== null
            );
        }

        export function isINotificationContext(value: unknown): value is INotificationContext {
            if (!isRecord(value)) {
                return false;
            }
            return (
                'notificationService' in value &&
                typeof value.notificationService === 'object' &&
                value.notificationService !== null
            );
        }
        ```
    *   `[✅]` 46.e. `[TEST-UNIT]` **GREEN**: Re-run tests from 46.c and ensure all pass, proving type guards correctly validate base contexts.
    *   `[✅]` 46.f. `[LINT]` Run linter for `JobContext.interface.ts`, `JobContext.type_guards.test.ts`, and `JobContext.type_guards.ts`, resolve any errors.
    *   `[✅]` 46.g. `[CRITERIA]` All requirements met: (1) Six base context interfaces defined with explicit field types, (2) Each interface has JSDoc explaining its purpose, (3) Type guards implemented for all six interfaces, (4) All type guard tests pass, (5) Files are lint-clean, (6) Base contexts are foundation layer with zero dependencies, ready for composition in next step.

*   `[✅]` 47. **`[TYPES]` Define Composed Context Interfaces**
    *   `[✅]` 47.a. `[DEPS]` Composed context interfaces extend multiple base contexts to create function-specific dependency bundles. These represent the actual contexts that worker functions will receive. `IExecuteJobContext` combines logger, file, model, RAG, token, and notification contexts plus EXECUTE-specific utilities for functions that run AI models and save contributions. `IPlanJobContext` combines logger context plus planning utilities for functions that orchestrate multi-step workflows. `IRenderJobContext` combines logger and file contexts for functions that render markdown documents. Composed contexts depend on base contexts from step 46 and are the middle layer in the dependency graph. This step requires creating missing function type definitions first (bottom-up), then adding composed context interfaces to `supabase/functions/dialectic-worker/JobContext.interface.ts`, then updating functions to use their type definitions.
    *   `[✅]` 47.b. `[TYPES]` Create missing function type definitions (bottom-up dependency ordering):
        *   `[✅]` 47.b.i. In `supabase/functions/dialectic-service/dialectic.interface.ts`, add `GetSeedPromptForStageFn` type definition after `GetAiProviderConfigFn`:
        ```typescript
        export type GetSeedPromptForStageFn = (
          dbClient: SupabaseClient<Database>,
          projectId: string,
          sessionId: string,
          stageSlug: string,
          iterationNumber: number,
          downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>
        ) => Promise<SeedPromptData>;
        ```
        *   `[✅]` 47.b.ii. In `supabase/functions/_shared/path_utils.ts`, add `GetExtensionFromMimeTypeFn` type definition before the function:
        ```typescript
        export type GetExtensionFromMimeTypeFn = (mimeType: string) => string;
        ```
        *   `[✅]` 47.b.iii. In `supabase/functions/_shared/types/shouldEnqueueRenderJob.interface.ts`, add `ShouldEnqueueRenderJobFn` type definition after `ShouldEnqueueRenderJobResult`:
        ```typescript
        export type ShouldEnqueueRenderJobFn = (
          deps: ShouldEnqueueRenderJobDeps,
          params: ShouldEnqueueRenderJobParams
        ) => Promise<ShouldEnqueueRenderJobResult>;
        ```
        *   `[✅]` 47.b.iv. In `supabase/functions/dialectic-worker/strategies/granularity.strategies.ts`, add `GetGranularityPlannerFn` type definition (import from dialectic.interface.ts where `GranularityPlannerFn` is defined):
        ```typescript
        export type GetGranularityPlannerFn = (strategyId: string | null | undefined) => GranularityPlannerFn;
        ```
    *   `[✅]` 47.c. `[FUNCTIONS]` Update functions to use their type definitions:
        *   `[✅]` 47.c.i. In `supabase/functions/_shared/utils/dialectic_utils.ts`, change `getSeedPromptForStage` to use type definition:
        ```typescript
        export const getSeedPromptForStage: GetSeedPromptForStageFn = async (
          dbClient: SupabaseClient<Database>,
          projectId: string,
          sessionId: string,
          stageSlug: string,
          iterationNumber: number,
          downloadFromStorage: (bucket: string, path: string) => Promise<DownloadStorageResult>
        ): Promise<SeedPromptData> => {
        ```
        *   `[✅]` 47.c.ii. In `supabase/functions/_shared/path_utils.ts`, change `getExtensionFromMimeType` to use type definition:
        ```typescript
        export const getExtensionFromMimeType: GetExtensionFromMimeTypeFn = (mimeType: string): string => {
        ```
        *   `[✅]` 47.c.iii. In `supabase/functions/_shared/utils/shouldEnqueueRenderJob.ts`, change `shouldEnqueueRenderJob` to use type definition:
        ```typescript
        export const shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn = async (
          deps: ShouldEnqueueRenderJobDeps,
          params: ShouldEnqueueRenderJobParams
        ): Promise<ShouldEnqueueRenderJobResult> => {
        ```
        *   `[✅]` 47.c.iv. In `supabase/functions/dialectic-worker/strategies/granularity.strategies.ts`, change `getGranularityPlanner` to use type definition:
        ```typescript
        export const getGranularityPlanner: GetGranularityPlannerFn = (strategyId: string | null | undefined): GranularityPlannerFn => {
        ```
    *   `[✅]` 47.d. `[TYPES]` In `supabase/functions/dialectic-worker/JobContext.interface.ts`, import required types and define composed contexts:
        *   `[✅]` 47.d.i. Add imports at top of file after existing base context definitions:
        ```typescript
        import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
        import type { Database } from '../../types_db.ts';
        import { GetSeedPromptForStageFn, GranularityPlannerFn, PlanComplexStageFn } from '../dialectic-service/dialectic.interface.ts';
        import { IPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.interface.ts';
        import { GetExtensionFromMimeTypeFn } from '../_shared/path_utils.ts';
        import { ShouldEnqueueRenderJobFn } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';
        import { IDocumentRenderer } from '../_shared/services/document_renderer.interface.ts';
        import { GetGranularityPlannerFn } from './strategies/granularity.strategies.ts';
        ```
        *   `[✅]` 47.d.ii. Define `IExecuteJobContext` extending multiple base contexts (NO inline types, NO typeof). NOTE: Includes orchestration functions (continueJob, retryJob) because executeModelCallAndSave needs to call back to orchestrator for job continuation and retry:
        ```typescript
        /**
         * Context for EXECUTE job processing.
        * Provides all dependencies needed by executeModelCallAndSave and related functions.
        * Combines base contexts (logger, file, model, RAG, token, notification) with EXECUTE-specific utilities.
        * Includes orchestration callbacks (continueJob, retryJob) for job lifecycle management.
        */
        export interface IExecuteJobContext extends
        ILoggerContext,
        IFileContext,
        IModelContext,
        IRagContext,
        ITokenContext,
        INotificationContext {
        // EXECUTE-specific utilities
        readonly getSeedPromptForStage: GetSeedPromptForStageFn;
        readonly promptAssembler: IPromptAssembler;
        readonly getExtensionFromMimeType: GetExtensionFromMimeTypeFn;
        readonly randomUUID: () => string;
        readonly shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn;
        // Orchestration callbacks (needed by executeModelCallAndSave)
        readonly continueJob: ContinueJobFn;
        readonly retryJob: RetryJobFn;
        }
        ```
        *   `[✅]` 47.d.iii. Define `IPlanJobContext`:
        ```typescript
        /**
         * Context for PLAN job processing.
        * Provides dependencies needed by processComplexJob and planComplexStage.
        * Minimal context with only logging and planning utilities.
        */
        export interface IPlanJobContext extends ILoggerContext {
        readonly getGranularityPlanner: GetGranularityPlannerFn;
        readonly planComplexStage: PlanComplexStageFn;
        }
        ```
        *   `[✅]` 47.d.iv. Define `IRenderJobContext`:
        ```typescript
        /**
         * Context for RENDER job processing.
        * Provides dependencies needed by processRenderJob and renderDocument.
        * Combines logger, file, and notification contexts with document rendering service.
        */
        export interface IRenderJobContext extends
        ILoggerContext,
        IFileContext,
        INotificationContext {
        readonly documentRenderer: IDocumentRenderer;
        }
        ```
    *   `[✅]` 47.e. `[TYPE-GUARD-TESTS]` **RED**: In `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.test.ts`, write failing type guard tests for composed contexts:
        *   `[✅]` 47.e.i. Test `isIExecuteJobContext` returns true for valid execute context with all required fields (20 total: logger, fileManager, downloadFromStorage, deleteFromStorage, callUnifiedAIModel, getAiProviderAdapter, getAiProviderConfig, ragService, indexingService, embeddingClient, countTokens, tokenWalletService, notificationService, getSeedPromptForStage, promptAssembler, getExtensionFromMimeType, randomUUID, shouldEnqueueRenderJob, continueJob, retryJob)
        *   `[✅]` 47.e.ii. Test `isIExecuteJobContext` returns false for partial execute context missing base context fields (e.g., missing logger)
        *   `[✅]` 47.e.iii. Test `isIExecuteJobContext` returns false for partial execute context missing EXECUTE-specific fields (e.g., missing getSeedPromptForStage) or orchestration callbacks (e.g., missing continueJob)
        *   `[✅]` 47.e.iv. Test `isIPlanJobContext` returns true for valid plan context with logger, getGranularityPlanner, planComplexStage
        *   `[✅]` 47.e.v. Test `isIPlanJobContext` returns false for partial plan context
        *   `[✅]` 47.e.vi. Test `isIRenderJobContext` returns true for valid render context with logger, file context fields, documentRenderer
        *   `[✅]` 47.e.vii. Test `isIRenderJobContext` returns false for partial render context
        *   `[✅]` 47.e.viii. This test must initially FAIL because type guards for composed contexts don't exist yet.
    *   `[✅]` 47.f. `[TYPE-GUARDS]` **GREEN**: In `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts`, implement type guards for composed contexts at end of file. Check composed-specific properties only (base context properties already included via extends). NO type casting with `as`:
        ```typescript
        import { isILoggerContext, isIFileContext, isIModelContext, isIRagContext, isITokenContext, isINotificationContext } from './JobContext.interface.ts';

        export function isIExecuteJobContext(value: unknown): value is IExecuteJobContext {
        return (
            isILoggerContext(value) &&
            isIFileContext(value) &&
            isIModelContext(value) &&
            isIRagContext(value) &&
            isITokenContext(value) &&
            isINotificationContext(value) &&
            typeof value === 'object' &&
            value !== null &&
            'getSeedPromptForStage' in value &&
            'promptAssembler' in value &&
            'getExtensionFromMimeType' in value &&
            'randomUUID' in value &&
            'shouldEnqueueRenderJob' in value &&
            'continueJob' in value &&
            'retryJob' in value &&
            typeof (value as IExecuteJobContext).getSeedPromptForStage === 'function' &&
            typeof (value as IExecuteJobContext).promptAssembler === 'object' &&
            typeof (value as IExecuteJobContext).getExtensionFromMimeType === 'function' &&
            typeof (value as IExecuteJobContext).randomUUID === 'function' &&
            typeof (value as IExecuteJobContext).shouldEnqueueRenderJob === 'function' &&
            typeof (value as IExecuteJobContext).continueJob === 'function' &&
            typeof (value as IExecuteJobContext).retryJob === 'function'
        );
        }

        export function isIPlanJobContext(value: unknown): value is IPlanJobContext {
        return (
            isILoggerContext(value) &&
            typeof value === 'object' &&
            value !== null &&
            'getGranularityPlanner' in value &&
            'planComplexStage' in value &&
            typeof (value as IPlanJobContext).getGranularityPlanner === 'function' &&
            typeof (value as IPlanJobContext).planComplexStage === 'function'
        );
        }

        export function isIRenderJobContext(value: unknown): value is IRenderJobContext {
        return (
            isILoggerContext(value) &&
            isIFileContext(value) &&
            isINotificationContext(value) &&
            typeof value === 'object' &&
            value !== null &&
            'documentRenderer' in value &&
            typeof (value as IRenderJobContext).documentRenderer === 'object'
        );
        }
        ```
    *   `[✅]` 47.g. `[TEST-UNIT]` **GREEN**: Re-run tests from 47.e and ensure all pass, proving type guards correctly validate composed contexts by checking base contexts plus function-specific fields.
    *   `[✅]` 47.h. `[LINT]` Run linter for `JobContext.interface.ts` and `JobContext.type_guards.test.ts`, resolve any errors.
    *   `[✅]` 47.i. `[CRITERIA]` All requirements met: (1) Three composed context interfaces defined extending appropriate base contexts, (2) `IExecuteJobContext` extends all six base contexts plus EXECUTE utilities including `shouldEnqueueRenderJob`, (3) `IPlanJobContext` extends only logger plus planning utilities, (4) `IRenderJobContext` extends logger, file, and notification contexts plus rendering service, (5) Type guards implemented for all three composed contexts using base context type guards for validation, (6) All type guard tests pass, (7) Files are lint-clean, (8) Composed contexts are middle layer, ready for root context in next step.

*   `[✅]` 48. **`[TYPES]` Define Root IJobContext Interface**
    *   `[✅]` 48.a. `[DEPS]` The root `IJobContext` interface represents the complete dependency bundle available at the application boundary. It extends all three composed contexts (`IExecuteJobContext`, `IPlanJobContext`, `IRenderJobContext`) to create the union of all possible dependencies. This root context is constructed once in `index.ts` and passed to `processJob`, which will slice it into function-specific contexts before dispatching to processors. The root context also includes orchestration utilities (`continueJob`, `retryJob`, `executeModelCallAndSave`) that are used by top-level orchestrator functions. Root context depends on composed contexts from step 47 and is the top layer in the dependency graph. This step adds the root interface to the existing `supabase/functions/dialectic-worker/JobContext.interface.ts` file (NOT in /types subdirectory) and defines `JobContextParams` for factory construction. NOTE: `continueJob` and `retryJob` are also needed by `executeModelCallAndSave`, so they must be included in `IExecuteJobContext`.
    *   `[✅]` 48.b. `[TYPES]` In `supabase/functions/dialectic-worker/JobContext.interface.ts`, define orchestration function types and root context:
        *   `[✅]` 48.b.i. Add imports for orchestration-related types needed for function signatures: `IContinueJobDeps`, `IContinueJobResult`, `FailedAttemptError` from `../dialectic-service/dialectic.interface.ts`, and `SupabaseClient` from `npm:@supabase/supabase-js@2`, and `Database` from `../types_db.ts`. Then define `ContinueJobFn` and `RetryJobFn` with correct 6-parameter signatures:
            ```typescript
            export type ContinueJobFn = (
                deps: IContinueJobDeps,
                dbClient: SupabaseClient<Database>,
                job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
                aiResponse: UnifiedAIResponse,
                savedContribution: DialecticContributionRow,
                projectOwnerUserId: string
            ) => Promise<IContinueJobResult>;

            export type RetryJobFn = (
                deps: { logger: ILogger; notificationService: NotificationServiceType },
                dbClient: SupabaseClient<Database>,
                job: Database['public']['Tables']['dialectic_generation_jobs']['Row'],
                currentAttempt: number,
                failedContributionAttempts: FailedAttemptError[],
                projectOwnerUserId: string
            ) => Promise<{ error?: Error }>;

            export type ExecuteModelCallAndSaveFn = (
                params: ExecuteModelCallAndSaveParams
            ) => Promise<void>;
            ```
        *   `[✅]` 48.b.ii. Define root `IJobContext` interface extending all composed contexts:
            ```typescript
            /**
             * Root context interface representing the complete dependency bundle.
            * Constructed once at application boundary and passed to processJob.
            * Extends all composed contexts (IExecuteJobContext, IPlanJobContext, IRenderJobContext).
            * Includes additional orchestration utilities for top-level job management.
            */
            export interface IJobContext extends
            IExecuteJobContext,
            IPlanJobContext,
            IRenderJobContext {
            // Orchestration utilities (top-level job management)
            readonly continueJob: ContinueJobFn;
            readonly retryJob: RetryJobFn;
            readonly executeModelCallAndSave: ExecuteModelCallAndSaveFn;
            }
            ```
        *   `[✅]` 48.b.iii. Define `JobContextParams` for factory construction (all fields from `IJobContext` as constructor parameters):
            ```typescript
            /**
             * Parameters for constructing IJobContext.
            * Each field maps to the corresponding IJobContext field.
            * All fields are required and must be explicitly provided to createJobContext factory.
            */
            export interface JobContextParams {
            // From ILoggerContext
            logger: ILogger;

            // From IFileContext
            fileManager: IFileManager;
            downloadFromStorage: DownloadFromStorageFn;
            deleteFromStorage: DeleteFromStorageFn;

            // From IModelContext
            callUnifiedAIModel: CallUnifiedAIModelFn;
            getAiProviderAdapter: GetAiProviderAdapterFn;
            getAiProviderConfig: GetAiProviderConfigFn;

            // From IRagContext
            ragService: IRagService;
            indexingService: IIndexingService;
            embeddingClient: IEmbeddingClient;
            countTokens: CountTokensFn;

            // From ITokenContext
            tokenWalletService: ITokenWalletService;

            // From INotificationContext
            notificationService: NotificationServiceType;

            // From IExecuteJobContext (EXECUTE-specific)
            getSeedPromptForStage: GetSeedPromptForStageFn;
            promptAssembler: IPromptAssembler;
            getExtensionFromMimeType: typeof getExtensionFromMimeType;
            randomUUID: () => string;
            shouldEnqueueRenderJob: (deps: { dbClient: SupabaseClient<Database>; logger: ILogger }, params: { outputType: string; stageSlug: string }) => Promise<ShouldEnqueueRenderJobResult>;

            // From IPlanJobContext (PLAN-specific)
            getGranularityPlanner: GetGranularityPlannerFn;
            planComplexStage: PlanComplexStageFn;

            // From IRenderJobContext (RENDER-specific)
            documentRenderer: IDocumentRenderer;

            // From IJobContext (orchestration)
            continueJob: ContinueJobFn;
            retryJob: RetryJobFn;
            executeModelCallAndSave: ExecuteModelCallAndSaveFn;
            }
            ```
    *   `[✅]` 48.c. `[TYPE-GUARD-TESTS]` **RED**: In `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.test.ts`, add failing type guard test for root context:
        *   `[✅]` 48.c.i. Test `isIJobContext` returns true for valid root context with ALL fields from all composed contexts plus orchestration utilities
        *   `[✅]` 48.c.ii. Test `isIJobContext` returns false for root context missing any base context fields
        *   `[✅]` 48.c.iii. Test `isIJobContext` returns false for root context missing orchestration utilities (continueJob, retryJob, executeModelCallAndSave)
        *   `[✅]` 48.c.iv. This test must initially FAIL because `isIJobContext` type guard doesn't exist yet.
    *   `[✅]` 48.d. `[TYPE-GUARDS]` **GREEN**: In `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts`, implement type guard for root context:
        ```typescript
        export function isIJobContext(value: unknown): value is IJobContext {
        return (
            isIExecuteJobContext(value) &&
            isIPlanJobContext(value) &&
            isIRenderJobContext(value) &&
            typeof value === 'object' &&
            value !== null &&
            'continueJob' in value &&
            'retryJob' in value &&
            'executeModelCallAndSave' in value &&
            typeof (value as IJobContext).continueJob === 'function' &&
            typeof (value as IJobContext).retryJob === 'function' &&
            typeof (value as IJobContext).executeModelCallAndSave === 'function'
        );
        }
        ```
    *   `[✅]` 48.e. `[TEST-UNIT]` **GREEN**: Re-run test from 48.c and ensure it passes, proving type guard validates root context by checking all composed contexts plus orchestration utilities.
    *   `[✅]` 48.f. `[LINT]` Run linter for `JobContext.interface.ts` and `JobContext.test.ts`, resolve any errors.
    *   `[✅]` 48.g. `[CRITERIA]` All requirements met: (1) Root `IJobContext` interface defined extending all three composed contexts, (2) `IJobContext` includes orchestration utilities for top-level job management, (3) `JobContextParams` interface defines all fields needed for factory construction, (4) Type guard implemented for root context using composed context type guards, (5) Type guard test passes, (6) Files are lint-clean, (7) Root context is top layer with complete dependency bundle, ready for factory and slicers in next steps.

*   `[✅]` 49. **`[BE]` Implement createJobContext Factory and Context Slicer Functions**
    *   `[✅]` 49.a. `[DEPS]` The context factory and slicers are construction and extraction utilities. `createJobContext` factory constructs the root `IJobContext` from `JobContextParams` at the application boundary. Context slicer functions extract function-specific subsets from the root context: `createExecuteJobContext` extracts only `IExecuteJobContext` fields (including orchestration functions continueJob and retryJob needed by executeModelCallAndSave), `createPlanJobContext` extracts only `IPlanJobContext` fields, `createRenderJobContext` extracts only `IRenderJobContext` fields. Slicers enable TypeScript to enforce that functions only access dependencies they declare in their signature. For example, if `executeModelCallAndSave` accepts `IExecuteJobContext`, it CANNOT access `planComplexStage` from `IPlanJobContext` - TypeScript will error. This step creates `supabase/functions/dialectic-worker/createJobContext.ts` implementing the factory and all three slicers with comprehensive tests.
    *   `[✅]` 49.b. `[TEST-UNIT]` **RED**: In new file `supabase/functions/dialectic-worker/createJobContext.test.ts`, write failing tests for factory and slicers:
        *   `[✅]` 49.b.i. Test "createJobContext constructs valid IJobContext with all fields from params": Create mock `JobContextParams` with all ~24 fields, call `createJobContext(params)`, assert return value satisfies `isIJobContext` type guard, assert each field equals corresponding param field (spot-check logger, fileManager, ragService, continueJob).
        *   `[✅]` 49.b.ii. Test "createExecuteJobContext extracts only IExecuteJobContext fields from root": Create mock root context, call `createExecuteJobContext(root)`, assert return value satisfies `isIExecuteJobContext` type guard, assert it includes logger, fileManager, callUnifiedAIModel, ragService, getSeedPromptForStage, continueJob, retryJob, assert TypeScript compilation succeeds when accessing execute-specific fields.
        *   `[✅]` 49.b.iii. Test "createExecuteJobContext slice does NOT include plan-specific fields": Create mock root context with `planComplexStage`, call `createExecuteJobContext(root)`, assert return object does NOT have `planComplexStage` field (runtime check: `'planComplexStage' in result === false`).
        *   `[✅]` 49.b.iv. Test "createPlanJobContext extracts only IPlanJobContext fields": Create mock root, call `createPlanJobContext(root)`, assert return satisfies `isIPlanJobContext`, assert it includes logger, getGranularityPlanner, planComplexStage, assert it does NOT include fileManager or ragService.
        *   `[✅]` 49.b.v. Test "createRenderJobContext extracts only IRenderJobContext fields": Create mock root, call `createRenderJobContext(root)`, assert return satisfies `isIRenderJobContext`, assert it includes logger, fileManager, documentRenderer, assert it does NOT include ragService or planComplexStage.
        *   `[✅]` 49.b.vi. This test must initially FAIL because factory and slicer functions don't exist yet.
    *   `[✅]` 49.c. `[BE]` **GREEN**: In new file `supabase/functions/dialectic-worker/createJobContext.ts`, implement factory and slicers:
        ```typescript
        import { IJobContext, JobContextParams, IExecuteJobContext, IPlanJobContext, IRenderJobContext } from './JobContext.interface.ts';

        /**
         * Factory function to construct IJobContext at application boundary.
        * All fields are required and must be explicitly provided.
        *
        * @param params - All dependencies needed for complete job context
        * @returns Fully constructed IJobContext with all ~24 fields
        */
        export function createJobContext(params: JobContextParams): IJobContext {
        return {
            // From ILoggerContext
            logger: params.logger,

            // From IFileContext
            fileManager: params.fileManager,
            downloadFromStorage: params.downloadFromStorage,
            deleteFromStorage: params.deleteFromStorage,

            // From IModelContext
            callUnifiedAIModel: params.callUnifiedAIModel,
            getAiProviderAdapter: params.getAiProviderAdapter,
            getAiProviderConfig: params.getAiProviderConfig,

            // From IRagContext
            ragService: params.ragService,
            indexingService: params.indexingService,
            embeddingClient: params.embeddingClient,
            countTokens: params.countTokens,

            // From ITokenContext
            tokenWalletService: params.tokenWalletService,

            // From INotificationContext
            notificationService: params.notificationService,

            // From IExecuteJobContext
            getSeedPromptForStage: params.getSeedPromptForStage,
            promptAssembler: params.promptAssembler,
            getExtensionFromMimeType: params.getExtensionFromMimeType,
            randomUUID: params.randomUUID,
            shouldEnqueueRenderJob: params.shouldEnqueueRenderJob,

            // From IPlanJobContext
            getGranularityPlanner: params.getGranularityPlanner,
            planComplexStage: params.planComplexStage,

            // From IRenderJobContext
            documentRenderer: params.documentRenderer,

            // From IJobContext (orchestration)
            continueJob: params.continueJob,
            retryJob: params.retryJob,
            executeModelCallAndSave: params.executeModelCallAndSave,
        };
        }

        /**
         * Context slicer: Extracts IExecuteJobContext subset from root IJobContext.
        * Used by processJob to pass only EXECUTE-specific dependencies to processSimpleJob/executeModelCallAndSave.
        *
        * @param root - Complete IJobContext from application boundary
        * @returns IExecuteJobContext with only fields needed for EXECUTE job processing
        */
        export function createExecuteJobContext(root: IJobContext): IExecuteJobContext {
        return {
            // From ILoggerContext
            logger: root.logger,

            // From IFileContext
            fileManager: root.fileManager,
            downloadFromStorage: root.downloadFromStorage,
            deleteFromStorage: root.deleteFromStorage,

            // From IModelContext
            callUnifiedAIModel: root.callUnifiedAIModel,
            getAiProviderAdapter: root.getAiProviderAdapter,
            getAiProviderConfig: root.getAiProviderConfig,

            // From IRagContext
            ragService: root.ragService,
            indexingService: root.indexingService,
            embeddingClient: root.embeddingClient,
            countTokens: root.countTokens,

            // From ITokenContext
            tokenWalletService: root.tokenWalletService,

            // From INotificationContext
            notificationService: root.notificationService,

            // EXECUTE-specific utilities
            getSeedPromptForStage: root.getSeedPromptForStage,
            promptAssembler: root.promptAssembler,
            getExtensionFromMimeType: root.getExtensionFromMimeType,
            randomUUID: root.randomUUID,
            shouldEnqueueRenderJob: root.shouldEnqueueRenderJob,

            // Orchestration callbacks (needed by executeModelCallAndSave)
            continueJob: root.continueJob,
            retryJob: root.retryJob,
        };
        }

        /**
         * Context slicer: Extracts IPlanJobContext subset from root IJobContext.
        * Used by processJob to pass only PLAN-specific dependencies to processComplexJob/planComplexStage.
        *
        * @param root - Complete IJobContext from application boundary
        * @returns IPlanJobContext with only fields needed for PLAN job processing
        */
        export function createPlanJobContext(root: IJobContext): IPlanJobContext {
        return {
            // From ILoggerContext
            logger: root.logger,

            // PLAN-specific utilities
            getGranularityPlanner: root.getGranularityPlanner,
            planComplexStage: root.planComplexStage,
        };
        }

        /**
         * Context slicer: Extracts IRenderJobContext subset from root IJobContext.
        * Used by processJob to pass only RENDER-specific dependencies to processRenderJob/renderDocument.
        *
        * @param root - Complete IJobContext from application boundary
        * @returns IRenderJobContext with only fields needed for RENDER job processing
        */
        export function createRenderJobContext(root: IJobContext): IRenderJobContext {
        return {
            // From ILoggerContext
            logger: root.logger,

            // From IFileContext
            fileManager: root.fileManager,
            downloadFromStorage: root.downloadFromStorage,
            deleteFromStorage: root.deleteFromStorage,

            // From INotificationContext
            notificationService: root.notificationService,

            // RENDER-specific utilities
            documentRenderer: root.documentRenderer,
        };
        }
        ```
    *   `[✅]` 49.d. `[TEST-UNIT]` **GREEN**: Re-run all tests from 49.b and ensure they pass, proving: (1) Factory constructs valid root context, (2) Execute slicer extracts only execute fields (20 fields including continueJob and retryJob), (3) Plan slicer extracts only plan fields, (4) Render slicer extracts only render fields, (5) Slices do NOT include fields from other contexts (TypeScript enforces at compile time, runtime test validates).
    *   `[✅]` 49.e. `[LINT]` Run linter for `createJobContext.ts` and `createJobContext.test.ts`, resolve any errors.
    *   `[✅]` 49.f. `[CRITERIA]` All requirements met: (1) `createJobContext` factory constructs root `IJobContext` from params with all ~25 fields, (2) Three slicer functions extract function-specific contexts from root, (3) `createExecuteJobContext` returns only IExecuteJobContext fields (20 fields including shouldEnqueueRenderJob, continueJob, retryJob), (4) `createPlanJobContext` returns only IPlanJobContext fields (~3 fields), (5) `createRenderJobContext` returns only IRenderJobContext fields (~6 fields including notificationService), (6) All tests pass proving slicers correctly subset root context, (7) Files are lint-clean, (8) Factory and slicers ready for use at application boundary and processJob orchestrator.

*   `[✅]` 50. **`[BE]` Update executeModelCallAndSave to Accept IExecuteJobContext**
    *   `[✅]` 50.a. `[DEPS]` The hierarchical context interfaces and slicers are now available (from steps 46-49). We need to update `executeModelCallAndSave` in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` to accept `deps: IExecuteJobContext` instead of `deps: IDialecticJobDeps`. The `IExecuteJobContext` interface (from step 47) contains ONLY the fields needed for EXECUTE job processing: `logger`, `fileManager`, `downloadFromStorage`, `deleteFromStorage`, `callUnifiedAIModel`, `getAiProviderAdapter`, `getAiProviderConfig`, `ragService`, `indexingService`, `embeddingClient`, `countTokens`, `tokenWalletService`, `notificationService`, `getSeedPromptForStage`, `promptAssembler`, `getExtensionFromMimeType`, `randomUUID`, `shouldEnqueueRenderJob`, `continueJob`, `retryJob` (20 fields). This provides **TypeScript-enforced isolation**: `executeModelCallAndSave` CANNOT access `planComplexStage` (plan-specific) or `documentRenderer` (render-specific) - TypeScript will error at compile time if code tries. This is the leaf function (lowest consumer) in dependency order, so we update it first before its callers. This step updates: (1) `ExecuteModelCallAndSaveParams.deps` type to `IExecuteJobContext`, (2) All 14 test files to mock `IExecuteJobContext`.
    *   `[✅]` 50.b. `[TYPES]` In `supabase/functions/dialectic-service/dialectic.interface.ts`, update `ExecuteModelCallAndSaveParams`:
        *   `[✅]` 50.b.i. Add import: `import { IExecuteJobContext } from '../dialectic-worker/JobContext.interface.ts';`
        *   `[✅]` 50.b.ii. Locate `ExecuteModelCallAndSaveParams` interface (around line 450-480). Update `deps` field type: `deps: IExecuteJobContext` (was `deps: IDialecticJobDeps`).
    *   `[✅]` 50.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, verify function body (no code changes needed):
        *   `[✅]` 50.c.i. Import `IExecuteJobContext` if not already imported via params type.
        *   `[✅]` 50.c.ii. Review function body. All usages (`params.deps.logger`, `params.deps.fileManager`, `params.deps.ragService`, etc.) continue to work because `IExecuteJobContext` has all fields `executeModelCallAndSave` actually uses. No code changes needed—only type changed.
        *   `[✅]` 50.c.iii. Verify function does NOT access plan-specific (`planComplexStage`) or render-specific (`documentRenderer`) fields. TypeScript will prevent this after type change.
    *   `[✅]` 50.d. `[TEST-UNIT]` **GREEN**: In ALL 14 `executeModelCallAndSave` test files, update mocks to use `IExecuteJobContext`:
        *   `[✅]` 50.d.i. Main test file `executeModelCallAndSave.test.ts`: Locate `getMockDeps()` helper. Add imports: `import { IExecuteJobContext } from './JobContext.interface.ts'; import { createJobContext, createExecuteJobContext } from './createJobContext.ts';`. Update helper to: (1) Create full root context via `createJobContext(mockParams)`, (2) Slice to execute context: `return createExecuteJobContext(rootCtx);`, (3) Return type now `IExecuteJobContext`.
        *   `[✅]` 50.d.ii. For each of 14 test files (`executeModelCallAndSave.test.ts`, `.render.test.ts`, `.renderErrors.test.ts`, `.continue.test.ts`, `.tokens.test.ts`, `.rag.test.ts`, `.rag2.test.ts`, `.jsonSanitizer.test.ts`, `.assembleDocument.test.ts`, `.continuationCount.test.ts`, `.pathContext.test.ts`, `.planValidation.test.ts`, `.gatherArtifacts.test.ts`, `.rawJsonOnly.test.ts`): If they construct local mocks, update to return `IExecuteJobContext`. If they import `getMockDeps`, verify it now returns sliced context.
        *   `[✅]` 50.d.iii. Re-run ALL 80+ tests across 14 files. All must pass, proving `IExecuteJobContext` contains all fields the function needs.
    *   `[✅]` 50.e. `[LINT]` Run linter for `dialectic.interface.ts`, `executeModelCallAndSave.ts`, and all 14 test files. Resolve errors.
    *   `[✅]` 50.f. `[CRITERIA]` All requirements met: (1) `ExecuteModelCallAndSaveParams.deps` type is `IExecuteJobContext`, (2) Function signature accepts narrower context, TypeScript enforces field restrictions, (3) Function body unchanged (type-only change), (4) All 14 test files mock sliced context, (5) All 80+ tests pass proving behavior preservation, (6) Files lint-clean, (7) Leaf function now uses context slicing, ready for caller updates.

*   `[✅]` 51. **`[BE]` Update processJob to Accept IJobContext and Slice Contexts**
    *   `[✅]` 51.a. `[DEPS]` The leaf functions now accept specific contexts (`executeModelCallAndSave` accepts `IExecuteJobContext` from step 50). We need to update `processJob` in `supabase/functions/dialectic-worker/processJob.ts` to: (1) Accept root `IJobContext` from application boundary, (2) **Slice contexts** before dispatching to processors using slicer functions from step 49. This is the orchestrator layer that implements context slicing. `processJob` receives full `IJobContext`, determines job type, then calls appropriate slicer (`createExecuteJobContext`, `createPlanJobContext`, `createRenderJobContext`) to extract only job-type-specific dependencies before passing to processors. This enforces TypeScript isolation: EXECUTE processors get `IExecuteJobContext` (cannot access plan/render fields), PLAN processors get `IPlanJobContext` (cannot access execute/render fields), RENDER processors get `IRenderJobContext` (cannot access execute/plan fields). This step updates: (1) `processJob` signature to accept `ctx: IJobContext`, (2) Logic to slice contexts, (3) Processor calls to pass sliced contexts, (4) Tests to mock root context.
    *   `[✅]` 51.b. `[TEST-UNIT]` **GREEN**: In `supabase/functions/dialectic-worker/processJob.test.ts`, update to test context slicing:
        *   `[✅]` 51.b.i. Import `createJobContext`, `IJobContext`, and slicer functions.
        *   `[✅]` 51.b.ii. Update mock construction: Create full `IJobContext` via `createJobContext(mockParams)`.
        *   `[✅]` 51.b.iii. Update `processJob(...)` calls to pass `ctx: IJobContext` as fifth parameter.
        *   `[✅]` 51.b.iv. Add test "slices to IExecuteJobContext for EXECUTE jobs": Mock processors, call `processJob` with EXECUTE job, spy on `processSimpleJob` call, assert it received `IExecuteJobContext` (verify fields like `ragService` present, `planComplexStage` absent).
        *   `[✅]` 51.b.v. Add test "slices to IPlanJobContext for PLAN jobs": Verify `processComplexJob` received only plan fields.
        *   `[✅]` 51.b.vi. Add test "slices to IRenderJobContext for RENDER jobs": Verify `processRenderJob` received only render fields.
        *   `[✅]` 51.b.vii. Re-run all `processJob.test.ts` tests, ensure they pass.
    *   `[✅]` 51.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/processJob.ts`, implement context slicing:
        *   `[✅]` 51.c.i. Add imports: `import { IJobContext } from './JobContext.interface.ts';` and `import { createExecuteJobContext, createPlanJobContext, createRenderJobContext } from './createJobContext.ts';`
        *   `[✅]` 51.c.ii. Update function signature: `export async function processJob(dbClient: SupabaseClient<Database>, job: DialecticJobRow, projectOwnerUserId: string, processors: IJobProcessors, ctx: IJobContext, authToken: string): Promise<void>` (was `deps: IDialecticJobDeps`, now `ctx: IJobContext`).
        *   `[✅]` 51.c.iii. Replace all `deps` references with `ctx` in logging/error handling.
        *   `[✅]` 51.c.iv. Update processor dispatch logic to slice contexts before calling:
            ```typescript
            if (job.job_type === 'EXECUTE') {
            const executeCtx = createExecuteJobContext(ctx);  // ← Slice to IExecuteJobContext
            await processors.processSimpleJob(dbClient, typedJob, projectOwnerUserId, executeCtx, authToken);
            } else if (job.job_type === 'PLAN') {
            const planCtx = createPlanJobContext(ctx);  // ← Slice to IPlanJobContext
            await processors.processComplexJob(dbClient, typedJob, projectOwnerUserId, planCtx, authToken);
            } else if (job.job_type === 'RENDER') {
            const renderCtx = createRenderJobContext(ctx);  // ← Slice to IRenderJobContext
            await processors.processRenderJob(dbClient, job, projectOwnerUserId, renderCtx, authToken);
            }
            ```
    *   `[✅]` 51.d. `[LINT]` Run linter for `processJob.ts` and `processJob.test.ts`, resolve errors.
    *   `[✅]` 51.e. `[CRITERIA]` All requirements met: (1) `processJob` accepts root `IJobContext`, (2) Context slicing implemented using slicer functions before processor dispatch, (3) EXECUTE jobs get `IExecuteJobContext`, PLAN jobs get `IPlanJobContext`, RENDER jobs get `IRenderJobContext`, (4) Tests prove correct slicing, (5) Files lint-clean, (6) Orchestrator implements context slicing, ready for processor and boundary updates.

*   `[✅]` 52. **`[BE]` Update processSimpleJob to Accept IJobContext**
    *   `[✅]` 52.a. `[DEPS]` The `processJob` orchestrator passes root `IJobContext` to processors (from step 51). `processSimpleJob` in `supabase/functions/dialectic-worker/processSimpleJob.ts` orchestrates/prepares EXECUTE jobs and then calls `executeModelCallAndSave` (which requires `IExecuteJobContext`). Since `executeModelCallAndSave` is only available on `IJobContext` (not `IExecuteJobContext`), `processSimpleJob` must accept `ctx: IJobContext` to access it. When calling `executeModelCallAndSave`, `processSimpleJob` slices `IJobContext` to `IExecuteJobContext` using `createExecuteJobContext(ctx)` and passes the sliced context as the `deps` parameter. This step updates: (1) Function signature to `ctx: IJobContext`, (2) All references from `deps` to `ctx`, (3) Import `createExecuteJobContext` slicer, (4) Update `executeModelCallAndSave` call to slice context, (5) Tests to mock `IJobContext`.
    *   `[✅]` 52.b. `[TEST-UNIT]` **GREEN**: In `supabase/functions/dialectic-worker/processSimpleJob.test.ts`, update mocks:
        *   `[✅]` 52.b.i. Import `createExecuteJobContext`, `createJobContext`, `IJobContext`, `IExecuteJobContext`.
        *   `[✅]` 52.b.ii. Update mock construction: Create root via `createJobContext(mockParams)` to get `rootCtx: IJobContext`. Update `processSimpleJob(...)` calls to pass `rootCtx: IJobContext` as fourth parameter.
        *   `[✅]` 52.b.iii. Update all spies/stubs on `executeModelCallAndSave` to use `rootCtx.executeModelCallAndSave` instead of accessing through `executeCtx` (since `executeModelCallAndSave` is on root context, not sliced context).
        *   `[✅]` 52.b.iv. Re-run tests, ensure they pass.
    *   `[✅]` 52.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/processSimpleJob.ts`, update to use `IJobContext`:
        *   `[✅]` 52.c.i. Import `IJobContext` and `createExecuteJobContext` from `./JobContext.interface.ts` and `./createJobContext.ts`.
        *   `[✅]` 52.c.ii. Update function signature (line ~27): `export async function processSimpleJob(dbClient: SupabaseClient<Database>, job: Job & { payload: DialecticJobPayload }, projectOwnerUserId: string, ctx: IJobContext, authToken: string)` (was `deps: IDialecticJobDeps`, now `ctx: IJobContext`).
        *   `[✅]` 52.c.iii. Replace all `deps` references with `ctx`: `deps.logger` → `ctx.logger`, `deps.notificationService` → `ctx.notificationService`, `deps.promptAssembler` → `ctx.promptAssembler`, `deps.retryJob` → `ctx.retryJob`, etc.
        *   `[✅]` 52.c.iv. Update `executeModelCallAndSave` call (line ~288): Slice context before passing: `const executeCtx = createExecuteJobContext(ctx); await ctx.executeModelCallAndSave({ dbClient, deps: executeCtx, authToken, job, projectOwnerUserId, providerDetails, sessionData, promptConstructionPayload, inputsRelevance: stageContext.recipe_step.inputs_relevance, inputsRequired: stageContext.recipe_step.inputs_required, compressionStrategy: getSortedCompressionCandidates });`
        *   `[✅]` 52.c.v. Verify function body does NOT access `planComplexStage` or `documentRenderer` directly (it receives full `IJobContext` but only uses EXECUTE-related fields). TypeScript will not prevent access, but architecture enforces separation.
    *   `[✅]` 52.d. `[LINT]` Run linter for `processSimpleJob.ts` and `processSimpleJob.test.ts`, resolve errors.
    *   `[✅]` 52.e. `[CRITERIA]` All requirements met: (1) `processSimpleJob` accepts `IJobContext`, (2) All refs updated to `ctx`, (3) `executeModelCallAndSave` call slices context to `IExecuteJobContext` before passing, (4) Tests mock root context, (5) Tests pass, (6) Files lint-clean.

*   `[✅]` 53. **`[BE]` Update processComplexJob to Accept IPlanJobContext**
    *   `[✅]` 53.a. `[DEPS]` The `processJob` orchestrator now slices to `IPlanJobContext` for PLAN jobs (from step 51). We need to update `processComplexJob` in `supabase/functions/dialectic-worker/processComplexJob.ts` to accept `ctx: IPlanJobContext` instead of `deps: IDialecticJobDeps`. `IPlanJobContext` contains ONLY: `logger`, `getGranularityPlanner`, `planComplexStage` (~3 fields). TypeScript will prevent `processComplexJob` from accessing execute fields (like `ragService`) or render fields (like `documentRenderer`). This step updates: (1) Function signature, (2) All `deps` → `ctx`, (3) Calls to `planComplexStage` pass `ctx`, (4) Tests mock `IPlanJobContext`.
    *   `[✅]` 53.b. `[TEST-UNIT]` **GREEN**: In `processComplexJob.test.ts`, `processComplexJob.happy.test.ts`, `processComplexJob.errors.test.ts`, `processComplexJob.parallel.test.ts`, update mocks:
        *   `[✅]` 53.b.i. Import `createPlanJobContext`, `createJobContext`, `IPlanJobContext`.
        *   `[✅]` 53.b.ii. Update mock construction: Create root, slice: `const planCtx = createPlanJobContext(rootCtx);`.
        *   `[✅]` 53.b.iii. Update function calls to pass `planCtx: IPlanJobContext`.
        *   `[✅]` 53.b.iv. Re-run tests, ensure they pass.
    *   `[✅]` 53.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/processComplexJob.ts`, update to use `IPlanJobContext`:
        *   `[✅]` 53.c.i. Import `IPlanJobContext` from `./types/JobContext.interface.ts`.
        *   `[✅]` 53.c.ii. Update function signature: `export async function processComplexJob(dbClient: SupabaseClient<Database>, job: Job & { payload: DialecticPlanJobPayload }, projectOwnerUserId: string, ctx: IPlanJobContext, authToken: string)` (was `deps: IDialecticJobDeps`, now `ctx: IPlanJobContext`).
        *   `[✅]` 53.c.iii. Replace `deps` with `ctx`: `deps.logger` → `ctx.logger`, `deps.planComplexStage` → `ctx.planComplexStage`, etc.
        *   `[✅]` 53.c.iv. Update calls to `planComplexStage` to pass `ctx` instead of `deps`.
    *   `[✅]` 53.d. `[LINT]` Run linter for `processComplexJob.ts` and test files, resolve errors.
    *   `[✅]` 53.e. `[CRITERIA]` All requirements met: (1) `processComplexJob` accepts `IPlanJobContext`, (2) Minimal context with only 3 fields, (3) Cannot access execute/render fields (TypeScript enforced), (4) Tests pass, (5) Lint-clean.

*   `[✅]` 54. **`[BE]` Update planComplexStage to Accept IPlanJobContext**
    *   `[✅]` 54.a. `[DEPS]` The `processComplexJob` function now passes `IPlanJobContext` (from step 53). We need to update `planComplexStage` in `supabase/functions/dialectic-worker/task_isolator.ts` to accept `ctx: IPlanJobContext` instead of `deps: IDialecticJobDeps`. This ensures planning functions have minimal context. This step updates: (1) Function signature, (2) All `deps` → `ctx`, (3) Tests mock `IPlanJobContext`.
    *   `[✅]` 54.b. `[TEST-UNIT]` **GREEN**: In `task_isolator.test.ts`, `task_isolator.planComplexStage.test.ts`, `task_isolator.parallel.test.ts`, update mocks to use `IPlanJobContext`. Re-run tests.
    *   `[✅]` 54.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/task_isolator.ts`, update to use `IPlanJobContext`:
        *   `[✅]` 54.c.i. Import `IPlanJobContext` from `./types/JobContext.interface.ts`.
        *   `[✅]` 54.c.ii. Update `planComplexStage` function signature to accept `ctx: IPlanJobContext` (was `deps: IDialecticJobDeps`).
        *   `[✅]` 54.c.iii. Replace `deps` with `ctx` throughout function body.
    *   `[✅]` 54.d. `[LINT]` Run linter for `task_isolator.ts` and test files, resolve errors.
    *   `[✅]` 54.e. `[CRITERIA]` All requirements met: (1) `planComplexStage` accepts `IPlanJobContext`, (2) Tests pass, (3) Lint-clean.

*   `[✅]` 55. **`[BE]` Update processRenderJob to Accept IRenderJobContext**
    *   `[✅]` 55.a. `[DEPS]` The `processJob` orchestrator now slices to `IRenderJobContext` for RENDER jobs (from step 51). We need to update `processRenderJob` in `supabase/functions/dialectic-worker/processRenderJob.ts` to accept `ctx: IRenderJobContext` instead of `deps: IDialecticJobDeps`. `IRenderJobContext` contains: `logger`, `fileManager`, `downloadFromStorage`, `deleteFromStorage`, `notificationService`, `documentRenderer` (~6 fields). TypeScript prevents accessing execute fields (like `ragService`) or plan fields (like `planComplexStage`). This step updates: (1) Function signature, (2) All `deps` → `ctx`, (3) Tests mock `IRenderJobContext`.
    *   `[✅]` 55.b. `[TEST-UNIT]` **GREEN**: In `processRenderJob` test files (if exist), update mocks to use `IRenderJobContext`. Re-run tests.
    *   `[✅]` 55.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/processRenderJob.ts`, update to use `IRenderJobContext`:
        *   `[✅]` 55.c.i. Import `IRenderJobContext` from `./types/JobContext.interface.ts`.
        *   `[✅]` 55.c.ii. Update function signature to accept `ctx: IRenderJobContext` (was `deps: IDialecticJobDeps`, now using hierarchical context).
        *   `[✅]` 55.c.iii. Replace `deps` with `ctx`. May need to destructure: `const { documentRenderer, logger, downloadFromStorage, fileManager, notificationService } = ctx;`.
    *   `[✅]` 55.d. `[LINT]` Run linter, resolve errors.
    *   `[✅]` 55.e. `[CRITERIA]` All requirements met: (1) `processRenderJob` accepts `IRenderJobContext`, (2) Tests pass, (3) Lint-clean.

*   `[✅]` 56. **`[BE]` Update Application Boundary to Construct IJobContext**
    *   `[✅]` 56.a. `[DEPS]` All consumers now accept specific contexts (execute/plan/render). The `processJob` orchestrator accepts root `IJobContext` and slices (from step 51). We need to update the application boundary in `supabase/functions/dialectic-worker/index.ts` to construct `IJobContext` using `createJobContext` factory (from step 49) instead of directly constructing `IDialecticJobDeps`. The `createDialecticWorkerDeps` function (lines ~61-146) currently constructs object literal. This step replaces that with factory call. This is the top layer (application boundary) completing the bottom-up migration. After this step, the entire dialectic-worker family uses hierarchical context with slicing.
    *   `[✅]` 56.b. `[BE]` **RED**: In `supabase/functions/dialectic-worker/index.test.ts`, add/update tests proving:
        *   `[✅]` 56.b.i. `createDialecticWorkerDeps` returns a fully-formed IJobContext (including findSourceDocuments).
        *   `[✅]` 56.b.ii. `handleJob` calls `processJob` with `(processors, ctx, authToken)` in the correct positions (no misordered args).
        *   `[✅]` 56.b.iii. Render processor wiring uses `IRenderJobContext` (no wrapper that drops required fields / miscalls storage fns).
    *   `[✅]` 56.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/index.ts`, refactor to use context factory:
        *   `[✅]` 56.c.i. Import `createJobContext` from `./createJobContext.ts` and `IJobContext` from `./types/JobContext.interface.ts`.
        *   `[✅]` 56.c.ii. Update `createDialecticWorkerDeps` return type from `Promise<IDialecticJobDeps>` to `Promise<IJobContext>`.
        *   `[✅]` 56.c.iii. Replace object literal construction (lines ~102-144) with factory call: `return createJobContext({ logger, getSeedPromptForStage, continueJob, retryJob, callUnifiedAIModel, downloadFromStorage: (bucket, path) => downloadFromStorage(adminClient, bucket, path), getExtensionFromMimeType, randomUUID: crypto.randomUUID.bind(crypto), fileManager, deleteFromStorage: (bucket, paths) => deleteFromStorage(adminClient, bucket, paths), notificationService, executeModelCallAndSave: (params) => executeModelCallAndSave({ ...params, compressionStrategy: getSortedCompressionCandidates }), ragService, countTokens, getAiProviderConfig: async (dbClient, modelId) => { /* existing logic */ }, getGranularityPlanner, planComplexStage, indexingService, embeddingClient, promptAssembler, getAiProviderAdapter, tokenWalletService, documentRenderer });`
        *   `[✅]` 56.c.iv. In HTTP handler, rename variable: `const ctx = await createDialecticWorkerDeps(adminClient);` (was `deps`).
        *   `[✅]` 56.c.v. Update `processJob` call: `await processJob(adminClient, typedJob, projectOwnerUserId, processors, ctx, authToken);`
    *   `[✅]` 56.d. `[LINT]` Run linter for `index.ts`, resolve errors.
    *   `[✅]` 56.e. `[CRITERIA]` All requirements met: (1) Application boundary uses `createJobContext` factory, (2) Returns `IJobContext`, (3) HTTP handler passes root context to `processJob`, (4) Lint-clean, (5) **Complete migration**: Application boundary → processJob → processors all use hierarchical context with slicing. Future utility additions require updating only: (a) appropriate context interface (e.g., add to `IExecuteJobContext`), (b) `createJobContext` factory, (c) `createExecuteJobContext` slicer, (d) application boundary params—totaling 4 files instead of 15-30.
    *   `[✅]` 56.f. `[COMMIT]` `refactor(be): migrate dialectic-worker family to hierarchical context with slicing for scalable dependency injection`

*   `[ ]` 57. **`[BE]` Update executeModelCallAndSave to Handle Structured Results from shouldEnqueueRenderJob**
    *   `[✅]` 57.a. `[DEPS]` The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` calls `shouldEnqueueRenderJob` at line 1326 and expects a `boolean`. The logic `if (!shouldRender)` is based on this boolean assumption. This is now incorrect because `shouldEnqueueRenderJob` returns `ShouldEnqueueRenderJobResult` object (from step 45). The existing logic incorrectly evaluates any returned object (even errors) as truthy, causing `!shouldRender` to be `false`, making code fall into `else` block and attempt to enqueue RENDER job in ALL cases. This fails to distinguish between legitimate non-render (`is_json`) and critical failure (`stage_not_found`), causing transient errors to be silently ignored instead of retried.
    *   `[✅]` 57.b. `[TEST-UNIT]` **RED**: In test file for `executeModelCallAndSave.ts`, add unit tests proving current implementation fails to handle structured result:
        *   `[✅]` 57.b.i. Add a test "skips RENDER job when shouldEnqueueRenderJob returns { shouldRender: false, reason: 'is_json' }" that: (1) Mocks `shouldEnqueueRenderJob` to return `{ shouldRender: false, reason: 'is_json' }`, (2) Spies on the database insert call for new jobs, (3) Calls `executeModelCallAndSave`, (4) Asserts that the insert spy was **not** called and no error was thrown. This test must initially FAIL because the current logic `if (!shouldRender)` incorrectly evaluates `!{...}` as `false`, causing it to fall into the `else` block and attempt to enqueue a RENDER job.
        *   `[✅]` 57.b.ii. Add a test "throws an error when shouldEnqueueRenderJob returns an error reason like 'stage_not_found'" that: (1) Mocks `shouldEnqueueRenderJob` to return `{ shouldRender: false, reason: 'stage_not_found', details: 'DB error' }`, (2) Calls `executeModelCallAndSave`, (3) Asserts that the function **throws an error**. This test must initially FAIL because the current logic will not throw; it will incorrectly attempt to enqueue a RENDER job, silently ignoring the critical underlying error.
    *   `[✅]` 57.c. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, update the caller to handle structured results.
        *   `[✅]` 57.c.i. At line 1326, update the call to use context method and destructure the result: `const { shouldRender, reason, details } = await params.ctx.shouldEnqueueRenderJob({ dbClient, logger: params.ctx.logger }, { outputType: output_type, stageSlug });`.
        *   `[✅]` 57.c.ii. Replace the conditional check `if (!shouldRender)` with logic that correctly handles the structured result: `if (shouldRender && reason === 'is_markdown')`.
        *   `[✅]` 57.c.iii. Add logging/error handling for error reasons. After the `shouldEnqueueRenderJob` call, add: `if (!shouldRender && ['stage_not_found', 'instance_not_found', 'steps_not_found', 'parse_error', 'query_error', 'no_active_recipe'].includes(reason)) { params.ctx.logger.error('[executeModelCallAndSave] Failed to determine if RENDER job required due to query/config error', { reason, details, outputType: output_type, stageSlug }); throw new Error(\`Cannot determine render requirement: \${reason}\${details ? \` - \${details}\` : ''}\`); }`. This ensures transient failures (database errors, config issues) cause the EXECUTE job to fail rather than silently skipping rendering.
        *   `[✅]` 57.c.iv. Add logging for successful "is_json" reason to document why rendering was skipped: `if (!shouldRender && reason === 'is_json') { params.ctx.logger.info('[executeModelCallAndSave] Skipping RENDER job for JSON output', { outputType: output_type }); }`.
        *   `[✅]` 57.c.v. Verify the updated caller correctly handles all reason codes: (1) `is_markdown` → proceeds with RENDER job creation, (2) `is_json` → logs and skips rendering (normal flow), (3) error reasons → logs error and throws exception to fail the EXECUTE job.
    *   `[✅]` 57.d. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 57.b and ensure they now pass, proving the consumer logic correctly handles all cases from the structured result.
    *   `[ ]` 57.e. `[TEST-INT]` Prove the structured results work correctly with the updated caller in `executeModelCallAndSave`.
        *   `[ ]` 57.e.i. Assert that when `shouldEnqueueRenderJob` in `supabase/functions/_shared/utils/shouldEnqueueRenderJob.ts` (test subject) returns `{shouldRender: true, reason: 'is_markdown'}` for a markdown output, `executeModelCallAndSave` in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` (consumer) proceeds to create a RENDER job and logs the decision. Create an integration test that: (1) sets up database state with markdown recipe configuration, (2) calls `executeModelCallAndSave` with markdown `output_type`, (3) verifies `shouldEnqueueRenderJob` returns structured result with `reason: 'is_markdown'`, (4) verifies `executeModelCallAndSave` creates a RENDER job, proving the success path works with structured results.
        *   `[ ]` 57.e.ii. Assert that when `shouldEnqueueRenderJob` (test subject) returns `{shouldRender: false, reason: 'is_json'}` for a JSON output, `executeModelCallAndSave` (consumer) skips RENDER job creation and logs the decision without throwing an error. Create an integration test that: (1) sets up database state with JSON output configuration, (2) calls `executeModelCallAndSave` with JSON `output_type`, (3) verifies `shouldEnqueueRenderJob` returns `reason: 'is_json'`, (4) verifies no RENDER job is created, (5) verifies the EXECUTE job completes successfully (JSON outputs don't require rendering), proving legitimate false results are handled correctly.
        *   `[ ]` 57.e.iii. Assert that when `shouldEnqueueRenderJob` (test subject) returns `{shouldRender: false, reason: 'stage_not_found', details: ...}` due to database query failure, `executeModelCallAndSave` (consumer) throws an exception and the EXECUTE job is marked as 'failed'. Create an integration test that: (1) mocks the stage query to fail, (2) calls `executeModelCallAndSave`, (3) verifies `shouldEnqueueRenderJob` returns structured error with `reason: 'stage_not_found'`, (4) verifies `executeModelCallAndSave` throws an exception containing the reason and details, (5) verifies the error propagates to `processSimpleJob` and the job is marked 'failed', proving query errors are no longer silent and cause job failure for retry.
        *   `[ ]` 57.e.iv. Assert that when `shouldEnqueueRenderJob` (test subject) returns `{shouldRender: false, reason: 'no_active_recipe'}` due to missing recipe configuration, `executeModelCallAndSave` (consumer) throws an exception with diagnostic information. Create an integration test that: (1) sets up a stage with `active_recipe_instance_id = NULL`, (2) calls `executeModelCallAndSave`, (3) verifies the exception contains `reason: 'no_active_recipe'`, (4) verifies the error is logged with context for debugging, proving configuration errors are reported clearly.
    *   `[ ]` 57.f. `[LINT]` Run the linter for `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` and its test file(s) and resolve any warnings or errors.
    *   `[ ]` 57.g. `[CRITERIA]` The `executeModelCallAndSave` function correctly handles all cases from `ShouldEnqueueRenderJobResult`. All unit and integration tests pass, and the file is lint-clean. The system no longer silently fails to render documents when a transient or configuration error occurs, and instead correctly fails the parent job for retry.
    *   `[ ]` 57.h. `[COMMIT]` `fix(be): update executeModelCallAndSave to handle structured results from shouldEnqueueRenderJob`

*   `[✅]` 58. **`[BE]` Fix `planAllToOne` to Stop Setting `document_relationships[stageSlug]` for Root Jobs**
    *   `[✅]` 58.a. `[DEPS]` The `planAllToOne` function in `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts` currently sets `document_relationships[stageSlug] = anchorDocument.id` in both PLAN branch (line 152) and EXECUTE branch (line 278). This conflates anchor/lineage identity with produced artifact identity. The planner should preserve `source_group = anchorDocument.id` for lineage tracking but must NOT populate `document_relationships[stageSlug]` for root jobs, as this slot must be set by the producer (`executeModelCallAndSave`) post-save to `contribution.id`. The fix requires: (1) removing `[stageSlug]: anchorDocument.id` from the `document_relationships` object construction in both PLAN and EXECUTE branches, (2) keeping `source_group: anchorDocument.id` for lineage tracking, (3) ensuring continuation jobs (if any) preserve stage-role identity from payload.
    *   `[✅]` 58.b. `[TYPES]` No new types required. `document_relationships` is the existing `DocumentRelationships` map (role keys → `string | null`). The planner fix changes behavior only: **for root jobs it must omit the `[stageSlug]` key entirely** (i.e., do not set it to an anchor ID, `null`, `''`, or any placeholder).
    *   `[✅]` 58.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts`, add tests proving the planner does not set `document_relationships[stageSlug]` for root jobs.
        *   `[✅]` 58.c.i. Add a test "planAllToOne PLAN branch must not set document_relationships[stageSlug] for root header_context jobs" that: (1) creates a parent job with `stageSlug: 'thesis'`, (2) creates a recipe step with `job_type: 'PLAN'` and `outputs_required.header_context_artifact` (JSON-only artifact), (3) calls `planAllToOne` with source documents, (4) asserts the returned EXECUTE payload has `document_relationships.source_group === anchorDocument.id` (lineage preserved), (5) asserts `document_relationships[stageSlug]` is **absent/undefined** (not set to anchor id). This test must initially FAIL because the planner currently sets `[stageSlug] = anchorDocument.id`.
        *   `[✅]` 58.c.ii. Add a test "planAllToOne EXECUTE branch must not set document_relationships[stageSlug] for root document jobs" that: (1) creates a parent job with `stageSlug: 'thesis'`, (2) creates a recipe step with `job_type: 'EXECUTE'` and `outputs_required.documents` (markdown document), (3) calls `planAllToOne` with source documents, (4) asserts `document_relationships.source_group === anchorDocument.id` (lineage preserved), (5) asserts `document_relationships[stageSlug]` is **absent/undefined** for root jobs. This test must initially FAIL because the planner currently sets `[stageSlug] = anchorDocument.id`.
    *   `[✅]` 58.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts`, remove `[stageSlug]` assignment for root jobs.
        *   `[✅]` 58.d.i. In PLAN branch (line 152), change `document_relationships: { source_group: anchorDocument.id, [stageSlug]: anchorDocument.id }` to `document_relationships: { source_group: anchorDocument.id }` (remove the `[stageSlug]` key).
        *   `[✅]` 58.d.ii. In EXECUTE branch (line 278), change `document_relationships: { source_group: anchorDocument.id, [stageSlug]: anchorDocument.id }` to `document_relationships: { source_group: anchorDocument.id }` (remove the `[stageSlug]` key).
        *   `[✅]` 58.d.iii. Verify `source_group` remains set to `anchorDocument.id` in both branches (lineage tracking preserved).
    *   `[✅]` 58.e. `[TEST-UNIT]` **GREEN**: Re-run tests from 58.c and ensure they pass, proving the planner no longer sets `document_relationships[stageSlug]` for root jobs.
    *   `[✅]` 58.f. `[LINT]` Run linter for `planAllToOne.ts` and `planAllToOne.test.ts`, resolve any errors.
    *   `[✅]` 58.g. `[CRITERIA]` All requirements met: (1) PLAN branch does not set `document_relationships[stageSlug]` for root jobs, (2) EXECUTE branch does not set `document_relationships[stageSlug]` for root jobs, (3) `source_group` is preserved for lineage tracking, (4) Tests pass proving absence of stage key, (5) Files lint-clean.
    *   `[✅]` 58.h. `[COMMIT]` `fix(be): remove document_relationships[stageSlug] assignment from planAllToOne for root jobs`

*   `[✅]` 59. **`[BE]` Fix `planPerSourceDocument` to Stop Setting `document_relationships[stageSlug]` for Root Jobs**
    *   `[✅]` 59.a. `[DEPS]` The `planPerSourceDocument` function in `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts` currently sets `document_relationships: { source_group: doc.id, [stageSlug]: doc.id }` in EXECUTE branch (line 285). Here `doc.id` is a source document id (often a prior-stage contribution), not the produced artifact's root contribution id. The planner should preserve `source_group = doc.id` for lineage but must NOT set `document_relationships[stageSlug]` for root jobs. The fix requires: (1) removing `[stageSlug]: doc.id` from the `document_relationships` object construction in EXECUTE branch, (2) keeping `source_group: doc.id` for lineage tracking.
    *   `[✅]` 59.b. `[TYPES]` No new types required. `document_relationships` remains `DocumentRelationships`; the planner must **omit** `[stageSlug]` for root jobs.
    *   `[✅]` 59.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts`, add a test proving the planner does not set `document_relationships[stageSlug]` for root jobs.
        *   `[✅]` 59.c.i. Add a test "planPerSourceDocument EXECUTE branch must not set document_relationships[stageSlug] for root document jobs" that: (1) creates a parent job with `stageSlug: 'thesis'`, (2) creates a recipe step with `job_type: 'EXECUTE'` and `outputs_required.documents`, (3) calls `planPerSourceDocument` with source documents, (4) for each returned payload, asserts `document_relationships.source_group === doc.id` (lineage preserved), (5) asserts `document_relationships[stageSlug]` is **absent/undefined** for root jobs. This test must initially FAIL because the planner currently sets `[stageSlug] = doc.id`.
    *   `[✅]` 59.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts`, remove `[stageSlug]` assignment for root jobs.
        *   `[✅]` 59.d.i. In EXECUTE branch (line 285), change `document_relationships: { source_group: doc.id, [stageSlug]: doc.id }` to `document_relationships: { source_group: doc.id }` (remove the `[stageSlug]` key).
    *   `[✅]` 59.e. `[TEST-UNIT]` **GREEN**: Re-run test from 59.c and ensure it passes.
    *   `[✅]` 59.f. `[LINT]` Run linter for `planPerSourceDocument.ts` and `planPerSourceDocument.test.ts`, resolve any errors.
    *   `[✅]` 59.g. `[CRITERIA]` All requirements met: (1) EXECUTE branch does not set `document_relationships[stageSlug]` for root jobs, (2) `source_group` is preserved, (3) Test passes, (4) Files lint-clean.
    *   `[✅]` 59.h. `[COMMIT]` `fix(be): remove document_relationships[stageSlug] assignment from planPerSourceDocument for root jobs`

*   `[✅]` 60. **`[BE]` Fix `planPerSourceGroup` to Stop Setting `document_relationships[stageSlug]` for Root Jobs**
    *   `[✅]` 60.a. `[DEPS]` The `planPerSourceGroup` function in `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts` currently sets `document_relationships: { source_group: groupId, [stageSlug]: groupId }` in EXECUTE branch (lines 244-247). The `groupId` is a lineage grouping key, not a produced artifact's root contribution id. The planner should preserve `source_group = groupId` but must NOT set `document_relationships[stageSlug]` for root jobs.
    *   `[✅]` 60.b. `[TYPES]` No new types required. `document_relationships` remains `DocumentRelationships`; the planner must **omit** `[stageSlug]` for root jobs.
    *   `[✅]` 60.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts`, add a test proving the planner does not set `document_relationships[stageSlug]` for root jobs.
        *   `[✅]` 60.c.i. Add a test "planPerSourceGroup EXECUTE branch must not set document_relationships[stageSlug] for root jobs" that: (1) creates source documents with `document_relationships.source_group` set to group ids, (2) calls `planPerSourceGroup` with EXECUTE recipe step, (3) for each returned payload, asserts `document_relationships.source_group === groupId` (lineage preserved), (4) asserts `document_relationships[stageSlug]` is **absent/undefined** for root jobs. This test must initially FAIL.
    *   `[✅]` 60.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts`, remove `[stageSlug]` assignment for root jobs.
        *   `[✅]` 60.d.i. In EXECUTE branch (lines 244-247), change `document_relationships: { source_group: groupId, [stageSlug]: groupId }` to `document_relationships: { source_group: groupId }` (remove the `[stageSlug]` key).
    *   `[✅]` 60.e. `[TEST-UNIT]` **GREEN**: Re-run test from 60.c and ensure it passes.
    *   `[✅]` 60.f. `[LINT]` Run linter, resolve any errors.
    *   `[✅]` 60.g. `[CRITERIA]` All requirements met: (1) EXECUTE branch does not set `document_relationships[stageSlug]` for root jobs, (2) `source_group` is preserved, (3) Test passes, (4) Files lint-clean.
    *   `[✅]` 60.h. `[COMMIT]` `fix(be): remove document_relationships[stageSlug] assignment from planPerSourceGroup for root jobs`

*   `[✅]` 61. **`[BE]` Fix `planPerSourceDocumentByLineage` to Stop Setting `document_relationships[stageSlug]` for Root Jobs**
    *   `[✅]` 61.a. `[DEPS]` The `planPerSourceDocumentByLineage` function in `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts` currently sets `document_relationships: { source_group: groupId, [stageSlug]: groupId }` in EXECUTE branch (lines 265-268). The `groupId` is a lineage grouping identifier, not a produced artifact's root contribution id. The planner should preserve `source_group = groupId` but must NOT set `document_relationships[stageSlug]` for root jobs.
    *   `[✅]` 61.b. `[TYPES]` No new types required. `document_relationships` remains `DocumentRelationships`; the planner must **omit** `[stageSlug]` for root jobs.
    *   `[✅]` 61.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts`, add a test proving the planner does not set `document_relationships[stageSlug]` for root jobs.
        *   `[✅]` 61.c.i. Add a test "planPerSourceDocumentByLineage EXECUTE branch must not set document_relationships[stageSlug] for root jobs" that: (1) creates source documents grouped by `source_group`, (2) calls `planPerSourceDocumentByLineage` with EXECUTE recipe step, (3) for each returned payload, asserts `document_relationships.source_group === groupId` (lineage preserved), (4) asserts `document_relationships[stageSlug]` is **absent/undefined** for root jobs. This test must initially FAIL.
    *   `[✅]` 61.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`, remove `[stageSlug]` assignment for root jobs.
        *   `[✅]` 61.d.i. In EXECUTE branch (lines 265-268), change `document_relationships: { source_group: groupId, [stageSlug]: groupId }` to `document_relationships: { source_group: groupId }` (remove the `[stageSlug]` key).
    *   `[✅]` 61.e. `[TEST-UNIT]` **GREEN**: Re-run test from 61.c and ensure it passes.
    *   `[✅]` 61.f. `[LINT]` Run linter, resolve any errors.
    *   `[✅]` 61.g. `[CRITERIA]` All requirements met: (1) EXECUTE branch does not set `document_relationships[stageSlug]` for root jobs, (2) `source_group` is preserved, (3) Test passes, (4) Files lint-clean.
    *   `[✅]` 61.h. `[COMMIT]` `fix(be): remove document_relationships[stageSlug] assignment from planPerSourceDocumentByLineage for root jobs`

*   `[✅]` 62. **`[BE]` Fix `planPairwiseByOrigin` to Stop Setting `document_relationships[stageSlug]` for Root Jobs**
    *   `[✅]` 62.a. `[DEPS]` The `planPairwiseByOrigin` function in `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts` currently sets `document_relationships[stageSlug] = anchorDoc.id` in EXECUTE branch (lines 295-296). The `anchorDoc.id` is an input artifact id, not a produced artifact's root contribution id. The planner should preserve `source_group = anchorDoc.id` but must NOT set `document_relationships[stageSlug]` for root jobs.
    *   `[✅]` 62.b. `[TYPES]` No new types required. `document_relationships` remains `DocumentRelationships`; the planner must **omit** `[stageSlug]` for root jobs.
    *   `[✅]` 62.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.test.ts`, add a test proving the planner does not set `document_relationships[stageSlug]` for root jobs.
        *   `[✅]` 62.c.i. Add a test "planPairwiseByOrigin EXECUTE branch must not set document_relationships[stageSlug] for root jobs" that: (1) creates anchor and paired documents, (2) calls `planPairwiseByOrigin` with EXECUTE recipe step, (3) for each returned payload, asserts `document_relationships.source_group === anchorDoc.id` (lineage preserved), (4) asserts `document_relationships[stageSlug]` is **absent/undefined** for root jobs. This test must initially FAIL.
    *   `[✅]` 62.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts`, remove `[stageSlug]` assignment for root jobs.
        *   `[✅]` 62.d.i. In EXECUTE branch (line 296), remove `document_relationships[stageSlug] = anchorDoc.id;` (keep `source_group` assignment at line 295).
    *   `[✅]` 62.e. `[TEST-UNIT]` **GREEN**: Re-run test from 62.c and ensure it passes.
    *   `[✅]` 62.f. `[LINT]` Run linter, resolve any errors.
    *   `[✅]` 62.g. `[CRITERIA]` All requirements met: (1) EXECUTE branch does not set `document_relationships[stageSlug]` for root jobs, (2) `source_group` is preserved, (3) Test passes, (4) Files lint-clean.
    *   `[✅]` 62.h. `[COMMIT]` `fix(be): remove document_relationships[stageSlug] assignment from planPairwiseByOrigin for root jobs`

*   `[✅]` 63. **`[BE]` Fix `planPerModel` to Stop Setting `document_relationships[stageSlug]` for Root Jobs**
    *   `[✅]` 63.a. `[DEPS]` The `planPerModel` function in `supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts` currently sets `document_relationships: { source_group: anchorDoc.id, [stageSlug]: anchorDoc.id }` in EXECUTE branch (lines 204-207). The `anchorDoc.id` is the first source document's id (an input artifact), not a produced artifact's root contribution id. The planner should preserve `source_group = anchorDoc.id` but must NOT set `document_relationships[stageSlug]` for root jobs.
    *   `[✅]` 63.b. `[TYPES]` No new types required. `document_relationships` remains `DocumentRelationships`; the planner must **omit** `[stageSlug]` for root jobs.
    *   `[✅]` 63.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerModel.test.ts`, add a test proving the planner does not set `document_relationships[stageSlug]` for root jobs.
        *   `[✅]` 63.c.i. Add a test "planPerModel EXECUTE branch must not set document_relationships[stageSlug] for root jobs" that: (1) creates a parent job with `model_id`, (2) creates source documents, (3) calls `planPerModel` with EXECUTE recipe step, (4) asserts `document_relationships.source_group === anchorDoc.id` (lineage preserved), (5) asserts `document_relationships[stageSlug]` is **absent/undefined** for root jobs. This test must initially FAIL.
    *   `[✅]` 63.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts`, remove `[stageSlug]` assignment for root jobs.
        *   `[✅]` 63.d.i. In EXECUTE branch (lines 204-207), change `document_relationships: { source_group: anchorDoc.id, [stageSlug]: anchorDoc.id }` to `document_relationships: { source_group: anchorDoc.id }` (remove the `[stageSlug]` key).
    *   `[✅]` 63.e. `[TEST-UNIT]` **GREEN**: Re-run test from 63.c and ensure it passes.
    *   `[✅]` 63.f. `[LINT]` Run linter, resolve any errors.
    *   `[✅]` 63.g. `[CRITERIA]` All requirements met: (1) EXECUTE branch does not set `document_relationships[stageSlug]` for root jobs, (2) `source_group` is preserved, (3) Test passes, (4) Files lint-clean.
    *   `[✅]` 63.h. `[COMMIT]` `fix(be): remove document_relationships[stageSlug] assignment from planPerModel for root jobs`

*   `[ ]` 64. **`[BE]` Fix `executeModelCallAndSave` to Enforce `document_relationships[stageSlug] = contribution.id` for ALL Root Chunks**
    *   `[✅]` 64.a. `[DEPS]` The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` currently initializes `document_relationships[stageSlug] = contribution.id` only for documents (line 1307: `if (!isContinuationForStorage && isDocumentKey(fileType))`). Even for documents, it only initializes when the value is missing/empty, so it won't correct invalid values set by planners. JSON-only root chunks (e.g. `header_context`) never get initialized. **Key correctness requirement**: the produced root contribution id does not exist until after the contribution is saved, so the producer must enforce the stage identity at the **first moment it can be correct (immediately post-save)**. The fix requires: (1) removing the `isDocumentKey(fileType)` restriction so JSON-only artifacts are covered, (2) replacing the "missing/empty" check with an "incorrect-for-root" check that ensures `document_relationships[stageSlug] === contribution.id` for all root chunks regardless of file type, (3) this must happen IMMEDIATELY after contribution save (before RENDER job creation or JSON assembly), (4) continuation chunks must continue to preserve `document_relationships[stageSlug] = rootContributionId` from payload (already handled at lines 1284-1303).
    *   `[✅]` 64.b. `[TYPES]` No new types required. `document_relationships` remains the existing `DocumentRelationships` shape (nullable map with role keys → `string | null`); this step changes enforcement logic only.
    *   `[✅]` 64.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.chunks.test.ts` (or appropriate test file), add tests proving root chunks get correct stage identity enforced.
        *   `[✅]` 64.c.i. Add a test "executeModelCallAndSave enforces document_relationships[stageSlug] = contribution.id for JSON-only root chunks" that: (1) creates an EXECUTE job with `output_type: 'header_context'` (JSON-only artifact), (2) sets up job payload with `document_relationships: { source_group: 'some-anchor-id', [stageSlug]: 'some-anchor-id' }` (simulating planner-set invalid value), (3) mocks `uploadAndRegisterFile` to return a contribution with `id: 'new-contribution-id'`, (4) calls `executeModelCallAndSave`, (5) asserts the database update occurs with `document_relationships[stageSlug] === 'new-contribution-id'` (corrected value), (6) asserts `source_group` is preserved, (7) asserts the in-memory `contribution.document_relationships[stageSlug]` equals `contribution.id`. This test must initially FAIL because JSON-only artifacts are not currently initialized.
        *   `[✅]` 64.c.ii. Add a test "executeModelCallAndSave enforces document_relationships[stageSlug] = contribution.id for document root chunks even when planner sets invalid value" that: (1) creates an EXECUTE job with `output_type: 'business_case'` (markdown document), (2) sets up job payload with `document_relationships: { source_group: 'some-anchor-id', [stageSlug]: 'some-anchor-id' }` (invalid value), (3) mocks contribution save, (4) calls `executeModelCallAndSave`, (5) asserts the database update occurs with `document_relationships[stageSlug] === contribution.id` (corrected value, not the invalid planner value). This test must initially FAIL because current logic only initializes when missing/empty, not when incorrect.
        *   `[✅]` 64.c.iii. Add a test "executeModelCallAndSave does not overwrite document_relationships[stageSlug] for continuation chunks" that: (1) creates a continuation EXECUTE job with `target_contribution_id` and `document_relationships: { [stageSlug]: 'root-contribution-id' }` in payload, (2) calls `executeModelCallAndSave`, (3) asserts `document_relationships[stageSlug]` remains `'root-contribution-id'` (not overwritten to continuation's id). This test should PASS (continuation logic already correct).
    *   `[✅]` 64.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, implement unified root chunk identity enforcement.
        *   `[✅]` 64.d.i. Locate the "Initialize root-only relationships" block around line 1307. Change the condition from `if (!isContinuationForStorage && isDocumentKey(fileType))` to `if (!isContinuationForStorage)` (remove `isDocumentKey` restriction).
        *   `[✅]` 64.d.ii. Replace the "missing/empty" check logic. Instead of checking `needsInit = !isRecord(existing) || typeof existingStageValue !== 'string' || existingStageValue.trim() === ''`, change to check if the value is incorrect: `needsInit = !isRecord(existing) || typeof existingStageValue !== 'string' || existingStageValue.trim() === '' || existingStageValue !== contribution.id`. This ensures the value is corrected even if a planner set a non-empty but invalid value.
        *   `[✅]` 64.d.iii. Verify the database update persists `merged[stageSlug] = contribution.id` and updates the in-memory `contribution.document_relationships` object.
        *   `[✅]` 64.d.iv. Verify continuation chunks are NOT affected (they are handled separately at lines 1284-1303 and should continue to preserve `rootContributionId` from payload).
    *   `[✅]` 64.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from 64.c and ensure they pass, proving: (1) JSON-only root chunks get `document_relationships[stageSlug] = contribution.id` enforced, (2) Document root chunks get invalid planner values corrected, (3) Continuation chunks preserve root contribution id.
    *   `[ ]` 64.f. `[TEST-INT]` Prove the fix works end-to-end with planner and producer together.
        *   `[ ]` 64.f.i. Add an integration test "should correctly initialize document_relationships[stageSlug] for JSON-only root chunks in end-to-end flow" that: (1) creates an EXECUTE job with `output_type: 'header_context'` generated by `planAllToOne` (which no longer sets `[stageSlug]`), (2) calls `executeModelCallAndSave`, (3) verifies the contribution is saved, (4) verifies `document_relationships[stageSlug] === contribution.id` in the database, (5) verifies `assembleAndSaveFinalDocument` can successfully find the root contribution when called for final chunks. This proves the complete flow works: planner omits stage key → producer enforces correct value → JSON assembly succeeds.
        *   `[ ]` 64.f.ii. Add an integration test "should correct invalid document_relationships[stageSlug] values set by legacy planners" that: (1) creates an EXECUTE job with `document_relationships: { [stageSlug]: 'invalid-anchor-id' }` (simulating legacy job or test), (2) calls `executeModelCallAndSave`, (3) verifies the producer corrects the value to `contribution.id`, (4) verifies RENDER job creation (for documents) or JSON assembly (for JSON-only) succeeds with the corrected identity. This proves the producer is defensive against invalid upstream values.
    *   `[ ]` 64.g. `[LINT]` Run linter for `executeModelCallAndSave.ts` and test files, resolve any errors.
    *   `[ ]` 64.h. `[CRITERIA]` All requirements met: (1) Root chunks (documents AND JSON-only artifacts) get `document_relationships[stageSlug] = contribution.id` enforced post-save, (2) Invalid planner-set values are corrected (not just missing values), (3) Continuation chunks preserve `rootContributionId` from payload, (4) Initialization happens IMMEDIATELY after contribution save (before RENDER job creation or JSON assembly), (5) All unit tests pass, (6) Integration tests prove end-to-end flow works, (7) Files lint-clean, (8) The bug is fixed: JSON-only artifacts can now be assembled correctly, and documents get correct identity even if planners set invalid values.
    *   `[ ]` 64.i. `[COMMIT]` `fix(be): enforce document_relationships[stageSlug] = contribution.id for all root chunks in executeModelCallAndSave`

*   `[✅]` 65. **`[DB]` Fix `invoke_worker_on_status_change()` to Set `running_{stage}` Session Status**
    *   `[✅]` 65.a. `[DEPS]` The `invoke_worker_on_status_change()` function in `supabase/migrations/20251119160820_retrying_trigger.sql` is called by the `on_job_status_change` trigger when a job's status changes to `pending`, `pending_next_step`, `pending_continuation`, or `retrying`. Currently it only invokes the worker via HTTP POST. It must be extended to also set `running_{stage_slug}` session status when a root PLAN job transitions from `pending` to `processing`. This fix uses only existing triggers and functions per architecture requirements.
        *   `[✅]` 65.a.i. `invoke_worker_on_status_change()` function is triggered by `on_job_status_change` trigger on `dialectic_generation_jobs` table.
        *   `[✅]` 65.a.ii. The function receives `NEW` and `OLD` records representing the job row before and after the update.
        *   `[✅]` 65.a.iii. `dialectic_generation_jobs` table has direct columns `session_id`, `stage_slug`, `iteration_number`, `parent_job_id`, `job_type` (added in migration `20250922165259_document_centric_generation.sql`). These columns must be used instead of `payload->>'sessionId'`.
        *   `[✅]` 65.a.iv. `dialectic_sessions` table has `status` column that follows pattern `pending_{stage_slug}` → `running_{stage_slug}` → `pending_{next_stage_slug}`.
    *   `[✅]` 65.b. `[TEST-INT]` **RED**: In `supabase/integration_tests/triggers/invoke_worker_on_status_change.trigger.test.ts` (new file), add tests proving session status does not currently transition to `running_{stage}`.
        *   `[✅]` 65.b.i. Add test "should set session status to running_{stage_slug} when root PLAN job transitions pending → processing" that: (1) creates a session with `status = 'pending_thesis'`, (2) creates a root PLAN job (`parent_job_id IS NULL`, `job_type = 'PLAN'`) with `status = 'pending'`, `session_id`, `stage_slug = 'thesis'`, (3) updates the job's status to `'processing'`, (4) queries `dialectic_sessions` and asserts `status = 'running_thesis'`. This test must initially FAIL because the function does not currently update session status.
        *   `[✅]` 65.b.ii. Add test "should NOT change session status when non-root job transitions pending → processing" that: (1) creates a session with `status = 'pending_thesis'`, (2) creates a PLAN job as parent, (3) creates a child EXECUTE job with `parent_job_id` set, (4) updates the child job's status to `'processing'`, (5) asserts session status is still `'pending_thesis'` (unchanged).
        *   `[✅]` 65.b.iii. Add test "should NOT change session status when EXECUTE job transitions pending → processing" that: (1) creates a session with `status = 'pending_thesis'`, (2) creates a root EXECUTE job (`parent_job_id IS NULL`, `job_type = 'EXECUTE'`), (3) updates job status to `'processing'`, (4) asserts session status is still `'pending_thesis'` (only root PLAN jobs trigger this transition).
        *   `[✅]` 65.b.iv. Add test "should NOT change session status if session is not in pending_{stage_slug} state" that: (1) creates a session with `status = 'running_thesis'` (already running), (2) creates a root PLAN job, (3) updates job status to `'processing'`, (4) asserts session status is still `'running_thesis'` (idempotent, no double-transition).
    *   `[✅]` 65.c. `[DB]` **GREEN**: Create migration `<timestamp>_fix_invoke_worker_running_status.sql` to modify `invoke_worker_on_status_change()` function.
        *   `[✅]` 65.c.i. Use `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` to modify the existing function.
        *   `[✅]` 65.c.ii. At the beginning of the function (before HTTP invocation logic), add logic to check if this is a root PLAN job starting processing: `IF NEW.parent_job_id IS NULL AND NEW.job_type = 'PLAN' AND OLD.status = 'pending' AND NEW.status = 'processing' THEN`.
        *   `[✅]` 65.c.iii. Extract identifiers from job table columns (NOT payload): `v_session_id := NEW.session_id;` and `v_stage_slug := NEW.stage_slug;`.
        *   `[✅]` 65.c.iv. Update session status to `running_{stage_slug}` only if current status is `pending_{stage_slug}` (prevents double-transition): `UPDATE dialectic_sessions SET status = 'running_' || v_stage_slug, updated_at = now() WHERE id = v_session_id AND status = 'pending_' || v_stage_slug;`.
        *   `[✅]` 65.c.v. Continue with existing HTTP invocation logic (do not modify existing behavior for worker invocation).
    *   `[✅]` 65.d. `[TEST-INT]` **GREEN**: Re-run all tests from 65.b and ensure they pass, proving the function correctly transitions session status to `running_{stage_slug}` when root PLAN jobs start processing.
    *   `[✅]` 65.e. `[LINT]` Run linter/SQL validator for the migration file and resolve any errors.
    *   `[✅]` 65.f. `[CRITERIA]` All requirements met: (1) When a root PLAN job (`parent_job_id IS NULL`, `job_type = 'PLAN'`) transitions from `pending` to `processing`, session status is updated from `pending_{stage_slug}` to `running_{stage_slug}`, (2) Non-root jobs do not trigger session status changes, (3) EXECUTE jobs do not trigger session status changes (only PLAN jobs), (4) Session status is only changed if it's currently in `pending_{stage_slug}` state (idempotent), (5) Identifiers extracted from job table columns, not payload, (6) Existing worker invocation behavior preserved, (7) All integration tests pass, (8) Migration is lint-clean.
    *   `[✅]` 65.g. `[COMMIT]` `fix(db): add running_{stage} session status transition to invoke_worker_on_status_change`

*   `[✅]` 66. **`[DB]` Fix `handle_job_completion()` to Add Session Completion Check (Part 3)**
    *   `[✅]` 66.a. `[DEPS]` The `handle_job_completion()` function in `supabase/migrations/20250905142613_fix_auth_header.sql` (or later migration that modified it) is called by the `on_job_terminal_state` trigger when a job enters a terminal state (`completed`, `failed`, `retry_loop_failed`). Currently it handles Part 1 (parent/child relationships) and Part 2 (prerequisite dependencies). Part 3 must be added to check for stage completion and update session status. This fix uses only existing triggers and functions per architecture requirements.
        *   `[✅]` 66.a.i. `handle_job_completion()` function is triggered by `on_job_terminal_state` trigger on `dialectic_generation_jobs` table for terminal states.
        *   `[✅]` 66.a.ii. The function receives `NEW` record representing the job row after the update to terminal state.
        *   `[✅]` 66.a.iii. `dialectic_generation_jobs` table has direct columns `session_id`, `stage_slug`, `iteration_number`, `parent_job_id`, `job_type`, `status`.
        *   `[✅]` 66.a.iv. `dialectic_stage_transitions` table defines stage-to-stage transitions via `source_stage_id`, `target_stage_id`, `process_template_id`.
        *   `[✅]` 66.a.v. `dialectic_stages` table maps `slug` to `id`.
        *   `[✅]` 66.a.vi. `dialectic_sessions` table links to `dialectic_projects` which has `process_template_id`.
        *   `[✅]` 66.a.vii. **Critical for multi-PLAN stages**: Some stages (e.g., synthesis) have multiple PLAN jobs. Stage is complete only when ALL root PLAN jobs are `completed`, not just one.
    *   `[✅]` 66.b. `[TEST-INT]` **RED**: In `supabase/integration_tests/triggers/handle_job_completion.trigger.test.ts` (new file or append to existing), add tests proving session status does not currently advance when stages complete.
        *   `[✅]` 66.b.i. Add test "should advance session status to pending_{next_stage} when all root PLAN jobs complete" that: (1) creates a session with `status = 'running_thesis'`, (2) creates a project with `process_template_id` that has thesis→antithesis transition, (3) creates a single root PLAN job for thesis stage with `status = 'pending'`, (4) creates child EXECUTE jobs under the PLAN job, (5) marks all child jobs as `completed`, (6) marks the PLAN job as `completed`, (7) queries `dialectic_sessions` and asserts `status = 'pending_antithesis'`. This test must initially FAIL because Part 3 doesn't exist.
        *   `[✅]` 66.b.ii. Add test "should handle multi-PLAN stages correctly (synthesis)" that: (1) creates a session with `status = 'running_synthesis'`, (2) creates TWO root PLAN jobs for synthesis stage (pairwise header and final header), (3) marks the first PLAN job as `completed`, (4) asserts session status is still `'running_synthesis'` (not all PLAN jobs complete), (5) marks the second PLAN job as `completed`, (6) asserts session status is now `'pending_{next_stage}'` or `'iteration_complete_pending_review'`. This test must initially FAIL.
        *   `[✅]` 66.b.iii. Add test "should NOT advance session status when PLAN job fails" that: (1) creates a session with `status = 'running_thesis'`, (2) creates a root PLAN job, (3) marks the PLAN job as `failed`, (4) asserts session status is still `'running_thesis'` (stage failed, not complete). Failed stages don't advance.
        *   `[✅]` 66.b.iv. Add test "should NOT advance session status when non-root job completes" that: (1) creates a session, (2) creates a root PLAN job, (3) creates child EXECUTE jobs, (4) marks a child EXECUTE job as `completed`, (5) asserts session status unchanged (only root PLAN job completion triggers check).
        *   `[✅]` 66.b.v. Add test "should set iteration_complete_pending_review for terminal stages" that: (1) creates a session with `status = 'running_paralysis'` (terminal stage), (2) creates and completes all jobs for paralysis stage, (3) asserts session status is `'iteration_complete_pending_review'` (no next stage exists).
        *   `[✅]` 66.b.vi. Add test "should exclude RENDER jobs from stage completion check" that: (1) creates a session, (2) creates root PLAN and EXECUTE jobs, marks them `completed`, (3) creates a RENDER job with `status = 'pending'` (stuck), (4) asserts session status advances anyway (RENDER jobs never block completion).
        *   `[✅]` 66.b.vii. Add test "should exclude waiting_for_prerequisite jobs from completion check" that: (1) creates a session, (2) creates root PLAN job `completed`, (3) creates another root job with `status = 'waiting_for_prerequisite'`, (4) asserts session status advances (waiting jobs excluded from incomplete count).
    *   `[✅]` 66.c. `[DB]` **GREEN**: Use the same migration file provided in 65 to fix `handle_job_completion()` function.
        *   `[✅]` 66.c.i. Use `CREATE OR REPLACE FUNCTION handle_job_completion()` to modify the existing function.
        *   `[✅]` 66.c.ii. Declare new variables at function start: `v_session_id UUID;`, `v_stage_slug TEXT;`, `v_iteration_number INTEGER;`, `v_completed_plans INTEGER;`, `v_total_plans INTEGER;`, `v_incomplete_jobs INTEGER;`, `v_current_stage_id UUID;`, `v_process_template_id UUID;`, `v_next_stage_slug TEXT;`.
        *   `[✅]` 66.c.iii. After existing Part 2 logic, add Part 3 with comment `-- Part 3: Session status update on stage completion`.
        *   `[✅]` 66.c.iv. **Part 3 Step 1**: Check if this is a root PLAN job completion: `IF NEW.parent_job_id IS NULL AND NEW.job_type = 'PLAN' AND NEW.status = 'completed' THEN`.
        *   `[✅]` 66.c.v. **Part 3 Step 2**: Extract identifiers from job table columns (NOT payload): `v_session_id := NEW.session_id;`, `v_stage_slug := NEW.stage_slug;`, `v_iteration_number := COALESCE(NEW.iteration_number, 1);`.
        *   `[✅]` 66.c.vi. **Part 3 Step 3**: Query root jobs for stage completion with row locking to prevent race conditions: `SELECT COUNT(*) FILTER (WHERE job_type = 'PLAN' AND status = 'completed') as completed_plans, COUNT(*) FILTER (WHERE job_type = 'PLAN') as total_plans, COUNT(*) FILTER (WHERE job_type != 'RENDER' AND status NOT IN ('completed', 'failed', 'retry_loop_failed') AND status != 'waiting_for_prerequisite') as incomplete_jobs INTO v_completed_plans, v_total_plans, v_incomplete_jobs FROM dialectic_generation_jobs WHERE parent_job_id IS NULL AND session_id = v_session_id AND stage_slug = v_stage_slug AND COALESCE(iteration_number, 1) = v_iteration_number AND job_type != 'RENDER' AND status != 'waiting_for_prerequisite' FOR UPDATE;`.
        *   `[✅]` 66.c.vii. **Part 3 Step 4**: Check completion condition: `IF v_completed_plans = v_total_plans AND v_total_plans > 0 AND v_incomplete_jobs = 0 THEN`.
        *   `[✅]` 66.c.viii. **Part 3 Step 5**: Get current stage ID: `SELECT id INTO v_current_stage_id FROM dialectic_stages WHERE slug = v_stage_slug;`.
        *   `[✅]` 66.c.ix. **Part 3 Step 6**: Get process template ID via session → project join: `SELECT p.process_template_id INTO v_process_template_id FROM dialectic_sessions s JOIN dialectic_projects p ON s.project_id = p.id WHERE s.id = v_session_id;`.
        *   `[✅]` 66.c.x. **Part 3 Step 7**: Query stage transitions to find next stage: `SELECT ds.slug INTO v_next_stage_slug FROM dialectic_stage_transitions dst JOIN dialectic_stages ds ON dst.target_stage_id = ds.id WHERE dst.source_stage_id = v_current_stage_id AND dst.process_template_id = v_process_template_id LIMIT 1;`.
        *   `[✅]` 66.c.xi. **Part 3 Step 8**: Update session status synchronously (in same transaction): `UPDATE dialectic_sessions SET status = CASE WHEN v_next_stage_slug IS NOT NULL THEN 'pending_' || v_next_stage_slug ELSE 'iteration_complete_pending_review' END, updated_at = now() WHERE id = v_session_id;`.
        *   `[✅]` 66.c.xii. Close the IF blocks: `END IF; END IF;`.
    *   `[✅]` 66.d. `[TEST-INT]` **GREEN**: Re-run all tests from 66.b and ensure they pass, proving the function correctly advances session status when stages complete.
    *   `[✅]` 66.e. `[LINT]` Run linter/SQL validator for the migration file and resolve any errors.
    *   `[✅]` 66.f. `[CRITERIA]` All requirements met: (1) When a root PLAN job (`parent_job_id IS NULL`, `job_type = 'PLAN'`) enters `completed` status, Part 3 checks if stage is complete, (2) Stage completion requires ALL root PLAN jobs to be `completed` (handles multi-PLAN stages like synthesis), (3) RENDER jobs are excluded from completion checks (never block progression), (4) Jobs in `waiting_for_prerequisite` status are excluded from completion checks, (5) Jobs in terminal failure states (`failed`, `retry_loop_failed`) do not trigger session advancement (stage failed, not complete), (6) Next stage is determined from `dialectic_stage_transitions` using `source_stage_id` and `process_template_id`, (7) Terminal stages (no next stage) set status to `iteration_complete_pending_review`, (8) Identifiers extracted from job table columns, not payload, (9) Row locking (`FOR UPDATE`) prevents race conditions, (10) All updates happen in same transaction (atomic), (11) All integration tests pass, (12) Migration is lint-clean.
    *   `[✅]` 66.g. `[COMMIT]` `fix(db): add session completion check (Part 3) to handle_job_completion`

*   `[ ]` 67. **`[TEST-INT]` Prove Complete State Management Flow Works End-to-End**
    *   `[ ]` 67.a. `[DEPS]` Steps 65 and 66 fix the individual functions. This step proves the complete state management flow works correctly from session creation through stage progression to iteration completion. The test exercises both triggers working together: `on_job_status_change` → `invoke_worker_on_status_change()` for `running_{stage}` and `on_job_terminal_state` → `handle_job_completion()` for stage completion.
        *   `[ ]` 67.a.i. `invoke_worker_on_status_change()` sets `running_{stage}` when root PLAN job starts processing.
        *   `[ ]` 67.a.ii. `handle_job_completion()` advances session to `pending_{next_stage}` when all root PLAN jobs complete.
        *   `[ ]` 67.a.iii. Both functions use job table columns (`session_id`, `stage_slug`, `iteration_number`), not payload.
    *   `[ ]` 67.b. `[TEST-INT]` In `supabase/integration_tests/triggers/state_management_flow.integration.test.ts` (new file), add comprehensive end-to-end tests:
        *   `[ ]` 67.b.i. Add test "should progress session through complete thesis stage lifecycle: pending_thesis → running_thesis → pending_antithesis" that: (1) creates session with `status = 'pending_thesis'`, project with thesis→antithesis transition, (2) creates root PLAN job with `status = 'pending'`, (3) updates PLAN job to `status = 'processing'`, (4) asserts session status is `'running_thesis'`, (5) creates child EXECUTE jobs, marks them `completed`, (6) marks PLAN job as `completed`, (7) asserts session status is `'pending_antithesis'`. This proves both triggers work together.
        *   `[ ]` 67.b.ii. Add test "should progress session through multi-stage flow: thesis → antithesis → synthesis" that: exercises the full transition chain, creating and completing PLAN jobs for each stage, asserting session status transitions correctly at each step.
        *   `[ ]` 67.b.iii. Add test "should handle synthesis stage with multiple PLAN jobs correctly" that: (1) creates synthesis stage with two PLAN jobs (pairwise and final), (2) processes first PLAN job through lifecycle, (3) asserts session stays in `running_synthesis`, (4) processes second PLAN job through lifecycle, (5) asserts session advances to next stage.
        *   `[ ]` 67.b.iv. Add test "should reach iteration_complete_pending_review after paralysis stage" that: (1) creates session at paralysis stage (terminal), (2) processes all paralysis jobs, (3) asserts session status is `'iteration_complete_pending_review'`.
        *   `[ ]` 67.b.v. Add test "should handle failed PLAN job correctly (stage fails, no advancement)" that: (1) creates session with PLAN job, (2) marks PLAN job as `failed`, (3) asserts session status does NOT advance (stays at `running_{stage}`).
        *   `[ ]` 67.b.vi. Add test "should handle retry_loop_failed PLAN job correctly (stage fails, no advancement)" that: same as 67.b.v but with `retry_loop_failed` status.
        *   `[ ]` 67.b.vii. Add test "transaction safety: job status and session status updated atomically" that: verifies that when PLAN job is marked `completed`, both the job update and session status update succeed or fail together (no partial state).
    *   `[ ]` 67.c. `[CRITERIA]` All requirements met: (1) Complete state management flow works from `pending_thesis` through to `iteration_complete_pending_review`, (2) Both triggers work together correctly, (3) Multi-PLAN stages handled correctly, (4) Terminal stages handled correctly, (5) Failed stages do not advance, (6) Transaction safety verified, (7) All integration tests pass.
    *   `[ ]` 67.d. `[COMMIT]` `test(int): add comprehensive state management flow integration tests`

*   `[ ]` 68. **`[BE]` Add sourceGroupFragment to path construction for filename disambiguation** Enable fragment-based filename disambiguation using first 8 characters of source_group UUID
    *   `[ ]` 68.a. `[DEPS]` The `constructStoragePath` function in `supabase/functions/_shared/utils/path_constructor.ts` depends on the `PathContext` interface from `supabase/functions/_shared/types/file_manager.types.ts` to construct storage paths and filenames. The function signature is `constructStoragePath(context: PathContext): ConstructedPath`. Fragment extraction must occur in `executeModelCallAndSave.ts` where `PathContext` is constructed from job payload data. The fragment (first 8 characters of UUID from `job.payload.document_relationships?.source_group`) must be included in filenames for: HeaderContext, TurnPrompt, ModelContributionRawJson, AssembledDocumentJson, RenderedDocument, and antithesis patterns that include sourceModelSlug.
    *   `[ ]` 68.b. `[TYPES]` Update PathContext interface in `supabase/functions/_shared/types/file_manager.types.ts` to include optional `sourceGroupFragment?: string` field. This field will contain the first 8 characters of the source_group UUID (sanitized for filesystem use) when `document_relationships.source_group` exists in the job payload.
    *   `[ ]` 68.c. `[TEST-UNIT]` Create RED test cases in `supabase/functions/_shared/utils/path_constructor.test.ts` that prove filenames include fragment when provided.
        *   `[ ]` 68.c.i. Assert HeaderContext filename includes fragment: given `PathContext` with `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `sourceGroupFragment: 'a1b2c3d4'`, `fileType: FileType.HeaderContext`, the constructed filename is `gpt-4-turbo_0_a1b2c3d4_header_context.json`.
        *   `[ ]` 68.c.ii. Assert TurnPrompt filename includes fragment after documentKey: given `PathContext` with `modelSlug: 'claude-3-5-sonnet'`, `attemptCount: 1`, `documentKey: 'business_case'`, `sourceGroupFragment: 'f5e6d7c8'`, `fileType: FileType.TurnPrompt`, the constructed filename is `claude-3-5-sonnet_1_business_case_f5e6d7c8_prompt.md`.
        *   `[ ]` 68.c.iii. Assert ModelContributionRawJson filename includes fragment: given `PathContext` with `modelSlug: 'gemini-1.5-pro'`, `attemptCount: 2`, `documentKey: 'feature_spec'`, `sourceGroupFragment: '12345678'`, `fileType: FileType.ModelContributionRawJson`, the constructed filename includes the fragment segment.
        *   `[ ]` 68.c.iv. Assert AssembledDocumentJson filename includes fragment: given `PathContext` with fragment present, the constructed filename for `FileType.AssembledDocumentJson` includes the fragment between attemptCount and documentKey.
        *   `[ ]` 68.c.v. Assert RenderedDocument filename includes fragment: given `PathContext` with `modelSlug: 'gpt-4'`, `attemptCount: 0`, `documentKey: 'technical_approach'`, `sourceGroupFragment: 'abcdef12'`, `fileType: FileType.RenderedDocument`, the constructed filename is `gpt-4_0_technical_approach_abcdef12.md`.
        *   `[ ]` 68.c.vi. Assert antithesis header_context pattern includes fragment between sourceModelSlug and attemptCount: given `PathContext` with `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 0`, `sourceGroupFragment: '98765432'`, `fileType: FileType.HeaderContext`, `stageSlug: 'antithesis'`, the constructed filename is `claude_critiquing_gpt-4_98765432_0_header_context.json`.
        *   `[ ]` 68.c.vii. Assert all file types work without fragment (backward compatibility): given `PathContext` without `sourceGroupFragment`, all existing filename patterns remain unchanged (e.g., `gpt-4-turbo_0_header_context.json` for HeaderContext without fragment).
        *   `[ ]` 68.c.viii. Assert fragment is sanitized correctly: given `PathContext` with `sourceGroupFragment: 'A1-B2-C3'` (containing hyphens), the fragment in the filename is sanitized to `a1b2c3` (hyphens removed, lowercase).
    *   `[ ]` 68.d. `[BE]` Implement fragment support in `constructStoragePath` function in `supabase/functions/_shared/utils/path_constructor.ts`.
        *   `[ ]` 68.d.i. Create helper function `extractSourceGroupFragment(sourceGroup: string | undefined): string | undefined` that: takes a source_group UUID string, removes all hyphens, takes first 8 characters, converts to lowercase, and returns undefined if sourceGroup is undefined or empty.
        *   `[ ]` 68.d.ii. Modify HeaderContext case (around line 176-181) to include fragment: when `context.sourceGroupFragment` exists, insert it between `attemptCount` and `header_context`, resulting in filename pattern `gpt-4-turbo_0_a1b2c3d4_header_context.json`, otherwise use existing pattern `gpt-4-turbo_0_header_context.json`.
        *   `[ ]` 68.d.iii. Modify TurnPrompt case (around line 168-174) to include fragment after documentKey: when fragment exists, use pattern `claude-3-5-sonnet_1_business_case_f5e6d7c8_prompt.md`, otherwise use existing pattern.
        *   `[ ]` 68.d.iv. Modify ModelContributionRawJson case and related document file types (around line 216-249) to include fragment when present, maintaining backward compatibility when fragment is absent.
        *   `[ ]` 68.d.v. Modify AssembledDocumentJson case (around line 183-188) to include fragment between attemptCount and documentKey when fragment exists.
        *   `[ ]` 68.d.vi. Modify RenderedDocument case (around line 190-195) to include fragment between attemptCount and documentKey when fragment exists.
        *   `[ ]` 68.d.vii. Modify antithesis patterns (if any) to include fragment between sourceModelSlug and attemptCount when fragment exists and stageSlug is 'antithesis'.
    *   `[ ]` 68.e. `[TEST-UNIT]` Re-run all tests from step 68.c and verify they pass. Add edge case tests.
        *   `[ ]` 68.e.i. Verify all RED test cases from step 68.c now pass with GREEN implementation.
        *   `[ ]` 68.e.ii. Add edge case test: assert fragment handling with empty string returns undefined.
        *   `[ ]` 68.e.iii. Add edge case test: assert fragment extraction from UUID with hyphens (e.g., `550e8400-e29b-41d4-a716-446655440000` becomes `550e8400`).
        *   `[ ]` 68.e.iv. Add edge case test: assert fragment extraction from UUID without hyphens works correctly.
    *   `[ ]` 68.f. `[CRITERIA]` Acceptance criteria for path constructor changes.
        *   `[ ]` 68.f.i. All relevant file types (HeaderContext, TurnPrompt, ModelContributionRawJson, AssembledDocumentJson, RenderedDocument, antithesis patterns) support optional fragment in filename when `sourceGroupFragment` is provided in `PathContext`.
        *   `[ ]` 68.f.ii. Fragment extraction is consistent: first 8 characters of UUID after removing hyphens, converted to lowercase.
        *   `[ ]` 68.f.iii. Backward compatibility maintained: all file types work correctly without fragment (existing behavior preserved).
        *   `[ ]` 68.f.iv. Fragment appears in correct position for each file type pattern (between appropriate segments as specified in tests).
    *   `[ ]` 68.g. `[COMMIT]` `feat: add sourceGroupFragment to path construction for filename disambiguation`

*   `[ ]` 69. **`[BE]` Update path_deconstructor to parse sourceGroupFragment from filenames** Enable reverse path parsing with fragment support
    *   `[ ]` 69.a. `[DEPS]` The `deconstructStoragePath` function in `supabase/functions/_shared/utils/path_deconstructor.ts` parses filenames back to `DeconstructedPathInfo`. It depends on regex patterns that must be updated to optionally capture the fragment segment. The fragment position varies by file type (after attemptCount for HeaderContext, after documentKey for TurnPrompt, between sourceModelSlug and attemptCount for antithesis patterns).
    *   `[ ]` 69.b. `[TYPES]` Update `DeconstructedPathInfo` interface in `supabase/functions/_shared/utils/path_deconstructor.types.ts` to include optional `sourceGroupFragment?: string` field. This field must be added to the interface definition (around line 26) to support fragment parsing from deconstructed paths.    
    *   `[ ]` 69.c. `[TEST-UNIT]` Create RED test cases in `supabase/functions/_shared/utils/path_deconstructor.test.ts` that prove fragment parsing works.
        *   `[ ]` 69.c.i. Assert HeaderContext path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/2_antithesis/_work/context/gpt-4-turbo_0_a1b2c3d4_header_context.json`, parsing extracts `sourceGroupFragment: 'a1b2c3d4'`, `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `fileTypeGuess: FileType.HeaderContext`.
        *   `[ ]` 69.c.ii. Assert TurnPrompt path with fragment parses correctly: given path with fragment after documentKey, parsing extracts fragment correctly.
        *   `[ ]` 69.c.iii. Assert ModelContributionRawJson path with fragment parses correctly.
        *   `[ ]` 69.c.iv. Assert paths without fragment still parse correctly (backward compatibility): given path `project-123/session_abc12345/iteration_1/2_antithesis/_work/context/gpt-4-turbo_0_header_context.json` (no fragment), parsing works and `sourceGroupFragment` is undefined.
        *   `[ ]` 69.c.v. Assert round-trip consistency: construct path with fragment using `constructStoragePath`, then deconstruct using `deconstructStoragePath`, verify fragment is preserved.
    *   `[ ]` 69.d. `[BE]` Implement fragment parsing in `deconstructStoragePath` function.
        *   `[ ]` 69.d.i. Update `headerContextPatternString` regex (around line 61) to optionally capture fragment: pattern should match both `gpt-4-turbo_0_header_context.json` and `gpt-4-turbo_0_a1b2c3d4_header_context.json`, capturing fragment in optional group when present.
        *   `[ ]` 69.d.ii. Update `turnPromptPatternString` regex (around line 58-59) to optionally capture fragment after documentKey.
        *   `[ ]` 69.d.iii. Update `docCentricRawJsonPatternString` and related patterns to optionally capture fragment.
        *   `[ ]` 69.d.iv. Update `assembledJsonPatternString` regex (around line 62) to optionally capture fragment.
        *   `[ ]` 69.d.v. Update `renderedDocumentPatternString` regex (around line 63) to optionally capture fragment.
        *   `[ ]` 69.d.vi. Update antithesis patterns to optionally capture fragment: 
                (a) Update `antithesisContribRawPatternString` regex (line 33) to optionally capture fragment segment between sourceAttemptCount and attemptCount in the pattern `{modelSlug}_critiquing_({sourceModelSlug}'s_{sourceContribType}_{sourceAttemptCount})[_{fragment}]_{attemptCount}_{documentKey}_raw.json`, 
                (b) Update `antithesisContribPatternString` regex (line 34) to optionally capture fragment segment in the pattern `{modelSlug}_critiquing_({sourceModelSlug}'s_{sourceContribType}_{sourceAttemptCount})[_{fragment}]_{attemptCount}_{documentKey}.md`, 
                (c) Update antithesis HeaderContext pattern regex to capture fragment between sourceModelSlug and attemptCount.        
        *   `[ ]` 69.d.vii. Set `info.sourceGroupFragment = matches[X]` when fragment group is captured and not undefined, otherwise leave undefined.
    *   `[ ]` 69.e. `[TEST-UNIT]` Re-run all tests from step 69.c and verify they pass.
        *   `[ ]` 69.e.i. Verify all RED test cases from step 69.c now pass with GREEN implementation.
        *   `[ ]` 69.e.ii. Test round-trip: construct path with fragment, deconstruct, verify fragment preserved correctly.
    *   `[ ]` 69.f. `[CRITERIA]` Acceptance criteria for path deconstructor changes.
        *   `[ ]` 69.f.i. All filename patterns correctly parse fragment when present in the path.
        *   `[ ]` 69.f.ii. Backward compatibility maintained: paths without fragment parse correctly (no errors, fragment field is undefined).
        *   `[ ]` 69.f.iii. Round-trip consistency: construct → deconstruct preserves fragment correctly.
    *   `[ ]` 69.g. `[COMMIT]` `feat: add sourceGroupFragment parsing to path_deconstructor`

*   `[ ]` 70. **`[BE]` Extract source_group fragment in executeModelCallAndSave and propagate to PathContext** Ensure fragment flows from job payload to path construction
    *   `[ ]` 70.a. `[DEPS]` The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` constructs `PathContext` at lines 1254-1266 from job payload data. The function depends on `job.payload.document_relationships?.source_group` containing the UUID that must be extracted as a fragment. The fragment extraction helper from step 68.d.i can be reused here, or a similar helper can be created. Fragment must be added to the `pathContext` object before it is passed to `uploadAndRegisterFile`.
    *   `[ ]` 70.b. `[TYPES]` All required types already exist: `PathContext` interface includes `sourceGroupFragment` (updated in step 68.b), `DocumentRelationships` interface already supports `source_group` field.
    *   `[ ]` 70.c. `[TEST-UNIT]` Create RED test cases in appropriate test file for `executeModelCallAndSave`.
        *   `[ ]` 70.c.i. Assert `PathContext` includes `sourceGroupFragment` when `job.payload.document_relationships.source_group` is present: given job payload with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000' }`, the constructed `PathContext` includes `sourceGroupFragment: '550e8400'`.
        *   `[ ]` 70.c.ii. Assert fragment extraction handles UUID with hyphens correctly: UUID `a1b2c3d4-e5f6-7890-abcd-ef1234567890` produces fragment `a1b2c3d4`.
        *   `[ ]` 70.c.iii. Assert `PathContext` works without `source_group` (backward compatibility): given job payload without `document_relationships.source_group`, the `PathContext` does not include `sourceGroupFragment` (or it is undefined).
        *   `[ ]` 70.c.iv. Assert fragment extraction handles undefined source_group gracefully: when `document_relationships` is null or `source_group` is undefined, no error is thrown and fragment is undefined.
    *   `[ ]` 70.d. `[BE]` Implement fragment extraction in `executeModelCallAndSave.ts`.
        *   `[ ]` 70.d.i. Extract `source_group` from `job.payload.document_relationships?.source_group` before pathContext construction (before line 1254).
        *   `[ ]` 70.d.ii. Import or create helper function `extractSourceGroupFragment` (can reuse from `path_constructor.ts` or create local version) that removes hyphens, takes first 8 chars, converts to lowercase.
        *   `[ ]` 70.d.iii. Add `sourceGroupFragment: extractSourceGroupFragment(job.payload.document_relationships?.source_group)` to the `pathContext` object construction (line 1254-1266).
    *   `[ ]` 70.e. `[TEST-UNIT]` Re-run all tests from step 70.c and verify they pass.
        *   `[ ]` 70.e.i. Verify all RED test cases from step 70.c now pass with GREEN implementation.
    *   `[ ]` 70.f. `[TEST-INT]` Create integration test to verify fragment propagates through entire flow.
        *   `[ ]` 70.f.i. Test full flow: create EXECUTE job with `document_relationships: { source_group: 'test-uuid-1234-5678-90ab-cdef12345678' }`, call `executeModelCallAndSave`, verify saved file in storage has fragment `testuuid` (first 8 chars after hyphen removal) in filename.
        *   `[ ]` 70.f.ii. Test fragment propagates to all file types: verify HeaderContext, TurnPrompt, RawJson, AssembledJson, and RenderedDocument files all include fragment when source_group is present.
    *   `[ ]` 70.g. `[CRITERIA]` Acceptance criteria for executeModelCallAndSave changes.
        *   `[ ]` 70.g.i. Fragment is correctly extracted from `job.payload.document_relationships.source_group` when present.
        *   `[ ]` 70.g.ii. Fragment appears in `PathContext` when source_group exists in job payload.
        *   `[ ]` 70.g.iii. Fragment propagates to all file types in the lineage chain (HeaderContext, TurnPrompt, RawJson, AssembledJson, RenderedDocument).
        *   `[ ]` 70.g.iv. Backward compatibility maintained: jobs without source_group work correctly (no fragment in filenames).
    *   `[ ]` 70.h. `[COMMIT]` `feat: extract source_group fragment in executeModelCallAndSave and propagate to PathContext`

*   `[ ]` 71. **`[DOCS]` Update file_manager.md with sourceGroupFragment naming conventions** Document fragment usage in canonical file naming standards
    *   `[ ]` 71.a. `[DEPS]` The documentation file `supabase/functions/_shared/services/file_manager.md` documents canonical file tree structure and naming conventions. It must be updated to reflect the new fragment-based naming patterns, especially for antithesis header_context pattern (around line 216) and PathContext interface documentation (lines 100-121).
    *   `[ ]` 71.b. `[TYPES]` No type changes required for documentation update.
    *   `[ ]` 71.c. `[DOCS]` Update documentation in `supabase/functions/_shared/services/file_manager.md`.
        *   `[ ]` 71.c.i. Update HeaderContext filename example (around line 201) to show optional fragment: change `{model_slug}_{n}_header_context.json` to `{model_slug}_{n}[_{fragment}]_header_context.json` with note explaining fragment appears when `source_group` exists in `document_relationships`.
        *   `[ ]` 71.c.ii. Update TurnPrompt filename example (around line 199) to show optional fragment after documentKey.
        *   `[ ]` 71.c.iii. Update antithesis header_context pattern (around line 216): change `{model_slug}_critiquing_{source_model_slug}_{n}_header_context.json` to `{model_slug}_critiquing_{source_model_slug}[_{fragment}]_{n}_header_context.json` with explanation.
        *   `[ ]` 71.c.iv. Update PathContext interface documentation (lines 100-121) to include `sourceGroupFragment?: string` field with description: "Optional fragment extracted from `document_relationships.source_group` UUID (first 8 characters, sanitized) to disambiguate filenames when the same model processes multiple source groups in parallel."
        *   `[ ]` 71.c.v. Add explanatory section after PathContext interface documentation explaining fragment purpose: "The `sourceGroupFragment` field is used to ensure unique filenames when multiple instances of the same AI model process different source document groups (lineages) in parallel. The fragment is extracted from the `document_relationships.source_group` UUID by taking the first 8 characters after removing hyphens, converting to lowercase, and sanitizing for filesystem use. This prevents duplicate resource errors when parallel jobs generate files with otherwise identical naming patterns."
    *   `[ ]` 71.d. `[CRITERIA]` Acceptance criteria for documentation changes.
        *   `[ ]` 71.d.i. All filename examples show fragment when applicable (with square brackets indicating optional segment).
        *   `[ ]` 71.d.ii. Fragment extraction rules are documented (first 8 chars of UUID, hyphens removed, lowercase, sanitized).
        *   `[ ]` 71.d.iii. PathContext interface documentation matches implementation (includes `sourceGroupFragment?: string` field).
        *   `[ ]` 71.d.iv. Fragment purpose and usage are clearly explained in documentation.
    *   `[ ]` 71.e. `[COMMIT]` `docs: update file_manager.md with sourceGroupFragment naming conventions`

*   `[ ]` 72. **`[BE]` Extract sourceGroupFragment in renderDocument PathContext construction** Ensure fragment propagates to RenderedDocument filenames
    *   `[ ]` 72.a. `[DEPS]` The `renderDocument` function in `supabase/functions/_shared/services/document_renderer.ts` constructs `PathContext` for `RenderedDocument` files at lines 342-352. The function extracts `modelSlug` and `attemptCount` from the base chunk's storage path using path deconstruction (ARCHITECTURE.md line 321), but does not extract or preserve `sourceGroupFragment`. The fragment must be extracted from the contribution's `document_relationships.source_group` (when present) and included in the `PathContext` so that rendered document filenames include the fragment for disambiguation.
    *   `[ ]` 72.b. `[TYPES]` All required types already exist: `PathContext` interface includes `sourceGroupFragment` (updated in step 68.b), `DialecticContributionRow` has `document_relationships` field that may contain `source_group`.
    *   `[ ]` 72.c. `[TEST-UNIT]` Create RED test cases in appropriate test file for `renderDocument`.
        *   `[ ]` 72.c.i. Assert `PathContext` for RenderedDocument includes `sourceGroupFragment` when base chunk contribution has `document_relationships.source_group`: given a contribution with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000', [stageSlug]: contributionId }`, when `renderDocument` constructs `PathContext` for the rendered document, it includes `sourceGroupFragment: '550e8400'`.
        *   `[ ]` 72.c.ii. Assert fragment extraction handles UUID with hyphens correctly: contribution with `source_group: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'` produces fragment `a1b2c3d4` in PathContext.
        *   `[ ]` 72.c.iii. Assert `PathContext` works without `source_group`: given contribution without `document_relationships.source_group`, the `PathContext` does not include `sourceGroupFragment` (or it is undefined).
        *   `[ ]` 72.c.iv. Assert fragment extraction handles missing document_relationships gracefully: when `document_relationships` is null or missing, no error is thrown and fragment is undefined.
    *   `[ ]` 72.d. `[BE]` Implement fragment extraction in `renderDocument.ts`.
        *   `[ ]` 72.d.i. Import `extractSourceGroupFragment` helper from `path_constructor.ts` (or create local version if needed).
        *   `[ ]` 72.d.ii. Before constructing `PathContext` for RenderedDocument (around line 342), extract `source_group` from the base chunk contribution's `document_relationships?.source_group`.
        *   `[ ]` 72.d.iii. Add `sourceGroupFragment: extractSourceGroupFragment(baseChunk.document_relationships?.source_group)` to the `PathContext` object construction (lines 342-352).
    *   `[ ]` 72.e. `[TEST-UNIT]` Re-run all tests from step 72.c and verify they pass.
        *   `[ ]` 72.e.i. Verify all RED test cases from step 72.c now pass with GREEN implementation.
    *   `[ ]` 72.f. `[TEST-INT]` Create integration test to verify fragment propagates to rendered documents.
        *   `[ ]` 72.f.i. Test full flow: create contribution with `document_relationships: { source_group: 'test-uuid-1234-5678-90ab-cdef12345678', [stageSlug]: contributionId }`, call `renderDocument`, verify saved rendered document file in storage has fragment `testuuid` in filename.
    *   `[ ]` 72.g. `[CRITERIA]` Acceptance criteria for renderDocument changes.
        *   `[ ]` 72.g.i. Fragment is correctly extracted from base chunk contribution's `document_relationships.source_group` when present.
        *   `[ ]` 72.g.ii. Fragment appears in `PathContext` for RenderedDocument when source_group exists in contribution.
        *   `[ ]` 72.g.iii. Rendered document filenames include fragment when source_group is present in source contribution.
        *   `[ ]` 72.g.iv. Fragment extraction handles missing/null document_relationships gracefully.
    *   `[ ]` 72.h. `[COMMIT]` `feat: extract sourceGroupFragment in renderDocument PathContext construction`

*   `[ ]` 73. **`[BE]` Extract sourceGroupFragment in continueJob for continuation job fragment propagation** Ensure fragment propagates to continuation chunk filenames
    *   `[ ]` 73.a. `[DEPS]` The `continueJob` function in `supabase/functions/dialectic-worker/continueJob.ts` preserves `document_relationships` from the saved contribution at line 149, which includes `source_group`. However, when continuation jobs call `executeModelCallAndSave`, the fragment extraction logic (from step 70) extracts from `job.payload.document_relationships?.source_group`. The continuation job payload must preserve the `source_group` from the saved contribution so that fragment extraction works correctly for continuation chunks. Currently, `continueJob` copies `document_relationships` to `basePayload.document_relationships` (line 149), which should be sufficient, but we need to verify the fragment extraction in `executeModelCallAndSave` correctly handles continuation jobs.
    *   `[ ]` 73.b. `[TYPES]` All required types already exist: `DocumentRelationships` interface supports `source_group` field, continuation job payloads preserve `document_relationships` structure.
    *   `[ ]` 73.c. `[TEST-UNIT]` Create RED test cases in `continueJob.test.ts` that prove continuation jobs preserve source_group for fragment extraction.
        *   `[ ]` 73.c.i. Assert continuation job payload includes `document_relationships.source_group` from saved contribution: given a saved contribution with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000', [stageSlug]: rootContributionId }`, when `continueJob` creates a continuation job payload, verify `basePayload.document_relationships.source_group === '550e8400-e29b-41d4-a716-446655440000'`.
        *   `[ ]` 73.c.ii. Assert continuation job payload preserves source_group when document_relationships is copied from saved contribution: verify that when `continueJob` copies `savedContribution.document_relationships` to `basePayload.document_relationships` (line 149), the `source_group` field is preserved correctly.
        *   `[ ]` 73.c.iii. Assert continuation job payload handles missing source_group gracefully: given a saved contribution without `document_relationships.source_group`, verify `basePayload.document_relationships` does not include `source_group` (or it is undefined/null).
    *   `[ ]` 73.d. `[BE]` Verify and fix fragment preservation in `continueJob.ts` if needed.
        *   `[ ]` 73.d.i. Review line 149 logic: verify `basePayload.document_relationships = savedContribution.document_relationships` correctly preserves `source_group` field when `savedContribution.document_relationships` is a valid `DocumentRelationships` object.
        *   `[ ]` 73.d.ii. If `document_relationships` preservation logic is incomplete, fix it to ensure `source_group` is preserved: use type-safe construction to copy all fields from `savedContribution.document_relationships`, including `source_group`, to `basePayload.document_relationships`.
        *   `[ ]` 73.d.iii. Verify the continuation job payload structure matches what `executeModelCallAndSave` expects: the fragment extraction logic in `executeModelCallAndSave` (step 70) reads from `job.payload.document_relationships?.source_group`, so ensure `basePayload.document_relationships` has this structure.
    *   `[ ]` 73.e. `[TEST-UNIT]` Re-run all tests from step 73.c and verify they pass.
        *   `[ ]` 73.e.i. Verify all RED test cases from step 73.c now pass with GREEN implementation.
    *   `[ ]` 73.f. `[TEST-INT]` Create integration test to verify continuation chunks get fragment in filenames.
        *   `[ ]` 73.f.i. Test full flow: create root chunk with `document_relationships: { source_group: 'test-uuid-1234-5678-90ab-cdef12345678', [stageSlug]: rootId }`, save contribution, call `continueJob` to create continuation job, process continuation job via `executeModelCallAndSave`, verify continuation chunk file in storage has fragment `testuuid` in filename.
    *   `[ ]` 73.g. `[CRITERIA]` Acceptance criteria for continueJob changes.
        *   `[ ]` 73.g.i. Continuation job payloads preserve `document_relationships.source_group` from saved contribution.
        *   `[ ]` 73.g.ii. Fragment extraction in `executeModelCallAndSave` works correctly for continuation jobs (extracts fragment from continuation job payload).
        *   `[ ]` 73.g.iii. Continuation chunk filenames include fragment when source_group is present in root contribution.
        *   `[ ]` 73.g.iv. Fragment preservation handles missing/null document_relationships gracefully.
    *   `[ ]` 73.h. `[COMMIT]` `feat: preserve sourceGroupFragment in continueJob for continuation chunk filenames`