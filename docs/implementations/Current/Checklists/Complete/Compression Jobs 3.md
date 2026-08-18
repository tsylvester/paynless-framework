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

## Payload, Transport, & Provenance

* `[✅]`   supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.ts **[BE] Land `DialecticBaseJobPayload` and the `isDialecticBaseJobPayload` guard family, and re-base `DialecticCompressJobPayload` on it — inheriting `user_jwt`, `idempotencyKey` and `source_prompt_resource_id`, declaring no `job_type` and no `user_id`**

   * `[✅]`   `objective`
      * `[✅]`   Solve payload divergence: `DialecticCompressJobPayload` declares its own `sessionId`, `projectId`, `walletId`, `model_id`, `model_slug` and `continuation_count` rather than inheriting them, carries `job_type` and `user_id` that duplicate the `dialectic_generation_jobs` columns of those names, and carries neither `user_jwt` nor `idempotencyKey` — so a COMPRESS child cannot cross the Supabase gateway on its own credentials and its row's idempotency key is recorded nowhere on the payload. Its guard restates every base member check its two siblings already make, and returns `false` where they throw a diagnostic naming the member at fault.
      * `[✅]`   Functional goals:
         * `[✅]`   `DialecticBaseJobPayload` in `dialectic-service/dialectic.interface.ts` gains `source_prompt_resource_id?: string`, the member every payload inherits and none redeclares.
         * `[✅]`   `DialecticSimpleJobPayload` declares no `job_type`; the row's column is the one record of a job's type.
         * `[✅]`   `DialecticCompressJobPayload` in `enqueueCompressJobs.interface.ts` extends `DialecticBaseJobPayload` and declares only `targetKey`, `mode`, `content`, `sourceType`, `sourceId?`, `role?`, `documentKey?`, `docType?`, `sourceStageSlug?`, `chunk_index?` and `chunk_total?`, narrowing the base's optional `stageSlug`, `iterationNumber` and `model_slug` to required. It declares no `job_type` and no `user_id`.
         * `[✅]`   `isDialecticBaseJobPayload` in `_shared/utils/type-guards/type_guards.dialectic.ts` holds the base member checks and throws a per-member diagnostic; `dialecticBaseJobPayloadAllowedKeys` is exported beside it as the base half of every arm's unknown-key sweep.
         * `[✅]`   `isDialecticExecuteJobPayload` and `isDialecticRenderJobPayload` delegate their base member checks to it and declare only their own arm's members and arm-specific allowed keys, emitting the same diagnostic strings they emit now.
         * `[✅]`   `isDialecticCompressJobPayload` delegates to the base guard, throws per-member diagnostics for the members it declares, and enforces the same strict unknown-key sweep its two siblings enforce.
         * `[✅]`   `enqueueCompressJobsParams` gains `userJwt: string`; every child payload the function inserts carries that value as `user_jwt` and carries its own row's idempotency key as `idempotencyKey`.
         * `[✅]`   The child row continues to carry `job_type: 'COMPRESS'`, `user_id` from `params.parentJob.user_id`, and `idempotency_key`; those three facts live on the row and only on the row.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   The base guard preserves the exact diagnostic strings `isDialecticExecuteJobPayload` and `isDialecticRenderJobPayload` emit today, so the cases asserting them in `type_guards.dialectic.test.ts` and, through `processRenderJob`'s error surface, in `processRenderJob.test.ts` pass unchanged.
         * `[✅]`   No delegating guard catches the base guard's throw; the diagnostic propagates to the caller.
         * `[✅]`   Every branch of `enqueueCompressJobs.ts` keeps the outcome it has; only the constructed child payload's member set changes.
      * `[✅]`   Each goal is proven by a named case in this node's interface test, guard tests, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer job spawning, plus the contract producers its one implementation consumes: the hub's base payload type, the shared base guard, and the shared payload builders.
      * `[✅]`   The role is correct because `enqueueCompressJobs.ts` is the first source file that constructs a `DialecticCompressJobPayload` expressed as an extension of the base, so the base type, its guard and its builder land in this node rather than in one of their own.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit `continueJob.ts`, `processCompressJob.ts`, `processJob.ts` or `assembleContinuationPrompt.ts`; each has its own node later in this workstream and each is transiently non-compilable until reached.
         * `[✅]`   Do not edit `enqueueRenderJob.ts`; its own re-basing node follows this one.
         * `[✅]`   Do not change the arm selection in any consumer; this node lands the throwing guard, the selector nodes follow it.
         * `[✅]`   Do not write `source_prompt_resource_id` anywhere; this node lands the member on the base, and `prepareModelJob` is its writer.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/enqueueCompressJobs` — victim sizing, chunking, dedup layer one, and child-row insertion.
      * `[✅]`   Inside boundary:
         * `[✅]`   The `DialecticCompressJobPayload` shape and its guard, this function being the creator of that data.
         * `[✅]`   Construction of every child payload and child row this function inserts.
      * `[✅]`   Outside boundary:
         * `[✅]`   `CompressionMode`, `CompressionSourceType` and `FileType`, owned by `_shared/types/file_manager.types.ts`.
         * `[✅]`   `DialecticBaseJobPayload`, owned by `dialectic-service/dialectic.interface.ts` and edited here as a producer for this file.
         * `[✅]`   Who reads a COMPRESS row once inserted.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticBaseJobPayload`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound; `enqueueCompressJobs.interface.ts` already imports `DialecticJobRow` from this file, so the edge exists and no new direction is opened.
         * `[✅]`   Purpose: supply the single root every job payload extends.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticBaseJobPayload`, `dialecticBaseJobPayloadAllowedKeys`).
         * `[✅]`   Layer classification: shared runtime boundary.
         * `[✅]`   Direction: inbound from `_shared`, the direction every module in this repo may take.
         * `[✅]`   Purpose: validate the inherited members once, in one place, with one diagnostic vocabulary.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticBaseJobPayload`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of the base type's builder.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: supply the base defaults this module's builder composes rather than restates.
      * `[✅]`   Confirm:
         * `[✅]`   `enqueueCompressJobsDeps` is unchanged — `logger`, `textSplitter`, `countTokens`, `constructStoragePath`.
         * `[✅]`   No reverse dependency: `_shared` and `dialectic-service` gain no import of this module beyond the hub's existing type-only import of `DialecticCompressJobPayload` for the `DialecticJobPayload` union.
      * `[✅]`   `context_slice`
         * `[✅]`   From the hub: the `DialecticBaseJobPayload` type only, imported with `import type`.
         * `[✅]`   From the shared guard module: the base guard predicate and the allowed-key set only.
         * `[✅]`   From the shared mock: the base builder only.

   * `[✅]`   `enqueueCompressJobs.interface.test.ts`
      * `[✅]`   The `enqueueCompressJobsParams` field-count case declares `userJwt` alongside its twelve existing keys and asserts thirteen.
      * `[✅]`   Each of the three `DialecticCompressJobPayload` literals — the history-role case, the continuation_count case, the model_slug case — drops `job_type` and `user_id` and carries `user_jwt` and `idempotencyKey`, proving by typed assignment that the two removed members are not on the type and the two inherited ones are required.
      * `[✅]`   A case proves membership of the base by typed assignment: a `DialecticCompressJobPayload` value is assignable to `DialecticBaseJobPayload`.
      * `[✅]`   A case proves `source_prompt_resource_id` is an optional member of `DialecticBaseJobPayload` by assigning a literal carrying it and a literal omitting it.
      * `[✅]`   A case proves `stageSlug`, `iterationNumber` and `model_slug` are required on `DialecticCompressJobPayload` where the base declares them optional.
      * `[✅]`   The `enqueueCompressJobsDeps` four-key case, the victim-payload cases, the return-union case and the signature case are unchanged.

   * `[✅]`   `enqueueCompressJobs.interface.ts`
      * `[✅]`   `DialecticCompressJobPayload` becomes `extends DialecticBaseJobPayload`, importing it from `../../dialectic-service/dialectic.interface.ts` with `import type`, beside the existing `DialecticJobRow` import.
      * `[✅]`   It declares `targetKey: ModelContributionFileTypes`, `mode: CompressionMode`, `content: string`, `sourceType: CompressionSourceType`, `sourceId?: string`, `role?: Messages['role']`, `documentKey?: FileType`, `docType?: ModelContributionFileTypes`, `sourceStageSlug?: DialecticStageSlug`, `chunk_index?: number`, `chunk_total?: number`, and redeclares `stageSlug: DialecticStageSlug`, `iterationNumber: number` and `model_slug: string` solely to narrow the base's optional forms to required.
      * `[✅]`   It declares no `job_type`, no `user_id`, no `sessionId`, no `projectId`, no `model_id`, no `walletId`, no `continuation_count` and no `source_prompt_resource_id`; every one of those is inherited.
      * `[✅]`   `enqueueCompressJobsParams` gains `userJwt: string`, beside `modelSlug`.
   
   * `[✅]`   `dialectic-service/dialectic.interface.ts` — `DialecticBaseJobPayload` gains `source_prompt_resource_id?: string`, and `DialecticSimpleJobPayload` drops `job_type?: "simple"`, leaving it an extension of the base that declares no members of its own.
      * `[✅]`   `CompressJobValidationError`, `CompressJobEnqueueError`, the return union, `enqueueCompressJobsDeps`, `enqueueCompressJobsPayload`, `enqueueCompressJobsFn` and `BoundenqueueCompressJobsFn` are unchanged.

   * `[✅]`   `enqueueCompressJobs.interaction.spec`
      * `[✅]`   Entry: payload arrives `unknown` and `isenqueueCompressJobsPayload` narrows it. Fails → `CompressJobValidationError("Invalid enqueueCompressJobs payload.")`, `retriable: false`.
      * `[✅]`   Empty victim content → `CompressJobValidationError`, `retriable: false`.
      * `[✅]`   Identity branch, selected on `victim.sourceType`, explicit per member and never an OR-fallback: `'contribution' | 'resource' | 'feedback'` requires `documentKey` passing `isFileType` and takes it as the identity; `'history'` requires a non-empty `sourceId` and a `role` passing `isCompressionHistoryRole`, and takes `sourceId` as the identity; anything else → `CompressJobValidationError`, `retriable: false`.
      * `[✅]`   Mode branch: `'json'` requires `documentKey`, `docType` and `sourceStageSlug`; `'text'` requires none; anything else → `CompressJobValidationError`, `retriable: false`.
      * `[✅]`   Dedup layer one: `deps.constructStoragePath` over a `FileType.CompressedContext` `PathContext`. A throw → `CompressJobValidationError`, `retriable: false`. The `dialectic_project_resources` existence read failing → `CompressJobEnqueueError`, `retriable: true`. A row found → success `{ createdCount: 0 }`, nothing inserted.
      * `[✅]`   Sizing: a non-numeric or non-positive `provider_max_input_tokens`, or a non-positive budget after the template-overhead and safety reserves, → `CompressJobValidationError`, `retriable: false`. A non-numeric `deps.countTokens` result → `CompressJobEnqueueError`, `retriable: false`.
      * `[✅]`   Fit branch: within budget → one child, carrying the victim's own mode. Over budget → `deps.textSplitter.splitText`, mode forced to `'text'`; an empty split → `CompressJobValidationError`, `retriable: false`.
      * `[✅]`   Child payload construction, per chunk, and the only branch this node changes: the literal is a `DialecticCompressJobPayload` carrying `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `model_id` from `params.modelId`, `model_slug` from `params.modelSlug`, `walletId`, `user_jwt` from `params.userJwt`, `idempotencyKey` set to this child's own key, `mode`, `content`, `sourceType`, and the victim's optional identity members when the victim carries them. It carries no `job_type` and no `user_id`. A chunked child additionally carries `chunk_index` and `chunk_total`, and its key takes the `_chunk_{i}of{n}` suffix. A literal failing `isJson` → `CompressJobValidationError`, `retriable: false`.
      * `[✅]`   Child row construction, per chunk: `job_type: 'COMPRESS'`, `parent_job_id`, `session_id`, `stage_slug`, `iteration_number`, `user_id` from `params.parentJob.user_id`, `is_test_job` from `params.parentJob.is_test_job`, `status: 'pending'`, `idempotency_key` equal to that child payload's own `idempotencyKey`, and the payload.
      * `[✅]`   Insert: one batch insert of every row. Failure → `CompressJobEnqueueError`, `retriable: false`, no partial success. Success → `{ createdCount }` equal to the row count.
      * `[✅]`   Ordering and side effects: exactly one read before any write; zero writes on every error path and on the dedup hit; the function sets no parent status.

   * `[✅]`   `enqueueCompressJobs.mock.ts`
      * `[✅]`   `buildDialecticCompressJobPayload` composes `buildDialecticBaseJobPayload()` for the inherited members and overrides only what this payload narrows or adds; its base literal drops `job_type` and `user_id`.
      * `[✅]`   `buildenqueueCompressJobsParams` supplies a `userJwt` default beside its existing `modelSlug` default.
      * `[✅]`   `DialecticCompressJobPayloadOverrides`, `DialecticCompressJobPayloadCorruptions`, `invalidateDialecticCompressJobPayload` and every other symbol in the file keep their names and shapes; the corruption type follows the narrowed member set through `keyof`.
   
   * `[✅]`   `_shared/dialectic.mock.ts` gains `DialecticBaseJobPayloadOverrides`, `buildDialecticBaseJobPayload`, `DialecticBaseJobPayloadCorruptions` and `invalidateDialecticBaseJobPayload` for the newly-guarded owned object type, and `buildDialecticExecuteJobPayload`, `buildDialecticPlanJobPayload`, `buildDialecticRenderJobPayload` and `buildDialecticSimpleJobPayload` each compose the base builder for their inherited members instead of restating them. `buildDialecticSimpleJobPayload` drops `job_type: 'simple'`.

   * `[✅]`   `type_guards.dialectic.test.ts`
      * `[✅]`   Case checklist for `isDialecticBaseJobPayload`, fixtures from `buildDialecticBaseJobPayload` and `invalidateDialecticBaseJobPayload`, never hand-rolled: accepts a full base payload; throws the named diagnostic for each required member absent and for each present-but-wrong-typed — `sessionId`, `projectId`, `model_id`, `walletId`, `user_jwt`, `idempotencyKey`; throws for each optional member present and wrong-typed — `stageSlug`, `iterationNumber`, `continueUntilComplete`, `maxRetries`, `continuation_count`, `target_contribution_id`, `is_test_job`, `model_slug`, `maxOutputTokens`, `sourceContributionId`, `source_prompt_resource_id`; accepts each optional member absent; throws for a non-record root.
      * `[✅]`   A case asserts `source_prompt_resource_id` is admitted by the base allowed-key set rather than reported as an unknown property by a delegating guard.
      * `[✅]`   The existing `isDialecticExecuteJobPayload` and `isDialecticRenderJobPayload` cases stand unchanged, including every asserted base-member diagnostic string, and are the proof that delegation preserved them.
      * `[✅]`   The `isDialecticJobPayload` case over `buildDialecticCompressJobPayload()` stands unchanged.

   * `[✅]`   `type_guards.dialectic.ts`
      * `[✅]`   `dialecticBaseJobPayloadAllowedKeys` is exported as the set of base member names: `sessionId`, `projectId`, `model_id`, `walletId`, `user_jwt`, `idempotencyKey`, `stageSlug`, `iterationNumber`, `continueUntilComplete`, `maxRetries`, `continuation_count`, `target_contribution_id`, `is_test_job`, `model_slug`, `maxOutputTokens`, `sourceContributionId`, `source_prompt_resource_id`.
      * `[✅]`   `isDialecticBaseJobPayload` throws per member, carrying forward verbatim the strings the two legacy guards emit — `Payload must be a non-null object.`, `Missing or invalid sessionId.`, `Missing or invalid projectId.`, `Missing or invalid model_id.`, `Missing or invalid walletId.`, `Missing or invalid user_jwt.`, `Invalid stageSlug.`, `Invalid iterationNumber.`, `Invalid continueUntilComplete.`, `Invalid maxRetries.`, `Invalid continuation_count.`, `Invalid target_contribution_id.`, `Invalid model_slug.`, `Invalid is_test_job.`, `Invalid maxOutputTokens.`, `Invalid sourceContributionId.` — and adds `Missing or invalid idempotencyKey.` and `Invalid source_prompt_resource_id.` for the two members no legacy guard checks. It runs no unknown-key sweep, a base guard having no view of an arm's own keys.
      * `[✅]`   `isDialecticExecuteJobPayload` calls it first, deletes the base member checks it now duplicates, keeps every arm-specific check and its legacy-property check, and sweeps unknown keys against `dialecticBaseJobPayloadAllowedKeys` unioned with its own arm keys.
      * `[✅]`   `isDialecticRenderJobPayload` takes the identical treatment.

   * `[✅]`   `enqueueCompressJobs.guard.test.ts`
      * `[✅]`   Every negative `isDialecticCompressJobPayload` case becomes a thrown-diagnostic assertion; every positive case stays a boolean assertion.
      * `[✅]`   The `rejects missing job_type` case is deleted, that member no longer being on the payload, and is replaced by discriminant corruptions: `mode`, `sourceType`, `content` and `targetKey` each corrupted in turn, each throwing its own diagnostic.
      * `[✅]`   New cases: a payload missing `user_jwt` throws; a payload missing `idempotencyKey` throws; a payload carrying `job_type` throws the unknown-property diagnostic; a payload carrying `user_id` throws it too.
      * `[✅]`   The existing identity cases — the per-`sourceType` `documentKey`, `sourceId` and `role` requirements, the json-mode trio, `model_slug`, `continuation_count`, the `FileType`, `ModelContributionFileTypes` and `DialecticStageSlug` member checks, and the non-record roots — keep their coverage and change only their assertion form.
      * `[✅]`   `isenqueueCompressJobsPayload`, `isenqueueCompressJobsDeps`, `isenqueueCompressJobsSuccessReturn` and `isenqueueCompressJobsErrorReturn` cases are unchanged; those guards keep their boolean contracts.
      * `[✅]`   `isenqueueCompressJobsParams` gains a case rejecting an absent or empty `userJwt`.

   * `[✅]`   `enqueueCompressJobs.guard.ts`
      * `[✅]`   `isDialecticCompressJobPayload` calls `isDialecticBaseJobPayload` first, deletes its `job_type` check and its `sessionId`, `projectId`, `model_id`, `walletId`, `user_id` and `continuation_count` checks, and keeps `stageSlug`, `iterationNumber` and `model_slug` as its own narrowing checks because it requires what the base leaves optional.
      * `[✅]`   It throws per member for `targetKey`, `mode`, `content`, `sourceType`, the per-`sourceType` identity members, the json-mode trio, `chunk_index` and `chunk_total`, each diagnostic naming the member and what it held.
      * `[✅]`   It sweeps unknown keys against `dialecticBaseJobPayloadAllowedKeys` unioned with its own arm keys, which is what makes a stray `job_type` or `user_id` a named failure rather than a silently tolerated member.
      * `[✅]`   It does not catch the base guard's throw.
      * `[✅]`   `isenqueueCompressJobsParams` gains a non-empty-string check for `userJwt` and keeps its boolean contract, that guard covering a params object assembled in trusted TypeScript rather than a payload crossing a runtime boundary.

   * `[✅]`   `enqueueCompressJobs.test.ts`
      * `[✅]`   The case asserting `isDialecticCompressJobPayload(firstRow.payload)` is `true` stands, and is now also the proof that a constructed child payload survives the base guard.
      * `[✅]`   A case asserts the inserted child payload carries `user_jwt` equal to `params.userJwt`.
      * `[✅]`   A case asserts the inserted child payload's `idempotencyKey` equals its row's `idempotency_key`, for a fitting victim and for each chunk of a split victim.
      * `[✅]`   A case asserts the inserted child payload carries neither `job_type` nor `user_id`, and that the row carries both.
      * `[✅]`   Every existing case — dedup skip, chunking, idempotency-key composition, insert failure, and the identity and mode validation branches — keeps its coverage.

   * `[✅]`   `enqueueCompressJobs.ts`
      * `[✅]`   The child payload literal carries `user_jwt: params.userJwt` and `idempotencyKey` set to this child's own key, and drops `job_type` and `user_id`.
      * `[✅]`   The idempotency key is computed once per child and used in both places it belongs — the payload member and the row column — never computed twice.
      * `[✅]`   The row literal is unchanged: it keeps `job_type: 'COMPRESS'`, `user_id` from `params.parentJob.user_id`, and `idempotency_key`.
      * `[✅]`   Every other branch, error type, retriable flag and return value is unchanged.

   * `[✅]`   `enqueueCompressJobs.integration.test.ts`
      * `[✅]`   The `row.payload.user_id` assertion is deleted; the `row.user_id` assertion beside it already proves the owner is recorded, and the payload no longer carries the member.
      * `[✅]`   Assertions are added that `row.payload.user_jwt` equals `params.userJwt` and that `row.payload.idempotencyKey` equals `row.idempotency_key`.
      * `[✅]`   An assertion is added that `row.payload` carries no `job_type` key.
      * `[✅]`   The remaining payload assertions — `model_id`, `walletId`, `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `mode`, `content`, `chunk_index`, `chunk_total`, `sourceType`, `documentKey` — and every row assertion stand unchanged.
      * `[✅]`   The suite mocks only Supabase; `constructStoragePath`, the text splitter and the token counter stay real.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports the base type from `dialectic-service`, the base guard from `_shared/utils/type-guards`, and the base builder from `_shared`. It exports nothing to either.
      * `[✅]`   The hub's existing type-only import of `DialecticCompressJobPayload` for the `DialecticJobPayload` union is the one edge in the other direction; it predates this node and is unchanged by it.
      * `[✅]`   `enqueueCompressJobs.provides.ts` re-exports the interface, guard, mock and implementation with `export *`, so the re-based type and the changed guard reach consumers without an edit to that file.
      * `[✅]`   No cycle: `type_guards.dialectic.ts` imports types from the hub and never from `dialectic-worker`.

   * `[✅]`   `requirements`
      * `[✅]`   A `DialecticCompressJobPayload` value is assignable to `DialecticBaseJobPayload` — interface test.
      * `[✅]`   `job_type` and `user_id` are not members of `DialecticCompressJobPayload`, and `user_jwt` and `idempotencyKey` are required members — interface test.
      * `[✅]`   `enqueueCompressJobsParams` declares thirteen fields — interface test.
      * `[✅]`   `isDialecticBaseJobPayload` throws a distinct named diagnostic for every base member, and accepts every optional member's absence — guard test.
      * `[✅]`   `isDialecticExecuteJobPayload` and `isDialecticRenderJobPayload` emit their current diagnostic strings for every base member after delegating — guard test, unchanged cases.
      * `[✅]`   `isDialecticCompressJobPayload` throws for each of its own malformed members and for a stray `job_type` or `user_id` — guard test.
      * `[✅]`   An inserted child payload carries `user_jwt` from params and `idempotencyKey` equal to its row's `idempotency_key` — unit test and integration test.
      * `[✅]`   An inserted child payload carries neither `job_type` nor `user_id`, and its row carries both — unit test and integration test.
      * `[✅]`   Dedup skip, chunk fan-out, insert failure and every identity and mode validation branch return exactly what they return now — unit test and integration test.

* `[✅]`   supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts **[BE] Re-base `DialecticRenderCompressedContextJobPayload` on `DialecticBaseJobPayload`, narrowing `stageSlug` and `iterationNumber` to required and delegating its guard to the base guard for every inherited member; add the non-throwing `isCompressedRenderPayloadShape` selection predicate; declare the inline payload union once as `EnqueueRenderJobCallPayload`**

   * `[✅]`   `objective`
      * `[✅]`   Solve contract divergence in the RENDER dispatch path: `DialecticRenderCompressedContextJobPayload` declares its own `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id` and `walletId` rather than inheriting them, so the two compression payloads spell the same six facts twice and its guard restates six member checks the base guard makes. The function's payload parameter and its `renderPayload` local each compose a union inline at their annotation sites, so no type file declares what either accepts, and the local carries "either payload" through a body that has already branched and knows which one it holds.
      * `[✅]`   Functional goals:
         * `[✅]`   `DialecticRenderCompressedContextJobPayload` extends `DialecticBaseJobPayload`, adding `targetKey`, `sourceType`, `documentKey` and `template_filename`, and narrowing the base's optional `stageSlug` and `iterationNumber` to required because `processRenderJob` reads both to build `RenderCompressedContextParams`.
         * `[✅]`   `isDialecticRenderCompressedContextJobPayload` delegates every inherited member to `isDialecticBaseJobPayload` and throws a per-member diagnostic for the members it declares.
         * `[✅]`   `EnqueueRenderJobCallPayload` is declared once in `enqueueRenderJob.interface.ts`, and `EnqueueRenderJobFn` and `BoundEnqueueRenderJobFn` annotate their payload parameter with that name.
         * `[✅]`   `isCompressedRenderPayloadShape` is a plain boolean predicate in this module's guard file, answering whether a row's payload is the compressed form, for `processRenderJob` to select on.
         * `[✅]`   Each branch of `enqueueRenderJob` holds one concrete payload type and builds its own insert row from it; no local carries a union.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Every existing success path, error type, retriable flag, log line and idempotency key is byte-identical after the restructure; this changes which type a local holds, never what the function does.
         * `[✅]`   `isEnqueueRenderCompressedContextPayload` stays a plain boolean type predicate. The call payload is not a job payload, extends no base, and is the entry selector between this function's two branches — a throw there would raise on every ordinary contribution dispatch.
         * `[✅]`   The single insert, its `23505` idempotency recovery, and the `idempotencyKey` local that recovery reads are unchanged.
      * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer job spawning — deciding whether a RENDER row is warranted, resolving its template, and inserting it — plus the contract producers its one implementation owns: both render payload types' contracts and every guard over them.
      * `[✅]`   The role is correct because this function is the sole creator of `DialecticRenderCompressedContextJobPayload`, so its re-basing, its guard and the selection predicate its consumer reads all belong to this file's node.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit `processRenderJob.ts`; it consumes the predicate this node lands and has its own node immediately after.
         * `[✅]`   Do not change `DialecticRenderJobPayload`, which already extends the base, or `isDialecticRenderJobPayload`, which the sibling node's guard family already covers.
         * `[✅]`   Do not change render decision policy, template resolution, or notification behavior on either branch.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/enqueueRenderJob` — render-warranted decision, template resolution, row identity, and insertion, for a contribution source and for a compressed source alike.
      * `[✅]`   Inside boundary:
         * `[✅]`   Both call payload shapes and the union of them, this function being the only caller-facing entry that accepts either.
         * `[✅]`   The compressed row payload's shape and its guard, this function being its creator.
         * `[✅]`   The structural question of which form a row's payload takes, which is this module's knowledge and no consumer's.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DialecticRenderJobPayload`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `DialecticBaseJobPayload` and `isDialecticBaseJobPayload`, owned by the hub and the shared guard module.
         * `[✅]`   What a RENDER row does once inserted.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticBaseJobPayload`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound; this module already imports `DialecticRenderJobPayload` from it, so no new direction is opened.
         * `[✅]`   Purpose: supply the root the compressed row payload extends.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticBaseJobPayload`, `dialecticBaseJobPayloadAllowedKeys`).
         * `[✅]`   Layer classification: shared runtime boundary.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: validate the inherited members once, and supply the base half of this guard's unknown-key sweep.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticBaseJobPayload`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of the base type's builder.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: supply the base defaults this module's builder composes rather than restates.
      * `[✅]`   Confirm:
         * `[✅]`   `EnqueueRenderJobDeps` is unchanged — `dbClient`, `logger`, `shouldEnqueueRenderJob`, `resolveTemplateFilename`.
         * `[✅]`   `EnqueueRenderJobParams` is unchanged; the compressed branch continues to read `userAuthToken`, `modelId`, `walletId`, `projectId`, `sessionId`, `stageSlug` and `iterationNumber` from it.
         * `[✅]`   No reverse dependency: neither `_shared` nor `dialectic-service` gains an import of this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From the hub: the `DialecticBaseJobPayload` type only, imported with `import type`.
         * `[✅]`   From the shared guard module: the base guard predicate and the allowed-key set only.
         * `[✅]`   From the shared mock: the base builder only.

   * `[✅]`   `enqueueRenderJob.interface.test.ts`
      * `[✅]`   The `DialecticRenderCompressedContextJobPayload declares all twelve keys` case is restated rather than adjusted. It is a `Record<keyof …, true>` exhaustiveness case, and once the type extends the base, `keyof` spans every base member, so a key count proves nothing about what this payload adds. It becomes a case asserting the four members this payload declares — `targetKey`, `sourceType`, `documentKey`, `template_filename` — by typed literal.
      * `[✅]`   A case proves membership of the base by typed assignment: a `DialecticRenderCompressedContextJobPayload` value is assignable to `DialecticBaseJobPayload`.
      * `[✅]`   A case proves `stageSlug` and `iterationNumber` are required on this payload where the base declares them optional, and that the six formerly-local members — `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id`, `walletId` — are still required through inheritance.
      * `[✅]`   A case proves `EnqueueRenderJobCallPayload` is the declared payload parameter of both function types, by assigning each member type to `Parameters<EnqueueRenderJobFn>[2]` and `Parameters<BoundEnqueueRenderJobFn>[1]` through a value typed as the named union.
      * `[✅]`   The `EnqueueRenderCompressedContextPayload declares all five keys` case, the return-union case and the signature case are unchanged.

   * `[✅]`   `enqueueRenderJob.interface.ts`
      * `[✅]`   `EnqueueRenderJobCallPayload` is declared as the union of `EnqueueRenderJobPayload` and `EnqueueRenderCompressedContextPayload`, beside those two declarations; `EnqueueRenderJobFn` and `BoundEnqueueRenderJobFn` annotate their payload parameter with it and compose no union at their own annotation sites.
      * `[✅]`   `DialecticRenderCompressedContextJobPayload` becomes `extends DialecticBaseJobPayload`, importing it from `../../dialectic-service/dialectic.interface.ts` with `import type`.
      * `[✅]`   It declares `targetKey: ModelContributionFileTypes`, `sourceType: CompressionSourceType`, `documentKey: FileType` and `template_filename: string`, and redeclares `stageSlug: DialecticStageSlug` and `iterationNumber: number` solely to narrow the base's optional forms to required.
      * `[✅]`   It declares no `idempotencyKey`, no `projectId`, no `sessionId`, no `user_jwt`, no `model_id` and no `walletId`; all six are inherited.
      * `[✅]`   `EnqueueRenderJobDeps`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, `EnqueueRenderCompressedContextPayload` and the return union are unchanged.

   * `[✅]`   `enqueueRenderJob.interaction.spec`
      * `[✅]`   Entry selection: `isEnqueueRenderCompressedContextPayload` over the call payload chooses the compressed branch; anything else takes the contribution branch. The predicate returns a boolean and throws nothing, both call payload shapes being ordinary call data with no base.
      * `[✅]`   Compressed branch, render decision: `deps.shouldEnqueueRenderJob` over the source's `docType` and `sourceStageSlug`. A query or config failure reason → `RenderJobEnqueueError`, `retriable: false`. `is_json` → success `{ renderJobId: null }`. Any reason other than a rendering `is_markdown` → success `{ renderJobId: null }`.
      * `[✅]`   Compressed branch, template: `deps.resolveTemplateFilename` over the source's coordinates. Its `TemplateResolutionError` is returned UNCHANGED, never reconstructed.
      * `[✅]`   Compressed branch, payload: build one `DialecticRenderCompressedContextJobPayload` held in a const of that exact type — the branch knows which form it is building, so nothing here is typed as "either payload". Its `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id` and `walletId` come from `params` exactly as they do now, and are inherited members rather than locally declared ones. Failing `isDialecticRenderCompressedContextJobPayload` surfaces that guard's own per-member diagnostic; failing `isJson` → `RenderJobValidationError`, `retriable: false`.
      * `[✅]`   Contribution branch: unchanged in every particular — the continuation skip, the render decision, the documentIdentity, documentKey and contributionId validations, template resolution, and the `DialecticRenderJobPayload` construction, now held in a const of that exact type and proven by `isDialecticRenderJobPayload` and `isJson` as it is today.
      * `[✅]`   Row construction moves into each branch: each builds its own `TablesInsert<"dialectic_generation_jobs">` from its own concrete payload, carrying `job_type: 'RENDER'`, `session_id`, `stage_slug`, `iteration_number`, `parent_job_id`, `payload`, `is_test_job`, `status: 'pending'`, `user_id` and `idempotency_key`. The row type is one named type, not a union, so the local that carries it holds one type.
      * `[✅]`   Shared tail, unchanged: one insert of that row; on a `23505` conflict naming `idempotency_key`, re-select by the `idempotencyKey` local and return the recovered `{ renderJobId }`; a failed recovery or any other insert failure → `RenderJobEnqueueError` with the existing programmer-error classification and retriable flag; otherwise `{ renderJobId }` from the inserted row.
      * `[✅]`   Ordering and side effects: at most one write per call; zero writes on every early return and every error path; the `23505` re-select is the only read after the write.

   * `[✅]`   `enqueueRenderJob.mock.ts`
      * `[✅]`   `buildDialecticRenderCompressedContextJobPayload` composes `buildDialecticBaseJobPayload()` for the six inherited members and overrides only what this payload adds or narrows.
      * `[✅]`   `DialecticRenderCompressedContextJobPayloadOverrides`, `DialecticRenderCompressedContextJobPayloadCorruptions` and `invalidateDialecticRenderCompressedContextJobPayload` keep their names and shapes; both follow the re-based member set through `Partial` and `keyof`.
      * `[✅]`   `EnqueueRenderJobPayload` and `EnqueueRenderCompressedContextPayload` builders and invalidators are unchanged; the named call union is a union type and takes no builder of its own, its two members each already having one.

   * `[✅]`   `enqueueRenderJob.guard.test.ts`
      * `[✅]`   Every negative `isDialecticRenderCompressedContextJobPayload` case becomes a thrown-diagnostic assertion; the positive case stays a boolean assertion.
      * `[✅]`   Case checklist for the members this payload declares: `targetKey` absent and wrong-typed; `sourceType` absent, wrong-typed, and a valid `CompressionSourceType` outside `'contribution' | 'resource'`; `documentKey` absent and not a `FileType`; `template_filename` absent and empty; `stageSlug` and `iterationNumber` absent, proving the narrowing the base does not enforce.
      * `[✅]`   Cases proving delegation: each inherited member corrupted in turn throws the base guard's own diagnostic, unchanged and uncaught.
      * `[✅]`   Case checklist for `isCompressedRenderPayloadShape`: `true` for a built compressed row payload; `false` for a built `DialecticRenderJobPayload`, which is the discrimination the predicate exists to make; `false` for a record carrying `targetKey` without `sourceType` and for one carrying `sourceType` without `targetKey`; `false` for a record carrying both alongside `documentIdentity` or `sourceContributionId`; `false` for non-record roots. Every case asserts a boolean and none asserts a throw.
      * `[✅]`   `isEnqueueRenderJobDeps`, `isEnqueueRenderJobParams`, `isEnqueueRenderJobPayload`, `isEnqueueRenderCompressedContextPayload`, `isEnqueueRenderJobSuccessReturn` and `isEnqueueRenderJobErrorReturn` cases are unchanged; those guards keep their boolean contracts.

   * `[✅]`   `enqueueRenderJob.guards.ts`
      * `[✅]`   `isDialecticRenderCompressedContextJobPayload` calls `isDialecticBaseJobPayload` first and deletes its `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id` and `walletId` checks; it keeps `stageSlug` and `iterationNumber` as its own checks because it requires what the base leaves optional.
      * `[✅]`   It throws a per-member diagnostic for `targetKey`, `sourceType` including the `'contribution' | 'resource'` restriction, `documentKey`, `template_filename`, `stageSlug` and `iterationNumber`, each naming the member and what it held, and it does not catch the base guard's throw.
      * `[✅]`   It sweeps unknown keys against `dialecticBaseJobPayloadAllowedKeys` unioned with its own four arm keys, matching the sweep its sibling payload guards enforce.
      * `[✅]`   `isCompressedRenderPayloadShape(value: unknown): boolean` returns `true` when the value is a record carrying both `targetKey` and `sourceType` and carrying neither `documentIdentity` nor `sourceContributionId`, and `false` otherwise. It is a selection predicate, not a type predicate: it narrows nothing, throws nothing, and answers only which arm a caller should take.
      * `[✅]`   `isEnqueueRenderCompressedContextPayload` is untouched, and stays the boolean entry selector between this function's two branches.

   * `[✅]`   `enqueueRenderJob.test.ts`
      * `[✅]`   The COMPRESS-dispatch happy-path case stands, and its `isDialecticRenderCompressedContextJobPayload` assertion over the inserted payload is now also the proof that a constructed compressed payload survives the base guard.
      * `[✅]`   A case asserts the inserted compressed payload carries `user_jwt` from `params.userAuthToken`, `model_id` from `params.modelId` and `walletId` from `params.walletId` — the members that moved from local declaration to inheritance and must still be written.
      * `[✅]`   A case asserts the inserted row's `idempotency_key` equals the payload's own `idempotencyKey` on both branches, pinning that the per-branch row construction did not drift.
      * `[✅]`   Every existing case — the render-decision skips, the query-failure error, the `TemplateResolutionError` passthrough, the contribution-branch validation failures, the insert failure classification and the `23505` recovery — keeps its coverage and its assertions unchanged, and is this restructure's regression oracle.

   * `[✅]`   `enqueueRenderJob.ts`
      * `[✅]`   The `let renderPayload: DialecticRenderJobPayload | DialecticRenderCompressedContextJobPayload` local is deleted. Each branch declares its payload as a const of that branch's own concrete type and proves it with that type's own guard, as both branches already do.
      * `[✅]`   Each branch builds its own `TablesInsert<"dialectic_generation_jobs">` row from its own payload; the shared tail holds one local of that single named type and performs the one insert.
      * `[✅]`   The `idempotencyKey` local stays a plain `string`, computed per branch as it is now and read by the `23505` recovery select.
      * `[✅]`   The payload parameter is annotated `EnqueueRenderJobCallPayload`.
      * `[✅]`   Every log line, error message, error type, retriable flag, early return and success value is unchanged.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports the base type from `dialectic-service`, the base guard and allowed-key set from `_shared/utils/type-guards`, and the base builder from `_shared`. It exports nothing to any of them.
      * `[✅]`   `enqueueRenderJob.provides.ts` re-exports this module's interface, guards, mock and implementation, so the named union, the re-based payload and the new predicate reach `processRenderJob` without an edit to that file.
      * `[✅]`   No cycle: the hub declares `DialecticRenderJobPayload` and imports nothing from this module.

   * `[✅]`   `requirements`
      * `[✅]`   A `DialecticRenderCompressedContextJobPayload` value is assignable to `DialecticBaseJobPayload`, and its six formerly-local members are required through inheritance — interface test.
      * `[✅]`   `stageSlug` and `iterationNumber` are required on the payload where the base declares them optional — interface test.
      * `[✅]`   Both function types declare `EnqueueRenderJobCallPayload` as their payload parameter, and each member type assigns to it — interface test.
      * `[✅]`   `isDialecticRenderCompressedContextJobPayload` throws a named diagnostic for each of its declared members and propagates the base guard's diagnostic for each inherited one — guard test.
      * `[✅]`   `isCompressedRenderPayloadShape` returns `true` for a compressed row payload and `false` for a contribution row payload, and throws on nothing — guard test.
      * `[✅]`   The inserted compressed payload carries `user_jwt`, `model_id` and `walletId` from params, and the inserted row's `idempotency_key` matches its payload's `idempotencyKey` on both branches — unit test.
      * `[✅]`   Every render-decision skip, template error passthrough, validation failure, insert failure classification and `23505` recovery returns exactly what it returns now — unit test, existing cases unchanged.

* `[✅]`   supabase/functions/dialectic-worker/processRenderJob.ts **[BE] Select the compressed-row arm with `isCompressedRenderPayloadShape` from inside the `try`, so a contribution RENDER row routes instead of raising uncaught at a selector sitting ahead of the catch; both arms narrow with their own throwing guard inside the arm**

   * `[✅]`   `objective`
      * `[✅]`   Solve an uncaught-throw path at the arm selector. This function chooses its compressed arm by calling `isDialecticRenderCompressedContextJobPayload` as a predicate, ahead of the `try` that fails the row and reports. That guard throws, so an ordinary contribution RENDER row — the row the compressed guard exists to reject — raises out of the function before any status update and before any failure notification, and the row is left in `processing` with nothing recorded. Both rows carry `job_type: 'RENDER'`, so the column cannot separate them and the selection is structural.
      * `[✅]`   Functional goals:
         * `[✅]`   The compressed arm is selected by `isCompressedRenderPayloadShape`, which returns a boolean and throws nothing.
         * `[✅]`   The selection sits inside the `try`, so a throw from either arm's narrowing guard reaches the catch that already marks the row failed.
         * `[✅]`   The compressed arm narrows with `isDialecticRenderCompressedContextJobPayload` inside the arm, where its per-member diagnostic names the member at fault instead of misrouting.
         * `[✅]`   A compressed row that fails narrowing is marked failed and sends no notification, compression being invisible infrastructure.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `processCompressedRenderJob` is unchanged: it builds `RenderCompressedContextParams` from the payload, renders through `ctx.documentRenderer`, writes its own completed or failed row, and sends no notification of any kind.
         * `[✅]`   The contribution arm is unchanged in every particular — its payload narrowing, its `render_started` and `render_chunk_completed` notifications, its `pathContext` results write, and its `job_failed` notification.
         * `[✅]`   No dependency, parameter or return type changes; this function keeps its `(dbClient, job, projectOwnerUserId, ctx, authToken) => Promise<void>` shape.
      * `[✅]`   Each goal is proven by a named case in this file's test suite.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer job dispatch — routing a RENDER row to the renderer and recording its outcome.
      * `[✅]`   The role is correct because this function is the only consumer that must tell the two RENDER payload forms apart, and it is the sole site of the workstream's structural-selection form.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not author `isCompressedRenderPayloadShape`; the `enqueueRenderJob` node that precedes this one owns and lands it.
         * `[✅]`   Do not change what either arm renders, what either writes, or which notifications the contribution arm sends.
         * `[✅]`   Do not add a notification to the compressed arm on any path, success or failure.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is RENDER job dispatch in `supabase/functions/dialectic-worker/processRenderJob.ts` — arm selection, params assembly per arm, renderer invocation, and row status.
      * `[✅]`   Inside boundary:
         * `[✅]`   Which arm a RENDER row takes, and what is recorded when a row cannot be narrowed.
         * `[✅]`   Notification policy per arm.
      * `[✅]`   Outside boundary:
         * `[✅]`   Both payload shapes, their guards and the selection predicate, owned by the `enqueueRenderJob` module.
         * `[✅]`   Rendering itself, owned by `renderDocument`.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `./enqueueRenderJob/enqueueRenderJob.guards.ts` (`isCompressedRenderPayloadShape`, alongside the already-imported `isDialecticRenderCompressedContextJobPayload`).
         * `[✅]`   Layer classification: sibling app-layer module, the owner of both RENDER payload contracts.
         * `[✅]`   Direction: inbound; this file already imports that guard file and the payload type it declares, so no new direction is opened.
         * `[✅]`   Purpose: answer which payload form a row carries without throwing, so the answer can be used to choose an arm.
      * `[✅]`   Confirm:
         * `[✅]`   `IRenderJobContext` is unchanged; no member is added, removed or retyped.
         * `[✅]`   No reverse dependency: the `enqueueRenderJob` module gains no import of this file.

   * `[✅]`   `processRenderJob.interaction.spec`
      * `[✅]`   Entry: the function opens its `try` immediately. Nothing that can throw runs ahead of it.
      * `[✅]`   Arm selection, inside the `try`: `isCompressedRenderPayloadShape(job.payload)` — a boolean answer over a record carrying `targetKey` and `sourceType` and carrying neither `documentIdentity` nor `sourceContributionId`. True selects the compressed arm; false falls through to the contribution arm.
      * `[✅]`   Compressed arm, narrowing: `isDialecticRenderCompressedContextJobPayload(job.payload)` narrows the payload for the arm. It throws a per-member diagnostic on any malformed member, and that throw reaches this function's catch. The narrowing is written as the file's existing idiom — a negated guard whose body throws — because that is what narrows the value for the compiler; the throwing guard means the body is structurally unreachable, exactly as the contribution arm's equivalent already is.
         * `[✅]`   Outcome: `processCompressedRenderJob` is called with the narrowed payload and returns; that helper writes its own completed or failed row and sends no notification.
      * `[✅]`   Contribution arm: unchanged — the payload narrowing, the required-value validations, `RenderDocumentParams` assembly, the `render_started` notification, the `renderDocument` call, the `render_chunk_completed` notification, and the completed-status write carrying the `pathContext` results.
      * `[✅]`   Catch: unchanged in what it records — the error is logged and the row is marked failed with `error_details`. Its `job_failed` notification block gains one condition: it is skipped when `isCompressedRenderPayloadShape(job.payload)` is true, so a compressed row that failed narrowing is recorded without notifying. The predicate is safe in a catch precisely because it throws nothing.
      * `[✅]`   Ordering and side effects: at most one row write per invocation on every path; a compressed row that reaches its arm writes only through `processCompressedRenderJob`; no notification is sent on any compressed path.

   * `[✅]`   `processRenderJob.test.ts`
      * `[✅]`   The cases that route a compressed row through `makeCompressedRenderJob` stand, and now prove selection by the predicate rather than by the guard.
      * `[✅]`   A case proves the defect is closed: a contribution RENDER row is routed to the contribution arm and completes, rather than raising at the selector. Arranged with both a contribution row and a compressed row so the assertion cannot hold if the selection were deleted.
      * `[✅]`   A case proves a compressed row whose payload is malformed — a member corrupted through `invalidateDialecticRenderCompressedContextJobPayload` — is marked `failed` with the guard's own diagnostic in `error_details`, and that `sendJobNotificationEvent` is never called for it.
      * `[✅]`   A case proves a contribution row whose payload is malformed still marks `failed` and still sends its `job_failed` notification, pinning that the skip is scoped to the compressed form.
      * `[✅]`   The compressed payload literal the suite builds is unchanged; every member it sets is still a member of the re-based type.
      * `[✅]`   Every existing contribution-path case — notifications, results write, renderer failure, and the required-value validations — keeps its coverage and its assertions.

   * `[✅]`   `processRenderJob.ts`
      * `[✅]`   The pre-`try` selector is deleted; the `try` opens the function body.
      * `[✅]`   The compressed arm is the first branch inside the `try`: select with `isCompressedRenderPayloadShape`, narrow with `isDialecticRenderCompressedContextJobPayload`, then `return await processCompressedRenderJob(dbClient, job, ctx, job.payload, projectOwnerUserId)`.
      * `[✅]`   `isCompressedRenderPayloadShape` is imported from `./enqueueRenderJob/enqueueRenderJob.guards.ts`, beside the guard already imported from it.
      * `[✅]`   The catch's `job_failed` notification block is gated so it does not fire for a compressed row; the failed-status write above it is unconditional and unchanged.
      * `[✅]`   `processCompressedRenderJob`, the contribution arm, and every log line, notification payload, status write and error message are otherwise unchanged.

   * `[✅]`   `processRenderJob.integration.test.ts`
      * `[✅]`   Boundary: `enqueueRenderJob` → the `dialectic_generation_jobs` row it inserts → that row read back → `processRenderJob` → `renderDocument` → the rendered artifact and the notification rows. Every function in that chain runs real: both payload guards, `isDialecticBaseJobPayload`, `isCompressedRenderPayloadShape`, `isEnqueueRenderCompressedContextPayload`, `shouldEnqueueRenderJob`, `resolveTemplateFilename`, the document renderer and `sendJobNotificationEvent`. The row the consumer routes on is the row the producer wrote, read back out of the database.
      * `[✅]`   Mocked: nothing. The only external boundary this repo mocks is the AI provider adapter, and no function in this chain calls a model. The suite runs against the local Supabase stack through `_shared/_integration.test.utils.ts` — `coreInitializeTestStep` for the project, session, user and wallet, `initializeSupabaseAdminClient` for direct row arrangement and read-back, `coreCleanupTestResources` for rollback.
      * `[✅]`   A case dispatches a compressed source through `enqueueRenderJob`, selects the inserted row back out of `dialectic_generation_jobs`, and drives `processRenderJob` over it: the compressed arm is taken, the row reaches `completed` through `processCompressedRenderJob`, the rendered artifact is written, and `notification_events` holds no row for that job.
      * `[✅]`   A case does the same for a contribution source: the contribution arm is taken, the row completes, and its `render_started` and `render_chunk_completed` notification rows are present. It is arranged in the same case as the compressed dispatch, so neither assertion can hold if the selection were deleted — the compressed guard would route both rows to the compressed arm.
      * `[✅]`   A case writes a compressed row whose stored `payload` jsonb carries one member corrupted through `invalidateDialecticRenderCompressedContextJobPayload`, and proves `processRenderJob` marks it `failed` with that member's own diagnostic in `error_details`, sends no notification, and raises nothing out of the function. The corruption is real untrusted data read back from a real jsonb column.
      * `[✅]`   A case arranges a source whose `docType` makes the real `shouldEnqueueRenderJob` answer `is_json`, and proves no row is inserted at all and `renderJobId` is `null`. The decision is made by the real function over real data, never handed to it.
      * `[✅]`   A case dispatches twice with the same identity and proves the second insert raises a genuine `23505` on the `idempotency_key` unique constraint, that the recovery returns the existing `renderJobId`, and that the recovered row still routes to its own arm through `processRenderJob`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this file imports both payload guards and the selection predicate from the `enqueueRenderJob` module, which owns them, and exports nothing back to it.
      * `[✅]`   No cycle: `enqueueRenderJob` imports nothing from this file.

   * `[✅]`   `requirements`
      * `[✅]`   A contribution RENDER row routes to the contribution arm and completes — unit test.
      * `[✅]`   A compressed RENDER row routes to the compressed arm and completes through `processCompressedRenderJob` — unit test.
      * `[✅]`   A compressed row with a malformed payload is marked `failed` carrying the guard's per-member diagnostic, with no notification sent — unit test.
      * `[✅]`   A contribution row with a malformed payload is marked `failed` and its `job_failed` notification is sent — unit test.
      * `[✅]`   No compressed path sends a notification of any kind — unit test.
      * `[✅]`   A row `enqueueRenderJob` inserts for a compressed source routes to the compressed arm, and one it inserts for a contribution source routes to the contribution arm — integration test.
      * `[✅]`   A stored compressed payload with a corrupted member is marked `failed` with that member's diagnostic and raises nothing — integration test.
      * `[✅]`   An `is_json` decision inserts no row, and a `23505` conflict returns the existing row, which still routes to its arm — integration test.

* `[✅]`   supabase/migrations/20260804163845_compression_prompt_provenance.sql **[DB] Add `dialectic_project_resources.source_prompt_resource_id` with its self-referencing FK, mirroring the `dialectic_contributions` column; regenerate `types_db.ts`**

* `[✅]`   supabase/functions/_shared/services/file_manager.ts **[BE] Write `source_prompt_resource_id` on both artifact-table inserts under one column name; `ResourceUploadContext` gains `sourcePromptResourceId`**

   * `[✅]`   `objective`
      * `[✅]`   Solve two provenance columns with no writer. `dialectic_contributions.source_prompt_resource_id` has existed since `20250922165259_document_centric_generation.sql` and `dialectic_project_resources.source_prompt_resource_id` exists as of this workstream's migration, and this service — the only writer of either table — sets neither. `ContributionMetadata` already carries `source_prompt_resource_id`, so the value reaches this function and is dropped on the floor; a resource upload has no member to carry one at all. Every produced artifact is therefore unable to name the prompt that produced it.
      * `[✅]`   Functional goals:
         * `[✅]`   The `TablesInsert<'dialectic_contributions'>` literal carries `source_prompt_resource_id: meta.source_prompt_resource_id ?? null`.
         * `[✅]`   `ResourceUploadContext` declares `sourcePromptResourceId?: string`, beside `resourceTypeForDb` and `resourceDescriptionForDb`.
         * `[✅]`   The `TablesInsert<'dialectic_project_resources'>` literal carries `source_prompt_resource_id: resourceContext.sourcePromptResourceId ?? null`, beside the `source_contribution_id` line that reads its own provenance member the same way.
         * `[✅]`   Both tables record the value under one column name and one spelling, so a produced row of either kind names its prompt through the same column.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   The new member is optional, so every existing `ResourceUploadContext` construction in the repo compiles unchanged and registers `null`.
         * `[✅]`   No other column on either insert changes, and neither the resource upsert's `onConflict` target nor the contribution insert's transient-retry loop is touched.
         * `[✅]`   The feedback branch, the `getFile` path, the assembly path and every storage operation are untouched; this node writes two columns and declares one member.
         * `[✅]`   `PathContext` gains nothing: the value addresses nothing about where a file lands, and the contribution path already carries it on the metadata rather than the path.
      * `[✅]`   Each goal is proven by a named case in this service's upload suite.

   * `[✅]`   `role`
      * `[✅]`   Node role is infrastructure: the one service that writes an artifact row for every kind of artifact the pipeline produces.
      * `[✅]`   The role is correct because provenance is a property of the row, and this is the only place a row is written. A writer elsewhere would be a second insert path for the same table.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not set `sourcePromptResourceId` anywhere; `buildUploadContext` sets it on the resource arm in the node that follows, and `prepareModelJob` puts the id on the job payload that `saveResponse` reads it from.
         * `[✅]`   Do not add the member to `PathContext`, to `constructStoragePath`, or to any path this service builds.
         * `[✅]`   Do not change the contribution retry loop, the resource upsert conflict target, or any storage call.
         * `[✅]`   Do not touch the feedback branch, which has no prompt behind it.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/_shared/services/file_manager.ts` — uploading a file to storage and registering the row that describes it, for contributions, resources and feedback alike.
      * `[✅]`   Inside boundary:
         * `[✅]`   What each artifact table's row records, including which prompt produced it.
         * `[✅]`   The shape of the upload context each arm accepts.
      * `[✅]`   Outside boundary:
         * `[✅]`   Where a value comes from — the job payload, the assembler's return, the upload-context builder.
         * `[✅]`   Where the file lands, owned by `constructStoragePath` and the `PathContext` it reads.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`ResourceUploadContext`, `ContributionMetadata`).
         * `[✅]`   Layer classification: shared type surface, this service's own contract home.
         * `[✅]`   Direction: inbound, already present — this file imports both types today.
         * `[✅]`   Purpose: carry the prompt's resource id into each arm, on the member that arm already uses for its own provenance.
      * `[✅]`   Confirm:
         * `[✅]`   No dependency is added or removed; this node introduces no import.
         * `[✅]`   `IFileManager`, `FileManagerResponse` and `uploadAndRegisterFile`'s signature are unchanged, so every caller compiles untouched.
         * `[✅]`   `isResourceUploadContext` needs no edit: it discriminates the union arm on `pathContext.fileType`, and an optional member changes no arm.
         * `[✅]`   `buildResourceUploadContext` needs no edit: its overrides type is `Omit<Partial<ResourceUploadContext>, 'pathContext'>`, so the new member is settable by override and absent by default, which is exactly what the two test cases require.
      * `[✅]`   `context_slice`
         * `[✅]`   From the types file: the two context types this service already consumes, one member wider.

   * `[✅]`   `file_manager.types.ts`
      * `[✅]`   `ResourceUploadContext` gains `sourcePromptResourceId?: string`, declared beside `resourceTypeForDb` and `resourceDescriptionForDb` — the two members that already exist to populate `dialectic_project_resources` columns directly.
      * `[✅]`   `ContributionMetadata.source_prompt_resource_id`, `UploadContextBase`, `ModelContributionUploadContext`, `UserFeedbackUploadContext`, `UploadContext` and `PathContext` are unchanged.

   * `[✅]`   `file_manager.interaction.spec`
      * `[✅]`   Only the two insert literals change. Every branch selection, storage write, error path and return value keeps its condition and its outcome.
      * `[✅]`   Resource arm, unchanged up to the literal: the `ResourceUploadContext` narrowing, the `resource_description` composition from `resourceDescriptionForDb` and `description`, and the `resourceTypeForDb`-or-path-fileType resolution.
      * `[✅]`   Resource arm, literal: `source_prompt_resource_id` is set from `resourceContext.sourcePromptResourceId ?? null`, alongside `source_contribution_id: pathContextForStorage.sourceContributionId ?? null`. An absent member registers `null`, the column being nullable and every existing caller supplying nothing.
      * `[✅]`   Resource arm, outcome: the same upsert on `storage_bucket,storage_path,file_name`, the same error propagation, the same returned record.
      * `[✅]`   Contribution arm, literal: `source_prompt_resource_id` is set from `meta.source_prompt_resource_id ?? null`, alongside the other metadata-sourced members. An absent member registers `null`.
      * `[✅]`   Contribution arm, outcome: the same transient-retry loop, the same insert, the same error propagation and returned record.
      * `[✅]`   Feedback arm: untouched on every path.
      * `[✅]`   Ordering and side effects: the write count per call is unchanged — one storage write and one row write per upload — and no branch gains a read.

   * `[✅]`   `file_manager.upload.test.ts`
      * `[✅]`   A contract case proves the member by typed assignment: a `ResourceUploadContext` value carrying `sourcePromptResourceId` type-checks, and one omitting it type-checks too. It sits in this suite because the types file has no interface test of its own and this is the suite that exercises the contexts.
      * `[✅]`   A case proves a resource upload carrying `sourcePromptResourceId` registers that value in the `dialectic_project_resources` row, asserted over the captured upsert payload.
      * `[✅]`   A case proves a resource upload omitting it registers `null` in that column, arranged beside the case above so the assertion cannot hold if the line were deleted.
      * `[✅]`   A case proves a contribution upload whose `ContributionMetadata` carries `source_prompt_resource_id` registers that value in the `dialectic_contributions` row, asserted over the captured insert payload.
      * `[✅]`   A case proves a contribution upload omitting it registers `null` in that column.
      * `[✅]`   Fixtures come from `buildResourceUploadContext` and this service's existing contribution-context builder, with only the provenance member overridden; no context is hand-rolled.
      * `[✅]`   Every existing case in this suite, and every case in the errors, getFile and assemble suites, keeps its coverage and its assertions.

   * `[✅]`   `file_manager.ts`
      * `[✅]`   The `TablesInsert<'dialectic_project_resources'>` literal gains `source_prompt_resource_id: resourceContext.sourcePromptResourceId ?? null`, on the line after `source_contribution_id`.
      * `[✅]`   The `TablesInsert<'dialectic_contributions'>` literal gains `source_prompt_resource_id: meta.source_prompt_resource_id ?? null`, among the other `meta`-sourced members.
      * `[✅]`   Nothing else in the file changes: no import, no branch, no storage call, no retry, no error path and no log line.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this service reads its context types from `_shared/types` and writes through the Supabase client it was constructed with; it exports nothing new.
      * `[✅]`   No cycle: the types file imports nothing from this service.
      * `[✅]`   The member is added where the value is already carried on the sibling arm, so both artifact paths reach the same column through their own context rather than through a shared one.

   * `[✅]`   `requirements`
      * `[✅]`   `ResourceUploadContext` declares `sourcePromptResourceId` as an optional string — upload test, typed assignment.
      * `[✅]`   A resource upload carrying the member registers it, and one omitting it registers `null` — upload test.
      * `[✅]`   A contribution upload carrying `source_prompt_resource_id` registers it, and one omitting it registers `null` — upload test.
      * `[✅]`   Every other column on both inserts, the upsert conflict target and the contribution retry loop are exactly what they are now — upload test, existing cases unchanged.

* `[✅]`   supabase/functions/_shared/utils/buildUploadContext/buildUploadContext.ts **[BE] Set `sourcePromptResourceId` on the resource arm's `ResourceUploadContext`, from the same-named member on `BuildUploadContextResourceParams`**

   * `[✅]`   `objective`
      * `[✅]`   Solve one builder whose two arms disagree about provenance. The contribution arm takes `sourcePromptResourceId` on its params and feeds it to `contributionMetadata.source_prompt_resource_id`, so a contribution row can name the prompt that produced it. The resource arm takes no such member and sets none, so a compressed artifact — persisted through this same builder — reaches `file_manager` with nowhere to carry the id, and the column that service now writes has no value to write.
      * `[✅]`   Functional goals:
         * `[✅]`   `BuildUploadContextResourceParams` declares `sourcePromptResourceId: string | undefined` — the same member name, the same type and the same required-but-undefinable form `BuildUploadContextParams` declares.
         * `[✅]`   The resource arm sets `sourcePromptResourceId: params.sourcePromptResourceId` on the `ResourceUploadContext` it returns.
         * `[✅]`   `isBuildUploadContextResourceParams` requires the member present and rejects a non-string, non-undefined value, in the form its sibling guard already uses for the same member.
         * `[✅]`   `buildBuildUploadContextResourceParams` supplies a default for the member, as it does for every other member of that type.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   The arm discriminator is unchanged: `"restOfCanonicalPathParams" in params` still selects the contribution arm, and the new member sits on both params types without touching that decision.
         * `[✅]`   The contribution arm is unchanged in every particular — its path context, its `contributionMetadata` and every member it sets.
         * `[✅]`   The resource arm's `pathContext` gains nothing: the id addresses nothing about where the file lands, which is why it sits on the upload context beside `resourceTypeForDb` rather than on `PathContext`.
         * `[✅]`   The resource arm's `mimeType` selection, `sizeBytes`, `userId` and `description` are unchanged.
      * `[✅]`   Each goal is proven by a named case in this module's interface test, guard test or unit test.

   * `[✅]`   `role`
      * `[✅]`   Node role is a shared pure builder: pre-resolved inputs in, a fully-formed upload context out, with no read, no write and no decision beyond which arm the caller is on.
      * `[✅]`   The role is correct because this is the only place either upload context is assembled, so a member that both artifact tables record has to be carried through here or through nothing.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not set the value from anywhere but the params member; resolving which prompt produced an artifact belongs to the callers — `saveResponse`'s COMPRESS tail for a compressed artifact, and the contribution path for a contribution.
         * `[✅]`   Do not edit `file_manager.ts` or `file_manager.types.ts`; the member on `ResourceUploadContext` and both insert writers land in the node before this one.
         * `[✅]`   Do not add the member to `PathContext` or to either arm's path context.
         * `[✅]`   Do not change the arm discriminator, the identity split this file already carries, or any other member on either arm.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/_shared/utils/buildUploadContext` — assembling an upload context for a model contribution and for a compressed resource from inputs the caller has already resolved.
      * `[✅]`   Inside boundary:
         * `[✅]`   Which members each upload context carries, and which params member each is sourced from.
      * `[✅]`   Outside boundary:
         * `[✅]`   Where any value comes from, every params member being pre-resolved by the caller.
         * `[✅]`   What `file_manager` does with the context, including which column each member lands in.
         * `[✅]`   Where the file is stored, owned by `constructStoragePath` over the path context this builder composes.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`ResourceUploadContext`, `ModelContributionUploadContext`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound, already present — this file imports both context types today, and the member it now sets is the one the previous node declared on the resource context.
         * `[✅]`   Purpose: type the two objects this builder returns.
      * `[✅]`   Confirm:
         * `[✅]`   No dependency is added or removed; this node introduces no import in the implementation, the interface, the guards or the mock.
         * `[✅]`   `buildUploadContext`'s signature is unchanged: one params argument, one union return, so every existing caller compiles.
         * `[✅]`   No reverse dependency: `file_manager` imports nothing from this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From the types file: the two upload context types, one member wider on the resource arm.

   * `[✅]`   `buildUploadContext.interface.test.ts`
      * `[✅]`   The `BuildUploadContextResourceParams` key case declares `sourcePromptResourceId` alongside its existing keys and asserts the new count — exhaustive in both directions, it is the proof the member is required on that type.
      * `[✅]`   A case proves the member's type by typed literal: a `BuildUploadContextResourceParams` value carrying a string, and one carrying `undefined`, both type-check; the member cannot be omitted.
      * `[✅]`   A case proves both params types declare the member under the same name and the same type, by assigning `BuildUploadContextParams["sourcePromptResourceId"]` and `BuildUploadContextResourceParams["sourcePromptResourceId"]` to one another.
      * `[✅]`   Every other case in the file — the contribution params surface, the provider-details and AI-response slices, and the return union — is unchanged.

   * `[✅]`   `buildUploadContext.interface.ts`
      * `[✅]`   `BuildUploadContextResourceParams` gains `sourcePromptResourceId: string | undefined`, with a doc comment naming what it records: the `CompressionPrompt` resource whose model call produced this artifact.
      * `[✅]`   `BuildUploadContextParams`, `BuildUploadContextProviderDetails` and `BuildUploadContextAiResponseSlice` are unchanged.

   * `[✅]`   `buildUploadContext.interaction.spec`
      * `[✅]`   Arm selection, unchanged: `"restOfCanonicalPathParams" in params` selects the contribution arm; anything else takes the resource arm. The function performs no other decision, calls no dependency, and always returns a context.
      * `[✅]`   Contribution arm, unchanged: the path context from the eight members it reads plus the spread canonical params and the conditional `sourceGroupFragment`, and the upload context whose `contributionMetadata` carries `source_prompt_resource_id: params.sourcePromptResourceId` as it does now.
      * `[✅]`   Resource arm, path context: unchanged — the twelve members it reads from the compression identity, with nothing added.
      * `[✅]`   Resource arm, upload context: `pathContext`, `fileContent`, the `isCompressedContextRawJsonFileType` mime selection, `sizeBytes`, `userId` and `description` exactly as now, plus `sourcePromptResourceId: params.sourcePromptResourceId`. An `undefined` params member yields an `undefined` context member, which `file_manager` registers as `null`.
      * `[✅]`   Ordering and side effects: none. This function reads its argument and returns; it has no branch that can fail and no path that throws.

   * `[✅]`   `buildUploadContext.mock.ts`
      * `[✅]`   `buildBuildUploadContextResourceParams` supplies a `sourcePromptResourceId` default in its base literal, in the same form `buildBuildUploadContextParams` supplies for its own copy of the member.
      * `[✅]`   `BuildUploadContextResourceParamsOverrides` and `BuildUploadContextResourceParamsCorruptions` follow the widened type through `Partial` and `keyof` and need no restatement; `invalidateBuildUploadContextResourceParams` is unchanged.
      * `[✅]`   Every other symbol in the file keeps its name, shape and defaults.

   * `[✅]`   `buildUploadContext.guard.test.ts`
      * `[✅]`   `isBuildUploadContextResourceParams` gains the case pair its sibling already has for this member: absent → `false`; present as a non-string, non-undefined value → `false`; present as a string → `true`; present as `undefined` → `true`. Fixtures come from the builder and `invalidateBuildUploadContextResourceParams`.
      * `[✅]`   Every existing case for both guards keeps its coverage and its assertions.

   * `[✅]`   `buildUploadContext.guards.ts`
      * `[✅]`   `isBuildUploadContextResourceParams` gains a presence check for `sourcePromptResourceId` and an `undefined`-or-string type check, copied in form from the block `isBuildUploadContextParams` already runs for the same member.
      * `[✅]`   Both guards keep their boolean contracts; neither throws, both covering params objects assembled in trusted TypeScript.

   * `[✅]`   `buildUploadContext.test.ts`
      * `[✅]`   `minimalResourceParams`'s defaults object gains `sourcePromptResourceId`, so every existing resource case compiles with its arrangement unchanged.
      * `[✅]`   A case proves the resource arm sets the member: a params object carrying a string yields a context whose `sourcePromptResourceId` is that string.
      * `[✅]`   A case proves the absent form: a params object carrying `undefined` yields a context whose `sourcePromptResourceId` is `undefined`, arranged beside the case above so neither assertion can hold if the line were deleted.
      * `[✅]`   A case proves the resource arm's `pathContext` carries no `sourcePromptResourceId`, pinning that the value rides the upload context rather than the path.
      * `[✅]`   The contribution case asserting `meta.source_prompt_resource_id` is unchanged and is the proof both arms spell the value the same way from the same member name.
      * `[✅]`   Every other case in both halves of the suite keeps its coverage and its assertions.

   * `[✅]`   `buildUploadContext.ts`
      * `[✅]`   The resource arm's returned object gains `sourcePromptResourceId: params.sourcePromptResourceId`, beside `description`.
      * `[✅]`   Nothing else changes: the arm discriminator, both path contexts, the contribution arm's whole body, the mime selection and the `isCompressedContextRawJsonFileType` import.

   * `[✅]`   `buildUploadContext.integration.test.ts`
      * `[✅]`   Boundary: `buildUploadContext` → `file_manager` → the real `dialectic_contributions` and `dialectic_project_resources` rows and the real storage object. Both functions run real, as do `constructStoragePath` and both params guards. The migration is part of this chain and is proven by it: the column and its self-referencing FK either accept the id or the insert fails.
      * `[✅]`   Mocked: nothing. No external service participates in this chain. The suite runs against the local Supabase stack through `_shared/_integration.test.utils.ts` — `coreInitializeTestStep` for the project and user, `initializeSupabaseAdminClient` for arrangement and read-back, `coreCleanupTestResources` for rollback — and writes to the real storage bucket.
      * `[✅]`   A case arranges a real `CompressionPrompt` resource row, takes the resource arm with that row's id as `sourcePromptResourceId`, uploads through `file_manager`, and selects the written `dialectic_project_resources` row back: `source_prompt_resource_id` equals the prompt row's id and is not the artifact row's own id. Both ids are in the arrangement, so writing the wrong one fails the case — with one id present the assertion holds whichever id the service wrote.
      * `[✅]`   A case does the same on the contribution arm and proves `dialectic_contributions.source_prompt_resource_id` carries the same prompt row's id under the same column name. Arranged in the same case as the resource arm, the two together being the proof that one member reaches one column name on both tables.
      * `[✅]`   A case takes the resource arm with `sourcePromptResourceId` as `undefined` and proves the persisted column is `null`, arranged beside the populated case so neither assertion can hold if the write were deleted.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports its context types from `_shared/types` and a single file-type guard from `_shared/utils`, and exports a pure function; it exports nothing to `file_manager`.
      * `[✅]`   No cycle: the types file and `file_manager` import nothing from this module.
      * `[✅]`   This module has no `provides` barrel; its consumers import the function, its interface, its guards and its mock directly, and no export name changes.

   * `[✅]`   `requirements`
      * `[✅]`   `BuildUploadContextResourceParams` declares `sourcePromptResourceId: string | undefined`, and both params types declare it identically — interface test.
      * `[✅]`   The resource arm sets the member from params, for a string and for `undefined` — unit test.
      * `[✅]`   The resource arm's `pathContext` does not carry the member — unit test.
      * `[✅]`   `isBuildUploadContextResourceParams` rejects the member absent and wrong-typed and accepts it as a string or `undefined` — guard test.
      * `[✅]`   The contribution arm's `contributionMetadata.source_prompt_resource_id` is exactly what it is now — unit test, existing case.
      * `[✅]`   Every other member of both returned contexts is exactly what it is now — unit test, existing cases unchanged.
      * `[✅]`   A string set on the resource params reaches `dialectic_project_resources.source_prompt_resource_id`, and one set on the contribution params reaches `dialectic_contributions.source_prompt_resource_id` — integration test.
      * `[✅]`   An `undefined` params member reaches the resource insert as `null` — integration test.

* `[✅]`   supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.ts **[BE] Select the branch on the job row's `job_type` and gate each arm with the guard that owns the payload that row carries, so an EXECUTE or PLAN continuation routes to the contribution branch instead of raising at the selector, and report every failure on the error arm**

   * `[✅]`   `objective`
      * `[✅]`   Solve a branch chosen by a guard that throws, in a function that reports every failure by throwing. `isDialecticCompressJobPayload(job.payload)` is the `if` that picks the COMPRESS arm; once that guard throws a per-member diagnostic, an ordinary EXECUTE continuation — the payload the compress guard exists to reject — raises instead of falling through to the contribution branch it belongs to. And every one of this function's own failures leaves as an exception, so its caller must catch what the facade's other prompt member returns as a value.
      * `[✅]`   Functional goals:
         * `[✅]`   The COMPRESS arm is selected by `job.job_type === 'COMPRESS'`, the row column that is the one record of a job's type.
         * `[✅]`   Each arm is gated by the guard that owns the payload the row's own `job_type` carries: `isDialecticCompressJobPayload` in the COMPRESS arm, `isDialecticPlanJobPayload` for a `'PLAN'` row and `isDialecticExecuteJobPayload` for every other row in the contribution arm. The contribution arm receives both forms — Categories A and B arrange `'PLAN'` rows carrying `buildDialecticPlanJobPayload` payloads and assert `FileType.PlannerPrompt` — so one guard cannot serve it.
         * `[✅]`   The function returns `AssembleContinuationPromptReturn`, and every failure it reports leaves as `AssembleContinuationPromptErrorReturn` carrying the message it throws today and the `retriable` flag the interaction spec's partition assigns it: `true` for a database read, a storage download and the one write, `false` for every precondition, validation and parse failure.
         * `[✅]`   A payload guard's thrown diagnostic is caught at this function's own boundary and returned on the error arm, so no `Error` escapes to a caller that narrows a union. A thrown value that is not an `Error` is re-raised unchanged: `AssembleContinuationPromptError` is `Error`, and converting a non-`Error` into one to carry it would be the error conversion errors-and-returns forbids.
         * `[✅]`   The `readArtifact` helper reports its two failures on `ReadArtifactReturn`, a `Success | Error` union whose error arm is this function's own, so both call sites narrow by guard instead of probing the success arm's primitive.
         * `[✅]`   The COMPRESS arm's upload context takes its `userId` from the job row's `user_id` column, that member no longer being on the payload.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Both branch bodies are otherwise unchanged: the COMPRESS arm's two canonical reads, its three-message assembly and its `CompressionPrompt` upload context — every member taken from the narrowed local the gate binds rather than from `job.payload`, with the same value in each slot; the contribution arm's header-context fetch, `gatherContinuationInputs` call, chunk assembly, message construction and `TurnPrompt`/`PlannerPrompt` upload context, reading exactly what they read now.
         * `[✅]`   The single `fileManager.uploadAndRegisterFile` call and the FileType switch it already owns stay exactly where they are; no second persistence site is added.
         * `[✅]`   Every message string already in the body is preserved verbatim, including each `PRECONDITION_FAILED:` prefix and the two artifact-not-found messages that name which artifact was missing. The three gate messages the interaction spec names are the only new strings, and two of them sit on branches a throwing guard makes unreachable.
         * `[✅]`   `AssembledPrompt`'s three members and their values are unchanged on the success path.
         * `[✅]`   The deps object keeps every member and its optionality; the COMPRESS branch still reads none of the six contribution-only members.
      * `[✅]`   Each goal is proven by a named case in this file's suite.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer prompt assembly for a continuation turn, for a contribution job and a compression job alike.
      * `[✅]`   The role is correct because this function holds the job row, so the fact that separates its two arms — what kind of job this is — is available to it as a column rather than as an inference from payload shape.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not change `prompt-assembler.ts`; the return union, its error type and `isAssembleContinuationPromptErrorReturn` are landed by the facade node immediately before this one. This node's only edit to `prompt-assembler.interface.ts` is the pair of `readArtifact` return types declared below.
         * `[✅]`   Do not change either branch's assembly logic, which rows and objects it reads, or what it persists.
         * `[✅]`   Do not edit `processCompressJob.ts`, which narrows this return in its own node.
         * `[✅]`   Do not add a second `uploadAndRegisterFile` call or a hand-built upload context.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt` — resolving a job's prior output, composing the continuation turn, persisting the prompt, and reporting the assembled result or the failure.
      * `[✅]`   Inside boundary:
         * `[✅]`   Which arm a continuation takes and what each arm reads.
         * `[✅]`   How this function reports a failure to its caller.
      * `[✅]`   Outside boundary:
         * `[✅]`   The payload contracts and their guards, owned by `enqueueCompressJobs` and the dialectic hub.
         * `[✅]`   The return union, its error type and its guard, landed by the facade node in `prompt-assembler.interface.ts` and `prompt-assembler.guard.ts`. This node adds the `readArtifact` pair to that interface and declares no guard of its own.
         * `[✅]`   Which job is continued at all, decided by `processCompressJob` and `continueJob`.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`isDialecticCompressJobPayload` and the type `DialecticCompressJobPayload`), the barrel this file already imports the guard from and the one `continueJob.ts` takes both symbols from.
         * `[✅]`   Layer classification: app-layer module, owner of the COMPRESS payload contract.
         * `[✅]`   Direction: inbound, already present — the guard's role changes from selector to narrowing gate, and the type joins it on the same import.
         * `[✅]`   Purpose: narrow the payload inside the arm the row column selected, bind it to the local the arm reads, and name the member at fault when it is malformed.
      * `[✅]`   Provider: `_shared/utils/type_guards.ts` (`isDialecticExecuteJobPayload`, `isDialecticPlanJobPayload`) — the barrel that re-exports both from `type-guards/type_guards.dialectic.ts`, and the module this file already imports `isRecord` from.
         * `[✅]`   Layer classification: shared runtime boundary.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: gate the contribution arm with the guard for the row's own type — the plan guard for a `'PLAN'` row, the execute guard for every other.
      * `[✅]`   Provider: `_shared/prompt-assembler/prompt-assembler.guard.ts` (`isAssembleContinuationPromptErrorReturn`).
         * `[✅]`   Layer classification: this module's own guard surface, landed by the facade node.
         * `[✅]`   Direction: inbound from the module's root, the direction every assembler in this folder already takes for its types.
         * `[✅]`   Purpose: narrow `ReadArtifactReturn` at both `readArtifact` call sites, and the guard every caller of this function's return uses.
      * `[✅]`   Confirm:
         * `[✅]`   `AssembleContinuationPromptDeps` is unchanged: `dbClient`, `fileManager`, `job`, the six optional contribution members, `downloadFromStorage`, `sourceContributionId` and `constructStoragePath`.
         * `[✅]`   No dependency is added or removed, and no reverse dependency exists: no guard module imports this one.
      * `[✅]`   `context_slice`
         * `[✅]`   From `enqueueCompressJobs.provides.ts`: the compress payload guard and its type. From `_shared/utils/type_guards.ts`: the plan and execute payload guards. From `prompt-assembler.guard.ts`: the error-arm guard. Nothing else from any of them.

   * `[✅]`   `assembleContinuationPrompt.interface.test.ts`
      * `[✅]`   A case proves the declared return by typed assignment: the function's awaited return is assignable to `AssembleContinuationPromptReturn`, an `AssembledPrompt` value assigns to it, and an `AssembleContinuationPromptErrorReturn` value assigns to it.
      * `[✅]`   A case proves the error arm's members by typed literal: `error` typed `AssembleContinuationPromptError` and `retriable` typed `boolean`, with neither `promptContent` nor `source_prompt_resource_id` on it.
      * `[✅]`   A case proves `ReadArtifactReturn`'s two arms by typed assignment: a `ReadArtifactSuccessReturn` value assigns to it and an `AssembleContinuationPromptErrorReturn` value assigns to it, the second being the proof the helper's error arm is this function's own type rather than a second error shape.
      * `[✅]`   Every existing case in this file — the deps surface and its optional members — is unchanged.

   * `[✅]`   `prompt-assembler.interface.ts`
      * `[✅]`   `ReadArtifactSuccessReturn { content: string }` and `ReadArtifactReturn = ReadArtifactSuccessReturn | AssembleContinuationPromptErrorReturn` are declared beside `AssembleContinuationPromptReturn`, which is where this module's continuation types live and therefore the owning interface of a type the continuation body returns.
      * `[✅]`   The success arm is an object carrying the decoded text rather than a bare `string`, so the union has two object arms one guard separates and no call site discriminates a primitive by `typeof`.
      * `[✅]`   No guard is authored for the new union: `isAssembleContinuationPromptErrorReturn` already rejects a record carrying neither `error` nor `retriable`, so it separates both arms and the guard-test element does not apply to this node.
      * `[✅]`   Nothing else in the file changes: the facade node's `AssembleContinuationPromptError`, `AssembleContinuationPromptErrorReturn`, `AssembleContinuationPromptReturn`, `BoundAssembleContinuationPromptFn` and the `IPromptAssembler` member are exactly as that node landed them.

   * `[✅]`   `assembleContinuationPrompt.interaction.spec`
      * `[✅]`   Entry: `job.payload` not a record → error arm, `PRECONDITION_FAILED: Job payload is missing.`, `retriable: false`. `job.payload.model_id` not a string → error arm, `PRECONDITION_FAILED: Job payload is missing 'model_id'.`, `retriable: false`.
      * `[✅]`   Arm selection: `job.job_type === 'COMPRESS'` selects the COMPRESS arm; every other value falls through to the contribution arm. No guard is called to make this decision.
      * `[✅]`   COMPRESS arm, narrowing: `isDialecticCompressJobPayload(job.payload)` called as the condition of an `if`, which is the only form that narrows. Its thrown per-member diagnostic is caught at this function's boundary and returned as the error arm with that message and `retriable: false`; the `if` body is unreachable — the guard throws rather than returning `false` — and returns `PRECONDITION_FAILED: Job payload is not a valid compress job payload.`, `retriable: false`.
      * `[✅]`   COMPRESS arm, reads: the `CompressionPrompt` path context and the `CompressedContextRawJson` path context are built from the narrowed payload and `job.attempt_count`, and each is read through the shared artifact reader. A missing `dialectic_project_resources` row or a failed download → error arm with the existing message naming which artifact was missing, `retriable: true`, the row or the object being able to appear on a later attempt. Each read returns `ReadArtifactReturn`, and the call site narrows it with `isAssembleContinuationPromptErrorReturn`: the error arm is returned unchanged, the success arm's `content` is the text the assembly consumes.
      * `[✅]`   COMPRESS arm, assembly: the three-message array and the joined `promptContent` are composed exactly as they are now, and the upload context is the `CompressionPrompt` one with `isContinuation: true` and `turnIndex` one past `attempt_count`. Its `userId` is `job.user_id`.
      * `[✅]`   Contribution arm, narrowing: the gate is chosen by the same column that chose the arm — `job.job_type === 'PLAN'` gates with `isDialecticPlanJobPayload`, every other value with `isDialecticExecuteJobPayload`, each called as the condition of an `if`. The execute guard throws its per-member diagnostic, which is caught and returned on the error arm with `retriable: false`, exactly as the COMPRESS arm's is; its `if` body is unreachable and returns `PRECONDITION_FAILED: Job payload is not a valid execute job payload.`, `retriable: false`. The plan guard returns `false` and throws nothing, so its `if` body is the reachable one: `PRECONDITION_FAILED: Job payload is not a valid plan job payload.`, `retriable: false`.
      * `[✅]`   Contribution arm, what the gate does not do: it validates, it does not retype the body. `inputs` and `document_key` are declared on `DialecticExecuteJobPayload` and not on `DialecticPlanJobPayload`, so narrowing `job.payload` to the two forms' union would remove from the arm the members it reads. The body keeps reading the record `isRecord(job.payload)` already narrowed at entry, with the local checks it has today.
      * `[✅]`   Contribution arm, preconditions: each of `project`, `session`, `stage`, `assembleChunks` and `gatherContinuationInputs` absent, and a session with no selected models, → error arm carrying that condition's existing message, `retriable: false`.
      * `[✅]`   Contribution arm, body: the header-context row lookup and download, the three header-context shape validations, the `target_contribution_id` requirement, the walk that resolves the root contribution, the `gatherContinuationInputs` call and its error, the three message checks, and the `model_slug`, `document_key`, `sourceContributionId` and `stage.slug` validations each keep their condition and message and return the error arm.
      * `[✅]`   `retriable` partitions every failure in this function by what could differ on a later attempt, with no branch left unclassified: `true` for a database read and a storage download — the header-context contribution lookup, the header-context file download, the root-contribution walk's row read, and both COMPRESS artifact reads; `false` for everything else — every precondition, every payload or shape validation, the JSON parse failure, `gatherContinuationInputs`'s own error, and every guard diagnostic. The upload failure is the one write and is `true`.
      * `[✅]`   Shared tail: one `fileManager.uploadAndRegisterFile` call with the arm's own upload context. Its error → error arm, `Failed to save continuation prompt: …`, `retriable: true`. Success → `{ promptContent, source_prompt_resource_id: response.record.id, messages }`.
      * `[✅]`   Ordering and side effects: at most two storage reads on the COMPRESS arm and the contribution arm's existing reads on the other; exactly one write per successful call and none on any error arm; no branch falls through untyped, and the only value that leaves by `throw` is a caught non-`Error`, re-raised unchanged.

   * `[✅]`   `assembleContinuationPrompt.test.ts`
      * `[✅]`   Every COMPRESS case in Category G is arranged with a job row whose `job_type` is `'COMPRESS'`, that column now being what selects the arm. Their payloads, path assertions and message assertions are otherwise unchanged.
      * `[✅]`   `G.5` is restated against the row column: an `'EXECUTE'` row carrying a built execute payload passes its arm's gate, takes the contribution branch and reports that branch's own first precondition on the error arm; and a `'COMPRESS'` row whose payload fails `isDialecticCompressJobPayload` reports that guard's per-member diagnostic on the error arm rather than silently taking the other branch. Arranged with both rows in the one case so neither assertion can hold if the selection were deleted.
      * `[✅]`   `G.4a` and `G.4b` assert the error arm carrying the artifact-naming message and `retriable: true` in place of a rejection.
      * `[✅]`   Every `assertRejects` in Categories A through F becomes an assertion over the returned error arm: the same message, plus the `retriable` flag the interaction spec assigns that condition. `D.1`, `D.2`, `D.4` and `D.5` are the concentration of them, and `D.3` keeps asserting that no error arm is returned when a header context is not required.
      * `[✅]`   Every success case in Categories A, B, C, E, F and G asserts the success arm's three members as it does now, and each adds one assertion that the returned value is not an error arm, so a case cannot pass on a failure that happens to carry the same shape.
      * `[✅]`   `G.6`, `G.7` and `G.8` keep their coverage: no provider round-trip, no contribution-only dep required, and neither `gatherContinuationInputs` nor `dialectic_contributions` touched on the COMPRESS arm.
      * `[✅]`   A case is added proving the COMPRESS upload context carries `userId` from `job.user_id`.
      * `[✅]`   A case proves the contribution arm gates on the row's own type: a `'PLAN'` row whose payload `isDialecticPlanJobPayload` rejects returns that gate's message on the error arm with `retriable: false`, and a `'PLAN'` row carrying a built plan payload passes the gate and reaches its own first precondition instead. Both rows are arranged in the one case, so neither assertion can hold if the plan gate were replaced by the execute guard.
      * `[✅]`   Categories A, B and every other `'PLAN'`-row success case keep their coverage unchanged and are the standing proof that a plan payload is never put to the execute guard.
      * `[✅]`   A case proves the root-contribution walk's row read returns the error arm with `retriable: true`, arranged beside an existing precondition case asserting `retriable: false`, so the partition is proven and not just the message.

   * `[✅]`   `assembleContinuationPrompt.ts`
      * `[✅]`   The `if (isDialecticCompressJobPayload(job.payload))` selector becomes `if (job.job_type === 'COMPRESS')`, and the guard call moves inside that arm as the narrowing step.
      * `[✅]`   Every gate is written in the form `continueJob.ts`'s execute arm already uses: the guard is called as the condition of an `if` inside a `try`, the `if` body returns the error arm, and the `catch` re-raises a thrown value that is not an `Error` and otherwise returns the caught `Error` on the error arm with `retriable: false`. A guard called as a bare statement narrows nothing — these are `value is T` predicates, not assertion signatures — which is why the call is a condition and not a statement.
      * `[✅]`   COMPRESS arm: `let compressPayload: DialecticCompressJobPayload;` is declared above the `try`, and the `try` gates with `if (!isDialecticCompressJobPayload(job.payload))` and then assigns `compressPayload = job.payload`. The catch returns or re-raises, so the local is definitely assigned after the `try`. Both path contexts and the upload context read `compressPayload`; the type is imported alongside the guard from `enqueueCompressJobs.provides.ts`.
      * `[✅]`   Contribution arm: the gate runs before the five dep preconditions and picks its guard on the column — `isDialecticPlanJobPayload` for `job.job_type === 'PLAN'`, `isDialecticExecuteJobPayload` otherwise — and gates a local alias the arm does not read. The arm's body is unchanged and keeps reading `job.payload`, for the reason the interaction spec gives.
      * `[✅]`   The declared return becomes `Promise<AssembleContinuationPromptReturn>`, and every `throw new Error(...)` in the body becomes `return { error: new Error(<the same message>), retriable: <per the interaction spec's partition> }`.
      * `[✅]`   The COMPRESS upload context's `userId` reads `job.user_id`.
      * `[✅]`   The `readArtifact` helper's declared return becomes `Promise<ReadArtifactReturn>`: its two failures return the error arm as they read, and its success returns `{ content: new TextDecoder().decode(buffer) }`. Both call sites narrow with `isAssembleContinuationPromptErrorReturn` — the error arm returned unchanged, `content` taken from the success arm — in place of the `typeof result !== "string"` probe.
      * `[✅]`   The file gains imports from four modules and moves none: `AssembleContinuationPromptReturn` and `ReadArtifactReturn` from `../prompt-assembler.interface.ts`, `isAssembleContinuationPromptErrorReturn` from `../prompt-assembler.guard.ts`, `isDialecticExecuteJobPayload` and `isDialecticPlanJobPayload` from `../../utils/type_guards.ts`, and `DialecticCompressJobPayload` from the provides barrel the compress guard already comes from.
      * `[✅]`   Nothing else changes: both arms' reads, assemblies, path contexts and upload contexts, the single `uploadAndRegisterFile` call, its FileType switch, and the success return's three members.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: this module imports all three payload guards from the barrels that own them and its return types and its error-arm guard from the module root, and exports nothing back to any of them.
      * `[✅]`   The two `readArtifact` types are declared at the module root rather than in this folder, which is where every type this function returns already lives; declaring them beside the arm's error type keeps one owner for the whole return surface.
      * `[✅]`   No cycle: the facade imports this function, this function imports the facade's interface file, which is the existing arrangement for every assembler in this folder.
      * `[✅]`   This module has no `provides` barrel; the facade is its consumer surface.

   * `[✅]`   `requirements`
      * `[✅]`   A `'COMPRESS'` row takes the COMPRESS arm and an EXECUTE row takes the contribution arm, with no guard called to decide it — unit test, `G.5`.
      * `[✅]`   A malformed payload on either arm returns that arm's gate message on the error arm, and no `Error` escapes — unit test.
      * `[✅]`   A `'PLAN'` row is gated by the plan guard and not the execute guard: a built plan payload passes and a rejected one reports the plan gate's message — unit test.
      * `[✅]`   `ReadArtifactReturn` has two arms and the helper's failures are members of this function's error arm — interface test; both call sites narrow it by guard — unit test, the existing artifact-not-found cases.
      * `[✅]`   Every precondition, artifact-read and upload failure returns the error arm carrying its existing message and the `retriable` flag the spec assigns it — unit test, the restated `assertRejects` cases.
      * `[✅]`   A successful assembly returns `promptContent`, `source_prompt_resource_id` and `messages` exactly as it does now, on both arms — unit test, existing success cases.
      * `[✅]`   The COMPRESS upload context carries `userId` from the job row — unit test.
      * `[✅]`   The function's awaited return is assignable to `AssembleContinuationPromptReturn` and both arms are members of it — interface test.

* `[✅]`   supabase/functions/_shared/prompt-assembler/prompt-assembler.ts **[BE] Return `AssembledPrompt | AssembleContinuationPromptErrorReturn` from `BoundAssembleContinuationPromptFn` and the `IPromptAssembler` method it fronts, so both prompt members agree**

   * `[✅]`   `objective`
      * `[✅]`   Solve a facade whose two prompt members disagree on how failure travels. `assembleCompressionPrompt` returns `AssembleCompressionPromptReturn`, a `Success | Error` union its caller narrows. `assembleContinuationPrompt` returns `Promise<AssembledPrompt>` and signals every failure by throwing, so a caller holding the facade has no arm to narrow — `processCompressJob` must wrap one call in a `try` and narrow the other, over the same object, for the same kind of work.
      * `[✅]`   Functional goals:
         * `[✅]`   `AssembleContinuationPromptError` and `AssembleContinuationPromptErrorReturn { error: AssembleContinuationPromptError; retriable: boolean }` are declared in `prompt-assembler.interface.ts`, beside `AssembleContinuationPromptDeps`, in the shape `assembleCompressionPrompt.interface.ts` already uses for its own arm.
         * `[✅]`   `AssembleContinuationPromptReturn` is declared as `AssembledPrompt | AssembleContinuationPromptErrorReturn`, and `BoundAssembleContinuationPromptFn` returns `Promise<AssembleContinuationPromptReturn>`.
         * `[✅]`   `IPromptAssembler.assembleContinuationPrompt` returns `Promise<AssembleContinuationPromptReturn>`, and the `PromptAssembler` method, its private field and its constructor parameter carry that same return.
         * `[✅]`   `isAssembleContinuationPromptErrorReturn` is authored in this module's guard surface so every caller narrows the arm by guard rather than by property probing.
         * `[✅]`   `assemble()` keeps `Promise<AssembledPrompt>`: it narrows the continuation member's return and throws the error arm's `error`, so its own callers see exactly the failure they see today.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `assembleContinuationPrompt.ts` is not edited here. Its body still throws and still returns `AssembledPrompt`, which is assignable to the widened union, so this node compiles against an untouched implementation.
         * `[✅]`   `assembleSeedPrompt`, `assemblePlannerPrompt`, `assembleTurnPrompt` and `assembleCompressionPrompt` keep their signatures, their private fields and their constructor defaults.
         * `[✅]`   `assemble()`'s routing is unchanged: the `target_contribution_id` branch, the `PLAN` branch, the turn branch and the seed branch each select as they do now and pass the same deps.
         * `[✅]`   `AssembledPrompt` itself is unchanged, so every other member and every consumer of that type is untouched.
      * `[✅]`   Each goal is proven by a named case in this module's test suite or its guard cases.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer facade: one object fronting five prompt assemblers, each delegating to an injected function with the composition root's default behind it.
      * `[✅]`   The role is correct because a facade's job is to present one surface. Two members doing the same kind of work must report failure the same way, or every caller has to know which is which.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not edit `assembleContinuationPrompt.ts`. Converting its throws into the error arm is that file's own node, immediately after this one.
         * `[✅]`   Do not change `assemble()`'s signature, its branch selection, or the deps any branch passes.
         * `[✅]`   Do not change `AssembledPrompt`, `AssemblePromptOptions`, or any other assembler's contract.
         * `[✅]`   Do not edit `processCompressJob.ts`; it narrows this union in its own node later in this workstream.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/_shared/prompt-assembler` — the facade, the contracts its members expose, and the routing that selects one of them.
      * `[✅]`   Inside boundary:
         * `[✅]`   What each facade member returns and how a caller learns it failed.
         * `[✅]`   Which assembler a set of options routes to.
      * `[✅]`   Outside boundary:
         * `[✅]`   How any assembler builds its prompt, owned by that assembler's own module.
         * `[✅]`   Which branch a COMPRESS job takes inside the continuation assembler, owned by that file's node.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `./assembleContinuationPrompt/assembleContinuationPrompt.ts` (the default `assembleContinuationPrompt`).
         * `[✅]`   Layer classification: sibling module inside this bounded context.
         * `[✅]`   Direction: inbound, already present as the constructor default — unchanged by this node, since a function returning `AssembledPrompt` satisfies the widened return.
         * `[✅]`   Purpose: assemble a continuation prompt, injected so a test can substitute one.
      * `[✅]`   Confirm:
         * `[✅]`   No dependency is added or removed; the constructor's parameter list keeps its order and its optionality, and only the continuation parameter's declared return widens.
         * `[✅]`   No reverse dependency: `assembleContinuationPrompt.ts` imports its types from `prompt-assembler.interface.ts` and the facade imports the function, which is the existing direction.
      * `[✅]`   `context_slice`
         * `[✅]`   From each assembler module: its function and its declared types only, as now.

   * `[✅]`   `prompt-assembler.interface.ts`
      * `[✅]`   `AssembleContinuationPromptError` is declared as `Error`, and `AssembleContinuationPromptErrorReturn` as `{ error: AssembleContinuationPromptError; retriable: boolean }` — the member names and shape `AssembleCompressionPromptErrorReturn` already carries, so the facade's two prompt members report failure identically.
      * `[✅]`   `AssembleContinuationPromptReturn` is declared as `AssembledPrompt | AssembleContinuationPromptErrorReturn`, beside `AssembleContinuationPromptDeps`, which this file already owns.
      * `[✅]`   `BoundAssembleContinuationPromptFn` becomes `(job: DialecticJobRow) => Promise<AssembleContinuationPromptReturn>`.
      * `[✅]`   `IPromptAssembler.assembleContinuationPrompt` returns `Promise<AssembleContinuationPromptReturn>`; its four sibling members and `assemble()` keep their declared returns.
      * `[✅]`   `AssembledPrompt`, `AssemblePromptOptions` and every context type in this file are unchanged.

   * `[✅]`   `prompt-assembler.interaction.spec`
      * `[✅]`   Only two behaviors change: what the continuation member's declared return admits, and how `assemble()` treats it. Every other branch keeps its condition, its delegation and its outcome.
      * `[✅]`   `assembleContinuationPrompt(deps)` → delegate to `this.assembleContinuationPromptFn(deps)` and return its value unchanged, either arm. The facade adds no inspection, no logging and no rewrapping — a delegating member returns what it was given.
      * `[✅]`   `assemble(options)` continuation branch, selected when `options.job` is present and `options.job.target_contribution_id` is a non-empty string: call `this.assembleContinuationPrompt` with the deps literal it passes today, then narrow. `isAssembleContinuationPromptErrorReturn` true → throw that arm's `error`. Otherwise → return the `AssembledPrompt`. Throwing here preserves `assemble()`'s existing contract exactly: the same `Error` reaches the same caller by the same path it does today, because the callee threw it then and hands it back now.
      * `[✅]`   `assemble()`'s three other branches — `PLAN` to `assemblePlannerPrompt`, otherwise `assembleTurnPrompt`, and no job to `assembleSeedPrompt` — are unchanged in selection, deps and outcome.
      * `[✅]`   Ordering and side effects: exactly one assembler call per `assemble()` invocation, as now; the facade performs no read, no write and no notification on any path.

   * `[✅]`   `prompt-assembler.mock.ts`
      * `[✅]`   `mockAssembleContinuationPrompt` is retyped `(deps: AssembleContinuationPromptDeps) => Promise<AssembleContinuationPromptReturn>` and keeps returning `MOCK_ASSEMBLED_CONTINUATION_PROMPT`, the success arm being what a mock returns.
      * `[✅]`   `AssembleContinuationPromptErrorReturn` gains the four symbols owed to an owned object type: `AssembleContinuationPromptErrorReturnOverrides` as `Partial<T>`, `buildAssembleContinuationPromptErrorReturn` defaulting `error` to `new Error("mock-assemble-continuation-prompt-error")` and `retriable` to `false`, `AssembleContinuationPromptErrorReturnCorruptions`, and `invalidateAssembleContinuationPromptErrorReturn`.
      * `[✅]`   `MockPromptAssembler`'s `assembleContinuationPrompt` member follows the retyped mock, so a consumer's test can hand the facade either arm.
      * `[✅]`   `MOCK_ASSEMBLED_CONTINUATION_PROMPT`, `buildAssembledPrompt`, `invalidateAssembledPrompt` and every other symbol in the file keep their names, shapes and defaults.

   * `[✅]`   `prompt-assembler.guard.test.ts`
      * `[✅]`   Case checklist for `isAssembleContinuationPromptErrorReturn`, fixtures from the builder and invalidator above: `true` for a built error return; `false` for `buildAssembledPrompt()`, which is the discrimination the guard exists to make; `false` for each of `error` and `retriable` absent and wrong-typed; `false` for non-record roots.
      * `[✅]`   The file is created by this node if it does not exist, carrying these cases only; no other guard in this module is retrofitted.

   * `[✅]`   `prompt-assembler.guard.ts`
      * `[✅]`   `isAssembleContinuationPromptErrorReturn(value: unknown): value is AssembleContinuationPromptErrorReturn` checks a record root, `error instanceof Error`, and `typeof retriable === "boolean"`, and rejects a value carrying `promptContent` or `source_prompt_resource_id` so the success arm can never satisfy it.
      * `[✅]`   It keeps a boolean contract and throws nothing; it is the arm-narrowing guard `assemble()` and every downstream caller uses.
      * `[✅]`   The file is created by this node if it does not exist and holds this guard alone.

   * `[✅]`   `prompt-assembler.test.ts`
      * `[✅]`   `assembleContinuationPrompt should call the injected function` stands: the injected function returns the success arm and the member returns it unchanged.
      * `[✅]`   A case is added proving the member relays the error arm unchanged: an injected function returning `buildAssembleContinuationPromptErrorReturn()` produces that exact value from `assembler.assembleContinuationPrompt(deps)`, with the same `error` identity and `retriable` flag, and no throw.
      * `[✅]`   A case is added proving `assemble()` narrows: with an injected continuation function returning the error arm, `assemble()` rejects with that arm's own `error` instance — the same failure the caller sees today.
      * `[✅]`   The three routing cases — delegation on `target_contribution_id`, delegation regardless of job type, and no delegation when it is null — keep their arrangements and assertions, and the `gatherContinuationInputs` constructor-wiring case is unchanged.
      * `[✅]`   Every seed, planner, turn and compression case is unchanged.

   * `[✅]`   `prompt-assembler.ts`
      * `[✅]`   The `assembleContinuationPromptFn` private field and its constructor parameter are retyped `(deps: AssembleContinuationPromptDeps) => Promise<AssembleContinuationPromptReturn>`; the constructor default stays `assembleContinuationPrompt`.
      * `[✅]`   The `assembleContinuationPrompt` method returns `Promise<AssembleContinuationPromptReturn>` and still returns `this.assembleContinuationPromptFn(deps)` directly.
      * `[✅]`   `assemble()`'s continuation branch awaits the member, narrows with `isAssembleContinuationPromptErrorReturn`, throws that arm's `error`, and otherwise returns the success arm. Its deps literal, its branch condition and its three sibling branches are unchanged.
      * `[✅]`   The `SB_CONTENT_STORAGE_BUCKET` constructor check, `resolveSourceContributionId`, `normalizeContributionId` and every other member are unchanged.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the facade imports each assembler and the types they use; `assembleContinuationPrompt.ts` imports its types from this module's interface file, which is where the new error type joins them.
      * `[✅]`   No cycle: the new type sits in the file both sides already import from, so no edge is added in either direction.
      * `[✅]`   This module has no `provides` barrel; consumers import the facade, its interface and its mock directly, and the new guard file joins that surface by the same route.

   * `[✅]`   `requirements`
      * `[✅]`   `IPromptAssembler.assembleContinuationPrompt` and `BoundAssembleContinuationPromptFn` both return `Promise<AssembleContinuationPromptReturn>`, and an `AssembleContinuationPromptErrorReturn` value is assignable to it — unit test, typed assignment.
      * `[✅]`   The facade member relays either arm unchanged — unit test.
      * `[✅]`   `assemble()` still returns `Promise<AssembledPrompt>` and rejects with the error arm's own `Error` instance when the continuation assembler reports failure — unit test.
      * `[✅]`   `isAssembleContinuationPromptErrorReturn` accepts the error arm and rejects an `AssembledPrompt` — guard test.
      * `[✅]`   Every routing decision and every other member's contract is exactly what it is now — unit test, existing cases unchanged.

* `[✅]`   supabase/functions/dialectic-worker/continueJob/continueJob.ts **[BE] Lift `continueJob` to a compliant module owning its interface, mock, guards and full test tier; take `deps`/`params`/`payload` returning a two-arm `Success | Error` union; select both arms on the job row's `job_type`, narrowing each payload inside its own arm; the COMPRESS payload literal carries `user_jwt` and `idempotencyKey` and neither `job_type` nor `user_id`**

   * `[✅]`   `objective`
      * `[✅]`   Solve a function that is a module in folder placement only. `continueJob` takes six positional parameters typed by `ContinueJobFn` declared in a foreign file, returns `IContinueJobResult` declared in the service hub as `{ enqueued: boolean; error?: Error; reason?: string }`, and owns no interface, no mock, no guard and no interface test. A caller learns what happened by testing two optional properties and comparing a bare string, which is why `saveResponse` reads three conditions in one expression to recognise a refused continuation. Its COMPRESS arm is selected by `isDialecticCompressJobPayload(job.payload)`, so once that guard throws a per-member diagnostic an EXECUTE continuation raises at the selector instead of reaching the arm that belongs to it.
      * `[✅]`   Functional goals:
         * `[✅]`   `continueJob.interface.ts` declares `ContinueJobDeps`, `ContinueJobParams`, `ContinueJobPayload`, the three return arms, `ContinueJobSuccessReturn`, `ContinueJobReturn` and `ContinueJobFn`; `ContinueJobFn` moves out of `JobContext.interface.ts` and `IContinueJobDeps` and `IContinueJobResult` are deleted from `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   The signature is `(deps: ContinueJobDeps, params: ContinueJobParams, payload: ContinueJobPayload) => Promise<ContinueJobReturn>`: `deps` is `{ logger }`, `params` carries `dbClient` and `projectOwnerUserId`, `payload` carries `job` and `savedOutput`.
         * `[✅]`   `ContinueJobReturn` is `ContinueJobSuccessReturn | ContinueJobErrorReturn`, where the success arm is the union of `ContinueJobEnqueuedReturn { enqueued: true }` and `ContinueJobLimitReachedReturn { enqueued: false; reason: 'continuation_limit_reached' }`, and the error arm is `ContinueJobErrorReturn { error: Error; retriable: boolean }`. Two arms at the top, flavors nested in the success arm; no optional property carries meaning.
         * `[✅]`   The arm is selected by `payload.job.job_type === 'COMPRESS'`; `isDialecticCompressJobPayload` narrows inside that arm and `isDialecticExecuteJobPayload` inside the other, each thrown diagnostic caught and returned on the error arm.
         * `[✅]`   The COMPRESS continuation payload literal carries no `job_type` and no `user_id`, and carries `user_jwt` from the parent payload and `idempotencyKey` equal to the row's own `idempotency_key`, both required members it inherits from `DialecticBaseJobPayload`.
         * `[✅]`   Every `{ enqueued: false, error }` return becomes `{ error, retriable }`: `false` for a malformed payload, a missing required member or a non-JSON literal, `true` for the insert failure, which can succeed on a later attempt.
         * `[✅]`   `continueJob.guard.ts` guards every type the interface owns, and `continueJob.mock.ts` supplies the four symbols per owned object type plus the function mock, so consumers stop hand-rolling `async () => ({ enqueued: false })`.
         * `[✅]`   `continueJob.provides.ts` is the module's only public surface, and every consumer of `ContinueJobFn` imports it from there.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   Every error message, log line and log payload is preserved verbatim, including the guard-diagnostic passthrough and the `23505` idempotency recovery's info line.
         * `[✅]`   The continuation-count arithmetic, the five-continuation bound and its position in the shared tail after both arms' gates are unchanged, as is the EXECUTE arm's document-relationship resolution and merge.
         * `[✅]`   The inserted row is unchanged in every column, including `job_type` from the arm, `user_id` from `projectOwnerUserId`, `target_contribution_id`, `status: 'pending_continuation'` and the composed `idempotency_key`.
         * `[✅]`   The `23505` recovery still returns the enqueued arm, an already-created continuation being a success.
      * `[✅]`   Each goal is proven by a named case in this module's interface, guard, unit or integration suite.

   * `[✅]`   `role`
      * `[✅]`   Node role is app-layer job spawning: given a job whose caller has already decided a continuation is warranted, build the successor payload, apply the structural bound, and insert the successor row.
      * `[✅]`   The role is correct because this function holds the job row, so what kind of job it is continuing is a column it can read rather than a shape it must infer — and because the outcome it reports is a fact its caller acts on, which makes the return's shape this function's contract to state, in this function's own interface.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not decide whether continuation is warranted; the caller has already decided, and this function refuses only for the structural bound.
         * `[✅]`   Do not decompose `saveResponse.ts`; this node edits its `continueJob` call site and the expression reading the result, and nothing else in that file. The decomposition is WS-S.
         * `[✅]`   Do not change either payload guard; both are landed by the `enqueueCompressJobs` node.
         * `[✅]`   Do not change the row's columns, the idempotency key composition, or the continuation limit.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is continuation spawning in `supabase/functions/dialectic-worker/continueJob/` — successor payload construction per job kind, the structural bound, row insertion, idempotent recovery, and the contract, guards and fixtures for all of it.
      * `[✅]`   Inside boundary:
         * `[✅]`   What a successor payload contains for each kind of job, and what the successor row carries.
         * `[✅]`   What this function reports to its caller, the types that express it, the guards that narrow it and the builders that fixture it.
      * `[✅]`   Outside boundary:
         * `[✅]`   Whether a continuation is warranted at all, decided by `determineContinuation` and acted on by `saveResponse`.
         * `[✅]`   Both job payload contracts and their guards, owned by `enqueueCompressJobs` and the dialectic hub.
         * `[✅]`   What the successor job then does, owned by `processJob` and its processors.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[✅]`   Layer classification: shared types, beneath the worker.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the only collaborator this function invokes.
      * `[✅]`   Provider: `_shared/utils/errors.ts` (`ContinueJobValidationError`, `ContinueJobEnqueueError`).
         * `[✅]`   Layer classification: shared error types, the declared home of `RenderJobValidationError` and `RenderJobEnqueueError`, which this module copies.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: type this function's own failures; a failure a callee already typed is propagated unchanged instead.
      * `[✅]`   Provider: `dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.provides.ts` (`isDialecticCompressJobPayload`, `DialecticCompressJobPayload`).
         * `[✅]`   Layer classification: sibling app-layer module, owner of the COMPRESS payload contract.
         * `[✅]`   Direction: inbound, already present — the guard's role changes from selector to narrowing gate.
      * `[✅]`   Provider: `_shared/utils/type_guards.ts` (`isContinuablePayload`, `isDialecticExecuteJobPayload`, `isJson`, `isDocumentRelationships`) and `_shared/utils/type-guards/type_guards.file_manager.ts` (`isDialecticStageSlug`, `isModelContributionFileType`) — all already imported, all unchanged.
      * `[✅]`   Confirm:
         * `[✅]`   `dbClient` is a param, never a dep, per this epic's deps rule.
         * `[✅]`   No reverse dependency: `_shared` and the dialectic hub import nothing from this module, and `continueJob.interface.ts` imports nothing from `JobContext.interface.ts`, so lifting `ContinueJobFn` out of that file opens no cycle.
      * `[✅]`   `context_slice`
         * `[✅]`   From `_shared/types.ts`: `ILogger` only, imported with `import type`.
         * `[✅]`   Deps is `{ logger: ILogger }`; the function calls no other collaborator.

   * `[✅]`   `continueJob.interface.test.ts`
      * `[✅]`   Required-key surface records for `ContinueJobDeps`, `ContinueJobParams`, `ContinueJobPayload`, `ContinueJobEnqueuedReturn`, `ContinueJobLimitReachedReturn` and `ContinueJobErrorReturn`, each `Record<keyof T, true>` with its key count asserted.
      * `[✅]`   Parameter surfaces from `Parameters<ContinueJobFn>[0]`, `[1]` and `[2]`, proving the three-slot signature.
      * `[✅]`   Membership by typed assignment: each success flavor assigns to `ContinueJobSuccessReturn`, that assigns to `ContinueJobReturn`, and `ContinueJobErrorReturn` assigns to `ContinueJobReturn`.
      * `[✅]`   The declared return in the async form: `ReturnType<ContinueJobFn>` accepts `Promise.resolve(<each arm>)` and assigns to `Promise<ContinueJobReturn>`.
      * `[✅]`   Typed literals only — no builders, no `declare const`, no function value inhabiting `ContinueJobFn`.
      * `[✅]`   RED is `continueJob.interface.ts` not yet exporting these symbols; report the compiler's missing-export errors verbatim.

   * `[✅]`   `continueJob.interface.ts`
      * `[✅]`   `ContinueJobDeps { logger: ILogger }`.
      * `[✅]`   `ContinueJobParams { dbClient: SupabaseClient<Database>; projectOwnerUserId: string }`.
      * `[✅]`   `ContinueJobPayload { job: DialecticJobRow; savedOutput: DialecticContributionRow | DialecticProjectResourceRow }`. The fifth-parameter union keeps its existing declaration site by moving here with the type; it is named in this definition, never at a use site.
      * `[✅]`   `ContinueJobEnqueuedReturn { enqueued: true }`, `ContinueJobLimitReachedReturn { enqueued: false; reason: 'continuation_limit_reached' }`, `ContinueJobErrorReturn { error: Error; retriable: boolean }`, `ContinueJobSuccessReturn` as the union of the first two, and `ContinueJobReturn` as `ContinueJobSuccessReturn | ContinueJobErrorReturn`.
      * `[✅]`   `ContinueJobFn = (deps: ContinueJobDeps, params: ContinueJobParams, payload: ContinueJobPayload) => Promise<ContinueJobReturn>`.

   * `[✅]`   `continueJob.interaction.spec`
      * `[✅]`   Entry: `isContinuablePayload(payload.job.payload)` false → error arm, `new ContinueJobValidationError('Invalid or non-continuable job payload')`, `retriable: false`, with its existing log line. The continuation counts are computed from `payload.job.payload.continuation_count ?? 0` as they are now.
      * `[✅]`   Arm selection: `payload.job.job_type === 'COMPRESS'` selects the COMPRESS arm; every other value takes the EXECUTE arm. No guard is called to make this decision.
      * `[✅]`   COMPRESS arm, narrowing: `isDialecticCompressJobPayload(payload.job.payload)` inside the arm, its thrown per-member diagnostic caught and returned unchanged on the error arm with `retriable: false` and the existing validation-failure log line.
      * `[✅]`   COMPRESS arm, payload: a `DialecticCompressJobPayload` literal carrying `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `model_id`, `model_slug`, `mode`, `content`, `sourceType`, `walletId`, `user_jwt` from the parent payload, `idempotencyKey` set to the once-computed key, and `continuation_count` advanced by one; each of `sourceId`, `role`, `documentKey`, `docType`, `sourceStageSlug`, `chunk_index` and `chunk_total` set only when the parent carries it. No `job_type`, no `user_id`. Failing `isJson` → error arm, `new ContinueJobValidationError('Constructed payload is not valid JSON.')`, `retriable: false`.
      * `[✅]`   COMPRESS arm, tail values: job type `'COMPRESS'`, target contribution id `null`, test flag from `payload.job.is_test_job === true`.
      * `[✅]`   EXECUTE arm, gates in their existing order, each returning the error arm with `retriable: false` and its existing message: a payload whose `output_type` is absent or not a model-contribution file type; an absent or empty `user_jwt`; an absent `walletId`; unresolvable `document_relationships` after the trigger-and-saved merge; a payload the execute guard rejects, whose thrown diagnostic is surfaced unchanged; a `stageSlug` that is not a dialectic stage slug.
      * `[✅]`   EXECUTE arm, payload: the `DialecticExecuteJobPayload` literal and its twelve conditional members, the canonical path params derived from the parent's with `contributionType` set to `stageSlug`, `target_contribution_id` from `payload.savedOutput.id`, the advanced continuation count and the parent test-flag propagation, all exactly as they stand. Failing `isJson` → error arm, same message, `retriable: false`.
      * `[✅]`   Shared tail: the idempotency key `${payload.job.id}_continue_${payload.savedOutput.id}` is computed once above both arms and read by the COMPRESS payload member and the row column alike. `currentContinuationCount < 5` false → `ContinueJobLimitReachedReturn`, no write. Otherwise the existing info log, then one insert of the successor row through `params.dbClient`.
      * `[✅]`   Insert outcome: a `23505` violation naming `idempotency_key` → `ContinueJobEnqueuedReturn` with its existing info log; any other insert error → error arm, `new ContinueJobEnqueueError('Failed to enqueue continuation job: …')`, `retriable: true`; success → `ContinueJobEnqueuedReturn` with its existing info log.
      * `[✅]`   Ordering and side effects: at most one write per call; zero writes on every gate, on the limit refusal and on every error arm; the arm's payload is fully built before the bound is applied, so a payload defect is reported as itself rather than as the limit.

   * `[✅]`   `continueJob.mock.ts`
      * `[✅]`   Four symbols for each owned object type — `ContinueJobDeps`, `ContinueJobParams`, `ContinueJobPayload`, `ContinueJobEnqueuedReturn`, `ContinueJobLimitReachedReturn`, `ContinueJobErrorReturn` — as `<T>Overrides` / `build<T>` / `<T>Corruptions` / `invalidate<T>`, overrides `Partial<T>`, corruptions `{ [K in keyof T]?: unknown }`, invalidators returning `unknown`.
      * `[✅]`   Nested object properties compose their owner's builder: `buildContinueJobPayload` takes `job` from the dialectic hub's job-row builder and `savedOutput` from the contribution-row builder, never a hand-rolled literal.
      * `[✅]`   `buildContinueJobErrorReturn` defaults `error` to `new ContinueJobValidationError('mock-continue-job-error')` and `retriable` to `false`; the two success builders default their literal members.
      * `[✅]`   `mockContinueJob: ContinueJobFn` returns `buildContinueJobEnqueuedReturn()`. No options bag, no factory, no call recording.
      * `[✅]`   `ContinueJobSuccessReturn` is a union and gets no builder of its own; its two members each have one.

   * `[✅]`   `continueJob.guard.test.ts`
      * `[✅]`   The six-case checklist per owned guard, fixtures from this file's builders and invalidators only: valid default accepted; valid overrides accepted; `null`, `undefined`, a primitive and an array rejected; each property corrupted in turn rejected; each required property omitted by rest-destructure rejected.
      * `[✅]`   `isContinueJobEnqueuedReturn` rejects both other arms; `isContinueJobLimitReachedReturn` rejects `reason` absent or any other string; `isContinueJobErrorReturn` rejects a value carrying `enqueued`.
      * `[✅]`   `isContinueJobSuccessReturn` accepts each flavor and rejects the error arm.
      * `[✅]`   No cast anywhere; the guards take `unknown` and the invalidators return `unknown`.

   * `[✅]`   `continueJob.guard.ts`
      * `[✅]`   `isContinueJobDeps` is a presence-of-method check on `logger`, that type being a behavior type.
      * `[✅]`   `isContinueJobParams` and `isContinueJobPayload` are data guards checking presence and the type of every property, delegating each property to the guard owned by that property's interface.
      * `[✅]`   `isContinueJobEnqueuedReturn` requires a record whose `enqueued` is exactly `true` and which carries no `error`; `isContinueJobLimitReachedReturn` requires `enqueued` exactly `false` and `reason` exactly `'continuation_limit_reached'`; `isContinueJobErrorReturn` requires `error instanceof Error` and a boolean `retriable`, and rejects a value carrying `enqueued`.
      * `[✅]`   `isContinueJobSuccessReturn` is the disjunction of the two flavor guards and introduces no member check of its own.
      * `[✅]`   All guards keep a boolean contract and throw nothing; they narrow an already-returned value and select nothing.

   * `[✅]`   `continueJob.test.ts`
      * `[✅]`   Every existing block is rewritten in place against the three-slot signature: the six positional arguments become `buildContinueJobDeps`, `buildContinueJobParams` and `buildContinueJobPayload` calls carrying only that block's own overrides.
      * `[✅]`   Every block gains the four-field header and the inline `// Arrange` / `// Act` / `// Assert` markers, its `Contract` line transcribing the one branch from the interaction spec.
      * `[✅]`   Every case asserting `result.enqueued === false` with a truthy `result.error` is restated as an `isContinueJobErrorReturn` assertion, keeping its exact message assertion and adding the `retriable` flag the interaction spec assigns that condition.
      * `[✅]`   The continuation-limit case asserts `isContinueJobLimitReachedReturn` and that no insert was attempted; the success and `23505` cases assert `isContinueJobEnqueuedReturn`.
      * `[✅]`   A case proves arm selection by the column: a row whose `job_type` is `'COMPRESS'` inserts a `'COMPRESS'` successor, and a row whose `job_type` is `'EXECUTE'` carrying a payload the compress guard would reject inserts an `'EXECUTE'` successor rather than reporting that guard's diagnostic. Both rows are arranged in the one block so neither assertion can hold if the selection were deleted.
      * `[✅]`   A case proves a `'COMPRESS'` row whose payload is malformed reports the compress guard's own per-member diagnostic on the error arm, and the equivalent case for the execute guard on the other arm stands.
      * `[✅]`   Cases assert the inserted COMPRESS payload carries `user_jwt` from the parent and `idempotencyKey` equal to the row's `idempotency_key`, and carries neither `job_type` nor `user_id` while the row carries `job_type: 'COMPRESS'` and `user_id`.
      * `[✅]`   Every existing case — the non-continuable entry gate, each EXECUTE gate, the document-relationship merge, the canonical path params, the conditional member propagation, the test-flag propagation and every inserted row column — keeps its coverage and its assertions.
      * `[✅]`   No typed-assignment or key-surface block lives here; shape belongs to `continueJob.interface.test.ts` and validity to `continueJob.guard.test.ts`.

   * `[✅]`   `continueJob.ts`
      * `[✅]`   The export is retyped `export const continueJob: ContinueJobFn = async (deps, params, payload) => { … }`, importing `ContinueJobFn` from `./continueJob.interface.ts` and no longer from `../createJobContext/JobContext.interface.ts`. Every read of `job` becomes `payload.job`, `savedOutput` becomes `payload.savedOutput`, `dbClient` becomes `params.dbClient` and `projectOwnerUserId` becomes `params.projectOwnerUserId`.
      * `[✅]`   The `if (isDialecticCompressJobPayload(payload.job.payload))` selector becomes `if (payload.job.job_type === 'COMPRESS')`, and that guard moves inside the arm as its narrowing step, wrapped in the same catch-and-return form the execute arm already uses.
      * `[✅]`   The compress payload literal drops `job_type` and `user_id` and gains `user_jwt` and `idempotencyKey`; the idempotency key is computed once, above both arms, and used for the payload member and the row column alike.
      * `[✅]`   Every `return { enqueued: false, error }` becomes `return { error, retriable }` with the flag the interaction spec assigns, the error being a `ContinueJobValidationError` or `ContinueJobEnqueueError` this function owns where the failure is its own and the callee's thrown error unchanged where it is not; `return { enqueued: false, reason: 'continuation_limit_reached' }` keeps its shape as the limit-reached arm.
      * `[✅]`   Nothing else changes: both payload constructions, the relationship merge, the bound, the row literal, the insert, the `23505` recovery and every log line.

   * `[✅]`   `continueJob.provides.ts`
      * `[✅]`   Re-exports `./continueJob.ts`, `./continueJob.interface.ts`, `./continueJob.guard.ts` and `./continueJob.mock.ts`, matching `enqueueCompressJobs.provides.ts`.

   * `[✅]`   `dialectic-service/dialectic.interface.ts`
      * `[✅]`   `IContinueJobDeps` and `IContinueJobResult` are deleted; the module declares both concerns now, and nothing in the hub restates them.

   * `[✅]`   `createJobContext/JobContext.interface.ts`
      * `[✅]`   The `ContinueJobFn` declaration and its doc comment are deleted, as are the `IContinueJobDeps` and `IContinueJobResult` names from the hub import list; `ContinueJobFn` is imported from `../continueJob/continueJob.provides.ts`. `IJobContext.continueJob` and `JobContextParams.continueJob` keep their member names and pick the moved type up through that import.

   * `[✅]`   `createJobContext/JobContext.mock.ts`
      * `[✅]`   The inline `continueJob: async () => ({ enqueued: false })` default becomes `mockContinueJob` imported from `../continueJob/continueJob.provides.ts`, as a nested property defaults to its owner's mock.

   * `[✅]`   `construction`
      * `[✅]`   No factory. `continueJob` stays one exported function taking three typed objects, and takes all four types from `ContinueJobFn`. The worker root and `netlifyResponse` root keep supplying the unbound implementation as the `continueJob` member of their params literal; neither root constructs a deps object for it.

   * `[✅]`   `continueJob.integration.test.ts`
      * `[✅]`   Boundary: `enqueueCompressJobs` → the COMPRESS row it inserts → that row read back → `continueJob` → the successor row → that row read back → `prompt-assembler` → `assembleContinuationPrompt`. Every function in that chain runs real, as do `constructStoragePath`, the text splitter, the token counter over a real tiktoken encoding, both payload guards, the base guard and this module's arm guards. This is the workstream's longest producer → row → consumer path, and the only place the base payload's inheritance is proven over a payload that actually crossed the boundary.
      * `[✅]`   Mocked: nothing. The only external boundary this repo mocks is the AI provider adapter, and no function in this chain calls a model. The suite runs against the local Supabase stack through `_shared/_integration.test.utils.ts` — `coreInitializeTestStep` for the project, session, user and wallet, `initializeSupabaseAdminClient` for arrangement and read-back, `coreCleanupTestResources` for rollback.
      * `[✅]`   The `savedOutput` every case passes is a real `dialectic_contributions` row inserted in arrangement. It is a precondition, not a chain link: `saveResponse` produces it in production and is not decomposed until the next workstream, and a row a test needs is a row the test creates.
      * `[✅]`   A case runs a fitting victim through the whole chain and proves the successor payload selected back out of `dialectic_generation_jobs` passes `isDialecticCompressJobPayload`, carries `user_jwt` from the parent and `idempotencyKey` equal to its own row's `idempotency_key`, and carries neither `job_type` nor `user_id` while the row carries both.
      * `[✅]`   A case runs an oversized victim and proves `chunk_index` and `chunk_total` survive the round trip into the successor as conditional members, with each chunk's `idempotencyKey` equal to its own row's column rather than the first chunk's.
      * `[✅]`   A case drives `continueJob` over a `'COMPRESS'` row and an `'EXECUTE'` row carrying a payload `isDialecticCompressJobPayload` would reject, in the one case, and proves each inserts a successor of its own `job_type` rather than the compress guard's diagnostic being reported.
      * `[✅]`   A case writes a COMPRESS row whose stored `payload` jsonb carries one corrupted member, and proves `continueJob` returns the error arm carrying that member's own diagnostic from the base or arm guard, with `retriable: false` and no row written — real untrusted data read back out of a real column.
      * `[✅]`   A case arranges the stored payload's `continuation_count` at the bound and proves the limit-reached arm is returned with no row written.
      * `[✅]`   A case drives the same continuation twice so the second insert raises a genuine `23505` on the `idempotency_key` unique constraint, and proves the enqueued arm is returned; a second insert failure the database actually produces returns the error arm with `retriable: true`. The constraint is the database's, which is why this branch is provable here and nowhere else.
      * `[✅]`   A case drives `assembleContinuationPrompt` over the stored COMPRESS successor and one over the stored EXECUTE successor, arranged together, and proves each takes its own branch and returns an `AssembledPrompt`.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports `ILogger` and its error classes from `_shared`, its payload contract from the sibling module's `provides`, and its row types from the dialectic hub, and exports to none of them.
      * `[✅]`   Provides face outward: `JobContext.interface.ts`, `saveResponse.interface.ts` and every test consumer import `ContinueJobFn`, the arm types, the arm guards and the mock from `continueJob.provides.ts` and never from an internal file.
      * `[✅]`   No cycle: `ContinueJobFn` leaving `JobContext.interface.ts` reverses an edge that only ever pointed the wrong way — the contract now lives with its implementation, and the context file depends on the module rather than the module on the context file.

   * `[✅]`   `requirements`
      * `[✅]`   `ContinueJobFn` takes exactly three parameters and every one of its four types is declared in `continueJob.interface.ts` — interface test, parameter surface records.
      * `[✅]`   `ContinueJobReturn` has two arms and both success flavors are members of `ContinueJobSuccessReturn` — interface test, typed assignment.
      * `[✅]`   Each arm guard accepts its own arm and rejects the other two, and every owned type's guard passes its full case checklist — guard test.
      * `[✅]`   A `'COMPRESS'` row inserts a `'COMPRESS'` successor and an `'EXECUTE'` row inserts an `'EXECUTE'` successor, with no guard deciding it — unit test.
      * `[✅]`   A malformed payload on either arm returns that arm's guard diagnostic on the error arm, unchanged — unit test.
      * `[✅]`   The inserted COMPRESS payload carries `user_jwt` and `idempotencyKey` and carries neither `job_type` nor `user_id`, while its row carries both — unit test.
      * `[✅]`   Reaching the continuation bound returns the limit-reached arm and writes nothing — unit test.
      * `[✅]`   An insert failure returns the error arm with `retriable: true`, and a `23505` idempotency violation returns the enqueued arm — unit test.
      * `[✅]`   Every existing gate returns its existing message on the error arm — unit test, restated cases.
      * `[✅]`   `saveResponse` recognises a refused continuation through `isContinueJobLimitReachedReturn` rather than three conditions in one expression, and reports the same status it reports now — unit test.
      * `[✅]`   A COMPRESS child payload written by `enqueueCompressJobs` survives the DB round trip, is narrowed by the compress guard, and yields a successor carrying `user_jwt` and `idempotencyKey` and neither `job_type` nor `user_id` — integration test.
      * `[✅]`   No file outside `continueJob/` declares a `continueJob` contract type, and no consumer imports one from a module-internal file — repo grep of `ContinueJobFn`, `IContinueJobResult` and `IContinueJobDeps`.

   * `[✅]`   **Commit** `refactor(dialectic-worker) lift continueJob to a compliant module and land its two-arm return`
      * `[✅]`   Structural: `continueJob/` gains its interface, interface test, mock, guard, guard test, provides and integration test; `ContinueJobFn` moves from `JobContext.interface.ts` into the module; `IContinueJobDeps` and `IContinueJobResult` are deleted from the dialectic hub; `ContinueJobValidationError` and `ContinueJobEnqueueError` join `_shared/utils/errors.ts`.
      * `[✅]`   Behavioral: the arm is selected by the job row's `job_type` column and each payload guard narrows inside its own arm; the COMPRESS successor payload carries `user_jwt` and `idempotencyKey` and neither `job_type` nor `user_id`; every failure is returned with a `retriable` flag.
      * `[✅]`   Contract: `continueJob` takes `deps`, `params` and `payload` and returns `ContinueJobSuccessReturn | ContinueJobErrorReturn` with the enqueued and limit-reached flavors nested in the success arm; every consumer narrows by arm guard.

## saveResponse Decomposition

* `[✅]`   supabase/functions/dialectic-worker/retryJob/retryJob.ts **[BE] Canonicalize the retry dispatcher as a function-folder module whose success arm carries the notified and unnotified flavors and whose error arm carries `RetryJobUpdateError`, so neither failure mode is lost**

   * `[✅]`   `objective`
      * `[✅]`   The retry dispatcher reports two distinct failures as one absence. `retryJob` returns `Promise<{ error?: Error }>` — an optional-member bag rather than a discriminated union — so a caller cannot tell a retry that was scheduled and announced from one that was scheduled and silently unannounced. The row-update failure returns a bare `Error` whose message interpolates the driver string, losing the job id and the attempted status as data. The notification failure is caught, logged and discarded, so the one outcome a caller could act on never leaves the function. Neither caller narrows what it gets: `saveResponse` awaits the call at each of its four retry sites and ignores the result, and `processSimpleJob` awaits and discards it, so a retry that could not be scheduled leaves the row in `processing` with nothing reported. The function is a bare file directly under `dialectic-worker/` with no interface, no guard, no mock and no provides.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/retryJob/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `RetryJobReturn`.
         * `[✅]`   The success arm carries two flavors, one per outcome the branch contract reaches: the notification was sent, and the dispatch was attempted and threw, carrying that `Error`. No flavor carries a nullable member for a consumer to re-narrow.
         * `[✅]`   Every job row carries a non-null `user_id`, and the worker handler fails a job outright before dispatch when it is absent, so a retry always has an owner to notify. The owner is read from `params.job.user_id`; `isRetryJobParams` requires that member non-empty after trim, and the function attempts the notification unconditionally — there is no owner-presence branch and no flavor for its absence.
         * `[✅]`   The error arm carries `RetryJobUpdateError`, holding `jobId`, `attemptedStatus` and `driverMessage` as members rather than interpolated into a string, so a caller can act on the parts.
         * `[✅]`   The `dialectic_generation_jobs` update writes exactly what it writes today: `status: 'retrying'`, `attempt_count` one past the row's own `attempt_count`, and `error_details.failedAttempts` copied member-wise from the payload's array. The row is the sole source of both the attempt number and the owner, so neither travels beside it as a param a caller could disagree with.
         * `[✅]`   The notification carries the same `type`, `sessionId`, `modelId`, `iterationNumber`, `error` and `job_id` values it carries today.
         * `[✅]`   The module owns `RetryJobUpdateError` and `RetryJobNotificationError` and declares both in its own interface, so a caller reaches them through the module's `provides` beside the return types that carry them.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `dialectic-worker/retryJob.ts` and `dialectic-worker/retryJob.test.ts` are not edited, moved or deleted by this node. The canonical module lands at a new path, so `netlifyResponse/index.ts`, `processSimpleJob.ts`, `JobContext.interface.ts` and every mock supplying that member keep compiling untouched. The legacy pair is retired by the worker root, the last consumer to switch off it.
         * `[✅]`   No caller is edited here. This node lands a producer; the callers that narrow its return each have their own node.
         * `[✅]`   Both existing log lines are preserved verbatim, including the `[dialectic-worker] [retryJob]` prefix on each.
         * `[✅]`   `RetryJobFn` is the name this module's interface declares for its own signature. The unrelated `RetryJobFn` in `JobContext.interface.ts` types the legacy function and is neither imported nor reconciled here; the two coexist until the legacy file is retired.
         * `[✅]`   No integration test element. The module's only boundaries are the injected `SupabaseClient` and the notification service, both mocked at the outer edge by the unit tier, and nothing consumes this module until its callers switch — whole-chain coverage is theirs.
      * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer job lifecycle write: given a job the caller has already decided to retry, record the retry on the row and announce it.
      * `[✅]`   The role is correct because the two things it does are the two things a retry IS — the row transition that makes the job eligible again, and the notice that it happened — and because the outcome it reports is a fact its caller must act on, which makes the return's shape this function's contract to state.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not decide whether a retry is warranted, or compare `attempt_count` against `max_retries`. The caller has already decided; this function refuses nothing.
         * `[✅]`   Do not build the `FailedAttemptError[]`. It arrives as the payload, assembled by the caller that holds the provider row.
         * `[✅]`   Do not edit `saveResponse.ts`, `processSimpleJob.ts`, `netlifyResponse/index.ts` or `JobContext.interface.ts`.
         * `[✅]`   Do not write any row other than `dialectic_generation_jobs`, and do not send any notification other than the retrying event.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/retryJob` — the retry transition of one job row and the notice that accompanies it.
      * `[✅]`   Inside boundary:
         * `[✅]`   The update's columns and values, the non-empty-owner invariant, and the three outcomes the two arms carry.
         * `[✅]`   `RetryJobDeps`, `RetryJobParams`, `RetryJobPayload`, both success flavors, the error arm, the return union, the function type, `RetryJobUpdateError`, `RetryJobNotificationError` and each error's constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DialecticJobRow` and `FailedAttemptError`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `Database`, owned by `types_db.ts`; `ILogger`, owned by `_shared/types.ts`.
         * `[✅]`   `NotificationServiceType` and `ContributionGenerationRetryingPayload`, owned by `_shared/types/notification.service.types.ts`.
         * `[✅]`   Whether a retry should happen, and what a caller does with the outcome.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the update-failure line and the notification-failure line, the module's only two log calls.
      * `[✅]`   Provider: `_shared/types/notification.service.types.ts` (`NotificationServiceType`, `ContributionGenerationRetryingPayload`).
         * `[✅]`   Layer classification: shared service contract.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the retrying-event dispatch and the typed literal it takes.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `FailedAttemptError`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound; the legacy file already imports `FailedAttemptError` from here, so the edge exists.
         * `[✅]`   Purpose: the row this function updates and the attempt records it writes.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the injected client.
      * `[✅]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[✅]`   Layer classification: shared test fixture surface for the database boundary.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the injected client in every params fixture and the update-result configuration in every unit case.
      * `[✅]`   Provider: `_shared/utils/notification.service.mock.ts` (`mockNotificationService`, `resetMockNotificationService`).
         * `[✅]`   Layer classification: shared test fixture surface, home of the notification service double.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the deps fixture's notification member and the per-case dispatch assertions.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildFailedAttemptError`, `invalidateFailedAttemptError`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of both imported types' builders.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the job row and attempt-record fixtures for every case and for this module's params and payload builders.
      * `[✅]`   Provider: `_shared/logger.mock.ts` (`MockLogger`).
         * `[✅]`   Layer classification: shared test fixture surface.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the deps fixture's logger member.
      * `[✅]`   Confirm:
         * `[✅]`   `RetryJobDeps` declares exactly `logger` and `notificationService` — the two collaborators the branch contract invokes, and no others. The database client is a per-invocation param.
         * `[✅]`   No reverse dependency: nothing in `_shared` or `dialectic-service` imports this module.
      * `[✅]`   `context_slice`
         * `[✅]`   From `_shared/types.ts`: the `ILogger` type only, imported with `import type`.
         * `[✅]`   From the notification contract: the `NotificationServiceType` and `ContributionGenerationRetryingPayload` types only, imported with `import type`.
         * `[✅]`   From the hub: the `DialecticJobRow` and `FailedAttemptError` types only, imported with `import type`.
         * `[✅]`   From `types_db.ts`: the `Database` type only, imported with `import type`.

   * `[✅]`   `retryJob.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case asserts the required key surface of `Parameters<RetryJobFn>[0]` is exactly `logger` and `notificationService`.
      * `[✅]`   A case asserts the required key surface of `Parameters<RetryJobFn>[1]` is exactly `dbClient` and `job`, proving the attempt number and the owner are read from the row rather than passed beside it.
      * `[✅]`   A case asserts the required key surface of `Parameters<RetryJobFn>[2]` is exactly `failedAttempts`, proving the attempt records are the payload and nothing else is.
      * `[✅]`   A case assigns `{ notified: true }` to `RetryJobNotifiedReturn`, proving the notified flavor carries no error member.
      * `[✅]`   A case asserts the required key surface of `RetryJobNotificationFailedReturn` is exactly `notified` and `notificationError`, proving the dispatch-failure flavor requires its error rather than admitting an absent one.
      * `[✅]`   Two cases prove flavor membership by typed assignment: each success flavor is assignable to `RetryJobSuccessReturn`, and that is assignable to `RetryJobReturn`.
      * `[✅]`   A case assigns an `RetryJobErrorReturn`-typed value to `RetryJobReturn`, proving the union has exactly the two arms.
      * `[✅]`   A case asserts the required key surface of `RetryJobUpdateErrorConstructorParams` is exactly `jobId`, `attemptedStatus` and `driverMessage`.
      * `[✅]`   A case asserts the required key surface of `RetryJobNotificationErrorConstructorParams` is exactly `jobId` and `thrownValue`.
      * `[✅]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<RetryJobReturn>` to `RetryJobFn`, proving the signature is asynchronous.

   * `[✅]`   `retryJob.interface.ts`
      * `[✅]`   `export interface RetryJobDeps { logger: ILogger; notificationService: NotificationServiceType; }`
      * `[✅]`   `export interface RetryJobParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; }` — the client and the row are per-invocation, so they are params rather than deps. The row already carries `attempt_count` and `user_id`, so neither is declared beside it: a member restated in params is a copy that can disagree with the row it was copied from.
      * `[✅]`   `export interface RetryJobPayload { failedAttempts: FailedAttemptError[]; }` — the data the function records. It arrives from an in-TS caller already typed, so the trusted form applies and the parameter is not `unknown`.
      * `[✅]`   `export type RetryJobNotifiedReturn = { notified: true };`
      * `[✅]`   `export type RetryJobNotificationFailedReturn = { notified: false; notificationError: Error };` — the dispatch was attempted and threw. The error is a required member, so no consumer re-narrows a nullable one.
      * `[✅]`   `export type RetryJobSuccessReturn = RetryJobNotifiedReturn | RetryJobNotificationFailedReturn;`
      * `[✅]`   `export type RetryJobErrorReturn = { error: RetryJobUpdateError; retriable: boolean };`
      * `[✅]`   `export type RetryJobReturn = RetryJobSuccessReturn | RetryJobErrorReturn;` — exactly two arms, the flavors nested inside the success arm.
      * `[✅]`   `export type RetryJobFn = (deps: RetryJobDeps, params: RetryJobParams, payload: RetryJobPayload) => Promise<RetryJobReturn>;`
      * `[✅]`   `export interface RetryJobUpdateErrorConstructorParams { jobId: string; attemptedStatus: string; driverMessage: string; }` and `export class RetryJobUpdateError extends Error` taking that one params object, holding each member as a readonly property, setting `name` to `'RetryJobUpdateError'`, and composing its `message` from the three so the string stays readable without being the only place the facts live.
      * `[✅]`   `export interface RetryJobNotificationErrorConstructorParams { jobId: string; thrownValue: string; }` and `export class RetryJobNotificationError extends Error` taking that one params object, holding each member as a readonly property, setting `name` to `'RetryJobNotificationError'`, and composing its `message` from the two. It is the typed error this module mints when the notification throws a value that is not an `Error`, so the flavor's `notificationError` member is satisfied without coercing a non-`Error` into one.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` is the worker's deps factory and binds this function into its bound form when its callers switch, with `dialectic-worker/index.ts` supplying the unbound implementation to it; nothing injects it here.

   * `[✅]`   `retryJob.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form. Every caller is in-TS and every value is already typed, so nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Attempt number: `params.job.attempt_count + 1`, held in one typed local and used by both the update and the notification text. Deciding whether to retry stays with the caller; recording which attempt this is belongs to the write, and the row is where that number lives.
      * `[✅]`   Update: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'retrying', attempt_count: <that local>, error_details: { failedAttempts: payload.failedAttempts.map(copy) } }).eq('id', params.job.id)` — the attempt records are copied member-wise into a fresh array, as they are today, so the caller's array is not aliased into the row write.
      * `[✅]`   Branch, condition the update returned a driver error: construct `RetryJobUpdateError` from `params.job.id`, the attempted status `'retrying'` and the driver's message; emit the existing error line verbatim — `[dialectic-worker] [retryJob] Failed to update job status to 'retrying': ${driver message}` — with the driver error as context, the error object carrying the three members and the log line carrying the text it carries today; return the error arm with `retriable: true`, a write the database refused now being one that can succeed on a later attempt. No notification is attempted and nothing below runs.
      * `[✅]`   Notification, unconditional: `deps.notificationService.sendContributionRetryingEvent` with a `ContributionGenerationRetryingPayload` literal carrying `type: 'contribution_generation_retrying'`, `sessionId` from `params.job.session_id`, `modelId` from the first attempt record's `modelId`, `iterationNumber` from `params.job.iteration_number`, `error` composed as `Attempt ${<the attempt local>} failed. Retrying...`, and `job_id` from `params.job.id`; the target user is `params.job.user_id`. The payload's `failedAttempts` array is non-empty by the guard, so the first record is always present and no default or fallback is supplied.
      * `[✅]`   Branch, condition the notification call resolved: return the notified flavor.
      * `[✅]`   Branch, condition the notification call threw an `Error`: emit the existing `[dialectic-worker] [retryJob] Failed to send notification: ${message}` line; return the notification-failed flavor carrying that error unchanged, never re-wrapped.
      * `[✅]`   Branch, condition the notification call threw a non-`Error` value: emit the existing non-`Error` form of that same line; return the notification-failed flavor carrying a `RetryJobNotificationError` built from `params.job.id` and the stringified thrown value. The catch binding is `unknown`, so the two cases are branched: a thrown `Error` is a typed error and is propagated unchanged, and a non-`Error` is no error at all, so this module returns a specific typed error it owns rather than coercing the value.
      * `[✅]`   Ordering and side effects: exactly one row write per call, and it precedes every notification decision; zero writes on the error arm; the notification is attempted at most once; neither `params` nor `payload` is mutated.

   * `[✅]`   `retryJob.mock.ts`
      * `[✅]`   `RetryJobDepsOverrides`, `buildRetryJobDeps`, `RetryJobDepsCorruptions` and `invalidateRetryJobDeps`; the builder's base composes `new MockLogger()` and `mockNotificationService`.
      * `[✅]`   `RetryJobParamsOverrides`, `buildRetryJobParams`, `RetryJobParamsCorruptions` and `invalidateRetryJobParams`; the builder's base client is `createMockSupabaseClient(undefined, {})` and its `job` is `buildDialecticJobRow()`. A case that turns on the attempt number or the owner overrides the row — `buildRetryJobParams({ job: buildDialecticJobRow({ attempt_count: 3 }) })` — so the fixture cannot hold two disagreeing values.
      * `[✅]`   `RetryJobPayloadOverrides`, `buildRetryJobPayload`, `RetryJobPayloadCorruptions` and `invalidateRetryJobPayload`; the builder's base composes `[buildFailedAttemptError()]` rather than restating that type's defaults.
      * `[✅]`   The four symbols for each of `RetryJobNotifiedReturn`, `RetryJobNotificationFailedReturn` and `RetryJobErrorReturn`; the notification-failed builder defaults `notificationError` to `buildRetryJobNotificationError()`, and the error builder composes `buildRetryJobUpdateError()`.
      * `[✅]`   `RetryJobUpdateErrorConstructorParamsOverrides`, `buildRetryJobUpdateErrorConstructorParams`, `RetryJobUpdateErrorConstructorParamsCorruptions` and `invalidateRetryJobUpdateErrorConstructorParams`, plus `buildRetryJobUpdateError(overrides?)` returning `new RetryJobUpdateError(buildRetryJobUpdateErrorConstructorParams(overrides))` — a real instance, prototype intact, no spread and no cast. There is no invalidator for the instance; corruption belongs to the constructor params.
      * `[✅]`   The same five symbols for the notification error: `RetryJobNotificationErrorConstructorParamsOverrides`, `buildRetryJobNotificationErrorConstructorParams`, `RetryJobNotificationErrorConstructorParamsCorruptions`, `invalidateRetryJobNotificationErrorConstructorParams` and `buildRetryJobNotificationError(overrides?)` returning a real instance. There is no invalidator for the instance.
      * `[✅]`   `mockRetryJob: RetryJobFn` returning `buildRetryJobNotifiedReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator for `DialecticJobRow` or `FailedAttemptError` is written here; both are imported types whose fixtures live in `_shared/dialectic.mock.ts`.

   * `[✅]`   `retryJob.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isRetryJobDeps`: accepts the built deps; rejects each of `logger` and `notificationService` absent and non-object; rejects a deps object whose `notificationService` carries no `sendContributionRetryingEvent` function; rejects a non-record root.
      * `[✅]`   `isRetryJobParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` set to `invalidateDialecticJobRow({ id: 42 })`, the case proving the row is checked through its owner's guard; rejects a row whose `attempt_count` is non-numeric, non-finite or negative; rejects a row whose `user_id` is absent, non-string, the empty string or whitespace-only, the last two proving the owner invariant is enforced rather than assumed; rejects a non-record root.
      * `[✅]`   `isRetryJobPayload`: accepts the built payload; rejects `failedAttempts` absent, a non-array, an empty array — a retry exists because attempts failed, so an empty batch is invalid input — and an array containing `invalidateFailedAttemptError({ modelId: 42 })`; rejects a non-record root.
      * `[✅]`   `isRetryJobNotifiedReturn`: accepts its own flavor; rejects `notified` absent or not exactly `true`; rejects the notification-failed flavor; rejects a non-record root.
      * `[✅]`   `isRetryJobNotificationFailedReturn`: accepts the built flavor, and accepts one whose `notificationError` is a plain `Error`, the member being typed `Error` rather than this module's own; rejects `notified` not exactly `false`; rejects `notificationError` absent, `null`, a string, and a plain object rather than an `Error`; rejects the notified flavor; rejects a non-record root.
      * `[✅]`   `isRetryJobErrorReturn`: accepts the built error return; rejects `error` absent, a plain object, and a plain `Error` that is not a `RetryJobUpdateError`; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[✅]`   `isRetryJobUpdateError`: accepts `buildRetryJobUpdateError()`; rejects a plain `Error`, a plain object carrying the same three members, `null` and a primitive — the object case being what proves membership is nominal rather than shape-matched.
      * `[✅]`   `isRetryJobNotificationError`: accepts `buildRetryJobNotificationError()`; rejects a plain `Error`, a plain object carrying the same two members, `buildRetryJobUpdateError()`, `null` and a primitive.

   * `[✅]`   `retryJob.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isRetryJobDeps`, `isRetryJobParams`, `isRetryJobPayload`, `isRetryJobNotifiedReturn`, `isRetryJobNotificationFailedReturn`, `isRetryJobErrorReturn`, `isRetryJobUpdateError` and `isRetryJobNotificationError`.
      * `[✅]`   `isRetryJobDeps` is a presence-of-method check, the deps being a behavior type: `logger` a record and `notificationService` a record whose `sendContributionRetryingEvent` is a function.
      * `[✅]`   `isRetryJobParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own, so the check is presence, not shape — and calls `isDialecticJobRow` on `job`. It then checks the two row members this function reads: `attempt_count` finite and not negative, and `user_id` a string that is non-empty after trim. Both are content invariants the row's own guard does not carry, and the worker fails an ownerless job before dispatch, so an empty owner here is invalid input rather than a state to branch on.
      * `[✅]`   `isRetryJobPayload` requires `failedAttempts` to be a non-empty array every element of which passes the imported `isFailedAttemptError`. The non-empty requirement is the domain invariant: a retry exists because at least one attempt failed, so an empty array is invalid input the guard rejects rather than a state the implementation branches on.
      * `[✅]`   `isRetryJobNotifiedReturn` requires `notified` exactly `true`; `isRetryJobNotificationFailedReturn` requires `notified` exactly `false` and `notificationError` `instanceof Error`. The two flavors are mutually exclusive, so a value passes exactly one.
      * `[✅]`   `isRetryJobErrorReturn` requires `error` to pass `isRetryJobUpdateError` and `retriable` to be a boolean.
      * `[✅]`   `isRetryJobUpdateError` is `value instanceof RetryJobUpdateError` and nothing more, and `isRetryJobNotificationError` is `value instanceof RetryJobNotificationError` and nothing more. The constructor is each type's only producer, so membership is nominal and a property-by-property inspection would accept plain objects the constructor never produced.
      * `[✅]`   No guard is written here for `DialecticJobRow`, `FailedAttemptError` or `Database`; none is owned by this interface, and each already has a guard in its owner's file.

   * `[✅]`   `retryJob.test.ts`
      * `[✅]`   Params fixtures are `buildRetryJobParams({ dbClient })` where `dbClient` comes from `createMockSupabaseClient` configured for the `dialectic_generation_jobs` update the case turns on; deps fixtures are `buildRetryJobDeps({ … })`; payload fixtures are `buildRetryJobPayload({ … })`. Each block calls `resetMockNotificationService` before arranging, so the shared double's recorded calls belong to that block alone and no assertion on dispatch depends on block order.
      * `[✅]`   Update columns: a successful update over params whose row is built with `attempt_count: 3` records `status: 'retrying'` and `attempt_count: 4`, asserted as independent literals against the recorded update argument, and `error_details.failedAttempts` equal to the payload's records. The written number is stated as its own literal rather than computed from the fixture, so a case that echoed the row's value back would fail.
      * `[✅]`   Notified: a successful update returns the notified flavor, and the dispatched notification carries the job id, the session id, the iteration number and the first record's `modelId`, with the target user equal to the row's `user_id`.
      * `[✅]`   Notification threw: a deps object whose `notificationService.sendContributionRetryingEvent` throws a named `Error` returns the notification-failed flavor carrying that exact error, and the row write still happened. The failing member is declared as a production-typed function inside the test, not configured on the shared mock.
      * `[✅]`   Notification threw a non-`Error`: the same arrangement throwing a string returns the notification-failed flavor whose `notificationError` passes `isRetryJobNotificationError` and whose `thrownValue` is that string.
      * `[✅]`   Update failed: an update returning a driver error returns the error arm; the carried error passes `isRetryJobUpdateError`, its `jobId`, `attemptedStatus` and `driverMessage` are the job's id, `'retrying'` and the driver's message asserted as independent values, `retriable` is `true`, and no notification was dispatched.
      * `[✅]`   Purity: neither the params object nor the payload array is mutated by any path, asserted on the payload's length and first record after the call.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except `RetryJobUpdateError` on its error path and `RetryJobNotificationError` on its non-`Error` notification path. There is no factory and no partially constructed state.
      * `[✅]`   `RetryJobUpdateError` and `RetryJobNotificationError` each take exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's callers switch; this node constructs nothing at a boundary.

   * `[✅]`   `retryJob.ts`
      * `[✅]`   One exported function, typed `RetryJobFn`, implementing the interaction spec in its stated order: attempt number, update, update-failure branch, notification, notification-outcome branches.
      * `[✅]`   The update payload object and the notification payload object are each held in one typed local; neither is inferred and neither is widened at its use site.
      * `[✅]`   The notification call is wrapped in `try`/`catch`, the catch binds `unknown`, and both branches the spec names are written.
      * `[✅]`   Every return is one of the two arms and, within the success arm, exactly one named flavor; no path falls through, no flavor is assembled inline at a return site, and no failure is logged instead of returned.

   * `[✅]`   `retryJob.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including `RetryJobUpdateError`, `RetryJobNotificationError` and the three flavor guards — through one import point.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and the legacy `dialectic-worker/retryJob.ts` neither imports it nor is imported by it.
      * `[✅]`   No reverse dependency: `_shared` and `dialectic-service` gain no import of this module, and no file outside it is edited by this node.

   * `[✅]`   `requirements`
      * `[✅]`   `RetryJobDeps` declares exactly `logger` and `notificationService`, and `RetryJobParams` declares exactly `dbClient` and `job` — interface test.
      * `[✅]`   `RetryJobPayload` declares exactly `failedAttempts` — interface test.
      * `[✅]`   Both success flavors are members of `RetryJobSuccessReturn`, which is a member of `RetryJobReturn`, and the top-level union has exactly two arms — interface test.
      * `[✅]`   `RetryJobNotificationFailedReturn` requires `notificationError`, and `RetryJobNotifiedReturn` declares no such member — interface test.
      * `[✅]`   `isRetryJobUpdateError` rejects a plain object carrying the same three members — guard test.
      * `[✅]`   `isRetryJobPayload` rejects an array containing one invalid attempt record — guard test.
      * `[✅]`   The three flavor guards are mutually exclusive: each rejects the other two flavors, so a consumer discriminates by guard and never by a null check — guard test.
      * `[✅]`   A successful update writes `status: 'retrying'` and one past the row's `attempt_count`, and copies the payload's records into `error_details.failedAttempts` — unit test.
      * `[✅]`   A successful update returns the notified flavor and dispatches one notification carrying the job's identifiers, targeted at the row's `user_id` — unit test.
      * `[✅]`   A notification that throws an `Error` returns the notification-failed flavor carrying that error unchanged, and one that throws a non-`Error` returns the same flavor carrying a `RetryJobNotificationError` naming the thrown value — unit test.
      * `[✅]`   A failed update returns the error arm carrying a `RetryJobUpdateError` whose three members are the job id, `'retrying'` and the driver's message, with `retriable: true` and no notification dispatched — unit test.
      * `[✅]`   `dialectic-worker/retryJob.ts` and `dialectic-worker/retryJob.test.ts` are unchanged by this node, and every existing consumer of the legacy function still compiles.

* `[✅]`   supabase/functions/dialectic-worker/assembleAiResponse/assembleAiResponse.ts **[BE] `UnifiedAIResponse` assembly — real token counting through an injected tokenizer, three-branch finish-reason resolution, raw-provider composition, and caller-supplied timing and preflight**

   * `[✅]`   `objective`
      * `[✅]`   The response-assembly block inside `saveResponse.ts` produces the token counts the debit and the affordability preflight are computed from, and three of its four inputs are fabricated. Completion tokens are `contentString.length`, a character count standing in for a token count. Elapsed time is a local `const processingTimeMs: number = 0`. The prompt count comes from a property-descriptor probe of an untyped job payload that returns `0` when the member is absent. The finish reason is one ternary that maps a null, a valid value and an unrecognized value onto two outcomes, supplying `'unknown'` as a default for two of the three. The block is inline in the orchestrator, so it has no contract, no test of its own, and nothing that can assert what it produces.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/assembleAiResponse/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `AssembleAiResponseReturn`.
         * `[✅]`   Completion tokens for a synthesized usage are counted by the injected bound tokenizer against the caller's model config. No string length is used as a token count anywhere in the module.
         * `[✅]`   Prompt tokens for a synthesized usage are `params.preflightInputTokens`. The module performs no property probe and holds no fallback for an absent count.
         * `[✅]`   Elapsed time is `params.processingTimeMs`. The module declares no default for it.
         * `[✅]`   A stream-reported token usage is used as given; synthesis happens only when the stream reported none and the assembled content is non-empty.
         * `[✅]`   Assembled content trims to `null` when the trimmed string is empty, and that null is what suppresses synthesis.
         * `[✅]`   The finish-reason resolution is preserved exactly as the source performs it, including `'unknown'` for both an absent and an unrecognized value. `'unknown'` is a member of the continuation subset, so an unresolved reason resumes the job; treating either case as a failure would convert a recoverable truncation into a permanent one.
         * `[✅]`   The assembled `UnifiedAIResponse` carries `content`, `tokenUsage`, `inputTokens`, `outputTokens`, `processingTimeMs`, `finish_reason` and a `rawProviderResponse` holding the same usage and reason, composed exactly as the source composes them.
         * `[✅]`   The module owns `AssembleAiResponseTokenCountError` and declares it in its own interface.
         * `[✅]`   `isUnifiedAIResponse` is added to `_shared/utils/type-guards/type_guards.dialectic.ts`, the guard file of the interface that owns the type, with its own guard test. No guard for it exists in the repo today, and this module's success-return guard calls it.
         * `[✅]`   `BoundCountTokensFn` is declared in `_shared/types/tokenizer.types.ts` beside `CountTokensFn`, its owner, as `(payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number`.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts` is not edited, and neither is `saveResponse.interface.ts`. The module lands beside the monolith with its own tests; the orchestrator switches to it, deletes the inline block, and deletes `readOptionalPreflightInputTokens` in the relocation node. Every current consumer keeps compiling.
         * `[✅]`   The two `deps.logger.info` calls that follow the assembly block belong to the orchestrator and stay there. This module has no logger dep and emits no log line.
         * `[✅]`   The module performs no IO, reads no row, and touches no database client.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is a domain-layer pure transform: given what the stream reported and what the caller measured, produce the single response object every downstream decision reads.
      * `[✅]`   The role is correct because the function decides nothing about the job and writes nothing — it converts a transport-shaped result into the repo's response type, and the one collaborator it needs is a counter, not a service.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not decide whether the response is usable, retriable, complete or continuable. Those are `prepareResponseContent`'s branches.
         * `[✅]`   Do not measure elapsed time, read the job row, or derive the preflight count. All three arrive as params.
         * `[✅]`   Do not sanitize, parse or inspect the content beyond trimming it.
         * `[✅]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/assembleAiResponse` — the conversion of one stream result into one `UnifiedAIResponse`.
      * `[✅]`   Inside boundary:
         * `[✅]`   The content trim rule, the usage copy-or-synthesize rule, the three finish-reason branches, and the composition of the response object and its `rawProviderResponse`.
         * `[✅]`   `AssembleAiResponseDeps`, `AssembleAiResponseParams`, `AssembleAiResponsePayload`, the success arm, the error arm, the return union, the function type, `AssembleAiResponseTokenCountError` and its constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `UnifiedAIResponse`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `TokenUsage`, `FinishReason` and `AiModelExtendedConfig`, owned by `_shared/types.ts`.
         * `[✅]`   `CountableChatPayload`, `CountTokensFn` and `BoundCountTokensFn`, owned by `_shared/types/tokenizer.types.ts`.
         * `[✅]`   How the tokenizer counts, where the preflight count came from, and what any consumer does with the assembled response.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types/tokenizer.types.ts` (`BoundCountTokensFn`, `CountableChatPayload`, `CountTokensFn`).
         * `[✅]`   Layer classification: shared type surface for the tokenizer contract.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the injected counter and the payload literal it takes. The bound form is declared by this node in that file, because injecting the unbound `CountTokensFn` would force this module to hold and pass down `CountTokensDeps`, which is another module's deps object.
      * `[✅]`   Provider: `_shared/types.ts` (`AiModelExtendedConfig`, `TokenUsage`, `FinishReason`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the config the counter is called against, the usage type the payload carries and the module produces, and the resolved reason.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`UnifiedAIResponse`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the type this module assembles and returns on its success arm.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of the assembled type.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the fixtures for the success-return builder and for the `isUnifiedAIResponse` guard test this node adds.
      * `[✅]`   Confirm:
         * `[✅]`   `AssembleAiResponseDeps` declares exactly `countTokens` — the one collaborator the branch contract invokes. Timing, preflight and model config are per-invocation params; the stream result is the payload.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From the tokenizer contract: the `BoundCountTokensFn` and `CountableChatPayload` types only, imported with `import type`.
         * `[✅]`   From `_shared/types.ts`: the `AiModelExtendedConfig`, `TokenUsage` and `FinishReason` types only, imported with `import type`.
         * `[✅]`   From the hub: the `UnifiedAIResponse` type only, imported with `import type`.

   * `[✅]`   `assembleAiResponse.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case asserts the required key surface of `Parameters<AssembleAiResponseFn>[0]` is exactly `countTokens`.
      * `[✅]`   A case asserts the required key surface of `Parameters<AssembleAiResponseFn>[1]` is exactly `processingTimeMs`, `preflightInputTokens` and `modelConfig`.
      * `[✅]`   A case asserts the required key surface of `Parameters<AssembleAiResponseFn>[2]` is exactly `assembledContent`, `tokenUsage` and `finishReason`, proving the stream result is the payload and the caller's measurements are not.
      * `[✅]`   A case asserts the required key surface of `AssembleAiResponseSuccessReturn` is exactly `aiResponse`.
      * `[✅]`   A case assigns an `AssembleAiResponseSuccessReturn`-typed value to `AssembleAiResponseReturn` and a case assigns an `AssembleAiResponseErrorReturn`-typed value to it, proving the union has exactly the two arms.
      * `[✅]`   A case asserts the required key surface of `AssembleAiResponseErrorReturn` is exactly `error` and `retriable`.
      * `[✅]`   A case asserts the required key surface of `AssembleAiResponseTokenCountErrorConstructorParams` is exactly `apiIdentifier` and `thrownValue`.
      * `[✅]`   A case assigns a function literal of shape `(deps, params, payload) => AssembleAiResponseReturn` to `AssembleAiResponseFn`, proving the signature is synchronous — the module performs no IO and awaits nothing.
      * `[✅]`   A case assigns `{ message: 'x' }` to `CountableChatPayload` and assigns a function literal of shape `(payload, modelConfig) => number` to `BoundCountTokensFn`, proving the bound form drops the deps parameter and keeps the other two.

   * `[✅]`   `_shared/types/tokenizer.types.ts` gains `export type BoundCountTokensFn = (payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number;` beside `CountTokensFn`. `CountTokensFn` itself is unchanged.
   
   * `[✅]`   `dialectic-service/dialectic.interface.ts` names the token-usage member's type: `export interface UnifiedAIResponseTokenUsage { prompt_tokens: number; completion_tokens: number; total_tokens?: number; }`, and `UnifiedAIResponse.tokenUsage` becomes `UnifiedAIResponseTokenUsage | null`. Every member and `total_tokens`' optionality are unchanged; the type is named so it has an owner, and therefore a guard for `isUnifiedAIResponse` to call rather than a shape to restate. It is not merged with `TokenUsage`, which requires `total_tokens`, and why the two diverge is not settled here. `UnifiedAIResponse`'s other members are unchanged.

   * `[✅]`   `assembleAiResponse.interface.ts`
      * `[✅]`   `export interface AssembleAiResponseDeps { countTokens: BoundCountTokensFn; }`
      * `[✅]`   `export interface AssembleAiResponseParams { processingTimeMs: number; preflightInputTokens: number; modelConfig: AiModelExtendedConfig; }` — all three are measured or resolved by the caller per invocation.
      * `[✅]`   `export interface AssembleAiResponsePayload { assembledContent: string; tokenUsage: TokenUsage | null; finishReason: string | null; }` — the stream result, the data the function operates on. Both null states are declared here because both are ordinary reported outcomes. `finishReason` is the raw reported string because narrowing it is this module's work. The caller composes this value member-wise from the transport body it already holds; this module declares the type it receives, so no type crosses from the orchestrator down into it.
      * `[✅]`   `export type AssembleAiResponseSuccessReturn = { aiResponse: UnifiedAIResponse };`
      * `[✅]`   `export type AssembleAiResponseErrorReturn = { error: AssembleAiResponseTokenCountError; retriable: boolean };` — the tokenizer throwing is this module's only failure; no finish-reason value is a failure, every one of them resolving to a member of `FinishReason`.
      * `[✅]`   `export type AssembleAiResponseReturn = AssembleAiResponseSuccessReturn | AssembleAiResponseErrorReturn;` — exactly two arms.
      * `[✅]`   `export type AssembleAiResponseFn = (deps: AssembleAiResponseDeps, params: AssembleAiResponseParams, payload: AssembleAiResponsePayload) => AssembleAiResponseReturn;`
      * `[✅]`   `export interface AssembleAiResponseTokenCountErrorConstructorParams { apiIdentifier: string; thrownValue: string; }` and `export class AssembleAiResponseTokenCountError extends Error` taking that one params object, holding each member as a readonly property, setting `name` to `'AssembleAiResponseTokenCountError'`, and composing its `message` from the two.

   * `[✅]`   `assembleAiResponse.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form. The orchestrator guards the transport body at the boundary and composes this payload from the narrowed result, so nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Content derivation: `trimmedContent` is `payload.assembledContent.trim()`; `contentString` is `null` when `trimmedContent` is the empty string and `trimmedContent` otherwise. This is the value that decides whether synthesis runs.
      * `[✅]`   Finish reason, preserved exactly as the source resolves it. The reason is tripartite: the model can declare it in its response body, the provider can declare it in the envelope, and when neither carries one the object arrived truncated — which is itself the fact that the response is unfinished. `'unknown'` is the domain's name for that third case and is a member of the continuation subset, so an unresolved reason resumes rather than completing. `isFinishReason` admits `null` deliberately, for the same reason.
      * `[✅]`   Branch, condition `payload.finishReason` passes `isFinishReason` and is not `null`: the resolved reason is that value.
      * `[✅]`   Branch, condition `payload.finishReason` is `null`: the resolved reason is `'unknown'`.
      * `[✅]`   Branch, condition `payload.finishReason` does not pass `isFinishReason`: the resolved reason is `'unknown'`. An unrecognized value is the same "we do not know" state as an absent one, and both resume; neither is an error and neither halts assembly.
      * `[✅]`   Branch, condition `payload.tokenUsage` is not `null`: the effective usage is a `TokenUsage` copying `prompt_tokens`, `completion_tokens` and `total_tokens` member-wise from it. No dependency call is made — the stream reported real counts and they are used as reported.
      * `[✅]`   Branch, condition `payload.tokenUsage` is `null` and `contentString` is `null`: the effective usage is `null`. There is no content to count, so no dependency call is made and nothing is synthesized.
      * `[✅]`   Branch, condition `payload.tokenUsage` is `null` and `contentString` is not `null`: call `deps.countTokens` with a `CountableChatPayload` carrying `message: contentString` and with `params.modelConfig`; the effective usage is `prompt_tokens: params.preflightInputTokens`, `completion_tokens: the returned count`, `total_tokens: their sum`.
      * `[✅]`   Branch, condition the `deps.countTokens` call throws: return the error arm carrying `AssembleAiResponseTokenCountError` built from `params.modelConfig.api_identifier` and the stringified thrown value, with `retriable: false`. The counter is deterministic over its inputs, so the same call fails the same way. The catch binding is `unknown` and the thrown value is stringified rather than coerced to an `Error`.
      * `[✅]`   Assembly: the success arm carries a `UnifiedAIResponse` whose `content` is `contentString`, `tokenUsage` is the effective usage, `inputTokens` is that usage's `prompt_tokens` and `outputTokens` its `completion_tokens` — both absent when the usage is `null` — `processingTimeMs` is `params.processingTimeMs`, `finish_reason` is the resolved reason, and `rawProviderResponse` holds the same effective usage under `token_usage` and the same resolved reason under `finish_reason`.
      * `[✅]`   Ordering and side effects: the finish reason resolves first and its error branch returns before any counting; `deps.countTokens` is invoked at most once per call and only in the synthesis branch; neither `params` nor `payload` is mutated; no value is logged, read or written.

   * `[✅]`   `_shared/dialectic.mock.ts` gains the four symbols for `UnifiedAIResponseTokenUsage`, the object type the hub names in this node, so `isUnifiedAIResponseTokenUsage`'s guard test has fixtures from that type's home package; `buildUnifiedAIResponse` composes that builder for its `tokenUsage` member rather than restating the three counts.

   * `[✅]`   `assembleAiResponse.mock.ts`
      * `[✅]`   `AssembleAiResponseDepsOverrides`, `buildAssembleAiResponseDeps`, `AssembleAiResponseDepsCorruptions` and `invalidateAssembleAiResponseDeps`; the builder's base `countTokens` is a production-typed `BoundCountTokensFn` returning a fixed non-zero count, so a case that depends on the counted value has to override it and a case that reads a zero cannot pass by accident.
      * `[✅]`   `AssembleAiResponseParamsOverrides`, `buildAssembleAiResponseParams`, `AssembleAiResponseParamsCorruptions` and `invalidateAssembleAiResponseParams`; the builder's base `processingTimeMs` and `preflightInputTokens` are distinct non-zero numbers so a case cannot pass by reading one where it meant the other, and its `modelConfig` composes the `AiModelExtendedConfig` builder from that type's home package rather than restating its defaults.
      * `[✅]`   `AssembleAiResponsePayloadOverrides`, `buildAssembleAiResponsePayload`, `AssembleAiResponsePayloadCorruptions` and `invalidateAssembleAiResponsePayload`; the builder's base `assembledContent` is a non-empty string, its `tokenUsage` composes the `TokenUsage` builder from that type's home package, and its `finishReason` is `'stop'`.
      * `[✅]`   The four symbols for each of `AssembleAiResponseSuccessReturn` and `AssembleAiResponseErrorReturn`; the success builder composes `buildUnifiedAIResponse()` from `_shared/dialectic.mock.ts`, and the error builder composes `buildAssembleAiResponseTokenCountError()`.
      * `[✅]`   The four symbols for the error's constructor-params type, plus `buildAssembleAiResponseTokenCountError(overrides?)` returning a real instance — prototype intact, no spread and no cast. There is no invalidator for the instance; corruption belongs to the constructor params.
      * `[✅]`   `mockAssembleAiResponse: AssembleAiResponseFn` returning `buildAssembleAiResponseSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator is written here for `UnifiedAIResponse`, `TokenUsage` or `AiModelExtendedConfig`; all three are imported types whose fixtures live in their home packages. A test needing a different count declares its own production-typed `BoundCountTokensFn` inside the test rather than calling the configurable `createMockCountTokens` factory.

   * `[✅]`   `type_guards.dialectic.test.ts` gains the checklist for `isUnifiedAIResponseTokenUsage`, fixtures from that type's own builder and invalidator: accepts the valid default; accepts one omitting the optional `total_tokens`; rejects each of `prompt_tokens` and `completion_tokens` absent and non-numeric; rejects `total_tokens` present and non-numeric; rejects `null`, a primitive and an array.
   * `[✅]`   `type_guards.dialectic.test.ts` gains the checklist for `isUnifiedAIResponse`: accepts `buildUnifiedAIResponse()`; accepts one whose only member is `content`, every other member being optional; accepts `content` set to `null`; rejects `content` absent; rejects each of `content`, `inputTokens`, `outputTokens`, `processingTimeMs`, `contentType`, `error`, `errorCode`, `finish_reason`, `tokenUsage` and `rawProviderResponse` present but corrupted, one case per member; accepts `tokenUsage` `null`; rejects `null`, a primitive and an array. The `finish_reason` and `tokenUsage` cases are single corruptions proving delegation — what each of those types admits is its own guard test's subject, and no rule about either is restated here.
   
   * `[✅]`   `assembleAiResponse.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isAssembleAiResponseDeps`: accepts the built deps; rejects `countTokens` absent, non-function and a plain object; rejects a non-record root.
      * `[✅]`   `isAssembleAiResponseParams`: accepts the built params; rejects each of `processingTimeMs` and `preflightInputTokens` absent, non-numeric, non-finite and negative; rejects `modelConfig` absent and set to that type's invalidator output, the case proving the config is checked through its owner's guard; rejects a non-record root.
      * `[✅]`   `isAssembleAiResponsePayload`: accepts the built payload; accepts `assembledContent` set to the empty string, an empty stream result being valid input; accepts `tokenUsage` `null` and `finishReason` `null`, both being declared reported states; rejects `assembledContent` absent and non-string; rejects `tokenUsage` set to that type's invalidator output; rejects `finishReason` absent and non-string; rejects a non-record root.
      * `[✅]`   `isAssembleAiResponseSuccessReturn`: accepts the built return; rejects `aiResponse` absent and set to `invalidateUnifiedAIResponse({ content: 42 })`, the case proving the response is checked through the guard this node adds; rejects a non-record root.
      * `[✅]`   `isAssembleAiResponseErrorReturn`: accepts the built return; rejects `error` absent, a plain object, and a plain `Error` that is not the owned class; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[✅]`   `isAssembleAiResponseTokenCountError`: accepts its builder's instance; rejects a plain `Error`, a plain object carrying the same members, `null` and a primitive — the plain-object case being what proves membership is nominal.

   * `[✅]`   `_shared/utils/type-guards/type_guards.dialectic.ts` also gains `isUnifiedAIResponseTokenUsage`, the guard for the named member type: a record whose `prompt_tokens` and `completion_tokens` are numbers and whose `total_tokens` is a number when present. It is written here because the hub owns that type, and `isUnifiedAIResponse` calls it rather than inlining its three checks.
      * `[✅]`   `_shared/utils/type-guards/type_guards.dialectic.ts` gains `isUnifiedAIResponse`, written there because that guard file belongs to the interface that owns the type. It is composed, not hand-rolled: a record root, then one check per member, each delegating to the guard owned by that member's type. `finish_reason` calls the imported `isFinishReason`; `tokenUsage` calls `isUnifiedAIResponseTokenUsage`, the guard for the member type the hub names in this node; `rawProviderResponse` calls `isRecord`, that member's declared type being `Record<string, unknown>`. `content` is a string or `null`, and `error`, `errorCode`, `contentType`, `inputTokens` and `outputTokens` are primitives checked directly, primitives having no owner to delegate to. Only `content` is required; every other member is checked when present.

   * `[✅]`   `assembleAiResponse.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isAssembleAiResponseDeps`, `isAssembleAiResponseParams`, `isAssembleAiResponsePayload`, `isAssembleAiResponseSuccessReturn`, `isAssembleAiResponseErrorReturn` and `isAssembleAiResponseTokenCountError`.
      * `[✅]`   `isAssembleAiResponseDeps` is a presence-of-method check, the deps being a behavior type: `countTokens` is a function and nothing about its behavior is asserted.
      * `[✅]`   `isAssembleAiResponseParams` requires `processingTimeMs` and `preflightInputTokens` finite and not negative, and calls the imported `isAiModelExtendedConfig` on `modelConfig`.
      * `[✅]`   `isAssembleAiResponsePayload` requires `assembledContent` a string, `tokenUsage` either `null` or passing the imported `isTokenUsage`, and `finishReason` either `null` or a string. It does not narrow the reason to `FinishReason` — an unreported or unrecognized reason is valid input the branch contract handles, not invalid data.
      * `[✅]`   `isAssembleAiResponseSuccessReturn` requires `aiResponse` to pass the imported `isUnifiedAIResponse`. `isAssembleAiResponseErrorReturn` requires `error` to pass either owned error guard and `retriable` to be a boolean.
      * `[✅]`   `isAssembleAiResponseTokenCountError` is `value instanceof AssembleAiResponseTokenCountError` and nothing more. The constructor is the type's only producer, so membership is nominal.
      * `[✅]`   No guard is written here for `UnifiedAIResponse`, `TokenUsage`, `AiModelExtendedConfig`, `FinishReason` or the tokenizer types; none is owned by this interface.

   * `[✅]`   `assembleAiResponse.test.ts`
      * `[✅]`   Deps fixtures are `buildAssembleAiResponseDeps({ … })`, params fixtures `buildAssembleAiResponseParams({ … })` and payload fixtures `buildAssembleAiResponsePayload({ … })`, each overriding only what its case turns on.
      * `[✅]`   Reported usage is used as given: a payload whose `tokenUsage` carries counts distinct from the deps counter's return yields a response whose `tokenUsage` is those counts, and the counter is never invoked — asserted on a spy the test applies to its own production-typed `countTokens` at the call site.
      * `[✅]`   Synthesis counts real tokens: a payload with `tokenUsage: null` and non-empty content, over deps whose `countTokens` returns a fixed number unequal to the content's character length, yields `completion_tokens` equal to that number. The content is chosen so its length and the returned count differ, so an implementation reading `.length` fails this case.
      * `[✅]`   Synthesis uses the params' preflight: the same arrangement yields `prompt_tokens` equal to `params.preflightInputTokens` and `total_tokens` equal to that plus the counted number, asserted as independent literals.
      * `[✅]`   The counter is called with the trimmed content and the params' config: the same arrangement records a single invocation whose payload `message` is the trimmed content and whose second argument is `params.modelConfig`.
      * `[✅]`   Empty content suppresses synthesis: a payload with `tokenUsage: null` and `assembledContent` set to whitespace yields a response whose `content` is `null` and whose `tokenUsage` is `null`, with `inputTokens` and `outputTokens` absent, and the counter is never invoked.
      * `[✅]`   Elapsed time is the params': a response assembled over params built with a distinct `processingTimeMs` carries that number, which differs from every other number in the arrangement so a case reading the wrong member cannot pass.
      * `[✅]`   Reported-none reason: a payload with `finishReason: null` yields `finish_reason` `'unknown'` on both the response and its `rawProviderResponse`.
      * `[✅]`   Recognized reason: a payload with `finishReason: 'length'` yields `'length'` on both.
      * `[✅]`   Unrecognized reason: a payload with `finishReason: 'not_a_reason'` yields `'unknown'` on both the response and its `rawProviderResponse`, and assembly proceeds. Arranged beside the null case and the recognized case, the three together proving every input resolves to a `FinishReason` and none is a failure.
      * `[✅]`   The unresolved reason resumes: a response whose resolved reason is `'unknown'` passes `isDialecticContinueReason`, which is what makes a truncated object resume rather than complete.
      * `[✅]`   Counter threw: deps whose `countTokens` throws a named `Error`, over a payload that would synthesize, return the error arm; the carried error passes `isAssembleAiResponseTokenCountError`, its `apiIdentifier` and `thrownValue` are the config's identifier and the thrown value stringified, and `retriable` is `false`. The throwing member is declared as a production-typed function inside the test.
      * `[✅]`   Counter threw a non-`Error`: the same arrangement throwing a string returns the same error arm carrying that string as `thrownValue`.
      * `[✅]`   Raw provider composition: a successful assembly's `rawProviderResponse` carries the same usage object contents and the same resolved reason as the response's own members.
      * `[✅]`   Purity: neither the params object nor the payload object is mutated by any path, asserted on their members after the call.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its two error types on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, which also binds `countTokens` from `CountTokensFn` and its `CountTokensDeps` before injecting it here. This node constructs nothing at a boundary.

   * `[✅]`   `assembleAiResponse.ts`
      * `[✅]`   One exported function, typed `AssembleAiResponseFn`, implementing the interaction spec in its stated order: content derivation, finish-reason branches, usage branches, assembly.
      * `[✅]`   The effective usage, the resolved reason, the `CountableChatPayload` passed to the counter, and the assembled response are each held in one typed local; none is inferred and none is widened at its use site.
      * `[✅]`   The `deps.countTokens` call is wrapped in `try`/`catch`, the catch binds `unknown`, and the thrown value is stringified for the error's member rather than coerced to an `Error`.
      * `[✅]`   Every return is one of the two arms; no path falls through, no default value substitutes for a missing input, and no failure is swallowed.

   * `[✅]`   `assembleAiResponse.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including both error classes and the return guards — through one import point.

   * `[✅]`   `assembleAiResponse.integration.test.ts`
      * `[✅]`   Boundary: the tokenizer. The real `countTokens` from `_shared/utils/tokenizer_utils.ts`, bound with real `CountTokensDeps`, runs against the real `assembleAiResponse`. No repo-owned function is mocked.
      * `[✅]`   Mocked: nothing inside the chain. The encoder the tokenizer loads is the true external edge and is used as it is in production, which is what makes the count real.
      * `[✅]`   A payload with `tokenUsage: null` and known non-empty content, over a real model config, yields `completion_tokens` equal to the real tokenizer's count for that content — a number asserted independently and unequal to the content's character length, so the case fails against a `.length` implementation and against a stubbed counter alike.
      * `[✅]`   A payload whose content is a single multi-token word proves the count is a token count rather than a word count.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared` and `dialectic-service` and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: the two foreign files this node edits gain declarations only — `_shared/types/tokenizer.types.ts` gains a type and `_shared/utils/type-guards/type_guards.dialectic.ts` gains a guard — and neither imports this module.

   * `[✅]`   `requirements`
      * `[✅]`   `AssembleAiResponseDeps` declares exactly `countTokens`, and timing, preflight and model config are params — interface test.
      * `[✅]`   `AssembleAiResponsePayload` declares exactly `assembledContent`, `tokenUsage` and `finishReason` — interface test.
      * `[✅]`   The return union has exactly two arms and the error member admits both owned error types — interface test.
      * `[✅]`   `BoundCountTokensFn` takes the payload and the model config and returns a number — interface test.
      * `[✅]`   `isUnifiedAIResponse` accepts a response carrying only `content` and rejects one with `content` absent — guard test.
      * `[✅]`   `isAssembleAiResponsePayload` accepts both declared null states and rejects a corrupted `tokenUsage` — guard test.
      * `[✅]`   The two owned error guards each reject the other's instance — guard test.
      * `[✅]`   A synthesized usage's `completion_tokens` is the injected counter's return, over content whose character length differs from it — unit test.
      * `[✅]`   A synthesized usage's `prompt_tokens` is the params' `preflightInputTokens` and `total_tokens` is the sum — unit test.
      * `[✅]`   A reported usage is passed through and the counter is not invoked — unit test.
      * `[✅]`   Whitespace-only content yields a `null` content and a `null` usage with no counter call — unit test.
      * `[✅]`   The assembled `processingTimeMs` is the params' value — unit test.
      * `[✅]`   A `null` reason and an unrecognized reason both resolve to `'unknown'`, and a recognized reason passes through — unit test.
      * `[✅]`   `'unknown'` is a continuation reason, so an unresolved finish reason resumes the job — unit test.
      * `[✅]`   A throwing counter returns the error arm carrying the config's identifier and the stringified thrown value, for both the `Error` and non-`Error` forms — unit test.
      * `[✅]`   The real tokenizer produces the assembled `completion_tokens`, unequal to the content's character length — integration test.
      * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[✅]`   supabase/functions/dialectic-worker/loadJobContext/loadJobContext.ts **[BE] The job and provider reads with the base-payload census, returning the job row, the provider row, the validated config and the payload identifiers the row does not carry**

   * `[✅]`   `objective`
      * `[✅]`   The context-loading block inside `saveResponse.ts` re-derives from the job payload what the job row already states, and hand-rolls validation the base guard family already performs. It reads `sessionId`, `iterationNumber` and `stageSlug` off the payload and validates each with its own `typeof` block, though `dialectic_generation_jobs` carries `session_id`, `iteration_number` and `stage_slug` as non-null columns. It reads `dialectic_sessions` and inspects nothing but the row count, asserting a foreign key the database already enforces. It derives the owner as `typeof job.user_id === "string" ? job.user_id : ""`, manufacturing an ownerless job out of a non-null column. Every one of its failures returns an untyped `Error` with `retriable: false`, so a transient driver fault is reported as permanent.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/loadJobContext/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `LoadJobContextReturn`.
         * `[✅]`   Two reads: `dialectic_generation_jobs` by the payload's job id, and `ai_providers` by the base payload's `model_id`. No session read.
         * `[✅]`   The job payload is validated by the imported throwing `isDialecticBaseJobPayload`, whose thrown diagnostic names the offending member. No member check is re-authored here.
         * `[✅]`   The success arm carries the job row whole, so `session_id`, `iteration_number`, `stage_slug`, `user_id` and `attempt_count` reach consumers as row columns and are never re-derived from the payload.
         * `[✅]`   The success arm additionally carries the provider row, the validated extended config, and the two base-payload identifiers the row does not carry — `walletId` and `projectId`.
         * `[✅]`   Every failure returns a typed error the module owns, or the base guard's diagnostic propagated unchanged, with `retriable` true for a driver fault and false for absent or invalid data.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node. Every current consumer keeps compiling.
         * `[✅]`   `output_type` is not read here. It is a member of `DialecticExecuteJobPayload`, not of the base payload, and this module serves both arms; `resolveContributionIdentity` narrows the EXECUTE arm and resolves it.
         * `[✅]`   The row's `job_type` is not read here. Selecting an arm is the orchestrator's branch, and this module's work is identical for every arm.
         * `[✅]`   The module emits no log line and holds no logger.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer read: given a job id, produce the rows and identifiers every branch of the response path needs, proven valid once so no consumer re-proves them.
      * `[✅]`   The role is correct because everything it does is resolve identity — it decides nothing, writes nothing, and its output is the shared front half's entire input.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not narrow the payload to an arm, and do not read a member that belongs to one.
         * `[✅]`   Do not read the wallet, debit anything, or touch `dialectic_sessions`.
         * `[✅]`   Do not re-derive from the payload any fact the job row carries as a column.
         * `[✅]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/loadJobContext` — the resolution of one job id into the rows and identifiers its response path needs.
      * `[✅]`   Inside boundary:
         * `[✅]`   The two reads, the base-payload census, the provider validations, and the outcomes the two arms carry.
         * `[✅]`   `LoadJobContextDeps`, `LoadJobContextParams`, `LoadJobContextPayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DialecticJobRow`, `AiProvidersRow` and `DialecticBaseJobPayload`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `AiModelExtendedConfig`, owned by `_shared/types.ts`; `Database`, owned by `types_db.ts`.
         * `[✅]`   Which arm the job belongs to, and what any consumer does with the resolved context.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `AiProvidersRow`, `DialecticBaseJobPayload`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the two rows this module returns and the payload shape the base guard narrows to.
      * `[✅]`   Provider: `_shared/types.ts` (`AiModelExtendedConfig`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the validated config the success arm carries.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the injected client.
      * `[✅]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[✅]`   Layer classification: shared test fixture surface for the database boundary.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the injected client in every params fixture and the per-case configuration of both table reads.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of the job row.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the job row fixture in every case and in the success-return builder.
      * `[✅]`   Provider: `_shared/ai_service/ai_provider.mock.ts` (`buildMockProvider`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of the provider row.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the provider row fixture. This is the repo's existing builder for that row and is used as it stands; a second builder beside it would be duplication. A case needing an invalid provider row rest-destructures a required member off its output rather than casting.
      * `[✅]`   Confirm:
         * `[✅]`   `LoadJobContextDeps` declares no member. No branch of the contract invokes a collaborator: both reads go through the per-invocation client, and the guards are called, not injected. The object is declared and carries its full support system so a later collaborator is added to a shape that already exists.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From the hub: the `DialecticJobRow`, `AiProvidersRow` and `DialecticBaseJobPayload` types only, imported with `import type`.
         * `[✅]`   From `_shared/types.ts`: the `AiModelExtendedConfig` type only, imported with `import type`.
         * `[✅]`   From `types_db.ts`: the `Database` type only, imported with `import type`.

   * `[✅]`   `loadJobContext.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case asserts `Parameters<LoadJobContextFn>[0]` has no required key, proving the deps object is declared and empty rather than absent from the signature.
      * `[✅]`   A case asserts the required key surface of `Parameters<LoadJobContextFn>[1]` is exactly `dbClient`.
      * `[✅]`   A case asserts the required key surface of `Parameters<LoadJobContextFn>[2]` is exactly `jobId`, proving the identifier the function operates on is the payload and the client is not.
      * `[✅]`   A case asserts the required key surface of `LoadJobContextSuccessReturn` is exactly `job`, `providerRow`, `modelConfig`, `walletId` and `projectId` — exhaustive in both directions, so a member re-derived downstream cannot be quietly omitted here and a row column cannot be duplicated into it.
      * `[✅]`   A case asserts the required key surface of `LoadJobContextErrorReturn` is exactly `error` and `retriable`.
      * `[✅]`   A case assigns a `LoadJobContextSuccessReturn`-typed value to `LoadJobContextReturn` and a case assigns a `LoadJobContextErrorReturn`-typed value to it, proving the union has exactly the two arms.
      * `[✅]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[✅]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<LoadJobContextReturn>` to `LoadJobContextFn`, proving the signature is asynchronous.

   * `[✅]`   `loadJobContext.interface.ts`
      * `[✅]`   `export interface LoadJobContextDeps {}` — declared with no member. Every slot of the signature is supplied whether or not this function uses it today.
      * `[✅]`   `export interface LoadJobContextParams { dbClient: SupabaseClient<Database>; }`
      * `[✅]`   `export interface LoadJobContextPayload { jobId: string; }` — the identifier the function resolves. It reaches this module already narrowed by the orchestrator's boundary guard, so the trusted form applies and the parameter is not `unknown`.
      * `[✅]`   `export type LoadJobContextSuccessReturn = { job: DialecticJobRow; providerRow: AiProvidersRow; modelConfig: AiModelExtendedConfig; walletId: string; projectId: string };` — the row is carried whole, so `session_id`, `iteration_number`, `stage_slug`, `user_id` and `attempt_count` are read off it and are not restated as members. `walletId` and `projectId` are members because the row does not carry them.
      * `[✅]`   `export type LoadJobContextErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because one of its inhabitants is the base guard's thrown diagnostic, which is propagated unchanged; every other inhabitant is an owned class extending `Error`, and consumers discriminate by the guards below.
      * `[✅]`   `export type LoadJobContextReturn = LoadJobContextSuccessReturn | LoadJobContextErrorReturn;` — exactly two arms.
      * `[✅]`   `export type LoadJobContextFn = (deps: LoadJobContextDeps, params: LoadJobContextParams, payload: LoadJobContextPayload) => Promise<LoadJobContextReturn>;`
      * `[✅]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `LoadJobContextJobReadError { jobId; driverMessage }`, `LoadJobContextJobNotFoundError { jobId }`, `LoadJobContextProviderReadError { modelId; driverMessage }`, `LoadJobContextProviderNotFoundError { modelId }`, `LoadJobContextProviderInvalidError { modelId }`, `LoadJobContextConfigInvalidError { modelId }`.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[✅]`   `loadJobContext.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Job read: `params.dbClient.from('dialectic_generation_jobs').select('*').eq('id', payload.jobId)`.
      * `[✅]`   Branch, condition the job read returned a driver error: return the error arm carrying `LoadJobContextJobReadError` built from `payload.jobId` and the driver's message, with `retriable: true` — a read the database refused now can succeed on a later attempt. Nothing below runs.
      * `[✅]`   Branch, condition the job read returned no row: return the error arm carrying `LoadJobContextJobNotFoundError` built from `payload.jobId`, with `retriable: false`.
      * `[✅]`   Census: call the imported `isDialecticBaseJobPayload` on the first row's `payload` inside a `try`. It throws a per-member diagnostic rather than returning `false`, and it is the single source of truth for base-member validity; no member check is written here.
      * `[✅]`   Branch, condition the census threw: return the error arm carrying that thrown `Error` unchanged, with `retriable: false`. The catch binding is `unknown`; a thrown `Error` is propagated as-is, and a thrown non-`Error` is a defect in the guard family rather than a state this module models, so it is rethrown.
      * `[✅]`   Provider read: `params.dbClient.from('ai_providers').select('*').eq('id', <the narrowed payload's model_id>)`.
      * `[✅]`   Branch, condition the provider read returned a driver error: return the error arm carrying `LoadJobContextProviderReadError` built from that `model_id` and the driver's message, with `retriable: true`.
      * `[✅]`   Branch, condition the provider read returned no row: return the error arm carrying `LoadJobContextProviderNotFoundError` built from that `model_id`, with `retriable: false`.
      * `[✅]`   Branch, condition the first provider row fails the imported `isSelectedAiProvider`: return the error arm carrying `LoadJobContextProviderInvalidError` built from that `model_id`, with `retriable: false`.
      * `[✅]`   Branch, condition the provider row's `config` fails the imported `isAiModelExtendedConfig`: return the error arm carrying `LoadJobContextConfigInvalidError` built from that `model_id`, with `retriable: false`.
      * `[✅]`   Success: return the success arm carrying the job row, the provider row, the narrowed `config`, and `walletId` and `projectId` from the narrowed base payload.
      * `[✅]`   Ordering and side effects: the job read precedes the census, which precedes the provider read, because each supplies the next; exactly two reads on the success path and at most two on any path; no row is written; nothing is logged; neither `params` nor `payload` is mutated.

   * `[✅]`   `loadJobContext.mock.ts`
      * `[✅]`   `LoadJobContextDepsOverrides`, `buildLoadJobContextDeps`, `LoadJobContextDepsCorruptions` and `invalidateLoadJobContextDeps`; the builder returns the empty object the type declares.
      * `[✅]`   `LoadJobContextParamsOverrides`, `buildLoadJobContextParams`, `LoadJobContextParamsCorruptions` and `invalidateLoadJobContextParams`; the builder's base client is `createMockSupabaseClient(undefined, {})`.
      * `[✅]`   `LoadJobContextPayloadOverrides`, `buildLoadJobContextPayload`, `LoadJobContextPayloadCorruptions` and `invalidateLoadJobContextPayload`; the builder's base `jobId` is the id `buildDialecticJobRow()` carries, so the fixture is internally consistent.
      * `[✅]`   The four symbols for each of `LoadJobContextSuccessReturn` and `LoadJobContextErrorReturn`; the success builder composes `buildDialecticJobRow()` and `buildMockProvider()` rather than restating either row's defaults, and the error builder composes `buildLoadJobContextJobNotFoundError()`.
      * `[✅]`   The four symbols for each owned error's constructor-params type, plus a `buildLoadJobContext…Error(overrides?)` per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance; corruption belongs to the constructor params.
      * `[✅]`   `mockLoadJobContext: LoadJobContextFn` returning `buildLoadJobContextSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator for `DialecticJobRow`, `AiProvidersRow` or `AiModelExtendedConfig` is written here; all three are imported types whose fixtures live in their home packages.

   * `[✅]`   `loadJobContext.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isLoadJobContextDeps`: accepts the built deps; rejects `null`, `undefined`, a primitive and an array. The type declares no member, so a record root is the whole check and the cases prove it rejects a non-record rather than accepting anything.
      * `[✅]`   `isLoadJobContextParams`: accepts the built params; rejects `dbClient` absent and a string; rejects a non-record root.
      * `[✅]`   `isLoadJobContextPayload`: accepts the built payload; rejects `jobId` absent, non-string, the empty string and a whitespace-only string; rejects a non-record root.
      * `[✅]`   `isLoadJobContextSuccessReturn`: accepts the built return; rejects `job` set to `invalidateDialecticJobRow({ id: 42 })`, the case proving the row is checked through its owner's guard; rejects `providerRow` set to the builder's output with a required member rest-destructured away; rejects `modelConfig` absent and a plain object failing its owner's guard; rejects each of `walletId` and `projectId` absent, non-string and empty; rejects a non-record root.
      * `[✅]`   `isLoadJobContextErrorReturn`: accepts the built return; accepts one whose `error` is a plain `Error`, the member being typed `Error` so a propagated census diagnostic is admitted; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[✅]`   One case per owned error guard: each accepts its own builder's instance; each rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[✅]`   `loadJobContext.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isLoadJobContextDeps`, `isLoadJobContextParams`, `isLoadJobContextPayload`, `isLoadJobContextSuccessReturn`, `isLoadJobContextErrorReturn`, and one `instanceof` guard per owned error class.
      * `[✅]`   `isLoadJobContextDeps` requires a record root and nothing further, which is the complete check for a type declaring no member.
      * `[✅]`   `isLoadJobContextParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own, so the check is presence, not shape.
      * `[✅]`   `isLoadJobContextPayload` requires `jobId` a string that is non-empty after trim.
      * `[✅]`   `isLoadJobContextSuccessReturn` calls `isDialecticJobRow` on `job`, the imported `isSelectedAiProvider` on `providerRow` and the imported `isAiModelExtendedConfig` on `modelConfig`, and requires `walletId` and `projectId` to be strings non-empty after trim.
      * `[✅]`   `isLoadJobContextErrorReturn` requires `error` to be `instanceof Error` and `retriable` to be a boolean.
      * `[✅]`   Each owned error guard is `value instanceof <that class>` and nothing more. The constructor is each type's only producer, so membership is nominal.
      * `[✅]`   No guard is written here for `DialecticJobRow`, `AiProvidersRow`, `AiModelExtendedConfig`, `DialecticBaseJobPayload` or `Database`; none is owned by this interface, and each already has a guard in its owner's file.

   * `[✅]`   `loadJobContext.test.ts`
      * `[✅]`   Params fixtures are `buildLoadJobContextParams({ dbClient })` where `dbClient` comes from `createMockSupabaseClient` configured for the `dialectic_generation_jobs` and `ai_providers` reads the case turns on; deps fixtures are `buildLoadJobContextDeps()`; payload fixtures are `buildLoadJobContextPayload({ … })`.
      * `[✅]`   Success surface: a client configured with a job row and a valid provider row returns the success arm whose `job` is the configured row, whose `providerRow` is the configured provider, whose `modelConfig` is that provider's `config`, and whose `walletId` and `projectId` are the payload's — each asserted as an independent value, and the job row's `session_id`, `iteration_number` and `stage_slug` asserted reachable off the returned row.
      * `[✅]`   The provider is read by the payload's `model_id`: the job row is built with a payload whose `model_id` differs from every other identifier in the arrangement, and the recorded `ai_providers` filter is that value.
      * `[✅]`   Job read failed: a `dialectic_generation_jobs` read returning a driver error returns the error arm whose error passes `isLoadJobContextJobReadError`, carries the payload's `jobId` and the driver's message, and whose `retriable` is `true`; the `ai_providers` read never happened.
      * `[✅]`   Job absent: a read returning no rows returns the error arm whose error passes `isLoadJobContextJobNotFoundError` with `retriable` `false`.
      * `[✅]`   Census failed: a job row whose payload omits `walletId` returns the error arm carrying the `Error` `isDialecticBaseJobPayload` threw, its message unchanged from the guard's own diagnostic, with `retriable` `false`; the `ai_providers` read never happened.
      * `[✅]`   Provider read failed: an `ai_providers` read returning a driver error returns the error arm whose error passes `isLoadJobContextProviderReadError` with `retriable` `true`.
      * `[✅]`   Provider absent: an `ai_providers` read returning no rows returns the error arm whose error passes `isLoadJobContextProviderNotFoundError` with `retriable` `false`.
      * `[✅]`   Provider invalid: a provider row missing a member `isSelectedAiProvider` requires returns the error arm whose error passes `isLoadJobContextProviderInvalidError` with `retriable` `false`.
      * `[✅]`   Config invalid: a provider row whose `config` fails `isAiModelExtendedConfig` returns the error arm whose error passes `isLoadJobContextConfigInvalidError` with `retriable` `false`.
      * `[✅]`   No session read: every case asserts the recorded reads are `dialectic_generation_jobs` and `ai_providers` only, so a reintroduced `dialectic_sessions` round trip fails the suite.
      * `[✅]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's consumer switches; this node constructs nothing at a boundary.

   * `[✅]`   `loadJobContext.ts`
      * `[✅]`   One exported function, typed `LoadJobContextFn`, implementing the interaction spec in its stated order: job read, job branches, census, provider read, provider branches, success.
      * `[✅]`   The narrowed base payload and each constructed error are held in typed locals; nothing is inferred and nothing is widened at its use site.
      * `[✅]`   The census call is wrapped in `try`/`catch`, the catch binds `unknown`, and a caught `Error` is returned unchanged while a non-`Error` is rethrown.
      * `[✅]`   Every return is one of the two arms; no path falls through, no default value substitutes for a missing input, and no failure is logged instead of returned.

   * `[✅]`   `loadJobContext.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and the return guards — through one import point.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: no file outside this module is edited by this node.

   * `[✅]`   `requirements`
      * `[✅]`   `LoadJobContextParams` declares exactly `dbClient` and `LoadJobContextPayload` exactly `jobId` — interface test.
      * `[✅]`   `LoadJobContextDeps` is declared and has no required key — interface test.
      * `[✅]`   `LoadJobContextSuccessReturn` declares exactly `job`, `providerRow`, `modelConfig`, `walletId` and `projectId`, and the union has exactly two arms — interface test.
      * `[✅]`   `isLoadJobContextSuccessReturn` rejects a corrupted job row, an incomplete provider row and an invalid config — guard test.
      * `[✅]`   `isLoadJobContextErrorReturn` admits a plain `Error`, so a propagated census diagnostic is a valid error arm — guard test.
      * `[✅]`   A resolved context carries the configured job row, provider row and config, and the payload's `walletId` and `projectId` — unit test.
      * `[✅]`   The `ai_providers` read filters on the base payload's `model_id` — unit test.
      * `[✅]`   Each of the two driver faults returns its own typed error with `retriable` true, and each absence and each invalid narrowing returns its own typed error with `retriable` false — unit test.
      * `[✅]`   A payload failing the base guard returns that guard's thrown diagnostic unchanged, and no provider read occurs — unit test.
      * `[✅]`   Only `dialectic_generation_jobs` and `ai_providers` are read on every path — unit test.
      * `[✅]`   The real base guard's diagnostic is what reaches the error arm — integration test.
      * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[✅]`   supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.ts **[BE] The retry conditions, the sanitize → parse sequence, and the repo's only `determineContinuation` call — supplying `sourceObject`, and passing a text-mode response through unparsed**

   * `[✅]`   `objective`
      * `[✅]`   The content-preparation block inside `saveResponse.ts` reports a scheduled retry as a completed job. Each of its four retry conditions calls `retryJob` and then returns `{ status: 'completed' }`, so the one outcome a caller must act on is indistinguishable from success. It reads `continueUntilComplete`, `document_key` and `context_for_documents` off the untyped job payload behind `isRecord` probes, defaulting each through a ternary. And it calls `determineContinuation` without `sourceObject` — a required member of that function's params — so JSON-mode compression output is never verified against the source it was sent, and the call site does not type-check.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/prepareResponseContent/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `PrepareResponseContentReturn`.
         * `[✅]`   Every retry condition resolves to one retry-required success flavor carrying that condition's reason and no content members. The module calls no retry dispatcher and holds no notification service; the orchestrator builds the `FailedAttemptError[]` around the reason and dispatches.
         * `[✅]`   `continueUntilComplete`, `documentKey`, `contextForDocuments` and `sourceObject` arrive as params from an orchestrator that has narrowed the job's arm. The module performs no payload probe and holds no default for any of them.
         * `[✅]`   The `determineContinuation` call carries all seven members its params declare, `sourceObject` included, which is what makes a JSON-mode compression response verify against the source object it was sent and return through the ordinary continuation path when keys are missing.
         * `[✅]`   A response that is not parsed — an intermediate continuation chunk, or a text-mode source — resolves `shouldContinue` from the finish reason alone and passes its content through unchanged. Freeform text carries no structure to verify against, and the finish-reason gate still applies so an unfinished text compression resumes rather than persisting truncated.
         * `[✅]`   A parsed response resolves `shouldContinue` from the full `determineContinuation` verdict.
         * `[✅]`   The module owns `PrepareResponseContentSanitizeError` and `PrepareResponseContentContinuationError` for a collaborator that throws.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node.
         * `[✅]`   The four retry reason strings are preserved verbatim as the reason the flavor carries: `AI response was empty.`, `AI provider signaled error via finish_reason.`, `Invalid JSON sanitization result`, and `Malformed JSON response: ${message}`.
         * `[✅]`   All four log lines are preserved verbatim, including their `[saveResponse]` prefix and their structured second arguments.
         * `[✅]`   The module writes no row, sends no notification, and reads nothing.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is a domain-layer decision: given an assembled response, decide whether it is usable, what content should be stored, and whether the job is complete.
      * `[✅]`   The role is correct because this is the repo's only completeness decision — `continueJob` spawns a successor once someone has decided, `saveCompressedResponse` consumes the verdict, and `finalizeContributionJob` dispatches on it. Deciding is this module's whole purpose and no other module's.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not dispatch a retry, mutate a job row, or send a notification. A retry condition is an outcome this module reports.
         * `[✅]`   Do not narrow a job payload or select an arm; the orchestrator has narrowed before calling, which is how the arm-specific params arrive.
         * `[✅]`   Do not persist content, resolve identity, or decide what a continuation does.
         * `[✅]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/prepareResponseContent` — usability, storable content, and completeness for one assembled response.
      * `[✅]`   Inside boundary:
         * `[✅]`   The four retry conditions and their reasons, the two unparsed routes, the sanitize → parse sequence, and which `shouldContinue` each route produces.
         * `[✅]`   `PrepareResponseContentDeps`, `PrepareResponseContentParams`, `PrepareResponseContentPayload`, both success flavors, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `UnifiedAIResponse`, owned by `dialectic-service/dialectic.interface.ts`; `ContextForDocument`, owned there too.
         * `[✅]`   `FinishReason`, owned by `_shared/types.ts`; `CompressionMode`, owned by `_shared/types/file_manager.types.ts`.
         * `[✅]`   `DetermineContinuationParams`, `JsonSanitizationResult` and every collaborator's own contract.
         * `[✅]`   Which arm the job is on, where the params came from, and what any consumer does with the verdict.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types.ts` (`ILogger`, `FinishReason`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the four log lines this module emits, and the resolved finish reason it branches on.
      * `[✅]`   Provider: `dialectic-worker/createJobContext/JobContext.interface.ts` (`ResolveFinishReasonFn`, `IsIntermediateChunkFn`, `SanitizeJsonContentFn`, `DetermineContinuationFn`).
         * `[✅]`   Layer classification: sibling app-layer contract file, the declared home of all four collaborator function types.
         * `[✅]`   Direction: inbound; these are the types the worker's context already declares for the same four functions.
         * `[✅]`   Purpose: type the four injected collaborators the branch contract invokes.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`UnifiedAIResponse`, `ContextForDocument`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the response this module operates on and the document context `determineContinuation` matches against.
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`CompressionMode`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the mode that decides whether the content is parsed at all.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`).
         * `[✅]`   Layer classification: shared test fixture surface, home package of the payload's type.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the payload fixture in every case.
      * `[✅]`   Provider: `_shared/logger.mock.ts` (`MockLogger`).
         * `[✅]`   Layer classification: shared test fixture surface.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the deps fixture's logger member.
      * `[✅]`   Confirm:
         * `[✅]`   `PrepareResponseContentDeps` declares exactly `logger`, `resolveFinishReason`, `isIntermediateChunk`, `sanitizeJsonContent` and `determineContinuation` — the five collaborators the branch contract invokes. It declares no `retryJob` and no `notificationService`: once a retry condition is a returned flavor, no branch invokes either.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From `_shared/types.ts`: the `ILogger` and `FinishReason` types only, imported with `import type`.
         * `[✅]`   From the job-context contract file: the four collaborator function types only, imported with `import type`.
         * `[✅]`   From the hub: the `UnifiedAIResponse` and `ContextForDocument` types only, imported with `import type`.
         * `[✅]`   From the file-manager types: the `CompressionMode` type only, imported with `import type`.

   * `[✅]`   `prepareResponseContent.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case asserts the required key surface of `Parameters<PrepareResponseContentFn>[0]` is exactly `logger`, `resolveFinishReason`, `isIntermediateChunk`, `sanitizeJsonContent` and `determineContinuation` — exhaustive in both directions, it is the proof `retryJob` and `notificationService` are not deps of this module.
      * `[✅]`   A case asserts the required key surface of `Parameters<PrepareResponseContentFn>[1]` is exactly `jobId`, `mode`, `continueUntilComplete`, `documentKey`, `contextForDocuments` and `sourceObject`.
      * `[✅]`   A case asserts the required key surface of `Parameters<PrepareResponseContentFn>[2]` is exactly `aiResponse`.
      * `[✅]`   A case asserts the required key surface of `PrepareResponseContentRetryRequiredReturn` is exactly `retryRequired` and `reason`, proving the retry flavor carries no content member.
      * `[✅]`   A case asserts the required key surface of `PrepareResponseContentPreparedReturn` is exactly `retryRequired`, `contentForStorage`, `shouldContinue`, `needsContinuation`, `resolvedFinishReason` and `isIntermediate`.
      * `[✅]`   Two cases prove flavor membership by typed assignment: each success flavor is assignable to `PrepareResponseContentSuccessReturn`, and that is assignable to `PrepareResponseContentReturn`.
      * `[✅]`   A case assigns a `PrepareResponseContentErrorReturn`-typed value to `PrepareResponseContentReturn`, proving the union has exactly the two arms.
      * `[✅]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[✅]`   A case assigns a function literal of shape `(deps, params, payload) => PrepareResponseContentReturn` to `PrepareResponseContentFn`, proving the signature is synchronous — every collaborator it calls is synchronous and it performs no IO.

   * `[✅]`   `prepareResponseContent.interface.ts`
      * `[✅]`   `export interface PrepareResponseContentDeps { logger: ILogger; resolveFinishReason: ResolveFinishReasonFn; isIntermediateChunk: IsIntermediateChunkFn; sanitizeJsonContent: SanitizeJsonContentFn; determineContinuation: DetermineContinuationFn; }`
      * `[✅]`   `export interface PrepareResponseContentParams { jobId: string; mode: CompressionMode; continueUntilComplete: boolean; documentKey: string | undefined; contextForDocuments: ContextForDocument[] | undefined; sourceObject: unknown; }` — `documentKey` and `contextForDocuments` take the same declared forms `DetermineContinuationParams` gives them, and `sourceObject` the same `unknown`, so this module relays what it was handed and widens nothing at a use site. `mode` is `'json'` for an EXECUTE job and the compress payload's own mode for a COMPRESS job; the orchestrator resolves it when it narrows the arm.
      * `[✅]`   `export interface PrepareResponseContentPayload { aiResponse: UnifiedAIResponse; }` — the assembled response this module operates on, produced in-TS by `assembleAiResponse`, so the trusted form applies and the parameter is not `unknown`.
      * `[✅]`   `export type PrepareResponseContentRetryRequiredReturn = { retryRequired: true; reason: string };` — the one retry flavor, carrying the condition's reason and no content members.
      * `[✅]`   `export type PrepareResponseContentPreparedReturn = { retryRequired: false; contentForStorage: string; shouldContinue: boolean; needsContinuation: boolean; resolvedFinishReason: FinishReason; isIntermediate: boolean };` — every answer this module's collaborators produced rides on one flavor, and consumers take the flavor whole. The finish reason and the intermediate answer come from `resolveFinishReason` and `isIntermediateChunk`, which only this module injects; `needsContinuation` is `params.continueUntilComplete && shouldContinue`, both of which are in hand here. A consumer that re-derived any of the three would need this module's collaborators a second time, and a consumer that re-declared them would give each member a second guard site.
      * `[✅]`   `export type PrepareResponseContentSuccessReturn = PrepareResponseContentRetryRequiredReturn | PrepareResponseContentPreparedReturn;`
      * `[✅]`   `export type PrepareResponseContentErrorReturn = { error: PrepareResponseContentSanitizeError | PrepareResponseContentContinuationError; retriable: boolean };` — the error member's union is declared here, in the owning interface, and is never composed at a use site.
      * `[✅]`   `export type PrepareResponseContentReturn = PrepareResponseContentSuccessReturn | PrepareResponseContentErrorReturn;` — exactly two arms, the flavors nested inside the success arm.
      * `[✅]`   `export type PrepareResponseContentFn = (deps: PrepareResponseContentDeps, params: PrepareResponseContentParams, payload: PrepareResponseContentPayload) => PrepareResponseContentReturn;`
      * `[✅]`   `export interface PrepareResponseContentSanitizeErrorConstructorParams { jobId: string; thrownValue: string; }` and `export interface PrepareResponseContentContinuationErrorConstructorParams { jobId: string; thrownValue: string; }`, each with its class extending `Error`, taking that one params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from the two.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[✅]`   `prepareResponseContent.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Branch, condition `payload.aiResponse.error` is truthy or `payload.aiResponse.content` is absent, `null` or empty: return the retry-required flavor whose reason is `payload.aiResponse.error` when present and `AI response was empty.` otherwise. No collaborator is called and nothing below runs.
      * `[✅]`   Finish reason: `deps.resolveFinishReason(payload.aiResponse)`.
      * `[✅]`   Branch, condition the resolved reason is `'error'`: return the retry-required flavor whose reason is `AI provider signaled error via finish_reason.`
      * `[✅]`   Route selection: `deps.isIntermediateChunk(resolvedFinish, params.continueUntilComplete)` answers whether this is a mid-stream chunk, and `params.mode === 'text'` answers whether the content is structured at all. Either one takes the unparsed route; only a non-intermediate JSON-mode response is parsed.
      * `[✅]`   Branch, unparsed route: emit the existing skip line `[saveResponse] Skipping sanitize/parse for intermediate continuation chunk (finish_reason: ${resolvedFinish})` with `{ jobId: params.jobId }`; the content for storage is the response's content unchanged; `shouldContinue` is `isDialecticContinueReason(resolvedFinish)` — the finish-reason trigger standing alone, because unparsed content offers nothing for the remaining triggers to inspect. Return the prepared flavor. `determineContinuation` is not called.
      * `[✅]`   Parsed route, sanitize: `deps.sanitizeJsonContent(payload.aiResponse.content)` inside a `try`. A throw returns the error arm carrying `PrepareResponseContentSanitizeError` built from `params.jobId` and the stringified thrown value, with `retriable: false`.
      * `[✅]`   Branch, condition the sanitizer's result fails `isJsonSanitizationResult`: emit the existing warn line `[saveResponse] Invalid sanitization result for job ${params.jobId}. Triggering retry.` and return the retry-required flavor whose reason is `Invalid JSON sanitization result`.
      * `[✅]`   Branch, condition the result's `wasSanitized` is true: emit the existing info line `[saveResponse] JSON content sanitized for job ${params.jobId}` with `originalLength`, `sanitizedLength` and `wasStructurallyFixed`. This is a log, not a route — the parse proceeds.
      * `[✅]`   Branch, condition `JSON.parse` of the sanitized string throws: emit the existing warn line `[saveResponse] Malformed JSON response for job ${params.jobId} after sanitization. Triggering retry.` with the thrown message, and return the retry-required flavor whose reason is `Malformed JSON response: ${message}`. The catch binds `unknown` and stringifies a non-`Error` for both the line and the reason, exactly as the source composes them.
      * `[✅]`   Parsed route, continuation: `deps.determineContinuation` with all seven members — `finishReasonContinue` from `isDialecticContinueReason(resolvedFinish)`, `wasStructurallyFixed` from the sanitizer result, `parsedContent` from the parse, `continueUntilComplete`, `documentKey`, `contextForDocuments` and `sourceObject` each relayed from params unchanged. Inside a `try`; a throw returns the error arm carrying `PrepareResponseContentContinuationError` built from `params.jobId` and the stringified thrown value, with `retriable: false`.
      * `[✅]`   Parsed route, outcome: the content for storage is the sanitizer's `sanitized` string and `shouldContinue` is the returned verdict. Return the prepared flavor.
      * `[✅]`   Both prepared returns carry the same three answers this module already computed: `resolvedFinishReason` is the value `deps.resolveFinishReason` returned, `isIntermediate` is the value `deps.isIntermediateChunk` returned, and `needsContinuation` is `params.continueUntilComplete && shouldContinue` for whichever `shouldContinue` that route produced. None is recomputed at the return site, and the first two do not differ between the two routes.
      * `[✅]`   Ordering and side effects: the two retry conditions ahead of the route selection return before any sanitizer call; `sanitizeJsonContent` and `determineContinuation` are each invoked at most once and never on the unparsed route; no row is written; nothing is read; neither `params` nor `payload` is mutated.

   * `[✅]`   `prepareResponseContent.mock.ts`
      * `[✅]`   `PrepareResponseContentDepsOverrides`, `buildPrepareResponseContentDeps`, `PrepareResponseContentDepsCorruptions` and `invalidatePrepareResponseContentDeps`; the builder's base composes `new MockLogger()` and, for each of the four collaborators, a production-typed function returning a fixed value distinct from every other value in the fixture, so a case that depends on one has to override it.
      * `[✅]`   `PrepareResponseContentParamsOverrides`, `buildPrepareResponseContentParams`, `PrepareResponseContentParamsCorruptions` and `invalidatePrepareResponseContentParams`; the builder's base `mode` is `'json'`, its `continueUntilComplete` is `false`, and its `documentKey`, `contextForDocuments` and `sourceObject` are `undefined`, those being the declared absent states.
      * `[✅]`   `PrepareResponseContentPayloadOverrides`, `buildPrepareResponseContentPayload`, `PrepareResponseContentPayloadCorruptions` and `invalidatePrepareResponseContentPayload`; the builder's base composes `buildUnifiedAIResponse()` rather than restating that type's defaults.
      * `[✅]`   The four symbols for each of `PrepareResponseContentRetryRequiredReturn`, `PrepareResponseContentPreparedReturn` and `PrepareResponseContentErrorReturn`; the error builder composes `buildPrepareResponseContentSanitizeError()`.
      * `[✅]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for either instance.
      * `[✅]`   `mockPrepareResponseContent: PrepareResponseContentFn` returning `buildPrepareResponseContentPreparedReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator for `UnifiedAIResponse`, `ContextForDocument` or `JsonSanitizationResult` is written here; all are imported types whose fixtures live in their home packages.

   * `[✅]`   `prepareResponseContent.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isPrepareResponseContentDeps`: accepts the built deps; rejects each of the five members absent and non-function, `logger` absent and non-object; rejects a non-record root.
      * `[✅]`   `isPrepareResponseContentParams`: accepts the built params; accepts `documentKey`, `contextForDocuments` and `sourceObject` each `undefined`, those being declared absent states; rejects `jobId` absent, non-string and empty; rejects `mode` absent and outside `CompressionMode`; rejects `continueUntilComplete` absent and non-boolean; rejects `documentKey` a number; rejects `contextForDocuments` a non-array and an array containing that type's invalidator output; rejects a non-record root.
      * `[✅]`   `isPrepareResponseContentPayload`: accepts the built payload; rejects `aiResponse` absent and set to `invalidateUnifiedAIResponse({ content: 42 })`, the case proving the response is checked through its owner's guard; rejects a non-record root.
      * `[✅]`   `isPrepareResponseContentRetryRequiredReturn`: accepts its own flavor; rejects `retryRequired` absent or not exactly `true`; rejects `reason` absent, non-string and empty; rejects the prepared flavor; rejects a non-record root.
      * `[✅]`   `isPrepareResponseContentPreparedReturn`: accepts its own flavor; rejects `retryRequired` not exactly `false`; rejects `contentForStorage` absent and non-string; rejects `shouldContinue` absent and non-boolean; rejects `resolvedFinishReason` absent and outside `FinishReason`, and accepts `null`, which that guard admits because an unresolved reason is a real state meaning the object arrived truncated; rejects `needsContinuation` and `isIntermediate` absent and non-boolean; rejects the retry-required flavor; rejects a non-record root.
      * `[✅]`   `isPrepareResponseContentErrorReturn`: accepts the built error return, and accepts one whose `error` is the continuation error, proving both members of the declared union are admitted; rejects `error` absent, a plain object and a plain `Error` that is neither owned class; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[✅]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, the other owned error, `null` and a primitive.

   * `[✅]`   `prepareResponseContent.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isPrepareResponseContentDeps`, `isPrepareResponseContentParams`, `isPrepareResponseContentPayload`, `isPrepareResponseContentRetryRequiredReturn`, `isPrepareResponseContentPreparedReturn`, `isPrepareResponseContentErrorReturn`, and one `instanceof` guard per owned error class.
      * `[✅]`   `isPrepareResponseContentDeps` is a presence-of-method check, the deps being a behavior type: `logger` a record and each of the four collaborators a function.
      * `[✅]`   `isPrepareResponseContentParams` requires `jobId` a string non-empty after trim, `mode` passing the imported `CompressionMode` guard, `continueUntilComplete` a boolean, `documentKey` either `undefined` or a string, `contextForDocuments` either `undefined` or an array every element of which passes the imported `isContextForDocument`, and `sourceObject` present as a key — the member is declared `unknown`, so its presence is the whole check and any value satisfies it.
      * `[✅]`   `isPrepareResponseContentPayload` calls the imported `isUnifiedAIResponse` on `aiResponse`, the guard the `assembleAiResponse` node lands in that type's owning guard file.
      * `[✅]`   `isPrepareResponseContentRetryRequiredReturn` requires `retryRequired` exactly `true` and `reason` a non-empty string; `isPrepareResponseContentPreparedReturn` requires `retryRequired` exactly `false`, `contentForStorage` a string, `shouldContinue`, `needsContinuation` and `isIntermediate` booleans, and `resolvedFinishReason` passing the imported `isFinishReason`, which admits `null` because an unresolved reason is a real state and not a malformed one. No rule about `FinishReason` is written here; the owner's guard is the only definition of what one is. The two flavors are mutually exclusive, so a value passes exactly one.
      * `[✅]`   `isPrepareResponseContentErrorReturn` requires `error` to pass either owned error guard and `retriable` to be a boolean.
      * `[✅]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[✅]`   No guard is written here for `UnifiedAIResponse`, `ContextForDocument`, `CompressionMode`, `FinishReason` or any collaborator's types; none is owned by this interface.

   * `[✅]`   `prepareResponseContent.test.ts`
      * `[✅]`   Deps fixtures are `buildPrepareResponseContentDeps({ … })`, params `buildPrepareResponseContentParams({ … })` and payload `buildPrepareResponseContentPayload({ … })`, each overriding only what its case turns on. A case needing a specific collaborator behavior declares its own production-typed function inside the test.
      * `[✅]`   Empty response: a payload whose `aiResponse.content` is `null` returns the retry-required flavor with reason `AI response was empty.`, and no collaborator is invoked — asserted on spies the test applies at the call site.
      * `[✅]`   Errored response: a payload whose `aiResponse.error` is a named string returns the retry-required flavor carrying that exact string as the reason, proving the response's own error is relayed rather than replaced by the empty-content reason. Arranged with non-empty content so the two conditions are distinguished.
      * `[✅]`   Provider-signalled error: deps whose `resolveFinishReason` returns `'error'` return the retry-required flavor with reason `AI provider signaled error via finish_reason.`, and the sanitizer is never invoked.
      * `[✅]`   Intermediate chunk: deps whose `isIntermediateChunk` returns `true` return the prepared flavor whose `contentForStorage` is the response's content unchanged, with `determineContinuation` never invoked and `shouldContinue` equal to the finish-reason trigger for the returned reason.
      * `[✅]`   The prepared flavor relays every collaborator answer: a case whose `resolveFinishReason` returns a reason distinct from the payload's own `finish_reason` and whose `isIntermediateChunk` returns `true` yields those two exact values on the return, asserted independently. Its pair, over the parsed route with `isIntermediateChunk` returning `false`, yields the mirrored values — so a return that recomputed either member, or hardcoded one, fails.
      * `[✅]`   Text mode: params built with `mode: 'text'` over a non-intermediate response take the same unparsed route — content passed through unchanged, sanitizer and `determineContinuation` never invoked. Arranged beside a `mode: 'json'` case over the identical response that does parse, so neither assertion holds if the mode were ignored.
      * `[✅]`   Text mode still honors the finish-reason gate: a text-mode response whose resolved reason is a continue reason returns `shouldContinue` true, and one whose reason is `'stop'` returns false — the proof an unfinished text compression resumes rather than persisting truncated.
      * `[✅]`   Invalid sanitizer result: deps whose `sanitizeJsonContent` returns a value failing `isJsonSanitizationResult` return the retry-required flavor with reason `Invalid JSON sanitization result`, and the warn line is emitted.
      * `[✅]`   Malformed JSON: a sanitizer result whose `sanitized` string is not parseable returns the retry-required flavor whose reason begins `Malformed JSON response: ` and carries the thrown message, and the warn line is emitted.
      * `[✅]`   `sourceObject` is relayed: a case captures the object `determineContinuation` was called with and asserts all seven members, `sourceObject` being the exact value params carried and each other member the value it was handed. The captured `sourceObject` is a record whose keys differ from the parsed content's, so a case dropping the member cannot pass.
      * `[✅]`   The verdict is the module's answer: deps whose `determineContinuation` returns `{ shouldContinue: true }` produce a prepared flavor with `shouldContinue` true even when the resolved finish reason is not a continue reason, proving the parsed route reports the full verdict rather than the finish-reason trigger alone.
      * `[✅]`   Prepared content is the sanitized string: a sanitizer returning a `sanitized` value different from the response's raw content produces a `contentForStorage` equal to the sanitized value.
      * `[✅]`   Collaborator throws: a `sanitizeJsonContent` that throws returns the error arm whose error passes `isPrepareResponseContentSanitizeError` with `retriable` false, and a `determineContinuation` that throws returns the error arm whose error passes `isPrepareResponseContentContinuationError`.
      * `[✅]`   No retry is dispatched on any path: every case asserts the deps object exposes no retry member and that no row write or notification is attempted.
      * `[✅]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its two owned errors on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's consumer switches; this node constructs nothing at a boundary.

   * `[✅]`   `prepareResponseContent.ts`
      * `[✅]`   One exported function, typed `PrepareResponseContentFn`, implementing the interaction spec in its stated order: usability branches, finish reason, route selection, unparsed route, parsed route.
      * `[✅]`   `shouldContinue` is produced once on each route and never reassigned across them; the unparsed route computes the finish-reason trigger and the parsed route takes the returned verdict.
      * `[✅]`   The sanitizer call, the `JSON.parse` and the continuation call are each wrapped in `try`/`catch` with the catch binding `unknown`, and a non-`Error` is stringified rather than coerced.
      * `[✅]`   Every return is one of the two arms and, within the success arm, exactly one named flavor; no path falls through, no default value substitutes for a missing input, and no failure is logged instead of returned.

   * `[✅]`   `prepareResponseContent.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including both owned errors and the flavor guards — through one import point.

   * `[✅]`   `prepareResponseContent.integration.test.ts`
      * `[✅]`   Boundary: the four collaborators. The real `resolveFinishReason`, `isIntermediateChunk`, `sanitizeJsonContent` and `determineContinuation` run against the real `prepareResponseContent`; no repo-owned function is mocked and nothing external participates.
      * `[✅]`   Mocked: nothing, so this test proves the chain from a raw model response to a completeness verdict and nothing about persistence.
      * `[✅]`   A JSON-mode response whose parsed content omits a key present in `sourceObject` yields a prepared flavor with `shouldContinue` true — the source-verification trigger reached through the real `determineContinuation`, which is the behavior the missing member disabled.
      * `[✅]`   A JSON-mode response whose parsed content carries every `sourceObject` key and whose finish reason is `'stop'` yields `shouldContinue` false. Arranged beside the case above so neither assertion holds if `sourceObject` were dropped from the call.
      * `[✅]`   A response requiring structural repair yields `shouldContinue` true through the real sanitizer's `wasStructurallyFixed`, proving that trigger survives the extraction.
      * `[✅]`   A text-mode response of freeform prose yields a prepared flavor whose content is the prose unchanged, with `shouldContinue` taken from the finish reason alone.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and the worker's job-context contract file, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: no file outside this module is edited by this node.

   * `[✅]`   `requirements`
      * `[✅]`   `PrepareResponseContentDeps` declares exactly its five collaborators and neither `retryJob` nor `notificationService` — interface test.
      * `[✅]`   The retry-required flavor declares exactly `retryRequired` and `reason`, and the union has exactly two arms — interface test.
      * `[✅]`   The prepared flavor declares exactly `retryRequired`, `contentForStorage`, `shouldContinue`, `needsContinuation`, `resolvedFinishReason` and `isIntermediate` — interface test.
      * `[✅]`   Both prepared returns carry the finish reason, the intermediate answer and the continuation verdict this module computed, on both routes — unit test.
      * `[✅]`   `needsContinuation` is true only when `continueUntilComplete` is true and the route's `shouldContinue` is true, proven over all four combinations — unit test.
      * `[✅]`   `isPrepareResponseContentParams` accepts `documentKey`, `contextForDocuments` and `sourceObject` absent and rejects a `mode` outside `CompressionMode` — guard test.
      * `[✅]`   The two flavor guards are mutually exclusive — guard test.
      * `[✅]`   Each of the four retry conditions returns the retry-required flavor carrying its own verbatim reason, and none dispatches a retry — unit test.
      * `[✅]`   An intermediate chunk and a text-mode response each pass content through unparsed and resolve `shouldContinue` from the finish reason alone, with `determineContinuation` never invoked — unit test.
      * `[✅]`   A text-mode response with a continue finish reason returns `shouldContinue` true — unit test.
      * `[✅]`   `determineContinuation` is called with all seven members and `sourceObject` is the exact value params carried — unit test.
      * `[✅]`   A parsed response reports the full verdict rather than the finish-reason trigger — unit test.
      * `[✅]`   A throwing sanitizer and a throwing continuation each return their own typed error on the error arm — unit test.
      * `[✅]`   A JSON-mode response missing a `sourceObject` key continues, and one carrying every key with a `'stop'` reason does not — integration test.
      * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[✅]`   supabase/functions/dialectic-worker/debitForResponse/debitForResponse.ts **[BE] The wallet read, its four validations and the `debitTokens` call, depending on nothing content preparation produces so the ledger matches the invoice**

   * `[✅]`   `objective`
      * `[✅]`   The debit block inside `saveResponse.ts` bills only the responses that survive content preparation. Each of the four retry conditions returns before the debit is reached, so an empty response, a provider-signalled error, an unusable sanitizer result and a malformed parse are all unbilled — every one of which cost tokens the moment the stream returned. The block reports four distinct wallet conditions as two untyped `Error`s, both `retriable: false`, so a `token_wallets` read that failed transiently is recorded as a permanent failure. It discriminates the debit's own return with `'error' in debitResult`, a hand-rolled probe standing in for a guard that does not exist. And its assistant chat message takes its content from `contentForStorage`, coupling the spend to a decision made after it.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/debitForResponse/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `DebitForResponseReturn`.
         * `[✅]`   Every value the module needs comes from the job context and the assembled response. It takes no content-for-storage, no continuation verdict and no contribution identity, so nothing in its inputs depends on a decision that could still reject the job.
         * `[✅]`   The assistant chat message records the assembled response's content: that string when present, and the empty string when the response carried none — an empty response having cost tokens is the case this module exists to bill.
         * `[✅]`   Each of the four wallet conditions returns its own typed error with a reasoned flag: a `token_wallets` read failure is retriable, and an absent row, a currency that is not `AI_TOKEN` and a null balance are not.
         * `[✅]`   `debitTokens`' own error arm is propagated unchanged, never re-wrapped, and is narrowed by `isDebitTokensError` rather than by a property probe.
         * `[✅]`   `debitTokens.guard.ts` and its guard test land beside the interface that owns `DebitTokensSuccess` and `DebitTokensError`, and `debitTokens.mock.ts` gains the four symbols for each of those two owned object types so the guard test has fixtures.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node. Where the orchestrator calls this module is stated there, not here.
         * `[✅]`   The `token_wallets` select carries the same explicit column list it carries today, and the `TokenWallet` it builds carries the same seven members from the same columns.
         * `[✅]`   Both `ChatMessageRow` literals are preserved member for member, including the `[dialectic_execute_job]` user-message content, the shared timestamp on all four date members, and the assistant message's `response_to_message_id` pointing at the user message's own id.
         * `[✅]`   `chatId` is omitted from the `DebitTokensParams` literal rather than passed as `undefined`.
         * `[✅]`   The module emits no log line and holds no logger; `debitTokens` logs its own work.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer ledger write: given a wallet and a response, record what the response cost.
      * `[✅]`   The role is correct because the spend is a fact of the stream having returned, independent of every judgment about the response, and a module that depends on none of those judgments is one an orchestrator can call before making them.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not decide whether the response is usable, complete or continuable; those are `prepareResponseContent`'s branches, and this module reads none of their outputs.
         * `[✅]`   Do not compute a cost, apply a rate, or write a ledger row directly; `debitTokens` owns all three.
         * `[✅]`   Do not persist a contribution, resolve an identity or dispatch a retry.
         * `[✅]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/debitForResponse` — resolving one wallet and recording one response's spend against it.
      * `[✅]`   Inside boundary:
         * `[✅]`   The wallet read, its four validations, the `TokenWallet` composition, the two chat message literals and the `DebitTokensParams` assembly.
         * `[✅]`   `DebitForResponseDeps`, `DebitForResponseParams`, `DebitForResponsePayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DebitTokensParams`, `DebitTokensPayload`, `DebitTokensSuccess`, `DebitTokensError` and `BoundDebitTokens`, owned by `_shared/utils/debitTokens.interface.ts`.
         * `[✅]`   `TokenWallet`, owned by `_shared/types/tokenWallet.types.ts`; `ChatMessageRow`, `TokenUsage` and `AiModelExtendedConfig`, owned by `_shared/types.ts`.
         * `[✅]`   `UnifiedAIResponse` and `AiProvidersRow`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   How a debit is priced, what ledger rows it writes, and when a caller invokes this module.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/utils/debitTokens.interface.ts` (`BoundDebitTokens`, `DebitTokensParams`, `DebitTokensPayload`, `DebitTokensSuccess`, `DebitTokensError`).
         * `[✅]`   Layer classification: shared utility contract.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the one collaborator this module invokes, the params it assembles for it, and the two return arms it narrows. The bound form is injected because the unbound `DebitTokens` takes its own `DebitTokensDeps` — a logger and the admin wallet service — and holding those to pass down is another module's deps object.
      * `[✅]`   Provider: `_shared/types/tokenWallet.types.ts` (`TokenWallet`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the wallet this module composes from the row it read.
      * `[✅]`   Provider: `_shared/types.ts` (`ChatMessageRow`, `TokenUsage`, `AiModelExtendedConfig`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the two messages the database operation returns, the usage the debit is computed from, and the config it is priced against.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`UnifiedAIResponse`, `AiProvidersRow`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the response this module bills for and the provider row both messages name.
      * `[✅]`   Provider: `types_db.ts` (`Database`, `Json`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the injected client and the assistant message's serialized usage.
      * `[✅]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[✅]`   Layer classification: shared test fixture surface for the database boundary.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the injected client in every params fixture and the per-case configuration of the `token_wallets` read.
      * `[✅]`   Provider: `_shared/dialectic.mock.ts` (`buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`) and `_shared/ai_service/ai_provider.mock.ts` (`buildMockProvider`).
         * `[✅]`   Layer classification: shared test fixture surfaces, home packages of the payload's type and the provider row.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the payload and provider fixtures in every case.
      * `[✅]`   Confirm:
         * `[✅]`   `DebitForResponseDeps` declares exactly `debitTokens` — the one collaborator the branch contract invokes. The database client is a per-invocation param.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[✅]`   `context_slice`
         * `[✅]`   From the debit contract: the five named types only, `BoundDebitTokens` as a value type on deps and the other four with `import type`.
         * `[✅]`   From `_shared/types.ts` and the wallet types: the four named types only, imported with `import type`.
         * `[✅]`   From the hub: the `UnifiedAIResponse` and `AiProvidersRow` types only, imported with `import type`.
         * `[✅]`   From `types_db.ts`: the `Database` and `Json` types only, imported with `import type`.

   * `[✅]`   `debitForResponse.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case asserts the required key surface of `Parameters<DebitForResponseFn>[0]` is exactly `debitTokens`.
      * `[✅]`   A case asserts the required key surface of `Parameters<DebitForResponseFn>[1]` is exactly `dbClient`, `jobId`, `walletId`, `providerRow`, `modelConfig` and `projectOwnerUserId` — exhaustive in both directions, it is the proof no content-preparation output is a member.
      * `[✅]`   A case asserts the required key surface of `Parameters<DebitForResponseFn>[2]` is exactly `aiResponse`.
      * `[✅]`   A case asserts the required key surface of `DebitForResponseSuccessReturn` is exactly `debited`.
      * `[✅]`   A case asserts the required key surface of `DebitForResponseErrorReturn` is exactly `error` and `retriable`.
      * `[✅]`   A case assigns a `DebitForResponseSuccessReturn`-typed value to `DebitForResponseReturn` and a case assigns a `DebitForResponseErrorReturn`-typed value to it, proving the union has exactly the two arms.
      * `[✅]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[✅]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<DebitForResponseReturn>` to `DebitForResponseFn`, proving the signature is asynchronous.

   * `[✅]`   `debitForResponse.interface.ts`
      * `[✅]`   `export interface DebitForResponseDeps { debitTokens: BoundDebitTokens; }`
      * `[✅]`   `export interface DebitForResponseParams { dbClient: SupabaseClient<Database>; jobId: string; walletId: string; providerRow: AiProvidersRow; modelConfig: AiModelExtendedConfig; projectOwnerUserId: string; }`
      * `[✅]`   `export interface DebitForResponsePayload { aiResponse: UnifiedAIResponse; }` — the response whose cost is being recorded, produced in-TS by `assembleAiResponse`, so the trusted form applies and the parameter is not `unknown`.
      * `[✅]`   `export type DebitForResponseSuccessReturn = { debited: true };` — the ledger entry is the outcome; the two chat messages `debitTokens` returns are its own record and no consumer of this module reads them.
      * `[✅]`   `export type DebitForResponseErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because one of its inhabitants is `debitTokens`' own error propagated unchanged; every other inhabitant is an owned class extending `Error`, and consumers discriminate by the guards below.
      * `[✅]`   `export type DebitForResponseReturn = DebitForResponseSuccessReturn | DebitForResponseErrorReturn;` — exactly two arms.
      * `[✅]`   `export type DebitForResponseFn = (deps: DebitForResponseDeps, params: DebitForResponseParams, payload: DebitForResponsePayload) => Promise<DebitForResponseReturn>;`
      * `[✅]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `DebitForResponseWalletReadError { walletId; driverMessage }`, `DebitForResponseWalletNotFoundError { walletId }`, `DebitForResponseWalletCurrencyError { walletId; currency }`, `DebitForResponseWalletBalanceError { walletId }`, `DebitForResponseTokenUsageError { jobId }`.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[✅]`   `debitForResponse.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Wallet read: `params.dbClient.from('token_wallets').select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at').eq('wallet_id', params.walletId).single()` — the same explicit column list the source selects.
      * `[✅]`   Branch, condition the read returned a driver error: return the error arm carrying `DebitForResponseWalletReadError` built from `params.walletId` and the driver's message, with `retriable: true`. No debit is attempted.
      * `[✅]`   Branch, condition the read returned no row: return the error arm carrying `DebitForResponseWalletNotFoundError` built from `params.walletId`, with `retriable: false`.
      * `[✅]`   Branch, condition the row's `currency` is not `'AI_TOKEN'`: return the error arm carrying `DebitForResponseWalletCurrencyError` built from `params.walletId` and the row's currency, with `retriable: false`.
      * `[✅]`   Branch, condition the row's `balance` is `null`: return the error arm carrying `DebitForResponseWalletBalanceError` built from `params.walletId`, with `retriable: false`.
      * `[✅]`   Wallet composition: a `TokenWallet` carrying `walletId` from the row's `wallet_id`, `balance` from the row's `balance` stringified, `currency: 'AI_TOKEN'`, and `createdAt` and `updatedAt` as `Date` values from the row's timestamps. `userId` and `organizationId` are each set only when the row's corresponding column is not `null`, both being optional members of `TokenWallet`.
      * `[✅]`   Usage resolution: `payload.aiResponse.tokenUsage` absent or `null` yields a `null` usage. Present and passing the imported `isTokenUsage` yields that value as a `TokenUsage`. Present and failing it returns the error arm carrying `DebitForResponseTokenUsageError` built from `params.jobId`, with `retriable: false` — the assembler declares a weaker shape than the debit requires, so the narrowing is proven rather than assumed.
      * `[✅]`   Content resolution: the assistant message's content is `payload.aiResponse.content` when it is a string, and the empty string when it is `null`. Both are stated outcomes; no fallback expression supplies the second.
      * `[✅]`   Serialized usage: the resolved usage is round-tripped through `JSON.stringify` and `JSON.parse` and admitted as the assistant message's `token_usage` only when the parsed value passes `isJson`; a `null` usage and a parsed value that fails yield `null`, exactly as the source composes it.
      * `[✅]`   Database operation: a closure returning the two `ChatMessageRow` values. Both carry `chat_id: null`, `system_prompt_id: null`, `error_type: null`, `is_active_in_thread: true`, `ai_provider_id` from `params.providerRow.id`, `user_id` from `params.projectOwnerUserId`, and one timestamp value shared by every `created_at` and `updated_at`. The user message carries `role: 'user'`, `content: '[dialectic_execute_job]'`, `token_usage: null` and `response_to_message_id: null`; the assistant message carries `role: 'assistant'`, the resolved content, the serialized usage, and `response_to_message_id` equal to the user message's own generated id.
      * `[✅]`   Debit: `deps.debitTokens` with a `DebitTokensParams` carrying the composed wallet, the resolved usage, `params.modelConfig`, `params.projectOwnerUserId`, `relatedEntityId` from `params.jobId` and that closure, and with an empty `DebitTokensPayload`. `chatId` is omitted.
      * `[✅]`   Branch, condition the return passes `isDebitTokensError`: return the error arm carrying that arm's `error` and `retriable` unchanged — a failure the callee already typed is propagated, never re-wrapped.
      * `[✅]`   Branch, condition the return passes `isDebitTokensSuccess`: return the success arm.
      * `[✅]`   Ordering and side effects: exactly one read before the debit; zero debits on every wallet branch and on the usage branch; the database operation runs only inside `debitTokens`; neither `params` nor `payload` is mutated.

   * `[✅]`   `_shared/utils/debitTokens.mock.ts` gains the four symbols for each of `DebitTokensSuccess` and `DebitTokensError` — `buildDebitTokensSuccess` composing two `ChatMessageRow` values and `transactionRecordedSuccessfully: true`, `buildDebitTokensError` defaulting `error` to a named `Error` and `retriable` to `false` — so the guard test this node lands has fixtures from the types' home package. Its two existing mock factories are untouched.
      * `[✅]`   No builder or invalidator for `UnifiedAIResponse`, `AiProvidersRow`, `TokenWallet` or `AiModelExtendedConfig` is written here; all are imported types whose fixtures live in their home packages.

   * `[✅]`   `debitForResponse.mock.ts`
      * `[✅]`   `DebitForResponseDepsOverrides`, `buildDebitForResponseDeps`, `DebitForResponseDepsCorruptions` and `invalidateDebitForResponseDeps`; the builder's base `debitTokens` is a production-typed `BoundDebitTokens` returning `buildDebitTokensSuccess()` from the debit module's own mock.
      * `[✅]`   `DebitForResponseParamsOverrides`, `buildDebitForResponseParams`, `DebitForResponseParamsCorruptions` and `invalidateDebitForResponseParams`; the builder's base client is `createMockSupabaseClient(undefined, {})`, its `providerRow` composes `buildMockProvider()`, and its `jobId`, `walletId` and `projectOwnerUserId` are distinct non-empty strings so a case reading one where it meant another cannot pass.
      * `[✅]`   `DebitForResponsePayloadOverrides`, `buildDebitForResponsePayload`, `DebitForResponsePayloadCorruptions` and `invalidateDebitForResponsePayload`; the builder's base composes `buildUnifiedAIResponse()` rather than restating that type's defaults.
      * `[✅]`   The four symbols for each of `DebitForResponseSuccessReturn` and `DebitForResponseErrorReturn`; the error builder composes `buildDebitForResponseWalletNotFoundError()`.
      * `[✅]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[✅]`   `mockDebitForResponse: DebitForResponseFn` returning `buildDebitForResponseSuccessReturn()`, typed by the production function type and taking no configuration.
      
   * `[✅]`   `_shared/utils/debitTokens.guard.test.ts` carries the checklist for the two guards this node lands there. `isDebitTokensSuccess`: accepts `buildDebitTokensSuccess()`; rejects `transactionRecordedSuccessfully` absent or not exactly `true`; rejects `result` absent and non-record; rejects either message absent; rejects `buildDebitTokensError()`; rejects non-record roots. `isDebitTokensError`: accepts `buildDebitTokensError()`; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects `buildDebitTokensSuccess()`; rejects non-record roots. Each arm rejecting the other is what makes the pair a discrimination rather than two independent checks.

   * `[✅]`   `debitForResponse.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isDebitForResponseDeps`: accepts the built deps; rejects `debitTokens` absent, non-function and a plain object; rejects a non-record root.
      * `[✅]`   `isDebitForResponseParams`: accepts the built params; rejects `dbClient` absent and a string; rejects each of `jobId`, `walletId` and `projectOwnerUserId` absent, non-string and empty; rejects `providerRow` set to the builder's output with a required member rest-destructured away; rejects `modelConfig` absent and failing its owner's guard; rejects a non-record root.
      * `[✅]`   `isDebitForResponsePayload`: accepts the built payload; rejects `aiResponse` absent and set to `invalidateUnifiedAIResponse({ content: 42 })`, the case proving the response is checked through its owner's guard; rejects a non-record root.
      * `[✅]`   `isDebitForResponseSuccessReturn`: accepts the built return; rejects `debited` absent or not exactly `true`; rejects the error return; rejects a non-record root.
      * `[✅]`   `isDebitForResponseErrorReturn`: accepts the built return; accepts one whose `error` is a plain `Error`, the member being typed `Error` so a propagated debit failure is admitted; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[✅]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.
   
   * `[✅]`   `_shared/utils/debitTokens.guard.ts` is created holding `isDebitTokensSuccess` and `isDebitTokensError` alone. The success guard requires a record whose `transactionRecordedSuccessfully` is exactly `true` and whose `result` is a record carrying `userMessage` and `assistantMessage`; the error guard requires `error instanceof Error` and a boolean `retriable`, and rejects a value carrying `transactionRecordedSuccessfully`. Both keep boolean contracts and throw nothing — they narrow an already-returned value.
      * `[✅]`   No guard is written here for `UnifiedAIResponse`, `AiProvidersRow`, `AiModelExtendedConfig`, `TokenWallet`, `TokenUsage` or `ChatMessageRow`; none is owned by this interface.

   * `[✅]`   `debitForResponse.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isDebitForResponseDeps`, `isDebitForResponseParams`, `isDebitForResponsePayload`, `isDebitForResponseSuccessReturn`, `isDebitForResponseErrorReturn`, and one `instanceof` guard per owned error class.
      * `[✅]`   `isDebitForResponseDeps` is a presence-of-method check, the deps being a behavior type: `debitTokens` is a function and nothing about its behavior is asserted.
      * `[✅]`   `isDebitForResponseParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — requires `jobId`, `walletId` and `projectOwnerUserId` to be strings non-empty after trim, calls the imported `isSelectedAiProvider` on `providerRow`, and calls the imported `isAiModelExtendedConfig` on `modelConfig`.
      * `[✅]`   `isDebitForResponsePayload` calls the imported `isUnifiedAIResponse` on `aiResponse`, the guard the `assembleAiResponse` node lands in that type's owning guard file.
      * `[✅]`   `isDebitForResponseSuccessReturn` requires `debited` exactly `true`; `isDebitForResponseErrorReturn` requires `error instanceof Error` and `retriable` a boolean. The two arms are mutually exclusive, so a value passes exactly one.
      * `[✅]`   Each owned error guard is `value instanceof <that class>` and nothing more.

   * `[✅]`   `debitForResponse.test.ts`
      * `[✅]`   Deps fixtures are `buildDebitForResponseDeps({ … })`, params `buildDebitForResponseParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the `token_wallets` read the case turns on, and payload `buildDebitForResponsePayload({ … })`. A case needing a specific debit outcome declares its own production-typed `BoundDebitTokens` inside the test.
      * `[✅]`   The wallet is read by the params' id: a case asserts the recorded `token_wallets` filter is `params.walletId`, which differs from every other identifier in the arrangement.
      * `[✅]`   Read failed: a read returning a driver error returns the error arm whose error passes `isDebitForResponseWalletReadError`, carries that message, and whose `retriable` is `true`; the debit was never invoked.
      * `[✅]`   Wallet absent, wrong currency, null balance: three cases, each returning its own typed error with `retriable` `false` and no debit invoked. Arranged together so no case can pass by matching a sibling's error.
      * `[✅]`   Wallet composition: a row whose `user_id` is set and `organization_id` is `null` yields a wallet carrying `userId` and no `organizationId` key, and the mirrored row yields the mirrored wallet — asserted on the object handed to the debit.
      * `[✅]`   Usage relayed: a response carrying a full token usage yields a debit call whose `tokenUsage` is those three counts as independent literals; a response carrying none yields `null`.
      * `[✅]`   Usage malformed: a response whose `tokenUsage` is present but fails `isTokenUsage` returns the error arm whose error passes `isDebitForResponseTokenUsageError`, with no debit invoked.
      * `[✅]`   Content recorded: a response carrying content yields an assistant message whose `content` is that string; a response whose `content` is `null` yields an assistant message whose `content` is the empty string and still reaches the debit — the case that proves an unbilled empty response is impossible.
      * `[✅]`   Message linkage: the assistant message's `response_to_message_id` equals the user message's `id`, both messages carry `ai_provider_id` from the provider row and `user_id` from the owner id, and all four date members carry one identical value.
      * `[✅]`   Debit params: a case asserts `relatedEntityId` is `params.jobId`, `modelConfig` is `params.modelConfig`, `userId` is `params.projectOwnerUserId`, and the params object carries no `chatId` key.
      * `[✅]`   Debit failed: a `debitTokens` returning its error arm returns this module's error arm carrying that exact error instance and its `retriable` unchanged, proving propagation rather than re-wrapping.
      * `[✅]`   Debit succeeded: a `debitTokens` returning its success arm returns the success arm.
      * `[✅]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, which also binds `debitTokens` from its own deps before injecting it here; this node constructs nothing at a boundary.

   * `[✅]`   `debitForResponse.ts`
      * `[✅]`   One exported function, typed `DebitForResponseFn`, implementing the interaction spec in its stated order: wallet read, four wallet branches, wallet composition, usage resolution, content resolution, database-operation closure, debit, two debit branches.
      * `[✅]`   The composed wallet, the resolved usage, the serialized usage, the resolved content and the `DebitTokensParams` object are each held in one typed local; none is inferred and none is widened at its use site.
      * `[✅]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed.

   * `[✅]`   `debitForResponse.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[✅]`   No reverse dependency: the three files this node edits in `_shared/utils/` gain a guard, a guard test and four fixture symbols per return arm, and none of them imports this module.

   * `[✅]`   `requirements`
      * `[✅]`   `DebitForResponseParams` declares exactly its six members and none of them is produced by content preparation — interface test.
      * `[✅]`   The return union has exactly two arms — interface test.
      * `[✅]`   `isDebitForResponseErrorReturn` admits a plain `Error`, so a propagated debit failure is a valid error arm — guard test.
      * `[✅]`   `isDebitTokensSuccess` and `isDebitTokensError` each reject the other's arm — guard test.
      * `[✅]`   Each of the four wallet conditions returns its own typed error, with the read failure retriable and the other three not, and none reaches the debit — unit test.
      * `[✅]`   A malformed token usage returns its own typed error and does not reach the debit — unit test.
      * `[✅]`   A response with no content still reaches the debit, with the assistant message recording the empty string — unit test.
      * `[✅]`   The debit is called with `relatedEntityId` from the job id, the composed wallet, the resolved usage and no `chatId` — unit test.
      * `[✅]`   A debit failure is returned with its error instance and flag unchanged — unit test.
      * `[✅]`   The real `debitTokens` records a transaction for a valid wallet and returns its own error unchanged for an uncoverable one — integration test.
      * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[✅]`   supabase/functions/dialectic-worker/resolveContributionIdentity/resolveContributionIdentity.ts **[BE] identity resolution by job_type and guard, propagating diagnostics unchanged onto the error arm, with the consolidation exemption resolved through the recipe step and every read failure surfaced**

   * `[✅]`   `objective`
      * `[✅]`   The identity block inside `saveResponse.ts` derives every value it needs by digging through `jobPayloadUnknown` with `isRecord` and hand-rolled `typeof` probes — `canonicalPathParams`, `target_contribution_id`, `document_relationships`, `document_key`, `projectId`, `sessionId`, `iterationNumber`, `planner_metadata` and `continuation_count` are each re-derived from an untyped record that the orchestrator has already proven with the arm's guard. The block reports eleven distinct conditions as untyped `Error`s, every one `retriable: false`. Its recipe-step lookup discards both driver errors: a failed read of `dialectic_stage_recipe_steps` falls through to the template table, and a failed read of `dialectic_recipe_template_steps` leaves the step null, so both land on `source_group is required for document outputs` and a transient database failure is recorded as a permanent data defect. Its document-related census aggregates seven required values into one message, so a caller learns that something was missing and not which invariant broke.
      * `[✅]`   Functional goals:
         * `[✅]`   A new function-folder module `dialectic-worker/resolveContributionIdentity/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `ResolveContributionIdentityReturn`.
         * `[✅]`   The payload slot is `ResolveContributionIdentityPayload`, declared in this module's interface as equivalent to `DialecticExecuteJobPayload`, so a later divergence in what this function accepts is a one-line change here rather than an edit at every consumer. It is received already proven. Every member the arm declares is read as the type declares it: `output_type` is a `ModelContributionFileTypes`, `canonicalPathParams.stageSlug` is a `DialecticStageSlug`, `canonicalPathParams.contributionType` is a `ContributionType`, and none of the three is re-narrowed at this module's use site.
         * `[✅]`   The success arm carries exactly the six values this module derives — `restOfCanonicalPathParams`, `storageFileType`, `sourceGroupFragment`, `isContinuationForStorage`, `targetContributionId` and `description`. `restOfCanonicalPathParams` is a whole `CanonicalPathParams`, `contributionType` included: the type is a defined contract and this module has no licence to serve a mutilated version of it. No payload member is re-emitted beyond that assembly: a consumer needing `document_key` or `document_relationships` reads it from the payload it already holds.
         * `[✅]`   The checks that survive are the ones the type cannot express, each returning its own typed error: a `document_key` that is absent, null or empty on an arm that declares it optional and nullable; a `providerRow.api_identifier` that is empty after trim; a continuation missing valid `document_relationships`; a continuation whose `continuation_count` is absent or not greater than zero; an `aiResponse.rawProviderResponse` that is absent or not JSON, the member being optional on `UnifiedAIResponse` and the only fallback source `resolveFinishReason` has; and a document output with no `source_group` and no per-model exemption.
         * `[✅]`   Both recipe-step reads return their own typed error carrying the table and the driver's message, with `retriable: true`. A read that fails is a read that failed, and is never reported as a missing `source_group`.
         * `[✅]`   The consolidation exemption is resolved by reading `granularity_strategy` from `dialectic_stage_recipe_steps` and, only when that read returned no row, from `dialectic_recipe_template_steps`; a value of `per_model` admits the null `source_group` and every other value rejects it.
         * `[✅]`   `isCanonicalPathParams` lands in `_shared/utils/type-guards/type_guards.file_manager.ts`, so the inline `isRecord` and `isDialecticStageSlug` probes the source runs against `canonicalPathParams` are replaced by one guard owned where the type is owned.
      * `[✅]`   Non-functional constraints:
         * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node. Where a consumer calls this module is stated there, not here.
         * `[✅]`   `dialectic-service/dialectic.interface.ts` is not edited by this node. The scope's proposal to tighten `document_key` on the base payload is not adopted — the member is declared `string | null` on the EXECUTE arm and retyping it reaches far outside this work — so its emptiness is enforced locally as an owned invariant instead.
         * `[✅]`   The `aiResponse.rawProviderResponse` precondition stays where the source has it, between the continuation invariants and the document invariants. It is preserved because it is the presence check for an optional member that `_shared/utils/resolveFinishReason.ts` reads as its only fallback when the top-level `finish_reason` is not a valid `FinishReason`. Preserving it is why `aiResponse` is a param of this module, which the scope's contract table omits; that table row is corrected, not obeyed.
         * `[✅]`   The `restOfCanonicalPathParams` assembly copies the five optional members — `sourceModelSlugs`, `sourceAnchorType`, `sourceAnchorModelSlug`, `sourceAttemptCount`, `pairedModelSlug` — only when the payload carries them, so an absent member stays absent rather than becoming an explicit `undefined`.
         * `[✅]`   The `sourceAnchorModelSlug` log line is preserved with its message and its three fields.
         * `[✅]`   The `targetContributionId` precedence is preserved exactly: the payload's `target_contribution_id` when it is a non-empty string, otherwise the job row's column when it is a non-empty string, otherwise absent.
         * `[✅]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[✅]`   `role`
      * `[✅]`   Node role is an app-layer resolver: given a proven EXECUTE payload, a job row, a provider row and the assembled response, derive the identity under which this response will be stored.
      * `[✅]`   The role is correct because every value it produces is a function of the job's own declared identity rather than of the response's content, so it can be resolved before a single byte is written and reused by every consumer that needs a path.
      * `[✅]`   Out-of-scope responsibilities:
         * `[✅]`   Do not build an upload context, upload anything, or touch `dialectic_contributions`; `buildUploadContext`, `fileManager` and `persistContributionRelationships` own those.
         * `[✅]`   Do not inspect the assembled response beyond the `rawProviderResponse` precondition the source already runs here. Its content, its usage and its finish reason are `prepareResponseContent`'s and `debitForResponse`'s, and this module reads none of them.
         * `[✅]`   Do not decide continuation, dispatch a retry, debit, or notify.
         * `[✅]`   Do not re-narrow a member the arm type already declares.

   * `[✅]`   `module`
      * `[✅]`   Bounded context is `supabase/functions/dialectic-worker/resolveContributionIdentity` — resolving one contribution's storage identity from one proven job payload.
      * `[✅]`   Inside boundary:
         * `[✅]`   The description composition, the `restOfCanonicalPathParams` assembly, the continuation resolution and its two invariants, the raw-provider precondition, the document-output invariants, the `storageFileType` selection, the `source_group` resolution with its recipe-step exemption, and the `sourceGroupFragment` extraction.
         * `[✅]`   `ResolveContributionIdentityDeps`, `ResolveContributionIdentityParams`, `ResolveContributionIdentityPayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[✅]`   Outside boundary:
         * `[✅]`   `DialecticExecuteJobPayload`, `DialecticJobRow`, `AiProvidersRow` and `UnifiedAIResponse`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[✅]`   `CanonicalPathParams`, `ModelContributionFileTypes` and `FileType`, owned by `_shared/types/file_manager.types.ts`.
         * `[✅]`   `ContributionType` and `DialecticStageSlug`, owned by `packages/types/src/dialectic.types.ts`.
         * `[✅]`   `extractSourceGroupFragment`, owned by `_shared/utils/path_utils.ts`; `isDocumentKey` and `isDocumentRelated`, owned by `_shared/utils/type-guards/type_guards.file_manager.ts`; `isJson`, owned by `_shared/utils/type_guards.ts`.
         * `[✅]`   How a path is constructed from the resolved identity, and which consumer calls this module.

   * `[✅]`   `deps`
      * `[✅]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the one collaborator a branch invokes — the `sourceAnchorModelSlug` propagation notice.
      * `[✅]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticExecuteJobPayload`, `DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse`).
         * `[✅]`   Layer classification: service-layer contract hub.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: the arm this module's payload type is declared equivalent to, the row carrying `target_contribution_id` and `attempt_count`, the provider row supplying `name` and `api_identifier`, and the assembled response whose optional `rawProviderResponse` the precondition checks.
      * `[✅]`   Provider: `_shared/types/file_manager.types.ts` (`CanonicalPathParams`, `ModelContributionFileTypes`, `FileType`).
         * `[✅]`   Layer classification: shared type surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the shape the assembly produces, the type the storage selection returns, and the enum member the document case selects.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.file_manager.ts` (`isDocumentKey`, `isDocumentRelated`, `isModelContributionFileType`, `isDialecticStageSlug`, and the `isCanonicalPathParams` this node lands there).
         * `[✅]`   Layer classification: shared guard surface, home of the file-manager types' guards.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the classifications the storage selection and the document invariants branch on, and the canonical-params guard this module's payload guard calls. All are called, never injected.
      * `[✅]`   Provider: `_shared/utils/type_guards.ts` (`isJson`, `isRecord`, `isContributionType`, `isSelectedAiProvider`).
         * `[✅]`   Layer classification: shared guard surface.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the JSON proof the raw-provider precondition applies, the record check inside this module's own guards, and the provider-row and contribution-type checks those guards delegate to.
      * `[✅]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticExecuteJobPayload`, `isDialecticJobRow`).
         * `[✅]`   Layer classification: shared guard surface, home of the payload family's guards.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the arm guard this module's payload guard wraps, and the job-row guard its params guard calls.
      * `[✅]`   Provider: `_shared/utils/path_utils.ts` (`extractSourceGroupFragment`).
         * `[✅]`   Layer classification: shared utility.
         * `[✅]`   Direction: inbound from `_shared`.
         * `[✅]`   Purpose: the fragment derivation, called with the resolved `source_group`.
      * `[✅]`   Provider: `types_db.ts` (`Database`).
         * `[✅]`   Layer classification: generated database type surface.
         * `[✅]`   Direction: inbound.
         * `[✅]`   Purpose: type the injected client the two recipe-step reads run against.
      * `[✅]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`), `saveResponse/saveResponse.mock.ts` (`createMockDialecticExecuteJobPayload`, `createMockJobRow`, `saveResponseTestPayloadDocumentArtifact`), `_shared/ai_service/ai_provider.mock.ts` (`buildMockProvider`), `_shared/services/file_manager.mock.ts` (`buildCanonicalPathParams`, `invalidateCanonicalPathParams`), `_shared/logger.mock.ts` (`MockLogger`).
         * `[✅]`   Layer classification: shared test fixture surfaces, plus the existing `saveResponse` mock file, which is where the EXECUTE payload and job-row fixtures actually live today.
         * `[✅]`   Direction: inbound, test-time only.
         * `[✅]`   Purpose: the injected client configured per recipe-step case, and the payload, row, provider, logger and canonical-params fixtures in every case. These are the located symbols and they are used as they are — `createMockX` naming, an options bag on the params factory, and no invalidator for the payload or the job row are all non-compliant with the mock standard, and a second compliant copy beside them would be duplication. The debt is reported, not fixed here.
      * `[✅]`   Confirm:
         * `[✅]`   `ResolveContributionIdentityDeps` declares exactly `logger` — the one collaborator the branch contract invokes. The database client, the job row, the provider row and the assembled response are per-invocation params.
         * `[✅]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/` except the located test fixtures, which are test-time only.
      * `[✅]`   `context_slice`
         * `[✅]`   From the hub: the four named types only, imported with `import type`.
         * `[✅]`   From the file-manager types: `CanonicalPathParams` and `ModelContributionFileTypes` with `import type`, and `FileType` as a value import, the enum member being constructed.
         * `[✅]`   From the three guard modules and `path_utils.ts`: the named functions only, as value imports.
         * `[✅]`   From `_shared/types.ts` and `types_db.ts`: `ILogger` and `Database` only, imported with `import type`.

   * `[✅]`   `resolveContributionIdentity.interface.test.ts`
      * `[✅]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[✅]`   A case asserts the required key surface of `Parameters<ResolveContributionIdentityFn>[0]` is exactly `logger`.
      * `[✅]`   A case asserts the required key surface of `Parameters<ResolveContributionIdentityFn>[1]` is exactly `dbClient`, `job`, `providerRow` and `aiResponse`.
      * `[✅]`   A case assigns a `DialecticExecuteJobPayload`-typed value to a `ResolveContributionIdentityPayload`-typed binding and a case assigns in the reverse direction, the pair proving the equivalence in both directions rather than a one-way widening.
      * `[✅]`   A case assigns a `ResolveContributionIdentityPayload`-typed value to `Parameters<ResolveContributionIdentityFn>[2]`, proving the slot is this module's own payload name.
      * `[✅]`   A case asserts the required key surface of `ResolveContributionIdentitySuccessReturn` is exactly `restOfCanonicalPathParams`, `storageFileType`, `isContinuationForStorage` and `description` — the two optional members are absent from a required-key record, which is the proof they are optional.
      * `[✅]`   A case assigns a success-arm literal carrying `sourceGroupFragment` and `targetContributionId` and a case assigns one carrying neither, proving both members are optional rather than nullable.
      * `[✅]`   A case asserts the required key surface of `ResolveContributionIdentityErrorReturn` is exactly `error` and `retriable`.
      * `[✅]`   A case assigns a success-typed value to `ResolveContributionIdentityReturn` and a case assigns an error-typed value to it, proving the union has exactly the two arms.
      * `[✅]`   A case asserts `ResolveContributionIdentitySuccessReturn['storageFileType']` admits `FileType.ModelContributionRawJson`, and a case asserts the required key surface of `restOfCanonicalPathParams` is exactly `contributionType` and `stageSlug` — the whole `CanonicalPathParams` required surface, proving no member of that type was dropped on the way through.
      * `[✅]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[✅]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<ResolveContributionIdentityReturn>` to `ResolveContributionIdentityFn`, proving the signature is asynchronous.

   * `[✅]`   `resolveContributionIdentity.interface.ts`
      * `[✅]`   `export interface ResolveContributionIdentityDeps { logger: ILogger; }`
      * `[✅]`   `export interface ResolveContributionIdentityParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; providerRow: AiProvidersRow; aiResponse: UnifiedAIResponse; }` — `aiResponse` is present because the `rawProviderResponse` precondition is preserved at its position in this region, and a param it cannot read is a precondition this module cannot run.
      * `[✅]`   `export type ResolveContributionIdentityPayload = DialecticExecuteJobPayload;` — this function's payload type, currently equivalent to that arm. Declaring the equivalence rather than naming the arm at the signature means a later divergence lands in this one declaration and no consumer is reworked. The trusted form applies and the parameter is not `unknown`.
      * `[✅]`   `export interface ResolveContributionIdentitySuccessReturn { restOfCanonicalPathParams: CanonicalPathParams; storageFileType: ModelContributionFileTypes; sourceGroupFragment?: string; isContinuationForStorage: boolean; targetContributionId?: string; description: string; }` — the six derived values, the canonical params whole.
      * `[✅]`   `export type ResolveContributionIdentityErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because every inhabitant is an owned class extending `Error`, and consumers discriminate by the guards below.
      * `[✅]`   `export type ResolveContributionIdentityReturn = ResolveContributionIdentitySuccessReturn | ResolveContributionIdentityErrorReturn;` — exactly two arms.
      * `[✅]`   `export type ResolveContributionIdentityFn = (deps: ResolveContributionIdentityDeps, params: ResolveContributionIdentityParams, payload: ResolveContributionIdentityPayload) => Promise<ResolveContributionIdentityReturn>;`
      * `[✅]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `ResolveContributionIdentityDocumentKeyError { jobId }`, `ResolveContributionIdentityProviderIdentifierError { jobId; providerId }`, `ResolveContributionIdentityRelationshipsError { jobId; targetContributionId }`, `ResolveContributionIdentityContinuationCountError { jobId; targetContributionId }`, `ResolveContributionIdentityRawProviderResponseError { jobId }`, `ResolveContributionIdentitySourceGroupError { jobId; outputType }`, `ResolveContributionIdentityRecipeStepReadError { recipeStepId; table; driverMessage }`.
      * `[✅]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[✅]`   `resolveContributionIdentity.interaction.spec`
      * `[✅]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[✅]`   Description: `` `${payload.output_type} for stage '${payload.stageSlug}' by model ${params.providerRow.name}` `` — the same three values the source composes, read from the proven payload rather than from probed locals.
      * `[✅]`   Canonical assembly: `restOfCanonicalPathParams` starts as `{ contributionType: payload.canonicalPathParams.contributionType, stageSlug: payload.canonicalPathParams.stageSlug }` — both required members of `CanonicalPathParams`, both already typed on the arm — then takes `sourceModelSlugs`, `sourceAnchorType`, `sourceAnchorModelSlug`, `sourceAttemptCount` and `pairedModelSlug` from `payload.canonicalPathParams`, each set only when that member is present.
      * `[✅]`   Branch, condition `restOfCanonicalPathParams.sourceAnchorModelSlug` is set: call `deps.logger.info` with the source's message and its three fields — `sourceAnchorModelSlug`, `stageSlug` and `outputType`. Execution continues; this branch has no outcome of its own.
      * `[✅]`   Target resolution: `targetContributionId` is `payload.target_contribution_id` when it is a non-empty string, otherwise `params.job.target_contribution_id` when it is a non-empty string, otherwise absent. `isContinuationForStorage` is true exactly when `targetContributionId` is set and non-empty after trim.
      * `[✅]`   Branch, condition `isContinuationForStorage` and `payload.document_relationships` is absent or null: return the error arm carrying `ResolveContributionIdentityRelationshipsError` built from the job id and the resolved target, with `retriable: false`.
      * `[✅]`   Branch, condition `isContinuationForStorage` and `payload.continuation_count` is absent or not greater than zero: return the error arm carrying `ResolveContributionIdentityContinuationCountError` built from the job id and the resolved target, with `retriable: false`. The count is read as the number the base payload declares, never through a property descriptor.
      * `[✅]`   Branch, condition `params.aiResponse.rawProviderResponse` is absent or fails the imported `isJson`: return the error arm carrying `ResolveContributionIdentityRawProviderResponseError` built from the job id, with `retriable: false`. This branch sits after the continuation invariants and before the document invariants, exactly where the source runs it, and it is the presence proof for a member `UnifiedAIResponse` declares optional.
      * `[✅]`   Branch, condition `isDocumentRelated(payload.output_type)` and `payload.document_key` is absent, null or empty after trim: return the error arm carrying `ResolveContributionIdentityDocumentKeyError` built from the job id, with `retriable: false`. The arm declares the member optional and nullable, so its presence is an invariant this module owns.
      * `[✅]`   Branch, condition `isDocumentRelated(payload.output_type)` and `params.providerRow.api_identifier` is empty after trim: return the error arm carrying `ResolveContributionIdentityProviderIdentifierError` built from the job id and the provider id, with `retriable: false`.
      * `[✅]`   Storage selection: `storageFileType` is `FileType.ModelContributionRawJson` when `isDocumentKey(payload.output_type)` holds, and `payload.output_type` otherwise.
      * `[✅]`   Source group resolution: `sourceGroup` is `payload.document_relationships.source_group` when that member is a string, and absent otherwise.
      * `[✅]`   Branch, condition `isDocumentRelated(payload.output_type)` holds, `sourceGroup` is absent, and either `document_relationships` is absent or its `source_group` is not explicitly `null`: return the error arm carrying `ResolveContributionIdentitySourceGroupError` built from the job id and the output type, with `retriable: false`. No read is attempted.
      * `[✅]`   Branch, condition the same but `source_group` is explicitly `null` and `payload.planner_metadata` carries no string `recipe_step_id`: return the same error, with `retriable: false`. No read is attempted.
      * `[✅]`   Exemption read: with a string `recipe_step_id` in hand, `params.dbClient.from('dialectic_stage_recipe_steps').select('granularity_strategy').eq('id', recipeStepId).maybeSingle()`.
      * `[✅]`   Branch, condition that read returned a driver error: return the error arm carrying `ResolveContributionIdentityRecipeStepReadError` built from the step id, `'dialectic_stage_recipe_steps'` and the driver's message, with `retriable: true`. The template table is not consulted — a failed read is not a missing row.
      * `[✅]`   Branch, condition that read returned no row: `params.dbClient.from('dialectic_recipe_template_steps').select('granularity_strategy').eq('id', recipeStepId).maybeSingle()`. A driver error there returns the same typed error built from the step id, `'dialectic_recipe_template_steps'` and that driver's message, with `retriable: true`.
      * `[✅]`   Branch, condition a step row was found by either read and its `granularity_strategy` is `'per_model'`: the null `source_group` is admitted and resolution continues.
      * `[✅]`   Branch, condition no step row was found by either read, or the found row's `granularity_strategy` is any other value: return the error arm carrying `ResolveContributionIdentitySourceGroupError` built from the job id and the output type, with `retriable: false`.
      * `[✅]`   Fragment: `sourceGroupFragment` is `extractSourceGroupFragment(sourceGroup)`, set on the success arm only when that call returns a string.
      * `[✅]`   Success: return the success arm carrying the assembled `restOfCanonicalPathParams`, the selected `storageFileType`, the resolved `isContinuationForStorage`, the composed `description`, and `sourceGroupFragment` and `targetContributionId` each present only when resolved.
      * `[✅]`   Ordering and side effects: at most two reads, both inside the exemption branch and neither reached by a non-document output or a present `source_group`; the second read runs only when the first returned no row; nothing is written; neither `params` nor `payload` is mutated, and `payload.canonicalPathParams` is copied rather than carried by reference.

   * `[✅]`   `resolveContributionIdentity.mock.ts`
      * `[✅]`   `ResolveContributionIdentityDepsOverrides`, `buildResolveContributionIdentityDeps`, `ResolveContributionIdentityDepsCorruptions` and `invalidateResolveContributionIdentityDeps`; the builder's base `logger` is a `new MockLogger()` from `_shared/logger.mock.ts`.
      * `[✅]`   `ResolveContributionIdentityParamsOverrides`, `buildResolveContributionIdentityParams`, `ResolveContributionIdentityParamsCorruptions` and `invalidateResolveContributionIdentityParams`; the builder's base client is `createMockSupabaseClient()`'s client, its `job` composes `createMockJobRow(saveResponseTestPayloadDocumentArtifact)`, its `providerRow` composes `buildMockProvider()`, and its `aiResponse` carries a `rawProviderResponse` of `{ token_usage: null, finish_reason: 'stop' }` so the precondition passes by default and a case must override to fail it.
      * `[✅]`   `ResolveContributionIdentityPayloadOverrides`, `buildResolveContributionIdentityPayload`, `ResolveContributionIdentityPayloadCorruptions` and `invalidateResolveContributionIdentityPayload`; the builder composes `createMockDialecticExecuteJobPayload()` from `saveResponse.mock.ts` rather than restating that arm's defaults, and its `canonicalPathParams` composes `buildCanonicalPathParams()`. The four symbols are owned here because `ResolveContributionIdentityPayload` is this interface's own declared type, whatever it is currently equivalent to.
      * `[✅]`   The four symbols for each of `ResolveContributionIdentitySuccessReturn` and `ResolveContributionIdentityErrorReturn`; the success builder's `restOfCanonicalPathParams` composes `buildCanonicalPathParams()` whole, and the error builder composes `buildResolveContributionIdentitySourceGroupError()`.
      * `[✅]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[✅]`   `mockResolveContributionIdentity: ResolveContributionIdentityFn` returning `buildResolveContributionIdentitySuccessReturn()`, typed by the production function type and taking no configuration.
      * `[✅]`   No builder or invalidator for `DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse` or `CanonicalPathParams` is written here; all are imported types whose fixtures live in their home packages, located above.

   * `[✅]`   `_shared/utils/type-guards/type_guards.file_manager.test.ts` carries the case checklist for `isCanonicalPathParams` — accepts `buildCanonicalPathParams()`; accepts it with each optional member supplied; rejects each of `contributionType` and `stageSlug` corrupted via `invalidateCanonicalPathParams` and rest-destructured away; rejects each optional member present but of the wrong type; rejects `null`, a primitive and an array.

   * `[✅]`   `resolveContributionIdentity.guard.test.ts`
      * `[✅]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[✅]`   `isResolveContributionIdentityDeps`: accepts the built deps; rejects `logger` absent, non-object and carrying no `info`; rejects a non-record root.
      * `[✅]`   `isResolveContributionIdentityParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` absent and failing its owner's guard; rejects `providerRow` absent and failing its owner's guard; rejects `aiResponse` absent and a non-record; rejects a non-record root.
      * `[✅]`   `isResolveContributionIdentityPayload`: accepts the built payload; rejects each of `prompt_template_id`, `output_type`, `canonicalPathParams` and `inputs` corrupted in turn via `invalidateResolveContributionIdentityPayload`; rejects `canonicalPathParams` set to `invalidateCanonicalPathParams({ stageSlug: 42 })` and to one whose `contributionType` is absent, the two cases proving the guard checks the members the arm declares rather than the key's presence alone; rejects a non-record root.
      * `[✅]`   `isResolveContributionIdentitySuccessReturn`: accepts the built return; accepts one with neither optional member present and one with both; rejects each of `restOfCanonicalPathParams`, `storageFileType`, `isContinuationForStorage` and `description` absent; rejects `restOfCanonicalPathParams` failing `isCanonicalPathParams`; rejects `storageFileType` set to a `FileType` outside `ModelContributionFileTypes`; rejects `sourceGroupFragment` and `targetContributionId` present but non-string; rejects the error return; rejects a non-record root.
      * `[✅]`   `isResolveContributionIdentityErrorReturn`: accepts the built return; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects the success return; rejects a non-record root.
      * `[✅]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.
   
   * `[✅]`   `_shared/utils/type-guards/type_guards.file_manager.ts` gains `isCanonicalPathParams`, requiring a record whose `contributionType` passes the imported `isContributionType`, whose `stageSlug` passes `isDialecticStageSlug`, whose `sourceModelSlugs` is an array of strings when present, whose `sourceAnchorType`, `sourceAnchorModelSlug` and `pairedModelSlug` are strings when present, and whose `sourceAttemptCount` is a number when present. It keeps a boolean contract. `CanonicalPathParams` is owned by `_shared/types/file_manager.types.ts`, so its guard belongs in that package's guard file and nowhere else.
      * `[✅]`   `isResolveContributionIdentitySuccessReturn` calls `isCanonicalPathParams` on `restOfCanonicalPathParams`, requires `storageFileType` to pass the imported `isModelContributionFileType`, requires `isContinuationForStorage` to be a boolean and `description` to be a non-empty string, and requires each of `sourceGroupFragment` and `targetContributionId` to be a non-empty string when present.
      * `[✅]`   `isResolveContributionIdentityErrorReturn` requires `error instanceof Error` and `retriable` a boolean. The two arms are mutually exclusive, so a value passes exactly one.
      * `[✅]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[✅]`   No guard is written here for `DialecticExecuteJobPayload`, `DialecticJobRow`, `AiProvidersRow`, `UnifiedAIResponse` or `DocumentRelationships`; none is owned by this interface.   
      
   * `[✅]`   `resolveContributionIdentity.guard.ts`
      * `[✅]`   One guard per type this interface owns: `isResolveContributionIdentityDeps`, `isResolveContributionIdentityParams`, `isResolveContributionIdentityPayload`, `isResolveContributionIdentitySuccessReturn`, `isResolveContributionIdentityErrorReturn`, and one `instanceof` guard per owned error class.
      * `[✅]`   `isResolveContributionIdentityDeps` is a presence-of-method check, the deps being a behavior type: `logger.info` is a function and nothing about its behavior is asserted.
      * `[✅]`   `isResolveContributionIdentityParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — calls the imported `isDialecticJobRow` on `job`, the imported `isSelectedAiProvider` on `providerRow`, and requires `aiResponse` to be a record.
      * `[✅]`   `isResolveContributionIdentityPayload` calls the imported `isDialecticExecuteJobPayload`, catching the per-member diagnostic that guard throws and returning `false`, so this guard keeps a boolean contract while the arm guard keeps its throwing one. It then calls `isCanonicalPathParams` on `canonicalPathParams`, because the arm guard checks that member only as a record containing a `contributionType` key and this module reads `stageSlug` and `contributionType` as the declared types. This call is what retires the `isRecord(canonicalUnknown)` and `isDialecticStageSlug(stageSlugCanon)` probes the source runs inline.

   * `[✅]`   `resolveContributionIdentity.test.ts`
      * `[✅]`   Deps fixtures are `buildResolveContributionIdentityDeps({ … })`, params `buildResolveContributionIdentityParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the recipe-step reads the case turns on, and payload `buildResolveContributionIdentityPayload({ … })`.
      * `[✅]`   Description composed: a payload whose `output_type`, `stageSlug` and provider name are three distinct values yields a description containing all three in the source's order, asserted against an independent literal.
      * `[✅]`   Canonical assembly: a payload carrying all five optional canonical members yields all five on `restOfCanonicalPathParams`; a payload carrying none yields an object whose only keys are `contributionType` and `stageSlug`. Both cases assert `contributionType` equals the payload's, arranged so it differs from `stageSlug`.
      * `[✅]`   Anchor log: a payload carrying `sourceAnchorModelSlug` yields one `logger.info` call carrying that slug; a payload carrying none yields no call.
      * `[✅]`   Target precedence: three cases — payload value present yields the payload's, payload absent and row present yields the row's, both absent yields no `targetContributionId` and `isContinuationForStorage` false. The payload and row values differ, so a case reading the wrong source cannot pass.
      * `[✅]`   Continuation invariants: a continuation with no `document_relationships` returns the error arm whose error passes `isResolveContributionIdentityRelationshipsError`; a continuation whose `continuation_count` is absent and one whose count is zero each return the error arm whose error passes `isResolveContributionIdentityContinuationCountError`. All three carry `retriable` false.
      * `[✅]`   Raw provider precondition: a params fixture whose `aiResponse.rawProviderResponse` is absent, and one whose value fails `isJson`, each return the error arm whose error passes `isResolveContributionIdentityRawProviderResponseError`, with no read performed. A case arranges an invalid `document_key` alongside a valid `rawProviderResponse` and asserts the document error, and its mirror arranges the reverse, the pair proving the two branches are ordered as the source orders them.
      * `[✅]`   Document invariants: a document-related output whose `document_key` is null, one whose key is empty after trim, and one whose provider `api_identifier` is empty each return their own typed error; a non-document output carrying none of those values still returns the success arm, the case proving the invariants are gated on the classification.
      * `[✅]`   Storage selection: an output passing `isDocumentKey` yields `FileType.ModelContributionRawJson`; an output that does not yields that output unchanged. Both asserted against independent literals.
      * `[✅]`   Source group present: a document output carrying a `source_group` yields the success arm with `sourceGroupFragment` set to the first eight sanitized characters, asserted as an independent literal, and performs no read.
      * `[✅]`   Source group absent: a document output whose `document_relationships` is absent, and one whose `source_group` is undefined rather than null, each return the error arm whose error passes `isResolveContributionIdentitySourceGroupError` and perform no read.
      * `[✅]`   Exemption granted: a null `source_group` with a `recipe_step_id` whose `dialectic_stage_recipe_steps` row carries `granularity_strategy` `'per_model'` yields the success arm with no `sourceGroupFragment`, after exactly one read.
      * `[✅]`   Exemption refused: the same arrangement whose row carries any other strategy returns the source-group error, and the case where neither table holds the row returns the same error after exactly two reads.
      * `[✅]`   Read failures surfaced: a driver error on `dialectic_stage_recipe_steps` returns the error arm whose error passes `isResolveContributionIdentityRecipeStepReadError`, names that table, carries the driver's message and is `retriable` true, with the template table never queried; a first read returning no row followed by a driver error on `dialectic_recipe_template_steps` returns the same typed error naming the second table. Arranged beside the exemption-refused case so neither can pass by matching the other's error.
      * `[✅]`   Purity: neither the params object nor the payload object is mutated by any path, and the returned `restOfCanonicalPathParams` is not the payload's own object.
      * `[✅]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[✅]`   `construction`
      * `[✅]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[✅]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[✅]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`; this node constructs nothing at a boundary.

   * `[✅]`   `resolveContributionIdentity.ts`
      * `[✅]`   One exported function, typed `ResolveContributionIdentityFn`, implementing the interaction spec in its stated order: description, canonical assembly, anchor log, target resolution, continuation invariants, raw-provider precondition, document invariants, storage selection, source-group resolution with its exemption reads, fragment, success.
      * `[✅]`   The assembled canonical params, the resolved target, the selected storage type, the resolved source group and the success return are each held in one typed local; none is inferred and none is widened at its use site.
      * `[✅]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no read failure is swallowed.

   * `[✅]`   `resolveContributionIdentity.provides.ts`
      * `[✅]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[✅]`   `directionality`
      * `[✅]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, `packages/types` and `types_db.ts`, and exports only through its own provides.
      * `[✅]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer, beyond test-time fixtures.
      * `[✅]`   No reverse dependency: the one file this node edits outside its own folder is `_shared/utils/type-guards/type_guards.file_manager.ts`, which gains `isCanonicalPathParams` beside the type's other guards and imports nothing from this module.

   * `[✅]`   `requirements`
      * `[✅]`   `ResolveContributionIdentitySuccessReturn` declares exactly the six derived members — interface test.
      * `[✅]`   `restOfCanonicalPathParams` carries the whole `CanonicalPathParams` required surface, `contributionType` included — interface test and guard test.
      * `[✅]`   `ResolveContributionIdentityPayload` and `DialecticExecuteJobPayload` are assignable in both directions — interface test.
      * `[✅]`   `ResolveContributionIdentityParams` declares `aiResponse`, without which the preserved precondition cannot run — interface test.
      * `[✅]`   The return union has exactly two arms — interface test.
      * `[✅]`   The two arms reject each other — guard test.
      * `[✅]`   `isCanonicalPathParams` rejects a `canonicalPathParams` whose `stageSlug` is corrupt, which the arm guard accepts — guard test.
      * `[✅]`   An absent or non-JSON `rawProviderResponse` returns its own typed error before the document invariants run — unit test.
      * `[✅]`   The target precedence resolves payload before row before absent, with the three sources distinguishable — unit test.
      * `[✅]`   Each of the two continuation invariants and the two document invariants returns its own typed error, and a non-document output reaches success without them — unit test.
      * `[✅]`   A driver error on either recipe table returns a retriable read error naming that table, and the template table is never read after a failed cloned read — unit test.
      * `[✅]`   A `per_model` step admits a null `source_group` and every other strategy rejects it — unit test.
      * `[✅]`   Neither `params` nor `payload` is mutated, and the returned canonical params are a copy — unit test.
      * `[✅]`   The real fragment helper and the real classification guards produce the resolved identity across the database boundary — integration test.
      * `[✅]`   `saveResponse.ts`, `saveResponse.interface.ts`, `saveResponse.guard.ts` and `dialectic-service/dialectic.interface.ts` are unchanged by this node, and every existing consumer still compiles.

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