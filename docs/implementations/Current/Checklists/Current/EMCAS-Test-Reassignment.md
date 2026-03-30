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

*   `[ ] ` **0.1 Define interface for `executeModelCallAndSave` (the new, focused module)**
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

---

## Test Reassignment Work Plan

### Method: Bottom-Up Adapter Strategy

Migrate tests in dependency order (leaf-first), one owner at a time. Each old test asserts a specific behavior. The decomposed function that owns that behavior must pass the same assertion. If it doesn't, the decomposition broke something.

**Order:**
1. `enqueueRenderJob` (Zone H — no downstream deps, cleanest target)
2. `executeModelCallAndSave` slim (Zones E–G — response handling, save, continuation)
3. `prepareModelJob` (Zones A–D — validation, gather, size, compress)

**For each file:**
1. Classify every `it()` block by zone, behavior, and mock surface
2. Determine if Phase 2 or Phase 3 will change the logic under test
3. If yes → assign to new owner but **defer** the actual migration until that phase completes
4. If no → **move now** — adapt the test to the new owner's §7 interface

### Phase 2/3 Impact Analysis

**Phase 2 (triple-fetch elimination) will change:**
- Zone B: `gatherArtifacts` will be removed from `prepareModelJob` (2.2) — artifacts will flow through from `processSimpleJob` instead of re-fetching
- The shape of data entering prepareModelJob changes (2.1 expands `promptConstructionPayload`)

**Phase 3 (affordability + compression extraction) will change:**
- Zone C: `calculateAffordability` extracted as its own module (3.1) — affordability checks get a new interface
- Zone C/D boundary: `calculateAffordabilityPreflight` extracted (3.2) — compression affordability gets a new interface
- Zone D: `compressPrompt` extracted (3.3) — RAG compression loop gets a new interface
- Zone B: `gatherArtifacts` may be extracted as shared utility or eliminated entirely (3.4)

**Impact on test files:**

| Test File | Zone(s) | Phase 2 Impact | Phase 3 Impact | Action |
|-----------|---------|----------------|----------------|--------|
| `gatherArtifacts.test.ts` | B | **YES** — 2.2 removes gatherArtifacts | **YES** — 3.4 may extract/eliminate | **DEFER** |
| `tokens.test.ts` | C | No | **YES** — 3.1 extracts affordability | **DEFER** |
| `rag.test.ts` | D | No | **YES** — 3.2/3.3 extract compression | **DEFER** |
| `rag2.test.ts` | D | No | **YES** — 3.3 extracts compression | **DEFER** |
| `render.test.ts` | H | No | No | **MOVE NOW** |
| `renderErrors.test.ts` | H | No | No | **MOVE NOW** |
| `continue.test.ts` | F | No | No | **MOVE NOW** |
| `continuationCount.test.ts` | F | No | No | **MOVE NOW** |
| `chunks.test.ts` | G | No | No | **MOVE NOW** |
| `assembleDocument.test.ts` | G | No | No | **MOVE NOW** |
| `rawJsonOnly.test.ts` | G | No | No | **MOVE NOW** |
| `pathContext.test.ts` | G | No | No | **MOVE NOW** |
| `fragment.test.ts` | G | No | No | **MOVE NOW** |
| `jsonSanitizer.test.ts` | F | No | No | **MOVE NOW** |
| `planValidation.test.ts` | F/G | No | No | **MOVE NOW** |
| `notifications.test.ts` | E–G | No | No | **MOVE NOW** |
| `executeModelCallAndSave.test.ts` | A–H | **PARTIAL** — Zone B tests | **PARTIAL** — Zone C/D tests | **SPLIT** — move E-G/H now, defer A-D |

### Existing New-Owner Test Files

These files already exist from the Phase 1 extraction work:

| File | Tests | Status |
|------|-------|--------|
| `prepareModelJob/prepareModelJob.test.ts` | Extraction-time unit tests | Already written |
| `prepareModelJob/prepareModelJob.interface.test.ts` | Interface contract tests | Already written |
| `enqueueRenderJob/enqueueRenderJob.test.ts` | Extraction-time unit tests | Already written |
| `enqueueRenderJob/enqueueRenderJob.interface.test.ts` | Interface contract tests | Already written |

Migrated tests will be added to these existing files (or new topic-specific files alongside them, matching the existing naming pattern).

### Source Test File Inventory

All 17 old EMCAS test files (full prefix: `executeModelCallAndSave.`):

| # | File (short name) | Lines | Zone(s) | New Owner | Action |
|---|-------------------|-------|---------|-----------|--------|
| 1 | `.test.ts` (main) | 2,242 | A–H (mixed) | SPLIT | **SPLIT** |
| 2 | `.gatherArtifacts.test.ts` | 1,085 | B | prepareModelJob | **DEFER** |
| 3 | `.tokens.test.ts` | 704 | C | prepareModelJob | **DEFER** |
| 4 | `.rag.test.ts` | 1,389 | D | prepareModelJob | **DEFER** |
| 5 | `.rag2.test.ts` | 853 | D | prepareModelJob | **DEFER** |
| 6 | `.render.test.ts` | 2,868 | H | enqueueRenderJob | **MOVE NOW** |
| 7 | `.renderErrors.test.ts` | 374 | H | enqueueRenderJob | **MOVE NOW** |
| 8 | `.continue.test.ts` | 1,552 | F | EMCAS slim | **MOVE NOW** |
| 9 | `.continuationCount.test.ts` | 777 | F | EMCAS slim | **MOVE NOW** |
| 10 | `.chunks.test.ts` | 432 | G | EMCAS slim | **MOVE NOW** |
| 11 | `.assembleDocument.test.ts` | 336 | G | EMCAS slim | **MOVE NOW** |
| 12 | `.rawJsonOnly.test.ts` | 470 | G | EMCAS slim | **MOVE NOW** |
| 13 | `.pathContext.test.ts` | 846 | G | EMCAS slim | **MOVE NOW** |
| 14 | `.fragment.test.ts` | 453 | G | EMCAS slim | **MOVE NOW** |
| 15 | `.jsonSanitizer.test.ts` | 212 | F | EMCAS slim | **MOVE NOW** |
| 16 | `.planValidation.test.ts` | 330 | F/G | EMCAS slim | **MOVE NOW** |
| 17 | `.notifications.test.ts` | 272 | E–G | EMCAS slim | **MOVE NOW** |

**Total: 15,195 lines across 17 files**

---

### File-by-File Analysis

Each file gets a detailed subsection recording every `it()` block, the behavior it asserts, which zone's logic it exercises, its mock surface, whether it crosses zone boundaries, and its disposition (move now vs defer).

#### File 1: `executeModelCallAndSave.test.ts` (main) — 2,242 lines, 30 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** A–H (spans all zones)
> **New Owner:** SPLIT across owners
> **Action:** 16 tests move now (12 EMCAS slim, 3 prepareModelJob, 1 enqueueRenderJob); 13 tests defer; 1 split/simplify

*   `[ ] ` | # | Test Name (line) | Behavior Asserted | Zone | Mock Surface | Cross-Zone? | Owner | Action |
*   `[ ] ` |---|------------------|-------------------|------|-------------|-------------|-------|--------|
*   `[✅]  ` | 1 | Happy Path (300) | fileManager.upload called, job update called | G | DB (ai_providers), fileManager, callUnifiedAIModel | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | promptId '__none__' (345) | ChatApiRequest.promptId = '__none__' | A→E | DB (ai_providers), callUnifiedAIModel spy | Yes (A→E) | prepareModelJob | **MOVE NOW** |
*   `[✅]  ` | 3 | Intermediate Flag (383) | uploadContext.isIntermediate = true | G | DB (ai_providers), fileManager | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | Final Artifact Flag (428, 2 steps) | uploadContext.isIntermediate = false/default | G | DB (ai_providers), fileManager | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 5 | Throws on AI Error (503) | retryJob called on model error | F | DB (ai_providers), callUnifiedAIModel stub (error), retryJob spy | Yes (A→F) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 6 | Database Error on Update (544) | Critical error logged on DB update failure | G | DB (jobs update throws), callUnifiedAIModel stub, logger | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[ ] ` | 7 | Throws ContextWindowError (603) | ContextWindowError thrown when oversized + compression fails | C/D | DB (ai_providers, resources), ragService, downloadFromStorage, countTokens (real) | Yes (A→D) | prepareModelJob | **DEFER** — Phase 3 extracts affordability + compression |
*   `[✅]  ` | 8 | source_group validation planner-aware (711) | doc_relationships.source_group=null allowed for per_model | A/G/H | DB (ai_providers, stages, instances, steps), fileManager, callUnifiedAIModel stub | Yes (A→H) | EMCAS slim | **MOVE NOW** — assert on save; planner validation is passthrough |
*   `[✅]  ` | 9 | Doc Relationships - pass to fileManager (860) | doc_relationships forwarded to uploadContext | G | DB (ai_providers), fileManager | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 10 | Doc Relationships - default to null (912) | doc_relationships defaults to null | G | DB (ai_providers), fileManager | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 11 | accept PCP call model with ChatApiRequest (955) | ChatApiRequest built from PromptConstructionPayload | A→E | DB (ai_providers), callUnifiedAIModel spy | Yes (A→E) | prepareModelJob | **MOVE NOW** — Zone A request construction |
*   `[ ] ` | 12 | rendered template as first user message (994) | ChatApiRequest.message = rendered template | A/E | DB (ai_providers), callUnifiedAIModel spy | Yes (A→E) | prepareModelJob | **MOVE NOW** — Zone A request construction |
*   `[✅]  ` | 13 | emits execute_chunk_completed (stop) (1021) | notification event type=execute_chunk_completed | F/G | DB (ai_providers), callUnifiedAIModel stub, notificationService | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 14 | emits document_chunk_completed (continuation) (1082) | notification event for continuation chunk | F | DB (ai_providers), callUnifiedAIModel stub (length), notificationService | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[ ] ` | 15 | max_tokens_to_generate SSOT (1150) | ChatApiRequest.max_tokens_to_generate = SSOT-computed cap | C | DB (ai_providers), tokenWalletService, countTokens stub, callUnifiedAIModel spy | Yes (A→E) | prepareModelJob | **DEFER** — Phase 3 extracts calculateAffordability |
*   `[ ] ` | 16 | resourceDocuments increase counts forwarded (1206) | resourceDocuments in countTokens payload + ChatApiRequest | B/C/E | DB (ai_providers, resources), downloadFromStorage, countTokens stub, callUnifiedAIModel spy | Yes (B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 17 | builds full ChatApiRequest with resourceDocs walletId (1344) | ChatApiRequest includes resourceDocs + walletId | B/E | DB (ai_providers, resources), downloadFromStorage, callUnifiedAIModel spy | Yes (B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 18 | identity: sized payload = sent request (1429) | countTokens payload == ChatApiRequest on 4 fields | C/E | DB (ai_providers), countTokens stub captures payload, callUnifiedAIModel spy | Yes (C→E) | prepareModelJob | **DEFER** — Phase 3 extracts affordability |
*   `[ ] ` | 19 | identity after compression (1474) | post-compression countTokens payload == ChatApiRequest | D/E | DB (ai_providers, resources), ragService, tokenWalletService, downloadFromStorage, countTokens stub (stateful), callUnifiedAIModel spy | Yes (B→E) | prepareModelJob | **DEFER** — Phase 3 extracts compression |
*   `[✅]  ` | 20 | source_prompt_resource_id to fileManager (1589) | uploadContext.source_prompt_resource_id forwarded | G | DB (ai_providers), fileManager | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 21 | updates source_contribution_id (1626) | DB update on prompt resource after save | G | DB (ai_providers, resources update), fileManager | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 22 | sanitizeJsonContent repairs incomplete JSON (1726) | artifact saved, no retry, no continue | F | DB (ai_providers), callUnifiedAIModel stub (broken JSON), fileManager, continueJob spy, retryJob spy | Yes (A→G) | EMCAS slim | **MOVE NOW** |
*   `[ ] ` | 23 | gathers artifacts across contributions/resources/feedback (1766) | ChatApiRequest.resourceDocuments ordering and content | B | DB (ai_providers, contributions, resources, feedback), downloadFromStorage (sequential), callUnifiedAIModel spy | Yes (B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 24 | scoped selection matching inputsRequired (1924) | ChatApiRequest.resourceDocuments inclusion/exclusion by inputsRequired | B | DB (ai_providers, contributions, resources, feedback), callUnifiedAIModel spy | Yes (B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[✅]  ` | 25 | schedules RENDER job (2061) | insert into dialectic_generation_jobs with RENDER job_type | H | DB (ai_providers, stages, instances, steps, jobs insert), fileManager, shouldEnqueueRenderJob stub, callUnifiedAIModel stub | Yes (A→H) | enqueueRenderJob | **MOVE NOW** |
*   `[ ] ` | 26 | throws when required inputsRequired document missing (2229) | Error thrown with message identifying missing doc | B | DB (ai_providers, feedback empty) | Yes (A→B) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 27 | error message identifies document_key and stage (2261) | Error message includes document_key and stage | B | DB (ai_providers, feedback empty) | Yes (A→B) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 28 | optional inputsRequired missing no throw (2298) | No error for optional missing document | B | DB (ai_providers, feedback empty), callUnifiedAIModel stub | Yes (A→B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 29 | adapter receives resourceDocuments with identity fields (2338) | ChatApiRequest.resourceDocuments have id, content, document_key, stage_slug, type | B/E | DB (ai_providers, resources), downloadFromStorage | Yes (B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |
*   `[ ] ` | 30 | adapter resourceDocuments no undefined fields (2412) | No undefined on document_key, stage_slug, type | B/E | DB (ai_providers, resources), downloadFromStorage | Yes (B→E) | prepareModelJob | **DEFER** — Phase 2 removes gatherArtifacts |

**Summary for main file:**
- **MOVE NOW to EMCAS slim:** 13 tests (#1, #3, #4, #5, #6, #8, #9, #10, #13, #14, #20, #21, #22)
- **MOVE NOW to prepareModelJob:** 3 tests (#2, #11, #12) — Zone A request construction, not Phase 2/3 affected
- **MOVE NOW to enqueueRenderJob:** 1 test (#25)
- **DEFER (Phase 2/3):** 13 tests (#7, #15, #16, #17, #18, #19, #23, #24, #26, #27, #28, #29, #30) — Zones B/C/D

---

#### File 2: `executeModelCallAndSave.gatherArtifacts.test.ts` — 1,085 lines, 10 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** B (all tests)
> **New Owner:** prepareModelJob
> **Action:** **DEFER** — Phase 2 (2.2) removes gatherArtifacts from prepareModelJob; Phase 3 (3.4) may extract as shared utility or eliminate entirely
> **Revisit:** After Phase 2

*   `[ ] ` | # | Test Name (line) | Behavior Asserted | Zone | Action |
*   `[ ] ` |---|------------------|-------------------|------|--------|
*   `[ ] ` | 1 | queries resources first, finds rendered doc, does not query contributions (143) | Resource-first query strategy | B | **DEFER** |
*   `[ ] ` | 2 | prefers resources over contributions when both exist (245) | Resource precedence | B | **DEFER** |
*   `[ ] ` | 3 | throws error when required rendered doc not found in resources (356) | Required doc validation | B | **DEFER** |
*   `[ ] ` | 4 | finds required seed_prompt in dialectic_project_resources (444) | Resource query for seed_prompt | B | **DEFER** |
*   `[ ] ` | 5 | continues to query contributions for intermediate artifacts (556) | Contribution fallback for non-doc inputs | B | **DEFER** |
*   `[ ] ` | 6 | queries dialectic_contributions by session_id only, never project_id (672) | Query filter correctness | B | **DEFER** |
*   `[ ] ` | 7 | finds required project_resource initial_user_prompt (782) | Resource query for initial_user_prompt | B | **DEFER** |
*   `[ ] ` | 8 | skips optional document input when not found (894) | Optional doc tolerance | B | **DEFER** |
*   `[ ] ` | 9 | required input with failed storage download throws (969) | Download failure for required input | B | **DEFER** |
*   `[ ] ` | 10 | optional input with failed storage download skips (1056) | Download failure tolerance for optional | B | **DEFER** |

---

#### File 3: `executeModelCallAndSave.tokens.test.ts` — 704 lines, 11 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** C (all tests)
> **New Owner:** prepareModelJob → eventually `calculateAffordability` (Phase 3.1)
> **Action:** **DEFER** — Phase 3 (3.1) extracts calculateAffordability as its own module
> **Revisit:** After Phase 3

*   `[ ] ` | # | Test Name (line) | Behavior Asserted | Zone | Action |
*   `[ ] ` |---|------------------|-------------------|------|--------|
*   `[ ] ` | 1 | compression path throws when wallet service missing (35) | Missing walletService validation | C/D | **DEFER** |
*   `[ ] ` | 2 | throws if walletId is missing (preflight, non-oversized) (88) | Missing walletId validation | C | **DEFER** |
*   `[ ] ` | 3 | preflight fails when tokenWalletService missing (136) | Missing tokenWalletService validation | C | **DEFER** |
*   `[ ] ` | 4 | preflight fails when model cost rates are invalid (180) | Invalid cost rates validation | C | **DEFER** |
*   `[ ] ` | 5 | preflight fails for NSF when total cost exceeds balance (233) | NSF guard | C | **DEFER** |
*   `[ ] ` | 6 | orchestrate RAG and debit tokens for un-indexed history (286) | RAG debit orchestration | C/D | **DEFER** |
*   `[ ] ` | 7 | does not debit when compression tokensUsedForIndexing is zero (391) | Zero-indexing debit skip | C/D | **DEFER** |
*   `[ ] ` | 8 | throws if estimated cost exceeds 80% rationality threshold (459) | Rationality threshold guard | C | **DEFER** |
*   `[ ] ` | 9 | throws if estimated cost exceeds absolute balance (537) | Absolute balance guard | C | **DEFER** |
*   `[ ] ` | 10 | performs affordable compression, checking balance once (607) | Compression affordability path | C/D | **DEFER** |
*   `[ ] ` | 11 | uses source documents for token estimation before prompt assembly (687) | Token estimation with source docs | C | **DEFER** |

---

#### File 4: `executeModelCallAndSave.rag.test.ts` — 1,389 lines, 17 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** D (all tests, some touch C boundary)
> **New Owner:** prepareModelJob → eventually `compressPrompt` (Phase 3.3) and `calculateAffordabilityPreflight` (Phase 3.2)
> **Action:** **DEFER** — Phase 3 (3.2/3.3) extracts compression as its own module
> **Revisit:** After Phase 3

*   `[ ] ` | # | Test Name (line) | Behavior Asserted | Zone | Action |
*   `[ ] ` |---|------------------|-------------------|------|--------|
*   `[ ] ` | 1 | resource documents for sizing but not in ChatApiRequest.messages (41) | Sizing vs request separation | C/D | **DEFER** |
*   `[ ] ` | 2 | should only pass un-indexed documents to RAG service (260) | RAG input filtering | D | **DEFER** |
*   `[ ] ` | 3 | iteratively compress lowest-value candidate until fits (349) | Iterative compression loop | D | **DEFER** |
*   `[ ] ` | 4 | throws ContextWindowError if compression fails (553) | Compression failure error | D | **DEFER** |
*   `[ ] ` | 5 | does not call provider if final input exceeds headroom (638) | Post-compression headroom guard | D | **DEFER** |
*   `[ ] ` | 6 | proceeds when final input equals allowed headroom (723) | Boundary success case | D | **DEFER** |
*   `[ ] ` | 7 | fails when final input exceeds headroom by 1 token (786) | Boundary failure case | D | **DEFER** |
*   `[ ] ` | 8 | enforces strict user-assistant alternation after compression (847) | Alternation enforcement | D | **DEFER** |
*   `[ ] ` | 9 | preserves continuation anchors after compression (944) | Continuation anchor preservation | D | **DEFER** |
*   `[ ] ` | 10 | RAG debits use stable idempotency keys (1056) | Idempotency key generation | D | **DEFER** |
*   `[ ] ` | 11 | recomputes SSOT output after RAG debit reduces balance (1146) | Post-debit SSOT recomputation | C/D | **DEFER** |
*   `[ ] ` | 12 | final ChatApiRequest.max_tokens = SSOT(final input) (1207) | SSOT cap after compression | C/D | **DEFER** |
*   `[ ] ` | 13 | threads SSOT cap unchanged to callUnifiedAIModel (1257) | SSOT passthrough | C/D/E | **DEFER** |
*   `[ ] ` | 14 | uses SSOT-based output headroom for allowed input (1312) | SSOT headroom computation | C/D | **DEFER** |
*   `[ ] ` | 15 | error specificity: missing wallet throws specific message (1384) | Wallet validation error message | C | **DEFER** |
*   `[ ] ` | 16 | error specificity: missing countTokens throws (1427) | Missing dependency validation | C | **DEFER** |
*   `[ ] ` | 17 | preflight rejects when planned spend exceeds 80% budget (1473) | Compression preflight guard | C/D | **DEFER** |

---

#### File 5: `executeModelCallAndSave.rag2.test.ts` — 853 lines, 8 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** D (all tests)
> **New Owner:** prepareModelJob → eventually `compressPrompt` (Phase 3.3)
> **Action:** **DEFER** — Phase 3 (3.3) extracts compression as its own module
> **Revisit:** After Phase 3

*   `[ ] ` | # | Test Name (line) | Behavior Asserted | Zone | Action |
*   `[ ] ` |---|------------------|-------------------|------|--------|
*   `[ ] ` | 1 | passes inputsRelevance to rag_service and compressionStrategy (41) | inputsRelevance forwarding | D | **DEFER** |
*   `[ ] ` | 2 | passes empty inputsRelevance as [] (157) | Empty inputsRelevance handling | D | **DEFER** |
*   `[ ] ` | 3 | compression ordering and identity: removes lowest blended-score first (270) | Compression order by blended score | D | **DEFER** |
*   `[ ] ` | 4 | inputsRelevance effects: higher relevance ranks later (451) | Relevance weighting with stage-specific rules | D | **DEFER** |
*   `[ ] ` | 5 | empty inputsRelevance: similarity-only behavior is deterministic (574) | Deterministic behavior without relevance | D | **DEFER** |
*   `[ ] ` | 6 | passes identity-rich candidates into compression (686) | Identity propagation to compression | D | **DEFER** |
*   `[ ] ` | 7 | throws when identity-less documents would be passed to compression (794) | Identity validation for compression | D | **DEFER** |
*   `[ ] ` | 8 | ties without inputsRelevance: non-decreasing effectiveScore order (844) | Score ordering for ties | D | **DEFER** |

---

#### File 6: `executeModelCallAndSave.render.test.ts` — 20 tests (test #4 splits into #4a EMCAS slim + #4b enqueueRenderJob = 21 destination tests)

> **Status:** `[✅]` Analyzed
> **Zone(s):** H (19 tests), F/H (1 test — #4, splits)
> **New Owner:** enqueueRenderJob (20 destination tests including #4b), EMCAS slim (1 destination test — #4a)
> **Action:** **MOVE NOW** — 19 tests move intact to enqueueRenderJob; #4 splits into #4a (EMCAS slim) + #4b (enqueueRenderJob)
> **Shared fixture dependency:** imports `buildExecuteParams`, `createMockJob`, `testPayload`, `mockFullProviderData`, `mockContribution`, `setupMockClient`, `getMockDeps` from main test file
> **Pattern:** Every test stubs `callUnifiedAIModel` and `shouldEnqueueRenderJob`, calls the monolith, then asserts on render job insert behavior (dialectic_generation_jobs insert payload, template_filename, documentKey, documentIdentity, user_jwt, etc.)

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | should not enqueue RENDER job for header_context output type (106) | No insert for non-markdown types | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 2 | should enqueue RENDER job for markdown document output type (218) | Insert for markdown types | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 3 | should NOT enqueue RENDER for intermediate continuation chunk (373) | No insert when needsContinuation=true | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 4a | intermediate continuation chunk with invalid JSON fragment — no retry (506) | Intermediate chunk skips sanitize/parse, retryJob not called | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4b | intermediate continuation chunk with invalid JSON fragment — no RENDER (506) | Intermediate continuation chunk must not enqueue RENDER | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 5 | RENDER job payload includes documentKey (618) | payload.documentKey from validatedDocumentKey | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 6 | RENDER job payload contains all required fields (841) | All fields present on insert payload | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 7 | RENDER job sourceContributionId is actual contribution.id (1049) | sourceContributionId != semantic ID | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 8 | RENDER jobs for root and continuation chunks (1276) | Both root and continuation get render jobs | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 9 | enqueues RENDER with ALL required fields including user_jwt (1545) | user_jwt included in payload | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 10 | throws error when parent job payload lacks user_jwt (1778) | Error thrown for missing user_jwt | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 11 | RENDER job user_jwt matches parent payload exactly (1905) | user_jwt forwarded exactly | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 12 | extracts documentIdentity from document_relationships[stageSlug] for root chunks (2099) | documentIdentity from relationships | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 13 | extracts documentIdentity from document_relationships[stageSlug] for continuation chunks (2247) | documentIdentity from persisted relationships | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 14 | extracts documentIdentity using stageSlug key specifically (2407) | Uses stageSlug not first key | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 15 | throws error when document_relationships is null after persistence (2561) | Error on null relationships | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 16 | validatedDocumentKey is undefined for document outputs (2700) | No RENDER for undefined documentKey | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 17 | skips RENDER when shouldEnqueueRenderJob returns shouldRender:false (2813) | No insert when render check fails | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 18 | throws error when shouldEnqueueRenderJob returns error reason (2927) | Error thrown for stage_not_found etc. | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 19 | should query recipe step and extract template_filename (2981) | template_filename from recipe step query | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 20 | RENDER idempotency: unique constraint 23505 queries existing job (3132) | No throw on duplicate idempotency_key | H | enqueueRenderJob | **MOVE NOW** |

**Mock surface (shared across all 20 source tests):** DB stubs (ai_providers, stages, instances, steps, jobs insert), callUnifiedAIModel stub, shouldEnqueueRenderJob stub, fileManager mock.

**Migration note — #4 split:** The original test has two assertions that belong to different decomposed functions. During migration, create two separate tests: #4a in EMCAS slim tests (asserts retryJob not called for intermediate continuation with invalid JSON) and #4b in enqueueRenderJob tests (asserts no RENDER insert for intermediate continuation). Each test needs only the mock surface relevant to its single behavior.

---

#### File 7: `executeModelCallAndSave.renderErrors.test.ts` — 374 lines, 4 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** G (2 tests) + H (2 tests)
> **New Owner:** SPLIT — 2 to EMCAS slim, 2 to enqueueRenderJob
> **Action:** **MOVE NOW** — all 4 tests
> **Shared fixture dependency:** imports `buildExecuteParams`, `createMockJob`, `testPayload`, `mockContribution`, `mockFullProviderData`, `setupMockClient`, `getMockDeps` from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | throws when document_relationships update fails during initialization (50) | Error on relationship init failure | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | throws when document_relationships update fails (missing stage key) (125) | Error on missing stage key in relationships | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | throws when database insert fails for RENDER job (205) | Error on render job insert failure | H | enqueueRenderJob | **MOVE NOW** |
*   `[✅]  ` | 4 | throws when shouldEnqueueRenderJob query fails (347) | Error on shouldEnqueueRenderJob DB failure | H | enqueueRenderJob | **MOVE NOW** |

**Mock surface:** DB stubs (ai_providers, contributions update), callUnifiedAIModel stub, shouldEnqueueRenderJob (stub or throws), fileManager mock.

---

#### File 8: `executeModelCallAndSave.continue.test.ts` — 1,552 lines, 21 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** F (19 tests), A (2 tests — user_jwt validation)
> **New Owner:** EMCAS slim (19), prepareModelJob (2)
> **Action:** **MOVE NOW** — all 21 tests
> **Shared fixture dependency:** imports `createMockJob`, `testPayload`, `mockSessionData`, `mockProviderData`, `mockFullProviderData`, `setupMockClient`, `getMockDeps`, `mockContribution`, `buildPromptPayload`, `spyCallModel`, `buildExecuteParams` from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | missing payload.user_jwt causes immediate failure (102) | Throws before adapter call when jwt missing | A | prepareModelJob | **MOVE NOW** |
*   `[✅]  ` | 2 | uses payload.user_jwt and never external auth token (168) | jwt from payload forwarded to adapter | A/E | prepareModelJob | **MOVE NOW** |
*   `[✅]  ` | 3 | Continuation Enqueued (199, multi-step) | continueJob called on continuation signal | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | Notifications (258, multi-step) | Notification events emitted during continuation | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 5 | Continuation Handling (341, multi-step) | Continuation logic for various finish_reasons | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 6 | forwards target_contribution_id on continuation save (610) | target_contribution_id preserved in save | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 7 | first chunk saved as non-continuation (658) | Root chunk save with continuation enqueue | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 8 | final assembly triggers using SAVED relationships (716, multi-step) | Assembly triggered from saved relationships | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 9 | sets dynamic document_relationships key based on stage slug (789, multi-step) | Relationship key uses stageSlug | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 10 | continuation persists payload document_relationships (861, multi-step) | Relationships forwarded on continuation | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 11 | continuation uses gathered history, no duplicate "Please continue." (938) | History deduplication | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 12 | triggers final document assembly when continuations exhausted (983) | Assembly on continuation limit | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 13 | rejects continuation without relationships (pre-upload) (1042) | Validation before save | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 14 | three-chunk finalization, saved root id, correct chunk order (1079) | Multi-chunk assembly ordering | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 15 | continuation jobs populate pathContext with continuation flags (1199) | pathContext flags set | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 16 | continues when content has continuation_needed: true, even if stop (1251) | Content-based continuation signal | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 17 | does not inject spacer messages when already alternating (1288) | Message alternation check | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 18 | comprehensive continuation triggers (1337, multi-step) | All continuation trigger scenarios | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 19 | comprehensive retry triggers (1414, multi-step) | All retry trigger scenarios | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 20 | Fix 3.4: structurally-fixed trigger for continuation (1484, multi-step) | Structural fix continuation | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 21 | Fix 3.5: missing-keys trigger for continuation (1602, multi-step) | Missing keys continuation | F | EMCAS slim | **MOVE NOW** |

**Mock surface (shared across Zone F tests):** callUnifiedAIModel stub (various finish_reasons), continueJob stub/spy, retryJob spy, fileManager mock, notificationService mock, DB stubs (ai_providers, contributions, resources).

---

#### File 9: `executeModelCallAndSave.continuationCount.test.ts` — 777 lines, 2 tests (many sub-steps)

> **Status:** `[✅]` Analyzed
> **Zone(s):** F (all tests)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 2 tests
> **Shared fixture dependency:** imports `buildExecuteParams`, `createMockJob`, `testPayload`, `mockFullProviderData`, `mockContribution`, `setupMockClient`, `getMockDeps`, `mockSessionData`, `mockProviderData`, `buildPromptPayload` from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | Step 12.b: requires continuation_count for continuation chunks (43, multi-step) | continuation_count validation, isContinuation flag, turnIndex | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | Fix 2: continuation_limit_reached handling (471, multi-step) | continuation_limit_reached behavior, final assembly trigger | F/G | EMCAS slim | **MOVE NOW** |

**Mock surface:** callUnifiedAIModel stub (various finish_reasons/content), continueJob stub, fileManager mock, DB stubs.

---

#### File 10: `executeModelCallAndSave.chunks.test.ts` — 432 lines, 3 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** G (all tests — document_relationships enforcement during save)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 3 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | enforces document_relationships[stageSlug] = contribution.id for JSON-only root chunks (78) | Relationship key initialization for root | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | enforces document_relationships[stageSlug] = contribution.id even when planner sets invalid value (176) | Override invalid planner value | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | does not overwrite document_relationships[stageSlug] for continuation chunks (330) | Continuation preserves existing key | G | EMCAS slim | **MOVE NOW** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub, DB stubs (ai_providers).

---

#### File 11: `executeModelCallAndSave.assembleDocument.test.ts` — 336 lines, 4 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** G (all tests — final document assembly decision logic)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 4 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | should NOT call assembleAndSaveFinalDocument for final chunk with shouldRender=true (67) | Assembly skipped for rendered docs | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | should call assembleAndSaveFinalDocument for final chunk with shouldRender=false (191) | Assembly triggered for JSON-only | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | should NOT call assembleAndSaveFinalDocument for non-final chunk (254) | Assembly skipped for non-final | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | should NOT call assembleAndSaveFinalDocument when no rootIdFromSaved (317) | Assembly skipped when no root ID | G | EMCAS slim | **MOVE NOW** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub, shouldEnqueueRenderJob stub, assembleAndSaveFinalDocument spy, DB stubs.

---

#### File 12: `executeModelCallAndSave.rawJsonOnly.test.ts` — 470 lines, 5 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** G (all tests — raw JSON save behavior for JSON-only artifacts)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 5 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | 49.b.i: passes FileType.ModelContributionRawJson to file manager (199) | FileType override for raw JSON | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | 49.b.ii: passes mimeType "application/json" to file manager (247) | MimeType override for raw JSON | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | 49.b.iii: passes sanitized JSON string as fileContent (295) | Content is sanitized JSON | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | 49.b.iv: does NOT include rawJsonResponseContent in upload context (349) | No rawJsonResponseContent field | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 5 | 49.b.v: creates contribution with correct file_name, storage_path, mime_type (409) | Correct file metadata | G | EMCAS slim | **MOVE NOW** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub, DB stubs (ai_providers).

---

#### File 13: `executeModelCallAndSave.pathContext.test.ts` — 846 lines, 15 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** G (all tests — pathContext construction, validation, and document_key handling for save)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 15 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | 41.b.i: ALL required values present for document file type (36) | PathContext fully populated | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | 41.b.ii: execute_chunk_completed notification uses document_key from payload (118) | Notification includes document_key | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | 41.b.iii.a: throws when document_key undefined for document type (193) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | 41.b.iii.b: throws when document_key empty string (247) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 5 | 41.b.iii.c: throws when projectId undefined (301) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 6 | 41.b.iii.d: throws when sessionId undefined (357) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 7 | 41.b.iii.e: throws when iterationNumber undefined (413) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 8 | 41.b.iii.f: throws when canonicalPathParams undefined (467) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 9 | 41.b.iii.g: throws when canonicalPathParams.stageSlug undefined (523) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 10 | 41.b.iii.h: throws when attempt_count undefined (581) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 11 | 41.b.iii.i: throws when providerDetails.api_identifier undefined (635) | Validation error | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 12 | 41.b.iv: does NOT throw when document_key undefined for non-document type (689) | Non-document type tolerance | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 13 | propagates sourceAnchorModelSlug for antithesis HeaderContext (754) | sourceAnchorModelSlug in pathContext | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 14 | 101.c: extracts document_key for assembled_document_json output type (831) | document_key extraction for ADJ | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 15 | passes documentKey to pathContext unconditionally for HeaderContext (906) | documentKey always in pathContext | G | EMCAS slim | **MOVE NOW** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub, DB stubs (ai_providers).

---

#### File 14: `executeModelCallAndSave.fragment.test.ts` — 453 lines, 6 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** G (all tests — sourceGroupFragment extraction for storage path construction)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 6 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | 71.c.i: PathContext includes sourceGroupFragment when source_group present (35) | Fragment included in path | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | 71.c.ii: fragment extraction handles UUID with hyphens (115) | UUID fragment extraction | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | 71.c.iii: PathContext works without source_group (backward compat) (195) | No fragment without source_group | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | 71.c.iv: fragment extraction handles undefined source_group (271) | Undefined source_group tolerance | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 5 | 71.c.v: sourceAnchorModelSlug propagates for antithesis patterns (352) | Model slug propagation | G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 6 | 71.c.vi: canonicalPathParams includes sourceAnchorModelSlug for antithesis HeaderContext (437) | Full path params for antithesis | G | EMCAS slim | **MOVE NOW** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub, DB stubs (ai_providers).

---

#### File 15: `executeModelCallAndSave.jsonSanitizer.test.ts` — 212 lines, 4 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** F (all tests — JSON sanitization during response handling)
> **New Owner:** EMCAS slim
> **Action:** **DELETE** — all 4 tests are integration tests replaced by jsonSanitizer.test.ts and a unit test in the main file that proves jsonSanitizer is called
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | repairs incomplete JSON in wrappers, artifact saved (55) | Sanitization repairs broken JSON | F | EMCAS slim | **DELETE** |
*   `[✅]  ` | 2 | sanitizes JSON wrapped in common patterns (97) | Pattern stripping before parse | F | EMCAS slim | **DELETE** |
*   `[✅]  ` | 3 | sanitizes JSON wrapped in triple backticks (138) | Backtick wrapper removal | F | EMCAS slim | **DELETE** |
*   `[✅]  ` | 4 | saves sanitized content for all content types (179) | Content type agnostic sanitization | F/G | EMCAS slim | **DELETE** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub (broken/wrapped JSON), DB stubs.

---

#### File 16: `executeModelCallAndSave.planValidation.test.ts` — 330 lines, 4 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** F/G (all tests — header_context response validation and save)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 4 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | header_context saves with context_for_documents, no files_to_generate (118) | Valid header_context structure | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | header_context with files_to_generate should fail validation (175) | Invalid header_context rejected | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | header_context with missing context_for_documents should fail (246) | Missing required field rejected | F | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | header_context saves with correct contribution_type (318) | contribution_type = header_context | G | EMCAS slim | **MOVE NOW** |

**Mock surface:** fileManager mock, callUnifiedAIModel stub, DB stubs (ai_providers).

---

#### File 17: `executeModelCallAndSave.notifications.test.ts` — 272 lines, 5 tests

> **Status:** `[✅]` Analyzed
> **Zone(s):** E–G (all tests — notification event emission after model call)
> **New Owner:** EMCAS slim
> **Action:** **MOVE NOW** — all 5 tests
> **Shared fixture dependency:** imports from main test file

*   `[✅]  ` | # | Test Name (line) | Behavior Asserted | Zone | Owner | Action |
*   `[✅]  ` |---|------------------|-------------------|------|-------|--------|
*   `[✅]  ` | 1 | execute_chunk_completed emitted for final chunk (78) | Notification on final chunk | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 2 | execute_chunk_completed with all required fields for continuation (131) | Notification fields complete | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 3 | no notification when output type is non-document (HeaderContext) (190) | Notification suppressed for non-document | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 4 | no notification when projectOwnerUserId is undefined (225) | Notification suppressed without owner | F/G | EMCAS slim | **MOVE NOW** |
*   `[✅]  ` | 5 | all calls include targetUserId as second argument (272) | targetUserId always present | F/G | EMCAS slim | **MOVE NOW** |

**Mock surface:** callUnifiedAIModel stub, notificationService mock, DB stubs (ai_providers).

---

### Migration Summary

#### Move Now — Batch 1: enqueueRenderJob (Zone H) — 23 tests

Cleanest target. No downstream dependencies. Existing `enqueueRenderJob/enqueueRenderJob.test.ts` already has extraction-time unit tests.

| Source File | Tests | Target |
|-------------|-------|--------|
| `.render.test.ts` (19 of 20; #4 splits — Zone H assertion becomes #4b here) | 20 | `enqueueRenderJob/enqueueRenderJob.test.ts` (or `.render.test.ts` alongside) |
| `.renderErrors.test.ts` (#3, #4) | 2 | `enqueueRenderJob/enqueueRenderJob.test.ts` |
| Main file #25 | 1 | `enqueueRenderJob/enqueueRenderJob.test.ts` |

**Cross-zone split — render.test.ts #4:** The original test "intermediate continuation chunk with invalid JSON fragment" has two assertions spanning two decomposed functions. It must be split:
- **#4a → EMCAS slim (Zone F):** Asserts `retryJobSpy.calls.length === 0` — intermediate chunk must skip sanitize/parse so invalid JSON fragment does not trigger retry. This is response-handling behavior owned by `executeModelCallAndSave`.
- **#4b → enqueueRenderJob (Zone H):** Asserts `renderInserts.length === 0` — intermediate continuation chunk must not enqueue RENDER. This is render-decision behavior owned by `enqueueRenderJob`.

**Interface adaptation:** Old tests call `executeModelCallAndSave(params)` and stub everything through Zones A-G to assert on Zone H insert behavior. New tests call `enqueueRenderJob(deps, params, payload)` directly with explicit `EnqueueRenderJobParams` + `EnqueueRenderJobPayload`. The contributionId, documentKey, stageSlug, etc. that Zone G currently produces become explicit inputs.

#### Move Now — Batch 2: EMCAS slim (Zones E–G) — 83 tests

The bulk of the work. These tests assert on response handling, continuation logic, save behavior, notification events, and pathContext construction — all Zone E-G behavior that stays in the slimmed `executeModelCallAndSave`.

| Source File | Tests | Target |
|-------------|-------|--------|
| `.continue.test.ts` (19 of 21) | 19 | EMCAS slim tests |
| `.continuationCount.test.ts` | 2 | EMCAS slim tests |
| `.chunks.test.ts` | 3 | EMCAS slim tests |
| `.assembleDocument.test.ts` | 4 | EMCAS slim tests |
| `.rawJsonOnly.test.ts` | 5 | EMCAS slim tests |
| `.pathContext.test.ts` | 15 | EMCAS slim tests |
| `.fragment.test.ts` | 6 | EMCAS slim tests |
| `.jsonSanitizer.test.ts` | 4 | EMCAS slim tests |
| `.planValidation.test.ts` | 4 | EMCAS slim tests |
| `.notifications.test.ts` | 5 | EMCAS slim tests |
| `.renderErrors.test.ts` (#1, #2) | 2 | EMCAS slim tests |
| `.render.test.ts` #4a (Zone F split from #4) | 1 | EMCAS slim tests |
| Main file (#1,3,4,5,6,8,9,10,13,14,20,21,22) | 13 | EMCAS slim tests |

**Interface adaptation:** Old tests call `executeModelCallAndSave(params)` with the monolith interface (bundled object). New tests call the slimmed `executeModelCallAndSave(deps, params, payload)` with §7-compliant interface. The `ChatApiRequest` that Zone A-D currently constructs becomes an explicit input field on the payload. The `callUnifiedAIModel` stub becomes an `adapter.sendMessageStream()` mock yielding `AdapterStreamChunk` items.

#### Move Now — Batch 3: prepareModelJob (Zone A only) — 5 tests

Only Zone A tests not affected by Phase 2/3. These test request construction and validation that happens before gatherArtifacts, sizing, or compression.

| Source File | Tests | Target |
|-------------|-------|--------|
| Main file (#2, #11, #12) | 3 | `prepareModelJob/prepareModelJob.test.ts` |
| `.continue.test.ts` (#1, #2) | 2 | `prepareModelJob/prepareModelJob.test.ts` |

**Interface adaptation:** Old tests call the monolith and spy on `callUnifiedAIModel` to verify ChatApiRequest fields. New tests call `prepareModelJob(deps, params, payload)` and assert on the return value (the prepared `ChatApiRequest`). No need to spy on downstream calls.

#### Defer — Pending Phase 2/3 — 59 tests

| Source File | Tests | Reason | Revisit When |
|-------------|-------|--------|-------------|
| `.gatherArtifacts.test.ts` | 10 | Phase 2 removes gatherArtifacts (2.2), Phase 3 may extract (3.4) | After Phase 2 |
| `.tokens.test.ts` | 11 | Phase 3 extracts calculateAffordability (3.1) | After Phase 3 |
| `.rag.test.ts` | 17 | Phase 3 extracts compression (3.2/3.3) | After Phase 3 |
| `.rag2.test.ts` | 8 | Phase 3 extracts compression (3.3) | After Phase 3 |
| Main file (#7,15,16,17,18,19,23,24,26,27,28,29,30) | 13 | Zones B/C/D — Phase 2/3 will change underlying logic | After Phase 3 |

**Note:** Deferred tests stay in their current files during the MOVE NOW batches. They are assigned to their new owner (prepareModelJob or its Phase 3 extractions) but not adapted until the underlying code changes are complete. This avoids double-updating tests when the functions they test are about to be restructured.

#### Integration Tests (to be created after unit test migration)

*   `[ ]` prepareModelJob → executeModelCallAndSave (Zones A-D → E-G seam)
*   `[ ]` executeModelCallAndSave → enqueueRenderJob (E-G → H seam via return data)
*   `[ ]` prepareModelJob → executeModelCallAndSave → enqueueRenderJob (full chain)

### Shared Fixture Dependency

All 16 satellite test files import shared fixtures from `executeModelCallAndSave.test.ts`. The main file exports 13 symbols; 11 are consumed by satellites:

**Consumed by satellite files (11):**

| Export | Kind | Consumers |
|--------|------|-----------|
| `buildExecuteParams` | Factory — constructs `ExecuteModelCallAndSaveParams` from dbClient + deps + overrides | render, renderErrors, continuationCount, continue, chunks, assembleDocument, rawJsonOnly, planValidation |
| `buildPromptPayload` | Factory — constructs `PromptConstructionPayload` with overrides | continue, continuationCount, rag, rag2, tokens |
| `createMockJob` | Factory — constructs `DialecticJobRow` from payload + overrides | all 16 satellites |
| `getMockDeps` | Factory — constructs `IExecuteJobContext` (monolithic deps interface) | all 16 satellites |
| `mockContribution` | Constant — `Tables<'dialectic_contributions'>` | render, renderErrors, continue, continuationCount, chunks, pathContext, fragment |
| `mockFullProviderData` | Constant — `Tables<'ai_providers'>` row with full config | all 16 satellites |
| `mockProviderData` | Constant — `SelectedAiProvider` (provider + name + api_identifier) | continue, continuationCount, rag, rag2, tokens |
| `mockSessionData` | Constant — `DialecticSession` | continue, continuationCount, rag, rag2, tokens |
| `setupMockClient` | Factory — constructs mock `SupabaseClient` with configurable table responses | all 16 satellites |
| `spyCallModel` | Helper — `spy(deps, 'callUnifiedAIModel')` | rag, rag2, tokens, main (internal) |
| `testPayload` | Constant — `DialecticExecuteJobPayload` | all 16 satellites |

**Internal-only (not imported by satellites, 2):**

| Export | Kind | Notes |
|--------|------|-------|
| `mockSessionRow` | Constant — `Tables<'dialectic_sessions'>` | Used only by main file's own tests |
| `mockFullProviderConfig` | Constant — `AiModelExtendedConfig` | Used only by main file's own tests |

### Mock Factory Migration (§8 / §14 Compliance)

The old tests build mock objects directly inside each `Deno.test` or `t.step` block — constructing `DialecticJobRow`, `Tables<'ai_providers'>`, `DialecticContributionRow`, stage/instance/step rows, and deps objects inline. This makes tests bloated, fragile, and creates massive cross-cutting mock updates whenever a function signature or type changes.

Per rules §8 (Testing Standards) and §14 (Trusted Factories), all mock factories must:
- Live in the respective `.mock.ts` file for the implementation under test
- Use production types and production constructors/adapters
- Produce full, valid domain objects (no partials, no casts)
- Accept typed overrides for per-test customization

**Existing trusted factory files (already compliant):**

| Mock File | Factories Available |
|-----------|-------------------|
| `executeModelCallAndSave/executeModelCallAndSave.mock.ts` (596 lines) | `createMockJob`, `createMockAiProvidersRow`, `createMockAiModelExtendedConfig`, `createMockFactoryDependencies`, `createMockEmcasGetAiProviderAdapter`, `createMockEmcasAiAdapterHarness`, `createMockSendMessageStreamFromParams`, `createMockAiProviderAdapterInstance`, `createMockChatApiRequest`, `createMockExecuteModelCallAndSavePayload`, `createMockDialecticSessionRow`, `createMockChatMessageInsert`, `createMockDebitTokensSuccessFn`, `createMockDebitTokensFn`, `createMockFileManagerForEmcas`, `createMockExecuteModelCallAndSaveDeps`, `createMockExecuteModelCallAndSaveParams`, `createMockDialecticContributionRow`; constants: `mockFullProviderConfig`, `mockSessionRow`, `testPayload`, `testPayloadContinuation`, `testPayloadDocumentArtifact`, `mockEmcasDefaultStreamTokenUsage` |
| `enqueueRenderJob/enqueueRenderJob.mock.ts` (50 lines) | `createEnqueueRenderJobMock` (records calls, configurable result/handler) |
| `prepareModelJob/prepareModelJob.mock.ts` (116 lines) | `createPrepareModelJobMock` (records calls, configurable result/handler/contribution) |

**Migration requirement:** During test migration, each migrated test must:
1. **Stop importing from `executeModelCallAndSave.test.ts`** — no test should import from another test file
2. **Import mock factories from the owner's `.mock.ts` file** — use the trusted factories listed above instead of inline object construction
3. **Replace inline mock construction** with factory calls + typed overrides — e.g., replace a 30-line inline `DialecticJobRow` with `createMockJob(testPayload, { stage_slug: 'custom' })`
4. **Add missing factories** to the `.mock.ts` files as needed during migration (e.g., if `enqueueRenderJob.mock.ts` needs factories for stage/instance/step rows used by render tests, add them there)
5. The old `executeModelCallAndSave.test.ts` main file cannot be deleted until all deferred tests are migrated (they still import from it)

### Accounting

| Metric | Count |
|--------|-------|
| Total tests across 17 old files (source) | **169** |
| Render #4 split into #4a (EMCAS slim) + #4b (enqueueRenderJob) | **+1** |
| **Total destination tests** | **170** |
| Tests moved to enqueueRenderJob (Batch 1) | **23** |
| Tests moved to EMCAS slim (Batch 2) | **83** |
| Tests moved to prepareModelJob (Batch 3, Zone A only) | **5** |
| Tests deferred (Phase 2/3) | **59** |
| New integration tests to create | **3** |
| **Total accounted for (excl. integration)** | **170** |
| **Verification: 23 + 83 + 5 + 59 = 170** | `[✅]` |

### Migration Execution Order

1. **Audit and extend `.mock.ts` factories** — verify each owner's `.mock.ts` has factories for every domain object its migrated tests need; add missing factories (e.g., stage/instance/step row factories for enqueueRenderJob). No test imports from `executeModelCallAndSave.test.ts` in migrated files.
2. **Batch 1: enqueueRenderJob** (23 tests) — leaf-first, no downstream deps. Replace inline mocks with `enqueueRenderJob.mock.ts` factories.
3. **Batch 2: EMCAS slim** (83 tests) — bulk migration, largest effort. Replace inline mocks with `executeModelCallAndSave.mock.ts` factories.
4. **Batch 3: prepareModelJob** (5 tests) — Zone A only, small batch. Replace inline mocks with `prepareModelJob.mock.ts` factories.
5. **Integration tests** (3 tests) — seam verification after unit migration
6. **Verify accounting** — all 170 destination tests accounted for, all passing
7. **Deferred tests remain** in old files until Phase 2/3 complete

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
