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

*   `[ ]` **0.1 Define interface for `executeModelCallAndSave` (the new, focused module)**
    *   Input contract: `ChatApiRequest`, adapter instance, provider details, job metadata, save context
    *   Output contract: `UnifiedAIResponse` + saved contribution + continuation decision
    *   Streaming contract: `sendMessageStream()` on the adapter interface (yields chunks)

*   `[ ]` **0.2 Define interface for `prepareModelJob` (the orchestrator)**
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

*   `[ ]` **1.1 Add `sendMessageStream()` to the adapter interface**
    All three adapters (Anthropic, OpenAI, Google) already stream internally. `sendMessageStream()` exposes the stream to the caller instead of buffering internally. The existing `sendMessage()` remains for the chat/browser path.

    *   `[ ]` 1.1.a Define the streaming interface: `AsyncGenerator<AdapterStreamChunk>` yielding `{ type: 'text_delta', text: string }` and `{ type: 'usage', tokenUsage: TokenUsage }` and `{ type: 'done', finish_reason: FinishReason }`
    *   `[ ]` 1.1.b Implement in `anthropic_adapter.ts` — expose the existing `stream` iteration
    *   `[ ]` 1.1.c Implement in `openai_adapter.ts` — expose the existing chunk iteration
    *   `[ ]` 1.1.d Implement in `google_adapter.ts` — expose the existing `streamResult.stream` iteration
    *   `[ ]` 1.1.e Unit test each adapter's streaming method

*   `[ ]` **1.2 Extract `executeModelCallAndSave` (Zones E–G) into its own module**
    The new module lives at `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` (keeps the name). It receives a fully prepared `ChatApiRequest` and adapter, calls the model, handles the response, and saves.

    *   `[ ]` 1.2.a Create the new module with the extracted Zones E–G logic
    *   `[ ]` 1.2.b Replace the HTTP fetch in `callUnifiedAIModel` with direct `adapter.sendMessageStream()` call
    *   `[ ]` 1.2.c Implement buffer accumulation from stream chunks
    *   `[ ]` 1.2.d Implement soft-timeout checkpoint: at ~350s, save accumulated content as intermediate contribution, return `finish_reason: 'length'` to trigger existing `continueJob` machinery
    *   `[ ]` 1.2.e Token debits use the shared utility extracted in Phase 0.4
    *   `[ ]` 1.2.f Response handling (sanitize, parse, continuation decision) uses extracted utilities from Phase 0.3

*   `[ ]` **1.3 Rename the remainder to `prepareModelJob` (Zones A–D)**
    What's left of the old EMCAS becomes the orchestrator. It prepares everything, then calls the new `executeModelCallAndSave`.

    *   `[ ]` 1.3.a Rename file and function
    *   `[ ]` 1.3.b Update all callers (`processSimpleJob`, `processComplexJob`, worker deps)
    *   `[ ]` 1.3.c `prepareModelJob` constructs the adapter directly via `deps.getAiProviderAdapter` (already available in worker deps) instead of passing an auth token for HTTP
    *   `[ ]` 1.3.d Pass the adapter instance + prepared request to `executeModelCallAndSave`

*   `[ ]` **1.4 Extract render job creation (Zone H) as a post-save step**
    Render job creation (~300 lines) is a separate concern that runs after the model call and save. It queries recipe steps, extracts template filenames, builds render payloads, and inserts jobs. Extract it so `executeModelCallAndSave` can return after saving, and the orchestrator handles render job creation.

    *   `[ ]` 1.4.a Extract to `enqueueRenderJob.ts`
    *   `[ ]` 1.4.b Called by `prepareModelJob` after `executeModelCallAndSave` returns

*   `[ ]` **1.5 Wire the direct-adapter path into the worker**
    Update `dialectic-worker/index.ts` deps to provide adapter construction instead of `callUnifiedAIModel`.

*   `[ ]` **1.6 Integration test: all ~700 existing tests pass**
    Behavior preservation proof. No test modifications allowed.

*   `[ ]` **1.7 Production validation**
    *   `[ ]` 1.7.a Google: completes as before (baseline)
    *   `[ ]` 1.7.b OpenAI: completes within 400s (was borderline, hop removal gives headroom)
    *   `[ ]` 1.7.c Anthropic: either completes within 400s (hop removal sufficient) or soft-timeout triggers continuation and job completes across invocations

*   `[ ]` **1.8 Commit: `feat(BE): direct adapter call for dialectic jobs, eliminate chat hop`**

### Phase 2: Eliminate the triple-fetch

With EMCAS split into `prepareModelJob` + `executeModelCallAndSave`, the boundary contract between them is explicit. This phase pushes artifact resolution upstream so it happens once.

*   `[ ]` **2.1 Expand `promptConstructionPayload` to carry resolved artifacts**
    Currently carries `conversationHistory`, `resourceDocuments`, `currentUserPrompt`, `source_prompt_resource_id`. Expand to include all artifacts that EMCAS's `gatherArtifacts` currently re-fetches.

*   `[ ]` **2.2 Remove `gatherArtifacts` from `prepareModelJob`**
    `processSimpleJob` already has the resolved artifacts from `promptAssembler`. Pass them through instead of re-fetching.

*   `[ ]` **2.3 Deduplicate between `processSimpleJob` and `promptAssembler`**
    `processSimpleJob` fetches session/provider/project/stage, then `promptAssembler.assemble()` fetches overlapping data internally via `gatherContext`/`gatherInputsForStage`. Establish a single fetch point. This may require changes to the `PromptAssembler` interface to accept pre-fetched data.

*   `[ ]` **2.4 Integration test: all tests pass with single-fetch path**

*   `[ ]` **2.5 Commit: `refactor(BE): eliminate triple-fetch in dialectic job pipeline`**

### Phase 3: Extract affordability and compression (completes the decomposition)

These are the largest internal extractions. They're lower priority because they don't gate the timeout fix, but they complete the decomposition of `prepareModelJob` into focused modules.

*   `[ ]` **3.1 Extract `calculateAffordability`** — non-oversized affordability checks (current lines ~503-571)
*   `[ ]` **3.2 Extract `calculateAffordabilityPreflight`** — compression affordability preflight with iterative solver (current lines ~596-720)
*   `[ ]` **3.3 Extract `compressPrompt`** — the RAG compression loop with live balance tracking (current lines ~722-961)
*   `[ ]` **3.4 Extract `gatherArtifacts`** as a shared utility (if still needed after Phase 2; may be eliminated entirely)
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
