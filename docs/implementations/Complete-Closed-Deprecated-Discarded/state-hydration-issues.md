# Front-End State Hydration Issues

## Date: 2025-03-10

## Overview

The dialectic UI has persistent state management problems where realtime updates don't reflect correctly in the UI, requiring page refreshes. The root causes are:

1. `progress.jobs` is never updated by realtime events, breaking document counting
2. "Done" label is derived from step statuses instead of document completion
3. `activeStageSlug` is ephemeral (memory-only), so the user's viewed stage is lost on refresh
4. `SubmitResponsesButton` has accumulated contradictory logic from repeated fix attempts
5. `submitStageResponses` ignores the `updatedSession` returned by the server, leaving `activeSessionDetail.current_stage_id` stale
6. Stage tab focus is not persisted server-side

---

## Data Model Context

### How stages produce documents

- All stages are defined by "outputs_required", which is an array of objects the stage must produce to complete
- All stages are defined by "inputs_required", which is an array of objects the stage must have available to begin
- All inputs_required are produced by a prior stages' outputs_required 
- inputs_required may come from any prior stage
- Each stage has a **recipe** with **steps**
- Steps create **jobs**
- A step with `output_type: document_key` triggers an **EXECUTE** job
- When the EXECUTE job completes, it triggers a **RENDER** job
- The RENDER job produces a output_type: rendered_document (the final artifact of the step->job branch on the DAG)
- A rendered document with `status: 'completed'` is the **only proof** that work for that `(documentKey, modelId)` pair is done


### Stage completion semantics

- A session has M selected models and each stage has T template document keys (from the recipe's valid markdown keys)
- The stage expects T×M composite documents (each model produces each template)
- A logical document (template) is "done" when all M model versions are rendered with `status: 'completed'`
- The stage is done **IFF all T logical documents are done** — meaning all T×M rendered documents exist
- Steps being completed does NOT prove the stage is done. Steps are prerequisites. Documents are proof.
- It is entirely possible for all steps to complete but documents to fail (invalid response, render failure, etc.)
- We count the T logical documents for the "number" of documents the stage will produce, so the value is fixed
- We only display a document as being "Done" if "TxM/T===1", that is, all models completed their document
- A stage cannot advance if <"TxM/T===1" documents exist, since future stage inputs_required expect all models to have produced a document

### Stage ordering

- Database rows in `dialectic_stages` are **unordered**
- Stage order is determined by following the transition chain: `dialectic_stage_transitions.source_stage_id → target_stage_id` starting from `dialectic_process_templates.starting_stage_id`
- `stages[0]` from an unsorted array is NOT the first stage
- `selectSortedStages` and `getSortedStagesFromTemplate` correctly resolve order from transitions

---

## Issue 1: "n/n Done" count doesn't update in realtime

### Symptom
StageTabCard shows "0/3" even after all documents are rendered. Works correctly after page refresh.

### Root cause
`selectUnifiedProjectProgress` (selectors.ts:929-953) counts completed documents by cross-referencing `progress.jobs`:

```
for each logicalDocumentKey in validMarkdownKeys:
    expectedModelIds = modelIds from progress.jobs where job.documentKey matches
    if expectedModelIds is empty → SKIP (continue)  // ← THE BUG
    check if all expectedModelIds have completed descriptors
```

**`progress.jobs` is only written in two places:**
- `hydrateStageProgressLogic` (documents.ts:1720) — server fetch
- `hydrateAllStageProgressLogic` (documents.ts:1819) — server fetch

The realtime lifecycle handlers (`handleRenderCompletedLogic`, `handleDocumentCompletedLogic`, etc.) update `progress.documents` and `progress.stepStatuses` but **never touch `progress.jobs`**.

During live operation:
1. `render_completed` fires → updates `progress.documents[compositeKey].status` to `completed`
2. Selector runs → iterates `validMarkdownKeys` → looks up `progress.jobs` → jobs is stale/empty → `expectedModelIds` is empty → `continue` → **completedDocuments stays 0**

On refresh, `hydrateAllStageProgress` repopulates `progress.jobs` from the server, and the selector works.

### Fix
Every lifecycle event carries `job_id`, `document_key`, `modelId`, `step_key`, `sessionId`, `stageSlug`, `iterationNumber` (via `DocumentLifecyclePayload`). The handlers should upsert into `progress.jobs` when processing each event. This is what the events are for.

---

## Issue 2: "Done" label disagrees with "n/n" count

### Symptom
"Done" badge appears even when count shows "0/3".

### Root cause
Two different data paths:
- **"n/n"** = `completedDocuments / totalDocuments` from `selectUnifiedProjectProgress` document counting (broken by Issue 1)
- **"Done"** = `isComplete` which is `detail.stageStatus === "completed"` (StageTabCard.tsx:199)

`stageStatus` is derived from **step statuses** (selectors.ts:893-921), which ARE updated by realtime events. So steps can show "completed" while document counts show "0/n".

### Fix
`isComplete` must be derived from document completion, not step completion: `completedDocuments === totalDocuments && totalDocuments > 0`. Once Issue 1 is fixed (jobs updated in realtime), this derivation will be accurate in real time.

---

## Issue 3: Stage resets to first on refresh

### Symptom
User is on stage 3, refreshes page, UI shows stage 1.

### Root cause
`activeStageSlug` lives only in Zustand memory. Initial value is `null`. On page load:
- `fetchProcessTemplate` (store.ts:607-615) sets `activeContextStage` (the object) but NOT `activeStageSlug` when it determines stage from the session
- `StageTabCard` useEffect (StageTabCard.tsx:221-234) sees `activeStageSlug` is null, falls back
- `current_stage_id` on the session represents **logical progress**, not **viewing preference** — they are different concepts (user on stage 3 may be reviewing stage 1)

### Fix
Add a `viewing_stage_id` column to `dialectic_sessions`. On stage tab click, update the server. On load, read from the server. No localStorage, no guessing, no defaults. Pattern exists from ModelSelector which updates dialectic_sessions.selected_model_ids whenever the user interacts with ModelSelector values. StageTabCard tab -> store selector -> store -> api -> edge handler -> edge function -> database. 

---

## Issue 4: SubmitResponsesButton visibility and interactivity

### Symptom
Button doesn't appear when documents are done. Button appears disabled. Requires page refresh.

### Root cause (compound)

**4a. `allDocumentsAvailable` depends on broken document counting (Issue 1)**
Uses `activeStageDetail` from `selectUnifiedProjectProgress`. If document counting can't work without fresh `progress.jobs`, `completedDocuments` is 0 → `allDocumentsAvailable` is false → button disabled.

**4b. `viewedStageMatchesAppStage` compares two semantically different values**
Compares `activeContextStage?.slug` (logical session stage) with `activeStageSlug` (user's tab selection). These are set by different code paths at different times.

**4c. `isFinalStage` defaults to `true` when data is missing**
If template isn't loaded, returns `true` (store.ts:157-159). This is wrong — absence of data is not proof of finality. Should not render if template is unavailable, if the template is not available the application is in a fundamentally invalid state.

**4d. Accumulated contradictory logic from repeated fix attempts**
The button has become nearly impossible to reason about.

### Correct conditions (6 total, all must be true)

1. **Logical and viewing stage match** — the stage the user is viewing IS the stage the application is logically at (`dialectic_sessions.current_stage_id` matches `dialectic_sessions.viewing_stage_id`, which means `session.current_stage_id` === `session.viewing_stage_id`)
2. **Current stage is finished** — all T×M documents completed, `outputs_required` for the logical stage are satisfied for all models chosen for the stage
3. **Next stage is ready** — all `inputs_required` for the next stage are available
4. **Current stage has no active jobs** — no jobs paused, running, or failed
5. **Next stage has no progress** — no jobs started, paused, running, or failed
6. **A next stage exists** — has an entry in `dialectic_stage_transitions.target_stage_id` (not the final stage)

If any precondition data is unavailable (template not loaded, session not loaded, etc.), the button should not render. No guessing, no defaults.

---

## Issue 5: Stage advancement doesn't reliably reflect in UI

### Symptom
After clicking Submit on a stage, the UI doesn't visually advance. Most commonly observed on Review (stage order: Proposal → Review → Refinement → Planning → Implementation) but the root cause affects all stages. Must refresh, navigate to the correct stage, click Submit again.

### Root cause (confirmed)
`submitStageResponses` succeeds on the server and receives `response.data.updatedSession` (with new `current_stage_id`) but **completely ignores it** (store.ts:2378-2385). It only clears `isSubmittingStageResponses`.

Then `fetchDialecticProjectDetails(preserveContext: true)` is called. The `preserveContext: true` flag skips `setActiveDialecticContext` (store.ts:486-493), so `activeSessionDetail` is NOT updated with the new `current_stage_id`. The user's viewing state should only be preserved if they are viewing a different stage than the application's logical stage (don't force a user to move their focus if they have changed it, they may be working on prior stage outputs while the current stage generates, or some other valid choice). 

### Why Review is most commonly affected — UNKNOWN
The `updatedSession` being ignored affects all stages equally. On other stages, lifecycle events from downstream generation incidentally sync `activeSessionDetail` (contribution handlers at store.ts:1742-1744 copy the session from `currentProjectDetail` into `activeSessionDetail`). However, this should also happen for Review since Refinement should trigger generation. The specific reason Review fails more frequently than other stages is not yet determined. May require runtime logging to isolate.

### Fix
When `submitStageResponses` succeeds, immediately apply `response.data.updatedSession` to `activeSessionDetail` and update the session within `currentProjectDetail.dialectic_sessions`. Do not rely on a background refetch or lifecycle events as a side-channel to update this.

---

## Issue 6: Stage tab doesn't stay on focused stage

### Symptom
Page refresh always resets to first sorted stage (not logical stage, not last viewed stage), ignoring where the user was looking.

### Root cause
Same as Issue 3. No persistent record of viewing stage. The initialization code falls through to the first sorted stage rather than the user's actual position.

### Fix
Same as Issue 3. Server-side `viewing_stage_id` column.

---

## Key Files

| File | Role |
|------|------|
| `packages/store/src/dialecticStore.ts` | Main Zustand store, lifecycle event handlers, actions |
| `packages/store/src/dialecticStore.documents.ts` | Hydration logic (`hydrateStageProgressLogic`, `hydrateAllStageProgressLogic`), render/document event handlers |
| `packages/store/src/dialecticStore.selectors.ts` | `selectUnifiedProjectProgress` (document counting), `selectStageProgressSummary`, `selectSortedStages` |
| `apps/web/src/components/dialectic/StageTabCard.tsx` | Stage sidebar with "n/n Done" display |
| `apps/web/src/components/dialectic/SubmitResponsesButton.tsx` | Stage advancement button |
| `apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx` | Mounts hydration/polling/sync hooks |
| `apps/web/src/hooks/useActiveStageSync.ts` | Syncs `activeContextStage` object from `activeStageSlug` |
| `apps/web/src/hooks/useStageProgressPolling.ts` | Polls `hydrateAllStageProgress` during generation |
| `apps/web/src/hooks/useStageRunProgressHydration.ts` | Initial hydration on mount |
| `packages/types/src/dialectic.types.ts` | Type definitions for all payloads, store shape, etc. |

## Key Data Structures

### `StageRunProgressSnapshot` (the `progress` object)
```typescript
{
  stepStatuses: Record<string, StepStatus>;      // Updated by realtime ✓
  documents: Record<CompositeKey, Descriptor>;    // Updated by realtime ✓
  jobProgress: Record<string, JobProgressEntry>;  // Partially updated
  progress: { completedSteps, totalSteps, failedSteps }; // Only by hydration
  jobs: JobProgressDto[];                          // ONLY by hydration ✗ ← ROOT PROBLEM
}
```

### `JobProgressDto` (entries in `progress.jobs`)
```typescript
{
  id: string;           // job_id from event
  status: string;       // mapped from event type
  jobType: string;      // 'RENDER', etc.
  stepKey: string;      // from event
  modelId: string;      // from event
  documentKey: string;  // from event
  parentJobId: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  modelName: string;
}
```

### Lifecycle event → job status mapping needed
| Event | Job Status |
|-------|-----------|
| `document_started` / `execute_started` | `processing` |
| `render_started` | `processing` |
| `render_completed` | `completed` |
| `document_completed` / `execute_completed` | `completed` |
| `job_failed` | `failed` |
| `contribution_generation_retrying` | `retrying` |
| `contribution_generation_paused_nsf` | `paused_nsf` |

---

## Resolved Questions

1. **Condition 3 for SubmitResponsesButton** ("next stage inputs_required satisfied"): Recipes are already in the store (`recipesByStageSlug`). The recipes define `inputs_required` and `outputs_required` per step. `outputs_required` from prior stages feed `inputs_required` in future stages. This can and should be checked client-side using the recipe data already available in selectors.

2. **Condition 4 for SubmitResponsesButton** ("no jobs paused, running, or failed"): Retries are **updates to existing jobs** (the job status changes, not a new job). Continuations are new jobs but are not counted in job totals since they are unpredictable; they are related back to the triggering job. A "failed" job means "we never got a document for this job." Since having a document IS the `outputs_required` value, and outputs from prior stages feed inputs in future stages, the document's existence is the authoritative done condition. Condition 4 is therefore a belt-and-suspenders check consistent with condition 2 — if all documents exist, no job should be in a failed state (retries update the job in-place).

3. **`useStageProgressPolling` and `useActiveStageSync` hooks**: Once `progress.jobs` is updated in realtime and stage focus is server-persisted, the aggressive polling (1s interval, triple-refresh on completion) may be unnecessary overhead. These hooks may be candidates for removal or significant simplification.

## Open Questions

1. **Why Review specifically fails more often** — The `updatedSession`-ignored bug and stale `activeSessionDetail` affect all stages. Lifecycle events from downstream generation should incidentally sync the session on all stages, not just non-Review ones. Need runtime logging to isolate what's different about the Review → Refinement transition.

2. **Condition 6 data availability** — The template, transitions, and stages are required before a project can even display (StageTabCard can't load without them). So condition 6 ("next stage exists") should never need a fallback — if we're inside a project, we have the transition graph. The current `isFinalStage` defaulting to `true` on missing data is nonsensical and should be removed entirely.
