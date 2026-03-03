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
*   `[ ]`   [API] packages/api/src/`dialectic.api` **Add `resumePausedNsfJobs` method to `DialecticApiClient` interface and implementation**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a `resumePausedNsfJobs` method to the `DialecticApiClient` interface in `packages/types/src/dialectic.types.ts` and the `DialecticApiClientImpl` class in `packages/api/src/dialectic.api.ts` so that the frontend store can call the backend resume handler through the established API layer
    *   `[ ]`   Add `ResumePausedNsfJobsPayload` and `ResumePausedNsfJobsResponse` frontend types
  *   `[ ]`   `role`
    *   `[ ]`   Port — API layer bridge between the frontend store and the backend edge function
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic API client — extends the existing standardized interface for frontend-to-backend communication
    *   `[ ]`   Boundary: receives typed payload from store → sends `POST { action: 'resumePausedNsfJobs', payload }` to `dialectic-service` → returns typed response
  *   `[ ]`   `deps`
    *   `[ ]`   Node 7 (resume handler) — the `dialectic-service` edge function must have the `resumePausedNsfJobs` routing case before this API method can successfully call it
    *   `[ ]`   `this.apiClient.post` — existing infrastructure for sending typed POST requests to edge functions
    *   `[ ]`   `DialecticServiceActionPayload` — existing generic type used by `apiClient.post` for the request body shape
    *   `[ ]`   No reverse dependency introduced — this is consumed by the dialectic store (Node 11)
  *   `[ ]`   `context_slice`
    *   `[ ]`   `apiClient.post<TResponse, TPayload>(edgeFunctionName, payload)` — the standard method for calling edge functions, used by `getAllStageProgress` (line 659), `generateContributions` (line 521), and all other API methods
    *   `[ ]`   `DialecticApiClient` interface (dialectic.types.ts line 1043) — the interface that the store depends on
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   `ResumePausedNsfJobsPayload` — `{ sessionId: string; stageSlug: string; iterationNumber: number }` — matches the backend `ResumePausedNsfJobsPayload` in `dialectic.interface.ts`
    *   `[ ]`   `ResumePausedNsfJobsResponse` — `{ resumedCount: number }` — matches the backend response
    *   `[ ]`   Add `resumePausedNsfJobs(payload: ResumePausedNsfJobsPayload): Promise<ApiResponse<ResumePausedNsfJobsResponse>>;` to the `DialecticApiClient` interface (line 1043)
  *   `[ ]`   unit/`dialectic.api.test.ts`
    *   `[ ]`   Test: `resumePausedNsfJobs` calls `apiClient.post` with `action: 'resumePausedNsfJobs'` and the correct payload
    *   `[ ]`   Test: on success, returns `{ data: { resumedCount: N }, status: 200 }`
    *   `[ ]`   Test: on error, returns `{ error: { message: '...' }, status: 500 }`
  *   `[ ]`   `construction`
    *   `[ ]`   No new class — method added to existing `DialecticApiClientImpl`
  *   `[ ]`   `dialectic.api.ts`
    *   `[ ]`   Add import of `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` from `@paynless/types` (add to existing import block)
    *   `[ ]`   Add method following the `getAllStageProgress` pattern (line 656):
      *   `[ ]`   `async resumePausedNsfJobs(payload: ResumePausedNsfJobsPayload): Promise<ApiResponse<ResumePausedNsfJobsResponse>>`
      *   `[ ]`   Body: `const response = await this.apiClient.post<ResumePausedNsfJobsResponse, DialecticServiceActionPayload>('dialectic-service', { action: 'resumePausedNsfJobs', payload });`
      *   `[ ]`   Error logging and return following the `getAllStageProgress` pattern
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: port (API client)
    *   `[ ]`   Dependencies face inward: depends on `apiClient` (infra) for HTTP communication
    *   `[ ]`   Provides face outward: consumed by the dialectic store (Node 11) via `api.dialectic().resumePausedNsfJobs(payload)`
  *   `[ ]`   `requirements`
    *   `[ ]`   The API method must follow the same pattern as `getAllStageProgress` and `generateContributions` — `POST` to `dialectic-service` with `action` and `payload`
    *   `[ ]`   The frontend payload and response types must mirror the backend types
    *   `[ ]`   The method must be declared on the `DialecticApiClient` interface so the store depends on the interface, not the implementation
    *   `[ ]`   Error handling must follow the existing pattern — log errors, return `ApiResponse` with error details
  *   `[ ]`   **Commit** `feat(be,api) dialectic-service resume handler, routing, and API client method for NSF job resume`
    *   `[ ]`   New handler: `resumePausedNsfJobs.ts` in `dialectic-service/`
    *   `[ ]`   Modified: `dialectic.interface.ts` — new payload, response, and action types
    *   `[ ]`   Modified: `index.ts` — routing case, `ActionHandlers` interface, `defaultHandlers` entry
    *   `[ ]`   New frontend types: `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` in `dialectic.types.ts`
    *   `[ ]`   Modified: `DialecticApiClient` interface and `DialecticApiClientImpl` — new `resumePausedNsfJobs` method

### Node 9
*   `[ ]`   [FE] packages/utils/src/`type_guards` **Recognize `contribution_generation_paused_nsf` in `isDialecticLifecycleEventType` and add event type string to frontend types**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `'contribution_generation_paused_nsf'` to the `DialecticNotificationTypes` string union in `packages/types/src/dialectic.types.ts` so the frontend type system recognizes the new event
    *   `[ ]`   Update `isDialecticLifecycleEventType` in `packages/utils/src/type_guards.ts` to accept the `'paused_nsf'` suffix on the `contribution_generation_` prefix, so notifications arriving via Realtime are correctly identified and routed to the lifecycle event pipeline in `notificationStore`
  *   `[ ]`   `role`
    *   `[ ]`   Port — type validation gate between incoming Realtime notifications and the dialectic lifecycle event handler
  *   `[ ]`   `module`
    *   `[ ]`   Type guard — `isDialecticLifecycleEventType` is the gatekeeper at `notificationStore.ts` line 70; if it returns `false`, the notification is silently dropped and never reaches `_handleDialecticLifecycleEvent`
    *   `[ ]`   Boundary: validates a string is a known dialectic event type
  *   `[ ]`   `deps`
    *   `[ ]`   `DialecticNotificationTypes` from `@paynless/types` — the string union that the guard narrows to; must include `'contribution_generation_paused_nsf'` before the guard can match it
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   The guard function is pure — no injected dependencies, no side effects
    *   `[ ]`   Confirm no concrete imports from higher or lateral layers
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   Add `'contribution_generation_paused_nsf'` to the `DialecticNotificationTypes` string union (line 827) — this is the type-level representation of the event string
  *   `[ ]`   interface/tests/`type_guards.test.ts`
    *   `[ ]`   Contract: `isDialecticLifecycleEventType('contribution_generation_paused_nsf')` must return `true` — add to the existing `'should return true for valid dialectic event types'` test block (line 151)
  *   `[ ]`   unit/`type_guards.test.ts`
    *   `[ ]`   Test: `isDialecticLifecycleEventType('contribution_generation_paused_nsf')` returns `true` (add assertion to existing valid-types test at line 151)
  *   `[ ]`   `construction`
    *   `[ ]`   No new functions or objects — modification to an existing guard function
  *   `[ ]`   `type_guards.ts`
    *   `[ ]`   In the `contribution_generation_` prefix suffix check (line 210–215), add `|| suffix === 'paused_nsf'` to the return expression
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: port (shared utility)
    *   `[ ]`   Dependencies face inward: depends on `DialecticNotificationTypes` (type-only, domain)
    *   `[ ]`   Provides face outward: consumed by `notificationStore.ts` (Node 10) at line 70 to gate lifecycle event routing
  *   `[ ]`   `requirements`
    *   `[ ]`   `isDialecticLifecycleEventType('contribution_generation_paused_nsf')` must return `true` so the notification store routes the event
    *   `[ ]`   All existing type guard tests must continue to pass — no regression on existing event types
    *   `[ ]`   `DialecticNotificationTypes` must include the new string literal so TypeScript's type narrowing works correctly downstream

### Node 10
*   `[ ]`   [STORE] packages/store/src/`notificationStore` **Route `contribution_generation_paused_nsf` notifications to dialectic store lifecycle handler**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a `ContributionGenerationPausedNsfPayload` interface to the frontend type system in `packages/types/src/dialectic.types.ts` and add it to the `DialecticLifecycleEvent` union so the notification store can construct and forward the typed event
    *   `[ ]`   Add a `case 'contribution_generation_paused_nsf'` to the payload extraction switch in `handleIncomingNotification` (line 289) so that incoming NSF pause notifications are extracted, validated, and forwarded to `_handleDialecticLifecycleEvent`
  *   `[ ]`   `role`
    *   `[ ]`   Application — notification routing bridge between Supabase Realtime and the dialectic store
  *   `[ ]`   `module`
    *   `[ ]`   Notification store — the `handleIncomingNotification` method's switch statement (lines 289–529) performs per-type payload extraction for all lifecycle events
    *   `[ ]`   Boundary: receives a `Notification` from Realtime, extracts typed fields from `notification.data`, constructs a `DialecticLifecycleEvent`, forwards to `_handleDialecticLifecycleEvent`
  *   `[ ]`   `deps`
    *   `[ ]`   Node 9 (type guard) — `isDialecticLifecycleEventType` must recognize `'contribution_generation_paused_nsf'` before this case is reachable; `DialecticNotificationTypes` must include the string
    *   `[ ]`   `DialecticLifecycleEvent` from `@paynless/types` — must include `ContributionGenerationPausedNsfPayload` so the constructed event can be assigned to `eventPayload`
    *   `[ ]`   `useDialecticStore.getState()._handleDialecticLifecycleEvent` — existing consumer, no change
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `notification.data`: `NotificationData | null` — the raw JSONB payload from the notifications table row
    *   `[ ]`   `notification.type`: `string` — already narrowed to `DialecticNotificationTypes` by the `isDialecticLifecycleEventType` check at line 70
    *   `[ ]`   Confirm no concrete imports from higher or lateral layers
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   `ContributionGenerationPausedNsfPayload` — `{ type: 'contribution_generation_paused_nsf'; sessionId: string; projectId: string; stageSlug: string; iterationNumber: number }` — mirrors the backend payload shape from `notification.service.types.ts` (Node 2), follows the existing frontend payload pattern (e.g., `ContributionGenerationCompletePayload` at line 906)
    *   `[ ]`   Add `ContributionGenerationPausedNsfPayload` to the `DialecticLifecycleEvent` union (line 1004)
  *   `[ ]`   unit/`notificationStore.test.ts` (or existing test file for notification store)
    *   `[ ]`   Test: when `handleIncomingNotification` receives a notification with `type: 'contribution_generation_paused_nsf'`, `is_internal_event: true`, and `data: { type: 'contribution_generation_paused_nsf', sessionId: 'x', projectId: 'y', stageSlug: 'thesis', iterationNumber: 1 }`, the dialectic store's `_handleDialecticLifecycleEvent` is called with a correctly shaped `ContributionGenerationPausedNsfPayload`
    *   `[ ]`   Test: when `data` is missing `sessionId`, `stageSlug`, or `iterationNumber`, the event is NOT forwarded — `eventPayload` remains `null` and a warning is logged
    *   `[ ]`   Test: when `data` is missing `projectId`, the event is NOT forwarded
  *   `[ ]`   `construction`
    *   `[ ]`   No new functions or components — modification to the existing `switch (type)` block in `handleIncomingNotification`
  *   `[ ]`   `notificationStore.ts`
    *   `[ ]`   Add `case 'contribution_generation_paused_nsf':` to the switch block (after the `contribution_generation_complete` case at line 325), with field extraction and validation following the existing pattern:
      *   `[ ]`   Guard: `typeof data['sessionId'] === 'string' && typeof data['projectId'] === 'string' && typeof data['stageSlug'] === 'string' && typeof data['iterationNumber'] === 'number'`
      *   `[ ]`   Construct payload: `eventPayload = { type, sessionId: data['sessionId'], projectId: data['projectId'], stageSlug: data['stageSlug'], iterationNumber: data['iterationNumber'] }`
      *   `[ ]`   `break;`
    *   `[ ]`   The existing forwarding logic at line 531 (`if (eventPayload) { useDialecticStore.getState()._handleDialecticLifecycleEvent?.(eventPayload); }`) handles the rest — no additional changes needed
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: application (state management / notification routing)
    *   `[ ]`   Dependencies face inward: consumes `DialecticLifecycleEvent` (types), `isDialecticLifecycleEventType` (port)
    *   `[ ]`   Provides face outward: forwards constructed events to `dialecticStore._handleDialecticLifecycleEvent` (Node 11)
  *   `[ ]`   `requirements`
    *   `[ ]`   `contribution_generation_paused_nsf` notifications must be extracted, validated, and forwarded to `_handleDialecticLifecycleEvent` using the same pattern as all other lifecycle events
    *   `[ ]`   Invalid payloads (missing required fields) must be logged and dropped — not forwarded with partial data
    *   `[ ]`   All existing notification routing must continue to work — no regression on existing event types
    *   `[ ]`   The `ContributionGenerationPausedNsfPayload` frontend type must mirror the backend type shape from `notification.service.types.ts`

### Node 11
*   `[ ]`   [STORE] packages/store/src/`dialecticStore` **NSF pause notification handler, resume action via API layer, and progress re-hydration trigger**
  *   `[ ]`   `objective`
    *   `[ ]`   Handle the `contribution_generation_paused_nsf` lifecycle event (routed by `notificationStore` via Node 10) by clearing `generatingSessions` for the affected session and triggering `hydrateAllStageProgress` so the progress tracker durably reflects the `paused_nsf` state — NO ephemeral in-memory `nsfPausedContext` state
    *   `[ ]`   Provide a `resumePausedNsfJobs` action that calls `api.dialectic().resumePausedNsfJobs(payload)` (Node 8) and triggers `hydrateAllStageProgress` on success so the progress tracker refreshes to show resumed jobs
    *   `[ ]`   The source of truth for whether jobs are paused is the progress tracker (via `selectUnifiedProjectProgress` → `paused_nsf` stage/step status from Nodes 5–6), NOT ephemeral store state
  *   `[ ]`   `role`
    *   `[ ]`   State management — bridges backend notifications to progress re-hydration and provides the resume action via the API layer
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic store — extends the existing `_handleDialecticLifecycleEvent` router and adds the resume action
    *   `[ ]`   Boundary: receives lifecycle event → clears generating state → re-hydrates progress; receives resume action from UI → calls API → re-hydrates progress
  *   `[ ]`   `deps`
    *   `[ ]`   Node 8 (API layer) — `api.dialectic().resumePausedNsfJobs` must exist so the store can call the backend through the API layer
    *   `[ ]`   Node 10 (notificationStore) — must route the notification and forward the constructed `ContributionGenerationPausedNsfPayload` to `_handleDialecticLifecycleEvent`
    *   `[ ]`   Existing `_handleDialecticLifecycleEvent` router (line 1481) — must add a new `case` for `'contribution_generation_paused_nsf'`
    *   `[ ]`   Existing `generatingSessions` state — the pause handler must clear the affected session so the button transitions from "Generating..." to the paused state
    *   `[ ]`   Existing `hydrateAllStageProgress` action (line 2707) — called to refresh progress data from the backend after pause/resume events
    *   `[ ]`   `api` — the API client instance, available via the store's existing infrastructure pattern (same as `generateContributions` at line 1906)
    *   `[ ]`   No reverse dependency — the store is consumed by UI components and selectors (Nodes 12–14)
  *   `[ ]`   `context_slice`
    *   `[ ]`   `api.dialectic().resumePausedNsfJobs`: from `@paynless/api` via the store's existing API infrastructure (same pattern as `api.dialectic().generateContributions` at line 1906)
    *   `[ ]`   `ContributionGenerationPausedNsfPayload`: from `@paynless/types` (added in Node 10)
    *   `[ ]`   `hydrateAllStageProgress`: existing store action at line 2707
    *   `[ ]`   Existing store state shape: `generatingSessions`, `contributionGenerationStatus`, `generatingForStageSlug`
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   Add `resumePausedNsfJobs: (payload: ResumePausedNsfJobsPayload) => Promise<ApiResponse<ResumePausedNsfJobsResponse>>` to `DialecticActions` (line 665) — uses the same `ResumePausedNsfJobsPayload` and `ResumePausedNsfJobsResponse` types defined in Node 8
    *   `[ ]`   Add `_handleContributionGenerationPausedNsf: (event: ContributionGenerationPausedNsfPayload) => void` to `DialecticActions` (line 755, alongside existing private handlers)
    *   `[ ]`   NO `nsfPausedContext` in `DialecticStateValues` — the paused state is read from the progress tracker via selectors (Node 12)
  *   `[ ]`   unit/`dialecticStore.nsf.test.ts`
    *   `[ ]`   Test: `_handleContributionGenerationPausedNsf` clears the affected session from `generatingSessions` and resets `contributionGenerationStatus` and `generatingForStageSlug`
    *   `[ ]`   Test: `_handleContributionGenerationPausedNsf` calls `hydrateAllStageProgress` with `{ sessionId, iterationNumber, userId, projectId }` from the payload so the progress tracker refreshes to show `paused_nsf`
    *   `[ ]`   Test: `_handleDialecticLifecycleEvent` routes `type: 'contribution_generation_paused_nsf'` to `_handleContributionGenerationPausedNsf`
    *   `[ ]`   Test: `resumePausedNsfJobs` calls `api.dialectic().resumePausedNsfJobs(payload)` with correct `{ sessionId, stageSlug, iterationNumber }`
    *   `[ ]`   Test: on successful API response, `resumePausedNsfJobs` calls `hydrateAllStageProgress` to refresh progress data
    *   `[ ]`   Test: on API failure, `resumePausedNsfJobs` shows a toast error and does NOT call `hydrateAllStageProgress`
    *   `[ ]`   Test: on API failure, user can retry — the action does not leave the store in a broken state
  *   `[ ]`   `construction`
    *   `[ ]`   `_handleContributionGenerationPausedNsf` is a private handler method, not directly callable from outside the store
    *   `[ ]`   `resumePausedNsfJobs` is a public action exposed on the store interface
    *   `[ ]`   NO `nsfPausedContext` state variable — paused state is derived from the progress tracker
  *   `[ ]`   `dialecticStore.ts`
    *   `[ ]`   Add `_handleContributionGenerationPausedNsf(payload: ContributionGenerationPausedNsfPayload)` handler:
      *   `[ ]`   Clear the session from `generatingSessions`: `set(state => { state.contributionGenerationStatus = 'idle'; state.generatingForStageSlug = null; })`
      *   `[ ]`   Trigger progress re-hydration: `get().hydrateAllStageProgress({ sessionId: payload.sessionId, iterationNumber: payload.iterationNumber, userId: get().currentProjectDetail?.user_id ?? '', projectId: payload.projectId })`
    *   `[ ]`   Add routing case in `_handleDialecticLifecycleEvent` (line 1484): when `type` is `'contribution_generation_paused_nsf'`, call `handlers._handleContributionGenerationPausedNsf(payload)`
    *   `[ ]`   Add `resumePausedNsfJobs(payload: ResumePausedNsfJobsPayload)` action:
      *   `[ ]`   Call `api.dialectic().resumePausedNsfJobs(payload)` — NOT `supabase.rpc()` directly
      *   `[ ]`   On success: call `get().hydrateAllStageProgress(...)` to refresh progress, return the API response
      *   `[ ]`   On failure: show toast error, return the API error response — progress tracker still shows `paused_nsf` so the user can retry
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: application (state management)
    *   `[ ]`   Dependencies face inward: consumes API layer (`api.dialectic()`) and types — does NOT depend on Supabase client directly for resume
    *   `[ ]`   Provides face outward: consumed by UI components (Nodes 13–14) and selectors (Node 12)
  *   `[ ]`   `requirements`
    *   `[ ]`   `contribution_generation_paused_nsf` lifecycle event must be routed to the correct handler via the existing `_handleDialecticLifecycleEvent` switch
    *   `[ ]`   The pause handler must clear `generatingSessions` / `contributionGenerationStatus` / `generatingForStageSlug` so the UI button exits "Generating..." state
    *   `[ ]`   The pause handler must trigger `hydrateAllStageProgress` so the progress tracker fetches fresh data showing `paused_nsf` step/stage statuses — this is the durable hydration mechanism
    *   `[ ]`   The resume action must call through the API layer: store → `api.dialectic().resumePausedNsfJobs()` → edge function → RPC — NOT directly to `supabase.rpc()`
    *   `[ ]`   After successful resume, `hydrateAllStageProgress` must be called to refresh progress — the progress tracker is the source of truth for UI state transitions
    *   `[ ]`   Resume failure must leave the progress tracker unchanged (still showing `paused_nsf`) — the user can retry

### Node 12
*   `[ ]`   [STORE] packages/store/src/`dialecticStore.selectors` **Handle `paused_nsf` in `selectUnifiedProjectProgress` and add `paused_nsf` to `UnifiedProjectStatus`**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `'paused_nsf'` to the `UnifiedProjectStatus` type union in `packages/types/src/dialectic.types.ts` so the frontend progress display system can represent paused steps and stages
    *   `[ ]`   Update the step status mapping in `selectUnifiedProjectProgress` (line 870) to map `'paused_nsf'` raw step status to `'paused_nsf'` `UnifiedProjectStatus` — currently unmapped statuses default to `'not_started'`, which would silently hide the paused state
    *   `[ ]`   Update the stage status derivation in `selectUnifiedProjectProgress` to set `stageStatus` to `'paused_nsf'` when any step is paused and none have failed
  *   `[ ]`   `role`
    *   `[ ]`   Application — progress data transformation layer between raw backend progress and UI display
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic store selectors — extends `selectUnifiedProjectProgress` to handle the new status
    *   `[ ]`   Boundary: receives raw step statuses from hydrated progress → transforms to `UnifiedProjectStatus` values for UI consumption
  *   `[ ]`   `deps`
    *   `[ ]`   Nodes 5–6 (backend progress) — the backend must return `paused_nsf` as a valid step/stage status before the selector encounters it
    *   `[ ]`   Node 11 (store) — `hydrateAllStageProgress` must have been triggered so the store contains fresh progress data with `paused_nsf` statuses
    *   `[ ]`   `UnifiedProjectStatus` type (dialectic.types.ts line 575) — must be extended with `'paused_nsf'`
    *   `[ ]`   No reverse dependency introduced — consumed by UI components (Nodes 13–14)
  *   `[ ]`   `context_slice`
    *   `[ ]`   `selectUnifiedProjectProgress` (line 803): the main progress selector that transforms raw step statuses into `UnifiedProjectStatus` values
    *   `[ ]`   Step status mapping (line 870): `raw === 'failed' ? 'failed' : raw === 'completed' ? 'completed' : raw === 'in_progress' || raw === 'waiting_for_children' ? 'in_progress' : 'not_started'` — does not handle `paused_nsf`
    *   `[ ]`   Stage status derivation (line 876): `if (stepStatus === 'failed') stageStatus = 'failed';` — does not handle `paused_nsf`
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   Add `'paused_nsf'` to `UnifiedProjectStatus` (line 575): `'not_started' | 'in_progress' | 'completed' | 'failed' | 'paused_nsf'`
  *   `[ ]`   unit/`dialecticStore.selectors.test.ts`
    *   `[ ]`   Test: when a step's raw status is `'paused_nsf'`, `selectUnifiedProjectProgress` maps it to `UnifiedProjectStatus` `'paused_nsf'`
    *   `[ ]`   Test: when any step is `'paused_nsf'` and none are `'failed'`, the stage status is `'paused_nsf'`
    *   `[ ]`   Test: when a step is `'paused_nsf'` and another is `'failed'`, the stage status is `'failed'` (failure takes priority)
    *   `[ ]`   Test: existing `'in_progress'`, `'completed'`, `'failed'`, `'not_started'` step/stage mappings continue to work unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   No new functions — modifications to existing `selectUnifiedProjectProgress` selector
  *   `[ ]`   `dialecticStore.selectors.ts`
    *   `[ ]`   Update step status mapping (line 870): add `raw === 'paused_nsf' ? 'paused_nsf'` to the ternary chain — `raw === 'failed' ? 'failed' : raw === 'completed' ? 'completed' : raw === 'in_progress' || raw === 'waiting_for_children' ? 'in_progress' : raw === 'paused_nsf' ? 'paused_nsf' : 'not_started'`
    *   `[ ]`   Update stage status derivation (line 876): add `paused_nsf` check after `failed`: `if (stepStatus === 'failed') stageStatus = 'failed'; else if (stepStatus === 'paused_nsf' && stageStatus !== 'failed') stageStatus = 'paused_nsf';`
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: application (state derivation)
    *   `[ ]`   Dependencies face inward: consumes hydrated progress data (store state) and `UnifiedProjectStatus` type (domain)
    *   `[ ]`   Provides face outward: consumed by `StageDAGProgressDialog` (Node 13) and `GenerateContributionButton` (Node 14) via the selector
  *   `[ ]`   `requirements`
    *   `[ ]`   `paused_nsf` raw step status must map to `paused_nsf` `UnifiedProjectStatus` — NOT `not_started`, NOT `failed`
    *   `[ ]`   `paused_nsf` stage status must be set when any step is paused and no steps have failed
    *   `[ ]`   `failed` still takes priority over `paused_nsf` at the stage level
    *   `[ ]`   All existing status mappings must be preserved

### Node 13
*   `[ ]`   [UI] apps/web/src/components/dialectic/`StageDAGProgressDialog` **Add `paused_nsf` color to `STATUS_FILL` map**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a `paused_nsf` entry to the `STATUS_FILL` record (line 15) so that DAG nodes with `paused_nsf` status render with a distinct visual color instead of falling back to `undefined`
  *   `[ ]`   `role`
    *   `[ ]`   UI / presentation — visual mapping for the new status in the DAG progress display
  *   `[ ]`   `module`
    *   `[ ]`   DAG progress dialog — extends the status-to-color mapping
    *   `[ ]`   Boundary: receives `UnifiedProjectStatus` per step → maps to fill color for SVG rendering
  *   `[ ]`   `deps`
    *   `[ ]`   Node 12 (selectors) — `selectUnifiedProjectProgress` must return `paused_nsf` as a valid `UnifiedProjectStatus` for steps/stages before this color is used
    *   `[ ]`   `UnifiedProjectStatus` from `@paynless/types` — must include `'paused_nsf'` (added in Node 12)
    *   `[ ]`   No reverse dependency — this is a leaf UI component
  *   `[ ]`   `context_slice`
    *   `[ ]`   `STATUS_FILL` record (line 15): `Record<UnifiedProjectStatus, string>` — maps each status to a hex color
    *   `[ ]`   Once `UnifiedProjectStatus` includes `paused_nsf`, TypeScript will enforce a compile error until `STATUS_FILL` has a matching entry
  *   `[ ]`   unit/`StageDAGProgressDialog.test.ts`
    *   `[ ]`   Test: when a step has status `paused_nsf`, the rendered DAG node uses the `paused_nsf` fill color (amber/orange: `'#f97316'`)
  *   `[ ]`   `construction`
    *   `[ ]`   No new components — single-line addition to the existing `STATUS_FILL` record
  *   `[ ]`   `StageDAGProgressDialog.tsx`
    *   `[ ]`   Add `paused_nsf: '#f97316',` to the `STATUS_FILL` record (line 15, after `failed: '#ef4444'`) — orange to visually distinguish from yellow (`in_progress`) and red (`failed`), signaling "attention needed but recoverable"
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: UI / presentation
    *   `[ ]`   Dependencies face inward: consumes `UnifiedProjectStatus` type
    *   `[ ]`   No outward-facing provides — leaf component
  *   `[ ]`   `requirements`
    *   `[ ]`   `paused_nsf` must have a distinct color from `in_progress` (yellow) and `failed` (red) — orange (`#f97316`) conveys "needs attention but recoverable"
    *   `[ ]`   TypeScript must compile without error — `STATUS_FILL` must be exhaustive for all `UnifiedProjectStatus` values

### Node 14
*   `[ ]`   [UI] apps/web/src/components/dialectic/`GenerateContributionButton` **Per-stage balance threshold gate, paused-NSF detection from progress tracker, and resume-via-same-button UX**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a per-stage balance threshold check that disables the Generate button when the user's wallet balance is below the minimum required for the active stage — this is the UX gate, the first line of defense against NSF
    *   `[ ]`   Detect when jobs are paused due to NSF by reading `stageStatus === 'paused_nsf'` from `selectUnifiedProjectProgress` (Node 12) — NOT from ephemeral in-memory state — and adjust the button to show "Add Funds to Resume" (disabled, balance too low) or "Resume {stageName}" (enabled, balance sufficient)
    *   `[ ]`   When the user clicks "Resume", call `resumePausedNsfJobs` from the store (Node 11) instead of `generateContributions` — same button, different action based on progress-derived context
  *   `[ ]`   `role`
    *   `[ ]`   UI / presentation — the user-facing control for initiating, gating, and resuming dialectic generation
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic contribution generation UI — extends the existing `GenerateContributionButton` component
    *   `[ ]`   Boundary: reads wallet balance + progress selector → renders button with appropriate text/disabled state → dispatches generate or resume action on click
  *   `[ ]`   `deps`
    *   `[ ]`   Node 11 (store) — `resumePausedNsfJobs` action must exist on the dialectic store
    *   `[ ]`   Node 12 (selectors) — `selectUnifiedProjectProgress` must return `stageStatus: 'paused_nsf'` for paused stages — this is the source of truth for detecting the paused state
    *   `[ ]`   `selectUnifiedProjectProgress` from `@paynless/store` (already imported at line 3) — provides `stagesDetail[].stageStatus` which may be `'paused_nsf'`
    *   `[ ]`   `useWalletStore` / `selectActiveChatWalletInfo` (already imported, line 9–10) — the `activeWalletInfo` object must include a `balance` field. **Discovery potential**: verify the wallet info type includes a numeric `balance` property; if not, this requires a type extension in the wallet store which would be a separate node.
    *   `[ ]`   `useDialecticStore` (already imported) — used for `resumePausedNsfJobs` action
    *   `[ ]`   `@paynless/types` — for `getDisplayName` (already imported) and `STAGE_BALANCE_THRESHOLDS` constant (new)
    *   `[ ]`   No reverse dependency — this is a leaf UI component
  *   `[ ]`   `context_slice`
    *   `[ ]`   `activeWalletInfo.balance`: `number` — current wallet token balance
    *   `[ ]`   `selectUnifiedProjectProgress(state)`: returns `UnifiedProjectProgress` — `stagesDetail[].stageStatus` is checked for `'paused_nsf'` to detect the paused state for the active stage
    *   `[ ]`   `resumePausedNsfJobs`: action from dialectic store (Node 11)
    *   `[ ]`   `activeStage.slug`: `string` — used to look up threshold and match against progress data
    *   `[ ]`   `STAGE_BALANCE_THRESHOLDS`: `Record<string, number>` — per-stage minimum balance constants
  *   `[ ]`   interface/`dialectic.types.ts`
    *   `[ ]`   `STAGE_BALANCE_THRESHOLDS` constant in `@paynless/types`: `{ thesis: 200000, antithesis: 400000, synthesis: 1000000, parenthesis: 250000, paralysis: 250000 }` — values provided by product owner based on observed stage token costs. Keyed by stage slug string.
    *   `[ ]`   Verify `activeWalletInfo` type includes a numeric `balance` field — if missing, this is a **discovery** requiring a type/selector extension in the wallet store (separate node)
  *   `[ ]`   unit/`GenerateContributionButton.nsf.test.ts`
    *   `[ ]`   Test: when `activeWalletInfo.balance` is below `STAGE_BALANCE_THRESHOLDS[activeStage.slug]` and active stage is NOT `paused_nsf`, button is disabled and shows "Insufficient Balance"
    *   `[ ]`   Test: when `activeWalletInfo.balance` meets threshold and active stage is NOT `paused_nsf`, button is enabled and shows "Generate {displayName}" (existing behavior preserved)
    *   `[ ]`   Test: when active stage `stageStatus === 'paused_nsf'` (from progress selector) AND balance is below threshold, button is disabled and shows "Add Funds to Resume"
    *   `[ ]`   Test: when active stage `stageStatus === 'paused_nsf'` (from progress selector) AND balance meets threshold, button is enabled and shows "Resume {displayName}"
    *   `[ ]`   Test: clicking "Resume {displayName}" calls `resumePausedNsfJobs` with `{ sessionId, stageSlug, iterationNumber }` derived from the active session/stage context — NOT `generateContributions`
    *   `[ ]`   Test: clicking "Generate {displayName}" calls `generateContributions` — NOT `resumePausedNsfJobs` — existing behavior preserved
    *   `[ ]`   Test: clicking "Resume" opens the `StageDAGProgressDialog` so the user can monitor resumed generation
    *   `[ ]`   Test: button state priority order is correct — `isSessionGenerating` > `!areAnyModelsSelected` > `!isWalletReady` > `!activeStage/!activeSession` > `!isStageReady` > `hasPausedNsf && !balanceMeetsThreshold` > `hasPausedNsf && balanceMeetsThreshold` > `!balanceMeetsThreshold` > `didGenerationFail` > `contributionsExist` > default
  *   `[ ]`   `construction`
    *   `[ ]`   No new component — all changes within the existing `GenerateContributionButton` component
    *   `[ ]`   New store subscriptions: `selectUnifiedProjectProgress` (already imported), `resumePausedNsfJobs` action
    *   `[ ]`   New derived state: `balanceMeetsThreshold` (boolean), `hasPausedNsfJobs` (boolean — derived from progress selector, NOT ephemeral state), `isResumeMode` (boolean)
  *   `[ ]`   `GenerateContributionButton.tsx`
    *   `[ ]`   Import `STAGE_BALANCE_THRESHOLDS` from `@paynless/types`
    *   `[ ]`   Add store action: `const resumePausedNsfJobs = useDialecticStore((state) => state.resumePausedNsfJobs);`
    *   `[ ]`   Read progress: `const unifiedProgress = useDialecticStore(selectUnifiedProjectProgress);` (selector already imported)
    *   `[ ]`   Compute `hasPausedNsfJobs`: derive from progress selector — `const activeStageProgress = unifiedProgress?.stagesDetail?.find(s => s.stageSlug === activeStage?.slug); const hasPausedNsfJobs = activeStageProgress?.stageStatus === 'paused_nsf';` — this is durable, survives refresh/navigation because it comes from hydrated backend data
    *   `[ ]`   Compute `balanceMeetsThreshold`: `const stageThreshold = activeStage ? STAGE_BALANCE_THRESHOLDS[activeStage.slug] ?? 0 : 0; const balanceMeetsThreshold = (activeWalletInfo.balance ?? 0) >= stageThreshold;`
    *   `[ ]`   Compute `isResumeMode`: `const isResumeMode = hasPausedNsfJobs && balanceMeetsThreshold;`
    *   `[ ]`   Update `isDisabled` (line 137): add `(hasPausedNsfJobs && !balanceMeetsThreshold)` for paused-but-broke, and `(!hasPausedNsfJobs && !balanceMeetsThreshold)` for the UX gate. The full disabled expression becomes: `isSessionGenerating || !areAnyModelsSelected || !activeStage || !activeSession || !isStageReady || !isWalletReady || (hasPausedNsfJobs && !balanceMeetsThreshold) || (!hasPausedNsfJobs && !balanceMeetsThreshold && !isResumeMode)`
    *   `[ ]`   Update `getButtonText` (line 144): insert new cases BEFORE the existing `didGenerationFail` check (line 156), AFTER the `!isStageReady` check (line 154): `if (hasPausedNsfJobs && !balanceMeetsThreshold) return "Add Funds to Resume";` then `if (hasPausedNsfJobs && balanceMeetsThreshold) return \`Resume ${displayName}\`;` then `if (!balanceMeetsThreshold) return "Insufficient Balance";`
    *   `[ ]`   Update `handleClick` (line 96): after the existing guard clause (lines 97–109), before the existing payload construction (line 119), insert: `if (isResumeMode && activeStage && activeSession) { toast.success("Resuming generation..."); setDagDialogOpen(true); await resumePausedNsfJobs({ sessionId: activeSession.id, stageSlug: activeStage.slug, iterationNumber: currentIterationNumber }); return; }`
  *   `[ ]`   integration/`GenerateContributionButton.integration.test.ts`
    *   `[ ]`   Test: render with progress showing `stageStatus: 'paused_nsf'` and low balance → button shows "Add Funds to Resume" and is disabled
    *   `[ ]`   Test: render with progress showing `stageStatus: 'paused_nsf'` and sufficient balance → button shows "Resume {stageName}" and is enabled → click → verify `resumePausedNsfJobs` called with correct params
    *   `[ ]`   Test: render with progress showing no `paused_nsf` and low balance → button shows "Insufficient Balance" and is disabled
    *   `[ ]`   Test: render with progress showing no `paused_nsf` and sufficient balance → button shows "Generate {stageName}" and is enabled (existing behavior preserved)
  *   `[ ]`   `directionality`
    *   `[ ]`   Layer: UI / presentation
    *   `[ ]`   Dependencies face inward: consumes store (selectors, actions) and types (constants)
    *   `[ ]`   No outward-facing provides — this is a leaf component
  *   `[ ]`   `requirements`
    *   `[ ]`   Paused state detection MUST come from `selectUnifiedProjectProgress` → `stageStatus === 'paused_nsf'` — this is durable across refresh, navigation, and tab close because it is hydrated from the backend on mount via `useStageRunProgressHydration`
    *   `[ ]`   The Generate button must be disabled when wallet balance is below the per-stage threshold, showing "Insufficient Balance" — UX gate preventing users from starting generations they cannot afford
    *   `[ ]`   When NSF pause is active and balance is insufficient, button shows "Add Funds to Resume" (disabled) — directing the user toward the payment resolution path
    *   `[ ]`   When NSF pause is active and balance is sufficient, button shows "Resume {displayName}" (enabled) — the user clicks the SAME button they originally used to Generate
    *   `[ ]`   Clicking "Resume" calls `resumePausedNsfJobs` (NOT `generateContributions`) — this restores original job statuses via the API → edge function → RPC path and the DAG resumes naturally through existing trigger infrastructure
    *   `[ ]`   The DAG progress dialog must open on resume click so the user can monitor resumed generation
    *   `[ ]`   All existing button states and behaviors must be preserved — new states are inserted into the priority chain without disrupting existing logic
    *   `[ ]`   Balance thresholds: thesis=200,000 / antithesis=400,000 / synthesis=1,000,000 / parenthesis=250,000 / paralysis=250,000
    *   `[ ]`   **Frontend NSF workflow note**: The full UX flow (catch NSF notification → redirect to payment portal → catch return → enable Resume) is a known future requirement but is NOT in scope for this node. This node implements the button states and resume action only. The notification-to-portal redirect flow will be a separate checklist item.
  *   `[ ]`   **Commit** `feat(ui,store) apps/web + packages/store + packages/utils + packages/types NSF protection with durable progress-based pause detection, API-layer resume, frontend notification pipeline, per-stage balance gate, and single-notification UX flow`
    *   `[ ]`   New frontend types: `ContributionGenerationPausedNsfPayload`, `STAGE_BALANCE_THRESHOLDS`, `ResumePausedNsfJobsPayload`, `ResumePausedNsfJobsResponse` in `packages/types/src/dialectic.types.ts`
    *   `[ ]`   Updated: `DialecticNotificationTypes` union, `DialecticLifecycleEvent` union, `UnifiedProjectStatus`, `DialecticActions` in `packages/types/src/dialectic.types.ts`
    *   `[ ]`   Updated: `isDialecticLifecycleEventType` in `packages/utils/src/type_guards.ts` — recognizes `paused_nsf` suffix
    *   `[ ]`   Updated: `notificationStore.ts` — new `case 'contribution_generation_paused_nsf'` for payload extraction and routing
    *   `[ ]`   Updated: `dialecticStore.ts` — `_handleContributionGenerationPausedNsf` handler with progress re-hydration, `resumePausedNsfJobs` action via API layer
    *   `[ ]`   Updated: `dialecticStore.selectors.ts` — `paused_nsf` handling in `selectUnifiedProjectProgress`
    *   `[ ]`   Modified: `StageDAGProgressDialog.tsx` — `paused_nsf` color in `STATUS_FILL`
    *   `[ ]`   Modified: `GenerateContributionButton.tsx` — balance threshold gate, progress-based paused NSF detection, resume-via-same-button UX
    *   `[ ]`   New tests: type guard tests, notification store routing tests, dialectic store NSF handler/action tests, selector paused_nsf mapping tests, DAG dialog color test, button state transition tests

    
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