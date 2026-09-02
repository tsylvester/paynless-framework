[ ] // So that find->replace will stop unrolling my damned instructions! 

# **Compression Jobs**

## Problem Statement

When an assembled model call exceeds the model's input window, the pipeline enters the legacy RAG compression loop (`compressPrompt` → `RagService` → `IndexingService` → `dialectic_memory`) and document generation fails. The RAG path is structurally unfit for this pipeline: it embeds synchronously inside Supabase (a universal block with no provenance or attribution), it retrieves session-wide with generic stage-template queries so every victim document is replaced by nearly the same snippet blob, and its output destroys the document structure downstream agents need to populate their JSON skeletons. The application generates quality documents end-to-end whenever compression does not run, and fails whenever it does.

## Objectives

* Replace RAG compression with first-class, job-driven, schema-targeted COMPRESS jobs that ride the existing stream model-call transport, per `Compression Jobs Scope.md` (same folder — the ratified scope & order this workplan implements; its CANONICAL CONTRACTS section governs every function shape in this plan).
* Make victim selection pure computation — `effectiveScore = candidateTokens × importance` (importance from `inputsRelevance` for documents, from positional `valueScore` for history) — with no embeddings anywhere; one victim per resume cycle, stopping as soon as the preflight fits.
* Persist compressed output as `CompressedContext` resource artifacts keyed by (session, consuming stage, target schema key, source identity), named `{source_basename}_compressed_for_{target_key}.md` in the consuming stage's `_work` directory; verify JSON-mode output against the source it was sent, missing keys returning through the ordinary continuation path rather than failing; accept text-mode output as valid as-is, freeform text carrying no structure to verify against, with the finish-reason continuation gate still applying so an unfinished text compression resumes rather than persisting truncated; render through the source document's original template; overlay on resume; reuse across sibling agents via three-layer opportunistic dedup.
* Remove the RAG core entirely: `rag_service`, `indexing_service`, `dialectic_memory`, `match_dialectic_chunks`, and every `embeddingClient` call site.

## Expected Outcome

Oversized model inputs compress incrementally until the preflight fits: the parent job pauses via `waiting_for_children`, COMPRESS children run on the production stream path with the parent's own model, artifacts persist with full provenance and real wallet attribution, sibling jobs producing the same target reuse artifacts without recompressing, and the overlay swaps compressed content invisibly to the orchestrator. No synchronous model calls remain in Supabase; no RAG code or schema remains in the repo; a full-chain integration test proves the loop end to end.

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 
* `docs/implementations/Current/Checklists/Current/Compression Jobs Scope.md` — the ratified scope-and-order plan this workplan is built from. Canonical contracts, the commit map, design decisions, and the forbidden-token sweep live there.

# Work Breakdown Structure

## Compression Cutover

* `[✅]`   supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.ts **[REFACTOR] Correct the three-slot contract: move `parentJob` and `modelConfig` from params to payload, build `tokenizerDeps` locally from real tokenizer imports, delete every scalar that duplicates a field on `parentJob`**

   * `[✅]`   `objective`
      * `[✅]`   Solve a params object that carries thirteen members, twelve of which violate composition rules: two data objects (`parentJob: DialecticJobRow`, `modelConfig: AiModelExtendedConfig`) and one deps-type object (`tokenizerDeps: CountTokensDeps`) stuffed into params, and nine scalars (`sessionId`, `projectId`, `stageSlug`, `output_type`, `iterationNumber`, `modelId`, `modelSlug`, `userJwt`, `walletId`) that duplicate fields already available on `parentJob` or `parentJob.payload`.
      * `[✅]`   Functional goals:
         * `[✅]`   `enqueueCompressJobsParams` declares `dbClient` only.
         * `[✅]`   `enqueueCompressJobsPayload` declares `victim` (unchanged), `parentJob` (`DialecticJobRow`) and `modelConfig` (`AiModelExtendedConfig`).
         * `[✅]`   `enqueueCompressJobsDeps` is unchanged: `logger`, `textSplitter`, `countTokens`, `constructStoragePath`.
         * `[✅]`   The implementation builds its own `tokenizerDeps` literal from the real tokenizer imports (`getEncoding` via `rawGetEncoding` with `isKnownTiktokenEncoding` narrowing, `countTokensAnthropic`), the same pattern `calculateAffordability` uses.
         * `[✅]`   No scalar that duplicates a field on `parentJob`, `parentJob.payload` or `modelConfig` appears anywhere in the function's contract.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Every branch, validation, error message and `retriable` flag is unchanged in outcome. Only the read sites change.
         * `[✅]`   The return union, `DialecticCompressJobPayload`, error classes and function-type aliases are unchanged except that `enqueueCompressJobsFn` and `BoundenqueueCompressJobsFn` reference the corrected params and payload types.
         * `[✅]`   `compressPrompt.ts` is the only consumer that builds `enqueueCompressJobsParams` and `enqueueCompressJobsPayload`; it goes transiently non-compilable and is not edited here. It is a support file of the `compressPrompt` node following this one.

   * `[✅]`   `enqueueCompressJobs.interface.test.ts`
      * `[✅]`   A case proves the params surface exhaustively: `Record<keyof enqueueCompressJobsParams, true>` over `dbClient`, asserting one.
      * `[✅]`   A case proves the payload surface exhaustively over `victim`, `parentJob`, `modelConfig`, asserting three.
      * `[✅]`   The existing deps surface case (four members) and return-union cases are unchanged.

   * `[✅]`   `enqueueCompressJobs.interface.ts`
      * `[✅]`   `enqueueCompressJobsParams` drops `parentJob`, `sessionId`, `projectId`, `stageSlug`, `output_type`, `iterationNumber`, `modelId`, `modelSlug`, `userJwt`, `walletId`, `modelConfig` and `tokenizerDeps`, and the imports those members required (`DialecticJobRow`, `AiModelExtendedConfig`, `ModelContributionFileTypes`, `DialecticStageSlug`, `CountTokensDeps`). `dbClient` stays.
      * `[✅]`   `enqueueCompressJobsPayload` gains `parentJob: DialecticJobRow` and `modelConfig: AiModelExtendedConfig`; `victim` is unchanged. The `DialecticJobRow` and `AiModelExtendedConfig` imports move here from the params block.
      * `[✅]`   `enqueueCompressJobsDeps`, `DialecticCompressJobPayload`, error classes and return types are unchanged.

   * `[✅]`   `enqueueCompressJobs.interaction.spec`
      * `[✅]`   All branches are unchanged in condition, decision, dependency call and outcome. The only change is the read site for values the branches consume.
      * `[✅]`   Child-payload construction (camelCase fields): every value the function reads from a removed params scalar is now read from `payload.parentJob.payload` — `sessionId`, `projectId`, `walletId`, `user_jwt` from the base payload; `stageSlug`, `iterationNumber`, `model_slug`, `output_type` from the narrowed payload; `model_id` from the base payload.
      * `[✅]`   Insert-row construction (snake_case columns): `parent_job_id` from `payload.parentJob.id`, `session_id` from `payload.parentJob.session_id`, `stage_slug` from `payload.parentJob.stage_slug`, `iteration_number` from `payload.parentJob.iteration_number`, `user_id` from `payload.parentJob.user_id`, `is_test_job` from `payload.parentJob.is_test_job`.
      * `[✅]`   Path context and idempotency key: same values, same sources as the child-payload reads.
      * `[✅]`   Token sizing: `payload.modelConfig.provider_max_input_tokens` replaces `params.modelConfig.provider_max_input_tokens`; `deps.countTokens(tokenizerDeps, …, payload.modelConfig)` where `tokenizerDeps` is the module-level literal.

   * `[✅]`   `enqueueCompressJobs.mock.ts`
      * `[✅]`   `buildenqueueCompressJobsParams` returns `{ dbClient: DbClient(createMockSupabaseClient().client) }` only; overrides, corruption type and invalidator shrink to one key each.
      * `[✅]`   `buildenqueueCompressJobsPayload` gains `parentJob` defaulting to `buildDialecticJobRow()` and `modelConfig` defaulting to a valid `AiModelExtendedConfig` with `provider_max_input_tokens` set; `victim` defaults are unchanged.
      * `[✅]`   All other builders, invalidators and function mocks keep their current form.

   * `[✅]`   `enqueueCompressJobs.guard.test.ts`
      * `[✅]`   `isenqueueCompressJobsParams` case checklist over `dbClient` only, absent and wrong-typed; a case asserts params carrying none of the twelve removed members are accepted.
      * `[✅]`   `isenqueueCompressJobsPayload` case checklist gains `parentJob` and `modelConfig`, absent and wrong-typed each; `victim` cases are unchanged.

   * `[✅]`   `enqueueCompressJobs.guard.ts`
      * `[✅]`   `isenqueueCompressJobsParams` drops every check except `dbClient`.
      * `[✅]`   `isenqueueCompressJobsPayload` gains a `parentJob` check (delegating to the owning guard for `DialecticJobRow`) and a `modelConfig` check (delegating to `isAiModelExtendedConfig`).

   * `[✅]`   `enqueueCompressJobs.test.ts`
      * `[✅]`   Every test case builds params with `dbClient` only and payload with `victim`, `parentJob` and `modelConfig`. No test supplies a removed scalar as an independent value.
      * `[✅]`   Behavioral assertions are unchanged.

   * `[✅]`   `enqueueCompressJobs.ts`
      * `[✅]`   Module-level imports: `getEncoding as rawGetEncoding` from `npm:js-tiktoken@1.0.7`, `countTokens as countTokensAnthropic` from `npm:@anthropic-ai/tokenizer@0.0.4`, `isKnownTiktokenEncoding` from `_shared/utils/type-guards/type_guards.chat.ts`.
      * `[✅]`   Module-level `tokenizerDeps` literal: `{ getEncoding: (name) => { if (!isKnownTiktokenEncoding(name)) throw new Error(\`Unsupported tiktoken encoding: \${name}\`); return rawGetEncoding(name); }, countTokensAnthropic }`.
      * `[✅]`   Every `params.*` read for a removed member becomes the equivalent `payload.parentJob.*`, `payload.parentJob.payload.*` or `payload.modelConfig.*` read, per the interaction spec's mapping.
      * `[✅]`   The `CountTokensDeps` import is removed; `AiModelExtendedConfig` remains (still used by `tokenizerDeps` type and `payload.modelConfig`).

   * `[✅]`   `enqueueCompressJobs.integration.test.ts`
      * `[✅]`   Fixtures build the corrected params (one member) and payload (three members). Behavioral assertions are unchanged.

   * `[✅]`   `requirements`
      * `[✅]`   `enqueueCompressJobsParams` has exactly one member (`dbClient`) — interface test.
      * `[✅]`   `enqueueCompressJobsPayload` has exactly three members (`victim`, `parentJob`, `modelConfig`) — interface test.
      * `[✅]`   No scalar that duplicates a field on `parentJob` or `modelConfig` appears in params or payload — interface test exhaustive key records.
      * `[✅]`   Every existing unit test and integration test case passes with the same behavioral assertions — test suites.
      * `[✅]`   The implementation builds `tokenizerDeps` locally and does not receive it from the caller — no `tokenizerDeps` in the interface.

* `[✅]`   supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts **[BE] Full rewrite as an artifact-existence-driven machine: overlay on entry, reduce check for chunked victims, select and spawn ONE victim with a pending success, recount and return the working set when it fits; the scorer becomes a `CompressPromptDeps` collaborator and `compressionStrategy` leaves the payload; `ragService`, `embeddingClient`, the in-loop `tokenWalletService` debit and this file's `dialectic_memory` query are deleted with their guards, mock defaults and imports**

   * `[✅]`   `objective`
      * `[✅]`   Solve a function whose every iteration spawns a synchronous model call, queries a database table, debits a wallet and mutates a working set in a loop, when the architecture it now inhabits dispatches model calls as asynchronous jobs. `compressPrompt` today receives an over-budget working set from `calculateAffordability`, invokes `compressionStrategy` (which queries `dialectic_memory` for indexed IDs and delegates to `ragService.getContextForModel` for each victim), debits `tokenWalletService` per victim, mutates `resourceDocuments` and `chatApiRequest.messages` inline, enforces message alternation, recounts, and returns the rewritten set or a `ContextWindowError`. The RAG path embeds synchronously, retrieves session-wide, replaces document content with generic snippet blobs, and destroys the structure downstream agents need. The wallet debit belongs to the COMPRESS child that spends the tokens, not to the parent that selects the victim.
      * `[✅]`   Functional goals:
         * `[✅]`   `CompressPromptDeps` declares `logger`, `getSortedCompressionCandidates`, `enqueueCompressJobs`, `resolveCompressionSource`, `constructStoragePath`, `downloadFromStorage` and `countTokens`, and no `ragService`, `embeddingClient` or `tokenWalletService`.
         * `[✅]`   `CompressPromptParams` declares `dbClient`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression` and `walletBalance` — the five values no passed object carries: `dbClient` is a service handle, the other four are computed by `calculateAffordability`'s solver or read from the wallet, not derivable from any data object. Drops `jobId` (on `parentJob.id`), `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `walletId` (all on `parentJob` or `parentJob.payload`), `inputRate`, `outputRate` (on `extendedModelConfig`), `parentJob` (data object → payload), `extendedModelConfig` (data object → payload), `inputsRelevance` (data → payload), and `projectOwnerUserId` (on `parentJob.user_id`).
         * `[✅]`   `CompressPromptPayload` declares `parentJob` (`DialecticJobRow`), `extendedModelConfig` (`AiModelExtendedConfig`), `inputsRelevance` (`RelevanceRule[]`), `resourceDocuments`, `conversationHistory` and `currentUserPrompt`, and no `compressionStrategy`, `chatApiRequest` or `tokenizerDeps`. Data objects and the data they operate against ride in payload; `tokenizerDeps` is built by the implementation from the same tokenizer imports `calculateAffordability` uses.
         * `[✅]`   The return has exactly two arms. `CompressPromptSuccessReturn` is the union of `CompressPromptFitsReturn` (`fits: true`, `resourceDocuments`, `conversationHistory`, `resolvedInputTokenCount`) and `CompressPromptPendingReturn` (`fits: false`); `CompressPromptReturn` is `CompressPromptSuccessReturn | CompressPromptErrorReturn`. The fits arm carries the overlaid working set the caller assembles into a model call; the pending arm signals the parent is `waiting_for_children` and the caller does nothing further. `chatApiRequest` and `max_tokens_to_generate` leave the return because they are the caller's to build from the fits arm's `resolvedInputTokenCount`.
         * `[✅]`   The function performs no synchronous model call, no wallet debit, no `dialectic_memory` query and no inline content mutation on any path. It overlays, scores, selects, enqueues and returns.
         * `[✅]`   The victim object handed to `enqueueCompressJobs` carries the identity that addresses its canonical artifact, and that identity is read from `deps.resolveCompressionSource` for a document victim and from the message for a history victim. No `sourceType` literal appears anywhere in this module, and no member of the victim is defaulted.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Every consumer of the current `CompressPromptReturn` — `prepareModelJob.ts`, `prepareModelJob.test.ts`, `prepareModelJob.integration.test.ts`, `createJobContext.ts`, `createJobContext.test.ts`, `dialectic-worker/index.ts`, `processSimpleJob.ts` — goes transiently non-compilable and is not edited here. Each is a support file of the `prepareModelJob`, `createJobContext`, `processSimpleJob`, `processJob` or composition-root node later in this workstream.
         * `[✅]`   The `vector_utils` node preceding this one has already landed `getSortedCompressionCandidates` under a contract carrying no `embeddingClient`, no `dbClient` and no `currentUserPrompt`, typed as `GetSortedCompressionCandidatesFn` with the bound form `BoundGetSortedCompressionCandidatesFn`, both exported from `vector_utils.provides.ts`.
         * `[✅]`   The function keeps its `(deps, params, payload)` shape and its trusted-form payload; nothing here is guarded on entry.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer orchestration: given an over-budget working set, overlay existing compression artifacts, score candidates, select the lowest-scored victim, enqueue COMPRESS children for it, set the parent `waiting_for_children`, and return pending — or, if the overlay brought the set within budget, return the fits arm with the overlaid working set.
      * `[✅]`   The role is correct because the function coordinates deps that each own one responsibility — overlaying is a read, scoring is computation, enqueuing is a write — and the function itself owns only the select-one-victim decision and the fits-or-pending branch.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not call, import or type `ragService`, `embeddingClient`, `tokenWalletService`, `ICompressionStrategy` or `dialectic_memory` anywhere in this module.
         * `[✅]`   Do not build, return or type `chatApiRequest` or `max_tokens_to_generate`. The caller builds the model-call payload from the fits arm's working set.
         * `[✅]`   Do not edit `prepareModelJob.ts`, `calculateAffordability.ts` or any consumer; the branch that consumes the two-arm return is its own node.
         * `[✅]`   Do not mutate `resourceDocuments` or `conversationHistory` inline. The overlay produces a new array; the function returns it.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/compressPrompt` — victim selection and COMPRESS child dispatch for an over-budget EXECUTE job.
      * `[✅]`   Inside boundary:
         * `[✅]`   Whether the overlaid working set fits the window, and which single victim to compress next when it does not.
         * `[✅]`   The reduce check: a chunked victim whose chunks all completed but whose final artifact is missing is concatenated in `chunk_index` order; still over the per-victim target → one re-compress child, else persist the concatenation as the final artifact.
         * `[✅]`   The pending-success protocol: enqueue, set `waiting_for_children`, return `{ fits: false }`.
      * `[✅]`   Outside boundary:
         * `[✅]`   How a victim is compressed (the COMPRESS child's model call and response handling), owned by `processCompressJob`.
         * `[✅]`   How the working set is assembled into a model call, owned by `prepareModelJob`.
         * `[✅]`   The wallet debit, which belongs to the COMPRESS child that spends the tokens.

   * `[✅]`   `deps`
      * `[✅]`   Removed provider: `_shared/services/rag_service.interface.ts` (`IRagService`) and `_shared/services/rag_service.mock.ts` (`MockRagService`).
         * `[✅]`   Layer classification: shared service interface and mock.
         * `[✅]`   Direction: inbound, and closed by this node — no file in this module imports from `rag_service` afterwards.
         * `[✅]`   Purpose retired: synchronous model-call compression, replaced by COMPRESS children dispatched through `enqueueCompressJobs`.
      * `[✅]`   Removed provider: `_shared/services/indexing_service.interface.ts` (`IEmbeddingClient`) and `_shared/services/indexing_service.ts` (`EmbeddingClient`).
         * `[✅]`   Layer classification: shared service interface and concrete implementation.
         * `[✅]`   Direction: inbound, and closed by this node.
         * `[✅]`   Purpose retired: embedding-based retrieval; victim selection is now `candidateTokens × importance` with no embeddings.
      * `[✅]`   Removed provider: `_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts` (`IAdminTokenWalletService`) and `_shared/services/tokenwallet/admin/adminTokenWalletService.mock.ts` (`createMockAdminTokenWalletService`).
         * `[✅]`   Layer classification: shared service interface and mock.
         * `[✅]`   Direction: inbound, and closed by this node.
         * `[✅]`   Purpose retired: per-victim wallet debit, which belongs to the COMPRESS child.
      * `[✅]`   Removed provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`, `CompressionStrategyDeps`, `CompressionStrategyParams`, `CompressionStrategyPayload`) and `_shared/utils/vector_utils.ts` (`CompressionCandidate`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound, and closed by this node — the pluggable-strategy seam retires; `getSortedCompressionCandidates` replaces it as a dep under a narrower contract.
         * `[✅]`   Purpose retired: the `ICompressionStrategy` three-slot callable whose `CompressionStrategyDeps` required `dbClient` and `embeddingClient`.
      * `[✅]`   Added provider: `_shared/utils/vector_utils.provides.ts` (`BoundGetSortedCompressionCandidatesFn`, `GetSortedCompressionCandidatesParams`, `GetSortedCompressionCandidatesPayload`, `CompressionCandidate`, and the scorer's return guards and mock).
         * `[✅]`   Layer classification: shared utility.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: score candidates by `candidateTokens × importance`, sorted ascending, no embeddings.
      * `[✅]`   Added provider: `dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`BoundenqueueCompressJobsFn`, `enqueueCompressJobsParams`, `enqueueCompressJobsPayload` and the module's guards and mock).
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: lateral within `dialectic-worker`.
         * `[✅]`   Purpose: enqueue COMPRESS children for the selected victim.
      * `[✅]`   Added provider: `_shared/utils/path_constructor.types.ts` (`ConstructStoragePathFn`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: build the canonical artifact path for the overlay's existence check and the reduce check's concatenation persist.
      * `[✅]`   Added provider: `_shared/services/file_manager.ts` or its interface (`DownloadFromStorageFn` or the equivalent read method on `IFileManager`).
         * `[✅]`   Layer classification: shared service.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: read existing `CompressedContext` artifacts for the overlay and for the reduce check's chunk concatenation.
      * `[✅]`   Added provider: `_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts` (`BoundResolveCompressionSourceFn`, `ResourceDocument`, `ResourceDocuments`, `isCompressibleSourceReturn`, `isResolveCompressionSourceErrorReturn`, `buildResourceDocument`, `mockBoundResolveCompressionSource`).
         * `[✅]`   Layer classification: shared utility module.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: resolve a selected document victim to the `sourceType` and `documentKey` that address its canonical `CompressedContext` artifact, and reject a victim the compression domain does not admit.
      * `[✅]`   Confirm:
         * `[✅]`   The two surviving deps — `logger` (`ILogger` from `_shared/types.ts`) and `countTokens` (`CountTokensFn` from `_shared/types/tokenizer.types.ts`) — keep their types and providers.
         * `[✅]`   No reverse dependency: neither `enqueueCompressJobs` nor `vector_utils` nor `_shared` imports this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From `vector_utils`: `BoundGetSortedCompressionCandidatesFn`, `GetSortedCompressionCandidatesParams`, `GetSortedCompressionCandidatesPayload`, `CompressionCandidate` and the two return guards.
         * `[✅]`   From `enqueueCompressJobs`: `BoundenqueueCompressJobsFn`.
         * `[✅]`   From `resolveCompressionSource`: `BoundResolveCompressionSourceFn`, `ResourceDocument`, `ResourceDocuments`, `isCompressibleSourceReturn` and `isResolveCompressionSourceErrorReturn`.
         * `[✅]`   From `path_constructor`: `ConstructStoragePathFn`.
         * `[✅]`   From `file_manager`: the one download/read function type the overlay and reduce check call.
         * `[✅]`   From `_shared/types`: `ILogger`.
         * `[✅]`   From `tokenizer.types`: `CountTokensFn`, `CountTokensDeps`.

   * `[✅]`   `compressPrompt.interface.test.ts`
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof CompressPromptDeps, true>` over `logger`, `getSortedCompressionCandidates`, `enqueueCompressJobs`, `resolveCompressionSource`, `constructStoragePath`, `downloadFromStorage`, `countTokens`, asserting seven.
      * `[✅]`   A case proves the params surface the same way over `dbClient`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression`, `walletBalance`, asserting five.
      * `[✅]`   A case proves the payload surface the same way over `parentJob`, `extendedModelConfig`, `inputsRelevance`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, asserting six.
      * `[✅]`   A case proves the two-arm return by typed assignment: a `CompressPromptFitsReturn` value and a `CompressPromptPendingReturn` value each assign to `CompressPromptSuccessReturn`, that assigns to `CompressPromptReturn`, and a `CompressPromptErrorReturn` value assigns to `CompressPromptReturn` — membership transitive, the flavors nested inside the success arm rather than beside it.
      * `[✅]`   A case proves each flavor's members by typed literal: `fits: true` with `resourceDocuments`, `conversationHistory`, `resolvedInputTokenCount`; `fits: false` with no working-set members.
      * `[✅]`   A case proves `CompressPromptFn` and `BoundCompressPromptFn` accept the narrowed deps, params and payload types and return `Promise<CompressPromptReturn>`.
      * `[✅]`   Every existing case that names `chatApiRequest`, `max_tokens_to_generate`, `ragService`, `embeddingClient`, `tokenWalletService`, `compressionStrategy`, `tokenizerDeps`, `projectOwnerUserId` or any retired return member is restated against the surfaces above. The file imports no builders, its fixtures being typed literals and surface records.

   * `[✅]`   `compressPrompt.interface.ts`
      * `[✅]`   `CompressPromptDeps` drops `ragService` (`IRagService`), `embeddingClient` (`IEmbeddingClient`) and `tokenWalletService` (`IAdminTokenWalletService`), and their imports; adds `getSortedCompressionCandidates` (`BoundGetSortedCompressionCandidatesFn` from `vector_utils.provides.ts`), `enqueueCompressJobs` (`BoundenqueueCompressJobsFn` from `enqueueCompressJobs.provides.ts`), `resolveCompressionSource` (`BoundResolveCompressionSourceFn` from `resolveCompressionSource.provides.ts`), `constructStoragePath` (`ConstructStoragePathFn` from `path_constructor.types.ts`) and `downloadFromStorage` (the file-read function type from `file_manager`).
      * `[✅]`   `ResourceDocument` and `ResourceDocuments` are imported from `../../_shared/utils/resolveCompressionSource/resolveCompressionSource.provides.ts`, that module owning both; the import of either from `_shared/types.ts` is deleted.
      * `[✅]`   `CompressPromptParams` drops `projectOwnerUserId`, `jobId`, `parentJob`, `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `walletId`, `extendedModelConfig`, `inputsRelevance`, `inputRate`, `outputRate`, and the imports those members required (`DialecticJobRow`, `AiModelExtendedConfig`, `ModelContributionFileTypes`, `DialecticStageSlug`, `RelevanceRule`). `dbClient`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression` and `walletBalance` remain.
      * `[✅]`   `CompressPromptPayload` drops `compressionStrategy` (`ICompressionStrategy`), `chatApiRequest` (`ChatApiRequest`) and `tokenizerDeps` (`CountTokensDeps`), and their imports; gains `parentJob` (`DialecticJobRow`), `extendedModelConfig` (`AiModelExtendedConfig`) and `inputsRelevance` (`RelevanceRule[]`), and their imports. `resourceDocuments`, `conversationHistory` and `currentUserPrompt` remain.
      * `[✅]`   `CompressPromptSuccessReturn` and `CompressPromptErrorReturn` are replaced by: `CompressPromptFitsReturn { fits: true; resourceDocuments: ResourceDocuments; conversationHistory: Messages[]; resolvedInputTokenCount: number }`, `CompressPromptPendingReturn { fits: false }`, `CompressPromptSuccessReturn = CompressPromptFitsReturn | CompressPromptPendingReturn`, `CompressPromptErrorReturn { error: Error; retriable: boolean }`, `CompressPromptReturn = CompressPromptSuccessReturn | CompressPromptErrorReturn`.
      * `[✅]`   `CompressPromptFn` and `BoundCompressPromptFn` keep their shapes with the new deps/params/payload/return types.

   * `[✅]`   `compressPrompt.interaction.spec`
      * `[✅]`   Entry: build `tokenizerDeps` from the real tokenizers (same closure as `calculateAffordability`), assemble the `CountableChatPayload` from the working set, and call `deps.countTokens` once on the overlaid working set. This is the initial count after overlay.
      * `[✅]`   Overlay branch: for each candidate in `payload.resourceDocuments` and `payload.conversationHistory`, build its canonical artifact path with `deps.constructStoragePath` (reading `payload.parentJob.payload` for session-level identity — `sessionId`, `projectId`, `stageSlug`, `output_type`, `iterationNumber`) and attempt `deps.downloadFromStorage`. If an artifact exists, replace that candidate's content with the artifact's content in a new array (no inline mutation). This is `applyCompressionOverlay` applied at entry.
      * `[✅]`   Reduce check branch: for each candidate that was chunked (`chunk_total > 1`), if all chunk artifacts exist but the final artifact does not, concatenate the chunks in `chunk_index` order. If the concatenation is still over the per-victim target → enqueue ONE re-compress child for the concatenation and return `{ fits: false }`. Else persist the concatenation as the victim's final `CompressedContext` artifact and continue.
      * `[✅]`   Fits branch, selected by `resolvedInputTokenCount <= params.finalTargetThreshold` after overlay and reduce: the outcome is `{ fits: true, resourceDocuments: overlaidDocs, conversationHistory: overlaidHistory, resolvedInputTokenCount }`.
      * `[✅]`   Over-budget branch: call `deps.getSortedCompressionCandidates` once, in its bound two-argument form, with params `{ inputsRelevance: payload.inputsRelevance, modelConfig: payload.extendedModelConfig }` and payload `{ documents: payload.resourceDocuments, history: payload.conversationHistory }`. Narrow the returned union with `isGetSortedCompressionCandidatesErrorReturn` → propagate `{ error, retriable }` unchanged; otherwise read its `candidates`, already sorted ascending by `effectiveScore`. Exclude candidates whose `CompressedContext` artifact for this compression target already exists (checked during overlay), and select the first surviving candidate — the ONE with the lowest `effectiveScore`.
      * `[✅]`   Victim assembly, history branch, selected by `candidate.sourceType === 'history'`: locate the message in `payload.conversationHistory` whose `id` equals `candidate.id`; the victim is `{ mode: 'text', content: candidate.content, sourceType: 'history', sourceId: message.id, role: message.role }`, and carries no `documentKey`, `docType` or `sourceStageSlug`. A candidate whose `id` matches no message → `{ error: new ContextWindowError("Selected history candidate has no corresponding message"), retriable: false }`.
      * `[✅]`   Victim assembly, document branch, selected by `candidate.sourceType !== 'history'`: locate the document in `payload.resourceDocuments` whose `id` equals `candidate.id`. A candidate whose `id` matches no document → `{ error: new ContextWindowError("Selected document candidate has no corresponding resource document"), retriable: false }`.
      * `[✅]`   Identity resolution: call `deps.resolveCompressionSource` in its bound two-argument form with params `{}` and payload `{ document }`. Narrow with `isResolveCompressionSourceErrorReturn` → propagate `{ error, retriable }` unchanged. Narrow with `isCompressibleSourceReturn` → the victim takes that return's `sourceType` and `documentKey`. A not-compressible return → `{ error: new ContextWindowError("Selected candidate is not an admissible compression source"), retriable: false }`, and `deps.enqueueCompressJobs` is not called.
      * `[✅]`   Mode selection, json, selected by `document.type === 'document'`: the victim takes `mode: 'json'` and requires `docType` and `sourceStageSlug`. `docType` is `document.document_key` narrowed by `isModelContributionFileType`; `sourceStageSlug` is `document.stage_slug` narrowed by `isDialecticStageSlug`. Either narrowing failing → `{ error: new ContextWindowError("Document victim carries an identity that cannot address a json-mode compression"), retriable: false }`. Neither member is defaulted.
      * `[✅]`   Mode selection, text, selected by `document.type !== 'document'`: the victim takes `mode: 'text'` and carries no `docType` or `sourceStageSlug`.
      * `[✅]`   Enqueue branch: call `deps.enqueueCompressJobs` with params `{ dbClient: params.dbClient }` and payload `{ victim, parentJob: payload.parentJob, modelConfig: payload.extendedModelConfig }`, the victim being the object assembled by the branches above. On success, set the parent job row `status = 'waiting_for_children'` via `params.dbClient` and return `{ fits: false }`.
      * `[✅]`   `enqueueCompressJobs` error → propagate unchanged as `{ error, retriable }`.
      * `[✅]`   `getSortedCompressionCandidates` returns an empty `candidates` array, or every candidate is excluded (no eligible victims remain, all already have artifacts), and the set still does not fit → `{ error: ContextWindowError("All candidates exhausted but prompt still exceeds threshold"), retriable: false }`.
      * `[✅]`   Ordering and side effects: overlay reads are synchronous storage reads; the single `deps.enqueueCompressJobs` call is the only write besides the parent status update; no model call, no wallet debit, no `dialectic_memory` query, on any path.

   * `[✅]`   `compressPrompt.mock.ts`
      * `[✅]`   Six owned object types, four symbols each, production-named: `CompressPromptDeps`, `CompressPromptParams`, `CompressPromptPayload`, `CompressPromptFitsReturn`, `CompressPromptPendingReturn`, `CompressPromptErrorReturn` — `…Overrides` as `Partial<T>`, `build…`, `…Corruptions` as `{ [K in keyof T]?: unknown }`, `invalidate…` returning `unknown` as `{ ...buildX(), ...corruptions }`.
      * `[✅]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. `buildCompressPromptParams` defaults `dbClient` to `DbClient(createMockSupabaseClient().client)`, `isContinuationFlowInitial` to `false`, `finalTargetThreshold` to a number, `balanceAfterCompression` to a number and `walletBalance` to a number.
      * `[✅]`   `buildCompressPromptDeps` defaults `logger` to `new MockLogger()`, `getSortedCompressionCandidates` to `mockGetSortedCompressionCandidates` from `vector_utils.provides.ts`, `enqueueCompressJobs` to that module's own bound function mock from `enqueueCompressJobs.provides.ts`, `resolveCompressionSource` to `mockBoundResolveCompressionSource` from `resolveCompressionSource.provides.ts`, `constructStoragePath` to a production-typed function returning a default `ConstructedPath`, `downloadFromStorage` to a production-typed function returning `null` (artifact not found), and `countTokens` to `createMockCountTokens()`.
      * `[✅]`   `buildCompressPromptPayload` defaults `parentJob` to `buildDialecticJobRow()`, `extendedModelConfig` to a valid `AiModelExtendedConfig`, `inputsRelevance` to `[]`, `resourceDocuments` to `[buildResourceDocument()]`, `conversationHistory` to `[]` and `currentUserPrompt` to a string. It returns no `compressionStrategy`, `chatApiRequest` or `tokenizerDeps`.
      * `[✅]`   `buildCompressPromptFitsReturn` and `buildCompressPromptPendingReturn` replace `buildCompressPromptSuccessReturn`; `buildCompressPromptErrorReturn` stops taking positional arguments and defaults `error` to `new Error("mock-compress-prompt-error")` and `retriable` to `false`.
      * `[✅]`   Three function mocks, one per owned function type: `mockCompressPrompt: CompressPromptFn` returning `buildCompressPromptFitsReturn()`, `mockBoundCompressPrompt: BoundCompressPromptFn` returning `buildCompressPromptFitsReturn()`, and no configurable-harness factory. A test needing another outcome declares its own production-typed function composed from these builders.
      * `[✅]`   Deleted: `createCompressPromptMock` with its options bag and call recording, `buildBoundCompressPromptFn` that wired the real implementation, `buildTokenizerDeps`, `buildChatApiRequest`, the `MockRagService` import, the `EmbeddingClient`/`mockOpenAiAdapter` imports, the `createMockAdminTokenWalletService` import, the `defaultCompressionStrategy` function, and every `ICompressionStrategy`/`IRagService`/`IEmbeddingClient`/`IAdminTokenWalletService` import.
      * `[✅]`   `DbClient` is kept. `buildResourceDocument` is deleted from this file and imported from `resolveCompressionSource.provides.ts`, `ResourceDocument` being owned by that module. `describeCompressPromptReturnForTestFailure` is updated to discriminate `fits` rather than `chatApiRequest`.

   * `[✅]`   `compressPrompt.guard.test.ts`
      * `[✅]`   `isCompressPromptDeps` case checklist, fixtures from the builder and invalidator: accepts a full deps object; rejects each of `logger`, `getSortedCompressionCandidates`, `enqueueCompressJobs`, `resolveCompressionSource`, `constructStoragePath`, `downloadFromStorage`, `countTokens` absent and each present-but-wrong-typed; rejects non-record roots. A case asserts a deps object carrying no `ragService`, `embeddingClient` or `tokenWalletService` is accepted.
      * `[✅]`   `isCompressPromptParams` case checklist over the five surviving members (`dbClient`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression`, `walletBalance`), absent and wrong-typed each, fixtures from `invalidateCompressPromptParams`. A case asserts params carrying none of the removed members (`jobId`, `parentJob`, `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `walletId`, `extendedModelConfig`, `inputsRelevance`, `inputRate`, `outputRate`, `projectOwnerUserId`) are accepted.
      * `[✅]`   `isCompressPromptPayload` case checklist over the six surviving members (`parentJob`, `extendedModelConfig`, `inputsRelevance`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`); a case asserts a payload carrying neither `compressionStrategy`, `chatApiRequest` nor `tokenizerDeps` is accepted.
      * `[✅]`   `isCompressPromptSuccessReturn` is replaced by `isCompressPromptFitsReturn` and `isCompressPromptPendingReturn` case checklists: each accepts its own built flavor, rejects the other flavor, rejects a built error return, rejects each of its members absent and wrong-typed through its invalidator, and rejects non-record roots.
      * `[✅]`   `isCompressPromptErrorReturn` keeps its cases, its exclusion assertions restated against the new flavor members — an error return carrying `fits`, `resourceDocuments`, `conversationHistory` or `resolvedInputTokenCount` is rejected.
      * `[✅]`   `isBoundCompressPromptFn` takes `mockBoundCompressPrompt` as its positive fixture. Its negative assertions are unchanged.
      * `[✅]`   The `createMockSupabaseClient` import is kept for `buildCompressPromptParams`'s default; `createCompressPromptMock`, `MockRagService`, `EmbeddingClient` and `createMockAdminTokenWalletService` imports are deleted.

   * `[✅]`   `compressPrompt.guard.ts`
      * `[✅]`   `isCompressPromptDeps` deletes its `ragService`, `embeddingClient` and `tokenWalletService` checks; adds checks for `getSortedCompressionCandidates` (function), `enqueueCompressJobs` (function), `resolveCompressionSource` (function), `constructStoragePath` (function) and `downloadFromStorage` (function); keeps `logger` (record) and `countTokens` (function).
      * `[✅]`   `isCompressPromptParams` drops every check except `dbClient` (object), `isContinuationFlowInitial` (boolean), `finalTargetThreshold` (number), `balanceAfterCompression` (number) and `walletBalance` (number). Deletes checks for `jobId`, `parentJob`, `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `walletId`, `extendedModelConfig`, `inputsRelevance`, `inputRate`, `outputRate` and `projectOwnerUserId`.
      * `[✅]`   `isCompressPromptPayload` deletes its `compressionStrategy`, `chatApiRequest` and `tokenizerDeps` checks; adds checks for `parentJob` (delegating to the owning guard for `DialecticJobRow`), `extendedModelConfig` (delegating to `isAiModelExtendedConfig`) and `inputsRelevance` (array); keeps `resourceDocuments` (array), `conversationHistory` (array) and `currentUserPrompt` (string).
      * `[✅]`   `isCompressPromptSuccessReturn` is replaced by `isCompressPromptFitsReturn` (discriminating `fits === true`, checking `resourceDocuments` array, `conversationHistory` array, `resolvedInputTokenCount` number, rejecting `error`/`retriable`) and `isCompressPromptPendingReturn` (discriminating `fits === false`, rejecting `resourceDocuments`/`conversationHistory`/`resolvedInputTokenCount`/`error`/`retriable`).
      * `[✅]`   `isCompressPromptErrorReturn` keeps its `error` and `retriable` checks; its exclusion list becomes `fits`, `resourceDocuments`, `conversationHistory`, `resolvedInputTokenCount`.
      * `[✅]`   `isBoundCompressPromptFn` is unchanged.

   * `[✅]`   `compressPrompt.test.ts`
      * `[✅]`   Every existing case is deleted or restated. The RAG-loop cases (indexed candidate skipped, single compression replaces content, wallet debit idempotency, balance decremented by tokensUsed, consecutive same-role alternation, loop exits early, post-loop oversized, ragResult.error propagated, recordTransaction throws, isContinuationFlowInitial, missing document identity, provider_max_input_tokens undefined, context_window_tokens undefined, post-compression allowedInputPost, post-compression final input exceeds, post-compression NSF, success sets max_tokens_to_generate, RAG orchestration, zero tokensUsed no debit, affordable compression, preserves continuation anchors, RAG debits stable keys, SSOT output headroom, forwards inputsRelevance, empty inputsRelevance, deterministic first victim, non-decreasing effectiveScore) are all retired with the behaviors they proved.
      * `[✅]`   Cases for the new machine:
         * `[✅]`   Overlay brings working set within budget → `isCompressPromptFitsReturn`, `resourceDocuments` carry overlaid content, `resolvedInputTokenCount` reflects the overlaid count.
         * `[✅]`   Overlay does not fit, `getSortedCompressionCandidates` returns one candidate → `deps.enqueueCompressJobs` called once with that victim and `payload.parentJob`, parent job status set to `waiting_for_children`, result is `isCompressPromptPendingReturn`.
         * `[✅]`   Overlay does not fit, all candidates already have artifacts (`getSortedCompressionCandidates` returns an empty `candidates` array, or every candidate is excluded) → `isCompressPromptErrorReturn` with `ContextWindowError` and `retriable: false`.
         * `[✅]`   `getSortedCompressionCandidates` returns its error arm → `isCompressPromptErrorReturn`, error propagated unchanged, `retriable` propagated unchanged, and `deps.enqueueCompressJobs` is never called.
         * `[✅]`   `deps.getSortedCompressionCandidates` is called with params carrying `inputsRelevance` from `payload.inputsRelevance` and `modelConfig` from `payload.extendedModelConfig`, and payload carrying `documents` from `payload.resourceDocuments` and `history` from `payload.conversationHistory` — captured-argument assertions over a production-typed function the case declares and spies on.
         * `[✅]`   `enqueueCompressJobs` returns an error → `isCompressPromptErrorReturn`, error propagated unchanged, `retriable` propagated unchanged.
         * `[✅]`   Reduce check: chunked victim with all chunk artifacts present, concatenation within per-victim target → concatenation persisted as final artifact, loop continues with that content overlaid.
         * `[✅]`   Reduce check: chunked victim with all chunks present but concatenation still over target → ONE re-compress child enqueued, result is `isCompressPromptPendingReturn`.
         * `[✅]`   Victim selection picks the candidate with the lowest `effectiveScore` from the scorer's `candidates` array — spy on `enqueueCompressJobs` and assert the victim id matches the lowest-scored candidate.
         * `[✅]`   Document victim: the candidate resolves to a compressible source → `deps.enqueueCompressJobs` receives a victim whose `sourceType` and `documentKey` are the values `deps.resolveCompressionSource` returned, asserted against a resolver stub returning values distinct from every builder default.
         * `[✅]`   History victim: `candidate.sourceType === 'history'` → `deps.enqueueCompressJobs` receives a victim carrying `sourceType: 'history'`, `sourceId` equal to the message's `id` and `role` equal to the message's `role`, and no `documentKey`; `deps.resolveCompressionSource` is never called.
         * `[✅]`   Document victim whose `type` is `'document'` → the victim carries `mode: 'json'` with `docType` from the document's `document_key` and `sourceStageSlug` from its `stage_slug`.
         * `[✅]`   Document victim whose `type` is not `'document'` → the victim carries `mode: 'text'` and no `docType` or `sourceStageSlug`.
         * `[✅]`   `deps.resolveCompressionSource` returns its not-compressible flavor → `isCompressPromptErrorReturn`, and `deps.enqueueCompressJobs` is never called.
         * `[✅]`   `deps.resolveCompressionSource` returns its error arm → `isCompressPromptErrorReturn`, error and `retriable` propagated unchanged, and `deps.enqueueCompressJobs` is never called.
         * `[✅]`   No inline mutation: `payload.resourceDocuments` array identity is not the same as `result.resourceDocuments` array identity on the fits path.
         * `[✅]`   Each case constructs deps through `buildCompressPromptDeps`, params through `buildCompressPromptParams` and payload through `buildCompressPromptPayload`, overriding only the fields the case depends on. No `MockRagService`, no `createMockAdminTokenWalletService`, no `createMockSupabaseClient` with `dialectic_memory` generic mock results.

   * `[✅]`   `compressPrompt.ts`
      * `[✅]`   The entire synchronous RAG compression loop is deleted: the document-identity validation loop, the `dialectic_memory` query, the `while` loop over `compressionStrategy` candidates, the `ragService.getContextForModel` call, the `tokenWalletService.recordTransaction` debit, the inline content replacement on `resourceDocuments` and `chatApiRequest.messages`, the message alternation enforcement, the post-loop recount and validation, and the post-compression `getMaxOutputTokens` / `allowedInputPost` / NSF checks.
      * `[✅]`   The implementation body follows the `interaction.spec`:
         * `[✅]`   Build `tokenizerDeps` from the real tokenizers.
         * `[✅]`   Overlay: for each candidate in `payload.resourceDocuments` and `payload.conversationHistory`, build the canonical artifact path with `deps.constructStoragePath` (reading session-level identity from `payload.parentJob.payload`) and attempt `deps.downloadFromStorage`. Produce new arrays with artifact content where found.
         * `[✅]`   Reduce check: for each chunked candidate, if all chunk artifacts exist but the final does not, concatenate in `chunk_index` order. Still over per-victim target → enqueue one re-compress child, return `{ fits: false }`. Else persist concatenation as the final artifact.
         * `[✅]`   Recount with `deps.countTokens` on the overlaid working set. If `resolvedInputTokenCount <= params.finalTargetThreshold` → return `{ fits: true, resourceDocuments: overlaidDocs, conversationHistory: overlaidHistory, resolvedInputTokenCount }`.
         * `[✅]`   Score: call `deps.getSortedCompressionCandidates` in its bound two-argument form, with params `{ inputsRelevance: payload.inputsRelevance, modelConfig: payload.extendedModelConfig }` and payload `{ documents: payload.resourceDocuments, history: payload.conversationHistory }`. Narrow with `isGetSortedCompressionCandidatesErrorReturn` and propagate that arm unchanged; otherwise exclude candidates with existing artifacts and take the first of the remaining `candidates`, the array being sorted ascending by `effectiveScore`.
         * `[✅]`   No eligible victim → return `{ error: new ContextWindowError("All candidates exhausted but prompt still exceeds threshold"), retriable: false }`.
         * `[✅]`   Assemble the victim: a history candidate takes its `sourceId` and `role` from the located message and `mode: 'text'`; a document candidate is located in `payload.resourceDocuments`, passed to `deps.resolveCompressionSource`, and takes that return's `sourceType` and `documentKey`, with `mode` and the json-mode members selected per the `interaction.spec`. Every error branch there returns this function's error arm before any enqueue.
         * `[✅]`   Enqueue: call `deps.enqueueCompressJobs` with params `{ dbClient: params.dbClient }` and payload `{ victim, parentJob: payload.parentJob, modelConfig: payload.extendedModelConfig }`. On error, propagate unchanged. On success, set parent job `status = 'waiting_for_children'` and return `{ fits: false }`.
      * `[✅]`   Deleted imports: `IRagService`, `MockRagService`, `IEmbeddingClient`, `EmbeddingClient`, `IAdminTokenWalletService`, `createMockAdminTokenWalletService`, `ICompressionStrategy`, `CompressionCandidate`, `getMaxOutputTokens`, `ContextWindowError` (kept if the new body still uses it for the exhausted-candidates error), `dialectic_memory` query utilities.

   * `[✅]`   `compressPrompt.provides.ts`
      * `[✅]`   Re-exports: `compressPrompt` from `./compressPrompt.ts`; all types from `./compressPrompt.interface.ts` (`CompressPromptDeps`, `CompressPromptParams`, `CompressPromptPayload`, `CompressPromptFitsReturn`, `CompressPromptPendingReturn`, `CompressPromptSuccessReturn`, `CompressPromptErrorReturn`, `CompressPromptReturn`, `CompressPromptFn`, `BoundCompressPromptFn`); all guards from `./compressPrompt.guard.ts`; all mock symbols from `./compressPrompt.mock.ts`.
      * `[✅]`   Deleted re-exports: every symbol that no longer exists in the interface, guard or mock — `isCompressPromptSuccessReturn` (replaced by `isCompressPromptFitsReturn` and `isCompressPromptPendingReturn`), `createCompressPromptMock`, `buildBoundCompressPromptFn`, `buildTokenizerDeps`, `buildChatApiRequest`, `CreateCompressPromptMockOptions`, `CompressPromptMockCall`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module drops its imports of `IRagService`, `IEmbeddingClient`, `IAdminTokenWalletService`, `ICompressionStrategy`, `CompressionCandidate` and `getMaxOutputTokens`; adds imports from `vector_utils.provides.ts` (`BoundGetSortedCompressionCandidatesFn`, its params and payload types, `CompressionCandidate` and its return guards), `enqueueCompressJobs.provides.ts` (`BoundenqueueCompressJobsFn`), `path_constructor.types.ts` (`ConstructStoragePathFn`), and `file_manager` (download function type).
      * `[✅]`   `compressPrompt.provides.ts` re-exports this module's implementation, interface, guard and mock, so the renamed flavors, the new guards and the new mock symbols reach consumers without a separate edit, and the retired ones leave it the moment they leave their source.
      * `[✅]`   No cycle: `enqueueCompressJobs` and `vector_utils` import nothing from this module. `calculateAffordability` drops its import of `compressPrompt` in its own node, after which neither imports the other.

   * `[✅]`   `requirements`
      * `[✅]`   `CompressPromptDeps` declares seven members and `ragService`, `embeddingClient`, `tokenWalletService` are not among them — interface test, exhaustive key record.
      * `[✅]`   `CompressPromptParams` declares five members (`dbClient`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression`, `walletBalance`) with no scalar that duplicates a field on `parentJob`, `parentJob.payload` or `extendedModelConfig` — interface test, exhaustive key record.
      * `[✅]`   `CompressPromptPayload` declares six members (`parentJob`, `extendedModelConfig`, `inputsRelevance`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`) with `compressionStrategy`, `chatApiRequest`, `tokenizerDeps` absent — interface test, exhaustive key record.
      * `[✅]`   `CompressPromptReturn` has exactly two arms, and both success flavors (`CompressPromptFitsReturn`, `CompressPromptPendingReturn`) are members of `CompressPromptSuccessReturn` — interface test, typed assignment.
      * `[✅]`   An overlaid working set that fits returns `fits: true` with the overlaid documents, history and token count — unit test.
      * `[✅]`   An over-budget working set with an eligible victim enqueues ONE COMPRESS child, sets parent `waiting_for_children`, and returns `fits: false` — unit test.
      * `[✅]`   An over-budget working set with no eligible victims returns `ContextWindowError`, `retriable: false` — unit test.
      * `[✅]`   An `enqueueCompressJobs` error is propagated unchanged — unit test.
      * `[✅]`   A chunked victim whose chunks all completed is concatenated; if within target, persisted as final artifact; if still over, one re-compress child enqueued — unit test.
      * `[✅]`   A document victim's `sourceType` and `documentKey` are the values `deps.resolveCompressionSource` returned, and no `sourceType` literal appears in the module — unit test.
      * `[✅]`   A history victim carries `sourceType: 'history'`, the message's `id` as `sourceId` and the message's `role`, without calling `deps.resolveCompressionSource` — unit test.
      * `[✅]`   A victim whose document `type` is `'document'` carries `mode: 'json'` with `docType` and `sourceStageSlug`; every other admissible victim carries `mode: 'text'` without them — unit test.
      * `[✅]`   A not-compressible or error return from `deps.resolveCompressionSource` returns this function's error arm and enqueues nothing — unit test.
      * `[✅]`   Victim selection picks the lowest `effectiveScore` candidate — unit test.
      * `[✅]`   No inline mutation of payload arrays — unit test.
      * `[✅]`   Every owned object type has a `Partial<T>`-overrides builder and an `unknown`-returning invalidator, and each owned function type has a function mock that is that type exactly — guard test, whose fixtures are drawn from them.
      * `[✅]`   The function calls no synchronous model service, debits no wallet and queries no `dialectic_memory` table — unit test (no such dep exists to call).

* `[✅]`   supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts **[BE] Separate affordability from compression — no `compressPrompt` dep, no relayed params, no `compressionStrategy` or `chatApiRequest` payload members, and a two-arm return whose success flavors are within-budget and over-budget — and measure with the real tokenizer, so one ruler serves the preflight, the per-victim target, scoring and chunk sizing**

   * `[✅]`   `objective`
      * `[✅]`   Solve a function that answers two questions, owns a side effect, and measures with the wrong ruler. `calculateAffordability` decides whether a request is affordable and what the output cap is, and then — on the oversized branch — builds `CompressPromptParams` and `CompressPromptPayload`, awaits `deps.compressPrompt`, and reports its result as a `wasCompressed: true` flavor of its own return. Compression spends a wallet, spawns jobs and rewrites a working set; a verdict does none of those. The caller cannot decide what an over-budget request warrants because the decision is already taken inside the callee, which is why the recursion guard a COMPRESS job needs has nowhere to live. Separately, the `tokenizerDeps` literal this function builds counts characters — `getEncoding` returns one index per character and `countTokensAnthropic` returns `text.length` — so every count it takes, and every solver result derived from one, reads high on tiktoken and anthropic models.
      * `[✅]`   Functional goals:
         * `[✅]`   `CalculateAffordabilityDeps` declares `logger`, `countTokens` and `getMaxOutputTokens`, and no `compressPrompt`.
         * `[✅]`   `CalculateAffordabilityParams` declares `walletBalance` and `userConfig`, and drops `dbClient`, `jobId`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `extendedModelConfig`, `inputRate`, `outputRate`, `isContinuationFlowInitial` and `inputsRelevance`. `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance` exist solely to be relayed into `CompressPromptParams`; `jobId` is a KVP duplicate of `job.id` (the caller has the row); `inputRate` and `outputRate` are KVP duplicates of `payload.extendedModelConfig.input_token_cost_rate` and `payload.extendedModelConfig.output_token_cost_rate`; `extendedModelConfig` is a data object that belongs in payload.
         * `[✅]`   `CalculateAffordabilityPayload` declares `extendedModelConfig`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt` and `systemInstruction` — the data the token count and solver read — and neither `compressionStrategy` nor `chatApiRequest`.
         * `[✅]`   The return has exactly two arms. `CalculateAffordabilitySuccessReturn` is the union of `CalculateAffordabilityWithinBudgetReturn` (`overBudget: false`, `maxOutputTokens`, `resolvedInputTokenCount`) and `CalculateAffordabilityOverBudgetReturn` (`overBudget: true`, `resolvedInputTokenCount`, `finalTargetThreshold`, `balanceAfterCompression`); `CalculateAffordabilityReturn` is `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn`. `wasCompressed`, `CalculateAffordabilityDirectReturn` and `CalculateAffordabilityCompressedReturn` are gone.
         * `[✅]`   The over-budget arm carries the sizing this function's solver computes — `finalTargetThreshold` and `balanceAfterCompression` — because `CompressPromptParams` requires both and no other function computes them.
         * `[✅]`   The function performs no dependency call other than `deps.countTokens` and `deps.getMaxOutputTokens`, and causes no side effect on any branch.
         * `[✅]`   The `tokenizerDeps` literal supplies the real implementations: `getEncoding` narrows its argument with `isKnownTiktokenEncoding` and returns `rawGetEncoding(encodingName)`, throwing `Unsupported tiktoken encoding: ${encodingName}` otherwise, and `countTokensAnthropic` is the imported `countTokens` from the anthropic tokenizer. `logger` stays `deps.logger`.
         * `[✅]`   `calculateAffordability.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Every affordability verdict this function reaches today it reaches unchanged: the same solver, the same cost estimates, the same rationality thresholds, the same NSF and `ContextWindowError` messages and the same `retriable` flags. Only the compression call, the members that fed it, the flavor that reported it and the ruler that measured it change.
         * `[✅]`   `UserConfig`, `TierOutputCapTokens`, `GetMaxOutputTokensFn`, `isUserConfig`, `isTierOutputCapTokens` and `isGetMaxOutputTokensFn` are unchanged, and `calculateAffordability.provides.ts` already re-exports the guard file with `export *`, so `enqueueModelCall.guard.ts`'s import of `isUserConfig` resolves before and after this node.
         * `[✅]`   The function keeps its `(deps, params, payload)` shape and its trusted-form payload; nothing here is guarded on entry.
         * `[✅]`   Consumers outside this module go transiently non-compilable and are not edited here: `prepareModelJob.ts` builds the retired params and payload members and narrows the retired flavors, `prepareModelJob.test.ts` and `prepareModelJob.integration.test.ts` build the retired return builders, `createJobContext.ts` and `dialectic-worker/index.ts` pass `compressPrompt` into this function's deps, and `JobContext.mock.ts` and `createJobContext.test.ts` build an unbound `calculateAffordability` that invokes `deps.compressPrompt`. Each is a support file of the `prepareModelJob` or `createJobContext` node later in this workstream.
      * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer computation: given a working set, a model config and a wallet balance, report whether the request fits and is affordable, what output cap it may claim, and — when it does not fit — the input size a compression pass must reach and the balance that survives it.
      * `[✅]`   The role is correct because a verdict is a value, not an action. A function that returns a verdict can be called by an EXECUTE job and a COMPRESS job alike, which is what lets `prepareModelJob` place the recursion guard on the job row's `job_type` instead of on which collaborator it withheld.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not call, import or type `compressPrompt` anywhere in this module.
         * `[✅]`   Do not edit `prepareModelJob.ts` or its suites; the branch that consumes the over-budget arm and calls `compressPrompt` is its own node.
         * `[✅]`   Do not edit `createJobContext.ts`, `dialectic-worker/index.ts`, `JobContext.mock.ts` or `createJobContext.test.ts`; the deps literals that stop carrying `compressPrompt` belong to the `createJobContext` and composition-root nodes.
         * `[✅]`   Do not change the solver, the cost arithmetic, the rationality thresholds or any error message. This node moves a responsibility out and swaps a ruler; it does not re-derive what stays.
         * `[✅]`   Do not add a pending, deferred or queued flavor. This function spawns nothing, so it has nothing to report as pending; `PrepareModelJobPendingReturn` is the caller's.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/calculateAffordability` — preflight token counting, output-cap resolution, cost estimation against a wallet balance, and the input-size target a working set must reach to fit.
      * `[✅]`   Inside boundary:
         * `[✅]`   Whether a request fits the window and is affordable, and at what output cap.
         * `[✅]`   The per-request sizing arithmetic: the solver, the compression cost estimate and the balance that survives it.
         * `[✅]`   Which tokenizer implementations measure this function's one count.
      * `[✅]`   Outside boundary:
         * `[✅]`   What an over-budget request warrants — compression for an EXECUTE job, a hard failure for a COMPRESS job — which is `prepareModelJob`'s decision from the job row's `job_type`.
         * `[✅]`   How a working set is made smaller, owned by `compressPrompt`.
         * `[✅]`   The wallet balance, the job row and the model config, all of which reach this function as plain values.

   * `[✅]`   `deps`
      * `[✅]`   Removed provider: `compressPrompt` (`BoundCompressPromptFn` from `../compressPrompt/compressPrompt.interface.ts`, `isCompressPromptErrorReturn` from `../compressPrompt/compressPrompt.guard.ts`, `CompressPromptParams`/`CompressPromptPayload` in the implementation, and `buildBoundCompressPromptFn` in the mock).
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: inbound, and closed by this node — no file in this module imports from `compressPrompt` afterwards.
         * `[✅]`   Purpose retired: making the working set fit, which the caller now composes.
      * `[✅]`   Removed provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`), in the interface and the mock; `dialectic-service/dialectic.interface.ts` (`RelevanceRule`); and `npm:@supabase/supabase-js@2` plus `types_db.ts`'s `Database` for the `dbClient` params member, in the interface, the guard and the mock.
         * `[✅]`   Layer classification: shared type surface and external client type.
         * `[✅]`   Direction: inbound, and closed by this node with the members they typed.
         * `[✅]`   Purpose retired: relaying a scorer, a relevance rule set and a database handle to a callee this function no longer has.
      * `[✅]`   Added provider: `npm:js-tiktoken@1.0.7` (`getEncoding as rawGetEncoding`), `npm:@anthropic-ai/tokenizer@0.0.4` (`countTokens as countTokensAnthropic`) and `_shared/utils/type-guards/type_guards.chat.ts` (`isKnownTiktokenEncoding`), in the implementation only.
         * `[✅]`   Layer classification: third-party tokenizer packages and a shared runtime boundary.
         * `[✅]`   Direction: inbound; `dialectic-worker/processJob.ts` already imports all three in this exact form and builds the closure this literal copies.
         * `[✅]`   Purpose: measure the one preflight count with the tokenizer the model actually uses.
      * `[✅]`   Confirm:
         * `[✅]`   The three surviving deps — `logger`, `countTokens`, `getMaxOutputTokens` — keep their types and providers: `ILogger` from `_shared/types.ts`, `CountTokensFn` from `_shared/types/tokenizer.types.ts`, and `GetMaxOutputTokensFn` declared in this interface and implemented by `_shared/utils/affordability_utils.ts`.
         * `[✅]`   No dependency is added to `CalculateAffordabilityDeps`; the tokenizer imports are module-level in the implementation, exactly as they are in `processJob.ts`.
         * `[✅]`   No reverse dependency: neither `compressPrompt` nor `_shared` imports this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From each surviving dep provider: the one function type it supplies, nothing wider.
         * `[✅]`   From each tokenizer package: the one named export the literal calls, nothing wider.

   * `[✅]`   `calculateAffordability.interface.test.ts`
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof CalculateAffordabilityDeps, true>` over `logger`, `countTokens`, `getMaxOutputTokens`, asserting three. Exhaustive in both directions, it is the proof `compressPrompt` is not a dep.
      * `[✅]`   A case proves the params surface the same way over `walletBalance`, `userConfig`, asserting two.
      * `[✅]`   A case proves the payload surface the same way over `extendedModelConfig`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `systemInstruction`, asserting five.
      * `[✅]`   A case proves the two-arm return by typed assignment: a `CalculateAffordabilityWithinBudgetReturn` value and a `CalculateAffordabilityOverBudgetReturn` value each assign to `CalculateAffordabilitySuccessReturn`, that assigns to `CalculateAffordabilityReturn`, and a `CalculateAffordabilityErrorReturn` value assigns to `CalculateAffordabilityReturn` — membership transitive, the flavors nested inside the success arm rather than beside it.
      * `[✅]`   A case proves each flavor's members by typed literal: `overBudget: false` with `maxOutputTokens` and `resolvedInputTokenCount`; `overBudget: true` with `resolvedInputTokenCount`, `finalTargetThreshold` and `balanceAfterCompression`.
      * `[✅]`   A case proves `CalculateAffordabilityFn` and `BoundCalculateAffordabilityFn` accept the narrowed deps, params and payload types and return `Promise<CalculateAffordabilityReturn>`.
      * `[✅]`   Every existing case that names `wasCompressed`, `CalculateAffordabilityDirectReturn`, `CalculateAffordabilityCompressedReturn`, `compressPrompt`, `compressionStrategy`, `chatApiRequest`, `jobId`, `inputRate`, `outputRate` or any other retired params member is restated against the surfaces above; the `UserConfig`, `TierOutputCapTokens` and `GetMaxOutputTokensFn` cases are unchanged. The file imports no builders, its fixtures being typed literals and surface records.

   * `[✅]`   `calculateAffordability.interface.ts`
      * `[✅]`   `CalculateAffordabilityDeps` drops `compressPrompt`, and the `BoundCompressPromptFn` import with it.
      * `[✅]`   `CalculateAffordabilityParams` drops `dbClient`, `jobId`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `extendedModelConfig`, `inputRate`, `outputRate`, `isContinuationFlowInitial` and `inputsRelevance`, and the `SupabaseClient`, `Database`, `AiModelExtendedConfig` (from params; kept for payload), and `RelevanceRule` imports those members required. Surviving members: `walletBalance: number` and `userConfig: UserConfig`.
      * `[✅]`   `CalculateAffordabilityPayload` drops `compressionStrategy` and `chatApiRequest`, adds `extendedModelConfig: AiModelExtendedConfig` (moved from params), and the `ICompressionStrategy` and `ChatApiRequest` imports are deleted; `AiModelExtendedConfig`, `ResourceDocuments` and `Messages` remain imported for the payload.
      * `[✅]`   `CalculateAffordabilityDirectReturn` and `CalculateAffordabilityCompressedReturn` are replaced by `CalculateAffordabilityWithinBudgetReturn { overBudget: false; maxOutputTokens: number; resolvedInputTokenCount: number }` and `CalculateAffordabilityOverBudgetReturn { overBudget: true; resolvedInputTokenCount: number; finalTargetThreshold: number; balanceAfterCompression: number }`.
      * `[✅]`   `CalculateAffordabilitySuccessReturn` is declared as the union of those two, and `CalculateAffordabilityReturn` becomes `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn` — the named two-arm form, with the flavors inside the success arm.
      * `[✅]`   `CalculateAffordabilityErrorReturn`, `UserConfig`, `TierOutputCapTokens`, `GetMaxOutputTokensFn`, `CalculateAffordabilityFn` and `BoundCalculateAffordabilityFn` keep their declarations.

   * `[✅]`   `calculateAffordability.interaction.spec`
      * `[✅]`   Entry: build the `tokenizerDeps` literal from the real tokenizers, filter `payload.conversationHistory` of `function`-role messages, narrow with `isApiChatMessage` and drop null content, assemble the `CountableChatPayload` from `payload.systemInstruction`, `payload.currentUserPrompt`, those messages and `payload.resourceDocuments`, and call `deps.countTokens` once with `payload.extendedModelConfig` as the model config argument. This is the only count the function takes.
      * `[✅]`   `payload.extendedModelConfig.context_window_tokens` not a number → `{ error: Error("context_window_tokens is not defined"), retriable: false }`.
      * `[✅]`   Within-window branch, selected by `initialTokenCount <= context_window_tokens`, unchanged in every decision: `deps.getMaxOutputTokens(params.walletBalance, initialTokenCount, payload.extendedModelConfig, deps.logger, 0, params.userConfig.tier_output_cap_tokens)` negative → `Insufficient funds to cover the input prompt cost.`, `retriable: false`; `payload.extendedModelConfig.provider_max_input_tokens` not a number → `provider_max_input_tokens is not defined`; `allowedInput <= 0` → `ContextWindowError("No input window remains after reserving output budget (…) and safety buffer (32).")`; `initialTokenCount > allowedInput` → `ContextWindowError("Initial input tokens (…) exceed allowed input (…) after reserving output budget.")`; estimated total cost over balance → `Insufficient funds: estimated total cost (…) exceeds wallet balance (…).`. Otherwise the outcome is `{ overBudget: false, maxOutputTokens: plannedMaxOutputTokens, resolvedInputTokenCount: initialTokenCount }`.
      * `[✅]`   Over-window branch, entered when the count exceeds the window: the rate validations read `payload.extendedModelConfig.input_token_cost_rate` and `payload.extendedModelConfig.output_token_cost_rate` (`isValidInputTokenCostRate`, `isValidOutputTokenCostRate`), the embeddings-inclusive NSF check, the eighty-percent rationality check, the `provider_max_input_tokens` check, the `solveTargetForBalance` solver, the `balanceAfterCompression` positivity check, the feasible-target check, the total-estimated-cost check and the second rationality check all run exactly as they run now and return exactly the errors they return now, with the same messages and `retriable: false`.
      * `[✅]`   Over-window outcome: `{ overBudget: true, resolvedInputTokenCount: initialTokenCount, finalTargetThreshold, balanceAfterCompression }` — the two solver results the caller needs to build `CompressPromptParams`. No dependency beyond `deps.getMaxOutputTokens` is called on this branch, and nothing is spent, written or spawned.
      * `[✅]`   Deleted from this branch: the per-document identity loop over `payload.resourceDocuments` and the `inputsRelevance is required` gate. Both are preconditions of the compression call this node removes, and `compressPrompt` enforces the identity rule at its own entry, so keeping either would reject a request for a member no branch here reads.
      * `[✅]`   The `deps.logger.info` line on this branch is kept and states the over-budget verdict — the token count and the limit — in place of `Attempting compression.`
      * `[✅]`   Ordering and side effects: one `deps.countTokens` call, `deps.getMaxOutputTokens` called as the branches already call it, no other dependency call, no write, no wallet debit, no job insert, on any path.

   * `[✅]`   `calculateAffordability.mock.ts`
      * `[✅]`   Six owned object types, four symbols each, production-named: `CalculateAffordabilityDeps`, `CalculateAffordabilityParams`, `CalculateAffordabilityPayload`, `CalculateAffordabilityWithinBudgetReturn`, `CalculateAffordabilityOverBudgetReturn`, `CalculateAffordabilityErrorReturn` — `…Overrides` as `Partial<T>`, `build…`, `…Corruptions` as `{ [K in keyof T]?: unknown }`, `invalidate…` returning `unknown` as `{ ...buildX(), ...corruptions }`. `UserConfigOverrides`, `buildUserConfig`, `UserConfigCorruptions` and `invalidateUserConfig` already hold that form and are unchanged.
      * `[✅]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. `buildCalculateAffordabilityParams` defaults `walletBalance` to a number and `userConfig` to `buildUserConfig()`.
      * `[✅]`   `buildCalculateAffordabilityDeps` defaults `logger` to `new MockLogger()`, `countTokens` to `createMockCountTokens()` and `getMaxOutputTokens` to the real `getMaxOutputTokens` from `_shared/utils/affordability_utils.ts`, and supplies no `compressPrompt`. The `buildBoundCompressPromptFn`, `BoundCompressPromptFn`, `ICompressionStrategy` and `RelevanceRule` imports and the module-level `defaultCompressionStrategy` are deleted.
      * `[✅]`   `buildCalculateAffordabilityPayload` defaults `extendedModelConfig` to a valid `AiModelExtendedConfig`, composes this file's own `buildResourceDocument` for its documents and defaults `conversationHistory` to `[]`, `currentUserPrompt` and `systemInstruction` to their existing strings; it returns no `compressionStrategy` and no `chatApiRequest`, and the `buildChatApiRequest` import goes with them. `buildResourceDocument` is imported from `compressPrompt.mock.ts` today, which is the compression module's fixture for a type neither interface owns; it is declared here instead so this mock imports nothing from `compressPrompt`.
      * `[✅]`   `buildCalculateAffordabilityWithinBudgetReturn` and `buildCalculateAffordabilityOverBudgetReturn` replace `buildCalculateAffordabilityDirectReturn` and `buildCalculateAffordabilityCompressedReturn`, each taking one optional overrides object with a default for every member; `buildCalculateAffordabilityErrorReturn` stops taking positional arguments and defaults `error` to `new Error("mock-calculate-affordability-error")` and `retriable` to `false`.
      * `[✅]`   Three function mocks, one per owned function type: `mockCalculateAffordability: CalculateAffordabilityFn` and `mockBoundCalculateAffordability: BoundCalculateAffordabilityFn`, each returning `buildCalculateAffordabilityWithinBudgetReturn()`, and `mockGetMaxOutputTokens: GetMaxOutputTokensFn` returning `0` — identical signatures, no extra parameters, no options and no recording.
      * `[✅]`   Deleted: `buildMockCalculateAffordabilityFn` and `buildMockBoundCalculateAffordabilityFn` with their overload signatures, `MockCalculateAffordabilityFnOptions`, `MockBoundCalculateAffordabilityFnOptions`, `isMockCalculateAffordabilityFnOptions`, `isMockBoundCalculateAffordabilityFnOptions` and `buildMockGetMaxOutputTokens`. Each is a parameterized factory or an options bag; a test needing another outcome declares its own production-typed function composed from these builders.

   * `[✅]`   `calculateAffordability.guard.test.ts`
      * `[✅]`   `isCalculateAffordabilityDeps` case checklist, fixtures from the builder and invalidator: accepts a full deps object; rejects each of `logger`, `countTokens`, `getMaxOutputTokens` absent and each present-but-wrong-typed; rejects non-record roots. A case asserts a deps object carrying no `compressPrompt` is accepted, which is the proof the dep is retired.
      * `[✅]`   `isCalculateAffordabilityParams` case checklist over the two surviving members (`walletBalance`, `userConfig`), absent and wrong-typed each, fixtures from `invalidateCalculateAffordabilityParams`; the four `userConfig` cases stand. A case asserts params carrying none of the eleven retired members (`dbClient`, `jobId`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `extendedModelConfig`, `inputRate`, `outputRate`, `isContinuationFlowInitial`, `inputsRelevance`) are accepted.
      * `[✅]`   `isCalculateAffordabilityPayload` case checklist over the five surviving members (`extendedModelConfig`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `systemInstruction`); a case asserts a payload carrying neither `compressionStrategy` nor `chatApiRequest` is accepted.
      * `[✅]`   `isCalculateAffordabilityDirectReturn` and `isCalculateAffordabilityCompressedReturn` cases become `isCalculateAffordabilityWithinBudgetReturn` and `isCalculateAffordabilityOverBudgetReturn` case checklists: each accepts its own built flavor, rejects the other flavor, rejects a built error return, rejects each of its members absent and wrong-typed through its invalidator, and rejects non-record roots.
      * `[✅]`   `isCalculateAffordabilityErrorReturn` keeps its cases, its exclusion assertions restated against the new flavor members — an error return carrying `overBudget`, `maxOutputTokens`, `finalTargetThreshold` or `balanceAfterCompression` is rejected.
      * `[✅]`   `isBoundCalculateAffordabilityFn` takes `mockBoundCalculateAffordability` as its positive fixture; `isCalculateAffordabilityFn` takes `mockCalculateAffordability`; `isGetMaxOutputTokensFn` takes `mockGetMaxOutputTokens`. Their negative assertions are unchanged.
      * `[✅]`   The `isTierOutputCapTokens` and `isUserConfig` checklists are unchanged. The `createMockSupabaseClient` and `DbClient` imports are deleted with the params member they served.

   * `[✅]`   `calculateAffordability.guard.ts`
      * `[✅]`   `isCalculateAffordabilityDeps` deletes its `compressPrompt` check and keeps the other three.
      * `[✅]`   `isCalculateAffordabilityParams` drops every check except `walletBalance` (number) and its `isUserConfig` call on `userConfig`. Deletes checks for `dbClient`, `jobId`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `extendedModelConfig`, `inputRate`, `outputRate`, `isContinuationFlowInitial` and `inputsRelevance`.
      * `[✅]`   `isCalculateAffordabilityPayload` deletes its `compressionStrategy` and `chatApiRequest` checks; adds a check for `extendedModelConfig` (delegating to `isAiModelExtendedConfig`); keeps `resourceDocuments` (array), `conversationHistory` (array), `currentUserPrompt` (string) and `systemInstruction` (string).
      * `[✅]`   `isCalculateAffordabilityDirectReturn` and `isCalculateAffordabilityCompressedReturn` become `isCalculateAffordabilityWithinBudgetReturn` and `isCalculateAffordabilityOverBudgetReturn`, each discriminating on its own `overBudget` literal, checking the numeric type of each of its members, and rejecting a value carrying `error` or `retriable` or the other flavor's distinguishing member.
      * `[✅]`   `isCalculateAffordabilityErrorReturn` keeps its `error` and `retriable` checks, and its exclusion list becomes `overBudget`, `maxOutputTokens`, `resolvedInputTokenCount`, `finalTargetThreshold` and `balanceAfterCompression`.
      * `[✅]`   Every guard keeps its boolean contract; none throws. `isTierOutputCapTokens`, `isUserConfig`, `isGetMaxOutputTokensFn`, `isCalculateAffordabilityFn` and `isBoundCalculateAffordabilityFn` are unchanged.

   * `[✅]`   `calculateAffordability.test.ts`
      * `[✅]`   Every case constructs its deps through `buildCalculateAffordabilityDeps` without a `compressPrompt` override, its params through `buildCalculateAffordabilityParams` with an overrides object (two members only — `walletBalance` and `userConfig`), and its payload with `extendedModelConfig` supplied through `buildCalculateAffordabilityPayload`, without `compressionStrategy` or `chatApiRequest`. The `createCompressPromptMock` import and every `calls.length` assertion that watched it are deleted, the collaborator they observed no longer being reachable from this function.
      * `[✅]`   The within-window cases — `Non-oversized adequate balance`, `Non-oversized NSF`, `Non-oversized allowedInput <= 0`, the SSOT output-cap case, the estimated-cost NSF case, the `max_tokens_to_generate` case, both `tier_output_cap_tokens` forwarding cases and the `getMaxOutputTokens` invocation case — keep every arrangement and every assertion, with `isCalculateAffordabilityDirectReturn` restated as `isCalculateAffordabilityWithinBudgetReturn`. Rates are read from `payload.extendedModelConfig` in the arrangement rather than passed as params.
      * `[✅]`   `Oversized: compressPrompt called with finalTargetThreshold, balanceAfterCompression, walletBalance; compressed return on success` becomes an over-budget verdict case: the same oversized arrangement, asserting `isCalculateAffordabilityOverBudgetReturn`, that `finalTargetThreshold` and `balanceAfterCompression` carry the values the case asserts today at the compress call, and that `resolvedInputTokenCount` is the initial count. Its title states the verdict rather than the call.
      * `[✅]`   `Oversized: compressPrompt error propagated; error return` is deleted: there is no collaborator to propagate from, and no other case's coverage depends on it.
      * `[✅]`   Every oversized error case — NSF including embeddings, both eighty-percent rationality cases, `balanceAfterCompression <= 0`, infeasible solver target, total estimated cost exceeds balance — keeps its arrangement, its error type, its message assertion and its `retriable` flag. The two whose titles end `compressPrompt not called` keep their error assertions and lose that clause.
      * `[✅]`   Cases are added for the two branches this node deletes, proving the removals are behavioral and not silent: an oversized request whose documents carry no `document_key`, `type` or `stage_slug` returns the over-budget verdict rather than an identity error; an oversized request whose payload carries no `inputsRelevance` returns the over-budget verdict rather than an `inputsRelevance is required` error.
      * `[✅]`   A case asserts the function calls `deps.countTokens` exactly once and reaches no other collaborator on the over-budget path, spy applied at the call site.
      * `[✅]`   Each case supplies its own `countTokens` through the builder, so the real tokenizer the implementation now constructs does not enter this tier; any expectation computed from character arithmetic against the retired inline tokenizer is recomputed against the injected count rather than re-stubbed.

   * `[✅]`   `calculateAffordability.ts`
      * `[✅]`   The `compressParams` and `compressPayload` literals, the `await deps.compressPrompt(...)` call, the `isCompressPromptErrorReturn` branch and the `wasCompressed: true` success construction are deleted, with the `isCompressPromptErrorReturn`, `CompressPromptParams` and `CompressPromptPayload` imports.
      * `[✅]`   The `tokenizerDeps` literal's `getEncoding` becomes the closure that throws `Unsupported tiktoken encoding: ${encodingName}` when `isKnownTiktokenEncoding` rejects the name and returns `rawGetEncoding(encodingName)` otherwise, and its `countTokensAnthropic` becomes the imported anthropic `countTokens`; `logger` stays `deps.logger`. The three imports are added at module level in the form `processJob.ts` already uses.
      * `[✅]`   Every read of `params.extendedModelConfig` becomes `payload.extendedModelConfig`. Every read of `params.inputRate` becomes `payload.extendedModelConfig.input_token_cost_rate`. Every read of `params.outputRate` becomes `payload.extendedModelConfig.output_token_cost_rate`. `params.walletBalance` stays `params.walletBalance`.
      * `[✅]`   The over-window branch ends by returning `{ overBudget: true, resolvedInputTokenCount: initialTokenCount, finalTargetThreshold, balanceAfterCompression }`, typed as `CalculateAffordabilityOverBudgetReturn`.
      * `[✅]`   The within-window branch's return becomes `{ overBudget: false, maxOutputTokens: plannedMaxOutputTokens, resolvedInputTokenCount: initialTokenCount }`, typed as `CalculateAffordabilityWithinBudgetReturn`.
      * `[✅]`   The document-identity loop and the `inputsRelevance is required` gate are deleted, along with the `inputsRelevance` local they produced.
      * `[✅]`   The `deps.logger.info` line drops the job id and states the over-budget verdict — the token count and the limit — in place of `Attempting compression.`
      * `[✅]`   Everything else is unchanged: the message filtering, the single `deps.countTokens` call, both `context_window_tokens` checks, every `getMaxOutputTokens` call and its arguments, `getAllowedInputFor`, `solveTargetForBalance`, every cost and rationality computation, and every error type, message and `retriable` flag.
      * `[✅]`   The unreachable `maxTokens === undefined` block that follows the within-window return is left exactly as it stands; removing dead code is not this node's work.

   * `[✅]`   `calculateAffordability.integration.test.ts`
      * `[✅]`   The three non-oversized cases — direct return with real config and real `countTokens`, NSF, and the binding `tierOutputCapTokens=32768` cap — keep every arrangement and assertion, with `isCalculateAffordabilityDirectReturn` restated as `isCalculateAffordabilityWithinBudgetReturn`. Their `BoundCompressPromptFn` locals that throw when called are deleted along with the dep they guarded. Rates and config are supplied through `payload.extendedModelConfig` rather than as params.
      * `[✅]`   The `oversized path with real compressPrompt` block, which wires the real `compressPrompt` with `MockRagService` and a real `EmbeddingClient` through this function's deps, is replaced by an over-budget verdict case over the same real config, real `countTokens` and real project fixture: an oversized working set returns `isCalculateAffordabilityOverBudgetReturn` carrying a `finalTargetThreshold` at or below the window and a positive `balanceAfterCompression`, and no RAG or wallet collaborator is constructed at all.
      * `[✅]`   The provider-to-consumer chain that block proved — affordability verdict through real compression to a rewritten working set — is `prepareModelJob`'s to prove once it composes the two, and its node carries the integration test that does so. This suite keeps only what crosses this function's own boundary.
      * `[✅]`   The suite continues to mock only Supabase, and the `compressPrompt`, `CompressPromptDeps`, `BoundCompressPromptFn`, `ICompressionStrategy`, `CompressionCandidate`, `MockRagService`, `EmbeddingClient`, `getMockAiProviderAdapter`, `UserTokenWalletService` and `AdminTokenWalletService` imports are deleted.
      * `[✅]`   Each surviving case's expected token counts are recomputed against the real tokenizer the implementation now builds, rather than against the character-counting literal it retired.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module drops its imports of `compressPrompt`'s interface, guard and mock, of `ICompressionStrategy`, of `RelevanceRule` and of the Supabase client types, and adds only the two tokenizer packages and the shared encoding guard the implementation calls.
      * `[✅]`   `calculateAffordability.provides.ts` re-exports this module's implementation, interface, guard and mock with `export *` and `export type *`, so the renamed flavors, the new guards and the new mock symbols reach consumers without an edit to that file, and the retired ones leave it the moment they leave their source. `isUserConfig` reaches `enqueueModelCall.guard.ts` through that same surface, unchanged.
      * `[✅]`   No cycle: `compressPrompt` imports nothing from this module, and after this node neither imports the other.

   * `[✅]`   `requirements`
      * `[✅]`   `CalculateAffordabilityDeps` declares three members and `compressPrompt` is not among them — interface test, exhaustive key record.
      * `[✅]`   `CalculateAffordabilityParams` declares two members (`walletBalance`, `userConfig`) with no scalar that duplicates a field on the job row or `extendedModelConfig` — interface test, exhaustive key record.
      * `[✅]`   `CalculateAffordabilityPayload` declares five members (`extendedModelConfig`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `systemInstruction`) with `compressionStrategy` and `chatApiRequest` absent — interface test, exhaustive key record.
      * `[✅]`   `CalculateAffordabilityReturn` has exactly two arms, and both success flavors are members of `CalculateAffordabilitySuccessReturn` — interface test, typed assignment.
      * `[✅]`   An over-window request returns `overBudget: true` carrying the solver's `finalTargetThreshold` and `balanceAfterCompression` and the initial token count — unit test and integration test.
      * `[✅]`   A within-window request returns `overBudget: false` carrying the same `maxOutputTokens` and `resolvedInputTokenCount` it returns today — unit test, existing cases restated.
      * `[✅]`   Every existing affordability error — both `context_window_tokens` checks, `provider_max_input_tokens`, both `ContextWindowError` window checks, every NSF check, both rationality checks and the infeasible-target check — returns exactly the error and flag it returns now — unit test, existing cases unchanged.
      * `[✅]`   An oversized request with unidentified documents, and one with no `inputsRelevance`, each return the over-budget verdict rather than an error — unit test.
      * `[✅]`   The function calls no collaborator other than `deps.countTokens` and `deps.getMaxOutputTokens`, and performs no write on any path — unit test.
      * `[✅]`   A fixed string counted through the implementation's own `tokenizerDeps` on a `cl100k_base` model yields the tiktoken count rather than its character length — integration test.
      * `[✅]`   Every owned object type has a `Partial<T>`-overrides builder and an `unknown`-returning invalidator, and each owned function type has a function mock that is that type exactly — guard test, whose fixtures are drawn from them.

* `[✅]`   supabase/functions/chat/streamChat/StreamChat.ts **[BE] Narrow `StreamChatDeps.countTokens` from `CountTokensFn` to `BoundCountTokensFn`, eliminating the inline fake tokenizer construction**

   * `[✅]`   `objective`
      * `[✅]`   `StreamChat.ts` constructs a `CountTokensDeps` literal at `:144-150` with two fake implementations: `getEncoding` returns a character-indexing encoder (`Array.from(input).map((_, i) => i)`), and `countTokensAnthropic` returns `text.length`. Both are character counts, not token counts. The constructed `tokenizerDeps` is passed as the first argument to `deps.countTokens(tokenizerDeps, {...}, modelConfig)` at `:176`. This makes every token estimate on the chat path read high by a factor of ~4× for English text, misclassifying affordable requests as over the window limit or triggering a false `Insufficient token balance` error.
      * `[✅]`   Functional goals:
         * `[✅]`   `StreamChatDeps.countTokens` changes from `CountTokensFn` (unbound, requires `CountTokensDeps` as first argument) to `BoundCountTokensFn` (deps already bound by the caller). The type is imported from `_shared/types/tokenizer.types.ts`.
         * `[✅]`   The inline `CountTokensDeps` construction at `StreamChat.ts:144-150` is deleted. The `CountTokensDeps` import in `StreamChat.ts:7` is deleted.
         * `[✅]`   The call site at `StreamChat.ts:176` changes from `countTokensFn(tokenizerDeps, {...}, modelConfig)` to `countTokensFn({...}, modelConfig)` — dropping the first argument.
         * `[✅]`   No other line of the function body changes. The token-counting result, the affordability checks, the adapter call, the debit, the streaming, and every error path are preserved.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No file outside `chat/streamChat/` is edited. The consumer that assembles `StreamChatDeps` (`streamRequest.ts:125-133`) must update its `countTokens` field to supply a `BoundCountTokensFn`; that change belongs to `streamRequest`'s node.
         * `[✅]`   Each goal is proven by a named case in this node's interface test or unit test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an existing app-layer chat function whose tokenizer dependency is narrowed from unbound to bound, eliminating the inline fake construction.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not change how the caller (`streamRequest`) assembles deps — that is the caller's node.
         * `[✅]`   Do not change the affordability logic, the adapter call, the debit, the RPC, or the SSE streaming.
         * `[✅]`   Do not refactor `StreamChat` to route through `prepareModelJob` — the chat path is separate from the worker path.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/chat/streamChat` — the existing SSE chat streaming function.
      * `[✅]`   Inside boundary: the dep type change and the deleted inline tokenizer construction.
      * `[✅]`   Outside boundary: who binds the real tokenizer deps and how — that is the caller's responsibility (`streamRequest`).

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/tokenizer.types.ts` (`BoundCountTokensFn` — replaces `CountTokensFn`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the new dep type for `countTokens`, with `CountTokensDeps` already bound by the caller.
      * `[✅]`   All other existing deps (`logger`, `adminTokenWalletService`, `debitTokens`, `createErrorResponse`, `findOrCreateChat`, `constructMessageHistory`, `getMaxOutputTokens`) are unchanged.
      * `[✅]`   Removed dep: `CountTokensDeps` is no longer imported in `StreamChat.ts`.
      * `[✅]`   Confirm: no reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `context_slice`
      * `[✅]`   `countTokens: BoundCountTokensFn` — `(payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number` with the tokenizer deps already closed over by the caller.

   * `[✅]`   streamChat/`streamChat.interface.test.ts`
      * `[✅]`   Add a typed-assignment test proving `BoundCountTokensFn` is assignable to `StreamChatDeps['countTokens']`: `declare const fn: BoundCountTokensFn; const check: StreamChatDeps['countTokens'] = fn;`. The existing contract tests at `:22-44` that assert `typeof deps.countTokens, "function"` remain valid and are not edited.

   * `[✅]`   streamChat/`streamChat.interface.ts`
      * `[✅]`   Replace the `CountTokensFn` import (`:5`) with `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts`.
      * `[✅]`   Change `countTokens: CountTokensFn` to `countTokens: BoundCountTokensFn` in `StreamChatDeps` (`:23`).

   * `[✅]`   streamChat/`streamChat.mock.ts`
      * `[✅]`   Update `buildContractStreamChatDeps` (`:43-56`) to supply a `BoundCountTokensFn` for `countTokens`. The current builder imports the unbound `countTokens` from `tokenizer_utils.ts` and passes it directly; replace with a bound closure that wraps `countTokens` with a test-appropriate `CountTokensDeps` (import `buildTokenizerDeps` from `_shared/utils/tokenizer_utils.mock.ts` if it exists, or construct inline with the mock's own fake implementations — this is a test fixture, not production code).
      * `[✅]`   Update `buildStreamChatDepsTokenLimitExceeded` (`:388-398`) — its inline `countTokens` override currently takes `(_deps: CountTokensDeps, _payload: CountableChatPayload, _modelConfig: AiModelExtendedConfig)` (3 args); change to `(_payload: CountableChatPayload, _modelConfig: AiModelExtendedConfig)` (2 args) to match `BoundCountTokensFn`.
      * `[✅]`   The `CountTokensDeps` import (`:24`) is removed once no builder references it.
      * `[✅]`   The `buildStreamChatDepsMissingCountTokens` invalidator is unchanged — it omits the key regardless of type.

   * `[✅]`   streamChat/`StreamChat.ts`
      * `[✅]`   Delete the `import type { CountTokensDeps }` at `:7`.
      * `[✅]`   Delete the inline `tokenizerDeps` construction at `:144-150` (the seven lines from `const tokenizerDeps: CountTokensDeps = {` through the closing `};`).
      * `[✅]`   Change the `countTokensFn(tokenizerDeps, {...}, modelConfig)` call at `:176` to `countTokensFn({...}, modelConfig)` — dropping the first argument. The second and third arguments (the `CountableChatPayload` object and `modelConfig`) are unchanged.
      * `[✅]`   No other change. All behavior, logging, error paths, and SSE streaming are preserved.

   * `[✅]`   streamChat/`streamChat.integration.test.ts`
      * `[✅]`   Update `buildStreamChatDepsForIntegration` (`:17-31`) to supply a `BoundCountTokensFn` for `countTokens`. The current function passes the unbound `countTokens` from `tokenizer_utils.ts`; wrap it with real `CountTokensDeps` bound from the same module (import `buildTokenizerDeps` or inline the construction). The existing integration test cases are unchanged in structure — only the deps builder changes.

   * `[✅]`   `directionality`
      * `[✅]`   Layer: app-layer chat module (`chat/streamChat`). Deps inward: `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts` replaces `CountTokensFn`; all other deps unchanged. Provides outward to `streamRequest` (the consumer that assembles `StreamChatDeps`).
      * `[✅]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `requirements`
      * `[✅]`   `StreamChatDeps.countTokens` is typed `BoundCountTokensFn`, not `CountTokensFn`.
      * `[✅]`   No inline `CountTokensDeps` construction exists in `StreamChat.ts`.
      * `[✅]`   The `countTokens` call site passes two arguments (`payload`, `modelConfig`), not three.
      * `[✅]`   All existing unit test cases pass with the updated mock builders.
      * `[✅]`   All existing integration test cases pass with the updated bound tokenizer.
      * `[✅]`   The guard is unchanged — `typeof` check is type-invariant.


* `[✅]`   supabase/functions/chat/streamRewind/streamRewind.ts **[BE] Replace the inline fake tokenizer with a bound `BoundCountTokensFn`, so the chat rewind path uses a real token count instead of `text.length` character-counting**

   * `[✅]`   `objective`
      * `[✅]`   `streamRewind.ts` constructs `CountTokensDeps` inline at `:162-168` with two fake implementations: `getEncoding` returns a character-indexing encoder (`Array.from(input).map((_, i) => i)`), and `countTokensAnthropic` returns `text.length`. Both are character counts, not token counts. The constructed `tokenizerDeps` is passed as the first argument to `deps.countTokens(tokenizerDeps, {...}, modelConfig)` at `:183`. This makes every token estimate on the rewind path read high by a factor of ~4× for English text, misclassifying affordable requests as over the window limit (`:199-211`) or insufficient balance (`:221-231`).
      * `[✅]`   Functional goals:
         * `[✅]`   `StreamRewindDeps.countTokens` changes from `CountTokensFn` (unbound, requires `CountTokensDeps` as first argument) to `BoundCountTokensFn` (deps already bound by the caller). The type is imported from `_shared/types/tokenizer.types.ts`.
         * `[✅]`   The inline `CountTokensDeps` construction at `streamRewind.ts:162-168` is deleted. The `CountTokensDeps` import in `streamRewind.ts:10` is deleted.
         * `[✅]`   The call site at `streamRewind.ts:183` changes from `countTokensFn(tokenizerDeps, {...}, modelConfig)` to `countTokensFn({...}, modelConfig)` — dropping the first argument.
         * `[✅]`   No other line of the function body changes. The token-counting result, the affordability checks, the adapter call, the debit, the streaming, and every error path are preserved.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No file outside `chat/streamRewind/` is edited. The consumer that assembles `StreamRewindDeps` (`streamRequest.ts:97-103`) must update its `countTokens` field to supply a `BoundCountTokensFn`; that change belongs to `streamRequest`'s node.
         * `[✅]`   Each goal is proven by a named case in this node's interface test or unit test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an existing app-layer chat function whose tokenizer dependency is narrowed from unbound to bound, eliminating the inline fake construction.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not change how the caller (`streamRequest`) assembles deps — that is the caller's node.
         * `[✅]`   Do not change the affordability logic, the adapter call, the debit, the RPC, or the SSE streaming.
         * `[✅]`   Do not refactor `streamRewind` to route through `prepareModelJob` — the chat path is separate from the worker path.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/chat/streamRewind` — the existing chat-rewind SSE function.
      * `[✅]`   Inside boundary: the dep type change and the deleted inline tokenizer construction.
      * `[✅]`   Outside boundary: who binds the real tokenizer deps and how — that is the caller's responsibility (`streamRequest`).

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/tokenizer.types.ts` (`BoundCountTokensFn` — replaces `CountTokensFn`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the new dep type for `countTokens`, with `CountTokensDeps` already bound by the caller.
      * `[✅]`   All other existing deps (`logger`, `adminTokenWalletService`, `debitTokens`, `createErrorResponse`, `getMaxOutputTokens`) are unchanged.
      * `[✅]`   Removed dep: `CountTokensDeps` is no longer imported in `streamRewind.ts`.
      * `[✅]`   Confirm: no reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `context_slice`
      * `[✅]`   `countTokens: BoundCountTokensFn` — `(payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number` with the tokenizer deps already closed over by the caller.

   * `[✅]`   streamRewind/`streamRewind.interface.test.ts`
      * `[✅]`   Add a typed-assignment test proving `BoundCountTokensFn` is assignable to `StreamRewindDeps['countTokens']`: `declare const fn: BoundCountTokensFn; const check: StreamRewindDeps['countTokens'] = fn;`. The existing contract tests at `:18-39` that assert `typeof deps.countTokens, "function"` remain valid and are not edited.

   * `[✅]`   streamRewind/`streamRewind.interface.ts`
      * `[✅]`   Replace the `CountTokensFn` import (`:11`) with `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts`.
      * `[✅]`   Change `countTokens: CountTokensFn` to `countTokens: BoundCountTokensFn` in `StreamRewindDeps` (`:19`).

   * `[✅]`   streamRewind/`streamRewind.mock.ts`
      * `[✅]`   Update `buildContractStreamRewindDeps` (`:35-46`) to supply a `BoundCountTokensFn` for `countTokens`. The current builder imports the unbound `countTokens` from `tokenizer_utils.ts` and passes it directly; replace with a bound closure that wraps `countTokens` with a test-appropriate `CountTokensDeps` (import `buildTokenizerDeps` from `_shared/utils/tokenizer_utils.mock.ts` if it exists, or construct inline with the mock's own fake implementations — this is a test fixture, not production code).
      * `[✅]`   Update `buildStreamRewindUnitDepsWithFreshAdmin` (`:225-241`) and `buildStreamRewindDepsInsufficientBalance` (`:243-255`) — both derive from `buildContractStreamRewindDeps`, so the change propagates through the spread.
      * `[✅]`   The `buildStreamRewindDepsMissingCountTokens` invalidator (`:79-86`) is unchanged — it omits the key regardless of type.

   * `[✅]`   streamRewind/`streamRewind.ts`
      * `[✅]`   Delete the `import type { CountTokensDeps }` at `:10`.
      * `[✅]`   Delete the inline `tokenizerDeps` construction at `:162-168` (the six lines from `const tokenizerDeps: CountTokensDeps = {` through the closing `};`).
      * `[✅]`   Change the `countTokensFn(tokenizerDeps, {...}, modelConfig)` call at `:183-191` to `countTokensFn({...}, modelConfig)` — dropping the first argument. The second and third arguments (the `CountableChatPayload` object and `modelConfig`) are unchanged.
      * `[✅]`   No other change. All behavior, logging, error paths, and SSE streaming are preserved.

   * `[✅]`   streamRewind/`streamRewind.integration.test.ts`
      * `[✅]`   Update `buildStreamRewindDepsForIntegration` (`:15-27`) to supply a `BoundCountTokensFn` for `countTokens`. The current function passes the unbound `countTokens` from `tokenizer_utils.ts`; wrap it with real `CountTokensDeps` bound from the same module (import `buildTokenizerDeps` or inline the construction). The three integration test cases (`:54-85`, `:87-121`, `:123-156`) are unchanged in structure — only the deps builder changes.

   * `[✅]`   `directionality`
      * `[✅]`   Layer: app-layer chat module (`chat/streamRewind`). Deps inward: `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts` replaces `CountTokensFn`; all other deps unchanged. Provides outward to `streamRequest` (the consumer that assembles `StreamRewindDeps`).
      * `[✅]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `requirements`
      * `[✅]`   `StreamRewindDeps.countTokens` is typed `BoundCountTokensFn`, not `CountTokensFn`.
      * `[✅]`   No inline `CountTokensDeps` construction exists in `streamRewind.ts`.
      * `[✅]`   The `countTokens` call site passes two arguments (`payload`, `modelConfig`), not three.
      * `[✅]`   All existing unit test cases pass with the updated mock builders.
      * `[✅]`   All existing integration test cases pass with the updated bound tokenizer.
      * `[✅]`   The guard is unchanged — `typeof` check is type-invariant.

* `[✅]`   supabase/functions/chat/streamRequest/streamRequest.ts **[BE] Narrow `StreamRequestDeps.countTokens` from `CountTokensFn` to `BoundCountTokensFn`, a pure pass-through type change with no implementation edit**

   * `[✅]`   `objective`
      * `[✅]`   `streamRequest.ts` copies `deps.countTokens` into `rewindDeps.countTokens` (`:100`) and `chatDeps.countTokens` (`:128`). Both consumers — `StreamRewindDeps` and `StreamChatDeps` — have narrowed their `countTokens` member from `CountTokensFn` to `BoundCountTokensFn` in their respective nodes. `StreamRequestDeps.countTokens` still declares `CountTokensFn`, so the pass-through compiles today only because the unbound type is assignable to the bound type's call sites. The interface must narrow to match its consumers and the composition root above it (`chat/index.ts`), which will supply a `BoundCountTokensFn`.
      * `[✅]`   Functional goals:
         * `[✅]`   `StreamRequestDeps.countTokens` changes from `CountTokensFn` (unbound, requires `CountTokensDeps` as first argument) to `BoundCountTokensFn` (deps already bound by the composition root). The type is imported from `_shared/types/tokenizer.types.ts`.
         * `[✅]`   No line of `streamRequest.ts` changes. The pass-through assignments at `:100` and `:128` remain valid because both consumer dep types already expect `BoundCountTokensFn`.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No file outside `chat/streamRequest/` is edited. The composition root (`chat/index.ts`) that assembles `StreamRequestDeps` must update its `countTokens` field to supply a `BoundCountTokensFn`; that change belongs to `chat/index.ts`'s node.
         * `[✅]`   Each goal is proven by a named case in this node's interface test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an existing app-layer chat orchestrator whose tokenizer dependency type is narrowed from unbound to bound, aligning it with the consumers it passes through to.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not change how the composition root (`chat/index.ts`) assembles deps — that is the composition root's node.
         * `[✅]`   Do not change any branch, error path, or pass-through logic in `streamRequest.ts`.
         * `[✅]`   Do not edit `streamChat` or `streamRewind`; they have their own nodes.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/chat/streamRequest` — the existing chat orchestrator that routes to StreamChat or StreamRewind.
      * `[✅]`   Inside boundary: the dep type change on the interface.
      * `[✅]`   Outside boundary: who binds the real tokenizer deps and how — that is the composition root's responsibility (`chat/index.ts`).

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/tokenizer.types.ts` (`BoundCountTokensFn` — replaces `CountTokensFn`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the new dep type for `countTokens`, with `CountTokensDeps` already bound by the composition root.
      * `[✅]`   All other existing deps (`logger`, `adminTokenWalletService`, `getAiProviderAdapter`, `prepareChatContext`, `streamChat`, `streamRewind`, `createErrorResponse`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory`) are unchanged.
      * `[✅]`   Confirm: no reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `context_slice`
      * `[✅]`   `countTokens: BoundCountTokensFn` — `(payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number` with the tokenizer deps already closed over by the composition root.

   * `[✅]`   streamRequest/`streamRequest.interface.test.ts`
      * `[✅]`   Add a typed-assignment test proving `BoundCountTokensFn` is assignable to `StreamRequestDeps['countTokens']`: `declare const fn: BoundCountTokensFn; const check: StreamRequestDeps['countTokens'] = fn;`. The existing contract tests at `:30-48` that assert `typeof deps.countTokens, "function"` remain valid and are not edited.

   * `[✅]`   streamRequest/`streamRequest.interface.ts`
      * `[✅]`   Replace the `CountTokensFn` import (`:6`) with `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts`.
      * `[✅]`   Change `countTokens: CountTokensFn` to `countTokens: BoundCountTokensFn` in `StreamRequestDeps` (`:24`).

   * `[✅]`   streamRequest/`streamRequest.integration.test.ts`
      * `[✅]`   Update the three `StreamRequestDeps` literals (`:407-420`, `:500-513`, `:585-598`) to supply a `BoundCountTokensFn` for `countTokens`. Each currently passes the unbound `countTokens` from `tokenizer_utils.ts` (imported at `:25`); wrap it with real `CountTokensDeps` bound from the same module (import `buildTokenizerDeps` or inline the construction). The three integration test cases are unchanged in structure — only the deps builder lines change.

   * `[✅]`   `directionality`
      * `[✅]`   Layer: app-layer chat orchestrator (`chat/streamRequest`). Deps inward: `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts` replaces `CountTokensFn`; all other deps unchanged. Provides outward to `chat/index.ts` (the composition root that assembles `StreamRequestDeps`).
      * `[✅]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `requirements`
      * `[✅]`   `StreamRequestDeps.countTokens` is typed `BoundCountTokensFn`, not `CountTokensFn`.
      * `[✅]`   No line of `streamRequest.ts` is changed — the pass-through is type-compatible.
      * `[✅]`   The mock auto-follows: `buildContractStreamRequestDeps` and `buildStreamRequestDepsWithPathHandlers` both delegate `countTokens` to `buildContractStreamChatDeps()`, which already supplies `BoundCountTokensFn` after the StreamChat node.
      * `[✅]`   All existing unit test cases pass without modification.
      * `[✅]`   All existing integration test cases pass with the updated bound tokenizer in the deps literals.
      * `[✅]`   The guard is unchanged — `typeof` check is type-invariant.

* `[✅]`   supabase/functions/chat/index.ts **[BE] Bind real `CountTokensDeps` at the chat composition root and narrow `ChatDeps.countTokens` from `CountTokensFn` to `BoundCountTokensFn`**

   * `[✅]`   `objective`
      * `[✅]`   `chat/index.ts` is the chat composition root. Every consumer below it — `streamRequest`, `StreamRewind`, `StreamChat` — has narrowed its `countTokens` dep from `CountTokensFn` to `BoundCountTokensFn`, but the composition root still imports the unbound `countTokens` from `tokenizer_utils.ts` and passes it directly into `defaultDeps` as a `CountTokensFn`. The interface declares `ChatDeps.countTokens: CountTokensFn`, which requires every consumer to receive the unbound function and construct its own `CountTokensDeps` inline — the construction this workstream is eliminating.
      * `[✅]`   Functional goals:
         * `[✅]`   `ChatDeps.countTokens` changes from `CountTokensFn` to `BoundCountTokensFn`.
         * `[✅]`   `index.ts` imports the real tokenizer packages (`countTokens as countTokensAnthropic` from `npm:@anthropic-ai/tokenizer@0.0.4`, `getEncoding as rawGetEncoding` from `npm:js-tiktoken@1.0.7`), imports `isKnownTiktokenEncoding` from `_shared/utils/type-guards/type_guards.chat.ts`, imports `countTokens` from `_shared/utils/tokenizer_utils.ts` (unchanged), and imports `CountTokensDeps` and `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts`.
         * `[✅]`   `defaultDeps.countTokens` is a `BoundCountTokensFn` closure that captures the real `CountTokensDeps` — a guarded `getEncoding` wrapper (validates encoding name with `isKnownTiktokenEncoding` before calling `rawGetEncoding`), the real `countTokensAnthropic`, and the existing `logger` — and calls the unbound `countTokens` with those deps bound as the first argument.
         * `[✅]`   The `CountTokensFn` import is removed from `index.interface.ts`; `BoundCountTokensFn` is imported instead.
         * `[✅]`   No line of `handler()`, `createChatServiceHandler()`, or `serve()` changes. The `streamDeps.countTokens = deps.countTokens` pass-through remains valid because `StreamRequestDeps.countTokens` already expects `BoundCountTokensFn` after the `streamRequest` node.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No file outside `chat/` is edited. The tokenizer packages, `tokenizer_utils.ts`, and the type-guard module are consumed as-is.
         * `[✅]`   Each goal is proven by a named case in this node's interface test.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer composition root: the one place in the chat path that has access to the real external tokenizer packages and can construct the real `CountTokensDeps`, bind it once, and hand the bound function to every consumer below.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not change `streamRequest`, `StreamRewind`, `StreamChat`, or any other consumer — they have their own nodes.
         * `[✅]`   Do not change `handler()` logic, `createChatServiceHandler()` logic, or `serve()` logic.
         * `[✅]`   Do not change the unbound `countTokens` function in `tokenizer_utils.ts`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/chat` — the composition root that wires real deps and hands them to the chat orchestrator.
      * `[✅]`   Inside boundary: the binding of real `CountTokensDeps` into a `BoundCountTokensFn` closure, and the type narrowing on `ChatDeps`.
      * `[✅]`   Outside boundary: what `countTokens` does with those deps — that is `tokenizer_utils.ts`'s concern. What consumers do with the bound function — that is each consumer's node.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/tokenizer.types.ts` (`BoundCountTokensFn`, `CountTokensDeps` — replaces `CountTokensFn`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the new dep type for `ChatDeps.countTokens`, and the deps object shape needed to construct the binding.
      * `[✅]`   Provider: `npm:@anthropic-ai/tokenizer@0.0.4` (`countTokens as countTokensAnthropic`).
         * `[✅]`   Layer classification: external package (adapter boundary).
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: real Anthropic token counter, one of three `CountTokensDeps` members.
      * `[✅]`   Provider: `npm:js-tiktoken@1.0.7` (`getEncoding as rawGetEncoding`).
         * `[✅]`   Layer classification: external package (adapter boundary).
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: real tiktoken encoding factory, one of three `CountTokensDeps` members.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.chat.ts` (`isKnownTiktokenEncoding`).
         * `[✅]`   Layer classification: shared utility.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: validates encoding name before passing to `rawGetEncoding`.
      * `[✅]`   Provider: `_shared/utils/tokenizer_utils.ts` (`countTokens` — the unbound `CountTokensFn`).
         * `[✅]`   Layer classification: shared utility.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the function whose first argument is bound by the closure.
      * `[✅]`   All other existing deps (`logger`, `adminTokenWalletService`, `userTokenWalletService`, `streamRequest`, `handleCorsPreflightRequest`, `createSuccessResponse`, `createErrorResponse`, `prepareChatContext`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory`, `getAiProviderAdapter`) are unchanged.
      * `[✅]`   Confirm: no reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `context_slice`
      * `[✅]`   `countTokens: BoundCountTokensFn` — `(payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number` with the tokenizer deps already closed over by `defaultDeps` construction.

   * `[✅]`   chat/`index.interface.test.ts`
      * `[✅]`   The existing interface test proves the surface and return union for `ChatDeps`, `ChatParams`, `ChatPayload`, `ChatSuccess`, `ChatError`, `ChatReturn`, `ChatFn`. The only change in this node is: the surface record for `ChatDeps` continues to list `countTokens: true` (already present), and a new typed-assignment block proves `BoundCountTokensFn` is assignable to `ChatDeps['countTokens']`.
      * `[✅]`   Import `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts` and `ChatDeps` from `./index.interface.ts`.
      * `[✅]`   New block: `const fn: BoundCountTokensFn = (_p, _m) => 0; const check: ChatDeps['countTokens'] = fn;` — typed assignment proving the narrowed member accepts the bound type.

   * `[✅]`   chat/`index.interface.ts`
      * `[✅]`   Replace the `CountTokensFn` import with `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts`.
      * `[✅]`   Change `countTokens: CountTokensFn` to `countTokens: BoundCountTokensFn` in `ChatDeps`.

   * `[✅]`   chat/`index.mock.ts`
      * `[✅]`   If a mock file exists, update the `countTokens` builder to supply a `BoundCountTokensFn` — `(_payload, _modelConfig) => 42` — instead of a `CountTokensFn`. If no mock file exists, the existing `defaultDeps` in `index.ts` serves as the production wiring and no new mock file is created.

   * `[✅]`   `interaction.spec`
      * `[✅]`   No branch logic changes. The only behavioral change is in `defaultDeps` construction:
         * `[✅]`   Condition: module load (top-level `const defaultDeps`).
         * `[✅]`   Decision: none — unconditional construction.
         * `[✅]`   Dependency call: `countTokens` (from `tokenizer_utils.ts`) is wrapped in a closure that supplies real `CountTokensDeps` — `{ getEncoding: guardedGetEncoding, countTokensAnthropic, logger }` — as the first argument.
         * `[✅]`   Outcome: `defaultDeps.countTokens` is a `BoundCountTokensFn`.
      * `[✅]`   All existing branches in `handler()`, `createChatServiceHandler()`, and `serve()` are unchanged. The `deps.countTokens` pass-through into `streamDeps` carries the bound function without modification.

   * `[✅]`   chat/`index.test.ts`
      * `[✅]`   Update any test that constructs a `ChatDeps` literal to supply a `BoundCountTokensFn` for `countTokens` instead of a `CountTokensFn`. The function mock changes from `(_deps, _payload, _modelConfig) => 0` to `(_payload, _modelConfig) => 0` — dropping the first argument.
      * `[✅]`   No new test cases are required; the branch contract is unchanged.

   * `[✅]`   chat/`index.ts`
      * `[✅]`   Add imports: `import { countTokens as countTokensAnthropic } from "npm:@anthropic-ai/tokenizer@0.0.4";` and `import { getEncoding as rawGetEncoding } from "npm:js-tiktoken@1.0.7";` and `import { isKnownTiktokenEncoding } from "../_shared/utils/type-guards/type_guards.chat.ts";` and `import type { CountTokensDeps } from "../_shared/types/tokenizer.types.ts";`.
      * `[✅]`   The existing `import { countTokens } from "../_shared/utils/tokenizer_utils.ts";` is unchanged — it is the unbound function being wrapped.
      * `[✅]`   Construct the bound closure before `defaultDeps`:
         ```
         const boundCountTokens: BoundCountTokensFn = (payload, modelConfig) =>
           countTokens(
             {
               getEncoding: (encodingName: string) => {
                 if (!isKnownTiktokenEncoding(encodingName)) {
                   throw new Error(`Unknown tiktoken encoding: ${encodingName}`);
                 }
                 return rawGetEncoding(encodingName);
               },
               countTokensAnthropic,
               logger,
             },
             payload,
             modelConfig,
           );
         ```
      * `[✅]`   Change `defaultDeps.countTokens` from `countTokens: countTokens,` to `countTokens: boundCountTokens,`.
      * `[✅]`   Import `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts` (type-only import alongside `CountTokensDeps`).
      * `[✅]`   No other change. All behavior, error paths, CORS handling, auth, DELETE, and streaming are preserved.

   * `[✅]`   chat/`index.provides.ts`
      * `[✅]`   If a provides file exists, no change is needed — the public surface re-exports from `index.ts` and `index.interface.ts`, and the type change propagates automatically. If no provides file exists, do not create one; the composition root is consumed by `serve()` internally, not by external modules.

   * `[✅]`   `directionality`
      * `[✅]`   Layer: app-layer chat composition root (`chat/`). Deps inward: `BoundCountTokensFn` and `CountTokensDeps` from `_shared/types/tokenizer.types.ts` replace `CountTokensFn`; `countTokensAnthropic` from `npm:@anthropic-ai/tokenizer@0.0.4`; `rawGetEncoding` from `npm:js-tiktoken@1.0.7`; `isKnownTiktokenEncoding` from `_shared/utils/type-guards/type_guards.chat.ts`; `countTokens` from `_shared/utils/tokenizer_utils.ts` (existing). Provides outward: `ChatDeps.countTokens` is now `BoundCountTokensFn`, consumed by `streamRequest` via `streamDeps` assembly.
      * `[✅]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[✅]`   `requirements`
      * `[✅]`   `ChatDeps.countTokens` is typed `BoundCountTokensFn`, not `CountTokensFn`.
      * `[✅]`   `defaultDeps.countTokens` is a closure that binds real `CountTokensDeps` — guarded `getEncoding`, real `countTokensAnthropic`, real `logger` — and calls the unbound `countTokens` with those deps as the first argument.
      * `[✅]`   The `CountTokensFn` import no longer appears in `index.interface.ts`.
      * `[✅]`   No line of `handler()`, `createChatServiceHandler()`, or `serve()` is changed.
      * `[✅]`   The `streamDeps.countTokens = deps.countTokens` pass-through compiles because `StreamRequestDeps.countTokens` is `BoundCountTokensFn`.
      * `[✅]`   All existing unit test cases pass with the updated mock (two-argument function instead of three).
      * `[✅]`   The binding pattern matches the existing `processJob.ts` composition root — guarded `getEncoding`, real `countTokensAnthropic`, real `logger`.

* `[✅]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts **[BE] Become the single model-call dispatcher: select the arm on the job row's `job_type` and narrow with that arm's guard, compose `calculateAffordability` with `compressPrompt`, branch the recursion guard on the same column, move `job` and `providerRow` to payload, eliminate `projectOwnerUserId` (KVP dup of `job.user_id`), drop `sessionData`/`authToken` and `compressionStrategy`, write `source_prompt_resource_id` onto the job payload before enqueue, and propagate the deferral as `PrepareModelJobPendingReturn`**

   * `[✅]`   `objective`
      * `[✅]`   Solve a dispatcher that only dispatches for one job type. Every model call the repo makes should resolve the same tier cap from `user_subscriptions`, read the same wallet balance and pass the same affordability preflight, and today only an EXECUTE job reaches that path: `processCompressJob` builds its own `ChatApiRequest`, counts its own preflight tokens and calls `enqueueModelCall` itself, so a COMPRESS call is governed by neither the tier cap nor the wallet check. Compression, affordability and dispatch are also fused — the over-budget remedy is taken inside `calculateAffordability`, which is why decision one's recursion guard has nowhere to sit except in whichever collaborator a caller withholds.
      * `[✅]`   Solve a payload proven by the wrong guard. The function reads `sessionId`, `projectId`, `model_id`, `walletId`, `stageSlug`, `iterationNumber`, `user_jwt`, `maxOutputTokens`, `continueUntilComplete` and `target_contribution_id`, and narrowing with the base guard leaves five of them optional and admits the empty string on four more, so hand-written presence-and-blank throws stand in for the check the guard should have made.
      * `[✅]`   Functional goals:
         * `[✅]`   The arm is selected by the job row's `job_type` column and the payload is narrowed by that arm's guard — `isDialecticExecuteJobPayload` for `'EXECUTE'`, `isDialecticCompressJobPayload` for `'COMPRESS'` — one selection, at entry, ahead of every read.
         * `[✅]`   `stageSlug`, `iterationNumber`, `sessionId`, `projectId`, `model_id` and `walletId` are proven by the arm guard, so the six hand-written throws that validate them are deleted and no member validation remains in the body.
         * `[✅]`   `PrepareModelJobParams` declares `dbClient` only. `job` and `providerRow` are data objects that belong in payload; `projectOwnerUserId` is a KVP duplicate of `payload.job.user_id`; `sessionData` and `authToken` are retired.
         * `[✅]`   `PrepareModelJobPayload` declares `job`, `providerRow`, `promptConstructionPayload`, `inputsRelevance?` and `inputsRequired?`, and no `compressionStrategy`.
         * `[✅]`   `PrepareModelJobDeps` gains `compressPrompt: BoundCompressPromptFn` beside `calculateAffordability`, so this function composes the two rather than letting one own the other.
         * `[✅]`   `tokenWalletService` is a required member of `PrepareModelJobDeps`, so the body performs no presence check on it.
         * `[✅]`   The return has exactly two arms. `PrepareModelJobSuccessReturn` is the union of `PrepareModelJobQueuedReturn { queued: true }` and `PrepareModelJobPendingReturn { waiting_for_children: true }`; `PrepareModelJobReturn` is that arm plus `PrepareModelJobErrorReturn`.
         * `[✅]`   On an over-budget verdict the function branches on `payload.job.job_type`: `'EXECUTE'` calls `deps.compressPrompt` and returns the pending flavor; `'COMPRESS'` returns a non-retriable error naming the recursion guard, and calls no collaborator.
         * `[✅]`   Nothing passed to `deps.enqueueModelCall` names an artifact type, that parameter having left `EnqueueModelCallParams`.
         * `[✅]`   After affordability resolves within budget and before the enqueue, the function writes `source_prompt_resource_id` from `payload.promptConstructionPayload` onto the job row's own payload, and omits it from `ChatApiRequest`. A failed write returns the error arm.
         * `[✅]`   `prepareModelJob.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   The tier-cap read, the effective-cap arithmetic over `maxOutputTokens`, the provider-config validation, the resource-document scoping and the `inputsRequired` enforcement keep their current behavior, messages and log lines.
         * `[✅]`   The wallet read through `deps.tokenWalletService.getBalance`, `deps.validateWalletBalance` and `deps.validateModelCostRates` run exactly where they run now, for every job type.
         * `[✅]`   Every existing error message, `retriable` flag and thrown-then-caught path keeps its text and classification except where this node deletes the branch that raised it.
         * `[✅]`   The function keeps its `(deps, params, payload)` shape. `payload.job.payload` arrives as row data and is narrowed on entry by the arm guard, which throws its own per-member diagnostic; the surrounding `try` converts that throw to the error arm as it already does for every other throw in this body.
      * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test, inputsRequired test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer dispatch: given a job row and an assembled prompt, resolve the caps and the money, decide what an over-budget request warrants from what kind of job it is, and hand exactly one model call to the transport.
      * `[✅]`   The role is correct because this is the one place that holds both the job row and the assembled prompt. The row carries `job_type`, which is the authoritative record of what a job is, so both the payload arm and the recursion guard are read from a fact rather than inferred from a missing collaborator — and every model call passing through one function is what makes the tier cap, the wallet read and the affordability preflight single-sourced.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not decide whether a request is affordable; `calculateAffordability` returns that verdict and this function composes it.
         * `[✅]`   Do not select victims, size chunks, spawn COMPRESS children or set the parent's status; `compressPrompt` owns all of it, and this function propagates its outcome.
         * `[✅]`   Do not name an artifact type at dispatch, reintroduce `output_type` in any form, or decide what the response becomes; that is `saveResponse`'s from the row's `job_type`.
         * `[✅]`   Do not change the tier-cap query, the cap arithmetic, the document scoping or the `inputsRequired` rules.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/prepareModelJob` — cap resolution, wallet and rate resolution, the affordability composition, the over-budget branch, the prompt-provenance write, and the single call to the model-call transport.
      * `[✅]`   Inside boundary:
         * `[✅]`   What every model call must satisfy before it is dispatched, for every job type.
         * `[✅]`   What an over-budget request warrants, read from the job row's `job_type`.
         * `[✅]`   Which prompt produced the call, recorded on the job row before the call is made.
      * `[✅]`   Outside boundary:
         * `[✅]`   The affordability arithmetic, owned by `calculateAffordability`.
         * `[✅]`   The compression machine, owned by `compressPrompt`.
         * `[✅]`   The queue POST and the row's `queued` status, owned by `enqueueModelCall`.
         * `[✅]`   What the response becomes, owned by `saveResponse`.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `../compressPrompt/compressPrompt.provides.ts` (`BoundCompressPromptFn`, `isCompressPromptErrorReturn`, and `CompressPromptParams`/`CompressPromptPayload` in the implementation) — the module's only public surface, which that node's `provides` element publishes.
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: inbound, and new to this file — the edge moves here from `calculateAffordability`, which closed it in the node above, so the repo gains no edge it did not have.
         * `[✅]`   Purpose: make an over-budget EXECUTE working set fit, as a deferral this function propagates.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticExecuteJobPayload`).
         * `[✅]`   Layer classification: shared runtime boundary.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: narrow the row's payload on the EXECUTE arm and surface its per-member diagnostic on failure.
      * `[✅]`   Provider: `../enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`isDialecticCompressJobPayload`).
         * `[✅]`   Layer classification: sibling app-layer module that owns the COMPRESS payload and its guard.
         * `[✅]`   Direction: inbound; this module already imports `BoundCompressPromptFn` from a sibling in the same layer.
         * `[✅]`   Purpose: narrow the row's payload on the COMPRESS arm.
      * `[✅]`   Removed provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`) and `dialectic-service/dialectic.interface.ts` (`DialecticSessionRow`) in the interface, the guard and the implementation, with the members they typed.
      * `[✅]`   Confirm:
         * `[✅]`   `calculateAffordability` stays on deps and is called on every path; `enqueueModelCall`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `applyInputsRequiredScope` and `logger` are unchanged.
         * `[✅]`   No reverse dependency: neither `compressPrompt` nor `calculateAffordability` imports this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From `compressPrompt`: the bound function type and its error-return guard only.
         * `[✅]`   From the shared guard module: the EXECUTE payload guard only.
         * `[✅]`   From `enqueueCompressJobs`: the COMPRESS payload guard only.

   * `[✅]`   `prepareModelJob.interface.test.ts`
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof PrepareModelJobDeps, true>` over `logger`, `applyInputsRequiredScope`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `calculateAffordability`, `enqueueModelCall`, `compressPrompt`, asserting eight.
      * `[✅]`   A case proves the params surface the same way over `dbClient`, asserting one — exhaustive in both directions, it is the proof `job`, `projectOwnerUserId`, `providerRow`, `authToken` and `sessionData` are gone.
      * `[✅]`   A case proves the payload surface the same way over `job`, `providerRow`, `promptConstructionPayload`, `inputsRelevance` and `inputsRequired`, asserting five — proving `compressionStrategy` is not a member and `job`/`providerRow` are here rather than on params.
      * `[✅]`   A case proves the two-arm return by typed assignment: a `PrepareModelJobQueuedReturn` value and a `PrepareModelJobPendingReturn` value each assign to `PrepareModelJobSuccessReturn`, that assigns to `PrepareModelJobReturn`, and a `PrepareModelJobErrorReturn` value assigns to `PrepareModelJobReturn`.
      * `[✅]`   A case proves each flavor's members by typed literal: `{ queued: true }` and `{ waiting_for_children: true }`, neither carrying the other's discriminant.
      * `[✅]`   A case proves `PrepareModelJobFn` accepts the narrowed deps, params and payload and returns `Promise<PrepareModelJobReturn>`; the `PrepareModelJobExecutionError` case is unchanged.

   * `[✅]`   `prepareModelJob.interface.ts`
      * `[✅]`   `PrepareModelJobDeps` gains `compressPrompt: BoundCompressPromptFn`, imported from `../compressPrompt/compressPrompt.provides.ts`, and declares `tokenWalletService` required.
      * `[✅]`   `PrepareModelJobParams` drops `job`, `projectOwnerUserId`, `providerRow`, `authToken` and `sessionData`, and the `DialecticJobRow`, `DialecticSessionRow` and `Tables` imports those members required. Surviving member: `dbClient: SupabaseClient<Database>`.
      * `[✅]`   `PrepareModelJobPayload` drops `compressionStrategy` and the `ICompressionStrategy` import; gains `job: DialecticJobRow` and `providerRow: Tables<'ai_providers'>` (moved from params). `DialecticJobRow` is imported from `dialectic-service/dialectic.interface.ts`; `Tables` stays imported from `types_db.ts`.
      * `[✅]`   `PrepareModelJobSuccessReturn` becomes the union of `PrepareModelJobQueuedReturn { queued: true }` and `PrepareModelJobPendingReturn { waiting_for_children: true }`, both declared here; `PrepareModelJobReturn` is `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn`.
      * `[✅]`   `PrepareModelJobErrorReturn`, `PrepareModelJobFn` and `PrepareModelJobExecutionError` are unchanged.

   * `[✅]`   dialectic-service/`dialectic.interface.ts`
      * `[✅]`   `DialecticExecuteJobPayload` redeclares `stageSlug` and `iterationNumber` as required, narrowing the two members `GenerateContributionsPayload` declares optional and `DialecticBaseJobPayload` inherits, so a value narrowed by the EXECUTE guard carries both without a use-site presence test.

   * `[✅]`   `prepareModelJob.interaction.spec`
      * `[✅]`   Entry: the `user_subscriptions` → `tier_definitions(output_cap_tokens)` read for `payload.job.user_id`. A Postgrest error → log `[prepareModelJob] Failed to load tier output cap` and return `{ error: pgErr, retriable: true }`.
      * `[✅]`   Arm selection and narrowing, on `payload.job.job_type`, ahead of every payload read. `'EXECUTE'` declares a `DialecticExecuteJobPayload` local and narrows with `isDialecticExecuteJobPayload`; `'COMPRESS'` declares a `DialecticCompressJobPayload` local and narrows with `isDialecticCompressJobPayload`. Each narrowing takes the repo's landed form — the target-typed local, a `try`, the guard inside `if (!guard(payload.job.payload))` whose body is unreachable because the guard throws, and the assignment on the line below; copy `continueJob.ts`'s COMPRESS narrowing block. The throw carries a per-member diagnostic which the enclosing `try` converts to `{ error, retriable: false }`. The hand-thrown `Job … does not have a valid 'execute' payload.` is deleted, as is the `Object.getOwnPropertyDescriptor` read of `user_jwt` and its `payload.user_jwt required` throw.
      * `[✅]`   Cap resolution: the tier cap and the narrowed payload's `maxOutputTokens` combine by `Math.min` when both are present, the user value stands when the tier cap is null, and the result becomes `userConfig.tier_output_cap_tokens`, logged as it is now.
      * `[✅]`   Member validation: none. `stageSlug`, `walletId`, `iterationNumber`, `projectId`, `sessionId` and `model_id` are read from the narrowed payload, their six presence-and-blank throws and the diagnostic log block that precedes them deleted with the checks they described.
      * `[✅]`   Provider config: `isAiModelExtendedConfig(payload.providerRow.config)` false → `Model … has invalid or missing configuration.`; otherwise `model_id` is stamped onto the config as it is now.
      * `[✅]`   Document scoping, unchanged: each `payload.promptConstructionPayload.resourceDocuments` entry is checked with `isResourceDocument`, `deps.applyInputsRequiredScope` scopes them, and each required `inputsRequired` rule with a `document_key` must match a scoped document by `type`, `slug` and `document_key` or throw its existing message.
      * `[✅]`   Wallet and rates: `deps.tokenWalletService.getBalance(walletId)` through `deps.validateWalletBalance`, then `deps.validateModelCostRates` over the config's two rates. The `Token wallet service is required for affordability preflight` throw is deleted, the member being required on deps.
      * `[✅]`   Affordability: `deps.calculateAffordability` is called once with params `{ walletBalance, userConfig }` and payload `{ extendedModelConfig, resourceDocuments, conversationHistory, currentUserPrompt, systemInstruction }`. An error return → propagate `{ error, retriable }` unchanged.
      * `[✅]`   Over-budget branch, selected by the affordability success flavor's `overBudget: true`, within the arm already selected at entry:
         * `[✅]`   `'COMPRESS'` → return `{ error: <ProcessCompressJob-facing Error naming the recursion guard, the job id and the resolved input token count>, retriable: false }`. No collaborator is called, nothing is written, and the job fails rather than compressing, per decision one.
         * `[✅]`   `'EXECUTE'` → build `CompressPromptParams` with `{ dbClient: params.dbClient, isContinuationFlowInitial, finalTargetThreshold: affordResult.finalTargetThreshold, balanceAfterCompression: affordResult.balanceAfterCompression, walletBalance }` and `CompressPromptPayload` with `{ parentJob: payload.job, extendedModelConfig, inputsRelevance: payload.inputsRelevance, resourceDocuments, conversationHistory, currentUserPrompt }`. No `compressionStrategy`, `chatApiRequest` or `tokenizerDeps` — the scorer is `compressPrompt`'s own dep, the base request is this function's concern after compression succeeds, and the tokenizer is built by `compressPrompt`'s own implementation. Call `deps.compressPrompt` once.
         * `[✅]`   `isCompressPromptErrorReturn` → propagate `{ error, retriable }` unchanged.
         * `[✅]`   Otherwise → return `{ waiting_for_children: true }`. The dispatcher enqueues nothing on this branch: the parent job is waiting on its COMPRESS children, and the completion trigger runs this function again over the overlaid working set. Nothing the compression call returns is read.
      * `[✅]`   Within-budget branch, selected by `overBudget: false`: `chatApiRequest` is the base request plus `max_tokens_to_generate: affordResult.maxOutputTokens`, and `resolvedInputTokenCount` is the arm's own count.
      * `[✅]`   Provenance write, on the within-budget branch only, after affordability and before the enqueue: update this job row's `payload` with `source_prompt_resource_id` from `payload.promptConstructionPayload.source_prompt_resource_id`, keyed on `payload.job.id`. A Postgrest error → `{ error, retriable: true }`. The value is not placed on `ChatApiRequest`: the provider can do nothing with it, and the thread it belongs to is internal.
      * `[✅]`   Dispatch: build `EnqueueModelCallParams` from `params.dbClient`, `payload.job`, `payload.providerRow`, the narrowed payload's `user_jwt` as `userAuthToken`, and `userConfig` — no artifact type — and call `deps.enqueueModelCall` with `{ chatApiRequest, preflightInputTokens: resolvedInputTokenCount }`. An error return → propagate unchanged. Otherwise → `{ queued: true }`.
      * `[✅]`   Ordering and side effects: one arm selection, one tier-cap read, one wallet read, one affordability call, at most one compression call, at most one provenance write, at most one enqueue. The COMPRESS recursion guard and every validation failure write nothing. The provenance write never happens on a path that does not enqueue.
      * `[✅]`   The enclosing `try`/`catch` keeps its shape: any throw becomes `{ error, retriable: false }`.

   * `[✅]`   `prepareModelJob.mock.ts`
      * `[✅]`   Six owned object types, four symbols each, production-named: `PrepareModelJobDepsOverrides` / `buildPrepareModelJobDeps` / `PrepareModelJobDepsCorruptions` / `invalidatePrepareModelJobDeps`, and the same quartet for `PrepareModelJobParams`, `PrepareModelJobPayload`, `PrepareModelJobQueuedReturn`, `PrepareModelJobPendingReturn` and `PrepareModelJobErrorReturn`. Overrides types are `Partial<T>`, corruption types are `{ [K in keyof T]?: unknown }`, invalidators return `unknown`.
      * `[✅]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. `buildPrepareModelJobDeps` defaults `compressPrompt` to `mockBoundCompressPrompt` from the `compressPrompt` module's mock and `calculateAffordability` to `mockBoundCalculateAffordability` from that module's mock — imported builders for imported types, never re-declared here.
      * `[✅]`   `buildPrepareModelJobParams` supplies `dbClient` only; its `job`, `projectOwnerUserId`, `providerRow`, `authToken` and `sessionData` defaults go with the members. `buildPrepareModelJobPayload` supplies `job`, `providerRow`, `promptConstructionPayload` and no `compressionStrategy`.
      * `[✅]`   One function mock for the owned function type: `mockPrepareModelJob: PrepareModelJobFn`, returning `buildPrepareModelJobQueuedReturn()`, with an identical signature, no options and no recording.
      * `[✅]`   Deleted: `mockPrepareModelJobFn` with `MockPrepareModelJobFnOptions` and `MockPrepareModelJobFnCall`, a configurable harness with call recording. A test needing another outcome declares its own `PrepareModelJobFn` composed from these builders.
      * `[✅]`   `mockDialecticExecuteJobPayload`, `mockDialecticJobRow`, `mockDialecticSessionRow`, `mockPromptConstructionPayload`, `mockTokenWalletRow` and `mockDialecticContributionRow` are used as they stand. Every one builds a type this interface does not own, and each has live consumers.

   * `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
      * `[✅]`   `isDialecticExecuteJobPayload` gains its checklist for the members this node makes required, fixtures from `buildDialecticExecuteJobPayload` and `invalidateDialecticExecuteJobPayload` in `_shared/dialectic.mock.ts`: each of `sessionId`, `projectId`, `model_id` and `walletId` blank rejected; `stageSlug` absent and non-slug rejected; `iterationNumber` absent, non-numeric and zero rejected; the builder's valid default accepted.
      * `[✅]`   Every existing case in the file keeps its arrangement, its message assertion and its subject.

   * `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
      * `[✅]`   `isDialecticExecuteJobPayload` requires `sessionId`, `projectId`, `model_id` and `walletId` non-empty through `isNonEmptyString`, requires `stageSlug` through `isDialecticStageSlug`, and requires `iterationNumber` to be an integer greater than zero — the members `prepareModelJob` reads and the base guard leaves optional or blank-admitting. The base delegation, the EXECUTE-specific members, the legacy-property check and the unknown-key sweep are unchanged.
      * `[✅]`   `isDialecticBaseJobPayload` is unchanged: it is the delegate every arm guard calls, and the members tightened here are the EXECUTE arm's own requirement.

   * `[✅]`   `prepareModelJob.guard.test.ts`
      * `[✅]`   `isPrepareModelJobParams` case checklist over the one surviving member (`dbClient`), absent and wrong-typed, fixtures from `invalidatePrepareModelJobParams`; a case asserts params carrying none of the five retired members (`job`, `projectOwnerUserId`, `providerRow`, `authToken`, `sessionData`) are accepted.
      * `[✅]`   `isPrepareModelJobPayload` case checklist over `job`, `providerRow`, `promptConstructionPayload` and both optional rule arrays; the `job` case corrupts a member `isDialecticJobRow` checks and the `providerRow` case corrupts a member `isSelectedAiProvider` checks, so each proves the delegation rather than a record test; a case asserts a payload carrying no `compressionStrategy` is accepted.
      * `[✅]`   `isPrepareModelJobDeps` gains `compressPrompt` to its checklist: absent and non-function each rejected, present and callable accepted.
      * `[✅]`   `isPrepareModelJobSuccessReturn` becomes a checklist over both flavors: accepts `{ queued: true }`, accepts `{ waiting_for_children: true }`, rejects a built error return and rejects a record carrying neither discriminant. Per-flavor guards `isPrepareModelJobQueuedReturn` and `isPrepareModelJobPendingReturn` each accept their own flavor and reject the other.
      * `[✅]`   `isPrepareModelJobErrorReturn` keeps its cases, its exclusion assertions extended to `waiting_for_children`.

   * `[✅]`   `prepareModelJob.guard.ts`
      * `[✅]`   `isPrepareModelJobParams` drops `job`, `projectOwnerUserId`, `providerRow`, `authToken` and `sessionData` from its key list and drops all their member checks, keeping only `dbClient` and its existing check; the `isDialecticSessionRow` import goes with the retired members.
      * `[✅]`   `isPrepareModelJobPayload` drops `compressionStrategy` from its presence pair and drops its function check; gains a `job` check delegating to `isDialecticJobRow` and a `providerRow` check delegating to `isSelectedAiProvider`, keeping the `isPromptConstructionPayloadShape` check and both optional rule-array checks.
      * `[✅]`   `isPrepareModelJobDeps` gains a `compressPrompt` presence-and-function check beside `calculateAffordability`.
      * `[✅]`   `isPrepareModelJobQueuedReturn` and `isPrepareModelJobPendingReturn` are added, each discriminating on its own literal member and rejecting the other's; `isPrepareModelJobSuccessReturn` returns true for either flavor and false otherwise.
      * `[✅]`   `isPrepareModelJobErrorReturn` extends its exclusion list with `waiting_for_children`; every guard keeps its boolean contract.

   * `[✅]`   `prepareModelJob.test.ts`
      * `[✅]`   Every case builds deps through `buildPrepareModelJobDeps`, params with only `dbClient`, and payload with `job`, `providerRow` and `promptConstructionPayload` (no `compressionStrategy`, no `authToken`/`sessionData`/`projectOwnerUserId` anywhere); the `contractCompressionStrategy` local and its thirty-odd payload literals are deleted.
      * `[✅]`   The affordability composition cases are restated against the new arms: a within-budget verdict enqueues with `max_tokens_to_generate` from `maxOutputTokens` and returns `{ queued: true }`; an affordability error propagates unchanged. The captured `CalculateAffordabilityParams` assertions prove the narrowed 2-member shape (`walletBalance`, `userConfig`), and the captured `CalculateAffordabilityPayload` assertions prove the narrowed 5-member shape (`extendedModelConfig`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `systemInstruction`). The cases that narrowed `isCalculateAffordabilityCompressedReturn` are replaced by the over-budget cases below.
      * `[✅]`   New case: an over-budget verdict on a row whose `job_type` is `'EXECUTE'` calls `deps.compressPrompt` exactly once, with `CompressPromptParams` carrying 5 members (`dbClient`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression`, `walletBalance`) and `CompressPromptPayload` carrying 6 members (`parentJob: payload.job`, `extendedModelConfig`, `inputsRelevance`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`), and returns `{ waiting_for_children: true }` without calling `deps.enqueueModelCall`. Arranged with a spy on both collaborators so the assertion fails if either call moves.
      * `[✅]`   New case: an over-budget verdict on a row whose `job_type` is `'COMPRESS'` returns a non-retriable error, calls neither `deps.compressPrompt` nor `deps.enqueueModelCall`, and performs no write — decision one's recursion guard.
      * `[✅]`   New case: a compression error return propagates unchanged, with the same `error` identity and `retriable` flag the collaborator returned.
      * `[✅]`   The `EnqueueModelCallParams` assertion cases keep every member assertion they make and lose their `output_type` expectations, that member having left the type.
      * `[✅]`   New cases for the provenance write: a within-budget dispatch updates this job row's payload with `source_prompt_resource_id` from `promptConstructionPayload` before `deps.enqueueModelCall` is called; the value does not appear on the `ChatApiRequest` handed to that call; a failed update returns `{ error, retriable: true }` and enqueues nothing; and an over-budget EXECUTE deferral performs no update at all.
      * `[✅]`   New case: a row whose `job_type` is `'EXECUTE'` and whose payload fails `isDialecticExecuteJobPayload` surfaces that guard's per-member diagnostic on the error arm, in place of the deleted `does not have a valid 'execute' payload` string.
      * `[✅]`   New case: a row whose `job_type` is `'COMPRESS'` and whose payload fails `isDialecticCompressJobPayload` surfaces that guard's per-member diagnostic on the error arm.
      * `[✅]`   The six member-validation cases asserting the `is missing required …` messages for `stageSlug`, `walletId`, `iterationNumber`, `projectId`, `sessionId` and `model_id`, and the case asserting `Token wallet service is required for affordability preflight`, are deleted with the throws they cover; the arm guard's checklist in `type_guards.dialectic.test.ts` proves those members, including the `iterationNumber: 0` rejection this suite asserts today.
      * `[✅]`   Every existing case for the tier-cap read and its failure, the effective-cap arithmetic, the provider-config failure, the document-identity failure, the wallet and rate resolution and the enqueue error propagation keeps its arrangement and assertions.

   * `[✅]`   `prepareModelJob.inputsRequired.test.ts`
      * `[✅]`   Its three cases drop `compressionStrategy` from their payload literals and `authToken`/`sessionData`/`projectOwnerUserId` from their params literals (params has only `dbClient`), supply `job` and `providerRow` on payload, and keep every `inputsRequired` scoping and enforcement assertion unchanged.

   * `[✅]`   `prepareModelJob.ts`
      * `[✅]`   The entry narrowing becomes the arm selection: branch on `payload.job.job_type`, and in each branch declare the arm-typed local and narrow with that arm's guard in the landed form. The `isDialecticExecuteJobPayload` call that stands alone today, the hand-thrown invalid-payload message, the `Object.getOwnPropertyDescriptor` read of `user_jwt` and the `payload.user_jwt required` throw are deleted, and `userAuthToken` is read from the narrowed payload.
      * `[✅]`   The six member-validation throws for `stageSlug`, `walletId`, `iterationNumber`, `projectId`, `sessionId` and `model_id`, their `…Raw` destructure aliases and the `Validating payload fields` diagnostic log block are deleted; each member is read from the narrowed payload.
      * `[✅]`   The `if (!deps.tokenWalletService)` presence check and its throw are deleted, the member being required on deps.
      * `[✅]`   The params destructure yields only `params.dbClient`. `payload.job`, `payload.providerRow` and `payload.promptConstructionPayload` are read from payload. `payload.job.user_id` replaces every read of `projectOwnerUserId`.
      * `[✅]`   `output_type` leaves the payload destructure and the `EnqueueModelCallParams` literal.
      * `[✅]`   `compressionStrategy` leaves the payload destructure. The `CalculateAffordabilityParams` literal becomes `{ walletBalance, userConfig }` — the two members that interface now declares. The `CalculateAffordabilityPayload` literal becomes `{ extendedModelConfig, resourceDocuments, conversationHistory, currentUserPrompt, systemInstruction }` — the five members that interface now declares — carrying neither `compressionStrategy` nor `chatApiRequest`.
      * `[✅]`   The `isCalculateAffordabilityCompressedReturn` narrowing is replaced by the `overBudget` branch: `isCalculateAffordabilityOverBudgetReturn` selects the compression path, and the within-budget arm supplies `maxOutputTokens` and `resolvedInputTokenCount` as it does today.
      * `[✅]`   The over-budget path resolves within the arm selected at entry, adding the `CompressPromptParams` literal carrying `{ dbClient: params.dbClient, isContinuationFlowInitial, finalTargetThreshold, balanceAfterCompression, walletBalance }`, the `CompressPromptPayload` literal carrying `{ parentJob: payload.job, extendedModelConfig, inputsRelevance: payload.inputsRelevance, resourceDocuments, conversationHistory, currentUserPrompt }`, the single `deps.compressPrompt` call, the `isCompressPromptErrorReturn` propagation and the `{ waiting_for_children: true }` return, plus the non-retriable recursion-guard error on the COMPRESS arm.
      * `[✅]`   The provenance update is added between the affordability branch and the enqueue on the within-budget path, keyed on `payload.job.id`, returning the error arm on a Postgrest failure.
      * `[✅]`   Everything else is unchanged: the tier-cap query and its logging, the cap arithmetic, the provider-config check, the document scoping and `inputsRequired` enforcement, the wallet and rate resolution, the base `ChatApiRequest` construction, and the enclosing `try`/`catch`.

   * `[✅]`   `prepareModelJob.provides.ts`
      * `[✅]`   The file uses named exports, not `export *`. The new return-flavor types (`PrepareModelJobQueuedReturn`, `PrepareModelJobPendingReturn`) and their guards (`isPrepareModelJobQueuedReturn`, `isPrepareModelJobPendingReturn`) are added to the re-export lists from `prepareModelJob.interface.ts` and `prepareModelJob.guard.ts`.
      * `[✅]`   The mock re-exports delete `MockPrepareModelJobFnOptions`, `MockPrepareModelJobFnCall` and `mockPrepareModelJobFn`, all deleted from the mock file, and add any new mock symbols the mock element introduces.
      * `[✅]`   The existing re-exports of `prepareModelJob`, the interface types, and the current guards are unchanged except as the names they re-export change.

   * `[✅]`   `prepareModelJob.integration.test.ts`
      * `[✅]`   Its params literal has only `dbClient`; its payload literal carries `job`, `providerRow` and `promptConstructionPayload` (no `authToken`, `sessionData`, `projectOwnerUserId` or `compressionStrategy`), and its `buildBoundCompressPromptFn` wiring is replaced by a `BoundCompressPromptFn` the case declares, supplied on deps.
      * `[✅]`   The chain this suite proves widens to the composition this node creates: real `calculateAffordability` plus real `compressPrompt` behind this dispatcher, with only Supabase and the queue mocked. A within-budget working set reaches `enqueueModelCall` with the cap the affordability verdict resolved and the provenance recorded on the row; an over-budget EXECUTE working set reaches `compressPrompt` and returns the deferral without enqueueing; an over-budget COMPRESS row returns the recursion-guard error having called neither.
      * `[✅]`   The existing captured-`EnqueueModelCallParams` assertions stand, less `output_type`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports `compressPrompt`'s bound function type and error guard, `calculateAffordability`'s bound function type and guards, `enqueueModelCall`'s bound function type, the EXECUTE payload guard from `_shared` and the COMPRESS payload guard from `enqueueCompressJobs`; it exports nothing back to any of them.
      * `[✅]`   The `compressPrompt` edge is a relocation, not an addition: it left `calculateAffordability` in the node above and arrives here, so the module graph gains no new dependency and no cycle.
      * `[✅]`   `prepareModelJob.provides.ts` uses named exports and is edited above to add the new return-flavor types and guards and to delete the retired mock symbols; after that edit, consumers importing from `prepareModelJob.provides.ts` see the full new surface.

   * `[✅]`   `requirements`
      * `[✅]`   `PrepareModelJobParams` declares one member (`dbClient`) with no scalar that duplicates a field on the job row — interface test, exhaustive key record.
      * `[✅]`   `PrepareModelJobPayload` declares five members (`job`, `providerRow`, `promptConstructionPayload`, `inputsRelevance?`, `inputsRequired?`) with `compressionStrategy` absent — interface test, exhaustive key record.
      * `[✅]`   `PrepareModelJobDeps` declares eight members including `compressPrompt` — interface test.
      * `[✅]`   `PrepareModelJobReturn` has two arms and both success flavors are members of `PrepareModelJobSuccessReturn` — interface test, typed assignment.
      * `[✅]`   `DialecticExecuteJobPayload` declares `stageSlug` and `iterationNumber` required — interface test, exhaustive key record.
      * `[✅]`   `isDialecticExecuteJobPayload` rejects a blank `sessionId`, `projectId`, `model_id` or `walletId`, an absent or non-slug `stageSlug`, and an absent, non-numeric or zero `iterationNumber` — `type_guards.dialectic.test.ts`.
      * `[✅]`   `prepareModelJob.ts` contains no presence or blank check for any payload member and no presence check for any deps member — unit test, the deleted-message cases absent and the guard-diagnostic cases present.
      * `[✅]`   An over-budget EXECUTE job calls `compressPrompt` once with the corrected 5-member params and 6-member payload, enqueues nothing and returns `{ waiting_for_children: true }` — unit test and integration test.
      * `[✅]`   An over-budget COMPRESS job returns a non-retriable error and calls no collaborator — unit test and integration test.
      * `[✅]`   A within-budget job enqueues one model call whose params name no artifact type and whose request carries the resolved output cap — unit test and integration test.
      * `[✅]`   `source_prompt_resource_id` is written onto the job row's payload before the enqueue and never onto `ChatApiRequest`, and a failed write returns a retriable error having enqueued nothing — unit test.
      * `[✅]`   A malformed payload surfaces its own arm guard's per-member diagnostic on the error arm, for each arm — unit test.
      * `[✅]`   Every tier-cap, provider-config, document, wallet and enqueue failure returns exactly what it returns now — unit test and inputsRequired test, existing cases unchanged.

* `[✅]`   supabase/functions/dialectic-worker/processCompressJob/processCompressJob.ts **[BE] Compose a `PromptConstructionPayload` from the assembled prompt and call `prepareModelJob`; move `job` to payload, eliminate `projectOwnerUserId` (KVP dup of `job.user_id`), own no part of the model call, narrow `isDialecticCompressJobPayload` on entry, and narrow both assembly unions before use**

   * `[✅]`   `objective`
      * `[✅]`   Solve a second model-call path. This function validates the provider config, extracts the input and output windows, counts preflight tokens, builds a `ChatApiRequest`, a `UserConfig` and `EnqueueModelCallParams`, writes the prompt's resource id onto the job row, and calls `enqueueModelCall` itself — so a COMPRESS call reaches the model without the tier cap, the wallet read or the affordability preflight every EXECUTE call passes, and its window check is a bespoke subtraction rather than decision one's recursion guard.
      * `[✅]`   Functional goals:
         * `[✅]`   The function narrows `payload.job.payload` with `isDialecticCompressJobPayload` on entry; the guard throws per-member diagnostics, and the enclosing `try` converts the throw to the error arm.
         * `[✅]`   The function composes a `PromptConstructionPayload` from the assembled prompt and calls `deps.prepareModelJob`, which is the repo's one model-call dispatcher.
         * `[✅]`   It validates no provider config, extracts no context window, constructs no `ChatApiRequest`, no `UserConfig` and no `EnqueueModelCallParams`, counts no preflight tokens, and writes no provenance update.
         * `[✅]`   It resolves its `ai_providers` row from the narrowed job payload's `model_id` and passes it to the dispatcher on payload as `providerRow`, exactly as `processSimpleJob` does on the EXECUTE path.
         * `[✅]`   `ProcessCompressJobDeps` declares `assembleCompressionPrompt`, `assembleContinuationPrompt`, `prepareModelJob`, `constructStoragePath` and `logger`, and drops `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic`.
         * `[✅]`   `ProcessCompressJobParams` declares `dbClient` only. `job` is a data object that belongs in payload; `projectOwnerUserId` is a KVP duplicate of `payload.job.user_id`; `authToken` is retired.
         * `[✅]`   `ProcessCompressJobPayload` declares `job: DialecticJobRow` and is no longer an alias of `DialecticCompressJobPayload`. The function narrows `payload.job.payload` with `isDialecticCompressJobPayload` internally, so the caller passes only the job row and the function handles its own content narrowing.
         * `[✅]`   Both assembly branches narrow their returned union before use: the compression branch on `AssembleCompressionPromptReturn` as it does now, the continuation branch on `AssembleContinuationPromptReturn` through `isAssembleContinuationPromptErrorReturn`.
         * `[✅]`   The dispatcher's return is narrowed by arm: queued → `{ queued: true }`; error → propagated unchanged; a deferral → a non-retriable error naming that a COMPRESS job is never deferred, decision one's guard having failed it instead.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Dedup layer two is unchanged in behavior: the `CompressedContext` path context and its construction failure, the `dialectic_project_resources` existence read, the completed-status update on a hit and its failure, and the `{ queued: false }` success that spends nothing. All identity members are now read from the narrowed `payload.job.payload`, and the job id is read from `payload.job.id`.
         * `[✅]`   Consuming-step resolution is unchanged: the stage's active recipe instance, the cloned-versus-template step query, the step match on `output_type`, the recipe-step validation, the `outputs_required` validation and the `CompressionTargetStep` it builds, each keeping its message and `retriable` flag. The `stageSlug` and `output_type` are read from the narrowed content.
         * `[✅]`   The compression assembler's params and payload literals carry the same values, now read from the narrowed `payload.job.payload`, including the conditional chunk pair.
         * `[✅]`   The function still marks no job `completed` on a successful dispatch; `saveResponse` does that when the response returns.
         * `[✅]`   `ProcessCompressJobError`, the success and error return shapes and `ProcessCompressJobFn`'s `(deps, params, payload) → return` shape keep their declarations. The params and payload types narrow.
      * `[✅]`   Each goal is proven by a named case in this module's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer job processing: decide whether this compression is still needed, resolve what it is compressing for, assemble its prompt, and hand the result to the dispatcher.
      * `[✅]`   The role is correct because everything above the dispatch is compression-specific knowledge — the canonical artifact path, the consuming step, the target schema, the two assemblers — and everything below it is identical for every model call in the repo.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not validate a model config, extract a window, count tokens, or check a budget; `prepareModelJob` does all four for every job type, over the `providerRow` this function hands it.
         * `[✅]`   Do not write `source_prompt_resource_id` onto the job row; the dispatcher writes it after affordability and before the enqueue.
         * `[✅]`   Do not edit `prepareModelJob.ts`, `processJob.ts` or either assembler; each has its own node.
         * `[✅]`   Do not mark the job completed on a successful dispatch, and do not send a notification on any path — COMPRESS is invisible infrastructure.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/processCompressJob` — content narrowing, dedup layer two, consuming-step and target-schema resolution, assembly-branch selection, and the handoff to the dispatcher.
      * `[✅]`   Inside boundary:
         * `[✅]`   Whether this victim is already compressed for this target.
         * `[✅]`   Which schema the compression targets, and which assembler builds its prompt.
         * `[✅]`   Which provider row this job runs against, resolved from the narrowed job payload's `model_id` and handed on.
      * `[✅]`   Outside boundary:
         * `[✅]`   Everything a model call requires of that provider row — the tier cap, the wallet read, affordability, the window and the recursion guard — owned by `prepareModelJob`.
         * `[✅]`   What the response becomes, owned by `saveResponse`.
         * `[✅]`   Which arm a job row takes, decided by `processJob` before this function is reached.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `../prepareModelJob/prepareModelJob.provides.ts` (`PrepareModelJobParams`, `PrepareModelJobPayload`, and the three return-arm guards `isPrepareModelJobQueuedReturn`, `isPrepareModelJobPendingReturn` and `isPrepareModelJobErrorReturn`).
         * `[✅]`   Layer classification: sibling app-layer module, the repo's model-call dispatcher.
         * `[✅]`   Direction: inbound; this module already imports from `enqueueModelCall`, which the dispatcher fronts, so the direction is unchanged and one edge replaces another.
         * `[✅]`   Purpose: type the params and payload this function composes for the dispatcher, and narrow each arm of the return it hands back.
      * `[✅]`   Provider: `../createJobContext/JobContext.interface.ts` (`BoundPrepareModelJobFn`).
         * `[✅]`   Layer classification: the worker's dependency-injection boundary, which is where the dispatcher's bound form is declared.
         * `[✅]`   Direction: inbound; a type-only import with no runtime edge, and `prepareModelJob.interface.ts` already imports three function types from this same file.
         * `[✅]`   Purpose: type the `prepareModelJob` member of `ProcessCompressJobDeps`.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`PromptConstructionPayload`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound; this module already imports `DialecticJobRow` and `DialecticRecipeStep` from it.
         * `[✅]`   Purpose: type the object this function composes from the assembled prompt.
      * `[✅]`   Provider: `_shared/prompt-assembler/prompt-assembler.guard.ts` (`isAssembleContinuationPromptErrorReturn`).
         * `[✅]`   Layer classification: shared module that owns the continuation return.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: narrow the continuation branch's union before its value is used.
      * `[✅]`   Provider: `../enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`DialecticCompressJobPayload`) and `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticCompressJobPayload`).
         * `[✅]`   Layer classification: sibling module (payload type) and shared runtime boundary (guard).
         * `[✅]`   Direction: inbound; this module already imports `DialecticCompressJobPayload` from the enqueue module. The guard import is new to this file, moved from the caller.
         * `[✅]`   Purpose: narrow `payload.job.payload` on entry so every content read is typed.
      * `[✅]`   Removed providers: `enqueueModelCall` (`BoundEnqueueModelCallFn`, `EnqueueModelCallParams`, `EnqueueModelCallPayload`), `calculateAffordability` (`UserConfig`), `_shared/types.ts` (`AiModelExtendedConfig`, `ChatApiRequest`), `_shared/types/tokenizer.types.ts` (`CountTokensDeps`, `CountableChatPayload`, `CountTokensFn`) and `type_guards.chat.ts` (`isAiModelExtendedConfig`) — every one imported solely for the config validation, the token count or the enqueue this node removes. `Tables` stays, typing the `ai_providers` row this function still resolves and the recipe-step rows it reads.
      * `[✅]`   Confirm:
         * `[✅]`   `constructStoragePath` and `logger` keep their roles; `logger` remains the only deps member this function does not call on the happy path.
         * `[✅]`   `params.dbClient` remains this function's own database handle: it performs the dedup read, the provider read and the recipe-step reads through it, and hands the same client to the dispatcher.
         * `[✅]`   No reverse dependency: `prepareModelJob` imports nothing from this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From the dispatcher: its params and payload types and its three return-arm guards only — not its deps, which the composition root binds. The bound two-argument closure type comes from the worker's DI boundary, which declares it.
         * `[✅]`   From the hub: the `PromptConstructionPayload` type only.
         * `[✅]`   From the enqueue module: the `DialecticCompressJobPayload` type and its guard only.

   * `[✅]`   `processCompressJob.interface.test.ts`
      * `[✅]`   The deps key case declares `assembleCompressionPrompt`, `assembleContinuationPrompt`, `prepareModelJob`, `constructStoragePath` and `logger` and asserts five — exhaustive in both directions, it is the proof the four model-call members are gone.
      * `[✅]`   The params key case declares `dbClient` and asserts one — exhaustive in both directions, it is the proof `job`, `projectOwnerUserId` and `authToken` are gone.
      * `[✅]`   The payload key case declares `job` and asserts one, proving `ProcessCompressJobPayload` is no longer an alias and `job` is its only member.
      * `[✅]`   A case proves `ProcessCompressJobDeps["prepareModelJob"]` accepts a `BoundPrepareModelJobFn` value by typed assignment.
      * `[✅]`   The return-union cases and the signature cases are unchanged.

   * `[✅]`   `processCompressJob.interface.ts`
      * `[✅]`   `ProcessCompressJobDeps` drops `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic`, gains `prepareModelJob: BoundPrepareModelJobFn`, and keeps `assembleCompressionPrompt`, `assembleContinuationPrompt`, `constructStoragePath` and `logger`. The `BoundEnqueueModelCallFn`, `CountTokensFn` and `CountTokensDeps` imports go with the members.
      * `[✅]`   `ProcessCompressJobParams` drops `job`, `projectOwnerUserId` and `authToken`; declares `dbClient` only. `job` is a data object that belongs in payload; `projectOwnerUserId` is a KVP duplicate of `job.user_id`; `authToken` is retired. The `DialecticJobRow` import moves to the payload type.
      * `[✅]`   `ProcessCompressJobPayload` is no longer a type alias of `DialecticCompressJobPayload`. It becomes an interface declaring `job: DialecticJobRow` as its only member. The `DialecticCompressJobPayload` import stays for use in the implementation's narrowing guard.
      * `[✅]`   `ProcessCompressJobError`, both return shapes, `ProcessCompressJobReturn`, `ProcessCompressJobFn` and `BoundProcessCompressJobFn` are unchanged in declaration. The function signature keeps its `(deps, params, payload) → Promise<Return>` shape; the params and payload types narrow.

   * `[✅]`   `processCompressJob.interaction.spec`
      * `[✅]`   Entry narrowing: `isDialecticCompressJobPayload(payload.job.payload)` on entry. It throws a per-member diagnostic on any malformed member; the enclosing `try` converts the throw to `{ error, retriable: false }`. The narrowed value is held as a local and every content member (`sessionId`, `projectId`, `model_id`, `stageSlug`, `output_type`, `sourceType`, `mode`, `content`, `continuation_count`, etc.) is read from it.
      * `[✅]`   Dedup layer two, unchanged in behavior: build the `FileType.CompressedContext` path context from the narrowed content's identity members and call `deps.constructStoragePath`. A throw → error arm, `retriable: false`. The `dialectic_project_resources` existence read failing → error arm, `retriable: true`. A row found → update this job row to `completed` with `completed_at`, keyed on `payload.job.id`; that update failing → error arm, `retriable: true`; otherwise success `{ queued: false }`, nothing else run.
      * `[✅]`   Provider resolution, unchanged in its query and its two row outcomes: the `ai_providers` read by the narrowed content's `model_id`; a query error → error arm, `retriable: true`; no row → error arm, `Provider not found`, `retriable: true`. The row is held for the dispatcher and nothing is read off it here — the `isAiModelExtendedConfig` validation and both window extractions leave with the model-call work.
      * `[✅]`   Consuming step, unchanged: the stage read by the narrowed content's `stageSlug`, its missing active recipe instance, the instance read, the cloned-versus-template step query, an empty step set, no step matching `output_type`, a step failing both recipe-step guards, and invalid `outputs_required` each return their existing message and flag; otherwise the `CompressionTargetStep` is built from `outputs_required` and `step_description`.
      * `[✅]`   Assembly branch, selected on the narrowed content's `continuation_count` being a number at least one: the continuation branch calls `deps.assembleContinuationPrompt(payload.job)`; every other case calls `deps.assembleCompressionPrompt` with the existing params and payload literals, all content members read from the narrowed value.
      * `[✅]`   Continuation branch narrowing: `isAssembleContinuationPromptErrorReturn` true → propagate `{ error, retriable }` unchanged. Otherwise the value is the assembled prompt.
      * `[✅]`   Compression branch narrowing: an error return → propagate `{ error, retriable }` unchanged, as it does now.
      * `[✅]`   Dispatch: compose `PromptConstructionPayload` with `currentUserPrompt` from the assembled `promptContent`, `source_prompt_resource_id` from the assembled id, and empty `conversationHistory` and `resourceDocuments` — a compression prompt is one self-contained instruction with no history and no gathered artifacts. Call `deps.prepareModelJob` with params `{ dbClient: params.dbClient }` and payload `{ job: payload.job, providerRow, promptConstructionPayload }`, supplying neither `inputsRelevance` nor `inputsRequired`, a COMPRESS job having no recipe step of its own.
      * `[✅]`   Dispatch outcome: `isPrepareModelJobQueuedReturn` → success `{ queued: true }`. `isPrepareModelJobPendingReturn` → error arm, a `ProcessCompressJobError` stating that a COMPRESS job was deferred rather than dispatched, `retriable: false` — the dispatcher's recursion guard fails an over-budget COMPRESS job, so this arm is unreachable by design and is reported rather than treated as success. Anything else is the error arm, propagated unchanged.
      * `[✅]`   Ordering and side effects: exactly one narrowing on entry, one read before any write; the only write on a dedup hit is the completed-status update; on the dispatch path this function writes nothing at all; no notification is sent on any path.

   * `[✅]`   `processCompressJob.mock.ts`
      * `[✅]`   `buildProcessCompressJobDeps` supplies `prepareModelJob` from the dispatcher module's own function mock and drops its `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic` defaults; `buildProcessCompressJobParams` drops its `job`, `projectOwnerUserId` and `authToken` defaults and keeps `dbClient` only.
      * `[✅]`   Each owned object type carries the four symbols: `Partial<T>` overrides, a builder defaulting every member, a corruption type over `keyof`, and an `unknown`-returning invalidator — for `ProcessCompressJobDeps`, `ProcessCompressJobParams`, `ProcessCompressJobPayload`, `ProcessCompressJobSuccessReturn` and `ProcessCompressJobErrorReturn`. `ProcessCompressJobPayload` is no longer an alias; `buildProcessCompressJobPayload` supplies a default `job: DialecticJobRow` built from `mockDialecticJobRow` (imported from the existing mock).
      * `[✅]`   One function mock per owned function type: `mockProcessCompressJob: ProcessCompressJobFn` and `mockBoundProcessCompressJob: BoundProcessCompressJobFn`, each returning `buildProcessCompressJobSuccessReturn()`, with no options bag and no call recording.

   * `[✅]`   `processCompressJob.guard.test.ts`
      * `[✅]`   `isProcessCompressJobDeps` case checklist over the five surviving members, each absent and each wrong-typed, fixtures from the invalidator; a case asserts a deps object carrying none of the four removed members is accepted.
      * `[✅]`   `isProcessCompressJobParams` case checklist over the one surviving member (`dbClient`), each absent and each wrong-typed; a case asserts params carrying none of the three retired members (`job`, `projectOwnerUserId`, `authToken`) are accepted.
      * `[✅]`   `isProcessCompressJobPayload` case checklist over the one member (`job`), absent and wrong-typed; a case asserts a payload with a valid `job` record is accepted.
      * `[✅]`   The `isProcessCompressJobSuccessReturn`, `isProcessCompressJobErrorReturn`, `isProcessCompressJobReturn`, `isProcessCompressJobFn` and `isBoundProcessCompressJobFn` cases keep their coverage and their boolean assertions.

   * `[✅]`   `processCompressJob.guard.ts`
      * `[✅]`   `isProcessCompressJobDeps` drops its `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic` checks and gains a presence-and-function check for `prepareModelJob`.
      * `[✅]`   `isProcessCompressJobParams` drops its `job`, `projectOwnerUserId` and `authToken` checks, keeping only `dbClient`.
      * `[✅]`   `isProcessCompressJobPayload` checks that the value is a record with a `job` property that is itself a record. It no longer delegates to `isDialecticCompressJobPayload`; that narrowing happens inside the function body where the enclosing `try` converts the throw to the error arm.
      * `[✅]`   Every other guard in the file is unchanged.

   * `[✅]`   `processCompressJob.test.ts`
      * `[✅]`   Every case builds deps without the four removed members, params with only `dbClient`, and payload with `{ job }` where `job` carries a `DialecticCompressJobPayload`-shaped `payload` field. The `DialecticCompressJobPayload` content that was passed directly as the function's payload is now on `payload.job.payload`.
      * `[✅]`   The cases asserting `enqueueParams["output_type"]`, the provider-config validations, the `provider_max_input_tokens`/`provider_max_output_tokens` checks, the preflight token count and the budget-exceeded error are deleted with the branches they cover; the responsibilities they asserted now belong to `prepareModelJob`'s suite, where its own cases prove the cap, the wallet, the preflight and the recursion guard. The provider-lookup cases stand — the query-error and provider-not-found cases keep their messages and flags.
      * `[✅]`   New case: a fitting job reaches `deps.prepareModelJob` exactly once with params `{ dbClient: params.dbClient }` and payload `{ job: payload.job, providerRow, promptConstructionPayload }`, the `providerRow` being the one the `ai_providers` stub returned, and the `promptConstructionPayload` carrying the assembled `promptContent` as `currentUserPrompt`, the assembled id as `source_prompt_resource_id`, and empty history and documents — and returns `{ queued: true }`.
      * `[✅]`   New case: a dispatcher error return is propagated with the same `error` identity and `retriable` flag, and no further work is done.
      * `[✅]`   New case: a dispatcher deferral returns the non-retriable error arm naming the COMPRESS deferral, and does not report success.
      * `[✅]`   New case: the continuation branch narrows its union — an error return from `deps.assembleContinuationPrompt` is propagated unchanged and the dispatcher is never called.
      * `[✅]`   The continuation-selection case stands: `continuation_count` at least one calls the continuation assembler and never the compression assembler, and zero or absent calls the compression assembler.
      * `[✅]`   Every dedup, stage, instance, step-query, step-match, recipe-step-validation and `outputs_required` case keeps its arrangement, its message assertion and its `retriable` flag. Read sites for content members now come from `payload.job.payload` after narrowing.
      * `[✅]`   A case asserts this function writes no job-row payload update on the dispatch path, the provenance write having moved to the dispatcher.
      * `[✅]`   New case: a `payload.job.payload` failing `isDialecticCompressJobPayload` surfaces that guard's per-member diagnostic on the error arm.

   * `[✅]`   `processCompressJob.ts`
      * `[✅]`   Entry: `isDialecticCompressJobPayload(payload.job.payload)` narrows the job's payload content; the throw surfaces a per-member diagnostic, converted to the error arm by the enclosing `try`. The narrowed value is held as a local for all content reads.
      * `[✅]`   All reads of `payload.xyz` for content fields (`sessionId`, `projectId`, `model_id`, `stageSlug`, `output_type`, `sourceType`, `mode`, `content`, `continuation_count`, `model_slug`, `chunk_index`, `chunk_total`, `documentKey`, `sourceId`, `role`) become reads of the narrowed local. All reads of `params.job` become `payload.job`. `params.projectOwnerUserId` is eliminated; `payload.job.user_id` replaces any read.
      * `[✅]`   Step two keeps its `ai_providers` read (by the narrowed content's `model_id`) and both row outcomes; its `isAiModelExtendedConfig` validation, the two `provider_max_*` checks and the two window extractions are deleted, with the `isAiModelExtendedConfig` import and the `AiModelExtendedConfig` type. The row itself is held for the dispatcher.
      * `[✅]`   Step five's provenance update — the spread payload literal, its `isJson` throw and the `dialectic_generation_jobs` update — is deleted.
      * `[✅]`   Step six's tokenizer deps, countable payload, `deps.countTokens` call and budget comparison are deleted, with the `CountTokensDeps` and `CountableChatPayload` imports.
      * `[✅]`   The `ChatApiRequest`, `UserConfig` and `EnqueueModelCallParams` literals, the `EnqueueModelCallPayload` literal and the `deps.enqueueModelCall` call are deleted, with their imports.
      * `[✅]`   The continuation branch's assignment is replaced by a narrowed one: call `deps.assembleContinuationPrompt(payload.job)`, guard with `isAssembleContinuationPromptErrorReturn`, propagate the error arm, otherwise hold the assembled prompt.
      * `[✅]`   The tail composes the `PromptConstructionPayload` and calls `deps.prepareModelJob` with params `{ dbClient: params.dbClient }` and payload `{ job: payload.job, providerRow, promptConstructionPayload }`, and returns per the arm guards.
      * `[✅]`   Steps one and three are untouched in behavior, with all content reads moved to the narrowed local and the job id read from `payload.job.id`. Every error message, `retriable` flag and early return they carry is unchanged.

   * `[✅]`   `processCompressJob.integration.test.ts`
      * `[✅]`   Its victim-payload helper builds payload as `{ job }` with the `DialecticCompressJobPayload` content on `job.payload`. Every case drops `job`, `projectOwnerUserId` and `authToken` from params (params has only `dbClient`) and the four removed members from deps.
      * `[✅]`   The `capturedEnqueueParams.output_type` assertions are replaced by assertions over the captured `PrepareModelJobParams` and `PrepareModelJobPayload`: params has one member (`dbClient`), payload has three members (`job`, `providerRow`, `promptConstructionPayload`) with the `promptConstructionPayload` carrying the assembled prompt and its resource id.
      * `[✅]`   The chain this suite proves is the real one this function now owns: real `constructStoragePath`, real assemblers where it already uses them, and the dispatcher at the outer edge. A dedup hit still completes without dispatching; a continuation victim still reaches the continuation assembler.
      * `[✅]`   Every existing dedup, stage-resolution and assembly assertion stands.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports the dispatcher's bound type and guards, the hub's payload type, both assemblers' contracts, the shared path constructor, and the `DialecticCompressJobPayload` type and guard for content narrowing, and exports nothing back to any of them.
      * `[✅]`   The `enqueueModelCall` edge is replaced by the `prepareModelJob` edge, one layer up the same path, so the module graph gains no new direction.
      * `[✅]`   The `isDialecticCompressJobPayload` guard import is new to this file but not new to the graph: `processJob` already imported it, and this function's own guard delegated to it. The narrowing responsibility moves inward, from the caller's guard to the function's own body.
      * `[✅]`   No cycle: `prepareModelJob` imports nothing from this module, and `processJob` constructs this function's deps rather than being imported by it.
      * `[✅]`   This module has no `provides` barrel; `processJob` imports its interface, guard and implementation directly, as it does now.

   * `[✅]`   `requirements`
      * `[✅]`   `ProcessCompressJobDeps` declares five members with the four model-call members absent — interface test, exhaustive key record.
      * `[✅]`   `ProcessCompressJobParams` declares one member (`dbClient`) with `job`, `projectOwnerUserId` and `authToken` absent — interface test, exhaustive key record.
      * `[✅]`   `ProcessCompressJobPayload` declares one member (`job`) and is no longer a type alias — interface test, exhaustive key record.
      * `[✅]`   A fitting job calls `deps.prepareModelJob` exactly once with params `{ dbClient }` and payload `{ job, providerRow, promptConstructionPayload }`, and returns `{ queued: true }` — unit test and integration test.
      * `[✅]`   The function validates no provider config, extracts no window, counts no tokens and writes no job-row payload update on the dispatch path — unit test.
      * `[✅]`   A dedup hit completes the job row and returns `{ queued: false }` without dispatching — unit test and integration test, existing cases.
      * `[✅]`   Both assembly branches propagate their error arm unchanged and never reach the dispatcher — unit test.
      * `[✅]`   A dispatcher deferral returns a non-retriable error rather than success — unit test.
      * `[✅]`   A malformed `payload.job.payload` surfaces `isDialecticCompressJobPayload`'s per-member diagnostic on the error arm — unit test.
      * `[✅]`   Every provider-lookup, stage, instance, step and `outputs_required` failure returns exactly what it returns now — unit test, existing cases unchanged.

* `[✅]`   supabase/functions/dialectic-worker/retryJob/retryJob.ts **[BE] Advance `attempt_count` to the row's value plus one, the increment this module owns and no caller can supply**

   * `[✅]`   `objective`
      * `[✅]`   Solve a retry that never advances the attempt. This module writes `attempt_count: params.job.attempt_count` — the row's own value, written back unchanged — so a job marked `retrying` re-enters the queue with the same count it left with, and `currentAttempt < max_retries` is true forever. Nothing else in the chain can compensate: `RetryJobParams` declares `dbClient` and `job` only, so no caller has a slot in which to pass an attempt number, and the legacy positional function this module replaces took one. The count is this function's to advance because this function is the attempt.
      * `[✅]`   Functional goals:
         * `[✅]`   The update writes `attempt_count` as `params.job.attempt_count + 1`.
         * `[✅]`   A row entering with `attempt_count` 3 leaves with 4, and the assertion proving it states 4.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   The notification's `error` string keeps `params.job.attempt_count` — it names the attempt that failed, which is the row's value before the advance, not the value written.
         * `[✅]`   Every other member of the update literal is unchanged: `status: "retrying"` and `error_details.failedAttempts` mapped from the payload.
         * `[✅]`   Both return flavors, the error arm, both error classes, the `try`/`catch` around the notification and every log line are unchanged.
         * `[✅]`   `RetryJobDeps`, `RetryJobParams`, `RetryJobPayload`, the return union, `RetryJobFn` and `BoundRetryJobFn` are unchanged, so no consumer's call site moves.
         * `[✅]`   No file outside `dialectic-worker/retryJob/` is edited.
      * `[✅]`   Each goal is proven by a named case in this file's suite.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer job-lifecycle mutation: put a failed job back in the queue by recording the failure, advancing its attempt, and telling its owner.
      * `[✅]`   The role is correct because advancing the count is an act of the retry, not a fact about it. A caller that computed the next number would be deciding what this function did, and every caller would compute the same expression.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not decide whether to retry; the caller compares `attempt_count` against `max_retries` and calls this function only when a retry is warranted.
         * `[✅]`   Do not read or enforce `max_retries`, and do not write a terminal status on any path.
         * `[✅]`   Do not change the notification's message, recipient or payload.
         * `[✅]`   Do not edit any caller; `saveResponse`, `processSimpleJob` and the worker root each have their own node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/retryJob` — the single write that moves a job from `processing` to `retrying`, and the notification that accompanies it.
      * `[✅]`   Inside boundary:
         * `[✅]`   What a retrying row records: its status, its attempt number, and the attempts that failed.
         * `[✅]`   Whether the notification succeeded, reported as two distinct success flavors.
      * `[✅]`   Outside boundary:
         * `[✅]`   Whether a retry is warranted, owned by the caller holding `max_retries`.
         * `[✅]`   `DialecticJobRow` and `FailedAttemptError`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `NotificationServiceType` and `ContributionGenerationRetryingPayload`, owned by `_shared/types/notification.service.types.ts`.

   * `[✅]`   `retryJob.interaction.spec`
      * `[✅]`   One point changes and no others. Every branch below keeps its condition, decision, dependency call and outcome except the value written for `attempt_count`.
      * `[✅]`   Branch: the update succeeds and the notification succeeds.
         * `[✅]`   Condition: `params.dbClient` returns no error for the update, and `deps.notificationService.sendContributionRetryingEvent` resolves.
         * `[✅]`   Decision: the destructured `error` is falsy, and the `try` completes.
         * `[✅]`   Dependency call: the update on `dialectic_generation_jobs` keyed on `params.job.id`, writing `status: "retrying"`, `attempt_count: params.job.attempt_count + 1` and `error_details.failedAttempts`; then the notification to `params.job.user_id`.
         * `[✅]`   Outcome: `RetryJobNotifiedReturn` — `{ notified: true }`.
      * `[✅]`   Branch: the update succeeds and the notification throws an `Error`.
         * `[✅]`   Condition: the update returns no error; the notification rejects with an `Error`.
         * `[✅]`   Decision: `caught instanceof Error`.
         * `[✅]`   Dependency call: the same update, then `deps.logger.error`.
         * `[✅]`   Outcome: `RetryJobNotificationFailedReturn` carrying that exact error instance.
      * `[✅]`   Branch: the update succeeds and the notification throws a non-`Error`.
         * `[✅]`   Condition: the update returns no error; the notification rejects with a value that is not an `Error`.
         * `[✅]`   Decision: `caught instanceof Error` is false.
         * `[✅]`   Dependency call: the same update, then `deps.logger.error`.
         * `[✅]`   Outcome: `RetryJobNotificationFailedReturn` carrying a `RetryJobNotificationError` built from the job id and the stringified value.
      * `[✅]`   Branch: the update returns a driver error.
         * `[✅]`   Condition: the update returns an error.
         * `[✅]`   Decision: the destructured `error` is truthy.
         * `[✅]`   Dependency call: `deps.logger.error`; the notification is not called.
         * `[✅]`   Outcome: `RetryJobErrorReturn` carrying a `RetryJobUpdateError` built from the job id, `"retrying"` and the driver's message, with `retriable: true`.
      * `[✅]`   Ordering and side effects: exactly one update per invocation, at most one notification, and it never precedes the update. Neither `params` nor `payload` is mutated on any path.

   * `[✅]`   `retryJob.test.ts`
      * `[✅]`   The attempt-count case asserts `attempt_count: 4` over the row it arranges with `attempt_count: 3`, matching the contract its own header states. Its arrangement, its `status: "retrying"` assertion and its `error_details.failedAttempts` assertion are unchanged.
      * `[✅]`   New case: a row arranged with `attempt_count: 0` writes `attempt_count: 1`, so a second arrangement proves the written value tracks the input rather than a constant.
      * `[✅]`   Every other case keeps its arrangement and assertions unchanged: the notified flavor with its five notification-argument assertions, the `Error`-throwing notification carrying that exact instance, the non-`Error` throw carrying a `RetryJobNotificationError` with the thrown string, the driver-error arm with its three error-property assertions and its zero-notification assertion, and the no-mutation case.

   * `[✅]`   `retryJob.ts`
      * `[✅]`   The `updatePayload` literal's `attempt_count` becomes `params.job.attempt_count + 1`.
      * `[✅]`   Nothing else in the file changes: the `status` and `error_details` members, the update call and its `.eq` filter, the driver-error branch with its `RetryJobUpdateError` construction and log line, the notification payload including its `error` string, the `try`/`catch`, both catch branches with their log lines, and every return.

   * `[✅]`   `requirements`
      * `[✅]`   A row entering with `attempt_count` 3 writes 4, and a row entering with 0 writes 1 — unit test, two arrangements, captured update-argument assertions.
      * `[✅]`   The notification's `error` string names the row's pre-advance attempt number — unit test.
      * `[✅]`   The update writes `status: "retrying"` and `error_details.failedAttempts` from the payload — unit test, existing case.
      * `[✅]`   Each of the four branches returns its own flavor and no other — unit test, existing cases unchanged.
      * `[✅]`   A driver error dispatches no notification — unit test, existing case.
      * `[✅]`   Neither `params` nor `payload` is mutated — unit test, existing case.

* `[✅]`   supabase/functions/dialectic-worker/createJobContext/createJobContext.ts **[BE] Make the factory the sole assembler of every deps object the worker constructs: `JobContextParams` carries unbound implementations and the raw collaborators they need, `createJobContext` binds the compression graph `getSortedCompressionCandidates` → `enqueueCompressJobs` → `compressPrompt` → `calculateAffordability` → `prepareModelJob` plus `applyCompressionOverlay` → `gatherArtifacts` and `enqueueModelCall`, `createPrepareModelJobContext` returns `PrepareModelJobDeps` with `IPrepareModelJobContext` deleted, and `IRagContext` retires with `ragService`, `indexingService` and `embeddingClient`**

   * `[✅]`   `objective`
      * `[✅]`   Solve a factory that assembles nothing it was built to assemble. `createJobContext` copies forty-three params onto a root object one field at a time, and every deps object the worker actually constructs is built somewhere else: `dialectic-worker/index.ts` builds `boundGatherArtifacts` from a `GatherArtifactsDeps` literal, `boundEnqueueModelCall` from an `EnqueueModelCallDeps` literal, and — inside the `prepareModelJob` params closure it hands the factory — a `CompressPromptDeps` literal, a `CalculateAffordabilityDeps` literal and a `PrepareModelJobDeps` literal, three graphs deep. `createPrepareModelJobContext`, the slicer written to do exactly that, has no production caller at all: its only callers are this module's own test files. The result is two assemblers for one process, a graph whose shape exists only inside one arrow function at the composition root, and a slice type, `IPrepareModelJobContext`, that restates `PrepareModelJobDeps` under a second name so the two drift independently.
      * `[✅]`   Functional goals:
         * `[✅]`   `JobContextParams` carries the unbound implementation of every function the factory binds — `prepareModelJob: PrepareModelJobFn`, `compressPrompt: CompressPromptFn`, `calculateAffordability: CalculateAffordabilityFn`, `enqueueCompressJobs: enqueueCompressJobsFn`, `getSortedCompressionCandidates: GetSortedCompressionCandidatesFn`, `applyCompressionOverlay: ApplyCompressionOverlayFn`, `gatherArtifacts: GatherArtifactsFn`, `enqueueModelCall: EnqueueModelCallFn` — and no pre-bound closure for any of them.
         * `[✅]`   `JobContextParams` carries the raw collaborators those bindings require and the root does not otherwise supply: `textSplitter: ITextSplitter`, `constructStoragePath: ConstructStoragePathFn`, `tokenizerDeps: CountTokensDeps`, `netlifyQueueUrl: string`, `netlifyApiKey: string`, `apiKeyForProvider: ApiKeyForProviderFn`.
         * `[✅]`   `createJobContext` constructs every deps object in one place, producers before consumers, and assigns each bound closure to the `IJobContext` member of the same name: `prepareModelJob`, `gatherArtifacts`, `enqueueModelCall`, `retryJob`, `calculateAffordability` and `compressPrompt`.
         * `[✅]`   `createPrepareModelJobContext` returns `PrepareModelJobDeps`, the type its consumer owns, and takes the root plus nothing else — every implementation it binds reaches it on the root. `IPrepareModelJobContext` and `isIPrepareModelJobContext` are deleted, the slice having no shape of its own to declare.
         * `[✅]`   `IRagContext` is deleted, and `ragService`, `indexingService` and `embeddingClient` leave `IJobContext`, `JobContextParams`, the guard, the mock and every test surface that enumerates them. `countTokens`, the fourth member of `IRagContext`, is already declared directly on `IJobContext` and stays there.
         * `[✅]`   `JobContext.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes, replacing the hand-rolled `createMockJobContextParams` override helper and the two recording factories.
         * `[✅]`   `ProcessSimpleJobFn`, `ProcessComplexJobFn` and `ProcessRenderJobFn` take the canonical `(deps, params, payload)` shape and return a two-arm union, each with its `Params`, `Payload`, success flavors and error arm declared beside it, matching `ProcessCompressJobFn`, which already has that shape. The contracts land here because every processor node and the dispatcher that constructs their arguments follows this one.
         * `[✅]`   `IJobContext.retryJob` and `JobContextParams.retryJob` carry the canonical `retryJob` module's types, and the factory binds it like every other member: `JobContextParams.retryJob` is `RetryJobFn` and `IJobContext.retryJob` is `BoundRetryJobFn`.
         * `[✅]`   The factory produces nothing for `saveResponse`: `createSaveResponseContext` and `ISaveResponseContext` are deleted, and the seven members the root carries solely for that function — `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent` and `debitTokens` — leave `IJobContext`, `JobContextParams`, the guard, the mock and every test surface that enumerates them.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Every field the factory copies today it copies unchanged. This node adds bindings, removes three RAG members and seven `saveResponse` members, and re-derives nothing else; no surviving member changes its type, its name or its source except `retryJob`, which moves from the legacy positional type to the canonical module's.
         * `[✅]`   `computeJobSig` stays on both the root and the params: the factory supplies it to `EnqueueModelCallDeps`, so the worker reads it and it is not a `saveResponse`-only member.
         * `[✅]`   `createPlanJobContext` and `createRenderJobContext` keep their current bodies, signatures and returns. `IPlanJobContext`, `IRenderJobContext`, `ILoggerContext`, `IFileContext`, `IModelContext`, `ITokenContext` and `INotificationContext` are unchanged.
         * `[✅]`   `dialectic-worker/index.ts` goes transiently non-compilable and is not edited here — it supplies the retired pre-bound closures, the three RAG constructions and the seven `saveResponse` members, and it is the composition-root node that closes this workstream.
         * `[✅]`   `netlifyResponse/index.ts` is the composition root for the `saveResponse` graph and assembles it itself; this factory binds none of those modules and carries no member for them. That node has already landed and is not edited here.
         * `[✅]`   The three processor implementations and `processJob.ts` go transiently non-compilable against the retyped `Fn` contracts and are not edited here; each has its own node after this one.
      * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is infra-layer composition: receive every implementation and raw collaborator the worker process needs, construct each deps object exactly once in dependency order, and hand out a root context whose members are already bound.
      * `[✅]`   The role is correct because a factory that receives implementations and returns bound closures is the only place the worker's graph has a single shape. When a call site builds a deps literal instead, that literal is the graph, and it exists once per call site with no contract holding the copies in agreement.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not import, construct or type `IRagService`, `IIndexingService`, `IEmbeddingClient`, `ICompressionStrategy` or `CompressionStrategyDeps`/`Params`/`Payload` anywhere in this module.
         * `[✅]`   Do not read a job row, decide affordability, compress, score or enqueue. The factory calls no bound closure it constructs.
         * `[✅]`   Do not edit `dialectic-worker/index.ts`, `processJob.ts`, `processSimpleJob.ts`, `processComplexJob.ts`, `processRenderJob.ts` or any module whose deps this factory assembles; each has its own node. This node declares the processor contracts; it does not conform any implementation to them.
         * `[✅]`   Do not construct the adapters and services the root constructs — `FileManagerService`, `PromptAssembler`, the wallet services, the provider adapters. They arrive on `JobContextParams` already instantiated, as they do today.
         * `[✅]`   Do not add a `provides` barrel. Consumers import this module's interface, guard and implementation directly, and changing that ripples every consumer's imports.
         * `[✅]`   Do not narrow any processor's deps slot below the context interface it receives today. Reshaping the signature is this node's work; deciding which collaborators each processor actually invokes is not.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/createJobContext` — the worker's dependency-injection boundary: the context contracts, their guards, their mock, and the factory and slicers that construct them.
      * `[✅]`   Inside boundary:
         * `[✅]`   Which deps object each worker module receives, and in what order those objects are constructed.
         * `[✅]`   The shape of the root context and of each slice handed to a job-type processor.
      * `[✅]`   Outside boundary:
         * `[✅]`   Where an implementation or a raw collaborator comes from — an import, an environment variable, a constructed service — all resolved by the worker root before it calls this factory.
         * `[✅]`   What any bound closure does when invoked, owned by the module that declares it.
         * `[✅]`   The `saveResponse` graph, assembled in `netlifyResponse/index.ts`.

   * `[✅]`   `deps`
      * `[✅]`   Removed provider: `_shared/services/rag_service.interface.ts` (`IRagService`), `_shared/services/indexing_service.interface.ts` (`IIndexingService`, `IEmbeddingClient`), `_shared/services/rag_service.mock.ts` (`MockRagService`) and `_shared/services/indexing_service.mock.ts` (`MockIndexingService`).
         * `[✅]`   Layer classification: shared service interfaces and mocks.
         * `[✅]`   Direction: inbound, and closed by this node — no file in this module imports from `rag_service` or `indexing_service` afterwards.
         * `[✅]`   Purpose retired: carrying retrieval and embedding collaborators down a graph in which victim selection is `candidateTokens × importance` and nothing embeds.
      * `[✅]`   Added provider: `../compressPrompt/compressPrompt.provides.ts` (`CompressPromptFn`, `CompressPromptDeps`, `BoundCompressPromptFn`).
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: lateral within `dialectic-worker`.
         * `[✅]`   Purpose: the unbound compression loop this factory binds, and the deps object it binds it with.
      * `[✅]`   Added provider: `../enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`enqueueCompressJobsFn`, `enqueueCompressJobsDeps`, `BoundenqueueCompressJobsFn`).
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: lateral within `dialectic-worker`.
         * `[✅]`   Purpose: the COMPRESS child dispatcher, bound and supplied to `compressPrompt`'s deps.
      * `[✅]`   Added provider: `_shared/utils/vector_utils.provides.ts` (`GetSortedCompressionCandidatesFn`, `GetSortedCompressionCandidatesDeps`, `BoundGetSortedCompressionCandidatesFn`).
         * `[✅]`   Layer classification: shared utility.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the embedding-free scorer, bound and supplied to `compressPrompt`'s deps.
      * `[✅]`   Added provider: `../applyCompressionOverlay/applyCompressionOverlay.provides.ts` (`ApplyCompressionOverlayFn`, `ApplyCompressionOverlayDeps`, `BoundApplyCompressionOverlayFn`).
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: lateral within `dialectic-worker`.
         * `[✅]`   Purpose: the overlay `gatherArtifacts` invokes post-gather, bound and supplied to that function's deps.
      * `[✅]`   Added provider: `_shared/utils/text_splitter.interface.ts` (`ITextSplitter`) and `_shared/utils/path_constructor.types.ts` (`ConstructStoragePathFn`).
         * `[✅]`   Layer classification: shared type surfaces.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the two raw collaborators `enqueueCompressJobsDeps` and `CompressPromptDeps` require and no existing `JobContextParams` member supplies.
      * `[✅]`   Added provider: `_shared/types/tokenizer.types.ts` (`CountTokensDeps`, `BoundCountTokensFn`, beside the already-imported `CountTokensFn`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: `GetSortedCompressionCandidatesDeps.countTokens` is a `BoundCountTokensFn`, so the factory binds the root's `CountTokensFn` against the root's `CountTokensDeps` once and supplies the bound form.
      * `[✅]`   Added provider: `../prepareModelJob/prepareModelJob.provides.ts` (`PrepareModelJobFn`, `PrepareModelJobDeps`), `../calculateAffordability/calculateAffordability.provides.ts` (`CalculateAffordabilityFn`, `CalculateAffordabilityDeps`, `BoundCalculateAffordabilityFn`), `../gatherArtifacts/gatherArtifacts.interface.ts` (`GatherArtifactsFn`, `GatherArtifactsDeps`) and `../enqueueModelCall/enqueueModelCall.interface.ts` (`EnqueueModelCallFn`, `EnqueueModelCallDeps`, `ApiKeyForProviderFn`).
         * `[✅]`   Layer classification: sibling app-layer modules.
         * `[✅]`   Direction: lateral within `dialectic-worker`; each already provides a bound type this interface imports, so no new direction is opened.
         * `[✅]`   Purpose: the unbound implementations and the deps shapes this factory now constructs rather than receives pre-bound.
      * `[✅]`   Added provider: `../retryJob/retryJob.provides.ts` (`RetryJobFn`, `RetryJobDeps`, `BoundRetryJobFn`).
         * `[✅]`   Layer classification: sibling app-layer module.
         * `[✅]`   Direction: lateral within `dialectic-worker`.
         * `[✅]`   Purpose: the canonical retry dispatcher, bound here and read from the root by `handleJob`. It replaces the locally declared legacy `RetryJobFn`, which this node deletes.
      * `[✅]`   Removed provider: the seven collaborators the root carried only for `saveResponse` — `continueJob/continueJob.provides.ts` (`ContinueJobFn`), `_shared/utils/resolveFinishReason.ts`, `_shared/utils/isIntermediateChunk.ts`, `_shared/utils/determineContinuation/determineContinuation.interface.ts`, `_shared/utils/buildUploadContext/buildUploadContext.interface.ts`, `_shared/utils/jsonSanitizer/jsonSanitizer.interface.ts` and `_shared/utils/debitTokens.interface.ts` — with the members they typed and the `ISaveResponseContext` slice they fed.
         * `[✅]`   Layer classification: sibling module and shared utilities.
         * `[✅]`   Direction: inbound, and closed by this node.
         * `[✅]`   Purpose retired: carrying a second process's collaborators on this process's root. `netlifyResponse/index.ts` imports each of them directly.
      * `[✅]`   Confirm:
         * `[✅]`   No dependency is injected into the factory itself. `createJobContext` takes one `JobContextParams` object and returns one `IJobContext`; it has no deps slot, and this node adds none.
         * `[✅]`   The processor contracts this node declares introduce no import into `dialectic-service/dialectic.interface.ts` that it does not already hold: `SupabaseClient`, `Database`, `DialecticJobRow` and the payload arms are all declared or imported there today.
         * `[✅]`   No reverse dependency: none of `compressPrompt`, `calculateAffordability`, `enqueueCompressJobs`, `vector_utils`, `applyCompressionOverlay`, `gatherArtifacts` or `enqueueModelCall` imports this module's factory. `prepareModelJob.interface.ts` imports three function types from `JobContext.interface.ts` — `ApplyInputsRequiredScopeFn`, `ValidateWalletBalanceFn`, `ValidateModelCostRatesFn` — and this node neither adds to that set nor removes from it.
      * `[✅]`   `context_slice`
         * `[✅]`   From each bound module: its unbound function type and its deps type only — never its params, payload or return types, which the factory neither constructs nor reads.
         * `[✅]`   From `retryJob/retryJob.provides.ts`: `RetryJobFn`, `RetryJobDeps` and `BoundRetryJobFn` only.
         * `[✅]`   From `_shared`: `ITextSplitter`, `ConstructStoragePathFn`, `CountTokensDeps` and `BoundCountTokensFn` only.

   * `[✅]`   `createJobContext.interface.test.ts`
      * `[✅]`   The `IRagContext` surface case is deleted with the interface it proved.
      * `[✅]`   The `ISaveResponseContext` surface case is deleted with the interface it proved.
      * `[✅]`   The `IPrepareModelJobContext` surface case is deleted; a case in its place proves `createPrepareModelJobContext`'s return type is `PrepareModelJobDeps` by typed assignment of a `declare const` of that type to the slicer's declared return.
      * `[✅]`   The `IJobContext` and `JobContextParams` surface cases each enumerate every key the `JobContext.interface.ts` element declares for that type, asserting each name. Neither asserts a member count.
      * `[✅]`   A case proves `retryJob`'s two forms by typed assignment: a `declare const` of `RetryJobFn` assigns to `JobContextParams['retryJob']`, and a `declare const` of `BoundRetryJobFn` assigns to `IJobContext['retryJob']`.
      * `[✅]`   A case proves each processor's params surface exhaustively by typed assignment — `Record<keyof ProcessSimpleJobParams, true>` over `dbClient`, and the same for the complex and render params — each asserting one.
      * `[✅]`   A case proves each processor's payload surface the same way over `job`, each asserting one.
      * `[✅]`   A case proves each processor's return union by typed assignment: for the simple processor, a dispatched value and a deferred value each assign to `ProcessSimpleJobSuccessReturn`, that assigns to `ProcessSimpleJobReturn`, and an error value assigns to `ProcessSimpleJobReturn`; the complex and render processors take the same form with their single success shapes.
      * `[✅]`   A case proves each processor's `Fn` type accepts its declared deps, params and payload and returns its own `Promise<…Return>`.
      * `[✅]`   A case proves each retyped member by typed assignment: a `declare const` of `PrepareModelJobFn` assigns to `JobContextParams['prepareModelJob']`, of `GatherArtifactsFn` to `JobContextParams['gatherArtifacts']`, and of `EnqueueModelCallFn` to `JobContextParams['enqueueModelCall']` — proving each slot takes the unbound form.
      * `[✅]`   A case proves the root keeps the bound forms by typed assignment: a `declare const` of `BoundPrepareModelJobFn` assigns to `IJobContext['prepareModelJob']`, of `BoundGatherArtifactsFn` to `IJobContext['gatherArtifacts']`, and of `BoundEnqueueModelCallFn` to `IJobContext['enqueueModelCall']`.
      * `[✅]`   The `ILoggerContext`, `IFileContext`, `IModelContext`, `ITokenContext`, `INotificationContext`, `IPlanJobContext` and `IRenderJobContext` surface cases are unchanged. The file imports no builders, its fixtures being typed literals, surface records and `declare const` bindings.

   * `[✅]`   dialectic-service/`dialectic.interface.ts`
      * `[✅]`   `ProcessSimpleJobParams`, `ProcessComplexJobParams` and `ProcessRenderJobParams` each declare `dbClient: SupabaseClient<Database>` and nothing else. `dbClient` is a per-invocation handle, not a collaborator and not data.
      * `[✅]`   `ProcessSimpleJobPayload` declares `job: DialecticJobRow & { payload: DialecticExecuteJobPayload }`; `ProcessComplexJobPayload` declares `job: DialecticJobRow & { payload: DialecticPlanJobPayload }`; `ProcessRenderJobPayload` declares `job: DialecticJobRow`. The row is the data each processor operates on, and it carries its own `user_id`, `session_id`, `iteration_number` and payload, so no processor takes `projectOwnerUserId` or `authToken` as a separate value.
      * `[✅]`   `ProcessSimpleJobDispatchedReturn` is `{ dispatched: true }` and `ProcessSimpleJobDeferredReturn` is `{ deferred: true }`; `ProcessSimpleJobSuccessReturn` is their union; `ProcessSimpleJobErrorReturn` is `{ error: Error; retriable: boolean }`; `ProcessSimpleJobReturn` is the success arm union the error arm. The two success flavors are the dispatcher's two non-error outcomes, which that function narrows and reports rather than treating alike.
      * `[✅]`   `ProcessComplexJobSuccessReturn` is `{ planned: true }`, `ProcessComplexJobErrorReturn` is `{ error: Error; retriable: boolean }`, and `ProcessComplexJobReturn` is their union.
      * `[✅]`   `ProcessRenderJobSuccessReturn` is `{ rendered: true }`, `ProcessRenderJobErrorReturn` is `{ error: Error; retriable: boolean }`, and `ProcessRenderJobReturn` is their union.
      * `[✅]`   `ProcessSimpleJobFn` becomes `(deps: IJobContext, params: ProcessSimpleJobParams, payload: ProcessSimpleJobPayload) => Promise<ProcessSimpleJobReturn>`; `ProcessComplexJobFn` takes `deps: IPlanJobContext` and its own three types; `ProcessRenderJobFn` takes `deps: IRenderJobContext` and its own three types. Each deps slot is the context interface that processor receives today, unnarrowed.
      * `[✅]`   `IJobProcessors` keeps its five member names and their `Fn` types; `ProcessCompressJobFn` and `PlanComplexStageFn` are unchanged.

   * `[✅]`   `JobContext.interface.ts`
      * `[✅]`   `IRagContext` is deleted, with the `IRagService`, `IIndexingService` and `IEmbeddingClient` imports.
      * `[✅]`   `IPrepareModelJobContext` is deleted. `PrepareModelJobDeps` is imported from `../prepareModelJob/prepareModelJob.interface.ts` as the slicer's return type, beside the `PrepareModelJobParams`, `PrepareModelJobPayload` and `PrepareModelJobReturn` imports already present.
      * `[✅]`   `ISaveResponseContext` is deleted, with the `BoundEnqueueRenderJobFn` and `BoundDebitTokens` imports that typed its two members.
      * `[✅]`   The locally declared `RetryJobFn` — the six-positional type returning `Promise<{ error?: Error }>` — is deleted, with the `FailedAttemptError` import it required. `RetryJobFn` and `BoundRetryJobFn` are imported from `../retryJob/retryJob.interface.ts` instead.
      * `[✅]`   `IJobContext` extends `IPlanJobContext` and `IRenderJobContext`, and declares `getAiProviderAdapter: GetAiProviderAdapterFn`, `getAiProviderConfig: GetAiProviderConfigFn`, `countTokens: CountTokensFn`, `adminTokenWalletService: IAdminTokenWalletService`, `userTokenWalletService: IUserTokenWalletService`, `pickLatest: PickLatestFn`, `applyInputsRequiredScope: ApplyInputsRequiredScopeFn`, `validateWalletBalance: ValidateWalletBalanceFn`, `validateModelCostRates: ValidateModelCostRatesFn`, `getMaxOutputTokens: GetMaxOutputTokensFn`, `promptAssembler: IPromptAssembler`, `getSeedPromptForStage: GetSeedPromptForStageFn`, `computeJobSig: ComputeJobSig`, `retryJob: BoundRetryJobFn`, `gatherArtifacts: BoundGatherArtifactsFn`, `prepareModelJob: BoundPrepareModelJobFn`, `enqueueModelCall: BoundEnqueueModelCallFn`, `calculateAffordability: BoundCalculateAffordabilityFn` and `compressPrompt: BoundCompressPromptFn`. `ragService`, `indexingService`, `embeddingClient`, `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent` and `debitTokens` are not members of it.
      * `[✅]`   `JobContextParams` declares `logger: ILogger`, `fileManager: IFileManager`, `downloadFromStorage: DownloadFromStorageFn`, `deleteFromStorage: DeleteFromStorageFn`, `getAiProviderAdapter: GetAiProviderAdapterFn`, `getAiProviderConfig: GetAiProviderConfigFn`, `countTokens: CountTokensFn`, `adminTokenWalletService: IAdminTokenWalletService`, `userTokenWalletService: IUserTokenWalletService`, `notificationService: NotificationServiceType`, `getSeedPromptForStage: GetSeedPromptForStageFn`, `promptAssembler: IPromptAssembler`, `getGranularityPlanner: GetGranularityPlannerFn`, `planComplexStage: PlanComplexStageFn`, `findSourceDocuments: FindSourceDocumentsFn`, `documentRenderer: IDocumentRenderer`, `assembleContributionChain: AssembleContributionChainFn`, `loadDocumentTemplate: LoadDocumentTemplateFn`, `mergeChunkContent: MergeChunkContentFn`, `pickLatest: PickLatestFn`, `applyInputsRequiredScope: ApplyInputsRequiredScopeFn`, `validateWalletBalance: ValidateWalletBalanceFn`, `validateModelCostRates: ValidateModelCostRatesFn`, `getMaxOutputTokens: GetMaxOutputTokensFn`, `computeJobSig: ComputeJobSig`, `retryJob: RetryJobFn`, `gatherArtifacts: GatherArtifactsFn`, `prepareModelJob: PrepareModelJobFn`, `enqueueModelCall: EnqueueModelCallFn`, `compressPrompt: CompressPromptFn`, `calculateAffordability: CalculateAffordabilityFn`, `enqueueCompressJobs: enqueueCompressJobsFn`, `getSortedCompressionCandidates: GetSortedCompressionCandidatesFn`, `applyCompressionOverlay: ApplyCompressionOverlayFn`, `textSplitter: ITextSplitter`, `constructStoragePath: ConstructStoragePathFn`, `tokenizerDeps: CountTokensDeps`, `netlifyQueueUrl: string`, `netlifyApiKey: string` and `apiKeyForProvider: ApiKeyForProviderFn`, with the imports each requires. `ragService`, `indexingService`, `embeddingClient`, `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent` and `debitTokens` are not members of it.
      * `[✅]`   `RandomUUIDFn` is declared in this file as the type of `JobContextParams.randomUUID`, the property carrying an inline function type today.
      * `[✅]`   `FindSourceDocumentsFn`, `PickLatestFn`, `ApplyInputsRequiredScopeFn`, `ValidateWalletBalanceFn`, `ValidateModelCostRatesFn`, `BoundPrepareModelJobFn`, `BoundGatherArtifactsFn` and every surviving context interface keep their declarations.
      * `[✅]`   `ResolveFinishReasonFn`, `IsIntermediateChunkFn`, `DetermineContinuationFn` and `BuildUploadContextFn` keep their declarations even though no member in this file references them afterwards. Nine files outside this module import them from here — `prepareResponseContent`'s interface, mock and test, `saveContributionResponse`'s interface, test and integration test, `saveCompressedResponse`'s interface and integration test, `saveResponse.ts`, and `buildUploadContext`'s own mock and interface test. Deleting them breaks the `saveResponse` graph; relocating them to the modules that own the functions they type is another node's work.

   * `[✅]`   `createJobContext.interaction.spec`
      * `[✅]`   `createJobContext` has one branch and no conditions: it constructs the bound closures in dependency order, then returns one `IJobContext` literal. Every member not named below is copied from the identically named `JobContextParams` member, exactly as it is copied today.
      * `[✅]`   Binding order, producers first, each closure capturing `params` from the factory's own scope, and `boundPrepareModelJob` capturing the `root` binding the return literal is assigned to:
         * `[✅]`   `boundCountTokens: BoundCountTokensFn` = `(payload, modelConfig) => params.countTokens(params.tokenizerDeps, payload, modelConfig)`.
         * `[✅]`   `boundGetSortedCompressionCandidates: BoundGetSortedCompressionCandidatesFn` = `(p, pl) => params.getSortedCompressionCandidates({ logger: params.logger, countTokens: boundCountTokens }, p, pl)`.
         * `[✅]`   `boundEnqueueCompressJobs: BoundenqueueCompressJobsFn` = `(p, pl) => params.enqueueCompressJobs({ logger: params.logger, textSplitter: params.textSplitter, countTokens: params.countTokens, constructStoragePath: params.constructStoragePath }, p, pl)`.
         * `[✅]`   `boundCompressPrompt: BoundCompressPromptFn` = `(p, pl) => params.compressPrompt({ logger: params.logger, getSortedCompressionCandidates: boundGetSortedCompressionCandidates, enqueueCompressJobs: boundEnqueueCompressJobs, constructStoragePath: params.constructStoragePath, downloadFromStorage: params.downloadFromStorage, countTokens: params.countTokens }, p, pl)`.
         * `[✅]`   `boundCalculateAffordability: BoundCalculateAffordabilityFn` = `(p, pl) => params.calculateAffordability({ logger: params.logger, countTokens: params.countTokens, getMaxOutputTokens: params.getMaxOutputTokens }, p, pl)`, carrying no `compressPrompt`.
         * `[✅]`   `boundEnqueueModelCall: BoundEnqueueModelCallFn` = `(p, pl) => params.enqueueModelCall({ logger: params.logger, netlifyQueueUrl: params.netlifyQueueUrl, netlifyApiKey: params.netlifyApiKey, apiKeyForProvider: params.apiKeyForProvider, computeJobSig: params.computeJobSig }, p, pl)`.
         * `[✅]`   `boundApplyCompressionOverlay: BoundApplyCompressionOverlayFn` = `(p, pl) => params.applyCompressionOverlay({ logger: params.logger, downloadFromStorage: params.downloadFromStorage }, p, pl)`.
         * `[✅]`   `boundGatherArtifacts: BoundGatherArtifactsFn` = `(p, pl) => params.gatherArtifacts({ logger: params.logger, pickLatest: params.pickLatest, downloadFromStorage: params.downloadFromStorage, applyCompressionOverlay: boundApplyCompressionOverlay }, p, pl)`.
         * `[✅]`   `boundRetryJob: BoundRetryJobFn` = `(p, pl) => params.retryJob({ logger: params.logger, notificationService: params.notificationService }, p, pl)`.
         * `[✅]`   `boundPrepareModelJob: BoundPrepareModelJobFn` = `(p, pl) => params.prepareModelJob(createPrepareModelJobContext(root), p, pl)`, where `root` is the `IJobContext` this factory is returning.
      * `[✅]`   Return: the factory assigns its `IJobContext` literal to `root` and returns it. The literal assigns `prepareModelJob: boundPrepareModelJob`, `gatherArtifacts: boundGatherArtifacts`, `enqueueModelCall: boundEnqueueModelCall`, `retryJob: boundRetryJob`, `calculateAffordability: boundCalculateAffordability` and `compressPrompt: boundCompressPrompt`, and copies every other member the `JobContext.interface.ts` element declares on `IJobContext` from the `JobContextParams` member of the same name.
      * `[✅]`   `createPrepareModelJobContext(root: IJobContext): PrepareModelJobDeps` takes `root` and nothing else, and projects each member `PrepareModelJobDeps` declares from the root member of the same name, except `tokenWalletService`, which it reads from `root.userTokenWalletService`. The slicer's `boundEnqueueModelCall`, `compressPromptFn` and `calculateAffordabilityFn` parameters and its two inline binding closures are gone.
      * `[✅]`   `createPlanJobContext` and `createRenderJobContext` keep their current bodies and signatures; no branch, no member and no argument changes. `createSaveResponseContext` is deleted with the slice type it returned.
      * `[✅]`   Ordering and side effects: the factory performs no I/O, calls no bound closure it constructs, and returns synchronously. Each bound closure is constructed exactly once per `createJobContext` call, so every consumer of one root shares one instance.

   * `[✅]`   _shared/`dialectic.mock.ts`
      * `[✅]`   Thirteen owned object types this node declares take the four symbols each, production-named — `<Type>Overrides` as `Partial<T>`, `build<Type>`, `<Type>Corruptions` as `{ [K in keyof T]?: unknown }` and `invalidate<Type>` returning `unknown`: `ProcessSimpleJobParams`, `ProcessComplexJobParams`, `ProcessRenderJobParams`, `ProcessSimpleJobPayload`, `ProcessComplexJobPayload`, `ProcessRenderJobPayload`, `ProcessSimpleJobDispatchedReturn`, `ProcessSimpleJobDeferredReturn`, `ProcessSimpleJobErrorReturn`, `ProcessComplexJobSuccessReturn`, `ProcessComplexJobErrorReturn`, `ProcessRenderJobSuccessReturn` and `ProcessRenderJobErrorReturn`.
      * `[✅]`   `ProcessSimpleJobSuccessReturn`, `ProcessSimpleJobReturn`, `ProcessComplexJobReturn` and `ProcessRenderJobReturn` are unions and take nothing of their own; each object-type member of each union is built by its own builder above.
      * `[✅]`   Each params builder defaults `dbClient` to `createMockSupabaseClient(undefined, {}).client` cast to `SupabaseClient<Database>` — the external-client cast this file already makes — and declares no other member.
      * `[✅]`   Each payload builder composes the row and payload builders this file already exports rather than a hand-rolled literal: `buildProcessSimpleJobPayload` returns `{ job: buildDialecticJobRow({ job_type: 'EXECUTE', payload: buildDialecticExecuteJobPayload() }) }`, `buildProcessComplexJobPayload` the same with `'PLAN'` and `buildDialecticPlanJobPayload()`, and `buildProcessRenderJobPayload` `{ job: buildDialecticJobRow() }`.
      * `[✅]`   Each success-flavor builder returns its single discriminant — `{ dispatched: true }`, `{ deferred: true }`, `{ planned: true }`, `{ rendered: true }`. Each error-arm builder defaults `error` to `new Error("mock-process-simple-job-error")`, `new Error("mock-process-complex-job-error")` or `new Error("mock-process-render-job-error")` and `retriable` to `false`. The three error arms are structurally identical and each still takes its own per-type quartet; no generic or shared invalidator stands in for them.
      * `[✅]`   Three function mocks, one per owned function type: `mockProcessSimpleJob: ProcessSimpleJobFn` returning `buildProcessSimpleJobDispatchedReturn()`, `mockProcessComplexJob: ProcessComplexJobFn` returning `buildProcessComplexJobSuccessReturn()` and `mockProcessRenderJob: ProcessRenderJobFn` returning `buildProcessRenderJobSuccessReturn()` — identical signatures, no extra parameters, no options bag, no recording.
      * `[✅]`   `_JobProcessorsDummyImpl` assigns those three function mocks to its `processSimpleJob`, `processComplexJob` and `processRenderJob` members, so the class satisfies `IJobProcessors` under the reshaped contracts; the `(..._args: any[]): Promise<void>` declarations and the `deno-lint-ignore no-explicit-any` comments above them are deleted with the `any` they suppressed.
      * `[✅]`   `createMockJobProcessors`, `MockJobProcessorsSpies` and the spy wiring around them are otherwise untouched; eight suites outside this module consume them.
      * `[✅]`   Every other export in this file is unchanged.

   * `[✅]`   `JobContext.mock.ts`
      * `[✅]`   Two owned object types take the four symbols each, production-named: `JobContextParamsOverrides` as `Partial<JobContextParams>`, `buildJobContextParams`, `JobContextParamsCorruptions` as `{ [K in keyof JobContextParams]?: unknown }`, `invalidateJobContextParams` returning `unknown`; and the same quartet for `IJobContext`.
      * `[✅]`   `buildJobContextParams` supplies a default for every member and returns `overrides ? { ...base, ...overrides } : base`. The eight unbound-implementation members default to production-typed functions returning that module's own built success value; `textSplitter` defaults to a production-typed `ITextSplitter`; `constructStoragePath` to a production-typed function returning a default `ConstructedPath`; `tokenizerDeps` to a `CountTokensDeps` whose members are the mock tokenizer closures; `netlifyQueueUrl`, `netlifyApiKey` to strings; `apiKeyForProvider` to a production-typed function. Every RAG default — `ragService`, `indexingService`, `embeddingClient` — is deleted with its member.
      * `[✅]`   `buildIJobContext` composes `buildJobContextParams` and maps each member the `JobContext.interface.ts` element declares on `IJobContext` from the `JobContextParams` member of the same name, except the six the factory binds, which take this file's bound-form defaults. `buildJobContextParams` defaults `retryJob` to the canonical `mockRetryJob` imported from `retryJob.mock.ts`.
      * `[✅]`   The imported types this file builds — the context slices — take their builders from their owners: `buildIPlanJobContext` and `buildIRenderJobContext` stay, and `buildPrepareModelJobDeps` is imported from `prepareModelJob.mock.ts` rather than re-declared here.
      * `[✅]`   Deleted: `createMockJobContextParams` with its hand-rolled overrides type, `createMockRootContext`, `buildIPrepareModelJobContext`, `createCompressPromptFn` and `createCalculateAffordabilityFn` with their `recordedCompressDeps`, `recordedAffordabilityDeps` and `recordedAffordabilityParams` arrays, `createContractCalculateAffordabilityFnThatCallsCompressPrompt`, `createMockBoundEnqueueModelCall`, `createMockBoundEnqueueRenderJob`, `createMockBoundGatherArtifacts`, and the `MockRagService`, `MockIndexingService` and `createJobContext` imports. A test needing recorded arguments wraps a production-typed function with the runner's spy facility at its own call site.

   * `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
      * `[✅]`   A case checklist per guard this node adds, its fixtures drawn from `dialectic.mock.ts`'s builders and invalidators and never hand-rolled: the builder's valid default accepted; valid overrides accepted; `null`, `undefined`, a primitive and an array rejected; each property corrupted in turn rejected; each required property omitted by rest-destructure rejected.
      * `[✅]`   The seven return-flavor guards are proven to discriminate rather than merely to accept: `isProcessSimpleJobDispatchedReturn` accepts `buildProcessSimpleJobDispatchedReturn()` and rejects both `buildProcessSimpleJobDeferredReturn()` and `buildProcessSimpleJobErrorReturn()`, and each of the other six rejects every flavor but its own. Arranged in one file so a collapsed discriminant fails an assertion.
      * `[✅]`   `isProcessSimpleJobSuccessReturn` accepts both success flavors and rejects the error arm.
      * `[✅]`   Each payload guard is proven to reject a row carrying another arm's payload: `isProcessSimpleJobPayload` rejects a row built with `buildDialecticPlanJobPayload()`, and `isProcessComplexJobPayload` rejects one built with `buildDialecticExecuteJobPayload()`.
      * `[✅]`   `isDialecticJobRow` takes its own checklist over `buildDialecticJobRow` and `invalidateDialecticJobRow`, one corrupted case per column it checks and one omitted case per required column.
      * `[✅]`   No foreign guard is tested here: `isDialecticExecuteJobPayload`, `isDialecticPlanJobPayload` and `isDialecticBaseJobPayload` are exercised only indirectly, through the corrupted-property cases of the guards that delegate to them.
      * `[✅]`   Every existing case in this file keeps its arrangement and its assertions.

   * `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
      * `[✅]`   Fifteen guards are added: `isDialecticJobRow`, `isProcessSimpleJobParams`, `isProcessComplexJobParams`, `isProcessRenderJobParams`, `isProcessSimpleJobPayload`, `isProcessComplexJobPayload`, `isProcessRenderJobPayload`, `isProcessSimpleJobDispatchedReturn`, `isProcessSimpleJobDeferredReturn`, `isProcessSimpleJobSuccessReturn`, `isProcessSimpleJobErrorReturn`, `isProcessComplexJobSuccessReturn`, `isProcessComplexJobErrorReturn`, `isProcessRenderJobSuccessReturn` and `isProcessRenderJobErrorReturn` — one per type this node declares, less the three top-level `Return` unions.
      * `[✅]`   `isDialecticJobRow` checks `isRecord` and every column of the row: `id`, `session_id`, `user_id`, `stage_slug`, `status`, `attempt_count`, `max_retries`, `iteration_number` and `created_at` present and of their declared type; `job_type`, `parent_job_id`, `prerequisite_job_id`, `target_contribution_id`, `idempotency_key`, `started_at`, `completed_at`, `error_details` and `results` present and either null or of their declared type; `payload` present. It is written here because `DialecticJobRow` is aliased in `dialectic-service/dialectic.interface.ts`, whose guards this file holds, and because the three payload guards below cannot check their row property without it.
      * `[✅]`   Each params guard checks `isRecord` and that `dbClient` is present and an object, the same single-member check `isPrepareModelJobParams` makes.
      * `[✅]`   Each payload guard checks `isRecord`, calls `isDialecticJobRow` on `job`, and delegates that row's `payload` to the guard that owns the arm — `isDialecticExecuteJobPayload` for the simple payload and `isDialecticPlanJobPayload` for the complex one, both already exported from this file. `isProcessRenderJobPayload` stops at `isDialecticJobRow`, its declared row carrying no narrowed arm. No arm's member checks are inlined at a delegation site.
      * `[✅]`   Every return guard is a boolean discriminant check and throws nothing: each flavor guard tests its own literal member and rejects the others', each error guard tests that `error` is an `Error` and `retriable` a boolean, and `isProcessSimpleJobSuccessReturn` returns true for either flavor and false otherwise. These select a branch in the runner and in `processJob`, and a guard that throws cannot select a branch.
      * `[✅]`   No guard is written for `ProcessSimpleJobReturn`, `ProcessComplexJobReturn` or `ProcessRenderJobReturn`: a consumer discriminates the two arms with the arm guards above, as it does for `PrepareModelJobReturn`, which declares no union guard either.
      * `[✅]`   Every existing guard in this file is unchanged.

   * `[✅]`   `JobContext.guard.test.ts`
      * `[✅]`   The `isIRagContext` describe block is deleted with the guard it proved.
      * `[✅]`   The `isIPrepareModelJobContext` describe block is deleted; the shape it checked is `PrepareModelJobDeps`, proven by `isPrepareModelJobDeps` in the `prepareModelJob` module's own guard test.
      * `[✅]`   The `isISaveResponseContext` describe block is deleted with the guard it proved.
      * `[✅]`   The `isIJobContext` case checklist covers every member the `JobContext.interface.ts` element declares on `IJobContext`, its fixtures drawn from `buildIJobContext` and `invalidateIJobContext`.
      * `[✅]`   The `isILoggerContext`, `isIFileContext`, `isIModelContext`, `isITokenContext`, `isINotificationContext`, `isIPlanJobContext` and `isIRenderJobContext` blocks are unchanged.

   * `[✅]`   `JobContext.guard.ts`
      * `[✅]`   `isIRagContext` is deleted, with the `IRagContext` import.
      * `[✅]`   `isIPrepareModelJobContext` is deleted, with the `IPrepareModelJobContext` import.
      * `[✅]`   `isISaveResponseContext` is deleted, with the `ISaveResponseContext` import.
      * `[✅]`   `isIJobContext` checks every member the `JobContext.interface.ts` element declares on `IJobContext`, and delegates to `isIPlanJobContext` and `isIRenderJobContext` for the surfaces those interfaces own.
      * `[✅]`   `isILoggerContext`, `isIFileContext`, `isIModelContext`, `isITokenContext`, `isINotificationContext`, `isIPlanJobContext` and `isIRenderJobContext` are unchanged.

   * `[✅]`   `createJobContext.test.ts`
      * `[✅]`   Every case builds params through `buildJobContextParams`, overriding only the members it asserts on. The `createMockJobContextParams` import is replaced.
      * `[✅]`   The `createPrepareModelJobContext` describe blocks are restated against the one-argument slicer: a case asserts the returned object carries each member `PrepareModelJobDeps` declares, taken from the root member of the same name and, for `tokenWalletService`, from `root.userTokenWalletService`; a case asserts that a root member `PrepareModelJobDeps` does not declare is absent from it.
      * `[✅]`   New case: `createJobContext` returns a `prepareModelJob` that is not the `params.prepareModelJob` it was given — the factory bound it — and invoking it passes the unbound implementation a deps object carrying exactly the eight `PrepareModelJobDeps` members. Arranged with a production-typed `PrepareModelJobFn` the case declares and wraps in a spy, so the assertion fails if the factory copies instead of binds.
      * `[✅]`   New case: invoking `root.prepareModelJob` reaches `params.calculateAffordability` with a deps object carrying `logger`, `countTokens` and `getMaxOutputTokens` and no `compressPrompt`, and reaches `params.compressPrompt` with a deps object carrying `logger`, `getSortedCompressionCandidates`, `enqueueCompressJobs`, `constructStoragePath`, `downloadFromStorage` and `countTokens` and no `ragService`, `embeddingClient` or `tokenWalletService`. Both collaborators are production-typed functions the case declares and spies on, asserted in one file so a collapsed binding fails an assertion.
      * `[✅]`   New case: the deps object reaching `params.compressPrompt` carries a `getSortedCompressionCandidates` that, when invoked, calls `params.getSortedCompressionCandidates` with a deps object whose `countTokens` is the bound two-argument form — invoking it with a payload and a model config reaches `params.countTokens` with `params.tokenizerDeps` as its first argument.
      * `[✅]`   New case: the deps object reaching `params.compressPrompt` carries an `enqueueCompressJobs` that, when invoked, calls `params.enqueueCompressJobs` with a deps object carrying `logger`, `textSplitter`, `countTokens` and `constructStoragePath`.
      * `[✅]`   New case: `root.gatherArtifacts` is bound, not copied, and invoking it passes `params.gatherArtifacts` a deps object carrying `logger`, `pickLatest`, `downloadFromStorage` and an `applyCompressionOverlay` that delegates to `params.applyCompressionOverlay` with a `logger` and `downloadFromStorage` deps object.
      * `[✅]`   New case: `root.enqueueModelCall` is bound, not copied, and invoking it passes `params.enqueueModelCall` a deps object carrying `logger`, `netlifyQueueUrl`, `netlifyApiKey`, `apiKeyForProvider` and `computeJobSig`.
      * `[✅]`   New case: two calls to `root.prepareModelJob` reach `params.compressPrompt` with the same `getSortedCompressionCandidates` and `enqueueCompressJobs` function identities — the graph is constructed once per root, not once per invocation.
      * `[✅]`   New case: `createJobContext(buildJobContextParams())` returns an object on which `'ragService' in result`, `'indexingService' in result` and `'embeddingClient' in result` are each false.
      * `[✅]`   New case: `root.retryJob` is bound, not copied, and invoking it passes `params.retryJob` a deps object carrying `logger` and `notificationService`.
      * `[✅]`   The existing cases for `getSeedPromptForStage`, `computeJobSig`, `isIJobContext`, `createPlanJobContext` and `createRenderJobContext` keep their arrangements and assertions, less the retired members.
      * `[✅]`   Deleted with the behavior they proved: the `createSaveResponseContext` case, the `sanitizeJsonContent` case, the case asserting `result.prepareModelJob` equals the params override, the case asserting `result.enqueueModelCall` equals the params override, the `calculateAffordability delegates … with compressPrompt bound from root` case and its `recordedCompressDeps` assertions over `ragService`, `embeddingClient` and `tokenWalletService`, and the `TypeScript assignment fails if pickLatest or downloadFromStorage are supplied to IPrepareModelJobContext` case with its three `as unknown as` casts.

   * `[✅]`   `construction`
      * `[✅]`   `createJobContext` is the worker's single deps-object assembler: one exported factory function taking one typed `JobContextParams` and returning a fully constructed `IJobContext`. No class, no partially constructed instance, no optional field, no default value — every member is set explicitly from a params member or from a closure built in this file.
      * `[✅]`   The three surviving slicers stay pure projections of a constructed root: each takes `root: IJobContext` and returns a narrower object, and none constructs a service, reads an environment variable or performs I/O.
      * `[✅]`   Binding is one-shot per root. Every closure is constructed in the factory body before the return literal, so no consumer can observe a half-built graph and no call site can construct a second one.

   * `[✅]`   `createJobContext.ts`
      * `[✅]`   `createJobContext` constructs the bound closures in the `interaction.spec`'s order ahead of its return, and returns the literal that element specifies. The `// From IRagContext` block loses `ragService`, `indexingService` and `embeddingClient` and keeps `countTokens`.
      * `[✅]`   `createPrepareModelJobContext` drops its `boundEnqueueModelCall`, `compressPromptFn` and `calculateAffordabilityFn` parameters and its two inline binding closures, takes `root: IJobContext` alone, returns `PrepareModelJobDeps`, and maps the eight members from the root.
      * `[✅]`   Deleted imports: `IPrepareModelJobContext`, `CompressPromptFn` and `CalculateAffordabilityFn`, the unbound types the retired parameters carried. `BoundCompressPromptFn` and `BoundCalculateAffordabilityFn` stay, annotating the two closures this factory constructs. Added imports: `PrepareModelJobDeps`, and the deps types and bound function types named in the `deps` element.
      * `[✅]`   `createSaveResponseContext` is deleted, with the `ISaveResponseContext`, `BoundEnqueueRenderJobFn` and `BoundDebitTokens` imports it required. `createPlanJobContext` and `createRenderJobContext` are unchanged, statement for statement.

   * `[✅]`   `createJobContext.integration.test.ts`
      * `[✅]`   Its root-context assertion case drops the `ragService`, `indexingService` and `embeddingClient` equality assertions and the `prepareModelJob` equality assertion, which no longer holds now that the factory binds rather than copies; every other member equality assertion stands.
      * `[✅]`   Its `createPrepareModelJobContext` cases call the one-argument slicer and assert against `PrepareModelJobDeps` rather than a deleted slice type.
      * `[✅]`   The chain this suite proves is the real one this factory now assembles: real `createJobContext` → real `prepareModelJob` → real `calculateAffordability` and real `compressPrompt` → real `getSortedCompressionCandidates` and real `enqueueCompressJobs`, with only the Supabase client and the queue POST mocked. No repo-owned function in that chain is mocked, stubbed or replaced by a builder.
      * `[✅]`   A case drives a within-budget working set through that chain and asserts the queue receives one POST; a case drives an over-budget EXECUTE working set and asserts COMPRESS rows are inserted and the dispatcher returns the deferral, having called no RAG collaborator because none exists to call.
      * `[✅]`   The `getSortedCompressionCandidates` import replaces the `getSortedCompressionCandidates`-from-`vector_utils.ts` import with the `vector_utils.provides.ts` one, and the `compressPrompt`, `calculateAffordability`, `prepareModelJob` and `enqueueModelCall` implementation imports move to their modules' `provides` barrels.
      * `[✅]`   Its existing `createPlanJobContext` and `createRenderJobContext` structural assertions are unchanged.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports the unbound function types and deps types of the worker modules it assembles and the shared type surfaces they require, and exports the context contracts, their guards, their mock and the factory outward to `dialectic-worker/index.ts`, `processJob.ts` and the job-type processors.
      * `[✅]`   The RAG edges are severed here: after this node no file in this module imports from `rag_service` or `indexing_service`, which is what lets those files be deleted in the RAG-removal node without a further edit to this module.
      * `[✅]`   No cycle: every module this factory binds is imported by it and imports nothing from it except the three pure function types `prepareModelJob.interface.ts` already takes from `JobContext.interface.ts`, which are declarations with no runtime edge.
      * `[✅]`   This module has no `provides` barrel; consumers import its interface, guard, mock and implementation directly, as they do now.

   * `[✅]`   `requirements`
      * `[✅]`   `IJobContext` and `JobContextParams` each declare exactly the members the `JobContext.interface.ts` element names for that type — interface test, exhaustive key record per type.
      * `[✅]`   `IRagContext`, `isIRagContext`, `IPrepareModelJobContext`, `isIPrepareModelJobContext`, `ISaveResponseContext`, `isISaveResponseContext` and `createSaveResponseContext` do not exist — interface test, guard test and unit test, by the deletion of every case that named them.
      * `[✅]`   `JobContextParams.retryJob` is a `RetryJobFn` and `IJobContext.retryJob` is a `BoundRetryJobFn`, and no six-positional retry type is declared in this module — interface test, typed assignment.
      * `[✅]`   `root.retryJob` is a closure the factory built, and invoking it passes `params.retryJob` a two-member deps object — unit test, identity and captured-argument assertions.
      * `[✅]`   `ProcessSimpleJobFn`, `ProcessComplexJobFn` and `ProcessRenderJobFn` each take three arguments and return a two-arm union whose success arm carries that processor's own flavors — interface test, typed assignment and exhaustive key records over each params and payload.
      * `[✅]`   `createPrepareModelJobContext` takes one argument and returns `PrepareModelJobDeps` — interface test, typed assignment; unit test, membership assertions over the members that type declares.
      * `[✅]`   `root.prepareModelJob`, `root.gatherArtifacts`, `root.enqueueModelCall`, `root.retryJob`, `root.calculateAffordability` and `root.compressPrompt` are each a closure the factory built, not the params member it was given — unit test, identity assertions.
      * `[✅]`   `params.compressPrompt` and `params.calculateAffordability` each receive exactly the deps object their own interface declares — unit test, captured-argument assertions.
      * `[✅]`   `params.getSortedCompressionCandidates` receives a `countTokens` in the bound two-argument form, and invoking it reaches `params.countTokens` with `params.tokenizerDeps` — unit test, captured-argument assertions.
      * `[✅]`   `params.enqueueCompressJobs`, `params.applyCompressionOverlay` and `params.enqueueModelCall` each receive exactly the deps object their own interface declares — unit test, captured-argument assertions.
      * `[✅]`   One root constructs each bound closure once, so two invocations reach the same function identities — unit test.
      * `[✅]`   Every owned object type has a `Partial<T>`-overrides builder and an `unknown`-returning invalidator, and no mock carries an options bag, a call-recording array or a configurable factory — guard test, whose fixtures are drawn from them.
      * `[✅]`   Each of the thirteen processor params, payload and return-flavor types carries its four mock symbols, each of the three processor function types carries one function mock, and no `any` remains in `_JobProcessorsDummyImpl` — proven by the compiler: every builder is annotated with its production type, every invalidator returns `unknown`, and every function mock is annotated with its production function type.
      * `[✅]`   Every type this node declares, less the three top-level `Return` unions, has a guard, and `DialecticJobRow` has one the three payload guards call — guard test, the case checklist per guard.
      * `[✅]`   Each return-flavor guard accepts its own flavor and rejects every other, and each throws nothing — guard test, cross-flavor rejection cases in one file.
      * `[✅]`   Each payload guard rejects a row carrying another arm's payload, and no arm's member checks are inlined at a delegation site — guard test, cross-arm rejection cases.
      * `[✅]`   The full graph assembles and runs end to end with only Supabase and the queue mocked — integration test.

* `[ ]`   supabase/functions/dialectic-worker/processSimpleJob.ts **[BE] Take the canonical `(deps, params, payload)` shape and report a two-arm outcome: read the owner off the job row, supply `stageSlug` and `output_type` to `gatherArtifacts`, build the dispatcher's one-member params and five-member payload, narrow the deferral, and surrender every retry decision, `failed` write and `retry_loop_failed` write to the runner**

   * `[ ]`   `objective`
      * `[ ]`   Solve a processor that decides its own job is dead and tells the runner nothing. The function returns `void` and reports every outcome by side effect: it writes `status: 'failed'` from the `ContextWindowError` branch and from `emitImmediateFailure`, compares `currentAttempt` against `max_retries`, calls `ctx.retryJob` itself, and writes `status: 'retry_loop_failed'` when that comparison runs out — so the runner that claimed the row learns nothing, and a fourteen-branch `catch` that already knows which failures can never succeed twice throws all of them alike. In the same body it is the sole production construction site of five retired dispatcher members, it is `gatherArtifacts`'s only caller and passes neither value that function's overlay lookup requires, and it treats every non-error dispatcher result as a dispatch — so once the dispatcher reports a deferral, this file announces a completed execution for a job that enqueued no model call.
      * `[ ]`   Functional goals:
         * `[ ]`   The function is declared `export const processSimpleJob: ProcessSimpleJobFn = async (ctx, params, payload) => { … }`, its parameter types inferred from that annotation rather than restated, and it returns `Promise<ProcessSimpleJobReturn>`.
         * `[ ]`   `params.dbClient` replaces the `dbClient` parameter; `payload.job` replaces the `job` parameter; `payload.job.user_id` replaces every read of `projectOwnerUserId`; the `authToken` parameter leaves with the dispatcher members that consumed it.
         * `[ ]`   The `ctx.gatherArtifacts` params literal carries `stageSlug` from the payload member this function already destructures and `output_type` from `resolvedRecipeStep.output_type`, the value it already reads into `notificationDocumentKey`, beside the four members it passes today. Neither costs a lookup.
         * `[ ]`   The `PrepareModelJobParams` literal carries `dbClient` and nothing else.
         * `[ ]`   The `PrepareModelJobPayload` literal carries `job`, `providerRow`, `promptConstructionPayload`, `inputsRelevance` and `inputsRequired`, and the `getSortedCompressionCandidates` import is deleted with the `compressionStrategy` member it supplied.
         * `[ ]`   A deferral is narrowed with `isPrepareModelJobPendingReturn` and returns `{ deferred: true }` without sending any notification and without writing any row status; the parent is already `waiting_for_children` and the completion trigger resumes it.
         * `[ ]`   A dispatch is narrowed with `isPrepareModelJobQueuedReturn`, sends `execute_completed`, and returns `{ dispatched: true }`.
         * `[ ]`   No path writes `status: 'failed'`, `status: 'retry_loop_failed'`, a `completed_at` alongside either, or an `error_details` failure message, and no path calls `ctx.retryJob` or compares `attempt_count` against `max_retries`.
         * `[ ]`   Every path that leaves the function by throwing today returns `{ error, retriable }` instead: each of the fourteen classified immediate failures with `retriable: false`, the `ContextWindowError` branch with `retriable: false`, and an unclassified failure with `retriable: true` — the classification the fourteen branches already perform, reported instead of discarded.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Every failure notification the `catch` sends on a classified branch is unchanged in payload, recipient and condition: `sendContributionGenerationFailedEvent`, `sendContributionFailedNotification` and the `job_failed` `sendJobNotificationEvent`, each fired on a non-retriable classification exactly where it fires now. The unclassified path notifies nothing, as it does now.
         * `[ ]`   The three notifications that accompanied the `retry_loop_failed` write leave this file with that write and are not replaced here. Whether a job has failed terminally is `attempt_count` against `max_retries`, which the runner holds; the terminal statement is sent by `handleJob` in `dialectic-worker/index.ts`, in that file's node.
         * `[ ]`   The entry narrowing of the job payload moves inside the existing `try`. `isDialecticExecuteJobPayload` throws a per-member diagnostic rather than returning `false`, and the surrounding `try` converts that throw to `{ error, retriable: false }` as it converts every other throw in this body.
         * `[ ]`   The `FailedAttemptError` and `ModelProcessingResult` constructions leave with the retry branch and the terminal write that read them, and their imports go with them. The runner builds the `FailedAttemptError[]` a retry requires from the provider row it resolves.
         * `[ ]`   The opening `Starting attempt N/M` log line keeps reading `attempt_count` and `max_retries` off the row. It reports the attempt; it decides nothing.
         * `[ ]`   `sessionData` stays and keeps every use it has — the assembler options, the iteration number it supplies to `gatherArtifacts` and to every notification. What ends is passing it onward.
         * `[ ]`   Every other behavior is unchanged: the stage and recipe resolution, the provider read, the overlay-row read, the initial-prompt resolution, the continuation routing, the `promptConstructionPayload` construction, the `PrepareModelJobExecutionError` unwrapping, the `execute_started` and `dialectic_contribution_started` events, and every log line.
      * `[ ]`   Each goal is proven by a named case in this file's unit or integration suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer orchestration of one EXECUTE job: resolve the stage and its recipe step, assemble the prompt, gather the artifacts, hand the result to the dispatcher, and report what happened as a return value.
      * `[ ]`   The role is correct because dispatch and deferral are this function's own outcomes — it is the only party that knows whether a model call was enqueued or the job is waiting on compression children. Failure is not in that set: whether a failed job is retried is a queue policy applied to a row, and the runner holds the row.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not write `status: 'failed'`, `'retrying'` or `'retry_loop_failed'` on any path, and do not write a `completed_at` or an `error_details` failure message.
         * `[ ]`   Do not read `max_retries` or `attempt_count` for a decision, and do not call `ctx.retryJob`.
         * `[ ]`   Do not decide affordability, compress anything, or read a compression artifact; the dispatcher composes those and reports one outcome.
         * `[ ]`   Do not set `waiting_for_children` on the deferral path; `compressPrompt` sets the parent's status and the completion trigger resumes it.
         * `[ ]`   Do not edit `dialectic-service/dialectic.interface.ts`, `gatherArtifacts`, `applyCompressionOverlay`, `prepareModelJob`, `processJob.ts` or `dialectic-worker/index.ts`; each has its own node. This file conforms to the contracts they declare and supplies the values they require.
         * `[ ]`   Do not decompose this file or extract from it. Its length is not this node's concern.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/processSimpleJob.ts` — one EXECUTE job's pass from payload narrowing through assembly and gathering to dispatch, and the outcome it reports.
      * `[ ]`   Inside boundary:
         * `[ ]`   What this job needs assembled and gathered before a model call can be prepared.
         * `[ ]`   Which of the three outcomes the pass reached, and for a failure, whether a later attempt could succeed.
      * `[ ]`   Outside boundary:
         * `[ ]`   Whether a retriable failure is retried, and what a job's terminal state is, both owned by the runner.
         * `[ ]`   Caps, wallet, affordability, compression and the queue, all owned by `prepareModelJob` and what it composes.
         * `[ ]`   `ProcessSimpleJobFn`, `ProcessSimpleJobParams`, `ProcessSimpleJobPayload`, `ProcessSimpleJobDispatchedReturn`, `ProcessSimpleJobDeferredReturn`, `ProcessSimpleJobSuccessReturn`, `ProcessSimpleJobErrorReturn`, `ProcessSimpleJobReturn` and `IJobProcessors`, all owned by `dialectic-service/dialectic.interface.ts` and declared in the `createJobContext` node, which also carries their interface-test cases. This node declares no type and mocks no symbol; it conforms one implementation to a contract that already exists.

   * `[ ]`   `deps`
      * `[ ]`   Removed provider: `_shared/utils/vector_utils.ts` (`getSortedCompressionCandidates`).
         * `[ ]`   Layer classification: shared utility.
         * `[ ]`   Direction: inbound, and closed by this node — this file imported the concrete scorer solely to relay it, and `createJobContext` supplies it to `compressPrompt` instead.
         * `[ ]`   Purpose retired: naming a compression collaborator from an orchestrator that never calls one.
      * `[ ]`   Removed provider: `createJobContext/JobContext.interface.ts` (`RetryJobFn`), and with it every read of `ctx.retryJob` from this file.
         * `[ ]`   Layer classification: app-layer context contract.
         * `[ ]`   Direction: inbound, and closed by this node — the retry dispatcher is read from the root by `handleJob`, one layer up.
         * `[ ]`   Purpose retired: a processor scheduling its own next attempt.
      * `[ ]`   Provider: `./prepareModelJob/prepareModelJob.provides.ts` (`isPrepareModelJobQueuedReturn` and `isPrepareModelJobPendingReturn`, beside `isPrepareModelJobErrorReturn`, `PrepareModelJobParams`, `PrepareModelJobPayload` and `PrepareModelJobExecutionError`, all moving to the barrel from the internal files this file imports them from today).
         * `[ ]`   Layer classification: sibling app-layer module, owner of the dispatcher's contract.
         * `[ ]`   Direction: inbound; this file already imports that module's types, guards and error class, so no new direction is opened — only the import path becomes the module's public surface.
         * `[ ]`   Purpose: narrow each arm of the return this function receives, and construct the arguments the dispatcher declares.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`ProcessSimpleJobFn`, `ProcessSimpleJobReturn`).
         * `[ ]`   Layer classification: service-layer contract surface, already imported by this file for `DialecticRecipeStep`, `DialecticJobRow`, `DialecticSessionRow` and `PromptConstructionPayload`.
         * `[ ]`   Direction: inbound; no new direction is opened.
         * `[ ]`   Purpose: annotate the implementation with the contract it satisfies, so a divergence is a compile error rather than a silent difference.
      * `[ ]`   Confirm:
         * `[ ]`   The deps slot is `IJobContext`, unnarrowed, exactly as this function receives it today. It arrives from the `createJobContext` node with its ten retired members gone and `retryJob` retyped to `BoundRetryJobFn`; this file reads none of the eleven after this node, so no member of that interface changes for this consumer.
         * `[ ]`   `ctx.gatherArtifacts` carries the two added params as of the `gatherArtifacts` node, and `ctx.prepareModelJob` carries the narrowed params, the widened payload and the two-flavor success arm as of the `prepareModelJob` node. This node supplies and narrows; it changes neither contract.
         * `[ ]`   No reverse dependency: `prepareModelJob`, `gatherArtifacts`, `retryJob` and `vector_utils` import nothing from this file.
         * `[ ]`   `FailedAttemptError` and `ModelProcessingResult` are no longer imported; every other import from `dialectic-service/dialectic.interface.ts` stands.
      * `[ ]`   `context_slice`
         * `[ ]`   From `ctx`: `logger`, `notificationService`, `promptAssembler`, `downloadFromStorage`, `gatherArtifacts` and `prepareModelJob` — the six members this body reads, one fewer than today.
         * `[ ]`   From the dispatcher's module: the three return guards, the two argument types and `PrepareModelJobExecutionError` only.

   * `[ ]`   `processSimpleJob.interaction.spec`
      * `[ ]`   Branch: the job payload is malformed.
         * `[ ]`   Condition: `payload.job.payload` fails a member check inside the `try`.
         * `[ ]`   Decision: `isDialecticExecuteJobPayload(payload.job.payload)` throws its per-member diagnostic; the negated-guard block that follows is the narrowing device the compiler requires.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: <the guard's diagnostic>, retriable: false }` through the `catch`. No row is written.
      * `[ ]`   Branch: a resolution step fails — session, provider, project, domain, stage, system prompt, overlays, recipe step, initial prompt, assembler or continuation content.
         * `[ ]`   Condition: any of the existing checks inside the `try` fails.
         * `[ ]`   Decision: the existing throw for that check, with its exact message.
         * `[ ]`   Dependency call: the reads already made on that path, unchanged.
         * `[ ]`   Outcome: the `catch` classifies the message as it does now and returns `{ error, retriable: false }` for a classified message, `{ error, retriable: true }` otherwise. No row is written.
      * `[ ]`   Branch: gathering fails.
         * `[ ]`   Condition: `ctx.gatherArtifacts` returns its error arm.
         * `[ ]`   Decision: `isGatherArtifactsErrorReturn(gatherResult)`.
         * `[ ]`   Dependency call: `ctx.gatherArtifacts({ dbClient, projectId, sessionId, iterationNumber, stageSlug, output_type }, { inputsRequired })` — the four params it takes today plus the two the overlay lookup requires.
         * `[ ]`   Outcome: `gatherResult.error` is thrown to the `catch` as it is today, and the `catch` classifies it. On success `gatherResult.artifacts` becomes `resourceDocuments`, unchanged.
      * `[ ]`   Branch: the dispatcher returns its error arm.
         * `[ ]`   Condition: `ctx.prepareModelJob({ dbClient }, { job, providerRow, promptConstructionPayload, inputsRelevance, inputsRequired })` returns the error arm.
         * `[ ]`   Decision: `isPrepareModelJobErrorReturn` true; then `orchestratorError instanceof ContextWindowError`.
         * `[ ]`   Dependency call: none beyond the dispatcher call already made.
         * `[ ]`   Outcome: a `ContextWindowError` is rethrown as itself; anything else is rethrown as `PrepareModelJobExecutionError` carrying the message, the `retriable` flag and the cause. Both reach the `catch`, unchanged.
      * `[ ]`   Branch: the dispatcher deferred.
         * `[ ]`   Condition: the dispatcher returned `{ waiting_for_children: true }`.
         * `[ ]`   Decision: `isPrepareModelJobPendingReturn`.
         * `[ ]`   Dependency call: none. No notification, no row write.
         * `[ ]`   Outcome: `{ deferred: true }`. The row is already `waiting_for_children`, set by `compressPrompt` when it spawned the children, and the DB completion trigger wakes this job when they finish.
      * `[ ]`   Branch: the dispatcher queued the call.
         * `[ ]`   Condition: the dispatcher returned `{ queued: true }`.
         * `[ ]`   Decision: `isPrepareModelJobQueuedReturn`.
         * `[ ]`   Dependency call: `ctx.notificationService.sendJobNotificationEvent` with `type: 'execute_completed'` and the session, stage, job id, step key, model id, iteration number and document key it sends today, when `payload.job.user_id` is present.
         * `[ ]`   Outcome: `{ dispatched: true }`.
      * `[ ]`   Branch: the dispatcher returned neither arm.
         * `[ ]`   Condition: no return guard matches.
         * `[ ]`   Decision: both arm guards false.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `prepareModelJob returned an invalid result shape` is thrown to the `catch`, which returns it as `{ error, retriable: false }`.
      * `[ ]`   Branch, in the `catch`: the failure is a `ContextWindowError`.
         * `[ ]`   Condition: the unwrapped error is a `ContextWindowError`.
         * `[ ]`   Decision: `error instanceof ContextWindowError`.
         * `[ ]`   Dependency call: `ctx.logger.error`, then the three notifications this branch sends today — the `other_generation_failed` event, the `contribution_generation_failed` notification and, when a document key is known, the `job_failed` event — each with its existing `CONTEXT_WINDOW_ERROR` code and message. The `dialectic_generation_jobs` update that stood here is deleted.
         * `[ ]`   Outcome: `{ error, retriable: false }`.
      * `[ ]`   Branch, in the `catch`: the failure matches one of the fourteen classified messages.
         * `[ ]`   Condition: the lowercased message matches that branch's existing test.
         * `[ ]`   Decision: the existing `lower.includes(…)` or `lower.startsWith(…)` comparison, or `prepareJobRetriable === false`, in the order they stand.
         * `[ ]`   Dependency call: the three notifications `emitImmediateFailure` sends today, with that branch's existing code and message. The `dialectic_generation_jobs` update inside that helper is deleted, so the helper notifies and no longer writes.
         * `[ ]`   Outcome: `{ error, retriable: false }` in place of the `throw error` that followed each call.
      * `[ ]`   Branch, in the `catch`: the failure matches none of them.
         * `[ ]`   Condition: no classification matched.
         * `[ ]`   Decision: none.
         * `[ ]`   Dependency call: `ctx.logger.warn` with the attempt and the model, its message built from `error.message` in place of the deleted `failedAttempt.error`. No notification, as today.
         * `[ ]`   Outcome: `{ error, retriable: true }`. The retry comparison, the `ctx.retryJob` call, the `retry_loop_failed` update and its three notifications are all deleted from this path.
      * `[ ]`   Ordering and side effects: exactly one gather call and one dispatcher call per invocation; no `dialectic_generation_jobs` write on any path; at most one set of failure notifications, and none on the retriable classification or the deferral; every success and every failure leaves the function by returning a member of the union, and nothing leaves it by throwing.

   * `[ ]`   `processSimpleJob.test.ts`
      * `[ ]`   Every case calls `processSimpleJob(ctx, { dbClient }, { job })` and restates its `Act` line to that call, the four-field header being a claim about the body.
      * `[ ]`   Every case's `PrepareModelJobParams` expectation asserts one member, `dbClient`; every `PrepareModelJobPayload` expectation asserts `job`, `providerRow`, `promptConstructionPayload`, `inputsRelevance` and `inputsRequired`, and that no `compressionStrategy`, `authToken` or `sessionData` is present anywhere in either.
      * `[ ]`   Each case that asserts a thrown error asserts the returned error arm instead: its `error.message` is the message that case throws today and its `retriable` is `false` for each of the fourteen classified failures and for the `ContextWindowError` case, and each also asserts that no `dialectic_generation_jobs` update was issued.
      * `[ ]`   New case: an unclassified failure returns the error arm with `retriable: true`, arranged beside a classified case in the same file so the flag cannot be a constant.
      * `[ ]`   New case: a dispatcher returning `{ waiting_for_children: true }` returns `{ deferred: true }`, calls `ctx.notificationService.sendJobNotificationEvent` zero times and writes `dialectic_generation_jobs` zero times. Arranged alongside a queued case in the same file so the assertion cannot hold if the branch were deleted.
      * `[ ]`   New case: a dispatcher returning `{ queued: true }` returns `{ dispatched: true }` and sends exactly one `execute_completed` event carrying the session, stage, job id, step key, model id, iteration number and document key it carries today.
      * `[ ]`   The existing invalid-shape case asserts the returned error arm carrying `prepareModelJob returned an invalid result shape` with `retriable: false`.
      * `[ ]`   New case: the `gatherArtifacts` call receives `stageSlug` equal to the payload's own value and `output_type` equal to `resolvedRecipeStep.output_type`, captured at the call site, alongside the four params it receives today.
      * `[ ]`   The three cases that assert `ctx.retryJob` is called, and the case asserting the `retry_loop_failed` row update and its three notifications, are deleted with the branch they covered. The retry decision is proven in `dialectic-worker/index.ts`'s node, against the runner that now makes it.
      * `[ ]`   New case: a failure the function classifies as retriable calls `ctx.retryJob` zero times and writes `dialectic_generation_jobs` zero times, so the deleted branch cannot return unnoticed.
      * `[ ]`   Every case that asserts a failure notification keeps its arrangement and its assertions: the `other_generation_failed` event, the `contribution_generation_failed` notification and the `job_failed` event, each with its existing code and message.
      * `[ ]`   Every remaining case — the error propagation, the gather failure, the continuation routing, the assembler paths, the `execute_started` and `dialectic_contribution_started` events — keeps its coverage and its assertions.

   * `[ ]`   `processSimpleJob.ts`
      * `[ ]`   The function is declared `export const processSimpleJob: ProcessSimpleJobFn = async (ctx, params, payload) => { … }`; the five-parameter list, its inline types and the `SupabaseClient`/`Database` imports it required are deleted. `ProcessSimpleJobFn` and `ProcessSimpleJobReturn` are imported from `dialectic-service/dialectic.interface.ts` beside the imports already taken from that file.
      * `[ ]`   `params.dbClient` is destructured once at the top and replaces every `dbClient` reference; `payload.job` replaces every `job` reference; `payload.job.user_id` replaces every `projectOwnerUserId` reference, including each `if (projectOwnerUserId)` gate, which becomes the same truthiness check on that value.
      * `[ ]`   The entry `isRecord`/`isDialecticExecuteJobPayload` check and the payload destructure that follows it move inside the `try`, ahead of the first `stageSlug` check; the hand-thrown `Job … does not have a valid 'execute' payload.` message stays as the negated-guard block's only statement and the diagnostic that reaches the caller is the guard's own.
      * `[ ]`   The `ctx.gatherArtifacts` params literal gains `stageSlug` and `output_type`; the destructured `stageSlug` and `resolvedRecipeStep.output_type` that supply them are already in scope at that line.
      * `[ ]`   The `PrepareModelJobParams` literal drops `authToken`, `job`, `projectOwnerUserId` and `providerRow`, leaving `dbClient`. The `PrepareModelJobPayload` literal drops `compressionStrategy` and gains `job` and `providerRow`. The `getSortedCompressionCandidates` import is deleted.
      * `[ ]`   The `isPrepareModelJobSuccessReturn` check is replaced by the two arm guards: `isPrepareModelJobPendingReturn` returns `{ deferred: true }`, `isPrepareModelJobQueuedReturn` gates the notification block and is followed by `return { dispatched: true }`, and the invalid-shape throw follows both. Every import this file takes from `prepareModelJob.interface.ts` and `prepareModelJob.guard.ts` moves to `prepareModelJob.provides.ts`, gaining the two arm guards and losing `isPrepareModelJobSuccessReturn`.
      * `[ ]`   The `dbClient.from('dialectic_generation_jobs').update({ status: 'failed', … })` call in the `ContextWindowError` branch is deleted and the branch's bare `return` becomes `return { error, retriable: false }`; its `ctx.logger.error` call and its three notifications stand.
      * `[ ]`   The same update inside `emitImmediateFailure` is deleted, leaving the helper to send its three notifications; each of the fourteen `await emitImmediateFailure(…); throw error;` pairs becomes `await emitImmediateFailure(…); return { error, retriable: false };`.
      * `[ ]`   The `failedAttempt` and `modelProcessingResult` constructions, the `currentAttempt < max_retries` comparison, the `ctx.retryJob` call, the `retry_loop_failed` update with its `finalUpdateError` log line, and the three notifications that followed it are deleted; what remains on that path is the existing `ctx.logger.warn`, its message reading `error.message`, followed by `return { error, retriable: true }`. The `FailedAttemptError` and `ModelProcessingResult` imports go with them.
      * `[ ]`   The end of the `try`, after the dispatch arm's notification block, returns `{ dispatched: true }`.
      * `[ ]`   Nothing else in the file changes: every query, every guard call, the recipe resolution, the initial-prompt resolution, the continuation routing, the `promptConstructionPayload` construction, the `PrepareModelJobExecutionError` unwrapping, every notification and every log line stand exactly as they are.

   * `[ ]`   `processSimpleJob.integration.test.ts`
      * `[ ]`   Every call becomes `processSimpleJob(ctx, { dbClient }, { job })`, and every `PrepareModelJobParams` and `PrepareModelJobPayload` construction and assertion takes the shapes above.
      * `[ ]`   The hand-built `boundCompressPrompt` and `boundCalculateAffordability` closures at both construction sites are rebuilt to the deps their own nodes established: `compressPrompt` from `applyCompressionOverlay`, `enqueueCompressJobs`, `fileManager`, `constructStoragePath`, `downloadFromStorage`, `countTokens` and `logger`; `calculateAffordability` from the three members its node leaves it. The `MockRagService` and `embeddingClient` constructions and the `rag_service.mock.ts` import are deleted — no chain in this file reaches a retrieval service after the cutover.
      * `[ ]`   The `PrepareModelJobDeps` literal gains `compressPrompt: boundCompressPrompt`, and the `gatherArtifacts` closure's deps literal gains the bound `applyCompressionOverlay` its node requires, with `stageSlug` and `output_type` supplied on the params the closure forwards.
      * `[ ]`   The integrated chain is real end to end: `processSimpleJob` → `gatherArtifacts` → `applyCompressionOverlay` → `prepareModelJob` → `calculateAffordability` → `compressPrompt` → `enqueueCompressJobs`, and on the within-budget path `prepareModelJob` → `enqueueModelCall`. No function in that chain is mocked, stubbed or replaced by a builder.
      * `[ ]`   Mocked at the outer edge only: the Supabase client and the queue POST. Storage reads the overlay performs are served from the mocked client, so the suite proves nothing about the storage adapter itself.
      * `[ ]`   A case drives an oversized working set through that chain: COMPRESS rows are inserted with `parent_job_id` equal to this job, and the call returns `{ deferred: true }` having sent no notification and written no row status.
      * `[ ]`   A case drives a within-budget working set through the same chain: the queue receives one POST, the call returns `{ dispatched: true }`, and exactly one `execute_completed` event is sent.
      * `[ ]`   A case drives an already-compressed working set: the overlay swaps the victim's content, the recount fits, and the call reaches the queue without any COMPRESS row being inserted.
      * `[ ]`   A case drives a failure through the chain and asserts the returned error arm with no `dialectic_generation_jobs` write, so the deleted status writes are proven absent against real collaborators and not only against mocks.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file reads the job context it was handed and imports the dispatcher's contract from that module's `provides` barrel; it exports nothing back to either, and it drops its import of the concrete scorer.
      * `[ ]`   The edge into `vector_utils` and the edge into the retry module are both removed from this file; neither is replaced, and the graph loses two directions.
      * `[ ]`   No cycle: `prepareModelJob`, `gatherArtifacts`, `retryJob` and `vector_utils` import nothing from this file.
      * `[ ]`   The composition root remains the only place a concrete collaborator is chosen; after this node no orchestrator names one.

   * `[ ]`   `requirements`
      * `[ ]`   The implementation is annotated `ProcessSimpleJobFn` and declares no parameter types of its own, so a divergence between the declared contract and the implementation is a compile error — proven by the compiler.
      * `[ ]`   The dispatcher receives params carrying only `dbClient`, and a payload carrying `job`, `providerRow`, `promptConstructionPayload`, `inputsRelevance` and `inputsRequired` and no `compressionStrategy` — unit test and integration test, captured-argument assertions.
      * `[ ]`   `gatherArtifacts` receives `stageSlug` from the payload and `output_type` from `resolvedRecipeStep.output_type` — unit test and integration test, captured-argument assertions.
      * `[ ]`   A deferral returns `{ deferred: true }`, sends no notification and writes no row status — unit test and integration test.
      * `[ ]`   A dispatch returns `{ dispatched: true }` and sends exactly one `execute_completed` event carrying the fields it carries today — unit test and integration test.
      * `[ ]`   A result that is neither arm returns the error arm carrying `prepareModelJob returned an invalid result shape` with `retriable: false` — unit test.
      * `[ ]`   Each of the fourteen classified failures and the `ContextWindowError` returns the error arm with its existing message and `retriable: false`, and an unclassified failure returns `retriable: true` — unit test, both classifications arranged in one file.
      * `[ ]`   No path writes `status: 'failed'` or `status: 'retry_loop_failed'`, and no path calls `ctx.retryJob` — unit test, update-argument and call-count assertions across the failure cases; integration test, against real collaborators.
      * `[ ]`   Every failure notification fires on the same condition and with the same code and message it does now, and the retriable path sends none — unit test.
      * `[ ]`   Every gather-failure, continuation and assembler path behaves exactly as it does now — unit test, existing cases with their `Act` lines and error assertions restated.


* `[ ]`   supabase/functions/dialectic-worker/processComplexJob.ts **[BE] Take the canonical `(deps, params, payload)` shape and report the planning outcome on a two-arm return: read the owner and the JWT off the job row, return every failure as a classified error arm, and stop writing `failed` on any path**

   * `[ ]`   `objective`
      * `[ ]`   Solve a planner that decides its own job is dead and tells the runner nothing. Six configuration checks and the outer `catch` each write `status: 'failed'` with a `completed_at` and an `error_details.message` directly onto `dialectic_generation_jobs`, and the function returns `void`, so the runner that claimed the job learns nothing and the `max_retries` column never applies to a PLAN job. A recipe that could not be read and a Postgrest error during enqueue are recorded identically, though one can never succeed on a retry and the other frequently can. Three further failures — the two payload-guard throws and the `stageSlug` throw — leave the function by throwing, so a caller that wanted to read an outcome would still have to catch one. And the function takes five positional parameters, two of which carry values the job row already holds: `projectOwnerUserId` duplicates `job.user_id`, and `authToken` duplicates the `user_jwt` the row's own payload carries.
      * `[ ]`   Functional goals:
         * `[ ]`   The function is declared `export const processComplexJob: ProcessComplexJobFn = async (ctx, params, payload) => { … }`, its parameter types inferred from that annotation rather than restated, and it returns `Promise<ProcessComplexJobReturn>`. The hand-written parameter list is what let the declared contract and the implementation diverge unnoticed.
         * `[ ]`   `params.dbClient` replaces the `dbClient` parameter; `payload.job` replaces the `job` parameter; `payload.job.user_id` replaces `projectOwnerUserId` as the notification recipient; and `payload.job.payload.user_jwt` replaces `authToken` at both `ctx.planComplexStage` call sites.
         * `[ ]`   Each of the six configuration failures returns the error arm carrying an `Error` built from the message it writes today, with `retriable: false` — the same rows would be read again and the same check would fail.
         * `[ ]`   The two payload-guard failures and the missing-`stageSlug` failure return the error arm carrying an `Error` built from the message each throws today, with `retriable: false`, in place of throwing.
         * `[ ]`   The outer `catch` returns the error arm carrying the `Error` it already derives, with `retriable: false` when the caught value is a `ContextWindowError` and `retriable: true` otherwise; the enqueue and update failures it catches are transient.
         * `[ ]`   No path writes `status: 'failed'`, `completed_at` alongside it, or an `error_details` failure message, and no path leaves the function by throwing.
         * `[ ]`   Every path that completes its planning pass returns `{ planned: true }`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Every deferral and completion write this function owns is unchanged in condition, column set and value: `waiting_for_children` on the four paths that set it, `waiting_for_prerequisite` on the two that re-chain a skeleton, and `completed` on the three that finish a parent or a childless skeleton. Those are a planner's own outcomes, not a failure verdict, and none of them moves to the runner.
         * `[ ]`   The `failureReason` construction in the `catch` — the `ContextWindowError` branch and the branch reading `code`, `details` and `collidedIdempotencyKeys` off the caught value — is unchanged; its result becomes the message of the returned `Error` instead of an `error_details` column value.
         * `[ ]`   The `job_failed` notification in the `catch` is sent only when the failure is classified non-retriable, so a job the runner will retry is never told it failed. Its payload, its `step_key`, its `errCode` selection and its best-effort `try`/`catch` wrapper are otherwise unchanged.
         * `[ ]`   The `job` parameter's inline union `DialecticJobRow & { payload: DialecticPlanJobPayload | DialecticSkeletonJobPayload }` leaves with that parameter list. `DialecticSkeletonJobPayload` extends `DialecticPlanJobPayload`, so the `ProcessComplexJobPayload` this function now receives admits every value the union did, and the body's `isDialecticSkeletonJobPayload` check narrows to the skeleton arm exactly as it does now. The `DialecticSkeletonJobPayload` type import stays — the body's guard call still needs it.
         * `[ ]`   Every log line, every query, the recipe resolution, the child-job tracking, the planner delegation, the skeleton construction and the idempotent-replay handling are unchanged.
         * `[ ]`   Both call sites go transiently non-compilable and are not edited here: `processJob.ts` calls this function with five positional arguments, and `dialectic-worker/index.ts` wraps it in a `defaultProcessors` adapter typed `Promise<void>` that discards the return. Each belongs to that file's own node later in this workstream.
      * `[ ]`   Each goal is proven by a named case in this file's suites.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer planning: read a stage's recipe, decide which steps are ready, enqueue their child jobs, record the waiting or completed state the parent now occupies, and report the pass as a return value.
      * `[ ]`   The role is correct because deferral and completion are the planner's own outcomes — it is the only party that knows a parent is waiting on children or has none left to wait for. Failure is not in that set: whether a failed job is retried is a queue policy applied to a row, and the runner holds the row.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not write `status: 'failed'`, `retrying` or `retry_loop_failed` on any path.
         * `[ ]`   Do not read `max_retries` or `attempt_count`, and do not call `retryJob`.
         * `[ ]`   Do not change any deferral or completion write, or the conditions that select them.
         * `[ ]`   Do not edit `dialectic-service/dialectic.interface.ts`; the `createJobContext` node declares every `ProcessComplexJob*` symbol this file consumes, and this node conforms one implementation to contracts that already exist.
         * `[ ]`   Do not edit `processJob.ts`, `dialectic-worker/index.ts` or `planComplexStage`; each has its own node.
         * `[ ]`   Do not decompose this file, and do not extract from it. Its length is not this node's concern.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/processComplexJob.ts` — one PLAN or skeleton job's pass from payload narrowing through recipe resolution and child enqueue to the parent's waiting or completed state, and the outcome it reports.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which recipe steps are ready, what child jobs they produce, and which waiting or completed state the parent lands in.
         * `[ ]`   Whether a planning failure could succeed on a later attempt.
      * `[ ]`   Outside boundary:
         * `[ ]`   Whether a retriable failure is retried, and what a job's terminal state is, both owned by the runner.
         * `[ ]`   `ProcessComplexJobFn`, `ProcessComplexJobParams`, `ProcessComplexJobPayload`, `ProcessComplexJobSuccessReturn`, `ProcessComplexJobErrorReturn`, `ProcessComplexJobReturn` and `IJobProcessors`, all owned by `dialectic-service/dialectic.interface.ts` and declared in the `createJobContext` node, which also carries their interface-test cases, their builders and invalidators in `_shared/dialectic.mock.ts`, and their guards in `_shared/utils/type-guards/type_guards.dialectic.ts`. This node declares no type, mocks no symbol and writes no guard.
         * `[ ]`   The granularity planner and child-payload construction, owned by `planComplexStage`.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `createJobContext/JobContext.interface.ts` (`IPlanJobContext`), which becomes this function's declared deps slot rather than its fourth positional parameter.
         * `[ ]`   Layer classification: app-layer context contract, constructed at the composition root.
         * `[ ]`   Direction: inbound; this file already takes `ctx: IPlanJobContext` and reads four members off it, so no new direction is opened and no wiring changes at the root.
         * `[ ]`   Purpose: supply the collaborators this planner invokes, unnarrowed, exactly as it receives them today.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`ProcessComplexJobFn`, `ProcessComplexJobReturn`), beside the `DialecticJobRow`, `DialecticPlanJobPayload`, `DialecticSkeletonJobPayload`, `RequiredArtifactIdentity`, `BranchKey` and recipe-type imports this file already takes from it.
         * `[ ]`   Layer classification: service-layer contract surface.
         * `[ ]`   Direction: inbound; no new direction is opened.
         * `[ ]`   Purpose: annotate the implementation with the contract it satisfies, so a divergence is a compile error rather than a silent difference.
      * `[ ]`   Removed provider: none. `projectOwnerUserId` and `authToken` were positional values, not collaborators; each is read from the job row after this node.
      * `[ ]`   Confirm:
         * `[ ]`   `IPlanJobContext` is unchanged in shape: no member is added, removed or retyped, and this node narrows the deps slot no further than the interface this function receives today.
         * `[ ]`   No reverse dependency: `planComplexStage`, `resolveNextBlocker` and `createJobContext` import nothing from this file.
         * `[ ]`   The `SupabaseClient` and `Database` imports stay — `params.dbClient` still carries that type, declared by `ProcessComplexJobParams`.
      * `[ ]`   `context_slice`
         * `[ ]`   From `ctx`: `logger`, `findSourceDocuments`, `planComplexStage` and `notificationService` — the four members this body reads, unchanged by this node.

   * `[ ]`   `processComplexJob.interaction.spec`
      * `[ ]`   Branch: a deferred-planning job carries a payload that is not a skeleton payload.
         * `[ ]`   Condition: `payload.job.prerequisite_job_id` is set and the row's payload fails the skeleton check.
         * `[ ]`   Decision: `!isDialecticSkeletonJobPayload(payload.job.payload)`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("[processComplexJob] Job <id> has an invalid payload for deferred planning."), retriable: false }`, returned in place of the throw. No row is written.
      * `[ ]`   Branch: a first-pass job carries a payload that is not a plan payload.
         * `[ ]`   Condition: `payload.job.prerequisite_job_id` is absent and the row's payload fails the plan check.
         * `[ ]`   Decision: `!isDialecticPlanJobPayload(payload.job.payload)`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("[processComplexJob] Job <id> has an invalid payload for complex processing."), retriable: false }`, returned in place of the throw. No row is written.
      * `[ ]`   Branch: neither the row nor its payload carries a stage slug.
         * `[ ]`   Condition: `payload.job.stage_slug` and the payload's `stageSlug` are each absent or empty.
         * `[ ]`   Decision: the existing two-way resolution falls through to its `else`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("[processComplexJob] Job <id> is missing stageSlug."), retriable: false }`, returned in place of the throw. No row is written.
      * `[ ]`   Branch: the stage row is missing or carries no active recipe instance.
         * `[ ]`   Condition: the `dialectic_stages` select returns an error, no row, or a row whose `active_recipe_instance_id` is absent.
         * `[ ]`   Decision: `stageError || !stageData || !stageData.active_recipe_instance_id`.
         * `[ ]`   Dependency call: none; the `dialectic_generation_jobs` update that stood here is deleted.
         * `[ ]`   Outcome: `{ error: new Error("Stage '<slug>' not found or has no active recipe."), retriable: false }`.
      * `[ ]`   Branch: the recipe instance is missing.
         * `[ ]`   Condition: the `dialectic_stage_recipe_instances` select returns an error or no row.
         * `[ ]`   Decision: `instanceError || !instance`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("Recipe instance not found for stage '<slug>' with instance ID '<id>'."), retriable: false }`.
      * `[ ]`   Branch: a cloned instance has no steps, and the same for no valid steps.
         * `[ ]`   Condition: the instance-steps select errors or returns an empty array; or every returned row fails `isDialecticStageRecipeStep`.
         * `[ ]`   Decision: `stepErr || !stepRows || stepRows.length === 0`; then `validCount === 0`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("Active recipe instance '<id>' has no recipe steps."), retriable: false }` and `{ error: new Error("Active recipe instance '<id>' has no valid recipe steps."), retriable: false }` respectively.
      * `[ ]`   Branch: a template instance has no steps, and the same for no valid steps.
         * `[ ]`   Condition: the template-steps select errors or returns an empty array; or every returned row fails `isDialecticRecipeTemplateStep`.
         * `[ ]`   Decision: `stepErr || !stepRows || stepRows.length === 0`; then `validCount === 0`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("Recipe template '<id>' has no recipe steps."), retriable: false }` and `{ error: new Error("Recipe template '<id>' has no valid recipe steps."), retriable: false }` respectively.
      * `[ ]`   Branch: anything inside the planning `try` throws.
         * `[ ]`   Condition: a throw reaches the outer `catch`.
         * `[ ]`   Decision: `e instanceof ContextWindowError` selects the non-retriable classification; every other caught value is retriable.
         * `[ ]`   Dependency call: `ctx.logger.error` always; `ctx.notificationService.sendJobNotificationEvent` with `type: 'job_failed'` only on the non-retriable classification, inside its existing best-effort `try`.
         * `[ ]`   Outcome: `{ error: new Error(failureReason), retriable: false }` for a `ContextWindowError`, `{ error: new Error(failureReason), retriable: true }` otherwise. No row is written.
      * `[ ]`   Branch: the planning pass completes.
         * `[ ]`   Condition: the `try` runs to its end, having written whichever deferral or completion state its own path selected.
         * `[ ]`   Decision: none.
         * `[ ]`   Dependency call: the deferral or completion update already written on that path, unchanged.
         * `[ ]`   Outcome: `{ planned: true }`.
      * `[ ]`   Branch: a ready step is delegated to the planner.
         * `[ ]`   Condition: a recipe step resolves as ready, on the first-pass path and on the deferred-planning path alike.
         * `[ ]`   Decision: the existing readiness resolution, unchanged.
         * `[ ]`   Dependency call: `ctx.planComplexStage(params.dbClient, payload.job, ctx, step, payload.job.payload.user_jwt)` on the deferred path and the same with `completedSourceDocIds` on the first-pass path — the JWT read from the row's own payload in place of the retired `authToken` parameter, at both call sites.
         * `[ ]`   Outcome: the child jobs the planner returns, handled exactly as they are today.
      * `[ ]`   Ordering and side effects: no `failed` write on any path; every deferral and completion write keeps its position and its values; at most one `job_failed` notification per invocation and none on a retriable failure; every path leaves the function by returning a member of the union, and nothing leaves it by throwing.

   * `[ ]`   `processComplexJob.errors.test.ts`
      * `[ ]`   Every case calls `processComplexJob(ctx, { dbClient }, { job })` and restates its `Act` line to that call, the four-field header being a claim about the body. Its `job` fixture is `buildDialecticJobRow` composed with `buildDialecticPlanJobPayload` or `buildDialecticSkeletonJobPayload`, never hand-rolled.
      * `[ ]`   The four cases asserting a `failed` row write for a missing stage, a missing recipe instance, an instance with no recipe steps and a template with no recipe steps assert instead that the call returns the error arm carrying that case's exact message with `retriable: false`, and that no `dialectic_generation_jobs` update was issued.
      * `[ ]`   The cases asserting a thrown invalid-payload message for the deferred and first-pass paths, and the case asserting the thrown missing-`stageSlug` message, assert the returned error arm carrying those same three messages with `retriable: false`, and that no row was written.
      * `[ ]`   New case: an instance whose step rows all fail `isDialecticStageRecipeStep` returns the no-valid-steps error arm with `retriable: false`.
      * `[ ]`   New case: a template whose step rows all fail `isDialecticRecipeTemplateStep` returns the no-valid-steps error arm with `retriable: false`.
      * `[ ]`   New case: a throw inside the planning `try` that is not a `ContextWindowError` returns the error arm with `retriable: true` and writes no row, arranged beside the `ContextWindowError` case so the flag cannot be a constant.
      * `[ ]`   New case: a `ContextWindowError` thrown inside the planning `try` returns the error arm with `retriable: false`.
      * `[ ]`   Every remaining case keeps its arrangement and its assertions.

   * `[ ]`   `processComplexJob.notifications.test.ts`
      * `[ ]`   Every case calls `processComplexJob(ctx, { dbClient }, { job })` and restates its `Act` line to that call.
      * `[ ]`   The three `job_failed` cases keep their arrangements and assertions, each arranging a terminal failure, which is now the non-retriable classification, and each asserting the recipient is `payload.job.user_id`.
      * `[ ]`   New case: a retriable planning failure sends no `job_failed` notification, arranged in the same file as a terminal case so the gate cannot be deleted without an assertion failing.
      * `[ ]`   Every other case in the file is unchanged.

   * `[ ]`   `processComplexJob.happy.test.ts`
      * `[ ]`   Every case calls `processComplexJob(ctx, { dbClient }, { job })` and restates its `Act` line to that call.
      * `[ ]`   Each case that completes a planning pass adds an assertion on the returned `{ planned: true }` beside the deferral or completion write it already asserts.
      * `[ ]`   New case: the JWT reaching `ctx.planComplexStage` is `payload.job.payload.user_jwt`, captured at the call site, so the retired parameter cannot return unnoticed.
      * `[ ]`   Every existing arrangement and assertion — the recipe resolution, the child-job enqueue, the `waiting_for_children` write and its log line — is otherwise unchanged.

   * `[ ]`   `processComplexJob.parallel.test.ts`
      * `[ ]`   Every case calls `processComplexJob(ctx, { dbClient }, { job })` and restates its `Act` line to that call.
      * `[ ]`   Each case adds an assertion on the returned `{ planned: true }`; every parallel-group arrangement, every child-count assertion and every `waiting_for_children` assertion is unchanged.

   * `[ ]`   `processComplexJob.intraStageDependency.test.ts`
      * `[ ]`   Every case calls `processComplexJob(ctx, { dbClient }, { job })` and restates its `Act` line to that call.
      * `[ ]`   Each case adds an assertion on the returned `{ planned: true }`; every `waiting_for_prerequisite` arrangement, every skeleton-construction assertion and every idempotent-replay assertion is unchanged.
      * `[ ]`   Its `createMockJobProcessors` usage is unchanged; the harness compiles against the reshaped `IJobProcessors` as of the `createJobContext` node.

   * `[ ]`   `processComplexJob.ts`
      * `[ ]`   The function is declared `export const processComplexJob: ProcessComplexJobFn = async (ctx, params, payload) => { … }`; the five-parameter list and its inline types are deleted. `ProcessComplexJobFn` and `ProcessComplexJobReturn` are imported from `dialectic-service/dialectic.interface.ts` beside the imports already taken from that file.
      * `[ ]`   `params.dbClient` is destructured once at the top and replaces every `dbClient` reference; `payload.job` replaces every `job` reference, `parentJobId` still destructured from it; `payload.job.user_id` replaces `projectOwnerUserId` at the `job_failed` notification; and `payload.job.payload.user_jwt` replaces `authToken` at both `ctx.planComplexStage` call sites.
      * `[ ]`   The `job` parameter's inline union `DialecticJobRow & { payload: DialecticPlanJobPayload | DialecticSkeletonJobPayload }` leaves with that parameter list. `DialecticSkeletonJobPayload` extends `DialecticPlanJobPayload`, so `ProcessComplexJobPayload` admits every value the union did, and the body's `isDialecticSkeletonJobPayload` check narrows to the skeleton arm exactly as it does now.
      * `[ ]`   The `DialecticSkeletonJobPayload` type import stays — the body's guard call still needs it. The `SupabaseClient` and `Database` imports stay, `params.dbClient` carrying that type.
      * `[ ]`   The two payload-guard throws and the `stageSlug` throw each become a `return` of the error arm carrying an `Error` built from that throw's existing message string, with `retriable: false`.
      * `[ ]`   Each of the six `dbClient.from('dialectic_generation_jobs').update({ status: 'failed', … })` calls and its following bare `return` is replaced by a `return` of the error arm carrying an `Error` built from that call's existing message string, with `retriable: false`.
      * `[ ]`   The outer `catch` keeps its `error` derivation, its `ctx.logger.error` call and its `failureReason` construction; the `failed` row update is deleted; the `job_failed` notification is wrapped in the non-retriable condition; and the `catch` ends by returning the error arm with `failureReason` as the message and the classified flag.
      * `[ ]`   The end of the `try`, after the `waiting_for_children` update and its log line, returns `{ planned: true }`, as does every earlier path that completes a planning pass.
      * `[ ]`   Nothing else in the file changes: every query, every deferral and completion update, the recipe resolution, the child-job tracking, the planner delegation, the skeleton construction, the idempotent-replay handling and every log line stand exactly as they are.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file reads the plan-job context it was handed and imports its own contract from the service-layer interface that declares it; it exports the implementation outward to `processJob.ts` and the worker root, and nothing back.
      * `[ ]`   No cycle: `planComplexStage`, `resolveNextBlocker` and `createJobContext` import nothing from this file.
      * `[ ]`   The graph gains and loses no edge: the two values this node stops taking as parameters are read from a row this function already holds.

   * `[ ]`   `requirements`
      * `[ ]`   The implementation is annotated `ProcessComplexJobFn`, takes three arguments and declares no parameter types of its own, so no annotation site in the file composes a union — proven by the compiler: a divergence between the declared contract and the implementation is a type error rather than a silent difference.
      * `[ ]`   `ctx.planComplexStage` receives `payload.job.payload.user_jwt` at both call sites, and the `job_failed` notification is addressed to `payload.job.user_id` — unit test, captured-argument assertions.
      * `[ ]`   Each of the six configuration failures returns the error arm with its existing message and `retriable: false`, and issues no `dialectic_generation_jobs` update — unit test.
      * `[ ]`   The two invalid-payload failures and the missing-`stageSlug` failure each return the error arm with their existing message and `retriable: false`, and nothing leaves the function by throwing — unit test, returned-value assertions where a thrown error was asserted before.
      * `[ ]`   A non-`ContextWindowError` throw inside the planning `try` returns `retriable: true`, and a `ContextWindowError` returns `retriable: false` — unit test, both arranged in one file.
      * `[ ]`   No path writes `status: 'failed'` — unit test, update-argument assertions across all five suites.
      * `[ ]`   A retriable failure sends no `job_failed` notification and a non-retriable failure sends exactly one — unit test.
      * `[ ]`   Every `waiting_for_children`, `waiting_for_prerequisite` and `completed` write happens on the same condition and with the same values it does now — unit test, existing cases unchanged.
      * `[ ]`   A completed planning pass returns `{ planned: true }` — unit test, in each of the five suites that drive one.
      * `[ ]`   Every skeleton-payload path behaves exactly as it does now under the declared payload type — unit test, existing deferred-planning cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/processJob.ts **[BE] Take the canonical `(deps, params, payload)` shape and report the dispatch outcome on a two-arm return: call every processor by its reshaped contract, rebuild the `ProcessCompressJobDeps` literal, and delete the redundant COMPRESS payload gate and the `failed` write behind it**

   * `[ ]`   `objective`
      * `[ ]`   Solve a dispatcher that swallows every outcome it was handed. Four processors now report `Success | Error`, and this function — the only thing between them and the runner that claimed the row — takes six positional parameters, returns `void`, and discards all four results. It writes `status: 'failed'` itself for the COMPRESS arm, so a failure that could succeed on a later attempt is recorded as terminal by the one party holding neither `attempt_count` nor `max_retries`. Three of its arms and its `default` leave by throwing, so a caller that wanted to read an outcome would still have to catch one. It hands the COMPRESS processor a model call's worth of collaborators — `enqueueModelCall`, a token counter, a tiktoken encoding closure and the Anthropic counter — every one of which that processor stopped using when the model call moved into `prepareModelJob`. And it gates the COMPRESS payload with a guard the processor now runs on its own entry, so a malformed payload throws out of this file instead of returning as the processor's classified error arm.
      * `[ ]`   Functional goals:
         * `[ ]`   The function is declared `export const processJob: ProcessJobFn = async (deps, params, payload) => { … }`, its parameter types inferred from that annotation rather than restated, and it returns `Promise<ProcessJobReturn>`.
         * `[ ]`   `deps.processors` and `deps.ctx` replace the `processors` and `ctx` parameters; `params.dbClient` replaces the `dbClient` parameter; `payload.job` replaces the `job` parameter; the `projectOwnerUserId` and `authToken` parameters are deleted, no arm taking either after this node.
         * `[ ]`   Each arm calls its processor by the reshaped contract: `deps.processors.processSimpleJob(deps.ctx, { dbClient }, executePayload)`, `deps.processors.processComplexJob(planCtx, { dbClient }, planPayload)`, `deps.processors.processRenderJob(renderCtx, { dbClient }, { job })`, and `deps.processors.processCompressJob(compressDeps, { dbClient }, { job })`.
         * `[ ]`   The `jobIsExecuteJob` and `jobIsPlanJob` predicates are deleted. The EXECUTE and PLAN arms narrow with `isProcessSimpleJobPayload` and `isProcessComplexJobPayload`, the guards the `createJobContext` node adds to `type_guards.dialectic.ts`, each applied to the arm's own payload object: `const executePayload = { job: payload.job }` guarded by `isProcessSimpleJobPayload`, and the same for the plan arm. This is the pattern the payload workstream ratified — the arm is selected by the `job_type` column and the payload guard narrows inside it.
         * `[ ]`   Only those two arms narrow. `ProcessRenderJobPayload` and `ProcessCompressJobPayload` each declare `job: DialecticJobRow` unnarrowed, so `{ job: payload.job }` assigns to both with no guard, and each of those processors validates the payload it declares on its own entry.
         * `[ ]`   Both guards delegate the row's payload to `isDialecticExecuteJobPayload` and `isDialecticPlanJobPayload`, which throw a per-member diagnostic rather than returning `false`. A `try` around the `switch` converts that throw to `{ error, retriable: false }`, surfacing the guard's own message naming the member at fault. The two hand-thrown `Unsupported or null job_type for job <id>` statements inside the EXECUTE and PLAN arms are deleted with the predicates whose `else` branches held them.
         * `[ ]`   Each arm narrows its processor's return: an error arm is propagated unchanged as this function's error arm, carrying that processor's own `Error` and its own `retriable` flag; a success arm returns `{ dispatched: true }`.
         * `[ ]`   The `default` returns the error arm carrying an `Error` built from the message it throws today, with `retriable: false`, in place of throwing. It is the one arm-selection failure that survives, a row whose column matches no case.
         * `[ ]`   The `ProcessCompressJobDeps` literal carries `assembleCompressionPrompt`, `assembleContinuationPrompt`, `prepareModelJob`, `constructStoragePath` and `logger`, and nothing else, with `prepareModelJob` supplied from `deps.ctx.prepareModelJob`, the pre-bound closure the composition root already puts on the job context.
         * `[ ]`   The `isDialecticCompressJobPayload` gate, its negated-guard block, the hand-thrown `Invalid COMPRESS payload for job <id>` and the `compressPayload` local are deleted. `processCompressJob` narrows `payload.job.payload` on its own entry and returns the guard's per-member diagnostic on its error arm, which this arm propagates.
         * `[ ]`   No path writes `status: 'failed'`, an `error_details` failure message, or any other row status, and no path leaves the function by throwing.
         * `[ ]`   The `countTokensAnthropic`, `rawGetEncoding`, `isKnownTiktokenEncoding`, `isDialecticCompressJobPayload`, `DialecticCompressJobPayload`, `isProcessCompressJobErrorReturn` and `TablesUpdate` imports leave with the members and the write they served.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   The `switch` over `payload.job.job_type` is unchanged in every arm and in its `default`; the arm is still selected by that column, which is the pattern every selector in this workstream adopts.
         * `[ ]`   No payload is validated twice. Each processor guards the payload it declares on its own entry; the two guards this file calls exist to narrow a row typed `DialecticJobPayload` into the arm type its processor declares, which is the compiler's requirement for constructing that payload, not a second validation of untrusted data.
         * `[ ]`   Both bound assembler closures keep their deps literals exactly as they stand, including the `renderPrompt`, `fileManager`, `constructStoragePath` and `downloadFromStorage` members each supplies, with `dbClient` read from `params`.
         * `[ ]`   `createPlanJobContext(deps.ctx)` and `createRenderJobContext(deps.ctx)` are called exactly where they are called now.
         * `[ ]`   Every log line keeps its text and its position.
         * `[ ]`   `dialectic-worker/index.ts` goes transiently non-compilable and is not edited here: `handleJob` calls this function with six positional arguments and discards its result. It belongs to that file's own node, which is where the returned outcome is read.
      * `[ ]`   Each goal is proven by a named case in this file's suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer dispatch: read the job row's type, build the slice of context that type's processor declares, call it, and report what it returned.
      * `[ ]`   The role is correct because a dispatcher's contribution is the wiring and the relay: which collaborators a processor receives is decided here, and the outcome that processor reports has exactly one place to go — up, to the party that claimed the row. Recording a verdict about the row is not in that set; the runner holds `attempt_count` and `max_retries`, and only it can say whether a failure is terminal.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not write `status: 'failed'`, `retrying`, `retry_loop_failed` or any other row status on any path.
         * `[ ]`   Do not read `max_retries` or `attempt_count`, and do not decide whether a failure is terminal.
         * `[ ]`   Do not change how any arm is selected; the column already answers it in every case.
         * `[ ]`   Do not guard any payload. Each processor validates the payload it declares, on its own entry.
         * `[ ]`   Do not convert or re-wrap a processor's error; propagate it unchanged with its own `retriable` flag.
         * `[ ]`   Do not edit `processCompressJob.ts`, `prepareModelJob.ts`, either assembler, or `dialectic-worker/index.ts`; each has its own node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is job dispatch in `supabase/functions/dialectic-worker/processJob.ts` — arm selection by job type, per-arm context construction, processor invocation, and the outcome relayed to the runner.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which collaborators each processor is constructed with, this file being the sole construction site of the COMPRESS processor's deps.
         * `[ ]`   What this function reports for each arm it dispatched.
         * `[ ]`   `ProcessJobDeps`, `ProcessJobParams`, `ProcessJobPayload`, `ProcessJobSuccessReturn`, `ProcessJobErrorReturn`, `ProcessJobReturn` and `ProcessJobFn` — this function's own contract, declared in `dialectic-service/dialectic.interface.ts` beside `IJobProcessors` because that file already declares every processor contract this function consumes, and landed in this node because `processJob.ts` is the first source file that requires them.
      * `[ ]`   Outside boundary:
         * `[ ]`   Whether a failure is retried, and what a job's terminal state is, both owned by the runner.
         * `[ ]`   What any processor does with what it is given, and every payload contract and guard those processors own.
         * `[ ]`   The eight `ProcessSimpleJob*`, `ProcessComplexJob*` and `ProcessRenderJob*` symbol sets, declared in the `createJobContext` node. This node adds `ProcessJob*` to the same file; it neither redeclares nor edits those.
         * `[ ]`   The model call, owned by `prepareModelJob` and reached through the closure this file forwards.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`IJobProcessors`, already imported), now reached through `deps.processors` rather than a positional parameter.
         * `[ ]`   Layer classification: service-layer contract surface.
         * `[ ]`   Direction: inbound; no new direction is opened.
         * `[ ]`   Purpose: the five processors this function dispatches to, injected as one typed collaborator object.
      * `[ ]`   Provider: `createJobContext/JobContext.interface.ts` (`IJobContext`, `IPlanJobContext`, `IRenderJobContext`, already imported), now reached through `deps.ctx`.
         * `[ ]`   Layer classification: app-layer context contract, constructed at the composition root.
         * `[ ]`   Direction: inbound; this file already takes `ctx: IJobContext` and reads five members off it, so no new direction is opened and no wiring changes at the root.
         * `[ ]`   Purpose: the collaborators each arm slices or forwards, `prepareModelJob` among them, so the COMPRESS processor reaches the same dispatcher every other job type reaches.
      * `[ ]`   Added provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isProcessSimpleJobPayload`, `isProcessComplexJobPayload`), the two arm guards the `createJobContext` node adds to that file.
         * `[ ]`   Layer classification: shared guard surface, owner of every payload-arm guard in the repo.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: narrow a row typed `DialecticJobPayload` into the arm type its processor declares, replacing the two file-private predicates that re-checked the `job_type` column the `switch` had already read.
      * `[ ]`   Removed providers: `npm:@anthropic-ai/tokenizer` (`countTokens as countTokensAnthropic`), `npm:js-tiktoken` (`getEncoding as rawGetEncoding`) and `type_guards.chat.ts` (`isKnownTiktokenEncoding`), all three imported solely to build the encoding closure this literal no longer carries; `enqueueCompressJobs.guard.ts` (`isDialecticCompressJobPayload`) with `enqueueCompressJobs.interface.ts` (`DialecticCompressJobPayload`) and `processCompressJob.guard.ts` (`isProcessCompressJobErrorReturn`), which served the deleted gate and the deleted write; and `dialectic-service/dialectic.interface.ts`'s `DialecticExecuteJobPayload` and `DialecticPlanJobPayload`, whose only consumers were the two deleted predicates. `ctx.enqueueModelCall` and `ctx.countTokens` stay on the context for their other consumers and are simply not read here.
      * `[ ]`   Confirm:
         * `[ ]`   `IJobContext` gains and loses nothing; this node reads one more member and two fewer.
         * `[ ]`   `IJobProcessors` keeps its five member names; each member's `Fn` type is reshaped in the `createJobContext` node, and this node conforms the call sites to them.
         * `[ ]`   No reverse dependency: no processor imports this file.
      * `[ ]`   `context_slice`
         * `[ ]`   From `deps.ctx`, for the COMPRESS arm: `promptAssembler`, `fileManager`, `downloadFromStorage`, `logger` and `prepareModelJob` — the five members the two closures and the deps literal read. The other three arms slice `deps.ctx` through `createPlanJobContext` and `createRenderJobContext` or pass it whole.

   * `[ ]`   `processJob.interface.test.ts`
      * `[ ]`   A case proves the deps surface by typed assignment: `Record<keyof ProcessJobDeps, true>` over `processors` and `ctx`, asserting two.
      * `[ ]`   A case proves the params surface the same way over `dbClient`, asserting one, and a case proves the payload surface over `job`, asserting one — exhaustive in both directions, and the proof that `projectOwnerUserId` and `authToken` are gone.
      * `[ ]`   A case proves the two-arm return by typed assignment: a `ProcessJobSuccessReturn` value assigns to `ProcessJobReturn`, and a `ProcessJobErrorReturn` value assigns to `ProcessJobReturn`.
      * `[ ]`   A case proves `ProcessJobSuccessReturn` is `{ dispatched: true }` by typed literal, carrying no other member.
      * `[ ]`   A case proves `ProcessJobFn` accepts the declared deps, params and payload and returns `Promise<ProcessJobReturn>`.
      * `[ ]`   The file contains only type imports, contract headers and typed assertions; it calls no builder and stubs no function.

   * `[ ]`   dialectic-service/`dialectic.interface.ts`
      * `[ ]`   `ProcessJobDeps` declares `processors: IJobProcessors` and `ctx: IJobContext`. Both are collaborator objects, so both belong in deps and neither is a per-invocation value.
      * `[ ]`   `ProcessJobParams` declares `dbClient: SupabaseClient<Database>` and nothing else, matching every processor params type this file declares.
      * `[ ]`   `ProcessJobPayload` declares `job: DialecticJobRow & { payload: DialecticJobPayload }` — the undetermined union, this function being the one place an arm is still unselected.
      * `[ ]`   `ProcessJobSuccessReturn` is `{ dispatched: true }`, `ProcessJobErrorReturn` is `{ error: Error; retriable: boolean }`, and `ProcessJobReturn` is their union.
      * `[ ]`   `ProcessJobFn` is `(deps: ProcessJobDeps, params: ProcessJobParams, payload: ProcessJobPayload) => Promise<ProcessJobReturn>`.
      * `[ ]`   `IJobContext` is imported here for the deps type; `SupabaseClient`, `Database`, `DialecticJobRow` and `DialecticJobPayload` are already declared or imported in this file.

   * `[ ]`   `processJob.interaction.spec`
      * `[ ]`   Arm selection, unchanged: the `switch` over `payload.job.job_type`, with `EXECUTE`, `PLAN`, `RENDER`, `COMPRESS` and a `default`.
      * `[ ]`   Branch: an `EXECUTE` or `PLAN` row carries a payload its arm type does not admit.
         * `[ ]`   Condition: `payload.job.job_type` is `'EXECUTE'` or `'PLAN'`, and the row's payload fails a member check.
         * `[ ]`   Decision: `isProcessSimpleJobPayload({ job: payload.job })`, or `isProcessComplexJobPayload({ job: payload.job })`, each delegating the row's payload to the arm guard that owns it, each throwing a per-member diagnostic.
         * `[ ]`   Dependency call: the existing delegation log line only; no processor is called.
         * `[ ]`   Outcome: the `try` around the `switch` catches that diagnostic and returns `{ error, retriable: false }` carrying the guard's own message, which names the member at fault. No hand-rolled message stands in front of it.
      * `[ ]`   Branch: an `EXECUTE`, `PLAN` or `RENDER` row is dispatched.
         * `[ ]`   Condition: the arm's guard admitted the payload, or the arm is `RENDER`, whose payload type narrows nothing.
         * `[ ]`   Decision: the guard call above for the first two; none for `RENDER`.
         * `[ ]`   Dependency call: `deps.processors.processSimpleJob(deps.ctx, { dbClient }, executePayload)`; `deps.processors.processComplexJob(createPlanJobContext(deps.ctx), { dbClient }, planPayload)`; `deps.processors.processRenderJob(createRenderJobContext(deps.ctx), { dbClient }, { job: payload.job })`.
         * `[ ]`   Outcome: the processor's error arm is returned as `{ error, retriable }` with both members unchanged; its success arm returns `{ dispatched: true }`.
      * `[ ]`   Branch: the row's column matches no arm.
         * `[ ]`   Condition: `payload.job.job_type` matches no `case`.
         * `[ ]`   Decision: the `default`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `{ error: new Error("Unsupported or null job_type for job <id>"), retriable: false }`, returned in place of the throw.
      * `[ ]`   Branch: a `COMPRESS` row is dispatched.
         * `[ ]`   Condition: `payload.job.job_type` is `'COMPRESS'`.
         * `[ ]`   Decision: none. No payload is guarded here; `processCompressJob` narrows `payload.job.payload` on its own entry.
         * `[ ]`   Dependency call: the existing delegation log line, then the two assembler closures built exactly as they are now from `deps.ctx.promptAssembler`, `deps.ctx.fileManager`, `deps.ctx.downloadFromStorage`, `deps.ctx.logger`, `renderPrompt` and `constructStoragePath`; then `ProcessCompressJobDeps` from those two closures plus `prepareModelJob: deps.ctx.prepareModelJob`, `constructStoragePath` and `deps.ctx.logger`; then `deps.processors.processCompressJob(compressDeps, { dbClient }, { job })`.
         * `[ ]`   Outcome: the processor's error arm is returned as `{ error, retriable }` with both members unchanged, and no row is written; its success arm returns `{ dispatched: true }`, that success being either a dedup completion the processor wrote itself or a dispatch whose completion `saveResponse` writes.
      * `[ ]`   Ordering and side effects: exactly one processor call per invocation; no `dialectic_generation_jobs` write on any path; no notification on any path; every path leaves the function by returning a member of the union, and nothing leaves it by throwing.

   * `[ ]`   _shared/`dialectic.mock.ts`
      * `[ ]`   Five owned object types take the four symbols each, production-named — `<Type>Overrides` as `Partial<T>`, `build<Type>`, `<Type>Corruptions` as `{ [K in keyof T]?: unknown }` and `invalidate<Type>` returning `unknown`: `ProcessJobDeps`, `ProcessJobParams`, `ProcessJobPayload`, `ProcessJobSuccessReturn` and `ProcessJobErrorReturn`. `ProcessJobReturn` is a union and takes nothing of its own.
      * `[ ]`   `buildProcessJobDeps` defaults `ctx` to `buildIJobContext()` from `JobContext.mock.ts` and `processors` to an `IJobProcessors` literal composed member for member from each member's own function mock: `mockProcessSimpleJob`, `mockProcessComplexJob` and `mockProcessRenderJob` from this file, `mockPlanComplexStage` from this file, and `mockProcessCompressJobFn` from `processCompressJob.mock.ts`.
      * `[ ]`   `mockPlanComplexStage: PlanComplexStageFn` is added, returning an empty child-job array. `PlanComplexStageFn` is owned by `dialectic.interface.ts` and has no mock anywhere; `IJobProcessors` cannot be built without one.
      * `[ ]`   `buildProcessJobParams` defaults `dbClient` to `createMockSupabaseClient(undefined, {}).client` cast to `SupabaseClient<Database>`, the external-client cast this file already makes. `buildProcessJobPayload` returns `{ job: buildDialecticJobRow() }`.
      * `[ ]`   `buildProcessJobSuccessReturn` returns `{ dispatched: true }`; `buildProcessJobErrorReturn` defaults `error` to `new Error("mock-process-job-error")` and `retriable` to `false`.
      * `[ ]`   One function mock for the owned function type: `mockProcessJob: ProcessJobFn`, returning `buildProcessJobSuccessReturn()` — identical signature, no extra parameters, no options bag, no recording.
      * `[ ]`   Every other export in this file is unchanged.

   * `[ ]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
      * `[ ]`   A case checklist per guard this node adds, its fixtures drawn from the builders and invalidators above and never hand-rolled: the builder's valid default accepted; valid overrides accepted; `null`, `undefined`, a primitive and an array rejected; each property corrupted in turn rejected; each required property omitted by rest-destructure rejected.
      * `[ ]`   `isProcessJobSuccessReturn` accepts `buildProcessJobSuccessReturn()` and rejects `buildProcessJobErrorReturn()`, and `isProcessJobErrorReturn` rejects the success flavor, arranged in one file so a collapsed discriminant fails an assertion.
      * `[ ]`   `isProcessJobDeps` is proven to check presence only: a deps object whose `processors` and `ctx` are present is accepted, and one missing either is rejected. A passing case proves presence, never behavior, and no case asserts otherwise.
      * `[ ]`   Every existing case in this file keeps its arrangement and its assertions.

   * `[ ]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
      * `[ ]`   Five guards are added: `isProcessJobDeps`, `isProcessJobParams`, `isProcessJobPayload`, `isProcessJobSuccessReturn` and `isProcessJobErrorReturn` — one per type this node declares, less the `ProcessJobReturn` union.
      * `[ ]`   `isProcessJobDeps` is a deps type and takes the presence-of-member form: `isRecord`, then `processors` and `ctx` each present and an object. It asserts nothing about what either collaborator does.
      * `[ ]`   `isProcessJobParams` checks `isRecord` and that `dbClient` is present and an object. `isProcessJobPayload` checks `isRecord` and calls `isDialecticJobRow` on `job`, delegating the row to the guard the `createJobContext` node adds to this file, and narrows the row's payload no further — this function's payload is the one place an arm is still undetermined.
      * `[ ]`   `isProcessJobSuccessReturn` tests its own literal member and rejects the error arm; `isProcessJobErrorReturn` tests that `error` is an `Error` and `retriable` a boolean and rejects the success arm. Both are boolean checks and throw nothing.
      * `[ ]`   Every existing guard in this file is unchanged.

   * `[ ]`   `processJob.test.ts`
      * `[ ]`   Every case calls `processJob(deps, { dbClient }, { job })` and restates its `Act` line to that call, the four-field header being a claim about the body. Its deps come from `buildProcessJobDeps`, overriding only the processor the case asserts on.
      * `[ ]`   Every arm case asserts the returned value: `{ dispatched: true }` where the processor was arranged to succeed, and the propagated `{ error, retriable }` where it was arranged to fail, with both members identical to the ones the processor returned.
      * `[ ]`   The case asserting `Invalid COMPRESS payload for job …` is deleted with the gate it covered; a case in its place arranges `processCompressJob` to return the error arm a malformed payload produces and asserts this function returns that same error and `retriable` flag, and issues no `dialectic_generation_jobs` update.
      * `[ ]`   The cases that assert the constructed `ProcessCompressJobDeps` drop their `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic` expectations and assert the five members the literal now carries, with `prepareModelJob` identical to the `deps.ctx.prepareModelJob` the test supplied.
      * `[ ]`   The cases that assert the constructed `ProcessCompressJobParams` assert one member, `dbClient`, and that the payload the processor received is `{ job }`.
      * `[ ]`   The two cases asserting a thrown `Unsupported or null job_type for job …` for an unnarrowed `EXECUTE` row and an unnarrowed `PLAN` row assert instead the returned error arm carrying the arm guard's own per-member diagnostic, for a row payload corrupted through `invalidateDialecticExecuteJobPayload` and `invalidateDialecticPlanJobPayload` respectively, each naming the member at fault. The `default` case asserts the returned error arm carrying the unchanged message with `retriable: false`.
      * `[ ]`   A case proves each arm still routes: a `'COMPRESS'` row reaches `processCompressJob` exactly once, an `'EXECUTE'` row reaches `processSimpleJob`, a `'PLAN'` row reaches `processComplexJob`, and a `'RENDER'` row reaches `processRenderJob`.
      * `[ ]`   New case: no arm writes `dialectic_generation_jobs`, arranged with a failing processor on each of the four arms in one file so a reinstated write fails an assertion.
      * `[ ]`   Every remaining case keeps its coverage and its assertions, less the retired members.

   * `[ ]`   `processJob.ts`
      * `[ ]`   The function is declared `export const processJob: ProcessJobFn = async (deps, params, payload) => { … }`; the six-parameter list and its inline types are deleted. `ProcessJobFn` and `ProcessJobReturn` are imported from `dialectic-service/dialectic.interface.ts` beside the imports already taken from that file.
      * `[ ]`   `params.dbClient` is destructured once at the top and replaces every `dbClient` reference; `payload.job` replaces every `job` reference, `jobId` still destructured from it; `deps.ctx` replaces every `ctx` reference and `deps.processors` every `processors` reference.
      * `[ ]`   Each of the four processor calls takes its reshaped arguments, and its result is narrowed: the error arm is returned as `{ error, retriable }` unchanged, and the success arm falls through to `return { dispatched: true }`.
      * `[ ]`   The `jobIsExecuteJob` and `jobIsPlanJob` predicates are deleted with the two `if`/`else` blocks that called them and the two `throw new Error(\`Unsupported or null job_type for job ${jobId}\`)` statements those `else` branches held. The EXECUTE arm builds `const executePayload = { job: payload.job }` and narrows it with `isProcessSimpleJobPayload`; the PLAN arm does the same with `isProcessComplexJobPayload`; each negated-guard block is the narrowing device the compiler requires and is structurally unreachable, the guards throwing rather than returning `false`.
      * `[ ]`   A `try` wraps the `switch`, and its `catch` returns `{ error: <the caught Error>, retriable: false }` — the one place a guard diagnostic becomes this function's error arm.
      * `[ ]`   The `default`'s `throw new Error(\`Unsupported or null job_type for job ${jobId}\`)` becomes a `return` of the error arm carrying an `Error` built from that same message, with `retriable: false`.
      * `[ ]`   Added imports: `isProcessSimpleJobPayload` and `isProcessComplexJobPayload` from `_shared/utils/type-guards/type_guards.dialectic.ts`; `DialecticExecuteJobPayload` and `DialecticPlanJobPayload` are no longer imported, the deleted predicates having been their only consumers.
      * `[ ]`   The `isDialecticCompressJobPayload` call, its negated-guard block with the hand-thrown `Invalid COMPRESS payload for job ${jobId}`, and the `compressPayload` local are deleted; the COMPRESS arm passes `{ job: payload.job }` as the processor's payload.
      * `[ ]`   The `isProcessCompressJobErrorReturn` block with its `updatePayload` literal, its `dialectic_generation_jobs` update and its `throw updateError` is deleted; the arm's error handling is the same narrowing every other arm performs.
      * `[ ]`   The `ProcessCompressJobDeps` literal drops `enqueueModelCall`, `countTokens`, the `getEncoding` closure and `countTokensAnthropic`, and gains `prepareModelJob: deps.ctx.prepareModelJob`.
      * `[ ]`   Deleted imports: `countTokens as countTokensAnthropic`, `getEncoding as rawGetEncoding`, `isKnownTiktokenEncoding`, `isDialecticCompressJobPayload`, `DialecticCompressJobPayload`, `isProcessCompressJobErrorReturn`, `TablesUpdate` and `ProcessCompressJobParams` where the retired literal required it.
      * `[ ]`   Nothing else in the file changes: both assembler closures, the two context slicers, the `switch` and its arms, and every log line stand exactly as they are.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file reads the job context and the processors it was handed, imports each processor's contract and its own from the service-layer interface that declares them, and exports the implementation outward to the worker root; it exports nothing back to any processor.
      * `[ ]`   The `enqueueModelCall` edge for the COMPRESS arm is replaced by the `prepareModelJob` edge one layer up the same path, so the graph gains no direction and loses two third-party tokenizer imports and two payload-guard imports.
      * `[ ]`   No cycle: no processor imports this file.

   * `[ ]`   `requirements`
      * `[ ]`   The implementation is annotated `ProcessJobFn`, takes three arguments and declares no parameter types of its own, so a divergence between the declared contract and the implementation is a compile error — proven by the compiler.
      * `[ ]`   `ProcessJobDeps` declares two members, `ProcessJobParams` one and `ProcessJobPayload` one, and neither `projectOwnerUserId` nor `authToken` appears in any of them — interface test, exhaustive key records.
      * `[ ]`   Each of the four arms calls its processor with that processor's declared deps, `{ dbClient }` and `{ job }` — unit test, captured-argument assertions.
      * `[ ]`   Each arm returns `{ dispatched: true }` on its processor's success and propagates its processor's `error` and `retriable` unchanged on failure — unit test, one case per arm per outcome.
      * `[ ]`   An `EXECUTE` or `PLAN` row whose payload fails a member check returns the error arm carrying the arm guard's own per-member diagnostic, and the `default` returns the error arm with its existing message — all three with `retriable: false`, and nothing leaves the function by throwing — unit test, returned-value assertions where a thrown error was asserted before.
      * `[ ]`   `jobIsExecuteJob` and `jobIsPlanJob` do not exist, and the EXECUTE and PLAN arms narrow through `isProcessSimpleJobPayload` and `isProcessComplexJobPayload` — proven by the compiler and by the diagnostic each rejection case asserts.
      * `[ ]`   No path writes `dialectic_generation_jobs` — unit test, update-count assertions across all four arms with a failing processor on each.
      * `[ ]`   The constructed `ProcessCompressJobDeps` carries five members, `prepareModelJob` among them, and none of the four model-call members — unit test.
      * `[ ]`   No payload guard is called in this file, and a malformed COMPRESS payload reaches the caller as the processor's classified error arm — unit test.
      * `[ ]`   Every type this node declares, less the `ProcessJobReturn` union, has its four mock symbols and its guard, and `ProcessJobFn` has one function mock — proven by the compiler and by the guard test's case checklist.

* `[ ]`   supabase/functions/dialectic-worker/index.ts **[BE] The root supplies collaborators and unbound implementations and composes nothing, and `handleJob` becomes the worker's sole retry dispatcher: delete every bound closure and the inline `PrepareModelJobDeps` literal, supply the eleven params the factory now assembles from, switch `retryJob` and `textSplitter` to their canonical modules, read `processJob`'s outcome and branch `attempt_count` against `max_retries` between the claim and the terminal write, and carry the full-chain compression integration test**

   * `[ ]`   `objective`
      * `[ ]`   Solve a root that composes the graph it was built to supply, and a runner that cannot retry the jobs it claims. `createDialecticWorkerDeps` builds `boundGatherArtifacts`, `boundEnqueueModelCall` and — inside the `prepareModelJob` params closure it hands the factory — a `CompressPromptDeps` literal, a `CalculateAffordabilityDeps` literal and a `PrepareModelJobDeps` literal, three graphs deep, so the shape of the worker's graph exists only inside one arrow function and the factory written to assemble it assembles nothing. In the same function it constructs an embedding provider read, an embedding adapter, an `EmbeddingClient`, an `IndexingService` and a `RagService` for a compression path that no longer embeds. Meanwhile `handleJob` claims the job, calls `processJob`, discards whatever it returns, and on any failure writes `status: 'failed'` — so `max_retries` and `attempt_count` govern nothing outside the EXECUTE path, and the four processors that now report `Success | Error` report it to a caller that throws the value away. Its `defaultProcessors` wraps all five processors in adapters typed `Promise<void>` that discard their results, and its `textSplitter` is the `LangchainTextSplitter` declared inside `indexing_service.ts`, a file the epic deletes.
      * `[ ]`   Functional goals:
         * `[ ]`   `createDialecticWorkerDeps` constructs no deps object for any worker module. `boundGatherArtifacts`, `boundEnqueueModelCall`, the `prepareModelJob` params closure and the `boundCompressPrompt` and `boundCalculateAffordability` closures inside it are deleted, and the unbound `gatherArtifacts`, `enqueueModelCall` and `prepareModelJob` implementations are supplied in their place.
         * `[ ]`   The `createJobContext` params literal gains the eleven members `JobContextParams` now declares: `compressPrompt`, `calculateAffordability`, `enqueueCompressJobs`, `getSortedCompressionCandidates`, `applyCompressionOverlay`, `textSplitter`, `constructStoragePath`, `tokenizerDeps`, `netlifyQueueUrl`, `netlifyApiKey` and `apiKeyForProvider`, each an unbound implementation or a raw collaborator this function already holds or now imports.
         * `[ ]`   `tokenizerDeps` is a real `CountTokensDeps`: `getEncoding` from `js-tiktoken`, guarded by `isKnownTiktokenEncoding` and throwing on an unknown encoding; `countTokensAnthropic` from `@anthropic-ai/tokenizer`; and `logger`. No character-indexing encoder and no `text.length` count is supplied at this root.
         * `[ ]`   `textSplitter` is `new LangchainTextSplitter()` from `_shared/utils/text_splitter.ts`, the class implementing the `ITextSplitter` that `_shared/utils/text_splitter.interface.ts` declares and `JobContextParams` names — not the identically named class inside `indexing_service.ts`.
         * `[ ]`   `retryJob` is imported from `./retryJob/retryJob.ts` and supplied as the canonical `RetryJobFn`. The legacy `dialectic-worker/retryJob.ts` and `dialectic-worker/retryJob.test.ts` are deleted, this being the last consumer to switch off them.
         * `[ ]`   The `ragService`, `indexingService` and `embeddingClient` members leave the params literal, and their constructions leave the function with the embedding-provider read, the `OPENAI_API_KEY` check that served the embedding adapter, and the `embeddingAdapter` the client wrapped.
         * `[ ]`   The seven members the root carried only for `saveResponse` — `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent` and `debitTokens` — leave the params literal with the imports that supplied them. `netlifyResponse/index.ts` imports each directly.
         * `[ ]`   `defaultProcessors` is an `IJobProcessors` literal assigning the five implementations directly — `processSimpleJob`, `processComplexJob`, `planComplexStage`, `processRenderJob`, `processCompressJob` — with no adapter closure around any of them, each member now satisfying its own reshaped `Fn` type.
         * `[ ]`   `handleJob` calls `processJob({ processors: effectiveProcessors, ctx: deps }, { dbClient: adminClient }, { job: validatedJob })` and narrows its return with `isProcessJobErrorReturn`.
         * `[ ]`   A failure — whether `processJob` returned its error arm or an exception reached the `catch` — runs one failure sequence: the existing NSF branch, then the retry branch, then the terminal path. Both entries call the same local `handleFailure(error: Error)` closure, in the shape `processSimpleJob`'s `emitImmediateFailure` already takes in this repo.
         * `[ ]`   The retry branch sits between the claim and the terminal write: when `job.attempt_count < job.max_retries`, `handleJob` reads the `ai_providers` row for `job.payload.model_id`, builds a one-element `FailedAttemptError[]` from that row's `api_identifier`, the model id and the failure's message, and calls `deps.retryJob({ dbClient: adminClient, job }, { failedAttempts })`. The provider read happens on this path only.
         * `[ ]`   `retryJob`'s return is narrowed: the notified flavor returns from `handleFailure`; the unnotified flavor logs the notification error it carries and returns; the error arm does not return and falls through to the terminal path, because no retry was scheduled and nothing else would report the job. A failed provider read falls through the same way — the payload cannot be built, so the job cannot be retried.
         * `[ ]`   When `job.attempt_count` is not below `job.max_retries`, `handleFailure` takes the terminal path unchanged: the two failure notifications and the `status: 'failed'` write with its `completed_at` and `error_details`.
         * `[ ]`   The `authToken` parameter leaves `handleJob` and its call site in `serve`, no arm reading it after `processJob`'s node; every model call takes its JWT from the job payload's `user_jwt`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   The `Authorization` header check in `serve` is unchanged. It authenticates the invocation, which is a separate concern from the JWT a model call carries, and nothing about it moves.
         * `[ ]`   The pre-claim validation block is unchanged: the missing-`user_id` failure and the invalid-payload failure each keep their log lines, their two notifications and their `status: 'failed'` write. A job with no owner or an unreadable payload can never succeed on a retry, and neither failure has been claimed.
         * `[ ]`   The claim itself is unchanged: the atomic conditional update, its two `.neq` filters, and the silent return when the row could not be claimed.
         * `[ ]`   The `contribution_generation_started` notification, the `validatedJob` construction, the `isTestRunner` diagnostic and every log line are unchanged.
         * `[ ]`   The NSF branch inside the failure sequence is unchanged: the `Insufficient funds` message test, the `pauseJobsForNsf` call with its five params, its early return and its fallback log line. It precedes the retry branch, a paused job being neither retried nor failed.
         * `[ ]`   `fileManager`, `promptAssembler`, `documentRenderer`, both wallet services, `computeJobSig`, `apiKeyForProvider` and every environment read that survives keep their construction, their order and their error messages.
         * `[ ]`   No other file is edited. `createJobContext.ts`, every worker module and every processor is conformed in its own node, and each lands before this one.
      * `[ ]`   Each goal is proven by a named case in this file's unit or integration suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is infra-layer composition root and process runner: read the environment, construct the services and raw collaborators the process needs, hand them and every unbound implementation to the factory, and run the claimed job's lifecycle from claim through outcome to retry or terminal failure.
      * `[ ]`   The role is correct because a root closes a graph rather than opening one. Every deps object the worker constructs is assembled once, in the factory, from what this file supplies — and the one decision this file keeps for itself is the one only it can make: whether a claimed row has attempts left, which is a fact about the row it claimed.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not construct a deps object for any worker module, and do not bind any implementation before handing it to the factory.
         * `[ ]`   Do not decide what a processor does with a failure; each classifies its own and reports `retriable`, and this file acts on the row.
         * `[ ]`   Do not delete `rag_service.ts`, `indexing_service.ts` or their support; this node severs the last live references, and the deletion is its own step.
         * `[ ]`   Do not edit `createJobContext.ts`, `processJob.ts`, any processor, or `netlifyResponse/index.ts`; each has its own node.
         * `[ ]`   Do not change the request-authentication gate, the claim, or the pre-claim validation failures.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/index.ts` — the worker process's entrypoint: environment reads, service construction, the params handed to the context factory, and one claimed job's lifecycle.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which concrete implementation stands behind each collaborator the worker process uses.
         * `[ ]`   Whether a claimed row has attempts remaining, and what is recorded when it does not.
      * `[ ]`   Outside boundary:
         * `[ ]`   How any deps object is shaped, owned by `createJobContext`.
         * `[ ]`   Which arm a job takes and what that arm reports, owned by `processJob` and the processors.
         * `[ ]`   What a retrying row records, owned by `retryJob`.
         * `[ ]`   The `netlifyResponse` graph, assembled in that function's own composition root.

   * `[ ]`   `deps`
      * `[ ]`   Added provider: `_shared/utils/text_splitter.ts` (`LangchainTextSplitter`) and `_shared/utils/text_splitter.interface.ts` (`ITextSplitter`).
         * `[ ]`   Layer classification: shared utility.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the splitter `enqueueCompressJobsDeps` requires, typed by the interface `JobContextParams.textSplitter` names. It replaces the identically named class in `indexing_service.ts`, which types a different `ITextSplitter` and is deleted with that file.
      * `[ ]`   Added provider: `./retryJob/retryJob.provides.ts` (`retryJob`, typed `RetryJobFn`).
         * `[ ]`   Layer classification: sibling app-layer module.
         * `[ ]`   Direction: lateral within `dialectic-worker`.
         * `[ ]`   Purpose: the canonical retry dispatcher the factory binds and `handleJob` reads off the root. It replaces the legacy six-positional `./retryJob.ts`, which this node deletes.
         * `[ ]`   Added with it: `./retryJob/retryJob.guard.ts` for the two success flavors and the error arm `handleFailure` narrows.
      * `[ ]`   Added provider: `./enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`enqueueCompressJobs`), `_shared/utils/vector_utils.provides.ts` (`getSortedCompressionCandidates`) and `./applyCompressionOverlay/applyCompressionOverlay.provides.ts` (`applyCompressionOverlay`).
         * `[ ]`   Layer classification: sibling app-layer modules and a shared utility.
         * `[ ]`   Direction: inbound and lateral within the worker.
         * `[ ]`   Purpose: three unbound implementations the factory binds and this root did not previously supply at all.
      * `[ ]`   Added provider: `npm:js-tiktoken` (`getEncoding`), `npm:@anthropic-ai/tokenizer` (`countTokens`) and `_shared/utils/type-guards/type_guards.chat.ts` (`isKnownTiktokenEncoding`), the three `processJob.ts` releases in its own node.
         * `[ ]`   Layer classification: third-party tokenizers and a shared guard.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the real `CountTokensDeps` the factory binds `countTokens` against, constructed once at the top instead of per call site.
      * `[ ]`   Added provider: `dialectic-service/dialectic.interface.ts` (`FailedAttemptError`, beside the `DialecticJobPayload` and `IJobProcessors` imports already taken) and `processJob.guard.ts`'s `isProcessJobErrorReturn` from the guard file the `processJob` node adds it to.
         * `[ ]`   Layer classification: service-layer contract surface and its guards.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: build the retry payload and narrow the dispatcher's outcome.
      * `[ ]`   Removed providers: `_shared/services/rag_service.ts` (`RagService`), `_shared/services/indexing_service.ts` (`IndexingService`, `LangchainTextSplitter`, `EmbeddingClient`), and the seven `saveResponse` collaborators — `continueJob/continueJob.ts`, `resolveFinishReason.ts`, `isIntermediateChunk.ts`, `determineContinuation.ts`, `buildUploadContext.ts`, `jsonSanitizer.ts` and `debitTokens.ts` — with the params members each supplied.
         * `[ ]`   Layer classification: shared services and utilities.
         * `[ ]`   Direction: inbound, and closed by this node — no live reference into the RAG core remains in the worker afterwards.
         * `[ ]`   Purpose retired: retrieval and embedding for a compression path that scores by `candidateTokens × importance`, and a second process's collaborators carried on this process's root.
      * `[ ]`   Confirm:
         * `[ ]`   Every member the params literal supplies is declared by `JobContextParams` as of the `createJobContext` node, and every member that type declares is supplied — the literal and the type are checked against each other in both directions.
         * `[ ]`   No reverse dependency: no module this root imports imports this file.
         * `[ ]`   `getAiProviderAdapter` stays imported — the params literal still supplies it — while the `embeddingAdapter` this file built with it goes.
      * `[ ]`   `context_slice`
         * `[ ]`   `handleJob` reads `deps.logger`, `deps.notificationService` and `deps.retryJob` off the root it was handed, and passes the root whole to `processJob` as `ctx`.

   * `[ ]`   `construction`
      * `[ ]`   `createDialecticWorkerDeps` remains the process's single entry to construction: one exported async function taking the admin client and returning a fully constructed `IJobContext`, with no partially constructed instance and no optional field.
      * `[ ]`   It constructs services and reads the environment; it constructs no deps object and binds no implementation. Every function it supplies is the unbound export of the module that owns it, and the factory binds it.
      * `[ ]`   Every environment read keeps its fail-fast throw, so a misconfigured process cannot produce a half-built root: `NETLIFY_QUEUE_URL`, `AWL_API_KEY` and `HMAC_SECRET`. The `OPENAI_API_KEY` read that served the embedding adapter goes with it; `apiKeyForProvider` keeps its own per-provider reads and their throws.

   * `[ ]`   `handleJob.interaction.spec`
      * `[ ]`   Branch: the job carries no `user_id`, or its payload does not narrow.
         * `[ ]`   Condition: `projectOwnerUserId` is absent, or `isDialecticJobPayload(job.payload)` is false.
         * `[ ]`   Decision: the two existing checks, in order.
         * `[ ]`   Dependency call: the existing log lines, the existing notifications on the payload branch, and the existing `status: 'failed'` write.
         * `[ ]`   Outcome: return. Unchanged — the row was never claimed and neither failure can succeed on a retry.
      * `[ ]`   Branch: the row cannot be claimed.
         * `[ ]`   Condition: the conditional update returns an error or no row.
         * `[ ]`   Decision: `updateError || !updatedJob`.
         * `[ ]`   Dependency call: `deps.logger.info` only.
         * `[ ]`   Outcome: return silently. Unchanged.
      * `[ ]`   Branch: the job is dispatched and reports success.
         * `[ ]`   Condition: `processJob` returns its success arm.
         * `[ ]`   Decision: `isProcessJobErrorReturn(result)` is false.
         * `[ ]`   Dependency call: the `contribution_generation_started` notification, then `processJob({ processors: effectiveProcessors, ctx: deps }, { dbClient: adminClient }, { job: validatedJob })`.
         * `[ ]`   Outcome: return. No row write — whichever status the job now holds was written by the arm that owns it.
      * `[ ]`   Branch: the job reports a failure, or an exception escapes.
         * `[ ]`   Condition: `processJob` returns its error arm, or a throw reaches the `catch`.
         * `[ ]`   Decision: `isProcessJobErrorReturn(result)` is true; or `e instanceof Error` in the `catch`, which derives the same `Error`.
         * `[ ]`   Dependency call: `handleFailure(error)`, the one failure sequence both entries call.
         * `[ ]`   Outcome: whatever `handleFailure` reaches.
      * `[ ]`   Branch, inside `handleFailure`: the failure is insufficient funds.
         * `[ ]`   Condition: the message contains `Insufficient funds`.
         * `[ ]`   Decision: the existing `error.message.includes` test.
         * `[ ]`   Dependency call: `pauseJobsForNsf` with its five existing params, inside its existing `try`.
         * `[ ]`   Outcome: return. A paused job is neither retried nor failed. A throw from `pauseJobsForNsf` logs and falls through, unchanged.
      * `[ ]`   Branch, inside `handleFailure`: the row has attempts remaining.
         * `[ ]`   Condition: `job.attempt_count < job.max_retries`.
         * `[ ]`   Decision: that comparison, made here and nowhere else in the worker.
         * `[ ]`   Dependency call: the `ai_providers` select on `job.payload.model_id`; then `deps.retryJob({ dbClient: adminClient, job }, { failedAttempts: [{ modelId: job.payload.model_id, api_identifier: <row>.api_identifier, error: error.message }] })`.
         * `[ ]`   Outcome: `isRetryJobNotifiedReturn` → return. `isRetryJobNotificationFailedReturn` → log the carried `notificationError`, then return; the row was updated and the job must not also take the terminal path. The error arm, and a provider read that returned an error or no row, each fall through to the terminal branch below.
      * `[ ]`   Branch, inside `handleFailure`: the row has no attempts remaining, or the retry could not be scheduled.
         * `[ ]`   Condition: `job.attempt_count` is not below `job.max_retries`, or the retry branch fell through.
         * `[ ]`   Decision: the negated comparison, or the fall-through.
         * `[ ]`   Dependency call: the existing `contribution_generation_failed` notification, the existing `other_generation_failed` event, then the `status: 'failed'` write with its `completed_at` and `error_details`.
         * `[ ]`   Outcome: return. This is the only terminal write in the worker process.
      * `[ ]`   Ordering and side effects: at most one claim per invocation; at most one `processJob` call; at most one retry call; at most one terminal write, and never alongside a retry; the NSF branch precedes the retry branch and the retry branch precedes the terminal write.

   * `[ ]`   `index.test.ts`
      * `[ ]`   Every case calls `handleJob(adminClient, job, deps, testProcessors?)` without the `authToken` argument and restates its `Act` line to that call.
      * `[ ]`   Its parallel `PrepareModelJobParams` and `PrepareModelJobPayload` literals take the shapes `prepareModelJob`'s node declares — params carrying only `dbClient`, payload carrying `job`, `providerRow` and `promptConstructionPayload` — with the `getSortedCompressionCandidates` import deleted if no other construction in the file uses it.
      * `[ ]`   Its `prepareModelJobSpy` call-count assertion for the EXECUTE path is unchanged.
      * `[ ]`   New case: a `processJob` arranged to return its error arm on a row whose `attempt_count` is below `max_retries` reaches `deps.retryJob` exactly once, with `params.job` the claimed row and `payload.failedAttempts` a one-element array whose `api_identifier` is the value on the `ai_providers` row the case arranged, and writes no `status: 'failed'`.
      * `[ ]`   New case: the same failure on a row whose `attempt_count` equals `max_retries` calls `deps.retryJob` zero times and writes `status: 'failed'` with its two notifications. Arranged beside the case above so the comparison cannot be a constant.
      * `[ ]`   New case: `deps.retryJob` returning its error arm reaches the terminal write; returning the unnotified success flavor logs the carried error and does not; returning the notified flavor does neither. Arranged in one file so an assertion fails if any arm is collapsed into another.
      * `[ ]`   New case: an `ai_providers` read that returns an error reaches the terminal write and calls `deps.retryJob` zero times.
      * `[ ]`   New case: the provider read happens on the failure path only — a job that reports success queries `ai_providers` zero times.
      * `[ ]`   New case: a `processJob` returning its success arm writes no row and sends no failure notification.
      * `[ ]`   New case: `defaultProcessors` carries the five implementations themselves — each member is identical to the imported function, not a closure around it.
      * `[ ]`   New case: the params literal `createDialecticWorkerDeps` hands the factory carries none of `ragService`, `indexingService`, `embeddingClient`, `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent` or `debitTokens`, and carries each of the eleven added members.
      * `[ ]`   New case: `tokenizerDeps.getEncoding` throws on an unknown encoding name and returns an encoder for a known one, and `tokenizerDeps.countTokensAnthropic` is the real counter — the proof no placeholder tokenizer is supplied at this root.
      * `[ ]`   The existing NSF, validation, claim-failure and started-notification cases keep their arrangements and assertions.

   * `[ ]`   `index.nsf-pause.integration.test.ts`
      * `[ ]`   Its `handleJob` calls drop the `authToken` argument; every `pauseJobsForNsf` arrangement and assertion is unchanged, and a case asserts the NSF path still returns before the retry branch is reached.

   * `[ ]`   `index.ts`
      * `[ ]`   Deleted from `createDialecticWorkerDeps`: the `is_default_embedding` provider read and its throw, the `OPENAI_API_KEY` read and its throw, the `embeddingAdapter` construction and its throw, and the `embeddingClient`, `indexingService` and `ragService` constructions.
      * `[ ]`   `textSplitter` becomes `new LangchainTextSplitter()` imported from `_shared/utils/text_splitter.ts`; the `indexing_service.ts` import goes with the three constructions above, and the `rag_service.ts` import with `ragService`.
      * `[ ]`   Deleted: the `boundGatherArtifacts` closure, the `boundEnqueueModelCall` closure, and the `prepareModelJob` params closure with the `boundCompressPrompt` and `boundCalculateAffordability` closures inside it. The `BoundGatherArtifactsFn`, `BoundEnqueueModelCallFn`, `BoundCompressPromptFn` and `BoundCalculateAffordabilityFn` type imports go with them.
      * `[ ]`   The `createJobContext` params literal assigns `gatherArtifacts: gatherArtifacts`, `enqueueModelCall: enqueueModelCall` and `prepareModelJob: prepareModelJob` — the unbound implementations — and gains `compressPrompt`, `calculateAffordability`, `enqueueCompressJobs`, `getSortedCompressionCandidates`, `applyCompressionOverlay`, `textSplitter`, `constructStoragePath`, `tokenizerDeps`, `netlifyQueueUrl`, `netlifyApiKey` and `apiKeyForProvider`. It loses `ragService`, `indexingService`, `embeddingClient`, `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent` and `debitTokens`, and the seven imports that served the last seven.
      * `[ ]`   `tokenizerDeps` is constructed above the return as a `CountTokensDeps` literal carrying the guarded `getEncoding` closure, `countTokensAnthropic` and `logger`.
      * `[ ]`   The `retryJob` import moves from `./retryJob.ts` to `./retryJob/retryJob.ts`, and the files `dialectic-worker/retryJob.ts` and `dialectic-worker/retryJob.test.ts` are deleted.
      * `[ ]`   `defaultProcessors` becomes `{ processSimpleJob, processComplexJob, planComplexStage, processRenderJob, processCompressJob }`; all five adapter closures are deleted.
      * `[ ]`   `handleJob` drops its `authToken` parameter and the `serve` call site drops the argument; the `Authorization` header read and its 401 stay.
      * `[ ]`   `handleJob` gains a local `const handleFailure = async (error: Error): Promise<void> => { … }` declared above the `try`, holding the NSF branch, the retry branch and the terminal path, assembled from the statements the `catch` holds today plus the retry branch this node adds.
      * `[ ]`   The `processJob` call takes its three arguments, its result is narrowed with `isProcessJobErrorReturn`, and the error arm calls `await handleFailure(result.error)`. The `catch` derives its `Error` as it does today and calls `await handleFailure(error)`; every statement it held moves into that closure.
      * `[ ]`   Nothing else in the file changes: `serve`, the validation block, the claim, the started notification, the `validatedJob` construction, every surviving service construction and environment read, and every log line stand exactly as they are.

   * `[ ]`   `index.compression.integration.test.ts`
      * `[ ]`   The integrated chain is real end to end from the worker root: real `createDialecticWorkerDeps` → real `createJobContext` → real `handleJob` → real `processJob` → real `processSimpleJob` → real `gatherArtifacts` → real `applyCompressionOverlay` → real `prepareModelJob` → real `calculateAffordability` → real `compressPrompt` → real `getSortedCompressionCandidates` → real `enqueueCompressJobs`, and on the within-budget path real `prepareModelJob` → real `enqueueModelCall`. No repo-owned function in that chain is mocked, stubbed or replaced by a builder.
      * `[ ]`   Mocked at the outer boundary only: the Supabase client, the queue POST and the environment reads. Storage reads are served from the mocked client, so the suite proves nothing about the storage adapter itself.
      * `[ ]`   A case drives an oversized working set through the whole chain: COMPRESS rows are inserted with `parent_job_id` equal to the claimed job, the parent is left `waiting_for_children`, the queue receives no POST, and `handleJob` returns having written no terminal status.
      * `[ ]`   A case drives a within-budget working set through the same chain: the queue receives exactly one POST and the row is `queued`.
      * `[ ]`   A case drives an already-compressed working set: the overlay swaps the victim's content, the recount fits, and the call reaches the queue with no COMPRESS row inserted.
      * `[ ]`   A case drives a retriable failure through the chain on a row with attempts remaining: the row is left `retrying` with `attempt_count` advanced by one, and no terminal status is written.
      * `[ ]`   A case drives the same failure on a row with no attempts remaining: the row is `failed` and `deps.retryJob` was not reached.
      * `[ ]`   No case constructs a deps object for any worker module; every graph under test is the one `createJobContext` assembled from this root's params.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward and provides face outward: this file imports every implementation and raw collaborator the process needs and hands them to the factory; nothing in the worker imports this file.
      * `[ ]`   The RAG edges are severed here — after this node no live reference into `rag_service` or `indexing_service` remains anywhere in the worker, which is what lets those files be deleted in the following step without a further edit to this one.
      * `[ ]`   The legacy retry edge is severed here: `dialectic-worker/retryJob.ts` has no importer after this node and is deleted with its suite.
      * `[ ]`   No cycle: the factory, the dispatcher and every processor are imported by this file and import nothing from it.

   * `[ ]`   `requirements`
      * `[ ]`   `createDialecticWorkerDeps` constructs no deps object and no bound closure — proven by the compiler and by a unit case asserting each of `gatherArtifacts`, `enqueueModelCall` and `prepareModelJob` on the params literal is the imported implementation itself.
      * `[ ]`   The params literal carries every member `JobContextParams` declares and none it does not, with the eleven added members present and the ten retired members absent — unit test, exhaustive membership assertions.
      * `[ ]`   `tokenizerDeps` supplies the real tiktoken and Anthropic counters, and rejects an unknown encoding name — unit test.
      * `[ ]`   `textSplitter` implements the `ITextSplitter` that `_shared/utils/text_splitter.interface.ts` declares — proven by the compiler, the params literal being typed by `JobContextParams`.
      * `[ ]`   `defaultProcessors` carries the five implementations directly, each satisfying its own reshaped `Fn` type — proven by the compiler and by a unit identity assertion per member.
      * `[ ]`   `handleJob` narrows `processJob`'s return and writes no row on the success arm — unit test.
      * `[ ]`   A failure on a row with attempts remaining dispatches `retryJob` exactly once with a one-element `failedAttempts` array carrying the provider row's `api_identifier`, and writes no terminal status — unit test and integration test.
      * `[ ]`   A failure on a row with no attempts remaining writes `status: 'failed'` with its two notifications and dispatches no retry — unit test and integration test, arranged beside the case above.
      * `[ ]`   Each of the three `retryJob` arms reaches its own outcome, and a failed provider read reaches the terminal path — unit test.
      * `[ ]`   The `ai_providers` read happens on the failure path only — unit test, query-count assertion on a successful job.
      * `[ ]`   The NSF path returns before the retry branch — unit test and integration test.
      * `[ ]`   No live reference into `rag_service` or `indexing_service` remains in this file — proven by the compiler once those imports are deleted.
      * `[ ]`   The full compression chain runs from the worker root with only Supabase, the queue and the environment mocked — integration test.

## Remove RAG Machinery

Every live functional reference into the RAG core is severed; this closes it out by deleting it. No full nodes — deletions and reference cleanup only.

### DELETE (whole file)
* `[ ]`   `supabase/functions/_shared/services/rag_service.ts`
* `[ ]`   `supabase/functions/_shared/services/rag_service.interface.ts`
* `[ ]`   `supabase/functions/_shared/services/rag_service.mock.ts`
* `[ ]`   `supabase/functions/_shared/services/rag_service.test.ts`
* `[ ]`   `supabase/functions/_shared/services/indexing_service.ts`
* `[ ]`   `supabase/functions/_shared/services/indexing_service.interface.ts`
* `[ ]`   `supabase/functions/_shared/services/indexing_service.mock.ts`
* `[ ]`   `supabase/functions/_shared/services/indexing_service.test.ts`

### EDIT (remove dead `RagService`/`IndexingService`/`EmbeddingClient` construction, imports, and fields — `listCodeUsages` at implementation time to catch anything missed below)
* `[ ]`   `supabase/functions/dialectic-worker/createJobContext/JobContext.interface.ts` — remove the `IRagService`/`IIndexingService`/`IEmbeddingClient` import (`:7-9`) and the `ragService`/`indexingService`/`embeddingClient` fields from every interface that carries them (`:184-186`, `:222-223`, `:296-298`, `:335-337`).
* `[ ]`   `supabase/functions/dialectic-worker/createJobContext/JobContext.mock.ts` — remove the corresponding mock field construction.
* `[ ]`   `supabase/functions/dialectic-worker/createJobContext/JobContext.guard.test.ts` — remove assertions on the deleted fields.
* `[ ]`   `supabase/functions/dialectic-worker/createJobContext/createJobContext.interface.test.ts` — remove fixture fields/stubs for the deleted interface members.
* `[ ]`   `supabase/functions/dialectic-service/dialectic.interface.ts` — remove the `IEmbeddingClient`/`IIndexingService` import (`:10-12`) and the `indexingService`/`embeddingClient` fields (`:1791-1792`).
* `[ ]`   `supabase/functions/_shared/utils/errors.ts` — remove the now-dead `RagServiceError` class (`:16-19`).
* `[ ]`   `supabase/functions/dialectic-worker/index.test.ts` — remove any fixture/mock construction of the deleted services.
* `[ ]`   `supabase/functions/dialectic-worker/processComplexJob.happy.test.ts`, `processComplexJob.errors.test.ts`, `processComplexJob.parallel.test.ts` — remove `ragService`/`embeddingClient`/`indexingService` from any `IJobContext`-shaped fixture they construct.
* `[ ]`   `supabase/functions/dialectic-worker/ARCHITECTURE.md`, `supabase/functions/dialectic-worker/dialectic-worker.md` — remove or update prose referencing the RAG compression path.
* `[ ]`   Every test file already rewritten by an earlier WS-D node (`compressPrompt.test.ts`/`.integration.test.ts`, `calculateAffordability.integration.test.ts`, `prepareModelJob.test.ts`/`.integration.test.ts`, `vector_utils.test.ts`, `dialectic.interface.ts`'s `compressPrompt.interface.ts`/`.mock.ts`) is NOT touched again here — those nodes already removed their own `ragService`/`embeddingClient`/`IEmbeddingClient` references; re-verify only, do not re-edit.

### Migration
* `[ ]`   New migration `supabase/migrations/<ts>_compression_jobs_remove_rag.sql` — the epic's REMOVE migration (paired with the WS-0 ADD migration; exactly two migrations for the whole epic):
  ```sql
  drop function if exists public.match_dialectic_chunks(vector, double precision, integer, uuid);
  drop table if exists public.dialectic_memory;
  ```
  (confirm the exact `match_dialectic_chunks` argument signature against its defining migration before writing the `drop function` line — Postgres requires the exact signature to resolve overloads).
* `[ ]`   Regenerate `supabase/functions/types_db.ts` — by this point in the sprint nothing references `dialectic_memory` or `match_dialectic_chunks` (WS-D's `vector_utils.ts` node already deleted the last live query against `dialectic_memory`), so the regeneration is a pure drop with no compile fallout.

### Commit
* `[ ]`   **Commit** `feat(dialectic): job-driven schema-targeted compression replaces synchronous RAG`
  * Structural: `COMPRESS` job type + compression prompt template (WS-0); `CompressedContext` artifact identity + path support (WS-C); COMPRESS routing, spawn, and dedup machinery (WS-R); renderer module extraction, relocation and RENDER dispatch (WS-B, WS-N); compression source identity (WS-I); COMPRESS continuation and prompt provenance (WS-P); one job-payload base and one model-call dispatcher (WS-J); `saveResponse` decomposed with COMPRESS persistence (WS-S); compression orchestration cutover in `gatherArtifacts`/`compressPrompt`/`calculateAffordability`/`prepareModelJob`/`processSimpleJob` (WS-D); `rag_service`/`indexing_service`/`dialectic_memory`/`match_dialectic_chunks` deleted (WS-X).
  * Behavioral: oversized model-call inputs compress incrementally via job-driven COMPRESS children instead of a synchronous embedding-based RAG call; compressed artifacts persist with real wallet attribution and are reused across sibling jobs targeting the same schema; no synchronous model or embedding call remains anywhere in Supabase.
  * Contract: `ResourceDocument.type`/`CompressionSourceType`/`CompressionMode` govern all compression-artifact identity; `CalculateAffordabilityReturn`/`PrepareModelJobReturn` each gained a `Pending` variant that propagates a paused job cleanly to `processSimpleJob`.

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