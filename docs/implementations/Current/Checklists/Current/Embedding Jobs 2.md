[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 

# Work Breakdown Structure

## WS-B — CALLBACK / PERSISTENCE

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveResponse.ts **[BE] Implement operation-aware persistence branching routing stream content to fileManager and embedding vectors to IndexingService**

   * `[ ]`   `objective`
      * `[ ]`   Solve persistence mismatch where `saveResponse.ts` is stream-content-centric and cannot correctly persist embedding callback payload variants without ambiguous field interpretation.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `indexingService: IIndexingService` to `SaveResponseDeps` so the embedding branch can call `insertChunk` directly into `dialectic_memory`.
         * `[ ]`   Define `StreamSaveResponsePayload` and `EmbeddingSaveResponsePayload` as named discriminated-union members and replace the flat `SaveResponsePayload` struct with their union.
         * `[ ]`   Embedding branch reads `chunk_text` from the already-fetched `DialecticEmbeddingJobPayload` in `job.payload` — not from the callback body — and passes it as `chunkText` to `insertChunk`.
         * `[ ]`   Embedding branch calls `deps.indexingService.insertChunk(chunkText, payload.embedding_vector, extendedModelConfig.dimensions, attribution)` where `attribution` carries real `user_id`, `wallet_id`, `source_type`, `source_id` from the job payload.
         * `[ ]`   Preserve existing stream continuation/retry/finalization/`enqueueRenderJob` behavior unchanged; no `fileManager`, `buildUploadContext`, `continueJob`, `retryJob`, `sanitizeJsonContent`, or `enqueueRenderJob` calls in the embedding branch.
         * `[ ]`   Preserve token debit semantics and job-status transitions for both operation paths.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Keep existing stream regression surface stable (continuation, path context, plan validation, notifications, raw-json paths).
         * `[ ]`   Reject malformed operation payload variants with explicit non-retriable errors at guard/validation boundary.
         * `[ ]`   Do not modify callback handler authorization logic in this node.
         * `[ ]`   Do not modify enqueue source behavior in this node.
      * `[ ]`   Each goal is atomic and testable through interface, guard, mock, unit, and integration coverage within saveResponse scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is persistence orchestration implementation and complete immediate support system for `saveResponse.ts`.
      * `[ ]`   This role is correct because `saveResponse.ts` is the WS-B consumer of operation-aware callback payload contracts and the producer of persisted contribution state and `dialectic_memory` embedding rows.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `netlifyResponseHandler.ts` source behavior in this node.
         * `[ ]`   Do not edit Netlify worker source behavior in this node.
         * `[ ]`   Do not edit `gatherArtifacts`, `applyCompressionOverlay`, or `processSimpleJob` sources in this node.
         * `[ ]`   Do not implement `RagContextSummary` artifact persistence via `fileManager` in this node (that belongs to WS-C).

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/saveResponse` persistence, continuation, and completion orchestration.
      * `[ ]`   Inside boundary:
         * `[ ]`   Payload validation and operation-specific narrowing into stream or embedding path.
         * `[ ]`   Stream branch: debit/retry/continue/finalization control flow and `fileManager` artifact persistence.
         * `[ ]`   Embedding branch: `dialectic_memory` chunk persistence via `indexingService.insertChunk` with real attribution, token debit, and job-status completion.
      * `[ ]`   Outside boundary:
         * `[ ]`   Callback request authorization and signature validation.
         * `[ ]`   Queue enqueue event construction.
         * `[ ]`   `RagContextSummary` artifact persistence (WS-C).
         * `[ ]`   Later resume-consumption overlay logic in WS-D downstream workstreams.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./saveResponse.interface.ts` and `./saveResponse.guard.ts`.
         * `[ ]`   Layer classification: local contract and runtime boundary producer.
         * `[ ]`   Direction: consumed by `saveResponse.ts` and its tests.
         * `[ ]`   Purpose: enforce operation-discriminated payload shape before persistence orchestration.
      * `[ ]`   Provider: `../../_shared/services/indexing_service.interface.ts` (`IIndexingService`) — NEW.
         * `[ ]`   Layer classification: shared infrastructure service contract.
         * `[ ]`   Direction: inbound dependency consumed by the embedding branch.
         * `[ ]`   Purpose: persist embedding vectors plus chunk text into `dialectic_memory` with real attribution via `insertChunk`.
      * `[ ]`   Provider: `../createJobContext/JobContext.interface.ts` deps (`continueJob`, `retryJob`, `determineContinuation`, etc.).
         * `[ ]`   Layer classification: orchestration dependency contracts.
         * `[ ]`   Direction: inbound dependencies consumed by saveResponse stream implementation.
         * `[ ]`   Purpose: preserve existing continuation and retry behavior for the stream path.
      * `[ ]`   Provider: `_shared` file manager/path/type guards/json sanitizer/debit utilities.
         * `[ ]`   Layer classification: shared infrastructure utilities.
         * `[ ]`   Direction: inbound dependencies consumed by stream persistence and shared debit helper.
         * `[ ]`   Purpose: canonical pathing, safe parse/sanitize, debit accounting, and contribution registration (stream branch only); `debitTokens` is shared across both branches.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from saveResponse into callback handler source logic.
         * `[ ]`   No lateral layer violations with enqueue module boundaries.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   Stream branch: `fileManager.uploadAndRegisterFile` + `assembleAndSaveFinalDocument`; `buildUploadContext`; `sanitizeJsonContent`; `resolveFinishReason`; `isIntermediateChunk`; `determineContinuation`; `continueJob`; `retryJob`; `enqueueRenderJob`.
         * `[ ]`   Embedding branch: `indexingService.insertChunk(chunkText: string, embeddingVector: number[], dimensions: number, attribution: InsertChunkAttribution): Promise<IndexDocumentResult>` where `InsertChunkAttribution = { session_id: string; user_id: string; wallet_id: string; source_type: DialecticMemorySourceType; source_id: string; idempotency_key: string }` (from WS-0 `indexing_service.interface.ts`).
         * `[ ]`   Shared: `debitTokens` (used by both branches for token debit with real wallet attribution).
      * `[ ]`   Injection shape: `SaveResponseDeps` (augmented with `indexingService`), `SaveResponseParams`, `SaveResponsePayload` (discriminated union).
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated DB/project state beyond existing validated requirements.
         * `[ ]`   No hidden coupling to `netlifyResponse` request envelope.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interface.test.ts`
      * `[ ]`   Add contract assertions for `StreamSaveResponsePayload`:
         * `[ ]`   Surface has exactly 4 keys: `operation`, `assembled_content`, `token_usage`, `finish_reason`.
         * `[ ]`   `operation` literal value is `'stream'`.
         * `[ ]`   `assembled_content` is `string`; `token_usage` is `NodeTokenUsage | null`; `finish_reason` is `string | null`.
      * `[ ]`   Add contract assertions for `EmbeddingSaveResponsePayload`:
         * `[ ]`   Surface has exactly 3 keys: `operation`, `embedding_vector`, `embedding_model_slug`.
         * `[ ]`   `operation` literal value is `'embedding'`.
         * `[ ]`   `embedding_vector` is `number[]`; `embedding_model_slug` is `string`.
      * `[ ]`   Add contract assertion that `SaveResponseDeps` surface includes `indexingService` field.
      * `[ ]`   Preserve existing `NodeTokenUsage`, `SaveResponseParams`, `SaveResponseRequestBody`, `SaveResponseSuccessReturn`, `SaveResponseErrorReturn`, `SaveResponseReturn`, and `SaveResponseDeps` (remaining fields) contract assertions.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interface.ts`
      * `[ ]`   Define `StreamSaveResponsePayload = { operation: 'stream'; assembled_content: string; token_usage: NodeTokenUsage | null; finish_reason: string | null }`.
      * `[ ]`   Define `EmbeddingSaveResponsePayload = { operation: 'embedding'; embedding_vector: number[]; embedding_model_slug: string }`.
      * `[ ]`   Replace the flat `SaveResponsePayload` struct with `export type SaveResponsePayload = StreamSaveResponsePayload | EmbeddingSaveResponsePayload`.
      * `[ ]`   Add `indexingService: IIndexingService` to `SaveResponseDeps`; add import for `IIndexingService` from `../../_shared/services/indexing_service.interface.ts`.
      * `[ ]`   Keep `SaveResponseParams`, `SaveResponseRequestBody`, `NodeTokenUsage`, `SaveResponseSuccessReturn`, `SaveResponseErrorReturn`, `SaveResponseReturn`, `SaveResponseFn`, and all other existing `SaveResponseDeps` fields unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.interaction.spec`
      * `[ ]`   Preserve existing interaction-spec file semantics for stream path (shared preconditions, continuation, retry, finalization, debit, notification sequencing).
      * `[ ]`   Add embedding branch interaction semantics:
         * `[ ]`   Precondition: `payload.operation === 'embedding'` after guard pass.
         * `[ ]`   Fetch job row → validate `job.payload` as `DialecticEmbeddingJobPayload` → extract `chunk_text` → non-retriable error if `chunk_text` absent or not a string.
         * `[ ]`   Fetch provider row → validate `extendedModelConfig.dimensions` is a finite positive number → non-retriable error if absent.
         * `[ ]`   Build `InsertChunkAttribution` with real `user_id` from `job.user_id`, `wallet_id` from job payload `walletId`, `source_type` from job payload `source_type`, `source_id` from job payload `source_id`, `idempotency_key: job.id`.
         * `[ ]`   Call `deps.indexingService.insertChunk(chunkText, payload.embedding_vector, dimensions, attribution)` → on `IndexDocumentResult.success === false`: return `{ error: result.error, retriable: true }`.
         * `[ ]`   Debit tokens for embedding cost via `deps.debitTokens`.
         * `[ ]`   Update job status to `completed` in `dialectic_generation_jobs`.
         * `[ ]`   Return `{ status: 'completed' }`.
         * `[ ]`   No calls to `enqueueRenderJob`, `buildUploadContext`, `fileManager`, `sanitizeJsonContent`, `continueJob`, `retryJob`, `determineContinuation`, or `resolveFinishReason` in the embedding branch.
      * `[ ]`   Preserve existing failure modes: contract invalidity → non-retriable; DB/provider/session lookup failures → non-retriable; debit transient failure → retriable; malformed content in stream branch → retry with existing semantics.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.guard.test.ts`
      * `[ ]`   Add `isSaveResponsePayload` guard tests for stream variant:
         * `[ ]`   Accept `{ operation: 'stream', assembled_content: 'text', token_usage: null, finish_reason: null }`.
         * `[ ]`   Accept `{ operation: 'stream', assembled_content: 'text', token_usage: { prompt_tokens:1, completion_tokens:2, total_tokens:3 }, finish_reason: 'stop' }`.
         * `[ ]`   Reject `{ operation: 'stream' }` missing `assembled_content`.
         * `[ ]`   Reject `{ operation: 'stream', assembled_content: 42, token_usage: null, finish_reason: null }` (non-string `assembled_content`).
      * `[ ]`   Add `isSaveResponsePayload` guard tests for embedding variant:
         * `[ ]`   Accept `{ operation: 'embedding', embedding_vector: [0.1, 0.2], embedding_model_slug: 'openai-text-embedding-3-large' }`.
         * `[ ]`   Reject `{ operation: 'embedding', embedding_model_slug: 'slug' }` missing `embedding_vector`.
         * `[ ]`   Reject `{ operation: 'embedding', embedding_vector: 'not-an-array', embedding_model_slug: 'slug' }` (non-array `embedding_vector`).
         * `[ ]`   Reject `{ operation: 'embedding', embedding_vector: [0.1, 'x'], embedding_model_slug: 'slug' }` (non-numeric element in `embedding_vector`).
         * `[ ]`   Reject `{ operation: 'embedding', embedding_vector: [0.1] }` missing `embedding_model_slug`.
      * `[ ]`   Add `isSaveResponsePayload` tests for invalid discriminator:
         * `[ ]`   Reject payload missing `operation` field.
         * `[ ]`   Reject payload with unknown `operation: 'unknown'`.
      * `[ ]`   Add `isSaveResponseDeps` tests for `indexingService`:
         * `[ ]`   Accept deps object that includes `indexingService` with remaining required keys.
         * `[ ]`   Reject deps object missing `indexingService`.
      * `[ ]`   Preserve existing `isSaveResponseRequestBody`, `isSaveResponseParams`, `isSaveResponseDeps` (other keys), `isSaveResponseSuccessReturn`, `isSaveResponseErrorReturn` coverage.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.guard.ts`
      * `[ ]`   Rewrite `isSaveResponsePayload(v: unknown): v is SaveResponsePayload`:
         * `[ ]`   Reject non-records.
         * `[ ]`   Read `v.operation`; reject if not `'stream'` or `'embedding'`.
         * `[ ]`   If `operation === 'stream'`: require `assembled_content` is string; require `'token_usage' in v` and `isTokenUsageOrNull(v.token_usage)`; require `'finish_reason' in v` and `(v.finish_reason === null || typeof v.finish_reason === 'string')`; return true.
         * `[ ]`   If `operation === 'embedding'`: require `embedding_vector` is a non-empty `Array` of `number`s (every element passes `typeof el === 'number'`); require `embedding_model_slug` is a non-empty string; return true.
      * `[ ]`   Add `'indexingService'` to the keys array in `isSaveResponseDeps`.
      * `[ ]`   Keep `isSaveResponseRequestBody`, `isSaveResponseParams`, `isSaveResponseSuccessReturn`, `isSaveResponseErrorReturn`, `isTokenUsageOrNull`, and all other existing logic unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.mock.ts`
      * `[ ]`   Add `createMockEmbeddingSaveResponsePayload(overrides?: Partial<EmbeddingSaveResponsePayload>): EmbeddingSaveResponsePayload` factory returning `{ operation: 'embedding', embedding_vector: [0.1, 0.2, 0.3], embedding_model_slug: 'openai-text-embedding-3-large', ...overrides }`.
      * `[ ]`   Update `createMockSaveResponsePayload` (and any stream-default payload factory) to return `StreamSaveResponsePayload` by adding `operation: 'stream'` to the base fixture object.
      * `[ ]`   Add a mock `IIndexingService` stub to `createMockSaveResponseDeps`: `indexingService: { insertChunk: async () => ({ success: true, tokensUsed: 0 }) }` satisfying the `IIndexingService` interface from WS-0.
      * `[ ]`   Export override type `EmbeddingSaveResponsePayloadOverrides` aligned with the existing override-type pattern in the file.
      * `[ ]`   Preserve all existing factories: `createMockDialecticContributionRow`, `createMockContributionRow`, `createMockDialecticExecuteJobPayload`, `createMockJobRow`, `createMockFileManager`, `createMockSaveResponseDeps` (additive change only), `createMockSaveResponseErrorReturn`, `createMockSaveResponseParams`, `createMockSaveResponseParamsWithQueuedJob`, `createMockSaveResponseSuccessReturn`, `createSaveResponseParamsForInterfaceContract`, `createValidHeaderContext`, `saveResponseTestPayload`, `saveResponseTestPayloadDocumentArtifact`.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.test.ts`
      * `[ ]`   Update any existing test that constructs a `SaveResponsePayload` literal to add `operation: 'stream'` so it satisfies `StreamSaveResponsePayload`.
      * `[ ]`   Add: embedding payload with `operation: 'embedding'`, valid `embedding_vector`, valid `embedding_model_slug`, and a job row whose `payload` contains a valid `DialecticEmbeddingJobPayload` with `chunk_text` → `insertChunk` called exactly once → returns `{ status: 'completed' }`.
      * `[ ]`   Add: embedding payload where job row's `payload` is missing `chunk_text` → non-retriable error returned; `insertChunk` not called.
      * `[ ]`   Add: embedding payload where `extendedModelConfig.dimensions` is absent/null → non-retriable error; `insertChunk` not called.
      * `[ ]`   Add: `insertChunk` returns `{ success: false, error: new Error('db timeout'), tokensUsed: 0 }` → retriable error returned.
      * `[ ]`   Preserve existing enqueueRenderJob dispatch gating coverage.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.continue.test.ts`
      * `[ ]`   Update stream payload fixtures to include `operation: 'stream'`.
      * `[ ]`   Add targeted assertion that a payload with `operation: 'embedding'` does not enter stream continuation branch logic.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.pathContext.test.ts`
      * `[ ]`   Update stream payload fixtures to include `operation: 'stream'`.
      * `[ ]`   Assert operation-aware branching does not mutate stream path-context semantics.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.planValidation.test.ts`
      * `[ ]`   Update stream payload fixtures to include `operation: 'stream'`.
      * `[ ]`   Add assertion that embedding payload (`operation: 'embedding'`) bypasses all stream-plan JSON validation paths.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.rawJsonOnly.test.ts`
      * `[ ]`   Update stream payload fixtures to include `operation: 'stream'`.
      * `[ ]`   Add assertion that embedding branch does not enter raw-json sanitization/retry path.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.notifications.test.ts`
      * `[ ]`   Update stream payload fixtures to include `operation: 'stream'`.
      * `[ ]`   Add explicit assertion: embedding completion path does not trigger notification side-effects (explicit no-op expectation).

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.assembleDocument.test.ts`
      * `[ ]`   Update stream payload fixtures to include `operation: 'stream'`.
      * `[ ]`   Add assertion: embedding branch does not call `assembleAndSaveFinalDocument`.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.integration.test.ts`
      * `[ ]`   Update stream integration fixture payloads to include `operation: 'stream'`.
      * `[ ]`   Add embedding integration scenario: valid embedding payload + job row with `DialecticEmbeddingJobPayload` fields including `chunk_text`, `source_type`, `source_id` → real `saveResponse` called with mock `insertChunk` spy → spy called once with correct `chunkText`, `embedding_vector`, `dimensions`, and attribution fields → `{ status: 'completed' }` returned.
      * `[ ]`   Add embedding integration scenario: embedding payload where job payload is missing `chunk_text` → non-retriable error returned; `insertChunk` spy not called.
      * `[ ]`   Keep external boundaries mocked (real `saveResponse` function, mock DB client, mock deps) while exercising real `saveResponse` orchestration.

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.ts`
      * `[ ]`   After `isSaveResponsePayload(payload)` guard pass, branch on `payload.operation`:
         * `[ ]`   `'stream'` branch: continue with existing logic unchanged, accessing `payload.assembled_content`, `payload.token_usage`, `payload.finish_reason` only after narrowing to `StreamSaveResponsePayload`.
         * `[ ]`   `'embedding'` branch:
            * `[ ]`   Validate `job.payload` as `DialecticEmbeddingJobPayload` using `isDialecticEmbeddingJobPayload` guard (from WS-R's `type_guards.dialectic.ts`); return non-retriable error if guard fails.
            * `[ ]`   Extract `chunkText: string` from `embeddingJobPayload.chunk_text`; return non-retriable error if absent or not a string.
            * `[ ]`   Validate `extendedModelConfig.dimensions` is a finite positive number; return non-retriable error if absent.
            * `[ ]`   Build `attribution: InsertChunkAttribution` with `session_id: jobSessionId`, `user_id: projectOwnerUserId`, `wallet_id: walletId`, `source_type: embeddingJobPayload.source_type`, `source_id: embeddingJobPayload.source_id`, `idempotency_key: job.id`.
            * `[ ]`   `const insertResult = await deps.indexingService.insertChunk(chunkText, payload.embedding_vector, extendedModelConfig.dimensions, attribution)`.
            * `[ ]`   If `!insertResult.success`: return `{ error: insertResult.error ?? new Error('insertChunk failed'), retriable: true }`.
            * `[ ]`   Debit tokens via `deps.debitTokens` using `insertResult.tokensUsed` and real `walletId`.
            * `[ ]`   Update job status to `'completed'` in `dialectic_generation_jobs` via `dbClient`.
            * `[ ]`   Return `{ status: 'completed' }`.
            * `[ ]`   No calls to `enqueueRenderJob`, `buildUploadContext`, `fileManager`, `sanitizeJsonContent`, `continueJob`, `retryJob`, `determineContinuation`, or `resolveFinishReason` in this branch.
      * `[ ]`   Preserve all existing stream-branch code paths (validation, sanitization, continuation determination, debit, retry, notification, assembly, render-job enqueue).

   * `[ ]`   `supabase/functions/dialectic-worker/saveResponse/saveResponse.provides.ts`
      * `[ ]`   Add `StreamSaveResponsePayload` and `EmbeddingSaveResponsePayload` to the type re-exports from `saveResponse.interface.ts`.
      * `[ ]`   Add `createMockEmbeddingSaveResponsePayload` to the mock re-exports from `saveResponse.mock.ts`.
      * `[ ]`   Add `EmbeddingSaveResponsePayloadOverrides` to the type re-exports from `saveResponse.mock.ts`.
      * `[ ]`   Preserve all existing public exports consumed by `netlifyResponse`, `createJobContext`, and test surfaces.

   * `[ ]`   `construction`
      * `[ ]`   `saveResponse` remains a pure DI function over `SaveResponseDeps`/`SaveResponseParams`/`SaveResponsePayload`.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   `indexingService` is an ordinary required dep field injected at call time; no lazy initialization or factory pattern.
      * `[ ]`   Branch initialization order is deterministic: guard pass → operation branch → shared DB/provider/session lookups (both branches) → operation-specific persistence call → debit → status update → return.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is persistence orchestration boundary between callback ingest contract and contribution/memory storage domain.
      * `[ ]`   `indexingService` is an inbound shared-infrastructure dependency (WS-0 producer); direction is allowed.
      * `[ ]`   Stream-path deps (`fileManager`, `buildUploadContext`) remain inbound shared infrastructure; direction unchanged.
      * `[ ]`   Outbound effects remain DB/`indexingService`/`fileManager`/notification side effects behind existing dependency interfaces.
      * `[ ]`   No new dependency cycle introduced with enqueue or callback handler modules.

   * `[ ]`   `requirements`
      * `[ ]`   `SaveResponseDeps` includes `indexingService: IIndexingService`; `isSaveResponseDeps` enforces its presence at runtime.
      * `[ ]`   `SaveResponsePayload` is the discriminated union `StreamSaveResponsePayload | EmbeddingSaveResponsePayload`; both named subtypes are exported from `saveResponse.provides.ts`.
      * `[ ]`   `isSaveResponsePayload` branches on `operation` and enforces the correct field set for each variant; mixed-field and unknown-operation values are rejected.
      * `[ ]`   Stream branch behavior (continuation/retry/finalization/`enqueueRenderJob`) is unchanged and fully covered by existing test files updated with `operation: 'stream'` fixtures.
      * `[ ]`   Embedding branch calls `indexingService.insertChunk` with real attribution (no junk `user_id`/`wallet_id`); no `fileManager`, `buildUploadContext`, `enqueueRenderJob`, `sanitizeJsonContent`, `continueJob`, `retryJob`, `determineContinuation`, or `resolveFinishReason` calls in this branch.
      * `[ ]`   `chunkText` originates exclusively from `DialecticEmbeddingJobPayload.chunk_text` in the fetched job row payload; it is never read from the callback body.
      * `[ ]`   Guard/interface/mock/unit/integration files are synchronized to the operation-discriminated contracts.
      * `[ ]`   Node scope remains limited to `saveResponse.ts` and its immediate support system in this module.
      
* `[ ]`   supabase/functions/netlifyResponse/netlifyResponseHandler.ts **[BE] Add operation-aware callback ingest branching and typed handoff from saveResponse boundary**

   * `[ ]`   `objective`
      * `[ ]`   Solve callback ingest mismatch where `netlifyResponseHandler` only accepts stream-shaped payloads and cannot safely ingest embedding callback payload variants.
      * `[ ]`   Functional goals:
         * `[ ]`   Define `NetlifyStreamResponseBody` and `NetlifyEmbeddingResponseBody` as named discriminated-union members and replace the flat `NetlifyResponseBody` struct with their union.
         * `[ ]`   Update `isNetlifyResponseBody` to branch on `operation` and enforce the correct field set for each variant.
         * `[ ]`   Handler branches on `body.operation` after guard pass: stream body maps to `StreamSaveResponsePayload`; embedding body maps to `EmbeddingSaveResponsePayload`.
         * `[ ]`   Preserve HMAC signature verification and job TTL authorization semantics unchanged.
         * `[ ]`   Preserve existing HTTP status semantics for method/JSON/body validation/auth/saveResponse outcomes.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Stream callback behavior remains backward-compatible; only `operation: 'stream'` key addition required in Netlify worker payloads.
         * `[ ]`   Invalid operation/body combinations fail fast with 400 responses before saveResponse invocation.
         * `[ ]`   `saveResponse.ts` source implementation is not changed in this node.
         * `[ ]`   Boundary wiring in `netlifyResponse/index.ts` remains unchanged in this node.
      * `[ ]`   Each goal is atomic and testable via interface, guard, mock, unit, and integration updates.

   * `[ ]`   `role`
      * `[ ]`   Node role is Supabase callback-ingest handler implementation plus immediate callback support files.
      * `[ ]`   This role is correct because `netlifyResponseHandler.ts` is the first Supabase callback consumer that must interpret operation-aware Netlify payloads before `saveResponse` execution.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `saveResponse.ts` source behavior in this node.
         * `[ ]`   Do not edit Netlify worker source behavior in this node.
         * `[ ]`   Do not edit enqueue source behavior in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/netlifyResponse` callback verification and handoff.
      * `[ ]`   Inside boundary:
         * `[ ]`   HTTP body parsing and operation-aware request validation.
         * `[ ]`   Job lookup, signature verification, and TTL authorization.
         * `[ ]`   Operation-specific payload mapping into `StreamSaveResponsePayload` or `EmbeddingSaveResponsePayload` contract variants.
      * `[ ]`   Outside boundary:
         * `[ ]`   Queue payload construction and enqueue state transitions.
         * `[ ]`   `saveResponse` persistence, debit, continuation, and render-enqueue logic.
         * `[ ]`   Provider adapter execution internals.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../dialectic-worker/saveResponse/saveResponse.interface.ts` and `SaveResponseFn` boundary (via `saveResponse.provides.ts`).
         * `[ ]`   Layer classification: immediate consumer contract.
         * `[ ]`   Direction: callback handler passes validated operation-discriminated payload into `saveResponse` boundary.
         * `[ ]`   Purpose: preserve strict handoff typing for stream and embedding operation-specific callback semantics.
      * `[ ]`   Provider: `../_shared/utils/computeJobSig/computeJobSig.interface.ts`.
         * `[ ]`   Layer classification: shared auth/security utility contract.
         * `[ ]`   Direction: inbound dependency consumed by callback handler.
         * `[ ]`   Purpose: deterministic HMAC verification over persisted job row identity.
      * `[ ]`   Provider: `netlify/functions/ai-stream-background` callback payload contract output.
         * `[ ]`   Layer classification: external producer boundary.
         * `[ ]`   Direction: inbound request consumed by callback handler.
         * `[ ]`   Purpose: ensure operation-aware stream and embedding payload variants are accepted and mapped correctly.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from callback handler into `saveResponse` source internals.
         * `[ ]`   No lateral layer violations across Supabase WS-B nodes.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `computeJobSig(job.id, job.user_id, job.created_at): Promise<string>` for authorization.
         * `[ ]`   `SaveResponseFn` accepting `StreamSaveResponsePayload | EmbeddingSaveResponsePayload` union (updated in preceding saveResponse node).
         * `[ ]`   `adminClient` read access to `dialectic_generation_jobs` (`id`, `user_id`, `created_at` columns only).
      * `[ ]`   Injection shape remains `NetlifyResponseDeps` unchanged; only `NetlifyResponseBody` type changes.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of non-identity DB columns during signature verification.
         * `[ ]`   No hidden coupling to persistence internals beyond `SaveResponseFn` contract.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.interface.test.ts`
      * `[ ]`   Replace the existing `"Contract: NetlifyResponseBody surface declares five required fields"` test with two variant surface tests:
         * `[ ]`   `NetlifyStreamResponseBody` surface has exactly 6 keys: `operation`, `job_id`, `assembled_content`, `token_usage`, `finish_reason`, `sig`.
         * `[ ]`   `NetlifyEmbeddingResponseBody` surface has exactly 5 keys: `operation`, `job_id`, `embedding_vector`, `embedding_model_slug`, `sig`.
      * `[ ]`   Replace the existing `"Contract: NetlifyResponseBody valid — all fields with NodeTokenUsage"` test with a stream-variant test:
         * `[ ]`   Valid `NetlifyStreamResponseBody`: `operation: 'stream'`, `job_id` string, `assembled_content` string, `token_usage` NodeTokenUsage, `finish_reason` string, `sig` string.
      * `[ ]`   Replace the existing `"Contract: NetlifyResponseBody valid — token_usage and finish_reason are nullable"` test with a stream-variant nullable test:
         * `[ ]`   Valid `NetlifyStreamResponseBody` with `token_usage: null`, `finish_reason: null`.
      * `[ ]`   Add valid `NetlifyEmbeddingResponseBody` contract test:
         * `[ ]`   `operation: 'embedding'`, `job_id` string, `embedding_vector` is `number[]`, `embedding_model_slug` string, `sig` string.
         * `[ ]`   `operation` literal is `'embedding'`; `embedding_vector` is an array.
      * `[ ]`   Preserve existing `NetlifyResponseDeps` surface (4 keys) and `NetlifyResponseHandlerFn` contract assertions unchanged.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.interface.ts`
      * `[ ]`   Define `NetlifyStreamResponseBody = { operation: 'stream'; job_id: string; assembled_content: string; token_usage: NodeTokenUsage | null; finish_reason: string | null; sig: string }`.
      * `[ ]`   Define `NetlifyEmbeddingResponseBody = { operation: 'embedding'; job_id: string; embedding_vector: number[]; embedding_model_slug: string; sig: string }`.
      * `[ ]`   Replace the flat `NetlifyResponseBody` struct with `export type NetlifyResponseBody = NetlifyStreamResponseBody | NetlifyEmbeddingResponseBody`.
      * `[ ]`   Export both named subtype aliases so test and mock files can import them directly.
      * `[ ]`   Keep `NetlifyResponseDeps` and `NetlifyResponseHandlerFn` signatures unchanged.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.interaction.spec`
      * `[ ]`   Add interaction-spec file capturing callback flow and branching:
         * `[ ]`   Method gate (non-POST → 405) and JSON parse gate (malformed → 400).
         * `[ ]`   Operation-aware body guard gate: missing `operation` → 400; unknown `operation` → 400; valid stream → continue; valid embedding → continue.
         * `[ ]`   Job lookup and signature/TTL authorization (unchanged from current behavior).
         * `[ ]`   Stream-to-saveResponse payload mapping: `body.assembled_content`, `body.token_usage`, `body.finish_reason` → `StreamSaveResponsePayload`.
         * `[ ]`   Embedding-to-saveResponse payload mapping: `body.embedding_vector`, `body.embedding_model_slug` → `EmbeddingSaveResponsePayload`.
      * `[ ]`   Define failure modes:
         * `[ ]`   Invalid method/JSON/body shape → deterministic 4xx.
         * `[ ]`   Signature mismatch or expired job → 401.
         * `[ ]`   saveResponse retriable error return → 503.
         * `[ ]`   saveResponse non-retriable error return → 500.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.guard.test.ts`
      * `[ ]`   Update existing stream-variant valid tests to include `operation: 'stream'` in the body fixture:
         * `[ ]`   `"Guard: isNetlifyResponseBody accepts full valid body with NodeTokenUsage"` — add `operation: 'stream'`.
         * `[ ]`   `"Guard: isNetlifyResponseBody accepts null token_usage and null finish_reason"` — add `operation: 'stream'`.
      * `[ ]`   Update existing invalid tests where the fixture should be a stream body that is then made invalid:
         * `[ ]`   `"Guard: isNetlifyResponseBody rejects missing assembled_content"` — add `operation: 'stream'` so the rejection is correctly attributed to the missing stream field, not a missing `operation`.
         * `[ ]`   `"Guard: isNetlifyResponseBody rejects job_id that is not a string"` — add `operation: 'stream'`.
         * `[ ]`   `"Guard: isNetlifyResponseBody rejects sig that is not a string"` — add `operation: 'stream'`.
         * `[ ]`   `"Guard: isNetlifyResponseBody rejects missing job_id"` — add `operation: 'stream'`.
         * `[ ]`   `"Guard: isNetlifyResponseBody rejects missing sig"` — add `operation: 'stream'`.
      * `[ ]`   Add embedding-variant valid test:
         * `[ ]`   Accept `{ operation: 'embedding', job_id: 'j', embedding_vector: [0.1, 0.2], embedding_model_slug: 'openai-text-embedding-3-large', sig: 's' }`.
      * `[ ]`   Add embedding-variant invalid tests:
         * `[ ]`   Reject `{ operation: 'embedding', job_id: 'j', embedding_model_slug: 'slug', sig: 's' }` (missing `embedding_vector`).
         * `[ ]`   Reject `{ operation: 'embedding', job_id: 'j', embedding_vector: 'not-array', embedding_model_slug: 'slug', sig: 's' }` (non-array `embedding_vector`).
         * `[ ]`   Reject `{ operation: 'embedding', job_id: 'j', embedding_vector: [0.1, 'x'], embedding_model_slug: 'slug', sig: 's' }` (non-numeric element).
         * `[ ]`   Reject `{ operation: 'embedding', job_id: 'j', embedding_vector: [0.1], sig: 's' }` (missing `embedding_model_slug`).
      * `[ ]`   Add discriminator invalid tests:
         * `[ ]`   Reject body with no `operation` field at all.
         * `[ ]`   Reject body with `operation: 'unknown'`.
      * `[ ]`   Preserve all existing `isNetlifyResponseDeps` coverage unchanged.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.guard.ts`
      * `[ ]`   Rewrite `isNetlifyResponseBody(value: unknown): value is NetlifyResponseBody`:
         * `[ ]`   Reject `null` or non-object.
         * `[ ]`   Cast to record; read `v['operation']`.
         * `[ ]`   Reject if `operation` is not `'stream'` or `'embedding'`.
         * `[ ]`   For all variants: require `typeof v['job_id'] === 'string'` and `typeof v['sig'] === 'string'`.
         * `[ ]`   If `operation === 'stream'`: require `typeof v['assembled_content'] === 'string'`; require `v['token_usage'] === null || (typeof v['token_usage'] === 'object' && v['token_usage'] !== null)`; require `v['finish_reason'] === null || typeof v['finish_reason'] === 'string'`; return true.
         * `[ ]`   If `operation === 'embedding'`: require `Array.isArray(v['embedding_vector'])` and every element of `v['embedding_vector']` passes `typeof el === 'number'`; require `typeof v['embedding_model_slug'] === 'string'` and `v['embedding_model_slug'] !== ''`; return true.
      * `[ ]`   Keep `isNetlifyResponseDeps` unchanged.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.mock.ts`
      * `[ ]`   Add `createMockNetlifyStreamResponseBody(overrides?: Partial<NetlifyStreamResponseBody>): NetlifyStreamResponseBody` factory returning `{ operation: 'stream', job_id: 'mock-job-id', assembled_content: 'mock content', token_usage: null, finish_reason: null, sig: 'mock-sig', ...overrides }`.
      * `[ ]`   Add `createMockNetlifyEmbeddingResponseBody(overrides?: Partial<NetlifyEmbeddingResponseBody>): NetlifyEmbeddingResponseBody` factory returning `{ operation: 'embedding', job_id: 'mock-job-id', embedding_vector: [0.1, 0.2, 0.3], embedding_model_slug: 'openai-text-embedding-3-large', sig: 'mock-sig', ...overrides }`.
      * `[ ]`   Add imports for `NetlifyStreamResponseBody` and `NetlifyEmbeddingResponseBody` from `./netlifyResponse.interface.ts`.
      * `[ ]`   Preserve `MockJobRow`, `CreateMockNetlifyResponseDepsOverrides`, `createMockNetlifyResponseDeps`, and `mockNetlifyResponseHandler` unchanged.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponseHandler.test.ts`
      * `[ ]`   Update all existing test request bodies that contain `assembled_content` to add `operation: 'stream'` so they continue to pass the updated guard. Affected tests (all existing unit tests use stream-shaped bodies):
         * `[ ]`   `"Handler: POST + valid sig + unexpired job → saveResponse called; 200 completed"`
         * `[ ]`   `"Handler: POST + valid sig + unexpired job + saveResponse retriable error → 503"`
         * `[ ]`   `"Handler: POST + valid sig + unexpired job + saveResponse non-retriable error → 500"`
         * `[ ]`   `"Handler: POST + sig mismatch → 401; saveResponse not called"`
         * `[ ]`   `"Handler: POST + expired job → 401; saveResponse not called"`
         * `[ ]`   `"Handler: POST + job not found in DB → 404; saveResponse not called"`
         * `[ ]`   `"Handler: POST + body missing sig → 400; saveResponse not called"`
         * `[ ]`   `"Handler: POST + body missing job_id → 400; saveResponse not called"`
      * `[ ]`   Add stream callback body → payload mapping test:
         * `[ ]`   Valid `operation: 'stream'` body → `saveResponse` called with `StreamSaveResponsePayload` whose `operation === 'stream'`, `assembled_content`, `token_usage`, `finish_reason` match body fields → 200.
      * `[ ]`   Add embedding callback body → payload mapping test:
         * `[ ]`   Valid `operation: 'embedding'` body with `embedding_vector: [0.1, 0.2]`, `embedding_model_slug: 'openai-text-embedding-3-large'` → `saveResponse` called with `EmbeddingSaveResponsePayload` whose `operation === 'embedding'`, `embedding_vector`, `embedding_model_slug` match body fields → 200.
      * `[ ]`   Add missing `operation` → 400 test:
         * `[ ]`   Body `{ job_id: 'j', assembled_content: 'c', token_usage: null, finish_reason: null, sig: 's' }` (no `operation`) → guard fails → 400; `saveResponse` not called.
      * `[ ]`   Add unknown `operation` → 400 test:
         * `[ ]`   Body `{ operation: 'render', job_id: 'j', sig: 's' }` → guard fails → 400; `saveResponse` not called.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponseHandler.ts`
      * `[ ]`   Add imports for `StreamSaveResponsePayload` and `EmbeddingSaveResponsePayload` from `../dialectic-worker/saveResponse/saveResponse.provides.ts`.
      * `[ ]`   Replace the current `srPayload` construction block with an operation-discriminated branch:
         * `[ ]`   `if (body.operation === 'stream') { srPayload = { operation: 'stream', assembled_content: body.assembled_content, token_usage: body.token_usage, finish_reason: body.finish_reason }; }` (typed as `StreamSaveResponsePayload`).
         * `[ ]`   `else { srPayload = { operation: 'embedding', embedding_vector: body.embedding_vector, embedding_model_slug: body.embedding_model_slug }; }` (typed as `EmbeddingSaveResponsePayload`).
         * `[ ]`   Declare `let srPayload: SaveResponsePayload;` before the branch.
      * `[ ]`   Preserve existing authorization flow order unchanged:
         * `[ ]`   DB identity lookup (`id`, `user_id`, `created_at`).
         * `[ ]`   Compute expected signature.
         * `[ ]`   Constant-time signature mismatch check.
         * `[ ]`   TTL expiry check.
      * `[ ]`   Preserve existing HTTP response mapping for `saveResponse` success/retriable/non-retriable returns unchanged.

   * `[ ]`   `supabase/functions/netlifyResponse/netlifyResponse.integration.test.ts`
      * `[ ]`   Update all existing integration test request bodies that contain `assembled_content` to add `operation: 'stream'`. Affected tests:
         * `[ ]`   `"Integration: valid sig + unexpired job → 200; saveResponse called"` — add `operation: 'stream'` to request body JSON.
         * `[ ]`   `"Integration: invalid sig → 401; saveResponse not called"` — add `operation: 'stream'` to request body JSON.
         * `[ ]`   `"Integration: expired job → 401; saveResponse not called"` — add `operation: 'stream'` to request body JSON.
         * `[ ]`   `"Integration: missing job_id → 400; no DB call made"` — add `operation: 'stream'` to request body JSON (body currently lacks `job_id` but has `assembled_content`; the guard will now also reject for missing `operation`, so the 400 result is preserved — but adding `operation: 'stream'` ensures the rejection is specifically for missing `job_id` as intended).
      * `[ ]`   Add embedding callback integration scenario:
         * `[ ]`   Valid `operation: 'embedding'` body with real HMAC sig, unexpired job → `saveResponse` called once with `EmbeddingSaveResponsePayload` → 200.
      * `[ ]`   Add invalid operation integration scenario:
         * `[ ]`   Body with `operation: 'render'` or no `operation` field → 400; `saveResponse` not called; no DB call made.
      * `[ ]`   Keep all external boundaries mocked (real `netlifyResponseHandler`, real `createComputeJobSig`, mock DB client, mock `saveResponse` fn).

   * `[ ]`   `construction`
      * `[ ]`   `netlifyResponseHandler` remains a pure DI function over `NetlifyResponseDeps` and `Request`.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Authorization flow order is deterministic and test-covered.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is callback boundary adapter between Netlify worker output and `saveResponse` input.
      * `[ ]`   Dependencies remain inward-facing from shared security utility, admin DB client, and `saveResponse` contract (produced by preceding saveResponse node in WS-B).
      * `[ ]`   Outbound boundary remains `saveResponse` invocation plus HTTP response semantics.
      * `[ ]`   No dependency cycle introduced with enqueue source or `saveResponse` source.

   * `[ ]`   `requirements`
      * `[ ]`   `NetlifyResponseBody` is the discriminated union `NetlifyStreamResponseBody | NetlifyEmbeddingResponseBody`; both named subtypes are exported from `netlifyResponse.interface.ts`.
      * `[ ]`   `isNetlifyResponseBody` branches on `operation` and enforces the correct field set for each variant; missing-`operation` and unknown-`operation` values are rejected with 400.
      * `[ ]`   Handler maps `body.operation === 'stream'` to `StreamSaveResponsePayload` and `body.operation === 'embedding'` to `EmbeddingSaveResponsePayload` with no mixed-field ambiguity.
      * `[ ]`   Signature verification and TTL authorization behavior are unchanged and fully covered by existing tests (updated with `operation: 'stream'` fixtures).
      * `[ ]`   Interface/guard/mock/unit/integration files prove deterministic 200/400/401/404/503/500 behavior remains correct for stream and embedding operation variants.
      * `[ ]`   `saveResponse.ts` source work is complete in the preceding node.

   * `[ ]`   **Commit** `feat(supabase-worker): complete operation-aware callback ingest and save-response persistence routing`
      * `[ ]`   Structural changes:
         * `[ ]`   `NetlifyResponseBody` and `SaveResponsePayload` are operation-discriminated unions across the Supabase callback boundary.
         * `[ ]`   Interface, guard, mock, unit, and integration files for both WS-B source nodes are synchronized to operation-discriminated payload semantics.
      * `[ ]`   Behavioral changes:
         * `[ ]`   Supabase callback flow accepts `operation: 'stream'` and `operation: 'embedding'` payloads, authorizes deterministically, and maps each to the correct `SaveResponsePayload` variant before invoking `saveResponse`.
         * `[ ]`   `saveResponse` embedding branch writes chunk text and vector to `dialectic_memory` via `indexingService.insertChunk` with real attribution; stream branch behavior is unchanged.
      * `[ ]`   Contract changes:
         * `[ ]`   `NetlifyResponseBody` is `NetlifyStreamResponseBody | NetlifyEmbeddingResponseBody`.
         * `[ ]`   `SaveResponsePayload` is `StreamSaveResponsePayload | EmbeddingSaveResponsePayload`.
         * `[ ]`   `SaveResponseDeps` adds `indexingService: IIndexingService`.

## WS-C — ARTIFACT PERSISTENCE: RagContextSummary

* `[ ]`   supabase/functions/_shared/utils/path_constructor.ts **[BE] Extend RagContextSummary path construction to encode target document identity and prevent cross-document filename collisions within a stage**

   * `[ ]`   `objective`
      * `[ ]`   Solve the cross-document filename collision where `constructStoragePath` for `FileType.RagContextSummary` produces `{modelSlug}_compressing_{sourceModelSlugs}_rag_summary.txt` regardless of which source document is being compressed; two documents compressed by the same model in the same stage/session/iteration overwrite each other's storage artifact.
      * `[ ]`   Functional goals:
         * `[ ]`   Require `documentKey` (non-empty string) in `PathContext` for `FileType.RagContextSummary`; throw with an explicit, identifying error message when it is absent or empty.
         * `[ ]`   Produce filename `{modelSlugSanitized}_compressing_{sourceModelSlugsSanitized}_for_{documentKeySanitized}_rag_summary.txt`, making each compression artifact unique per target document within a stage context.
         * `[ ]`   Apply `sanitizeForPath` to `documentKey` consistently with the existing sanitization applied to `modelSlug` and each element of `sourceModelSlugs`.
         * `[ ]`   Update existing `path_constructor.test.ts` RagContextSummary test and parameterized round-trip test to include `documentKey` and assert the new filename format.
         * `[ ]`   Add new failure tests asserting the throw when `documentKey` is absent or empty.
         * `[ ]`   Create `supabase/functions/_shared/utils/path_constructor.integration.test.ts` proving the `constructStoragePath` → `deconstructStoragePath` round-trip for the new RagContextSummary format; this test will be RED until `path_deconstructor.ts` is updated in the next node.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No changes to any other `FileType` switch case, helper function (`sanitizeForPath`, `generateShortId`, `mapStageSlugToDirName`), or the top-of-function `isDocumentKey` validation block.
         * `[ ]`   No changes to `path_deconstructor.ts`, `file_manager.ts`, or any other file outside the `path_constructor.ts` support system.
         * `[ ]`   `storagePath` for `RagContextSummary` remains `{stageRootPath}/_work` unchanged.
      * `[ ]`   Each goal is atomic and testable through existing and new assertions in `path_constructor.test.ts` and the new `path_constructor.integration.test.ts`.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared path-construction utility update (`_shared/utils`).
      * `[ ]`   This role is correct because `constructStoragePath` is the sole function responsible for producing deterministic storage paths for all artifact types; the collision fix must be made here so all callers automatically receive the corrected path with no additional changes.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not alter path-parsing/deconstruction logic; that belongs in the `path_deconstructor.ts` node (next WS-C node).
         * `[ ]`   Do not alter storage-registration logic; that belongs in the `file_manager.ts` node (third WS-C node).
         * `[ ]`   Do not alter any non-RagContextSummary path-construction case.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/utils/path_constructor.ts` and its immediate test and documentation files.
      * `[ ]`   Inside boundary: `PathContext` → `ConstructedPath` transformation for all `FileType` values, including the updated RagContextSummary case.
      * `[ ]`   Outside boundary: path-parse semantics (`path_deconstructor.ts`), storage-registration (`file_manager.ts`), and any consumer of the produced path.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `supabase/functions/_shared/types/file_manager.types.ts` (`FileType`, `PathContext`).
         * `[ ]`   Layer classification: local type contract.
         * `[ ]`   Direction: inward (consumed); no change to this file in this node.
         * `[ ]`   Purpose: provides `FileType.RagContextSummary` constant and `PathContext.documentKey?: string` field already present.
      * `[ ]`   Provider: `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.ts` (`isDocumentKey`).
         * `[ ]`   Layer classification: local type guard.
         * `[ ]`   Direction: inward (consumed); no change to this file in this node.
         * `[ ]`   Purpose: used in the top-of-function `isDocumentKey` validation block; unchanged.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from `path_constructor.ts` into any service or worker module.
         * `[ ]`   No new dependency introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal interface required:
         * `[ ]`   `PathContext.documentKey?: string` — already present in the type; no type change needed; the new validation consumes this existing optional field.
         * `[ ]`   `FileType.RagContextSummary = 'rag_context_summary'` — already present; no change.
         * `[ ]`   `sanitizeForPath(input: string): string` — internal helper; no change.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; only `documentKey`, `modelSlug`, `sourceModelSlugs`, `stageRootPath` are consumed in this case.
         * `[ ]`   No hidden coupling to any external service or DI surface.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.test.ts`
      * `[ ]`   In the parameterized round-trip test (`'constructStoragePath and deconstructStoragePath should be perfect inverses'`), inside the `else if (fileType === FileType.RagContextSummary)` branch (currently at line ~81):
         * `[ ]`   Add `context.documentKey = documentKey;` immediately after `context.sourceModelSlugs = sourceModelSlugs;`. The `documentKey` variable at the top of that test is `'executive_summary'`.
      * `[ ]`   In the same parameterized test, inside the `if (fileType === FileType.RagContextSummary)` early-return block (currently at line ~93):
         * `[ ]`   Add `documentKey: documentKey` to the `expectedDeconstructed` object alongside the existing `modelSlug` and `sourceModelSlugs` fields.
      * `[ ]`   In the `'should construct paths for all stage-specific file types'` test group, update the existing `'constructs path for rag_context_summary'` step (currently at line ~867):
         * `[ ]`   Change `{ ...baseContext, stageSlug: 'synthesis', fileType: FileType.RagContextSummary }` to `{ ...baseContext, stageSlug: 'synthesis', fileType: FileType.RagContextSummary, documentKey: FileType.business_case }`.
         * `[ ]`   Change the `assertEquals(fileName, ...)` assertion from `'gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_rag_summary.txt'` to `'gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_for_business_case_rag_summary.txt'`.
      * `[ ]`   In the `'should throw errors for missing context'` test group, add the following new step immediately after the existing `'constructs path for rag_context_summary'` step:
         * `[ ]`   `'throws if documentKey is missing for rag_context_summary'`: call `constructStoragePath({ ...baseContext, stageSlug: 'synthesis', fileType: FileType.RagContextSummary })` (no `documentKey`) and assert it throws an `Error` with a message that includes `'documentKey'`.
         * `[ ]`   `'throws if documentKey is empty string for rag_context_summary'`: call `constructStoragePath({ ...baseContext, stageSlug: 'synthesis', fileType: FileType.RagContextSummary, documentKey: '' })` and assert it throws an `Error` with a message that includes `'documentKey'`.
      * `[ ]`   Preserve all other existing test steps and assertions unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.readme.md`
      * `[ ]`   In the `RAG Context Summary` subsection under the `### Utility Artifacts` section:
         * `[ ]`   Update the described filename pattern from `{modelSlug}_compressing_{sourceModelSlugs}_rag_summary.txt` to `{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKeySanitized}_rag_summary.txt`.
         * `[ ]`   Add documentation that `documentKey` (non-empty string from `PathContext.documentKey`) is now a required parameter for this file type; the key is sanitized with `sanitizeForPath` before embedding in the filename.
         * `[ ]`   Add documentation that the `_for_{documentKey}` segment encodes the target document identity so that multiple documents compressed in the same stage/session/iteration produce distinct filenames.
      * `[ ]`   Preserve all other sections of the readme unchanged.

   * `[ ]`   `construction`
      * `[ ]`   `constructStoragePath` is a pure exported function; no constructor or factory entrypoint.
      * `[ ]`   No partially constructed instances possible; all inputs are value objects.
      * `[ ]`   Initialization order within the updated `FileType.RagContextSummary` case: guard check (`stageRootPath`, `modelSlugSanitized`, `sourceModelSlugs.length > 0`, `documentKey` non-empty string) → `documentKeySanitized = sanitizeForPath(documentKey)` → `sourceModelSlugsSanitized = [...sourceModelSlugs].sort().map(sanitizeForPath).join('_and_')` → `fileName` assembly → return `{ storagePath: \`${stageRootPath}/_work\`, fileName }`.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.ts`
      * `[ ]`   In the `FileType.RagContextSummary` switch case body (currently at line ~289):
         * `[ ]`   Extend the existing guard condition from `if (!stageRootPath || !modelSlugSanitized || !sourceModelSlugs || sourceModelSlugs.length === 0)` to also include `|| !documentKey || typeof documentKey !== 'string' || documentKey.trim() === ''`. The throw message must be updated to `'Required context missing for rag_context_summary: stageRootPath, modelSlug, sourceModelSlugs (non-empty), and documentKey (non-empty string) are all required.'`.
         * `[ ]`   Immediately after the guard, add: `const documentKeySanitized = sanitizeForPath(documentKey);`.
         * `[ ]`   Change `const fileName = \`${modelSlugSanitized}_compressing_${sourceModelSlugsSanitized}_rag_summary.txt\`` to `const fileName = \`${modelSlugSanitized}_compressing_${sourceModelSlugsSanitized}_for_${documentKeySanitized}_rag_summary.txt\``.
      * `[ ]`   Keep all other switch cases, the top-of-function `isDocumentKey` validation block, and all helper functions (`sanitizeForPath`, `generateShortId`, `mapStageSlugToDirName`) unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.integration.test.ts`
      * `[ ]`   Create this new file to prove the `constructStoragePath` → `deconstructStoragePath` round-trip for the updated RagContextSummary filename pattern. This test will be RED until `path_deconstructor.ts` is updated in the next WS-C node.
      * `[ ]`   Import `constructStoragePath` from `./path_constructor.ts` and `deconstructStoragePath` from `./path_deconstructor.ts`; import `FileType` and `PathContext` from `../types/file_manager.types.ts`; import `assertEquals` from `https://deno.land/std@0.177.0/testing/asserts.ts`. No external service calls.
      * `[ ]`   Add test `'RagContextSummary constructStoragePath → deconstructStoragePath round-trip preserves documentKey'`:
         * `[ ]`   Construct input context: `{ projectId: 'proj-1', sessionId: 'session-uuid-1234', iteration: 1, stageSlug: 'thesis', modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['claude-3-opus', 'gemini-1.5-pro'], fileType: FileType.RagContextSummary, documentKey: FileType.business_case }`.
         * `[ ]`   Call `constructStoragePath(context)` → `{ storagePath, fileName }`.
         * `[ ]`   Call `deconstructStoragePath({ storageDir: storagePath, fileName })` → `info`.
         * `[ ]`   Assert `info.documentKey === FileType.business_case`.
         * `[ ]`   Assert `info.fileTypeGuess === FileType.RagContextSummary`.
         * `[ ]`   Assert `info.modelSlug === 'gpt-4-turbo'`.
         * `[ ]`   Assert `info.sourceModelSlugs` deep-equals `['claude-3-opus', 'gemini-1.5-pro']` (sorted order as produced by constructStoragePath).
         * `[ ]`   Assert `info.stageSlug === 'thesis'`.
      * `[ ]`   Add test `'RagContextSummary constructStoragePath produces _for_{documentKey} segment in fileName'`:
         * `[ ]`   Construct same context as above.
         * `[ ]`   Call `constructStoragePath(context)` → `{ fileName }`.
         * `[ ]`   Assert `fileName` includes `'_for_business_case_'`.
         * `[ ]`   Assert `fileName` ends with `'_rag_summary.txt'`.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared path-construction utility (`_shared/utils`); no service, worker, or adapter coupling.
      * `[ ]`   Dependencies are inward-facing: types from `file_manager.types.ts` and type guard from `type_guards.file_manager.ts`; both unchanged.
      * `[ ]`   Provides outward: `constructStoragePath` consumed by `file_manager.ts` via DI injection and by tests; no direct access required beyond this export.
      * `[ ]`   No cycles introduced; `path_constructor.ts` does not import from any consumer.

   * `[ ]`   `requirements`
      * `[ ]`   `constructStoragePath` for `FileType.RagContextSummary` with a valid `documentKey` produces `fileName = '{modelSlugSanitized}_compressing_{sourceModelSlugsSanitized}_for_{documentKeySanitized}_rag_summary.txt'` and `storagePath = '{stageRootPath}/_work'`.
      * `[ ]`   `constructStoragePath` for `FileType.RagContextSummary` with `documentKey` absent or empty string throws an `Error` whose message includes `'documentKey'`.
      * `[ ]`   `sanitizeForPath` is applied to `documentKey` identically to how it is applied to `modelSlug` and each element of `sourceModelSlugs`; no raw unsanitized values appear in the filename.
      * `[ ]`   Two calls differing only in `documentKey` (`'business_case'` vs `'feature_spec'`) produce distinct `fileName` values.
      * `[ ]`   All other `FileType` path-construction cases produce identical output before and after this change.
      * `[ ]`   All existing `path_constructor.test.ts` tests pass with updated RagContextSummary fixture and assertions.
      * `[ ]`   New `path_constructor.test.ts` failure tests pass asserting throws for absent/empty `documentKey`.
      * `[ ]`   `path_constructor.integration.test.ts` round-trip test is RED until `path_deconstructor.ts` is updated; no commit is made in this node; commit follows completion of the `file_manager.ts` node.

* `[ ]`   supabase/functions/_shared/utils/path_deconstructor.ts **[BE] Update RagContextSummary path parsing to extract target document identity from the new `_for_{documentKey}` filename segment**

   * `[ ]`   `objective`
      * `[ ]`   Solve the RagContextSummary deconstruction gap where the existing `ragSummaryPatternString` regex cannot parse the new `{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKey}_rag_summary.txt` filename format introduced by the path_constructor node, leaving `documentKey` unextracted and the `path_constructor.integration.test.ts` round-trip assertions in RED state.
      * `[ ]`   Functional goals:
         * `[ ]`   Update `ragSummaryPatternString` (defined at line 58) to add a seventh capture group for `documentKey`, matching the segment between the final `_for_` delimiter and `_rag_summary.txt`.
         * `[ ]`   Update both parse blocks that use `ragSummaryPatternString` (at line ~623 and line ~763) to extract `matches[7]` as `info.documentKey`.
         * `[ ]`   Update the direct `'[path_deconstructor] direct - rag_context_summary'` test to include `documentKey` in the constructed context and assert `info.documentKey` in the deconstructed output.
         * `[ ]`   Update the `'rag_context_summary'` entry in the `constructDeconstructTestCases` parameterized array to include `documentKey` in context and update `expectedFixedFileNameInPath` to the new format.
         * `[ ]`   Turn the `path_constructor.integration.test.ts` round-trip test GREEN by delivering the matching implementation.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   All other pattern strings and match blocks in `path_deconstructor.ts` are unchanged.
         * `[ ]`   `deconstructStoragePath` remains a pure function with no side effects.
         * `[ ]`   The `DeconstructedPathInfo` type already has `documentKey?: string` — no type change required.
      * `[ ]`   Each goal is atomic and testable through updated assertions in `path_deconstructor.test.ts` and the now-GREEN `path_constructor.integration.test.ts`.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared path-parsing utility update (`_shared/utils`).
      * `[ ]`   This role is correct because `deconstructStoragePath` is the sole function responsible for parsing storage paths back to structured identity fields; the new `documentKey` segment introduced by the path_constructor node can only be extracted here.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not alter path-construction logic; that is the path_constructor.ts node (preceding).
         * `[ ]`   Do not alter file_manager.ts storage registration; that is the file_manager.ts node (following).
         * `[ ]`   Do not alter any non-RagContextSummary pattern or parse block.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/utils/path_deconstructor.ts` and its immediate test files.
      * `[ ]`   Inside boundary: storage path string → `DeconstructedPathInfo` value object for all known `FileType` path formats.
      * `[ ]`   Outside boundary: path-construction semantics (path_constructor.ts), storage registration (file_manager.ts), any consumer of the parsed identity fields.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `supabase/functions/_shared/types/file_manager.types.ts` (`FileType`).
         * `[ ]`   Layer classification: local type contract.
         * `[ ]`   Direction: inward (consumed); no change to this file in this node.
         * `[ ]`   Purpose: provides `FileType.RagContextSummary` constant already present.
      * `[ ]`   Provider: `./path_deconstructor.types.ts` (`DeconstructedPathInfo`).
         * `[ ]`   Layer classification: local type contract.
         * `[ ]`   Direction: inward (consumed); no change required — `documentKey?: string` already exists in `DeconstructedPathInfo`.
         * `[ ]`   Purpose: defines the output shape returned by `deconstructStoragePath`.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from `path_deconstructor.ts` into any service or worker module.
         * `[ ]`   No new dependency introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal interface required:
         * `[ ]`   `DeconstructedPathInfo.documentKey?: string` — already present; no type change needed.
         * `[ ]`   `FileType.RagContextSummary` — already present; no change.
         * `[ ]`   `mapDirNameToStageSlug` — internal helper; unchanged.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; only the regex pattern string and the `info` assignment lines for the RagContextSummary case are touched.
         * `[ ]`   No hidden coupling introduced.

   * `[ ]`   `supabase/functions/_shared/utils/path_deconstructor.test.ts`
      * `[ ]`   Update the `'[path_deconstructor] direct - rag_context_summary'` test (currently at line ~213):
         * `[ ]`   Add `documentKey: FileType.business_case` to the `context` object alongside the existing fields (`projectId`, `sessionId`, `iteration`, `stageSlug`, `fileType: FileType.RagContextSummary`, `modelSlug`, `sourceModelSlugs`).
         * `[ ]`   Add `assertEquals(info.modelSlug, context.modelSlug);` assertion.
         * `[ ]`   Add `assertEquals(info.sourceModelSlugs, context.sourceModelSlugs!.sort());` assertion (sourceModelSlugs are sorted by path_constructor before embedding in the filename).
         * `[ ]`   Add `assertEquals(info.documentKey, FileType.business_case);` assertion.
         * `[ ]`   Preserve all existing assertions (`originalProjectId`, `shortSessionId`, `iteration`, `stageSlug`, `fileTypeGuess`, `error`).
      * `[ ]`   Update the `'rag_context_summary'` entry in the `constructDeconstructTestCases` parameterized array (currently at line ~467):
         * `[ ]`   Add `documentKey: FileType.business_case` to the `context` object alongside `projectId`, `fileType`, `sessionId`, `iteration`, `stageSlug`, `modelSlug`, `sourceModelSlugs`.
         * `[ ]`   Change `expectedFixedFileNameInPath` from `'text-embedder_compressing_model-a_and_model-b_rag_summary.txt'` to `'text-embedder_compressing_model-a_and_model-b_for_business_case_rag_summary.txt'`.
         * `[ ]`   Preserve `checkFields: ['shortSessionId', 'iteration', 'stageDirName', 'stageSlug']` unchanged.
      * `[ ]`   Preserve all other test cases and assertions unchanged.

   * `[ ]`   `construction`
      * `[ ]`   `deconstructStoragePath` is a pure exported function; no constructor.
      * `[ ]`   Initialization order within the updated RagContextSummary match block: extract project/session/iteration/stage fields from groups 1–4 → `info.modelSlug` from group 5 → `info.sourceModelSlugs` from group 6 split by `'_and_'` → `info.documentKey` from group 7 → `info.fileTypeGuess = FileType.RagContextSummary` → `return info`.

   * `[ ]`   `supabase/functions/_shared/utils/path_deconstructor.ts`
      * `[ ]`   Update the `ragSummaryPatternString` constant definition at line ~58 from:
         * `[ ]`   `"^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/([^_]+)_compressing_(.+)_rag_summary\\.txt$"` (6 capture groups)
         * `[ ]`   to: `"^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/(.+?)_compressing_(.+)_for_(.+)_rag_summary\\.txt$"` (7 capture groups)
         * `[ ]`   Group mapping after update: 1=projectId, 2=shortSessionId, 3=iteration, 4=stageDirName, 5=modelSlug (non-greedy `(.+?)`), 6=sourceModelSlugs joined by `_and_` (greedy `.+`, stops before last `_for_` with valid `_rag_summary.txt` anchor), 7=documentKey (greedy `.+`, stops before `_rag_summary.txt`).
      * `[ ]`   Update the first RagContextSummary parse block (currently at line ~623 under comment `// Path: .../_work/{modelSlug}_compressing_{source_model_slugs}_rag_summary.txt`):
         * `[ ]`   Update the comment to `// Path: .../_work/{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKey}_rag_summary.txt`.
         * `[ ]`   Keep `info.modelSlug = matches[5]` unchanged (group 5 is now non-greedy modelSlug, same value as before for well-formed slugs).
         * `[ ]`   Keep `info.sourceModelSlugs = matches[6].split('_and_')` unchanged (group 6 now holds sourceModelSlugs).
         * `[ ]`   Add `info.documentKey = matches[7];` immediately after `info.sourceModelSlugs`.
         * `[ ]`   Keep `info.fileTypeGuess = FileType.RagContextSummary` and `return info` unchanged.
      * `[ ]`   Update the second RagContextSummary parse block (currently at line ~763 under same comment):
         * `[ ]`   Update the comment to `// Path: .../_work/{modelSlug}_compressing_{sourceModelSlugs}_for_{documentKey}_rag_summary.txt`.
         * `[ ]`   Replace `info.parsedFileNameFromPath = matches[5]; info.modelSlug = info.parsedFileNameFromPath.split('_')[0];` with `info.modelSlug = matches[5];`.
         * `[ ]`   Add `info.sourceModelSlugs = matches[6].split('_and_');` after `info.modelSlug`.
         * `[ ]`   Add `info.documentKey = matches[7];` after `info.sourceModelSlugs`.
         * `[ ]`   Keep `info.fileTypeGuess = FileType.RagContextSummary` and `return info` unchanged.
      * `[ ]`   Keep ALL other pattern strings and match blocks unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/path_constructor.integration.test.ts`
      * `[ ]`   This file was created in the preceding path_constructor.ts node with two round-trip tests that are in RED state. No edits to the file are required in this node — the implementation changes above are sufficient to turn both tests GREEN. Verify both tests pass after implementing this node.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared path-parsing utility (`_shared/utils`); no service, worker, or adapter coupling.
      * `[ ]`   Dependencies are inward-facing: types from `file_manager.types.ts` and `path_deconstructor.types.ts`; both unchanged.
      * `[ ]`   Provides outward: `deconstructStoragePath` consumed by `file_manager.ts` (in `assembleAndSaveFinalDocument`) and by tests; no direct access required beyond this export.
      * `[ ]`   No cycles introduced; `path_deconstructor.ts` does not import from any consumer.

   * `[ ]`   `requirements`
      * `[ ]`   `deconstructStoragePath` for a RagContextSummary path in the new `_for_{documentKey}` format correctly populates `info.documentKey`, `info.modelSlug`, `info.sourceModelSlugs`, `info.fileTypeGuess`, and all session/stage fields.
      * `[ ]`   `deconstructStoragePath` for the example path `{proj}/session_{s}/iteration_1/3_synthesis/_work/gpt-4-turbo_compressing_claude-3-opus_and_gemini-1.5-pro_for_business_case_rag_summary.txt` produces `info.documentKey === 'business_case'`, `info.modelSlug === 'gpt-4-turbo'`, `info.sourceModelSlugs === ['claude-3-opus', 'gemini-1.5-pro']`, `info.fileTypeGuess === FileType.RagContextSummary`.
      * `[ ]`   `deconstructStoragePath` for a RagContextSummary path with a multi-segment documentKey (e.g., `synthesis_document_business_case`) correctly isolates the full documentKey value from the sourceModelSlugs segment.
      * `[ ]`   `constructStoragePath` → `deconstructStoragePath` round-trip is lossless for `documentKey`, `modelSlug`, `sourceModelSlugs`, and all session/stage identity fields; the `path_constructor.integration.test.ts` tests are GREEN after this node.
      * `[ ]`   All other `path_deconstructor.ts` pattern-match cases produce identical output before and after this change.
      * `[ ]`   All existing `path_deconstructor.test.ts` tests pass with updated RagContextSummary fixtures and assertions.
      * `[ ]`   No commit in this node; commit follows completion of the `file_manager.ts` node.

* `[ ]`   supabase/functions/_shared/services/file_manager.ts **[BE] Persist compression summary artifacts as first-class resources with canonical identity metadata and deterministic registration semantics**

   * `[ ]`   `objective`
      * `[ ]`   Solve the artifact-registration gap where RagContextSummary uploads lack a typed, validated contract: `uploadAndRegisterFile` accepts them as generic `ResourceUploadContext` without enforcing the five identity and freshness fields that `applyCompressionOverlay` (WS-D) must query against to locate and apply the correct summary artifact.
      * `[ ]`   Functional goals:
         * `[ ]`   Define `RagContextSummaryResourceDescription` interface with five required string fields: `target_document_id`, `target_document_key`, `source_fingerprint` (non-empty), `compressed_by_model_id`, `compressed_for_job_id`.
         * `[ ]`   Define `RagContextSummaryUploadContext = UploadContextBase & { pathContext: PathContext & { fileType: FileType.RagContextSummary }; resourceTypeForDb?: string; resourceDescriptionForDb: RagContextSummaryResourceDescription }` and add it to the `UploadContext` union as an additive member.
         * `[ ]`   Implement `isRagContextSummaryResourceDescription(v: unknown): v is RagContextSummaryResourceDescription` guard rejecting missing fields, non-string values, and empty `source_fingerprint`.
         * `[ ]`   Add a validation sub-block inside the `isResourceContext` branch of `uploadAndRegisterFile` that fires when `pathContextForStorage.fileType === FileType.RagContextSummary`: verify `sessionId`, `projectId`, `iteration`, `stageSlug`, `userId` are non-null/non-empty, and `isRagContextSummaryResourceDescription(resourceContext.resourceDescriptionForDb)` is true; on any failure remove the already-uploaded blob and return `{ record: null, error: { message: '...' } }`.
         * `[ ]`   Persist the validated `resourceDescriptionForDb` verbatim (merged with `type` key by the existing merge logic) in the upserted `dialectic_project_resources` row.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Storage atomicity: blob is always removed when validation rejects a rag summary upload after successful storage upload.
         * `[ ]`   No new external calls, no new Supabase queries beyond the existing resource upsert.
         * `[ ]`   All existing resource, contribution, feedback, signed URL, and assembly paths remain behaviorally unchanged.
      * `[ ]`   Each goal is atomic and testable through type-guard, unit, and integration coverage in this module scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared infrastructure service boundary: the single persistence gate for all typed file uploads.
      * `[ ]`   This role is correct because `file_manager.ts` is the only site that bridges storage upload and `dialectic_project_resources` DB registration; it is the correct place to enforce metadata completeness before the record is committed.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Does not orchestrate compression or construct `CompressPromptParams`.
         * `[ ]`   Does not invoke embedding jobs or call Netlify adapters.
         * `[ ]`   Does not own path-encoding logic; path construction is delegated to the injected `constructStoragePath` updated in the preceding `path_constructor.ts` WS-C node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/services/file_manager.ts` and its immediate type/guard/test support files.
      * `[ ]`   Inside boundary: `RagContextSummaryResourceDescription` interface, `RagContextSummaryUploadContext` type, `isRagContextSummaryResourceDescription` guard, validation sub-block in `uploadAndRegisterFile`, and all test fixtures.
      * `[ ]`   Outside boundary: path-encoding format (owned by `path_constructor.ts`, preceding WS-C node), path-parsing format (owned by `path_deconstructor.ts`, preceding WS-C node), compression orchestration (`compressPrompt.ts`, WS-D), overlay application (`applyCompressionOverlay.ts`, WS-D).

   * `[ ]`   `deps`
      * `[ ]`   Provider: `supabase/functions/_shared/types/file_manager.types.ts`.
         * `[ ]`   Layer classification: shared type contract.
         * `[ ]`   Direction: inward-facing; types are consumed, not produced, by `file_manager.ts`.
         * `[ ]`   Purpose: `FileType`, `ResourceUploadContext`, `RagContextSummaryResourceDescription`, `RagContextSummaryUploadContext`, `UploadContext`.
      * `[ ]`   Provider: `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.ts`.
         * `[ ]`   Layer classification: shared validation utility.
         * `[ ]`   Direction: inward-facing.
         * `[ ]`   Purpose: `isResourceContext`, new `isRagContextSummaryResourceDescription`, and existing guards.
      * `[ ]`   Provider: `npm:@supabase/supabase-js@^2.43.4`.
         * `[ ]`   Layer classification: external infrastructure client.
         * `[ ]`   Direction: outward-facing for storage upload/remove and DB upsert calls.
         * `[ ]`   Purpose: storage blob write/remove, `dialectic_project_resources` upsert.
      * `[ ]`   Provider: injected `constructStoragePath` (updated in preceding `path_constructor.ts` WS-C node; now requires `documentKey` for `FileType.RagContextSummary`).
         * `[ ]`   Layer classification: utility via DI.
         * `[ ]`   Direction: inward-facing.
         * `[ ]`   Purpose: produce deterministic `storagePath`/`fileName` pair for each upload.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from `_shared/services/file_manager.ts` into dialectic-worker orchestration modules.
         * `[ ]`   No lateral coupling introduced with netlify worker adapters or embedding job handlers.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   existing `constructStoragePath` signature and return shape (`storagePath`, `fileName`) only; RagContextSummary callers now supply `documentKey` in `PathContext` to satisfy the updated path constructor.
         * `[ ]`   existing Supabase storage `upload`/`remove` and table upsert interfaces only.
         * `[ ]`   existing shared type-guard helpers (`isRecord`, context guards) with additive `isRagContextSummaryResourceDescription` guard coverage.
      * `[ ]`   Injection shape remains `new FileManagerService(supabaseClient, { constructStoragePath, logger, assembleChunks })` with no constructor-surface expansion.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated DB tables for rag summary persistence.
         * `[ ]`   No hidden coupling to downstream enqueue/callback payload formats.

   * `[ ]`   `supabase/functions/_shared/types/file_manager.types.ts`
      * `[ ]`   Add `RagContextSummaryResourceDescription` interface after the existing `ContributionMetadata` interface:
         * `[ ]`   `target_document_id: string` — the `dialectic_project_resources.id` of the source document row being compressed; matched against `gathered_doc.id` by `applyCompressionOverlay`.
         * `[ ]`   `target_document_key: string` — the `document_key` of the source document; must equal `pathContext.documentKey` supplied to `constructStoragePath`; used for human-readable diagnostics and consistency verification.
         * `[ ]`   `source_fingerprint: string` — SHA-256 hex digest of source document content at compression time; must be a non-empty string; used by `applyCompressionOverlay` to verify the artifact is still fresh before applying.
         * `[ ]`   `compressed_by_model_id: string` — the `api_identifier` of the model that produced the compression.
         * `[ ]`   `compressed_for_job_id: string` — the `id` of the dialectic job that triggered compression.
      * `[ ]`   Add `RagContextSummaryUploadContext` type = `UploadContextBase & { pathContext: PathContext & { fileType: FileType.RagContextSummary }; resourceTypeForDb?: string; resourceDescriptionForDb: RagContextSummaryResourceDescription }`.
      * `[ ]`   Extend `UploadContext` union to `ModelContributionUploadContext | UserFeedbackUploadContext | ResourceUploadContext | RagContextSummaryUploadContext` (additive; preserves all existing members).
      * `[ ]`   Preserve `ResourceFileTypes` union unchanged (`FileType.RagContextSummary` remains a member so `isResourceContext` continues to match rag summary contexts for the upload flow).
      * `[ ]`   Preserve all existing interfaces, types, and enum values unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.test.ts`
      * `[ ]`   Add `RagContextSummaryResourceDescription` to the import from `'../../types/file_manager.types.ts'`.
      * `[ ]`   Add `isRagContextSummaryResourceDescription` to the import from `'./type_guards.file_manager.ts'`.
      * `[ ]`   Append a new `Deno.test('Type Guard: isRagContextSummaryResourceDescription', ...)` block at end of file with the following `t.step` assertions:
         * `[ ]`   returns `true` for a complete valid object: `{ target_document_id: 'doc-uuid', target_document_key: 'business_case', source_fingerprint: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', compressed_by_model_id: 'gpt-4-turbo', compressed_for_job_id: 'job-uuid' }`.
         * `[ ]`   returns `false` when `target_document_id` is absent.
         * `[ ]`   returns `false` when `target_document_id` is an empty string `''`.
         * `[ ]`   returns `false` when `target_document_key` is absent.
         * `[ ]`   returns `false` when `source_fingerprint` is absent.
         * `[ ]`   returns `false` when `source_fingerprint` is an empty string `''`.
         * `[ ]`   returns `false` when `compressed_by_model_id` is absent.
         * `[ ]`   returns `false` when `compressed_for_job_id` is absent.
         * `[ ]`   returns `false` for `null`.
         * `[ ]`   returns `false` for a non-object primitive such as `'string'`.
      * `[ ]`   Preserve all existing guard assertions for non-rag resource/model/feedback contexts.

   * `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.ts`
      * `[ ]`   Add `RagContextSummaryResourceDescription` to the existing import from `'../../types/file_manager.types.ts'`.
      * `[ ]`   Add exported function `isRagContextSummaryResourceDescription(v: unknown): v is RagContextSummaryResourceDescription` placed after `isResourceContext`:
         * `[ ]`   `if (!isRecord(v)) return false;`
         * `[ ]`   `if (typeof v.target_document_id !== 'string' || v.target_document_id.length === 0) return false;`
         * `[ ]`   `if (typeof v.target_document_key !== 'string' || v.target_document_key.length === 0) return false;`
         * `[ ]`   `if (typeof v.source_fingerprint !== 'string' || v.source_fingerprint.length === 0) return false;`
         * `[ ]`   `if (typeof v.compressed_by_model_id !== 'string' || v.compressed_by_model_id.length === 0) return false;`
         * `[ ]`   `if (typeof v.compressed_for_job_id !== 'string' || v.compressed_for_job_id.length === 0) return false;`
         * `[ ]`   `return true;`
      * `[ ]`   Keep `isModelContributionContext`, `isUserFeedbackContext`, `isResourceContext`, `isResourceFileType`, `isModelContributionFileType`, `isOutputType`, `isDocumentKey`, `isCanonicalPathParams`, `isFileType`, and all other existing functions completely unchanged.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.mock.ts`
      * `[ ]`   Add `RagContextSummaryResourceDescription` and `RagContextSummaryUploadContext` to the existing import from `'../types/file_manager.types.ts'`.
      * `[ ]`   Add `createMockRagContextSummaryResourceDescription(overrides?: Partial<RagContextSummaryResourceDescription>): RagContextSummaryResourceDescription` factory returning `{ target_document_id: 'mock-target-doc-id-uuid', target_document_key: 'business_case', source_fingerprint: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', compressed_by_model_id: 'gpt-4-turbo', compressed_for_job_id: 'mock-job-id-uuid', ...overrides }`.
      * `[ ]`   Add `createMockRagContextSummaryUploadContext(overrides?: Partial<RagContextSummaryUploadContext>): RagContextSummaryUploadContext` factory returning `{ pathContext: { fileType: FileType.RagContextSummary, projectId: 'mock-project-id', sessionId: 'mock-session-id-rag', iteration: 1, stageSlug: 'thesis', modelSlug: 'gpt-4-turbo', sourceModelSlugs: ['model-a'], documentKey: 'business_case' }, fileContent: Buffer.from('mock rag summary content'), mimeType: 'text/plain', sizeBytes: 24, userId: 'mock-user-id', description: 'mock rag summary', resourceDescriptionForDb: createMockRagContextSummaryResourceDescription(), ...overrides }`.
      * `[ ]`   Preserve the existing `MockFileManagerService` class and all existing factory/helper functions unchanged.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.upload.test.ts`
      * `[ ]`   Add `createMockRagContextSummaryUploadContext` and `createMockRagContextSummaryResourceDescription` to the import from `'./file_manager.mock.ts'` (additive).
      * `[ ]`   Append the following `t.step` assertions inside the existing `Deno.test('FileManagerService', ...)` block:
         * `[ ]`   `'rag summary: valid upload writes storage and upserts dialectic_project_resources row'` — call with `createMockRagContextSummaryUploadContext()`; mock storage `upload` succeeds; mock `upsert` returns a row with `resource_type: 'rag_context_summary'` and `resource_description` object; assert `result.error === null` and `result.record.resource_type === 'rag_context_summary'`.
         * `[ ]`   `'rag summary: valid upload preserves caller-provided identity fields verbatim in resource_description'` — call with `createMockRagContextSummaryUploadContext({ resourceDescriptionForDb: createMockRagContextSummaryResourceDescription({ target_document_id: 'exact-doc-id', source_fingerprint: 'exact-fingerprint-hex-64chars' }) })`; mock upsert returns a row echoing the input `resource_description`; assert `result.record.resource_description.target_document_id === 'exact-doc-id'` and `result.record.resource_description.source_fingerprint === 'exact-fingerprint-hex-64chars'`.
         * `[ ]`   `'rag summary: missing target_document_id returns FileManagerError and removes uploaded blob'` — call with `createMockRagContextSummaryUploadContext({ resourceDescriptionForDb: { target_document_key: 'business_case', source_fingerprint: 'abc123', compressed_by_model_id: 'gpt-4-turbo', compressed_for_job_id: 'job-id' } as any })`; mock storage `upload` succeeds; assert `result.error` is non-null; assert the mock Supabase storage `remove` spy was called once with a path matching the uploaded file.
         * `[ ]`   `'rag summary: empty source_fingerprint returns FileManagerError and removes uploaded blob'` — call with `createMockRagContextSummaryUploadContext({ resourceDescriptionForDb: createMockRagContextSummaryResourceDescription({ source_fingerprint: '' }) })`; mock storage `upload` succeeds; assert `result.error` non-null; assert storage `remove` called once.
         * `[ ]`   `'rag summary: undefined sessionId returns FileManagerError and removes uploaded blob'` — call with `createMockRagContextSummaryUploadContext({ pathContext: { ...createMockRagContextSummaryUploadContext().pathContext, sessionId: undefined } })`; mock storage `upload` succeeds; assert `result.error` non-null; assert storage `remove` called once.
         * `[ ]`   `'rag summary: null userId returns FileManagerError and removes uploaded blob'` — call with `createMockRagContextSummaryUploadContext({ userId: null })`; mock storage `upload` succeeds; assert `result.error` non-null; assert storage `remove` called once.
      * `[ ]`   Preserve all existing tests for project resources, seed prompt resources, model contribution uploads, and feedback flows unchanged.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.errors.test.ts`
      * `[ ]`   Add `createMockRagContextSummaryUploadContext` and `createMockRagContextSummaryResourceDescription` to the import from `'./file_manager.mock.ts'` (additive).
      * `[ ]`   Append the following `t.step` assertions inside the existing `Deno.test('FileManagerService transient error retry behavior', ...)` block:
         * `[ ]`   `'rag summary: transient storage upload failure retries EXPECTED_MAX_UPLOAD_ATTEMPTS times then returns error'` — call with `createMockRagContextSummaryUploadContext()`; mock storage `upload` to return `{ error: { message: 'service unavailable', statusCode: '503' } }` on every call; assert `result.error` is non-null; assert storage `upload` spy call count equals `EXPECTED_MAX_UPLOAD_ATTEMPTS`.
         * `[ ]`   `'rag summary: metadata validation failure after successful upload does not retry storage'` — call with `createMockRagContextSummaryUploadContext({ resourceDescriptionForDb: null as any })`; mock storage `upload` to succeed (returns `{ error: null }`); assert storage `upload` spy call count equals exactly `1`; assert storage `remove` spy was called once; assert `result.error` is non-null.
      * `[ ]`   Preserve all existing retry count contract assertions and `MAX_TRANSIENT_RETRIES`/`EXPECTED_MAX_UPLOAD_ATTEMPTS` constants alignment assertions unchanged.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.getFile.test.ts`
      * `[ ]`   Append the following `t.step` inside the existing `Deno.test('FileManagerService', ...)` block:
         * `[ ]`   `'getFileSignedUrl returns signed URL for a dialectic_project_resources row created for a rag summary'` — mock `dialectic_project_resources` select returning `{ storage_path: 'proj/session_abc/iteration_1/1_thesis/_work/gpt-4-turbo_compressing_model-a_for_business_case_rag_summary.txt' }`; mock `createSignedUrl` returning `{ data: { signedUrl: 'https://example.com/rag-signed' }, error: null }`; call `fileManager.getFileSignedUrl('rag-row-id', 'dialectic_project_resources')`; assert `signedUrl === 'https://example.com/rag-signed'` and `error === null`.
      * `[ ]`   Preserve existing not-found and storage-signing error behavior assertions unchanged.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.assemble.test.ts`
      * `[ ]`   Append `'non-regression: rag summary registration additions do not alter assembleAndSaveFinalDocument JSON assembly path'` — execute the existing assembly happy path using a model contribution root ID; assert the assembled `finalPath` structure and merged JSON object are unchanged; assert no rag-summary-specific validation logic is invoked during assembly.
      * `[ ]`   Preserve all existing chunk chain, merged JSON object, upload destination, and `is_latest_edit` update behavior assertions unchanged.

   * `[ ]`   `supabase/functions/_shared/services/file_manager.ts`
      * `[ ]`   Add `isRagContextSummaryResourceDescription` to the existing import block from `'../utils/type-guards/type_guards.file_manager.ts'`.
      * `[ ]`   Inside the `try { if (isResourceContext(context)) {` branch, immediately after `const resourceContext: ResourceUploadContext = context` and before the `const resourcePathFileType` declaration, insert the following validation block for RagContextSummary uploads:
         * `[ ]`   `if (pathContextForStorage.fileType === FileType.RagContextSummary) {`
         * `[ ]`   `  const missingFields: string[] = [];`
         * `[ ]`   `  if (!pathContextForStorage.sessionId || typeof pathContextForStorage.sessionId !== 'string') missingFields.push('sessionId');`
         * `[ ]`   `  if (!pathContextForStorage.projectId || typeof pathContextForStorage.projectId !== 'string') missingFields.push('projectId');`
         * `[ ]`   `  if (pathContextForStorage.iteration === undefined) missingFields.push('iteration');`
         * `[ ]`   `  if (!pathContextForStorage.stageSlug || typeof pathContextForStorage.stageSlug !== 'string') missingFields.push('stageSlug');`
         * `[ ]`   `  if (!resourceContext.userId || typeof resourceContext.userId !== 'string') missingFields.push('userId');`
         * `[ ]`   `  if (!isRagContextSummaryResourceDescription(resourceContext.resourceDescriptionForDb)) missingFields.push('resourceDescriptionForDb (required: target_document_id, target_document_key, source_fingerprint non-empty, compressed_by_model_id, compressed_for_job_id)');`
         * `[ ]`   `  if (missingFields.length > 0) {`
         * `[ ]`   `    await this.supabase.storage.from(this.storageBucket).remove([\`${finalMainContentFilePath}/${finalFileName}\`]);`
         * `[ ]`   `    return { record: null, error: { message: \`RagContextSummary upload rejected: missing required fields: ${missingFields.join(', ')}\` } };`
         * `[ ]`   `  }`
         * `[ ]`   `}`
      * `[ ]`   Preserve all existing upload retry/collision logic, `isModelContributionContext` branch, `isUserFeedbackContext` branch, contribution insert/update, feedback upsert, signed URL method, and `assembleAndSaveFinalDocument` method behavior completely unchanged.

   * `[ ]`   `supabase/integration_tests/services/file_manager.integration.test.ts`
      * `[ ]`   Add the following `it(...)` scenarios inside the `describe('FileManagerService Integration Tests', ...)` block:
         * `[ ]`   `'uploads rag context summary and persists dialectic_project_resources row with required metadata'` — build `RagContextSummaryUploadContext` with `pathContext.projectId: testProject.id`, `sessionId: testSession.session.id`, `iteration: 1`, `stageSlug: 'thesis'`, `modelSlug: testModelSlug` (sanitized), `sourceModelSlugs: [testModelSlug]`, `documentKey: 'business_case'`, `userId: testUserId`, `fileContent: Buffer.from('test rag summary text')`, `mimeType: 'text/plain'`, `resourceDescriptionForDb: { target_document_id: testProject.id, target_document_key: 'business_case', source_fingerprint: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', compressed_by_model_id: testModelSlug, compressed_for_job_id: testSession.session.id }`; call `fileManager.uploadAndRegisterFile(context)`; assert `result.error === null`; assert `result.record.resource_type === 'rag_context_summary'`; assert `result.record.resource_description.target_document_id === testProject.id`; assert `result.record.resource_description.source_fingerprint` has length > 0.
         * `[ ]`   `'rag summary upsert is idempotent on same storage_bucket,storage_path,file_name key'` — call `uploadAndRegisterFile` twice with the same `pathContext`; assert both calls return `result.error === null` and both return the same `record.id`.
         * `[ ]`   `'rag summary upload with missing target_document_id returns FileManagerError without persisting a row'` — call with `resourceDescriptionForDb: { target_document_key: 'business_case', source_fingerprint: 'abc', compressed_by_model_id: testModelSlug, compressed_for_job_id: testSession.session.id }` (no `target_document_id`); assert `result.error` non-null; query `dialectic_project_resources` by the expected storage path and assert no row exists.
      * `[ ]`   Preserve all existing non-rag resource and contribution persistence scenarios unchanged.

   * `[ ]`   `supabase/integration_tests/services/file_manager.assemble.integration.test.ts`
      * `[ ]`   Append `'non-regression: rag summary registration additions do not affect assembleAndSaveFinalDocument integration workflow'` — run the existing contribution chain assembly path; assert `finalPath` structure and assembled content are unchanged; no rag-summary rows are created.
      * `[ ]`   Preserve all existing execute/continue/assemble call chain semantics and output assertions.

   * `[ ]`   `supabase/integration_tests/services/file_manager.assembleChunks.integration.test.ts`
      * `[ ]`   Append `'non-regression: assembleChunks integration behavior unchanged after rag summary additions'` — run the existing `assembleChunks` integration scenario; assert schema-fill placeholder and merged JSON parity results are identical to pre-change state.
      * `[ ]`   Preserve all existing schema-fill placeholder and merged JSON parity checks.

   * `[ ]`   `construction`
      * `[ ]`   `FileManagerService` construction remains unchanged: `new FileManagerService(supabaseClient, { constructStoragePath, logger, assembleChunks })`.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order remains env bucket validation (`SB_CONTENT_STORAGE_BUCKET`) before any storage operations.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared infrastructure service boundary (`_shared/services`).
      * `[ ]`   Dependencies are inward-facing: `file_manager.types.ts`, `type_guards.file_manager.ts`, and injected `constructStoragePath` (DI, updated in the preceding `path_constructor.ts` WS-C node).
      * `[ ]`   Outbound effects: storage writes/removes via Supabase client; `dialectic_project_resources` upsert via Supabase client.
      * `[ ]`   No cycles introduced: `file_manager.ts` does not import from any dialectic-worker orchestration module.

   * `[ ]`   `requirements`
      * `[ ]`   `RagContextSummaryUploadContext` is a named, typed upload context with a required `RagContextSummaryResourceDescription` in `resourceDescriptionForDb`; provides compile-time enforcement for callers such as `compressPrompt.ts` (WS-D).
      * `[ ]`   `isRagContextSummaryResourceDescription` accepts only complete objects where all five fields are non-empty strings; rejects `null`, missing fields, and empty `source_fingerprint`.
      * `[ ]`   `uploadAndRegisterFile` for `FileType.RagContextSummary` rejects uploads where any of `sessionId`, `projectId`, `iteration`, `stageSlug`, `userId`, or `resourceDescriptionForDb` validation fails; removes the already-uploaded storage blob atomically; returns a `FileManagerError`.
      * `[ ]`   Validated `resourceDescriptionForDb` fields are persisted verbatim (merged with `type` key by the existing resource description merge logic) in the `dialectic_project_resources.resource_description` column.
      * `[ ]`   Upsert idempotency on `storage_bucket,storage_path,file_name` unique key is preserved for rag summary rows.
      * `[ ]`   All existing file manager behavior for non-rag resource uploads, model contributions, feedback, signed URLs, and assembly is unchanged and covered by regression tests.
      * `[ ]`   Path constructor and path deconstructor changes encoding `documentKey` in the RagContextSummary filename are complete in the preceding WS-C nodes; callers must supply `pathContext.documentKey` so `constructStoragePath` produces a non-colliding filename.

   * `[ ]`   **Commit** `feat(_shared): RagContextSummary artifact persistence with canonical identity and fingerprint validation`
      * `[ ]`   Structural changes: `RagContextSummaryResourceDescription` interface and `RagContextSummaryUploadContext` type added to `file_manager.types.ts`; `RagContextSummaryUploadContext` added to `UploadContext` union; `isRagContextSummaryResourceDescription` guard added to `type_guards.file_manager.ts`.
      * `[ ]`   Behavioral changes: `uploadAndRegisterFile` validates and enforces the `RagContextSummaryResourceDescription` contract for `FileType.RagContextSummary` uploads; blob cleanup on validation failure is atomically enforced before returning error.
      * `[ ]`   Contract changes: callers uploading `FileType.RagContextSummary` must supply a `RagContextSummaryResourceDescription` in `resourceDescriptionForDb` and `documentKey` in `pathContext`; this closes the WS-C artifact persistence boundary.

## WS-D — RESUME OVERLAY

* `[ ]`   supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts **[BE] Rewrite compressPrompt as a three-phase async state machine: Phase A spawns EMBED child jobs for missing document chunks, Phase B spawns EMBED child jobs for missing query embeddings, Phase C calls match_dialectic_chunks directly and persists each result as a canonical RagContextSummary artifact**

   * `[ ]`   `objective`
      * `[ ]`   Solve synchronous in-memory embedding: compressPrompt currently calls `deps.ragService.getContextForModel()` which embeds document chunks inline inside a Supabase function, blocks execution, leaves no provenance trail, and references the dropped `dialectic_memory.source_contribution_id` column (removed by WS-0 migration).
      * `[ ]`   Functional goals:
         * `[ ]`   Phase A: call `compressionStrategy` to identify oversized document candidates; for each candidate call `deps.createEmbedJobs` with the candidate document info and `embeddingModelProviderId`; if `createEmbedJobs` returns `jobsCreated > 0`, set parent job `status = 'waiting_for_children'` via `dbClient.from('dialectic_generation_jobs').update({status:'waiting_for_children'}).eq('id', params.parentJob.id)` and return `{ waitingForChildren: true }`.
         * `[ ]`   Phase B: all document chunks are present in `dialectic_memory`; for each candidate's query text call `deps.createEmbedJobs` with `source_type = 'rag_query'` and a deterministic `source_id` derived from query text + `sessionId`; if `jobsCreated > 0`, set parent job `status = 'waiting_for_children'` and return `{ waitingForChildren: true }`.
         * `[ ]`   Phase C: all embeddings present; for each candidate fetch the query embedding vector from `dialectic_memory WHERE source_type = 'rag_query' AND source_id = <deterministic query id> AND session_id = params.sessionId`; call `dbClient.rpc('match_dialectic_chunks', { query_embedding, p_session_id, min_similarity, match_count, p_source_type, p_source_id })` directly; assemble compressed context from returned chunks; call `deps.fileManager.uploadResource(...)` with `FileType.RagContextSummary` to persist the artifact; debit wallet via `deps.tokenWalletService.recordTransaction`; replace the candidate's content in `resourceDocuments`; recount tokens; compute `max_tokens_to_generate`; return `CompressPromptSuccessReturn`.
         * `[ ]`   Non-functional: no synchronous external API calls (LLM or embedding); no mutation of caller state; deterministic phase selection driven entirely from DB state at invocation time.
      * `[ ]`   Each goal is atomic and testable through interface, guard, mock, unit, and integration coverage within compressPrompt scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is compression orchestration implementation: detect embedding readiness, spawn EMBED jobs when embeddings are absent, execute retrieval and artifact persistence when all embeddings are ready.
      * `[ ]`   Must NOT: call any external AI API synchronously; query or manage source documents beyond the candidate list provided by `compressionStrategy`; manage the session-level token wallet balance; build or assemble chat messages.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/compressPrompt` compression orchestration and its complete immediate support system.
      * `[ ]`   Inside boundary: phase detection against `dialectic_memory`, `createEmbedJobs` dispatch, `match_dialectic_chunks` RPC invocation, `RagContextSummary` artifact persistence via `fileManager`, wallet debit for Phase C retrieval work, token counting for compressed output.
      * `[ ]`   Outside boundary: embedding execution (Netlify adapter, WS-A); chunk storage to `dialectic_memory` (`saveResponse` embedding branch, WS-B); path construction/deconstruction (WS-C); affordability preflight (`calculateAffordability`); artifact gathering and overlay (`gatherArtifacts` / `applyCompressionOverlay`).

   * `[ ]`   `deps`
      * `[ ]`   `createEmbedJobs: BoundCreateEmbedJobsFn` — provider: `../createEmbedJobs/createEmbedJobs.provides.ts` (WS-S); direction: compressPrompt calls createEmbedJobs to spawn EMBED child jobs; purpose: async chunk and query embedding via job queue.
      * `[ ]`   `fileManager: FileManagerService` — provider: `../../_shared/services/file_manager.ts` (WS-C); direction: compressPrompt calls fileManager to persist RagContextSummary artifacts; purpose: canonical resource storage with identity metadata.
      * `[ ]`   `tokenWalletService: IAdminTokenWalletService` — provider: `adminTokenWalletService.ts`; direction: compressPrompt calls for debit transactions on Phase C retrieval work.
      * `[ ]`   `countTokens: CountTokensFn` — provider: `tokenizer_utils.ts`; direction: compressPrompt calls to measure compressed output token count in Phase C.
      * `[ ]`   `logger: ILogger` — provider: `_shared/logger.ts`; direction: diagnostic tracing throughout all three phases.
      * `[ ]`   `ragService` is REMOVED from `CompressPromptDeps` — no longer called; direct DB replaces it.
      * `[ ]`   `embeddingClient` is REMOVED from `CompressPromptDeps` — embedding is now async EMBED job, not inline.
      * `[ ]`   No reverse dependencies: compressPrompt does not import from calculateAffordability, prepareModelJob, gatherArtifacts, or processSimpleJob.

   * `[ ]`   `context_slice`
      * `[ ]`   `BoundCreateEmbedJobsFn`: minimum surface is the bound signature `(params: CreateEmbedJobsParams, payload: CreateEmbedJobsPayload) => Promise<CreateEmbedJobsReturn>` where `CreateEmbedJobsReturn` exposes `jobsCreated: number`.
      * `[ ]`   `FileManagerService.uploadResource`: minimum surface is `(context: ResourceUploadContext, content: string | Uint8Array) => Promise<{ id: string; storage_path: string; file_name: string } | { error: Error }>` used with `FileType.RagContextSummary`.
      * `[ ]`   `IAdminTokenWalletService.recordTransaction`: unchanged from current usage — `{ walletId, type: 'DEBIT_USAGE', amount, recordedByUserId, idempotencyKey, relatedEntityId, relatedEntityType, notes }`.
      * `[ ]`   `SupabaseClient`: three call sites only — `dbClient.from('dialectic_memory').select(...)` (phase checks), `dbClient.from('dialectic_generation_jobs').update({status:'waiting_for_children'}).eq('id',...)` (parent pause), `dbClient.rpc('match_dialectic_chunks', {...})` (Phase C retrieval).

   * `[ ]`   `compressPrompt.interface.test.ts`
      * `[ ]`   Add surface-declaration test for `CompressPromptPendingReturn`: declare `const pending: CompressPromptPendingReturn = buildCompressPromptPendingReturn()` and assert `pending.waitingForChildren === true`.
      * `[ ]`   Add surface-declaration test for `CompressPromptCompressedReturn`: declare `const compressed: CompressPromptCompressedReturn = buildCompressPromptSuccessReturn({...})` and assert it has `chatApiRequest`, `resolvedInputTokenCount`, and `resourceDocuments` properties.
      * `[ ]`   Add surface-declaration test for `CompressPromptSuccessReturn` as a union: declare `const successAsPending: CompressPromptSuccessReturn = buildCompressPromptPendingReturn()` (proves `PendingReturn` is assignable to `SuccessReturn`); declare `const successAsCompressed: CompressPromptSuccessReturn = buildCompressPromptSuccessReturn({...})` (proves `CompressedReturn` is assignable to `SuccessReturn`).
      * `[ ]`   Update `CompressPromptDeps` surface assertion: remove `'ragService'` and `'embeddingClient'` from expected keys; add `'createEmbedJobs'` and `'fileManager'` to expected keys.
      * `[ ]`   Update `CompressPromptParams` surface assertion: add `'parentJob'`, `'embeddingModelProviderId'`, `'projectId'`, `'iteration'` to the expected key list.
      * `[ ]`   Update `CompressPromptReturn` surface assertion: declare `const retAsPending: CompressPromptReturn = buildCompressPromptPendingReturn()` (pending path); declare `const retAsCompressed: CompressPromptReturn = buildCompressPromptSuccessReturn({...})` (compressed path); declare `const retAsError: CompressPromptReturn = buildCompressPromptErrorReturn()` (error path) — proves the union is binary with all three shapes assignable.
      * `[ ]`   Preserve all existing assertions for `CompressPromptPayload` (all six fields unchanged), `CompressPromptErrorReturn`, `CompressPromptFn`, `BoundCompressPromptFn`.

   * `[ ]`   `compressPrompt.interface.ts`
      * `[ ]`   Add imports: `BoundCreateEmbedJobsFn` from `'../createEmbedJobs/createEmbedJobs.provides.ts'`; `FileManagerService` from `'../../_shared/services/file_manager.ts'`; `DialecticJobRow` from `'../../dialectic-service/dialectic.interface.ts'`.
      * `[ ]`   Remove imports: `IEmbeddingClient` from `'../../_shared/services/indexing_service.interface.ts'`; `IRagService` from `'../../_shared/services/rag_service.interface.ts'`.
      * `[ ]`   `CompressPromptDeps`: remove `ragService: IRagService`; remove `embeddingClient: IEmbeddingClient`; add `createEmbedJobs: BoundCreateEmbedJobsFn`; add `fileManager: FileManagerService`.
      * `[ ]`   `CompressPromptParams`: add `parentJob: DialecticJobRow`; add `embeddingModelProviderId: string`; add `projectId: string`; add `iteration: number`. All existing fields unchanged.
      * `[ ]`   Rename the existing `CompressPromptSuccessReturn` interface to `CompressPromptCompressedReturn` — fields `chatApiRequest: ChatApiRequest`, `resolvedInputTokenCount: number`, `resourceDocuments: ResourceDocuments` are unchanged.
      * `[ ]`   Add: `export interface CompressPromptPendingReturn { waitingForChildren: true }`.
      * `[ ]`   Add: `export type CompressPromptSuccessReturn = CompressPromptCompressedReturn | CompressPromptPendingReturn`.
      * `[ ]`   `CompressPromptReturn`: change to `CompressPromptSuccessReturn | CompressPromptErrorReturn`.
      * `[ ]`   `CompressPromptFn` and `BoundCompressPromptFn`: no signature text change required — return type flows from the updated `CompressPromptReturn`.
      * `[ ]`   Preserve unchanged: `CompressPromptPayload` (all six fields), `CompressPromptErrorReturn`.

   * `[ ]`   `compressPrompt.guard.test.ts`
      * `[ ]`   Add `isCompressPromptPendingReturn` tests:
         * `[ ]`   Returns `true` for `{ waitingForChildren: true }`.
         * `[ ]`   Returns `false` for `{ waitingForChildren: false }`.
         * `[ ]`   Returns `false` for `null`, `undefined`, `{}`, `{ error: new Error('x') }`, `{ chatApiRequest: {} }`.
      * `[ ]`   Update `isCompressPromptSuccessReturn` tests: assert it returns `true` for `{ chatApiRequest: buildChatApiRequest(), resolvedInputTokenCount: 0, resourceDocuments: [] }` (compressed shape) and for `{ waitingForChildren: true }` (pending shape); assert it returns `false` for `{ error: new Error('x'), retriable: false }`.
      * `[ ]`   Update `isCompressPromptDeps` tests: remove assertions for `ragService` and `embeddingClient` presence; add assertions that `createEmbedJobs` must be a function and `fileManager` must be a record for the guard to pass.
      * `[ ]`   Update `isCompressPromptParams` tests: add assertions that `parentJob` (record), `embeddingModelProviderId` (non-empty string), `projectId` (non-empty string), and `iteration` (number) are required for the guard to pass.
      * `[ ]`   Preserve all existing coverage for `isCompressPromptPayload`, `isCompressPromptErrorReturn`, `isBoundCompressPromptFn`.

   * `[ ]`   `compressPrompt.guard.ts`
      * `[ ]`   Add: `export function isCompressPromptPendingReturn(v: unknown): v is CompressPromptPendingReturn { return isRecord(v) && v['waitingForChildren'] === true && !('chatApiRequest' in v); }` — import `CompressPromptPendingReturn` from `./compressPrompt.interface.ts`.
      * `[ ]`   Update `isCompressPromptSuccessReturn`: change body to accept both `CompressPromptCompressedReturn` and `CompressPromptPendingReturn` — `return isRecord(v) && !('error' in v) && ('waitingForChildren' in v ? v['waitingForChildren'] === true : 'chatApiRequest' in v && 'resolvedInputTokenCount' in v && 'resourceDocuments' in v)`.
      * `[ ]`   `isCompressPromptDeps`: remove the `'ragService' in value` check and `isRecord(value.ragService)` assertion; remove the `'embeddingClient' in value` check and `isRecord(value.embeddingClient)` assertion; add `!('createEmbedJobs' in value) || typeof value.createEmbedJobs !== 'function'` early-return false; add `!('fileManager' in value) || !isRecord(value.fileManager)` early-return false.
      * `[ ]`   `isCompressPromptParams`: add `!('parentJob' in value) || !isRecord(value.parentJob)` early-return false; add `!('embeddingModelProviderId' in value) || typeof value.embeddingModelProviderId !== 'string' || value.embeddingModelProviderId === ''` early-return false; add `!('projectId' in value) || typeof value.projectId !== 'string' || value.projectId === ''` early-return false; add `!('iteration' in value) || typeof value.iteration !== 'number'` early-return false.
      * `[ ]`   Preserve all other existing guard logic unchanged: remaining `isCompressPromptDeps` checks (`logger`, `tokenWalletService`, `countTokens`); all `isCompressPromptParams` checks for existing fields; `isCompressPromptPayload`; `isCompressPromptErrorReturn`; `isBoundCompressPromptFn`.

   * `[ ]`   `compressPrompt.mock.ts`
      * `[ ]`   Add `buildCompressPromptPendingReturn(): CompressPromptPendingReturn` factory returning `{ waitingForChildren: true as const }`.
      * `[ ]`   Update `CompressPromptDepsOverrides` type: remove `ragService?: IRagService`; remove `embeddingClient?: IEmbeddingClient`; add `createEmbedJobs?: BoundCreateEmbedJobsFn`; add `fileManager?: FileManagerService`.
      * `[ ]`   Update `buildCompressPromptDeps`: remove `ragService` and `embeddingClient` fields; add `createEmbedJobs` field defaulting to an async function returning `{ jobsCreated: 0, jobIds: [] }`; add `fileManager` field defaulting to a minimal mock object implementing `uploadResource` as an async function returning `{ id: 'mock-resource-id', storage_path: '_work', file_name: 'mock_rag_summary.txt' }`.
      * `[ ]`   Remove imports: `EmbeddingClient` from `'../../_shared/services/indexing_service.ts'`; `mockOpenAiAdapter` from `'../../_shared/ai_service/openai_adapter.mock.ts'`; `IRagService` from `'../../_shared/services/rag_service.interface.ts'`; `MockRagService` from `'../../_shared/services/rag_service.mock.ts'`; `IEmbeddingClient` from indexing_service.interface.
      * `[ ]`   Add imports: `BoundCreateEmbedJobsFn` from `'../createEmbedJobs/createEmbedJobs.provides.ts'`; `FileManagerService` from `'../../_shared/services/file_manager.ts'`; `DialecticJobRow` from `'../../dialectic-service/dialectic.interface.ts'`.
      * `[ ]`   Update `CompressPromptParamsOverrides` type: add `parentJob?: DialecticJobRow`; add `embeddingModelProviderId?: string`; add `projectId?: string`; add `iteration?: number`.
      * `[ ]`   Update `buildCompressPromptParams`: add `parentJob` field defaulting to a minimal valid `DialecticJobRow` fixture (use existing mock job fixture pattern from the codebase — `id: 'mock-parent-job-id'`, `status: 'pending'`, required fields filled with sensible defaults); add `embeddingModelProviderId: overrides?.embeddingModelProviderId ?? 'mock-embedding-provider-id'`; add `projectId: overrides?.projectId ?? 'mock-project-id'`; add `iteration: overrides?.iteration ?? 1`.
      * `[ ]`   Preserve all other existing exports: `buildResourceDocument`, `buildChatApiRequest`, `buildTokenizerDeps`, `DbClient`, `buildCompressPromptPayload`, `buildCompressPromptSuccessReturn`, `buildCompressPromptErrorReturn`, `buildBoundCompressPromptFn`, `createCompressPromptMock`, `CompressPromptPayloadOverrides`, `CompressPromptMockCall`.

   * `[ ]`   `compressPrompt.test.ts`
      * `[ ]`   Replace all tests that call or mock `deps.ragService.getContextForModel` with tests against the three-phase state machine using a mocked `dbClient` and mocked `createEmbedJobs`.
      * `[ ]`   Phase A unit tests:
         * `[ ]`   Given a candidate whose `dialectic_memory` check returns zero rows (chunks absent): assert `deps.createEmbedJobs` is called with the candidate document info and `embeddingModelProviderId`, assert `dbClient.from('dialectic_generation_jobs').update({status:'waiting_for_children'})` is called with `parentJob.id`, assert return is `{ waitingForChildren: true }`.
         * `[ ]`   Given a candidate where `createEmbedJobs` returns `{ jobsCreated: 0 }` (all chunks already present): assert function does NOT return `waitingForChildren` from Phase A and proceeds to Phase B.
      * `[ ]`   Phase B unit tests:
         * `[ ]`   Given all doc chunks present but `dialectic_memory` query for `source_type='rag_query'` returns zero rows: assert `deps.createEmbedJobs` is called for query texts with `source_type: 'rag_query'`, assert parent job updated to `waiting_for_children`, assert return is `{ waitingForChildren: true }`.
         * `[ ]`   Given all doc chunks and query embeddings present (`createEmbedJobs` returns `{ jobsCreated: 0 }` for query phase): assert function does NOT return `waitingForChildren` from Phase B and proceeds to Phase C.
      * `[ ]`   Phase C unit tests:
         * `[ ]`   Given all embeddings present: assert `dbClient.rpc('match_dialectic_chunks', {...})` is called with the query embedding fetched from `dialectic_memory`.
         * `[ ]`   Assert `deps.fileManager.uploadResource` is called once per compression candidate with `FileType.RagContextSummary` in the upload context.
         * `[ ]`   Assert `deps.tokenWalletService.recordTransaction` is called with `type: 'DEBIT_USAGE'` and `idempotencyKey` containing the jobId and candidate id.
         * `[ ]`   Assert return is `CompressPromptSuccessReturn` with `resourceDocuments[0].content` replaced by assembled RAG context and `chatApiRequest.max_tokens_to_generate` set to a positive number.
      * `[ ]`   Preserve existing document-identity validation tests: `document_key` absent → error; `type` absent → error; `stage_slug` absent → error.
      * `[ ]`   Preserve existing config guard tests: `context_window_tokens` not a number → error; `provider_max_input_tokens` undefined → error.
      * `[ ]`   Preserve existing balance check tests adapted to Phase C context.

   * `[ ]`   `compressPrompt.integration.test.ts`
      * `[ ]`   Remove `MockRagService`, `EmbeddingClient`, and `getMockAiProviderAdapter` imports — they are no longer part of `CompressPromptDeps`.
      * `[ ]`   Remove the `const mockRag = new MockRagService()` setup, `mockRag.setConfig(...)` call, `const adapterWithEmbedding = {...}` construction, and `const embeddingClient = new EmbeddingClient(adapterWithEmbedding)` instantiation in the test setup blocks.
      * `[ ]`   Add imports: `BoundCreateEmbedJobsFn` from `'../createEmbedJobs/createEmbedJobs.provides.ts'`; `FileManagerService` from `'../../_shared/services/file_manager.ts'`; `isCompressPromptPendingReturn` from `'./compressPrompt.guard.ts'`.
      * `[ ]`   Replace `CompressPromptDeps` construction in both integration test cases: remove `ragService` and `embeddingClient` fields; add `createEmbedJobs` as an async mock that records calls and returns `{ jobsCreated: 0, jobIds: [] }` for the Phase C path, or `{ jobsCreated: 1, jobIds: ['mock-embed-job-id'] }` for the Phase A pending path; add `fileManager` as a minimal mock implementing `uploadResource` returning a fixture resource row.
      * `[ ]`   Update `CompressPromptParams` construction in both integration test cases: add `parentJob` (minimal `DialecticJobRow` with `id: crypto.randomUUID()` and `status: 'pending'`); add `embeddingModelProviderId: testModelId`; add `projectId: testProject.id`; add `iteration: 1`.
      * `[ ]`   Replace the `"dialectic_memory batch: indexed candidate skips RAG"` test: the old test inserts a `dialectic_memory` row using `source_contribution_id` (dropped column) and asserts `getContextForModel` is not called. Replace it with: insert `dialectic_memory` rows using the new `source_type` / `source_id` columns (WS-0 schema), set `createEmbedJobs` mock to return `{ jobsCreated: 0 }` for Phase A and Phase B, and assert `compressPrompt` proceeds to Phase C and returns `CompressPromptSuccessReturn`.
      * `[ ]`   Add integration test for Phase A pending path: `createEmbedJobs` mock returns `{ jobsCreated: 2 }` for the first call (doc chunks absent); assert `isCompressPromptSuccessReturn(result)` is `true`; assert `isCompressPromptPendingReturn(result)` is `true`; assert `dbClient.from('dialectic_generation_jobs').update(...)` was called with `status: 'waiting_for_children'`.
      * `[ ]`   Preserve integration boundary: real `compressPrompt` function, real `adminClient` for `dialectic_memory` queries, mock `createEmbedJobs`, mock `fileManager`, real `AdminTokenWalletService`, real `countTokens`.

   * `[ ]`   `construction`
      * `[ ]`   `compressPrompt` is a pure exported async function over `CompressPromptDeps` / `CompressPromptParams` / `CompressPromptPayload`; no constructor or factory entrypoint.
      * `[ ]`   Initialization order: document identity guard (all resource docs have `document_key`, `type`, `stage_slug`) → `context_window_tokens` guard → `provider_max_input_tokens` guard → call `compressionStrategy({ dbClient, logger }, { inputsRelevance }, { documents, history, currentUserPrompt })` to get `CompressionCandidate[]` — pass `{ dbClient, logger }` as strategy deps (no embeddingClient per WS-0 updated `ICompressionStrategy`) → Phase A: call `deps.createEmbedJobs` for each candidate; if `jobsCreated > 0` → update parent job status → return `{ waitingForChildren: true }` → Phase B: call `deps.createEmbedJobs` for query texts with `source_type: 'rag_query'`; if `jobsCreated > 0` → update parent job status → return `{ waitingForChildren: true }` → Phase C: for each candidate, fetch query embedding from `dialectic_memory` → call `match_dialectic_chunks` RPC → assemble context → persist `RagContextSummary` via `fileManager` → debit wallet → replace candidate content → recount tokens → compute `max_tokens_to_generate` → return `CompressPromptSuccessReturn`.
      * `[ ]`   Parent job status update uses `params.parentJob.id` (from new `CompressPromptParams` field) — not derived from `params.jobId` (which is the job being processed, not the parent).

   * `[ ]`   `compressPrompt.ts`
      * `[ ]`   Remove import `CompressionCandidate` from `'../../_shared/utils/vector_utils.ts'` — replace with direct `compressionStrategy` call result usage typed against the WS-0 updated `CompressionCandidate` union from `vector_utils.ts` (keep import, type changes under WS-0).
      * `[ ]`   Remove import `IRagService` usage (dep removed).
      * `[ ]`   Remove import `IEmbeddingClient` usage (dep removed).
      * `[ ]`   Remove import `getMaxOutputTokens` from `'../../_shared/utils/affordability_utils.ts'` — Phase C computes `max_tokens_to_generate` using `deps.countTokens` + the existing `getMaxOutputTokens` local call pattern; keep `getMaxOutputTokens` import if Phase C reuses it for the post-compression affordability check.
      * `[ ]`   Remove: the `idsToCheck` / `indexedIds` / `source_contribution_id` batch-lookup block (lines ~93–113 in current file) — this queries the dropped column and is entirely replaced by phase detection logic.
      * `[ ]`   Remove: the compression `while` loop body (lines ~125–253) — the entire `deps.ragService.getContextForModel(...)` call and surrounding logic is replaced by Phase A / B / C.
      * `[ ]`   Remove: the post-loop `allowedInputCheck` block and associated `getMaxOutputTokens` call that precedes the final `return` (lines ~254–295) — Phase C replaces this with a direct recount and max-token compute on the assembled compressed content.
      * `[ ]`   Implement Phase A: after receiving `candidates` from `compressionStrategy`, call `const embedResult = await deps.createEmbedJobs({ dbClient: params.dbClient, parentJob: params.parentJob, candidates, embeddingModelProviderId: params.embeddingModelProviderId, sessionId: params.sessionId, projectId: params.projectId, iteration: params.iteration })`. If `embedResult` is an error return → propagate as `CompressPromptErrorReturn`. If `embedResult.jobsCreated > 0` → call `await params.dbClient.from('dialectic_generation_jobs').update({ status: 'waiting_for_children' }).eq('id', params.parentJob.id)` → return `{ waitingForChildren: true }`.
      * `[ ]`   Implement Phase B: call `deps.createEmbedJobs` with `{ sourceType: 'rag_query', sourceId: candidate.id, queryTexts: [payload.currentUserPrompt], sessionId: params.sessionId, ... }` — `source_id` is `candidate.id` (the UUID of the originating document row), not a derived value. If `jobsCreated > 0` → update parent → return `{ waitingForChildren: true }`.
      * `[ ]`   Implement Phase C: for each candidate, query `dialectic_memory WHERE source_type = 'rag_query' AND source_id = candidate.id AND session_id = params.sessionId LIMIT 1` to fetch the stored embedding vector — `source_id` is `candidate.id`, the same UUID written in Phase B; this is a direct FK reference, no derivation required; call `await params.dbClient.rpc('match_dialectic_chunks', { query_embedding: memRow.embedding, p_session_id: params.sessionId, min_similarity: 0.7, match_count: 10, p_source_type: candidate.sourceType, p_source_id: candidate.id })`; if rpc error → return `CompressPromptErrorReturn`; assemble context string from returned chunk rows by joining `chunk.content` values; call `await deps.fileManager.uploadResource({ fileType: FileType.RagContextSummary, projectId: params.projectId, sessionId: params.sessionId, stageSlug: params.stageSlug, iteration: params.iteration, documentKey: candidate.documentKey, sourceModelSlugs: [params.extendedModelConfig.api_identifier], embeddingModelSlug: params.embeddingModelProviderId }, assembledContext)`; debit wallet via `deps.tokenWalletService.recordTransaction({ walletId: params.walletId, type: 'DEBIT_USAGE', amount: String(matchedChunksTokenCount), recordedByUserId: params.projectOwnerUserId, idempotencyKey: \`rag:${params.jobId}:${candidate.id}\`, relatedEntityId: candidate.id, relatedEntityType: 'rag_compression', notes: \`RAG compression for job ${params.jobId}\` })`; replace `resourceDocuments[candidateIndex].content` with assembled context; recount tokens of the updated `chatApiRequest`; after all candidates processed, compute final `max_tokens_to_generate` using existing `getMaxOutputTokens` call pattern; return `{ chatApiRequest: {...chatApiRequest, max_tokens_to_generate: finalMaxOutput}, resolvedInputTokenCount: finalTokenCount, resourceDocuments }`.
      * `[ ]`   Preserve unchanged: document identity guard block (lines ~21–33); `context_window_tokens` guard (lines ~35–47); `provider_max_input_tokens` guard (lines ~49–54); the `resourceDocuments` shallow-copy (line ~56); the `chatApiRequest` construction (lines ~61–66); the `initialCountable` / `currentTokenCount` token count (lines ~68–76); the `seedMessages` / `currentAssembledMessages` setup (lines ~77–79); the `currentBalanceTokens` initialization (line ~80).

   * `[ ]`   `compressPrompt.provides.ts`
      * `[ ]`   Add `CompressPromptCompressedReturn` and `CompressPromptPendingReturn` to the type re-exports from `'./compressPrompt.interface.ts'`.
      * `[ ]`   Add `isCompressPromptPendingReturn` to the function re-exports from `'./compressPrompt.guard.ts'`.
      * `[ ]`   Add `buildCompressPromptPendingReturn` to the mock factory re-exports from `'./compressPrompt.mock.ts'`.
      * `[ ]`   Preserve all existing exports: `compressPrompt` (implementation), all existing interface types (`BoundCompressPromptFn`, `CompressPromptDeps`, `CompressPromptErrorReturn`, `CompressPromptFn`, `CompressPromptParams`, `CompressPromptPayload`, `CompressPromptReturn`, `CompressPromptSuccessReturn`), all existing guard functions (`isBoundCompressPromptFn`, `isCompressPromptDeps`, `isCompressPromptErrorReturn`, `isCompressPromptParams`, `isCompressPromptPayload`, `isCompressPromptSuccessReturn`), and all existing mock factory exports (`buildChatApiRequest`, `buildCompressPromptDeps`, `buildCompressPromptErrorReturn`, `buildCompressPromptParams`, `buildCompressPromptPayload`, `buildCompressPromptSuccessReturn`, `buildBoundCompressPromptFn`).

* `[ ]`   supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts **[BE] Apply compression overlay to gathered artifacts by matching target_document_id from persisted RagContextSummary resource_description and swapping content in memory while preserving canonical source identity**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing consume-point for persisted RagContextSummary artifacts: after gatherArtifacts assembles the canonical document list, compression summaries have no function that reads them and replaces the relevant artifact content in memory before the model call is built.
      * `[ ]`   Functional goals:
         * `[ ]`   Query `dialectic_project_resources` for `resource_type = FileType.RagContextSummary` rows scoped to the current `sessionId`, `iterationNumber`, and `stageSlug`.
         * `[ ]`   For each compression row, guard and parse `resource_description` as `RagContextSummaryResourceDescription` to extract `target_document_id` and `source_fingerprint`.
         * `[ ]`   Match each compression row to an artifact in `payload.artifacts` by `artifact.id === target_document_id`; if no match, log warn and skip.
         * `[ ]`   Compute SHA-256 hex fingerprint of the matched artifact's current `content` (UTF-8 encoded) and compare to stored `source_fingerprint`; log a stale warning and skip the row when they do not match.
         * `[ ]`   For fresh matches, call `deps.downloadFromStorage(params.dbClient, row.storage_bucket, \`${row.storage_path}/${row.file_name}\`)`; decode the returned `ArrayBuffer` as UTF-8 and replace only the `content` field on the matching artifact using a spread (`{ ...artifact, content: decoded }`).
         * `[ ]`   Return the full artifact array with all fresh overlays applied in-memory.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   DB query errors return retriable error; storage download errors for a matched fresh row return retriable error.
         * `[ ]`   Invalid or missing `resource_description` shape produces a warn log and skips the row — it is never a hard error return.
         * `[ ]`   Stale fingerprint mismatch produces a warn log and skips the row — it is never a hard error return.
         * `[ ]`   No artifact identity field (`id`, `document_key`, `stage_slug`, `type`) may be mutated at any step.
         * `[ ]`   No changes to `gatherArtifacts.ts`, `processComplexJob.ts`, or any Workstream C source file are made in this node.
      * `[ ]`   Each goal is atomic and testable through interface, guard, and unit coverage within this module.

   * `[ ]`   `role`
      * `[ ]`   Node role is the canonical in-memory overlay consumer for compression artifacts in the dialectic-worker domain.
      * `[ ]`   This role is correct because `applyCompressionOverlay.ts` is the first source file that implements the identity-safe content swap and is the direct producer consumed by `gatherArtifacts.ts` in the next Workstream D node.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not implement the `gatherArtifacts` caller integration in this node; that belongs to the `gatherArtifacts.ts` node.
         * `[ ]`   Do not implement compression artifact production or storage write; that belongs to Workstream C.
         * `[ ]`   Do not implement the job graph prerequisite state or parent-resume orchestration; that belongs to `processComplexJob.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/applyCompressionOverlay` and its immediate support files.
      * `[ ]`   Inside boundary:
         * `[ ]`   compression row DB query and `resource_description` parsing.
         * `[ ]`   SHA-256 fingerprint computation and freshness comparison.
         * `[ ]`   storage download and in-memory content replacement.
         * `[ ]`   interface, guard, mock, test, and provides for this function only.
      * `[ ]`   Outside boundary:
         * `[ ]`   `gatherArtifacts` rule-based artifact query loop.
         * `[ ]`   compression artifact write and DB registration (`file_manager.ts`, `compressPrompt.ts`).
         * `[ ]`   job graph orchestration and parent-resume state machine.
         * `[ ]`   `RagContextSummaryResourceDescription` type definition and `isRagContextSummaryResourceDescription` guard (defined in `file_manager.types.ts` and `type_guards.file_manager.ts` respectively — Workstream C producers).

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../../_shared/types.ts` — `ILogger`, `ResourceDocument`, `ResourceDocuments`.
         * `[ ]`   Layer classification: shared domain type producer.
         * `[ ]`   Direction: consumed by interface, implementation, and guards.
         * `[ ]`   Purpose: define the artifact shape that this function reads and replaces content on.
      * `[ ]`   Provider: `../../_shared/supabase_storage_utils.ts` — `DownloadFromStorageFn`.
         * `[ ]`   Layer classification: shared storage utility type producer.
         * `[ ]`   Direction: consumed by interface and implementation as an injected dep.
         * `[ ]`   Purpose: download compression artifact content bytes from Supabase storage using the `(supabase, bucket, path)` signature where `path` is `${storage_path}/${file_name}`.
      * `[ ]`   Provider: `../../dialectic-service/dialectic.interface.ts` — `DialecticProjectResourceRow`.
         * `[ ]`   Layer classification: shared DB row type producer.
         * `[ ]`   Direction: consumed by implementation and mock.
         * `[ ]`   Purpose: type the compression resource rows returned from the DB query.
      * `[ ]`   Provider: `../../_shared/types/file_manager.types.ts` — `FileType`, `RagContextSummaryResourceDescription`.
         * `[ ]`   Layer classification: shared domain type producer (introduced in Workstream C file_manager.ts node).
         * `[ ]`   Direction: consumed by implementation for `resource_type` filtering and `resource_description` shape access.
         * `[ ]`   Purpose: identify rag summary rows by `FileType.RagContextSummary` constant and access structured compression metadata fields.
      * `[ ]`   Provider: `../../_shared/utils/type-guards/type_guards.file_manager.ts` — `isRagContextSummaryResourceDescription`.
         * `[ ]`   Layer classification: shared runtime guard producer (introduced in Workstream C file_manager.ts node).
         * `[ ]`   Direction: consumed by implementation at runtime to narrow `resource_description` JSON.
         * `[ ]`   Purpose: reject rows with invalid or incomplete compression metadata before accessing typed fields.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from this function into `gatherArtifacts.ts` or `processComplexJob.ts`.
         * `[ ]`   No lateral layer violations with Workstream B callback/persistence modules.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `SupabaseClient.from('dialectic_project_resources').select('id,resource_type,resource_description,storage_bucket,storage_path,file_name').eq('resource_type', FileType.RagContextSummary).eq('session_id', sessionId).eq('iteration_number', iterationNumber).eq('stage_slug', stageSlug)` — select only required columns.
         * `[ ]`   `downloadFromStorage(dbClient, bucket, \`${storage_path}/${file_name}\`)` returning `{ data: ArrayBuffer | null, error: Error | null }` on success/error — `dbClient` is passed from `params.dbClient`; `path` is the combined `${row.storage_path}/${row.file_name}` concatenation, consistent with the call pattern used in `gatherArtifacts.ts`.
         * `[ ]`   `crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))` for fingerprint computation — no external dep required, available in Deno runtime.
         * `[ ]`   `logger.warn(msg, context)` for stale/skip events; `logger.info(msg, context)` for successful overlay events; `logger.error(msg, context)` for DB/download failure events.
      * `[ ]`   Injection shape: `ApplyCompressionOverlayDeps = { logger: ILogger; downloadFromStorage: DownloadFromStorageFn }`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated DB columns or tables.
         * `[ ]`   No hidden coupling to enqueue, saveResponse, netlifyResponse, or Workstream C internal modules.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.interface.test.ts`
      * `[ ]`   Valid `ApplyCompressionOverlayDeps`: object with logger and function `downloadFromStorage` satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayParams`: object with non-empty `projectId`, `sessionId`, `stageSlug`, numeric `iterationNumber`, and Supabase client shape satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayPayload`: object with array of `ResourceDocument`-shaped artifacts satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayPayload`: empty `artifacts` array satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlaySuccessReturn`: object with `artifacts` array and no `error` or `retriable` fields satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayErrorReturn`: object with `error: Error` instance and `retriable: boolean` and no `artifacts` field satisfies type.
      * `[ ]`   Invalid params: missing `stageSlug` rejected by type contract fixture.
      * `[ ]`   Invalid params: non-string `projectId` rejected by type contract fixture.
      * `[ ]`   Invalid payload: non-array `artifacts` rejected by type contract fixture.
      * `[ ]`   Invalid payload: artifact element missing `id` rejected by type contract fixture.
      * `[ ]`   Mock function from `createApplyCompressionOverlayMock` returns `ApplyCompressionOverlayReturn`-typed value for both success and error option shapes.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.interface.ts`
      * `[ ]`   Import `ILogger`, `ResourceDocuments` from `../../_shared/types.ts`.
      * `[ ]`   Import `DownloadFromStorageFn` from `../../_shared/supabase_storage_utils.ts`.
      * `[ ]`   Import `SupabaseClient` from `npm:@supabase/supabase-js@2`.
      * `[ ]`   Import `Database` from `../../types_db.ts`.
      * `[ ]`   Define `ApplyCompressionOverlayDeps`:
         * `[ ]`   `logger: ILogger`
         * `[ ]`   `downloadFromStorage: DownloadFromStorageFn`
      * `[ ]`   Define `ApplyCompressionOverlayParams`:
         * `[ ]`   `dbClient: SupabaseClient<Database>`
         * `[ ]`   `projectId: string`
         * `[ ]`   `sessionId: string`
         * `[ ]`   `iterationNumber: number`
         * `[ ]`   `stageSlug: string`
      * `[ ]`   Define `ApplyCompressionOverlayPayload`:
         * `[ ]`   `artifacts: Required<ResourceDocuments[number]>[]`
      * `[ ]`   Define `ApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   `artifacts: Required<ResourceDocuments[number]>[]`
      * `[ ]`   Define `ApplyCompressionOverlayErrorReturn`:
         * `[ ]`   `error: Error`
         * `[ ]`   `retriable: boolean`
      * `[ ]`   Define `ApplyCompressionOverlayReturn = ApplyCompressionOverlaySuccessReturn | ApplyCompressionOverlayErrorReturn`.
      * `[ ]`   Define `ApplyCompressionOverlayFn = (deps: ApplyCompressionOverlayDeps, params: ApplyCompressionOverlayParams, payload: ApplyCompressionOverlayPayload) => Promise<ApplyCompressionOverlayReturn>`.
      * `[ ]`   Define `BoundApplyCompressionOverlayFn = (params: ApplyCompressionOverlayParams, payload: ApplyCompressionOverlayPayload) => Promise<ApplyCompressionOverlayReturn>`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.interaction.spec`
      * `[ ]`   Entry: receive `deps`, `params`, `payload`.
      * `[ ]`   Step 1 — DB query: call `params.dbClient.from('dialectic_project_resources').select('id,resource_type,resource_description,storage_bucket,storage_path,file_name').eq('resource_type', FileType.RagContextSummary).eq('session_id', params.sessionId).eq('iteration_number', params.iterationNumber).eq('stage_slug', params.stageSlug)`.
      * `[ ]`   Failure mode 1: DB query returns error → log error and return `{ error: new Error(dbError.message), retriable: true }`.
      * `[ ]`   Branch 1 — empty rows: return `{ artifacts: payload.artifacts }` unchanged (success).
      * `[ ]`   Branch 2 — rows present: build mutable working copy `const overlaid = [...payload.artifacts]`; iterate each compression row.
      * `[ ]`   For each row:
         * `[ ]`   Guard `row.resource_description` with `isRagContextSummaryResourceDescription`; failure: log warn with `row.id` and `continue`.
         * `[ ]`   Find index `idx` in `overlaid` where `overlaid[idx].id === desc.target_document_id`; if `idx === -1`, log warn with `target_document_id` and `continue`.
         * `[ ]`   Compute fingerprint: `await computeFingerprint(overlaid[idx].content)` using SHA-256 hex of UTF-8 encoded content.
         * `[ ]`   Compare computed hex to `desc.source_fingerprint`; mismatch: log warn with `target_document_id`, `expected`, `actual` and `continue`.
         * `[ ]`   Call `deps.downloadFromStorage(params.dbClient, row.storage_bucket, \`${row.storage_path}/${row.file_name}\`)`.
         * `[ ]`   Failure mode 2: download error → log error and return `{ error: downloadResult.error, retriable: true }`.
         * `[ ]`   Decode `ArrayBuffer` with `new TextDecoder().decode(downloadResult.data)`.
         * `[ ]`   Replace: `overlaid[idx] = { ...overlaid[idx], content: decodedText }`.
         * `[ ]`   Log info with `target_document_id` and `row.file_name`.
      * `[ ]`   Return `{ artifacts: overlaid }`.
      * `[ ]`   Ordering invariant: `id`, `document_key`, `stage_slug`, and `type` must not be mutated or dropped at any step; only `content` changes.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.guard.test.ts`
      * `[ ]`   `isApplyCompressionOverlayDeps`:
         * `[ ]`   accept valid deps with logger shape (`info`, `warn`, `error` functions) and function `downloadFromStorage`.
         * `[ ]`   reject missing `logger`.
         * `[ ]`   reject `logger` missing `warn` function.
         * `[ ]`   reject non-function `downloadFromStorage`.
         * `[ ]`   reject null and non-object inputs.
      * `[ ]`   `isApplyCompressionOverlayParams`:
         * `[ ]`   accept valid params with `dbClient` having `from` function, non-empty `projectId`, `sessionId`, `stageSlug`, and numeric `iterationNumber`.
         * `[ ]`   reject empty string `projectId`.
         * `[ ]`   reject empty string `sessionId`.
         * `[ ]`   reject empty string `stageSlug`.
         * `[ ]`   reject non-number `iterationNumber` (string `'1'` rejected, boolean `false` rejected).
         * `[ ]`   reject missing `dbClient`.
         * `[ ]`   reject `dbClient` without `from` function.
      * `[ ]`   `isApplyCompressionOverlayPayload`:
         * `[ ]`   accept payload with an `artifacts` array (any elements).
         * `[ ]`   accept payload with empty `artifacts` array.
         * `[ ]`   reject non-array `artifacts`.
         * `[ ]`   reject null and non-object inputs.
      * `[ ]`   `isApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   accept `{ artifacts: [] }`.
         * `[ ]`   accept `{ artifacts: [validArtifact] }`.
         * `[ ]`   reject object containing both `artifacts` and `error` fields.
         * `[ ]`   reject object missing `artifacts`.
      * `[ ]`   `isApplyCompressionOverlayErrorReturn`:
         * `[ ]`   accept `{ error: new Error('msg'), retriable: false }`.
         * `[ ]`   accept `{ error: new Error('msg'), retriable: true }`.
         * `[ ]`   reject object with `artifacts` field present.
         * `[ ]`   reject object where `error` is not an Error instance.
         * `[ ]`   reject object where `retriable` is not a boolean.
         * `[ ]`   reject null and non-object inputs.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.guard.ts`
      * `[ ]`   Import `isRecord` from `../../_shared/utils/type-guards/type_guards.common.ts`.
      * `[ ]`   Import types from `./applyCompressionOverlay.interface.ts`.
      * `[ ]`   `isApplyCompressionOverlayDeps(value: unknown): value is ApplyCompressionOverlayDeps`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `logger` member has `info`, `warn`, `error` function properties.
         * `[ ]`   `typeof value.downloadFromStorage === 'function'`.
      * `[ ]`   `isApplyCompressionOverlayParams(value: unknown): value is ApplyCompressionOverlayParams`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `projectId`, `sessionId`, `stageSlug` are non-empty strings.
         * `[ ]`   `typeof value.iterationNumber === 'number'`.
         * `[ ]`   `dbClient` has `from` function (consistent with `isGatherArtifactsParams` pattern).
      * `[ ]`   `isApplyCompressionOverlayPayload(value: unknown): value is ApplyCompressionOverlayPayload`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `'artifacts' in value && Array.isArray(value.artifacts)`.
      * `[ ]`   `isApplyCompressionOverlaySuccessReturn(value: unknown): value is ApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `'artifacts' in value && Array.isArray(value.artifacts)`.
         * `[ ]`   `!('error' in value) && !('retriable' in value)`.
      * `[ ]`   `isApplyCompressionOverlayErrorReturn(value: unknown): value is ApplyCompressionOverlayErrorReturn`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `'error' in value && value.error instanceof Error`.
         * `[ ]`   `'retriable' in value && typeof value.retriable === 'boolean'`.
         * `[ ]`   `!('artifacts' in value)`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.mock.ts`
      * `[ ]`   Import `MockLogger` from `../../_shared/logger.mock.ts`.
      * `[ ]`   Import `createMockDownloadFromStorage` from `../../_shared/supabase_storage_utils.mock.ts`.
      * `[ ]`   Import `FileType`, `RagContextSummaryResourceDescription` from `../../_shared/types/file_manager.types.ts`.
      * `[ ]`   Import `DialecticProjectResourceRow` from `../../dialectic-service/dialectic.interface.ts`.
      * `[ ]`   Import all interface types and `ResourceDocuments` from interface file and `../../_shared/types.ts`.
      * `[ ]`   Import `SupabaseClient` from `npm:@supabase/supabase-js@2`; import `Database` from `../../types_db.ts`.
      * `[ ]`   Export `ApplyCompressionOverlayMockCall = { deps: ApplyCompressionOverlayDeps; params: ApplyCompressionOverlayParams; payload: ApplyCompressionOverlayPayload }`.
      * `[ ]`   Export `CreateApplyCompressionOverlayMockOptions = { handler?: ApplyCompressionOverlayFn; result?: ApplyCompressionOverlayReturn; successArtifacts?: Required<ResourceDocuments[number]>[]; error?: Error; retriable?: boolean }`.
      * `[ ]`   Export `buildApplyCompressionOverlayDeps(overrides?: Partial<ApplyCompressionOverlayDeps>): ApplyCompressionOverlayDeps`:
         * `[ ]`   Default `logger`: `new MockLogger()`.
         * `[ ]`   Default `downloadFromStorage`: `createMockDownloadFromStorage({ mode: 'success', data: new TextEncoder().encode('compressed-content').buffer })`.
      * `[ ]`   Export `buildApplyCompressionOverlayParams(dbClient: SupabaseClient<Database>, overrides?: Partial<ApplyCompressionOverlayParams>): ApplyCompressionOverlayParams`:
         * `[ ]`   Defaults: `projectId: 'project-abc'`, `sessionId: 'session-456'`, `iterationNumber: 1`, `stageSlug: 'thesis'`.
      * `[ ]`   Export `buildApplyCompressionOverlayPayload(artifacts?: Required<ResourceDocuments[number]>[]): ApplyCompressionOverlayPayload`:
         * `[ ]`   Default `artifacts`: one element `{ id: 'artifact-1', content: 'original-content', document_key: FileType.business_case, stage_slug: 'thesis', type: 'rendered_document' }`.
      * `[ ]`   Export `buildApplyCompressionOverlaySuccessReturn(artifacts?: Required<ResourceDocuments[number]>[]): ApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   Default: `{ artifacts: [{ id: 'artifact-1', content: 'compressed-content', document_key: FileType.business_case, stage_slug: 'thesis', type: 'rendered_document' }] }`.
      * `[ ]`   Export `buildApplyCompressionOverlayErrorReturn(error?: Error, retriable?: boolean): ApplyCompressionOverlayErrorReturn`:
         * `[ ]`   Defaults: `error: new Error('applyCompressionOverlay failed')`, `retriable: false`.
      * `[ ]`   Export `buildRagContextSummaryResourceDescription(overrides?: Partial<RagContextSummaryResourceDescription>): RagContextSummaryResourceDescription`:
         * `[ ]`   Defaults: `target_document_id: 'artifact-1'`, `target_document_key: FileType.business_case`, `source_fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'` (fixed 64-char hex placeholder — tests requiring a real fingerprint match must compute SHA-256 of their chosen `content` and supply it as an override), `compressed_by_model_id: 'gpt-4'`, `compressed_for_job_id: 'mock-job-id-uuid'`.
         * `[ ]`   Spread `overrides` last so callers can override any individual field.
      * `[ ]`   Export `buildCompressionResourceRow(overrides?: Partial<DialecticProjectResourceRow>): DialecticProjectResourceRow`:
         * `[ ]`   Defaults: `id: 'comp-resource-1'`, `project_id: 'project-abc'`, `session_id: 'session-456'`, `iteration_number: 1`, `stage_slug: 'thesis'`, `resource_type: FileType.RagContextSummary`, `resource_description: buildRagContextSummaryResourceDescription() as unknown as Json`, `storage_bucket: 'dialectic-contributions'`, `storage_path: 'project-abc/session_session-456/iteration_1/1_thesis/_work'`, `file_name: 'gpt-4_compressing_model-a_for_business_case_rag_summary.txt'`, `mime_type: 'text/plain'`, `size_bytes: 500`, `user_id: 'user-1'`, `created_at: new Date().toISOString()`, `updated_at: new Date().toISOString()`.
      * `[ ]`   Export `createApplyCompressionOverlayMock(options?: CreateApplyCompressionOverlayMockOptions): { applyCompressionOverlay: ApplyCompressionOverlayFn; calls: ApplyCompressionOverlayMockCall[] }`:
         * `[ ]`   Records each call in `calls` array.
         * `[ ]`   If `options.handler` provided, delegates to it.
         * `[ ]`   If `options.result` provided, returns it.
         * `[ ]`   If `options.error` provided, returns `buildApplyCompressionOverlayErrorReturn(options.error, options.retriable)`.
         * `[ ]`   Default: returns `buildApplyCompressionOverlaySuccessReturn(options?.successArtifacts)`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.test.ts`
      * `[ ]`   All tests: use `buildApplyCompressionOverlayDeps`, `buildApplyCompressionOverlayParams`, `buildApplyCompressionOverlayPayload`, `buildCompressionResourceRow`, `buildRagContextSummaryResourceDescription` from mock file; mock Supabase client from `createMockSupabaseClient` in `../../_shared/supabase.mock.ts`.
      * `[ ]`   Test: DB returns empty rows → `isApplyCompressionOverlaySuccessReturn(result)` true; `result.artifacts` content identical to input payload artifacts.
      * `[ ]`   Test: DB query error → `isApplyCompressionOverlayErrorReturn(result)` true; `result.retriable` is `true`.
      * `[ ]`   Test: one compression row with `target_document_id: 'artifact-1'`, `source_fingerprint` set to actual SHA-256 hex of `'original-content'`, `downloadFromStorage` returning `new TextEncoder().encode('compressed-text').buffer` → success return; `result.artifacts[0].content === 'compressed-text'`; `result.artifacts[0].id === 'artifact-1'`; `result.artifacts[0].document_key`, `stage_slug`, `type` unchanged.
      * `[ ]`   Test: one compression row with `source_fingerprint` that does not match SHA-256 of artifact `content` → success return; `result.artifacts[0].content === 'original-content'` (unchanged); `MockLogger.warn` called once.
      * `[ ]`   Test: one compression row with `target_document_id` not present in payload artifacts → success return; artifact list unchanged; `MockLogger.warn` called once.
      * `[ ]`   Test: one compression row with `resource_description: null` → success return; artifact list unchanged; `MockLogger.warn` called once.
      * `[ ]`   Test: one fresh-matching compression row, `downloadFromStorage` returns error → `isApplyCompressionOverlayErrorReturn(result)` true; `result.retriable` is `true`.
      * `[ ]`   Test: two compression rows — first with matching fresh fingerprint, second with stale fingerprint → `result.artifacts[0].content` replaced with download text; artifact matching second row's target unchanged; one warn log for stale row; success return.
      * `[ ]`   Test: empty payload `artifacts` array with one compression row → no match; `result.artifacts` is empty array; `MockLogger.warn` called once; success return.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts`
      * `[ ]`   Import `FileType`, `RagContextSummaryResourceDescription` from `../../_shared/types/file_manager.types.ts`.
      * `[ ]`   Import `isRagContextSummaryResourceDescription` from `../../_shared/utils/type-guards/type_guards.file_manager.ts`.
      * `[ ]`   Import `ApplyCompressionOverlayFn`, `ApplyCompressionOverlayErrorReturn`, `ApplyCompressionOverlaySuccessReturn` from `./applyCompressionOverlay.interface.ts`.
      * `[ ]`   Define private `async function computeFingerprint(content: string): Promise<string>`:
         * `[ ]`   `const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))`.
         * `[ ]`   `return Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, '0')).join('')`.
      * `[ ]`   Export `const applyCompressionOverlay: ApplyCompressionOverlayFn = async (deps, params, payload) => { ... }`:
         * `[ ]`   Destructure `logger`, `downloadFromStorage` from `deps`.
         * `[ ]`   Destructure `dbClient`, `sessionId`, `iterationNumber`, `stageSlug` from `params`.
         * `[ ]`   `const { data: compressionRows, error: dbError } = await dbClient.from('dialectic_project_resources').select('id,resource_type,resource_description,storage_bucket,storage_path,file_name').eq('resource_type', FileType.RagContextSummary).eq('session_id', sessionId).eq('iteration_number', iterationNumber).eq('stage_slug', stageSlug)`.
         * `[ ]`   On `dbError`: `logger.error('applyCompressionOverlay: DB query failed', { error: dbError.message })`; return `{ error: new Error(dbError.message), retriable: true }`.
         * `[ ]`   On `!compressionRows || compressionRows.length === 0`: return `{ artifacts: payload.artifacts }`.
         * `[ ]`   `const overlaid = [...payload.artifacts]`.
         * `[ ]`   For each `row` in `compressionRows`:
            * `[ ]`   `if (!isRagContextSummaryResourceDescription(row.resource_description)) { logger.warn('applyCompressionOverlay: invalid resource_description, skipping', { rowId: row.id }); continue; }`.
            * `[ ]`   `const desc: RagContextSummaryResourceDescription = row.resource_description`.
            * `[ ]`   `const idx = overlaid.findIndex(a => a.id === desc.target_document_id)`.
            * `[ ]`   `if (idx === -1) { logger.warn('applyCompressionOverlay: no artifact match, skipping', { target_document_id: desc.target_document_id }); continue; }`.
            * `[ ]`   `const computedFingerprint = await computeFingerprint(overlaid[idx].content)`.
            * `[ ]`   `if (computedFingerprint !== desc.source_fingerprint) { logger.warn('applyCompressionOverlay: stale artifact, skipping overlay', { target_document_id: desc.target_document_id, expected: desc.source_fingerprint, actual: computedFingerprint }); continue; }`.
            * `[ ]`   `const downloadResult = await downloadFromStorage(dbClient, row.storage_bucket, \`${row.storage_path}/${row.file_name}\`)`.
            * `[ ]`   On download error (`downloadResult.error`): `logger.error('applyCompressionOverlay: download failed', { file_name: row.file_name })`; return `{ error: downloadResult.error, retriable: true }`.
            * `[ ]`   `const decodedText = new TextDecoder().decode(downloadResult.data)`.
            * `[ ]`   `overlaid[idx] = { ...overlaid[idx], content: decodedText }`.
            * `[ ]`   `logger.info('applyCompressionOverlay: overlay applied', { target_document_id: desc.target_document_id, file_name: row.file_name })`.
         * `[ ]`   Return `{ artifacts: overlaid }`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.provides.ts`
      * `[ ]`   `export { applyCompressionOverlay } from './applyCompressionOverlay.ts'`.
      * `[ ]`   `export type { ApplyCompressionOverlayDeps, ApplyCompressionOverlayParams, ApplyCompressionOverlayPayload, ApplyCompressionOverlayFn, ApplyCompressionOverlaySuccessReturn, ApplyCompressionOverlayErrorReturn, ApplyCompressionOverlayReturn, BoundApplyCompressionOverlayFn } from './applyCompressionOverlay.interface.ts'`.
      * `[ ]`   `export { isApplyCompressionOverlayDeps, isApplyCompressionOverlayParams, isApplyCompressionOverlayPayload, isApplyCompressionOverlaySuccessReturn, isApplyCompressionOverlayErrorReturn } from './applyCompressionOverlay.guard.ts'`.
      * `[ ]`   `export type { ApplyCompressionOverlayMockCall, CreateApplyCompressionOverlayMockOptions } from './applyCompressionOverlay.mock.ts'`.
      * `[ ]`   `export { buildApplyCompressionOverlayDeps, buildApplyCompressionOverlayParams, buildApplyCompressionOverlayPayload, buildApplyCompressionOverlaySuccessReturn, buildApplyCompressionOverlayErrorReturn, buildRagContextSummaryResourceDescription, buildCompressionResourceRow, createApplyCompressionOverlayMock } from './applyCompressionOverlay.mock.ts'`.

   * `[ ]`   `construction`
      * `[ ]`   `applyCompressionOverlay` is a stateless exported constant function (no class, no closure state) bound over `ApplyCompressionOverlayDeps`.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   At the DI boundary, caller constructs and injects `logger` and `downloadFromStorage` into `deps`; `dbClient` is passed per-call in `params`, consistent with the `gatherArtifacts` DI pattern.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker domain — intermediate orchestration function between Workstream C storage-layer producers and the `gatherArtifacts` consumer.
      * `[ ]`   Dependencies remain inward-facing: shared types, guards, storage utility, and DB row types from lower layers.
      * `[ ]`   Outbound interface is `ApplyCompressionOverlayFn` and `BoundApplyCompressionOverlayFn` exported via `provides.ts`.
      * `[ ]`   No cycles introduced with `gatherArtifacts.ts`, `processComplexJob.ts`, `compressPrompt.ts`, or any Workstream C module.

   * `[ ]`   `requirements`
      * `[ ]`   `applyCompressionOverlay` correctly overlays compression content for all fresh-matching artifacts and leaves stale, unmatched, or invalid-description rows untouched.
      * `[ ]`   Canonical artifact identity (`id`, `document_key`, `stage_slug`, `type`) is immutable through the entire overlay lifecycle; only `content` is replaced.
      * `[ ]`   DB query errors and download errors return retriable errors; description guard failures and fingerprint mismatches produce only warn logs and skip behavior.
      * `[ ]`   All unit tests covering happy path, stale skip, no-match skip, invalid-description skip, DB error, download error, and multi-row scenarios pass.
      * `[ ]`   Integration test for the `applyCompressionOverlay → gatherArtifacts` chain belongs to `gatherArtifacts.ts`, which is the consumer that closes the chain.
      * `[ ]`   Node scope remains limited to `applyCompressionOverlay.ts` and its immediate support files; no other source file is modified in this node.

* `[ ]`   supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts **[BE] Wire applyCompressionOverlay into post-gather pipeline by adding dep and stageSlug param; call overlay after dedup step and propagate its return**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing call site for `applyCompressionOverlay`: the function exists as of the prior node but is never invoked — `gatherArtifacts` currently returns `{ artifacts: Array.from(uniqueById.values()) }` directly, meaning persisted `RagContextSummary` compression artifacts are gathered from the DB (by `applyCompressionOverlay` in a future call) but the in-memory content swap is never applied before the artifact list reaches the model job.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `applyCompressionOverlay: ApplyCompressionOverlayFn` to `GatherArtifactsDeps`.
         * `[ ]`   Add `stageSlug: string` to `GatherArtifactsParams`.
         * `[ ]`   Destructure `stageSlug` from `params` in the `gatherArtifacts` implementation alongside the existing `dbClient`, `projectId`, `sessionId`, `iterationNumber` destructuring.
         * `[ ]`   After the `uniqueById` dedup step, assign `const dedupedArtifacts = Array.from(uniqueById.values())` and call `await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts })`.
         * `[ ]`   If the overlay result satisfies `isApplyCompressionOverlayErrorReturn`, return the overlay result directly (error + retriable propagated as-is).
         * `[ ]`   Otherwise return `{ artifacts: overlayResult.artifacts }` as the success return.
         * `[ ]`   Update `isGatherArtifactsDeps` to require `typeof value.applyCompressionOverlay === 'function'`.
         * `[ ]`   Update `isGatherArtifactsParams` to require `stageSlug` is a non-empty string.
         * `[ ]`   Update `buildGatherArtifactsDeps` default to include `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay`.
         * `[ ]`   Update `buildGatherArtifactsParams` default to include `stageSlug: 'thesis'`.
         * `[ ]`   Update all existing integration tests in `gatherArtifacts.integration.test.ts`: each test constructs `deps` as a plain object literal `{ logger, pickLatest, downloadFromStorage }` — add `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` to every such literal. Import `createApplyCompressionOverlayMock` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`. No existing assertions change.
         * `[ ]`   Add a new integration test proving the `applyCompressionOverlay → gatherArtifacts` chain operates end-to-end with the real `applyCompressionOverlay` function.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   All existing gather loop logic, rule-type branches, dedup step, error paths, and success returns are unchanged.
         * `[ ]`   `stageSlug` is required; an empty string is rejected by the guard.
         * `[ ]`   The overlay call uses deps already held by `gatherArtifacts` (`deps.logger`, `deps.downloadFromStorage`) — no new deps are introduced beyond `applyCompressionOverlay` itself.
         * `[ ]`   No changes to `applyCompressionOverlay.ts` or any Workstream C source file are made in this node.
         * `[ ]`   Call sites (`processSimpleJob.ts`, `index.ts`) are separate nodes and are not modified here.
      * `[ ]`   Each goal is atomic and testable through updated interface, guard, unit, and integration coverage within this module.

   * `[ ]`   `role`
      * `[ ]`   Node role is modification of the existing `gatherArtifacts` pipeline to consume `applyCompressionOverlay` as the final step before returning the artifact list.
      * `[ ]`   This role is correct because `gatherArtifacts.ts` owns the artifact assembly pipeline and is the natural call site for the overlay: it holds `dbClient`, `sessionId`, `iterationNumber`, `stageSlug`, and `downloadFromStorage` — all required by `applyCompressionOverlay` — without any additional fetching.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not update `processSimpleJob.ts` or `index.ts` call sites in this node; those are separate nodes.
         * `[ ]`   Do not modify `applyCompressionOverlay.ts` or any of its support files.
         * `[ ]`   Do not change the gather rule loop, dedup logic, or existing error return paths.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/gatherArtifacts/` and the immediately imported new dep `applyCompressionOverlay.provides.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   `gatherArtifacts.interface.ts` — new fields on `GatherArtifactsDeps` and `GatherArtifactsParams`.
         * `[ ]`   `gatherArtifacts.guard.ts` — updated guards for new fields.
         * `[ ]`   `gatherArtifacts.mock.ts` — updated builders with new field defaults.
         * `[ ]`   `gatherArtifacts.interface.test.ts`, `gatherArtifacts.guard.test.ts`, `gatherArtifacts.test.ts` — updated and new tests.
         * `[ ]`   `gatherArtifacts.ts` — destructure `stageSlug`; call `applyCompressionOverlay` after dedup.
         * `[ ]`   `gatherArtifacts.integration.test.ts` — updated existing tests + new chain integration test.
      * `[ ]`   Outside boundary:
         * `[ ]`   `applyCompressionOverlay.ts` and its support files — consumed as an opaque dep.
         * `[ ]`   `processSimpleJob.ts` and `index.ts` call site updates — separate nodes.
         * `[ ]`   `gatherArtifacts.provides.ts` — no changes required; all added exports already flow through existing re-export lines.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../applyCompressionOverlay/applyCompressionOverlay.provides.ts` — `ApplyCompressionOverlayFn`, `isApplyCompressionOverlayErrorReturn`, `createApplyCompressionOverlayMock`.
         * `[ ]`   Layer classification: dialectic-worker peer utility producer (introduced in prior Workstream D node).
         * `[ ]`   Direction: consumed by `gatherArtifacts.interface.ts` (type), `gatherArtifacts.ts` (invocation + error check), `gatherArtifacts.mock.ts` (default dep builder).
         * `[ ]`   Purpose: type the new `GatherArtifactsDeps.applyCompressionOverlay` field; guard-check its return before propagating; supply a default mock in `buildGatherArtifactsDeps`.
      * `[ ]`   Confirm:
         * `[ ]`   All existing deps (`ILogger`, `ResourceDocuments`, `DownloadFromStorageFn`, `PickLatestFn`, `InputRule`, `SupabaseClient<Database>`) remain unchanged.
         * `[ ]`   No reverse dependency from this function into `processSimpleJob.ts` or `index.ts`.
         * `[ ]`   No lateral layer violations with Workstream B or C modules.

   * `[ ]`   `context_slice`
      * `[ ]`   The overlay call is inserted between the existing dedup step and the final success return:
         * `[ ]`   `const dedupedArtifacts = Array.from(uniqueById.values())` (replaces the inline `Array.from` on the return line).
         * `[ ]`   `const overlayResult = await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts })`.
         * `[ ]`   `if (isApplyCompressionOverlayErrorReturn(overlayResult)) { return overlayResult; }`.
         * `[ ]`   `return { artifacts: overlayResult.artifacts }`.
      * `[ ]`   `stageSlug` is destructured from `params` alongside the existing four fields.
      * `[ ]`   The early-exit path `if (rules.length === 0) { return { artifacts: [] }; }` remains before the overlay call — the overlay is never invoked for empty rule sets.
      * `[ ]`   Confirm:
         * `[ ]`   No new DB queries are introduced in `gatherArtifacts.ts`; the compression row query is entirely inside `applyCompressionOverlay`.
         * `[ ]`   No new imports from `_shared` or Supabase are required; `isApplyCompressionOverlayErrorReturn` is imported from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.interface.test.ts`
      * `[ ]`   Existing tests pass without change once `buildGatherArtifactsDeps` and `buildGatherArtifactsParams` are updated.
      * `[ ]`   Add: valid `GatherArtifactsDeps` with `applyCompressionOverlay` as a function satisfies type.
      * `[ ]`   Add: `GatherArtifactsDeps` missing `applyCompressionOverlay` rejected by type contract fixture.
      * `[ ]`   Add: valid `GatherArtifactsParams` with non-empty `stageSlug` satisfies type.
      * `[ ]`   Add: `GatherArtifactsParams` missing `stageSlug` rejected by type contract fixture.
      * `[ ]`   Add: `GatherArtifactsParams` with empty string `stageSlug` rejected by type contract fixture.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.interface.ts`
      * `[ ]`   Add import: `ApplyCompressionOverlayFn` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   Add to `GatherArtifactsDeps`: `applyCompressionOverlay: ApplyCompressionOverlayFn`.
      * `[ ]`   Add to `GatherArtifactsParams`: `stageSlug: string`.
      * `[ ]`   All other types (`GatherArtifactsPayload`, `GatherArtifactsSuccessReturn`, `GatherArtifactsErrorReturn`, `GatherArtifactsReturn`, `GatherArtifactsFn`, `BoundGatherArtifactsFn`) are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.interaction.spec`
      * `[ ]`   Entry: receive `deps`, `params`, `payload`.
      * `[ ]`   If `payload.inputsRequired` is empty or falsy: return `{ artifacts: [] }` immediately — overlay is never called.
      * `[ ]`   Rule-based gather loop over `payload.inputsRequired` (unchanged): for each rule, query the appropriate table, filter rows, pick latest, download content, push to `gathered`.
      * `[ ]`   Dedup: `const uniqueById = new Map(); for (const a of gathered) { if (!uniqueById.has(a.id)) uniqueById.set(a.id, a); }`.
      * `[ ]`   `const dedupedArtifacts = Array.from(uniqueById.values())`.
      * `[ ]`   Call overlay: `const overlayResult = await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts })`.
      * `[ ]`   Failure mode — overlay error: `if (isApplyCompressionOverlayErrorReturn(overlayResult)) return overlayResult` — propagates `{ error, retriable }` as-is.
      * `[ ]`   Success: return `{ artifacts: overlayResult.artifacts }`.
      * `[ ]`   Ordering invariant: artifact identity fields (`id`, `document_key`, `stage_slug`, `type`) from the gather loop are preserved through the overlay; only `content` may be mutated by `applyCompressionOverlay`.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.guard.test.ts`
      * `[ ]`   `isGatherArtifactsDeps` — add:
         * `[ ]`   accept valid deps that now include a function `applyCompressionOverlay`.
         * `[ ]`   reject deps missing `applyCompressionOverlay`.
         * `[ ]`   reject deps where `applyCompressionOverlay` is not a function (e.g. `null`, `'string'`).
      * `[ ]`   `isGatherArtifactsParams` — add:
         * `[ ]`   accept valid params with non-empty `stageSlug`.
         * `[ ]`   reject params missing `stageSlug`.
         * `[ ]`   reject params with empty string `stageSlug`.
      * `[ ]`   All existing guard tests for `isGatherArtifactsPayload`, `isGatherArtifactsSuccessReturn`, `isGatherArtifactsErrorReturn` remain unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.guard.ts`
      * `[ ]`   In `isGatherArtifactsDeps`: add check `!('applyCompressionOverlay' in value) || typeof value.applyCompressionOverlay !== 'function'` → return false.
      * `[ ]`   In `isGatherArtifactsParams`: add check `!('stageSlug' in value) || typeof value.stageSlug !== 'string' || value.stageSlug === ''` → return false.
      * `[ ]`   All other guard functions (`isGatherArtifactsPayload`, `isGatherArtifactsSuccessReturn`, `isGatherArtifactsErrorReturn`) are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.mock.ts`
      * `[ ]`   Add import: `createApplyCompressionOverlayMock` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   In `buildGatherArtifactsDeps`: add `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` to the base object.
      * `[ ]`   In `buildGatherArtifactsParams`: add `stageSlug: 'thesis'` to the base object.
      * `[ ]`   All other exported builders and factories (`buildDocumentRule`, `buildFeedbackRule`, `buildSeedPromptRule`, `buildProjectResourceRule`, `buildHeaderContextRule`, `buildDialecticProjectResourceRow`, `buildDialecticFeedbackRow`, `buildDialecticContributionRow`, `buildGatherArtifact`, `buildGatherArtifactsSuccessReturn`, `buildGatherArtifactsErrorReturn`, `buildSelectResult`, `buildSelectHandler`, `createGatherArtifactsMock`) are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.test.ts`
      * `[ ]`   Existing tests: no changes required — `buildGatherArtifactsDeps` and `buildGatherArtifactsParams` now include the new fields by default, so all existing tests acquire the new fields transparently.
      * `[ ]`   Add test: empty `inputsRequired` → `applyCompressionOverlay` is NOT called; result is success with empty artifacts. Use `createApplyCompressionOverlayMock()` and assert `calls.length === 0`.
      * `[ ]`   Add test: gather loop succeeds with one artifact → `applyCompressionOverlay` is called once; assert `calls[0].payload.artifacts.length === 1` and `calls[0].payload.artifacts[0].id` matches the gathered artifact's id.
      * `[ ]`   Add test: `applyCompressionOverlay` returns `{ error: new Error('overlay'), retriable: true }` → `gatherArtifacts` returns that error return directly; `isGatherArtifactsErrorReturn(result)` is true; `result.retriable` is true.
      * `[ ]`   Add test: `applyCompressionOverlay` returns success with modified artifacts → `gatherArtifacts` returns `{ artifacts: modifiedArtifacts }`.
      * `[ ]`   All new tests use `buildGatherArtifactsDeps` with `applyCompressionOverlay` overridden to a controlled mock where needed; mock DB client from `createMockSupabaseClient`.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts`
      * `[ ]`   Add import: `isApplyCompressionOverlayErrorReturn` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   In the `gatherArtifacts` function body, extend the `params` destructuring to include `stageSlug`: `const { dbClient, projectId, sessionId, iterationNumber, stageSlug } = params`.
      * `[ ]`   Replace the current final success block:
         * `[ ]`   Before (current): `const success: GatherArtifactsSuccessReturn = { artifacts: Array.from(uniqueById.values()) }; return success;`
         * `[ ]`   After: `const dedupedArtifacts = Array.from(uniqueById.values()); const overlayResult = await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts }); if (isApplyCompressionOverlayErrorReturn(overlayResult)) { return overlayResult; } return { artifacts: overlayResult.artifacts };`
      * `[ ]`   All other lines in `gatherArtifacts.ts` are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.integration.test.ts`
      * `[ ]`   Add import: `createApplyCompressionOverlayMock` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   Update all four existing `Deno.test` blocks: each constructs `deps` as a plain object literal `{ logger, pickLatest, downloadFromStorage }`. Add `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` to every such literal. No existing assertions change.
      * `[ ]`   Add integration test `"integration: applyCompressionOverlay → gatherArtifacts: no compression rows → artifacts pass through unchanged"`:
         * `[ ]`   Import the real `applyCompressionOverlay` function from `../applyCompressionOverlay/applyCompressionOverlay.ts`.
         * `[ ]`   Construct `deps` using the updated plain literal pattern (matching existing tests) but set `applyCompressionOverlay` to the real imported function.
         * `[ ]`   Configure mock DB using `createMockSupabaseClient` with `genericMockResults.dialectic_project_resources.select` returning `[buildDialecticProjectResourceRow({ id: 'int-passthrough-1' })]`. The row's default `resource_description: null` causes `applyCompressionOverlay` to find no valid RagContextSummary rows and return the artifacts unchanged.
         * `[ ]`   Configure `downloadFromStorage` to return `toArrayBuffer('document-content')`.
         * `[ ]`   Call real `gatherArtifacts` with `buildGatherArtifactsParams(dbClient)` (which now supplies `stageSlug: 'thesis'` by default) and `buildGatherArtifactsPayload([buildDocumentRule()])`.
         * `[ ]`   Assert `isGatherArtifactsSuccessReturn(result)` is true.
         * `[ ]`   Assert `result.artifacts[0].id === 'int-passthrough-1'` and `result.artifacts[0].content === 'document-content'` — content unchanged because overlay found no valid RagContextSummary rows.
      * `[ ]`   Add integration test `"integration: applyCompressionOverlay → gatherArtifacts: overlay error propagates as retriable"`:
         * `[ ]`   Construct `deps` as a plain literal but override `applyCompressionOverlay` with a stub returning `{ error: new Error('overlay DB error'), retriable: true }`.
         * `[ ]`   Configure mock DB to return document rows for the gather loop query.
         * `[ ]`   Call real `gatherArtifacts`.
         * `[ ]`   Assert `isGatherArtifactsErrorReturn(result)` is true; `result.retriable` is true; `result.error.message === 'overlay DB error'`.

   * `[ ]`   `construction`
      * `[ ]`   `gatherArtifacts` remains a stateless exported constant function with no new closure state introduced.
      * `[ ]`   `applyCompressionOverlay` is injected at the DI construction boundary (by `index.ts` in the `boundGatherArtifacts` closure — a separate node); within `gatherArtifacts.ts` it is treated as an opaque async function.
      * `[ ]`   No partial construction path is introduced.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker domain — `gatherArtifacts` remains an intermediate orchestration function; adding the overlay call does not change its layer position.
      * `[ ]`   `applyCompressionOverlay` is a peer dialectic-worker utility; importing it from its provides module does not introduce a cross-layer violation.
      * `[ ]`   No new cycles: `applyCompressionOverlay` does not import from `gatherArtifacts`, so the dependency is strictly one-directional.
      * `[ ]`   Outbound interface (`GatherArtifactsFn`, `BoundGatherArtifactsFn`) is unchanged in shape — callers only observe an additional `applyCompressionOverlay` field in deps and `stageSlug` field in params.

   * `[ ]`   `requirements`
      * `[ ]`   `GatherArtifactsDeps.applyCompressionOverlay: ApplyCompressionOverlayFn` and `GatherArtifactsParams.stageSlug: string` are present and required by the updated interface.
      * `[ ]`   `isGatherArtifactsDeps` rejects objects missing `applyCompressionOverlay` or where it is not a function.
      * `[ ]`   `isGatherArtifactsParams` rejects objects missing `stageSlug` or where it is an empty string.
      * `[ ]`   `buildGatherArtifactsDeps()` and `buildGatherArtifactsParams(dbClient)` supply the new fields by default, keeping all existing unit tests GREEN without modification.
      * `[ ]`   All four existing integration tests are updated to include `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` in their plain deps literals, keeping them GREEN.
      * `[ ]`   `applyCompressionOverlay` is called exactly once per `gatherArtifacts` invocation when `inputsRequired` is non-empty; it is never called when `inputsRequired` is empty.
      * `[ ]`   An error return from `applyCompressionOverlay` is propagated directly as `GatherArtifactsErrorReturn` with the overlay's `retriable` flag preserved.
      * `[ ]`   Integration test for `applyCompressionOverlay → gatherArtifacts` is located in this node. Integration test for `gatherArtifacts → processSimpleJob` chain belongs in `processSimpleJob.ts`.
      * `[ ]`   Node scope is limited to `gatherArtifacts/` module files; `processSimpleJob.ts` and `index.ts` call site updates are separate nodes.

* `[ ]`   supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts **[BE] Thread parentJob, projectId, iteration, and embeddingModelProviderId from CalculateAffordabilityParams into CompressPromptParams, and propagate CompressPromptPendingReturn as CalculateAffordabilityPendingReturn**

   * `[ ]`   `objective`
      * `[ ]`   Solve two params gaps in `calculateAffordability.ts`: (1) it constructs `compressParams` and calls `deps.compressPrompt` but does not supply `parentJob`, `projectId`, `iteration`, or `embeddingModelProviderId` — fields now required by the updated `CompressPromptParams` contract established by the prior compressPrompt WS-D node; (2) it does not handle `CompressPromptPendingReturn` returned by `compressPrompt` when EMBED jobs are spawned, causing the parent-pause signal to be silently dropped.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `parentJob: DialecticJobRow`, `projectId: string`, `iteration: number`, and `embeddingModelProviderId: string` to `CalculateAffordabilityParams`.
         * `[ ]`   Thread all four new fields from `params` into the `compressParams` object constructed in the oversized execution path before `deps.compressPrompt` is called.
         * `[ ]`   Add `CalculateAffordabilityPendingReturn = { waitingForChildren: true }` to `CalculateAffordabilitySuccessReturn` so the return remains a binary `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn`.
         * `[ ]`   Add `isCalculateAffordabilityPendingReturn` runtime guard.
         * `[ ]`   In `calculateAffordability.ts`, after the `isCompressPromptErrorReturn` check, add: `if (isCompressPromptPendingReturn(compressResult)) return { waitingForChildren: true }`.
         * `[ ]`   Add runtime guards for all four new fields in `isCalculateAffordabilityParams`.
         * `[ ]`   Add default values for all four new fields in `buildCalculateAffordabilityParams` so all existing callers compile and run without changes.
         * `[ ]`   Add unit test coverage asserting the four fields are passed to `deps.compressPrompt` in the oversized path and asserting the waiting return propagates correctly.
         * `[ ]`   Export `CalculateAffordabilityPendingReturn`, `CalculateAffordabilitySuccessReturn`, and `isCalculateAffordabilityPendingReturn` from `calculateAffordability.provides.ts`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No change to affordability logic: NSF detection, rationality thresholds, context window checks, token counting, `getMaxOutputTokens` calls, and direct-return paths are unchanged.
         * `[ ]`   All existing tests in `calculateAffordability.test.ts`, `calculateAffordability.guard.test.ts`, `calculateAffordability.interface.test.ts`, and `calculateAffordability.integration.test.ts` remain GREEN.
         * `[ ]`   No edits to `compressPrompt.ts`, `prepareModelJob.ts`, or any file outside the `calculateAffordability/` folder in this node.
      * `[ ]`   Each goal is atomic and testable through updated interface, guard, mock, unit, and integration assertions in this module scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is consumer params update and waiting-state propagation: `calculateAffordability.ts` is the construction site of `CompressPromptParams` and the sole caller of `deps.compressPrompt`; it must supply the updated contract fields and faithfully propagate all return shapes including `waitingForChildren`.
      * `[ ]`   This role is correct because `calculateAffordability.ts` is the only site where `CompressPromptParams` is constructed and `deps.compressPrompt` is invoked; the interface, guard, mock, and tests must be updated to reflect the new required fields and the new return variant.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify how `compressPrompt.ts` persists artifacts or spawns EMBED jobs in this node.
         * `[ ]`   Do not modify `prepareModelJob.ts` bindings or params in this node.
         * `[ ]`   Do not add new dependencies to `CalculateAffordabilityDeps`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/calculateAffordability/` (all ten files in that directory: `.interface.ts`, `.interface.test.ts`, `.guard.ts`, `.guard.test.ts`, `.mock.ts`, `.test.ts`, `.ts`, `.integration.test.ts`, `.provides.ts`).
      * `[ ]`   Inside boundary:
         * `[ ]`   The four new fields in `CalculateAffordabilityParams` and their guard/mock/test coverage.
         * `[ ]`   `CalculateAffordabilityPendingReturn`, `CalculateAffordabilitySuccessReturn`, `isCalculateAffordabilityPendingReturn`, and their test and provides coverage.
         * `[ ]`   The `compressParams` construction inside `calculateAffordability.ts` that passes the new fields to `deps.compressPrompt`.
         * `[ ]`   The `waitingForChildren` propagation branch inside `calculateAffordability.ts`.
      * `[ ]`   Outside boundary:
         * `[ ]`   What `compressPrompt.ts` does with `parentJob`, `projectId`, `iteration`, and `embeddingModelProviderId` internally.
         * `[ ]`   File manager persistence, path construction, and artifact registration details.
         * `[ ]`   How `prepareModelJob.ts` binds and supplies these fields to `calculateAffordability`.

   * `[ ]`   `deps`
      * `[ ]`   No new dependencies added to `CalculateAffordabilityDeps`.
      * `[ ]`   Provider: `../compressPrompt/compressPrompt.interface.ts` (`CompressPromptParams` contract) and `../compressPrompt/compressPrompt.guard.ts` (`isCompressPromptPendingReturn`).
         * `[ ]`   Layer classification: peer-module contract producer.
         * `[ ]`   Direction: inbound; `calculateAffordability.ts` constructs `CompressPromptParams` which now requires `parentJob`, `projectId`, `iteration`, and `embeddingModelProviderId`.
         * `[ ]`   Purpose: the four new fields in `CalculateAffordabilityParams` exist solely to satisfy the updated `CompressPromptParams` contract; `isCompressPromptPendingReturn` is consumed to detect and propagate the pending state.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal new interface required from dependencies:
         * `[ ]`   `CompressPromptParams.parentJob: DialecticJobRow` — threaded from `CalculateAffordabilityParams.parentJob`.
         * `[ ]`   `CompressPromptParams.projectId: string` — threaded from `CalculateAffordabilityParams.projectId`.
         * `[ ]`   `CompressPromptParams.iteration: number` — threaded from `CalculateAffordabilityParams.iteration`.
         * `[ ]`   `CompressPromptParams.embeddingModelProviderId: string` — threaded from `CalculateAffordabilityParams.embeddingModelProviderId`.
         * `[ ]`   `isCompressPromptPendingReturn(v: unknown): v is CompressPromptPendingReturn` — used to detect the Phase A / B pending signal returned by `deps.compressPrompt`.
      * `[ ]`   Injection shape remains `CalculateAffordabilityDeps`, `CalculateAffordabilityParams`, `CalculateAffordabilityPayload`; only `CalculateAffordabilityParams` gains four additive required fields.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; no field beyond the four is newly required from any dependency.
         * `[ ]`   No hidden coupling to job results, wallet state, or file storage schema.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.test.ts`
      * `[ ]`   Add contract assertion `CalculateAffordabilityPendingReturn shape declares waitingForChildren: true`:
         * `[ ]`   Assign `const pending: CalculateAffordabilityPendingReturn = { waitingForChildren: true }` and assert `pending.waitingForChildren === true`.
         * `[ ]`   Assign `const asSuccess: CalculateAffordabilitySuccessReturn = pending` to prove `CalculateAffordabilityPendingReturn` is assignable to `CalculateAffordabilitySuccessReturn`.
      * `[ ]`   Add contract assertion `CalculateAffordabilityParams shape includes parentJob, projectId, iteration, embeddingModelProviderId`:
         * `[ ]`   Call `buildCalculateAffordabilityParams(client, { projectId: 'proj-abc', iteration: 3, embeddingModelProviderId: 'embed-provider-uuid', parentJob: minimalJobFixture })`.
         * `[ ]`   Assert `typeof params.projectId === 'string'` and `params.projectId === 'proj-abc'`.
         * `[ ]`   Assert `typeof params.iteration === 'number'` and `params.iteration === 3`.
         * `[ ]`   Assert `typeof params.embeddingModelProviderId === 'string'` and `params.embeddingModelProviderId === 'embed-provider-uuid'`.
         * `[ ]`   Assert `typeof params.parentJob === 'object'` and `params.parentJob !== null`.
      * `[ ]`   Preserve all existing return-shape contract assertions (`DirectReturn`, `CompressedReturn`, `ErrorReturn`) unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.interface.ts`
      * `[ ]`   Add import: `import type { DialecticJobRow } from '../../dialectic-service/dialectic.interface.ts'` at the top of the imports block.
      * `[ ]`   Add `projectId: string` to `CalculateAffordabilityParams` after `sessionId: string`.
      * `[ ]`   Add `iteration: number` to `CalculateAffordabilityParams` after `projectId: string`.
      * `[ ]`   Add `embeddingModelProviderId: string` to `CalculateAffordabilityParams` after `iteration: number`.
      * `[ ]`   Add `parentJob: DialecticJobRow` to `CalculateAffordabilityParams` after `embeddingModelProviderId: string`.
      * `[ ]`   Add: `export interface CalculateAffordabilityPendingReturn { waitingForChildren: true }`.
      * `[ ]`   Add: `export type CalculateAffordabilitySuccessReturn = CalculateAffordabilityDirectReturn | CalculateAffordabilityCompressedReturn | CalculateAffordabilityPendingReturn`.
      * `[ ]`   Change `CalculateAffordabilityReturn` to: `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn`.
      * `[ ]`   Keep all other fields and all other interfaces (`CalculateAffordabilityDeps`, `CalculateAffordabilityPayload`, `CalculateAffordabilityDirectReturn`, `CalculateAffordabilityCompressedReturn`, `CalculateAffordabilityErrorReturn`, `TierOutputCapTokens`, `UserConfig`, `GetMaxOutputTokensFn`, `CalculateAffordabilityFn`, `BoundCalculateAffordabilityFn`) unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.test.ts`
      * `[ ]`   Add `isCalculateAffordabilityPendingReturn` test group:
         * `[ ]`   Returns `true` for `{ waitingForChildren: true }`.
         * `[ ]`   Returns `false` for `{ waitingForChildren: false }`.
         * `[ ]`   Returns `false` for `null`, `undefined`, `{}`, `{ error: new Error('x') }`, `{ wasCompressed: false, maxOutputTokens: 100, resolvedInputTokenCount: 50 }`.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params missing parentJob`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `projectId: 'test'`, `iteration: 1`, `embeddingModelProviderId: 'uuid'` but omitting `parentJob`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params missing embeddingModelProviderId`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `projectId: 'test'`, `iteration: 1`, `parentJob: {}` but omitting `embeddingModelProviderId`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params missing projectId`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `iteration: 1`, `embeddingModelProviderId: 'uuid'`, `parentJob: {}` but omitting `projectId`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Add negative guard test `isCalculateAffordabilityParams rejects params where iteration is a string`:
         * `[ ]`   Construct a params-like object with all existing valid fields plus `projectId: 'test'`, `embeddingModelProviderId: 'uuid'`, `parentJob: {}`, but with `iteration: 'not-a-number'`.
         * `[ ]`   Assert `isCalculateAffordabilityParams(value) === false`.
      * `[ ]`   Preserve all other existing positive and negative guard test assertions unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.guard.ts`
      * `[ ]`   Add import: `CalculateAffordabilityPendingReturn` from `'./calculateAffordability.interface.ts'` in the existing import block.
      * `[ ]`   Add the following four checks to `isCalculateAffordabilityParams` after the existing `userConfig` / `tier_output_cap_tokens` check:
         * `[ ]`   `if (!("projectId" in value) || typeof value.projectId !== "string" || value.projectId === "") { return false; }`
         * `[ ]`   `if (!("iteration" in value) || typeof value.iteration !== "number") { return false; }`
         * `[ ]`   `if (!("embeddingModelProviderId" in value) || typeof value.embeddingModelProviderId !== "string" || value.embeddingModelProviderId === "") { return false; }`
         * `[ ]`   `if (!("parentJob" in value) || !isRecord(value.parentJob)) { return false; }`
      * `[ ]`   Add: `export function isCalculateAffordabilityPendingReturn(v: unknown): v is CalculateAffordabilityPendingReturn { return isRecord(v) && v['waitingForChildren'] === true && !('wasCompressed' in v) && !('error' in v); }`
      * `[ ]`   Keep all other guards (`isCalculateAffordabilityDeps`, `isCalculateAffordabilityPayload`, `isCalculateAffordabilityDirectReturn`, `isCalculateAffordabilityCompressedReturn`, `isCalculateAffordabilityErrorReturn`, `isBoundCalculateAffordabilityFn`) completely unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.mock.ts`
      * `[ ]`   Add import: `import type { DialecticJobRow } from '../../dialectic-service/dialectic.interface.ts'`.
      * `[ ]`   Add import: `import { mockDialecticJobRow } from '../prepareModelJob/prepareModelJob.mock.ts'` to the existing imports block.
      * `[ ]`   Add import: `import type { CalculateAffordabilityPendingReturn } from './calculateAffordability.interface.ts'` (add to existing interface import block).
      * `[ ]`   Add `projectId?: string`, `iteration?: number`, `embeddingModelProviderId?: string`, `parentJob?: DialecticJobRow` to `CalculateAffordabilityParamsOverrides`.
      * `[ ]`   In `buildCalculateAffordabilityParams`, add to the `base` object:
         * `[ ]`   `projectId: overrides?.projectId !== undefined ? overrides.projectId : 'contract-project-id',`
         * `[ ]`   `iteration: overrides?.iteration !== undefined ? overrides.iteration : 1,`
         * `[ ]`   `embeddingModelProviderId: overrides?.embeddingModelProviderId !== undefined ? overrides.embeddingModelProviderId : 'contract-embedding-provider-id',`
         * `[ ]`   `parentJob: overrides?.parentJob ?? mockDialecticJobRow(),`
      * `[ ]`   Add: `export function buildCalculateAffordabilityPendingReturn(): CalculateAffordabilityPendingReturn { return { waitingForChildren: true }; }`
      * `[ ]`   Keep all other exported symbols, existing defaults, and override patterns unchanged: `buildCalculateAffordabilityDeps`, `buildCalculateAffordabilityPayload`, `buildCalculateAffordabilityDirectReturn`, `buildCalculateAffordabilityCompressedReturn`, `buildCalculateAffordabilityErrorReturn`, `buildMockBoundCalculateAffordabilityFn`, `buildMockCalculateAffordabilityFn`, `CalculateAffordabilityDepsOverrides`, `CalculateAffordabilityParamsOverrides`, `CalculateAffordabilityPayloadOverrides`, `MockBoundCalculateAffordabilityFnOptions`, `MockCalculateAffordabilityFnOptions`.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.test.ts`
      * `[ ]`   All existing tests pass without modification because `buildCalculateAffordabilityParams` now supplies default values for all four new fields.
      * `[ ]`   Add unit test `Oversized: compressPrompt is called with parentJob, projectId, iteration, and embeddingModelProviderId threaded from calculateAffordabilityParams`:
         * `[ ]`   Call `buildCalculateAffordabilityParams(client, { projectId: 'threading-test-project', iteration: 5, embeddingModelProviderId: 'embed-provider-uuid-1', parentJob: { id: 'parent-job-id-test', ...minimalJobFields } as DialecticJobRow, walletBalance: 10_000_000, extendedModelConfig: buildExtendedModelConfig({ context_window_tokens: 50_000, provider_max_input_tokens: 128_000 }), inputRate: 0.01, outputRate: 0.01, inputsRelevance: [{ document_key: 'thesis_plan', relevance: 1 }] })`.
         * `[ ]`   Use `buildMockBoundCalculateAffordabilityFn` pattern from `compressPrompt.mock.ts` (`createCompressPromptMock`) to capture calls; configure it to return `buildCompressPromptSuccessReturn(...)`.
         * `[ ]`   Use `createMockCountTokens` returning `100_000` on the first call to force the oversized path.
         * `[ ]`   Assert `calls.length >= 1`.
         * `[ ]`   Assert `calls[0].params.projectId === 'threading-test-project'`.
         * `[ ]`   Assert `calls[0].params.iteration === 5`.
         * `[ ]`   Assert `calls[0].params.embeddingModelProviderId === 'embed-provider-uuid-1'`.
         * `[ ]`   Assert `typeof calls[0].params.parentJob === 'object' && calls[0].params.parentJob !== null`.
         * `[ ]`   Assert `calls[0].params.parentJob.id === 'parent-job-id-test'`.
      * `[ ]`   Add unit test `Oversized: compressPrompt returning pending propagates as CalculateAffordabilityPendingReturn`:
         * `[ ]`   Override `deps.compressPrompt` to return `buildCompressPromptPendingReturn()` (from updated `compressPrompt.mock.ts`).
         * `[ ]`   Use `createMockCountTokens` returning `100_000` to force the oversized path.
         * `[ ]`   Call `calculateAffordability(deps, params, payload)`.
         * `[ ]`   Assert `isCalculateAffordabilityPendingReturn(result)` is `true`.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts`
      * `[ ]`   Add import: `import { isCompressPromptPendingReturn } from '../compressPrompt/compressPrompt.guard.ts'` to the imports block.
      * `[ ]`   In the `compressParams: CompressPromptParams` object construction in the oversized path (after the existing `walletBalance` field), add:
         * `[ ]`   `projectId: params.projectId,`
         * `[ ]`   `iteration: params.iteration,`
         * `[ ]`   `embeddingModelProviderId: params.embeddingModelProviderId,`
         * `[ ]`   `parentJob: params.parentJob,`
      * `[ ]`   After the existing `if (isCompressPromptErrorReturn(compressResult)) { return { error: ..., retriable: ... }; }` block, add: `if (isCompressPromptPendingReturn(compressResult)) { return { waitingForChildren: true }; }`.
      * `[ ]`   Keep all other implementation logic unchanged: token counting, NSF checks, rationality threshold evaluations, `solveTargetForBalance`, `balanceAfterCompression` computation, `compressPayload` construction, and `compressResult` success handling.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.integration.test.ts`
      * `[ ]`   All existing integration tests pass without modification because `buildCalculateAffordabilityParams` now supplies defaults for all four new fields, which flow through to the bound `compressPrompt` call.
      * `[ ]`   Add integration test `calculateAffordability propagates pending return when compressPrompt returns CompressPromptPendingReturn`:
         * `[ ]`   Build deps with `compressPrompt` overridden to an async mock returning `buildCompressPromptPendingReturn()` as `CompressPromptReturn`.
         * `[ ]`   Configure `countTokens` mock to return `100_000` on first call to force the oversized path.
         * `[ ]`   Build params using `buildCalculateAffordabilityParams(adminClient, { walletBalance: 10_000_000, extendedModelConfig: buildExtendedModelConfig({ context_window_tokens: 50_000, provider_max_input_tokens: 128_000 }), inputRate: 0.01, outputRate: 0.01, inputsRelevance: [{ document_key: 'thesis_plan', relevance: 1 }] })`.
         * `[ ]`   Call `calculateAffordability(deps, params, payload)`.
         * `[ ]`   Assert `isCalculateAffordabilityPendingReturn(result)` is `true`.
      * `[ ]`   Confirm that the existing oversized-path integration scenario still asserts `isCalculateAffordabilityCompressedReturn(result) === true` and `result.resolvedInputTokenCount > 0` — proving the four new fields flowed through the real `calculateAffordability` → real `compressPrompt` call chain without type or runtime error.

   * `[ ]`   `construction`
      * `[ ]`   `calculateAffordability` remains a pure async function over `(deps, params, payload)` with no global state or constructor.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   The four new params fields are required at call time; no lazy defaults or optional fallbacks are used in the source implementation.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker execution utility.
      * `[ ]`   The four new fields flow inward from the calling context (`prepareModelJob.ts`) through `CalculateAffordabilityParams` and outward into `CompressPromptParams` via the existing `deps.compressPrompt` call.
      * `[ ]`   `CalculateAffordabilityPendingReturn` flows outward to `prepareModelJob.ts` which detects it via `isCalculateAffordabilityPendingReturn` from `calculateAffordability.provides.ts`.
      * `[ ]`   No new dependency cycles or layer violations are introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `CalculateAffordabilityParams` includes required `parentJob: DialecticJobRow`, `projectId: string`, `iteration: number`, and `embeddingModelProviderId: string` fields.
      * `[ ]`   `isCalculateAffordabilityParams` returns `false` when any of `parentJob`, `projectId`, `iteration`, or `embeddingModelProviderId` is absent or of the wrong primitive type.
      * `[ ]`   `calculateAffordability` passes `params.parentJob`, `params.projectId`, `params.iteration`, and `params.embeddingModelProviderId` into the `compressParams` object in the oversized execution path before calling `deps.compressPrompt`.
      * `[ ]`   `calculateAffordability` returns `CalculateAffordabilityPendingReturn { waitingForChildren: true }` when `deps.compressPrompt` returns `CompressPromptPendingReturn`; this is a success return, a member of `CalculateAffordabilitySuccessReturn`.
      * `[ ]`   `isCalculateAffordabilityPendingReturn` accepts `{ waitingForChildren: true }` and rejects all other shapes including `{ waitingForChildren: false }`, error returns, direct returns, and compressed returns.
      * `[ ]`   `CalculateAffordabilityPendingReturn`, `CalculateAffordabilitySuccessReturn`, and `isCalculateAffordabilityPendingReturn` are exported from `calculateAffordability.provides.ts` for consumption by `prepareModelJob.ts`.
      * `[ ]`   The threading unit test proves all four fields are passed by asserting on captured `compressPrompt` call arguments.
      * `[ ]`   The pending unit test proves propagation by asserting `isCalculateAffordabilityPendingReturn(result)`.
      * `[ ]`   All previously passing tests in `calculateAffordability.test.ts`, `calculateAffordability.guard.test.ts`, `calculateAffordability.interface.test.ts`, and `calculateAffordability.integration.test.ts` remain GREEN.
      * `[ ]`   Node scope is limited to the ten files in `calculateAffordability/`; `prepareModelJob.ts` changes remain in the next WS-D node.

   * `[ ]`   `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.provides.ts`
      * `[ ]`   Add `CalculateAffordabilityPendingReturn` and `CalculateAffordabilitySuccessReturn` to the type re-exports from `'./calculateAffordability.interface.ts'`.
      * `[ ]`   Add `isCalculateAffordabilityPendingReturn` to the guard re-exports from `'./calculateAffordability.guard.ts'`.
      * `[ ]`   Add `buildCalculateAffordabilityPendingReturn` to the mock factory re-exports from `'./calculateAffordability.mock.ts'`.
      * `[ ]`   Preserve all existing exports: `calculateAffordability` (implementation), all existing interface types, all existing guard functions, all existing mock factories and override types.

* `[ ]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts **[BE] Resolve default embedding provider and supply embeddingModelProviderId, parentJob, projectId, and iteration to CalculateAffordabilityParams; surface CalculateAffordabilityPendingReturn as PrepareModelJobPendingReturn within PrepareModelJobSuccessReturn**

   * `[ ]`   `objective`
      * `[ ]`   Solve three `affordParams` construction gaps in `prepareModelJob.ts`: (1) `CalculateAffordabilityParams` now requires `projectId`, `iteration`, `embeddingModelProviderId`, and `parentJob` but the call site supplies none of them; (2) `embeddingModelProviderId` (the `ai_providers.id` UUID of the default embedding provider) must be resolved from the DB at runtime before `affordParams` is built; (3) `calculateAffordability` can now return `CalculateAffordabilityPendingReturn` (a success variant) when `compressPrompt` spawns EMBED jobs, but `prepareModelJob.ts` has no matching return sub-type or dispatch branch for this signal, causing the parent-pause signal to be silently dropped.
      * `[ ]`   Functional goals:
         * `[ ]`   Query `ai_providers` for the single row where `is_default_embedding = true` and `is_active = true` before building `affordParams`, and extract its `id` UUID as `embeddingModelProviderId`.
         * `[ ]`   Return a retriable error if the `ai_providers` DB query returns an error.
         * `[ ]`   Return a non-retriable error if no default embedding provider row is found or `id` is not a string.
         * `[ ]`   Add `projectId: projectIdRaw`, `iteration: iterationNumberRaw`, `embeddingModelProviderId`, and `parentJob: job` to the `affordParams: CalculateAffordabilityParams` object construction.
         * `[ ]`   Add `export interface PrepareModelJobQueuedReturn { queued: true }` (explicit named type for the enqueue-success shape) and `export interface PrepareModelJobPendingReturn { waitingForChildren: true }` to `prepareModelJob.interface.ts`; change `PrepareModelJobSuccessReturn` from `interface { queued: true }` to `export type PrepareModelJobSuccessReturn = PrepareModelJobQueuedReturn | PrepareModelJobPendingReturn` so the return type remains a binary `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn` union and no inline object type appears anywhere.
         * `[ ]`   Add `isPrepareModelJobPendingReturn` sub-type guard to `prepareModelJob.guard.ts`; update `isPrepareModelJobSuccessReturn` to accept both the `{ queued: true }` shape and the `{ waitingForChildren: true }` shape.
         * `[ ]`   After the `isCalculateAffordabilityErrorReturn(affordResult)` dispatch in `prepareModelJob.ts`, add: `if (isCalculateAffordabilityPendingReturn(affordResult)) { deps.logger.info('[prepareModelJob] Job paused waiting for EMBED children', { jobId: job.id }); return { waitingForChildren: true }; }`.
         * `[ ]`   Preserve all existing validation steps, field extraction, wallet query, cost-rate validation, and enqueue call behavior unchanged.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No new fields added to `PrepareModelJobDeps`, `PrepareModelJobParams`, or `PrepareModelJobPayload`; the embedding model provider is resolved from the DB using the existing `params.dbClient`.
         * `[ ]`   `PrepareModelJobReturn` remains a binary `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn` union; no third top-level return type is introduced.
         * `[ ]`   All existing tests in `prepareModelJob.test.ts`, `prepareModelJob.inputsRequired.test.ts`, and `prepareModelJob.integration.test.ts` remain GREEN after mock client is updated to return embedding provider data.
         * `[ ]`   No edits to `calculateAffordability.ts`, `compressPrompt.ts`, `index.ts`, or any file outside `prepareModelJob/` in this node.
      * `[ ]`   Each goal is atomic and testable through updated interface, guard, mock, unit, and integration coverage in this module scope.

   * `[ ]`   `role`
      * `[ ]`   Node role is orchestration implementation update: `prepareModelJob.ts` is the call-site that constructs `CalculateAffordabilityParams` and must supply the four fields now required by the prior calculateAffordability WS-D node; it is also the boundary where `CalculateAffordabilityPendingReturn` must be surfaced as `PrepareModelJobPendingReturn` (a sub-type of `PrepareModelJobSuccessReturn`) so its consumer (`processSimpleJob.ts`) can detect the parent-pause signal.
      * `[ ]`   This role is correct because `prepareModelJob.ts` is the only file that builds and passes `affordParams` to `deps.calculateAffordability`, and `job` (the parent job row) is already in scope there; `embeddingModelProviderId` is the only value that requires a new runtime DB resolution.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not change how `calculateAffordability.ts` builds or passes `compressParams` in this node.
         * `[ ]`   Do not add `embeddingModelProviderId` or embedding provider resolution to `PrepareModelJobDeps`.
         * `[ ]`   Do not change the `enqueueModelCall` invocation shape in this node.
         * `[ ]`   Do not update `processSimpleJob.ts` to handle `isPrepareModelJobPendingReturn` in this node; that is the next node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/prepareModelJob/` (all ten files in that directory).
      * `[ ]`   Inside boundary:
         * `[ ]`   The new `ai_providers` DB query and its error handling.
         * `[ ]`   The four additive fields in the `affordParams` object literal.
         * `[ ]`   `PrepareModelJobPendingReturn`, `isPrepareModelJobPendingReturn`, the updated `PrepareModelJobSuccessReturn` union, the updated `isPrepareModelJobSuccessReturn`, and their test and provides coverage.
         * `[ ]`   Mock helper for a default embedding provider row and `buildPrepareModelJobPendingReturn` factory.
         * `[ ]`   Test coverage for the two new error paths, field threading, and pending propagation.
      * `[ ]`   Outside boundary:
         * `[ ]`   How `calculateAffordability.ts` or `compressPrompt.ts` uses `embeddingModelProviderId` internally.
         * `[ ]`   `index.ts` DI wiring for `calculateAffordability` deps.
         * `[ ]`   Artifact lifecycle management and parent-resume overlay resolution.
         * `[ ]`   `processSimpleJob.ts` handling of `PrepareModelJobPendingReturn` — that is the next node.

   * `[ ]`   `deps`
      * `[ ]`   No new fields added to `PrepareModelJobDeps`.
      * `[ ]`   Provider: `params.dbClient` (`SupabaseClient<Database>`).
         * `[ ]`   Layer classification: existing injected infrastructure dependency.
         * `[ ]`   Direction: inbound; already present in `PrepareModelJobParams`.
         * `[ ]`   Purpose: execute the new `ai_providers` query for the default embedding provider alongside the existing `user_subscriptions` tier-cap query.
      * `[ ]`   Provider: `../calculateAffordability/calculateAffordability.provides.ts` (`isCalculateAffordabilityPendingReturn`).
         * `[ ]`   Layer classification: peer-module guard consumer.
         * `[ ]`   Direction: inbound; added alongside the existing `isCalculateAffordabilityErrorReturn` import.
         * `[ ]`   Purpose: detect the pending success variant returned by `deps.calculateAffordability` so it can be re-surfaced as `PrepareModelJobPendingReturn`.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal new interface required from dependencies:
         * `[ ]`   `ai_providers.id: string` — the only field selected from the embedding provider row; used as `embeddingModelProviderId` in `affordParams`.
         * `[ ]`   `isCalculateAffordabilityPendingReturn(v: unknown): v is CalculateAffordabilityPendingReturn` — imported from `calculateAffordability.provides.ts`; used to detect and propagate the pending success signal.
      * `[ ]`   All other injected interfaces (`BoundCalculateAffordabilityFn`, `BoundEnqueueModelCallFn`, wallet service, cost-rate validator, scope filter) remain unchanged.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; only `id` is selected from `ai_providers`.
         * `[ ]`   No hidden coupling to artifact DB rows or file storage schema.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.interface.test.ts`
      * `[ ]`   Preserve all existing contract assertions unchanged except: update `Contract: PrepareModelJobSuccessReturn queued true` to assign via the explicit named sub-type — `const r: PrepareModelJobQueuedReturn = { queued: true }; const s: PrepareModelJobSuccessReturn = r; assertEquals(r.queued, true)` — because `PrepareModelJobSuccessReturn` is now a union and direct property access on the union type requires narrowing.
      * `[ ]`   Update `Contract: PrepareModelJobReturn accepts success branch` to use the explicit sub-type: `const r: PrepareModelJobQueuedReturn = { queued: true }; const ret: PrepareModelJobReturn = r; assertEquals('queued' in ret, true)`.
      * `[ ]`   Add contract assertion `PrepareModelJobQueuedReturn shape declares queued: true`:
         * `[ ]`   `const queued: PrepareModelJobQueuedReturn = { queued: true }; assertEquals(queued.queued, true)`.
      * `[ ]`   Add contract assertion `PrepareModelJobPendingReturn shape declares waitingForChildren: true`:
         * `[ ]`   `const pending: PrepareModelJobPendingReturn = { waitingForChildren: true }; assertEquals(pending.waitingForChildren, true)`.
      * `[ ]`   Add contract assertions that both sub-types are assignable to `PrepareModelJobSuccessReturn` and to `PrepareModelJobReturn`:
         * `[ ]`   `const successAsQueued: PrepareModelJobSuccessReturn = { queued: true } as PrepareModelJobQueuedReturn; assertEquals('queued' in successAsQueued, true)`.
         * `[ ]`   `const successAsPending: PrepareModelJobSuccessReturn = { waitingForChildren: true } as PrepareModelJobPendingReturn; assertEquals('waitingForChildren' in successAsPending, true)`.
         * `[ ]`   `const retAsPending: PrepareModelJobReturn = { waitingForChildren: true } as PrepareModelJobPendingReturn; assertEquals('waitingForChildren' in retAsPending, true)`.
      * `[ ]`   Add assertion that `PrepareModelJobDeps` still declares exactly seven dependency keys (no new dep added).

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.interface.ts`
      * `[ ]`   Add: `export interface PrepareModelJobQueuedReturn { queued: true }`.
      * `[ ]`   Add: `export interface PrepareModelJobPendingReturn { waitingForChildren: true }`.
      * `[ ]`   Change `PrepareModelJobSuccessReturn` (currently `interface { queued: true }` or equivalent type alias) to: `export type PrepareModelJobSuccessReturn = PrepareModelJobQueuedReturn | PrepareModelJobPendingReturn`.
      * `[ ]`   `PrepareModelJobReturn` is unchanged: `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn` — remains binary.
      * `[ ]`   Keep all other types (`PrepareModelJobDeps`, `PrepareModelJobParams`, `PrepareModelJobPayload`, `PrepareModelJobErrorReturn`, `PrepareModelJobFn`, `PrepareModelJobExecutionError`) completely unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.guard.test.ts`
      * `[ ]`   Update `isPrepareModelJobSuccessReturn` test group: add assertions that it returns `true` for `{ waitingForChildren: true }` (pending shape); assert it continues to return `true` for `{ queued: true }` (queued shape); assert it returns `false` for `{ error: new Error('x'), retriable: false }`.
      * `[ ]`   Add `isPrepareModelJobPendingReturn` test group at the end of the file:
         * `[ ]`   Returns `true` for `{ waitingForChildren: true }`.
         * `[ ]`   Returns `false` for `{ waitingForChildren: false }`.
         * `[ ]`   Returns `false` for `null`.
         * `[ ]`   Returns `false` for `{}`.
         * `[ ]`   Returns `false` for `{ error: new Error('x'), retriable: false }`.
         * `[ ]`   Returns `false` for `{ queued: true }`.
      * `[ ]`   Preserve all other existing guard test groups unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.guard.ts`
      * `[ ]`   Add import: `PrepareModelJobPendingReturn` to the existing import block from `'./prepareModelJob.interface.ts'`.
      * `[ ]`   Add: `export function isPrepareModelJobPendingReturn(v: unknown): v is PrepareModelJobPendingReturn { return isRecord(v) && v['waitingForChildren'] === true && !('queued' in v) && !('error' in v); }`.
      * `[ ]`   Update `isPrepareModelJobSuccessReturn`: change body to accept both the queued shape and the pending shape — `return isRecord(v) && !('error' in v) && ('waitingForChildren' in v ? v['waitingForChildren'] === true : 'queued' in v && v['queued'] === true)`.
      * `[ ]`   Keep all other existing guard functions (`isPrepareModelJobDeps`, `isPrepareModelJobParams`, `isPrepareModelJobPayload`, `isPrepareModelJobErrorReturn`) completely unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.mock.ts`
      * `[ ]`   Add import: `PrepareModelJobQueuedReturn` and `PrepareModelJobPendingReturn` to the existing interface import block from `'./prepareModelJob.interface.ts'`.
      * `[ ]`   Add `mockDefaultEmbeddingProviderRow()` factory that returns a minimal `Tables<'ai_providers'>`-compatible object with `{ id: 'embedding-provider-uuid', api_identifier: 'text-embedding-3-small', is_default_embedding: true, is_active: true }` plus any required non-nullable DB columns from `Tables<'ai_providers'>` defaulted to inert values.
      * `[ ]`   Add: `export function buildPrepareModelJobQueuedReturn(): PrepareModelJobQueuedReturn { return { queued: true }; }`.
      * `[ ]`   Add: `export function buildPrepareModelJobPendingReturn(): PrepareModelJobPendingReturn { return { waitingForChildren: true }; }`.
      * `[ ]`   Update the return type annotation on the existing `buildPrepareModelJobSuccessReturn` factory from `PrepareModelJobSuccessReturn` (which now resolves to a union) to `PrepareModelJobQueuedReturn` so the factory remains narrowly typed and callers that need the queued shape get the precise type — the return value `{ queued: true }` is unchanged.
      * `[ ]`   Keep all other existing mock factory functions and override types unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call's `genericMockResults` to add or replace the `ai_providers.select` mock so it returns `{ data: mockDefaultEmbeddingProviderRow(), error: null }` (single object, matching the `maybeSingle()` return shape) alongside the existing mocks, so existing tests continue to resolve `embeddingModelProviderId` without error.
      * `[ ]`   Add unit test `prepareModelJob returns retriable error when embedding provider query fails`:
         * `[ ]`   Mock `ai_providers.select` to return `{ data: null, error: { message: 'db-down', code: '500' } }`.
         * `[ ]`   Assert `isPrepareModelJobErrorReturn(result) === true`.
         * `[ ]`   Assert `result.retriable === true`.
      * `[ ]`   Add unit test `prepareModelJob returns non-retriable error when no default embedding provider row exists`:
         * `[ ]`   Mock `ai_providers.select` to return `{ data: null, error: null }`.
         * `[ ]`   Assert `isPrepareModelJobErrorReturn(result) === true`.
         * `[ ]`   Assert `result.retriable === false`.
         * `[ ]`   Assert `result.error.message` includes `'No default embedding provider'`.
      * `[ ]`   Add unit test `prepareModelJob passes projectId, iteration, embeddingModelProviderId, and parentJob to calculateAffordability`:
         * `[ ]`   Use a capturing `BoundCalculateAffordabilityFn` spy (`spy(async () => buildCalculateAffordabilityDirectReturn(0))`).
         * `[ ]`   Build a job with `mockDialecticJobRow(mockDialecticExecuteJobPayload({ projectId: 'threading-proj', iterationNumber: 3 }))`.
         * `[ ]`   Mock `ai_providers.select` to return `{ data: { id: 'embed-provider-uuid-99' }, error: null }`.
         * `[ ]`   Assert the spy was called at least once.
         * `[ ]`   Assert `spy.calls[0].args[0].projectId === 'threading-proj'`.
         * `[ ]`   Assert `spy.calls[0].args[0].iteration === 3`.
         * `[ ]`   Assert `spy.calls[0].args[0].embeddingModelProviderId === 'embed-provider-uuid-99'`.
         * `[ ]`   Assert `typeof spy.calls[0].args[0].parentJob === 'object' && spy.calls[0].args[0].parentJob !== null`.
         * `[ ]`   Assert `spy.calls[0].args[0].parentJob.id === job.id`.
      * `[ ]`   Add unit test `prepareModelJob propagates pending success when calculateAffordability returns pending`:
         * `[ ]`   Override `deps.calculateAffordability` to return `buildCalculateAffordabilityPendingReturn()` (imported from `calculateAffordability.mock.ts`).
         * `[ ]`   Mock `ai_providers.select` to return `{ data: mockDefaultEmbeddingProviderRow(), error: null }`.
         * `[ ]`   Call `prepareModelJob(deps, params, payload)`.
         * `[ ]`   Assert `isPrepareModelJobSuccessReturn(result) === true`.
         * `[ ]`   Assert `isPrepareModelJobPendingReturn(result) === true`.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.inputsRequired.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call to include `ai_providers.select` returning `{ data: mockDefaultEmbeddingProviderRow(), error: null }` so all existing inputsRequired tests pass without change to their assertions.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts`
      * `[ ]`   Add `isCalculateAffordabilityPendingReturn` to the existing import from `'../calculateAffordability/calculateAffordability.provides.ts'` (alongside the existing `isCalculateAffordabilityErrorReturn` and `isCalculateAffordabilityCompressedReturn` imports).
      * `[ ]`   After the `tierCapQueryResult` block (the `user_subscriptions` query and its error/data handling, ending at the `userConfig` declaration), add a new DB query block for the default embedding provider:
         * `[ ]`   `const embeddingProviderResult = await dbClient.from('ai_providers').select('id').eq('is_default_embedding', true).eq('is_active', true).maybeSingle();`
         * `[ ]`   `if (embeddingProviderResult.error !== null) { deps.logger.warn('[prepareModelJob] Failed to load default embedding provider', { jobId: job.id, message: embeddingProviderResult.error.message }); return { error: embeddingProviderResult.error, retriable: true }; }`
         * `[ ]`   `if (embeddingProviderResult.data === null || typeof embeddingProviderResult.data.id !== 'string') { return { error: new Error('No default embedding provider configured; cannot build compression artifact paths.'), retriable: false }; }`
         * `[ ]`   `const embeddingModelProviderId: string = embeddingProviderResult.data.id;`
      * `[ ]`   In the `affordParams: CalculateAffordabilityParams` object construction, add alongside existing fields:
         * `[ ]`   `projectId: projectIdRaw,`
         * `[ ]`   `iteration: iterationNumberRaw,`
         * `[ ]`   `embeddingModelProviderId,`
         * `[ ]`   `parentJob: job,`
      * `[ ]`   After the existing `if (isCalculateAffordabilityErrorReturn(affordResult)) { return { error: affordResult.error, retriable: affordResult.retriable }; }` block, add: `if (isCalculateAffordabilityPendingReturn(affordResult)) { deps.logger.info('[prepareModelJob] Job paused waiting for EMBED children', { jobId: job.id }); return { waitingForChildren: true }; }`
      * `[ ]`   Keep all other implementation logic unchanged: tier-cap query, payload extraction, model config validation, wallet balance load, cost-rate validation, scope application, base chat request construction, enqueue call, and error-catch boundary.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.provides.ts`
      * `[ ]`   Add `PrepareModelJobQueuedReturn` and `PrepareModelJobPendingReturn` to the type re-exports from `'./prepareModelJob.interface.ts'`.
      * `[ ]`   Add `isPrepareModelJobPendingReturn` to the guard re-exports from `'./prepareModelJob.guard.ts'`.
      * `[ ]`   Add `mockDefaultEmbeddingProviderRow`, `buildPrepareModelJobQueuedReturn`, and `buildPrepareModelJobPendingReturn` to the mock factory re-exports from `'./prepareModelJob.mock.ts'`.
      * `[ ]`   Preserve all existing exports unchanged: `prepareModelJob` (implementation), all existing interface types, all existing guard functions, all existing mock factories.

   * `[ ]`   `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.integration.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call to return `{ data: mockDefaultEmbeddingProviderRow(), error: null }` from the `ai_providers.select` mock so existing integration paths resolve the embedding provider without error.
      * `[ ]`   In the existing `calculateAffordability direct return flows through enqueueModelCall to success` integration path, capture the `calculateAffordability` spy call and assert:
         * `[ ]`   `spy.calls[0].args[0].projectId === executePayload.projectId`.
         * `[ ]`   `spy.calls[0].args[0].iteration === executePayload.iterationNumber`.
         * `[ ]`   `spy.calls[0].args[0].embeddingModelProviderId === mockDefaultEmbeddingProviderRow().id`.
         * `[ ]`   `typeof spy.calls[0].args[0].parentJob === 'object' && spy.calls[0].args[0].parentJob !== null`.

   * `[ ]`   `construction`
      * `[ ]`   `prepareModelJob` remains a pure async function over `(deps, params, payload)` with no global state.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Initialization order: tier-cap query → embedding provider query → payload extraction → validation → model config → wallet balance → cost rates → scope application → `baseChatApiRequest` → `affordParams` (with all four new fields) → affordability call → pending / error / success dispatch → enqueue call.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker orchestration.
      * `[ ]`   The new `ai_providers` query is an inward infrastructure call (db → local variable); `embeddingModelProviderId` and `parentJob` then flow outward into `affordParams` passed to `deps.calculateAffordability`.
      * `[ ]`   `PrepareModelJobPendingReturn` flows outward to `processSimpleJob.ts` which detects it via `isPrepareModelJobPendingReturn` from `prepareModelJob.provides.ts` (that handling is in the next node).
      * `[ ]`   No new dependency cycles or layer violations introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `PrepareModelJobReturn` is `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn` — binary; no third top-level type is introduced.
      * `[ ]`   `PrepareModelJobQueuedReturn` is `{ queued: true }` — explicit named type for the enqueue-success shape; no inline object type appears in `PrepareModelJobSuccessReturn` or anywhere else.
      * `[ ]`   `PrepareModelJobSuccessReturn` is `PrepareModelJobQueuedReturn | PrepareModelJobPendingReturn`; both named sub-types are valid success returns.
      * `[ ]`   `isPrepareModelJobSuccessReturn` returns `true` for `{ queued: true }` and for `{ waitingForChildren: true }`.
      * `[ ]`   `isPrepareModelJobPendingReturn` returns `true` only for `{ waitingForChildren: true }` and rejects all other shapes.
      * `[ ]`   `prepareModelJob` queries `ai_providers` for `is_default_embedding = true` before building `affordParams` and extracts `id` as `embeddingModelProviderId`.
      * `[ ]`   `prepareModelJob` returns a retriable error if the `ai_providers` query returns a DB error.
      * `[ ]`   `prepareModelJob` returns a non-retriable error with message including `'No default embedding provider'` if the query returns no row or `id` is not a string.
      * `[ ]`   `deps.calculateAffordability` is called with `affordParams` that includes `projectId`, `iteration`, `embeddingModelProviderId`, and `parentJob` matching the values from `job.payload`, `job` itself, and the resolved embedding provider row.
      * `[ ]`   `prepareModelJob` returns `{ waitingForChildren: true }` (a valid `PrepareModelJobSuccessReturn`) when `deps.calculateAffordability` returns `CalculateAffordabilityPendingReturn`; it does not treat this as an error.
      * `[ ]`   `PrepareModelJobPendingReturn` and `isPrepareModelJobPendingReturn` are exported from `prepareModelJob.provides.ts` for consumption by `processSimpleJob.ts`.
      * `[ ]`   All previously passing tests in `prepareModelJob.test.ts`, `prepareModelJob.inputsRequired.test.ts`, and `prepareModelJob.integration.test.ts` remain GREEN after mock client is updated to return embedding provider data.
      * `[ ]`   Node scope is limited to the ten files in `prepareModelJob/`; `processSimpleJob.ts` handling of `PrepareModelJobPendingReturn` is the next node.

* `[ ]`   supabase/functions/dialectic-worker/processSimpleJob.ts **[BE] Supply stageSlug in gatherArtifacts call params, handle PrepareModelJobPendingReturn silently, and update integration test gatherArtifacts closures to satisfy updated GatherArtifactsDeps**

   * `[ ]`   `objective`
      * `[ ]`   Solve two call-site gaps left open by the prior two Workstream D nodes: (1) `GatherArtifactsParams` now requires `stageSlug: string` (gatherArtifacts node), but the `ctx.gatherArtifacts(...)` call in `processSimpleJob.ts` at line ~304 passes `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count }` without `stageSlug`, which fails type-checking; (2) `PrepareModelJobSuccessReturn` now includes `PrepareModelJobPendingReturn` (prepareModelJob node), so a `{ waitingForChildren: true }` return from `ctx.prepareModelJob` would pass `isPrepareModelJobSuccessReturn` and reach the `execute_completed` notification incorrectly — it must be intercepted and silently returned before that notification fires.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `stageSlug` to the params object in the `ctx.gatherArtifacts(...)` call so it reads `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count, stageSlug }`.
         * `[ ]`   Add import of `isPrepareModelJobPendingReturn` from `'./prepareModelJob/prepareModelJob.guard.ts'` alongside the existing `isPrepareModelJobErrorReturn` and `isPrepareModelJobSuccessReturn` imports.
         * `[ ]`   After the existing `if (isPrepareModelJobErrorReturn(prepareResult)) { ... }` block and before the `if (!isPrepareModelJobSuccessReturn(prepareResult)) { ... }` check, add: `if (isPrepareModelJobPendingReturn(prepareResult)) { ctx.logger.info('[processSimpleJob] Job paused waiting for EMBED children', { jobId }); return; }`.
         * `[ ]`   In `processSimpleJob.integration.test.ts`, update both `boundGather` closures that construct `GatherArtifactsDeps` literals to add `applyCompressionOverlay` set to the real imported `applyCompressionOverlay` function.
         * `[ ]`   Add a unit test in `processSimpleJob.test.ts` asserting `stageSlug` is forwarded in the `gatherArtifacts` call.
         * `[ ]`   Add a unit test in `processSimpleJob.test.ts` asserting that a `{ waitingForChildren: true }` return from `ctx.prepareModelJob` causes silent return without emitting `execute_completed` and without throwing.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `stageSlug` is already destructured from `job.payload` at the top of the `processSimpleJob` try block (`const { stageSlug, projectId, model_id, sessionId } = job.payload`); no new variable declaration is required.
         * `[ ]`   No changes to `processSimpleJob.ts` beyond the `stageSlug` addition to the params object literal, the new import, and the pending return dispatch block.
         * `[ ]`   All existing assertions in `processSimpleJob.test.ts` and `processSimpleJob.integration.test.ts` remain unchanged.
         * `[ ]`   No changes to `gatherArtifacts/` module files, `prepareModelJob/` module files, or any other source file.
      * `[ ]`   Each goal is atomic and testable through the updated unit tests and integration tests in this node.

   * `[ ]`   `role`
      * `[ ]`   Node role is call-site update — satisfies the updated `GatherArtifactsParams` contract (gatherArtifacts node) and the updated `PrepareModelJobReturn` signal contract (prepareModelJob node).
      * `[ ]`   This role is correct because `processSimpleJob.ts` owns the only `ctx.gatherArtifacts` call in the simple-job execution path and is the direct consumer of both `BoundGatherArtifactsFn` and `BoundPrepareModelJobFn`.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify the `gatherArtifacts` interface, guard, mock, or implementation in this node.
         * `[ ]`   Do not modify the `prepareModelJob` interface, guard, mock, or implementation in this node.
         * `[ ]`   Do not update `index.ts` DI wiring in this node; that is the next node.
         * `[ ]`   Do not modify any other logic in `processSimpleJob.ts` beyond the three additions stated in the objective.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/processSimpleJob.ts`, `processSimpleJob.test.ts`, and `processSimpleJob.integration.test.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   The `ctx.gatherArtifacts(...)` params literal in `processSimpleJob.ts`.
         * `[ ]`   The `isPrepareModelJobPendingReturn` import and dispatch block in `processSimpleJob.ts`.
         * `[ ]`   The `gatherArtifacts` stub call assertions in `processSimpleJob.test.ts`.
         * `[ ]`   The `prepareModelJob` pending path assertions in `processSimpleJob.test.ts`.
         * `[ ]`   The two `boundGather` deps objects in `processSimpleJob.integration.test.ts`.
      * `[ ]`   Outside boundary:
         * `[ ]`   `gatherArtifacts/` module — the interface change was made in the prior node; this node only satisfies it.
         * `[ ]`   `prepareModelJob/` module — the interface change was made in the prior node; this node only satisfies it.
         * `[ ]`   `index.ts` DI wiring — separate node.
         * `[ ]`   `applyCompressionOverlay/` module — the real function is imported into the integration test only; its internal deps are supplied by `gatherArtifacts` at call time.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./gatherArtifacts/gatherArtifacts.provides.ts` — already imported; no new symbols required.
         * `[ ]`   Layer classification: dialectic-worker peer utility producer.
         * `[ ]`   Direction: inbound; already imported and bound on `ctx`.
         * `[ ]`   Purpose: `BoundGatherArtifactsFn` type; `isGatherArtifactsErrorReturn` guard.
      * `[ ]`   Provider: `./prepareModelJob/prepareModelJob.guard.ts` — `isPrepareModelJobPendingReturn`.
         * `[ ]`   Layer classification: dialectic-worker peer utility producer.
         * `[ ]`   Direction: inbound; added alongside existing `isPrepareModelJobErrorReturn` and `isPrepareModelJobSuccessReturn` imports from the same module.
         * `[ ]`   Purpose: detect the `{ waitingForChildren: true }` success sub-type returned by `ctx.prepareModelJob` so it can be silently consumed before the `execute_completed` notification fires.
      * `[ ]`   Provider: `./applyCompressionOverlay/applyCompressionOverlay.ts` — `applyCompressionOverlay` (real function).
         * `[ ]`   Layer classification: dialectic-worker peer utility producer.
         * `[ ]`   Direction: consumed by `processSimpleJob.integration.test.ts` only; not imported by `processSimpleJob.ts` itself.
         * `[ ]`   Purpose: supply the real `applyCompressionOverlay` function so integration tests exercise the assembled `applyCompressionOverlay → gatherArtifacts → processSimpleJob` chain. The mock DB returns rows with `resource_description: null`, causing `isRagContextSummaryResourceDescription` to reject all rows and the overlay to pass artifacts through unchanged; the real function produces the correct no-op result.
      * `[ ]`   Confirm:
         * `[ ]`   No new imports in `processSimpleJob.ts` beyond `isPrepareModelJobPendingReturn`.
         * `[ ]`   No reverse dependency cycles introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   The only changes in `processSimpleJob.ts` are:
         * `[ ]`   At the existing imports block: add `isPrepareModelJobPendingReturn` alongside `isPrepareModelJobErrorReturn` and `isPrepareModelJobSuccessReturn` from `'./prepareModelJob/prepareModelJob.guard.ts'`.
         * `[ ]`   At the `ctx.gatherArtifacts` call site (~line 304): before was `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count }`, after is `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count, stageSlug }`.
         * `[ ]`   After the `if (isPrepareModelJobErrorReturn(prepareResult)) { ... }` block: insert `if (isPrepareModelJobPendingReturn(prepareResult)) { ctx.logger.info('[processSimpleJob] Job paused waiting for EMBED children', { jobId }); return; }`.
      * `[ ]`   `stageSlug` is already destructured from `job.payload` at line ~43: `const { stageSlug, projectId, model_id, sessionId } = job.payload`; no additional declaration is needed.
      * `[ ]`   `isPrepareModelJobPendingReturn` minimal interface: `(v: unknown): v is PrepareModelJobPendingReturn` — accepts only `{ waitingForChildren: true }`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; no new DB queries.
         * `[ ]`   No hidden coupling to any new modules.

   * `[ ]`   `supabase/functions/dialectic-worker/processSimpleJob.test.ts`
      * `[ ]`   Existing tests: all pass without modification — they stub `ctx.gatherArtifacts` entirely and do not inspect the params object structure.
      * `[ ]`   Add test `"processSimpleJob — gatherArtifacts params include stageSlug from job payload"`:
         * `[ ]`   Construct `rootCtx` with `mockDeps()`.
         * `[ ]`   Stub `rootCtx.gatherArtifacts` with a spy that returns `{ artifacts: [] }`.
         * `[ ]`   Call `processSimpleJob(dbClient, mockJob({ payload: mockPayload }), 'user-789', rootCtx, 'auth-token')`.
         * `[ ]`   Assert `gatherStub.calls.length === 1`.
         * `[ ]`   Assert `gatherStub.calls[0].args[0].stageSlug === mockPayload.stageSlug` — the stub receives the params object as its first argument; verify it includes `stageSlug` equal to the job payload's stage slug.
      * `[ ]`   Add test `"processSimpleJob — prepareModelJob pending return logs and returns without execute_completed notification"`:
         * `[ ]`   Construct `rootCtx` with `mockDeps()`.
         * `[ ]`   Stub `rootCtx.gatherArtifacts` to return `{ artifacts: [] }`.
         * `[ ]`   Stub `rootCtx.prepareModelJob` to return `{ waitingForChildren: true as const }`.
         * `[ ]`   Spy on `rootCtx.notificationService.sendJobNotificationEvent`.
         * `[ ]`   Call `await processSimpleJob(dbClient, mockJob({ payload: mockPayload }), 'user-789', rootCtx, 'auth-token')`.
         * `[ ]`   Assert the function resolves without throwing.
         * `[ ]`   Assert `sendJobNotificationEvent` was NOT called with `type: 'execute_completed'`.
         * `[ ]`   Assert `ctx.logger.info` was called with a message containing `'Job paused waiting for EMBED children'`.

   * `[ ]`   `supabase/functions/dialectic-worker/processSimpleJob.ts`
      * `[ ]`   Add `isPrepareModelJobPendingReturn` to the existing import from `'./prepareModelJob/prepareModelJob.guard.ts'` alongside `isPrepareModelJobErrorReturn` and `isPrepareModelJobSuccessReturn`.
      * `[ ]`   Locate the `ctx.gatherArtifacts(...)` call (~line 304). The current params object is: `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count }`. Add `stageSlug` so the params object reads: `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count, stageSlug }`.
      * `[ ]`   Locate the `if (isPrepareModelJobErrorReturn(prepareResult)) { ... throw new PrepareModelJobExecutionError(...) }` block. Immediately after this block, before the `if (!isPrepareModelJobSuccessReturn(prepareResult)) { ... }` check, insert:
         ```typescript
         if (isPrepareModelJobPendingReturn(prepareResult)) {
             ctx.logger.info('[processSimpleJob] Job paused waiting for EMBED children', { jobId });
             return;
         }
         ```
      * `[ ]`   All other lines in `processSimpleJob.ts` are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/processSimpleJob.integration.test.ts`
      * `[ ]`   Add import: `applyCompressionOverlay` from `'./applyCompressionOverlay/applyCompressionOverlay.ts'`.
      * `[ ]`   Locate the first `boundGather` closure (~line 246) that constructs a `GatherArtifactsDeps` literal with `{ logger: baseParams.logger, pickLatest: baseParams.pickLatest, downloadFromStorage: baseParams.downloadFromStorage }`. Add `applyCompressionOverlay` (the real function) to this object.
      * `[ ]`   Locate the second `boundGather` closure (~line 1049) that constructs a `GatherArtifactsDeps` literal with `{ logger, pickLatest, downloadFromStorage }`. Add `applyCompressionOverlay` (the real function) to this object.
      * `[ ]`   All existing test assertions in `processSimpleJob.integration.test.ts` remain unchanged; the real `applyCompressionOverlay` is a no-op pass-through here because the mock DB returns rows without `RagContextSummary` resource descriptions.

   * `[ ]`   `construction`
      * `[ ]`   No new construction patterns — `stageSlug` is a value already in scope at the call site; `isPrepareModelJobPendingReturn` is a stateless pure guard.
      * `[ ]`   No partial construction path is introduced.

   * `[ ]`   `directionality`
      * `[ ]`   `processSimpleJob.ts` layer position is unchanged — it remains a job-execution orchestrator that delegates to `ctx.gatherArtifacts` and `ctx.prepareModelJob`.
      * `[ ]`   `isPrepareModelJobPendingReturn` flows inward from `prepareModelJob.guard.ts` (peer module); no reverse dependency is introduced.
      * `[ ]`   The addition of `applyCompressionOverlay` import in the integration test file does not introduce a production-code coupling; test files may import from any sibling module.
      * `[ ]`   No new cycles introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `processSimpleJob.ts` compiles without type error after `GatherArtifactsParams.stageSlug` is required.
      * `[ ]`   The `stageSlug` unit test asserts `gatherStub.calls[0].args[0].stageSlug === mockPayload.stageSlug`, proving `stageSlug` is forwarded from job payload to the `gatherArtifacts` call.
      * `[ ]`   `processSimpleJob.ts` imports and invokes `isPrepareModelJobPendingReturn` on the result of `ctx.prepareModelJob`; when it returns `true`, the function logs `'[processSimpleJob] Job paused waiting for EMBED children'` and returns without throwing and without emitting an `execute_completed` notification.
      * `[ ]`   The pending path unit test asserts that `sendJobNotificationEvent` is NOT called with `type: 'execute_completed'` when `ctx.prepareModelJob` returns `{ waitingForChildren: true }`, and that the function resolves without throwing.
      * `[ ]`   Both `boundGather` closures in `processSimpleJob.integration.test.ts` satisfy the updated `GatherArtifactsDeps` shape using the real `applyCompressionOverlay` implementation; all existing integration test assertions remain GREEN.
      * `[ ]`   Integration tests in `processSimpleJob.integration.test.ts` exercise the full `applyCompressionOverlay → gatherArtifacts → processSimpleJob` chain with real implementations of all three functions; the real overlay runs against mock DB rows that produce a no-op pass-through.
      * `[ ]`   Node scope is limited to `processSimpleJob.ts`, `processSimpleJob.test.ts`, and `processSimpleJob.integration.test.ts`; no other source file is modified in this node.

* `[ ]`   supabase/functions/dialectic-worker/index.ts **[BE] Wire createEmbedJobs, applyCompressionOverlay, and updated compressPrompt DI closures into the worker composition root to complete the WS-D compression artifact persistence chain**

   * `[ ]`   `objective`
      * `[ ]`   Solve four DI closure gaps that remain after the prior WS-D nodes update their interfaces:
         * `[ ]`   `boundCompressPrompt` passes `ragService` and `embeddingClient` which `CompressPromptDeps` no longer contains (removed by the prior `compressPrompt.ts` WS-D node); and it omits `createEmbedJobs` and `fileManager` which `CompressPromptDeps` now requires.
         * `[ ]`   `boundCreateEmbedJobs` does not exist yet; the prior `compressPrompt.ts` WS-D node requires it as `CompressPromptDeps.createEmbedJobs: BoundCreateEmbedJobsFn` but no caller constructs the bound closure.
         * `[ ]`   `boundApplyCompressionOverlay` does not exist yet; the prior `gatherArtifacts.ts` WS-D node requires it as `GatherArtifactsDeps.applyCompressionOverlay: ApplyCompressionOverlayFn` but no caller constructs the bound closure.
         * `[ ]`   `boundGatherArtifacts` passes `{ logger, pickLatest, downloadFromStorage }` but `GatherArtifactsDeps` now also requires `applyCompressionOverlay`.
      * `[ ]`   Functional goals:
         * `[ ]`   Add two new imports: `createEmbedJobs` and `BoundCreateEmbedJobsFn` from `./createEmbedJobs/createEmbedJobs.provides.ts`; `applyCompressionOverlay` and `BoundApplyCompressionOverlayFn` from `./applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
         * `[ ]`   Construct `boundCreateEmbedJobs: BoundCreateEmbedJobsFn` in `createDialecticWorkerDeps` after `documentRenderer` and before `boundGatherArtifacts`: `const boundCreateEmbedJobs: BoundCreateEmbedJobsFn = (params) => createEmbedJobs({ logger, textSplitter }, params)`.
         * `[ ]`   Construct `boundApplyCompressionOverlay: BoundApplyCompressionOverlayFn` in `createDialecticWorkerDeps` immediately after `boundCreateEmbedJobs`: `const boundApplyCompressionOverlay: BoundApplyCompressionOverlayFn = (params, payload) => applyCompressionOverlay({ logger, downloadFromStorage }, params, payload)`.
         * `[ ]`   Update `boundGatherArtifacts` closure to include `applyCompressionOverlay: boundApplyCompressionOverlay` so the call reads: `gatherArtifacts({ logger, pickLatest, downloadFromStorage, applyCompressionOverlay: boundApplyCompressionOverlay }, params, payload)`.
         * `[ ]`   Update `boundCompressPrompt` closure inside the `prepareModelJob` factory lambda: remove `ragService` and `embeddingClient`; add `createEmbedJobs: boundCreateEmbedJobs` and `fileManager`, so the call reads: `compressPrompt({ logger, createEmbedJobs: boundCreateEmbedJobs, fileManager, tokenWalletService: adminTokenWalletService, countTokens }, cpParams, cpPayload)`.
         * `[ ]`   Update `index.test.ts`, `index.integration.test.ts`, and `index.nsf-pause.integration.test.ts` to add an `ai_providers.select('id').eq('is_default_embedding', true).maybeSingle()` mock returning `{ data: { id: 'emb-provider-1' }, error: null }` to every `createMockSupabaseClient` invocation whose mock results are consumed by the `createDialecticWorkerDeps` or `prepareModelJob` code paths, so that the embedding provider query added by the prior `prepareModelJob.ts` WS-D node does not throw in existing test scenarios.
         * `[ ]`   Keep all other lines in `createDialecticWorkerDeps` unchanged: outer `ai_providers` query for `modelProvider`, env reads, `fileManager`, `embeddingAdapter`, `EmbeddingClient`, `LangchainTextSplitter`, `IndexingService`, `RagService`, `PromptAssembler`, `documentRenderer`, queue env reads, `computeJobSig`, `apiKeyForProvider`, `boundEnqueueModelCall`, `createJobContext` call with all existing fields.
         * `[ ]`   Keep the `serve()` HTTP handler body unchanged.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `boundCompressPrompt` type remains `BoundCompressPromptFn`; the updated deps object must satisfy `CompressPromptDeps` without any cast or type assertion.
         * `[ ]`   `boundGatherArtifacts` type remains `BoundGatherArtifactsFn`; the updated deps object must satisfy `GatherArtifactsDeps` without any cast or type assertion.
         * `[ ]`   `boundCreateEmbedJobs` satisfies `BoundCreateEmbedJobsFn` from `createEmbedJobs.interface.ts`; the `textSplitter` variable is already declared in `createDialecticWorkerDeps` scope and requires no redeclaration.
         * `[ ]`   No changes to `compressPrompt.ts`, `gatherArtifacts.ts`, `calculateAffordability.ts`, `prepareModelJob.ts`, `applyCompressionOverlay.ts`, `createEmbedJobs.ts`, `file_manager.ts`, or any file outside the four root index files listed in this node.
      * `[ ]`   Each goal is atomic and testable through the unit and integration test updates in this node.

   * `[ ]`   `role`
      * `[ ]`   Node role is DI factory entrypoint update (`createDialecticWorkerDeps`) plus the three immediate test files that prove the wiring is correct.
      * `[ ]`   This role is correct because `index.ts` owns `createDialecticWorkerDeps`, which is the only file that constructs `boundCompressPrompt`, `boundGatherArtifacts`, `boundCreateEmbedJobs`, and `boundApplyCompressionOverlay` and is therefore the canonical wiring site for the updated DI contracts from the prior WS-D nodes.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not change the `compressPrompt.ts` implementation or its `CompressPromptDeps` interface in this node.
         * `[ ]`   Do not change the `gatherArtifacts.ts` implementation or its `GatherArtifactsDeps` interface in this node.
         * `[ ]`   Do not change the `prepareModelJob.ts` embedding provider query or `affordParams` construction in this node.
         * `[ ]`   Do not change the `calculateAffordability.ts` compression params threading in this node.
         * `[ ]`   Do not change the `applyCompressionOverlay.ts` or `createEmbedJobs.ts` implementations in this node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/` root: `index.ts`, `index.test.ts`, `index.integration.test.ts`, and `index.nsf-pause.integration.test.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   DI factory construction in `createDialecticWorkerDeps`: `boundCreateEmbedJobs`, `boundApplyCompressionOverlay`, `boundGatherArtifacts`, `boundCompressPrompt` closures.
         * `[ ]`   HTTP serve handler: method gate, job payload parse, `adminClient` construction, `createDialecticWorkerDeps` invocation, and `processJob` dispatch.
      * `[ ]`   Outside boundary:
         * `[ ]`   Compression algorithm and three-phase state machine inside `compressPrompt.ts`.
         * `[ ]`   Overlay application logic inside `applyCompressionOverlay.ts`.
         * `[ ]`   Chunk + EMBED job creation logic inside `createEmbedJobs.ts`.
         * `[ ]`   Affordability calculation inside `calculateAffordability.ts`.
         * `[ ]`   Model job orchestration inside `prepareModelJob.ts`.
         * `[ ]`   Artifact gather logic inside `gatherArtifacts.ts`.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./createEmbedJobs/createEmbedJobs.provides.ts` (`createEmbedJobs`, `BoundCreateEmbedJobsFn`) — NEW import.
         * `[ ]`   Layer classification: dialectic-worker utility producer (WS-S).
         * `[ ]`   Direction: inbound; new import needed.
         * `[ ]`   Purpose: `createEmbedJobs` receives `{ logger, textSplitter }` deps to produce the bound `BoundCreateEmbedJobsFn` callable passed to `compressPrompt`.
      * `[ ]`   Provider: `./applyCompressionOverlay/applyCompressionOverlay.provides.ts` (`applyCompressionOverlay`, `BoundApplyCompressionOverlayFn`) — NEW import.
         * `[ ]`   Layer classification: dialectic-worker utility producer (WS-D prior node).
         * `[ ]`   Direction: inbound; new import needed.
         * `[ ]`   Purpose: `applyCompressionOverlay` receives `{ logger, downloadFromStorage }` deps to produce the bound `BoundApplyCompressionOverlayFn` callable passed to `gatherArtifacts`.
      * `[ ]`   Provider: `./compressPrompt/compressPrompt.provides.ts` (`compressPrompt`, `BoundCompressPromptFn`) — already imported.
         * `[ ]`   Layer classification: dialectic-worker utility producer.
         * `[ ]`   Direction: inbound; already imported.
         * `[ ]`   Purpose: `compressPrompt` receives the corrected deps closure (`createEmbedJobs`, `fileManager`) in place of `ragService` and `embeddingClient`.
      * `[ ]`   Provider: `./gatherArtifacts/gatherArtifacts.ts` (`gatherArtifacts`) and `./gatherArtifacts/gatherArtifacts.interface.ts` (`BoundGatherArtifactsFn`) — already imported.
         * `[ ]`   Layer classification: dialectic-worker utility producer.
         * `[ ]`   Direction: inbound; already imported.
         * `[ ]`   Purpose: `gatherArtifacts` now requires `applyCompressionOverlay` in its deps; `boundGatherArtifacts` closure is updated accordingly.
      * `[ ]`   Provider: `../_shared/services/file_manager.ts` (`FileManagerService`) — already imported and instantiated as `fileManager`.
         * `[ ]`   Layer classification: shared infrastructure service producer.
         * `[ ]`   Direction: inbound; already in scope.
         * `[ ]`   Purpose: `fileManager` satisfies `IFileManager` in the updated `CompressPromptDeps`.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependencies introduced.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   From `createEmbedJobs`: only `createEmbedJobs(deps, params)` function and `BoundCreateEmbedJobsFn` type; no additional surface.
      * `[ ]`   From `applyCompressionOverlay`: only `applyCompressionOverlay(deps, params, payload)` function and `BoundApplyCompressionOverlayFn` type; no additional surface.
      * `[ ]`   `fileManager` is already in scope at the point where `boundCompressPrompt` is constructed inside the `prepareModelJob` factory lambda; only the deps object literal changes.
      * `[ ]`   `textSplitter` is already declared as `const textSplitter = new LangchainTextSplitter()` in `createDialecticWorkerDeps` scope before `boundCreateEmbedJobs` is constructed.
      * `[ ]`   `downloadFromStorage` is already imported from `../_shared/supabase_storage_utils.ts`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated service surfaces.
         * `[ ]`   No hidden coupling to Netlify worker payloads or callback handler state.

   * `[ ]`   `supabase/functions/dialectic-worker/index.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` invocation whose mock results flow through `createDialecticWorkerDeps` or the `prepareModelJob` lambda to add an `ai_providers.select('id').eq('is_default_embedding', true).maybeSingle()` mock returning `{ data: { id: 'emb-provider-1' }, error: null }` so the embedding provider ID query added by the prior `prepareModelJob.ts` WS-D node resolves without error in all existing test scenarios.
      * `[ ]`   Add unit test `createDialecticWorkerDeps: wires boundCreateEmbedJobs — typeof ctx.enqueueModelCall is function and createEmbedJobs was imported`:
         * `[ ]`   Construct a minimal `mockAdminClient` with `ai_providers.select('*').eq('is_default_embedding', true).single()` returning the mock full embedding provider row and `ai_providers.select('id').eq('is_default_embedding', true).maybeSingle()` returning `{ data: { id: 'emb-provider-1' }, error: null }`.
         * `[ ]`   Set `Deno.env` values for `OPENAI_API_KEY`, `HMAC_SECRET`, `NETLIFY_QUEUE_URL`, `AWL_API_KEY` to non-empty test strings before the call.
         * `[ ]`   Call `const ctx = await createDialecticWorkerDeps(mockAdminClient)`.
         * `[ ]`   Assert `typeof ctx.prepareModelJob === 'function'`.
         * `[ ]`   Assert `ctx.fileManager instanceof FileManagerService`.
         * `[ ]`   Assert `typeof ctx.gatherArtifacts === 'function'`.
      * `[ ]`   Do NOT re-test existing `createDialecticWorkerDeps` dep wiring that was not changed by this node; do NOT test `createEmbedJobs`, `applyCompressionOverlay`, or `compressPrompt` internal behavior.

   * `[ ]`   `supabase/functions/dialectic-worker/index.ts`
      * `[ ]`   After the existing `import { processRenderJob } from './processRenderJob.ts'` line, add:
         * `[ ]`   `import { createEmbedJobs } from './createEmbedJobs/createEmbedJobs.provides.ts';`
         * `[ ]`   `import type { BoundCreateEmbedJobsFn } from './createEmbedJobs/createEmbedJobs.provides.ts';`
         * `[ ]`   `import { applyCompressionOverlay } from './applyCompressionOverlay/applyCompressionOverlay.provides.ts';`
         * `[ ]`   `import type { BoundApplyCompressionOverlayFn } from './applyCompressionOverlay/applyCompressionOverlay.provides.ts';`
      * `[ ]`   In `createDialecticWorkerDeps`, after `const documentRenderer = { renderDocument };` and before the existing `const boundGatherArtifacts` line, add:
         * `[ ]`   `const boundCreateEmbedJobs: BoundCreateEmbedJobsFn = (params) => createEmbedJobs({ logger, textSplitter }, params);`
         * `[ ]`   `const boundApplyCompressionOverlay: BoundApplyCompressionOverlayFn = (params, payload) => applyCompressionOverlay({ logger, downloadFromStorage }, params, payload);`
      * `[ ]`   Update the existing `boundGatherArtifacts` const to add `applyCompressionOverlay: boundApplyCompressionOverlay` to the deps object, so the line reads: `const boundGatherArtifacts: BoundGatherArtifactsFn = (params, payload) => gatherArtifacts({ logger, pickLatest, downloadFromStorage, applyCompressionOverlay: boundApplyCompressionOverlay }, params, payload);`
      * `[ ]`   Locate the `boundCompressPrompt` closure inside the `prepareModelJob` factory lambda. The closure currently reads: `compressPrompt({ logger, ragService, embeddingClient, tokenWalletService: adminTokenWalletService, countTokens }, cpParams, cpPayload)`. Replace the deps object so it reads: `compressPrompt({ logger, createEmbedJobs: boundCreateEmbedJobs, fileManager, tokenWalletService: adminTokenWalletService, countTokens }, cpParams, cpPayload)`.
      * `[ ]`   Keep all other lines in `createDialecticWorkerDeps` unchanged.
      * `[ ]`   Keep the `serve()` HTTP handler body unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/index.integration.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call in this file to add an `ai_providers.select('id').eq('is_default_embedding', true).maybeSingle()` mock returning `{ data: { id: 'emb-provider-1' }, error: null }` so all existing integration scenarios resolve the embedding provider ID without error.
      * `[ ]`   Add integration test `createDialecticWorkerDeps + prepareModelJob: fileManager.uploadAndRegisterFile is reachable through the wired DI closure when compression is triggered`:
         * `[ ]`   Construct `mockAdminClient` with `ai_providers.select('*').eq('is_default_embedding', true).single()` returning the full embedding provider row; `ai_providers.select('id')...maybeSingle()` returning `{ data: { id: 'emb-provider-1' }, error: null }`; a model config row where `config` encodes `contextWindowTokens: 100`; `token_wallets` returning `{ balance: 10000 }`; `user_subscriptions` returning a tier mock with `output_cap_tokens: null`.
         * `[ ]`   Call `const ctx = await createDialecticWorkerDeps(mockAdminClient)`.
         * `[ ]`   Add spy: `const uploadSpy = vi.spyOn(ctx.fileManager, 'uploadAndRegisterFile').mockResolvedValue({ success: true, ragResourceId: 'integration-rag-1', filePath: 'tenant/project/iter/model/context.json', fileSize: 200 })`.
         * `[ ]`   Build `mockUserDbClient` (mock Supabase client with same `ai_providers` and wallet mocks) for `params.dbClient` in the `prepareModelJob` call.
         * `[ ]`   Build `mockParams` with `dbClient: mockUserDbClient` and a `dialectic_generation_jobs` row with `iterationNumber: 2`.
         * `[ ]`   Build `mockPayload` as a `DialecticExecuteJobPayload` with `userPrompt` set to a 200-token string (exceeding the 100-token mock `contextWindowTokens`) so `calculateAffordability` routes to `compressPrompt`.
         * `[ ]`   Call `await ctx.prepareModelJob(mockParams, mockPayload)`.
         * `[ ]`   Assert `uploadSpy.mock.calls.length >= 1`, proving `fileManager.uploadAndRegisterFile` is reachable through the complete DI chain wired in `createDialecticWorkerDeps`.

   * `[ ]`   `supabase/functions/dialectic-worker/index.nsf-pause.integration.test.ts`
      * `[ ]`   Update every `createMockSupabaseClient` call in this file to add the `ai_providers.select('id').eq('is_default_embedding', true).maybeSingle()` mock returning `{ data: { id: 'emb-provider-1' }, error: null }` so all existing NSF-pause integration scenarios pass without change to their assertions.

   * `[ ]`   `construction`
      * `[ ]`   `createDialecticWorkerDeps` remains an async factory function `(adminClient: SupabaseClient<Database>) => Promise<IJobContext>` with no global state.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   Updated construction order within `createDialecticWorkerDeps`: `NotificationService` → outer `ai_providers` query for embedding model → `OPENAI_API_KEY` env read → `fileManager` → `embeddingAdapter` → `EmbeddingClient` → `LangchainTextSplitter` (`textSplitter`) → `AdminTokenWalletService` → `UserTokenWalletService` → `IndexingService` → `RagService` → `PromptAssembler` → `documentRenderer` → **`boundCreateEmbedJobs`** (NEW) → **`boundApplyCompressionOverlay`** (NEW) → **`boundGatherArtifacts`** (updated) → queue env reads → `computeJobSig` → `apiKeyForProvider` → `boundEnqueueModelCall` → `createJobContext` with the updated `prepareModelJob` factory lambda whose inner `boundCompressPrompt` now supplies `createEmbedJobs: boundCreateEmbedJobs` and `fileManager`.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is DI entrypoint / composition root.
      * `[ ]`   `createEmbedJobs` and `applyCompressionOverlay` flow inward (worker sub-modules) and are bound into closures passed deeper into the dep graph via `boundCompressPrompt` and `boundGatherArtifacts` respectively.
      * `[ ]`   No new dependency cycles introduced; `index.ts` is a terminal node with no consumers in this codebase.

   * `[ ]`   `requirements`
      * `[ ]`   After this node, `boundCompressPrompt` in `createDialecticWorkerDeps` satisfies the updated `CompressPromptDeps` contract — `createEmbedJobs: BoundCreateEmbedJobsFn` and `fileManager: IFileManager` present; `ragService` and `embeddingClient` absent — without any type cast or assertion.
      * `[ ]`   `boundGatherArtifacts` satisfies the updated `GatherArtifactsDeps` contract — `applyCompressionOverlay: ApplyCompressionOverlayFn` present — without any type cast or assertion.
      * `[ ]`   `index.ts` compiles without type errors after the prior `compressPrompt.ts`, `gatherArtifacts.ts`, `applyCompressionOverlay.ts`, and `createEmbedJobs.ts` WS-D and WS-S nodes have updated their respective interfaces.

   * `[ ]`   **Commit** `feat(dialectic-worker): WS-D — compression artifact persistence chain wired end-to-end`
      * `[ ]`   Structural: `boundCreateEmbedJobs` and `boundApplyCompressionOverlay` closures added; `boundGatherArtifacts` and `boundCompressPrompt` closures updated.
      * `[ ]`   Behavioral: oversized inputs now route through async EMBED job creation (via `compressPrompt` → `createEmbedJobs`) and retrieved compression artifacts are swapped into gathered docs (via `gatherArtifacts` → `applyCompressionOverlay`) before the model call is prepared.
      * `[ ]`   Contract: `CompressPromptDeps` and `GatherArtifactsDeps` interfaces are satisfied at the composition root without type errors.

# To-Do List

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