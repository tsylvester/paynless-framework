[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 

# Work Breakdown Structure

* **Embedding Jobs Implementation** 

## WS-0 — FOUNDATION: schema + shared contracts

* `[ ]`   supabase/migrations/`<ts>_embedding_jobs_schema_foundation.sql` **[DB] Establish the embedding-jobs schema foundation: add the EMBED job type and promote dialectic_memory to a first-class, attributable, polymorphically-sourced artifact store**

  * `[ ]`   `objective`
    * `[ ]`   Solve two foundational schema defects that block job-driven embedding: (a) there is no `EMBED` job type to route embedding work, and (b) `dialectic_memory` cannot record valid attribution or a non-contribution source, which breaks economics, RLS, ownership, and provenance.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `EMBED` to `public.dialectic_job_type_enum`.
      * `[ ]`   Add real attribution to `dialectic_memory`: `user_id` (FK `auth.users`) and `wallet_id` (FK `public.token_wallets`).
      * `[ ]`   Replace contribution-only `source_contribution_id` with a polymorphic reference (`source_type` + `source_id`) spanning `dialectic_contributions`, `dialectic_project_resources`, and `dialectic_feedback`.
      * `[ ]`   Extend `match_dialectic_chunks` RPC to return `source_type`/`source_id` so retrieval can link a chunk back to its originating row type.
      * `[ ]`   Regenerate `supabase/functions/types_db.ts` as the single schema-truth source.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   Preserve the existing vector dimension `extensions.vector(3072)` (dimension is formalized in provider config in a separate node, not changed here).
      * `[ ]`   Preserve the existing hybrid FTS + vector RRF ranking behavior of `match_dialectic_chunks`.
      * `[ ]`   New attribution/source columns are `NOT NULL` so no junk/nullable attribution can be written.
      * `[ ]`   All schema changes occur in this single migration (one pass, no follow-up schema migration for WS-0).

  * `[ ]`   `role`
    * `[ ]`   Infrastructure / persistence-schema node. It defines the routing enum and the storage contract that every downstream embedding node (worker routing, saveResponse, indexing/rag restructure, retrieval) depends on.
    * `[ ]`   Out of scope (each its own node): the embedding-dimension config object + accessor; the `DialecticEmbeddingJobPayload` type + guard; the `CompressionCandidate` union; any application code.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `public.dialectic_job_type_enum`, `public.dialectic_memory` table, and `public.match_dialectic_chunks` RPC only.
    * `[ ]`   Inside boundary: the enum value set, memory row shape, attribution FKs, polymorphic source columns, dedup index, RPC return shape.
    * `[ ]`   Outside boundary: job routing code, payload types, service logic, provider config.

  * `[ ]`   `deps`
    * `[ ]`   `auth.users` (existing) — provider of `user_id` FK target. Direction allowed: schema→auth is standard for ownership.
    * `[ ]`   `public.token_wallets` (existing; PK `wallet_id`, nullable `user_id`→user_profiles) — provider of `wallet_id` FK target for economics.
    * `[ ]`   `public.dialectic_sessions` (existing) — unchanged `session_id` FK.
    * `[ ]`   `dialectic_contributions` / `dialectic_project_resources` / `dialectic_feedback` — logical targets of the polymorphic `source_id`; enforced by the `source_type` enum + application layer, NOT by a single FK (polymorphic association pattern).
    * `[ ]`   `public.dialectic_job_type_enum` (existing type) — extended in place.
    * `[ ]`   Confirm: no reverse dependency (no table depends on dialectic_memory), no lateral violation.

  * `[ ]`   `construction`
    * `[ ]`   Statement order inside the single migration:
      * `[ ]`   `alter type public.dialectic_job_type_enum add value if not exists 'EMBED';` (value added, NOT used in this migration).
      * `[ ]`   `create type public.dialectic_memory_source_type_enum as enum ('dialectic_contribution','dialectic_project_resource','dialectic_feedback','rag_query');` (brand-new type; safe to create and consume in the same migration — the same-transaction restriction only applies to ADD VALUE on a pre-existing type). `'rag_query'` is required by Phase B of the WS-D compression state machine: query texts are EMBED-jobbed with `source_type='rag_query'` so query embeddings are stored in `dialectic_memory` under a distinct source type and can be retrieved deterministically on Phase C resume by `source_id` (a deterministic UUID derived from query text + session_id + stage_slug).
      * `[ ]`   `alter table public.dialectic_memory add column user_id uuid not null references auth.users(id) on delete cascade;`
      * `[ ]`   `alter table public.dialectic_memory add column wallet_id uuid not null references public.token_wallets(wallet_id) on delete restrict;`
      * `[ ]`   `alter table public.dialectic_memory add column source_type public.dialectic_memory_source_type_enum not null;`
      * `[ ]`   `alter table public.dialectic_memory add column source_id uuid not null;`
      * `[ ]`   `alter table public.dialectic_memory drop column source_contribution_id;` (removes the narrow contribution-only column and its FK `dialectic_memory_source_contribution_id_fkey`).
      * `[ ]`   `create index dialectic_memory_source_idx on public.dialectic_memory (session_id, source_type, source_id);` (dedup / "already embedded?" lookup).
    * `[ ]`   No partially-migrated state: all statements in one migration transaction (safe — the migration adds but does not use the new enum value).

  * `[ ]`   `[migration].sql` (implementation = the SQL body)
    * `[ ]`   Perform the enum add + column/constraint/index changes above.
    * `[ ]`   Recreate `public.match_dialectic_chunks(query_embedding extensions.vector(3072), query_text, match_threshold, match_count, session_id_filter, rrf_k)`:
      * `[ ]`   FIRST `drop function if exists public.match_dialectic_chunks(extensions.vector, text, double precision, integer, uuid, integer);` — REQUIRED: adding columns to `returns table (...)` changes the function's return type, and Postgres rejects that under `create or replace function` ("cannot change return type of existing function; use DROP FUNCTION first"). Drop-by-signature (defaults omitted; `float`→`double precision`, `int`→`integer`, `vector(3072)`→`extensions.vector`) then create is the only valid path.
      * `[ ]`   Then `create function public.match_dialectic_chunks(...)` preserving the existing `vector_results` / `keyword_results` / `combined_results` / `ranked_results` RRF CTE pipeline verbatim.
      * `[ ]`   Extend `returns table (...)` with `source_type public.dialectic_memory_source_type_enum, source_id uuid`.
      * `[ ]`   Extend the final projection (which joins `ranked_results rr` to `dialectic_memory dm`) to also select `dm.source_type, dm.source_id`.
    * `[ ]`   Preserve the existing RLS read policy (session→project→user) and service-role write model unchanged.
    * `[ ]`   Regenerate `supabase/functions/types_db.ts` (generated file, exempt from tests):
      * `[ ]`   `Enums.dialectic_job_type_enum` gains `"EMBED"` in both the union type and the runtime const array.
      * `[ ]`   `Enums` gains a new `dialectic_memory_source_type_enum` = `"dialectic_contribution" | "dialectic_project_resource" | "dialectic_feedback" | "rag_query"` (union + runtime const array).
      * `[ ]`   `dialectic_memory` Row/Insert/Update gain `user_id`, `wallet_id`, `source_id` (uuid) and `source_type` (typed as the new enum union); lose `source_contribution_id`.
      * `[ ]`   `dialectic_memory` Relationships lose the contribution FK, gain user/wallet FKs.
      * `[ ]`   `match_dialectic_chunks` Returns type gains `source_type` (enum union)/`source_id`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: infrastructure/persistence (lowest producer). deps are inward (auth/wallets/sessions/enum); provides outward (schema truth consumed by app nodes).
    * `[ ]`   No cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `dialectic_job_type_enum` includes `EMBED` (union + const array in types_db).
    * `[ ]`   `dialectic_memory` has NOT NULL `user_id`, `wallet_id`, `source_type`, `source_id`; `source_contribution_id` no longer exists.
    * `[ ]`   `source_type` is a Postgres enum (`dialectic_memory_source_type_enum`) that rejects any value outside the four allowed values (`dialectic_contribution`, `dialectic_project_resource`, `dialectic_feedback`, `rag_query`); it surfaces as a generated union type in types_db.
    * `[ ]`   `match_dialectic_chunks` returns `source_type`/`source_id` alongside existing columns and preserves RRF ordering; the migration DROPs the old function before recreating it (return-type change).
    * `[ ]`   `types_db.ts` regenerated to match the new `DialecticMemoryRow` shape and both enums. This regeneration alone leaves `indexing_service.ts` non-compiling (it still writes the dropped `source_contribution_id` and omits the new NOT NULL columns); compilation is restored by the `indexing_service.ts` node that runs IMMEDIATELY AFTER this migration within WS-0, before any commit.

* `[ ]`   supabase/functions/sync-ai-models/`openai_sync.ts` **[BE] Carry the embedding model's output dimensionality (`dimensions`) through the default embedding provider's assembled config so vector storage/retrieval read it from provider config instead of a hardcoded 3072**

  * `[ ]`   `objective`
    * `[ ]`   Solve the "magic number" defect: the embedding output dimension (3072 for `text-embedding-3-large`) is hardcoded in `indexing_service.ts`/`rag_service.ts`, and the provider config that flows to `ai_providers.config` does not carry the model's dimensionality — so there is no config-driven source of truth for those consumers to read.
    * `[ ]`   Functional goals:
      * `[ ]`   `INTERNAL_MODEL_MAP['openai-text-embedding-3-large']` carries `dimensions: 3072`.
      * `[ ]`   `AiModelExtendedConfig` carries an optional `dimensions?: number | null`.
      * `[ ]`   `AiModelExtendedConfigSchema.parse(...)` PRESERVES `dimensions` instead of stripping it.
      * `[ ]`   The assembled `ai_providers.config` for the default embedding model contains `dimensions: 3072`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   NO change to `config_assembler.ts` logic (it is a generic spread-merge; the only cause of loss is the zod strip, fixed at the schema).
      * `[ ]`   Do not alter existing cost/context fields on any map entry.
      * `[ ]`   Non-embedding models are unaffected (`dimensions` absent/undefined).

  * `[ ]`   `role`
    * `[ ]`   Adapter / config-provider node (sync-ai-models). It declares OpenAI model capability metadata that `config_assembler` merges into `ai_providers.config`.
    * `[ ]`   Appropriate because this is the single place OpenAI model capabilities are authored; dimensionality is a model capability.
    * `[ ]`   Out of scope (each its own node/context): CONSUMING `dimensions` (indexing_service/rag_service); `google_sync.ts`/`anthropic_sync.ts` maps; the pgvector column dimension (migration node); `config_assembler.ts` merge logic.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: the OpenAI capability map (`modelMapSource`/`INTERNAL_MODEL_MAP`) plus the shared config contract that transports it (`AiModelExtendedConfig`, `AiModelExtendedConfigSchema`).
    * `[ ]`   Inside boundary: the `dimensions` field on the contract, its zod validation, and its value for `text-embedding-3-large`.
    * `[ ]`   Outside boundary: how `dimensions` is consumed, other providers' maps, DB column shape.

  * `[ ]`   `deps`
    * `[ ]`   `supabase/functions/_shared/types.ts` `AiModelExtendedConfig` (shared-contract layer) — extended to carry `dimensions`; depending inward on shared types is standard.
    * `[ ]`   `supabase/functions/chat/zodSchema.ts` `AiModelExtendedConfigSchema` (validator layer) — must accept + preserve `dimensions`; it is the runtime boundary consumed by `config_assembler`.
    * `[ ]`   `supabase/functions/sync-ai-models/config_assembler.ts` (consumer, NOT edited) — calls `AiModelExtendedConfigSchema.parse(mergedConfig)` at ~L90; this is the evidence the plain `z.object` strips unknown keys.
    * `[ ]`   Confirm: no reverse dependency (shared types/schema do not import openai_sync); no lateral violation (openai_sync → shared, lower layer).

  * `[ ]`   `context_slice`
    * `[ ]`   From `types.ts`: only the `AiModelExtendedConfig` shape (add one optional field) — nothing else imported.
    * `[ ]`   From `zodSchema.ts`: only the `AiModelExtendedConfigSchema` object (add one optional field).
    * `[ ]`   No over-fetch / hidden coupling: `config_assembler.ts` untouched; no new imports added to `openai_sync.ts`.

  * `[ ]`   `_shared/types.ts` (structural boundary — the type edits here; types are exempt from RED/GREEN)
    * `[ ]`   Add `dimensions?: number | null;` to `AiModelExtendedConfig` (interface at ~L457), grouped with the capability fields (adjacent to `context_window_tokens`). Optional + nullable to mirror DB-config nullability and the absence on non-embedding models.
    * `[ ]`   No other change to the interface.

  * `[ ]`   `chat/zodSchema.ts` + `zodSchema.test.ts` (enforcement — runtime boundary; guard test before guard)
    * `[ ]`   `zodSchema.test.ts` (guard test): a config containing `dimensions: 3072` parses AND the parsed result RETAINS `dimensions` (locks the anti-strip requirement); a non-integer or non-positive `dimensions` is REJECTED; absence of `dimensions` still parses (optional). No false positives/negatives.
    * `[ ]`   `chat/zodSchema.ts` (guard): add `dimensions: z.number().int().positive().optional()` to `AiModelExtendedConfigSchema` (~L21) so `.parse()` preserves the key. Without this, the plain `z.object` (verified) drops `dimensions` at `config_assembler.ts:90`.

  * `[ ]`   `openai_sync.test.ts` + `config_assembler.test.ts` (behavioral verification)
    * `[ ]`   `openai_sync.test.ts`: assert `INTERNAL_MODEL_MAP.get('openai-text-embedding-3-large')?.dimensions === 3072` (the map builder returns entries keyed by the ORIGINAL prefixed key — `return [key, ...]` at ~L186, so the key keeps its `openai-` prefix); assert a non-embedding entry has no `dimensions`.
    * `[ ]`   `config_assembler.test.ts`: assembling the default embedding model yields a config whose `dimensions === 3072` SURVIVES `AiModelExtendedConfigSchema.parse` (end-to-end proof the strip is fixed).
    * `[ ]`   Do NOT re-test: zod shape internals or guard correctness (covered in `zodSchema.test.ts`); the full map contents.

  * `[ ]`   `construction`
    * `[ ]`   `INTERNAL_MODEL_MAP` is a module-level `Map<string, Partial<AiModelExtendedConfig>>` built once from `modelMapSource` via `Object.entries(...).map(([key, value]) => [key, { ...value, ...providerMaxTokens, tokenization_strategy }])` (~L167–187). No constructor.
    * `[ ]`   `dimensions` is added declaratively to the `modelMapSource` object literal, so it flows through the existing spread (`...value`) into the map with no builder change; no partially-constructed state (static literal).

  * `[ ]`   `openai_sync.ts` (implementation)
    * `[ ]`   Edit ~L163: `'openai-text-embedding-3-large': { context_window_tokens: 8191, input_token_cost_rate: 0.13, output_token_cost_rate: 1.0, dimensions: 3072 },`.
    * `[ ]`   No change to the `INTERNAL_MODEL_MAP` builder, `selectOpenAIEncoding`, `providerMaxTokens`, or any other map entry.
    * `[ ]`   Each requirement maps to a single edit: field literal (map), interface field (types.ts), schema field (zodSchema.ts).

  * `[ ]`   `directionality`
    * `[ ]`   Layer: adapter/config-provider. deps are inward (shared `AiModelExtendedConfig` + validator); provides are outward (config metadata → `config_assembler` → `ai_providers.config`).
    * `[ ]`   No cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `AiModelExtendedConfig` exposes optional `dimensions?: number | null`.
    * `[ ]`   `AiModelExtendedConfigSchema.parse({ ..., dimensions: 3072 })` returns an object with `dimensions === 3072` (not stripped); rejects non-integer/non-positive `dimensions`; accepts its absence.
    * `[ ]`   `INTERNAL_MODEL_MAP.get('openai-text-embedding-3-large')?.dimensions === 3072`.
    * `[ ]`   Assembling the default embedding provider yields `ai_providers.config.dimensions === 3072` (proven by `config_assembler.test.ts`).
    * `[ ]`   `config_assembler.ts` is unchanged.
    * `[ ]`   No commit step in this node — WS-0 is not independently consumer-testable; commit lands in the last node of the first working end-to-end slice.

* `[ ]`   supabase/functions/_shared/services/`rag_service.ts` **[BE] Convert RagService to a retrieval-only service: remove synchronous just-in-time indexing, derive the query-embedding dimension from provider config, and consume the polymorphic source columns returned by the updated match_dialectic_chunks RPC**

  * `[ ]`   `objective`
    * `[ ]`   Solve three defects introduced or exposed by the WS-0 migration: (a) `ensureDocumentsAreIndexed` queries the dropped `source_contribution_id` column, breaking compilation; (b) the dimension guard hardcodes `3072` instead of reading from the provider config added in the previous node; (c) the context assembler reads `metadata.source_contribution_id` to label retrieved chunks, but `match_dialectic_chunks` now returns `source_type`/`source_id` as proper first-class columns.
    * `[ ]`   Functional goals:
      * `[ ]`   Remove `ensureDocumentsAreIndexed` and the `_retry` helper that exclusively served it; `getContextForModel` goes directly to retrieval.
      * `[ ]`   Remove `indexingService: IIndexingService` from `IRagServiceDependencies`; rag_service has no indexing responsibility.
      * `[ ]`   Thread `modelConfig.dimensions` (from `AiModelExtendedConfig`, added in node 2) through to the query-embedding dimension guard, replacing the hardcoded constant.
      * `[ ]`   Update `allChunks` accumulation and `CandidateChunk` type to carry `source_type`/`source_id` from the RPC result; replace `metadata.source_contribution_id` in the context assembler label with those columns.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `IRagService.getContextForModel` public signature is unchanged — callers are not updated in this node.
      * `[ ]`   `LangchainTextSplitter` and `EmbeddingClient` remain in `indexing_service.ts`; `IEmbeddingClient` import is retained.
      * `[ ]`   The MMR re-ranking pipeline (`performMmrSelection`), multi-query strategy, and token-wallet debit for query embeddings are unchanged.

  * `[ ]`   `role`
    * `[ ]`   Application-layer retrieval service (`_shared/services`). After this node its single responsibility is: embed query strings, retrieve relevant chunks from `dialectic_memory` via the RPC, re-rank with MMR, assemble context text.
    * `[ ]`   Appropriate because rag_service is the highest-level consumer of `dialectic_memory` retrieval and the sole assembler of compression context.
    * `[ ]`   Out of scope (own nodes): calling `indexingService.insertChunk` (WS-B `saveResponse`); EMBED job creation (WS-S); `indexing_service.ts` reshape (node 4); `compressPrompt` orchestration (WS-C/D).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `rag_service.ts`, `rag_service.interface.ts`, `rag_service.test.ts`.
    * `[ ]`   Inside boundary: multi-query strategy, MMR selection, RPC invocation, `IRagServiceDependencies` contract.
    * `[ ]`   Outside boundary: how/when chunks are written to `dialectic_memory` (WS-S/WS-B); compression decision logic (WS-C/D); `IIndexingService.insertChunk` contract (node 4); `match_dialectic_chunks` SQL body (node 1).

  * `[ ]`   `deps`
    * `[ ]`   `SupabaseClient<Database>` (inward, external package) — RPC call + `dialectic_memory.select('id, embedding')` for MMR candidate re-fetch; unchanged.
    * `[ ]`   `IEmbeddingClient` (inward, `indexing_service.interface.ts`) — generates query embeddings; `getEmbedding` gains `embeddingModelApiIdentifier: string` as 2nd param in this node (type change here as first/only consumer after the WS-0 reshape removed embedding calls from `IndexingService`).
    * `[ ]`   `AiModelExtendedConfig` (inward, `_shared/types.ts`) — carries `dimensions?: number | null` after node 2; consumed for the query-embedding dimension guard.
    * `[ ]`   `IAdminTokenWalletService?` (inward, optional) — token debits for query embeddings; unchanged.
    * `[ ]`   `ILogger` (inward) — unchanged.
    * `[ ]`   **REMOVED dep**: `IIndexingService` (previously inward, `indexing_service.interface.ts`) — rag_service no longer indexes documents; this dep and its import are removed from both the interface and the constructor.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `context_slice`
    * `[ ]`   From `AiModelExtendedConfig`: `dimensions?: number | null` (added in node 2) and `api_identifier: string` — `modelConfig.api_identifier` IS the `embeddingModelApiIdentifier` passed to `getEmbedding`; no redundant 6th param on `getContextForModel` is needed.
    * `[ ]`   From `SupabaseClient`: `.from('dialectic_memory').select('id, embedding')` (unchanged); `.rpc('match_dialectic_chunks', ...)` typed result now includes `source_type`/`source_id`.
    * `[ ]`   `IIndexingService` import removed entirely from this boundary.

  * `[ ]`   `rag_service.interface.ts` (structural boundary — type edit with first consumer)
    * `[ ]`   Remove `indexingService: IIndexingService` field from `IRagServiceDependencies`.
    * `[ ]`   Change the import line `import { IEmbeddingClient, IIndexingService } from './indexing_service.interface.ts';` to `import { IEmbeddingClient } from './indexing_service.interface.ts';` (retain `IEmbeddingClient`; remove `IIndexingService`).
    * `[ ]`   `IRagService.getContextForModel` signature unchanged (all 5 params; return type unchanged).
    * `[ ]`   `IRagSourceDocument` and `IRagContextResult` unchanged.

  * `[ ]`   `indexing_service.interface.ts` (IEmbeddingClient contract — type edits with rag_service as first/only consumer of the updated signature)
    * `[ ]`   Change `getEmbedding(text: string): Promise<EmbeddingResponse>` to `getEmbedding(text: string, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>` in `IEmbeddingClient`.
    * `[ ]`   No other changes to this file in this node (`InsertChunkAttribution`/`InsertChunkResult`/`IIndexingService.insertChunk` additions  with the `indexing_service.ts` node).

  * `[ ]`   `rag_service.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Remove** the entire `describe('Just-in-Time Indexing', ...)` block (2 tests): these test `ensureDocumentsAreIndexed` logic that is fully removed.
    * `[ ]`   **Remove** the entire `describe('Resiliency and Retries', ...)` block (4 tests): all four tests exercise the `_retry` wrapper around the DB query and `indexDocument` calls inside `ensureDocumentsAreIndexed` — both are removed.
    * `[ ]`   **Remove** `describe('Financial Tracking', ...)` (1 test): "should return the total tokens used for indexing new documents" tests `tokensUsedForIndexing` from `indexDocument` stubs — no longer relevant.
    * `[ ]`   **Remove** from the top-level describe block: `let mockIndexingService: IIndexingService;`, `let indexDocumentStub: Stub | undefined;`, the `indexDocumentStub?.restore()` line in `afterEach`, and all `spy(deps.indexingService, 'indexDocument')` / `stub(deps.indexingService, 'indexDocument', ...)` usage. Remove `IIndexingService` import from the test file.
    * `[ ]`   **Update** `initializeService` helper: remove `indexingService: mockIndexingService` from the `deps` object literal; remove the `mockIndexingService = { indexDocument: ... }` assignment.
    * `[ ]`   **Update** `mockModelConfig` in the top-level `describe('RagService', ...)` block to include `dimensions: 3072` (the dimension guard now reads from config; all existing retrieval tests must pass a config that declares the expected dimension).
    * `[ ]`   **Add** test in `describe('Advanced Retrieval', ...)`: "dimension guard reads modelConfig.dimensions — passes when embedding length matches, fails when it does not". Two assertions in one test: (1) construct service with a `WrongDimEmbeddingClient` returning 16-element arrays and pass `mockModelConfig` with `dimensions: 16` → `result.error` is `undefined`; (2) same client (16-element) but `dimensions: 32` in modelConfig → `result.error instanceof RagServiceError` and `rpcSpy.calls.length === 0`. This pair proves the guard reads from config rather than a hardcoded constant.
    * `[ ]`   **Update** the "should generate multiple queries, call embedding client for each, call RPC, and assemble a final context" test: add `source_type: 'dialectic_contribution'` and `source_id: 'src-id-1'` (or any UUID) to each entry in `mockRpcResponse`; assert the assembled `result.context` includes a label containing those values (e.g., `dialectic_contribution:src-id-1`) rather than `metadata.source_contribution_id`.
    * `[ ]`   **Update** standalone `Deno.test("RagService issues RPC with 3072-d query embedding...")`: remove `indexingService` from the `deps` object; remove `indexDocumentSpy` and its call-count assertions; remove `res.tokensUsedForIndexing === 10` assertion; add `dimensions: 3072` to the model config argument in the `.getContextForModel(...)` call. The core assertion — RPC receives a 3072-element query embedding — is preserved unchanged.
    * `[ ]`   **Update** standalone `Deno.test("RagService guard: rejects when query embedding dim != 3072...")`: rename to "RagService guard: rejects when query embedding dim does not match modelConfig.dimensions"; remove `indexingService` from the `deps` object; keep `WrongDimEmbeddingClient` returning 32-element arrays; pass `dimensions: 64` in the model config argument (32 ≠ 64 → guard fires); assertions unchanged (`result.error instanceof Error`, `rpcSpy.calls.length === 0`).
    * `[ ]`   **Update** `WrongDimEmbeddingClient` class definition in both standalone `Deno.test` blocks: change `async getEmbedding(text: string)` to `async getEmbedding(text: string, _embeddingModelApiIdentifier: string)` to satisfy the updated `IEmbeddingClient` interface. Body unchanged.
    * `[ ]`   **Update** any inline `IEmbeddingClient` object literals in test helpers: arrow functions typed as `getEmbedding: async (text) => ...` become `getEmbedding: async (text, _embeddingModelApiIdentifier) => ...`; the `new EmbeddingClient(dummyAdapter)` construction in `initializeService` does NOT need change (class is updated in the `indexing_service.ts` node).
    * `[ ]`   Do NOT re-test: `isDialecticChunkMetadata` guard correctness; `cosineSimilarity` math; `LangchainTextSplitter` or `EmbeddingClient` behavior (own nodes).

  * `[ ]`   `construction`
    * `[ ]`   `RagService` constructor signature unchanged; `IRagServiceDependencies` no longer carries `indexingService` — no partially-constructed instances possible with the reduced dep set.
    * `[ ]`   `performAdvancedRetrieval` gains two additional parameters threaded from `getContextForModel`: `dimensions: number` and `embeddingModelApiIdentifier: string`. Guards remain at the `getContextForModel` call site: if `modelConfig.dimensions` is `null` or `undefined`, throw `new RagServiceError('modelConfig.dimensions is required for query embedding dimension validation')` before calling `performAdvancedRetrieval`. `embeddingModelApiIdentifier` is sourced from `modelConfig.api_identifier`.

  * `[ ]`   `rag_service.ts` (implementation)
    * `[ ]`   Remove `import { isDialecticChunkMetadata } from '../utils/type_guards.ts';` (no longer used after the assembler change below).
    * `[ ]`   Remove the `_retry<T>` helper method and the `ensureDocumentsAreIndexed` method in their entirety.
    * `[ ]`   Rename `_modelConfig` parameter to `modelConfig` in `getContextForModel`; guard `modelConfig.dimensions` (throw `RagServiceError` if null/undefined); call `performAdvancedRetrieval(sessionId, stageSlug, modelConfig.dimensions, modelConfig.api_identifier)` directly.
    * `[ ]`   Remove the `indexingResult` block (call + success-check + early-return) from `getContextForModel`; remove `tokensUsedForIndexing` from the return value.
    * `[ ]`   `performAdvancedRetrieval(sessionId, stageSlug, dimensions: number, embeddingModelApiIdentifier: string)`: replace `primaryQueryEmbedding.length !== 3072` with `primaryQueryEmbedding.length !== dimensions`.
    * `[ ]`   All three `this.deps.embeddingClient.getEmbedding(queryText)` calls in `performAdvancedRetrieval` become `this.deps.embeddingClient.getEmbedding(queryText, embeddingModelApiIdentifier)`.
    * `[ ]`   Update query debit idempotency keys: `rag:query:${sessionId}:${stageSlug}:${qi + 1}` → `` `rag:query:${sessionId}:${stageSlug}:${embeddingModelApiIdentifier}:${qi + 1}` `` in both the primary-query debit and the per-query-loop debit.
    * `[ ]`   Update `allChunks` Map value type to include `source_type: string; source_id: string`. In the RPC result iteration: `allChunks.set(chunk.id, { content: chunk.content, metadata: chunk.metadata, rank: chunk.rank, source_type: chunk.source_type, source_id: chunk.source_id })`.
    * `[ ]`   Update `CandidateChunk` local type: add `source_type: string; source_id: string`.
    * `[ ]`   Update `isCandidateChunk` guard: add `typeof item.source_type === 'string' && typeof item.source_id === 'string'` to the conjunction.
    * `[ ]`   In the final context assembler loop: replace `const sourceId = isDialecticChunkMetadata(metadata) ? metadata.source_contribution_id : 'Unknown';` with `const sourceRef = \`${chunk.source_type}:${chunk.source_id}\`;` and update the label to `retrievedContext += \`[Context Snippet ${index + 1} | Source: ${sourceRef}]\n\`;`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: application service (`_shared/services`). Deps are inward (shared types, DB client, embedding client, wallet service); provides outward (context string to `compressPrompt` / WS-D callers).
    * `[ ]`   `IIndexingService` dep removed — dependency graph simplified by one edge.
    * `[ ]`   No cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `IRagServiceDependencies` no longer declares `indexingService`; constructing `RagService` without it compiles.
    * `[ ]`   `getContextForModel` called with `modelConfig.dimensions: null` returns `result.error instanceof RagServiceError` before any embedding call.
    * `[ ]`   `getContextForModel` called with `modelConfig.dimensions: 16` and a client returning 16-element arrays: `result.error === undefined`.
    * `[ ]`   `getContextForModel` called with `modelConfig.dimensions: 32` and a client returning 16-element arrays: `result.error instanceof RagServiceError`; RPC never called.
    * `[ ]`   `getContextForModel` does not call any method named `indexDocument` (no such dep exists on `IRagServiceDependencies`).
    * `[ ]`   Assembled context string contains a label derived from `source_type` and `source_id` from the RPC result (not `metadata.source_contribution_id`).
    * `[ ]`   `tokensUsedForIndexing` is `undefined` in the returned `IRagContextResult`.
    * `[ ]`   `IEmbeddingClient.getEmbedding` requires `embeddingModelApiIdentifier: string` as its 2nd param; all `IEmbeddingClient` implementations in the test file conform.
    * `[ ]`   All `embeddingClient.getEmbedding` calls in `rag_service.ts` pass `modelConfig.api_identifier` as the 2nd arg (via `embeddingModelApiIdentifier` threaded into `performAdvancedRetrieval`).
    * `[ ]`   Query embedding debit idempotency keys include `embeddingModelApiIdentifier` as a segment.
    * `[ ]`   No commit step in this node — WS-0 is not independently consumer-testable; commit lands in the last node of the first working end-to-end slice.

* `[ ]`   supabase/functions/_shared/services/`indexing_service.ts` **[BE] Reshape IndexingService from a synchronous chunk-embed-insert pipeline to a single-chunk insert service with real attribution: rename `indexDocument` → `insertChunk`, receive a pre-computed vector + real attribution as inputs, remove the embedded LLM call and text-splitting from the class**

  * `[ ]`   `objective`
    * `[ ]`   Solve the compilation break introduced by the WS-0 migration: `indexDocument` writes `source_contribution_id` (dropped column) and omits the NOT NULL columns `user_id`, `wallet_id`, `source_type`, `source_id`. The fix is a correct reshape, not demolition: IndexingService keeps its ownership of `dialectic_memory` persistence; what changes is the method signature so callers supply pre-computed attribution rather than junk constants.
    * `[ ]`   Functional goals:
      * `[ ]`   Replace `indexDocument(sessionId, sourceContributionId, documentContent, metadata)` with `insertChunk(chunkText, embeddingVector, dimensions, attribution)` where `attribution: InsertChunkAttribution` carries real `user_id`, `wallet_id`, `source_type`, `source_id`, `idempotency_key`.
      * `[ ]`   Remove from `IndexingService`: the embedded LLM call (`embeddingClient.getEmbedding`) and text-splitting (`textSplitter.splitText`) — those responsibilities belong to the EMBED job (embedding) and WS-S pre-job chunking respectively. `LangchainTextSplitter` and `EmbeddingClient` stay in the file as standalone exported classes.
      * `[ ]`   Replace junk attribution constants (`walletId:'embedding-${sessionId}'`, `recordedByUserId:'system'`) with real values supplied via `attribution`. Debit only when `attribution.tokens_used` is provided and non-zero.
      * `[ ]`   Replace hardcoded `expectedEmbeddingDim=3072` dimension guard with the `dimensions` parameter.
      * `[ ]`   Remove `IndexDocumentResult` (has `tokensUsed` output — now an input); introduce `InsertChunkResult = { success: boolean; error?: Error }`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `LangchainTextSplitter` is unchanged and remains exported from this file. `EmbeddingClient.getEmbedding` gains `_embeddingModelApiIdentifier: string` as a 2nd parameter (ignored at the adapter call site) to satisfy the updated `IEmbeddingClient` interface whose type change s with the rag_service node (node 3).
      * `[ ]`   `ITextSplitter` and `IEmbeddingClient` remain in `indexing_service.interface.ts`.
      * `[ ]`   `JobContext.mock.ts` does not require editing: `new MockIndexingService()` call site is unchanged; `indexingService` property name in `JobContextParams` is unchanged.

  * `[ ]`   `role`
    * `[ ]`   Persistence service (`_shared/services`). IndexingService's single remaining responsibility is: validate the vector dimension, optionally record a token debit, and insert one pre-embedded chunk row into `dialectic_memory` with correct attribution.
    * `[ ]`   Appropriate because IndexingService is the only service authorized to write `dialectic_memory` rows; ownership stays here rather than being distributed across every caller.
    * `[ ]`   Out of scope (own nodes): text splitting before EMBED job creation (WS-S); calling `insertChunk` from `saveResponse` (WS-B `saveResponse.ts` node); `rag_service.ts` removal of `IIndexingService` dep (node 3, already specified).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `indexing_service.ts`, `indexing_service.interface.ts`, `indexing_service.test.ts`, `indexing_service.mock.ts`.
    * `[ ]`   Inside boundary: `insertChunk` signature + behavior, `InsertChunkAttribution`/`InsertChunkResult` types, `IndexingService` constructor, `MockIndexingService` shape.
    * `[ ]`   Outside boundary: who calls `insertChunk` (WS-B); how EMBED jobs are created (WS-S); `dialectic_memory` schema (node 1); JobContext wiring (WS-B/WS-R factory node).

  * `[ ]`   `deps`
    * `[ ]`   `SupabaseClient<Database>` (inward, external package) — `dialectic_memory` insert only.
    * `[ ]`   `IAdminTokenWalletService` (inward, same layer) — records debit when `attribution.tokens_used` provided; real `wallet_id`/`user_id` from attribution.
    * `[ ]`   `ILogger` (inward) — unchanged.
    * `[ ]`   `TablesInsert<'dialectic_memory'>` from `types_db.ts` (inward, generated schema) — provides the row type for the insert, including the `source_type` enum union.
    * `[ ]`   **REMOVED from `IndexingService` constructor**: `ITextSplitter` and `IEmbeddingClient` — no longer needed by `IndexingService`; both interfaces and their implementations remain in the file for other consumers.
    * `[ ]`   Confirm: no reverse dependency on `IndexingService` within `_shared`; `JobContext.mock.ts` uses `MockIndexingService` (updated in this node) without any call-site changes.

  * `[ ]`   `context_slice`
    * `[ ]`   From `types_db.ts`: `TablesInsert<'dialectic_memory'>` row shape — specifically `user_id`, `wallet_id`, `source_type`, `source_id`, `session_id`, `content`, `embedding`, `metadata`. The `source_type` column type is `Enums['dialectic_memory_source_type_enum']` (`"dialectic_contribution" | "dialectic_project_resource" | "dialectic_feedback"`), generated by node 1.
    * `[ ]`   From `IAdminTokenWalletService`: only `recordTransaction(...)` — unchanged call shape, but now with real attribution values.
    * `[ ]`   No hidden coupling: `LangchainTextSplitter` and `EmbeddingClient` are standalone exports; they do NOT depend on `IndexingService`.

  * `[ ]`   `indexing_service.interface.ts` (structural boundary — type edit s with first consumer)
    * `[ ]`   Add `InsertChunkAttribution` interface:
      ```
      session_id: string;
      user_id: string;
      wallet_id: string;
      source_type: TablesInsert<'dialectic_memory'>['source_type'];
      source_id: string;
      idempotency_key: string;
      tokens_used?: number;
      metadata?: Record<string, unknown>;
      ```
      Add the required `TablesInsert` import: `import type { TablesInsert } from '../../../functions/types_db.ts';`.
    * `[ ]`   Add `InsertChunkResult` interface: `{ success: boolean; error?: Error }`.
    * `[ ]`   Replace `IIndexingService.indexDocument(...)` with `insertChunk(chunkText: string, embeddingVector: number[], dimensions: number, attribution: InsertChunkAttribution): Promise<InsertChunkResult>`.
    * `[ ]`   Remove `IndexDocumentResult` interface (replaced by `InsertChunkResult`).
    * `[ ]`   Retain `ITextSplitter` and `IEmbeddingClient` unchanged.

  * `[ ]`   `indexing_service.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Remove** the following tests in their entirety (all test `indexDocument` behavior):
      * `[ ]`   "IndexingService should process and index a document successfully"
      * `[ ]`   "IndexingService uses DummyAdapter embeddings (deterministic vector, non-zero usage, persisted length 3072)"
      * `[ ]`   "IndexingService guard: returns error when embedding dimension != 3072 (no insert)"
      * `[ ]`   "IndexingService bills embeddings 1:1 per chunk with idempotent keys"
    * `[ ]`   **Retain** unchanged: "EmbeddingClient should be instantiable with any valid AiProviderAdapter".
    * `[ ]`   **Remove** the `MockTextSplitter` helper class (no longer needed by `IndexingService`).
    * `[ ]`   **Update** imports: replace `IndexDocumentResult` with `InsertChunkResult`; add `InsertChunkAttribution`; remove `ITextSplitter`; remove `mockOpenAiAdapter`/`mockGetEmbeddingSpy` imports (no longer needed for IndexingService construction).
    * `[ ]`   **Add** test: "insertChunk inserts one row into dialectic_memory with correct attribution columns": construct `IndexingService` (new minimal constructor: `supabaseClient`, `logger`, `tokenWalletService`); call `insertChunk('chunk text', Array(16).fill(0.1), 16, { session_id, user_id, wallet_id, source_type: 'dialectic_contribution', source_id, idempotency_key, tokens_used: 5 })`; assert `result.success === true`; assert insert was called once on `dialectic_memory`; assert inserted row has `user_id`, `wallet_id`, `source_type: 'dialectic_contribution'`, `source_id`, `content: 'chunk text'`; assert `embedding` parses to a 16-element array.
    * `[ ]`   **Add** test: "dimension guard: returns InsertChunkResult error when vector length != dimensions (no insert)": call `insertChunk` with a 16-element vector but `dimensions: 32`; assert `result.success === false`; assert `result.error.message` includes `'32'`; assert no insert attempted.
    * `[ ]`   **Add** test: "records 1:1 token wallet debit with real attribution when tokens_used is provided": call `insertChunk` with `tokens_used: 42` in attribution; assert `tokenWalletService.recordTransaction` called once with `walletId === attribution.wallet_id`, `recordedByUserId === attribution.user_id`, `idempotencyKey === attribution.idempotency_key`, `amount === '42'`.
    * `[ ]`   **Add** test: "skips token wallet debit when tokens_used is absent": call `insertChunk` with no `tokens_used` in attribution; assert `tokenWalletService.recordTransaction` not called.
    * `[ ]`   **Add** test: "returns InsertChunkResult error when DB insert fails": configure mock Supabase to return an insert error; call `insertChunk`; assert `result.success === false`; assert `result.error` is set.
    * `[ ]`   Do NOT re-test: `LangchainTextSplitter` chunking behavior; `EmbeddingClient` delegation (own independent concerns already tested in retained tests).

  * `[ ]`   `construction`
    * `[ ]`   `IndexingService` constructor signature changes from `(supabaseClient, logger, textSplitter, embeddingClient, tokenWalletService)` to `(supabaseClient, logger, tokenWalletService)`. No partially-constructed state possible; all remaining deps are required.
    * `[ ]`   `MockIndexingService` changes from `extends IndexingService` to `class MockIndexingService implements IIndexingService` — constructor becomes a no-arg no-op; the `super()` call and all mock deps (mock logger, mock splitter, mock embedding client, mock wallet) passed to it are removed.

  * `[ ]`   `indexing_service.ts` (implementation)
    * `[ ]`   Remove `textSplitter: ITextSplitter` and `embeddingClient: IEmbeddingClient` from the `IndexingService` constructor parameters and private fields.
    * `[ ]`   Remove the `indexDocument` method in its entirety.
    * `[ ]`   Update `EmbeddingClient.getEmbedding`: change signature from `async getEmbedding(text: string)` to `async getEmbedding(text: string, _embeddingModelApiIdentifier: string)` — the adapter call `this.adapter.getEmbedding(text)` is unchanged; identifier ignored at this stage but required by the updated `IEmbeddingClient` interface (type change s with rag_service node 3).
    * `[ ]`   Update `import { ITextSplitter, IEmbeddingClient, IndexDocumentResult } from './indexing_service.interface.ts';` to `import { IEmbeddingClient, ITextSplitter, InsertChunkAttribution, InsertChunkResult } from './indexing_service.interface.ts';` (`ITextSplitter`/`IEmbeddingClient` retained for `LangchainTextSplitter`/`EmbeddingClient` class declarations in the same file; `IndexDocumentResult` removed).
    * `[ ]`   Add `insertChunk(chunkText: string, embeddingVector: number[], dimensions: number, attribution: InsertChunkAttribution): Promise<InsertChunkResult>` method:
      * `[ ]`   Guard: if `embeddingVector.length !== dimensions` → log error, return `{ success: false, error: new IndexingError(`Embedding dimension mismatch; expected ${dimensions}.`) }`.
      * `[ ]`   Token debit (conditional on `attribution.tokens_used`): call `this.tokenWalletService.recordTransaction({ walletId: attribution.wallet_id, type: 'DEBIT_USAGE', amount: String(attribution.tokens_used), recordedByUserId: attribution.user_id, idempotencyKey: attribution.idempotency_key, relatedEntityId: attribution.source_id, relatedEntityType: attribution.source_type, notes: 'Embedding chunk debit (1:1)' })`; catch and log warn on failure (non-fatal, matches existing pattern).
      * `[ ]`   DB insert: `this.supabaseClient.from('dialectic_memory').insert({ session_id: attribution.session_id, user_id: attribution.user_id, wallet_id: attribution.wallet_id, source_type: attribution.source_type, source_id: attribution.source_id, content: chunkText, embedding: `[${embeddingVector.join(',')}]`, metadata: attribution.metadata ?? {} })`; on error return `{ success: false, error: new IndexingError(...) }`.
      * `[ ]`   On success return `{ success: true }`.

  * `[ ]`   `indexing_service.mock.ts` (simulation — updated consistently)
    * `[ ]`   Change `export class MockIndexingService extends IndexingService` to `export class MockIndexingService implements IIndexingService`.
    * `[ ]`   Remove the constructor body entirely (no `super()` call; no mock dep construction).
    * `[ ]`   Replace `over indexDocument = (...): Promise<IndexDocumentResult> => { ... }` with `insertChunk(_chunkText: string, _embeddingVector: number[], _dimensions: number, _attribution: InsertChunkAttribution): Promise<InsertChunkResult> { return Promise.resolve({ success: true }); }`.
    * `[ ]`   Update imports: remove `IndexingService` class import (no longer extended); add `IIndexingService`, `InsertChunkAttribution`, `InsertChunkResult` from `indexing_service.interface.ts`; remove `createMockSupabaseClient`, `MockLogger`, `createMockAdminTokenWalletService`, `ILogger`, `SupabaseClient`, `Database` (no longer needed by the mock constructor).

  * `[ ]`   `directionality`
    * `[ ]`   Layer: application service (`_shared/services`). Deps are inward (DB client, logger, wallet service, schema types); provides outward (`insertChunk` to `saveResponse`/WS-B).
    * `[ ]`   Constructor dep count reduced from 5 to 3 — dependency graph simplified.
    * `[ ]`   No cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `IIndexingService` declares `insertChunk`; `indexDocument` no longer exists on the interface.
    * `[ ]`   `InsertChunkAttribution` type is exported from `indexing_service.interface.ts` with all required fields typed against `TablesInsert<'dialectic_memory'>['source_type']`.
    * `[ ]`   `InsertChunkResult` is exported from `indexing_service.interface.ts`; `IndexDocumentResult` is removed.
    * `[ ]`   `IndexingService` constructor takes exactly 3 args (`supabaseClient`, `logger`, `tokenWalletService`).
    * `[ ]`   `insertChunk` called with vector length matching `dimensions` param: inserts one row into `dialectic_memory` with `user_id`, `wallet_id`, `source_type`, `source_id` from `attribution`; returns `{ success: true }`.
    * `[ ]`   `insertChunk` called with mismatched vector length: returns `{ success: false, error.message includes dimensions value }`; no insert attempted.
    * `[ ]`   `insertChunk` called with `tokens_used: 42`: `tokenWalletService.recordTransaction` called once with `walletId === attribution.wallet_id` and `recordedByUserId === attribution.user_id` (not `'system'`).
    * `[ ]`   `insertChunk` called without `tokens_used`: `tokenWalletService.recordTransaction` not called.
    * `[ ]`   `MockIndexingService implements IIndexingService` (not `extends IndexingService`); `new MockIndexingService()` takes no arguments.
    * `[ ]`   `EmbeddingClient.getEmbedding` accepts `(text: string, _embeddingModelApiIdentifier: string)` — 2nd param ignored; adapter call unchanged (`this.adapter.getEmbedding(text)`); class continues to implement `IEmbeddingClient`.
    * `[ ]`   No commit step in this node — WS-0 is not independently consumer-testable; commit lands in the last node of the first working end-to-end slice.


* `[ ]`   supabase/functions/_shared/utils/`vector_utils.ts` **[BE] Widen CompressionCandidate.sourceType to the dialectic-memory DB source-type union; thread embeddingModelApiIdentifier through scoreResourceDocuments and getSortedCompressionCandidates to satisfy the updated IEmbeddingClient two-arg contract; fix dropped-column diagnostic query**

  * `[ ]`   `objective`
    * `[ ]`   Solve two separate but co-located breaks introduced by WS-0:
      * `[ ]`   (Migration break) `CompressionCandidate.sourceType: 'history' | 'document'` no longer reflects the identity carried by the `dialectic_memory` schema; after the migration, the DB column is `source_type: dialectic_memory_source_type_enum` with values `'dialectic_contribution' | 'dialectic_project_resource' | 'dialectic_feedback'`. The `'document'` literal must be replaced so the union matches the DB enum and `sourceType` carries real row identity.
      * `[ ]`   (Migration break) The diagnostic DB query inside `getSortedCompressionCandidates` references `source_contribution_id`, which is dropped in the WS-0 migration; this causes a runtime/type error and must be updated to `source_id`.
      * `[ ]`   (WS-E threading — same file, folds in here) `IEmbeddingClient.getEmbedding` gained `embeddingModelApiIdentifier: string` as a 2nd parameter in the rag_service node (node 3); both `getEmbedding` call sites in `scoreResourceDocuments` still pass one argument, breaking type-checking. The identifier must be threaded through `CompressionStrategyParams.embeddingModelApiIdentifier` → `getSortedCompressionCandidates` → `scoreResourceDocuments` parameter → both `getEmbedding` call sites.
    * `[ ]`   Functional goals:
      * `[ ]`   `CompressionCandidate.sourceType` becomes `'history' | 'dialectic_contribution' | 'dialectic_project_resource' | 'dialectic_feedback'`.
      * `[ ]`   `scoreResourceDocuments` derives `sourceType` from `doc.type` (cast to the new union) rather than hardcoding `'document'`.
      * `[ ]`   Both `deps.embeddingClient.getEmbedding` calls in `scoreResourceDocuments` pass `embeddingModelApiIdentifier` as the 2nd argument.
      * `[ ]`   `getSortedCompressionCandidates` reads `params.embeddingModelApiIdentifier` and forwards it to `scoreResourceDocuments`.
      * `[ ]`   All internal guards that previously branched on `c.sourceType === 'document'` are updated to `c.sourceType !== 'history'` to handle the three-value DB union.
      * `[ ]`   The diagnostic DB query is updated from `.select('source_contribution_id').in('source_contribution_id', candidateIds)` to `.select('source_id').in('source_id', candidateIds)`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `scoreHistory` is unchanged; it assigns `sourceType: 'history'` which remains a valid union member.
      * `[ ]`   `cosineSimilarity`, `dotProduct`, `magnitude` are unchanged.
      * `[ ]`   `mockCompressionStrategy` in `vector_utils.mock.ts` is `async () => []` — it ignores all params and still satisfies `ICompressionStrategy`; no change needed.
      * `[ ]`   External callers that pass `CompressionStrategyParams` (e.g. `processSimpleJob.ts`, `prepareModelJob.ts`, integration tests) must add `embeddingModelApiIdentifier` to their params — those are separate call-site nodes; they are NOT changed in this node.

  * `[ ]`   `role`
    * `[ ]`   Shared utility function boundary (`_shared/utils`). `vector_utils.ts` is the single producer of `CompressionCandidate[]` consumed by `compressPrompt.ts` and Workstream C callers; it is also the only call site for `IEmbeddingClient.getEmbedding` outside of `rag_service.ts`.
    * `[ ]`   Out-of-scope: `compressPrompt.ts` call-site update (own WS-C node); `processSimpleJob.ts` / `prepareModelJob.ts` / integration-test call-site updates (own nodes per caller).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `vector_utils.ts`, `vector_utils.interface.ts`, `vector_utils.test.ts`, `vector_utils.mock.ts`.
    * `[ ]`   Inside boundary: `CompressionCandidate` type definition; `scoreResourceDocuments` and `getSortedCompressionCandidates` function bodies; `CompressionStrategyParams.embeddingModelApiIdentifier` contract.
    * `[ ]`   Outside boundary: `IEmbeddingClient.getEmbedding` signature (type change s with rag_service node 3, already done); `compressPrompt.ts` `ICompressionStrategy` call site; external integration test callers; `ResourceDocument.type` values (set by `gatherArtifacts` callers).

  * `[ ]`   `deps`
    * `[ ]`   `IEmbeddingClient` (inward, `indexing_service.interface.ts`) — `getEmbedding(text, embeddingModelApiIdentifier)` 2-arg form is already the interface contract as of node 3; this node is the consuming implementation update.
    * `[ ]`   `SupabaseClient<Database>` (inward, external) — diagnostic query only; `source_contribution_id` column reference replaced with `source_id`.
    * `[ ]`   `CompressionStrategyParams` (inward, `vector_utils.interface.ts`) — gains `embeddingModelApiIdentifier: string`; callers must supply it.
    * `[ ]`   `ILogger` (inward, optional in deps) — unchanged.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `context_slice`
    * `[ ]`   `CompressionCandidate.sourceType`: `'history' | Exclude<Enums<'dialectic_memory_source_type_enum'>, 'rag_query'>` — import `Enums` from `../../types_db.ts` in `vector_utils.ts`. `ResourceDocument.type` stays `string` (100+ call sites use `'rendered_document'` and other non-enum literals); a `as Exclude<Enums<'dialectic_memory_source_type_enum'>, 'rag_query'>` cast at the assignment site in `scoreResourceDocuments` bridges the gap. `'rag_query'` is excluded from the candidate type because query-embedding records stored in `dialectic_memory` are retrieval inputs, not compression candidates.
    * `[ ]`   `CompressionStrategyParams.embeddingModelApiIdentifier: string` — required; callers not yet updated will get a compile error (expected and intentional — those are separate nodes).
    * `[ ]`   `dialectic_memory` diagnostic query: `source_id` column exists after migration; `candidateIds` are IDs from `ResourceDocument.id` and `Messages.id`; the lookup remains diagnostic only (non-fatal warn on error; no exclusion logic).

  * `[ ]`   `vector_utils.interface.ts` (structural boundary — type edit s with first consumer, which is this node)
    * `[ ]`   In `CompressionStrategyParams`: add `embeddingModelApiIdentifier: string` as a required field (not optional) immediately after the existing `inputsRelevance?: RelevanceRule[]` field.
    * `[ ]`   All other interfaces (`CompressionStrategyDeps`, `CompressionStrategyPayload`, `ICompressionStrategy`) are unchanged.

  * `[ ]`   `vector_utils.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Update** `mockEmbeddingClient` definition: change `getEmbedding: async (text: string): Promise<EmbeddingResponse>` to `getEmbedding: async (text: string, _embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>`. Body unchanged.
    * `[ ]`   **Update** all `ResourceDocuments` fixture literals that use `type: 'document'`: replace with `type: 'dialectic_contribution'` (the most representative value for test purposes). Affected locations: `scoreResourceDocuments` describe block, `getSortedCompressionCandidates` outer block, blended-scoring `Deno.test` block.
    * `[ ]`   **Update** `assertEquals(highRelevanceDoc.sourceType, 'document')` in `scoreResourceDocuments` → `assertEquals(highRelevanceDoc.sourceType, 'dialectic_contribution')` to match the updated fixture.
    * `[ ]`   **Update** all `getSortedCompressionCandidates` / `compressionStrategy(...)` call sites: add `embeddingModelApiIdentifier: 'text-embedding-3-large'` to every `params` object (`{}` becomes `{ embeddingModelApiIdentifier: 'text-embedding-3-large' }`; `{ inputsRelevance }` becomes `{ inputsRelevance, embeddingModelApiIdentifier: 'text-embedding-3-large' }`).
    * `[ ]`   **Update** `result.filter(c => c.sourceType === 'document')` in the blended-scoring test → `result.filter(c => c.sourceType !== 'history')`.
    * `[ ]`   **Update** `assert(hasDocument, ...)` companion checks in combine-and-sort test: the `hasDocument` guard uses `.some(c => c.sourceType === 'document')` — update to `.some(c => c.sourceType !== 'history')`.
    * `[ ]`   **Do NOT** remove or modify `scoreHistory` tests — function and its `'history'` sourceType assignment are unchanged.
    * `[ ]`   **Do NOT** remove or modify `cosineSimilarity` tests.

  * `[ ]`   `construction`
    * `[ ]`   `scoreResourceDocuments` and `getSortedCompressionCandidates` are stateless exported functions — no constructor, no class, no factory. No construction concerns.
    * `[ ]`   `embeddingModelApiIdentifier` is a per-call param threaded through `params`; it is not a dep injected at module level.

  * `[ ]`   `vector_utils.ts` (implementation)
    * `[ ]`   Add import: `import type { Enums } from '../../types_db.ts';`.
    * `[ ]`   **Update** `CompressionCandidate` type: change `sourceType: 'history' | 'document'` to `sourceType: 'history' | Exclude<Enums<'dialectic_memory_source_type_enum'>, 'rag_query'>`. `'rag_query'` is excluded because query-embedding records are never compression candidates.
    * `[ ]`   **Update** `scoreResourceDocuments` signature: add `embeddingModelApiIdentifier: string` as 4th parameter — full signature becomes `export async function scoreResourceDocuments(deps: CompressionStrategyDeps, documents: ResourceDocuments, currentUserPrompt: string, embeddingModelApiIdentifier: string): Promise<CompressionCandidate[]>`.
    * `[ ]`   **Update** `scoreResourceDocuments` body:
      * `[ ]`   `await deps.embeddingClient.getEmbedding(currentUserPrompt)` → `await deps.embeddingClient.getEmbedding(currentUserPrompt, embeddingModelApiIdentifier)`.
      * `[ ]`   `await deps.embeddingClient.getEmbedding(doc.content)` → `await deps.embeddingClient.getEmbedding(doc.content, embeddingModelApiIdentifier)`.
      * `[ ]`   `sourceType: 'document'` hardcode → `sourceType: doc.type as Exclude<Enums<'dialectic_memory_source_type_enum'>, 'rag_query'>` — explicit cast required because `ResourceDocument.type` stays `string`; callers of `scoreResourceDocuments` supply valid `dialectic_memory` source types.
    * `[ ]`   **Update** `getSortedCompressionCandidates` body:
      * `[ ]`   Destructure `embeddingModelApiIdentifier` from `params`: add `const embeddingModelApiIdentifier: CompressionStrategyParams['embeddingModelApiIdentifier'] = params.embeddingModelApiIdentifier;` alongside the existing `inputsRelevance` destructure line.
      * `[ ]`   Forward to `scoreResourceDocuments`: `const documentCandidates = await scoreResourceDocuments(deps, documents, currentUserPrompt, embeddingModelApiIdentifier)`.
      * `[ ]`   In `allCandidates.map()`: change `if (c.sourceType === 'document')` to `if (c.sourceType !== 'history')`.
      * `[ ]`   In the debug payload `sortedCandidates.map()`: change `if (c.sourceType === 'document')` to `if (c.sourceType !== 'history')`.
      * `[ ]`   In the diagnostic DB query: change `.select('source_contribution_id').in('source_contribution_id', candidateIds)` to `.select('source_id').in('source_id', candidateIds)`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared utility (`_shared/utils`). Deps are inward (`IEmbeddingClient` from services, `SupabaseClient` from external package, `RelevanceRule` from dialectic-service interface, types from `_shared/types.ts`); provides outward (`CompressionCandidate[]` to `compressPrompt.ts`/WS-C callers and the `ICompressionStrategy` function type).
    * `[ ]`   No new dependencies added; no cycles introduced.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `CompressionCandidate.sourceType` is `'history' | Exclude<Enums<'dialectic_memory_source_type_enum'>, 'rag_query'>` — `'document'` and `'rag_query'` are not valid values; `ResourceDocument.type` is unchanged (remains `string`).
    * `[ ]`   `scoreResourceDocuments` called with a document whose `type` is `'dialectic_project_resource'`: returned candidate `sourceType === 'dialectic_project_resource'` — no cast, no fallback.
    * `[ ]`   Both `getEmbedding` calls in `scoreResourceDocuments` pass `embeddingModelApiIdentifier` as 2nd arg — compiles against updated `IEmbeddingClient` interface.
    * `[ ]`   `CompressionStrategyParams` without `embeddingModelApiIdentifier` fails TypeScript type-checking.
    * `[ ]`   `getSortedCompressionCandidates` called with `embeddingModelApiIdentifier: 'text-embedding-3-large'` in params: forwards that value to `scoreResourceDocuments`; all existing sort-order and matrix-weight assertions continue to pass.
    * `[ ]`   Diagnostic DB query uses `source_id`, not `source_contribution_id`; a mock Supabase client returning an error for `source_id` query causes a `logger.warn` call but does not throw or modify the returned candidates list.
    * `[ ]`   `scoreHistory` and `cosineSimilarity` test suites pass without modification.
    * `[ ]`   No commit step in this node — WS-0 is not independently consumer-testable; commit lands in the last node of the first working end-to-end slice.


## WS-A — NETLIFY ADAPTERS

* `[✅]`   netlify/functions/ai-stream-background/adapters/openai/openai.ts **[BE] Add embedding operation support to the OpenAI adapter while preserving chat stream behavior**

   * `[✅]`   `objective`
      * `[✅]`   Solve the missing provider-adapter embedding capability so embedding workloads can execute through the same adapter boundary as chat workloads.
      * `[✅]`   Functional goals:
         * `[✅]`   Add adapter-level embedding request and response contracts.
         * `[✅]`   Implement `getEmbedding` in the OpenAI adapter using the OpenAI embeddings API.
         * `[✅]`   Preserve existing `sendMessageStream` behavior and output chunk semantics.
         * `[✅]`   Keep embedding support additive so existing adapters remain valid while this node is completed.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No behavior regressions in existing OpenAI stream tests.
         * `[✅]`   Deterministic runtime validation and explicit error signaling for malformed embedding responses.
         * `[✅]`   No handler, queue, or Supabase worker changes in this node.
      * `[✅]`   Each goal is atomic and testable through existing and added adapter tests.

   * `[✅]`   `role`
      * `[✅]`   Node role is provider adapter implementation plus immediate contract support files consumed by that implementation.
      * `[✅]`   This role is correct because `openai.ts` is the first source file that must consume embedding contracts, guards, and mocks.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit handler routing (`ai-stream-background.ts`) in this node.
         * `[✅]`   Do not edit enqueue/callback schemas in this node.
         * `[✅]`   Do not edit non-OpenAI provider source files in this node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `netlify/functions/ai-stream-background/adapters` and OpenAI adapter internals.
      * `[✅]`   Inside boundary:
         * `[✅]`   Adapter contracts used by provider adapters.
         * `[✅]`   OpenAI request shaping and response normalization.
         * `[✅]`   OpenAI runtime guards, mocks, and tests.
      * `[✅]`   Outside boundary:
         * `[✅]`   Workload dispatch mode selection.
         * `[✅]`   Netlify callback persistence behavior.
         * `[✅]`   Supabase worker orchestration.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `openai` package client.
         * `[✅]`   Layer classification: external adapter dependency.
         * `[✅]`   Direction: inbound to adapter implementation.
         * `[✅]`   Purpose: invoke `chat.completions.create` and `embeddings.create`.
      * `[✅]`   Provider: `../ai-adapter.interface.ts`.
         * `[✅]`   Layer classification: internal adapter contract.
         * `[✅]`   Direction: producer contract consumed by OpenAI adapter.
         * `[✅]`   Purpose: `AiAdapter`, constructor params, stream chunk, and embedding contract types.
      * `[✅]`   Provider: `../getNodeAiAdapter.guard.ts`.
         * `[✅]`   Layer classification: shared runtime guard utility.
         * `[✅]`   Direction: producer guard consumed by OpenAI adapter.
         * `[✅]`   Purpose: validate usage records and plain records safely.
      * `[✅]`   Provider: `../resolveOutputCap.ts`.
         * `[✅]`   Layer classification: shared helper.
         * `[✅]`   Direction: producer helper consumed by chat path only.
         * `[✅]`   Purpose: preserve existing output-cap behavior.
      * `[✅]`   Confirm:
         * `[✅]`   No reverse dependencies introduced.
         * `[✅]`   No lateral layer violations introduced.

   * `[✅]`   `context_slice`
      * `[✅]`   Minimal dependency interfaces required:
         * `[✅]`   OpenAI client methods for streaming chat and embeddings only.
         * `[✅]`   Adapter contract method signatures and token usage shape.
         * `[✅]`   Runtime record/token-usage guard helpers.
      * `[✅]`   Injection shape remains `NodeAdapterConstructorParams` and no new constructor dependencies are added.
      * `[✅]`   Confirm:
         * `[✅]`   No over-fetching of dependency surfaces.
         * `[✅]`   No hidden coupling to queue payload structures.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/ai-adapter.interface.test.ts`
      * `[✅]`   Add valid and invalid contract assertions for new embedding boundary types:
         * `[✅]`   Valid `NodeEmbeddingRequest` with non-empty `input`.
         * `[✅]`   Invalid request with non-string `input`.
         * `[✅]`   Valid `NodeEmbeddingResponse` with numeric `embedding` vector and token usage.
         * `[✅]`   Invalid response with non-numeric vector elements.
      * `[✅]`   Add contract assertions for `AiAdapter` compatibility:
         * `[✅]`   Adapter with `sendMessageStream` only remains valid.
         * `[✅]`   Adapter with both `sendMessageStream` and optional `getEmbedding` remains valid.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/ai-adapter.interface.ts`
      * `[✅]`   Add `NodeEmbeddingRequest` with `input: string`.
      * `[✅]`   Add `NodeEmbeddingResponse` with:
         * `[✅]`   `embedding: number[]`
         * `[✅]`   `tokenUsage: NodeTokenUsage`
      * `[✅]`   Extend `AiAdapter` interface with optional method:
         * `[✅]`   `getEmbedding?(request: NodeEmbeddingRequest, apiIdentifier: string): Promise<NodeEmbeddingResponse>`
      * `[✅]`   Keep existing stream method signatures unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.interaction.spec`
      * `[✅]`   Define OpenAI adapter interactions for both supported operations.
      * `[✅]`   Chat stream interaction constraints:
         * `[✅]`   Preserve current request shaping.
         * `[✅]`   Preserve `text_delta` then `usage` then `done` stream semantics.
         * `[✅]`   Preserve output-cap resolution.
      * `[✅]`   Embedding interaction constraints:
         * `[✅]`   Validate OpenAI model suffix resolution from `apiIdentifier`.
         * `[✅]`   Call `embeddings.create` with resolved model and request input.
         * `[✅]`   Require non-empty embedding data.
         * `[✅]`   Require usage object with `prompt_tokens` and `total_tokens`.
         * `[✅]`   Normalize returned usage into `NodeTokenUsage` with `completion_tokens` fixed to `0`.
      * `[✅]`   Failure modes:
         * `[✅]`   Model mismatch throws explicit adapter error.
         * `[✅]`   Missing usage throws explicit adapter error.
         * `[✅]`   Empty embedding data throws explicit adapter error.
         * `[✅]`   SDK APIError is surfaced through existing adapter error normalization.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.test.ts`
      * `[✅]`   Add coverage for optional embedding method validation:
         * `[✅]`   Accept adapter object with only valid `sendMessageStream`.
         * `[✅]`   Accept adapter object with valid `sendMessageStream` and function `getEmbedding`.
         * `[✅]`   Reject adapter object with non-function `getEmbedding`.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.ts`
      * `[✅]`   Keep `sendMessageStream` function requirement unchanged.
      * `[✅]`   Add optional `getEmbedding` runtime function check.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.interface.test.ts`
      * `[✅]`   Add embedding interface contract tests:
         * `[✅]`   Accept embedding datum with numeric `embedding` array.
         * `[✅]`   Accept embedding response with non-empty `data` and valid `usage`.
         * `[✅]`   Reject malformed usage fields by type contract fixtures.
         * `[✅]`   Reject malformed embedding vector element types by type contract fixtures.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.interface.ts`
      * `[✅]`   Add `OpenAIEmbeddingDatum` containing `embedding: number[]`.
      * `[✅]`   Add `OpenAIEmbeddingUsage` containing `prompt_tokens: number` and `total_tokens: number`.
      * `[✅]`   Add `OpenAIEmbeddingResponse` containing `data: OpenAIEmbeddingDatum[]` and `usage: OpenAIEmbeddingUsage`.
      * `[✅]`   Preserve existing chat interface types unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.guard.test.ts`
      * `[✅]`   Add guard tests for embedding runtime validation:
         * `[✅]`   Accept valid embedding response.
         * `[✅]`   Reject missing usage.
         * `[✅]`   Reject empty data array.
         * `[✅]`   Reject non-array embedding field.
         * `[✅]`   Reject embedding arrays containing non-number elements.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.guard.ts`
      * `[✅]`   Add type guards for:
         * `[✅]`   embedding usage object
         * `[✅]`   embedding datum vector
         * `[✅]`   embedding response object
      * `[✅]`   Preserve all existing chat chunk guards unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.mock.ts`
      * `[✅]`   Add embedding fixtures and factories:
         * `[✅]`   Valid embedding response fixture.
         * `[✅]`   Valid embedding usage fixture.
         * `[✅]`   Over-capable factory for malformed usage and malformed vectors.
      * `[✅]`   Extend adapter mock factory to optionally provide deterministic `getEmbedding` implementation.
      * `[✅]`   Preserve existing stream mock defaults unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.test.ts`
      * `[✅]`   Add RED/GREEN unit tests for new `getEmbedding` behavior:
         * `[✅]`   Calls `embeddings.create` with resolved model and request input.
         * `[✅]`   Returns first embedding vector and normalized token usage.
         * `[✅]`   Throws on model mismatch before API call.
         * `[✅]`   Throws on missing usage.
         * `[✅]`   Throws on empty embedding data.
         * `[✅]`   Surfaces normalized API errors consistently with existing style.
      * `[✅]`   Keep current stream tests and assertions unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.ts`
      * `[✅]`   Implement `getEmbedding` on the returned adapter object using the new interface contract.
      * `[✅]`   Resolve and validate model identifier in the same style as stream path.
      * `[✅]`   Call OpenAI embeddings API, validate guard-safe response, and map to `NodeEmbeddingResponse`.
      * `[✅]`   Keep `sendMessageStream` behavior unchanged.
      * `[✅]`   Keep constructor shape and dependency injection unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.provides.ts`
      * `[✅]`   Export newly added embedding types, guards, and mock helpers introduced by this node.
      * `[✅]`   Preserve all existing exports used by current tests and consumers.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/openai/openai.integration.test.ts`
      * `[✅]`   Add integration assertions covering provider -> selector -> adapter chain for embeddings:
         * `[✅]`   Construct a real provider map that registers the OpenAI factory.
         * `[✅]`   Resolve the adapter through `getNodeAiAdapter` (do not construct OpenAI adapter directly in the embedding integration path).
         * `[✅]`   Invoke embedding through the returned `AiAdapter` boundary and assert normalized `NodeEmbeddingResponse` output.
         * `[✅]`   Assert the selected adapter still satisfies runtime adapter guard checks.
         * `[✅]`   Keep existing stream integration behavior valid in the same test file.
      * `[✅]`   Use only mocked external SDK interactions.

   * `[✅]`   `construction`
      * `[✅]`   `createOpenAINodeAdapter` returns a fully constructed adapter object with required stream function and optional embedding function implemented for OpenAI.
      * `[✅]`   No partial construction path is introduced.
      * `[✅]`   Initialization order keeps existing client construction before method use.

   * `[✅]`   `directionality`
      * `[✅]`   Node layer is provider adapter implementation.
      * `[✅]`   Dependencies remain inward-facing from shared contracts/guards/helpers and external SDK.
      * `[✅]`   Exposed API remains outward-facing through provides exports.
      * `[✅]`   No cycles with handler or worker layers.

   * `[✅]`   `requirements`
      * `[✅]`   Embedding operation is available at OpenAI adapter boundary through typed optional adapter contract.
      * `[✅]`   OpenAI adapter embedding behavior is fully validated and test-covered for success and failure paths.
      * `[✅]`   Existing chat stream behavior remains unchanged and passing.
      * `[✅]`   Guard and interface layers cover embedding shapes and reject malformed data.
      * `[✅]`   Integration test confirms provider map -> adapter selector -> OpenAI adapter embedding chain with mocked external provider interaction.
      * `[✅]`   No non-node-scope source files are modified.

* `[✅]`   netlify/functions/ai-stream-background/adapters/google/google.ts **[BE] Add embedding operation support to Google adapter while preserving Gemini stream semantics**

   * `[✅]`   `objective`
      * `[✅]`   Solve the missing Google provider embedding capability so embedding workloads can execute through the same adapter boundary used by generation workloads.
      * `[✅]`   Functional goals:
         * `[✅]`   Add Google embedding response/request contract coverage at interface and guard layers using the real Google SDK response shape.
         * `[✅]`   Implement `getEmbedding` in Google adapter using Google `embedContent` plus a validated token-count path for `NodeTokenUsage` normalization.
         * `[✅]`   Preserve current `sendMessageStream` behavior, output-cap handling, and finish-reason mapping.
         * `[✅]`   Keep adapter return shape compatible with optional embedding contract introduced in shared adapter interface.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No regressions to existing stream unit and integration assertions.
         * `[✅]`   Deterministic runtime validation of embedding responses prior to normalization.
         * `[✅]`   Do not invent embedding `usageMetadata` fields that are not present on the Google SDK `embedContent` response.
         * `[✅]`   No workload-handler, selector-source, or Supabase source edits in this node.
      * `[✅]`   Each goal is atomic and testable via contract, unit, and integration files in Google adapter scope.

   * `[✅]`   `role`
      * `[✅]`   Node role is provider adapter implementation plus immediate Google support files (interface, guards, mocks, tests, provides).
      * `[✅]`   This role is correct because `google.ts` is the source file that must consume shared adapter embedding capability and produce Google-specific behavior.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit selector source (`getNodeAiAdapter.ts`) in this node.
         * `[✅]`   Do not edit handler source (`ai-stream-background.ts`) in this node.
         * `[✅]`   Do not edit OpenAI/Anthropic source files in this node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is Google adapter implementation under `netlify/functions/ai-stream-background/adapters/google`.
      * `[✅]`   Inside boundary:
         * `[✅]`   Google request preparation and response normalization.
         * `[✅]`   Google runtime guards for chunk/final/embedding/count-token payloads.
         * `[✅]`   Google mock factories and tests proving stream and embedding behavior.
      * `[✅]`   Outside boundary:
         * `[✅]`   Workload mode routing.
         * `[✅]`   Provider selection logic source implementation.
         * `[✅]`   Callback persistence and wallet/debit logic.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `@google/generative-ai` client.
         * `[✅]`   Layer classification: external provider SDK dependency.
         * `[✅]`   Direction: inbound to adapter implementation.
         * `[✅]`   Purpose: stream chat completions, compute embeddings, and derive token counts for embedding normalization.
      * `[✅]`   Provider: `../ai-adapter.interface.ts`.
         * `[✅]`   Layer classification: shared adapter contract producer.
         * `[✅]`   Direction: consumed by Google adapter.
         * `[✅]`   Purpose: stream chunk contract plus optional embedding contract types.
      * `[✅]`   Provider: `../getNodeAiAdapter.guard.ts`.
         * `[✅]`   Layer classification: shared runtime guard helpers.
         * `[✅]`   Direction: consumed by Google guard layer.
         * `[✅]`   Purpose: plain record and token usage validation helpers.
      * `[✅]`   Provider: `../../resolveOutputCap/resolveOutputCap.provides.ts`.
         * `[✅]`   Layer classification: shared helper producer.
         * `[✅]`   Direction: consumed by Google stream request preparation.
         * `[✅]`   Purpose: enforce token cap policy for stream requests.
      * `[✅]`   Confirm:
         * `[✅]`   No reverse dependencies introduced.
         * `[✅]`   No lateral layer violations introduced.

   * `[✅]`   `context_slice`
      * `[✅]`   Minimal dependency interfaces required:
         * `[✅]`   SDK calls for stream, `embedContent`, and token counting only.
         * `[✅]`   Shared adapter stream and embedding output shapes.
         * `[✅]`   Shared validation helpers for record/token checks.
      * `[✅]`   Injection shape remains `NodeAdapterConstructorParams` with existing `modelConfig`, `apiKey`, and `userConfig`.
      * `[✅]`   Confirm:
         * `[✅]`   No over-fetching of SDK/client surfaces.
         * `[✅]`   No hidden coupling to handler event payloads.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.interface.test.ts`
      * `[✅]`   Add contract tests for Google embedding payload shapes:
         * `[✅]`   Valid embedding response with `embedding.values` numeric vector output.
         * `[✅]`   Valid token-count response with numeric total token count used for embedding normalization.
         * `[✅]`   Invalid embedding response fixtures for missing vector and non-numeric vector elements.
         * `[✅]`   Invalid token-count response fixtures for missing or non-numeric token totals.
      * `[✅]`   Preserve all current stream contract assertions.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.interface.ts`
      * `[✅]`   Add Google embedding interfaces required by runtime validation and adapter normalization:
         * `[✅]`   embedding vector item type.
         * `[✅]`   embedding container type matching Google `embedContent` response shape.
         * `[✅]`   embedding response type.
         * `[✅]`   token-count response type required to derive `NodeTokenUsage` for embeddings.
      * `[✅]`   Preserve existing stream-related Google interface definitions unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.interaction.spec`
      * `[✅]`   Define stream operation interactions:
         * `[✅]`   prepare history and final parts.
         * `[✅]`   send stream request.
         * `[✅]`   emit `text_delta`, then `usage`, then `done`.
      * `[✅]`   Define embedding operation interactions:
         * `[✅]`   resolve model identifier from `google-` API identifier.
         * `[✅]`   invoke Google `embedContent` API call with request input.
         * `[✅]`   validate `embedding.values` response shape.
         * `[✅]`   invoke Google token-count path required to normalize `NodeTokenUsage`.
         * `[✅]`   normalize usage to `NodeTokenUsage` (`completion_tokens` fixed to `0`).
      * `[✅]`   Failure modes:
         * `[✅]`   empty or malformed embedding payload throws explicit adapter error.
         * `[✅]`   missing or malformed token-count payload throws explicit adapter error.
         * `[✅]`   SDK errors are surfaced through adapter error path without swallowing.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.guard.test.ts`
      * `[✅]`   Add embedding guard tests:
         * `[✅]`   accept valid embedding response shape.
         * `[✅]`   reject missing embedding vector.
         * `[✅]`   reject non-array embedding vector.
         * `[✅]`   reject embedding arrays with non-number elements.
         * `[✅]`   accept valid token-count response.
         * `[✅]`   reject missing/invalid token-count metadata.
      * `[✅]`   Preserve existing stream guard coverage.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.guard.ts`
      * `[✅]`   Add runtime guards for Google embedding response and token-count response.
      * `[✅]`   Reuse shared plain-record validation patterns.
      * `[✅]`   Preserve existing stream chunk/final response guards unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.mock.ts`
      * `[✅]`   Add deterministic Google embedding fixtures and factory overs:
         * `[✅]`   success embedding response fixture with numeric vector.
         * `[✅]`   success token-count response fixture for normalized embedding usage.
         * `[✅]`   malformed embedding and token-count fixtures for negative tests.
      * `[✅]`   Extend adapter mock creation to optionally provide `getEmbedding` implementation.
      * `[✅]`   Preserve current stream mock defaults and helpers.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.test.ts`
      * `[✅]`   Add RED/GREEN unit tests for `getEmbedding`:
         * `[✅]`   invokes Google `embedContent` API with resolved model and input text.
         * `[✅]`   invokes Google token-count path required to derive embedding usage.
         * `[✅]`   returns normalized `NodeEmbeddingResponse` with first embedding vector and token usage.
         * `[✅]`   throws on malformed embedding payload.
         * `[✅]`   throws on missing/invalid token-count payload.
         * `[✅]`   surfaces SDK embedding failures.
      * `[✅]`   Preserve all current stream tests and assertions.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.ts`
      * `[✅]`   Implement `getEmbedding` on returned adapter object.
      * `[✅]`   Resolve model name for embedding path with same identifier normalization style used by stream path.
      * `[✅]`   Call Google `embedContent`, validate with Google embedding guards, call the Google token-count path required for usage normalization, and map to `NodeEmbeddingResponse`.
      * `[✅]`   Keep `sendMessageStream` behavior unchanged.
      * `[✅]`   Keep constructor/dependency injection shape unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.provides.ts`
      * `[✅]`   Export new embedding interfaces/guards/mocks added in this node.
      * `[✅]`   Preserve all existing exports used by tests and consumers.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/google/google.integration.test.ts`
      * `[✅]`   Add integration assertions covering provider -> selector -> adapter chain for Google embedding path:
         * `[✅]`   register a real provider map entry for Google factory.
         * `[✅]`   resolve adapter through selector boundary (`getNodeAiAdapter`) for Google identifier.
         * `[✅]`   invoke embedding through returned `AiAdapter` boundary and assert normalized `NodeEmbeddingResponse`.
         * `[✅]`   assert the selected adapter satisfies runtime adapter guard checks for stream and optional embedding capability.
         * `[✅]`   preserve and reassert existing stream integration behavior in same file.
      * `[✅]`   Use mocks only for external SDK interactions.

   * `[✅]`   `construction`
      * `[✅]`   `createGoogleNodeAdapter` returns fully-constructed adapter object with required stream method and embedding method.
      * `[✅]`   No partial construction path is introduced.
      * `[✅]`   Initialization order remains client construction before operation methods are executed.

   * `[✅]`   `directionality`
      * `[✅]`   Node layer is provider adapter implementation.
      * `[✅]`   Dependencies remain inward-facing from shared contracts/helpers and Google SDK.
      * `[✅]`   Outward API remains through Google provides surface and `AiAdapter` contract.
      * `[✅]`   No cycles with selector or handler layers introduced.

   * `[✅]`   `requirements`
      * `[✅]`   Google adapter exposes embedding capability through optional adapter contract.
      * `[✅]`   Google embedding path validates `embedding.values` from `embedContent` and derives deterministic token usage through a validated Google token-count response.
      * `[✅]`   Existing Google stream behavior remains intact and fully covered.
      * `[✅]`   Integration path verifies selector-resolved Google adapter embedding behavior with external SDK mocked.
      * `[✅]`   Node changes remain scoped to Google source file and its support system.

* `[✅]`   netlify/functions/ai-stream-background/adapters/anthropic/anthropic.ts **[BE] Add embedding operation support to Anthropic adapter while preserving Claude stream semantics**

   * `[✅]`   `objective`
      * `[✅]`   Solve the missing Anthropic provider embedding capability so embedding workloads can execute through the shared adapter boundary without bypassing provider adapters.
      * `[✅]`   Functional goals:
         * `[✅]`   Add Anthropic embedding contract coverage in interface and guard layers.
         * `[✅]`   Implement `getEmbedding` in Anthropic adapter using Anthropic embedding API surface.
         * `[✅]`   Preserve existing `sendMessageStream` behavior, message preparation rules, and stop-reason mapping.
         * `[✅]`   Keep return shape compatible with optional embedding contract from shared adapter interface.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No regressions to existing stream unit and integration tests.
         * `[✅]`   Deterministic runtime validation before embedding normalization.
         * `[✅]`   No edits to selector source, handler source, or Supabase source files in this node.
      * `[✅]`   Each goal is atomic and testable via Anthropic contract, guard, unit, and integration tests.

   * `[✅]`   `role`
      * `[✅]`   Node role is provider adapter implementation and complete immediate support system for Anthropic adapter.
      * `[✅]`   This role is correct because `anthropic.ts` is the source file that consumes shared embedding contract and provides Anthropic-specific runtime behavior.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit `getNodeAiAdapter.ts` in this node.
         * `[✅]`   Do not edit `ai-stream-background.ts` in this node.
         * `[✅]`   Do not edit OpenAI or Google source files in this node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `netlify/functions/ai-stream-background/adapters/anthropic`.
      * `[✅]`   Inside boundary:
         * `[✅]`   Anthropic request shaping and stream/embedding response normalization.
         * `[✅]`   Anthropic runtime guards for stream and embedding payload shapes.
         * `[✅]`   Anthropic test and mock fixtures for stream and embedding paths.
      * `[✅]`   Outside boundary:
         * `[✅]`   Workload mode routing and queue event contracts.
         * `[✅]`   Adapter selection and provider-map dispatch.
         * `[✅]`   Save-response callback persistence.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `@anthropic-ai/sdk` client.
         * `[✅]`   Layer classification: external provider SDK dependency.
         * `[✅]`   Direction: inbound to adapter implementation.
         * `[✅]`   Purpose: run stream generation and compute embeddings.
      * `[✅]`   Provider: `../ai-adapter.interface.ts`.
         * `[✅]`   Layer classification: shared adapter contract producer.
         * `[✅]`   Direction: consumed by Anthropic adapter.
         * `[✅]`   Purpose: stream chunk and embedding request/response contract types.
      * `[✅]`   Provider: `../getNodeAiAdapter.guard.ts`.
         * `[✅]`   Layer classification: shared runtime guard helper producer.
         * `[✅]`   Direction: consumed by Anthropic guard layer.
         * `[✅]`   Purpose: plain record validation utility reuse.
      * `[✅]`   Provider: `../../resolveOutputCap/resolveOutputCap.provides.ts`.
         * `[✅]`   Layer classification: shared helper producer.
         * `[✅]`   Direction: consumed by stream request preparation.
         * `[✅]`   Purpose: output-cap enforcement for stream calls.
      * `[✅]`   Confirm:
         * `[✅]`   No reverse dependencies introduced.
         * `[✅]`   No lateral layer violations introduced.

   * `[✅]`   `context_slice`
      * `[✅]`   Minimal dependency interfaces required:
         * `[✅]`   SDK stream and embedding calls.
         * `[✅]`   Shared adapter contract types.
         * `[✅]`   Shared plain-record validation helper.
      * `[✅]`   Injection shape remains `NodeAdapterConstructorParams` (`modelConfig`, `apiKey`, `userConfig`).
      * `[✅]`   Confirm:
         * `[✅]`   No over-fetching of SDK surfaces.
         * `[✅]`   No hidden coupling to handler event payloads.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.interface.test.ts`
      * `[✅]`   Add contract tests for Anthropic embedding payload shapes:
         * `[✅]`   valid embedding vector response with numeric values.
         * `[✅]`   valid embedding usage payload.
         * `[✅]`   invalid embedding fixtures for missing vector and malformed usage fields.
      * `[✅]`   Preserve all current stream contract assertions.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.interface.ts`
      * `[✅]`   Add Anthropic embedding interfaces required by guards and adapter normalization:
         * `[✅]`   embedding vector item type.
         * `[✅]`   embedding response container type.
         * `[✅]`   embedding usage metadata type.
      * `[✅]`   Preserve existing stream-related interface types unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.interaction.spec`
      * `[✅]`   Define stream operation interactions:
         * `[✅]`   prepare Anthropic messages and caps.
         * `[✅]`   iterate stream deltas and emit `text_delta` chunks.
         * `[✅]`   emit `usage` then `done` with mapped stop reason.
      * `[✅]`   Define embedding operation interactions:
         * `[✅]`   resolve Anthropic model identifier from `anthropic-` API identifier.
         * `[✅]`   invoke Anthropic embedding API with request input.
         * `[✅]`   validate response embedding vector and usage metadata.
         * `[✅]`   normalize to `NodeEmbeddingResponse` with `completion_tokens` fixed to `0`.
      * `[✅]`   Failure modes:
         * `[✅]`   malformed embedding response throws explicit adapter error.
         * `[✅]`   missing/invalid usage metadata throws explicit adapter error.
         * `[✅]`   Anthropic SDK APIError is surfaced through normalized adapter error path.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.guard.test.ts`
      * `[✅]`   Add embedding guard tests:
         * `[✅]`   accept valid embedding response and usage.
         * `[✅]`   reject missing embedding vector.
         * `[✅]`   reject non-array embedding vector.
         * `[✅]`   reject non-number embedding vector elements.
         * `[✅]`   reject missing or malformed embedding usage metadata.
      * `[✅]`   Preserve existing stream guard coverage.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.guard.ts`
      * `[✅]`   Add runtime guards for Anthropic embedding response and usage metadata.
      * `[✅]`   Reuse existing plain-record validation style.
      * `[✅]`   Preserve existing stream guards unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.mock.ts`
      * `[✅]`   Add deterministic embedding fixtures and over-capable factories:
         * `[✅]`   success embedding response fixture.
         * `[✅]`   malformed embedding fixtures for negative tests.
      * `[✅]`   Extend adapter mock builder to optionally provide `getEmbedding` implementation.
      * `[✅]`   Preserve current stream mock behavior.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.test.ts`
      * `[✅]`   Add RED/GREEN unit tests for `getEmbedding`:
         * `[✅]`   invokes Anthropic embedding SDK call with resolved model and input.
         * `[✅]`   maps embedding response to `NodeEmbeddingResponse`.
         * `[✅]`   throws on malformed embedding payload.
         * `[✅]`   throws on missing/invalid embedding usage metadata.
         * `[✅]`   surfaces SDK embedding failures and normalized APIError path.
      * `[✅]`   Preserve all existing stream tests and assertions.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.ts`
      * `[✅]`   Implement `getEmbedding` on returned adapter object.
      * `[✅]`   Resolve embedding model name using existing Anthropic identifier normalization pattern.
      * `[✅]`   Call Anthropic embedding API, validate with new Anthropic embedding guards, and map to `NodeEmbeddingResponse`.
      * `[✅]`   Keep `sendMessageStream` behavior unchanged.
      * `[✅]`   Keep constructor and dependency injection shape unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.provides.ts`
      * `[✅]`   Export newly added embedding interfaces/guards/mock helpers.
      * `[✅]`   Preserve all existing exports consumed by tests and consumers.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/anthropic/anthropic.integration.test.ts`
      * `[✅]`   Add integration assertions covering provider -> selector -> adapter chain for Anthropic embedding path:
         * `[✅]`   register provider map entry with Anthropic factory.
         * `[✅]`   resolve adapter via selector boundary (`getNodeAiAdapter`) for Anthropic identifier.
         * `[✅]`   invoke embedding via returned `AiAdapter` and assert normalized `NodeEmbeddingResponse`.
         * `[✅]`   preserve and reassert current stream integration behavior in same file.
      * `[✅]`   Use mocks only for external SDK interactions.

   * `[✅]`   `construction`
      * `[✅]`   `createAnthropicNodeAdapter` returns fully constructed adapter object with stream and embedding methods.
      * `[✅]`   No partial construction path is introduced.
      * `[✅]`   Initialization order remains client construction before operation execution.

   * `[✅]`   `directionality`
      * `[✅]`   Node layer is provider adapter implementation.
      * `[✅]`   Dependencies remain inward-facing from shared contracts/helpers and Anthropic SDK.
      * `[✅]`   Outward API remains via Anthropic provides exports and `AiAdapter` contract.
      * `[✅]`   No selector or handler cycles are introduced.

   * `[✅]`   `requirements`
      * `[✅]`   Anthropic adapter exposes embedding capability through optional adapter contract.
      * `[✅]`   Anthropic embedding path is validated and normalized with deterministic error handling.
      * `[✅]`   Existing stream behavior remains unchanged and fully covered.
      * `[✅]`   Integration path verifies selector-resolved Anthropic embedding behavior with external SDK mocked.
      * `[✅]`   Node changes remain scoped to Anthropic source file and its support system.

* `[✅]`   netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.ts **[BE] Make selector operation-aware and enforce embedding capability compatibility**

   * `[✅]`   `objective`
      * `[✅]`   Solve selector ambiguity where provider prefix matching alone can return adapters that do not support the requested operation.
      * `[✅]`   Functional goals:
         * `[✅]`   Add explicit operation intent to selector params (`stream` or `embedding`).
         * `[✅]`   Preserve existing stream selection behavior for current workloads.
         * `[✅]`   Reject embedding selection when resolved adapter lacks embedding capability.
         * `[✅]`   Keep provider-prefix matching and factory invocation deterministic.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No regression in case-insensitive prefix matching.
         * `[✅]`   No silent fallback from embedding intent to stream-only adapters.
         * `[✅]`   No handler source edits in this node.
      * `[✅]`   Each goal is atomic and testable via selector contract, guard, unit, and integration tests.

   * `[✅]`   `role`
      * `[✅]`   Node role is adapter selector implementation plus immediate selector support system files.
      * `[✅]`   This role is correct because `getNodeAiAdapter.ts` composes provider adapters and is the runtime gate between handler intent and provider capability.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit provider adapter source files in this node.
         * `[✅]`   Do not edit `ai-stream-background.ts` workload routing in this node.
         * `[✅]`   Do not edit Supabase source files in this node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is selector composition under `netlify/functions/ai-stream-background/adapters`.
      * `[✅]`   Inside boundary:
         * `[✅]`   provider prefix resolution.
         * `[✅]`   factory invocation with model/user/api-key inputs.
         * `[✅]`   operation-capability validation for resolved adapter.
      * `[✅]`   Outside boundary:
         * `[✅]`   provider-specific request/response logic.
         * `[✅]`   workload mode parsing in handler.
         * `[✅]`   callback persistence.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `./ai-adapter.interface.ts`.
         * `[✅]`   Layer classification: shared adapter contract producer.
         * `[✅]`   Direction: consumed by selector implementation/guards/tests.
         * `[✅]`   Purpose: adapter shape and provider factory contracts.
      * `[✅]`   Provider: `./getNodeAiAdapter.interface.ts`.
         * `[✅]`   Layer classification: selector contract producer.
         * `[✅]`   Direction: consumed by selector implementation and tests.
         * `[✅]`   Purpose: selector params/deps with operation intent.
      * `[✅]`   Provider: `./getNodeAiAdapter.guard.ts`.
         * `[✅]`   Layer classification: selector runtime guard producer.
         * `[✅]`   Direction: consumed by selector implementation and tests.
         * `[✅]`   Purpose: validate params and adapter capabilities.
      * `[✅]`   Confirm:
         * `[✅]`   No reverse dependencies introduced.
         * `[✅]`   No lateral layer violations introduced.

   * `[✅]`   `context_slice`
      * `[✅]`   Minimal dependency interfaces required:
         * `[✅]`   provider map lookup by prefix.
         * `[✅]`   factory constructor payload.
         * `[✅]`   runtime capability check for embedding support.
      * `[✅]`   Injection shape remains `GetNodeAiAdapterDeps` and `GetNodeAiAdapterParams`.
      * `[✅]`   Confirm:
         * `[✅]`   No over-fetching of handler event fields.
         * `[✅]`   No hidden coupling to provider internals.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.interface.test.ts`
      * `[✅]`   Add contract tests for operation-aware selector params:
         * `[✅]`   valid params include `operation: 'stream'`.
         * `[✅]`   valid params include `operation: 'embedding'`.
         * `[✅]`   invalid params reject unknown operation value.
      * `[✅]`   Preserve current deps/model/user/api-key contract coverage.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.interface.ts`
      * `[✅]`   Add selector operation type:
         * `[✅]`   `NodeAdapterOperation = 'stream' | 'embedding'`
      * `[✅]`   Extend `GetNodeAiAdapterParams` with required `operation` field.
      * `[✅]`   Preserve selector return contract (`AiAdapter | null`).

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.interaction.spec`
      * `[✅]`   Define selector interaction semantics:
         * `[✅]`   normalize `apiIdentifier` to lowercase.
         * `[✅]`   resolve prefix match from provider map.
         * `[✅]`   instantiate candidate adapter from factory.
         * `[✅]`   gate adapter by requested operation capability.
      * `[✅]`   Failure modes:
         * `[✅]`   empty identifier returns `null`.
         * `[✅]`   unknown prefix returns `null`.
         * `[✅]`   embedding operation with stream-only adapter returns `null`.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.test.ts`
      * `[✅]`   Add guard coverage for operation-aware params and embedding capability:
         * `[✅]`   `isGetNodeAiAdapterParams` accepts `operation: 'stream'`.
         * `[✅]`   `isGetNodeAiAdapterParams` accepts `operation: 'embedding'`.
         * `[✅]`   `isGetNodeAiAdapterParams` rejects unknown operation.
         * `[✅]`   embedding-capability guard accepts adapter with function `getEmbedding`.
         * `[✅]`   embedding-capability guard rejects adapter without `getEmbedding`.
      * `[✅]`   Preserve existing provider map and stream chunk guard coverage.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.guard.ts`
      * `[✅]`   Add runtime guard for selector operation value.
      * `[✅]`   Add runtime guard that validates embedding capability (`getEmbedding` function presence).
      * `[✅]`   Keep current `isAiAdapter` semantics for stream path unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.mock.ts`
      * `[✅]`   Extend selector params mock factory with default `operation: 'stream'`.
      * `[✅]`   Add embedding-capable adapter mock helper.
      * `[✅]`   Add explicit stream-only adapter mock helper for negative embedding selection tests.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.test.ts`
      * `[✅]`   Add unit tests for operation-aware selection:
         * `[✅]`   stream selection resolves adapter for matching provider prefix.
         * `[✅]`   embedding selection resolves adapter when provider adapter has `getEmbedding`.
         * `[✅]`   embedding selection returns `null` when resolved adapter lacks `getEmbedding`.
         * `[✅]`   unknown prefix and empty identifier behavior remains unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.ts`
      * `[✅]`   Read `operation` from params.
      * `[✅]`   Preserve current lowercased prefix matching and factory call payload.
      * `[✅]`   Add operation capability gating:
         * `[✅]`   for `stream`, preserve existing acceptance behavior.
         * `[✅]`   for `embedding`, return `null` unless resolved adapter is embedding-capable.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.provides.ts`
      * `[✅]`   Export new selector operation type and embedding-capability guard.
      * `[✅]`   Preserve existing exports used by adapter consumers and tests.

   * `[✅]`   `netlify/functions/ai-stream-background/adapters/getNodeAiAdapter.integration.test.ts`
      * `[✅]`   Create selector integration test file to validate composed selector behavior:
         * `[✅]`   real provider-map entry + embedding-capable adapter resolves for embedding operation.
         * `[✅]`   real provider-map entry + stream-only adapter returns `null` for embedding operation.
         * `[✅]`   stream operation remains resolvable with existing provider map behavior.
      * `[✅]`   Use mocks only for external SDK interactions.

   * `[✅]`   `construction`
      * `[✅]`   Selector remains pure function over deps and params.
      * `[✅]`   No partial params accepted; operation is required.
      * `[✅]`   Initialization order remains normalize identifier -> prefix resolve -> factory call -> capability gate.

   * `[✅]`   `directionality`
      * `[✅]`   Node layer is adapter selection/composition.
      * `[✅]`   Dependencies remain inward-facing from shared contracts and guards.
      * `[✅]`   Output remains outward-facing `AiAdapter | null` boundary for handler consumers.
      * `[✅]`   No cycles introduced with provider adapter implementations.

   * `[✅]`   `requirements`
      * `[✅]`   Selector params include explicit operation intent.
      * `[✅]`   Stream selection remains backward-compatible.
      * `[✅]`   Embedding selection is capability-safe and does not silently degrade.
      * `[✅]`   Selector contract, guard, unit, and integration tests prove operation-aware behavior.
      * `[✅]`   Node scope remains limited to selector source file and its support system.

* `[✅]`   netlify/functions/ai-stream-background/ai-stream-background.ts **[BE] Add workload operation routing for stream and embedding paths with deterministic callback payload shaping**

   * `[✅]`   `objective`
      * `[✅]`   Solve handler single-mode execution where every workload is treated as streaming chat and cannot execute embedding jobs through the same queue worker.
      * `[✅]`   Functional goals:
         * `[✅]`   Extend workload event handling to include explicit operation mode selection.
         * `[✅]`   Route stream mode through existing chunk assembly behavior unchanged.
         * `[✅]`   Route embedding mode through adapter embedding call and build callback payload with embedding output semantics.
         * `[✅]`   Preserve saveResponse POST boundary and signature propagation.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Keep existing generation path behavior stable.
         * `[✅]`   Fail fast with deterministic `ErrorDoNotRetry` for unsupported operation or capability mismatch.
         * `[✅]`   No Supabase callback/schema source edits in this node.
      * `[✅]`   Each goal is atomic and testable via interface/guard/unit/integration coverage in this module.

   * `[✅]`   `role`
      * `[✅]`   Node role is workload orchestrator implementation and immediate support files for event/payload contracts, guards, mocks, tests, and provides.
      * `[✅]`   This role is correct because `ai-stream-background.ts` consumes selector output and publishes normalized callback payloads for downstream persistence.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit provider adapter source files in this node.
         * `[✅]`   Do not edit selector source logic in this node.
         * `[✅]`   Do not edit Supabase response handlers in this node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is Netlify async workload handler under `netlify/functions/ai-stream-background`.
      * `[✅]`   Inside boundary:
         * `[✅]`   environment dependency construction and API-key resolution.
         * `[✅]`   selector invocation with operation intent.
         * `[✅]`   mode-specific payload assembly and callback POST.
      * `[✅]`   Outside boundary:
         * `[✅]`   provider implementation internals.
         * `[✅]`   Supabase callback persistence decisions.
         * `[✅]`   queue enqueue event emission.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `./ai-stream-background.interface.ts`.
         * `[✅]`   Layer classification: local contract producer.
         * `[✅]`   Direction: consumed by handler and tests.
         * `[✅]`   Purpose: event/deps/payload shape with operation-aware fields.
      * `[✅]`   Provider: `./ai-stream-background.guard.ts`.
         * `[✅]`   Layer classification: local runtime validation producer.
         * `[✅]`   Direction: consumed by handler entrypoint and tests.
         * `[✅]`   Purpose: validate operation-aware incoming event and outgoing payload.
      * `[✅]`   Provider: `./adapters/getNodeAiAdapter.ts`.
         * `[✅]`   Layer classification: adapter selector producer.
         * `[✅]`   Direction: consumed by handler.
         * `[✅]`   Purpose: resolve provider adapter by identifier and requested operation.
      * `[✅]`   Provider: provider adapter factories (openai/anthropic/google).
         * `[✅]`   Layer classification: provider adapter producers.
         * `[✅]`   Direction: consumed by dependency factory map.
         * `[✅]`   Purpose: runtime adapter creation for stream and embedding operations.
      * `[✅]`   Confirm:
         * `[✅]`   No reverse dependencies introduced.
         * `[✅]`   No lateral layer violations introduced.

   * `[✅]`   `context_slice`
      * `[✅]`   Minimal dependency interfaces required:
         * `[✅]`   selector returns `AiAdapter | null` for requested operation.
         * `[✅]`   adapter stream and optional embedding calls.
         * `[✅]`   callback POST endpoint and auth key.
      * `[✅]`   Injection shape remains `AiStreamDeps` with provider map, save URL, and API-key resolver.
      * `[✅]`   Confirm:
         * `[✅]`   No over-fetching of event payload fields.
         * `[✅]`   No hidden coupling to Supabase database schema.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.interface.test.ts`
      * `[✅]`   Add contract tests for operation-aware event and payload semantics:
         * `[✅]`   stream event contract includes required mode marker and chat request fields.
         * `[✅]`   embedding event contract includes required mode marker and embedding input fields.
         * `[✅]`   payload contract covers stream output fields and embedding output fields without ambiguity.
      * `[✅]`   Preserve existing baseline event/payload contract assertions.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.interface.ts`
      * `[✅]`   Replace existing `AiStreamOperation`, `AiStreamEventBase`, `AiStreamChatEvent`, `AiStreamEmbeddingEvent`, `AiStreamEvent`, `AiStreamPayloadBase`, `AiStreamChatPayload`, `AiStreamEmbeddingPayload`, and `AiStreamPayload` with the `AiWorkload*` equivalents defined in the bullets below.
      * `[✅]`   Add `AiWorkloadOperation = 'stream' | 'embedding'` discriminator type.
      * `[✅]`   Add `AiWorkloadEventBase` with shared event fields: `job_id`, `api_identifier`, `model_config`, `sig`, `user_config`.
      * `[✅]`   Add `AiWorkloadStreamEvent extends AiWorkloadEventBase` with `operation: 'stream'` and `chat_api_request: NodeChatApiRequest`.
      * `[✅]`   Add `AiWorkloadEmbeddingEvent extends AiWorkloadEventBase` with `operation: 'embedding'` and `embedding_api_request: NodeEmbeddingRequest`.
      * `[✅]`   Define `AiWorkloadEvent = AiWorkloadStreamEvent | AiWorkloadEmbeddingEvent`.
      * `[✅]`   Add `AiWorkloadPayloadBase` with shared payload fields: `job_id`, `sig`.
      * `[✅]`   Add `AiWorkloadStreamPayload extends AiWorkloadPayloadBase` with `operation: 'stream'`, `assembled_content: string`, `token_usage: NodeTokenUsage | null`, `finish_reason: string | null`.
      * `[✅]`   Add `AiWorkloadEmbeddingPayload extends AiWorkloadPayloadBase` with `operation: 'embedding'`, `embedding: NodeEmbeddingVector`, `token_usage: NodeTokenUsage`.
      * `[✅]`   Define `AiWorkloadPayload = AiWorkloadStreamPayload | AiWorkloadEmbeddingPayload`.
      * `[✅]`   Keep `AiStreamDeps` and `GetApiKeyFn` shapes unchanged.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.interaction.spec`
      * `[✅]`   Define stream operation interactions:
         * `[✅]`   resolve adapter with stream operation.
         * `[✅]`   iterate stream chunks and assemble content/usage/done finish reason.
         * `[✅]`   post stream payload to saveResponse.
      * `[✅]`   Define embedding operation interactions:
         * `[✅]`   resolve adapter with embedding operation.
         * `[✅]`   call adapter embedding path.
         * `[✅]`   build embedding payload with normalized usage and no text assembly.
         * `[✅]`   post embedding payload to saveResponse.
      * `[✅]`   Failure modes:
         * `[✅]`   invalid event shape throws `ErrorDoNotRetry`.
         * `[✅]`   missing adapter or operation mismatch throws `ErrorDoNotRetry`.
         * `[✅]`   callback non-OK response throws retryable error.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.guard.test.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Add guard tests for operation-aware event and payload:
         * `[✅]`   accept valid stream event shape.
         * `[✅]`   accept valid embedding event shape.
         * `[✅]`   reject event missing operation discriminator.
         * `[✅]`   accept payload variants for stream and embedding outputs.
         * `[✅]`   reject payload with mixed/invalid operation output fields.
      * `[✅]`   Preserve existing deps and baseline payload guard coverage.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.guard.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Add runtime validation for new operation discriminator.
      * `[✅]`   Add operation-aware validation of required request fields.
      * `[✅]`   Add operation-aware payload guard validation.
      * `[✅]`   Preserve existing deps guard behavior.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.mock.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Extend event mock factory with operation-aware defaults and overs.
      * `[✅]`   Add embedding event fixtures and payload fixtures.
      * `[✅]`   Preserve existing stream mock fixtures and dependency factory helpers.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.test.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Add RED/GREEN unit tests for operation routing:
         * `[✅]`   stream operation uses selector stream mode and preserves existing stream POST payload behavior.
         * `[✅]`   embedding operation uses selector embedding mode and posts embedding payload variant.
         * `[✅]`   embedding mode with non-embedding-capable adapter fails deterministically.
         * `[✅]`   invalid operation/event shape fails with `ErrorDoNotRetry`.
      * `[✅]`   Preserve existing stream behavior assertions and environment-key failure tests.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Read operation discriminator from validated event.
      * `[✅]`   Pass operation intent into selector call.
      * `[✅]`   Branch execution:
         * `[✅]`   stream branch preserves current collect loop and payload fields.
         * `[✅]`   embedding branch invokes adapter embedding method and maps embedding output payload fields.
      * `[✅]`   Keep callback POST/auth boundary unchanged.
      * `[✅]`   Keep dependency factory wiring for providers unchanged except operation-aware selector call requirements.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.provides.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Export new operation-aware contract types and guard symbols.
      * `[✅]`   Preserve existing exports used by tests and consumers.

   * `[✅]`   `netlify/functions/ai-stream-background/ai-stream-background.integration.test.ts`
      * `[✅]`   Update all imports and type references from the renamed `AiStream*` event/payload types to the `AiWorkload*` equivalents.
      * `[✅]`   Extend integration coverage to operation-aware full chain:
         * `[✅]`   stream path: real deps factory -> selector -> provider adapter -> mocked SDK -> callback POST.
         * `[✅]`   embedding path: real deps factory -> selector -> provider adapter embedding call -> callback POST.
         * `[✅]`   verify posted payload variant matches operation.
      * `[✅]`   Use mocks only for external SDK and network boundaries.

   * `[✅]`   `construction`
      * `[✅]`   `createAiStreamDeps` remains explicit dependency factory with provider map, save URL, and API-key resolver.
      * `[✅]`   No partial construction path is introduced.
      * `[✅]`   Initialization order remains dependency creation -> event validation -> operation dispatch -> callback post.

   * `[✅]`   `directionality`
      * `[✅]`   Node layer is workload orchestration/adapter consumer.
      * `[✅]`   Dependencies remain inward-facing from selector/contracts/providers.
      * `[✅]`   Output remains outward-facing callback payload boundary.
      * `[✅]`   No cycles introduced with provider adapter modules.

   * `[✅]`   `requirements`
      * `[✅]`   Worker supports explicit stream and embedding operation routing.
      * `[✅]`   Stream behavior remains backward-compatible.
      * `[✅]`   Embedding behavior is capability-safe and produces deterministic callback payload.
      * `[✅]`   Unit and integration tests prove operation-aware routing and payload correctness.
      * `[✅]`   Node scope remains limited to worker source file and its support system.

   * `[✅]`   **Commit** `feat(ai-stream-background): add operation-aware adapter routing for stream and embedding workloads`
      * `[✅]`   Structural changes:
         * `[✅]`   Provider adapters (OpenAI, Google, Anthropic) include embedding-capable adapter contract support.
         * `[✅]`   Selector and worker contracts are operation-aware for stream vs embedding execution.
      * `[✅]`   Behavioral changes:
         * `[✅]`   Stream workloads preserve existing behavior.
         * `[✅]`   Embedding workloads route through provider adapters and produce deterministic callback payloads.
      * `[✅]`   Contract changes:
         * `[✅]`   Adapter, selector, and worker interface/guard layers include explicit operation and embedding payload semantics.

## WS-R — EMBED BECOMES FIRST-CLASS IN THE WORKER

* `[ ]`   supabase/functions/dialectic-worker/processEmbedJob/`processEmbedJob.ts` **[BE] Process an EMBED job by validating its payload and enqueuing the embedding workload to the Netlify background worker**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing EMBED job processor: after WS-0 adds `EMBED` to `dialectic_job_type_enum`, EMBED job rows inserted by `createEmbedJobs` (WS-S) arrive in the worker queue and hit `processJob`'s `default` throw case. The fix is `processEmbedJob`: a DI-compliant processor that receives the `DialecticEmbeddingJobPayload`, looks up the embedding provider row, and calls `enqueueModelCall` with `operation: 'embedding'` to dispatch the actual embedding work to the Netlify background worker.
    * `[ ]`   Functional goals:
      * `[ ]`   Accept a `DialecticJobRow` whose payload is a `DialecticEmbeddingJobPayload`; return a non-retriable error if the payload is invalid.
      * `[ ]`   Query `ai_providers` for the row identified by `payload.embedding_model_provider_id`; return a non-retriable error if no row is found.
      * `[ ]`   Compute `preflightInputTokens` by calling `deps.countTokens` on `payload.chunk_text`.
      * `[ ]`   Build an `EnqueueModelCallEmbeddingPayload` and call `deps.enqueueModelCall` with `output_type: FileType.EmbeddingChunk`.
      * `[ ]`   Return `{ queued: true }` on success or `{ error: Error; retriable: boolean }` on failure, mirroring `EnqueueModelCallReturn` semantics.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   Does NOT write to `dialectic_memory` (that is `saveResponse` — WS-B).
      * `[ ]`   Does NOT update the parent job status (that is `createEmbedJobs` caller — WS-D).
      * `[ ]`   Does NOT perform any text splitting (that is `createEmbedJobs` — WS-S).
      * `[ ]`   Payload validation failure and provider-not-found are non-retriable; errors from `enqueueModelCall` preserve the `retriable` flag from that return value.

  * `[ ]`   `role`
    * `[ ]`   Application worker node (`dialectic-worker`). Single responsibility: bridge the EMBED job row to the Netlify embedding worker via `enqueueModelCall`.
    * `[ ]`   This role is appropriate because `processEmbedJob` is the Supabase-side dispatch half of the async embedding pipeline: it enqueues work; the Netlify adapter executes it; `saveResponse` (WS-B) persists the result.
    * `[ ]`   Out of scope:
      * `[ ]`   Embedding computation (Netlify adapter — WS-A, already complete).
      * `[ ]`   Persisting the vector to `dialectic_memory` (`saveResponse` — WS-B).
      * `[ ]`   Creating EMBED child jobs (`createEmbedJobs` — WS-S).
      * `[ ]`   Pausing/resuming the parent job (`compressPrompt` — WS-D).
      * `[ ]`   Wiring `processEmbedJob` into `IJobProcessors` (`dialectic.interface.ts` s with `processJob.ts` — next WS-R node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `processEmbedJob/processEmbedJob.ts` and its full support system (interface, guard, mock, tests, provides). s: `_shared/types/file_manager.types.ts` (`FileType.EmbeddingChunk`, `EmbeddingOutputFileTypes`), `_shared/utils/type-guards/type_guards.file_manager.ts` (`isEmbeddingOutputFileType`), `_shared/utils/type-guards/type_guards.file_manager.test.ts`.
    * `[ ]`   Inside boundary: EMBED payload validation, provider row lookup, `enqueueModelCall` dispatch.
    * `[ ]`   Outside boundary: `IJobProcessors` interface (processJob.ts node); `dialectic.interface.ts` union extension (processJob.ts node); `isDialecticEmbeddingJobPayload` imported from `processEmbedJob.provides.ts` and used inside `isDialecticJobPayload` union check in `type_guards.dialectic.ts` (processJob.ts node — not re-exported from there); `DialecticJobPayload` union (processJob.ts node).

  * `[ ]`   `deps`
    * `[ ]`   `ILogger` (inward, `_shared/types.ts`) — structured logging. Provider: `IJobContext.logger` (composition root). Direction: inward (shared utility). No reverse dep.
    * `[ ]`   `BoundEnqueueModelCallFn` (inward, `enqueueModelCall/enqueueModelCall.interface.ts`) — pre-bound enqueue callable. Provider: composition root closure in `index.ts` (WS-S). Direction: inward (sibling worker function). No reverse dep.
    * `[ ]`   `CountTokensFn` (inward, `_shared/types/tokenizer.types.ts`) — token count for `preflightInputTokens`. Provider: `IJobContext.countTokens` (composition root). Direction: inward (shared utility). No reverse dep.
    * `[ ]`   `SupabaseClient<Database>` (inward, `npm:@supabase/supabase-js@2`) — `ai_providers` row lookup only. Direction: inward (infrastructure). No reverse dep.
    * `[ ]`   `UserConfig` (inward, `calculateAffordability/calculateAffordability.interface.ts`) — passed through to `EnqueueModelCallParams`; not read directly by this function. Direction: inward (shared type). No reverse dep.
    * `[ ]`   Confirm: no reverse dependency; `enqueueModelCall` does not import from this module; `IJobContext` is not extended here (that is WS-S).

  * `[ ]`   `context_slice`
    * `[ ]`   From `BoundEnqueueModelCallFn`: only the `(params, payload) => Promise<EnqueueModelCallReturn>` call surface. No dep fields accessed.
    * `[ ]`   From `SupabaseClient`: only `.from('ai_providers').select('*').eq('id', payload.embedding_model_provider_id).single()`.
    * `[ ]`   From `CountTokensFn`: only `countTokens(payload.chunk_text)` returning `number`.
    * `[ ]`   From `DialecticJobRow`: only `id`, `session_id`, `user_id`, `payload`.
    * `[ ]`   No over-fetching; no hidden coupling.

  * `[ ]`   `processEmbedJob.interface.test.ts`
    * `[ ]`   Valid `ProcessEmbedJobDeps`: `logger` conforms to `ILogger`; `enqueueModelCall` conforms to `BoundEnqueueModelCallFn`; `countTokens` conforms to `CountTokensFn`.
    * `[ ]`   Valid `ProcessEmbedJobParams`: `dbClient` is `SupabaseClient<Database>`; `job` is `DialecticJobRow`; `projectOwnerUserId` non-empty string; `authToken` non-empty string; `userConfig` has `tier_output_cap_tokens`.
    * `[ ]`   `ProcessEmbedJobSuccessReturn`: shape `{ queued: true }`.
    * `[ ]`   `ProcessEmbedJobErrorReturn`: shape `{ error: PostgrestError | Error; retriable: boolean }`.
    * `[ ]`   `DialecticEmbeddingJobPayload`: valid object has all required string/number fields with `job_type: 'EMBED'`.
    * `[ ]`   `DialecticEmbeddingJobPayload`: object with `job_type !== 'EMBED'` fails the contract invariant.

  * `[ ]`   `processEmbedJob.interface.ts`
    * `[ ]`   Import `BoundEnqueueModelCallFn`, `EnqueueModelCallParams`, `EnqueueModelCallReturn` from `'../enqueueModelCall/enqueueModelCall.interface.ts'`.
    * `[ ]`   Import `ILogger` from `'../../_shared/types.ts'`.
    * `[ ]`   Import `CountTokensFn` from `'../../_shared/types/tokenizer.types.ts'`.
    * `[ ]`   Import `SupabaseClient`, `PostgrestError` from `'npm:@supabase/supabase-js@2'`.
    * `[ ]`   Import `Database`, `Enums` from `'../../types_db.ts'`.
    * `[ ]`   Import `DialecticJobRow` from `'../../dialectic-service/dialectic.interface.ts'`.
    * `[ ]`   Import `UserConfig` from `'../calculateAffordability/calculateAffordability.interface.ts'`.
    * `[ ]`   `DialecticEmbeddingJobPayload` interface:
      ```
      export interface DialecticEmbeddingJobPayload {
        job_type: 'EMBED';
        chunk_text: string;
        source_type: Enums<'dialectic_memory_source_type_enum'>;
        source_id: string;
        wallet_id: string;
        chunk_index: number;
        embedding_model_provider_id: string;
      }
      ```
    * `[ ]`   `ProcessEmbedJobDeps` interface:
      ```
      export interface ProcessEmbedJobDeps {
        logger: ILogger;
        enqueueModelCall: BoundEnqueueModelCallFn;
        countTokens: CountTokensFn;
      }
      ```
    * `[ ]`   `ProcessEmbedJobParams` interface:
      ```
      export interface ProcessEmbedJobParams {
        dbClient: SupabaseClient<Database>;
        job: DialecticJobRow;
        projectOwnerUserId: string;
        authToken: string;
        userConfig: UserConfig;
      }
      ```
    * `[ ]`   `export interface ProcessEmbedJobSuccessReturn { queued: true; }`
    * `[ ]`   `export interface ProcessEmbedJobErrorReturn { error: PostgrestError | Error; retriable: boolean; }`
    * `[ ]`   `export type ProcessEmbedJobReturn = ProcessEmbedJobSuccessReturn | ProcessEmbedJobErrorReturn;`
    * `[ ]`   `export type ProcessEmbedJobFn = (deps: ProcessEmbedJobDeps, params: ProcessEmbedJobParams, payload: DialecticEmbeddingJobPayload) => Promise<ProcessEmbedJobReturn>;`

  * `[ ]`   `processEmbedJob.interaction.spec`
    * `[ ]`   Caller: `processJob.ts` dispatches to `processors.processEmbedJob(dbClient, job, projectOwnerUserId, ctx, authToken)` on `case 'EMBED'`. The wrapper (constructed in `index.ts` WS-S) calls `isDialecticEmbeddingJobPayload(job.payload)` — if false, returns `{ error: new Error('...'), retriable: false }` without calling `processEmbedJob`. When the guard passes, the wrapper calls `processEmbedJob(deps, params, job.payload)` and throws on `result.error`.
    * `[ ]`   Interaction with `SupabaseClient` (`ai_providers` lookup): `.from('ai_providers').select('*').eq('id', payload.embedding_model_provider_id).single()`. If `providerError` → `return { error: providerError, retriable: false }` — `providerError` passed through unchanged. If `!providerRow` (no error) → `return { error: new Error('No provider row found for id: ' + payload.embedding_model_provider_id), retriable: false }`.
    * `[ ]`   Interaction with `CountTokensFn`: called once with `payload.chunk_text`; result is `preflightInputTokens`.
    * `[ ]`   Interaction with `BoundEnqueueModelCallFn`: called once with `(enqueueParams, embedPayload)` where `enqueueParams.job = params.job`, `enqueueParams.providerRow = providerRow`, `enqueueParams.userAuthToken = params.authToken`, `enqueueParams.output_type = FileType.EmbeddingChunk` (`'embedding_chunk'`), `enqueueParams.userConfig = params.userConfig`; `embedPayload = { operation: 'embedding', embeddingApiRequest: { input: payload.chunk_text }, preflightInputTokens }`. Result is `EnqueueModelCallReturn` — returned verbatim.
    * `[ ]`   Ordering: provider lookup → token count → enqueue. Each step halts on error without proceeding.
    * `[ ]`   Failure modes:
      * `providerError` from Supabase: returned unchanged as `{ error: providerError, retriable: false }`.
      * `!providerRow` with no error: `{ error: new Error('...'), retriable: false }`.
      * `enqueueModelCall` returns `{ error, retriable }`: returned verbatim — `return result`.
    * `[ ]`   No side effects beyond the `enqueueModelCall` invocation (which sets job status to `'queued'` internally).

  * `[ ]`   `processEmbedJob.guard.test.ts` (RED before GREEN)
    * `[ ]`   `isDialecticEmbeddingJobPayload` accepts `{ job_type: 'EMBED', chunk_text: 'x', source_type: 'dialectic_contribution', source_id: 'abc', wallet_id: 'w', chunk_index: 0, embedding_model_provider_id: 'p' }`.
    * `[ ]`   Rejects: missing `job_type`; `job_type !== 'EMBED'`; missing `chunk_text`; non-string `chunk_text`; missing `source_type`; missing `source_id`; missing `wallet_id`; non-number `chunk_index`; missing `embedding_model_provider_id`; non-string `embedding_model_provider_id`.
    * `[ ]`   `isProcessEmbedJobDeps` accepts valid deps object; rejects missing `logger`; rejects missing `enqueueModelCall`.
    * `[ ]`   `isProcessEmbedJobParams` accepts valid params object; rejects missing `dbClient`; rejects missing `job`; rejects missing `authToken`.
    * `[ ]`   Do NOT re-test: `EnqueueModelCallReturn` guards (own module); `ILogger` shape (not this boundary).

  * `[ ]`   `processEmbedJob.guard.ts`
    * `[ ]`   `isDialecticEmbeddingJobPayload(value: unknown): value is DialecticEmbeddingJobPayload` — checks `isRecord(value)`, `value.job_type === 'EMBED'`, `typeof value.chunk_text === 'string'`, `typeof value.source_type === 'string'`, `typeof value.source_id === 'string'`, `typeof value.wallet_id === 'string'`, `typeof value.chunk_index === 'number'`, `typeof value.embedding_model_provider_id === 'string'`.
    * `[ ]`   `isProcessEmbedJobDeps(value: unknown): value is ProcessEmbedJobDeps` — checks `isRecord(value)`, `typeof value.logger === 'object' && value.logger !== null`, `typeof value.enqueueModelCall === 'function'`, `typeof value.countTokens === 'function'`.
    * `[ ]`   `isProcessEmbedJobParams(value: unknown): value is ProcessEmbedJobParams` — checks `isRecord(value)`, `typeof value.dbClient === 'object' && value.dbClient !== null`, `typeof value.job === 'object' && value.job !== null`, `typeof value.projectOwnerUserId === 'string'`, `typeof value.authToken === 'string'`.

  * `[ ]`   `_shared/types/file_manager.types.ts` (type addition s with first consumer — this node)
    * `[ ]`   Add `EmbeddingChunk = 'embedding_chunk'` to `FileType` enum, after the last existing member.

  * `[ ]`   `_shared/utils/type-guards/type_guards.file_manager.test.ts` (guard test — RED before GREEN)
    * `[ ]`   Add `isEmbeddingOutputFileType` test block: accepts `'embedding_chunk'`; rejects any other string (e.g. `'synthesis'`); rejects non-string (e.g. `42`, `null`).
    * `[ ]`   Do NOT re-test `isModelContributionFileType` or any other existing guard.

  * `[ ]`   `_shared/utils/type-guards/type_guards.file_manager.ts` (guard)
    * `[ ]`   `FileType` is already imported; no new import required.
    * `[ ]`   Add `export function isEmbeddingOutputFileType(value: unknown): value is FileType.EmbeddingChunk { return value === FileType.EmbeddingChunk; }` after `isModelContributionFileType`.

  * `[ ]`   `processEmbedJob.mock.ts`
    * `[ ]`   `createMockProcessEmbedJobDeps(overs?: Partial<ProcessEmbedJobDeps>): ProcessEmbedJobDeps` — returns `{ logger: createMockLogger(), enqueueModelCall: vi.fn().mockResolvedValue({ queued: true }), countTokens: vi.fn().mockReturnValue(10), ...overs }`.
    * `[ ]`   `createMockProcessEmbedJobParams(overs?: Partial<ProcessEmbedJobParams>): ProcessEmbedJobParams` — returns params with a stub `dbClient` (mock Supabase client), a `job` row with `job_type: 'EMBED'` and valid `DialecticEmbeddingJobPayload` as payload, valid `projectOwnerUserId`, `authToken`, `userConfig`.
    * `[ ]`   `createMockDialecticEmbeddingJobPayload(overs?: Partial<DialecticEmbeddingJobPayload>): DialecticEmbeddingJobPayload` — returns `{ job_type: 'EMBED', chunk_text: 'test chunk', source_type: 'dialectic_contribution', source_id: 'src-uuid', wallet_id: 'wallet-uuid', chunk_index: 0, embedding_model_provider_id: 'provider-uuid', ...overs }`.
    * `[ ]`   `createMockProcessEmbedJobFn(result?: ProcessEmbedJobReturn): ProcessEmbedJobFn` — returns `vi.fn().mockResolvedValue(result ?? { queued: true })`.
    * `[ ]`   No new behavior beyond interface conformance.

  * `[ ]`   `processEmbedJob.test.ts` (RED before GREEN)
    * `[ ]`   All tests call `processEmbedJob(deps, params, payload)` with a pre-constructed `DialecticEmbeddingJobPayload` as the third argument. Guard validation is the wrapper's responsibility — not tested here.
    * `[ ]`   **Happy path — provider found, enqueue succeeds**: mock DB `ai_providers` single() returns a valid row; mock `enqueueModelCall` resolves `{ queued: true }`. Assert result is `{ queued: true }`. Assert `enqueueModelCall` called once with `params.output_type === FileType.EmbeddingChunk`, `embedPayload.operation === 'embedding'`, `embedPayload.embeddingApiRequest.input === payload.chunk_text`.
    * `[ ]`   **Provider DB error — error returned unchanged**: DB client `ai_providers` single() returns `{ data: null, error: postgrestError }` where `postgrestError` is a specific mock `PostgrestError`. Assert `result.error === postgrestError` (same object reference — not rewritten).
    * `[ ]`   **Provider row null, no DB error**: DB client returns `{ data: null, error: null }`. Assert result is `{ error: Error, retriable: false }`. Assert `enqueueModelCall` NOT called.
    * `[ ]`   **enqueueModelCall returns retriable error — returned unchanged**: `enqueueModelCall` returns `errorReturn = { error: new Error('queue unavailable'), retriable: true }`. Assert `result === errorReturn` (same object reference — not rewritten).
    * `[ ]`   **enqueueModelCall returns non-retriable error — returned unchanged**: `enqueueModelCall` returns `errorReturn = { error: new Error('bad payload'), retriable: false }`. Assert `result === errorReturn` (same object reference).
    * `[ ]`   **preflightInputTokens threaded correctly**: mock `countTokens` returns `42`. Assert `enqueueModelCall` called with `embedPayload.preflightInputTokens === 42`.
    * `[ ]`   Do NOT re-test: `isDialecticEmbeddingJobPayload` guard correctness (processEmbedJob.guard.test.ts); `enqueueModelCall` behavior internals.

  * `[ ]`   `construction`
    * `[ ]`   `processEmbedJob` is a plain `async function` with no class or constructor.
    * `[ ]`   Created by: the `index.ts` composition root (WS-S) constructs a wrapper that calls `isDialecticEmbeddingJobPayload(job.payload)`, and on success calls `processEmbedJob(deps, params, job.payload)`. The wrapper supplies `ProcessEmbedJobDeps` from the worker deps bundle.
    * `[ ]`   No partially constructed state. All deps in `ProcessEmbedJobDeps` are required at call time; all runtime data in `ProcessEmbedJobParams` and the typed `payload` argument.
    * `[ ]`   Invalid construction: the wrapper must supply all three of `logger`, `enqueueModelCall`, and `countTokens`; omitting any one fails the `isProcessEmbedJobDeps` guard in the wrapper before `processEmbedJob` is called.

  * `[ ]`   `processEmbedJob.ts` (implementation)
    * `[ ]`   Import `ProcessEmbedJobDeps`, `ProcessEmbedJobParams`, `ProcessEmbedJobReturn`, `DialecticEmbeddingJobPayload` from `'./processEmbedJob.interface.ts'`.
    * `[ ]`   Import `FileType` from `'../../_shared/types/file_manager.types.ts'`.
    * `[ ]`   Import `EnqueueModelCallEmbeddingPayload`, `EnqueueModelCallParams` from `'../enqueueModelCall/enqueueModelCall.interface.ts'`.
    * `[ ]`   Implement `export async function processEmbedJob(deps: ProcessEmbedJobDeps, params: ProcessEmbedJobParams, payload: DialecticEmbeddingJobPayload): Promise<ProcessEmbedJobReturn>`.
    * `[ ]`   Step 1: `const { data: providerRow, error: providerError } = await params.dbClient.from('ai_providers').select('*').eq('id', payload.embedding_model_provider_id).single();` If `providerError` → `return { error: providerError, retriable: false };` If `!providerRow` → `return { error: new Error('No provider row found for id: ' + payload.embedding_model_provider_id), retriable: false };`
    * `[ ]`   Step 2: `const preflightInputTokens = deps.countTokens(payload.chunk_text);`
    * `[ ]`   Step 3: `const enqueueParams: EnqueueModelCallParams = { dbClient: params.dbClient, job: params.job, providerRow, userAuthToken: params.authToken, output_type: FileType.EmbeddingChunk, userConfig: params.userConfig };`
    * `[ ]`   Step 4: `const embedPayload: EnqueueModelCallEmbeddingPayload = { operation: 'embedding', embeddingApiRequest: { input: payload.chunk_text }, preflightInputTokens };`
    * `[ ]`   Step 5: `return await deps.enqueueModelCall(enqueueParams, embedPayload);`
    * `[ ]`   No `any` types. No casts. No undeclared deps. Each code path maps to a test.

  * `[ ]`   `processEmbedJob.provides.ts`
    * `[ ]`   `export { processEmbedJob } from './processEmbedJob.ts'`
    * `[ ]`   `export type { ProcessEmbedJobFn, ProcessEmbedJobDeps, ProcessEmbedJobParams, ProcessEmbedJobReturn, ProcessEmbedJobSuccessReturn, ProcessEmbedJobErrorReturn, DialecticEmbeddingJobPayload } from './processEmbedJob.interface.ts'`
    * `[ ]`   `export { isDialecticEmbeddingJobPayload, isProcessEmbedJobDeps, isProcessEmbedJobParams } from './processEmbedJob.guard.ts'`
    * `[ ]`   Stability: internal worker function; not exported from the Deno function entry point.

  * `[ ]`   `processEmbedJob.integration.test.ts`
    * `[ ]`   Integration boundary: real `isDialecticEmbeddingJobPayload` guard + real `processEmbedJob` + real `enqueueModelCall` + real `countTokens` → mock `fetch` (external HTTP boundary to Netlify queue) + mock `dbClient` (external Supabase boundary). No internal functions mocked.
    * `[ ]`   Test — valid job, full real chain: construct a `DialecticJobRow` with a valid `DialecticEmbeddingJobPayload` using `createMockDialecticEmbeddingJobPayload()`. Mock `fetch` to return a 200 response. Mock `dbClient` `ai_providers` lookup to return a valid provider row; mock `dbClient` job-status update to succeed. Call `isDialecticEmbeddingJobPayload(job.payload)` — assert true. Call `processEmbedJob(realDeps, params, job.payload)` where `realDeps.enqueueModelCall` is the real `enqueueModelCall` bound with real deps (except `fetch` and `dbClient` mocked). Assert result is `{ queued: true }`. Capture the body passed to mock `fetch` and assert: `parsedBody.data.operation === 'embedding'`, `parsedBody.data.embedding_api_request.input === payload.chunk_text`, `parsedBody.data.job_id === job.id`.
    * `[ ]`   Confirms: the full real internal call chain — guard validates, processEmbedJob assembles params, enqueueModelCall signs and posts — is correct end-to-end with only true external boundaries (HTTP, DB) mocked.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (`dialectic-worker`). Deps are inward (`BoundEnqueueModelCallFn` from sibling worker module, `ILogger`/`CountTokensFn` from shared, `SupabaseClient` from infrastructure, `DialecticJobRow` from `dialectic-service`). Provides outward: `ProcessEmbedJobReturn` to the wrapper in `index.ts`.
    * `[ ]`   No cycles: `processEmbedJob` does not import from `processJob`, `createEmbedJobs`, `saveResponse`, or `compressPrompt`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Called with a valid `DialecticEmbeddingJobPayload` and mock `enqueueModelCall` resolving `{ queued: true }`: returns `{ queued: true }`.
    * `[ ]`   Called with valid payload and Supabase returning `providerError`: returns `{ error: providerError, retriable: false }` — `providerError` is the exact same object, not rewritten.
    * `[ ]`   Called with valid payload and `!providerRow` (no DB error): returns `{ error: Error, retriable: false }` without calling `enqueueModelCall`.
    * `[ ]`   Called with valid payload and `enqueueModelCall` returning `errorReturn = { error, retriable: true }`: returns `errorReturn` — same object, not rewritten.
    * `[ ]`   `isDialecticEmbeddingJobPayload` is exported from `processEmbedJob.guard.ts` and from `processEmbedJob.provides.ts`.
    * `[ ]`   `FileType.EmbeddingChunk === 'embedding_chunk'` compiles and evaluates correctly after this node.
    * `[ ]`   `isEmbeddingOutputFileType('embedding_chunk')` returns `true`; any other value returns `false`.
    * `[ ]`   `enqueueModelCall` is called with `output_type: FileType.EmbeddingChunk` (`'embedding_chunk'`), `payload.operation === 'embedding'`, `payload.embeddingApiRequest.input === payload.chunk_text`, `payload.preflightInputTokens` equal to result of `countTokens(payload.chunk_text)`.

* `[ ]`   supabase/functions/dialectic-worker/`processJob.ts` **[BE] Add EMBED dispatch case; extend `dialectic.interface.ts` + `type_guards.dialectic.ts` to wire EMBED as a first-class routable job type**

  * `[ ]`   `objective`
    * `[ ]`   After WS-0 adds `'EMBED'` to `dialectic_job_type_enum`, EMBED rows reach `processJob`'s `switch (job.job_type)` and fall through to the `default` case, throwing `"Unsupported or null job_type"`. This node adds the `EMBED` dispatch case and extends every contract that must understand the new type in a single, atomic touch.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `case 'EMBED':` to the switch in `processJob.ts`, dispatching to `processors.processEmbedJob(dbClient, job, projectOwnerUserId, ctx, authToken)`.
      * `[ ]`   Extend `JobType` union and `JobTypes` const in `dialectic.interface.ts` to include `"EMBED"`.
      * `[ ]`   Extend `DialecticJobPayload` union in `dialectic.interface.ts` to include `DialecticEmbeddingJobPayload` (imported from `processEmbedJob.interface.ts`).
      * `[ ]`   Add `processEmbedJob: ProcessEmbedJobFn` to `IJobProcessors` in `dialectic.interface.ts` (imports `ProcessEmbedJobFn` from `processEmbedJob.interface.ts`).
      * `[ ]`   Add `isDialecticEmbeddingJobPayload` guard to `type_guards.dialectic.ts` + update `isDialecticJobPayload` to include the new branch + update `type_guards.ts` barrel re-export.
      * `[ ]`   Update `_JobProcessorsDummyImpl`, `MockJobProcessorsSpies`, and `createMockJobProcessors` in `dialectic.mock.ts` to satisfy the updated `IJobProcessors` contract.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No existing dispatch cases (EXECUTE, PLAN, RENDER) are touched.
      * `[ ]`   `dialectic.interface.ts` is touched exactly once across all workstreams — this node is that single touch.
      * `[ ]`   `type_guards.dialectic.ts` is touched exactly once across all workstreams — this node is that single touch.
      * `[ ]`   `dialectic.mock.ts` is touched exactly once — this node is that single touch.

  * `[ ]`   `role`
    * `[ ]`   Router node. Single responsibility: dispatch each `job_type` to the correct processor via the `IJobProcessors` interface. No business logic.
    * `[ ]`   This node also carries the shared-contract layer changes (`dialectic.interface.ts`, `type_guards.dialectic.ts`, `dialectic.mock.ts`) because `processJob.ts` is the first implementation consumer of `IJobProcessors.processEmbedJob` after `processEmbedJob.ts` is defined in the prior node.
    * `[ ]`   Out of scope: real EMBED embedding logic (`processEmbedJob.ts` — prior node); `index.ts` factory wiring (WS-S); `buildJobProgressDtos.ts` EMBED loop guard (own later node — contains NO interface changes after this node lands).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `processJob.ts`, `processJob.test.ts`. Shared-contract changes ride here: `dialectic.interface.ts`, `type_guards.dialectic.ts` + its test, `type_guards.ts` barrel, `dialectic.mock.ts`.
    * `[ ]`   Inside boundary: the `switch` body in `processJob.ts`; `JobType`, `JobTypes`, `DialecticJobPayload` union, `IJobProcessors` in `dialectic.interface.ts`; `isDialecticEmbeddingJobPayload` + `isDialecticJobPayload` in `type_guards.dialectic.ts`; `_JobProcessorsDummyImpl` / `MockJobProcessorsSpies` / `createMockJobProcessors` in `dialectic.mock.ts`.
    * `[ ]`   Outside boundary: `processEmbedJob.interface.ts` (prior node — source of `ProcessEmbedJobFn` and `DialecticEmbeddingJobPayload`); `index.ts` (WS-S); `buildJobProgressDtos.ts` (later node — only adds a loop guard, no interface changes).

  * `[ ]`   `deps`
    * `[ ]`   `ProcessEmbedJobFn` (inward, `processEmbedJob.interface.ts` — prior node) — function type for the EMBED processor; imported by `dialectic.interface.ts` in this node. No reverse dep.
    * `[ ]`   `DialecticEmbeddingJobPayload` (inward, `processEmbedJob.interface.ts` — prior node) — payload shape for EMBED job rows; imported into `dialectic.interface.ts` union extension in this node. No reverse dep.
    * `[ ]`   `IJobProcessors` (inward, `dialectic.interface.ts` — extended in this node) — consumed by `processJob`'s `processors` parameter and by `_JobProcessorsDummyImpl` in `dialectic.mock.ts`.
    * `[ ]`   `IJobContext` (inward, `JobContext.interface.ts`) — already imported in `processJob.ts`; passed as `ctx` to `processEmbedJob`.
    * `[ ]`   Confirm: no reverse dependency from `processJob.ts` into `processEmbedJob.ts`; `processJob` dispatches via the `IJobProcessors` interface only, not the concrete implementation. No lateral layer violations.

  * `[ ]`   `context_slice`
    * `[ ]`   From `processEmbedJob.interface.ts`: only `ProcessEmbedJobFn` type and `DialecticEmbeddingJobPayload` interface — nothing else imported.
    * `[ ]`   From `IJobContext`: only the type itself (already imported in `processJob.ts`); no new fields accessed in the EMBED case.
    * `[ ]`   No over-fetching; no hidden coupling to `processEmbedJob`'s implementation.

  * `[ ]`   `_shared/utils/type-guards/type_guards.dialectic.test.ts` (guard test — RED before GREEN)
    * `[ ]`   **Add** `isDialecticEmbeddingJobPayload` guard tests:
      * `[ ]`   Accepts a fully-valid payload: `{ job_type: 'EMBED', chunk_text: 'x', source_type: 'dialectic_contribution', source_id: 'abc', wallet_id: 'w', chunk_index: 0, embedding_model_provider_id: 'p' }`.
      * `[ ]`   Rejects missing `job_type`.
      * `[ ]`   Rejects `job_type !== 'EMBED'` (e.g. `'EXECUTE'`).
      * `[ ]`   Rejects missing `chunk_text`.
      * `[ ]`   Rejects non-number `chunk_index` (e.g. string `'0'`).
      * `[ ]`   Rejects missing `embedding_model_provider_id`.
    * `[ ]`   **Add** `isDialecticJobPayload` regression test: a payload with `job_type: 'EMBED'` and all required fields is accepted by `isDialecticJobPayload`.
    * `[ ]`   Do NOT re-test existing PLAN/EXECUTE/RENDER payload guard coverage.

  * `[ ]`   `_shared/utils/type-guards/type_guards.dialectic.ts` (guard)
    * `[ ]`   Add `isDialecticEmbeddingJobPayload(payload: unknown): payload is DialecticEmbeddingJobPayload`. Checks: `isRecord(payload)`, `payload.job_type === 'EMBED'`, `typeof payload.chunk_text === 'string'`, `typeof payload.source_type === 'string'`, `typeof payload.source_id === 'string'`, `typeof payload.wallet_id === 'string'`, `typeof payload.chunk_index === 'number'`, `typeof payload.embedding_model_provider_id === 'string'`.
    * `[ ]`   Update `isDialecticJobPayload`: append `|| isDialecticEmbeddingJobPayload(payload)` to the union check.
    * `[ ]`   No other changes.

  * `[ ]`   `_shared/utils/type_guards.ts` (barrel)
    * `[ ]`   Add `isDialecticEmbeddingJobPayload` to the re-export list from `./type-guards/type_guards.dialectic.ts`.

  * `[ ]`   `dialectic-service/dialectic.interface.ts` (all changes land here — single touch)
    * `[ ]`   Add import: `import { ProcessEmbedJobFn, DialecticEmbeddingJobPayload } from '../dialectic-worker/processEmbedJob/processEmbedJob.interface.ts';`
    * `[ ]`   Line ~129: change `export type JobType = "PLAN" | "EXECUTE" | "RENDER";` → `export type JobType = "PLAN" | "EXECUTE" | "RENDER" | "EMBED";`
    * `[ ]`   Line ~130: change `export const JobTypes: readonly JobType[] = ["PLAN", "EXECUTE", "RENDER"];` → `export const JobTypes: readonly JobType[] = ["PLAN", "EXECUTE", "RENDER", "EMBED"];`
    * `[ ]`   Extend `DialecticJobPayload` union: append `| DialecticEmbeddingJobPayload`.
    * `[ ]`   In `IJobProcessors` (~line 114): add `processEmbedJob: ProcessEmbedJobFn;` after `processRenderJob`.
    * `[ ]`   No other changes to `dialectic.interface.ts`.

  * `[ ]`   `dialectic-service/dialectic.mock.ts` (test infrastructure — must satisfy updated `IJobProcessors`)
    * `[ ]`   In `_JobProcessorsDummyImpl`: add `processEmbedJob = async (..._args: Parameters<ProcessEmbedJobFn>): Promise<void> => { /* dummy */ }` after `processRenderJob`.
    * `[ ]`   In `MockJobProcessorsSpies` type: add `processEmbedJob: Spy<...>` entry following the pattern of `processRenderJob`.
    * `[ ]`   In `createMockJobProcessors`: add `processEmbedJob: spy(dummyInstance, "processEmbedJob")` to the `spies` object.
    * `[ ]`   No other changes.

  * `[ ]`   `processJob.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Add** a new `Deno.test`: `'processJob - EMBED job routes to processEmbedJob'`. Follow the pattern of existing EXECUTE/PLAN tests: construct a `mockJob` with `job_type: 'EMBED'` and a valid `DialecticEmbeddingJobPayload`, call `processJob`, assert `spies.processEmbedJob.calls.length === 1`, assert `spies.processSimpleJob.calls.length === 0`, assert `spies.processComplexJob.calls.length === 0`.
    * `[ ]`   Do NOT re-test: EXECUTE dispatch; PLAN dispatch; RENDER dispatch; the `default` throw path.

  * `[ ]`   `construction`
    * `[ ]`   `processJob` is a plain `async function`. No construction concerns.

  * `[ ]`   `processJob.ts` (implementation)
    * `[ ]`   Before the `default:` case in the switch (line ~69), add:
      ```typescript
      case 'EMBED': {
        ctx.logger.info(`[dialectic-worker] [processJob] Delegating 'embed' job ${jobId} to embed processor.`);
        await processors.processEmbedJob(dbClient, job, projectOwnerUserId, ctx, authToken);
        return;
      }
      ```
    * `[ ]`   No other changes to `processJob.ts`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker router (`dialectic-worker`). Deps are inward (DB client, job row types, processor interface, job context); provides outward (dispatched call to each processor).
    * `[ ]`   No new dependency cycles. `processJob.ts` imports from `processEmbedJob.interface.ts` (prior node) via `dialectic.interface.ts` — direction is inward-to-consumer, standard.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `processJob` called with `job.job_type === 'EMBED'`: `processors.processEmbedJob` is called exactly once; `processSimpleJob` and `processComplexJob` are not called.
    * `[ ]`   `processJob` called with `job.job_type === 'EXECUTE'`: existing behavior unchanged.
    * `[ ]`   `JobType` includes `"EMBED"` — `JobTypes` const includes `"EMBED"`.
    * `[ ]`   `IJobProcessors` includes `processEmbedJob: ProcessEmbedJobFn` — `_JobProcessorsDummyImpl implements IJobProcessors` compiles without error.
    * `[ ]`   `isDialecticEmbeddingJobPayload` returns `true` for a valid EMBED payload; returns `false` for any other value.
    * `[ ]`   `isDialecticJobPayload` returns `true` for a valid EMBED payload.
    * `[ ]`   `dialectic.interface.ts` is touched exactly once across all workstreams; no downstream node touches it again.

* `[ ]`   supabase/functions/_shared/prompt-assembler/`assembleContinuationPrompt.ts` **[BE] Guard against EMBED jobs reaching the LLM continuation assembler**

  * `[ ]`   `objective`
    * `[ ]`   `assembleContinuationPrompt` assembles a multi-part LLM continuation prompt. It has no logic for EMBED jobs, which write vector embeddings to `dialectic_memory` rather than generating text continuations. After WS-0 adds EMBED to `dialectic_job_type_enum`, an EMBED job could reach this function if `processJob.ts` dispatch is misconfigured. The function must return an empty `AssembledPrompt` immediately — before any DB access, session check, or payload check — so no side-effectful assembly work is attempted.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `if (job.job_type === 'EMBED') { return { promptContent: '', source_prompt_resource_id: '' }; }` as the very first statement in the function body, before the existing `if (!session.selected_model_ids ...)` check (~line 37).
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No DB calls, no storage calls, no payload inspection when `job_type === 'EMBED'`.
      * `[ ]`   No change to any logic below the new guard.
      * `[ ]`   No interface changes — `DialecticJobRow` already includes `'EMBED'` after WS-0; the comparison is type-safe with no new imports.

  * `[ ]`   `role`
    * `[ ]`   Defensive early-return guard. Single responsibility of this change: return an empty `AssembledPrompt` when an EMBED job arrives, before any assembly side-effects.
    * `[ ]`   Out of scope: `processJob.ts` EMBED dispatch routing (own prior node — the correct fix that prevents EMBED reaching here at all); `buildJobProgressDtos.ts` and `deriveStepStatuses.ts` exclusions (own prior nodes); changes to `gatherContinuationInputs` or `assembleChunks`.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `assembleContinuationPrompt.ts` and `assembleContinuationPrompt.test.ts`.
    * `[ ]`   Inside boundary: the first line of the function body.
    * `[ ]`   Outside boundary: `prompt-assembler.interface.ts` (not modified — `AssembledPrompt` type is already `{ promptContent: string; source_prompt_resource_id: string; messages?: Messages[] }`); callers of this function (not modified); `processJob.ts` (own prior node).

  * `[ ]`   `deps`
    * `[ ]`   `DialecticJobRow` (inward, via `AssembleContinuationPromptDeps.job`, destructured at function entry) — `job_type` field is the DB-derived union; `=== 'EMBED'` comparison is type-safe after WS-0. No new import.
    * `[ ]`   `AssembledPrompt` (inward, `prompt-assembler.interface.ts`, already imported) — the return type; empty value is `{ promptContent: '', source_prompt_resource_id: '' }`. No new import.
    * `[ ]`   Confirm: no reverse dependency; callers of `assembleContinuationPrompt` are not touched.

  * `[ ]`   `context_slice`
    * `[ ]`   Only `job.job_type` is read by the guard — already destructured from `AssembleContinuationPromptDeps` at the function's parameter destructuring.
    * `[ ]`   No new imports; no hidden coupling.

  * `[ ]`   `assembleContinuationPrompt.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Add** new `t.step` inside `Deno.test("assembleContinuationPrompt", async (t) => {` within "Category D: Universal Error Handling and Preconditions": `"D.x: returns empty AssembledPrompt immediately for EMBED job without any DB calls or assembly logic"`.
      * `[ ]`   Construct a mock job using the existing `createMockJob` helper with `job_type: 'EMBED'` (valid for `DialecticJobRow["job_type"]` after WS-0). Set `id: 'job-embed-guard'`.
      * `[ ]`   Construct minimal deps using the existing `setup({})` helper with an empty `genericMockResults` config (no DB responses needed — no DB calls should occur).
      * `[ ]`   Call `assembleContinuationPrompt` with the EMBED job and the minimal deps.
      * `[ ]`   Assert `result.promptContent === ''`.
      * `[ ]`   Assert `result.source_prompt_resource_id === ''`.
      * `[ ]`   Assert that `client.from` was NOT called (spy call count === 0) — no DB access occurred before the early return.
    * `[ ]`   Do NOT re-test: `target_contribution_id` missing (existing D.1 coverage); any continuation-assembly logic; `session.selected_model_ids` check.

  * `[ ]`   `construction`
    * `[ ]`   `assembleContinuationPrompt` is a plain `async function`. No construction concerns.

  * `[ ]`   `assembleContinuationPrompt.ts` (implementation)
    * `[ ]`   After the opening brace of the function body, as the first statement (immediately before the existing `if (!session.selected_model_ids || session.selected_model_ids.length === 0) {` check on ~line 37), add:
      ```typescript
      if (job.job_type === 'EMBED') {
        return { promptContent: '', source_prompt_resource_id: '' };
      }
      ```
    * `[ ]`   No other changes to the function body.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared utility (`_shared/prompt-assembler`). Deps are inward (DB row types, storage); provides outward (`AssembledPrompt` to callers in `dialectic-worker`).
    * `[ ]`   No new dependencies introduced; no cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `assembleContinuationPrompt` called with `job.job_type === 'EMBED'`: returns `{ promptContent: '', source_prompt_resource_id: '' }` without any DB calls or errors.
    * `[ ]`   `assembleContinuationPrompt` called with `job.job_type === 'EXECUTE'`: existing behavior unchanged; all existing tests pass.
    * `[ ]`   `assembleContinuationPrompt` called with `job.job_type === 'PLAN'`: existing behavior unchanged; all existing tests pass.

* `[ ]`   supabase/functions/dialectic-service/`deriveStepStatuses.ts` **[BE] Exclude EMBED jobs from step-status derivation so infrastructure embedding rows do not corrupt recipe-step progress counts**

  * `[ ]`   `objective`
    * `[ ]`   Solve the EMBED contamination defect: after WS-0 adds EMBED to `dialectic_job_type_enum`, EMBED rows appear in `dialectic_generation_jobs`. `deriveStepStatuses` iterates every job in `params.jobs` and attempts to extract `planner_metadata.recipe_step_id`. EMBED rows carry no such metadata and exit through the `recipeStepId === undefined` continue guard silently today — but the RENDER exclusion pattern establishes the convention that infrastructure job types are explicitly guarded before the metadata extraction path. Adding an explicit EMBED guard mirrors that pattern and makes the intent unambiguous to future maintainers.
    * `[ ]`   Functional goals:
      * `[ ]`   After the existing `if (job.job_type === "RENDER") continue;` guard (line 57), add `if (job.job_type === "EMBED") continue;` to explicitly exclude EMBED rows from all step-status computation.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No change to the step-status computation logic below the guards.
      * `[ ]`   No change to the RENDER exclusion, `target_contribution_id` filter, or `SUPERSEDED` filter.
      * `[ ]`   No interface changes in this node — `DialecticJobRow["job_type"]` already includes `"EMBED"` after WS-0 via the DB-derived enum union.

  * `[ ]`   `role`
    * `[ ]`   Read-only consumer of `DialecticJobRow[]` from `getAllStageProgress.ts`. Single responsibility: translate raw job rows + recipe DAG structure into per-step `UnifiedStageStatus` values.
    * `[ ]`   This node adds one guard line; it does NOT introduce new data sources, DB queries, or orchestration logic.
    * `[ ]`   Out of scope: `buildJobProgressDtos.ts` EMBED exclusion (own next node); `JobProgressDto.jobType` type fix (s with `buildJobProgressDtos.ts`); `processJob.ts` dispatch routing (own later node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `deriveStepStatuses.ts` and `deriveStepStatuses.test.ts`.
    * `[ ]`   Inside boundary: the job-iteration loop guard sequence in `deriveStepStatuses`.
    * `[ ]`   Outside boundary: `getAllStageProgress.ts` (caller — not modified); `dialectic.interface.ts` `JobType` (recipe-layer type, not changed here); `buildJobProgressDtos.ts` (sibling — own node 2).

  * `[ ]`   `deps`
    * `[ ]`   `DialecticJobRow` (inward, `dialectic.interface.ts` → `types_db.ts`) — `job_type` field is the DB-derived enum `"PLAN" | "EXECUTE" | "RENDER" | "EMBED" | null` after WS-0; the new guard `=== "EMBED"` is type-safe against this union with no imports added.
    * `[ ]`   `DeriveStepStatusesParams.jobs: DialecticJobRow[]` (inward, same file's interface) — no shape change.
    * `[ ]`   Confirm: no reverse dependency; `getAllStageProgress.ts` calls this function but is not touched.

  * `[ ]`   `context_slice`
    * `[ ]`   Only `job.job_type` is read for the guard — already accessed on line 57 by the RENDER guard.
    * `[ ]`   No new imports, no new dep surfaces.

  * `[ ]`   `deriveStepStatuses.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Add** sub-step within `Deno.test("deriveStepStatuses", ...)`: "EMBED jobs are excluded from step-status derivation and do not affect counts". Construct two jobs for the same step:
      * `[ ]`   `embedJob = job('embed-1', 'EMBED', 'processing', execPayload('step-1'), null)` — uses existing `execPayload` helper; the `'EMBED'` value is valid for `DialecticJobRow["job_type"]` after WS-0.
      * `[ ]`   `execJob = job('exec-1', 'EXECUTE', 'pending', execPayload('step-1'), null)` — the normal EXECUTE job.
      * `[ ]`   Pass `jobs: [embedJob, execJob]` with a matching `steps` and `stepIdToStepKey` pointing `'step-1'` to `'step_a'`.
      * `[ ]`   Assert `result.get('step_a')` equals `'active'` (driven by the EXECUTE job alone — same as if the EMBED job were absent).
      * `[ ]`   Assert the result is identical to a run with `jobs: [execJob]` (EMBED has zero effect on output).
    * `[ ]`   Do NOT re-test: the RENDER exclusion path; the `target_contribution_id` filter; the SUPERSEDED filter; `cosineSimilarity` or unrelated utilities.

  * `[ ]`   `construction`
    * `[ ]`   `deriveStepStatuses` is a pure stateless function. No construction concerns.

  * `[ ]`   `deriveStepStatuses.ts` (implementation)
    * `[ ]`   After line 57 (`if (job.job_type === "RENDER") continue;`), add on line 58: `if (job.job_type === "EMBED") continue;`
    * `[ ]`   No other changes.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: application-service consumer (`dialectic-service`). Deps are inward (DB row types, DAG step interfaces); provides outward (`Map<string, UnifiedStageStatus>` to `getAllStageProgress.ts`).
    * `[ ]`   No new dependencies; no cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `deriveStepStatuses` called with `jobs` containing an EMBED job and an EXECUTE job for the same step: result map value for that step is `'active'` and is IDENTICAL to a call with only the EXECUTE job.
    * `[ ]`   `deriveStepStatuses` called with `jobs` containing ONLY an EMBED job: result map is empty.

* `[ ]`   supabase/functions/dialectic-service/`buildJobProgressDtos.ts` **[BE] Exclude EMBED jobs from progress DTOs**

  * `[ ]`   `objective`
    * `[ ]`   After WS-0 adds `EMBED` to `dialectic_job_type_enum`, `buildJobProgressDtos` maps every EMBED row into a `JobProgressDto` and surfaces it to the frontend as if it were a recipe-step job. EMBED jobs are infrastructure workers that produce no user-visible document and have no recipe step. The guard `if (job.job_type === "EMBED") continue;` at the top of the job-iteration loop excludes EMBED rows before any DTO construction.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `if (job.job_type === "EMBED") continue;` as the first statement of the `for (const job of params.jobs)` loop body (line 16), before the `payload` variable extraction.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No changes to DTO field extraction logic for PLAN / EXECUTE / RENDER jobs.
      * `[ ]`   No changes to `dialectic.interface.ts` — `JobType | "EMBED"` and `JobProgressDto.jobType: JobType | null` are already updated in the prior `processJob.ts` node.
      * `[ ]`   `getAllStageProgress.ts` (caller) is not modified; it receives the same `Map<string, JobProgressDto[]>` shape with EMBED rows absent.

  * `[ ]`   `role`
    * `[ ]`   Read-only consumer of `DialecticJobRow[]`. Single responsibility: translate job rows into a `Map<string, JobProgressDto[]>` keyed by `stage_slug` for frontend stage-progress display.
    * `[ ]`   This node adds one loop guard line. It introduces no new data sources, DB queries, or orchestration logic.
    * `[ ]`   Out of scope: `deriveStepStatuses.ts` EMBED exclusion (prior node); `assembleContinuationPrompt.ts` guard (prior node); `processJob.ts` dispatch routing (prior node); `dialectic.interface.ts` changes (prior `processJob.ts` node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `buildJobProgressDtos.ts` and `buildJobProgressDtos.test.ts`.
    * `[ ]`   Inside boundary: the job-iteration loop body.
    * `[ ]`   Outside boundary: `getAllStageProgress.ts` (caller — not modified); `dialectic.interface.ts` (not touched — changes are in the prior `processJob.ts` node); `deriveStepStatuses.ts` (prior node — not touched).

  * `[ ]`   `deps`
    * `[ ]`   `DialecticJobRow` (inward, `dialectic.interface.ts` → `types_db.ts`) — after WS-0, `job_type` includes `"EMBED"`; the guard comparison `=== "EMBED"` is type-safe against `JobType | null` (which includes `"EMBED"` after the prior `processJob.ts` node) with no new imports.
    * `[ ]`   `BuildJobProgressDtosDeps` and `BuildJobProgressDtosParams` (inward, `dialectic.interface.ts`) — no shape change in this node.
    * `[ ]`   Confirm: `getAllStageProgress.ts` calls this function but is not modified; no reverse dependency created.

  * `[ ]`   `context_slice`
    * `[ ]`   Only `job.job_type` is read for the guard — the first field access in the loop body.
    * `[ ]`   No new imports; no hidden coupling.

  * `[ ]`   `buildJobProgressDtos.test.ts` (behavioral verification — RED before GREEN)
    * `[ ]`   **Add** inside `Deno.test("buildJobProgressDtos", ...)`: sub-step `"EMBED job alone produces empty result map"`. Call `jobRow('embed-1', 'EMBED', 'processing', {})`. Call `buildJobProgressDtos(deps, { jobs: [embedJob], stepIdToStepKey: new Map() })`. Assert `result.size === 0`.
    * `[ ]`   **Add** sub-step `"EMBED job alongside EXECUTE job for same stage — only EXECUTE job appears in DTOs"`. Pass `[jobRow('embed-1', 'EMBED', 'processing', {}), jobRow('exec-1', 'EXECUTE', 'pending', {})]` with the default `stage_slug: 'thesis'` for both. Assert `result.size === 1`, `result.get('thesis')?.length === 1`, and `result.get('thesis')![0].id === 'exec-1'`.
    * `[ ]`   Do NOT re-test: `stepKey` lookup logic; `modelId`/`modelName`/`documentKey` extraction; multi-stage grouping; PLAN/RENDER DTO construction.

  * `[ ]`   `construction`
    * `[ ]`   `buildJobProgressDtos` is a pure stateless function. No construction concerns.

  * `[ ]`   `buildJobProgressDtos.ts` (implementation)
    * `[ ]`   After the opening brace of `for (const job of params.jobs) {` on line 16, add as the first statement of the loop body: `if (job.job_type === "EMBED") continue;`
    * `[ ]`   No other changes to the function body.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: application-service consumer (`dialectic-service`). Deps are inward (DB row types, DTO interfaces from `dialectic.interface.ts`); provides outward (`Map<string, JobProgressDto[]>` to `getAllStageProgress.ts`).
    * `[ ]`   No new dependencies introduced; no cycles.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `buildJobProgressDtos` called with only EMBED jobs: result map is empty (`result.size === 0`).
    * `[ ]`   `buildJobProgressDtos` called with one EMBED job and one EXECUTE job for the same stage: result map has exactly one entry with one DTO whose `id` matches the EXECUTE job.
    * `[ ]`   `buildJobProgressDtos` called with PLAN / EXECUTE / RENDER jobs: existing behavior unchanged.

## WS-S — Chunk + spawn EMBED jobs, then pause/resume

* `[ ]`   `supabase/functions/dialectic-worker/createEmbedJobs/createEmbedJobs.ts` **Create async EMBED child jobs for source documents pending vector-store indexing**

  * `[ ]`   `objective`
    * `[ ]`   Problem: No path exists to create `EMBED` job rows as async prerequisites. The old synchronous path (`IndexingService.indexDocument`) blocked Supabase Edge Functions on LLM embedding calls. There is no function that takes a set of source documents, splits them into text chunks, checks whether each source is already indexed in `dialectic_memory`, and creates a `dialectic_generation_jobs` row (`job_type='EMBED'`) per chunk for the Netlify embedding workers to process.
    * `[ ]`   Functional goals:
      * `[ ]`   Given a parent job and a list of source documents, split each document into text chunks using `ITextSplitter`.
      * `[ ]`   For each source document, query `dialectic_memory` for rows matching `(session_id, source_type, source_id)`. If any rows exist, the source is already indexed — skip it.
      * `[ ]`   For each chunk of an un-indexed source, insert one row into `dialectic_generation_jobs` with: `job_type = 'EMBED'`, `parent_job_id = parentJob.id`, `session_id`, `user_id`, `stage_slug`, `iteration_number` copied from the parent job row, and `payload: DialecticEmbeddingJobPayload`.
      * `[ ]`   Return `{ createdCount: N }` where N is the total number of EMBED job rows inserted.
      * `[ ]`   On DB insert failure, return `{ createdCount: N_before_failure, error: Error }` and stop without attempting further inserts.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   Does NOT update the parent job status (that is the caller's responsibility — WS-S node 2).
      * `[ ]`   Does NOT call `enqueueModelCall` (that happens in `processEmbedJob` — WS-S node 2).
      * `[ ]`   Does NOT insert into `dialectic_memory` (that happens in `saveResponse` — WS-B).
      * `[ ]`   Dedup check error (query fail) is non-fatal: log a warning and proceed to create for that source.
  * `[ ]`   `role`
    * `[ ]`   Layer: worker orchestration (`dialectic-worker`) — the coordinator that creates the async work units.
    * `[ ]`   This role is appropriate because `createEmbedJobs` is the scheduling half of the embedding pipeline. It creates work; the Netlify adapter (`processEmbedJob` + `enqueueModelCall`) executes it; `saveResponse` (WS-B) persists the result.
    * `[ ]`   Out of scope:
      * Updating parent job status to `waiting_for_prerequisite` — that is the caller's job (WS-S node 2, parent pause/resume).
      * Enqueuing work to Netlify (`enqueueModelCall`) — that is `processEmbedJob`.
      * Embedding computation — that is the Netlify function.
      * Persisting chunk+embedding to `dialectic_memory` — that is `saveResponse` (WS-B).
      * Deciding whether to trigger embedding at all — that is the calling function (WS-C `compressPrompt` / `prepareModelJob`).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `dialectic-worker` embedding scheduling.
    * `[ ]`   Belongs inside: job-row creation logic, dedup check against `dialectic_memory`, text splitting.
    * `[ ]`   Belongs outside: embedding computation, Netlify queue management, `dialectic_memory` write, parent job pause status update.

  * `[ ]`   `deps`
    * `[ ]`   `SupabaseClient<Database>` (from `npm:@supabase/supabase-js@2`) — DB layer; used to query `dialectic_memory` (dedup check) and insert into `dialectic_generation_jobs`. Direction: inward (infrastructure). No reverse dep.
    * `[ ]`   `ITextSplitter` (from `_shared/services/indexing_service.interface.ts`) — splits document text into chunks. Provider: `LangchainTextSplitter` class in `indexing_service.ts` (standalone, does not go through `IndexingService`). Direction: inward (shared utility). No reverse dep.
    * `[ ]`   `ILogger` (from `_shared/types.ts`) — structured logging. Provider: `index.ts` composition root. Direction: inward. No reverse dep.
    * `[ ]`   `DialecticJobRow` (from `dialectic.interface.ts`) — provides `id`, `session_id`, `user_id`, `stage_slug`, `iteration_number` from the parent job row. Direction: inward (data shape). No reverse dep.
    * `[ ]`   `DialecticEmbeddingJobPayload` (from `dialectic.interface.ts`, defined in WS-R `buildJobProgressDtos.ts` node) — payload shape for each inserted EMBED job row.
    * `[ ]`   `Enums<'dialectic_memory_source_type_enum'>` (from `types_db.ts`, added in WS-0) — discriminator for `source_type` in `dialectic_memory` dedup query and EMBED payload. Requires WS-0 to be complete.
    * `[ ]`   `Database['public']['Tables']['dialectic_generation_jobs']['Insert']` (from `types_db.ts`) — shapes the insert row. `job_type` column requires WS-0's `dialectic_job_type_enum: 'EMBED'` to be present in types.

  * `[ ]`   `context_slice`
    * `[ ]`   From `ITextSplitter`: only `splitText(text: string): Promise<string[]>`. No other methods.
    * `[ ]`   From `SupabaseClient`: only `.from('dialectic_memory').select('id').eq('session_id', ...).eq('source_type', ...).eq('source_id', ...).limit(1)` for dedup; and `.from('dialectic_generation_jobs').insert({...}).select('id').single()` for job creation. No RPC, no other tables.
    * `[ ]`   From `DialecticJobRow`: only `id`, `session_id`, `user_id`, `stage_slug`, `iteration_number`. No payload fields are read by `createEmbedJobs`.
    * `[ ]`   From `ILogger`: only `info(...)` and `warn(...)`.

  * `[ ]`   `createEmbedJobs.interface.test.ts`
    * `[ ]`   Valid `CreateEmbedJobsDeps`: `logger` conforms to `ILogger`, `textSplitter` conforms to `ITextSplitter`.
    * `[ ]`   Valid `CreateEmbedJobsParams`: `dbClient` is a `SupabaseClient<Database>`, `parentJob` has all required fields (`id`, `session_id`, `user_id`, `stage_slug`, `iteration_number`), `sourceDocuments` is a non-empty array each with `{ content: string; source_type: string; source_id: string }`, `embeddingModelProviderId` is a non-empty string, `walletId` is a non-empty string.
    * `[ ]`   Invalid `CreateEmbedJobsParams`: missing `parentJob`, missing `sourceDocuments`, `sourceDocuments` with item missing `source_id` — each fails the guard.
    * `[ ]`   `CreateEmbedJobsResult`: `{ createdCount: number }` on success; `{ createdCount: number; error: Error }` on failure.
    * `[ ]`   `DialecticEmbeddingJobPayload` valid: has `job_type: 'EMBED'`, `chunk_text`, `source_type`, `source_id`, `wallet_id`, `chunk_index` (number), `embedding_model_provider_id` — all string/number present.
    * `[ ]`   `DialecticEmbeddingJobPayload` invalid: missing `job_type`, missing `chunk_text`, `chunk_index` is a string — each fails the guard.

  * `[ ]`   `createEmbedJobs.interface.ts`
    * `[ ]`   `CreateEmbedJobsSourceDocument`:
      * `content: string`
      * `source_type: Enums<'dialectic_memory_source_type_enum'>` (post-WS-0)
      * `source_id: string`
    * `[ ]`   `CreateEmbedJobsDeps`:
      * `logger: ILogger`
      * `textSplitter: ITextSplitter`
    * `[ ]`   `CreateEmbedJobsParams`:
      * `dbClient: SupabaseClient<Database>`
      * `parentJob: DialecticJobRow`
      * `sourceDocuments: CreateEmbedJobsSourceDocument[]`
      * `embeddingModelProviderId: string`
      * `walletId: string`
    * `[ ]`   `CreateEmbedJobsResult`:
      * `createdCount: number`
      * `error?: Error`
    * `[ ]`   `CreateEmbedJobsFn`:
      * `(deps: CreateEmbedJobsDeps, params: CreateEmbedJobsParams) => Promise<CreateEmbedJobsResult>`
  * `[ ]`   `createEmbedJobs.interaction.spec`
    * `[ ]`   Caller: WS-C `compressPrompt` or `prepareModelJob` (not yet implemented) calls `createEmbedJobs(deps, params)` after detecting oversized inputs. Returns `CreateEmbedJobsResult`.
    * `[ ]`   Interaction with `ITextSplitter`: for each source document, call `textSplitter.splitText(sourceDoc.content)` once. Returns `string[]` of chunk texts.
    * `[ ]`   Interaction with `SupabaseClient` (dedup): for each source document, query `dialectic_memory` for `session_id = parentJob.session_id AND source_type = sourceDoc.source_type AND source_id = sourceDoc.source_id`. Returns `{ data: { id: string }[] | null, error: PostgrestError | null }`.
    * `[ ]`   Interaction with `SupabaseClient` (insert): for each chunk of an un-indexed source, call `.from('dialectic_generation_jobs').insert({...}).select('id').single()`. Returns `{ data: { id: string } | null, error: PostgrestError | null }`.
    * `[ ]`   Failure modes:
      * Dedup query error → log `warn`, proceed as if source is not indexed (create for that source anyway).
      * Insert error → return immediately with `{ createdCount: N, error: new Error(insertError.message) }`. Do not attempt further inserts.
    * `[ ]`   Ordering: dedup check before split (avoid expensive text splitting if already indexed). Split before insert.
    * `[ ]`   No side effects beyond `dialectic_generation_jobs` inserts and `logger` calls.

  * `[ ]`   `createEmbedJobs.guard.test.ts`
    * `[ ]`   `isCreateEmbedJobsSourceDocument`: accepts `{ content, source_type, source_id }`, rejects missing fields, rejects non-string values.
    * `[ ]`   `isCreateEmbedJobsParams`: accepts valid params object, rejects missing `parentJob`, rejects empty `sourceDocuments`, rejects `parentJob` without `session_id`.

  * `[ ]`   `createEmbedJobs.guard.ts`
    * `[ ]`   `isCreateEmbedJobsSourceDocument(value: unknown): value is CreateEmbedJobsSourceDocument`
    * `[ ]`   `isCreateEmbedJobsParams(value: unknown): value is CreateEmbedJobsParams`

  * `[ ]`   `createEmbedJobs.mock.ts`
    * `[ ]`   `createMockCreateEmbedJobsDeps(overs?)`: returns `{ logger: createMockLogger(), textSplitter: createMockTextSplitter() }` with vi.fn()-backed methods.
    * `[ ]`   `createMockCreateEmbedJobsFn(result?)`: returns a vi.fn() that resolves to `result ?? { createdCount: 0 }`.
    * `[ ]`   No new behavior beyond interface conformance.

  * `[ ]`   `createEmbedJobs.test.ts`
    * `[ ]`   Uses `createMockSupabase` (existing pattern from `continueJob.test.ts` — `getHistoricQueryBuilderSpies`).
    * `[ ]`   **Happy path — no existing chunks**: given one source doc with no matching rows in `dialectic_memory`, `splitText` returns 3 chunks → 3 EMBED job inserts → `{ createdCount: 3 }`. Verify each insert has `job_type: 'EMBED'`, `parent_job_id = parentJob.id`, `session_id`, `user_id`, `stage_slug`, `iteration_number` matching parent job, and `payload.chunk_text` matching the chunk.
    * `[ ]`   **Dedup skip**: given one source doc with existing rows in `dialectic_memory` → `splitText` is NOT called, no inserts, `{ createdCount: 0 }`.
    * `[ ]`   **Multiple sources — partial dedup**: given 2 source docs where doc A has existing `dialectic_memory` rows and doc B does not → doc A is skipped, doc B is split and created. `createdCount` equals chunks in doc B only.
    * `[ ]`   **Dedup query error — fallback to create**: given dedup query returns an error → log `warn`, proceed to split and insert for that source. `createdCount` = chunk count. Warning log emitted once.
    * `[ ]`   **Insert failure — stops early**: given `splitText` returns 3 chunks but second insert fails → `{ createdCount: 1, error: Error }`. Third insert NOT attempted. Error message matches `insertError.message`.
    * `[ ]`   **Empty source documents array**: `{ createdCount: 0 }`, no DB calls.
    * `[ ]`   **Each insert payload shape**: `payload.job_type === 'EMBED'`, `payload.chunk_index` matches loop index, `payload.embedding_model_provider_id` matches `params.embeddingModelProviderId`, `payload.wallet_id` matches `params.walletId`.

  * `[ ]`   `construction`
    * `[ ]`   `createEmbedJobs` is a plain async function; no class or constructor.
    * `[ ]`   Created/called by: initially WS-C `compressPrompt` or `prepareModelJob`; injected via `IJobContext` or a specialized sub-context.
    * `[ ]`   No partially constructed state. All deps provided in `CreateEmbedJobsDeps`; all runtime data in `CreateEmbedJobsParams`.
    * `[ ]`   Invalid construction: calling without a valid `ITextSplitter` or without `dbClient` is rejected by the guard.

  * `[ ]`   `createEmbedJobs.ts`
    * `[ ]`   Implement `createEmbedJobs(deps: CreateEmbedJobsDeps, params: CreateEmbedJobsParams): Promise<CreateEmbedJobsResult>`.
    * `[ ]`   Destructure `parentJob.id`, `parentJob.session_id`, `parentJob.user_id`, `parentJob.stage_slug`, `parentJob.iteration_number` at function entry.
    * `[ ]`   For each `sourceDoc` in `params.sourceDocuments`:
      1. Query `dialectic_memory` for `(session_id, source_type, source_id)` match with `.limit(1)`. On query error, log `warn` and continue (treat as not indexed).
      2. If rows exist, log `info` and `continue`.
      3. Call `deps.textSplitter.splitText(sourceDoc.content)` to get chunks.
      4. For each `(chunk, chunkIndex)`:
         a. Build `payload: DialecticEmbeddingJobPayload = { job_type: 'EMBED', chunk_text: chunk, source_type: sourceDoc.source_type, source_id: sourceDoc.source_id, wallet_id: params.walletId, chunk_index: chunkIndex, embedding_model_provider_id: params.embeddingModelProviderId }`.
         b. Insert row: `{ session_id, user_id, stage_slug, iteration_number, job_type: 'EMBED', payload, parent_job_id: parentJobId, status: 'pending' }` into `dialectic_generation_jobs`.
         c. On insert error, return `{ createdCount, error: new Error(insertError.message) }` immediately.
         d. Increment `createdCount`.
    * `[ ]`   Return `{ createdCount }`.
    * `[ ]`   No `any` types. No undeclared deps. Each code path maps to a requirement.

  * `[ ]`   `createEmbedJobs.provides.ts`
    * `[ ]`   Export `createEmbedJobs` function.
    * `[ ]`   Export `CreateEmbedJobsFn` type alias.
    * `[ ]`   Stability: internal worker utility; not exported from the function's public Deno entry point.

  * `[ ]`   `createEmbedJobs.integration.test.ts`
    * `[ ]`   Integration test: `LangchainTextSplitter` (real) → `createEmbedJobs` → mock Supabase client.
    * `[ ]`   Confirm: given a 2000-character source document and a `LangchainTextSplitter` with default options, the real splitter produces ≥ 2 chunks, and `createEmbedJobs` inserts that many EMBED job rows (all with correct fields).
    * `[ ]`   Confirms: chain from text-splitting through DB-row creation works end-to-end with the real `ITextSplitter` implementation.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration.
    * `[ ]`   Deps inward: `SupabaseClient` (infrastructure), `ITextSplitter` (shared util), `ILogger` (shared util), `DialecticJobRow` (domain type).
    * `[ ]`   Provides outward: `CreateEmbedJobsResult` to WS-D's `compressPrompt.ts` (the caller that detects oversized input, calls `createEmbedJobs`, and sets `waiting_for_children` if `createdCount > 0`).
    * `[ ]`   No cycles. `createEmbedJobs` does not import from `processEmbedJob`, `enqueueModelCall`, `saveResponse`, or `compressPrompt`.

  * `[ ]`   `requirements`
    * `[ ]`   `DialecticEmbeddingJobPayload` is exported from `dialectic.interface.ts` (defined in WS-R `buildJobProgressDtos.ts` node). `DialecticJobPayload` union includes `DialecticEmbeddingJobPayload`. `isDialecticEmbeddingJobPayload` is exported from `type_guards.dialectic.ts` (defined in WS-R `buildJobProgressDtos.ts` node).
    * `[ ]`   Source with no matching rows in `dialectic_memory`: `createEmbedJobs` inserts exactly `chunks.length` EMBED job rows, each with `job_type='EMBED'`, `parent_job_id = parentJob.id`, `session_id / user_id / stage_slug / iteration_number` matching the parent job row, and `payload.chunk_index` values `0..N-1`.
    * `[ ]`   Source with existing rows in `dialectic_memory`: no EMBED job rows inserted for that source. `textSplitter.splitText` not called for that source.
    * `[ ]`   DB insert failure on chunk K: `createdCount = K`, `error` is an `Error` with `message` matching the Supabase `PostgrestError.message`. No further inserts for subsequent chunks.
    * `[ ]`   Dedup query failure: `warn` log emitted; insert proceeds for that source as if no existing rows found.
    * `[ ]`   Empty `sourceDocuments`: returns `{ createdCount: 0 }` without any DB calls.

* `[ ]`   supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts **[BE] Align Supabase enqueue contract to operation-aware Netlify worker payloads while preserving queued-job guarantees; fix output_type validation to be operation-discriminated**

   * `[✅]`   `objective`
      * `[✅]`   Solve the enqueue contract mismatch where Supabase currently emits chat-only queue payloads and cannot enqueue embedding workloads with explicit operation semantics.
      * `[✅]`   Functional goals:
         * `[✅]`   Add operation-aware enqueue payload contracts that support stream and embedding requests.
         * `[✅]`   Preserve existing queued state transition (`dialectic_generation_jobs.status = 'queued'`) before queue POST.
         * `[✅]`   Preserve job signature generation and event size enforcement semantics.
         * `[✅]`   Emit deterministic Netlify event body shape that matches `ai-stream-background` operation routing contract.
         * `[ ]`   Fix `output_type` validation to be operation-discriminated: `operation === 'stream'` validates via `isModelContributionFileType`; `operation === 'embedding'` validates via `isEmbeddingOutputFileType` (accepting `FileType.EmbeddingChunk`). Non-retriable error returned if invalid for either branch.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Keep stream enqueue behavior backward-compatible for existing generation jobs.
         * `[✅]`   Keep invalid-contract failures deterministic and explicitly non-retriable.
         * `[✅]`   Keep transient queue/network failures retriable.
         * `[✅]`   Do not edit callback ingest or response persistence source files in this node.
      * `[✅]`   Each goal is atomic and testable through interface, guard, unit, and integration updates in this module scope.

   * `[✅]`   `role`
      * `[✅]`   Node role is Supabase queue-emitter implementation plus immediate enqueue support files (interfaces, guards, mocks, tests, provides).
      * `[✅]`   This role is correct because `enqueueModelCall.ts` is the first Supabase source file that consumes Workstream A queue/worker operation contract outputs.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit `netlifyResponseHandler.ts` source behavior in this node.
         * `[✅]`   Do not edit `saveResponse.ts` source behavior in this node.
         * `[✅]`   Do not edit Netlify worker source files in this node.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/enqueueModelCall`.
      * `[✅]`   Inside boundary:
         * `[✅]`   Queue event contract assembly and validation.
         * `[✅]`   Job signature and queue-post sequencing.
         * `[✅]`   Runtime guard coverage for enqueue params/payload/return and event shape.
         * `[ ]`   `FileType.EmbeddingChunk` definition and `EmbeddingOutputFileTypes` union in `_shared/types/file_manager.types.ts` (type s with first consumer — this node).
         * `[ ]`   `isEmbeddingOutputFileType` guard in `_shared/utils/type-guards/type_guards.file_manager.ts` and its test in `type_guards.file_manager.test.ts` ( with first consumer — this node).
      * `[✅]`   Outside boundary:
         * `[✅]`   Upstream prompt-scoping and affordability logic.
         * `[✅]`   Downstream callback ingest branching and artifact persistence.
         * `[✅]`   Provider adapter execution internals.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `../prepareModelJob/prepareModelJob.ts` enqueue caller contract.
         * `[✅]`   Layer classification: immediate producer for enqueue params/payload.
         * `[✅]`   Direction: producer input consumed by enqueue function.
         * `[✅]`   Purpose: provide operation-specific payload data for queue emission.
      * `[✅]`   Provider: `../../_shared/utils/type-guards/type_guards.chat.ts` and `type_guards.file_manager.ts`.
         * `[✅]`   Layer classification: shared runtime guard utilities.
         * `[✅]`   Direction: inbound dependency to enqueue runtime validation.
         * `[✅]`   Purpose: validate provider config and output-type compatibility before queue POST.
      * `[✅]`   Provider: Netlify queue endpoint contract (`eventName: 'ai-stream-background'` + operation-aware data).
         * `[✅]`   Layer classification: external consumer boundary.
         * `[✅]`   Direction: outbound payload emitted by enqueue implementation.
         * `[✅]`   Purpose: ensure queued events are consumable by operation-aware worker routing.
      * `[✅]`   Confirm:
         * `[✅]`   No reverse dependency from enqueue into callback handler/persistence source modules.
         * `[✅]`   No lateral layer violations across Supabase workstream boundaries.

   * `[✅]`   `context_slice`
      * `[✅]`   Minimal dependency interfaces required:
         * `[✅]`   `computeJobSig(job.id, job.user_id, job.created_at)` returning deterministic signature string.
         * `[✅]`   Provider-row extended model config guard-safe shape.
         * `[✅]`   Queue payload discriminator and request payload fields required by Netlify worker operation routing.
      * `[✅]`   Injection shape remains `EnqueueModelCallDeps`, `EnqueueModelCallParams`, and `EnqueueModelCallPayload` with additive operation-aware fields only.
      * `[✅]`   Confirm:
         * `[✅]`   No over-fetching of producer-only fields not required for queue emission.
         * `[✅]`   No hidden coupling to callback persistence tables.

   * `[ ]`   `supabase/functions/_shared/types/file_manager.types.ts` (type addition s with first consumer)
      * `[ ]`   Add `EmbeddingChunk = 'embedding_chunk'` to `FileType` enum.
      * `[ ]`   Add `export type EmbeddingOutputFileTypes = FileType.EmbeddingChunk;`

   * `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.test.ts` (guard test — RED before GREEN)
      * `[ ]`   Add test: `isEmbeddingOutputFileType` accepts `'embedding_chunk'`; rejects any other string value; rejects non-string.
      * `[ ]`   Do NOT re-test `isModelContributionFileType` or any existing guard.

   * `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.ts` (guard)
      * `[ ]`   Add `isEmbeddingOutputFileType(value: unknown): value is EmbeddingOutputFileTypes` — checks `value === FileType.EmbeddingChunk`.
      * `[ ]`   No other changes to existing guards.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.interface.test.ts`
      * `[✅]`   Add contract assertions for operation-aware enqueue payload shape:
         * `[✅]`   stream payload variant includes required `chatApiRequest` and excludes embedding-only fields.
         * `[✅]`   embedding payload variant includes required embedding input contract and excludes stream-only fields.
         * `[✅]`   unknown operation discriminator is rejected by contract fixtures.
      * `[✅]`   Add contract assertions for operation-aware event type shape:
         * `[✅]`   stream event variant is typed as `AiWorkloadStreamEvent` — compile error if `embedding_api_request` is assigned.
         * `[✅]`   embedding event variant is typed as `AiWorkloadEmbeddingEvent` — compile error if `chat_api_request` is assigned.
         * `[✅]`   both variants preserve `sig` and `user_config` requirements inherited from shared base.
      * `[✅]`   Preserve existing queued success/error return contract assertions.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.interface.ts`
      * `[✅]`   Extend `EnqueueModelCallPayload` to an explicit operation-discriminated union consumed by enqueue source.
      * `[✅]`   Delete `AiStreamEventData` entirely. Define `AiWorkloadStreamEvent` with `operation: 'stream'` and `chat_api_request`, `AiWorkloadEmbeddingEvent` with `operation: 'embedding'` and `embedding_api_request`, and `AiWorkloadEvent = AiWorkloadStreamEvent | AiWorkloadEmbeddingEvent` — identical names and structure to the Netlify side, since this module constructs the event body the Netlify worker receives as `AiWorkloadEvent`.
      * `[✅]`   Keep `EnqueueModelCallReturn` success/error union unchanged.
      * `[✅]`   Keep dependency and params interfaces stable except strictly required additive fields.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.interaction.spec`
      * `[✅]`   Add interaction-spec file for enqueue sequencing and branch semantics:
         * `[✅]`   validate output/provider/api-key/job-user-id prerequisites.
         * `[✅]`   compute signature.
         * `[✅]`   update job to queued.
         * `[✅]`   build operation-aware event payload.
         * `[✅]`   enforce 500 KB serialized payload guard.
         * `[✅]`   POST to Netlify queue with authorization header.
      * `[✅]`   Define operation branch constraints:
         * `[✅]`   stream operation serializes stream request fields only.
         * `[✅]`   embedding operation serializes embedding request fields only.
      * `[✅]`   Failure modes:
         * `[✅]`   contract/validation failures return non-retriable errors.
         * `[✅]`   DB update failure returns retriable error and aborts fetch.
         * `[✅]`   non-2xx queue response and network errors return retriable errors.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.guard.test.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Add guard tests for operation-aware payload and event shape:
         * `[✅]`   accept valid stream payload/event variant.
         * `[✅]`   accept valid embedding payload/event variant.
         * `[✅]`   reject mixed stream+embedding fields in a single variant.
         * `[✅]`   reject unknown operation discriminator.
      * `[✅]`   Add regression tests for event name literal consistency:
         * `[✅]`   guard accepts `eventName: 'ai-stream-background'`.
         * `[✅]`   guard rejects stale literal values.
      * `[✅]`   Preserve existing deps/params/return guard coverage.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.guard.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Update payload and event guards to enforce operation-discriminated union semantics.
      * `[✅]`   Correct `isAiStreamEventBody` event-name literal to `ai-stream-background`.
      * `[✅]`   Preserve strict validation for `sig` and `user_config.tier_output_cap_tokens`.
      * `[✅]`   Preserve deps and params guard behavior except required operation-aware additions.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.mock.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Add operation-aware payload/event mock factories:
         * `[✅]`   stream payload/event defaults.
         * `[✅]`   embedding payload/event defaults.
      * `[✅]`   Preserve existing typed defaults for deps/params and queued return fixtures.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.test.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Add RED/GREEN unit coverage for operation-aware enqueue behavior:
         * `[✅]`   stream payload path posts stream event variant and remains queued-success compatible.
         * `[✅]`   embedding payload path posts embedding event variant and remains queued-success compatible.
         * `[✅]`   invalid operation payload is rejected before DB update/fetch.
         * `[✅]`   oversized payload handling remains non-retriable and fetch is not called.
      * `[✅]`   Preserve sequencing assertions that DB queued update occurs before queue fetch on success.
      * `[✅]`   Preserve retriable vs non-retriable classification assertions for failure paths.

   * `[ ]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Implement operation-aware event-body construction from discriminated enqueue payload.
      * `[ ]`   Replace the unconditional `isModelContributionFileType(params.output_type)` check (line 24) with an operation-discriminated branch: if `payload.operation === 'stream'` validate `isModelContributionFileType(params.output_type)`; if `payload.operation === 'embedding'` validate `isEmbeddingOutputFileType(params.output_type)`. Return non-retriable error if either check fails.
      * `[✅]`   Keep prerequisite validation order unchanged:
         * `[✅]`   output type validity (now operation-discriminated — see above).
         * `[✅]`   provider config validity.
         * `[✅]`   API key availability.
         * `[✅]`   `job.user_id` presence.
         * `[✅]`   signature compute.
         * `[✅]`   queued DB update before fetch.
      * `[✅]`   Keep event size limit enforcement and queue POST auth/header semantics unchanged.
      * `[✅]`   Preserve existing retriable/non-retriable error mapping semantics.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.provides.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Export operation-aware contract and guard symbols introduced by this node.
      * `[✅]`   Preserve existing exports consumed by prepareModelJob tests and enqueue module consumers.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.integration.test.ts`
      * `[✅]`   Update all imports and type references from `AiStreamEventData` to `AiWorkloadStreamEvent`, `AiWorkloadEmbeddingEvent`, and `AiWorkloadEvent`.
      * `[✅]`   Extend integration coverage for producer -> enqueue -> consumer-boundary payload correctness:
         * `[✅]`   stream variant integration path verifies queued DB update and posted stream event shape.
         * `[✅]`   embedding variant integration path verifies queued DB update and posted embedding event shape.
         * `[✅]`   both variants verify event name, signature presence, and operation-consistent request fields.
      * `[✅]`   Keep external boundaries mocked (network + external provider dependencies) while exercising real enqueue implementation and Supabase mock client behavior.

   * `[✅]`   `construction`
      * `[✅]`   Enqueue remains a pure DI function (`deps`, `params`, `payload`) with no hidden singleton dependencies.
      * `[✅]`   No partial construction path is introduced.
      * `[✅]`   Initialization order remains deterministic and preserved by tests.

   * `[✅]`   `directionality`
      * `[✅]`   Node layer is Supabase orchestration-to-queue boundary adapter.
      * `[✅]`   Dependencies remain inward-facing from shared guards, signatures, DB client, and env-backed queue config.
      * `[✅]`   Outbound interface remains Netlify event payload boundary.
      * `[✅]`   No new dependency cycles with callback ingest or persistence modules.

   * `[ ]`   `requirements`
      * `[✅]`   Enqueue supports operation-aware stream and embedding queue payload emission.
      * `[✅]`   Existing stream enqueue behavior stays backward-compatible and fully covered.
      * `[✅]`   Queued-state DB transition, signature generation, and payload-size guard remain deterministic.
      * `[✅]`   Guard/interface/mock/unit/integration files prove operation-discriminated contract correctness and failure classification behavior.
      * `[ ]`   `output_type` for stream payloads must satisfy `isModelContributionFileType`; non-retriable error returned if invalid.
      * `[ ]`   `output_type` for embedding payloads must satisfy `isEmbeddingOutputFileType` (accepts `FileType.EmbeddingChunk = 'embedding_chunk'` only); non-retriable error returned if invalid.
      * `[ ]`   `isEmbeddingOutputFileType('embedding_chunk')` returns `true`; any other value returns `false`.
      * `[ ]`   Node scope extended to include `file_manager.types.ts`, `type_guards.file_manager.ts`, and `type_guards.file_manager.test.ts`.

* `[ ]`   createJobContext/`createJobContext.ts` **[BE] Thread `enqueueModelCall` as a raw field through `IJobContext`, `JobContextParams`, the factory, guard, mock, and all test files so `processEmbedJob` can receive a pre-bound model-call closure directly from the root context**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing-field defect: `IJobContext` and `JobContextParams` do not carry `enqueueModelCall: BoundEnqueueModelCallFn`, so `processEmbedJob` (WS-R) cannot receive it from the root context, and `index.ts` (WS-S final node) cannot wire it through `createJobContext`.
    * `[ ]`   Functional goals:
      * `IJobContext` exposes `enqueueModelCall: BoundEnqueueModelCallFn` as a raw field alongside the other pre-bound closures (`prepareModelJob`, `gatherArtifacts`).
      * `JobContextParams` requires `enqueueModelCall: BoundEnqueueModelCallFn` so `createJobContext` can copy it without inference gaps.
      * `createJobContext` passes the field through unchanged.
      * `isIJobContext` guard enforces the field's presence at runtime.
      * All mock helpers and test files remain compilable and structurally correct after the change.
    * `[ ]`   Non-functional constraint: `index.ts` will not compile after this node (it does not yet pass `enqueueModelCall` to `createJobContext`); the break is resolved in the immediately-following `index.ts` node (last WS-S node, where the WS-S commit also lands). No other file outside the scope of this node is affected.

  * `[ ]`   `role`
    * `[ ]`   Composition-root factory (`dialectic-worker/createJobContext`). Its single responsibility is to assemble a fully-typed `IJobContext` from all required raw dependencies at the application boundary.
    * `[ ]`   This role is appropriate because `createJobContext` is already the authoritative construction point for `IJobContext`; adding one raw field follows the established pattern (`prepareModelJob`, `gatherArtifacts`, `computeJobSig` are all pre-bound closures already on the context).
    * `[ ]`   Out of scope: how `enqueueModelCall` is used inside `processEmbedJob` (WS-R node); constructing `boundEnqueueModelCall` from Netlify env vars (WS-S `index.ts` node); the `createPrepareModelJobContext` slicer (it already takes `boundEnqueueModelCall` as its own parameter and is NOT changed by this node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `createJobContext/` directory — `JobContext.interface.ts`, `createJobContext.ts`, `JobContext.guard.ts`, `JobContext.guard.test.ts`, `JobContext.mock.ts`, `createJobContext.test.ts`, `createJobContext.interface.test.ts`, `createJobContext.integration.test.ts`.
    * `[ ]`   Inside boundary: the `IJobContext` shape, `JobContextParams` construction contract, `isIJobContext` runtime guard, mock helpers that produce valid instances, and all tests that verify those contracts.
    * `[ ]`   Outside boundary: `enqueueModelCall.ts` implementation (provider node, already ✅); `processEmbedJob.ts` consumer (WS-R); `index.ts` wiring (next WS-S node).

  * `[ ]`   `deps`
    * `[ ]`   `BoundEnqueueModelCallFn` from `enqueueModelCall/enqueueModelCall.interface.ts` — already imported in `JobContext.interface.ts` (~L47) and in `createJobContext.ts` (~L9). Layer: adapter (WS-A). Direction: inward (interface contract only, no concrete import). Purpose: type the pre-bound closure carried on the context.
    * `[ ]`   All other existing deps unchanged — no new imports needed in any file.
    * `[ ]`   Confirm: no reverse dependency (nothing in `enqueueModelCall.interface.ts` imports `JobContext`); no lateral violation.

  * `[ ]`   `context_slice`
    * `[ ]`   From `BoundEnqueueModelCallFn`: only the type — `(params: EnqueueModelCallParams, payload: EnqueueModelCallPayload) => Promise<EnqueueModelCallReturn>`. No concrete implementation crossed.
    * `[ ]`   No over-fetching: no additional imports from `enqueueModelCall.interface.ts` beyond the already-imported `BoundEnqueueModelCallFn`.
    * `[ ]`   No hidden coupling: the field is stored and passed through; no call site exists inside this node's files.

  * `[ ]`   `createJobContext.interface.test.ts` (contract — structural boundary satisfaction)
    * `[ ]`   In the existing `describe('IJobContext', ...)` plain-object construction block: add `enqueueModelCall: createMockBoundEnqueueModelCall()` to the `IJobContext` literal so the TypeScript assignment compiles (structural satisfaction of the new required field). `createMockBoundEnqueueModelCall` is already imported from `JobContext.mock.ts` in this file.
    * `[ ]`   In the existing `describe('JobContextParams', ...)` plain-object construction block: add `enqueueModelCall: createMockBoundEnqueueModelCall()` for the same reason.
    * `[ ]`   Do NOT add new test cases in this file — existing cases cover all other fields; the additions above are purely structural to prevent compile failure after the interface change.

  * `[ ]`   `JobContext.interface.ts` (structural boundary — type edits; exempt from RED/GREEN)
    * `[ ]`   In `IJobContext` raw-fields block (after `readonly computeJobSig: ComputeJobSig;` and before the closing `}`): add `readonly enqueueModelCall: BoundEnqueueModelCallFn;`. Placement is adjacent to the other pre-bound orchestration closures (`prepareModelJob`, `gatherArtifacts`, `computeJobSig`).
    * `[ ]`   In `JobContextParams` (after `readonly computeJobSig: ComputeJobSig;` and before the closing `}`): add `readonly enqueueModelCall: BoundEnqueueModelCallFn;`. Mirrors the `IJobContext` addition; all `JobContextParams` fields are required.
    * `[ ]`   `BoundEnqueueModelCallFn` import already present at ~L47 — no import change required.
    * `[ ]`   No other change to any interface in this file.

  * `[ ]`   `JobContext.guard.test.ts` (enforcement — guard tests before guard)
    * `[ ]`   In the existing `describe('isIJobContext', ...)` block, add two tests after the last existing `isIJobContext` test:
      * Test 1: `'returns true when all required fields including enqueueModelCall are present'` — construct an object from `buildIJobContext()` (which will include `enqueueModelCall` after the mock update) and assert `isIJobContext(result) === true`.
      * Test 2: `'returns false when enqueueModelCall is absent'` — spread a valid `buildIJobContext()` result and delete `enqueueModelCall`, then assert `isIJobContext(result) === false`.
    * `[ ]`   Do NOT re-test any other field — all other field checks are already covered by existing tests.

  * `[ ]`   `JobContext.guard.ts` (enforcement — runtime boundary)
    * `[ ]`   In `isIJobContext`: append `'enqueueModelCall' in value && typeof value.enqueueModelCall === 'function' &&` to the conjunction of field checks in the final `return (...)` statement. Placement: after the `computeJobSig` check (last existing check), as the new final condition before the closing `)`.
    * `[ ]`   No other guard function changes.

  * `[ ]`   `JobContext.mock.ts` (simulation)
    * `[ ]`   In `createMockJobContextParams` `baseParams` object literal: add `enqueueModelCall: createMockBoundEnqueueModelCall(),` after `computeJobSig`. `createMockBoundEnqueueModelCall` is already defined in this file (~L63) and returns `async () => ({ error: new Error('mock bound enqueueModelCall not implemented'), retriable: false })`.
    * `[ ]`   In `buildIJobContext`: add `enqueueModelCall: params.enqueueModelCall,` to the returned object literal after `computeJobSig`. This copies the value from the `createMockJobContextParams()` result, maintaining the round-trip used by guard tests.
    * `[ ]`   No other change to this file. All existing exported helpers (`buildIPlanJobContext`, `buildIRenderJobContext`, `buildIPrepareModelJobContext`, `createCompressPromptFn`, `createCalculateAffordabilityFn`, etc.) are unaffected.

  * `[ ]`   `createJobContext.test.ts` (behavioral verification)
    * `[ ]`   In the existing `describe('createJobContext', ...)` block, add two tests after the last existing `createJobContext` test:
      * Test 1: `'copies enqueueModelCall from params onto root IJobContext'` — `createMockJobContextParams()` → `createJobContext(params)` → `assertEquals(result.enqueueModelCall, params.enqueueModelCall)`.
      * Test 2: `'enqueueModelCall is present and callable on the IJobContext result'` — `createMockJobContextParams()` → `createJobContext(params)` → `assertEquals(typeof result.enqueueModelCall, 'function')`.
    * `[ ]`   Do NOT re-test guard correctness (covered in `JobContext.guard.test.ts`) or field types (covered in `createJobContext.interface.test.ts`).

  * `[ ]`   `construction`
    * `[ ]`   `createJobContext(params: JobContextParams): IJobContext` is the single factory entrypoint; it remains a plain object return (no class, no constructor).
    * `[ ]`   After this node, `JobContextParams` requires `enqueueModelCall`; any caller that omits it will not compile — this is the intended enforcement, resolved by the `index.ts` node (next WS-S).
    * `[ ]`   No partially-constructed instances are possible: `createJobContext` is a synchronous total function with no conditional field omissions.
    * `[ ]`   Invalid construction context: calling `createJobContext` without `enqueueModelCall` in params is a compile error; no runtime guard needed at the factory.

  * `[ ]`   `createJobContext.ts` (implementation)
    * `[ ]`   In the `createJobContext` factory return object: add `enqueueModelCall: params.enqueueModelCall,` after `computeJobSig: params.computeJobSig,` (last existing field in the returned object, ~L82). No other change to the function body.
    * `[ ]`   The `createPrepareModelJobContext`, `createPlanJobContext`, `createRenderJobContext`, and `createSaveResponseContext` slicers are NOT modified; they are unrelated to this field.
    * `[ ]`   `BoundEnqueueModelCallFn` is already imported (~L9); no import change required.

  * `[ ]`   `createJobContext.integration.test.ts` (edge validation)
    * `[ ]`   In `Deno.test('Integration: constructed context passes structural check against IJobContext and slicers build expected objects', ...)`: after the existing `assertEquals(rootContext.debitTokens, params.debitTokens)` assertion, add `assertEquals(rootContext.enqueueModelCall, params.enqueueModelCall)`. This asserts the factory round-trip at the integration boundary.
    * `[ ]`   No other test in this file requires modification: the slicer tests (`createPrepareModelJobContext`, `calculateAffordability` delegation, Phase 1 chain) do not involve `IJobContext.enqueueModelCall` directly.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: composition root / factory (`dialectic-worker` application boundary). This is the outermost wiring layer for the worker; it depends inward on interfaces and utility types.
    * `[ ]`   Deps are inward-facing: `BoundEnqueueModelCallFn` originates in `enqueueModelCall.interface.ts` (adapter layer, already ✅).
    * `[ ]`   Provides are outward-facing: `IJobContext` (with `enqueueModelCall`) is consumed by `processJob` → `processEmbedJob` (WS-R) and `index.ts` (WS-S final node).
    * `[ ]`   No cycles: `enqueueModelCall.interface.ts` does not import anything from `createJobContext/`.

  * `[ ]`   `requirements`
    * `[ ]`   `IJobContext` has `readonly enqueueModelCall: BoundEnqueueModelCallFn` — verified by TypeScript structural assignment in `createJobContext.interface.test.ts`.
    * `[ ]`   `JobContextParams` has `readonly enqueueModelCall: BoundEnqueueModelCallFn` — verified by TypeScript structural assignment in `createJobContext.interface.test.ts`.
    * `[ ]`   `createJobContext(params).enqueueModelCall === params.enqueueModelCall` — verified by `createJobContext.test.ts` Test 1.
    * `[ ]`   `typeof createJobContext(params).enqueueModelCall === 'function'` — verified by `createJobContext.test.ts` Test 2.
    * `[ ]`   `isIJobContext(value)` returns `false` when `enqueueModelCall` is absent — verified by `JobContext.guard.test.ts` Test 2.
    * `[ ]`   `isIJobContext(buildIJobContext())` returns `true` — verified by `JobContext.guard.test.ts` Test 1 (which uses the updated `buildIJobContext`).
    * `[ ]`   `createMockJobContextParams()` produces a `JobContextParams` that compiles without supplying `enqueueModelCall` at the call site — verified implicitly by every existing test that calls `createMockJobContextParams()`.
    * `[ ]`   `buildIJobContext().enqueueModelCall` is a function — verified by `JobContext.guard.test.ts` Test 1.
    * `[ ]`   Integration structural check: `rootContext.enqueueModelCall === params.enqueueModelCall` — verified by `createJobContext.integration.test.ts`.

* `[ ]`   supabase/functions/dialectic-worker/`index.ts` **[BE] Wire real `processEmbedJob` into worker composition root and thread `enqueueModelCall` through job context — WS-R + WS-S commit**

  * `[ ]`   `objective`
    * `[ ]`   Two gaps prevent EMBED jobs from executing after WS-R and WS-S nodes land: (a) `defaultProcessors` in `handleJob` has no `processEmbedJob` entry, so `IJobProcessors` is unsatisfied and the file will not compile once WS-R adds that field; (b) `createJobContext(...)` does not receive `enqueueModelCall`, so `IJobContext.enqueueModelCall` (added in WS-S `createJobContext.ts` node) cannot be populated at the composition root.
    * `[ ]`   Functional goals:
      * `[ ]`   Import `processEmbedJob` from `./processEmbedJob/processEmbedJob.ts` (created in WS-R).
      * `[ ]`   Pass `enqueueModelCall: boundEnqueueModelCall` to the `createJobContext(...)` call in `createDialecticWorkerDeps`. `boundEnqueueModelCall` is already constructed in that factory; only the pass-through is missing.
      * `[ ]`   Add `processEmbedJob` to the `defaultProcessors` object in `handleJob`, bridging `IJobContext.enqueueModelCall` → `ProcessEmbedJobDeps.enqueueModelCall`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   This is the ONLY touch of `index.ts` across all workstreams. No stub was added in WS-R.
      * `[ ]`   No existing processor entries in `defaultProcessors` are modified.
      * `[ ]`   `boundEnqueueModelCall` construction logic is unchanged — only the pass-through to `createJobContext` is added.
      * `[ ]`   All prior `createDialecticWorkerDeps` tests remain valid (additive only).

  * `[ ]`   `role`
    * `[ ]`   Composition root (`dialectic-worker`). Single responsibility: construct every dependency and wire every processor for the worker's request lifecycle.
    * `[ ]`   This role is appropriate because `index.ts` is the only file that knows all concrete implementations and can bridge the `IJobContext` surface to the `ProcessEmbedJobDeps` contract.
    * `[ ]`   Out of scope: real EMBED embedding logic (lives in `processEmbedJob.ts`, WS-R); `enqueueModelCall` construction logic (already present, unchanged); any other processor implementations.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `index.ts` and `index.test.ts` only.
    * `[ ]`   Inside boundary: `defaultProcessors` object literal in `handleJob`; the `createJobContext(...)` call in `createDialecticWorkerDeps`.
    * `[ ]`   Outside boundary: `createDialecticWorkerDeps` env-var validation logic (not touched); `serve()` request handler (not touched); all existing processor implementations (not touched); `processEmbedJob` business logic (WS-R node).

  * `[ ]`   `deps`
    * `[ ]`   `processEmbedJob` (inward, `./processEmbedJob/processEmbedJob.ts`, WS-R) — the real EMBED handler. Direction: inward (worker sub-module). Purpose: called inside the `defaultProcessors.processEmbedJob` closure.
    * `[ ]`   `BoundEnqueueModelCallFn` (inward, `./enqueueModelCall/enqueueModelCall.interface.ts`, already imported) — type for `boundEnqueueModelCall`; already constructed in factory; no new import needed.
    * `[ ]`   `IJobProcessors` (inward, `dialectic-service/dialectic.interface.ts`, updated in WS-R `processJob.ts` node) — now requires `processEmbedJob: ProcessEmbedJobFn`; satisfied by the new `defaultProcessors` entry.
    * `[ ]`   `IJobContext` (inward, `./createJobContext/JobContext.interface.ts`, updated in WS-S `createJobContext.ts` node) — now requires `enqueueModelCall: BoundEnqueueModelCallFn`; satisfied by the new pass-through.
    * `[ ]`   Confirm: no reverse dependency introduced; `index.ts` is a leaf composition root with no consumers.

  * `[ ]`   `context_slice`
    * `[ ]`   From `processEmbedJob`: only the default export function `processEmbedJob(deps, params)`.
    * `[ ]`   From `IJobContext`: only `ctx.enqueueModelCall` (accessed inside the `defaultProcessors.processEmbedJob` closure).
    * `[ ]`   From `boundEnqueueModelCall`: only the already-constructed value — no new surface fetched.
    * `[ ]`   No over-fetching; no hidden coupling.

  * `[ ]`   supabase/functions/dialectic-worker/`index.test.ts` 
    * `[ ]`   **Add** `Deno.test('createDialecticWorkerDeps: wires enqueueModelCall onto returned context', ...)` following the pattern of the existing `wires computeJobSig as a function` test (~L1619). Call `createDialecticWorkerDeps(mockSupabaseClientDeps.client ...)`. Assert `typeof deps.enqueueModelCall === 'function'`. Do NOT test `enqueueModelCall` behavior (own unit in `enqueueModelCall.test.ts`).
    * `[ ]`   **Add** `Deno.test('handleJob: EMBED job routes to processEmbedJob and no other processor', ...)` following the pattern of existing `handleJob` dispatch tests. Call `handleJob` with a mock job (`job_type: 'EMBED'`) and a `testProcessors` spy set built from `createMockJobProcessors()` (updated in WS-R `processJob.ts` node to include `processEmbedJob`). Assert `spies.processEmbedJob.calls.length === 1`. Assert `spies.processSimpleJob.calls.length === 0`. Assert `spies.processComplexJob.calls.length === 0`. Assert `spies.processRenderJob.calls.length === 0`.
    * `[ ]`   Do NOT re-test: existing `createDialecticWorkerDeps` dep wiring; existing dispatch paths for EXECUTE/PLAN/RENDER; `processEmbedJob` internal behavior.

  * `[ ]`   `construction`
    * `[ ]`   `handleJob` and `createDialecticWorkerDeps` are plain exported async functions. No constructor concerns.
    * `[ ]`   `boundEnqueueModelCall` is already constructed before the `createJobContext(...)` call — initialization order is unchanged.
    * `[ ]`   `defaultProcessors` is built inside `handleJob` after `deps` is available — `deps.enqueueModelCall` (from `IJobContext`) is in scope when the closure executes.
    * `[ ]`   No partially constructed state: `processEmbedJob` closure captures `ctx.enqueueModelCall` at call time (not at construction time), consistent with the pattern used by all other processor closures.

  * `[ ]`   supabase/functions/dialectic-worker/`index.ts`
    * `[ ]`   After the `import { processRenderJob }` line (~L39), add: `import { processEmbedJob } from './processEmbedJob/processEmbedJob.ts';`
    * `[ ]`   In `createDialecticWorkerDeps`, in the `return createJobContext({...})` argument object, after the `computeJobSig` field, add: `enqueueModelCall: boundEnqueueModelCall,`
    * `[ ]`   In `handleJob`, in the `defaultProcessors` object literal (~L275), after the `processRenderJob` entry (~L287–289), add:
      ```typescript
      processEmbedJob: async (_dbClient, job, _projectOwnerUserId, ctx, token) => {
        await processEmbedJob(
          { enqueueModelCall: ctx.enqueueModelCall },
          { dbClient: adminClient, job, authToken: token },
        );
      },
      ```
      Note: `adminClient` is already in scope in `handleJob` (it is the first parameter). `_dbClient` is the processor-contract parameter (same value, prefixed with `_` because the closure captures `adminClient` directly, matching the pattern of `processSimpleJob` and `processComplexJob` closures). `_projectOwnerUserId` is unused — the EMBED handler derives attribution from the job payload.
    * `[ ]`   No other changes.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: composition root (`dialectic-worker`). All deps are inward (sub-modules, shared interfaces, infrastructure services). No outward deps introduced.
    * `[ ]`   No cycles. `index.ts` is a terminal composition node; no module in this codebase imports from it.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `defaultProcessors` satisfies `IJobProcessors` — `index.ts` compiles without error after WS-R adds `processEmbedJob: ProcessEmbedJobFn` to the interface.
    * `[ ]`   `createDialecticWorkerDeps(...)` returns an `IJobContext` with `enqueueModelCall` set to a function — `typeof deps.enqueueModelCall === 'function'` is `true`.
    * `[ ]`   `handleJob` called with a job whose `job_type === 'EMBED'`: `processEmbedJob` is called exactly once; no other processor is called.
    * `[ ]`   All existing `createDialecticWorkerDeps` tests pass unchanged.

  * `[ ]`   **Commit** `feat(dialectic-worker): WS-R + WS-S — EMBED first-class job type, processEmbedJob wired, enqueueModelCall in context`
    * `[ ]`   Structural: `processEmbedJob` added to `IJobProcessors`; `enqueueModelCall` added to `IJobContext`; `processEmbedJob/` directory created.
    * `[ ]`   Behavioral: EMBED jobs now route to the real `processEmbedJob` handler via `defaultProcessors`; `enqueueModelCall` is available to all job-context consumers.
    * `[ ]`   Contract: `IJobProcessors.processEmbedJob: ProcessEmbedJobFn` (WS-R); `IJobContext.enqueueModelCall: BoundEnqueueModelCallFn` (WS-S).

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