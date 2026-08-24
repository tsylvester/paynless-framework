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

* **Compression Jobs Implementation**

## saveResponse Decomposition

* `[✅]`   supabase/functions/dialectic-worker/persistContributionRelationships/persistContributionRelationships.ts **[BE] The continuation and init-and-merge branches with both `dialectic_contributions` updates, returning the row the database holds**

   * `[✅]`   `objective`
      * `[✅]`   The relationship-persistence block inside `saveResponse.ts` re-derives `document_relationships` from `jobPayloadUnknown` with `isRecord` probes three separate times, having already been handed a payload the orchestrator proved. It converts both `dialectic_contributions` update failures into a `RenderJobValidationError` whose message says `document_relationships[stage] is required and must be persisted before RENDER job creation`, so a transient driver failure is reported as a missing requirement and the driver's own message is discarded. A continuation whose payload carries no valid `document_relationships` matches neither `if` and falls through silently, writing nothing and reporting nothing. And both branches assign onto `contribution.document_relationships`, mutating an object the caller owns instead of returning what was written.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/persistContributionRelationships/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `PersistContributionRelationshipsReturn`.
         * `[✅]`   The payload slot is `PersistContributionRelationshipsPayload`, declared in this module's interface as equivalent to `DialecticExecuteJobPayload`, received already proven, and read as the arm declares it: `document_relationships` is `DocumentRelationships | null | undefined` and `stageSlug` is `DialecticStage['slug'] | undefined`. Neither is re-guarded at this module's use site, and no `isRecord` probe of the payload survives.
         * `[✅]`   The success arm carries the row the database holds. Each write is followed by a return whose `contribution` is a new object composed from `params.contribution` and the relationships just written; the write's own success is the proof the database holds them, and no read-back is performed. `params.contribution` is not mutated on any path.
         * `[✅]`   The success arm has two flavors, discriminated by `persisted`: a write occurred, or the row already carried this stage's own id and none was needed.
         * `[✅]`   Every failure returns its own typed error on the error arm. Both update failures return one error carrying the table's driver message and `retriable: true`. A continuation whose payload carries no valid `document_relationships` returns its own typed error rather than falling through.
         * `[✅]`   The merge semantics are preserved exactly: which entries survive, the `source_group` initialization from an explicitly null payload member, the `ContributionType` requirement on the stage key, and both post-write verifications in their existing positions.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node. Where a consumer calls this module is stated there, not here.
         * `[✅]`   No file outside `dialectic-worker/persistContributionRelationships/` is edited. Every guard and fixture this node needs already exists at the paths named under `deps`.
         * `[✅]`   The two post-write verifications are preserved after their writes, not before them.
         * `[✅]`   The entry-copy loop drops `isContinuation` and `turnIndex`, both declared on `DocumentRelationships` and neither a string, exactly as the source drops them.
         * `[✅]`   `isRecord` gates `needsInit` and `isDocumentRelationships` gates the entry copy. A row whose relationships are a record carrying this stage's own id but an invalid value elsewhere leaves `needsInit` false under `isRecord` and true under `isDocumentRelationships`.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer persister: given a proven EXECUTE payload, a saved contribution row and the continuation verdict, write that contribution's `document_relationships` and return the row carrying them.
      * `[✅]`   The role is correct because both branches converge on one column of one table, and everything that decides which branch runs is resolved before this module is called.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not derive `stageRelationshipForStage` and do not run the document-related check that consumes it. `finalizeContributionJob` holds the payload and the returned row and reads that value from them where it needs it.
         * `[✅]`   Do not dispatch a RENDER job, notify, continue, assemble a final document, or update the job row.
         * `[✅]`   Do not upload, build an upload context, or resolve storage identity; `fileManager`, `buildUploadContext` and `resolveContributionIdentity` own those.
         * `[✅]`   Do not re-guard the payload, do not re-derive `isContinuationForStorage`, and do not read the row back after writing it.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/persistContributionRelationships` — persisting one contribution's `document_relationships` and returning the row that carries them.
      * `[✅]`   Inside boundary:
         * `[✅]`   The stage-slug invariant, the continuation write with its relationships invariant and its stage-entry verification, the `needsInit` decision, the merge assembly with its `source_group` initialization and its `ContributionType` requirement, the init write with its merged-entry verification, and the composition of the returned row.
         * `[✅]`   `PersistContributionRelationshipsDeps`, `PersistContributionRelationshipsParams`, `PersistContributionRelationshipsPayload`, both success flavors, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow` and `DocumentRelationships`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `ContributionType` and `DialecticStage`, owned by `packages/types/src/dialectic.types.ts`.
         * `[✅]`   `isDocumentRelationships`, `isContributionType`, `isDialecticExecuteJobPayload`, `isDialecticContribution` and `isDialecticJobRow`, owned by `_shared/utils/type-guards/type_guards.dialectic.ts`; `isRecord`, owned by `_shared/utils/type-guards/type_guards.common.ts`.
         * `[✅]`   Who decides `isContinuationForStorage`, who saved the contribution, and what reads the persisted relationships afterwards.

   * `[✅]`   `deps`
      * `[✅]`   Provider: none. No branch of the contract below invokes an injected collaborator; the block this module replaces logs nothing and calls nothing but the database client it is handed.
         * `[✅]`   Layer classification: not applicable.
         * `[✅]`   Direction: not applicable.
         * `[✅]`   Purpose: `PersistContributionRelationshipsDeps` is declared and supplied as part of the contract. It is declared as `Record<never, never>` rather than an empty interface, which the linter rejects.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `DocumentRelationships`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the arm this module's payload type is declared equivalent to, the row supplying the job id its errors name, the row this module writes to and returns, and the shape of the column it writes.
      * `[✅]`   Provider: `packages/types/src/dialectic.types.ts` (`ContributionType`, `DialecticStage`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the key type the merge requires of the stage slug, and the slug type the payload declares.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDocumentRelationships`, `isContributionType`, `isDialecticExecuteJobPayload`, `isDialecticContribution`, `isDialecticJobRow`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: narrowing the row's `Json | null` relationships column, admitting the stage key into the merge, and the three imported guards this module's own guards delegate to. `isContributionType` takes a `string`, so it is reached only after the stage slug is proven a non-empty string. All are called, never injected.
         * `[✅]`   Located, compliant, and used as they are: `isDialecticContribution` narrows to `DialecticContributionRow` under a name that says `Contribution`, and `isDialecticExecuteJobPayload` throws a per-member diagnostic rather than returning `false`. Both are the repo's guards for these types and both are consumed as found.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.common.ts` (`isRecord`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the `needsInit` gate and the record check inside each of this module's own guards. This is the single definition of `isRecord` in the repo.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the injected client the two updates run against.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticContributionRow`, `invalidateDialecticContributionRow`, `buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildDialecticExecuteJobPayload`, `invalidateDialecticExecuteJobPayload`, `buildDocumentRelationships`, `invalidateDocumentRelationships`), `_shared/supabase.mock.ts` (`createMockSupabaseClient`).
         * `[✅]`   Layer classification: shared test fixture surfaces.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the four imported types' fixtures and the injected client configured per update outcome. Each of the four types carries the complete four-symbol family under its production name; none is rebuilt here.
      * `[✅]`   Confirm:
         * `[✅]`   `PersistContributionRelationshipsDeps` declares nothing. The database client, the job row, the contribution row and the continuation verdict are per-invocation params.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From the hub and `packages/types`: the six named types only, imported with `import type`.
         * `[✅]`   From the two guard modules: the six named functions only, as value imports.
         * `[✅]`   From `types_db.ts`: `Database` only, imported with `import type`.

   * `[✅]`   `persistContributionRelationships.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves the deps surface is empty: `Record<keyof PersistContributionRelationshipsDeps, true>` over no keys, asserting zero.
      * `[✅]`   A case proves the params surface exhaustively: `Record<keyof PersistContributionRelationshipsParams, true>` over `dbClient`, `job`, `contribution` and `isContinuationForStorage`, asserting four.
      * `[✅]`   A case proves the payload surface exhaustively: `Record<keyof PersistContributionRelationshipsPayload, true>` over `sessionId`, `projectId`, `stageSlug`, `iterationNumber`, `walletId`, `continueUntilComplete`, `maxRetries`, `continuation_count`, `target_contribution_id`, `user_jwt`, `is_test_job`, `model_slug`, `idempotencyKey`, `maxOutputTokens`, `model_id`, `sourceContributionId`, `source_prompt_resource_id`, `prompt_template_id`, `prompt_template_name`, `output_type`, `canonicalPathParams`, `inputs`, `document_key`, `branch_key`, `parallel_group`, `planner_metadata`, `document_relationships`, `isIntermediate` and `context_for_documents`, asserting twenty-nine.
      * `[✅]`   A case proves the persisted-return surface: `Record<keyof PersistContributionRelationshipsPersistedReturn, true>` over `persisted` and `contribution`, asserting two.
      * `[✅]`   A case proves the unchanged-return surface: `Record<keyof PersistContributionRelationshipsUnchangedReturn, true>` over `persisted` and `contribution`, asserting two.
      * `[✅]`   A case proves the success-return surface: `Record<keyof PersistContributionRelationshipsSuccessReturn, true>` over `persisted` and `contribution`, asserting two.
      * `[✅]`   A case proves the error-return surface: `Record<keyof PersistContributionRelationshipsErrorReturn, true>` over `error` and `retriable`, asserting two.
      * `[✅]`   A case proves error-arm membership in the return union: a `PersistContributionRelationshipsErrorReturn` value constructed with an owned error class assigns to `PersistContributionRelationshipsReturn`.
      * `[✅]`   A case per owned error proves the surface of its constructor-params type by `Record<keyof …ConstructorParams, true>`: `StageSlugMissingError` over `jobId` and `contributionId` asserting two, `RelationshipsMissingError` over `jobId` and `contributionId` asserting two, `UpdateError` over `jobId`, `contributionId`, `stageSlug` and `driverMessage` asserting four, `StageEntryError` over `jobId`, `contributionId` and `stageSlug` asserting three, `StageSlugTypeError` over `jobId`, `contributionId` and `stageSlug` asserting three, `MergedEntryError` over `jobId`, `contributionId` and `stageSlug` asserting three.
      * `[✅]`   A case proves the async return type: `ReturnType<PersistContributionRelationshipsFn>` assigned from `Promise.resolve(errorReturn)`, that assigned to `Promise<PersistContributionRelationshipsReturn>`, asserted `instanceof Promise`.

   * `[✅]`   `persistContributionRelationships.interface.ts`
      * `[✅]`   `export type PersistContributionRelationshipsDeps = Record<never, never>;` — the contract slot, declared with no members.
      * `[✅]`   `export interface PersistContributionRelationshipsParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; contribution: DialecticContributionRow; isContinuationForStorage: boolean; }` — `isContinuationForStorage` is a value `resolveContributionIdentity` produced this invocation.
      * `[✅]`   `export type PersistContributionRelationshipsPayload = DialecticExecuteJobPayload;`
      * `[✅]`   `export interface PersistContributionRelationshipsPersistedReturn { persisted: true; contribution: DialecticContributionRow; }` and `export interface PersistContributionRelationshipsUnchangedReturn { persisted: false; contribution: DialecticContributionRow; }`.
      * `[✅]`   `export type PersistContributionRelationshipsSuccessReturn = PersistContributionRelationshipsPersistedReturn | PersistContributionRelationshipsUnchangedReturn;` — the two discrete successful outcomes, both members of the one success arm.
      * `[✅]`   `export type PersistContributionRelationshipsErrorReturn = { error: Error; retriable: boolean };` — every inhabitant is an owned class extending `Error`; consumers discriminate by the guards below.
      * `[✅]`   `export type PersistContributionRelationshipsReturn = PersistContributionRelationshipsSuccessReturn | PersistContributionRelationshipsErrorReturn;` — exactly two arms.
      * `[✅]`   `export type PersistContributionRelationshipsFn = (deps: PersistContributionRelationshipsDeps, params: PersistContributionRelationshipsParams, payload: PersistContributionRelationshipsPayload) => Promise<PersistContributionRelationshipsReturn>;`
      * `[✅]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `PersistContributionRelationshipsStageSlugMissingError { jobId; contributionId }`, `PersistContributionRelationshipsRelationshipsMissingError { jobId; contributionId }`, `PersistContributionRelationshipsUpdateError { jobId; contributionId; stageSlug; driverMessage }`, `PersistContributionRelationshipsStageEntryError { jobId; contributionId; stageSlug }`, `PersistContributionRelationshipsStageSlugTypeError { jobId; contributionId; stageSlug }`, `PersistContributionRelationshipsMergedEntryError { jobId; contributionId; stageSlug }`.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[✅]`   `persistContributionRelationships.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Stage slug: `stageSlug` is `payload.stageSlug`. Branch, condition it is absent or empty after trim: return the error arm carrying `PersistContributionRelationshipsStageSlugMissingError` built from `params.job.id` and `params.contribution.id`, with `retriable: false`. The arm declares the member optional, so its presence is an invariant this module owns.
      * `[✅]`   Branch, condition `params.isContinuationForStorage` and `payload.document_relationships` is absent or null: return the error arm carrying `PersistContributionRelationshipsRelationshipsMissingError` built from the job id and the contribution id, with `retriable: false`. No write is attempted.
      * `[✅]`   Continuation write, condition `params.isContinuationForStorage` and `payload.document_relationships` present: `params.dbClient.from('dialectic_contributions').update({ document_relationships: payload.document_relationships }).eq('id', params.contribution.id)`.
      * `[✅]`   Branch, condition that update returned a driver error: return the error arm carrying `PersistContributionRelationshipsUpdateError` built from the job id, the contribution id, the stage slug and the driver's message, with `retriable: true`. The driver's message is carried, never replaced.
      * `[✅]`   Branch, condition the write succeeded and `payload.document_relationships[stageSlug]` is absent, not a string, or empty after trim: return the error arm carrying `PersistContributionRelationshipsStageEntryError` built from the job id, the contribution id and the stage slug, with `retriable: false`. This verification sits after its write, exactly where the source runs it.
      * `[✅]`   Branch, condition the write succeeded and that entry is a non-empty string: return the success arm's persisted flavor, `persisted: true`, whose `contribution` is a new object composed from `params.contribution` with `document_relationships` set to `payload.document_relationships`. No read-back is performed: the write reported no error, so the database holds what was sent.
      * `[✅]`   Init decision, condition `params.isContinuationForStorage` is false: `existing` is `params.contribution.document_relationships`, the row's `Json | null` column; `existingStageValue` is `existing[stageSlug]` when `isRecord(existing)` holds. `needsInit` is true when `isRecord(existing)` fails, or `existingStageValue` is not a string, or is empty after trim, or does not equal `params.contribution.id`.
      * `[✅]`   Branch, condition `needsInit` is false: return the success arm's unchanged flavor, `persisted: false`, carrying `params.contribution` as received. No write is attempted.
      * `[✅]`   Merge assembly, condition `needsInit` is true: `merged` starts empty and takes each own entry of `existing` whose value is a string and whose key is either a `ContributionType` or `source_group`, and only when `isDocumentRelationships(existing)` holds. `isContinuation` and `turnIndex` are not strings and are therefore not carried.
      * `[✅]`   Merge, `source_group`: condition `payload.document_relationships.source_group` is explicitly `null`, `merged.source_group` is set to `params.contribution.id`. An absent `document_relationships`, and a `source_group` that is absent or a string, each leave `merged.source_group` as the copy loop left it.
      * `[✅]`   Branch, condition `isContributionType(stageSlug)` fails: return the error arm carrying `PersistContributionRelationshipsStageSlugTypeError` built from the job id, the contribution id and the stage slug, with `retriable: false`. No write is attempted. The check runs after the `source_group` initialization and before the stage key is set, exactly where the source runs it.
      * `[✅]`   Merge, stage key: `merged[stageSlug]` is set to `params.contribution.id`.
      * `[✅]`   Init write: `params.dbClient.from('dialectic_contributions').update({ document_relationships: merged }).eq('id', params.contribution.id)`.
      * `[✅]`   Branch, condition that update returned a driver error: return the error arm carrying `PersistContributionRelationshipsUpdateError` built from the job id, the contribution id, the stage slug and the driver's message, with `retriable: true`.
      * `[✅]`   Branch, condition the write succeeded and `merged[stageSlug]` is absent, not a string, empty after trim, or not equal to `params.contribution.id`: return the error arm carrying `PersistContributionRelationshipsMergedEntryError` built from the job id, the contribution id and the stage slug, with `retriable: false`. The branch is reachable because an empty `params.contribution.id` satisfies the assignment and fails this check.
      * `[✅]`   Branch, condition the write succeeded and that entry equals `params.contribution.id`: return the success arm's persisted flavor, `persisted: true`, whose `contribution` is a new object composed from `params.contribution` with `document_relationships` set to `merged`.
      * `[✅]`   Ordering and side effects: at most one write on any path, and none on the unchanged flavor or on any branch that returns before its write; no read; neither `params` nor `payload` is mutated, and neither `params.contribution` nor `payload.document_relationships` is carried by reference into a written object.

   * `[✅]`   `persistContributionRelationships.mock.ts`
      * `[✅]`   `PersistContributionRelationshipsDepsOverrides`, `buildPersistContributionRelationshipsDeps`, `PersistContributionRelationshipsDepsCorruptions` and `invalidatePersistContributionRelationshipsDeps`; the builder returns the empty deps object the type declares.
      * `[✅]`   `PersistContributionRelationshipsParamsOverrides`, `buildPersistContributionRelationshipsParams`, `PersistContributionRelationshipsParamsCorruptions` and `invalidatePersistContributionRelationshipsParams`; the builder's base client is `createMockSupabaseClient()`'s client, its `job` composes `buildDialecticJobRow()`, its `contribution` composes `buildDialecticContributionRow()`, and its `isContinuationForStorage` defaults to `false` so a continuation case must override it.
      * `[✅]`   `PersistContributionRelationshipsPayloadOverrides`, `buildPersistContributionRelationshipsPayload`, `PersistContributionRelationshipsPayloadCorruptions` and `invalidatePersistContributionRelationshipsPayload`; the builder composes `buildDialecticExecuteJobPayload()` rather than restating that arm's defaults, and supplies a `stageSlug` that is a valid `ContributionType` so the ordinary path reaches the merge. The four symbols are owned here.
      * `[✅]`   The four symbols for each of `PersistContributionRelationshipsPersistedReturn`, `PersistContributionRelationshipsUnchangedReturn` and `PersistContributionRelationshipsErrorReturn`; each return builder's `contribution` composes `buildDialecticContributionRow()`, and the error builder composes `buildPersistContributionRelationshipsUpdateError()`.
      * `[✅]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[✅]`   `mockPersistContributionRelationships: PersistContributionRelationshipsFn` returning `buildPersistContributionRelationshipsPersistedReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator for `DialecticJobRow`, `DialecticContributionRow`, `DialecticExecuteJobPayload` or `DocumentRelationships` is written here; all four are imported types whose complete four-symbol families live in `_shared/dialectic.mock.ts`, located above.

   * `[✅]`   `persistContributionRelationships.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isPersistContributionRelationshipsDeps`: accepts the built deps; accepts an empty object; rejects `null`, `undefined`, a primitive and an array.
      * `[✅]`   `isPersistContributionRelationshipsParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` absent and set to `invalidateDialecticJobRow({ id: 42 })`; rejects `contribution` absent and set to `invalidateDialecticContributionRow({ id: null })`; rejects `isContinuationForStorage` absent and non-boolean; rejects a non-record root.
      * `[✅]`   `isPersistContributionRelationshipsPayload`: accepts the built payload; rejects each of `prompt_template_id`, `output_type`, `canonicalPathParams` and `inputs` corrupted in turn via `invalidatePersistContributionRelationshipsPayload`; rejects `document_relationships` set to `invalidateDocumentRelationships({ source_group: 42 })`; rejects a non-record root.
      * `[✅]`   `isPersistContributionRelationshipsPersistedReturn`: accepts the built return; rejects `persisted` absent, `false` and non-boolean; rejects `contribution` absent and failing its owner's guard; rejects the unchanged return; rejects the error return; rejects a non-record root.
      * `[✅]`   `isPersistContributionRelationshipsUnchangedReturn`: the mirror checklist, rejecting `persisted` set to `true` and rejecting the persisted return.
      * `[✅]`   `isPersistContributionRelationshipsErrorReturn`: accepts the built return; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects both success flavors; rejects a non-record root.
      * `[✅]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[✅]`   `persistContributionRelationships.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isPersistContributionRelationshipsDeps`, `isPersistContributionRelationshipsParams`, `isPersistContributionRelationshipsPayload`, `isPersistContributionRelationshipsPersistedReturn`, `isPersistContributionRelationshipsUnchangedReturn`, `isPersistContributionRelationshipsErrorReturn`, and one `instanceof` guard per owned error class.
      * `[✅]`   `isPersistContributionRelationshipsDeps` requires only that the value is a record. The deps type declares no member, so there is no member to check and none is invented.
      * `[✅]`   `isPersistContributionRelationshipsParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — calls the imported `isDialecticJobRow` on `job`, calls the imported `isDialecticContribution` on `contribution`, and requires `isContinuationForStorage` to be a boolean.
      * `[✅]`   `isPersistContributionRelationshipsPayload` calls the imported `isDialecticExecuteJobPayload`, catching the per-member diagnostic that guard throws and returning `false`, so this guard keeps a boolean contract while the arm guard keeps its throwing one.
      * `[✅]`   `isPersistContributionRelationshipsPersistedReturn` requires `persisted` to be exactly `true` and calls the imported `isDialecticContribution` on `contribution`; `isPersistContributionRelationshipsUnchangedReturn` requires `persisted` to be exactly `false` and the same of `contribution`.
      * `[✅]`   `isPersistContributionRelationshipsErrorReturn` requires `error instanceof Error` and `retriable` a boolean. The arms are mutually exclusive, so a value passes exactly one.
      * `[✅]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[✅]`   No guard is written here for `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow` or `DocumentRelationships`; none is owned by this interface, and each already has one in `_shared/utils/type-guards/type_guards.dialectic.ts`.

   * `[✅]`   `persistContributionRelationships.test.ts`
      * `[✅]`   Deps fixtures are `buildPersistContributionRelationshipsDeps()`, params `buildPersistContributionRelationshipsParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the update outcome the case turns on, and payload `buildPersistContributionRelationshipsPayload({ … })`.
      * `[✅]`   Stage slug invariant: a payload with no `stageSlug`, and one whose slug is whitespace, each return the error arm whose error passes `isPersistContributionRelationshipsStageSlugMissingError`, with no update performed.
      * `[✅]`   Continuation relationships invariant: a continuation whose payload `document_relationships` is absent, and one whose member is null, each return the error arm whose error passes `isPersistContributionRelationshipsRelationshipsMissingError`, with no update performed.
      * `[✅]`   Continuation write: a continuation whose relationships carry the stage entry updates `dialectic_contributions` once with exactly those relationships, filtered on the contribution's id, and returns the persisted flavor whose `contribution.document_relationships` equals the payload's. The payload's relationships and the contribution's id are arranged as values distinct from every builder default, so a case reading the wrong source cannot pass.
      * `[✅]`   Continuation verification: a continuation whose relationships carry no entry for the stage, and one whose entry is an empty string, each return the error arm whose error passes `isPersistContributionRelationshipsStageEntryError` — and each performs the update first, the case asserting the write happened, which is the behavior the source has.
      * `[✅]`   Unchanged flavor: a non-continuation whose contribution already carries `document_relationships[stageSlug]` equal to its own id returns the unchanged flavor carrying that contribution, with no update performed.
      * `[✅]`   Init decision: three non-continuation cases — relationships absent, relationships a record whose stage entry is not a string, and relationships whose stage entry is a different contribution's id — each reach the merge and update once. The foreign id differs from the contribution's own, so the case cannot pass by treating them as equal.
      * `[✅]`   Merge copy: a contribution whose relationships carry one valid `ContributionType` entry, a `source_group` string, an `isContinuation` boolean and a `turnIndex` number yields merged relationships carrying the first two and neither of the last two, asserted against independent literals.
      * `[✅]`   Source group initialization: a payload whose `document_relationships.source_group` is explicitly null yields merged relationships whose `source_group` equals the contribution's id; a payload whose `source_group` is a string, and one with no `document_relationships`, each leave the merged `source_group` as the copy loop produced it.
      * `[✅]`   Stage key type: a non-continuation whose `stageSlug` is a non-empty string that is not a `ContributionType` returns the error arm whose error passes `isPersistContributionRelationshipsStageSlugTypeError`, with no update performed.
      * `[✅]`   Merged verification: a non-continuation whose contribution id is an empty string returns the error arm whose error passes `isPersistContributionRelationshipsMergedEntryError` after the update ran.
      * `[✅]`   Update failures surfaced: a driver error on the continuation write and a driver error on the init write each return the error arm whose error passes `isPersistContributionRelationshipsUpdateError`, carries the driver's message and the stage slug, and is `retriable` true. Each case's driver message is a distinct literal, so an error carrying the wrong one cannot pass.
      * `[✅]`   Purity: neither the params object nor the payload object is mutated by any path; the returned `contribution` is not `params.contribution`; and the returned relationships are neither `payload.document_relationships` nor `params.contribution.document_relationships` by reference.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`; this node constructs nothing at a boundary.

   * `[✅]`   `persistContributionRelationships.ts`
      * `[✅]`   One exported function, typed `PersistContributionRelationshipsFn`, implementing the interaction spec in its stated order: stage slug, continuation relationships invariant, continuation write and verification, init decision, merge assembly with its `source_group` initialization and stage-key requirement, init write and verification, success.
      * `[✅]`   The resolved stage slug, the assembled merge object and each returned row are held in one typed local apiece; none is inferred and none is widened at its use site.
      * `[✅]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no write failure is swallowed or converted.

   * `[✅]`   `persistContributionRelationships.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, `packages/types` and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: this node edits no file outside its own folder.

   * `[✅]`   `requirements`
      * `[✅]`   The return union has exactly two arms — interface test. Both success flavors are declared inside the success arm — interface.
      * `[✅]`   `PersistContributionRelationshipsParams` declares `isContinuationForStorage`, the produced value this module does not re-derive — interface test.
      * `[✅]`   `PersistContributionRelationshipsDeps` is declared and inhabited by the empty object — interface test.
      * `[✅]`   `PersistContributionRelationshipsPayload` is declared equivalent to `DialecticExecuteJobPayload` — interface.
      * `[✅]`   The two success flavors reject each other on their literal discriminant — guard test.
      * `[✅]`   The payload guard returns `false` for a payload the arm guard throws on — guard test.
      * `[✅]`   An absent or empty `stageSlug` returns its own typed error before any write — unit test.
      * `[✅]`   A continuation with no `document_relationships` returns its own typed error instead of falling through silently — unit test.
      * `[✅]`   Either update's driver error returns one typed error carrying that driver's message with `retriable` true — unit test.
      * `[✅]`   Each post-write verification returns its own typed error and runs after its write — unit test.
      * `[✅]`   A stage slug that is not a `ContributionType` returns its own typed error before the init write — unit test.
      * `[✅]`   A contribution already carrying its own id for the stage returns the unchanged flavor with no write — unit test.
      * `[✅]`   The merge carries string `ContributionType` and `source_group` entries and drops `isContinuation` and `turnIndex` — unit test.
      * `[✅]`   An explicitly null payload `source_group` initializes the merged `source_group` to the contribution's id — unit test.
      * `[✅]`   Neither `params` nor `payload` is mutated, and the returned row and relationships are copies — unit test.

* `[✅]`   supabase/functions/dialectic-worker/finalizeContributionJob/finalizeContributionJob.ts **[BE] The RENDER dispatch, the prompt-resource back-link, notifications, continuation, final-document assembly and job-row completion, with every failure returned instead of logged and walked past**

   * `[✅]`   `objective`
      * `[✅]`   The finalization tail of the contribution path logs an error and continues for five distinct failure sites — RENDER dispatch failure, prompt-resource back-link update failure, continueJob failure, job-completion update failure, and assembleAndSaveFinalDocument failure — so a transient DB failure or a bad enqueue silently advances the happy path and the job row reaches `completed` with an incomplete record. Notification dispatch for `execute_chunk_completed` and `execute_completed` requires `document_key` from the raw payload, re-extracting it through `isRecord(jobPayloadUnknown)` after the orchestrator already proved the payload. And `modelProcessingResult.status` is written into the job row's `results` column via `JSON.stringify` after being set by mutation through the continuation block, so a missed assignment or a reordered block silently writes `completed` where `continuation_limit_reached` was intended.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/finalizeContributionJob/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `FinalizeContributionJobReturn`.
         * `[✅]`   The payload slot is `FinalizeContributionJobPayload`, declared equivalent to `DialecticExecuteJobPayload`, received already proven, and read directly: `payload.stageSlug`, `payload.user_jwt`, `payload.document_key`, `payload.source_prompt_resource_id`, `payload.continuation_count`, `payload.continueUntilComplete`, `payload.context_for_documents`, `payload.model_id`, `payload.sessionId`, `payload.projectId`, `payload.iterationNumber`, `payload.walletId`. No `isRecord(jobPayloadUnknown)` probe survives.
         * `[✅]`   The deps are `logger`, `notificationService`, `fileManager`, `continueJob` (typed `BoundContinueJobFn`) and `enqueueRenderJob` (typed `BoundEnqueueRenderJobFn`). `BoundContinueJobFn` is added to `continueJob/continueJob.interface.ts` as a single-line type alias stripping the `deps` parameter, matching the pattern `BoundEnqueueRenderJobFn` already uses in `enqueueRenderJob/enqueueRenderJob.interface.ts`.
         * `[✅]`   The params are `dbClient`, `job`, `contribution` (after `persistContributionRelationships`), `assembledResponse` (the `UnifiedAIResponse`), `preparedContentResult` (the `PrepareResponseContentPreparedReturn`), `storageFileType` (from `resolveContributionIdentity`), and `isContinuationForStorage` (from `resolveContributionIdentity`).
         * `[✅]`   The success arm carries `status: 'completed' | 'needs_continuation' | 'continuation_limit_reached'`, derived inside this module from `preparedContentResult.needsContinuation` and the `modelProcessingResult.status` mutation.
         * `[✅]`   Every failure returns its own typed error on the error arm. RENDER dispatch failure, prompt-resource back-link DB failure, continueJob error, and job-completion update DB failure each return a distinct owned error class instead of logging and continuing. `document_key` validation failures for notifications return `FinalizeContributionJobDocumentKeyError`.
         * `[✅]`   `stageRelationshipForStage` is derived from `params.contribution.document_relationships` via `isRecord` and `isDocumentRelationships`, and the document-related check requiring it before RENDER is preserved.
         * `[✅]`   RENDER dispatch is conditional on `!needsContinuation`, a valid `user_jwt`, and `isDialecticStageSlug(stageSlug)`.
         * `[✅]`   The continuation path calls `deps.continueJob`, handles `continuation_limit_reached` with cap assembly via `deps.fileManager.assembleAndSaveFinalDocument`, and sends the continuation notification.
         * `[✅]`   The final-chunk path (`resolvedFinishReason === 'stop'`) fires `execute_chunk_completed` (for document-related) and calls final document assembly.
         * `[✅]`   The job-completion update writes `status: 'completed'`, `results`, `completed_at`, and `attempt_count` to `dialectic_generation_jobs`.
         * `[✅]`   Completion notifications (`contribution_received`, `generation_complete`, `execute_completed` for non-intermediate document-related) fire on the non-continuation path.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it in the relocation node.
         * `[✅]`   The only file outside `dialectic-worker/finalizeContributionJob/` that this node edits is `continueJob/continueJob.interface.ts`, which gains the one-line `BoundContinueJobFn` export.
         * `[✅]`   Cap assembly and final-chunk assembly are conditional: each skips when `shouldRender` is true or when `rootId === params.contribution.id`.
         * `[✅]`   Neither `params` nor `payload` is mutated. `modelProcessingResult` is a local constructed inside the module and mutated only by the continuation-limit-reached branch.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer finalizer: given a saved contribution with persisted relationships, a proven EXECUTE payload, the assembled AI response, the prepared content verdict and the resolved storage identity, dispatch the RENDER job, link the prompt resource, send all lifecycle notifications, handle continuation or completion, assemble the final document when applicable, mark the job completed, and return a status discriminating the three terminal states.
      * `[✅]`   The role is correct because every operation in this module consumes the contribution row produced by `persistContributionRelationships` and the prepared content verdict produced by `prepareResponseContent`, and every downstream notification, continuation, and job-row update depends on both.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not assemble the AI response, sanitize content, resolve contribution identity, upload the contribution, persist relationships, or resolve the finish reason. Those modules ran before this one.
         * `[✅]`   Do not re-guard the payload; the arm guard proved it upstream.
         * `[✅]`   Do not re-derive `isContinuationForStorage` or `storageFileType`; `resolveContributionIdentity` produced them and they arrive in `params`.
         * `[✅]`   Do not build the upload context or call `fileManager.uploadAndRegisterFile`; `saveContributionResponse` owns the upload.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/finalizeContributionJob` — RENDER dispatch, prompt-resource back-link, lifecycle notifications, continuation, final-document assembly, and job-row completion.
      * `[✅]`   Inside boundary:
         * `[✅]`   `stageRelationshipForStage` derivation from `params.contribution.document_relationships` via `isRecord` and `isDocumentRelationships` with the stage-slug lookup.
         * `[✅]`   The document-related validation requiring `stageRelationshipForStage`.
         * `[✅]`   RENDER dispatch: building `EnqueueRenderJobParams` and `EnqueueRenderJobPayload`, calling `deps.enqueueRenderJob`, evaluating the result via `isEnqueueRenderJobSuccessReturn`.
         * `[✅]`   Prompt-resource back-link: `dbClient.from('dialectic_project_resources').update({ source_contribution_id }).eq('id', sourcePromptResourceId)`.
         * `[✅]`   Chunk-completed notification assembly and dispatch.
         * `[✅]`   `ModelProcessingResult` construction and its `status` mutation on the continuation-limit-reached branch.
         * `[✅]`   Continuation path: `deps.continueJob` call, cap assembly (`rootIdForCapAssembly` derivation, `matchedContextForCap` lookup, `deps.fileManager.assembleAndSaveFinalDocument`), continuation notification.
         * `[✅]`   Final-chunk path: chunk-completed notification, final document assembly.
         * `[✅]`   Job-completion update: `dbClient.from('dialectic_generation_jobs').update(...)`.
         * `[✅]`   Completion notifications: `contribution_received`, `generation_complete`, `execute_completed`.
         * `[✅]`   `FinalizeContributionJobDeps`, `FinalizeContributionJobParams`, `FinalizeContributionJobPayload`, both return arms, the return union, the function type, and each owned error class with its constructor-params type.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `DocumentRelationships`, `UnifiedAIResponse`, `ModelProcessingResult`, `ContextForDocument`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `BoundEnqueueRenderJobFn`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, owned by `enqueueRenderJob/enqueueRenderJob.interface.ts`.
         * `[✅]`   `BoundContinueJobFn`, `ContinueJobParams`, `ContinueJobPayload`, `ContinueJobReturn`, owned by `continueJob/continueJob.interface.ts` (the bound form added by this node).
         * `[✅]`   `NotificationServiceType` and its event payload types, owned by `_shared/types/notification.service.types.ts`.
         * `[✅]`   `IFileManager`, owned by `_shared/types/file_manager.types.ts`.
         * `[✅]`   `ILogger`, owned by `_shared/types.ts`.
         * `[✅]`   `FileType`, `ModelContributionFileTypes`, `DialecticStageSlug`, `DocumentRelated`, owned by `_shared/types/file_manager.types.ts`.
         * `[✅]`   `PrepareResponseContentPreparedReturn`, owned by `prepareResponseContent/prepareResponseContent.interface.ts`.
         * `[✅]`   `isDocumentRelated`, `isDialecticStageSlug`, `isFileType`, `isContextForDocument`, owned by `_shared/utils/type-guards/type_guards.file_manager.ts`.
         * `[✅]`   `isDocumentRelationships`, owned by `_shared/utils/type-guards/type_guards.dialectic.ts`; `isRecord`, owned by `_shared/utils/type-guards/type_guards.common.ts`.
         * `[✅]`   `isEnqueueRenderJobSuccessReturn`, owned by `enqueueRenderJob/enqueueRenderJob.guards.ts`.
         * `[✅]`   Who decides `isContinuationForStorage`, who saved the contribution, and what reads the returned status afterwards.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[✅]`   Layer classification: shared adapter interface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: diagnostic logging throughout the module — RENDER skip warnings, continuation diagnostics, job-completion success log. Deps guard checks presence of `warn`, `info`, `error` methods.
      * `[✅]`   Provider: `_shared/types/notification.service.types.ts` (`NotificationServiceType`).
         * `[✅]`   Layer classification: shared adapter interface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: lifecycle event dispatch — `sendJobNotificationEvent`, `sendContributionReceivedEvent`, `sendContributionGenerationCompleteEvent`, `sendContributionGenerationContinuedEvent`. Deps guard checks presence of each used method.
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`IFileManager`).
         * `[✅]`   Layer classification: shared adapter interface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: `assembleAndSaveFinalDocument` for cap assembly (continuation-limit-reached) and final-chunk assembly. Deps guard checks presence of `assembleAndSaveFinalDocument` method.
      * `[✅]`   Provider: `enqueueRenderJob/enqueueRenderJob.interface.ts` (`BoundEnqueueRenderJobFn`).
         * `[✅]`   Layer classification: sibling module bound closure.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: RENDER dispatch. Deps guard checks `typeof value === 'function'`.
      * `[✅]`   Provider: `continueJob/continueJob.interface.ts` (`BoundContinueJobFn`).
         * `[✅]`   Layer classification: sibling module bound closure.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: continuation dispatch. Deps guard checks `typeof value === 'function'`. The type is added to the continueJob interface by this node.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `DocumentRelationships`, `UnifiedAIResponse`, `ModelProcessingResult`, `ContextForDocument`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the payload arm, the rows, the assembled response, the processing result structure, and the context-for-documents lookup type.
      * `[✅]`   Provider: `prepareResponseContent/prepareResponseContent.interface.ts` (`PrepareResponseContentPreparedReturn`).
         * `[✅]`   Layer classification: sibling module return type.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the `needsContinuation`, `resolvedFinishReason`, and `isIntermediate` values this module branches on.
      * `[✅]`   Provider: `enqueueRenderJob/enqueueRenderJob.interface.ts` (`EnqueueRenderJobParams`, `EnqueueRenderJobPayload`).
         * `[✅]`   Layer classification: sibling module contract types.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: typed construction of the RENDER dispatch arguments.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.file_manager.ts` (`isDocumentRelated`, `isDialecticStageSlug`, `isFileType`, `isContextForDocument`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: document-related branching, stage-slug validation for RENDER, file-type narrowing for RENDER payload, context-for-documents cap lookup.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDocumentRelationships`), `_shared/utils/type-guards/type_guards.common.ts` (`isRecord`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the `stageRelationshipForStage` derivation gate.
      * `[✅]`   Provider: `enqueueRenderJob/enqueueRenderJob.guards.ts` (`isEnqueueRenderJobSuccessReturn`).
         * `[✅]`   Layer classification: sibling module guard.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: discriminating the RENDER dispatch result.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the injected client the three DB operations run against.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticContributionRow`, `invalidateDialecticContributionRow`, `buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildDialecticExecuteJobPayload`, `invalidateDialecticExecuteJobPayload`, `buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`), `_shared/supabase.mock.ts` (`createMockSupabaseClient`), `_shared/utils/notification.service.mock.ts` (`mockNotificationService`), `_shared/services/file_manager.mock.ts` (`createMockFileManagerService`), `_shared/logger.mock.ts` (`MockLogger`), `prepareResponseContent/prepareResponseContent.mock.ts` (`buildPrepareResponseContentPreparedReturn`, `invalidatePrepareResponseContentPreparedReturn`), `enqueueRenderJob/enqueueRenderJob.mock.ts` (`buildEnqueueRenderJobSuccessReturn`), `continueJob/continueJob.mock.ts` (`buildContinueJobEnqueuedReturn`).
         * `[✅]`   Layer classification: shared and sibling test fixture surfaces.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the imported types' fixtures and the injected client/service mocks configured per outcome. Each imported type carries its complete four-symbol family under its production name; none is rebuilt here.
      * `[✅]`   Confirm:
         * `[✅]`   `FinalizeContributionJobDeps` declares exactly `logger`, `notificationService`, `fileManager`, `continueJob` and `enqueueRenderJob`. `dbClient`, `job`, `contribution`, `assembledResponse`, `preparedContentResult`, `storageFileType` and `isContinuationForStorage` are per-invocation params.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From `dialectic-service/dialectic.interface.ts`: the seven named types only, imported with `import type`.
         * `[✅]`   From `enqueueRenderJob/enqueueRenderJob.interface.ts`: `BoundEnqueueRenderJobFn`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, imported with `import type`.
         * `[✅]`   From `continueJob/continueJob.interface.ts`: `BoundContinueJobFn`, `ContinueJobParams`, `ContinueJobPayload`, imported with `import type`.
         * `[✅]`   From `prepareResponseContent/prepareResponseContent.interface.ts`: `PrepareResponseContentPreparedReturn`, imported with `import type`.
         * `[✅]`   From `_shared/types/notification.service.types.ts`: `NotificationServiceType`, imported with `import type`.
         * `[✅]`   From `_shared/types/file_manager.types.ts`: `IFileManager`, `FileType`, `ModelContributionFileTypes`, `DialecticStageSlug`, imported with `import type`.
         * `[✅]`   From `_shared/types.ts`: `ILogger`, imported with `import type`.
         * `[✅]`   From `types_db.ts`: `Database`, imported with `import type`.
         * `[✅]`   From the three guard modules: `isDocumentRelated`, `isDialecticStageSlug`, `isFileType`, `isContextForDocument`, `isDocumentRelationships`, `isRecord`, as value imports.
         * `[✅]`   From `enqueueRenderJob/enqueueRenderJob.guards.ts`: `isEnqueueRenderJobSuccessReturn`, value import.

   * `[✅]`   `finalizeContributionJob.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof FinalizeContributionJobDeps, true>` over `logger`, `notificationService`, `fileManager`, `continueJob` and `enqueueRenderJob`, asserting five.
      * `[✅]`   A case proves the params surface exhaustively: `Record<keyof FinalizeContributionJobParams, true>` over `dbClient`, `job`, `contribution`, `assembledResponse`, `preparedContentResult`, `storageFileType` and `isContinuationForStorage`, asserting seven.
      * `[✅]`   A case proves the payload surface exhaustively: `Record<keyof FinalizeContributionJobPayload, true>` over the full `DialecticExecuteJobPayload` member set — `sessionId`, `projectId`, `stageSlug`, `iterationNumber`, `walletId`, `continueUntilComplete`, `maxRetries`, `continuation_count`, `target_contribution_id`, `user_jwt`, `is_test_job`, `model_slug`, `idempotencyKey`, `maxOutputTokens`, `model_id`, `sourceContributionId`, `source_prompt_resource_id`, `prompt_template_id`, `prompt_template_name`, `output_type`, `canonicalPathParams`, `inputs`, `document_key`, `branch_key`, `parallel_group`, `planner_metadata`, `document_relationships`, `isIntermediate` and `context_for_documents`, asserting twenty-nine.
      * `[✅]`   A case proves the success-return surface: `Record<keyof FinalizeContributionJobSuccessReturn, true>` over `status`, asserting one.
      * `[✅]`   A case proves the error-return surface: `Record<keyof FinalizeContributionJobErrorReturn, true>` over `error` and `retriable`, asserting two.
      * `[✅]`   A case proves error-arm membership in the return union: a `FinalizeContributionJobErrorReturn` value constructed with an owned error class assigns to `FinalizeContributionJobReturn`.
      * `[✅]`   A case per owned error proves the surface of its constructor-params type by `Record<keyof …ConstructorParams, true>`: `FinalizeContributionJobDocumentRelatedError` over `jobId`, `contributionId` and `stageSlug` asserting three, `FinalizeContributionJobRenderDispatchError` over `jobId`, `contributionId` and `driverMessage` asserting three, `FinalizeContributionJobPromptLinkError` over `jobId`, `contributionId`, `promptResourceId` and `driverMessage` asserting four, `FinalizeContributionJobDocumentKeyError` over `jobId` and `notificationType` asserting two, `FinalizeContributionJobContinuationError` over `jobId` and `driverMessage` asserting two, `FinalizeContributionJobCompletionUpdateError` over `jobId` and `driverMessage` asserting two.
      * `[✅]`   A case proves the async return type: `ReturnType<FinalizeContributionJobFn>` assigned from `Promise.resolve(errorReturn)`, that assigned to `Promise<FinalizeContributionJobReturn>`, asserted `instanceof Promise`.

   * `[✅]`   `finalizeContributionJob.interface.ts`
      * `[✅]`   `export interface FinalizeContributionJobDeps { logger: ILogger; notificationService: NotificationServiceType; fileManager: IFileManager; continueJob: BoundContinueJobFn; enqueueRenderJob: BoundEnqueueRenderJobFn; }`.
      * `[✅]`   `export interface FinalizeContributionJobParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; contribution: DialecticContributionRow; assembledResponse: UnifiedAIResponse; preparedContentResult: PrepareResponseContentPreparedReturn; storageFileType: FileType; isContinuationForStorage: boolean; }`.
      * `[✅]`   `export type FinalizeContributionJobPayload = DialecticExecuteJobPayload;`
      * `[✅]`   `export interface FinalizeContributionJobSuccessReturn { status: 'completed' | 'needs_continuation' | 'continuation_limit_reached'; }`.
      * `[✅]`   `export type FinalizeContributionJobErrorReturn = { error: Error; retriable: boolean };` — every inhabitant is an owned class extending `Error`.
      * `[✅]`   `export type FinalizeContributionJobReturn = FinalizeContributionJobSuccessReturn | FinalizeContributionJobErrorReturn;` — exactly two arms.
      * `[✅]`   `export type FinalizeContributionJobFn = (deps: FinalizeContributionJobDeps, params: FinalizeContributionJobParams, payload: FinalizeContributionJobPayload) => Promise<FinalizeContributionJobReturn>;`
      * `[✅]`   One constructor-params interface and one class per owned failure, each taking a single typed params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `FinalizeContributionJobDocumentRelatedError { jobId; contributionId; stageSlug }`, `FinalizeContributionJobRenderDispatchError { jobId; contributionId; driverMessage }`, `FinalizeContributionJobPromptLinkError { jobId; contributionId; promptResourceId; driverMessage }`, `FinalizeContributionJobDocumentKeyError { jobId; notificationType }`, `FinalizeContributionJobContinuationError { jobId; driverMessage }`, `FinalizeContributionJobCompletionUpdateError { jobId; driverMessage }`.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[✅]`   `continueJob/continueJob.interface.ts` edit
      * `[✅]`   Add `export type BoundContinueJobFn = (params: ContinueJobParams, payload: ContinueJobPayload) => Promise<ContinueJobReturn>;` — one line, matching the pattern at `enqueueRenderJob/enqueueRenderJob.interface.ts` line 81. No other change to the file.

   * `[✅]`   `finalizeContributionJob.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Derived locals: `projectOwnerUserId` is `typeof params.job.user_id === 'string' ? params.job.user_id : ''`. `stageSlug` is `payload.stageSlug`. `fileType` is `payload.output_type`. `needsContinuation` is `params.preparedContentResult.needsContinuation`. `resolvedFinishReason` is `params.preparedContentResult.resolvedFinishReason`. `isIntermediate` is `params.preparedContentResult.isIntermediate`.
      * `[✅]`   stageRelationshipForStage: when `isRecord(params.contribution.document_relationships)` and `isDocumentRelationships(params.contribution.document_relationships)` hold, find the entry keyed by `stageSlug`; if it is a non-empty string, that is `stageRelationshipForStage`. Otherwise `stageRelationshipForStage` is `undefined`.
      * `[✅]`   Branch, condition `isDocumentRelated(fileType)` and `stageRelationshipForStage` is `undefined` or empty after trim: return the error arm carrying `FinalizeContributionJobDocumentRelatedError` built from `params.job.id`, `params.contribution.id` and `stageSlug`, with `retriable: false`.
      * `[✅]`   RENDER dispatch, condition `!needsContinuation`: read `userJwt` from `payload.user_jwt`. Branch, condition `userJwt` is not a non-empty string: `deps.logger.warn`, skip render. Branch, condition `!isDialecticStageSlug(stageSlug)`: `deps.logger.warn`, skip render. Otherwise: narrow `documentKey` from `payload.document_key` via `isFileType`. Build `EnqueueRenderJobParams` from `params.job.id`, `payload.sessionId`, `stageSlug` (narrowed to `DialecticStageSlug`), `payload.iterationNumber`, `fileType`, `payload.projectId`, `projectOwnerUserId`, `userJwt`, `payload.model_id`, `payload.walletId`, `params.job.is_test_job === true`. Build `EnqueueRenderJobPayload` from `params.contribution.id`, `needsContinuation`, `documentKey`, `stageRelationshipForStage`, `fileType`, `params.storageFileType`. Call `deps.enqueueRenderJob(renderParams, renderPayload)`. Branch, condition the result passes `isEnqueueRenderJobSuccessReturn`: set `shouldRender = renderResult.renderJobId !== null`. Branch, condition the result is the error arm: return error arm carrying `FinalizeContributionJobRenderDispatchError` built from the job id, contribution id and the render error's message, with `retriable: false`.
      * `[✅]`   Prompt-resource back-link, condition `payload.source_prompt_resource_id` is a non-empty string: `params.dbClient.from('dialectic_project_resources').update({ source_contribution_id: params.contribution.id }).eq('id', payload.source_prompt_resource_id)`. Branch, condition the update returned a driver error: return error arm carrying `FinalizeContributionJobPromptLinkError` built from the job id, contribution id, `payload.source_prompt_resource_id` and the driver's message, with `retriable: true`.
      * `[✅]`   Chunk-completed notification, condition `projectOwnerUserId` truthy and `params.isContinuationForStorage` and `isDocumentRelated(fileType)`: read `documentKeyStr` from `payload.document_key`. Branch, condition it is not a non-empty string: return error arm carrying `FinalizeContributionJobDocumentKeyError` built from the job id and `'execute_chunk_completed'`, with `retriable: false`. Otherwise: call `deps.notificationService.sendJobNotificationEvent({ type: 'execute_chunk_completed', sessionId: payload.sessionId, stageSlug, iterationNumber: payload.iterationNumber, job_id: params.job.id, step_key: documentKeyStr, modelId: payload.model_id, document_key: documentKeyStr }, projectOwnerUserId)`.
      * `[✅]`   ModelProcessingResult construction: `{ modelId: payload.model_id, status: needsContinuation ? 'needs_continuation' : 'completed', attempts: (params.job.attempt_count ?? 0) + 1, contributionId: params.contribution.id }`.
      * `[✅]`   Continuation path, condition `needsContinuation`: log diagnostic with `params.assembledResponse.finish_reason`, `payload.continuation_count`, `payload.continueUntilComplete`. Call `deps.continueJob({ dbClient: params.dbClient, projectOwnerUserId }, { job: params.job, savedOutput: params.contribution })`. Branch, condition the result has an `error` property: return error arm carrying `FinalizeContributionJobContinuationError` built from the job id and the error's message, with `retriable: true`. Branch, condition `enqueued === false` and `reason === 'continuation_limit_reached'`: set `modelProcessingResult.status = 'continuation_limit_reached'`. Derive `rootIdForCapAssembly` from `params.contribution.document_relationships[stageSlug]` via `isRecord` and non-empty-string check. Derive `matchedContextForCap` by finding the entry in `payload.context_for_documents` whose `document_key` matches `payload.document_key` via `isContextForDocument`. Condition `rootIdForCapAssembly !== undefined` and `rootIdForCapAssembly !== params.contribution.id` and `!shouldRender`: call `deps.fileManager.assembleAndSaveFinalDocument(rootIdForCapAssembly, matchedContextForCap)`. If `projectOwnerUserId` truthy: call `deps.notificationService.sendContributionGenerationContinuedEvent({ type: 'contribution_generation_continued', sessionId: payload.sessionId, contribution: params.contribution, projectId: payload.projectId, modelId: payload.model_id, continuationNumber: (payload.continuation_count ?? 0) + 1, job_id: params.job.id }, projectOwnerUserId)`.
      * `[✅]`   Final-chunk path, condition `resolvedFinishReason === 'stop'`: if `projectOwnerUserId` truthy and `isDocumentRelated(fileType)`: read `documentKeyStr` from `payload.document_key`. Branch, condition it is not a non-empty string: return error arm carrying `FinalizeContributionJobDocumentKeyError` built from the job id and `'execute_chunk_completed'`, with `retriable: false`. Otherwise: call `deps.notificationService.sendJobNotificationEvent({ type: 'execute_chunk_completed', ... }, projectOwnerUserId)`. Derive `rootIdFromSaved` from `params.contribution.document_relationships[stageSlug]` via `isRecord` and non-empty-string check. Condition `rootIdFromSaved` truthy and `rootIdFromSaved !== params.contribution.id` and `!shouldRender`: call `deps.fileManager.assembleAndSaveFinalDocument(rootIdFromSaved)`.
      * `[✅]`   Job-completion update: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'completed', results: JSON.stringify({ modelProcessingResult }), completed_at: new Date().toISOString(), attempt_count: (params.job.attempt_count ?? 0) + 1 }).eq('id', params.job.id)`. Branch, condition the update returned a driver error: return error arm carrying `FinalizeContributionJobCompletionUpdateError` built from the job id and the driver's message, with `retriable: false`.
      * `[✅]`   Completion notifications, condition `!needsContinuation` and `projectOwnerUserId` truthy: call `deps.notificationService.sendContributionReceivedEvent({ contribution: params.contribution, type: 'dialectic_contribution_received', sessionId: payload.sessionId, job_id: params.job.id, is_continuing: false }, projectOwnerUserId)`. Call `deps.notificationService.sendContributionGenerationCompleteEvent({ type: 'contribution_generation_complete', sessionId: payload.sessionId, projectId: payload.projectId, job_id: params.job.id }, projectOwnerUserId)`. Condition `!isIntermediate` and `isDocumentRelated(fileType)`: read `documentKeyStr` from `payload.document_key`. Branch, condition it is not a non-empty string: return error arm carrying `FinalizeContributionJobDocumentKeyError` built from the job id and `'execute_completed'`, with `retriable: false`. Otherwise: call `deps.notificationService.sendJobNotificationEvent({ type: 'execute_completed', sessionId: payload.sessionId, stageSlug, iterationNumber: payload.iterationNumber, job_id: params.job.id, step_key: documentKeyStr, modelId: payload.model_id, document_key: documentKeyStr }, projectOwnerUserId)`.
      * `[✅]`   Success status derivation: if `needsContinuation` and `modelProcessingResult.status === 'continuation_limit_reached'`, status is `'continuation_limit_reached'`. If `needsContinuation` and status is not `'continuation_limit_reached'`, status is `'needs_continuation'`. Otherwise `'completed'`. Return success arm: `{ status }`.
      * `[✅]`   Ordering and side effects: `shouldRender` is resolved before either assembly call site consults it; `modelProcessingResult.status` is mutated only by the continuation-limit-reached branch before the job-completion update writes it; neither `params` nor `payload` is mutated; `projectOwnerUserId` is derived once and used for every conditional notification dispatch.

   * `[✅]`   `finalizeContributionJob.mock.ts`
      * `[✅]`   `FinalizeContributionJobDepsOverrides`, `buildFinalizeContributionJobDeps`, `FinalizeContributionJobDepsCorruptions` and `invalidateFinalizeContributionJobDeps`; the builder's base `logger` is `new MockLogger()`, `notificationService` is `mockNotificationService` (imported from `_shared/utils/notification.service.mock.ts`), `fileManager` is `createMockFileManagerService()` (imported from `_shared/services/file_manager.mock.ts`). The `continueJob` default is a module-local `const defaultBoundContinueJob: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();` and the `enqueueRenderJob` default is a module-local `const defaultBoundEnqueueRenderJob: BoundEnqueueRenderJobFn = async (_params, _payload) => buildEnqueueRenderJobSuccessReturn();`, each typed by the imported bound function type, following the pattern at `assembleAiResponse.mock.ts` line 20.
      * `[✅]`   `FinalizeContributionJobParamsOverrides`, `buildFinalizeContributionJobParams`, `FinalizeContributionJobParamsCorruptions` and `invalidateFinalizeContributionJobParams`; the builder's base `dbClient` is `createMockSupabaseClient()`'s client, `job` composes `buildDialecticJobRow()`, `contribution` composes `buildDialecticContributionRow()`, `assembledResponse` composes `buildUnifiedAIResponse()`, `preparedContentResult` composes `buildPrepareResponseContentPreparedReturn()`, `storageFileType` defaults to `FileType.ModelContributionRawJson`, `isContinuationForStorage` defaults to `false`.
      * `[✅]`   `FinalizeContributionJobPayloadOverrides`, `buildFinalizeContributionJobPayload`, `FinalizeContributionJobPayloadCorruptions` and `invalidateFinalizeContributionJobPayload`; the builder composes `buildDialecticExecuteJobPayload()` rather than restating that arm's defaults.
      * `[✅]`   The four symbols for `FinalizeContributionJobSuccessReturn`; the builder's base `status` defaults to `'completed'`.
      * `[✅]`   The four symbols for `FinalizeContributionJobErrorReturn`; the builder's `error` composes `buildFinalizeContributionJobDocumentRelatedError()` and `retriable` defaults to `false`.
      * `[✅]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread, no cast. There is no invalidator for any instance.
      * `[✅]`   `mockFinalizeContributionJob: FinalizeContributionJobFn` returning `buildFinalizeContributionJobSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator for `DialecticJobRow`, `DialecticContributionRow`, `DialecticExecuteJobPayload`, `UnifiedAIResponse` or `PrepareResponseContentPreparedReturn` is written here; all are imported types whose complete four-symbol families live at their home packages, located above.

   * `[✅]`   `finalizeContributionJob.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isFinalizeContributionJobDeps`: accepts the built deps; rejects `logger` absent and non-object; rejects `notificationService` absent and non-object; rejects `fileManager` absent and non-object; rejects `continueJob` absent and non-function; rejects `enqueueRenderJob` absent and non-function; rejects a non-record root.
      * `[✅]`   `isFinalizeContributionJobParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` absent and set to `invalidateDialecticJobRow({ id: 42 })`; rejects `contribution` absent and set to `invalidateDialecticContributionRow({ id: null })`; rejects `assembledResponse` absent and non-record; rejects `preparedContentResult` absent and non-record; rejects `storageFileType` absent and non-string; rejects `isContinuationForStorage` absent and non-boolean; rejects a non-record root.
      * `[✅]`   `isFinalizeContributionJobPayload`: accepts the built payload; rejects each of `prompt_template_id`, `output_type`, `canonicalPathParams` and `inputs` corrupted in turn via `invalidateFinalizeContributionJobPayload`; rejects a non-record root.
      * `[✅]`   `isFinalizeContributionJobSuccessReturn`: accepts the built return; rejects `status` absent, numeric, and a string not in the three-member union; rejects the error return; rejects a non-record root.
      * `[✅]`   `isFinalizeContributionJobErrorReturn`: accepts the built return; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects the success return; rejects a non-record root.
      * `[✅]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[✅]`   `finalizeContributionJob.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isFinalizeContributionJobDeps`, `isFinalizeContributionJobParams`, `isFinalizeContributionJobPayload`, `isFinalizeContributionJobSuccessReturn`, `isFinalizeContributionJobErrorReturn`, and one `instanceof` guard per owned error class.
      * `[✅]`   `isFinalizeContributionJobDeps` requires `isRecord(value)`, then `typeof value.logger === 'object' && value.logger !== null`, `typeof value.notificationService === 'object' && value.notificationService !== null`, `typeof value.fileManager === 'object' && value.fileManager !== null`, `typeof value.continueJob === 'function'`, `typeof value.enqueueRenderJob === 'function'`.
      * `[✅]`   `isFinalizeContributionJobParams` requires `isRecord(value)`, `isRecord(value.dbClient)`, calls the imported `isDialecticJobRow` on `job`, calls the imported `isDialecticContribution` on `contribution`, `isRecord(value.assembledResponse)`, `isRecord(value.preparedContentResult)`, `isFileType(value.storageFileType)`, `typeof value.isContinuationForStorage === 'boolean'`.
      * `[✅]`   `isFinalizeContributionJobPayload` calls the imported `isDialecticExecuteJobPayload`, catching the per-member diagnostic that guard throws and returning `false`.
      * `[✅]`   `isFinalizeContributionJobSuccessReturn` requires `isRecord(value)`, `typeof value.status === 'string'`, and `value.status` is one of `'completed'`, `'needs_continuation'`, `'continuation_limit_reached'`.
      * `[✅]`   `isFinalizeContributionJobErrorReturn` requires `value.error instanceof Error` and `typeof value.retriable === 'boolean'`. The arms are mutually exclusive.
      * `[✅]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[✅]`   No guard is written here for `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `UnifiedAIResponse` or `PrepareResponseContentPreparedReturn`; none is owned by this interface, and each already has one at its home package.

   * `[✅]`   `finalizeContributionJob.test.ts`
      * `[✅]`   Deps fixtures are `buildFinalizeContributionJobDeps({ ... })` with deps overridden per case. Params are `buildFinalizeContributionJobParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the DB outcome the case turns on. Payload is `buildFinalizeContributionJobPayload({ … })`.
      * `[✅]`   stageRelationshipForStage derivation: a contribution whose `document_relationships` carry a non-empty string at the stage slug yields that value; a contribution with `null` relationships yields `undefined` — the document-related check consumes the result.
      * `[✅]`   Document-related check failure: a document-related `fileType` with no `stageRelationshipForStage` returns the error arm whose error passes `isFinalizeContributionJobDocumentRelatedError`, with `retriable: false`.
      * `[✅]`   RENDER dispatch — success: a non-continuation with valid `user_jwt` and valid `DialecticStageSlug` calls `deps.enqueueRenderJob` with the assembled params and payload, and the result's `renderJobId` not null sets `shouldRender` to true. The render params' `jobId`, `sessionId`, `stageSlug`, `iterationNumber`, `outputType`, `projectId`, `projectOwnerUserId`, `userAuthToken`, `modelId`, `walletId` and `isTestJob` each equal the arranged value, asserted against independent literals.
      * `[✅]`   RENDER dispatch — skip on missing user_jwt: an empty `user_jwt` logs a warning and does not call `deps.enqueueRenderJob`.
      * `[✅]`   RENDER dispatch — skip on invalid stageSlug: a `stageSlug` that fails `isDialecticStageSlug` logs a warning and does not call `deps.enqueueRenderJob`.
      * `[✅]`   RENDER dispatch — error: `deps.enqueueRenderJob` returning its error arm returns this module's error arm whose error passes `isFinalizeContributionJobRenderDispatchError`.
      * `[✅]`   Prompt-resource back-link — success: a non-empty `source_prompt_resource_id` updates `dialectic_project_resources` with `source_contribution_id` equal to `params.contribution.id`, filtered on the resource id.
      * `[✅]`   Prompt-resource back-link — DB failure: the update returning a driver error returns this module's error arm whose error passes `isFinalizeContributionJobPromptLinkError`, carries the driver's message, and is `retriable: true`.
      * `[✅]`   Prompt-resource back-link — skip: an empty or absent `source_prompt_resource_id` does not update `dialectic_project_resources`.
      * `[✅]`   Chunk-completed notification: `isContinuationForStorage` true and `isDocumentRelated(fileType)` true and valid `document_key` fires `sendJobNotificationEvent` with `type: 'execute_chunk_completed'`, `step_key` and `document_key` both equal to the payload's `document_key`.
      * `[✅]`   Chunk-completed — missing document_key: `isContinuationForStorage` true and document-related and `document_key` absent returns the error arm whose error passes `isFinalizeContributionJobDocumentKeyError` with `notificationType: 'execute_chunk_completed'`.
      * `[✅]`   ModelProcessingResult: `status` is `'needs_continuation'` when `needsContinuation` is true, `'completed'` otherwise; `attempts` is `job.attempt_count + 1`; `contributionId` is `params.contribution.id`.
      * `[✅]`   Continuation — continueJob error: `deps.continueJob` returning its error arm returns this module's error arm whose error passes `isFinalizeContributionJobContinuationError`, carries the continuation error's message, and is `retriable: true`.
      * `[✅]`   Continuation — limit reached with cap assembly: `deps.continueJob` returning `{ enqueued: false, reason: 'continuation_limit_reached' }` sets `modelProcessingResult.status` to `'continuation_limit_reached'`; when `rootIdForCapAssembly` is present, differs from `params.contribution.id`, and `shouldRender` is false, calls `deps.fileManager.assembleAndSaveFinalDocument` with the rootId and the matched context.
      * `[✅]`   Continuation — limit reached, cap assembly skipped on shouldRender: when `shouldRender` is true, `assembleAndSaveFinalDocument` is not called.
      * `[✅]`   Continuation — limit reached, cap assembly skipped on rootId equals contribution.id: when `rootIdForCapAssembly === params.contribution.id`, `assembleAndSaveFinalDocument` is not called.
      * `[✅]`   Continuation — notification: `sendContributionGenerationContinuedEvent` called with `continuationNumber` equal to `(payload.continuation_count ?? 0) + 1` and `contribution` equal to `params.contribution`. The continuation count and contribution id are arranged as values distinct from builder defaults.
      * `[✅]`   Final-chunk — notification and assembly: `resolvedFinishReason === 'stop'` with document-related and valid `document_key` fires `execute_chunk_completed` notification; with a valid `rootIdFromSaved` that differs from `contribution.id` and `!shouldRender`, calls `assembleAndSaveFinalDocument` with that rootId.
      * `[✅]`   Final-chunk — assembly skipped on shouldRender: when `shouldRender` is true, `assembleAndSaveFinalDocument` is not called.
      * `[✅]`   Job-completion update — success: `dialectic_generation_jobs` updated with `status: 'completed'`, `results` containing the `modelProcessingResult` as JSON, `completed_at` a non-empty string, `attempt_count` equal to `job.attempt_count + 1`.
      * `[✅]`   Job-completion update — failure: the update returning a driver error returns this module's error arm whose error passes `isFinalizeContributionJobCompletionUpdateError`.
      * `[✅]`   Completion notifications — non-continuation: `sendContributionReceivedEvent` called with `is_continuing: false` and `contribution` equal to `params.contribution`; `sendContributionGenerationCompleteEvent` called with `projectId` equal to `payload.projectId`.
      * `[✅]`   execute_completed notification: non-intermediate, document-related, valid `document_key` fires `sendJobNotificationEvent` with `type: 'execute_completed'`, `step_key` and `document_key` equal to the payload's `document_key`.
      * `[✅]`   execute_completed — missing document_key: returns the error arm whose error passes `isFinalizeContributionJobDocumentKeyError` with `notificationType: 'execute_completed'`.
      * `[✅]`   Success status derivation — completed: `!needsContinuation` returns `{ status: 'completed' }`.
      * `[✅]`   Success status derivation — needs_continuation: `needsContinuation` true and `continueJob` returning `{ enqueued: true }` returns `{ status: 'needs_continuation' }`.
      * `[✅]`   Success status derivation — continuation_limit_reached: `needsContinuation` true and `continueJob` returning limit-reached returns `{ status: 'continuation_limit_reached' }`.
      * `[✅]`   Purity: neither the `params` object nor the `payload` object is mutated by any path.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`; this node constructs nothing at a boundary.

   * `[✅]`   `finalizeContributionJob.ts`
      * `[✅]`   One exported function, typed `FinalizeContributionJobFn`, implementing the interaction spec in its stated order: stageRelationshipForStage derivation, document-related check, RENDER dispatch, prompt-resource back-link, chunk-completed notification, ModelProcessingResult construction, continuation path with cap assembly, final-chunk path with assembly, job-completion update, completion notifications, success status derivation.
      * `[✅]`   Every DB call (`dialectic_project_resources` update, `dialectic_generation_jobs` update), every collaborator call (`deps.continueJob`, `deps.enqueueRenderJob`, `deps.fileManager.assembleAndSaveFinalDocument`), and every notification call is awaited. Every error from a DB call, from `deps.continueJob`, and from `deps.enqueueRenderJob` returns this module's error arm — no error is logged and continued.
      * `[✅]`   `shouldRender` is resolved before either `assembleAndSaveFinalDocument` call site consults it; `modelProcessingResult` is a local object constructed once and mutated only by the continuation-limit-reached branch; each typed local is held in one variable, none is inferred, and none is widened at its use site.
      * `[✅]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed or converted.

   * `[✅]`   `finalizeContributionJob.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[✅]`   `finalizeContributionJob.integration.test.ts`
      * `[✅]`   Chain: `finalizeContributionJob` → real `enqueueRenderJob`. The real `enqueueRenderJob` is constructed with its own real deps (a real `shouldEnqueueRenderJob`, a real `resolveTemplateFilename`, a real logger) and bound to produce a `BoundEnqueueRenderJobFn`. The boundary is the database: `enqueueRenderJob`'s DB calls are mocked via the `dbClient` in params.
      * `[✅]`   The integration proves that the `EnqueueRenderJobParams` and `EnqueueRenderJobPayload` this module constructs from its params and payload are accepted by the real `enqueueRenderJob` and produce the expected result — a `renderJobId` or a validation error — rather than a type error or a structural mismatch masked by a mock.
      * `[✅]`   Mock at the outer boundary only: the `dbClient` (shared between finalizeContributionJob and the real enqueueRenderJob), `notificationService`, `fileManager`, and `continueJob`. Every function inside the integrated chain is real.
      * `[✅]`   A case arranges a non-continuation with a valid `user_jwt`, a valid `DialecticStageSlug`, and a `shouldEnqueueRenderJob` returning `true`, and asserts that the real `enqueueRenderJob` received the params this module built and returned a non-null `renderJobId`.
      * `[✅]`   A case arranges a `shouldEnqueueRenderJob` returning `false` and asserts the real `enqueueRenderJob` returned `renderJobId: null`.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, sibling module interfaces (`enqueueRenderJob`, `continueJob`, `prepareResponseContent`), and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: this node edits no file outside its own folder except the one-line `BoundContinueJobFn` addition to `continueJob/continueJob.interface.ts`.

   * `[✅]`   `requirements`
      * `[✅]`   The return union has exactly two arms — interface test.
      * `[✅]`   `FinalizeContributionJobDeps` declares exactly five deps — interface test.
      * `[✅]`   `FinalizeContributionJobPayload` is declared equivalent to `DialecticExecuteJobPayload` — interface.
      * `[✅]`   `FinalizeContributionJobSuccessReturn.status` discriminates the three terminal states — interface test.
      * `[✅]`   A document-related type with no `stageRelationshipForStage` returns its own typed error — unit test.
      * `[✅]`   RENDER dispatch failure returns its own typed error instead of logging and continuing — unit test.
      * `[✅]`   RENDER dispatch skipped for missing `user_jwt` or invalid `stageSlug` — unit test.
      * `[✅]`   Prompt-resource back-link DB failure returns its own typed error with `retriable: true` — unit test.
      * `[✅]`   Missing `document_key` for `execute_chunk_completed` and `execute_completed` each return `FinalizeContributionJobDocumentKeyError` — unit test.
      * `[✅]`   `continueJob` error arm returns its own typed error with `retriable: true` — unit test.
      * `[✅]`   `continuation_limit_reached` sets `modelProcessingResult.status` and triggers cap assembly — unit test.
      * `[✅]`   Cap assembly skipped when `shouldRender` is true or when `rootId === contribution.id` — unit test.
      * `[✅]`   Job-completion update DB failure returns its own typed error — unit test.
      * `[✅]`   Success status derives `'completed'`, `'needs_continuation'` or `'continuation_limit_reached'` from the correct conditions — unit test.
      * `[✅]`   The chain of `finalizeContributionJob → real enqueueRenderJob` produces a RENDER dispatch result consistent with the real module's contract — integration test.
      * `[✅]`   Neither `params` nor `payload` is mutated — unit test.

* `[✅]`   supabase/functions/dialectic-worker/saveContributionResponse/saveContributionResponse.ts **[BE] The EXECUTE arm composing identity resolution, the contribution upload, relationship persistence and finalization**

   * `[✅]`   `objective`
      * `[✅]`   The EXECUTE save path in `saveResponse.ts` (lines ~805–1284) concentrates five sequential responsibilities into a single undifferentiated block: identity resolution, upload-context construction, file upload and registration, relationship persistence, and job finalization with continuation/notification dispatch. Each responsibility's error handling is tangled with the next's, the block reads from `jobPayloadUnknown` via `isRecord` probes at each use site despite the payload having been proven at the entry gate, and the relationship-persistence block mutates `contribution.document_relationships` in place instead of returning the row the database holds. The three inner responsibilities have already been extracted — `resolveContributionIdentity`, `persistContributionRelationships`, `finalizeContributionJob` — but nothing composes them.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/saveContributionResponse/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `SaveContributionResponseReturn`.
         * `[✅]`   The deps slot declares five deps: `fileManager` (`IFileManager`), `buildUploadContext` (`BuildUploadContextFn`), and the three bound collaborators `resolveContributionIdentity` (`BoundResolveContributionIdentityFn`), `persistContributionRelationships` (`BoundPersistContributionRelationshipsFn`), `finalizeContributionJob` (`BoundFinalizeContributionJobFn`).
         * `[✅]`   The params slot declares six per-invocation values: `dbClient`, `job` (`DialecticJobRow`), `providerRow` (`AiProvidersRow`), `modelConfig` (`AiModelExtendedConfig`), `assembledResponse` (`UnifiedAIResponse`), `preparedContentResult` (`PrepareResponseContentPreparedReturn`).
         * `[✅]`   The payload slot is `SaveContributionResponsePayload`, declared equivalent to `DialecticExecuteJobPayload`. The payload is already proven by the orchestrator and is not re-guarded.
         * `[✅]`   The success arm carries `status: 'completed' | 'needs_continuation' | 'continuation_limit_reached'`, forwarded from `finalizeContributionJob`'s success status.
         * `[✅]`   Every collaborator error is propagated unchanged on this module's error arm. Failures this module owns — `isModelContributionContext` failing, `uploadAndRegisterFile` returning an error or a non-contribution record — return their own typed errors with `retriable: false`.
         * `[✅]`   The three bound types — `BoundResolveContributionIdentityFn`, `BoundPersistContributionRelationshipsFn`, `BoundFinalizeContributionJobFn` — are added to their respective interfaces by this node, following the `(params, payload) => Promise<Return>` pattern established by `BoundContinueJobFn` and `BoundEnqueueRenderJobFn`.
         * `[✅]`   Fields that `buildUploadContext` needs and that the payload carries — `projectId`, `sessionId`, `iterationNumber`, `document_key`, `canonicalPathParams.contributionType`, `continuation_count`, `source_prompt_resource_id`, `document_relationships`, `isIntermediate` — are read from the payload by this module. Fields that `resolveContributionIdentity` derives — `restOfCanonicalPathParams`, `storageFileType`, `sourceGroupFragment`, `isContinuationForStorage`, `targetContributionId`, `description` — are read from the identity result.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node.
         * `[✅]`   No file outside `dialectic-worker/saveContributionResponse/` is edited except the three one-line bound-type additions to `resolveContributionIdentity/resolveContributionIdentity.interface.ts`, `persistContributionRelationships/persistContributionRelationships.interface.ts`, and `finalizeContributionJob/finalizeContributionJob.interface.ts`.
         * `[✅]`   The payload is read, not re-guarded. No `isRecord` probe of the payload survives in this module.
         * `[✅]`   Neither `params` nor `payload` is mutated on any path.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer orchestrator: given a proven EXECUTE payload, the provider and model resolution already done, the response already assembled and content already prepared, compose the five-step contribution-save sequence — resolve identity, build upload context, upload and register, persist relationships, finalize — and return the terminal status.
      * `[✅]`   The role is correct because every decision has been made upstream (payload proving, provider resolution, response assembly, content preparation, token debit) and every responsibility downstream is delegated to a bound collaborator. This module is pure composition with no business logic of its own.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not prove the payload. The orchestrator (`saveResponse`) proves the payload with the arm's guard before calling this module.
         * `[✅]`   Do not resolve the finish reason, sanitize content, determine continuation, or debit tokens. Those are upstream responsibilities handled before this module is called.
         * `[✅]`   Do not retry. The orchestrator holds the provider row and the failed-attempt array; a failure here returns the error arm and the orchestrator decides whether to retry.
         * `[✅]`   Do not dispatch notifications directly. `finalizeContributionJob` owns all notification dispatch.
         * `[✅]`   Do not mutate the contribution row's `document_relationships`. `persistContributionRelationships` returns the row carrying the written relationships.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/saveContributionResponse` — composing the EXECUTE save sequence from identity resolution through finalization, receiving a proven payload and returning a terminal status.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`IFileManager`).
         * `[✅]`   Layer classification: shared adapter interface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: `uploadAndRegisterFile` for persisting the contribution file. Deps guard checks presence of `uploadAndRegisterFile` method.
      * `[✅]`   Provider: `createJobContext/JobContext.interface.ts` (`BuildUploadContextFn`).
         * `[✅]`   Layer classification: sibling factory interface.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: assembles the `ModelContributionUploadContext` from identity-resolved fields and payload fields. Deps guard checks `typeof value === 'function'`.
      * `[✅]`   Provider: `resolveContributionIdentity/resolveContributionIdentity.interface.ts` (`BoundResolveContributionIdentityFn`).
         * `[✅]`   Layer classification: sibling module bound closure.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: identity resolution — `restOfCanonicalPathParams`, `storageFileType`, `sourceGroupFragment`, `isContinuationForStorage`, `targetContributionId`, `description`. Deps guard checks `typeof value === 'function'`. The bound type is added to the resolveContributionIdentity interface by this node.
      * `[✅]`   Provider: `persistContributionRelationships/persistContributionRelationships.interface.ts` (`BoundPersistContributionRelationshipsFn`).
         * `[✅]`   Layer classification: sibling module bound closure.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: relationship persistence — returns the contribution row carrying the written `document_relationships`. Deps guard checks `typeof value === 'function'`. The bound type is added to the persistContributionRelationships interface by this node.
      * `[✅]`   Provider: `finalizeContributionJob/finalizeContributionJob.interface.ts` (`BoundFinalizeContributionJobFn`).
         * `[✅]`   Layer classification: sibling module bound closure.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: RENDER dispatch, continuation, notifications, job-completion update, and terminal status. Deps guard checks `typeof value === 'function'`. The bound type is added to the finalizeContributionJob interface by this node.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticExecuteJobPayload`, `DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse`, `AiModelExtendedConfig`, `DialecticContributionRow`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the payload arm type, the job and provider rows, the assembled response, the model config, and the contribution row type for the `isDialecticContribution` guard.
      * `[✅]`   Provider: `prepareResponseContent/prepareResponseContent.interface.ts` (`PrepareResponseContentPreparedReturn`).
         * `[✅]`   Layer classification: sibling module return type.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: `contentForStorage` for `buildUploadContext`, and the full result for `finalizeContributionJob`'s params.
      * `[✅]`   Provider: `_shared/utils/buildUploadContext/buildUploadContext.interface.ts` (`BuildUploadContextParams`, `BuildUploadContextProviderDetails`, `BuildUploadContextAiResponseSlice`).
         * `[✅]`   Layer classification: shared contract types.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: typed construction of the `buildUploadContext` argument object.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.file_manager.ts` (`isModelContributionContext`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: narrowing the `buildUploadContext` return to `ModelContributionUploadContext`.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticContribution`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: narrowing the `uploadAndRegisterFile` record to `DialecticContributionRow`.
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`ModelContributionUploadContext`).
         * `[✅]`   Layer classification: shared contract type.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the narrowed upload context type after `isModelContributionContext` passes.
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`ModelContributionFileTypes`, `CanonicalPathParams`, `FileType`).
         * `[✅]`   Layer classification: shared contract types.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the identity-result field types used in `buildUploadContext` param construction.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the `dbClient` param.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildDialecticExecuteJobPayload`, `invalidateDialecticExecuteJobPayload`, `buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`, `buildDialecticContributionRow`), `_shared/supabase.mock.ts` (`createMockSupabaseClient`), `_shared/services/file_manager.mock.ts` (`createMockFileManagerService`), `prepareResponseContent/prepareResponseContent.mock.ts` (`buildPrepareResponseContentPreparedReturn`, `invalidatePrepareResponseContentPreparedReturn`), `resolveContributionIdentity/resolveContributionIdentity.mock.ts` (builders and function mock), `persistContributionRelationships/persistContributionRelationships.mock.ts` (builders and function mock), `finalizeContributionJob/finalizeContributionJob.mock.ts` (builders and function mock).
         * `[✅]`   Layer classification: shared and sibling test fixture surfaces.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the imported types' fixtures and the injected client/service mocks configured per outcome. Each imported type carries its complete four-symbol family under its production name; none is rebuilt here.
      * `[✅]`   Confirm:
         * `[✅]`   `SaveContributionResponseDeps` declares exactly `fileManager`, `buildUploadContext`, `resolveContributionIdentity`, `persistContributionRelationships`, and `finalizeContributionJob`. `dbClient`, `job`, `providerRow`, `modelConfig`, `assembledResponse`, and `preparedContentResult` are per-invocation params.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service`, `resolveContributionIdentity/`, `persistContributionRelationships/`, `finalizeContributionJob/`, or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From `dialectic-service/dialectic.interface.ts`: `DialecticExecuteJobPayload`, `DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse`, `AiModelExtendedConfig`, `DialecticContributionRow`, `ContributionType`, imported with `import type`.
         * `[✅]`   From `resolveContributionIdentity/resolveContributionIdentity.interface.ts`: `BoundResolveContributionIdentityFn`, `ResolveContributionIdentitySuccessReturn`, imported with `import type`.
         * `[✅]`   From `persistContributionRelationships/persistContributionRelationships.interface.ts`: `BoundPersistContributionRelationshipsFn`, imported with `import type`.
         * `[✅]`   From `finalizeContributionJob/finalizeContributionJob.interface.ts`: `BoundFinalizeContributionJobFn`, imported with `import type`.
         * `[✅]`   From `prepareResponseContent/prepareResponseContent.interface.ts`: `PrepareResponseContentPreparedReturn`, imported with `import type`.
         * `[✅]`   From `createJobContext/JobContext.interface.ts`: `BuildUploadContextFn`, imported with `import type`.
         * `[✅]`   From `_shared/utils/buildUploadContext/buildUploadContext.interface.ts`: `BuildUploadContextParams`, `BuildUploadContextProviderDetails`, `BuildUploadContextAiResponseSlice`, imported with `import type`.
         * `[✅]`   From `_shared/types/file_manager.types.ts`: `IFileManager`, `ModelContributionUploadContext`, `ModelContributionFileTypes`, `CanonicalPathParams`, `FileType`, imported with `import type`.
         * `[✅]`   From `_shared/types.ts`: `ILogger`, imported with `import type` (for error construction only — not a dep).
         * `[✅]`   From `types_db.ts`: `Database`, imported with `import type`.
         * `[✅]`   From `_shared/utils/type-guards/type_guards.file_manager.ts`: `isModelContributionContext`, `isContributionType`, as value imports.
         * `[✅]`   From `_shared/utils/type-guards/type_guards.dialectic.ts`: `isDialecticContribution`, as value import.

   * `[✅]`   `resolveContributionIdentity/resolveContributionIdentity.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves `BoundResolveContributionIdentityFn` accepts `(params: ResolveContributionIdentityParams, payload: ResolveContributionIdentityPayload)` and returns `Promise<ResolveContributionIdentityReturn>` by assigning a typed literal to the bound type.

   * `[✅]`   `resolveContributionIdentity/resolveContributionIdentity.interface.ts`
      * `[✅]`   `BoundResolveContributionIdentityFn` added as `(params: ResolveContributionIdentityParams, payload: ResolveContributionIdentityPayload) => Promise<ResolveContributionIdentityReturn>`.

   * `[✅]`   `persistContributionRelationships/persistContributionRelationships.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves `BoundPersistContributionRelationshipsFn` accepts `(params: PersistContributionRelationshipsParams, payload: PersistContributionRelationshipsPayload)` and returns `Promise<PersistContributionRelationshipsReturn>` by assigning a typed literal to the bound type.

   * `[✅]`   `persistContributionRelationships/persistContributionRelationships.interface.ts`
      * `[✅]`   `BoundPersistContributionRelationshipsFn` added as `(params: PersistContributionRelationshipsParams, payload: PersistContributionRelationshipsPayload) => Promise<PersistContributionRelationshipsReturn>`.

   * `[✅]`   `finalizeContributionJob/finalizeContributionJob.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves `BoundFinalizeContributionJobFn` accepts `(params: FinalizeContributionJobParams, payload: FinalizeContributionJobPayload)` and returns `Promise<FinalizeContributionJobReturn>` by assigning a typed literal to the bound type.

   * `[✅]`   `finalizeContributionJob/finalizeContributionJob.interface.ts`
      * `[✅]`   `BoundFinalizeContributionJobFn` added as `(params: FinalizeContributionJobParams, payload: FinalizeContributionJobPayload) => Promise<FinalizeContributionJobReturn>`.

   * `[✅]`   `saveContributionResponse.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof SaveContributionResponseDeps, true>` over `fileManager`, `buildUploadContext`, `resolveContributionIdentity`, `persistContributionRelationships`, and `finalizeContributionJob`, asserting five.
      * `[✅]`   A case proves the params surface exhaustively: `Record<keyof SaveContributionResponseParams, true>` over `dbClient`, `job`, `providerRow`, `modelConfig`, `assembledResponse`, and `preparedContentResult`, asserting six.
      * `[✅]`   A case proves the return union has exactly two arms by assigning a success literal and an error literal to `SaveContributionResponseReturn`.
      * `[✅]`   A case proves `SaveContributionResponseSuccessReturn.status` discriminates `'completed'`, `'needs_continuation'`, and `'continuation_limit_reached'` by assigning each to the status field.
      * `[✅]`   A case proves `SaveContributionResponsePayload` is assignable to and from `DialecticExecuteJobPayload`.
      * `[✅]`   A case proves `SaveContributionResponseFn` accepts `(deps, params, payload)` and returns `Promise<SaveContributionResponseReturn>`.
      * `[✅]`   A case proves `BoundSaveContributionResponseFn` accepts `(params, payload)` and returns `Promise<SaveContributionResponseReturn>`.

   * `[✅]`   `saveContributionResponse.interface.ts`
      * `[✅]`   `SaveContributionResponseDeps` with five deps: `fileManager: IFileManager`, `buildUploadContext: BuildUploadContextFn`, `resolveContributionIdentity: BoundResolveContributionIdentityFn`, `persistContributionRelationships: BoundPersistContributionRelationshipsFn`, `finalizeContributionJob: BoundFinalizeContributionJobFn`.
      * `[✅]`   `SaveContributionResponseParams` with six fields: `dbClient: SupabaseClient<Database>`, `job: DialecticJobRow`, `providerRow: AiProvidersRow`, `modelConfig: AiModelExtendedConfig`, `assembledResponse: UnifiedAIResponse`, `preparedContentResult: PrepareResponseContentPreparedReturn`.
      * `[✅]`   `SaveContributionResponsePayload` declared equivalent to `DialecticExecuteJobPayload`.
      * `[✅]`   `SaveContributionResponseSuccessReturn` with `status: 'completed' | 'needs_continuation' | 'continuation_limit_reached'`.
      * `[✅]`   `SaveContributionResponseErrorReturn` with `error: Error` and `retriable: boolean`.
      * `[✅]`   `SaveContributionResponseReturn` as the union of the two arms.
      * `[✅]`   `SaveContributionResponseFn` typed `(deps, params, payload) => Promise<SaveContributionResponseReturn>`.
      * `[✅]`   `BoundSaveContributionResponseFn` typed `(params, payload) => Promise<SaveContributionResponseReturn>`.
      * `[✅]`   `SaveContributionResponseBuildContextError` — when `isModelContributionContext` fails on the `buildUploadContext` return.
      * `[✅]`   `SaveContributionResponseUploadError` — when `uploadAndRegisterFile` returns an error.
      * `[✅]`   `SaveContributionResponseContributionRecordError` — when `isDialecticContribution` fails on the upload result's record.

   * `[✅]`   `saveContributionResponse.interaction.spec`
      * `[✅]`   Branch: deps guard fails.
         * `[✅]`   Condition: `!isSaveContributionResponseDeps(deps)`.
         * `[✅]`   Decision: deps guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveContributionResponseDeps')`, `retriable: false`.
      * `[✅]`   Branch: params guard fails.
         * `[✅]`   Condition: `!isSaveContributionResponseParams(params)`.
         * `[✅]`   Decision: params guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveContributionResponseParams')`, `retriable: false`.
      * `[✅]`   Branch: identity resolution fails.
         * `[✅]`   Condition: `'error' in identityResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.resolveContributionIdentity({ dbClient, job, providerRow, aiResponse: params.assembledResponse }, payload)`.
         * `[✅]`   Outcome: propagate `identityResult` unchanged on this module's error arm.
      * `[✅]`   Branch: build-context returns non-contribution context.
         * `[✅]`   Condition: `!isModelContributionContext(builtContext)`.
         * `[✅]`   Decision: `isModelContributionContext` guard.
         * `[✅]`   Dependency call: `deps.buildUploadContext(buildUploadContextParams)` where `buildUploadContextParams` is assembled from the identity result, the payload, and the params.
         * `[✅]`   Outcome: error arm, `SaveContributionResponseBuildContextError`, `retriable: false`.
      * `[✅]`   Branch: upload fails with error.
         * `[✅]`   Condition: `savedResult.error`.
         * `[✅]`   Decision: error field check on the result.
         * `[✅]`   Dependency call: `deps.fileManager.uploadAndRegisterFile(uploadContext)`.
         * `[✅]`   Outcome: error arm, `SaveContributionResponseUploadError` carrying the driver's message, `retriable: false`.
      * `[✅]`   Branch: upload returns non-contribution record.
         * `[✅]`   Condition: `!isDialecticContribution(savedResult.record)`.
         * `[✅]`   Decision: `isDialecticContribution` guard.
         * `[✅]`   Dependency call: none (same result from upload).
         * `[✅]`   Outcome: error arm, `SaveContributionResponseContributionRecordError`, `retriable: false`.
      * `[✅]`   Branch: relationship persistence fails.
         * `[✅]`   Condition: `'error' in persistResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.persistContributionRelationships({ dbClient, job, contribution: savedResult.record, isContinuationForStorage: identityResult.isContinuationForStorage }, payload)`.
         * `[✅]`   Outcome: propagate `persistResult` unchanged on this module's error arm.
      * `[✅]`   Branch: finalization fails.
         * `[✅]`   Condition: `'error' in finalizeResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.finalizeContributionJob({ dbClient, job, contribution: persistResult.contribution, assembledResponse: params.assembledResponse, preparedContentResult: params.preparedContentResult, storageFileType: identityResult.storageFileType, isContinuationForStorage: identityResult.isContinuationForStorage }, payload)`.
         * `[✅]`   Outcome: propagate `finalizeResult` unchanged on this module's error arm.
      * `[✅]`   Branch: all steps succeed.
         * `[✅]`   Condition: all prior checks pass.
         * `[✅]`   Decision: none — fall-through.
         * `[✅]`   Dependency call: none additional.
         * `[✅]`   Outcome: success arm, `{ status: finalizeResult.status }`.
      * `[✅]`   Side effects: file upload via `deps.fileManager`, DB writes and notifications via bound collaborators.
      * `[✅]`   Ordering: strictly sequential — each step depends on the prior step's result.

   * `[✅]`   `saveContributionResponse.mock.ts`
      * `[✅]`   `buildSaveContributionResponseDeps` — builder returning a valid `SaveContributionResponseDeps` with a mock file manager, a stub `buildUploadContext`, and three stub bound collaborators each returning their success arm.
      * `[✅]`   `invalidateSaveContributionResponseDeps` — invalidator that removes each dep key in turn.
      * `[✅]`   `buildSaveContributionResponseParams` — builder returning a valid `SaveContributionResponseParams` with a mock `dbClient`, a built `DialecticJobRow`, a built `AiProvidersRow`, a built `AiModelExtendedConfig`, a built `UnifiedAIResponse`, and a built `PrepareResponseContentPreparedReturn`.
      * `[✅]`   `invalidateSaveContributionResponseParams` — invalidator that removes each param key in turn.
      * `[✅]`   `buildSaveContributionResponseSuccessReturn` — builder returning `{ status: 'completed' }`.
      * `[✅]`   `invalidateSaveContributionResponseSuccessReturn` — invalidator removing `status`.
      * `[✅]`   `mockSaveContributionResponseFn` — function mock returning the success builder's output.
      * `[✅]`   `mockBoundSaveContributionResponseFn` — function mock returning the success builder's output, typed as `BoundSaveContributionResponseFn`.

   * `[✅]`   `saveContributionResponse.guard.test.ts`
      * `[✅]`   `isSaveContributionResponseDeps`: a valid deps object passes; removing each of the five keys in turn fails; a non-object fails.
      * `[✅]`   `isSaveContributionResponseParams`: a valid params object passes; removing each of the six keys in turn fails; a non-object fails.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `saveContributionResponse.guard.ts`
      * `[✅]`   `isSaveContributionResponseDeps` — checks `fileManager` has `uploadAndRegisterFile` method, `buildUploadContext` is a function, and `resolveContributionIdentity`, `persistContributionRelationships`, `finalizeContributionJob` are functions.
      * `[✅]`   `isSaveContributionResponseParams` — checks `dbClient` is an object, `job` is a record, `providerRow` is a record, `modelConfig` is a record, `assembledResponse` is a record, `preparedContentResult` is a record with `retryRequired: false`.

   * `[✅]`   `saveContributionResponse.test.ts`
      * `[✅]`   Guards on entry: deps invalid returns error arm with `retriable: false`, params invalid returns error arm with `retriable: false`.
      * `[✅]`   `resolveContributionIdentity` returns error arm — propagated unchanged, `uploadAndRegisterFile` not called.
      * `[✅]`   `isModelContributionContext` fails — returns `SaveContributionResponseBuildContextError` with `retriable: false`.
      * `[✅]`   `uploadAndRegisterFile` returns `{ error, record: null }` — returns `SaveContributionResponseUploadError` with `retriable: false`.
      * `[✅]`   `uploadAndRegisterFile` returns `{ record }` where `isDialecticContribution` fails — returns `SaveContributionResponseContributionRecordError` with `retriable: false`.
      * `[✅]`   `persistContributionRelationships` returns error arm — propagated unchanged, `finalizeContributionJob` not called.
      * `[✅]`   `finalizeContributionJob` returns error arm — propagated unchanged.
      * `[✅]`   Happy path: all collaborators succeed, returns success with `finalizeContributionJob`'s status.
      * `[✅]`   Happy path exercises each of the three statuses: `'completed'`, `'needs_continuation'`, `'continuation_limit_reached'`.
      * `[✅]`   The `buildUploadContext` call receives the identity result's `restOfCanonicalPathParams`, `storageFileType`, `sourceGroupFragment`, `isContinuationForStorage`, `targetContributionId`, `description` alongside the payload's `projectId`, `sessionId`, `iterationNumber`, `document_key`, `continuation_count`, `source_prompt_resource_id`, `document_relationships`, `isIntermediate` and the params' `providerRow.api_identifier`, `job.attempt_count`, `job.user_id`, `assembledResponse.inputTokens`, `assembledResponse.outputTokens`, `assembledResponse.processingTimeMs`, `preparedContentResult.contentForStorage`.
      * `[✅]`   `persistContributionRelationships` receives the upload's `savedResult.record` as `contribution` and the identity result's `isContinuationForStorage` in its params.
      * `[✅]`   `finalizeContributionJob` receives the persist result's `contribution` (not the upload's raw record) and the identity result's `storageFileType` and `isContinuationForStorage` in its params.
      * `[✅]`   Neither `params` nor `payload` is mutated — verified by deep-equality snapshot before and after.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `construction`
      * `[✅]`   The module exports `saveContributionResponse` as a standalone function with the full `(deps, params, payload)` signature. The orchestrator binds deps at context-creation time to produce a `BoundSaveContributionResponseFn`.
      * `[✅]`   No factory, no class, no partially constructed instance. The function is the module.

   * `[✅]`   `saveContributionResponse.ts`
      * `[✅]`   One exported function, typed `SaveContributionResponseFn`, implementing the interaction spec in its stated order: deps guard, params guard, identity resolution, `contributionType` extraction from `payload.canonicalPathParams`, `buildUploadContext` param assembly, `isModelContributionContext` guard, upload, `isDialecticContribution` guard, relationship persistence, finalization, success return.
      * `[✅]`   Every collaborator call is awaited. Every error from a collaborator or a guard failure returns this module's error arm — no error is logged and continued.
      * `[✅]`   The `buildUploadContext` params are assembled from: identity result fields (`restOfCanonicalPathParams`, `storageFileType`, `sourceGroupFragment`, `isContinuationForStorage`, `targetContributionId`, `description`), payload fields (`projectId`, `sessionId`, `iterationNumber`, `document_key` as `documentKey`, `canonicalPathParams.contributionType` narrowed via `isContributionType`, `continuation_count` as `continuationCount`, `source_prompt_resource_id` as `sourcePromptResourceId`, `document_relationships` as `documentRelationships`, `isIntermediate`), and params fields (`providerRow.api_identifier` as `modelSlug`, `job.attempt_count` as `attemptCount`, `job.user_id` as `projectOwnerUserId`, `{ id: providerRow.id, name: providerRow.name }` as `providerDetails`, `{ inputTokens: assembledResponse.inputTokens, outputTokens: assembledResponse.outputTokens, processingTimeMs: assembledResponse.processingTimeMs }` as `aiResponse`, `preparedContentResult.contentForStorage` as `contentForStorage`).
      * `[✅]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed or converted.

   * `[✅]`   `saveContributionResponse.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[✅]`   `saveContributionResponse.integration.test.ts`
      * `[✅]`   Chain: `saveContributionResponse` → real `resolveContributionIdentity` → real `buildUploadContext`. The real `resolveContributionIdentity` is constructed with its own real deps (a real logger) and bound. The real `buildUploadContext` is the production function. The boundary is the database and the file manager: `dbClient` (shared between saveContributionResponse and the real resolveContributionIdentity, stubbed to return the required DB rows), `fileManager` (mock returning a valid contribution record), `persistContributionRelationships` (mock returning success with the contribution), and `finalizeContributionJob` (mock returning success with `status: 'completed'`).
      * `[✅]`   The integration proves that the `ResolveContributionIdentityParams` this module constructs from its own params are accepted by the real `resolveContributionIdentity`, that the identity result fields plus the payload fields compose a valid `BuildUploadContextParams` accepted by the real `buildUploadContext`, and that the resulting context passes `isModelContributionContext` — rather than a type error or a structural mismatch masked by a mock.
      * `[✅]`   Mock at the outer boundary only: the `dbClient` (shared between saveContributionResponse and the real resolveContributionIdentity), `fileManager`, `persistContributionRelationships`, and `finalizeContributionJob`. Every function inside the integrated chain — `resolveContributionIdentity`, `buildUploadContext`, `isModelContributionContext`, `isDialecticContribution` — is real.
      * `[✅]`   A case arranges a valid EXECUTE payload, a `dbClient` stubbed to return the required rows (the `dialectic_stage_recipe_steps` row for per-model consolidation if needed, the provider row), and a `fileManager` returning a valid `DialecticContributionRow`, and asserts that the chain produces a success result with `status: 'completed'`.
      * `[✅]`   A case arranges an identity-resolution failure (e.g., missing `document_key` for a document-related type) and asserts that the real `resolveContributionIdentity` returns its typed error and `saveContributionResponse` propagates it.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, sibling module interfaces (`resolveContributionIdentity`, `persistContributionRelationships`, `finalizeContributionJob`, `prepareResponseContent`, `createJobContext`), `buildUploadContext`, and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: this node edits no file outside its own folder except the three one-line bound-type additions to the three collaborator interfaces.

   * `[✅]`   `requirements`
      * `[✅]`   The return union has exactly two arms — interface test.
      * `[✅]`   `SaveContributionResponseDeps` declares exactly five deps — interface test.
      * `[✅]`   `SaveContributionResponseParams` declares exactly six per-invocation fields — interface test.
      * `[✅]`   `SaveContributionResponsePayload` is declared equivalent to `DialecticExecuteJobPayload` — interface test.
      * `[✅]`   `SaveContributionResponseSuccessReturn.status` discriminates the three terminal states — interface test.
      * `[✅]`   `BoundSaveContributionResponseFn` accepts `(params, payload)` — interface test.
      * `[✅]`   The three bound collaborator types are exported from their respective interfaces — interface test.
      * `[✅]`   Invalid deps returns error arm with `retriable: false` — unit test.
      * `[✅]`   Invalid params returns error arm with `retriable: false` — unit test.
      * `[✅]`   `resolveContributionIdentity` error propagated unchanged — unit test.
      * `[✅]`   `isModelContributionContext` failure returns `SaveContributionResponseBuildContextError` — unit test.
      * `[✅]`   `uploadAndRegisterFile` error returns `SaveContributionResponseUploadError` — unit test.
      * `[✅]`   `isDialecticContribution` failure returns `SaveContributionResponseContributionRecordError` — unit test.
      * `[✅]`   `persistContributionRelationships` error propagated unchanged — unit test.
      * `[✅]`   `finalizeContributionJob` error propagated unchanged — unit test.
      * `[✅]`   `buildUploadContext` receives identity-result fields and payload fields in the correct positions — unit test.
      * `[✅]`   `persistContributionRelationships` receives the uploaded contribution, not the finalized one — unit test.
      * `[✅]`   `finalizeContributionJob` receives the persist-result contribution, not the uploaded one — unit test.
      * `[✅]`   Success status forwards each of the three `finalizeContributionJob` statuses — unit test.
      * `[✅]`   Neither `params` nor `payload` is mutated — unit test.
      * `[✅]`   The chain of `saveContributionResponse → real resolveContributionIdentity → real buildUploadContext` produces a valid `ModelContributionUploadContext` — integration test.
      * `[✅]`   An identity-resolution failure in the real `resolveContributionIdentity` propagates through `saveContributionResponse` — integration test.

* `[✅]`   supabase/functions/dialectic-worker/saveCompressedResponse/saveCompressedResponse.ts **[BE] The COMPRESS arm: a continuation gate on `shouldContinue` alone for both modes, idempotent `CompressedContextRawJson` persistence, a RENDER dispatch plus `waiting_for_children` for a renderable source, and the extracted `CompressedContext` write for a text source**

   * `[✅]`   `objective`
      * `[✅]`   The COMPRESS tail does not exist as a separate module. The scope's target architecture routes `saveResponse` on `job_type`, and the COMPRESS arm is a distinct persistence model from the contribution arm: it persists resource artifacts (`CompressedContextRawJson`, `CompressedContext`) at canonical `_work` paths, uses `ResourceUploadContext` rather than `ModelContributionUploadContext`, dispatches RENDER for renderable sources only, and sets `waiting_for_children` instead of running a finalization sequence. No contribution row is created, no relationships are persisted, and no notifications are sent. The continuation decision is a single gate on `shouldContinue` from `prepareResponseContent` — no `continueUntilComplete` conjunction, no mode-specific completeness logic.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/saveCompressedResponse/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `SaveCompressedResponseReturn`.
         * `[✅]`   The deps slot declares three deps: `fileManager` (`IFileManager`), `buildUploadContext` (`BuildUploadContextFn`), `enqueueRenderJob` (`BoundEnqueueRenderJobFn`).
         * `[✅]`   The params slot declares five per-invocation values: `dbClient`, `job` (`DialecticJobRow`), `providerRow` (`AiProvidersRow`), `assembledResponse` (`UnifiedAIResponse`), `preparedContentResult` (`PrepareResponseContentPreparedReturn`).
         * `[✅]`   The payload slot is `SaveCompressedResponsePayload`, declared equivalent to `DialecticCompressJobPayload`. The payload is already proven by the orchestrator and is not re-guarded.
         * `[✅]`   The success arm carries `status: 'completed' | 'needs_continuation' | 'waiting_for_children'`.
         * `[✅]`   The continuation gate is on `preparedContentResult.shouldContinue` alone. When true, the module returns `{ status: 'needs_continuation' }` and the orchestrator handles continuation dispatch.
         * `[✅]`   On a complete result, `CompressedContextRawJson` is persisted via `buildUploadContext` with `BuildUploadContextResourceParams` and `fileManager.uploadAndRegisterFile`. The canonical path is deterministic from the payload's identity fields, so a re-persist at the same path is idempotent.
         * `[✅]`   For a json-mode source (`payload.mode === 'json'`): RENDER is dispatched via `deps.enqueueRenderJob` with `EnqueueRenderCompressedContextPayload`, the job row is updated to `waiting_for_children`, and the module returns `{ status: 'waiting_for_children' }`.
         * `[✅]`   For a text-mode source (`payload.mode === 'text'`): the compressed string is extracted and persisted as `CompressedContext` via a second `buildUploadContext` + `fileManager.uploadAndRegisterFile` call, no RENDER is dispatched, and the module returns `{ status: 'completed' }`.
         * `[✅]`   `enqueueRenderJob` errors are propagated unchanged on this module's error arm. Failures this module owns — file-manager upload errors and the `waiting_for_children` DB update error — return their own typed errors.
         * `[✅]`   `BoundSaveCompressedResponseFn` is defined in this module's interface as `(params, payload) => Promise<SaveCompressedResponseReturn>`.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it in the relocation node.
         * `[✅]`   No file outside `dialectic-worker/saveCompressedResponse/` is edited.
         * `[✅]`   The payload is read, not re-guarded. No `isRecord` probe of the payload survives in this module.
         * `[✅]`   Neither `params` nor `payload` is mutated on any path.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer persister for COMPRESS job results: given a proven COMPRESS payload, a completeness verdict, and the assembled response, persist the compressed artifact(s) and either dispatch a RENDER or write the extracted form, returning the terminal status.
      * `[✅]`   The role is correct because every decision has been made upstream (payload proving, provider resolution, response assembly, content preparation, token debit) and the only downstream work is persistence and RENDER dispatch, both of which this module owns.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not prove the payload. The orchestrator proves the payload before calling this module.
         * `[✅]`   Do not resolve contribution identity, persist relationships, or finalize a contribution job. No contribution exists in the COMPRESS path.
         * `[✅]`   Do not dispatch continuation. Return `needs_continuation` and the orchestrator dispatches.
         * `[✅]`   Do not dispatch retry. Return the error arm and the orchestrator decides.
         * `[✅]`   Do not send notifications. The scope states: "`saveResponse` holds no renderer dependency and sends no notification" — the COMPRESS arm sends none.
         * `[✅]`   Do not resolve the finish reason, sanitize content, or determine continuation. Those are upstream.
         * `[✅]`   Do not debit tokens. That is upstream in `debitForResponse`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/saveCompressedResponse` — persisting COMPRESS job results as resource artifacts and dispatching RENDER for renderable sources.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`IFileManager`).
         * `[✅]`   Layer classification: shared adapter interface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: `uploadAndRegisterFile` for persisting `CompressedContextRawJson` (always) and `CompressedContext` (text mode). Deps guard checks presence of `uploadAndRegisterFile` method.
      * `[✅]`   Provider: `createJobContext/JobContext.interface.ts` (`BuildUploadContextFn`).
         * `[✅]`   Layer classification: sibling factory interface.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: assembles `ResourceUploadContext` from payload identity fields and the content to persist. Deps guard checks `typeof value === 'function'`.
      * `[✅]`   Provider: `enqueueRenderJob/enqueueRenderJob.interface.ts` (`BoundEnqueueRenderJobFn`).
         * `[✅]`   Layer classification: sibling module bound closure.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: RENDER dispatch for json-mode sources. Deps guard checks `typeof value === 'function'`.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the job row, provider row, and assembled response types for params.
      * `[✅]`   Provider: `enqueueCompressJobs/enqueueCompressJobs.interface.ts` (`DialecticCompressJobPayload`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the payload arm type.
      * `[✅]`   Provider: `prepareResponseContent/prepareResponseContent.interface.ts` (`PrepareResponseContentPreparedReturn`).
         * `[✅]`   Layer classification: sibling module return type.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: `shouldContinue` for the continuation gate and `contentForStorage` for the persisted content.
      * `[✅]`   Provider: `_shared/utils/buildUploadContext/buildUploadContext.interface.ts` (`BuildUploadContextResourceParams`).
         * `[✅]`   Layer classification: shared contract types.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: typed construction of the `buildUploadContext` argument object for resource artifacts.
      * `[✅]`   Provider: `enqueueRenderJob/enqueueRenderJob.interface.ts` (`EnqueueRenderJobParams`, `EnqueueRenderCompressedContextPayload`).
         * `[✅]`   Layer classification: sibling module contract types.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: typed construction of the RENDER dispatch arguments for compressed context rendering.
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`FileType`, `CompressionMode`, `CompressionSourceType`, `ModelContributionFileTypes`, `DialecticStageSlug`).
         * `[✅]`   Layer classification: shared contract types.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the storage file type discriminants, mode type, source type, and path identity types.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the `dbClient` param.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildUnifiedAIResponse`), `_shared/supabase.mock.ts` (`createMockSupabaseClient`), `_shared/services/file_manager.mock.ts` (`createMockFileManagerService`), `prepareResponseContent/prepareResponseContent.mock.ts` (`buildPrepareResponseContentPreparedReturn`, `invalidatePrepareResponseContentPreparedReturn`), `enqueueRenderJob/enqueueRenderJob.mock.ts` (`buildEnqueueRenderJobSuccessReturn`).
         * `[✅]`   Layer classification: shared and sibling test fixture surfaces.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the imported types' fixtures and the injected client/service mocks configured per outcome.
      * `[✅]`   Confirm:
         * `[✅]`   `SaveCompressedResponseDeps` declares exactly `fileManager`, `buildUploadContext`, and `enqueueRenderJob`. `dbClient`, `job`, `providerRow`, `assembledResponse`, and `preparedContentResult` are per-invocation params.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service`, `enqueueRenderJob/`, `enqueueCompressJobs/`, or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From `dialectic-service/dialectic.interface.ts`: `DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse`, imported with `import type`.
         * `[✅]`   From `enqueueCompressJobs/enqueueCompressJobs.interface.ts`: `DialecticCompressJobPayload`, imported with `import type`.
         * `[✅]`   From `enqueueRenderJob/enqueueRenderJob.interface.ts`: `BoundEnqueueRenderJobFn`, `EnqueueRenderJobParams`, `EnqueueRenderCompressedContextPayload`, imported with `import type`.
         * `[✅]`   From `prepareResponseContent/prepareResponseContent.interface.ts`: `PrepareResponseContentPreparedReturn`, imported with `import type`.
         * `[✅]`   From `createJobContext/JobContext.interface.ts`: `BuildUploadContextFn`, imported with `import type`.
         * `[✅]`   From `_shared/utils/buildUploadContext/buildUploadContext.interface.ts`: `BuildUploadContextResourceParams`, imported with `import type`.
         * `[✅]`   From `_shared/types/file_manager.types.ts`: `IFileManager`, `FileType`, `CompressionMode`, `CompressionSourceType`, `ModelContributionFileTypes`, `DialecticStageSlug`, imported with `import type`.
         * `[✅]`   From `types_db.ts`: `Database`, imported with `import type`.

   * `[✅]`   `saveCompressedResponse.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof SaveCompressedResponseDeps, true>` over `fileManager`, `buildUploadContext`, and `enqueueRenderJob`, asserting three.
      * `[✅]`   A case proves the params surface exhaustively: `Record<keyof SaveCompressedResponseParams, true>` over `dbClient`, `job`, `providerRow`, `assembledResponse`, and `preparedContentResult`, asserting five.
      * `[✅]`   A case proves the return union has exactly two arms by assigning a success literal and an error literal to `SaveCompressedResponseReturn`.
      * `[✅]`   A case proves `SaveCompressedResponseSuccessReturn.status` discriminates `'completed'`, `'needs_continuation'`, and `'waiting_for_children'` by assigning each to the status field.
      * `[✅]`   A case proves `SaveCompressedResponsePayload` is assignable to and from `DialecticCompressJobPayload`.
      * `[✅]`   A case proves `SaveCompressedResponseFn` accepts `(deps, params, payload)` and returns `Promise<SaveCompressedResponseReturn>`.
      * `[✅]`   A case proves `BoundSaveCompressedResponseFn` accepts `(params, payload)` and returns `Promise<SaveCompressedResponseReturn>`.

   * `[✅]`   `saveCompressedResponse.interface.ts`
      * `[✅]`   `SaveCompressedResponseDeps` with three deps: `fileManager: IFileManager`, `buildUploadContext: BuildUploadContextFn`, `enqueueRenderJob: BoundEnqueueRenderJobFn`.
      * `[✅]`   `SaveCompressedResponseParams` with five fields: `dbClient: SupabaseClient<Database>`, `job: DialecticJobRow`, `providerRow: AiProvidersRow`, `assembledResponse: UnifiedAIResponse`, `preparedContentResult: PrepareResponseContentPreparedReturn`.
      * `[✅]`   `SaveCompressedResponsePayload` declared equivalent to `DialecticCompressJobPayload`.
      * `[✅]`   `SaveCompressedResponseSuccessReturn` with `status: 'completed' | 'needs_continuation' | 'waiting_for_children'`.
      * `[✅]`   `SaveCompressedResponseErrorReturn` with `error: Error` and `retriable: boolean`.
      * `[✅]`   `SaveCompressedResponseReturn` as the union of the two arms.
      * `[✅]`   `SaveCompressedResponseFn` typed `(deps, params, payload) => Promise<SaveCompressedResponseReturn>`.
      * `[✅]`   `BoundSaveCompressedResponseFn` typed `(params, payload) => Promise<SaveCompressedResponseReturn>`.
      * `[✅]`   `SaveCompressedResponseRawJsonUploadError` — when `uploadAndRegisterFile` returns an error for the `CompressedContextRawJson` upload, carrying the driver's message.
      * `[✅]`   `SaveCompressedResponseJobUpdateError` — when the `waiting_for_children` DB update on `dialectic_generation_jobs` fails, carrying the driver's message.
      * `[✅]`   `SaveCompressedResponseExtractedUploadError` — when `uploadAndRegisterFile` returns an error for the `CompressedContext` upload in text mode, carrying the driver's message.

   * `[✅]`   `saveCompressedResponse.interaction.spec`
      * `[✅]`   Branch: deps guard fails.
         * `[✅]`   Condition: `!isSaveCompressedResponseDeps(deps)`.
         * `[✅]`   Decision: deps guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveCompressedResponseDeps')`, `retriable: false`.
      * `[✅]`   Branch: params guard fails.
         * `[✅]`   Condition: `!isSaveCompressedResponseParams(params)`.
         * `[✅]`   Decision: params guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveCompressedResponseParams')`, `retriable: false`.
      * `[✅]`   Branch: continuation needed.
         * `[✅]`   Condition: `params.preparedContentResult.shouldContinue === true`.
         * `[✅]`   Decision: continuation gate on `shouldContinue` alone.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: success arm, `{ status: 'needs_continuation' }`.
      * `[✅]`   Branch: CompressedContextRawJson upload fails.
         * `[✅]`   Condition: `rawJsonResult.error`.
         * `[✅]`   Decision: error field check on the upload result.
         * `[✅]`   Dependency call: `deps.buildUploadContext(rawJsonResourceParams)` then `deps.fileManager.uploadAndRegisterFile(rawJsonContext)`. The `rawJsonResourceParams` is a `BuildUploadContextResourceParams` with `storageFileType: FileType.CompressedContextRawJson`, identity fields read from the payload (`projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `output_type`, `sourceType`, `documentKey`, `sourceId`, `role`, `chunk_index` as `chunkIndex`, `chunk_total` as `chunkTotal`), `contentForStorage` from `preparedContentResult.contentForStorage`, `projectOwnerUserId` from `job.user_id`, `sourcePromptResourceId` from `payload.source_prompt_resource_id`, and a constructed `description`.
         * `[✅]`   Outcome: error arm, `SaveCompressedResponseRawJsonUploadError`, `retriable: false`.
      * `[✅]`   Branch: json mode — RENDER dispatch fails.
         * `[✅]`   Condition: `payload.mode === 'json'` and `'error' in renderResult`.
         * `[✅]`   Decision: error-arm check on the `enqueueRenderJob` return.
         * `[✅]`   Dependency call: `deps.enqueueRenderJob(renderParams, renderPayload)`. `renderParams` is an `EnqueueRenderJobParams` built from the payload (`sessionId`, `stageSlug`, `iterationNumber`, `projectId`, `walletId`) and params (`job.id` as `jobId`, `job.user_id` as `projectOwnerUserId`, `payload.user_jwt` as `userAuthToken`, `providerRow.id` as `modelId`, `job.is_test_job` as `isTestJob`, `payload.output_type` as `outputType`). `renderPayload` is an `EnqueueRenderCompressedContextPayload` built from the payload (`sourceType`, `documentKey`, `docType`, `sourceStageSlug`, `output_type`).
         * `[✅]`   Outcome: propagate `renderResult` unchanged on this module's error arm.
      * `[✅]`   Branch: json mode — waiting_for_children DB update fails.
         * `[✅]`   Condition: `payload.mode === 'json'` and `updateError`.
         * `[✅]`   Decision: error field on the DB update result.
         * `[✅]`   Dependency call: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'waiting_for_children' }).eq('id', params.job.id)`.
         * `[✅]`   Outcome: error arm, `SaveCompressedResponseJobUpdateError`, `retriable: true`.
      * `[✅]`   Branch: json mode — all succeed.
         * `[✅]`   Condition: `payload.mode === 'json'` and all prior checks pass.
         * `[✅]`   Decision: none — fall-through.
         * `[✅]`   Dependency call: none additional.
         * `[✅]`   Outcome: success arm, `{ status: 'waiting_for_children' }`.
      * `[✅]`   Branch: text mode — CompressedContext upload fails.
         * `[✅]`   Condition: `payload.mode === 'text'` and `extractedResult.error`.
         * `[✅]`   Decision: error field check on the upload result.
         * `[✅]`   Dependency call: `deps.buildUploadContext(extractedResourceParams)` then `deps.fileManager.uploadAndRegisterFile(extractedContext)`. The `extractedResourceParams` is a `BuildUploadContextResourceParams` with `storageFileType: FileType.CompressedContext`, the same identity fields, `contentForStorage` from `preparedContentResult.contentForStorage`, and the same `projectOwnerUserId` and `sourcePromptResourceId`.
         * `[✅]`   Outcome: error arm, `SaveCompressedResponseExtractedUploadError`, `retriable: false`.
      * `[✅]`   Branch: text mode — all succeed.
         * `[✅]`   Condition: `payload.mode === 'text'` and all prior checks pass.
         * `[✅]`   Decision: none — fall-through.
         * `[✅]`   Dependency call: none additional.
         * `[✅]`   Outcome: success arm, `{ status: 'completed' }`.
      * `[✅]`   Side effects: file uploads via `deps.fileManager` (one for `CompressedContextRawJson` always, one for `CompressedContext` in text mode), DB update on `dialectic_generation_jobs` (`waiting_for_children` in json mode), RENDER dispatch via `deps.enqueueRenderJob` (json mode).
      * `[✅]`   Ordering: strictly sequential — the raw JSON upload precedes both mode branches; each mode branch is internally sequential.

   * `[✅]`   `saveCompressedResponse.mock.ts`
      * `[✅]`   `buildSaveCompressedResponseDeps` — builder returning a valid `SaveCompressedResponseDeps` with a mock file manager, a stub `buildUploadContext`, and a stub bound `enqueueRenderJob` returning success.
      * `[✅]`   `invalidateSaveCompressedResponseDeps` — invalidator that removes each dep key in turn.
      * `[✅]`   `buildSaveCompressedResponseParams` — builder returning a valid `SaveCompressedResponseParams` with a mock `dbClient`, a built `DialecticJobRow`, a built `AiProvidersRow`, a built `UnifiedAIResponse`, and a built `PrepareResponseContentPreparedReturn` with `shouldContinue: false`.
      * `[✅]`   `invalidateSaveCompressedResponseParams` — invalidator that removes each param key in turn.
      * `[✅]`   `buildSaveCompressedResponseSuccessReturn` — builder returning `{ status: 'completed' }`.
      * `[✅]`   `invalidateSaveCompressedResponseSuccessReturn` — invalidator removing `status`.
      * `[✅]`   `mockSaveCompressedResponseFn` — function mock returning the success builder's output.
      * `[✅]`   `mockBoundSaveCompressedResponseFn` — function mock returning the success builder's output, typed as `BoundSaveCompressedResponseFn`.

   * `[✅]`   `saveCompressedResponse.guard.test.ts`
      * `[✅]`   `isSaveCompressedResponseDeps`: a valid deps object passes; removing each of the three keys in turn fails; a non-object fails.
      * `[✅]`   `isSaveCompressedResponseParams`: a valid params object passes; removing each of the five keys in turn fails; a non-object fails.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `saveCompressedResponse.guard.ts`
      * `[✅]`   `isSaveCompressedResponseDeps` — checks `fileManager` has `uploadAndRegisterFile` method, `buildUploadContext` is a function, and `enqueueRenderJob` is a function.
      * `[✅]`   `isSaveCompressedResponseParams` — checks `dbClient` is an object, `job` is a record, `providerRow` is a record, `assembledResponse` is a record, `preparedContentResult` is a record with `retryRequired: false`.

   * `[✅]`   `saveCompressedResponse.test.ts`
      * `[✅]`   Guards on entry: deps invalid returns error arm with `retriable: false`, params invalid returns error arm with `retriable: false`.
      * `[✅]`   Continuation gate: `shouldContinue` true returns `{ status: 'needs_continuation' }` — no upload, no render dispatch, no DB update.
      * `[✅]`   `shouldContinue` false, `CompressedContextRawJson` upload error → returns `SaveCompressedResponseRawJsonUploadError` with `retriable: false`.
      * `[✅]`   Json mode, raw JSON uploaded, `enqueueRenderJob` returns error → propagated unchanged on this module's error arm.
      * `[✅]`   Json mode, RENDER dispatched, `waiting_for_children` DB update error → returns `SaveCompressedResponseJobUpdateError` with `retriable: true`.
      * `[✅]`   Json mode, all succeed → returns `{ status: 'waiting_for_children' }`.
      * `[✅]`   Text mode, raw JSON uploaded, `CompressedContext` upload error → returns `SaveCompressedResponseExtractedUploadError` with `retriable: false`.
      * `[✅]`   Text mode, both uploads succeed → returns `{ status: 'completed' }`.
      * `[✅]`   The `buildUploadContext` call for `CompressedContextRawJson` receives `storageFileType: FileType.CompressedContextRawJson` and the payload's identity fields (`projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `output_type`, `sourceType`, `documentKey`, `sourceId`, `role`, `chunk_index`, `chunk_total`), `preparedContentResult.contentForStorage` as `contentForStorage`, `job.user_id` as `projectOwnerUserId`, and `payload.source_prompt_resource_id` as `sourcePromptResourceId`.
      * `[✅]`   The `buildUploadContext` call for `CompressedContext` (text mode) receives `storageFileType: FileType.CompressedContext` with the same identity fields and content.
      * `[✅]`   The `EnqueueRenderJobParams` receives `job.id` as `jobId`, `payload.sessionId`, `payload.stageSlug`, `payload.iterationNumber`, the payload's `output_type` as `outputType`, `payload.projectId`, `job.user_id` as `projectOwnerUserId`, `payload.user_jwt` as `userAuthToken`, `providerRow.id` as `modelId`, `payload.walletId`, `job.is_test_job` as `isTestJob`.
      * `[✅]`   The `EnqueueRenderCompressedContextPayload` receives `payload.sourceType`, `payload.documentKey`, `payload.docType`, `payload.sourceStageSlug`, `payload.output_type`.
      * `[✅]`   `enqueueRenderJob` is not called in text mode.
      * `[✅]`   The DB update to `waiting_for_children` is not performed in text mode.
      * `[✅]`   Neither `params` nor `payload` is mutated — verified by deep-equality snapshot before and after.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `construction`
      * `[✅]`   The module exports `saveCompressedResponse` as a standalone function with the full `(deps, params, payload)` signature. The orchestrator binds deps at context-creation time to produce a `BoundSaveCompressedResponseFn`.
      * `[✅]`   No factory, no class, no partially constructed instance. The function is the module.

   * `[✅]`   `saveCompressedResponse.ts`
      * `[✅]`   One exported function, typed `SaveCompressedResponseFn`, implementing the interaction spec in its stated order: deps guard, params guard, continuation gate, `CompressedContextRawJson` resource params assembly, `buildUploadContext`, `uploadAndRegisterFile`, mode branch (json: render params assembly, `enqueueRenderJob`, `waiting_for_children` update, return; text: `CompressedContext` resource params assembly, `buildUploadContext`, `uploadAndRegisterFile`, return).
      * `[✅]`   Every collaborator call and every DB call is awaited. Every error returns this module's error arm — no error is logged and continued.
      * `[✅]`   The `BuildUploadContextResourceParams` for `CompressedContextRawJson` is assembled from: `storageFileType: FileType.CompressedContextRawJson`, payload fields (`projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `output_type`, `sourceType`, `documentKey`, `sourceId`, `role`, `chunk_index` as `chunkIndex`, `chunk_total` as `chunkTotal`, `source_prompt_resource_id` as `sourcePromptResourceId`), `preparedContentResult.contentForStorage` as `contentForStorage`, `job.user_id` as `projectOwnerUserId`, and a constructed `description`.
      * `[✅]`   The `BuildUploadContextResourceParams` for `CompressedContext` (text mode) uses `storageFileType: FileType.CompressedContext` with the same identity fields and `preparedContentResult.contentForStorage` as `contentForStorage`.
      * `[✅]`   The `EnqueueRenderJobParams` is assembled from: `job.id` as `jobId`, `payload.sessionId`, `payload.stageSlug`, `payload.iterationNumber`, `payload.output_type` as `outputType`, `payload.projectId`, `job.user_id` as `projectOwnerUserId`, `payload.user_jwt` as `userAuthToken`, `providerRow.id` as `modelId`, `payload.walletId`, `job.is_test_job ?? false` as `isTestJob`.
      * `[✅]`   The `EnqueueRenderCompressedContextPayload` is assembled from: `payload.sourceType`, `payload.documentKey`, `payload.docType`, `payload.sourceStageSlug`, `payload.output_type`.
      * `[✅]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed or converted.

   * `[✅]`   `saveCompressedResponse.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[✅]`   `saveCompressedResponse.integration.test.ts`
      * `[✅]`   Chain: `saveCompressedResponse` → real `buildUploadContext` → real `enqueueRenderJob`. The real `buildUploadContext` is the production function. The real `enqueueRenderJob` is constructed with its own real deps (a real `shouldEnqueueRenderJob`, a real `resolveTemplateFilename`, a real logger, a stubbed `dbClient`) and bound. The boundary is the database and the file manager: `dbClient` (stubbed to return the rows the render dispatch queries), `fileManager` (mock returning a valid resource record).
      * `[✅]`   The integration proves that the `BuildUploadContextResourceParams` this module constructs from its payload are accepted by the real `buildUploadContext`, that the `EnqueueRenderJobParams` and `EnqueueRenderCompressedContextPayload` this module constructs are accepted by the real `enqueueRenderJob`, and that the chain produces the expected result — rather than a type error or a structural mismatch masked by a mock.
      * `[✅]`   Mock at the outer boundary only: the `dbClient` (shared between saveCompressedResponse and the real enqueueRenderJob), `fileManager`. Every function inside the integrated chain — `buildUploadContext`, `enqueueRenderJob`, `shouldEnqueueRenderJob`, `resolveTemplateFilename` — is real.
      * `[✅]`   A case arranges a json-mode payload with `shouldContinue: false`, a `fileManager` returning a valid resource record, and a `dbClient` stubbed for the `waiting_for_children` update, and asserts that the chain produces `{ status: 'waiting_for_children' }` and the real `enqueueRenderJob` received the params this module built.
      * `[✅]`   A case arranges a text-mode payload with `shouldContinue: false`, a `fileManager` returning a valid resource record for both uploads, and asserts that the chain produces `{ status: 'completed' }` and `enqueueRenderJob` was not called.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, sibling module interfaces (`enqueueRenderJob`, `enqueueCompressJobs`, `prepareResponseContent`, `createJobContext`), `buildUploadContext`, and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: this node edits no file outside its own folder.

   * `[✅]`   `requirements`
      * `[✅]`   The return union has exactly two arms — interface test.
      * `[✅]`   `SaveCompressedResponseDeps` declares exactly three deps — interface test.
      * `[✅]`   `SaveCompressedResponseParams` declares exactly five per-invocation fields — interface test.
      * `[✅]`   `SaveCompressedResponsePayload` is declared equivalent to `DialecticCompressJobPayload` — interface test.
      * `[✅]`   `SaveCompressedResponseSuccessReturn.status` discriminates the three terminal states — interface test.
      * `[✅]`   `BoundSaveCompressedResponseFn` accepts `(params, payload)` — interface test.
      * `[✅]`   Invalid deps returns error arm with `retriable: false` — unit test.
      * `[✅]`   Invalid params returns error arm with `retriable: false` — unit test.
      * `[✅]`   `shouldContinue` true returns `needs_continuation` with no side effects — unit test.
      * `[✅]`   `CompressedContextRawJson` upload error returns `SaveCompressedResponseRawJsonUploadError` — unit test.
      * `[✅]`   Json mode: `enqueueRenderJob` error propagated unchanged — unit test.
      * `[✅]`   Json mode: `waiting_for_children` DB update error returns `SaveCompressedResponseJobUpdateError` with `retriable: true` — unit test.
      * `[✅]`   Json mode: all succeed returns `waiting_for_children` — unit test.
      * `[✅]`   Text mode: `CompressedContext` upload error returns `SaveCompressedResponseExtractedUploadError` — unit test.
      * `[✅]`   Text mode: both uploads succeed returns `completed` — unit test.
      * `[✅]`   `enqueueRenderJob` not called in text mode — unit test.
      * `[✅]`   `waiting_for_children` update not performed in text mode — unit test.
      * `[✅]`   `buildUploadContext` receives correct identity fields from payload — unit test.
      * `[✅]`   Neither `params` nor `payload` is mutated — unit test.
      * `[✅]`   The chain of `saveCompressedResponse → real buildUploadContext → real enqueueRenderJob` produces a RENDER dispatch result consistent with the real modules' contracts — integration test.
      * `[✅]`   Text-mode chain produces `completed` without calling `enqueueRenderJob` — integration test.

* `[✅]`   supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts **[BE] Persists the dispatcher's preflight input-token count onto the job row's payload in the update that queues the job**

   * `[✅]`   `objective`
      * `[✅]`   The dispatchers compute the input-token count for the affordability preflight and hand it to `enqueueModelCall` on `EnqueueModelCallPayload.preflightInputTokens` — `prepareModelJob` from `affordResult.resolvedInputTokenCount`, `processCompressJob` from its own `countTokens` call on the assembled prompt. `enqueueModelCall` receives the member and reads it nowhere: it is absent from the `dialectic_generation_jobs` update and absent from `AiStreamEventData`. `assembleAiResponse` reads `preflight_input_tokens` off the job payload when the provider returns no `token_usage`, finds nothing, and the synthesized usage bills zero input tokens. This node persists the count where the reader looks for it.
      * `[✅]`   Functional goals:
         * `[✅]`   `DialecticBaseJobPayload` declares `preflight_input_tokens?: number`. No arm redeclares it.
         * `[✅]`   `dialecticBaseJobPayloadAllowedKeys` admits `preflight_input_tokens`, so a payload carrying it passes the arm guards' extraneous-property check.
         * `[✅]`   `isDialecticBaseJobPayload` throws `Invalid preflight_input_tokens.` when the member is present and not a number.
         * `[✅]`   `enqueueModelCall` proves `params.job.payload` with `isDialecticBaseJobPayload`, composes a `DialecticBaseJobPayload` carrying `preflight_input_tokens: payload.preflightInputTokens`, and writes it alongside `status: 'queued'` in the update it already issues.
         * `[✅]`   A job payload that fails the base guard returns the error arm with `retriable: false`, carrying the guard's thrown `Error` unchanged.
         * `[✅]`   `AiStreamEventData` is unchanged and carries no token count.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   The write rides the existing update statement. No second query, no additional round trip.
         * `[✅]`   The proving and the write both precede the queue POST.
         * `[✅]`   No default is supplied anywhere. A payload that cannot be proven produces an error, never a zero.
         * `[✅]`   Every member of the row's payload other than `preflight_input_tokens` is written back unchanged.

   * `[✅]`   `role`
      * `[✅]`   Infra adapter at the dispatch boundary: it queues the model call and records what the dispatch was preflighted at.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not compute a token count. The dispatchers compute it and pass it in.
         * `[✅]`   Do not read or write any payload member other than `preflight_input_tokens`.
         * `[✅]`   Do not alter the event body, the size check, or the queue POST.
         * `[✅]`   Do not notify, retry, or write any job status other than the existing `queued`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/enqueueModelCall` — turning a claimed job into a queued model call, and recording the dispatch facts the response path reads back.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticBaseJobPayload`).
         * `[✅]`   Layer classification: shared type-guard package.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: prove the job row's `Json` payload before composing the write. Called, never injected.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticBaseJobPayload`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the composed payload written to the row.
      * `[✅]`   Confirm:
         * `[✅]`   `EnqueueModelCallDeps` is unchanged: `logger`, `netlifyQueueUrl`, `netlifyApiKey`, `apiKeyForProvider`, `computeJobSig`.
         * `[✅]`   `EnqueueModelCallParams` and `EnqueueModelCallPayload` are unchanged.
         * `[✅]`   No reverse dependency: `_shared` and `dialectic-service` do not import from `enqueueModelCall/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From `dialectic-service/dialectic.interface.ts`: `DialecticBaseJobPayload`, imported with `import type`.
         * `[✅]`   From `_shared/utils/type-guards/type_guards.dialectic.ts`: `isDialecticBaseJobPayload`, a value import.

   * `[✅]`   `supabase/functions/dialectic-service/dialectic.interface.ts`
      * `[✅]`   `DialecticBaseJobPayload` gains `preflight_input_tokens?: number`, declared beside `source_prompt_resource_id`.
      * `[✅]`   No arm payload redeclares the member.

   * `[✅]`   `enqueueModelCall.interaction.spec`
      * `[✅]`   Branch: job payload fails the base guard.
         * `[✅]`   Condition: `isDialecticBaseJobPayload(params.job.payload)` throws.
         * `[✅]`   Decision: the base payload guard, called inside a `try`.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, the thrown `Error` surfaced unchanged, `retriable: false`. No update is issued and no fetch is made.
      * `[✅]`   Branch: job payload proves.
         * `[✅]`   Condition: the guard returns.
         * `[✅]`   Decision: none.
         * `[✅]`   Dependency call: the existing `params.dbClient.from('dialectic_generation_jobs').update(...).eq('id', params.job.id)`, its argument now carrying both `status: 'queued'` and the composed payload.
         * `[✅]`   Outcome: falls through to the existing DB-error branch, which is unchanged.
      * `[✅]`   Ordering: the guard runs after the `params.job.user_id` check and after `deps.computeJobSig`, immediately before the update. The event body assembly, the 500 KB size check and the queue POST follow the update unchanged.
      * `[✅]`   Side effects: one `dialectic_generation_jobs` update, then one queue POST.

   * `[✅]`   `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.test.ts`
      * `[✅]`   `isDialecticBaseJobPayload` accepts `buildDialecticBaseJobPayload()` with the member absent.
      * `[✅]`   `isDialecticBaseJobPayload` accepts `buildDialecticBaseJobPayload({ preflight_input_tokens: 128 })`.
      * `[✅]`   `isDialecticBaseJobPayload` throws `Invalid preflight_input_tokens.` on `invalidateDialecticBaseJobPayload({ preflight_input_tokens: 'x' })`.
      * `[✅]`   `isDialecticBaseJobPayload` throws `Invalid preflight_input_tokens.` on `invalidateDialecticBaseJobPayload({ preflight_input_tokens: null })`.
      * `[✅]`   `isDialecticExecuteJobPayload` accepts `buildDialecticExecuteJobPayload({ preflight_input_tokens: 128 })`, proving the allowed-key set admits the member.
      * `[✅]`   `isDialecticCompressJobPayload` accepts a compress payload carrying `preflight_input_tokens: 128`.

   * `[✅]`   `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.ts`
      * `[✅]`   `dialecticBaseJobPayloadAllowedKeys` gains `'preflight_input_tokens'`.
      * `[✅]`   `isDialecticBaseJobPayload` gains, in its optional-member section, a check throwing `Invalid preflight_input_tokens.` when the member is present and `typeof` is not `number`.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.test.ts`
      * `[✅]`   The update argument carries `preflight_input_tokens` equal to the `preflightInputTokens` supplied on the payload, asserted against an independent literal — unit test.
      * `[✅]`   The update argument still carries `status: 'queued'` — unit test.
      * `[✅]`   Every other member of the job row's payload appears in the update argument with its original value — unit test.
      * `[✅]`   A job row whose payload fails `isDialecticBaseJobPayload` returns the error arm with `retriable: false` and the guard's message, with no update issued and no fetch made — unit test.
      * `[✅]`   The posted `AiStreamEventData` carries no token count — unit test.
      * `[✅]`   Every block carries the four-field header and the inline section markers.

   * `[✅]`   `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts`
      * `[✅]`   Import `DialecticBaseJobPayload` and `isDialecticBaseJobPayload`.
      * `[✅]`   Between the `computeJobSig` block and the update, prove `params.job.payload` inside a `try`; the `catch` returns the error arm with the thrown `Error` and `retriable: false`.
      * `[✅]`   Compose the written payload as a `DialecticBaseJobPayload` spreading the proven payload and setting `preflight_input_tokens` from `payload.preflightInputTokens`.
      * `[✅]`   Pass both `status: 'queued'` and the composed payload to the existing `.update(...)`.
      * `[✅]`   Leave the event data, the size check and the fetch untouched.

   * `[✅]`   `requirements`
      * `[✅]`   `DialecticBaseJobPayload` declares `preflight_input_tokens` as an optional number — guard test.
      * `[✅]`   A base payload carrying a numeric count passes the base guard and both arm guards — guard test.
      * `[✅]`   A base payload carrying a non-numeric count is rejected with the named diagnostic — guard test.
      * `[✅]`   The queueing update writes the count supplied on the payload — unit test.
      * `[✅]`   The queueing update preserves `status: 'queued'` and every other payload member — unit test.
      * `[✅]`   An unprovable job payload returns the error arm and performs no side effect — unit test.
      * `[✅]`   The stream event carries no token count — unit test.

* `[✅]`   supabase/functions/dialectic-worker/assembleAiResponse/assembleAiResponse.ts **[BE] The preflight input-token count becomes optional, and a synthesized usage that has no count returns the error arm instead of billing zero**

   * `[✅]`   `objective`
      * `[✅]`   `AssembleAiResponseParams.preflightInputTokens` is a required `number`, but the count does not exist until `enqueueModelCall` writes it at dispatch, so the orchestrator reads `number | undefined` off the job payload and has nothing compliant to pass when the member is absent. The one branch that reads it — provider returned no `token_usage` and the content is non-empty — synthesizes `prompt_tokens` and `total_tokens` from it, and those figures are what the wallet is debited against. A fabricated zero there is indistinguishable from a measured zero and silently bills no input tokens. This node makes the count optional and makes its absence a typed failure at the one place it matters.
      * `[✅]`   Functional goals:
         * `[✅]`   `AssembleAiResponseParams.preflightInputTokens` becomes `preflightInputTokens?: number`. `keyof` still admits the member, so the existing params surface case is unchanged.
         * `[✅]`   `AssembleAiResponseMissingPreflightErrorConstructorParams` declares `apiIdentifier: string`.
         * `[✅]`   `AssembleAiResponseMissingPreflightError` extends `Error`, holds `apiIdentifier` readonly, sets `name` to its own class name, and builds its message as `apiIdentifier: ${params.apiIdentifier}`.
         * `[✅]`   `AssembleAiResponseErrorReturn.error` becomes `AssembleAiResponseTokenCountError | AssembleAiResponseMissingPreflightError`, declared in the interface.
         * `[✅]`   The synthesize branch returns the error arm carrying `AssembleAiResponseMissingPreflightError` with `retriable: false` when `params.preflightInputTokens` is absent, before `deps.countTokens` is called.
         * `[✅]`   Every other branch is unchanged: a provider-supplied `tokenUsage` is relayed and the count is never read; empty content leaves `tokenUsage` null and reaches no synthesis.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No default is supplied for an absent count anywhere in this module.
         * `[✅]`   `AssembleAiResponseDeps`, `AssembleAiResponsePayload`, `AssembleAiResponseSuccessReturn` and the `UnifiedAIResponse` assembly are untouched.
         * `[✅]`   The function stays synchronous and performs no IO.

   * `[✅]`   `role`
      * `[✅]`   App-layer transform: it turns the stream result and the caller's per-invocation measurements into a `UnifiedAIResponse`.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not read the job row or the job payload. The orchestrator reads the count and passes it.
         * `[✅]`   Do not compute or estimate an input-token count when none was supplied.
         * `[✅]`   Do not debit, log a failure and continue, or convert either error into the other.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/assembleAiResponse` — assembling the unified response from a completed stream call.

   * `[✅]`   `assembleAiResponse.interface.test.ts`
      * `[✅]`   Every existing block stays byte-for-byte. Nothing is renamed, reordered, deleted or re-asserted. The two new blocks are appended to the end of the file.
      * `[✅]`   The existing block `AssembleAiResponseParams has the required surface` keeps all three keys and keeps `assertEquals(Object.keys(surface).length, 3)`. `keyof` admits an optional member, so making `preflightInputTokens` optional leaves that record correct. Do not edit that block.
      * `[✅]`   Add `AssembleAiResponseMissingPreflightErrorConstructorParams` to the existing `import type { … }` block from `./assembleAiResponse.interface.ts`. Add no other import, and add nothing to the value import on the file's second line.
      * `[✅]`   Append the block `AssembleAiResponseParams.preflightInputTokens admits undefined`. Its body is one typed assignment and one assertion: a `const` annotated `AssembleAiResponseParams["preflightInputTokens"]` assigned `undefined`, then `assertEquals` of that const to `undefined`. The indexed access names the exported symbol, needs no `modelConfig`, and compiles only while the member admits `undefined`.
      * `[✅]`   Append the block `AssembleAiResponseMissingPreflightErrorConstructorParams has the required surface`. Copy the shape of the existing `AssembleAiResponseTokenCountErrorConstructorParams has the required surface` block: a `const surface` annotated `Record<keyof AssembleAiResponseMissingPreflightErrorConstructorParams, true>` with `apiIdentifier: true`, then `assertEquals(Object.keys(surface).length, 1)`.
      * `[✅]`   Both new blocks take the collapsed header — the one-line `Contract` comment alone, no `Arrange` / `Act` / `Assert` fields and no inline markers.
      * `[✅]`   Do not construct an `AssembleAiResponseMissingPreflightError`, do not construct an `AssembleAiResponseParams` object literal, and do not import or call any builder, mock or guard. The class is proven by its constructor-params surface here; that the error arm admits it is proven by `isAssembleAiResponseErrorReturn` in the guard test.
      * `[✅]`   Do not use `Parameters<AssembleAiResponseFn>[n]` in either block.
      * `[✅]`   RED for this element is the compiler reporting that `AssembleAiResponseMissingPreflightErrorConstructorParams` is not exported and that `undefined` is not assignable to `AssembleAiResponseParams["preflightInputTokens"]`. Report both verbatim and stop; do not create or edit `assembleAiResponse.interface.ts` from this element.

   * `[✅]`   `assembleAiResponse.interface.ts`
      * `[✅]`   `AssembleAiResponseParams.preflightInputTokens` becomes optional.
      * `[✅]`   `AssembleAiResponseMissingPreflightErrorConstructorParams` is declared with `apiIdentifier: string`.
      * `[✅]`   `AssembleAiResponseMissingPreflightError` is declared beside `AssembleAiResponseTokenCountError`, following that class's shape.
      * `[✅]`   `AssembleAiResponseErrorReturn.error` is widened to the two-class union.

   * `[✅]`   `assembleAiResponse.interaction.spec`
      * `[✅]`   Branch: provider supplied a token usage.
         * `[✅]`   Condition: `payload.tokenUsage !== null`.
         * `[✅]`   Decision: null check on the payload member.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: the usage is relayed; `params.preflightInputTokens` is never read; success arm.
      * `[✅]`   Branch: no usage, no content.
         * `[✅]`   Condition: `effectiveTokenUsage === null` and `contentString === null`.
         * `[✅]`   Decision: null checks.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: `tokenUsage` stays null; success arm; the count is never read.
      * `[✅]`   Branch: no usage, content present, no count.
         * `[✅]`   Condition: `effectiveTokenUsage === null`, `contentString !== null`, `params.preflightInputTokens === undefined`.
         * `[✅]`   Decision: presence check on the params member.
         * `[✅]`   Dependency call: none — `deps.countTokens` is not reached.
         * `[✅]`   Outcome: error arm, `new AssembleAiResponseMissingPreflightError({ apiIdentifier: params.modelConfig.api_identifier })`, `retriable: false`.
      * `[✅]`   Branch: no usage, content present, count supplied, counting throws.
         * `[✅]`   Condition: `deps.countTokens` throws.
         * `[✅]`   Decision: `try`/`catch` around the call.
         * `[✅]`   Dependency call: `deps.countTokens`.
         * `[✅]`   Outcome: error arm, the existing `AssembleAiResponseTokenCountError`, `retriable: false`.
      * `[✅]`   Branch: no usage, content present, count supplied, counting returns.
         * `[✅]`   Condition: the call returns a number.
         * `[✅]`   Decision: none.
         * `[✅]`   Dependency call: `deps.countTokens`.
         * `[✅]`   Outcome: usage synthesized with `prompt_tokens` the supplied count, `completion_tokens` the returned count, `total_tokens` their sum; success arm.
      * `[✅]`   Ordering: the presence check precedes the counting call, so a missing count never spends a tokenizer pass and never masks its own failure behind a thrown counting error.

   * `[✅]`   `assembleAiResponse.mock.ts`
      * `[✅]`   `buildAssembleAiResponseParams` keeps `preflightInputTokens: 200`; the builder produces a valid object and the absent state is reached by omission at the call site.
      * `[✅]`   `AssembleAiResponseMissingPreflightErrorConstructorParamsOverrides`, `buildAssembleAiResponseMissingPreflightErrorConstructorParams`, `AssembleAiResponseMissingPreflightErrorConstructorParamsCorruptions` and `invalidateAssembleAiResponseMissingPreflightErrorConstructorParams` are added, following the `TokenCountError` constructor-params block.
      * `[✅]`   `buildAssembleAiResponseMissingPreflightError` returns a real instance composed from that params builder.

   * `[✅]`   `assembleAiResponse.guard.test.ts`
      * `[✅]`   `isAssembleAiResponseParams` accepts `buildAssembleAiResponseParams()`.
      * `[✅]`   `isAssembleAiResponseParams` accepts a params object with `preflightInputTokens` rest-destructured away.
      * `[✅]`   `isAssembleAiResponseParams` rejects `invalidateAssembleAiResponseParams({ preflightInputTokens: 'x' })`.
      * `[✅]`   `isAssembleAiResponseParams` rejects `invalidateAssembleAiResponseParams({ preflightInputTokens: -1 })`.
      * `[✅]`   `isAssembleAiResponseParams` rejects `invalidateAssembleAiResponseParams({ preflightInputTokens: Number.NaN })`.
      * `[✅]`   `isAssembleAiResponseParams` rejects `invalidateAssembleAiResponseParams({ preflightInputTokens: null })`.
      * `[✅]`   `isAssembleAiResponseErrorReturn` accepts an error return built with `buildAssembleAiResponseMissingPreflightError`.
      * `[✅]`   `isAssembleAiResponseMissingPreflightError` accepts the built instance and rejects a `buildAssembleAiResponseTokenCountError` instance, a bare `Error`, and a non-object.
      * `[✅]`   The existing cases for the other guards are retained unchanged.

   * `[✅]`   `assembleAiResponse.guard.ts`
      * `[✅]`   `isAssembleAiResponseParams` checks `preflightInputTokens` only when the member is present, keeping the finite and non-negative conditions.
      * `[✅]`   `isAssembleAiResponseErrorReturn` accepts either owned error class.
      * `[✅]`   `isAssembleAiResponseMissingPreflightError` is added as an `instanceof` guard beside `isAssembleAiResponseTokenCountError`.

   * `[✅]`   `assembleAiResponse.test.ts`
      * `[✅]`   A provider-supplied usage is relayed unchanged when no count is supplied, and `deps.countTokens` is not called — unit test.
      * `[✅]`   Empty assembled content with no provider usage and no count returns success with `tokenUsage` null — unit test.
      * `[✅]`   No provider usage, content present, no count returns the error arm carrying `AssembleAiResponseMissingPreflightError` with `retriable: false`, and `deps.countTokens` is not called — unit test.
      * `[✅]`   The error's `apiIdentifier` is the `modelConfig.api_identifier` supplied in params, asserted against an independent literal — unit test.
      * `[✅]`   No provider usage, content present, count supplied yields `prompt_tokens` equal to the supplied count and `total_tokens` equal to that count plus the counted completion, both asserted against independent literals — unit test.
      * `[✅]`   A throwing `deps.countTokens` with a count supplied still returns `AssembleAiResponseTokenCountError` — unit test.
      * `[✅]`   Every block carries the four-field header and the inline section markers.

   * `[✅]`   `assembleAiResponse.ts`
      * `[✅]`   Import the new error class from the interface.
      * `[✅]`   Inside the `effectiveTokenUsage === null && contentString !== null` branch, before the `try`, return the error arm when `params.preflightInputTokens` is `undefined`.
      * `[✅]`   Hold the proven count in a `number` and use it for both `prompt_tokens` and the `total_tokens` sum.
      * `[✅]`   Leave the content derivation, the finish-reason resolution, the provider-usage relay and the `UnifiedAIResponse` assembly untouched.

   * `[✅]`   `requirements`
      * `[✅]`   `preflightInputTokens` is optional on `AssembleAiResponseParams` — interface test.
      * `[✅]`   `AssembleAiResponseMissingPreflightError` is admitted by the error arm of the return union — interface test.
      * `[✅]`   A params object without the count passes its guard — guard test.
      * `[✅]`   A non-numeric, negative, NaN or null count fails its guard — guard test.
      * `[✅]`   Synthesis without a count returns the typed error and spends no tokenizer pass — unit test.
      * `[✅]`   Synthesis with a count produces `prompt_tokens` and `total_tokens` from it — unit test.
      * `[✅]`   A relayed provider usage and an empty-content response both succeed without a count — unit test.

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveResponse.ts **[BE] The relocation node: a thin orchestrator routing on the row's `job_type`, with `SaveResponseDeps` narrowed to eight bound collaborators, `SaveResponseSuccessReturn['status']` gaining `waiting_for_children`, and the monolith body deleted**

   * `[✅]`   `objective`
      * `[✅]`   The monolith `saveResponse.ts` (1284 lines) performs every responsibility in a straight line: job and provider resolution, response assembly, debit, content preparation, contribution identity, upload, relationship persistence, render dispatch, continuation, notification, and final-status update. The scope's target architecture replaces the body with a thin orchestrator that routes on the job row's `job_type` column — EXECUTE to `saveContributionResponse`, COMPRESS to `saveCompressedResponse` — each module already landed and tested in its own node. The shared front half (job/provider resolution, response assembly, debit, content preparation) is delegated to the extracted modules (`loadJobContext`, `assembleAiResponse`, `debitForResponse`, `prepareResponseContent`), each already bound through `SaveResponseDeps`. The retry path is a single call site: the orchestrator builds the `FailedAttemptError[]` from the retry-required flavor and dispatches `retryJob`. The monolith body is deleted.
      * `[✅]`   Functional goals:
         * `[✅]`   `SaveResponseDeps` is narrowed to the orchestrator's actual deps: `logger` (`ILogger`), `retryJob` (`BoundRetryJobFn`), `loadJobContext` (`BoundLoadJobContextFn`), `assembleAiResponse` (`BoundAssembleAiResponseFn`), `debitForResponse` (`BoundDebitForResponseFn`), `prepareResponseContent` (`BoundPrepareResponseContentFn`), `saveContributionResponse` (`BoundSaveContributionResponseFn`), `saveCompressedResponse` (`BoundSaveCompressedResponseFn`). Eight deps, each a bound closure — no `fileManager`, `notificationService`, `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens`, `sanitizeJsonContent`, or `enqueueRenderJob`.
         * `[✅]`   `SaveResponseParams` is narrowed to `dbClient` and `job_id`. The params carry what the payload cannot: the database handle and the job identifier.
         * `[✅]`   `SaveResponsePayload` changes to the stream result: `assembled_content` (`string`), `token_usage` (`NodeTokenUsage | null`), `finish_reason` (`string | null`), `processingTimeMs` (`number`). The payload is the stream callback's output; it is not a job payload and is not proven by a job-type guard.
         * `[✅]`   `SaveResponseSuccessReturn['status']` gains `'waiting_for_children'` — the new union is `'completed' | 'needs_continuation' | 'continuation_limit_reached' | 'waiting_for_children'`.
         * `[✅]`   `SaveResponseErrorReturn` is unchanged: `{ error: Error; retriable: boolean }`.
         * `[✅]`   The orchestrator calls `loadJobContext` to obtain the `job`, `providerRow`, `modelConfig`, `walletId`, and `projectId`. It then selects the arm on `job.job_type` and proves the row's payload for that arm, before any further collaborator runs. Then `assembleAiResponse` to assemble the `UnifiedAIResponse`. Then `debitForResponse` to debit the spend. Then `prepareResponseContent` to determine completeness. On a retry-required result from `prepareResponseContent`, the orchestrator builds a `FailedAttemptError[]` from the retry reason and dispatches `retryJob`, returning `{ status: 'completed' }`. On a prepared result the orchestrator dispatches the arm module it already selected: `'EXECUTE'` dispatches `saveContributionResponse`, `'COMPRESS'` dispatches `saveCompressedResponse`.
         * `[✅]`   The job payload is read from the job row and proven immediately after `loadJobContext`, because `prepareResponseContent` takes arm-specific params and cannot be called before the arm is known. `'EXECUTE'` proves `DialecticExecuteJobPayload` with `isDialecticExecuteJobPayload`, `'COMPRESS'` proves `DialecticCompressJobPayload` with `isDialecticCompressJobPayload`, and any other `job_type` returns the error arm with `retriable: false`. Each guard is imported from its payload's owning module. Both guards throw a per-member diagnostic rather than returning `false`, so each call sits in a `try` whose `catch` returns the thrown `Error` unchanged on the error arm with `retriable: false`. The proven payload is what supplies `prepareResponseContent`'s params and what the arm module receives.
         * `[✅]`   `prepareResponseContent` receives `jobId` from `params.job_id` and `continueUntilComplete` from the proven payload's base member; its remaining params are arm-derived. EXECUTE supplies `documentKey` from `document_key` and `contextForDocuments` from `context_for_documents`, omits `mode`, and passes `sourceObject: undefined`. COMPRESS supplies `documentKey` from `documentKey` and `mode` from `mode`, passes `contextForDocuments: undefined`, and supplies `sourceObject` by `JSON.parse` of `content` narrowed with `isContentToInclude`; content that does not parse or does not narrow returns the error arm with `retriable: false`.
         * `[✅]`   `assembleAiResponse` receives `preflightInputTokens` from the proven payload's `preflight_input_tokens`, passed through absent when the member is absent. The orchestrator supplies no substitute value.
         * `[✅]`   Each arm module's return is propagated: success returns are forwarded directly on this module's success arm, error returns are forwarded directly on this module's error arm. The orchestrator adds no wrapping.
         * `[✅]`   `BoundRetryJobFn`, `BoundLoadJobContextFn`, `BoundDebitForResponseFn`, and `BoundPrepareResponseContentFn` are declared in their respective module interfaces. `BoundSaveContributionResponseFn` and `BoundSaveCompressedResponseFn` are declared in their respective module interfaces.
         * `[✅]`   `NodeTokenUsage`, `SaveResponseRequestBody`, `isSaveResponseRequestBody` are retained — they are consumed by `netlifyResponse` and the request-body guard.
         * `[✅]`   The legacy helper functions `readOptionalPreflightInputTokens` and `readOptionalContinuationCount` are deleted — their work was relocated into the extracted modules.
         * `[✅]`   The existing test suites (`saveResponse.test.ts`, `saveResponse.continue.test.ts`, `saveResponse.pathContext.test.ts`, `saveResponse.rawJsonOnly.test.ts`, `saveResponse.notifications.test.ts`, `saveResponse.assembleDocument.test.ts`, `saveResponse.planValidation.test.ts`) are retained in full as the orchestrator's integration tier. Per the scope: "The existing test suites are the regression oracle, pinned to the unchanged public signature, then retained IN FULL as the orchestrator's integration tier. The suites are renamed to integration tests and no case is deleted."
      * `[✅]`   Non-functional constraints:
         * `[✅]`   No file outside `dialectic-worker/saveResponse/` is edited. The extracted modules are already landed; `netlifyResponse/index.ts` is a separate node.
         * `[✅]`   Every path the monolith takes today, the orchestrator + modules take unchanged. The orchestrator is assembly — it does not invent logic, it dispatches. Every retry condition, every status, every error message survives in the arm module that inherited it.
         * `[✅]`   The payload is read, not mutated. The job payload from the job row is proven once with the arm's guard and passed through unchanged.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test, or one of the retained integration-tier suites.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer orchestrator: given a `job_id` and stream output, load context, assemble, debit, prepare, and route to the arm module that owns the persistence model for the job's type.
      * `[✅]`   The role is correct because every decision below the routing point is owned by the arm module, and every decision above it is owned by the shared front-half modules. The orchestrator connects, it does not decide.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not persist contributions, resources, or artifacts. The arm modules do that.
         * `[✅]`   Do not dispatch RENDER. The arm modules do that.
         * `[✅]`   Do not send notifications. The arm modules do that (contribution arm only).
         * `[✅]`   Do not dispatch continuation. The arm modules return the status and the orchestrator forwards it.
         * `[✅]`   Do not resolve contribution identity, persist relationships, or finalize. Those are internal to `saveContributionResponse`.
         * `[✅]`   Do not assemble upload contexts. The arm modules do that.
         * `[✅]`   Do not resolve the finish reason, sanitize content, or determine continuation. `prepareResponseContent` does that.
         * `[✅]`   Do not debit tokens. `debitForResponse` does that.
         * `[✅]`   Do not assemble the `UnifiedAIResponse`. `assembleAiResponse` does that.
         * `[✅]`   Do not load the job or provider row. `loadJobContext` does that.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/saveResponse` — orchestrating the stream callback's persistence path by routing on `job_type` to the arm module that owns the job type's persistence model.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `retryJob/retryJob.interface.ts` (`RetryJobFn`, `RetryJobDeps`, `RetryJobParams`, `RetryJobPayload`, `RetryJobReturn`, `BoundRetryJobFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: dispatch retry on a retry-required prepareResponseContent result. `BoundRetryJobFn = (params, payload) => Promise<RetryJobReturn>` — deps pre-injected at bind time.
      * `[✅]`   Provider: `loadJobContext/loadJobContext.interface.ts` (`LoadJobContextFn`, `LoadJobContextReturn`, `LoadJobContextSuccessReturn`, `BoundLoadJobContextFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: load the job row, provider row, model config, walletId, and projectId from the database. `BoundLoadJobContextFn = (params, payload) => Promise<LoadJobContextReturn>` — deps pre-injected at bind time.
      * `[✅]`   Provider: `assembleAiResponse/assembleAiResponse.interface.ts` (`AssembleAiResponseReturn`, `AssembleAiResponseSuccessReturn`, `BoundAssembleAiResponseFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: assemble the `UnifiedAIResponse` from the stream payload. `BoundAssembleAiResponseFn = (params, payload) => AssembleAiResponseReturn` — deps pre-injected at bind time. Synchronous (no `Promise`).
      * `[✅]`   Provider: `debitForResponse/debitForResponse.interface.ts` (`DebitForResponseReturn`, `BoundDebitForResponseFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: debit the wallet for the spend. `BoundDebitForResponseFn = (params, payload) => Promise<DebitForResponseReturn>` — deps pre-injected at bind time.
      * `[✅]`   Provider: `prepareResponseContent/prepareResponseContent.interface.ts` (`PrepareResponseContentReturn`, `PrepareResponseContentSuccessReturn`, `PrepareResponseContentPreparedReturn`, `PrepareResponseContentRetryRequiredReturn`, `BoundPrepareResponseContentFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: sanitize, parse, determine continuation, and decide completeness. `BoundPrepareResponseContentFn = (params, payload) => PrepareResponseContentReturn` — deps pre-injected at bind time. Synchronous (no `Promise`).
      * `[✅]`   Provider: `saveContributionResponse/saveContributionResponse.interface.ts` (`SaveContributionResponseReturn`, `BoundSaveContributionResponseFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: the EXECUTE arm — contribution persistence, relationship persistence, finalization. `BoundSaveContributionResponseFn = (params, payload) => Promise<SaveContributionResponseReturn>` — deps pre-injected at bind time.
      * `[✅]`   Provider: `saveCompressedResponse/saveCompressedResponse.interface.ts` (`SaveCompressedResponseReturn`, `BoundSaveCompressedResponseFn`).
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound from sibling.
         * `[✅]`   Purpose: the COMPRESS arm — resource artifact persistence, RENDER dispatch, waiting_for_children. `BoundSaveCompressedResponseFn = (params, payload) => Promise<SaveCompressedResponseReturn>` — deps pre-injected at bind time.
      * `[✅]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[✅]`   Layer classification: shared interface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: logging.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse`, `FailedAttemptError`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the job row, provider row, assembled response, and failed-attempt error types.
      * `[✅]`   Provider: `enqueueCompressJobs/enqueueCompressJobs.interface.ts` (`DialecticCompressJobPayload`), with guard `isDialecticCompressJobPayload`.
         * `[✅]`   Layer classification: sibling module contract.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the COMPRESS arm's payload type and its proving guard.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticExecuteJobPayload`), with guard `isDialecticExecuteJobPayload` from its owning guard file.
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the EXECUTE arm's payload type and its proving guard.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the `dbClient` param.
      * `[✅]`   Provider: `_shared/utils/determineContinuation/determineContinuation.interface.ts` (`DetermineContinuationParams`).
         * `[✅]`   Layer classification: shared utility contract.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the continuation-input contract `PrepareResponseContentParams` mirrors; its `documentKey` member is aligned by this node.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isContentToInclude`).
         * `[✅]`   Layer classification: shared type-guard package.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: narrow the parsed COMPRESS `content` to `ContentToInclude` for `sourceObject`. Called, never injected.
      * `[✅]`   Confirm:
         * `[✅]`   `SaveResponseDeps` declares exactly eight deps: `logger`, `retryJob`, `loadJobContext`, `assembleAiResponse`, `debitForResponse`, `prepareResponseContent`, `saveContributionResponse`, `saveCompressedResponse`. Every dep a bound closure except `logger`.
         * `[✅]`   No dep from the old `SaveResponseDeps` that was a collaborator of an arm module survives: `fileManager`, `notificationService`, `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens`, `sanitizeJsonContent`, `enqueueRenderJob` are all removed.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service`, or any sibling module imports from `saveResponse/`. `saveResponse/` imports contracts from its sibling modules, never their implementations.
      * `[✅]`   `context_slice`
         * `[✅]`   From `retryJob/retryJob.interface.ts`: `BoundRetryJobFn`, `RetryJobReturn`, imported with `import type`.
         * `[✅]`   From `loadJobContext/loadJobContext.interface.ts`: `BoundLoadJobContextFn`, `LoadJobContextSuccessReturn`, imported with `import type`.
         * `[✅]`   From `assembleAiResponse/assembleAiResponse.interface.ts`: `BoundAssembleAiResponseFn`, `AssembleAiResponseSuccessReturn`, imported with `import type`.
         * `[✅]`   From `debitForResponse/debitForResponse.interface.ts`: `BoundDebitForResponseFn`, imported with `import type`.
         * `[✅]`   From `prepareResponseContent/prepareResponseContent.interface.ts`: `BoundPrepareResponseContentFn`, `PrepareResponseContentPreparedReturn`, `PrepareResponseContentRetryRequiredReturn`, imported with `import type`.
         * `[✅]`   From `saveContributionResponse/saveContributionResponse.interface.ts`: `BoundSaveContributionResponseFn`, imported with `import type`.
         * `[✅]`   From `saveCompressedResponse/saveCompressedResponse.interface.ts`: `BoundSaveCompressedResponseFn`, imported with `import type`.
         * `[✅]`   From `dialectic-service/dialectic.interface.ts`: `DialecticJobRow`, `FailedAttemptError`, `DialecticExecuteJobPayload`, `DialecticCompressJobPayload`, imported with `import type`.
         * `[✅]`   From `_shared/types.ts`: `ILogger`, imported with `import type`.
         * `[✅]`   From `types_db.ts`: `Database`, imported with `import type`.
         * `[✅]`   From `enqueueCompressJobs/enqueueCompressJobs.interface.ts`: `DialecticCompressJobPayload`, imported with `import type`.
         * `[✅]`   Guard imports (`isDialecticExecuteJobPayload`, `isDialecticCompressJobPayload`, `isContentToInclude`) are value imports from their owning guard files.
         * `[✅]`   From `prepareResponseContent/prepareResponseContent.interface.ts`: `PrepareResponseContentParams`, imported with `import type`.

   * `[✅]`   `supabase/functions/_shared/utils/determineContinuation/determineContinuation.interface.ts`
      * `[✅]`   `DetermineContinuationParams.documentKey` becomes `string | null | undefined`, matching the producer member `DialecticExecuteJobPayload.document_key`, so no caller converts one absent representation into the other. The body's `typeof params.documentKey === "string"` gate already admits both absent states and is unchanged.

   * `[✅]`   `supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.interface.ts`
      * `[✅]`   `PrepareResponseContentParams.mode` becomes `mode?: CompressionMode`. An EXECUTE response omits it; `params.mode === 'text'` is false when absent, which is the structured-content branch.
      * `[✅]`   `PrepareResponseContentParams.documentKey` becomes `string | null | undefined`.

   * `[✅]`   `supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.mock.ts`
      * `[✅]`   `buildPrepareResponseContentParams` keeps its valid defaults; the absent `mode` and the null `documentKey` are reached by override and omission at the call site.

   * `[✅]`   `supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.guard.test.ts`
      * `[✅]`   `isPrepareResponseContentParams` accepts a params object with `mode` rest-destructured away.
      * `[✅]`   `isPrepareResponseContentParams` accepts `documentKey` set to `null`.
      * `[✅]`   `isPrepareResponseContentParams` rejects a `mode` that is present and is not a `CompressionMode`.
      * `[✅]`   `isPrepareResponseContentParams` rejects a `documentKey` that is present, not null, and not a string.

   * `[✅]`   `supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.guard.ts`
      * `[✅]`   `isPrepareResponseContentParams` calls `isCompressionMode` only when `mode` is present.
      * `[✅]`   `isPrepareResponseContentParams` admits `documentKey` null alongside undefined and string.

   * `[✅]`   `saveResponse.interface.test.ts`
      * `[✅]`   Typed assignments only.
      * `[✅]`   A case proves the deps surface exhaustively: `Record<keyof SaveResponseDeps, true>` over the eight dep keys, asserting eight.
      * `[✅]`   A case proves the params surface exhaustively: `Record<keyof SaveResponseParams, true>` over `dbClient` and `job_id`, asserting two.
      * `[✅]`   A case proves the payload surface exhaustively: `Record<keyof SaveResponsePayload, true>` over `assembled_content`, `token_usage`, `finish_reason`, and `processingTimeMs`, asserting four.
      * `[✅]`   A case proves the return union has exactly two arms by assigning a success literal and an error literal to `SaveResponseReturn`.
      * `[✅]`   A case proves `SaveResponseSuccessReturn.status` discriminates `'completed'`, `'needs_continuation'`, `'continuation_limit_reached'`, and `'waiting_for_children'` by assigning each to the status field.
      * `[✅]`   A case proves `NodeTokenUsage` has `prompt_tokens`, `completion_tokens`, and `total_tokens`.
      * `[✅]`   A case proves `SaveResponseFn` accepts `(deps, params, payload)` and returns `Promise<SaveResponseReturn>`.

   * `[✅]`   `saveResponse.interface.ts`
      * `[✅]`   `SaveResponseDeps` narrowed to eight deps: `logger: ILogger`, `retryJob: BoundRetryJobFn`, `loadJobContext: BoundLoadJobContextFn`, `assembleAiResponse: BoundAssembleAiResponseFn`, `debitForResponse: BoundDebitForResponseFn`, `prepareResponseContent: BoundPrepareResponseContentFn`, `saveContributionResponse: BoundSaveContributionResponseFn`, `saveCompressedResponse: BoundSaveCompressedResponseFn`.
      * `[✅]`   `SaveResponseParams` narrowed to `dbClient: SupabaseClient<Database>` and `job_id: string`.
      * `[✅]`   `SaveResponsePayload` carries `assembled_content: string`, `token_usage: NodeTokenUsage | null`, `finish_reason: string | null`, `processingTimeMs: number`.
      * `[✅]`   `SaveResponseSuccessReturn` with `status: 'completed' | 'needs_continuation' | 'continuation_limit_reached' | 'waiting_for_children'`.
      * `[✅]`   `SaveResponseErrorReturn` unchanged: `{ error: Error; retriable: boolean }`.
      * `[✅]`   `SaveResponseReturn` as the union.
      * `[✅]`   `SaveResponseFn` typed `(deps, params, payload) => Promise<SaveResponseReturn>`.
      * `[✅]`   `NodeTokenUsage` retained.
      * `[✅]`   `SaveResponseRequestBody` retained.

   * `[✅]`   `saveResponse.interaction.spec`
      * `[✅]`   Branch: deps guard fails.
         * `[✅]`   Condition: `!isSaveResponseDeps(deps)`.
         * `[✅]`   Decision: deps guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveResponseDeps')`, `retriable: false`.
      * `[✅]`   Branch: params guard fails.
         * `[✅]`   Condition: `!isSaveResponseParams(params)`.
         * `[✅]`   Decision: params guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveResponseParams')`, `retriable: false`.
      * `[✅]`   Branch: payload guard fails.
         * `[✅]`   Condition: `!isSaveResponsePayload(payload)`.
         * `[✅]`   Decision: payload guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Invalid SaveResponsePayload')`, `retriable: false`.
      * `[✅]`   Branch: loadJobContext fails.
         * `[✅]`   Condition: `'error' in loadJobContextResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.loadJobContext({ dbClient: params.dbClient, job_id: params.job_id }, {})`.
         * `[✅]`   Outcome: propagate the error arm unchanged.
      * `[✅]`   Branch: job_type is unknown.
         * `[✅]`   Condition: `job.job_type` is neither `'EXECUTE'` nor `'COMPRESS'`.
         * `[✅]`   Decision: exhaustiveness check on the row's column.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('Unknown job_type: ${job.job_type}')`, `retriable: false`.
      * `[✅]`   Branch: job_type is EXECUTE, the payload guard throws.
         * `[✅]`   Condition: `isDialecticExecuteJobPayload(job.payload)` throws.
         * `[✅]`   Decision: the arm's proving guard, called inside a `try`.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, the thrown `Error` surfaced unchanged, `retriable: false`.
      * `[✅]`   Branch: job_type is COMPRESS, the payload guard throws.
         * `[✅]`   Condition: `isDialecticCompressJobPayload(job.payload)` throws.
         * `[✅]`   Decision: the arm's proving guard, called inside a `try`.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, the thrown `Error` surfaced unchanged, `retriable: false`.
      * `[✅]`   Branch: job_type is COMPRESS, the payload's content does not yield a source object.
         * `[✅]`   Condition: `JSON.parse` of the proven payload's `content` throws, or `isContentToInclude` returns false for the parsed value.
         * `[✅]`   Decision: the parse inside a `try`, then the imported guard.
         * `[✅]`   Dependency call: none.
         * `[✅]`   Outcome: error arm, `new Error('COMPRESS payload content is not a source object')`, `retriable: false`.
      * `[✅]`   Branch: assembleAiResponse fails.
         * `[✅]`   Condition: `'error' in assembleResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.assembleAiResponse(assembleParams, assemblePayload)` — `assembleParams` carries `processingTimeMs` from the payload, the `modelConfig` from `loadJobContext`, and `preflightInputTokens` from the proven job payload's `preflight_input_tokens`, omitted when that member is absent; `assemblePayload` carries `assembled_content`, `token_usage`, `finish_reason` from the payload.
         * `[✅]`   Outcome: propagate the error arm unchanged.
      * `[✅]`   Branch: debitForResponse fails.
         * `[✅]`   Condition: `'error' in debitResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.debitForResponse(debitParams, debitPayload)` — `debitParams` carries `dbClient`, job row, provider row, model config, wallet, assembled response; `debitPayload` is `{}`.
         * `[✅]`   Outcome: propagate the error arm unchanged.
      * `[✅]`   Branch: prepareResponseContent returns retry-required.
         * `[✅]`   Condition: `prepareResult.retryRequired === true`.
         * `[✅]`   Decision: discriminant check on `retryRequired`.
         * `[✅]`   Dependency call: `deps.prepareResponseContent(prepareParams, preparePayload)`, then `deps.retryJob(retryParams, retryPayload)`. The orchestrator builds a `FailedAttemptError[]` from the retry reason and the provider row, and dispatches `retryJob` with the job row and `dbClient`.
         * `[✅]`   Outcome: success arm, `{ status: 'completed' }` — retry is not a failure of `saveResponse`.
      * `[✅]`   Branch: prepareResponseContent returns error.
         * `[✅]`   Condition: `'error' in prepareResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.prepareResponseContent(prepareParams, preparePayload)`.
         * `[✅]`   Outcome: propagate the error arm unchanged.
      * `[✅]`   Branch: job_type is EXECUTE, saveContributionResponse fails.
         * `[✅]`   Condition: `'error' in contributionResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.saveContributionResponse(contributionParams, contributionPayload)`.
         * `[✅]`   Outcome: propagate the error arm unchanged.
      * `[✅]`   Branch: job_type is EXECUTE, saveContributionResponse succeeds.
         * `[✅]`   Condition: success arm.
         * `[✅]`   Decision: none — fall-through.
         * `[✅]`   Dependency call: none additional.
         * `[✅]`   Outcome: success arm, forwarding the arm module's `status`.
      * `[✅]`   Branch: job_type is COMPRESS, saveCompressedResponse fails.
         * `[✅]`   Condition: `'error' in compressedResult`.
         * `[✅]`   Decision: error-arm check on the return.
         * `[✅]`   Dependency call: `deps.saveCompressedResponse(compressedParams, compressedPayload)`.
         * `[✅]`   Outcome: propagate the error arm unchanged.
      * `[✅]`   Branch: job_type is COMPRESS, saveCompressedResponse succeeds.
         * `[✅]`   Condition: success arm.
         * `[✅]`   Decision: none — fall-through.
         * `[✅]`   Dependency call: none additional.
         * `[✅]`   Outcome: success arm, forwarding the arm module's `status`.
      * `[✅]`   Side effects: DB reads via `loadJobContext`, wallet debit via `debitForResponse`, retry dispatch via `retryJob` (on retry-required path), and all side effects delegated to the arm modules.
      * `[✅]`   Ordering: strictly sequential — loadJobContext → arm selection and payload proving → assembleAiResponse → debitForResponse → prepareResponseContent → arm module dispatch. `prepareParams` is composed from the proven payload immediately before the `prepareResponseContent` call, on the arm's own branch.

   * `[✅]`   `saveResponse.mock.ts`
      * `[✅]`   The existing mock file is rewritten to match the narrowed deps surface.
      * `[✅]`   `createMockSaveResponseDeps` — builder returning a valid `SaveResponseDeps` with a mock logger, stubs for the seven bound functions each returning a success.
      * `[✅]`   `invalidateSaveResponseDeps` — invalidator that removes each dep key in turn.
      * `[✅]`   `createMockSaveResponseParams` — builder returning a valid `SaveResponseParams` with a mock `dbClient` and a `job_id`.
      * `[✅]`   `invalidateSaveResponseParams` — invalidator removing each param key in turn.
      * `[✅]`   `createMockSaveResponsePayload` — builder returning a valid `SaveResponsePayload` with `assembled_content`, `token_usage`, `finish_reason`, and `processingTimeMs`.
      * `[✅]`   `invalidateSaveResponsePayload` — invalidator removing each payload key in turn.
      * `[✅]`   `createMockSaveResponseSuccessReturn` — builder returning `{ status: 'completed' }`.
      * `[✅]`   `createMockSaveResponseErrorReturn` — builder returning `{ error: new Error('...'), retriable: false }`.
      * `[✅]`   `mockSaveResponseFn` — function mock returning the success builder's output, typed as `SaveResponseFn`.
      * `[✅]`   The existing `createMockSaveResponseParamsWithQueuedJob`, `createMockJobRow`, `createMockContributionRow`, `createMockDialecticContributionRow`, `createMockFileManager`, `createValidHeaderContext`, `testPayload`, `saveResponseTestPayload`, `saveResponseTestPayloadDocumentArtifact`, `createMockDialecticExecuteJobPayload` are retained — they are consumed by the integration-tier test suites.

   * `[✅]`   `saveResponse.guard.test.ts`
      * `[✅]`   `isSaveResponseDeps`: a valid deps object (eight keys) passes; removing each of the eight keys in turn fails; a non-object fails.
      * `[✅]`   `isSaveResponseParams`: a valid params object (two keys) passes; removing each of the two keys in turn fails; a non-object fails.
      * `[✅]`   `isSaveResponsePayload`: a valid payload object (four keys) passes; removing each of the four keys in turn fails; a non-object fails.
      * `[✅]`   `isSaveResponseRequestBody`: retained — the existing cases are unchanged.
      * `[✅]`   `isSaveResponseSuccessReturn`: updated to accept `'waiting_for_children'` in addition to the existing three statuses.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `saveResponse.guard.ts`
      * `[✅]`   `isSaveResponseDeps` — updated to check the eight new dep keys: `logger` is an object, `retryJob`/`loadJobContext`/`assembleAiResponse`/`debitForResponse`/`prepareResponseContent`/`saveContributionResponse`/`saveCompressedResponse` are functions.
      * `[✅]`   `isSaveResponseParams` — checks `dbClient` is an object and `job_id` is a string.
      * `[✅]`   `isSaveResponsePayload` — checks `assembled_content` is a string, `token_usage` is `NodeTokenUsage | null`, `finish_reason` is `string | null`, `processingTimeMs` is a number.
      * `[✅]`   `isSaveResponseSuccessReturn` — updated to accept `'waiting_for_children'` as a valid status.
      * `[✅]`   `isSaveResponseRequestBody` — unchanged.
      * `[✅]`   `isSaveResponseErrorReturn` — unchanged.

   * `[✅]`   `saveResponse.test.ts`
      * `[✅]`   The existing unit test file is rewritten to test the orchestrator's branching, not the monolith's.
      * `[✅]`   Guards on entry: deps invalid, params invalid, payload invalid — each returns error arm with `retriable: false`.
      * `[✅]`   `loadJobContext` returns error → propagated unchanged.
      * `[✅]`   `assembleAiResponse` returns error → propagated unchanged.
      * `[✅]`   `debitForResponse` returns error → propagated unchanged.
      * `[✅]`   `prepareResponseContent` returns retry-required → `retryJob` called with a `FailedAttemptError[]`, returns `{ status: 'completed' }`.
      * `[✅]`   `prepareResponseContent` returns error → propagated unchanged.
      * `[✅]`   `job_type` is `'EXECUTE'`, payload guard fails → error arm.
      * `[✅]`   `job_type` is `'EXECUTE'`, `saveContributionResponse` returns error → propagated unchanged.
      * `[✅]`   `job_type` is `'EXECUTE'`, `saveContributionResponse` returns `{ status: 'completed' }` → forwarded.
      * `[✅]`   `job_type` is `'EXECUTE'`, `saveContributionResponse` returns `{ status: 'needs_continuation' }` → forwarded.
      * `[✅]`   `job_type` is `'EXECUTE'`, `saveContributionResponse` returns `{ status: 'continuation_limit_reached' }` → forwarded.
      * `[✅]`   `job_type` is `'COMPRESS'`, payload guard fails → error arm.
      * `[✅]`   `job_type` is `'COMPRESS'`, `saveCompressedResponse` returns error → propagated unchanged.
      * `[✅]`   `job_type` is `'COMPRESS'`, `saveCompressedResponse` returns `{ status: 'completed' }` → forwarded.
      * `[✅]`   `job_type` is `'COMPRESS'`, `saveCompressedResponse` returns `{ status: 'waiting_for_children' }` → forwarded.
      * `[✅]`   `job_type` is `'COMPRESS'`, `saveCompressedResponse` returns `{ status: 'needs_continuation' }` → forwarded.
      * `[✅]`   `job_type` is unknown string → error arm, `retriable: false`.
      * `[✅]`   `retryJob` is not called when `prepareResponseContent` returns a prepared result.
      * `[✅]`   `saveContributionResponse` is not called when `job_type` is `'COMPRESS'`.
      * `[✅]`   `saveCompressedResponse` is not called when `job_type` is `'EXECUTE'`.
      * `[✅]`   `job_type` is unknown → error arm, and `assembleAiResponse`, `debitForResponse` and `prepareResponseContent` are all uncalled.
      * `[✅]`   An EXECUTE payload whose guard throws → the thrown message is the returned error's message, and no collaborator after `loadJobContext` is called.
      * `[✅]`   A COMPRESS payload whose guard throws → the thrown message is the returned error's message, and no collaborator after `loadJobContext` is called.
      * `[✅]`   A COMPRESS payload whose `content` is not parseable JSON → error arm, `retriable: false`.
      * `[✅]`   A COMPRESS payload whose parsed `content` fails `isContentToInclude` → error arm, `retriable: false`.
      * `[✅]`   EXECUTE composes `prepareParams` with `documentKey` from `document_key`, `contextForDocuments` from `context_for_documents`, no `mode`, and `sourceObject` undefined.
      * `[✅]`   COMPRESS composes `prepareParams` with `documentKey` from `documentKey`, `mode` from `mode`, `contextForDocuments` undefined, and `sourceObject` equal to the parsed `content`.
      * `[✅]`   `assembleAiResponse` receives `preflightInputTokens` equal to the payload's `preflight_input_tokens`, asserted against an independent literal.
      * `[✅]`   A payload with no `preflight_input_tokens` reaches `assembleAiResponse` with the member absent, and the orchestrator substitutes no value.
      * `[✅]`   Neither `params` nor `payload` is mutated — verified by deep-equality snapshot.
      * `[✅]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[✅]`   `saveResponse.continue.test.ts`
      * `[✅]`   Retained in full as integration tier. No case is deleted. The file is renamed conceptually to integration (the describe block label changes, the file stays).

   * `[✅]`   `saveResponse.pathContext.test.ts`
      * `[✅]`   Retained in full as integration tier. No case is deleted.

   * `[✅]`   `saveResponse.rawJsonOnly.test.ts`
      * `[✅]`   Retained in full as integration tier. No case is deleted.

   * `[ ]`   `saveResponse.notifications.test.ts`
      * `[ ]`   Retained in full as integration tier. No case is deleted.

   * `[ ]`   `saveResponse.assembleDocument.test.ts`
      * `[ ]`   Retained in full as integration tier. No case is deleted.

   * `[ ]`   `saveResponse.planValidation.test.ts`
      * `[ ]`   Retained in full as integration tier. No case is deleted.

   * `[✅]`   `construction`
      * `[✅]`   The module exports `saveResponse` as a standalone function with the full `(deps, params, payload)` signature. The composition root (`dialectic-worker/index.ts` or the deps factory) binds deps at context-creation time. No factory, no class.

   * `[✅]`   `saveResponse.ts`
      * `[✅]`   The monolith body is deleted. The two legacy helper functions (`readOptionalPreflightInputTokens`, `readOptionalContinuationCount`) are deleted. All imports that served only the deleted body are removed.
      * `[✅]`   One exported function, typed `SaveResponseFn`, implementing the interaction spec in its stated order: deps guard → params guard → payload guard → `loadJobContext` → `job_type` selection and arm payload proving → `assembleAiResponse` → `debitForResponse` → `prepareResponseContent` with the arm's composed params → retry-required check and `retryJob` dispatch → arm module dispatch → status forwarding.
      * `[✅]`   The retry path builds a `FailedAttemptError[]` carrying the provider's `id` and `api_identifier`, the error string from the retry-required reason, and `processingTimeMs` from the assembled response.
      * `[✅]`   The EXECUTE arm calls `deps.saveContributionResponse` with params built from the `loadJobContext` result and the `prepareResponseContent` result, and the proven `DialecticExecuteJobPayload`.
      * `[✅]`   The COMPRESS arm calls `deps.saveCompressedResponse` with params built from the `loadJobContext` result and the `prepareResponseContent` result, and the proven `DialecticCompressJobPayload`.
      * `[✅]`   Every collaborator call is awaited (where async). Every error returns this module's error arm. No error is logged and continued.

   * `[✅]`   `saveResponse.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module through one import point.

   * `[✅]`   `saveResponse.integration.test.ts`
      * `[✅]`   The existing integration test file plus every retained suite file (`saveResponse.continue.test.ts`, `saveResponse.pathContext.test.ts`, `saveResponse.rawJsonOnly.test.ts`, `saveResponse.notifications.test.ts`, `saveResponse.assembleDocument.test.ts`, `saveResponse.planValidation.test.ts`) constitute the integration tier. They exercise the orchestrator through the production `saveResponse` function with real arm modules and stubbed external boundaries (DB, file manager). No case is deleted. The existing `saveResponse.integration.test.ts` is updated to exercise the orchestrator's routing: an EXECUTE job_type exercises the contribution arm, a COMPRESS job_type exercises the compressed arm, and the shared front half (load → assemble → debit → prepare) is proven by every case that reaches an arm.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, and the seven sibling module interfaces (`retryJob`, `loadJobContext`, `assembleAiResponse`, `debitForResponse`, `prepareResponseContent`, `saveContributionResponse`, `saveCompressedResponse`), plus the payload guard files from `enqueueCompressJobs` and the execute payload's guard file.
      * `[✅]`   No cycle: none of the sibling modules imports from `saveResponse/`. `saveResponse` is the consumer of every module in this workstream.
      * `[✅]`   No reverse dependency: this node edits no file outside `dialectic-worker/saveResponse/`.

   * `[✅]`   `requirements`
      * `[✅]`   The return union has exactly two arms — interface test.
      * `[✅]`   `SaveResponseDeps` declares exactly eight deps — interface test.
      * `[✅]`   `SaveResponseParams` declares exactly two per-invocation fields — interface test.
      * `[✅]`   `SaveResponsePayload` declares exactly four fields — interface test.
      * `[✅]`   `SaveResponseSuccessReturn.status` discriminates four terminal states — interface test.
      * `[✅]`   Invalid deps returns error arm with `retriable: false` — unit test.
      * `[✅]`   Invalid params returns error arm with `retriable: false` — unit test.
      * `[✅]`   Invalid payload returns error arm with `retriable: false` — unit test.
      * `[✅]`   `loadJobContext` error propagated unchanged — unit test.
      * `[✅]`   `assembleAiResponse` error propagated unchanged — unit test.
      * `[✅]`   `debitForResponse` error propagated unchanged — unit test.
      * `[✅]`   Retry-required result dispatches `retryJob` and returns `{ status: 'completed' }` — unit test.
      * `[✅]`   `prepareResponseContent` error propagated unchanged — unit test.
      * `[✅]`   EXECUTE payload guard failure returns error arm — unit test.
      * `[✅]`   EXECUTE `saveContributionResponse` error propagated unchanged — unit test.
      * `[✅]`   EXECUTE success status forwarded for each of the three contribution statuses — unit test.
      * `[✅]`   COMPRESS payload guard failure returns error arm — unit test.
      * `[✅]`   COMPRESS `saveCompressedResponse` error propagated unchanged — unit test.
      * `[✅]`   COMPRESS success status forwarded for each of the three compressed statuses — unit test.
      * `[✅]`   Unknown `job_type` returns error arm with `retriable: false`, before any collaborator past `loadJobContext` runs — unit test.
      * `[✅]`   `PrepareResponseContentParams.mode` is optional and `documentKey` admits null — guard test.
      * `[✅]`   `DetermineContinuationParams.documentKey` admits null — guard test.
      * `[✅]`   Each arm composes `prepareResponseContent`'s params from its own proven payload — unit test.
      * `[✅]`   A COMPRESS payload whose `content` does not parse or does not narrow returns the error arm — unit test.
      * `[✅]`   `preflightInputTokens` reaches `assembleAiResponse` from the payload, and is absent rather than substituted when the payload lacks it — unit test.
      * `[✅]`   `retryJob` not called when `prepareResponseContent` returns prepared — unit test.
      * `[✅]`   `saveContributionResponse` not called for COMPRESS — unit test.
      * `[✅]`   `saveCompressedResponse` not called for EXECUTE — unit test.
      * `[✅]`   Neither `params` nor `payload` is mutated — unit test.
      * `[✅]`   The retained test suites prove every path the monolith took — integration tier (no case deleted).

   * `[ ]`   **Commit** `refactor(dialectic-worker) replace saveResponse monolith with thin orchestrator routing on job_type`
      * `[ ]`   `SaveResponseDeps` narrowed from twelve deps to eight bound closures.
      * `[ ]`   `SaveResponseSuccessReturn.status` gains `'waiting_for_children'`.
      * `[ ]`   `SaveResponsePayload` gains `processingTimeMs`.
      * `[ ]`   The 1284-line monolith body is replaced by a ~100-line orchestrator dispatching to `saveContributionResponse` and `saveCompressedResponse`.
      * `[ ]`   The seven existing test suite files are retained as the integration tier.

* `[ ]`   supabase/functions/netlifyResponse/netlifyResponseHandler.ts **[BE] Receive `saveResponse` as a bound closure and call it with params and payload alone; `NetlifyResponseDeps` drops the deps object it was passing through**

   * `[ ]`   `objective`
      * `[ ]`   Solve a handler that carries another function's deps so it can hand them back to it. `NetlifyResponseDeps` declares `saveResponse: SaveResponseFn` beside `saveResponseDeps: SaveResponseDeps`, and the call site reads `deps.saveResponse(deps.saveResponseDeps, srParams, srPayload)` — the handler holds a collaborator's dependency graph, invokes none of it, and exists only to pass it along. That is the prop-drilling shape a bound closure removes: the composition root binds the deps once, and every caller below invokes two arguments.
      * `[ ]`   Functional goals:
         * `[ ]`   `NetlifyResponseDeps` declares `computeJobSig`, `adminClient` and `saveResponse: BoundSaveResponseFn`, and no `saveResponseDeps`.
         * `[ ]`   The `saveResponse` call site passes `srParams` and `srPayload` only.
         * `[ ]`   `NetlifyResponseBody` carries `processingTimeMs: number` — the elapsed time of the model call, known only to the workload that made it — and the `SaveResponsePayload` this handler constructs supplies its fourth member from it. This handler is that member's only producer.
         * `[ ]`   `netlifyResponse.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   The HMAC verification, its constant-time comparison, the TTL check, the POST check, the body parse, the body guard, the job lookup and the three response mappings keep their current behavior, status codes and messages.
         * `[ ]`   `NetlifyResponseBody` keeps `job_id`, `assembled_content`, `token_usage`, `finish_reason` and `sig` exactly as they stand. The signature is computed over job-row fields, not body content, so the added member changes nothing about verification.
         * `[ ]`   `NetlifyResponseHandlerFn` keeps its `(deps, req) => Promise<Response>` shape.
         * `[ ]`   No file outside `netlifyResponse/` is edited. `saveResponse.interface.ts` already declares `BoundSaveResponseFn` and the eight-member `SaveResponseDeps`.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer request handling for the `netlifyResponse` Edge Function: prove the request is a well-formed, authentic, unexpired callback, then hand its content to the bound response saver and map the outcome onto a status code.
      * `[ ]`   The role is correct because authenticity and freshness are properties of the request, and only the function that receives the request can judge them.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not construct or assemble any deps; the composition root does that.
         * `[ ]`   Do not persist, debit, retry or render; `saveResponse` owns the whole tail behind one bound call.
         * `[ ]`   Do not edit `index.ts`; it has its own node.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/netlifyResponse` — the Edge Function that receives the stream callback, proves it, and dispatches it.
      * `[ ]`   Inside boundary:
         * `[ ]`   What makes a callback acceptable: shape, signature, freshness.
         * `[ ]`   Which status code each outcome maps to.
         * `[ ]`   `NetlifyResponseBody`, `NetlifyResponseDeps`, `NetlifyResponseHandlerFn` and their guards and mocks.
      * `[ ]`   Outside boundary:
         * `[ ]`   `SaveResponseParams`, `SaveResponsePayload`, `SaveResponseReturn` and `BoundSaveResponseFn`, owned by `dialectic-worker/saveResponse/saveResponse.interface.ts`.
         * `[ ]`   `ComputeJobSig`, owned by `_shared/utils/computeJobSig/computeJobSig.interface.ts`.
         * `[ ]`   Where the bound closure came from and what it does once called.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `dialectic-worker/saveResponse/saveResponse.interface.ts` (`BoundSaveResponseFn`, `SaveResponseParams`, `SaveResponsePayload`).
         * `[ ]`   Layer classification: worker module contract, consumed across the process boundary.
         * `[ ]`   Direction: inbound; this file already imports the two parameter types, so no new direction is opened.
         * `[ ]`   Purpose: type the bound closure and the two objects this handler constructs for it.
      * `[ ]`   Removed provider: `dialectic-worker/saveResponse/saveResponse.interface.ts` (`SaveResponseFn`, `SaveResponseDeps`), both in the interface and at the call site, with the member they typed.
      * `[ ]`   Provider: `_shared/utils/computeJobSig/computeJobSig.interface.ts` (`ComputeJobSig`).
         * `[ ]`   Layer classification: shared utility contract.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: recompute the expected signature for the claimed job.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency: nothing under `dialectic-worker/` imports from `netlifyResponse/`.
         * `[ ]`   `deps.adminClient` keeps both its uses — the job lookup and `SaveResponseParams.dbClient`.
      * `[ ]`   `context_slice`
         * `[ ]`   From `saveResponse.interface.ts`: `BoundSaveResponseFn`, `SaveResponseParams` and `SaveResponsePayload`, imported with `import type`.
         * `[ ]`   From `computeJobSig.interface.ts`: `ComputeJobSig`, imported with `import type`.

   * `[ ]`   `netlifyResponse.interface.test.ts`
      * `[ ]`   A case proves the `NetlifyResponseDeps` surface exhaustively by typed assignment: `Record<keyof NetlifyResponseDeps, true>` over `computeJobSig`, `adminClient` and `saveResponse`, asserting three — exhaustive in both directions, which is the proof `saveResponseDeps` is gone.
      * `[ ]`   A case proves `NetlifyResponseDeps.saveResponse` accepts a `BoundSaveResponseFn` value and rejects nothing else by assigning a two-parameter function typed `BoundSaveResponseFn` to it.
      * `[ ]`   A case proves the `NetlifyResponseBody` surface the same way over `job_id`, `assembled_content`, `token_usage`, `finish_reason`, `sig` and `processingTimeMs`, asserting six.
      * `[ ]`   A case proves `NetlifyResponseHandlerFn` accepts `(deps, req)` and returns `Promise<Response>`.

   * `[ ]`   `netlifyResponse.interface.ts`
      * `[ ]`   `NetlifyResponseDeps` drops `saveResponseDeps` and retypes `saveResponse` from `SaveResponseFn` to `BoundSaveResponseFn`; the `SaveResponseFn` and `SaveResponseDeps` type imports are replaced by `BoundSaveResponseFn`.
      * `[ ]`   `NetlifyResponseBody` gains `processingTimeMs: number`; its five existing members, `NetlifyResponseHandlerFn` and the `NodeTokenUsage` import are unchanged.

   * `[ ]`   `netlifyResponse.interaction.spec`
      * `[ ]`   Branch: dispatch to the bound saver.
         * `[ ]`   Condition: the body parsed, guarded, matched a job row, matched its signature and fell inside the TTL.
         * `[ ]`   Decision: none — every gate above has already returned.
         * `[ ]`   Dependency call: `deps.saveResponse(srParams, srPayload)`, two arguments, `srPayload` carrying `assembled_content`, `token_usage`, `finish_reason` and `processingTimeMs`, each read from the guarded body.
         * `[ ]`   Outcome: the awaited `SaveResponseReturn`, mapped by the branches below.
      * `[ ]`   Every other branch keeps its condition, decision, dependency call and outcome: a non-POST request returns 405; an unparseable body returns 400; a body failing `isNetlifyResponseBody` returns 400; a missing job row returns 404; a signature mismatch returns 401; an expired `created_at` returns 401; a success arm returns 200 carrying `status`; an error arm with `retriable` true returns 503 and with `retriable` false returns 500, each carrying `error.message`.
      * `[ ]`   Ordering and side effects: one job lookup, one signature computation and at most one `saveResponse` call per request; the handler writes no row and sends no notification.

   * `[ ]`   `netlifyResponse.mock.ts`
      * `[ ]`   `NetlifyResponseDepsOverrides` / `buildNetlifyResponseDeps` / `NetlifyResponseDepsCorruptions` / `invalidateNetlifyResponseDeps`, and the same quartet for `NetlifyResponseBody`. Overrides types are `Partial<T>`, corruption types are `{ [K in keyof T]?: unknown }`, invalidators return `unknown`.
      * `[ ]`   `buildNetlifyResponseDeps` defaults `saveResponse` to this file's `mockBoundSaveResponse`, `adminClient` to `createMockSupabaseClient().client` and `computeJobSig` to a `ComputeJobSig`-typed function returning a fixed signature string.
      * `[ ]`   One function mock per owned function type: `mockNetlifyResponseHandler: NetlifyResponseHandlerFn` returning a 200 `Response`, and `mockBoundSaveResponse: BoundSaveResponseFn` returning `{ status: 'completed' }`. Identical signatures, no options, no recording.
      * `[ ]`   Deleted: `createMockNetlifyResponseDeps` and `CreateMockNetlifyResponseDepsOverrides`, a configurable factory with an options bag, and the `createMockSaveResponseDeps` import that supplied its `saveResponseDeps` default. A test needing another outcome declares its own `BoundSaveResponseFn` composed from these builders.

   * `[ ]`   `netlifyResponse.guard.test.ts`
      * `[ ]`   Every block carries the collapsed header — the `Contract` line alone, no inline section markers.
      * `[ ]`   `isNetlifyResponseDeps` case checklist over `computeJobSig`, `adminClient` and `saveResponse`, each absent and each wrong-typed, fixtures from `invalidateNetlifyResponseDeps`; a case asserts a deps object carrying no `saveResponseDeps` is accepted.
      * `[ ]`   `isNetlifyResponseBody` case checklist extends to `processingTimeMs`, rejected absent, non-numeric, non-finite and negative; its five existing member cases are unchanged.

   * `[ ]`   `netlifyResponse.guard.ts`
      * `[ ]`   `isNetlifyResponseDeps` drops the `saveResponseDeps` check and keeps its `computeJobSig`, `adminClient` and `saveResponse` checks.
      * `[ ]`   `isNetlifyResponseBody` gains a `processingTimeMs` check — present, numeric, finite and not negative — beside its five existing checks, matching what `isAssembleAiResponseParams` enforces on the same value downstream.

   * `[ ]`   `netlifyResponseHandler.test.ts`
      * `[ ]`   Every case builds deps through `buildNetlifyResponseDeps`, overriding only the member it asserts on; no case constructs a `saveResponseDeps` value.
      * `[ ]`   A case proves `deps.saveResponse` receives exactly two arguments, the first matching the `SaveResponseParams` the handler assembled and the second the `SaveResponsePayload`, captured at the call site.
      * `[ ]`   Every existing case keeps its arrangement and assertions: the non-POST 405, the unparseable-body 400, the failed-guard 400, the missing-job 404, the signature-mismatch 401, the expired-TTL 401, the success 200, the retriable-error 503 and the non-retriable-error 500.

   * `[ ]`   `netlifyResponseHandler.ts`
      * `[ ]`   The `saveResponse` call becomes `deps.saveResponse(srParams, srPayload)`, and the `srPayload` literal gains `processingTimeMs: body.processingTimeMs`.
      * `[ ]`   The `SaveResponseDeps` import is deleted.
      * `[ ]`   Nothing else in the file changes: every gate, every status code, every message and both `deps.adminClient` reads are left exactly as they stand.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this module imports contracts from `dialectic-worker/saveResponse/` and `_shared/utils/computeJobSig/` and exports nothing to either.
      * `[ ]`   No cycle: nothing under `dialectic-worker/` imports from `netlifyResponse/`.

   * `[ ]`   `requirements`
      * `[ ]`   `NetlifyResponseDeps` declares exactly three members and `saveResponseDeps` is absent — interface test, exhaustive key record.
      * `[ ]`   `NetlifyResponseDeps.saveResponse` is a `BoundSaveResponseFn` — interface test, typed assignment.
      * `[ ]`   `NetlifyResponseBody` declares exactly six members — interface test, exhaustive key record.
      * `[ ]`   `saveResponse` is called with two arguments carrying the assembled params and payload — unit test, captured-argument assertions.
      * `[ ]`   The `SaveResponsePayload` reaching `saveResponse` carries `processingTimeMs` equal to the body's value, not a default — unit test, captured-argument assertion over a body built with a distinct number.
      * `[ ]`   A body whose `processingTimeMs` is absent, non-numeric, non-finite or negative returns 400 — unit test.
      * `[ ]`   `isNetlifyResponseDeps` rejects each of the three members absent and each wrong-typed, and accepts a deps object carrying no `saveResponseDeps` — guard test.
      * `[ ]`   Every owned object type has a `Partial<T>`-overrides builder and an `unknown`-returning invalidator, and no mock carries an options bag, a call-recording array or a configurable factory — guard test, whose fixtures are drawn from them.
      * `[ ]`   Every request gate returns the status code it returns now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/netlifyResponse/index.ts **[BE] Become this Edge Function's composition root: assemble the eight-member `SaveResponseDeps` and every collaborator each bound module declares, bind `saveResponse` once, and hand the handler a three-member deps object**

   * `[ ]`   `objective`
      * `[ ]`   Solve a root that assembles the wrong graph. This file builds a twelve-member `SaveResponseDeps` literal against the monolith's surface — `fileManager`, `notificationService`, `continueJob`, `retryJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `sanitizeJsonContent`, `debitTokens`, `enqueueRenderJob` and `logger` — and hands both the function and its deps to the handler to pass back. The decomposition replaced that surface with eight bound closures, and `retryJob` now resolves to the canonical module rather than the legacy file. `saveResponse` runs in this process, on the stream callback, so this file is its composition root and the sole assembler of its graph; the worker's `createJobContext` assembles nothing here, a factory inside `dialectic-worker` producing deps for a separate Edge Function being a layer violation.
      * `[ ]`   Functional goals:
         * `[ ]`   The `SaveResponseDeps` literal carries `logger`, `retryJob`, `loadJobContext`, `assembleAiResponse`, `debitForResponse`, `prepareResponseContent`, `saveContributionResponse` and `saveCompressedResponse`, every member but `logger` a bound closure.
         * `[ ]`   `retryJob` is bound from `dialectic-worker/retryJob/retryJob.ts` with `{ logger, notificationService }`; the legacy `dialectic-worker/retryJob.ts` import is deleted.
         * `[ ]`   `loadJobContext` is bound with `{}`, the empty deps object its interface declares.
         * `[ ]`   `assembleAiResponse` is bound with `{ countTokens }`, where `countTokens` is a `BoundCountTokensFn` built from the real tokenizer imports.
         * `[ ]`   `debitForResponse` is bound with `{ debitTokens }`, where `debitTokens` is a `BoundDebitTokens` built from `{ logger, tokenWalletService: adminTokenWalletService }`.
         * `[ ]`   `prepareResponseContent` is bound with `{ logger, resolveFinishReason, isIntermediateChunk, sanitizeJsonContent, determineContinuation }`.
         * `[ ]`   `saveContributionResponse` is bound with `{ fileManager, buildUploadContext, resolveContributionIdentity, persistContributionRelationships, finalizeContributionJob }`, the last three themselves bound closures.
         * `[ ]`   `saveCompressedResponse` is bound with `{ fileManager, buildUploadContext, enqueueRenderJob }`, `enqueueRenderJob` itself a bound closure.
         * `[ ]`   `boundSaveResponse: BoundSaveResponseFn` closes over that literal and is the only `saveResponse` reference the `NetlifyResponseDeps` literal carries.
         * `[ ]`   The `NetlifyResponseDeps` literal carries `computeJobSig`, `adminClient` and `saveResponse: boundSaveResponse`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `FileManagerService`, `NotificationService` and `AdminTokenWalletService` are constructed here and keep their current constructor arguments — the bound modules below require all three, so none of the three constructions is deleted, and `constructStoragePath` and `assembleChunks` stay imported for the file manager.
         * `[ ]`   The `HMAC_SECRET` env check and its throw, the `createComputeJobSig` construction, the `createSupabaseAdminClient` construction and the `serve()` call are unchanged.
         * `[ ]`   Every collaborator is imported from the module that owns it and bound exactly once; no closure is rebuilt per request.
         * `[ ]`   No file outside `netlifyResponse/` is edited. Each module this file binds already exports its implementation, its deps type and its bound function type.
      * `[ ]`   Each goal is proven by a named case in this node's integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is the infra-layer composition root for the `netlifyResponse` Edge Function: construct the services, bind every module the response tail needs, and start the server.
      * `[ ]`   The role is correct because a composition root is the one place allowed to name concrete implementations, and this process has exactly one entry point. The graph is constructed once here, at module scope, so every request reuses the same closures.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not import, call or reference `createJobContext`; the worker's factory belongs to the worker process.
         * `[ ]`   Do not verify signatures, parse requests or map responses; the handler owns all of it.
         * `[ ]`   Do not edit `netlifyResponseHandler.ts` or `netlifyResponse.interface.ts`; both land in the node ahead of this one.
         * `[ ]`   Do not pass any deps object to `deps.saveResponse`; it arrives bound.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/netlifyResponse/index.ts` — service construction, module binding and server start for this Edge Function.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which concrete implementation fills each declared dependency.
         * `[ ]`   The order and depth of binding, producers bound before the closures that close over them.
      * `[ ]`   Outside boundary:
         * `[ ]`   Every module's own behavior and every deps contract it declares.
         * `[ ]`   The worker process's graph, assembled by `createJobContext` from the worker root.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `dialectic-worker/saveResponse/saveResponse.provides.ts` (`saveResponse`, `SaveResponseDeps`, `BoundSaveResponseFn`).
         * `[ ]`   Layer classification: worker module, consumed across the process boundary through its public surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the function this root binds and the deps type it assembles.
      * `[ ]`   Provider: the seven modules whose bound closures fill that deps object, each through its own `provides` file — `retryJob/`, `loadJobContext/`, `assembleAiResponse/`, `debitForResponse/`, `prepareResponseContent/`, `saveContributionResponse/`, `saveCompressedResponse/`.
         * `[ ]`   Layer classification: worker modules, consumed across the process boundary.
         * `[ ]`   Direction: inbound; each exports an implementation and a bound function type and imports nothing from here.
         * `[ ]`   Purpose: the eight members of `SaveResponseDeps`.
      * `[ ]`   Provider: the collaborators those modules declare — `resolveContributionIdentity/`, `persistContributionRelationships/`, `finalizeContributionJob/`, `enqueueRenderJob/`, `continueJob/`, `_shared/utils/buildUploadContext/`, `_shared/utils/debitTokens.ts`, `_shared/utils/resolveFinishReason.ts`, `_shared/utils/isIntermediateChunk.ts`, `_shared/utils/determineContinuation/`, `_shared/utils/jsonSanitizer/`, `_shared/utils/shouldEnqueueRenderJob.ts`, `_shared/utils/resolveTemplateFilename/`, `_shared/utils/countTokens`.
         * `[ ]`   Layer classification: worker modules and shared utilities.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: filling the deps of the modules this root binds, at every depth the graph reaches.
      * `[ ]`   Provider: `_shared/services/file_manager.ts` (`FileManagerService`), `_shared/utils/notification.service.ts` (`NotificationService`), `_shared/services/tokenwallet/admin/adminTokenWalletService.ts` (`AdminTokenWalletService`), `_shared/auth.ts` (`createSupabaseAdminClient`), `_shared/logger.ts` (`logger`), `_shared/utils/path_constructor.ts` (`constructStoragePath`), `_shared/utils/assembleChunks/assembleChunks.ts` (`assembleChunks`).
         * `[ ]`   Layer classification: shared services and utilities.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the concrete services the bound modules require.
      * `[ ]`   Removed provider: `dialectic-worker/retryJob.ts` (`retryJob`), replaced by the canonical module. This file stops being a consumer of the legacy file.
      * `[ ]`   Confirm:
         * `[ ]`   No member of `SaveResponseDeps` is constructed twice, and no closure is constructed inside the request path.
         * `[ ]`   `createJobContext` is not imported here, and no worker-process deps object is read.
         * `[ ]`   No reverse dependency: no module this root binds imports from `netlifyResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From each bound module's `provides` file: its implementation, its deps type and its bound function type only.
         * `[ ]`   From `saveResponse.provides.ts`: `saveResponse`, `SaveResponseDeps` and `BoundSaveResponseFn` only.

   * `[ ]`   `construction`
      * `[ ]`   The module-level block is the composition root and runs once at cold start: construct `adminClient`, `logger`, `fileManager`, `notificationService` and `adminTokenWalletService`; bind the leaf closures each module declares; bind the seven modules; assemble `SaveResponseDeps`; bind `saveResponse`; assemble `NetlifyResponseDeps`; call `serve()`.
      * `[ ]`   Producers are bound before the closures that close over them, so no binding reads a `const` declared below it.
      * `[ ]`   No factory and no class: the root is a sequence of `const` declarations. Nothing is partially constructed — every deps object is complete at its declaration site.

   * `[ ]`   `index.ts`
      * `[ ]`   The twelve-member `SaveResponseDeps` literal is replaced by the eight-member literal, each member a bound closure but `logger`.
      * `[ ]`   The `boundResolveTemplateFilename`, `boundEnqueueRenderJob` and `boundDebitTokens` closures stay and are consumed by the modules that declare them rather than by the deps literal directly.
      * `[ ]`   New bound closures are added for `retryJob`, `loadJobContext`, `assembleAiResponse`, `debitForResponse`, `prepareResponseContent`, `saveContributionResponse` and `saveCompressedResponse`, plus the `resolveContributionIdentity`, `persistContributionRelationships`, `finalizeContributionJob` and `countTokens` closures those four require.
      * `[ ]`   The `retryJob` import moves from `../dialectic-worker/retryJob.ts` to the canonical module's `provides` file; the `continueJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext` and `sanitizeJsonContent` imports stay and feed the modules that declare them.
      * `[ ]`   `boundSaveResponse: BoundSaveResponseFn` is declared and the `NetlifyResponseDeps` literal becomes `{ computeJobSig, adminClient, saveResponse: boundSaveResponse }`.
      * `[ ]`   The `HMAC_SECRET` check, the `computeJobSig` construction, the `adminClient` construction, the three service constructions and the `serve()` call are left exactly as they stand.

   * `[ ]`   `netlifyResponse.integration.test.ts`
      * `[ ]`   The integrated chain is real end to end: `netlifyResponseHandler` → the bound `saveResponse` → the arm module the job row's `job_type` selects → that module's own collaborators. No function in that chain is mocked, stubbed or replaced by a builder.
      * `[ ]`   Mocked at the outer edge only: the Supabase client, the storage adapter and the queue POST.
      * `[ ]`   A case drives an EXECUTE row through the chain: the request passes every gate, `saveContributionResponse` runs, and the handler returns 200 carrying the status that arm produced.
      * `[ ]`   A case drives a COMPRESS row through the chain: `saveCompressedResponse` runs and the handler returns 200 carrying its status.
      * `[ ]`   A case proves the graph is bound once: two requests reach the same closure identities.
      * `[ ]`   A case proves an error arm maps by its flag: a retriable error returns 503 and a non-retriable error returns 500, each carrying the error's message.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this root imports implementations and contracts from `dialectic-worker/` modules and `_shared/`, and exports nothing.
      * `[ ]`   No cycle: no module this root binds imports from `netlifyResponse/`.
      * `[ ]`   The graph is directed and acyclic at every binding depth: each closure closes only over values declared above it.

   * `[ ]`   `requirements`
      * `[ ]`   `SaveResponseDeps` is assembled with exactly its eight declared members — integration test, captured-argument assertions on the deps object reaching `saveResponse`.
      * `[ ]`   Each bound module receives exactly the deps object its own interface declares — integration test, captured-argument assertions.
      * `[ ]`   `retryJob` resolves to the canonical module and the legacy `dialectic-worker/retryJob.ts` is not imported — integration test, and the import is absent from the file.
      * `[ ]`   `createJobContext` is not imported and no worker-process deps object is read — the import is absent from the file.
      * `[ ]`   `NetlifyResponseDeps` is assembled with three members and `saveResponse` is the bound closure — integration test.
      * `[ ]`   The graph is constructed once, so two requests reach the same closure identities — integration test.
      * `[ ]`   An EXECUTE row reaches `saveContributionResponse` and a COMPRESS row reaches `saveCompressedResponse`, each returning 200 — integration test.
      * `[ ]`   A retriable error returns 503 and a non-retriable error returns 500 — integration test.

   * `[ ]`   **Commit** `refactor(dialectic) netlifyResponse assembles its own graph and binds saveResponse once`
      * `[ ]`   Structural: `NetlifyResponseDeps` drops `saveResponseDeps` and retypes `saveResponse` to `BoundSaveResponseFn`; the twelve-member `SaveResponseDeps` literal becomes the eight-member decomposed one.
      * `[ ]`   Behavioral: the handler calls `saveResponse` with two arguments; the response tail runs through the decomposed modules; `retryJob` resolves to the canonical module.
      * `[ ]`   Contract: `netlifyResponse.mock.ts` replaces its configurable factory with the four standard symbols per owned object type and one function mock per owned function type.

## Compression Cutover

* `[ ]`   supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts **[BE] Forward canonical-path lookup per candidate, swapping compressed content into resource documents and history messages without mutating inputs and without a deconstructor dep**

   * `[ ]`   `objective`
      * `[ ]`   After `gatherArtifacts` returns, the gathered resource documents and conversation history reach `prepareModelJob` with their original, uncompressed content. If any of those candidates were previously compressed — a `CompressedContext` artifact persisted at the candidate's canonical `_work` path — the model call pays for content that a cheaper, smaller version already replaced. There is no overlay pass between gathering and dispatch: compression results are invisible to every subsequent resume cycle, and the same victim is re-compressed every time.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/applyCompressionOverlay/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `ApplyCompressionOverlayReturn`.
         * `[ ]`   For each resource document in the payload, the function builds the candidate's canonical `CompressedContext` path using `constructStoragePath` with `FileType.CompressedContext`, the candidate's `document_key` as both `documentKey` and source identity, the candidate's `type` mapped to a `sourceType` (`'document'` → `'contribution'`, `'feedback'` → `'feedback'`, `'project_resource'` → `'resource'`), and the `stageSlug` and `output_type` from params. It then performs one existence read via `deps.downloadFromStorage`. If the artifact exists, the document's `content` is replaced with the downloaded compressed content in a new object; if not, the document passes through unchanged. The returned `resourceDocuments` array is a new array of new objects — no input object is mutated.
         * `[ ]`   For each history message in the payload whose `id` is defined and whose `role` is `'user'` or `'assistant'`, the function builds the candidate's canonical `CompressedContext` path using `constructStoragePath` with `FileType.CompressedContext`, `sourceType: 'history'`, `sourceId` set to the message's `id`, `role` set to the message's `role`, and the `stageSlug` and `output_type` from params. It performs one existence read via `deps.downloadFromStorage`. If the artifact exists, the message's `content` is replaced with the downloaded compressed content in a new object; if not, the message passes through unchanged. Messages with no `id` or with `role` `'system'` or `'function'` pass through unconditionally. The returned `conversationHistory` array is a new array of new objects — no input object is mutated.
         * `[ ]`   The success arm carries the overlaid `resourceDocuments` and `conversationHistory`, plus an `overlaidCount` reporting how many candidates were swapped.
         * `[ ]`   Every storage download failure is a non-fatal miss — the candidate passes through with its original content. Only a failure in `constructStoragePath` (a thrown `Error` from missing required fields) returns the error arm.
         * `[ ]`   The function has no `deconstructStoragePath` dependency. Lookup is forward: each candidate carries its own identity (`document_key`, `stage_slug`, `type` for documents; `id`, `role` for messages), so the overlay builds the canonical path from the candidate's own fields and never reverse-parses a stored path.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `gatherArtifacts.ts`, `gatherArtifacts.interface.ts`, `processSimpleJob.ts` and every other file outside `dialectic-worker/applyCompressionOverlay/` are not edited. The consumer that calls this function and supplies its params is stated in the `gatherArtifacts` node, not here.
         * `[ ]`   No file outside `dialectic-worker/applyCompressionOverlay/` is edited.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer content overlay: given gathered resource documents and conversation history, check each candidate for a persisted compressed artifact and swap the content of those that have one.
      * `[ ]`   The role is correct because the function performs a pure content-replacement pass over two candidate arrays, using only forward canonical-path construction and storage reads.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not gather artifacts — `gatherArtifacts` owns that.
         * `[ ]`   Do not score, select, or enqueue compression victims — `compressPrompt` and `enqueueCompressJobs` own those.
         * `[ ]`   Do not persist artifacts — `saveCompressedResponse` and the RENDER job own that.
         * `[ ]`   Do not count tokens, check affordability, or dispatch model calls.
         * `[ ]`   Do not mutate any input object — return new arrays of new objects.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/applyCompressionOverlay` — replacing candidate content with persisted compressed artifacts via forward canonical-path lookup.
      * `[ ]`   Inside boundary:
         * `[ ]`   The per-candidate canonical-path construction, the existence read, the content swap, the overlaid-count tally, and the composition of the returned arrays.
         * `[ ]`   `ApplyCompressionOverlayDeps`, `ApplyCompressionOverlayParams`, `ApplyCompressionOverlayPayload`, `ApplyCompressionOverlaySuccessReturn`, `ApplyCompressionOverlayErrorReturn`, `ApplyCompressionOverlayReturn`, `ApplyCompressionOverlayFn`, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `ResourceDocument` and `Messages`, owned by `_shared/types.ts`.
         * `[ ]`   `FileType`, `PathContext`, owned by `_shared/types/file_manager.types.ts`.
         * `[ ]`   `ConstructedPath` and `constructStoragePath`, owned by `_shared/utils/path_constructor.ts`.
         * `[ ]`   `DownloadFromStorageFn`, owned by `_shared/supabase_storage_utils.ts`.
         * `[ ]`   `ILogger`, owned by `_shared/types.ts`.
         * `[ ]`   `SupabaseClient<Database>`, owned by `npm:@supabase/supabase-js` and `types_db.ts`.
         * `[ ]`   Who calls this function, who supplies `stageSlug` and `output_type`, and what happens after the overlaid arrays reach the dispatcher.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/supabase_storage_utils.ts` (`downloadFromStorage` via `DownloadFromStorageFn`).
         * `[ ]`   Layer classification: shared storage utility.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: existence read for the `CompressedContext` artifact at the canonical path. A `null` data result or an error result is a miss, not a failure.
      * `[ ]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: log each overlay hit and miss for observability.
      * `[ ]`   Provider: `_shared/utils/path_constructor.ts` (`constructStoragePath`).
         * `[ ]`   Layer classification: shared utility, pure function.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: build the canonical `CompressedContext` path for each candidate. Called, not injected — it is a pure function, not a dependency.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`FileType`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: `FileType.CompressedContext` is the `fileType` argument to `constructStoragePath`.
      * `[ ]`   Provider: `_shared/types.ts` (`ResourceDocument`, `Messages`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the two candidate array element types the function iterates.
      * `[ ]`   Provider: `types_db.ts` (`Database`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the `SupabaseClient` passed to `downloadFromStorage`.
      * `[ ]`   Provider: `_shared/supabase_storage_utils.mock.ts` (`createMockDownloadFromStorage`); `_shared/logger.mock.ts` (`MockLogger`).
         * `[ ]`   Layer classification: shared test fixture surfaces.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: configure the storage download per outcome and provide the logger mock.
      * `[ ]`   Confirm: no reverse dependencies, no lateral layer violations. All deps are inward from `_shared` or generated types.

   * `[ ]`   `context_slice`
      * `[ ]`   `ApplyCompressionOverlayDeps`: `{ logger: ILogger; downloadFromStorage: DownloadFromStorageFn }`.
      * `[ ]`   `constructStoragePath` is called directly (pure function import), not injected.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.interface.test.ts`
      * `[ ]`   Prove the contract for this work: type membership for all owned types, return-union arms, the surface of each parameter object.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.interface.ts`
      * `[ ]`   Declare the function signature: `ApplyCompressionOverlayFn(deps: ApplyCompressionOverlayDeps, params: ApplyCompressionOverlayParams, payload: ApplyCompressionOverlayPayload): Promise<ApplyCompressionOverlayReturn>`.
      * `[ ]`   `ApplyCompressionOverlayDeps`: `{ logger: ILogger; downloadFromStorage: DownloadFromStorageFn }`.
      * `[ ]`   `ApplyCompressionOverlayParams`: `{ dbClient: SupabaseClient<Database>; projectId: string; sessionId: string; iterationNumber: number; stageSlug: string; output_type: string }` — the six values `constructStoragePath` requires for the `CompressedContext` case plus the `dbClient` for the storage read.
      * `[ ]`   `ApplyCompressionOverlayPayload`: `{ resourceDocuments: ResourceDocument[]; conversationHistory: Messages[] }` — the two candidate arrays whose content may be swapped.
      * `[ ]`   `ApplyCompressionOverlaySuccessReturn`: `{ resourceDocuments: ResourceDocument[]; conversationHistory: Messages[]; overlaidCount: number }`.
      * `[ ]`   `ApplyCompressionOverlayErrorReturn`: `{ error: Error; retriable: boolean }`.
      * `[ ]`   `ApplyCompressionOverlayReturn`: `ApplyCompressionOverlaySuccessReturn | ApplyCompressionOverlayErrorReturn`.
      * `[ ]`   `BoundApplyCompressionOverlayFn`: `(params: ApplyCompressionOverlayParams, payload: ApplyCompressionOverlayPayload) => Promise<ApplyCompressionOverlayReturn>` — the bound form the consumer receives.

   * `[ ]`   `applyCompressionOverlay.interaction.spec`
      * `[ ]`   Branch: empty inputs — both `resourceDocuments` and `conversationHistory` are empty arrays.
         * `[ ]`   Condition: `resourceDocuments.length === 0 && conversationHistory.length === 0`.
         * `[ ]`   Decision: none.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `ApplyCompressionOverlaySuccessReturn` with empty arrays and `overlaidCount: 0`.
      * `[ ]`   Branch: resource document with existing compressed artifact.
         * `[ ]`   Condition: `constructStoragePath` returns a valid path and `deps.downloadFromStorage` returns `{ data: <ArrayBuffer>, error: null }`.
         * `[ ]`   Decision: `data !== null && error === null`.
         * `[ ]`   Dependency call: `deps.downloadFromStorage(params.dbClient, 'dialectic-contributions', <canonicalPath>)`.
         * `[ ]`   Outcome: the document appears in the returned `resourceDocuments` with its `content` replaced by the decoded download; `overlaidCount` increments by 1.
      * `[ ]`   Branch: resource document with no compressed artifact (download miss).
         * `[ ]`   Condition: `deps.downloadFromStorage` returns `{ data: null, error: ... }` or `{ data: null, error: null }`.
         * `[ ]`   Decision: `data === null`.
         * `[ ]`   Dependency call: `deps.downloadFromStorage(params.dbClient, 'dialectic-contributions', <canonicalPath>)`.
         * `[ ]`   Outcome: the document passes through with its original `content` unchanged; `overlaidCount` does not increment.
      * `[ ]`   Branch: resource document whose `type` does not map to a known `sourceType` (`'seed_prompt'`, `'header_context'`, or any future value not in the `'document'`/`'feedback'`/`'project_resource'` set).
         * `[ ]`   Condition: `type` is not `'document'`, `'feedback'`, or `'project_resource'`.
         * `[ ]`   Decision: skip — no `constructStoragePath` call.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: the document passes through unchanged; `overlaidCount` does not increment.
      * `[ ]`   Branch: history message with existing compressed artifact.
         * `[ ]`   Condition: message has a defined `id`, `role` is `'user'` or `'assistant'`, and `deps.downloadFromStorage` returns `{ data: <ArrayBuffer>, error: null }`.
         * `[ ]`   Decision: `data !== null && error === null`.
         * `[ ]`   Dependency call: `deps.downloadFromStorage(params.dbClient, 'dialectic-contributions', <canonicalPath>)`.
         * `[ ]`   Outcome: the message appears in the returned `conversationHistory` with its `content` replaced by the decoded download; `overlaidCount` increments by 1.
      * `[ ]`   Branch: history message with no compressed artifact (download miss).
         * `[ ]`   Condition: message has a defined `id`, `role` is `'user'` or `'assistant'`, and `deps.downloadFromStorage` returns `{ data: null, ... }`.
         * `[ ]`   Decision: `data === null`.
         * `[ ]`   Dependency call: `deps.downloadFromStorage(params.dbClient, 'dialectic-contributions', <canonicalPath>)`.
         * `[ ]`   Outcome: the message passes through with its original `content` unchanged; `overlaidCount` does not increment.
      * `[ ]`   Branch: history message that is ineligible for overlay.
         * `[ ]`   Condition: message has no `id`, or `role` is `'system'` or `'function'`.
         * `[ ]`   Decision: skip — no `constructStoragePath` call.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: the message passes through unchanged; `overlaidCount` does not increment.
      * `[ ]`   Branch: `constructStoragePath` throws.
         * `[ ]`   Condition: `constructStoragePath` raises an `Error` from missing required fields.
         * `[ ]`   Decision: catch.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `ApplyCompressionOverlayErrorReturn` with the thrown error and `retriable: false`.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.mock.ts`
      * `[ ]`   Provide the builders, invalidators, and function mock this interface owns: `buildApplyCompressionOverlayDeps`, `ApplyCompressionOverlayDepsOverrides`, `buildApplyCompressionOverlayParams`, `ApplyCompressionOverlayParamsOverrides`, `buildApplyCompressionOverlayPayload`, `ApplyCompressionOverlayPayloadOverrides`, `invalidateApplyCompressionOverlayPayload`, `ApplyCompressionOverlayPayloadCorruptions`, `buildApplyCompressionOverlaySuccessReturn`, `ApplyCompressionOverlaySuccessReturnOverrides`, `invalidateApplyCompressionOverlaySuccessReturn`, `ApplyCompressionOverlaySuccessReturnCorruptions`, `buildApplyCompressionOverlayErrorReturn`, `ApplyCompressionOverlayErrorReturnOverrides`, `invalidateApplyCompressionOverlayErrorReturn`, `ApplyCompressionOverlayErrorReturnCorruptions`, `mockApplyCompressionOverlay`.
      * `[ ]`   `buildApplyCompressionOverlayDeps` composes `MockLogger` for `logger` and `createMockDownloadFromStorage({ mode: 'success', data: <encoded 'compressed-content'> })` for `downloadFromStorage`.
      * `[ ]`   `buildApplyCompressionOverlayParams` requires `dbClient` as a positional argument (same pattern as `buildGatherArtifactsParams`), with defaults for `projectId`, `sessionId`, `iterationNumber`, `stageSlug`, and `output_type`.
      * `[ ]`   `buildApplyCompressionOverlayPayload` defaults `resourceDocuments` to an empty array and `conversationHistory` to an empty array.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.guard.test.ts`
      * `[ ]`   Prove each owned guard per the case checklist: `isApplyCompressionOverlaySuccessReturn`, `isApplyCompressionOverlayErrorReturn`.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.guard.ts`
      * `[ ]`   Implement `isApplyCompressionOverlaySuccessReturn` and `isApplyCompressionOverlayErrorReturn`. `isApplyCompressionOverlaySuccessReturn` checks for `resourceDocuments` (array), `conversationHistory` (array), and `overlaidCount` (number). `isApplyCompressionOverlayErrorReturn` checks for `error` (instance of `Error`) and `retriable` (boolean).

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.test.ts`
      * `[ ]`   Validate transformations and branching against the interaction spec:
         * `[ ]`   Empty inputs returns empty arrays and `overlaidCount: 0`.
         * `[ ]`   A document with a matching artifact gets its content replaced; `overlaidCount` is 1.
         * `[ ]`   A document with no artifact passes through with original content; `overlaidCount` is 0.
         * `[ ]`   A document with unmapped `type` (e.g. `'seed_prompt'`) passes through; `overlaidCount` is 0.
         * `[ ]`   A history message with a matching artifact gets its content replaced; `overlaidCount` is 1.
         * `[ ]`   A history message with no artifact passes through unchanged; `overlaidCount` is 0.
         * `[ ]`   A history message with no `id` passes through unconditionally.
         * `[ ]`   A history message with `role: 'system'` passes through unconditionally.
         * `[ ]`   A mixed payload with some hits and some misses returns the correct `overlaidCount` and only the hit documents/messages have swapped content.
         * `[ ]`   No input object is mutated — assert the original arrays and objects are unchanged after the call.
         * `[ ]`   `constructStoragePath` throwing returns the error arm with `retriable: false`.

   * `[ ]`   `construction`
      * `[ ]`   `applyCompressionOverlay` is a stateless exported async function — no constructor, no class, no factory. `constructStoragePath` is a direct import (pure function), not injected. `downloadFromStorage` is injected via `deps`.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.ts`
      * `[ ]`   Implement the behavior from the interaction spec:
         * `[ ]`   Iterate `payload.resourceDocuments`. For each: map `type` to `sourceType` (`'document'` → `'contribution'`, `'feedback'` → `'feedback'`, `'project_resource'` → `'resource'`); if unmapped, pass through unchanged. Build the canonical path via `constructStoragePath({ projectId: params.projectId, fileType: FileType.CompressedContext, sessionId: params.sessionId, iteration: params.iterationNumber, stageSlug: params.stageSlug, output_type: params.output_type, sourceType, documentKey: doc.document_key })`. Call `deps.downloadFromStorage(params.dbClient, 'dialectic-contributions', `${path.storagePath}/${path.fileName}`)`. If data is non-null and no error, decode and create a new `ResourceDocument` with the compressed content; otherwise pass through.
         * `[ ]`   Iterate `payload.conversationHistory`. For each: if no `id` or `role` is `'system'` or `'function'`, pass through. Build the canonical path via `constructStoragePath({ projectId: params.projectId, fileType: FileType.CompressedContext, sessionId: params.sessionId, iteration: params.iterationNumber, stageSlug: params.stageSlug, output_type: params.output_type, sourceType: 'history', sourceId: message.id, role: message.role })`. Call `deps.downloadFromStorage`. If data is non-null and no error, decode and create a new `Messages` with the compressed content; otherwise pass through.
         * `[ ]`   Wrap the entire loop in a try/catch for `constructStoragePath` throws. On catch, return `ApplyCompressionOverlayErrorReturn` with the thrown error and `retriable: false`.
         * `[ ]`   Return `ApplyCompressionOverlaySuccessReturn` with the overlaid arrays and the count.
      * `[ ]`   Introduce no undeclared dependencies; bypass no guards or contracts.

   * `[ ]`   applyCompressionOverlay/`applyCompressionOverlay.provides.ts`
      * `[ ]`   Export the public surface:
         * `[ ]`   `export * from "./applyCompressionOverlay.ts";`
         * `[ ]`   `export * from "./applyCompressionOverlay.interface.ts";`
         * `[ ]`   `export * from "./applyCompressionOverlay.guard.ts";`
         * `[ ]`   `export * from "./applyCompressionOverlay.mock.ts";`

   * `[ ]`   `directionality`
      * `[ ]`   Layer: worker-internal module (`dialectic-worker/applyCompressionOverlay`). Deps are inward (`ILogger`, `DownloadFromStorageFn` from `_shared`; `constructStoragePath` from `_shared/utils`; `FileType` from `_shared/types`; `ResourceDocument`, `Messages` from `_shared/types.ts`; `Database` from generated types). Provides outward to `gatherArtifacts` (the consumer that injects it post-gather).
      * `[ ]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[ ]`   `requirements`
      * `[ ]`   Given an empty `resourceDocuments` and empty `conversationHistory`, returns success with empty arrays and `overlaidCount: 0`.
      * `[ ]`   Given a resource document whose canonical `CompressedContext` artifact exists in storage, returns that document with its content replaced by the artifact's content.
      * `[ ]`   Given a resource document whose canonical artifact does not exist, returns that document with its original content.
      * `[ ]`   Given a resource document with a `type` that has no `sourceType` mapping, returns that document unchanged.
      * `[ ]`   Given a history message whose canonical `CompressedContext` artifact exists, returns that message with its content replaced.
      * `[ ]`   Given a history message whose artifact does not exist, returns that message unchanged.
      * `[ ]`   Given a history message with no `id` or with `role: 'system'`/`'function'`, returns it unchanged without attempting a lookup.
      * `[ ]`   No input object is mutated on any path.
      * `[ ]`   `constructStoragePath` throwing returns `ApplyCompressionOverlayErrorReturn` with `retriable: false`.

* `[ ]`   supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts **[BE] Inject `applyCompressionOverlay` post-gather with the `stageSlug` and `output_type` its lookup requires, and tighten `ResourceDocument.type` to `'resource' | 'feedback' | 'system'` across all five push sites**

   * `[ ]`   `objective`
      * `[ ]`   `gatherArtifacts` pushes a free-form `type: string` into every `ResourceDocument` it produces — each of the five rule-type branches writes a different string literal (`"document"`, `"feedback"`, `"seed_prompt"`, `"project_resource"`, or the passthrough `rType` for `header_context`/`contribution`/fallback). Downstream consumers (`vector_utils`, `applyCompressionOverlay`) must match on these values, but no union constrains them and a typo compiles silently. Separately, after dedup the gathered artifacts are returned directly without passing through the compression overlay, so every resume cycle pays full token cost for candidates that already have a persisted `CompressedContext` artifact.
      * `[ ]`   Functional goals:
         * `[ ]`   Declare `ResourceDocumentType = 'resource' | 'feedback' | 'system'` in `_shared/types.ts` and tighten `ResourceDocument.type` from `string` to `ResourceDocumentType`.
         * `[ ]`   Update each of the five push sites in `gatherArtifacts.ts` to emit the tightened literal: `"document"` → `"resource"`, `"feedback"` → `"feedback"` (unchanged), `"seed_prompt"` → `"system"`, `"project_resource"` → `"resource"`, `header_context`/`contribution`/fallback → `"resource"`.
         * `[ ]`   Add `applyCompressionOverlay: BoundApplyCompressionOverlayFn` to `GatherArtifactsDeps`.
         * `[ ]`   Add `stageSlug: string` and `output_type: string` to `GatherArtifactsParams`.
         * `[ ]`   After the dedup loop and before the success return, call `deps.applyCompressionOverlay(params, { resourceDocuments: deduped })` and, on success, return its overlaid `resourceDocuments` as the artifacts array; on error, return the error arm.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No file outside `gatherArtifacts/` and `_shared/types.ts` is edited. The caller that supplies `stageSlug`, `output_type`, and the bound overlay is `processSimpleJob`, addressed in its own node.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer artifact gatherer: query DB rows per input rule, download content from storage, assign a tightened `ResourceDocumentType` literal per rule type, dedup, apply the compression overlay, and return the unified array.
      * `[ ]`   The role is correct because the function already performs all gathering and dedup; this node adds the type tightening (a data-normalization concern belonging to the producer) and the overlay call (a content-replacement pass delegated to an injected collaborator).
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not implement the overlay — `applyCompressionOverlay` owns that.
         * `[ ]`   Do not wire the new deps/params into the caller — `processSimpleJob` owns that.
         * `[ ]`   Do not score, select, or enqueue compression victims.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/gatherArtifacts` — gathering input-rule artifacts, normalizing their type to `ResourceDocumentType`, deduplicating, and delegating overlay application.
      * `[ ]`   Inside boundary:
         * `[ ]`   The five rule-type branches and their type literals, the dedup pass, the overlay invocation post-dedup, and composition of the returned success or error arm.
         * `[ ]`   `GatherArtifactsDeps`, `GatherArtifactsParams`, `GatherArtifactsPayload`, `GatherArtifactsSuccessReturn`, `GatherArtifactsErrorReturn`, `GatherArtifactsReturn`, `GatherArtifactsFn`, `BoundGatherArtifactsFn`.
      * `[ ]`   Outside boundary:
         * `[ ]`   `ResourceDocumentType` and `ResourceDocument`, owned by `_shared/types.ts`.
         * `[ ]`   `BoundApplyCompressionOverlayFn`, `ApplyCompressionOverlayParams`, `ApplyCompressionOverlayPayload`, `ApplyCompressionOverlayReturn`, owned by `applyCompressionOverlay/applyCompressionOverlay.interface.ts`.
         * `[ ]`   `ILogger`, `DownloadFromStorageFn`, `PickLatestFn`, `SupabaseClient<Database>`, `InputRule` — all owned by their respective `_shared` or `dialectic-service` modules.
         * `[ ]`   Who calls this function, who supplies `stageSlug`/`output_type`/`applyCompressionOverlay`, and what happens after the overlaid artifacts reach the dispatcher.

   * `[ ]`   `deps`
      * `[ ]`   Surviving providers (unchanged):
         * `[ ]`   `_shared/types.ts` → `ILogger` (via `deps.logger`): logging.
         * `[ ]`   `createJobContext/JobContext.interface.ts` → `PickLatestFn` (via `deps.pickLatest`): row selection.
         * `[ ]`   `_shared/supabase_storage_utils.ts` → `DownloadFromStorageFn` (via `deps.downloadFromStorage`): content download.
      * `[ ]`   New provider:
         * `[ ]`   `applyCompressionOverlay/applyCompressionOverlay.interface.ts` → `BoundApplyCompressionOverlayFn` (via `deps.applyCompressionOverlay`).
            * `[ ]`   Layer classification: sibling worker module.
            * `[ ]`   Direction: inbound from peer module within `dialectic-worker`.
            * `[ ]`   Purpose: overlay compressed content onto gathered artifacts post-dedup. Called with `(params, { resourceDocuments: deduped })`.
      * `[ ]`   Confirm: no reverse dependencies, no lateral layer violations. `applyCompressionOverlay` is a peer within `dialectic-worker`; all other deps are inward from `_shared` or generated types.

   * `[ ]`   `context_slice`
      * `[ ]`   `GatherArtifactsDeps` adds `applyCompressionOverlay: BoundApplyCompressionOverlayFn` alongside the existing `logger`, `pickLatest`, `downloadFromStorage`.
      * `[ ]`   `GatherArtifactsParams` adds `stageSlug: string` and `output_type: string` alongside the existing `dbClient`, `projectId`, `sessionId`, `iterationNumber`.

   * `[ ]`   _shared/`types.ts`
      * `[ ]`   Declare `export type ResourceDocumentType = 'resource' | 'feedback' | 'system';` immediately above `ResourceDocument`.
      * `[ ]`   Tighten `ResourceDocument.type` from `string` to `ResourceDocumentType`.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.interface.test.ts`
      * `[ ]`   Add key-record proof for `GatherArtifactsDeps`: typed assignment `const _depsKeys: Record<keyof GatherArtifactsDeps, true> = { logger: true, pickLatest: true, downloadFromStorage: true, applyCompressionOverlay: true };`.
      * `[ ]`   Add key-record proof for `GatherArtifactsParams`: typed assignment `const _paramsKeys: Record<keyof GatherArtifactsParams, true> = { dbClient: true, projectId: true, sessionId: true, iterationNumber: true, stageSlug: true, output_type: true };`.
      * `[ ]`   Add `ResourceDocumentType` membership proof: typed assignment `const _resource: ResourceDocumentType = 'resource'; const _feedback: ResourceDocumentType = 'feedback'; const _system: ResourceDocumentType = 'system';`.
      * `[ ]`   Replace every `createGatherArtifactsMock` call with `mockGatherArtifacts` — the mock function is called directly with `(deps, params, payload)` and its return is configured by the test's `buildGatherArtifactsSuccessReturn` or `buildGatherArtifactsErrorReturn`, not by an options bag. Remove `createGatherArtifactsMock` and `GatherArtifactsMockCall` from imports.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.interface.ts`
      * `[ ]`   Add import: `import type { BoundApplyCompressionOverlayFn } from "../applyCompressionOverlay/applyCompressionOverlay.interface.ts";`.
      * `[ ]`   Add import: `import type { ResourceDocumentType } from "../../_shared/types.ts";`.
      * `[ ]`   `GatherArtifactsDeps`: add `applyCompressionOverlay: BoundApplyCompressionOverlayFn;`.
      * `[ ]`   `GatherArtifactsParams`: add `stageSlug: string;` and `output_type: string;`.
      * `[ ]`   `GatherArtifactsSuccessReturn.artifacts`: tighten element type — each artifact's `type` is now `ResourceDocumentType` via the tightened `ResourceDocument`.

   * `[ ]`   `gatherArtifacts.interaction.spec`
      * `[ ]`   Branch: document rule produces `type: 'resource'`.
         * `[ ]`   Condition: `rType === 'document'`.
         * `[ ]`   Decision: the existing document-rule branch executes.
         * `[ ]`   Dependency call: DB query on `dialectic_project_resources`, then `deps.downloadFromStorage`.
         * `[ ]`   Outcome: gathered artifact is pushed with `type: 'resource'` (was `'document'`).
      * `[ ]`   Branch: feedback rule produces `type: 'feedback'`.
         * `[ ]`   Condition: `rType === 'feedback'`.
         * `[ ]`   Decision: the existing feedback-rule branch executes.
         * `[ ]`   Dependency call: DB query on `dialectic_feedback`, then `deps.downloadFromStorage`.
         * `[ ]`   Outcome: gathered artifact is pushed with `type: 'feedback'` (unchanged).
      * `[ ]`   Branch: seed_prompt rule produces `type: 'system'`.
         * `[ ]`   Condition: `rType === 'seed_prompt'`.
         * `[ ]`   Decision: the existing seed_prompt-rule branch executes.
         * `[ ]`   Dependency call: DB query on `dialectic_project_resources`, then `deps.downloadFromStorage`.
         * `[ ]`   Outcome: gathered artifact is pushed with `type: 'system'` (was `'seed_prompt'`).
      * `[ ]`   Branch: project_resource rule produces `type: 'resource'`.
         * `[ ]`   Condition: `rType === 'project_resource'`.
         * `[ ]`   Decision: the existing project_resource-rule branch executes.
         * `[ ]`   Dependency call: DB query on `dialectic_project_resources`, then `deps.downloadFromStorage`.
         * `[ ]`   Outcome: gathered artifact is pushed with `type: 'resource'` (was `'project_resource'`).
      * `[ ]`   Branch: header_context / contribution / fallback rule produces `type: 'resource'`.
         * `[ ]`   Condition: `rType === 'header_context'` or (`rType` is not `'document'`, `'feedback'`, or `'seed_prompt'`).
         * `[ ]`   Decision: the existing header_context/contribution/fallback branch executes.
         * `[ ]`   Dependency call: DB query on `dialectic_contributions`, then `deps.downloadFromStorage`.
         * `[ ]`   Outcome: gathered artifact is pushed with `type: 'resource'` (was `rType` passthrough).
      * `[ ]`   Branch: post-dedup overlay — overlay returns success.
         * `[ ]`   Condition: dedup loop completes and `deps.applyCompressionOverlay` returns a success arm.
         * `[ ]`   Decision: `isApplyCompressionOverlaySuccessReturn(overlayResult)`.
         * `[ ]`   Dependency call: `deps.applyCompressionOverlay({ dbClient: params.dbClient, projectId: params.projectId, sessionId: params.sessionId, iterationNumber: params.iterationNumber, stageSlug: params.stageSlug, output_type: params.output_type }, { resourceDocuments: deduped })`.
         * `[ ]`   Outcome: `GatherArtifactsSuccessReturn` with `artifacts` set to `overlayResult.resourceDocuments`.
      * `[ ]`   Branch: post-dedup overlay — overlay returns error.
         * `[ ]`   Condition: `deps.applyCompressionOverlay` returns an error arm.
         * `[ ]`   Decision: `!isApplyCompressionOverlaySuccessReturn(overlayResult)`.
         * `[ ]`   Dependency call: same as success branch.
         * `[ ]`   Outcome: `GatherArtifactsErrorReturn` with `error: overlayResult.error` and `retriable: overlayResult.retriable`.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.mock.ts`
      * `[ ]`   Replace `createGatherArtifactsMock` (options bag + calls recorder) with `mockGatherArtifacts: GatherArtifactsFn` — a production-typed function that returns `buildGatherArtifactsSuccessReturn()`. Remove `CreateGatherArtifactsMockOptions`, `GatherArtifactsMockCall`.
      * `[ ]`   `buildGatherArtifactsDeps`: add `applyCompressionOverlay` default that returns `buildApplyCompressionOverlaySuccessReturn()`. Import `BoundApplyCompressionOverlayFn` and `buildApplyCompressionOverlaySuccessReturn` from the overlay module's provides.
      * `[ ]`   `buildGatherArtifactsParams`: change signature from `(dbClient, overrides?)` to `(overrides?: Partial<GatherArtifactsParams>)` with `dbClient` defaulting to `createMockSupabaseClient().client`. Add `stageSlug: 'thesis'` and `output_type: 'business_case'` defaults.
      * `[ ]`   `buildGatherArtifact`: change default `type` from `'document'` to `'resource'` to match the tightened literal.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.guard.test.ts`
      * `[ ]`   `isGatherArtifactsDeps` — add case: missing `applyCompressionOverlay` rejects.
      * `[ ]`   `isGatherArtifactsDeps` — add case: `applyCompressionOverlay: 'not-a-function'` rejects.
      * `[ ]`   `isGatherArtifactsParams` — add case: missing `stageSlug` rejects.
      * `[ ]`   `isGatherArtifactsParams` — add case: `stageSlug: ''` (empty string) rejects.
      * `[ ]`   `isGatherArtifactsParams` — add case: missing `output_type` rejects.
      * `[ ]`   `isGatherArtifactsParams` — add case: `output_type: ''` (empty string) rejects.
      * `[ ]`   Update `buildGatherArtifactsParams` calls: change from `buildGatherArtifactsParams(dbClient)` to `buildGatherArtifactsParams()` (overrides-only form).

   * `[ ]`   gatherArtifacts/`gatherArtifacts.guard.ts`
      * `[ ]`   `isGatherArtifactsDeps`: add check — `'applyCompressionOverlay' in value && typeof value.applyCompressionOverlay === 'function'`.
      * `[ ]`   `isGatherArtifactsParams`: add checks — `'stageSlug' in value && typeof value.stageSlug === 'string' && value.stageSlug !== ''` and `'output_type' in value && typeof value.output_type === 'string' && value.output_type !== ''`.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.test.ts`
      * `[ ]`   Update all five rule-type assertion blocks: `type: 'document'` → `'resource'`, `type: 'feedback'` → `'feedback'` (unchanged), `type: 'seed_prompt'` → `'system'`, `type: 'project_resource'` → `'resource'`, `type: rType` passthrough assertions → `'resource'`.
      * `[ ]`   Update `buildGatherArtifactsParams` calls: change from `buildGatherArtifactsParams(dbClient)` to `buildGatherArtifactsParams({ dbClient })`.
      * `[ ]`   Add overlay test cases:
         * `[ ]`   Overlay returns success — `gatherArtifacts` returns `GatherArtifactsSuccessReturn` with the overlay's `resourceDocuments` as `artifacts`.
         * `[ ]`   Overlay returns error — `gatherArtifacts` returns `GatherArtifactsErrorReturn` with the overlay's `error` and `retriable`.
         * `[ ]`   Overlay is called with the correct params shape: `{ dbClient, projectId, sessionId, iterationNumber, stageSlug, output_type }` and `{ resourceDocuments: <deduped> }`.
      * `[ ]`   Replace any remaining `createGatherArtifactsMock` usage with direct mock construction via `mockGatherArtifacts` or spy patterns.

   * `[ ]`   `construction`
      * `[ ]`   `gatherArtifacts` remains a stateless exported async function. `applyCompressionOverlay` is injected via `deps` as a `BoundApplyCompressionOverlayFn` — the caller binds it before passing. No constructor, no class, no factory.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.ts`
      * `[ ]`   Add import: `import { isApplyCompressionOverlaySuccessReturn } from "../applyCompressionOverlay/applyCompressionOverlay.guard.ts";`.
      * `[ ]`   Line 139: change `type: "document"` to `type: "resource"`.
      * `[ ]`   Line 236: `type: "feedback"` — no change.
      * `[ ]`   Line 295: change `type: "seed_prompt"` to `type: "system"`.
      * `[ ]`   Line 355: change `type: "project_resource"` to `type: "resource"`.
      * `[ ]`   Line 449: change `type: rType` to `type: "resource" as const`.
      * `[ ]`   After the dedup loop (after line 469), insert overlay call:
         * `[ ]`   `const overlayResult = await deps.applyCompressionOverlay({ dbClient: params.dbClient, projectId: params.projectId, sessionId: params.sessionId, iterationNumber: params.iterationNumber, stageSlug: params.stageSlug, output_type: params.output_type }, { resourceDocuments: Array.from(uniqueById.values()) });`
         * `[ ]`   `if (!isApplyCompressionOverlaySuccessReturn(overlayResult)) { return { error: overlayResult.error, retriable: overlayResult.retriable }; }`
         * `[ ]`   Change the success return to use `overlayResult.resourceDocuments` as the artifacts array.
      * `[ ]`   Introduce no undeclared dependencies; bypass no guards or contracts.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.provides.ts`
      * `[ ]`   No change — re-exports all module files and the new deps/params types flow through the existing `export type * from "./gatherArtifacts.interface.ts"`.

   * `[ ]`   gatherArtifacts/`gatherArtifacts.integration.test.ts`
      * `[ ]`   Update all type assertions: `type: 'document'` → `'resource'`, `type: 'seed_prompt'` → `'system'`, `type: 'project_resource'` → `'resource'`, `type: 'header_context'` → `'resource'`, `type: 'contribution'` → `'resource'`. `type: 'feedback'` unchanged.
      * `[ ]`   Update `buildGatherArtifactsParams` calls: change from `buildGatherArtifactsParams(dbClient)` to `buildGatherArtifactsParams({ dbClient })`.
      * `[ ]`   Add `applyCompressionOverlay` to `deps` in each test — a pass-through overlay that returns its input unchanged: `applyCompressionOverlay: async (_params, payload) => ({ resourceDocuments: payload.resourceDocuments, conversationHistory: [], overlaidCount: 0 })`.
      * `[ ]`   Add integration case: overlay replaces content — supply an `applyCompressionOverlay` that swaps content for a known string, assert the returned artifacts carry the swapped content.

   * `[ ]`   `directionality`
      * `[ ]`   Layer: worker-internal module (`dialectic-worker/gatherArtifacts`). Deps are inward (`ILogger`, `PickLatestFn`, `DownloadFromStorageFn` from `_shared`; `InputRule` from `dialectic-service`; `SupabaseClient<Database>` from generated types) plus one lateral peer (`BoundApplyCompressionOverlayFn` from `applyCompressionOverlay`). Provides outward to `processSimpleJob` (the consumer that calls `gatherArtifacts` with the new params).
      * `[ ]`   `_shared/types.ts` gains `ResourceDocumentType` — an addition to a shared type surface, consumed inward by `gatherArtifacts` and every module that reads `ResourceDocument.type`.
      * `[ ]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[ ]`   `requirements`
      * `[ ]`   `ResourceDocumentType` is declared in `_shared/types.ts` as `'resource' | 'feedback' | 'system'` and `ResourceDocument.type` uses it.
      * `[ ]`   A document-rule artifact has `type: 'resource'`.
      * `[ ]`   A feedback-rule artifact has `type: 'feedback'`.
      * `[ ]`   A seed_prompt-rule artifact has `type: 'system'`.
      * `[ ]`   A project_resource-rule artifact has `type: 'resource'`.
      * `[ ]`   A header_context/contribution/fallback-rule artifact has `type: 'resource'`.
      * `[ ]`   `GatherArtifactsDeps` includes `applyCompressionOverlay: BoundApplyCompressionOverlayFn`.
      * `[ ]`   `GatherArtifactsParams` includes `stageSlug: string` and `output_type: string`.
      * `[ ]`   After dedup, `deps.applyCompressionOverlay` is called and its success result's `resourceDocuments` become the returned `artifacts`.
      * `[ ]`   If the overlay returns an error arm, `gatherArtifacts` returns `GatherArtifactsErrorReturn` with the overlay's `error` and `retriable`.
      * `[ ]`   `createGatherArtifactsMock` is replaced by `mockGatherArtifacts: GatherArtifactsFn`.
      * `[ ]`   `buildGatherArtifactsParams` takes an overrides-only bag (no positional `dbClient`).
      * `[ ]`   All existing gathering, dedup, optional-skip, required-fail, and download-error behaviors are preserved.

* `[ ]`   supabase/functions/_shared/utils/vector_utils.ts **[BE] Embedding-free selection: `effectiveScore = candidateTokens × importance`, system-typed documents excluded from the candidate pool, `getEmbedding`/`embeddingClient`/`cosineSimilarity` and this file's `dialectic_memory` query deleted, and the `ICompressionStrategy` seam retired with `CompressionStrategyDeps`/`Params`/`Payload` in favour of `GetSortedCompressionCandidatesFn`**

   * `[ ]`   `objective`
      * `[ ]`   `getSortedCompressionCandidates` scores document candidates via `embeddingClient.getEmbedding` and `cosineSimilarity`, consuming a full embedding round-trip per candidate and per prompt. It requires `CompressionStrategyDeps.dbClient` and `CompressionStrategyDeps.embeddingClient` — the DB client only to execute a diagnostic-only `dialectic_memory` query whose result is unused, and the embedding client to compute cosine similarity that the new formula replaces. The scoring formula for documents is `relevanceWeight × (1 - similarity)`, which couples value to embedding distance. History candidates receive a positional `valueScore` with no token-size weighting. The pluggable `ICompressionStrategy` seam exists only to make the embedding-based strategy swappable, a concern that retires with the embeddings themselves.
      * `[ ]`   Functional goals:
         * `[ ]`   Replace `CompressionStrategyDeps` / `CompressionStrategyParams` / `CompressionStrategyPayload` / `ICompressionStrategy` with `GetSortedCompressionCandidatesDeps` / `GetSortedCompressionCandidatesParams` / `GetSortedCompressionCandidatesPayload` / `GetSortedCompressionCandidatesFn`. The new deps carry only `logger: ILogger` and `countTokens: BoundCountTokensFn`. The new params carry `inputsRelevance?: RelevanceRule[]` and `modelConfig: AiModelExtendedConfig`. The new payload carries `documents: ResourceDocuments` and `history: Messages[]` — no `currentUserPrompt`.
         * `[ ]`   Replace the document-scoring formula: for each document candidate, `effectiveScore = candidateTokens × importance`, where `candidateTokens = deps.countTokens({ resourceDocuments: [{ id: doc.id, content: doc.content }] }, params.modelConfig)` and `importance` is looked up from `params.inputsRelevance` by `document_key` + `type` (+ optional `slug` for stage-specific rules), defaulting to `1` when no rule matches. Higher `effectiveScore` means more token-expensive and more important — sorted ascending so the lowest-scoring (cheapest, least important) candidates compress first.
         * `[ ]`   Exclude system-typed documents from the candidate pool: any document whose `type === 'system'` (per the tightened `ResourceDocumentType`) is filtered out before scoring and does not appear in the returned candidates.
         * `[ ]`   History scoring (`scoreHistory`) is unchanged in logic — positional `valueScore` from oldest (0) to newest (1), head/tail anchors preserved. `effectiveScore` for history candidates becomes `candidateTokens × valueScore`, where `candidateTokens = deps.countTokens({ messages: [message] }, params.modelConfig)`.
         * `[ ]`   Delete `scoreResourceDocuments` (embedding-based), `cosineSimilarity`, `dotProduct`, `magnitude`, and the `dialectic_memory` query block from `getSortedCompressionCandidates`.
         * `[ ]`   Delete `CompressionCandidate.sourceType`'s `'document'` variant and replace with the `ResourceDocumentType` union member the candidate carries, or `'history'` for history candidates. `CompressionCandidate.sourceType` becomes `ResourceDocumentType | 'history'`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No file outside `_shared/utils/vector_utils.ts`, `_shared/utils/vector_utils.interface.ts`, `_shared/utils/vector_utils.mock.ts`, and `_shared/utils/vector_utils.test.ts` is edited. Consumers of the retired `ICompressionStrategy` / `CompressionStrategyDeps` / `CompressionStrategyParams` / `CompressionStrategyPayload` (`compressPrompt`, `calculateAffordability`, `processSimpleJob`, `createJobContext`, and their test/mock/guard files) are addressed in their own nodes.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared utility scorer: given resource documents and conversation history, exclude system-typed documents, compute `candidateTokens × importance` for each eligible document and `candidateTokens × valueScore` for each eligible history message, and return a sorted candidate list, lowest `effectiveScore` first.
      * `[ ]`   The role is correct because the function is a pure scoring and sorting pass over two input arrays, using only injected token counting and a static relevance lookup — no DB access, no embedding, no side effects.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not gather artifacts — `gatherArtifacts` owns that.
         * `[ ]`   Do not overlay compressed content — `applyCompressionOverlay` owns that.
         * `[ ]`   Do not select, enqueue, or compress victims — `compressPrompt` owns that.
         * `[ ]`   Do not count tokens directly — the injected `BoundCountTokensFn` does that.
         * `[ ]`   Do not update any consumer of the retired interface — each consumer's own node does that.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/utils/vector_utils` — scoring compression candidates by token cost and importance, excluding system-typed documents, and returning a sorted list.
      * `[ ]`   Inside boundary:
         * `[ ]`   The system-type filter, the per-document `candidateTokens × importance` formula, the per-history `candidateTokens × valueScore` formula, the relevance-map lookup, the ascending sort, the `scoreHistory` anchor logic.
         * `[ ]`   `GetSortedCompressionCandidatesDeps`, `GetSortedCompressionCandidatesParams`, `GetSortedCompressionCandidatesPayload`, `GetSortedCompressionCandidatesSuccessReturn`, `GetSortedCompressionCandidatesErrorReturn`, `GetSortedCompressionCandidatesReturn`, `GetSortedCompressionCandidatesFn`, `BoundGetSortedCompressionCandidatesFn`, `CompressionCandidate`.
      * `[ ]`   Outside boundary:
         * `[ ]`   `ResourceDocument`, `ResourceDocuments`, `ResourceDocumentType`, `Messages`, `ILogger`, owned by `_shared/types.ts`.
         * `[ ]`   `BoundCountTokensFn`, `CountableChatPayload`, owned by `_shared/types/tokenizer.types.ts`.
         * `[ ]`   `AiModelExtendedConfig`, owned by `_shared/types.ts`.
         * `[ ]`   `RelevanceRule`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   Who calls this function, who supplies `modelConfig` and the bound `countTokens`, and what happens after the sorted candidates reach the consumer.

   * `[ ]`   `deps`
      * `[ ]`   Surviving providers (kept, type changed):
         * `[ ]`   `dialectic-service/dialectic.interface.ts` → `RelevanceRule` (via `params.inputsRelevance`): relevance weights for the importance lookup.
      * `[ ]`   New providers:
         * `[ ]`   `_shared/types/tokenizer.types.ts` → `BoundCountTokensFn` (via `deps.countTokens`).
            * `[ ]`   Layer classification: shared type surface.
            * `[ ]`   Direction: inbound from `_shared`.
            * `[ ]`   Purpose: count tokens for each candidate's content to produce `candidateTokens`.
         * `[ ]`   `_shared/types.ts` → `AiModelExtendedConfig` (via `params.modelConfig`).
            * `[ ]`   Layer classification: shared type surface.
            * `[ ]`   Direction: inbound from `_shared`.
            * `[ ]`   Purpose: the model configuration passed to `countTokens`.
         * `[ ]`   `_shared/types.ts` → `ResourceDocumentType` (via the `'system'` filter).
            * `[ ]`   Layer classification: shared type surface.
            * `[ ]`   Direction: inbound from `_shared`.
            * `[ ]`   Purpose: the tightened type union that identifies system-typed documents to exclude.
      * `[ ]`   Removed providers:
         * `[ ]`   `_shared/services/indexing_service.interface.ts` → `IEmbeddingClient` (was `CompressionStrategyDeps.embeddingClient`). Deleted — no embeddings.
         * `[ ]`   `npm:@supabase/supabase-js@2` → `SupabaseClient<Database>` (was `CompressionStrategyDeps.dbClient`). Deleted — no `dialectic_memory` query.
      * `[ ]`   Confirm: no reverse dependencies, no lateral layer violations. All deps are inward from `_shared` or `dialectic-service`.

   * `[ ]`   `context_slice`
      * `[ ]`   `GetSortedCompressionCandidatesDeps`: `{ logger: ILogger; countTokens: BoundCountTokensFn }`.
      * `[ ]`   `GetSortedCompressionCandidatesParams`: `{ inputsRelevance?: RelevanceRule[]; modelConfig: AiModelExtendedConfig }`.
      * `[ ]`   `GetSortedCompressionCandidatesPayload`: `{ documents: ResourceDocuments; history: Messages[] }` — no `currentUserPrompt`.

   * `[ ]`   _shared/utils/`vector_utils.interface.test.ts`
      * `[ ]`   Add key-record proof for `GetSortedCompressionCandidatesDeps`: typed assignment `const _depsKeys: Record<keyof GetSortedCompressionCandidatesDeps, true> = { logger: true, countTokens: true };`.
      * `[ ]`   Add key-record proof for `GetSortedCompressionCandidatesParams`: typed assignment `const _paramsKeys: Record<keyof GetSortedCompressionCandidatesParams, true> = { inputsRelevance: true, modelConfig: true };`.
      * `[ ]`   Add key-record proof for `GetSortedCompressionCandidatesPayload`: typed assignment `const _payloadKeys: Record<keyof GetSortedCompressionCandidatesPayload, true> = { documents: true, history: true };`.
      * `[ ]`   Prove `CompressionCandidate.sourceType` union membership: `const _resource: CompressionCandidate['sourceType'] = 'resource'; const _feedback: CompressionCandidate['sourceType'] = 'feedback'; const _system: CompressionCandidate['sourceType'] = 'system'; const _history: CompressionCandidate['sourceType'] = 'history';`.
      * `[ ]`   Prove return-union arm discrimination: `GetSortedCompressionCandidatesSuccessReturn` has `candidates` (array), `GetSortedCompressionCandidatesErrorReturn` has `error` (Error) and `retriable` (boolean).
      * `[ ]`   Prove `GetSortedCompressionCandidatesFn` and `BoundGetSortedCompressionCandidatesFn` assignability.
      * `[ ]`   No references to `CompressionStrategyDeps`, `CompressionStrategyParams`, `CompressionStrategyPayload`, `ICompressionStrategy`, `IEmbeddingClient`, or `currentUserPrompt`.

   * `[ ]`   _shared/utils/`vector_utils.interface.ts`
      * `[ ]`   Delete `CompressionStrategyDeps`, `CompressionStrategyParams`, `CompressionStrategyPayload`, `ICompressionStrategy`.
      * `[ ]`   Delete imports: `SupabaseClient` from `npm:@supabase/supabase-js@2`, `Database` from `types_db.ts`, `IEmbeddingClient` from `indexing_service.interface.ts`, `CompressionCandidate` from `vector_utils.ts`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesDeps`: `{ logger: ILogger; countTokens: BoundCountTokensFn }`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesParams`: `{ inputsRelevance?: RelevanceRule[]; modelConfig: AiModelExtendedConfig }`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesPayload`: `{ documents: ResourceDocuments; history: Messages[] }`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesSuccessReturn`: `{ candidates: CompressionCandidate[] }`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesErrorReturn`: `{ error: Error; retriable: boolean }`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesReturn`: `GetSortedCompressionCandidatesSuccessReturn | GetSortedCompressionCandidatesErrorReturn`.
      * `[ ]`   Declare `GetSortedCompressionCandidatesFn`: `(deps, params, payload) => Promise<GetSortedCompressionCandidatesReturn>`.
      * `[ ]`   Declare `BoundGetSortedCompressionCandidatesFn`: `(params, payload) => Promise<GetSortedCompressionCandidatesReturn>`.
      * `[ ]`   Add imports: `ILogger`, `Messages`, `ResourceDocuments`, `AiModelExtendedConfig` from `../types.ts`; `BoundCountTokensFn` from `../types/tokenizer.types.ts`; `RelevanceRule` from `../../dialectic-service/dialectic.interface.ts`; `CompressionCandidate` from `./vector_utils.ts`.

   * `[ ]`   `vector_utils.interaction.spec`
      * `[ ]`   Branch: empty documents and empty history.
         * `[ ]`   Condition: `payload.documents.length === 0 && payload.history.length === 0`.
         * `[ ]`   Decision: none.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `GetSortedCompressionCandidatesSuccessReturn` with `candidates: []`.
      * `[ ]`   Branch: system-typed document excluded.
         * `[ ]`   Condition: `doc.type === 'system'`.
         * `[ ]`   Decision: filter out before scoring.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: the document does not appear in the returned candidates.
      * `[ ]`   Branch: eligible document scored.
         * `[ ]`   Condition: `doc.type !== 'system'` (i.e. `'resource'` or `'feedback'`).
         * `[ ]`   Decision: compute `candidateTokens × importance`.
         * `[ ]`   Dependency call: `deps.countTokens({ resourceDocuments: [{ id: doc.id, content: doc.content }] }, params.modelConfig)` to get `candidateTokens`.
         * `[ ]`   Outcome: a `CompressionCandidate` with `sourceType` set to the document's `type`, `effectiveScore = candidateTokens × importance`, pushed into the candidate array.
      * `[ ]`   Branch: importance lookup — stage-specific rule match.
         * `[ ]`   Condition: `inputsRelevance` contains a rule whose `document_key`, `type`, and `slug` all match the document's `document_key`, `type`, and `stage_slug`.
         * `[ ]`   Decision: use that rule's `relevance` as `importance`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `importance` is the matched rule's `relevance`, clamped `[0, 1]`.
      * `[ ]`   Branch: importance lookup — general rule match (no slug).
         * `[ ]`   Condition: no stage-specific rule matches, but a rule with matching `document_key` and `type` (no `slug`) exists.
         * `[ ]`   Decision: use that rule's `relevance` as `importance`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `importance` is the matched rule's `relevance`, clamped `[0, 1]`.
      * `[ ]`   Branch: importance lookup — no rule match.
         * `[ ]`   Condition: no matching rule in `inputsRelevance`.
         * `[ ]`   Decision: default `importance` to `1`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `importance = 1`, so `effectiveScore = candidateTokens × 1 = candidateTokens`.
      * `[ ]`   Branch: history message in compressible middle.
         * `[ ]`   Condition: message index is between immutable head count and `history.length - immutableTailCount`.
         * `[ ]`   Decision: compute `candidateTokens × valueScore`.
         * `[ ]`   Dependency call: `deps.countTokens({ messages: [message] }, params.modelConfig)` to get `candidateTokens`.
         * `[ ]`   Outcome: a `CompressionCandidate` with `sourceType: 'history'`, `effectiveScore = candidateTokens × valueScore`.
      * `[ ]`   Branch: history message in immutable head or tail.
         * `[ ]`   Condition: message index is within immutable head or tail range.
         * `[ ]`   Decision: skip — not a candidate.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: the message does not appear in the returned candidates.
      * `[ ]`   Branch: final sort and return.
         * `[ ]`   Condition: all candidates scored.
         * `[ ]`   Decision: sort ascending by `effectiveScore`.
         * `[ ]`   Dependency call: none.
         * `[ ]`   Outcome: `GetSortedCompressionCandidatesSuccessReturn` with `candidates` in ascending `effectiveScore` order.

   * `[ ]`   _shared/utils/`vector_utils.mock.ts`
      * `[ ]`   Delete `mockCompressionStrategy: ICompressionStrategy`.
      * `[ ]`   Add `mockGetSortedCompressionCandidates: GetSortedCompressionCandidatesFn` — returns `{ candidates: [] }`.
      * `[ ]`   Add `GetSortedCompressionCandidatesDepsOverrides`, `buildGetSortedCompressionCandidatesDeps` — defaults: `logger` from `MockLogger`, `countTokens` from `buildMockCountTokensFn()` (returns content length as token count).
      * `[ ]`   Add `GetSortedCompressionCandidatesParamsOverrides`, `buildGetSortedCompressionCandidatesParams` — defaults: `inputsRelevance: []`, `modelConfig` from `buildAiModelExtendedConfig()` (locate existing builder).
      * `[ ]`   Add `GetSortedCompressionCandidatesPayloadOverrides`, `buildGetSortedCompressionCandidatesPayload` — defaults: `documents: []`, `history: []`.
      * `[ ]`   Add `GetSortedCompressionCandidatesSuccessReturnOverrides`, `buildGetSortedCompressionCandidatesSuccessReturn` — defaults: `candidates: []`.
      * `[ ]`   Add `GetSortedCompressionCandidatesErrorReturnOverrides`, `buildGetSortedCompressionCandidatesErrorReturn` — defaults: `error: new Error('getSortedCompressionCandidates failed')`, `retriable: false`.
      * `[ ]`   Update `buildCompressionCandidate`: change `sourceType` default from `'document'` to `'resource'`; add `tokenCount: 10` default.
      * `[ ]`   Update `CompressionCandidateCorruptions` and `invalidateCompressionCandidate` to match updated `CompressionCandidate`.
      * `[ ]`   Remove imports: `ICompressionStrategy` from `vector_utils.interface.ts`.

   * `[ ]`   _shared/utils/`vector_utils.guard.test.ts`
      * `[ ]`   Create this file.
      * `[ ]`   `isGetSortedCompressionCandidatesDeps` — accepts valid deps, rejects: null, missing `logger`, missing `countTokens`, `countTokens: 'not-a-function'`.
      * `[ ]`   `isGetSortedCompressionCandidatesParams` — accepts valid params, rejects: null, missing `modelConfig`, `modelConfig: 'not-an-object'`.
      * `[ ]`   `isGetSortedCompressionCandidatesPayload` — accepts valid payload, rejects: null, missing `documents`, `documents: 'not-an-array'`, missing `history`, `history: 'not-an-array'`.
      * `[ ]`   `isGetSortedCompressionCandidatesSuccessReturn` — accepts valid success, rejects: null, missing `candidates`, `candidates: 'not-an-array'`, presence of `error`.
      * `[ ]`   `isGetSortedCompressionCandidatesErrorReturn` — accepts valid error, rejects: null, `error: 'not-Error'`, `retriable: 'not-boolean'`, presence of `candidates`.

   * `[ ]`   _shared/utils/`vector_utils.guard.ts`
      * `[ ]`   Create this file.
      * `[ ]`   Implement `isGetSortedCompressionCandidatesDeps`: checks `logger` (logger shape) and `countTokens` (function).
      * `[ ]`   Implement `isGetSortedCompressionCandidatesParams`: checks `modelConfig` (object with `tokenization_strategy`). `inputsRelevance` is optional — accepted when absent or when array.
      * `[ ]`   Implement `isGetSortedCompressionCandidatesPayload`: checks `documents` (array) and `history` (array).
      * `[ ]`   Implement `isGetSortedCompressionCandidatesSuccessReturn`: checks `candidates` (array), rejects if `error` present.
      * `[ ]`   Implement `isGetSortedCompressionCandidatesErrorReturn`: checks `error` (instanceof Error), `retriable` (boolean), rejects if `candidates` present.

   * `[ ]`   _shared/utils/`vector_utils.test.ts`
      * `[ ]`   Delete all `cosineSimilarity` tests (10 test cases).
      * `[ ]`   Delete all `scoreResourceDocuments` tests (embedding-based).
      * `[ ]`   Delete `mockEmbeddingClient` and `mockSourceDocument` fixtures.
      * `[ ]`   Delete all `ICompressionStrategy` usage and `CompressionStrategyDeps` references.
      * `[ ]`   Delete `dialectic_memory` mock setup from all `getSortedCompressionCandidates` tests.
      * `[ ]`   Update `scoreHistory` tests: unchanged logic, but add `deps` and `params.modelConfig` for the token-weighted `effectiveScore`. Assert `effectiveScore = candidateTokens × valueScore`.
      * `[ ]`   Add tests for `getSortedCompressionCandidates`:
         * `[ ]`   Empty documents and empty history returns `{ candidates: [] }`.
         * `[ ]`   System-typed document (`type: 'system'`) is excluded from candidates.
         * `[ ]`   Resource-typed document is scored with `candidateTokens × importance` where `importance` comes from matching `inputsRelevance` rule.
         * `[ ]`   Feedback-typed document is scored with `candidateTokens × importance`.
         * `[ ]`   Document with no matching relevance rule gets `importance = 1`.
         * `[ ]`   Stage-specific relevance rule takes precedence over general rule for the same `document_key` + `type`.
         * `[ ]`   History candidates scored with `candidateTokens × valueScore` — oldest gets lowest score.
         * `[ ]`   Mixed documents and history sorted ascending by `effectiveScore`.
         * `[ ]`   `deps.countTokens` is called once per eligible candidate (not for system-typed documents, not for immutable head/tail history).
      * `[ ]`   Remove all imports: `cosineSimilarity`, `scoreResourceDocuments`, `ICompressionStrategy`, `IEmbeddingClient`, `EmbeddingResponse`, `SourceDocument`, `SupabaseClient`, `Database`, `createMockSupabaseClient`, `stub`.
      * `[ ]`   Add imports: `GetSortedCompressionCandidatesDeps`, `GetSortedCompressionCandidatesParams`, `GetSortedCompressionCandidatesPayload` from `vector_utils.interface.ts`; builders from `vector_utils.mock.ts`.

   * `[ ]`   `construction`
      * `[ ]`   `getSortedCompressionCandidates` remains a stateless exported async function. `countTokens` is injected via `deps` as a `BoundCountTokensFn`. `scoreHistory` remains a pure exported function but now receives `deps` and `params` for token counting. No constructor, no class, no factory.

   * `[ ]`   _shared/utils/`vector_utils.ts`
      * `[ ]`   Delete `dotProduct`, `magnitude`, `cosineSimilarity` functions.
      * `[ ]`   Delete `scoreResourceDocuments` function.
      * `[ ]`   Delete `CompressionStrategyDeps`, `CompressionStrategyParams`, `CompressionStrategyPayload` imports from `vector_utils.interface.ts`.
      * `[ ]`   Delete the `dialectic_memory` query block (lines 244–250) and the `candidateIds` array it uses (line 239).
      * `[ ]`   Update `CompressionCandidate.sourceType` from `'history' | 'document'` to `ResourceDocumentType | 'history'`.
      * `[ ]`   Add `tokenCount: number` to `CompressionCandidate`.
      * `[ ]`   Replace `getSortedCompressionCandidates` signature: `(deps: GetSortedCompressionCandidatesDeps, params: GetSortedCompressionCandidatesParams, payload: GetSortedCompressionCandidatesPayload): Promise<GetSortedCompressionCandidatesReturn>`.
      * `[ ]`   In `getSortedCompressionCandidates`, before scoring documents:
         * `[ ]`   Filter out system-typed documents: `const eligibleDocuments = payload.documents.filter(doc => doc.type !== 'system');`.
      * `[ ]`   Score each eligible document:
         * `[ ]`   `const candidateTokens = deps.countTokens({ resourceDocuments: [{ id: doc.id, content: doc.content }] }, params.modelConfig);`.
         * `[ ]`   Look up `importance` from `params.inputsRelevance` by `document_key` + `type` (stage-specific first, then general), defaulting to `1`.
         * `[ ]`   `effectiveScore = candidateTokens × importance`.
         * `[ ]`   `sourceType` set to the document's `type` (a `ResourceDocumentType` value).
         * `[ ]`   `tokenCount` set to `candidateTokens`.
      * `[ ]`   Update `scoreHistory` to accept `deps` and `params` and compute `candidateTokens` per history candidate:
         * `[ ]`   `const candidateTokens = deps.countTokens({ messages: [message] }, params.modelConfig);`.
         * `[ ]`   `effectiveScore = candidateTokens × valueScore`.
         * `[ ]`   `tokenCount` set to `candidateTokens`.
      * `[ ]`   Merge document candidates and history candidates, sort ascending by `effectiveScore`.
      * `[ ]`   Return `{ candidates: sortedCandidates }`.
      * `[ ]`   Delete the debug `console.log` at line 275.
      * `[ ]`   Add imports: `GetSortedCompressionCandidatesDeps`, `GetSortedCompressionCandidatesParams`, `GetSortedCompressionCandidatesPayload`, `GetSortedCompressionCandidatesReturn` from `vector_utils.interface.ts`; `ResourceDocumentType` from `../types.ts`.
      * `[ ]`   Introduce no undeclared dependencies; bypass no guards or contracts.

   * `[ ]`   _shared/utils/`vector_utils.provides.ts`
      * `[ ]`   Create this file.
      * `[ ]`   `export * from "./vector_utils.ts";`
      * `[ ]`   `export type * from "./vector_utils.interface.ts";`
      * `[ ]`   `export * from "./vector_utils.guard.ts";`
      * `[ ]`   `export type * from "./vector_utils.mock.ts";`
      * `[ ]`   `export * from "./vector_utils.mock.ts";`

   * `[ ]`   `directionality`
      * `[ ]`   Layer: shared utility module (`_shared/utils/vector_utils`). Deps are inward: `ILogger`, `ResourceDocuments`, `ResourceDocumentType`, `Messages`, `AiModelExtendedConfig` from `_shared/types.ts`; `BoundCountTokensFn` from `_shared/types/tokenizer.types.ts`; `RelevanceRule` from `dialectic-service/dialectic.interface.ts`. Provides outward to `compressPrompt` (the consumer that calls the scorer).
      * `[ ]`   Removed deps: `IEmbeddingClient` from `_shared/services/indexing_service.interface.ts`; `SupabaseClient<Database>` from `npm:@supabase/supabase-js@2` + `types_db.ts`.
      * `[ ]`   No reverse dependencies, no lateral layer violations, no cycles.

   * `[ ]`   `requirements`
      * `[ ]`   `CompressionStrategyDeps`, `CompressionStrategyParams`, `CompressionStrategyPayload`, `ICompressionStrategy` are deleted and replaced by `GetSortedCompressionCandidatesDeps`, `GetSortedCompressionCandidatesParams`, `GetSortedCompressionCandidatesPayload`, `GetSortedCompressionCandidatesFn`.
      * `[ ]`   `GetSortedCompressionCandidatesDeps` has `logger: ILogger` and `countTokens: BoundCountTokensFn` — no `dbClient`, no `embeddingClient`.
      * `[ ]`   `GetSortedCompressionCandidatesPayload` has `documents` and `history` — no `currentUserPrompt`.
      * `[ ]`   A document with `type === 'system'` is excluded from the candidate pool.
      * `[ ]`   A document with `type === 'resource'` or `type === 'feedback'` is scored with `effectiveScore = candidateTokens × importance`.
      * `[ ]`   `importance` is looked up from `inputsRelevance` by `document_key` + `type` (stage-specific slug first, then general), defaulting to `1`.
      * `[ ]`   A history candidate in the compressible middle is scored with `effectiveScore = candidateTokens × valueScore`.
      * `[ ]`   `candidateTokens` is computed via `deps.countTokens` for every scored candidate.
      * `[ ]`   Candidates are sorted ascending by `effectiveScore` — lowest first compresses first.
      * `[ ]`   `cosineSimilarity`, `dotProduct`, `magnitude`, `scoreResourceDocuments` are deleted.
      * `[ ]`   The `dialectic_memory` query is deleted.
      * `[ ]`   `CompressionCandidate.sourceType` is `ResourceDocumentType | 'history'`.
      * `[ ]`   `CompressionCandidate` carries `tokenCount: number`.
      * `[ ]`   Head/tail anchor logic in `scoreHistory` is preserved.
      * `[ ]`   `mockCompressionStrategy` is replaced by `mockGetSortedCompressionCandidates: GetSortedCompressionCandidatesFn`.

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