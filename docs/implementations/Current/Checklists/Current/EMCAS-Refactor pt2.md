# ExecuteModelCallAndSave Decomposition

## Problem Statement

### The Production Failure

Dialectic jobs that call AI models follow this chain:

```
pg_net (fire-and-forget)
  → dialectic-worker edge function (400s wall clock)
      → callUnifiedAIModel() — HTTP fetch
          → chat edge function (400s wall clock)
              → adapter.sendMessage() — streams from model, buffers to string
                  → AI model (streams response over minutes)
```

Supabase edge functions enforce two timeouts: **150s idle** (no bytes sent) and **400s wall clock** (total runtime). The adapters stream internally from the model and buffer to a string, so the chat function stays alive. But `callUnifiedAIModel` is a plain HTTP fetch — it receives nothing until the stream completes and the buffer converts to a response object. The worker's 400s clock ticks the entire time.

Google models complete within the wall clock. **Anthropic and OpenAI do not.** Anthropic regularly exceeds 400s for a single response. OpenAI is borderline at ~400s. A heartbeat mechanism was added (worker sends periodic newlines to its caller, chat sends periodic newlines back to the worker's fetch via `createHeartbeatResponse`), which solved the 150s idle timeout but cannot extend the 400s wall clock.

Observed error for Anthropic:
```json
{
  "client_error": true,
  "code": 499,
  "detail": "Client disconnected",
  "latency": "399.571 seconds"
}
```

The model IS responding — the stream is active for 400 seconds. The worker dies before it can receive the completed buffer.

### The Architectural Problems

The timeout is the symptom. The architecture is the disease.

#### 1. Two stacked edge functions where one would suffice

`callUnifiedAIModel` (in `dialectic-service/callModel.ts`) exists solely to make an HTTP request to the `/chat` edge function. The chat function exists to serve browser clients AND the dialectic worker. But the worker doesn't need chat's auth flow, request parsing, SSE streaming, or CORS handling. The HTTP hop between two edge functions adds latency, consumes wall clock budget on both functions, and creates a failure mode (the worker's fetch to chat) that wouldn't exist if the worker called the adapter directly.

`callUnifiedAIModel` has exactly one production call site: `executeModelCallAndSave` line 995. There is no need for a parallel implementation — the function itself should be changed to call the adapter directly.

#### 2. Triple-fetch of the same data

The same inputs (session, provider, project, artifacts) are fetched three times in the call chain:

1. **`processSimpleJob`** fetches session, provider, project, domain, stage, system prompt, overlays, recipe step, initial prompt, then calls `promptAssembler.assemble()`.
2. **`promptAssembler.assemble()`** calls `gatherContext` → `gatherInputsForStage`, re-querying the same tables and re-downloading artifacts from storage.
3. **`executeModelCallAndSave`'s internal `gatherArtifacts`** (lines 219-418) queries contributions, resources, and feedback from DB again, re-downloads from storage again, then `applyInputsRequiredScope` filters them.

Each layer fetches what it needs because it doesn't trust — or can't receive — what the layer above already has. The data flows through `promptConstructionPayload` but EMCAS's `gatherArtifacts` ignores it and starts fresh. This wastes wall clock time on redundant DB queries and storage downloads during a phase where every second counts.

#### 3. The monolith: `executeModelCallAndSave`

The function is approximately **1,943 lines** implementing at least 18 distinct responsibilities:

| Zone | Lines (approx) | Responsibilities |
|------|----------------|-----------------|
| **A: Validate** | 60–210 | JWT validation, payload type guard, field extraction, provider fetch, model config construction |
| **B: Gather & Scope** | 219–453 | `gatherArtifacts` (200 lines of DB queries), `applyInputsRequiredScope`, fail-fast validation |
| **C: Size & Afford** | 458–571 | Token counting, wallet balance fetch/parse, cost rate validation, affordability preflight, output budget, NSF guard |
| **D: Compress** | 573–961 | Oversized detection, compression affordability preflight, iterative RAG compression loop, balance tracking, alternation enforcement, final headroom checks |
| **E: Call Model** | 963–999 | Build `ChatApiRequest`, call `deps.callUnifiedAIModel`, measure timing |
| **F: Handle Response** | 1000–1165 | Error/retry on failure, resolve `finish_reason`, sanitize JSON, parse, detect continuation signals (finish_reason, content flags, missing keys) |
| **G: Save** | 1167–1398 | Build upload context, save contribution, persist `document_relationships`, initialize root relationships |
| **H: Render** | 1399–1700+ | Validate relationships, query recipe steps for template filename, build render payload, insert render job |

The function named "execute model call and save" actually spends ~960 lines on preparation (Zones A–D) before the model call, and ~700 lines on response handling and persistence (Zones F–H) after it. The actual model call is **5 lines** (Zone E).

The existing test suite spans 17 files with ~700 test cases. Changing any single concern requires understanding the entire ~2,000-line flow. The monolithic structure prevents targeted unit testing, forces integration tests to cover unit-level logic, and makes every change risky.

#### 4. The naming tells the story

The function is called `executeModelCallAndSave`. The model call and save are 5 + 30 lines. The other 2,000 lines are validation, artifact gathering, token sizing, compression, response handling, continuation logic, relationship management, and render job creation. The function's name describes what should be extracted — the rest is orchestration that accreted around it.

### Why a quick hack won't work

Every prior fix to this function has added complexity without addressing structure: the heartbeat mechanism, the `createHeartbeatResponse` wrapper, the continuation system, the compression loop. Each solved an immediate problem and made the next problem harder.

Adding wall-clock management, client-initiated stream termination, and client-initiated continuation into 2,000 lines of undifferentiated code is the same pattern. The function is too large to safely absorb new streaming concerns, and the shared utilities needed (token debits, adapter construction) can't be duplicated from chat without creating more SOLID violations.

### Why the original refactor plan is insufficient

The prior version of this plan (dated several months ago, referenced 1,295 lines) focused on extracting ~15 pure utilities: `pickLatest`, `sanitizeMessage`, `validateWalletBalance`, `buildExtendedModelConfig`, `resolveFinishReason`, etc. These are valid SRP extractions, but they don't create the architectural seams needed to fix the timeout. After that refactor, EMCAS would still:

- Call `deps.callUnifiedAIModel` synchronously
- Wait for the entire response before processing
- Have no place for streaming, wall-clock management, or checkpoint saves

The pure utility extractions make EMCAS tidier but don't change its shape. The timeout fix requires splitting EMCAS along its zone boundaries, not extracting helper functions from within zones.

## Objectives

### Primary: Fix the production timeout for Anthropic and OpenAI

Eliminate the chat edge function from the dialectic call chain. Give the worker direct adapter access with streaming, so the worker can:
- Stream from the model directly (no HTTP intermediary)
- Use the full 400s wall clock for the model call (no overhead from a second edge function)
- Implement soft-timeout checkpointing for models that exceed 400s

### Secondary: Decompose EMCAS into focused, composable modules

Split `executeModelCallAndSave` along its zone boundaries into modules that can be composed, tested, and evolved independently. The function that remains should be a thin orchestrator — not a 2000-line monolith.

### Tertiary: Eliminate redundant data fetching

Establish a single fetch-and-pass-through pattern so artifacts gathered by `processSimpleJob` / `promptAssembler` flow into the model call module without re-querying.

## Expected Outcome

### Architecture after decomposition

```
dialectic-worker edge function
  → prepareModelJob (orchestrator: validate, gather, size, compress)
      → executeModelCallAndSave (the actual call + save)
          → adapter.sendMessageStream() — direct, no chat hop
          → soft-timeout checkpoint at ~350s
          → save contribution
          → continuation decision
```

- **`prepareModelJob`** (~800–1000 lines, Zones A–D): validates payload, resolves provider config, gathers and scopes artifacts, sizes tokens, runs compression. Outputs a fully prepared `ChatApiRequest` and resolved context.
- **`executeModelCallAndSave`** (~200–400 lines, Zones E–G): calls the adapter directly, handles the response, saves the contribution, decides on continuation. This module owns streaming, timeout, and response handling.
- **Render job creation** (Zone H): extracted as a separate post-save step, called by the orchestrator after `executeModelCallAndSave` returns.
- **Shared utilities** (token debits, `resolveFinishReason`, `determineContinuation`, etc.): extracted as needed, used by both the chat path (for browser clients) and the direct path (for dialectic jobs).

### What changes for each consumer

| Consumer | Before | After |
|----------|--------|-------|
| Dialectic worker | worker → HTTP → chat → adapter | worker → adapter (direct) |
| Browser chat (SSE) | browser → chat → adapter | No change |
| `callUnifiedAIModel` | HTTP fetch to chat | DELETED — `executeModelCallAndSave` calls adapter directly, no intermediary needed |

### Quantitative targets

- `executeModelCallAndSave` (the model call module): under 400 lines, single responsibility
- `prepareModelJob` (the orchestrator): under 1,000 lines, pure preparation
- All ~700 existing tests pass without modification (behavior preservation)
- Anthropic and OpenAI dialectic jobs complete successfully within the 400s wall clock
- For models that exceed 400s: soft-timeout triggers continuation, job completes across invocations using existing `continueJob` + `assembleChunks` machinery

## Phased Work Breakdown

### Phase 0: Preparation — type contracts and shared utilities

Before splitting EMCAS, define the contracts that the extracted modules will implement and extract pure utilities that are used across zones.

*   `[✅] ` **0.1 Define interface for `executeModelCallAndSave` (the new, focused module)**
    *   Input contract: `ChatApiRequest`, adapter instance, provider details, job metadata, save context
    *   Output contract: `UnifiedAIResponse` + saved contribution + continuation decision
    *   Streaming contract: `sendMessageStream()` on the adapter interface (yields chunks)

*   `[✅] ` **0.2 Define interface for `prepareModelJob` (the orchestrator)**
    *   Input contract: job, dbClient, deps (same as current EMCAS params)
    *   Output contract: fully prepared `ChatApiRequest`, resolved provider, resolved artifacts, affordability result

*   `[✅]` **0.3 Extract pure utilities from EMCAS internals**
    These are low-risk, high-value extractions that reduce EMCAS line count and enable isolated testing. Each follows the pattern: define interface → write failing test → implement → verify existing tests still pass.

    *   `[✅]` 0.3.a `pickLatest` — pure utility, selects latest record by `created_at` (current lines ~225-234)
    *   `[✅]` 0.3.b `sanitizeMessage` — pure string transform, removes placeholder braces
    *   `[✅]` 0.3.c `applyInputsRequiredScope` — pure filter, scopes docs to `inputsRequired` rules (current lines ~421-436)
    *   `[✅]` 0.3.e `validateWalletBalance` — pure validation, parses and validates balance string
    *   `[✅]` 0.3.f `validateModelCostRates` — pure validation, checks input/output rates
    *   `[✅]` 0.3.g `resolveFinishReason` — pure extraction from AI response (current lines ~1029-1034)
    *   `[✅]` 0.3.h `determineContinuation` — pure decision based on finish reason + parsed content (current lines ~1053-1164)
    *   `[✅]` 0.3.i `buildUploadContext` — pure construction of `ModelContributionUploadContext` (current lines ~1325-1360)

*   `[✅]` **0.4 Extract token debit logic as a shared utility**
    Currently lives inside the chat function's `debitTokens`. The direct-adapter path needs the same logic. Extract once, use in both chat (browser path) and the new `executeModelCallAndSave` (dialectic path).

*   `[✅]` **0.5 Replace EMCAS inline implementations with extracted utilities**
    Swap each inline implementation for a call to the extracted utility. Run all ~700 existing tests after each swap to prove behavior preservation.

*   `[✅]` **0.6 Commit: `refactor(BE): extract pure utilities from executeModelCallAndSave`**

### Phase 1: Extract the model-call boundary — fixes the timeout

This is the highest-priority phase. It creates the architectural seam needed for direct adapter access and streaming.

*   `[✅] ` **1.1 Add `sendMessageStream()` to the adapter interface**
    All three adapters (Anthropic, OpenAI, Google) already stream internally. `sendMessageStream()` exposes the stream to the caller instead of buffering internally. The existing `sendMessage()` remains for the chat/browser path.

    *   `[✅] ` 1.1.a Define the streaming interface: `AsyncGenerator<AdapterStreamChunk>` yielding `{ type: 'text_delta', text: string }` and `{ type: 'usage', tokenUsage: TokenUsage }` and `{ type: 'done', finish_reason: FinishReason }`
    *   `[✅] ` 1.1.b Implement in `anthropic_adapter.ts` — expose the existing `stream` iteration
    *   `[✅] ` 1.1.c Implement in `openai_adapter.ts` — expose the existing chunk iteration
    *   `[✅] ` 1.1.d Implement in `google_adapter.ts` — expose the existing `streamResult.stream` iteration
    *   `[✅] ` 1.1.e Unit test each adapter's streaming method

*   `[✅] ` **1.2 Extract `executeModelCallAndSave` (Zones E–G) into its own module**
    The new module lives at `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` (keeps the name). It receives a fully prepared `ChatApiRequest` and adapter, calls the model, handles the response, and saves.

    *   `[✅] ` 1.2.a Create the new module with the extracted Zones E–G logic
    *   `[✅] ` 1.2.b Replace the HTTP fetch in `callUnifiedAIModel` with direct `adapter.sendMessageStream()` call
    *   `[✅] ` 1.2.c Implement buffer accumulation from stream chunks
    *   `[✅] ` 1.2.d Implement soft-timeout checkpoint: at ~350s, save accumulated content as intermediate contribution, return `finish_reason: 'length'` to trigger existing `continueJob` machinery
    *   `[✅] ` 1.2.e Token debits use the shared utility extracted in Phase 0.4
    *   `[✅] ` 1.2.f Response handling (sanitize, parse, continuation decision) uses extracted utilities from Phase 0.3

*   `[✅] ` **1.3 Rename the remainder to `prepareModelJob` (Zones A–D)**
    What's left of the old EMCAS becomes the orchestrator. It prepares everything, then calls the new `executeModelCallAndSave`.

    *   `[✅] ` 1.3.a Rename file and function
    *   `[✅] ` 1.3.b Update all callers (`processSimpleJob`, `processComplexJob`, worker deps)
    *   `[✅] ` 1.3.c `prepareModelJob` constructs the adapter directly via `deps.getAiProviderAdapter` (already available in worker deps) instead of passing an auth token for HTTP
    *   `[✅] ` 1.3.d Pass the adapter instance + prepared request to `executeModelCallAndSave`

*   `[✅] ` **1.4 Extract render job creation (Zone H) as a post-save step**
    Render job creation (~300 lines) is a separate concern that runs after the model call and save. It queries recipe steps, extracts template filenames, builds render payloads, and inserts jobs. Extract it so `executeModelCallAndSave` can return after saving, and the orchestrator handles render job creation.

    *   `[✅] ` 1.4.a Extract to `enqueueRenderJob.ts`
    *   `[✅] ` 1.4.b Called by `prepareModelJob` after `executeModelCallAndSave` returns

*   `[✅] ` **1.5 Wire the direct-adapter path into the worker**
    Update `dialectic-worker/index.ts` deps to provide adapter construction instead of `callUnifiedAIModel`.

*   `[✅] ` **1.6 Integration test: all ~700 existing tests pass**
    Behavior preservation proof. No test modifications allowed.

*   `[✅] ` **1.7 Production validation**
    *   `[✅] ` 1.7.a Google: completes as before (baseline)
    *   `[✅] ` 1.7.b OpenAI: completes within 400s (was borderline, hop removal gives headroom)
    *   `[✅] ` 1.7.c Anthropic: either completes within 400s (hop removal sufficient) or soft-timeout triggers continuation and job completes across invocations

*   `[✅] ` **1.8 Commit: `feat(BE): direct adapter call for dialectic jobs, eliminate chat hop`**

### Phase 2: Eliminate the redundant fetch

Of the three fetches against the same artifact data, two fetch the same documents for the same ultimate purpose — delivering full document content to the model via `ChatApiRequest.resourceDocuments`. The prompt assembler's internal fetch (`gatherInputsForStage`) serves a different purpose (injecting template variable references into the prompt text) and is not touched here. This phase eliminates the redundant second fetch by extracting `gatherArtifacts` as a standalone function, calling it once in `processSimpleJob`, and carrying the result through the pipeline to its destination without discarding and re-fetching it.

`promptConstructionPayload` already has a `resourceDocuments` field — it is currently initialized as `[]` in `processSimpleJob` and ignored by `prepareModelJob`. This field is the correct carrier. The fix populates it at the fetch point and ensures `prepareModelJob` reads from it rather than re-fetching. The `resourceDocuments` object may be mutated by the RAG compression loop inside `prepareModelJob` if the total input exceeds the model's token window — this is expected behavior and is unchanged.

*   `[✅] ` [BE] `dialectic-worker/gatherArtifacts` **Extract `gatherArtifacts` as a standalone exported function: query and download artifacts matching `inputsRequired` rules**

#### 1. Intent & Position

*   `[✅] ` `objective`
    *   `[✅] ` Define the *problem being solved*: `gatherArtifacts` is an inline async closure inside `prepareModelJob.ts` that captures `projectId`, `sessionId`, `iterationNumber`, `dbClient`, `deps.logger`, `deps.downloadFromStorage`, `deps.pickLatest`, and `inputsRequired` from its enclosing scope. It cannot be called upstream or tested in isolation. Extracting it as a standalone function lets `processSimpleJob` call it once and carry the result through `promptConstructionPayload.resourceDocuments`, eliminating the redundant second fetch.
    *   `[✅] ` Separate:
        *   Functional goals: given `inputsRequired` rules and session identity parameters, query `dialectic_contributions`, `dialectic_project_resources`, and `dialectic_feedback`; download each matching artifact from storage; return `GatherArtifactsReturn` — on success, `GatherArtifactsSuccessReturn` with a deduplicated `artifacts` array; on failure, `GatherArtifactsErrorReturn`
        *   Non-functional constraints: optional rules silently skip on miss; required rules return `GatherArtifactsErrorReturn` on miss or download failure; deduplication by `id`
    *   `[✅] ` Each goal is atomic and testable

*   `[✅] ` `role`
    *   `[✅] ` Role: domain data access utility — resolves and downloads artifacts for model call construction
    *   `[✅] ` Why appropriate: single responsibility; all artifact fetching logic in one independently testable place; no coupling to prompt assembly, token accounting, or model invocation
    *   `[✅] ` Must NOT: assemble prompts, apply `applyInputsRequiredScope` filtering, count tokens, or make model calls

*   `[✅] ` `module`
    *   `[✅] ` Bounded context: dialectic artifact resolution
    *   `[✅] ` Inside boundary: DB queries (contributions, project resources, feedback), storage downloads, deduplication
    *   `[✅] ` Outside boundary: prompt template rendering, scope filtering, token budgeting, `ChatApiRequest` construction

#### 2. Dependencies & Injection

*   `[✅] ` `deps`
    *   `[✅] ` `ILogger` — `_shared/types.ts` — cross-cutting — logging
    *   `[✅] ` `PickLatestFn` — `dialectic-worker/JobContext.interface.ts` — utility — selects latest row by `created_at` from a non-empty array
    *   `[✅] ` `DownloadFromStorageFn` — `_shared/supabase_storage_utils.ts` — infrastructure — downloads artifact bytes from Supabase Storage
    *   `[✅] ` Confirm: no reverse dependencies; no lateral layer violations

*   `[✅] ` `context_slice`
    *   `[✅] ` `GatherArtifactsDeps { logger: ILogger; pickLatest: PickLatestFn; downloadFromStorage: DownloadFromStorageFn; }` — minimal surface, no over-fetching; no hidden coupling

#### 3. Structural Boundary

*   `[✅] ` `gatherArtifacts.interface.ts`
    *   `[✅] ` `GatherArtifactsDeps`: logger, pickLatest, downloadFromStorage
    *   `[✅] ` `GatherArtifactsParams`: dbClient (`SupabaseClient<Database>`), projectId (string), sessionId (string), iterationNumber (number)
    *   `[✅] ` `GatherArtifactsPayload`: inputsRequired (`InputRule[]`)
    *   `[✅] ` `GatherArtifactsSuccessReturn`: `{ artifacts: Required<ResourceDocuments[number]>[] }`
    *   `[✅] ` `GatherArtifactsErrorReturn`: `{ error: Error; retriable: boolean }`
    *   `[✅] ` `GatherArtifactsReturn`: discriminated union — `GatherArtifactsSuccessReturn | GatherArtifactsErrorReturn`
    *   `[✅] ` `GatherArtifactsFn`: `(deps: GatherArtifactsDeps, params: GatherArtifactsParams, payload: GatherArtifactsPayload) => Promise<GatherArtifactsReturn>`
    *   `[✅] ` No implicit/any types; each type is minimal and composable

#### 4. Contract Definition

*   `[✅] ` `gatherArtifacts.interface.test.ts`
    *   `[✅] ` Valid: `inputsRequired` undefined → `isGatherArtifactsSuccessReturn(result)` true; `result.artifacts` is `[]`
    *   `[✅] ` Valid: `inputsRequired` empty array → `isGatherArtifactsSuccessReturn(result)` true; `result.artifacts` is `[]`
    *   `[✅] ` Valid: `document` rule with DB result and storage content → `isGatherArtifactsSuccessReturn(result)` true; `result.artifacts[0]` has `{ id, content, document_key, stage_slug, type: 'document' }`
    *   `[✅] ` Valid: optional rule (`required === false`) with no DB result → `isGatherArtifactsSuccessReturn(result)` true; `result.artifacts` is `[]`
    *   `[✅] ` Invalid: required rule with no DB result → `isGatherArtifactsErrorReturn(result)` true; `result.retriable` is `false`
    *   `[✅] ` Invalid: required rule with storage download failure → `isGatherArtifactsErrorReturn(result)` true
    *   `[✅] ` Valid: two rules resolving to same artifact `id` → `isGatherArtifactsSuccessReturn(result)` true; `result.artifacts` has one entry

#### 5. Interaction Semantics

*   `[✅] ` `gatherArtifacts.interaction.spec`
    *   `[✅] ` Called by: `processSimpleJob` after `ctx.promptAssembler.assemble()` resolves and `resolvedRecipeStep` is available, before `ctx.prepareModelJob` is called
    *   `[✅] ` For each rule in `inputsRequired` with a `document_key`: query the appropriate table filtered by `project_id`, `session_id`, `iteration_number`, `stage_slug`; call `pickLatest` on results; call `downloadFromStorage`; push typed `Required<ResourceDocuments[number]>` to gathered array
    *   `[✅] ` Failure modes: required rule DB miss → returns `GatherArtifactsErrorReturn` with `retriable: false`; storage download error → returns `GatherArtifactsErrorReturn` with `retriable: false`; optional rule miss → skip and continue, result is still `GatherArtifactsSuccessReturn`
    *   `[✅] ` No ordering constraints beyond sequential rule iteration

#### 6. Enforcement

*   `[✅] ` `gatherArtifacts.guard.test.ts`
    *   `[✅] ` Verify each guard against contract cases
    *   `[✅] ` No false positives; no false negatives

*   `[✅] ` `gatherArtifacts.guard.ts`
    *   `[✅] ` `isGatherArtifactsDeps`, `isGatherArtifactsParams`, `isGatherArtifactsPayload`
    *   `[✅] ` `isGatherArtifactsSuccessReturn`, `isGatherArtifactsErrorReturn`
    *   `[✅] ` Guards accept all valid contract cases; reject all invalid cases

#### 7. Behavioral Verification

*   `[✅] ` `gatherArtifacts.test.ts`
    *   `[✅] ` `document` rule: queries `dialectic_project_resources` with `resource_type='rendered_document'`, filters by `document_key`, calls `pickLatest`, downloads, returns `{ type: 'document', ... }`
    *   `[✅] ` `feedback` rule: queries `dialectic_feedback`, filters by `document_key`, calls `pickLatest`, downloads, returns `{ type: 'feedback', ... }`
    *   `[✅] ` `seed_prompt` rule: queries `dialectic_project_resources` with `resource_type='seed_prompt'`, calls `pickLatest`, downloads
    *   `[✅] ` `project_resource` rule: queries `dialectic_project_resources` with `resource_type='project_resource'` or `'initial_user_prompt'` based on `document_key`, calls `pickLatest`, downloads
    *   `[✅] ` `header_context`/contribution rule: queries `dialectic_contributions`, filters by `document_key`, calls `pickLatest`, downloads
    *   `[✅] ` Optional rule, DB miss: result is `GatherArtifactsSuccessReturn`; artifact not included; no error
    *   `[✅] ` Required rule, DB miss: result is `GatherArtifactsErrorReturn` with descriptive `error.message`; `retriable: false`
    *   `[✅] ` Required rule, storage download failure: result is `GatherArtifactsErrorReturn`; `retriable: false`
    *   `[✅] ` Multiple rules resolving to same `id`: result is `GatherArtifactsSuccessReturn`; `artifacts` has single entry

#### 8. Construction

*   `[✅] ` `construction`
    *   `[✅] ` Plain function — no factory; called with explicit deps, params, payload at each call site
    *   `[✅] ` No partially constructed instances possible

#### 9. Implementation

*   `[✅] ` `gatherArtifacts.ts`
    *   `[✅] ` All captured closure variables from `prepareModelJob.ts` converted to explicit parameters matching `GatherArtifactsDeps`, `GatherArtifactsParams`, `GatherArtifactsPayload`
    *   `[✅] ` Each rule type branch (`document`, `feedback`, `seed_prompt`, `project_resource`, `header_context`/contribution) matches existing closure behavior exactly — no logic changes
    *   `[✅] ` Deduplication via `Map<string, Required<ResourceDocuments[number]>>` at end of loop, same as closure

#### 10. External Boundary

*   `[✅] ` `gatherArtifacts.provides.ts`
    *   `[✅] ` Exports: `gatherArtifacts`, `GatherArtifactsDeps`, `GatherArtifactsParams`, `GatherArtifactsPayload`, `GatherArtifactsFn`, `GatherArtifactsSuccessReturn`, `GatherArtifactsErrorReturn`, `GatherArtifactsReturn`, `isGatherArtifactsSuccessReturn`, `isGatherArtifactsErrorReturn`
    *   `[✅] ` No external access bypasses this file

#### 11. Simulation

*   `[✅] ` `gatherArtifacts.mock.ts`
    *   `[✅] ` Controllable implementation returning configurable `GatherArtifactsReturn` (success path with fixture artifacts, or error path with fixture error)
    *   `[✅] ` Conforms to `GatherArtifactsFn` signature and interaction spec
    *   `[✅] ` No new behavior beyond spec

#### 12. Edge Validation

*   `[✅] ` `gatherArtifacts.integration.test.ts`
    *   `[✅] ` Validate standalone function called with realistic deps → result matches expected artifact shape for each rule type
    *   `[✅] ` Use mocks only for Supabase DB client and storage

#### 13. Directionality

*   `[✅] ` `directionality`
    *   `[✅] ` Layer: dialectic-worker domain utility
    *   `[✅] ` Deps inward: `_shared/types`, `_shared/supabase_storage_utils`, `dialectic-service/dialectic.interface`, `dialectic-worker/JobContext.interface`
    *   `[✅] ` Provides outward: `processSimpleJob`
    *   `[✅] ` No cycles

#### 14. Completion Criteria

*   `[✅] ` `requirements`
    *   `[✅] ` `gatherArtifacts` independently exported and testable
    *   `[✅] ` All rule types covered by passing tests
    *   `[✅] ` All existing `prepareModelJob` tests still pass (closure not yet removed; no behavior change)

---

*   `[✅] ` [BE] `dialectic-worker/createJobContext.ts` **Wire `gatherArtifacts` as pre-bound closure on `IJobContext`; trim `IPrepareModelJobContext` of now-unused deps**

#### 1. Intent & Position

*   `[✅] ` `objective`
    *   `[✅] ` Problem: `processSimpleJob` must call `gatherArtifacts` via `ctx` (matching the `ctx.prepareModelJob` pattern) so tests can swap a mock. `IJobContext` does not yet carry `gatherArtifacts`. Separately, `IPrepareModelJobContext` currently provides `pickLatest` and `downloadFromStorage` to `prepareModelJob` — both fields exist solely to support the closure being removed in the next node; they become dead weight after that removal. Both concerns live in `JobContext.interface.ts` and are implemented by `createJobContext.ts`.
    *   `[✅] ` Functional goals:
        *   Add `BoundGatherArtifactsFn` type to `JobContext.interface.ts`
        *   Add `gatherArtifacts: BoundGatherArtifactsFn` to `IJobContext` and `JobContextParams`
        *   `createJobContext` binds `gatherArtifacts` with its deps at construction time, same pattern as `prepareModelJob`
        *   Remove `pickLatest` and `downloadFromStorage` from `IPrepareModelJobContext` (they are no longer consumed by `prepareModelJob` after the closure is removed) and from `createPrepareModelJobContext`
    *   `[✅] ` Non-functional: `IJobContext` still provides `pickLatest` and `downloadFromStorage` as raw fields — they are removed only from the `IPrepareModelJobContext` slice, not from the root

*   `[✅] ` `role`
    *   `[✅] ` Role: composition root — binds all deps and constructs the context passed to job processors
    *   `[✅] ` Why appropriate: all pre-bound closures are wired here; this is the single place that knows about concrete dep injection
    *   `[✅] ` Must NOT: contain business logic; must only bind and pass through

*   `[✅] ` `module`
    *   `[✅] ` Bounded context: dependency injection / context construction
    *   `[✅] ` Inside: `createJobContext`, `createPrepareModelJobContext`, `createExecuteModelCallContext`
    *   `[✅] ` Outside: all job processing logic

#### 2. Dependencies & Injection

*   `[✅] ` `deps`
    *   `[✅] ` `GatherArtifactsFn` — `dialectic-worker/gatherArtifacts/gatherArtifacts.provides.ts` — imported and partially applied at context construction time
    *   `[✅] ` All existing deps unchanged

*   `[✅] ` `context_slice`
    *   `[✅] ` `IJobContext` gains one field: `gatherArtifacts: BoundGatherArtifactsFn`
    *   `[✅] ` `IPrepareModelJobContext` loses two fields: `pickLatest`, `downloadFromStorage`

#### 3. Structural Boundary

*   `[✅] ` `JobContext.interface.ts`
    *   `[✅] ` Add `BoundGatherArtifactsFn = (params: GatherArtifactsParams, payload: GatherArtifactsPayload) => Promise<GatherArtifactsReturn>`
    *   `[✅] ` Add `gatherArtifacts: BoundGatherArtifactsFn` to `IJobContext`
    *   `[✅] ` Add `gatherArtifacts: BoundGatherArtifactsFn` to `JobContextParams`
    *   `[✅] ` Remove `pickLatest` and `downloadFromStorage` from `IPrepareModelJobContext`

#### 4. Contract Definition

*   `[✅] ` `createJobContext.interface.contract.test.ts` (or existing `createJobContext.test.ts`)
    *   `[✅] ` Valid: constructed context has `gatherArtifacts` as a function
    *   `[✅] ` Valid: `ctx.gatherArtifacts(params, payload)` delegates to the bound `GatherArtifactsFn` with correct deps
    *   `[✅] ` Valid: `createPrepareModelJobContext` result does NOT include `pickLatest` or `downloadFromStorage`

#### 5. Interaction Semantics

*   `[✅] ` `createJobContext.interaction.spec`
    *   `[✅] ` `ctx.gatherArtifacts` is called by `processSimpleJob`; deps (`logger`, `pickLatest`, `downloadFromStorage`) are pre-bound at `createJobContext` time, not passed at call time
    *   `[✅] ` `createPrepareModelJobContext` slicer no longer passes `pickLatest` or `downloadFromStorage` to `prepareModelJob`

#### 6. Enforcement

*   `[✅] ` Existing `JobContext.interface.ts` guards updated to reflect added/removed fields
*   `[✅] ` Guard tests updated accordingly

#### 7. Behavioral Verification

*   `[✅] ` `createJobContext.test.ts`
    *   `[✅] ` `ctx.gatherArtifacts` is present and callable
    *   `[✅] ` Calling `ctx.gatherArtifacts` invokes the underlying `GatherArtifactsFn` with bound deps
    *   `[✅] ` `createPrepareModelJobContext` result lacks `pickLatest` and `downloadFromStorage`
    *   `[✅] ` TypeScript: `IPrepareModelJobContext` assignment fails if `pickLatest`/`downloadFromStorage` are supplied

#### 8. Construction

*   `[✅] ` `createJobContext.ts`
    *   `[✅] ` Bind `gatherArtifacts`: `(params, payload) => gatherArtifactsFn({ logger: params_.logger, pickLatest: params_.pickLatest, downloadFromStorage: params_.downloadFromStorage }, params, payload)`
    *   `[✅] ` Add to the returned `IJobContext` object
    *   `[✅] ` Remove `pickLatest` and `downloadFromStorage` from `createPrepareModelJobContext` return

#### 9. Implementation

*   `[✅] ` Same file as Construction — `createJobContext.ts` is the implementation

#### 10. External Boundary

*   `[✅] ` `JobContext.interface.ts` is the external boundary — no `provides.ts` needed (types are the contract)
*   `[✅] ` `BoundGatherArtifactsFn` exported from `JobContext.interface.ts`

#### 11. Simulation

*   `[✅] ` Existing `createJobContext` mock/stub updated to include `gatherArtifacts` field

#### 12. Edge Validation

*   `[✅] ` `createJobContext.integration.test.ts`
    *   `[✅] ` Integration: constructed context passes TypeScript structural check against `IJobContext`
    *   `[✅] ` Integration: `createPrepareModelJobContext` result passes structural check against updated `IPrepareModelJobContext`

#### 13. Directionality

*   `[✅] ` `directionality`
    *   `[✅] ` Layer: composition root — depends on `gatherArtifacts` module; no reverse dependency
    *   `[✅] ` No cycles introduced

#### 14. Completion Criteria

*   `[✅] ` `requirements`
    *   `[✅] ` `IJobContext.gatherArtifacts` present and typed correctly
    *   `[✅] ` `IPrepareModelJobContext` no longer has `pickLatest` or `downloadFromStorage`
    *   `[✅] ` All existing `createJobContext` tests pass with updated fixtures
    *   `[✅] ` All existing `prepareModelJob` tests still pass (closure not yet removed — this node only removes unused fields from the slice; `prepareModelJob.ts` itself is unchanged here)

---

*   `[✅] ` [BE] `dialectic-worker/prepareModelJob/prepareModelJob.ts` **Remove inline `gatherArtifacts` closure; source `resourceDocuments` from `promptConstructionPayload.resourceDocuments`**

#### 1. Intent & Position

*   `[✅] ` `objective`
    *   `[✅] ` Problem: `prepareModelJob` ignores `promptConstructionPayload.resourceDocuments` (always `[]` today) and re-fetches artifact data via an inline closure. With `processSimpleJob` now responsible for calling `gatherArtifacts` upstream, the field will be populated. `prepareModelJob` must read from it instead of re-fetching.
    *   `[✅] ` Functional: destructure `resourceDocuments` from `promptConstructionPayload`; remove the inline `gatherArtifacts` closure (lines ~185–374) and its call; assign the field value to the local `resourceDocuments` variable that flows into `ChatApiRequest.resourceDocuments`
    *   `[✅] ` Non-functional: RAG compression loop mutation of `resourceDocuments[docIndex].content` is expected and unchanged; no behavior change to token counting, compression, or model call construction

*   `[✅] ` `role`
    *   `[✅] ` Role: preparation orchestrator (Zones A–D) — consumes pre-fetched artifacts; does not re-fetch
    *   `[✅] ` Why appropriate: artifact resolution is now upstream; `prepareModelJob` responsibility is scoping, sizing, and compressing
    *   `[✅] ` Must NOT: call `gatherArtifacts` or issue any DB query for artifact data

*   `[✅] ` `module`
    *   `[✅] ` Bounded context: model call preparation
    *   `[✅] ` Inside: consuming `resourceDocuments` from payload, scoping via `applyInputsRequiredScope`, token sizing, compression, building `ChatApiRequest`
    *   `[✅] ` Outside: artifact fetching (upstream in `processSimpleJob`)

#### 2. Dependencies & Injection

*   `[✅] ` `deps`
    *   `[✅] ` No new dependencies; `downloadFromStorage` and `pickLatest` remain in `PrepareModelJobDeps` but are no longer exercised by the removed closure
    *   `[✅] ` Confirm: no reverse dependencies introduced

*   `[✅] ` `context_slice`
    *   `[✅] ` No change to `PrepareModelJobDeps` or `PrepareModelJobParams`

#### 3. Structural Boundary

*   `[✅] ` `prepareModelJob.interface.ts`
    *   `[✅] ` `PrepareModelJobPayload.promptConstructionPayload.resourceDocuments` field already exists — no interface change required
    *   `[✅] ` No new types; no type modifications

#### 4. Contract Definition

*   `[✅] ` `prepareModelJob.interface.test.ts`
    *   `[✅] ` Existing contract tests unchanged — no interface change
    *   `[✅] ` Add: when `promptConstructionPayload.resourceDocuments` is non-empty, those docs appear in the built `ChatApiRequest.resourceDocuments`
    *   `[✅] ` Add: no DB artifact queries are made during `prepareModelJob` execution

#### 5. Interaction Semantics

*   `[✅] ` `prepareModelJob.interaction.spec`
    *   `[✅] ` `resourceDocuments` sourced from `promptConstructionPayload.resourceDocuments` — not from DB
    *   `[✅] ` `applyInputsRequiredScope` still called on the pre-fetched docs — behavior unchanged
    *   `[✅] ` RAG compression loop may mutate `resourceDocuments[docIndex].content` — expected and correct

#### 6. Enforcement

*   `[✅] ` Guards unchanged — no interface modification

#### 7. Behavioral Verification

*   `[✅] ` `prepareModelJob.test.ts`
    *   `[✅] ` Update all fixtures: populate `resourceDocuments` on `promptConstructionPayload` rather than providing DB mock responses for artifact queries
    *   `[✅] ` Add test: `resourceDocuments` from payload flows into `ChatApiRequest.resourceDocuments`
    *   `[✅] ` Add test: no calls to artifact DB tables (`dialectic_contributions`, `dialectic_project_resources`, `dialectic_feedback`) during execution

#### 8. Construction

*   `[✅] ` No change

#### 9. Implementation

*   `[✅] ` `prepareModelJob.ts`
    *   `[✅] ` Remove `const gatherArtifacts = async (): Promise<...> => { ... }` closure (lines ~185–372)
    *   `[✅] ` Remove `const gatheredDocs = await gatherArtifacts();`
    *   `[✅] ` Add `resourceDocuments` to destructuring of `promptConstructionPayload`
    *   `[✅] ` Assign: `const resourceDocuments: ResourceDocuments = promptConstructionPayload.resourceDocuments;`
    *   `[✅] ` All downstream uses of `resourceDocuments` (scoping, token counting, compression loop, `ChatApiRequest` construction) unchanged

#### 10–11. External Boundary / Simulation

*   `[✅] ` No change to `prepareModelJob.provides.ts` or `prepareModelJob.mock.ts`

#### 12. Edge Validation

*   `[✅] ` `prepareModelJob.integration.test.ts`
    *   `[✅] ` Validate: calling `gatherArtifacts` returns a pre-populated `resourceDocuments` array with the correct documents included and mapped 
    *   `[✅] ` Validate: `resourceDocuments` flows through `applyInputsRequiredScope`, token counting, compression, and into `ChatApiRequest.resourceDocuments` passed to `executeModelCallAndSave`

#### 13. Directionality

*   `[✅] ` No change — same layer, same direction, no new cycles

#### 14. Completion Criteria

*   `[✅] ` `requirements`
    *   `[✅] ` Inline `gatherArtifacts` closure removed from `prepareModelJob.ts`
    *   `[✅] ` `resourceDocuments` sourced from `promptConstructionPayload.resourceDocuments`
    *   `[✅] ` All existing `prepareModelJob` tests pass with updated fixtures

---

*   `[✅] ` [BE] `dialectic-worker/processSimpleJob.ts` **Call standalone `gatherArtifacts`; populate `promptConstructionPayload.resourceDocuments` before `prepareModelJob`**

#### 1. Intent & Position

*   `[✅] ` `objective`
    *   `[✅] ` Problem: `processSimpleJob` initializes `resourceDocuments` as `[]` and never populates it, so `promptConstructionPayload.resourceDocuments` has always been empty. With `gatherArtifacts` standalone and `prepareModelJob` reading from the field, `processSimpleJob` must fetch artifacts once and carry them through the pipeline.
    *   `[✅] ` Functional: after `ctx.promptAssembler.assemble()` returns and `resolvedRecipeStep` is available, call `gatherArtifacts` with `ctx.logger`, `ctx.pickLatest`, `ctx.downloadFromStorage`, `dbClient`, `projectId`, `sessionId`, `iterationNumber`, and `resolvedRecipeStep.inputs_required`; assign result to `resourceDocuments`; pass in `promptConstructionPayload` before calling `ctx.prepareModelJob`
    *   `[✅] ` Non-functional: artifacts fetched exactly once per job; result flows to model via `prepareModelJob` → `ChatApiRequest.resourceDocuments` without being re-fetched or discarded

*   `[✅] ` `role`
    *   `[✅] ` Role: job orchestrator — resolves all inputs for a single model call invocation, including artifact data
    *   `[✅] ` Why appropriate: `processSimpleJob` owns the full execution lifecycle; artifact resolution is an input-preparation step that belongs at this boundary
    *   `[✅] ` Must NOT: call `gatherArtifacts` more than once per job invocation

*   `[✅] ` `module`
    *   `[✅] ` Bounded context: simple job execution
    *   `[✅] ` Inside: session/provider/project/stage resolution, prompt assembly, artifact fetch, `prepareModelJob` orchestration, notification dispatch
    *   `[✅] ` Outside: token sizing, compression, model call, saving contributions (owned by `prepareModelJob` and `executeModelCallAndSave`)

#### 2. Dependencies & Injection

*   `[✅] ` `deps`
    *   `[✅] ` `ctx.gatherArtifacts: BoundGatherArtifactsFn` — added to `IJobContext` in the previous node; pre-bound deps are invisible to `processSimpleJob`
    *   `[✅] ` Confirm: no other new dependencies; `processSimpleJob` signature unchanged

*   `[✅] ` `context_slice`
    *   `[✅] ` No change to `IJobContext` or `processSimpleJob` function signature (new field already added in previous node)

#### 3–6. Interface / Contract / Interaction / Guards

*   `[✅] ` No new types; no new guards; no interface changes required

#### 7. Behavioral Verification

*   `[✅] ` `processSimpleJob.test.ts`
    *   `[✅] ` Add test: `ctx.gatherArtifacts` is called after `ctx.promptAssembler.assemble()` resolves
    *   `[✅] ` Add test: when `ctx.gatherArtifacts` returns `GatherArtifactsSuccessReturn`, `promptConstructionPayload.resourceDocuments` equals `result.artifacts` when `ctx.prepareModelJob` is called
    *   `[✅] ` Add test: when `ctx.gatherArtifacts` returns `GatherArtifactsErrorReturn`, job fails with correct error classification before `ctx.prepareModelJob` is called
    *   `[✅] ` Existing tests pass without modification

#### 8. Construction

*   `[✅] ` No change

#### 9. Implementation

*   `[✅] ` `processSimpleJob.ts`
    *   `[✅] ` After `assembled` resolves, call: `const gatherResult = await ctx.gatherArtifacts({ dbClient, projectId, sessionId, iterationNumber }, { inputsRequired: resolvedRecipeStep.inputs_required })`
    *   `[✅] ` Check result: `if (isGatherArtifactsErrorReturn(gatherResult)) { throw gatherResult.error; }` — error is picked up by the existing error classification block below
    *   `[✅] ` Assign: `const resourceDocuments = gatherResult.artifacts;` (replacing the `[]` initialization)
    *   `[✅] ` Pass populated `resourceDocuments` in `promptConstructionPayload` before `ctx.prepareModelJob`

#### 10–11. External Boundary / Simulation

*   `[✅] ` No change

#### 12. Edge Validation

*   `[✅] ` `processSimpleJob.integration.test.ts`
    *   `[✅] ` Prove full pipeline: `processSimpleJob` → `gatherArtifacts` called once → `promptConstructionPayload.resourceDocuments` populated → `prepareModelJob` reads from field (no re-fetch) → `ChatApiRequest.resourceDocuments` contains the artifacts → `executeModelCallAndSave` called with correct request
    *   `[✅] ` Verify no artifact DB queries inside the `prepareModelJob` execution path

#### 13. Directionality

*   `[✅] ` No change — same layer, same direction, no new cycles

#### 14. Completion Criteria

*   `[✅] ` `requirements`
    *   `[✅] ` `gatherArtifacts` called exactly once per simple job execution
    *   `[✅] ` `promptConstructionPayload.resourceDocuments` non-empty when `inputs_required` has rules
    *   `[✅] ` All existing `processSimpleJob` tests pass
    *   `[✅] ` Integration test proves single-fetch pipeline end-to-end

#### 15. Versioning

*   `[✅] ` **Commit** `refactor(BE): eliminate redundant artifact fetch in dialectic job pipeline`
    *   `[✅] ` Structural: `gatherArtifacts` extracted to standalone module in `dialectic-worker/gatherArtifacts/`; inline closure removed from `prepareModelJob.ts`
    *   `[✅] ` Behavioral: artifact data fetched once in `processSimpleJob`, carried through `promptConstructionPayload.resourceDocuments` to `ChatApiRequest.resourceDocuments`; `prepareModelJob` no longer re-fetches
    *   `[✅] ` Contract: `PrepareModelJobPayload.promptConstructionPayload.resourceDocuments` is now expected to be populated by the caller before `prepareModelJob` is invoked

### Phase 3: Extract affordability and compression (completes the decomposition)

These are the largest internal extractions. They're lower priority because they don't gate the timeout fix, but they complete the decomposition of `prepareModelJob` into focused modules.

*   `[ ]` **3.1 Extract `calculateAffordability`** — non-oversized affordability checks (current lines ~503-571)
*   `[ ]` **3.2 Extract `calculateAffordabilityPreflight`** — compression affordability preflight with iterative solver (current lines ~596-720)
*   `[ ]` **3.3 Extract `compressPrompt`** — the RAG compression loop with live balance tracking (current lines ~722-961)
*   `[ ]` **3.4** ~~Extract `gatherArtifacts`~~ — completed in Phase 2.1; no action needed here
*   `[ ]` **3.5 Integration test: all tests pass**
*   `[ ]` **3.6 Commit: `refactor(BE): extract affordability and compression from prepareModelJob`**

### Phase 4: Final validation

*   `[ ]` **4.1 Run complete test suite** — all ~700 existing tests pass with zero modifications
*   `[ ]` **4.2 Verify module sizes:**
    *   `executeModelCallAndSave` (model call + save): under 400 lines
    *   `prepareModelJob` (orchestrator): under 600 lines (after Phase 3 extractions)
    *   Each extracted utility: under 200 lines
*   `[ ]` **4.3 Verify production behavior:**
    *   Google: no regression
    *   OpenAI: completes reliably
    *   Anthropic: completes (directly or via continuation)
    *   Browser chat SSE: no regression (chat function unchanged)
*   `[ ]` **4.4 Final commit: `refactor(BE): complete EMCAS decomposition`**

## Key Files

| File | Role | Changes |
|------|------|---------|
| `dialectic-worker/executeModelCallAndSave.ts` | Currently: monolith. After: focused model call + save module | Rewritten (Zones E–G only) |
| `dialectic-worker/prepareModelJob.ts` | New file (renamed from old EMCAS) | Zones A–D orchestration |
| `dialectic-worker/enqueueRenderJob.ts` | New file | Zone H extracted |
| `dialectic-service/callModel.ts` | HTTP fetch to chat | DELETED — all consumers removed |
| `dialectic-service/callModel.test.ts` | Tests for callModel | DELETED — tests for deleted function |
| `dialectic-service/dialectic.interface.ts` | Service interfaces | Remove `CallUnifiedAIModelFn`, `CallModelDependencies`, `callUnifiedAIModel?` from `GenerateContributionsDeps` |
| `dialectic-service/generateContribution.test.ts` | Contribution tests | Remove `callUnifiedAIModel` from mock fixtures |
| `_shared/ai_service/*_adapter.ts` | Adapters (3 files) | Add `sendMessageStream()` |
| `dialectic-worker/index.ts` | Worker entry + deps | Wire direct adapter path |
| `dialectic-worker/processSimpleJob.ts` | Job processor | Pass artifacts through to prepareModelJob |
| `_shared/cors-headers.ts` | Heartbeat response | No change (still used by chat for browser path) |
| `chat/index.ts` | Chat edge function | No change (still serves browser clients) |
| `_shared/prompt-assembler/prompt-assembler.ts` | Prompt assembly | Phase 2: accept pre-fetched data |

## Constraints

- All ~700 existing tests must pass without modification at each phase boundary
- The chat edge function is NOT modified — browser SSE streaming is unaffected
- The `continueJob` + `assembleChunks` machinery is reused as-is for soft-timeout continuations
- No new edge functions are introduced; the worker calls the adapter in-process
- The adapter `sendMessage()` method is preserved for the chat/browser path; `sendMessageStream()` is additive
