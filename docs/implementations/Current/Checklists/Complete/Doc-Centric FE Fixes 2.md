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

*   `[✅]` `[STORE]` packages/store/`dialecticStore.ts` **Remove stageDocumentResources map and updateStageDocumentResource action; all identity reads from stageDocumentContent scalars**
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
    *   `[✅]` `dialecticStore.ts`
        *   `[✅]` Remove `stageDocumentResources: {}` from initial state (line 192)
        *   `[✅]` Delete `updateStageDocumentResource` action entirely (lines 2288–2308)
        *   `[✅]` `saveContributionEdit` success path (lines 2251–2264): replace `state.stageDocumentResources[serializedKey] = resource` with `documentEntry.sourceContributionId = resource.source_contribution_id; documentEntry.resourceType = resource.resource_type;` (the `documentEntry` variable already exists from `ensureStageDocumentContent` call above)
        *   `[✅]` `submitStageResponses` (lines 1989–2064): remove `stageDocumentResources` from destructure; delete `const resource = stageDocumentResources[serializedKey]`
        *   `[✅]` `submitStageResponses` edit path (lines 2004–2029): replace `if (!resource)` gate with `if (!content.resourceType)` gate; replace `resource.resource_type` with `content.resourceType`; `content.sourceContributionId` already used for `originalContributionIdToEdit` (line 2020)
        *   `[✅]` `submitStageResponses` feedback path (lines 2032–2063): delete `if (!resource) { continue; }` gate entirely; replace `resource.source_contribution_id` (line 2059) with `content.sourceContributionId`
    *   `[✅]` unit/`dialecticStore.documents.test.ts`
        *   `[✅]` Remove `expect(entry?.resource).toBe(null)` assertions (lines 3073, 3087)
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[✅]` integration/`dialecticStore.integration.test.ts`
        *   `[✅]` Remove all `stageDocumentResources` seeding from test state
        *   `[✅]` Update `saveContributionEdit` integration assertions to verify `stageDocumentContent[key].sourceContributionId` and `.resourceType` are updated from response
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[✅]` **Commit** `refactor(store): delete stageDocumentResources map and updateStageDocumentResource action; saveContributionEdit writes sourceContributionId and resourceType scalars onto stageDocumentContent entry`
        *   `[✅]` `stageDocumentResources` deleted from type, initial state, and all consumers
        *   `[✅]` `updateStageDocumentResource` action deleted from type, implementation, mock, and tests
        *   `[✅]` `resource: EditedDocumentResource | null` deleted from `StageDocumentContentState`
        *   `[✅]` `saveContributionEdit` writes two scalars to existing content entry
        *   `[✅]` `submitStageResponses` reads `content.sourceContributionId` and `content.resourceType` — no resource gates
        *   `[✅]` `EditedDocumentResource` type preserved (backend API contract; used by API client, backend handler, type guards, API tests)
        *   `[✅]` All three user actions (Save Edit, Save Feedback, Submit Responses) work independently from the moment a document loads

*   `[✅]` `[UI]` apps/web/src/components/dialectic/`GeneratedContributionCard.tsx` **Replace hardcoded resourceType with state-provided value; remove all stageDocumentResources references from UI layer**
    *   `[✅]` `dialecticStore.mock.ts` (apps/web/src/mocks)
        *   `[✅]` Remove `stageDocumentResources: {}` from mock initial state
        *   `[✅]` Remove `updateStageDocumentResource` mock action (lines 678–695)
        *   `[✅]` Remove all literal `resource:` fields from mock `StageDocumentContentState` entries
        *   `[✅]` Rewrite `saveContributionEdit` mock (lines 503–520): remove `stageDocumentResources[serializedKey] = resource`; write `documentEntry.sourceContributionId = resource.source_contribution_id; documentEntry.resourceType = resource.resource_type;` instead
    *   `[✅]` unit/`GeneratedContributionCard.test.tsx`
        *   `[✅]` Test: `handleSaveEdit` reads `resourceType` from `documentResourceState.resourceType` instead of hardcoded `"rendered_document"`
        *   `[✅]` Remove `updateStageDocumentResource` call in test (lines 835–863); replace with direct `stageDocumentContent` seeding that sets `sourceContributionId` and `resourceType`
        *   `[✅]` Remove all `stageDocumentResources` seeding from test state
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[✅]` integration/`GeneratedContributionCard.integration.test.tsx`
        *   `[✅]` Test: Save Edit after fetch uses `resourceType` from state (populated by fetch, not hardcoded)
        *   `[✅]` Remove all `stageDocumentResources` seeding from test state
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[✅]` `GeneratedContributionCard.tsx`
        *   `[✅]` Replace `resourceType: "rendered_document"` (line 380) with `resourceType: documentResourceState?.resourceType ?? ''`
    *   `[✅]` unit/`SessionContributionsDisplayCard.test.tsx`
        *   `[✅]` Remove all `stageDocumentResources` seeding from test state (collateral fix from type removal)
        *   `[✅]` Remove all literal `resource:` fields from `StageDocumentContentState` constructions
    *   `[✅]` **Commit** `fix(ui): use state-provided resourceType from fetch response; remove all stageDocumentResources and updateStageDocumentResource references from UI layer`
        *   `[✅]` `GeneratedContributionCard` reads `resourceType` from store state populated on fetch
        *   `[✅]` `dialecticStore.mock.ts` aligned: no `stageDocumentResources`, no `updateStageDocumentResource`, `saveContributionEdit` mock writes scalars
        *   `[✅]` All UI test files cleared of deleted type fields

*   `[✅]` [BE] supabase/functions/dialectic-service/getAllStageProgress.ts **Fix progress tracking to handle all job types and report actual job results**
    *   `[✅]` `objective.md`
        *   `[✅]` **Functional Requirements:**
        *   `[✅]` Load the complete recipe for each stage to know what steps exist (both cloned instances and template-based)
        *   `[✅]` Query ALL jobs for the session/iteration without filtering or skipping any based on payload shape
        *   `[✅]` Classify each job by its `job_type` column value (PLAN, EXECUTE, RENDER) using `isJobTypeEnum()` type guard
        *   `[✅]` Match jobs to recipe steps where `planner_metadata.recipe_step_id` exists and is valid
        *   `[✅]` Handle jobs without `planner_metadata` (root PLAN jobs, RENDER jobs) as standalone job entries
        *   `[✅]` Group continuation jobs with their parent via `parent_job_id` when calculating step progress
        *   `[✅]` Report RENDER jobs separately since they are the only jobs that produce rendered documents
        *   `[✅]` Use each job's `results` field to determine what it actually produced (not payload promises)
        *   `[✅]` Derive step-level and stage-level status from aggregated job statuses
        *   `[✅]` For EXECUTE jobs in per-model steps, provide per-model breakdown via `modelJobStatuses`
        *   `[✅]` Return `StageProgressEntry[]` with complete `jobProgress: StepJobProgress` tracking per step
        *   `[✅]` **Non-Functional Requirements:**
        *   `[✅]` Must not return 500 errors when encountering root PLAN jobs or RENDER jobs
        *   `[✅]` Must not skip or ignore any job that exists in `dialectic_generation_jobs`
        *   `[✅]` Must handle both cloned recipe instances and template-based instances correctly
        *   `[✅]` Must use existing type guards (`isJobTypeEnum`, `isJobProgressEntry`, `isPlannerMetadata`, `isRecord`)
        *   `[✅]` Must preserve all existing function signatures and return types
        *   `[✅]` Must not create new progress tracking layers - fixes the existing one
        *   `[✅]` Performance: minimize database queries by batching lookups
    *   `[✅]` `role.md`
        *   `[✅]` **Domain:** Backend data aggregation service
        *   `[✅]` **Architectural Role:** Adapter layer between database and API response
        *   `[✅]` **Responsibility:** Transform raw job + resource data into structured progress DTOs for frontend consumption
    *   `[✅]` `module.md`
        *   `[✅]` **Context Boundaries:**
        *   `[✅]` Reads from: `dialectic_generation_jobs`, `dialectic_project_resources`, `dialectic_stage_recipe_steps`, `dialectic_recipe_template_steps`, `dialectic_stage_recipe_instances`
        *   `[✅]` Outputs: `GetAllStageProgressResponse` (array of `StageProgressEntry`)
        *   `[✅]` Does NOT: create/update/delete any data; run jobs; interpret business logic beyond aggregation
        *   `[✅]` **Feature Boundaries:**
        *   `[✅]` In scope: aggregate job statuses, map jobs to steps, derive stage/step statuses, populate `StepJobProgress`
        *   `[✅]` Out of scope: job execution, recipe planning, document rendering, progress notifications
    *   `[✅]` `deps.md`
        *   `[✅]` **Internal Dependencies:**
        *   `[✅]` Type guards: `isJobTypeEnum`, `isJobProgressEntry`, `isPlannerMetadata`, `isRecord` from `type_guards.dialectic.ts`
            *   `[✅]` Utility: `deconstructStoragePath` from `path_deconstructor.ts`
            *   `[✅]` Types: `JobProgressEntry`, `StepJobProgress`, `StageProgressEntry`, `GetAllStageProgressResponse`, `JobProgressStatus`, `UnifiedStageStatus`, `StageDocumentDescriptorDto`, `StageRunDocumentStatus` from `dialectic.interface.ts`
            *   `[✅]` Database types: `Database`, `Tables` from `types_db.ts`
                *   `[✅]` **External Dependencies:**
                *   `[✅]` Supabase client for database queries
                *   `[✅]` User auth context for authorization
        *   `[✅]` interface/`dialectic.interface.ts`
        *   `[✅]` **No interface changes required** - existing types (`JobProgressEntry`, `StepJobProgress`, `StageProgressEntry`, etc.) already support the required data structure
        *   `[✅]` unit/`getAllStageProgress.test.ts`
        *   `[✅]` **[RED TEST]** Create comprehensive unit test file for `getAllStageProgress`
        *   `[✅]` **Test 1: Handles root PLAN jobs without planner_metadata**
            *   Given: A job with `job_type: 'PLAN'`, no `planner_metadata.recipe_step_id`
            *   When: `getAllStageProgress` is called
            *   Then: Function completes without 500 error, job is reported in results
        *   `[✅]` **Test 2: Handles RENDER jobs with different payload shape**
            *   Given: A job with `job_type: 'RENDER'`, payload has `documentKey`, `sourceContributionId` but NO `planner_metadata`
            *   When: `getAllStageProgress` is called
            *   Then: Function completes without 500 error, RENDER job is reported separately
        *   `[✅]` **Test 3: Matches EXECUTE jobs to steps via planner_metadata.recipe_step_id**
            *   Given: EXECUTE jobs with valid `planner_metadata.recipe_step_id` matching recipe steps
            *   When: Function processes jobs
            *   Then: Jobs are correctly grouped under their step_key in `jobProgress`
        *   `[✅]` **Test 4: Works with both cloned instances and template-based recipes**
            *   Given: Recipe instance with `is_cloned: true` → looks up from `dialectic_stage_recipe_steps`
            *   Given: Recipe instance with `is_cloned: false` → looks up from `dialectic_recipe_template_steps`
            *   When: Function loads recipe steps
            *   Then: Both paths return valid step_key mappings
        *   `[✅]` **Test 5: Aggregates per-model status for EXECUTE jobs**
            *   Given: Multiple EXECUTE jobs with same step_key but different `payload.model_id`
            *   When: Function builds `jobProgress[stepKey]`
            *   Then: `modelJobStatuses` object contains per-model breakdown
        *   `[✅]` **Test 6: Uses job_type column, not payload inference**
            *   Given: Jobs with `job_type` column set to PLAN/EXECUTE/RENDER
            *   When: Function classifies jobs
            *   Then: Uses `job_type` column directly via `isJobTypeEnum()` guard
        *   `[✅]` **Test 7: Does not skip jobs with missing payload fields**
            *   Given: Jobs without `payload.document_key` or `payload.model_id`
            *   When: Function processes all jobs
            *   Then: All jobs are counted in their respective categories (not silently skipped)
        *   `[✅]` **Test 8: Continuation jobs group with parent under same step**
            *   Given: Original EXECUTE job + continuation jobs with same `parent_job_id` and `recipe_step_id`
            *   When: Function aggregates by step_key
            *   Then: All continuations counted together in same step's progress
        *   `[✅]` **Test 9: Derives correct step status from heterogeneous job statuses**
            *   Given: Step has jobs in mixed states (pending, in_progress, completed, failed)
            *   When: Function derives step status via `deriveStepStatus()`
            *   Then: Returns 'failed' if any failed, 'in_progress' if any in_progress/retrying, 'completed' if all completed
        *   `[✅]` **Test 10: Reports documents array from RENDER jobs, not EXECUTE jobs**
            *   Given: EXECUTE jobs that triggered RENDER jobs
            *   When: Function populates `documents` array
            *   Then: Uses RENDER job metadata (documentKey, sourceContributionId) to build StageDocumentDescriptorDto entries
    *   `[✅]` `getAllStageProgress.ts`
        *   `[✅]` **Implementation Requirements:**
        *   `[✅]` **Step 1: Load recipe definition**
            *   Query `dialectic_stage_recipe_instances` to get `is_cloned` and `template_id`
            *   If `is_cloned: true`, load from `dialectic_stage_recipe_steps` where `instance_id = instance.id`
            *   If `is_cloned: false`, load from `dialectic_recipe_template_steps` where `template_id = instance.template_id`
            *   Build `Map<recipeStepId, stepKey>` for all recipe steps in this stage
        *   `[✅]` **Step 2: Query ALL jobs without payload filtering**
            *   Query `dialectic_generation_jobs.select('id, status, payload, stage_slug, job_type, parent_job_id, results')`
            *   Do NOT filter by payload shape at query time
            *   Keep all jobs for classification
        *   `[✅]` **Step 3: Classify jobs by job_type column**
            *   For each job, validate `job.job_type` using `isJobTypeEnum(job.job_type)`
            *   Return 500 error only if `job_type` is null or invalid (database integrity issue)
            *   Separate into PLAN jobs, EXECUTE jobs, RENDER jobs by `job_type` value
        *   `[✅]` **Step 4: Extract planner_metadata where present**
            *   Check if `isRecord(job.payload)` and `isPlannerMetadata(job.payload.planner_metadata)`
            *   If yes, extract `recipe_step_id` and look up `step_key` from Map
            *   If no `planner_metadata` (root PLAN, RENDER), classify as "no step association"
        *   `[✅]` **Step 5: Build step-level progress tracking**
            *   For jobs WITH step_key: aggregate by step_key into `StepJobProgress[step_key]`
            *   Count totalJobs, completedJobs, inProgressJobs, failedJobs per step
            *   For EXECUTE jobs: also track per-model status via `payload.model_id` → `modelJobStatuses[modelId]`
        *   `[✅]` **Step 6: Handle jobs without step association**
            *   Root PLAN jobs: report as separate tracking category (e.g., step_key = 'root_orchestration')
            *   RENDER jobs: report as separate tracking category (e.g., step_key = 'document_rendering')
            *   Both contribute to overall stage progress but don't map to a recipe step
        *   `[✅]` **Step 7: Build documents array from RENDER jobs**
            *   Query `dialectic_project_resources` where `resource_type = 'rendered_document'`
            *   For each RENDER job, extract: `payload.documentKey`, `payload.sourceContributionId`, `results.pathContext`
            *   Match RENDER job to its source EXECUTE job via `sourceContributionId` to get `modelId`
            *   Construct `StageDocumentDescriptorDto`: { documentKey, modelId, jobId, status, latestRenderedResourceId, stepKey }
        *   `[✅]` **Step 8: Derive statuses**
            *   Per step: `deriveStepStatus(jobStatuses)` from all jobs in that step
            *   Overall stage: `deriveStageStatus(allJobStatuses)` from all jobs in stage
        *   `[✅]` **Step 9: Validate and return**
            *   Validate each `JobProgressEntry` with `isJobProgressEntry()` before adding to result
            *   Return 500 only if validation fails (indicates logic bug)
            *   Return `{ status: 200, data: GetAllStageProgressResponse }`
    *   `[✅]` integration/`getAllStageProgress.integration.test.ts`
        *   `[✅]` **[TEST-INT]** Integration test with real database
        *   `[✅]` **Integration Test 1: Full thesis stage with root PLAN + EXECUTE + RENDER jobs**
            *   Setup: Create session, run thesis stage through full DAG (similar to existing full_dag_traversal test)
            *   Verify: `getAllStageProgress` returns complete progress including root PLAN job, all EXECUTE jobs, all RENDER jobs
        *   `[✅]` **Integration Test 2: Synthesis stage with pairwise EXECUTE jobs**
            *   Setup: Run synthesis stage with n=3 models (produces n³ pairwise jobs)
            *   Verify: All pairwise jobs tracked, step_key correctly maps to recipe steps
        *   `[✅]` **Integration Test 3: Cloned vs template recipe instances**
            *   Setup: Create two sessions, one with cloned recipe, one with template recipe
            *   Verify: Both return correct `step_key` mappings and progress
    *   `[✅]` `requirements.md`
        *   `[✅]` **Acceptance Criteria:**
        *   `[✅]` Function does NOT return 500 error when encountering root PLAN jobs
        *   `[✅]` Function does NOT return 500 error when encountering RENDER jobs
        *   `[✅]` Function does NOT skip any jobs from the query results
        *   `[✅]` Function uses `job_type` column directly for classification
        *   `[✅]` Function correctly handles both cloned and template-based recipes
        *   `[✅]` Function reports RENDER jobs in progress tracking (they produce the actual documents)
        *   `[✅]` Function validates job progress entries with `isJobProgressEntry()` before returning
        *   `[✅]` All existing integration tests continue to pass (especially `dialectic_full_dag_traversal.integration.test.ts`)
    *   `[✅]` **[COMMIT]** `fix(be): getAllStageProgress correctly tracks PLAN/EXECUTE/RENDER jobs across all recipe types`
        *   `[✅]` Fixed classification to use job_type column instead of inferring from payload
        *   `[✅]` Added support for root PLAN jobs without planner_metadata
        *   `[✅]` Added support for RENDER jobs with different payload structure
        *   `[✅]` Fixed recipe step lookup to handle both cloned instances and template-based instances
        *   `[✅]` Fixed documents array to report RENDER jobs (actual document producers)
        *   `[✅]` Fixed step-level progress to include all job types, not just EXECUTE
        *   `[✅]` Added validation using existing type guards (isJobTypeEnum, isJobProgressEntry)
        *   `[✅]` Tests: comprehensive unit tests + integration tests for full DAG traversal

*   `[✅]`   [DB] supabase/migrations/`20260211040003_feedback_per_document.sql` **Enforce per-document feedback uniqueness via unique index**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Drop the existing stage-level unique constraint `unique_session_stage_iteration_feedback` (too coarse — prevents multiple documents from having feedback within the same stage+iteration)
        *   `[✅]`   Create a partial unique index on `(session_id, project_id, stage_slug, iteration_number, resource_description->>'document_key', resource_description->>'model_id')` to enforce one shared feedback row per logical document (last writer wins; no per-user feedback)
        *   `[✅]`   Index only applies when both `document_key` and `model_id` are non-null in `resource_description` JSONB
        *   `[✅]`   `user_id` is intentionally excluded from the index because feedback is shared per logical document across a project/session/stage/iteration/model/docKey; storage path rules for user_feedback are deterministic and cannot be user-scoped
    *   `[✅]`   `role.md`
        *   `[✅]`   Infrastructure/schema — database constraint guaranteeing data integrity at the storage layer
        *   `[✅]`   Safety net preventing duplicate feedback rows regardless of application-level bugs
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: PostgreSQL schema DDL applied via Supabase migration
        *   `[✅]`   Affects: `dialectic_feedback` table constraint set
    *   `[✅]`   `deps.md`
        *   `[✅]`   Existing `dialectic_feedback` table (from migrations `20250613010842` + `20250621155452`)
        *   `[✅]`   Existing `resource_description` JSONB column (added in `20250621155452`)
        *   `[✅]`   Existing `unique_session_stage_iteration_feedback` constraint (to be dropped)
    *   `[✅]`   `20260211040003_feedback_per_document.sql`
        *   `[✅]`   `ALTER TABLE public.dialectic_feedback DROP CONSTRAINT IF EXISTS unique_session_stage_iteration_feedback;`
        *   `[✅]`   `CREATE UNIQUE INDEX IF NOT EXISTS idx_dialectic_feedback_unique_document_model` on the 6-column expression index with partial WHERE clause
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Old stage-level constraint must be dropped before new index is created
        *   `[✅]`   No legacy data concerns — unreleased MVP, no deduplication step required
        *   `[✅]`   Exempt from TDD (schema-only change per Instructions for Agent §2)

*   `[✅]`   [BE] supabase/functions/_shared/services/`file_manager.ts` **Implement feedback upsert: user_feedback must update-or-insert exactly one row per logical document**
    *   `[✅]`   `objective.md`
        *   `[✅]`   In the `isUserFeedbackContext` branch, replace blind INSERT with an update-or-insert flow scoped to the logical doc key: (session_id, project_id, stage_slug, iteration_number, `resource_description->>'document_key'`, `resource_description->>'model_id'`)
        *   `[✅]`   If an existing feedback row exists for that logical doc key, UPDATE that row (do not INSERT a second row)
        *   `[✅]`   If no existing feedback row exists for that logical doc key, INSERT a new row
        *   `[✅]`   Storage object must always be written via FileManager using existing path rules: `(originalBaseName)_feedback` under `originalStoragePath` (no path construction changes)
        *   `[✅]`   If multiple rows are returned for the logical doc lookup, treat it as a data integrity violation (unique index should prevent this once applied)
    *   `[✅]`   `role.md`
        *   `[✅]`   FileManager service — the single allowed writer for storage + database registration
        *   `[✅]`   Ensures idempotent saves: submitting feedback for the same logical document always updates the same DB row and storage object (shared feedback; last writer wins)
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: FileManagerService.uploadAndRegisterFile(user_feedback) → Supabase Storage upload → dialectic_feedback update/insert
        *   `[✅]`   Input: `UserFeedbackUploadContext` (existing type, unchanged)
        *   `[✅]`   Output: `FileManagerResponse` returning the `dialectic_feedback` row (existing behavior, but now idempotent)
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 1 migration (unique index must be in place as safety net)
        *   `[✅]`   `SupabaseClient<Database>` for DB query + update/insert inside FileManagerService (existing)
        *   `[✅]`   `dialectic_feedback` table with `resource_description` JSONB column
    *   `[✅]`   unit/`file_manager.upload.test.ts` (or equivalent existing FileManager test file)
        *   `[✅]`   Add test: user_feedback with existing logical doc row updates that row (no second insert)
        *   `[✅]`   Add test: user_feedback with no existing logical doc row inserts a new row
        *   `[✅]`   Add test: logical doc lookup filters by `(session_id, project_id, stage_slug, iteration_number, resource_description->>'document_key', resource_description->>'model_id')`
        *   `[✅]`   Add test: storage upload uses existing deterministic user_feedback path rules (no changes to `constructStoragePath`)
    *   `[✅]`   `file_manager.ts`
        *   `[✅]`   In `isUserFeedbackContext`, before insert/update, query `dialectic_feedback` for an existing row matching the logical doc key (same filters as the unique index)
        *   `[✅]`   If existing row found, UPDATE by `id`; else INSERT
        *   `[✅]`   Add logging to distinguish update vs insert for observability

*   `[✅]`   [BE] supabase/functions/dialectic-service/`submitStageDocumentFeedback.ts` **Remove direct DB/storage writes: validate + resolve original placement + delegate to FileManager only**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Remove any direct writes to `dialectic_feedback` and any direct bucket writes from the handler
        *   `[✅]`   Handler must only: validate payload, deterministically select the latest rendered_document resource for `sourceContributionId` to derive `originalStoragePath` + `originalBaseName`, then call `fileManager.uploadAndRegisterFile(...)` and return its record
        *   `[✅]`   Keep existing path and filename construction rules: user_feedback is always written as `(originalBaseName)_feedback` under `originalStoragePath` via FileManager
    *   `[✅]`   unit/`submitStageDocumentFeedback.test.ts`
        *   `[✅]`   Update tests to assert the handler delegates to `fileManager.uploadAndRegisterFile` and does not perform direct `dialectic_feedback` insert/update queries
    *   `[✅]`   `submitStageDocumentFeedback.ts`
        *   `[✅]`   Remove all direct `dbClient.from('dialectic_feedback')...` insert/update logic; the handler must not write feedback rows directly (FileManager is the only allowed writer)
        *   `[✅]`   Ensure the handler returns the `dialectic_feedback` row returned by `fileManager.uploadAndRegisterFile(...)` (and surfaces its error without swallowing/rewrapping DB errors)
        *   `[✅]`   Keep the deterministic “latest rendered_document wins” selection for deriving `originalStoragePath` + `originalBaseName` from `dialectic_project_resources` when `sourceContributionId` is present

*   `[✅]`   [BE] supabase/functions/dialectic-service/`getStageDocumentFeedback.ts` **New handler: fetch saved feedback content for a logical document**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Query `dialectic_feedback` by logical doc key (session_id, stage_slug, iteration_number, `resource_description->>'document_key'`, `resource_description->>'model_id'`)
        *   `[✅]`   Download feedback content from Supabase Storage using the row's `storage_bucket`/`storage_path`/`file_name`
        *   `[✅]`   Return the feedback record with text content so the UI can prepopulate the feedback pane
        *   `[✅]`   Return an empty array when no feedback exists for the logical doc (preserve `StageDocumentFeedback[]` shape)
    *   `[✅]`   `role.md`
        *   `[✅]`   Backend service function — read endpoint for previously saved user feedback
        *   `[✅]`   Provides the single source of truth for "what feedback has been submitted for this document"
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: dialectic-service edge function → dialectic_feedback query → storage download → response
        *   `[✅]`   Input: `GetStageDocumentFeedbackPayload` (sessionId, stageSlug, iterationNumber, modelId, documentKey)
        *   `[✅]`   Output: `DialecticServiceResponse<StageDocumentFeedback[]>` (0 or 1 item; preserve existing frontend contract)
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 1 migration (unique index guarantees at most one matching row)
        *   `[✅]`   `SupabaseClient<Database>` for DB query and storage download
        *   `[✅]`   `dialectic_feedback` table with `resource_description` JSONB column
        *   `[✅]`   Supabase Storage (bucket: `dialectic-contributions`)
        *   `[✅]`   `ILogger` for logging
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   Add `GetStageDocumentFeedbackPayload` type: `{ sessionId: string; stageSlug: string; iterationNumber: number; modelId: string; documentKey: string }`
        *   `[✅]`   Add `GetStageDocumentFeedbackAction` to the `DialecticServiceAction` union: `{ action: 'getStageDocumentFeedback'; payload: GetStageDocumentFeedbackPayload }`
        *   `[✅]`   Add `GetStageDocumentFeedbackResponse` type: `StageDocumentFeedback[]` (0 or 1 item; preserve existing frontend contract)
    *   `[✅]`   unit/`getStageDocumentFeedback.test.ts`
        *   `[✅]`   Test: returns feedback record with content when feedback exists for the logical doc key
        *   `[✅]`   Test: returns empty array when no feedback exists for the logical doc key
        *   `[✅]`   Test: queries by `session_id` AND `stage_slug` AND `iteration_number` AND `resource_description->>'document_key'` AND `resource_description->>'model_id'`
        *   `[✅]`   Test: downloads content from correct `storage_bucket`/`storage_path`/`file_name` path
        *   `[✅]`   Test: returns error when DB query fails
        *   `[✅]`   Test: returns error when storage download fails
        *   `[✅]`   Test: validates required payload fields (returns error if any missing)
    *   `[✅]`   `getStageDocumentFeedback.ts`
        *   `[✅]`   Export `getStageDocumentFeedback(payload, dbClient, deps)` with typed signature
        *   `[✅]`   Validate required payload fields: sessionId, stageSlug, iterationNumber, modelId, documentKey
        *   `[✅]`   Query `dialectic_feedback` with eq filters on `session_id`, `stage_slug`, `iteration_number` and textual eq on JSONB-extracted `document_key` and `model_id`
        *   `[✅]`   Use `.maybeSingle()` to gracefully handle zero or one result
        *   `[✅]`   If no row found, return `{ data: [] }`
        *   `[✅]`   If row found, download content from storage using `storage_bucket`, `storage_path`, `file_name`
        *   `[✅]`   Decode downloaded bytes via `TextDecoder` and return `{ data: [{ id, content, createdAt }] }`
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Returns at most one feedback record per logical doc (guaranteed by unique index)
        *   `[✅]`   Content is fetched from Supabase Storage, not from the DB row (DB has no content column)
        *   `[✅]`   Graceful not-found handling: returns empty array, not error, when no feedback exists
        *   `[✅]`   Authenticated endpoint: user must have valid JWT

*   `[✅]`   [BE] supabase/functions/dialectic-service/`index.ts` **Wire getStageDocumentFeedback handler into the service router**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Import `getStageDocumentFeedback` handler and its deps type from `./getStageDocumentFeedback.ts`
        *   `[✅]`   Add `getStageDocumentFeedback` to the `Handlers` interface
        *   `[✅]`   Add `'getStageDocumentFeedback'` to the authenticated actions array
        *   `[✅]`   Add a `case "getStageDocumentFeedback":` to the switch statement
        *   `[✅]`   Add to default handlers export
    *   `[✅]`   `role.md`
        *   `[✅]`   Edge function router — dispatches incoming requests to the correct handler based on `action` field
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: HTTP request → action routing → handler delegation → HTTP response
        *   `[✅]`   Follows the established pattern from `submitStageDocumentFeedback` and other handlers
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 3: `getStageDocumentFeedback.ts` handler (must exist before wiring)
        *   `[✅]`   `dialectic.interface.ts` with the new `GetStageDocumentFeedbackAction` type (added in node 3)
        *   `[✅]`   Existing router structure, authenticated actions array, and default handlers export
    *   `[✅]`   unit/`index.test.ts`
        *   `[✅]`   Add `getStageDocumentFeedback` to `createMockHandlers` factory (following pattern of `submitStageDocumentFeedback` mock at line 140)
        *   `[✅]`   Add test: `handleRequest - getStageDocumentFeedback should call handler and return 200 on success`
        *   `[✅]`   Add test: `handleRequest - getStageDocumentFeedback should return error on handler failure`
    *   `[✅]`   `index.ts`
        *   `[✅]`   Import `getStageDocumentFeedback` and its deps type (near line 78)
        *   `[✅]`   Add to `Handlers` interface type (near line 188)
        *   `[✅]`   Add `'getStageDocumentFeedback'` to authenticated actions array (near line 264-266)
        *   `[✅]`   Add `case "getStageDocumentFeedback":` to the switch with payload extraction, deps construction, handler call, and response handling (near line 556)
        *   `[✅]`   Add to default handlers export (near line 624-626)
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Route must be in the authenticated actions list (requires valid JWT)
        *   `[✅]`   Response format: `{ data: GetStageDocumentFeedbackResponse }` or `{ error: { message: string } }`
        *   `[✅]`   Must follow the identical routing pattern as `submitStageDocumentFeedback`

*   `[✅]`   [BE] supabase/functions/_shared/prompt-assembler/`gatherInputsForStage.ts` **Fix nondeterministic feedback selection: add ordering, document_key filter, correct iteration value, and model_id scoping**
    *   `[✅]`   `objective.md` (Sprint 1 — deterministic selection, document_key filter, iteration fix)
        *   `[✅]`   Add `.order('created_at', { ascending: false })` before `.limit(1)` (line 260) to guarantee deterministic selection of the most recent feedback
        *   `[✅]`   Add filter on `resource_description->>'document_key'` using `rule.document_key` when available (currently the feedback branch at lines 251–261 ignores `rule.document_key` even though other branches use it)
        *   `[✅]`   Replace `.single()` with `.maybeSingle()` to prevent throwing when zero rows match for optional feedback rules
        *   `[✅]`   Fix iteration bug: remove the `iterationNumber - 1` adjustment at line 252 (`const targetIteration = iterationNumber > 1 ? iterationNumber - 1 : 1`); use `iterationNumber` directly to match `submitStageDocumentFeedback` (which saves with `iterationNumber`) and `executeModelCallAndSave.gatherArtifacts` (which queries with `iterationNumber`)
    *   `[✅]`   `objective.md` (Sprint 2 — model_id scoping)
        *   `[✅]`   Add optional 7th parameter `modelId?: string` to `gatherInputsForStage` function signature (line 28)
        *   `[✅]`   Update `GatherInputsForStageFn` type (line 16, same file) to include optional 7th param `modelId?: string`
        *   `[✅]`   When `modelId` is provided: add `.filter('resource_description->>model_id', 'eq', modelId)` to the feedback query in the `rule.type === "feedback"` branch — selects only the feedback that annotates the specified model's output; keep `.limit(1).maybeSingle()` for single-record return
        *   `[✅]`   When `modelId` is absent (seed prompt assembly path, no job context): replace `.limit(1).maybeSingle()` with a multi-row query; loop over results, download each, push each to `gatheredContext.sourceDocuments` — the seed prompt needs visibility into all models' feedback
        *   `[✅]`   Downstream handling must process multiple feedback rows when `modelId` is absent (loop, download each, push each to `gatheredContext.sourceDocuments`)
        *   `[✅]`   This mirrors the pattern already used by `findSourceDocuments` `header_context` case (line 346) and `getStageDocumentFeedback` which both filter by `model_id`
    *   `[✅]`   `role.md`
        *   `[✅]`   Prompt assembler — gathers context inputs (documents + feedback) for stage processing
        *   `[✅]`   Must deterministically select the correct feedback for a given document when constructing prompts
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: DB query → storage download → gathered context output
        *   `[✅]`   Feedback type handling within the `rule.type === "feedback"` branch (lines 251–299)
        *   `[✅]`   `InputRule` type already has `document_key?: FileType` field (defined in `dialectic.interface.ts` line 1471)
        *   `[✅]`   `GatherInputsForStageFn` type definition (line 16, same file) — must gain optional 7th param
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 1 migration (unique index ensures at most one row per logical doc)
        *   `[✅]`   `SupabaseClient<Database>` for DB query
        *   `[✅]`   `downloadFromStorageFn` for content retrieval
        *   `[✅]`   `dialectic_feedback` table with `resource_description` JSONB column
        *   `[✅]`   `InputRule` type with `document_key` and `slug` fields
    *   `[✅]`   interface/`gatherInputsForStage.ts` (type definition at line 16)
        *   `[✅]`   Add `modelId?: string` as optional 7th param to `GatherInputsForStageFn` type
    *   `[✅]`   unit/`gatherInputsForStage.test.ts` (Sprint 1)
        *   `[✅]`   Add test: feedback query includes `.order('created_at', { ascending: false })` for deterministic selection
        *   `[✅]`   Add test: feedback query filters by `resource_description->>'document_key'` when `rule.document_key` is present
        *   `[✅]`   Add test: feedback query uses `iterationNumber` directly (not `iterationNumber - 1`)
        *   `[✅]`   Add test: no error thrown when zero feedback rows match for an optional feedback rule
        *   `[✅]`   Add test: feedback is correctly selected when `rule.document_key` is present and multiple feedback rows exist for different documents
        *   `[✅]`   Update existing feedback tests if query structure changes affect mock expectations
    *   `[✅]`   unit/`gatherInputsForStage.test.ts` (Sprint 2 — model_id scoping)
        *   `[✅]`   Add test: when `modelId` is provided, feedback query includes `.filter('resource_description->>model_id', 'eq', modelId)`
        *   `[✅]`   Add test: when `modelId` is provided and two models have feedback for the same document_key, only the specified model's feedback is returned
        *   `[✅]`   Add test: when `modelId` is absent, all feedback rows for the document_key are returned (no `.limit(1)`) and all are downloaded and pushed to `sourceDocuments`
        *   `[✅]`   Update existing feedback tests if signature or query structure changes affect mock expectations
    *   `[✅]`   `gatherInputsForStage.ts` (Sprint 1)
        *   `[✅]`   Remove `const targetIteration = iterationNumber > 1 ? iterationNumber - 1 : 1;` at line 252; use `iterationNumber` directly in the `.eq('iteration_number', iterationNumber)` call
        *   `[✅]`   Add `.order('created_at', { ascending: false })` to the query chain before `.limit(1)`
        *   `[✅]`   Conditionally add `.eq('resource_description->>document_key', rule.document_key)` when `rule.document_key` is defined
        *   `[✅]`   Replace `.single()` (line 261) with `.maybeSingle()` to avoid throwing on zero results
        *   `[✅]`   Adjust error handling: when `.maybeSingle()` returns null and `rule.required !== false`, set `criticalError`; when optional, `continue`
        *   `[✅]`   Preserve existing logging and download behavior for the matched row
    *   `[✅]`   `gatherInputsForStage.ts` (Sprint 2 — model_id scoping)
        *   `[✅]`   Add optional 7th parameter `modelId?: string` to function signature (line 28)
        *   `[✅]`   Update `GatherInputsForStageFn` type (line 16) to include optional 7th param `modelId?: string`
        *   `[✅]`   In the `rule.type === "feedback"` branch: when `modelId` is provided, add `.filter('resource_description->>model_id', 'eq', modelId)` to the query and keep `.limit(1).maybeSingle()`
        *   `[✅]`   When `modelId` is absent: replace `.limit(1).maybeSingle()` with a multi-row query; loop over results, download each, push each to `gatheredContext.sourceDocuments`
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Feedback selection must be deterministic: same inputs → same output every time
        *   `[✅]`   Filter by `document_key` from the rule to prevent cross-document feedback contamination
        *   `[✅]`   Iteration value must match the value used by `submitStageDocumentFeedback` and `executeModelCallAndSave.gatherArtifacts` — all use `iterationNumber` directly
        *   `[✅]`   No runtime exceptions when zero feedback rows exist for optional rules
        *   `[✅]`   When executing per-model jobs, feedback must be scoped to the executing model's `model_id` via `resource_description->>'model_id'` — prevents cross-model feedback contamination
        *   `[✅]`   When assembling seed prompts (no model context), all feedback for the document_key must be returned so the seed prompt has visibility into all models' perspectives
        *   `[✅]`   Optional parameter is additive and backward-compatible; existing callers that omit `modelId` continue to work unchanged

*   `[✅]`   [BE] supabase/functions/_shared/prompt-assembler/`gatherContext.ts` **Thread modelId through to gatherInputsForStageFn**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Add optional 9th parameter `modelId?: string` to `gatherContext` function signature
        *   `[✅]`   Update `GatherContextFn` type (line 14, same file) to include optional 9th param `modelId?: string`
        *   `[✅]`   Forward `modelId` as 7th argument to `gatherInputsForStageFn(...)` call (line 42)
    *   `[✅]`   `role.md`
        *   `[✅]`   Prompt assembler context aggregator — accepts model context from caller and forwards to input gatherer
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: caller (assembleTurnPrompt or PromptAssembler) → gatherContext → gatherInputsForStageFn
        *   `[✅]`   `GatherContextFn` type definition (line 14, same file)
    *   `[✅]`   `deps.md`
        *   `[✅]`   `GatherInputsForStageFn` with optional 7th param `modelId?: string` (from prior node)
        *   `[✅]`   All existing deps unchanged
    *   `[✅]`   interface/`gatherContext.ts` (type definition at line 14)
        *   `[✅]`   Add `modelId?: string` as optional 9th param to `GatherContextFn` type
    *   `[✅]`   unit/`gatherContext.test.ts` (or co-located tests)
        *   `[✅]`   Add test: when `modelId` is provided, it is forwarded as 7th argument to `gatherInputsForStageFn`
        *   `[✅]`   Add test: when `modelId` is omitted, `gatherInputsForStageFn` is called with 6 arguments (backward-compatible)
    *   `[✅]`   `gatherContext.ts`
        *   `[✅]`   Add optional 9th parameter `modelId?: string` to function signature (line 28)
        *   `[✅]`   Forward `modelId` as 7th argument to `gatherInputsForStageFn(...)` call (line 42)
    *   `[✅]`   `requirements.md`
        *   `[✅]`   `modelId` must be forwarded without transformation or defaulting
        *   `[✅]`   Optional parameter is additive and backward-compatible; callers that omit `modelId` produce identical behavior to current code

*   `[✅]`   [BE] supabase/functions/_shared/prompt-assembler/`prompt-assembler.ts` **Update internal wrappers to accept and forward optional modelId**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Update default `gatherInputsForStageFn` wrapper (line 73) to accept and forward optional 7th param `modelId?: string`
        *   `[✅]`   Update `_gatherContext` method (line 226) to accept optional `modelId?: string` and forward to `this.gatherContextFn(...)` call
        *   `[✅]`   Update `_gatherInputsForStage` method (line 259) to accept optional `modelId?: string` and forward to `this.gatherInputsForStageFn(...)` call
    *   `[✅]`   `role.md`
        *   `[✅]`   Prompt assembler orchestrator — wires dependency-injected functions and forwards model context through internal method chain
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: PromptAssembler class methods → gatherContextFn → gatherInputsForStageFn
        *   `[✅]`   Three internal methods: default wrapper (line 73), `_gatherContext` (line 226), `_gatherInputsForStage` (line 259)
    *   `[✅]`   `deps.md`
        *   `[✅]`   `GatherInputsForStageFn` with optional 7th param (from gatherInputsForStage node)
        *   `[✅]`   `GatherContextFn` with optional 9th param (from gatherContext node)
        *   `[✅]`   `gatherInputsForStage` default implementation (imported, existing)
    *   `[✅]`   unit/`prompt-assembler.test.ts` (or co-located tests)
        *   `[✅]`   Add test: default `gatherInputsForStageFn` wrapper forwards `modelId` when provided
        *   `[✅]`   Add test: `_gatherContext` forwards `modelId` to `gatherContextFn`
        *   `[✅]`   Add test: `_gatherInputsForStage` forwards `modelId` to `gatherInputsForStageFn`
        *   `[✅]`   Add test: all three methods work unchanged when `modelId` is omitted (backward-compatible)
    *   `[✅]`   `prompt-assembler.ts`
        *   `[✅]`   Update default wrapper (line 73) to accept optional 7th param `modelId?: string` and forward to `gatherInputsForStage(..., modelId)`
        *   `[✅]`   Update `_gatherContext` (line 226) to accept optional `modelId?: string` and forward to `this.gatherContextFn(..., modelId)`
        *   `[✅]`   Update `_gatherInputsForStage` (line 259) to accept optional `modelId?: string` and forward to `this.gatherInputsForStageFn(..., modelId)`
    *   `[✅]`   `requirements.md`
        *   `[✅]`   All three internal methods must accept and forward `modelId` without transformation or defaulting
        *   `[✅]`   Seed prompt path (callers of `_gatherContext` and `_gatherInputsForStage` without modelId) must continue to work unchanged
        *   `[✅]`   Optional parameters are additive and backward-compatible

*   `[✅]`   [BE] supabase/functions/_shared/prompt-assembler/`assembleTurnPrompt.ts` **Pass job.payload.model_id to deps.gatherContext for model-scoped feedback**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Pass `job.payload.model_id` as the new 9th argument to `deps.gatherContext(...)` at line 374
        *   `[✅]`   `model_id` is already validated at lines 46–47 (`typeof job.payload.model_id !== "string"` throws); no new validation required
    *   `[✅]`   `role.md`
        *   `[✅]`   Per-model turn prompt assembler — the top of the per-model execution call chain that originates `modelId` context for downstream feedback scoping
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: assembleTurnPrompt → deps.gatherContext → gatherInputsForStageFn → feedback query
        *   `[✅]`   Wire-up point: line 374, `deps.gatherContext(...)` call
    *   `[✅]`   `deps.md`
        *   `[✅]`   `GatherContextFn` with optional 9th param `modelId?: string` (from gatherContext node)
        *   `[✅]`   `AssembleTurnPromptDeps.gatherContext` field typed as `GatherContextFn` (inherits updated signature automatically)
        *   `[✅]`   `job.payload.model_id` already validated in scope (lines 46–47)
    *   `[✅]`   unit/`assembleTurnPrompt.test.ts`
        *   `[✅]`   Add test: `deps.gatherContext` is called with `job.payload.model_id` as the 9th argument
        *   `[✅]`   Add test: the 9th argument matches the validated `model_id` from the job payload
    *   `[✅]`   `assembleTurnPrompt.ts`
        *   `[✅]`   At line 374: add `job.payload.model_id` as the 9th argument to `deps.gatherContext(...)` call
    *   `[✅]`   `requirements.md`
        *   `[✅]`   `job.payload.model_id` must reach `gatherInputsForStage` so per-model jobs receive model-scoped feedback
        *   `[✅]`   No new validation required — `model_id` is already validated at lines 46–47
        *   `[✅]`   Backward-compatible — `GatherContextFn` param is optional, so existing test mocks that don't expect the 9th arg continue to compile

*   `[✅]`   [BE] supabase/functions/dialectic-worker/`findSourceDocuments.ts` **Fix feedback query: add iteration_number filter, replace ilike with resource_description filtering, and add model_id scoping**
    *   `[✅]`   `objective.md` (Sprint 1 — iteration filter, resource_description filtering)
        *   `[✅]`   Add `iteration_number` filter to the feedback query (currently missing — returns feedback from all iterations)
        *   `[✅]`   Replace `ilike('file_name', '%${rule.document_key}%')` substring match (line 257) with proper `resource_description->>'document_key'` eq filter, consistent with the approach used in other retrieval paths
        *   `[✅]`   Use `iterationNumber` directly (matching the standardized iteration semantics from nodes 2, 3, 5)
    *   `[✅]`   `objective.md` (Sprint 2 — model_id scoping)
        *   `[✅]`   Add `.filter('resource_description->>model_id', 'eq', parentJob.payload.model_id)` to the feedback query — `parentJob.payload.model_id` is already available in scope (used by the `header_context` case at line 346)
        *   `[✅]`   This ensures each model's PLAN/EXECUTE job receives only the feedback that annotates that model's prior output, not feedback for other models' outputs
    *   `[✅]`   `role.md`
        *   `[✅]`   Dialectic worker — locates source documents (including feedback) for job planning
        *   `[✅]`   Must return the correct, unambiguous feedback records for a given logical document
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: DB query → source record mapping → job planner consumption
        *   `[✅]`   Feedback type handling within the `case 'feedback':` branch (lines 251–271)
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 1 migration (unique index ensures at most one row per logical doc)
        *   `[✅]`   `SupabaseClient<Database>` for DB query
        *   `[✅]`   `dialectic_feedback` table with `resource_description` JSONB column
        *   `[✅]`   `isFeedbackRow` type guard (existing, line 19)
        *   `[✅]`   `mapFeedbackToSourceDocument` mapper (existing)
    *   `[✅]`   unit/`findSourceDocuments.test.ts` (Sprint 1)
        *   `[✅]`   Add test: feedback query includes `.eq('iteration_number', iterationNumber)` filter
        *   `[✅]`   Add test: feedback query uses `resource_description->>'document_key'` eq filter instead of `ilike` on `file_name`
        *   `[✅]`   Add test: feedback query uses `iterationNumber` directly (consistent with other paths)
        *   `[✅]`   Update existing feedback tests if query structure changes affect mock expectations
    *   `[✅]`   unit/`findSourceDocuments.test.ts` (Sprint 2 — model_id scoping)
        *   `[✅]`   Add test: feedback query includes `.filter('resource_description->>model_id', 'eq', parentJob.payload.model_id)` filter
        *   `[✅]`   Add test: when two models have feedback for the same document_key, only the executing model's feedback is returned
        *   `[✅]`   Update existing feedback tests if query structure changes affect mock expectations
    *   `[✅]`   `findSourceDocuments.ts` (Sprint 1)
        *   `[✅]`   At the `case 'feedback':` branch (line 251): add `.eq('iteration_number', iterationNumber)` to the query
        *   `[✅]`   Replace `.ilike('file_name', '%${rule.document_key}%')` (line 257) with `.eq('resource_description->>document_key', rule.document_key)` when `rule.document_key` is defined
        *   `[✅]`   Verify `iterationNumber` is available in scope and uses the same value as other retrieval paths
    *   `[✅]`   `findSourceDocuments.ts` (Sprint 2 — model_id scoping)
        *   `[✅]`   Add `.filter('resource_description->>model_id', 'eq', parentJob.payload.model_id)` to the feedback query chain (mirrors the `header_context` case pattern at line 346)
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Feedback records must be scoped to the correct iteration (no cross-iteration contamination)
        *   `[✅]`   Document key filtering must use the structured JSONB field, not substring matching on filenames
        *   `[✅]`   Iteration semantics must be consistent with `submitStageDocumentFeedback`, `getStageDocumentFeedback`, `gatherInputsForStage`, and `executeModelCallAndSave`
        *   `[✅]`   Feedback must be scoped to the executing model's `model_id` via `resource_description->>'model_id'` — prevents cross-model feedback contamination (mirrors the `header_context` case which already filters by `model_id`)

*   `[✅]`   [BE] supabase/functions/dialectic-service/`dialectic.interface.ts` **Remove dead `userStageFeedback` field from `SubmitStageResponsesPayload`**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Remove `userStageFeedback` from `SubmitStageResponsesPayload` — the field is never read by `submitStageResponses.ts` and represents an obsolete stage-level feedback contract
        *   `[✅]`   The current workflow is per-(documentKey, modelId) feedback via `submitStageDocumentFeedback`; the UI saves dirty feedback before calling `submitStageResponses` via the discrete save path
        *   `[✅]`   Remove the corresponding field from the frontend `@paynless/types` mirror if present
    *   `[✅]`   `role.md`
        *   `[✅]`   Type housekeeping — removes a field that lies about a contract the system doesn't honor
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: type definition cleanup in `dialectic.interface.ts` (backend) and `dialectic.types.ts` (frontend) if applicable
    *   `[✅]`   `deps.md`
        *   `[✅]`   `SubmitStageResponsesPayload` type in `dialectic.interface.ts`
        *   `[✅]`   Any frontend mirror in `@paynless/types` `dialectic.types.ts`
        *   `[✅]`   Any store-side code that populates `userStageFeedback` when constructing the payload
    *   `[✅]`   `dialectic.interface.ts`
        *   `[✅]`   Remove `userStageFeedback` property from `SubmitStageResponsesPayload`
    *   `[✅]`   `dialectic.types.ts` (frontend, if field exists)
        *   `[✅]`   Remove `userStageFeedback` property from frontend `SubmitStageResponsesPayload` mirror
    *   `[✅]`   Audit store/UI callers
        *   `[✅]`   Remove any code that populates `userStageFeedback` on the payload when calling `submitStageResponses`
    *   `[✅]`   `requirements.md`
        *   `[✅]`   `SubmitStageResponsesPayload` must not contain `userStageFeedback` — feedback is exclusively per-(documentKey, modelId) via `submitStageDocumentFeedback`
        *   `[✅]`   The UI's "Submit Responses" button workflow is: save dirty per-document feedback via `submitStageDocumentFeedback` → advance stage via `submitStageResponses`

*   `[✅]`   [TEST-INT] supabase/integration_tests/services/`feedback_dataflow_antithesis_to_synthesis.integration.test.ts` **Correct integration test to exercise both user-facing save paths and prove model-scoped feedback ingestion**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Rewrite Step 1 to exercise both user-facing feedback save paths at the API boundary:
            *   `[✅]`   Step 1a — "Save Feedback" button path: call `submitStageDocumentFeedback` for (docA, modelA), assert feedback row returned, assert retrievable via `getStageDocumentFeedback`
            *   `[✅]`   Step 1b — "Submit Responses" button path: call `submitStageDocumentFeedback` for (docA, modelB) simulating the dirty-feedback flush the UI performs before stage advancement, then call `submitStageResponses`, assert feedback for (docA, modelB) persisted, assert stage advanced, assert feedback from step 1a is still intact after stage advancement
        *   `[✅]`   Fix Step 2 test setup: use distinct `modelSlug` values per model so rendered document storage paths don't collide (eliminates the 409 Duplicate errors)
        *   `[✅]`   Fix Step 3 test setup: seed a `header_context` contribution for the Synthesis stage in `dialectic_contributions` so `gatherInputsForStage` doesn't throw before reaching the feedback assertion
        *   `[✅]`   Step 2 assertion update: after model_id scoping is implemented, assert that `findSourceDocuments` returns only the executing model's feedback, not feedback for other models
        *   `[✅]`   Step 3 assertion update: after model_id scoping is implemented, assert that `gatherInputsForStage` with model context returns model-scoped feedback, and without model context returns all feedback
    *   `[✅]`   `role.md`
        *   `[✅]`   Integration test — proves the feedback dataflow from antithesis through synthesis at the API boundary using real Supabase DB and Storage
        *   `[✅]`   Exercises the complete user story: save feedback per (documentKey, modelId) via both UI paths, advance stage, verify feedback is available for next-stage consumption
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: integration test → real `submitStageDocumentFeedback` / `getStageDocumentFeedback` / `submitStageResponses` / `findSourceDocuments` / `gatherInputsForStage` → real Supabase DB + Storage
        *   `[✅]`   Depends on Nodes 5 Sprint 2 and 6 Sprint 2 (model_id scoping) being complete so the assertions can prove model-scoped feedback selection
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 5 Sprint 2: `gatherInputsForStage` model_id scoping
        *   `[✅]`   Node 6 Sprint 2: `findSourceDocuments` model_id scoping
        *   `[✅]`   Node 6.c: `userStageFeedback` dead field removed from `SubmitStageResponsesPayload`
        *   `[✅]`   All Sprint 1 nodes (1–6): already complete
    *   `[✅]`   `feedback_dataflow_antithesis_to_synthesis.integration.test.ts`
        *   `[✅]`   Rewrite test "should persist per-document feedback" → split into two sub-assertions:
            *   `[✅]`   1a: Call `submitStageDocumentFeedback` for (docA, modelA). Assert success. Call `getStageDocumentFeedback` for (docA, modelA). Assert returned feedback matches saved content.
            *   `[✅]`   1b: Call `submitStageDocumentFeedback` for (docA, modelB). Call `submitStageResponses` for stage advancement. Assert stage advanced. Call `getStageDocumentFeedback` for (docA, modelA). Assert step 1a feedback is still intact. Call `getStageDocumentFeedback` for (docA, modelB). Assert step 1b feedback is intact.
        *   `[✅]`   Fix `createRenderedDocumentForModel`: accept `modelSlug` parameter distinct per model (e.g., `"mock-model-a"`, `"mock-model-b"`) so storage paths don't collide
        *   `[✅]`   In Step 3 setup: seed a `dialectic_contributions` row with `contribution_type = 'header_context'` for the Synthesis stage/session/iteration so `gatherInputsForStage` passes its precondition check
        *   `[✅]`   Update Step 2 assertion: assert `findSourceDocuments` with modelA's job returns only modelA's feedback row, not modelB's
        *   `[✅]`   Update Step 3 assertion: assert `gatherInputsForStage` with modelId returns 1 feedback doc (model-scoped); assert without modelId returns 2 feedback docs (all models)
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Both user-facing save paths ("Save Feedback" button and "Submit Responses" button) must be proven at the API boundary
        *   `[✅]`   Feedback saved by one path must not be destroyed by the other
        *   `[✅]`   Model-scoped feedback selection must be proven: feedback for modelA must not leak into modelB's job context
        *   `[✅]`   Stage advancement must not disrupt previously saved feedback
        *   `[✅]`   All test setup must use distinct storage paths per model to avoid 409 collisions

*   `[✅]`   **Commit** `fix(be): feedback upsert, fetch handler, deterministic ingestion, iteration consistency, and model-scoped feedback selection`
    *   `[✅]`   Node 1: Per-document unique constraint migration
    *   `[✅]`   Node 2: `file_manager` user_feedback update-or-insert by logical doc key (single writer for storage + DB)
    *   `[✅]`   Node 2.b: `submitStageDocumentFeedback` delegates to FileManager only (no direct DB/storage writes)
    *   `[✅]`   Node 3: New `getStageDocumentFeedback` handler + types in `dialectic.interface.ts`
    *   `[✅]`   Node 4: Router wiring for `getStageDocumentFeedback` in `index.ts`
    *   `[✅]`   Node 5 Sprint 1: `gatherInputsForStage` deterministic selection + iteration fix
    *   `[✅]`   Node 5 Sprint 2: `gatherInputsForStage` model_id scoping for per-model jobs; all-feedback for seed prompts
    *   `[✅]`   Node 6 Sprint 1: `findSourceDocuments` iteration filter + resource_description filtering
    *   `[✅]`   Node 6 Sprint 2: `findSourceDocuments` model_id scoping (mirrors `header_context` pattern)
    *   `[✅]`   Node 6.c: Remove dead `userStageFeedback` from `SubmitStageResponsesPayload`
    *   `[✅]`   Node 6.d: Integration test corrected to exercise both save paths + model-scoped ingestion

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.documents.ts` **Add localStorage draft persistence and saved-feedback prepopulation logic**
    *   `[✅]`   `objective.md`
        *   `[✅]`   On each feedback draft change, persist the draft to localStorage under a stable key derived from the logical doc identity (userId, sessionId, stageSlug, iterationNumber, modelId, documentKey)
        *   `[✅]`   On successful save (Save Feedback or Submit Stage Responses), flush the localStorage entry for the saved logical doc
        *   `[✅]`   Add new `initializeFeedbackDraftLogic` function that: (1) calls existing `fetchStageDocumentFeedback` to get saved feedback from backend, (2) checks localStorage for an existing draft, (3) sets `feedbackDraftMarkdown` from the draft (if present) or from the saved feedback content (if present)
        *   `[✅]`   Prepopulation priority: localStorage draft wins over saved backend feedback (user's unsaved work takes precedence)
    *   `[✅]`   `role.md`
        *   `[✅]`   State management layer — maintains feedback draft state with cross-tab persistence via localStorage
        *   `[✅]`   Orchestrates the prepopulation flow: backend fetch → localStorage check → draft initialization
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: store actions → localStorage API → API client → store state mutations
        *   `[✅]`   localStorage key format: `paynless:feedbackDraft:${userId}:${sessionId}:${stageSlug}:${iterationNumber}:${modelId}:${documentKey}`
        *   `[✅]`   Affected existing functions: `recordStageDocumentFeedbackDraftLogic` (add localStorage write), `flushStageDocumentFeedbackDraftLogic` (add localStorage remove)
        *   `[✅]`   New function: `initializeFeedbackDraftLogic`
    *   `[✅]`   `deps.md`
        *   `[✅]`   Existing `stageDocumentContent` state structure and `StageDocumentContentState` type
        *   `[✅]`   Existing `fetchStageDocumentFeedbackLogic` and `stageDocumentFeedback` state
        *   `[✅]`   Existing `api.dialectic().getStageDocumentFeedback()` API client method
        *   `[✅]`   Storage adapter (platform abstraction) for cross-platform compatibility (web localStorage + Tauri head)
        *   `[✅]`   `StageDocumentCompositeKey` type (sessionId, stageSlug, iterationNumber, modelId, documentKey)
        *   `[✅]`   userId from auth state (`get().user?.id`) for localStorage key construction
        *   `[✅]`   Node 4 (backend handler wired — `getStageDocumentFeedback` must be serviceable for prepopulation fetch to succeed)
    *   `[✅]`   unit/`dialecticStore.documents.test.ts`
        *   `[✅]`   Add test: `recordStageDocumentFeedbackDraftLogic` writes feedbackDraftMarkdown to localStorage on each change
        *   `[✅]`   Add test: `recordStageDocumentFeedbackDraftLogic` localStorage key contains all logical doc identity fields (userId, sessionId, stageSlug, iterationNumber, modelId, documentKey)
        *   `[✅]`   Add test: `flushStageDocumentFeedbackDraftLogic` removes the localStorage entry for the corresponding key
        *   `[✅]`   Add test: `initializeFeedbackDraftLogic` calls `fetchStageDocumentFeedback` and sets `feedbackDraftMarkdown` from saved feedback when no localStorage draft exists
        *   `[✅]`   Add test: `initializeFeedbackDraftLogic` uses localStorage draft over saved feedback when both exist
        *   `[✅]`   Add test: `initializeFeedbackDraftLogic` sets empty `feedbackDraftMarkdown` when neither localStorage draft nor saved feedback exists
        *   `[✅]`   Add test: `initializeFeedbackDraftLogic` sets `feedbackIsDirty = true` only when loading from localStorage draft, not from saved feedback
        *   `[✅]`   Add test: `initializeFeedbackDraftLogic` is idempotent — calling it while a dirty draft is already loaded does not overwrite the user's in-progress edits
    *   `[✅]`   `dialecticStore.documents.ts`
        *   `[✅]`   Add helper function `buildFeedbackLocalStorageKey(userId, key)` that constructs the deterministic localStorage key from userId + composite key fields
        *   `[✅]`   In `recordStageDocumentFeedbackDraftLogic`: after updating state, persist via storage adapter (guarded; do not assume localStorage exists)
        *   `[✅]`   In `flushStageDocumentFeedbackDraftLogic`: after clearing state, flush via storage adapter (guarded; do not assume localStorage exists)
        *   `[✅]`   Add `initializeFeedbackDraftLogic(get, set, key)` that orchestrates: fetch saved feedback → check localStorage → set draft state with correct `feedbackIsDirty` flag
        *   `[✅]`   Guard `initializeFeedbackDraftLogic` against overwriting existing dirty drafts (if `feedbackIsDirty` is already true, skip initialization)
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Draft survives tab close and browser restart (localStorage)
        *   `[✅]`   Draft is flushed only on explicit successful save, never on page unload
        *   `[✅]`   Prepopulation is idempotent: repeated calls do not overwrite user's in-progress edits
        *   `[✅]`   localStorage writes are synchronous and do not block UI rendering
        *   `[✅]`   userId is obtained from auth state (`get().user?.id`), not from the composite key

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.ts` **Wire initializeFeedbackDraft action into the store**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Add `initializeFeedbackDraft` action to the store that delegates to `initializeFeedbackDraftLogic` from `dialecticStore.documents.ts`
        *   `[✅]`   Expose the action for UI consumption (analogous to existing `updateStageDocumentFeedbackDraft` and `submitStageDocumentFeedback` actions)
    *   `[✅]`   `role.md`
        *   `[✅]`   State management — Zustand store action wiring layer connecting UI to logic functions
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: store action interface → logic function delegation
        *   `[✅]`   Follows the established wiring pattern: `updateStageDocumentFeedbackDraft` (line 1361), `submitStageDocumentFeedback` (line 1399)
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 7: `initializeFeedbackDraftLogic` in `dialecticStore.documents.ts`
        *   `[✅]`   `StageDocumentCompositeKey` type
        *   `[✅]`   Existing store `get`/`set` accessors
    *   `[✅]`   interface/store type definition
        *   `[✅]`   Add `initializeFeedbackDraft: (key: StageDocumentCompositeKey) => Promise<void>` to the store's type definition
    *   `[✅]`   unit/`dialecticStore.documents.test.ts` (or co-located store tests)
        *   `[✅]`   Add test: `initializeFeedbackDraft` action calls `initializeFeedbackDraftLogic` with correct arguments
    *   `[✅]`   `dialecticStore.ts`
        *   `[✅]`   Import `initializeFeedbackDraftLogic` from `./dialecticStore.documents.ts`
        *   `[✅]`   Add `initializeFeedbackDraft` action: `async (key) => { return await initializeFeedbackDraftLogic(get, set, key); }`
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Action must be callable from UI components via `useDialecticStore(state => state.initializeFeedbackDraft)`
        *   `[✅]`   Follows the same async action pattern as `submitStageDocumentFeedback`

*   `[✅]`   [UI] apps/web/src/components/dialectic/`GeneratedContributionCard.tsx` **Wire feedback prepopulation on document expand/focus**
    *   `[✅]`   `objective.md`
        *   `[✅]`   When the feedback pane for a document is opened/expanded, call `initializeFeedbackDraft(compositeKey)` to prepopulate from saved feedback or localStorage draft
        *   `[✅]`   Display loading state while the initialization fetch is in progress
        *   `[✅]`   After initialization, the textarea reads from `feedbackDraftMarkdown` as before — no change to the editing flow
        *   `[✅]`   The "Save Feedback" and "Submit Responses" flows remain unchanged (they already call `submitStageDocumentFeedback` which flushes the draft)
    *   `[✅]`   `role.md`
        *   `[✅]`   UI component — renders the feedback textarea and manages user interaction lifecycle
        *   `[✅]`   Responsible for triggering prepopulation at the right lifecycle moment
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: React component mount/expand → store action call → state subscription → textarea render
        *   `[✅]`   Trigger point: when feedback pane becomes visible (expand/toggle or component mount)
        *   `[✅]`   No changes to save/submit flow, only to initialization
    *   `[✅]`   `deps.md`
        *   `[✅]`   Node 8: `initializeFeedbackDraft` store action (must be wired in store)
        *   `[✅]`   Existing `useDialecticStore` hook for accessing store actions and state
        *   `[✅]`   Existing `StageDocumentCompositeKey` construction from component props/state
        *   `[✅]`   Existing `documentResourceState?.feedbackDraftMarkdown` binding for textarea value
    *   `[✅]`   unit/`GeneratedContributionCard.test.tsx`
        *   `[✅]`   Add test: when feedback pane is expanded, `initializeFeedbackDraft` is called with the correct composite key
        *   `[✅]`   Add test: `initializeFeedbackDraft` is NOT called again if feedback pane is already initialized (idempotency guard)
        *   `[✅]`   Add test: textarea displays the value from `feedbackDraftMarkdown` after initialization completes (prepopulated from saved feedback)
        *   `[✅]`   Add test: textarea displays the localStorage draft content when a draft exists (draft wins over saved feedback)
        *   `[✅]`   Add test: save flow still works after prepopulation (Save Feedback calls `submitStageDocumentFeedback` and flushes the draft)
    *   `[✅]`   `GeneratedContributionCard.tsx`
        *   `[✅]`   Add `initializeFeedbackDraft` to the store selectors used by this component
        *   `[✅]`   Add a `useEffect` or equivalent that calls `initializeFeedbackDraft(compositeKey)` when the feedback pane becomes visible and the draft has not yet been initialized
        *   `[✅]`   Add a guard (e.g., a ref or state flag) to prevent re-initialization if the user has already begun editing
        *   `[✅]`   Optionally display a brief loading indicator while initialization fetch is in progress
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Feedback pane shows previously saved feedback on open (not empty)
        *   `[✅]`   Unsaved localStorage draft takes precedence over saved feedback
        *   `[✅]`   Initialization does not disrupt in-progress editing
        *   `[✅]`   No redundant API calls (initialize once per document per session lifecycle)

*   `[✅]`   **Commit** `feat(store,ui): localStorage draft persistence and feedback prepopulation`
    *   `[✅]`   Node 7: localStorage persistence in `dialecticStore.documents.ts`
    *   `[✅]`   Node 8: `initializeFeedbackDraft` action wiring in `dialecticStore.ts`
    *   `[✅]`   Node 9: Prepopulation trigger in `GeneratedContributionCard.tsx`

*   `[✅]`   `[BE]` dialectic-service/`dialectic.interface.ts` + _shared/prompt-assembler/`gatherInputsForStage` **Remove nonexistent `section_header` from InputRule; derive `metadata.header` from `displayName` + `rule.type`**
    *   `[✅]`   `objective.md`
        *   `[✅]`   The `InputRule` interface contains a `section_header` field (line 1498-1499) that does not exist in any database record. No migration seed data populates it. The field must be removed from the interface entirely.
        *   `[✅]`   `gatherInputsForStage` currently sets `metadata.header = rule.section_header`, which always evaluates to `undefined` because the field does not exist. This causes `assemblePlannerPrompt` to skip every sourceDocument at line 266 (`if (!header) continue;`), producing empty dot-notation variables and empty Thesis/Feedback sections in rendered prompts.
        *   `[✅]`   The function already possesses the data needed to derive the header: `displayName` (fetched from `dialectic_stages.display_name` via `displayNameMap` at line 104) and `rule.type` (`"document"` or `"feedback"`). The header must be derived as `"{displayName} Documents"` for `type === "document"` and `"{displayName} Feedback"` for `type === "feedback"`. Types `"header_context"` and `"contribution"` do not participate in dot-notation template rendering and must not have a header set.
    *   `[✅]`   `role.md`
        *   `[✅]`   `dialectic.interface.ts`: Type definition — defines the `InputRule` contract consumed by `parseInputArtifactRules` and `gatherInputsForStage`.
        *   `[✅]`   `gatherInputsForStage.ts`: Adapter — gathers input artifacts from the database and Supabase Storage, maps them into `AssemblerSourceDocument` with correctly derived `metadata.header` for downstream dot-notation variable construction.
    *   `[✅]`   `module.md`
        *   `[✅]`   `dialectic.interface.ts`: Type definitions (`supabase/functions/dialectic-service/`). Boundary: defines the `InputRule` interface consumed by all prompt assembler functions.
        *   `[✅]`   `gatherInputsForStage.ts`: Prompt assembler input gathering (`supabase/functions/_shared/prompt-assembler/`). Boundary: receives `InputRule[]` from `stage.recipe_step.inputs_required`, queries `dialectic_project_resources`, `dialectic_feedback`, and `dialectic_contributions`, derives `metadata.header` from `displayName` + `rule.type`, and returns `GatheredRecipeContext` containing `sourceDocuments: AssemblerSourceDocument[]`.
    *   `[✅]`   `deps.md`
        *   `[✅]`   `InputRule` from `supabase/functions/dialectic-service/dialectic.interface.ts` (line 1487-1500) — the interface from which `section_header` must be removed.
        *   `[✅]`   `AssemblerSourceDocument` from `supabase/functions/_shared/prompt-assembler/prompt-assembler.interface.ts` (line 162-172) — the `metadata.header` field remains as-is (`header?: string`); it is populated by derivation, not copied from a nonexistent field.
        *   `[✅]`   `displayNameMap` from `gatherInputsForStage.ts` (line 92-94) — already maps `rule.slug` to `dialectic_stages.display_name`, providing the stage name used in header derivation.
        *   `[✅]`   `parseInputArtifactRules` from `supabase/functions/_shared/utils/input-artifact-parser.ts` — parses raw `inputs_required` JSON into typed `InputRule[]`; must compile after `section_header` is removed from `InputRule`.
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   Remove `section_header?: string` and its JSDoc comment (lines 1498-1499) from the `InputRule` interface. The field does not exist in any database record and must not exist in the type.
    *   `[✅]`   unit/`gatherInputsForStage.test.ts`
        *   `[✅]`   Remove `section_header` from every `InputRule` object constructed in tests (lines 347, 708, 715, 916, 923, 1266, 1462, 1649, 1795, 2007, 2119, 2285, 2447).
        *   `[✅]`   Remove or rewrite the test at line 760 ("should use custom section_headers when provided in rules") — the concept of custom section_headers does not exist.
        *   `[✅]`   Update all assertions that check `metadata.header` to assert the derived value: `"{DisplayName} Documents"` for `type === "document"`, `"{DisplayName} Feedback"` for `type === "feedback"`, `undefined` for `type === "header_context"`, `undefined` for `type === "contribution"`.
    *   `[✅]`   `gatherInputsForStage.ts`
        *   `[✅]`   At the document-type metadata construction (line 204): replace `header: rule.section_header` with `header: \`\${displayName} Documents\``.
        *   `[✅]`   At the feedback-type single-record metadata construction (line 311): replace `header: rule.section_header` with `header: \`\${displayName} Feedback\``.
        *   `[✅]`   At the feedback-type multi-record metadata construction (line 363): replace `header: rule.section_header` with `header: \`\${displayName} Feedback\``.
        *   `[✅]`   At the header_context-type metadata construction (line 443): remove the `header` field entirely (do not set it; `header_context` does not participate in dot-notation template rendering).
        *   `[✅]`   At the contribution-type metadata construction (line 559): remove the `header` field entirely (do not set it; `contribution` does not participate in dot-notation template rendering).
    *   `[✅]`   `requirements.md`
        *   `[✅]`   `section_header` must not exist on the `InputRule` interface.
        *   `[✅]`   `metadata.header` for `type === "document"` sourceDocuments must equal `"{displayName} Documents"` (e.g., `"Thesis Documents"` when `rule.slug === "thesis"`).
        *   `[✅]`   `metadata.header` for `type === "feedback"` sourceDocuments must equal `"{displayName} Feedback"` (e.g., `"Thesis Feedback"` when `rule.slug === "thesis"`).
        *   `[✅]`   `metadata.header` for `type === "header_context"` and `type === "contribution"` sourceDocuments must be `undefined`.
        *   `[✅]`   All existing tests must be updated to remove `section_header` references and assert derived headers; all tests must pass after changes.
    *   `[✅]`   **Commit** `fix(be): derive metadata.header from displayName + rule.type; remove nonexistent section_header from InputRule`
        *   `[✅]`   `dialectic.interface.ts`: removed `section_header` from `InputRule` interface.
        *   `[✅]`   `gatherInputsForStage.ts`: replaced `rule.section_header` with derived `"{displayName} Documents"` / `"{displayName} Feedback"` at all metadata construction sites; removed header assignment for `header_context` and `contribution` types.
        *   `[✅]`   `gatherInputsForStage.test.ts`: removed all `section_header` from test InputRules, updated header assertions to derived values, removed custom section_header test.

*   `[✅]`   `[BE]` _shared/utils/`input-artifact-parser.test.ts` **Remove `section_header` from parser test InputRules**
    *   `[✅]`   `objective.md`
        *   `[✅]`   The input artifact parser test constructs `InputRule` objects with `section_header` (lines 41, 51). After `section_header` is removed from the `InputRule` interface, these tests will not compile. Remove the field from all test InputRule objects.
    *   `[✅]`   `role.md`
        *   `[✅]`   Test — unit tests for the input artifact rule parser.
    *   `[✅]`   `module.md`
        *   `[✅]`   Input artifact parsing (`supabase/functions/_shared/utils/`). Boundary: validates and parses raw `inputs_required` JSON into typed `InputRule[]`.
    *   `[✅]`   `deps.md`
        *   `[✅]`   `InputRule` from `supabase/functions/dialectic-service/dialectic.interface.ts` — the interface from which `section_header` has been removed (Node above).
    *   `[✅]`   unit/`input-artifact-parser.test.ts`
        *   `[✅]`   Remove `section_header: 'Synthesis Insights'` from the InputRule objects at lines 41 and 51.
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Test InputRules must not reference `section_header`.
        *   `[✅]`   All parser tests must pass after changes.
    *   `[✅]`   **Commit** `fix(be): remove section_header from input-artifact-parser test InputRules`
        *   `[✅]`   `input-artifact-parser.test.ts`: removed `section_header` from test InputRule objects.

*   `[✅]`   `[BE]` dialectic-worker/`processSimpleJob.test.ts` **Remove `section_header` from worker test InputRules**
    *   `[✅]`   `objective.md`
        *   `[✅]`   The processSimpleJob test constructs `InputRule` objects with `section_header` (lines 194, 207). After `section_header` is removed from the `InputRule` interface, these tests will not compile. Remove the field from all test InputRule objects.
    *   `[✅]`   `role.md`
        *   `[✅]`   Test — unit tests for the dialectic job worker.
    *   `[✅]`   `module.md`
        *   `[✅]`   Dialectic worker (`supabase/functions/dialectic-worker/`). Boundary: processes dialectic jobs by dispatching to appropriate assemblers.
    *   `[✅]`   `deps.md`
        *   `[✅]`   `InputRule` from `supabase/functions/dialectic-service/dialectic.interface.ts` — the interface from which `section_header` has been removed (Node above).
    *   `[✅]`   unit/`processSimpleJob.test.ts`
        *   `[✅]`   Remove `section_header: 'Business Case Inputs'` from the InputRule at line 194.
        *   `[✅]`   Remove `section_header: 'Planner Context'` from the InputRule at line 207.
    *   `[✅]`   `requirements.md`
        *   `[✅]`   Test InputRules must not reference `section_header`.
        *   `[✅]`   All worker tests must pass after changes.
    *   `[✅]`   **Commit** `fix(be): remove section_header from processSimpleJob test InputRules`
        *   `[✅]`   `processSimpleJob.test.ts`: removed `section_header` from test InputRule objects.

*   `[✅]`   `[BE]` integration/`assemblePlannerPrompt_sourceDocuments.integration.test.ts` **Remove fabricated `section_header` from integration test InputRules; verify derived headers produce correct rendered output**
    *   `[✅]`   `objective.md`
        *   `[✅]`   The integration test fabricates `section_header` values on mock `inputs_required` (lines 96, 104, 807, 808, 809, 1094, 1095, 1378, 1379, 1380, 1381, 1656, 1657, 1658, 1659) that do not exist in real data. These must be removed so the test matches real conditions.
        *   `[✅]`   The mock `sourceDocuments` hardcode `header` in metadata (e.g., `header: "Thesis Documents"` at line 210). These values are correct — they represent what `gatherInputsForStage` will now produce via derivation. The mock `gatherContext` bypasses `gatherInputsForStage`, so the hardcoded `header` values in mock sourceDocuments remain valid as they simulate the derived output.
        *   `[✅]`   Add a new integration test that uses the ACTUAL prompt template from `docs/prompts/antithesis/antithesis_planner_review_v1.md`, uses `inputs_required` matching the real antithesis migration data (no `section_header`), and uses actual thesis stage inputs (to be supplied by user) as sourceDocument content. This test must prove the full pipeline renders Thesis Documents and Thesis Feedback sections correctly.
    *   `[✅]`   `role.md`
        *   `[✅]`   Test — bounded integration test for the `assemblePlannerPrompt` → `render` → `renderPrompt` pipeline.
    *   `[✅]`   `module.md`
        *   `[✅]`   Integration testing (`supabase/integration_tests/services/`). Boundary: exercises real `assemblePlannerPrompt`, real `render`, real `renderPrompt`; mocks database client, file manager, and `gatherContext`.
    *   `[✅]`   `deps.md`
        *   `[✅]`   `InputRule` from `supabase/functions/dialectic-service/dialectic.interface.ts` — the interface from which `section_header` has been removed.
        *   `[✅]`   `assemblePlannerPrompt` from `supabase/functions/_shared/prompt-assembler/assemblePlannerPrompt.ts` — the function under test.
        *   `[✅]`   `render` from `supabase/functions/_shared/prompt-assembler/render.ts` — exercised as REAL (not mocked).
        *   `[✅]`   `renderPrompt` from `supabase/functions/_shared/prompt-renderer.ts` — exercised as REAL (not mocked).
        *   `[✅]`   Actual prompt template `docs/prompts/antithesis/antithesis_planner_review_v1.md` — the template consumed by the new integration test.
        *   `[✅]`   Actual thesis stage inputs (to be supplied by user) — real document content for sourceDocument construction.
    *   `[✅]`   integration/`assemblePlannerPrompt_sourceDocuments.integration.test.ts`
        *   `[✅]`   Remove `section_header` from every `inputs_required` InputRule across all test cases (lines 96, 104, 807, 808, 809, 1094, 1095, 1378, 1379, 1380, 1381, 1656, 1657, 1658, 1659).
        *   `[✅]`   Add new test case: "renders antithesis planner with actual template and real thesis inputs"
            *   `[✅]`   Load or inline the actual template from `docs/prompts/antithesis/antithesis_planner_review_v1.md`
            *   `[✅]`   Construct `inputs_required` matching the real antithesis migration data: `[{"type":"document","slug":"thesis","document_key":"business_case","required":true}, ...]` — no `section_header`
            *   `[✅]`   Construct mock `sourceDocuments` with `header: "Thesis Documents"` and `header: "Thesis Feedback"` (simulating the derived output of `gatherInputsForStage`) using actual thesis stage inputs as content
            *   `[✅]`   Exercise real `render` + `renderPrompt` pipeline
            *   `[✅]`   Assert: rendered prompt contains thesis document content after each `Business Case:`, `Feature Specification:`, `Technical Approach:`, `Success Metrics:` label
            *   `[✅]`   Assert: when thesis feedback sourceDocuments are provided, the `{{#section:thesis_feedback}}` block is retained and feedback content appears
            *   `[✅]`   Assert: when thesis feedback sourceDocuments are NOT provided, the `{{#section:thesis_feedback}}` block is removed entirely
            *   `[✅]`   Assert: no unresolved `{{thesis_documents.*}}` or `{{thesis_feedback.*}}` placeholders remain
            *   `[✅]`   Assert: standard context variables (`{{role}}`, `{{stage_instructions}}`, `{{seed_prompt}}`, `{{style_guide_markdown}}`, `{{outputs_required}}`) are substituted correctly
    *   `[✅]`   `requirements.md`
        *   `[✅]`   No `inputs_required` InputRule in any test case may contain `section_header`.
        *   `[✅]`   The new integration test must use the actual antithesis planner template and actual thesis stage inputs.
        *   `[✅]`   The rendered prompt must have populated Thesis Documents and Thesis Feedback sections (not empty).
        *   `[✅]`   All integration tests must pass after changes.
    *   `[✅]`   **Commit** `fix(be): remove fabricated section_header from integration tests; add actual-template integration test`
        *   `[✅]`   `assemblePlannerPrompt_sourceDocuments.integration.test.ts`: removed `section_header` from all test InputRules, added new integration test using actual antithesis planner template and real thesis inputs.

*   `[✅]`   [BE] supabase/functions/dialectic-worker/`executeModelCallAndSave.ts` **Fix gatherArtifacts to download document content from Supabase Storage instead of reading non-existent content column**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Every branch of `gatherArtifacts` (`document`, `feedback`, `seed_prompt`, `project_resource`, `header_context`) must download file content from Supabase Storage using the row's `storage_bucket`, `storage_path`, `file_name` fields
        *   `[✅]`   Replace every instance of `const content = isRecord(u) && typeof u['content'] === 'string' ? u['content'] : '';` with a storage download — there is no `content` column on `dialectic_project_resources` or `dialectic_contributions`
        *   `[✅]`   If a storage download fails for a required input, throw immediately — no empty-string fallback
        *   `[✅]`   If a storage download fails for an optional input, skip and continue
        *   `[✅]`   The `downloadFromStorage` dependency must be injected — `gatherArtifacts` currently has access to `dbClient` and `deps` which does not include a download function; this must be resolved
    *   `[✅]`   `role.md`
        *   `[✅]`   Infrastructure adapter — bridges database row metadata to Supabase Storage file content
        *   `[✅]`   This function is the sole provider of `resourceDocuments` content for ALL EXECUTE jobs (both planner and turn)
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: `gatherArtifacts` inner function within `executeModelCallAndSave`
        *   `[✅]`   Input: `inputsRequired` rules array from recipe step, `dbClient` for row queries, storage download function for content retrieval
        *   `[✅]`   Output: `IdentityDoc[]` where `content` is the actual file content downloaded from storage, not an empty string
    *   `[✅]`   `deps.md`
        *   `[✅]`   `dbClient: SupabaseClient<Database>` — for querying `dialectic_project_resources` and `dialectic_contributions`
        *   `[✅]`   `downloadFromStorage` — must be made available within `gatherArtifacts` scope (currently available on the outer function's `deps` or can be passed from `processSimpleJob`)
        *   `[✅]`   `deconstructStoragePath` — already imported, used for row filtering
        *   `[✅]`   `isRecord` type guard — already imported
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   Verify `ExecuteModelCallAndSaveParams` includes or can receive a `downloadFromStorage` dependency — if not, add it
    *   `[✅]`   unit/`executeModelCallAndSave.gatherArtifacts.test.ts`
        *   `[✅]`   Test: `document` branch downloads content from storage using `storage_bucket`, `storage_path`, `file_name` from the row — asserts `content` is the downloaded text, not empty string
        *   `[✅]`   Test: `feedback` branch downloads content from storage
        *   `[✅]`   Test: `seed_prompt` branch downloads content from storage
        *   `[✅]`   Test: `project_resource` branch downloads content from storage
        *   `[✅]`   Test: `header_context` branch downloads content from storage
        *   `[✅]`   Test: required input with failed storage download throws — does NOT fall back to empty string
        *   `[✅]`   Test: optional input with failed storage download skips — does NOT throw
    *   `[✅]`   `executeModelCallAndSave.ts`
        *   `[✅]`   Replace content extraction from non-existent column with storage download in `document` branch (line 289)
        *   `[✅]`   Replace content extraction in `feedback` branch (line 337)
        *   `[✅]`   Replace content extraction in `seed_prompt` branch (line 369)
        *   `[✅]`   Replace content extraction in `project_resource` branch (line 403)
        *   `[✅]`   Replace content extraction in `header_context` / fallback branch (line 440)
        *   `[✅]`   Wire `downloadFromStorage` dependency into `gatherArtifacts` scope
    *   `[✅]`   integration/`executeModelCallAndSave.document.integration.test.ts`
        *   `[✅]`   Test: capture the `ChatApiRequest` emitted by `executeModelCallAndSave` and assert that `resourceDocuments` array contains entries with non-empty `content` strings matching the storage file content
        *   `[✅]`   Test: for a job with `inputs_required` containing a `document` rule, the `resourceDocuments` in the ChatAPI request contain the rendered document content from storage — not empty strings
    *   `[✅]`   `requirements.md`
        *   `[✅]`   No `gatherArtifacts` branch may read a `content` column from database rows — all content must come from Supabase Storage download
        *   `[✅]`   No empty-string fallback for content — download succeeds or the function throws (for required) or skips (for optional)
        *   `[✅]`   The ChatAPI request `resourceDocuments` must contain actual document content
        *   `[✅]`   All existing unit and integration tests must pass after changes
    *   `[✅]`   **Commit** `fix(be): gatherArtifacts downloads content from Supabase Storage instead of reading non-existent content column`
        *   `[✅]`   `executeModelCallAndSave.ts`: replaced empty-string content fallback with storage download in all 5 branches of `gatherArtifacts`
        *   `[✅]`   `executeModelCallAndSave.gatherArtifacts.test.ts`: added/updated tests proving storage download for each branch
        *   `[✅]`   `executeModelCallAndSave.document.integration.test.ts`: added integration test proving ChatAPI `resourceDocuments` contains real content

*   `[✅]`   [PROMPT] docs/prompts/ **Remove dot-notation document content placeholders from all planner prompt templates so documents are delivered exclusively via resourceDocuments**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Remove `{{dot.notation}}` placeholders that inline full document content (e.g., `{{thesis_documents.business_case}}`, `{{synthesis_documents.synthesis_document_business_case}}`) from every planner prompt template
        *   `[✅]`   Retain all non-document template variables (`{{seed_prompt}}`, `{{role}}`, `{{stage_instructions}}`, `{{style_guide_markdown}}`, `{{outputs_required}}`, `{{context_for_documents}}`)
        *   `[✅]`   The prompt renderer will skip sections whose variables are absent — removing the placeholders from templates is sufficient; no code change to `assemblePlannerPrompt` is required
    *   `[✅]`   `role.md`
        *   `[✅]`   Prompt template content — defines what the planner AI sees as its instructions
        *   `[✅]`   After this change, source documents are delivered solely via `resourceDocuments` in the ChatAPI request (Fix 1)
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: all 6 planner prompt templates in `docs/prompts/`
        *   `[✅]`   `docs/prompts/thesis/thesis_planner_header_v1.md`
        *   `[✅]`   `docs/prompts/antithesis/antithesis_planner_review_v1.md`
        *   `[✅]`   `docs/prompts/synthesis/synthesis_pairwise_header_planner_v1.md`
        *   `[✅]`   `docs/prompts/synthesis/synthesis_final_header_planner_v1.md`
        *   `[✅]`   `docs/prompts/parenthesis/parenthesis_planner_header_v1.md`
        *   `[✅]`   `docs/prompts/paralysis/paralysis_planner_header_v1.md`
    *   `[✅]`   `deps.md`
        *   `[✅]`   Fix 1 must be complete and proven — `resourceDocuments` must be populated before removing document inlining from prompts
        *   `[✅]`   `renderPrompt` from `supabase/functions/_shared/prompt-renderer.ts` — must be verified to silently skip unresolved placeholders (no error on missing variables)
    *   `[✅]`   Each prompt template
        *   `[✅]`   Remove the `## Inputs` sections (or portions of them) that use `{{dot.notation}}` content placeholders for source documents
        *   `[✅]`   Retain `## Inputs` sections for non-document variables (seed_prompt, role, stage_instructions, etc.)
        *   `[✅]`   Retain the `## HeaderContext Schema` / JSON schema sections unchanged
        *   `[✅]`   Retain `{{context_for_documents}}` placeholder unchanged
    *   `[✅]`   integration/`executeModelCallAndSave.document.integration.test.ts` (extend from Fix 1)
        *   `[✅]`   Test: for a PLAN recipe step's EXECUTE child job, the assembled planner prompt text does NOT contain the rendered document content (no duplication)
        *   `[✅]`   Test: for that same job, the ChatAPI request `resourceDocuments` DOES contain the rendered document content (delivery via resourceDocuments)
    *   `[✅]`   `requirements.md`
        *   `[✅]`   No planner prompt template may contain `{{dot.notation}}` placeholders that resolve to full document content
        *   `[✅]`   All non-document template variables must still render correctly
        *   `[✅]`   The planner AI must receive documents via `resourceDocuments` — validated by Fix 1 integration test
        *   `[✅]`   The `assemblePlannerPrompt` code path that builds `sourceDocVars` (lines 260-309) becomes inert — the templates no longer contain matching placeholders, so no content is substituted. No code change required to `assemblePlannerPrompt.ts`.
        *   `[✅]`   Existing `assemblePlannerPrompt` integration tests must be updated to reflect the new template behavior (prompts no longer contain inlined document content)
    *   `[✅]`   **Commit** `refactor(prompt): remove document content inlining from planner templates; documents delivered via resourceDocuments`
        *   `[✅]`   All 6 planner prompt templates: removed `{{dot.notation}}` document content placeholders
        *   `[✅]`   Integration test: proves planner prompt does not contain document content AND ChatAPI resourceDocuments does contain document content

*   `[✅]` _shared/utils/jsonSanitizer **Add duplicate-key deduplication via `jsonc-parser` AST before any `JSON.parse()` call**
    *   `[✅]` `objective.md`
        *   `[✅]` AI models producing long complex JSON frequently re-emit keys — content-bearing value first, empty placeholder value second in the same object
        *   `[✅]` Standard `JSON.parse()` silently resolves duplicates via last-value-wins, destroying the content-bearing first occurrence
        *   `[✅]` `sanitizeJsonContent` currently calls `JSON.parse()` nine times internally (lines 71, 83, 90, 99, 107, 115, 123, 140, 152) for structural validation; any of these silently drops duplicate keys before consumers see the data
        *   `[✅]` Observed failure: Gemini 2.5 Flash produced a header context where keys like `subsystems`, `feature_scope`, `guardrails`, `feasibility_insights` appeared twice — first with content, then with empty `[]`/`""` — causing `JSON.parse()` to keep the empties, producing an empty rendered document and cascading job failures
        *   `[✅]` The fix must parse the raw string with `jsonc-parser`'s `parseTree` (which preserves duplicate keys in its AST) and reconstruct the object with deterministic merge semantics, BEFORE any `JSON.parse()` call
        *   `[✅]` Merge semantics: one empty + one populated → keep populated; both populated objects → deep merge recursively; both populated arrays → concatenate; both populated primitives → keep first; both empty → keep first
        *   `[✅]` The deduplication is fail-safe: if `parseTree` returns null, the original string passes through unchanged to existing logic
    *   `[✅]` `role.md`
        *   `[✅]` Domain utility — JSON sanitization and normalization of AI model output before any downstream parsing or processing
    *   `[✅]` `module.md`
        *   `[✅]` Extends the existing `sanitizeJsonContent` function with a pre-parse deduplication step
        *   `[✅]` All new functions are module-private helpers serving `sanitizeJsonContent`; the module's exported surface does not change
        *   `[✅]` Deduplication runs after text cleanup (backtick removal, quote removal, whitespace trimming at steps 1–4) but before the structural-fix block (step 5) where all nine `JSON.parse()` calls live
    *   `[✅]` `deps.md`
        *   `[✅]` NEW: `jsonc-parser@3.2.0` via `https://esm.sh/jsonc-parser@3.2.0` — Microsoft's tolerant JSON parser used in VS Code; `parseTree` returns an AST that preserves duplicate keys; `Node` type for AST node traversal; zero transitive dependencies, ~15KB minified, battle-tested
        *   `[✅]` EXISTING: `JsonSanitizationResult` from `_shared/types/jsonSanitizer.interface.ts`
    *   `[✅]` _shared/types/`jsonSanitizer.interface.ts`
        *   `[✅]` Add field `hasDuplicateKeys: boolean` — flag indicating duplicate keys were detected and resolved
        *   `[✅]` Add field `duplicateKeysResolved: string[]` — unique key names that were found duplicated and merged (deduplicated via `Set`), for diagnostic logging by callers
    *   `[✅]` _shared/utils/type-guards/`type_guards.jsonSanitizer.test.ts`
        *   `[✅]` Test: result object with `hasDuplicateKeys: true` and `duplicateKeysResolved: ['subsystems']` passes the type guard
        *   `[✅]` Test: result object with `hasDuplicateKeys: false` and `duplicateKeysResolved: []` passes the type guard
        *   `[✅]` Test: result object missing `hasDuplicateKeys` field fails the type guard
        *   `[✅]` Test: result object where `duplicateKeysResolved` is not an array fails the type guard
    *   `[✅]` _shared/utils/type-guards/`type_guards.jsonSanitizer.ts`
        *   `[✅]` Update `isJsonSanitizationResult` to validate `hasDuplicateKeys` is boolean and `duplicateKeysResolved` is an array of strings
    *   `[✅]` _shared/utils/`jsonSanitizer.test.ts`
        *   `[✅]` Test: valid JSON with no duplicate keys — passes through unchanged, `hasDuplicateKeys` is `false`, `duplicateKeysResolved` is `[]`
        *   `[✅]` Test: duplicate key, first has content array, second is empty `[]` — result keeps the content array, `hasDuplicateKeys` is `true`, key name in `duplicateKeysResolved`
        *   `[✅]` Test: duplicate key, first is empty `""`, second has content string — result keeps the content string
        *   `[✅]` Test: duplicate key, first is empty `{}`, second has populated object — result keeps the populated object
        *   `[✅]` Test: duplicate key, both populated objects — result is deep-merged object containing keys from both instances
        *   `[✅]` Test: duplicate key, both populated arrays — result is concatenated array
        *   `[✅]` Test: duplicate key, both populated primitives — result keeps first value
        *   `[✅]` Test: deeply nested duplicate keys (inside `context_for_documents[0].content_to_include`) — deduplication applies recursively at all nesting levels
        *   `[✅]` Test: mirrors the real failure — header context structure with `"subsystems": [{...}]` then `"subsystems": []` later in same object — content array survives
        *   `[✅]` Test: unparseable/invalid JSON — deduplication step fails gracefully (returns original string), `hasDuplicateKeys` is `false`, existing sanitization logic proceeds unchanged
        *   `[✅]` Test: JSON wrapped in backticks with duplicate keys — backtick removal runs first (steps 1–3), then deduplication resolves duplicates, verifying correct step ordering
        *   `[✅]` Test: all existing tests continue to pass — no regression in backtick removal, quote removal, trimming, or structural-fix behavior
    *   `[✅]` _shared/utils/`jsonSanitizer.ts`
        *   `[✅]` Import `parseTree` and `Node as JsonNode` from `https://esm.sh/jsonc-parser@3.2.0`
        *   `[✅]` Add module-private `isEmpty(value)` — returns `true` for `null`, `""`, `[]` (length 0), `{}` (no own keys)
        *   `[✅]` Add module-private `isPlainObject(v)` — returns `true` for non-null, non-array objects
        *   `[✅]` Add module-private `mergeValues(a, b)` — if one `isEmpty` return the other; both arrays → `[...a, ...b]`; both plain objects → spread `a`, iterate `b` keys, recurse `mergeValues` on shared keys; otherwise return `a`
        *   `[✅]` Add module-private `buildNode(node: JsonNode, duplicatesFound: Set<string>)` — switch on `node.type`: `"object"` → iterate `node.children`, extract key from `prop.children[0].value`, value from recursive `buildNode(prop.children[1])`, if `key in result` add key to `duplicatesFound` (`Set.add` — idempotent, prevents noisy duplicate entries when a key appears 3+ times or the same key name duplicates at multiple nesting levels) and call `mergeValues(result[key], value)`, else set `result[key] = value`; `"array"` → map children through `buildNode`; default → return `node.value`
        *   `[✅]` Add module-private `deduplicateJsonKeys(raw: string)` → initializes `const duplicatesFound = new Set<string>()`; calls `parseTree(raw)`, if root is null returns `{ deduplicated: raw, hasDuplicateKeys: false, duplicateKeysResolved: [] }`; otherwise calls `buildNode(root, duplicatesFound)`, returns `{ deduplicated: JSON.stringify(result, null, 2), hasDuplicateKeys: duplicatesFound.size > 0, duplicateKeysResolved: [...duplicatesFound] }`; note: `JSON.stringify` with indent normalizes formatting — this is acceptable because Step 5 re-parses the string anyway
        *   `[✅]` Modify `sanitizeJsonContent`: insert call to `deduplicateJsonKeys(sanitized)` AFTER Step 4 (whitespace trimming, line 63) and BEFORE Step 5 (structural fixes, line 66) — if `hasDuplicateKeys`, replace `sanitized` with deduplicated string and set `wasSanitized = true`; carry `hasDuplicateKeys` and `duplicateKeysResolved` through to the final `JsonSanitizationResult`
        *   `[✅]` All nine existing `JSON.parse()` calls in the structural-fix block now operate on already-deduplicated content
    *   `[✅]` integration/`prompt_assembler.integration.test.ts` — **duplicate-key deduplication end-to-end proof**
        *   `[✅]` File: `supabase/integration_tests/prompt_assembler.integration.test.ts` — add new `it()` case inside the existing `describe('assembleTurnPrompt')` block; reuses harness `beforeAll` setup (`adminClient`, `testUser`, `session`, `project`, `testDeps`, `fileManager`, `jwt`); uses `stageSlug = 'parenthesis'`
        *   `[✅]` Delete: `supabase/integration_tests/services/jsonSanitizer.integration.test.ts` — the existing test is invalid (wrong context construction, vacuous assertions, never exercises actual call stack)
        *   `[✅]` Input artifact: read raw flawed JSON from `example/google-gemini-2.5-flash_0_0742819d_header_context.json` via `Deno.readTextFile` — this is the ACTUAL raw AI response string containing duplicate keys; it MUST NOT be `JSON.parse`d or re-serialized before injection because the raw string itself IS the bug
        *   `[✅]` Prerequisite: `seed_prompt_templates.ts` has been run as part of standard dev environment setup, so the template `docs/prompts/parenthesis/parenthesis_technical_requirements_turn_v1.md` already exists in the `prompt-templates` Supabase Storage bucket — `assembleTurnPrompt` will call `downloadFromStorage` to retrieve it via the `document_template_id` reference (migration `20251006194558`, line 86: `prompt_text = null`)
        *   `[✅]` Step 1 — Negative control: `JSON.parse(rawFlawedJson)`, navigate to `context_for_documents` entry where `document_key === "technical_requirements"`, assert `content_to_include.subsystems` is `[]`, `content_to_include.feature_scope` is `[]`, `content_to_include.guardrails` is `[]` — proves the raw file genuinely exhibits `JSON.parse` last-value-wins data destruction
        *   `[✅]` Step 2 — Store flawed HeaderContext via actual `executeModelCallAndSave`: construct deps with `callUnifiedAIModel: async () => ({ content: rawFlawedJson, finish_reason: 'stop', ... })` (same pattern as existing test lines 926–962); create EXECUTE job row with `output_type: FileType.HeaderContext`, `document_key: FileType.HeaderContext` (same pattern as lines 851–902); call actual `executeModelCallAndSave` (same pattern as lines 964–976) — this is the entry point where `sanitizeJsonContent` runs, deduplicating duplicate keys via `jsonc-parser` AST before storage
        *   `[✅]` Step 3 — Fetch stored contribution: query `dialectic_contributions` by session/stage/iteration (same pattern as lines 980–995); assert contribution exists
        *   `[✅]` Step 4 — Consume HeaderContext via actual `processSimpleJob`: create EXECUTE job row with `inputs: { header_context_id: contribution.id }`, `document_key: "technical_requirements"` (same pattern as lines 1001–1068); construct deps with `executeModelCallAndSave` overridden to capture `params.promptConstructionPayload.currentUserPrompt` (the rendered prompt) and return without calling AI; call actual `processSimpleJob` (same pattern as lines 1070–1094) — this internally calls `ctx.promptAssembler.assemble()` → `assembleTurnPrompt` which: retrieves the stored HeaderContext from Supabase Storage, `JSON.parse`s it (now clean), extracts `content_to_include` for `document_key === "technical_requirements"`, builds `mergedContext`, downloads template from `prompt-templates` bucket, calls `render` → `renderPrompt`
        *   `[✅]` Assert: captured rendered prompt contains `"Frontend User Interface"` (a known subsystem name surviving deduplication); does NOT contain `"subsystems":[]` (the empty placeholder `JSON.parse()` alone would have preserved); contains the template's static text `"In this turn you are defining the technical requirements"`
        *   `[✅]` Step 5 — Write output file: write captured rendered prompt to `example/integration_test_rendered_technical_requirements_prompt.md` via `Deno.writeTextFile` — ACTUAL FILE OUTPUT artifact
        *   `[✅]` Call stack exercised: raw AI response → `executeModelCallAndSave` → `sanitizeJsonContent` (AST deduplication) → `JSON.parse` (clean) → Supabase Storage → `processSimpleJob` → `assembleTurnPrompt` → `downloadFromStorage` (template) → `JSON.parse` (HeaderContext) → `content_to_include` extraction → context merge → `render` → `renderPrompt` → rendered prompt with populated data
        *   `[✅]` Only I/O is mocked: `callUnifiedAIModel` in Step 2 (returns raw flawed JSON), `executeModelCallAndSave` in Step 4 (captures rendered prompt); all business logic uses ACTUAL application functions via the ACTUAL DI graph
    *   `[✅]` `requirements.md`
        *   `[✅]` Duplicate keys in AI model JSON output are detected and resolved before any `JSON.parse()` call within the sanitizer
        *   `[✅]` Content-bearing values are never silently overwritten by empty placeholder duplicates
        *   `[✅]` Deduplication is fail-safe: unparseable input passes through unchanged to existing sanitization logic
        *   `[✅]` `JsonSanitizationResult` reports whether deduplication occurred and which keys were affected, enabling diagnostic logging by `executeModelCallAndSave` and other callers
        *   `[✅]` Existing sanitization behavior (backtick removal, quote removal, trimming, structural fixes) is completely unchanged
        *   `[✅]` All existing tests continue to pass with no regression
    *   `[✅]` **Commit** `fix(_shared): add duplicate-key deduplication to jsonSanitizer using jsonc-parser AST`
        *   `[✅]` Added `jsonc-parser@3.2.0` dependency for AST-preserving JSON parse
        *   `[✅]` Added `isEmpty`, `isPlainObject`, `mergeValues`, `buildNode`, `deduplicateJsonKeys` as module-private helpers in `jsonSanitizer.ts`
        *   `[✅]` Inserted deduplication step between text cleanup and structural fixes in `sanitizeJsonContent`
        *   `[✅]` Extended `JsonSanitizationResult` with `hasDuplicateKeys` and `duplicateKeysResolved` fields
        *   `[✅]` Updated `isJsonSanitizationResult` type guard and its tests for new fields
        *   `[✅]` Added test coverage for all duplicate-key scenarios including regression from real Gemini 2.5 Flash failure

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

    - Set baseline values for each stage "Generate" action and encourage users to top up their account if they are at risk of NSF
    -- Pause the work mid-stream if NSF and encourage user to top up to continue 

    - hydrateAllStages doesn't, but the stage-specific one does

    - New user sign in banner doesn't display, throws console error  
    -- Chase, diagnose, fix 

   - Generating spinner stays present until page refresh 
   -- Needs to react to actual progress 
   -- Stop the spinner when a condition changes 

   - Checklist does not correctly find documents when multiple agents are chosen 

   - Refactor EMCAS to break apart the functions, segment out the tests
   -- Move gatherArtifacts call to processSimpleJob
   -- Decide where to measure & RAG

   - Switch to stream-to-buffer instead of chunking
   -- This lets us render the buffer in real time to show document progress 

   - Build test fixtures for major function groups 
   -- Provide standard mock factories and objects 

   - Show exact job progress in front end as pop up while working, then minimize to documents once documents arrive 