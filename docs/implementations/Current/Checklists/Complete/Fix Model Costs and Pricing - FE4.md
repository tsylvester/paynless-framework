[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* **Cost ceiling fix-forward — global contracts (all nodes in this chain through commit)**
  * **Error handling (rules.mdc):** Errors are explicitly typed `ApiError`. The layer that **originates** a failure constructs exactly one `ApiError` or returns/rejects with `{ error: ApiError }`. Downstream layers pass the **same reference** through unchanged — never prefix, reword, coerce with `instanceof` ternaries, or substitute copy. **Errors are never stored in dialectic Zustand state** for cap-init or progress hydration — no `outputCapInitError`, no `progressHydrationError` map. Dialectic store holds **status only** (`progressHydrationStatus`). UI displays `error.message` verbatim.
  * **Scope (this chain only):** Remove error storage and fix pass-through/rethrow only on paths touched by nodes in this checklist. Legacy dialectic `*Error` state fields outside those paths (e.g. `processTemplateError`, `modelCatalogError`, `stageExpectedCountsError`) remain for this pass; selectors in this chain may still brigade those fields where cost-ceiling UI depends on them. Store-wide error-field removal is out of scope.
  * **Pass-through at boundaries:** Selectors return `ComputeCostCeilingReturn` only. Cost selectors pass through `useAuthStore.getState().error` when present (same reference). `computeCostCeiling` errors return unchanged. Cap-init failures return from `initializeMaxOutputTokens` — callers surface at the call boundary. Hydration failures: documents logic and store thunks throw/reject `ApiError` unchanged; `useStageRunProgressHydration` logs `errorDetails: err` unchanged on hydrate catch paths (no rethrow through `void` async IIFE — avoids unhandled rejection in `App.tsx`); session UI surfaces via `progressHydrationStatus` + selector when invoker did not already display the API error.
  * **Loading vs error:** While loading flags are true, UI shows loading notices only — do not surface init, hydration, or selector errors. After loading completes, display pass-through errors from selector return, init return, or hydrate rejection only.
  * **Cap init vs loading:** `initializeMaxOutputTokens(): InitializeMaxOutputTokensResult` — **silent skip** (no store write, no error return) while any cap-init dependency is still loading or `outputCapUserCustomized === true`. When deps ready and init fails, **return** `{ ok: false, error: ApiError }` — log at error level, **never** write error to dialectic store. Origin codes: `NO_DEFAULT_GENERATION_MODELS`, `MODEL_CATALOG_ENTRY_MISSING`, `MODEL_OUTPUT_CAP_UNAVAILABLE`, `MODEL_CATALOG_INVALID_CONFIG`. On success, `set({ maxOutputTokens })` only (never `setMaxOutputTokens`). UI invokes when `isCapInitReady`; captures return in **component-local** `capInitResult` for footer gates only (not Zustand); UI must surface **every** `{ ok: false, error }` code above before selector when tier/auth gates pass.
  * **Hydration vs loading:** `hydrateStageProgress` / `hydrateAllStageProgress` set `progressHydrationStatus[key] = 'failed'` on failure, then **reject** with the thrown `ApiError` unchanged. **Do not** write `progressHydrationError`. While `progressHydrationStatus[runKey] === 'pending'`, loading only. When `'failed'` after loading, selector returns selector-originated `{ code: 'STAGE_PROGRESS_HYDRATION_FAILED', message: '…' }` if invoker did not already surface the rejected error.

* `[✅]`   packages/store/src/dialecticStore.documents **Hydration progress logic throws ApiError only; every failure pass-through unchanged**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `hydrateStageProgressLogic` and `hydrateAllStageProgressLogic` throw `new Error(...)` on every failure path. That destroys `ApiError` shape, prevents `dialecticStore.ts` hydrate thunks from rethrowing the same reference, and violates rules.mdc Error Handling (errors never modified; pass through unchanged).
    * `[✅]`   **Functional goal:** Eliminate every `throw new Error` in `hydrateStageProgressLogic` and `hydrateAllStageProgressLogic`. When `response.error` is present, **throw `response.error`** (same reference). When this layer originates a failure (null/undefined data, document validation, empty stages, absent step data, invalid `expectedCount`), construct exactly one `ApiError` with a single-requirement `code` and `message` and throw it. Apply to **all** failure paths — not only API errors.
    * `[✅]`   **Functional goal — stable origin-layer codes (documents logic only; pass-through API errors use upstream `code` unchanged):**
      * `[✅]`   `hydrateStageProgressLogic` null/undefined `response.data` → `{ code: 'HYDRATE_STAGE_PROGRESS_DATA_MISSING', message: 'Stage progress response data missing; sessionId=<sessionId>, stageSlug=<stageSlug>, iterationNumber=<iterationNumber>.' }`
      * `[✅]`   `hydrateStageProgressLogic` document validation failure → `{ code: 'HYDRATE_STAGE_PROGRESS_DOCUMENT_INVALID', message: 'Stage progress document validation failed; sessionId=<sessionId>, stageSlug=<stageSlug>, iterationNumber=<iterationNumber>.' }`
      * `[✅]`   `hydrateAllStageProgressLogic` `response.data === undefined` → `{ code: 'HYDRATE_ALL_STAGE_PROGRESS_DATA_UNDEFINED', message: 'All-stage progress response data undefined; sessionId=<sessionId>, iterationNumber=<iterationNumber>.' }`
      * `[✅]`   `hydrateAllStageProgressLogic` empty `stages` array → `{ code: 'HYDRATE_ALL_STAGE_PROGRESS_STAGES_EMPTY', message: 'All-stage progress stages array empty; sessionId=<sessionId>, iterationNumber=<iterationNumber>.' }`
      * `[✅]`   `hydrateAllStageProgressLogic` absent/non-array `steps` on a stage entry → `{ code: 'HYDRATE_ALL_STAGE_PROGRESS_STEPS_ABSENT', message: 'All-stage progress step data absent for stage <stageSlug>; sessionId=<sessionId>, iterationNumber=<iterationNumber>.' }`
      * `[✅]`   `hydrateAllStageProgressLogic` document validation failure → `{ code: 'HYDRATE_ALL_STAGE_PROGRESS_DOCUMENT_INVALID', message: 'All-stage progress document validation failed; sessionId=<sessionId>, iterationNumber=<iterationNumber>.' }`
      * `[✅]`   `hydrateAllStageProgressLogic` invalid `expectedCount` (non-number, non-integer, or negative) → `{ code: 'HYDRATE_ALL_STAGE_PROGRESS_EXPECTED_COUNT_INVALID', message: 'All-stage progress expectedCount invalid for stage <stageSlug>; sessionId=<sessionId>, iterationNumber=<iterationNumber>.' }`
    * `[✅]`   **Functional goal:** No `instanceof` ternaries to guess error type in this file. No error storage. Success paths unchanged.
    * `[✅]`   **Non-functional:** Logic-only file; does not edit `dialecticStore.ts` thunks (consumer node). Does not edit `dialecticStore.documents.test.ts` (unrelated 4k-line surface).

  * `[✅]`   `role`
    * `[✅]`   Store logic layer — originates hydration failures; upstream of `hydrateStageProgress` / `hydrateAllStageProgress` thunks in `dialecticStore.ts`.
    * `[✅]`   Out of scope: Zustand thunk wiring, `progressHydrationStatus`, cap-init, selectors, UI.

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `@paynless/store` dialectic documents logic (`dialecticStore.documents.ts` and `dialecticStore.hydrateProgress.test.ts`).

  * `[✅]`   `deps`
    * `[✅]`   `api.dialectic().listStageDocuments` / `getAllStageProgress` from `@paynless/api`.
    * `[✅]`   `isStageRenderedDocumentChecklistEntry` and document/progress helpers from same file.
    * `[✅]`   `ApiError`, `DialecticStateValues`, payload/response types from `@paynless/types`.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: `ListStageDocumentsPayload` / `GetAllStageProgressPayload`; API `ApiResponse`.
    * `[✅]`   Writes: `stageRunProgress`, `dagProgressByRun`, `stageExpectedCountsByRun` via immer `set` on success.
    * `[✅]`   Throws: `ApiError` on every failure (pass-through or origin).

  * `[✅]`   packages/store/src/dialecticStore.hydrateProgress.test.ts
    * `[✅]`    `hydrateStageProgressLogic` API error: replace `rejects.toThrow(/\[hydrateStageProgress\]/)` with rejection where `isApiError(rejected)` and rejected value **is** mock `response.error` (reference equality).
    * `[✅]`    `hydrateStageProgressLogic` null/undefined data: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_STAGE_PROGRESS_DATA_MISSING'` (origin-layer `ApiError`, not `Error`).
    * `[✅]`    `hydrateStageProgressLogic` document validation failure: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_STAGE_PROGRESS_DOCUMENT_INVALID'`.
    * `[✅]`    `hydrateAllStageProgressLogic` API error: replace `rejects.toThrow(/\[hydrateAllStageProgress\]/)` with rejection where `isApiError(rejected)` and rejected value **is** mock `response.error` (reference equality).
    * `[✅]`    `hydrateAllStageProgressLogic` undefined data: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_DATA_UNDEFINED'`.
    * `[✅]`    `hydrateAllStageProgressLogic` empty stages array: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_STAGES_EMPTY'`.
    * `[✅]`    `hydrateAllStageProgressLogic` document validation failure: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_DOCUMENT_INVALID'`.
    * `[✅]`    `hydrateAllStageProgressLogic` absent/non-array `steps` on a stage entry: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_STEPS_ABSENT'`; `stageExpectedCountsByRun` unchanged.
    * `[✅]`    `hydrateAllStageProgressLogic` negative `expectedCount`: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_EXPECTED_COUNT_INVALID'`; `stageExpectedCountsByRun` unchanged.
    * `[✅]`    `hydrateAllStageProgressLogic` non-integer `expectedCount`: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_EXPECTED_COUNT_INVALID'`; `stageExpectedCountsByRun` unchanged.
    * `[✅]`    `hydrateAllStageProgressLogic` non-number `expectedCount`: replace regex `toThrow` with `isApiError` rejection where `rejected.code === 'HYDRATE_ALL_STAGE_PROGRESS_EXPECTED_COUNT_INVALID'`; `stageExpectedCountsByRun` unchanged.

  * `[✅]`   packages/store/src/dialecticStore.documents.ts
    * `[✅]`    `hydrateStageProgressLogic`: when `response.error`, throw `response.error`; when `!response.data` after no error, throw origin `ApiError` (not `new Error`); remove redundant second null-data `throw new Error`; document validation failure throws origin `ApiError`.
    * `[✅]`    `hydrateAllStageProgressLogic`: when `response.error`, throw `response.error`; when `response.data === undefined`, throw origin `ApiError`; empty `stages`, absent `steps`, document validation, invalid `expectedCount` each throw origin `ApiError` (single code/message per path).
    * `[✅]`    zero `throw new Error` in both logic functions.

  * `[✅]`   `requirements`
    * `[✅]`   API error mock on `listStageDocuments` → `hydrateStageProgressLogic` rejects with identical `ApiError` reference.
    * `[✅]`   API error mock on `getAllStageProgress` → `hydrateAllStageProgressLogic` rejects with identical `ApiError` reference.
    * `[✅]`   Every failure-path test in `dialecticStore.hydrateProgress.test.ts` that previously used regex `toThrow` now rejects with `isApiError` rejection, never `Error`.
    * `[✅]`   Each origin failure-path test asserts the exact `error.code` from this node's objective: `HYDRATE_STAGE_PROGRESS_DATA_MISSING`, `HYDRATE_STAGE_PROGRESS_DOCUMENT_INVALID`, `HYDRATE_ALL_STAGE_PROGRESS_DATA_UNDEFINED`, `HYDRATE_ALL_STAGE_PROGRESS_STAGES_EMPTY`, `HYDRATE_ALL_STAGE_PROGRESS_STEPS_ABSENT`, `HYDRATE_ALL_STAGE_PROGRESS_DOCUMENT_INVALID`, `HYDRATE_ALL_STAGE_PROGRESS_EXPECTED_COUNT_INVALID`.
    * `[✅]`   Grep `dialecticStore.documents.ts`: zero `throw new Error` in `hydrateStageProgressLogic` and `hydrateAllStageProgressLogic`.
    * `[✅]`   Success-path tests in `dialecticStore.hydrateProgress.test.ts` remain green unchanged.

* `[✅]`   packages/store/src/dialecticStore **Initialize maxOutputTokens from min(tierCap, bindingModelCap); guard catalog config; cap-init waits for deps; pre-project fetchProcessTemplate silence; rules-compliant error return/rethrow (no stored errors)**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `useAuthStore` hydrates `userTier.output_cap_tokens` from profile, but `dialecticStore.maxOutputTokens` stays `null` until the user interacts with `OutputCapSlider`. Cost selectors and `computeCostCeiling` read `dialecticStore.maxOutputTokens`, so estimates fail while the tier cap was available. `OutputCapSlider` may show a tier-derived display value in local state but does not call `setMaxOutputTokens` until drag/click.
    * `[✅]`   **Functional goal:** Add store action `initializeMaxOutputTokens` on `dialecticStore.ts`. **`dialecticStore.maxOutputTokens` is the single source of truth for cost ceiling input** — selectors, `computeCostCeiling`, slider display, and all consumers **read this store field only**; they do not recalculate tier/model cap elsewhere. When `useAuthStore.getState().isLoading === false` and `userTier !== null` and `outputCapUserCustomized === false`: (1) when `selectedModels` is empty, apply default generation models from `selectDefaultGenerationModels` to `selectedModels`; (2) compute cap **once inside this action** using **lower-of constraints only**:
      * Per selected model with guarded config: `modelCap = min(hard_cap_output_tokens, provider_max_output_tokens)` when both finite; single field when only one present; if no finite model cap → loud failure (see below).
      * `bindingModelCap = min(modelCap)` across **all** selected models (multi-model uses the **lowest** model cap, not the highest).
      * `tierCap = userTier.output_cap_tokens` when finite; when `userTier.output_cap_tokens === null` (Ultra), tier side is unbounded for this min (use `bindingModelCap` only).
      * When tier cap is finite: `maxOutputTokens = min(tierCap, bindingModelCap)`.
      * When tier cap is null (Ultra): `maxOutputTokens = bindingModelCap`.
    * `[✅]`   **Functional goal — initializer writes store directly:** On success, `set({ maxOutputTokens })` and return `{ ok: true }`. **`initializeMaxOutputTokens` must NEVER call `setMaxOutputTokens`** — only the user-facing slider commit path calls `setMaxOutputTokens`, so tier defaults do not set `outputCapUserCustomized: true`.
    * `[✅]`   **Functional goal:** `setMaxOutputTokens` sets `outputCapUserCustomized: true` on every call. `initializeMaxOutputTokens` does not run when `outputCapUserCustomized === true` (returns `{ ok: true, skipped: true }`).
    * `[✅]`   **Functional goal — silent skip while cap-init deps loading:** Before any cap math or default-model application, return `{ ok: true, skipped: true }` immediately (no store write, **no error return**) when **any** cap-init dependency is still loading or not yet resolvable: `useAuthStore.getState().isLoading === true`; `userTier === null`; `state.isLoadingModelCatalog === true`; `modelCatalog.length === 0` while catalog fetch may still be in flight or not yet seeded. Callers retry when deps become ready.
    * `[✅]`   **Functional goal — loud init failures (only when cap-init deps ready):** When all cap-init dependencies above are satisfied and init still fails, **return** `{ ok: false, error: ApiError }` with a **single-requirement** `code` and `message` stating exactly what failed — **never** write error to dialectic store. Failures include at minimum: `selectDefaultGenerationModels` returns empty when selection was empty and catalog is loaded → `{ code: 'NO_DEFAULT_GENERATION_MODELS', message: '…' }`; selected model id absent from `modelCatalog` → `{ code: 'MODEL_CATALOG_ENTRY_MISSING', message: 'Model catalog entry missing for selected model id <id>.', details: { modelId } }`; selected model(s) present but no finite model output cap after guard → `{ code: 'MODEL_OUTPUT_CAP_UNAVAILABLE', message: '…', details: { modelId } }`; catalog row fails `isAiModelExtendedConfig` during cap read → `{ code: 'MODEL_CATALOG_INVALID_CONFIG', message: 'Model catalog config invalid for model id <id>.', details: { modelId } }`. Run `isAiModelExtendedConfig` **before** cap field reads on guarded config. Log at error level with same message. Do not set `maxOutputTokens` on failure unless a prior successful init value should be preserved (leave unchanged).
    * `[✅]`   **Functional goal — `outputCapUserCustomized` reset:** Reset `outputCapUserCustomized: false` whenever user dialectic context invalidates the prior cap choice — at minimum: `setActiveDialecticContext` when `projectId` or `sessionId` changes; successful navigation to a **new** project or session load that replaces `activeSessionDetail` (via `fetchAndSetCurrentSessionDetails` → `setActiveDialecticContext`); `dialecticStore.reset()` restores full `initialDialecticStateValues` including `outputCapUserCustomized: false` (**local dialectic reset management until app-wide session-teardown coordinator lands** — this node does not wire auth logout). After reset, callers re-invoke `initializeMaxOutputTokens()` only when cap-init deps are ready (not on tier hydrate alone).
    * `[✅]`   **Functional goal — internal fire-and-forget hydrate invokers:** Every internal `hydrateAllStageProgress(...)` call in `dialecticStore.ts` (`_handleContributionGenerationPausedNsf`, `resumePausedNsfJobs`, `pauseActiveJobs`, `regenerateDocument`) must use `void hydrateAllStageProgress(...).catch((err: unknown) => { logger.error('[DialecticStore] hydrateAllStageProgress failed after action', { errorDetails: err }); })` — **no bare fire-and-forget** after thunks rethrow. Primary session UI surfacing remains `progressHydrationStatus` + selector `STAGE_PROGRESS_HYDRATION_FAILED`; these paths are best-effort post-action refresh only.
    * `[✅]`   **Functional goal:** `initializeMaxOutputTokens` never uses level-0 tier fallback. UI nodes call this action only when cap-init deps are ready; this node does not edit UI.
    * `[✅]`   **Functional goal:** Align `isAiModelExtendedConfig` with BE-valid tokenization types so active catalog configs (e.g. `google_gemini_tokenizer`, `anthropic_tokenizer`) pass the guard — required for Ultra model-cap reads and for downstream selectors in a later node.
    * `[✅]`   **Functional goal:** In `fetchProcessTemplate`, when `currentProjectDetail === null` and template data is returned, set `currentProcessTemplate`, set `isLoadingProcessTemplate: false`, return without `logger.warn` "Cannot determine active stage…" (pre-project template fetch is expected on create-project form). Keep existing active-stage resolution when `currentProjectDetail !== null`. When `template?.stages` is missing/empty with a loaded project, retain existing error/warn behavior.
    * `[✅]`   **Non-functional:** Cap math lives **only** in `initializeMaxOutputTokens` inside `dialecticStore.ts`. Hydrate **logic** in `dialecticStore.documents.ts` (documents node — must complete first). Hydrate **thunks** in `dialecticStore.ts`. No duplicate cap calculation in UI. Selectors unchanged in this node. Edits `dialecticStore.ts`, types, guard (already green), behavior-split test files listed below, `dialecticStore.test.ts` shrink only, and `apps/web/src/mocks/dialecticStore.mock.ts`.

  * `[✅]`   `role`
    * `[✅]`   Store layer — owns `maxOutputTokens` and `outputCapUserCustomized`; exposes initializer for UI to call after auth tier hydrate.
    * `[✅]`   Out of scope: selector `null` removal, UI copy, slider mount, subscription CTAs, app-wide auth logout session-teardown coordinator.

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `@paynless/store` dialectic slice (`dialecticStore.ts` and its direct type/guard/test support listed below).

  * `[✅]`   `deps`
    * `[✅]`   `useAuthStore.getState()` — `isLoading`, `userTier` (`UserTier.output_cap_tokens: number | null`).
    * `[✅]`   `selectDefaultGenerationModels` from `dialecticStore.selectors.ts` (import existing selector; do not edit selectors file in this node).
    * `[✅]`   `isAiModelExtendedConfig` from `@paynless/utils` (updated in this node).
    * `[✅]`   `AiModelExtendedConfig`, `DialecticStateValues`, `DialecticActions`, `InitializeMaxOutputTokensResult` from `@paynless/types`.
    * `[✅]`   `hydrateStageProgressLogic`, `hydrateAllStageProgressLogic` from `dialecticStore.documents.ts` — **documents node must be complete** (logic throws `ApiError` only).

  * `[✅]`   `context_slice`
    * `[✅]`   Initializer reads: auth loading + tier; `isLoadingModelCatalog`; `outputCapUserCustomized`; `selectedModels`; `modelCatalog`.
    * `[✅]`   Writes: `maxOutputTokens`, `outputCapUserCustomized`, optionally `selectedModels` when applying defaults.
    * `[✅]`   Returns: `initializeMaxOutputTokens` → `InitializeMaxOutputTokensResult`.

  * `[✅]`   packages/types/src/dialectic.types.ts
    * `[✅]`   Add `outputCapUserCustomized: boolean` to `DialecticStateValues` (initial `false` in store initial state).
    * `[✅]`   **Remove** `outputCapInitError: ApiError | null` from `DialecticStateValues` (rules: errors never stored).
    * `[✅]`   Add `InitializeMaxOutputTokensResult` union (`{ ok: true } | { ok: true, skipped: true } | { ok: false, error: ApiError }`) to `dialectic.types.ts`.
    * `[✅]`   **Remove** `initializeMaxOutputTokensFromTier` from `DialecticActions`.
    * `[✅]`   Add `initializeMaxOutputTokens: () => InitializeMaxOutputTokensResult` on `DialecticActions`.
    * `[✅]`   **Remove** `progressHydrationError` from `DialecticStateValues` (rules: errors never stored; keep `progressHydrationStatus` only).

  * `[✅]`   packages/types/src/ai.types.ts
    * `[✅]`   Replace `tokenization_strategy.type` union with BE-valid variants matching `supabase/functions/chat/zodSchema.ts` `TokenizationStrategySchema`: `'tiktoken' | 'rough_char_count' | 'anthropic_tokenizer' | 'google_gemini_tokenizer' | 'none'`.
    * `[✅]`   Shape per variant: `anthropic_tokenizer` requires `model: string`; `google_gemini_tokenizer` optional `chars_per_token_ratio?: number`; retain existing optional fields on `tiktoken` and `rough_char_count` branches already in the interface.

  * `[✅]`   packages/utils/src/dialectic.guard.test.ts
    * `[✅]`   add test accepting seed-shaped config for default-generation model (`tokenization_strategy.type === 'google_gemini_tokenizer'`, finite `input_token_cost_rate` / `output_token_cost_rate`, finite `provider_max_output_tokens`).
    * `[✅]`   add test accepting `anthropic_tokenizer` with `model: string`.
    * `[✅]`   add test accepting `none` strategy type.
    * `[✅]`   reject config with `tokenization_strategy.type === 'google_gemini_tokenizer'` but non-finite `output_token_cost_rate` (guard requires finite rates for FE active catalog).

  * `[✅]`   packages/utils/src/dialectic.guard.ts
    * `[✅]`   update `isAiModelExtendedConfig` strategy `type` check to all five BE literals above; remove acceptance of `'provider_specific_api'` and `'unknown'`.
    * `[✅]`   When `type === 'anthropic_tokenizer'`, require `typeof tokenization_strategy['model'] === 'string'` and non-empty.
    * `[✅]`   Keep existing finite-number requirements on `input_token_cost_rate` and `output_token_cost_rate`.
    * `[✅]`   Require at least one finite output cap field on valid config: `hard_cap_output_tokens` and/or `provider_max_output_tokens` (via `min` when both present); reject config that passes strategy/rate checks but has no finite output cap.

  * `[✅]`   packages/store/src/dialecticStore.initializeMaxOutputTokens.test.ts
    * `[✅]`    create file; move `describe('initializeMaxOutputTokensFromTier action')` from `dialecticStore.test.ts` (rename describe to `initializeMaxOutputTokens`); amend assertions to return union (no `outputCapInitError` in state).
    * `[✅]`   auth `isLoading: true` → `{ ok: true, skipped: true }`; `maxOutputTokens` unchanged.
    * `[✅]`   `isLoadingModelCatalog: true` → `{ ok: true, skipped: true }`; `maxOutputTokens` unchanged.
    * `[✅]`   default model applied; `maxOutputTokens === 4096`; `{ ok: true }`.
    * `[✅]`   pre-selected models; `maxOutputTokens === 8192`; `{ ok: true }`.
    * `[✅]`   Ultra tier; min across models `4096`; `{ ok: true }`.
    * `[✅]`   empty default models → `{ ok: false, error }` code `NO_DEFAULT_GENERATION_MODELS`; no store error field; `setMaxOutputTokens` not called.
    * `[✅]`   no finite output cap after guard → `{ ok: false, error }` code `MODEL_OUTPUT_CAP_UNAVAILABLE`; `maxOutputTokens` preserved.
    * `[✅]`   selected model id missing from catalog → `{ ok: false, error }` code `MODEL_CATALOG_ENTRY_MISSING`.
    * `[✅]`   `isAiModelExtendedConfig` fails before cap read → `{ ok: false, error }` code `MODEL_CATALOG_INVALID_CONFIG` (not `MODEL_OUTPUT_CAP_UNAVAILABLE`).
    * `[✅]`   never invokes `setMaxOutputTokens` on success path.
    * `[✅]`   `outputCapUserCustomized: true` → `{ ok: true, skipped: true }`; cap unchanged.
    * `[✅]`   `setMaxOutputTokens(5000)` sets `maxOutputTokens: 5000` and `outputCapUserCustomized: true`.

  * `[✅]`   packages/store/src/dialecticStore.hydrateStageProgress.thunk.test.ts
    * `[✅]`    create file; move `describe('hydrateStageProgress thunk')` from `dialecticStore.test.ts`; amend failure assertion: `progressHydrationStatus[progressKey] === 'failed'`; `await expect(hydrateStageProgress(payload)).rejects.toBe(apiError)` (same reference as mock `response.error`); store has no `progressHydrationError` entry.
    * `[✅]`   pending → success paths unchanged.
    * `[✅]`    origin-layer chain: mock `listStageDocuments` success with invalid document rows → documents logic throws origin `ApiError` → thunk sets `progressHydrationStatus[progressKey] === 'failed'` → `await expect(hydrateStageProgress(payload)).rejects.toBe(originError)` (same reference).

  * `[✅]`   packages/store/src/dialecticStore.hydrateAllStageProgress.thunk.test.ts
    * `[✅]`    create file; move `describe('hydrateAllStageProgress thunk')` and `describe('resetProgressHydrationStatus')` from `dialecticStore.test.ts`.
    * `[✅]`   API `response.error` → `progressHydrationStatus[runKey] === 'failed'`; rejection is same `ApiError` reference; no `progressHydrationError` entry.
    * `[✅]`   `resetProgressHydrationStatus` clears `progressHydrationStatus[runKey]` only; seed no `progressHydrationError` fixture.
    * `[✅]`    integration: mock `getAllStageProgress` `response.error` → thunk rejection identical to `response.error` (documents logic pass-through → thunk rethrow chain).
    * `[✅]`    origin-layer chain: mock `getAllStageProgress` success with invalid document rows (or empty `stages`) → documents logic throws origin `ApiError` → thunk sets `progressHydrationStatus[runKey] === 'failed'` → `await expect(hydrateAllStageProgress(payload)).rejects.toBe(originError)` (same reference).

  * `[✅]`   packages/store/src/dialecticStore.session.test.ts
    * `[✅]`    move output-cap reset case from `dialecticStore.test.ts` into existing `describe('setActiveDialecticContext action — session detail clearing')`: new `sessionId` resets `outputCapUserCustomized` to `false`.
    * `[✅]`    `setActiveDialecticContext` with new `projectId` (sessionId unchanged) resets `outputCapUserCustomized` to `false`.
    * `[✅]`    `fetchAndSetCurrentSessionDetails` success loading a session whose id differs from prior `activeContextSessionId` resets `outputCapUserCustomized` to `false` (via `setActiveDialecticContext` on session fetch).

  * `[✅]`   packages/store/src/dialecticStore.paused.test.ts
    * `[✅]`    when `hydrateAllStageProgress` rejects after `resumePausedNsfJobs` / `pauseActiveJobs` success, parent action still returns API success; `progressHydrationStatus[runKey] === 'failed'`; `logger.error` called; no unhandled rejection (void-with-catch on internal invoke).
    * `[✅]`    when `hydrateAllStageProgress` rejects after `_handleContributionGenerationPausedNsf` completes generating-state cleanup, handler still clears `generatingSessions` and resets `contributionGenerationStatus`; `progressHydrationStatus[runKey] === 'failed'`; `logger.error` called with unchanged `errorDetails`; no unhandled rejection (void-with-catch on internal invoke).

  * `[✅]`   packages/store/src/dialecticStore.regenerateDocument.test.ts
    * `[✅]`    when `hydrateAllStageProgress` rejects after `regenerateDocument` success, regenerate still returns API success; `progressHydrationStatus[runKey] === 'failed'`; `logger.error` called; no unhandled rejection.

  * `[✅]`   packages/store/src/dialecticStore.fetchProcessTemplate.test.ts
    * `[✅]`   when `currentProjectDetail: null`, successful template fetch — sets `currentProcessTemplate`, does not emit active-stage warn (spy/mute `logger.warn`; assert warn not called with "Cannot determine active stage").

  * `[✅]`   packages/store/src/dialecticStore.test.ts
    * `[✅]`    delete `describe('hydrateAllStageProgress thunk')` (~1165–1268), `describe('hydrateStageProgress thunk')` (~1270–1345), `describe('resetProgressHydrationStatus')` (~1434–1453), `describe('initializeMaxOutputTokensFromTier action')` (~3490–3843), `describe('setActiveDialecticContext action')` output-cap cases (~3845–3878) — relocated to behavior-split test files below as `initializeMaxOutputTokens`.
    * `[✅]`    delete initial-state expectations for `outputCapInitError` and `progressHydrationError` (~132, 144, 147–149).
    * `[✅]`    do **not** add new test describes to this file except amend existing `describe('reset action')` (~342):  after seeding `outputCapUserCustomized: true`, `reset()` restores `outputCapUserCustomized: false` and removes any legacy error fields from state shape.

  * `[✅]`   packages/store/src/dialecticStore.ts
    * `[✅]`   initial state includes `outputCapUserCustomized: false` only — **no** `outputCapInitError` or `progressHydrationError`.
    * `[✅]`   **delete** action key `initializeMaxOutputTokensFromTier`; implement only `initializeMaxOutputTokens`; update cap-init log strings that still reference the old name.
    * `[✅]`   implement `initializeMaxOutputTokens` per objective (silent skip while cap-init deps loading; auth gate; customize gate; guard-before-cap; **`min(tierCap, bindingModelCap)`** cap math; default models when selection empty; **return** `{ ok: false, error }` when deps ready and init fails; **`set()` only — never `setMaxOutputTokens`**).
    * `[✅]`   **delete** standalone `isRecord(configValue)` invalid-config branch; invalid catalog config fails only via `!isAiModelExtendedConfig(configValue)` **before** cap field reads → return `{ ok: false, error }` code `MODEL_CATALOG_INVALID_CONFIG` (no parallel pre-guard path).
    * `[✅]`   `setMaxOutputTokens` sets `outputCapUserCustomized: true`.
    * `[✅]`   reset `outputCapUserCustomized` on context-change paths listed in objective (no error fields to clear).
    * `[✅]`   split `fetchProcessTemplate` success branch — if `!currentProjectDetail`, set template + loading false + return (debug log optional); else existing session/starting-stage logic unchanged.
    * `[✅]`    `hydrateStageProgress` / `hydrateAllStageProgress` catch: set `progressHydrationStatus[key] = 'failed'`, then **rethrow** caught value unchanged — **no** `progressHydrationError` writes, no `instanceof` string coercion (logic throw contract from documents node).
    * `[✅]`    `resetProgressHydrationStatus` deletes `progressHydrationStatus[runKey]` only (no error map key).
    * `[✅]`    each internal `hydrateAllStageProgress` invoker listed in objective (`_handleContributionGenerationPausedNsf`, `resumePausedNsfJobs`, `pauseActiveJobs`, `regenerateDocument`) uses `void hydrateAllStageProgress(...).catch(...)` per objective; no bare `get().hydrateAllStageProgress(` without `await` or `void … .catch`.

  * `[✅]`   apps/web/src/mocks/dialecticStore.mock.ts
    * `[✅]`   Mock initial state: `outputCapUserCustomized: false` only — **no** `outputCapInitError` or `progressHydrationError`.
    * `[✅]`   **Remove** `initializeMaxOutputTokensFromTier` action mock.
    * `[✅]`   Action mock: `initializeMaxOutputTokens: vi.fn(() => ({ ok: true }))` beside existing dialectic action mocks.
    * `[✅]`   `setMaxOutputTokens` mock sets `{ maxOutputTokens: maxTokens, outputCapUserCustomized: true }` (mirror node 1 store behavior).
    * `[✅]`    `hydrateStageProgress` / `hydrateAllStageProgress` mocks mirror production thunk semantics: set `progressHydrationStatus[key] = 'pending'`; await logic; on success set `'success'`; on failure set `'failed'` and **rethrow** — do not call logic directly without status/rethrow wrapper; **no** `progressHydrationError` writes.

  * `[✅]`   `requirements`
    * `[✅]`   After `initializeMaxOutputTokens()` with tier cap `8192`, model cap `4096`, and `outputCapUserCustomized false`, `maxOutputTokens === 4096` and return `{ ok: true }`.
    * `[✅]`   After same call with tier cap `8192` and model cap `8192`, `maxOutputTokens === 8192`.
    * `[✅]`   After same call with Ultra tier and two models capped `4096` / `65536`, `maxOutputTokens === 4096`.
    * `[✅]`   After user `setMaxOutputTokens(4096)`, initializer does not raise cap back to tier max.
    * `[✅]`   Empty default models → return `{ ok: false, error }` with `error.code === 'NO_DEFAULT_GENERATION_MODELS'`; store state has no error field.
    * `[✅]`   Missing catalog row → return `{ ok: false, error }` with `error.code === 'MODEL_CATALOG_ENTRY_MISSING'`.
    * `[✅]`   Hydrate thunk API failure → rejection is identical `ApiError` reference; `progressHydrationStatus` failed; no `progressHydrationError` in store.
    * `[✅]`   `setActiveDialecticContext` new `sessionId` → `outputCapUserCustomized === false`.
    * `[✅]`   `setActiveDialecticContext` new `projectId` → `outputCapUserCustomized === false`.
    * `[✅]`   `fetchAndSetCurrentSessionDetails` navigation to new session → `outputCapUserCustomized === false`.
    * `[✅]`   `dialecticStore.reset()` → `outputCapUserCustomized === false`.
    * `[✅]`   After `resumePausedNsfJobs` / `pauseActiveJobs` / `_handleContributionGenerationPausedNsf` / `regenerateDocument` succeed, a rejecting `hydrateAllStageProgress` leaves parent action success, sets `progressHydrationStatus[runKey] === 'failed'`, calls `logger.error` with unchanged `errorDetails`, and produces no unhandled rejection.
    * `[✅]`   `isAiModelExtendedConfig` returns true for seed-shaped `google_gemini_tokenizer` default-generation config.
    * `[✅]`   Pre-project `fetchProcessTemplate` does not log warn "Cannot determine active stage without project details or template stages."
    * `[✅]`   `dialecticStore.selectors.ts` untouched in this node. Mock fixture mirrors new state/actions. New test files: `dialecticStore.initializeMaxOutputTokens.test.ts`, `dialecticStore.hydrateStageProgress.thunk.test.ts`, `dialecticStore.hydrateAllStageProgress.thunk.test.ts`.

* `[✅]`   apps/web/src/hooks/useStageRunProgressHydration **Session progress hydration invoker logs hydrate failures; no swallow; no unhandled rejection**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `useStageRunProgressHydration` is the primary session-page invoker of `hydrateAllStageProgress` / `hydrateStageProgress`. Its hydrate `catch` blocks only `console.error` (lines 73–75, 133–135), swallowing `ApiError` rejections once dialecticStore thunks rethrow. `progressHydrationStatus` may be `'failed'`, but the hook neither logs with `logger.error` nor preserves the error for observability. Hook runs hydrate work via `void hydrateAll()` / `void runPerStage()` from `useEffect` (mounted in `App.tsx` and `SessionContributionsDisplayCard`) — **must not rethrow** through those void calls (unhandled promise rejection).
    * `[✅]`   **Functional goal:** After documents + dialecticStore hydrate thunk nodes land, on hydrate rejection: confirm `progressHydrationStatus[key] === 'failed'` was set by the thunk; call `logger.error('[useStageRunProgressHydration] …', { errorDetails: err })` with **unchanged** `err` (not `console.error`); **do not rethrow** from the async IIFE. **Production display contract:** session cost UI uses `progressHydrationStatus` + `selectCostCeiling` → `STAGE_PROGRESS_HYDRATION_FAILED` (SessionInfoCard node) when invoker did not already surface the API error. While `progressHydrationStatus[runKey] === 'pending'`, consumers show loading only (parity with `useStartContributionGeneration` / `SessionInfoCard`). Replace recipe-missing-slugs `console.error` (lines 54–57) with `logger.error`; early `return` on missing recipes remains a recipe-setup short-circuit, not a hydrate API failure.
    * `[✅]`   **Non-functional:** Does not edit `dialecticStore.ts`, selectors, or `SessionInfoCard` in this node. Depends on dialecticStore hydrate thunk rethrow GREEN.

  * `[✅]`   `role`
    * `[✅]`   Application hook — orchestrates session progress hydration; logs hydrate failures without swallowing or unhandled rejection.
    * `[✅]`   Out of scope: cost selector math, cap-init, store thunk implementation.

  * `[✅]`   `module`
    * `[✅]`   `apps/web/src/hooks` — `useStageRunProgressHydration.ts`, `useStageRunProgressHydration.test.tsx`, `useStageRunProgressHydration.integration.test.tsx`.

  * `[✅]`   `deps`
    * `[✅]`   Dialectic store — `hydrateAllStageProgress`, `hydrateStageProgress`, `progressHydrationStatus`, `setProgressHydrationRunPending`, `fetchStageRecipe`, `ensureRecipeForViewingStage`.
    * `[✅]`   `useAuthStore` — `user`.
    * `[✅]`   `selectSortedStages`, `selectUnifiedProjectProgress` from `@paynless/store`.
    * `[✅]`   `isApiError` from `@paynless/utils`.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: session context, recipes, `progressHydrationStatus`.
    * `[✅]`   Writes: none on dialectic store (hydrate thunks write status).
    * `[✅]`   Surfaces: logs unchanged `ApiError` in `errorDetails` on hydrate catch paths; does not rethrow through void async IIFE.

  * `[✅]`   apps/web/src/hooks/useStageRunProgressHydration.test.tsx
    * `[✅]`    when `hydrateAllStageProgress` mock rejects with `apiError`, after effect settles: `progressHydrationStatus[runKey] === 'failed'`; `logger.error` called with `errorDetails` **identical reference** to `apiError`; hook does not produce unhandled rejection.
    * `[✅]`    when `hydrateStageProgress` mock rejects with `apiError`, after effect settles: `progressHydrationStatus[progressKey] === 'failed'`; `logger.error` called with `errorDetails` **identical reference** to `apiError`; hook does not produce unhandled rejection.
    * `[✅]`    existing “calls hydrate once”, ordering, and tab-change tests remain green.

  * `[✅]`   apps/web/src/hooks/useStageRunProgressHydration.ts
    * `[✅]`    on hydrate catch paths: `logger.error('[useStageRunProgressHydration] …', { errorDetails: err })` with unchanged `err`; **do not rethrow**; remove `console.error` on hydrate failure paths; recipe-missing-slugs path uses `logger.error` not `console.error`; preserve pending guard and recipe-ordering logic unchanged.

  * `[✅]`   apps/web/src/hooks/useStageRunProgressHydration.integration.test.tsx
    * `[✅]`    amend tests that mock hydrate: store has no `progressHydrationError`; MSW API error on `getAllStageProgress` → `progressHydrationStatus[runKey] === 'failed'`; `logger.error` receives unchanged API `ApiError` in `errorDetails`.

  * `[✅]`   `requirements`
    * `[✅]`   Hydrate API failure → `progressHydrationStatus` failed + `logger.error` `errorDetails` is identical `ApiError` reference; no `console.error` on hydrate failure paths; no unhandled rejection from void async IIFE.
    * `[✅]`   Existing hydrate-once and recipe-ordering tests remain green.

* `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.ts **ComputeCostCeilingReturn error field admits auth Error unchanged; interface, guard, implementation aligned**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `ComputeCostCeilingErrorReturn.error` is `ApiError` only. Selectors return `authState.error` unchanged (same reference). TS2741 at selector auth gates. Type contract rejects the actual error object auth provides.
    * `[✅]`   **Functional goal:** Widen `ComputeCostCeilingErrorReturn.error` to admit `Error | ApiError`. Upstream errors pass unchanged — same reference, no new object, no field copy, no coercion. `computeCostCeiling.ts` validation path still returns its existing `ApiError` objects unchanged. Success math unchanged.
    * `[✅]`   **Non-functional:** Do not edit `dialecticStore.selectors.ts`. Selectors node blocked until this producer completes. One implementation file: `computeCostCeiling.ts`.

  * `[✅]`   `role`
    * `[✅]`   Utils producer — owns `ComputeCostCeilingReturn` contract and `computeCostCeiling` implementation.

  * `[✅]`   `module`
    * `[✅]`   `@paynless/utils` — `computeCostCeiling/`.

  * `[✅]`   `deps`
    * `[✅]`   `ApiError`, `Error` from `@paynless/types`.
    * `[✅]`   Existing guards, interface, mocks.

  * `[✅]`   `context_slice`
    * `[✅]`   Output: `ComputeCostCeilingReturn`; `ComputeCostCeilingErrorReturn { ApiError | Error}`.

  * `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.interface.test.ts
    * `[✅]`   error branch accepts real `Error` instance on `error` field.
    * `[✅]`   Existing ApiError branch tests remain green.

  * `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.interface.ts
    * `[✅]`   `ComputeCostCeilingErrorReturn { ApiError | Error }`.

  * `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.guard.test.ts
    * `[✅]`   `isComputeCostCeilingErrorReturn` true when `error` is real `Error` (same reference in object).
    * `[✅]`   Existing ApiError cases remain green.

  * `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.guard.ts
    * `[✅]`   Accept `Error | ApiError` on `error` field; no coercion.

  * `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.test.ts
    * `[✅]`   Existing tests remain green.

  * `[✅]`   packages/utils/src/computeCostCeiling/computeCostCeiling.ts
    * `[✅]`   Satisfies widened return type; logic unchanged.

  * `[✅]`   `requirements`
    * `[✅]`   `ComputeCostCeilingErrorReturn.error` is `ApiError | Error`.
    * `[✅]`   Guard accepts real `Error` without coercion.
    * `[✅]`   Selector auth lines unchanged; TS2741 cleared after producer GREEN.
    * `[✅]`   Guard/interface/computeCostCeiling test suites remain green.

* `[✅]`   packages/store/src/dialecticStore.selectors **Cost ceiling selectors return ComputeCostCeilingReturn only; pass-through auth/fetch errors; hydration-failed status; selectUnifiedProjectProgress hydration-safe when session missing**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `selectPreProjectCostCeiling` and `selectCostCeiling` return `null` for every failed precondition. UI treats `null` as generic “not ready”; upstream `ApiError`s from auth and fetch failures are discarded instead of passed through unchanged at selector boundaries.
    * `[✅]`   **Problem:** `selectUnifiedProjectProgress` throws `[selectUnifiedProjectProgress] Session is required when stages exist` when `currentProcessTemplate` has stages but `selectSessionById(state, sessionId)` is `undefined` (template loaded before session row is in `currentProjectDetail.dialectic_sessions`). Session page crashes before cost-ceiling UI can render.
    * `[✅]`   **Functional goal:** Change both selector signatures to return `ComputeCostCeilingReturn` only (remove `| null`). Never return `null`.
    * `[✅]`   **Functional goal — pass-through at selector boundary (unchanged `ApiError` reference; do not copy or reword):**
      * `[✅]`   **Both selectors (first match wins):** Read `useAuthStore.getState()`. When `auth.error !== null` → `{ error: auth.error }` (same reference).
      * `[✅]`   **`selectPreProjectCostCeiling` only (after auth):** `stageExpectedCountsError` → `{ error: state.stageExpectedCountsError }`; else `domainProcessAssociationError` → `{ error: state.domainProcessAssociationError }`; else `modelCatalogError` → `{ error: state.modelCatalogError }`; else `processTemplateError` → `{ error: state.processTemplateError }`.
      * `[✅]`   **`selectCostCeiling` only (after auth):** when `progressHydrationStatus[runKey] === 'failed'` for `runKey = \`${sessionId}:${session.iteration_count}\`` (session resolved) → `{ error: { code: 'STAGE_PROGRESS_HYDRATION_FAILED', message: 'Stage progress hydration failed.' } }` (selector-originated; invoker should have surfaced thrown `ApiError` at hydrate call boundary); else `modelCatalogError` → `{ error: state.modelCatalogError }`; else `processTemplateError` → `{ error: state.processTemplateError }`. **Do not** brigade `stageExpectedCountsError` or `domainProcessAssociationError` on the session selector (pre-project fetch errors must not block session estimates). **Do not** read `outputCapInitError` or `progressHydrationError` from state (removed per rules).
    * `[✅]`   **Functional goal — cap-init failures at UI boundary, not store:** When `maxOutputTokens` is not finite after cap-init deps ready, selector returns `{ code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' }`. UI surfaces `{ ok: false, error }` from `initializeMaxOutputTokens()` **before** selector when init returned **any** of: `NO_DEFAULT_GENERATION_MODELS`, `MODEL_CATALOG_ENTRY_MISSING`, `MODEL_OUTPUT_CAP_UNAVAILABLE`, `MODEL_CATALOG_INVALID_CONFIG` (pass-through `error.message` verbatim; same reference).
    * `[✅]`   **Functional goal — shared local preconditions (after brigade, both selectors):** Each failure returns `{ error: ApiError }` with stable `code` and a single-requirement `message`:
      * `[✅]`   `maxOutputTokens` not finite → `{ code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' }`
      * `[✅]`   `selectedModels == null` or `selectedModels.length === 0` → `{ code: 'NO_MODELS_SELECTED', message: 'No models selected.' }`
      * `[✅]`   Selected model id missing from `modelCatalog` → `{ code: 'MODEL_CATALOG_ENTRY_MISSING', message: 'Model catalog entry missing for selected model id <id>.', details: { modelId: '<id>' } }`
      * `[✅]`   Catalog row present but `!isAiModelExtendedConfig(row.config)` → `{ code: 'MODEL_CATALOG_INVALID_CONFIG', message: 'Model catalog config invalid for model id <id>.', details: { modelId: '<id>' } }`
    * `[✅]`   **Functional goal — `selectPreProjectCostCeiling` only (after shared checks):**
      * `[✅]`   `state.selectedDomain === null` → `{ code: 'SELECTED_DOMAIN_MISSING', message: 'No domain selected.' }`
      * `[✅]`   `state.selectedDomainProcessAssociation === null` → `{ code: 'DOMAIN_PROCESS_ASSOCIATION_MISSING', message: 'Domain process association is not loaded.' }`
      * `[✅]`   `state.selectedDomainProcessAssociation.domain_id !== state.selectedDomain.id` → `{ code: 'DOMAIN_PROCESS_ASSOCIATION_DOMAIN_MISMATCH', message: 'Domain process association does not match selected domain.' }`
      * `[✅]`   `state.preProjectStageExpectedCounts === null` or `length === 0` → `{ code: 'PRE_PROJECT_STAGE_COUNTS_MISSING', message: 'Pre-project stage expected counts are not loaded.' }`
      * `[✅]`   Any entry with `expectedCount < 0` → `{ code: 'STAGE_EXPECTED_COUNT_INVALID', message: 'Stage expected count invalid for slug <slug>.', details: { stageSlug: '<slug>' } }`
    * `[✅]`   **Functional goal — `selectCostCeiling` only (after shared checks):**
      * `[✅]`   `selectSessionById(state, sessionId) === undefined` → `{ code: 'SESSION_NOT_FOUND', message: 'Session not found for id <sessionId>.', details: { sessionId } }`
      * `[✅]`   `state.stageExpectedCountsByRun[\`${sessionId}:${session.iteration_count}\`] === undefined` → `{ code: 'STAGE_COUNTS_BY_RUN_MISSING', message: 'Stage expected counts by run are not loaded for this session.', details: { runKey: '<sessionId>:<iteration>' } }`
      * `[✅]`   `getSortedStagesFromTemplate(state.currentProcessTemplate).length === 0` → `{ code: 'PROCESS_TEMPLATE_STAGES_MISSING', message: 'Process template has no stages.' }`
      * `[✅]`   Template stage slug missing from `countsBySlug` or `expectedCount < 0` → `{ code: 'STAGE_EXPECTED_COUNT_MISSING', message: 'Stage expected count missing for slug <slug>.', details: { stageSlug: '<slug>' } }`
      * `[✅]`   Completed-stage contribution missing `tokens_used_input`, `tokens_used_output`, or `model_id` → `{ code: 'CONTRIBUTION_COST_DATA_MISSING', message: 'Contribution cost data incomplete for contribution id <id>.', details: { contributionId: '<id>' } }`
      * `[✅]`   Contribution `model_id` missing from catalog or invalid config → use `MODEL_CATALOG_ENTRY_MISSING` / `MODEL_CATALOG_INVALID_CONFIG` with contribution’s `model_id`
    * `[✅]`   **Functional goal — success path (unchanged FE3 math):** Build `outputTokenCostRates` from guarded configs; build `stages` payload; call `computeCostCeiling(deps, params, payload)`; if result has `'error' in result`, return that result unchanged (including `error` object identity from `computeCostCeiling`).
    * `[✅]`   **Functional goal — `selectUnifiedProjectProgress` hydration-safe:** When `totalStages > 0` and `selectSessionById(state, sessionId)` is `undefined`, return safe `UnifiedProjectProgress` (same shape as existing empty-template branch): `hydrationReady: false`, `totalStages: stages.length`, `completedStages: 0`, `overallPercentage: 0`, `projectStatus: 'not_started'`, `currentStageSlug: null`, `currentStage: null`, `stageDetails: []`. **Do not throw.** Existing throw paths when session exists but `current_stage_id` missing/invalid remain unchanged.
    * `[✅]`   **Non-functional:** Do not edit `dialectic.guard.ts`, UI in this node. Selectors only — no new dialectic error storage fields. May brigade existing legacy `*Error` state fields (`stageExpectedCountsError`, `processTemplateError`, `modelCatalogError`, `domainProcessAssociationError`) per global scope; store-wide `*Error` removal is out of scope. Depends on node 1 (`isAiModelExtendedConfig`, `maxOutputTokens` init, hydration rethrow). Consumer null-check updates land in later UI nodes.

  * `[✅]`   `role`
    * `[✅]`   Store selectors — cost-ceiling derivation and session progress hydration safety in `dialecticStore.selectors.ts`.
    * `[✅]`   Out of scope: UI messaging, auth loading UI, popover bootstrap, subscription CTAs. **In scope:** auth `error` pass-through via `useAuthStore.getState()` inside selectors only.

  * `[✅]`   `module`
    * `[✅]`   `@paynless/store` — `dialecticStore.selectors.ts` (`selectPreProjectCostCeiling`, `selectCostCeiling`, `selectUnifiedProjectProgress`).

  * `[✅]`   `deps`
    * `[✅]`   `ComputeCostCeilingReturn`, `computeCostCeiling`, `isAiModelExtendedConfig` from `@paynless/utils` (guard updated in node 1).
    * `[✅]`   `DialecticStateValues`, `ApiError` from `@paynless/types`.
    * `[✅]`   `useAuthStore.getState()` — `error` for pass-through (read inside selectors; do not subscribe).
    * `[✅]`   Existing helpers in same file: `selectSessionById`, `getSortedStagesFromTemplate`, `selectUnifiedProjectProgress`.

  * `[✅]`   `context_slice`
    * `[✅]`   Inputs: full `DialecticStateValues`; `sessionId` for post-project selector.
    * `[✅]`   Output: `ComputeCostCeilingReturn` only.

  * `[✅]`   packages/store/src/dialecticStore.selectors.costCeiling.test.ts
    * `[✅]`    replace every `expect(...).toBeNull()` on selector results with `'error' in result` and assert `result.error.code` matches the code for that scenario.
    * `[✅]`    `selectPreProjectCostCeiling`: when `useAuthStore.getState().error` set, `{ error: sameReference }` (first pass-through gate).
    * `[✅]`    `selectCostCeiling`: when `useAuthStore.getState().error` set, `{ error: sameReference }`.
    * `[✅]`    `selectPreProjectCostCeiling`: when `state.stageExpectedCountsError` set, `{ error: sameReference }` (pass-through order: only one upstream error set per test).
    * `[✅]`    `selectPreProjectCostCeiling`: when `state.domainProcessAssociationError` set, same reference pass-through (pass-through order: only one upstream error set per test).
    * `[✅]`    `selectPreProjectCostCeiling`: when `state.modelCatalogError` / `state.processTemplateError` set, same reference pass-through.
    * `[✅]`    `selectCostCeiling`: when `progressHydrationStatus[runKey] === 'failed'`, returns `STAGE_PROGRESS_HYDRATION_FAILED` — **before** local `STAGE_COUNTS_BY_RUN_MISSING`.
    * `[✅]`    `selectCostCeiling`: when `state.modelCatalogError` set, same reference pass-through.
    * `[✅]`    `selectCostCeiling`: when `state.processTemplateError` set, same reference pass-through.
    * `[✅]`    `selectCostCeiling`: when `state.stageExpectedCountsError` is set but session run counts are present and other prerequisites succeed — **does not** return pre-project error; proceeds to success or session-specific local error (proves pre-project errors are not brigaded on session path).
    * `[✅]`    `maxOutputTokens: null` → `OUTPUT_CAP_NOT_INITIALIZED` (not null).
    * `[✅]`    `selectedModels: []` → `NO_MODELS_SELECTED`.
    * `[✅]`    invalid catalog config → `MODEL_CATALOG_INVALID_CONFIG`.
    * `[✅]`    missing run key → `STAGE_COUNTS_BY_RUN_MISSING`.
    * `[✅]`    `preProjectStageExpectedCounts: null` → `PRE_PROJECT_STAGE_COUNTS_MISSING`.
    * `[✅]`   Update all success-path tests: result type `ComputeCostCeilingReturn` (no `| null`); keep existing numeric assertions against `computeCostCeiling`.
    * `[✅]`   Keep existing test that `computeCostCeiling` error return passes through unchanged (`result.error` equals mocked error).

  * `[✅]`   packages/store/src/dialecticStore.selectors.progress.test.ts
    * `[✅]`   add test `when template has stages and sessionId not in project sessions, returns hydrationReady false without throwing` — seed `currentProcessTemplate` with stages, `currentProjectDetail.dialectic_sessions: []`, call `selectUnifiedProjectProgress(state, sessionId)`; expect `hydrationReady === false`, `totalStages === stages.length`, `stageDetails.length === 0`; no throw.

  * `[✅]`   packages/store/src/dialecticStore.selectors.ts
    * `[✅]`    change return types of `selectCostCeiling` and `selectPreProjectCostCeiling` to `ComputeCostCeilingReturn`.
    * `[✅]`    implement pass-through per objective (auth `error` first; fetch errors; `progressHydrationStatus[runKey] === 'failed'` on `selectCostCeiling`).
    * `[✅]`    replace every `return null` in both cost-ceiling functions with the matching local `{ error: ApiError }` from objective.
    * `[✅]`    leave stage/contribution assembly and `computeCostCeiling` payload construction logic unchanged except null→error conversions.
    * `[✅]`    in `selectUnifiedProjectProgress`, replace throw when `totalStages > 0 && !session` with safe return per objective.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `selectPreProjectCostCeiling` / `selectCostCeiling` in `dialecticStore.selectors.ts`: zero `return null` in both functions.
    * `[✅]`   Grep `selectUnifiedProjectProgress`: zero `throw new Error('[selectUnifiedProjectProgress] Session is required when stages exist'`.
    * `[✅]`   Grep `dialecticStore.selectors.costCeiling.test.ts`: zero `.toBeNull()` on selector results.
    * `[✅]`   Pass-through test: injected `useAuthStore` `error` is identical reference on both selectors when set (before other brigade entries).
    * `[✅]`   Pass-through test: `progressHydrationStatus[runKey] === 'failed'` yields `STAGE_PROGRESS_HYDRATION_FAILED` on `selectCostCeiling` before `STAGE_COUNTS_BY_RUN_MISSING`.
    * `[✅]`   Pass-through test: injected `stageExpectedCountsError` is identical reference on **`selectPreProjectCostCeiling`** result only.
    * `[✅]`   Success tests for both cost-ceiling selectors still match hand-computed `computeCostCeiling` output.
    * `[✅]`   Existing `dialecticStore.selectors.progress.test.ts` suite remains green.

* `[✅]`   apps/web/src/components/dialectic/CreateDialecticProjectForm **Tier cap autostart bootstrap; cost-ceiling UI from loading flags and pass-through errors; integration test without popover**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** Pre-project cost estimate UI treats `selectPreProjectCostCeiling === null` as a bundled “not ready” state. `maxOutputTokens` is never initialized until `OutputCapSlider` mounts inside the closed model popover. Autostart demotion and submit gate use the same bundled copy instead of selector `error.message` or discrete codes from node 2.
    * `[✅]`   **Functional goal:** Subscribe to `useAuthStore` (`isLoading`, `userTier`). Define **`isCapInitReady`** true when **all** of: `isLoading === false`; `userTier !== null`; `isLoadingModelCatalog === false`; `modelCatalog.length > 0` (catalog loaded with rows). Add `useEffect`: when `isCapInitReady`, call `useDialecticStore.getState().initializeMaxOutputTokens()` (default models when selection empty are handled inside that store action from node 1 — do not duplicate in this file). Effect deps: `[isLoading, userTier, isLoadingModelCatalog, modelCatalog.length]` — **do not** call initializer when tier alone is loaded while catalog still loading.
    * `[✅]`   **Functional goal:** Keep existing pre-project fetch orchestration (`fetchDomains`, `fetchAIModelCatalog`, `fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`) on mount/domain change — all run without opening the model popover; this node only adds tier-cap init to that same lifecycle.
    * `[✅]`   **Functional goal:** Change `preProjectCostCeilingResult` type to `ComputeCostCeilingReturn` only (remove `| null`). Derive success/error from `'error' in result`; never branch on `result === null`.
    * `[✅]`   **Functional goal — cost estimate footer (`create-project-*` testids):** Define `isCostEstimateLoading` true when **any** of: `authStore.isLoading`, `isLoadingModelCatalog`, `isLoadingDomainProcessAssociation`, `isLoadingProcessTemplate`, `isLoadingStageExpectedCounts`. While `isCostEstimateLoading`, render `data-testid="create-project-estimate-loading-notice"` with copy for the **first** active flag in that order: tier → `"Loading subscription tier…"`; catalog → `"Loading model catalog…"`; association → `"Loading domain process association…"`; template → `"Loading process template…"`; stage counts → `"Loading stage expected counts…"`. **Do not** render any error notice during loading; **do not** render bundled no-estimate copy during loading.
    * `[✅]`   **Functional goal — cap-init result in component-local state:** On each `initializeMaxOutputTokens()` call when `isCapInitReady`, assign return to component-local `capInitResult` (not Zustand). Clear `capInitResult` on deps/context change or when return is `{ ok: true }`.
    * `[✅]`   **Functional goal — footer error gate order (after `!isCostEstimateLoading`, first match wins; every failure surfaced; pass-through verbatim):** Subscribe `authStore.error` only (not dialectic error fields). Render `create-project-estimate-error-notice` with **only** the matching message — no prefix, no rewording: (1) `authStore.error !== null` → `authStore.error.message`. (2) `userTier === null` → `'Subscription tier is not available.'` (same copy as node 6 `AIModelSelector` tier-unavailable notice). (3) `capInitResult?.ok === false` → `capInitResult.error.message` (same reference). (4) `'error' in preProjectCostCeilingResult` → `preProjectCostCeilingResult.error.message`. **Do not** display selector `OUTPUT_CAP_NOT_INITIALIZED` when steps (1) or (2) apply. When no error in steps (1)–(4) and success with finite ceilings, keep existing preview / balance warnings.
    * `[✅]`   **Functional goal — autostart demotion copy (`autoUncheckReason`):** Remove bundled strings. Use the **same gate order** as footer error gate after loading: (1) while `isCostEstimateLoading`, loading copy matching footer; (2) `authStore.error !== null` → pass-through `authStore.error.message`; (3) `userTier === null` → `'Subscription tier is not available.'`; (4) `capInitResult?.ok === false` → pass-through `capInitResult.error.message`; (5) `'error' in preProjectCostCeilingResult` → pass-through `preProjectCostCeilingResult.error.message`; (6) retain `"No default models available"` only when `!isLoadingModelCatalog && defaultModels.length === 0`.
    * `[✅]`   **Functional goal — `onSubmit` autostart gate:** Remove `preProjectCostCeilingResult === null` branch and toast `"Cost estimate is not available yet."`. On autostart spend path after loading, apply **same gate order** as footer before calling `createProjectAndAutoStart`: toast and return on first match among `authStore.error.message`, tier-unavailable copy, `capInitResult.error.message` when `capInitResult?.ok === false`, then `preProjectCostCeilingResult.error.message` when `'error' in result`. Keep insufficient-balance toast unchanged.
    * `[✅]`   **Non-functional:** Do not edit `OutputCapSlider`, `AIModelSelector`, selectors, or subscription CTA links in this node. Popover open state unchanged; cap init must not depend on popover.

  * `[✅]`   `role`
    * `[✅]`   Create-project UI — wires auth tier hydrate → store cap init; displays cost ceiling from selector + loading flags.
    * `[✅]`   Out of scope: slider UX, model selector defaults UI, session page, subscription deep links.

  * `[✅]`   `module`
    * `[✅]`   `apps/web` dialectic create-project form and its co-located tests listed below.

  * `[✅]`   `deps`
    * `[✅]`   Node 1: `initializeMaxOutputTokens` on `useDialecticStore`.
    * `[✅]`   Node 2: `selectPreProjectCostCeiling` returns `ComputeCostCeilingReturn` only.
    * `[✅]`   `useAuthStore` from `@paynless/store` — `isLoading`, `userTier`, `error`.
    * `[✅]`   Dialectic store — `initializeMaxOutputTokens`, `isLoadingModelCatalog`, `modelCatalog`, `isLoadingDomainProcessAssociation`, `isLoadingProcessTemplate`, `isLoadingStageExpectedCounts`.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: auth tier + loading + `error`; component-local `capInitResult`; dialectic fetch loading flags; `selectPreProjectCostCeiling`; wallet via existing selector.
    * `[✅]`   Writes: calls `initializeMaxOutputTokens` only (no direct `setMaxOutputTokens` in form).

  * `[✅]`   apps/web/src/components/dialectic/CreateDialecticProjectForm.autostart.test.tsx
    * `[✅]`   update `selectPreProjectCostCeilingMock` return type to `ComputeCostCeilingReturn` (no `| null`).
    * `[✅]`   replace test ~738 `shows no-estimate notice and disables Autostart when selector returns null` → mock `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }`; expect pass-through `error.message` in footer/demotion; `create-project-no-estimate-notice` absent.
    * `[✅]`   ~L268, ~L778: replace `mockReturnValue(null)` with concrete `{ error: ApiError }` per scenario.
    * `[✅]`   add test — auth `isLoading: false`, `userTier` set, catalog loaded, popover closed (default) — `initializeMaxOutputTokens` mock/action called once after catalog ready (not while `isLoadingModelCatalog: true`).
    * `[✅]`   add test — while `isLoadingModelCatalog: true`, `initializeMaxOutputTokens` **not** called; footer shows catalog loading notice, not error notice.
    * `[✅]`   add test — while `authStore.isLoading: true`, footer shows `create-project-estimate-loading-notice` (`"Loading subscription tier…"`), not error notice.
    * `[✅]`   add test — while `isLoadingModelCatalog: true`, footer shows loading notice for catalog, not error notice.
    * `[✅]`   add test — while `isLoadingStageExpectedCounts: true`, footer shows `create-project-estimate-loading-notice`, not `create-project-estimate-error-notice` and not bundled no-estimate copy.
    * `[✅]`   add test — `authStore.isLoading: false`, `userTier: null`, `authStore.error: null`, selector mock `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }` → footer `create-project-estimate-error-notice` text **exactly** `'Subscription tier is not available.'`; **not** selector message; autostart demotion matches.
    * `[✅]`   add test — `authStore.error` set with `{ code: 'TIER_FETCH_FAILED', message: 'Profile tier fetch failed.' }`, selector mock any error → footer and demotion show **exactly** `'Profile tier fetch failed.'` (pass-through; wins over selector).
    * `[✅]`   add test — `initializeMaxOutputTokens` returns `{ ok: false, error }` with each code `NO_DEFAULT_GENERATION_MODELS`, `MODEL_CATALOG_ENTRY_MISSING`, `MODEL_OUTPUT_CAP_UNAVAILABLE`, `MODEL_CATALOG_INVALID_CONFIG` → footer shows **exactly** `error.message` (same reference pass-through); selector not consulted for display when cap-init error present (mock selector to different message; assert init error wins).
    * `[✅]`   update demotion/submit tests — selector error before submit toasts pass-through `error.message` only when auth/tier/init gates pass; remove expectations on `toBeNull()` selector mocks.

  * `[✅]`   apps/web/src/components/dialectic/CreateDialecticProjectForm.test.tsx
    * `[✅]`   `selectPreProjectCostCeilingMock` generic `[DialecticStateValues], ComputeCostCeilingReturn` (remove `| null`); remove default `() => null`.
    * `[✅]`   `beforeEach` (~L237): replace `mockReturnValue(null)` with `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }`.
    * `[✅]`   replace test ~647 `shows create-project-no-estimate-notice when selector returns null` → `shows create-project-estimate-error-notice when selector returns OUTPUT_CAP_NOT_INITIALIZED`; expect notice text **exactly** `error.message`; assert `create-project-no-estimate-notice` absent.
    * `[✅]`   success test ~635–644: remove `queryByTestId('create-project-no-estimate-notice')` assertion.
    * `[✅]`   error test ~659–671 unchanged — pass-through `error.message` only.

  * `[✅]`   apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx
    * `[✅]`   import `useAuthStore`; subscribe `isLoading`, `userTier`, `error`; subscribe `initializeMaxOutputTokens` and `isLoadingProcessTemplate`; hold `capInitResult` in component-local state per objective.
    * `[✅]`   `useEffect` on `[isLoading, userTier, isLoadingModelCatalog, modelCatalog.length]` → call `initializeMaxOutputTokens()` only when `isCapInitReady` per objective; assign return to `capInitResult`.
    * `[✅]`   `preProjectCostCeilingResult: ComputeCostCeilingReturn` (no null); remove all `=== null` / `!== null` checks on selector result; use footer error gate order (auth → tier-unavailable → `capInitResult` → selector) after loading; success field access only when no error in gate.
    * `[✅]`   implement `isCostEstimateLoading` and loading-notice vs error-notice vs preview branches per objective; remove bundled strings from footer and `autoUncheckReason`; autostart submit uses same gate order.

  * `[✅]`   apps/web/src/components/dialectic/CreateDialecticProjectForm.costCeiling.integration.test.tsx
    * `[✅]`   seed `useAuthStore` (or MSW profile/tier handler if integration uses real auth hydrate) with `isLoading: false`, `userTier.output_cap_tokens: 1000`, fixture model cap `1000` (or lower model cap → expect **`min(tier, model)`**); **do not** pass `maxOutputTokens` in `seedPreProjectFormStore` (omit override so store starts `null`).
    * `[✅]`   new test `tier + catalog hydrated, popover closed → maxOutputTokens set → cost preview`: render form without opening model popover; `await waitFor` `useDialecticStore.getState().maxOutputTokens === min(tierCap, bindingModelCap)` from fixture; `selectPreProjectCostCeiling` success; `create-project-cost-preview` visible; Autostart checked when wallet sufficient.
    * `[✅]`   update `null prerequisites: missing maxOutputTokens` — auth `isLoading: false`, `userTier: null` → footer `'Subscription tier is not available.'`, **not** `OUTPUT_CAP_NOT_INITIALIZED`; auth still loading → loading notice only; auth tier loaded + catalog ready + init returns `{ ok: false, error }` → pass-through init error message, not bundled notice.
    * `[✅]`   update `API counts error` test — expect `selectPreProjectCostCeiling` returns `{ error: sameReference as stageExpectedCountsError }`; UI shows pass-through API error message via `create-project-estimate-error-notice`, not `create-project-no-estimate-notice`.
    * `[✅]`   update success-stack test — remove manual `maxOutputTokens` seed; rely on tier init + API hydration path.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `CreateDialecticProjectForm.tsx`: zero `preProjectCostCeilingResult === null`, zero `create-project-no-estimate-notice`, zero bundled “not ready” / “No cost estimate yet” strings.
    * `[✅]`   With tier `output_cap_tokens: 8192`, model cap `4096`, auth + catalog loaded, popover closed: after mount, `maxOutputTokens === 4096` (`min(tier, model)`) without opening popover.
    * `[✅]`   With tier `8192` and model cap `8192`, after mount, `maxOutputTokens === 8192`.
    * `[✅]`   Integration test passes: tier hydrated → cap set → preview → autostart affordance without popover interaction.
    * `[✅]`   API `stageExpectedCountsError` surfaces unchanged `message` in UI (selector pass-through from node 2) when auth/tier/init gates pass.
    * `[✅]`   Auth loaded with `userTier === null` and no `auth.error`: footer and autostart demotion show `'Subscription tier is not available.'`, not selector `OUTPUT_CAP_NOT_INITIALIZED`.
    * `[✅]`   `authStore.error` surfaces unchanged `message` in footer/demotion/submit before any selector error.
    * `[✅]`   `capInitResult.error.message` surfaces unchanged in footer/demotion/submit before selector error when tier is available and init returned `{ ok: false, error }` for **each** code: `NO_DEFAULT_GENERATION_MODELS`, `MODEL_CATALOG_ENTRY_MISSING`, `MODEL_OUTPUT_CAP_UNAVAILABLE`, `MODEL_CATALOG_INVALID_CONFIG`.
    * `[✅]`   Autostart test file: zero `.toBeNull()` on selector mock return type; zero assertions on removed bundled copy.

* `[✅]`   apps/web/src/components/dialectic/SessionInfoCard **Session tier cap init; session cost-ceiling UI from loading flags and pass-through errors**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** Session page cost footer treats `selectCostCeiling === null` as bundled `session-info-no-estimate-notice` (“Open Model Settings… output cap… stage counts”). `maxOutputTokens` stays `null` until `OutputCapSlider` mounts inside the closed model popover even though `userTier.output_cap_tokens` hydrated from profile. Node 2 selectors never return `null`; this component still types and branches on `null`. Error line prefixes `"Cost estimate failed:"` instead of pass-through `error.message`. Session progress hydration (`progressHydrationStatus`) has no loading line — missing run counts surface as selector errors while hydration is still `pending`.
    * `[✅]`   **Functional goal:** Import `useAuthStore` from `@paynless/store`. Subscribe `isLoading`, `userTier`. Subscribe `initializeMaxOutputTokens` from `useDialecticStore`. Define **`isCapInitReady`** when **all** of: `isLoading === false`; `userTier !== null`; `isLoadingModelCatalog === false`; `modelCatalog.length > 0`. Add `useEffect` with deps `[isLoading, userTier, isLoadingModelCatalog, modelCatalog.length, session?.id, selectedModels.length]`: when `isCapInitReady && session !== null`, call `useDialecticStore.getState().initializeMaxOutputTokens()` (Ultra model cap and default models when selection empty remain inside store action from node 1 — do not duplicate). Re-run when session or model selection changes so session-loaded `selectedModels` triggers init after catalog ready. Cap init must not depend on `isModelSelectorOpen` or popover mount.
    * `[✅]`   **Functional goal:** Subscribe `progressHydrationStatus`, `isLoadingProcessTemplate` from dialectic store. Define `runKey = \`${session.id}:${session.iteration_count}\`` (only when `session !== null` in render logic). Loading flags for cost footer: (1) `authStore.isLoading === true` → tier loading; (2) `isLoadingProcessTemplate === true` → template loading; (3) `progressHydrationStatus[runKey] === 'pending'` → stage progress loading.
    * `[✅]`   **Functional goal:** Change `costCeilingResult` to `ComputeCostCeilingReturn` only (remove `| null`). In `useShallow` callback: when `state.activeSessionDetail?.id === undefined`, return `{ error: { code: 'SESSION_NOT_READY', message: 'Session is not active.' } }` (footer not rendered on skeleton path — see below). When id defined, return `selectCostCeiling(state, id)`.
    * `[✅]`   **Functional goal — cap-init result in component-local state:** Same `capInitResult` contract as node 3 — assign from each `initializeMaxOutputTokens()` return; not Zustand.
    * `[✅]`   **Functional goal — cost estimate footer:** Define `isCostEstimateLoading` when any of: `authStore.isLoading`, `isLoadingProcessTemplate`, or `progressHydrationStatus[runKey] === 'pending'`. While loading, render `session-info-estimate-loading-notice` with copy for the **first** active flag in that order: tier → `"Loading subscription tier…"`; template → `"Loading process template…"`; progress pending → `"Loading stage progress…"`. **Never** render error or success estimate lines during loading. Subscribe `authStore.error` only.
    * `[✅]`   **Functional goal — footer error gate order (after `!isCostEstimateLoading`, first match wins; every failure surfaced; pass-through verbatim):** Render `session-info-estimate-error-notice` with **only** the matching message — no `"Cost estimate failed:"` prefix, no rewording: (1) `authStore.error !== null` → `authStore.error.message`. (2) `userTier === null` → `'Subscription tier is not available.'` (same copy as node 6). (3) `capInitResult?.ok === false` → `capInitResult.error.message`. (4) `'error' in costCeilingResult` → `costCeilingResult.error.message`. **Do not** display selector `OUTPUT_CAP_NOT_INITIALIZED` when steps (1) or (2) apply. When no error in steps (1)–(4), keep existing `session-info-stage-cost-estimate`, `session-info-project-cost-estimate`, and `session-info-project-balance-warning` branches unchanged (including `/subscription?tab=top-up` link on balance warning — subscription CTA deep link is a later FE4 node).
    * `[✅]`   **Functional goal:** Remove `session-info-no-estimate-notice` element and all bundled copy (`"No cost estimate yet. Open Model Settings…"`). Remove every `costCeilingResult === null` branch and `costCeilingSuccessResult` derivation that treats `null` as a third state — use footer error gate order after loading, then success only when no error in gate.
    * `[✅]`   **Non-functional:** Do not edit `OutputCapSlider`, `AIModelSelector`, selectors, `dialecticStore.ts`, or subscription CTA URL building in this node.

  * `[✅]`   `role`
    * `[✅]`   Session header UI — wires auth tier hydrate → store cap init after session load; displays session cost ceiling from `selectCostCeiling` + hydration/template loading flags.
    * `[✅]`   Out of scope: generate button NSF, slider UX, selector implementation, pre-project form, subscription cart prefill.

  * `[✅]`   `module`
    * `[✅]`   `apps/web` dialectic session info card and `SessionInfoCard.test.tsx` only.

  * `[✅]`   `deps`
    * `[✅]`   Node 1: `initializeMaxOutputTokens` on `useDialecticStore`.
    * `[✅]`   Node 2: `selectCostCeiling` returns `ComputeCostCeilingReturn` only.
    * `[✅]`   `useAuthStore` — `isLoading`, `userTier`, `error`.
    * `[✅]`   Dialectic store — `initializeMaxOutputTokens`, `isLoadingModelCatalog`, `modelCatalog`, `progressHydrationStatus`, `isLoadingProcessTemplate`, `selectSelectedModels`, `selectViewingStage`, `selectUnifiedProjectProgress`, wallet via `selectActiveChatWalletInfo`, `ComputeCostCeilingReturn` from `@paynless/utils`.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: `activeSessionDetail`, `currentProjectDetail`, auth tier + loading + `error`, component-local `capInitResult`, `progressHydrationStatus`, `isLoadingProcessTemplate`, `selectCostCeiling(session.id)`.
    * `[✅]`   Writes: calls `initializeMaxOutputTokens` only (no direct `setMaxOutputTokens` in component).

  * `[✅]`   apps/web/src/components/dialectic/SessionInfoCard.test.tsx
    * `[✅]`   Extend `vi.mock('@paynless/store', …)` to include `useAuthStore` from `@/mocks/authStore.mock` (`resetAuthStoreMock` in `beforeEach` for cost-ceiling describe and layout tests that assert footer behavior).
    * `[✅]`   change `selectCostCeilingMock` return type to `ComputeCostCeilingReturn` (remove `| null`); default mock return `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }` instead of `null`.
    * `[✅]`   delete test `renders no-estimate guidance when selectCostCeiling returns null`; replace with `renders estimate error notice when selectCostCeiling returns OUTPUT_CAP_NOT_INITIALIZED` — mock `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }`; expect `session-info-estimate-error-notice` text equals message exactly; `session-info-no-estimate-notice` absent.
    * `[✅]`   update `renders estimate error notice when selectCostCeiling returns error` — assert `session-info-estimate-error-notice` text content is **exactly** `costCeilingError.message` with no `"Cost estimate failed:"` prefix.
    * `[✅]`   add test `does not call initializeMaxOutputTokens while isLoadingModelCatalog` — catalog loading; expect spy not called; loading notice, not cap init error.
    * `[✅]`   add test `calls initializeMaxOutputTokens when auth tier and catalog loaded and session active` — seed auth mock `isLoading: false`, `userTier: { level: 10, name: 'basic', output_cap_tokens: 8192, max_models_per_project: 2 }`, `isLoadingModelCatalog: false`, non-empty catalog; spy `initializeMaxOutputTokens` on dialectic mock store; render with `setupCostCeilingFixture()` and popover closed; expect spy called once.
    * `[✅]`   add test `shows loading notice while progressHydrationStatus runKey is pending` — `setupCostCeilingFixture({ progressHydrationStatus: { [`${mockSessionId}:${mockIterationNumber}`]: 'pending' } })`; expect `session-info-estimate-loading-notice` with `"Loading stage progress…"`; no `session-info-estimate-error-notice`.
    * `[✅]`   add test `shows loading notice while auth isLoading` — auth `isLoading: true`; expect `"Loading subscription tier…"`; no error notice.
    * `[✅]`   add test `shows tier-unavailable notice when auth loaded and userTier null` — `isLoading: false`, `userTier: null`, `auth.error: null`, selector mock `OUTPUT_CAP_NOT_INITIALIZED` → `session-info-estimate-error-notice` text **exactly** `'Subscription tier is not available.'`; **not** selector message; `session-info-no-estimate-notice` absent.
    * `[✅]`   add test `passes through authStore.error before selector error` — seed `auth.error: { code: 'TIER_FETCH_FAILED', message: 'Profile tier fetch failed.' }`; selector mock different message → notice text **exactly** `'Profile tier fetch failed.'`.
    * `[✅]`   add test `passes through capInitResult error before selector error` — for each init failure code `NO_DEFAULT_GENERATION_MODELS`, `MODEL_CATALOG_ENTRY_MISSING`, `MODEL_OUTPUT_CAP_UNAVAILABLE`, `MODEL_CATALOG_INVALID_CONFIG`: mock init return `{ ok: false, error }`; selector mock different message → notice text **exactly** init error message.
    * `[✅]`   update layout tests at lines expecting `session-info-no-estimate-notice` (`Row 2 renders…`, seed-prompt layout test ~L404) — when mock selector returns error, expect `session-info-estimate-error-notice` or loading notice per seeded state; never expect `session-info-no-estimate-notice`.
    * `[✅]`   keep success-path tests (`stage`/`project` estimates, balance warning, top-up link) unchanged except remove `session-info-no-estimate-notice` null checks where success mock used.

  * `[✅]`   apps/web/src/components/dialectic/SessionInfoCard.tsx
    * `[✅]`   add `useEffect`, `useAuthStore` (`isLoading`, `userTier`, `error`), `initializeMaxOutputTokens`, `capInitResult` (component-local), `progressHydrationStatus`, `isLoadingProcessTemplate` subscriptions per objective.
    * `[✅]`   implement loading / error / success footer branches using footer error gate order; remove `session-info-no-estimate-notice` and null-selector branches; error notice pass-through message only.
    * `[✅]`   `costCeilingSuccessResult` — assign only when `!isCostEstimateLoading` and footer error gate (auth → tier-unavailable → `capInitResult` → selector) yields no error.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `SessionInfoCard.tsx`: zero `session-info-no-estimate-notice`, zero `costCeilingResult === null`, zero `"Cost estimate failed:"`, zero bundled “No cost estimate yet” / “Open Model Settings” strings.
    * `[✅]`   Grep `SessionInfoCard.test.tsx`: zero `session-info-no-estimate-notice`, zero `selectCostCeilingMock.mockReturnValue(null)`.
    * `[✅]`   With auth tier `output_cap_tokens: 8192`, model cap from fixture, catalog loaded, session active, popover closed: `initializeMaxOutputTokens` invoked when `isCapInitReady`.
    * `[✅]`   Injected selector `{ error: ApiError }` surfaces unchanged `message` in `session-info-estimate-error-notice` when auth/tier/init gates pass.
    * `[✅]`   Auth loaded with `userTier === null` and no `auth.error`: footer shows `'Subscription tier is not available.'`, not selector `OUTPUT_CAP_NOT_INITIALIZED`.
    * `[✅]`   `authStore.error` and `capInitResult.error.message` surface unchanged before selector error for **each** init failure code: `NO_DEFAULT_GENERATION_MODELS`, `MODEL_CATALOG_ENTRY_MISSING`, `MODEL_OUTPUT_CAP_UNAVAILABLE`, `MODEL_CATALOG_INVALID_CONFIG`.
    * `[✅]`   Success estimates and project balance warning tests remain green.
    * `[✅]`   No edits outside `SessionInfoCard.tsx` and `SessionInfoCard.test.tsx` in this node.

* `[✅]`   apps/web/src/components/dialectic/OutputCapSlider **Blocked/loading UI instead of silent null; store display + tier thumb max; persist cap only on user commit**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `OutputCapSlider` returns `null` silently when `availableTiers.length === 0`, `userTier === null`, or `sliderRangeMax === null` (lines 315–323), so the model-settings popover shows empty space with no diagnostic. Local `useEffect` (lines 150–167) seeds `sliderRealValue` from `userTier.output_cap_tokens` or `sliderRangeMax` when `maxOutputTokens === null`, duplicating init that nodes 3/4 delegate to `initializeMaxOutputTokens`. Display `currentDisplayValue` (lines 338–345) falls back to tier/model cap when store cap is null, masking uninitialized store state. Cost selectors require finite `dialecticStore.maxOutputTokens`; slider must not write the store except on explicit user override.
    * `[✅]`   **Functional goal — no silent `return null`:** Replace all early `return null` guards with visible UI. Gate order (first match wins): (1) `isLoading === true` → `output-cap-slider-loading-notice` `"Loading subscription tier…"`. (2) `!isLoading && authStore.error !== null` → `output-cap-slider-blocked-notice` with **only** `authStore.error.message` (pass-through). (3) `!isLoading && userTier === null && authStore.error === null` → blocked with `{ code: 'SUBSCRIPTION_TIER_UNAVAILABLE', message: 'Subscription tier is not available.' }`. (4) `availableTiers.length === 0` → blocked with fixed `NO_TIERS_LOADED` message. (5) no selected models → blocked notice with **only** `'No models selected.'` (same text as selector — no prefix). (6) invalid catalog config for a selected model → blocked with **only** **`Model catalog config invalid for model id <id>.`** (exact node 1/2 message — never `"Model catalog config invalid for selected model."`). (7) `maxOutputTokens` not finite → blocked with **only** `'Output cap is not initialized in dialectic store.'` when not loading (parent must run cap init first). Never `return null`. Never reword pass-through messages. **Do not** subscribe dialectic error store fields — slider does not call `initializeMaxOutputTokens`.
    * `[✅]`   **Functional goal — display reads store only:** Success-path slider reads **`maxOutputTokens` from store** for display and for `computeCostCeiling` input (via selectors). `activeThumbMax` / track bounds use existing tier-vs-model UI clamp logic for **interaction only**; do **not** write store except on user commit. Do **not** recalculate or persist tier default cap in this component.
    * `[✅]`   **Functional goal — no init in this component:** Do not import or call `initializeMaxOutputTokens`. Do not call `setMaxOutputTokens` in `useEffect`, on mount, or when syncing display from tier/model cap. Parent nodes (`CreateDialecticProjectForm`, `SessionInfoCard`) own tier hydrate → store init.
    * `[✅]`   **Functional goal — `setMaxOutputTokens` only on user commit:** Keep `applyOutputCapValue(..., persistToStore)` contract: `persistToStore: false` on `Slider` `onValueChange` (drag/live preview only — updates local `sliderRealValue` and upgrade CTA state). `persistToStore: true` only on `Slider` `onValueCommit` and accessible tier-marker button clicks (lines 515–518). When `persistToStore === true`, call `setMaxOutputTokens(requestedReal)` (node 1 sets `outputCapUserCustomized: true`). Do not add any other call sites for `setMaxOutputTokens` in this file.
    * `[✅]`   **Functional goal — success path unchanged:** When all gates pass and `maxOutputTokens` is finite, retain existing segmented slider, tier markers, helper text, upgrade CTA, and `/subscription` navigate on Upgrade button (subscription deep-link URL change is a later FE4 node).
    * `[✅]`   **Non-functional:** Do not edit `dialecticStore.ts`, selectors, `CreateDialecticProjectForm`, `SessionInfoCard`, or `AIModelSelector` in this node. Depends on nodes 1 (store init + `outputCapUserCustomized` on `setMaxOutputTokens`) and 3/4 (parents call initializer before slider mounts in popover).

  * `[✅]`   `role`
    * `[✅]`   Model-settings popover UI — displays output cap from initialized store value; persists user overrides only on commit; surfaces blocked/loading states instead of disappearing.
    * `[✅]`   Out of scope: tier hydrate init, cost ceiling selectors, default model selection, subscription cart prefill.

  * `[✅]`   `module`
    * `[✅]`   `apps/web` dialectic output cap slider and co-located tests listed below.

  * `[✅]`   `deps`
    * `[✅]`   Node 1: `setMaxOutputTokens` sets `outputCapUserCustomized: true`; parents use `initializeMaxOutputTokens`.
    * `[✅]`   `useAuthStore` — `isLoading`, `userTier`, `availableTiers`.
    * `[✅]`   `useDialecticStore` — `maxOutputTokens`, `setMaxOutputTokens`, `modelCatalog`, `selectedModels`.
    * `[✅]`   `isAiModelExtendedConfig` from `@paynless/utils` (unchanged usage for `sliderRangeMax`).

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: auth loading + tier + tier list; store cap + catalog + selection.
    * `[✅]`   Writes: `setMaxOutputTokens` only via `applyOutputCapValue` with `persistToStore: true`.

  * `[✅]`   apps/web/src/components/dialectic/OutputCapSlider.test.tsx
    * `[✅]`   add test `does not call setMaxOutputTokens on mount when maxOutputTokens already initialized` — seed `maxOutputTokens: 8192`, tier + catalog + selection; render; expect `setMaxOutputTokens` not called.
    * `[✅]`   add test `shows loading notice while auth isLoading` — `mockSetAuthIsLoading(true)`; expect `output-cap-slider-loading-notice` with `"Loading subscription tier…"`; no slider, no blocked notice.
    * `[✅]`   replace `when maxOutputTokens is null in store, component renders with tier default display` — seed `maxOutputTokens: null` with otherwise valid tier/catalog/selection; expect `output-cap-slider-blocked-notice` text `"Output cap is not initialized in dialectic store."`; no slider; `setMaxOutputTokens` not called.
    * `[✅]`   replace `when availableTiers is empty, component handles gracefully without tier markers` — expect `output-cap-slider-blocked-notice` `"Subscription tiers are not loaded."`; assert `container.firstChild` is not null; no tier marker buttons.
    * `[✅]`   replace `when selectedModels is empty, component returns null and does not render slider` — expect blocked notice `"No models selected."`; not `container.firstChild === null`.
    * `[✅]`   replace `does not render slider when only selected model has config that fails isAiModelExtendedConfig` — expect blocked notice text exactly **`Model catalog config invalid for model id model-invalid-config.`**; not silent null; not alternate copy.
    * `[✅]`   add test `when userTier is null and auth not loading, shows tier unavailable blocked notice` — auth `userTier: null`, `isLoading: false`; expect `"Subscription tier is not available."`.
    * `[✅]`   update drag tests — `onValueChange` path must not call `setMaxOutputTokens`; only commit paths (tier marker click, `onValueCommit`) increment mock call count (existing tier-marker and basic-marker tests remain valid).
    * `[✅]`   keep success-path tests (tier markers, upgrade CTA, clamp at thumb max, page-equivalent copy, navigate to subscription) unchanged except remove any `container.firstChild` null expectations.

  * `[✅]`   apps/web/src/components/dialectic/OutputCapSlider.tsx
    * `[✅]`   subscribe `isLoading` from `useAuthStore`.
    * `[✅]`   replace lines 315–323 `return null` with gated loading/blocked JSX per objective (ordered gates 1–6).
    * `[✅]`   narrow `useEffect` (lines 150–167) — sync `sliderRealValue` from finite `maxOutputTokens` only; drop tier/model fallback when store cap null.
    * `[✅]`   success-path `currentDisplayValue` uses finite `maxOutputTokens` only (remove null-store tier/model fallback).
    * `[✅]`   verify `setMaxOutputTokens` invoked only inside `applyOutputCapValue` when `persistToStore === true` (marker click + `onValueCommit`); `onValueChange` stays `persistToStore: false`.

  * `[✅]`   apps/web/src/components/dialectic/OutputCapSlider.integration.test.tsx
    * `[✅]`   seed `maxOutputTokens: initialCap` (finite) in all interaction tests — never rely on slider tier-fallback init; document that null cap shows blocked UI, not draggable slider.
    * `[✅]`   in `function → consumer: persists chosen cap to real dialectic store` — after `dragSegmentedSliderToTokens`, if store not updated (keyboard may only fire `onValueChange`), add `await userEvent.tab()` on slider to trigger `onValueCommit`; then `waitFor` store `maxOutputTokens === thumbTokens`.
    * `[✅]`   same tab/commit assist in `full chain: basic tier thumb cap…` drag segment before asserting stored cap.
    * `[✅]`   `provider → function: filters unreachable tier` and tier-marker persist assertions remain green with finite initial cap.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `OutputCapSlider.tsx`: zero `return null`; zero `initializeMaxOutputTokens`; zero `setMaxOutputTokens` outside `applyOutputCapValue` when `persistToStore` is true.
    * `[✅]`   Grep `OutputCapSlider.test.tsx` and `OutputCapSlider.integration.test.tsx`: zero `container.firstChild).toBeNull()` for blocked prerequisite cases; zero test expecting tier-default display when `maxOutputTokens === null`.
    * `[✅]`   Mount with `maxOutputTokens: 8192`, valid tier/catalog/selection: slider visible; `setMaxOutputTokens` not called on mount.
    * `[✅]`   Mount with `maxOutputTokens: null`, valid prerequisites otherwise: `output-cap-slider-blocked-notice` visible; no slider.
    * `[✅]`   Tier-marker click and slider commit persist cap to store; drag without commit does not (unit mock assertions).
    * `[✅]`   Integration test: real store receives updated `maxOutputTokens` after commit interaction.
    * `[✅]`   No edits outside `OutputCapSlider.tsx`, `OutputCapSlider.test.tsx`, and `OutputCapSlider.integration.test.tsx` in this node.

* `[✅]`   apps/web/src/components/dialectic/AIModelSelector **Auth tier loading gate; remove level-0 tier fallback; remove default-models effect (store owns defaults)**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `AIModelSelector.tsx` lines 229–241 synthesize `effectiveUserTier` by falling back to `availableTiers` level `0` when `userTier === null`, masking auth hydrate failures and violating the no-fallback rule. Lines 270–280 apply default generation models via `setSelectedModels(defaultModels)` inside this component (gated on popover mount path), duplicating node 1 `initializeMaxOutputTokens` default-model application and node 3/4 parent `useEffect` tier-cap init lifecycle. Component does not subscribe `useAuthStore.isLoading`, so tier-gated model rows and cap logic run before profile tier is loaded.
    * `[✅]`   **Functional goal:** Subscribe `isLoading` from `useAuthStore` alongside existing `userTier`, `availableTiers`. Delete `effectiveUserTier` `useMemo` entirely. After auth gate passes (`isLoading === false` and `userTier !== null`), use `userTier` directly for `modelLimit` (`userTier.max_models_per_project`), tier-lock comparisons (`provider.min_plan_tier_level > userTier.level`), and `resolveNextTierName(availableTiers, userTier, modelLimit)`.
    * `[✅]`   **Functional goal — auth loading (gate order 1):** When `isLoading === true`, render `data-testid="ai-model-selector-loading-notice"` with text `"Loading subscription tier…"` above the dropdown trigger (inside root `div.w-full`, before `DropdownMenu`). Set `finalIsDisabled` true. Dropdown `dropdownContent` is `<DropdownMenuLabel>Loading subscription tier…</DropdownMenuLabel>`. Do not evaluate tier-lock or cap-upgrade tooltips against a synthetic tier.
    * `[✅]`   **Functional goal — tier unavailable (gate order 2):** When `isLoading === false` and `authStore.error !== null`, render `ai-model-selector-tier-unavailable-notice` with **only** `authStore.error.message`. When `isLoading === false`, `userTier === null`, and `authStore.error === null`, render notice with `{ code: 'SUBSCRIPTION_TIER_UNAVAILABLE', message: 'Subscription tier is not available.' }`. Set `finalIsDisabled` true in both cases.
    * `[✅]`   **Functional goal — success path (gates pass):** Keep existing `isConfigLoading` / `aiError` / provider list dropdown branches unchanged except replace every `effectiveUserTier` reference with `userTier`. Keep tier-lock upgrade `Link to="/subscription"` and cap upgrade links unchanged (subscription deep-link URL work is a later FE4 node). Keep `fetchAIModelCatalog` effect (lines 264–268) and `loadAiConfig` effect (lines 254–262).
    * `[✅]`   **Functional goal — remove default-models effect:** Delete `defaultsAppliedRef`, delete `defaultModels` subscription (`useDialecticStore(selectDefaultGenerationModels)`), delete `useEffect` at lines 270–280 that calls `setSelectedModels(defaultModels)`. Do not call `setSelectedModels` for defaults anywhere in this file. Default model selection when `selectedModels` is empty is owned by node 1 store initializer (invoked from node 3/4 parent effects).
    * `[✅]`   **Functional goal — pulsing (`needsAttention`):** `needsAttention` is false when `isLoading === true` or `userTier === null` (even if `selectedModels` empty). Existing condition otherwise unchanged: `!hasSelectedModels && !finalIsDisabled && !isConfigLoading && !aiError`.
    * `[✅]`   **Non-functional:** Do not edit `dialecticStore.ts`, selectors, `CreateDialecticProjectForm`, `SessionInfoCard`, `OutputCapSlider`, or subscription CTA URL building in this node. No new files.

  * `[✅]`   `role`
    * `[✅]`   Model-settings dropdown UI — tier-aware model multiplicity and upgrade affordances only.
    * `[✅]`   Out of scope: output cap init, cost ceiling display, default model store logic, subscription cart prefill.

  * `[✅]`   `module`
    * `[✅]`   `apps/web` dialectic AI model selector and `AIModelSelector.test.tsx` only.

  * `[✅]`   `deps`
    * `[✅]`   Node 1: default models applied in `initializeMaxOutputTokens` when selection empty (not in this component).
    * `[✅]`   Nodes 3/4: parents call `initializeMaxOutputTokens` when auth tier loaded.
    * `[✅]`   `useAuthStore` — `isLoading`, `userTier`, `availableTiers`.
    * `[✅]`   Existing `useAiStore`, `useDialecticStore` subscriptions except remove `selectDefaultGenerationModels` / default effect.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: auth loading + tier; ai providers/config; dialectic `selectedModels`, `modelCatalog`, multiplicity actions.
    * `[✅]`   Writes: `setModelMultiplicity` / implicit via multiplicity only — no `setSelectedModels` for defaults.

  * `[✅]`   apps/web/src/components/dialectic/AIModelSelector.test.tsx
    * `[✅]`   Extend `setupMockStores` / `beforeEach` usage: import `mockSetAuthIsLoading` from `@/mocks/authStore.mock`; default auth mock keeps `isLoading: false` and `userTier: mockUserTier` (existing behavior).
    * `[✅]`   add test `shows loading notice while auth isLoading` — call `mockSetAuthIsLoading(true)` in `setupMockStores` auth path before render; expect `ai-model-selector-loading-notice` text `"Loading subscription tier…"`; `screen.getByRole('button', { name: /Select AI Models/i })` has `disabled` attribute; `screen.queryByTestId(/^tier-lock-/)` is null.
    * `[✅]`   add test `shows tier unavailable notice when auth loaded and userTier is null` — `mockSetAuthIsLoading(false)`, auth `{ userTier: null, availableTiers: mockAllTiers }`; expect `ai-model-selector-tier-unavailable-notice` text `"Subscription tier is not available."`; trigger button disabled.
    * `[✅]`   delete test `when selectedModels is empty, defaultModels is non-empty, and activeContextSessionId is null, setSelectedModels is called with the default models` (lines 467–483).
    * `[✅]`   delete test `when selectedModels is already non-empty, setSelectedModels is NOT called for defaults` (lines 485–497).
    * `[✅]`   delete test `when activeContextSessionId is set, setSelectedModels is NOT called for defaults even if selectedModels is empty` (lines 499–511).
    * `[✅]`   delete test `after defaults are applied once, clearing all models does NOT re-apply defaults` (lines 513–533).
    * `[✅]`   add test `does not call setSelectedModels on mount when selectedModels empty` — seed empty `selectedModels`, non-empty `modelCatalog` with `is_default_generation` row, `activeContextSessionId: null`; render; expect `getDialecticStoreActionMock('setSelectedModels')` not called.
    * `[✅]`   update `AIModelSelector Pulsing animation` test `applies pulsing animation when no models selected…` — seed auth `isLoading: false`, `userTier: mockUserTier`; pulsing still applies when providers exist and selection empty.
    * `[✅]`   add pulsing test `does NOT pulse while auth isLoading` — `mockSetAuthIsLoading(true)`; expect trigger lacks `animate-pulse`.
    * `[✅]`   tier-lock and cap-upgrade tests (`tier-lock-*`, `upgrade-link-*`, Ultra unlimited multiplicity) remain green using explicit `userTier` in auth mock (no level-0 fallback path).

  * `[✅]`   apps/web/src/components/dialectic/AIModelSelector.tsx
    * `[✅]`   add `isLoading` to `useAuthStore` subscription (line 224 area).
    * `[✅]`   remove `effectiveUserTier` `useMemo` (lines 229–241); remove `selectDefaultGenerationModels` import and `defaultModels` / `defaultsAppliedRef` / default `useEffect` (lines 202–203, 270–280).
    * `[✅]`   add auth gate UI (loading notice, tier-unavailable notice) before `DropdownMenu`; compute `finalIsDisabled` to include `isLoading || userTier === null` in addition to existing disabled/providers logic.
    * `[✅]`   replace all `effectiveUserTier` identifiers with `userTier` in `handleMultiplicityChange`, provider map tier-lock branch, `resolveNextTierName` calls, and `atCap` footer — only in code paths reachable after `isLoading === false && userTier !== null` (TypeScript: early return UI branches before those handlers run, or narrow with guards at top of component body assigning `const tier: UserTier = userTier` only after gate).
    * `[✅]`   update `needsAttention` to exclude auth loading and null tier per objective.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `AIModelSelector.tsx`: zero `effectiveUserTier`; zero `selectDefaultGenerationModels`; zero `defaultsAppliedRef`; zero `setSelectedModels` calls.
    * `[✅]`   Grep `AIModelSelector.test.tsx`: zero tests asserting `setSelectedModels` called with default models on mount.
    * `[✅]`   `isLoading: true` → loading notice visible, trigger disabled, no pulse.
    * `[✅]`   `isLoading: false`, `userTier: null` → tier-unavailable notice visible, trigger disabled.
    * `[✅]`   Loaded tier + providers: tier-lock and cap-upgrade tests pass unchanged.
    * `[✅]`   No edits outside `AIModelSelector.tsx` and `AIModelSelector.test.tsx` in this node.

* `[✅]`   apps/web/src/components/dialectic/AIModelSelectorList **Auth tier loading gate; remove level-0 tier fallback (parity with AIModelSelector)**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `AIModelSelectorList.tsx` lines 70–82 synthesize `effectiveUserTier` by falling back to `availableTiers` level `0` when `userTier === null`, masking auth hydrate failures and violating the no-fallback rule. Component does not subscribe `useAuthStore.isLoading`, so tier-lock comparisons (`provider.min_plan_tier_level > effectiveUserTier.level`), count-cap (`effectiveUserTier.max_models_per_project`), and cap-upgrade tooltips (`resolveNextTierName(availableTiers, effectiveUserTier, modelLimit)`) run before profile tier is loaded. Chat model step (`apps/web/src/components/chat/index.tsx`) renders this list without dialectic popover bootstrap — level-0 fallback is especially misleading there.
    * `[✅]`   **Functional goal:** Subscribe `isLoading` from `useAuthStore` alongside existing `userTier`, `availableTiers`. Delete `effectiveUserTier` `useMemo` entirely. After auth gates pass (`isLoading === false` and `userTier !== null`), use `userTier` directly for `modelLimit` (`userTier.max_models_per_project`), tier-lock comparisons, and `resolveNextTierName(availableTiers, userTier, modelLimit)`.
    * `[✅]`   **Functional goal — auth loading (gate order 1):** When `isLoading === true`, render root container with `data-testid="ai-model-selector-list-loading-notice"` and text `"Loading subscription tier…"` inside the existing bordered `div` (replace `ScrollArea` provider map — do not render provider rows). Honor `disabledProp` on root styling only; no checkbox interactions. Do not evaluate tier-lock or cap-upgrade tooltips against a synthetic tier.
    * `[✅]`   **Functional goal — tier unavailable (gate order 2):** When `isLoading === false` and `authStore.error !== null`, render `ai-model-selector-list-tier-unavailable-notice` with **only** `authStore.error.message`. When `isLoading === false`, `userTier === null`, and `authStore.error === null`, render notice with `{ code: 'SUBSCRIPTION_TIER_UNAVAILABLE', message: 'Subscription tier is not available.' }`.
    * `[✅]`   **Functional goal — success path (gates pass):** Keep existing `isConfigLoading` / `aiError` / `loadAiConfig` effect (lines 121–129), provider sort/map, checkbox toggle, tier-lock tooltips, count-cap tooltips, and `Link to="/subscription"` upgrade CTAs unchanged except replace every `effectiveUserTier` reference with `userTier`. Keep `disabledProp` passthrough to row `finalRowDisabled` in addition to tier-lock and cap blocks.
    * `[✅]`   **Non-functional:** Do not edit `dialecticStore.ts`, selectors, `AIModelSelector.tsx`, or subscription CTA URL building in this node. Pre-project cost estimate for chat onboarding is node 8 (`chat/index.tsx`). No default-model store logic (not applicable).

  * `[✅]`   `role`
    * `[✅]`   Checkbox model picker list — tier-aware row lock, count cap, and upgrade affordances for chat onboarding and any other embedder.
    * `[✅]`   Out of scope: output cap init, cost ceiling display, dialectic `selectedModels` sync (node 8 owns chat → store wiring), subscription cart prefill.

  * `[✅]`   `module`
    * `[✅]`   `apps/web` dialectic AI model list and `AIModelSelectorList.test.tsx` only.

  * `[✅]`   `deps`
    * `[✅]`   `useAuthStore` — `isLoading`, `userTier`, `availableTiers`.
    * `[✅]`   `useAiStore` — `availableProviders`, `isConfigLoading`, `aiError`, `loadAiConfig` (unchanged).
    * `[✅]`   Node 6 (`AIModelSelector`) shares auth-gate contract; implement independently in this file — do not edit node 6 in this node.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: auth loading + tier; ai providers/config.
    * `[✅]`   Writes: local `modelsChecked` state; `onChange(modelsChecked)` callback only.

  * `[✅]`   apps/web/src/components/dialectic/AIModelSelectorList.test.tsx
    * `[✅]`   **Mock deps (this file only — not a checklist node):** Extend `currentAuthState` and `setupMocks` `authPartial` with `isLoading?: boolean` (default `false`) and allow `userTier?: UserTier | null` override (existing `userTier` default `mockUserTier` unchanged).
    * `[✅]`   add test `shows loading notice while auth isLoading` — `setupMocks({ availableProviders: [providerFree, providerPremium] }, { isLoading: true, userTier: tierFree })`; expect `ai-model-selector-list-loading-notice` text `"Loading subscription tier…"`; `screen.queryByTestId(/^tier-lock-/)` null; `screen.queryByTestId(/^model-list-item-/)` null; `onChange` not called on attempted interaction if any clickable surface exists.
    * `[✅]`   add test `shows tier unavailable notice when auth loaded and userTier is null` — `setupMocks({ availableProviders: [providerFree] }, { isLoading: false, userTier: null, availableTiers: mockAllTiers })`; expect `ai-model-selector-list-tier-unavailable-notice` text `"Subscription tier is not available."`; no provider row testids; no tier-lock rows.
    * `[✅]`   add test `does not synthesize level-0 tier when userTier is null` — same seed as tier-unavailable test; grep rendered output — no `tier-lock-*` for premium provider (would appear if level-0 fallback ran); tier-unavailable notice present instead.
    * `[✅]`   keep existing tests (`model above user tier renders disabled`, tier-lock upgrade CTA, count cap, cap upgrade CTA, ultra unlimited) — ensure each seeds `isLoading: false` and explicit `userTier` in auth mock (no level-0 fallback path).

  * `[✅]`   apps/web/src/components/dialectic/AIModelSelectorList.tsx
    * `[✅]`   add `isLoading` to `useAuthStore` subscription (line 67 area).
    * `[✅]`   remove `effectiveUserTier` `useMemo` (lines 70–82).
    * `[✅]`   add auth gate early returns before provider map — loading notice and tier-unavailable notice per objective (preserve outer bordered container classes).
    * `[✅]`   replace all `effectiveUserTier` identifiers with `userTier` in `toggleModelChecked`, provider map tier-lock branch, `modelLimit` / `atCap`, and `resolveNextTierName` calls — only in code paths reachable after `isLoading === false && userTier !== null` (TypeScript: early-return UI branches before handlers, or assign `const tier: UserTier = userTier` after gate for closure use).

  * `[✅]`   `requirements`
    * `[✅]`   Grep `AIModelSelectorList.tsx`: zero `effectiveUserTier`; zero level-`0` tier fallback in `useMemo`; zero `availableTiers` scan for synthetic tier when `userTier === null`.
    * `[✅]`   Grep `AIModelSelectorList.test.tsx`: zero tests that pass with `userTier: null` expecting tier-lock or cap behavior without tier-unavailable notice.
    * `[✅]`   `isLoading: true` → loading notice visible; no provider rows; no tier-lock testids.
    * `[✅]`   `isLoading: false`, `userTier: null` → tier-unavailable notice visible; no provider rows.
    * `[✅]`   Loaded tier + providers: existing tier-lock, cap-block, and ultra tests pass unchanged.
    * `[✅]`   No edits outside `AIModelSelectorList.tsx` and `AIModelSelectorList.test.tsx` in this node.

* `[✅]`   apps/web/src/components/chat/index.tsx **Chat onboarding pre-project cost estimate; sync models to dialectic store; cap init when deps ready**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** Chat walkthrough (`domain` → `model` → `message`) is the entry path for converting chat to a dialectic project. `AIModelSelectorList` keeps selection in local state only; dialectic store never receives `selectedModels`, pre-project fetches (association, template, stage counts), or `initializeMaxOutputTokens`. User cannot see pre-project cost estimate before `CreateProjectFromChatButton` click — conversion spend is opaque until click-time gate in node 11.
    * `[✅]`   **Functional goal — sync model selection to store:** On `AIModelSelectorList` `onChange`, call `useDialecticStore.getState().setSelectedModels(modelsChecked)` (or equivalent store action) so `selectPreProjectCostCeiling` and cap init see the same models as the chat UI.
    * `[✅]`   **Functional goal — pre-project fetch orchestration:** When user selects a domain (`selectedDomainId` set), set dialectic `selectedDomain` and run the same pre-project fetch chain as `CreateDialecticProjectForm`: `fetchAIModelCatalog`, `fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts` for that domain — without opening dialectic Model Settings popover.
    * `[✅]`   **Functional goal — cap init when deps ready:** Subscribe `useAuthStore` (`isLoading`, `userTier`). Define **`isCapInitReady`** (same as node 3): auth loaded, tier present, catalog loaded (`!isLoadingModelCatalog && modelCatalog.length > 0`). `useEffect` calls `initializeMaxOutputTokens()` only when `isCapInitReady && selectedDomainId !== '' && hasSelectedModel` (or equivalent: store `selectedModels.length > 0`).
    * `[✅]`   **Functional goal — cost estimate UI on model/message steps:** Subscribe `selectPreProjectCostCeiling`, `authStore.error`; hold `capInitResult` from `initializeMaxOutputTokens()` in component-local state (same as node 3). Define `isCostEstimateLoading` with same flags as node 3 (auth, catalog, association, template, stage counts). While loading → `data-testid="chat-onboarding-estimate-loading-notice"` with first-match loading copy. After `!isCostEstimateLoading`, apply **same footer error gate order as node 3** (auth.error → tier-unavailable → `capInitResult` → selector) → `chat-onboarding-estimate-error-notice` with **only** the matching pass-through message. When success → show stage/project ceiling preview (reuse copy pattern from create form or minimal token estimate — no bundled “not ready” strings).
    * `[✅]`   **Non-functional:** Do not edit `AIModelSelectorList.tsx` (node 7), `CreateProjectFromChatButton.tsx` (node 11), selectors, or `dialecticStore.ts` in this node. Depends on nodes 1–3 for store init, selector contract, and loading/error patterns.

  * `[✅]`   `role`
    * `[✅]`   Chat onboarding UI — wires domain/model walkthrough to dialectic pre-project cost estimate before project creation.
    * `[✅]`   Out of scope: `CreateProjectFromChatButton` click orchestration, post-project session estimates, subscription CTAs.

  * `[✅]`   `module`
    * `[✅]`   `apps/web/src/components/chat/index.tsx` and co-located test file (create `index.test.tsx` if absent).

  * `[✅]`   `deps`
    * `[✅]`   Node 1: `initializeMaxOutputTokens`, `setSelectedModels`.
    * `[✅]`   Node 2: `selectPreProjectCostCeiling` → `ComputeCostCeilingReturn` only.
    * `[✅]`   Node 3: `isCostEstimateLoading` / pass-through error contract (mirror, do not duplicate bundled copy).
    * `[✅]`   Node 7: `AIModelSelectorList` auth gates (unchanged; this node consumes `onChange` only).
    * `[✅]`   `useAuthStore`, `useDialecticStore`, existing fetch actions.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: walkthrough step, `selectedDomainId`, local `hasSelectedModel`; auth + dialectic loading flags; `selectPreProjectCostCeiling`.
    * `[✅]`   Writes: `setSelectedModels`, domain selection, fetch actions, `initializeMaxOutputTokens`.

  * `[✅]`   apps/web/src/components/chat/index.test.tsx
    * `[✅]`   add test `syncs AIModelSelectorList selection to dialectic store selectedModels`.
    * `[✅]`   add test `does not call initializeMaxOutputTokens while isLoadingModelCatalog`.
    * `[✅]`   add test `shows loading notice while stage counts loading, not selector error`.
    * `[✅]`   add test `shows pass-through error.message when selector returns error after loading` (auth tier + init gates pass).
    * `[✅]`   add test `shows tier-unavailable notice when auth loaded and userTier null, not OUTPUT_CAP_NOT_INITIALIZED` — selector mock init error; UI shows `'Subscription tier is not available.'`.
    * `[✅]`   add test `shows cost preview when tier + catalog + counts ready and cap initialized`.

  * `[✅]`   apps/web/src/components/chat/index.tsx
    * `[✅]`   wire domain fetch orchestration, `setSelectedModels` on model `onChange`, `isCapInitReady` effect, cost estimate loading/error/success UI per objective.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `chat/index.tsx`: zero bundled “No cost estimate yet” strings; zero selector `null` branches.
    * `[✅]`   Model step: `selectedModels` in store matches checkbox selection.
    * `[✅]`   Cap init runs only when `isCapInitReady`, not on tier hydrate alone.
    * `[✅]`   Auth / hydration / API errors surface via pass-through `error.message` only after loading completes.
    * `[✅]`   No edits outside `apps/web/src/components/chat/index.tsx` and `apps/web/src/components/chat/index.test.tsx` in this node.

* `[✅]`   apps/web/src/hooks/useStartContributionGeneration **ComputeCostCeilingReturn-only selector consumption; loading gates before cost errors; pass-through ApiError on spend guard**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** Hook types `costCeilingResult` as `ComputeCostCeilingReturn | null` (lines 136–142). Store subscription returns `null` when `activeContextSessionId === null` even though node 2 `selectCostCeiling` never returns `null`. Derived flags treat `costCeilingResult === null` like an unknown estimate with `costCeilingError: null`, which drives `GenerateContributionButton` bundled `"No Estimate"` (`showCostEstimateBlocked && costCeilingError === null`). `startContributionGeneration` toast `"Cost estimate is not available."` (lines 290–293) duplicates selector messaging instead of pass-through. No loading gates — while auth tier, process template, stage-progress hydration, or primary wallet is still loading, selector may return `OUTPUT_CAP_NOT_INITIALIZED` or other precondition errors that must not surface as spend-blocked errors yet (parity with nodes 3–4 `isCostEstimateLoading`).
    * `[✅]`   **Functional goal — `ComputeCostCeilingReturn` only:** Change `costCeilingResult` type to `ComputeCostCeilingReturn` (remove `| null`). In the `useDialecticStore` subscription: when `activeContextSessionId === null`, return `{ error: { code: 'NO_ACTIVE_SESSION', message: 'No active session.' } }` (do not return `null`; do not call `selectCostCeiling`). When id is defined, return `selectCostCeiling(state, sid)` unchanged. Remove every `costCeilingResult === null` branch in derived memos and in `startContributionGeneration`.
    * `[✅]`   **Functional goal — loading before errors:** Subscribe `useAuthStore` — `isLoading` (`authIsLoading`). Subscribe from dialectic store — `isLoadingProcessTemplate`, `progressHydrationStatus`. Compute `runKey = \`${activeContextSessionId}:${activeSession.iteration_count}\`` when `activeContextSessionId !== null && activeSession !== null`. Define `isCostEstimateLoading` true when **any** of: `authIsLoading === true`; `isLoadingProcessTemplate === true`; `progressHydrationStatus[runKey] === 'pending'`; `activeWalletInfo.isLoadingPrimaryWallet === true`. While `isCostEstimateLoading`: set `costCeilingError` to `null`; `isCostEstimateKnown` to `false`; `stageCeiling` / `projectCeiling` / `stageBalanceShortfall` to `null`; `showCostEstimateBlocked` to `false`; `balanceMeetsThreshold` to `false`; `showBalanceCallout` to `false`; `showStageCostEstimate` to `false`; `isDisabled` remains fail-closed via `!balanceMeetsThreshold` when other guards pass — **do not** expose selector `'error'` fields to consumers during loading.
    * `[✅]`   **Functional goal — after loading (existing fail-safe ceiling semantics):** When `!isCostEstimateLoading`: if `'error' in costCeilingResult`, set `costCeilingError` to `costCeilingResult.error` (same reference); `isCostEstimateKnown` false; `showCostEstimateBlocked` true when `viewingStage !== null`; `balanceMeetsThreshold` false. On success, keep existing `stageCeiling` / `projectCeiling` / `stageBalanceShortfall` / `balanceMeetsThreshold` / `showBalanceCallout` / `showStageCostEstimate` / `showCostEstimateBlocked` math unchanged from FE3 (finite viewing slug ceiling vs wallet balance; NSF shortfall distinct from estimate-blocked).
    * `[✅]`   **Functional goal — `startContributionGeneration` callback:** Before resume/generate, re-read `selectCostCeiling(state, activeContextSessionId)` and loading flags from store/auth/wallet at call time. When any loading flag true, toast `"Loading cost estimate…"` and return `{ success: false, error: 'Loading cost estimate…' }` — do not call `generateContributions` or `resumePausedNsfJobs`. Delete `costCeilingResult === null` branch and bundled toast `"Cost estimate is not available."`. When `'error' in costCeilingResult`, toast **only** `costCeilingResult.error.message` and return `{ success: false, error: costCeilingResult.error.message }` (unchanged pass-through). Keep finite ceiling + balance guards; retain local toast `"Cost estimate is invalid."` only when success result lacks finite ceiling for viewing slug (selector succeeded but slug missing — not a selector error pass-through case).
    * `[✅]`   **Functional goal — return contract:** Add `isCostEstimateLoading: boolean` to `UseStartContributionGenerationReturn` in `@paynless/types`. Export it from the hook return object.
    * `[✅]`   **Non-functional:** Do not edit `GenerateContributionButton.tsx`, `dialecticStore.selectors.ts`, `SessionInfoCard.tsx`, or subscription CTAs in this node. Depends on nodes 1–2 (cap SSOT + loud selectors) and node 4 (session parent calls `initializeMaxOutputTokens` so selector can succeed). Cap init is not duplicated in this hook.

  * `[✅]`   `role`
    * `[✅]`   Application hook — derives session spend guards and ceiling flags for Generate/Continue; fail-closed financial gate before `generateContributions` / `resumePausedNsfJobs`.
    * `[✅]`   Out of scope: button markup/copy (`GenerateContributionButton` next node); store selector implementation; tier cap initialization.

  * `[✅]`   `module`
    * `[✅]`   `apps/web/src/hooks` — `useStartContributionGeneration.ts`, `useStartContributionGeneration.test.ts`, and `packages/types/src/dialectic.types.ts` return-field addition only.

  * `[✅]`   `deps`
    * `[✅]`   Node 2: `selectCostCeiling` → `ComputeCostCeilingReturn` only (never `null`).
    * `[✅]`   Node 1: `maxOutputTokens` in store drives selector input (initialized by node 4, not this hook).
    * `[✅]`   `useAuthStore` — `isLoading`.
    * `[✅]`   `useDialecticStore` — `isLoadingProcessTemplate`, `progressHydrationStatus`, existing hook subscriptions unchanged.
    * `[✅]`   `selectActiveChatWalletInfo` — `isLoadingPrimaryWallet` on wallet branch.
    * `[✅]`   `ComputeCostCeilingReturn`, `buildComputeCostCeilingErrorReturn` from `@paynless/utils`; `ApiError` from `@paynless/types`.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: auth loading; template loading; progress hydration pending; wallet loading; `selectCostCeiling(activeContextSessionId)`; wallet balance; viewing stage slug.
    * `[✅]`   Writes: none (read-only hook except action callbacks).

  * `[✅]`   packages/types/src/dialectic.types.ts
    * `[✅]`   Add `isCostEstimateLoading: boolean` to `UseStartContributionGenerationReturn` (after `showStageCostEstimate` or adjacent cost-estimate flags).

  * `[✅]`   apps/web/src/hooks/useStartContributionGeneration.test.ts
    * `[✅]`   **Mock deps (this file only — not a checklist node):** Extend existing `vi.mock('@paynless/store', …)` to export `useAuthStore` from `@/mocks/authStore.mock` (`resetAuthStoreMock` in `beforeEach`; default `isLoading: false`). Change `selectCostCeilingMock` generic to `[DialecticStateValues, string], ComputeCostCeilingReturn` (remove `| null`). Update `beforeEach` default: `sessionId === 'sess-1' ? defaultCostCeiling : buildComputeCostCeilingErrorReturn({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found for id …' } })` — never return `null`.
    * `[✅]`   replace test `when selectCostCeiling returns null, cost estimate flags block spend…` — mock `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }`; expect `costCeilingError` equals injected error; `showCostEstimateBlocked` true; `isDisabled` true; callback does not call `generateContributions`; zero `null` mock.
    * `[✅]`   replace `startContributionGeneration resume path does not call resumePausedNsfJobs when selectCostCeiling returns null` — use `OUTPUT_CAP_NOT_INITIALIZED` error mock; expect pass-through toast `error.message`, not `"Cost estimate is not available."`.
    * `[✅]`   replace `startContributionGeneration generate path returns failure when selectCostCeiling returns null` — same error mock; assert toast is pass-through message only.
    * `[✅]`   add test `while auth isLoading, isCostEstimateLoading is true and costCeilingError is null` — `mockSetAuthIsLoading(true)`; mock selector `{ error: OUTPUT_CAP_NOT_INITIALIZED }`; expect `isCostEstimateLoading` true, `costCeilingError` null, `showCostEstimateBlocked` false; `startContributionGeneration` toasts `"Loading cost estimate…"` and does not call `generateContributions`.
    * `[✅]`   add test `while progressHydrationStatus runKey is pending, isCostEstimateLoading is true` — seed `progressHydrationStatus: { 'sess-1:1': 'pending' }`; selector error mock; expect `isCostEstimateLoading` true, `costCeilingError` null, `showCostEstimateBlocked` false.
    * `[✅]`   add test `while isLoadingProcessTemplate, isCostEstimateLoading is true` — seed `isLoadingProcessTemplate: true`; same loading assertions.
    * `[✅]`   add test `while isLoadingPrimaryWallet, isCostEstimateLoading is true` — wallet mock `{ ...defaultWalletInfo, isLoadingPrimaryWallet: true }`; same loading assertions.
    * `[✅]`   add test `when activeContextSessionId is null, costCeilingResult is NO_ACTIVE_SESSION error not null` — set `activeContextSessionId: null`; expect derived `costCeilingError` matches after loading gate (or loading false → error exposed); grep mock never returns null.
    * `[✅]`   update session-switch tests that use `selectCostCeiling` returning `null` for wrong sessionId — return `SESSION_NOT_FOUND` error instead.
    * `[✅]`   keep all unrelated tests (payload, pause, viewing-ahead, resume/generate success, NSF shortfall, error pass-through with `buildComputeCostCeilingErrorReturn`).

  * `[✅]`   apps/web/src/hooks/useStartContributionGeneration.ts
    * `[✅]`   import `useAuthStore` from `@paynless/store`.
    * `[✅]`   subscribe `authIsLoading`, `isLoadingProcessTemplate`, `progressHydrationStatus`; compute `isCostEstimateLoading` per objective.
    * `[✅]`   change `costCeilingResult` to `ComputeCostCeilingReturn`; subscription returns local `NO_ACTIVE_SESSION` error when sid null; remove `| null` type.
    * `[✅]`   wrap all cost-derived memos (`costCeilingError`, `stageCeiling`, `projectCeiling`, `isCostEstimateKnown`, `showCostEstimateBlocked`, etc.) with loading gate per objective.
    * `[✅]`   remove all `costCeilingResult === null` checks; delete bundled toast `"Cost estimate is not available."`; add loading guard at top of `startContributionGeneration` spend path.
    * `[✅]`   return `isCostEstimateLoading` from hook.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `useStartContributionGeneration.ts`: zero `ComputeCostCeilingReturn | null`; zero `costCeilingResult === null`; zero `"Cost estimate is not available."`.
    * `[✅]`   Grep `useStartContributionGeneration.test.ts`: zero `selectCostCeiling).mockReturnValue(null)`; zero `ComputeCostCeilingReturn | null` on mock type.
    * `[✅]`   `authIsLoading: true` with selector error → `isCostEstimateLoading` true, `costCeilingError` null, callback does not spend.
    * `[✅]`   `'error' in selectCostCeiling` after loading → `costCeilingError` is same reference; callback toast equals `error.message` only.
    * `[✅]`   Success path NSF / afford / resume tests remain green after null→error migration.
    * `[✅]`   `UseStartContributionGenerationReturn` includes `isCostEstimateLoading`.
    * `[✅]`   No edits outside `useStartContributionGeneration.ts`, `useStartContributionGeneration.test.ts`, and `dialectic.types.ts` field addition in this node.

* `[ ]`   apps/web/src/components/dialectic/GenerateContributionButton **Remove bundled no-estimate UI; loading callout from hook; pass-through estimate errors only**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `GenerateContributionButton.tsx` treats `showCostEstimateBlocked && costCeilingError === null` as a third “unknown estimate” state (lines 104, 167–173): button label `"No Estimate"` and `generate-button-no-estimate-callout` with bundled copy `"No cost estimate yet. Select models and set output cap to continue."` Node 2 selectors never return `null`; prior hook node removes `costCeilingResult === null` and sets `showCostEstimateBlocked: false` while `isCostEstimateLoading`. After loading, blocked spend always carries a concrete `costCeilingError` from the hook — the null-error branch is dead code that hides pass-through `ApiError.message`. Component does not consume `isCostEstimateLoading` from the hook, so loading hydration can flash estimate-error UI before data is ready (parity with nodes 3–4 / hook node).
    * `[✅]`   **Functional goal — consume hook loading flag:** Destructure `isCostEstimateLoading` from `useStartContributionGeneration()` alongside existing cost fields.
    * `[✅]`   **Functional goal — delete bundled no-estimate path:** Remove every branch keyed on `showCostEstimateBlocked && costCeilingError === null`. Delete `generate-button-no-estimate-callout` JSX and bundled copy entirely. Grep target strings: `"No Estimate"`, `"No cost estimate yet"`, `generate-button-no-estimate-callout`.
    * `[✅]`   **Functional goal — `getButtonText` gate order (after existing prerequisite gates, before balance/pause/resume labels):** When `isCostEstimateLoading === true` → return `"Loading Estimate"`. When `!isCostEstimateLoading && showCostEstimateBlocked && costCeilingError !== null` → return `"Estimate Failed"`. Remove the former `showCostEstimateBlocked && costCeilingError === null → "No Estimate"` branch. Keep all other label branches unchanged (`Choose AI Models`, wallet/stage gates, `Insufficient Balance`, pause/resume/regenerate/generate).
    * `[✅]`   **Functional goal — callout JSX (mutually exclusive after prerequisites pass):** (1) While `isCostEstimateLoading`, render `data-testid="generate-button-estimate-loading-notice"` with text `"Loading cost estimate…"`. Do not render estimate-error callout or balance/stage estimate callouts during loading. (2) When `!isCostEstimateLoading && showCostEstimateBlocked && costCeilingError !== null`, render existing `generate-button-estimate-error-callout` with **only** `costCeilingError.message` (unchanged styling). (3) When `!isCostEstimateLoading && isCostEstimateKnown`, keep existing `generate-button-balance-callout`, `generate-button-stage-cost-estimate`, and `generate-button-project-balance-callout` branches unchanged (including `/subscription?tab=top-up` links — subscription deep-link URL change is a later FE4 node).
    * `[✅]`   **Functional goal — disabled state:** Continue using hook `isDisabled` on the button (hook remains fail-closed during loading and on estimate error). Do not add local selector calls or cap init in this component.
    * `[✅]`   **Non-functional:** Do not edit `useStartContributionGeneration.ts`, `dialecticStore.ts`, `dialecticStore.selectors.ts`, `SessionInfoCard.tsx`, or subscription CTA URL building in this node. Depends on prior hook node (`isCostEstimateLoading`, null-free cost flags).

  * `[✅]`   `role`
    * `[✅]`   Session generate/pause control — displays cost-estimate loading, pass-through errors, NSF/balance callouts from hook flags only.
    * `[✅]`   Out of scope: cost selector math, tier cap initialization, hook spend guards, subscription cart prefill.

  * `[✅]`   `module`
    * `[✅]`   `apps/web` dialectic generate button and co-located tests listed below.

  * `[✅]`   `deps`
    * `[✅]`   Prior hook node: `UseStartContributionGenerationReturn.isCostEstimateLoading`; `showCostEstimateBlocked`, `costCeilingError`, `isCostEstimateKnown`, and existing affordance flags unchanged semantics after loading gate.
    * `[✅]`   Node 4: session page calls `initializeMaxOutputTokens` so integration success path can rely on tier hydrate (integration tests seed auth + initializer per below).
    * `[✅]`   `useStartContributionGeneration` — sole source of cost-estimate state for this component.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: hook return fields only (no direct `selectCostCeiling` in component).
    * `[✅]`   Writes: none (callbacks via hook).

  * `[✅]`   apps/web/src/components/dialectic/GenerateContributionButton.test.tsx
    * `[✅]`   **Mock deps (this file only — not a checklist node):** Add `isCostEstimateLoading: false` to `getDefaultHookReturn` default object (required after hook node adds field to `UseStartContributionGenerationReturn`).
    * `[✅]`   delete test `renders disabled button with no-estimate callout when cost estimate is not yet available instead of returning null` (lines ~533–547).
    * `[✅]`   add test `shows loading notice while isCostEstimateLoading` — mock `{ isCostEstimateLoading: true, isDisabled: true, showCostEstimateBlocked: false, costCeilingError: null }`; expect `generate-button-estimate-loading-notice` text `"Loading cost estimate…"`; button `"Loading Estimate"` disabled; `generate-button-estimate-error-callout` and `generate-button-no-estimate-callout` absent.
    * `[✅]`   add test `shows estimate-error callout with pass-through message when blocked after loading` — mock `{ isCostEstimateLoading: false, showCostEstimateBlocked: true, costCeilingError: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' }, isDisabled: true }`; expect button `"Estimate Failed"` disabled; `generate-button-estimate-error-callout` text exactly equals message; no loading notice; no no-estimate callout.
    * `[✅]`   keep balance callout, pause/resume, DAG dialog, viewing-ahead, and success generate tests unchanged except add `isCostEstimateLoading: false` where hook mock omits it.

  * `[✅]`   apps/web/src/components/dialectic/GenerateContributionButton.nsf.test.tsx
    * `[✅]`   **Mock deps:** Add `isCostEstimateLoading: false` to local `getDefaultHookReturn` default.
    * `[✅]`   delete test `when cost estimate is not yet available, button is disabled with "No Estimate" and no-estimate callout` (lines ~514–533).
    * `[✅]`   replace `when cost estimate failed…` test — keep `"Estimate Failed"` + error callout assertions; assert `generate-button-no-estimate-callout` absent.
    * `[✅]`   update `when paused_nsf and cost estimate is blocked` — seed `{ isCostEstimateLoading: false, showCostEstimateBlocked: true, costCeilingError: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: '…' }, isDisabled: true }` instead of `costCeilingError: null`; expect estimate-error callout, not no-estimate callout.
    * `[✅]`   update project-balance-callout blocked case (~L485–493) — when estimate blocked with error, project callout still absent (unchanged assertion) but use error object not null sentinel.
    * `[✅]`   NSF resume/balance success tests remain green with `isCostEstimateLoading: false`.

  * `[✅]`   apps/web/src/components/dialectic/GenerateContributionButton.tsx
    * `[✅]`   destructure `isCostEstimateLoading` from hook.
    * `[✅]`   update `getButtonText` — add loading label; remove null-error `"No Estimate"` branch; keep `"Estimate Failed"` when blocked with error after loading.
    * `[✅]`   remove `generate-button-no-estimate-callout` block; add loading notice JSX; keep estimate-error callout condition `!isCostEstimateLoading && showCostEstimateBlocked && costCeilingError !== null`.

  * `[✅]`   apps/web/src/components/dialectic/GenerateContributionButton.costCeiling.integration.test.tsx
    * `[✅]`   **Mock deps:** Extend test setup to seed auth tier (`useAuthStore` mock or existing pattern in file): `isLoading: false`, `userTier.output_cap_tokens` matching fixture `maxOutputTokens`. In success-path `beforeEach` / `seedSessionStore`, **omit** manual `maxOutputTokens` override; after seed call `useDialecticStore.getState().initializeMaxOutputTokens()` and `waitFor` finite `maxOutputTokens` (parity with node 4 — button integration must not depend on popover/slider).
    * `[✅]`   rename/replace `null prerequisites: missing maxOutputTokens → no-estimate callout…` — seed `maxOutputTokens: null` **without** tier init (or auth still loading → loading notice only); when loaded and cap still null, expect `generate-button-estimate-error-callout` with `OUTPUT_CAP_NOT_INITIALIZED` message, button `"Estimate Failed"`, not `generate-button-no-estimate-callout`; click does not call `generateContributions`.
    * `[✅]`   replace `API progress error: getAllStageProgress 500 → no-estimate callout…` — seed hydration failure via real `hydrateAllStageProgress` (MSW 500): thunk sets `progressHydrationStatus[runKey] === 'failed'` and rejects with API `ApiError` unchanged; store has **no** `progressHydrationError` field; remove stale comments/assertions referencing `progressHydrationError`; `selectCostCeiling(storeState, sessionId)` returns `{ error: { code: 'STAGE_PROGRESS_HYDRATION_FAILED', … } }` (never `null`, never local `STAGE_COUNTS_BY_RUN_MISSING` when hydration status is failed); after loading false, expect `generate-button-estimate-error-callout` with pass-through selector `error.message` exactly; not no-estimate callout; button disabled.
    * `[✅]`    grep `GenerateContributionButton.costCeiling.integration.test.tsx`: zero `progressHydrationError` references in comments, seeds, and assertions.
    * `[✅]`   replace `hook callback guard: clearing maxOutputTokens after enable…` — after clearing cap, expect estimate-error callout + `"Estimate Failed"`, not no-estimate callout; click does not spend.
    * `[✅]`   grep file — zero `generate-button-no-estimate-callout`, zero `/No Estimate/i` button expectations, zero `selectCostCeiling(...)).toBeNull()`.
    * `[✅]`   success-stack test (`hydrate → stage/project ceiling → enabled generate`) passes with tier-init path instead of manual cap seed.

  * `[✅]`   apps/web/src/components/dialectic/GenerateContributionButton.integration.test.tsx
    * `[✅]`   import `captureRealAuthStore` / seed auth in `beforeEach`: `isLoading: false`, `userTier.output_cap_tokens` matching fixture `maxOutputTokens` (`1000`).
    * `[✅]`   in `setStoreForButton`, omit manual `maxOutputTokens` override on success paths; after `setDialecticStateValues`, call `useDialecticStore.getState().initializeMaxOutputTokens()`; `waitFor` finite cap before assertions that require enabled generate/resume.
    * `[✅]`   existing NSF/balance/generate/resume tests remain green with tier-init path (real `selectCostCeiling` — never mock to `null`).

  * `[✅]`   `requirements`
    * `[✅]`   Grep `GenerateContributionButton.tsx`: zero `generate-button-no-estimate-callout`; zero `"No Estimate"`; zero `"No cost estimate yet"`; zero `costCeilingError === null` in estimate-blocked UI branches.
    * `[✅]`   Grep `GenerateContributionButton.test.tsx`, `GenerateContributionButton.nsf.test.tsx`, `GenerateContributionButton.costCeiling.integration.test.tsx`: zero `generate-button-no-estimate-callout`; zero `/No Estimate/i` expectations.
    * `[✅]`   `isCostEstimateLoading: true` → loading notice visible, button shows `"Loading Estimate"`, no error callout.
    * `[✅]`   Blocked after loading with `costCeilingError` → `"Estimate Failed"` + callout text equals `error.message` exactly.
    * `[✅]`   Success NSF/balance/stage-estimate integration paths remain green.
    * `[✅]`   No edits outside `GenerateContributionButton.tsx`, `GenerateContributionButton.test.tsx`, `GenerateContributionButton.nsf.test.tsx`, `GenerateContributionButton.costCeiling.integration.test.tsx`, and `GenerateContributionButton.integration.test.tsx` in this node.

* `[ ]`   apps/web/src/components/ai/CreateProjectFromChatButton **Tier cap init; ComputeCostCeilingReturn-only click gate; loading before selector errors; pass-through toast**

  * `[✅]`   `objective`
    * `[✅]`   **Problem:** `CreateProjectFromChatButton.tsx` types `preProjectCostCeilingResult` as `ComputeCostCeilingReturn | null` (lines 112–118). When selector returns `null`, click gate toasts bundled `noEstimateToastCopy` (`"No cost estimate yet. Set the output cap in Model Settings, then try again."`) instead of pass-through `ApiError.message`. Node 2 `selectPreProjectCostCeiling` never returns `null`. `maxOutputTokens` stays `null` until user visits dialectic UI with `OutputCapSlider` — chat has no cap init, so autostart spend path fail-closes on `OUTPUT_CAP_NOT_INITIALIZED` masked as bundled copy. No auth/catalog/association/template/counts/wallet loading gates — selector precondition errors surface at click while fetches are still in flight (parity violation vs node 3 `CreateDialecticProjectForm`).
    * `[✅]`   **Functional goal — tier cap init:** Subscribe `useAuthStore` — `isLoading`, `userTier`. Subscribe `initializeMaxOutputTokens` from `useDialecticStore`. Define **`isCapInitReady`** (same as node 3): `!isLoading && userTier !== null && !isLoadingModelCatalog && modelCatalog.length > 0`. Add `useEffect` with deps `[isLoading, userTier, isLoadingModelCatalog, modelCatalog.length]`: when `isCapInitReady`, call `initializeMaxOutputTokens()`. In `handleClick`, on autostart spend path (`defaultModelCount >= 1`) after catalog is ready and **before** `fetchProcessTemplate`, call `initializeMaxOutputTokens()` again so cap is set after click-time fetches without Model Settings popover.
    * `[✅]`   **Functional goal — `ComputeCostCeilingReturn` only:** Change `preProjectCostCeilingResult` type to `ComputeCostCeilingReturn` (remove `| null`). Delete `noEstimateToastCopy` constant and entire `preProjectCostCeilingResult === null` branch (lines 115–118). After loading gate passes, apply **same error gate order as node 3 footer** before reading selector for spend block: (1) `authStore.error` → toast `authStore.error.message`; (2) `userTier === null` → toast `'Subscription tier is not available.'`; (3) `capInitResult?.ok === false` → toast `capInitResult.error.message`; (4) `'error' in preProjectCostCeilingResult` → toast **only** `preProjectCostCeilingResult.error.message` (unchanged pass-through reference). On success, keep existing `firstStageCeiling` / wallet NSF gate and `nsfToastCopy` unchanged.
    * `[✅]`   **Functional goal — loading before errors (click gate, autostart path only):** After `fetchProcessTemplate` / `fetchStageExpectedCounts` complete and before reading `selectPreProjectCostCeiling`, evaluate loading flags on fresh store/auth/wallet state. Define `isCostEstimateLoading` true when **any** of: `useAuthStore.getState().isLoading === true`; `isLoadingModelCatalog === true`; `isLoadingDomainProcessAssociation === true`; `isLoadingProcessTemplate === true`; `isLoadingStageExpectedCounts === true`; `selectActiveChatWalletInfo(...).isLoadingPrimaryWallet === true`. While `isCostEstimateLoading`, toast the **first** matching message in this order and return without `createProjectAndAutoStart`: tier → `"Loading subscription tier…"`; catalog → `"Loading model catalog…"`; association → `"Loading domain process association…"`; template → `"Loading process template…"`; stage counts → `"Loading stage expected counts…"`; wallet → `"Loading wallet balance…"`. **Do not** toast selector `'error'` messages (including `OUTPUT_CAP_NOT_INITIALIZED`) during loading.
    * `[✅]`   **Functional goal — preserve FE3 orchestration:** Keep existing domain/association/catalog/template/counts click chain, `defaultModelCount` skip when zero, `processTemplateId` on payload, navigation, and disabled-button rules unchanged except null→error and loading gate additions above.
    * `[✅]`   **Non-functional:** Do not edit `dialecticStore.ts`, `dialecticStore.selectors.ts`, `CreateDialecticProjectForm.tsx`, `computeCostCeiling`, or subscription CTAs in this node. Depends on nodes 1–2 (cap SSOT + loud selectors) and node 3 (pre-project selector contract parity).

  * `[✅]`   `role`
    * `[✅]`   Chat toolbar UI — fail-safe autostart spend gate at click time; wires auth tier hydrate → store cap init; pass-through selector errors via toast.
    * `[✅]`   Out of scope: cost preview markup, post-project `selectCostCeiling`, store action implementations, subscription deep links.

  * `[✅]`   `module`
    * `[✅]`   `apps/web/src/components/ai` — `CreateProjectFromChatButton.tsx`, `CreateProjectFromChatButton.test.tsx`, `CreateProjectFromChatButton.costCeiling.integration.test.tsx` only.

  * `[✅]`   `deps`
    * `[✅]`   Node 1: `initializeMaxOutputTokens` on `useDialecticStore`.
    * `[✅]`   Node 2: `selectPreProjectCostCeiling` → `ComputeCostCeilingReturn` only (never `null`).
    * `[✅]`   Node 3: same pre-project loading-flag order and pass-through error contract (this node applies at click, not footer UI).
    * `[✅]`   `useAuthStore` — `isLoading`, `userTier`, `error`.
    * `[✅]`   Dialectic store — `initializeMaxOutputTokens`, existing store actions/selectors: `fetchDomains`, `fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`, `fetchAIModelCatalog`, `selectSelectedDomain`, `selectDefaultGenerationModels`, `selectActiveChatWalletInfo`, `useWalletStore`, `useAiStore`; `isLoadingModelCatalog`, `modelCatalog`; component-local `capInitResult`.
    * `[✅]`   `ComputeCostCeilingReturn`, `buildComputeCostCeilingErrorReturn` from `@paynless/utils`; `ApiError` from `@paynless/types`.

  * `[✅]`   `context_slice`
    * `[✅]`   Reads: auth loading + tier; dialectic loading flags; wallet loading; `selectPreProjectCostCeiling` after click orchestration on autostart path.
    * `[✅]`   Writes: calls `initializeMaxOutputTokens` only (no direct `setMaxOutputTokens` in component).

  * `[✅]`   apps/web/src/components/ai/CreateProjectFromChatButton.test.tsx
    * `[✅]`   **Mock deps (this file only — not a checklist node):** Extend `vi.mock('@paynless/store', …)` to export `useAuthStore` from `@/mocks/authStore.mock` (`resetAuthStoreMock` in `beforeEach`; default `isLoading: false`, `userTier` with finite `output_cap_tokens`). Change `selectPreProjectCostCeilingMock` generic to `[DialecticStateValues], ComputeCostCeilingReturn` (remove `| null`); never `mockReturnValue(null)`.
    * `[✅]`   delete constant `noEstimateToastCopy` and test `does not call createProjectAndAutoStart when cost estimate prerequisites are incomplete` that mocks selector `null` + expects bundled toast.
    * `[✅]`   add test `does not call createProjectAndAutoStart when selectPreProjectCostCeiling returns OUTPUT_CAP_NOT_INITIALIZED` — mock `{ error: { code: 'OUTPUT_CAP_NOT_INITIALIZED', message: 'Output cap is not initialized in dialectic store.' } }`; expect `toast.error` with **exactly** that message; not bundled no-estimate copy; `createProjectAndAutoStart` not called.
    * `[✅]`   add test `calls initializeMaxOutputTokens on mount when isCapInitReady` — auth `isLoading: false`, `userTier` set, catalog loaded; render; expect `getDialecticStoreActionMock('initializeMaxOutputTokens')` called once; **not** called while `isLoadingModelCatalog: true`.
    * `[✅]`   add test `on click autostart path calls initializeMaxOutputTokens before fetchProcessTemplate` — spy; click with default models; expect initializer called after catalog ready and before/at start of template fetch chain (≥1 call including mount).
    * `[✅]`   add test `while auth isLoading on click, toasts Loading subscription tier and does not create` — `mockSetAuthIsLoading(true)` before click; expect toast `"Loading subscription tier…"`; `createProjectAndAutoStart` not called; selector error mock ignored for toast text.
    * `[✅]`   add test `while isLoadingStageExpectedCounts after orchestration, toasts loading copy not selector error` — seed `isLoadingStageExpectedCounts: true` at click-read time; mock selector `{ error: OUTPUT_CAP_NOT_INITIALIZED }`; expect toast `"Loading stage expected counts…"`; not `OUTPUT_CAP_NOT_INITIALIZED` message.
    * `[✅]`   add test `on click when userTier null after auth load, toasts Subscription tier is not available not selector error` — `userTier: null`, selector mock `OUTPUT_CAP_NOT_INITIALIZED`; expect tier-unavailable toast; not init error message.
    * `[✅]`   keep existing tests for association null, selector `{ error }` pass-through, NSF wallet, no-default-models skip, navigation, idempotency — add `isCostEstimateLoading`-safe auth mock defaults where needed.

  * `[✅]`   apps/web/src/components/ai/CreateProjectFromChatButton.tsx
    * `[✅]`   import `useAuthStore` from `@paynless/store`; subscribe `isLoading`, `userTier`; subscribe `initializeMaxOutputTokens`.
    * `[✅]`   add mount `useEffect` with `isCapInitReady` per objective; call `initializeMaxOutputTokens()` on autostart path before template fetch.
    * `[✅]`   change `preProjectCostCeilingResult` to `ComputeCostCeilingReturn`; remove `noEstimateToastCopy` and `=== null` branch; add post-orchestration loading-flag gate before selector error toast; keep `'error' in result` pass-through and NSF branch.

  * `[✅]`   apps/web/src/components/ai/CreateProjectFromChatButton.costCeiling.integration.test.tsx
    * `[✅]`   **Mock deps:** Import real `useAuthStore` from `@paynless/store`. In `beforeEach`, `useAuthStore.setState({ isLoading: false, userTier: { level: 10, name: 'basic', output_cap_tokens: maxOutputTokens, max_models_per_project: 2, …required UserTier fields } })` (mirror `OutputCapSlider.integration.test.tsx` tier seed pattern). Remove `noEstimateToastCopy` constant.
    * `[✅]`   change `seedChatButtonStore` — **omit** `maxOutputTokens` override (store starts `null`); after seed + auth tier set, call `useDialecticStore.getState().initializeMaxOutputTokens()` inside success-path setup; `waitFor` finite `maxOutputTokens === maxOutputTokens` fixture value before click.
    * `[✅]`   rename/replace `null prerequisites: missing maxOutputTokens → toast error and no create` — auth loaded, initializer **not** run (or cap cleared after init), click → `selectPreProjectCostCeiling` returns `{ error: OUTPUT_CAP_NOT_INITIALIZED }` (never `null`); `toast.error` with pass-through `error.message`; not bundled no-estimate copy; `createProjectAndAutoStart` not called.
    * `[✅]`   replace `API counts error: getStageExpectedCounts 500 → click gate fail-closes without create` — after click, `selectPreProjectCostCeiling(storeState)` is `{ error: … }` with pass-through message from `stageExpectedCountsError` brigade (never `null`); assert `toast.error` called with that message when loading flags false; `createProjectAndAutoStart` not called.
    * `[✅]`   grep file — zero `noEstimateToastCopy`, zero `.toBeNull()` on `selectPreProjectCostCeiling` result, zero bundled `"No cost estimate yet"`.
    * `[✅]`   success-stack test passes with tier-init path instead of manual `maxOutputTokens` seed; insufficient-wallet test unchanged except auth seed.

  * `[✅]`   `requirements`
    * `[✅]`   Grep `CreateProjectFromChatButton.tsx`: zero `ComputeCostCeilingReturn | null`; zero `preProjectCostCeilingResult === null`; zero `noEstimateToastCopy`; zero bundled `"No cost estimate yet"`.
    * `[✅]`   Grep `CreateProjectFromChatButton.test.tsx` and `CreateProjectFromChatButton.costCeiling.integration.test.tsx`: zero `selectPreProjectCostCeilingMock.mockReturnValue(null)`; zero `.toBeNull()` on selector results; zero `noEstimateToastCopy`.
    * `[✅]`   Auth tier + catalog loaded on mount (`isCapInitReady`): `initializeMaxOutputTokens` called without opening Model Settings.
    * `[✅]`   Autostart click with `'error' in selectPreProjectCostCeiling` after loading: toast equals `error.message` only.
    * `[✅]`   Auth or counts loading at click-read: loading toast only; no `OUTPUT_CAP_NOT_INITIALIZED` toast during loading.
    * `[✅]`   Integration success path: tier init → finite cap → real selector success → `createProjectAndAutoStart` called once.
    * `[✅]`   No edits outside `CreateProjectFromChatButton.tsx`, `CreateProjectFromChatButton.test.tsx`, and `CreateProjectFromChatButton.costCeiling.integration.test.tsx` in this node.

  * `[✅]`   **Commit** `fix(dialectic): cost ceiling fix-forward — tier cap init, loud selectors, UI bootstrap`
    * `[✅]`   Documents: `hydrateStageProgressLogic` / `hydrateAllStageProgressLogic` throw `ApiError` only (zero `throw new Error`); API errors pass through by reference; origin tests assert exact `HYDRATE_*` codes.
    * `[✅]`   Store: `initializeMaxOutputTokensFromTier` **deleted**; only `initializeMaxOutputTokens` returns `InitializeMaxOutputTokensResult`; legacy error fields removed from types, store, mock, and relocated tests; guard-before-cap (no standalone `isRecord` branch); waits for cap-init deps; `min(tierCap, bindingModelCap)`; `outputCapUserCustomized`; hydration thunk rethrow; fire-and-forget void+catch on all four internal `hydrateAllStageProgress` invokers including `_handleContributionGenerationPausedNsf`; `projectId` / session-fetch / `sessionId` reset paths; guard alignment; pre-project template fetch silence.
    * `[✅]`   Hook: `useStageRunProgressHydration` logs hydrate failures with `logger.error` and unchanged `errorDetails` (no `console.error`, no swallow-only catch, no rethrow through void async IIFE); session display via `progressHydrationStatus` + selector fallback.
    * `[✅]`   Selectors: `ComputeCostCeilingReturn` only; pass-through auth errors and fetch errors; `progressHydrationStatus === 'failed'` → `STAGE_PROGRESS_HYDRATION_FAILED`; discrete local codes; `selectUnifiedProjectProgress` no-throw when session row missing.
    * `[✅]`   UI: form/session/chat cap init without popover; `capInitResult` at call boundary; chat onboarding pre-project estimate; slider blocked states (pass-through messages); model selector auth gates; generate hook loading gates; generate button and chat button pass-through estimate errors.

* **Subscription checkout deep links — prepopulate cart from upgrade and top-up CTAs**

  Implement after the **Dynamic cost ceiling** ticket above. Cost ceiling supplies `stage_ceiling`, `project_ceiling`, and token shortfalls for NSF and pre-project surfaces; this ticket wires every `/subscription` CTA to the cart using those values (where applicable) plus tier-aware plan resolution for feature-gate upgrades. Do this in **one pass** once `selectCostCeiling` / `selectPreProjectCostCeiling` exist — do not ship another round of naked `/subscription` links.

  ### Problem

  Multiple tickets (FE Ticket 1 dashboard/sidebar, FE2 model selector gating, FE3 output-cap slider and cost-ceiling NSF) added upgrade and top-up CTAs that navigate to `/subscription` with no cart context. The user lands on the subscription page and must manually find the right plan or token pack. The original FE plan (**Multi-item checkout cart**, now implemented) specified `prefillCart`, URL query params (`?plan=` / `?otp=`), and CTA consumers — but consumers were left as placeholders (`Link to="/subscription"` or `navigate("/subscription")`).

  ### What already exists (no reinvention)

  - **`packages/store/src/cartStore/cartStore.ts`**: `prefillCart({ subscriptionPlanId?, otpPlanIds? })` clears the cart, resolves plans from `useSubscriptionStore.getState().availablePlans` by `plan.id` or `plan.stripe_price_id`, then populates `subscriptionItem` / `otpItems`.
  - **`apps/web/src/pages/Subscription.tsx`**: On load, if `?plan=` or `?otp=` query params are present and `availablePlans` is loaded, calls `prefillCart` and clears params from the URL (`setSearchParams({}, { replace: true })`).
  - **Cart checkout**: `checkoutCart()` builds multi-item `PurchaseRequest` and redirects to Stripe.

  **Gaps in existing infrastructure:**
  - No shared helper maps **tier level** or **token shortfall** → plan IDs; each CTA would duplicate lookup logic.
  - `prefillCart` does not match `item_id_internal` (only `id` and `stripe_price_id`); extend if production plans are keyed internally.
  - Subscription page tabs (`monthly` / `annual` / `top-up`) are local state only; NSF/top-up CTAs need **`?tab=top-up`** (or equivalent) read on mount so the Top-Up tab is visible after navigation.

  ### Resolution helpers (new — shared by all CTAs)

  Add a small pure module (location TBD during node planning — e.g. `apps/web/src/utils/subscriptionCta.ts`) that operates on `SubscriptionPlan[]` from `availablePlans`:

  1. **`subscriptionPlanForTierLevel(targetLevel, plans, preferInterval?)`**
     - Filter: `plan_type === 'subscription'`, `active`, `tier_level === targetLevel`, exclude free/zero-amount plans.
     - Prefer monthly vs annual by name or interval when multiple plans share a tier (default: monthly).
     - Return `SubscriptionPlan | null` (use `.id` in URLs and `prefillCart`).

  2. **`smallestOtpPlanForShortfall(shortfallTokens, plans)`**
     - Filter: `plan_type === 'one_time_purchase'`, `tokens_to_award` not null.
     - Sort ascending by `tokens_to_award`; return first plan where `tokens_to_award >= shortfallTokens`.

  3. **`buildSubscriptionCtaUrl(intent)`** (or equivalent)
     - Inputs: `{ subscriptionPlanId?: string; otpPlanIds?: string[]; tab?: 'top-up' }`.
     - Output: `/subscription?plan=...&otp=...&tab=top-up` with repeated `otp` params when needed.
     - Use **runtime plan UUIDs** from `availablePlans` — do not hardcode doc examples like `premium-monthly`.

  CTAs may use **URL-only** deep links (preferred for `<Link>`) or **prefillCart + navigate** for buttons; URL prefill on `SubscriptionPage` must remain the single source of truth on arrival so refresh and shared links work.

  ### CTA inventory — current naked links and intended prefill

  **Tier / feature-gate upgrades (subscription plan only)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Tier-locked model | `AIModelSelector.tsx` | `min_plan_tier_level > userTier.level` | `plan` = subscription for `provider.min_plan_tier_level` |
  | Model-count cap | `AIModelSelector.tsx` | at cap on multiplicity | `plan` = subscription for tier from `resolveNextTierName` → that tier's `level` |
  | Tier-locked row | `AIModelSelectorList.tsx` | same as selector | same |
  | Count-cap row | `AIModelSelectorList.tsx` | same | same |
  | Output cap upgrade | `OutputCapSlider.tsx` | locked marker / drag past thumb max | `plan` = subscription for tier matching `upgradeTargetName` (`availableTiers` by name → `level`) |

  **Account / navigation (tier upgrade or browse)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Plan card | `Dashboard.tsx` | `nextTierName` | `plan` = next tier's `level` |
  | Plan card fallback | `Dashboard.tsx` | `userTier === null` | no plan (generic `/subscription`) |
  | Quick action "Upgrade" | `Dashboard.tsx` | marketing | next tier `plan`, or OTP-only if product decides ultra users need tokens only |
  | Sidebar upgrade | `nav-user.tsx` | `nextTierName` | same as dashboard |
  | Sidebar "Billing" | `nav-user.tsx` | manage billing | no prefill (portal on page) |
  | Profile | `Profile.tsx` | "Manage subscription" | no prefill |
  | Header / Help / Pricing (logged in) | `Header.tsx`, `Help.tsx`, `PricingPage.tsx` | browse | no prefill |

  **Token top-up (OTP only — often `tab=top-up`)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Wallet | `WalletBalanceDisplay.tsx` | "Purchase Tokens" | optional smallest OTP or none; `tab=top-up` |
  | Generate callout | `GenerateContributionButton.tsx` | wallet below stage `minimum_balance` | `otp` = pack covering `stageThreshold - balance` (interim until cost ceiling ships) |
  | Session NSF (this ticket + cost ceiling) | `DialecticSessionDetailsPage.tsx`, `GenerateContributionButton` / session controls | `stage_ceiling > wallet_balance` | `otp` = `smallestOtpPlanForShortfall(stage_ceiling - wallet_balance)`; `tab=top-up` |
  | Project warning (cost ceiling) | session / `SessionInfoCard.tsx` | `project_ceiling > wallet_balance` | `otp` for `project_ceiling - wallet_balance`; informational, do not block create |
  | Pre-project autostart (cost ceiling) | `CreateDialecticProjectForm.tsx` | first-stage `stage_ceiling > wallet` | same OTP shortfall for first stage; disable Autostart, allow Create |

  **Dual intent (upgrade + top-up):** When a surface needs both a higher tier and tokens (e.g. locked premium model with insufficient wallet for estimated run), pass both `plan` and `otp` in one URL. FE cart ticket Pattern 1 applies.

  ### Implementation sequence (single pass, after cost ceiling)

  1. **Cost ceiling** — `@paynless/utils` `computeCostCeiling`, selector-derived ceilings, UI hooks for estimates and shortfalls (per Dynamic cost ceiling ticket above).
  2. **Subscription CTA helpers** — `subscriptionPlanForTierLevel`, `smallestOtpPlanForShortfall`, `buildSubscriptionCtaUrl`; unit tests with `SubscriptionPlan` fixtures from `PlanCard.mock.ts`.
  3. **`Subscription.tsx`** — honor `?tab=top-up` on mount (set `activeTab`); optionally extend `prefillCart` lookup to `item_id_internal`.
  4. **Wire all CTAs** in one change set: replace naked `to="/subscription"` / `navigate("/subscription")` with URLs from helpers; dialectic components first (`AIModelSelector`, `AIModelSelectorList`, `OutputCapSlider`, `GenerateContributionButton`, `CreateDialecticProjectForm`, session page / `SessionInfoCard`), then account surfaces (`Dashboard`, `nav-user`, `WalletBalanceDisplay`).
  5. **Tests** — update existing tests that assert `href === '/subscription'` to assert query strings when prefill applies; add helper unit tests.

  ### Known files in dependency order

  **Helpers (new):**
  1. `packages/store/src/subscriptionCta.ts` (new) — plan resolution and URL builder (or `apps/web/src/utils/subscriptionCta.ts` if web-only; prefer store package if dialectic store will import shortfall helpers)
  2. `packages/store/src/subscriptionCta.test.ts` (new)

  **Subscription page:**
  3. `apps/web/src/pages/Subscription.tsx` — `?tab=` query handling; confirm prefill runs after `loadSubscriptionData`
  4. `apps/web/src/pages/Subscription.test.tsx` — tab param + combined `plan` + `otp` prefill

  **Optional cart store:**
  5. `packages/store/src/cartStore/cartStore.ts` — optional `item_id_internal` in `prefillCart` lookup

  **CTA consumers (modify — replace naked links):**
  6. `apps/web/src/components/dialectic/AIModelSelector.tsx`
  7. `apps/web/src/components/dialectic/AIModelSelector.test.tsx`
  8. `apps/web/src/components/dialectic/AIModelSelectorList.tsx`
  9. `apps/web/src/components/dialectic/AIModelSelectorList.test.tsx`
  10. `apps/web/src/components/dialectic/OutputCapSlider.tsx`
  11. `apps/web/src/components/dialectic/OutputCapSlider.test.tsx`
  12. `apps/web/src/components/dialectic/OutputCapSlider.integration.test.tsx`
  13. `apps/web/src/components/dialectic/GenerateContributionButton.tsx`
  14. `apps/web/src/components/dialectic/GenerateContributionButton.nsf.test.tsx`
  15. `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — NSF + cost display (depends on cost ceiling)
  16. `apps/web/src/components/dialectic/SessionInfoCard.tsx`
  17. `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx`
  18. `apps/web/src/components/dialectic/CreateDialecticProjectForm.autostart.test.tsx`
  19. `apps/web/src/pages/Dashboard.tsx`
  20. `apps/web/src/pages/Dashboard.test.tsx`
  21. `apps/web/src/components/sidebar/nav-user.tsx`
  22. `apps/web/src/components/sidebar/nav-user.test.tsx`
  23. `apps/web/src/components/wallet/WalletBalanceDisplay.tsx`

  **No prefill required (leave generic `/subscription` or document explicitly):**
  - `Profile.tsx`, `Header.tsx`, `Help.tsx`, `PricingPage.tsx`, `nav-user` Billing button

  ### Dependencies

  - **Depends on Dynamic cost ceiling** (same FE3 doc): OTP shortfalls for NSF, pre-project autostart, and project-level warnings require `costCeilingEstimate` / `stage_ceiling` / `project_ceiling`. Tier-only CTAs (model lock, output cap, dashboard upgrade) can be implemented with helpers alone but should ship in the same pass to avoid duplicate churn.
  - **Depends on FE cart ticket (complete)**: `cartStore`, `Subscription.tsx` URL prefill, multi-item checkout.
  - **Depends on Ticket 1**: `userTier`, `availableTiers`, `availablePlans` / `loadSubscriptionData`.
  - **Depends on Output clamp slider (complete)**: `maxOutputTokens` for cost ceiling `output_cap` input.
  - **Ops (deferred)**: `subscription_plans.tier_level` must match `tier_definitions.level` in production data for `subscriptionPlanForTierLevel` to resolve correctly (see Stripe plans ops task below).

  ### Scope split — FE vs BE

  FE-only. No BE changes unless plan catalog fetch is incomplete before navigation (ensure `loadSubscriptionData` runs for authenticated users hitting deep links).

  ### Open questions for node planning

  1. **Helper package location:** `packages/store` (shared with dialectic recompute) vs `apps/web` only?
  2. **Billing interval preference:** Default monthly for tier upgrades, or infer from `userSubscription` / current plan?
  3. **Ultra users on Dashboard quick action:** Next tier is null — link to top-up tab only, or hide?
  4. **GenerateContributionButton:** Retain `minimum_balance` shortfall until cost ceiling is wired on session page, then unify on `stage_ceiling` shortfall.
  5. **Bundle cards** (FE cart ticket §E): Optional follow-up — static bundle config calling same `prefillCart` / URL builder; not required for CTA pass.

* **App-wide store reset on logout — single session-teardown coordinator**

  Cost ceiling node 1 requires `outputCapUserCustomized` reset on **auth logout / session cleared**; today that is only proven for `dialecticStore.reset()` in isolation — production `SIGNED_OUT` never calls it. The same gap affects every user-scoped Zustand slice: user A's projects, chats, wallet, cart, org context, and notifications can persist in memory until user B logs in on the same tab.

  ### Problem

  Session end is fragmented across four paths with no single contract:

  1. **`authStore` `SIGNED_OUT`** (`packages/store/src/authStore.ts`) — clears auth slice (user, session, profile, tier), unsubscribes notifications, navigates. Does not reset sibling stores.
  2. **`authStore` `logout()`** — calls `analytics.reset()`, notification unsubscribe, `localStorage` key removal, navigation. Does not reset Zustand user data slices.
  3. **`subscriptionStore` `useAuthStore.subscribe`** — partial subscription clear when `user` goes `null` (does not reset full slice; duplicates teardown logic).
  4. **`App.tsx` `useEffect`** — when `profile` becomes null, calls `aiStore.resetChatContextToDefaults()` only (four fields; chats, `messagesByChatId`, `currentChatId`, and all other slices leak).

  **Symptom surfaced in FE4 V&V:** `dialecticStore.outputCapUserCustomized` survives logout. That is one field-level leak; the architectural defect is **no auth-owned teardown of all user-scoped slices**.

  ### What already exists (no reinvention)

  - **`packages/store/src/dialecticStore.ts`**: `reset()` restores full `initialDialecticStateValues`; unit-tested in `dialecticStore.test.ts`.
  - **`packages/store/src/analyticsStore.ts`**: `analytics.reset()` already invoked from `logout()` — SDK wrapper, not a user-data slice; keep as-is.
  - **`apps/web/src/mocks/dialecticStore.mock.ts`**: `reset()` mock already present.
  - **Per-slice initial state constants**: `initialDialecticStateValues`, `initialAiStateValues` (`@paynless/types`), `initialWalletStateValues`; Zustand `getInitialState()` on `cartStore`, `subscriptionStore`, `organizationStore`.

  **Gaps in existing infrastructure:**

  - No `reset()` on `aiStore`, `walletStore`, `notificationStore`, `subscriptionStore`, `organizationStore`, or full-slice `cartStore` (only `clearCart()`).
  - No `resetUserSessionStores()` coordinator — auth has no single call site for session teardown.
  - No auth-level integration test proving **every** user-scoped slice returns to initial state on `SIGNED_OUT`.
  - `authStore.listener.test.ts` mocks `notificationStore` and `organizationStore` — cannot prove real cross-store behavior.
  - `walletStore._resetForTesting()` is test-only; not callable from production logout path.

  ### Resolution — single coordinator, full slice reset

  Add **`resetUserSessionStores()`** in `packages/store` that resets every user-scoped slice to its documented initial values:

  | Slice | Reset mechanism |
  |--------|-----------------|
  | `dialecticStore` | existing `reset()` |
  | `aiStore` | new `reset()` → `initialAiStateValues` |
  | `walletStore` | new public `reset()` → `initialWalletStateValues` |
  | `subscriptionStore` | new `reset()` → `getInitialState()` with `replace: true` |
  | `organizationStore` | new `reset()` → exported `initialOrganizationStateValues` with `replace: true` |
  | `notificationStore` | new `reset()` → exported `initialNotificationStateValues` (after `unsubscribeFromUserNotifications`) |
  | `cartStore` | new `reset()` → full initial slice (`cart`, `isCheckingOut`, `checkoutError`) |

  **Auth wiring:** `SIGNED_OUT` in `authStore.ts` calls `resetUserSessionStores()` after auth slice clear and notification unsubscribe. `logout()` no-session path also calls it when `SIGNED_OUT` may not fire.

  **Auth slice:** Cleared inline in `SIGNED_OUT` as today (`navigate` preserved — infrastructure, not user data).

  **Remove duplicate teardown:**

  - Delete `App.tsx` profile-null branch that calls `resetChatContextToDefaults()`.
  - Delete `subscriptionStore` `useAuthStore.subscribe` logout branch (lines 331–340); coordinator owns subscription reset on session end. Keep login branch.

  **Proof:** New `authStore.sessionTeardown.test.ts` — dirty every slice → `SIGNED_OUT` → assert each slice matches initial values (real stores, not mocked siblings).

  ### Implementation sequence (dependency order — one source file per checklist node)

  1. **Per-slice `reset()` producers** — wallet → cart → notification → subscription → organization → ai (`dialecticStore` unchanged).
  2. **`resetUserSessionStores`** — coordinator calls all slice resets; export from `packages/store/src/index.ts`.
  3. **`authStore`** — wire `SIGNED_OUT` and no-session `logout`; add `authStore.sessionTeardown.test.ts` integration proof.
  4. **`App.tsx`** — remove duplicate AI context reset on profile removal.

  ### Known files in dependency order

  **Slice reset — wallet (node 1):**
  1. `packages/store/src/walletStore.ts` — add public `reset()`; `WalletActions` in same file
  2. `packages/store/src/walletStore.test.ts`
  3. `apps/web/src/mocks/walletStore.mock.ts`

  **Slice reset — cart (node 2):**
  4. `packages/store/src/cartStore/cartStore.interface.ts` — add `reset` to `CartStore`
  5. `packages/store/src/cartStore/cartStore.guard.test.ts`
  6. `packages/store/src/cartStore/cartStore.guard.ts`
  7. `packages/store/src/cartStore/cartStore.test.ts`
  8. `packages/store/src/cartStore/cartStore.ts`
  9. `packages/store/src/cartStore/cartStore.mock.ts`

  **Slice reset — notification (node 3):**
  10. `packages/store/src/notificationStore.ts` — export `initialNotificationStateValues`; add `reset()`
  11. `packages/store/src/notificationStore.test.ts`

  **Slice reset — subscription (node 4):**
  12. `packages/store/src/subscriptionStore.ts` — add `reset()`; remove auth-subscribe logout branch
  13. `packages/store/src/subscriptionStore.test.ts`
  14. `apps/web/src/mocks/subscriptionStore.mock.ts`

  **Slice reset — organization (node 5):**
  15. `packages/types/src/organizations.types.ts` — add `reset` to `OrganizationActions`
  16. `packages/store/src/organizationStore.test.ts`
  17. `packages/store/src/organizationStore.ts` — export `initialOrganizationStateValues`; add `reset()`
  18. `apps/web/src/mocks/organizationStore.mock.ts`

  **Slice reset — ai (node 6):**
  19. `packages/types/src/ai.types.ts` — add `reset` to `AiActions`
  20. `packages/store/src/aiStore.hydration.test.ts`
  21. `packages/store/src/aiStore.ts`
  22. `apps/web/src/mocks/aiStore.mock.ts`

  **Coordinator (node 7):**
  23. `packages/store/src/resetUserSessionStores.test.ts` (new)
  24. `packages/store/src/resetUserSessionStores.ts` (new)
  25. `packages/store/src/index.ts` — export coordinator

  **Auth wiring + integration proof (node 8):**
  26. `packages/store/src/authStore.sessionTeardown.test.ts` (new)
  27. `packages/store/src/authStore.logout.test.ts`
  28. `packages/store/src/authStore.listener.test.ts` — optional coordinator spy on `SIGNED_OUT`
  29. `packages/store/src/authStore.ts`

  **Remove duplicate UI teardown (node 9 — last in dep sequence; commit here):**
  30. `apps/web/src/App.tsx` — remove `resetChatContextToDefaults` logout branch
  31. `apps/web/src/App.test.tsx` — update only if a test asserts removed behavior (none today)

  **Excluded (already satisfies contract):**
  - `packages/store/src/dialecticStore.ts`, `dialecticStore.test.ts`, `packages/types/src/dialectic.types.ts`, `apps/web/src/mocks/dialecticStore.mock.ts`
  - `packages/store/src/analyticsStore.ts`, `apps/web/src/main.tsx`, `Header.tsx`, `nav-user.tsx`

  ### Dependencies

  - **Independent of cost ceiling selectors and subscription deep links** — can land as store infrastructure anytime.
  - **Unblocks FE4 cost ceiling requirement** — `outputCapUserCustomized` reset on logout / session cleared (dialectic node 1 objective) via full `dialecticStore.reset()` in coordinator, not a narrow cap-only patch.
  - **Depends on existing Zustand stores** — no new packages; one new coordinator source file.
  - **Circular imports:** `authStore` already imports `notificationStore` and `organizationStore`; `dialecticStore` and `aiStore` import `authStore`. Same pattern as today; coordinator called at runtime from `SIGNED_OUT` handler only.

  ### Scope split — FE vs BE

  FE-only (`@paynless/store` + `apps/web/src/App.tsx`). No BE, migration, or RLS changes.

  ### Open questions for node planning

  1. **`resetChatContextToDefaults` retention:** Keep as narrow helper for non-logout paths, or delegate entirely to `aiStore.reset()`?
  2. **`subscriptionStore` login subscribe:** After removing logout branch, confirm login `loadSubscriptionData` still fires on `user.id` change only.
  3. **Persisted org `currentOrganizationId`:** `organizationStore.reset()` must clear in-memory state and persist middleware write — verify in `organizationStore.test.ts`.
  4. **`availablePlans` on subscription reset:** Full `getInitialState()` clears cached plans; acceptable because login reloads — confirm no UI flash on re-login.

* Update Stripe plans per spreadsheet — **Ops task (deferred). Prereq**: after tier infrastructure migration, update `subscription_plans.tier_level` for each Stripe plan to match the correct tier. This is a data-only change via direct DB update or a follow-up migration, not a code change.

## Netlify-Worker-Stream Phase 2 and Phase 3 — deferred detail

### Phase 2 (backend notification and status adaptation):

* getAllStageProgress.ts and its consumers need to understand queued as a distinct in-flight status (currently it would fall through to an unclassified state)
* The notification service needs updated event types for the new async lifecycle (stream_queued, stream_started, stream_complete) to give the frontend accurate real-time signals
* deriveStepStatuses and related step-progress logic need to account for jobs in queued state without treating them as failed or not-started

### Phase 3 (frontend):

* Status display components consuming UnifiedStageStatus need a new streaming or queued visual state
* Real-time subscription handlers need to act on the new job status transitions
* The user-facing progress indicators need to reflect the two-phase async lifecycle rather than a single blocking operation


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

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 

## Fix continuation naming to use continuation naming instead of iterations 

## 