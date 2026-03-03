[ ] // So that find->replace will stop unrolling my damned instructions! 

# **DAG Progress Computation — Prelaunch Fixes**

## Problem Statement

The system provides no method to detect when a user has insufficient funds for the next set of work, pause the work, notify the user so they can correct the NSF condition, and resume the work after correction.

## Objectives

1. Identify when a user has NSF for a set of work. 
2. Refuse to permit the user to engage new work in the NSF condition.
3. Detect the NSF condition and pause existing work.
4. Notify the user of the condition and the work pause.
5. Detect when the user has resolved NSF. 
6. Permit the user to resume from the paused state without losing any already-performed work. 
7. The back end and front end are fully aware of the NSF state
8. The progress tracking functions correctly report NSF and resume progress tracking when NSF is resolved. 

## Expected Outcome

A user cannot begin a set of work when they have NSF. If a user reaches NSF while work is being performed, it is automatically paused and the user notified. After the user corrects the NSF condition, the work can be continued from its prior state without any loss of progress. The front end is fully state aware through the entire NSF discovery-to-resume flow. 

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## NSF Protection: UX Balance Gate + Backend Pause/Resume

### Node 1
*   `[✅]`   [DB] supabase/migrations **`paused_nsf` job status, trigger exclusions, and `resume_paused_nsf_jobs` RPC**
  *   `[✅]`   `objective`
    *   `[✅]`   Introduce the `paused_nsf` job status to the database schema so that jobs encountering an "Insufficient funds" error can be paused instead of failed
    *   `[✅]`   Ensure `paused_nsf` is NOT treated as a terminal status by `handle_job_completion()`, so parent PLAN jobs remain in `waiting_for_children` and do not cascade-fail
    *   `[✅]`   Ensure `paused_nsf` does NOT appear in the `on_job_status_change` or `on_new_job_created` trigger WHEN clauses, so the dialectic-worker is NOT invoked for paused jobs
    *   `[✅]`   Provide an RPC function `resume_paused_nsf_jobs` that restores each paused job's `original_status` from its `error_details` JSON, enabling the DAG to continue from its prior state
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — database schema and trigger layer
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic generation job state machine — extends the status enum and modifies trigger functions that govern job lifecycle transitions
    *   `[✅]`   Boundary: defines the `paused_nsf` status semantics and the atomic resume operation
  *   `[✅]`   `deps`
    *   `[✅]`   `handle_job_completion()` function (defined in `supabase/migrations/20260109165706_state_machine_fix.sql` line 180) — must be verified/modified to exclude `paused_nsf` from terminal status evaluation
    *   `[✅]`   `on_job_status_change` trigger (defined in `supabase/migrations/20260109165706_state_machine_fix.sql` line 165) — WHEN clause currently fires for `('pending', 'pending_next_step', 'pending_continuation', 'retrying', 'processing')` — must NOT include `paused_nsf`
    *   `[✅]`   `on_new_job_created` trigger (defined in `supabase/migrations/20260220213950_conditional_on_new_job_created.sql` line 15) — WHEN clause currently fires for `('pending', 'pending_continuation')` — must NOT include `paused_nsf`
    *   `[✅]`   `dialectic_generation_jobs` table columns: `id`, `status`, `error_details` (JSONB), `session_id`, `stage_slug`, `iteration_number`, `parent_job_id`, `job_type`
    *   `[✅]`   No reverse dependency introduced — this migration only extends existing infrastructure
  *   `[✅]`   `context_slice`
    *   `[✅]`   Requires access to `dialectic_generation_jobs` table schema
    *   `[✅]`   Requires understanding of the `error_details` JSONB convention — Node 2 (`pauseJobsForNsf`) will store `{ "original_status": "<status>", "nsf_paused": true }` in this column when pausing each job
    *   `[✅]`   Requires understanding of the worker claim query — the worker atomically claims jobs by `UPDATE ... SET status = 'processing' WHERE status IN ('pending', 'pending_next_step', 'pending_continuation', 'retrying')` — restoring a paused job to `processing` would create a dead state because the claim query won't match it
  *   `[✅]`   migration/`YYYYMMDDHHMMSS_nsf_pause_resume.sql`
    *   `[✅]`   **`handle_job_completion()` verification**: The terminal status check on line 204 (`IF NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed')`) already excludes `paused_nsf` by omission. The sibling-counting query on line 241 (`COUNT(*) FILTER (WHERE status IN ('completed', 'failed', 'retry_loop_failed'))`) counts terminal siblings — `paused_nsf` is NOT in this list, so a paused sibling prevents the "all siblings terminal" condition. **This is correct behavior** — the parent PLAN stays in `waiting_for_children` until paused jobs resume and reach a true terminal state. Add a SQL comment documenting that `paused_nsf` is intentionally non-terminal.
    *   `[✅]`   **`on_job_status_change` trigger verification**: Confirm the WHEN clause does NOT include `paused_nsf` (it currently doesn't). Add a SQL comment documenting the intentional exclusion.
    *   `[✅]`   **`on_new_job_created` trigger verification**: Confirm the WHEN clause does NOT include `paused_nsf` (it currently doesn't). Add a SQL comment documenting the intentional exclusion.
    *   `[✅]`   **`paused_nsf` status validity**: Verify whether the `status` column has a CHECK constraint or enum. If constrained, add `paused_nsf` to the allowed values. If unconstrained TEXT, no schema change needed — document assumption.
    *   `[✅]`   **`resume_paused_nsf_jobs` RPC function**: Create a `SECURITY DEFINER` function accepting `p_session_id UUID`, `p_stage_slug TEXT`, `p_iteration_number INTEGER`:
      *   `[✅]`   **Ownership check**: Before performing the update, verify the calling user owns the session by joining `dialectic_generation_jobs` → `dialectic_sessions` → `dialectic_projects` → `user_id = auth.uid()`. If not, raise an exception.
      *   `[✅]`   **Atomic resume update**: `UPDATE dialectic_generation_jobs SET status = CASE WHEN (error_details->>'original_status') = 'processing' THEN 'pending' ELSE (error_details->>'original_status') END, error_details = error_details - 'original_status' - 'nsf_paused' WHERE session_id = p_session_id AND stage_slug = p_stage_slug AND iteration_number = p_iteration_number AND status = 'paused_nsf'`
      *   `[✅]`   **`processing → pending` mapping rationale**: The original job was mid-execution when NSF hit; restoring to `processing` creates a dead state because the worker's atomic claim query only matches `pending`/`pending_next_step`/`pending_continuation`/`retrying`. Restoring to `pending` allows the worker to re-claim and reprocess.
      *   `[✅]`   All other `original_status` values (`pending`, `pending_continuation`, `pending_next_step`, `retrying`) are restored as-is; `on_job_status_change` fires naturally for these statuses and re-invokes the worker.
      *   `[✅]`   Return the count of affected rows as `INTEGER`.
    *   `[✅]`   **RLS grant**: `GRANT EXECUTE ON FUNCTION resume_paused_nsf_jobs TO authenticated`
  *   `[✅]`   `requirements`
    *   `[✅]`   `paused_nsf` must be a valid job status value in the database
    *   `[✅]`   `handle_job_completion()` must NOT count `paused_nsf` as terminal — parent PLAN jobs must remain in `waiting_for_children` when any child is paused
    *   `[✅]`   No trigger must invoke the dialectic-worker for `paused_nsf` transitions
    *   `[✅]`   `resume_paused_nsf_jobs` must atomically restore all paused jobs for a given session+stage+iteration, mapping `processing` → `pending` and all others to their stored `original_status`
    *   `[✅]`   `resume_paused_nsf_jobs` must enforce row-level ownership — only the project owner can resume their own jobs
    *   `[✅]`   After resume, the restored statuses must cause `on_job_status_change` to fire for actionable statuses (`pending`, `pending_continuation`, `pending_next_step`, `retrying`), naturally re-invoking the worker
    *   `[✅]`   Passive wait statuses (`waiting_for_children`, `waiting_for_prerequisite`) are never set to `paused_nsf` by the backend (Node 2) so the resume function will never encounter them — document this assumption in the RPC

### Node 2
*   `[✅]`   [BE] supabase/functions/_shared/utils/`notificationService` **Add `sendContributionGenerationPausedNsfEvent` method to NotificationService for NSF pause lifecycle event**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a `ContributionGenerationPausedNsfPayload` type to the backend notification type system so the NSF pause event has a typed payload matching the existing contribution lifecycle pattern
    *   `[✅]`   Add a `sendContributionGenerationPausedNsfEvent` method to the `NotificationServiceType` interface and `NotificationService` class so that `pauseJobsForNsf` (Node 3) can emit a single internal lifecycle notification
    *   `[✅]`   Add the new payload to the backend `DialecticLifecycleEvent` union in `notification.service.types.ts`
    *   `[✅]`   Update the mock to include the new spy and a mock payload object
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — notification service type system and implementation
  *   `[✅]`   `module`
    *   `[✅]`   Notification service — extends the existing per-event-type method pattern used by all 9 existing methods on `NotificationServiceType`
    *   `[✅]`   Boundary: defines the `contribution_generation_paused_nsf` event type, payload shape, and send method
  *   `[✅]`   `deps`
    *   `[✅]`   `RpcNotification<T>` generic — already defined in `notification.service.types.ts` line 15 — used by `_sendNotification` to format the RPC call
    *   `[✅]`   `supabase.rpc('create_notification_for_user', ...)` — existing infrastructure, no change
    *   `[✅]`   No new external dependencies introduced
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `_sendNotification<T>(notification: RpcNotification<T>)` — private method already in `NotificationService`, used by all event methods
    *   `[✅]`   Injection shape: `NotificationServiceType` interface — the new method is added to this existing interface
    *   `[✅]`   Confirm no concrete imports from higher or lateral layers
  *   `[✅]`   interface/`notification.service.types.ts`
    *   `[✅]`   `ContributionGenerationPausedNsfPayload` — `{ type: 'contribution_generation_paused_nsf'; sessionId: string; projectId: string; stageSlug: string; iterationNumber: number }` — follows existing payload naming pattern (`ContributionGeneration*Payload`) and field pattern (`sessionId`, `projectId`, `stageSlug` match `ContributionGenerationFailedPayload`)
    *   `[✅]`   Add `ContributionGenerationPausedNsfPayload` to the `DialecticLifecycleEvent` union (line 110)
    *   `[✅]`   Add `sendContributionGenerationPausedNsfEvent(payload: ContributionGenerationPausedNsfPayload, targetUserId: string): Promise<void>` to `NotificationServiceType` interface (line 3)
  *   `[✅]`   unit/`notification.service.test.ts`
    *   `[✅]`   Test: `sendContributionGenerationPausedNsfEvent` calls `supabase.rpc('create_notification_for_user')` with `p_notification_type: 'contribution_generation_paused_nsf'`, `p_is_internal_event: true`, and `p_notification_data` matching the payload — follows the existing test pattern (e.g., lines 34–56 for `contribution_generation_started`)
    *   `[✅]`   Test: verify the `notification_data` contains `sessionId`, `projectId`, `stageSlug`, `iterationNumber`
  *   `[✅]`   `construction`
    *   `[✅]`   No new classes or factories — the method is added to the existing `NotificationService` class
    *   `[✅]`   The method follows the exact same pattern as `sendContributionGenerationCompleteEvent` (lines 118–128): calls `_sendNotification` with `is_internal_event: true` and the literal notification type string
  *   `[✅]`   `notification.service.ts`
    *   `[✅]`   Add import of `ContributionGenerationPausedNsfPayload` from `../types/notification.service.types.ts` (add to existing import block, line 4)
    *   `[✅]`   Add method `sendContributionGenerationPausedNsfEvent(payload: ContributionGenerationPausedNsfPayload, targetUserId: string): Promise<void>` — calls `this._sendNotification({ target_user_id: targetUserId, notification_type: 'contribution_generation_paused_nsf', is_internal_event: true, notification_data: payload })`
  *   `[✅]`   `notification.service.mock.ts`
    *   `[✅]`   Add `ContributionGenerationPausedNsfPayload` to the import block (line 2)
    *   `[✅]`   Add `sendContributionGenerationPausedNsfEvent: spy(() => Promise.resolve())` to `createMockService()` (line 22, alongside existing 9 spies)
    *   `[✅]`   Add `mockContributionGenerationPausedNsfPayload: ContributionGenerationPausedNsfPayload` — `{ type: 'contribution_generation_paused_nsf', sessionId: 'session-uuid-456', projectId: 'project-uuid-abc', stageSlug: 'antithesis', iterationNumber: 1 }` — follows existing mock payload pattern
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: infrastructure (notification service)
    *   `[✅]`   Dependencies face inward: depends only on Supabase client (infra)
    *   `[✅]`   Provides face outward: consumed by `pauseJobsForNsf` (Node 3) via `NotificationServiceType` interface
  *   `[✅]`   `requirements`
    *   `[✅]`   `ContributionGenerationPausedNsfPayload` must follow the existing naming pattern and include `type`, `sessionId`, `projectId`, `stageSlug`, `iterationNumber`
    *   `[✅]`   `sendContributionGenerationPausedNsfEvent` must send an internal event (`is_internal_event: true`) so the frontend notification store routes it through the lifecycle event pipeline
    *   `[✅]`   The mock must include the new spy so downstream tests (Node 3) can verify notification calls
    *   `[✅]`   All existing notification service tests must continue to pass

### Node 3
*   `[✅]`   [BE] supabase/functions/dialectic-worker/`pauseJobsForNsf` **Pause failing job and active siblings with original-status preservation and single NSF notification**
  *   `[✅]`   `objective`
    *   `[✅]`   When an EXECUTE job throws "Insufficient funds", pause that job and all active siblings for the same stage/iteration, preserving each job's original status in `error_details` so the DAG can resume from its prior state
    *   `[✅]`   Send exactly ONE `contribution_generation_paused_nsf` notification per pause event — not per job — to avoid flooding the user with duplicate alerts
  *   `[✅]`   `role`
    *   `[✅]`   Backend / adapter — translates an NSF error into a coordinated pause across related jobs and a single user notification
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic worker — NSF error handling within the job execution pipeline
    *   `[✅]`   Boundary: receives a failing job ID + context, performs batch DB updates, sends one notification
  *   `[✅]`   `deps`
    *   `[✅]`   Node 1 (migration) — `paused_nsf` must be a valid status value and `handle_job_completion` must treat it as non-terminal
    *   `[✅]`   Node 2 (notification service) — `NotificationServiceType` must include `sendContributionGenerationPausedNsfEvent` method and `ContributionGenerationPausedNsfPayload` type must exist in `_shared/types/notification.service.types.ts`
    *   `[✅]`   `adminClient` (Supabase admin client) — adapter/infra — used for batch-updating job statuses; injected via function parameter
    *   `[✅]`   `notificationService: NotificationServiceType` — adapter — injected via `deps` parameter from `handleJob`; the `sendContributionGenerationPausedNsfEvent` method (added in Node 2) is used to send the single NSF notification
    *   `[✅]`   `logger` — infra — injected via `deps` parameter
    *   `[✅]`   No reverse dependency — this function is consumed by `index.ts` (Node 4) and depends only on infrastructure
  *   `[✅]`   `context_slice`
    *   `[✅]`   `adminClient`: `SupabaseClient` (Supabase admin, cast exception per Instructions §5)
    *   `[✅]`   `notificationService`: `NotificationServiceType` from `_shared/types/notification.service.types.ts` — provides `sendContributionGenerationPausedNsfEvent`
    *   `[✅]`   `logger`: logger interface (match existing pattern in `index.ts`)
    *   `[✅]`   No concrete imports from higher layers
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   `PauseJobsForNsfParams` — typed parameter object: `{ failingJobId: string, sessionId: string, stageSlug: string, iterationNumber: number, projectId: string, projectOwnerUserId: string }`
    *   `[✅]`   `PauseJobsForNsfDeps` — typed dependency object: `{ adminClient: SupabaseClient, notificationService: NotificationServiceType, logger: <LoggerInterface> }` — uses the existing `NotificationServiceType` interface which already includes the new method after Node 2
  *   `[✅]`   interface/tests/`pauseJobsForNsf.interface.test.ts`
    *   `[✅]`   Contract: `PauseJobsForNsfParams` requires all six fields — `failingJobId`, `sessionId`, `stageSlug`, `iterationNumber`, `projectId`, `projectOwnerUserId` — to be present and correctly typed (strings non-empty, `iterationNumber` non-negative integer)
  *   `[✅]`   interface/guards/`pauseJobsForNsf.interface.guards.ts`
    *   `[✅]`   Guard for `PauseJobsForNsfParams` — validates all required fields present and correctly typed
  *   `[✅]`   unit/`pauseJobsForNsf.test.ts`
    *   `[✅]`   Test: given a failing job ID, the function sets that job's status to `paused_nsf` with `error_details` containing `{ original_status: 'processing', nsf_paused: true }`
    *   `[✅]`   Test: given active sibling jobs (statuses: `pending`, `pending_continuation`, `retrying`), all are set to `paused_nsf` with their respective `original_status` preserved in `error_details`
    *   `[✅]`   Test: jobs in passive wait states (`waiting_for_children`, `waiting_for_prerequisite`) are NOT paused — they continue waiting naturally
    *   `[✅]`   Test: jobs already in terminal states (`completed`, `failed`, `retry_loop_failed`) are NOT paused
    *   `[✅]`   Test: jobs already in `paused_nsf` are NOT re-paused (idempotency)
    *   `[✅]`   Test: exactly ONE notification is sent regardless of how many jobs are paused — verify `notificationService.sendContributionGenerationPausedNsfEvent` is called exactly once
    *   `[✅]`   Test: the notification is called with a `ContributionGenerationPausedNsfPayload` containing correct `sessionId`, `projectId`, `stageSlug`, `iterationNumber`, and `targetUserId` matching `projectOwnerUserId`
    *   `[✅]`   Test: if no siblings exist (solo EXECUTE job), the function still pauses the failing job and sends one notification
  *   `[✅]`   `construction`
    *   `[✅]`   Single exported async function: `pauseJobsForNsf(deps: PauseJobsForNsfDeps, params: PauseJobsForNsfParams): Promise<void>`
    *   `[✅]`   Must not be constructed or called outside the `handleJob` catch block (Node 4)
    *   `[✅]`   All parameters must be fully populated at call site — no optional fields
  *   `[✅]`   `pauseJobsForNsf.ts`
    *   `[✅]`   Import `ContributionGenerationPausedNsfPayload` from `../_shared/types/notification.service.types.ts`
    *   `[✅]`   Import `PauseJobsForNsfDeps`, `PauseJobsForNsfParams` from the interface file where they are defined
    *   `[✅]`   Step 1 — Pause the failing job: `adminClient.from('dialectic_generation_jobs').update({ status: 'paused_nsf', error_details: { original_status: 'processing', nsf_paused: true } }).eq('id', params.failingJobId)`
    *   `[✅]`   Step 2 — Query and batch-pause active siblings: update all jobs matching `session_id = params.sessionId AND stage_slug = params.stageSlug AND iteration_number = params.iterationNumber AND id != params.failingJobId AND status NOT IN ('completed', 'failed', 'retry_loop_failed', 'paused_nsf', 'waiting_for_children', 'waiting_for_prerequisite')`. Each paused job must store its own current `status` as `original_status` in `error_details`. **Implementation note**: the Supabase JS client cannot reference the current column value dynamically in a SET clause; this requires either (a) querying siblings first, then batch-updating with individual `original_status` values, or (b) a raw SQL query via `adminClient.rpc()` or a dedicated SQL helper function
    *   `[✅]`   Step 3 — Send exactly one notification: `deps.notificationService.sendContributionGenerationPausedNsfEvent({ type: 'contribution_generation_paused_nsf', sessionId: params.sessionId, projectId: params.projectId, stageSlug: params.stageSlug, iterationNumber: params.iterationNumber }, params.projectOwnerUserId)`
    *   `[✅]`   Log the count of paused jobs (failing + siblings) at info level
  *   `[✅]`   integration/`pauseJobsForNsf.integration.test.ts`
    *   `[✅]`   Test: insert a parent PLAN job (`waiting_for_children`) with 5 EXECUTE children (statuses: 1 `processing`, 2 `pending`, 1 `completed`, 1 `waiting_for_prerequisite`). Call `pauseJobsForNsf` with the `processing` job as failing. Verify: 3 jobs paused (`processing` + 2 `pending`), each with correct `original_status` in `error_details`. `completed` job untouched. `waiting_for_prerequisite` job untouched. Parent PLAN (`waiting_for_children`) untouched.
    *   `[✅]`   Test: verify exactly one notification is sent (mock or spy on notification service)
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: adapter (backend edge function helper)
    *   `[✅]`   Dependencies face inward: depends on infra (`adminClient`, `logger`) and port (`NotificationServiceType` interface)
    *   `[✅]`   Provides face outward: consumed by `index.ts` `handleJob` catch block (Node 4)
  *   `[✅]`   `requirements`
    *   `[✅]`   The failing job must be set to `paused_nsf` with `original_status: 'processing'` preserved
    *   `[✅]`   All active siblings (non-terminal, non-passive-wait, not already `paused_nsf`) must be set to `paused_nsf` with their individual `original_status` preserved
    *   `[✅]`   Passive wait statuses (`waiting_for_children`, `waiting_for_prerequisite`) must NOT be paused — they continue waiting naturally and resolve when their dependencies resume and complete
    *   `[✅]`   Exactly one `contribution_generation_paused_nsf` notification must be sent per invocation via `deps.notificationService.sendContributionGenerationPausedNsfEvent`, regardless of how many jobs are paused
    *   `[✅]`   The notification must contain `sessionId`, `projectId`, `stageSlug`, `iterationNumber` so the frontend can identify the affected context

### Node 4
*   `[✅]`   [BE] supabase/functions/dialectic-worker/`index` **NSF detection branch in `handleJob` catch block routing to `pauseJobsForNsf`**
  *   `[✅]`   `objective`
    *   `[✅]`   Detect "Insufficient funds" errors in the `handleJob` catch block (lines 330–368) and route them to `pauseJobsForNsf` instead of the existing failure path, preventing cascade failures of the parent PLAN job and enabling user-driven resume
  *   `[✅]`   `role`
    *   `[✅]`   Backend / orchestrator — the top-level job execution handler that classifies errors and routes to appropriate handlers
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic worker entry point — error classification within the existing catch block
    *   `[✅]`   Boundary: detects NSF errors by message match, delegates to `pauseJobsForNsf`, preserves existing failure path for all other errors
  *   `[✅]`   `deps`
    *   `[✅]`   Node 3 (`pauseJobsForNsf.ts`) — must exist before this modification; imported as a local module
    *   `[✅]`   Existing `handleJob` function structure — the catch block at line 330 of `index.ts` is the modification target
    *   `[✅]`   All existing deps of `handleJob` (`adminClient`, `deps.notificationService`, `deps.logger`, `job`, `jobId`, `projectOwnerUserId`, `projectId`) are already available in the catch scope
    *   `[✅]`   No reverse dependency — this is a consumer of `pauseJobsForNsf`
  *   `[✅]`   `context_slice`
    *   `[✅]`   `pauseJobsForNsf` function: imported from `./pauseJobsForNsf.ts`
    *   `[✅]`   Existing variables in catch scope: `e` (caught error), `jobId`, `job` (with `.session_id`, `.stage_slug`, `.payload.iterationNumber`), `projectOwnerUserId`, `deps` (with `.notificationService`, `.logger`), `adminClient`, `projectId`
  *   `[✅]`   unit/`index.nsf-detection.test.ts` (new test file or extend existing)
    *   `[✅]`   Test: when `processJob` throws an error with message containing `'Insufficient funds'`, `pauseJobsForNsf` is called with correct parameters and the normal failure path (status → `failed`, failure notifications) is NOT executed
    *   `[✅]`   Test: when `processJob` throws an error with message NOT containing `'Insufficient funds'`, the existing failure path executes unchanged (status → `failed`, `contribution_generation_failed` + `other_generation_failed` notifications sent)
    *   `[✅]`   Test: when `processJob` throws `'Insufficient funds'` but `pauseJobsForNsf` itself throws, the error is logged at error level and the catch block falls through to the existing failure path as a safety net
  *   `[✅]`   `index.ts`
    *   `[✅]`   Add `import { pauseJobsForNsf } from './pauseJobsForNsf.ts';` at top of file (with existing imports)
    *   `[✅]`   In the catch block (line 330), BEFORE the existing failure handling (line 335+), insert an NSF detection branch:
      *   `[✅]`   Check `error.message.includes('Insufficient funds')` — this matches the exact error thrown at `executeModelCallAndSave.ts` line 536
      *   `[✅]`   If true: wrap `pauseJobsForNsf` call in its own try/catch. On success, `return` early — do NOT fall through to the failure path. On failure, log the pause error at error level and fall through to the existing failure path as a safety net.
      *   `[✅]`   Parameters to `pauseJobsForNsf`: `deps: { adminClient, notificationService: deps.notificationService, logger: deps.logger }`, `params: { failingJobId: jobId, sessionId: job.session_id, stageSlug: job.stage_slug, iterationNumber: job.payload.iterationNumber ?? 0, projectId: projectId, projectOwnerUserId: projectOwnerUserId }`
    *   `[✅]`   The existing failure path (lines 335–366) remains unchanged as the default for non-NSF errors and as the fallback if `pauseJobsForNsf` itself fails
  *   `[✅]`   integration/`index.nsf-pause.integration.test.ts`
    *   `[✅]`   Test: end-to-end NSF pause flow — set wallet balance to near-zero, trigger a generation with multiple EXECUTE jobs, verify that when the first job hits NSF all active siblings are paused (not failed), the parent PLAN remains in `waiting_for_children`, and exactly one `contribution_generation_paused_nsf` notification is sent
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: adapter/orchestrator (edge function entry point)
    *   `[✅]`   Dependencies face inward: imports `pauseJobsForNsf` (adapter helper)
    *   `[✅]`   No new outward-facing surface — `handleJob` export signature is unchanged
  *   `[✅]`   `requirements`
    *   `[✅]`   "Insufficient funds" errors must be intercepted before the existing failure path
    *   `[✅]`   Intercepted NSF errors must result in `pauseJobsForNsf` being called, NOT the existing `status: 'failed'` update
    *   `[✅]`   If `pauseJobsForNsf` itself fails, the error must be logged and the existing failure path must execute as a safety net — no silent swallowing of errors
    *   `[✅]`   Non-NSF errors must continue through the existing failure path with zero behavioral change
  *   `[✅]`   **Commit** `fix(be) supabase/functions NSF errors pause jobs instead of failing them, with notification service method, single notification, and original status preservation for DAG-correct resume`
    *   `[✅]`   New types/method in `notification.service.types.ts` and `notification.service.ts`: `ContributionGenerationPausedNsfPayload` and `sendContributionGenerationPausedNsfEvent`
    *   `[✅]`   Updated mock: `notification.service.mock.ts` with new spy and mock payload
    *   `[✅]`   New file: `pauseJobsForNsf.ts` with types, guards, unit tests, and integration tests
    *   `[✅]`   Modified: `index.ts` catch block — NSF detection branch routing to `pauseJobsForNsf`

### Node 5
*   `[✅]`   [BE] supabase/functions/dialectic-service/`deriveStepStatuses` **Map `paused_nsf` job status to `paused_nsf` step status in progress derivation**
  *   `[✅]`   `objective`
    *   `[✅]`   Extend `UnifiedStageStatus` in `dialectic.interface.ts` to include `'paused_nsf'` so the progress tracking type system can represent paused jobs
    *   `[✅]`   Add a `PAUSED_NSF_STATUSES` set (containing `'paused_nsf'`) to `deriveStepStatuses.ts` and add a check after `ACTIVE_STATUSES` so that steps with paused jobs are reported as `'paused_nsf'` instead of falling through to `'not_started'`
    *   `[✅]`   Priority order for step status derivation: `hasActive` → `in_progress` > `hasPausedNsf` → `paused_nsf` > `hasFailed` → `failed` > `hasCompleted` → `completed` > `not_started`
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — progress derivation layer within the dialectic-service edge function
  *   `[✅]`   `module`
    *   `[✅]`   Progress tracking — step status derivation from raw job statuses
    *   `[✅]`   Boundary: receives raw job rows, returns `Map<string, UnifiedStageStatus>` — the first backend consumer of `paused_nsf` job status for progress reporting
  *   `[✅]`   `deps`
    *   `[✅]`   Node 1 (migration) — `paused_nsf` must be a valid job status in the database before jobs can have this status
    *   `[✅]`   `ACTIVE_STATUSES` set (line 9) — must NOT include `paused_nsf`; paused jobs are not active
    *   `[✅]`   `FAILED_STATUSES` set (line 17) — must NOT include `paused_nsf`; paused jobs are not failed
    *   `[✅]`   No reverse dependency introduced — this is consumed by `getAllStageProgress` (Node 6)
  *   `[✅]`   `context_slice`
    *   `[✅]`   `deriveStepStatuses` function (line 28): iterates `jobs`, classifies by status set membership, derives per-step status
    *   `[✅]`   `UnifiedStageStatus` type (dialectic.interface.ts line 673): the return value type for step statuses
    *   `[✅]`   No injected dependencies — pure function
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   Add `'paused_nsf'` to the `UnifiedStageStatus` union (line 673): `| "not_started" | "in_progress" | "completed" | "failed" | "paused_nsf"`
  *   `[✅]`   unit/`deriveStepStatuses.test.ts`
    *   `[✅]`   Test: when all jobs for a step have status `paused_nsf`, step status is `paused_nsf`
    *   `[✅]`   Test: when a step has both `paused_nsf` and `completed` jobs, step status is `paused_nsf` (paused takes priority over completed)
    *   `[✅]`   Test: when a step has both `paused_nsf` and active jobs (e.g. `pending`), step status is `in_progress` (active takes priority over paused)
    *   `[✅]`   Test: when a step has both `paused_nsf` and `failed` jobs, step status is `paused_nsf` (paused takes priority over failed — the pause is recoverable, failure is secondary)
    *   `[✅]`   Test: existing tests for `in_progress`, `completed`, `failed`, `not_started` continue to pass unchanged
  *   `[✅]`   `construction`
    *   `[✅]`   No new functions — modification to existing `deriveStepStatuses`
  *   `[✅]`   `deriveStepStatuses.ts`
    *   `[✅]`   Add `const PAUSED_NSF_STATUSES: Set<string> = new Set(["paused_nsf"]);` after `FAILED_STATUSES` (line 17)
    *   `[✅]`   Add `stepKeyToHasPausedNsf` map alongside existing `stepKeyToHasActive`, `stepKeyToHasCompleted`, `stepKeyToHasFailed` (line 44)
    *   `[✅]`   In the job iteration loop (line 46), add a check: `else if (PAUSED_NSF_STATUSES.has(job.status)) { stepKeyToHasPausedNsf.set(stepKey, true); }` — after the `ACTIVE_STATUSES` check and before the `completed` check
    *   `[✅]`   In the step status derivation (line 80), insert `hasPausedNsf` check after `hasActive` and before `hasFailed`: `if (hasActive) { result.set(sk, "in_progress"); } else if (hasPausedNsf) { result.set(sk, "paused_nsf"); } else if (hasFailed) { result.set(sk, "failed"); } else { result.set(sk, "completed"); }`
    *   `[✅]`   Add `for (const stepKey of stepKeyToHasPausedNsf.keys()) stepsWithJobs.add(stepKey);` to the `stepsWithJobs` population (line 63)
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: infrastructure (progress derivation)
    *   `[✅]`   Dependencies face inward: depends on job data (infra) and `UnifiedStageStatus` type (domain)
    *   `[✅]`   Provides face outward: consumed by `getAllStageProgress` (Node 6) which passes step statuses to the frontend
  *   `[✅]`   `requirements`
    *   `[✅]`   `paused_nsf` job status must map to `paused_nsf` step status — not `in_progress`, not `failed`, not `not_started`
    *   `[✅]`   Active statuses must still take priority over `paused_nsf` (in the unlikely case both exist for a step)
    *   `[✅]`   `paused_nsf` must take priority over `failed` — the pause is recoverable and should be presented as such
    *   `[✅]`   All existing step status derivation behavior must be preserved

### Node 6
*   `[✅]`   [BE] supabase/functions/dialectic-service/`getAllStageProgress` **Handle `paused_nsf` step status in stage progress computation**
  *   `[✅]`   `objective`
    *   `[✅]`   Update the step-counting loop in `getAllStageProgress.ts` to count `paused_nsf` steps so that stage status correctly reflects when any step is paused due to NSF
    *   `[✅]`   Update stage status derivation priority: `failed` > `paused_nsf` > `completed` > `in_progress` > `not_started`
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — stage progress aggregation within the dialectic-service edge function
  *   `[✅]`   `module`
    *   `[✅]`   Progress tracking — stage-level aggregation from step statuses
    *   `[✅]`   Boundary: receives step statuses from `deriveStepStatuses`, computes stage-level progress and status for the `GetAllStageProgressResponse`
  *   `[✅]`   `deps`
    *   `[✅]`   Node 5 (`deriveStepStatuses`) — must return `paused_nsf` as a valid `UnifiedStageStatus` before this node can count it
    *   `[✅]`   `StageProgressEntry` interface (dialectic.interface.ts line 689) — `status` field is `UnifiedStageStatus`, which already includes `paused_nsf` after Node 5
    *   `[✅]`   No reverse dependency introduced — this is consumed by the frontend via the API layer
  *   `[✅]`   `context_slice`
    *   `[✅]`   Step-counting loop (line 841): iterates `steps`, gets status from `stepStatusMap`, counts `completedSteps` and `failedSteps`
    *   `[✅]`   Stage status derivation (line 848): priority logic that produces `stageStatus: UnifiedStageStatus`
    *   `[✅]`   No new injected dependencies
  *   `[✅]`   unit/`getAllStageProgress.test.ts`
    *   `[✅]`   Test: when any step has status `paused_nsf`, stage status is `paused_nsf`
    *   `[✅]`   Test: when steps have mix of `paused_nsf` and `completed`, stage status is `paused_nsf`
    *   `[✅]`   Test: when steps have mix of `paused_nsf` and `failed`, stage status is `failed` (failure takes priority at stage level)
    *   `[✅]`   Test: existing tests for `in_progress`, `completed`, `failed`, `not_started` stage statuses continue to pass
  *   `[✅]`   `construction`
    *   `[✅]`   No new functions — modification to existing step-counting and stage status derivation logic
  *   `[✅]`   `getAllStageProgress.ts`
    *   `[✅]`   Add `let pausedNsfSteps: number = 0;` alongside `completedSteps` and `failedSteps` (line 838)
    *   `[✅]`   In the step-counting loop (line 841), add: `if (status === "paused_nsf") pausedNsfSteps += 1;`
    *   `[✅]`   In stage status derivation (line 848), insert `paused_nsf` check after `failed` and before `completed`: `if (failedSteps > 0) { stageStatus = "failed"; } else if (pausedNsfSteps > 0) { stageStatus = "paused_nsf"; } else if (completedSteps === totalSteps && failedSteps === 0) { ...existing... }`
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: infrastructure (progress aggregation)
    *   `[✅]`   Dependencies face inward: consumes `deriveStepStatuses` output and `UnifiedStageStatus` type
    *   `[✅]`   Provides face outward: returns `GetAllStageProgressResponse` consumed by the API layer → frontend
  *   `[✅]`   `requirements`
    *   `[✅]`   Stage status must be `paused_nsf` when any step is `paused_nsf` and no steps have failed
    *   `[✅]`   `failed` stage status still takes priority over `paused_nsf` — a failed step is more severe
    *   `[✅]`   `paused_nsf` step count must not be counted as `completedSteps` or `failedSteps`
    *   `[✅]`   All existing stage progress computation behavior must be preserved
  *   `[✅]`   **Commit** `fix(be) supabase/functions/dialectic-service paused_nsf status in progress derivation and stage aggregation`
    *   `[✅]`   Updated type: `UnifiedStageStatus` in `dialectic.interface.ts` — added `paused_nsf`
    *   `[✅]`   Modified: `deriveStepStatuses.ts` — maps `paused_nsf` job status to `paused_nsf` step status
    *   `[✅]`   Modified: `getAllStageProgress.ts` — counts paused steps, derives `paused_nsf` stage status

### Node 7
*   `[✅]`   [BE] supabase/functions/dialectic-service/`resumePausedNsfJobs` **Resume handler, routing, and `ActionHandlers` wiring for the `resumePausedNsfJobs` action**
  *   `[✅]`   `objective`
    *   `[✅]`   Create a `resumePausedNsfJobs` handler in the dialectic-service edge function that receives `sessionId`, `stageSlug`, `iterationNumber` from an authenticated request, calls the `resume_paused_nsf_jobs` RPC via `adminClient`, and returns the count of resumed jobs
    *   `[✅]`   Add a `resumePausedNsfJobs` routing case to the `handleRequest` switch in `index.ts` and register it in `defaultHandlers` and the `ActionHandlers` interface
    *   `[✅]`   Add the corresponding `ResumePausedNsfJobsAction` to the `DialecticServiceRequest` union so the request type-checks
  *   `[✅]`   `role`
    *   `[✅]`   Backend / adapter — the edge function handler that bridges an authenticated API request to the database RPC
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic service — resume handler within the existing action-routed edge function
    *   `[✅]`   Boundary: receives authenticated request → validates payload → calls `adminClient.rpc('resume_paused_nsf_jobs')` → returns result
  *   `[✅]`   `deps`
    *   `[✅]`   Node 1 (migration) — `resume_paused_nsf_jobs` RPC must exist in the database
    *   `[✅]`   `adminClient` (Supabase admin client) — available in the `handleRequest` scope via `index.ts`
    *   `[✅]`   `ActionHandlers` interface (index.ts line 158) — must be extended with the new handler signature
    *   `[✅]`   `DialecticServiceRequest` union (dialectic.interface.ts line 601) — must include the new action type
    *   `[✅]`   `defaultHandlers` (index.ts line 637) — must include the new handler
    *   `[✅]`   No reverse dependency introduced — this is consumed by the API layer (Node 8)
  *   `[✅]`   `context_slice`
    *   `[✅]`   Existing routing pattern in `handleRequest` (index.ts line 284): `switch (action) { case "getAllStageProgress": ... }` — the new case follows this pattern
    *   `[✅]`   `adminClient`: `SupabaseClient` — used for `adminClient.rpc('resume_paused_nsf_jobs', { p_session_id, p_stage_slug, p_iteration_number })`
    *   `[✅]`   `userForJson`: `User` — used for ownership verification (the RPC itself verifies ownership, but auth check gates access)
  *   `[✅]`   interface/`dialectic.interface.ts`
    *   `[✅]`   `ResumePausedNsfJobsPayload` — `{ sessionId: string; stageSlug: string; iterationNumber: number }` — matches the parameters of the `resume_paused_nsf_jobs` RPC
    *   `[✅]`   `ResumePausedNsfJobsAction` — `{ action: "resumePausedNsfJobs"; payload: ResumePausedNsfJobsPayload }` — follows the existing discriminated union pattern
    *   `[✅]`   Add `ResumePausedNsfJobsAction` to the `DialecticServiceRequest` union (line 601)
    *   `[✅]`   `ResumePausedNsfJobsResponse` — `{ resumedCount: number }` — returned by the handler on success
  *   `[✅]`   unit/`resumePausedNsfJobs.test.ts`
    *   `[✅]`   Test: handler calls `adminClient.rpc('resume_paused_nsf_jobs', { p_session_id, p_stage_slug, p_iteration_number })` with correct parameters
    *   `[✅]`   Test: handler returns `{ resumedCount: N }` on success where N is the RPC return value
    *   `[✅]`   Test: handler returns 401 error when user is not authenticated
    *   `[✅]`   Test: handler returns 500 error when RPC fails and logs the error
  *   `[✅]`   `construction`
    *   `[✅]`   Single exported async function: `handleResumePausedNsfJobs(payload: ResumePausedNsfJobsPayload, adminClient: SupabaseClient, user: User): Promise<{ data?: ResumePausedNsfJobsResponse; error?: ServiceError; status?: number }>`
    *   `[✅]`   Follows existing handler signature pattern from `ActionHandlers`
  *   `[✅]`   `resumePausedNsfJobs.ts`
    *   `[✅]`   Import `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` from `./dialectic.interface.ts`
    *   `[✅]`   Call `adminClient.rpc('resume_paused_nsf_jobs', { p_session_id: payload.sessionId, p_stage_slug: payload.stageSlug, p_iteration_number: payload.iterationNumber })`
    *   `[✅]`   On success: return `{ status: 200, data: { resumedCount: data } }`
    *   `[✅]`   On error: return `{ status: 500, error: { message: error.message, status: 500, code: 'RESUME_FAILED' } }`
  *   `[✅]`   `index.ts`
    *   `[✅]`   Add `import { handleResumePausedNsfJobs } from './resumePausedNsfJobs.ts';` at the top
    *   `[✅]`   Add `resumePausedNsfJobs: (payload: ResumePausedNsfJobsPayload, adminClient: SupabaseClient, user: User) => Promise<{ data?: ResumePausedNsfJobsResponse; error?: ServiceError; status?: number }>;` to the `ActionHandlers` interface (line 158)
    *   `[✅]`   Add `case "resumePausedNsfJobs":` to the switch in `handleRequest`, following the same pattern as `getAllStageProgress` (line 586): auth check → extract payload → call handler → return response
    *   `[✅]`   Add `resumePausedNsfJobs: handleResumePausedNsfJobs,` to `defaultHandlers` (line 637)
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: adapter (edge function handler)
    *   `[✅]`   Dependencies face inward: depends on `adminClient` (infra) and `resume_paused_nsf_jobs` RPC (infra)
    *   `[✅]`   Provides face outward: consumed by the API layer (Node 8) via HTTP POST to `dialectic-service`
  *   `[✅]`   `requirements`
    *   `[✅]`   The handler must require authentication — unauthenticated requests must be rejected
    *   `[✅]`   The handler must call the `resume_paused_nsf_jobs` RPC with the correct parameters
    *   `[✅]`   The handler must return the count of resumed jobs on success
    *   `[✅]`   RPC failures must be returned as 500 errors with the error message — not silently swallowed
    *   `[✅]`   The routing case, handler signature, and `defaultHandlers` entry must follow the existing patterns exactly

### Node 8
*   `[✅]`   [API] packages/api/src/`dialectic.api` **Add `resumePausedNsfJobs` method to `DialecticApiClient` interface and implementation**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a `resumePausedNsfJobs` method to the `DialecticApiClient` interface in `packages/types/src/dialectic.types.ts` and the `DialecticApiClientImpl` class in `packages/api/src/dialectic.api.ts` so that the frontend store can call the backend resume handler through the established API layer
    *   `[✅]`   Add `ResumePausedNsfJobsPayload` and `ResumePausedNsfJobsResponse` frontend types
  *   `[✅]`   `role`
    *   `[✅]`   Port — API layer bridge between the frontend store and the backend edge function
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic API client — extends the existing standardized interface for frontend-to-backend communication
    *   `[✅]`   Boundary: receives typed payload from store → sends `POST { action: 'resumePausedNsfJobs', payload }` to `dialectic-service` → returns typed response
  *   `[✅]`   `deps`
    *   `[✅]`   Node 7 (resume handler) — the `dialectic-service` edge function must have the `resumePausedNsfJobs` routing case before this API method can successfully call it
    *   `[✅]`   `this.apiClient.post` — existing infrastructure for sending typed POST requests to edge functions
    *   `[✅]`   `DialecticServiceActionPayload` — existing generic type used by `apiClient.post` for the request body shape
    *   `[✅]`   No reverse dependency introduced — this is consumed by the dialectic store (Node 11)
  *   `[✅]`   `context_slice`
    *   `[✅]`   `apiClient.post<TResponse, TPayload>(edgeFunctionName, payload)` — the standard method for calling edge functions, used by `getAllStageProgress` (line 659), `generateContributions` (line 521), and all other API methods
    *   `[✅]`   `DialecticApiClient` interface (dialectic.types.ts line 1043) — the interface that the store depends on
  *   `[✅]`   interface/`dialectic.types.ts`
    *   `[✅]`   `ResumePausedNsfJobsPayload` — `{ sessionId: string; stageSlug: string; iterationNumber: number }` — matches the backend `ResumePausedNsfJobsPayload` in `dialectic.interface.ts`
    *   `[✅]`   `ResumePausedNsfJobsResponse` — `{ resumedCount: number }` — matches the backend response
    *   `[✅]`   Add `resumePausedNsfJobs(payload: ResumePausedNsfJobsPayload): Promise<ApiResponse<ResumePausedNsfJobsResponse>>;` to the `DialecticApiClient` interface (line 1043)
  *   `[✅]`   unit/`dialectic.api.test.ts`
    *   `[✅]`   Test: `resumePausedNsfJobs` calls `apiClient.post` with `action: 'resumePausedNsfJobs'` and the correct payload
    *   `[✅]`   Test: on success, returns `{ data: { resumedCount: N }, status: 200 }`
    *   `[✅]`   Test: on error, returns `{ error: { message: '...' }, status: 500 }`
  *   `[✅]`   `construction`
    *   `[✅]`   No new class — method added to existing `DialecticApiClientImpl`
  *   `[✅]`   `dialectic.api.ts`
    *   `[✅]`   Add import of `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` from `@paynless/types` (add to existing import block)
    *   `[✅]`   Add method following the `getAllStageProgress` pattern (line 656):
      *   `[✅]`   `async resumePausedNsfJobs(payload: ResumePausedNsfJobsPayload): Promise<ApiResponse<ResumePausedNsfJobsResponse>>`
      *   `[✅]`   Body: `const response = await this.apiClient.post<ResumePausedNsfJobsResponse, DialecticServiceActionPayload>('dialectic-service', { action: 'resumePausedNsfJobs', payload });`
      *   `[✅]`   Error logging and return following the `getAllStageProgress` pattern
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: port (API client)
    *   `[✅]`   Dependencies face inward: depends on `apiClient` (infra) for HTTP communication
    *   `[✅]`   Provides face outward: consumed by the dialectic store (Node 11) via `api.dialectic().resumePausedNsfJobs(payload)`
  *   `[✅]`   `requirements`
    *   `[✅]`   The API method must follow the same pattern as `getAllStageProgress` and `generateContributions` — `POST` to `dialectic-service` with `action` and `payload`
    *   `[✅]`   The frontend payload and response types must mirror the backend types
    *   `[✅]`   The method must be declared on the `DialecticApiClient` interface so the store depends on the interface, not the implementation
    *   `[✅]`   Error handling must follow the existing pattern — log errors, return `ApiResponse` with error details
  *   `[✅]`   **Commit** `feat(be,api) dialectic-service resume handler, routing, and API client method for NSF job resume`
    *   `[✅]`   New handler: `resumePausedNsfJobs.ts` in `dialectic-service/`
    *   `[✅]`   Modified: `dialectic.interface.ts` — new payload, response, and action types
    *   `[✅]`   Modified: `index.ts` — routing case, `ActionHandlers` interface, `defaultHandlers` entry
    *   `[✅]`   New frontend types: `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` in `dialectic.types.ts`
    *   `[✅]`   Modified: `DialecticApiClient` interface and `DialecticApiClientImpl` — new `resumePausedNsfJobs` method

### Node 9
*   `[✅]`   [FE] packages/utils/src/`type_guards` **Recognize `contribution_generation_paused_nsf` in `isDialecticLifecycleEventType` and add event type string to frontend types**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `'contribution_generation_paused_nsf'` to the `DialecticNotificationTypes` string union in `packages/types/src/dialectic.types.ts` so the frontend type system recognizes the new event
    *   `[✅]`   Update `isDialecticLifecycleEventType` in `packages/utils/src/type_guards.ts` to accept the `'paused_nsf'` suffix on the `contribution_generation_` prefix, so notifications arriving via Realtime are correctly identified and routed to the lifecycle event pipeline in `notificationStore`
  *   `[✅]`   `role`
    *   `[✅]`   Port — type validation gate between incoming Realtime notifications and the dialectic lifecycle event handler
  *   `[✅]`   `module`
    *   `[✅]`   Type guard — `isDialecticLifecycleEventType` is the gatekeeper at `notificationStore.ts` line 70; if it returns `false`, the notification is silently dropped and never reaches `_handleDialecticLifecycleEvent`
    *   `[✅]`   Boundary: validates a string is a known dialectic event type
  *   `[✅]`   `deps`
    *   `[✅]`   `DialecticNotificationTypes` from `@paynless/types` — the string union that the guard narrows to; must include `'contribution_generation_paused_nsf'` before the guard can match it
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   The guard function is pure — no injected dependencies, no side effects
    *   `[✅]`   Confirm no concrete imports from higher or lateral layers
  *   `[✅]`   interface/`dialectic.types.ts`
    *   `[✅]`   Add `'contribution_generation_paused_nsf'` to the `DialecticNotificationTypes` string union (line 827) — this is the type-level representation of the event string
  *   `[✅]`   interface/tests/`type_guards.test.ts`
    *   `[✅]`   Contract: `isDialecticLifecycleEventType('contribution_generation_paused_nsf')` must return `true` — add to the existing `'should return true for valid dialectic event types'` test block (line 151)
  *   `[✅]`   unit/`type_guards.test.ts`
    *   `[✅]`   Test: `isDialecticLifecycleEventType('contribution_generation_paused_nsf')` returns `true` (add assertion to existing valid-types test at line 151)
  *   `[✅]`   `construction`
    *   `[✅]`   No new functions or objects — modification to an existing guard function
  *   `[✅]`   `type_guards.ts`
    *   `[✅]`   In the `contribution_generation_` prefix suffix check (line 210–215), add `|| suffix === 'paused_nsf'` to the return expression
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: port (shared utility)
    *   `[✅]`   Dependencies face inward: depends on `DialecticNotificationTypes` (type-only, domain)
    *   `[✅]`   Provides face outward: consumed by `notificationStore.ts` (Node 10) at line 70 to gate lifecycle event routing
  *   `[✅]`   `requirements`
    *   `[✅]`   `isDialecticLifecycleEventType('contribution_generation_paused_nsf')` must return `true` so the notification store routes the event
    *   `[✅]`   All existing type guard tests must continue to pass — no regression on existing event types
    *   `[✅]`   `DialecticNotificationTypes` must include the new string literal so TypeScript's type narrowing works correctly downstream

### Node 10
*   `[✅]`   [STORE] packages/store/src/`notificationStore` **Route `contribution_generation_paused_nsf` notifications to dialectic store lifecycle handler**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a `ContributionGenerationPausedNsfPayload` interface to the frontend type system in `packages/types/src/dialectic.types.ts` and add it to the `DialecticLifecycleEvent` union so the notification store can construct and forward the typed event
    *   `[✅]`   Add a `case 'contribution_generation_paused_nsf'` to the payload extraction switch in `handleIncomingNotification` (line 289) so that incoming NSF pause notifications are extracted, validated, and forwarded to `_handleDialecticLifecycleEvent`
  *   `[✅]`   `role`
    *   `[✅]`   Application — notification routing bridge between Supabase Realtime and the dialectic store
  *   `[✅]`   `module`
    *   `[✅]`   Notification store — the `handleIncomingNotification` method's switch statement (lines 289–529) performs per-type payload extraction for all lifecycle events
    *   `[✅]`   Boundary: receives a `Notification` from Realtime, extracts typed fields from `notification.data`, constructs a `DialecticLifecycleEvent`, forwards to `_handleDialecticLifecycleEvent`
  *   `[✅]`   `deps`
    *   `[✅]`   Node 9 (type guard) — `isDialecticLifecycleEventType` must recognize `'contribution_generation_paused_nsf'` before this case is reachable; `DialecticNotificationTypes` must include the string
    *   `[✅]`   `DialecticLifecycleEvent` from `@paynless/types` — must include `ContributionGenerationPausedNsfPayload` so the constructed event can be assigned to `eventPayload`
    *   `[✅]`   `useDialecticStore.getState()._handleDialecticLifecycleEvent` — existing consumer, no change
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   `notification.data`: `NotificationData | null` — the raw JSONB payload from the notifications table row
    *   `[✅]`   `notification.type`: `string` — already narrowed to `DialecticNotificationTypes` by the `isDialecticLifecycleEventType` check at line 70
    *   `[✅]`   Confirm no concrete imports from higher or lateral layers
  *   `[✅]`   interface/`dialectic.types.ts`
    *   `[✅]`   `ContributionGenerationPausedNsfPayload` — `{ type: 'contribution_generation_paused_nsf'; sessionId: string; projectId: string; stageSlug: string; iterationNumber: number }` — mirrors the backend payload shape from `notification.service.types.ts` (Node 2), follows the existing frontend payload pattern (e.g., `ContributionGenerationCompletePayload` at line 906)
    *   `[✅]`   Add `ContributionGenerationPausedNsfPayload` to the `DialecticLifecycleEvent` union (line 1004)
  *   `[✅]`   unit/`notificationStore.test.ts` (or existing test file for notification store)
    *   `[✅]`   Test: when `handleIncomingNotification` receives a notification with `type: 'contribution_generation_paused_nsf'`, `is_internal_event: true`, and `data: { type: 'contribution_generation_paused_nsf', sessionId: 'x', projectId: 'y', stageSlug: 'thesis', iterationNumber: 1 }`, the dialectic store's `_handleDialecticLifecycleEvent` is called with a correctly shaped `ContributionGenerationPausedNsfPayload`
    *   `[✅]`   Test: when `data` is missing `sessionId`, `stageSlug`, or `iterationNumber`, the event is NOT forwarded — `eventPayload` remains `null` and a warning is logged
    *   `[✅]`   Test: when `data` is missing `projectId`, the event is NOT forwarded
  *   `[✅]`   `construction`
    *   `[✅]`   No new functions or components — modification to the existing `switch (type)` block in `handleIncomingNotification`
  *   `[✅]`   `notificationStore.ts`
    *   `[✅]`   Add `case 'contribution_generation_paused_nsf':` to the switch block (after the `contribution_generation_complete` case at line 325), with field extraction and validation following the existing pattern:
      *   `[✅]`   Guard: `typeof data['sessionId'] === 'string' && typeof data['projectId'] === 'string' && typeof data['stageSlug'] === 'string' && typeof data['iterationNumber'] === 'number'`
      *   `[✅]`   Construct payload: `eventPayload = { type, sessionId: data['sessionId'], projectId: data['projectId'], stageSlug: data['stageSlug'], iterationNumber: data['iterationNumber'] }`
      *   `[✅]`   `break;`
    *   `[✅]`   The existing forwarding logic at line 531 (`if (eventPayload) { useDialecticStore.getState()._handleDialecticLifecycleEvent?.(eventPayload); }`) handles the rest — no additional changes needed
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: application (state management / notification routing)
    *   `[✅]`   Dependencies face inward: consumes `DialecticLifecycleEvent` (types), `isDialecticLifecycleEventType` (port)
    *   `[✅]`   Provides face outward: forwards constructed events to `dialecticStore._handleDialecticLifecycleEvent` (Node 11)
  *   `[✅]`   `requirements`
    *   `[✅]`   `contribution_generation_paused_nsf` notifications must be extracted, validated, and forwarded to `_handleDialecticLifecycleEvent` using the same pattern as all other lifecycle events
    *   `[✅]`   Invalid payloads (missing required fields) must be logged and dropped — not forwarded with partial data
    *   `[✅]`   All existing notification routing must continue to work — no regression on existing event types
    *   `[✅]`   The `ContributionGenerationPausedNsfPayload` frontend type must mirror the backend type shape from `notification.service.types.ts`

### Node 11
*   `[✅]`   [STORE] packages/store/src/`dialecticStore` **NSF pause notification handler, resume action via API layer, and progress re-hydration trigger**
  *   `[✅]`   `objective`
    *   `[✅]`   Handle the `contribution_generation_paused_nsf` lifecycle event (routed by `notificationStore` via Node 10) by clearing `generatingSessions` for the affected session and triggering `hydrateAllStageProgress` so the progress tracker durably reflects the `paused_nsf` state — NO ephemeral in-memory `nsfPausedContext` state
    *   `[✅]`   Provide a `resumePausedNsfJobs` action that calls `api.dialectic().resumePausedNsfJobs(payload)` (Node 8) and triggers `hydrateAllStageProgress` on success so the progress tracker refreshes to show resumed jobs
    *   `[✅]`   The source of truth for whether jobs are paused is the progress tracker (via `selectUnifiedProjectProgress` → `paused_nsf` stage/step status from Nodes 5–6), NOT ephemeral store state
  *   `[✅]`   `role`
    *   `[✅]`   State management — bridges backend notifications to progress re-hydration and provides the resume action via the API layer
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic store — extends the existing `_handleDialecticLifecycleEvent` router and adds the resume action
    *   `[✅]`   Boundary: receives lifecycle event → clears generating state → re-hydrates progress; receives resume action from UI → calls API → re-hydrates progress
  *   `[✅]`   `deps`
    *   `[✅]`   Node 8 (API layer) — `api.dialectic().resumePausedNsfJobs` must exist so the store can call the backend through the API layer
    *   `[✅]`   Node 10 (notificationStore) — must route the notification and forward the constructed `ContributionGenerationPausedNsfPayload` to `_handleDialecticLifecycleEvent`
    *   `[✅]`   Existing `_handleDialecticLifecycleEvent` router (line 1481) — must add a new `case` for `'contribution_generation_paused_nsf'`
    *   `[✅]`   Existing `generatingSessions` state — the pause handler must clear the affected session so the button transitions from "Generating..." to the paused state
    *   `[✅]`   Existing `hydrateAllStageProgress` action (line 2707) — called to refresh progress data from the backend after pause/resume events
    *   `[✅]`   `api` — the API client instance, available via the store's existing infrastructure pattern (same as `generateContributions` at line 1906)
    *   `[✅]`   No reverse dependency — the store is consumed by UI components and selectors (Nodes 12–14)
  *   `[✅]`   `context_slice`
    *   `[✅]`   `api.dialectic().resumePausedNsfJobs`: from `@paynless/api` via the store's existing API infrastructure (same pattern as `api.dialectic().generateContributions` at line 1906)
    *   `[✅]`   `ContributionGenerationPausedNsfPayload`: from `@paynless/types` (added in Node 10)
    *   `[✅]`   `hydrateAllStageProgress`: existing store action at line 2707
    *   `[✅]`   Existing store state shape: `generatingSessions`, `contributionGenerationStatus`, `generatingForStageSlug`
  *   `[✅]`   interface/`dialectic.types.ts`
    *   `[✅]`   Add `resumePausedNsfJobs: (payload: ResumePausedNsfJobsPayload) => Promise<ApiResponse<ResumePausedNsfJobsResponse>>` to `DialecticActions` (line 665) — uses the same `ResumePausedNsfJobsPayload` and `ResumePausedNsfJobsResponse` types defined in Node 8
    *   `[✅]`   Add `_handleContributionGenerationPausedNsf: (event: ContributionGenerationPausedNsfPayload) => void` to `DialecticActions` (line 755, alongside existing private handlers)
    *   `[✅]`   NO `nsfPausedContext` in `DialecticStateValues` — the paused state is read from the progress tracker via selectors (Node 12)
  *   `[✅]`   unit/`dialecticStore.nsf.test.ts`
    *   `[✅]`   Test: `_handleContributionGenerationPausedNsf` clears the affected session from `generatingSessions` and resets `contributionGenerationStatus` and `generatingForStageSlug`
    *   `[✅]`   Test: `_handleContributionGenerationPausedNsf` calls `hydrateAllStageProgress` with `{ sessionId, iterationNumber, userId, projectId }` from the payload so the progress tracker refreshes to show `paused_nsf`
    *   `[✅]`   Test: `_handleDialecticLifecycleEvent` routes `type: 'contribution_generation_paused_nsf'` to `_handleContributionGenerationPausedNsf`
    *   `[✅]`   Test: `resumePausedNsfJobs` calls `api.dialectic().resumePausedNsfJobs(payload)` with correct `{ sessionId, stageSlug, iterationNumber }`
    *   `[✅]`   Test: on successful API response, `resumePausedNsfJobs` calls `hydrateAllStageProgress` to refresh progress data
    *   `[✅]`   Test: on API failure, `resumePausedNsfJobs` shows a toast error and does NOT call `hydrateAllStageProgress`
    *   `[✅]`   Test: on API failure, user can retry — the action does not leave the store in a broken state
  *   `[✅]`   `construction`
    *   `[✅]`   `_handleContributionGenerationPausedNsf` is a private handler method, not directly callable from outside the store
    *   `[✅]`   `resumePausedNsfJobs` is a public action exposed on the store interface
    *   `[✅]`   NO `nsfPausedContext` state variable — paused state is derived from the progress tracker
  *   `[✅]`   `dialecticStore.ts`
    *   `[✅]`   Add `_handleContributionGenerationPausedNsf(payload: ContributionGenerationPausedNsfPayload)` handler:
      *   `[✅]`   Clear the session from `generatingSessions`: `set(state => { state.contributionGenerationStatus = 'idle'; state.generatingForStageSlug = null; })`
      *   `[✅]`   Trigger progress re-hydration: `get().hydrateAllStageProgress({ sessionId: payload.sessionId, iterationNumber: payload.iterationNumber, userId: get().currentProjectDetail?.user_id ?? '', projectId: payload.projectId })`
    *   `[✅]`   Add routing case in `_handleDialecticLifecycleEvent` (line 1484): when `type` is `'contribution_generation_paused_nsf'`, call `handlers._handleContributionGenerationPausedNsf(payload)`
    *   `[✅]`   Add `resumePausedNsfJobs(payload: ResumePausedNsfJobsPayload)` action:
      *   `[✅]`   Call `api.dialectic().resumePausedNsfJobs(payload)` — NOT `supabase.rpc()` directly
      *   `[✅]`   On success: call `get().hydrateAllStageProgress(...)` to refresh progress, return the API response
      *   `[✅]`   On failure: show toast error, return the API error response — progress tracker still shows `paused_nsf` so the user can retry
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: application (state management)
    *   `[✅]`   Dependencies face inward: consumes API layer (`api.dialectic()`) and types — does NOT depend on Supabase client directly for resume
    *   `[✅]`   Provides face outward: consumed by UI components (Nodes 13–14) and selectors (Node 12)
  *   `[✅]`   `requirements`
    *   `[✅]`   `contribution_generation_paused_nsf` lifecycle event must be routed to the correct handler via the existing `_handleDialecticLifecycleEvent` switch
    *   `[✅]`   The pause handler must clear `generatingSessions` / `contributionGenerationStatus` / `generatingForStageSlug` so the UI button exits "Generating..." state
    *   `[✅]`   The pause handler must trigger `hydrateAllStageProgress` so the progress tracker fetches fresh data showing `paused_nsf` step/stage statuses — this is the durable hydration mechanism
    *   `[✅]`   The resume action must call through the API layer: store → `api.dialectic().resumePausedNsfJobs()` → edge function → RPC — NOT directly to `supabase.rpc()`
    *   `[✅]`   After successful resume, `hydrateAllStageProgress` must be called to refresh progress — the progress tracker is the source of truth for UI state transitions
    *   `[✅]`   Resume failure must leave the progress tracker unchanged (still showing `paused_nsf`) — the user can retry

### Node 12
*   `[✅]`   [STORE] packages/store/src/`dialecticStore.selectors` **Handle `paused_nsf` in `selectUnifiedProjectProgress` and add `paused_nsf` to `UnifiedProjectStatus`**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `'paused_nsf'` to the `UnifiedProjectStatus` type union in `packages/types/src/dialectic.types.ts` so the frontend progress display system can represent paused steps and stages
    *   `[✅]`   Update the step status mapping in `selectUnifiedProjectProgress` (line 870) to map `'paused_nsf'` raw step status to `'paused_nsf'` `UnifiedProjectStatus` — currently unmapped statuses default to `'not_started'`, which would silently hide the paused state
    *   `[✅]`   Update the stage status derivation in `selectUnifiedProjectProgress` to set `stageStatus` to `'paused_nsf'` when any step is paused and none have failed
  *   `[✅]`   `role`
    *   `[✅]`   Application — progress data transformation layer between raw backend progress and UI display
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic store selectors — extends `selectUnifiedProjectProgress` to handle the new status
    *   `[✅]`   Boundary: receives raw step statuses from hydrated progress → transforms to `UnifiedProjectStatus` values for UI consumption
  *   `[✅]`   `deps`
    *   `[✅]`   Nodes 5–6 (backend progress) — the backend must return `paused_nsf` as a valid step/stage status before the selector encounters it
    *   `[✅]`   Node 11 (store) — `hydrateAllStageProgress` must have been triggered so the store contains fresh progress data with `paused_nsf` statuses
    *   `[✅]`   `UnifiedProjectStatus` type (dialectic.types.ts line 575) — must be extended with `'paused_nsf'`
    *   `[✅]`   No reverse dependency introduced — consumed by UI components (Nodes 13–14)
  *   `[✅]`   `context_slice`
    *   `[✅]`   `selectUnifiedProjectProgress` (line 803): the main progress selector that transforms raw step statuses into `UnifiedProjectStatus` values
    *   `[✅]`   Step status mapping (line 870): `raw === 'failed' ? 'failed' : raw === 'completed' ? 'completed' : raw === 'in_progress' || raw === 'waiting_for_children' ? 'in_progress' : 'not_started'` — does not handle `paused_nsf`
    *   `[✅]`   Stage status derivation (line 876): `if (stepStatus === 'failed') stageStatus = 'failed';` — does not handle `paused_nsf`
  *   `[✅]`   interface/`dialectic.types.ts`
    *   `[✅]`   Add `'paused_nsf'` to `UnifiedProjectStatus` (line 575): `'not_started' | 'in_progress' | 'completed' | 'failed' | 'paused_nsf'`
  *   `[✅]`   unit/`dialecticStore.selectors.test.ts`
    *   `[✅]`   Test: when a step's raw status is `'paused_nsf'`, `selectUnifiedProjectProgress` maps it to `UnifiedProjectStatus` `'paused_nsf'`
    *   `[✅]`   Test: when any step is `'paused_nsf'` and none are `'failed'`, the stage status is `'paused_nsf'`
    *   `[✅]`   Test: when a step is `'paused_nsf'` and another is `'failed'`, the stage status is `'failed'` (failure takes priority)
    *   `[✅]`   Test: existing `'in_progress'`, `'completed'`, `'failed'`, `'not_started'` step/stage mappings continue to work unchanged
  *   `[✅]`   `construction`
    *   `[✅]`   No new functions — modifications to existing `selectUnifiedProjectProgress` selector
  *   `[✅]`   `dialecticStore.selectors.ts`
    *   `[✅]`   Update step status mapping (line 870): add `raw === 'paused_nsf' ? 'paused_nsf'` to the ternary chain — `raw === 'failed' ? 'failed' : raw === 'completed' ? 'completed' : raw === 'in_progress' || raw === 'waiting_for_children' ? 'in_progress' : raw === 'paused_nsf' ? 'paused_nsf' : 'not_started'`
    *   `[✅]`   Update stage status derivation (line 876): add `paused_nsf` check after `failed`: `if (stepStatus === 'failed') stageStatus = 'failed'; else if (stepStatus === 'paused_nsf' && stageStatus !== 'failed') stageStatus = 'paused_nsf';`
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: application (state derivation)
    *   `[✅]`   Dependencies face inward: consumes hydrated progress data (store state) and `UnifiedProjectStatus` type (domain)
    *   `[✅]`   Provides face outward: consumed by `StageDAGProgressDialog` (Node 13) and `GenerateContributionButton` (Node 14) via the selector
  *   `[✅]`   `requirements`
    *   `[✅]`   `paused_nsf` raw step status must map to `paused_nsf` `UnifiedProjectStatus` — NOT `not_started`, NOT `failed`
    *   `[✅]`   `paused_nsf` stage status must be set when any step is paused and no steps have failed
    *   `[✅]`   `failed` still takes priority over `paused_nsf` at the stage level
    *   `[✅]`   All existing status mappings must be preserved

### Node 13
*   `[✅]`   [UI] apps/web/src/components/dialectic/`StageDAGProgressDialog` **Add `paused_nsf` color to `STATUS_FILL` map**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a `paused_nsf` entry to the `STATUS_FILL` record (line 15) so that DAG nodes with `paused_nsf` status render with a distinct visual color instead of falling back to `undefined`
  *   `[✅]`   `role`
    *   `[✅]`   UI / presentation — visual mapping for the new status in the DAG progress display
  *   `[✅]`   `module`
    *   `[✅]`   DAG progress dialog — extends the status-to-color mapping
    *   `[✅]`   Boundary: receives `UnifiedProjectStatus` per step → maps to fill color for SVG rendering
  *   `[✅]`   `deps`
    *   `[✅]`   Node 12 (selectors) — `selectUnifiedProjectProgress` must return `paused_nsf` as a valid `UnifiedProjectStatus` for steps/stages before this color is used
    *   `[✅]`   `UnifiedProjectStatus` from `@paynless/types` — must include `'paused_nsf'` (added in Node 12)
    *   `[✅]`   No reverse dependency — this is a leaf UI component
  *   `[✅]`   `context_slice`
    *   `[✅]`   `STATUS_FILL` record (line 15): `Record<UnifiedProjectStatus, string>` — maps each status to a hex color
    *   `[✅]`   Once `UnifiedProjectStatus` includes `paused_nsf`, TypeScript will enforce a compile error until `STATUS_FILL` has a matching entry
  *   `[✅]`   unit/`StageDAGProgressDialog.test.ts`
    *   `[✅]`   Test: when a step has status `paused_nsf`, the rendered DAG node uses the `paused_nsf` fill color (amber/orange: `'#f97316'`)
  *   `[✅]`   `construction`
    *   `[✅]`   No new components — single-line addition to the existing `STATUS_FILL` record
  *   `[✅]`   `StageDAGProgressDialog.tsx`
    *   `[✅]`   Add `paused_nsf: '#f97316',` to the `STATUS_FILL` record (line 15, after `failed: '#ef4444'`) — orange to visually distinguish from yellow (`in_progress`) and red (`failed`), signaling "attention needed but recoverable"
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: UI / presentation
    *   `[✅]`   Dependencies face inward: consumes `UnifiedProjectStatus` type
    *   `[✅]`   No outward-facing provides — leaf component
  *   `[✅]`   `requirements`
    *   `[✅]`   `paused_nsf` must have a distinct color from `in_progress` (yellow) and `failed` (red) — orange (`#f97316`) conveys "needs attention but recoverable"
    *   `[✅]`   TypeScript must compile without error — `STATUS_FILL` must be exhaustive for all `UnifiedProjectStatus` values

### Node 14
*   `[✅]`   [UI] apps/web/src/components/dialectic/`GenerateContributionButton` **Per-stage balance threshold gate, paused-NSF detection from progress tracker, and resume-via-same-button UX**
  *   `[✅]`   `objective`
    *   `[✅]`   Add a per-stage balance threshold check that disables the Generate button when the user's wallet balance is below the minimum required for the active stage — this is the UX gate, the first line of defense against NSF
    *   `[✅]`   Detect when jobs are paused due to NSF by reading `stageStatus === 'paused_nsf'` from `selectUnifiedProjectProgress` (Node 12) — NOT from ephemeral in-memory state — and adjust the button to show "Add Funds to Resume" (disabled, balance too low) or "Resume {stageName}" (enabled, balance sufficient)
    *   `[✅]`   When the user clicks "Resume", call `resumePausedNsfJobs` from the store (Node 11) instead of `generateContributions` — same button, different action based on progress-derived context
  *   `[✅]`   `role`
    *   `[✅]`   UI / presentation — the user-facing control for initiating, gating, and resuming dialectic generation
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic contribution generation UI — extends the existing `GenerateContributionButton` component
    *   `[✅]`   Boundary: reads wallet balance + progress selector → renders button with appropriate text/disabled state → dispatches generate or resume action on click
  *   `[✅]`   `deps`
    *   `[✅]`   Node 11 (store) — `resumePausedNsfJobs` action must exist on the dialectic store
    *   `[✅]`   Node 12 (selectors) — `selectUnifiedProjectProgress` must return `stageStatus: 'paused_nsf'` for paused stages — this is the source of truth for detecting the paused state
    *   `[✅]`   `selectUnifiedProjectProgress` from `@paynless/store` (already imported at line 3) — provides `stagesDetail[].stageStatus` which may be `'paused_nsf'`
    *   `[✅]`   `useWalletStore` / `selectActiveChatWalletInfo` (already imported, line 9–10) — the `activeWalletInfo` object must include a `balance` field. **Discovery potential**: verify the wallet info type includes a numeric `balance` property; if not, this requires a type extension in the wallet store which would be a separate node.
    *   `[✅]`   `useDialecticStore` (already imported) — used for `resumePausedNsfJobs` action
    *   `[✅]`   `@paynless/types` — for `getDisplayName` (already imported) and `STAGE_BALANCE_THRESHOLDS` constant (new)
    *   `[✅]`   No reverse dependency — this is a leaf UI component
  *   `[✅]`   `context_slice`
    *   `[✅]`   `activeWalletInfo.balance`: `number` — current wallet token balance
    *   `[✅]`   `selectUnifiedProjectProgress(state)`: returns `UnifiedProjectProgress` — `stagesDetail[].stageStatus` is checked for `'paused_nsf'` to detect the paused state for the active stage
    *   `[✅]`   `resumePausedNsfJobs`: action from dialectic store (Node 11)
    *   `[✅]`   `activeStage.slug`: `string` — used to look up threshold and match against progress data
    *   `[✅]`   `STAGE_BALANCE_THRESHOLDS`: `Record<string, number>` — per-stage minimum balance constants
  *   `[✅]`   interface/`dialectic.types.ts`
    *   `[✅]`   `STAGE_BALANCE_THRESHOLDS` constant in `@paynless/types`: `{ thesis: 200000, antithesis: 400000, synthesis: 1000000, parenthesis: 250000, paralysis: 250000 }` — values provided by product owner based on observed stage token costs. Keyed by stage slug string.
    *   `[✅]`   Verify `activeWalletInfo` type includes a numeric `balance` field — if missing, this is a **discovery** requiring a type/selector extension in the wallet store (separate node)
  *   `[✅]`   unit/`GenerateContributionButton.nsf.test.ts`
    *   `[✅]`   Test: when `activeWalletInfo.balance` is below `STAGE_BALANCE_THRESHOLDS[activeStage.slug]` and active stage is NOT `paused_nsf`, button is disabled and shows "Insufficient Balance"
    *   `[✅]`   Test: when `activeWalletInfo.balance` meets threshold and active stage is NOT `paused_nsf`, button is enabled and shows "Generate {displayName}" (existing behavior preserved)
    *   `[✅]`   Test: when active stage `stageStatus === 'paused_nsf'` (from progress selector) AND balance is below threshold, button is disabled and shows "Add Funds to Resume"
    *   `[✅]`   Test: when active stage `stageStatus === 'paused_nsf'` (from progress selector) AND balance meets threshold, button is enabled and shows "Resume {displayName}"
    *   `[✅]`   Test: clicking "Resume {displayName}" calls `resumePausedNsfJobs` with `{ sessionId, stageSlug, iterationNumber }` derived from the active session/stage context — NOT `generateContributions`
    *   `[✅]`   Test: clicking "Generate {displayName}" calls `generateContributions` — NOT `resumePausedNsfJobs` — existing behavior preserved
    *   `[✅]`   Test: clicking "Resume" opens the `StageDAGProgressDialog` so the user can monitor resumed generation
    *   `[✅]`   Test: button state priority order is correct — `isSessionGenerating` > `!areAnyModelsSelected` > `!isWalletReady` > `!activeStage/!activeSession` > `!isStageReady` > `hasPausedNsf && !balanceMeetsThreshold` > `hasPausedNsf && balanceMeetsThreshold` > `!balanceMeetsThreshold` > `didGenerationFail` > `contributionsExist` > default
  *   `[✅]`   `construction`
    *   `[✅]`   No new component — all changes within the existing `GenerateContributionButton` component
    *   `[✅]`   New store subscriptions: `selectUnifiedProjectProgress` (already imported), `resumePausedNsfJobs` action
    *   `[✅]`   New derived state: `balanceMeetsThreshold` (boolean), `hasPausedNsfJobs` (boolean — derived from progress selector, NOT ephemeral state), `isResumeMode` (boolean)
  *   `[✅]`   `GenerateContributionButton.tsx`
    *   `[✅]`   Import `STAGE_BALANCE_THRESHOLDS` from `@paynless/types`
    *   `[✅]`   Add store action: `const resumePausedNsfJobs = useDialecticStore((state) => state.resumePausedNsfJobs);`
    *   `[✅]`   Read progress: `const unifiedProgress = useDialecticStore(selectUnifiedProjectProgress);` (selector already imported)
    *   `[✅]`   Compute `hasPausedNsfJobs`: derive from progress selector — `const activeStageProgress = unifiedProgress?.stagesDetail?.find(s => s.stageSlug === activeStage?.slug); const hasPausedNsfJobs = activeStageProgress?.stageStatus === 'paused_nsf';` — this is durable, survives refresh/navigation because it comes from hydrated backend data
    *   `[✅]`   Compute `balanceMeetsThreshold`: `const stageThreshold = activeStage ? STAGE_BALANCE_THRESHOLDS[activeStage.slug] ?? 0 : 0; const balanceMeetsThreshold = (activeWalletInfo.balance ?? 0) >= stageThreshold;`
    *   `[✅]`   Compute `isResumeMode`: `const isResumeMode = hasPausedNsfJobs && balanceMeetsThreshold;`
    *   `[✅]`   Update `isDisabled` (line 137): add `(hasPausedNsfJobs && !balanceMeetsThreshold)` for paused-but-broke, and `(!hasPausedNsfJobs && !balanceMeetsThreshold)` for the UX gate. The full disabled expression becomes: `isSessionGenerating || !areAnyModelsSelected || !activeStage || !activeSession || !isStageReady || !isWalletReady || (hasPausedNsfJobs && !balanceMeetsThreshold) || (!hasPausedNsfJobs && !balanceMeetsThreshold && !isResumeMode)`
    *   `[✅]`   Update `getButtonText` (line 144): insert new cases BEFORE the existing `didGenerationFail` check (line 156), AFTER the `!isStageReady` check (line 154): `if (hasPausedNsfJobs && !balanceMeetsThreshold) return "Add Funds to Resume";` then `if (hasPausedNsfJobs && balanceMeetsThreshold) return \`Resume ${displayName}\`;` then `if (!balanceMeetsThreshold) return "Insufficient Balance";`
    *   `[✅]`   Update `handleClick` (line 96): after the existing guard clause (lines 97–109), before the existing payload construction (line 119), insert: `if (isResumeMode && activeStage && activeSession) { toast.success("Resuming generation..."); setDagDialogOpen(true); await resumePausedNsfJobs({ sessionId: activeSession.id, stageSlug: activeStage.slug, iterationNumber: currentIterationNumber }); return; }`
  *   `[✅]`   integration/`GenerateContributionButton.integration.test.ts`
    *   `[✅]`   Test: render with progress showing `stageStatus: 'paused_nsf'` and low balance → button shows "Add Funds to Resume" and is disabled
    *   `[✅]`   Test: render with progress showing `stageStatus: 'paused_nsf'` and sufficient balance → button shows "Resume {stageName}" and is enabled → click → verify `resumePausedNsfJobs` called with correct params
    *   `[✅]`   Test: render with progress showing no `paused_nsf` and low balance → button shows "Insufficient Balance" and is disabled
    *   `[✅]`   Test: render with progress showing no `paused_nsf` and sufficient balance → button shows "Generate {stageName}" and is enabled (existing behavior preserved)
  *   `[✅]`   `directionality`
    *   `[✅]`   Layer: UI / presentation
    *   `[✅]`   Dependencies face inward: consumes store (selectors, actions) and types (constants)
    *   `[✅]`   No outward-facing provides — this is a leaf component
  *   `[✅]`   `requirements`
    *   `[✅]`   Paused state detection MUST come from `selectUnifiedProjectProgress` → `stageStatus === 'paused_nsf'` — this is durable across refresh, navigation, and tab close because it is hydrated from the backend on mount via `useStageRunProgressHydration`
    *   `[✅]`   The Generate button must be disabled when wallet balance is below the per-stage threshold, showing "Insufficient Balance" — UX gate preventing users from starting generations they cannot afford
    *   `[✅]`   When NSF pause is active and balance is insufficient, button shows "Add Funds to Resume" (disabled) — directing the user toward the payment resolution path
    *   `[✅]`   When NSF pause is active and balance is sufficient, button shows "Resume {displayName}" (enabled) — the user clicks the SAME button they originally used to Generate
    *   `[✅]`   Clicking "Resume" calls `resumePausedNsfJobs` (NOT `generateContributions`) — this restores original job statuses via the API → edge function → RPC path and the DAG resumes naturally through existing trigger infrastructure
    *   `[✅]`   The DAG progress dialog must open on resume click so the user can monitor resumed generation
    *   `[✅]`   All existing button states and behaviors must be preserved — new states are inserted into the priority chain without disrupting existing logic
    *   `[✅]`   Balance thresholds: thesis=200,000 / antithesis=400,000 / synthesis=1,000,000 / parenthesis=250,000 / paralysis=250,000
    *   `[✅]`   **Frontend NSF workflow note**: The full UX flow (catch NSF notification → redirect to payment portal → catch return → enable Resume) is a known future requirement but is NOT in scope for this node. This node implements the button states and resume action only. The notification-to-portal redirect flow will be a separate checklist item.
  *   `[✅]`   **Commit** `feat(ui,store) apps/web + packages/store + packages/utils + packages/types NSF protection with durable progress-based pause detection, API-layer resume, frontend notification pipeline, per-stage balance gate, and single-notification UX flow`
    *   `[✅]`   New frontend types: `ContributionGenerationPausedNsfPayload`, `STAGE_BALANCE_THRESHOLDS`, `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` in `packages/types/src/dialectic.types.ts`
    *   `[✅]`   Updated: `DialecticNotificationTypes` union, `DialecticLifecycleEvent` union, `UnifiedProjectStatus`, `DialecticActions` in `packages/types/src/dialectic.types.ts`
    *   `[✅]`   Updated: `isDialecticLifecycleEventType` in `packages/utils/src/type_guards.ts` — recognizes `paused_nsf` suffix
    *   `[✅]`   Updated: `notificationStore.ts` — new `case 'contribution_generation_paused_nsf'` for payload extraction and routing
    *   `[✅]`   Updated: `dialecticStore.ts` — `_handleContributionGenerationPausedNsf` handler with progress re-hydration, `resumePausedNsfJobs` action via API layer
    *   `[✅]`   Updated: `dialecticStore.selectors.ts` — `paused_nsf` handling in `selectUnifiedProjectProgress`
    *   `[✅]`   Modified: `StageDAGProgressDialog.tsx` — `paused_nsf` color in `STATUS_FILL`
    *   `[✅]`   Modified: `GenerateContributionButton.tsx` — balance threshold gate, progress-based paused NSF detection, resume-via-same-button UX
    *   `[✅]`   New tests: type guard tests, notification store routing tests, dialectic store NSF handler/action tests, selector paused_nsf mapping tests, DAG dialog color test, button state transition tests

## Regenerate Individual Document

### Problem Statement

Users cannot regenerate a single failed (or unsatisfactory) document without re-running the entire stage. If one document out of many fails, the user must regenerate all documents for that stage, losing the ones that succeeded. Users also want the ability to "roll the dice" on a document they already have a valid version of.

### Objectives

1. Allow a user to regenerate a specific document for specific model(s) without regenerating sibling documents or inputs.
2. Present the regeneration action per-document in the stage run checklist, with model selection when multiple models are in use.
3. Gate regeneration to the session's current stage only — documents from completed stages cannot be regenerated (future: branching/iteration).
4. Mark the original job as `superseded` so progress tracking correctly reflects the new job's status, not the old failure.
5. The cloned job is picked up by the existing worker pipeline (trigger on `INSERT ... WHERE status = 'pending'`) with zero changes to the worker.

### Expected Outcome

A user clicks a regenerate button on any document in the stage run checklist, selects which model(s) to regenerate for, and the system clones the original EXECUTE job(s), marks the originals as `superseded`, and inserts the clones as `pending`. The existing worker, RENDER pipeline, notification system, and progress hydration handle the rest. The progress tracker correctly ignores `superseded` jobs and reflects the new job's lifecycle.

### Design Decisions

- **Clone EXECUTE, not PLAN**: The EXECUTE job payload is self-contained (`model_id`, `prompt_template_id`, `output_type`, `canonicalPathParams`, `inputs`, `planner_metadata`). No re-planning is needed.
- **`parent_job_id: null`** on clones: Prevents interference with the original PLAN job's completion tracking in `handle_job_completion()`.
- **`superseded` status**: A new terminal status that `deriveStepStatuses` skips entirely, so the old failed job doesn't pollute step status when the clone succeeds.
- **Active-stage-only gate**: `generateContributions` already validates `session.current_stage.slug === payload.stageSlug`. The regenerate handler applies the same validation.
- **Model selection dialog**: The checklist already computes `perModelLabels` with per-model status. Failed/not-started models are pre-checked; completed models are unchecked (user must actively opt in).

*   `[ ]`   [DB] supabase/migrations **`superseded` job status for regenerated document jobs**
  *   `[ ]`   `objective`
    *   `[ ]`   Introduce the `superseded` terminal job status so that original jobs replaced by a regeneration clone are marked as replaced rather than remaining `failed`
    *   `[ ]`   Ensure `superseded` IS treated as a terminal status by `handle_job_completion()` — it should not wake parent jobs or prerequisite chains
    *   `[ ]`   Ensure `superseded` does NOT appear in worker-invoking trigger WHEN clauses (`on_job_status_change`, `on_new_job_created`) — the worker must never be invoked for superseded jobs
    *   `[ ]`   Ensure `superseded` is excluded from the NSF pause function `resume_paused_nsf_jobs` — superseded jobs must not be resumed
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — database schema and trigger layer
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic generation job state machine — extends the terminal status set
    *   `[ ]`   Boundary: defines the `superseded` status semantics within the existing trigger and completion infrastructure
  *   `[ ]`   `deps`
    *   `[ ]`   `handle_job_completion()` function (defined in `supabase/migrations/20260109165706_state_machine_fix.sql` line 180) — must include `superseded` in the terminal status check at line 204: `IF NEW.status NOT IN ('completed', 'failed', 'retry_loop_failed')` → add `'superseded'`
    *   `[ ]`   `on_job_status_change` trigger (defined in `supabase/migrations/20260109165706_state_machine_fix.sql` line 165) — WHEN clause must NOT include `superseded`
    *   `[ ]`   `on_new_job_created` trigger (defined in `supabase/migrations/20260220213950_conditional_on_new_job_created.sql` line 15) — WHEN clause must NOT include `superseded`
    *   `[ ]`   `resume_paused_nsf_jobs` RPC (defined in `supabase/migrations/20260302193405_nsf_pause_resume.sql`) — WHERE clause must exclude `superseded` jobs
    *   `[ ]`   No reverse dependency introduced — this migration only extends existing infrastructure
  *   `[ ]`   `context_slice`
    *   `[ ]`   Requires access to `dialectic_generation_jobs` table status values and existing trigger/function definitions
  *   `[ ]`   interface/`migration SQL`
    *   `[ ]`   `superseded` added to the terminal status set in `handle_job_completion()` line 204
    *   `[ ]`   `superseded` added to the terminal status set in `handle_job_completion()` line 209 (re-trigger guard)
    *   `[ ]`   Sibling terminal count query in `handle_job_completion()` must include `superseded` in its terminal status list
  *   `[ ]`   `construction`
    *   `[ ]`   Single migration file with `CREATE OR REPLACE FUNCTION` for `handle_job_completion()` incorporating `superseded`
    *   `[ ]`   No trigger recreation needed — existing WHEN clauses already exclude unlisted statuses
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: infrastructure (database)
    *   `[ ]`   Dependencies face inward: modifies only the job state machine
    *   `[ ]`   Provides face outward: consumed by the worker trigger system and the `regenerateDocument` handler
  *   `[ ]`   `requirements`
    *   `[ ]`   `superseded` must be terminal: `handle_job_completion()` must fire for it (to unblock any prerequisite chains if needed) and must not re-trigger on already-terminal rows
    *   `[ ]`   `superseded` must not invoke the worker: triggers must not include it in their WHEN clauses
    *   `[ ]`   `superseded` must not be resumed by `resume_paused_nsf_jobs`
    *   `[ ]`   Existing terminal statuses (`completed`, `failed`, `retry_loop_failed`) must continue to work identically

*   `[ ]`   [BE] dialectic-service/`deriveStepStatuses` **Skip `superseded` jobs in step status derivation**
  *   `[ ]`   `objective`
    *   `[ ]`   Ensure `superseded` jobs are completely invisible to progress tracking — they must not contribute to any step status flag (`hasActive`, `hasCompleted`, `hasFailed`, `hasPausedNsf`)
    *   `[ ]`   The cloned replacement job's status is the only one that matters for the step
  *   `[ ]`   `role`
    *   `[ ]`   Backend logic — progress derivation
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service — step status derivation within `getAllStageProgress`
    *   `[ ]`   Boundary: receives jobs array → produces step status map; `superseded` jobs must be filtered out before status aggregation
  *   `[ ]`   `deps`
    *   `[ ]`   DB migration node (above) — `superseded` status must exist in the database
    *   `[ ]`   Existing `ACTIVE_STATUSES`, `FAILED_STATUSES`, `PAUSED_NSF_STATUSES` sets in `deriveStepStatuses.ts`
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `deriveStepStatuses` function at `supabase/functions/dialectic-service/deriveStepStatuses.ts`
    *   `[ ]`   Job `status` field — must recognize `superseded` as a skip condition
  *   `[ ]`   interface/`dialectic.interface.ts`
    *   `[ ]`   No interface changes required — `UnifiedStageStatus` does not need a `superseded` value because superseded jobs produce no status; they are skipped
  *   `[ ]`   unit/`deriveStepStatuses.test.ts`
    *   `[ ]`   Test: a step with one `superseded` job and one `completed` job → step status is `completed` (superseded job is invisible)
    *   `[ ]`   Test: a step with one `superseded` job and one `pending` job → step status is `in_progress` (active clone is visible)
    *   `[ ]`   Test: a step with only `superseded` jobs and no other jobs → step status is `not_started` (all evidence invisible)
    *   `[ ]`   Test: a step with one `superseded` job, one `failed` job, and one `completed` job → step status is `failed` (the non-superseded failed job still counts)
  *   `[ ]`   `construction`
    *   `[ ]`   Add `const SUPERSEDED_STATUSES: Set<string> = new Set(["superseded"]);` alongside existing status sets
    *   `[ ]`   Add skip condition at line 57 (after RENDER skip, after continuation skip): `if (SUPERSEDED_STATUSES.has(job.status)) continue;`
  *   `[ ]`   `deriveStepStatuses.ts`
    *   `[ ]`   Add `SUPERSEDED_STATUSES` constant
    *   `[ ]`   Add `continue` guard for superseded jobs in the job iteration loop
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: backend logic (service)
    *   `[ ]`   Dependencies face inward: reads job status values defined by DB migration
    *   `[ ]`   Provides face outward: consumed by `getAllStageProgress` → frontend progress hydration
  *   `[ ]`   `requirements`
    *   `[ ]`   `superseded` jobs must not set any status flag (`hasActive`, `hasCompleted`, `hasFailed`, `hasPausedNsf`)
    *   `[ ]`   All existing status derivation behavior must be preserved for non-superseded jobs
    *   `[ ]`   A step with only superseded jobs and no successors must show `not_started`

*   `[ ]`   [BE] dialectic-service/`regenerateDocument` **Clone failed/completed EXECUTE jobs as new `pending` jobs for targeted document regeneration**
  *   `[ ]`   `objective`
    *   `[ ]`   Accept a request specifying session, stage, iteration, and a list of `{ jobId, modelId }` pairs identifying which EXECUTE jobs to regenerate
    *   `[ ]`   Validate that the stage matches the session's current stage (active-stage-only gate)
    *   `[ ]`   Validate that each referenced job belongs to the correct session/stage/iteration and is an EXECUTE job
    *   `[ ]`   Mark each original job as `superseded`
    *   `[ ]`   Clone each original job's row: copy `payload`, `stage_slug`, `iteration_number`, `session_id`, `user_id`, `max_retries`, `job_type`; set `status: 'pending'`, `attempt_count: 0`, `parent_job_id: null`, `prerequisite_job_id: null`, `started_at: null`, `completed_at: null`, `results: null`, `error_details: null`, `target_contribution_id: null`
    *   `[ ]`   Insert the cloned row — the existing `on_new_job_created` trigger fires and the worker picks it up
    *   `[ ]`   Return the array of new job IDs
  *   `[ ]`   `role`
    *   `[ ]`   Backend logic — edge function handler for document regeneration
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service — new handler function within the `dialectic-service` edge function
    *   `[ ]`   Boundary: receives validated request → marks originals superseded → inserts cloned jobs → returns new job IDs
  *   `[ ]`   `deps`
    *   `[ ]`   DB migration node — `superseded` status must exist
    *   `[ ]`   `dialectic_generation_jobs` table — read original job, update to `superseded`, insert clone
    *   `[ ]`   `dialectic_sessions` table — validate `current_stage_id` matches requested `stageSlug`
    *   `[ ]`   `dialectic_stages` table — resolve `current_stage_id` to slug
    *   `[ ]`   Supabase admin client — for DB operations
    *   `[ ]`   Authenticated user — for authorization (job's `user_id` must match requesting user)
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `dbClient: SupabaseClient` — admin client for DB reads/writes
    *   `[ ]`   `user: User` — authenticated user from request
    *   `[ ]`   `payload: RegenerateDocumentPayload` — `{ sessionId, stageSlug, iterationNumber, jobs: Array<{ jobId: string; modelId: string }> }`
  *   `[ ]`   interface/`dialectic.interface.ts`
    *   `[ ]`   `RegenerateDocumentPayload`: `{ sessionId: string; stageSlug: string; iterationNumber: number; jobs: Array<{ jobId: string; modelId: string }> }`
    *   `[ ]`   `RegenerateDocumentResponse`: `{ jobIds: string[] }`
    *   `[ ]`   `RegenerateDocumentAction`: `{ action: 'regenerateDocument'; payload: RegenerateDocumentPayload }`
    *   `[ ]`   Add `RegenerateDocumentAction` to the `DialecticServiceRequest` union
    *   `[ ]`   Add `regenerateDocument` to `ActionHandlers` interface
  *   `[ ]`   interface/tests/`regenerateDocument.interface.test.ts`
    *   `[ ]`   Test: `RegenerateDocumentPayload` requires `sessionId`, `stageSlug`, `iterationNumber`, and `jobs` array
    *   `[ ]`   Test: `RegenerateDocumentResponse` has `jobIds` string array
  *   `[ ]`   interface/guards/`regenerateDocument.interface.guards.ts`
    *   `[ ]`   `isRegenerateDocumentPayload(value: unknown): value is RegenerateDocumentPayload` — validates all required fields and jobs array structure
  *   `[ ]`   unit/`regenerateDocument.test.ts`
    *   `[ ]`   Test: valid request with one job → original marked `superseded`, clone inserted as `pending` with correct payload copy, returns new job ID
    *   `[ ]`   Test: valid request with multiple jobs → all originals marked `superseded`, all clones inserted, returns array of new job IDs
    *   `[ ]`   Test: stage mismatch (requested stage ≠ session's current stage) → returns 400 error, no jobs modified
    *   `[ ]`   Test: job not found → returns 404 error
    *   `[ ]`   Test: job belongs to different session → returns 403 error
    *   `[ ]`   Test: job is not an EXECUTE job → returns 400 error
    *   `[ ]`   Test: user does not own the job → returns 403 error
    *   `[ ]`   Test: cloned job has `parent_job_id: null`, `prerequisite_job_id: null`, `attempt_count: 0`, `status: 'pending'`
    *   `[ ]`   Test: cloned job preserves original's `payload`, `stage_slug`, `iteration_number`, `session_id`, `job_type`, `max_retries`
  *   `[ ]`   `construction`
    *   `[ ]`   Single exported async function `regenerateDocument(dbClient, payload, user)`
    *   `[ ]`   Returns `{ success: boolean; data?: RegenerateDocumentResponse; error?: { message: string; status?: number } }`
    *   `[ ]`   No DI beyond `dbClient` and `user` — this is a thin data-copy operation
  *   `[ ]`   `regenerateDocument.ts`
    *   `[ ]`   Validate payload fields
    *   `[ ]`   Fetch session and verify `current_stage.slug === payload.stageSlug`
    *   `[ ]`   For each job in `payload.jobs`:
      *   `[ ]`   Fetch original job by ID
      *   `[ ]`   Validate ownership (`user_id === user.id`), session match, stage match, iteration match, `job_type === 'EXECUTE'`
      *   `[ ]`   Update original job: `SET status = 'superseded'`
      *   `[ ]`   Insert clone row with fields copied from original, reset fields as specified in objective
    *   `[ ]`   Return `{ success: true, data: { jobIds } }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: backend logic (service handler)
    *   `[ ]`   Dependencies face inward: reads/writes `dialectic_generation_jobs`, reads `dialectic_sessions` and `dialectic_stages`
    *   `[ ]`   Provides face outward: consumed by `dialectic-service/index.ts` router
  *   `[ ]`   `requirements`
    *   `[ ]`   Original job must be marked `superseded` BEFORE clone is inserted to prevent race conditions with progress tracking
    *   `[ ]`   Clone must have `parent_job_id: null` to prevent interference with original PLAN completion tracking
    *   `[ ]`   Clone must have `prerequisite_job_id: null` — the document's prerequisites are already met (they were met when the original ran)
    *   `[ ]`   Active-stage-only gate: reject requests where `stageSlug` does not match `session.current_stage.slug`
    *   `[ ]`   The clone's `payload` must be an exact copy of the original's `payload` — the worker uses payload fields to determine what to generate and where to store results

*   `[ ]`   [BE] dialectic-service/`index` **Route `regenerateDocument` action to handler**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `regenerateDocument` as a routable action in the dialectic-service edge function entry point
    *   `[ ]`   Wire the action to the `regenerateDocument` handler with authentication required
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — edge function router
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service entry point — action dispatch
    *   `[ ]`   Boundary: receives HTTP request → authenticates → routes to handler → returns response
  *   `[ ]`   `deps`
    *   `[ ]`   `regenerateDocument` handler (node above) — must exist as an importable function
    *   `[ ]`   `RegenerateDocumentPayload` type from `dialectic.interface.ts`
    *   `[ ]`   Existing `ActionHandlers` interface — must include `regenerateDocument` (added in the handler node's interface section)
    *   `[ ]`   Existing `actionsRequiringAuth` array — must include `'regenerateDocument'`
    *   `[ ]`   Existing `DialecticServiceRequest` union — must include `RegenerateDocumentAction` (added in the handler node's interface section)
  *   `[ ]`   `context_slice`
    *   `[ ]`   `handlers.regenerateDocument` — the handler function
    *   `[ ]`   `adminClient` — passed to handler as `dbClient`
    *   `[ ]`   `userForJson` — authenticated user
    *   `[ ]`   `requestBody.payload` — typed as `RegenerateDocumentPayload`
  *   `[ ]`   unit/`index.test.ts`
    *   `[ ]`   Test: `regenerateDocument` action routes to handler with correct arguments
    *   `[ ]`   Test: `regenerateDocument` action without authentication returns 401
    *   `[ ]`   Test: handler success → returns 200 with `{ jobIds }` response
    *   `[ ]`   Test: handler error → returns error status with error message
  *   `[ ]`   `construction`
    *   `[ ]`   Import `regenerateDocument` from `./regenerateDocument.ts`
    *   `[ ]`   Add `'regenerateDocument'` to `actionsRequiringAuth` array
    *   `[ ]`   Add `case "regenerateDocument"` to the action switch with standard auth guard pattern
    *   `[ ]`   Wire `regenerateDocument` into `defaultHandlers` object
  *   `[ ]`   `index.ts`
    *   `[ ]`   Add import for `regenerateDocument` handler
    *   `[ ]`   Add `'regenerateDocument'` to `actionsRequiringAuth` array (line 269)
    *   `[ ]`   Add case block in switch statement (before `default:` case, after `resumePausedNsfJobs` case at line 602)
    *   `[ ]`   Add `regenerateDocument` to `defaultHandlers` object
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: infrastructure (edge function entry point)
    *   `[ ]`   Dependencies face inward: imports handler function, uses types from interface
    *   `[ ]`   Provides face outward: HTTP endpoint consumed by API client
  *   `[ ]`   `requirements`
    *   `[ ]`   Authentication is required — unauthenticated requests return 401
    *   `[ ]`   Handler receives `adminClient` (not `userClient`) as `dbClient` — consistent with other handlers like `resumePausedNsfJobs`
    *   `[ ]`   Follows exact same routing pattern as `resumePausedNsfJobs` case block

*   `[ ]`   [API] packages/api/`dialectic.api` **`regenerateDocument` API client method**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a `regenerateDocument` method to `DialecticApiClient` that calls the `dialectic-service` edge function with action `'regenerateDocument'`
    *   `[ ]`   Follow the same pattern as `resumePausedNsfJobs` method
  *   `[ ]`   `role`
    *   `[ ]`   API client — typed HTTP adapter for the edge function
  *   `[ ]`   `module`
    *   `[ ]`   `@paynless/api` — dialectic API client class
    *   `[ ]`   Boundary: accepts typed payload → posts to edge function → returns typed response
  *   `[ ]`   `deps`
    *   `[ ]`   Edge function router node (above) — `regenerateDocument` action must be routable
    *   `[ ]`   `apiClient.post` — existing HTTP post method on the base API client
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `this.apiClient.post<RegenerateDocumentResponse, DialecticServiceActionPayload>('dialectic-service', { action: 'regenerateDocument', payload })`
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   `RegenerateDocumentPayload`: `{ sessionId: string; stageSlug: string; iterationNumber: number; jobs: Array<{ jobId: string; modelId: string }> }` — mirrors the backend interface
    *   `[ ]`   `RegenerateDocumentResponse`: `{ jobIds: string[] }`
  *   `[ ]`   interface/tests/`dialectic.types.test.ts`
    *   `[ ]`   Test: `RegenerateDocumentPayload` shape contract
    *   `[ ]`   Test: `RegenerateDocumentResponse` shape contract
  *   `[ ]`   interface/guards/`type_guards.ts`
    *   `[ ]`   `isRegenerateDocumentPayload(value: unknown): value is RegenerateDocumentPayload` — if needed by consumers
    *   `[ ]`   `isRegenerateDocumentResponse(value: unknown): value is RegenerateDocumentResponse`
  *   `[ ]`   unit/`dialectic.api.test.ts`
    *   `[ ]`   Test: `regenerateDocument` calls `apiClient.post` with `{ action: 'regenerateDocument', payload }` and correct typing
    *   `[ ]`   Test: successful response returns `{ data: { jobIds: [...] }, error: null }`
    *   `[ ]`   Test: error response returns `{ data: null, error: { message, status } }`
  *   `[ ]`   `construction`
    *   `[ ]`   New `async regenerateDocument(payload: RegenerateDocumentPayload): Promise<ApiResponse<RegenerateDocumentResponse>>` method on `DialecticApiClient`
    *   `[ ]`   Follows identical pattern to `resumePausedNsfJobs` method at line 686
  *   `[ ]`   `dialectic.api.ts`
    *   `[ ]`   Add import for `RegenerateDocumentPayload`, `RegenerateDocumentResponse` from types
    *   `[ ]`   Add `regenerateDocument` method to `DialecticApiClient` class
  *   `[ ]`   `dialectic.api.mock.ts`
    *   `[ ]`   Add `regenerateDocument` mock method returning default success response
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: adapter (API client)
    *   `[ ]`   Dependencies face inward: uses types from `@paynless/types`, posts to edge function
    *   `[ ]`   Provides face outward: consumed by `@paynless/store` dialectic store action
  *   `[ ]`   `requirements`
    *   `[ ]`   Must follow the same pattern as `resumePausedNsfJobs` — post to `dialectic-service` with typed action payload
    *   `[ ]`   Must return `ApiResponse<RegenerateDocumentResponse>` with standard error handling
    *   `[ ]`   Mock must be updated for store tests

*   `[ ]`   [STORE] packages/store/`dialecticStore` **`regenerateDocument` action with progress re-hydration**
  *   `[ ]`   `objective`
    *   `[ ]`   Provide a `regenerateDocument` store action that calls `api.dialectic().regenerateDocument(payload)` and triggers progress re-hydration so the UI reflects the new job's lifecycle
    *   `[ ]`   Track the new job IDs in `generatingSessions` so the generating state is correctly reflected
    *   `[ ]`   Set `generatingForStageSlug` so the checklist shows generating spinners for the affected documents
  *   `[ ]`   `role`
    *   `[ ]`   State management — bridges UI action to API call and progress refresh
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic store — extends existing actions
    *   `[ ]`   Boundary: receives regenerate action from UI → calls API → tracks jobs → re-hydrates progress
  *   `[ ]`   `deps`
    *   `[ ]`   API client node (above) — `api.dialectic().regenerateDocument` must exist
    *   `[ ]`   Existing `hydrateAllStageProgress` action — called after successful API response to refresh progress data
    *   `[ ]`   Existing `generatingSessions` state — tracks active job IDs per session
    *   `[ ]`   Existing `generatingForStageSlug` state — identifies which stage is actively generating
    *   `[ ]`   Existing `contributionGenerationStatus` state — set to `'generating'` during regeneration
    *   `[ ]`   `api` — the API client instance, available via the store's existing infrastructure pattern (same as `generateContributions` at line 1906)
    *   `[ ]`   No reverse dependency introduced — the store is consumed by UI components
  *   `[ ]`   `context_slice`
    *   `[ ]`   `api.dialectic().regenerateDocument`: from `@paynless/api` via the store's existing API infrastructure
    *   `[ ]`   `RegenerateDocumentPayload`, `RegenerateDocumentResponse`: from `@paynless/types`
    *   `[ ]`   `hydrateAllStageProgress`: existing store action
    *   `[ ]`   Existing store state: `generatingSessions`, `contributionGenerationStatus`, `generatingForStageSlug`
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   Add `regenerateDocument: (payload: RegenerateDocumentPayload) => Promise<ApiResponse<RegenerateDocumentResponse>>` to `DialecticActions` (alongside existing actions like `generateContributions`)
  *   `[ ]`   unit/`dialecticStore.regenerateDocument.test.ts`
    *   `[ ]`   Test: `regenerateDocument` calls `api.dialectic().regenerateDocument(payload)` with correct `{ sessionId, stageSlug, iterationNumber, jobs }`
    *   `[ ]`   Test: on successful API response, `regenerateDocument` adds returned job IDs to `generatingSessions[sessionId]`
    *   `[ ]`   Test: on successful API response, `regenerateDocument` sets `contributionGenerationStatus` to `'generating'` and `generatingForStageSlug` to `payload.stageSlug`
    *   `[ ]`   Test: on successful API response, `regenerateDocument` calls `hydrateAllStageProgress` to refresh progress data
    *   `[ ]`   Test: on API failure, `regenerateDocument` does NOT modify `generatingSessions` or `contributionGenerationStatus`
    *   `[ ]`   Test: on API failure, `regenerateDocument` returns the error response
  *   `[ ]`   `construction`
    *   `[ ]`   `regenerateDocument` is a public action exposed on the store interface
    *   `[ ]`   Follows the same pattern as `generateContributions` for job tracking and status management
  *   `[ ]`   `dialecticStore.ts`
    *   `[ ]`   Add `regenerateDocument(payload: RegenerateDocumentPayload)` action:
      *   `[ ]`   Set `contributionGenerationStatus = 'generating'`, `generatingForStageSlug = payload.stageSlug`
      *   `[ ]`   Call `api.dialectic().regenerateDocument(payload)`
      *   `[ ]`   On success: add returned `jobIds` to `generatingSessions[payload.sessionId]`, call `get().hydrateAllStageProgress(...)`, return response
      *   `[ ]`   On failure: reset `contributionGenerationStatus = 'idle'`, reset `generatingForStageSlug = null`, return error response
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: application (state management)
    *   `[ ]`   Dependencies face inward: consumes API layer (`api.dialectic()`) and types
    *   `[ ]`   Provides face outward: consumed by UI component (StageRunChecklist regenerate button)
  *   `[ ]`   `requirements`
    *   `[ ]`   The action must call through the API layer: store → `api.dialectic().regenerateDocument()` → edge function — NOT directly to Supabase
    *   `[ ]`   After successful regeneration, `hydrateAllStageProgress` must be called to refresh progress — the progress tracker is the source of truth for UI state transitions
    *   `[ ]`   Job IDs must be tracked in `generatingSessions` so lifecycle events from the worker are correctly processed by existing `_handleDialecticLifecycleEvent` handlers
    *   `[ ]`   `generatingForStageSlug` must be set so the StageRunChecklist shows generating spinners for affected documents

*   `[ ]`   [UI] apps/web/`StageRunChecklist` **Per-document regenerate button with model selection dialog**
  *   `[ ]`   `objective`
    *   `[ ]`   Replace the static status circle indicators with clickable icon-buttons that trigger document regeneration
    *   `[ ]`   Color the icon-button based on document status: green for completed, red for failed, amber for not started — preserving the existing visual language
    *   `[ ]`   Keep the `Loader2` spinner for `generating`/`continuing` states as non-clickable (cannot regenerate mid-generation)
    *   `[ ]`   On click, show a model-selection confirmation dialog listing all models for that document with checkboxes
    *   `[ ]`   Pre-check models whose status is `Failed` or `Not started`; leave `Completed` models unchecked (user must actively opt in to re-roll a successful document)
    *   `[ ]`   Disable the regenerate button when the document's stage is not the session's current stage
    *   `[ ]`   On confirmation, call the `regenerateDocument` store action with the selected `{ jobId, modelId }` pairs
  *   `[ ]`   `role`
    *   `[ ]`   UI / presentation — user-facing regeneration trigger
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic UI — StageRunChecklist component within the stage sidebar
    *   `[ ]`   Boundary: reads document status from store selectors → presents regeneration UI → dispatches store action
  *   `[ ]`   `deps`
    *   `[ ]`   Store node (above) — `regenerateDocument` action must exist on the store
    *   `[ ]`   `RegenerateDocumentPayload` type from `@paynless/types`
    *   `[ ]`   Existing `perModelLabels` computed in `computeStageRunChecklistData` — provides `modelId`, `displayName`, `statusLabel` per model per document
    *   `[ ]`   Existing `StageDocumentRow` type — provides `entry` (with `documentKey`, `status`, `jobId`, `stepKey`) and `perModelLabels`
    *   `[ ]`   Existing store selectors: `selectActiveContextSessionId`, `selectActiveStageSlug`
    *   `[ ]`   Session's `current_stage_id` — to determine if the document's stage is the active stage (for the gate)
    *   `[ ]`   `useDialecticStore` — for accessing store state and actions
    *   `[ ]`   No reverse dependency introduced — leaf component
  *   `[ ]`   `context_slice`
    *   `[ ]`   `regenerateDocument: state.regenerateDocument` — store action
    *   `[ ]`   `activeSessionDetail` — for `current_stage_id` and `iteration_count`
    *   `[ ]`   `activeStageSlug` — to determine if the current stage matches the session's current stage
    *   `[ ]`   `perModelLabels` — already computed per document row, provides model status for pre-checking
    *   `[ ]`   `entry.jobId` — the original EXECUTE job ID per model (needed for the payload)
    *   `[ ]`   Note: `entry.jobId` in `StageDocumentEntry` currently holds the first rendered entry's job ID, which is a RENDER job ID, not an EXECUTE job ID. The dialog needs the EXECUTE job ID. This may require enriching `perModelLabels` or `StageDocumentEntry` with per-model EXECUTE job IDs from `stageRunProgress` descriptors.
  *   `[ ]`   interface/`StageRunChecklist types`
    *   `[ ]`   Extend `PerModelLabel` to include `jobId: string | null` — the EXECUTE job ID for that model's document, sourced from the rendered document descriptor's `job_id` field (which tracks the EXECUTE job, not the RENDER job)
    *   `[ ]`   `RegenerateDocumentDialogProps`: `{ open: boolean; documentKey: string; stageSlug: string; perModelLabels: PerModelLabel[]; onConfirm: (selectedJobs: Array<{ jobId: string; modelId: string }>) => void; onCancel: () => void }`
  *   `[ ]`   unit/`StageRunChecklist.test.tsx`
    *   `[ ]`   Test: completed document renders green clickable icon-button (not static circle)
    *   `[ ]`   Test: failed document renders red clickable icon-button
    *   `[ ]`   Test: not-started document renders amber clickable icon-button
    *   `[ ]`   Test: generating document renders non-clickable spinner (existing behavior preserved)
    *   `[ ]`   Test: clicking icon-button opens model selection dialog with correct model list
    *   `[ ]`   Test: dialog pre-checks failed models, leaves completed models unchecked
    *   `[ ]`   Test: confirming dialog with selected models calls `regenerateDocument` with correct payload
    *   `[ ]`   Test: icon-button is disabled when document's stage ≠ session's current stage
    *   `[ ]`   Test: canceling dialog does not call `regenerateDocument`
  *   `[ ]`   `construction`
    *   `[ ]`   `RegenerateDocumentDialog` — small inline component or extracted component for the model selection confirmation
    *   `[ ]`   Replace `<span>` circle elements with `<button>` icon-buttons retaining the same color classes
    *   `[ ]`   Add state for dialog open/close and selected document context
    *   `[ ]`   Wire dialog confirm to `regenerateDocument` store action
  *   `[ ]`   `StageRunChecklist.tsx`
    *   `[ ]`   Add `regenerateDocument` from store to component's store subscription
    *   `[ ]`   Add `activeSessionDetail` to determine current stage for the gate
    *   `[ ]`   Add state: `regenerateDialogOpen`, `regenerateDialogContext` (documentKey, stageSlug, perModelLabels)
    *   `[ ]`   Replace static `<span>` circles (lines 538-554) with `<button>` elements that open the dialog on click
    *   `[ ]`   Preserve `Loader2` spinner for generating/continuing states as non-clickable
    *   `[ ]`   Implement `RegenerateDocumentDialog` with checkboxes per model, pre-fill logic, confirm/cancel
    *   `[ ]`   Enrich `perModelLabels` computation (in `computeStageRunChecklistData`) to include the EXECUTE `jobId` per model by reading from `stageRunProgress` document descriptors
    *   `[ ]`   On confirm: construct `RegenerateDocumentPayload` and call `regenerateDocument`
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: UI / presentation
    *   `[ ]`   Dependencies face inward: consumes store (selectors, actions) and types
    *   `[ ]`   No outward-facing provides — this is a leaf component
  *   `[ ]`   `requirements`
    *   `[ ]`   Visual language must be preserved: green = completed, red = failed, amber = not started, blue spinner = generating
    *   `[ ]`   The regenerate button must be visually distinguishable as clickable (not just a colored dot) — an icon-button with the status color
    *   `[ ]`   The model selection dialog must pre-check only failed/not-started models — completed models require active user opt-in
    *   `[ ]`   Active-stage-only gate: the button is disabled (or hidden) for documents on stages that are not the session's current stage
    *   `[ ]`   The dialog must show model display names (not IDs) — these are already available in `perModelLabels.displayName`
    *   `[ ]`   If only one model is selected for the session, skip the dialog and regenerate directly (single-model fast path)
    *   `[ ]`   The user must be able to cancel without side effects
  *   `[ ]`   **Commit** `feat(be,api,store,ui) Regenerate individual documents — superseded job status, EXECUTE job cloning, API client, store action, and per-document regenerate button with model selection`
    *   `[ ]`   New migration: `superseded` terminal job status in `handle_job_completion()`
    *   `[ ]`   Updated: `deriveStepStatuses.ts` — skip `superseded` jobs in status derivation
    *   `[ ]`   New handler: `regenerateDocument.ts` in `dialectic-service` — clone EXECUTE jobs, mark originals superseded
    *   `[ ]`   Updated: `dialectic-service/index.ts` — route `regenerateDocument` action
    *   `[ ]`   Updated: `dialectic.interface.ts` — `RegenerateDocumentPayload`, `RegenerateDocumentResponse`, `RegenerateDocumentAction`, `ActionHandlers`
    *   `[ ]`   New API method: `regenerateDocument()` in `packages/api/src/dialectic.api.ts`
    *   `[ ]`   Updated: `dialectic.api.mock.ts` — mock for `regenerateDocument`
    *   `[ ]`   New frontend types: `RegenerateDocumentPayload`, `RegenerateDocumentResponse` in `packages/types/src/dialectic.types.ts`
    *   `[ ]`   Updated: `DialecticActions` in `packages/types/src/dialectic.types.ts` — `regenerateDocument` action signature
    *   `[ ]`   New store action: `regenerateDocument` in `packages/store/src/dialecticStore.ts`
    *   `[ ]`   Updated: `StageRunChecklist.tsx` — per-document regenerate icon-buttons, model selection dialog, active-stage gate
    *   `[ ]`   New tests: migration validation, `deriveStepStatuses` superseded tests, `regenerateDocument` handler unit tests, API client tests, store action tests, StageRunChecklist UI tests

# ToDo

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
      
   - Support user-provided API keys for their preferred providers 

   - Regenerate existing document from user feedback & edits 

   - Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
   AND/OR
   - Let the user pick/rate their preferred version and drop the others 

   - Use a gentle color schema to differentiate model outputs visually / at a glance 

   - When doc loads for the first time, position at top 

   - Search across documents for key terms 

   - Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

   - Add optional outputs for selected stages
   -- A "landing page" output for the proposal stage
   --- Landing page
   --- Hero banner
   --- Call to action
   --- Email sign up 
   -- A "financial analysis" output for the "refinement" stage
   --- 1/3/5 year 
   --- Conservative / base / aggressive
   --- IS, BS, CF 
   -- A "generate next set of work" for the implementation stage 

   - DynamicProgressBar uses formal names instead of friendly names
   - SessionContributionsDisplayCard uses formal names instead of friendly names 
   - SessionInfoCard uses formal names instead of friendly names 

   - Move "Generate" button into StageRunCard left hand side where the icons are 

    - The full UX flow (catch NSF notification → redirect to payment portal → catch return → enable Resume) is a known future requirement but is NOT in scope for this node. This node implements the button states and resume action only. The notification-to-portal redirect flow will be a separate checklist item.
