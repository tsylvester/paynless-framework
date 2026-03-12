[ ] // So that find->replace will stop unrolling my damned instructions!

# **State Hydration Fixes**

## Problem Statement
The dialectic UI has persistent state management problems where realtime updates don't reflect correctly in the UI, requiring page refreshes. See `docs/state-hydration-issues.md` for full analysis.

## Objectives
1. Realtime document counting via lifecycle events updating `progress.jobs`
2. "Done" derived from document completion, not step completion
3. Server-persisted viewing stage (`viewing_stage_id` on `dialectic_sessions`)
4. Clean SubmitResponsesButton with 6 explicit, data-driven conditions
5. `submitStageResponses` applies `updatedSession` to store immediately
6. Stage tab focus persisted and restored from server

## Expected Outcome
All six front-end hydration symptoms resolved without page refresh. No defaults, no guesses, no fallbacks. State driven by server-authoritative data and realtime lifecycle events.

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.
* Read `docs/state-hydration-issues.md` for domain context before every turn.

# Work Breakdown Structure

## Phase 1: Realtime job tracking (Issues 1 & 2)

*   `[✅]`   [STORE] packages/store/src/`upsertJobFromLifecycleEvent.ts` **Upsert progress.jobs entry from lifecycle event data**
    *   `[✅]`   `objective`
        *   `[✅]`   Given a lifecycle event payload (DocumentLifecyclePayload: job_id, document_key, modelId, step_key, sessionId, stageSlug, iterationNumber) and a target job status string, upsert a JobProgressDto into the progress.jobs array for the relevant progressKey
        *   `[✅]`   If a job with matching id already exists in the array, update its status in-place (retries update existing jobs)
        *   `[✅]`   If no matching job exists, append a new JobProgressDto
        *   `[✅]`   Must be callable from every lifecycle event handler that carries document/job information
    *   `[✅]`   `role`
        *   `[✅]`   Domain helper — pure function operating on StageRunProgressSnapshot draft
    *   `[✅]`   `module`
        *   `[✅]`   packages/store/src — dialectic store document/job state management
        *   `[✅]`   Boundary: operates on StageRunProgressSnapshot within an immer draft, no external I/O
    *   `[✅]`   `deps`
        *   `[✅]`   JobProgressDto from @paynless/types — domain type, inward
        *   `[✅]`   StageRunProgressSnapshot from @paynless/types — domain type, inward
        *   `[✅]`   No reverse dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Receives: immer draft of StageRunProgressSnapshot, event fields (job_id, document_key, modelId, step_key, jobType), target status string
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.types.ts`
        *   `[✅]`   **upsertJobFromLifecycleEvent**
            *   `[✅]`   Signature: `UpsertJobFromLifecycleEventSignature` — `(payload: UpsertJobFromLifecycleEventPayload, params: UpsertJobFromLifecycleEventParams) => void`
            *   `[✅]`   Deps: `UpsertJobFromLifecycleEventDeps` — none (pure function, no injected dependencies)
            *   `[✅]`   Params: `UpsertJobFromLifecycleEventParams` — `{ jobId: string, documentKey: string | null, modelId: string | null, stepKey: string | null, jobType: RecipeJobType | null, status: string }`
            *   `[✅]`   Payload: `UpsertJobFromLifecycleEventPayload` — `Draft<StageRunProgressSnapshot>` (the data structure being mutated)
            *   `[✅]`   Return: `UpsertJobFromLifecycleEventReturn` — `void`
        *   `[✅]`   Uses existing types: `JobProgressDto`, `StageRunProgressSnapshot`, `RecipeJobType` from @paynless/types
    *   `[✅]`   unit/`upsertJobFromLifecycleEvent.test.ts`
        *   `[✅]`   Test: upserts new job when no matching job_id exists in progress.jobs
        *   `[✅]`   Test: updates status in-place when job_id already exists (retry scenario)
        *   `[✅]`   Test: sets jobType, stepKey, modelId, documentKey correctly on new entry
        *   `[✅]`   Test: does not duplicate jobs on repeated calls with same job_id
        *   `[✅]`   Test: handles empty progress.jobs array
        *   `[✅]`   Test: upserts with null documentKey/modelId for planner jobs
    *   `[✅]`   `construction`
        *   `[✅]`   Pure exported functions, no constructor or factory
        *   `[✅]`   Prohibited: must not be instantiated as a class, must not hold module-level mutable state
        *   `[✅]`   No initialization order — stateless helpers, callable in any sequence from any handler
    *   `[✅]`   `upsertJobFromLifecycleEvent.ts`
        *   `[✅]`   Find existing job by id in progress.jobs
        *   `[✅]`   If found: update status field AND merge any non-null fields from the incoming event into the existing entry (later events may provide stepKey, documentKey, modelId that were null on creation)
        *   `[✅]`   If not found: construct JobProgressDto from fields (null for any fields the event lacks) and append to progress.jobs
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain
        *   `[✅]`   All dependencies inward (types only)
        *   `[✅]`   Provides: consumed by lifecycle event handlers in dialecticStore.documents.ts and dialecticStore.ts
    *   `[✅]`   `requirements`
        *   `[✅]`   progress.jobs is mutated consistently whether event arrives before or after hydration
        *   `[✅]`   Retries (same job_id, new status) update in-place, never duplicate

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.documents.ts` **Wire upsertJobFromLifecycleEvent into document/render lifecycle handlers**
    *   `[✅]`   `objective`
        *   `[✅]`   Every lifecycle handler in dialecticStore.documents.ts that processes a document/render event must call upsertJobFromLifecycleEvent so progress.jobs stays current in realtime
        *   `[✅]`   These handlers receive JobNotificationEvent payloads with full fields (document_key, stageSlug, step_key, modelId, job_id) — always use the full upsert path
    *   `[✅]`   `role`
        *   `[✅]`   Adapter — wiring domain helper into existing event handler call sites
    *   `[✅]`   `module`
        *   `[✅]`   packages/store/src/dialecticStore.documents.ts — existing lifecycle handlers
        *   `[✅]`   Boundary: each handler already has access to the immer draft of stageRunProgress
    *   `[✅]`   `deps`
        *   `[✅]`   upsertJobFromLifecycleEvent from packages/store/src — producer from prior node
        *   `[✅]`   Existing handler functions: handleRenderCompletedLogic, handleDocumentCompletedLogic, handleRenderStartedLogic, handleDocumentStartedLogic, handleDocumentChunkCompletedLogic
        *   `[✅]`   No reverse dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Each handler already receives (get, set, event) and computes progressKey
        *   `[✅]`   upsertJobFromLifecycleEvent is called inside the existing set() immer callback
    *   `[✅]`   `event-to-action mapping (5 handlers in this file)`
        *   `[✅]`   `document_started` → full upsert, status `processing`, jobType `EXECUTE`
        *   `[✅]`   `document_chunk_completed` → full upsert, status `processing`
        *   `[✅]`   `document_completed` → full upsert, status `completed`, jobType `EXECUTE`
        *   `[✅]`   `render_started` → full upsert, status `processing`, jobType `RENDER`
        *   `[✅]`   `render_completed` → full upsert, status `completed`, jobType `RENDER`
    *   `[✅]`   unit/`dialecticStore.documents.test.ts`
        *   `[✅]`   Test: handleRenderCompletedLogic upserts job with status 'completed' into progress.jobs
        *   `[✅]`   Test: handleDocumentStartedLogic upserts job with status 'processing' into progress.jobs
        *   `[✅]`   Test: handleRenderStartedLogic upserts job with status 'processing' into progress.jobs
        *   `[✅]`   Test: handleDocumentCompletedLogic upserts job with status 'completed' into progress.jobs
        *   `[✅]`   Test: handleDocumentChunkCompletedLogic upserts job with status 'processing'
        *   `[✅]`   Test: progress.jobs entry is updated (not duplicated) when same job_id arrives in start then complete sequence
    *   `[✅]`   `dialecticStore.documents.ts`
        *   `[✅]`   In handleRenderCompletedLogic: call upsertJobFromLifecycleEvent(progress, eventFields, 'completed') inside the set() callback
        *   `[✅]`   In handleRenderStartedLogic: call upsertJobFromLifecycleEvent(progress, eventFields, 'processing')
        *   `[✅]`   In handleDocumentStartedLogic: call upsertJobFromLifecycleEvent(progress, eventFields, 'processing')
        *   `[✅]`   In handleDocumentCompletedLogic: call upsertJobFromLifecycleEvent(progress, eventFields, 'completed')
        *   `[✅]`   In handleDocumentChunkCompletedLogic: call upsertJobFromLifecycleEvent(progress, eventFields, 'processing')
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter (store internals)
        *   `[✅]`   Depends on: upsertJobFromLifecycleEvent (domain, inward)
        *   `[✅]`   Provides: updated progress.jobs visible to selectors
    *   `[✅]`   `requirements`
        *   `[✅]`   After any document/render lifecycle event, progress.jobs contains an entry for that job with the correct status
        *   `[✅]`   Existing handler behavior (updating progress.documents, progress.stepStatuses) is preserved unchanged

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.ts` **Wire upsertJobFromLifecycleEvent into store-level lifecycle handlers (planner, execute, render_chunk, job_failed, and all contribution-level events)**
    *   `[✅]`   `objective`
        *   `[✅]`   Lifecycle handlers in dialecticStore.ts that are NOT delegated to dialecticStore.documents.ts also need to upsert into progress.jobs
        *   `[✅]`   Two payload families handled here:
            *   `[✅]`   **JobNotificationEvent payloads** (have stageSlug, step_key, job_id): planner_started, planner_completed, execute_started, execute_chunk_completed, execute_completed, render_chunk_completed, job_failed
            *   `[✅]`   **Contribution-level payloads** (have job_id but lack document_key/step_key): contribution_generation_started, dialectic_contribution_started, contribution_generation_retrying, dialectic_contribution_received, contribution_generation_complete, contribution_generation_continued, contribution_generation_failed, contribution_generation_paused_nsf
        *   `[✅]`   Every event with a job_id calls upsertJobFromLifecycleEvent — one path, no branching, no second function. Pass whatever fields the event provides and null for the rest.
    *   `[✅]`   `role`
        *   `[✅]`   Adapter — wiring domain helper into store-level event handlers
    *   `[✅]`   `module`
        *   `[✅]`   packages/store/src/dialecticStore.ts — main store lifecycle handlers and switch cases
    *   `[✅]`   `deps`
        *   `[✅]`   upsertJobFromLifecycleEvent from packages/store/src — producer from node 1
        *   `[✅]`   No reverse dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Each handler has access to get/set and the event payload
        *   `[✅]`   progressKey is computable from event.sessionId, event.stageSlug, event.iterationNumber (for JobNotificationEvent payloads)
        *   `[✅]`   Contribution-level payloads lack stageSlug — look up the job's existing entry across all progress snapshots by job_id to find which snapshot it belongs to, then upsert into that snapshot
    *   `[✅]`   `event-to-action mapping (15 events handled in this file)`
        *   `[✅]`   **JobNotificationEvent payloads (all use upsertJobFromLifecycleEvent):**
            *   `[✅]`   `planner_started` → upsert, status `processing`, jobType `PLAN` (has step_key but no document_key or modelId — upsert with null document_key/modelId)
            *   `[✅]`   `planner_completed` → upsert, status `completed`, jobType `PLAN`
            *   `[✅]`   `execute_started` → upsert, status `processing`, jobType `EXECUTE` (document_key may or may not be present — pass it as-is, null if absent)
            *   `[✅]`   `execute_chunk_completed` → upsert, status `processing` (document_key may or may not be present — pass as-is)
            *   `[✅]`   `execute_completed` → upsert, status `completed`, jobType `EXECUTE` (document_key may or may not be present — pass as-is)
            *   `[✅]`   `render_chunk_completed` → upsert, status `processing` (has job_id — upsert with whatever fields are on the event)
            *   `[✅]`   `job_failed` → upsert, status `failed` (document_key may or may not be present — pass as-is)
        *   `[✅]`   **Contribution-level payloads (all use upsertJobFromLifecycleEvent with whatever fields the event provides, null for the rest):**
            *   `[✅]`   `contribution_generation_started` → upsert, status `processing`
            *   `[✅]`   `dialectic_contribution_started` → upsert, status `processing`
            *   `[✅]`   `contribution_generation_retrying` → upsert, status `retrying`
            *   `[✅]`   `dialectic_contribution_received` → upsert, status `processing`
            *   `[✅]`   `contribution_generation_complete` → upsert, status `completed`
            *   `[✅]`   `contribution_generation_continued` → upsert, status `continuing`
            *   `[✅]`   `contribution_generation_failed` → upsert, status `failed`
            *   `[✅]`   `contribution_generation_paused_nsf` → no job_id on payload, no upsert possible (status tracked via stepStatuses only)
    *   `[✅]`   unit/`dialecticStore.test.ts`
        *   `[✅]`   Test: planner_started upserts job with status 'processing' and jobType 'PLAN'
        *   `[✅]`   Test: planner_completed upserts job with status 'completed' and jobType 'PLAN'
        *   `[✅]`   Test: execute_started upserts job with status 'processing' and jobType 'EXECUTE' (with or without document_key — same path)
        *   `[✅]`   Test: execute_completed upserts job with status 'completed' and jobType 'EXECUTE' (with or without document_key — same path)
        *   `[✅]`   Test: render_chunk_completed upserts job with status 'processing'
        *   `[✅]`   Test: job_failed upserts job with status 'failed' (with or without document_key — same path)
        *   `[✅]`   Test: contribution_generation_started upserts job with status 'processing'
        *   `[✅]`   Test: dialectic_contribution_started upserts job with status 'processing'
        *   `[✅]`   Test: contribution_generation_retrying upserts job with status 'retrying'
        *   `[✅]`   Test: dialectic_contribution_received upserts job with status 'processing'
        *   `[✅]`   Test: contribution_generation_complete upserts job with status 'completed'
        *   `[✅]`   Test: contribution_generation_continued upserts job with status 'continuing'
        *   `[✅]`   Test: contribution_generation_failed upserts job with status 'failed'
        *   `[✅]`   Test: contribution_generation_paused_nsf does NOT upsert (no job_id on payload)
        *   `[✅]`   Test: progress.jobs entry is updated (not duplicated) when same job_id arrives across start→chunk→complete sequence
    *   `[✅]`   `dialecticStore.ts`
        *   `[✅]`   In planner_started case: upsertJobFromLifecycleEvent(progress, { jobId, stepKey, modelId: null, documentKey: null, jobType: 'PLAN' }, 'processing')
        *   `[✅]`   In planner_completed case: upsertJobFromLifecycleEvent(progress, ..., 'completed')
        *   `[✅]`   In execute_started case: upsertJobFromLifecycleEvent(progress, { jobId, stepKey, modelId: event.modelId ?? null, documentKey: event.document_key ?? null, jobType: 'EXECUTE' }, 'processing')
        *   `[✅]`   In execute_chunk_completed case: upsertJobFromLifecycleEvent(progress, { jobId, stepKey: event.step_key ?? null, modelId: event.modelId ?? null, documentKey: event.document_key ?? null, jobType: null }, 'processing')
        *   `[✅]`   In execute_completed case: upsertJobFromLifecycleEvent(progress, { jobId, stepKey, modelId: event.modelId ?? null, documentKey: event.document_key ?? null, jobType: 'EXECUTE' }, 'completed')
        *   `[✅]`   In render_chunk_completed case: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: event.step_key ?? null, modelId: event.modelId ?? null, documentKey: event.document_key ?? null, jobType: 'RENDER' }, 'processing')
        *   `[✅]`   In job_failed case: upsertJobFromLifecycleEvent(progress, { jobId, stepKey: event.step_key ?? null, modelId: event.modelId ?? null, documentKey: event.document_key ?? null, jobType: null }, 'failed')
        *   `[✅]`   In _handleContributionGenerationStarted: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'processing')
        *   `[✅]`   In _handleDialecticContributionStarted: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'processing')
        *   `[✅]`   In _handleContributionGenerationRetrying: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'retrying')
        *   `[✅]`   In _handleDialecticContributionReceived: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'processing')
        *   `[✅]`   In _handleContributionGenerationComplete: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'completed')
        *   `[✅]`   In _handleContributionGenerationContinued: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'continuing')
        *   `[✅]`   In _handleContributionGenerationFailed: upsertJobFromLifecycleEvent(progress, { jobId: event.job_id, stepKey: null, modelId: null, documentKey: null, jobType: null }, 'failed')
        *   `[✅]`   In _handleContributionGenerationPausedNsf: no upsert (payload has no job_id)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter (store)
        *   `[✅]`   Depends on: upsertJobFromLifecycleEvent (domain, inward)
        *   `[✅]`   Provides: updated progress.jobs visible to selectors
    *   `[✅]`   `requirements`
        *   `[✅]`   All 15 lifecycle event types handled in this file result in a progress.jobs upsert or documented exemption
        *   `[✅]`   contribution_generation_paused_nsf is the only event that cannot upsert (no job_id on payload) — this is documented, not an oversight
        *   `[✅]`   Existing handler behavior (updating contribution lists, session sync, stepStatuses) is preserved unchanged

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.selectors.ts` **Gate 'completed' stageStatus on document completion**
    *   `[✅]`   `objective`
        *   `[✅]`   The store already has everything needed to track both progress and completion: the recipe DAG (steps, edges, inputs_required, outputs_required) is in recipesByStageSlug, step statuses are in progress.stepStatuses (driven by lifecycle events from ALL jobs), job entries are in progress.jobs (populated by nodes 1-3 for every job type), and document descriptors are in progress.documents (fetched when rendered documents complete)
        *   `[✅]`   A recipe is a DAG of PLAN and EXECUTE steps. Each step spawns jobs based on its granularity_strategy. Most jobs produce intermediate artifacts (header_context, assembled_json) and do NOT have a document_key — that is expected. RENDER is a system operation (not a recipe step) that produces the final user-facing markdown documents after EXECUTE.
        *   `[✅]`   **Progress** is derived from step statuses, which reflect ALL jobs in the DAG — planners, intermediate executions, terminal executions, everything. This is how the user knows work is happening.
        *   `[✅]`   **Completion** is proven by rendered documents. The recipe defines how many rendered markdown documents the stage must produce (totalDocumentsForStage, a fixed count from selectValidMarkdownDocumentKeys). Each document must be rendered for every selected model. Only when every document set is fully rendered is the stage complete. Steps and jobs completing is necessary but not sufficient — RENDER must finish and produce the documents.
        *   `[✅]`   The bug: line 921 sets stageStatus = 'completed' when completedSteps === totalSteps. This fires when all steps finish, but RENDER may not have produced all documents yet. Fix: gate 'completed' on completedDocumentsForStage === totalDocumentsForStage && totalDocumentsForStage > 0
    *   `[✅]`   `role`
        *   `[✅]`   Domain — selector producing derived state
    *   `[✅]`   `module`
        *   `[✅]`   packages/store/src/dialecticStore.selectors.ts — selectUnifiedProjectProgress
        *   `[✅]`   Boundary: pure function, no side effects
    *   `[✅]`   `deps`
        *   `[✅]`   Existing types: StageProgressDetail, UnifiedProjectProgress, UnifiedProjectStatus from @paynless/types
        *   `[✅]`   progress.jobs populated by lifecycle events (producer: nodes 1-3) — ALL job types, not just document-bearing jobs
        *   `[✅]`   progress.stepStatuses driven by all lifecycle events — reflects every job in the DAG regardless of document_key
        *   `[✅]`   progress.documents populated when rendered documents are fetched
        *   `[✅]`   recipesByStageSlug provides the recipe DAG including outputs_required per step
        *   `[✅]`   No reverse dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Reads: stageRunProgress, recipesByStageSlug, currentProcessTemplate from state
    *   `[✅]`   unit/`dialecticStore.selectors.test.ts`
        *   `[✅]`   Test: stageStatus is NOT 'completed' when all steps are done but not all document sets are complete (steps finishing does not prove RENDER produced documents)
        *   `[✅]`   Test: stageStatus is 'completed' when completedDocumentsForStage === totalDocumentsForStage && totalDocumentsForStage > 0
        *   `[✅]`   Test: stageStatus is 'in_progress' when jobs are running mid-DAG (PLAN, intermediate EXECUTE) even though no rendered documents exist yet — progress comes from step statuses, not documents
        *   `[✅]`   Test: progress statuses (in_progress, failed, paused) derived from step statuses, which reflect ALL jobs including those without document_key
        *   `[✅]`   Test: "n/n" reflects completedDocumentsForStage / totalDocumentsForStage — totalDocuments is a fixed count from the recipe's expected rendered markdown outputs, completedDocuments is how many document sets are fully rendered across all selected models
    *   `[✅]`   `dialecticStore.selectors.ts`
        *   `[✅]`   Replace line 921 step-based completion check with document-based: if totalDocumentsForStage > 0 && completedDocumentsForStage === totalDocumentsForStage then 'completed'
        *   `[✅]`   Existing document counting logic (lines 926-953) already iterates validMarkdownKeys and filters progress.jobs for entries with matching documentKey — only the subset of jobs with document_key contribute to document completion counting; most jobs lack document_key and that is correct
        *   `[✅]`   Preserve 'failed' status derivation from step statuses (a failed step is still relevant — step statuses reflect all jobs)
        *   `[✅]`   Preserve 'in_progress', 'paused_nsf', 'paused_user' from step statuses
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain
        *   `[✅]`   All dependencies inward (types)
        *   `[✅]`   Provides: consumed by StageTabCard, SubmitResponsesButton, SessionContributionsDisplayCard
    *   `[✅]`   `requirements`
        *   `[✅]`   "Done" label and "n/n" count always agree because both derive from document completion
        *   `[✅]`   Progress statuses reflect all jobs in the DAG via step statuses, regardless of document_key
        *   `[✅]`   No defaults or guesses
    *   `[✅]`   **Commit** `fix(store): realtime job tracking and document-based stage completion`
        *   `[✅]`   upsertJobFromLifecycleEvent.ts created with tests
        *   `[✅]`   All lifecycle handlers wired to upsert progress.jobs
        *   `[✅]`   selectUnifiedProjectProgress gates 'completed' on document proof; progress statuses unchanged

## Phase 2: Server-persisted viewing stage (Issues 3 & 6)

*   `[✅]`   [DB] supabase/migrations/`*_add_viewing_stage_id.sql` **Add viewing_stage_id column to dialectic_sessions**
    *   `[✅]`   `objective`
        *   `[✅]`   Add a nullable uuid column `viewing_stage_id` to `dialectic_sessions` that references `dialectic_stages.id`
        *   `[✅]`   Nullable because on session creation the viewing stage can default to the starting stage via the backend, not the frontend
    *   `[✅]`   `role`
        *   `[✅]`   Infrastructure — database schema
    *   `[✅]`   `module`
        *   `[✅]`   supabase/migrations — schema changes
        *   `[✅]`   Boundary: database DDL only
    *   `[✅]`   `deps`
        *   `[✅]`   dialectic_sessions table — exists
        *   `[✅]`   dialectic_stages table — exists, for FK reference
    *   `[✅]`   `context_slice`
        *   `[✅]`   ALTER TABLE only
    *   `[✅]`   `*_add_viewing_stage_id.sql`
        *   `[✅]`   ALTER TABLE dialectic_sessions ADD COLUMN viewing_stage_id uuid REFERENCES dialectic_stages(id)
        *   `[✅]`   Update RLS policies if needed (viewing_stage_id should be readable/writable by session owner)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: infrastructure
        *   `[✅]`   Provides: column available to edge functions and API
    *   `[✅]`   `requirements`
        *   `[✅]`   Column exists, nullable, FK to dialectic_stages
        *   `[✅]`   Existing sessions unaffected (null = use current_stage_id as initial viewing stage on first load)

*   `[✅]`   [BE] supabase/functions/dialectic-service/`updateViewingStage.ts` **Edge function to update viewing_stage_id on dialectic_sessions**
    *   `[✅]`   `objective`
        *   `[✅]`   Accept { sessionId, viewingStageId } payload and update dialectic_sessions.viewing_stage_id
        *   `[✅]`   Follow existing pattern from updateSessionModels.ts
    *   `[✅]`   `role`
        *   `[✅]`   Adapter — edge function handler
    *   `[✅]`   `module`
        *   `[✅]`   supabase/functions/dialectic-service — edge function handlers
        *   `[✅]`   Boundary: receives authenticated request, updates single column, returns updated session
    *   `[✅]`   `deps`
        *   `[✅]`   SupabaseClient from supabase-js — infrastructure, inward
        *   `[✅]`   dialectic_sessions table — infrastructure, inward
        *   `[✅]`   No reverse dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Receives: dbClient (SupabaseClient), payload (UpdateViewingStagePayload), userId (string)
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   **updateViewingStage**
            *   `[✅]`   Signature: `UpdateViewingStageSignature` — `(deps: UpdateViewingStageDeps, params: UpdateViewingStageParams, payload: UpdateViewingStagePayload) => Promise<UpdateViewingStageReturn>`
            *   `[✅]`   Deps: `UpdateViewingStageDeps` — `{ dbClient: SupabaseClient }`
            *   `[✅]`   Params: `UpdateViewingStageParams` — `{ userId: string }`
            *   `[✅]`   Payload: `UpdateViewingStagePayload` — `{ sessionId: string, viewingStageId: string }`
            *   `[✅]`   Return: `UpdateViewingStageReturn` — `Database["public"]["Tables"]["dialectic_sessions"]["Row"]` (updated session row)
    *   `[✅]`   unit/`updateViewingStage.test.ts`
        *   `[✅]`   Test: updates viewing_stage_id in database and returns updated session
        *   `[✅]`   Test: returns error if session not found
        *   `[✅]`   Test: returns error if user is not session owner
    *   `[✅]`   `updateViewingStage.ts`
        *   `[✅]`   Validate sessionId and viewingStageId are non-empty strings
        *   `[✅]`   Update dialectic_sessions set viewing_stage_id = viewingStageId where id = sessionId
        *   `[✅]`   Return updated session row
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter
        *   `[✅]`   Depends on: database (infrastructure, inward)
        *   `[✅]`   Provides: consumed by index.ts handler router
    *   `[✅]`   `requirements`
        *   `[✅]`   viewing_stage_id is persisted to database
        *   `[✅]`   Only the session owner can update their own viewing stage

*   `[✅]`   [BE] supabase/functions/dialectic-service/`index.ts` **Register updateViewingStage action in edge function router**
    *   `[✅]`   `objective`
        *   `[✅]`   Add 'updateViewingStage' case to the action switch in index.ts, following the updateSessionModels pattern
    *   `[✅]`   `role`
        *   `[✅]`   Adapter — edge function router
    *   `[✅]`   `module`
        *   `[✅]`   supabase/functions/dialectic-service/index.ts
    *   `[✅]`   `deps`
        *   `[✅]`   updateViewingStage handler from prior node
    *   `[✅]`   `context_slice`
        *   `[✅]`   Existing switch/case pattern, existing handlers map
    *   `[✅]`   unit/`index.test.ts`
        *   `[✅]`   Test: 'updateViewingStage' action routes to handler and returns response
    *   `[✅]`   `index.ts`
        *   `[✅]`   Add import for updateViewingStage handler
        *   `[✅]`   Add case 'updateViewingStage' to switch
        *   `[✅]`   Add to handlers map
        *   `[✅]`   Add to allowedActions array
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter
        *   `[✅]`   Depends on: updateViewingStage (adapter, inward)
    *   `[✅]`   `requirements`
        *   `[✅]`   Action is routable and authenticated

*   `[✅]`   [API] packages/api/src/`dialectic.api.ts` **Add updateViewingStage method to DialecticApiClient**
    *   `[✅]`   `objective`
        *   `[✅]`   Add updateViewingStage(payload) method that POSTs action 'updateViewingStage' to dialectic-service
        *   `[✅]`   Follow existing pattern from updateSessionModels
    *   `[✅]`   `role`
        *   `[✅]`   Port — API client method
    *   `[✅]`   `module`
        *   `[✅]`   packages/api/src/dialectic.api.ts
    *   `[✅]`   `deps`
        *   `[✅]`   UpdateViewingStagePayload from @paynless/types — domain type
        *   `[✅]`   DialecticServiceActionPayload union — needs new member
    *   `[✅]`   `context_slice`
        *   `[✅]`   this.apiClient.post pattern
    *   `[✅]`   interface/`dialectic.types.ts`
        *   `[✅]`   **updateViewingStage** (class method on DialecticApiClient)
            *   `[✅]`   Signature: `UpdateViewingStageFn` — `(payload: UpdateViewingStagePayload) => Promise<ApiResponse<UpdateViewingStageReturn>>`
            *   `[✅]`   Deps: `UpdateViewingStageDeps` — none at method level (uses `this.apiClient` from class construction)
            *   `[✅]`   Params: none beyond payload
            *   `[✅]`   Payload: `UpdateViewingStagePayload` — `{ sessionId: string, viewingStageId: string }` (reuse from backend)
            *   `[✅]`   Return: `UpdateViewingStageReturn` — `ApiResponse<>`
        *   `[✅]`   Add UpdateViewingStagePayload to DialecticServiceActionPayload union
        *   `[✅]`   Add updateViewingStage to DialecticApiClientInterface
    *   `[✅]`   unit/`dialectic.api.session.test.ts`
        *   `[✅]`   Test: updateViewingStage sends correct action and payload
        *   `[✅]`   Test: returns ApiResponse<DialecticSessionRow>
    *   `[✅]`   `dialectic.api.ts`
        *   `[✅]`   Add updateViewingStage method following updateSessionModels pattern
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: port
        *   `[✅]`   Depends on: types (domain, inward), ApiClient (infrastructure, inward)
        *   `[✅]`   Provides: consumed by dialecticStore
    *   `[✅]`   `requirements`
        *   `[✅]`   Method callable from store, returns typed response

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.ts` **Add updateViewingStage store action and wire into setViewingStage**
    *   `[✅]`   `objective`
        *   `[✅]`   When setViewingStage is called (user clicks a stage tab), persist the choice to the server via api.dialectic().updateViewingStage()
        *   `[✅]`   On session load (fetchSessionDetails, fetchDialecticProjectDetails), read viewing_stage_id from the session and set viewingStageSlug from it
        *   `[✅]`   If viewing_stage_id is null (first load), use current_stage_id as the initial viewing stage and persist it
    *   `[✅]`   `role`
        *   `[✅]`   App — store action
    *   `[✅]`   `module`
        *   `[✅]`   packages/store/src/dialecticStore.ts — setViewingStage, fetchSessionDetails paths
    *   `[✅]`   `deps`
        *   `[✅]`   updateViewingStage from @paynless/api — port, inward
    *   `[✅]`   `context_slice`
        *   `[✅]`   setViewingStage receives slug, needs to resolve to stage id for the API call
    *   `[✅]`   interface/`dialectic.types.ts`
        *   `[✅]`   DialecticStateActions: add updateViewingStage action
    *   `[✅]`   unit/`dialecticStore.test.ts`
        *   `[✅]`   Test: setViewingStage calls api.dialectic().updateViewingStage with correct sessionId and stageId
        *   `[✅]`   Test: on session load, viewingStageSlug is set from session.viewing_stage_id
        *   `[✅]`   Test: if viewing_stage_id is null on load, viewingStageSlug is set from current_stage_id
    *   `[✅]`   `dialecticStore.ts`
        *   `[✅]`   In setViewingStage: after setting viewingStageSlug, resolve slug to stage id from currentProcessTemplate.stages, call api.dialectic().updateViewingStage({ sessionId, viewingStageId })
        *   `[✅]`   In session initialization paths: read viewing_stage_id from session, resolve to slug, set viewingStageSlug
        *   `[✅]`   Remove StageTabCard useEffect fallback to stages[0] — no longer needed
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: app
        *   `[✅]`   Depends on: API client (port, inward), types (domain, inward)
        *   `[✅]`   Provides: consumed by StageTabCard, SubmitResponsesButton
    *   `[✅]`   `requirements`
        *   `[✅]`   Stage tab selection survives page refresh
        *   `[✅]`   No localStorage, no guessing, no defaults
        *   `[✅]`   Follows updateSessionModels pattern
    *   `[✅]`   **Commit** `feat(dialectic): server-persisted viewing stage`
        *   `[✅]`   Migration adding viewing_stage_id column
        *   `[✅]`   Edge function updateViewingStage with tests
        *   `[✅]`   index.ts router registration
        *   `[✅]`   API client method
        *   `[✅]`   Store action wiring and session initialization

## Phase 3: submitStageResponses applies updatedSession (Issue 5)

*   `[ ]`   [STORE] packages/store/src/`dialecticStore.ts` **Apply updatedSession from submitStageResponses response to store**
    *   `[ ]`   `objective`
        *   `[ ]`   When submitStageResponses succeeds, response.data.updatedSession contains the session with new current_stage_id. Apply it immediately to activeSessionDetail and to the matching entry in currentProjectDetail.dialectic_sessions
        *   `[ ]`   If the user's viewing_stage_id matched current_stage_id before advancement (viewing === logical), advance viewing_stage_id to the new current_stage_id as well. If viewing !== logical, preserve the user's viewing choice
    *   `[ ]`   `role`
        *   `[ ]`   App — store action
    *   `[ ]`   `module`
        *   `[ ]`   packages/store/src/dialecticStore.ts — submitStageResponses success path
    *   `[ ]`   `deps`
        *   `[ ]`   SubmitStageResponsesResponse type (contains updatedSession) — domain, inward
        *   `[ ]`   No reverse dependencies introduced
    *   `[ ]`   `context_slice`
        *   `[ ]`   response.data.updatedSession available after successful API call
        *   `[ ]`   state.activeSessionDetail, state.currentProjectDetail.dialectic_sessions available in set()
    *   `[ ]`   unit/`dialecticStore.test.ts`
        *   `[ ]`   Test: after successful submitStageResponses, activeSessionDetail.current_stage_id matches updatedSession.current_stage_id
        *   `[ ]`   Test: after successful submitStageResponses, currentProjectDetail.dialectic_sessions entry is updated
        *   `[ ]`   Test: if viewing_stage_id === old current_stage_id before submit, both viewing_stage_id and activeStageSlug advance to new stage
        *   `[ ]`   Test: if viewing_stage_id !== old current_stage_id before submit, viewing_stage_id and activeStageSlug are preserved
    *   `[ ]`   `dialecticStore.ts`
        *   `[ ]`   In submitStageResponses success branch (after line 2384): apply response.data.updatedSession to activeSessionDetail
        *   `[ ]`   Update the matching session in currentProjectDetail.dialectic_sessions
        *   `[ ]`   Check if viewing was same as logical before advancement; if so, advance activeStageSlug and persist viewing_stage_id
        *   `[ ]`   Remove the fetchDialecticProjectDetails(preserveContext: true) call — the session is already up to date from the response
    *   `[ ]`   `directionality`
        *   `[ ]`   Layer: app
        *   `[ ]`   Depends on: types (domain, inward)
        *   `[ ]`   Provides: correct session state for all downstream selectors and components
    *   `[ ]`   `requirements`
        *   `[ ]`   activeSessionDetail.current_stage_id is never stale after successful stage advancement
        *   `[ ]`   User's viewing choice is respected (don't force focus change if user chose a different stage)
        *   `[ ]`   No reliance on background refetch or lifecycle events for session state
    *   `[ ]`   **Commit** `fix(store): apply updatedSession from submitStageResponses immediately`
        *   `[ ]`   submitStageResponses applies response.data.updatedSession to store
        *   `[ ]`   Viewing stage advances only if it matched logical stage before submit

## Phase 4: Rewrite SubmitResponsesButton (Issue 4)

*   `[ ]`   [STORE] packages/store/src/`dialecticStore.selectors.ts` **Add selectCanAdvanceStage selector implementing 6 conditions**
    *   `[ ]`   `objective`
        *   `[ ]`   Create a single selector that evaluates all 6 conditions for stage advancement and returns a typed result with the individual condition booleans and an overall canAdvance boolean
        *   `[ ]`   Condition 1: session.current_stage_id === stage resolved from session.viewing_stage_id (logical === viewing)
        *   `[ ]`   Condition 2: all T×M documents completed for current stage (outputs_required satisfied)
        *   `[ ]`   Condition 3: all inputs_required for next stage are available (prior outputs exist)
        *   `[ ]`   Condition 4: current stage has no jobs paused, running, or failed
        *   `[ ]`   Condition 5: next stage has no progress (no jobs started, paused, running, or failed)
        *   `[ ]`   Condition 6: next stage exists (current stage has outgoing transition)
        *   `[ ]`   If any precondition data is unavailable (template, session, etc.), return canAdvance: false with a reason field
    *   `[ ]`   `role`
        *   `[ ]`   Domain — selector producing derived state
    *   `[ ]`   `module`
        *   `[ ]`   packages/store/src/dialecticStore.selectors.ts
        *   `[ ]`   Boundary: pure function, reads from state, no side effects
    *   `[ ]`   `deps`
        *   `[ ]`   selectUnifiedProjectProgress — domain, inward (now fixed by Phase 1)
        *   `[ ]`   selectStageRunProgress — domain, inward
        *   `[ ]`   recipesByStageSlug — state, inward
        *   `[ ]`   currentProcessTemplate (stages, transitions) — state, inward
        *   `[ ]`   activeSessionDetail — state, inward
    *   `[ ]`   `context_slice`
        *   `[ ]`   Full DialecticStateValues
    *   `[ ]`   interface/`dialectic.types.ts`
        *   `[ ]`   **selectCanAdvanceStage**
            *   `[ ]`   Signature: `SelectCanAdvanceStageSignature` — `(state: DialecticStateValues) => SelectCanAdvanceStageReturn`
            *   `[ ]`   Deps: `SelectCanAdvanceStageDeps` — none (pure selector, reads from state)
            *   `[ ]`   Params: none beyond state
            *   `[ ]`   Payload: `SelectCanAdvanceStagePayload` — `DialecticStateValues` (the store state being read)
            *   `[ ]`   Return: `SelectCanAdvanceStageReturn` — `CanAdvanceStageResult`
        *   `[ ]`   `CanAdvanceStageResult` — `{ canAdvance: boolean, conditions: { logicalMatchesViewing: boolean, currentStageComplete: boolean, nextStageInputsReady: boolean, currentStageNoActiveJobs: boolean, nextStageNoProgress: boolean, nextStageExists: boolean }, reason: string | null }`
    *   `[ ]`   interface/tests/`dialectic.types.interface.test.ts`
        *   `[ ]`   Test: CanAdvanceStageResult has all required fields typed correctly
    *   `[ ]`   interface/guards/`dialectic.types.guards.ts`
        *   `[ ]`   Guard: isCanAdvanceStageResult type guard
    *   `[ ]`   unit/`dialecticStore.selectors.test.ts`
        *   `[ ]`   Test: returns canAdvance: false when session is null
        *   `[ ]`   Test: returns canAdvance: false when template is null
        *   `[ ]`   Test: condition 1 false when viewing_stage_id !== current_stage_id
        *   `[ ]`   Test: condition 2 false when not all documents completed
        *   `[ ]`   Test: condition 3 false when next stage inputs_required not satisfied
        *   `[ ]`   Test: condition 4 false when current stage has active/failed jobs
        *   `[ ]`   Test: condition 5 false when next stage has existing progress
        *   `[ ]`   Test: condition 6 false when current stage has no outgoing transition
        *   `[ ]`   Test: returns canAdvance: true when all 6 conditions satisfied
        *   `[ ]`   Test: reason field explains which condition failed
    *   `[ ]`   `dialecticStore.selectors.ts`
        *   `[ ]`   Implement selectCanAdvanceStage reading all required state
        *   `[ ]`   Evaluate each condition independently
        *   `[ ]`   Return typed result with all conditions and overall canAdvance
    *   `[ ]`   `directionality`
        *   `[ ]`   Layer: domain
        *   `[ ]`   Depends on: types, existing selectors (inward)
        *   `[ ]`   Provides: consumed by SubmitResponsesButton
    *   `[ ]`   `requirements`
        *   `[ ]`   All 6 conditions evaluated explicitly — no defaults, no guesses
        *   `[ ]`   If data is missing, canAdvance is false with explanatory reason
        *   `[ ]`   Each condition independently testable

*   `[ ]`   [UI] apps/web/src/components/dialectic/`SubmitResponsesButton.tsx` **Rewrite button to consume selectCanAdvanceStage**
    *   `[ ]`   `objective`
        *   `[ ]`   Replace all existing visibility and disabled logic with a single call to selectCanAdvanceStage
        *   `[ ]`   Button renders if and only if canAdvance is true
        *   `[ ]`   Remove: viewedStageMatchesAppStage, isFinalStage, nextStageStarted, currentStageHasActiveJobs, allDocumentsAvailable, isReviewStage special case, all debug console.logs for visibility conditions
        *   `[ ]`   Preserve: submit handler logic, confirmation dialog, error display, pulse animation
    *   `[ ]`   `role`
        *   `[ ]`   UI — React component
    *   `[ ]`   `module`
        *   `[ ]`   apps/web/src/components/dialectic/SubmitResponsesButton.tsx
        *   `[ ]`   Boundary: consumes store selector, renders button or null
    *   `[ ]`   `deps`
        *   `[ ]`   selectCanAdvanceStage from @paynless/store — domain, inward
        *   `[ ]`   CanAdvanceStageResult type — domain, inward
        *   `[ ]`   submitStageResponses action — app, inward
    *   `[ ]`   `context_slice`
        *   `[ ]`   useDialecticStore(selectCanAdvanceStage) for visibility
        *   `[ ]`   useDialecticStore for session, project, submitStageResponses
    *   `[ ]`   unit/`SubmitResponsesButton.test.tsx`
        *   `[ ]`   Test: renders null when canAdvance is false
        *   `[ ]`   Test: renders button when canAdvance is true
        *   `[ ]`   Test: button is enabled when canAdvance is true
        *   `[ ]`   Test: submit calls submitStageResponses with correct payload
    *   `[ ]`   `SubmitResponsesButton.tsx`
        *   `[ ]`   Remove all existing condition computation (viewedStageMatchesAppStage, isFinalStage, nextStageStarted, etc.)
        *   `[ ]`   Replace with single selectCanAdvanceStage call
        *   `[ ]`   if (!canAdvanceResult.canAdvance) return null
        *   `[ ]`   Preserve handleSubmit, confirmation dialog, error display
        *   `[ ]`   Remove isReviewStage special case
        *   `[ ]`   Remove all debug console.logs related to button visibility
    *   `[ ]`   `directionality`
        *   `[ ]`   Layer: UI
        *   `[ ]`   Depends on: selectors (domain, inward), store actions (app, inward)
        *   `[ ]`   Provides: user-facing button
    *   `[ ]`   `requirements`
        *   `[ ]`   Button visibility driven by exactly 6 conditions, no more, no less
        *   `[ ]`   No guessing, no defaults, no special-case stage names
        *   `[ ]`   Readable, minimal component — all logic lives in the selector
    *   `[ ]`   **Commit** `fix(ui): rewrite SubmitResponsesButton with explicit 6-condition selector`
        *   `[ ]`   selectCanAdvanceStage selector with full test coverage
        *   `[ ]`   SubmitResponsesButton rewritten to consume it
        *   `[ ]`   All legacy visibility logic removed

## Phase 5: Cleanup

*   `[ ]`   [UI] apps/web/src/hooks/`useStageProgressPolling.ts` **Evaluate and simplify polling after realtime job tracking**
    *   `[ ]`   `objective`
        *   `[ ]`   With progress.jobs updated in realtime, evaluate whether aggressive 1s polling and triple-refresh-on-completion are still necessary
        *   `[ ]`   If polling is still needed (belt-and-suspenders for missed events), reduce frequency and remove multi-refresh hacks
        *   `[ ]`   If polling is no longer needed, remove the hook entirely and remove its usage from SessionContributionsDisplayCard
    *   `[ ]`   `role`
        *   `[ ]`   UI — React hook
    *   `[ ]`   `module`
        *   `[ ]`   apps/web/src/hooks/useStageProgressPolling.ts
        *   `[ ]`   apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx (consumer)
    *   `[ ]`   `deps`
        *   `[ ]`   hydrateAllStageProgress store action — app, inward
    *   `[ ]`   `context_slice`
        *   `[ ]`   Evaluate based on testing results from Phases 1-4
    *   `[ ]`   `useStageProgressPolling.ts`
        *   `[ ]`   Decision depends on testing results — either simplify or remove
    *   `[ ]`   `directionality`
        *   `[ ]`   Layer: UI
    *   `[ ]`   `requirements`
        *   `[ ]`   No unnecessary server load from aggressive polling
        *   `[ ]`   Realtime updates are the primary mechanism, polling is backup at most

*   `[ ]`   [UI] apps/web/src/hooks/`useViewingStageSync.ts` **Evaluate and simplify after server-persisted viewing stage**
    *   `[ ]`   `objective`
        *   `[ ]`   With viewing_stage_id server-persisted and activeStageSlug set from it on load, evaluate whether the useActiveStageSync hook is still necessary
        *   `[ ]`   If activeContextStage can be derived from activeStageSlug inside a selector or set atomically in setViewingStage, this hook can be removed
    *   `[ ]`   `role`
        *   `[ ]`   UI — React hook
    *   `[ ]`   `module`
        *   `[ ]`   apps/web/src/hooks/useActiveStageSync.ts
        *   `[ ]`   apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx (consumer)
    *   `[ ]`   `deps`
        *   `[ ]`   setActiveContextStage store action — app, inward
    *   `[ ]`   `context_slice`
        *   `[ ]`   Evaluate based on testing results from Phases 1-4
    *   `[ ]`   `useActiveStageSync.ts`
        *   `[ ]`   Decision depends on testing results — either simplify or remove
    *   `[ ]`   `directionality`
        *   `[ ]`   Layer: UI
    *   `[ ]`   `requirements`
        *   `[ ]`   No render-cycle gap between activeStageSlug and activeContextStage
        *   `[ ]`   The two-property pattern either eliminated or made atomic
    *   `[ ]`   **Commit** `refactor(ui): simplify polling and stage sync hooks after hydration fixes`
        *   `[ ]`   useStageProgressPolling simplified or removed
        *   `[ ]`   useActiveStageSync simplified or removed



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

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)

