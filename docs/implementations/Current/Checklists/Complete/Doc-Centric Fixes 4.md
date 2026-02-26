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

*   `[✅]` 68. **`[BE]` Create extractSourceGroupFragment Helper Function** Extract and sanitize source_group UUID fragment for filename disambiguation
    *   `[✅]` 68.a. `[DEPS]` The `extractSourceGroupFragment` helper function is a pure utility function with no dependencies. It takes a UUID string (with or without hyphens) from `document_relationships.source_group` and extracts the first 8 characters after removing hyphens, converting to lowercase, for use in filename construction. This helper will be used by `path_constructor.ts`, `executeModelCallAndSave.ts`, and `document_renderer.ts` to ensure consistent fragment extraction. The function must handle undefined, null, and empty string inputs gracefully by returning undefined.
    *   `[✅]` 68.b. `[TYPES]` No new types required. The function signature uses standard TypeScript types: `extractSourceGroupFragment(sourceGroup: string | undefined): string | undefined`.
    *   `[✅]` 68.c. `[TEST-UNIT]` **RED**: In new file `supabase/functions/_shared/utils/path_utils.test.ts`, add failing unit tests that prove the helper function does not exist or fails to extract fragments correctly.
        *   `[✅]` 68.c.i. Assert `extractSourceGroupFragment` returns first 8 characters after removing hyphens: given `sourceGroup: '550e8400-e29b-41d4-a716-446655440000'`, assert return value is `'550e8400'` (hyphens removed, first 8 chars extracted).
        *   `[✅]` 68.c.ii. Assert `extractSourceGroupFragment` converts to lowercase: given `sourceGroup: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890'`, assert return value is `'a1b2c3d4'` (lowercase, hyphens removed).
        *   `[✅]` 68.c.iii. Assert `extractSourceGroupFragment` handles UUID without hyphens: given `sourceGroup: '550e8400e29b41d4a716446655440000'`, assert return value is `'550e8400'` (first 8 chars extracted).
        *   `[✅]` 68.c.iv. Assert `extractSourceGroupFragment` returns undefined for undefined input: given `sourceGroup: undefined`, assert return value is `undefined`.
        *   `[✅]` 68.c.v. Assert `extractSourceGroupFragment` returns undefined for null input: given `sourceGroup: null as unknown as string`, assert return value is `undefined`.
        *   `[✅]` 68.c.vi. Assert `extractSourceGroupFragment` returns undefined for empty string: given `sourceGroup: ''`, assert return value is `undefined`.
        *   `[✅]` 68.c.vii. Assert `extractSourceGroupFragment` handles UUID shorter than 8 characters after hyphen removal: given `sourceGroup: 'abc-def'` (only 6 chars), assert return value is `'abcdef'` (returns all available chars, no error thrown).
    *   `[✅]` 68.d. `[BE]` **GREEN**: In new file `supabase/functions/_shared/utils/path_utils.ts`, implement `extractSourceGroupFragment` helper function.
        *   `[✅]` 68.d.i. Create function with signature `export function extractSourceGroupFragment(sourceGroup: string | undefined): string | undefined`.
        *   `[✅]` 68.d.ii. Implement validation: if `sourceGroup` is undefined, null, or empty string, return `undefined`.
        *   `[✅]` 68.d.iii. Remove all hyphens using `.replace(/-/g, '')`.
        *   `[✅]` 68.d.iv. Extract first 8 characters using `.substring(0, 8)`.
        *   `[✅]` 68.d.v. Convert to lowercase using `.toLowerCase()`.
        *   `[✅]` 68.d.vi. Export the function for reuse by `path_constructor.ts`, `executeModelCallAndSave.ts`, and `document_renderer.ts`.
    *   `[✅]` 68.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 68.c and ensure they pass, proving the helper function correctly extracts and sanitizes fragments.
    *   `[✅]` 68.f. `[LINT]` Run linter for `path_utils.ts` and `path_utils.test.ts`, resolve any warnings or errors.
    *   `[✅]` 68.g. `[CRITERIA]` All requirements met: (1) Helper function extracts first 8 characters of UUID after removing hyphens, (2) Helper function converts to lowercase, (3) Helper function handles undefined, null, and empty string inputs by returning undefined, (4) Helper function handles UUIDs without hyphens correctly, (5) Helper function handles UUIDs shorter than 8 characters gracefully, (6) All unit tests pass, (7) Files are lint-clean, (8) Function is exported for reuse by consumers.
    *   `[✅]` 68.h. `[COMMIT]` `feat: add extractSourceGroupFragment helper for UUID fragment extraction`

*   `[✅]` 69. **`[BE]` Add sourceGroupFragment to path construction for filename disambiguation** Enable fragment-based filename disambiguation using first 8 characters of source_group UUID
    *   `[✅]` 69.a. `[DEPS]` The `constructStoragePath` function in `supabase/functions/_shared/utils/path_constructor.ts` depends on: (1) `PathContext` interface from `supabase/functions/_shared/types/file_manager.types.ts` which must include optional `sourceGroupFragment?: string` field, (2) `extractSourceGroupFragment` helper function from `supabase/functions/_shared/utils/path_utils.ts` (created in step 68) to sanitize fragment values, (3) Fragment must be included in filenames for: HeaderContext, TurnPrompt, ModelContributionRawJson, AssembledDocumentJson, RenderedDocument, and antithesis patterns that include sourceModelSlug. Fragment extraction occurs in `executeModelCallAndSave.ts` where `PathContext` is constructed from job payload data (this is handled in a later step). Fragment appears in standardized positions: simple patterns use fragment after documentKey (except HeaderContext which uses after attemptCount), antithesis patterns always use fragment between sourceAnchorModelSlug and attemptCount.
    *   `[✅]` 69.b. `[TYPES]` Update `PathContext` interface in `supabase/functions/_shared/types/file_manager.types.ts` to include optional `sourceGroupFragment?: string` field. This field will contain the first 8 characters of the source_group UUID (sanitized for filesystem use) when `document_relationships.source_group` exists in the job payload. Add this field after line 128 in the `PathContext` interface definition.
    *   `[✅]` 69.c. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/utils/path_constructor.test.ts`, add failing unit tests that prove filenames include fragment when provided.
        *   `[✅]` 69.c.i. Assert HeaderContext filename includes fragment for simple pattern (non-antithesis): given `PathContext` with `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `sourceGroupFragment: 'a1b2c3d4'`, `fileType: FileType.HeaderContext`, `stageSlug: 'thesis'` (or missing sourceAnchorModelSlug), the constructed filename is `gpt-4-turbo_0_a1b2c3d4_header_context.json` (fragment after attemptCount, simple pattern).
        *   `[✅]` 69.c.ii. Assert TurnPrompt simple pattern filename includes fragment: given `PathContext` with `modelSlug: 'claude-3-5-sonnet'`, `attemptCount: 1`, `documentKey: 'business_case'`, `sourceGroupFragment: 'f5e6d7c8'`, `fileType: FileType.TurnPrompt`, `stageSlug: 'thesis'` (not antithesis), the constructed filename is `claude-3-5-sonnet_1_business_case_f5e6d7c8_prompt.md` (fragment after documentKey, standardized simple position).
        *   `[✅]` 69.c.iii. Assert TurnPrompt antithesis pattern filename includes fragment: given `PathContext` with `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 1`, `documentKey: 'business_case_critique'`, `sourceGroupFragment: 'f5e6d7c8'`, `fileType: FileType.TurnPrompt`, `stageSlug: 'antithesis'`, the constructed filename is `claude_critiquing_gpt-4_f5e6d7c8_1_business_case_critique_prompt.md` (fragment between sourceAnchorModelSlug and attemptCount, standardized antithesis position).
        *   `[✅]` 69.c.iv. Assert ModelContributionRawJson simple pattern filename includes fragment: given `PathContext` with `modelSlug: 'gemini-1.5-pro'`, `attemptCount: 2`, `documentKey: 'feature_spec'`, `sourceGroupFragment: '12345678'`, `fileType: FileType.ModelContributionRawJson`, `stageSlug: 'thesis'` (not antithesis), the constructed filename is `gemini-1.5-pro_2_feature_spec_12345678_raw.json` (fragment after documentKey, standardized simple position).
        *   `[✅]` 69.c.v. Assert ModelContributionRawJson antithesis pattern filename includes fragment: given `PathContext` with antithesis critiquing pattern parameters (`sourceAnchorModelSlug: 'gpt-4'`, `sourceAnchorType: 'thesis'`, `sourceAttemptCount: 0`, `contributionType: 'antithesis'`) and `sourceGroupFragment: '98765432'`, verify fragment appears between sourceAnchorModelSlug segment and attemptCount in the pattern `${modelSlug}_critiquing_(${sourceModelSlug}'s_${sourceAnchorType}_${sourceAttemptCount})_${fragment}_${attemptCount}_${documentKey}_raw.json` (standardized antithesis position).
        *   `[✅]` 69.c.vi. Assert AssembledDocumentJson simple pattern filename includes fragment: given `PathContext` with `modelSlug: 'gpt-4'`, `attemptCount: 0`, `documentKey: 'technical_approach'`, `sourceGroupFragment: 'abcdef12'`, `fileType: FileType.AssembledDocumentJson`, `stageSlug: 'thesis'` (not antithesis), the constructed filename is `gpt-4_0_technical_approach_abcdef12_assembled.json` (fragment after documentKey, standardized simple position).
        *   `[✅]` 69.c.vii. Assert AssembledDocumentJson antithesis pattern filename includes fragment: given `PathContext` with `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 1`, `documentKey: 'business_case_critique'`, `sourceGroupFragment: '98765432'`, `fileType: FileType.AssembledDocumentJson`, `stageSlug: 'antithesis'`, the constructed filename is `claude_critiquing_gpt-4_98765432_1_business_case_critique_assembled.json` (fragment between sourceAnchorModelSlug and attemptCount, standardized antithesis position).
        *   `[✅]` 69.c.viii. Assert RenderedDocument simple pattern filename includes fragment: given `PathContext` with `modelSlug: 'gpt-4'`, `attemptCount: 0`, `documentKey: 'technical_approach'`, `sourceGroupFragment: 'abcdef12'`, `fileType: FileType.RenderedDocument`, `stageSlug: 'thesis'` (not antithesis), the constructed filename is `gpt-4_0_technical_approach_abcdef12.md` (fragment after documentKey, standardized simple position).
        *   `[✅]` 69.c.ix. Assert RenderedDocument antithesis pattern filename includes fragment: given `PathContext` with `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 1`, `documentKey: 'business_case_critique'`, `sourceGroupFragment: '98765432'`, `fileType: FileType.RenderedDocument`, `stageSlug: 'antithesis'`, the constructed filename is `claude_critiquing_gpt-4_98765432_1_business_case_critique.md` (fragment between sourceAnchorModelSlug and attemptCount, standardized antithesis position).
        *   `[✅]` 69.c.x. Assert antithesis header_context pattern includes fragment between sourceAnchorModelSlug and attemptCount: given `PathContext` with `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 0`, `sourceGroupFragment: '98765432'`, `fileType: FileType.HeaderContext`, `stageSlug: 'antithesis'`, the constructed filename is `claude_critiquing_gpt-4_98765432_0_header_context.json` (fragment between sourceAnchorModelSlug and attemptCount, standardized antithesis position).
        *   `[✅]` 69.c.xi. Assert HeaderContext uses simple pattern for non-antithesis stages: given `PathContext` with `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `sourceGroupFragment: 'a1b2c3d4'`, `fileType: FileType.HeaderContext`, `stageSlug: 'thesis'` (not antithesis), the constructed filename is `gpt-4-turbo_0_a1b2c3d4_header_context.json` (fragment after attemptCount, no critiquing pattern).
        *   `[✅]` 69.c.xii. Assert all file types work without fragment (backward compatibility): given `PathContext` without `sourceGroupFragment`, all existing filename patterns remain unchanged (e.g., `gpt-4-turbo_0_header_context.json` for HeaderContext without fragment, `claude_critiquing_gpt-4_0_header_context.json` for antithesis HeaderContext without fragment).
        *   `[✅]` 69.c.xiii. Assert fragment is sanitized correctly: given `PathContext` with `sourceGroupFragment: 'A1-B2-C3'` (containing hyphens), the fragment in the filename is sanitized to `a1b2c3` (hyphens removed, lowercase) by calling `extractSourceGroupFragment` helper from step 68.
    *   `[✅]` 69.d. `[BE]` **GREEN**: In `supabase/functions/_shared/utils/path_constructor.ts`, implement fragment support in `constructStoragePath` function.
        *   `[✅]` 69.d.i. Import `extractSourceGroupFragment` helper function from `./path_utils.ts` at the top of the file.
        *   `[✅]` 69.d.ii. Modify HeaderContext case (around line 176-181) to handle both simple and antithesis patterns: (a) Check if `context.stageSlug === 'antithesis'` AND `context.sourceAnchorModelSlug` exists (antithesis pattern applies), (b) If antithesis pattern: construct filename as `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_header_context.json` where fragment (if present) goes between sourceAnchorModelSlug and attemptCount (standardized position for antithesis patterns), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`, (c) If simple pattern (non-antithesis or missing sourceAnchorModelSlug): construct filename as `{modelSlug}_{attemptCount}[_{fragment}]_header_context.json` where fragment (if present) goes between attemptCount and header_context (standardized position for simple patterns), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`.
        *   `[✅]` 69.d.iii. Modify TurnPrompt case (around line 168-174) to handle both simple and antithesis patterns with fragment: (a) Check if `context.stageSlug === 'antithesis'` AND `context.sourceAnchorModelSlug` exists, (b) If antithesis pattern: construct filename as `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}[_continuation_{turnIndex}]_prompt.md` where fragment (if present) goes between sourceAnchorModelSlug and attemptCount (standardized antithesis position), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`, (c) If simple pattern: construct filename as `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}][_continuation_{turnIndex}]_prompt.md` where fragment (if present) goes after documentKey and before continuation suffix (standardized simple position), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`.
        *   `[✅]` 69.d.iv. Modify ModelContributionRawJson case (around line 285-296) to include fragment when present: (a) For simple pattern (non-antithesis): add fragment after documentKey: `${modelSlug}_${attemptCount}_${documentKey}[_{fragment}]_raw.json` where fragment is sanitized using `extractSourceGroupFragment(context.sourceGroupFragment)`, (b) Verify continuation suffix handling: fragment appears before continuation suffix if present.
        *   `[✅]` 69.d.v. Modify antithesis document pattern in switch case (around line 321-325): update the `case 'antithesis':` pattern to include fragment between sourceAnchorModelSlug segment and attemptCount: `${modelSlug}_critiquing_(${sourceModelSlug}'s_${sourceAnchorType}_${sourceAttemptCount})[_{fragment}]_${attemptCount}_${documentKey}` when fragment exists, sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`.
        *   `[✅]` 69.d.vi. Modify AssembledDocumentJson case (around line 183-188) to handle both simple and antithesis patterns with fragment: (a) Check if `context.stageSlug === 'antithesis'` AND `context.sourceAnchorModelSlug` exists, (b) If antithesis pattern: use `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}_assembled.json` where fragment (if present) goes between sourceAnchorModelSlug and attemptCount (standardized antithesis position), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`, (c) If simple pattern: use `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}]_assembled.json` where fragment (if present) goes after documentKey (standardized simple position), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`.
        *   `[✅]` 69.d.vii. Modify RenderedDocument case (around line 190-195) to handle both simple and antithesis patterns with fragment: (a) Check if `context.stageSlug === 'antithesis'` AND `context.sourceAnchorModelSlug` exists, (b) If antithesis pattern: construct filename as `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}.md` where fragment (if present) goes between sourceAnchorModelSlug and attemptCount (standardized antithesis position), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`, (c) If simple pattern: construct filename as `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}].md` where fragment (if present) goes after documentKey (standardized simple position), sanitize fragment using `extractSourceGroupFragment(context.sourceGroupFragment)`.
    *   `[✅]` 69.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 69.c and verify they pass. Add edge case tests.
        *   `[✅]` 69.e.i. Verify all RED test cases from step 69.c now pass with GREEN implementation.
        *   `[✅]` 69.e.ii. Add edge case test: assert fragment handling with empty string is handled gracefully (undefined fragment should result in no fragment in filename).
        *   `[✅]` 69.e.iii. Add edge case test: assert antithesis pattern detection works correctly when `stageSlug` is not 'antithesis' but `sourceAnchorModelSlug` exists (should use simple pattern).
        *   `[✅]` 69.e.iv. Add edge case test: assert simple pattern is used when `stageSlug === 'antithesis'` but `sourceAnchorModelSlug` is missing (should use simple pattern, not antithesis pattern).
    *   `[✅]` 69.f. `[LINT]` Run linter for `path_constructor.ts`, `path_constructor.test.ts`, and `file_manager.types.ts`, resolve any warnings or errors.
    *   `[✅]` 69.g. `[CRITERIA]` All requirements met: (1) PathContext interface includes optional `sourceGroupFragment?: string` field, (2) All relevant file types (HeaderContext, TurnPrompt, ModelContributionRawJson, AssembledDocumentJson, RenderedDocument, antithesis patterns) support optional fragment in filename when `sourceGroupFragment` is provided in `PathContext`, (3) HeaderContext correctly detects antithesis stage: when `stageSlug === 'antithesis'` AND `sourceAnchorModelSlug` exists, uses critiquing pattern with fragment between sourceAnchorModelSlug and attemptCount; otherwise uses simple pattern with fragment between attemptCount and header_context, (4) Fragment is sanitized using `extractSourceGroupFragment` helper from step 68 (hyphens removed, lowercase, first 8 chars), (5) Backward compatibility maintained: all file types work correctly without fragment (existing behavior preserved for both simple and antithesis patterns), (6) Fragment appears in standardized positions: simple patterns use fragment after documentKey (except HeaderContext which uses after attemptCount), antithesis patterns always use fragment between sourceAnchorModelSlug and attemptCount, (7) All unit tests pass, (8) Files are lint-clean.
    *   `[✅]` 69.h. `[COMMIT]` `feat: add sourceGroupFragment to path construction for filename disambiguation`
    
*   `[✅]` 70. **`[BE]` Update path_deconstructor to parse sourceGroupFragment from filenames** Enable reverse path parsing with fragment support
    *   `[✅]` 70.a. `[DEPS]` The `deconstructStoragePath` function in `supabase/functions/_shared/utils/path_deconstructor.ts` parses filenames back to `DeconstructedPathInfo`. It depends on regex patterns that must be updated to optionally capture the fragment segment. The fragment position varies by file type and pattern: (a) HeaderContext simple pattern: fragment after attemptCount (`{modelSlug}_{attemptCount}[_{fragment}]_header_context.json`), (b) HeaderContext antithesis pattern: fragment between sourceAnchorModelSlug and attemptCount (`{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_header_context.json`), (c) TurnPrompt: fragment after documentKey, (d) antithesis document patterns: fragment between sourceModelSlug segment and attemptCount, (e) AssembledDocumentJson and RenderedDocument: fragment position depends on pattern type (antithesis vs simple).
    *   `[✅]` 70.b. `[TYPES]` Update `DeconstructedPathInfo` interface in `supabase/functions/_shared/utils/path_deconstructor.types.ts` to include optional `sourceGroupFragment?: string` field. This field must be added to the interface definition (around line 26) to support fragment parsing from deconstructed paths.    
    *   `[✅]` 70.c. `[TEST-UNIT]` Create RED test cases in `supabase/functions/_shared/utils/path_deconstructor.test.ts` that prove fragment parsing works.
        *   `[✅]` 70.c.i. Assert HeaderContext simple pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/1_thesis/_work/context/gpt-4-turbo_0_a1b2c3d4_header_context.json`, parsing extracts `sourceGroupFragment: 'a1b2c3d4'`, `modelSlug: 'gpt-4-turbo'`, `attemptCount: 0`, `fileTypeGuess: FileType.HeaderContext` (fragment after attemptCount).
        *   `[✅]` 70.c.ii. Assert HeaderContext antithesis pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/2_antithesis/_work/context/claude_critiquing_gpt-4_98765432_0_header_context.json`, parsing extracts `sourceGroupFragment: '98765432'`, `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 0`, `fileTypeGuess: FileType.HeaderContext`, `stageSlug: 'antithesis'` (fragment between sourceAnchorModelSlug and attemptCount).
        *   `[✅]` 70.c.iii. Assert TurnPrompt simple pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/1_thesis/_work/prompts/claude-3-5-sonnet_1_business_case_f5e6d7c8_prompt.md`, parsing extracts `sourceGroupFragment: 'f5e6d7c8'`, `modelSlug: 'claude-3-5-sonnet'`, `attemptCount: 1`, `documentKey: 'business_case'`, `fileTypeGuess: FileType.TurnPrompt` (fragment after documentKey).
        *   `[✅]` 70.c.iv. Assert TurnPrompt antithesis pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/2_antithesis/_work/prompts/claude_critiquing_gpt-4_98765432_1_business_case_critique_prompt.md`, parsing extracts `sourceGroupFragment: '98765432'`, `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 1`, `documentKey: 'business_case_critique'`, `fileTypeGuess: FileType.TurnPrompt`, `stageSlug: 'antithesis'` (fragment between sourceAnchorModelSlug and attemptCount).
        *   `[✅]` 70.c.v. Assert ModelContributionRawJson simple pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/1_thesis/raw_responses/gemini-1.5-pro_2_feature_spec_12345678_raw.json`, parsing extracts `sourceGroupFragment: '12345678'`, `modelSlug: 'gemini-1.5-pro'`, `attemptCount: 2`, `documentKey: 'feature_spec'`, `fileTypeGuess: FileType.ModelContributionRawJson` (fragment after documentKey).
        *   `[✅]` 70.c.vi. Assert ModelContributionRawJson antithesis pattern path with fragment parses correctly: given path matching the antithesis critiquing pattern with fragment, parsing extracts fragment in standardized position (between sourceAnchorModelSlug segment and attemptCount).
        *   `[✅]` 70.c.vii. Assert AssembledDocumentJson simple pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/1_thesis/_work/assembled_json/gpt-4_0_technical_approach_abcdef12_assembled.json`, parsing extracts `sourceGroupFragment: 'abcdef12'`, `modelSlug: 'gpt-4'`, `attemptCount: 0`, `documentKey: 'technical_approach'`, `fileTypeGuess: FileType.AssembledDocumentJson` (fragment after documentKey).
        *   `[✅]` 70.c.viii. Assert AssembledDocumentJson antithesis pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/2_antithesis/_work/assembled_json/claude_critiquing_gpt-4_98765432_1_business_case_critique_assembled.json`, parsing extracts `sourceGroupFragment: '98765432'`, `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 1`, `documentKey: 'business_case_critique'`, `fileTypeGuess: FileType.AssembledDocumentJson`, `stageSlug: 'antithesis'`.
        *   `[✅]` 70.c.ix. Assert RenderedDocument simple pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/1_thesis/documents/gpt-4_0_technical_approach_abcdef12.md`, parsing extracts `sourceGroupFragment: 'abcdef12'`, `modelSlug: 'gpt-4'`, `attemptCount: 0`, `documentKey: 'technical_approach'`, `fileTypeGuess: FileType.RenderedDocument` (fragment after documentKey).
        *   `[✅]` 70.c.x. Assert RenderedDocument antithesis pattern path with fragment parses correctly: given path `project-123/session_abc12345/iteration_1/2_antithesis/documents/claude_critiquing_gpt-4_98765432_1_business_case_critique.md`, parsing extracts `sourceGroupFragment: '98765432'`, `modelSlug: 'claude'`, `sourceAnchorModelSlug: 'gpt-4'`, `attemptCount: 1`, `documentKey: 'business_case_critique'`, `fileTypeGuess: FileType.RenderedDocument`, `stageSlug: 'antithesis'`.
        *   `[✅]` 70.c.xi. Assert paths without fragment still parse correctly (backward compatibility): given path `project-123/session_abc12345/iteration_1/2_antithesis/_work/context/gpt-4-turbo_0_header_context.json` (no fragment, simple pattern) or `project-123/session_abc12345/iteration_1/2_antithesis/_work/context/claude_critiquing_gpt-4_0_header_context.json` (no fragment, antithesis pattern), parsing works and `sourceGroupFragment` is undefined.
        *   `[✅]` 70.c.xii. Assert round-trip consistency: construct path with fragment using `constructStoragePath` (both simple and antithesis patterns for HeaderContext, TurnPrompt, ModelContributionRawJson, AssembledDocumentJson, RenderedDocument), then deconstruct using `deconstructStoragePath`, verify fragment is preserved correctly.
    *   `[✅]` 70.d. `[BE]` Implement fragment parsing in `deconstructStoragePath` function.
        *   `[✅]` 70.d.i. Add NEW regex pattern `headerContextAntithesisPatternString` BEFORE the existing `headerContextPatternString` check (around line 61): (a) Define pattern to match antithesis HeaderContext files with critiquing pattern: `^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/context/([^_]+)_critiquing_([^_]+)(?:_([a-f0-9]{8}))?_(\\d+)_header_context\\.json$` where capture groups are: (1) projectId, (2) sessionId, (3) iteration, (4) stageDir, (5) modelSlug (critiquing model), (6) sourceAnchorModelSlug (original source model), (7) optional fragment (8 chars), (8) attemptCount, (b) Add pattern matching logic BEFORE the existing `headerContextPatternString` check (order matters - antithesis pattern must be checked first), (c) When pattern matches, extract: `info.modelSlug = matches[5]` (critiquing model), `info.sourceAnchorModelSlug = matches[6]` (original source model from critiquing pattern), `info.sourceGroupFragment = matches[7] || undefined` (optional fragment), `info.attemptCount = parseInt(matches[8], 10)`, `info.fileTypeGuess = FileType.HeaderContext`, `info.stageSlug = 'antithesis'` (detected from pattern or stageDirName), (d) Return info immediately after antithesis pattern match, (e) Update existing `headerContextPatternString` regex (around line 61) to optionally capture fragment for simple pattern: pattern should match both `gpt-4-turbo_0_header_context.json` and `gpt-4-turbo_0_a1b2c3d4_header_context.json`, capturing fragment in optional group when present (fragment after attemptCount). This ensures antithesis HeaderContext files are correctly deconstructed with `sourceAnchorModelSlug` extracted, enabling `renderDocument` to preserve it for RenderedDocument filenames.
        *   `[✅]` 70.d.ii. Update `turnPromptPatternString` regex (around line 58-59) to optionally capture fragment for both simple and antithesis patterns: (a) Add new regex pattern `turnPromptAntithesisPatternString` to handle antithesis TurnPrompt pattern: match `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}[_continuation_{turnIndex}]_prompt.md`, capturing sourceAnchorModelSlug, optional fragment (between sourceAnchorModelSlug and attemptCount), attemptCount, documentKey, and optional continuation segment, (b) Update existing `turnPromptPatternString` regex to optionally capture fragment for simple pattern: match `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}][_continuation_{turnIndex}]_prompt.md`, capturing fragment after documentKey when present (standardized simple position), (c) Check antithesis pattern first (before simple pattern) to correctly identify antithesis TurnPrompt files, (d) Set `info.sourceGroupFragment` when fragment group is captured, and set `info.sourceAnchorModelSlug` for antithesis patterns.
        *   `[✅]` 70.d.iii. Update `docCentricRawJsonPatternString` and related patterns to optionally capture fragment: (a) Update `docCentricRawJsonPatternString` regex (around line 65) to optionally capture fragment after documentKey for simple pattern: `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}][_continuation_{turnIndex}]_raw.json` (standardized simple position), (b) Update `docCentricRawJsonContinuationPatternString` regex (around line 66) to optionally capture fragment for continuation chunks in simple pattern (fragment after documentKey, before continuation), (c) For antithesis raw JSON patterns, fragment is already handled in `antithesisContribRawPatternString` update in step 70.d.vi, (d) Set `info.sourceGroupFragment` when fragment group is captured.
        *   `[✅]` 70.d.iv. Update `assembledJsonPatternString` regex (around line 62) to optionally capture fragment for both simple and antithesis patterns: (a) Add new regex pattern `assembledJsonAntithesisPatternString` to handle antithesis AssembledDocumentJson pattern: match `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}_assembled.json`, capturing sourceAnchorModelSlug, optional fragment (between sourceAnchorModelSlug and attemptCount), attemptCount, and documentKey, (b) Update existing `assembledJsonPatternString` regex to optionally capture fragment for simple pattern: match `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}]_assembled.json`, capturing fragment after documentKey when present (standardized simple position), (c) Check antithesis pattern first (before simple pattern) to correctly identify antithesis AssembledDocumentJson files, (d) Set `info.sourceGroupFragment` and `info.sourceAnchorModelSlug` when captured.
        *   `[✅]` 70.d.v. Update `renderedDocumentPatternString` regex (around line 63) to optionally capture fragment for both simple and antithesis patterns: (a) Add new regex pattern `renderedDocumentAntithesisPatternString` to handle antithesis RenderedDocument pattern: match `{modelSlug}_critiquing_{sourceAnchorModelSlug}[_{fragment}]_{attemptCount}_{documentKey}.md`, capturing sourceAnchorModelSlug, optional fragment (between sourceAnchorModelSlug and attemptCount), attemptCount, and documentKey, (b) Update existing `renderedDocumentPatternString` regex to optionally capture fragment for simple pattern: match `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}].md`, capturing fragment after documentKey when present (standardized simple position), (c) Check antithesis pattern first (before simple pattern) to correctly identify antithesis RenderedDocument files, (d) Set `info.sourceGroupFragment` and `info.sourceAnchorModelSlug` when captured.
        *   `[✅]` 70.d.vi. Update antithesis document patterns to optionally capture fragment: 
                (a) Update `antithesisContribRawPatternString` regex (line 33) to optionally capture fragment segment between sourceAttemptCount and attemptCount in the pattern `{modelSlug}_critiquing_({sourceModelSlug}'s_{sourceContribType}_{sourceAttemptCount})[_{fragment}]_{attemptCount}_{documentKey}_raw.json`, where fragment is optional group between the closing parenthesis and attemptCount, 
                (b) Update `antithesisContribPatternString` regex (line 34) to optionally capture fragment segment in the pattern `{modelSlug}_critiquing_({sourceModelSlug}'s_{sourceContribType}_{sourceAttemptCount})[_{fragment}]_{attemptCount}_{documentKey}.md`, where fragment is optional group between the closing parenthesis and attemptCount, 
                (c) Note: Antithesis HeaderContext pattern fragment handling is already addressed in step 70.d.i above (fragment between sourceAnchorModelSlug and attemptCount in the critiquing pattern).        
        *   `[✅]` 70.d.vii. Set `info.sourceGroupFragment = matches[X]` when fragment group is captured and not undefined, otherwise leave undefined.
    *   `[✅]` 70.e. `[TEST-UNIT]` Re-run all tests from step 70.c and verify they pass.
        *   `[✅]` 70.e.i. Verify all RED test cases from step 70.c now pass with GREEN implementation.
        *   `[✅]` 70.e.ii. Test round-trip: construct path with fragment, deconstruct, verify fragment preserved correctly.
    *   `[✅]` 70.f. `[CRITERIA]` Acceptance criteria for path deconstructor changes.
        *   `[✅]` 70.f.i. All filename patterns correctly parse fragment when present in the path.
        *   `[✅]` 70.f.ii. Backward compatibility maintained: paths without fragment parse correctly (no errors, fragment field is undefined).
        *   `[✅]` 70.f.iii. Round-trip consistency: construct → deconstruct preserves fragment correctly.
    *   `[✅]` 70.g. `[COMMIT]` `feat: add sourceGroupFragment parsing to path_deconstructor`

*   `[ ]` 71. **`[BE]` Extract source_group fragment in executeModelCallAndSave and propagate to PathContext** Ensure fragment flows from job payload to path construction
    *   `[✅]` 71.a. `[DEPS]` The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` constructs `PathContext` at lines 1254-1266 from job payload data. The function depends on `job.payload.document_relationships?.source_group` containing the UUID that must be extracted as a fragment. The fragment extraction helper from step 68.d.i can be reused here, or a similar helper can be created. Fragment must be added to the `pathContext` object before it is passed to `uploadAndRegisterFile`.
    *   `[✅]` 71.b. `[TYPES]` All required types already exist: `PathContext` interface includes `sourceGroupFragment` (updated in step 68.b), `DocumentRelationships` interface already supports `source_group` field.
    *   `[✅]` 71.c. `[TEST-UNIT]` Create RED test cases in appropriate test file for `executeModelCallAndSave`.
        *   `[✅]` 71.c.i. Assert `PathContext` includes `sourceGroupFragment` when `job.payload.document_relationships.source_group` is present: given job payload with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000' }`, the constructed `PathContext` includes `sourceGroupFragment: '550e8400'`.
        *   `[✅]` 71.c.ii. Assert fragment extraction handles UUID with hyphens correctly: UUID `a1b2c3d4-e5f6-7890-abcd-ef1234567890` produces fragment `a1b2c3d4`.
        *   `[✅]` 71.c.iii. Assert `PathContext` works without `source_group` (backward compatibility): given job payload without `document_relationships.source_group`, the `PathContext` does not include `sourceGroupFragment` (or it is undefined).
        *   `[✅]` 71.c.iv. Assert fragment extraction handles undefined source_group gracefully: when `document_relationships` is null or `source_group` is undefined, no error is thrown and fragment is undefined.
        *   `[✅]` 71.c.v. Assert `sourceAnchorModelSlug` propagates correctly for antithesis patterns: given job payload with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000' }` and `canonicalPathParams` containing `sourceAnchorModelSlug: 'gpt-4'` (from planner), verify the constructed `PathContext` includes `sourceAnchorModelSlug: 'gpt-4'` when spread via `...restOfCanonicalPathParams`, enabling antithesis pattern detection in path construction. Verify this works for HeaderContext, TurnPrompt, AssembledDocumentJson, and RenderedDocument file types.
        *   `[✅]` 71.c.vi. Assert `canonicalPathParams` from planner includes `sourceAnchorModelSlug` for antithesis jobs: verify that when `planPerSourceDocumentByLineage` creates EXECUTE jobs for antithesis HeaderContext, the `canonicalPathParams` created by `createCanonicalPathParams` includes `sourceAnchorModelSlug` extracted from the anchor document's `model_name` field, and this propagates through job payload to PathContext construction.
    *   `[✅]` 71.d. `[BE]` Implement fragment extraction in `executeModelCallAndSave.ts`.
        *   `[✅]` 71.d.i. Extract `source_group` from `job.payload.document_relationships?.source_group` before pathContext construction (before line 1254).
        *   `[✅]` 71.d.ii. Import `extractSourceGroupFragment` helper function from `supabase/functions/_shared/utils/path_utils.ts` (shared utility created in step 68.d.i) that removes hyphens, takes first 8 chars, converts to lowercase. Do not create a local version to avoid duplication.
        *   `[✅]` 71.d.iii. Add `sourceGroupFragment: extractSourceGroupFragment(job.payload.document_relationships?.source_group)` to the `pathContext` object construction (line 1254-1266).
        *   `[✅]` 71.d.iv. Verify `sourceAnchorModelSlug` propagates correctly: ensure `restOfCanonicalPathParams` (spread from `job.payload.canonicalPathParams`) includes `sourceAnchorModelSlug` when present, so that antithesis pattern detection works in `constructStoragePath` for HeaderContext, TurnPrompt, AssembledDocumentJson, and RenderedDocument cases. Add logging if needed to trace propagation: log when `sourceAnchorModelSlug` is present in canonicalPathParams and verify it appears in pathContext.
    *   `[✅]` 71.e. `[TEST-UNIT]` Re-run all tests from step 71.c and verify they pass.
        *   `[✅]` 71.e.i. Verify all RED test cases from step 71.c now pass with GREEN implementation.
    *   `[ ]` 71.f. `[TEST-INT]` Create integration test to verify fragment propagates through entire flow.
        *   `[ ]` 71.f.i. Test full flow: create EXECUTE job with `document_relationships: { source_group: 'test-uuid-1234-5678-90ab-cdef12345678' }`, call `executeModelCallAndSave`, verify saved file in storage has fragment `testuuid` (first 8 chars after hyphen removal) in filename.
        *   `[ ]` 71.f.ii. Test fragment propagates to all file types: verify HeaderContext, TurnPrompt, RawJson, AssembledJson, and RenderedDocument files all include fragment when source_group is present.
        *   `[ ]` 71.f.iii. Test `findSourceDocuments` preserves `document_relationships.source_group`: (1) Create and save a contribution with `document_relationships: { source_group: 'test-uuid-preserve-1234-5678-90ab-cdef12345678', [stageSlug]: contributionId }`, (2) Call `findSourceDocuments` with a parent job that should retrieve this contribution as a source document (matching sessionId, stage, iteration, document_key), (3) Verify the returned `SourceDocument` has `document_relationships.source_group === 'test-uuid-preserve-1234-5678-90ab-cdef12345678'` (preserved from contribution), (4) Verify the planner can use this source document's `document_relationships.source_group` when creating child job payloads, (5) Verify fragment extraction works correctly in child jobs created from this source document. This proves the fragment propagation path: contribution → findSourceDocuments → planner → child job payload → fragment extraction.
        *   `[ ]` 71.f.iv. Test complete antithesis stage flow with fragment: (1) Create PLAN job that creates HeaderContext EXECUTE jobs with `document_relationships: { source_group: 'test-uuid-group-a' }` and `document_relationships: { source_group: 'test-uuid-group-b' }` (two different groups), (2) Verify HeaderContext files are created with critiquing pattern and fragment: `claude_critiquing_gpt-4_{fragment-a}_0_header_context.json` and `claude_critiquing_gpt-4_{fragment-b}_0_header_context.json` (different fragments for different groups), (3) Verify HeaderContext contributions are saved with `document_relationships: { source_group: 'test-uuid-group-a' }` and `document_relationships: { source_group: 'test-uuid-group-b' }` respectively, (4) Call `findSourceDocuments` to retrieve HeaderContext contributions as source documents for next stage EXECUTE jobs, verify `document_relationships.source_group` is preserved, (5) Create EXECUTE jobs that consume these HeaderContext files (TurnPrompt, documents), verify the planner preserves `source_group` from HeaderContext source documents in child job payloads, verify they use critiquing patterns with fragments: `claude_critiquing_gpt-4_{fragment-a}_1_business_case_critique_prompt.md` and `claude_critiquing_gpt-4_{fragment-b}_1_business_case_critique_prompt.md`, (6) Process RENDER jobs and verify RenderedDocument files use critiquing patterns with fragments: `claude_critiquing_gpt-4_{fragment-a}_1_business_case_critique.md` and `claude_critiquing_gpt-4_{fragment-b}_1_business_case_critique.md`, (7) Verify all files have unique names and no duplicate resource errors occur, (8) Verify `sourceAnchorModelSlug` propagates correctly through the entire flow from planner → canonicalPathParams → PathContext → filename construction.
    *   `[ ]` 71.g. `[CRITERIA]` Acceptance criteria for executeModelCallAndSave changes.
        *   `[ ]` 71.g.i. Fragment is correctly extracted from `job.payload.document_relationships.source_group` when present.
        *   `[ ]` 71.g.ii. Fragment appears in `PathContext` when source_group exists in job payload.
        *   `[ ]` 71.g.iii. Fragment propagates to all file types in the lineage chain (HeaderContext, TurnPrompt, RawJson, AssembledJson, RenderedDocument).
        *   `[ ]` 71.g.iv. Backward compatibility maintained: jobs without source_group work correctly (no fragment in filenames).
    *   `[ ]` 71.h. `[COMMIT]` `feat: extract source_group fragment in executeModelCallAndSave and propagate to PathContext`

*   `[✅]` 72. **`[DOCS]` Update file_manager.md with sourceGroupFragment naming conventions** Document fragment usage in canonical file naming standards
    *   `[✅]` 72.a. `[DEPS]` The documentation file `supabase/functions/_shared/services/file_manager.md` documents canonical file tree structure and naming conventions. It must be updated to reflect the new fragment-based naming patterns, especially for antithesis header_context pattern (around line 216) and PathContext interface documentation (lines 100-121).
    *   `[✅]` 72.b. `[TYPES]` No type changes required for documentation update.
    *   `[✅]` 72.c. `[DOCS]` Update documentation in `supabase/functions/_shared/services/file_manager.md`.
        *   `[✅]` 72.c.i. Update HeaderContext filename example (around line 201) to show optional fragment: change `{model_slug}_{n}_header_context.json` to `{model_slug}_{n}[_{fragment}]_header_context.json` with note explaining fragment appears when `source_group` exists in `document_relationships`.
        *   `[✅]` 72.c.ii. Update TurnPrompt filename example (around line 199) to show optional fragment after documentKey.
        *   `[✅]` 72.c.iii. Update antithesis header_context pattern (around line 216): change `{model_slug}_critiquing_{source_model_slug}_{n}_header_context.json` to `{model_slug}_critiquing_{source_model_slug}[_{fragment}]_{n}_header_context.json` with explanation.
        *   `[✅]` 72.c.iv. Update PathContext interface documentation (lines 100-121) to include `sourceGroupFragment?: string` field with description: "Optional fragment extracted from `document_relationships.source_group` UUID (first 8 characters, sanitized) to disambiguate filenames when the same model processes multiple source groups in parallel."
        *   `[✅]` 72.c.v. Add explanatory section after PathContext interface documentation explaining fragment purpose: "The `sourceGroupFragment` field is used to ensure unique filenames when multiple instances of the same AI model process different source document groups (lineages) in parallel. The fragment is extracted from the `document_relationships.source_group` UUID by taking the first 8 characters after removing hyphens, converting to lowercase, and sanitizing for filesystem use. This prevents duplicate resource errors when parallel jobs generate files with otherwise identical naming patterns."
    *   `[✅]` 72.d. `[CRITERIA]` Acceptance criteria for documentation changes.
        *   `[✅]` 72.d.i. All filename examples show fragment when applicable (with square brackets indicating optional segment).
        *   `[✅]` 72.d.ii. Fragment extraction rules are documented (first 8 chars of UUID, hyphens removed, lowercase, sanitized).
        *   `[✅]` 72.d.iii. PathContext interface documentation matches implementation (includes `sourceGroupFragment?: string` field).
        *   `[✅]` 72.d.iv. Fragment purpose and usage are clearly explained in documentation.
    *   `[✅]` 72.e. `[COMMIT]` `docs: update file_manager.md with sourceGroupFragment naming conventions`

*   `[✅]` 73. **`[BE]` Extract sourceGroupFragment in renderDocument PathContext construction** Ensure fragment propagates to RenderedDocument filenames
    *   `[✅]` 73.a. `[DEPS]` The `renderDocument` function in `supabase/functions/_shared/services/document_renderer.ts` constructs `PathContext` for `RenderedDocument` files at lines 342-352. The function extracts `modelSlug` and `attemptCount` from the base chunk's storage path using path deconstruction (ARCHITECTURE.md line 321), but does not extract or preserve `sourceGroupFragment`. The fragment must be extracted from the contribution's `document_relationships.source_group` (when present) and included in the `PathContext` so that rendered document filenames include the fragment for disambiguation.
    *   `[✅]` 73.b. `[TYPES]` All required types already exist: `PathContext` interface includes `sourceGroupFragment` (updated in step 68.b), `DialecticContributionRow` has `document_relationships` field that may contain `source_group`.
    *   `[✅]` 73.c. `[TEST-UNIT]` Create RED test cases in appropriate test file for `renderDocument`.
        *   `[✅]` 73.c.i. Assert `PathContext` for RenderedDocument includes `sourceGroupFragment` when base chunk contribution has `document_relationships.source_group`: given a contribution with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000', [stageSlug]: contributionId }`, when `renderDocument` constructs `PathContext` for the rendered document, it includes `sourceGroupFragment: '550e8400'`.
        *   `[✅]` 73.c.ii. Assert fragment extraction handles UUID with hyphens correctly: contribution with `source_group: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'` produces fragment `a1b2c3d4` in PathContext.
        *   `[✅]` 73.c.iii. Assert `PathContext` works without `source_group`: given contribution without `document_relationships.source_group`, the `PathContext` does not include `sourceGroupFragment` (or it is undefined).
        *   `[✅]` 73.c.iv. Assert fragment extraction handles missing document_relationships gracefully: when `document_relationships` is null or missing, no error is thrown and fragment is undefined.
    *   `[✅]` 73.d. `[BE]` Implement fragment extraction in `renderDocument.ts`.
        *   `[✅]` 73.d.i. Import `extractSourceGroupFragment` helper from `supabase/functions/_shared/utils/path_utils.ts` (shared utility created in step 68.d.i). Do not import from `path_constructor.ts` or create local version to avoid duplication.
        *   `[✅]` 73.d.ii. Before constructing `PathContext` for RenderedDocument (around line 342), extract `source_group` from the base chunk contribution's `document_relationships?.source_group` and extract `sourceAnchorModelSlug` from the deconstructed path info (if available) for antithesis pattern detection. **CRITICAL**: The deconstructed path info will only contain `sourceAnchorModelSlug` if the base chunk's storage path uses an antithesis critiquing pattern (e.g., `claude_critiquing_gpt-4_98765432_1_business_case_critique_raw.json`). This requires the antithesis deconstructor patterns from step 69 to correctly extract `sourceAnchorModelSlug` from the path. For antithesis HeaderContext contributions, `deconstructStoragePath` must extract `sourceAnchorModelSlug` from the critiquing pattern. For antithesis document contributions (RawJson, RenderedDocument), `deconstructStoragePath` must extract `sourceAnchorModelSlug` from the critiquing pattern via existing antithesis patterns.
        *   `[✅]` 73.d.iii. Add `sourceGroupFragment: extractSourceGroupFragment(baseChunk.document_relationships?.source_group)` to the `PathContext` object construction (lines 342-352). Also preserve `sourceAnchorModelSlug` from deconstructed path info if present: check if `deconstructedPathInfo.sourceAnchorModelSlug` exists and add `sourceAnchorModelSlug: deconstructedPathInfo.sourceAnchorModelSlug` to pathContext so that antithesis RenderedDocument patterns can be correctly identified when reconstructing paths. **VERIFY**: When deconstructing antithesis HeaderContext paths (e.g., `claude_critiquing_gpt-4_98765432_0_header_context.json`), `deconstructedPathInfo.sourceAnchorModelSlug` should equal `'gpt-4'` (the original source model, not the critiquing model 'claude').
        *   `[✅]` 73.d.iv. Verify `stageSlug` is preserved in pathContext: ensure `stageSlug: pathContext.stageSlug` is included in the PathContext construction so that antithesis pattern detection (`context.stageSlug === 'antithesis'`) works correctly in `constructStoragePath` for RenderedDocument files.
    *   `[✅]` 73.e. `[TEST-UNIT]` Re-run all tests from step 73.c and verify they pass.
        *   `[✅]` 73.e.i. Verify all RED test cases from step 73.c now pass with GREEN implementation.
    *   `[✅]` 73.f. `[TEST-INT]` Create integration test to verify fragment propagates to rendered documents.
        *   `[✅]` 73.f.i. Test full flow: create contribution with `document_relationships: { source_group: 'test-uuid-1234-5678-90ab-cdef12345678', [stageSlug]: contributionId }`, call `renderDocument`, verify saved rendered document file in storage has fragment `testuuid` in filename.
        *   `[✅]` 73.f.ii. Test antithesis RenderedDocument preserves sourceAnchorModelSlug: create antithesis contribution with storage path containing critiquing pattern (e.g., `claude_critiquing_gpt-4_98765432_1_business_case_critique_raw.json`), call `renderDocument`, verify deconstructed path extracts `sourceAnchorModelSlug: 'gpt-4'`, verify rendered document PathContext includes `sourceAnchorModelSlug`, verify final rendered document filename uses antithesis pattern with fragment: `claude_critiquing_gpt-4_98765432_1_business_case_critique.md`.
    *   `[✅]` 73.g. `[CRITERIA]` Acceptance criteria for renderDocument changes.
        *   `[✅]` 73.g.i. Fragment is correctly extracted from base chunk contribution's `document_relationships.source_group` when present.
        *   `[✅]` 73.g.ii. Fragment appears in `PathContext` for RenderedDocument when source_group exists in contribution.
        *   `[✅]` 73.g.iii. Rendered document filenames include fragment when source_group is present in source contribution.
        *   `[✅]` 73.g.iv. Fragment extraction handles missing/null document_relationships gracefully.
    *   `[✅]` 73.h. `[COMMIT]` `feat: extract sourceGroupFragment in renderDocument PathContext construction`

*   `[✅]` 74. **`[BE]` Extract sourceGroupFragment in continueJob for continuation job fragment propagation** Ensure fragment propagates to continuation chunk filenames
    *   `[✅]` 74.a. `[DEPS]` The `continueJob` function in `supabase/functions/dialectic-worker/continueJob.ts` preserves `document_relationships` from the saved contribution at line 149, which includes `source_group`. However, when continuation jobs call `executeModelCallAndSave`, the fragment extraction logic (from step 70) extracts from `job.payload.document_relationships?.source_group`. The continuation job payload must preserve the `source_group` from the saved contribution so that fragment extraction works correctly for continuation chunks. Currently, `continueJob` copies `document_relationships` to `basePayload.document_relationships` (line 149), which should be sufficient, but we need to verify the fragment extraction in `executeModelCallAndSave` correctly handles continuation jobs.
    *   `[✅]` 74.b. `[TYPES]` All required types already exist: `DocumentRelationships` interface supports `source_group` field, continuation job payloads preserve `document_relationships` structure.
    *   `[✅]` 74.c. `[TEST-UNIT]` Create RED test cases in `continueJob.test.ts` that prove continuation jobs preserve source_group for fragment extraction.
        *   `[✅]` 74.c.i. Assert continuation job payload includes `document_relationships.source_group` from saved contribution: given a saved contribution with `document_relationships: { source_group: '550e8400-e29b-41d4-a716-446655440000', [stageSlug]: rootContributionId }`, when `continueJob` creates a continuation job payload, verify `basePayload.document_relationships.source_group === '550e8400-e29b-41d4-a716-446655440000'`.
        *   `[✅]` 74.c.ii. Assert continuation job payload preserves source_group when document_relationships is copied from saved contribution: verify that when `continueJob` copies `savedContribution.document_relationships` to `basePayload.document_relationships` (line 149), the `source_group` field is preserved correctly.
        *   `[✅]` 74.c.iii. Assert continuation job payload handles missing source_group gracefully: given a saved contribution without `document_relationships.source_group`, verify `basePayload.document_relationships` does not include `source_group` (or it is undefined/null).
    *   `[✅]` 74.d. `[BE]` Verify and fix fragment preservation in `continueJob.ts` if needed.
        *   `[✅]` 74.d.i. Review line 149 logic: verify `basePayload.document_relationships = savedContribution.document_relationships` correctly preserves `source_group` field when `savedContribution.document_relationships` is a valid `DocumentRelationships` object.
        *   `[✅]` 74.d.ii. If `document_relationships` preservation logic is incomplete, fix it to ensure `source_group` is preserved: use type-safe construction to copy all fields from `savedContribution.document_relationships`, including `source_group`, to `basePayload.document_relationships`.
        *   `[✅]` 74.d.iii. Verify the continuation job payload structure matches what `executeModelCallAndSave` expects: the fragment extraction logic in `executeModelCallAndSave` (step 70) reads from `job.payload.document_relationships?.source_group`, so ensure `basePayload.document_relationships` has this structure.
    *   `[✅]` 74.e. `[TEST-UNIT]` Re-run all tests from step 74.c and verify they pass.
        *   `[✅]` 74.e.i. Verify all RED test cases from step 74.c now pass with GREEN implementation.
    *   `[✅]` 74.f. `[TEST-INT]` Create integration test to verify continuation chunks get fragment in filenames.
        *   `[✅]` 74.f.i. Test full flow: create root chunk with `document_relationships: { source_group: 'test-uuid-1234-5678-90ab-cdef12345678', [stageSlug]: rootId }`, save contribution, call `continueJob` to create continuation job, process continuation job via `executeModelCallAndSave`, verify continuation chunk file in storage has fragment `testuuid` in filename.
    *   `[✅]` 74.g. `[CRITERIA]` Acceptance criteria for continueJob changes.
        *   `[✅]` 74.g.i. Continuation job payloads preserve `document_relationships.source_group` from saved contribution.
        *   `[✅]` 74.g.ii. Fragment extraction in `executeModelCallAndSave` works correctly for continuation jobs (extracts fragment from continuation job payload).
        *   `[✅]` 74.g.iii. Continuation chunk filenames include fragment when source_group is present in root contribution.
        *   `[✅]` 74.g.iv. Fragment preservation handles missing/null document_relationships gracefully.
    *   `[✅]` 74.h. `[COMMIT]` `feat: preserve sourceGroupFragment in continueJob for continuation chunk filenames`

*   `[✅]` 75. **`[BE]` Audit filename patterns and verify sourceAnchorModelSlug propagation** Verify all filename patterns match documented standards and sourceAnchorModelSlug propagates correctly
    *   `[✅]` 75.a. `[DEPS]` Before completing the fragment implementation, audit all filename patterns to ensure consistency between documented patterns in `file_manager.md`, actual implementation in `path_constructor.ts`, and deconstruction patterns in `path_deconstructor.ts`. Verify that `sourceAnchorModelSlug` propagates correctly from planners through canonicalPathParams to PathContext to enable antithesis pattern detection.
    *   `[✅]` 75.b. `[TYPES]` No type changes required for audit step.
    *   `[✅]` 75.c. `[TEST-UNIT]` Create audit test cases that verify pattern consistency.
        *   `[✅]` 75.c.i. Assert HeaderContext patterns match documented standards: (a) Simple pattern documented as `{model_slug}_{n}_header_context.json`, implementation should match when no fragment and no antithesis, (b) Antithesis pattern documented as `{model_slug}_critiquing_{source_model_slug}_{n}_header_context.json`, implementation should match when `stageSlug === 'antithesis'` and `sourceAnchorModelSlug` exists, (c) Fragment positions match standardized positions defined in step 68.f.v.
        *   `[✅]` 75.c.ii. Assert TurnPrompt patterns match documented standards: (a) Simple pattern should match documented pattern from file_manager.md, (b) Antithesis pattern documented as `{model_slug}_critiquing_{source_model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md` (file_manager.md line 214), implementation should match when antithesis detected, (c) Fragment positions match standardized positions.
        *   `[✅]` 75.c.iii. Assert RenderedDocument patterns match documented standards: (a) Simple pattern should match documented pattern, (b) Antithesis pattern documented as `{model_slug}_critiquing_{source_model_slug}_{n}_{document_key}.md` (file_manager.md line 222), implementation should match when antithesis detected, (c) Fragment positions match standardized positions.
        *   `[✅]` 75.c.iv. Assert AssembledDocumentJson patterns are consistent: verify simple and antithesis patterns exist and fragment positions match standardized positions.
        *   `[✅]` 75.c.v. Assert ModelContributionRawJson patterns match documented standards: verify antithesis critiquing pattern matches actual implementation pattern, verify fragment positions are standardized.
    *   `[✅]` 75.d. `[BE]` Verify sourceAnchorModelSlug propagation through entire pipeline.
        *   `[✅]` 75.d.i. Trace sourceAnchorModelSlug from planner to path construction: (a) Verify `planPerSourceDocumentByLineage` calls `createCanonicalPathParams` with source documents, (b) Verify `createCanonicalPathParams` extracts `sourceAnchorModelSlug` from `anchorDoc.model_name` when present, (c) Verify `canonicalPathParams` is included in job payload created by planner, (d) Verify `executeModelCallAndSave` spreads `restOfCanonicalPathParams` into pathContext (line 1261), (e) Verify `constructStoragePath` receives `sourceAnchorModelSlug` in PathContext and uses it for antithesis pattern detection, (f) Add logging at each step if needed to trace propagation through the pipeline.
        *   `[✅]` 75.d.ii. Verify sourceAnchorModelSlug propagation for HeaderContext: create test case where planner creates HeaderContext EXECUTE job for antithesis stage, verify canonicalPathParams includes sourceAnchorModelSlug, verify pathContext includes sourceAnchorModelSlug, verify HeaderContext filename uses critiquing pattern with sourceAnchorModelSlug.
        *   `[✅]` 75.d.iii. **RED TEST**: Verify sourceAnchorModelSlug propagation for TurnPrompt when HeaderContext is consumed as source document: (a) Create antithesis HeaderContext contribution with storage path `claude_critiquing_gpt-4_98765432_0_header_context.json` (contains critiquing pattern with sourceAnchorModelSlug='gpt-4'), (b) Save HeaderContext contribution to database with `model_name = 'claude'` (critiquing model) and `document_relationships: { source_group: 'test-group-uuid' }`, (c) Call `findSourceDocuments` to retrieve HeaderContext as source document for TurnPrompt EXECUTE job, (d) Verify source document has `model_name = 'claude'` (from contribution row), (e) Verify planner calls `createCanonicalPathParams` with HeaderContext as anchorDoc, (f) **This test must initially FAIL**: `createCanonicalPathParams` extracts `sourceAnchorModelSlug = anchorDoc.model_name` (line 47), which would be 'claude' (wrong - this is the critiquing model, not the original source). The original source model 'gpt-4' is in the HeaderContext's storage path, not in `model_name`. Assert that `canonicalPathParams.sourceAnchorModelSlug === 'gpt-4'` (original source) not 'claude' (critiquing model). This test fails until step 75.d.vi fix is implemented. (g) After fix, verify TurnPrompt filename uses critiquing pattern with correct sourceAnchorModelSlug: `claude_critiquing_gpt-4_{fragment}_1_business_case_critique_prompt.md`.
        *   `[✅]` 75.d.iv. Verify sourceAnchorModelSlug propagation for RenderedDocument: verify that when `renderDocument` deconstructs an antithesis raw JSON path, it extracts `sourceAnchorModelSlug`, and when constructing PathContext for rendered document, it preserves `sourceAnchorModelSlug` so that rendered filename uses antithesis pattern.
        *   `[✅]` 75.d.v. Verify sourceAnchorModelSlug is available when needed: check that for all file types requiring antithesis pattern detection (HeaderContext, TurnPrompt, AssembledDocumentJson, RenderedDocument), the `sourceAnchorModelSlug` field is present in PathContext when `stageSlug === 'antithesis'`. If missing, trace back to find where propagation breaks and fix.
        *   `[✅]` 75.d.vi. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/canonical_context_builder.test.ts`, add failing unit test that proves `createCanonicalPathParams` incorrectly uses HeaderContext's model_name instead of extracting sourceAnchorModelSlug from storage path: (a) Create mock HeaderContext source document with `contribution_type = 'header_context'`, `model_name = 'claude'` (critiquing model), `storage_path = 'project-123/session_abc/iteration_1/2_antithesis/_work/context'`, `file_name = 'claude_critiquing_gpt-4_98765432_0_header_context.json'` (contains critiquing pattern with original source model 'gpt-4'), (b) Call `createCanonicalPathParams` with HeaderContext as anchorDoc, (c) Assert `sourceAnchorModelSlug === 'gpt-4'` (original source from deconstructed path) not 'claude' (critiquing model from model_name). This test must initially FAIL because the function currently uses `anchorDoc.model_name` without deconstructing the path.
        *   `[✅]` 75.d.vii. `[BE]` **GREEN**: Fix sourceAnchorModelSlug extraction in `createCanonicalPathParams` when HeaderContext is consumed as source document. **DEPENDENCY**: Antithesis HeaderContext deconstructor pattern must exist to extract sourceAnchorModelSlug from path. **PROBLEM**: When HeaderContext contribution is retrieved via `findSourceDocuments` and used as anchorDoc in `createCanonicalPathParams`, the function currently extracts `sourceAnchorModelSlug = anchorDoc.model_name` (line 47), which is the critiquing model that generated the HeaderContext (e.g., 'claude'), not the original source model from the critiquing pattern (e.g., 'gpt-4'). The original source model is encoded in the HeaderContext's storage path filename via the critiquing pattern (e.g., `claude_critiquing_gpt-4_98765432_0_header_context.json` contains `sourceAnchorModelSlug='gpt-4'` in the pattern). **IMPLEMENTATION**: In `supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts`, modify `createCanonicalPathParams` function: (a) Import `deconstructStoragePath` from `../../_shared/utils/path_deconstructor.ts` at top of file, (b) Before setting `sourceAnchorModelSlug = anchorDoc.model_name || undefined` (line 47), add conditional logic: check if `anchorDoc.contribution_type === 'header_context'` AND `anchorDoc.storage_path` exists AND `anchorDoc.file_name` exists, (c) If condition is true, call `deconstructStoragePath({ storageDir: anchorDoc.storage_path, fileName: anchorDoc.file_name })` to parse the HeaderContext's storage path, (d) Check if `deconstructedPathInfo.sourceAnchorModelSlug` exists (this will be extracted by the antithesis HeaderContext pattern if the path contains a critiquing pattern), (e) If `deconstructedPathInfo.sourceAnchorModelSlug` exists, use it as the `sourceAnchorModelSlug` value instead of `anchorDoc.model_name`, (f) If deconstruction fails (throws error) or `sourceAnchorModelSlug` is not found in deconstructed path, fall back to `anchorDoc.model_name || undefined` (existing behavior for non-antithesis or non-HeaderContext cases), (g) Handle errors gracefully: wrap deconstruction in try-catch, log warning if deconstruction fails but do not throw (allow fallback to model_name), (h) Verify the fix works for both antithesis HeaderContext (critiquing pattern extracts sourceAnchorModelSlug) and simple HeaderContext (no critiquing pattern, uses model_name fallback). This ensures that when TurnPrompt/documents EXECUTE jobs consume antithesis HeaderContext as source documents, they get the correct original source model slug ('gpt-4') not the critiquing model slug ('claude'), enabling correct critiquing pattern filenames.
        *   `[✅]` 75.d.viii. `[TEST-UNIT]` **GREEN**: Re-run unit test from step 75.d.vi and verify it now passes. Also add test case for simple HeaderContext (non-antithesis) to verify fallback behavior: (a) Create mock simple HeaderContext source document with `contribution_type = 'header_context'`, `model_name = 'gpt-4'`, `storage_path = 'project-123/session_abc/iteration_1/1_thesis/_work/context'`, `file_name = 'gpt-4_0_header_context.json'` (simple pattern, no critiquing), (b) Call `createCanonicalPathParams` with HeaderContext as anchorDoc, (c) Assert `sourceAnchorModelSlug === 'gpt-4'` (from model_name, since deconstructed path won't have sourceAnchorModelSlug for simple patterns), (d) Verify error handling: if deconstruction throws error, function falls back to `model_name` without throwing.
        *   `[✅]` 75.d.ix. `[TEST-INT]` **GREEN**: Re-run integration test from step 75.d.iii and verify it now passes: (a) HeaderContext contribution with path `claude_critiquing_gpt-4_98765432_0_header_context.json`, `model_name = 'claude'`, `contribution_type = 'header_context'`, (b) Retrieved as source document via `findSourceDocuments`, (c) Used as anchorDoc in `createCanonicalPathParams` for TurnPrompt EXECUTE job, (d) Assert `sourceAnchorModelSlug = 'gpt-4'` (original source from deconstructed path) not 'claude' (from model_name), (e) Verify this propagates to TurnPrompt filename construction: when `constructStoragePath` receives PathContext with `sourceAnchorModelSlug: 'gpt-4'` and `stageSlug: 'antithesis'`, it generates filename `claude_critiquing_gpt-4_{fragment}_1_business_case_critique_prompt.md`.
    *   `[✅]` 75.e. `[CRITERIA]` Acceptance criteria for audit.
        *   `[✅]` 75.e.i. All documented filename patterns in file_manager.md have corresponding implementation in path_constructor.ts that matches exactly (accounting for fragment insertion positions).
        *   `[✅]` 75.e.ii. All deconstruction patterns in path_deconstructor.ts can correctly parse files generated by path_constructor.ts (round-trip consistency verified). This includes the new antithesis HeaderContext pattern that extracts sourceAnchorModelSlug from critiquing patterns.
        *   `[✅]` 75.e.iii. sourceAnchorModelSlug propagates correctly from planner → canonicalPathParams → job payload → PathContext → filename construction for all file types that require antithesis patterns. **CRITICAL**: When HeaderContext is consumed as source document, `createCanonicalPathParams` correctly extracts sourceAnchorModelSlug from the HeaderContext's storage path (via deconstruction) rather than using the HeaderContext's model_name (which is the critiquing model, not the original source model).
        *   `[✅]` 75.e.iv. Fragment positions are standardized: simple patterns use fragment after attemptCount (or after documentKey for TurnPrompt), antithesis patterns use fragment between sourceAnchorModelSlug and attemptCount.
        *   `[✅]` 75.e.v. No manual filename construction exists elsewhere in codebase (all filenames constructed via constructStoragePath).
        *   `[✅]` 75.e.vi. All file types that need antithesis pattern detection (HeaderContext, TurnPrompt, AssembledDocumentJson, RenderedDocument) correctly detect antithesis stage when `stageSlug === 'antithesis'` AND `sourceAnchorModelSlug` exists in PathContext.
        *   `[✅]` 75.e.vii. Fragment propagates through entire lineage chain: (a) HeaderContext contributions are saved with `document_relationships.source_group`, (b) HeaderContext is retrieved via `findSourceDocuments` and `document_relationships.source_group` is preserved, (c) Planners create child job payloads with `document_relationships.source_group` from source documents, (d) Fragment is extracted in `executeModelCallAndSave` and appears in all file types (HeaderContext, TurnPrompt, RawJson, AssembledJson, RenderedDocument), (e) Fragment is preserved in continuation jobs via `continueJob`, (f) Fragment is extracted in `renderDocument` from base chunk contributions, (g) All files in the lineage have unique filenames with fragment when source_group exists.
    *   `[✅]` 75.f. `[COMMIT]` `test: audit filename patterns and verify sourceAnchorModelSlug propagation`

*   `[✅]` 76. **`[TYPES]` Add extractSourceGroupFragment to Job Context Interfaces**
    *   `[✅]` 76.a. `[DEPS]` The `IExecuteJobContext` interface in `supabase/functions/dialectic-worker/JobContext.interface.ts` needs to include `extractSourceGroupFragment` field so that `executeModelCallAndSave` can access it via dependency injection instead of direct import. This follows the same pattern as `getExtensionFromMimeType` which is already in the interface. The `JobContextParams` interface also needs to be updated to include this field for factory construction. The type definition `ExtractSourceGroupFragmentFn` must be created first in `path_utils.ts` before it can be imported and used in the interface.
        *   `[✅]` 76.a.i. `IExecuteJobContext` interface is defined at lines 143-159 in `supabase/functions/dialectic-worker/JobContext.interface.ts`.
        *   `[✅]` 76.a.ii. `JobContextParams` interface is defined at lines 206-232 in the same file.
        *   `[✅]` 76.a.iii. `extractSourceGroupFragment` function exists at line 15 in `supabase/functions/_shared/utils/path_utils.ts` but lacks a type definition.
        *   `[✅]` 76.a.iv. `GetExtensionFromMimeTypeFn` type definition exists at line 2 in `path_utils.ts`, providing the pattern to follow (see step 47.b.ii).
    *   `[✅]` 76.b. `[TYPES]` Add type definition to `path_utils.ts` and update interfaces in `JobContext.interface.ts`.
        *   `[✅]` 76.b.i. In `supabase/functions/_shared/utils/path_utils.ts`, add `export type ExtractSourceGroupFragmentFn = (sourceGroup: string | undefined) => string | undefined;` before the `extractSourceGroupFragment` function (after line 1, before line 15), following the pattern of `GetExtensionFromMimeTypeFn`.
        *   `[✅]` 76.b.ii. In `supabase/functions/_shared/utils/path_utils.ts`, update `extractSourceGroupFragment` function to use the type: `export const extractSourceGroupFragment: ExtractSourceGroupFragmentFn = (sourceGroup: string | undefined): string | undefined => {`.
        *   `[✅]` 76.b.iii. In `supabase/functions/dialectic-worker/JobContext.interface.ts`, import `ExtractSourceGroupFragmentFn` from `'../_shared/path_utils.ts'` at the top of the file (add to existing imports from path_utils.ts if present, or add new import line).
        *   `[✅]` 76.b.iv. In `supabase/functions/dialectic-worker/JobContext.interface.ts`, add `readonly extractSourceGroupFragment: ExtractSourceGroupFragmentFn;` to `IExecuteJobContext` interface after `getExtensionFromMimeType` (around line 153), following the same pattern.
        *   `[✅]` 76.b.v. In `supabase/functions/dialectic-worker/JobContext.interface.ts`, add `readonly extractSourceGroupFragment: ExtractSourceGroupFragmentFn;` to `JobContextParams` interface after `getExtensionFromMimeType` (around line 222), following the same pattern.
    *   `[✅]` 76.c. `[LINT]` Run linter for `path_utils.ts` and `JobContext.interface.ts` and resolve any warnings or errors.
    *   `[✅]` 76.d. `[CRITERIA]` All requirements met: (1) `ExtractSourceGroupFragmentFn` type definition exists in `path_utils.ts` and matches function signature, (2) Function uses the type definition, (3) `IExecuteJobContext` interface includes `extractSourceGroupFragment` field, (4) `JobContextParams` interface includes `extractSourceGroupFragment` field, (5) Both files are lint-clean, (6) Type can be imported and used correctly.

*   `[✅]` 77. **`[TEST-UNIT]` Update Type Guard Tests for extractSourceGroupFragment**
    *   `[✅]` 77.a. `[DEPS]` The type guard `isIExecuteJobContext` in `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts` must be updated to check for the `extractSourceGroupFragment` field. The corresponding test file `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.test.ts` needs RED tests that verify the type guard correctly validates this new field.
        *   `[✅]` 77.a.i. `isIExecuteJobContext` type guard is defined in `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts`.
        *   `[✅]` 77.a.ii. Test file `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.test.ts` contains existing tests for `isIExecuteJobContext`.
    *   `[✅]` 77.b. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.test.ts`, add failing tests for `extractSourceGroupFragment` field validation.
        *   `[✅]` 77.b.i. Add test "isIExecuteJobContext returns false when extractSourceGroupFragment is missing": Create object with all `IExecuteJobContext` fields except `extractSourceGroupFragment`, call `isIExecuteJobContext(object)`, assert returns `false`. This test must initially FAIL because the type guard doesn't check for `extractSourceGroupFragment` yet.
        *   `[✅]` 77.b.ii. Add test "isIExecuteJobContext returns true when extractSourceGroupFragment is present and is a function": Create valid `IExecuteJobContext` object including `extractSourceGroupFragment: () => 'test'`, call `isIExecuteJobContext(object)`, assert returns `true`. This test must initially FAIL because the type guard doesn't check for `extractSourceGroupFragment` yet.
        *   `[✅]` 77.b.iii. Add test "isIExecuteJobContext returns false when extractSourceGroupFragment is not a function": Create object with all fields including `extractSourceGroupFragment: 'not-a-function'`, call `isIExecuteJobContext(object)`, assert returns `false`. This test must initially FAIL.
    *   `[✅]` 77.c. `[CRITERIA]` All requirements met: (1) RED tests exist that verify `extractSourceGroupFragment` field validation, (2) Tests initially fail because type guard doesn't check the field yet, (3) Tests follow existing patterns in the test file.

*   `[✅]` 78. **`[TYPE-GUARDS]` Update Type Guards for extractSourceGroupFragment**
    *   `[✅]` 78.a. `[DEPS]` The type guard `isIExecuteJobContext` in `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts` must check for the `extractSourceGroupFragment` field to match the updated interface from step 76. This enables runtime validation that objects satisfy `IExecuteJobContext` interface.
        *   `[✅]` 78.a.i. `isIExecuteJobContext` type guard is defined in `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts` (see step 46.d for original implementation).
        *   `[✅]` 78.a.ii. The type guard currently checks for `getExtensionFromMimeType` field (around line 114) and must be updated to also check for `extractSourceGroupFragment`.
    *   `[✅]` 78.b. `[TYPE-GUARDS]` **GREEN**: In `supabase/functions/dialectic-worker/type-guards/JobContext.type_guards.ts`, update `isIExecuteJobContext` type guard.
        *   `[✅]` 78.b.i. Add `'extractSourceGroupFragment' in value` check to the field existence check (around line 106, after `'getExtensionFromMimeType' in value`).
        *   `[✅]` 78.b.ii. Add `typeof value.extractSourceGroupFragment === 'function'` check to the type validation (around line 114, after `typeof value.getExtensionFromMimeType === 'function'`).
    *   `[✅]` 78.c. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 77 and ensure they now pass.
        *   `[✅]` 78.c.i. Re-run test "isIExecuteJobContext returns false when extractSourceGroupFragment is missing" - should now pass.
        *   `[✅]` 78.c.ii. Re-run test "isIExecuteJobContext returns true when extractSourceGroupFragment is present and is a function" - should now pass.
        *   `[✅]` 78.c.iii. Re-run test "isIExecuteJobContext returns false when extractSourceGroupFragment is not a function" - should now pass.
    *   `[✅]` 78.d. `[LINT]` Run linter for `JobContext.type_guards.ts` and resolve any warnings or errors.
    *   `[✅]` 78.e. `[CRITERIA]` All requirements met: (1) Type guard checks for `extractSourceGroupFragment` field existence, (2) Type guard validates `extractSourceGroupFragment` is a function, (3) All tests from step 77 pass, (4) File is lint-clean.

*   `[✅]` 79. **`[TEST-UNIT]` Update Factory Tests for extractSourceGroupFragment**
    *   `[✅]` 79.a. `[DEPS]` The factory function `createJobContext` in `supabase/functions/dialectic-worker/createJobContext.ts` must construct `IJobContext` with `extractSourceGroupFragment` field from `JobContextParams`. The slicer function `createExecuteJobContext` must extract `extractSourceGroupFragment` from root context. The test file `supabase/functions/dialectic-worker/createJobContext.test.ts` needs RED tests that verify factory and slicer handle this new field correctly.
        *   `[✅]` 79.a.i. `createJobContext` factory is defined in `supabase/functions/dialectic-worker/createJobContext.ts` (see step 49.c for original implementation).
        *   `[✅]` 79.a.ii. `createExecuteJobContext` slicer is defined in the same file (see step 49.c).
        *   `[✅]` 79.a.iii. Test file `supabase/functions/dialectic-worker/createJobContext.test.ts` contains existing tests for factory and slicers.
    *   `[✅]` 79.b. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/createJobContext.test.ts`, add failing tests for `extractSourceGroupFragment` field.
        *   `[✅]` 79.b.i. Add test "createJobContext includes extractSourceGroupFragment from params": Create mock `JobContextParams` with `extractSourceGroupFragment: () => 'test-fragment'`, call `createJobContext(params)`, assert return value has `extractSourceGroupFragment` field, assert it equals the param value. This test must initially FAIL because factory doesn't include the field yet.
        *   `[✅]` 79.b.ii. Add test "createExecuteJobContext extracts extractSourceGroupFragment from root": Create mock root context with `extractSourceGroupFragment: () => 'test-fragment'`, call `createExecuteJobContext(root)`, assert return value has `extractSourceGroupFragment` field, assert it equals root value. This test must initially FAIL because slicer doesn't extract the field yet.
    *   `[✅]` 79.c. `[CRITERIA]` All requirements met: (1) RED tests exist that verify factory and slicer handle `extractSourceGroupFragment`, (2) Tests initially fail because factory/slicer don't include the field yet, (3) Tests follow existing patterns in the test file.

*   `[✅]` 80. **`[BE]` Update Factory and Slicer Implementation for extractSourceGroupFragment**
    *   `[✅]` 80.a. `[DEPS]` The factory function `createJobContext` must include `extractSourceGroupFragment: params.extractSourceGroupFragment` in its return object. The slicer function `createExecuteJobContext` must include `extractSourceGroupFragment: root.extractSourceGroupFragment` in its return object. This enables `extractSourceGroupFragment` to be available in `IExecuteJobContext` contexts passed to `executeModelCallAndSave`.
        *   `[✅]` 80.a.i. `createJobContext` factory return object is constructed at lines 18-64 in `supabase/functions/dialectic-worker/createJobContext.ts`.
        *   `[✅]` 80.a.ii. `createExecuteJobContext` slicer return object is constructed at lines 74-111 in the same file.
        *   `[✅]` 80.a.iii. The factory currently includes `getExtensionFromMimeType: params.getExtensionFromMimeType` (around line 48) and must follow the same pattern for `extractSourceGroupFragment`.
    *   `[✅]` 80.b. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/createJobContext.ts`, update factory and slicer.
        *   `[✅]` 80.b.i. In `createJobContext` factory, add `extractSourceGroupFragment: params.extractSourceGroupFragment` to the return object after `getExtensionFromMimeType` (around line 48, in the EXECUTE-specific utilities section).
        *   `[✅]` 80.b.ii. In `createExecuteJobContext` slicer, add `extractSourceGroupFragment: root.extractSourceGroupFragment` to the return object after `getExtensionFromMimeType` (around line 104, in the EXECUTE-specific utilities section).
    *   `[✅]` 80.c. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 79 and ensure they now pass.
        *   `[✅]` 80.c.i. Re-run test "createJobContext includes extractSourceGroupFragment from params" - should now pass.
        *   `[✅]` 80.c.ii. Re-run test "createExecuteJobContext extracts extractSourceGroupFragment from root" - should now pass.
    *   `[✅]` 80.d. `[LINT]` Run linter for `createJobContext.ts` and resolve any warnings or errors.
    *   `[✅]` 80.e. `[CRITERIA]` All requirements met: (1) Factory includes `extractSourceGroupFragment` from params, (2) Slicer extracts `extractSourceGroupFragment` from root, (3) All tests from step 79 pass, (4) File is lint-clean.

*   `[✅]` 81. **`[BE]` Update Application Boundary to Provide extractSourceGroupFragment**
    *   `[✅]` 81.a. `[DEPS]` The application boundary function `createDialecticWorkerDeps` in `supabase/functions/dialectic-worker/index.ts` constructs `IJobContext` by calling `createJobContext` factory with `JobContextParams`. It must provide `extractSourceGroupFragment` function in the params object so it can be passed through the factory to contexts. This function should import `extractSourceGroupFragment` from `path_utils.ts` and include it in the params.
        *   `[✅]` 81.a.i. `createDialecticWorkerDeps` function is defined in `supabase/functions/dialectic-worker/index.ts` (see step 50 for original implementation).
        *   `[✅]` 81.a.ii. The function currently imports `getExtensionFromMimeType` from `'../_shared/path_utils.ts'` (around line 23) and includes it in params (around line 119).
        *   `[✅]` 81.a.iii. `extractSourceGroupFragment` function exists in `supabase/functions/_shared/utils/path_utils.ts` (from step 68).
    *   `[✅]` 81.b. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/index.ts`, add `extractSourceGroupFragment` to application boundary.
        *   `[✅]` 81.b.i. Import `extractSourceGroupFragment` from `'../_shared/utils/path_utils.ts'` at the top of the file (add to existing import from path_utils.ts if present, or add new import line after `getExtensionFromMimeType` import).
        *   `[✅]` 81.b.ii. In `createDialecticWorkerDeps` function, add `extractSourceGroupFragment` to the `createJobContext` params object after `getExtensionFromMimeType` (around line 119), following the same pattern.
    *   `[✅]` 81.c. `[LINT]` Run linter for `index.ts` and resolve any warnings or errors.
    *   `[✅]` 81.d. `[CRITERIA]` All requirements met: (1) `extractSourceGroupFragment` is imported from `path_utils.ts`, (2) `extractSourceGroupFragment` is included in `createJobContext` params, (3) File is lint-clean, (4) Function is available in contexts passed to worker functions.

*   `[✅]` 82. **`[TEST-UNIT]` Update Mock Context for extractSourceGroupFragment**
    *   `[✅]` 82.a. `[DEPS]` The mock context factory `createMockJobContextParams` in `supabase/functions/dialectic-worker/JobContext.mock.ts` must include `extractSourceGroupFragment` field in the mock `JobContextParams` it returns. This ensures tests that use the mock context have access to `extractSourceGroupFragment` function.
        *   `[✅]` 82.a.i. `createMockJobContextParams` function is defined in `supabase/functions/dialectic-worker/JobContext.mock.ts`.
        *   `[✅]` 82.a.ii. The function currently includes `getExtensionFromMimeType: () => '.txt'` (around line 82) and must follow the same pattern for `extractSourceGroupFragment`.
        *   `[✅]` 82.a.iii. `extractSourceGroupFragment` function exists in `supabase/functions/_shared/utils/path_utils.ts` (from step 68).
    *   `[✅]` 82.b. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/JobContext.mock.ts`, add `extractSourceGroupFragment` to mock context.
        *   `[✅]` 82.b.i. Import `extractSourceGroupFragment` from `'../_shared/utils/path_utils.ts'` at the top of the file (or use the actual function implementation).
        *   `[✅]` 82.b.ii. In `createMockJobContextParams` function, add `extractSourceGroupFragment: extractSourceGroupFragment` (or `extractSourceGroupFragment: () => 'mock-fragment'` for a simple mock) to the return object after `getExtensionFromMimeType` (around line 82), following the same pattern.
    *   `[✅]` 82.c. `[LINT]` Run linter for `JobContext.mock.ts` and resolve any warnings or errors.
    *   `[✅]` 82.d. `[CRITERIA]` All requirements met: (1) Mock context includes `extractSourceGroupFragment` field, (2) Field is a function that can be called in tests, (3) File is lint-clean, (4) Tests using mock context can access `extractSourceGroupFragment`.

*   `[✅]` 83. **`[BE]` Fix document_renderer to use template_filename from RenderDocumentParams**
    *   `[✅]` 83.a. `[DEPS]` The `renderDocument` function in `supabase/functions/_shared/services/document_renderer.ts` currently references an undefined `templateName` variable at line 183 when querying `dialectic_document_templates`. The function receives `RenderDocumentParams` which must include `template_filename: string` extracted from the recipe step's `outputs_required.files_to_generate[]` array. The recipe step contains the canonical template filename (e.g., `"antithesis_business_case_critique.md"`) that must be used to query the database. The function depends on: (1) `RenderDocumentParams` interface in `supabase/functions/_shared/services/document_renderer.interface.ts` which must include `template_filename: string` field, (2) `renderDocument` function signature accepting `params: RenderDocumentParams` with the new field, (3) database query at line 183 using `params.template_filename` instead of undefined `templateName`.
    *   `[✅]` 83.b. `[TYPES]` Update `RenderDocumentParams` interface in `supabase/functions/_shared/services/document_renderer.interface.ts` to add `template_filename: string` field. This field contains the canonical template filename from the recipe step's `outputs_required.files_to_generate[]` array, matching the `file_name` in `dialectic_document_templates` table.
    *   `[✅]` 83.c. `[TEST-UNIT]` **RED**: In `supabase/functions/_shared/services/document_renderer.test.ts`, add failing unit test that proves `renderDocument` uses `params.template_filename` to query the database: (1) Create mock `RenderDocumentParams` with `template_filename: 'antithesis_business_case_critique.md'`, (2) Mock database query to `dialectic_document_templates` table filtering by `name` column, (3) Call `renderDocument` with the params, (4) Assert the database query uses `params.template_filename` as the filter value (not undefined `templateName`). This test must initially FAIL because the function currently references undefined `templateName`.
    *   `[✅]` 83.d. `[BE]` **GREEN**: In `supabase/functions/_shared/services/document_renderer.ts`, fix the database query to use `params.template_filename`: (1) At line 183, replace `.eq('name', templateName)` with `.eq('name', params.template_filename)`, (2) Remove any references to undefined `templateName` variable, (3) Verify the query correctly filters `dialectic_document_templates` by the `name` column using the template filename from params.
    *   `[✅]` 83.e. `[TEST-UNIT]` **GREEN**: Re-run unit test from step 83.c and verify it now passes, proving `renderDocument` correctly uses `params.template_filename` to query the database.
    *   `[✅]` 83.f. `[LINT]` Run linter for `document_renderer.ts`, `document_renderer.interface.ts`, and `document_renderer.test.ts`, resolve any warnings or errors.
    *   `[✅]` 83.g. `[CRITERIA]` All requirements met: (1) `RenderDocumentParams` interface includes `template_filename: string` field, (2) `renderDocument` function uses `params.template_filename` to query `dialectic_document_templates` table, (3) Database query correctly filters by `name` column using the template filename, (4) No undefined variable references remain, (5) Unit test passes proving correct template filename usage, (6) Files are lint-clean.
    *   `[✅]` 83.h. `[COMMIT]` `fix(be): use template_filename from RenderDocumentParams in document_renderer`

*   `[✅]` 84. **`[BE]` Fix processRenderJob to extract template_filename from RENDER job payload and pass to renderDocument**
    *   `[✅]` 84.a. `[DEPS]` The `processRenderJob` function in `supabase/functions/dialectic-worker/processRenderJob.ts` extracts fields from `DialecticRenderJobPayload` and constructs `RenderDocumentParams` to pass to `renderDocument`. The function depends on: (1) `DialecticRenderJobPayload` interface in `supabase/functions/dialectic-service/dialectic.interface.ts` which must include `template_filename: string` field, (2) Type guard `isDialecticRenderJobPayload` in `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.ts` which must validate `template_filename` field, (3) `processRenderJob` function extracting `template_filename` from job payload and including it in `RenderDocumentParams` construction (around line 55-63), (4) `renderDocument` function (from step 83) accepting `template_filename` in params.
    *   `[✅]` 84.b. `[TYPES]` Update `DialecticRenderJobPayload` interface in `supabase/functions/dialectic-service/dialectic.interface.ts` to add `template_filename: string` field. This field contains the canonical template filename extracted from the recipe step's `outputs_required.files_to_generate[]` array when the RENDER job is created.
        *   `[✅]` 84.b.i. `[TYPE-GUARD-TEST]` **RED**: In `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.test.ts` (or appropriate test file), add failing test that proves `isDialecticRenderJobPayload` validates `template_filename` field: (1) Create payload with all required fields including `template_filename: 'antithesis_business_case_critique.md'`, (2) Call `isDialecticRenderJobPayload(payload)`, (3) Assert returns `true`. (4) Create payload missing `template_filename`, (5) Call `isDialecticRenderJobPayload(payload)`, (6) Assert throws error or returns `false`. This test must initially FAIL because type guard doesn't validate `template_filename` yet.
        *   `[✅]` 84.b.ii. `[TYPE-GUARDS]` **GREEN**: In `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.ts`, update `isDialecticRenderJobPayload` type guard to validate `template_filename` field: (1) Add check for `'template_filename' in payload`, (2) Add check for `typeof payload.template_filename === 'string'`, (3) Add check for `payload.template_filename.trim() !== ''` (non-empty string), (4) Add `'template_filename'` to `allowedKeys` set, (5) Re-run type guard test from step 84.b.i and verify it passes.
    *   `[✅]` 84.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/processRenderJob.test.ts`, add failing unit test that proves `processRenderJob` extracts `template_filename` from payload and passes it to `renderDocument`: (1) Create mock RENDER job with payload containing `template_filename: 'antithesis_business_case_critique.md'`, (2) Mock `renderDocument` function, (3) Call `processRenderJob` with the job, (4) Assert `renderDocument` was called with `RenderDocumentParams` containing `template_filename: 'antithesis_business_case_critique.md'`. This test must initially FAIL because `processRenderJob` doesn't extract or pass `template_filename` yet.
    *   `[✅]` 84.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/processRenderJob.ts`, extract `template_filename` from payload and pass to `renderDocument`: (1) At line 24, add `template_filename` to destructured payload fields, (2) Add validation check for `template_filename` (non-empty string) similar to other required fields, (3) At line 55-63 where `RenderDocumentParams` is constructed, add `template_filename` field to the params object, (4) Verify `renderDocument` receives the `template_filename` in its params.
    *   `[✅]` 84.e. `[TEST-UNIT]` **GREEN**: Re-run unit test from step 84.c and verify it now passes, proving `processRenderJob` correctly extracts and passes `template_filename` to `renderDocument`.
    *   `[✅]` 84.f. `[LINT]` Run linter for `processRenderJob.ts`, `dialectic.interface.ts`, `type_guards.dialectic.ts`, and test files, resolve any warnings or errors.
    *   `[✅]` 84.g. `[CRITERIA]` All requirements met: (1) `DialecticRenderJobPayload` interface includes `template_filename: string` field, (2) Type guard `isDialecticRenderJobPayload` validates `template_filename` field, (3) `processRenderJob` extracts `template_filename` from job payload, (4) `processRenderJob` validates `template_filename` is a non-empty string, (5) `processRenderJob` includes `template_filename` in `RenderDocumentParams` passed to `renderDocument`, (6) Unit tests pass proving correct extraction and propagation, (7) Files are lint-clean.
    *   `[✅]` 84.h. `[COMMIT]` `fix(be): extract template_filename from RENDER job payload and pass to renderDocument`

*   `[✅]` 85. **`[BE]` Fix executeModelCallAndSave to query recipe step and extract template_filename for RENDER job payload**
    *   `[✅]` 85.a. `[DEPS]` The `executeModelCallAndSave` function in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` creates RENDER jobs at lines 1497-1525. When creating a RENDER job, the function must query the recipe step to extract `template_filename` from `outputs_required.files_to_generate[]` array. The function depends on: (1) Access to recipe step information via database query or job payload context, (2) `outputs_required.files_to_generate[]` array containing entries with `template_filename` and `from_document_key` fields, (3) Matching logic to find the entry where `from_document_key` equals the `documentKey` being rendered, (4) Extracting `template_filename` from the matched entry, (5) Including `template_filename` in `DialecticRenderJobPayload` construction (around line 1497), (6) `processRenderJob` (from step 84) accepting `template_filename` in payload, (7) `renderDocument` (from step 83) accepting `template_filename` in params.
    *   `[✅]` 85.b. `[TYPES]` No new types required. `DialecticRenderJobPayload` interface already includes `template_filename: string` (from step 84.b). The recipe step's `outputs_required.files_to_generate[]` structure is already defined in the database schema.
    *   `[✅]` 85.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.render.test.ts`, add failing unit test that proves `executeModelCallAndSave` queries recipe step and extracts `template_filename` for RENDER job payload: (1) Create EXECUTE job with `output_type: 'business_case'` (markdown document), (2) Mock database query to recipe step returning `outputs_required.files_to_generate: [{ from_document_key: 'business_case', template_filename: 'antithesis_business_case_critique.md' }]`, (3) Mock `shouldEnqueueRenderJob` to return `{ shouldRender: true, reason: 'is_markdown' }`, (4) Call `executeModelCallAndSave`, (5) Assert RENDER job is created with payload containing `template_filename: 'antithesis_business_case_critique.md'`. This test must initially FAIL because `executeModelCallAndSave` doesn't query recipe step or extract `template_filename` yet.
    *   `[✅]` 85.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, implement recipe step query and template filename extraction: (1) Before RENDER job creation (around line 1497), query the recipe step for the current stage using `sessionId`, `stageSlug`, and `iterationNumber` to get `outputs_required.files_to_generate[]` array, (2) Find the entry in `files_to_generate` array where `from_document_key` matches the `documentKey` being rendered, (3) Extract `template_filename` from the matched entry, (4) Validate `template_filename` is a non-empty string, (5) Add `template_filename` to `renderPayload` object construction (around line 1497-1508), (6) Handle error cases: if recipe step not found, if `files_to_generate` missing, if no matching entry found, throw descriptive error. **CRITICAL**: The recipe step query must use the same stage/iteration context as the EXECUTE job to ensure correct recipe instance is retrieved.
    *   `[✅]` 85.e. `[TEST-UNIT]` **GREEN**: Re-run unit test from step 85.c and verify it now passes. Add additional test cases: (1) Test error handling when recipe step not found, (2) Test error handling when `files_to_generate` array is missing, (3) Test error handling when no matching entry found for `documentKey`, (4) Test multiple entries in `files_to_generate` array to verify correct matching logic.
    *   `[✅]` 85.f. `[TEST-INT]` Prove template_filename extraction works end-to-end with real recipe data: (1) Create EXECUTE job for markdown document using real recipe from database, (2) Call `executeModelCallAndSave`, (3) Verify RENDER job is created with correct `template_filename` matching the recipe step's `outputs_required.files_to_generate[]` entry, (4) Process RENDER job via `processRenderJob`, (5) Verify `renderDocument` receives correct `template_filename` and successfully queries `dialectic_document_templates` table, (6) Verify document is rendered and saved correctly.
    *   `[✅]` 85.g. `[LINT]` Run linter for `executeModelCallAndSave.ts` and test files, resolve any warnings or errors.
    *   `[✅]` 85.h. `[CRITERIA]` All requirements met: (1) `executeModelCallAndSave` queries recipe step to get `outputs_required.files_to_generate[]` array, (2) Function correctly matches `from_document_key` to `documentKey` being rendered, (3) Function extracts `template_filename` from matched entry, (4) Function validates `template_filename` is a non-empty string, (5) RENDER job payload includes `template_filename` field, (6) Error handling for missing recipe step, missing `files_to_generate`, or no matching entry, (7) Unit tests pass proving correct extraction, (8) Integration test proves end-to-end flow works with real recipe data, (9) Files are lint-clean, (10) The fix ensures `document_renderer` always has the exact template filename from the recipe, eliminating guessing and ensuring correct database queries.
    *   `[✅]` 85.i. `[COMMIT]` `fix(be): query recipe step and extract template_filename for RENDER job payload in executeModelCallAndSave`

*   `[✅]` 86. **`[BE]` Fix `selectAnchorSourceDocument` to return result type distinguishing "no document inputs required" from "anchor not found"** Objective: recipe steps that define zero document-type inputs (e.g., THESIS stage steps consuming only `seed_prompt` or `header_context`) are VALID configurations - the function must return a result indicating "no anchor needed" rather than throwing an error. When no anchor is needed, no anchor is provided - we do not pick arbitrary fallbacks.
    *   `[✅]` 86.a. `[DEPS]` The current `selectAnchorSourceDocument` in `supabase/functions/dialectic-worker/strategies/helpers.ts` (lines 67-165) throws "No document-type inputs found in recipe step inputs_required" (line 83-85) when `inputs_required` contains zero entries with `type === 'document'`. This conflates two distinct conditions: (1) recipe legitimately defines zero document inputs (valid configuration for THESIS stage - proceed without anchor), (2) recipe defines document inputs but anchor not found in sourceDocs (runtime error). THESIS stage has 5 steps that all legitimately have zero document-type inputs - they consume only `seed_prompt` or `header_context`. All 6 planners (steps 88-93) unconditionally call this function and throw on every THESIS step.
        *   `[✅]` 86.a.i. `thesis_build_stage_header` (PLAN): `inputs_required` contains only `[{"type":"seed_prompt",...}]` - zero document inputs, valid configuration.
        *   `[✅]` 86.a.ii. `thesis_generate_business_case` (EXECUTE): `inputs_required` contains only `[{"type":"header_context",...}]` - zero document inputs, valid configuration.
        *   `[✅]` 86.a.iii. `thesis_generate_feature_spec`, `thesis_generate_technical_approach`, `thesis_generate_success_metrics` (EXECUTE): same pattern - only `header_context` input, zero document inputs.
        *   `[✅]` 86.a.iv. ANTITHESIS, SYNTHESIS, PARENTHESIS, PARALYSIS stages all have document-type inputs in their `inputs_required` and work correctly.
        *   `[✅]` 86.a.v. The function must distinguish: "recipe defines zero document inputs" (return result indicating no anchor needed) vs "recipe defines document inputs but anchor not found" (return result indicating error) vs "anchor found" (return result with document).
    *   `[✅]` 86.b. `[TYPES]` Add `SelectAnchorResult` discriminated union type to `supabase/functions/dialectic-service/dialectic.interface.ts`. The result type must clearly distinguish three outcomes: (1) `no_document_inputs_required` - recipe step legitimately has zero document-type inputs, planner proceeds without anchor (no fallbacks, no arbitrary selection), (2) `anchor_found` - recipe requires documents and anchor was successfully selected, (3) `anchor_not_found` - recipe requires documents but anchor not found in sourceDocs (runtime error condition).
        *   `[✅]` 86.b.i. Define type: `export type SelectAnchorResult = | { status: 'no_document_inputs_required' } | { status: 'anchor_found'; document: SourceDocument } | { status: 'anchor_not_found'; targetSlug: string; targetDocumentKey: string | undefined };`
    *   `[✅]` 86.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/helpers.test.ts`, update existing `selectAnchorSourceDocument` tests to expect `SelectAnchorResult` return type instead of `SourceDocument` or thrown errors for valid no-document-inputs cases.
        *   `[✅]` 86.c.i. Update test "selectAnchorSourceDocument selects highest-relevance document among required document inputs": assert `result.status === 'anchor_found'` AND `result.document` matches expected `business_case` document (highest relevance). This test must initially FAIL because function returns `SourceDocument` not `SelectAnchorResult`.
        *   `[✅]` 86.c.ii. Update test "selectAnchorSourceDocument ignores seed_prompt and feedback inputs when selecting anchor": assert `result.status === 'anchor_found'` AND `result.document` is the document (not seed_prompt). This test must initially FAIL.
        *   `[✅]` 86.c.iii. Keep test "selectAnchorSourceDocument throws when multiple documents have identical highest relevance": ambiguous selection remains a thrown error (programmer error in recipe definition). This test should still pass.
        *   `[✅]` 86.c.iv. Keep test "selectAnchorSourceDocument throws when required document input has no relevance score": missing relevance remains a thrown error (programmer error in recipe definition). This test should still pass.
        *   `[✅]` 86.c.v. **CRITICAL UPDATE**: Change test "selectAnchorSourceDocument throws when no document-type inputs exist in inputs_required" to instead assert `result.status === 'no_document_inputs_required'`. Zero document inputs is a VALID recipe configuration, not an error. This test must initially FAIL because function currently throws.
        *   `[✅]` 86.c.vi. Update test "selectAnchorSourceDocument throws when anchor document not found in sourceDocs": assert `result.status === 'anchor_not_found'` AND `result.targetSlug === 'thesis'` AND `result.targetDocumentKey === 'business_case'`. This test must initially FAIL because function currently throws instead of returning result.
        *   `[✅]` 86.c.vii. Update test "selectAnchorSourceDocument matches by stage and document_key or contribution_type": assert `result.status === 'anchor_found'` AND `result.document` matches expected doc. This test must initially FAIL.
        *   `[✅]` 86.c.viii. Add test "selectAnchorSourceDocument returns no_document_inputs_required for THESIS planner step with only seed_prompt input": create recipe step matching `thesis_build_stage_header` with `inputs_required: [{"type":"seed_prompt","slug":"thesis","document_key":"seed_prompt","required":true}]`, call `selectAnchorSourceDocument`, assert `result.status === 'no_document_inputs_required'`. This test must initially FAIL.
        *   `[✅]` 86.c.ix. Add test "selectAnchorSourceDocument returns no_document_inputs_required for THESIS execute step with only header_context input": create recipe step matching `thesis_generate_business_case` with `inputs_required: [{"type":"header_context","slug":"thesis","document_key":"header_context","required":true}]`, call `selectAnchorSourceDocument`, assert `result.status === 'no_document_inputs_required'`. This test must initially FAIL.
    *   `[✅]` 86.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/helpers.ts`, change `selectAnchorSourceDocument` to return `SelectAnchorResult` instead of `SourceDocument`, and return result objects instead of throwing for valid no-document-inputs and anchor-not-found cases.
        *   `[✅]` 86.d.i. Add import at top of file: `import { SelectAnchorResult } from '../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 86.d.ii. Change function signature from `): SourceDocument {` to `): SelectAnchorResult {` (line 70).
        *   `[✅]` 86.d.iii. Replace throw at lines 83-85 (`if (documentInputs.length === 0) { throw new Error('No document-type inputs found...') }`) with `return { status: 'no_document_inputs_required' };` - this is the critical fix for THESIS stage.
        *   `[✅]` 86.d.iv. Replace throw at lines 162-164 (`throw new Error('Anchor document not found in sourceDocs...')`) with `return { status: 'anchor_not_found', targetSlug: targetSlug, targetDocumentKey: targetDocumentKey };`
        *   `[✅]` 86.d.v. Replace `return doc;` at line 156 with `return { status: 'anchor_found', document: doc };`
        *   `[✅]` 86.d.vi. Keep existing throws for programmer errors: "Ambiguous anchor selection" (line 134-136) and "Missing relevance score" (line 115) remain as thrown errors since they indicate invalid recipe configuration.
    *   `[✅]` 86.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 86.c and ensure they now pass. The tests prove: (1) highest-relevance document returns `anchor_found` with correct document, (2) seed_prompt/feedback excluded returns `anchor_found` with document, (3) relevance ties still throw errors, (4) missing relevance still throws errors, (5) **zero document inputs returns `no_document_inputs_required`** (critical fix), (6) anchor not found returns `anchor_not_found` with target info, (7) stage + document_key matching returns `anchor_found`, (8) THESIS planner step returns `no_document_inputs_required`, (9) THESIS execute step returns `no_document_inputs_required`.
    *   `[✅]` 86.f. `[LINT]` Run linter for `helpers.ts`, `helpers.test.ts`, and `dialectic.interface.ts`, resolve any warnings or errors.
    *   `[✅]` 86.g. `[CRITERIA]` All requirements met: (1) Function returns `SelectAnchorResult` discriminated union, (2) Zero document-type inputs returns `{ status: 'no_document_inputs_required' }` instead of throwing (critical fix for THESIS stage), (3) Anchor found returns `{ status: 'anchor_found', document }`, (4) Anchor not found returns `{ status: 'anchor_not_found', targetSlug, targetDocumentKey }`, (5) Programmer errors (ambiguous selection, missing relevance) still throw, (6) All unit tests pass including new THESIS-specific tests, (7) Files are lint-clean, (8) Planners will need updates (steps 87-93) to handle the new return type.
    *   `[✅]` 86.h. `[COMMIT]` `fix(be): return SelectAnchorResult from selectAnchorSourceDocument to support recipe steps without document inputs`

*   `[✅]` 87. **`[BE]` Fix `createCanonicalPathParams` to accept `anchorDoc: SourceDocument | null` and handle null anchor for recipe steps without document inputs** Objective: support recipe steps that have zero document-type inputs (THESIS stage) by accepting null anchor. When anchor is null, `sourceAnchorModelSlug` and `sourceAttemptCount` are simply not populated - there is no anchor, so there are no anchor-derived values. Also universally derive `sourceAnchorModelSlug` from filename deconstruction (not model_name) when anchor IS provided.
    *   `[✅]` 87.a. `[DEPS]` `createCanonicalPathParams` in `supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts` (line 14) currently requires `anchorDoc: SourceDocument` as a non-null parameter. After step 86, `selectAnchorSourceDocument` returns `SelectAnchorResult` which may indicate `no_document_inputs_required` - in this case, planners will pass `null` for anchorDoc. The function must handle null anchor by simply not populating anchor-derived fields (`sourceAnchorModelSlug`, `sourceAttemptCount`) - there is no fallback, no arbitrary selection, just no anchor.
        *   `[✅]` 87.a.i. Current signature (line 14): `export function createCanonicalPathParams(sourceDocs: SourceDocument[], outputType: string, anchorDoc: SourceDocument, stageSlug: string): CanonicalPathParams`
        *   `[✅]` 87.a.ii. When `anchorDoc` is null (recipe has no document inputs), the function leaves `sourceAnchorModelSlug` as undefined and `sourceAttemptCount` as undefined or 0 - there is no anchor to derive values from.
        *   `[✅]` 87.a.iii. `deconstructStoragePath` from `supabase/functions/_shared/utils/path_deconstructor.ts` provides universal filename parsing for non-null anchors.
        *   `[✅]` 87.a.iv. Existing tests in `canonical_context_builder.test.ts` expect filename-based extraction for thesis documents used as antithesis HeaderContext anchors - these tests remain valid for non-null anchor cases.
    *   `[✅]` 87.b. `[TYPES]` Update function signature to accept `anchorDoc: SourceDocument | null`. No new types required beyond signature change.
    *   `[✅]` 87.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/canonical_context_builder.test.ts`, add tests for null anchor handling and ensure existing tests continue to pass.
        *   `[✅]` 87.c.i. Add test "createCanonicalPathParams handles null anchorDoc by leaving sourceAnchorModelSlug undefined": call `createCanonicalPathParams(sourceDocs, 'thesis', null, 'thesis')`, assert `sourceAnchorModelSlug === undefined` (not derived from any fallback). This test must initially FAIL because function requires non-null anchorDoc.
        *   `[✅]` 87.c.ii. Add test "createCanonicalPathParams handles null anchorDoc with empty sourceDocs array": call `createCanonicalPathParams([], 'thesis', null, 'thesis')`, assert returns valid CanonicalPathParams with `sourceAnchorModelSlug` undefined (not throwing). This test must initially FAIL.
        *   `[✅]` 87.c.iii. Add test "createCanonicalPathParams handles null anchorDoc for THESIS stage": create sourceDocs representing seed_prompt contribution, call with null anchor, assert function does not throw and `sourceAnchorModelSlug` is undefined. This test must initially FAIL.
        *   `[✅]` 87.c.iv. Existing test "createCanonicalPathParams extracts sourceAnchorModelSlug from rendered document filename when creating HeaderContext for antithesis stage even when model_name exists" should continue to pass for non-null anchor cases.
        *   `[✅]` 87.c.v. Existing test "createCanonicalPathParams extracts sourceAnchorModelSlug from filename when creating HeaderContext for antithesis stage even when model_name exists" should continue to pass.
        *   `[✅]` 87.c.vi. Existing test "createCanonicalPathParams extracts sourceAnchorModelSlug from filename for thesis document anchor regardless of output type" should continue to pass.
        *   `[✅]` 87.c.vii. Existing test "createCanonicalPathParams extracts sourceAttemptCount from filename when attempt_count field is missing" should continue to pass.
        *   `[✅]` 87.c.viii. Update test "createCanonicalPathParams throws error when anchor document missing storage_path or file_name" to only apply when anchorDoc is non-null. When anchorDoc is null, no error should be thrown - there's simply no anchor.
    *   `[✅]` 87.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/canonical_context_builder.ts`, update `createCanonicalPathParams` to accept and handle null anchor.
        *   `[✅]` 87.d.i. Change function signature (line 14) from `anchorDoc: SourceDocument` to `anchorDoc: SourceDocument | null`.
        *   `[✅]` 87.d.ii. Add null check at start of anchor processing block (around line 85): `if (anchorDoc === null) { /* leave sourceAnchorModelSlug and sourceAttemptCount undefined - no anchor means no anchor-derived values */ }`.
        *   `[✅]` 87.d.iii. When `anchorDoc` is null: set `sourceAnchorModelSlug` to undefined (or omit from result). Do NOT attempt any fallback derivation - there is no anchor.
        *   `[✅]` 87.d.iv. When `anchorDoc` is null: set `sourceAttemptCount` to undefined or 0 - there is no anchor to derive it from.
        *   `[✅]` 87.d.v. When `anchorDoc` is non-null: preserve existing universal filename deconstruction logic that extracts `sourceAnchorModelSlug` from `anchorDoc.file_name` (not `model_name`).
        *   `[✅]` 87.d.vi. Ensure the logic handles critiquing patterns correctly when anchorDoc is non-null: when `deconstructed.sourceAnchorModelSlug` exists (antithesis critiquing pattern), use it; otherwise use `deconstructed.modelSlug`.
    *   `[✅]` 87.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 87.c and ensure they now pass. The tests prove: (1) null anchorDoc leaves sourceAnchorModelSlug undefined (no fallback), (2) null anchorDoc with empty sourceDocs doesn't throw, (3) null anchorDoc for THESIS stage works correctly, (4) non-null anchorDoc filename extraction still works, (5) critiquing patterns still work.
    *   `[✅]` 87.f. `[LINT]` Run linter for `canonical_context_builder.ts` and `canonical_context_builder.test.ts`, resolve any warnings or errors.
    *   `[✅]` 87.g. `[CRITERIA]` All requirements met: (1) Function signature accepts `anchorDoc: SourceDocument | null`, (2) Null anchor leaves sourceAnchorModelSlug undefined - no fallback derivation, (3) Null anchor with empty sourceDocs returns valid result without throwing, (4) Non-null anchor still uses filename deconstruction for sourceAnchorModelSlug, (5) All unit tests pass including new null-anchor tests, (6) Files are lint-clean, (7) Function supports THESIS stage where no anchor document exists.
    *   `[✅]` 87.h. `[COMMIT]` `fix(be): accept null anchorDoc in createCanonicalPathParams for recipe steps without document inputs`

*   `[✅]` 88. **`[BE]` Update `planPerSourceDocumentByLineage` to handle `SelectAnchorResult` from `selectAnchorSourceDocument`** Objective: handle the three result statuses - `no_document_inputs_required` (pass null to createCanonicalPathParams), `anchor_found` (use anchor document), `anchor_not_found` (throw error).
    *   `[✅]` 88.a. `[DEPS]` `planPerSourceDocumentByLineage` in `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts` currently calls `selectAnchorSourceDocument` and assigns result directly to `anchorForCanonicalPathParams: SourceDocument`. After step 86, the return type is `SelectAnchorResult`, causing type errors. The planner must check the result status and handle each case appropriately.
        *   `[✅]` 88.a.i. For `no_document_inputs_required`: pass `null` to `createCanonicalPathParams` - there is no anchor because the recipe doesn't require one.
        *   `[✅]` 88.a.ii. For `anchor_found`: extract `result.document` and pass to `createCanonicalPathParams`.
        *   `[✅]` 88.a.iii. For `anchor_not_found`: throw descriptive error with `targetSlug` and `targetDocumentKey` from result.
    *   `[✅]` 88.b. `[TYPES]` Add import for `SelectAnchorResult` from `dialectic.interface.ts`.
    *   `[✅]` 88.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts`, add tests for handling `SelectAnchorResult` statuses.
        *   `[✅]` 88.c.i. Add test "planPerSourceDocumentByLineage handles no_document_inputs_required by passing null anchor to createCanonicalPathParams": create THESIS-like recipe step with only `seed_prompt` or `header_context` inputs (no document inputs), call planner, assert child job is created successfully with `canonicalPathParams.sourceAnchorModelSlug === undefined`. This test must initially FAIL because planner doesn't handle `SelectAnchorResult`.
        *   `[✅]` 88.c.ii. Add test "planPerSourceDocumentByLineage handles anchor_found by using result.document": create recipe step with document inputs and relevance, call planner, assert `canonicalPathParams.sourceAnchorModelSlug` matches the highest-relevance document. This test must initially FAIL.
        *   `[✅]` 88.c.iii. Add test "planPerSourceDocumentByLineage throws on anchor_not_found": create recipe step requiring document that doesn't exist in sourceDocs, call planner, assert throws error containing target slug and document key. This test must initially FAIL.
    *   `[✅]` 88.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`, update to handle `SelectAnchorResult`.
        *   `[✅]` 88.d.i. Add import: `import { SelectAnchorResult } from '../../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 88.d.ii. In PLAN branch, replace `const anchorForCanonicalPathParams = selectAnchorSourceDocument(recipeStep, groupDocs);` with result handling: `const anchorResult = selectAnchorSourceDocument(recipeStep, groupDocs); if (anchorResult.status === 'anchor_not_found') { throw new Error(\`Anchor document not found for stage '\${anchorResult.targetSlug}' document_key '\${anchorResult.targetDocumentKey}'\`); } const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;`
        *   `[✅]` 88.d.iii. In EXECUTE branch, apply same pattern for handling `SelectAnchorResult`.
        *   `[✅]` 88.d.iv. Update `createCanonicalPathParams` calls to pass `anchorForCanonicalPathParams` which may now be `null` (handled by step 87).
    *   `[✅]` 88.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 88.c and ensure they now pass. The tests prove: (1) `no_document_inputs_required` passes null anchor, (2) `anchor_found` uses result.document, (3) `anchor_not_found` throws descriptive error.
    *   `[✅]` 88.f. `[LINT]` Run linter for `planPerSourceDocumentByLineage.ts` and `planPerSourceDocumentByLineage.test.ts`, resolve any warnings or errors.
    *   `[✅]` 88.g. `[CRITERIA]` All requirements met: (1) Planner handles all three `SelectAnchorResult` statuses, (2) `no_document_inputs_required` passes null to createCanonicalPathParams (no fallback), (3) `anchor_found` extracts and uses document, (4) `anchor_not_found` throws with useful error message, (5) All unit tests pass, (6) Files are lint-clean, (7) THESIS stage works correctly (no anchor needed).
    *   `[✅]` 88.h. `[COMMIT]` `fix(be): handle SelectAnchorResult in planPerSourceDocumentByLineage`

*   `[✅]` 89. **`[BE]` Update `planAllToOne` to handle `SelectAnchorResult` from `selectAnchorSourceDocument`** Objective: handle the three result statuses - `no_document_inputs_required` (pass null to createCanonicalPathParams), `anchor_found` (use anchor document), `anchor_not_found` (throw error).
    *   `[✅]` 89.a. `[DEPS]` `planAllToOne` in `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts` currently calls `selectAnchorSourceDocument` and assigns result directly to `anchorForCanonicalPathParams: SourceDocument`. After step 86, the return type is `SelectAnchorResult`, causing type errors. The planner must check the result status and handle each case appropriately.
        *   `[✅]` 89.a.i. For `no_document_inputs_required`: pass `null` to `createCanonicalPathParams` - there is no anchor because the recipe doesn't require one.
        *   `[✅]` 89.a.ii. For `anchor_found`: extract `result.document` and pass to `createCanonicalPathParams`.
        *   `[✅]` 89.a.iii. For `anchor_not_found`: throw descriptive error with `targetSlug` and `targetDocumentKey` from result.
    *   `[✅]` 89.b. `[TYPES]` Add import for `SelectAnchorResult` from `dialectic.interface.ts`.
    *   `[✅]` 89.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts`, add tests for handling `SelectAnchorResult` statuses.
        *   `[✅]` 89.c.i. Add test "planAllToOne handles no_document_inputs_required by passing null anchor to createCanonicalPathParams": create THESIS-like recipe step with only `seed_prompt` or `header_context` inputs (no document inputs), call planner, assert child job is created successfully with `canonicalPathParams.sourceAnchorModelSlug === undefined`. This test must initially FAIL.
        *   `[✅]` 89.c.ii. Add test "planAllToOne handles anchor_found by using result.document": create recipe step with document inputs and relevance, call planner, assert `canonicalPathParams.sourceAnchorModelSlug` matches the highest-relevance document. This test must initially FAIL.
        *   `[✅]` 89.c.iii. Add test "planAllToOne throws on anchor_not_found": create recipe step requiring document that doesn't exist in sourceDocs, call planner, assert throws error containing target slug and document key. This test must initially FAIL.
    *   `[✅]` 89.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts`, update to handle `SelectAnchorResult`.
        *   `[✅]` 89.d.i. Add import: `import { SelectAnchorResult } from '../../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 89.d.ii. In PLAN branch, replace direct assignment with result handling: `const anchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs); if (anchorResult.status === 'anchor_not_found') { throw new Error(\`Anchor document not found for stage '\${anchorResult.targetSlug}' document_key '\${anchorResult.targetDocumentKey}'\`); } const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;`
        *   `[✅]` 89.d.iii. In EXECUTE branch, apply same pattern for handling `SelectAnchorResult`.
        *   `[✅]` 89.d.iv. Update `createCanonicalPathParams` calls to pass `anchorForCanonicalPathParams` which may now be `null` (handled by step 87).
    *   `[✅]` 89.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 89.c and ensure they now pass.
    *   `[✅]` 89.f. `[LINT]` Run linter for `planAllToOne.ts` and `planAllToOne.test.ts`, resolve any warnings or errors.
    *   `[✅]` 89.g. `[CRITERIA]` All requirements met: (1) Planner handles all three `SelectAnchorResult` statuses, (2) `no_document_inputs_required` passes null to createCanonicalPathParams (no fallback), (3) `anchor_found` extracts and uses document, (4) `anchor_not_found` throws with useful error message, (5) All unit tests pass, (6) Files are lint-clean, (7) THESIS stage works correctly (no anchor needed).
    *   `[✅]` 89.h. `[COMMIT]` `fix(be): handle SelectAnchorResult in planAllToOne`

*   `[✅]` 90. **`[BE]` Update `planPerSourceGroup` to handle `SelectAnchorResult` from `selectAnchorSourceDocument`** Objective: handle the three result statuses - `no_document_inputs_required` (pass null to createCanonicalPathParams), `anchor_found` (use anchor document), `anchor_not_found` (throw error).
    *   `[✅]` 90.a. `[DEPS]` `planPerSourceGroup` in `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts` currently calls `selectAnchorSourceDocument` and assigns result directly to `anchorForCanonicalPathParams: SourceDocument`. After step 86, the return type is `SelectAnchorResult`, causing type errors. The planner must check the result status and handle each case appropriately.
        *   `[✅]` 90.a.i. For `no_document_inputs_required`: pass `null` to `createCanonicalPathParams` - there is no anchor because the recipe doesn't require one.
        *   `[✅]` 90.a.ii. For `anchor_found`: extract `result.document` and pass to `createCanonicalPathParams`.
        *   `[✅]` 90.a.iii. For `anchor_not_found`: throw descriptive error with `targetSlug` and `targetDocumentKey` from result.
    *   `[✅]` 90.b. `[TYPES]` Add import for `SelectAnchorResult` from `dialectic.interface.ts`.
    *   `[✅]` 90.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts`, add tests for handling `SelectAnchorResult` statuses.
        *   `[✅]` 90.c.i. Add test "planPerSourceGroup handles no_document_inputs_required by passing null anchor to createCanonicalPathParams": create THESIS-like recipe step with only `seed_prompt` or `header_context` inputs (no document inputs), call planner, assert child job is created successfully with `canonicalPathParams.sourceAnchorModelSlug === undefined`. This test must initially FAIL.
        *   `[✅]` 90.c.ii. Add test "planPerSourceGroup handles anchor_found by using result.document": create recipe step with document inputs and relevance, call planner, assert `canonicalPathParams.sourceAnchorModelSlug` matches the highest-relevance document. This test must initially FAIL.
        *   `[✅]` 90.c.iii. Add test "planPerSourceGroup throws on anchor_not_found": create recipe step requiring document that doesn't exist in sourceDocs, call planner, assert throws error containing target slug and document key. This test must initially FAIL.
    *   `[✅]` 90.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts`, update to handle `SelectAnchorResult`.
        *   `[✅]` 90.d.i. Add import: `import { SelectAnchorResult } from '../../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 90.d.ii. In EXECUTE branch, replace direct assignment with result handling: `const anchorResult = selectAnchorSourceDocument(recipeStep, groupDocs); if (anchorResult.status === 'anchor_not_found') { throw new Error(\`Anchor document not found for stage '\${anchorResult.targetSlug}' document_key '\${anchorResult.targetDocumentKey}'\`); } const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;`
        *   `[✅]` 90.d.iii. Update `createCanonicalPathParams` call to pass `anchorForCanonicalPathParams` which may now be `null` (handled by step 87).
    *   `[✅]` 90.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 90.c and ensure they now pass.
    *   `[✅]` 90.f. `[LINT]` Run linter for `planPerSourceGroup.ts` and `planPerSourceGroup.test.ts`, resolve any warnings or errors.
    *   `[✅]` 90.g. `[CRITERIA]` All requirements met: (1) Planner handles all three `SelectAnchorResult` statuses, (2) `no_document_inputs_required` passes null to createCanonicalPathParams (no fallback), (3) `anchor_found` extracts and uses document, (4) `anchor_not_found` throws with useful error message, (5) All unit tests pass, (6) Files are lint-clean, (7) THESIS stage works correctly (no anchor needed).
    *   `[✅]` 90.h. `[COMMIT]` `fix(be): handle SelectAnchorResult in planPerSourceGroup`

*   `[✅]` 91. **`[BE]` Update `planPerModel` to handle `SelectAnchorResult` from `selectAnchorSourceDocument`** Objective: handle the three result statuses - `no_document_inputs_required` (pass null to createCanonicalPathParams), `anchor_found` (use anchor document), `anchor_not_found` (throw error).
    *   `[✅]` 91.a. `[DEPS]` `planPerModel` in `supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts` currently calls `selectAnchorSourceDocument` and assigns result directly to `anchorForCanonicalPathParams: SourceDocument`. After step 86, the return type is `SelectAnchorResult`, causing type errors. The planner must check the result status and handle each case appropriately.
        *   `[✅]` 91.a.i. For `no_document_inputs_required`: pass `null` to `createCanonicalPathParams` - there is no anchor because the recipe doesn't require one.
        *   `[✅]` 91.a.ii. For `anchor_found`: extract `result.document` and pass to `createCanonicalPathParams`.
        *   `[✅]` 91.a.iii. For `anchor_not_found`: throw descriptive error with `targetSlug` and `targetDocumentKey` from result.
    *   `[✅]` 91.b. `[TYPES]` Add import for `SelectAnchorResult` from `dialectic.interface.ts`.
    *   `[✅]` 91.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerModel.test.ts`, add tests for handling `SelectAnchorResult` statuses.
        *   `[✅]` 91.c.i. Add test "planPerModel handles no_document_inputs_required by passing null anchor to createCanonicalPathParams": create THESIS-like recipe step with only `seed_prompt` or `header_context` inputs (no document inputs), call planner, assert child job is created successfully with `canonicalPathParams.sourceAnchorModelSlug === undefined`. This test must initially FAIL.
        *   `[✅]` 91.c.ii. Add test "planPerModel handles anchor_found by using result.document": create recipe step with document inputs and relevance, call planner, assert `canonicalPathParams.sourceAnchorModelSlug` matches the highest-relevance document. This test must initially FAIL.
        *   `[✅]` 91.c.iii. Add test "planPerModel throws on anchor_not_found": create recipe step requiring document that doesn't exist in sourceDocs, call planner, assert throws error containing target slug and document key. This test must initially FAIL.
    *   `[✅]` 91.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerModel.ts`, update to handle `SelectAnchorResult`.
        *   `[✅]` 91.d.i. Add import: `import { SelectAnchorResult } from '../../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 91.d.ii. In EXECUTE branch, replace direct assignment with result handling: `const anchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs); if (anchorResult.status === 'anchor_not_found') { throw new Error(\`Anchor document not found for stage '\${anchorResult.targetSlug}' document_key '\${anchorResult.targetDocumentKey}'\`); } const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;`
        *   `[✅]` 91.d.iii. Update `createCanonicalPathParams` call to pass `anchorForCanonicalPathParams` which may now be `null` (handled by step 87).
    *   `[✅]` 91.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 91.c and ensure they now pass.
    *   `[✅]` 91.f. `[LINT]` Run linter for `planPerModel.ts` and `planPerModel.test.ts`, resolve any warnings or errors.
    *   `[✅]` 91.g. `[CRITERIA]` All requirements met: (1) Planner handles all three `SelectAnchorResult` statuses, (2) `no_document_inputs_required` passes null to createCanonicalPathParams (no fallback), (3) `anchor_found` extracts and uses document, (4) `anchor_not_found` throws with useful error message, (5) All unit tests pass, (6) Files are lint-clean, (7) THESIS stage works correctly (no anchor needed).
    *   `[✅]` 91.h. `[COMMIT]` `fix(be): handle SelectAnchorResult in planPerModel`

*   `[✅]` 92. **`[BE]` Update `planPerSourceDocument` to handle `SelectAnchorResult` from `selectAnchorSourceDocument`** Objective: handle the three result statuses - `no_document_inputs_required` (pass null to createCanonicalPathParams), `anchor_found` (use anchor document), `anchor_not_found` (throw error).
    *   `[✅]` 92.a. `[DEPS]` `planPerSourceDocument` in `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts` currently calls `selectAnchorSourceDocument` and assigns result directly to `anchorForCanonicalPathParams: SourceDocument`. After step 86, the return type is `SelectAnchorResult`, causing type errors. The planner must check the result status and handle each case appropriately.
        *   `[✅]` 92.a.i. For `no_document_inputs_required`: pass `null` to `createCanonicalPathParams` - there is no anchor because the recipe doesn't require one.
        *   `[✅]` 92.a.ii. For `anchor_found`: extract `result.document` and pass to `createCanonicalPathParams`.
        *   `[✅]` 92.a.iii. For `anchor_not_found`: throw descriptive error with `targetSlug` and `targetDocumentKey` from result.
    *   `[✅]` 92.b. `[TYPES]` Add import for `SelectAnchorResult` from `dialectic.interface.ts`.
    *   `[✅]` 92.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts`, add tests for handling `SelectAnchorResult` statuses.
        *   `[✅]` 92.c.i. Add test "planPerSourceDocument handles no_document_inputs_required by passing null anchor to createCanonicalPathParams": create THESIS-like recipe step with only `seed_prompt` or `header_context` inputs (no document inputs), call planner, assert child job is created successfully with `canonicalPathParams.sourceAnchorModelSlug === undefined`. This test must initially FAIL.
        *   `[✅]` 92.c.ii. Add test "planPerSourceDocument handles anchor_found by using result.document": create recipe step with document inputs and relevance, call planner, assert `canonicalPathParams.sourceAnchorModelSlug` matches the highest-relevance document. This test must initially FAIL.
        *   `[✅]` 92.c.iii. Add test "planPerSourceDocument throws on anchor_not_found": create recipe step requiring document that doesn't exist in sourceDocs, call planner, assert throws error containing target slug and document key. This test must initially FAIL.
    *   `[✅]` 92.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts`, update to handle `SelectAnchorResult`.
        *   `[✅]` 92.d.i. Add import: `import { SelectAnchorResult } from '../../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 92.d.ii. In EXECUTE branch before loop, replace direct assignment with result handling: `const anchorResult = selectAnchorSourceDocument(recipeStep, sourceDocs); if (anchorResult.status === 'anchor_not_found') { throw new Error(\`Anchor document not found for stage '\${anchorResult.targetSlug}' document_key '\${anchorResult.targetDocumentKey}'\`); } const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;`
        *   `[✅]` 92.d.iii. Update `createCanonicalPathParams` calls in loop to pass `anchorForCanonicalPathParams` which may now be `null` (handled by step 87).
    *   `[✅]` 92.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 92.c and ensure they now pass.
    *   `[✅]` 92.f. `[LINT]` Run linter for `planPerSourceDocument.ts` and `planPerSourceDocument.test.ts`, resolve any warnings or errors.
    *   `[✅]` 92.g. `[CRITERIA]` All requirements met: (1) Planner handles all three `SelectAnchorResult` statuses, (2) `no_document_inputs_required` passes null to createCanonicalPathParams (no fallback), (3) `anchor_found` extracts and uses document, (4) `anchor_not_found` throws with useful error message, (5) All unit tests pass, (6) Files are lint-clean, (7) THESIS stage works correctly (no anchor needed).
    *   `[✅]` 92.h. `[COMMIT]` `fix(be): handle SelectAnchorResult in planPerSourceDocument`

*   `[✅]` 93. **`[BE]` Update `planPairwiseByOrigin` to handle `SelectAnchorResult` from `selectAnchorSourceDocument`** Objective: handle the three result statuses - `no_document_inputs_required` (pass null to createCanonicalPathParams), `anchor_found` (use anchor document), `anchor_not_found` (throw error).
    *   `[✅]` 93.a. `[DEPS]` `planPairwiseByOrigin` in `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts` currently calls `selectAnchorSourceDocument` and assigns result directly to `anchorForCanonicalPathParams: SourceDocument`. After step 86, the return type is `SelectAnchorResult`, causing type errors. The planner must check the result status and handle each case appropriately.
        *   `[✅]` 93.a.i. For `no_document_inputs_required`: pass `null` to `createCanonicalPathParams` - there is no anchor because the recipe doesn't require one.
        *   `[✅]` 93.a.ii. For `anchor_found`: extract `result.document` and pass to `createCanonicalPathParams`.
        *   `[✅]` 93.a.iii. For `anchor_not_found`: throw descriptive error with `targetSlug` and `targetDocumentKey` from result.
    *   `[✅]` 93.b. `[TYPES]` Add import for `SelectAnchorResult` from `dialectic.interface.ts`.
    *   `[✅]` 93.c. `[TEST-UNIT]` **RED**: In `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.test.ts`, add tests for handling `SelectAnchorResult` statuses.
        *   `[✅]` 93.c.i. Add test "planPairwiseByOrigin handles no_document_inputs_required by passing null anchor to createCanonicalPathParams": create THESIS-like recipe step with only `seed_prompt` or `header_context` inputs (no document inputs), call planner, assert child job is created successfully with `canonicalPathParams.sourceAnchorModelSlug === undefined`. This test must initially FAIL.
        *   `[✅]` 93.c.ii. Add test "planPairwiseByOrigin handles anchor_found by using result.document": create recipe step with document inputs and relevance, call planner, assert `canonicalPathParams.sourceAnchorModelSlug` matches the highest-relevance document from pair. This test must initially FAIL.
        *   `[✅]` 93.c.iii. Add test "planPairwiseByOrigin throws on anchor_not_found": create recipe step requiring document that doesn't exist in pair, call planner, assert throws error containing target slug and document key. This test must initially FAIL.
    *   `[✅]` 93.d. `[BE]` **GREEN**: In `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts`, update to handle `SelectAnchorResult`.
        *   `[✅]` 93.d.i. Add import: `import { SelectAnchorResult } from '../../../dialectic-service/dialectic.interface.ts';`
        *   `[✅]` 93.d.ii. In EXECUTE branch after defining pair array, replace direct assignment with result handling: `const anchorResult = selectAnchorSourceDocument(recipeStep, pair); if (anchorResult.status === 'anchor_not_found') { throw new Error(\`Anchor document not found for stage '\${anchorResult.targetSlug}' document_key '\${anchorResult.targetDocumentKey}'\`); } const anchorForCanonicalPathParams = anchorResult.status === 'anchor_found' ? anchorResult.document : null;`
        *   `[✅]` 93.d.iii. Update `createCanonicalPathParams` call to pass `anchorForCanonicalPathParams` which may now be `null` (handled by step 87).
    *   `[✅]` 93.e. `[TEST-UNIT]` **GREEN**: Re-run all tests from step 93.c and ensure they now pass.
    *   `[✅]` 93.f. `[LINT]` Run linter for `planPairwiseByOrigin.ts` and `planPairwiseByOrigin.test.ts`, resolve any warnings or errors.
    *   `[✅]` 93.g. `[CRITERIA]` All requirements met: (1) Planner handles all three `SelectAnchorResult` statuses, (2) `no_document_inputs_required` passes null to createCanonicalPathParams (no fallback), (3) `anchor_found` extracts and uses document, (4) `anchor_not_found` throws with useful error message, (5) All unit tests pass, (6) Files are lint-clean, (7) THESIS stage works correctly (no anchor needed).
    *   `[✅]` 93.h. `[COMMIT]` `fix(be): handle SelectAnchorResult in planPairwiseByOrigin`