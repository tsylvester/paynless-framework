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

#### Detailed Work Nodes — Phase 0

*   `[✅]` _shared/utils/`pickLatest` **Extract pure utility — selects latest record by `created_at`**
    *   `[✅]` `objective`
        *   `[✅]` Extract the inline `pickLatest` function (EMCAS lines ~225-234) into a standalone, testable pure utility
        *   `[✅]` The function accepts an array of objects with a `created_at: string` field and returns the one with the most recent timestamp
        *   `[✅]` The function throws if the array is empty
        *   `[✅]` The function must be generic: `<T extends { created_at: string }>(rows: T[]) => T`
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure logic with no I/O, no side effects, no external dependencies
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts an array of `{ created_at: string }` objects, returns the single latest one or throws
    *   `[✅]` `deps`
        *   `[✅]` None — pure function, no injected dependencies, no imports beyond standard library
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` None — no dependency surface; the generic constraint `{ created_at: string }` is structural
    *   `[✅]` interface/`pickLatest.interface.ts` — EXCLUDED (no custom types required; the generic constraint is inline and structural, no deps/params/payload interfaces needed for a single-argument pure function)
    *   `[✅]` interface/tests/ — EXCLUDED (no custom types to guard)
    *   `[✅]` interface/guards/ — EXCLUDED (no custom types to guard)
    *   `[✅]` unit/`pickLatest.test.ts`
        *   `[✅]` Test: returns the single element when given a one-element array
        *   `[✅]` Test: returns the element with the latest `created_at` when given multiple elements
        *   `[✅]` Test: correctly compares ISO-8601 timestamps with varying precision
        *   `[✅]` Test: throws `Error('No matching rows found after filtering')` when given an empty array
        *   `[✅]` Test: handles elements where all `created_at` values are identical (returns first encountered)
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `pickLatest<T extends { created_at: string }>(rows: T[]): T`
        *   `[✅]` No factory required — pure function, direct invocation
        *   `[✅]` Prohibited: calling with an empty array (throws at runtime)
    *   `[✅]` `pickLatest.ts`
        *   `[✅]` Implement the generic function matching the current inline logic at EMCAS lines ~225-234
        *   `[✅]` Use `Date.parse()` for timestamp comparison (matches current implementation)
        *   `[✅]` Throw `Error('No matching rows found after filtering')` for empty input (matches current behavior)
        *   `[✅]` Export as named export: `export function pickLatest`
    *   `[✅]` provides/`pickLatest.provides.ts` — EXCLUDED (single exported function directly from `pickLatest.ts`; no multi-symbol boundary surface to manage)
    *   `[✅]` `pickLatest.mock.ts` — EXCLUDED (pure function with no deps; consumers mock by providing test data, not by mocking this function)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS is proven in the final wiring node where inline code is replaced with the extracted utility call)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (none — leaf node)
        *   `[✅]` Provides are outward-facing: any consumer may import `pickLatest` from `_shared/utils/pickLatest.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~225-234
        *   `[✅]` Functional: generic signature preserved — callers retain full type inference on the return value
        *   `[✅]` Acceptance: all five unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`applyInputsRequiredScope` **Extract pure filter — scopes documents to inputsRequired rules**
    *   `[✅]` `objective`
        *   `[✅]` Extract the inline `applyInputsRequiredScope` function (EMCAS lines ~421-436) into a standalone, testable pure utility
        *   `[✅]` The function accepts an array of `Required<ResourceDocument>` and an array of `InputRule`, and returns only those documents that match at least one rule by `type`, `slug`/`stage_slug`, and `document_key`
        *   `[✅]` The function returns an empty array when `inputsRequired` is empty or undefined
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure filter logic with no I/O, no side effects
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts documents + rules, returns filtered documents
    *   `[✅]` `deps`
        *   `[✅]` `ResourceDocument` from `_shared/types.ts` — domain type, inward-facing
        *   `[✅]` `InputRule` from `dialectic-service/dialectic.interface.ts` — domain type, inward-facing
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `ResourceDocument`: uses `type`, `stage_slug`, `document_key` fields for matching
        *   `[✅]` `InputRule`: uses `type`, `slug`, `document_key` fields for matching
        *   `[✅]` No concrete imports from higher or lateral layers
    *   `[✅]` interface/`applyInputsRequiredScope.interface.ts` — EXCLUDED (function signature uses existing domain types directly; no custom deps/params/payload interfaces needed for a two-argument pure function)
    *   `[✅]` interface/tests/ — EXCLUDED (no custom types to guard)
    *   `[✅]` interface/guards/ — EXCLUDED (no custom types to guard)
    *   `[✅]` unit/`applyInputsRequiredScope.test.ts`
        *   `[✅]` Test: returns empty array when `inputsRequired` is empty
        *   `[✅]` Test: returns empty array when `inputsRequired` is undefined
        *   `[✅]` Test: returns matching documents when rules align on `type`, `slug`/`stage_slug`, and `document_key`
        *   `[✅]` Test: excludes documents that do not match any rule
        *   `[✅]` Test: handles partial matches (same type+slug but different document_key) — excludes correctly
        *   `[✅]` Test: returns empty array when no documents match any rule
        *   `[✅]` Test: returns all documents when every document matches a rule
        *   `[✅]` Test: does not match when `rule.document_key` is `undefined` — strict equality means `undefined !== string`, so documents are excluded
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `applyInputsRequiredScope(docs: Required<ResourceDocument>[], inputsRequired: InputRule[] | undefined): Required<ResourceDocument>[]`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `applyInputsRequiredScope.ts`
        *   `[✅]` Implement the filter function matching the current inline logic at EMCAS lines ~421-436
        *   `[✅]` Match documents against rules by comparing `rule.type === doc.type`, `rule.slug === doc.stage_slug`, `rule.document_key === doc.document_key`
        *   `[✅]` Return empty array when `inputsRequired` is undefined or empty (matches current behavior of early return)
        *   `[✅]` Export as named export: `export function applyInputsRequiredScope`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` mock — EXCLUDED (pure function with no deps to mock)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (domain types only)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/applyInputsRequiredScope.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~421-436
        *   `[✅]` Functional: signature accepts `inputsRequired` as `InputRule[] | undefined` to match the call-site where `params.inputsRequired` may be undefined
        *   `[✅]` Acceptance: all seven unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`validateWalletBalance` **Extract pure validation — parses and validates wallet balance string**
    *   `[✅]` `objective`
        *   `[✅]` Extract the inline wallet balance parsing and validation (EMCAS lines ~509-513) into a standalone, testable pure utility
        *   `[✅]` The function accepts a balance string and a wallet ID (for error context), parses the string to a number via `parseFloat`, validates the result is finite and non-negative, and returns the parsed number
        *   `[✅]` The function throws if the balance string cannot be parsed to a finite non-negative number
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure validation with no I/O, no side effects
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts a balance string + wallet ID for error context, returns a parsed number or throws
    *   `[✅]` `deps`
        *   `[✅]` None — pure function, no injected dependencies, no imports beyond standard library
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` None — no dependency surface
    *   `[✅]` interface/ — EXCLUDED (no custom types required; two primitive arguments)
    *   `[✅]` interface/tests/ — EXCLUDED (no custom types to guard)
    *   `[✅]` interface/guards/ — EXCLUDED (no custom types to guard)
    *   `[✅]` unit/`validateWalletBalance.test.ts`
        *   `[✅]` Test: returns parsed number for a valid positive integer string (e.g., `"1000"` → `1000`)
        *   `[✅]` Test: returns parsed number for a valid decimal string (e.g., `"99.5"` → `99.5`)
        *   `[✅]` Test: returns `0` for the string `"0"`
        *   `[✅]` Test: throws for `NaN`-producing input (e.g., `"abc"`)
        *   `[✅]` Test: throws for `Infinity` (e.g., `"Infinity"`)
        *   `[✅]` Test: throws for negative values (e.g., `"-1"`)
        *   `[✅]` Test: throws for empty string
        *   `[✅]` Test: error message includes the wallet ID for diagnostics
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `validateWalletBalance(walletBalanceStr: string, walletId: string): number`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `validateWalletBalance.ts`
        *   `[✅]` Implement the validation matching the current inline logic at EMCAS lines ~509-513
        *   `[✅]` Use `parseFloat()` for parsing (matches current implementation)
        *   `[✅]` Use `Number.isFinite()` for validation (matches current implementation)
        *   `[✅]` Check `walletBalance < 0` (matches current implementation)
        *   `[✅]` Throw `Error(\`Could not parse wallet balance for walletId: ${walletId}\`)` on failure (matches current error message)
        *   `[✅]` Export as named export: `export function validateWalletBalance`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` mock — EXCLUDED (pure function with no deps to mock)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (none — leaf node)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/validateWalletBalance.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~509-513
        *   `[✅]` Functional: the async `getBalance()` call remains at the call site — this function only validates the already-fetched string
        *   `[✅]` Acceptance: all eight unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`validateModelCostRates` **Extract pure validation — checks input/output token cost rates**
    *   `[✅]` `objective`
        *   `[✅]` Extract the inline cost rate validation (EMCAS lines ~516-520) into a standalone, testable pure utility
        *   `[✅]` The function accepts `input_token_cost_rate` and `output_token_cost_rate` (both `number | null` per `AiModelExtendedConfig`) and validates that both are numbers, input rate is non-negative, and output rate is positive
        *   `[✅]` The function throws if validation fails
        *   `[✅]` The function returns the validated rates as a typed pair for downstream use
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure validation with no I/O, no side effects
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts two rate values, returns validated rates or throws
    *   `[✅]` `deps`
        *   `[✅]` None — pure function operating on primitive values
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` None — no dependency surface; operates on `number | null` primitives
    *   `[✅]` interface/`validateModelCostRates.interface.ts`
        *   `[✅]` Define `ValidatedCostRates` return type: `{ inputRate: number; outputRate: number }` — provides typed downstream access without re-extracting from the config
    *   `[✅]` interface/tests/ — EXCLUDED (return type is a simple struct with no invariants requiring runtime guards)
    *   `[✅]` interface/guards/ — EXCLUDED (return type is a simple struct with no invariants requiring runtime guards)
    *   `[✅]` unit/`validateModelCostRates.test.ts`
        *   `[✅]` Test: returns validated rates for valid positive numbers
        *   `[✅]` Test: throws when input rate is `0` (zero input cost is never valid)
        *   `[✅]` Test: throws when `input_token_cost_rate` is `null`
        *   `[✅]` Test: throws when `output_token_cost_rate` is `null`
        *   `[✅]` Test: throws when `input_token_cost_rate` is negative
        *   `[✅]` Test: throws when `output_token_cost_rate` is `0` (zero output rate is invalid per current logic: `outputRate <= 0`)
        *   `[✅]` Test: throws when `output_token_cost_rate` is negative
        *   `[✅]` Test: error message matches `'Model configuration is missing valid token cost rates.'`
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `validateModelCostRates(inputRate: number | null, outputRate: number | null): ValidatedCostRates`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `validateModelCostRates.ts`
        *   `[✅]` Implement the validation matching the current inline logic at EMCAS lines ~516-520
        *   `[✅]` Check `typeof inputRate !== 'number' || inputRate <= 0` (matches current: rejects null and negative)
        *   `[✅]` Check `typeof outputRate !== 'number' || outputRate <= 0` (matches current: rejects null, zero, and negative)
        *   `[✅]` Throw `Error('Model configuration is missing valid token cost rates.')` on failure (matches current error message)
        *   `[✅]` Return `{ inputRate, outputRate }` as `ValidatedCostRates` on success
        *   `[✅]` Export as named export: `export function validateModelCostRates`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` mock — EXCLUDED (pure function with no deps to mock)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (none — leaf node)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/validateModelCostRates.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~516-520
        *   `[✅]` Functional: returns typed `ValidatedCostRates` so callers don't need to re-extract from config
        *   `[✅]` Acceptance: all eight unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`resolveFinishReason` **Extract pure extraction — resolves finish_reason from AI response**
    *   `[✅]` `objective`
        *   `[✅]` Extract the inline finish_reason resolution (EMCAS lines ~1029-1034) into a standalone, testable pure utility
        *   `[✅]` The function accepts a `UnifiedAIResponse` and returns a `FinishReason` by checking: (1) the top-level `finish_reason` field, (2) fallback into `rawProviderResponse['finish_reason']`, (3) `null` if neither yields a valid finish reason
        *   `[✅]` The function uses the existing `isFinishReason` and `isRecord` type guards for validation
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure extraction with no I/O, no side effects
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts a `UnifiedAIResponse`, returns a `FinishReason`
    *   `[✅]` `deps`
        *   `[✅]` `UnifiedAIResponse` from `dialectic-service/dialectic.interface.ts` — domain type, inward-facing
        *   `[✅]` `FinishReason` from `_shared/types.ts` — domain type, inward-facing
        *   `[✅]` `isFinishReason`, `isRecord` from `_shared/utils/type_guards.ts` — existing type guards, inward-facing
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `UnifiedAIResponse`: reads `finish_reason` and `rawProviderResponse` fields
        *   `[✅]` `isFinishReason`: validates a value is a member of the `FinishReason` union
        *   `[✅]` `isRecord`: validates a value is a `Record<string, unknown>`
        *   `[✅]` No concrete imports from higher or lateral layers
    *   `[✅]` interface/ — EXCLUDED (function signature uses existing domain types directly; single-argument pure function)
    *   `[✅]` interface/tests/ — EXCLUDED (no custom types to guard)
    *   `[✅]` interface/guards/ — EXCLUDED (no custom types to guard)
    *   `[✅]` unit/`resolveFinishReason.test.ts`
        *   `[✅]` Test: returns `finish_reason` directly when `aiResponse.finish_reason` is a valid `FinishReason` (e.g., `'stop'`)
        *   `[✅]` Test: returns `finish_reason` from `rawProviderResponse` when top-level `finish_reason` is not a valid `FinishReason` but `rawProviderResponse['finish_reason']` is
        *   `[✅]` Test: returns `null` when neither top-level nor `rawProviderResponse` contain a valid `FinishReason`
        *   `[✅]` Test: returns `null` when `rawProviderResponse` is undefined
        *   `[✅]` Test: returns `null` when `rawProviderResponse` is not a record (e.g., a string or number)
        *   `[✅]` Test: prefers top-level `finish_reason` over `rawProviderResponse` when both are valid
        *   `[✅]` Test: handles each `FinishReason` union member (`'stop'`, `'length'`, `'error'`, `'max_tokens'`, `'content_truncated'`, `'next_document'`, etc.)
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `resolveFinishReason(aiResponse: UnifiedAIResponse): FinishReason`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `resolveFinishReason.ts`
        *   `[✅]` Implement the extraction matching the current inline logic at EMCAS lines ~1029-1034
        *   `[✅]` Check `isFinishReason(aiResponse.finish_reason)` first — if valid, return it
        *   `[✅]` Fall back to `isRecord(aiResponse.rawProviderResponse) && isFinishReason(aiResponse.rawProviderResponse['finish_reason'])` — if valid, return it
        *   `[✅]` Default to `null` if neither check passes
        *   `[✅]` Export as named export: `export function resolveFinishReason`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` mock — EXCLUDED (pure function with no deps to mock)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (domain types and existing type guards only)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/resolveFinishReason.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~1029-1034
        *   `[✅]` Functional: uses existing `isFinishReason` and `isRecord` type guards — no new guards created
        *   `[✅]` Acceptance: all seven unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`isIntermediateChunk` **Extract pure gate — determines whether current chunk is intermediate (skips sanitize/parse)**
    *   `[✅]` `objective`
        *   `[✅]` Extract the intermediate chunk determination (EMCAS lines ~1053, ~1061) into a standalone, testable pure utility
        *   `[✅]` The function evaluates trigger 1 only: `isDialecticContinueReason(resolvedFinish) && continueUntilComplete`
        *   `[✅]` Called BEFORE sanitization at the call site to gate whether sanitization/parsing runs
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure boolean gate with no I/O, no side effects
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts a `FinishReason` and a `boolean`, returns `boolean`
    *   `[✅]` `deps`
        *   `[✅]` `FinishReason` from `_shared/types.ts` — domain type, inward-facing
        *   `[✅]` `isDialecticContinueReason` from `_shared/utils/type_guards.ts` — existing type guard, inward-facing
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `FinishReason`: passed through to `isDialecticContinueReason` check
        *   `[✅]` `isDialecticContinueReason`: evaluates whether `resolvedFinish` is a continuation-triggering reason
        *   `[✅]` No concrete imports from higher or lateral layers
    *   `[✅]` interface/ — EXCLUDED (two primitive arguments, boolean return — no custom types required)
    *   `[✅]` interface/tests/ — EXCLUDED (no custom types to guard)
    *   `[✅]` interface/guards/ — EXCLUDED (no custom types to guard)
    *   `[✅]` unit/`isIntermediateChunk.test.ts`
        *   `[✅]` Test: returns `true` when `resolvedFinish` is a dialectic continue reason AND `continueUntilComplete` is `true`
        *   `[✅]` Test: returns `false` when `resolvedFinish` is a dialectic continue reason but `continueUntilComplete` is `false`
        *   `[✅]` Test: returns `false` when `resolvedFinish` is `'stop'` (not a continue reason) even if `continueUntilComplete` is `true`
        *   `[✅]` Test: returns `false` when `resolvedFinish` is `null` even if `continueUntilComplete` is `true`
        *   `[✅]` Test: returns `true` for each dialectic continue reason (`'length'`, `'max_tokens'`, `'content_truncated'`, `'next_document'`, etc.) when `continueUntilComplete` is `true`
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `isIntermediateChunk(resolvedFinish: FinishReason, continueUntilComplete: boolean): boolean`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `isIntermediateChunk.ts`
        *   `[✅]` Implement the gate matching EMCAS lines ~1053, ~1061: `return isDialecticContinueReason(resolvedFinish) && continueUntilComplete`
        *   `[✅]` Export as named export: `export function isIntermediateChunk`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` mock — EXCLUDED (pure function with no deps; trivial to control via test inputs)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (domain type and existing type guard only)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/isIntermediateChunk.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~1053, ~1061
        *   `[✅]` Functional: called at the EMCAS call site BEFORE sanitization to gate sanitize/parse — eliminates the chicken-and-egg dependency
        *   `[✅]` Acceptance: all five unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`determineContinuation` **Extract pure decision — determines whether AI response requires continuation (triggers 2–4)**
    *   `[✅]` `objective`
        *   `[✅]` Extract the continuation decision logic (EMCAS lines ~1096-1099, ~1127-1136, ~1138-1164) into a standalone, testable pure utility
        *   `[✅]` The function evaluates three continuation triggers and returns a decision: (1) sanitizer structurally fixed the response and `continueUntilComplete` is set, (2) content-level flags (`continuation_needed`, `stop_reason`, `resume_cursor`), (3) parsed content is missing expected keys from `context_for_documents.content_to_include`
        *   `[✅]` The function also accepts `finishReasonContinue` (the result of trigger 1, already computed by `isIntermediateChunk` at the call site) so it can include it in the final `shouldContinue` without re-evaluating
        *   `[✅]` Sanitization, JSON parsing, and retry I/O remain at the call site — this function receives pre-computed inputs only
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure decision logic with no I/O, no side effects, no logging
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts decision inputs, returns `{ shouldContinue: boolean }`
    *   `[✅]` `deps`
        *   `[✅]` `ContextForDocument` from `dialectic-service/dialectic.interface.ts` — domain type, inward-facing
        *   `[✅]` `isRecord` from `_shared/utils/type_guards.ts` — existing type guard, inward-facing
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `ContextForDocument`: reads `document_key` and `content_to_include` for missing-keys check
        *   `[✅]` `isRecord`: validates `parsedContent` is a record before checking content-level flags and missing keys
        *   `[✅]` No concrete imports from higher or lateral layers
    *   `[✅]` interface/`determineContinuation.interface.ts`
        *   `[✅]` Define `DetermineContinuationParams` with fields:
            *   `finishReasonContinue: boolean` — whether trigger 1 (finish reason) already signalled continuation, passed through from the call site's `isDialecticContinueReason` check
            *   `wasStructurallyFixed: boolean` — whether the sanitizer performed structural JSON repair
            *   `parsedContent: unknown` — the parsed JSON content (always available — this function is called after sanitization)
            *   `continueUntilComplete: boolean` — from `job.payload.continueUntilComplete`
            *   `documentKey: string | undefined` — from `job.payload.document_key`
            *   `contextForDocuments: ContextForDocument[] | undefined` — from `job.payload.context_for_documents`
        *   `[✅]` Define `DetermineContinuationResult` with fields:
            *   `shouldContinue: boolean` — whether the job should trigger continuation (union of trigger 1 pass-through and triggers 2–4)
    *   `[✅]` interface/tests/`determineContinuation.interface.test.ts`
        *   `[✅]` Contract: `DetermineContinuationParams` requires all six fields
        *   `[✅]` Contract: `DetermineContinuationResult` contains exactly `shouldContinue`
    *   `[✅]` interface/guards/`determineContinuation.interface.guards.ts`
        *   `[✅]` Guard: `isDetermineContinuationParams` — validates all six fields are present and correctly typed
        *   `[✅]` Guard: `isDetermineContinuationResult` — validates `shouldContinue` boolean field is present
    *   `[✅]` unit/`determineContinuation.test.ts`
        *   `[✅]` Test: returns `shouldContinue: true` when `finishReasonContinue` is `true` (trigger 1 pass-through)
        *   `[✅]` Test: returns `shouldContinue: true` when `wasStructurallyFixed` is true AND `continueUntilComplete` is true, even if `finishReasonContinue` is false (trigger 2)
        *   `[✅]` Test: does NOT trigger continuation from `wasStructurallyFixed` when `continueUntilComplete` is false
        *   `[✅]` Test: returns `shouldContinue: true` when `parsedContent` has `continuation_needed: true` (trigger 3)
        *   `[✅]` Test: returns `shouldContinue: true` when `parsedContent` has `stop_reason: 'continuation'` (trigger 3)
        *   `[✅]` Test: returns `shouldContinue: true` when `parsedContent` has `stop_reason: 'token_limit'` (trigger 3)
        *   `[✅]` Test: returns `shouldContinue: true` when `parsedContent` has a non-empty `resume_cursor` string (trigger 3)
        *   `[✅]` Test: does NOT trigger continuation from content flags when `parsedContent` is not a record
        *   `[✅]` Test: returns `shouldContinue: true` when parsed content is missing keys from `contextForDocuments[].content_to_include` AND `continueUntilComplete` is true (trigger 4)
        *   `[✅]` Test: does NOT check missing keys when `continueUntilComplete` is false
        *   `[✅]` Test: does NOT check missing keys when `documentKey` is undefined
        *   `[✅]` Test: does NOT check missing keys when `contextForDocuments` is undefined
        *   `[✅]` Test: does NOT trigger missing-keys continuation when all expected keys are present in parsed content
        *   `[✅]` Test: returns `shouldContinue: false` when no triggers match and `finishReasonContinue` is false
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `determineContinuation(params: DetermineContinuationParams): DetermineContinuationResult`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `determineContinuation.ts`
        *   `[✅]` Implement the three-trigger decision logic matching EMCAS lines ~1096-1099, ~1127-1136, ~1138-1164, plus trigger 1 pass-through
        *   `[✅]` Start with `shouldContinue = finishReasonContinue` (trigger 1 pass-through from call site)
        *   `[✅]` Trigger 2: `!shouldContinue && wasStructurallyFixed && continueUntilComplete` → `shouldContinue = true`
        *   `[✅]` Trigger 3: when `!shouldContinue && isRecord(parsedContent)`, check `continuation_needed`, `stop_reason`, `resume_cursor` content flags
        *   `[✅]` Trigger 4: when `!shouldContinue && isRecord(parsedContent) && continueUntilComplete`, check for missing keys by comparing `parsedContent` keys against `contextForDocuments` entry matching `documentKey`
        *   `[✅]` Return `{ shouldContinue }`
        *   `[✅]` Export as named export: `export function determineContinuation`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` `determineContinuation.mock.ts`
        *   `[✅]` Mock factory returning configurable `DetermineContinuationResult` — needed by consumers that must control continuation behavior in tests
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (domain types and existing type guards only)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/determineContinuation.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with the decision logic in EMCAS lines ~1096-1164, combined with trigger 1 pass-through
        *   `[✅]` Functional: all sanitization, JSON parsing, and retry I/O remain at the EMCAS call site — this function is pure
        *   `[✅]` Functional: `isIntermediateChunk` is handled by the separate `isIntermediateChunk` utility, called before sanitization — no chicken-and-egg dependency
        *   `[✅]` Acceptance: all fourteen unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/utils/`buildUploadContext` **Extract pure construction — assembles ModelContributionUploadContext**
    *   `[✅]` `objective`
        *   `[✅]` Extract the inline `ModelContributionUploadContext` object construction (EMCAS lines ~1325-1360) into a standalone, testable pure utility
        *   `[✅]` The function accepts all pre-resolved values (path context fields, file content, provider details, AI response metadata, contribution metadata fields) and assembles them into a `ModelContributionUploadContext`
        *   `[✅]` All validation, sourceGroup resolution, and DB queries that precede the construction (EMCAS lines ~1167-1324) remain at the call site
    *   `[✅]` `role`
        *   `[✅]` Domain utility — pure object assembly with no I/O, no side effects
    *   `[✅]` `module`
        *   `[✅]` Shared utility under `_shared/utils/`, usable by any consumer in the functions workspace
        *   `[✅]` Boundary: accepts resolved values as a params object, returns a `ModelContributionUploadContext`
    *   `[✅]` `deps`
        *   `[✅]` `ModelContributionUploadContext` from `_shared/types/file_manager.types.ts` — domain type, inward-facing
        *   `[✅]` `ModelContributionFileTypes` from `_shared/types/file_manager.types.ts` — domain type, inward-facing
        *   `[✅]` `ContributionMetadata` from `_shared/types/file_manager.types.ts` — domain type, inward-facing
        *   `[✅]` `PathContext` from `_shared/types/file_manager.types.ts` — domain type, inward-facing
        *   `[✅]` `ContributionType` from `_shared/types/file_manager.types.ts` — domain type, inward-facing (via PathContext and ContributionMetadata)
        *   `[✅]` `DocumentRelationships` from `dialectic-service/dialectic.interface.ts` — domain type, inward-facing (via contributionMetadata.document_relationships)
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `ModelContributionUploadContext`: the output type, composed from `pathContext`, `fileContent`, `mimeType`, `sizeBytes`, `userId`, `description`, `contributionMetadata`
        *   `[✅]` All path context and contribution metadata fields are passed in pre-resolved — no field defaulting or computation inside the function
        *   `[✅]` No concrete imports from higher or lateral layers
    *   `[✅]` interface/`buildUploadContext.interface.ts`
        *   `[✅]` Define `BuildUploadContextParams` with fields mirroring the construction inputs:
            *   `projectId: string` — from `job.payload.projectId`
            *   `storageFileType: ModelContributionFileTypes` — resolved file type for storage path
            *   `sessionId: string` — from `job.payload.sessionId`
            *   `iterationNumber: number` — from `job.payload.iterationNumber`
            *   `modelSlug: string` — from `providerDetails.api_identifier`
            *   `attemptCount: number` — from `job.attempt_count`
            *   `restOfCanonicalPathParams: Record<string, unknown>` — spread from `job.payload.canonicalPathParams` (minus `contributionType`)
            *   `documentKey: string` — from `job.payload.document_key`
            *   `contributionType: ContributionType | undefined` — validated contribution type
            *   `isContinuationForStorage: boolean` — whether this is a continuation save
            *   `continuationCount: number | undefined` — from `job.payload.continuation_count` (used as `turnIndex`)
            *   `sourceGroupFragment: string | undefined` — extracted from source_group UUID
            *   `contentForStorage: string` — the content string to save
            *   `projectOwnerUserId: string` — from project owner lookup
            *   `description: string` — constructed description string
            *   `providerDetails: { id: string; name: string }` — model ID and display name
            *   `aiResponse: { inputTokens?: number; outputTokens?: number; processingTimeMs?: number }` — token usage and timing
            *   `sourcePromptResourceId: string | undefined` — from `promptConstructionPayload.source_prompt_resource_id`
            *   `targetContributionId: string | undefined` — resolved target contribution ID
            *   `documentRelationships: unknown` — from `job.payload.document_relationships` (JSON blob)
            *   `isIntermediate: boolean` — from `job.payload.isIntermediate`
    *   `[✅]` interface/tests/`buildUploadContext.interface.test.ts`
        *   `[✅]` Contract: `BuildUploadContextParams` requires all fields as specified
    *   `[✅]` interface/guards/`buildUploadContext.interface.guards.ts`
        *   `[✅]` Guard: `isBuildUploadContextParams` — validates all required fields are present and correctly typed
    *   `[✅]` unit/`buildUploadContext.test.ts`
        *   `[✅]` Test: returns `ModelContributionUploadContext` with correct `pathContext` fields assembled from params
        *   `[✅]` Test: sets `pathContext.fileType` to `storageFileType`
        *   `[✅]` Test: spreads `restOfCanonicalPathParams` into `pathContext`
        *   `[✅]` Test: sets `pathContext.isContinuation` from `isContinuationForStorage`
        *   `[✅]` Test: sets `pathContext.turnIndex` from `continuationCount` when `isContinuationForStorage` is true
        *   `[✅]` Test: sets `pathContext.turnIndex` to undefined when `isContinuationForStorage` is false
        *   `[✅]` Test: includes `sourceGroupFragment` in pathContext when provided
        *   `[✅]` Test: omits `sourceGroupFragment` from pathContext when undefined
        *   `[✅]` Test: sets `fileContent` to `contentForStorage`
        *   `[✅]` Test: sets `mimeType` to `"application/json"`
        *   `[✅]` Test: sets `sizeBytes` to `contentForStorage.length`
        *   `[✅]` Test: sets `userId` to `projectOwnerUserId`
        *   `[✅]` Test: assembles `contributionMetadata` with all specified fields from params
        *   `[✅]` Test: sets `contributionMetadata.isIntermediate` correctly from params
    *   `[✅]` `construction`
        *   `[✅]` Canonical entrypoint: `buildUploadContext(params: BuildUploadContextParams): ModelContributionUploadContext`
        *   `[✅]` No factory required — pure function, direct invocation
    *   `[✅]` `buildUploadContext.ts`
        *   `[✅]` Implement the object assembly matching the current inline logic at EMCAS lines ~1325-1360
        *   `[✅]` Construct `pathContext` by spreading `restOfCanonicalPathParams` and setting explicit fields
        *   `[✅]` Set `turnIndex` conditionally: `isContinuationForStorage ? continuationCount : undefined`
        *   `[✅]` Spread `sourceGroupFragment` conditionally: `...(sourceGroupFragment ? { sourceGroupFragment } : {})`
        *   `[✅]` Construct `contributionMetadata` from provider details, AI response, and job metadata
        *   `[✅]` Set `mimeType` to `"application/json"` and `sizeBytes` to `contentForStorage.length`
        *   `[✅]` Export as named export: `export function buildUploadContext`
    *   `[✅]` provides/ — EXCLUDED (single exported function directly from source file)
    *   `[✅]` mock — EXCLUDED (pure function with no deps to mock; consumers control output by controlling input params)
    *   `[✅]` integration/ — EXCLUDED at this node (integration with EMCAS proven at wiring node)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility
        *   `[✅]` All dependencies are inward-facing (domain types only)
        *   `[✅]` Provides are outward-facing: any consumer may import from `_shared/utils/buildUploadContext.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity with EMCAS lines ~1325-1360
        *   `[✅]` Functional: all validation, sourceGroup resolution, and DB queries remain at the call site — this function only assembles the final object
        *   `[✅]` Acceptance: all fourteen unit tests pass GREEN
        *   `[✅]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

*   `[✅]` _shared/services/`debitTokens` **Relocate token debit logic from chat/ to _shared/ for cross-consumer use**
    *   `[✅]` `objective`
        *   `[✅]` Move `chat/debitTokens.ts` and `chat/debitTokens.test.ts` to `_shared/services/` so both the chat edge function (browser path) and the dialectic worker (direct-adapter path) can import the same debit logic
        *   `[✅]` Resolve the `TokenUsageSchema` dependency: currently imported from `chat/zodSchema.ts`. Either move `TokenUsageSchema` to `_shared/` or have `debitTokens` import it from `chat/zodSchema.ts` (cross-boundary). Moving is preferred since `TokenUsageSchema` is a domain-level schema, not chat-specific
        *   `[✅]` Update `chat/index.ts` to import `debitTokens` from the new `_shared/services/` location
        *   `[✅]` No behavioral changes — pure relocation
    *   `[✅]` `role`
        *   `[✅]` Application service — orchestrates debit-then-operate-then-refund-on-failure, shared across consumer boundaries
    *   `[✅]` `module`
        *   `[✅]` Shared service under `_shared/services/`, alongside `tokenWalletService.ts` which it consumes
        *   `[✅]` Boundary: accepts deps (logger, tokenWalletService) and params (wallet, tokenUsage, modelConfig, userId, relatedEntityId, databaseOperation), returns the result of the database operation
    *   `[✅]` `deps`
        *   `[✅]` `ILogger` from `_shared/types.ts` — domain type, inward-facing
        *   `[✅]` `TokenUsage` from `_shared/types.ts` — domain type, inward-facing
        *   `[✅]` `AiModelExtendedConfig` from `_shared/types.ts` — domain type, inward-facing
        *   `[✅]` `ITokenWalletService`, `TokenWallet`, `TokenWalletTransactionType` from `_shared/types/tokenWallet.types.ts` — domain types, inward-facing
        *   `[✅]` `calculateActualChatCost` from `_shared/utils/cost_utils.ts` — shared utility, inward-facing
        *   `[✅]` `TokenUsageSchema` from `chat/zodSchema.ts` — MUST BE RELOCATED to `_shared/` (see below)
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `DebitTokensDeps`: `{ logger: ILogger; tokenWalletService: ITokenWalletService }` — already defined in current file
        *   `[✅]` `DebitTokensParams<T>`: already defined in current file — no changes to the interface
        *   `[✅]` `TokenUsageSchema`: the Zod schema for runtime validation of token usage; domain-level, not chat-specific
    *   `[✅]` interface/ — EXCLUDED (`DebitTokensDeps` and `DebitTokensParams` are already defined in the source file and do not need separate interface files)
    *   `[✅]` interface/tests/ — EXCLUDED (existing types, no new contracts)
    *   `[✅]` interface/guards/ — EXCLUDED (Zod schema handles runtime validation internally)
    *   `[✅]` unit/`debitTokens.test.ts`
        *   `[✅]` Relocate existing `chat/debitTokens.test.ts` to `_shared/services/debitTokens.test.ts`
        *   `[✅]` Update import paths in the test file to point to the new location
        *   `[✅]` All existing tests must pass without modification to test logic or assertions
    *   `[✅]` `construction`
        *   `[✅]` No changes to function construction — pure relocation
        *   `[✅]` `TokenUsageSchema` relocation: move from `chat/zodSchema.ts` to `_shared/schemas/tokenUsage.schema.ts` (or similar `_shared/` location). Update import in `debitTokens.ts`. Add a re-export or update import in `chat/zodSchema.ts` so chat consumers are unaffected
    *   `[✅]` `debitTokens.ts`
        *   `[✅]` Move file from `chat/debitTokens.ts` to `_shared/services/debitTokens.ts`
        *   `[✅]` Update import of `TokenUsageSchema` to point to its new `_shared/` location
        *   `[✅]` All other imports already point to `_shared/` — verify paths are correct after relocation (relative paths will change since the file moves one level deeper into `_shared/services/`)
        *   `[✅]` No changes to function logic, signature, or behavior
    *   `[✅]` provides/ — EXCLUDED (existing exports unchanged)
    *   `[✅]` mock — EXCLUDED (existing mock patterns in test file are relocated as-is)
    *   `[✅]` integration/`debitTokens.integration.test.ts`
        *   `[✅]` Verify `chat/index.ts` correctly imports `debitTokens` from new `_shared/services/` location and wires it into deps
        *   `[✅]` Verify no other consumers are broken by the relocation
    *   `[✅]` `directionality`
        *   `[✅]` Layer: application service
        *   `[✅]` All dependencies are inward-facing (`_shared/types`, `_shared/utils`)
        *   `[✅]` Provides are outward-facing: `chat/index.ts` and (future) `dialectic-worker/` both import from `_shared/services/debitTokens.ts`
    *   `[✅]` `requirements`
        *   `[✅]` Functional: zero behavioral changes — pure file relocation + import path updates
        *   `[✅]` Functional: `chat/index.ts` imports from new path and continues to work identically
        *   `[✅]` Functional: `TokenUsageSchema` relocated to `_shared/` so it's not stranded in `chat/`
        *   `[✅]` Acceptance: all existing `debitTokens` tests pass at new location
        *   `[✅]` Acceptance: chat edge function tests remain GREEN after import path update

*   `[✅]`   dialectic-worker/`JobContext` **Inject EMCAS pure utilities via IExecuteJobContext — extend types, factories, factory tests, and execute mocks**
    *   `[✅]`   `objective`
        *   `[✅]`   Expose the Phase 0 pure utilities (`pickLatest`, `applyInputsRequiredScope`, `validateWalletBalance`, `validateModelCostRates`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`) to `executeModelCallAndSave` only through **`deps: IExecuteJobContext`**, not direct module imports from EMCAS
        *   `[✅]`   Keep **`createJobContext` → `IJobContext`** as the single composition root and **`createExecuteJobContext`** as the slicer that supplies the execute subset; every new capability must be threaded through both
        *   `[✅]`   Add **typed function aliases** (narrow params/returns) on the context boundary so tests can spy or substitute implementations without editing EMCAS
        *   `[✅]`   Update **factory unit tests** so constructed contexts include the new fields and slicers copy them correctly
        *   `[✅]`   Update **`getMockDeps` (and any other execute test doubles)** so all EMCAS tests receive complete `IExecuteJobContext` objects
        *   `[✅]`   **Exclude** `buildExtendedModelConfig` / inline config rebuild — EMCAS reads model config from the database via existing context (`getAiProviderConfig` or equivalent); no new config-builder dep
    *   `[✅]`   `role`
        *   `[✅]`   Application boundary — dependency surface for the dialectic worker execute path
    *   `[✅]`   `module`
        *   `[✅]`   `JobContext.interface.ts` — `IExecuteJobContext`, `JobContextParams`, and **new readonly function-typed slots**
        *   `[✅]`   `createJobContext.ts` — `createJobContext`, `createExecuteJobContext` (and any other slicer that must forward the new fields if required by type symmetry)
        *   `[✅]`   `createJobContext.test.ts` — factory and slicer behavior
        *   `[✅]`   `executeModelCallAndSave.test.ts` — `getMockDeps` / shared execute mocks
        *   `[✅]`   `type-guards/JobContext.type_guards.ts` + `JobContext.type_guards.test.ts` — **only if** runtime guards must recognize extended execute context
    *   `[✅]`   `deps`
        *   `[✅]`   Implementations live in `_shared/utils/` (and nested folders where applicable) — **infrastructure / domain utilities**, wired at composition root
        *   `[✅]`   `ExecuteModelCallAndSaveParams` / EMCAS — **consumer** of `IExecuteJobContext` only
        *   `[✅]`   Confirm no reverse dependency: utilities do not import worker context
    *   `[✅]`   `context_slice`
        *   `[✅]`   Each injected function matches the production signature of the corresponding `_shared/utils` export (same inputs and outputs; no widening to `(...args: unknown[]) => unknown`)
        *   `[✅]`   `createExecuteJobContext(root)` returns an object that includes **every** new `readonly` slot required by `IExecuteJobContext`
    *   `[✅]`   interface/`JobContext.interface.ts`
        *   `[✅]`   Add **named function types** for each injected utility (e.g. `PickLatestFn`, `ApplyInputsRequiredScopeFn`, …) with parameters and return types imported from or aligned with existing domain types (`ResourceDocument`, `InputRule`, `UnifiedAIResponse`, `FinishReason`, `DetermineContinuationParams` / `DetermineContinuationResult`, `BuildUploadContextParams`, `ModelContributionUploadContext`, etc.)
        *   `[✅]`   Extend **`IExecuteJobContext`** with `readonly pickLatest`, `readonly applyInputsRequiredScope`, … (one field per utility)
        *   `[✅]`   Extend **`JobContextParams`** with the same symbols so `createJobContext` receives explicit implementations (no optional fields; factory sets every field)
    *   `[✅]`   interface/tests/`JobContext.interface.test.ts` — **EXCLUDED** unless new interfaces require contract tests per project convention; prefer factory tests for shape
    *   `[✅]`   interface/guards/`JobContext.interface.guards.ts` — **EXCLUDED** unless guards are updated for extended context
    *   `[✅]`   unit/`createJobContext.test.ts`
        *   `[✅]`   Test: `createJobContext` returns an object that includes each new readonly utility field with **reference equality** to the params passed in
        *   `[✅]`   Test: `createExecuteJobContext` copies each new field from a fully built `IJobContext` into the sliced `IExecuteJobContext` with **reference equality**
        *   `[✅]`   Test: sliced execute context still omits plan/render-only fields not in `IExecuteJobContext` (regression guard if structure is asserted)
    *   `[✅]`   `construction`
        *   `[✅]`   Composition root: where `JobContextParams` is constructed (worker entry), pass **production** implementations (bind or direct references to the real functions from `_shared/utils/`)
        *   `[✅]`   `createJobContext`: map each new `JobContextParams` field to the root context object
        *   `[✅]`   `createExecuteJobContext`: copy each new field from `root` to the returned slice
    *   `[✅]`   `createJobContext.ts`
        *   `[✅]`   Extend `createJobContext` and `createExecuteJobContext` to include the new fields with the same explicit mapping style as existing entries
    *   `[✅]`   unit/`executeModelCallAndSave.test.ts` (mocks section)
        *   `[✅]`   Extend **`getMockDeps`** (and any parallel helpers) so returned **`IExecuteJobContext`** satisfies the extended interface: each new utility defaults to the **real** implementation from `_shared/utils/` unless a test replaces it with a `spy`
        *   `[✅]`   Document in a short comment that mocks mirror production wiring (reference real functions by default) so partial mocks do not silently drop new deps
    *   `[✅]`   provides/ — **EXCLUDED** (context is the boundary; no separate provides file)
    *   `[✅]`   integration/
        *   `[✅]`   **Deferred** to the EMCAS wiring node: full execute test suite green after `deps` calls replace inline code
    *   `[✅]`   `directionality`
        *   `[✅]`   Composition root → `IJobContext` → `createExecuteJobContext` → `executeModelCallAndSave`
        *   `[✅]`   All new dependencies inward-facing from EMCAS; implementations remain in `_shared/utils/`
    *   `[✅]`   `requirements`
        *   `[✅]`   No direct imports of the eight utilities from `executeModelCallAndSave.ts` — only `deps.<name>`
        *   `[✅]`   TypeScript: extended `IExecuteJobContext` is satisfied everywhere `createExecuteJobContext` is used
        *   `[✅]`   Factory tests and mock updates land **before or with** the EMCAS swap so the branch never has a half-wired context

*   `[✅]` dialectic-worker/`executeModelCallAndSave` **Wire extracted utilities into EMCAS — replace inline implementations with utility calls (`deps` / context slicer)**
    *   `[✅]` `objective`
        *   `[✅]` Replace eight inline implementations in `executeModelCallAndSave.ts` with calls to the extracted utilities invoked as `deps.<name>` on `IExecuteJobContext` (implementations wired at the composition root and supplied through `createJobContext` → `createExecuteJobContext`)
        *   `[✅]` This is a refactor-only change — no behavioral modifications, no new logic, no signature changes
        *   `[✅]` Proves behavior preservation by running all ~700 existing EMCAS tests without modification
        *   `[✅]` Includes the commit step for the entire Phase 0 body of work
    *   `[✅]` `role`
        *   `[✅]` Application orchestrator — `executeModelCallAndSave` is the monolith being incrementally decomposed
    *   `[✅]` `module`
        *   `[✅]` `dialectic-worker/executeModelCallAndSave.ts` — the existing 1,944-line function
        *   `[✅]` Boundary: function signature and behavior are unchanged; only internal implementation details change (inline code → utility calls)
    *   `[✅]` `deps`
        *   `[✅]` **Consumption in EMCAS:** from `deps` (`IExecuteJobContext`), which `processSimpleJob` supplies via **`createExecuteJobContext`**. Production implementations live in `_shared/utils/` and are bound at the worker composition root into `JobContextParams`.
        *   `[✅]` `deps.pickLatest` — implementation from `_shared/utils/pickLatest.ts` — replaces inline at lines ~225-234
        *   `[✅]` `deps.applyInputsRequiredScope` — from `_shared/utils/applyInputsRequiredScope.ts` — replaces inline at lines ~421-436
        *   `[✅]` `deps.validateWalletBalance` — from `_shared/utils/validateWalletBalance.ts` — replaces inline at lines ~509-513
        *   `[✅]` `deps.validateModelCostRates` — from `_shared/utils/validateModelCostRates.ts` — replaces inline at lines ~516-520
        *   `[✅]` `deps.resolveFinishReason` — from `_shared/utils/resolveFinishReason.ts` — replaces inline at lines ~1029-1034
        *   `[✅]` `deps.isIntermediateChunk` — from `_shared/utils/isIntermediateChunk.ts` — replaces inline gate at lines ~1053, ~1061
        *   `[✅]` `deps.determineContinuation` — from `_shared/utils/determineContinuation.ts` — replaces inline decision logic at lines ~1096-1164
        *   `[✅]` `deps.buildUploadContext` — from `_shared/utils/buildUploadContext.ts` — replaces inline at lines ~1325-1360
        *   `[✅]` All existing deps of `executeModelCallAndSave` remain unchanged
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Each replacement is a 1:1 swap: remove inline code, call `deps.<name>`
        *   `[✅]` No changes to the data flow or control flow of the function
    *   `[✅]` interface/ — EXCLUDED (no interface changes — function signature is unchanged)
    *   `[✅]` interface/tests/ — EXCLUDED (no new types)
    *   `[✅]` interface/guards/ — EXCLUDED (no new types)
    *   `[✅]` unit/ — EXCLUDED (no new unit tests — the ~700 existing tests across 17 test files serve as the behavior preservation proof)
    *   `[✅]` `construction`
        *   `[✅]` No changes to function construction — same signature, same params, same return
    *   `[✅]` `executeModelCallAndSave.ts`
        *   `[✅]` Replace `pickLatest` inline function (lines ~225-234) with `deps.pickLatest`
        *   `[✅]` Replace `applyInputsRequiredScope` inline function (lines ~421-436) with `deps.applyInputsRequiredScope`, passing `params.inputsRequired` as the second argument
        *   `[✅]` Replace wallet balance parsing/validation (lines ~509-513) with `deps.validateWalletBalance(walletBalanceStr, walletId)`
        *   `[✅]` Replace cost rate validation (lines ~516-520) with `deps.validateModelCostRates(extendedModelConfig.input_token_cost_rate, extendedModelConfig.output_token_cost_rate)`
        *   `[✅]` Replace finish_reason resolution (lines ~1029-1034) with `deps.resolveFinishReason(aiResponse)`
        *   `[✅]` Replace intermediate chunk gate (lines ~1053, ~1061) with `deps.isIntermediateChunk(resolvedFinish, job.payload.continueUntilComplete)`. Use the returned boolean to gate sanitization/parsing — if `true`, skip sanitize/parse
        *   `[✅]` Replace continuation decision logic (lines ~1096-1099, ~1127-1136, ~1138-1164) with `deps.determineContinuation(...)`, passing `finishReasonContinue: isDialecticContinueReason(resolvedFinish)` (same check `isIntermediateChunk` uses, no redundancy — the call site passes the boolean), `wasStructurallyFixed`, `parsedContent`, and remaining params. Use the returned `{ shouldContinue }` for continuation gating. Sanitization, JSON parsing, and retry I/O remain inline
        *   `[✅]` Replace `uploadContext` construction (lines ~1325-1360) with `deps.buildUploadContext(...)`, passing all the pre-resolved values
    *   `[✅]` provides/ — EXCLUDED (no changes to exports)
    *   `[✅]` mock — EXCLUDED (existing mocks in test files are not modified)
    *   `[✅]` integration/`executeModelCallAndSave` — all 17 existing test files
        *   `[✅]` Run all existing EMCAS test files to prove behavior preservation:
            *   `executeModelCallAndSave.test.ts`
            *   `executeModelCallAndSave.assembleDocument.test.ts`
            *   `executeModelCallAndSave.chunks.test.ts`
            *   `executeModelCallAndSave.continuationCount.test.ts`
            *   `executeModelCallAndSave.continue.test.ts`
            *   `executeModelCallAndSave.fragment.test.ts`
            *   `executeModelCallAndSave.gatherArtifacts.test.ts`
            *   `executeModelCallAndSave.jsonSanitizer.test.ts`
            *   `executeModelCallAndSave.notifications.test.ts`
            *   `executeModelCallAndSave.pathContext.test.ts`
            *   `executeModelCallAndSave.planValidation.test.ts`
            *   `executeModelCallAndSave.rag.test.ts`
            *   `executeModelCallAndSave.rag2.test.ts`
            *   `executeModelCallAndSave.rawJsonOnly.test.ts`
            *   `executeModelCallAndSave.render.test.ts`
            *   `executeModelCallAndSave.renderErrors.test.ts`
            *   `executeModelCallAndSave.tokens.test.ts`
        *   `[✅]` Zero test modifications allowed — if any test fails, the wiring is wrong and must be fixed
    *   `[✅]` `directionality`
        *   `[✅]` Layer: application orchestrator
        *   `[✅]` Utilities are inward-facing via **`IExecuteJobContext`** (sliced by `createExecuteJobContext`)
        *   `[✅]` Provides are unchanged — same function, same exports
    *   `[✅]` `requirements`
        *   `[✅]` Functional: exact behavioral parity — the function produces identical outputs for identical inputs
        *   `[✅]` Functional: no changes to function signature, parameter types, or return types
        *   `[✅]` Functional: the `isIntermediateChunk` + `determineContinuation` wiring is the most complex swap — `deps.isIntermediateChunk` is called first to gate sanitization, then `deps.determineContinuation` is called after sanitization with the pre-computed results including `finishReasonContinue` pass-through
        *   `[✅]` Acceptance: all ~700 existing tests across 17 files pass GREEN with zero modifications
        *   `[✅]` Acceptance: net line reduction in `executeModelCallAndSave.ts` (inline code replaced with `deps.*`)
    *   `[✅]`   **Commit** `refactor(BE): inject EMCAS pure utilities into IExecuteJobContext and wire factories`
        *   `[✅]`   `JobContext.interface.ts` — new fn types + extended `IExecuteJobContext` + `JobContextParams`
        *   `[✅]`   `createJobContext.ts` — forward new fields in root factory and execute slicer
        *   `[✅]`   Worker composition site — pass production implementations into `JobContextParams`
        *   `[✅]`   `createJobContext.test.ts` — factory/slicer coverage
        *   `[✅]`   `executeModelCallAndSave.test.ts` — `getMockDeps` extended defaults
    *   `[✅]` **Commit** `refactor(BE): extract pure utilities from executeModelCallAndSave`
        *   `[✅]` 8 new utility files under `_shared/utils/` (pickLatest, applyInputsRequiredScope, validateWalletBalance, validateModelCostRates, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext)
        *   `[✅]` 8 new test files under `_shared/utils/` (one per utility)
        *   `[✅]` `determineContinuation` interface, interface tests, interface guards, and mock files
        *   `[✅]` `isIntermediateChunk` has no interface files (two primitive arguments, boolean return)
        *   `[✅]` `validateModelCostRates` interface file
        *   `[✅]` `buildUploadContext` interface, interface tests, interface guards files
        *   `[✅]` `debitTokens.ts` and `debitTokens.test.ts` relocated from `chat/` to `_shared/services/`
        *   `[✅]` `TokenUsageSchema` relocated from `chat/zodSchema.ts` to `_shared/`
        *   `[✅]` `chat/index.ts` import path updated for `debitTokens`
        *   `[✅]` `executeModelCallAndSave.ts` refactored to use all 9 extracted utilities

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

---

#### Phase 1 — Detailed Implementation Nodes

*   `[✅]` _shared/ai_service/anthropic_adapter **Add `sendMessageStream()` to Anthropic adapter — owns `AdapterStreamChunk` type and `AiProviderAdapter` interface change** `[BE]`
    *   `[✅]` `objective`
        *   `[✅]` Expose the Anthropic SDK's existing internal stream (`this.client.messages.stream()`) to callers as an `AsyncGenerator<AdapterStreamChunk>` so that `executeModelCallAndSave` can accumulate content incrementally and implement soft-timeout checkpointing
        *   `[✅]` Define the `AdapterStreamChunk` discriminated union type used by all adapters
        *   `[✅]` Add `sendMessageStream()` to the `AiProviderAdapter` type contract so all adapters must implement it
        *   `[✅]` Existing `sendMessage()` remains unchanged — it is still used by the `chat/` browser SSE path
    *   `[✅]` `role`
        *   `[✅]` Adapter — translates provider-specific streaming events into a uniform application-level chunk type
    *   `[✅]` `module`
        *   `[✅]` AI service adapter layer (`_shared/ai_service/`)
        *   `[✅]` Boundary: receives a `ChatApiRequest` + model identifier, yields `AdapterStreamChunk` items, does NOT save or debit tokens
    *   `[✅]` `deps`
        *   `[✅]` `npm:@anthropic-ai/sdk` — Anthropic client SDK, provides `messages.stream()` which returns an async iterable of `RawMessageStreamEvent`
            *   Abstraction layer: adapter (wraps external infra)
            *   Direction: inward (adapter depends on external SDK)
            *   Context slice: `Anthropic` client instance (`this.client`), already injected via constructor
        *   `[✅]` `_shared/types.ts` — owns `AiProviderAdapter`, `ChatApiRequest`, `AdapterResponsePayload`, `FinishReason`, `AiModelExtendedConfig`
            *   Abstraction layer: domain types
            *   Direction: inward (adapter depends on domain types)
            *   Context slice: type imports only
        *   `[✅]` Confirm no reverse dependency is introduced — `types.ts` does not import from any adapter
    *   `[✅]` `context_slice`
        *   `[✅]` From constructor: `this.client` (Anthropic SDK instance), `this.logger` (ILogger), `this.modelConfig` (AiModelExtendedConfig)
        *   `[✅]` From caller: `request: ChatApiRequest`, `modelIdentifier: string` — same signature as existing `sendMessage()`
        *   `[✅]` Injection shape: class instance methods; no new constructor params needed
        *   `[✅]` Confirm no concrete imports from higher or lateral layers
    *   `[✅]` `_shared/types.ts`/interface
        *   `[✅]` Add `AdapterStreamChunk` — discriminated union with three variants:
            *   `{ type: 'text_delta'; text: string }` — incremental text content from the model
            *   `{ type: 'usage'; tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }` — token usage data emitted at end of stream
            *   `{ type: 'done'; finish_reason: FinishReason }` — signals stream completion with the standardized finish reason
        *   `[✅]` Add `sendMessageStream` to the `AiProviderAdapter` type (line 250-263 of `types.ts`). Current type is `export type AiProviderAdapter = new (...) => { sendMessage(...): Promise<AdapterResponsePayload>; listModels(): ...; getEmbedding?(...): ... }`. Add: `sendMessageStream(request: ChatApiRequest, modelIdentifier: string): AsyncGenerator<AdapterStreamChunk>;`
    *   `[✅]` `_shared/types.ts`/interface tests — `_shared/utils/type-guards/type_guards.adapterStreamChunk.test.ts`
        *   `[✅]` Test that a valid `text_delta` chunk passes the `isAdapterStreamChunk` guard
        *   `[✅]` Test that a valid `usage` chunk passes the guard
        *   `[✅]` Test that a valid `done` chunk passes the guard
        *   `[✅]` Test that an object missing `type` fails the guard
        *   `[✅]` Test that an object with an unknown `type` string fails the guard
        *   `[✅]` Test that a `text_delta` with non-string `text` fails the guard
        *   `[✅]` Test that a `usage` chunk with missing `tokenUsage` fields fails the guard
        *   `[✅]` Test that a `done` chunk with invalid `finish_reason` fails the guard
    *   `[✅]` `_shared/utils/type-guards/type_guards.adapterStreamChunk.ts`/interface guards
        *   `[✅]` `isAdapterStreamChunk(value: unknown): value is AdapterStreamChunk` — validates discriminated union by checking `type` field and variant-specific properties
        *   `[✅]` `isTextDeltaChunk(value: unknown): value is AdapterStreamChunk & { type: 'text_delta' }` — narrowing guard for text delta variant
        *   `[✅]` `isUsageChunk(value: unknown): value is AdapterStreamChunk & { type: 'usage' }` — narrowing guard for usage variant
        *   `[✅]` `isDoneChunk(value: unknown): value is AdapterStreamChunk & { type: 'done' }` — narrowing guard for done variant
    *   `[✅]` unit/`anthropic_adapter.test.ts`
        *   `[✅]` Test: `sendMessageStream` yields `text_delta` chunks containing the streamed text from Anthropic SDK's `content_block_delta` events
        *   `[✅]` Test: `sendMessageStream` yields a `usage` chunk with `prompt_tokens`, `completion_tokens`, `total_tokens` derived from `stream.finalMessage().usage`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'stop'` when Anthropic `stop_reason` is `'end_turn'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'length'` when Anthropic `stop_reason` is `'max_tokens'`
        *   `[✅]` Test: `sendMessageStream` throws on empty message history (same validation as `sendMessage`)
        *   `[✅]` Test: `sendMessageStream` throws on Anthropic API error (wraps `Anthropic.APIError`)
        *   `[✅]` Test: `sendMessageStream` applies the same message formatting (system prompt extraction, consecutive-role merging, alternating-role enforcement) as `sendMessage` — verify by checking the SDK call args
        *   `[✅]` Test: `sendMessageStream` respects `max_tokens` from request or model config, same logic as `sendMessage` lines 148-159
    *   `[✅]` `construction`
        *   `[✅]` No new constructors — `sendMessageStream` is an instance method on the existing `AnthropicAdapter` class
        *   `[✅]` Prohibited: standalone function construction — must be a class method to access `this.client`, `this.logger`, `this.modelConfig`
        *   `[✅]` Completeness: method must be added to the class AND to the `AiProviderAdapter` type contract in `types.ts`
    *   `[✅]` `anthropic_adapter.ts`
        *   `[✅]` Add `async *sendMessageStream(request: ChatApiRequest, modelIdentifier: string): AsyncGenerator<AdapterStreamChunk>` method
        *   `[✅]` Reuse the existing message preparation logic from `sendMessage` (lines 56-165): system prompt extraction, message merging, alternating role enforcement, resource document injection, max_tokens calculation. Extract to a private helper `_prepareAnthropicRequest` to avoid duplication, or inline if the duplication is minimal enough to keep in one file
        *   `[✅]` Create the stream via `this.client.messages.stream({ model, system, messages, max_tokens })` — same as `sendMessage` line 160
        *   `[✅]` Iterate the stream: for each `content_block_delta` event with `delta.type === 'text_delta'`, yield `{ type: 'text_delta', text: event.delta.text }`
        *   `[✅]` After stream iteration completes, call `await stream.finalMessage()` to get the final response
        *   `[✅]` Yield `{ type: 'usage', tokenUsage: { prompt_tokens: response.usage.input_tokens, completion_tokens: response.usage.output_tokens, total_tokens: input + output } }`
        *   `[✅]` Map `response.stop_reason` to `FinishReason` using the same switch logic as `sendMessage` lines 194-211
        *   `[✅]` Yield `{ type: 'done', finish_reason: mappedFinishReason }`
        *   `[✅]` Wrap in try/catch with the same Anthropic.APIError handling as `sendMessage` lines 223-234
    *   `[✅]` provides/`anthropic_adapter.ts`
        *   `[✅]` Exports `AnthropicAdapter` class (existing) — now with both `sendMessage()` and `sendMessageStream()` methods
        *   `[✅]` Semantic guarantee: `sendMessageStream` yields at minimum one `done` chunk on success; throws on API or validation errors before yielding
        *   `[✅]` Stability: `sendMessage` behavior is unchanged — existing callers (chat path) are not affected
    *   `[✅]` mock — no separate mock file needed for anthropic_adapter; tests stub `this.client.messages.stream` directly (existing pattern in `anthropic_adapter.test.ts`)
    *   `[✅]` integration — deferred; anthropic_adapter is a leaf adapter with no downstream consumers yet (consumers are wired in later nodes)
    *   `[✅]` `directionality`
        *   `[✅]` Layer: adapter
        *   `[✅]` All dependencies are inward-facing (SDK, domain types)
        *   `[✅]` All provides are outward-facing (exposes stream interface to worker layer)
    *   `[✅]` `requirements`
        *   `[✅]` `sendMessageStream` must yield `text_delta` chunks for every content delta from the Anthropic stream
        *   `[✅]` `sendMessageStream` must yield exactly one `usage` chunk and exactly one `done` chunk per call, in that order, after all `text_delta` chunks
        *   `[✅]` `sendMessageStream` must apply identical message validation and formatting as `sendMessage` — a request valid for `sendMessage` must be valid for `sendMessageStream` and vice versa
        *   `[✅]` `AdapterStreamChunk` type must be a discriminated union on `type` field, importable from `_shared/types.ts`
        *   `[✅]` `AiProviderAdapter` type contract must include `sendMessageStream` so that all adapter classes are required to implement it
        *   `[✅]` No changes to `sendMessage`, `listModels`, `getEmbedding`, or constructor
        *   `[✅]` Type guard `isAdapterStreamChunk` and variant guards must be available for downstream consumers

*   `[✅]` _shared/ai_service/openai_adapter **Add `sendMessageStream()` to OpenAI adapter** `[BE]`
    *   `[✅]` `objective`
        *   `[✅]` Expose the OpenAI SDK's streaming response (already used internally by `sendMessage`) as an `AsyncGenerator<AdapterStreamChunk>` so `executeModelCallAndSave` can accumulate content incrementally
        *   `[✅]` Existing `sendMessage()` remains unchanged
    *   `[✅]` `role`
        *   `[✅]` Adapter — translates OpenAI-specific streaming `ChatCompletionChunk` events into uniform `AdapterStreamChunk` items
    *   `[✅]` `module`
        *   `[✅]` AI service adapter layer (`_shared/ai_service/`)
        *   `[✅]` Boundary: receives `ChatApiRequest` + model identifier, yields `AdapterStreamChunk` items, does NOT save or debit tokens
    *   `[✅]` `deps`
        *   `[✅]` `npm:openai` — OpenAI client SDK, provides `chat.completions.create()` with `stream: true` returning async iterable of `ChatCompletionChunk`
            *   Abstraction layer: adapter (wraps external infra)
            *   Direction: inward (adapter depends on external SDK)
            *   Context slice: `this.client` (OpenAI instance), already injected via constructor
        *   `[✅]` `_shared/types.ts` — owns `AiProviderAdapter`, `ChatApiRequest`, `AdapterStreamChunk`, `FinishReason`, `AiModelExtendedConfig`
            *   Abstraction layer: domain types
            *   Direction: inward (adapter depends on domain types)
            *   Context slice: type imports only
        *   `[✅]` Depends on prior node: `AdapterStreamChunk` type and updated `AiProviderAdapter` contract from the anthropic_adapter node
    *   `[✅]` `context_slice`
        *   `[✅]` From constructor: `this.client` (OpenAI SDK instance), `this.logger` (ILogger), `this.modelConfig` (AiModelExtendedConfig)
        *   `[✅]` From caller: `request: ChatApiRequest`, `modelIdentifier: string` — same signature as existing `sendMessage()`
        *   `[✅]` Injection shape: class instance methods; no new constructor params needed
    *   `[✅]` interface — no new interface changes; `sendMessageStream` was added to `AiProviderAdapter` in the anthropic_adapter node. This node implements that contract.
    *   `[✅]` interface tests — covered by the anthropic_adapter node's type guard tests for `AdapterStreamChunk`
    *   `[✅]` interface guards — covered by the anthropic_adapter node's `isAdapterStreamChunk` and variant guards
    *   `[✅]` unit/`openai_adapter.test.ts`
        *   `[✅]` Test: `sendMessageStream` yields `text_delta` chunks for each `ChatCompletionChunk` with `choices[0].delta.content` present
        *   `[✅]` Test: `sendMessageStream` yields a `usage` chunk with `prompt_tokens`, `completion_tokens`, `total_tokens` from the stream's final chunk (the chunk where `chunk.usage != null`, enabled by `stream_options: { include_usage: true }`)
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'stop'` when OpenAI `finish_reason` is `'stop'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'length'` when OpenAI `finish_reason` is `'length'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'content_filter'` when OpenAI `finish_reason` is `'content_filter'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'unknown'` for unrecognized finish reasons
        *   `[✅]` Test: `sendMessageStream` throws on OpenAI API error (wraps `OpenAI.APIError`)
        *   `[✅]` Test: `sendMessageStream` applies the same message formatting as `sendMessage` — model name stripping (`openai-` prefix removal), resource document injection, max_tokens/max_completion_tokens selection based on model name
        *   `[✅]` Test: `sendMessageStream` throws when usage data is missing from the stream (no chunk with `usage != null`)
    *   `[✅]` `construction`
        *   `[✅]` No new constructors — `sendMessageStream` is an instance method on the existing `OpenAiAdapter` class
        *   `[✅]` Prohibited: standalone function construction — must be a class method to access `this.client`, `this.logger`, `this.modelConfig`
    *   `[✅]` `openai_adapter.ts`
        *   `[✅]` Add `async *sendMessageStream(request: ChatApiRequest, modelIdentifier: string): AsyncGenerator<AdapterStreamChunk>` method
        *   `[✅]` Reuse the existing message preparation logic from `sendMessage` (lines 39-112): model name stripping, model mismatch check, message mapping, resource document injection, payload construction with `stream: true` and `stream_options: { include_usage: true }`, max_tokens/max_completion_tokens cap logic
        *   `[✅]` Extract shared prep to a private helper `_prepareOpenAiPayload` to avoid duplication, or inline if minimal
        *   `[✅]` Create the stream via `await this.client.chat.completions.create(payload)` — same call as `sendMessage` line 117
        *   `[✅]` Iterate the stream: for each `ChatCompletionChunk`, check `chunk.choices?.[0]?.delta?.content` — if string, yield `{ type: 'text_delta', text: deltaContent }`
        *   `[✅]` Track `finish_reason` from `chunk.choices?.[0]?.finish_reason` when not null (same as `sendMessage` lines 130-131)
        *   `[✅]` Track `usage` from `chunk.usage` when not null (same as `sendMessage` lines 134-136)
        *   `[✅]` After stream iteration, validate usage data exists (same check as `sendMessage` lines 175-178) — throw if missing
        *   `[✅]` Yield `{ type: 'usage', tokenUsage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens } }`
        *   `[✅]` Map `finish_reason` using same switch as `sendMessage` lines 149-171: `'stop'`→`'stop'`, `'length'`→`'length'`, `'tool_calls'`→`'tool_calls'`, `'content_filter'`→`'content_filter'`, `'function_call'`→`'function_call'`, default→`'unknown'`
        *   `[✅]` Yield `{ type: 'done', finish_reason: mappedFinishReason }`
        *   `[✅]` Wrap in try/catch with same `OpenAI.APIError` handling as `sendMessage` lines 195-204
    *   `[✅]` provides/`openai_adapter.ts`
        *   `[✅]` Exports `OpenAiAdapter` class (existing) — now with both `sendMessage()` and `sendMessageStream()` methods
        *   `[✅]` Semantic guarantee: `sendMessageStream` yields at minimum one `done` chunk on success; throws on API, validation, or missing-usage errors before yielding
        *   `[✅]` Stability: `sendMessage` behavior is unchanged
    *   `[✅]` mock — no separate mock file needed; tests stub `this.client.chat.completions.create` directly (existing pattern in `openai_adapter.test.ts`)
    *   `[✅]` integration — deferred; openai_adapter is a leaf adapter with no downstream consumers yet
    *   `[✅]` `directionality`
        *   `[✅]` Layer: adapter
        *   `[✅]` All dependencies are inward-facing (SDK, domain types)
        *   `[✅]` All provides are outward-facing (exposes stream interface to worker layer)
    *   `[✅]` `requirements`
        *   `[✅]` `sendMessageStream` must yield `text_delta` chunks for every content delta from the OpenAI stream
        *   `[✅]` `sendMessageStream` must yield exactly one `usage` chunk and exactly one `done` chunk per call, in that order, after all `text_delta` chunks
        *   `[✅]` `sendMessageStream` must apply identical message preparation and max_tokens logic as `sendMessage` — including the `usesLegacyMaxTokens` check for `gpt-3.5-turbo`/`gpt-4-turbo`/`gpt-4` models (line 90)
        *   `[✅]` `sendMessageStream` must request `stream_options: { include_usage: true }` so that token usage is available in the stream
        *   `[✅]` `sendMessageStream` must throw if usage data is not present in the stream response
        *   `[✅]` No changes to `sendMessage`, `listModels`, `getEmbedding`, or constructor

*   `[✅]` _shared/ai_service/google_adapter **Add `sendMessageStream()` to Google adapter** `[BE]`
    *   `[✅]` `objective`
        *   `[✅]` Expose the Google Gemini SDK's streaming response (already used internally by `sendMessage` via `chat.sendMessageStream()`) as an `AsyncGenerator<AdapterStreamChunk>` so `executeModelCallAndSave` can accumulate content incrementally
        *   `[✅]` Existing `sendMessage()` remains unchanged
    *   `[✅]` `role`
        *   `[✅]` Adapter — translates Google-specific streaming `GenerateContentResponse` chunks into uniform `AdapterStreamChunk` items
    *   `[✅]` `module`
        *   `[✅]` AI service adapter layer (`_shared/ai_service/`)
        *   `[✅]` Boundary: receives `ChatApiRequest` + model identifier, yields `AdapterStreamChunk` items, does NOT save or debit tokens
    *   `[✅]` `deps`
        *   `[✅]` `npm:@google/generative-ai` — Google Generative AI SDK, provides `chat.sendMessageStream()` returning `GenerateContentStreamResult` with `.stream` (async iterable of `GenerateContentResponse`) and `.response` (final `EnhancedGenerateContentResponse`)
            *   Abstraction layer: adapter (wraps external infra)
            *   Direction: inward (adapter depends on external SDK)
            *   Context slice: `this.client` (GoogleGenerativeAI instance), already injected via constructor
        *   `[✅]` `_shared/types.ts` — owns `AiProviderAdapter`, `ChatApiRequest`, `AdapterStreamChunk`, `FinishReason`, `AiModelExtendedConfig`
            *   Abstraction layer: domain types
            *   Direction: inward (adapter depends on domain types)
            *   Context slice: type imports only
        *   `[✅]` Depends on prior nodes: `AdapterStreamChunk` type and updated `AiProviderAdapter` contract from the anthropic_adapter node
    *   `[✅]` `context_slice`
        *   `[✅]` From constructor: `this.client` (GoogleGenerativeAI instance), `this.logger` (ILogger), `this.modelConfig` (AiModelExtendedConfig), `this.apiKey` (string)
        *   `[✅]` From caller: `request: ChatApiRequest`, `modelIdentifier: string` — same signature as existing `sendMessage()`
        *   `[✅]` Injection shape: class instance methods; no new constructor params needed
    *   `[✅]` interface — no new interface changes; `sendMessageStream` was added to `AiProviderAdapter` in the anthropic_adapter node. This node implements that contract.
    *   `[✅]` interface tests — covered by the anthropic_adapter node's type guard tests for `AdapterStreamChunk`
    *   `[✅]` interface guards — covered by the anthropic_adapter node's `isAdapterStreamChunk` and variant guards
    *   `[✅]` unit/`google_adapter.test.ts`
        *   `[✅]` Test: `sendMessageStream` yields `text_delta` chunks for each `GenerateContentResponse` chunk in the stream where `candidates[0].content.parts[0].text` is present
        *   `[✅]` Test: `sendMessageStream` yields a `usage` chunk with `prompt_tokens`, `completion_tokens`, `total_tokens` derived from `response.usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`)
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'stop'` when Google `finishReason` is `'STOP'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'length'` when Google `finishReason` is `'MAX_TOKENS'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'content_filter'` when Google `finishReason` is `'SAFETY'` or `'RECITATION'`
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'unknown'` for unrecognized finish reasons
        *   `[✅]` Test: `sendMessageStream` throws when message history does not end with a user message (same validation as `sendMessage` lines 83-87)
        *   `[✅]` Test: `sendMessageStream` throws when the stream itself throws an error (existing error propagation pattern at `sendMessage` lines 117-122)
        *   `[✅]` Test: `sendMessageStream` applies the same message formatting as `sendMessage` — model name stripping (`google-` prefix removal), system message filtering, `assistant`→`model` role mapping, resource document injection as parts, `maxOutputTokens` cap from request or model config
    *   `[✅]` `construction`
        *   `[✅]` No new constructors — `sendMessageStream` is an instance method on the existing `GoogleAdapter` class
        *   `[✅]` Prohibited: standalone function construction — must be a class method to access `this.client`, `this.logger`, `this.modelConfig`
    *   `[✅]` `google_adapter.ts`
        *   `[✅]` Add `async *sendMessageStream(request: ChatApiRequest, modelIdentifier: string): AsyncGenerator<AdapterStreamChunk>` method
        *   `[✅]` Reuse the existing message preparation logic from `sendMessage` (lines 51-111): model name stripping, message mapping (system filtered, user→user, assistant→model), history/lastMessage split, validation that last message is user role, `model.startChat()` with history and `generationConfig.maxOutputTokens` cap, resource document injection into `finalParts`
        *   `[✅]` Extract shared prep to a private helper `_prepareGoogleChat` to avoid duplication, or inline if minimal
        *   `[✅]` Create the stream via `await chat.sendMessageStream(finalParts)` — same call as `sendMessage` line 112
        *   `[✅]` Iterate `streamResult.stream`: for each `GenerateContentResponse` chunk, extract text from `chunk.candidates?.[0]?.content?.parts?.[0]?.text` — if present, yield `{ type: 'text_delta', text: chunkText }`
        *   `[✅]` After stream iteration completes, call `await streamResult.response` to get the `EnhancedGenerateContentResponse`
        *   `[✅]` Extract usage from `response.usageMetadata`: yield `{ type: 'usage', tokenUsage: { prompt_tokens: usageMetadata.promptTokenCount || 0, completion_tokens: usageMetadata.candidatesTokenCount || 0, total_tokens: usageMetadata.totalTokenCount || 0 } }`
        *   `[✅]` Map `response.candidates?.[0]?.finishReason` using the same switch as `sendMessage` lines 148-164: `'STOP'`→`'stop'`, `'MAX_TOKENS'`→`'length'`, `'SAFETY'`/`'RECITATION'`→`'content_filter'`, default→`'unknown'`
        *   `[✅]` Yield `{ type: 'done', finish_reason: mappedFinishReason }`
        *   `[✅]` Wrap stream iteration in try/catch with the same error re-throw pattern as `sendMessage` lines 117-122
    *   `[✅]` provides/`google_adapter.ts`
        *   `[✅]` Exports `GoogleAdapter` class (existing) — now with both `sendMessage()` and `sendMessageStream()` methods
        *   `[✅]` Semantic guarantee: `sendMessageStream` yields at minimum one `done` chunk on success; throws on validation or stream errors before yielding
        *   `[✅]` Stability: `sendMessage` behavior is unchanged
    *   `[✅]` mock — no separate mock file needed; tests stub `chat.sendMessageStream` via the mock pattern already established in `google_adapter.test.ts` (mocking `getGenerativeModel` to return a mock model with `startChat` returning a mock chat)
    *   `[✅]` integration — deferred; google_adapter is a leaf adapter with no downstream consumers yet
    *   `[✅]` `directionality`
        *   `[✅]` Layer: adapter
        *   `[✅]` All dependencies are inward-facing (SDK, domain types)
        *   `[✅]` All provides are outward-facing (exposes stream interface to worker layer)
    *   `[✅]` `requirements`
        *   `[✅]` `sendMessageStream` must yield `text_delta` chunks for every content part from each Google stream chunk
        *   `[✅]` `sendMessageStream` must yield exactly one `usage` chunk and exactly one `done` chunk per call, in that order, after all `text_delta` chunks
        *   `[✅]` `sendMessageStream` must apply identical message preparation, validation, and maxOutputTokens logic as `sendMessage`
        *   `[✅]` `sendMessageStream` must throw if message history does not end with a user message
        *   `[✅]` No changes to `sendMessage`, `listModels`, or constructor

*   `[✅]` _shared/ai_service/dummy_adapter **Add `sendMessageStream()` stub to DummyAdapter; update factory.test.ts mock adapter — last adapter node** `[BE]`
    *   `[✅]` `objective`
        *   `[✅]` Implement `sendMessageStream()` on `DummyAdapter` as a deterministic stub that yields echo-based chunks — required because `DummyAdapter` is production code (present in `defaultProviderMap` in `factory.ts`) and the `AiProviderAdapter` type contract now requires it
        *   `[✅]` Update the `CapturingDummyAdapter` mock class in `factory.test.ts` (line 115-129) to include a `sendMessageStream` stub so that factory tests continue to satisfy the `AiProviderAdapter` contract
        *   `[✅]` Verify all factory tests still pass after this node — this is the final adapter node
    *   `[✅]` `role`
        *   `[✅]` Adapter — test/development adapter that simulates streaming without any external service
    *   `[✅]` `module`
        *   `[✅]` AI service adapter layer (`_shared/ai_service/`)
        *   `[✅]` Boundary: receives `ChatApiRequest` + model identifier, yields `AdapterStreamChunk` items deterministically without network calls
    *   `[✅]` `deps`
        *   `[✅]` `_shared/types.ts` — owns `AiProviderAdapter`, `ChatApiRequest`, `AdapterStreamChunk`, `FinishReason`, `AiModelExtendedConfig`
            *   Abstraction layer: domain types
            *   Direction: inward (adapter depends on domain types)
            *   Context slice: type imports only
        *   `[✅]` `_shared/utils/tokenizer_utils.ts` — `countTokens` function (already imported by `DummyAdapter`)
            *   Abstraction layer: utility
            *   Direction: inward
            *   Context slice: used for token counting in usage chunk
        *   `[✅]` Depends on prior nodes: `AdapterStreamChunk` type and updated `AiProviderAdapter` contract from the anthropic_adapter node
    *   `[✅]` `context_slice`
        *   `[✅]` From constructor: `this.logger` (ILogger), `this.modelConfig` (AiModelExtendedConfig), `this.providerId` (string)
        *   `[✅]` From caller: `request: ChatApiRequest`, `modelIdentifier: string`
        *   `[✅]` Injection shape: class instance method; no new constructor params needed
    *   `[✅]` interface — no new interface changes; `sendMessageStream` was added to `AiProviderAdapter` in the anthropic_adapter node
    *   `[✅]` interface tests — covered by the anthropic_adapter node's type guard tests for `AdapterStreamChunk`
    *   `[✅]` interface guards — covered by the anthropic_adapter node
    *   `[✅]` unit/`dummy_adapter.test.ts`
        *   `[✅]` Test: `sendMessageStream` yields a single `text_delta` chunk containing the echo text (same format as `sendMessage` — `"Echo from {modelIdentifier}: {message}"`)
        *   `[✅]` Test: `sendMessageStream` yields a `usage` chunk with `prompt_tokens`, `completion_tokens`, `total_tokens` calculated by the `countTokens` utility (same as `sendMessage`'s `createResponse` logic at lines 190-210)
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'stop'` for normal messages
        *   `[✅]` Test: `sendMessageStream` yields a `done` chunk with `finish_reason: 'max_tokens'` when message contains `SIMULATE_MAX_TOKENS`
        *   `[✅]` Test: `sendMessageStream` throws when message contains `SIMULATE_ERROR` (same behavior as `sendMessage` lines 97-100)
    *   `[✅]` unit/`factory.test.ts` — mock adapter update
        *   `[✅]` Test: verify `factory.test.ts` still passes after updating `CapturingDummyAdapter` (line 115-129) to include `sendMessageStream` — add `async *sendMessageStream(): AsyncGenerator<AdapterStreamChunk> { throw new Error("Method not implemented."); }` stub to the class
    *   `[✅]` `construction`
        *   `[✅]` No new constructors — `sendMessageStream` is an instance method on the existing `DummyAdapter` class
        *   `[✅]` `CapturingDummyAdapter` in `factory.test.ts` gets a matching stub method
    *   `[✅]` `dummy_adapter.ts`
        *   `[✅]` Add `import type { AdapterStreamChunk } from '../types.ts'` to existing import line
        *   `[✅]` Add `async *sendMessageStream(request: ChatApiRequest, modelIdentifier: string): AsyncGenerator<AdapterStreamChunk>` method
        *   `[✅]` Compute echo content using same logic as `sendMessage`: check for `SIMULATE_ERROR` (throw), `SIMULATE_MAX_TOKENS` (set finish_reason to `'max_tokens'`, modify content), otherwise `"Echo from {modelIdentifier}: {message}"` with finish_reason `'stop'`
        *   `[✅]` Yield single `{ type: 'text_delta', text: content }` — DummyAdapter has no real stream, so one delta chunk containing the full echo is sufficient
        *   `[✅]` Compute token usage using `countTokens` + `createResponse` pattern (lines 190-210): `promptTokens` from request, `completionTokens` from content
        *   `[✅]` Yield `{ type: 'usage', tokenUsage: { prompt_tokens, completion_tokens, total_tokens: prompt + completion } }`
        *   `[✅]` Yield `{ type: 'done', finish_reason: finishReason }`
    *   `[✅]` `factory.test.ts`
        *   `[✅]` Update `CapturingDummyAdapter` class (line 115-129) to add `async *sendMessageStream` stub method that throws `"Method not implemented."` — matches the existing pattern of `sendMessage` and `listModels` stubs in that class
    *   `[✅]` provides/`dummy_adapter.ts`
        *   `[✅]` Exports `DummyAdapter` class (existing) — now with both `sendMessage()` and `sendMessageStream()` methods
        *   `[✅]` Semantic guarantee: `sendMessageStream` yields deterministic echo-based chunks without network calls; throws on `SIMULATE_ERROR`
        *   `[✅]` Stability: `sendMessage` behavior is unchanged
    *   `[✅]` mock — no separate mock file needed
    *   `[✅]` integration — run `factory.test.ts` to confirm all factory tests pass with updated type contract. This is the final adapter node — all four adapters now implement `sendMessageStream()`.
    *   `[✅]` `directionality`
        *   `[✅]` Layer: adapter
        *   `[✅]` All dependencies are inward-facing (domain types, utilities)
        *   `[✅]` All provides are outward-facing (exposes stream interface to worker layer)
    *   `[✅]` `requirements`
        *   `[✅]` `sendMessageStream` must yield at least one `text_delta`, one `usage`, and one `done` chunk for successful calls
        *   `[✅]` `sendMessageStream` must respect `SIMULATE_ERROR` and `SIMULATE_MAX_TOKENS` keywords identically to `sendMessage`
        *   `[✅]` `CapturingDummyAdapter` in `factory.test.ts` must include `sendMessageStream` stub to satisfy the `AiProviderAdapter` type contract
        *   `[✅]` All existing `factory.test.ts` tests must continue to pass
        *   `[✅]` No changes to `sendMessage`, `listModels`, `getEmbedding`, or constructor

*   `[✅]` dialectic-worker/enqueueRenderJob **NEW FILE — Copy Zone H (~274 lines) from intact EMCAS. Extraction only — EMCAS unchanged.** `[BE]`
    *   `[✅]` `objective`
        *   `[✅]` Create `enqueueRenderJob.ts` by copying Zone H from `executeModelCallAndSave.ts` (lines ~1399-1673) into a standalone pure function
        *   `[✅]` Zone H encompasses: the `shouldEnqueueRenderJob` decision, render payload validation and construction (documentKey, documentIdentity, sourceContributionId, template_filename extraction from recipe steps), RENDER job DB insert with idempotency handling (23505 duplicate detection), and post-insert logging
        *   `[✅]` This is a COPY-OUT extraction: `executeModelCallAndSave.ts` is NOT modified in this node — Zone H remains in place. The slim operation happens in a later node.
        *   `[✅]` Define the `EnqueueRenderJobParams` interface for all inputs Zone H currently reads from surrounding scope
        *   `[✅]` Define the `EnqueueRenderJobDeps` interface for all injected dependencies (dbClient, logger, shouldEnqueueRenderJob, notificationService)
    *   `[✅]` `role`
        *   `[✅]` Pure utility — conditionally creates and inserts a RENDER job into the `dialectic_generation_jobs` table based on output type analysis
    *   `[✅]` `module`
        *   `[✅]` Dialectic worker (`dialectic-worker/`)
        *   `[✅]` Boundary: receives validated contribution data + job metadata, conditionally inserts a RENDER job row, returns void. Does NOT call the model, does NOT save contributions.
    *   `[✅]` `deps`
        *   `[✅]` `dbClient: SupabaseClient<Database>` — for RENDER job insert and idempotency lookups
            *   Abstraction layer: infrastructure (DB access)
            *   Direction: inward (utility depends on infra)
            *   Context slice: `dialectic_generation_jobs` table insert/select, `dialectic_stages` select, `dialectic_stage_recipe_instances` select, `dialectic_stage_recipe_steps` / `dialectic_recipe_template_steps` select
        *   `[✅]` `logger: ILogger` — for info/error logging
            *   Abstraction layer: infrastructure
            *   Direction: inward
        *   `[✅]` `shouldEnqueueRenderJob: ShouldEnqueueRenderJobFn` — determines if output type requires rendering
            *   Abstraction layer: domain utility (already defined in `_shared/types/shouldEnqueueRenderJob.interface.ts`)
            *   Direction: inward
        *   `[✅]` `_shared/utils/errors.ts` — `RenderJobValidationError`, `RenderJobEnqueueError` error classes
            *   Abstraction layer: domain types
            *   Direction: inward
        *   `[✅]` `_shared/types/shouldEnqueueRenderJob.interface.ts` — `ShouldEnqueueRenderJobFn`, `ShouldEnqueueRenderJobDeps`, `ShouldEnqueueRenderJobParams`
            *   Abstraction layer: domain types
            *   Direction: inward
        *   `[✅]` `_shared/types.ts` — `DialecticRenderJobPayload`, `isDialecticRenderJobPayload`
            *   Abstraction layer: domain types
            *   Direction: inward
        *   `[✅]` `_shared/utils/type_guards.ts` — `isJson`, `isRecord`, `isFileType`
            *   Abstraction layer: domain utilities
            *   Direction: inward
    *   `[✅]` `context_slice`
        *   `[✅]` All data currently read from enclosing scope in Zone H must become explicit params or payload fields:
        *   `[✅]` **Params** (job context and identifiers):
            *   `jobId: string` — the EXECUTE job ID (used for idempotency key `${jobId}_render` and parent_job_id)
            *   `sessionId: string` — from `job.session_id`
            *   `stageSlug: string` — from job payload
            *   `iterationNumber: number` — from job payload
            *   `outputType: string` — the `output_type` from job payload
            *   `projectId: string` — project identifier
            *   `projectOwnerUserId: string` — for the RENDER job's `user_id`
            *   `userAuthToken: string` — JWT for the RENDER job payload
            *   `modelId: string` — model ID for the RENDER job payload
            *   `walletId: string` — wallet ID for the RENDER job payload
            *   `isTestJob: boolean` — from `job.is_test_job`
        *   `[✅]` **Payload** (contribution-derived data from EMCAS result):
            *   `contributionId: string` — the saved contribution's ID
            *   `needsContinuation: boolean` — if true, skip render entirely
            *   `documentKey: string | undefined` — the document key for the output
            *   `stageRelationshipForStage: string | undefined` — the `document_relationships[stageSlug]` value, already persisted
            *   `fileType: string` — the resolved file type
            *   `storageFileType: string` — for logging only
        *   `[✅]` Injection shape: deps object + params object + payload object, all passed to top-level function
    *   `[✅]` `enqueueRenderJob.interface.ts`/interface
        *   `[✅]` `EnqueueRenderJobDeps` — interface containing: `dbClient`, `logger`, `shouldEnqueueRenderJob`
        *   `[✅]` `EnqueueRenderJobParams` — per-call identifiers and job context: `jobId`, `sessionId`, `stageSlug`, `iterationNumber`, `outputType`, `projectId`, `projectOwnerUserId`, `userAuthToken`, `modelId`, `walletId`, `isTestJob`
        *   `[✅]` `EnqueueRenderJobPayload` — contribution-derived data from EMCAS result: `contributionId`, `needsContinuation`, `documentKey`, `stageRelationshipForStage`, `fileType`, `storageFileType`
        *   `[✅]` `EnqueueRenderJobReturn` = `EnqueueRenderJobSuccessReturn | EnqueueRenderJobErrorReturn`
            *   `[✅]` `EnqueueRenderJobSuccessReturn`: `{ renderJobId: string | null }` — string when a RENDER job was enqueued (the inserted or recovered row ID is proof of success), null when render was legitimately skipped (`needsContinuation` true or `is_json`)
            *   `[✅]` `EnqueueRenderJobErrorReturn`: `{ error: RenderJobValidationError | RenderJobEnqueueError, retriable: boolean }` — error classification for retry/fail handling
        *   `[✅]` `EnqueueRenderJobFn` — function type: `(deps: EnqueueRenderJobDeps, params: EnqueueRenderJobParams, payload: EnqueueRenderJobPayload) => Promise<EnqueueRenderJobReturn>`
    *   `[✅]` `enqueueRenderJob.interface.test.ts`/interface tests
        *   `[✅]` Test: `EnqueueRenderJobDeps` interface accepts a valid deps object with dbClient, logger, shouldEnqueueRenderJob
        *   `[✅]` Test: `EnqueueRenderJobParams` interface accepts a valid params object with all job context fields
        *   `[✅]` Test: `EnqueueRenderJobPayload` interface accepts a valid payload object with all contribution-derived fields
        *   `[✅]` Test: `EnqueueRenderJobSuccessReturn` interface accepts `{ renderJobId: string }` and `{ renderJobId: null }`
        *   `[✅]` Test: `EnqueueRenderJobErrorReturn` interface accepts a valid error return object
        *   `[✅]` Test: compile-time type safety — missing required fields on deps, params, or payload produce type errors
    *   `[✅]` `type-guards/enqueueRenderJob.type_guards.ts`/interface guards
        *   `[✅]` `isEnqueueRenderJobDeps(value: unknown): value is EnqueueRenderJobDeps` — validates deps shape
        *   `[✅]` `isEnqueueRenderJobParams(value: unknown): value is EnqueueRenderJobParams` — validates all job context fields present and correctly typed
        *   `[✅]` `isEnqueueRenderJobPayload(value: unknown): value is EnqueueRenderJobPayload` — validates all contribution-derived fields present and correctly typed
        *   `[✅]` `isEnqueueRenderJobSuccessReturn(value: unknown): value is EnqueueRenderJobSuccessReturn` — validates success return shape
        *   `[✅]` `isEnqueueRenderJobErrorReturn(value: unknown): value is EnqueueRenderJobErrorReturn` — validates error return shape
    *   `[✅]` `type-guards/enqueueRenderJob.type_guards.test.ts`/interface guard tests
        *   `[✅]` Test: valid deps object passes `isEnqueueRenderJobDeps`
        *   `[✅]` Test: valid params object passes `isEnqueueRenderJobParams`
        *   `[✅]` Test: missing `jobId` fails params guard
        *   `[✅]` Test: valid payload object passes `isEnqueueRenderJobPayload`
        *   `[✅]` Test: missing `contributionId` fails payload guard
        *   `[✅]` Test: valid success return passes `isEnqueueRenderJobSuccessReturn`
        *   `[✅]` Test: valid error return passes `isEnqueueRenderJobErrorReturn`
    *   `[✅]` unit/`enqueueRenderJob.test.ts`
        *   `[✅]` Test: when `payload.needsContinuation` is true, returns `EnqueueRenderJobSuccessReturn` with `renderJobId: null` without calling `shouldEnqueueRenderJob` or inserting anything
        *   `[✅]` Test: when `shouldEnqueueRenderJob` returns `{ shouldRender: false, reason: 'is_json' }`, returns `EnqueueRenderJobSuccessReturn` with `renderJobId: null` (logs skip)
        *   `[✅]` Test: when `shouldEnqueueRenderJob` returns `{ shouldRender: false, reason: 'stage_not_found' }`, returns `EnqueueRenderJobErrorReturn` (query/config error)
        *   `[✅]` Test: when `shouldEnqueueRenderJob` returns `{ shouldRender: true, reason: 'is_markdown' }`, constructs RENDER payload, inserts into `dialectic_generation_jobs`, returns `EnqueueRenderJobSuccessReturn` with `renderJobId` = inserted row ID
        *   `[✅]` Test: RENDER job insert includes `idempotency_key` = `${params.jobId}_render`, `job_type` = `'RENDER'`, `status` = `'pending'`, `parent_job_id` = `params.jobId`
        *   `[✅]` Test: when DB insert returns 23505 (duplicate idempotency_key), recovers by selecting existing row, returns `EnqueueRenderJobSuccessReturn` with `renderJobId` = recovered row ID (does NOT return error)
        *   `[✅]` Test: when DB insert returns 23505 but recovery select fails, returns `EnqueueRenderJobErrorReturn` with `RenderJobEnqueueError`
        *   `[✅]` Test: when DB insert returns programmer error (FK violation, RLS), returns `EnqueueRenderJobErrorReturn` with `RenderJobEnqueueError`
        *   `[✅]` Test: when DB insert returns transient error, returns `EnqueueRenderJobErrorReturn` with `RenderJobEnqueueError` and `retriable: true`
        *   `[✅]` Test: when `payload.documentKey` is missing/invalid, returns `EnqueueRenderJobErrorReturn` with `RenderJobValidationError`
        *   `[✅]` Test: when `payload.stageRelationshipForStage` is missing/invalid, returns `EnqueueRenderJobErrorReturn` with `RenderJobValidationError`
        *   `[✅]` Test: template_filename extraction queries correct tables based on `is_cloned` flag (cloned → `dialectic_stage_recipe_steps`, not cloned → `dialectic_recipe_template_steps`)
        *   `[✅]` Test: RENDER payload includes `template_filename` extracted from matching recipe step's `outputs_required.files_to_generate[].template_filename` where `from_document_key` matches `payload.documentKey`
    *   `[✅]` `construction`
        *   `[✅]` Top-level exported async function: `enqueueRenderJob(deps: EnqueueRenderJobDeps, params: EnqueueRenderJobParams, payload: EnqueueRenderJobPayload): Promise<EnqueueRenderJobReturn>`
        *   `[✅]` Prohibited: class construction — this is a pure function, not a method
        *   `[✅]` Prohibited: referencing any EMCAS-specific state — all inputs via params
    *   `[✅]` `enqueueRenderJob.ts`
        *   `[✅]` Copy Zone H logic (EMCAS lines ~1399-1673) verbatim, replacing scope variable references with `deps.`, `params.`, and `payload.` prefixed access
        *   `[✅]` Early return `{ renderJobId: null }` if `payload.needsContinuation` is true
        *   `[✅]` Call `deps.shouldEnqueueRenderJob({ dbClient: deps.dbClient, logger: deps.logger }, { outputType: params.outputType, stageSlug: params.stageSlug })`
        *   `[✅]` Error-reason handling: throw for transient/config error reasons (`stage_not_found`, `instance_not_found`, `steps_not_found`, `parse_error`, `query_error`, `no_active_recipe`)
        *   `[✅]` Skip logging for `is_json` reason
        *   `[✅]` For `is_markdown` reason: validate `payload.documentKey` and `payload.stageRelationshipForStage`, extract `template_filename` from recipe steps (same DB query chain: stage → recipe instance → recipe steps → matching step → `outputs_required.files_to_generate[]`), construct `DialecticRenderJobPayload`, insert into `dialectic_generation_jobs` with idempotency handling, return `{ renderJobId: insertedRow.id }`
        *   `[✅]` EMCAS is NOT modified — this is extraction only
    *   `[✅]` provides/`enqueueRenderJob.ts`
        *   `[✅]` Exports `enqueueRenderJob` function
        *   `[✅]` Exports `EnqueueRenderJobFn`, `EnqueueRenderJobDeps`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, `EnqueueRenderJobReturn`, `EnqueueRenderJobSuccessReturn`, `EnqueueRenderJobErrorReturn` types (re-exported from interface file)
        *   `[✅]` Semantic guarantee: returns `EnqueueRenderJobSuccessReturn` with `renderJobId` (string when enqueued, null when skipped) or `EnqueueRenderJobErrorReturn` with error classification
    *   `[✅]` mock — `enqueueRenderJob.mock.ts`: export a mock `enqueueRenderJob` function (spy/stub) for use in `prepareModelJob` tests and future EMCAS slim tests
    *   `[✅]` integration — deferred; `enqueueRenderJob` is not yet called by any production code (EMCAS still has Zone H inline). Integration happens when EMCAS is slimmed.
    *   `[✅]` `directionality`
        *   `[✅]` Layer: domain utility (worker layer)
        *   `[✅]` All dependencies are inward-facing (DB client, logger, domain types, shared utilities)
        *   `[✅]` All provides are outward-facing (consumed by `prepareModelJob` in the next node, and later by slimmed EMCAS)
    *   `[✅]` `requirements`
        *   `[✅]` `enqueueRenderJob` must reproduce Zone H behavior exactly — same validation, same DB queries, same error categorization, same idempotency handling
        *   `[✅]` All scope variables from EMCAS must become explicit parameters — no implicit closure over EMCAS state
        *   `[✅]` `executeModelCallAndSave.ts` must NOT be modified in this node
        *   `[✅]` Error types must use existing `RenderJobValidationError` and `RenderJobEnqueueError` from `_shared/utils/errors.ts`
        *   `[✅]` Template filename extraction must support both cloned and non-cloned recipe instances (same branching logic as EMCAS lines 1497-1521)

*   `[✅] ` dialectic-worker/createJobContext **Decompose `IExecuteJobContext` into per-function context slices, define corrected `ExecuteModelCallAndSaveDeps` and `PrepareModelJobDeps` interfaces, remove `callUnifiedAIModel`, replace `executeModelCallAndSave` with `prepareModelJob`, add new slicers** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` Delete `IExecuteJobContext` — the monolithic execute context is replaced by two per-function context slices that give each function exactly the deps it needs and nothing more
        *   `[✅] ` Define corrected `ExecuteModelCallAndSaveDeps` = `IExecuteModelCallContext` — 12 fields derived from actual `deps.X` calls in Zones E-G + streaming replacement needs. Correct the already-written `executeModelCallAndSave.interface.ts` (which contains 4 unused deps and is missing `debitTokens`)
        *   `[✅] ` Define corrected `PrepareModelJobDeps` = `IPrepareModelJobContext` — 12 fields derived from actual `deps.X` calls in Zones A-D + 2 pre-bound orchestrator closures. Correct the already-written `prepareModelJob.interface.ts` (which has only 2 fields)
        *   `[✅] ` Define pre-bound closure types: `BoundPrepareModelJobFn` (2-arg, on `IJobContext`), `BoundExecuteModelCallAndSaveFn` (2-arg, on `PrepareModelJobDeps`), `BoundEnqueueRenderJobFn` (2-arg, on `PrepareModelJobDeps`)
        *   `[✅] ` Remove `callUnifiedAIModel` from `IModelContext` and `JobContextParams` — it is no longer needed because slimmed EMCAS calls `adapter.sendMessageStream()` directly
        *   `[✅] ` Replace `executeModelCallAndSave: ExecuteModelCallAndSaveFn` with `prepareModelJob: BoundPrepareModelJobFn` on `IJobContext` and `JobContextParams`
        *   `[✅] ` Add `createExecuteModelCallContext` slicer — picks 12 raw fields from `IJobContext` → `IExecuteModelCallContext`
        *   `[✅] ` Add `createPrepareModelJobContext` slicer — picks 10 raw fields from `IJobContext` + receives 2 pre-bound closures → `IPrepareModelJobContext`
        *   `[✅] ` Delete `createExecuteJobContext` slicer — replaced by the two new slicers above
        *   `[✅] ` `IJobContext` does NOT extend `IExecuteModelCallContext` or `IPrepareModelJobContext` — it is the fat root holding all raw fields; slicers construct per-function contexts from it
        *   `[✅] ` Update `JobContext.mock.ts` to remove `callUnifiedAIModel` mock, replace `executeModelCallAndSave` mock with `prepareModelJob` mock, add `debitTokens` mock, and reflect the new context interfaces
        *   `[✅] ` Update all type guards and type guard tests to reflect the new context interfaces
        *   `[✅] ` Correct `executeModelCallAndSave.interface.ts` — this node owns the interface because `createJobContext` is the first consumer that builds the slicer satisfying it
        *   `[✅] ` Correct `prepareModelJob.interface.ts` — this node owns the interface because `createJobContext` is the first consumer that builds the slicer satisfying it
    *   `[✅] ` `role`
        *   `[✅] ` Factory/slicer — constructs and narrows dependency contexts for job processing
    *   `[✅] ` `module`
        *   `[✅] ` Dialectic worker (`dialectic-worker/`)
        *   `[✅] ` Boundary: composition root wiring — no business logic, only dependency assembly
    *   `[✅] ` `deps`
        *   `[✅] ` `JobContext.interface.ts` — owns `IModelContext`, `IExecuteModelCallContext` (= `ExecuteModelCallAndSaveDeps`), `IPrepareModelJobContext` (= `PrepareModelJobDeps`), `IJobContext`, `JobContextParams`, `BoundPrepareModelJobFn`, `BoundExecuteModelCallAndSaveFn`, `BoundEnqueueRenderJobFn`, and all function-type aliases (`ContinueJobFn`, `RetryJobFn`, `DebitTokensFn`, etc.)
            *   Abstraction layer: interface definitions
            *   Direction: inward (factory depends on interfaces)
        *   `[✅] ` `executeModelCallAndSave.interface.ts` — owns `ExecuteModelCallAndSaveDeps`, `ExecuteModelCallAndSaveParams`, `ExecuteModelCallAndSavePayload`, `ExecuteModelCallAndSaveReturn`, `ExecuteModelCallAndSaveSuccessReturn`, `ExecuteModelCallAndSaveErrorReturn`, `ExecuteModelCallAndSaveFn` (3-arg raw). Corrected in this node — already-written file has wrong deps (4 unused, missing `debitTokens`)
            *   Abstraction layer: interface definitions
            *   Direction: inward
        *   `[✅] ` `prepareModelJob.interface.ts` — owns `PrepareModelJobDeps`, `PrepareModelJobParams`, `PrepareModelJobPayload`, `PrepareModelJobReturn`, `PrepareModelJobSuccessReturn`, `PrepareModelJobErrorReturn`, `PrepareModelJobFn` (3-arg raw). Corrected in this node — already-written file has wrong deps (only 2 fields, needs 12)
            *   Abstraction layer: interface definitions
            *   Direction: inward
        *   `[✅] ` `JobContext.mock.ts` — mock implementation of `IJobContext` for tests
            *   Abstraction layer: test infrastructure
        *   `[✅] ` Confirm no reverse dependency is introduced — `JobContext.interface.ts` does not import from any factory or slicer implementation
    *   `[✅] ` `context_slice`
        *   `[✅] ` `IModelContext` (lines 175-179): remove `callUnifiedAIModel` field; result: `{ getAiProviderAdapter, getAiProviderConfig }`
        *   `[✅] ` `IExecuteJobContext` (lines 214-240): DELETE entirely — replaced by `IExecuteModelCallContext` and `IPrepareModelJobContext`
        *   `[✅] ` `IExecuteModelCallContext` (NEW) = `ExecuteModelCallAndSaveDeps` — 12 fields derived from actual `deps.X` calls in Zones E-G + streaming replacement needs. Does NOT extend `IModelContext`, `ITokenContext`, or `INotificationContext` — cherry-picks only what slim EMCAS actually calls. Fields: `logger`, `fileManager`, `getAiProviderAdapter`, `tokenWalletService`, `notificationService`, `continueJob`, `retryJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens` (NEW — moved from chat function after hop elimination). Removed from prior draft: `getAiProviderConfig` (not called), `getExtensionFromMimeType` (not called), `extractSourceGroupFragment` (direct import, not a dep), `randomUUID` (not used in EMCAS)
        *   `[✅] ` `IPrepareModelJobContext` (NEW) = `PrepareModelJobDeps` — 12 fields derived from actual `deps.X` calls in Zones A-D + pre-bound orchestrator calls. Does NOT extend `IModelContext`, `IRagContext`, `ITokenContext`, or `INotificationContext` — cherry-picks only what `prepareModelJob` actually calls. Fields: `logger`, `pickLatest`, `downloadFromStorage`, `applyInputsRequiredScope`, `countTokens`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `ragService`, `embeddingClient`, `executeModelCallAndSave` (pre-bound 2-arg), `enqueueRenderJob` (pre-bound 2-arg). Removed from prior draft: `getAiProviderAdapter`, `getAiProviderConfig` (not called in A-D), `getSeedPromptForStage`, `promptAssembler` (not called via deps), `notificationService` (not called in A-D), `indexingService` (not called), `shouldEnqueueRenderJob` (Zone H, belongs on `EnqueueRenderJobDeps`). Pre-bound orchestrator calls are 2-arg closures bound at the composition root.
        *   `[✅] ` `IJobContext` (lines 273-280): change extends from `IExecuteJobContext, IPlanJobContext, IRenderJobContext` to `IExecuteModelCallContext, IPrepareModelJobContext, IPlanJobContext, IRenderJobContext`; replace `executeModelCallAndSave: ExecuteModelCallAndSaveFn` with `prepareModelJob: PrepareModelJobFn`; `continueJob` and `retryJob` inherited from `IExecuteModelCallContext` (no re-declaration needed)
        *   `[✅] ` `JobContextParams` (lines 287-322): remove `callUnifiedAIModel`; replace `executeModelCallAndSave` with `prepareModelJob`; field list is the flattened union of all context interfaces (33 fields total after removals/additions)
        *   `[✅] ` `createJobContext` factory: remove `callUnifiedAIModel: params.callUnifiedAIModel` (line 29); replace `executeModelCallAndSave: params.executeModelCallAndSave` (line 74) with `prepareModelJob: params.prepareModelJob`
        *   `[✅] ` `createExecuteJobContext` slicer (lines 85-131): DELETE entirely
        *   `[✅] ` `createExecuteModelCallContext` slicer (NEW): slices `IJobContext` → `IExecuteModelCallContext` with only the fields slim EMCAS needs
        *   `[✅] ` `createPrepareModelJobContext` slicer (NEW): slices `IJobContext` → `IPrepareModelJobContext` with only the fields `prepareModelJob` needs
        *   `[✅] ` `JobContext.mock.ts`: remove `callUnifiedAIModel` mock (line 48); replace `executeModelCallAndSave: async () => {}` (line 104) with `prepareModelJob: async () => {}`; update `getAiProviderAdapter` mock to include `sendMessageStream` stub on its return value (required by updated `AiProviderAdapter` type from adapter nodes)
    *   `[✅] ` `executeModelCallAndSave.interface.ts`/interface — **CORRECT the already-written file. EMCAS contract for reduced scope (Zones E-G + post-save), restructured per §7.**
        *   `[✅] ` `ExecuteModelCallAndSaveDeps` — corrected to 12 fields matching actual Zones E-G `deps.X` calls + streaming needs:
            *   `[✅] ` `logger: ILogger`
            *   `[✅] ` `fileManager: IFileManager` — contribution upload (line 1274), final assembly (lines 1760, 1812)
            *   `[✅] ` `getAiProviderAdapter: GetAiProviderAdapterFn` — obtains adapter for `sendMessageStream()` (replaces `callUnifiedAIModel`)
            *   `[✅] ` `tokenWalletService: ITokenWalletService` — wallet debit after model call (moved from chat function)
            *   `[✅] ` `notificationService: NotificationServiceType` — lifecycle events
            *   `[✅] ` `continueJob: ContinueJobFn` — line 1727
            *   `[✅] ` `retryJob: RetryJobFn` — lines 969, 990, 1021, 1051
            *   `[✅] ` `resolveFinishReason: ResolveFinishReasonFn` — line 987
            *   `[✅] ` `isIntermediateChunk: IsIntermediateChunkFn` — line 1010
            *   `[✅] ` `determineContinuation: DetermineContinuationFn` — line 1071
            *   `[✅] ` `buildUploadContext: BuildUploadContextFn` — line 1240
            *   `[✅] ` `debitTokens: DebitTokensFn` — NEW: wallet debit moved from chat function after hop elimination
            *   `[✅] ` REMOVED from prior draft: `getAiProviderConfig` (not called in E-G), `getExtensionFromMimeType` (not called), `extractSourceGroupFragment` (direct import at line 1223, not a dep), `randomUUID` (not used in EMCAS)
        *   `[✅] ` `ExecuteModelCallAndSaveParams` — per-call parameters (unchanged from prior draft):
            *   `[✅] ` `dbClient`, `job`, `providerDetails`, `extendedModelConfig`, `userAuthToken`, `sessionData`, `projectOwnerUserId`
            *   `[✅] ` Pre-validated fields: `stageSlug`, `iterationNumber`, `projectId`, `sessionId`, `model_id`, `walletId`, `output_type`
        *   `[✅] ` `ExecuteModelCallAndSavePayload` — `{ chatApiRequest: ChatApiRequest }` (unchanged)
        *   `[✅] ` `ExecuteModelCallAndSaveReturn` = `ExecuteModelCallAndSaveSuccessReturn | ExecuteModelCallAndSaveErrorReturn` (unchanged)
        *   `[✅] ` `ExecuteModelCallAndSaveFn` — 3-arg raw function type: `(deps, params, payload) => Promise<ExecuteModelCallAndSaveReturn>`
    *   `[✅] ` `executeModelCallAndSave.interface.test.ts`/interface tests — correct existing tests to match corrected deps (remove tests for removed fields, add test for `debitTokens`)
    *   `[✅] ` `executeModelCallAndSave.interface.guard.ts`/interface guards — correct existing guards to match corrected deps
    *   `[✅] ` `prepareModelJob.interface.ts`/interface — **CORRECT the already-written file. Expand `PrepareModelJobDeps` from 2 fields to 12.**
        *   `[✅] ` `PrepareModelJobDeps` — corrected to 12 fields matching actual Zones A-D `deps.X` calls + pre-bound orchestrator closures:
            *   `[✅] ` `logger: ILogger`
            *   `[✅] ` `pickLatest: PickLatestFn` — lines 254, 286, 315, 343, 374
            *   `[✅] ` `downloadFromStorage: DownloadFromStorageFn` — lines 255, 287, 316, 344, 376
            *   `[✅] ` `applyInputsRequiredScope: ApplyInputsRequiredScopeFn` — line 401
            *   `[✅] ` `countTokens: CountTokensFn` — lines 427, 458, 841, 878
            *   `[✅] ` `tokenWalletService: ITokenWalletService` — wallet balance fetch in Zone C
            *   `[✅] ` `validateWalletBalance: ValidateWalletBalanceFn` — line 472
            *   `[✅] ` `validateModelCostRates: ValidateModelCostRatesFn` — line 475
            *   `[✅] ` `ragService: IRagService` — compression loop (Zone D)
            *   `[✅] ` `embeddingClient: IEmbeddingClient` — compression loop (Zone D)
            *   `[✅] ` `executeModelCallAndSave: BoundExecuteModelCallAndSaveFn` — pre-bound 2-arg `(params, payload) => Promise<ExecuteModelCallAndSaveReturn>`
            *   `[✅] ` `enqueueRenderJob: BoundEnqueueRenderJobFn` — pre-bound 2-arg `(params, payload) => Promise<EnqueueRenderJobReturn>`
        *   `[✅] ` `PrepareModelJobParams` — unchanged: `dbClient`, `authToken`, `job`, `projectOwnerUserId`, `providerDetails`, `sessionData`
        *   `[✅] ` `PrepareModelJobPayload` — unchanged: `promptConstructionPayload`, `compressionStrategy`, `inputsRelevance?`, `inputsRequired?`
        *   `[✅] ` `PrepareModelJobReturn` = `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn` (unchanged)
        *   `[✅] ` `PrepareModelJobFn` — 3-arg raw function type: `(deps, params, payload) => Promise<PrepareModelJobReturn>`
    *   `[✅] ` `prepareModelJob.interface.test.ts`/interface tests — correct existing tests to match corrected deps (expand from 2-field tests to 12-field tests)
    *   `[✅] ` `prepareModelJob.interface.guard.ts`/interface guards — correct existing guards to match corrected deps
    *   `[✅] ` `JobContext.interface.ts`/interface
        *   `[✅] ` Remove `callUnifiedAIModel` from `IModelContext` — change from `{ callUnifiedAIModel, getAiProviderAdapter, getAiProviderConfig }` to `{ getAiProviderAdapter, getAiProviderConfig }`
        *   `[✅] ` Remove the `CallUnifiedAIModelFn` import from `dialectic.interface.ts` (line 12) if no longer used anywhere in the file
        *   `[✅] ` Remove the `ExecuteModelCallAndSaveFn` type definition (lines 75-77) — moved to `executeModelCallAndSave.interface.ts` in the EMCAS slim node
        *   `[✅] ` Remove the `ExecuteModelCallAndSaveParams` import from `dialectic.interface.ts` (line 35) if no longer used
        *   `[✅] ` DELETE `IExecuteJobContext` interface (lines 214-240) — replaced by the two new per-function context interfaces below
        *   `[✅] ` ADD `IExecuteModelCallContext` interface — context slice for slimmed `executeModelCallAndSave` = `ExecuteModelCallAndSaveDeps`. 12 fields, no base context extensions — cherry-picks only what Zones E-G actually call:
            *   `readonly logger: ILogger`
            *   `readonly fileManager: IFileManager` — contribution upload (line 1274), final document assembly (lines 1760, 1812)
            *   `readonly getAiProviderAdapter: GetAiProviderAdapterFn` — NEW: obtains adapter instance for `sendMessageStream()` (replaces `callUnifiedAIModel`)
            *   `readonly tokenWalletService: ITokenWalletService` — NEW in slim EMCAS: wallet debit after model call (moved from chat function)
            *   `readonly notificationService: NotificationServiceType` — lifecycle events (lines 970, 991, 1022, 1052, 1700, 1766, 1787, 1832, 1839)
            *   `readonly continueJob: ContinueJobFn` — line 1727
            *   `readonly retryJob: RetryJobFn` — lines 969, 990, 1021, 1051
            *   `readonly resolveFinishReason: ResolveFinishReasonFn` — line 987
            *   `readonly isIntermediateChunk: IsIntermediateChunkFn` — line 1010
            *   `readonly determineContinuation: DetermineContinuationFn` — line 1071
            *   `readonly buildUploadContext: BuildUploadContextFn` — line 1240
            *   `readonly debitTokens: DebitTokensFn` — NEW: wallet debit moved from chat function (`_shared/utils/debitTokens.ts`) since the chat hop is eliminated
        *   `[✅] ` ADD `IPrepareModelJobContext` interface — context slice for `prepareModelJob` = `PrepareModelJobDeps`. 12 fields, no base context extensions — cherry-picks only what Zones A-D actually call + pre-bound orchestrator closures:
            *   `readonly logger: ILogger` — used extensively in Zones A-D
            *   `readonly pickLatest: PickLatestFn` — lines 254, 286, 315, 343, 374
            *   `readonly downloadFromStorage: DownloadFromStorageFn` — lines 255, 287, 316, 344, 376
            *   `readonly applyInputsRequiredScope: ApplyInputsRequiredScopeFn` — line 401
            *   `readonly countTokens: CountTokensFn` — lines 427, 458, 841, 878
            *   `readonly tokenWalletService: ITokenWalletService` — wallet balance fetch in Zone C
            *   `readonly validateWalletBalance: ValidateWalletBalanceFn` — line 472
            *   `readonly validateModelCostRates: ValidateModelCostRatesFn` — line 475
            *   `readonly ragService: IRagService` — compression loop (Zone D)
            *   `readonly embeddingClient: IEmbeddingClient` — compression loop (Zone D)
            *   `readonly executeModelCallAndSave: BoundExecuteModelCallAndSaveFn` — pre-bound 2-arg closure `(params, payload) => Promise<ExecuteModelCallAndSaveReturn>`, bound at composition root with `IExecuteModelCallContext` deps
            *   `readonly enqueueRenderJob: BoundEnqueueRenderJobFn` — pre-bound 2-arg closure `(params, payload) => Promise<EnqueueRenderJobReturn>`, bound at composition root with `EnqueueRenderJobDeps`
        *   `[✅] ` UPDATE `IJobContext` (lines 273-280):
            *   Remove `extends IExecuteJobContext` — `IExecuteJobContext` is deleted
            *   `IJobContext` does NOT extend `IExecuteModelCallContext` or `IPrepareModelJobContext` — those contain pre-bound closures (`executeModelCallAndSave`, `enqueueRenderJob`) that `IJobContext` does not natively have. `IJobContext` is the fat root that holds all RAW fields; the slicers construct the per-function context objects from `IJobContext`'s raw fields + pre-bound closures.
            *   `IJobContext` keeps all raw fields from all contexts: `IPlanJobContext`, `IRenderJobContext`, plus all individual fields needed by slicers (logger, fileManager, downloadFromStorage, deleteFromStorage, getAiProviderAdapter, getAiProviderConfig, ragService, indexingService, embeddingClient, countTokens, tokenWalletService, notificationService, pickLatest, applyInputsRequiredScope, validateWalletBalance, validateModelCostRates, continueJob, retryJob, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens)
            *   Replace `readonly executeModelCallAndSave: ExecuteModelCallAndSaveFn` with `readonly prepareModelJob: BoundPrepareModelJobFn` — 2-arg pre-bound closure `(params: PrepareModelJobParams, payload: PrepareModelJobPayload) => Promise<PrepareModelJobReturn>`
            *   Add `BoundPrepareModelJobFn` type alias in `JobContext.interface.ts`
            *   Add `import { PrepareModelJobParams, PrepareModelJobPayload, PrepareModelJobReturn } from './prepareModelJob/prepareModelJob.interface.ts'`
        *   `[✅] ` UPDATE `JobContextParams` (lines 287-322):
            *   Remove `readonly callUnifiedAIModel: CallUnifiedAIModelFn` (line 292)
            *   Replace `readonly executeModelCallAndSave: ExecuteModelCallAndSaveFn` (line 313) with `readonly prepareModelJob: BoundPrepareModelJobFn`
            *   Add `readonly debitTokens: DebitTokensFn` — needed by `IExecuteModelCallContext` slicer
            *   All other fields remain — `JobContextParams` is the flattened union of all raw fields that slicers draw from, providing every field the `createJobContext` factory needs to construct `IJobContext`
    *   `[✅] ` `JobContext.type_guard.test.ts`/interface guard tests
        *   `[✅] ` Remove all `isIExecuteJobContext` test cases — the guard no longer exists
        *   `[✅] ` ADD test cases for `isIExecuteModelCallContext`:
            *   `[✅] ` Test: valid object with all 12 `IExecuteModelCallContext` fields passes guard
            *   `[✅] ` Test: object missing `fileManager` fails guard
            *   `[✅] ` Test: object missing `debitTokens` fails guard
            *   `[✅] ` Test: object missing `getAiProviderAdapter` fails guard
            *   `[✅] ` Test: object with Zone A-D fields (`ragService`, `pickLatest`, etc.) but missing `IExecuteModelCallContext` fields fails guard
        *   `[✅] ` ADD test cases for `isIPrepareModelJobContext`:
            *   `[✅] ` Test: valid object with all 12 `IPrepareModelJobContext` fields passes guard
            *   `[✅] ` Test: object missing `downloadFromStorage` fails guard
            *   `[✅] ` Test: object missing `ragService` fails guard
            *   `[✅] ` Test: object missing `executeModelCallAndSave` (pre-bound) fails guard
            *   `[✅] ` Test: object missing `enqueueRenderJob` (pre-bound) fails guard
            *   `[✅] ` Test: object with Zone E-G fields (`fileManager`, `continueJob`, etc.) but missing `IPrepareModelJobContext` fields fails guard
        *   `[✅] ` UPDATE `isIModelContext` test cases: remove `callUnifiedAIModel` from valid mock objects; add test that object without `callUnifiedAIModel` still passes
        *   `[✅] ` UPDATE `isIJobContext` test cases: replace `executeModelCallAndSave` with `prepareModelJob` in valid mock objects; remove `callUnifiedAIModel` from mock objects; verify guard passes with new context structure; verify guard fails when `prepareModelJob` is missing
    *   `[✅] ` `JobContext.type_guards.ts`/interface guards
        *   `[✅] ` UPDATE `isIModelContext` (lines 39-51): remove `'callUnifiedAIModel' in value` and `typeof value.callUnifiedAIModel === 'function'` checks
        *   `[✅] ` DELETE `isIExecuteJobContext` (lines 94-122): replaced by the two new guards below
        *   `[✅] ` ADD `isIExecuteModelCallContext(value: unknown): value is IExecuteModelCallContext` — validates all 12 fields: `logger` (object), `fileManager` (object), `getAiProviderAdapter` (function), `tokenWalletService` (object), `notificationService` (object), `continueJob` (function), `retryJob` (function), `resolveFinishReason` (function), `isIntermediateChunk` (function), `determineContinuation` (function), `buildUploadContext` (function), `debitTokens` (function). No base context guard calls — validates fields directly.
        *   `[✅] ` ADD `isIPrepareModelJobContext(value: unknown): value is IPrepareModelJobContext` — validates all 12 fields: `logger` (object), `pickLatest` (function), `downloadFromStorage` (function), `applyInputsRequiredScope` (function), `countTokens` (function), `tokenWalletService` (object), `validateWalletBalance` (function), `validateModelCostRates` (function), `ragService` (object), `embeddingClient` (object), `executeModelCallAndSave` (function — pre-bound 2-arg), `enqueueRenderJob` (function — pre-bound 2-arg). No base context guard calls — validates fields directly.
        *   `[✅] ` UPDATE `isIJobContext` (lines 149-163): remove `isIExecuteJobContext(value)` call — `IJobContext` no longer extends per-function contexts (it holds raw fields, slicers construct contexts). Replace `'executeModelCallAndSave' in value` with `'prepareModelJob' in value`; replace `typeof value.executeModelCallAndSave === 'function'` with `typeof value.prepareModelJob === 'function'`; add check for `debitTokens` field. `isIJobContext` validates that all raw fields exist on the fat root context.
    *   `[✅] ` unit/`createJobContext.test.ts`
        *   `[✅] ` Update `createMockJobContextParams` call sites: remove `callUnifiedAIModel` override, replace `executeModelCallAndSave` override with `prepareModelJob` override
        *   `[✅] ` Verify `createJobContext` returns an object that passes `isIJobContext` with new context structure
        *   `[✅] ` Verify `createJobContext` returns an object with `prepareModelJob` instead of `executeModelCallAndSave`
        *   `[✅] ` Verify `createJobContext` returns an object without `callUnifiedAIModel`
        *   `[✅] ` Remove all `createExecuteJobContext` test cases — the slicer no longer exists
        *   `[✅] ` ADD test cases for `createExecuteModelCallContext`:
            *   `[✅] ` Test: extracts only the 12 `IExecuteModelCallContext` fields from root `IJobContext`
            *   `[✅] ` Test: result passes `isIExecuteModelCallContext` guard
            *   `[✅] ` Test: result includes `logger`, `fileManager`, `getAiProviderAdapter`, `tokenWalletService`, `notificationService`, `continueJob`, `retryJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens`
            *   `[✅] ` Test: result does NOT include `ragService`, `countTokens`, `pickLatest`, `applyInputsRequiredScope`, `validateWalletBalance`, `validateModelCostRates`, `downloadFromStorage`, `embeddingClient`, `prepareModelJob`
        *   `[✅] ` ADD test cases for `createPrepareModelJobContext`:
            *   `[✅] ` Test: extracts 10 raw fields from root `IJobContext` + receives 2 pre-bound closures as arguments
            *   `[✅] ` Test: result passes `isIPrepareModelJobContext` guard
            *   `[✅] ` Test: result includes `logger`, `pickLatest`, `downloadFromStorage`, `applyInputsRequiredScope`, `countTokens`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `ragService`, `embeddingClient`, `executeModelCallAndSave`, `enqueueRenderJob`
            *   `[✅] ` Test: result does NOT include `fileManager`, `continueJob`, `retryJob`, `getAiProviderAdapter`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens`, `notificationService`, `prepareModelJob`
        *   `[✅] ` Verify `createPlanJobContext` still works unchanged — passes `isIPlanJobContext`
        *   `[✅] ` Verify `createRenderJobContext` still works unchanged — passes `isIRenderJobContext`
    *   `[✅] ` `construction`
        *   `[✅] ` No new constructors — modifications to existing factory function and interfaces
        *   `[✅] ` Prohibited: adding any new deps to replace `callUnifiedAIModel` — the adapter factory (`getAiProviderAdapter`) is already present on `IModelContext`
    *   `[✅] ` `createJobContext.ts`
        *   `[✅] ` In `createJobContext` factory:
            *   `[✅] ` Remove `callUnifiedAIModel: params.callUnifiedAIModel,` (line 29)
            *   `[✅] ` Replace `executeModelCallAndSave: params.executeModelCallAndSave,` (line 74) with `prepareModelJob: params.prepareModelJob,`
            *   `[✅] ` Remove `continueJob` and `retryJob` from the explicit IJobContext-level fields if they are now inherited from `IExecuteModelCallContext`
        *   `[✅] ` DELETE `createExecuteJobContext` slicer (lines 85-131) — replaced by two new slicers
        *   `[✅] ` ADD `createExecuteModelCallContext(root: IJobContext): IExecuteModelCallContext` — picks exactly the 12 fields slim EMCAS needs from the fat root:
            *   `[✅] ` `logger: root.logger`
            *   `[✅] ` `fileManager: root.fileManager`
            *   `[✅] ` `getAiProviderAdapter: root.getAiProviderAdapter`
            *   `[✅] ` `tokenWalletService: root.tokenWalletService`
            *   `[✅] ` `notificationService: root.notificationService`
            *   `[✅] ` `continueJob: root.continueJob`
            *   `[✅] ` `retryJob: root.retryJob`
            *   `[✅] ` `resolveFinishReason: root.resolveFinishReason`
            *   `[✅] ` `isIntermediateChunk: root.isIntermediateChunk`
            *   `[✅] ` `determineContinuation: root.determineContinuation`
            *   `[✅] ` `buildUploadContext: root.buildUploadContext`
            *   `[✅] ` `debitTokens: root.debitTokens`
        *   `[✅] ` ADD `createPrepareModelJobContext(root: IJobContext, boundEmcas: BoundExecuteModelCallAndSaveFn, boundRender: BoundEnqueueRenderJobFn): IPrepareModelJobContext` — picks 10 raw fields from the fat root + receives 2 pre-bound closures as arguments (since pre-bound closures are constructed at the composition root, not stored on IJobContext):
            *   `[✅] ` `logger: root.logger`
            *   `[✅] ` `pickLatest: root.pickLatest`
            *   `[✅] ` `downloadFromStorage: root.downloadFromStorage`
            *   `[✅] ` `applyInputsRequiredScope: root.applyInputsRequiredScope`
            *   `[✅] ` `countTokens: root.countTokens`
            *   `[✅] ` `tokenWalletService: root.tokenWalletService`
            *   `[✅] ` `validateWalletBalance: root.validateWalletBalance`
            *   `[✅] ` `validateModelCostRates: root.validateModelCostRates`
            *   `[✅] ` `ragService: root.ragService`
            *   `[✅] ` `embeddingClient: root.embeddingClient`
            *   `[✅] ` `executeModelCallAndSave: boundEmcas` (pre-bound 2-arg closure, passed in)
            *   `[✅] ` `enqueueRenderJob: boundRender` (pre-bound 2-arg closure, passed in)
        *   `[✅] ` `createPlanJobContext` — unchanged
        *   `[✅] ` `createRenderJobContext` — unchanged
    *   `[✅] ` `JobContext.mock.ts`
        *   `[✅] ` Remove the `callUnifiedAIModel` mock (line 48 and surrounding mock implementation lines 48-55)
        *   `[✅] ` Replace `executeModelCallAndSave: async () => {}` mock (line 104) with `prepareModelJob: async () => {}`
        *   `[✅] ` Update `getAiProviderAdapter` mock (lines 56-65) to include `sendMessageStream` stub on its return value — required because the updated `AiProviderAdapter` type contract (from adapter nodes) now mandates `sendMessageStream`
    *   `[✅] ` provides/`createJobContext.ts`
        *   `[✅] ` Exports `createJobContext` (unchanged)
        *   `[✅] ` Exports `createExecuteModelCallContext` (NEW — replaces `createExecuteJobContext`)
        *   `[✅] ` Exports `createPrepareModelJobContext` (NEW — replaces the prepare-specific portion of the old `createExecuteJobContext`)
        *   `[✅] ` Exports `createPlanJobContext` (unchanged)
        *   `[✅] ` Exports `createRenderJobContext` (unchanged)
        *   `[✅] ` Does NOT export `createExecuteJobContext` — deleted
        *   `[✅] ` Semantic guarantee: `IExecuteJobContext` no longer exists; `IJobContext` exposes `prepareModelJob` instead of `executeModelCallAndSave`; each function gets exactly the deps it needs via its own context slice — any code referencing removed interfaces or fields will get a compile error, ensuring all callers are updated
    *   `[✅] ` mock — `JobContext.mock.ts` updated in this node (see above)
    *   `[✅] ` integration — run `createJobContext.test.ts` to verify factory and all slicers work. Note: `executeModelCallAndSave.ts` still references `IExecuteJobContext` and `deps.callUnifiedAIModel` — these will cause type errors until the EMCAS slim node updates to use `IExecuteModelCallContext`. `processSimpleJob.ts` still references `ctx.executeModelCallAndSave` and `createExecuteJobContext` — these will cause type errors until the processSimpleJob node updates. Both are expected RED states resolved in subsequent nodes.
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: composition root (worker layer)
        *   `[✅] ` All dependencies are inward-facing (interfaces, type definitions)
        *   `[✅] ` All provides are outward-facing (context objects and slicers used by job processors and composition root)
    *   `[✅] ` `requirements`
        *   `[✅] ` `IExecuteJobContext` must be deleted and replaced by `IExecuteModelCallContext` and `IPrepareModelJobContext`
        *   `[✅] ` `callUnifiedAIModel` must be removed from ALL interfaces, params, factories, slicers, mocks, and type guards in this node
        *   `[✅] ` `executeModelCallAndSave` must be replaced with `prepareModelJob` on `IJobContext`, `JobContextParams`, `createJobContext.ts` factory, `JobContext.mock.ts`, and all relevant type guards and type guard tests
        *   `[✅] ` `createExecuteJobContext` slicer must be deleted and replaced by `createExecuteModelCallContext` and `createPrepareModelJobContext`
        *   `[✅] ` `getAiProviderAdapter` must be on `IExecuteModelCallContext` only (slim EMCAS uses it for streaming) — NOT on `IPrepareModelJobContext` (Zones A-D do not call it)
        *   `[✅] ` Each new context interface must contain ONLY the deps its target function uses — no shared fat context, no base context extensions
        *   `[✅] ` `IExecuteModelCallContext` (12 fields) must NOT include: `callUnifiedAIModel`, `getAiProviderConfig`, `getExtensionFromMimeType`, `extractSourceGroupFragment`, `randomUUID`, `getSeedPromptForStage`, `promptAssembler`, `ragService`, `indexingService`, `embeddingClient`, `countTokens`, `pickLatest`, `applyInputsRequiredScope`, `validateWalletBalance`, `validateModelCostRates`, `shouldEnqueueRenderJob`, `downloadFromStorage`, `deleteFromStorage`
        *   `[✅] ` `IPrepareModelJobContext` (12 fields) must NOT include: `callUnifiedAIModel`, `getAiProviderAdapter`, `getAiProviderConfig`, `fileManager`, `deleteFromStorage`, `getExtensionFromMimeType`, `extractSourceGroupFragment`, `randomUUID`, `continueJob`, `retryJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens`, `notificationService`, `getSeedPromptForStage`, `promptAssembler`, `indexingService`, `shouldEnqueueRenderJob`
        *   `[✅] ` `IJobContext` must NOT extend `IExecuteModelCallContext` or `IPrepareModelJobContext` — it holds raw fields; slicers construct per-function contexts
        *   `[✅] ` Pre-bound closure types: `BoundPrepareModelJobFn` (2-arg, on `IJobContext`), `BoundExecuteModelCallAndSaveFn` (2-arg, on `PrepareModelJobDeps`), `BoundEnqueueRenderJobFn` (2-arg, on `PrepareModelJobDeps`)
        *   `[✅] ` No business logic changes — this is purely a wiring/interface update
        *   `[✅] ` Type guard tests and factory tests must pass with the new context interfaces
        *   `[✅] ` `executeModelCallAndSave.ts` is NOT modified in this node (that happens in the EMCAS slim node)
        *   `[✅] ` `processSimpleJob.ts` is NOT modified in this node (that happens in the processSimpleJob node)

*   `[✅] ` _shared/utils/vector_utils/compressionStrategy **Convert `ICompressionStrategy` from `(dbClient, deps, ...)` to §7-compliant `(deps, params, payload)` signature** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` The current `ICompressionStrategy` interface in `_shared/utils/vector_utils.ts` violates §7 — it takes `(dbClient, deps, documents, history, currentUserPrompt, inputsRelevance?)` instead of `(deps, params, payload)`
        *   `[✅] ` Convert to `(deps: CompressionStrategyDeps, params: CompressionStrategyParams, payload: CompressionStrategyPayload) => Promise<CompressionCandidate[]>` per §7
        *   `[✅] ` `CompressionStrategyDeps` = `{ dbClient: SupabaseClient<Database>, embeddingClient?: IEmbeddingClient, logger?: ILogger }` — merges `dbClient` (currently a standalone arg) with the existing `CompressionDeps` fields
        *   `[✅] ` `CompressionStrategyParams` = `{ inputsRelevance?: RelevanceRule[] }` — the per-call filter rules
        *   `[✅] ` `CompressionStrategyPayload` = `{ documents: ResourceDocuments, history: Messages[], currentUserPrompt: string }` — the data to compress
        *   `[✅] ` Update all call sites (EMCAS line ~698 and any other callers) to pass the new 3-arg shape
        *   `[✅] ` Update all implementations of `ICompressionStrategy` to accept the new signature
    *   `[✅] ` `role`
        *   `[✅] ` Interface conversion — aligns an existing interface with the §7 function model
    *   `[✅] ` `module`
        *   `[✅] ` Shared utility (`_shared/utils/vector_utils.ts`)
        *   `[✅] ` Boundary: interface definition change + call site updates
    *   `[✅] ` `deps`
        *   `[✅] ` `_shared/utils/vector_utils.ts` — owns `ICompressionStrategy`, `CompressionDeps`, `CompressionCandidate`
        *   `[✅] ` `prepareModelJob.ts` (Zone D copy) — primary call site after extraction. Until prepareModelJob is written, the call site exists at EMCAS line ~698 but will be deleted when EMCAS is slimmed.
        *   `[✅] ` Any concrete implementations of `ICompressionStrategy` (search codebase for implementations)
    *   `[✅] ` `context_slice`
        *   `[✅] ` Current signature: `(dbClient: SupabaseClient<Database>, deps: CompressionDeps, documents: ResourceDocuments, history: Messages[], currentUserPrompt: string, inputsRelevance?: RelevanceRule[]) => Promise<CompressionCandidate[]>`
        *   `[✅] ` New signature: `(deps: CompressionStrategyDeps, params: CompressionStrategyParams, payload: CompressionStrategyPayload) => Promise<CompressionCandidate[]>`
        *   `[✅] ` Mapping: `dbClient` → `deps.dbClient`, `deps.embeddingClient` → `deps.embeddingClient`, `deps.logger` → `deps.logger`, `inputsRelevance` → `params.inputsRelevance`, `documents` → `payload.documents`, `history` → `payload.history`, `currentUserPrompt` → `payload.currentUserPrompt`
    *   `[✅] ` `_shared/utils/vector_utils.ts`/interface
        *   `[✅] ` ADD `CompressionStrategyDeps` — `{ dbClient: SupabaseClient<Database>, embeddingClient?: IEmbeddingClient, logger?: ILogger }`
        *   `[✅] ` ADD `CompressionStrategyParams` — `{ inputsRelevance?: RelevanceRule[] }`
        *   `[✅] ` ADD `CompressionStrategyPayload` — `{ documents: ResourceDocuments, history: Messages[], currentUserPrompt: string }`
        *   `[✅] ` UPDATE `ICompressionStrategy` — change from 6-arg to 3-arg: `(deps: CompressionStrategyDeps, params: CompressionStrategyParams, payload: CompressionStrategyPayload) => Promise<CompressionCandidate[]>`
        *   `[✅] ` DELETE `CompressionDeps` — merged into `CompressionStrategyDeps`
    *   `[✅] ` interface tests — update any existing type guard tests for `ICompressionStrategy` to match new signature
    *   `[✅] ` interface guards — update any existing guards for `CompressionDeps` to match `CompressionStrategyDeps`
    *   `[✅] ` unit — update any existing `ICompressionStrategy` tests/mocks to use 3-arg signature
    *   `[✅] ` `construction`
        *   `[✅] ` No new constructors — interface signature change only
    *   `[✅] ` `vector_utils.ts` — update the `ICompressionStrategy` interface definition and supporting types
    *   `[✅] ` Call site updates:
        *   `[✅] ` The sole production call site (EMCAS line ~698) is in Zone D, which moves to `prepareModelJob.ts` in the prepareModelJob node. `prepareModelJob` copies Zone D and must use the new 3-arg signature when calling `compressionStrategy`: `compressionStrategy({ dbClient: params.dbClient, embeddingClient: deps.embeddingClient, logger: deps.logger }, { inputsRelevance: payload.inputsRelevance }, { documents: resourceDocuments, history: workingHistory, currentUserPrompt })`
        *   `[✅] ` EMCAS `executeModelCallAndSave.ts` is NOT touched — Zone D is deleted from EMCAS in the slim EMCAS node, so the old call site disappears with it
        *   `[✅] ` Any other call sites found by grepping for `compressionStrategy(`
    *   `[✅] ` Implementation updates — update all concrete implementations of `ICompressionStrategy` to destructure from the new 3-arg shape
    *   `[✅] ` provides — same exports from `vector_utils.ts`, updated types
    *   `[✅] ` mock — update any compression strategy mocks to use 3-arg signature
    *   `[✅] ` integration — run all compression-related tests to verify behavior preservation
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: shared utility
        *   `[✅] ` All dependencies are inward-facing (domain types)
        *   `[✅] ` All provides are outward-facing (interface consumed by EMCAS/prepareModelJob)
    *   `[✅] ` `requirements`
        *   `[✅] ` `ICompressionStrategy` must use `(deps, params, payload)` per §7 — no standalone positional args
        *   `[✅] ` `dbClient` must be part of deps, not a standalone first argument
        *   `[✅] ` All existing compression tests must pass after the signature change
        *   `[✅] ` Behavior must be identical — this is a signature reshaping, not a logic change
        *   `[✅] ` Test mock updates for EMCAS compression tests (rag.test.ts, rag2.test.ts, tokens.test.ts) are deferred to the test-sort node where these tests move to `prepareModelJob.test.ts` — the compressionStrategy node updates only the interface, concrete implementations, and `PrepareModelJobPayload.compressionStrategy` type reference

*   `[✅]  ` dialectic-worker/prepareModelJob **NEW FILE — Copy Zones A-D (~920 lines) from intact EMCAS. Orchestrator that calls slim EMCAS + enqueueRenderJob. Extraction only — EMCAS unchanged.** `[BE]`
    *   `[✅]  ` `objective`
        *   `[✅]  ` Create `prepareModelJob.ts` by copying Zones A-D from `executeModelCallAndSave.ts` (lines ~62-947) into a standalone orchestrator function
        *   `[✅]  ` Zone A (lines ~62-181): job payload destructuring and field validation (stageSlug, walletId, iterationNumber, projectId, sessionId, model_id, user_jwt)
        *   `[✅]  ` Zone B (lines ~183-417): provider fetch, model config validation, artifact gathering via `gatherArtifacts()`, `applyInputsRequiredScope`, fail-fast required-document validation
        *   `[✅]  ` Zone C (lines ~420-529): token counting setup, initial token count, wallet balance fetch, cost rate validation, affordability checks (oversized vs non-oversized), output budget calculation, safety-margin and NSF guards
        *   `[✅]  ` Zone D (lines ~531-947): ChatApiRequest construction, compression strategy execution if oversized (RAG indexing, semantic search, document replacement loop), final re-sizing and re-budgeting, user_jwt validation
        *   `[✅]  ` After Zones A-D, `prepareModelJob` calls slimmed `executeModelCallAndSave` (passed as a dep) with the prepared `ChatApiRequest` and validated context, then calls `enqueueRenderJob` (passed as a dep) with the contribution result
        *   `[✅]  ` This is a COPY-OUT extraction: `executeModelCallAndSave.ts` is NOT modified in this node
    *   `[✅]  ` `role`
        *   `[✅]  ` Orchestrator — prepares all inputs for the model call (validation, artifact resolution, sizing, compression) and coordinates the call + post-call render enqueue
    *   `[✅]  ` `module`
        *   `[✅]  ` Dialectic worker (`dialectic-worker/`)
        *   `[✅]  ` Boundary: receives raw job + provider details + prompt payload, outputs nothing (calls EMCAS and enqueueRenderJob internally). All side effects (DB writes, model calls) happen via injected deps.
    *   `[✅]  ` `deps`
        *   `[✅]  ` `executeModelCallAndSave` — slimmed EMCAS function (injected, not imported directly) that takes a prepared `ChatApiRequest` + validated context and returns the saved contribution + model response metadata
            *   Abstraction layer: domain function
            *   Direction: outward (orchestrator calls domain function)
            *   Context slice: function signature only — `prepareModelJob` does not know EMCAS internals
        *   `[✅]  ` `enqueueRenderJob` — the function from the prior node (injected, not imported directly)
            *   Abstraction layer: domain function
            *   Direction: outward (orchestrator calls domain function)
        *   `[✅]  ` All deps that Zones A-D use: `logger`, `pickLatest`, `downloadFromStorage`, `applyInputsRequiredScope`, `countTokens`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `ragService`, `embeddingClient` — plus 2 pre-bound orchestrator closures: `executeModelCallAndSave` (BoundExecuteModelCallAndSaveFn), `enqueueRenderJob` (BoundEnqueueRenderJobFn)
            *   These are on `IPrepareModelJobContext` (created in the createJobContext node) — `prepareModelJob` receives its own dedicated context slice
            *   NOT included: `retryJob`, `notificationService`, `shouldEnqueueRenderJob` — these are Zone E-G/H deps, not Zone A-D
        *   `[✅]  ` `dbClient: SupabaseClient<Database>` — for provider fetch, artifact queries, contribution queries
        *   `[✅]  ` `_shared/utils/errors.ts` — `ContextWindowError`
        *   `[✅]  ` `_shared/utils/affordability_utils.ts` — `getMaxOutputTokens`
        *   `[✅]  ` `_shared/utils/type_guards.ts` — various type guards used in payload validation
        *   `[✅]  ` `_shared/types/tokenizer.types.ts` — `CountTokensDeps`, `CountableChatPayload`
    *   `[✅]  ` `context_slice`
        *   `[✅]  ` Input per §7: `deps: PrepareModelJobDeps` (injected functions), `params: PrepareModelJobParams` (job context/identifiers), `payload: PrepareModelJobPayload` (prompt preparation data)
        *   `[✅]  ` Output: `PrepareModelJobReturn` = `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn` — returns contribution, continuation state, and render job ID to `processSimpleJob`
        *   `[✅]  ` Injection shape: three-arg function `(deps, params, payload)` per §7
    *   `[✅] ` unit/`prepareModelJob.test.ts`
        *   `[✅] ` Test: calls `deps.executeModelCallAndSave` with a correctly constructed `ChatApiRequest` as payload after Zone A-D processing (mock EMCAS, verify call args include deps, params, payload)
        *   `[✅] ` Test: calls `deps.enqueueRenderJob` after EMCAS succeeds, passing correct params and payload derived from job context and EMCAS success return
        *   `[✅] ` Test: returns `PrepareModelJobSuccessReturn` with contribution from EMCAS, needsContinuation, and renderJobId from enqueueRenderJob
        *   `[✅] ` Test: returns `PrepareModelJobErrorReturn` when job payload is missing required `stageSlug`
        *   `[✅] ` Test: returns `PrepareModelJobErrorReturn` when job payload is missing required `walletId`
        *   `[✅] ` Test: returns `PrepareModelJobErrorReturn` when job payload is missing required `iterationNumber`
        *   `[✅] ` Test: returns `PrepareModelJobErrorReturn` when provider config is invalid (not `AiModelExtendedConfig`)
        *   `[✅] ` Test: returns `PrepareModelJobErrorReturn` with `ContextWindowError` when input tokens exceed context window and compression services are unavailable
        *   `[✅] ` Test: applies compression strategy when oversized and verifies reduced token count in the `ChatApiRequest` payload passed to EMCAS
        *   `[✅] ` Test: wallet affordability check returns `PrepareModelJobErrorReturn` when estimated cost exceeds balance
        *   `[✅] ` Test: non-oversized path sets `max_tokens_to_generate` on ChatApiRequest based on `getMaxOutputTokens` calculation
        *   `[✅] ` Test: when `gatherArtifacts` finds no required document, returns `PrepareModelJobErrorReturn` with descriptive error
        *   `[✅] ` Test: when EMCAS returns `ExecuteModelCallAndSaveErrorReturn`, error propagates as `PrepareModelJobErrorReturn` without calling `enqueueRenderJob`
        *   `[✅] ` Test: when `enqueueRenderJob` returns `EnqueueRenderJobErrorReturn` after EMCAS succeeds, error propagates as `PrepareModelJobErrorReturn`
    *   `[✅] ` `construction`
        *   `[✅] ` Top-level exported async function: `prepareModelJob(deps: PrepareModelJobDeps, params: PrepareModelJobParams, payload: PrepareModelJobPayload): Promise<PrepareModelJobReturn>`
        *   `[✅] ` Prohibited: class construction — this is a pure orchestrator function
        *   `[✅] ` Prohibited: direct import of `executeModelCallAndSave` or `enqueueRenderJob` — they are injected via deps for testability
    *   `[✅] ` `prepareModelJob.ts`
        *   `[✅] ` Copy Zone A (lines ~62-181): destructure `params`, validate `user_jwt`, validate `isDialecticExecuteJobPayload`, validate each field (stageSlug, walletId, iterationNumber, projectId, sessionId, model_id) with same error messages
        *   `[✅] ` Copy Zone B (lines ~183-417): fetch full provider data from `ai_providers`, validate `isAiModelExtendedConfig`, extract `promptConstructionPayload` fields, define and call `gatherArtifacts()` inner function (queries `dialectic_project_resources`, `dialectic_contributions`, `dialectic_feedback` for each input rule), call `applyInputsRequiredScope`, fail-fast validation
        *   `[✅] ` Copy Zone C (lines ~420-529): set up `tokenizerDeps`, compute `initialTokenCount`, determine `isOversized`, compute `ssotMaxOutputNonOversized` via `getMaxOutputTokens`, enforce safety-margin and NSF checks
        *   `[✅] ` Copy Zone D (lines ~531-947): build `chatApiRequest`, apply SSOT cap, if oversized run compression strategy (preflight cost check, document embedding, RAG search, replacement loop, re-sizing), validate `user_jwt` final
        *   `[✅] ` Call `deps.executeModelCallAndSave(emcasParams, { chatApiRequest })` — 2-arg pre-bound closure, deps already bound at composition root. `emcasParams` is constructed from validated Zone A-D context as `ExecuteModelCallAndSaveParams`
        *   `[✅] ` On EMCAS success: call `deps.enqueueRenderJob(renderParams, renderPayload)` — 2-arg pre-bound closure, deps already bound at composition root. `renderParams` is constructed from job context as `EnqueueRenderJobParams`, `renderPayload` is constructed from EMCAS success return as `EnqueueRenderJobPayload`
        *   `[✅] ` Return `PrepareModelJobSuccessReturn` with contribution, needsContinuation, and renderJobId from enqueueRenderJob result
        *   `[✅] ` On EMCAS or enqueueRenderJob error return: propagate as `PrepareModelJobErrorReturn`
        *   `[✅] ` `executeModelCallAndSave.ts` is NOT modified — this is extraction only
    *   `[✅] ` provides/`prepareModelJob.ts`
        *   `[✅] ` Exports `prepareModelJob` function
        *   `[✅] ` Exports `PrepareModelJobFn`, `PrepareModelJobDeps`, `PrepareModelJobParams`, `PrepareModelJobPayload`, `PrepareModelJobReturn`, `PrepareModelJobSuccessReturn`, `PrepareModelJobErrorReturn` types (re-exported from interface file)
        *   `[✅] ` Semantic guarantee: returns `PrepareModelJobSuccessReturn` with contribution, continuation state, and render job ID (null if skipped) or `PrepareModelJobErrorReturn` with error classification
    *   `[✅] ` mock — `prepareModelJob.mock.ts`: export a mock `prepareModelJob` function (spy/stub) for use in `processSimpleJob` tests
    *   `[✅] ` integration — deferred; `prepareModelJob` is not yet called by any production code. Integration happens when `processSimpleJob` is rewired.
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: orchestrator (worker layer)
        *   `[✅] ` Dependencies: inward to domain types/utilities, outward to EMCAS and enqueueRenderJob (both injected)
        *   `[✅] ` Provides: outward to `processSimpleJob` caller
    *   `[✅] ` `requirements`
        *   `[✅] ` `prepareModelJob` must reproduce Zones A-D behavior exactly — same validation, same artifact gathering, same token counting, same compression, same ChatApiRequest construction
        *   `[✅] ` All scope variables from EMCAS Zones A-D must become explicit parameters or derived from params — no implicit closure over EMCAS state
        *   `[✅] ` `executeModelCallAndSave.ts` must NOT be modified in this node
        *   `[✅] ` `prepareModelJob` must call EMCAS before `enqueueRenderJob` — render enqueue depends on the saved contribution
        *   `[✅] ` If EMCAS throws, `enqueueRenderJob` must NOT be called
        *   `[✅] ` The `gatherArtifacts` inner function must be copied verbatim (it will be deduplicated in Phase 2 when prompt assembler is refactored)

*   `[✅] ` dialectic-worker/executeModelCallAndSave **SLIM existing file — remove Zones A-D and H, replace HTTP call with direct adapter streaming + buffer accumulation + soft-timeout** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` Remove Zones A-D (lines ~62-947): payload validation, artifact gathering, token counting, wallet checks, compression, ChatApiRequest construction — all now live in `prepareModelJob`
        *   `[✅] ` Remove Zone H (lines ~1399-1673): render job enqueue logic — now lives in `enqueueRenderJob`
        *   `[✅] ` Replace the `deps.callUnifiedAIModel` HTTP call (lines 948-957) with direct `adapter.sendMessageStream()` call, buffer accumulation of `text_delta` chunks, usage/done extraction from stream chunks
        *   `[✅] ` Add soft-timeout checkpoint: if streaming exceeds ~350 seconds, stop accumulating, treat current buffer as content with `finish_reason: 'length'`, triggering continuation if applicable
        *   `[✅] ` Change function signature to implement `ExecuteModelCallAndSaveFn` from `executeModelCallAndSave.interface.ts` (defined in the prepareModelJob node): `(deps: ExecuteModelCallAndSaveDeps, params: ExecuteModelCallAndSaveParams, payload: ExecuteModelCallAndSavePayload) => Promise<ExecuteModelCallAndSaveReturn>`
        *   `[✅] ` The remaining file contains: adapter streaming → response assembly → finish_reason resolution → sanitization → continuation logic → storage upload → wallet debit → prompt link update → notifications. Roughly ~625 lines.
    *   `[✅] ` `role`
        *   `[✅] ` Domain function — executes the model call via adapter streaming, saves the contribution, handles continuation and retry logic
    *   `[✅] ` `module`
        *   `[✅] ` Dialectic worker (`dialectic-worker/`)
        *   `[✅] ` Boundary: receives prepared `ChatApiRequest` + validated context, streams from adapter, saves to DB/storage, returns contribution metadata to caller
    *   `[✅] ` `deps`
        *   `[✅] ` `adapter` instance — obtained via `deps.getAiProviderAdapter()` using the provider details passed from `prepareModelJob`. The adapter must implement `sendMessageStream()` (from prior adapter nodes)
            *   Abstraction layer: adapter (external infra wrapped)
            *   Direction: outward (EMCAS calls adapter)
            *   Context slice: `adapter.sendMessageStream(chatApiRequest, modelIdentifier)` returns `AsyncGenerator<AdapterStreamChunk>`
        *   `[✅] ` All deps on `ExecuteModelCallAndSaveDeps` (from `executeModelCallAndSave.interface.ts`) — the corrected 12 fields matching actual Zones E-G `deps.X` calls: `logger`, `fileManager`, `getAiProviderAdapter`, `tokenWalletService`, `notificationService`, `continueJob`, `retryJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens`
        *   `[✅] ` Removed deps: `callUnifiedAIModel` (removed in prior node), `getAiProviderConfig` (not called in E-G), `getExtensionFromMimeType` (not called), `extractSourceGroupFragment` (direct import, not a dep), `randomUUID` (not used in EMCAS), `countTokens`, `embeddingClient`, `ragService`, `getSeedPromptForStage`, `promptAssembler`, `pickLatest`, `applyInputsRequiredScope`, `validateWalletBalance`, `validateModelCostRates`, `shouldEnqueueRenderJob` — all moved to `prepareModelJob` or deleted
        *   `[✅] ` `dbClient: SupabaseClient<Database>` — for contribution save, wallet debit, prompt link update
    *   `[✅] ` `context_slice`
        *   `[✅] ` Implements `ExecuteModelCallAndSaveFn` — all types (`ExecuteModelCallAndSaveDeps`, `ExecuteModelCallAndSaveParams`, `ExecuteModelCallAndSavePayload`, `ExecuteModelCallAndSaveReturn`) are defined in `executeModelCallAndSave.interface.ts` (created in the prepareModelJob node). This node does not re-define them.
        *   `[✅] ` Deps are received as the first argument (was previously `IExecuteJobContext` on params — now separated per §7)
        *   `[✅] ` Payload contains `chatApiRequest` (was previously inside params — now separated per §7)
        *   `[✅] ` Returns `ExecuteModelCallAndSaveReturn` (was `void`) — `ExecuteModelCallAndSaveSuccessReturn` provides contribution data for render enqueue, `ExecuteModelCallAndSaveErrorReturn` provides error classification
    *   `[✅] ` `executeModelCallAndSave.ts` / updated implementation
        *   `[✅] ` Import `ExecuteModelCallAndSaveDeps`, `ExecuteModelCallAndSaveParams`, `ExecuteModelCallAndSavePayload`, `ExecuteModelCallAndSaveReturn` from `./executeModelCallAndSave.interface.ts` (created in the prepareModelJob node)
        *   `[✅] ` Change function signature to `(deps: ExecuteModelCallAndSaveDeps, params: ExecuteModelCallAndSaveParams, payload: ExecuteModelCallAndSavePayload): Promise<ExecuteModelCallAndSaveReturn>`
        *   `[✅] ` Replace all `params.deps.X` references with `deps.X` (deps are now a separate argument per §7)
        *   `[✅] ` Replace `params.chatApiRequest` with `payload.chatApiRequest` (payload is now a separate argument per §7)
    *   `[✅] ` interface tests — already defined in `executeModelCallAndSave.interface.test.ts` (created in the prepareModelJob node). No additional interface test work in this node.
    *   `[✅] ` interface guards — already defined in `type-guards/executeModelCallAndSave.type_guards.ts` (created in the prepareModelJob node). No additional guard work in this node.
    *   `[✅] ` unit/`executeModelCallAndSave.test.ts`
        *   `[✅] ` Test: `adapter.sendMessageStream` is called with `payload.chatApiRequest` and correct `modelIdentifier` from `params.providerDetails.api_identifier`
        *   `[✅] ` Test: text_delta chunks are accumulated into a single content string
        *   `[✅] ` Test: usage chunk provides token counts that are used for wallet debit
        *   `[✅] ` Test: done chunk provides `finish_reason` that is passed to `deps.resolveFinishReason`
        *   `[✅] ` Test: soft-timeout — when streaming exceeds 350 seconds, accumulation stops and finish_reason becomes `'length'`
        *   `[✅] ` Test: all existing post-call tests (sanitization, continuation, storage upload, wallet debit, retry logic) still pass with the new streaming-based response assembly
        *   `[✅] ` Test: function returns `ExecuteModelCallAndSaveSuccessReturn` with `contribution`, `needsContinuation`, `stageRelationshipForStage`, `documentKey`, `fileType`, `storageFileType`
        *   `[✅] ` Test: function returns `ExecuteModelCallAndSaveErrorReturn` on adapter/DB failures
        *   `[✅] ` Existing render-related tests (`executeModelCallAndSave.render.test.ts`) need updating: Zone H assertions are removed (render enqueue is now external). These tests should verify that the success return includes the data needed for render enqueue but the function does NOT perform the insert itself.
    *   `[✅] ` `construction`
        *   `[✅] ` Same top-level exported async function `executeModelCallAndSave` — name stays, signature changes to `(deps: ExecuteModelCallAndSaveDeps, params: ExecuteModelCallAndSaveParams, payload: ExecuteModelCallAndSavePayload): Promise<ExecuteModelCallAndSaveReturn>`
        *   `[✅] ` Prohibited: importing `prepareModelJob` or `enqueueRenderJob` — EMCAS is called BY them, not the other way around
    *   `[✅] ` `executeModelCallAndSave.ts` — changes
        *   `[✅] ` **DELETE** lines ~62-947 (Zones A-D): all payload validation, artifact gathering, token counting, wallet checks, compression, ChatApiRequest construction
        *   `[✅] ` **DELETE** lines ~1399-1673 (Zone H): render job enqueue logic
        *   `[✅] ` **REPLACE** lines 948-957 (model call via `deps.callUnifiedAIModel`) with:
            *   Get adapter instance via `deps.getAiProviderAdapter` using `params.providerDetails` — keeps adapter construction close to where it's used
        *   `[✅] ` **ADD** streaming buffer accumulation:
            ```
            const startTime = Date.now();
            const SOFT_TIMEOUT_MS = 350_000; // 350 seconds
            let assembledContent = '';
            let tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null;
            let streamFinishReason: FinishReason = 'unknown';
            let timedOut = false;

            const stream = adapter.sendMessageStream(payload.chatApiRequest, params.providerDetails.api_identifier);
            for await (const chunk of stream) {
                if (chunk.type === 'text_delta') {
                    assembledContent += chunk.text;
                    // Soft-timeout checkpoint
                    if (Date.now() - startTime > SOFT_TIMEOUT_MS) {
                        timedOut = true;
                        streamFinishReason = 'length';
                        break;
                    }
                } else if (chunk.type === 'usage') {
                    tokenUsage = chunk.tokenUsage;
                } else if (chunk.type === 'done') {
                    streamFinishReason = chunk.finish_reason;
                }
            }
            ```
        *   `[✅] ` **ADD** response assembly — construct `UnifiedAIResponse`-equivalent from accumulated data:
            *   `content = assembledContent.trim() || null`
            *   `tokenUsage` from usage chunk
            *   `finish_reason` from done chunk (or `'length'` if timed out)
            *   `rawProviderResponse = { token_usage: tokenUsage, finish_reason: streamFinishReason }` (adapter-agnostic)
            *   `processingTimeMs = Date.now() - startTime`
        *   `[✅] ` **KEEP** all post-response logic unchanged: `resolveFinishReason`, retry on error/empty, sanitization, continuation decision, storage upload, wallet debit, prompt link update, notifications, continuation job enqueue
        *   `[✅] ` **CHANGE** return: instead of `return;` (void), return `ExecuteModelCallAndSaveSuccessReturn` with `{ contribution, needsContinuation, stageRelationshipForStage, documentKey, fileType, storageFileType }` — all data `prepareModelJob` needs to call `enqueueRenderJob`. On failure, return `ExecuteModelCallAndSaveErrorReturn`.
    *   `[✅] ` provides/`executeModelCallAndSave.ts`
        *   `[✅] ` Exports `executeModelCallAndSave` function (same name, new signature implementing `ExecuteModelCallAndSaveFn`)
        *   `[✅] ` All types (`ExecuteModelCallAndSaveFn`, `ExecuteModelCallAndSaveDeps`, `ExecuteModelCallAndSaveParams`, `ExecuteModelCallAndSavePayload`, `ExecuteModelCallAndSaveReturn`, `ExecuteModelCallAndSaveSuccessReturn`, `ExecuteModelCallAndSaveErrorReturn`) are exported from `executeModelCallAndSave.interface.ts` (created in the prepareModelJob node)
        *   `[✅] ` Semantic guarantee: streams from adapter, saves contribution, handles retry/continuation, returns `ExecuteModelCallAndSaveSuccessReturn` or `ExecuteModelCallAndSaveErrorReturn`. Does NOT validate payload, gather artifacts, count tokens, check wallet, compress, or enqueue render jobs.
    *   `[✅] ` mock — update existing EMCAS mocks used by `processSimpleJob.test.ts` to match new signature
    *   `[✅] ` integration — deferred to final wiring node. At this point, EMCAS has a new signature but is not yet called by `prepareModelJob` (which doesn't exist in production code yet).
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: domain function (worker layer)
        *   `[✅] ` Dependencies: inward to domain types/utilities, outward to adapter (streaming)
        *   `[✅] ` Provides: outward to `prepareModelJob` orchestrator
    *   `[✅] ` `requirements`
        *   `[✅] ` Slimmed EMCAS must NOT contain any Zone A-D or Zone H logic
        *   `[✅] ` Slimmed EMCAS must call `adapter.sendMessageStream()` directly instead of `deps.callUnifiedAIModel()`
        *   `[✅] ` Streaming buffer accumulation must yield identical `content`, `tokenUsage`, and `finish_reason` as the old `UnifiedAIResponse` for the same model output
        *   `[✅] ` Soft-timeout at ~350s must set `finish_reason = 'length'` and break the stream, allowing continuation logic to trigger
        *   `[✅] ` All post-call logic (sanitization, continuation, storage, wallet debit, notifications) must remain functionally identical
        *   `[✅] ` Function must return `ExecuteModelCallAndSaveSuccessReturn` (contribution data, continuation state, render-enqueue fields) or `ExecuteModelCallAndSaveErrorReturn` instead of being void
        *   `[✅] ` All ~700 EMCAS tests must be updated and pass (test updates are NOT part of this node)
        *   `[✅] ` Render-related test files (`executeModelCallAndSave.render.test.ts`, etc.) must be updated to remove Zone H assertions — verify data is returned for external render enqueue instead

*   `[✅] ` dialectic-worker/processSimpleJob **Update caller to route through `prepareModelJob` instead of directly calling EMCAS** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` Replace the `ctx.executeModelCallAndSave({...})` call at line 323 with a call to `prepareModelJob` (which orchestrates slim EMCAS + enqueueRenderJob internally)
        *   `[✅] ` `processSimpleJob` continues to own: session/provider/stage/recipe resolution, prompt assembly, notification lifecycle (started/completed/failed events), error classification and immediate failure handling
        *   `[✅] ` `IJobContext` already exposes `prepareModelJob` instead of `executeModelCallAndSave` (updated in the createJobContext node)
    *   `[✅] ` `role`
        *   `[✅] ` Job processor — resolves context from DB, assembles prompt, delegates model execution to `prepareModelJob`, handles lifecycle notifications
    *   `[✅] ` `module`
        *   `[✅] ` Dialectic worker (`dialectic-worker/`)
        *   `[✅] ` Boundary: receives raw job from queue, queries DB for context, delegates to `prepareModelJob`, emits lifecycle events
    *   `[✅] ` `deps`
        *   `[✅] ` `ctx: IJobContext` — the full job context, which now includes `prepareModelJob: BoundPrepareModelJobFn` (2-arg, deps already bound at composition root) instead of `executeModelCallAndSave`
            *   Abstraction layer: composition root
            *   Direction: inward (processSimpleJob depends on context)
        *   `[✅] ` All existing deps remain: `dbClient`, `ctx.logger`, `ctx.notificationService`, `ctx.promptAssembler`, `ctx.downloadFromStorage`
        *   `[✅] ` Removed: `createExecuteJobContext` — deleted in createJobContext node. processSimpleJob no longer constructs context slices — `prepareModelJob` is pre-bound at the root.
    *   `[✅] ` `context_slice`
        *   `[✅] ` Same function signature: `processSimpleJob(dbClient, job, projectOwnerUserId, ctx, authToken)`
        *   `[✅] ` Change at line 323: replace `ctx.executeModelCallAndSave({...})` with `ctx.prepareModelJob(params, payload)` — 2-arg call, deps already bound at composition root
        *   `[✅] ` Separate previously-flat params into `PrepareModelJobParams` (job context/identifiers) and `PrepareModelJobPayload` (prompt preparation data)
        *   `[✅] ` processSimpleJob does NOT construct deps or call slicers — binding happens at the root (dialectic-worker/index.ts)
    *   `[✅] ` `processSimpleJob.ts` / interface — N/A (processSimpleJob has no separate interface file; `IJobContext` changes completed in the createJobContext node)
    *   `[✅] ` interface tests — N/A (processSimpleJob has no separate interface)
    *   `[✅] ` interface guards — N/A (IJobContext type guards updated in the createJobContext node)
    *   `[✅] ` unit/`processSimpleJob.test.ts`
        *   `[✅] ` Update mock `ctx` to provide `prepareModelJob` mock instead of `executeModelCallAndSave` mock
        *   `[✅] ` Test: `ctx.prepareModelJob` is called with correct 2-arg signature (params, payload) — deps already bound at composition root, params contain job context, payload contains prompt preparation data
        *   `[✅] ` Test: lifecycle notifications (execute_started, execute_completed) still fire at the correct points
        *   `[✅] ` Test: error classification (ContextWindowError, AUTH_MISSING, INSUFFICIENT_FUNDS, etc.) still works with `PrepareModelJobErrorReturn`
        *   `[✅] ` Test: when `prepareModelJob` returns `PrepareModelJobErrorReturn`, error is handled by the existing error classification logic
    *   `[✅] ` `construction`
        *   `[✅] ` Same exported async function `processSimpleJob` — no constructor changes
    *   `[✅] ` `processSimpleJob.ts`
        *   `[✅] ` Line ~322-323: replace `createExecuteJobContext(ctx)` + `await ctx.executeModelCallAndSave({...})` with:
            *   `[✅] ` Construct `PrepareModelJobParams` from job context fields (`dbClient`, `authToken`, `job`, `projectOwnerUserId`, `providerDetails`, `sessionData`)
            *   `[✅] ` Construct `PrepareModelJobPayload` from prompt preparation data (`promptConstructionPayload`, `compressionStrategy`, `inputsRelevance`, `inputsRequired`)
            *   `[✅] ` `const result = await ctx.prepareModelJob(params, payload)` — 2-arg call, deps already bound at composition root
        *   `[✅] ` Handle `PrepareModelJobReturn`: check for success vs error return, route error returns to existing error classification logic
        *   `[✅] ` Remove the `sessionForExecute: DialecticSession` construction block (lines 59-72) — no longer needed. Pass the raw `sessionData: DialecticSessionRow` from the DB query directly as `PrepareModelJobParams.sessionData`
        *   `[✅] ` Remove the `DialecticSession` import if no longer used elsewhere in the file
        *   `[✅] ` Verify all other `sessionData` usages in processSimpleJob (lines 57, 84, 239, 286, 289, 345) work with `DialecticSessionRow` field names — these access `selected_model_ids`, `iteration_count`, `id`, `project_id`, `status` etc. which exist on the row type
        *   `[✅] ` No other changes to `processSimpleJob.ts` logic — all prompt assembly, notification, and error handling remain
    *   `[✅] ` provides/`processSimpleJob.ts`
        *   `[✅] ` Exports `processSimpleJob` function (unchanged name and signature)
        *   `[✅] ` Semantic guarantee: same behavior as before — resolves context, calls model orchestrator, emits notifications
    *   `[✅] ` mock — update `processSimpleJob` mocks if used by other test files
    *   `[✅] ` integration — deferred to final wiring node
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: job processor (worker layer)
        *   `[✅] ` Dependencies: inward to DB, context, domain types
        *   `[✅] ` Provides: outward to job queue handler (`processJob`)
    *   `[✅] ` `requirements`
        *   `[✅] ` `processSimpleJob` must call `ctx.prepareModelJob(params, payload)` — 2-arg bound call, deps already bound at composition root — instead of `ctx.executeModelCallAndSave({...})`
        *   `[✅] ` All data previously passed as a single params object to `executeModelCallAndSave` must be split into `PrepareModelJobParams` and `PrepareModelJobPayload` (deps are bound at the root, not passed by processSimpleJob)
        *   `[✅] ` All existing `processSimpleJob.test.ts` tests must be updated and pass
        *   `[✅] ` No changes to prompt assembly, notification lifecycle, or error classification logic
        *   `[✅] ` `sessionData` passed to `prepareModelJob` must be `DialecticSessionRow` (raw DB row), not the constructed `DialecticSession` application type — aligns with new interface contracts
        *   `[✅] ` No changes to `JobContext.interface.ts`, `createJobContext.ts`, `JobContext.mock.ts`, or type guards — those were updated in the createJobContext node

*   `[✅] ` dialectic-service/generateContribution **Remove `callUnifiedAIModel` from `GenerateContributionsDeps`, delete dead types `CallUnifiedAIModelFn` and `CallModelDependencies`** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` Remove the optional `callUnifiedAIModel?` field from `GenerateContributionsDeps` — the field is unused by `generateContribution.ts` and the function it wrapped (`callModel.ts`) is being deleted
        *   `[✅] ` Delete `CallUnifiedAIModelFn` type from `dialectic.interface.ts` — all consumers removed: worker's `JobContext.interface.ts` no longer imports it (createJobContext node), `callModel.ts` is being deleted (dialectic-service/index node), `GenerateContributionsDeps` no longer references it (this node)
        *   `[✅] ` Delete `CallModelDependencies` interface from `dialectic.interface.ts` — only used by `callModel.ts` (being deleted) and `GenerateContributionsDeps` (field removed)
        *   `[✅] ` Update `generateContribution.test.ts` — remove `callUnifiedAIModel` from all ~18 mock `GenerateContributionsDeps` construction sites
    *   `[✅] ` `role`
        *   `[✅] ` Service function — creates and enqueues dialectic generation jobs
    *   `[✅] ` `module`
        *   `[✅] ` Dialectic service (`dialectic-service/`)
        *   `[✅] ` Boundary: receives payload + user + deps, inserts job rows into `dialectic_generation_jobs`. Does not call models directly.
    *   `[✅] ` `deps`
        *   `[✅] ` `dialectic.interface.ts` — owns `GenerateContributionsDeps`, `CallUnifiedAIModelFn`, `CallModelDependencies`
            *   Abstraction layer: interface definitions
            *   Direction: inward (function depends on interfaces)
        *   `[✅] ` `IDialecticJobDeps extends GenerateContributionsDeps` — inherits `callUnifiedAIModel?`. Since the field is optional, its removal does not break `IDialecticJobDeps` consumers.
    *   `[✅] ` `context_slice`
        *   `[✅] ` `GenerateContributionsDeps` (`dialectic.interface.ts` lines 1231-1243): remove `callUnifiedAIModel?` field
        *   `[✅] ` `CallUnifiedAIModelFn` (`dialectic.interface.ts` lines 103-107): DELETE entirely
        *   `[✅] ` `CallModelDependencies` (`dialectic.interface.ts` lines 1211-1214): DELETE entirely
    *   `[✅] ` `dialectic.interface.ts`/interface
        *   `[✅] ` Remove `callUnifiedAIModel?` field from `GenerateContributionsDeps`
        *   `[✅] ` DELETE `CallUnifiedAIModelFn` type (lines 103-107)
        *   `[✅] ` DELETE `CallModelDependencies` interface (lines 1211-1214)
        *   `[✅] ` Verify `IDialecticJobDeps extends GenerateContributionsDeps` (~line 1958) is unaffected — the removed field was optional, so no break
    *   `[✅] ` interface tests — N/A (`GenerateContributionsDeps` has no dedicated type guard)
    *   `[✅] ` interface guards — N/A
    *   `[✅] ` unit/`generateContribution.test.ts`
        *   `[✅] ` Remove `callUnifiedAIModel` field from all ~18 mock `GenerateContributionsDeps` object constructions throughout the test file
        *   `[✅] ` Verify all existing tests still pass — `generateContribution.ts` never used the field
    *   `[✅] ` `construction`
        *   `[✅] ` No changes to `generateContribution.ts` source — the function never referenced `deps.callUnifiedAIModel`
    *   `[✅] ` `generateContribution.ts`
        *   `[✅] ` No source changes — the function receives `deps: GenerateContributionsDeps` but never accesses `deps.callUnifiedAIModel`. The interface change is transparent to the implementation.
    *   `[✅] ` provides/`generateContribution.ts`
        *   `[✅] ` Exports `generateContributions` function (unchanged)
        *   `[✅] ` Semantic guarantee: `GenerateContributionsDeps` no longer includes any AI model call capability — job enqueue only
    *   `[✅] ` mock — N/A (no dedicated mock file for generateContribution)
    *   `[✅] ` integration — run `generateContribution.test.ts` to verify all tests pass with the updated interface
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: service (dialectic-service)
        *   `[✅] ` All dependencies are inward-facing (interfaces, DB client)
        *   `[✅] ` All provides are outward-facing (consumed by dialectic-service handler)
    *   `[✅] ` `requirements`
        *   `[✅] ` `callUnifiedAIModel` must be completely removed from `GenerateContributionsDeps`
        *   `[✅] ` `CallUnifiedAIModelFn` type must be deleted from `dialectic.interface.ts`
        *   `[✅] ` `CallModelDependencies` interface must be deleted from `dialectic.interface.ts`
        *   `[✅] ` `generateContribution.ts` source must NOT be modified — only interface and test changes
        *   `[✅] ` All `generateContribution.test.ts` tests must pass after fixture updates
        *   `[✅] ` `IDialecticJobDeps` must remain functional after inheriting the updated `GenerateContributionsDeps`

*   `[✅] ` dialectic-worker/index **Rewire composition root — remove `callUnifiedAIModel`, wire `prepareModelJob` + adapter factory. Integration tests.** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` Remove `callUnifiedAIModel` import and wiring from `dialectic-worker/index.ts` — it is no longer a dependency
        *   `[✅] ` Replace `executeModelCallAndSave` wiring with `prepareModelJob` wiring in `createJobContext` call
        *   `[✅] ` Wire `prepareModelJob` to receive `executeModelCallAndSave` (slim) and `enqueueRenderJob` as its injected deps
        *   `[✅] ` Run all worker-side tests to verify the pipeline
    *   `[✅] ` `role`
        *   `[✅] ` Composition root — assembles all production dependencies and wires them into the job context
    *   `[✅] ` `module`
        *   `[✅] ` Dialectic worker entry point (`dialectic-worker/index.ts`)
        *   `[✅] ` Boundary: Deno edge function entry, creates admin client, constructs all services, wires `IJobContext`, delegates to `processJob`
    *   `[✅] ` `deps`
        *   `[✅] ` `prepareModelJob` — imported from `./prepareModelJob.ts`
            *   Abstraction layer: domain orchestrator
            *   Direction: outward (composition root wires orchestrator)
        *   `[✅] ` `executeModelCallAndSave` — imported from `./executeModelCallAndSave.ts` (slim version)
            *   Abstraction layer: domain function
            *   Direction: outward (composition root wires domain function into orchestrator)
        *   `[✅] ` `enqueueRenderJob` — imported from `./enqueueRenderJob.ts`
            *   Abstraction layer: domain utility
            *   Direction: outward (composition root wires utility into orchestrator)
        *   `[✅] ` Removed dep: `callUnifiedAIModel` from `../dialectic-service/callModel.ts` — no longer imported
        *   `[✅] ` All other existing deps remain unchanged (fileManager, tokenWalletService, ragService, etc.)
    *   `[✅] ` `context_slice`
        *   `[✅] ` `dialectic-worker/index.ts` line 18: remove `import { callUnifiedAIModel } from '../dialectic-service/callModel.ts'`
        *   `[✅] ` `dialectic-worker/index.ts` line 30: keep `import { executeModelCallAndSave } from './executeModelCallAndSave.ts'` (slim version)
        *   `[✅] ` `dialectic-worker/index.ts`: add `import { prepareModelJob } from './prepareModelJob.ts'`
        *   `[✅] ` `dialectic-worker/index.ts`: add `import { enqueueRenderJob } from './enqueueRenderJob.ts'`
        *   `[✅] ` `dialectic-worker/index.ts` line 106: remove `callUnifiedAIModel,` from `createJobContext` params
        *   `[✅] ` `dialectic-worker/index.ts` lines 140-144: replace `executeModelCallAndSave` wiring with `prepareModelJob` wiring that binds slim EMCAS and enqueueRenderJob as deps
    *   `[✅] ` interface — no new interface changes in this node (all interface changes done in prior nodes)
    *   `[✅] ` interface tests — N/A
    *   `[✅] ` interface guards — N/A
    *   `[✅] ` unit/`index.test.ts`
        *   `[✅] ` Update mock context to provide `prepareModelJob` instead of `executeModelCallAndSave`
        *   `[✅] ` Update tests that verify `callUnifiedAIModel` is wired — remove those assertions
        *   `[✅] ` Add test: verify `prepareModelJob` is called when an EXECUTE job is processed
        *   `[✅] ` Verify render job processing tests still pass (render path is unchanged — `processRenderJob` is unaffected)
        *   `[✅] ` Verify plan job processing tests still pass (plan path is unchanged)
    *   `[✅] ` `construction`
        *   `[✅] ` No new constructors — modifications to existing composition root function
    *   `[✅] ` `dialectic-worker/index.ts`
        *   `[✅] ` Remove: `import { callUnifiedAIModel } from '../dialectic-service/callModel.ts'`
        *   `[✅] ` Add: `import { prepareModelJob } from './prepareModelJob.ts'`
        *   `[✅] ` Add: `import { enqueueRenderJob } from './enqueueRenderJob.ts'`
        *   `[✅] ` In `createJobContext({...})` call:
            *   Remove: `callUnifiedAIModel,` (line 106)
            *   Replace lines 140-144 (`executeModelCallAndSave: (params) => executeModelCallAndSave({...})`) with the full pre-bound closure construction chain. Three binding steps, all at the root:
                ```typescript
                // Step 1: Bind executeModelCallAndSave deps → BoundExecuteModelCallAndSaveFn (2-arg)
                const boundEmcas: BoundExecuteModelCallAndSaveFn = (params, payload) =>
                  executeModelCallAndSave(
                    { logger, fileManager, getAiProviderAdapter, tokenWalletService,
                      notificationService, continueJob, retryJob, resolveFinishReason,
                      isIntermediateChunk, determineContinuation, buildUploadContext, debitTokens },
                    params, payload,
                  );

                // Step 2: Bind enqueueRenderJob deps → BoundEnqueueRenderJobFn (2-arg)
                const boundRender: BoundEnqueueRenderJobFn = (params, payload) =>
                  enqueueRenderJob(
                    { dbClient: adminClient, logger, shouldEnqueueRenderJob },
                    params, payload,
                  );

                // Step 3: Bind prepareModelJob deps (10 raw + 2 pre-bound closures) → BoundPrepareModelJobFn (2-arg)
                prepareModelJob: (params, payload) =>
                  prepareModelJob(
                    { logger, pickLatest, downloadFromStorage, applyInputsRequiredScope,
                      countTokens, tokenWalletService, validateWalletBalance, validateModelCostRates,
                      ragService, embeddingClient,
                      executeModelCallAndSave: boundEmcas, enqueueRenderJob: boundRender },
                    params, payload,
                  ),
                ```
    *   `[✅] ` provides/`dialectic-worker/index.ts`
        *   `[✅] ` Exports the Deno edge function handler (unchanged)
        *   `[✅] ` Semantic guarantee: EXECUTE jobs now flow through `prepareModelJob` → slim `executeModelCallAndSave` (direct adapter streaming) → `enqueueRenderJob`, bypassing the `/chat` HTTP hop entirely
    *   `[✅] ` mock — N/A (composition root is not mocked)
    *   `[✅] ` integration
        *   `[ ]` Run ALL EMCAS test files: `executeModelCallAndSave.test.ts`, `executeModelCallAndSave.render.test.ts`, `executeModelCallAndSave.continue.test.ts`, `executeModelCallAndSave.chunks.test.ts`, `executeModelCallAndSave.assembleDocument.test.ts`, `executeModelCallAndSave.renderErrors.test.ts`
        *   `[ ]` Run `processSimpleJob.test.ts`
        *   `[ ]` Run `createJobContext.test.ts`
        *   `[ ]` Run `index.test.ts`
        *   `[ ]` Run `prepareModelJob.test.ts`
        *   `[ ]` Run `enqueueRenderJob.test.ts`
        *   `[ ]` Run all adapter tests: `anthropic_adapter.test.ts`, `openai_adapter.test.ts`, `google_adapter.test.ts`, `dummy_adapter.test.ts`, `factory.test.ts`
        *   `[ ]` Run type guard tests: `JobContext.type_guards.test.ts`, `enqueueRenderJob.type_guards.test.ts`, `prepareModelJob.type_guards.test.ts`, `type_guards.adapterStreamChunk.test.ts`
        *   `[ ]` All tests must pass
    *   `[ ]` `directionality`
        *   `[ ]` Layer: composition root (application boundary)
        *   `[ ]` All dependencies are outward-facing (assembles and injects concrete implementations)
        *   `[ ]` No business logic — pure wiring
    *   `[ ]` `requirements`
        *   `[ ]` `callUnifiedAIModel` must not be imported or wired anywhere in `dialectic-worker/`
        *   `[ ]` `callModel.ts` is NOT touched in this node — deletion happens in the dialectic-service/index node after all imports are removed
        *   `[ ]` `prepareModelJob` must receive `executeModelCallAndSave` and `enqueueRenderJob` as injected deps (not imported directly within `prepareModelJob.ts`)
        *   `[ ]` The adapter factory (`getAiProviderAdapter`) must remain wired — it is used by slim EMCAS to obtain adapter instances for streaming
        *   `[ ]` All ~700+ tests across the affected files must pass
        *   `[ ]` No changes to `chat/index.ts`, `_shared/cors-headers.ts`, or `_shared/prompt-assembler/`
        *   `[ ]` No changes to `dialectic-service/` — service-side cleanup is handled in the generateContribution and dialectic-service/index nodes

*   `[✅] ` dialectic-service/index **Remove `callUnifiedAIModel` wiring from handler, DELETE `callModel.ts` and `callModel.test.ts`. Commit.** `[BE]`
    *   `[✅] ` `objective`
        *   `[✅] ` Remove `import { callUnifiedAIModel } from './callModel.ts'` from `dialectic-service/index.ts` — no remaining consumers
        *   `[✅] ` Remove `callUnifiedAIModel: callUnifiedAIModel,` from the `GenerateContributionsDeps` construction in the generateContributions handler (line 454) — field no longer exists on the interface (removed in the generateContribution node)
        *   `[✅] ` DELETE `dialectic-service/callModel.ts` (146 lines) — all consumers removed: EMCAS calls adapter directly (EMCAS slim node), worker index no longer imports it (worker/index node), service index no longer imports it (this node), `GenerateContributionsDeps` no longer has the field (generateContribution node)
        *   `[✅] ` DELETE `dialectic-service/callModel.test.ts` (~814 lines) — tests for a deleted function
    *   `[✅] ` `role`
        *   `[✅] ` Service entry point / handler — routes HTTP requests to service functions
    *   `[✅] ` `module`
        *   `[✅] ` Dialectic service (`dialectic-service/`)
        *   `[✅] ` Boundary: Deno edge function entry, parses requests, constructs deps, delegates to handlers
    *   `[✅] ` `deps`
        *   `[✅] ` `callModel.ts` — being DELETED (was the only import target from this module)
            *   Abstraction layer: adapter (HTTP intermediary to /chat)
            *   Direction: removed
        *   `[✅] ` `dialectic.interface.ts` — `GenerateContributionsDeps` already updated in the generateContribution node (no `callUnifiedAIModel` field)
    *   `[✅] ` `context_slice`
        *   `[✅] ` `dialectic-service/index.ts` line 105: remove `import { callUnifiedAIModel } from './callModel.ts'`
        *   `[✅] ` `dialectic-service/index.ts` line 454: remove `callUnifiedAIModel: callUnifiedAIModel,` from `GenerateContributionsDeps` construction
    *   `[✅] ` interface — no interface changes in this node (done in the generateContribution node)
    *   `[✅] ` interface tests — N/A
    *   `[✅] ` interface guards — N/A
    *   `[✅] ` unit — N/A (handler behavior verified via integration tests)
    *   `[✅] ` `construction`
        *   `[✅] ` No new constructors — removal of import and wiring only
    *   `[✅] ` `dialectic-service/index.ts`
        *   `[✅] ` Remove: `import { callUnifiedAIModel } from './callModel.ts'` (line 105)
        *   `[✅] ` Remove: `callUnifiedAIModel: callUnifiedAIModel,` from deps construction (line 454)
    *   `[✅] ` DELETE `dialectic-service/callModel.ts`
        *   `[✅] ` File contains `callUnifiedAIModel` function (~146 lines) — an HTTP fetch wrapper to the `/chat` edge function
        *   `[✅] ` All consumers removed: EMCAS uses `adapter.sendMessageStream()` directly, worker index no longer imports it, service index no longer imports it, `GenerateContributionsDeps` no longer has the field
        *   `[✅] ` `UnifiedAIResponse` type (used by `callModel.ts` return) is NOT deleted — it remains in `dialectic.interface.ts` and is used by other functions for processing AI responses
    *   `[✅] ` DELETE `dialectic-service/callModel.test.ts`
        *   `[✅] ` Contains ~814 lines of tests for `callUnifiedAIModel` — testing HTTP fetch behavior, error handling, response parsing
        *   `[✅] ` All tests are for a deleted function — no value in keeping them
    *   `[✅] ` provides/`dialectic-service/index.ts`
        *   `[✅] ` Exports the Deno edge function handler (unchanged)
        *   `[✅] ` Semantic guarantee: `generateContributions` handler no longer provides `callUnifiedAIModel` in deps — the function never used it, this cleans up dead wiring
    *   `[✅] ` mock — N/A
    *   `[✅] ` integration
        *   `[✅] ` Run `generateContribution.test.ts` — verify handler still works without `callUnifiedAIModel` wiring
        *   `[✅] ` Verify no remaining imports of `callModel.ts` anywhere in the codebase
        *   `[✅] ` Verify no remaining references to `CallUnifiedAIModelFn` anywhere in the codebase
        *   `[✅] ` Verify no remaining references to `CallModelDependencies` anywhere in the codebase
    *   `[✅] ` `directionality`
        *   `[✅] ` Layer: composition root (service boundary)
        *   `[✅] ` Removed dependency: `callModel.ts` (deleted)
        *   `[✅] ` No business logic changes — pure cleanup
    *   `[✅] ` `requirements`
        *   `[✅] ` `callModel.ts` must be DELETED, not deprecated
        *   `[✅] ` `callModel.test.ts` must be DELETED
        *   `[✅] ` `callUnifiedAIModel` must not be imported or referenced anywhere in `dialectic-service/`
        *   `[✅] ` `UnifiedAIResponse` must NOT be deleted — it is still used by other functions
        *   `[✅] ` No changes to `generateContribution.ts` — source was already clean
    *   `[✅] ` **Commit: `feat(BE): direct adapter call for dialectic jobs, eliminate chat hop`**

*   `[ ]` dialectic-worker/test-sort **Sort all 20 EMCAS test files to their correct new owners** `[TEST-UNIT]` `[TEST-INT]`
    *   `[ ]` `objective`
        *   `[ ]` Process every one of the 20 EMCAS test files (~700+ tests across 17 unit + 3 integration files)
        *   `[ ]` For each test: identify which zone(s) it exercises (A-D → prepareModelJob, H → enqueueRenderJob, E-G + post-save → slimmed EMCAS)
        *   `[ ]` Map each test to its correct new owner and lift & shift to the new owner's test file
        *   `[ ]` Update mocks and fixtures to match each new owner's §7-compliant interface (deps, params, return)
        *   `[ ]` For tests that cross zone boundaries: disassemble into separate unit tests for each new owner
        *   `[ ]` Create new integration tests proving the decomposed functions work together:
            *   `[ ]` prepareModelJob → executeModelCallAndSave (Zones A-D → E-G)
            *   `[ ]` executeModelCallAndSave → enqueueRenderJob (E-G → H via return data)
            *   `[ ]` prepareModelJob → executeModelCallAndSave → enqueueRenderJob (full chain)
        *   `[ ]` After sorting, slimmed EMCAS owns only the tests valid for its reduced scope (Zones E-G + post-save)
    *   `[ ]` `requirements`
        *   `[ ]` All ~700+ tests must be accounted for — none dropped, none orphaned
        *   `[ ]` Each new owner's test file uses that owner's §7 interface (deps, params, return), not the old monolith's bundled params
        *   `[ ]` No test may assert behavior that its owner does not implement (e.g., no Zone A validation tests in slimmed EMCAS)
        *   `[ ]` All tests must pass after sorting is complete
    *   `[ ]` **Commit: `test(BE): sort EMCAS test files to decomposed function owners`**

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
