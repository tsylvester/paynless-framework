# Doc-Centric Front End Fixes

[ ] // So that find->replace will stop unrolling my damned instructions! 

## Problem Statement
-The doc-centric backend refactor is complete. The front end needs updated to consume the documents.  

## Objectives
- Transform the front end for displaying documents and enabling feedback. 

## Expected Outcome
- Users can complete the entire dialectic work flow.

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn so that you remember your instructions. 

# Work Breakdown Structure

*   `[✅]`   [BE] supabase/functions/dialectic-service/`getAllStageProgress.ts` **Enhance to return job-level progress per step per model instead of document-based progress**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Return granular job completion data grouped by recipe step_key
        *   `[✅]`   For each step, return: totalJobs, completedJobs, inProgressJobs, failedJobs
        *   `[✅]`   For EXECUTE steps (model steps), include per-model job status breakdown
        *   `[✅]`   Track which models PERFORMED jobs from dialectic_generation_jobs table, not from selectedModels
        *   `[✅]`   PLAN steps (granularity_strategy='all_to_one') have exactly 1 job total regardless of model count
        *   `[✅]`   EXECUTE steps (granularity_strategy='per_source_document' or 'per_model') have N jobs where N = number of models that received work
    *   `[✅]`   `role.md`
        *   `[✅]`   Backend service function that provides the single source of truth for progress data
        *   `[✅]`   Queries dialectic_generation_jobs table to derive actual job completion state
        *   `[✅]`   Returns normalized DTO suitable for frontend consumption
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: dialectic-service edge function → database query → DTO response
        *   `[✅]`   Input: GetAllStageProgressPayload with sessionId, iterationNumber, userId, projectId
        *   `[✅]`   Output: GetAllStageProgressResponse with enhanced StageProgressEntry[] containing jobProgress per step
    *   `[✅]`   `deps.md`
        *   `[✅]`   SupabaseClient<Database> for database queries
        *   `[✅]`   User for authorization checks
        *   `[✅]`   dialectic_generation_jobs table: source of job status data
        *   `[✅]`   dialectic_stage_recipe_steps table: source of step_key to recipe_step_id mapping
        *   `[✅]`   isRecord type guard from type_guards.common.ts
        *   `[✅]`   deconstructStoragePath from path_deconstructor.ts (existing dep, unchanged)
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   Add `JobProgressEntry` interface: `{ totalJobs: number; completedJobs: number; inProgressJobs: number; failedJobs: number; modelJobStatuses?: Record<string, 'pending' | 'in_progress' | 'completed' | 'failed'>; }`
        *   `[✅]`   Add `StepJobProgress` type: `Record<string, JobProgressEntry>` where key is step_key
        *   `[✅]`   Extend `StageProgressEntry` interface to add: `jobProgress: StepJobProgress;`
        *   `[✅]`   Existing `stepStatuses: Record<string, string>` remains for backward compatibility but jobProgress is the authoritative source
    *   `[✅]`   interface/tests/`type_guards.dialectic.test.ts`
        *   `[✅]`   Add test: `isJobProgressEntry returns true for valid JobProgressEntry with all required fields`
        *   `[✅]`   Add test: `isJobProgressEntry returns false when totalJobs is missing or not a number`
        *   `[✅]`   Add test: `isJobProgressEntry returns true when optional modelJobStatuses is present with valid status values`
        *   `[✅]`   Add test: `isJobProgressEntry returns false when modelJobStatuses contains invalid status value`
    *   `[✅]`   interface/guards/`type_guards.dialectic.ts`
        *   `[✅]`   Add `isJobProgressEntry(value: unknown): value is JobProgressEntry` type guard
        *   `[✅]`   Validates totalJobs, completedJobs, inProgressJobs, failedJobs are numbers >= 0
        *   `[✅]`   Validates optional modelJobStatuses is Record<string, valid_status> if present
    *   `[✅]`   unit/`getAllStageProgress.test.ts`
        *   `[✅]`   Add test: `returns jobProgress with correct totalJobs count for PLAN step (exactly 1 job regardless of model count)`
        *   `[✅]`   Add test: `returns jobProgress with correct totalJobs count for EXECUTE step (N jobs where N = distinct model_ids in jobs table)`
        *   `[✅]`   Add test: `returns jobProgress.completedJobs matching count of jobs with status='completed' for each step_key`
        *   `[✅]`   Add test: `returns jobProgress.inProgressJobs matching count of jobs with status='in_progress' or 'retrying' for each step_key`
        *   `[✅]`   Add test: `returns jobProgress.failedJobs matching count of jobs with status='failed' for each step_key`
        *   `[✅]`   Add test: `returns jobProgress.modelJobStatuses with per-model status for EXECUTE steps`
        *   `[✅]`   Add test: `modelJobStatuses keys are actual model_ids from job payloads, not from selectedModels`
        *   `[✅]`   Add test: `PLAN step jobProgress does not include modelJobStatuses (undefined)`
        *   `[✅]`   Add test: `step_key is derived from payload.planner_metadata.recipe_step_id lookup in dialectic_stage_recipe_steps`
        *   `[✅]`   Add test: `all jobs supply valid data with no defaults, fallbacks, or healing`
    *   `[✅]`   `getAllStageProgress.ts`
        *   `[✅]`   Query dialectic_generation_jobs with: `select('id, status, payload, stage_slug').eq('session_id', sessionId).eq('iteration_number', iterationNumber)`
        *   `[✅]`   Extract recipe_step_id from each job's `payload.planner_metadata.recipe_step_id`
        *   `[✅]`   Lookup step_key from dialectic_stage_recipe_steps using recipe_step_id
        *   `[✅]`   Group jobs by step_key, then aggregate status counts per step
        *   `[✅]`   For EXECUTE jobs, also group by payload.model_id to build modelJobStatuses
        *   `[✅]`   Determine from job_type if step is EXECUTE (models), PLAN or RENDER (no models)
        *   `[✅]`   Build StepJobProgress map and add to each StageProgressEntry as jobProgress field
        *   `[✅]`   Preserve existing documents and stepStatuses fields for backward compatibility
    *   `[✅]`   `requirements.md`
        *   `[✅]`   jobProgress must reflect actual job table state, not document completion or selectedModels
        *   `[✅]`   totalJobs for a step = count of distinct jobs in dialectic_generation_jobs for that step_key
        *   `[✅]`   Progress calculation: stepPercentage = (completedJobs / totalJobs) * 100
        *   `[✅]`   All model_ids in modelJobStatuses must come from actual job payloads, never from session.selected_models
    *   `[✅]`   **Commit** `feat(be): getAllStageProgress returns job-level progress per step with per-model breakdown`

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.documents.ts` **Add jobProgress tracking to stageRunProgress and update from job notifications**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Add jobProgress: StepJobProgress to stageRunProgress[progressKey] state
        *   `[✅]`   Update jobProgress from job lifecycle notifications (planner_started, planner_completed, execute_started, document_completed, job_failed)
        *   `[✅]`   Track actual model_ids from notification payloads, not from selectedModels
        *   `[✅]`   Increment/decrement job counts as notifications arrive in real-time
    *   `[✅]`   `role.md`
        *   `[✅]`   State management layer that maintains real-time job progress state
        *   `[✅]`   Receives job notifications via notification handlers and updates jobProgress accordingly
        *   `[✅]`   Provides jobProgress data to selectors for progress calculation
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: notification handlers → state mutation → selector consumption
        *   `[✅]`   jobProgress state keyed by progressKey (sessionId:stageSlug:iterationNumber) and step_key
        *   `[✅]`   Each step_key maps to JobProgressEntry with job counts and optional modelJobStatuses
    *   `[✅]`   `deps.md`
        *   `[✅]`   JobProgressEntry, StepJobProgress types from @paynless/types (frontend mirror of backend types)
        *   `[✅]`   Notification payload types: PlannerStartedPayload, PlannerCompletedPayload, ExecuteStartedPayload, DocumentCompletedPayload, JobFailedPayload from notification.service.types.ts
        *   `[✅]`   Existing stageRunProgress state structure
        *   `[✅]`   STAGE_RUN_DOCUMENT_KEY_SEPARATOR constant from @paynless/types
    *   `[✅]`   interface/`packages/types/src/dialectic.types.ts`
        *   `[✅]`   Add `JobProgressEntry` interface matching backend: `{ totalJobs: number; completedJobs: number; inProgressJobs: number; failedJobs: number; modelJobStatuses?: Record<string, 'pending' | 'in_progress' | 'completed' | 'failed'>; }`
        *   `[✅]`   Add `StepJobProgress` type: `Record<string, JobProgressEntry>`
        *   `[✅]`   Add `jobProgress: StepJobProgress` to `StageRunProgressEntry` interface (or create if not exists)
        *   `[✅]`   Export all new types
    *   `[✅]`   unit/`dialecticStore.documents.test.ts`
        *   `[✅]`   Add test: `handlePlannerStartedLogic initializes jobProgress[step_key] with totalJobs=1, inProgressJobs=1, completedJobs=0, failedJobs=0`
        *   `[✅]`   Add test: `handlePlannerCompletedLogic updates jobProgress[step_key] to completedJobs=1, inProgressJobs=0`
        *   `[✅]`   Add test: `handleExecuteStartedLogic increments jobProgress[step_key].totalJobs and inProgressJobs, adds modelId to modelJobStatuses with 'in_progress'`
        *   `[✅]`   Add test: `handleDocumentCompletedLogic decrements inProgressJobs, increments completedJobs, updates modelJobStatuses[modelId] to 'completed'`
        *   `[✅]`   Add test: `handleJobFailedLogic decrements inProgressJobs, increments failedJobs, updates modelJobStatuses[modelId] to 'failed'`
        *   `[✅]`   Add test: `jobProgress persists across multiple notifications for same step_key (accumulates correctly)`
        *   `[✅]`   Add test: `modelJobStatuses tracks distinct modelIds from actual notifications, not from selectedModels state`
        *   `[✅]`   Add test: `hydrateStageProgress populates jobProgress from API response`
    *   `[✅]`   `dialecticStore.documents.ts`
        *   `[✅]`   Add ensureJobProgressEntry helper: creates JobProgressEntry with zeros if not exists for step_key
        *   `[✅]`   In handlePlannerStartedLogic: extract step_key from notification.step_key, call ensureJobProgressEntry, set totalJobs=1, inProgressJobs=1
        *   `[✅]`   In handlePlannerCompletedLogic: set completedJobs=1, inProgressJobs=0 for step_key
        *   `[✅]`   In handleExecuteStartedLogic: extract step_key and modelId from notification, increment totalJobs and inProgressJobs, set modelJobStatuses[modelId]='in_progress'
        *   `[✅]`   In handleDocumentCompletedLogic: decrement inProgressJobs, increment completedJobs, set modelJobStatuses[modelId]='completed'
        *   `[✅]`   In handleJobFailedLogic: decrement inProgressJobs, increment failedJobs, set modelJobStatuses[modelId]='failed'
        *   `[✅]`   In hydrateStageProgressLogic: copy jobProgress from API response to stageRunProgress[progressKey].jobProgress
    *   `[✅]`   `requirements.md`
        *   `[✅]`   jobProgress must be updated in real-time as notifications arrive
        *   `[✅]`   model_ids in modelJobStatuses come exclusively from notification payloads
        *   `[✅]`   PLAN steps have no modelJobStatuses (single orchestration job)
        *   `[✅]`   EXECUTE steps accumulate modelJobStatuses as each model's job starts/completes/fails
        *   `[✅]`   jobProgress state must be hydrated from backend on page load/refresh
    *   `[✅]`   **Commit** `feat(store): add jobProgress tracking to stageRunProgress with real-time notification updates`

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.selectors.ts` **Rewrite selectUnifiedProjectProgress to calculate progress from jobProgress, not documents or selectedModels**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Remove dependency on state.selectedModels for progress calculation
        *   `[✅]`   Calculate step progress from stageRunProgress[progressKey].jobProgress
        *   `[✅]`   PLAN steps: percentage = jobProgress[step_key].completedJobs > 0 ? 100 : 0
        *   `[✅]`   EXECUTE steps: percentage = (completedJobs / totalJobs) * 100
        *   `[✅]`   Stage percentage = average of all step percentages (sum / count)
        *   `[✅]`   Overall percentage = (completedStages * 100 + currentStagePercentage) / totalStages
    *   `[✅]`   `role.md`
        *   `[✅]`   Memoized selector that computes unified progress from job-based state
        *   `[✅]`   Single source of truth for all progress UI components
        *   `[✅]`   Returns UnifiedProjectProgress with totalStages, completedStages, currentStageSlug, overallPercentage, stageDetails with stepDetails
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: store state → selector → UI components (DynamicProgressBar, StageTabCard, etc.)
        *   `[✅]`   Input: DialecticStateValues, sessionId
        *   `[✅]`   Output: UnifiedProjectProgress with accurate job-based percentages
    *   `[✅]`   `deps.md`
        *   `[✅]`   stageRunProgress from state with jobProgress field
        *   `[✅]`   recipesByStageSlug from state for step metadata
        *   `[✅]`   currentProcessTemplate from state for stage list and transitions
        *   `[✅]`   selectSessionById helper selector
        *   `[✅]`   createSelector from reselect for memoization
        *   `[✅]`   UnifiedProjectProgress, StageProgressDetail, StepProgressDetail types from @paynless/types
    *   `[✅]`   interface/`packages/types/src/dialectic.types.ts`
        *   `[✅]`   Update `StepProgressDetail` interface: change `totalModels` to `totalJobs`, change `completedModels` to `completedJobs`, add `inProgressJobs: number`, add `failedJobs: number`
        *   `[✅]`   Update `StageProgressDetail` interface if needed to include jobProgress summary
        *   `[✅]`   Ensure UnifiedProjectProgress.stageDetails[].stepsDetail[] uses updated StepProgressDetail
    *   `[✅]`   unit/`dialecticStore.selectors.test.ts`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns stepPercentage=100 for PLAN step when jobProgress[step_key].completedJobs >= 1`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns stepPercentage=0 for PLAN step when jobProgress[step_key].completedJobs === 0`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns stepPercentage=(completedJobs/totalJobs)*100 for EXECUTE step`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress stagePercentage equals average of all step percentages`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress overallPercentage equals (completedStages*100 + currentStagePercentage) / totalStages`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress does NOT read from state.selectedModels`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns correct progress when selectedModels is empty but jobs exist`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns correct progress when selectedModels changes but job state unchanged`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns status='failed' for step when failedJobs > 0`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns status='in_progress' for step when inProgressJobs > 0 and failedJobs === 0`
        *   `[✅]`   Add test: `selectUnifiedProjectProgress returns status='completed' for step when completedJobs === totalJobs and totalJobs > 0`
    *   `[✅]`   `dialecticStore.selectors.ts`
        *   `[✅]`   Remove lines 813-815 that read state.selectedModels for progress calculation
        *   `[✅]`   Replace isModelStep function with check: step has EXECUTE job_type (not PLAN or RENDER)
        *   `[✅]`   In step iteration loop (lines 854-915), replace document counting with:
            *   `[✅]`   Get jobProgress from `progress?.jobProgress?.[stepKey]` or default to `{ totalJobs: 0, completedJobs: 0, inProgressJobs: 0, failedJobs: 0 }`
            *   `[✅]`   Set `totalJobs = jobProgress.totalJobs`
            *   `[✅]`   Set `completedJobs = jobProgress.completedJobs`
            *   `[✅]`   Set `stepPercentage = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0`
            *   `[✅]`   Set `stepStatus` based on: failed if failedJobs > 0, in_progress if inProgressJobs > 0, completed if completedJobs === totalJobs && totalJobs > 0, else not_started
        *   `[✅]`   Update StepProgressDetail construction to use new totalJobs/completedJobs/inProgressJobs/failedJobs fields
        *   `[✅]`   Keep existing stagePercentage calculation as average of step percentages
        *   `[✅]`   Keep existing overallPercentage calculation
    *   `[✅]`   `requirements.md`
        *   `[✅]`   selectedModels state MUST NOT be used in progress calculation
        *   `[✅]`   Progress is derived exclusively from jobProgress in stageRunProgress
        *   `[✅]`   Step percentage formula: (completedJobs / totalJobs) * 100, or 0 if totalJobs is 0
        *   `[✅]`   Stage percentage formula: sum(stepPercentages) / stepCount
        *   `[✅]`   Overall percentage formula: (completedStages * 100 + currentStagePercentage) / totalStages
    *   `[✅]`   **Commit** `fix(store): selectUnifiedProjectProgress calculates progress from jobProgress, not selectedModels`

*   `[ ]`   [UI] apps/web/src/components/common/`DynamicProgressBar.tsx` **Display granular step-by-step progress from job-based selector**
    *   `[ ]`   `objective.md`
        *   `[ ]`   Display overall progress percentage from selectUnifiedProjectProgress.overallPercentage
        *   `[ ]`   No reference to selectedModels - all data from selector
    *   `[ ]`   `role.md`
        *   `[ ]`   UI component that visualizes progress to the user
        *   `[ ]`   Consumes selectUnifiedProjectProgress selector output
        *   `[ ]`   Single progress display component used across the application
    *   `[ ]`   `module.md`
        *   `[ ]`   Boundary: selector output → React component → rendered UI
        *   `[ ]`   Input: sessionId prop to pass to selector
        *   `[ ]`   Output: Visual progress bar with percentage that reflects the exact actual progress 
    *   `[ ]`   `deps.md`
        *   `[ ]`   useDialecticStore hook for accessing store
        *   `[ ]`   selectUnifiedProjectProgress selector from dialecticStore.selectors.ts
        *   `[ ]`   UnifiedProjectProgress type from @paynless/types
        *   `[ ]`   Existing Progress UI component from shadcn/ui (or similar)
    *   `[ ]`   unit/`DynamicProgressBar.test.tsx`
        *   `[ ]`   Add test: `renders overall percentage from selectUnifiedProjectProgress.overallPercentage`
        *   `[ ]`   Add test: `renders current stage name from selectUnifiedProjectProgress.currentStageSlug`
        *   `[ ]`   Add test: `renders step progress as completedJobs/totalJobs for current stage steps`
        *   `[ ]`   Add test: `renders 0% when jobProgress is empty (no jobs started)`
        *   `[ ]`   Add test: `renders 100% when all jobs completed for all stages`
        *   `[ ]`   Add test: `does not reference selectedModels`
        *   `[ ]`   Add test: `updates in real-time as selector output changes (job notifications processed)`
    *   `[ ]`   `DynamicProgressBar.tsx`
        *   `[ ]`   Import selectUnifiedProjectProgress from @paynless/store
        *   `[ ]`   Call selector with sessionId prop: `const progress = useDialecticStore(state => selectUnifiedProjectProgress(state, sessionId))`
        *   `[ ]`   Render main progress bar with progress.overallPercentage
        *   `[ ]`   Render current stage section showing progress.currentStageSlug
        *   `[ ]`   For current stage, iterate progress.stageDetails[currentIndex].stepsDetail and render each step's progress
        *   `[ ]`   Remove any existing code that reads from selectedModels or calculates progress inline
    *   `[ ]`   integration/`DynamicProgressBar.integration.test.tsx`
        *   `[ ]`   Add test: `displays correct percentage when stageRunProgress has jobProgress with completed jobs`
        *   `[ ]`   Add test: `displays correct percentage after job notification updates jobProgress`
        *   `[ ]`   Add test: `displays consistent progress with StageTabCard completion badges`
    *   `[ ]`   `requirements.md`
        *   `[ ]`   Progress display must match selectUnifiedProjectProgress output exactly
        *   `[ ]`   No inline progress calculations - all from selector
        *   `[ ]`   Progress must reflect job status (not document status)
    *   `[ ]`   **Commit** `feat(ui): DynamicProgressBar displays job-based granular step progress from SSOT selector`

*   `[✅]` `[BE]` supabase/functions/_shared/services/`file_manager.ts` **Fix cleanup logic to only delete specific uploaded file**
    *   `[✅]` `objective.md`
        *   `[✅]` When DB registration fails after successful upload, only the specific file just uploaded should be deleted
        *   `[✅]` Sibling files in the same directory (e.g., `seed_prompt.md`) must NOT be deleted
    *   `[✅]` `role.md`
        *   `[✅]` Infrastructure adapter for Supabase Storage file operations
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to file upload, registration, and cleanup within `_shared/services`
    *   `[✅]` `deps.md`
        *   `[✅]` `this.supabase.storage` - Supabase storage client
        *   `[✅]` `finalMainContentFilePath` - directory path (already in scope)
        *   `[✅]` `finalFileName` - specific filename (already in scope)
    *   `[✅]` interface/`file_manager.types.ts`
        *   `[✅]` No type changes required for this fix
    *   `[✅]` unit/`file_manager.test.ts`
        *   `[✅]` Test: cleanup on DB error deletes only the specific uploaded file
        *   `[✅]` Test: sibling files in same directory are preserved after cleanup
    *   `[✅]` `file_manager.ts`
        *   `[✅]` Replace lines 396-405: remove `list()` + loop over all files
        *   `[✅]` Construct single path: `${finalMainContentFilePath}/${finalFileName}`
        *   `[✅]` Call `remove([fullPathToRemove])` for only that one file
    *   `[✅]` integration/`file_manager.integration.test.ts`
        *   `[✅]` Test: upload file, simulate DB error, verify only that file is removed
        *   `[✅]` Test: pre-existing sibling file survives cleanup
    *   `[✅]` `requirements.md`
        *   `[✅]` Cleanup must target exactly one file path
        *   `[✅]` Cleanup must not use `list()` to enumerate directory contents
    *   `[✅]` **Commit** `fix(be): file_manager cleanup only deletes specific uploaded file, not entire directory`

*   `[✅]` `[BE]` supabase/functions/_shared/utils/`path_constructor.ts` **Update UserFeedback to use original document path**
    *   `[✅]` `objective.md`
        *   `[✅]` `FileType.UserFeedback` must place feedback file alongside original document
        *   `[✅]` Feedback filename must be `{original_basename}_feedback.md`
    *   `[✅]` `role.md`
        *   `[✅]` Domain utility for deterministic storage path construction
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to path construction logic in `_shared/utils`
    *   `[✅]` `deps.md`
        *   `[✅]` `PathContext` from `file_manager.types.ts` - add `originalStoragePath` field
        *   `[✅]` `sanitizeForPath` - existing helper in same file
    *   `[✅]` interface/`file_manager.types.ts`
        *   `[✅]` Add optional `originalStoragePath?: string` to `PathContext` interface
        *   `[✅]` Add optional `originalBaseName?: string` to `PathContext` interface (for feedback filename derivation)
    *   `[✅]` interface/tests/`path_constructor.interface.test.ts`
        *   `[✅]` Test: `PathContext` with `originalStoragePath` satisfies interface
        *   `[✅]` Test: `PathContext` with `originalBaseName` satisfies interface
    *   `[✅]` interface/guards/`type_guards.file_manager.ts`
        *   `[✅]` No new guards required (fields are optional)
    *   `[✅]` unit/`path_constructor.test.ts`
        *   `[✅]` Test: `UserFeedback` with `originalStoragePath` returns that path as `storagePath`
        *   `[✅]` Test: `UserFeedback` with `originalBaseName` returns `{baseName}_feedback.md` as `fileName`
    *   `[✅]` `path_constructor.ts`
        *   `[✅]` Update `FileType.UserFeedback` case (lines 159-161)
        *   `[✅]` If `context.originalStoragePath` and `context.originalBaseName` provided, use them
        *   `[✅]` Construct `fileName` as `${originalBaseName}_feedback.md`
        *   `[✅]` Otherwise fall back to legacy behavior
    *   `[✅]` integration/`path_constructor.integration.test.ts`
        *   `[✅]` Test: full path context produces correct feedback path alongside rendered document
    *   `[✅]` `requirements.md`
        *   `[✅]` Feedback file must be in same directory as original document
        *   `[✅]` Feedback filename must preserve original document's naming pattern
        *   `[✅]` Legacy behavior preserved when optional fields not provided
    *   `[✅]` **Commit** `feat(be): path_constructor UserFeedback supports original document path derivation`

*   `[✅]` `[BE]` supabase/functions/dialectic-service/`submitStageDocumentFeedback.ts` **Look up original document path for feedback placement**
    *   `[✅]` `objective.md`
        *   `[✅]` Query `dialectic_project_resources` using `sourceContributionId` to get original document's `storage_path` and `file_name`
        *   `[✅]` Derive feedback path context from original document location
        *   `[✅]` Pass `originalStoragePath` and `originalBaseName` to `pathContext`
    *   `[✅]` `role.md`
        *   `[✅]` Application service for handling user feedback submission
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to dialectic-service feedback flow
    *   `[✅]` `deps.md`
        *   `[✅]` `dbClient` - Supabase client for DB queries
        *   `[✅]` `fileManager.uploadAndRegisterFile` - for storage upload
        *   `[✅]` `PathContext` with new optional fields from previous node
        *   `[✅]` `dialectic_project_resources` table - to look up original document
    *   `[✅]` interface/`dialectic.interface.ts`
        *   `[✅]` No changes to `SubmitStageDocumentFeedbackPayload` (already has `sourceContributionId`)
    *   `[✅]` unit/`submitStageDocumentFeedback.test.ts`
        *   `[✅]` Test: when `sourceContributionId` provided, queries `dialectic_project_resources` for original doc
        *   `[✅]` Test: error returned if original document lookup fails
        *   `[✅]` Test: `pathContext` includes `originalStoragePath` from looked-up resource
        *   `[✅]` Test: `pathContext` includes `originalBaseName` derived from looked-up `file_name`
    *   `[✅]` `submitStageDocumentFeedback.ts`
        *   `[✅]` After validation, query `dialectic_project_resources` where `source_contribution_id = sourceContributionId` and `resource_type = 'rendered_document'`
        *   `[✅]` Extract `storage_path` and `file_name` from result
        *   `[✅]` Derive `originalBaseName` by removing `.md` extension from `file_name`
        *   `[✅]` Add `originalStoragePath` and `originalBaseName` to `uploadContext.pathContext`
    *   `[✅]` integration/`submitStageDocumentFeedback.integration.test.ts`
        *   `[✅]` Test: feedback file created alongside original rendered document
        *   `[✅]` Test: feedback filename is `{original}_feedback.md`
        *   `[✅]` Test: seed_prompt.md in same stage directory is not affected
    *   `[✅]` `requirements.md`
        *   `[✅]` `sourceContributionId` must be present to save feedback
        *   `[✅]` Feedback file must be placed in original document's directory
        *   `[✅]` Feedback filename must match pattern `{originalBaseName}_feedback.md`
    *   `[✅]` **Commit** `feat(be): submitStageDocumentFeedback places feedback alongside original document`

*   `[✅]` `[COMMIT]` **Final checkpoint** `fix(be): feedback files placed correctly and cleanup preserves sibling files`

*   `[✅]` `[BE]` supabase/functions/dialectic-service/`getProjectResourceContent.ts` **Return resource_type in content response**
    *   `[✅]` interface/`dialectic.interface.ts`
        *   `[✅]` Add `resourceType: string | null` to `GetProjectResourceContentResponse`
    *   `[✅]` unit/`getProjectResourceContent.test.ts`
        *   `[✅]` Assert successful response includes `resourceType` matching the resource row's `resource_type`
        *   `[✅]` Assert `resourceType` is present in response shape validation
    *   `[✅]` `getProjectResourceContent.ts`
        *   `[✅]` Add `resource_type` to the `.select()` column list (line 27)
        *   `[✅]` Include `resourceType: resource.resource_type` in the `responseData` object (line 89–94)
    *   `[✅]` **Commit** `feat(be): getProjectResourceContent returns resourceType in response`
        *   `[✅]` Backend now includes `resource_type` from the `dialectic_project_resources` row in the content response; additive, backward-compatible

*   `[✅]` `[STORE]` packages/store/`dialecticStore.documents.ts` **Unify document identity into stageDocumentContent — fetch path and feedback submission**
    *   `[✅]` interface/`dialectic.types.ts` (packages/types)
        *   `[✅]` Add `resourceType: string | null` to `StageDocumentContentState`
        *   `[✅]` Add `resource: EditedDocumentResource | null` to `StageDocumentContentState`
        *   `[✅]` Add `resourceType: string | null` to frontend `GetProjectResourceContentResponse`
    *   `[✅]` unit/`dialecticStore.documents.test.ts`
        *   `[✅]` Test: `ensureStageDocumentContentLogic` initializes entry with `resourceType: null` and `resource: null`
        *   `[✅]` Test: `reapplyDraftToNewBaselineLogic` stores `resourceType` from parameter onto the content entry
        *   `[✅]` Test: `fetchStageDocumentContentLogic` reads `resourceType` from API response and stores it via `reapplyDraftToNewBaseline`
        *   `[✅]` Test: `submitStageDocumentFeedbackLogic` reads `sourceContributionId` from `stageDocumentContent` entry (not `stageDocumentResources`)
        *   `[✅]` Test: `submitStageDocumentFeedbackLogic` sends correct `sourceContributionId` when `stageDocumentResources` is empty (load-only flow, no prior save)
        *   `[✅]` Update all mock `getProjectResourceContent` responses to include `resourceType`
        *   `[✅]` Update all literal `StageDocumentContentState` constructions to include `resourceType: null, resource: null`
    *   `[✅]` `dialecticStore.documents.ts`
        *   `[✅]` `ensureStageDocumentContentLogic`: add `resourceType: null` and `resource: null` to new entry construction (line 197–212)
        *   `[✅]` `reapplyDraftToNewBaselineLogic`: add `resourceType?: string | null` parameter; set `entry.resourceType = resourceType ?? entry.resourceType ?? null`
        *   `[✅]` `ImmerHelpers` type: update `reapplyDraftToNewBaseline` signature to include `resourceType` parameter
        *   `[✅]` `fetchStageDocumentContentLogic`: read `resourceType` from `response.data.resourceType`, pass to `helpers.reapplyDraftToNewBaseline`
        *   `[✅]` `submitStageDocumentFeedbackLogic`: replace `get().stageDocumentResources[serializedKey]` with `get().stageDocumentContent[serializedKey]`; read `sourceContributionId` from `contentEntry?.sourceContributionId` instead of `resolvedResource?.source_contribution_id`

*   `[✅]` `[STORE]` packages/store/`dialecticStore.selectors.ts` **Delete orphaned metadata selectors**
    *   `[✅]` unit/`dialecticStore.selectors.test.ts`
        *   `[✅]` Remove all tests for `selectStageDocumentResourceMetadata`
        *   `[✅]` Remove all tests for `selectStageDocumentResourceMetadataByKey`
    *   `[✅]` `dialecticStore.selectors.ts`
        *   `[✅]` Delete `selectStageDocumentResourceMetadata` (lines 1122–1131; zero consumers in production or test code)
        *   `[✅]` Delete `selectStageDocumentResourceMetadataByKey` (lines 1144–1148; zero consumers in production or test code)
        *   `[✅]` Remove `EditedDocumentResource` import if now unused in this file

*   `[ ]` `[STORE]` packages/store/`dialecticStore.ts` **Remove stageDocumentResources map and updateStageDocumentResource action; all identity reads from stageDocumentContent scalars**
    *   `[✅]` interface/`dialectic.types.ts` (packages/types)
        *   `[✅]` Remove `resource: EditedDocumentResource | null` from `StageDocumentContentState`
        *   `[✅]` Remove `stageDocumentResources: Record<string, EditedDocumentResource>` from `DialecticStateValues`
        *   `[✅]` Remove `updateStageDocumentResource` from `DialecticStore` action interface (line 638)
    *   `[✅]` unit/`dialecticStore.contribution.test.ts`
        *   `[✅]` Test: `saveContributionEdit` success updates `stageDocumentContent[key].sourceContributionId` from `response.data.resource.source_contribution_id`
        *   `[✅]` Test: `saveContributionEdit` success updates `stageDocumentContent[key].resourceType` from `response.data.resource.resource_type`
        *   `[✅]` Remove all `stageDocumentResources` seeding and assertions (line 1201+)
        *   `[✅]` Remove all `updateStageDocumentResource` tests
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[✅]` unit/`dialecticStore.test.ts`
        *   `[✅]` Test: `submitStageResponses` edit path reads `content.sourceContributionId` and `content.resourceType` — succeeds without `stageDocumentResources`
        *   `[✅]` Test: `submitStageResponses` feedback path reads `content.sourceContributionId` — succeeds without prior save (load-only flow)
        *   `[✅]` Test: `submitStageResponses` submits both dirty edit and dirty feedback for same key in a single call
        *   `[✅]` Remove all `stageDocumentResources` seeding from test state
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[ ]` `dialecticStore.ts`
        *   `[ ]` Remove `stageDocumentResources: {}` from initial state (line 192)
        *   `[ ]` Delete `updateStageDocumentResource` action entirely (lines 2288–2308)
        *   `[ ]` `saveContributionEdit` success path (lines 2251–2264): replace `state.stageDocumentResources[serializedKey] = resource` with `documentEntry.sourceContributionId = resource.source_contribution_id; documentEntry.resourceType = resource.resource_type;` (the `documentEntry` variable already exists from `ensureStageDocumentContent` call above)
        *   `[ ]` `submitStageResponses` (lines 1989–2064): remove `stageDocumentResources` from destructure; delete `const resource = stageDocumentResources[serializedKey]`
        *   `[ ]` `submitStageResponses` edit path (lines 2004–2029): replace `if (!resource)` gate with `if (!content.resourceType)` gate; replace `resource.resource_type` with `content.resourceType`; `content.sourceContributionId` already used for `originalContributionIdToEdit` (line 2020)
        *   `[ ]` `submitStageResponses` feedback path (lines 2032–2063): delete `if (!resource) { continue; }` gate entirely; replace `resource.source_contribution_id` (line 2059) with `content.sourceContributionId`
    *   `[✅]` unit/`dialecticStore.documents.test.ts`
        *   `[✅]` Remove `expect(entry?.resource).toBe(null)` assertions (lines 3073, 3087)
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[ ]` integration/`dialecticStore.integration.test.ts`
        *   `[ ]` Remove all `stageDocumentResources` seeding from test state
        *   `[ ]` Update `saveContributionEdit` integration assertions to verify `stageDocumentContent[key].sourceContributionId` and `.resourceType` are updated from response
        *   `[ ]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[ ]` **Commit** `refactor(store): delete stageDocumentResources map and updateStageDocumentResource action; saveContributionEdit writes sourceContributionId and resourceType scalars onto stageDocumentContent entry`
        *   `[ ]` `stageDocumentResources` deleted from type, initial state, and all consumers
        *   `[ ]` `updateStageDocumentResource` action deleted from type, implementation, mock, and tests
        *   `[ ]` `resource: EditedDocumentResource | null` deleted from `StageDocumentContentState`
        *   `[ ]` `saveContributionEdit` writes two scalars to existing content entry
        *   `[ ]` `submitStageResponses` reads `content.sourceContributionId` and `content.resourceType` — no resource gates
        *   `[ ]` `EditedDocumentResource` type preserved (backend API contract; used by API client, backend handler, type guards, API tests)
        *   `[ ]` All three user actions (Save Edit, Save Feedback, Submit Responses) work independently from the moment a document loads

*   `[ ]` `[UI]` apps/web/src/components/dialectic/`GeneratedContributionCard.tsx` **Replace hardcoded resourceType with state-provided value; remove all stageDocumentResources references from UI layer**
    *   `[ ]` `dialecticStore.mock.ts` (apps/web/src/mocks)
        *   `[ ]` Remove `stageDocumentResources: {}` from mock initial state
        *   `[ ]` Remove `updateStageDocumentResource` mock action (lines 678–695)
        *   `[ ]` Remove all literal `resource:` fields from mock `StageDocumentContentState` entries
        *   `[ ]` Rewrite `saveContributionEdit` mock (lines 503–520): remove `stageDocumentResources[serializedKey] = resource`; write `documentEntry.sourceContributionId = resource.source_contribution_id; documentEntry.resourceType = resource.resource_type;` instead
    *   `[ ]` unit/`GeneratedContributionCard.test.tsx`
        *   `[ ]` Test: `handleSaveEdit` reads `resourceType` from `documentResourceState.resourceType` instead of hardcoded `"rendered_document"`
        *   `[ ]` Remove `updateStageDocumentResource` call in test (lines 835–863); replace with direct `stageDocumentContent` seeding that sets `sourceContributionId` and `resourceType`
        *   `[ ]` Remove all `stageDocumentResources` seeding from test state
        *   `[ ]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[ ]` integration/`GeneratedContributionCard.integration.test.tsx`
        *   `[ ]` Test: Save Edit after fetch uses `resourceType` from state (populated by fetch, not hardcoded)
        *   `[ ]` Remove all `stageDocumentResources` seeding from test state
        *   `[ ]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[ ]` `GeneratedContributionCard.tsx`
        *   `[ ]` Replace `resourceType: "rendered_document"` (line 380) with `resourceType: documentResourceState?.resourceType ?? ''`
    *   `[ ]` unit/`SessionContributionsDisplayCard.test.tsx`
        *   `[ ]` Remove all `stageDocumentResources` seeding from test state (collateral fix from type removal)
        *   `[ ]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[ ]` **Commit** `fix(ui): use state-provided resourceType from fetch response; remove all stageDocumentResources and updateStageDocumentResource references from UI layer`
        *   `[ ]` `GeneratedContributionCard` reads `resourceType` from store state populated on fetch
        *   `[ ]` `dialecticStore.mock.ts` aligned: no `stageDocumentResources`, no `updateStageDocumentResource`, `saveContributionEdit` mock writes scalars
        *   `[ ]` All UI test files cleared of deleted type fields

# ToDo
    - Regenerate individual specific documents on demand without regenerating inputs or other sibling documents 
    -- User reports that a single document failed and they liked the other documents, but had to regenerate the entire stage
    -- User requests option to only regenerate the exact document that failed
    -- Initial investigation shows this should be possible, all the deps are met, we just need a means to dispatch a job for only the exact document that errored or otherwise wasn't produced so that the user does't have to rerun the entire stage to get a single document
    -- Added bonus, this lets users "roll the dice" to get a different/better/alternative version of an existing document if they want to try again 
    -- FOR CONSIDERATION: This is a powerful feature but implies a branch in the work
    --- User generates stage, all succeeds
    --- User advances stages, decides they want to fix an oversight in a prior stage
    --- User regenerates a prior document
    --- Now subsequent documents derived from the original are invalid
    --- Is this a true branch/iteration, or do we highlight the downstream products so that those can be regenerated from the new input that was produced? 
    --- If we "only" highlight downstream products, all downstream products are invalid, because the header_context used to generate them would be invalid 
    --- PROPOSED: Implement regeneration prior to stage advancement, disable regeneration for documents who have downstream documents, set up future sprint for branching/iteration to support hints to regenerate downstream documents if a user regenerates upstream documents
    --- BLOCKER: Some stages are fundamentally dependent on all prior outputs, like synthesis, and the entire stage needs to be rerun if thesis/antithesis documents are regenerated

    - New user sign in banner doesn't display, throws console error  
    -- Chase, diagnose, fix 

    - Determine an index value for a full flow for 3 models and set that as the new user signup token deposit
    -- User reports their new sign up allocation was only enough to get 3/4 docs in thesis 
    -- Reasonable for a new user to want to complete an entire first project from their initial token allocation
    -- Not a dev task per se, but we need to run a few e2e multi-model flows and index the cost then set the new user sign up deposit close to that value
    -- This is not recurring, just a new user sign up 
    -- Dep: Will need to finally set up email validation so that users can't just create new accounts for each project 

   - Generating spinner stays present until page refresh 
   -- Needs to react to actual progress 
   -- Stop the spinner when a condition changes 

   -  Third stage doesn't seem to do anything 
   -- Attempting to generate stalls with no product 

   - Checklist does not correctly find documents when multiple agents are chosen 
   -- 

   - Steps that collect feedback need to look in the right location for it 