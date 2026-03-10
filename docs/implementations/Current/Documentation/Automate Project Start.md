# Automate Project Start

## 1. Current flow (summary)

1. **Main / dashboard** → user clicks "New Project" (or "Start New Project") → navigates to `/dialectic/new`.
2. **Create project page** (`CreateDialecticProjectPage` with `CreateDialecticProjectForm`) → user fills form → clicks **"Create Project"** → `createDialecticProject(payload)` runs → on success **navigate to `/dialectic/${response.data.id}`** (project details).
3. **Project details page** (`DialecticProjectDetailsPage`) → user clicks **"Start New Session"** → `startDialecticSession({ projectId, selectedModelIds: [], stageSlug: initialStage.slug })` → on success **navigate to `/dialectic/${project.id}/session/${newSession.id}`**.
4. **Session page** (`DialecticSessionDetailsPage`) → user picks models in `SessionInfoCard` (via `AIModelSelector`) → **Generate** button in `GenerateContributionButton` becomes enabled when `selectedModels.length > 0` and other conditions (wallet, balance, stage ready) → user clicks **Generate** → `generateContributions(payload)` runs.

The "Create Project" button only creates the project and sends the user to the project details page. Session creation, model choice, and generation are separate manual steps.

---

## 2. Relevant code locations

| Concern | Location |
|--------|----------|
| Create Project submit | `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx` — `onSubmit` (lines 266–297): calls `createDialecticProject`, then `navigate(\`/dialectic/${response.data.id}\`)`. |
| Start New Session | `apps/web/src/pages/DialecticProjectDetailsPage.tsx` — `handleStartNewSession` (lines 48–70): needs `project`, `initialStage`; calls `startDialecticSession({ projectId, selectedModelIds: [], stageSlug })`, then `navigate(\`/dialectic/${project.id}/session/${newSession.id}\`)`. |
| Session context / models | `packages/store/src/dialecticStore.ts`: `activateProjectAndSessionContextForDeepLink` (2524–2557) fetches project and session; `fetchAndSetCurrentSessionDetails` sets `selectedModels` from `fetchedSession.selected_models`. When the user lands on the session URL, models come from the session's `selected_models` (backed by DB `selected_model_ids`). |
| Generate button enablement | `apps/web/src/components/dialectic/GenerateContributionButton.tsx`: disabled when `!areAnyModelsSelected`, `!activeStage`, `!activeSession`, `!isStageReady`, `!isWalletReady`, or `!balanceMeetsThreshold`. `selectedModels` comes from store `selectSelectedModels`. |
| Starting generation | Same component: `handleClick` builds `GenerateContributionsPayload` and calls `generateContributions(payload)`. |
| GenerateContributionsPayload | `packages/types/src/dialectic.types.ts`: `{ sessionId, projectId, stageSlug, iterationNumber, continueUntilComplete, walletId }`. |
| Backend session creation | `supabase/functions/dialectic-service/startSession.ts`: reads `selectedModelIds` from payload (line 41), inserts session with `selected_model_ids: selectedModelIds ?? []` (line 288). Session response maps ids to `selected_models` (lines 329–334). |
| Default models | No domain-level or template-level "default models" exist. Model list comes from `modelCatalog` (store: `fetchAIModelCatalog` / `listModelCatalog`). A new `is_default_generation` flag on `ai_providers` is required. |
| Wallet / NSF gating | `packages/store/src/walletStore.selectors.ts`: `selectActiveChatWalletInfo` returns `ActiveChatWalletInfo` (`{ status, walletId, balance, ... }`). Button checks `status === 'ok'`, `walletId` truthy, and `balance >= STAGE_BALANCE_THRESHOLDS[stageSlug]`. Thresholds: thesis=200k, antithesis=400k, synthesis=1M, parenthesis=250k, paralysis=250k. |
| API adapter | `packages/api/src/dialectic.api.ts`: `startSession` and `generateContributions` both pass payloads through unchanged to the edge function. No mapping layer exists. |

### Pre-existing bugs to fix as part of this work

1. **Type mismatch: `selectedModels` vs `selectedModelIds`.** The frontend `StartSessionPayload` in `packages/types/src/dialectic.types.ts` uses `selectedModels: SelectedModels[]`. The backend `StartSessionPayload` in `supabase/functions/dialectic-service/dialectic.interface.ts` uses `selectedModelIds: string[]`. The API adapter passes the payload through without mapping. `DialecticProjectDetailsPage` sends `selectedModelIds: []`, which matches the backend but violates the frontend type. This mismatch must be resolved in the refactoring so both FE and BE use `selectedModels`. It doesn't matter if the BE only stores the id in the `selected_model_ids` column, the type will be maintained up until the point it enters the database.

2. **Display name mapping is broken.** Backend `startSession.ts` (lines 329–334) maps `selected_model_ids` to `selected_models` as `ids.map((id) => ({ id, displayName: id }))`. The `displayName` is set to the raw UUID instead of the actual model name. As part of fix 1, this will be fixed so that the type is correct and consistent.

---

## 3. Goal

One click from "Create Project" to landing on the session page with default model(s) selected and generation already running. The user sees progress feedback during the multi-step process. The existing project-details page and "Start New Session" flow remain unchanged for manual use.

---

## 4. Required changes

### 4.1 Default model flag (database)

Add an `is_default_generation` column to `ai_providers` (distinct from the existing `is_default_embedding`). Unlike `is_default_embedding` which uses a unique constraint to enforce a single default, `is_default_generation` allows multiple models to be flagged as defaults simultaneously. Seed data must flag at least one active model as default. After the migration, regenerate database types.

### 4.2 End-to-end type alignment: `selectedModels`

The frontend type is correct: `StartSessionPayload.selectedModels: SelectedModels[]`. The backend type is wrong: `StartSessionPayload.selectedModelIds: string[]`. The fix is to correct the backend type to match the frontend, then update all backend code that references the old field name. There is no "mapping" between mismatched types — both sides use `selectedModels: SelectedModels[]` and the type flows through unchanged from frontend to API adapter to edge function to backend handler.

**Backend `StartSessionPayload` type change** (`supabase/functions/dialectic-service/dialectic.interface.ts`):
- Change `selectedModelIds: string[]` to `selectedModels: SelectedModels[]`.
- Ensure `SelectedModels` is imported or defined (it should match the frontend `SelectedModels` interface: `{ id: string; displayName: string }`).

**Backend `startSession.ts` changes:**
- Destructure `selectedModels` instead of `selectedModelIds` from the payload (line 41).
- At DB insert (line 288): extract ids for the `selected_model_ids` column as `selectedModels.map(m => m.id)` (or `[]` if empty). The DB column is `UUID[]` and stays as-is — only ids are stored.
- At response construction (lines 329–334): use the `selectedModels` received in the payload directly. Do not reconstruct display names from UUIDs. The data arrived complete; pass it through. This eliminates the broken `ids.map((id) => ({ id, displayName: id }))` mapping entirely.

**Frontend caller fix** (`apps/web/src/pages/DialecticProjectDetailsPage.tsx`):
- Change `selectedModelIds: []` to `selectedModels: []` in `handleStartNewSession` (line 60) to conform to the frontend `StartSessionPayload` type.

**Related endpoint: `updateSessionModels`** (`supabase/functions/dialectic-service/updateSessionModels.ts`):
- This endpoint also accepts `selectedModelIds`. It must be updated to accept `selectedModels: SelectedModels[]` for consistency. Same pattern: extract ids for DB storage, use full objects for response.

**Backend type references that must update:**
- `dialectic.interface.ts` line 1078: `DialecticBaseJobPayload extends Omit<GenerateContributionsPayload, "selectedModelIds" | "chatId">` — update the `Omit` key if the backend `GenerateContributionsPayload` changes, or remove if no longer applicable.
- `dialectic.interface.ts` line 1985: `selectedModelIds?: string[]` in a job payload type — update to `selectedModels?: SelectedModels[]`.

**API adapter** (`packages/api/src/dialectic.api.ts`):
- No changes needed. The adapter already passes the payload through unchanged. With types aligned end-to-end, the frontend `selectedModels: SelectedModels[]` flows directly to the backend.

**Tests:**
- All test files that construct `StartSessionPayload` objects with `selectedModelIds` must be updated to use `selectedModels`. Key test files:
  - `supabase/functions/dialectic-service/startSession.happy.test.ts`
  - `supabase/functions/dialectic-service/startSession.errors.test.ts`
  - `supabase/functions/dialectic-service/index.test.ts`
  - `apps/web/src/pages/DialecticProjectDetailsPage.test.tsx`
- Test assertions that expect `displayName: id` (UUID as display name) must be updated to expect the correct display name that was passed in.

### 4.3 Backend `getSessionDetails` display name consistency

When sessions are loaded via `getSessionDetails`, the backend reads `selected_model_ids` from the DB (UUID array) and must reconstruct `SelectedModels[]` with correct display names. Unlike `startSession` (where the caller provides full `SelectedModels` objects), `getSessionDetails` reads from DB and must look up display names from `ai_providers`. Verify that `getSessionDetails.ts` performs this lookup correctly. If it uses the same broken `id → { id, displayName: id }` pattern, fix it to query `ai_providers` for the actual `name` field. This ensures that sessions loaded via deep-link (or page refresh) have correct display names, not UUIDs.

### 4.4 Store orchestration action: `createProjectAndAutoStart`

A new store action in `packages/store/src/dialecticStore.ts` that encapsulates the full automated flow. No business logic lives in the form component. The action executes the following steps in strict sequential order, waiting for each to complete before proceeding:

1. Ensure the model catalog is loaded. If `modelCatalog` is empty and not currently loading, call `fetchAIModelCatalog` and wait for it to complete. Do not proceed without catalog data.
2. Call `createDialecticProject(payload)` → get `projectId` from `response.data.id`.
3. Call `fetchDialecticProjectDetails(projectId)` and wait for it to complete. This is required because the create response returns `DialecticProjectRow` (raw DB row), which does NOT include `dialectic_process_templates` or stages. Only `fetchDialecticProjectDetails` returns the full `DialecticProject` with template stages. Wait for the project detail to be loaded before proceeding.
4. Derive the initial stage slug from `currentProjectDetail.dialectic_process_templates.stages[0].slug`.
5. Resolve default models: read `modelCatalog` from store state, filter for models where `is_default_generation === true` and `is_active === true`. If no default models are found, return a result indicating that auto-start is not possible (the form will handle this by navigating to the session without the auto-start flag and showing appropriate feedback).
6. Call `startDialecticSession({ projectId, stageSlug, selectedModels: defaultModels })` and wait for the session to be created. Get `sessionId` from `response.data.id`.
7. Return `{ projectId, sessionId, hasDefaultModels: true }` on success, or an error describing which step failed.

If any step fails with an actual error (network failure, server error), the action stops, sets an appropriate error, and returns the error. The form uses this to decide navigation and user feedback.

### 4.5 Store selector: `selectDefaultGenerationModels`

A new selector in `packages/store/src/dialecticStore.selectors.ts` that filters `modelCatalog` for entries where `is_default_generation === true` and `is_active === true`, returning `SelectedModels[]` (id + displayName).

### 4.6 Store action: `autoStartGeneration`

A new store action in `packages/store/src/dialecticStore.ts` that the session page calls once after context is loaded. This action:

1. Reads from store state: `activeSessionDetail`, `currentProjectDetail`, `activeContextSessionId`, `selectedModels`, active stage.
2. Reads from wallet store: `selectActiveChatWalletInfo` → checks `status === 'ok'`, `walletId` is truthy, and `balance >= STAGE_BALANCE_THRESHOLDS[activeStage.slug]`.
3. If all preconditions are met, builds the `GenerateContributionsPayload`:
   - `sessionId`: from `activeContextSessionId`
   - `projectId`: from `currentProjectDetail.id`
   - `stageSlug`: from active stage slug
   - `iterationNumber`: from `activeSessionDetail.iteration_count`
   - `continueUntilComplete`: `true` (always, for auto-start)
   - `walletId`: from `activeWalletInfo.walletId`
4. Calls `generateContributions(payload)`.
5. Returns success/failure so the caller can clear the auto-start flag.

If preconditions are not met (wallet insufficient, models empty, stage not ready), returns a descriptive error. The session page shows appropriate feedback.

### 4.7 Form changes (`CreateDialecticProjectForm.tsx`)

Replace the current `onSubmit` success path. The form behavior depends on two new checkboxes (see Section 4.11):

- **If "Configure Manually" is checked:** Call `createDialecticProject(payload)` only. On success, navigate to `/dialectic/${projectId}` (project details page, legacy flow).
- **If "Configure Manually" is unchecked (default):** Call `createProjectAndAutoStart(payload)`. On success, navigate directly to `/dialectic/${projectId}/session/${sessionId}` — skip the project details page entirely.
  - **If "Start Generation" is also checked (default):** Navigate with `state: { autoStartGeneration: true }`.
  - **If "Start Generation" is unchecked:** Navigate with no auto-start flag. User lands on session page with models selected and can click Generate manually.
- On failure, show an error toast and remain on the form.

### 4.8 Session page auto-start (`DialecticSessionDetailsPage.tsx`)

Add an effect that detects `location.state?.autoStartGeneration === true`. After `activateProjectAndSessionContextForDeepLink` completes and the store has `activeSessionDetail`, `selectedModels`, `currentProjectDetail`, and `activeContextSessionId` populated:

1. Call the store's `autoStartGeneration` action.
2. Regardless of success or failure, clear the flag by calling `navigate(location.pathname, { replace: true, state: {} })` so a page refresh does not re-trigger generation.
3. If `autoStartGeneration` fails, the user lands on a functional session page and can retry manually via the Generate button.

Use a ref to ensure the effect fires exactly once. Do not rely solely on clearing `location.state` to prevent re-execution, because the navigation that clears state can itself cause a re-render before the state update is applied.

Resume mode is not a concern: a newly created project has never started generation, so resume mode cannot be active.

### 4.9 Model catalog must be loaded before the create flow

The `createProjectAndAutoStart` action ensures the catalog is loaded as its first step (see 4.4 step 1). If the catalog is not yet loaded, the action waits for it. The form should also trigger `fetchAIModelCatalog` on mount so the catalog is likely already available by the time the user submits. This provides the data needed for the `selectDefaultGenerationModels` selector and for the "Start Generation" checkbox's auto-uncheck behavior (see 4.11).

### 4.10 UX feedback during multi-step creation

The form must display loader states during the automated flow. Since `createProjectAndAutoStart` runs multiple async steps, the form should show progressive feedback:

- "Creating project…"
- "Loading project details…"
- "Starting session…"
- "Preparing session…"

The `createProjectAndAutoStart` action should report its current step (via store state or callback) so the form can display the appropriate message. The form's submit button is disabled while the action runs.

### 4.11 Form UX: checkboxes for flow control

Two new checkboxes on the `CreateDialecticProjectForm`:

**"Configure Manually" checkbox:**
- Unchecked by default.
- When checked: the form creates the project only and navigates to the project details page (legacy flow). "Start Generation" checkbox is hidden or disabled since it doesn't apply.
- When unchecked (default): the form runs the full automated flow (create project → start session → navigate to session page).

**"Start Generation" checkbox:**
- Checked by default.
- Visible only when "Configure Manually" is unchecked.
- When checked: the automated flow navigates to the session page with `autoStartGeneration: true`, triggering generation automatically.
- When unchecked: the automated flow navigates to the session page without auto-start. User lands on a ready session and can click Generate manually.
- **Auto-uncheck conditions:** If the model catalog is loaded and no models are flagged `is_default_generation`, or if the wallet balance is below the thesis stage threshold (200,000), the checkbox is automatically unchecked and a brief explanation is shown next to it (e.g. "No default models available" or "Wallet balance too low for auto-start"). The user can re-check it if they choose — the auto-start precondition check on the session page will handle failures gracefully.

---

## 5. Edge cases

These are actual failure conditions, not standard data-loading waits. The orchestration action (`createProjectAndAutoStart`) waits for each async step to complete before proceeding. Waiting for the catalog to load, for project details to load, and for the session to be created are normal sequential steps, not edge cases.

- **`createDialecticProject` fails:** Project was not created. Show error toast, remain on the form. User can retry.
- **`fetchDialecticProjectDetails` fails after project creation:** Project exists in the DB but details/stages could not be loaded. Show error toast. Navigate to `/dialectic/${projectId}` (project details page) so the user can start a session manually from there.
- **No stages in project template:** Project has no `dialectic_process_templates.stages`. This is a data integrity issue. Show error toast, navigate to project details page. User can investigate or contact support.
- **No models flagged as `is_default_generation`:** `createProjectAndAutoStart` returns a result indicating no default models. The form navigates to the session page without auto-start. The "Start Generation" checkbox was auto-unchecked (see 4.11). User selects models manually and clicks Generate.
- **`startDialecticSession` fails:** Project exists but session was not created. Show error toast. Navigate to project details page. User can click "Start New Session" manually.
- **Wallet balance below threshold for first stage:** `autoStartGeneration` precondition check fails on the session page. User lands on the session page with models selected but generation not started. The Generate button reflects the insufficient balance. User can add funds and click Generate manually.
- **`generateContributions` fails after auto-start:** User is already on the session page. Error toast is shown. User can retry with the Generate button.

---

## 6. Files to touch (complete list)

### Database

- **New migration file: `supabase/migrations/YYYYMMDDHHMMSS_add_is_default_generation.sql`**
  Add `is_default_generation BOOLEAN NOT NULL DEFAULT false` to `ai_providers`. No unique constraint (multiple models can be defaults). Add a comment on the column.

- **Seed data file (identify the file that seeds `ai_providers`)**
  Flag at least one active model with `is_default_generation = true`.

- **`supabase/functions/types_db.ts`** (auto-generated)
  Regenerate after migration to include `is_default_generation` in the `ai_providers` row type.

### Backend — type alignment

- **`supabase/functions/dialectic-service/dialectic.interface.ts`**
  - Change `StartSessionPayload.selectedModelIds: string[]` to `selectedModels: SelectedModels[]`.
  - Update `DialecticBaseJobPayload` `Omit` key at line 1078 if affected.
  - Update `selectedModelIds?: string[]` at line 1985 to `selectedModels?: SelectedModels[]`.
  - Ensure `SelectedModels` type is imported/available (must match `{ id: string; displayName: string }`).

- **`supabase/functions/dialectic-service/startSession.ts`**
  - Destructure `selectedModels` instead of `selectedModelIds` from the payload (line 41).
  - DB insert (line 288): use `selected_model_ids: selectedModels.map(m => m.id)` (or `[]` if empty).
  - Response construction (lines 329–334): use the `selectedModels` from the payload directly instead of the broken `ids.map((id) => ({ id, displayName: id }))` reconstruction.

- **`supabase/functions/dialectic-service/updateSessionModels.ts`**
  Update to accept `selectedModels: SelectedModels[]` instead of `selectedModelIds: string[]`. Same pattern: extract ids for DB, use full objects for response.

- **`supabase/functions/dialectic-service/getSessionDetails.ts`**
  Verify and fix the `selected_model_ids` → `SelectedModels[]` reconstruction. Since this reads from DB (no caller-provided display names), it must look up model names from `ai_providers`. If it currently uses the broken `{ id, displayName: id }` pattern, fix it.

- **`supabase/functions/_shared/utils/type-guards/type_guards.dialectic.ts`**
  Update any type guards that validate `selectedModelIds` to validate `selectedModels` instead.

### Backend — tests

- **`supabase/functions/dialectic-service/startSession.happy.test.ts`**
  Update all `StartSessionPayload` constructions from `selectedModelIds` to `selectedModels`. Update assertions that expect `displayName: id` to expect correct display names.

- **`supabase/functions/dialectic-service/startSession.errors.test.ts`**
  Same: update all `StartSessionPayload` constructions.

- **`supabase/functions/dialectic-service/index.test.ts`**
  Update `startSession` and `updateSessionModels` test payloads.

- **`supabase/functions/dialectic-service/generateContribution.test.ts`**
  Update if test constructs payloads with `selectedModelIds`.

- **`supabase/functions/_shared/utils/type-guards/type_guards.dialectic.test.ts`**
  Update type guard tests.

- **`apps/web/src/pages/DialecticProjectDetailsPage.test.tsx`**
  Update assertion from `selectedModelIds: []` to `selectedModels: []`.

### Types

- **`packages/types/src/dialectic.types.ts`**
  Verify `AIModelCatalogEntry` includes `is_default_generation` after database type regeneration. If `AIModelCatalogEntry` is derived from database types, this may happen automatically. If it is manually defined, add the field.

### Store

- **`packages/store/src/dialecticStore.ts`**
  - Add `createProjectAndAutoStart` action (Section 4.4): orchestrates catalog load → create → fetch details → resolve stage → resolve default models → start session. Reports current step for loader state.
  - Add `autoStartGeneration` action (Section 4.6): checks wallet/balance/stage/model preconditions then calls `generateContributions` with `continueUntilComplete: true`.

- **`packages/store/src/dialecticStore.selectors.ts`**
  Add `selectDefaultGenerationModels` selector: filters `modelCatalog` for `is_default_generation === true` and `is_active === true`, returns `SelectedModels[]`.

### Frontend

- **`apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx`**
  - Add "Configure Manually" checkbox (unchecked by default).
  - Add "Start Generation" checkbox (checked by default, auto-unchecks on model/wallet issues, visible only when Configure Manually is unchecked).
  - Change `onSubmit` success path: branch on checkbox state per Section 4.7.
  - Show loader states per Section 4.10.
  - Navigate directly to session page (skip project details) in automated flow.

- **`apps/web/src/pages/DialecticSessionDetailsPage.tsx`**
  Add auto-start effect: detect `location.state?.autoStartGeneration`, call `autoStartGeneration` once after context loads, clear the flag via `navigate(pathname, { replace: true, state: {} })`. Use a ref to prevent double-firing.

- **`apps/web/src/pages/DialecticProjectDetailsPage.tsx`**
  Fix `handleStartNewSession` (line 60): change `selectedModelIds: []` to `selectedModels: []` to conform to the frontend `StartSessionPayload` type.

---

## 7. Async sequencing summary

```
Form renders
  │
  ├─ fetchAIModelCatalog (on mount, so catalog is ready by submit time)
  ├─ render "Configure Manually" checkbox (unchecked)
  ├─ render "Start Generation" checkbox (checked, auto-unchecks if no default models or low balance)
  │
  ▼
User clicks "Create Project"
  │
  ├─ If "Configure Manually" checked:
  │     createDialecticProject(payload) → navigate to /dialectic/{projectId} (legacy)
  │
  ├─ If "Configure Manually" unchecked (default):
  │
  ▼
createProjectAndAutoStart(formPayload)          [store action]
  │
  ├─ 1. ensure modelCatalog loaded (wait if needed)   → loader: "Loading models…"
  ├─ 2. createDialecticProject(formPayload)            → loader: "Creating project…"
  │      wait for response → projectId
  ├─ 3. fetchDialecticProjectDetails(projectId)        → loader: "Loading project details…"
  │      wait for response → stages available
  ├─ 4. derive stageSlug from stages[0]
  ├─ 5. selectDefaultGenerationModels(state) → defaultModels[]
  │      if empty → return { projectId, sessionId: null, hasDefaultModels: false }
  ├─ 6. startDialecticSession(projectId, stageSlug, defaultModels) → loader: "Starting session…"
  │      wait for response → sessionId
  └─ return { projectId, sessionId, hasDefaultModels: true }
  │
  ▼
Form navigates directly to /dialectic/{projectId}/session/{sessionId}
  ├─ If "Start Generation" checked AND hasDefaultModels:
  │     navigate with state: { autoStartGeneration: true }
  ├─ If "Start Generation" unchecked OR !hasDefaultModels:
  │     navigate without auto-start flag
  │
  ▼
Session page mounts (project details page is skipped entirely)
  │
  ├─ activateProjectAndSessionContextForDeepLink(projectId, sessionId)
  │    ├─ fetchDialecticProjectDetails (if needed, wait for completion)
  │    ├─ fetchAndSetCurrentSessionDetails (wait for completion) → sets selectedModels in store
  │    └─ setActiveStage
  │
  ▼
Auto-start effect fires (once, guarded by ref)
  │
  ├─ reads location.state.autoStartGeneration === true
  ├─ waits for: activeSessionDetail, selectedModels, activeStage, wallet loaded
  │
  ▼
autoStartGeneration()                           [store action]
  │
  ├─ check: selectedModels.length > 0
  ├─ check: activeStage set
  ├─ check: wallet status === 'ok', walletId truthy
  ├─ check: balance >= STAGE_BALANCE_THRESHOLDS[stageSlug]
  ├─ build GenerateContributionsPayload (continueUntilComplete: true)
  └─ generateContributions(payload)
  │
  ▼
Clear autoStartGeneration flag via navigate(pathname, { replace: true, state: {} })
```

Each step waits for the previous step to complete before proceeding. "Wait for X to load" is standard async sequencing, not an edge case. Actual failures (network errors, server errors, missing data) stop the chain and surface errors to the user with appropriate fallback navigation.
