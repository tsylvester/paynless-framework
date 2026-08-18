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

* `[ ]`   supabase/functions/dialectic-worker/persistContributionRelationships/persistContributionRelationships.ts **[BE] The continuation and init-and-merge branches with both `dialectic_contributions` updates, returning the row the database holds**

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

   * `[ ]`   `persistContributionRelationships.interface.ts`
      * `[ ]`   `export type PersistContributionRelationshipsDeps = Record<never, never>;` — the contract slot, declared with no members.
      * `[ ]`   `export interface PersistContributionRelationshipsParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; contribution: DialecticContributionRow; isContinuationForStorage: boolean; }` — `isContinuationForStorage` is a value `resolveContributionIdentity` produced this invocation.
      * `[ ]`   `export type PersistContributionRelationshipsPayload = DialecticExecuteJobPayload;`
      * `[ ]`   `export interface PersistContributionRelationshipsPersistedReturn { persisted: true; contribution: DialecticContributionRow; }` and `export interface PersistContributionRelationshipsUnchangedReturn { persisted: false; contribution: DialecticContributionRow; }`.
      * `[ ]`   `export type PersistContributionRelationshipsSuccessReturn = PersistContributionRelationshipsPersistedReturn | PersistContributionRelationshipsUnchangedReturn;` — the two discrete successful outcomes, both members of the one success arm.
      * `[ ]`   `export type PersistContributionRelationshipsErrorReturn = { error: Error; retriable: boolean };` — every inhabitant is an owned class extending `Error`; consumers discriminate by the guards below.
      * `[ ]`   `export type PersistContributionRelationshipsReturn = PersistContributionRelationshipsSuccessReturn | PersistContributionRelationshipsErrorReturn;` — exactly two arms.
      * `[ ]`   `export type PersistContributionRelationshipsFn = (deps: PersistContributionRelationshipsDeps, params: PersistContributionRelationshipsParams, payload: PersistContributionRelationshipsPayload) => Promise<PersistContributionRelationshipsReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `PersistContributionRelationshipsStageSlugMissingError { jobId; contributionId }`, `PersistContributionRelationshipsRelationshipsMissingError { jobId; contributionId }`, `PersistContributionRelationshipsUpdateError { jobId; contributionId; stageSlug; driverMessage }`, `PersistContributionRelationshipsStageEntryError { jobId; contributionId; stageSlug }`, `PersistContributionRelationshipsStageSlugTypeError { jobId; contributionId; stageSlug }`, `PersistContributionRelationshipsMergedEntryError { jobId; contributionId; stageSlug }`.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `persistContributionRelationships.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Stage slug: `stageSlug` is `payload.stageSlug`. Branch, condition it is absent or empty after trim: return the error arm carrying `PersistContributionRelationshipsStageSlugMissingError` built from `params.job.id` and `params.contribution.id`, with `retriable: false`. The arm declares the member optional, so its presence is an invariant this module owns.
      * `[ ]`   Branch, condition `params.isContinuationForStorage` and `payload.document_relationships` is absent or null: return the error arm carrying `PersistContributionRelationshipsRelationshipsMissingError` built from the job id and the contribution id, with `retriable: false`. No write is attempted.
      * `[ ]`   Continuation write, condition `params.isContinuationForStorage` and `payload.document_relationships` present: `params.dbClient.from('dialectic_contributions').update({ document_relationships: payload.document_relationships }).eq('id', params.contribution.id)`.
      * `[ ]`   Branch, condition that update returned a driver error: return the error arm carrying `PersistContributionRelationshipsUpdateError` built from the job id, the contribution id, the stage slug and the driver's message, with `retriable: true`. The driver's message is carried, never replaced.
      * `[ ]`   Branch, condition the write succeeded and `payload.document_relationships[stageSlug]` is absent, not a string, or empty after trim: return the error arm carrying `PersistContributionRelationshipsStageEntryError` built from the job id, the contribution id and the stage slug, with `retriable: false`. This verification sits after its write, exactly where the source runs it.
      * `[ ]`   Branch, condition the write succeeded and that entry is a non-empty string: return the success arm's persisted flavor, `persisted: true`, whose `contribution` is a new object composed from `params.contribution` with `document_relationships` set to `payload.document_relationships`. No read-back is performed: the write reported no error, so the database holds what was sent.
      * `[ ]`   Init decision, condition `params.isContinuationForStorage` is false: `existing` is `params.contribution.document_relationships`, the row's `Json | null` column; `existingStageValue` is `existing[stageSlug]` when `isRecord(existing)` holds. `needsInit` is true when `isRecord(existing)` fails, or `existingStageValue` is not a string, or is empty after trim, or does not equal `params.contribution.id`.
      * `[ ]`   Branch, condition `needsInit` is false: return the success arm's unchanged flavor, `persisted: false`, carrying `params.contribution` as received. No write is attempted.
      * `[ ]`   Merge assembly, condition `needsInit` is true: `merged` starts empty and takes each own entry of `existing` whose value is a string and whose key is either a `ContributionType` or `source_group`, and only when `isDocumentRelationships(existing)` holds. `isContinuation` and `turnIndex` are not strings and are therefore not carried.
      * `[ ]`   Merge, `source_group`: condition `payload.document_relationships.source_group` is explicitly `null`, `merged.source_group` is set to `params.contribution.id`. An absent `document_relationships`, and a `source_group` that is absent or a string, each leave `merged.source_group` as the copy loop left it.
      * `[ ]`   Branch, condition `isContributionType(stageSlug)` fails: return the error arm carrying `PersistContributionRelationshipsStageSlugTypeError` built from the job id, the contribution id and the stage slug, with `retriable: false`. No write is attempted. The check runs after the `source_group` initialization and before the stage key is set, exactly where the source runs it.
      * `[ ]`   Merge, stage key: `merged[stageSlug]` is set to `params.contribution.id`.
      * `[ ]`   Init write: `params.dbClient.from('dialectic_contributions').update({ document_relationships: merged }).eq('id', params.contribution.id)`.
      * `[ ]`   Branch, condition that update returned a driver error: return the error arm carrying `PersistContributionRelationshipsUpdateError` built from the job id, the contribution id, the stage slug and the driver's message, with `retriable: true`.
      * `[ ]`   Branch, condition the write succeeded and `merged[stageSlug]` is absent, not a string, empty after trim, or not equal to `params.contribution.id`: return the error arm carrying `PersistContributionRelationshipsMergedEntryError` built from the job id, the contribution id and the stage slug, with `retriable: false`. The branch is reachable because an empty `params.contribution.id` satisfies the assignment and fails this check.
      * `[ ]`   Branch, condition the write succeeded and that entry equals `params.contribution.id`: return the success arm's persisted flavor, `persisted: true`, whose `contribution` is a new object composed from `params.contribution` with `document_relationships` set to `merged`.
      * `[ ]`   Ordering and side effects: at most one write on any path, and none on the unchanged flavor or on any branch that returns before its write; no read; neither `params` nor `payload` is mutated, and neither `params.contribution` nor `payload.document_relationships` is carried by reference into a written object.

   * `[ ]`   `persistContributionRelationships.mock.ts`
      * `[ ]`   `PersistContributionRelationshipsDepsOverrides`, `buildPersistContributionRelationshipsDeps`, `PersistContributionRelationshipsDepsCorruptions` and `invalidatePersistContributionRelationshipsDeps`; the builder returns the empty deps object the type declares.
      * `[ ]`   `PersistContributionRelationshipsParamsOverrides`, `buildPersistContributionRelationshipsParams`, `PersistContributionRelationshipsParamsCorruptions` and `invalidatePersistContributionRelationshipsParams`; the builder's base client is `createMockSupabaseClient()`'s client, its `job` composes `buildDialecticJobRow()`, its `contribution` composes `buildDialecticContributionRow()`, and its `isContinuationForStorage` defaults to `false` so a continuation case must override it.
      * `[ ]`   `PersistContributionRelationshipsPayloadOverrides`, `buildPersistContributionRelationshipsPayload`, `PersistContributionRelationshipsPayloadCorruptions` and `invalidatePersistContributionRelationshipsPayload`; the builder composes `buildDialecticExecuteJobPayload()` rather than restating that arm's defaults, and supplies a `stageSlug` that is a valid `ContributionType` so the ordinary path reaches the merge. The four symbols are owned here.
      * `[ ]`   The four symbols for each of `PersistContributionRelationshipsPersistedReturn`, `PersistContributionRelationshipsUnchangedReturn` and `PersistContributionRelationshipsErrorReturn`; each return builder's `contribution` composes `buildDialecticContributionRow()`, and the error builder composes `buildPersistContributionRelationshipsUpdateError()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[ ]`   `mockPersistContributionRelationships: PersistContributionRelationshipsFn` returning `buildPersistContributionRelationshipsPersistedReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `DialecticJobRow`, `DialecticContributionRow`, `DialecticExecuteJobPayload` or `DocumentRelationships` is written here; all four are imported types whose complete four-symbol families live in `_shared/dialectic.mock.ts`, located above.

   * `[ ]`   `persistContributionRelationships.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isPersistContributionRelationshipsDeps`: accepts the built deps; accepts an empty object; rejects `null`, `undefined`, a primitive and an array.
      * `[ ]`   `isPersistContributionRelationshipsParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` absent and set to `invalidateDialecticJobRow({ id: 42 })`; rejects `contribution` absent and set to `invalidateDialecticContributionRow({ id: null })`; rejects `isContinuationForStorage` absent and non-boolean; rejects a non-record root.
      * `[ ]`   `isPersistContributionRelationshipsPayload`: accepts the built payload; rejects each of `prompt_template_id`, `output_type`, `canonicalPathParams` and `inputs` corrupted in turn via `invalidatePersistContributionRelationshipsPayload`; rejects `document_relationships` set to `invalidateDocumentRelationships({ source_group: 42 })`; rejects a non-record root.
      * `[ ]`   `isPersistContributionRelationshipsPersistedReturn`: accepts the built return; rejects `persisted` absent, `false` and non-boolean; rejects `contribution` absent and failing its owner's guard; rejects the unchanged return; rejects the error return; rejects a non-record root.
      * `[ ]`   `isPersistContributionRelationshipsUnchangedReturn`: the mirror checklist, rejecting `persisted` set to `true` and rejecting the persisted return.
      * `[ ]`   `isPersistContributionRelationshipsErrorReturn`: accepts the built return; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects both success flavors; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[ ]`   `persistContributionRelationships.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isPersistContributionRelationshipsDeps`, `isPersistContributionRelationshipsParams`, `isPersistContributionRelationshipsPayload`, `isPersistContributionRelationshipsPersistedReturn`, `isPersistContributionRelationshipsUnchangedReturn`, `isPersistContributionRelationshipsErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isPersistContributionRelationshipsDeps` requires only that the value is a record. The deps type declares no member, so there is no member to check and none is invented.
      * `[ ]`   `isPersistContributionRelationshipsParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — calls the imported `isDialecticJobRow` on `job`, calls the imported `isDialecticContribution` on `contribution`, and requires `isContinuationForStorage` to be a boolean.
      * `[ ]`   `isPersistContributionRelationshipsPayload` calls the imported `isDialecticExecuteJobPayload`, catching the per-member diagnostic that guard throws and returning `false`, so this guard keeps a boolean contract while the arm guard keeps its throwing one.
      * `[ ]`   `isPersistContributionRelationshipsPersistedReturn` requires `persisted` to be exactly `true` and calls the imported `isDialecticContribution` on `contribution`; `isPersistContributionRelationshipsUnchangedReturn` requires `persisted` to be exactly `false` and the same of `contribution`.
      * `[ ]`   `isPersistContributionRelationshipsErrorReturn` requires `error instanceof Error` and `retriable` a boolean. The arms are mutually exclusive, so a value passes exactly one.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   No guard is written here for `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow` or `DocumentRelationships`; none is owned by this interface, and each already has one in `_shared/utils/type-guards/type_guards.dialectic.ts`.

   * `[ ]`   `persistContributionRelationships.test.ts`
      * `[ ]`   Deps fixtures are `buildPersistContributionRelationshipsDeps()`, params `buildPersistContributionRelationshipsParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the update outcome the case turns on, and payload `buildPersistContributionRelationshipsPayload({ … })`.
      * `[ ]`   Stage slug invariant: a payload with no `stageSlug`, and one whose slug is whitespace, each return the error arm whose error passes `isPersistContributionRelationshipsStageSlugMissingError`, with no update performed.
      * `[ ]`   Continuation relationships invariant: a continuation whose payload `document_relationships` is absent, and one whose member is null, each return the error arm whose error passes `isPersistContributionRelationshipsRelationshipsMissingError`, with no update performed.
      * `[ ]`   Continuation write: a continuation whose relationships carry the stage entry updates `dialectic_contributions` once with exactly those relationships, filtered on the contribution's id, and returns the persisted flavor whose `contribution.document_relationships` equals the payload's. The payload's relationships and the contribution's id are arranged as values distinct from every builder default, so a case reading the wrong source cannot pass.
      * `[ ]`   Continuation verification: a continuation whose relationships carry no entry for the stage, and one whose entry is an empty string, each return the error arm whose error passes `isPersistContributionRelationshipsStageEntryError` — and each performs the update first, the case asserting the write happened, which is the behavior the source has.
      * `[ ]`   Unchanged flavor: a non-continuation whose contribution already carries `document_relationships[stageSlug]` equal to its own id returns the unchanged flavor carrying that contribution, with no update performed.
      * `[ ]`   Init decision: three non-continuation cases — relationships absent, relationships a record whose stage entry is not a string, and relationships whose stage entry is a different contribution's id — each reach the merge and update once. The foreign id differs from the contribution's own, so the case cannot pass by treating them as equal.
      * `[ ]`   Merge copy: a contribution whose relationships carry one valid `ContributionType` entry, a `source_group` string, an `isContinuation` boolean and a `turnIndex` number yields merged relationships carrying the first two and neither of the last two, asserted against independent literals.
      * `[ ]`   Source group initialization: a payload whose `document_relationships.source_group` is explicitly null yields merged relationships whose `source_group` equals the contribution's id; a payload whose `source_group` is a string, and one with no `document_relationships`, each leave the merged `source_group` as the copy loop produced it.
      * `[ ]`   Stage key type: a non-continuation whose `stageSlug` is a non-empty string that is not a `ContributionType` returns the error arm whose error passes `isPersistContributionRelationshipsStageSlugTypeError`, with no update performed.
      * `[ ]`   Merged verification: a non-continuation whose contribution id is an empty string returns the error arm whose error passes `isPersistContributionRelationshipsMergedEntryError` after the update ran.
      * `[ ]`   Update failures surfaced: a driver error on the continuation write and a driver error on the init write each return the error arm whose error passes `isPersistContributionRelationshipsUpdateError`, carries the driver's message and the stage slug, and is `retriable` true. Each case's driver message is a distinct literal, so an error carrying the wrong one cannot pass.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path; the returned `contribution` is not `params.contribution`; and the returned relationships are neither `payload.document_relationships` nor `params.contribution.document_relationships` by reference.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`; this node constructs nothing at a boundary.

   * `[ ]`   `persistContributionRelationships.ts`
      * `[ ]`   One exported function, typed `PersistContributionRelationshipsFn`, implementing the interaction spec in its stated order: stage slug, continuation relationships invariant, continuation write and verification, init decision, merge assembly with its `source_group` initialization and stage-key requirement, init write and verification, success.
      * `[ ]`   The resolved stage slug, the assembled merge object and each returned row are held in one typed local apiece; none is inferred and none is widened at its use site.
      * `[ ]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no write failure is swallowed or converted.

   * `[ ]`   `persistContributionRelationships.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, `packages/types` and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: this node edits no file outside its own folder.

   * `[ ]`   `requirements`
      * `[ ]`   The return union has exactly two arms — interface test. Both success flavors are declared inside the success arm — interface.
      * `[ ]`   `PersistContributionRelationshipsParams` declares `isContinuationForStorage`, the produced value this module does not re-derive — interface test.
      * `[ ]`   `PersistContributionRelationshipsDeps` is declared and inhabited by the empty object — interface test.
      * `[ ]`   `PersistContributionRelationshipsPayload` is declared equivalent to `DialecticExecuteJobPayload` — interface.
      * `[ ]`   The two success flavors reject each other on their literal discriminant — guard test.
      * `[ ]`   The payload guard returns `false` for a payload the arm guard throws on — guard test.
      * `[ ]`   An absent or empty `stageSlug` returns its own typed error before any write — unit test.
      * `[ ]`   A continuation with no `document_relationships` returns its own typed error instead of falling through silently — unit test.
      * `[ ]`   Either update's driver error returns one typed error carrying that driver's message with `retriable` true — unit test.
      * `[ ]`   Each post-write verification returns its own typed error and runs after its write — unit test.
      * `[ ]`   A stage slug that is not a `ContributionType` returns its own typed error before the init write — unit test.
      * `[ ]`   A contribution already carrying its own id for the stage returns the unchanged flavor with no write — unit test.
      * `[ ]`   The merge carries string `ContributionType` and `source_group` entries and drops `isContinuation` and `turnIndex` — unit test.
      * `[ ]`   An explicitly null payload `source_group` initializes the merged `source_group` to the contribution's id — unit test.
      * `[ ]`   Neither `params` nor `payload` is mutated, and the returned row and relationships are copies — unit test.

* `[ ]`   supabase/functions/dialectic-worker/finalizeContributionJob/finalizeContributionJob.ts **[BE] The RENDER dispatch, the prompt-resource back-link, notifications, continuation, final-document assembly and job-row completion, with every failure returned instead of logged and walked past**

   * `[ ]`   `objective`
      * `[ ]`   The finalization tail of the contribution path logs an error and continues for five distinct failure sites — RENDER dispatch failure, prompt-resource back-link update failure, continueJob failure, job-completion update failure, and assembleAndSaveFinalDocument failure — so a transient DB failure or a bad enqueue silently advances the happy path and the job row reaches `completed` with an incomplete record. Notification dispatch for `execute_chunk_completed` and `execute_completed` requires `document_key` from the raw payload, re-extracting it through `isRecord(jobPayloadUnknown)` after the orchestrator already proved the payload. And `modelProcessingResult.status` is written into the job row's `results` column via `JSON.stringify` after being set by mutation through the continuation block, so a missed assignment or a reordered block silently writes `completed` where `continuation_limit_reached` was intended.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/finalizeContributionJob/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `FinalizeContributionJobReturn`.
         * `[ ]`   The payload slot is `FinalizeContributionJobPayload`, declared equivalent to `DialecticExecuteJobPayload`, received already proven, and read directly: `payload.stageSlug`, `payload.user_jwt`, `payload.document_key`, `payload.source_prompt_resource_id`, `payload.continuation_count`, `payload.continueUntilComplete`, `payload.context_for_documents`, `payload.model_id`, `payload.sessionId`, `payload.projectId`, `payload.iterationNumber`, `payload.walletId`. No `isRecord(jobPayloadUnknown)` probe survives.
         * `[ ]`   The deps are `logger`, `notificationService`, `fileManager`, `continueJob` (typed `BoundContinueJobFn`) and `enqueueRenderJob` (typed `BoundEnqueueRenderJobFn`). `BoundContinueJobFn` is added to `continueJob/continueJob.interface.ts` as a single-line type alias stripping the `deps` parameter, matching the pattern `BoundEnqueueRenderJobFn` already uses in `enqueueRenderJob/enqueueRenderJob.interface.ts`.
         * `[ ]`   The params are `dbClient`, `job`, `contribution` (after `persistContributionRelationships`), `assembledResponse` (the `UnifiedAIResponse`), `preparedContentResult` (the `PrepareResponseContentPreparedReturn`), `storageFileType` (from `resolveContributionIdentity`), and `isContinuationForStorage` (from `resolveContributionIdentity`).
         * `[ ]`   The success arm carries `status: 'completed' | 'needs_continuation' | 'continuation_limit_reached'`, derived inside this module from `preparedContentResult.needsContinuation` and the `modelProcessingResult.status` mutation.
         * `[ ]`   Every failure returns its own typed error on the error arm. RENDER dispatch failure, prompt-resource back-link DB failure, continueJob error, and job-completion update DB failure each return a distinct owned error class instead of logging and continuing. `document_key` validation failures for notifications return `FinalizeContributionJobDocumentKeyError`.
         * `[ ]`   `stageRelationshipForStage` is derived from `params.contribution.document_relationships` via `isRecord` and `isDocumentRelationships`, and the document-related check requiring it before RENDER is preserved.
         * `[ ]`   RENDER dispatch is conditional on `!needsContinuation`, a valid `user_jwt`, and `isDialecticStageSlug(stageSlug)`.
         * `[ ]`   The continuation path calls `deps.continueJob`, handles `continuation_limit_reached` with cap assembly via `deps.fileManager.assembleAndSaveFinalDocument`, and sends the continuation notification.
         * `[ ]`   The final-chunk path (`resolvedFinishReason === 'stop'`) fires `execute_chunk_completed` (for document-related) and calls final document assembly.
         * `[ ]`   The job-completion update writes `status: 'completed'`, `results`, `completed_at`, and `attempt_count` to `dialectic_generation_jobs`.
         * `[ ]`   Completion notifications (`contribution_received`, `generation_complete`, `execute_completed` for non-intermediate document-related) fire on the non-continuation path.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it in the relocation node.
         * `[ ]`   The only file outside `dialectic-worker/finalizeContributionJob/` that this node edits is `continueJob/continueJob.interface.ts`, which gains the one-line `BoundContinueJobFn` export.
         * `[ ]`   Cap assembly and final-chunk assembly are conditional: each skips when `shouldRender` is true or when `rootId === params.contribution.id`.
         * `[ ]`   Neither `params` nor `payload` is mutated. `modelProcessingResult` is a local constructed inside the module and mutated only by the continuation-limit-reached branch.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer finalizer: given a saved contribution with persisted relationships, a proven EXECUTE payload, the assembled AI response, the prepared content verdict and the resolved storage identity, dispatch the RENDER job, link the prompt resource, send all lifecycle notifications, handle continuation or completion, assemble the final document when applicable, mark the job completed, and return a status discriminating the three terminal states.
      * `[ ]`   The role is correct because every operation in this module consumes the contribution row produced by `persistContributionRelationships` and the prepared content verdict produced by `prepareResponseContent`, and every downstream notification, continuation, and job-row update depends on both.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not assemble the AI response, sanitize content, resolve contribution identity, upload the contribution, persist relationships, or resolve the finish reason. Those modules ran before this one.
         * `[ ]`   Do not re-guard the payload; the arm guard proved it upstream.
         * `[ ]`   Do not re-derive `isContinuationForStorage` or `storageFileType`; `resolveContributionIdentity` produced them and they arrive in `params`.
         * `[ ]`   Do not build the upload context or call `fileManager.uploadAndRegisterFile`; `saveContributionResponse` owns the upload.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/finalizeContributionJob` — RENDER dispatch, prompt-resource back-link, lifecycle notifications, continuation, final-document assembly, and job-row completion.
      * `[ ]`   Inside boundary:
         * `[ ]`   `stageRelationshipForStage` derivation from `params.contribution.document_relationships` via `isRecord` and `isDocumentRelationships` with the stage-slug lookup.
         * `[ ]`   The document-related validation requiring `stageRelationshipForStage`.
         * `[ ]`   RENDER dispatch: building `EnqueueRenderJobParams` and `EnqueueRenderJobPayload`, calling `deps.enqueueRenderJob`, evaluating the result via `isEnqueueRenderJobSuccessReturn`.
         * `[ ]`   Prompt-resource back-link: `dbClient.from('dialectic_project_resources').update({ source_contribution_id }).eq('id', sourcePromptResourceId)`.
         * `[ ]`   Chunk-completed notification assembly and dispatch.
         * `[ ]`   `ModelProcessingResult` construction and its `status` mutation on the continuation-limit-reached branch.
         * `[ ]`   Continuation path: `deps.continueJob` call, cap assembly (`rootIdForCapAssembly` derivation, `matchedContextForCap` lookup, `deps.fileManager.assembleAndSaveFinalDocument`), continuation notification.
         * `[ ]`   Final-chunk path: chunk-completed notification, final document assembly.
         * `[ ]`   Job-completion update: `dbClient.from('dialectic_generation_jobs').update(...)`.
         * `[ ]`   Completion notifications: `contribution_received`, `generation_complete`, `execute_completed`.
         * `[ ]`   `FinalizeContributionJobDeps`, `FinalizeContributionJobParams`, `FinalizeContributionJobPayload`, both return arms, the return union, the function type, and each owned error class with its constructor-params type.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `DocumentRelationships`, `UnifiedAIResponse`, `ModelProcessingResult`, `ContextForDocument`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `BoundEnqueueRenderJobFn`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, owned by `enqueueRenderJob/enqueueRenderJob.interface.ts`.
         * `[ ]`   `BoundContinueJobFn`, `ContinueJobParams`, `ContinueJobPayload`, `ContinueJobReturn`, owned by `continueJob/continueJob.interface.ts` (the bound form added by this node).
         * `[ ]`   `NotificationServiceType` and its event payload types, owned by `_shared/types/notification.service.types.ts`.
         * `[ ]`   `IFileManager`, owned by `_shared/types/file_manager.types.ts`.
         * `[ ]`   `ILogger`, owned by `_shared/types.ts`.
         * `[ ]`   `FileType`, `ModelContributionFileTypes`, `DialecticStageSlug`, `DocumentRelated`, owned by `_shared/types/file_manager.types.ts`.
         * `[ ]`   `PrepareResponseContentPreparedReturn`, owned by `prepareResponseContent/prepareResponseContent.interface.ts`.
         * `[ ]`   `isDocumentRelated`, `isDialecticStageSlug`, `isFileType`, `isContextForDocument`, owned by `_shared/utils/type-guards/type_guards.file_manager.ts`.
         * `[ ]`   `isDocumentRelationships`, owned by `_shared/utils/type-guards/type_guards.dialectic.ts`; `isRecord`, owned by `_shared/utils/type-guards/type_guards.common.ts`.
         * `[ ]`   `isEnqueueRenderJobSuccessReturn`, owned by `enqueueRenderJob/enqueueRenderJob.guards.ts`.
         * `[ ]`   Who decides `isContinuationForStorage`, who saved the contribution, and what reads the returned status afterwards.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[ ]`   Layer classification: shared adapter interface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: diagnostic logging throughout the module — RENDER skip warnings, continuation diagnostics, job-completion success log. Deps guard checks presence of `warn`, `info`, `error` methods.
      * `[ ]`   Provider: `_shared/types/notification.service.types.ts` (`NotificationServiceType`).
         * `[ ]`   Layer classification: shared adapter interface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: lifecycle event dispatch — `sendJobNotificationEvent`, `sendContributionReceivedEvent`, `sendContributionGenerationCompleteEvent`, `sendContributionGenerationContinuedEvent`. Deps guard checks presence of each used method.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`IFileManager`).
         * `[ ]`   Layer classification: shared adapter interface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: `assembleAndSaveFinalDocument` for cap assembly (continuation-limit-reached) and final-chunk assembly. Deps guard checks presence of `assembleAndSaveFinalDocument` method.
      * `[ ]`   Provider: `enqueueRenderJob/enqueueRenderJob.interface.ts` (`BoundEnqueueRenderJobFn`).
         * `[ ]`   Layer classification: sibling module bound closure.
         * `[ ]`   Direction: inbound from sibling.
         * `[ ]`   Purpose: RENDER dispatch. Deps guard checks `typeof value === 'function'`.
      * `[ ]`   Provider: `continueJob/continueJob.interface.ts` (`BoundContinueJobFn`).
         * `[ ]`   Layer classification: sibling module bound closure.
         * `[ ]`   Direction: inbound from sibling.
         * `[ ]`   Purpose: continuation dispatch. Deps guard checks `typeof value === 'function'`. The type is added to the continueJob interface by this node.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `DocumentRelationships`, `UnifiedAIResponse`, `ModelProcessingResult`, `ContextForDocument`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the payload arm, the rows, the assembled response, the processing result structure, and the context-for-documents lookup type.
      * `[ ]`   Provider: `prepareResponseContent/prepareResponseContent.interface.ts` (`PrepareResponseContentPreparedReturn`).
         * `[ ]`   Layer classification: sibling module return type.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the `needsContinuation`, `resolvedFinishReason`, and `isIntermediate` values this module branches on.
      * `[ ]`   Provider: `enqueueRenderJob/enqueueRenderJob.interface.ts` (`EnqueueRenderJobParams`, `EnqueueRenderJobPayload`).
         * `[ ]`   Layer classification: sibling module contract types.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: typed construction of the RENDER dispatch arguments.
      * `[ ]`   Provider: `_shared/utils/type-guards/type_guards.file_manager.ts` (`isDocumentRelated`, `isDialecticStageSlug`, `isFileType`, `isContextForDocument`).
         * `[ ]`   Layer classification: shared guard surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: document-related branching, stage-slug validation for RENDER, file-type narrowing for RENDER payload, context-for-documents cap lookup.
      * `[ ]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDocumentRelationships`), `_shared/utils/type-guards/type_guards.common.ts` (`isRecord`).
         * `[ ]`   Layer classification: shared guard surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the `stageRelationshipForStage` derivation gate.
      * `[ ]`   Provider: `enqueueRenderJob/enqueueRenderJob.guards.ts` (`isEnqueueRenderJobSuccessReturn`).
         * `[ ]`   Layer classification: sibling module guard.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: discriminating the RENDER dispatch result.
      * `[ ]`   Provider: `types_db.ts` (`Database`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client the three DB operations run against.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticContributionRow`, `invalidateDialecticContributionRow`, `buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildDialecticExecuteJobPayload`, `invalidateDialecticExecuteJobPayload`, `buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`), `_shared/supabase.mock.ts` (`createMockSupabaseClient`), `_shared/utils/notification.service.mock.ts` (`mockNotificationService`), `_shared/services/file_manager.mock.ts` (`createMockFileManagerService`), `_shared/logger.mock.ts` (`MockLogger`), `prepareResponseContent/prepareResponseContent.mock.ts` (`buildPrepareResponseContentPreparedReturn`, `invalidatePrepareResponseContentPreparedReturn`), `enqueueRenderJob/enqueueRenderJob.mock.ts` (`buildEnqueueRenderJobSuccessReturn`), `continueJob/continueJob.mock.ts` (`buildContinueJobEnqueuedReturn`).
         * `[ ]`   Layer classification: shared and sibling test fixture surfaces.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the imported types' fixtures and the injected client/service mocks configured per outcome. Each imported type carries its complete four-symbol family under its production name; none is rebuilt here.
      * `[ ]`   Confirm:
         * `[ ]`   `FinalizeContributionJobDeps` declares exactly `logger`, `notificationService`, `fileManager`, `continueJob` and `enqueueRenderJob`. `dbClient`, `job`, `contribution`, `assembledResponse`, `preparedContentResult`, `storageFileType` and `isContinuationForStorage` are per-invocation params.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From `dialectic-service/dialectic.interface.ts`: the seven named types only, imported with `import type`.
         * `[ ]`   From `enqueueRenderJob/enqueueRenderJob.interface.ts`: `BoundEnqueueRenderJobFn`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, imported with `import type`.
         * `[ ]`   From `continueJob/continueJob.interface.ts`: `BoundContinueJobFn`, `ContinueJobParams`, `ContinueJobPayload`, imported with `import type`.
         * `[ ]`   From `prepareResponseContent/prepareResponseContent.interface.ts`: `PrepareResponseContentPreparedReturn`, imported with `import type`.
         * `[ ]`   From `_shared/types/notification.service.types.ts`: `NotificationServiceType`, imported with `import type`.
         * `[ ]`   From `_shared/types/file_manager.types.ts`: `IFileManager`, `FileType`, `ModelContributionFileTypes`, `DialecticStageSlug`, imported with `import type`.
         * `[ ]`   From `_shared/types.ts`: `ILogger`, imported with `import type`.
         * `[ ]`   From `types_db.ts`: `Database`, imported with `import type`.
         * `[ ]`   From the three guard modules: `isDocumentRelated`, `isDialecticStageSlug`, `isFileType`, `isContextForDocument`, `isDocumentRelationships`, `isRecord`, as value imports.
         * `[ ]`   From `enqueueRenderJob/enqueueRenderJob.guards.ts`: `isEnqueueRenderJobSuccessReturn`, value import.

   * `[ ]`   `finalizeContributionJob.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case proves the deps surface exhaustively: `Record<keyof FinalizeContributionJobDeps, true>` over `logger`, `notificationService`, `fileManager`, `continueJob` and `enqueueRenderJob`, asserting five.
      * `[ ]`   A case proves the params surface exhaustively: `Record<keyof FinalizeContributionJobParams, true>` over `dbClient`, `job`, `contribution`, `assembledResponse`, `preparedContentResult`, `storageFileType` and `isContinuationForStorage`, asserting seven.
      * `[ ]`   A case proves the payload surface exhaustively: `Record<keyof FinalizeContributionJobPayload, true>` over the full `DialecticExecuteJobPayload` member set — `sessionId`, `projectId`, `stageSlug`, `iterationNumber`, `walletId`, `continueUntilComplete`, `maxRetries`, `continuation_count`, `target_contribution_id`, `user_jwt`, `is_test_job`, `model_slug`, `idempotencyKey`, `maxOutputTokens`, `model_id`, `sourceContributionId`, `source_prompt_resource_id`, `prompt_template_id`, `prompt_template_name`, `output_type`, `canonicalPathParams`, `inputs`, `document_key`, `branch_key`, `parallel_group`, `planner_metadata`, `document_relationships`, `isIntermediate` and `context_for_documents`, asserting twenty-nine.
      * `[ ]`   A case proves the success-return surface: `Record<keyof FinalizeContributionJobSuccessReturn, true>` over `status`, asserting one.
      * `[ ]`   A case proves the error-return surface: `Record<keyof FinalizeContributionJobErrorReturn, true>` over `error` and `retriable`, asserting two.
      * `[ ]`   A case proves error-arm membership in the return union: a `FinalizeContributionJobErrorReturn` value constructed with an owned error class assigns to `FinalizeContributionJobReturn`.
      * `[ ]`   A case per owned error proves the surface of its constructor-params type by `Record<keyof …ConstructorParams, true>`: `FinalizeContributionJobDocumentRelatedError` over `jobId`, `contributionId` and `stageSlug` asserting three, `FinalizeContributionJobRenderDispatchError` over `jobId`, `contributionId` and `driverMessage` asserting three, `FinalizeContributionJobPromptLinkError` over `jobId`, `contributionId`, `promptResourceId` and `driverMessage` asserting four, `FinalizeContributionJobDocumentKeyError` over `jobId` and `notificationType` asserting two, `FinalizeContributionJobContinuationError` over `jobId` and `driverMessage` asserting two, `FinalizeContributionJobCompletionUpdateError` over `jobId` and `driverMessage` asserting two.
      * `[ ]`   A case proves the async return type: `ReturnType<FinalizeContributionJobFn>` assigned from `Promise.resolve(errorReturn)`, that assigned to `Promise<FinalizeContributionJobReturn>`, asserted `instanceof Promise`.

   * `[ ]`   `finalizeContributionJob.interface.ts`
      * `[ ]`   `export interface FinalizeContributionJobDeps { logger: ILogger; notificationService: NotificationServiceType; fileManager: IFileManager; continueJob: BoundContinueJobFn; enqueueRenderJob: BoundEnqueueRenderJobFn; }`.
      * `[ ]`   `export interface FinalizeContributionJobParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; contribution: DialecticContributionRow; assembledResponse: UnifiedAIResponse; preparedContentResult: PrepareResponseContentPreparedReturn; storageFileType: FileType; isContinuationForStorage: boolean; }`.
      * `[ ]`   `export type FinalizeContributionJobPayload = DialecticExecuteJobPayload;`
      * `[ ]`   `export interface FinalizeContributionJobSuccessReturn { status: 'completed' | 'needs_continuation' | 'continuation_limit_reached'; }`.
      * `[ ]`   `export type FinalizeContributionJobErrorReturn = { error: Error; retriable: boolean };` — every inhabitant is an owned class extending `Error`.
      * `[ ]`   `export type FinalizeContributionJobReturn = FinalizeContributionJobSuccessReturn | FinalizeContributionJobErrorReturn;` — exactly two arms.
      * `[ ]`   `export type FinalizeContributionJobFn = (deps: FinalizeContributionJobDeps, params: FinalizeContributionJobParams, payload: FinalizeContributionJobPayload) => Promise<FinalizeContributionJobReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking a single typed params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `FinalizeContributionJobDocumentRelatedError { jobId; contributionId; stageSlug }`, `FinalizeContributionJobRenderDispatchError { jobId; contributionId; driverMessage }`, `FinalizeContributionJobPromptLinkError { jobId; contributionId; promptResourceId; driverMessage }`, `FinalizeContributionJobDocumentKeyError { jobId; notificationType }`, `FinalizeContributionJobContinuationError { jobId; driverMessage }`, `FinalizeContributionJobCompletionUpdateError { jobId; driverMessage }`.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `continueJob/continueJob.interface.ts` edit
      * `[ ]`   Add `export type BoundContinueJobFn = (params: ContinueJobParams, payload: ContinueJobPayload) => Promise<ContinueJobReturn>;` — one line, matching the pattern at `enqueueRenderJob/enqueueRenderJob.interface.ts` line 81. No other change to the file.

   * `[ ]`   `finalizeContributionJob.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Derived locals: `projectOwnerUserId` is `typeof params.job.user_id === 'string' ? params.job.user_id : ''`. `stageSlug` is `payload.stageSlug`. `fileType` is `payload.output_type`. `needsContinuation` is `params.preparedContentResult.needsContinuation`. `resolvedFinishReason` is `params.preparedContentResult.resolvedFinishReason`. `isIntermediate` is `params.preparedContentResult.isIntermediate`.
      * `[ ]`   stageRelationshipForStage: when `isRecord(params.contribution.document_relationships)` and `isDocumentRelationships(params.contribution.document_relationships)` hold, find the entry keyed by `stageSlug`; if it is a non-empty string, that is `stageRelationshipForStage`. Otherwise `stageRelationshipForStage` is `undefined`.
      * `[ ]`   Branch, condition `isDocumentRelated(fileType)` and `stageRelationshipForStage` is `undefined` or empty after trim: return the error arm carrying `FinalizeContributionJobDocumentRelatedError` built from `params.job.id`, `params.contribution.id` and `stageSlug`, with `retriable: false`.
      * `[ ]`   RENDER dispatch, condition `!needsContinuation`: read `userJwt` from `payload.user_jwt`. Branch, condition `userJwt` is not a non-empty string: `deps.logger.warn`, skip render. Branch, condition `!isDialecticStageSlug(stageSlug)`: `deps.logger.warn`, skip render. Otherwise: narrow `documentKey` from `payload.document_key` via `isFileType`. Build `EnqueueRenderJobParams` from `params.job.id`, `payload.sessionId`, `stageSlug` (narrowed to `DialecticStageSlug`), `payload.iterationNumber`, `fileType`, `payload.projectId`, `projectOwnerUserId`, `userJwt`, `payload.model_id`, `payload.walletId`, `params.job.is_test_job === true`. Build `EnqueueRenderJobPayload` from `params.contribution.id`, `needsContinuation`, `documentKey`, `stageRelationshipForStage`, `fileType`, `params.storageFileType`. Call `deps.enqueueRenderJob(renderParams, renderPayload)`. Branch, condition the result passes `isEnqueueRenderJobSuccessReturn`: set `shouldRender = renderResult.renderJobId !== null`. Branch, condition the result is the error arm: return error arm carrying `FinalizeContributionJobRenderDispatchError` built from the job id, contribution id and the render error's message, with `retriable: false`.
      * `[ ]`   Prompt-resource back-link, condition `payload.source_prompt_resource_id` is a non-empty string: `params.dbClient.from('dialectic_project_resources').update({ source_contribution_id: params.contribution.id }).eq('id', payload.source_prompt_resource_id)`. Branch, condition the update returned a driver error: return error arm carrying `FinalizeContributionJobPromptLinkError` built from the job id, contribution id, `payload.source_prompt_resource_id` and the driver's message, with `retriable: true`.
      * `[ ]`   Chunk-completed notification, condition `projectOwnerUserId` truthy and `params.isContinuationForStorage` and `isDocumentRelated(fileType)`: read `documentKeyStr` from `payload.document_key`. Branch, condition it is not a non-empty string: return error arm carrying `FinalizeContributionJobDocumentKeyError` built from the job id and `'execute_chunk_completed'`, with `retriable: false`. Otherwise: call `deps.notificationService.sendJobNotificationEvent({ type: 'execute_chunk_completed', sessionId: payload.sessionId, stageSlug, iterationNumber: payload.iterationNumber, job_id: params.job.id, step_key: documentKeyStr, modelId: payload.model_id, document_key: documentKeyStr }, projectOwnerUserId)`.
      * `[ ]`   ModelProcessingResult construction: `{ modelId: payload.model_id, status: needsContinuation ? 'needs_continuation' : 'completed', attempts: (params.job.attempt_count ?? 0) + 1, contributionId: params.contribution.id }`.
      * `[ ]`   Continuation path, condition `needsContinuation`: log diagnostic with `params.assembledResponse.finish_reason`, `payload.continuation_count`, `payload.continueUntilComplete`. Call `deps.continueJob({ dbClient: params.dbClient, projectOwnerUserId }, { job: params.job, savedOutput: params.contribution })`. Branch, condition the result has an `error` property: return error arm carrying `FinalizeContributionJobContinuationError` built from the job id and the error's message, with `retriable: true`. Branch, condition `enqueued === false` and `reason === 'continuation_limit_reached'`: set `modelProcessingResult.status = 'continuation_limit_reached'`. Derive `rootIdForCapAssembly` from `params.contribution.document_relationships[stageSlug]` via `isRecord` and non-empty-string check. Derive `matchedContextForCap` by finding the entry in `payload.context_for_documents` whose `document_key` matches `payload.document_key` via `isContextForDocument`. Condition `rootIdForCapAssembly !== undefined` and `rootIdForCapAssembly !== params.contribution.id` and `!shouldRender`: call `deps.fileManager.assembleAndSaveFinalDocument(rootIdForCapAssembly, matchedContextForCap)`. If `projectOwnerUserId` truthy: call `deps.notificationService.sendContributionGenerationContinuedEvent({ type: 'contribution_generation_continued', sessionId: payload.sessionId, contribution: params.contribution, projectId: payload.projectId, modelId: payload.model_id, continuationNumber: (payload.continuation_count ?? 0) + 1, job_id: params.job.id }, projectOwnerUserId)`.
      * `[ ]`   Final-chunk path, condition `resolvedFinishReason === 'stop'`: if `projectOwnerUserId` truthy and `isDocumentRelated(fileType)`: read `documentKeyStr` from `payload.document_key`. Branch, condition it is not a non-empty string: return error arm carrying `FinalizeContributionJobDocumentKeyError` built from the job id and `'execute_chunk_completed'`, with `retriable: false`. Otherwise: call `deps.notificationService.sendJobNotificationEvent({ type: 'execute_chunk_completed', ... }, projectOwnerUserId)`. Derive `rootIdFromSaved` from `params.contribution.document_relationships[stageSlug]` via `isRecord` and non-empty-string check. Condition `rootIdFromSaved` truthy and `rootIdFromSaved !== params.contribution.id` and `!shouldRender`: call `deps.fileManager.assembleAndSaveFinalDocument(rootIdFromSaved)`.
      * `[ ]`   Job-completion update: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'completed', results: JSON.stringify({ modelProcessingResult }), completed_at: new Date().toISOString(), attempt_count: (params.job.attempt_count ?? 0) + 1 }).eq('id', params.job.id)`. Branch, condition the update returned a driver error: return error arm carrying `FinalizeContributionJobCompletionUpdateError` built from the job id and the driver's message, with `retriable: false`.
      * `[ ]`   Completion notifications, condition `!needsContinuation` and `projectOwnerUserId` truthy: call `deps.notificationService.sendContributionReceivedEvent({ contribution: params.contribution, type: 'dialectic_contribution_received', sessionId: payload.sessionId, job_id: params.job.id, is_continuing: false }, projectOwnerUserId)`. Call `deps.notificationService.sendContributionGenerationCompleteEvent({ type: 'contribution_generation_complete', sessionId: payload.sessionId, projectId: payload.projectId, job_id: params.job.id }, projectOwnerUserId)`. Condition `!isIntermediate` and `isDocumentRelated(fileType)`: read `documentKeyStr` from `payload.document_key`. Branch, condition it is not a non-empty string: return error arm carrying `FinalizeContributionJobDocumentKeyError` built from the job id and `'execute_completed'`, with `retriable: false`. Otherwise: call `deps.notificationService.sendJobNotificationEvent({ type: 'execute_completed', sessionId: payload.sessionId, stageSlug, iterationNumber: payload.iterationNumber, job_id: params.job.id, step_key: documentKeyStr, modelId: payload.model_id, document_key: documentKeyStr }, projectOwnerUserId)`.
      * `[ ]`   Success status derivation: if `needsContinuation` and `modelProcessingResult.status === 'continuation_limit_reached'`, status is `'continuation_limit_reached'`. If `needsContinuation` and status is not `'continuation_limit_reached'`, status is `'needs_continuation'`. Otherwise `'completed'`. Return success arm: `{ status }`.
      * `[ ]`   Ordering and side effects: `shouldRender` is resolved before either assembly call site consults it; `modelProcessingResult.status` is mutated only by the continuation-limit-reached branch before the job-completion update writes it; neither `params` nor `payload` is mutated; `projectOwnerUserId` is derived once and used for every conditional notification dispatch.

   * `[ ]`   `finalizeContributionJob.mock.ts`
      * `[ ]`   `FinalizeContributionJobDepsOverrides`, `buildFinalizeContributionJobDeps`, `FinalizeContributionJobDepsCorruptions` and `invalidateFinalizeContributionJobDeps`; the builder's base `logger` is `new MockLogger()`, `notificationService` is `mockNotificationService` (imported from `_shared/utils/notification.service.mock.ts`), `fileManager` is `createMockFileManagerService()` (imported from `_shared/services/file_manager.mock.ts`). The `continueJob` default is a module-local `const defaultBoundContinueJob: BoundContinueJobFn = async (_params, _payload) => buildContinueJobEnqueuedReturn();` and the `enqueueRenderJob` default is a module-local `const defaultBoundEnqueueRenderJob: BoundEnqueueRenderJobFn = async (_params, _payload) => buildEnqueueRenderJobSuccessReturn();`, each typed by the imported bound function type, following the pattern at `assembleAiResponse.mock.ts` line 20.
      * `[ ]`   `FinalizeContributionJobParamsOverrides`, `buildFinalizeContributionJobParams`, `FinalizeContributionJobParamsCorruptions` and `invalidateFinalizeContributionJobParams`; the builder's base `dbClient` is `createMockSupabaseClient()`'s client, `job` composes `buildDialecticJobRow()`, `contribution` composes `buildDialecticContributionRow()`, `assembledResponse` composes `buildUnifiedAIResponse()`, `preparedContentResult` composes `buildPrepareResponseContentPreparedReturn()`, `storageFileType` defaults to `FileType.ModelContributionRawJson`, `isContinuationForStorage` defaults to `false`.
      * `[ ]`   `FinalizeContributionJobPayloadOverrides`, `buildFinalizeContributionJobPayload`, `FinalizeContributionJobPayloadCorruptions` and `invalidateFinalizeContributionJobPayload`; the builder composes `buildDialecticExecuteJobPayload()` rather than restating that arm's defaults.
      * `[ ]`   The four symbols for `FinalizeContributionJobSuccessReturn`; the builder's base `status` defaults to `'completed'`.
      * `[ ]`   The four symbols for `FinalizeContributionJobErrorReturn`; the builder's `error` composes `buildFinalizeContributionJobDocumentRelatedError()` and `retriable` defaults to `false`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread, no cast. There is no invalidator for any instance.
      * `[ ]`   `mockFinalizeContributionJob: FinalizeContributionJobFn` returning `buildFinalizeContributionJobSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `DialecticJobRow`, `DialecticContributionRow`, `DialecticExecuteJobPayload`, `UnifiedAIResponse` or `PrepareResponseContentPreparedReturn` is written here; all are imported types whose complete four-symbol families live at their home packages, located above.

   * `[ ]`   `finalizeContributionJob.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isFinalizeContributionJobDeps`: accepts the built deps; rejects `logger` absent and non-object; rejects `notificationService` absent and non-object; rejects `fileManager` absent and non-object; rejects `continueJob` absent and non-function; rejects `enqueueRenderJob` absent and non-function; rejects a non-record root.
      * `[ ]`   `isFinalizeContributionJobParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` absent and set to `invalidateDialecticJobRow({ id: 42 })`; rejects `contribution` absent and set to `invalidateDialecticContributionRow({ id: null })`; rejects `assembledResponse` absent and non-record; rejects `preparedContentResult` absent and non-record; rejects `storageFileType` absent and non-string; rejects `isContinuationForStorage` absent and non-boolean; rejects a non-record root.
      * `[ ]`   `isFinalizeContributionJobPayload`: accepts the built payload; rejects each of `prompt_template_id`, `output_type`, `canonicalPathParams` and `inputs` corrupted in turn via `invalidateFinalizeContributionJobPayload`; rejects a non-record root.
      * `[ ]`   `isFinalizeContributionJobSuccessReturn`: accepts the built return; rejects `status` absent, numeric, and a string not in the three-member union; rejects the error return; rejects a non-record root.
      * `[ ]`   `isFinalizeContributionJobErrorReturn`: accepts the built return; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects the success return; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[ ]`   `finalizeContributionJob.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isFinalizeContributionJobDeps`, `isFinalizeContributionJobParams`, `isFinalizeContributionJobPayload`, `isFinalizeContributionJobSuccessReturn`, `isFinalizeContributionJobErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isFinalizeContributionJobDeps` requires `isRecord(value)`, then `typeof value.logger === 'object' && value.logger !== null`, `typeof value.notificationService === 'object' && value.notificationService !== null`, `typeof value.fileManager === 'object' && value.fileManager !== null`, `typeof value.continueJob === 'function'`, `typeof value.enqueueRenderJob === 'function'`.
      * `[ ]`   `isFinalizeContributionJobParams` requires `isRecord(value)`, `isRecord(value.dbClient)`, calls the imported `isDialecticJobRow` on `job`, calls the imported `isDialecticContribution` on `contribution`, `isRecord(value.assembledResponse)`, `isRecord(value.preparedContentResult)`, `isFileType(value.storageFileType)`, `typeof value.isContinuationForStorage === 'boolean'`.
      * `[ ]`   `isFinalizeContributionJobPayload` calls the imported `isDialecticExecuteJobPayload`, catching the per-member diagnostic that guard throws and returning `false`.
      * `[ ]`   `isFinalizeContributionJobSuccessReturn` requires `isRecord(value)`, `typeof value.status === 'string'`, and `value.status` is one of `'completed'`, `'needs_continuation'`, `'continuation_limit_reached'`.
      * `[ ]`   `isFinalizeContributionJobErrorReturn` requires `value.error instanceof Error` and `typeof value.retriable === 'boolean'`. The arms are mutually exclusive.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   No guard is written here for `DialecticExecuteJobPayload`, `DialecticJobRow`, `DialecticContributionRow`, `UnifiedAIResponse` or `PrepareResponseContentPreparedReturn`; none is owned by this interface, and each already has one at its home package.

   * `[ ]`   `finalizeContributionJob.test.ts`
      * `[ ]`   Deps fixtures are `buildFinalizeContributionJobDeps({ ... })` with deps overridden per case. Params are `buildFinalizeContributionJobParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the DB outcome the case turns on. Payload is `buildFinalizeContributionJobPayload({ … })`.
      * `[ ]`   stageRelationshipForStage derivation: a contribution whose `document_relationships` carry a non-empty string at the stage slug yields that value; a contribution with `null` relationships yields `undefined` — the document-related check consumes the result.
      * `[ ]`   Document-related check failure: a document-related `fileType` with no `stageRelationshipForStage` returns the error arm whose error passes `isFinalizeContributionJobDocumentRelatedError`, with `retriable: false`.
      * `[ ]`   RENDER dispatch — success: a non-continuation with valid `user_jwt` and valid `DialecticStageSlug` calls `deps.enqueueRenderJob` with the assembled params and payload, and the result's `renderJobId` not null sets `shouldRender` to true. The render params' `jobId`, `sessionId`, `stageSlug`, `iterationNumber`, `outputType`, `projectId`, `projectOwnerUserId`, `userAuthToken`, `modelId`, `walletId` and `isTestJob` each equal the arranged value, asserted against independent literals.
      * `[ ]`   RENDER dispatch — skip on missing user_jwt: an empty `user_jwt` logs a warning and does not call `deps.enqueueRenderJob`.
      * `[ ]`   RENDER dispatch — skip on invalid stageSlug: a `stageSlug` that fails `isDialecticStageSlug` logs a warning and does not call `deps.enqueueRenderJob`.
      * `[ ]`   RENDER dispatch — error: `deps.enqueueRenderJob` returning its error arm returns this module's error arm whose error passes `isFinalizeContributionJobRenderDispatchError`.
      * `[ ]`   Prompt-resource back-link — success: a non-empty `source_prompt_resource_id` updates `dialectic_project_resources` with `source_contribution_id` equal to `params.contribution.id`, filtered on the resource id.
      * `[ ]`   Prompt-resource back-link — DB failure: the update returning a driver error returns this module's error arm whose error passes `isFinalizeContributionJobPromptLinkError`, carries the driver's message, and is `retriable: true`.
      * `[ ]`   Prompt-resource back-link — skip: an empty or absent `source_prompt_resource_id` does not update `dialectic_project_resources`.
      * `[ ]`   Chunk-completed notification: `isContinuationForStorage` true and `isDocumentRelated(fileType)` true and valid `document_key` fires `sendJobNotificationEvent` with `type: 'execute_chunk_completed'`, `step_key` and `document_key` both equal to the payload's `document_key`.
      * `[ ]`   Chunk-completed — missing document_key: `isContinuationForStorage` true and document-related and `document_key` absent returns the error arm whose error passes `isFinalizeContributionJobDocumentKeyError` with `notificationType: 'execute_chunk_completed'`.
      * `[ ]`   ModelProcessingResult: `status` is `'needs_continuation'` when `needsContinuation` is true, `'completed'` otherwise; `attempts` is `job.attempt_count + 1`; `contributionId` is `params.contribution.id`.
      * `[ ]`   Continuation — continueJob error: `deps.continueJob` returning its error arm returns this module's error arm whose error passes `isFinalizeContributionJobContinuationError`, carries the continuation error's message, and is `retriable: true`.
      * `[ ]`   Continuation — limit reached with cap assembly: `deps.continueJob` returning `{ enqueued: false, reason: 'continuation_limit_reached' }` sets `modelProcessingResult.status` to `'continuation_limit_reached'`; when `rootIdForCapAssembly` is present, differs from `params.contribution.id`, and `shouldRender` is false, calls `deps.fileManager.assembleAndSaveFinalDocument` with the rootId and the matched context.
      * `[ ]`   Continuation — limit reached, cap assembly skipped on shouldRender: when `shouldRender` is true, `assembleAndSaveFinalDocument` is not called.
      * `[ ]`   Continuation — limit reached, cap assembly skipped on rootId equals contribution.id: when `rootIdForCapAssembly === params.contribution.id`, `assembleAndSaveFinalDocument` is not called.
      * `[ ]`   Continuation — notification: `sendContributionGenerationContinuedEvent` called with `continuationNumber` equal to `(payload.continuation_count ?? 0) + 1` and `contribution` equal to `params.contribution`. The continuation count and contribution id are arranged as values distinct from builder defaults.
      * `[ ]`   Final-chunk — notification and assembly: `resolvedFinishReason === 'stop'` with document-related and valid `document_key` fires `execute_chunk_completed` notification; with a valid `rootIdFromSaved` that differs from `contribution.id` and `!shouldRender`, calls `assembleAndSaveFinalDocument` with that rootId.
      * `[ ]`   Final-chunk — assembly skipped on shouldRender: when `shouldRender` is true, `assembleAndSaveFinalDocument` is not called.
      * `[ ]`   Job-completion update — success: `dialectic_generation_jobs` updated with `status: 'completed'`, `results` containing the `modelProcessingResult` as JSON, `completed_at` a non-empty string, `attempt_count` equal to `job.attempt_count + 1`.
      * `[ ]`   Job-completion update — failure: the update returning a driver error returns this module's error arm whose error passes `isFinalizeContributionJobCompletionUpdateError`.
      * `[ ]`   Completion notifications — non-continuation: `sendContributionReceivedEvent` called with `is_continuing: false` and `contribution` equal to `params.contribution`; `sendContributionGenerationCompleteEvent` called with `projectId` equal to `payload.projectId`.
      * `[ ]`   execute_completed notification: non-intermediate, document-related, valid `document_key` fires `sendJobNotificationEvent` with `type: 'execute_completed'`, `step_key` and `document_key` equal to the payload's `document_key`.
      * `[ ]`   execute_completed — missing document_key: returns the error arm whose error passes `isFinalizeContributionJobDocumentKeyError` with `notificationType: 'execute_completed'`.
      * `[ ]`   Success status derivation — completed: `!needsContinuation` returns `{ status: 'completed' }`.
      * `[ ]`   Success status derivation — needs_continuation: `needsContinuation` true and `continueJob` returning `{ enqueued: true }` returns `{ status: 'needs_continuation' }`.
      * `[ ]`   Success status derivation — continuation_limit_reached: `needsContinuation` true and `continueJob` returning limit-reached returns `{ status: 'continuation_limit_reached' }`.
      * `[ ]`   Purity: neither the `params` object nor the `payload` object is mutated by any path.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`; this node constructs nothing at a boundary.

   * `[ ]`   `finalizeContributionJob.ts`
      * `[ ]`   One exported function, typed `FinalizeContributionJobFn`, implementing the interaction spec in its stated order: stageRelationshipForStage derivation, document-related check, RENDER dispatch, prompt-resource back-link, chunk-completed notification, ModelProcessingResult construction, continuation path with cap assembly, final-chunk path with assembly, job-completion update, completion notifications, success status derivation.
      * `[ ]`   Every DB call (`dialectic_project_resources` update, `dialectic_generation_jobs` update), every collaborator call (`deps.continueJob`, `deps.enqueueRenderJob`, `deps.fileManager.assembleAndSaveFinalDocument`), and every notification call is awaited. Every error from a DB call, from `deps.continueJob`, and from `deps.enqueueRenderJob` returns this module's error arm — no error is logged and continued.
      * `[ ]`   `shouldRender` is resolved before either `assembleAndSaveFinalDocument` call site consults it; `modelProcessingResult` is a local object constructed once and mutated only by the continuation-limit-reached branch; each typed local is held in one variable, none is inferred, and none is widened at its use site.
      * `[ ]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed or converted.

   * `[ ]`   `finalizeContributionJob.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[ ]`   `finalizeContributionJob.integration.test.ts`
      * `[ ]`   Chain: `finalizeContributionJob` → real `enqueueRenderJob`. The real `enqueueRenderJob` is constructed with its own real deps (a real `shouldEnqueueRenderJob`, a real `resolveTemplateFilename`, a real logger) and bound to produce a `BoundEnqueueRenderJobFn`. The boundary is the database: `enqueueRenderJob`'s DB calls are mocked via the `dbClient` in params.
      * `[ ]`   The integration proves that the `EnqueueRenderJobParams` and `EnqueueRenderJobPayload` this module constructs from its params and payload are accepted by the real `enqueueRenderJob` and produce the expected result — a `renderJobId` or a validation error — rather than a type error or a structural mismatch masked by a mock.
      * `[ ]`   Mock at the outer boundary only: the `dbClient` (shared between finalizeContributionJob and the real enqueueRenderJob), `notificationService`, `fileManager`, and `continueJob`. Every function inside the integrated chain is real.
      * `[ ]`   A case arranges a non-continuation with a valid `user_jwt`, a valid `DialecticStageSlug`, and a `shouldEnqueueRenderJob` returning `true`, and asserts that the real `enqueueRenderJob` received the params this module built and returned a non-null `renderJobId`.
      * `[ ]`   A case arranges a `shouldEnqueueRenderJob` returning `false` and asserts the real `enqueueRenderJob` returned `renderJobId: null`.
      * `[ ]`   Every block carries the extended header: `Contract`, `Arrange`, `Act`, `Assert`, `Boundary`, `Mocked`.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, sibling module interfaces (`enqueueRenderJob`, `continueJob`, `prepareResponseContent`), and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: this node edits no file outside its own folder except the one-line `BoundContinueJobFn` addition to `continueJob/continueJob.interface.ts`.

   * `[ ]`   `requirements`
      * `[ ]`   The return union has exactly two arms — interface test.
      * `[ ]`   `FinalizeContributionJobDeps` declares exactly five deps — interface test.
      * `[ ]`   `FinalizeContributionJobPayload` is declared equivalent to `DialecticExecuteJobPayload` — interface.
      * `[ ]`   `FinalizeContributionJobSuccessReturn.status` discriminates the three terminal states — interface test.
      * `[ ]`   A document-related type with no `stageRelationshipForStage` returns its own typed error — unit test.
      * `[ ]`   RENDER dispatch failure returns its own typed error instead of logging and continuing — unit test.
      * `[ ]`   RENDER dispatch skipped for missing `user_jwt` or invalid `stageSlug` — unit test.
      * `[ ]`   Prompt-resource back-link DB failure returns its own typed error with `retriable: true` — unit test.
      * `[ ]`   Missing `document_key` for `execute_chunk_completed` and `execute_completed` each return `FinalizeContributionJobDocumentKeyError` — unit test.
      * `[ ]`   `continueJob` error arm returns its own typed error with `retriable: true` — unit test.
      * `[ ]`   `continuation_limit_reached` sets `modelProcessingResult.status` and triggers cap assembly — unit test.
      * `[ ]`   Cap assembly skipped when `shouldRender` is true or when `rootId === contribution.id` — unit test.
      * `[ ]`   Job-completion update DB failure returns its own typed error — unit test.
      * `[ ]`   Success status derives `'completed'`, `'needs_continuation'` or `'continuation_limit_reached'` from the correct conditions — unit test.
      * `[ ]`   The chain of `finalizeContributionJob → real enqueueRenderJob` produces a RENDER dispatch result consistent with the real module's contract — integration test.
      * `[ ]`   Neither `params` nor `payload` is mutated — unit test.

* `[ ]`   supabase/functions/dialectic-worker/saveContributionResponse/saveContributionResponse.ts **[BE] The EXECUTE arm composing identity resolution, the contribution upload, relationship persistence and finalization**

* `[ ]`   supabase/functions/dialectic-worker/saveCompressedResponse/saveCompressedResponse.ts **[BE] The COMPRESS arm: a continuation gate on `shouldContinue` alone for both modes, idempotent `CompressedContextRawJson` persistence, a RENDER dispatch plus `waiting_for_children` for a renderable source, and the extracted `CompressedContext` write for a text source**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveResponse.ts **[BE] The relocation node: a thin orchestrator routing on the row's `job_type` with `SaveResponseDeps` unchanged, `SaveResponseSuccessReturn['status']` gaining `waiting_for_children`, and the monolith body deleted**

* `[ ]`   supabase/functions/netlifyResponse/index.ts **[BE] Assemble no deps: delete the inline `SaveResponseDeps` literal and take every module of this workstream already bound from the worker's deps factory**

## Compression Cutover

* `[ ]`   supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts **[BE] Forward canonical-path lookup per candidate, swapping compressed content into resource documents and history messages without mutating inputs and without a deconstructor dep**

* `[ ]`   supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts **[BE] Inject `applyCompressionOverlay` post-gather with the `stageSlug` and `targetKey` its lookup requires, and tighten `ResourceDocument.type` to `'resource' | 'feedback' | 'system'` across all five push sites**

* `[ ]`   supabase/functions/_shared/utils/vector_utils.ts **[BE] Embedding-free selection: `effectiveScore = candidateTokens × importance`, system-typed documents excluded from the candidate pool, `getEmbedding`/`embeddingClient`/`cosineSimilarity` and this file's `dialectic_memory` query deleted, and the `ICompressionStrategy` seam retired with `CompressionStrategyDeps`/`Params`/`Payload` in favour of `GetSortedCompressionCandidatesFn`**

* `[ ]`   supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts **[BE] Full rewrite as an artifact-existence-driven machine: overlay on entry, reduce check for chunked victims, select and spawn ONE victim with a pending success, recount and return the working set when it fits; the scorer becomes a `CompressPromptDeps` collaborator and `compressionStrategy` leaves the payload; `ragService`, `embeddingClient`, the in-loop `tokenWalletService` debit and this file's `dialectic_memory` query are deleted with their guards, mock defaults and imports**

* `[ ]`   supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts **[BE] Separate affordability from compression — no `compressPrompt` dep, no relayed params, no `compressionStrategy` or `chatApiRequest` payload members, and a two-arm return whose success flavors are within-budget and over-budget — and measure with the real tokenizer, so one ruler serves the preflight, the per-victim target, scoring and chunk sizing**

   * `[ ]`   `objective`
      * `[ ]`   Solve a function that answers two questions, owns a side effect, and measures with the wrong ruler. `calculateAffordability` decides whether a request is affordable and what the output cap is, and then — on the oversized branch — builds `CompressPromptParams` and `CompressPromptPayload`, awaits `deps.compressPrompt`, and reports its result as a `wasCompressed: true` flavor of its own return. Compression spends a wallet, spawns jobs and rewrites a working set; a verdict does none of those. The caller cannot decide what an over-budget request warrants because the decision is already taken inside the callee, which is why the recursion guard a COMPRESS job needs has nowhere to live. Separately, the `tokenizerDeps` literal this function builds counts characters — `getEncoding` returns one index per character and `countTokensAnthropic` returns `text.length` — so every count it takes, and every solver result derived from one, reads high on tiktoken and anthropic models.
      * `[ ]`   Functional goals:
         * `[ ]`   `CalculateAffordabilityDeps` declares `logger`, `countTokens` and `getMaxOutputTokens`, and no `compressPrompt`.
         * `[ ]`   `CalculateAffordabilityParams` declares `jobId`, `walletBalance`, `extendedModelConfig`, `inputRate`, `outputRate` and `userConfig`, and drops `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance`, every one of which exists solely to be relayed into `CompressPromptParams`.
         * `[ ]`   `CalculateAffordabilityPayload` declares `resourceDocuments`, `conversationHistory`, `currentUserPrompt` and `systemInstruction` — the four values the token count reads — and neither `compressionStrategy` nor `chatApiRequest`.
         * `[ ]`   The return has exactly two arms. `CalculateAffordabilitySuccessReturn` is the union of `CalculateAffordabilityWithinBudgetReturn` (`overBudget: false`, `maxOutputTokens`, `resolvedInputTokenCount`) and `CalculateAffordabilityOverBudgetReturn` (`overBudget: true`, `resolvedInputTokenCount`, `finalTargetThreshold`, `balanceAfterCompression`); `CalculateAffordabilityReturn` is `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn`. `wasCompressed`, `CalculateAffordabilityDirectReturn` and `CalculateAffordabilityCompressedReturn` are gone.
         * `[ ]`   The over-budget arm carries the sizing this function's solver computes — `finalTargetThreshold` and `balanceAfterCompression` — because `CompressPromptParams` requires both and no other function computes them.
         * `[ ]`   The function performs no dependency call other than `deps.countTokens` and `deps.getMaxOutputTokens`, and causes no side effect on any branch.
         * `[ ]`   The `tokenizerDeps` literal supplies the real implementations: `getEncoding` narrows its argument with `isKnownTiktokenEncoding` and returns `rawGetEncoding(encodingName)`, throwing `Unsupported tiktoken encoding: ${encodingName}` otherwise, and `countTokensAnthropic` is the imported `countTokens` from the anthropic tokenizer. `logger` stays `deps.logger`.
         * `[ ]`   `calculateAffordability.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Every affordability verdict this function reaches today it reaches unchanged: the same solver, the same cost estimates, the same rationality thresholds, the same NSF and `ContextWindowError` messages and the same `retriable` flags. Only the compression call, the members that fed it, the flavor that reported it and the ruler that measured it change.
         * `[ ]`   `UserConfig`, `TierOutputCapTokens`, `GetMaxOutputTokensFn`, `isUserConfig`, `isTierOutputCapTokens` and `isGetMaxOutputTokensFn` are unchanged, and `calculateAffordability.provides.ts` already re-exports the guard file with `export *`, so `enqueueModelCall.guard.ts`'s import of `isUserConfig` resolves before and after this node.
         * `[ ]`   The function keeps its `(deps, params, payload)` shape and its trusted-form payload; nothing here is guarded on entry.
         * `[ ]`   Consumers outside this module go transiently non-compilable and are not edited here: `prepareModelJob.ts` builds the retired params and payload members and narrows the retired flavors, `prepareModelJob.test.ts` and `prepareModelJob.integration.test.ts` build the retired return builders, `createJobContext.ts` and `dialectic-worker/index.ts` pass `compressPrompt` into this function's deps, and `JobContext.mock.ts` and `createJobContext.test.ts` build an unbound `calculateAffordability` that invokes `deps.compressPrompt`. Each is a support file of the `prepareModelJob` or `createJobContext` node later in this workstream.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer computation: given a working set and a wallet balance, report whether the request fits and is affordable, what output cap it may claim, and — when it does not fit — the input size a compression pass must reach and the balance that survives it.
      * `[ ]`   The role is correct because a verdict is a value, not an action. A function that returns a verdict can be called by an EXECUTE job and a COMPRESS job alike, which is what lets `prepareModelJob` place the recursion guard on the job row's `job_type` instead of on which collaborator it withheld.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not call, import or type `compressPrompt` anywhere in this module.
         * `[ ]`   Do not edit `prepareModelJob.ts` or its suites; the branch that consumes the over-budget arm and calls `compressPrompt` is its own node.
         * `[ ]`   Do not edit `createJobContext.ts`, `dialectic-worker/index.ts`, `JobContext.mock.ts` or `createJobContext.test.ts`; the deps literals that stop carrying `compressPrompt` belong to the `createJobContext` and composition-root nodes.
         * `[ ]`   Do not change the solver, the cost arithmetic, the rationality thresholds or any error message. This node moves a responsibility out and swaps a ruler; it does not re-derive what stays.
         * `[ ]`   Do not add a pending, deferred or queued flavor. This function spawns nothing, so it has nothing to report as pending; `PrepareModelJobPendingReturn` is the caller's.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/calculateAffordability` — preflight token counting, output-cap resolution, cost estimation against a wallet balance, and the input-size target a working set must reach to fit.
      * `[ ]`   Inside boundary:
         * `[ ]`   Whether a request fits the window and is affordable, and at what output cap.
         * `[ ]`   The per-request sizing arithmetic: the solver, the compression cost estimate and the balance that survives it.
         * `[ ]`   Which tokenizer implementations measure this function's one count.
      * `[ ]`   Outside boundary:
         * `[ ]`   What an over-budget request warrants — compression for an EXECUTE job, a hard failure for a COMPRESS job — which is `prepareModelJob`'s decision from the job row's `job_type`.
         * `[ ]`   How a working set is made smaller, owned by `compressPrompt`.
         * `[ ]`   The wallet read and the job row, both of which reach this function as plain values.

   * `[ ]`   `deps`
      * `[ ]`   Removed provider: `compressPrompt` (`BoundCompressPromptFn` from `../compressPrompt/compressPrompt.interface.ts`, `isCompressPromptErrorReturn` from `../compressPrompt/compressPrompt.guard.ts`, `CompressPromptParams`/`CompressPromptPayload` in the implementation, and `buildBoundCompressPromptFn` in the mock).
         * `[ ]`   Layer classification: sibling app-layer module.
         * `[ ]`   Direction: inbound, and closed by this node — no file in this module imports from `compressPrompt` afterwards.
         * `[ ]`   Purpose retired: making the working set fit, which the caller now composes.
      * `[ ]`   Removed provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`), in the interface and the mock; `dialectic-service/dialectic.interface.ts` (`RelevanceRule`); and `npm:@supabase/supabase-js@2` plus `types_db.ts`'s `Database` for the `dbClient` params member, in the interface, the guard and the mock.
         * `[ ]`   Layer classification: shared type surface and external client type.
         * `[ ]`   Direction: inbound, and closed by this node with the members they typed.
         * `[ ]`   Purpose retired: relaying a scorer, a relevance rule set and a database handle to a callee this function no longer has.
      * `[ ]`   Added provider: `npm:js-tiktoken@1.0.7` (`getEncoding as rawGetEncoding`), `npm:@anthropic-ai/tokenizer@0.0.4` (`countTokens as countTokensAnthropic`) and `_shared/utils/type-guards/type_guards.chat.ts` (`isKnownTiktokenEncoding`), in the implementation only.
         * `[ ]`   Layer classification: third-party tokenizer packages and a shared runtime boundary.
         * `[ ]`   Direction: inbound; `dialectic-worker/processJob.ts` already imports all three in this exact form and builds the closure this literal copies.
         * `[ ]`   Purpose: measure the one preflight count with the tokenizer the model actually uses.
      * `[ ]`   Confirm:
         * `[ ]`   The three surviving deps — `logger`, `countTokens`, `getMaxOutputTokens` — keep their types and providers: `ILogger` from `_shared/types.ts`, `CountTokensFn` from `_shared/types/tokenizer.types.ts`, and `GetMaxOutputTokensFn` declared in this interface and implemented by `_shared/utils/affordability_utils.ts`.
         * `[ ]`   No dependency is added to `CalculateAffordabilityDeps`; the tokenizer imports are module-level in the implementation, exactly as they are in `processJob.ts`.
         * `[ ]`   No reverse dependency: neither `compressPrompt` nor `_shared` imports this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From each surviving dep provider: the one function type it supplies, nothing wider.
         * `[ ]`   From each tokenizer package: the one named export the literal calls, nothing wider.

   * `[ ]`   `calculateAffordability.interface.test.ts`
      * `[ ]`   A case proves the deps surface exhaustively: `Record<keyof CalculateAffordabilityDeps, true>` over `logger`, `countTokens`, `getMaxOutputTokens`, asserting three. Exhaustive in both directions, it is the proof `compressPrompt` is not a dep.
      * `[ ]`   A case proves the params surface the same way over `jobId`, `walletBalance`, `extendedModelConfig`, `inputRate`, `outputRate`, `userConfig`, asserting six.
      * `[ ]`   A case proves the payload surface the same way over `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `systemInstruction`, asserting four.
      * `[ ]`   A case proves the two-arm return by typed assignment: a `CalculateAffordabilityWithinBudgetReturn` value and a `CalculateAffordabilityOverBudgetReturn` value each assign to `CalculateAffordabilitySuccessReturn`, that assigns to `CalculateAffordabilityReturn`, and a `CalculateAffordabilityErrorReturn` value assigns to `CalculateAffordabilityReturn` — membership transitive, the flavors nested inside the success arm rather than beside it.
      * `[ ]`   A case proves each flavor's members by typed literal: `overBudget: false` with `maxOutputTokens` and `resolvedInputTokenCount`; `overBudget: true` with `resolvedInputTokenCount`, `finalTargetThreshold` and `balanceAfterCompression`.
      * `[ ]`   A case proves `CalculateAffordabilityFn` and `BoundCalculateAffordabilityFn` accept the narrowed deps, params and payload types and return `Promise<CalculateAffordabilityReturn>`.
      * `[ ]`   Every existing case that names `wasCompressed`, `CalculateAffordabilityDirectReturn`, `CalculateAffordabilityCompressedReturn`, `compressPrompt`, `compressionStrategy`, `chatApiRequest` or a retired params member is restated against the surfaces above; the `UserConfig`, `TierOutputCapTokens` and `GetMaxOutputTokensFn` cases are unchanged. The file imports no builders, its fixtures being typed literals and surface records.

   * `[ ]`   `calculateAffordability.interface.ts`
      * `[ ]`   `CalculateAffordabilityDeps` drops `compressPrompt`, and the `BoundCompressPromptFn` import with it.
      * `[ ]`   `CalculateAffordabilityParams` drops `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance`, and the `SupabaseClient`, `Database` and `RelevanceRule` imports those members required.
      * `[ ]`   `CalculateAffordabilityPayload` drops `compressionStrategy` and `chatApiRequest`, and the `ICompressionStrategy` and `ChatApiRequest` imports with them; `ResourceDocuments` and `Messages` remain imported for the payload.
      * `[ ]`   `CalculateAffordabilityDirectReturn` and `CalculateAffordabilityCompressedReturn` are replaced by `CalculateAffordabilityWithinBudgetReturn { overBudget: false; maxOutputTokens: number; resolvedInputTokenCount: number }` and `CalculateAffordabilityOverBudgetReturn { overBudget: true; resolvedInputTokenCount: number; finalTargetThreshold: number; balanceAfterCompression: number }`.
      * `[ ]`   `CalculateAffordabilitySuccessReturn` is declared as the union of those two, and `CalculateAffordabilityReturn` becomes `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn` — the named two-arm form, with the flavors inside the success arm.
      * `[ ]`   `CalculateAffordabilityErrorReturn`, `UserConfig`, `TierOutputCapTokens`, `GetMaxOutputTokensFn`, `CalculateAffordabilityFn` and `BoundCalculateAffordabilityFn` keep their declarations.

   * `[ ]`   `calculateAffordability.interaction.spec`
      * `[ ]`   Entry: build the `tokenizerDeps` literal from the real tokenizers, filter `payload.conversationHistory` of `function`-role messages, narrow with `isApiChatMessage` and drop null content, assemble the `CountableChatPayload` from `payload.systemInstruction`, `payload.currentUserPrompt`, those messages and `payload.resourceDocuments`, and call `deps.countTokens` once. This is the only count the function takes.
      * `[ ]`   `extendedModelConfig.context_window_tokens` not a number → `{ error: Error("context_window_tokens is not defined"), retriable: false }`.
      * `[ ]`   Within-window branch, selected by `initialTokenCount <= context_window_tokens`, unchanged in every decision: `deps.getMaxOutputTokens(walletBalance, initialTokenCount, config, logger, 0, params.userConfig.tier_output_cap_tokens)` negative → `Insufficient funds to cover the input prompt cost.`, `retriable: false`; `provider_max_input_tokens` not a number → `provider_max_input_tokens is not defined`; `allowedInput <= 0` → `ContextWindowError("No input window remains after reserving output budget (…) and safety buffer (32).")`; `initialTokenCount > allowedInput` → `ContextWindowError("Initial input tokens (…) exceed allowed input (…) after reserving output budget.")`; estimated total cost over balance → `Insufficient funds: estimated total cost (…) exceeds wallet balance (…).`. Otherwise the outcome is `{ overBudget: false, maxOutputTokens: plannedMaxOutputTokens, resolvedInputTokenCount: initialTokenCount }`.
      * `[ ]`   Over-window branch, entered when the count exceeds the window: the rate validations (`isValidInputTokenCostRate`, `isValidOutputTokenCostRate`), the embeddings-inclusive NSF check, the eighty-percent rationality check, the `provider_max_input_tokens` check, the `solveTargetForBalance` solver, the `balanceAfterCompression` positivity check, the feasible-target check, the total-estimated-cost check and the second rationality check all run exactly as they run now and return exactly the errors they return now, with the same messages and `retriable: false`.
      * `[ ]`   Over-window outcome: `{ overBudget: true, resolvedInputTokenCount: initialTokenCount, finalTargetThreshold, balanceAfterCompression }` — the two solver results the caller needs to build `CompressPromptParams`. No dependency beyond `deps.getMaxOutputTokens` is called on this branch, and nothing is spent, written or spawned.
      * `[ ]`   Deleted from this branch: the per-document identity loop over `payload.resourceDocuments` and the `inputsRelevance is required` gate. Both are preconditions of the compression call this node removes, and `compressPrompt` enforces the identity rule at its own entry, so keeping either would reject a request for a member no branch here reads.
      * `[ ]`   The `deps.logger.info` line on this branch is kept and its trailing clause states the verdict this function returns rather than an attempt it no longer makes; the token count, the limit and the job id it reports are unchanged.
      * `[ ]`   Ordering and side effects: one `deps.countTokens` call, `deps.getMaxOutputTokens` called as the branches already call it, no other dependency call, no write, no wallet debit, no job insert, on any path.

   * `[ ]`   `calculateAffordability.mock.ts`
      * `[ ]`   Six owned object types, four symbols each, production-named: `CalculateAffordabilityDeps`, `CalculateAffordabilityParams`, `CalculateAffordabilityPayload`, `CalculateAffordabilityWithinBudgetReturn`, `CalculateAffordabilityOverBudgetReturn`, `CalculateAffordabilityErrorReturn` — `…Overrides` as `Partial<T>`, `build…`, `…Corruptions` as `{ [K in keyof T]?: unknown }`, `invalidate…` returning `unknown` as `{ ...buildX(), ...corruptions }`. `UserConfigOverrides`, `buildUserConfig`, `UserConfigCorruptions` and `invalidateUserConfig` already hold that form and are unchanged.
      * `[ ]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. `buildCalculateAffordabilityParams` loses its positional `dbClient` parameter along with the member itself, and its remaining six defaults are the values it supplies today.
      * `[ ]`   `buildCalculateAffordabilityDeps` defaults `logger` to `new MockLogger()`, `countTokens` to `createMockCountTokens()` and `getMaxOutputTokens` to the real `getMaxOutputTokens` from `_shared/utils/affordability_utils.ts`, and supplies no `compressPrompt`. The `buildBoundCompressPromptFn`, `BoundCompressPromptFn`, `ICompressionStrategy` and `RelevanceRule` imports and the module-level `defaultCompressionStrategy` are deleted.
      * `[ ]`   `buildCalculateAffordabilityPayload` composes this file's own `buildResourceDocument` for its documents and defaults `conversationHistory` to `[]`, `currentUserPrompt` and `systemInstruction` to their existing strings; it returns no `compressionStrategy` and no `chatApiRequest`, and the `buildChatApiRequest` import goes with them. `buildResourceDocument` is imported from `compressPrompt.mock.ts` today, which is the compression module's fixture for a type neither interface owns; it is declared here instead so this mock imports nothing from `compressPrompt`.
      * `[ ]`   `buildCalculateAffordabilityWithinBudgetReturn` and `buildCalculateAffordabilityOverBudgetReturn` replace `buildCalculateAffordabilityDirectReturn` and `buildCalculateAffordabilityCompressedReturn`, each taking one optional overrides object with a default for every member; `buildCalculateAffordabilityErrorReturn` stops taking positional arguments and defaults `error` to `new Error("mock-calculate-affordability-error")` and `retriable` to `false`.
      * `[ ]`   Three function mocks, one per owned function type: `mockCalculateAffordability: CalculateAffordabilityFn` and `mockBoundCalculateAffordability: BoundCalculateAffordabilityFn`, each returning `buildCalculateAffordabilityWithinBudgetReturn()`, and `mockGetMaxOutputTokens: GetMaxOutputTokensFn` returning `0` — identical signatures, no extra parameters, no options and no recording.
      * `[ ]`   Deleted: `buildMockCalculateAffordabilityFn` and `buildMockBoundCalculateAffordabilityFn` with their overload signatures, `MockCalculateAffordabilityFnOptions`, `MockBoundCalculateAffordabilityFnOptions`, `isMockCalculateAffordabilityFnOptions`, `isMockBoundCalculateAffordabilityFnOptions` and `buildMockGetMaxOutputTokens`. Each is a parameterized factory or an options bag; a test needing another outcome declares its own production-typed function composed from these builders.

   * `[ ]`   `calculateAffordability.guard.test.ts`
      * `[ ]`   `isCalculateAffordabilityDeps` case checklist, fixtures from the builder and invalidator: accepts a full deps object; rejects each of `logger`, `countTokens`, `getMaxOutputTokens` absent and each present-but-wrong-typed; rejects non-record roots. A case asserts a deps object carrying no `compressPrompt` is accepted, which is the proof the dep is retired.
      * `[ ]`   `isCalculateAffordabilityParams` case checklist over the six surviving members, absent and wrong-typed each, fixtures from `invalidateCalculateAffordabilityParams`; the four `userConfig` cases stand, restated without the `DbClient(...)` first argument. A case asserts params carrying none of the seven retired members are accepted.
      * `[ ]`   `isCalculateAffordabilityPayload` case checklist over the four surviving members; a case asserts a payload carrying neither `compressionStrategy` nor `chatApiRequest` is accepted.
      * `[ ]`   `isCalculateAffordabilityDirectReturn` and `isCalculateAffordabilityCompressedReturn` cases become `isCalculateAffordabilityWithinBudgetReturn` and `isCalculateAffordabilityOverBudgetReturn` case checklists: each accepts its own built flavor, rejects the other flavor, rejects a built error return, rejects each of its members absent and wrong-typed through its invalidator, and rejects non-record roots.
      * `[ ]`   `isCalculateAffordabilityErrorReturn` keeps its cases, its exclusion assertions restated against the new flavor members — an error return carrying `overBudget`, `maxOutputTokens`, `finalTargetThreshold` or `balanceAfterCompression` is rejected.
      * `[ ]`   `isBoundCalculateAffordabilityFn` takes `mockBoundCalculateAffordability` as its positive fixture; `isCalculateAffordabilityFn` takes `mockCalculateAffordability`; `isGetMaxOutputTokensFn` takes `mockGetMaxOutputTokens`. Their negative assertions are unchanged.
      * `[ ]`   The `isTierOutputCapTokens` and `isUserConfig` checklists are unchanged. The `createMockSupabaseClient` and `DbClient` imports are deleted with the params member they served.

   * `[ ]`   `calculateAffordability.guard.ts`
      * `[ ]`   `isCalculateAffordabilityDeps` deletes its `compressPrompt` check and keeps the other three.
      * `[ ]`   `isCalculateAffordabilityParams` deletes its `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance` checks and keeps `jobId`, `walletBalance`, `extendedModelConfig`, `inputRate`, `outputRate` and its `isUserConfig` call on `userConfig`.
      * `[ ]`   `isCalculateAffordabilityPayload` deletes its `compressionStrategy` and `chatApiRequest` checks and keeps the other four.
      * `[ ]`   `isCalculateAffordabilityDirectReturn` and `isCalculateAffordabilityCompressedReturn` become `isCalculateAffordabilityWithinBudgetReturn` and `isCalculateAffordabilityOverBudgetReturn`, each discriminating on its own `overBudget` literal, checking the numeric type of each of its members, and rejecting a value carrying `error` or `retriable` or the other flavor's distinguishing member.
      * `[ ]`   `isCalculateAffordabilityErrorReturn` keeps its `error` and `retriable` checks, and its exclusion list becomes `overBudget`, `maxOutputTokens`, `resolvedInputTokenCount`, `finalTargetThreshold` and `balanceAfterCompression`.
      * `[ ]`   Every guard keeps its boolean contract; none throws. `isTierOutputCapTokens`, `isUserConfig`, `isGetMaxOutputTokensFn`, `isCalculateAffordabilityFn` and `isBoundCalculateAffordabilityFn` are unchanged.

   * `[ ]`   `calculateAffordability.test.ts`
      * `[ ]`   Every case constructs its deps through `buildCalculateAffordabilityDeps` without a `compressPrompt` override, its params through `buildCalculateAffordabilityParams` with an overrides object and no `DbClient(...)` first argument, and its payload without `compressionStrategy` or `chatApiRequest`. The `createCompressPromptMock` import and every `calls.length` assertion that watched it are deleted, the collaborator they observed no longer being reachable from this function.
      * `[ ]`   The within-window cases — `Non-oversized adequate balance`, `Non-oversized NSF`, `Non-oversized allowedInput <= 0`, the SSOT output-cap case, the estimated-cost NSF case, the `max_tokens_to_generate` case, both `tier_output_cap_tokens` forwarding cases and the `getMaxOutputTokens` invocation case — keep every arrangement and every assertion, with `isCalculateAffordabilityDirectReturn` restated as `isCalculateAffordabilityWithinBudgetReturn`.
      * `[ ]`   `Oversized: compressPrompt called with finalTargetThreshold, balanceAfterCompression, walletBalance; compressed return on success` becomes an over-budget verdict case: the same oversized arrangement, asserting `isCalculateAffordabilityOverBudgetReturn`, that `finalTargetThreshold` and `balanceAfterCompression` carry the values the case asserts today at the compress call, and that `resolvedInputTokenCount` is the initial count. Its title states the verdict rather than the call.
      * `[ ]`   `Oversized: compressPrompt error propagated; error return` is deleted: there is no collaborator to propagate from, and no other case's coverage depends on it.
      * `[ ]`   Every oversized error case — NSF including embeddings, both eighty-percent rationality cases, `balanceAfterCompression <= 0`, infeasible solver target, total estimated cost exceeds balance — keeps its arrangement, its error type, its message assertion and its `retriable` flag. The two whose titles end `compressPrompt not called` keep their error assertions and lose that clause.
      * `[ ]`   Cases are added for the two branches this node deletes, proving the removals are behavioral and not silent: an oversized request whose documents carry no `document_key`, `type` or `stage_slug` returns the over-budget verdict rather than an identity error; an oversized request whose params carry no `inputsRelevance` returns the over-budget verdict rather than an `inputsRelevance is required` error.
      * `[ ]`   A case asserts the function calls `deps.countTokens` exactly once and reaches no other collaborator on the over-budget path, spy applied at the call site.
      * `[ ]`   Each case supplies its own `countTokens` through the builder, so the real tokenizer the implementation now constructs does not enter this tier; any expectation computed from character arithmetic against the retired inline tokenizer is recomputed against the injected count rather than re-stubbed.

   * `[ ]`   `calculateAffordability.ts`
      * `[ ]`   The `compressParams` and `compressPayload` literals, the `await deps.compressPrompt(...)` call, the `isCompressPromptErrorReturn` branch and the `wasCompressed: true` success construction are deleted, with the `isCompressPromptErrorReturn`, `CompressPromptParams` and `CompressPromptPayload` imports.
      * `[ ]`   The `tokenizerDeps` literal's `getEncoding` becomes the closure that throws `Unsupported tiktoken encoding: ${encodingName}` when `isKnownTiktokenEncoding` rejects the name and returns `rawGetEncoding(encodingName)` otherwise, and its `countTokensAnthropic` becomes the imported anthropic `countTokens`; `logger` stays `deps.logger`. The three imports are added at module level in the form `processJob.ts` already uses.
      * `[ ]`   The over-window branch ends by returning `{ overBudget: true, resolvedInputTokenCount: initialTokenCount, finalTargetThreshold, balanceAfterCompression }`, typed as `CalculateAffordabilityOverBudgetReturn`.
      * `[ ]`   The within-window branch's return becomes `{ overBudget: false, maxOutputTokens: plannedMaxOutputTokens, resolvedInputTokenCount: initialTokenCount }`, typed as `CalculateAffordabilityWithinBudgetReturn`.
      * `[ ]`   The document-identity loop and the `inputsRelevance is required` gate are deleted, along with the `inputsRelevance` local they produced.
      * `[ ]`   The `deps.logger.info` line keeps its job id, token count and limit and states the over-budget verdict in place of `Attempting compression.`
      * `[ ]`   Everything else is unchanged: the message filtering, the single `deps.countTokens` call, both `context_window_tokens` checks, every `getMaxOutputTokens` call and its arguments, `getAllowedInputFor`, `solveTargetForBalance`, every cost and rationality computation, and every error type, message and `retriable` flag.
      * `[ ]`   The unreachable `maxTokens === undefined` block that follows the within-window return is left exactly as it stands; removing dead code is not this node's work.

   * `[ ]`   `calculateAffordability.integration.test.ts`
      * `[ ]`   The three non-oversized cases — direct return with real config and real `countTokens`, NSF, and the binding `tierOutputCapTokens=32768` cap — keep every arrangement and assertion, with `isCalculateAffordabilityDirectReturn` restated as `isCalculateAffordabilityWithinBudgetReturn`. Their `BoundCompressPromptFn` locals that throw when called are deleted along with the dep they guarded.
      * `[ ]`   The `oversized path with real compressPrompt` block, which wires the real `compressPrompt` with `MockRagService` and a real `EmbeddingClient` through this function's deps, is replaced by an over-budget verdict case over the same real config, real `countTokens` and real project fixture: an oversized working set returns `isCalculateAffordabilityOverBudgetReturn` carrying a `finalTargetThreshold` at or below the window and a positive `balanceAfterCompression`, and no RAG or wallet collaborator is constructed at all.
      * `[ ]`   The provider-to-consumer chain that block proved — affordability verdict through real compression to a rewritten working set — is `prepareModelJob`'s to prove once it composes the two, and its node carries the integration test that does so. This suite keeps only what crosses this function's own boundary.
      * `[ ]`   The suite continues to mock only Supabase, and the `compressPrompt`, `CompressPromptDeps`, `BoundCompressPromptFn`, `ICompressionStrategy`, `CompressionCandidate`, `MockRagService`, `EmbeddingClient`, `getMockAiProviderAdapter`, `UserTokenWalletService` and `AdminTokenWalletService` imports are deleted.
      * `[ ]`   Each surviving case's expected token counts are recomputed against the real tokenizer the implementation now builds, rather than against the character-counting literal it retired.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module drops its imports of `compressPrompt`'s interface, guard and mock, of `ICompressionStrategy`, of `RelevanceRule` and of the Supabase client types, and adds only the two tokenizer packages and the shared encoding guard the implementation calls.
      * `[ ]`   `calculateAffordability.provides.ts` re-exports this module's implementation, interface, guard and mock with `export *` and `export type *`, so the renamed flavors, the new guards and the new mock symbols reach consumers without an edit to that file, and the retired ones leave it the moment they leave their source. `isUserConfig` reaches `enqueueModelCall.guard.ts` through that same surface, unchanged.
      * `[ ]`   No cycle: `compressPrompt` imports nothing from this module, and after this node neither imports the other.

   * `[ ]`   `requirements`
      * `[ ]`   `CalculateAffordabilityDeps` declares three members and `compressPrompt` is not among them — interface test, exhaustive key record.
      * `[ ]`   `CalculateAffordabilityParams` declares six members and `CalculateAffordabilityPayload` four, with every relayed member absent — interface test, exhaustive key records.
      * `[ ]`   `CalculateAffordabilityReturn` has exactly two arms, and both success flavors are members of `CalculateAffordabilitySuccessReturn` — interface test, typed assignment.
      * `[ ]`   An over-window request returns `overBudget: true` carrying the solver's `finalTargetThreshold` and `balanceAfterCompression` and the initial token count — unit test and integration test.
      * `[ ]`   A within-window request returns `overBudget: false` carrying the same `maxOutputTokens` and `resolvedInputTokenCount` it returns today — unit test, existing cases restated.
      * `[ ]`   Every existing affordability error — both `context_window_tokens` checks, `provider_max_input_tokens`, both `ContextWindowError` window checks, every NSF check, both rationality checks and the infeasible-target check — returns exactly the error and flag it returns now — unit test, existing cases unchanged.
      * `[ ]`   An oversized request with unidentified documents, and one with no `inputsRelevance`, each return the over-budget verdict rather than an error — unit test.
      * `[ ]`   The function calls no collaborator other than `deps.countTokens` and `deps.getMaxOutputTokens`, and performs no write on any path — unit test.
      * `[ ]`   A fixed string counted through the implementation's own `tokenizerDeps` on a `cl100k_base` model yields the tiktoken count rather than its character length — integration test.
      * `[ ]`   Every owned object type has a `Partial<T>`-overrides builder and an `unknown`-returning invalidator, and each owned function type has a function mock that is that type exactly — guard test, whose fixtures are drawn from them.

* `[ ]`   supabase/functions/chat/streamChat/StreamChat.ts **[BE] Replace the character-indexing `getEncoding` and `text.length` `countTokensAnthropic` with the real implementations behind `tokensRequiredForStreaming`**

* `[ ]`   supabase/functions/chat/streamRewind/streamRewind.ts **[BE] The same replacement behind `tokensRequiredForRewind`, after which no production source constructs a character-indexing tokenizer**

* `[ ]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts **[BE] Become the single model-call dispatcher: narrow with the base guard, compose `calculateAffordability` with `compressPrompt`, branch the recursion guard on the row's `job_type`, drop `sessionData`/`authToken` and `compressionStrategy`, write `source_prompt_resource_id` onto the job payload before enqueue, thread `parentJob`, `projectId`, `iterationNumber` and `targetKey` into `CompressPromptParams` on the EXECUTE branch, and propagate the deferral as `PrepareModelJobPendingReturn`**

   * `[ ]`   `objective`
      * `[ ]`   Solve a dispatcher that only dispatches for one job type. Every model call the repo makes should resolve the same tier cap from `user_subscriptions`, read the same wallet balance and pass the same affordability preflight, and today only an EXECUTE job reaches that path: `processCompressJob` builds its own `ChatApiRequest`, counts its own preflight tokens and calls `enqueueModelCall` itself, so a COMPRESS call is governed by neither the tier cap nor the wallet check. Compression, affordability and dispatch are also fused — the over-budget remedy is taken inside `calculateAffordability`, which is why decision one's recursion guard has nowhere to sit except in whichever collaborator a caller withholds.
      * `[ ]`   Functional goals:
         * `[ ]`   `job.payload` is narrowed by `isDialecticBaseJobPayload`, and every member this function reads is a base member: `sessionId`, `projectId`, `model_id`, `walletId`, `stageSlug`, `iterationNumber`, `user_jwt`, `maxOutputTokens`, `continueUntilComplete` and `target_contribution_id`.
         * `[ ]`   `PrepareModelJobParams` declares `dbClient`, `job`, `projectOwnerUserId` and `providerRow`, and neither `sessionData` nor `authToken`; `isPrepareModelJobParams` checks neither.
         * `[ ]`   `PrepareModelJobPayload` declares `promptConstructionPayload`, `inputsRelevance?` and `inputsRequired?`, and no `compressionStrategy`; `isPrepareModelJobPayload` checks none.
         * `[ ]`   `PrepareModelJobDeps` gains `compressPrompt: BoundCompressPromptFn` beside `calculateAffordability`, so this function composes the two rather than letting one own the other.
         * `[ ]`   The return has exactly two arms. `PrepareModelJobSuccessReturn` is the union of `PrepareModelJobQueuedReturn { queued: true }` and `PrepareModelJobPendingReturn { waiting_for_children: true }`; `PrepareModelJobReturn` is that arm plus `PrepareModelJobErrorReturn`.
         * `[ ]`   On an over-budget verdict the function branches on the job row's `job_type`: `'EXECUTE'` calls `deps.compressPrompt` and returns the pending flavor; `'COMPRESS'` returns a non-retriable error naming the recursion guard, and calls no collaborator.
         * `[ ]`   Nothing passed to `deps.enqueueModelCall` names an artifact type, that parameter having left `EnqueueModelCallParams`.
         * `[ ]`   After affordability resolves within budget and before the enqueue, the function writes `source_prompt_resource_id` from `payload.promptConstructionPayload` onto the job row's own payload, and omits it from `ChatApiRequest`. A failed write returns the error arm.
         * `[ ]`   `prepareModelJob.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   The tier-cap read, the effective-cap arithmetic over `maxOutputTokens`, the provider-config validation, the resource-document scoping and the `inputsRequired` enforcement keep their current behavior, messages and log lines.
         * `[ ]`   The wallet read through `deps.tokenWalletService.getBalance`, `deps.validateWalletBalance` and `deps.validateModelCostRates` run exactly where and as they run now, for every job type.
         * `[ ]`   Every existing error message, `retriable` flag and thrown-then-caught path keeps its text and classification except where this node deletes the branch that raised it.
         * `[ ]`   The function keeps its `(deps, params, payload)` shape. `job.payload` arrives as row data and is narrowed on entry by the base guard, which throws its own per-member diagnostic; the surrounding `try` converts that throw to the error arm as it already does for every other throw in this body.
         * `[ ]`   Consumers outside this module go transiently non-compilable and are not edited here: `processSimpleJob.ts` builds the retired params and payload members, `createJobContext.ts` and `dialectic-worker/index.ts` build `PrepareModelJobDeps` without `compressPrompt`, and `JobContext.interface.ts`'s `IPrepareModelJobContext` carries the members those roots slice. Each belongs to the `processSimpleJob`, `createJobContext` or composition-root node later in this workstream.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test, inputsRequired test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer dispatch: given a job row and an assembled prompt, resolve the caps and the money, decide what an over-budget request warrants from what kind of job it is, and hand exactly one model call to the transport.
      * `[ ]`   The role is correct because this is the one place that holds both the job row and the assembled prompt. The row carries `job_type`, which is the authoritative record of what a job is, so the recursion guard is a branch on a fact rather than an inference from a missing collaborator — and every model call passing through one function is what makes the tier cap, the wallet read and the affordability preflight single-sourced.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not decide whether a request is affordable; `calculateAffordability` returns that verdict and this function composes it.
         * `[ ]`   Do not select victims, size chunks, spawn COMPRESS children or set the parent's status; `compressPrompt` owns all of it, and this function propagates its outcome.
         * `[ ]`   Do not name an artifact type at dispatch, reintroduce `output_type` in any form, or decide what the response becomes; that is `saveResponse`'s from the row's `job_type`.
         * `[ ]`   Do not edit `processSimpleJob.ts`, `createJobContext.ts`, `JobContext.interface.ts` or `dialectic-worker/index.ts`; each has its own node.
         * `[ ]`   Do not change the tier-cap query, the cap arithmetic, the document scoping or the `inputsRequired` rules.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/prepareModelJob` — cap resolution, wallet and rate resolution, the affordability composition, the over-budget branch, the prompt-provenance write, and the single call to the model-call transport.
      * `[ ]`   Inside boundary:
         * `[ ]`   What every model call must satisfy before it is dispatched, for every job type.
         * `[ ]`   What an over-budget request warrants, read from the job row's `job_type`.
         * `[ ]`   Which prompt produced the call, recorded on the job row before the call is made.
      * `[ ]`   Outside boundary:
         * `[ ]`   The affordability arithmetic, owned by `calculateAffordability`.
         * `[ ]`   The compression machine, owned by `compressPrompt`.
         * `[ ]`   The queue POST and the row's `queued` status, owned by `enqueueModelCall`.
         * `[ ]`   What the response becomes, owned by `saveResponse`.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../compressPrompt/compressPrompt.interface.ts` (`BoundCompressPromptFn`), and `../compressPrompt/compressPrompt.guard.ts` (`isCompressPromptErrorReturn`) plus `CompressPromptParams`/`CompressPromptPayload` in the implementation.
         * `[ ]`   Layer classification: sibling app-layer module.
         * `[ ]`   Direction: inbound, and new to this file — the edge moves here from `calculateAffordability`, which closed it in the node above, so the repo gains no edge it did not have.
         * `[ ]`   Purpose: make an over-budget EXECUTE working set fit, as a deferral this function propagates.
      * `[ ]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticBaseJobPayload`).
         * `[ ]`   Layer classification: shared runtime boundary.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: narrow the row's payload once, with the one guard family, and surface its per-member diagnostic on failure.
      * `[ ]`   Removed provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`) and `dialectic-service/dialectic.interface.ts` (`DialecticSessionRow`), both in the interface, the guard and the mock, with the members they typed.
      * `[ ]`   Confirm:
         * `[ ]`   `calculateAffordability` stays on deps and is called on every path; `enqueueModelCall`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `applyInputsRequiredScope` and `logger` are unchanged.
         * `[ ]`   `isDialecticExecuteJobPayload` leaves this file: the base guard replaces it, and no EXECUTE-specific member is read.
         * `[ ]`   No reverse dependency: neither `compressPrompt` nor `calculateAffordability` imports this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From `compressPrompt`: the bound function type and its error-return guard only.
         * `[ ]`   From the shared guard module: the base payload guard only.

   * `[ ]`   `prepareModelJob.interface.test.ts`
      * `[ ]`   A case proves the deps surface exhaustively: `Record<keyof PrepareModelJobDeps, true>` over `logger`, `applyInputsRequiredScope`, `tokenWalletService`, `validateWalletBalance`, `validateModelCostRates`, `calculateAffordability`, `enqueueModelCall`, `compressPrompt`, asserting eight.
      * `[ ]`   A case proves the params surface the same way over `dbClient`, `job`, `projectOwnerUserId`, `providerRow`, asserting four — exhaustive in both directions, it is the proof `authToken` and `sessionData` are gone.
      * `[ ]`   The existing payload key case declares `promptConstructionPayload`, `inputsRelevance` and `inputsRequired` and asserts three, proving `compressionStrategy` is not a member.
      * `[ ]`   A case proves the two-arm return by typed assignment: a `PrepareModelJobQueuedReturn` value and a `PrepareModelJobPendingReturn` value each assign to `PrepareModelJobSuccessReturn`, that assigns to `PrepareModelJobReturn`, and a `PrepareModelJobErrorReturn` value assigns to `PrepareModelJobReturn`.
      * `[ ]`   A case proves each flavor's members by typed literal: `{ queued: true }` and `{ waiting_for_children: true }`, neither carrying the other's discriminant.
      * `[ ]`   A case proves `PrepareModelJobFn` accepts the narrowed deps, params and payload and returns `Promise<PrepareModelJobReturn>`; the `PrepareModelJobExecutionError` case is unchanged.

   * `[ ]`   `prepareModelJob.interface.ts`
      * `[ ]`   `PrepareModelJobDeps` gains `compressPrompt: BoundCompressPromptFn`, imported from `../compressPrompt/compressPrompt.interface.ts`.
      * `[ ]`   `PrepareModelJobParams` drops `authToken` and `sessionData`, and the `DialecticSessionRow` import with the latter.
      * `[ ]`   `PrepareModelJobPayload` drops `compressionStrategy`, and the `ICompressionStrategy` import with it.
      * `[ ]`   `PrepareModelJobSuccessReturn` becomes the union of `PrepareModelJobQueuedReturn { queued: true }` and `PrepareModelJobPendingReturn { waiting_for_children: true }`, both declared here; `PrepareModelJobReturn` is `PrepareModelJobSuccessReturn | PrepareModelJobErrorReturn`.
      * `[ ]`   `PrepareModelJobErrorReturn`, `PrepareModelJobFn` and `PrepareModelJobExecutionError` are unchanged.

   * `[ ]`   `prepareModelJob.interaction.spec`
      * `[ ]`   Entry, unchanged: the `user_subscriptions` → `tier_definitions(output_cap_tokens)` read for `params.projectOwnerUserId`. A Postgrest error → log `[prepareModelJob] Failed to load tier output cap` and return `{ error: pgErr, retriable: true }`.
      * `[ ]`   Cap resolution, unchanged: the tier cap and `job.payload.maxOutputTokens` combine by `Math.min` when both are present, the user value stands when the tier cap is null, and the result becomes `userConfig.tier_output_cap_tokens`, logged as it is now.
      * `[ ]`   Payload narrowing: `isDialecticBaseJobPayload(job.payload)`. It throws a per-member diagnostic, which the enclosing `try` converts to `{ error, retriable: false }`; the hand-thrown `Job … does not have a valid 'execute' payload.` is deleted, as is the `Object.getOwnPropertyDescriptor` read of `user_jwt` and its `payload.user_jwt required` throw — the base guard proves that member, so the narrowed value is read directly.
      * `[ ]`   Member validations, unchanged in outcome: absent or blank `stageSlug`, `walletId`, `iterationNumber`, `projectId`, `sessionId` and `model_id` each throw their existing message and reach the error arm through the same `try`.
      * `[ ]`   Provider config: `isAiModelExtendedConfig(providerRow.config)` false → `Model … has invalid or missing configuration.`; otherwise `model_id` is stamped onto the config as it is now.
      * `[ ]`   Document scoping, unchanged: each `promptConstructionPayload.resourceDocuments` entry is checked with `isResourceDocument`, `deps.applyInputsRequiredScope` scopes them, and each required `inputsRequired` rule with a `document_key` must match a scoped document by `type`, `slug` and `document_key` or throw its existing message.
      * `[ ]`   Wallet and rates, unchanged: `deps.tokenWalletService.getBalance(walletId)` through `deps.validateWalletBalance`, then `deps.validateModelCostRates` over the config's two rates.
      * `[ ]`   Affordability: `deps.calculateAffordability` is called once with the six params members it now declares and the four payload members it now declares. An error return → propagate `{ error, retriable }` unchanged.
      * `[ ]`   Over-budget branch, selected by the affordability success flavor's `overBudget: true`, then by `params.job.job_type`:
         * `[ ]`   `'COMPRESS'` → return `{ error: <ProcessCompressJob-facing Error naming the recursion guard, the job id and the resolved input token count>, retriable: false }`. No collaborator is called, nothing is written, and the job fails rather than compressing, per decision one.
         * `[ ]`   `'EXECUTE'` → build `CompressPromptParams` from the job row and the affordability arm — `dbClient`, `jobId`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `extendedModelConfig`, `inputsRelevance` from `payload.inputsRelevance`, `inputRate`, `outputRate`, `isContinuationFlowInitial`, `finalTargetThreshold`, `balanceAfterCompression`, `walletBalance`, and the four identity members that function's own node adds: `parentJob` from `params.job`, `projectId` and `iterationNumber` from the narrowed payload, and `targetKey` from the EXECUTE payload's `output_type`, which is the schema this job produces and therefore the compression target. Reading `output_type` narrows the payload to `DialecticExecuteJobPayload` inside this branch, one concrete guarded type held in the branch that needs it; the COMPRESS branch never reaches `compressPrompt` and narrows nothing further. Build `CompressPromptPayload` from `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, the base `ChatApiRequest` and a `tokenizerDeps` literal built from the real tokenizers — `isKnownTiktokenEncoding` narrowing into `rawGetEncoding`, and the anthropic `countTokens` — the same construction `processJob.ts` already holds, so this branch introduces no fourth character-counting tokenizer. It carries no `compressionStrategy`: the scorer is `compressPrompt`'s own dep as of that function's node, and no collaborator is relayed through this one as data. Call `deps.compressPrompt` once.
         * `[ ]`   `isCompressPromptErrorReturn` → propagate `{ error, retriable }` unchanged.
         * `[ ]`   Otherwise → return `{ waiting_for_children: true }`. The dispatcher enqueues nothing on this branch: the parent job is waiting on its COMPRESS children, and the completion trigger runs this function again over the overlaid working set. Nothing the compression call returns is read.
      * `[ ]`   Within-budget branch, selected by `overBudget: false`: `chatApiRequest` is the base request plus `max_tokens_to_generate: affordResult.maxOutputTokens`, and `resolvedInputTokenCount` is the arm's own count.
      * `[ ]`   Provenance write, on the within-budget branch only, after affordability and before the enqueue: update this job row's `payload` with `source_prompt_resource_id` from `payload.promptConstructionPayload.source_prompt_resource_id`, keyed on `params.job.id`. A Postgrest error → `{ error, retriable: true }`. The value is not placed on `ChatApiRequest`: the provider can do nothing with it, and the thread it belongs to is internal.
      * `[ ]`   Dispatch: build `EnqueueModelCallParams` from `dbClient`, `job`, `providerRow`, the narrowed payload's `user_jwt` as `userAuthToken`, and `userConfig` — no artifact type — and call `deps.enqueueModelCall` with `{ chatApiRequest, preflightInputTokens: resolvedInputTokenCount }`. An error return → propagate unchanged. Otherwise → `{ queued: true }`.
      * `[ ]`   Ordering and side effects: one tier-cap read, one wallet read, one affordability call, at most one compression call, at most one provenance write, at most one enqueue. The COMPRESS recursion guard and every validation failure write nothing. The provenance write never happens on a path that does not enqueue.
      * `[ ]`   The enclosing `try`/`catch` keeps its shape: any throw becomes `{ error, retriable: false }`.

   * `[ ]`   `prepareModelJob.mock.ts`
      * `[ ]`   Five owned object types, four symbols each, production-named: `PrepareModelJobDepsOverrides` / `buildPrepareModelJobDeps` / `PrepareModelJobDepsCorruptions` / `invalidatePrepareModelJobDeps`, and the same quartet for `PrepareModelJobParams`, `PrepareModelJobPayload`, `PrepareModelJobQueuedReturn` and `PrepareModelJobPendingReturn`, plus `PrepareModelJobErrorReturn`. Overrides types are `Partial<T>`, corruption types are `{ [K in keyof T]?: unknown }`, invalidators return `unknown`.
      * `[ ]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. `buildPrepareModelJobDeps` defaults `compressPrompt` to `mockBoundCompressPrompt` from the `compressPrompt` module's mock and `calculateAffordability` to `mockBoundCalculateAffordability` from that module's mock — imported builders for imported types, never re-declared here.
      * `[ ]`   `buildPrepareModelJobParams` supplies `dbClient`, `job`, `projectOwnerUserId` and `providerRow` only; its `authToken` and `sessionData` defaults go with the members. `buildPrepareModelJobPayload` supplies `promptConstructionPayload` and no `compressionStrategy`.
      * `[ ]`   One function mock for the owned function type: `mockPrepareModelJob: PrepareModelJobFn`, returning `buildPrepareModelJobQueuedReturn()`, with an identical signature, no options and no recording.
      * `[ ]`   Deleted: `mockPrepareModelJobFn` with `MockPrepareModelJobFnOptions` and `MockPrepareModelJobFnCall`, a configurable harness with call recording. A test needing another outcome declares its own `PrepareModelJobFn` composed from these builders.
      * `[ ]`   Retained as they stand: `mockDialecticExecuteJobPayload`, `mockDialecticJobRow`, `mockDialecticSessionRow`, `mockPromptConstructionPayload`, `mockTokenWalletRow` and `mockDialecticContributionRow`. Every one builds a type this interface does not own; their home packages carry no builder for them, and relocating them is another module's node.

   * `[ ]`   `prepareModelJob.guard.test.ts`
      * `[ ]`   `isPrepareModelJobParams` case checklist over the four surviving members, absent and wrong-typed each, fixtures from `invalidatePrepareModelJobParams`; a case asserts params carrying neither `authToken` nor `sessionData` are accepted.
      * `[ ]`   `isPrepareModelJobPayload` case checklist over `promptConstructionPayload` and both optional rule arrays; a case asserts a payload carrying no `compressionStrategy` is accepted.
      * `[ ]`   `isPrepareModelJobDeps` gains `compressPrompt` to its checklist: absent and non-function each rejected, present and callable accepted.
      * `[ ]`   `isPrepareModelJobSuccessReturn` becomes a checklist over both flavors: accepts `{ queued: true }`, accepts `{ waiting_for_children: true }`, rejects a built error return and rejects a record carrying neither discriminant. Per-flavor guards `isPrepareModelJobQueuedReturn` and `isPrepareModelJobPendingReturn` each accept their own flavor and reject the other.
      * `[ ]`   `isPrepareModelJobErrorReturn` keeps its cases, its exclusion assertions extended to `waiting_for_children`.

   * `[ ]`   `prepareModelJob.guard.ts`
      * `[ ]`   `isPrepareModelJobParams` drops `authToken` and `sessionData` from its key list and drops both member checks, keeping `dbClient`, `job`, `projectOwnerUserId` and `providerRow` and their existing checks; the `isDialecticSessionRow` import goes with them.
      * `[ ]`   `isPrepareModelJobPayload` drops `compressionStrategy` from its presence pair and drops its function check, keeping the `isPromptConstructionPayloadShape` check and both optional rule-array checks.
      * `[ ]`   `isPrepareModelJobDeps` gains a `compressPrompt` presence-and-function check beside `calculateAffordability`.
      * `[ ]`   `isPrepareModelJobQueuedReturn` and `isPrepareModelJobPendingReturn` are added, each discriminating on its own literal member and rejecting the other's; `isPrepareModelJobSuccessReturn` returns true for either flavor and false otherwise.
      * `[ ]`   `isPrepareModelJobErrorReturn` extends its exclusion list with `waiting_for_children`; every guard keeps its boolean contract.

   * `[ ]`   `prepareModelJob.test.ts`
      * `[ ]`   Every case builds deps through `buildPrepareModelJobDeps`, params without `authToken` or `sessionData`, and payload without `compressionStrategy`; the `contractCompressionStrategy` local and its thirty-odd payload literals are deleted.
      * `[ ]`   The affordability composition cases are restated against the new arms: a within-budget verdict enqueues with `max_tokens_to_generate` from `maxOutputTokens` and returns `{ queued: true }`; an affordability error propagates unchanged. The cases that narrowed `isCalculateAffordabilityCompressedReturn` are replaced by the over-budget cases below.
      * `[ ]`   New case: an over-budget verdict on a row whose `job_type` is `'EXECUTE'` calls `deps.compressPrompt` exactly once, with `finalTargetThreshold`, `balanceAfterCompression` and `walletBalance` carrying the affordability arm's values, and returns `{ waiting_for_children: true }` without calling `deps.enqueueModelCall`. Arranged with a spy on both collaborators so the assertion fails if either call moves.
      * `[ ]`   New case: an over-budget verdict on a row whose `job_type` is `'COMPRESS'` returns a non-retriable error, calls neither `deps.compressPrompt` nor `deps.enqueueModelCall`, and performs no write — decision one's recursion guard.
      * `[ ]`   New case: a compression error return propagates unchanged, with the same `error` identity and `retriable` flag the collaborator returned.
      * `[ ]`   The `EnqueueModelCallParams` assertion cases keep every member assertion they make and lose their `output_type` expectations, that member having left the type.
      * `[ ]`   New cases for the provenance write: a within-budget dispatch updates this job row's payload with `source_prompt_resource_id` from `promptConstructionPayload` before `deps.enqueueModelCall` is called; the value does not appear on the `ChatApiRequest` handed to that call; a failed update returns `{ error, retriable: true }` and enqueues nothing; and an over-budget EXECUTE deferral performs no update at all.
      * `[ ]`   New case: a payload failing `isDialecticBaseJobPayload` surfaces that guard's per-member diagnostic on the error arm, in place of the deleted `does not have a valid 'execute' payload` string.
      * `[ ]`   Every existing case for the tier-cap read and its failure, the effective-cap arithmetic, the member validations, the provider-config failure, the document-identity failure, the wallet and rate resolution and the enqueue error propagation keeps its arrangement and assertions.
      * `[ ]`   The `isEnqueueModelCallParams` and `isCalculateAffordabilityParams`/`isCalculateAffordabilityPayload` assertions over captured arguments stand, now proving the narrowed shapes.

   * `[ ]`   `prepareModelJob.inputsRequired.test.ts`
      * `[ ]`   Its three cases drop `compressionStrategy` from their payload literals and `authToken`/`sessionData` from their params literals, and keep every `inputsRequired` scoping and enforcement assertion unchanged.

   * `[ ]`   `prepareModelJob.ts`
      * `[ ]`   `isDialecticExecuteJobPayload` is replaced by `isDialecticBaseJobPayload`; the hand-thrown invalid-payload message, the `Object.getOwnPropertyDescriptor` read of `user_jwt` and the `payload.user_jwt required` throw are deleted, and `userAuthToken` is read from the narrowed payload.
      * `[ ]`   `output_type` leaves the payload destructure and the `EnqueueModelCallParams` literal.
      * `[ ]`   `compressionStrategy` leaves the payload destructure and the `CalculateAffordabilityPayload` literal, which also drops `chatApiRequest`; the `CalculateAffordabilityParams` literal drops `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance`.
      * `[ ]`   The `isCalculateAffordabilityCompressedReturn` narrowing is replaced by the `overBudget` branch: `isCalculateAffordabilityOverBudgetReturn` selects the compression path, and the within-budget arm supplies `maxOutputTokens` and `resolvedInputTokenCount` as it does today.
      * `[ ]`   The over-budget path adds the `job_type` branch, the `CompressPromptParams` literal carrying `parentJob`, `projectId`, `iterationNumber` and `targetKey` beside the affordability arm's three sizing members, the `CompressPromptPayload` literal carrying no `compressionStrategy`, the real-tokenizer `tokenizerDeps` literal that payload requires with its three module-level imports in the form `processJob.ts` already uses, the `isDialecticExecuteJobPayload` narrowing inside the EXECUTE branch that `output_type` requires, the single `deps.compressPrompt` call, the `isCompressPromptErrorReturn` propagation and the `{ waiting_for_children: true }` return, plus the non-retriable recursion-guard error on the COMPRESS arm.
      * `[ ]`   The provenance update is added between the affordability branch and the enqueue on the within-budget path, keyed on `params.job.id`, returning the error arm on a Postgrest failure.
      * `[ ]`   Everything else is unchanged: the tier-cap query and its logging, the cap arithmetic, every member validation and its message, the provider-config check, the document scoping and `inputsRequired` enforcement, the wallet and rate resolution, the base `ChatApiRequest` construction, the diagnostic log block, and the enclosing `try`/`catch`.

   * `[ ]`   `prepareModelJob.integration.test.ts`
      * `[ ]`   Its params and payload literals drop `authToken`, `sessionData` and `compressionStrategy`, and its `buildBoundCompressPromptFn` wiring is replaced by a `BoundCompressPromptFn` the case declares, supplied on deps.
      * `[ ]`   The chain this suite proves widens to the composition this node creates: real `calculateAffordability` plus real `compressPrompt` behind this dispatcher, with only Supabase and the queue mocked. A within-budget working set reaches `enqueueModelCall` with the cap the affordability verdict resolved and the provenance recorded on the row; an over-budget EXECUTE working set reaches `compressPrompt` and returns the deferral without enqueueing; an over-budget COMPRESS row returns the recursion-guard error having called neither.
      * `[ ]`   The existing captured-`EnqueueModelCallParams` assertions stand, less `output_type`.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this module imports `compressPrompt`'s bound function type and error guard, `calculateAffordability`'s bound function type and guards, `enqueueModelCall`'s bound function type, and the base payload guard from `_shared`; it exports nothing back to any of them.
      * `[ ]`   The `compressPrompt` edge is a relocation, not an addition: it left `calculateAffordability` in the node above and arrives here, so the module graph gains no new dependency and no cycle.
      * `[ ]`   `prepareModelJob.provides.ts` re-exports this module's implementation, interface, guard and mock, so the new return flavors, their guards and the changed mock surface reach consumers without an edit to that file.

   * `[ ]`   `requirements`
      * `[ ]`   `PrepareModelJobParams` declares four members and `PrepareModelJobPayload` three, with `authToken`, `sessionData` and `compressionStrategy` absent — interface test, exhaustive key records.
      * `[ ]`   `PrepareModelJobDeps` declares eight members including `compressPrompt` — interface test.
      * `[ ]`   `PrepareModelJobReturn` has two arms and both success flavors are members of `PrepareModelJobSuccessReturn` — interface test, typed assignment.
      * `[ ]`   An over-budget EXECUTE job calls `compressPrompt` once, enqueues nothing and returns `{ waiting_for_children: true }` — unit test and integration test.
      * `[ ]`   An over-budget COMPRESS job returns a non-retriable error and calls no collaborator — unit test and integration test.
      * `[ ]`   A within-budget job enqueues one model call whose params name no artifact type and whose request carries the resolved output cap — unit test and integration test.
      * `[ ]`   `source_prompt_resource_id` is written onto the job row's payload before the enqueue and never onto `ChatApiRequest`, and a failed write returns a retriable error having enqueued nothing — unit test.
      * `[ ]`   A malformed payload surfaces the base guard's per-member diagnostic on the error arm — unit test.
      * `[ ]`   Every tier-cap, validation, provider-config, document, wallet and enqueue failure returns exactly what it returns now — unit test and inputsRequired test, existing cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/processCompressJob/processCompressJob.ts **[BE] Compose a `PromptConstructionPayload` from the assembled prompt and call `prepareModelJob`; own no part of the model call, and narrow both assembly unions before use**

   * `[ ]`   `objective`
      * `[ ]`   Solve a second model-call path. This function validates the provider config, extracts the input and output windows, counts preflight tokens, builds a `ChatApiRequest`, a `UserConfig` and `EnqueueModelCallParams`, writes the prompt's resource id onto the job row, and calls `enqueueModelCall` itself — so a COMPRESS call reaches the model without the tier cap, the wallet read or the affordability preflight every EXECUTE call passes, and its window check is a bespoke subtraction rather than decision one's recursion guard.
      * `[ ]`   Functional goals:
         * `[ ]`   The function composes a `PromptConstructionPayload` from the assembled prompt and calls `deps.prepareModelJob`, which is the repo's one model-call dispatcher.
         * `[ ]`   It validates no provider config, extracts no context window, constructs no `ChatApiRequest`, no `UserConfig` and no `EnqueueModelCallParams`, counts no preflight tokens, and writes no provenance update.
         * `[ ]`   It resolves its `ai_providers` row from the payload's `model_id` and passes it to the dispatcher as `providerRow`, exactly as `processSimpleJob` does on the EXECUTE path.
         * `[ ]`   `ProcessCompressJobDeps` declares `assembleCompressionPrompt`, `assembleContinuationPrompt`, `prepareModelJob`, `constructStoragePath` and `logger`, and drops `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic`.
         * `[ ]`   `ProcessCompressJobParams` declares `dbClient`, `job` and `projectOwnerUserId`, and drops `authToken`, which no branch reads once the enqueue leaves.
         * `[ ]`   Both assembly branches narrow their returned union before use: the compression branch on `AssembleCompressionPromptReturn` as it does now, the continuation branch on `AssembleContinuationPromptReturn` through `isAssembleContinuationPromptErrorReturn`.
         * `[ ]`   The dispatcher's return is narrowed by arm: queued → `{ queued: true }`; error → propagated unchanged; a deferral → a non-retriable error naming that a COMPRESS job is never deferred, decision one's guard having failed it instead.
         * `[ ]`   `isProcessCompressJobPayload` keeps returning `isDialecticCompressJobPayload(value)` directly and therefore throws, which is correct here: `processJob` has already selected this arm from the row's `job_type`, so a payload failing is malformed rather than differently typed.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Dedup layer two is unchanged in every particular: the `CompressedContext` path context and its construction failure, the `dialectic_project_resources` existence read, the completed-status update on a hit and its failure, and the `{ queued: false }` success that spends nothing.
         * `[ ]`   Consuming-step resolution is unchanged: the stage's active recipe instance, the cloned-versus-template step query, the step match on `output_type`, the recipe-step validation, the `outputs_required` validation and the `CompressionTargetStep` it builds, each keeping its message and `retriable` flag.
         * `[ ]`   The compression assembler's params and payload literals are unchanged, including the conditional chunk pair.
         * `[ ]`   The function still marks no job `completed` on a successful dispatch; `saveResponse` does that when the response returns.
         * `[ ]`   `ProcessCompressJobError`, the success and error return shapes and `ProcessCompressJobFn`'s signature keep their declarations.
      * `[ ]`   Each goal is proven by a named case in this module's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer job processing: decide whether this compression is still needed, resolve what it is compressing for, assemble its prompt, and hand the result to the dispatcher.
      * `[ ]`   The role is correct because everything above the dispatch is compression-specific knowledge — the canonical artifact path, the consuming step, the target schema, the two assemblers — and everything below it is identical for every model call in the repo.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not validate a model config, extract a window, count tokens, or check a budget; `prepareModelJob` does all four for every job type, over the `providerRow` this function hands it.
         * `[ ]`   Do not write `source_prompt_resource_id` onto the job row; the dispatcher writes it after affordability and before the enqueue.
         * `[ ]`   Do not edit `prepareModelJob.ts`, `processJob.ts` or either assembler; each has its own node.
         * `[ ]`   Do not mark the job completed on a successful dispatch, and do not send a notification on any path — COMPRESS is invisible infrastructure.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/processCompressJob` — dedup layer two, consuming-step and target-schema resolution, assembly-branch selection, and the handoff to the dispatcher.
      * `[ ]`   Inside boundary:
         * `[ ]`   Whether this victim is already compressed for this target.
         * `[ ]`   Which schema the compression targets, and which assembler builds its prompt.
         * `[ ]`   Which provider row this job runs against, resolved from the payload's `model_id` and handed on.
      * `[ ]`   Outside boundary:
         * `[ ]`   Everything a model call requires of that provider row — the tier cap, the wallet read, affordability, the window and the recursion guard — owned by `prepareModelJob`.
         * `[ ]`   What the response becomes, owned by `saveResponse`.
         * `[ ]`   Which arm a job row takes, decided by `processJob` before this function is reached.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./prepareModelJob/prepareModelJob.interface.ts` and `./createJobContext/JobContext.interface.ts` (`BoundPrepareModelJobFn`, `PrepareModelJobParams`, `PrepareModelJobPayload`), plus its two success-arm guards from `prepareModelJob.guard.ts`.
         * `[ ]`   Layer classification: sibling app-layer module, the repo's model-call dispatcher.
         * `[ ]`   Direction: inbound; this module already imports from `enqueueModelCall`, which the dispatcher fronts, so the direction is unchanged and one edge replaces another.
         * `[ ]`   Purpose: make this job's model call identical to every other model call the repo makes.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`PromptConstructionPayload`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound; this module already imports `DialecticJobRow` and `DialecticRecipeStep` from it.
         * `[ ]`   Purpose: type the object this function composes from the assembled prompt.
      * `[ ]`   Provider: `_shared/prompt-assembler/prompt-assembler.guard.ts` (`isAssembleContinuationPromptErrorReturn`).
         * `[ ]`   Layer classification: shared module that owns the continuation return.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: narrow the continuation branch's union before its value is used.
      * `[ ]`   Removed providers: `enqueueModelCall` (`BoundEnqueueModelCallFn`, `EnqueueModelCallParams`, `EnqueueModelCallPayload`), `calculateAffordability` (`UserConfig`), `_shared/types.ts` (`AiModelExtendedConfig`, `ChatApiRequest`), `_shared/types/tokenizer.types.ts` (`CountTokensDeps`, `CountableChatPayload`, `CountTokensFn`) and `type_guards.chat.ts` (`isAiModelExtendedConfig`) — every one imported solely for the config validation, the token count or the enqueue this node removes. `Tables` stays, typing the `ai_providers` row this function still resolves and the recipe-step rows it reads.
      * `[ ]`   Confirm:
         * `[ ]`   `constructStoragePath` and `logger` keep their roles; `logger` remains the only deps member this function does not call on the happy path.
         * `[ ]`   `params.dbClient` remains this function's own database handle: it performs the dedup read, the provider read and the recipe-step reads through it, and hands the same client to the dispatcher.
         * `[ ]`   No reverse dependency: `prepareModelJob` imports nothing from this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From the dispatcher: the bound two-argument closure and its two success-arm guards only — not its deps, which the composition root binds.
         * `[ ]`   From the hub: the `PromptConstructionPayload` type only.

   * `[ ]`   `processCompressJob.interface.test.ts`
      * `[ ]`   The deps key case declares `assembleCompressionPrompt`, `assembleContinuationPrompt`, `prepareModelJob`, `constructStoragePath` and `logger` and asserts five — exhaustive in both directions, it is the proof the four model-call members are gone.
      * `[ ]`   The params key case declares `dbClient`, `job` and `projectOwnerUserId` and asserts three, proving `authToken` is not a member.
      * `[ ]`   A case proves `ProcessCompressJobDeps["prepareModelJob"]` accepts a `BoundPrepareModelJobFn` value by typed assignment.
      * `[ ]`   The payload alias case, the return-union cases and the signature cases are unchanged.

   * `[ ]`   `processCompressJob.interface.ts`
      * `[ ]`   `ProcessCompressJobDeps` drops `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic`, gains `prepareModelJob: BoundPrepareModelJobFn`, and keeps `assembleCompressionPrompt`, `assembleContinuationPrompt`, `constructStoragePath` and `logger`. The `BoundEnqueueModelCallFn`, `CountTokensFn` and `CountTokensDeps` imports go with the members.
      * `[ ]`   `ProcessCompressJobParams` drops `authToken` and declares `dbClient`, `job` and `projectOwnerUserId`. It gains no `providerRow`: this function resolves that row itself and forwards it, exactly as `processSimpleJob` resolves its own and forwards it, neither orchestrator receiving one from `processJob`.
      * `[ ]`   `ProcessCompressJobPayload`, `ProcessCompressJobError`, both return shapes, `ProcessCompressJobReturn`, `ProcessCompressJobFn` and `BoundProcessCompressJobFn` are unchanged.

   * `[ ]`   `processCompressJob.interaction.spec`
      * `[ ]`   Dedup layer two, unchanged: build the `FileType.CompressedContext` path context from the payload's identity members and call `deps.constructStoragePath`. A throw → error arm, `retriable: false`. The `dialectic_project_resources` existence read failing → error arm, `retriable: true`. A row found → update this job row to `completed` with `completed_at`; that update failing → error arm, `retriable: true`; otherwise success `{ queued: false }`, nothing else run.
      * `[ ]`   Provider resolution, unchanged in its query and its two row outcomes: the `ai_providers` read by `payload.model_id`; a query error → error arm, `retriable: true`; no row → error arm, `Provider not found`, `retriable: true`. The row is held for the dispatcher and nothing is read off it here — the `isAiModelExtendedConfig` validation and both window extractions leave with the model-call work.
      * `[ ]`   Consuming step, unchanged: the stage read, its missing active recipe instance, the instance read, the cloned-versus-template step query, an empty step set, no step matching `output_type`, a step failing both recipe-step guards, and invalid `outputs_required` each return their existing message and flag; otherwise the `CompressionTargetStep` is built from `outputs_required` and `step_description`.
      * `[ ]`   Assembly branch, selected on `payload.continuation_count` being a number at least one: the continuation branch calls `deps.assembleContinuationPrompt(params.job)`; every other case calls `deps.assembleCompressionPrompt` with the existing params and payload literals.
      * `[ ]`   Continuation branch narrowing: `isAssembleContinuationPromptErrorReturn` true → propagate `{ error, retriable }` unchanged. Otherwise the value is the assembled prompt.
      * `[ ]`   Compression branch narrowing: an error return → propagate `{ error, retriable }` unchanged, as it does now.
      * `[ ]`   Dispatch: compose `PromptConstructionPayload` with `currentUserPrompt` from the assembled `promptContent`, `source_prompt_resource_id` from the assembled id, and empty `conversationHistory` and `resourceDocuments` — a compression prompt is one self-contained instruction with no history and no gathered artifacts. Call `deps.prepareModelJob` with `{ dbClient, job, projectOwnerUserId, providerRow }` — the four members the EXECUTE orchestrator passes, the row being the one this function resolved — and `{ promptConstructionPayload }`, supplying neither `inputsRelevance` nor `inputsRequired`, a COMPRESS job having no recipe step of its own.
      * `[ ]`   Dispatch outcome: `isPrepareModelJobQueuedReturn` → success `{ queued: true }`. `isPrepareModelJobPendingReturn` → error arm, a `ProcessCompressJobError` stating that a COMPRESS job was deferred rather than dispatched, `retriable: false` — the dispatcher's recursion guard fails an over-budget COMPRESS job, so this arm is unreachable by design and is reported rather than treated as success. Anything else is the error arm, propagated unchanged.
      * `[ ]`   Ordering and side effects: exactly one read before any write; the only write on a dedup hit is the completed-status update; on the dispatch path this function writes nothing at all; no notification is sent on any path.

   * `[ ]`   `processCompressJob.mock.ts`
      * `[ ]`   `buildProcessCompressJobDeps` supplies `prepareModelJob` from the dispatcher module's own function mock and drops its `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic` defaults; `buildProcessCompressJobParams` drops its `authToken` default and keeps its three remaining members.
      * `[ ]`   Each owned object type carries the four symbols: `Partial<T>` overrides, a builder defaulting every member, a corruption type over `keyof`, and an `unknown`-returning invalidator — for `ProcessCompressJobDeps`, `ProcessCompressJobParams`, `ProcessCompressJobSuccessReturn` and `ProcessCompressJobErrorReturn`. `ProcessCompressJobPayload` is an alias of `DialecticCompressJobPayload` and takes no symbols of its own; its builder is the one `enqueueCompressJobs.mock.ts` owns.
      * `[ ]`   One function mock per owned function type: `mockProcessCompressJob: ProcessCompressJobFn` and `mockBoundProcessCompressJob: BoundProcessCompressJobFn`, each returning `buildProcessCompressJobSuccessReturn()`, with no options bag and no call recording.

   * `[ ]`   `processCompressJob.guard.test.ts`
      * `[ ]`   `isProcessCompressJobDeps` case checklist over the five surviving members, each absent and each wrong-typed, fixtures from the invalidator; a case asserts a deps object carrying none of the four removed members is accepted.
      * `[ ]`   `isProcessCompressJobParams` case checklist over the three surviving members, each absent and each wrong-typed; a case asserts params carrying no `authToken` are accepted.
      * `[ ]`   The two `isProcessCompressJobPayload` cases asserting `false` for a non-record root become thrown-diagnostic assertions, that guard being `isDialecticCompressJobPayload` under another name and therefore throwing.
      * `[ ]`   The `isProcessCompressJobSuccessReturn`, `isProcessCompressJobErrorReturn`, `isProcessCompressJobReturn`, `isProcessCompressJobFn` and `isBoundProcessCompressJobFn` cases keep their coverage and their boolean assertions.

   * `[ ]`   `processCompressJob.guard.ts`
      * `[ ]`   `isProcessCompressJobDeps` drops its `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic` checks and gains a presence-and-function check for `prepareModelJob`.
      * `[ ]`   `isProcessCompressJobParams` drops its `authToken` check.
      * `[ ]`   `isProcessCompressJobPayload` still returns `isDialecticCompressJobPayload(value)` directly and is not wrapped, caught or softened.
      * `[ ]`   Every other guard in the file is unchanged.

   * `[ ]`   `processCompressJob.test.ts`
      * `[ ]`   Every case builds deps without the four removed members and params without `authToken`.
      * `[ ]`   The cases asserting `enqueueParams["output_type"]`, the provider-config validations, the `provider_max_input_tokens`/`provider_max_output_tokens` checks, the preflight token count and the budget-exceeded error are deleted with the branches they cover; the responsibilities they asserted now belong to `prepareModelJob`'s suite, where its own cases prove the cap, the wallet, the preflight and the recursion guard. The provider-lookup cases stand — the query-error and provider-not-found cases keep their messages and flags.
      * `[ ]`   New case: a fitting job reaches `deps.prepareModelJob` exactly once with `{ dbClient, job, projectOwnerUserId, providerRow }`, the row being the one the `ai_providers` stub returned, and a payload whose `promptConstructionPayload` carries the assembled `promptContent` as `currentUserPrompt`, the assembled id as `source_prompt_resource_id`, and empty history and documents — and returns `{ queued: true }`.
      * `[ ]`   New case: a dispatcher error return is propagated with the same `error` identity and `retriable` flag, and no further work is done.
      * `[ ]`   New case: a dispatcher deferral returns the non-retriable error arm naming the COMPRESS deferral, and does not report success.
      * `[ ]`   New case: the continuation branch narrows its union — an error return from `deps.assembleContinuationPrompt` is propagated unchanged and the dispatcher is never called.
      * `[ ]`   The continuation-selection case stands: `continuation_count` at least one calls the continuation assembler and never the compression assembler, and zero or absent calls the compression assembler.
      * `[ ]`   Every dedup, stage, instance, step-query, step-match, recipe-step-validation and `outputs_required` case keeps its arrangement, its message assertion and its `retriable` flag.
      * `[ ]`   A case asserts this function writes no job-row payload update on the dispatch path, the provenance write having moved to the dispatcher.

   * `[ ]`   `processCompressJob.ts`
      * `[ ]`   Step two keeps its `ai_providers` read and both row outcomes; its `isAiModelExtendedConfig` validation, the two `provider_max_*` checks and the two window extractions are deleted, with the `isAiModelExtendedConfig` import and the `AiModelExtendedConfig` type. The row itself is held for the dispatcher.
      * `[ ]`   Step five's provenance update — the spread payload literal, its `isJson` throw and the `dialectic_generation_jobs` update — is deleted.
      * `[ ]`   Step six's tokenizer deps, countable payload, `deps.countTokens` call and budget comparison are deleted, with the `CountTokensDeps` and `CountableChatPayload` imports.
      * `[ ]`   The `ChatApiRequest`, `UserConfig` and `EnqueueModelCallParams` literals, the `EnqueueModelCallPayload` literal and the `deps.enqueueModelCall` call are deleted, with their imports.
      * `[ ]`   The continuation branch's assignment is replaced by a narrowed one: call, guard with `isAssembleContinuationPromptErrorReturn`, propagate the error arm, otherwise hold the assembled prompt.
      * `[ ]`   The tail composes the `PromptConstructionPayload` and the two dispatcher literals, calls `deps.prepareModelJob`, and returns per the arm guards.
      * `[ ]`   Steps one and three are untouched, as are every error message, `retriable` flag and early return they carry.

   * `[ ]`   `processCompressJob.integration.test.ts`
      * `[ ]`   Its victim-payload helper and every case drop `authToken` from the params they build and the four removed members from the deps they build.
      * `[ ]`   The `capturedEnqueueParams.output_type` assertions are replaced by assertions over the captured `PrepareModelJobParams` and `PrepareModelJobPayload`: the four params members including the resolved `providerRow`, and a `promptConstructionPayload` carrying the assembled prompt and its resource id.
      * `[ ]`   The chain this suite proves is the real one this function now owns: real `constructStoragePath`, real assemblers where it already uses them, and the dispatcher at the outer edge. A dedup hit still completes without dispatching; a continuation victim still reaches the continuation assembler.
      * `[ ]`   Every existing dedup, stage-resolution and assembly assertion stands.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this module imports the dispatcher's bound type and guards, the hub's payload type, both assemblers' contracts and the shared path constructor, and exports nothing back to any of them.
      * `[ ]`   The `enqueueModelCall` edge is replaced by the `prepareModelJob` edge, one layer up the same path, so the module graph gains no new direction.
      * `[ ]`   No cycle: `prepareModelJob` imports nothing from this module, and `processJob` constructs this function's deps rather than being imported by it.
      * `[ ]`   This module has no `provides` barrel; `processJob` imports its interface, guard and implementation directly, as it does now.

   * `[ ]`   `requirements`
      * `[ ]`   `ProcessCompressJobDeps` declares five members and `ProcessCompressJobParams` three, with the four model-call members and `authToken` absent — interface test, exhaustive key records.
      * `[ ]`   A fitting job calls `deps.prepareModelJob` exactly once with the four params members including the resolved `providerRow`, the composed `PromptConstructionPayload`, and returns `{ queued: true }` — unit test and integration test.
      * `[ ]`   The function validates no provider config, extracts no window, counts no tokens and writes no job-row payload update on the dispatch path — unit test.
      * `[ ]`   A dedup hit completes the job row and returns `{ queued: false }` without dispatching — unit test and integration test, existing cases.
      * `[ ]`   Both assembly branches propagate their error arm unchanged and never reach the dispatcher — unit test.
      * `[ ]`   A dispatcher deferral returns a non-retriable error rather than success — unit test.
      * `[ ]`   A malformed payload surfaces `isDialecticCompressJobPayload`'s thrown diagnostic — guard test.
      * `[ ]`   Every provider-lookup, stage, instance, step and `outputs_required` failure returns exactly what it returns now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/createJobContext/createJobContext.ts **[BE] Make the factory the sole assembler of the `prepareModelJob` graph: `JobContextParams` carries `prepareModelJobFn` and no pre-bound closure, `createJobContext` composes `IJobContext.prepareModelJob` from `createPrepareModelJobContext`, `IPrepareModelJobContext` gains `compressPrompt: BoundCompressPromptFn`, and `IJobContext`/`JobContextParams` gain `compressionStrategy: ICompressionStrategy` for the slicer to bind from**

* `[ ]`   supabase/functions/dialectic-worker/processSimpleJob.ts **[BE] Drop `compressionStrategy` from its `PrepareModelJobPayload` literal and `sessionData`/`authToken` from its `PrepareModelJobParams` literal, supply `stageSlug` and `targetKey` to `gatherArtifacts`, narrow the dispatcher's deferral instead of reporting it as an executed job, and narrow the canonical `retryJob` return at its single call site**

   * `[ ]`   `objective`
      * `[ ]`   Solve the origin of a relay, an under-supplied gather, and two unnarrowed returns. This function is the sole production construction site of `PrepareModelJobPayload.compressionStrategy` and of `PrepareModelJobParams.sessionData` and `authToken` — a collaborator and two values threaded through functions that never read them — so none of the three can leave its contract while this file supplies it. It is `gatherArtifacts`'s only caller, and that function's overlay needs a consuming stage and a compression target this call site does not pass, both of which are already resolved here. It is the dispatcher's only caller, and it treats every non-error result alike: it asserts a success shape and sends `execute_completed`, so once the dispatcher reports a deferral as well as a dispatch, that path announces a completed execution for a job that enqueued no model call. And it is the repo's one remaining `retryJob` call site, where the result is awaited and discarded, so a retry that could not be scheduled leaves the row in `processing` with nothing reported.
      * `[ ]`   Functional goals:
         * `[ ]`   The `PrepareModelJobParams` literal carries `dbClient`, `job`, `projectOwnerUserId` and `providerRow` only.
         * `[ ]`   The `PrepareModelJobPayload` literal carries `promptConstructionPayload`, `inputsRelevance` and `inputsRequired` only, and the `getSortedCompressionCandidates` import is deleted with the member it supplied.
         * `[ ]`   The `gatherArtifacts` params literal carries `stageSlug` from the payload member this function already destructures, and `targetKey` from `resolvedRecipeStep.output_type`, the value it already reads into `notificationDocumentKey`, beside the four members it passes today. Neither costs a lookup.
         * `[ ]`   A deferral is narrowed with `isPrepareModelJobPendingReturn` and returns from the function without sending any notification and without writing any row status; the parent is already `waiting_for_children` and the completion trigger resumes it.
         * `[ ]`   A dispatch is narrowed with `isPrepareModelJobQueuedReturn` before the `execute_completed` notification, and any other shape still raises `prepareModelJob returned an invalid result shape`.
         * `[ ]`   The `retryJob` call adopts that module's canonical `(deps, params, payload)` shape and its return is narrowed: the notified success flavor returns from the catch as it does today; the unnotified success flavor also returns, logging the notification error it carries so the failure reaches a boundary; the error arm does not return, and falls through to the terminal-failure path already written below it, so a retry that was never scheduled still marks the row and notifies.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `sessionData` stays in this function and keeps every use it has — the assembler options, the iteration number it supplies to `gatherArtifacts` and to the notification. What ends is passing it onward.
         * `[ ]`   Every other behavior is unchanged: the stage and recipe resolution, the initial-prompt resolution, the continuation routing, the `promptConstructionPayload` construction, the error branch with its `ContextWindowError` and `PrepareModelJobExecutionError` handling, and every notification the catch sends. The `gatherArtifacts` call gains two params and keeps its error throw and its `artifacts` read exactly as they stand.
         * `[ ]`   The function keeps its `(dbClient, job, projectOwnerUserId, ctx, authToken)` signature, which `processJob` calls positionally. `authToken` becomes unused in the body and is renamed `_authToken` in place, the repo's convention for a deliberately unused parameter, so the file lints clean without touching a second file.
      * `[ ]`   Each goal is proven by a named case in this file's unit or integration suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer orchestration of one EXECUTE job: resolve the stage and its recipe step, assemble the prompt, gather the artifacts, hand the result to the dispatcher, and report what the dispatcher did.
      * `[ ]`   The role is correct because this function owns the job's lifecycle reporting. Whether a job executed, deferred or failed is its statement to make, and it can only make it correctly by narrowing every arm the dispatcher returns.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not decide affordability, compress anything, or read a compression artifact; the dispatcher composes those and reports one outcome.
         * `[ ]`   Do not set `waiting_for_children` or any row status on the deferral path; `compressPrompt` sets the parent's status, and the completion trigger resumes it.
         * `[ ]`   Do not change `processJob.ts` or this function's signature; the unused parameter is handled in place.
         * `[ ]`   Do not edit `gatherArtifacts`, `applyCompressionOverlay` or `retryJob`; each owns its own contract and lands ahead of this node. This file supplies their inputs and narrows their returns, nothing more.
         * `[ ]`   Do not stand up a composition root or assert on `processJob`; this suite integrates the chain below this function, not the chain above it.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/processSimpleJob.ts` — the EXECUTE job's orchestration from stage resolution through dispatch to notification.
      * `[ ]`   Inside boundary:
         * `[ ]`   What this job needs assembled and gathered before a model call can be prepared.
         * `[ ]`   What the job's outcome is reported as, per arm of the dispatcher's return.
      * `[ ]`   Outside boundary:
         * `[ ]`   Caps, wallet, affordability, compression and the queue, all owned by `prepareModelJob` and what it composes.
         * `[ ]`   Which collaborator scores compression victims, supplied at the composition root.

   * `[ ]`   `deps`
      * `[ ]`   Removed provider: `_shared/utils/vector_utils.ts` (`getSortedCompressionCandidates`).
         * `[ ]`   Layer classification: shared utility.
         * `[ ]`   Direction: inbound, and closed by this node — this file imported the concrete scorer solely to relay it, and the composition root supplies it to `compressPrompt` instead.
         * `[ ]`   Purpose retired: naming a compression collaborator from an orchestrator that never calls one.
      * `[ ]`   Provider: `./prepareModelJob/prepareModelJob.guard.ts` (`isPrepareModelJobPendingReturn`, `isPrepareModelJobQueuedReturn`, beside the already-imported `isPrepareModelJobErrorReturn`).
         * `[ ]`   Layer classification: sibling app-layer module, owner of the dispatcher's return contract.
         * `[ ]`   Direction: inbound; this file already imports that module's guards and error class, so no new direction is opened.
         * `[ ]`   Purpose: narrow each arm of the return this function receives.
      * `[ ]`   Provider: the `retryJob` module's guard file, for the two success flavors and the error arm its own node declares.
         * `[ ]`   Layer classification: sibling app-layer module, owner of the retry dispatcher's return contract.
         * `[ ]`   Direction: inbound, and new to this file — the return was discarded before, so nothing narrowed it.
         * `[ ]`   Purpose: tell a scheduled retry from an unscheduled one, so the catch reports the difference.
      * `[ ]`   Confirm:
         * `[ ]`   `ctx` is unchanged in shape: no member is added, removed or retyped. `IJobContext.gatherArtifacts` and `IJobContext.retryJob` already carry the widened params and the canonical return as of their own nodes, and `IJobContext.prepareModelJob` keeps its declared type.
         * `[ ]`   No reverse dependency: `prepareModelJob`, `gatherArtifacts` and `retryJob` import nothing from this file.
      * `[ ]`   `context_slice`
         * `[ ]`   From the dispatcher's module: the three return guards and `PrepareModelJobExecutionError` only.
         * `[ ]`   From the retry module: its return guards only.

   * `[ ]`   `processSimpleJob.interaction.spec`
      * `[ ]`   Three points change and no others. Every branch this node does not name — stage and recipe resolution, provider details, initial-prompt resolution, continuation routing, `promptConstructionPayload` construction — keeps its condition, its dependency call and its outcome.
      * `[ ]`   Gather call: `ctx.gatherArtifacts` receives `stageSlug` and `targetKey` beside the four params it receives today. Its error return still throws `gatherResult.error` to the catch, and its `artifacts` still become `resourceDocuments`. The overlay runs inside that function; this call site observes only the artifacts it returns.
      * `[ ]`   Dispatcher call: `ctx.prepareModelJob(prepareParams, preparePayload)` with the narrowed literals. The result is held as `unknown` and narrowed by guard, as it is today.
      * `[ ]`   Error arm, unchanged: `isPrepareModelJobErrorReturn` true → a `ContextWindowError` is rethrown as itself, and anything else is rethrown as `PrepareModelJobExecutionError` carrying the message, the `retriable` flag and the cause, for the catch to classify.
      * `[ ]`   Deferral arm: `isPrepareModelJobPendingReturn` true → return. No `execute_completed` event, no other notification, no row write. The job row is already `waiting_for_children`, set by `compressPrompt` when it spawned the children, and the DB completion trigger wakes this job when they finish.
      * `[ ]`   Dispatch arm: `isPrepareModelJobQueuedReturn` true → send `execute_completed` through `ctx.notificationService.sendJobNotificationEvent` with the session, stage, job id, step key, model id, iteration number and document key it sends today, when `projectOwnerUserId` is present.
      * `[ ]`   Neither guard true → throw `prepareModelJob returned an invalid result shape`, reaching the catch as it does now.
      * `[ ]`   Catch: the `PrepareModelJobExecutionError` unwrapping, the `ContextWindowError` row failure and its three notifications, every classified immediate failure and every rethrow are unchanged.
      * `[ ]`   Retry branch, inside the catch, reached when `currentAttempt < max_retries`: call `ctx.retryJob` in the canonical shape and narrow its return. Notified success → return, as today. Unnotified success → log the notification error it carries, then return; the row was updated and the job must not also take the terminal path. Error arm → do not return; fall through to the terminal-failure path below, which marks the row `retry_loop_failed` and sends its three notifications, because no retry was scheduled and nothing else would report the job.
      * `[ ]`   Ordering and side effects: exactly one gather call, one dispatcher call and at most one retry call per invocation; at most one notification on the success paths and none on the deferral; the deferral writes nothing.

   * `[ ]`   `processSimpleJob.test.ts`
      * `[ ]`   Every case's `PrepareModelJobParams` literal drops `authToken` and `sessionData`, and every `PrepareModelJobPayload` literal drops `compressionStrategy`; each keeps the rest of its arrangement and all of its assertions.
      * `[ ]`   New case: a dispatcher returning `{ waiting_for_children: true }` leaves the function without calling `ctx.notificationService.sendJobNotificationEvent` at all and without writing `dialectic_generation_jobs`. Arranged alongside a queued case in the same file so the assertion cannot hold if the branch were deleted.
      * `[ ]`   New case: a dispatcher returning `{ queued: true }` sends exactly one `execute_completed` event carrying the session, stage, job id, step key, model id, iteration number and document key it carries today.
      * `[ ]`   The existing invalid-shape case stands, asserting the same thrown message for a result that is neither arm.
      * `[ ]`   New case: the `gatherArtifacts` call receives `stageSlug` equal to the payload's own value and `targetKey` equal to `resolvedRecipeStep.output_type`, captured at the call site, alongside the four params it receives today.
      * `[ ]`   New cases for the retry branch, all three arms: a notified success returns without reaching the terminal path; an unnotified success returns and logs the carried notification error; an error arm reaches the terminal path, marking the row `retry_loop_failed` and sending its three notifications. Arranged in one file so an assertion fails if any arm is collapsed into another.
      * `[ ]`   Every existing case — the error propagation, the `ContextWindowError` path with its row update and three notifications, the gather failure, the continuation routing and the assembler paths — keeps its coverage and its assertions unchanged.

   * `[ ]`   `processSimpleJob.ts`
      * `[ ]`   The `PrepareModelJobParams` literal drops `authToken` and `sessionData`; the `PrepareModelJobPayload` literal drops `compressionStrategy`; the `getSortedCompressionCandidates` import is deleted.
      * `[ ]`   The `authToken` parameter is renamed `_authToken` in the function signature, its last use having left the body.
      * `[ ]`   The `isPrepareModelJobSuccessReturn` check is replaced by the two arm guards: `isPrepareModelJobPendingReturn` returns from the function, `isPrepareModelJobQueuedReturn` gates the notification block, and the invalid-shape throw follows both. The `isPrepareModelJobSuccessReturn` import is replaced by the two arm guards' imports.
      * `[ ]`   The `ctx.gatherArtifacts` params literal gains `stageSlug` and `targetKey`; the destructured `stageSlug` and `resolvedRecipeStep.output_type` that supply them are already in scope at that line.
      * `[ ]`   The `ctx.retryJob` call in the catch adopts the canonical argument shape and its result is narrowed by the retry module's return guards; the bare `return` that followed it becomes the three-arm branch, and the terminal-failure block below is reached by fall-through rather than being unreachable on a failed schedule.
      * `[ ]`   Nothing else in the file changes: every other statement, log line, notification, row write and error path is left exactly as it stands.

   * `[ ]`   `processSimpleJob.integration.test.ts`
      * `[ ]`   Its `PrepareModelJobParams` and `PrepareModelJobPayload` constructions drop the same three members, its `gatherArtifacts` construction gains the two, and its `isEnqueueModelCallParams` assertions over the captured dispatcher arguments stand.
      * `[ ]`   The integrated chain is real end to end: `processSimpleJob` → `gatherArtifacts` → `applyCompressionOverlay` → `prepareModelJob` → `calculateAffordability` → `compressPrompt` → `enqueueCompressJobs`, and on the within-budget path `prepareModelJob` → `enqueueModelCall`. No function in that chain is mocked, stubbed or replaced by a builder.
      * `[ ]`   Mocked at the outer edge only: the Supabase client and the queue POST. Storage reads the overlay performs are served from the mocked client, so the suite proves nothing about the storage adapter itself.
      * `[ ]`   A case drives an oversized working set through that chain: COMPRESS rows are inserted with `parent_job_id` equal to this job, the dispatcher returns the deferral, and this function returns having sent no notification and written no row status.
      * `[ ]`   A case drives a within-budget working set through the same chain: the queue receives one POST, the row is marked `queued`, and exactly one `execute_completed` event is sent.
      * `[ ]`   A case drives an already-compressed working set: the overlay swaps the victim's content, the recount fits, and the call reaches the queue without any COMPRESS row being inserted.

   * `[ ]`   `dialectic-worker/index.test.ts`
      * `[ ]`   Its parallel `PrepareModelJobParams` literal drops `authToken` and `sessionData` and its `PrepareModelJobPayload` literal drops `compressionStrategy`, with the `getSortedCompressionCandidates` import deleted if no other construction in the file uses it. This is test infrastructure for the same contract, not a second production caller, so it takes no node of its own.
      * `[ ]`   Its `prepareModelJobSpy` call-count assertion for the EXECUTE path is unchanged.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file imports the dispatcher's guards and error class from the module that owns them, and drops its import of the concrete scorer; it exports nothing to either.
      * `[ ]`   No cycle: `prepareModelJob` and `vector_utils` import nothing from this file.
      * `[ ]`   The composition root remains the only place a concrete collaborator is chosen; after this node no orchestrator names one.

   * `[ ]`   `requirements`
      * `[ ]`   The dispatcher receives params carrying neither `authToken` nor `sessionData`, and a payload carrying no `compressionStrategy` — unit test and integration test, captured-argument assertions.
      * `[ ]`   `gatherArtifacts` receives `stageSlug` from the payload and `targetKey` from `resolvedRecipeStep.output_type` — unit test and integration test, captured-argument assertions.
      * `[ ]`   A deferral sends no notification and writes no row status — unit test and integration test.
      * `[ ]`   A dispatch sends exactly one `execute_completed` event carrying the fields it carries today — unit test.
      * `[ ]`   A result that is neither arm raises `prepareModelJob returned an invalid result shape` — unit test, existing case.
      * `[ ]`   Each of the three `retryJob` arms reaches its own outcome: notified success returns, unnotified success returns having logged the carried error, and the error arm reaches the terminal-failure path — unit test.
      * `[ ]`   Every error, `ContextWindowError`, gather-failure and continuation path behaves exactly as it does now — unit test, existing cases unchanged.


* `[ ]`   supabase/functions/dialectic-worker/processJob.ts **[BE] Let the throwing payload guard's per-member diagnostic propagate in place of the hand-thrown `Invalid COMPRESS payload for job …`, and rebuild the `ProcessCompressJobDeps` literal this file is the sole construction site of, now that the model call moves into `prepareModelJob`**

   * `[ ]`   `objective`
      * `[ ]`   Solve a dispatcher that hands its COMPRESS processor a model call's worth of collaborators and reports a malformed payload with a message that names nothing. This file is the sole construction site of `ProcessCompressJobDeps`, and it still supplies `enqueueModelCall`, a token counter, a tiktoken encoding closure and the Anthropic counter — every one of which the processor stopped using when the model call moved into `prepareModelJob`. Its payload gate throws `Invalid COMPRESS payload for job <id>`, which tells a developer only that something in a twenty-member payload was wrong.
      * `[ ]`   Functional goals:
         * `[ ]`   The `ProcessCompressJobDeps` literal carries `assembleCompressionPrompt`, `assembleContinuationPrompt`, `prepareModelJob`, `constructStoragePath` and `logger`, and nothing else.
         * `[ ]`   `prepareModelJob` is supplied from `ctx.prepareModelJob`, the pre-bound closure the composition root already puts on the job context and `processSimpleJob` already calls.
         * `[ ]`   The `ProcessCompressJobParams` literal carries `dbClient`, `job` and `projectOwnerUserId`, and no `authToken`.
         * `[ ]`   A malformed COMPRESS payload surfaces `isDialecticCompressJobPayload`'s own per-member diagnostic; no hand-rolled message stands in front of it.
         * `[ ]`   The `countTokensAnthropic`, `rawGetEncoding` and `isKnownTiktokenEncoding` imports leave with the members they served.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   The `switch` over `job.job_type` is unchanged in every arm and in its `default`; the `COMPRESS` case is still selected by that column, which is the pattern the two selector nodes in this workstream adopt.
         * `[ ]`   Both bound assembler closures keep their deps literals exactly as they stand, including the `renderPrompt`, `fileManager`, `constructStoragePath` and `downloadFromStorage` members each supplies.
         * `[ ]`   The error handling after the processor call is unchanged: an error return writes `status: 'failed'` with `error_details` carrying the message and the `retriable` flag, and a failed update rethrows.
         * `[ ]`   The `EXECUTE`, `PLAN` and `RENDER` cases, the `authToken` parameter they use, and this function's own signature and logging are untouched.
      * `[ ]`   Each goal is proven by a named case in this file's suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer dispatch: read the job row's type, build the slice of context that type's processor declares, call it, and record a failure it reports.
      * `[ ]`   The role is correct because a dispatcher's contribution is the wiring: which collaborators a processor receives is decided here, and a processor that no longer makes a model call must stop being handed one.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not change how any arm is selected; the column already answers it in every case.
         * `[ ]`   Do not edit `processCompressJob.ts`, `prepareModelJob.ts` or either assembler; each has its own node.
         * `[ ]`   Do not add a `try` around the COMPRESS arm or catch the guard's diagnostic; it propagates to this function's caller as it does for every other throw in this file.
         * `[ ]`   Do not change the failed-status write, its `error_details` shape, or any log line.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is job dispatch in `supabase/functions/dialectic-worker/processJob.ts` — arm selection by job type, per-arm context construction, processor invocation, and the failure write for the arm that returns rather than throws.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which collaborators each processor is constructed with, this file being the sole construction site of the COMPRESS processor's deps and params.
         * `[ ]`   What is recorded when a processor reports an error return.
      * `[ ]`   Outside boundary:
         * `[ ]`   What any processor does with what it is given.
         * `[ ]`   The payload contracts and their guards, owned by `enqueueCompressJobs` and the hub.
         * `[ ]`   The model call, owned by `prepareModelJob` and reached through the closure this file forwards.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `createJobContext/JobContext.interface.ts` (`IJobContext.prepareModelJob`, typed `BoundPrepareModelJobFn`).
         * `[ ]`   Layer classification: app-layer context contract, constructed at the composition root.
         * `[ ]`   Direction: inbound; this file already takes `ctx: IJobContext` and reads seven members off it, so no new direction is opened and no wiring changes at the root.
         * `[ ]`   Purpose: give the COMPRESS processor the same dispatcher every other job type reaches.
      * `[ ]`   Removed providers: `npm:@anthropic-ai/tokenizer` (`countTokens as countTokensAnthropic`), `npm:js-tiktoken` (`getEncoding as rawGetEncoding`) and `type_guards.chat.ts` (`isKnownTiktokenEncoding`), all three imported solely to build the encoding closure this literal no longer carries. `ctx.enqueueModelCall` and `ctx.countTokens` stay on the context for their other consumers and are simply not read here.
      * `[ ]`   Confirm:
         * `[ ]`   `IJobContext` gains and loses nothing; this node reads one more member and two fewer.
         * `[ ]`   `IJobProcessors.processCompressJob` keeps its declared shape; only the objects this file constructs for it change.
         * `[ ]`   No reverse dependency: `processCompressJob` imports nothing from this file.
      * `[ ]`   `context_slice`
         * `[ ]`   From `ctx`, for this arm: `promptAssembler`, `fileManager`, `downloadFromStorage`, `logger` and `prepareModelJob` — the five members the two closures and the deps literal read.

   * `[ ]`   `processJob.interaction.spec`
      * `[ ]`   Arm selection, unchanged: the `switch` over `job.job_type`, with `EXECUTE`, `PLAN`, `RENDER`, `COMPRESS` and the `default` that throws `Unsupported or null job_type for job <id>`.
      * `[ ]`   COMPRESS arm, entry: the existing delegation log line, then `isDialecticCompressJobPayload(job.payload)` as the narrowing step. The guard throws its per-member diagnostic on any malformed member and that throw leaves this function unchanged; the negated-guard block that follows it is the narrowing device the compiler requires and is structurally unreachable, so no caller and no case reads its message.
      * `[ ]`   COMPRESS arm, closures: `boundAssembleCompressionPrompt` and `boundAssembleContinuationPrompt` are built exactly as they are now, from `ctx.promptAssembler`, `ctx.fileManager`, `ctx.downloadFromStorage`, `ctx.logger`, `renderPrompt` and `constructStoragePath`.
      * `[ ]`   COMPRESS arm, construction: `ProcessCompressJobDeps` from the two closures plus `prepareModelJob: ctx.prepareModelJob`, `constructStoragePath` and `ctx.logger`; `ProcessCompressJobParams` from `dbClient`, `job` and `projectOwnerUserId`; the payload is the narrowed value.
      * `[ ]`   COMPRESS arm, outcome: `processors.processCompressJob(deps, params, payload)` is called once. `isProcessCompressJobErrorReturn` true → update this job row to `status: 'failed'` with `error_details: { message, retriable }`; a failed update rethrows. Otherwise the case returns without writing anything, the processor's success being either a dedup completion it wrote itself or a dispatch whose completion `saveResponse` writes.
      * `[ ]`   Ordering and side effects: exactly one processor call per invocation; at most one row write, only on the error return; no notification on any COMPRESS path.

   * `[ ]`   `processJob.test.ts`
      * `[ ]`   The case asserting `Invalid COMPRESS payload for job …` asserts `isDialecticCompressJobPayload`'s per-member diagnostic instead, for a payload corrupted through `invalidateDialecticCompressJobPayload`, naming the member at fault.
      * `[ ]`   The cases that assert the constructed `ProcessCompressJobDeps` drop their `enqueueModelCall`, `countTokens`, `getEncoding` and `countTokensAnthropic` expectations and assert the five members the literal now carries, with `prepareModelJob` identical to the `ctx.prepareModelJob` the test supplied.
      * `[ ]`   The cases that assert the constructed `ProcessCompressJobParams` assert three members and that no `authToken` is present.
      * `[ ]`   A case proves the arm still routes: a row whose `job_type` is `'COMPRESS'` reaches `processors.processCompressJob` exactly once, and a row whose `job_type` is `'EXECUTE'` reaches `processors.processSimpleJob` instead.
      * `[ ]`   The error-return case keeps its `status: 'failed'` and `error_details` assertions, and the failed-update case keeps its rethrow assertion.
      * `[ ]`   Every `EXECUTE`, `PLAN`, `RENDER` and `default` case keeps its coverage and its assertions.

   * `[ ]`   `processJob.ts`
      * `[ ]`   The `throw new Error(\`Invalid COMPRESS payload for job ${jobId}\`)` inside the negated-guard block is the block's only statement and stays as the narrowing device; nothing catches it, and the diagnostic that reaches the caller is the guard's own.
      * `[ ]`   The `ProcessCompressJobDeps` literal drops `enqueueModelCall`, `countTokens`, the `getEncoding` closure and `countTokensAnthropic`, and gains `prepareModelJob: ctx.prepareModelJob`.
      * `[ ]`   The `ProcessCompressJobParams` literal drops `authToken`.
      * `[ ]`   The `countTokens as countTokensAnthropic`, `getEncoding as rawGetEncoding` and `isKnownTiktokenEncoding` imports are deleted.
      * `[ ]`   Nothing else in the file changes: both closures, the processor call, the failure write, every other case and every log line.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file reads the job context and the processors it was handed, and imports each processor's contract from the module that owns it; it exports nothing back.
      * `[ ]`   The `enqueueModelCall` edge for this arm is replaced by the `prepareModelJob` edge one layer up the same path, so the graph gains no direction and loses two third-party tokenizer imports.
      * `[ ]`   No cycle: no processor imports this file.

   * `[ ]`   `requirements`
      * `[ ]`   The constructed `ProcessCompressJobDeps` carries five members, `prepareModelJob` among them, and none of the four model-call members — unit test.
      * `[ ]`   The constructed `ProcessCompressJobParams` carries three members and no `authToken` — unit test.
      * `[ ]`   A malformed COMPRESS payload surfaces the guard's per-member diagnostic — unit test.
      * `[ ]`   A `'COMPRESS'` row reaches `processCompressJob` and an `'EXECUTE'` row reaches `processSimpleJob` — unit test.
      * `[ ]`   An error return writes `status: 'failed'` with the message and `retriable` flag, and a failed update rethrows — unit test, existing cases.
      * `[ ]`   Every other arm behaves exactly as it does now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/index.ts **[BE] The worker root supplies collaborators and unbound implementations and constructs nothing: add `compressionStrategy` and `prepareModelJobFn` to the `createJobContext` params, bind `applyCompressionOverlay` into `boundGatherArtifacts`'s deps, delete the `boundCompressPrompt` and `boundCalculateAffordability` closures and the inline `PrepareModelJobDeps` literal, drop the `ragService`/`embeddingClient`/`indexingService`/`textSplitter` construction and its imports, and carry the full-chain compression integration test**


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
* `[ ]`   `supabase/functions/dialectic-worker/index.ts` — the epic's SECOND and FINAL touch to this file. Remove: imports (`:32-33`); `embeddingClient`/`textSplitter`/`indexingService`/`ragService` construction (`:103-108`); their inclusion in whatever deps object passes them onward (`:172-174`); rewrite the bound `compressPrompt` closure (`:193`, currently `compressPrompt({ logger, ragService, embeddingClient, tokenWalletService: adminTokenWalletService, countTokens }, ...)`) to the shape `compressPrompt.ts`'s node already established (`applyCompressionOverlay`, `enqueueCompressJobs`, `fileManager`, `constructStoragePath`, `downloadFromStorage`, `countTokens`, `logger` — no `ragService`/`embeddingClient`/`tokenWalletService`).
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