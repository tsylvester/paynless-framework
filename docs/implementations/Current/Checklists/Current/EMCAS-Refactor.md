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
| `callUnifiedAIModel` | HTTP fetch to chat | Direct adapter call (same function, rewritten internals) |

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

*   `[ ]` **0.3 Extract pure utilities from EMCAS internals**
    These are low-risk, high-value extractions that reduce EMCAS line count and enable isolated testing. Each follows the pattern: define interface → write failing test → implement → verify existing tests still pass.

    *   `[ ]` 0.3.a `pickLatest` — pure utility, selects latest record by `created_at` (current lines ~225-234)
    *   `[ ]` 0.3.b `sanitizeMessage` — pure string transform, removes placeholder braces
    *   `[ ]` 0.3.c `applyInputsRequiredScope` — pure filter, scopes docs to `inputsRequired` rules (current lines ~421-436)
    *   `[ ]` 0.3.d `buildExtendedModelConfig` — pure transform, constructs `AiModelExtendedConfig` (current lines ~196-211)
    *   `[ ]` 0.3.e `validateWalletBalance` — pure validation, parses and validates balance string
    *   `[ ]` 0.3.f `validateModelCostRates` — pure validation, checks input/output rates
    *   `[ ]` 0.3.g `resolveFinishReason` — pure extraction from AI response (current lines ~1029-1034)
    *   `[ ]` 0.3.h `determineContinuation` — pure decision based on finish reason + parsed content (current lines ~1053-1164)
    *   `[ ]` 0.3.i `buildUploadContext` — pure construction of `ModelContributionUploadContext` (current lines ~1325-1360)

*   `[ ]` **0.4 Extract token debit logic as a shared utility**
    Currently lives inside the chat function's `debitTokens`. The direct-adapter path needs the same logic. Extract once, use in both chat (browser path) and the new `executeModelCallAndSave` (dialectic path).

*   `[ ]` **0.5 Replace EMCAS inline implementations with extracted utilities**
    Swap each inline implementation for a call to the extracted utility. Run all ~700 existing tests after each swap to prove behavior preservation.

*   `[ ]` **0.6 Commit: `refactor(BE): extract pure utilities from executeModelCallAndSave`**

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
        *   `[ ]` Acceptance: no existing EMCAS tests are modified or broken (verified at wiring node)

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
        *   `[✅]` 9 new utility files under `_shared/utils/` (pickLatest, applyInputsRequiredScope, buildExtendedModelConfig, validateWalletBalance, validateModelCostRates, resolveFinishReason, isIntermediateChunk, determineContinuation, buildUploadContext)
        *   `[✅]` 9 new test files under `_shared/utils/` (one per utility)
        *   `[✅]` `determineContinuation` interface, interface tests, interface guards, and mock files
        *   `[✅]` `isIntermediateChunk` has no interface files (two primitive arguments, boolean return)
        *   `[✅]` `buildExtendedModelConfig` interface file
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
| `dialectic-service/callModel.ts` | HTTP fetch to chat | Rewritten: direct adapter call |
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
