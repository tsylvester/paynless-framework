[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement


## Objectives

## Expected Outcome


# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## Add Idem keys to project, session, generate, redo
- Users report multiple projects, sessions, generates, and redos on a single click
- Probably delay or transient errors between Supabase and Netlify

### Phase 1: Database Infrastructure

*   `[✅]`   [DB] supabase/migrations **Add `idempotency_key` column to `dialectic_projects`, `dialectic_sessions`, and `dialectic_generation_jobs`**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a `TEXT` column `idempotency_key` to `dialectic_projects` with a `UNIQUE` constraint to prevent duplicate project creation from retried requests
    *   `[✅]`   Add a `TEXT` column `idempotency_key` to `dialectic_sessions` with a `UNIQUE` constraint to prevent duplicate session creation from retried requests
    *   `[✅]`   Add a `TEXT` column `idempotency_key` to `dialectic_generation_jobs` with a `UNIQUE` constraint to prevent duplicate job creation from retried requests
    *   `[✅]`   All three columns are nullable to allow backward compatibility with existing rows; new inserts from updated code will always provide a key
    *   `[✅]`   Follow the existing `token_wallet_transactions.idempotency_key` pattern already in the codebase
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — database schema change providing the constraint layer that all upstream idempotency enforcement depends on
  *   `[✅]`   `module`
    *   `[✅]`   Database schema: `dialectic_projects`, `dialectic_sessions`, `dialectic_generation_jobs` tables — idempotency constraint surface
    *   `[✅]`   Boundary: consumed by `dialectic-service` edge functions (`createProject`, `startSession`, `generateContribution`, `regenerateDocument`)
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_projects` table — existing table, adding column
    *   `[✅]`   `dialectic_sessions` table — existing table, adding column
    *   `[✅]`   `dialectic_generation_jobs` table — existing table, adding column
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `supabase/migrations/YYYYMMDDHHMMSS_add_idempotency_keys.sql`
    *   `[✅]`   `ALTER TABLE public.dialectic_projects ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;`
    *   `[✅]`   `ALTER TABLE public.dialectic_sessions ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;`
    *   `[✅]`   `ALTER TABLE public.dialectic_generation_jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;`
    *   `[✅]`   Add `COMMENT ON COLUMN` for each column explaining purpose: "Client-provided key to prevent duplicate creation from retried requests"
  *   `[✅]`   `supabase/functions/types_db.ts`
    *   `[✅]`   Regenerate `types_db.ts` from the database after migration is applied so that `Row`, `Insert`, and `Update` types for all three tables include `idempotency_key`
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer — provides constraint surface consumed by adapter/app layers
    *   `[✅]`   All dependencies are inward-facing (schema only)
    *   `[✅]`   All provides are outward-facing (consumed by edge functions)
  *   `[✅]`   `requirements`
    *   `[✅]`   Migration applies cleanly on top of existing schema
    *   `[✅]`   Existing rows remain valid (nullable column, no NOT NULL constraint)
    *   `[✅]`   Duplicate inserts with the same `idempotency_key` are rejected by the UNIQUE constraint
    *   `[✅]`   `types_db.ts` reflects the new columns in Row/Insert/Update for all three tables

### Phase 2: Backend Edge Functions

*   `[✅]`   [BE] supabase/functions/dialectic-service/`createProject` **Add idempotency key enforcement to project creation**
  *   `[✅]`   `objective`
    *   `[✅]`   Accept an `idempotencyKey` field from the incoming `FormData` payload
    *   `[✅]`   Include `idempotency_key` in the `dialectic_projects` insert
    *   `[✅]`   When insert fails with unique constraint violation on `idempotency_key` (code `23505`), return the existing project instead of an error
    *   `[✅]`   If `idempotencyKey` is missing or empty from the FormData, reject with 400
  *   `[✅]`   `role`
    *   `[✅]`   Adapter — edge function handler for project creation, enforcing at-most-once semantics
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-service/createProject` — project creation with idempotency guard
    *   `[✅]`   Boundary: receives FormData from `index.ts` router, inserts into `dialectic_projects` via Supabase client
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_projects` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `FileManagerService` — infrastructure layer, inward (unchanged)
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `FormData` containing `idempotencyKey` field
    *   `[✅]`   `SupabaseClient` for database operations
    *   `[✅]`   `User` for ownership
  *   `[✅]`   unit/`createProject.test.ts`
    *   `[✅]`   Test: rejects request when `idempotencyKey` is missing from FormData (400)
    *   `[✅]`   Test: rejects request when `idempotencyKey` is empty string (400)
    *   `[✅]`   Test: includes `idempotency_key` in the insert call to `dialectic_projects`
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`), returns existing project by querying with the key
    *   `[✅]`   Test: normal successful creation still works when idempotency key is unique
  *   `[✅]`   `createProject.ts`
    *   `[✅]`   Extract `idempotencyKey` from `payload.get('idempotencyKey')`
    *   `[✅]`   Validate `idempotencyKey` is present and non-empty, return `{ error: { message: "idempotencyKey is required", status: 400 } }` if missing
    *   `[✅]`   Add `idempotency_key: idempotencyKey` to the `.insert()` call on `dialectic_projects`
    *   `[✅]`   In the `createError` handler, when `createError.code === '23505'` and the message references `idempotency_key`, query for the existing project by `idempotency_key` and `user_id` and return it as success
  *   `[✅]`   `directionality`
    *   `[✅]`   Adapter layer — depends inward on infrastructure (DB), provides outward to router
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Duplicate requests with the same `idempotencyKey` return the same project, not an error
    *   `[✅]`   Missing `idempotencyKey` is rejected with 400
    *   `[✅]`   All existing tests continue to pass (updated to include `idempotencyKey` in FormData)
    *   `[✅]`   No duplicate projects are created from retried requests

*   `[✅]`   [BE] supabase/functions/dialectic-service/`startSession` **Add idempotency key enforcement to session creation**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `idempotencyKey: string` to `StartSessionPayload` in `dialectic.interface.ts`
    *   `[✅]`   Validate `idempotencyKey` is present and non-empty, reject with 400 if missing
    *   `[✅]`   Include `idempotency_key` in the `dialectic_sessions` insert
    *   `[✅]`   When insert fails with unique constraint violation on `idempotency_key` (code `23505`), query and return the existing session instead of an error
  *   `[✅]`   `role`
    *   `[✅]`   Adapter — edge function handler for session creation, enforcing at-most-once semantics
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-service/startSession` — session creation with idempotency guard
    *   `[✅]`   Boundary: receives typed payload from `index.ts` router, inserts into `dialectic_sessions` via Supabase client
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_sessions` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `dialectic.interface.ts` `StartSessionPayload` — shared types, same layer
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `StartSessionPayload` with `idempotencyKey` field
    *   `[✅]`   `SupabaseClient` for database operations
    *   `[✅]`   `User` for ownership
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   Add `idempotencyKey: string` to `StartSessionPayload`
  *   `[✅]`   unit/`startSession.errors.test.ts` (or appropriate test file)
    *   `[✅]`   Test: rejects request when `idempotencyKey` is missing from payload (400)
    *   `[✅]`   Test: rejects request when `idempotencyKey` is empty string (400)
    *   `[✅]`   Test: includes `idempotency_key` in the insert call to `dialectic_sessions`
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`), returns existing session by querying with the key
    *   `[✅]`   Test: normal successful session creation still works with unique idempotency key
  *   `[✅]`   `startSession.ts`
    *   `[✅]`   Destructure `idempotencyKey` from `payload`
    *   `[✅]`   Validate `idempotencyKey` is present and non-empty, return error with status 400 if missing
    *   `[✅]`   Add `idempotency_key: idempotencyKey` to the `.insert()` call on `dialectic_sessions`
    *   `[✅]`   In the `sessionInsertError` handler, when error code is `23505` and references `idempotency_key`, query for the existing session by `idempotency_key` and return it as success (re-assemble the `StartSessionSuccessResponse`)
  *   `[✅]`   `directionality`
    *   `[✅]`   Adapter layer — depends inward on infrastructure (DB) and shared types, provides outward to router
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Duplicate requests with the same `idempotencyKey` return the same session, not an error
    *   `[✅]`   Missing `idempotencyKey` is rejected with 400
    *   `[✅]`   All existing tests continue to pass (updated to include `idempotencyKey` in payloads)
    *   `[✅]`   No duplicate sessions are created from retried requests

*   `[✅]`   [BE] supabase/functions/dialectic-service/`generateContribution` **Add idempotency key enforcement to contribution generation job creation**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `idempotencyKey: string` to `GenerateContributionsPayload` in `dialectic.interface.ts`
    *   `[✅]`   Validate `idempotencyKey` is present and non-empty, reject with 400 if missing
    *   `[✅]`   Derive per-job idempotency keys as `${idempotencyKey}_${modelId}` for each model's job insert
    *   `[✅]`   Include derived `idempotency_key` in each `dialectic_generation_jobs` insert
    *   `[✅]`   When insert fails with unique constraint violation on `idempotency_key` (code `23505`), return the existing job IDs instead of an error
  *   `[✅]`   `role`
    *   `[✅]`   Adapter — edge function handler for generation job creation, enforcing at-most-once semantics per model
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-service/generateContribution` — job creation with idempotency guard
    *   `[✅]`   Boundary: receives typed payload from `index.ts` router, inserts into `dialectic_generation_jobs` via Supabase client
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_generation_jobs` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `dialectic.interface.ts` `GenerateContributionsPayload` — shared types, same layer
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `GenerateContributionsPayload` with `idempotencyKey` field
    *   `[✅]`   `SupabaseClient` for database operations
    *   `[✅]`   `User` for ownership
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   Add `idempotencyKey: string` to `GenerateContributionsPayload`
  *   `[✅]`   unit/`generateContribution.test.ts`
    *   `[✅]`   Test: rejects request when `idempotencyKey` is missing from payload (400)
    *   `[✅]`   Test: rejects request when `idempotencyKey` is empty string (400)
    *   `[✅]`   Test: derives per-job key as `${idempotencyKey}_${modelId}` and includes it in each insert
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`), returns existing job IDs by querying with derived keys
    *   `[✅]`   Test: normal successful job creation still works with unique idempotency key
  *   `[✅]`   `generateContribution.ts`
    *   `[✅]`   Destructure `idempotencyKey` from `payload` alongside existing fields
    *   `[✅]`   Validate `idempotencyKey` is present and non-empty, return `{ success: false, error: { message: "idempotencyKey is required", status: 400 } }` if missing
    *   `[✅]`   In the per-model loop, derive `const jobIdempotencyKey = `${idempotencyKey}_${modelId}``
    *   `[✅]`   Add `idempotency_key: jobIdempotencyKey` to `jobToInsert`
    *   `[✅]`   In the `insertError` handler, when error code is `23505` and references `idempotency_key`, query for the existing job by `idempotency_key` and push its ID to `jobIds` instead of returning failure
  *   `[✅]`   `directionality`
    *   `[✅]`   Adapter layer — depends inward on infrastructure (DB) and shared types, provides outward to router
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Duplicate requests with the same `idempotencyKey` return the same job IDs, not an error
    *   `[✅]`   Each model's job gets a deterministically derived key so partial retries are also idempotent
    *   `[✅]`   Missing `idempotencyKey` is rejected with 400
    *   `[✅]`   All existing tests continue to pass (updated to include `idempotencyKey` in payloads)
    *   `[✅]`   No duplicate jobs are created from retried requests, no duplicate AI token spend

*   `[✅]`   [BE] supabase/functions/dialectic-service/`regenerateDocument` **Add idempotency key enforcement to document regeneration job creation**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `idempotencyKey: string` to `RegenerateDocumentPayload` in `dialectic.interface.ts`
    *   `[✅]`   Validate `idempotencyKey` is present and non-empty, reject with 400 if missing
    *   `[✅]`   Derive per-document idempotency keys as `${idempotencyKey}_${documentKey}_${modelId}` for each document's cloned job
    *   `[✅]`   Include derived `idempotency_key` in each cloned `dialectic_generation_jobs` insert
    *   `[✅]`   When insert fails with unique constraint violation on `idempotency_key` (code `23505`), return the existing job IDs instead of an error
    *   `[✅]`   Update `isValidRegeneratePayload` type guard to require `idempotencyKey`
  *   `[✅]`   `role`
    *   `[✅]`   Adapter — edge function handler for document regeneration, enforcing at-most-once semantics per document
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-service/regenerateDocument` — regeneration job creation with idempotency guard
    *   `[✅]`   Boundary: receives typed payload from `index.ts` router, marks old jobs as `superseded` and inserts clone jobs into `dialectic_generation_jobs`
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_generation_jobs` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `dialectic.interface.ts` `RegenerateDocumentPayload` — shared types, same layer
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `RegenerateDocumentPayload` with `idempotencyKey` field
    *   `[✅]`   `SupabaseClient` for database operations
    *   `[✅]`   `User` and `authToken` for ownership and downstream auth
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   Add `idempotencyKey: string` to `RegenerateDocumentPayload`
  *   `[✅]`   unit/`regenerateDocument.test.ts` (create if not present, or add to existing test file)
    *   `[✅]`   Test: rejects request when `idempotencyKey` is missing from payload (400 via `isValidRegeneratePayload`)
    *   `[✅]`   Test: rejects request when `idempotencyKey` is empty string (400 via `isValidRegeneratePayload`)
    *   `[✅]`   Test: derives per-document key as `${idempotencyKey}_${documentKey}_${modelId}` and includes it in each cloned job insert
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`), returns existing job IDs
    *   `[✅]`   Test: normal successful regeneration still works with unique idempotency key
    *   `[✅]`   Test: the `superseded` status update on the old job is not duplicated on retry
  *   `[✅]`   `regenerateDocument.ts`
    *   `[✅]`   Update `isValidRegeneratePayload` to check `typeof value["idempotencyKey"] === "string"` and non-empty
    *   `[✅]`   In the per-document loop, derive `const jobIdempotencyKey = `${payload.idempotencyKey}_${docRef.documentKey}_${docRef.modelId}``
    *   `[✅]`   Add `idempotency_key: jobIdempotencyKey` to `cloneRow`
    *   `[✅]`   In the `insertError` handler, when error code is `23505` and references `idempotency_key`, query for the existing clone job by `idempotency_key` and push its ID to `jobIds` instead of returning failure
    *   `[✅]`   Guard the `superseded` update: before marking old job as superseded, check if a clone with the derived `idempotency_key` already exists; if so, skip the supersede+clone and just collect the existing clone's ID
  *   `[✅]`   `directionality`
    *   `[✅]`   Adapter layer — depends inward on infrastructure (DB) and shared types, provides outward to router
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Duplicate requests with the same `idempotencyKey` return the same job IDs, not an error
    *   `[✅]`   Each document's job gets a deterministically derived key so partial retries are also idempotent
    *   `[✅]`   The old job is only superseded once, not on every retry
    *   `[✅]`   Missing `idempotencyKey` is rejected with 400
    *   `[✅]`   All existing tests continue to pass
    *   `[✅]`   No duplicate regeneration jobs are created from retried requests

*   `[✅]`   [BE] supabase/functions/dialectic-worker/`processComplexJob` **Add deterministic idempotency keys to child job inserts in processComplexJob**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a deterministic `idempotency_key` to every child job inserted by `processComplexJob`, covering both the main planner fan-out (line 926) and the deferred planning path (line 288)
    *   `[✅]`   Derive keys as `${parentJobId}_${stepSlug}_${modelId}` for EXECUTE children produced by `planComplexStage`
    *   `[✅]`   Derive keys as `${parentJobId}_skeleton_${recipeStepId}` for skeleton PLAN jobs created for prerequisite-dependent steps
    *   `[✅]`   When a child job insert fails with unique constraint violation on `idempotency_key` (code `23505`), query for the existing child job and continue instead of throwing
    *   `[✅]`   Prevent duplicate child EXECUTE/PLAN jobs when the worker retries a PLAN job after a crash or timeout
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — worker-side job creation with at-most-once child job semantics
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-worker/processComplexJob` — PLAN job processor, creates child EXECUTE and skeleton PLAN jobs
    *   `[✅]`   Boundary: receives a PLAN or SKELETON job from the worker dispatcher, inserts child jobs into `dialectic_generation_jobs` via Supabase client
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_generation_jobs` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `dialectic.interface.ts` `DialecticJobRow`, `DialecticPlanJobPayload`, `DialecticSkeletonJobPayload` — shared types, same layer
    *   `[✅]`   `IPlanJobContext` — worker context interface, same layer
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `SupabaseClient<Database>` for database operations
    *   `[✅]`   `DialecticJobRow` with `id` (parentJobId) for deterministic key derivation
    *   `[✅]`   `IPlanJobContext` for `planComplexStage` and logger
  *   `[✅]`   unit/`processComplexJob.happy.test.ts`
    *   `[✅]`   Test: child jobs inserted by main planner include `idempotency_key` derived as `${parentJobId}_${stepSlug}_${modelId}`
    *   `[✅]`   Test: skeleton PLAN jobs include `idempotency_key` derived as `${parentJobId}_skeleton_${recipeStepId}`
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`) during child job insert, existing child jobs are queried and processing continues without throwing
    *   `[✅]`   Test: normal successful child job creation still works with unique idempotency keys
  *   `[✅]`   unit/`processComplexJob.intraStageDependency.test.ts`
    *   `[✅]`   Test: deferred planning path (skeleton job insert at line 288) includes deterministic `idempotency_key`
    *   `[✅]`   Test: on unique constraint violation during deferred planning insert, existing jobs are used and processing continues
  *   `[✅]`   `processComplexJob.ts`
    *   `[✅]`   In the main planner path (line 926): before inserting `childJobs`, iterate and assign `idempotency_key` to each child based on `${parentJobId}_${stepSlug}_${modelId}` for EXECUTE jobs or `${parentJobId}_skeleton_${recipeStepId}` for skeleton PLAN jobs
    *   `[✅]`   In the `insertError` handler at line 927: when error code is `23505` and references `idempotency_key`, query for existing child jobs by their derived keys and continue processing
    *   `[✅]`   In the deferred planning path (line 288): before inserting `childJobs`, iterate and assign `idempotency_key` to each child based on the same derivation scheme
    *   `[✅]`   In the `insertError` handler at line 289: when error code is `23505` and references `idempotency_key`, query for existing child jobs and continue processing
    *   `[✅]`   In the skeleton PLAN job construction (line 875): add `idempotency_key: \`${parentJobId}_skeleton_${step.id}\`` to `skeletonPlanJob`
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer — depends inward on DB schema, depends laterally on shared types
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Every child job insert includes a deterministic `idempotency_key`
    *   `[✅]`   Worker retries of the same PLAN job do not create duplicate child jobs
    *   `[✅]`   On constraint violation, existing child jobs are recovered and processing continues normally
    *   `[✅]`   All existing `processComplexJob` tests continue to pass with updated insert shapes
    *   `[✅]`   No duplicate child EXECUTE or skeleton PLAN jobs are created from worker retries

*   `[✅]`   [BE] supabase/functions/dialectic-worker/`continueJob` **Add deterministic idempotency key to continuation job insert in continueJob**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a deterministic `idempotency_key` to the continuation EXECUTE job inserted by `continueJob` (line 217)
    *   `[✅]`   Derive the key as `${job.id}_continue_${savedContribution.id}` using the source job ID and the saved contribution ID, which together uniquely identify the continuation point
    *   `[✅]`   When insert fails with unique constraint violation on `idempotency_key` (code `23505`), return `{ enqueued: true }` (the continuation was already created by a prior attempt)
    *   `[✅]`   Prevent duplicate continuation jobs when the worker retries an EXECUTE job after a crash between saving the contribution and enqueuing the continuation
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — worker-side continuation job creation with at-most-once semantics
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-worker/continueJob` — creates a follow-up EXECUTE job for chunked processing
    *   `[✅]`   Boundary: receives a completed EXECUTE job and its saved contribution, inserts a continuation job into `dialectic_generation_jobs` via Supabase client
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_generation_jobs` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `dialectic.interface.ts` `IContinueJobDeps`, `UnifiedAIResponse`, `DialecticContributionRow` — shared types, same layer
    *   `[✅]`   `Database` type from `types_db.ts` for `JobInsert` — infrastructure types, inward
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `SupabaseClient<Database>` for database operations
    *   `[✅]`   `Job` (source job) with `id` for deterministic key derivation
    *   `[✅]`   `DialecticContributionRow` with `id` (savedContribution) for deterministic key derivation
    *   `[✅]`   `IContinueJobDeps` for logger
  *   `[✅]`   unit/`continueJob.test.ts`
    *   `[✅]`   Test: continuation job insert includes `idempotency_key` derived as `${job.id}_continue_${savedContribution.id}`
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`), returns `{ enqueued: true }` instead of `{ enqueued: false, error }`
    *   `[✅]`   Test: normal successful continuation job creation still works with unique idempotency key
  *   `[✅]`   `continueJob.ts`
    *   `[✅]`   Add `idempotency_key: \`${job.id}_continue_${savedContribution.id}\`` to `newJobToInsert` (line 190)
    *   `[✅]`   In the `insertError` handler (line 219): when error code is `23505` and references `idempotency_key`, log at info level and return `{ enqueued: true }` (the continuation already exists from a prior attempt)
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer — depends inward on DB schema, depends laterally on shared types
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Continuation job insert includes a deterministic `idempotency_key`
    *   `[✅]`   Worker retries of the same EXECUTE job do not create duplicate continuation jobs
    *   `[✅]`   On constraint violation, the function returns success (the continuation was already enqueued)
    *   `[✅]`   All existing `continueJob` tests continue to pass with updated insert shape
    *   `[✅]`   No duplicate continuation EXECUTE jobs are created from worker retries

*   `[✅]`   [BE] supabase/functions/dialectic-worker/`executeModelCallAndSave` **Add deterministic idempotency key to RENDER job insert in executeModelCallAndSave**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a deterministic `idempotency_key` to the RENDER job inserted by `executeModelCallAndSave` (line 1714)
    *   `[✅]`   Derive the key as `${jobId}_render` using the source EXECUTE job ID, which uniquely identifies the render origin
    *   `[✅]`   When insert fails with unique constraint violation on `idempotency_key` (code `23505`), query for the existing RENDER job and use its data instead of throwing
    *   `[✅]`   Prevent duplicate RENDER jobs when the worker retries an EXECUTE job after a crash between completing execution and enqueuing the render
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — worker-side RENDER job creation with at-most-once semantics
  *   `[✅]`   `module`
    *   `[✅]`   `dialectic-worker/executeModelCallAndSave` — EXECUTE job processor, creates RENDER job on completion
    *   `[✅]`   Boundary: receives a completed EXECUTE job, inserts a RENDER job into `dialectic_generation_jobs` via Supabase client
  *   `[✅]`   `deps`
    *   `[✅]`   `dialectic_generation_jobs` table with `idempotency_key UNIQUE` column — infrastructure layer, inward
    *   `[✅]`   `dialectic.interface.ts` `ExecuteModelCallAndSaveParams`, `DialecticRenderJobPayload` — shared types, same layer
    *   `[✅]`   `types_db.ts` `TablesInsert<'dialectic_generation_jobs'>` — infrastructure types, inward
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `SupabaseClient<Database>` for database operations
    *   `[✅]`   `jobId` (source EXECUTE job ID) for deterministic key derivation
    *   `[✅]`   `ExecuteModelCallAndSaveParams` deps for logger
  *   `[✅]`   unit/`executeModelCallAndSave.render.test.ts`
    *   `[✅]`   Test: RENDER job insert includes `idempotency_key` derived as `${jobId}_render`
    *   `[✅]`   Test: on unique constraint violation (code `23505` on `idempotency_key`), existing RENDER job is queried and used instead of throwing
    *   `[✅]`   Test: normal successful RENDER job creation still works with unique idempotency key
  *   `[✅]`   `executeModelCallAndSave.ts`
    *   `[✅]`   Add `idempotency_key: \`${jobId}_render\`` to `insertObj` (line 1700)
    *   `[✅]`   In the `renderInsertError` handler (line 1718): when error code is `23505` and references `idempotency_key`, query for the existing RENDER job by `idempotency_key` and use its data instead of throwing `RenderJobEnqueueError`
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer — depends inward on DB schema, depends laterally on shared types
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   RENDER job insert includes a deterministic `idempotency_key`
    *   `[✅]`   Worker retries of the same EXECUTE job do not create duplicate RENDER jobs
    *   `[✅]`   On constraint violation, the existing RENDER job is recovered and processing continues normally
    *   `[✅]`   All existing `executeModelCallAndSave` tests continue to pass with updated insert shape
    *   `[✅]`   No duplicate RENDER jobs are created from worker retries
  *   `[✅]`   **Commit** `feat(dialectic-service): add idempotency key enforcement to createProject, startSession, generateContribution, regenerateDocument, processComplexJob, continueJob, executeModelCallAndSave`
    *   `[✅]`   Migration adding `idempotency_key` to three tables
    *   `[✅]`   Regenerated `types_db.ts`
    *   `[✅]`   Updated `dialectic.interface.ts` payloads with `idempotencyKey` field
    *   `[✅]`   Updated `createProject.ts` to extract key from FormData and enforce uniqueness
    *   `[✅]`   Updated `startSession.ts` to accept key in payload and enforce uniqueness
    *   `[✅]`   Updated `generateContribution.ts` to derive per-model keys and enforce uniqueness
    *   `[✅]`   Updated `regenerateDocument.ts` to derive per-document keys, guard supersede, and enforce uniqueness
    *   `[✅]`   Updated `processComplexJob.ts` to derive deterministic keys for child EXECUTE and skeleton PLAN jobs
    *   `[✅]`   Updated `continueJob.ts` to derive deterministic key for continuation jobs
    *   `[✅]`   Updated `executeModelCallAndSave.ts` to derive deterministic key for RENDER jobs
    *   `[✅]`   All backend unit tests updated and passing

### Phase 3: Frontend API Client

*   `[✅]`   [API] packages/api/src/`dialectic.api` **Pass idempotency keys through API client methods for createProject, startSession, generateContributions, regenerateDocument**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `idempotencyKey: string` to `CreateProjectPayload`, `StartSessionPayload`, `GenerateContributionsPayload`, and `RegenerateDocumentPayload` in `@paynless/types/dialectic.types.ts`
    *   `[✅]`   Update `createProject` to append `idempotencyKey` to the FormData sent to the edge function
    *   `[✅]`   `startSession`, `generateContributions`, and `regenerateDocument` already pass the full payload object — the new `idempotencyKey` field flows through automatically once added to the types
    *   `[✅]`   Verify all four methods correctly transmit the idempotency key to the edge function
  *   `[✅]`   `role`
    *   `[✅]`   Port — API client library bridging frontend store to backend edge functions
  *   `[✅]`   `module`
    *   `[✅]`   `@paynless/api/dialectic.api` — dialectic API client methods
    *   `[✅]`   Boundary: receives typed payloads from store actions, sends HTTP requests to `dialectic-service` edge function
  *   `[✅]`   `deps`
    *   `[✅]`   `@paynless/types` `dialectic.types.ts` — shared frontend types, same layer (updated in this node)
    *   `[✅]`   `ApiClient` — infrastructure adapter, inward
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Typed payloads from `@paynless/types` with `idempotencyKey` field
    *   `[✅]`   `ApiClient` for HTTP transport
  *   `[✅]`   interface/`packages/types/src/dialectic.types.ts`
    *   `[✅]`   Add `idempotencyKey: string` to `CreateProjectPayload`
    *   `[✅]`   Add `idempotencyKey: string` to `StartSessionPayload`
    *   `[✅]`   Add `idempotencyKey: string` to `GenerateContributionsPayload`
    *   `[✅]`   Add `idempotencyKey: string` to `RegenerateDocumentPayload`
  *   `[✅]`   unit/`dialectic.api.project.test.ts`
    *   `[✅]`   Test: `createProject` appends `idempotencyKey` to FormData
    *   `[✅]`   Test: existing createProject tests updated with `idempotencyKey` in payloads
  *   `[✅]`   unit/`dialectic.api.contribution.test.ts`
    *   `[✅]`   Test: `generateContributions` payload includes `idempotencyKey`
    *   `[✅]`   Test: `regenerateDocument` payload includes `idempotencyKey`
    *   `[✅]`   Test: existing tests updated with `idempotencyKey` in payloads
  *   `[✅]`   `dialectic.api.ts`
    *   `[✅]`   In `createProject`, add `formData.append('idempotencyKey', payload.get('idempotencyKey'))` — note: the store constructs FormData, so the key must be appended there; verify API passes it through
    *   `[✅]`   `startSession`, `generateContributions`, `regenerateDocument` already pass full payload objects — no source changes needed beyond the type additions, but verify in tests
  *   `[✅]`   `directionality`
    *   `[✅]`   Port layer — depends inward on types and API client, provides outward to store
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   All four API methods transmit `idempotencyKey` to the backend
    *   `[✅]`   All existing API tests continue to pass with updated payloads
    *   `[✅]`   Type system enforces `idempotencyKey` is present at compile time

### Phase 4: Store

*   `[✅]`   [STORE] packages/store/src/`dialecticStore` **Generate and attach idempotency keys in store actions for createProject, startSession, generateContributions, regenerateDocument**
  *   `[✅]`   `objective`
    *   `[✅]`   In `createDialecticProject`, generate a `crypto.randomUUID()` and include it as `idempotencyKey` in the FormData sent to the API
    *   `[✅]`   In `createProjectAndAutoStart`, generate a single `crypto.randomUUID()` for the project creation step and a separate one for the session start step
    *   `[✅]`   In `startNewSession` (or equivalent session-starting action), generate a `crypto.randomUUID()` and include it as `idempotencyKey` in the `StartSessionPayload`
    *   `[✅]`   In the action that calls `generateContributions`, generate a `crypto.randomUUID()` and include it as `idempotencyKey` in the `GenerateContributionsPayload`
    *   `[✅]`   In the action that calls `regenerateDocument`, generate a `crypto.randomUUID()` and include it as `idempotencyKey` in the `RegenerateDocumentPayload`
    *   `[✅]`   Keys are generated once per user action (button click) and reused on retry, not regenerated
  *   `[✅]`   `role`
    *   `[✅]`   App — state management layer, origin point for idempotency key generation
  *   `[✅]`   `module`
    *   `[✅]`   `@paynless/store/dialecticStore` — dialectic state management actions
    *   `[✅]`   Boundary: receives user intent from UI components, calls API client methods with complete payloads including idempotency keys
  *   `[✅]`   `deps`
    *   `[✅]`   `@paynless/api` `DialecticApiClient` — port layer, outward
    *   `[✅]`   `@paynless/types` `CreateProjectPayload`, `StartSessionPayload`, `GenerateContributionsPayload`, `RegenerateDocumentPayload` — shared types
    *   `[✅]`   `crypto.randomUUID()` — browser/runtime API
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Store state and API client instance
    *   `[✅]`   `crypto.randomUUID` for key generation
  *   `[✅]`   unit/`dialecticStore.project.test.ts`
    *   `[✅]`   Test: `createDialecticProject` generates an `idempotencyKey` and appends it to FormData
    *   `[✅]`   Test: `createProjectAndAutoStart` generates separate idempotency keys for project creation and session start steps
  *   `[✅]`   unit/`dialecticStore.session.test.ts`
    *   `[✅]`   Test: session-starting action includes `idempotencyKey` in the `StartSessionPayload` sent to API
  *   `[✅]`   unit/`dialecticStore.test.ts` (or relevant test file for generate/redo actions)
    *   `[✅]`   Test: generate action includes `idempotencyKey` in the `GenerateContributionsPayload` sent to API
    *   `[✅]`   Test: regenerate/redo action includes `idempotencyKey` in the `RegenerateDocumentPayload` sent to API
  *   `[✅]`   `dialecticStore.ts`
    *   `[✅]`   In `createDialecticProject`: add `formData.append('idempotencyKey', crypto.randomUUID())` before the API call
    *   `[✅]`   In `createProjectAndAutoStart`: generate `const projectIdemKey = crypto.randomUUID()` and `const sessionIdemKey = crypto.randomUUID()` at the top, pass to respective API calls
    *   `[✅]`   In session start action: add `idempotencyKey: crypto.randomUUID()` to the `StartSessionPayload`
    *   `[✅]`   In generate contributions action: add `idempotencyKey: crypto.randomUUID()` to the `GenerateContributionsPayload`
    *   `[✅]`   In regenerate document action: add `idempotencyKey: crypto.randomUUID()` to the `RegenerateDocumentPayload`
  *   `[✅]`   `directionality`
    *   `[✅]`   App layer — depends outward on port (API client), depends inward on types
    *   `[✅]`   No new outward dependencies introduced
  *   `[✅]`   `requirements`
    *   `[✅]`   Every user-facing create/start/generate/regenerate action generates and transmits a unique idempotency key
    *   `[✅]`   Keys are generated at action entry point (one per user intent)
    *   `[✅]`   All existing store tests continue to pass with updated payloads
    *   `[✅]`   End-to-end: a retried API call with the same key is rejected at the DB layer, preventing duplicates
  *   `[✅]`   **Commit** `feat(dialectic): add frontend idempotency key generation in API client and store`
    *   `[✅]`   Updated `@paynless/types/dialectic.types.ts` with `idempotencyKey` on four payload interfaces
    *   `[✅]`   Updated `dialectic.api.ts` to pass idempotency keys through to edge functions
    *   `[✅]`   Updated `dialecticStore.ts` to generate `crypto.randomUUID()` per user action
    *   `[✅]`   All frontend unit tests updated and passing

### Phase 5: UI Debounce

*   `[ ]`   [UI] apps/web **Disable submit buttons during in-flight requests to prevent user-initiated duplicate submissions**
  *   `[ ]`   `objective`
    *   `[ ]`   Identify all UI components that trigger project creation, session start, contribution generation, and document regeneration
    *   `[ ]`   Disable the submit/action button immediately on click using the existing `isCreatingProject`, `isStartingSession`, `contributionGenerationStatus`, and equivalent loading state flags from the store
    *   `[ ]`   Re-enable the button only after the API response (success or error) is received
    *   `[ ]`   Show a loading indicator (spinner or text change) on the button while the request is in flight
  *   `[ ]`   `role`
    *   `[ ]`   UI — presentation layer providing visual feedback and preventing double-clicks
  *   `[ ]`   `module`
    *   `[ ]`   `apps/web` — React components for project creation, session management, and generation controls
    *   `[ ]`   Boundary: reads loading flags from store, disables interactive elements during in-flight operations
  *   `[ ]`   `deps`
    *   `[ ]`   `@paynless/store` `dialecticStore` — loading state flags (`isCreatingProject`, `isStartingSession`, `contributionGenerationStatus`, `isAutoStarting`) — app layer, inward
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Store loading flags for each operation
    *   `[ ]`   Component props and event handlers
  *   `[ ]`   components (identify specific files during implementation)
    *   `[ ]`   Project creation form/dialog: disable "Create" button when `isCreatingProject === true` or `isAutoStarting === true`
    *   `[ ]`   Session start button: disable when `isStartingSession === true`
    *   `[ ]`   Generate button: disable when `contributionGenerationStatus === 'generating'`
    *   `[ ]`   Redo/Regenerate button: disable when regeneration is in flight (add loading flag if not present)
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer — depends inward on app (store) for state flags
    *   `[ ]`   No new outward dependencies introduced
  *   `[ ]`   `requirements`
    *   `[ ]`   No button can be clicked twice while a request is in flight
    *   `[ ]`   Visual feedback (disabled state + loading indicator) is shown during in-flight requests
    *   `[ ]`   Buttons re-enable on both success and error responses
    *   `[ ]`   This is a defense-in-depth layer — the backend idempotency keys are the primary guard
  *   `[ ]`   **Commit** `feat(ui): disable submit buttons during in-flight dialectic operations to prevent double-clicks`
    *   `[ ]`   Updated project creation, session start, generate, and regenerate UI components with disabled states
    *   `[ ]`   All affected components use existing store loading flags

## Add Github login & sync
- Enable Github for login 
- Let users sync to Github
- New repo or current
- Choose main or branch
- Populate finished docs to root/docs folder 
- Sync adds new docs or new versions of docs at each sync 

### Phase 1: Infrastructure & Backend

*   `[ ]`   [DB]+[RLS] supabase/migrations **Create `github_connections` table for storing user GitHub tokens**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a `github_connections` table that stores each user's GitHub OAuth access token, GitHub user ID, and GitHub username
    *   `[ ]`   Enforce one connection per user via UNIQUE constraint on `user_id`
    *   `[ ]`   RLS: users may SELECT and DELETE their own row; INSERT and UPDATE restricted to service role (edge functions store tokens server-side)
    *   `[ ]`   Cascade delete on `auth.users` removal
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — database schema and security policy
  *   `[ ]`   `module`
    *   `[ ]`   Database schema: `github_connections` table — user-to-GitHub credential mapping
    *   `[ ]`   Boundary: stores credentials consumed by `github-service` and `dialectic-service` edge functions
  *   `[ ]`   `deps`
    *   `[ ]`   `auth.users` table — FK target for `user_id`, infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `supabase/migrations/YYYYMMDDHHMMSS_create_github_connections.sql`
    *   `[ ]`   `CREATE TABLE public.github_connections` with columns: `id uuid PK DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `github_user_id text NOT NULL`, `github_username text NOT NULL`, `access_token text NOT NULL`, `token_scopes text`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `UNIQUE(user_id)`
    *   `[ ]`   RLS enabled: `ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;`
    *   `[ ]`   Policy `github_connections_select_own`: `USING (auth.uid() = user_id)` for SELECT
    *   `[ ]`   Policy `github_connections_delete_own`: `USING (auth.uid() = user_id)` for DELETE
    *   `[ ]`   No INSERT/UPDATE policy for `authenticated` role — writes go through service role client in edge functions
    *   `[ ]`   Add table and column comments
  *   `[ ]`   `supabase/functions/types_db.ts`
    *   `[ ]`   Regenerate from database schema after migration
    *   `[ ]`   Verify `github_connections` row type appears with all columns
  *   `[ ]`   `directionality`
    *   `[ ]`   Infrastructure layer
    *   `[ ]`   All dependencies inward (schema definition references `auth.users`)
    *   `[ ]`   Provides table to backend edge functions (`github-service`, `dialectic-service`)
  *   `[ ]`   `requirements`
    *   `[ ]`   Migration applies cleanly on existing database
    *   `[ ]`   RLS prevents cross-user reads/deletes
    *   `[ ]`   Service role can INSERT/UPDATE (for edge function token storage)
    *   `[ ]`   `types_db.ts` regenerated to include `github_connections`
    *   `[ ]`   Exempt from TDD (database migration / generated types)

*   `[ ]`   [CONFIG] supabase/config.toml **Enable GitHub OAuth provider and manual identity linking**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `[auth.external.github]` section enabling GitHub as an OAuth sign-in provider
    *   `[ ]`   Set `enable_manual_linking = true` so users who signed in via email or Google can link a GitHub identity to their existing account
    *   `[ ]`   Document required environment variables for GitHub OAuth App credentials
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — Supabase Auth configuration
  *   `[ ]`   `module`
    *   `[ ]`   Auth config: external OAuth providers
    *   `[ ]`   Boundary: enables Supabase Auth to redirect to GitHub and process OAuth callbacks
  *   `[ ]`   `deps`
    *   `[ ]`   Supabase Auth service — infrastructure layer
    *   `[ ]`   GitHub OAuth App — external dependency (user must register at `github.com/settings/applications/new` and set callback URL to Supabase auth callback endpoint)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `supabase/config.toml`
    *   `[ ]`   Change `enable_manual_linking = false` to `enable_manual_linking = true`
    *   `[ ]`   Add `[auth.external.github]` block after `[auth.external.apple]`:
      *   `[ ]`   `enabled = true`
      *   `[ ]`   `client_id = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)"`
      *   `[ ]`   `secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"`
      *   `[ ]`   `redirect_uri = ""`
      *   `[ ]`   `url = ""`
      *   `[ ]`   `skip_nonce_check = false`
  *   `[ ]`   `directionality`
    *   `[ ]`   Infrastructure layer
    *   `[ ]`   Provides GitHub OAuth to all auth consumers (authStore `loginWithGitHub`, `linkIdentity`)
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub OAuth login works end-to-end when env vars are set
    *   `[ ]`   Existing Google OAuth unaffected
    *   `[ ]`   Manual identity linking enabled for all providers
    *   `[ ]`   Exempt from TDD (configuration file)

*   `[ ]`   [BE] supabase/functions/_shared/adapters/github_adapter **GitHub REST API adapter with interface and backend types**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `IGitHubAdapter` interface defining all GitHub REST API operations needed by the application
    *   `[ ]`   Create `GitHubApiAdapter` implementation that calls the GitHub REST API v3 using `fetch`
    *   `[ ]`   Create backend GitHub types file defining request/response shapes for GitHub API interactions
    *   `[ ]`   Follows the existing adapter/DI pattern used by `AnthropicAdapter`, `OpenAIAdapter`, `StripePaymentAdapter`
  *   `[ ]`   `role`
    *   `[ ]`   Adapter — wraps external GitHub REST API behind an application-owned interface
  *   `[ ]`   `module`
    *   `[ ]`   External integration: GitHub REST API v3
    *   `[ ]`   Boundary: all GitHub HTTP calls flow through this adapter; no other module calls GitHub directly
  *   `[ ]`   `deps`
    *   `[ ]`   GitHub REST API v3 — external dependency, infrastructure layer
    *   `[ ]`   `fetch` (Deno built-in) — HTTP client, infrastructure layer
    *   `[ ]`   Backend GitHub types (`_shared/types/github.types.ts`) — created in this node as support file
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: GitHub access token (string) — injected at construction
    *   `[ ]`   All methods return typed response objects or throw typed errors
    *   `[ ]`   No Supabase or database interaction — pure HTTP adapter
  *   `[ ]`   interface/`supabase/functions/_shared/types/github.types.ts`
    *   `[ ]`   `GitHubUser` — `{ id: number; login: string; avatar_url: string; }`
    *   `[ ]`   `GitHubRepo` — `{ id: number; name: string; full_name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string; }`
    *   `[ ]`   `GitHubBranch` — `{ name: string; commit: { sha: string }; protected: boolean; }`
    *   `[ ]`   `GitHubCreateRepoPayload` — `{ name: string; description?: string; private?: boolean; auto_init?: boolean; }`
    *   `[ ]`   `GitHubPushFile` — `{ path: string; content: string; encoding: 'base64' | 'utf-8'; }`
    *   `[ ]`   `GitHubPushResult` — `{ commitSha: string; filesUpdated: number; }`
    *   `[ ]`   `IGitHubAdapter` — interface with methods: `getUser(): Promise<GitHubUser>`, `listRepos(): Promise<GitHubRepo[]>`, `listBranches(owner: string, repo: string): Promise<GitHubBranch[]>`, `createRepo(payload: GitHubCreateRepoPayload): Promise<GitHubRepo>`, `pushFiles(owner: string, repo: string, branch: string, files: GitHubPushFile[], commitMessage: string): Promise<GitHubPushResult>`
  *   `[ ]`   unit/`supabase/functions/tests/_shared/adapters/github_adapter.test.ts`
    *   `[ ]`   Test: constructor stores token, sets `Authorization: Bearer <token>` header on requests
    *   `[ ]`   Test: `getUser` calls `GET https://api.github.com/user` and returns typed `GitHubUser`
    *   `[ ]`   Test: `listRepos` calls `GET https://api.github.com/user/repos` with `sort=updated&per_page=100` and returns `GitHubRepo[]`
    *   `[ ]`   Test: `listBranches` calls `GET https://api.github.com/repos/:owner/:repo/branches` and returns `GitHubBranch[]`
    *   `[ ]`   Test: `createRepo` calls `POST https://api.github.com/user/repos` with JSON body and returns `GitHubRepo`
    *   `[ ]`   Test: `pushFiles` creates blobs, builds tree, creates commit, updates ref — returns `GitHubPushResult`
    *   `[ ]`   Test: non-200 responses throw with status and error message from GitHub API
  *   `[ ]`   `construction`
    *   `[ ]`   `constructor(token: string)` — stores token, creates default headers with `Authorization`, `Accept: application/vnd.github.v3+json`, `User-Agent: paynless-framework`
    *   `[ ]`   All methods are `async` and use `fetch` with the constructed headers
    *   `[ ]`   `pushFiles` uses the Git Trees API for efficient batch commits: `POST /git/blobs` per file, `POST /git/trees`, `POST /git/commits`, `PATCH /git/refs/heads/:branch`
  *   `[ ]`   `github_adapter.ts`
    *   `[ ]`   Import `IGitHubAdapter` and all request/response types from `../types/github.types.ts`
    *   `[ ]`   Implement `GitHubApiAdapter` class satisfying `IGitHubAdapter`
    *   `[ ]`   Private `fetchGitHub<T>(path: string, options?: RequestInit): Promise<T>` helper handling base URL, headers, error checking
    *   `[ ]`   `getUser()` — `GET /user`
    *   `[ ]`   `listRepos()` — `GET /user/repos?sort=updated&per_page=100`
    *   `[ ]`   `listBranches(owner, repo)` — `GET /repos/${owner}/${repo}/branches`
    *   `[ ]`   `createRepo(payload)` — `POST /user/repos` with JSON body, sets `auto_init: true` if not specified
    *   `[ ]`   `pushFiles(owner, repo, branch, files, commitMessage)` — Git Trees API batch commit:
      *   `[ ]`   Get current ref SHA via `GET /repos/${owner}/${repo}/git/ref/heads/${branch}`
      *   `[ ]`   Get current tree SHA from ref
      *   `[ ]`   Create blobs for each file via `POST /repos/${owner}/${repo}/git/blobs`
      *   `[ ]`   Create tree via `POST /repos/${owner}/${repo}/git/trees` with `base_tree`
      *   `[ ]`   Create commit via `POST /repos/${owner}/${repo}/git/commits`
      *   `[ ]`   Update ref via `PATCH /repos/${owner}/${repo}/git/refs/heads/${branch}`
      *   `[ ]`   Return `{ commitSha, filesUpdated: files.length }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer
    *   `[ ]`   Dependencies outward: GitHub REST API (external)
    *   `[ ]`   Provides inward: `IGitHubAdapter` interface to `github-service` and `dialectic-service`
  *   `[ ]`   `requirements`
    *   `[ ]`   All GitHub API calls flow through the adapter — no direct `fetch` to `api.github.com` elsewhere
    *   `[ ]`   Token never logged or exposed in error messages
    *   `[ ]`   All unit tests pass with mocked `fetch`
    *   `[ ]`   Adapter is injectable via `IGitHubAdapter` interface

*   `[ ]`   [BE] supabase/functions/github-service/index **Edge function handling GitHub token storage, connection status, and repo operations**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `github-service` edge function with action-based router handling: `storeToken`, `getConnectionStatus`, `disconnectGitHub`, `listRepos`, `listBranches`, `createRepo`
    *   `[ ]`   `storeToken`: validates GitHub token via `IGitHubAdapter.getUser()`, upserts into `github_connections` using admin client
    *   `[ ]`   `getConnectionStatus`: queries `github_connections` for the authenticated user, returns connection state and username
    *   `[ ]`   `disconnectGitHub`: deletes the user's row from `github_connections`
    *   `[ ]`   `listRepos`, `listBranches`, `createRepo`: read the user's token from `github_connections`, instantiate `GitHubApiAdapter`, proxy calls to adapter
    *   `[ ]`   All actions require JWT authentication except none — all are authenticated
  *   `[ ]`   `role`
    *   `[ ]`   Backend adapter — edge function exposing GitHub operations to the frontend via Supabase Functions
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: token lifecycle and repo operations
    *   `[ ]`   Boundary: receives authenticated requests from `GitHubApiClient` (frontend), interacts with `github_connections` table and GitHub API via `IGitHubAdapter`
  *   `[ ]`   `deps`
    *   `[ ]`   `IGitHubAdapter` / `GitHubApiAdapter` from `_shared/adapters/github_adapter.ts` — adapter layer, Node 3
    *   `[ ]`   Backend GitHub types from `_shared/types/github.types.ts` — domain types, Node 3
    *   `[ ]`   `github_connections` table — infrastructure layer, Node 1
    *   `[ ]`   `createSupabaseClient`, `createSupabaseAdminClient` from `_shared/auth.ts` — infrastructure layer
    *   `[ ]`   `handleCorsPreflightRequest`, `createErrorResponse`, `createSuccessResponse` from `_shared/cors-headers.ts` — infrastructure layer
    *   `[ ]`   `logger` from `_shared/logger.ts` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From request: JWT for user authentication, action name, action-specific payload
    *   `[ ]`   From `github_connections`: user's GitHub access token, GitHub user ID, GitHub username
    *   `[ ]`   From `IGitHubAdapter`: GitHub API responses (repos, branches, user info)
    *   `[ ]`   No concrete imports from higher or lateral layers
  *   `[ ]`   unit/`supabase/functions/tests/github-service/index.test.ts`
    *   `[ ]`   Test: `storeToken` — validates token via `getUser`, upserts row into `github_connections`, returns `{ connected: true, username }`
    *   `[ ]`   Test: `storeToken` — returns error if `getUser` call fails (invalid token)
    *   `[ ]`   Test: `getConnectionStatus` — returns `{ connected: true, username, github_user_id }` when row exists
    *   `[ ]`   Test: `getConnectionStatus` — returns `{ connected: false }` when no row exists
    *   `[ ]`   Test: `disconnectGitHub` — deletes row from `github_connections`, returns `{ disconnected: true }`
    *   `[ ]`   Test: `listRepos` — reads token from `github_connections`, calls `adapter.listRepos()`, returns repos
    *   `[ ]`   Test: `listRepos` — returns error if no GitHub connection exists
    *   `[ ]`   Test: `listBranches` — reads token, calls `adapter.listBranches(owner, repo)`, returns branches
    *   `[ ]`   Test: `createRepo` — reads token, calls `adapter.createRepo(payload)`, returns new repo
    *   `[ ]`   Test: unauthenticated requests return 401
    *   `[ ]`   Test: unknown action returns 400
  *   `[ ]`   `construction`
    *   `[ ]`   `serve` handler with CORS preflight check
    *   `[ ]`   Parse JSON body for `{ action, payload }`
    *   `[ ]`   Authenticate user via `createSupabaseClient(req)` + `getUser()`
    *   `[ ]`   Switch on `action` to dispatch to inline handler functions
    *   `[ ]`   For repo operations: read token from `github_connections` using admin client, construct `GitHubApiAdapter(token)`, call adapter method
  *   `[ ]`   `index.ts`
    *   `[ ]`   Import shared auth, CORS, logger utilities
    *   `[ ]`   Import `GitHubApiAdapter` and types
    *   `[ ]`   Helper `getUserGitHubToken(adminClient, userId)`: queries `github_connections` for user's `access_token`, returns token or null
    *   `[ ]`   Action `storeToken`: receive `{ providerToken }`, create `GitHubApiAdapter(providerToken)`, call `getUser()` to validate and get GitHub identity, upsert `github_connections` row via admin client
    *   `[ ]`   Action `getConnectionStatus`: query `github_connections` for user, return connection shape or `{ connected: false }`
    *   `[ ]`   Action `disconnectGitHub`: delete from `github_connections` where `user_id` matches
    *   `[ ]`   Action `listRepos`: get token via helper, create adapter, call `listRepos()`
    *   `[ ]`   Action `listBranches`: get token, create adapter, call `listBranches(payload.owner, payload.repo)`
    *   `[ ]`   Action `createRepo`: get token, create adapter, call `createRepo(payload)`
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer (edge function)
    *   `[ ]`   Dependencies inward: `IGitHubAdapter` (adapter), `github_connections` (infrastructure), auth utilities (infrastructure)
    *   `[ ]`   Provides outward: HTTP API consumed by `GitHubApiClient` in `@paynless/api`
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub token is never returned to the frontend — only stored server-side and used for API calls
    *   `[ ]`   `storeToken` validates the token before storing (rejects invalid tokens)
    *   `[ ]`   All actions require valid JWT
    *   `[ ]`   All unit tests pass
  *   `[ ]`   **Commit** `feat(be): add github_connections migration, GitHub OAuth config, GitHub adapter, and github-service edge function`
    *   `[ ]`   `supabase/migrations/YYYYMMDDHHMMSS_create_github_connections.sql` — new migration
    *   `[ ]`   `supabase/config.toml` — GitHub OAuth provider enabled, manual linking enabled
    *   `[ ]`   `supabase/functions/_shared/types/github.types.ts` — backend GitHub types
    *   `[ ]`   `supabase/functions/_shared/adapters/github_adapter.ts` — `IGitHubAdapter` + `GitHubApiAdapter`
    *   `[ ]`   `supabase/functions/github-service/index.ts` — new edge function with token + repo handlers
    *   `[ ]`   `supabase/functions/types_db.ts` — regenerated to include `github_connections`

*   `[ ]`   [BE] supabase/functions/dialectic-service/syncToGitHub **Sync rendered project documents to a GitHub repository**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a handler that syncs all rendered documents from `dialectic_project_resources` for a given project to the user's configured GitHub repository
    *   `[ ]`   Only sync rendered documents (from `dialectic_project_resources`), not raw contributions or manifests — this is NOT the full export
    *   `[ ]`   Files are placed in the configured target folder (default `/docs`) on the configured branch
    *   `[ ]`   Sync is additive/upsert — adds new files or updates existing files; does not delete files from the repo
    *   `[ ]`   Uses `IGitHubAdapter.pushFiles()` for efficient batch commit via Git Trees API
  *   `[ ]`   `role`
    *   `[ ]`   Backend service handler — orchestrates document retrieval from storage and push to GitHub
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service: GitHub document sync
    *   `[ ]`   Boundary: reads from `dialectic_project_resources` and `github_connections`, downloads from Supabase storage, pushes to GitHub via adapter
  *   `[ ]`   `deps`
    *   `[ ]`   `dialectic_project_resources` table — source of rendered documents, infrastructure layer
    *   `[ ]`   `dialectic_projects` table — `repo_url` JSONB column for repo/branch/folder config, infrastructure layer
    *   `[ ]`   `github_connections` table — user's GitHub token, infrastructure layer, Node 1
    *   `[ ]`   `IGitHubAdapter` / `GitHubApiAdapter` from `_shared/adapters/github_adapter.ts` — adapter layer, Node 3
    *   `[ ]`   `IStorageUtils` from `_shared/types/storage_utils.types.ts` — download files from Supabase storage, infrastructure layer
    *   `[ ]`   `downloadFromStorage` from `_shared/supabase_storage_utils.ts` — infrastructure layer
    *   `[ ]`   Backend GitHub types from `_shared/types/github.types.ts` — domain types, Node 3
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: `{ projectId: string }` from request payload + authenticated user
    *   `[ ]`   From `dialectic_projects.repo_url`: `{ provider, owner, repo, branch, folder }`
    *   `[ ]`   From `dialectic_project_resources`: list of resources with `storage_bucket`, `storage_path`, `file_name`, `mime_type`
    *   `[ ]`   From `github_connections`: user's GitHub `access_token`
    *   `[ ]`   Output: `{ commitSha, filesUpdated, syncedAt }` or error
  *   `[ ]`   interface/`supabase/functions/dialectic-service/dialectic.interface.ts`
    *   `[ ]`   `SyncToGitHubPayload` — `{ projectId: string }`
    *   `[ ]`   `GitHubRepoSettings` — `{ provider: 'github'; owner: string; repo: string; branch: string; folder: string; last_sync_at: string | null; }`
    *   `[ ]`   `SyncToGitHubResponse` — `{ commitSha: string; filesUpdated: number; syncedAt: string; }`
    *   `[ ]`   `UpdateProjectGitHubSettingsPayload` — `{ projectId: string; settings: GitHubRepoSettings; }`
    *   `[ ]`   Add `syncToGitHub` and `updateProjectGitHubSettings` to `DialecticServiceActionPayload` union
  *   `[ ]`   unit/`supabase/functions/tests/dialectic-service/syncToGitHub.test.ts`
    *   `[ ]`   Test: returns error if project not found
    *   `[ ]`   Test: returns error if user does not own the project
    *   `[ ]`   Test: returns error if `repo_url` is null (no GitHub repo configured)
    *   `[ ]`   Test: returns error if user has no GitHub connection in `github_connections`
    *   `[ ]`   Test: queries `dialectic_project_resources` for the project and downloads each file from storage
    *   `[ ]`   Test: converts downloaded file content to base64 and constructs `GitHubPushFile[]` with paths under the configured folder
    *   `[ ]`   Test: calls `adapter.pushFiles()` with correct owner, repo, branch, files, and commit message
    *   `[ ]`   Test: updates `dialectic_projects.repo_url` with `last_sync_at` timestamp after successful push
    *   `[ ]`   Test: returns `{ commitSha, filesUpdated, syncedAt }` on success
    *   `[ ]`   Test: handles empty `dialectic_project_resources` gracefully (returns success with 0 files)
  *   `[ ]`   `construction`
    *   `[ ]`   Signature: `export async function syncToGitHub(supabaseClient, adminClient, projectId, userId): Promise<SyncToGitHubResponse | { error }>`
    *   `[ ]`   DI: receives `supabaseClient` for user-scoped queries, `adminClient` for reading `github_connections`
  *   `[ ]`   `syncToGitHub.ts`
    *   `[ ]`   Fetch project from `dialectic_projects`, verify ownership
    *   `[ ]`   Parse `repo_url` JSONB as `GitHubRepoSettings`, validate required fields
    *   `[ ]`   Query `github_connections` for user's `access_token` via admin client
    *   `[ ]`   Construct `GitHubApiAdapter(token)`
    *   `[ ]`   Query `dialectic_project_resources` WHERE `project_id = projectId`
    *   `[ ]`   For each resource: download file bytes from `storage_bucket/storage_path` via `downloadFromStorage`
    *   `[ ]`   Convert each file to base64, build `GitHubPushFile` with path `${settings.folder}/${resource.file_name}`
    *   `[ ]`   Call `adapter.pushFiles(owner, repo, branch, files, commitMessage)`
    *   `[ ]`   Update `dialectic_projects.repo_url` JSONB merging `last_sync_at: new Date().toISOString()`
    *   `[ ]`   Return `{ commitSha, filesUpdated, syncedAt }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Service layer (backend handler)
    *   `[ ]`   Dependencies inward: `IGitHubAdapter` (adapter), tables (infrastructure), storage utils (infrastructure)
    *   `[ ]`   Provides outward: sync handler consumed by `dialectic-service/index.ts` router
  *   `[ ]`   `requirements`
    *   `[ ]`   Only `dialectic_project_resources` rows are synced — not raw contributions, manifests, or export ZIPs
    *   `[ ]`   Sync is additive — existing repo files not managed by sync are untouched
    *   `[ ]`   File paths in the repo use `${folder}/${file_name}` structure
    *   `[ ]`   `last_sync_at` is updated on the project after each successful sync
    *   `[ ]`   All unit tests pass

*   `[ ]`   [BE] supabase/functions/dialectic-service/index **Add `syncToGitHub` and `updateProjectGitHubSettings` action routing**
  *   `[ ]`   `objective`
    *   `[ ]`   Add two new action cases to the existing dialectic-service action router: `syncToGitHub` and `updateProjectGitHubSettings`
    *   `[ ]`   `syncToGitHub`: delegates to the `syncToGitHub` handler from Node 5
    *   `[ ]`   `updateProjectGitHubSettings`: inline handler that updates `dialectic_projects.repo_url` JSONB for the authenticated user's project
    *   `[ ]`   Add `github-service` to the `functions_without_jwt_verification` list in `config.toml` if needed, or ensure JWT is enforced (it should be enforced)
  *   `[ ]`   `role`
    *   `[ ]`   Backend adapter — action router extension
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service: action routing for GitHub sync and settings
    *   `[ ]`   Boundary: extends existing router; no new edge function
  *   `[ ]`   `deps`
    *   `[ ]`   `syncToGitHub` from `./syncToGitHub.ts` — backend handler, Node 5
    *   `[ ]`   `SyncToGitHubPayload`, `UpdateProjectGitHubSettingsPayload`, `GitHubRepoSettings` from `dialectic.interface.ts` — domain types, Node 5
    *   `[ ]`   Existing `dialectic-service/index.ts` router infrastructure — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `action === 'syncToGitHub'`: extract `projectId` from payload, pass to handler
    *   `[ ]`   `action === 'updateProjectGitHubSettings'`: extract `projectId` and `settings`, UPDATE `dialectic_projects` SET `repo_url` WHERE `id = projectId` AND `user_id = userId`
    *   `[ ]`   No new store reads or external calls beyond existing patterns
  *   `[ ]`   unit/`supabase/functions/tests/dialectic-service/index.routing.test.ts`
    *   `[ ]`   Test: action `syncToGitHub` dispatches to `syncToGitHub` handler with correct args
    *   `[ ]`   Test: action `updateProjectGitHubSettings` updates `repo_url` on the correct project for the authenticated user
    *   `[ ]`   Test: action `updateProjectGitHubSettings` returns error if project not owned by user
  *   `[ ]`   `construction`
    *   `[ ]`   Import `syncToGitHub` handler
    *   `[ ]`   Import new payload types from `dialectic.interface.ts`
    *   `[ ]`   Add case blocks in the action switch
  *   `[ ]`   `index.ts`
    *   `[ ]`   Add import for `syncToGitHub` handler
    *   `[ ]`   Add `case 'syncToGitHub'`: call `syncToGitHub(dbClient, adminClient, payload.projectId, user.id)`, return response
    *   `[ ]`   Add `case 'updateProjectGitHubSettings'`: validate payload, UPDATE `dialectic_projects` SET `repo_url = payload.settings` WHERE `id = payload.projectId` AND `user_id = user.id`, return updated project
    *   `[ ]`   Add new action types to `ActionHandlers` interface if needed
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer (edge function router)
    *   `[ ]`   Dependencies inward: `syncToGitHub` handler (service layer), types (domain layer)
    *   `[ ]`   Provides outward: HTTP API consumed by `DialecticApiClient` in `@paynless/api`
  *   `[ ]`   `requirements`
    *   `[ ]`   Existing dialectic-service actions unaffected
    *   `[ ]`   New actions require authentication
    *   `[ ]`   All unit tests pass
  *   `[ ]`   **Commit** `feat(be): add syncToGitHub handler and routing for GitHub document sync`
    *   `[ ]`   `supabase/functions/dialectic-service/syncToGitHub.ts` — sync rendered docs to GitHub
    *   `[ ]`   `supabase/functions/dialectic-service/dialectic.interface.ts` — sync + settings types
    *   `[ ]`   `supabase/functions/dialectic-service/index.ts` — new action routing

### Phase 2: Frontend API, Store, and Auth

*   `[ ]`   [API] packages/api/src/github.api **Frontend GitHub API client with types and ApiClient wiring**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `packages/types/src/github.types.ts` — frontend GitHub type definitions independent from dialectic types
    *   `[ ]`   Create `GitHubApiClient` class in `packages/api/src/github.api.ts` following the pattern of `DialecticApiClient`
    *   `[ ]`   Wire `GitHubApiClient` into `ApiClient` via a `github` accessor in `packages/api/src/apiClient.ts`
    *   `[ ]`   All methods call the `github-service` edge function via `this.apiClient.post()`
  *   `[ ]`   `role`
    *   `[ ]`   Port — frontend API adapter bridging stores to backend edge functions
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: frontend API client
    *   `[ ]`   Boundary: provides typed methods consumed by `githubStore` and `authStore`; calls `github-service` edge function
  *   `[ ]`   `deps`
    *   `[ ]`   `ApiClient` from `./apiClient.ts` — infrastructure layer (modified in this node to add accessor)
    *   `[ ]`   `ApiResponse` from `@paynless/types` — domain type
    *   `[ ]`   Frontend GitHub types from `@paynless/types` — domain types (created in this node as support file)
    *   `[ ]`   `logger` from `@paynless/utils` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: action payloads (providerToken for storeToken, owner+repo for listBranches, etc.)
    *   `[ ]`   Output: `ApiResponse<T>` for each method
    *   `[ ]`   Auth handled by `ApiClient` — JWT injected automatically
  *   `[ ]`   interface/`packages/types/src/github.types.ts`
    *   `[ ]`   `GitHubConnectionStatus` — `{ connected: boolean; username?: string; githubUserId?: string; }`
    *   `[ ]`   `GitHubRepo` — `{ id: number; name: string; full_name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string; }`
    *   `[ ]`   `GitHubBranch` — `{ name: string; commit: { sha: string }; protected: boolean; }`
    *   `[ ]`   `GitHubCreateRepoPayload` — `{ name: string; description?: string; private?: boolean; }`
    *   `[ ]`   `GitHubRepoSettings` — `{ provider: 'github'; owner: string; repo: string; branch: string; folder: string; last_sync_at: string | null; }`
    *   `[ ]`   `SyncToGitHubResponse` — `{ commitSha: string; filesUpdated: number; syncedAt: string; }`
    *   `[ ]`   `GitHubApiClient` interface — `storeToken(providerToken: string)`, `getConnectionStatus()`, `disconnectGitHub()`, `listRepos()`, `listBranches(owner, repo)`, `createRepo(payload)`, `syncToGitHub(projectId)`, `updateProjectGitHubSettings(projectId, settings)`
  *   `[ ]`   unit/`packages/api/src/github.api.test.ts`
    *   `[ ]`   Test: `storeToken` posts `{ action: 'storeToken', payload: { providerToken } }` to `github-service`
    *   `[ ]`   Test: `getConnectionStatus` posts `{ action: 'getConnectionStatus' }` to `github-service`
    *   `[ ]`   Test: `disconnectGitHub` posts `{ action: 'disconnectGitHub' }` to `github-service`
    *   `[ ]`   Test: `listRepos` posts `{ action: 'listRepos' }` to `github-service`
    *   `[ ]`   Test: `listBranches` posts correct action and payload to `github-service`
    *   `[ ]`   Test: `createRepo` posts correct action and payload to `github-service`
    *   `[ ]`   Test: `syncToGitHub` posts `{ action: 'syncToGitHub', payload: { projectId } }` to `dialectic-service`
    *   `[ ]`   Test: `updateProjectGitHubSettings` posts correct action and payload to `dialectic-service`
    *   `[ ]`   Test: error responses are returned as `ApiResponse` with error field populated
  *   `[ ]`   `construction`
    *   `[ ]`   `constructor(apiClient: ApiClient)` — stores reference to `ApiClient`
    *   `[ ]`   Each method calls `this.apiClient.post<ResponseType, PayloadType>(endpoint, body)` and returns `ApiResponse<T>`
  *   `[ ]`   `github.api.ts`
    *   `[ ]`   Import `ApiClient` from `./apiClient`
    *   `[ ]`   Import all types from `@paynless/types`
    *   `[ ]`   Implement `GitHubApiClient` class with all methods
    *   `[ ]`   Token and repo operations call `github-service` endpoint
    *   `[ ]`   Sync and settings operations call `dialectic-service` endpoint
  *   `[ ]`   `apiClient.ts` (support wiring)
    *   `[ ]`   Import `GitHubApiClient` from `./github.api`
    *   `[ ]`   Add `get github(): GitHubApiClient` accessor that returns `new GitHubApiClient(this)` (matching the pattern of existing domain client accessors)
  *   `[ ]`   `directionality`
    *   `[ ]`   Port layer (API client)
    *   `[ ]`   Dependencies inward: `ApiClient` (infrastructure), types (domain)
    *   `[ ]`   Provides outward: typed API methods to `githubStore` and `authStore`
  *   `[ ]`   `requirements`
    *   `[ ]`   All methods match the backend `github-service` and `dialectic-service` action contracts
    *   `[ ]`   Error handling follows existing `DialecticApiClient` pattern (try/catch, network error wrapping)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [STORE] packages/store/src/authStore **Add `loginWithGitHub`, `linkGitHubAccount`, and provider token capture**
  *   `[ ]`   `objective`
    *   `[ ]`   Implement `loginWithGitHub()` action mirroring the existing `loginWithGoogle()` pattern but with `scopes: 'repo'` for GitHub API access
    *   `[ ]`   Implement `linkGitHubAccount()` action using `supabase.auth.linkIdentity({ provider: 'github', options: { scopes: 'repo' } })` for existing users to add GitHub
    *   `[ ]`   Update `handleOAuthLogin('github')` to call `loginWithGitHub()` instead of throwing
    *   `[ ]`   In `onAuthStateChange` listener: when `SIGNED_IN` event fires with `session.provider_token` and the provider is `github`, call `api.github.storeToken(providerToken)` to persist the token server-side
  *   `[ ]`   `role`
    *   `[ ]`   App layer — state management for authentication
  *   `[ ]`   `module`
    *   `[ ]`   Auth: GitHub OAuth login, identity linking, and token capture
    *   `[ ]`   Boundary: calls Supabase Auth SDK and `GitHubApiClient.storeToken()`
  *   `[ ]`   `deps`
    *   `[ ]`   Supabase Auth SDK (`signInWithOAuth`, `linkIdentity`) — infrastructure layer
    *   `[ ]`   `GitHubApiClient.storeToken()` from `@paynless/api` — port layer, Node 7
    *   `[ ]`   `AuthStore` interface from `@paynless/types` — domain types (add `loginWithGitHub` and `linkGitHubAccount` to interface)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `loginWithGitHub()`: calls `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo, scopes: 'repo' } })`
    *   `[ ]`   `linkGitHubAccount()`: calls `supabase.auth.linkIdentity({ provider: 'github', options: { scopes: 'repo', redirectTo } })`
    *   `[ ]`   `onAuthStateChange`: detect `session.provider_token` on `SIGNED_IN` events, check `session.user.app_metadata.provider === 'github'`, fire `api.github.storeToken(session.provider_token)`
  *   `[ ]`   interface/`packages/types/src/auth.types.ts`
    *   `[ ]`   Add `loginWithGitHub: () => Promise<void>` to `AuthStore` interface
    *   `[ ]`   Add `linkGitHubAccount: () => Promise<void>` to `AuthStore` interface
  *   `[ ]`   unit/`packages/store/src/authStore.test.ts`
    *   `[ ]`   Test: `loginWithGitHub` calls `supabase.auth.signInWithOAuth` with `provider: 'github'` and `scopes: 'repo'`
    *   `[ ]`   Test: `loginWithGitHub` sets `isLoading` during call and clears after
    *   `[ ]`   Test: `loginWithGitHub` sets `error` on failure
    *   `[ ]`   Test: `handleOAuthLogin('github')` calls `loginWithGitHub` (no longer throws)
    *   `[ ]`   Test: `linkGitHubAccount` calls `supabase.auth.linkIdentity` with `provider: 'github'` and `scopes: 'repo'`
    *   `[ ]`   Test: auth listener captures `provider_token` on GitHub `SIGNED_IN` event and calls `api.github.storeToken()`
    *   `[ ]`   Test: auth listener does NOT call `storeToken` when provider is not `github`
    *   `[ ]`   Test: auth listener does NOT call `storeToken` when `provider_token` is null
  *   `[ ]`   `construction`
    *   `[ ]`   `loginWithGitHub` mirrors `loginWithGoogle` exactly, substituting `provider: 'github'` and adding `scopes: 'repo'`
    *   `[ ]`   `linkGitHubAccount` uses `linkIdentity` (Supabase Auth method for adding an identity to an existing user)
    *   `[ ]`   Token capture logic in `initAuthListener` — minimal addition to existing `SIGNED_IN` handler
  *   `[ ]`   `authStore.ts`
    *   `[ ]`   Add `loginWithGitHub` action (pattern mirrors `loginWithGoogle` at lines 155-184)
    *   `[ ]`   Add `linkGitHubAccount` action
    *   `[ ]`   Update `handleOAuthLogin` switch: change `case 'github': throw` to `case 'github': return get().loginWithGitHub()`
    *   `[ ]`   In `initAuthListener`, inside the `SIGNED_IN` case: check `session?.provider_token` and `session?.user?.app_metadata?.provider === 'github'`, if true call `api.github.storeToken(session.provider_token)`
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer (store)
    *   `[ ]`   Dependencies inward: Supabase Auth SDK (infrastructure), `GitHubApiClient` (port)
    *   `[ ]`   Provides outward: `loginWithGitHub`, `linkGitHubAccount` actions to UI components
  *   `[ ]`   `requirements`
    *   `[ ]`   `loginWithGitHub` works end-to-end: redirects to GitHub, comes back, stores token
    *   `[ ]`   `linkGitHubAccount` adds GitHub identity to existing user account
    *   `[ ]`   Existing `loginWithGoogle` and email login unaffected
    *   `[ ]`   Provider token captured and stored on first GitHub sign-in
    *   `[ ]`   All unit tests pass

*   `[ ]`   [STORE] packages/store/src/githubStore **GitHub connection state, repo/branch listing, and sync actions**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `githubStore` as an independent Zustand store slice for GitHub integration state
    *   `[ ]`   Manage GitHub connection status (connected/disconnected, username)
    *   `[ ]`   Manage repo list, branch list, and repo creation for the repo picker UI
    *   `[ ]`   Manage sync-to-GitHub state (loading, error, result) for sync operations
    *   `[ ]`   Independent from `dialecticStore` and `authStore` — reads from `GitHubApiClient` only
  *   `[ ]`   `role`
    *   `[ ]`   App layer — state management for GitHub integration
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: connection lifecycle, repo browsing, sync state
    *   `[ ]`   Boundary: calls `GitHubApiClient` methods, provides state to UI components
  *   `[ ]`   `deps`
    *   `[ ]`   `GitHubApiClient` from `@paynless/api` — port layer, Node 7
    *   `[ ]`   Frontend GitHub types from `@paynless/types` — domain types, Node 7
    *   `[ ]`   `ApiResponse`, `ApiError` from `@paynless/types` — domain types
    *   `[ ]`   `logger` from `@paynless/utils` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced — does NOT import from `dialecticStore` or `authStore`
  *   `[ ]`   `context_slice`
    *   `[ ]`   Connection: `connectionStatus`, `isLoadingConnection`, `connectionError`
    *   `[ ]`   Repos: `repos`, `isLoadingRepos`, `reposError`
    *   `[ ]`   Branches: `branches`, `isLoadingBranches`, `branchesError`
    *   `[ ]`   Sync: `isSyncing`, `syncError`, `lastSyncResult`
    *   `[ ]`   Actions: `fetchConnectionStatus`, `disconnectGitHub`, `fetchRepos`, `fetchBranches`, `createRepo`, `syncToGitHub`, `updateProjectGitHubSettings`
  *   `[ ]`   interface/`packages/types/src/github.types.ts` (extend from Node 7)
    *   `[ ]`   `GitHubStoreState` — all state fields listed above
    *   `[ ]`   `GitHubStoreActions` — all action signatures
    *   `[ ]`   `GitHubStore` — `GitHubStoreState & GitHubStoreActions`
  *   `[ ]`   unit/`packages/store/src/githubStore.test.ts`
    *   `[ ]`   Test: `fetchConnectionStatus` calls `api.github.getConnectionStatus()` and sets `connectionStatus`
    *   `[ ]`   Test: `fetchConnectionStatus` sets `isLoadingConnection` during call
    *   `[ ]`   Test: `disconnectGitHub` calls `api.github.disconnectGitHub()` and clears `connectionStatus`
    *   `[ ]`   Test: `fetchRepos` calls `api.github.listRepos()` and sets `repos`
    *   `[ ]`   Test: `fetchBranches` calls `api.github.listBranches(owner, repo)` and sets `branches`
    *   `[ ]`   Test: `createRepo` calls `api.github.createRepo(payload)`, adds new repo to `repos` list
    *   `[ ]`   Test: `syncToGitHub` calls `api.github.syncToGitHub(projectId)`, sets `lastSyncResult`
    *   `[ ]`   Test: `syncToGitHub` sets `isSyncing` during call and `syncError` on failure
    *   `[ ]`   Test: `updateProjectGitHubSettings` calls `api.github.updateProjectGitHubSettings(projectId, settings)`
    *   `[ ]`   Test: initial state has `connectionStatus: null`, empty arrays, no errors
  *   `[ ]`   `construction`
    *   `[ ]`   `create<GitHubStore>()((set, get) => ({ ... }))` — Zustand store following existing store patterns
    *   `[ ]`   Each action uses `getApiClient().github` to access `GitHubApiClient`
  *   `[ ]`   `githubStore.ts`
    *   `[ ]`   Import `GitHubStore`, `GitHubConnectionStatus`, `GitHubRepo`, `GitHubBranch`, `GitHubRepoSettings`, `SyncToGitHubResponse` from `@paynless/types`
    *   `[ ]`   Import `getApiClient` from `@paynless/api`
    *   `[ ]`   Import `logger` from `@paynless/utils`
    *   `[ ]`   Define initial state values
    *   `[ ]`   Implement all actions: `fetchConnectionStatus`, `disconnectGitHub`, `fetchRepos`, `fetchBranches`, `createRepo`, `syncToGitHub`, `updateProjectGitHubSettings`, `reset`
    *   `[ ]`   Export `useGitHubStore` hook
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer (store)
    *   `[ ]`   Dependencies inward: `GitHubApiClient` (port), types (domain)
    *   `[ ]`   Provides outward: state and actions to UI components (`GitHubConnectionCard`, `GitHubRepoSettings`, `SyncToGitHubButton`)
  *   `[ ]`   `requirements`
    *   `[ ]`   Independent store — no cross-store imports
    *   `[ ]`   All actions handle loading and error states
    *   `[ ]`   All unit tests pass

### Phase 3: UI Components

*   `[ ]`   [UI] apps/web/src/components/auth/LoginForm **Add GitHub OAuth login button**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a "Sign in with GitHub" button alongside the existing "Sign in with Google" button
    *   `[ ]`   Button calls `handleOAuthLogin('github')` from `authStore` (which now dispatches to `loginWithGitHub`)
    *   `[ ]`   Minimal change — one button addition, no logic changes
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — login form
  *   `[ ]`   `module`
    *   `[ ]`   Auth: login page — OAuth provider buttons
    *   `[ ]`   Boundary: renders button, calls existing store action
  *   `[ ]`   `deps`
    *   `[ ]`   `handleOAuthLogin` from `useAuthStore` — app layer (pre-existing, now supports `'github'`)
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   GitHub icon (from `lucide-react` or inline SVG) — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useAuthStore`: `handleOAuthLogin` action, `isLoading` state
    *   `[ ]`   No new store reads beyond existing
  *   `[ ]`   unit/`apps/web/src/components/auth/LoginForm.test.tsx`
    *   `[ ]`   Test: renders "Sign in with GitHub" button
    *   `[ ]`   Test: clicking GitHub button calls `handleOAuthLogin('github')`
    *   `[ ]`   Test: GitHub button is disabled when `isLoading` is true
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   Add GitHub icon import
    *   `[ ]`   Add `<Button>` with GitHub icon and "Sign in with GitHub" text, `onClick={() => handleOAuthLogin('github')}`
    *   `[ ]`   Place below or alongside existing Google button in the OAuth section
  *   `[ ]`   `LoginForm.tsx`
    *   `[ ]`   Add GitHub icon import
    *   `[ ]`   Add GitHub `<Button>` in the OAuth buttons section, matching styling of the Google button
    *   `[ ]`   No other changes to `LoginForm`
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `authStore` (app layer), UI primitives (UI layer)
    *   `[ ]`   Provides outward: GitHub login entry point to end user
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub button visually matches the existing Google button style
    *   `[ ]`   Existing login flow unaffected
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/components/profile/GitHubConnectionCard **Profile card to connect, view, and disconnect GitHub account**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a profile settings card showing GitHub connection status
    *   `[ ]`   When disconnected: show "Connect GitHub" button that calls `linkGitHubAccount()` from `authStore`
    *   `[ ]`   When connected: show GitHub username and "Disconnect" button that calls `disconnectGitHub()` from `githubStore`
    *   `[ ]`   Fetches connection status on mount via `githubStore.fetchConnectionStatus()`
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — profile settings card
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: connection management UI
    *   `[ ]`   Boundary: reads from `githubStore`, calls `authStore.linkGitHubAccount()` and `githubStore.disconnectGitHub()`
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   `useAuthStore` from `@paynless/store` — app layer (for `linkGitHubAccount`)
    *   `[ ]`   `GitHubConnectionStatus` from `@paynless/types` — domain type, Node 7
    *   `[ ]`   `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card` — UI layer
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `connectionStatus`, `isLoadingConnection`, `connectionError`, `fetchConnectionStatus`, `disconnectGitHub`
    *   `[ ]`   From `useAuthStore`: `linkGitHubAccount`
  *   `[ ]`   unit/`apps/web/src/components/profile/GitHubConnectionCard.test.tsx`
    *   `[ ]`   Test: calls `fetchConnectionStatus` on mount
    *   `[ ]`   Test: shows loading skeleton while `isLoadingConnection` is true
    *   `[ ]`   Test: when disconnected, renders "Connect GitHub" button
    *   `[ ]`   Test: clicking "Connect GitHub" calls `linkGitHubAccount()`
    *   `[ ]`   Test: when connected, renders GitHub username and "Disconnect" button
    *   `[ ]`   Test: clicking "Disconnect" calls `disconnectGitHub()` and shows success toast
    *   `[ ]`   Test: shows error state when `connectionError` is set
  *   `[ ]`   `construction`
    *   `[ ]`   `export const GitHubConnectionCard: React.FC`
    *   `[ ]`   `useEffect` on mount: call `fetchConnectionStatus()`
    *   `[ ]`   Conditional render based on `connectionStatus?.connected`
  *   `[ ]`   `GitHubConnectionCard.tsx`
    *   `[ ]`   Import `useGitHubStore` and `useAuthStore` from `@paynless/store`
    *   `[ ]`   Import Card components and Button from UI primitives
    *   `[ ]`   Fetch connection status on mount
    *   `[ ]`   Render card with title "GitHub" and description
    *   `[ ]`   Connected state: show `@username`, "Disconnect" button
    *   `[ ]`   Disconnected state: show "Connect GitHub" button
    *   `[ ]`   Loading state: show skeleton
    *   `[ ]`   Error state: show error message
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), `authStore` (app), types (domain), UI primitives (UI)
    *   `[ ]`   Provides outward: rendered card to `Profile.tsx`
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub connection status reflects actual state from `github_connections` table
    *   `[ ]`   Connect and disconnect flows work end-to-end
    *   `[ ]`   Follows existing profile card patterns (`NotificationSettingsCard`, `ProfilePrivacySettingsCard`)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/pages/Profile **Render GitHubConnectionCard in profile page**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `GitHubConnectionCard` to the profile page alongside existing settings cards
    *   `[ ]`   Wrap in `ErrorBoundary` following existing pattern
    *   `[ ]`   Minimal change — one import, one render block
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — page composition
  *   `[ ]`   `module`
    *   `[ ]`   Profile page: settings card composition
    *   `[ ]`   Boundary: renders child component, no new state or logic
  *   `[ ]`   `deps`
    *   `[ ]`   `GitHubConnectionCard` from `../components/profile/GitHubConnectionCard` — UI layer, Node 11
    *   `[ ]`   All existing imports unchanged
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   No new store reads — `GitHubConnectionCard` is self-contained
    *   `[ ]`   Render only — no new props, state, or effects in `Profile.tsx`
  *   `[ ]`   unit/`apps/web/src/pages/Profile.test.tsx`
    *   `[ ]`   Add mock for `GitHubConnectionCard`
    *   `[ ]`   Test: `GitHubConnectionCard` mock renders in the profile page
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   Add import for `GitHubConnectionCard`
    *   `[ ]`   Add `<ErrorBoundary>` wrapping `<GitHubConnectionCard />` after the `NotificationSettingsCard` block
  *   `[ ]`   `Profile.tsx`
    *   `[ ]`   Add import line for `GitHubConnectionCard`
    *   `[ ]`   Add `<ErrorBoundary fallback={...}><GitHubConnectionCard /></ErrorBoundary>` block in the cards list
    *   `[ ]`   No other changes
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer (page)
    *   `[ ]`   Dependencies inward: `GitHubConnectionCard` (UI layer, component composition)
    *   `[ ]`   Provides outward: complete profile page to router
  *   `[ ]`   `requirements`
    *   `[ ]`   `GitHubConnectionCard` renders in the profile page
    *   `[ ]`   No existing profile behavior is changed
    *   `[ ]`   All existing tests pass

*   `[ ]`   [UI] apps/web/src/components/dialectic/GitHubRepoSettings **Repo, branch, and folder picker for dialectic project GitHub sync configuration**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a settings card for configuring which GitHub repo, branch, and folder a dialectic project syncs to
    *   `[ ]`   Repo selector: dropdown listing user's repos from `githubStore.repos`, plus "Create new repo" option
    *   `[ ]`   When "Create new repo" is selected: show name input and create button
    *   `[ ]`   Branch selector: dropdown listing branches for the selected repo, defaults to `default_branch`
    *   `[ ]`   Folder input: text field for target folder path, defaults to `/docs`
    *   `[ ]`   Save button: calls `githubStore.updateProjectGitHubSettings(projectId, settings)`
    *   `[ ]`   Shows "Connect GitHub first" message if user has no GitHub connection
    *   `[ ]`   Pre-populates fields from existing `project.repo_url` JSONB if previously configured
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — dialectic project settings component
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: project repo configuration UI
    *   `[ ]`   Boundary: reads from `githubStore`, reads project from `dialecticStore`, writes settings via `githubStore.updateProjectGitHubSettings`
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   `useDialecticStore` from `@paynless/store` — app layer (for `currentProjectDetail` and `repo_url`)
    *   `[ ]`   `GitHubRepo`, `GitHubBranch`, `GitHubRepoSettings`, `GitHubConnectionStatus` from `@paynless/types` — domain types, Node 7
    *   `[ ]`   `DialecticProject` from `@paynless/types` — domain type (for `repo_url`)
    *   `[ ]`   Card, Select, Input, Button, Label from UI primitives — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `connectionStatus`, `repos`, `branches`, `isLoadingRepos`, `isLoadingBranches`, `fetchRepos`, `fetchBranches`, `createRepo`, `updateProjectGitHubSettings`
    *   `[ ]`   From `useDialecticStore`: `currentProjectDetail` (for `id` and `repo_url`)
    *   `[ ]`   Output: calls `updateProjectGitHubSettings(projectId, settings)` on save
  *   `[ ]`   unit/`apps/web/src/components/dialectic/GitHubRepoSettings.test.tsx`
    *   `[ ]`   Test: shows "Connect GitHub" message when `connectionStatus.connected` is false
    *   `[ ]`   Test: fetches repos on mount when connected
    *   `[ ]`   Test: renders repo dropdown populated from `repos`
    *   `[ ]`   Test: selecting a repo fetches branches for that repo
    *   `[ ]`   Test: renders branch dropdown populated from `branches`
    *   `[ ]`   Test: renders folder input defaulting to `/docs`
    *   `[ ]`   Test: pre-populates fields from `project.repo_url` when previously configured
    *   `[ ]`   Test: "Create new repo" option shows name input and create button
    *   `[ ]`   Test: creating a repo calls `createRepo` and selects the new repo
    *   `[ ]`   Test: save button calls `updateProjectGitHubSettings` with correct settings shape
    *   `[ ]`   Test: save button is disabled when required fields are empty
  *   `[ ]`   `construction`
    *   `[ ]`   `export const GitHubRepoSettings: React.FC<{ projectId: string }>`
    *   `[ ]`   Local state for selected repo, branch, folder, and "create new" mode
    *   `[ ]`   `useEffect` on mount: fetch repos if connected
    *   `[ ]`   `useEffect` on repo selection: fetch branches
  *   `[ ]`   `GitHubRepoSettings.tsx`
    *   `[ ]`   Import `useGitHubStore`, `useDialecticStore` from `@paynless/store`
    *   `[ ]`   Import types from `@paynless/types`
    *   `[ ]`   Import UI primitives
    *   `[ ]`   Render: Card with title "GitHub Repository"
    *   `[ ]`   If not connected: show message with link to Profile page
    *   `[ ]`   If connected: render repo dropdown, branch dropdown, folder input, save button
    *   `[ ]`   "Create new repo" inline form when selected
    *   `[ ]`   Pre-populate from `currentProjectDetail.repo_url` if it exists
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), `dialecticStore` (app), types (domain), UI primitives (UI)
    *   `[ ]`   Provides outward: rendered card to `DialecticProjectDetailsPage`
  *   `[ ]`   `requirements`
    *   `[ ]`   Users can pick existing repo, create new repo, select branch, and set target folder
    *   `[ ]`   Default folder is `/docs` when not previously configured
    *   `[ ]`   Default branch is repo's `default_branch` when not previously configured
    *   `[ ]`   Settings persist to `dialectic_projects.repo_url` JSONB via backend
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/components/dialectic/SyncToGitHubButton **Button to trigger document sync to configured GitHub repository**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a button component that triggers `githubStore.syncToGitHub(projectId)` for the current project
    *   `[ ]`   Disabled when no GitHub repo is configured on the project (`repo_url` is null)
    *   `[ ]`   Shows loading state during sync and success/error feedback via toast
    *   `[ ]`   Placed alongside the existing `ExportProjectButton` on the project details page
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — dialectic project action button
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: sync trigger
    *   `[ ]`   Boundary: reads sync state from `githubStore`, reads project from `dialecticStore`, triggers sync action
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   `useDialecticStore` from `@paynless/store` — app layer (for `currentProjectDetail`)
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   `Loader2` from `lucide-react` — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `isSyncing`, `syncError`, `syncToGitHub`
    *   `[ ]`   From `useDialecticStore`: `currentProjectDetail` (for `id` and `repo_url`)
    *   `[ ]`   Output: triggers sync, displays toast result
  *   `[ ]`   unit/`apps/web/src/components/dialectic/SyncToGitHubButton.test.tsx`
    *   `[ ]`   Test: renders "Sync to GitHub" button
    *   `[ ]`   Test: button is disabled when `currentProjectDetail.repo_url` is null
    *   `[ ]`   Test: button is disabled when `isSyncing` is true
    *   `[ ]`   Test: clicking button calls `syncToGitHub(projectId)`
    *   `[ ]`   Test: shows loading spinner while `isSyncing` is true
    *   `[ ]`   Test: shows success toast with file count on successful sync
    *   `[ ]`   Test: shows error toast on sync failure
  *   `[ ]`   `construction`
    *   `[ ]`   `export const SyncToGitHubButton: React.FC<{ projectId: string }>`
    *   `[ ]`   Click handler calls `syncToGitHub(projectId)`, then toasts result
    *   `[ ]`   `isDisabled`: `!currentProjectDetail?.repo_url || isSyncing`
  *   `[ ]`   `SyncToGitHubButton.tsx`
    *   `[ ]`   Import `useGitHubStore`, `useDialecticStore` from `@paynless/store`
    *   `[ ]`   Import `Button`, `Loader2`, `toast`
    *   `[ ]`   Compute disabled state from `repo_url` and `isSyncing`
    *   `[ ]`   Render button with GitHub icon, loading spinner when syncing
    *   `[ ]`   Handle click: call sync, toast success/error
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), `dialecticStore` (app), UI primitives (UI)
    *   `[ ]`   Provides outward: rendered button to `DialecticProjectDetailsPage`
  *   `[ ]`   `requirements`
    *   `[ ]`   Sync only triggers when a repo is configured
    *   `[ ]`   Feedback on sync result (success with file count, or error)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/pages/DialecticProjectDetailsPage **Render GitHubRepoSettings and SyncToGitHubButton on project details page**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `GitHubRepoSettings` card and `SyncToGitHubButton` to the project details page
    *   `[ ]`   `SyncToGitHubButton` placed alongside the existing `ExportProjectButton` in the project actions area
    *   `[ ]`   `GitHubRepoSettings` rendered as a settings section below the project details
    *   `[ ]`   Minimal change — imports and render calls only
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — page composition
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic project details: action and settings composition
    *   `[ ]`   Boundary: renders child components, no new state or logic
  *   `[ ]`   `deps`
    *   `[ ]`   `GitHubRepoSettings` from `../components/dialectic/GitHubRepoSettings` — UI layer, Node 13
    *   `[ ]`   `SyncToGitHubButton` from `../components/dialectic/SyncToGitHubButton` — UI layer, Node 14
    *   `[ ]`   All existing imports unchanged
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   No new store reads — both components are self-contained
    *   `[ ]`   Render only — no new props, state, or effects in `DialecticProjectDetailsPage`
    *   `[ ]`   Pass `projectId` prop from route params to both components
  *   `[ ]`   unit/`apps/web/src/pages/DialecticProjectDetailsPage.test.tsx`
    *   `[ ]`   Add mocks for `GitHubRepoSettings` and `SyncToGitHubButton`
    *   `[ ]`   Test: `GitHubRepoSettings` mock renders on the page
    *   `[ ]`   Test: `SyncToGitHubButton` mock renders on the page
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   Add imports for both components
    *   `[ ]`   Render `<SyncToGitHubButton projectId={projectId} />` near `<ExportProjectButton>`
    *   `[ ]`   Render `<GitHubRepoSettings projectId={projectId} />` in a settings section
  *   `[ ]`   `DialecticProjectDetailsPage.tsx`
    *   `[ ]`   Add import for `GitHubRepoSettings` and `SyncToGitHubButton`
    *   `[ ]`   Add `<SyncToGitHubButton projectId={projectId} />` alongside `ExportProjectButton` in the actions area
    *   `[ ]`   Add `<GitHubRepoSettings projectId={projectId} />` in a settings section below project details
    *   `[ ]`   No other changes
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer (page)
    *   `[ ]`   Dependencies inward: `GitHubRepoSettings` (UI), `SyncToGitHubButton` (UI) — component composition
    *   `[ ]`   Provides outward: complete project details page to router
  *   `[ ]`   `requirements`
    *   `[ ]`   Both new components render on the project details page
    *   `[ ]`   No existing project details behavior is changed
    *   `[ ]`   All existing tests pass
  *   `[ ]`   **Commit** `feat(ui): add GitHub login, connection management, repo settings, and sync-to-GitHub UI`
    *   `[ ]`   `packages/types/src/github.types.ts` — frontend GitHub types
    *   `[ ]`   `packages/api/src/github.api.ts` — GitHub API client
    *   `[ ]`   `packages/api/src/apiClient.ts` — add `github` accessor
    *   `[ ]`   `packages/types/src/auth.types.ts` — add `loginWithGitHub`, `linkGitHubAccount` to `AuthStore`
    *   `[ ]`   `packages/store/src/authStore.ts` — GitHub login, link, and token capture
    *   `[ ]`   `packages/store/src/githubStore.ts` — new GitHub store slice
    *   `[ ]`   `apps/web/src/components/auth/LoginForm.tsx` — GitHub login button
    *   `[ ]`   `apps/web/src/components/profile/GitHubConnectionCard.tsx` — connection management card
    *   `[ ]`   `apps/web/src/pages/Profile.tsx` — render connection card
    *   `[ ]`   `apps/web/src/components/dialectic/GitHubRepoSettings.tsx` — repo/branch/folder picker
    *   `[ ]`   `apps/web/src/components/dialectic/SyncToGitHubButton.tsx` — sync trigger button
    *   `[ ]`   `apps/web/src/pages/DialecticProjectDetailsPage.tsx` — render repo settings and sync button

## Expand paused_nsf for general pause/resume
- Add explicit "Pause" condition that sets all jobs to "paused" and can be restarted.
- Users can pause and resume jobs at any time
- Jobs may need new JWT set when resumed for handler to accept them

### Phase 1: Database Infrastructure

*   `[ ]`   [DB] supabase/migrations **Add `pause_active_jobs` RPC and generalize `resume_paused_nsf_jobs` to handle both `paused_user` and `paused_nsf`**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a new RPC `pause_active_jobs(p_session_id UUID, p_stage_slug TEXT, p_iteration_number INTEGER)` that sets all active (non-terminal, non-paused, non-waiting) jobs in the given session/stage/iteration to status `'paused_user'`, storing each job's current status in `error_details->>'original_status'` and setting `error_details->>'user_paused' = true`
    *   `[ ]`   The RPC must verify ownership: the calling user must own the project that owns the session, matching the pattern in `resume_paused_nsf_jobs` (lines 37-46 of `20260302193405_nsf_pause_resume.sql`)
    *   `[ ]`   The RPC must exclude jobs already in terminal or waiting states: `'completed'`, `'failed'`, `'retry_loop_failed'`, `'paused_nsf'`, `'paused_user'`, `'waiting_for_children'`, `'waiting_for_prerequisite'`, `'superseded'`
    *   `[ ]`   The RPC must return `INTEGER` — the count of jobs paused
    *   `[ ]`   Update the existing `resume_paused_nsf_jobs` RPC (or create a replacement `resume_paused_jobs`) to resume jobs with status `IN ('paused_nsf', 'paused_user')` instead of only `= 'paused_nsf'`. The restore logic (original_status recovery, `'processing'` mapped to `'pending'`) remains unchanged
    *   `[ ]`   Grant `EXECUTE` on both RPCs to the `authenticated` role
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — database RPC layer providing the constraint and state-transition surface that all upstream pause/resume enforcement depends on
  *   `[ ]`   `module`
    *   `[ ]`   Database RPCs: `pause_active_jobs`, `resume_paused_jobs` (or updated `resume_paused_nsf_jobs`) — user-driven pause/resume constraint surface
    *   `[ ]`   Boundary: consumed by `dialectic-service` edge functions (`pauseActiveJobs` handler, `resumePausedNsfJobs` handler)
  *   `[ ]`   `deps`
    *   `[ ]`   `dialectic_generation_jobs` table — existing table, `status` TEXT column accepts any string value
    *   `[ ]`   `dialectic_sessions` table — join target for ownership verification (session → project → owner)
    *   `[ ]`   `dialectic_projects` table — join target for ownership verification
    *   `[ ]`   Existing `resume_paused_nsf_jobs` RPC at `20260302193405_nsf_pause_resume.sql` lines 23-72 — pattern reference and target for generalization
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `supabase/migrations/YYYYMMDDHHMMSS_pause_resume_user.sql`
    *   `[ ]`   `CREATE OR REPLACE FUNCTION public.pause_active_jobs(p_session_id UUID, p_stage_slug TEXT, p_iteration_number INTEGER) RETURNS INTEGER` — SECURITY DEFINER, plpgsql
    *   `[ ]`   Ownership check: join `dialectic_sessions` → `dialectic_projects` to verify `auth.uid() = owner_user_id`
    *   `[ ]`   UPDATE `dialectic_generation_jobs` SET `status = 'paused_user'`, `error_details = jsonb_build_object('original_status', status, 'user_paused', true)` WHERE session/stage/iteration match AND status NOT IN terminal/waiting/paused list
    *   `[ ]`   `GET DIAGNOSTICS paused_count = ROW_COUNT; RETURN paused_count;`
    *   `[ ]`   `CREATE OR REPLACE FUNCTION public.resume_paused_jobs(...)` (or `ALTER` existing `resume_paused_nsf_jobs`): change WHERE clause from `status = 'paused_nsf'` to `status IN ('paused_nsf', 'paused_user')`, strip both `nsf_paused` and `user_paused` flags from `error_details`
    *   `[ ]`   `GRANT EXECUTE ON FUNCTION public.pause_active_jobs(UUID, TEXT, INTEGER) TO authenticated;`
    *   `[ ]`   `GRANT EXECUTE ON FUNCTION public.resume_paused_jobs(UUID, TEXT, INTEGER) TO authenticated;` (if renamed)
  *   `[ ]`   `directionality`
    *   `[ ]`   Infrastructure layer — provides RPC surface consumed by adapter/app layers
    *   `[ ]`   All dependencies are inward-facing (schema only)
    *   `[ ]`   All provides are outward-facing (consumed by edge functions)
  *   `[ ]`   `requirements`
    *   `[ ]`   Migration applies cleanly on top of existing schema including `20260302193405_nsf_pause_resume.sql`
    *   `[ ]`   `pause_active_jobs` only pauses non-terminal, non-waiting, non-already-paused jobs
    *   `[ ]`   `pause_active_jobs` preserves each job's current status in `error_details->>'original_status'` before overwriting status
    *   `[ ]`   Resume RPC restores `original_status` for both `paused_nsf` and `paused_user` jobs, mapping `'processing'` → `'pending'`
    *   `[ ]`   Ownership check prevents unauthorized users from pausing/resuming other users' jobs
    *   `[ ]`   Existing `paused_nsf` behavior is unbroken — NSF-paused jobs are still resumable via the updated/new resume RPC

### Phase 2: Backend Service Types & Status Derivation

*   `[ ]`   [BE] supabase/functions/dialectic-service/`deriveStepStatuses.ts` **Add `paused_user` status recognition to step and stage status derivation**
  *   `[ ]`   `objective`
    *   `[ ]`   Update `deriveStepStatuses.ts` to recognize `'paused_user'` as a paused status alongside `'paused_nsf'`
    *   `[ ]`   Update the `UnifiedStageStatus` type in `dialectic.interface.ts` to include `'paused_user'` as a valid value
    *   `[ ]`   Ensure stage-level status rollup treats `paused_user` with same priority as `paused_nsf` (Active > Paused > Failed > Completed)
  *   `[ ]`   `role`
    *   `[ ]`   Domain — status derivation logic that transforms raw job statuses into unified step/stage statuses for the frontend
  *   `[ ]`   `module`
    *   `[ ]`   `dialectic-service/deriveStepStatuses` — step status derivation from job statuses
    *   `[ ]`   Boundary: receives raw job rows, produces `Map<string, UnifiedStageStatus>` consumed by `hydrateStageProgress` and frontend selectors
  *   `[ ]`   `deps`
    *   `[ ]`   `dialectic.interface.ts` `UnifiedStageStatus` type (lines 736-741) — domain type, inward. Requires addition of `'paused_user'` variant
    *   `[ ]`   `dialectic_generation_jobs` row shape — infrastructure, inward (unchanged)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Raw job rows with `status` field
    *   `[ ]`   No injection shape change — pure function operating on data
  *   `[ ]`   interface/`dialectic.interface.ts`
    *   `[ ]`   Add `| "paused_user"` to `UnifiedStageStatus` type union (currently at lines 736-741)
  *   `[ ]`   unit/`deriveStepStatuses.test.ts`
    *   `[ ]`   Test: jobs with status `'paused_user'` derive step status `'paused_user'`
    *   `[ ]`   Test: mixed `'paused_user'` and `'paused_nsf'` jobs in same step — `'paused_nsf'` takes priority (more restrictive)
    *   `[ ]`   Test: `'paused_user'` job alongside active job — active takes priority (already in-progress)
    *   `[ ]`   Test: `'paused_user'` job alongside completed job — `'paused_user'` takes priority (not all done)
    *   `[ ]`   Test: existing `'paused_nsf'` tests continue to pass unchanged
  *   `[ ]`   `deriveStepStatuses.ts`
    *   `[ ]`   Rename `PAUSED_NSF_STATUSES` set to `PAUSED_STATUSES` (or expand it): add `'paused_user'` alongside `'paused_nsf'` (line 19)
    *   `[ ]`   Update the `stepKeyToHasPausedNsf` map to track both paused types, or add a parallel `stepKeyToHasPausedUser` map
    *   `[ ]`   In the derivation logic (lines 87-99): if both `paused_nsf` and `paused_user` exist for a step, prefer `'paused_nsf'` (more restrictive — requires balance). If only `paused_user`, derive `'paused_user'`
    *   `[ ]`   Priority order: Active > Paused NSF > Paused User > Failed > Completed
  *   `[ ]`   `directionality`
    *   `[ ]`   Domain layer — derives status from infrastructure data, provides to app/adapter layers
    *   `[ ]`   All dependencies are inward-facing
    *   `[ ]`   All provides are outward-facing (consumed by hydrateStageProgress, frontend selectors)
  *   `[ ]`   `requirements`
    *   `[ ]`   `paused_user` jobs produce `'paused_user'` step status
    *   `[ ]`   `paused_nsf` takes priority over `paused_user` when both exist in the same step
    *   `[ ]`   All existing `paused_nsf` derivation behavior is preserved
    *   `[ ]`   `UnifiedStageStatus` type includes `'paused_user'`

### Phase 3: Backend Service Handlers

*   `[ ]`   [BE] supabase/functions/dialectic-service/`pauseActiveJobs.ts` **New service handler for user-initiated pause**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a new edge function handler `handlePauseActiveJobs` that accepts a payload with `sessionId`, `stageSlug`, and `iterationNumber`, authenticates the user, calls the `pause_active_jobs` RPC, and returns the count of paused jobs
    *   `[ ]`   Follow the exact pattern of `resumePausedNsfJobs.ts` (lines 10-61) for structure, error handling, and response shape
  *   `[ ]`   `role`
    *   `[ ]`   Adapter — edge function handler bridging the API action to the database RPC
  *   `[ ]`   `module`
    *   `[ ]`   `dialectic-service/pauseActiveJobs` — user-initiated job pause handler
    *   `[ ]`   Boundary: receives typed payload from `index.ts` router, calls `pause_active_jobs` RPC via Supabase client, returns result
  *   `[ ]`   `deps`
    *   `[ ]`   `pause_active_jobs` RPC — infrastructure layer, inward (created in Phase 1 migration)
    *   `[ ]`   `SupabaseClient` — infrastructure, inward (injected)
    *   `[ ]`   `User` from `@supabase/supabase-js` — for authentication check
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `PauseActiveJobsPayload` containing `sessionId`, `stageSlug`, `iterationNumber`
    *   `[ ]`   `SupabaseClient` for RPC calls
    *   `[ ]`   `User | null` for authentication
  *   `[ ]`   interface/`dialectic.interface.ts`
    *   `[ ]`   Add `PauseActiveJobsPayload` interface: `{ sessionId: string; stageSlug: string; iterationNumber: number; }`
    *   `[ ]`   Add `PauseActiveJobsResponse` interface: `{ pausedCount: number; }`
    *   `[ ]`   Add `PauseActiveJobsResult` interface: `{ data?: PauseActiveJobsResponse; error?: ServiceError; status?: number; }` — matching `ResumePausedNsfJobsResult` pattern (lines 529-533)
  *   `[ ]`   unit/`pauseActiveJobs.test.ts`
    *   `[ ]`   Test: returns 401 when `user` is null
    *   `[ ]`   Test: calls `pause_active_jobs` RPC with correct parameters (`p_session_id`, `p_stage_slug`, `p_iteration_number`)
    *   `[ ]`   Test: returns `{ data: { pausedCount: N } }` on successful RPC call
    *   `[ ]`   Test: returns 500 with error when RPC call fails
    *   `[ ]`   Test: returns 500 when RPC returns non-number result
  *   `[ ]`   `construction`
    *   `[ ]`   Pure function — no constructor. Called directly by `index.ts` router with `(payload, adminClient, user)`
    *   `[ ]`   Prohibited: do not instantiate from outside `dialectic-service`
  *   `[ ]`   `pauseActiveJobs.ts`
    *   `[ ]`   Export `async function handlePauseActiveJobs(payload: PauseActiveJobsPayload, adminClient: SupabaseClient, user: User | null): Promise<PauseActiveJobsResult>`
    *   `[ ]`   Authenticate: if `!user`, return `{ error: { message: 'User not authenticated', status: 401, code: 'USER_AUTH_FAILED' }, status: 401 }`
    *   `[ ]`   Call `adminClient.rpc('pause_active_jobs', { p_session_id: payload.sessionId, p_stage_slug: payload.stageSlug, p_iteration_number: payload.iterationNumber })`
    *   `[ ]`   Handle RPC error: log and return `{ error: { message, status: 500, code: 'PAUSE_ACTIVE_JOBS_FAILED' }, status: 500 }`
    *   `[ ]`   Validate response is a number, return `{ data: { pausedCount: result }, status: 200 }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer — bridges API routing to infrastructure RPC
    *   `[ ]`   All dependencies are inward-facing (RPC, Supabase client)
    *   `[ ]`   All provides are outward-facing (consumed by `index.ts` router)
  *   `[ ]`   `requirements`
    *   `[ ]`   Unauthenticated requests are rejected with 401
    *   `[ ]`   RPC is called with the exact parameter names the migration defines
    *   `[ ]`   Error responses follow the `ServiceError` shape used by `resumePausedNsfJobs.ts`
    *   `[ ]`   Successful response returns `pausedCount` as a number

*   `[ ]`   [BE] supabase/functions/dialectic-service/`resumePausedNsfJobs.ts` **Generalize resume handler to support both `paused_user` and `paused_nsf`, and refresh JWT on resumed jobs**
  *   `[ ]`   `objective`
    *   `[ ]`   Update `handleResumePausedNsfJobs` to call the updated/renamed resume RPC that handles both `paused_nsf` and `paused_user` jobs
    *   `[ ]`   If the migration renames the RPC to `resume_paused_jobs`, update the RPC call name in this handler
    *   `[ ]`   Accept `authToken: string` as a new parameter (passed from `index.ts` which extracts it from the `Authorization` header at line 219-222)
    *   `[ ]`   After the RPC restores job statuses, perform a second UPDATE on all just-resumed jobs to set `payload = jsonb_set(payload, '{user_jwt}', to_jsonb(authToken))` so the worker receives a fresh JWT. Without this, resumed jobs carry a stale JWT from when they were originally created, which may have expired during the pause. This is the same pattern `regenerateDocument.ts` uses at line 214: `Object.assign({}, job.payload, { user_jwt: params.authToken })`
    *   `[ ]`   The JWT update targets jobs matching `session_id/stage_slug/iteration_number` whose status is now one of the restored statuses (`'pending'`, `'retrying'`, or the original status) — i.e., jobs that were just resumed by the RPC in the same call
  *   `[ ]`   `role`
    *   `[ ]`   Adapter — edge function handler for job resumption
  *   `[ ]`   `module`
    *   `[ ]`   `dialectic-service/resumePausedNsfJobs` — job resumption handler
    *   `[ ]`   Boundary: receives payload + authToken from `index.ts` router, calls resume RPC, updates JWT, returns count
  *   `[ ]`   `deps`
    *   `[ ]`   Updated `resume_paused_jobs` RPC (or `resume_paused_nsf_jobs` with expanded WHERE) — infrastructure, inward
    *   `[ ]`   `SupabaseClient`, `User` — infrastructure, inward
    *   `[ ]`   `authToken` — extracted from request `Authorization` header by `index.ts` (line 219-222), passed as parameter
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `ResumePausedNsfJobsPayload` — unchanged interface
    *   `[ ]`   `SupabaseClient` for RPC calls and post-RPC UPDATE
    *   `[ ]`   `User | null` for authentication
    *   `[ ]`   `authToken: string` for refreshing `payload->>'user_jwt'` on resumed jobs
  *   `[ ]`   unit/`resumePausedNsfJobs.test.ts`
    *   `[ ]`   Test: existing tests continue to pass (RPC name may change to `resume_paused_jobs`; signature adds `authToken` param)
    *   `[ ]`   Test: if RPC was renamed, the handler calls the new RPC name
    *   `[ ]`   Test: after RPC succeeds, handler updates `payload->>'user_jwt'` on resumed jobs in the same session/stage/iteration using `adminClient.from('dialectic_generation_jobs').update(...)` with `jsonb_set`
    *   `[ ]`   Test: if JWT update fails, handler logs warning but still returns success (the resume itself succeeded; stale JWT is a degraded state, not a hard failure)
    *   `[ ]`   Test: returns 401 when `authToken` is missing/empty
  *   `[ ]`   `resumePausedNsfJobs.ts`
    *   `[ ]`   Update function signature: `handleResumePausedNsfJobs(payload, adminClient, user, authToken: string)` — add `authToken` as 4th parameter
    *   `[ ]`   Add auth token validation: if `!authToken`, return 401 with `code: 'AUTH_TOKEN_MISSING'`
    *   `[ ]`   If RPC was renamed in migration: update `.rpc('resume_paused_nsf_jobs', ...)` to `.rpc('resume_paused_jobs', ...)` (line 24-28)
    *   `[ ]`   After successful RPC call (after line 57), add JWT refresh: update all jobs matching `session_id = payload.sessionId AND stage_slug = payload.stageSlug AND iteration_number = payload.iterationNumber AND status IN ('pending', 'retrying')` to set `payload = payload || jsonb_build_object('user_jwt', authToken)` via `adminClient.rpc` or raw SQL. Use `adminClient.from('dialectic_generation_jobs').update(...)` if Supabase client supports JSONB set, otherwise use `.rpc()` with a small helper or inline SQL
    *   `[ ]`   Log warning if JWT update fails but do not fail the overall response
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer — bridges API routing to infrastructure RPC
    *   `[ ]`   All dependencies are inward-facing
    *   `[ ]`   All provides are outward-facing
  *   `[ ]`   `requirements`
    *   `[ ]`   Resume handler works for both `paused_nsf` and `paused_user` jobs
    *   `[ ]`   Existing resume behavior for `paused_nsf` is preserved
    *   `[ ]`   All resumed jobs receive a fresh `user_jwt` in their payload so the worker can authenticate downstream calls
    *   `[ ]`   Missing `authToken` is rejected with 401
    *   `[ ]`   JWT refresh failure is logged but does not block the resume response
    *   `[ ]`   All existing tests pass or are updated to reflect RPC name change and new `authToken` param

*   `[ ]`   [BE] supabase/functions/dialectic-service/`index.ts` **Add `pauseActiveJobs` action route to the dialectic-service dispatcher**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a new `case "pauseActiveJobs"` to the action switch in `index.ts` that routes to `handlePauseActiveJobs`
    *   `[ ]`   Follow the exact pattern of the existing `case "resumePausedNsfJobs"` block (lines 625-635)
    *   `[ ]`   Add the import for `handlePauseActiveJobs` from `./pauseActiveJobs.ts`
    *   `[ ]`   If the resume RPC was renamed, update the `resumePausedNsfJobs` case to call updated handler if needed
  *   `[ ]`   `role`
    *   `[ ]`   Adapter — API router dispatching actions to handlers
  *   `[ ]`   `module`
    *   `[ ]`   `dialectic-service/index` — action dispatcher
    *   `[ ]`   Boundary: receives JSON body with `action` field, dispatches to typed handlers
  *   `[ ]`   `deps`
    *   `[ ]`   `handlePauseActiveJobs` from `./pauseActiveJobs.ts` — adapter, inward (created in prior node)
    *   `[ ]`   `PauseActiveJobsPayload` from `./dialectic.interface.ts` — domain type, inward
    *   `[ ]`   Existing `handleResumePausedNsfJobs` import (line 88) — unchanged or updated
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `requestBody.action` — string discriminator
    *   `[ ]`   `requestBody.payload` — typed as `PauseActiveJobsPayload`
    *   `[ ]`   `adminClient`, `userForJson` — injected context
    *   `[ ]`   `authToken` — already extracted from `Authorization` header at line 219-222, available in `handleRequest` scope
  *   `[ ]`   unit/`index.test.ts` (if exists, otherwise note exemption)
    *   `[ ]`   Test: action `"pauseActiveJobs"` routes to `handlePauseActiveJobs` with correct arguments
    *   `[ ]`   Test: action `"pauseActiveJobs"` returns 401 when user is not authenticated
    *   `[ ]`   Test: action `"resumePausedNsfJobs"` now passes `authToken` as 4th argument to handler
    *   `[ ]`   Test: action `"resumePausedNsfJobs"` returns 401 when `authToken` is missing
  *   `[ ]`   `index.ts`
    *   `[ ]`   Add `import { handlePauseActiveJobs } from './pauseActiveJobs.ts';` near line 88
    *   `[ ]`   Add new case block after the `resumePausedNsfJobs` case (after line 635):
        ```
        case "pauseActiveJobs": {
          if (!userForJson) {
            return createErrorResponse('User not authenticated for pauseActiveJobs', 401, req, { message: 'User not authenticated', status: 401, code: 'USER_AUTH_FAILED' });
          }
          const payload: PauseActiveJobsPayload = requestBody.payload;
          const result = await handlers.pauseActiveJobs(payload, adminClient, userForJson);
          if (result.error) {
            return createErrorResponse(result.error.message, result.status, req, result.error);
          }
          return createSuccessResponse(result.data, result.status, req);
        }
        ```
    *   `[ ]`   Update existing `case "resumePausedNsfJobs"` (lines 625-635) to pass `authToken` as 4th argument to the handler, matching the updated signature. Add an `authToken` guard: if `!authToken`, return 401 with `code: 'AUTH_TOKEN_MISSING'` (same pattern as `regenerateDocument` at lines 641-643). Updated case:
        ```
        case "resumePausedNsfJobs": {
          if (!userForJson) {
            return createErrorResponse('User not authenticated for resumePausedNsfJobs', 401, req, ...);
          }
          if (!authToken) {
            return createErrorResponse('Authentication token is required for resumePausedNsfJobs', 401, req, { message: 'Authentication token is required', status: 401, code: 'AUTH_TOKEN_MISSING' });
          }
          const payload: ResumePausedNsfJobsPayload = requestBody.payload;
          const result = await handlers.resumePausedNsfJobs(payload, adminClient, userForJson, authToken);
          ...
        }
        ```
    *   `[ ]`   Add `pauseActiveJobs: handlePauseActiveJobs` to the `handlers` object if one exists, or wire directly in the case
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer — routes external API calls to internal handlers
    *   `[ ]`   All dependencies are inward-facing (handlers, types)
    *   `[ ]`   All provides are outward-facing (HTTP responses)
  *   `[ ]`   `requirements`
    *   `[ ]`   `pauseActiveJobs` action is routable and authenticated
    *   `[ ]`   `resumePausedNsfJobs` action now passes `authToken` to the handler for JWT refresh on resumed jobs
    *   `[ ]`   `resumePausedNsfJobs` rejects requests with missing `authToken` (401)
    *   `[ ]`   Response shape matches existing action patterns (success/error)
    *   `[ ]`   Existing `resumePausedNsfJobs` routing is unbroken aside from the new `authToken` parameter
  *   `[ ]`   **Commit** `feat(dialectic-service): add user-initiated pause/resume — new pauseActiveJobs handler, generalized resume RPC, JWT refresh on resume, paused_user status derivation`
    *   `[ ]`   Migration: `pause_active_jobs` RPC, generalized resume RPC
    *   `[ ]`   `deriveStepStatuses.ts`: `paused_user` recognition in status derivation
    *   `[ ]`   `pauseActiveJobs.ts`: new service handler
    *   `[ ]`   `resumePausedNsfJobs.ts`: accepts `authToken`, refreshes `payload->>'user_jwt'` on resumed jobs, updated RPC call if renamed
    *   `[ ]`   `index.ts`: new `pauseActiveJobs` action route, updated `resumePausedNsfJobs` route to pass `authToken`

### Phase 4: API Client & Store

*   `[ ]`   [API] packages/api/src/`dialectic.api.ts` **Add `pauseActiveJobs` method to the dialectic API client**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a `pauseActiveJobs(payload: PauseActiveJobsPayload): Promise<ApiResponse<PauseActiveJobsResponse>>` method to `DialecticApiClient`
    *   `[ ]`   Follow the exact pattern of `resumePausedNsfJobs` (lines 688-700): log, POST to `dialectic-service` with `action: 'pauseActiveJobs'`, log error or success, return response
    *   `[ ]`   Add the necessary type imports from `@paynless/types`
  *   `[ ]`   `role`
    *   `[ ]`   Port — API client method translating store calls to edge function invocations
  *   `[ ]`   `module`
    *   `[ ]`   `packages/api/dialectic.api` — dialectic API client
    *   `[ ]`   Boundary: called by `dialecticStore.pauseActiveJobs`, POSTs to `dialectic-service` edge function
  *   `[ ]`   `deps`
    *   `[ ]`   `PauseActiveJobsPayload`, `PauseActiveJobsResponse` from `@paynless/types` — domain types, inward. These must be re-exported from `packages/types/src/dialectic.types.ts` if not already
    *   `[ ]`   `this.apiClient.post` — infrastructure, inward (existing HTTP client)
    *   `[ ]`   `DialecticServiceActionPayload` type — existing action wrapper type
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `this.apiClient` — HTTP client for POST requests
    *   `[ ]`   `logger` — for info/error logging
  *   `[ ]`   interface/`dialectic.types.ts` (packages/types)
    *   `[ ]`   Add `PauseActiveJobsPayload` interface: `{ sessionId: string; stageSlug: string; iterationNumber: number; }` — mirroring `ResumePausedNsfJobsPayload`
    *   `[ ]`   Add `PauseActiveJobsResponse` interface: `{ pausedCount: number; }`
    *   `[ ]`   Add `'paused_user'` to the `stepStatuses` type/union if not already present (check line 560)
    *   `[ ]`   Add `'paused_user'` to `UnifiedProjectStatus` if not already present (check line 568)
  *   `[ ]`   unit/`dialectic.api.test.ts`
    *   `[ ]`   Test: `pauseActiveJobs` POSTs to `dialectic-service` with `{ action: 'pauseActiveJobs', payload }`
    *   `[ ]`   Test: `pauseActiveJobs` returns `ApiResponse<PauseActiveJobsResponse>` on success
    *   `[ ]`   Test: `pauseActiveJobs` returns error response when POST fails
  *   `[ ]`   `dialectic.api.ts`
    *   `[ ]`   Add method `async pauseActiveJobs(payload: PauseActiveJobsPayload): Promise<ApiResponse<PauseActiveJobsResponse>>`
    *   `[ ]`   Log: `logger.info('Pausing active jobs', { ...payload });`
    *   `[ ]`   Call: `this.apiClient.post<PauseActiveJobsResponse, DialecticServiceActionPayload>('dialectic-service', { action: 'pauseActiveJobs', payload })`
    *   `[ ]`   Error log: `logger.error('Error pausing active jobs:', { error: response.error, ...payload });`
    *   `[ ]`   Success log: `logger.info('Successfully paused active jobs', { ...payload });`
    *   `[ ]`   Return `response`
  *   `[ ]`   `directionality`
    *   `[ ]`   Port layer — translates app-layer store calls to infrastructure HTTP requests
    *   `[ ]`   All dependencies are inward-facing (HTTP client, types)
    *   `[ ]`   All provides are outward-facing (consumed by dialecticStore)
  *   `[ ]`   `requirements`
    *   `[ ]`   Method signature matches the pattern of `resumePausedNsfJobs`
    *   `[ ]`   Action string `'pauseActiveJobs'` matches the case in `dialectic-service/index.ts`
    *   `[ ]`   Types are imported from `@paynless/types`, not defined inline

*   `[ ]`   [STORE] packages/store/src/`dialecticStore.ts` **Add `pauseActiveJobs` action to the dialectic store**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a `pauseActiveJobs` async action that calls `api.dialectic().pauseActiveJobs(payload)`, handles errors, and hydrates stage progress on success
    *   `[ ]`   Follow the exact pattern of `resumePausedNsfJobs` (lines 2094-2111)
  *   `[ ]`   `role`
    *   `[ ]`   App — state management action coordinating API call and UI state refresh
  *   `[ ]`   `module`
    *   `[ ]`   `packages/store/dialecticStore` — dialectic state management
    *   `[ ]`   Boundary: called by `useStartContributionGeneration` hook, calls `dialectic.api.pauseActiveJobs`, hydrates stage progress
  *   `[ ]`   `deps`
    *   `[ ]`   `api.dialectic().pauseActiveJobs` — port layer, inward (created in prior node)
    *   `[ ]`   `PauseActiveJobsPayload` from `@paynless/types` — domain type, inward
    *   `[ ]`   `useAuthStore` — for `user.id` (existing pattern at line 2101)
    *   `[ ]`   `get().hydrateAllStageProgress` — existing store action for refreshing progress
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `api` — API client accessor
    *   `[ ]`   `get()` — store state accessor for `currentProjectDetail`, `hydrateAllStageProgress`
    *   `[ ]`   `useAuthStore.getState()` — for authenticated user ID
  *   `[ ]`   unit/`dialecticStore.test.ts`
    *   `[ ]`   Test: `pauseActiveJobs` calls `api.dialectic().pauseActiveJobs` with the payload
    *   `[ ]`   Test: `pauseActiveJobs` calls `hydrateAllStageProgress` on success
    *   `[ ]`   Test: `pauseActiveJobs` logs error and returns error response on API failure
    *   `[ ]`   Test: `pauseActiveJobs` does not hydrate when userId or projectId is missing
  *   `[ ]`   `dialecticStore.ts`
    *   `[ ]`   Add `pauseActiveJobs: async (payload: PauseActiveJobsPayload) => { ... }` action, following the `resumePausedNsfJobs` pattern:
        1. Call `api.dialectic().pauseActiveJobs(payload)`
        2. On error: log and return response
        3. On success: get `userId` from `useAuthStore`, `projectId` from `get().currentProjectDetail?.id`
        4. If both exist: call `get().hydrateAllStageProgress({ sessionId: payload.sessionId, iterationNumber: payload.iterationNumber, userId, projectId })`
        5. Return response
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer — orchestrates between port (API) and domain (state)
    *   `[ ]`   All dependencies are inward-facing (API client, auth store, types)
    *   `[ ]`   All provides are outward-facing (consumed by UI hooks)
  *   `[ ]`   `requirements`
    *   `[ ]`   Store action follows the exact same pattern as `resumePausedNsfJobs`
    *   `[ ]`   Stage progress is hydrated after successful pause so UI reflects new `paused_user` statuses
    *   `[ ]`   Errors are logged with payload context

*   `[ ]`   [STORE] packages/store/src/`dialecticStore.selectors.ts` **Add `paused_user` recognition to frontend status selectors**
  *   `[ ]`   `objective`
    *   `[ ]`   Update the status mapping logic that currently maps `raw === 'paused_nsf' ? 'paused_nsf'` (line 900) to also handle `'paused_user'`
    *   `[ ]`   Update the stage status rollup (line 905) to recognize `'paused_user'` alongside `'paused_nsf'`
    *   `[ ]`   Ensure `paused_nsf` takes priority over `paused_user` in stage rollup (if both exist, stage shows `paused_nsf` because it requires balance resolution)
  *   `[ ]`   `role`
    *   `[ ]`   App — selector logic deriving display-ready status from raw store state
  *   `[ ]`   `module`
    *   `[ ]`   `packages/store/dialecticStore.selectors` — status derivation selectors
    *   `[ ]`   Boundary: reads from dialectic store state, provides derived values to UI hooks and components
  *   `[ ]`   `deps`
    *   `[ ]`   `dialecticStore` state shape — app layer, inward (unchanged)
    *   `[ ]`   Status type unions from `@paynless/types` — domain types, inward (updated in prior node)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Raw step/stage status strings from store state
  *   `[ ]`   unit/`dialecticStore.selectors.test.ts`
    *   `[ ]`   Test: raw status `'paused_user'` maps to `'paused_user'` in step status
    *   `[ ]`   Test: stage with mixed `'paused_nsf'` and `'paused_user'` steps rolls up to `'paused_nsf'`
    *   `[ ]`   Test: stage with only `'paused_user'` steps rolls up to `'paused_user'`
    *   `[ ]`   Test: existing `'paused_nsf'` selector behavior is preserved
  *   `[ ]`   `dialecticStore.selectors.ts`
    *   `[ ]`   Add `raw === 'paused_user' ? 'paused_user'` mapping alongside existing `paused_nsf` mapping (near line 900)
    *   `[ ]`   Update stage status rollup: if `stepStatus === 'paused_user' && stageStatus !== 'failed' && stageStatus !== 'paused_nsf'` then `stageStatus = 'paused_user'` (near line 905)
    *   `[ ]`   Priority: `failed` > `paused_nsf` > `paused_user` > other statuses
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer — reads from store, provides to UI
    *   `[ ]`   All dependencies are inward-facing
    *   `[ ]`   All provides are outward-facing (consumed by hooks and components)
  *   `[ ]`   `requirements`
    *   `[ ]`   `paused_user` is correctly recognized and propagated through selectors
    *   `[ ]`   `paused_nsf` always takes priority over `paused_user` in rollups
    *   `[ ]`   Existing selector behavior is unbroken
  *   `[ ]`   **Commit** `feat(store,api): add pauseActiveJobs to API client, store, and selectors — support paused_user status in frontend state`
    *   `[ ]`   `dialectic.api.ts`: new `pauseActiveJobs` method
    *   `[ ]`   `dialectic.types.ts`: new payload/response types, `paused_user` in status unions
    *   `[ ]`   `dialecticStore.ts`: new `pauseActiveJobs` action
    *   `[ ]`   `dialecticStore.selectors.ts`: `paused_user` status recognition

### Phase 5: Frontend Hook & UI

*   `[ ]`   [UI] apps/web/src/hooks/`useStartContributionGeneration.ts` **Add pause capability and distinguish `paused_user` from `paused_nsf` in resume logic**
  *   `[ ]`   `objective`
    *   `[ ]`   Expose `pauseActiveJobs` from the store so the button can call it during generation
    *   `[ ]`   Add `hasPausedUserJobs` state variable derived from `activeStageProgress?.stageStatus === 'paused_user'`
    *   `[ ]`   Update `isResumeMode` to be true when either: (a) `hasPausedNsfJobs && balanceMeetsThreshold`, or (b) `hasPausedUserJobs` (no balance requirement)
    *   `[ ]`   Add `isPauseMode` state variable: true when `isSessionGenerating` (generation is active and can be paused)
    *   `[ ]`   Update `isDisabled` to NOT disable the button when `isSessionGenerating` — the button should remain enabled during generation so the user can pause
    *   `[ ]`   Add `pauseGeneration` function that calls `pauseActiveJobs` with `sessionId`, `stageSlug`, `iterationNumber`
    *   `[ ]`   Update the return type `UseStartContributionGenerationReturn` in `dialectic.types.ts` to include new fields
  *   `[ ]`   `role`
    *   `[ ]`   App — React hook orchestrating generation control state for the UI button
  *   `[ ]`   `module`
    *   `[ ]`   `apps/web/hooks/useStartContributionGeneration` — generation control hook
    *   `[ ]`   Boundary: reads from dialectic/wallet/AI stores, provides state and actions to `GenerateContributionButton`
  *   `[ ]`   `deps`
    *   `[ ]`   `dialecticStore.pauseActiveJobs` — app layer, inward (created in prior node)
    *   `[ ]`   `dialecticStore.resumePausedNsfJobs` — app layer, inward (existing)
    *   `[ ]`   `UseStartContributionGenerationReturn` in `dialectic.types.ts` — domain type, inward (needs update)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `pauseActiveJobs` from dialectic store
    *   `[ ]`   `activeStageProgress?.stageStatus` for pause state detection
    *   `[ ]`   `isSessionGenerating` for pause-mode detection
  *   `[ ]`   interface/`dialectic.types.ts` (packages/types)
    *   `[ ]`   Add to `UseStartContributionGenerationReturn` (lines 1117-1130):
        *   `[ ]`   `hasPausedUserJobs: boolean` — true when stage status is `'paused_user'`
        *   `[ ]`   `isPauseMode: boolean` — true when generation is active and pausable
        *   `[ ]`   `pauseGeneration: (onOpenDagProgress?: () => void) => Promise<void>` — action to pause active jobs
  *   `[ ]`   unit/`useStartContributionGeneration.test.ts`
    *   `[ ]`   Test: `isPauseMode` is true when `isSessionGenerating` is true
    *   `[ ]`   Test: `isPauseMode` is false when not generating
    *   `[ ]`   Test: `hasPausedUserJobs` is true when `activeStageProgress.stageStatus === 'paused_user'`
    *   `[ ]`   Test: `isResumeMode` is true when `hasPausedUserJobs` is true (no balance check)
    *   `[ ]`   Test: `isResumeMode` is true when `hasPausedNsfJobs` is true AND `balanceMeetsThreshold` is true
    *   `[ ]`   Test: `isResumeMode` is false when `hasPausedNsfJobs` is true AND `balanceMeetsThreshold` is false
    *   `[ ]`   Test: `isDisabled` is false when `isSessionGenerating` is true (button remains enabled for pause)
    *   `[ ]`   Test: `pauseGeneration` calls `pauseActiveJobs` with correct `sessionId`, `stageSlug`, `iterationNumber`
    *   `[ ]`   Test: existing resume flow for `paused_nsf` still works unchanged
  *   `[ ]`   `useStartContributionGeneration.ts`
    *   `[ ]`   Add `const pauseActiveJobs = useDialecticStore((state) => state.pauseActiveJobs);` (near line 29-31)
    *   `[ ]`   Add `const hasPausedUserJobs = activeStageProgress?.stageStatus === 'paused_user';` (near line 101)
    *   `[ ]`   Update `isResumeMode`: `const isResumeMode = (hasPausedNsfJobs && balanceMeetsThreshold) || hasPausedUserJobs;` (line 114)
    *   `[ ]`   Add `const isPauseMode = isSessionGenerating;`
    *   `[ ]`   Update `isDisabled` (lines 133-140): remove `isSessionGenerating` from the disabled conditions. The button should be enabled during generation (for pausing). Keep all other disabled conditions
    *   `[ ]`   Add `pauseGeneration` async function: calls `pauseActiveJobs({ sessionId: activeSession.id, stageSlug: activeStage.slug, iterationNumber })`, shows `toast.info("Pausing generation...")`
    *   `[ ]`   Add `hasPausedUserJobs`, `isPauseMode`, `pauseGeneration` to the return object (lines 244-260)
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer — orchestrates store actions for UI consumption
    *   `[ ]`   All dependencies are inward-facing (stores, types)
    *   `[ ]`   All provides are outward-facing (consumed by GenerateContributionButton)
  *   `[ ]`   `requirements`
    *   `[ ]`   Button is NOT disabled during generation — pause is available
    *   `[ ]`   `paused_user` resume does NOT require balance check
    *   `[ ]`   `paused_nsf` resume still requires balance check
    *   `[ ]`   Both pause states can coexist; `paused_nsf` takes priority in `isResumeMode` logic
    *   `[ ]`   Existing generation and NSF resume flows are preserved

*   `[ ]`   [UI] apps/web/src/components/dialectic/`GenerateContributionButton.tsx` **Update button to show Pause while generating, Resume when paused, with debounce**
  *   `[ ]`   `objective`
    *   `[ ]`   Update `getButtonText()` to show "Pause {stage}" with a pause icon when `isPauseMode` is true (currently shows disabled "Generating..." spinner)
    *   `[ ]`   Update `getButtonText()` to show "Resume {stage}" when `hasPausedUserJobs` is true (in addition to existing `hasPausedNsfJobs` resume text)
    *   `[ ]`   Update `handleClick` to call `pauseGeneration` when `isPauseMode` is true, and `startContributionGeneration` otherwise
    *   `[ ]`   Add debounce protection: after a click, disable the button for 500ms to prevent accidental rapid pause/unpause toggling. Use a `useRef` timer or `useState` flag with `setTimeout`
  *   `[ ]`   `role`
    *   `[ ]`   Adapter — UI component rendering the generation control button
  *   `[ ]`   `module`
    *   `[ ]`   `apps/web/components/dialectic/GenerateContributionButton` — generation control button
    *   `[ ]`   Boundary: consumes state from `useStartContributionGeneration` hook, renders button with contextual text and actions
  *   `[ ]`   `deps`
    *   `[ ]`   `useStartContributionGeneration` hook — app layer, inward (updated in prior node)
    *   `[ ]`   `isPauseMode`, `hasPausedUserJobs`, `pauseGeneration` from hook return — new fields
    *   `[ ]`   `Pause` icon from `lucide-react` — UI library (add import alongside existing `Loader2`, `RefreshCcw`)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Destructured return from `useStartContributionGeneration()`: add `isPauseMode`, `hasPausedUserJobs`, `pauseGeneration` to the existing destructure (lines 17-32)
  *   `[ ]`   unit/`GenerateContributionButton.test.tsx`
    *   `[ ]`   Test: when `isPauseMode` is true, button text shows "Pause {displayName}" with pause icon
    *   `[ ]`   Test: when `isPauseMode` is true, clicking button calls `pauseGeneration`
    *   `[ ]`   Test: when `hasPausedUserJobs` is true, button text shows "Resume {displayName}"
    *   `[ ]`   Test: when `hasPausedUserJobs` is true, clicking button calls `startContributionGeneration` (which internally routes to resume)
    *   `[ ]`   Test: after clicking, button is disabled for 500ms debounce period
    *   `[ ]`   Test: existing NSF resume button text "Resume {displayName}" still shows for `hasPausedNsfJobs`
    *   `[ ]`   Test: button state priority: `isPauseMode` (generating) > `hasPausedNsfJobs` > `hasPausedUserJobs` > other states
  *   `[ ]`   `GenerateContributionButton.tsx`
    *   `[ ]`   Add `isPauseMode`, `hasPausedUserJobs`, `pauseGeneration` to the destructure from `useStartContributionGeneration()` (lines 17-32)
    *   `[ ]`   Add debounce state: `const [isDebouncing, setIsDebouncing] = useState(false);` and `const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);`
    *   `[ ]`   Update `handleClick`: if `isPauseMode`, call `pauseGeneration(() => setDagDialogOpen(true))` then set debounce. Otherwise call `startContributionGeneration(...)` then set debounce. Debounce: `setIsDebouncing(true); debounceTimerRef.current = setTimeout(() => setIsDebouncing(false), 500);`
    *   `[ ]`   Add cleanup: `useEffect(() => { return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); }; }, []);`
    *   `[ ]`   Update `getButtonText()` (lines 57-75):
        *   `[ ]`   Replace the `isSessionGenerating` branch: instead of disabled spinner, show `<><Pause className="mr-2 h-4 w-4" /> Pause {displayName}</>` when `isPauseMode` is true
        *   `[ ]`   Add `hasPausedUserJobs` branch: show `Resume {displayName}` (before or alongside `hasPausedNsfJobs` check)
    *   `[ ]`   Update button `disabled` prop: `disabled={isDisabled || isDebouncing}` — `isDisabled` from hook no longer includes `isSessionGenerating`, debounce adds temporary disable after clicks
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer (UI) — renders state from app layer hook
    *   `[ ]`   All dependencies are inward-facing (hook, types, icons)
    *   `[ ]`   All provides are outward-facing (rendered UI to the user)
  *   `[ ]`   `requirements`
    *   `[ ]`   Button shows "Pause {stage}" during generation instead of disabled "Generating..."
    *   `[ ]`   Button shows "Resume {stage}" when `paused_user` (no balance gate)
    *   `[ ]`   Button shows "Resume {stage}" when `paused_nsf` and balance sufficient (existing behavior preserved)
    *   `[ ]`   500ms debounce prevents rapid pause/unpause toggling
    *   `[ ]`   Debounce timer is cleaned up on component unmount
    *   `[ ]`   All existing button states (Choose AI Models, Wallet Not Ready, Stage Not Ready, etc.) are preserved
    *   `[ ]`   Button icon changes contextually: Pause icon when pausing, existing RefreshCcw for other states
  *   `[ ]`   **Commit** `feat(ui): add voluntary pause/resume button — Pause during generation, Resume for paused_user, 500ms debounce`
    *   `[ ]`   `useStartContributionGeneration.ts`: pause mode, pause action, updated isDisabled
    *   `[ ]`   `dialectic.types.ts`: updated `UseStartContributionGenerationReturn`
    *   `[ ]`   `GenerateContributionButton.tsx`: pause/resume button states, debounce

## n/n Done only hydrates on page refresh, not dynamic, and sometimes overcounts 
- Check if n/n Done is calculating correctly
- Ensure n/n Done updates from notifications, not just page refresh 

## StageDAGProgressDialog does not color nodes correctly, probably relies on explicit hydration instead of dynamic hydration from notifications
- Update StageDAGProgressDialog to use notifications to change color too 

## Highlight the chosen Chat or Project in the left sidebar 
- Currently the sidebar gives no indication of which Chat or Project the user has focused
- Outline and/or highlight the chosen Chat or Project in the left sidebar

## New user sign in banner doesn't display, throws console error  
- Chase, diagnose, fix 

## Refactor EMCAS to break apart the functions, segment out the tests
- Move gatherArtifacts call to processSimpleJob
- Decide where to measure & RAG

## Switch to stream-to-buffer instead of chunking
- This lets us render the buffer in real time to show document progress 

## Build test fixtures for major function groups 
- Provide standard mock factories and objects 
- dialectic-worker, dialectic-service, document_renderer, anything else that has huge test files  

## Support user-provided API keys for their preferred providers 

## Regenerate existing document from user feedback & edits 

## Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
AND/OR
## Let the user pick/rate their preferred version and drop the others 

## Use a gentle color schema to differentiate model outputs visually / at a glance 

## When doc loads for the first time, position at top 

## Search across documents for key terms 

## Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

## Add optional outputs for selected stages
- A "landing page" output for the proposal stage
-- Landing page
-- Hero banner
-- Call to action
-- Email sign up 
- A "financial analysis" output for the "refinement" stage
-- 1/3/5 year 
-- Conservative / base / aggressive
-- IS, BS, CF 
- A "generate next set of work" for the implementation stage 

## Ensure front end components use friendly names 
- SessionInfoCard uses formal names instead of friendly names 

## Move "Generate" button into StageRunCard left hand side where the icons are 

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)

