*   `[ ]` 36. **[RESEARCH]** Investigate RENDER Job Silent Failure in executeModelCallAndSave
    *   `[ ]`   36.a. [DEPS] Research dependencies and current error handling flow
        *   `[✅]` 36.a.i. `executeModelCallAndSave()` in `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` lines 1328-1425 contains try-catch block that swallows exceptions during RENDER job enqueueing
            *   `[✅]` 36.a.i.A. **Three Distinct Failure Points Identified:**
                *   `[✅]` 36.a.i.A.1. **Point A (line 1331):** `shouldEnqueueRenderJob({ dbClient }, { outputType: output_type, stageSlug })` query can fail due to database errors
                *   `[✅]` 36.a.i.A.2. **Point B (lines 1336-1396):** Multiple validation throws for missing/invalid required fields (validatedDocumentKey, documentIdentity, contribution.id, type guard validations)
                *   `[✅]` 36.a.i.A.3. **Point C (lines 1410-1421):** Database insert `dbClient.from('dialectic_generation_jobs').insert(insertObj)` can fail for constraint violations, RLS policy rejections, or permission errors
            *   `[✅]` 36.a.i.B. **Inconsistent Error Handling Pattern:**
                *   `[✅]` 36.a.i.B.1. Lines 1336-1396 throw errors for validation failures (programmer errors - should fail fast)
                *   `[✅]` 36.a.i.B.2. Lines 1416-1421 check `renderInsertError` but only log error, do NOT throw (silent failure for database errors)
                *   `[✅]` 36.a.i.B.3. Try-catch at lines 1423-1425 catches ALL exceptions (both validation and database errors) and swallows them with only logging
                *   `[✅]` 36.a.i.B.4. Function continues to line 1427+ as if RENDER job was successfully enqueued, no error propagation to caller
            *   `[✅]` 36.a.i.C. **Root Cause Analysis:**
                *   `[✅]` 36.a.i.C.1. Validation errors (Point B) are programmer errors and should fail immediately OUTSIDE try-catch to prevent silent masking
                *   `[✅]` 36.a.i.C.2. Database insert error (Point C, line 1416) is checked but not thrown - should throw to propagate failure
                *   `[✅]` 36.a.i.C.3. Try-catch should only wrap database operations (Points A and C), not validation logic (Point B)
                *   `[✅]` 36.a.i.C.4. Current architecture makes debugging impossible - errors are logged but EXECUTE job completes successfully, hiding the fact that RENDER job was never created
            *   `[✅]` 36.a.i.D. **Suggestions for Fix:**
                *   `[✅]` 36.a.i.D.1. Move all validation logic (lines 1336-1396) OUTSIDE try-catch to fail fast on programmer errors
                *   `[✅]` 36.a.i.D.2. Change line 1416-1417 from logging-only to throwing when `renderInsertError` exists
                *   `[✅]` 36.a.i.D.3. Narrow try-catch scope to only wrap `shouldEnqueueRenderJob()` and database insert operations
                *   `[✅]` 36.a.i.D.4. Re-throw errors from try-catch instead of swallowing them, OR add explicit error state to contribution/job record to track RENDER job creation failures
                *   `[✅]` 36.a.i.D.5. Consider: Should RENDER job failure cause EXECUTE job to fail (current step 36.d.i research question), or should we track "RENDER pending but failed to enqueue" state separately?
        *   `[✅]` 36.a.ii. `shouldEnqueueRenderJob()` in `supabase/functions/_shared/utils/shouldEnqueueRenderJob.ts` queries recipe configuration to determine if markdown rendering is required
            *   `[✅]` 36.a.ii.A. **Five-Step Query Chain (lines 110-189):**
                *   `[✅]` 36.a.ii.A.1. **Step 1 (lines 110-118):** Query `dialectic_stages` table for `active_recipe_instance_id` WHERE `slug = stageSlug` (single row expected)
                *   `[✅]` 36.a.ii.A.2. **Step 2 (lines 121-129):** Query `dialectic_stage_recipe_instances` table for instance metadata WHERE `id = active_recipe_instance_id` (single row expected)
                *   `[✅]` 36.a.ii.A.3. **Step 3 (lines 134-158):** Branch based on `instance.is_cloned` flag to determine which table to query for recipe steps:
                    *   `[✅]` 36.a.ii.A.3.a. If `is_cloned === true` (lines 136-143): Query `dialectic_stage_recipe_steps` WHERE `instance_id = instance.id` (multiple rows expected)
                    *   `[✅]` 36.a.ii.A.3.b. If `is_cloned === false` (lines 148-155): Query `dialectic_recipe_template_steps` WHERE `template_id = instance.template_id` (multiple rows expected)
                *   `[✅]` 36.a.ii.A.4. **Step 4 (lines 164-186):** For each recipe step, parse JSONB `outputs_required` field (may be string requiring `JSON.parse()` or already an object)
                *   `[✅]` 36.a.ii.A.5. **Step 5 (lines 29-96, 182-189):** Extract markdown document keys from `outputs_required` using complex extraction logic, then check if `outputType` parameter matches any extracted key
            *   `[✅]` 36.a.ii.B. **Silent Failure Pattern - Returns `false` on ANY Error:**
                *   `[✅]` 36.a.ii.B.1. Lines 116-118: If `stageError` OR `!stageData` OR `!stageData.active_recipe_instance_id` → return `false` (no logging, no throw)
                *   `[✅]` 36.a.ii.B.2. Lines 127-129: If `instanceError` OR `!instance` → return `false` (no logging, no throw)
                *   `[✅]` 36.a.ii.B.3. Lines 141-143: If cloned steps query fails OR returns empty array → return `false` (no logging, no throw)
                *   `[✅]` 36.a.ii.B.4. Lines 153-155: If template steps query fails OR returns empty array → return `false` (no logging, no throw)
                *   `[✅]` 36.a.ii.B.5. Lines 173-178: If `JSON.parse(outputs_required)` throws exception → silently skip that step and continue (no logging of parse failure)
                *   `[✅]` 36.a.ii.B.6. Line 189: If `outputType` not found in extracted markdown keys → return `false` (correct behavior for JSON outputs)
                *   `[✅]` 36.a.ii.B.7. **Critical Issue:** Cannot distinguish between (A) legitimate "this is a JSON output, no rendering needed" vs (B) "database unavailable" vs (C) "recipe misconfigured" vs (D) "RLS policy blocked query"
            *   `[✅]` 36.a.ii.C. **Complex Markdown Document Key Extraction (lines 29-96):**
                *   `[✅]` 36.a.ii.C.1. **Legacy root-level format:** `outputs_required: { document_key: "foo", file_type: "markdown" }` → registers "foo" as markdown document
                *   `[✅]` 36.a.ii.C.2. **Documents array format:** `outputs_required: { documents: [{ document_key: "foo", file_type: "markdown" }] }` → registers "foo"
                *   `[✅]` 36.a.ii.C.3. **Template filename detection:** `outputs_required: { documents: [{ document_key: "foo", template_filename: "bar.md" }] }` → registers "foo" if filename ends with `.md` or `.markdown`
                *   `[✅]` 36.a.ii.C.4. **Assembled JSON array:** Same extraction logic as `documents` array but from `outputs_required.assembled_json` array
                *   `[✅]` 36.a.ii.C.5. **Files to generate array:** `outputs_required: { files_to_generate: [{ from_document_key: "foo", template_filename: "bar.md" }] }` → registers "foo" if template is markdown
                *   `[✅]` 36.a.ii.C.6. Mirrors frontend selector logic at `packages/store/src/dialecticStore.selectors.ts` lines 933-1000 (line 27 comment)
            *   `[✅]` 36.a.ii.D. **Failure Point Impact Analysis:**
                *   `[✅]` 36.a.ii.D.1. **Database Unavailable:** All 4 database queries can fail due to connection issues → function returns `false` → RENDER job silently skipped for markdown documents
                *   `[✅]` 36.a.ii.D.2. **RLS Policy Rejection:** User may not have SELECT permission on recipe tables → queries return error or empty → function returns `false` → RENDER job silently skipped
                *   `[✅]` 36.a.ii.D.3. **Missing Data:** Stage record exists but `active_recipe_instance_id` is NULL → function returns `false` (legitimate configuration state or data corruption?)
                *   `[✅]` 36.a.ii.D.4. **Recipe Misconfiguration:** Instance exists but has zero recipe steps → function returns `false` (should this be an error?)
                *   `[✅]` 36.a.ii.D.5. **Invalid JSONB:** `outputs_required` field contains malformed JSON → parse fails, step skipped, may still return true if other steps have valid markdown configs
                *   `[✅]` 36.a.ii.D.6. Called at `executeModelCallAndSave.ts` line 1331 where result is used to determine if RENDER job should be created (inside try-catch that swallows all errors from 36.a.i)
            *   `[✅]` 36.a.ii.E. **Suggestions for Fix:**
                *   `[✅]` 36.a.ii.E.1. Add logging for each query failure so database/permission errors are visible in logs
                *   `[✅]` 36.a.ii.E.2. Consider throwing exceptions for database errors (rather than returning `false`) to distinguish transient failures from legitimate "no rendering needed" results
                *   `[✅]` 36.a.ii.E.3. Return structured result: `{ shouldRender: boolean, reason: 'is_markdown' | 'is_json' | 'query_failed' | 'not_found' }` to enable caller to handle errors appropriately
                *   `[✅]` 36.a.ii.E.4. Add validation: If stage exists but has no `active_recipe_instance_id`, should this be treated as error rather than silently returning `false`?
                *   `[✅]` 36.a.ii.E.5. Consider caching recipe step queries to reduce database load (5 queries per EXECUTE job completion for markdown documents)
        *   `[✅]` 36.a.iii. Database insert operation at line 1410 (`dbClient.from('dialectic_generation_jobs').insert(insertObj)`) may fail for validation, permission, or constraint violations
            *   `[✅]` 36.a.iii.A. **Schema Requirements from Migrations:**
                *   `[✅]` 36.a.iii.A.1. **Required NOT NULL fields:** `session_id` (UUID FK to dialectic_sessions), `user_id` (UUID FK to auth.users), `stage_slug` (text), `iteration_number` (integer), `payload` (jsonb), `status` (text, default 'pending')
                *   `[✅]` 36.a.iii.A.2. **Optional fields with defaults:** `job_type` (dialectic_job_type_enum: 'PLAN'|'EXECUTE'|'RENDER', can be NULL), `is_test_job` (boolean, default FALSE), `attempt_count` (integer, default 0), `max_retries` (integer, default 3)
                *   `[✅]` 36.a.iii.A.3. **Optional nullable fields:** `parent_job_id` (UUID self-reference), `prerequisite_job_id` (UUID self-reference), `target_contribution_id` (UUID FK to dialectic_contributions)
                *   `[✅]` 36.a.iii.A.4. **Foreign Key Constraints:** `session_id` references `dialectic_sessions(id)` ON DELETE CASCADE, `user_id` references `auth.users(id)` ON DELETE CASCADE, `parent_job_id` self-references ON DELETE SET NULL
            *   `[✅]` 36.a.iii.B. **Insert Object Analysis (lines 1398-1408):**
                *   `[✅]` 36.a.iii.B.1. Uses TypeScript type `TablesInsert<'dialectic_generation_jobs'>` for type-safety (compile-time validation of all required fields)
                *   `[✅]` 36.a.iii.B.2. Provides `job_type: 'RENDER'` (valid enum value)
                *   `[✅]` 36.a.iii.B.3. Provides `session_id: job.session_id` (inherited from EXECUTE job, guaranteed to exist because EXECUTE job is running)
                *   `[✅]` 36.a.iii.B.4. Provides `user_id: projectOwnerUserId` (validated earlier in executeModelCallAndSave function)
                *   `[✅]` 36.a.iii.B.5. Provides `stage_slug: stageSlug` (from job.payload.canonicalPathParams.stageSlug)
                *   `[✅]` 36.a.iii.B.6. Provides `iteration_number: iterationNumber` (from job.payload.iterationNumber)
                *   `[✅]` 36.a.iii.B.7. Provides `payload: renderPayload` (validated with type guards at lines 1391-1396: `isDialecticRenderJobPayload()` and `isJson()`)
                *   `[✅]` 36.a.iii.B.8. Provides `is_test_job: job.is_test_job ?? false` (handles null/undefined with fallback to false)
                *   `[✅]` 36.a.iii.B.9. Provides `status: 'pending'` (valid status value for new jobs)
                *   `[✅]` 36.a.iii.B.10. Provides `parent_job_id: jobId` (references current EXECUTE job, guaranteed to exist)
                *   `[✅]` 36.a.iii.B.11. **Conclusion:** Insert object is well-formed and provides ALL required fields with validated values
            *   `[✅]` 36.a.iii.C. **RLS Policy Requirements (migration 20250711142317_create_dialectic_generation_jobs_table.sql lines 59-74):**
                *   `[✅]` 36.a.iii.C.1. INSERT policy requires `auth.uid() = user_id` (JWT user must match the user_id being inserted)
                *   `[✅]` 36.a.iii.C.2. INSERT policy requires session verification EXISTS check: `dialectic_sessions` → `dialectic_projects` → verify user owns project OR is organization member
                *   `[✅]` 36.a.iii.C.3. `executeModelCallAndSave` runs as Edge Function with `dbClient` constructed from user JWT, so RLS policies APPLY (not service_role bypass)
                *   `[✅]` 36.a.iii.C.4. **Potential RLS failure:** If `projectOwnerUserId` doesn't match `auth.uid()` from JWT context, insert will be blocked with permission error
                *   `[✅]` 36.a.iii.C.5. **Potential RLS failure:** If session/project was deleted or organization membership revoked between EXECUTE job start and RENDER job insert, EXISTS check fails → permission error
            *   `[✅]` 36.a.iii.D. **Low-Probability Failure Scenarios:**
                *   `[✅]` 36.a.iii.D.1. **FK Constraint Violation (session_id):** If `dialectic_sessions` record was deleted mid-execution via CASCADE (extremely unlikely - EXECUTE job holds reference)
                *   `[✅]` 36.a.iii.D.2. **FK Constraint Violation (user_id):** If user account was deleted from `auth.users` between EXECUTE job start and RENDER job insert (extremely unlikely - user is authenticated and active)
                *   `[✅]` 36.a.iii.D.3. **FK Constraint Violation (parent_job_id):** If EXECUTE job record (jobId) was deleted mid-execution (impossible - it's the currently running job)
                *   `[✅]` 36.a.iii.D.4. **RLS Policy Rejection:** If JWT `auth.uid()` doesn't match `projectOwnerUserId` due to impersonation or stale JWT claims
                *   `[✅]` 36.a.iii.D.5. **RLS Policy Rejection:** If session verification subquery fails because project ownership changed or organization membership was revoked during EXECUTE job execution
                *   `[✅]` 36.a.iii.D.6. **JSONB Validation:** If `renderPayload` somehow passes type guards (lines 1391-1396) but PostgreSQL rejects as invalid JSONB (nearly impossible - TypeScript type guards are strict)
            *   `[✅]` 36.a.iii.E. **Historical Evidence & Likelihood Assessment:**
                *   `[✅]` 36.a.iii.E.1. **User Confirmation:** RENDER jobs have been successfully inserted before (though they were not correctly triggered to run), proving the insert mechanism works
                *   `[✅]` 36.a.iii.E.2. **Type-Safety:** `TablesInsert<'dialectic_generation_jobs'>` TypeScript type prevents malformed insert objects at compile-time
                *   `[✅]` 36.a.iii.E.3. **Comprehensive Validation:** Lines 1350-1396 validate all RENDER payload fields before insert (validatedDocumentKey, documentIdentity, sourceContributionId, type guards)
                *   `[✅]` 36.a.iii.E.4. **Conclusion:** Database insert failure is the LEAST LIKELY failure point among the three identified in step 36 (compared to try-catch swallowing in 36.a.i and shouldEnqueueRenderJob silent failures in 36.a.ii)
                *   `[✅]` 36.a.iii.E.5. **Most Probable Failure (if occurs):** RLS policy rejection due to session/project state changes during EXECUTE job execution, or JWT/user_id mismatch
            *   `[✅]` 36.a.iii.F. **Current Error Handling Issue:**
                *   `[✅]` 36.a.iii.F.1. Lines 1416-1421 check `renderInsertError` but only LOG the error, do NOT throw
                *   `[✅]` 36.a.iii.F.2. If insert fails, error is logged at line 1417 with full `renderInsertError` and `insertObj` details for debugging
                *   `[✅]` 36.a.iii.F.3. Function continues to line 1427+ as if RENDER job was successfully created (same silent failure pattern as 36.a.i)
                *   `[✅]` 36.a.iii.F.4. Try-catch at lines 1423-1425 catches ANY exception (including hypothetical RLS or FK errors) and swallows it with logging only
        *   `[✅]` 36.a.iv. Current error handling logs error at line 1424 but does NOT re-throw, allowing EXECUTE job to complete successfully while RENDER job is never created
            *   `[✅]` 36.a.iv.A. **REDUNDANT WITH STEP 36.a.i:** This finding is a subset of the comprehensive error handling analysis already documented in step 36.a.i
            *   `[✅]` 36.a.iv.B. **Cross-References to Detailed Analysis:**
                *   `[✅]` 36.a.iv.B.1. See **36.a.i.B.3:** Try-catch at lines 1423-1425 catches ALL exceptions (both validation and database errors) and swallows them with only logging
                *   `[✅]` 36.a.iv.B.2. See **36.a.i.B.4:** Function continues to line 1427+ as if RENDER job was successfully enqueued, no error propagation to caller
                *   `[✅]` 36.a.iv.B.3. See **36.a.i.C.4:** Current architecture makes debugging impossible - errors are logged but EXECUTE job completes successfully, hiding the fact that RENDER job was never created
                *   `[✅]` 36.a.iv.B.4. See **36.a.i.D.2:** Suggestion to change line 1416-1417 from logging-only to throwing when `renderInsertError` exists
                *   `[✅]` 36.a.iv.B.5. See **36.a.iii.F:** Current error handling issue documented for database insert failures specifically
            *   `[✅]` 36.a.iv.C. **Line 1424 Catch Block Details:**
                *   `[✅]` 36.a.iv.C.1. Catch block: `catch (e) { deps.logger.error('[executeModelCallAndSave] CRITICAL: Exception while scheduling RENDER job', { error: e instanceof Error ? e.message : String(e) }); }`
                *   `[✅]` 36.a.iv.C.2. Logs error with 'CRITICAL' prefix but this is misleading - critical errors should halt execution, not continue silently
                *   `[✅]` 36.a.iv.C.3. Error message includes `e instanceof Error ? e.message : String(e)` which loses stack trace and detailed error context
                *   `[✅]` 36.a.iv.C.4. No differentiation between error types (validation vs database vs network failures)
            *   `[✅]` 36.a.iv.D. **Recommendation:**
                *   `[✅]` 36.a.iv.D.1. This step can be marked as completed/redundant since the comprehensive analysis is in 36.a.i
                *   `[✅]` 36.a.iv.D.2. All suggested fixes for this issue are documented in 36.a.i.D (Suggestions for Fix)
                *   `[✅]` 36.a.iv.D.3. No additional research or analysis needed for this step beyond what was done in 36.a.i
        *   `[✅]` 36.a.v. Signature: `executeModelCallAndSave(params: ExecuteModelCallAndSaveParams): Promise<void>` - returns void, no error propagation to caller
            *   `[✅]` 36.a.v.A. **Function Signature Analysis:**
                *   `[✅]` 36.a.v.A.1. Declaration at line 34: `export async function executeModelCallAndSave(params: ExecuteModelCallAndSaveParams,) {`
                *   `[✅]` 36.a.v.A.2. No explicit return type declaration - TypeScript infers `Promise<void>` because function has no return statement
                *   `[✅]` 36.a.v.A.3. Async function with void return means: (1) function completes asynchronously, (2) no value is returned to caller, (3) errors MUST be propagated via thrown exceptions
                *   `[✅]` 36.a.v.A.4. Interface definition at `dialectic.interface.ts:1080` declares `ExecuteModelCallAndSaveParams` but does NOT specify return type (relies on inference)
            *   `[✅]` 36.a.v.B. **Caller Expectations and Error Handling Contract:**
                *   `[✅]` 36.a.v.B.1. Primary caller: `processSimpleJob.ts` line 288-300 calls `await deps.executeModelCallAndSave({ ... });`
                *   `[✅]` 36.a.v.B.2. Caller does NOT capture return value (void), only awaits completion
                *   `[✅]` 36.a.v.B.3. Caller wraps call in try-catch (line 302-309) expecting exceptions to be thrown on failure
                *   `[✅]` 36.a.v.B.4. Caller catches specific error types (ContextWindowError) and sets job status to 'failed' when exceptions occur
                *   `[✅]` 36.a.v.B.5. **Contract:** executeModelCallAndSave must throw exceptions for all failures, otherwise caller assumes success
            *   `[✅]` 36.a.v.C. **Impact of Void Return Type on Error Propagation:**
                *   `[✅]` 36.a.v.C.1. `Promise<void>` means function CANNOT return error indicators (boolean, error object, result status)
                *   `[✅]` 36.a.v.C.2. Only communication channel to caller is: (A) successful completion (promise resolves), (B) failure (promise rejects with thrown exception)
                *   `[✅]` 36.a.v.C.3. Silent failures (logged but not thrown) are **invisible** to caller - caller assumes success if promise resolves
                *   `[✅]` 36.a.v.C.4. Current RENDER job failure (36.a.i) is logged at line 1424 but NOT thrown → caller never knows RENDER job failed
                *   `[✅]` 36.a.v.C.5. Job status remains 'processing' then transitions to 'completed' even though RENDER job was never created (misleading state)
            *   `[✅]` 36.a.v.D. **How Void Return Contributes to Silent Failure Problem:**
                *   `[✅]` 36.a.v.D.1. Void return type forces reliance on exception-based error handling
                *   `[✅]` 36.a.v.D.2. Try-catch at lines 1423-1425 swallows exceptions instead of re-throwing → breaks error propagation contract
                *   `[✅]` 36.a.v.D.3. Caller has NO mechanism to detect RENDER job failures: no return value to check, no exception thrown
                *   `[✅]` 36.a.v.D.4. Function appears to succeed (promise resolves) even when critical RENDER job creation failed
                *   `[✅]` 36.a.v.D.5. This violates principle of "fail fast" - errors are hidden instead of surfaced immediately
            *   `[✅]` 36.a.v.E. **Alternative Return Type Approaches:**
                *   `[✅]` 36.a.v.E.1. **Option A:** Keep `Promise<void>` but FIX try-catch to re-throw exceptions (aligns with current caller expectations)
                *   `[✅]` 36.a.v.E.2. **Option B:** Change to `Promise<ExecutionResult>` returning `{ success: boolean, renderJobCreated?: boolean, contribution: Contribution }` (requires updating all callers)
                *   `[✅]` 36.a.v.E.3. **Option C:** Change to `Promise<{ renderJobId?: string }>` to explicitly communicate RENDER job creation status (requires updating all callers)
                *   `[✅]` 36.a.v.E.4. **Option D:** Introduce custom error types (RenderJobFailedError, ValidationError) and throw them explicitly for different failure modes (aligns with current contract)
                *   `[✅]` 36.a.v.E.5. **Recommendation:** Option A (fix try-catch to re-throw) is simplest and maintains backward compatibility with existing callers
            *   `[✅]` 36.a.v.F. **Cross-Reference:**
                *   `[✅]` 36.a.v.F.1. See **36.a.i.D.4:** Suggestion to re-throw errors from try-catch instead of swallowing them
                *   `[✅]` 36.a.v.F.2. See **36.a.iv:** Redundant analysis of line 1424 error handling that doesn't re-throw
                *   `[✅]` 36.a.v.F.3. See **36.d.i:** Research question on whether RENDER job failure should cause EXECUTE job to fail (directly related to error propagation strategy)
        *   `[✅]` 36.a.vi. RENDER job payload construction requires: `documentIdentity`, `documentKey`, `sourceContributionId`, `user_jwt`, `model_id`, `walletId` - all must be validated before insert
            *   `[✅]` 36.a.vi.A. **DialecticRenderJobPayload Type Structure (dialectic.interface.ts:721-725):**
                *   `[✅]` 36.a.vi.A.1. Extends `DialecticBaseJobPayload` which extends `GenerateContributionsPayload` (with some fields omitted)
                *   `[✅]` 36.a.vi.A.2. RENDER-specific fields: `documentIdentity: string`, `documentKey: FileType`, `sourceContributionId: string`
                *   `[✅]` 36.a.vi.A.3. Inherited from DialecticBaseJobPayload: `model_id: string` (required), `sourceContributionId?: string | null` (optional but made required by RENDER payload)
                *   `[✅]` 36.a.vi.A.4. Inherited from GenerateContributionsPayload: `sessionId`, `projectId`, `stageSlug?`, `iterationNumber?`, `walletId`, `user_jwt`, plus optional fields
            *   `[✅]` 36.a.vi.B. **Complete Field Inventory with Sources (lines 1378-1389):**
                *   `[✅]` 36.a.vi.B.1. `projectId` - From job context (validated early in function)
                *   `[✅]` 36.a.vi.B.2. `sessionId` - From job context (validated early in function)
                *   `[✅]` 36.a.vi.B.3. `iterationNumber` - From job.payload, validated at lines 110-114
                *   `[✅]` 36.a.vi.B.4. `stageSlug` - From job.payload.canonicalPathParams.stageSlug, validated early
                *   `[✅]` 36.a.vi.B.5. `documentIdentity` - Extracted from `contribution.document_relationships[stageSlug]` at line 1347 (must be persisted before RENDER job creation)
                *   `[✅]` 36.a.vi.B.6. `documentKey` - From `validatedDocumentKey`, set at lines 1219-1225 IF `isDocumentKey(fileType)` returns true, type-narrowed to `FileType` at lines 1358-1362
                *   `[✅]` 36.a.vi.B.7. `sourceContributionId` - From `contribution.id`, validated at lines 1373-1376
                *   `[✅]` 36.a.vi.B.8. `user_jwt` - Validated early at line 993 as `userAuthTokenStrict`
                *   `[✅]` 36.a.vi.B.9. `model_id` - Validated at lines 146-148 from job.payload.model_id
                *   `[✅]` 36.a.vi.B.10. `walletId` - Validated at lines 106-108 from job.payload.walletId
            *   `[✅]` 36.a.vi.C. **Validation Logic (lines 1350-1396):**
                *   `[✅]` 36.a.vi.C.1. **validatedDocumentKey (lines 1350-1362):** Check not undefined, is string, non-empty → throw if invalid, then validate with `isFileType()` type guard, cast to `FileType`
                *   `[✅]` 36.a.vi.C.2. **documentIdentity (lines 1364-1371):** Check not undefined, is string, non-empty → throw if invalid, type-narrow to strict string
                *   `[✅]` 36.a.vi.C.3. **sourceContributionId (lines 1373-1376):** Check `contribution.id` exists, is string, non-empty → throw if invalid
                *   `[✅]` 36.a.vi.C.4. **Payload object construction (lines 1378-1389):** Build `DialecticRenderJobPayload` object with all 10 required fields
                *   `[✅]` 36.a.vi.C.5. **Type guard validation (lines 1391-1396):** Double-check with `isDialecticRenderJobPayload()` and `isJson()` type guards → throw if validation fails
                *   `[✅]` 36.a.vi.C.6. All validation throws exceptions on failure (programmer errors - should fail fast)
            *   `[✅]` 36.a.vi.D. **Validation Issues - All Inside Try-Catch:**
                *   `[✅]` 36.a.vi.D.1. ALL validation logic (lines 1350-1396) is inside try-catch block (lines 1328-1425)
                *   `[✅]` 36.a.vi.D.2. Validation errors are programmer errors (missing required fields, invalid types) but are caught and swallowed instead of failing fast
                *   `[✅]` 36.a.vi.D.3. If `validatedDocumentKey` is undefined (bug in step 37), throws at line 1356 → caught at line 1423 → logged but EXECUTE job completes successfully
                *   `[✅]` 36.a.vi.D.4. If `documentIdentity` extraction fails, throws at line 1369 → caught → logged but not propagated
                *   `[✅]` 36.a.vi.D.5. **See 36.a.i.D.1:** Suggestion to move validation logic OUTSIDE try-catch to fail fast on programmer errors
            *   `[✅]` 36.a.vi.E. **Relationship to Step 37 Scope Bug:**
                *   `[✅]` 36.a.vi.E.1. `validatedDocumentKey` is populated at line 1225 based on `isDocumentKey(fileType)` check at line 1220
                *   `[✅]` 36.a.vi.E.2. BUT `shouldEnqueueRenderJob` at line 1331 uses ORIGINAL `output_type`, not `fileType`
                *   `[✅]` 36.a.vi.E.3. If `fileType` was modified or doesn't match `output_type`, `validatedDocumentKey` may be undefined even for markdown documents
                *   `[✅]` 36.a.vi.E.4. Validation at line 1350 would throw "validatedDocumentKey is required" error → but currently swallowed by try-catch
                *   `[✅]` 36.a.vi.E.5. **See Step 37:** Complete analysis of `validatedDocumentKey` scope mismatch between `fileType` and `output_type`
            *   `[✅]` 36.a.vi.F. **documentIdentity Extraction Logic (lines 1336-1347):**
                *   `[✅]` 36.a.vi.F.1. Requires `contribution.document_relationships` to be persisted BEFORE RENDER job creation
                *   `[✅]` 36.a.vi.F.2. Checks `contribution.document_relationships` is a record object (line 1336)
                *   `[✅]` 36.a.vi.F.3. Uses `Object.entries().find()` to type-safely extract `document_relationships[stageSlug]` value (lines 1341-1345)
                *   `[✅]` 36.a.vi.F.4. Validates value exists, is string, non-empty (line 1342)
                *   `[✅]` 36.a.vi.F.5. Uses extracted value as `documentIdentity` for RENDER payload (line 1347)
                *   `[✅]` 36.a.vi.F.6. If extraction fails at any step, throws with detailed error message including contribution.id
            *   `[✅]` 36.a.vi.G. **Type Guard Validation (lines 1391-1396):**
                *   `[✅]` 36.a.vi.G.1. `isDialecticRenderJobPayload(renderPayload)` - Validates payload matches DialecticRenderJobPayload interface structure
                *   `[✅]` 36.a.vi.G.2. `isJson(renderPayload)` - Validates payload is serializable to JSON (no circular references, functions, etc.)
                *   `[✅]` 36.a.vi.G.3. Both type guards must pass or function throws (lines 1392, 1395)
                *   `[✅]` 36.a.vi.G.4. Type guards are runtime validation in addition to TypeScript compile-time validation
                *   `[✅]` 36.a.vi.G.5. Provides defense against type system bypasses or runtime type coercion issues
            *   `[✅]` 36.a.vi.H. **Suggestions for Improvement:**
                *   `[✅]` 36.a.vi.H.1. Move ALL validation logic (lines 1336-1396) OUTSIDE the try-catch block to fail fast on programmer errors
                *   `[✅]` 36.a.vi.H.2. Keep only database operations (`shouldEnqueueRenderJob`, database insert) inside try-catch
                *   `[✅]` 36.a.vi.H.3. Fix scope bug in step 37 to ensure `validatedDocumentKey` is correctly populated based on `output_type`, not `fileType`
                *   `[✅]` 36.a.vi.H.4. Consider adding explicit validation for ALL inherited fields (projectId, sessionId, etc.) at payload construction time
                *   `[✅]` 36.a.vi.H.5. Add logging for successful validation milestones to aid debugging when validation does fail
    *   `[✅]`   36.b. [TYPES] Identify type changes needed for proper error handling
        *   `[✅]` 36.b.i. **Current Error Handling Architecture:**
            *   `[✅]` 36.b.i.A. `executeModelCallAndSave` has implicit return type `Promise<void>` (no explicit type annotation at line 34)
            *   `[✅]` 36.b.i.B. Caller in `processSimpleJob.ts` (lines 288-300) awaits the function but does NOT capture return value
            *   `[✅]` 36.b.i.C. Caller wraps call in try-catch (lines 302-340) and specifically checks for `ContextWindowError` (line 305)
            *   `[✅]` 36.b.i.D. When `ContextWindowError` caught, caller sets job status to 'failed' and sends failure notification (lines 307-323)
            *   `[✅]` 36.b.i.E. **Pattern:** Codebase uses custom error classes (extending Error) for specific failure modes, caller catches and handles them explicitly
            *   `[✅]` 36.b.i.F. Existing custom errors in `_shared/utils/errors.ts`: `ContextWindowError`, `IndexingError`, `RagServiceError`, `NotImplementedError`
        *   `[✅]` 36.b.ii. **Required Type Changes - Custom Error Classes:**
            *   `[✅]` 36.b.ii.A. **NEW:** `RenderJobValidationError extends Error` - Thrown when RENDER payload validation fails (programmer error, should fail immediately)
                *   `[✅]` 36.b.ii.A.1. Thrown for: Missing `validatedDocumentKey`, invalid `documentIdentity`, missing `contribution.id`, type guard failures
                *   `[✅]` 36.b.ii.A.2. Purpose: Distinguish validation failures (bugs in code) from transient database failures (retryable)
                *   `[✅]` 36.b.ii.A.3. Caller handling: Should mark job as 'failed' immediately, these are NOT retryable errors
            *   `[✅]` 36.b.ii.B. **NEW:** `RenderJobEnqueueError extends Error` - Thrown when database operations for RENDER job fail
                *   `[✅]` 36.b.ii.B.1. Thrown for: `shouldEnqueueRenderJob()` database query failures, database insert failures (FK constraints, RLS rejection)
                *   `[✅]` 36.b.ii.B.2. Purpose: Distinguish database/transient failures (potentially retryable) from validation bugs
                *   `[✅]` 36.b.ii.B.3. Caller handling: Could implement retry logic OR mark EXECUTE job as 'failed' (design decision needed)
                *   `[✅]` 36.b.ii.B.4. **Alternative Name:** `RenderJobDatabaseError` (more specific to root cause)
            *   `[✅]` 36.b.ii.C. **Consider:** Should these errors include structured metadata?
                *   `[✅]` 36.b.ii.C.1. Example: `RenderJobValidationError` could include `{ field: 'validatedDocumentKey', value: undefined, contributionId: 'abc' }`
                *   `[✅]` 36.b.ii.C.2. Example: `RenderJobEnqueueError` could include `{ operation: 'database_insert', dbError: PostgrestError, payload: insertObj }`
                *   `[✅]` 36.b.ii.C.3. Benefit: Enables caller to make intelligent decisions (retry vs fail) and log structured error details
                *   `[✅]` 36.b.ii.C.4. Pattern used by existing errors: Simple string message only (no metadata properties)
        *   `[✅]` 36.b.iii. **Required Type Changes - shouldEnqueueRenderJob Return Type:**
            *   `[✅]` 36.b.iii.A. **Current:** `shouldEnqueueRenderJob()` returns `Promise<boolean>` - returns `false` on ALL errors (silent failure)
            *   `[✅]` 36.b.iii.B. **Option 1:** Keep `Promise<boolean>` but THROW exceptions for database errors instead of returning `false`
                *   `[✅]` 36.b.iii.B.1. Legitimate `false`: Output type is JSON (no rendering needed)
                *   `[✅]` 36.b.iii.B.2. Throw `RenderJobEnqueueError`: Database query fails, RLS blocks query, recipe misconfigured
                *   `[✅]` 36.b.iii.B.3. Benefit: Simplest change, maintains existing interface contract
            *   `[✅]` 36.b.iii.C. **Option 2:** Change to `Promise<{ shouldRender: boolean, reason: RenderDecisionReason }>` with structured result
                *   `[✅]` 36.b.iii.C.1. `RenderDecisionReason` enum: `'is_markdown' | 'is_json' | 'recipe_not_found' | 'stage_inactive' | 'no_steps'`
                *   `[✅]` 36.b.iii.C.2. Still throw exceptions for true errors (database unavailable, RLS rejection)
                *   `[✅]` 36.b.iii.C.3. Benefit: Caller can log WHY rendering was skipped (better debugging)
                *   `[✅]` 36.b.iii.C.4. Drawback: More invasive change, requires updating caller logic
            *   `[✅]` 36.b.iii.D. **Recommendation:** Option 1 (throw exceptions for errors, keep boolean return) - minimal disruption, solves silent failure problem
        *   `[✅]` 36.b.iv. **Required Type Changes - Validation Extraction:**
            *   `[✅]` 36.b.iv.A. **Current:** All validation logic (lines 1336-1396) is inside try-catch block alongside database operations
            *   `[✅]` 36.b.iv.B. **Required:** Extract validation to separate function OUTSIDE try-catch to fail fast on programmer errors
            *   `[✅]` 36.b.iv.C. **NEW Function Signature:**
                ```typescript
                function validateRenderJobPayload(params: {
                    validatedDocumentKey: string | undefined;
                    contribution: Contribution;
                    stageSlug: string;
                    projectId: string;
                    sessionId: string;
                    iterationNumber: number;
                    userAuthTokenStrict: string;
                    model_id: string;
                    walletId: string;
                }): DialecticRenderJobPayload
                ```
            *   `[✅]` 36.b.iv.D. Function throws `RenderJobValidationError` if any required field is missing/invalid
            *   `[✅]` 36.b.iv.E. Function returns validated payload that can be directly inserted
            *   `[✅]` 36.b.iv.F. Caller invokes OUTSIDE try-catch at line 1328, so validation errors propagate immediately to caller
        *   `[✅]` 36.b.v. **Error Categorization Summary:**
            *   `[✅]` 36.b.v.A. **Programmer Errors (fail immediately, not retryable):**
                *   `[✅]` 36.b.v.A.1. Missing `validatedDocumentKey` (step 37 scope bug) → `RenderJobValidationError`
                *   `[✅]` 36.b.v.A.2. Missing `documentIdentity` in `document_relationships` → `RenderJobValidationError`
                *   `[✅]` 36.b.v.A.3. Missing `contribution.id` → `RenderJobValidationError`
                *   `[✅]` 36.b.v.A.4. Type guard failures (`isDialecticRenderJobPayload`, `isJson`, `isFileType`) → `RenderJobValidationError`
            *   `[✅]` 36.b.v.B. **Database/Infrastructure Errors (potentially retryable):**
                *   `[✅]` 36.b.v.B.1. `shouldEnqueueRenderJob()` query failures (database unavailable) → `RenderJobEnqueueError`
                *   `[✅]` 36.b.v.B.2. RLS policy rejection (permissions changed mid-execution) → `RenderJobEnqueueError`
                *   `[✅]` 36.b.v.B.3. Database insert failures (FK violations, constraint errors) → `RenderJobEnqueueError`
            *   `[✅]` 36.b.v.C. **Legitimate Non-Error States (no exception):**
                *   `[✅]` 36.b.v.C.1. `shouldEnqueueRenderJob()` returns `false` because output type is JSON (no rendering needed) → No error, log and continue
        *   `[✅]` 36.b.vi. **Required Changes to executeModelCallAndSave Signature:**
            *   `[✅]` 36.b.vi.A. **Option 1:** Keep `Promise<void>` (current implicit return type), rely on exceptions for all error communication
                *   `[✅]` 36.b.vi.A.1. Pros: No breaking changes to caller, aligns with existing error handling pattern
                *   `[✅]` 36.b.vi.A.2. Cons: Cannot communicate partial success (EXECUTE succeeded but RENDER failed to enqueue)
            *   `[✅]` 36.b.vi.B. **Option 2:** Change to `Promise<{ renderJobId?: string }>` to communicate RENDER job creation status
                *   `[✅]` 36.b.vi.B.1. Pros: Caller knows if RENDER job was created, can track/log the relationship
                *   `[✅]` 36.b.vi.B.2. Cons: Breaking change, requires updating all callers
            *   `[✅]` 36.b.vi.C. **Option 3:** Add explicit return type annotation `Promise<void>` to make contract clear (documentation only, no behavior change)
            *   `[✅]` 36.b.vi.D. **Recommendation:** Option 3 (add explicit `Promise<void>` annotation) + Option 1 behavior (throw exceptions for RENDER failures)
        *   `[✅]` 36.b.vii. **Summary of Type Additions Needed:**
            *   `[✅]` 36.b.vii.A. Add to `supabase/functions/_shared/utils/errors.ts`:
                *   `[✅]` 36.b.vii.A.1. `export class RenderJobValidationError extends Error` (programmer errors)
                *   `[✅]` 36.b.vii.A.2. `export class RenderJobEnqueueError extends Error` (database/infrastructure errors)
            *   `[✅]` 36.b.vii.B. Add to `supabase/functions/dialectic-service/dialectic.interface.ts`:
                *   `[✅]` 36.b.vii.B.1. Interface for `validateRenderJobPayload` parameters (if extracted to separate function)
                *   `[✅]` 36.b.vii.B.2. OR: Inline validation can use existing types without new interface
            *   `[✅]` 36.b.vii.C. Update `executeModelCallAndSave` signature (line 34):
                *   `[✅]` 36.b.vii.C.1. Change from `export async function executeModelCallAndSave(params: ExecuteModelCallAndSaveParams,) {`
                *   `[✅]` 36.b.vii.C.2. To: `export async function executeModelCallAndSave(params: ExecuteModelCallAndSaveParams): Promise<void> {`
                *   `[✅]` 36.b.vii.C.3. Purpose: Make void return contract explicit (documentation, no behavior change)
            *   `[✅]` 36.b.vii.D. Update `shouldEnqueueRenderJob` behavior (NOT signature):
                *   `[✅]` 36.b.vii.D.1. Keep `Promise<boolean>` return type
                *   `[✅]` 36.b.vii.D.2. Add logging for each query failure (database errors, RLS rejections)
                *   `[✅]` 36.b.vii.D.3. Throw `RenderJobEnqueueError` for database errors instead of returning `false`
                *   `[✅]` 36.b.vii.D.4. Return `false` ONLY for legitimate "no rendering needed" cases (JSON output)
    *   `[✅]`   36.c. [TEST-UNIT] Write RED tests proving silent failure occurs for all three failure points
        *   `[ ]` 36.c.i. **Test Suite Overview:** Prove try-catch at lines 1423-1425 swallows ALL exceptions preventing error propagation to caller
            *   `[ ]` 36.c.i.A. Test file location: `supabase/functions/dialectic-worker/executeModelCallAndSave.renderErrors.test.ts` (already exists, see step 36.a.i research)
            *   `[ ]` 36.c.i.B. Purpose: Demonstrate that EXECUTE job appears successful even when RENDER job creation fails
            *   `[ ]` 36.c.i.C. Expected outcome: ALL tests in this suite should FAIL initially (RED tests), proving silent failure bug exists
            *   `[ ]` 36.c.i.D. After fix in step 36.d: Tests should PASS (GREEN), proving errors are properly propagated
        *   `[ ]` 36.c.ii. **Test Category 1: Point A - shouldEnqueueRenderJob Database Failures (36.a.ii.B)**
            *   `[ ]` 36.c.ii.A. Test: `shouldEnqueueRenderJob` stage query fails (database error on `dialectic_stages` query)
                *   `[ ]` 36.c.ii.A.1. Setup: Mock `dbClient.from('dialectic_stages').select()` to return database error
                *   `[ ]` 36.c.ii.A.2. Setup: EXECUTE job payload has `output_type: 'markdown'` (should trigger RENDER job)
                *   `[ ]` 36.c.ii.A.3. Call: `await executeModelCallAndSave(params)`
                *   `[ ]` 36.c.ii.A.4. **RED Assertion (expect to FAIL):** Function should throw `RenderJobEnqueueError` but currently DOES NOT throw
                *   `[ ]` 36.c.ii.A.5. **RED Assertion (expect to FAIL):** NO RENDER job should be inserted into `dialectic_generation_jobs` table
                *   `[ ]` 36.c.ii.A.6. **Current behavior (causes test to FAIL):** Function completes successfully, no exception thrown, caller assumes success
            *   `[ ]` 36.c.ii.B. Test: `shouldEnqueueRenderJob` recipe instance query fails (database error on `dialectic_stage_recipe_instances` query)
                *   `[ ]` 36.c.ii.B.1. Setup: Mock stage query succeeds, mock recipe instance query fails with database error
                *   `[ ]` 36.c.ii.B.2. **RED Assertion:** Function should throw `RenderJobEnqueueError` (will FAIL - currently silent)
                *   `[ ]` 36.c.ii.B.3. **Current behavior:** Returns `false`, no RENDER job, no exception, silent failure
            *   `[ ]` 36.c.ii.C. Test: `shouldEnqueueRenderJob` RLS policy rejection (user lacks SELECT permission on recipe tables)
                *   `[ ]` 36.c.ii.C.1. Setup: Mock `dbClient` queries to return RLS policy error (permission denied)
                *   `[ ]` 36.c.ii.C.2. **RED Assertion:** Function should throw `RenderJobEnqueueError` (will FAIL)
                *   `[ ]` 36.c.ii.C.3. **Current behavior:** Returns `false`, silent failure
        *   `[ ]` 36.c.iii. **Test Category 2: Point B - RENDER Payload Validation Failures (36.a.i.A.2, 36.b.v.A)**
            *   `[ ]` 36.c.iii.A. Test: Missing `validatedDocumentKey` (step 37 scope bug simulation)
                *   `[ ]` 36.c.iii.A.1. Setup: `shouldEnqueueRenderJob` returns `true` (markdown document)
                *   `[ ]` 36.c.iii.A.2. Setup: Set `validatedDocumentKey = undefined` (simulate bug where fileType doesn't match output_type)
                *   `[ ]` 36.c.iii.A.3. Call: `await executeModelCallAndSave(params)`
                *   `[ ]` 36.c.iii.A.4. **RED Assertion (expect to FAIL):** Function should throw `RenderJobValidationError` with message "validatedDocumentKey is required"
                *   `[ ]` 36.c.iii.A.5. **Current behavior (causes FAIL):** Validation throws at line 1356 BUT try-catch catches it, logs only, no re-throw
                *   `[ ]` 36.c.iii.A.6. **Current behavior:** Function completes successfully, EXECUTE job marked completed, silent failure
            *   `[ ]` 36.c.iii.B. Test: Missing `documentIdentity` in `document_relationships`
                *   `[ ]` 36.c.iii.B.1. Setup: `shouldEnqueueRenderJob` returns `true`
                *   `[ ]` 36.c.iii.B.2. Setup: `contribution.document_relationships = {}` (empty object, no stageSlug entry)
                *   `[ ]` 36.c.iii.B.3. **RED Assertion:** Function should throw `RenderJobValidationError` with message "document_relationships[stageSlug] is required"
                *   `[ ]` 36.c.iii.B.4. **Current behavior:** Throws at line 1343, caught at line 1423, logged but not propagated
            *   `[ ]` 36.c.iii.C. Test: Missing `contribution.id`
                *   `[ ]` 36.c.iii.C.1. Setup: `shouldEnqueueRenderJob` returns `true`
                *   `[ ]` 36.c.iii.C.2. Setup: `contribution.id = undefined` (simulated bug)
                *   `[ ]` 36.c.iii.C.3. **RED Assertion:** Function should throw `RenderJobValidationError` with message "contribution.id is required"
                *   `[ ]` 36.c.iii.C.4. **Current behavior:** Throws at line 1374, caught, silent failure
            *   `[ ]` 36.c.iii.D. Test: `isFileType()` type guard fails for `validatedDocumentKey`
                *   `[ ]` 36.c.iii.D.1. Setup: `validatedDocumentKey = 'invalid_file_type'` (not in FileType enum)
                *   `[ ]` 36.c.iii.D.2. **RED Assertion:** Function should throw `RenderJobValidationError` with message "validatedDocumentKey is not a valid FileType"
                *   `[ ]` 36.c.iii.D.3. **Current behavior:** Throws at line 1360, caught, silent failure
            *   `[ ]` 36.c.iii.E. Test: `isDialecticRenderJobPayload()` type guard fails
                *   `[ ]` 36.c.iii.E.1. Setup: Construct `renderPayload` with missing required field (e.g., no `model_id`)
                *   `[ ]` 36.c.iii.E.2. **RED Assertion:** Function should throw `RenderJobValidationError` with message "renderPayload is not a valid DialecticRenderJobPayload"
                *   `[ ]` 36.c.iii.E.3. **Current behavior:** Throws at line 1392, caught, silent failure
            *   `[ ]` 36.c.iii.F. Test: `isJson()` type guard fails (circular reference in payload)
                *   `[ ]` 36.c.iii.F.1. Setup: Construct payload with circular reference (not JSON-serializable)
                *   `[ ]` 36.c.iii.F.2. **RED Assertion:** Function should throw `RenderJobValidationError` with message "renderPayload is not a valid JSON object"
                *   `[ ]` 36.c.iii.F.3. **Current behavior:** Throws at line 1395, caught, silent failure
        *   `[ ]` 36.c.iv. **Test Category 3: Point C - Database Insert Failures (36.a.i.A.3, 36.b.v.B)**
            *   `[ ]` 36.c.iv.A. Test: Database insert fails with FK constraint violation
                *   `[ ]` 36.c.iv.A.1. Setup: `shouldEnqueueRenderJob` returns `true`, all validations pass
                *   `[ ]` 36.c.iv.A.2. Setup: Mock `dbClient.from('dialectic_generation_jobs').insert()` to return FK constraint error (session_id doesn't exist)
                *   `[ ]` 36.c.iv.A.3. **RED Assertion:** Function should throw `RenderJobEnqueueError` with details about FK violation
                *   `[ ]` 36.c.iv.A.4. **Current behavior:** Insert returns error, checked at line 1416 but only LOGGED, not thrown
                *   `[ ]` 36.c.iv.A.5. **Current behavior:** Function continues to line 1427+, silent failure
            *   `[ ]` 36.c.iv.B. Test: Database insert fails with RLS policy rejection
                *   `[ ]` 36.c.iv.B.1. Setup: Mock insert to return RLS policy error (user_id doesn't match auth.uid())
                *   `[ ]` 36.c.iv.B.2. **RED Assertion:** Function should throw `RenderJobEnqueueError`
                *   `[ ]` 36.c.iv.B.3. **Current behavior:** Error logged at line 1417, not thrown, silent failure
            *   `[ ]` 36.c.iv.C. Test: Database insert fails with constraint violation (unique constraint, check constraint, etc.)
                *   `[ ]` 36.c.iv.C.1. Setup: Mock insert to return unique constraint violation error
                *   `[ ]` 36.c.iv.C.2. **RED Assertion:** Function should throw `RenderJobEnqueueError`
                *   `[ ]` 36.c.iv.C.3. **Current behavior:** Logged only, not thrown
        *   `[ ]` 36.c.v. **Test Category 4: Verify Logging Behavior (Current Implementation)**
            *   `[ ]` 36.c.v.A. Test: Verify error IS logged when validation fails
                *   `[ ]` 36.c.v.A.1. Setup: Trigger validation error (e.g., missing `validatedDocumentKey`)
                *   `[ ]` 36.c.v.A.2. Setup: Spy on `deps.logger.error` calls
                *   `[ ]` 36.c.v.A.3. Assert: Logger WAS called with '[executeModelCallAndSave] CRITICAL: Exception while scheduling RENDER job'
                *   `[ ]` 36.c.v.A.4. Assert: Error message IS present in logs (proves logging works, but propagation doesn't)
                *   `[ ]` 36.c.v.A.5. Purpose: Confirm that errors ARE being caught and logged, proving the try-catch IS executing
            *   `[ ]` 36.c.v.B. Test: Verify error IS logged when database insert fails
                *   `[ ]` 36.c.v.B.1. Setup: Mock insert to fail with database error
                *   `[ ]` 36.c.v.B.2. Assert: Logger called with '[executeModelCallAndSave] Failed to enqueue RENDER job' at line 1417
                *   `[ ]` 36.c.v.B.3. Assert: Error details include `renderInsertError` and `insertObj` (proves line 1417 executes)
        *   `[ ]` 36.c.vi. **Test Category 5: Verify Promise Resolution Behavior**
            *   `[ ]` 36.c.vi.A. Test: Promise resolves successfully even when RENDER job creation fails
                *   `[ ]` 36.c.vi.A.1. Setup: Trigger any RENDER job failure (validation, database query, or insert)
                *   `[ ]` 36.c.vi.A.2. Call: `const promise = executeModelCallAndSave(params)`
                *   `[ ]` 36.c.vi.A.3. **RED Assertion (expect to FAIL):** `await promise` should reject with error, but currently RESOLVES
                *   `[ ]` 36.c.vi.A.4. Assert: `await promise` completes without throwing (proves silent failure)
                *   `[ ]` 36.c.vi.A.5. Assert: Return value is `undefined` (Promise<void> resolved)
                *   `[ ]` 36.c.vi.A.6. Purpose: Prove caller has NO WAY to detect RENDER job failure (no exception, no error return value)
        *   `[ ]` 36.c.vii. **Test Category 6: Verify Caller Perspective (Integration-style)**
            *   `[ ]` 36.c.vii.A. Test: Caller's try-catch does NOT catch RENDER job failures
                *   `[ ]` 36.c.vii.A.1. Setup: Trigger RENDER job failure inside `executeModelCallAndSave`
                *   `[ ]` 36.c.vii.A.2. Code pattern: `try { await executeModelCallAndSave(params); } catch (e) { /* caller's error handling */ }`
                *   `[ ]` 36.c.vii.A.3. **RED Assertion (expect to FAIL):** Caller's catch block SHOULD execute but DOES NOT
                *   `[ ]` 36.c.vii.A.4. Assert: Caller's catch block is NOT invoked (proves error not propagated)
                *   `[ ]` 36.c.vii.A.5. Assert: Caller assumes success and continues normal execution
                *   `[ ]` 36.c.vii.A.6. Purpose: Demonstrate impact on caller (mimics `processSimpleJob.ts` behavior)
        *   `[ ]` 36.c.viii. **Expected Test Execution Results (Current Implementation - Before Fix):**
            *   `[ ]` 36.c.viii.A. Category 1 tests (Point A - shouldEnqueueRenderJob): All FAIL - no exceptions thrown, silent failures
            *   `[ ]` 36.c.viii.B. Category 2 tests (Point B - Validation): All FAIL - exceptions caught by try-catch, not propagated
            *   `[ ]` 36.c.viii.C. Category 3 tests (Point C - Database Insert): All FAIL - errors logged but not thrown
            *   `[ ]` 36.c.viii.D. Category 4 tests (Logging): All PASS - proves logging works but doesn't solve propagation problem
            *   `[ ]` 36.c.viii.E. Category 5 tests (Promise Resolution): All FAIL - promises resolve instead of rejecting
            *   `[ ]` 36.c.viii.F. Category 6 tests (Caller Perspective): All FAIL - caller cannot detect failures
            *   `[ ]` 36.c.viii.G. **Overall:** ~15-18 RED tests proving comprehensive silent failure across all three failure points
    *   `[ ]`   36.d. [IMPLEMENTATION] Fix error handling to fail fast on RENDER job failures
        *   `[✅]` 36.d.i. **DESIGN DECISION:** RENDER job failure should NOT cause EXECUTE job to fail - they are independent jobs
            *   `[✅]` 36.d.i.A. **Rationale:** EXECUTE job product (JSON) is already saved to database and storage successfully
            *   `[✅]` 36.d.i.B. If RENDER failure caused EXECUTE failure, model would be called again to regenerate valid JSON (waste of time/cost)
            *   `[✅]` 36.d.i.C. EXECUTE and RENDER are two distinct independent jobs with different purposes
            *   `[✅]` 36.d.i.D. **Implementation Strategy:** RENDER job creation failures should be tracked/logged separately, not propagated to EXECUTE job
            *   `[✅]` 36.d.i.E. **Question:** Does this mean RENDER validation errors (programmer bugs) should also NOT fail EXECUTE? Or only database errors?
            *   `[✅]` 36.d.i.F. **Proposed Answer:** Validation errors ARE programmer bugs and should fail EXECUTE to force developer to fix bug (per 36.d.iii)
            *   `[✅]` 36.d.i.G. Database errors (RLS, FK, connection) should NOT fail EXECUTE - RENDER job should be retryable independently
        *   `[✅]` 36.d.ii. **DESIGN DECISION:** Database query failures should use backoff and retry (industry standard)
            *   `[✅]` 36.d.ii.A. Dev environment: Supabase with Docker container (extremely reliable)
            *   `[✅]` 36.d.ii.B. Prod environment: Supabase hosted (also extremely reliable)
            *   `[✅]` 36.d.ii.C. **Industry Standard:** Exponential backoff with retry for transient database failures
            *   `[✅]` 36.d.ii.D. **Implementation Options:**
                *   `[✅]` 36.d.ii.D.1. **Option A:** Throw `RenderJobEnqueueError`, let job worker retry EXECUTE job (retries RENDER creation automatically)
                *   `[✅]` 36.d.ii.D.2. **Option B:** Implement retry logic within `executeModelCallAndSave` for RENDER job creation only
                *   `[✅]` 36.d.ii.D.3. **Option C:** Create RENDER job with status='failed', let separate RENDER worker retry later (requires new infrastructure)
            *   `[✅]` 36.d.ii.E. **CONFLICT WITH 36.d.i:** If RENDER failure doesn't fail EXECUTE, how do we trigger retry?
            *   `[✅]` 36.d.ii.F. **Resolution:** Log database errors but continue EXECUTE, track "RENDER job creation failed" state, implement RENDER job retry mechanism separately
        *   `[✅]` 36.d.iii. **DESIGN DECISION:** RENDER payload validation MUST happen OUTSIDE try-catch to fail fast on programmer errors
            *   `[✅]` 36.d.iii.A. **Repo Standard:** "Fail hard, fast, and loud on programmer errors, do not default, fallback, or heal, to force the developer to fix the bug"
            *   `[✅]` 36.d.iii.B. Validation errors are programmer bugs (missing fields, invalid types)
            *   `[✅]` 36.d.iii.C. **Implementation:** Move validation logic (lines 1336-1396) OUTSIDE try-catch block
            *   `[✅]` 36.d.iii.D. Validation failures throw `RenderJobValidationError` and propagate immediately to caller
            *   `[✅]` 36.d.iii.E. Caller (processSimpleJob.ts) catches error, marks EXECUTE job as 'failed', forces developer to fix bug
        *   `[✅]` 36.d.iv. **RESEARCH COMPLETE:** Integration tests expect RENDER job creation to be MANDATORY (not best-effort)
            *   `[✅]` 36.d.iv.A. Integration tests location: `supabase/integration_tests/services/`
            *   `[✅]` 36.d.iv.B. Key files examined:
                *   `[✅]` 36.d.iv.B.1. `executeModelCallAndSave.document.integration.test.ts` - Document generation end-to-end tests
                *   `[✅]` 36.d.iv.B.2. `executeModelCallAndSave.integration.test.ts` - Full EMCAS integration tests (47k+ tokens)
                *   `[✅]` 36.d.iv.B.3. `document_renderer.integration.test.ts` - RENDER job processing tests
                *   `[✅]` 36.d.iv.B.4. `processRenderJob.integration.test.ts` - RENDER worker tests
            *   `[✅]` 36.d.iv.C. **CRITICAL FINDING:** Tests explicitly assert RENDER job creation is MANDATORY
                *   `[✅]` 36.d.iv.C.1. Line 274-276 in `executeModelCallAndSave.document.integration.test.ts`: `assertExists(renderJob, "RENDER job for EXECUTE job ${executeJob.id} should have been created")`
                *   `[✅]` 36.d.iv.C.2. Multiple tests assert: `assert(renderJobs.length >= 1, "At least one RENDER job should be enqueued")`
                *   `[✅]` 36.d.iv.C.3. **Test 21.b.v** (lines 514-575): Proves stage completion does NOT occur when RENDER jobs fail to process
                *   `[✅]` 36.d.iv.C.4. **Test 21.b.iv** (lines 459-512): Proves stage completion ONLY occurs after all EXECUTE and RENDER jobs complete
            *   `[✅]` 36.d.iv.D. **ANSWER:** YES - existing tests verify RENDER job creation is MANDATORY for document-generating outputs
            *   `[✅]` 36.d.iv.E. **IMPLICATION FOR FIX:** Silent RENDER failures break stage completion logic - this is a CRITICAL bug
            *   `[✅]` 36.d.iv.F. **CONFLICT RESOLUTION UPDATE:** 36.d.i ("don't fail EXECUTE") is INVALID based on integration test expectations
                *   `[✅]` 36.d.iv.F.1. **NEW DECISION:** RENDER validation failures MUST fail EXECUTE (integration tests expect RENDER job to exist)
                *   `[✅]` 36.d.iv.F.2. **NEW DECISION:** Database failures during RENDER creation should also fail EXECUTE (retry at EXECUTE level, not RENDER level)
                *   `[✅]` 36.d.iv.F.3. **RATIONALE:** If RENDER job doesn't exist, stage never completes (stuck in running_thesis indefinitely)
        *   `[✅]` 36.d.v. **RESEARCH COMPLETE:** Review Step 19 and Step 20 validation changes
            *   `[✅]` 36.d.v.A. **Step 19** (Doc-Centric Fixes 3.md lines 499-517): Added `user_jwt` to RENDER job payload for trigger authentication
                *   `[✅]` 36.d.v.A.1. RENDER job payload must include ALL 8 required fields: `user_jwt`, `projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `documentIdentity`, `documentKey`, `sourceContributionId`
                *   `[✅]` 36.d.v.A.2. Each field has type validation requirements (strings for most, number for iterationNumber, FileType for documentKey)
                *   `[✅]` 36.d.v.A.3. This validation ensures trigger can extract `user_jwt` for authentication and worker can process jobs
            *   `[✅]` 36.d.v.B. **Step 20** (Doc-Centric Fixes 3.md lines 519-537): Fixed documentIdentity extraction sequencing and added validation
                *   `[✅]` 36.d.v.B.1. Moved `document_relationships` initialization/persistence to occur BEFORE RENDER job creation
                *   `[✅]` 36.d.v.B.2. Added strict validation: `document_relationships` must be a record, `document_relationships[stageSlug]` must exist
                *   `[✅]` 36.d.v.B.3. Changed extraction from "first key found" to "specific stageSlug key" to prevent wrong value extraction
            *   `[✅]` 36.d.v.C. **CURRENT VALIDATION LOGIC** (executeModelCallAndSave.ts lines 1350-1370):
                *   `[✅]` 36.d.v.C.1. Line 1350-1357: Validates `validatedDocumentKey` exists, is string, is non-empty, throws error if invalid
                *   `[✅]` 36.d.v.C.2. Line 1359-1362: Validates `validatedDocumentKey` is a valid `FileType`, throws error if invalid
                *   `[✅]` 36.d.v.C.3. Line 1364-1370: Validates `documentIdentity` exists, is string, is non-empty, throws error if invalid
                *   `[✅]` 36.d.v.C.4. Line 1336-1344: Validates `document_relationships` is a record and `document_relationships[stageSlug]` exists
                *   `[✅]` 36.d.v.C.5. Line 1373-1375: Validates `contribution.id` exists, is string, is non-empty
            *   `[✅]` 36.d.v.D. **PURPOSE OF VALIDATIONS:** Ensure RENDER job payload is COMPLETE before creation
                *   `[✅]` 36.d.v.D.1. **Prevents silent failures** in downstream processing (processRenderJob, renderDocument)
                *   `[✅]` 36.d.v.D.2. **Fails fast on programmer errors** (missing required fields, invalid types)
                *   `[✅]` 36.d.v.D.3. **Enables integration test expectations** (tests assert RENDER job exists with valid payload)
                *   `[✅]` 36.d.v.D.4. **Ensures stage completion** (RENDER jobs with incomplete payloads would fail processing, blocking stage completion)
            *   `[✅]` 36.d.v.E. **WHY VALIDATIONS ARE THROWING:** The validations are CORRECT and INTENTIONAL - they catch programmer errors
                *   `[✅]` 36.d.v.E.1. If `validatedDocumentKey` is undefined, it means `document_key` is missing from EXECUTE job payload (programmer error)
                *   `[✅]` 36.d.v.E.2. If `documentIdentity` is undefined, it means `document_relationships` was not persisted correctly (bug in sequencing)
                *   `[✅]` 36.d.v.E.3. These errors SHOULD fail EXECUTE jobs to force developers to fix bugs
            *   `[✅]` 36.d.v.F. **THE PROBLEM:** Validations are INSIDE try-catch block (lines 1423-1425 per research doc)
                *   `[✅]` 36.d.v.F.1. Try-catch swallows validation exceptions, preventing them from failing EXECUTE jobs
                *   `[✅]` 36.d.v.F.2. This contradicts validation purpose (fail fast on programmer errors)
                *   `[✅]` 36.d.v.F.3. This contradicts integration test expectations (tests expect RENDER jobs to exist)
                *   `[✅]` 36.d.v.F.4. **THE FIX:** Move ALL validation logic OUTSIDE try-catch so exceptions propagate to caller
        *   `[✅]` 36.d.vi. **IMPLEMENTATION STRATEGY SUMMARY (FINAL - Recipe step validation clarification):**
            *   `[✅]` 36.d.vi.A. **KEY INSIGHT - EXECUTE and RENDER share the same validated recipe step:**
                *   `[✅]` 36.d.vi.A.1. **Recipe Step Validation:** The database recipe step is ALREADY validated before the EXECUTE job is created
                *   `[✅]` 36.d.vi.A.2. **EXECUTE Job:** Runs the recipe step, calls AI model, produces JSON (already validated by reaching line 1000)
                *   `[✅]` 36.d.vi.A.3. **RENDER Job:** Uses the SAME recipe step to transform JSON to markdown
                *   `[✅]` 36.d.vi.A.4. **Code Validation Purpose:** The validation at lines 1336-1396 checks that OUR CODE correctly extracted and passed data from the validated recipe step
                *   `[✅]` 36.d.vi.A.5. **Not Recipe Validation:** We're NOT validating "is the recipe step valid" - we're validating "did our code handle the valid recipe step correctly"
            *   `[✅]` 36.d.vi.B. **TWO CONCERNS - Database errors and Code bugs:**
                *   `[✅]` 36.d.vi.B.1. **Concern 1: Code Bugs** - Missing validatedDocumentKey means our code failed to extract/pass data from the valid recipe step (programmer error)
                *   `[✅]` 36.d.vi.B.2. **Concern 2: Database Operation Errors** - After model returns valid JSON and it's saved, RENDER job creation may fail:
                    *   `[✅]` 36.d.vi.B.2.a. **Programmer error:** Application failed to properly construct the insert (malformed payload despite validation)
                    *   `[✅]` 36.d.vi.B.2.b. **Transient service error:** Database had temporary failure (connection loss, RLS temporary issue)
                *   `[✅]` 36.d.vi.B.3. **User Direction:** "error loud, hard, and fast on programmer errors, backoff and retry on transient service errors"
                *   `[✅]` 36.d.vi.B.4. **Critical Constraint:** "What we cannot do is let the RENDER just vanish silently"
            *   `[✅]` 36.d.vi.C. **EXECUTE vs RENDER JOB INDEPENDENCE:**
                *   `[✅]` 36.d.vi.C.1. EXECUTE job creates valid JSON artifact (expensive AI model call)
                *   `[✅]` 36.d.vi.C.2. RENDER job transforms JSON to markdown (cheap local transformation, uses same recipe step)
                *   `[✅]` 36.d.vi.C.3. **User Rule:** "an EXECUTE job should not fail when a RENDER job fails"
                *   `[✅]` 36.d.vi.C.4. **Rationale:** Valid JSON successfully saved to database/storage must NOT be discarded (would waste expensive API costs)
                *   `[✅]` 36.d.vi.C.5. **BUT:** RENDER job creation is MANDATORY when output_type is RenderedDocument (integration tests assert renderJob exists)
            *   `[✅]` 36.d.vi.D. **VALIDATION STAYS WHERE IT IS:**
                *   `[✅]` 36.d.vi.D.1. **Current Location:** Lines 1336-1396 (AFTER model call at line 1000) - THIS IS CORRECT
                *   `[✅]` 36.d.vi.D.2. **Validation checks CODE correctness:** Did our code correctly handle data from the validated recipe step?
                *   `[✅]` 36.d.vi.D.3. **Dynamic fields require contribution:** `documentIdentity` from `contribution.document_relationships[stageSlug]` and `sourceContributionId` from `contribution.id` can ONLY be known after contribution is created
                *   `[✅]` 36.d.vi.D.4. **Static fields from validated recipe:** `validatedDocumentKey` should be derived from recipe step that was already validated before model call - if undefined, it's a code bug
                *   `[✅]` 36.d.vi.D.5. **No need to move validation:** Validation is checking code correctness, not recipe step validity
            *   `[✅]` 36.d.vi.E. **DATABASE INSERT ERROR CATEGORIZATION:**
                *   `[✅]` 36.d.vi.E.1. **Current Code:** Lines 1410-1421 insert RENDER job, log error on failure, but don't throw (swallowed by try-catch at 1423-1425)
                *   `[✅]` 36.d.vi.E.2. **Programmer Error Indicators:**
                    *   `[✅]` 36.d.vi.E.2.a. Foreign key violations (invalid session_id, user_id, parent_job_id)
                    *   `[✅]` 36.d.vi.E.2.b. Check constraint violations (invalid enum values, null required fields)
                    *   `[✅]` 36.d.vi.E.2.c. Type errors (payload not valid JSON)
                *   `[✅]` 36.d.vi.E.3. **Transient Error Indicators:**
                    *   `[✅]` 36.d.vi.E.3.a. Connection timeouts
                    *   `[✅]` 36.d.vi.E.3.b. "too many connections" errors
                    *   `[✅]` 36.d.vi.E.3.c. Temporary RLS policy failures (user_id mismatch that might resolve)
                *   `[✅]` 36.d.vi.E.4. **Action Required:** Inspect `renderInsertError.code` and `renderInsertError.message` to categorize error
            *   `[✅]` 36.d.vi.F. **FINAL IMPLEMENTATION PLAN (SIMPLIFIED):**
                *   `[✅]` 36.d.vi.F.1. **STEP 1 - Remove silent failure try-catch:**
                    *   `[✅]` 36.d.vi.F.1.a. Remove try-catch at lines 1423-1425 (currently swallows all errors)
                    *   `[✅]` 36.d.vi.F.1.b. Let validation exceptions propagate naturally
                    *   `[✅]` 36.d.vi.F.1.c. Validation errors are code bugs - they SHOULD fail EXECUTE to force developer to fix
                *   `[✅]` 36.d.vi.F.2. **STEP 2 - Categorize database insert errors:**
                    *   `[✅]` 36.d.vi.F.2.a. At lines 1416-1421, when `renderInsertError` exists, inspect error details
                    *   `[✅]` 36.d.vi.F.2.b. If programmer error (FK violation, constraint violation): throw RenderJobEnqueueError immediately
                    *   `[✅]` 36.d.vi.F.2.c. If transient error (connection timeout, "too many connections"): throw to trigger job retry OR implement local retry with backoff
                *   `[✅]` 36.d.vi.F.3. **STEP 3 - Keep validation exactly where it is:**
                    *   `[✅]` 36.d.vi.F.3.a. Validation at lines 1336-1396 stays in place (checks code handled recipe step data correctly)
                    *   `[✅]` 36.d.vi.F.3.b. Validation errors propagate to caller (no try-catch swallowing them)
                    *   `[✅]` 36.d.vi.F.3.c. If validation fails, it's a code bug that needs fixing
                *   `[✅]` 36.d.vi.F.4. **EXPECTED BEHAVIOR AFTER FIX:**
                    *   `[✅]` 36.d.vi.F.4.a. Code bugs (missing validatedDocumentKey, invalid documentIdentity) → EXECUTE job fails → forces developer to fix code
                    *   `[✅]` 36.d.vi.F.4.b. Database programmer errors → fail loud and fast with clear error message
                    *   `[✅]` 36.d.vi.F.4.c. Database transient errors → retry with backoff (RENDER job eventually created or permanent failure logged)
                    *   `[✅]` 36.d.vi.F.4.d. No silent failures → users never wait indefinitely for non-existent RENDER jobs
                    *   `[✅]` 36.d.vi.F.4.e. Valid JSON from successful model calls is preserved (EXECUTE completes, RENDER creation failures are visible)
    *   `[ ]`   36.e. [TEST-UNIT] Rerun tests proving fix works (when implementation complete)
    *   `[ ]`   36.f. [TEST-INT] Prove RENDER job creation integrates correctly with job worker
    *   `[ ]`   36.g. [CRITERIA] RENDER job failures are visible, EXECUTE jobs fail when RENDER is required but cannot be created, errors are actionable
    *   `[ ]`   36.h. [COMMIT] Fix RENDER job silent failure in executeModelCallAndSave

