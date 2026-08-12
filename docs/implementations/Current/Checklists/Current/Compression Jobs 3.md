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
      * `[✅]`   RIDES HERE (owner): `dialectic-service/dialectic.interface.ts` — `DialecticBaseJobPayload` gains `source_prompt_resource_id?: string`, and `DialecticSimpleJobPayload` drops `job_type?: "simple"`, leaving it an extension of the base that declares no members of its own.
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
      * `[✅]`   RIDES HERE (owner): `_shared/dialectic.mock.ts` gains `DialecticBaseJobPayloadOverrides`, `buildDialecticBaseJobPayload`, `DialecticBaseJobPayloadCorruptions` and `invalidateDialecticBaseJobPayload` for the newly-guarded owned object type, and `buildDialecticExecuteJobPayload`, `buildDialecticPlanJobPayload`, `buildDialecticRenderJobPayload` and `buildDialecticSimpleJobPayload` each compose the base builder for their inherited members instead of restating them. `buildDialecticSimpleJobPayload` drops `job_type: 'simple'`.

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

* `[ ]`   supabase/functions/dialectic-worker/retryJob/retryJob.ts **[BE] Canonicalize the retry dispatcher as a function-folder module whose success arm carries the notified and unnotified flavors and whose error arm carries `RetryJobUpdateError`, so neither failure mode is lost**

   * `[ ]`   `objective`
      * `[ ]`   The retry dispatcher reports two distinct failures as one absence. `retryJob` returns `Promise<{ error?: Error }>` — an optional-member bag rather than a discriminated union — so a caller cannot tell a retry that was scheduled and announced from one that was scheduled and silently unannounced. The row-update failure returns a bare `Error` whose message interpolates the driver string, losing the job id and the attempted status as data. The notification failure is caught, logged and discarded, so the one outcome a caller could act on never leaves the function. Neither caller narrows what it gets: `saveResponse` awaits the call at each of its four retry sites and ignores the result, and `processSimpleJob` awaits and discards it, so a retry that could not be scheduled leaves the row in `processing` with nothing reported. The function is a bare file directly under `dialectic-worker/` with no interface, no guard, no mock and no provides.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/retryJob/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `RetryJobReturn`.
         * `[ ]`   The success arm carries two flavors, one per outcome the branch contract reaches: the notification was sent, and the dispatch was attempted and threw, carrying that `Error`. No flavor carries a nullable member for a consumer to re-narrow.
         * `[ ]`   Every job row carries a non-null `user_id`, and the worker handler fails a job outright before dispatch when it is absent, so a retry always has an owner to notify. `isRetryJobParams` requires `projectOwnerUserId` non-empty after trim, and the function attempts the notification unconditionally — there is no owner-presence branch and no flavor for its absence.
         * `[ ]`   The error arm carries `RetryJobUpdateError`, holding `jobId`, `attemptedStatus` and `driverMessage` as members rather than interpolated into a string, so a caller can act on the parts.
         * `[ ]`   The `dialectic_generation_jobs` update writes exactly what it writes today: `status: 'retrying'`, `attempt_count` from params, and `error_details.failedAttempts` copied member-wise from the payload's array.
         * `[ ]`   The notification carries the same `type`, `sessionId`, `modelId`, `iterationNumber`, `error` and `job_id` values it carries today.
         * `[ ]`   The module owns `RetryJobUpdateError` and `RetryJobNotificationError` and declares both in its own interface, so a caller reaches them through the module's `provides` beside the return types that carry them.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `dialectic-worker/retryJob.ts` and `dialectic-worker/retryJob.test.ts` are not edited, moved or deleted by this node. The canonical module lands at a new path, so `netlifyResponse/index.ts`, `processSimpleJob.ts`, `JobContext.interface.ts` and every mock supplying that member keep compiling untouched. The legacy pair is retired by the worker root, the last consumer to switch off it.
         * `[ ]`   No caller is edited here. This node lands a producer; the callers that narrow its return each have their own node.
         * `[ ]`   Both existing log lines are preserved verbatim, including the `[dialectic-worker] [retryJob]` prefix on each.
         * `[ ]`   `RetryJobFn` is the name this module's interface declares for its own signature. The unrelated `RetryJobFn` in `JobContext.interface.ts` types the legacy function and is neither imported nor reconciled here; the two coexist until the legacy file is retired.
         * `[ ]`   No integration test element. The module's only boundaries are the injected `SupabaseClient` and the notification service, both mocked at the outer edge by the unit tier, and nothing consumes this module until its callers switch — whole-chain coverage is theirs.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer job lifecycle write: given a job the caller has already decided to retry, record the retry on the row and announce it.
      * `[ ]`   The role is correct because the two things it does are the two things a retry IS — the row transition that makes the job eligible again, and the notice that it happened — and because the outcome it reports is a fact its caller must act on, which makes the return's shape this function's contract to state.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not decide whether a retry is warranted, or compare `attempt_count` against `max_retries`. The caller has already decided; this function refuses nothing.
         * `[ ]`   Do not build the `FailedAttemptError[]`. It arrives as the payload, assembled by the caller that holds the provider row.
         * `[ ]`   Do not edit `saveResponse.ts`, `processSimpleJob.ts`, `netlifyResponse/index.ts` or `JobContext.interface.ts`.
         * `[ ]`   Do not write any row other than `dialectic_generation_jobs`, and do not send any notification other than the retrying event.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/retryJob` — the retry transition of one job row and the notice that accompanies it.
      * `[ ]`   Inside boundary:
         * `[ ]`   The update's columns and values, the non-empty-owner invariant, and the three outcomes the two arms carry.
         * `[ ]`   `RetryJobDeps`, `RetryJobParams`, `RetryJobPayload`, both success flavors, the error arm, the return union, the function type, `RetryJobUpdateError`, `RetryJobNotificationError` and each error's constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DialecticJobRow` and `FailedAttemptError`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `Database`, owned by `types_db.ts`; `ILogger`, owned by `_shared/types.ts`.
         * `[ ]`   `NotificationServiceType` and `ContributionGenerationRetryingPayload`, owned by `_shared/types/notification.service.types.ts`.
         * `[ ]`   Whether a retry should happen, and what a caller does with the outcome.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the update-failure line and the notification-failure line, the module's only two log calls.
      * `[ ]`   Provider: `_shared/types/notification.service.types.ts` (`NotificationServiceType`, `ContributionGenerationRetryingPayload`).
         * `[ ]`   Layer classification: shared service contract.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the retrying-event dispatch and the typed literal it takes.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `FailedAttemptError`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound; the legacy file already imports `FailedAttemptError` from here, so the edge exists.
         * `[ ]`   Purpose: the row this function updates and the attempt records it writes.
      * `[ ]`   Provider: `types_db.ts` (`Database`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client.
      * `[ ]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[ ]`   Layer classification: shared test fixture surface for the database boundary.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the injected client in every params fixture and the update-result configuration in every unit case.
      * `[ ]`   Provider: `_shared/utils/notification.service.mock.ts` (`mockNotificationService`, `resetMockNotificationService`).
         * `[ ]`   Layer classification: shared test fixture surface, home of the notification service double.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the deps fixture's notification member and the per-case dispatch assertions.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildFailedAttemptError`, `invalidateFailedAttemptError`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of both imported types' builders.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the job row and attempt-record fixtures for every case and for this module's params and payload builders.
      * `[ ]`   Provider: `_shared/logger.mock.ts` (`MockLogger`).
         * `[ ]`   Layer classification: shared test fixture surface.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the deps fixture's logger member.
      * `[ ]`   Confirm:
         * `[ ]`   `RetryJobDeps` declares exactly `logger` and `notificationService` — the two collaborators the branch contract invokes, and no others. The database client is a per-invocation param.
         * `[ ]`   No reverse dependency: nothing in `_shared` or `dialectic-service` imports this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From `_shared/types.ts`: the `ILogger` type only, imported with `import type`.
         * `[ ]`   From the notification contract: the `NotificationServiceType` and `ContributionGenerationRetryingPayload` types only, imported with `import type`.
         * `[ ]`   From the hub: the `DialecticJobRow` and `FailedAttemptError` types only, imported with `import type`.
         * `[ ]`   From `types_db.ts`: the `Database` type only, imported with `import type`.

   * `[ ]`   `retryJob.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts the required key surface of `Parameters<RetryJobFn>[0]` is exactly `logger` and `notificationService`.
      * `[ ]`   A case asserts the required key surface of `Parameters<RetryJobFn>[1]` is exactly `dbClient`, `job`, `currentAttempt` and `projectOwnerUserId`.
      * `[ ]`   A case asserts the required key surface of `Parameters<RetryJobFn>[2]` is exactly `failedAttempts`, proving the attempt records are the payload and nothing else is.
      * `[ ]`   A case assigns `{ notified: true }` to `RetryJobNotifiedReturn`, proving the notified flavor carries no error member.
      * `[ ]`   A case asserts the required key surface of `RetryJobNotificationFailedReturn` is exactly `notified` and `notificationError`, proving the dispatch-failure flavor requires its error rather than admitting an absent one.
      * `[ ]`   Two cases prove flavor membership by typed assignment: each success flavor is assignable to `RetryJobSuccessReturn`, and that is assignable to `RetryJobReturn`.
      * `[ ]`   A case assigns an `RetryJobErrorReturn`-typed value to `RetryJobReturn`, proving the union has exactly the two arms.
      * `[ ]`   A case asserts the required key surface of `RetryJobUpdateErrorConstructorParams` is exactly `jobId`, `attemptedStatus` and `driverMessage`.
      * `[ ]`   A case asserts the required key surface of `RetryJobNotificationErrorConstructorParams` is exactly `jobId` and `thrownValue`.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<RetryJobReturn>` to `RetryJobFn`, proving the signature is asynchronous.

   * `[ ]`   `retryJob.interface.ts`
      * `[ ]`   `export interface RetryJobDeps { logger: ILogger; notificationService: NotificationServiceType; }`
      * `[ ]`   `export interface RetryJobParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; currentAttempt: number; projectOwnerUserId: string; }` — the client and the row are per-invocation, so they are params rather than deps.
      * `[ ]`   `export interface RetryJobPayload { failedAttempts: FailedAttemptError[]; }` — the data the function records. It arrives from an in-TS caller already typed, so the trusted form applies and the parameter is not `unknown`.
      * `[ ]`   `export type RetryJobNotifiedReturn = { notified: true };`
      * `[ ]`   `export type RetryJobNotificationFailedReturn = { notified: false; notificationError: Error };` — the dispatch was attempted and threw. The error is a required member, so no consumer re-narrows a nullable one.
      * `[ ]`   `export type RetryJobSuccessReturn = RetryJobNotifiedReturn | RetryJobNotificationFailedReturn;`
      * `[ ]`   `export type RetryJobErrorReturn = { error: RetryJobUpdateError; retriable: boolean };`
      * `[ ]`   `export type RetryJobReturn = RetryJobSuccessReturn | RetryJobErrorReturn;` — exactly two arms, the flavors nested inside the success arm.
      * `[ ]`   `export type RetryJobFn = (deps: RetryJobDeps, params: RetryJobParams, payload: RetryJobPayload) => Promise<RetryJobReturn>;`
      * `[ ]`   `export interface RetryJobUpdateErrorConstructorParams { jobId: string; attemptedStatus: string; driverMessage: string; }` and `export class RetryJobUpdateError extends Error` taking that one params object, holding each member as a readonly property, setting `name` to `'RetryJobUpdateError'`, and composing its `message` from the three so the string stays readable without being the only place the facts live.
      * `[ ]`   `export interface RetryJobNotificationErrorConstructorParams { jobId: string; thrownValue: string; }` and `export class RetryJobNotificationError extends Error` taking that one params object, holding each member as a readonly property, setting `name` to `'RetryJobNotificationError'`, and composing its `message` from the two. It is the typed error this module mints when the notification throws a value that is not an `Error`, so the flavor's `notificationError` member is satisfied without coercing a non-`Error` into one.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` is the worker's deps factory and binds this function into its bound form when its callers switch, with `dialectic-worker/index.ts` supplying the unbound implementation to it; nothing injects it here.

   * `[ ]`   `retryJob.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form. Every caller is in-TS and every value is already typed, so nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Update: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'retrying', attempt_count: params.currentAttempt, error_details: { failedAttempts: payload.failedAttempts.map(copy) } }).eq('id', params.job.id)` — the attempt records are copied member-wise into a fresh array, as they are today, so the caller's array is not aliased into the row write.
      * `[ ]`   Branch, condition the update returned a driver error: construct `RetryJobUpdateError` from `params.job.id`, the attempted status `'retrying'` and the driver's message; emit the existing error line verbatim — `[dialectic-worker] [retryJob] Failed to update job status to 'retrying': ${driver message}` — with the driver error as context, the error object carrying the three members and the log line carrying the text it carries today; return the error arm with `retriable: true`, a write the database refused now being one that can succeed on a later attempt. No notification is attempted and nothing below runs.
      * `[ ]`   Notification, unconditional: `deps.notificationService.sendContributionRetryingEvent` with a `ContributionGenerationRetryingPayload` literal carrying `type: 'contribution_generation_retrying'`, `sessionId` from `params.job.session_id`, `modelId` from the first attempt record's `modelId` or `'unknown'` when the array is empty, `iterationNumber` from `params.job.iteration_number`, `error` composed as `Attempt ${params.currentAttempt} failed. Retrying...`, and `job_id` from `params.job.id`; the target user is `params.projectOwnerUserId`.
      * `[ ]`   Branch, condition the notification call resolved: return the notified flavor.
      * `[ ]`   Branch, condition the notification call threw an `Error`: emit the existing `[dialectic-worker] [retryJob] Failed to send notification: ${message}` line; return the notification-failed flavor carrying that error unchanged, never re-wrapped.
      * `[ ]`   Branch, condition the notification call threw a non-`Error` value: emit the existing non-`Error` form of that same line; return the notification-failed flavor carrying a `RetryJobNotificationError` built from `params.job.id` and the stringified thrown value. The catch binding is `unknown`, so the two cases are branched: a thrown `Error` is a typed error and is propagated unchanged, and a non-`Error` is no error at all, so this module returns a specific typed error it owns rather than coercing the value.
      * `[ ]`   Ordering and side effects: exactly one row write per call, and it precedes every notification decision; zero writes on the error arm; the notification is attempted at most once; neither `params` nor `payload` is mutated.

   * `[ ]`   `retryJob.mock.ts`
      * `[ ]`   `RetryJobDepsOverrides`, `buildRetryJobDeps`, `RetryJobDepsCorruptions` and `invalidateRetryJobDeps`; the builder's base composes `new MockLogger()` and `mockNotificationService`.
      * `[ ]`   `RetryJobParamsOverrides`, `buildRetryJobParams`, `RetryJobParamsCorruptions` and `invalidateRetryJobParams`; the builder's base client is `createMockSupabaseClient(undefined, {})`, its `job` is `buildDialecticJobRow()`, its `currentAttempt` is a non-zero number so a case depending on the written value has to override it, and its `projectOwnerUserId` is the built row's `user_id` so the fixture is internally consistent.
      * `[ ]`   `RetryJobPayloadOverrides`, `buildRetryJobPayload`, `RetryJobPayloadCorruptions` and `invalidateRetryJobPayload`; the builder's base composes `[buildFailedAttemptError()]` rather than restating that type's defaults.
      * `[ ]`   The four symbols for each of `RetryJobNotifiedReturn`, `RetryJobNotificationFailedReturn` and `RetryJobErrorReturn`; the notification-failed builder defaults `notificationError` to `buildRetryJobNotificationError()`, and the error builder composes `buildRetryJobUpdateError()`.
      * `[ ]`   `RetryJobUpdateErrorConstructorParamsOverrides`, `buildRetryJobUpdateErrorConstructorParams`, `RetryJobUpdateErrorConstructorParamsCorruptions` and `invalidateRetryJobUpdateErrorConstructorParams`, plus `buildRetryJobUpdateError(overrides?)` returning `new RetryJobUpdateError(buildRetryJobUpdateErrorConstructorParams(overrides))` — a real instance, prototype intact, no spread and no cast. There is no invalidator for the instance; corruption belongs to the constructor params.
      * `[ ]`   The same five symbols for the notification error: `RetryJobNotificationErrorConstructorParamsOverrides`, `buildRetryJobNotificationErrorConstructorParams`, `RetryJobNotificationErrorConstructorParamsCorruptions`, `invalidateRetryJobNotificationErrorConstructorParams` and `buildRetryJobNotificationError(overrides?)` returning a real instance. There is no invalidator for the instance.
      * `[ ]`   `mockRetryJob: RetryJobFn` returning `buildRetryJobNotifiedReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `DialecticJobRow` or `FailedAttemptError` is written here; both are imported types whose fixtures live in `_shared/dialectic.mock.ts`.

   * `[ ]`   `retryJob.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isRetryJobDeps`: accepts the built deps; rejects each of `logger` and `notificationService` absent and non-object; rejects a deps object whose `notificationService` carries no `sendContributionRetryingEvent` function; rejects a non-record root.
      * `[ ]`   `isRetryJobParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `job` set to `invalidateDialecticJobRow({ id: 42 })`, the case proving the row is checked through its owner's guard; rejects `currentAttempt` absent, non-numeric, non-finite and negative; rejects `projectOwnerUserId` absent, non-string, the empty string and a whitespace-only string, the last two proving the owner invariant is enforced rather than assumed; rejects a non-record root.
      * `[ ]`   `isRetryJobPayload`: accepts the built payload; accepts a payload whose `failedAttempts` is an empty array, an empty batch being valid; rejects `failedAttempts` absent, a non-array, and an array containing `invalidateFailedAttemptError({ modelId: 42 })`; rejects a non-record root.
      * `[ ]`   `isRetryJobNotifiedReturn`: accepts its own flavor; rejects `notified` absent or not exactly `true`; rejects the notification-failed flavor; rejects a non-record root.
      * `[ ]`   `isRetryJobNotificationFailedReturn`: accepts the built flavor, and accepts one whose `notificationError` is a plain `Error`, the member being typed `Error` rather than this module's own; rejects `notified` not exactly `false`; rejects `notificationError` absent, `null`, a string, and a plain object rather than an `Error`; rejects the notified flavor; rejects a non-record root.
      * `[ ]`   `isRetryJobErrorReturn`: accepts the built error return; rejects `error` absent, a plain object, and a plain `Error` that is not a `RetryJobUpdateError`; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   `isRetryJobUpdateError`: accepts `buildRetryJobUpdateError()`; rejects a plain `Error`, a plain object carrying the same three members, `null` and a primitive — the object case being what proves membership is nominal rather than shape-matched.
      * `[ ]`   `isRetryJobNotificationError`: accepts `buildRetryJobNotificationError()`; rejects a plain `Error`, a plain object carrying the same two members, `buildRetryJobUpdateError()`, `null` and a primitive.

   * `[ ]`   `retryJob.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isRetryJobDeps`, `isRetryJobParams`, `isRetryJobPayload`, `isRetryJobNotifiedReturn`, `isRetryJobNotificationFailedReturn`, `isRetryJobErrorReturn`, `isRetryJobUpdateError` and `isRetryJobNotificationError`.
      * `[ ]`   `isRetryJobDeps` is a presence-of-method check, the deps being a behavior type: `logger` a record and `notificationService` a record whose `sendContributionRetryingEvent` is a function.
      * `[ ]`   `isRetryJobParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own, so the check is presence, not shape — calls `isDialecticJobRow` on `job`, requires `currentAttempt` finite and not negative, and requires `projectOwnerUserId` a string that is non-empty after trim — the job row's `user_id` is non-null and the worker fails an ownerless job before dispatch, so an empty owner here is invalid input rather than a state to branch on.
      * `[ ]`   `isRetryJobPayload` requires `failedAttempts` to be an array every element of which passes the imported `isFailedAttemptError`. It inspects no member of those elements itself.
      * `[ ]`   `isRetryJobNotifiedReturn` requires `notified` exactly `true`; `isRetryJobNotificationFailedReturn` requires `notified` exactly `false` and `notificationError` `instanceof Error`. The two flavors are mutually exclusive, so a value passes exactly one.
      * `[ ]`   `isRetryJobErrorReturn` requires `error` to pass `isRetryJobUpdateError` and `retriable` to be a boolean.
      * `[ ]`   `isRetryJobUpdateError` is `value instanceof RetryJobUpdateError` and nothing more, and `isRetryJobNotificationError` is `value instanceof RetryJobNotificationError` and nothing more. The constructor is each type's only producer, so membership is nominal and a property-by-property inspection would accept plain objects the constructor never produced.
      * `[ ]`   No guard is written here for `DialecticJobRow`, `FailedAttemptError` or `Database`; none is owned by this interface, and each already has a guard in its owner's file.

   * `[ ]`   `retryJob.test.ts`
      * `[ ]`   Params fixtures are `buildRetryJobParams({ dbClient })` where `dbClient` comes from `createMockSupabaseClient` configured for the `dialectic_generation_jobs` update the case turns on; deps fixtures are `buildRetryJobDeps({ … })`; payload fixtures are `buildRetryJobPayload({ … })`. Each block calls `resetMockNotificationService` before arranging, so the shared double's recorded calls belong to that block alone and no assertion on dispatch depends on block order.
      * `[ ]`   Update columns: a successful update over params built with `currentAttempt: 4` records `status: 'retrying'` and `attempt_count: 4`, asserted as independent literals against the recorded update argument, and `error_details.failedAttempts` equal to the payload's records. The attempt number differs from the built job row's own `attempt_count` so a case reading the row instead of the param cannot pass.
      * `[ ]`   Empty batch: a payload built with `failedAttempts: []` still writes the row and records an empty `failedAttempts` array.
      * `[ ]`   Notified: a successful update returns the notified flavor, and the dispatched notification carries the job id, the session id, the iteration number and the first record's `modelId`, with the target user equal to `params.projectOwnerUserId`.
      * `[ ]`   Model id fallback: a payload built with `failedAttempts: []` dispatches a notification whose `modelId` is `'unknown'`.
      * `[ ]`   Notification threw: a deps object whose `notificationService.sendContributionRetryingEvent` throws a named `Error` returns the notification-failed flavor carrying that exact error, and the row write still happened. The failing member is declared as a production-typed function inside the test, not configured on the shared mock.
      * `[ ]`   Notification threw a non-`Error`: the same arrangement throwing a string returns the notification-failed flavor whose `notificationError` passes `isRetryJobNotificationError` and whose `thrownValue` is that string.
      * `[ ]`   Update failed: an update returning a driver error returns the error arm; the carried error passes `isRetryJobUpdateError`, its `jobId`, `attemptedStatus` and `driverMessage` are the job's id, `'retrying'` and the driver's message asserted as independent values, `retriable` is `true`, and no notification was dispatched.
      * `[ ]`   Purity: neither the params object nor the payload array is mutated by any path, asserted on the payload's length and first record after the call.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except `RetryJobUpdateError` on its error path and `RetryJobNotificationError` on its non-`Error` notification path. There is no factory and no partially constructed state.
      * `[ ]`   `RetryJobUpdateError` and `RetryJobNotificationError` each take exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's callers switch; this node constructs nothing at a boundary.

   * `[ ]`   `retryJob.ts`
      * `[ ]`   One exported function, typed `RetryJobFn`, implementing the interaction spec in its stated order: update, update-failure branch, owner-presence branch, notification, notification-outcome branches.
      * `[ ]`   The update payload object and the notification payload object are each held in one typed local; neither is inferred and neither is widened at its use site.
      * `[ ]`   The notification call is wrapped in `try`/`catch`, the catch binds `unknown`, and both branches the spec names are written.
      * `[ ]`   Every return is one of the two arms and, within the success arm, exactly one named flavor; no path falls through, no flavor is assembled inline at a return site, and no failure is logged instead of returned.

   * `[ ]`   `retryJob.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including `RetryJobUpdateError`, `RetryJobNotificationError` and the three flavor guards — through one import point.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and the legacy `dialectic-worker/retryJob.ts` neither imports it nor is imported by it.
      * `[ ]`   No reverse dependency: `_shared` and `dialectic-service` gain no import of this module, and no file outside it is edited by this node.

   * `[ ]`   `requirements`
      * `[ ]`   `RetryJobDeps` declares exactly `logger` and `notificationService`, and the client and row are params — interface test.
      * `[ ]`   `RetryJobPayload` declares exactly `failedAttempts` — interface test.
      * `[ ]`   All three success flavors are members of `RetryJobSuccessReturn`, which is a member of `RetryJobReturn`, and the top-level union has exactly two arms — interface test.
      * `[ ]`   `RetryJobNotificationFailedReturn` requires `notificationError`, and `RetryJobNoOwnerReturn` declares no such member — interface test.
      * `[ ]`   `isRetryJobUpdateError` rejects a plain object carrying the same three members — guard test.
      * `[ ]`   `isRetryJobPayload` rejects an array containing one invalid attempt record — guard test.
      * `[ ]`   The three flavor guards are mutually exclusive: each rejects the other two flavors, so a consumer discriminates by guard and never by a null check — guard test.
      * `[ ]`   A successful update writes `status: 'retrying'` and the params' `currentAttempt`, and copies the payload's records into `error_details.failedAttempts` — unit test.
      * `[ ]`   A successful update with an owner returns the notified flavor and dispatches one notification carrying the job's identifiers — unit test.
      * `[ ]`   An empty owner id returns the no-owner flavor, writes the row, and dispatches nothing — unit test.
      * `[ ]`   A notification that throws an `Error` returns the notification-failed flavor carrying that error unchanged, and one that throws a non-`Error` returns the same flavor carrying a `RetryJobNotificationError` naming the thrown value — unit test.
      * `[ ]`   A failed update returns the error arm carrying a `RetryJobUpdateError` whose three members are the job id, `'retrying'` and the driver's message, with `retriable: true` and no notification dispatched — unit test.
      * `[ ]`   `dialectic-worker/retryJob.ts` and `dialectic-worker/retryJob.test.ts` are unchanged by this node, and every existing consumer of the legacy function still compiles.

* `[ ]`   supabase/functions/dialectic-worker/assembleAiResponse/assembleAiResponse.ts **[BE] `UnifiedAIResponse` assembly — real token counting through an injected tokenizer, three-branch finish-reason resolution, raw-provider composition, and caller-supplied timing and preflight**

   * `[ ]`   `objective`
      * `[ ]`   The response-assembly block inside `saveResponse.ts` produces the token counts the debit and the affordability preflight are computed from, and three of its four inputs are fabricated. Completion tokens are `contentString.length`, a character count standing in for a token count. Elapsed time is a local `const processingTimeMs: number = 0`. The prompt count comes from a property-descriptor probe of an untyped job payload that returns `0` when the member is absent. The finish reason is one ternary that maps a null, a valid value and an unrecognized value onto two outcomes, supplying `'unknown'` as a default for two of the three. The block is inline in the orchestrator, so it has no contract, no test of its own, and nothing that can assert what it produces.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/assembleAiResponse/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `AssembleAiResponseReturn`.
         * `[ ]`   Completion tokens for a synthesized usage are counted by the injected bound tokenizer against the caller's model config. No string length is used as a token count anywhere in the module.
         * `[ ]`   Prompt tokens for a synthesized usage are `params.preflightInputTokens`. The module performs no property probe and holds no fallback for an absent count.
         * `[ ]`   Elapsed time is `params.processingTimeMs`. The module declares no default for it.
         * `[ ]`   A stream-reported token usage is used as given; synthesis happens only when the stream reported none and the assembled content is non-empty.
         * `[ ]`   Assembled content trims to `null` when the trimmed string is empty, and that null is what suppresses synthesis.
         * `[ ]`   The finish reason resolves through three explicit branches — reported-none, recognized, and unrecognized — with no branch supplying a value as a default for another.
         * `[ ]`   The assembled `UnifiedAIResponse` carries `content`, `tokenUsage`, `inputTokens`, `outputTokens`, `processingTimeMs`, `finish_reason` and a `rawProviderResponse` holding the same usage and reason, composed exactly as the source composes them.
         * `[ ]`   The module owns `AssembleAiResponseTokenCountError` and `AssembleAiResponseFinishReasonError` and declares both in its own interface.
         * `[ ]`   `isUnifiedAIResponse` is added to `_shared/utils/type-guards/type_guards.dialectic.ts`, the guard file of the interface that owns the type, with its own guard test. No guard for it exists in the repo today, and this module's success-return guard calls it.
         * `[ ]`   `BoundCountTokensFn` is declared in `_shared/types/tokenizer.types.ts` beside `CountTokensFn`, its owner, as `(payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts` is not edited, and neither is `saveResponse.interface.ts`. The module lands beside the monolith with its own tests; the orchestrator switches to it, deletes the inline block, and deletes `readOptionalPreflightInputTokens` in the relocation node. Every current consumer keeps compiling.
         * `[ ]`   The two `deps.logger.info` calls that follow the assembly block belong to the orchestrator and stay there. This module has no logger dep and emits no log line.
         * `[ ]`   The module performs no IO, reads no row, and touches no database client.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is a domain-layer pure transform: given what the stream reported and what the caller measured, produce the single response object every downstream decision reads.
      * `[ ]`   The role is correct because the function decides nothing about the job and writes nothing — it converts a transport-shaped result into the repo's response type, and the one collaborator it needs is a counter, not a service.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not decide whether the response is usable, retriable, complete or continuable. Those are `prepareResponseContent`'s branches.
         * `[ ]`   Do not measure elapsed time, read the job row, or derive the preflight count. All three arrive as params.
         * `[ ]`   Do not sanitize, parse or inspect the content beyond trimming it.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/assembleAiResponse` — the conversion of one stream result into one `UnifiedAIResponse`.
      * `[ ]`   Inside boundary:
         * `[ ]`   The content trim rule, the usage copy-or-synthesize rule, the three finish-reason branches, and the composition of the response object and its `rawProviderResponse`.
         * `[ ]`   `AssembleAiResponseDeps`, `AssembleAiResponseParams`, `AssembleAiResponsePayload`, the success arm, the error arm, the return union, the function type, `AssembleAiResponseTokenCountError`, `AssembleAiResponseFinishReasonError` and each error's constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `UnifiedAIResponse`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `TokenUsage`, `FinishReason` and `AiModelExtendedConfig`, owned by `_shared/types.ts`.
         * `[ ]`   `CountableChatPayload`, `CountTokensFn` and `BoundCountTokensFn`, owned by `_shared/types/tokenizer.types.ts`.
         * `[ ]`   How the tokenizer counts, where the preflight count came from, and what any consumer does with the assembled response.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/types/tokenizer.types.ts` (`BoundCountTokensFn`, `CountableChatPayload`, `CountTokensFn`).
         * `[ ]`   Layer classification: shared type surface for the tokenizer contract.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the injected counter and the payload literal it takes. The bound form is declared by this node in that file, because injecting the unbound `CountTokensFn` would force this module to hold and pass down `CountTokensDeps`, which is another module's deps object.
      * `[ ]`   Provider: `_shared/types.ts` (`AiModelExtendedConfig`, `TokenUsage`, `FinishReason`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the config the counter is called against, the usage type the payload carries and the module produces, and the resolved reason.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`UnifiedAIResponse`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the type this module assembles and returns on its success arm.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of the assembled type.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the fixtures for the success-return builder and for the `isUnifiedAIResponse` guard test this node adds.
      * `[ ]`   Confirm:
         * `[ ]`   `AssembleAiResponseDeps` declares exactly `countTokens` — the one collaborator the branch contract invokes. Timing, preflight and model config are per-invocation params; the stream result is the payload.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From the tokenizer contract: the `BoundCountTokensFn` and `CountableChatPayload` types only, imported with `import type`.
         * `[ ]`   From `_shared/types.ts`: the `AiModelExtendedConfig`, `TokenUsage` and `FinishReason` types only, imported with `import type`.
         * `[ ]`   From the hub: the `UnifiedAIResponse` type only, imported with `import type`.

   * `[ ]`   `assembleAiResponse.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts the required key surface of `Parameters<AssembleAiResponseFn>[0]` is exactly `countTokens`.
      * `[ ]`   A case asserts the required key surface of `Parameters<AssembleAiResponseFn>[1]` is exactly `processingTimeMs`, `preflightInputTokens` and `modelConfig`.
      * `[ ]`   A case asserts the required key surface of `Parameters<AssembleAiResponseFn>[2]` is exactly `assembledContent`, `tokenUsage` and `finishReason`, proving the stream result is the payload and the caller's measurements are not.
      * `[ ]`   A case asserts the required key surface of `AssembleAiResponseSuccessReturn` is exactly `aiResponse`.
      * `[ ]`   A case assigns an `AssembleAiResponseSuccessReturn`-typed value to `AssembleAiResponseReturn` and a case assigns an `AssembleAiResponseErrorReturn`-typed value to it, proving the union has exactly the two arms.
      * `[ ]`   A case asserts the required key surface of `AssembleAiResponseErrorReturn` is exactly `error` and `retriable`.
      * `[ ]`   A case asserts the required key surface of `AssembleAiResponseTokenCountErrorConstructorParams` is exactly `apiIdentifier` and `thrownValue`, and a case asserts the surface of `AssembleAiResponseFinishReasonErrorConstructorParams` is exactly `reportedValue`.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => AssembleAiResponseReturn` to `AssembleAiResponseFn`, proving the signature is synchronous — the module performs no IO and awaits nothing.
      * `[ ]`   A case assigns `{ message: 'x' }` to `CountableChatPayload` and assigns a function literal of shape `(payload, modelConfig) => number` to `BoundCountTokensFn`, proving the bound form drops the deps parameter and keeps the other two.

   * `[ ]`   `assembleAiResponse.interface.ts`
      * `[ ]`   `export interface AssembleAiResponseDeps { countTokens: BoundCountTokensFn; }`
      * `[ ]`   `export interface AssembleAiResponseParams { processingTimeMs: number; preflightInputTokens: number; modelConfig: AiModelExtendedConfig; }` — all three are measured or resolved by the caller per invocation.
      * `[ ]`   `export interface AssembleAiResponsePayload { assembledContent: string; tokenUsage: TokenUsage | null; finishReason: string | null; }` — the stream result, the data the function operates on. Both null states are declared here because both are ordinary reported outcomes. `finishReason` is the raw reported string because narrowing it is this module's work. The caller composes this value member-wise from the transport body it already holds; this module declares the type it receives, so no type crosses from the orchestrator down into it.
      * `[ ]`   `export type AssembleAiResponseSuccessReturn = { aiResponse: UnifiedAIResponse };`
      * `[ ]`   `export type AssembleAiResponseErrorReturn = { error: AssembleAiResponseTokenCountError | AssembleAiResponseFinishReasonError; retriable: boolean };` — the error member's union is declared here, in the owning interface, and is never composed at a use site.
      * `[ ]`   `export type AssembleAiResponseReturn = AssembleAiResponseSuccessReturn | AssembleAiResponseErrorReturn;` — exactly two arms.
      * `[ ]`   `export type AssembleAiResponseFn = (deps: AssembleAiResponseDeps, params: AssembleAiResponseParams, payload: AssembleAiResponsePayload) => AssembleAiResponseReturn;`
      * `[ ]`   `export interface AssembleAiResponseTokenCountErrorConstructorParams { apiIdentifier: string; thrownValue: string; }` and `export class AssembleAiResponseTokenCountError extends Error` taking that one params object, holding each member as a readonly property, setting `name` to `'AssembleAiResponseTokenCountError'`, and composing its `message` from the two.
      * `[ ]`   `export interface AssembleAiResponseFinishReasonErrorConstructorParams { reportedValue: string; }` and `export class AssembleAiResponseFinishReasonError extends Error` taking that one params object, holding the member as a readonly property, setting `name` to `'AssembleAiResponseFinishReasonError'`, and composing its `message` from it.
      * `[ ]`   `_shared/types/tokenizer.types.ts` gains `export type BoundCountTokensFn = (payload: CountableChatPayload, modelConfig: AiModelExtendedConfig) => number;` beside `CountTokensFn`. `CountTokensFn` itself is unchanged.
      * `[ ]`   No bound form of this module is declared. `dialectic-worker/createJobContext` binds it when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `assembleAiResponse.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form. The orchestrator guards the transport body at the boundary and composes this payload from the narrowed result, so nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Content derivation: `trimmedContent` is `payload.assembledContent.trim()`; `contentString` is `null` when `trimmedContent` is the empty string and `trimmedContent` otherwise. This is the value that decides whether synthesis runs.
      * `[ ]`   Branch, condition `payload.finishReason` is a non-`null` string that does not pass `isFinishReason`: return the error arm carrying `AssembleAiResponseFinishReasonError` built from that value, with `retriable: false`, an unrecognized reason being a fact about the provider's output that a repeat call reproduces. The reason resolves before any counting, so this branch returns without a tokenizer call. Nothing is assembled.
      * `[ ]`   Branch, condition `payload.finishReason` is `null`: the resolved reason is `'unknown'`, the member of `FinishReason` that represents a provider reporting none. `isFinishReason` is not consulted for this case — it answers `true` for `null`, which `FinishReason` does not admit — so the null case is branched ahead of it.
      * `[ ]`   Branch, condition `payload.finishReason` is a non-`null` string that passes `isFinishReason`: the resolved reason is that value.
      * `[ ]`   Branch, condition `payload.tokenUsage` is not `null`: the effective usage is a `TokenUsage` copying `prompt_tokens`, `completion_tokens` and `total_tokens` member-wise from it. No dependency call is made — the stream reported real counts and they are used as reported.
      * `[ ]`   Branch, condition `payload.tokenUsage` is `null` and `contentString` is `null`: the effective usage is `null`. There is no content to count, so no dependency call is made and nothing is synthesized.
      * `[ ]`   Branch, condition `payload.tokenUsage` is `null` and `contentString` is not `null`: call `deps.countTokens` with a `CountableChatPayload` carrying `message: contentString` and with `params.modelConfig`; the effective usage is `prompt_tokens: params.preflightInputTokens`, `completion_tokens: the returned count`, `total_tokens: their sum`.
      * `[ ]`   Branch, condition the `deps.countTokens` call throws: return the error arm carrying `AssembleAiResponseTokenCountError` built from `params.modelConfig.api_identifier` and the stringified thrown value, with `retriable: false`. The counter is deterministic over its inputs, so the same call fails the same way. The catch binding is `unknown` and the thrown value is stringified rather than coerced to an `Error`.
      * `[ ]`   Assembly: the success arm carries a `UnifiedAIResponse` whose `content` is `contentString`, `tokenUsage` is the effective usage, `inputTokens` is that usage's `prompt_tokens` and `outputTokens` its `completion_tokens` — both absent when the usage is `null` — `processingTimeMs` is `params.processingTimeMs`, `finish_reason` is the resolved reason, and `rawProviderResponse` holds the same effective usage under `token_usage` and the same resolved reason under `finish_reason`.
      * `[ ]`   Ordering and side effects: the finish reason resolves first and its error branch returns before any counting; `deps.countTokens` is invoked at most once per call and only in the synthesis branch; neither `params` nor `payload` is mutated; no value is logged, read or written.

   * `[ ]`   `assembleAiResponse.mock.ts`
      * `[ ]`   `AssembleAiResponseDepsOverrides`, `buildAssembleAiResponseDeps`, `AssembleAiResponseDepsCorruptions` and `invalidateAssembleAiResponseDeps`; the builder's base `countTokens` is a production-typed `BoundCountTokensFn` returning a fixed non-zero count, so a case that depends on the counted value has to override it and a case that reads a zero cannot pass by accident.
      * `[ ]`   `AssembleAiResponseParamsOverrides`, `buildAssembleAiResponseParams`, `AssembleAiResponseParamsCorruptions` and `invalidateAssembleAiResponseParams`; the builder's base `processingTimeMs` and `preflightInputTokens` are distinct non-zero numbers so a case cannot pass by reading one where it meant the other, and its `modelConfig` composes the `AiModelExtendedConfig` builder from that type's home package rather than restating its defaults.
      * `[ ]`   `AssembleAiResponsePayloadOverrides`, `buildAssembleAiResponsePayload`, `AssembleAiResponsePayloadCorruptions` and `invalidateAssembleAiResponsePayload`; the builder's base `assembledContent` is a non-empty string, its `tokenUsage` composes the `TokenUsage` builder from that type's home package, and its `finishReason` is `'stop'`.
      * `[ ]`   The four symbols for each of `AssembleAiResponseSuccessReturn` and `AssembleAiResponseErrorReturn`; the success builder composes `buildUnifiedAIResponse()` from `_shared/dialectic.mock.ts`, and the error builder composes `buildAssembleAiResponseTokenCountError()`.
      * `[ ]`   The four symbols for each error's constructor-params type, plus `buildAssembleAiResponseTokenCountError(overrides?)` and `buildAssembleAiResponseFinishReasonError(overrides?)` returning real instances — prototype intact, no spread and no cast. There is no invalidator for either instance; corruption belongs to the constructor params.
      * `[ ]`   `mockAssembleAiResponse: AssembleAiResponseFn` returning `buildAssembleAiResponseSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator is written here for `UnifiedAIResponse`, `TokenUsage` or `AiModelExtendedConfig`; all three are imported types whose fixtures live in their home packages. A test needing a different count declares its own production-typed `BoundCountTokensFn` inside the test rather than calling the configurable `createMockCountTokens` factory.

   * `[ ]`   `assembleAiResponse.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isAssembleAiResponseDeps`: accepts the built deps; rejects `countTokens` absent, non-function and a plain object; rejects a non-record root.
      * `[ ]`   `isAssembleAiResponseParams`: accepts the built params; rejects each of `processingTimeMs` and `preflightInputTokens` absent, non-numeric, non-finite and negative; rejects `modelConfig` absent and set to that type's invalidator output, the case proving the config is checked through its owner's guard; rejects a non-record root.
      * `[ ]`   `isAssembleAiResponsePayload`: accepts the built payload; accepts `assembledContent` set to the empty string, an empty stream result being valid input; accepts `tokenUsage` `null` and `finishReason` `null`, both being declared reported states; rejects `assembledContent` absent and non-string; rejects `tokenUsage` set to that type's invalidator output; rejects `finishReason` absent and non-string; rejects a non-record root.
      * `[ ]`   `isAssembleAiResponseSuccessReturn`: accepts the built return; rejects `aiResponse` absent and set to `invalidateUnifiedAIResponse({ content: 42 })`, the case proving the response is checked through the guard this node adds; rejects a non-record root.
      * `[ ]`   `isAssembleAiResponseErrorReturn`: accepts the built return, and accepts one whose `error` is `buildAssembleAiResponseFinishReasonError()`, proving both members of the declared error union are admitted; rejects `error` absent, a plain object, and a plain `Error` that is neither owned class; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   `isAssembleAiResponseTokenCountError` and `isAssembleAiResponseFinishReasonError`: each accepts its own builder's instance; each rejects a plain `Error`, a plain object carrying the same members, the other owned error, `null` and a primitive — the plain-object case being what proves membership is nominal, and the other-error case what proves the two are not interchangeable.
      * `[ ]`   `type_guards.dialectic.test.ts` gains the checklist for `isUnifiedAIResponse`: accepts `buildUnifiedAIResponse()`; accepts one whose only member is `content`, every other member being optional; accepts `content` set to `null`; rejects `content` absent; rejects each of `content`, `inputTokens`, `outputTokens`, `processingTimeMs`, `contentType`, `error`, `errorCode`, `finish_reason` and `rawProviderResponse` present but corrupted, one case per member; rejects `tokenUsage` set to a record whose `prompt_tokens` is not a number; accepts `tokenUsage` `null` and accepts one omitting the optional `total_tokens`; rejects `null`, a primitive and an array.

   * `[ ]`   `assembleAiResponse.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isAssembleAiResponseDeps`, `isAssembleAiResponseParams`, `isAssembleAiResponsePayload`, `isAssembleAiResponseSuccessReturn`, `isAssembleAiResponseErrorReturn`, `isAssembleAiResponseTokenCountError` and `isAssembleAiResponseFinishReasonError`.
      * `[ ]`   `isAssembleAiResponseDeps` is a presence-of-method check, the deps being a behavior type: `countTokens` is a function and nothing about its behavior is asserted.
      * `[ ]`   `isAssembleAiResponseParams` requires `processingTimeMs` and `preflightInputTokens` finite and not negative, and calls the imported `isAiModelExtendedConfig` on `modelConfig`.
      * `[ ]`   `isAssembleAiResponsePayload` requires `assembledContent` a string, `tokenUsage` either `null` or passing the imported `isTokenUsage`, and `finishReason` either `null` or a string. It does not narrow the reason to `FinishReason` — an unreported or unrecognized reason is valid input the branch contract handles, not invalid data.
      * `[ ]`   `isAssembleAiResponseSuccessReturn` requires `aiResponse` to pass the imported `isUnifiedAIResponse`. `isAssembleAiResponseErrorReturn` requires `error` to pass either owned error guard and `retriable` to be a boolean.
      * `[ ]`   `isAssembleAiResponseTokenCountError` is `value instanceof AssembleAiResponseTokenCountError` and `isAssembleAiResponseFinishReasonError` is `value instanceof AssembleAiResponseFinishReasonError`, each and nothing more. The constructor is each type's only producer, so membership is nominal.
      * `[ ]`   `_shared/utils/type-guards/type_guards.dialectic.ts` gains `isUnifiedAIResponse`, written there because that guard file belongs to the interface that owns the type. It requires a record root, requires `content` present and either a string or `null`, checks each optional member only when present, and checks `tokenUsage` as either `null` or a record whose `prompt_tokens` and `completion_tokens` are numbers and whose `total_tokens` is a number when present — the shape `UnifiedAIResponse` declares inline for that member.
      * `[ ]`   No guard is written here for `UnifiedAIResponse`, `TokenUsage`, `AiModelExtendedConfig`, `FinishReason` or the tokenizer types; none is owned by this interface.

   * `[ ]`   `assembleAiResponse.test.ts`
      * `[ ]`   Deps fixtures are `buildAssembleAiResponseDeps({ … })`, params fixtures `buildAssembleAiResponseParams({ … })` and payload fixtures `buildAssembleAiResponsePayload({ … })`, each overriding only what its case turns on.
      * `[ ]`   Reported usage is used as given: a payload whose `tokenUsage` carries counts distinct from the deps counter's return yields a response whose `tokenUsage` is those counts, and the counter is never invoked — asserted on a spy the test applies to its own production-typed `countTokens` at the call site.
      * `[ ]`   Synthesis counts real tokens: a payload with `tokenUsage: null` and non-empty content, over deps whose `countTokens` returns a fixed number unequal to the content's character length, yields `completion_tokens` equal to that number. The content is chosen so its length and the returned count differ, so an implementation reading `.length` fails this case.
      * `[ ]`   Synthesis uses the params' preflight: the same arrangement yields `prompt_tokens` equal to `params.preflightInputTokens` and `total_tokens` equal to that plus the counted number, asserted as independent literals.
      * `[ ]`   The counter is called with the trimmed content and the params' config: the same arrangement records a single invocation whose payload `message` is the trimmed content and whose second argument is `params.modelConfig`.
      * `[ ]`   Empty content suppresses synthesis: a payload with `tokenUsage: null` and `assembledContent` set to whitespace yields a response whose `content` is `null` and whose `tokenUsage` is `null`, with `inputTokens` and `outputTokens` absent, and the counter is never invoked.
      * `[ ]`   Elapsed time is the params': a response assembled over params built with a distinct `processingTimeMs` carries that number, which differs from every other number in the arrangement so a case reading the wrong member cannot pass.
      * `[ ]`   Reported-none reason: a payload with `finishReason: null` yields `finish_reason` `'unknown'` on both the response and its `rawProviderResponse`.
      * `[ ]`   Recognized reason: a payload with `finishReason: 'length'` yields `'length'` on both.
      * `[ ]`   Unrecognized reason: a payload with `finishReason: 'not_a_reason'` returns the error arm; the carried error passes `isAssembleAiResponseFinishReasonError`, its `reportedValue` is that string, `retriable` is `false`, and the counter was never invoked.
      * `[ ]`   Counter threw: deps whose `countTokens` throws a named `Error`, over a payload that would synthesize, return the error arm; the carried error passes `isAssembleAiResponseTokenCountError`, its `apiIdentifier` and `thrownValue` are the config's identifier and the thrown value stringified, and `retriable` is `false`. The throwing member is declared as a production-typed function inside the test.
      * `[ ]`   Counter threw a non-`Error`: the same arrangement throwing a string returns the same error arm carrying that string as `thrownValue`.
      * `[ ]`   Raw provider composition: a successful assembly's `rawProviderResponse` carries the same usage object contents and the same resolved reason as the response's own members.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path, asserted on their members after the call.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its two error types on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, which also binds `countTokens` from `CountTokensFn` and its `CountTokensDeps` before injecting it here. This node constructs nothing at a boundary.

   * `[ ]`   `assembleAiResponse.ts`
      * `[ ]`   One exported function, typed `AssembleAiResponseFn`, implementing the interaction spec in its stated order: content derivation, finish-reason branches, usage branches, assembly.
      * `[ ]`   The effective usage, the resolved reason, the `CountableChatPayload` passed to the counter, and the assembled response are each held in one typed local; none is inferred and none is widened at its use site.
      * `[ ]`   The `deps.countTokens` call is wrapped in `try`/`catch`, the catch binds `unknown`, and the thrown value is stringified for the error's member rather than coerced to an `Error`.
      * `[ ]`   Every return is one of the two arms; no path falls through, no default value substitutes for a missing input, and no failure is swallowed.

   * `[ ]`   `assembleAiResponse.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including both error classes and the return guards — through one import point.

   * `[ ]`   `assembleAiResponse.integration.test.ts`
      * `[ ]`   Boundary: the tokenizer. The real `countTokens` from `_shared/utils/tokenizer_utils.ts`, bound with real `CountTokensDeps`, runs against the real `assembleAiResponse`. No repo-owned function is mocked.
      * `[ ]`   Mocked: nothing inside the chain. The encoder the tokenizer loads is the true external edge and is used as it is in production, which is what makes the count real.
      * `[ ]`   A payload with `tokenUsage: null` and known non-empty content, over a real model config, yields `completion_tokens` equal to the real tokenizer's count for that content — a number asserted independently and unequal to the content's character length, so the case fails against a `.length` implementation and against a stubbed counter alike.
      * `[ ]`   A payload whose content is a single multi-token word proves the count is a token count rather than a word count.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared` and `dialectic-service` and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: the two foreign files this node edits gain declarations only — `_shared/types/tokenizer.types.ts` gains a type and `_shared/utils/type-guards/type_guards.dialectic.ts` gains a guard — and neither imports this module.

   * `[ ]`   `requirements`
      * `[ ]`   `AssembleAiResponseDeps` declares exactly `countTokens`, and timing, preflight and model config are params — interface test.
      * `[ ]`   `AssembleAiResponsePayload` declares exactly `assembledContent`, `tokenUsage` and `finishReason` — interface test.
      * `[ ]`   The return union has exactly two arms and the error member admits both owned error types — interface test.
      * `[ ]`   `BoundCountTokensFn` takes the payload and the model config and returns a number — interface test.
      * `[ ]`   `isUnifiedAIResponse` accepts a response carrying only `content` and rejects one with `content` absent — guard test.
      * `[ ]`   `isAssembleAiResponsePayload` accepts both declared null states and rejects a corrupted `tokenUsage` — guard test.
      * `[ ]`   The two owned error guards each reject the other's instance — guard test.
      * `[ ]`   A synthesized usage's `completion_tokens` is the injected counter's return, over content whose character length differs from it — unit test.
      * `[ ]`   A synthesized usage's `prompt_tokens` is the params' `preflightInputTokens` and `total_tokens` is the sum — unit test.
      * `[ ]`   A reported usage is passed through and the counter is not invoked — unit test.
      * `[ ]`   Whitespace-only content yields a `null` content and a `null` usage with no counter call — unit test.
      * `[ ]`   The assembled `processingTimeMs` is the params' value — unit test.
      * `[ ]`   A `null` reason resolves to `'unknown'`, a recognized reason passes through, and an unrecognized reason returns the error arm with no counter call — unit test.
      * `[ ]`   A throwing counter returns the error arm carrying the config's identifier and the stringified thrown value, for both the `Error` and non-`Error` forms — unit test.
      * `[ ]`   The real tokenizer produces the assembled `completion_tokens`, unequal to the content's character length — integration test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[ ]`   supabase/functions/dialectic-worker/loadJobContext/loadJobContext.ts **[BE] The job and provider reads with the base-payload census, returning the job row, the provider row, the validated config and the payload identifiers the row does not carry**

   * `[ ]`   `objective`
      * `[ ]`   The context-loading block inside `saveResponse.ts` re-derives from the job payload what the job row already states, and hand-rolls validation the base guard family already performs. It reads `sessionId`, `iterationNumber` and `stageSlug` off the payload and validates each with its own `typeof` block, though `dialectic_generation_jobs` carries `session_id`, `iteration_number` and `stage_slug` as non-null columns. It reads `dialectic_sessions` and inspects nothing but the row count, asserting a foreign key the database already enforces. It derives the owner as `typeof job.user_id === "string" ? job.user_id : ""`, manufacturing an ownerless job out of a non-null column. Every one of its failures returns an untyped `Error` with `retriable: false`, so a transient driver fault is reported as permanent.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/loadJobContext/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `LoadJobContextReturn`.
         * `[ ]`   Two reads: `dialectic_generation_jobs` by the payload's job id, and `ai_providers` by the base payload's `model_id`. No session read.
         * `[ ]`   The job payload is validated by the imported throwing `isDialecticBaseJobPayload`, whose thrown diagnostic names the offending member. No member check is re-authored here.
         * `[ ]`   The success arm carries the job row whole, so `session_id`, `iteration_number`, `stage_slug`, `user_id` and `attempt_count` reach consumers as row columns and are never re-derived from the payload.
         * `[ ]`   The success arm additionally carries the provider row, the validated extended config, and the two base-payload identifiers the row does not carry — `walletId` and `projectId`.
         * `[ ]`   Every failure returns a typed error the module owns, or the base guard's diagnostic propagated unchanged, with `retriable` true for a driver fault and false for absent or invalid data.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node. Every current consumer keeps compiling.
         * `[ ]`   `output_type` is not read here. It is a member of `DialecticExecuteJobPayload`, not of the base payload, and this module serves both arms; `resolveContributionIdentity` narrows the EXECUTE arm and resolves it.
         * `[ ]`   The row's `job_type` is not read here. Selecting an arm is the orchestrator's branch, and this module's work is identical for every arm.
         * `[ ]`   The module emits no log line and holds no logger.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer read: given a job id, produce the rows and identifiers every branch of the response path needs, proven valid once so no consumer re-proves them.
      * `[ ]`   The role is correct because everything it does is resolve identity — it decides nothing, writes nothing, and its output is the shared front half's entire input.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not narrow the payload to an arm, and do not read a member that belongs to one.
         * `[ ]`   Do not read the wallet, debit anything, or touch `dialectic_sessions`.
         * `[ ]`   Do not re-derive from the payload any fact the job row carries as a column.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/loadJobContext` — the resolution of one job id into the rows and identifiers its response path needs.
      * `[ ]`   Inside boundary:
         * `[ ]`   The two reads, the base-payload census, the provider validations, and the outcomes the two arms carry.
         * `[ ]`   `LoadJobContextDeps`, `LoadJobContextParams`, `LoadJobContextPayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DialecticJobRow`, `AiProvidersRow` and `DialecticBaseJobPayload`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `AiModelExtendedConfig`, owned by `_shared/types.ts`; `Database`, owned by `types_db.ts`.
         * `[ ]`   Which arm the job belongs to, and what any consumer does with the resolved context.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `AiProvidersRow`, `DialecticBaseJobPayload`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the two rows this module returns and the payload shape the base guard narrows to.
      * `[ ]`   Provider: `_shared/types.ts` (`AiModelExtendedConfig`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the validated config the success arm carries.
      * `[ ]`   Provider: `types_db.ts` (`Database`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client.
      * `[ ]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[ ]`   Layer classification: shared test fixture surface for the database boundary.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the injected client in every params fixture and the per-case configuration of both table reads.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of the job row.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the job row fixture in every case and in the success-return builder.
      * `[ ]`   Provider: `_shared/ai_service/ai_provider.mock.ts` (`buildMockProvider`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of the provider row.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the provider row fixture. This is the repo's existing builder for that row and is used as it stands; a second builder beside it would be duplication. A case needing an invalid provider row rest-destructures a required member off its output rather than casting.
      * `[ ]`   Confirm:
         * `[ ]`   `LoadJobContextDeps` declares no member. No branch of the contract invokes a collaborator: both reads go through the per-invocation client, and the guards are called, not injected. The object is declared and carries its full support system so a later collaborator is added to a shape that already exists.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From the hub: the `DialecticJobRow`, `AiProvidersRow` and `DialecticBaseJobPayload` types only, imported with `import type`.
         * `[ ]`   From `_shared/types.ts`: the `AiModelExtendedConfig` type only, imported with `import type`.
         * `[ ]`   From `types_db.ts`: the `Database` type only, imported with `import type`.

   * `[ ]`   `loadJobContext.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts `Parameters<LoadJobContextFn>[0]` has no required key, proving the deps object is declared and empty rather than absent from the signature.
      * `[ ]`   A case asserts the required key surface of `Parameters<LoadJobContextFn>[1]` is exactly `dbClient`.
      * `[ ]`   A case asserts the required key surface of `Parameters<LoadJobContextFn>[2]` is exactly `jobId`, proving the identifier the function operates on is the payload and the client is not.
      * `[ ]`   A case asserts the required key surface of `LoadJobContextSuccessReturn` is exactly `job`, `providerRow`, `modelConfig`, `walletId` and `projectId` — exhaustive in both directions, so a member re-derived downstream cannot be quietly omitted here and a row column cannot be duplicated into it.
      * `[ ]`   A case asserts the required key surface of `LoadJobContextErrorReturn` is exactly `error` and `retriable`.
      * `[ ]`   A case assigns a `LoadJobContextSuccessReturn`-typed value to `LoadJobContextReturn` and a case assigns a `LoadJobContextErrorReturn`-typed value to it, proving the union has exactly the two arms.
      * `[ ]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<LoadJobContextReturn>` to `LoadJobContextFn`, proving the signature is asynchronous.

   * `[ ]`   `loadJobContext.interface.ts`
      * `[ ]`   `export interface LoadJobContextDeps {}` — declared with no member. Every slot of the signature is supplied whether or not this function uses it today.
      * `[ ]`   `export interface LoadJobContextParams { dbClient: SupabaseClient<Database>; }`
      * `[ ]`   `export interface LoadJobContextPayload { jobId: string; }` — the identifier the function resolves. It reaches this module already narrowed by the orchestrator's boundary guard, so the trusted form applies and the parameter is not `unknown`.
      * `[ ]`   `export type LoadJobContextSuccessReturn = { job: DialecticJobRow; providerRow: AiProvidersRow; modelConfig: AiModelExtendedConfig; walletId: string; projectId: string };` — the row is carried whole, so `session_id`, `iteration_number`, `stage_slug`, `user_id` and `attempt_count` are read off it and are not restated as members. `walletId` and `projectId` are members because the row does not carry them.
      * `[ ]`   `export type LoadJobContextErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because one of its inhabitants is the base guard's thrown diagnostic, which is propagated unchanged; every other inhabitant is an owned class extending `Error`, and consumers discriminate by the guards below.
      * `[ ]`   `export type LoadJobContextReturn = LoadJobContextSuccessReturn | LoadJobContextErrorReturn;` — exactly two arms.
      * `[ ]`   `export type LoadJobContextFn = (deps: LoadJobContextDeps, params: LoadJobContextParams, payload: LoadJobContextPayload) => Promise<LoadJobContextReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `LoadJobContextJobReadError { jobId; driverMessage }`, `LoadJobContextJobNotFoundError { jobId }`, `LoadJobContextProviderReadError { modelId; driverMessage }`, `LoadJobContextProviderNotFoundError { modelId }`, `LoadJobContextProviderInvalidError { modelId }`, `LoadJobContextConfigInvalidError { modelId }`.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `loadJobContext.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Job read: `params.dbClient.from('dialectic_generation_jobs').select('*').eq('id', payload.jobId)`.
      * `[ ]`   Branch, condition the job read returned a driver error: return the error arm carrying `LoadJobContextJobReadError` built from `payload.jobId` and the driver's message, with `retriable: true` — a read the database refused now can succeed on a later attempt. Nothing below runs.
      * `[ ]`   Branch, condition the job read returned no row: return the error arm carrying `LoadJobContextJobNotFoundError` built from `payload.jobId`, with `retriable: false`.
      * `[ ]`   Census: call the imported `isDialecticBaseJobPayload` on the first row's `payload` inside a `try`. It throws a per-member diagnostic rather than returning `false`, and it is the single source of truth for base-member validity; no member check is written here.
      * `[ ]`   Branch, condition the census threw: return the error arm carrying that thrown `Error` unchanged, with `retriable: false`. The catch binding is `unknown`; a thrown `Error` is propagated as-is, and a thrown non-`Error` is a defect in the guard family rather than a state this module models, so it is rethrown.
      * `[ ]`   Provider read: `params.dbClient.from('ai_providers').select('*').eq('id', <the narrowed payload's model_id>)`.
      * `[ ]`   Branch, condition the provider read returned a driver error: return the error arm carrying `LoadJobContextProviderReadError` built from that `model_id` and the driver's message, with `retriable: true`.
      * `[ ]`   Branch, condition the provider read returned no row: return the error arm carrying `LoadJobContextProviderNotFoundError` built from that `model_id`, with `retriable: false`.
      * `[ ]`   Branch, condition the first provider row fails the imported `isSelectedAiProvider`: return the error arm carrying `LoadJobContextProviderInvalidError` built from that `model_id`, with `retriable: false`.
      * `[ ]`   Branch, condition the provider row's `config` fails the imported `isAiModelExtendedConfig`: return the error arm carrying `LoadJobContextConfigInvalidError` built from that `model_id`, with `retriable: false`.
      * `[ ]`   Success: return the success arm carrying the job row, the provider row, the narrowed `config`, and `walletId` and `projectId` from the narrowed base payload.
      * `[ ]`   Ordering and side effects: the job read precedes the census, which precedes the provider read, because each supplies the next; exactly two reads on the success path and at most two on any path; no row is written; nothing is logged; neither `params` nor `payload` is mutated.

   * `[ ]`   `loadJobContext.mock.ts`
      * `[ ]`   `LoadJobContextDepsOverrides`, `buildLoadJobContextDeps`, `LoadJobContextDepsCorruptions` and `invalidateLoadJobContextDeps`; the builder returns the empty object the type declares.
      * `[ ]`   `LoadJobContextParamsOverrides`, `buildLoadJobContextParams`, `LoadJobContextParamsCorruptions` and `invalidateLoadJobContextParams`; the builder's base client is `createMockSupabaseClient(undefined, {})`.
      * `[ ]`   `LoadJobContextPayloadOverrides`, `buildLoadJobContextPayload`, `LoadJobContextPayloadCorruptions` and `invalidateLoadJobContextPayload`; the builder's base `jobId` is the id `buildDialecticJobRow()` carries, so the fixture is internally consistent.
      * `[ ]`   The four symbols for each of `LoadJobContextSuccessReturn` and `LoadJobContextErrorReturn`; the success builder composes `buildDialecticJobRow()` and `buildMockProvider()` rather than restating either row's defaults, and the error builder composes `buildLoadJobContextJobNotFoundError()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a `buildLoadJobContext…Error(overrides?)` per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance; corruption belongs to the constructor params.
      * `[ ]`   `mockLoadJobContext: LoadJobContextFn` returning `buildLoadJobContextSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `DialecticJobRow`, `AiProvidersRow` or `AiModelExtendedConfig` is written here; all three are imported types whose fixtures live in their home packages.

   * `[ ]`   `loadJobContext.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isLoadJobContextDeps`: accepts the built deps; rejects `null`, `undefined`, a primitive and an array. The type declares no member, so a record root is the whole check and the cases prove it rejects a non-record rather than accepting anything.
      * `[ ]`   `isLoadJobContextParams`: accepts the built params; rejects `dbClient` absent and a string; rejects a non-record root.
      * `[ ]`   `isLoadJobContextPayload`: accepts the built payload; rejects `jobId` absent, non-string, the empty string and a whitespace-only string; rejects a non-record root.
      * `[ ]`   `isLoadJobContextSuccessReturn`: accepts the built return; rejects `job` set to `invalidateDialecticJobRow({ id: 42 })`, the case proving the row is checked through its owner's guard; rejects `providerRow` set to the builder's output with a required member rest-destructured away; rejects `modelConfig` absent and a plain object failing its owner's guard; rejects each of `walletId` and `projectId` absent, non-string and empty; rejects a non-record root.
      * `[ ]`   `isLoadJobContextErrorReturn`: accepts the built return; accepts one whose `error` is a plain `Error`, the member being typed `Error` so a propagated census diagnostic is admitted; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance; each rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[ ]`   `loadJobContext.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isLoadJobContextDeps`, `isLoadJobContextParams`, `isLoadJobContextPayload`, `isLoadJobContextSuccessReturn`, `isLoadJobContextErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isLoadJobContextDeps` requires a record root and nothing further, which is the complete check for a type declaring no member.
      * `[ ]`   `isLoadJobContextParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own, so the check is presence, not shape.
      * `[ ]`   `isLoadJobContextPayload` requires `jobId` a string that is non-empty after trim.
      * `[ ]`   `isLoadJobContextSuccessReturn` calls `isDialecticJobRow` on `job`, the imported `isSelectedAiProvider` on `providerRow` and the imported `isAiModelExtendedConfig` on `modelConfig`, and requires `walletId` and `projectId` to be strings non-empty after trim.
      * `[ ]`   `isLoadJobContextErrorReturn` requires `error` to be `instanceof Error` and `retriable` to be a boolean.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more. The constructor is each type's only producer, so membership is nominal.
      * `[ ]`   No guard is written here for `DialecticJobRow`, `AiProvidersRow`, `AiModelExtendedConfig`, `DialecticBaseJobPayload` or `Database`; none is owned by this interface, and each already has a guard in its owner's file.

   * `[ ]`   `loadJobContext.test.ts`
      * `[ ]`   Params fixtures are `buildLoadJobContextParams({ dbClient })` where `dbClient` comes from `createMockSupabaseClient` configured for the `dialectic_generation_jobs` and `ai_providers` reads the case turns on; deps fixtures are `buildLoadJobContextDeps()`; payload fixtures are `buildLoadJobContextPayload({ … })`.
      * `[ ]`   Success surface: a client configured with a job row and a valid provider row returns the success arm whose `job` is the configured row, whose `providerRow` is the configured provider, whose `modelConfig` is that provider's `config`, and whose `walletId` and `projectId` are the payload's — each asserted as an independent value, and the job row's `session_id`, `iteration_number` and `stage_slug` asserted reachable off the returned row.
      * `[ ]`   The provider is read by the payload's `model_id`: the job row is built with a payload whose `model_id` differs from every other identifier in the arrangement, and the recorded `ai_providers` filter is that value.
      * `[ ]`   Job read failed: a `dialectic_generation_jobs` read returning a driver error returns the error arm whose error passes `isLoadJobContextJobReadError`, carries the payload's `jobId` and the driver's message, and whose `retriable` is `true`; the `ai_providers` read never happened.
      * `[ ]`   Job absent: a read returning no rows returns the error arm whose error passes `isLoadJobContextJobNotFoundError` with `retriable` `false`.
      * `[ ]`   Census failed: a job row whose payload omits `walletId` returns the error arm carrying the `Error` `isDialecticBaseJobPayload` threw, its message unchanged from the guard's own diagnostic, with `retriable` `false`; the `ai_providers` read never happened.
      * `[ ]`   Provider read failed: an `ai_providers` read returning a driver error returns the error arm whose error passes `isLoadJobContextProviderReadError` with `retriable` `true`.
      * `[ ]`   Provider absent: an `ai_providers` read returning no rows returns the error arm whose error passes `isLoadJobContextProviderNotFoundError` with `retriable` `false`.
      * `[ ]`   Provider invalid: a provider row missing a member `isSelectedAiProvider` requires returns the error arm whose error passes `isLoadJobContextProviderInvalidError` with `retriable` `false`.
      * `[ ]`   Config invalid: a provider row whose `config` fails `isAiModelExtendedConfig` returns the error arm whose error passes `isLoadJobContextConfigInvalidError` with `retriable` `false`.
      * `[ ]`   No session read: every case asserts the recorded reads are `dialectic_generation_jobs` and `ai_providers` only, so a reintroduced `dialectic_sessions` round trip fails the suite.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's consumer switches; this node constructs nothing at a boundary.

   * `[ ]`   `loadJobContext.ts`
      * `[ ]`   One exported function, typed `LoadJobContextFn`, implementing the interaction spec in its stated order: job read, job branches, census, provider read, provider branches, success.
      * `[ ]`   The narrowed base payload and each constructed error are held in typed locals; nothing is inferred and nothing is widened at its use site.
      * `[ ]`   The census call is wrapped in `try`/`catch`, the catch binds `unknown`, and a caught `Error` is returned unchanged while a non-`Error` is rethrown.
      * `[ ]`   Every return is one of the two arms; no path falls through, no default value substitutes for a missing input, and no failure is logged instead of returned.

   * `[ ]`   `loadJobContext.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and the return guards — through one import point.

   * `[ ]`   `loadJobContext.integration.test.ts`
      * `[ ]`   Boundary: the Supabase client. The real `loadJobContext` runs against the real `isDialecticBaseJobPayload`, `isSelectedAiProvider` and `isAiModelExtendedConfig`; no repo-owned function is mocked.
      * `[ ]`   Mocked: the database client only, so this test does not prove the tables exist or that the rows satisfy their constraints — it proves the chain from a returned row through the real guard family to the resolved context.
      * `[ ]`   A job row whose payload satisfies the real base guard, plus a provider row whose `config` satisfies the real config guard, yields the success arm with every member resolved.
      * `[ ]`   A job row whose payload violates one base member yields the error arm carrying the real guard's own diagnostic, proving the message reaching a consumer is the guard's and not one this module composed.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: no file outside this module is edited by this node.

   * `[ ]`   `requirements`
      * `[ ]`   `LoadJobContextParams` declares exactly `dbClient` and `LoadJobContextPayload` exactly `jobId` — interface test.
      * `[ ]`   `LoadJobContextDeps` is declared and has no required key — interface test.
      * `[ ]`   `LoadJobContextSuccessReturn` declares exactly `job`, `providerRow`, `modelConfig`, `walletId` and `projectId`, and the union has exactly two arms — interface test.
      * `[ ]`   `isLoadJobContextSuccessReturn` rejects a corrupted job row, an incomplete provider row and an invalid config — guard test.
      * `[ ]`   `isLoadJobContextErrorReturn` admits a plain `Error`, so a propagated census diagnostic is a valid error arm — guard test.
      * `[ ]`   A resolved context carries the configured job row, provider row and config, and the payload's `walletId` and `projectId` — unit test.
      * `[ ]`   The `ai_providers` read filters on the base payload's `model_id` — unit test.
      * `[ ]`   Each of the two driver faults returns its own typed error with `retriable` true, and each absence and each invalid narrowing returns its own typed error with `retriable` false — unit test.
      * `[ ]`   A payload failing the base guard returns that guard's thrown diagnostic unchanged, and no provider read occurs — unit test.
      * `[ ]`   Only `dialectic_generation_jobs` and `ai_providers` are read on every path — unit test.
      * `[ ]`   The real base guard's diagnostic is what reaches the error arm — integration test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[ ]`   supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.ts **[BE] The retry conditions, the sanitize → parse sequence, and the repo's only `determineContinuation` call — supplying `sourceObject`, and passing a text-mode response through unparsed**

   * `[ ]`   `objective`
      * `[ ]`   The content-preparation block inside `saveResponse.ts` reports a scheduled retry as a completed job. Each of its four retry conditions calls `retryJob` and then returns `{ status: 'completed' }`, so the one outcome a caller must act on is indistinguishable from success. It reads `continueUntilComplete`, `document_key` and `context_for_documents` off the untyped job payload behind `isRecord` probes, defaulting each through a ternary. And it calls `determineContinuation` without `sourceObject` — a required member of that function's params — so JSON-mode compression output is never verified against the source it was sent, and the call site does not type-check.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/prepareResponseContent/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `PrepareResponseContentReturn`.
         * `[ ]`   Every retry condition resolves to one retry-required success flavor carrying that condition's reason and no content members. The module calls no retry dispatcher and holds no notification service; the orchestrator builds the `FailedAttemptError[]` around the reason and dispatches.
         * `[ ]`   `continueUntilComplete`, `documentKey`, `contextForDocuments` and `sourceObject` arrive as params from an orchestrator that has narrowed the job's arm. The module performs no payload probe and holds no default for any of them.
         * `[ ]`   The `determineContinuation` call carries all seven members its params declare, `sourceObject` included, which is what makes a JSON-mode compression response verify against the source object it was sent and return through the ordinary continuation path when keys are missing.
         * `[ ]`   A response that is not parsed — an intermediate continuation chunk, or a text-mode source — resolves `shouldContinue` from the finish reason alone and passes its content through unchanged. Freeform text carries no structure to verify against, and the finish-reason gate still applies so an unfinished text compression resumes rather than persisting truncated.
         * `[ ]`   A parsed response resolves `shouldContinue` from the full `determineContinuation` verdict.
         * `[ ]`   The module owns `PrepareResponseContentSanitizeError` and `PrepareResponseContentContinuationError` for a collaborator that throws.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node.
         * `[ ]`   The four retry reason strings are preserved verbatim as the reason the flavor carries: `AI response was empty.`, `AI provider signaled error via finish_reason.`, `Invalid JSON sanitization result`, and `Malformed JSON response: ${message}`.
         * `[ ]`   All four log lines are preserved verbatim, including their `[saveResponse]` prefix and their structured second arguments.
         * `[ ]`   The module writes no row, sends no notification, and reads nothing.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is a domain-layer decision: given an assembled response, decide whether it is usable, what content should be stored, and whether the job is complete.
      * `[ ]`   The role is correct because this is the repo's only completeness decision — `continueJob` spawns a successor once someone has decided, `saveCompressedResponse` consumes the verdict, and `finalizeContributionJob` dispatches on it. Deciding is this module's whole purpose and no other module's.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not dispatch a retry, mutate a job row, or send a notification. A retry condition is an outcome this module reports.
         * `[ ]`   Do not narrow a job payload or select an arm; the orchestrator has narrowed before calling, which is how the arm-specific params arrive.
         * `[ ]`   Do not persist content, resolve identity, or decide what a continuation does.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/prepareResponseContent` — usability, storable content, and completeness for one assembled response.
      * `[ ]`   Inside boundary:
         * `[ ]`   The four retry conditions and their reasons, the two unparsed routes, the sanitize → parse sequence, and which `shouldContinue` each route produces.
         * `[ ]`   `PrepareResponseContentDeps`, `PrepareResponseContentParams`, `PrepareResponseContentPayload`, both success flavors, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `UnifiedAIResponse`, owned by `dialectic-service/dialectic.interface.ts`; `ContextForDocument`, owned there too.
         * `[ ]`   `FinishReason`, owned by `_shared/types.ts`; `CompressionMode`, owned by `_shared/types/file_manager.types.ts`.
         * `[ ]`   `DetermineContinuationParams`, `JsonSanitizationResult` and every collaborator's own contract.
         * `[ ]`   Which arm the job is on, where the params came from, and what any consumer does with the verdict.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/types.ts` (`ILogger`, `FinishReason`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the four log lines this module emits, and the resolved finish reason it branches on.
      * `[ ]`   Provider: `dialectic-worker/createJobContext/JobContext.interface.ts` (`ResolveFinishReasonFn`, `IsIntermediateChunkFn`, `SanitizeJsonContentFn`, `DetermineContinuationFn`).
         * `[ ]`   Layer classification: sibling app-layer contract file, the declared home of all four collaborator function types.
         * `[ ]`   Direction: inbound; these are the types the worker's context already declares for the same four functions.
         * `[ ]`   Purpose: type the four injected collaborators the branch contract invokes.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`UnifiedAIResponse`, `ContextForDocument`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the response this module operates on and the document context `determineContinuation` matches against.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`CompressionMode`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the mode that decides whether the content is parsed at all.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of the payload's type.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the payload fixture in every case.
      * `[ ]`   Provider: `_shared/logger.mock.ts` (`MockLogger`).
         * `[ ]`   Layer classification: shared test fixture surface.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the deps fixture's logger member.
      * `[ ]`   Confirm:
         * `[ ]`   `PrepareResponseContentDeps` declares exactly `logger`, `resolveFinishReason`, `isIntermediateChunk`, `sanitizeJsonContent` and `determineContinuation` — the five collaborators the branch contract invokes. It declares no `retryJob` and no `notificationService`: once a retry condition is a returned flavor, no branch invokes either.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From `_shared/types.ts`: the `ILogger` and `FinishReason` types only, imported with `import type`.
         * `[ ]`   From the job-context contract file: the four collaborator function types only, imported with `import type`.
         * `[ ]`   From the hub: the `UnifiedAIResponse` and `ContextForDocument` types only, imported with `import type`.
         * `[ ]`   From the file-manager types: the `CompressionMode` type only, imported with `import type`.

   * `[ ]`   `prepareResponseContent.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts the required key surface of `Parameters<PrepareResponseContentFn>[0]` is exactly `logger`, `resolveFinishReason`, `isIntermediateChunk`, `sanitizeJsonContent` and `determineContinuation` — exhaustive in both directions, it is the proof `retryJob` and `notificationService` are not deps of this module.
      * `[ ]`   A case asserts the required key surface of `Parameters<PrepareResponseContentFn>[1]` is exactly `jobId`, `mode`, `continueUntilComplete`, `documentKey`, `contextForDocuments` and `sourceObject`.
      * `[ ]`   A case asserts the required key surface of `Parameters<PrepareResponseContentFn>[2]` is exactly `aiResponse`.
      * `[ ]`   A case asserts the required key surface of `PrepareResponseContentRetryRequiredReturn` is exactly `retryRequired` and `reason`, proving the retry flavor carries no content member.
      * `[ ]`   A case asserts the required key surface of `PrepareResponseContentPreparedReturn` is exactly `retryRequired`, `contentForStorage`, `shouldContinue`, `resolvedFinishReason` and `isIntermediate`.
      * `[ ]`   Two cases prove flavor membership by typed assignment: each success flavor is assignable to `PrepareResponseContentSuccessReturn`, and that is assignable to `PrepareResponseContentReturn`.
      * `[ ]`   A case assigns a `PrepareResponseContentErrorReturn`-typed value to `PrepareResponseContentReturn`, proving the union has exactly the two arms.
      * `[ ]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => PrepareResponseContentReturn` to `PrepareResponseContentFn`, proving the signature is synchronous — every collaborator it calls is synchronous and it performs no IO.

   * `[ ]`   `prepareResponseContent.interface.ts`
      * `[ ]`   `export interface PrepareResponseContentDeps { logger: ILogger; resolveFinishReason: ResolveFinishReasonFn; isIntermediateChunk: IsIntermediateChunkFn; sanitizeJsonContent: SanitizeJsonContentFn; determineContinuation: DetermineContinuationFn; }`
      * `[ ]`   `export interface PrepareResponseContentParams { jobId: string; mode: CompressionMode; continueUntilComplete: boolean; documentKey: string | undefined; contextForDocuments: ContextForDocument[] | undefined; sourceObject: unknown; }` — `documentKey` and `contextForDocuments` take the same declared forms `DetermineContinuationParams` gives them, and `sourceObject` the same `unknown`, so this module relays what it was handed and widens nothing at a use site. `mode` is `'json'` for an EXECUTE job and the compress payload's own mode for a COMPRESS job; the orchestrator resolves it when it narrows the arm.
      * `[ ]`   `export interface PrepareResponseContentPayload { aiResponse: UnifiedAIResponse; }` — the assembled response this module operates on, produced in-TS by `assembleAiResponse`, so the trusted form applies and the parameter is not `unknown`.
      * `[ ]`   `export type PrepareResponseContentRetryRequiredReturn = { retryRequired: true; reason: string };` — the one retry flavor, carrying the condition's reason and no content members.
      * `[ ]`   `export type PrepareResponseContentPreparedReturn = { retryRequired: false; contentForStorage: string; shouldContinue: boolean; resolvedFinishReason: FinishReason; isIntermediate: boolean };` — the finish reason and the intermediate answer are carried because this module owns the two collaborators that produce them, `resolveFinishReason` and `isIntermediateChunk`, and `finalizeContributionJob` branches on both. A consumer that re-derived them would need those collaborators injected a second time.
      * `[ ]`   `export type PrepareResponseContentSuccessReturn = PrepareResponseContentRetryRequiredReturn | PrepareResponseContentPreparedReturn;`
      * `[ ]`   `export type PrepareResponseContentErrorReturn = { error: PrepareResponseContentSanitizeError | PrepareResponseContentContinuationError; retriable: boolean };` — the error member's union is declared here, in the owning interface, and is never composed at a use site.
      * `[ ]`   `export type PrepareResponseContentReturn = PrepareResponseContentSuccessReturn | PrepareResponseContentErrorReturn;` — exactly two arms, the flavors nested inside the success arm.
      * `[ ]`   `export type PrepareResponseContentFn = (deps: PrepareResponseContentDeps, params: PrepareResponseContentParams, payload: PrepareResponseContentPayload) => PrepareResponseContentReturn;`
      * `[ ]`   `export interface PrepareResponseContentSanitizeErrorConstructorParams { jobId: string; thrownValue: string; }` and `export interface PrepareResponseContentContinuationErrorConstructorParams { jobId: string; thrownValue: string; }`, each with its class extending `Error`, taking that one params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from the two.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `prepareResponseContent.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Branch, condition `payload.aiResponse.error` is truthy or `payload.aiResponse.content` is absent, `null` or empty: return the retry-required flavor whose reason is `payload.aiResponse.error` when present and `AI response was empty.` otherwise. No collaborator is called and nothing below runs.
      * `[ ]`   Finish reason: `deps.resolveFinishReason(payload.aiResponse)`.
      * `[ ]`   Branch, condition the resolved reason is `'error'`: return the retry-required flavor whose reason is `AI provider signaled error via finish_reason.`
      * `[ ]`   Route selection: `deps.isIntermediateChunk(resolvedFinish, params.continueUntilComplete)` answers whether this is a mid-stream chunk, and `params.mode === 'text'` answers whether the content is structured at all. Either one takes the unparsed route; only a non-intermediate JSON-mode response is parsed.
      * `[ ]`   Branch, unparsed route: emit the existing skip line `[saveResponse] Skipping sanitize/parse for intermediate continuation chunk (finish_reason: ${resolvedFinish})` with `{ jobId: params.jobId }`; the content for storage is the response's content unchanged; `shouldContinue` is `isDialecticContinueReason(resolvedFinish)` — the finish-reason trigger standing alone, because unparsed content offers nothing for the remaining triggers to inspect. Return the prepared flavor. `determineContinuation` is not called.
      * `[ ]`   Parsed route, sanitize: `deps.sanitizeJsonContent(payload.aiResponse.content)` inside a `try`. A throw returns the error arm carrying `PrepareResponseContentSanitizeError` built from `params.jobId` and the stringified thrown value, with `retriable: false`.
      * `[ ]`   Branch, condition the sanitizer's result fails `isJsonSanitizationResult`: emit the existing warn line `[saveResponse] Invalid sanitization result for job ${params.jobId}. Triggering retry.` and return the retry-required flavor whose reason is `Invalid JSON sanitization result`.
      * `[ ]`   Branch, condition the result's `wasSanitized` is true: emit the existing info line `[saveResponse] JSON content sanitized for job ${params.jobId}` with `originalLength`, `sanitizedLength` and `wasStructurallyFixed`. This is a log, not a route — the parse proceeds.
      * `[ ]`   Branch, condition `JSON.parse` of the sanitized string throws: emit the existing warn line `[saveResponse] Malformed JSON response for job ${params.jobId} after sanitization. Triggering retry.` with the thrown message, and return the retry-required flavor whose reason is `Malformed JSON response: ${message}`. The catch binds `unknown` and stringifies a non-`Error` for both the line and the reason, exactly as the source composes them.
      * `[ ]`   Parsed route, continuation: `deps.determineContinuation` with all seven members — `finishReasonContinue` from `isDialecticContinueReason(resolvedFinish)`, `wasStructurallyFixed` from the sanitizer result, `parsedContent` from the parse, `continueUntilComplete`, `documentKey`, `contextForDocuments` and `sourceObject` each relayed from params unchanged. Inside a `try`; a throw returns the error arm carrying `PrepareResponseContentContinuationError` built from `params.jobId` and the stringified thrown value, with `retriable: false`.
      * `[ ]`   Parsed route, outcome: the content for storage is the sanitizer's `sanitized` string and `shouldContinue` is the returned verdict. Return the prepared flavor.
      * `[ ]`   Both prepared returns carry the same two answers this module already computed: `resolvedFinishReason` is the value `deps.resolveFinishReason` returned, and `isIntermediate` is the value `deps.isIntermediateChunk` returned. Neither is recomputed at the return site and neither differs between the two routes.
      * `[ ]`   Ordering and side effects: the two retry conditions ahead of the route selection return before any sanitizer call; `sanitizeJsonContent` and `determineContinuation` are each invoked at most once and never on the unparsed route; no row is written; nothing is read; neither `params` nor `payload` is mutated.

   * `[ ]`   `prepareResponseContent.mock.ts`
      * `[ ]`   `PrepareResponseContentDepsOverrides`, `buildPrepareResponseContentDeps`, `PrepareResponseContentDepsCorruptions` and `invalidatePrepareResponseContentDeps`; the builder's base composes `new MockLogger()` and, for each of the four collaborators, a production-typed function returning a fixed value distinct from every other value in the fixture, so a case that depends on one has to override it.
      * `[ ]`   `PrepareResponseContentParamsOverrides`, `buildPrepareResponseContentParams`, `PrepareResponseContentParamsCorruptions` and `invalidatePrepareResponseContentParams`; the builder's base `mode` is `'json'`, its `continueUntilComplete` is `false`, and its `documentKey`, `contextForDocuments` and `sourceObject` are `undefined`, those being the declared absent states.
      * `[ ]`   `PrepareResponseContentPayloadOverrides`, `buildPrepareResponseContentPayload`, `PrepareResponseContentPayloadCorruptions` and `invalidatePrepareResponseContentPayload`; the builder's base composes `buildUnifiedAIResponse()` rather than restating that type's defaults.
      * `[ ]`   The four symbols for each of `PrepareResponseContentRetryRequiredReturn`, `PrepareResponseContentPreparedReturn` and `PrepareResponseContentErrorReturn`; the error builder composes `buildPrepareResponseContentSanitizeError()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for either instance.
      * `[ ]`   `mockPrepareResponseContent: PrepareResponseContentFn` returning `buildPrepareResponseContentPreparedReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `UnifiedAIResponse`, `ContextForDocument` or `JsonSanitizationResult` is written here; all are imported types whose fixtures live in their home packages.

   * `[ ]`   `prepareResponseContent.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isPrepareResponseContentDeps`: accepts the built deps; rejects each of the five members absent and non-function, `logger` absent and non-object; rejects a non-record root.
      * `[ ]`   `isPrepareResponseContentParams`: accepts the built params; accepts `documentKey`, `contextForDocuments` and `sourceObject` each `undefined`, those being declared absent states; rejects `jobId` absent, non-string and empty; rejects `mode` absent and outside `CompressionMode`; rejects `continueUntilComplete` absent and non-boolean; rejects `documentKey` a number; rejects `contextForDocuments` a non-array and an array containing that type's invalidator output; rejects a non-record root.
      * `[ ]`   `isPrepareResponseContentPayload`: accepts the built payload; rejects `aiResponse` absent and set to `invalidateUnifiedAIResponse({ content: 42 })`, the case proving the response is checked through its owner's guard; rejects a non-record root.
      * `[ ]`   `isPrepareResponseContentRetryRequiredReturn`: accepts its own flavor; rejects `retryRequired` absent or not exactly `true`; rejects `reason` absent, non-string and empty; rejects the prepared flavor; rejects a non-record root.
      * `[ ]`   `isPrepareResponseContentPreparedReturn`: accepts its own flavor; rejects `retryRequired` not exactly `false`; rejects `contentForStorage` absent and non-string; rejects `shouldContinue` absent and non-boolean; rejects `resolvedFinishReason` absent, outside `FinishReason` and `null`, the last case being what the finish-reason guard admits and this member does not; rejects `isIntermediate` absent and non-boolean; rejects the retry-required flavor; rejects a non-record root.
      * `[ ]`   `isPrepareResponseContentErrorReturn`: accepts the built error return, and accepts one whose `error` is the continuation error, proving both members of the declared union are admitted; rejects `error` absent, a plain object and a plain `Error` that is neither owned class; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, the other owned error, `null` and a primitive.

   * `[ ]`   `prepareResponseContent.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isPrepareResponseContentDeps`, `isPrepareResponseContentParams`, `isPrepareResponseContentPayload`, `isPrepareResponseContentRetryRequiredReturn`, `isPrepareResponseContentPreparedReturn`, `isPrepareResponseContentErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isPrepareResponseContentDeps` is a presence-of-method check, the deps being a behavior type: `logger` a record and each of the four collaborators a function.
      * `[ ]`   `isPrepareResponseContentParams` requires `jobId` a string non-empty after trim, `mode` passing the imported `CompressionMode` guard, `continueUntilComplete` a boolean, `documentKey` either `undefined` or a string, `contextForDocuments` either `undefined` or an array every element of which passes the imported `isContextForDocument`, and `sourceObject` present as a key — the member is declared `unknown`, so its presence is the whole check and any value satisfies it.
      * `[ ]`   `isPrepareResponseContentPayload` calls the imported `isUnifiedAIResponse` on `aiResponse`, the guard the `assembleAiResponse` node lands in that type's owning guard file.
      * `[ ]`   `isPrepareResponseContentRetryRequiredReturn` requires `retryRequired` exactly `true` and `reason` a non-empty string; `isPrepareResponseContentPreparedReturn` requires `retryRequired` exactly `false`, `contentForStorage` a string, `shouldContinue` and `isIntermediate` booleans, and `resolvedFinishReason` passing the imported `isFinishReason` while not being `null` — that guard admits `null`, which `FinishReason` does not contain, so the null case is excluded here rather than trusted to it. The two flavors are mutually exclusive, so a value passes exactly one.
      * `[ ]`   `isPrepareResponseContentErrorReturn` requires `error` to pass either owned error guard and `retriable` to be a boolean.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   No guard is written here for `UnifiedAIResponse`, `ContextForDocument`, `CompressionMode`, `FinishReason` or any collaborator's types; none is owned by this interface.

   * `[ ]`   `prepareResponseContent.test.ts`
      * `[ ]`   Deps fixtures are `buildPrepareResponseContentDeps({ … })`, params `buildPrepareResponseContentParams({ … })` and payload `buildPrepareResponseContentPayload({ … })`, each overriding only what its case turns on. A case needing a specific collaborator behavior declares its own production-typed function inside the test.
      * `[ ]`   Empty response: a payload whose `aiResponse.content` is `null` returns the retry-required flavor with reason `AI response was empty.`, and no collaborator is invoked — asserted on spies the test applies at the call site.
      * `[ ]`   Errored response: a payload whose `aiResponse.error` is a named string returns the retry-required flavor carrying that exact string as the reason, proving the response's own error is relayed rather than replaced by the empty-content reason. Arranged with non-empty content so the two conditions are distinguished.
      * `[ ]`   Provider-signalled error: deps whose `resolveFinishReason` returns `'error'` return the retry-required flavor with reason `AI provider signaled error via finish_reason.`, and the sanitizer is never invoked.
      * `[ ]`   Intermediate chunk: deps whose `isIntermediateChunk` returns `true` return the prepared flavor whose `contentForStorage` is the response's content unchanged, with `determineContinuation` never invoked and `shouldContinue` equal to the finish-reason trigger for the returned reason.
      * `[ ]`   The prepared flavor relays both collaborator answers: a case whose `resolveFinishReason` returns a reason distinct from the payload's own `finish_reason` and whose `isIntermediateChunk` returns `true` yields those two exact values on the return, asserted independently. Its pair, over the parsed route with `isIntermediateChunk` returning `false`, yields the mirrored values — so a return that recomputed either member, or hardcoded one, fails.
      * `[ ]`   Text mode: params built with `mode: 'text'` over a non-intermediate response take the same unparsed route — content passed through unchanged, sanitizer and `determineContinuation` never invoked. Arranged beside a `mode: 'json'` case over the identical response that does parse, so neither assertion holds if the mode were ignored.
      * `[ ]`   Text mode still honors the finish-reason gate: a text-mode response whose resolved reason is a continue reason returns `shouldContinue` true, and one whose reason is `'stop'` returns false — the proof an unfinished text compression resumes rather than persisting truncated.
      * `[ ]`   Invalid sanitizer result: deps whose `sanitizeJsonContent` returns a value failing `isJsonSanitizationResult` return the retry-required flavor with reason `Invalid JSON sanitization result`, and the warn line is emitted.
      * `[ ]`   Malformed JSON: a sanitizer result whose `sanitized` string is not parseable returns the retry-required flavor whose reason begins `Malformed JSON response: ` and carries the thrown message, and the warn line is emitted.
      * `[ ]`   `sourceObject` is relayed: a case captures the object `determineContinuation` was called with and asserts all seven members, `sourceObject` being the exact value params carried and each other member the value it was handed. The captured `sourceObject` is a record whose keys differ from the parsed content's, so a case dropping the member cannot pass.
      * `[ ]`   The verdict is the module's answer: deps whose `determineContinuation` returns `{ shouldContinue: true }` produce a prepared flavor with `shouldContinue` true even when the resolved finish reason is not a continue reason, proving the parsed route reports the full verdict rather than the finish-reason trigger alone.
      * `[ ]`   Prepared content is the sanitized string: a sanitizer returning a `sanitized` value different from the response's raw content produces a `contentForStorage` equal to the sanitized value.
      * `[ ]`   Collaborator throws: a `sanitizeJsonContent` that throws returns the error arm whose error passes `isPrepareResponseContentSanitizeError` with `retriable` false, and a `determineContinuation` that throws returns the error arm whose error passes `isPrepareResponseContentContinuationError`.
      * `[ ]`   No retry is dispatched on any path: every case asserts the deps object exposes no retry member and that no row write or notification is attempted.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its two owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's consumer switches; this node constructs nothing at a boundary.

   * `[ ]`   `prepareResponseContent.ts`
      * `[ ]`   One exported function, typed `PrepareResponseContentFn`, implementing the interaction spec in its stated order: usability branches, finish reason, route selection, unparsed route, parsed route.
      * `[ ]`   `shouldContinue` is produced once on each route and never reassigned across them; the unparsed route computes the finish-reason trigger and the parsed route takes the returned verdict.
      * `[ ]`   The sanitizer call, the `JSON.parse` and the continuation call are each wrapped in `try`/`catch` with the catch binding `unknown`, and a non-`Error` is stringified rather than coerced.
      * `[ ]`   Every return is one of the two arms and, within the success arm, exactly one named flavor; no path falls through, no default value substitutes for a missing input, and no failure is logged instead of returned.

   * `[ ]`   `prepareResponseContent.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including both owned errors and the flavor guards — through one import point.

   * `[ ]`   `prepareResponseContent.integration.test.ts`
      * `[ ]`   Boundary: the four collaborators. The real `resolveFinishReason`, `isIntermediateChunk`, `sanitizeJsonContent` and `determineContinuation` run against the real `prepareResponseContent`; no repo-owned function is mocked and nothing external participates.
      * `[ ]`   Mocked: nothing, so this test proves the chain from a raw model response to a completeness verdict and nothing about persistence.
      * `[ ]`   A JSON-mode response whose parsed content omits a key present in `sourceObject` yields a prepared flavor with `shouldContinue` true — the source-verification trigger reached through the real `determineContinuation`, which is the behavior the missing member disabled.
      * `[ ]`   A JSON-mode response whose parsed content carries every `sourceObject` key and whose finish reason is `'stop'` yields `shouldContinue` false. Arranged beside the case above so neither assertion holds if `sourceObject` were dropped from the call.
      * `[ ]`   A response requiring structural repair yields `shouldContinue` true through the real sanitizer's `wasStructurallyFixed`, proving that trigger survives the extraction.
      * `[ ]`   A text-mode response of freeform prose yields a prepared flavor whose content is the prose unchanged, with `shouldContinue` taken from the finish reason alone.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and the worker's job-context contract file, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: no file outside this module is edited by this node.

   * `[ ]`   `requirements`
      * `[ ]`   `PrepareResponseContentDeps` declares exactly its five collaborators and neither `retryJob` nor `notificationService` — interface test.
      * `[ ]`   The retry-required flavor declares exactly `retryRequired` and `reason`, and the union has exactly two arms — interface test.
      * `[ ]`   The prepared flavor declares exactly `retryRequired`, `contentForStorage`, `shouldContinue`, `resolvedFinishReason` and `isIntermediate` — interface test.
      * `[ ]`   Both prepared returns carry the finish reason and the intermediate answer this module's collaborators produced, on both routes — unit test.
      * `[ ]`   `isPrepareResponseContentParams` accepts `documentKey`, `contextForDocuments` and `sourceObject` absent and rejects a `mode` outside `CompressionMode` — guard test.
      * `[ ]`   The two flavor guards are mutually exclusive — guard test.
      * `[ ]`   Each of the four retry conditions returns the retry-required flavor carrying its own verbatim reason, and none dispatches a retry — unit test.
      * `[ ]`   An intermediate chunk and a text-mode response each pass content through unparsed and resolve `shouldContinue` from the finish reason alone, with `determineContinuation` never invoked — unit test.
      * `[ ]`   A text-mode response with a continue finish reason returns `shouldContinue` true — unit test.
      * `[ ]`   `determineContinuation` is called with all seven members and `sourceObject` is the exact value params carried — unit test.
      * `[ ]`   A parsed response reports the full verdict rather than the finish-reason trigger — unit test.
      * `[ ]`   A throwing sanitizer and a throwing continuation each return their own typed error on the error arm — unit test.
      * `[ ]`   A JSON-mode response missing a `sourceObject` key continues, and one carrying every key with a `'stop'` reason does not — integration test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[ ]`   supabase/functions/dialectic-worker/debitForResponse/debitForResponse.ts **[BE] The wallet read, its four validations and the `debitTokens` call, depending on nothing content preparation produces so the ledger matches the invoice**

   * `[ ]`   `objective`
      * `[ ]`   The debit block inside `saveResponse.ts` bills only the responses that survive content preparation. Each of the four retry conditions returns before the debit is reached, so an empty response, a provider-signalled error, an unusable sanitizer result and a malformed parse are all unbilled — every one of which cost tokens the moment the stream returned. The block reports four distinct wallet conditions as two untyped `Error`s, both `retriable: false`, so a `token_wallets` read that failed transiently is recorded as a permanent failure. It discriminates the debit's own return with `'error' in debitResult`, a hand-rolled probe standing in for a guard that does not exist. And its assistant chat message takes its content from `contentForStorage`, coupling the spend to a decision made after it.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/debitForResponse/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `DebitForResponseReturn`.
         * `[ ]`   Every value the module needs comes from the job context and the assembled response. It takes no content-for-storage, no continuation verdict and no contribution identity, so nothing in its inputs depends on a decision that could still reject the job.
         * `[ ]`   The assistant chat message records the assembled response's content: that string when present, and the empty string when the response carried none — an empty response having cost tokens is the case this module exists to bill.
         * `[ ]`   Each of the four wallet conditions returns its own typed error with a reasoned flag: a `token_wallets` read failure is retriable, and an absent row, a currency that is not `AI_TOKEN` and a null balance are not.
         * `[ ]`   `debitTokens`' own error arm is propagated unchanged, never re-wrapped, and is narrowed by `isDebitTokensError` rather than by a property probe.
         * `[ ]`   `debitTokens.guard.ts` and its guard test land beside the interface that owns `DebitTokensSuccess` and `DebitTokensError`, and `debitTokens.mock.ts` gains the four symbols for each of those two owned object types so the guard test has fixtures.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node. Where the orchestrator calls this module is stated there, not here.
         * `[ ]`   The `token_wallets` select carries the same explicit column list it carries today, and the `TokenWallet` it builds carries the same seven members from the same columns.
         * `[ ]`   Both `ChatMessageRow` literals are preserved member for member, including the `[dialectic_execute_job]` user-message content, the shared timestamp on all four date members, and the assistant message's `response_to_message_id` pointing at the user message's own id.
         * `[ ]`   `chatId` is omitted from the `DebitTokensParams` literal rather than passed as `undefined`.
         * `[ ]`   The module emits no log line and holds no logger; `debitTokens` logs its own work.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer ledger write: given a wallet and a response, record what the response cost.
      * `[ ]`   The role is correct because the spend is a fact of the stream having returned, independent of every judgment about the response, and a module that depends on none of those judgments is one an orchestrator can call before making them.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not decide whether the response is usable, complete or continuable; those are `prepareResponseContent`'s branches, and this module reads none of their outputs.
         * `[ ]`   Do not compute a cost, apply a rate, or write a ledger row directly; `debitTokens` owns all three.
         * `[ ]`   Do not persist a contribution, resolve an identity or dispatch a retry.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/debitForResponse` — resolving one wallet and recording one response's spend against it.
      * `[ ]`   Inside boundary:
         * `[ ]`   The wallet read, its four validations, the `TokenWallet` composition, the two chat message literals and the `DebitTokensParams` assembly.
         * `[ ]`   `DebitForResponseDeps`, `DebitForResponseParams`, `DebitForResponsePayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DebitTokensParams`, `DebitTokensPayload`, `DebitTokensSuccess`, `DebitTokensError` and `BoundDebitTokens`, owned by `_shared/utils/debitTokens.interface.ts`.
         * `[ ]`   `TokenWallet`, owned by `_shared/types/tokenWallet.types.ts`; `ChatMessageRow`, `TokenUsage` and `AiModelExtendedConfig`, owned by `_shared/types.ts`.
         * `[ ]`   `UnifiedAIResponse` and `AiProvidersRow`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   How a debit is priced, what ledger rows it writes, and when a caller invokes this module.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/utils/debitTokens.interface.ts` (`BoundDebitTokens`, `DebitTokensParams`, `DebitTokensPayload`, `DebitTokensSuccess`, `DebitTokensError`).
         * `[ ]`   Layer classification: shared utility contract.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the one collaborator this module invokes, the params it assembles for it, and the two return arms it narrows. The bound form is injected because the unbound `DebitTokens` takes its own `DebitTokensDeps` — a logger and the admin wallet service — and holding those to pass down is another module's deps object.
      * `[ ]`   Provider: `_shared/types/tokenWallet.types.ts` (`TokenWallet`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the wallet this module composes from the row it read.
      * `[ ]`   Provider: `_shared/types.ts` (`ChatMessageRow`, `TokenUsage`, `AiModelExtendedConfig`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the two messages the database operation returns, the usage the debit is computed from, and the config it is priced against.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`UnifiedAIResponse`, `AiProvidersRow`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the response this module bills for and the provider row both messages name.
      * `[ ]`   Provider: `types_db.ts` (`Database`, `Json`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client and the assistant message's serialized usage.
      * `[ ]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[ ]`   Layer classification: shared test fixture surface for the database boundary.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the injected client in every params fixture and the per-case configuration of the `token_wallets` read.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildUnifiedAIResponse`, `invalidateUnifiedAIResponse`) and `_shared/ai_service/ai_provider.mock.ts` (`buildMockProvider`).
         * `[ ]`   Layer classification: shared test fixture surfaces, home packages of the payload's type and the provider row.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the payload and provider fixtures in every case.
      * `[ ]`   Confirm:
         * `[ ]`   `DebitForResponseDeps` declares exactly `debitTokens` — the one collaborator the branch contract invokes. The database client is a per-invocation param.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From the debit contract: the five named types only, `BoundDebitTokens` as a value type on deps and the other four with `import type`.
         * `[ ]`   From `_shared/types.ts` and the wallet types: the four named types only, imported with `import type`.
         * `[ ]`   From the hub: the `UnifiedAIResponse` and `AiProvidersRow` types only, imported with `import type`.
         * `[ ]`   From `types_db.ts`: the `Database` and `Json` types only, imported with `import type`.

   * `[ ]`   `debitForResponse.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts the required key surface of `Parameters<DebitForResponseFn>[0]` is exactly `debitTokens`.
      * `[ ]`   A case asserts the required key surface of `Parameters<DebitForResponseFn>[1]` is exactly `dbClient`, `jobId`, `walletId`, `providerRow`, `modelConfig` and `projectOwnerUserId` — exhaustive in both directions, it is the proof no content-preparation output is a member.
      * `[ ]`   A case asserts the required key surface of `Parameters<DebitForResponseFn>[2]` is exactly `aiResponse`.
      * `[ ]`   A case asserts the required key surface of `DebitForResponseSuccessReturn` is exactly `debited`.
      * `[ ]`   A case asserts the required key surface of `DebitForResponseErrorReturn` is exactly `error` and `retriable`.
      * `[ ]`   A case assigns a `DebitForResponseSuccessReturn`-typed value to `DebitForResponseReturn` and a case assigns a `DebitForResponseErrorReturn`-typed value to it, proving the union has exactly the two arms.
      * `[ ]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<DebitForResponseReturn>` to `DebitForResponseFn`, proving the signature is asynchronous.

   * `[ ]`   `debitForResponse.interface.ts`
      * `[ ]`   `export interface DebitForResponseDeps { debitTokens: BoundDebitTokens; }`
      * `[ ]`   `export interface DebitForResponseParams { dbClient: SupabaseClient<Database>; jobId: string; walletId: string; providerRow: AiProvidersRow; modelConfig: AiModelExtendedConfig; projectOwnerUserId: string; }`
      * `[ ]`   `export interface DebitForResponsePayload { aiResponse: UnifiedAIResponse; }` — the response whose cost is being recorded, produced in-TS by `assembleAiResponse`, so the trusted form applies and the parameter is not `unknown`.
      * `[ ]`   `export type DebitForResponseSuccessReturn = { debited: true };` — the ledger entry is the outcome; the two chat messages `debitTokens` returns are its own record and no consumer of this module reads them.
      * `[ ]`   `export type DebitForResponseErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because one of its inhabitants is `debitTokens`' own error propagated unchanged; every other inhabitant is an owned class extending `Error`, and consumers discriminate by the guards below.
      * `[ ]`   `export type DebitForResponseReturn = DebitForResponseSuccessReturn | DebitForResponseErrorReturn;` — exactly two arms.
      * `[ ]`   `export type DebitForResponseFn = (deps: DebitForResponseDeps, params: DebitForResponseParams, payload: DebitForResponsePayload) => Promise<DebitForResponseReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `DebitForResponseWalletReadError { walletId; driverMessage }`, `DebitForResponseWalletNotFoundError { walletId }`, `DebitForResponseWalletCurrencyError { walletId; currency }`, `DebitForResponseWalletBalanceError { walletId }`, `DebitForResponseTokenUsageError { jobId }`.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `debitForResponse.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`.
      * `[ ]`   Wallet read: `params.dbClient.from('token_wallets').select('wallet_id, user_id, organization_id, balance, currency, created_at, updated_at').eq('wallet_id', params.walletId).single()` — the same explicit column list the source selects.
      * `[ ]`   Branch, condition the read returned a driver error: return the error arm carrying `DebitForResponseWalletReadError` built from `params.walletId` and the driver's message, with `retriable: true`. No debit is attempted.
      * `[ ]`   Branch, condition the read returned no row: return the error arm carrying `DebitForResponseWalletNotFoundError` built from `params.walletId`, with `retriable: false`.
      * `[ ]`   Branch, condition the row's `currency` is not `'AI_TOKEN'`: return the error arm carrying `DebitForResponseWalletCurrencyError` built from `params.walletId` and the row's currency, with `retriable: false`.
      * `[ ]`   Branch, condition the row's `balance` is `null`: return the error arm carrying `DebitForResponseWalletBalanceError` built from `params.walletId`, with `retriable: false`.
      * `[ ]`   Wallet composition: a `TokenWallet` carrying `walletId` from the row's `wallet_id`, `balance` from the row's `balance` stringified, `currency: 'AI_TOKEN'`, and `createdAt` and `updatedAt` as `Date` values from the row's timestamps. `userId` and `organizationId` are each set only when the row's corresponding column is not `null`, both being optional members of `TokenWallet`.
      * `[ ]`   Usage resolution: `payload.aiResponse.tokenUsage` absent or `null` yields a `null` usage. Present and passing the imported `isTokenUsage` yields that value as a `TokenUsage`. Present and failing it returns the error arm carrying `DebitForResponseTokenUsageError` built from `params.jobId`, with `retriable: false` — the assembler declares a weaker shape than the debit requires, so the narrowing is proven rather than assumed.
      * `[ ]`   Content resolution: the assistant message's content is `payload.aiResponse.content` when it is a string, and the empty string when it is `null`. Both are stated outcomes; no fallback expression supplies the second.
      * `[ ]`   Serialized usage: the resolved usage is round-tripped through `JSON.stringify` and `JSON.parse` and admitted as the assistant message's `token_usage` only when the parsed value passes `isJson`; a `null` usage and a parsed value that fails yield `null`, exactly as the source composes it.
      * `[ ]`   Database operation: a closure returning the two `ChatMessageRow` values. Both carry `chat_id: null`, `system_prompt_id: null`, `error_type: null`, `is_active_in_thread: true`, `ai_provider_id` from `params.providerRow.id`, `user_id` from `params.projectOwnerUserId`, and one timestamp value shared by every `created_at` and `updated_at`. The user message carries `role: 'user'`, `content: '[dialectic_execute_job]'`, `token_usage: null` and `response_to_message_id: null`; the assistant message carries `role: 'assistant'`, the resolved content, the serialized usage, and `response_to_message_id` equal to the user message's own generated id.
      * `[ ]`   Debit: `deps.debitTokens` with a `DebitTokensParams` carrying the composed wallet, the resolved usage, `params.modelConfig`, `params.projectOwnerUserId`, `relatedEntityId` from `params.jobId` and that closure, and with an empty `DebitTokensPayload`. `chatId` is omitted.
      * `[ ]`   Branch, condition the return passes `isDebitTokensError`: return the error arm carrying that arm's `error` and `retriable` unchanged — a failure the callee already typed is propagated, never re-wrapped.
      * `[ ]`   Branch, condition the return passes `isDebitTokensSuccess`: return the success arm.
      * `[ ]`   Ordering and side effects: exactly one read before the debit; zero debits on every wallet branch and on the usage branch; the database operation runs only inside `debitTokens`; neither `params` nor `payload` is mutated.

   * `[ ]`   `debitForResponse.mock.ts`
      * `[ ]`   `DebitForResponseDepsOverrides`, `buildDebitForResponseDeps`, `DebitForResponseDepsCorruptions` and `invalidateDebitForResponseDeps`; the builder's base `debitTokens` is a production-typed `BoundDebitTokens` returning `buildDebitTokensSuccess()` from the debit module's own mock.
      * `[ ]`   `DebitForResponseParamsOverrides`, `buildDebitForResponseParams`, `DebitForResponseParamsCorruptions` and `invalidateDebitForResponseParams`; the builder's base client is `createMockSupabaseClient(undefined, {})`, its `providerRow` composes `buildMockProvider()`, and its `jobId`, `walletId` and `projectOwnerUserId` are distinct non-empty strings so a case reading one where it meant another cannot pass.
      * `[ ]`   `DebitForResponsePayloadOverrides`, `buildDebitForResponsePayload`, `DebitForResponsePayloadCorruptions` and `invalidateDebitForResponsePayload`; the builder's base composes `buildUnifiedAIResponse()` rather than restating that type's defaults.
      * `[ ]`   The four symbols for each of `DebitForResponseSuccessReturn` and `DebitForResponseErrorReturn`; the error builder composes `buildDebitForResponseWalletNotFoundError()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[ ]`   `mockDebitForResponse: DebitForResponseFn` returning `buildDebitForResponseSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   RIDES HERE (owner): `_shared/utils/debitTokens.mock.ts` gains the four symbols for each of `DebitTokensSuccess` and `DebitTokensError` — `buildDebitTokensSuccess` composing two `ChatMessageRow` values and `transactionRecordedSuccessfully: true`, `buildDebitTokensError` defaulting `error` to a named `Error` and `retriable` to `false` — so the guard test this node lands has fixtures from the types' home package. Its two existing mock factories are untouched.
      * `[ ]`   No builder or invalidator for `UnifiedAIResponse`, `AiProvidersRow`, `TokenWallet` or `AiModelExtendedConfig` is written here; all are imported types whose fixtures live in their home packages.

   * `[ ]`   `debitForResponse.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isDebitForResponseDeps`: accepts the built deps; rejects `debitTokens` absent, non-function and a plain object; rejects a non-record root.
      * `[ ]`   `isDebitForResponseParams`: accepts the built params; rejects `dbClient` absent and a string; rejects each of `jobId`, `walletId` and `projectOwnerUserId` absent, non-string and empty; rejects `providerRow` set to the builder's output with a required member rest-destructured away; rejects `modelConfig` absent and failing its owner's guard; rejects a non-record root.
      * `[ ]`   `isDebitForResponsePayload`: accepts the built payload; rejects `aiResponse` absent and set to `invalidateUnifiedAIResponse({ content: 42 })`, the case proving the response is checked through its owner's guard; rejects a non-record root.
      * `[ ]`   `isDebitForResponseSuccessReturn`: accepts the built return; rejects `debited` absent or not exactly `true`; rejects the error return; rejects a non-record root.
      * `[ ]`   `isDebitForResponseErrorReturn`: accepts the built return; accepts one whose `error` is a plain `Error`, the member being typed `Error` so a propagated debit failure is admitted; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.
      * `[ ]`   RIDES HERE (owner): `_shared/utils/debitTokens.guard.test.ts` carries the checklist for the two guards this node lands there. `isDebitTokensSuccess`: accepts `buildDebitTokensSuccess()`; rejects `transactionRecordedSuccessfully` absent or not exactly `true`; rejects `result` absent and non-record; rejects either message absent; rejects `buildDebitTokensError()`; rejects non-record roots. `isDebitTokensError`: accepts `buildDebitTokensError()`; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects `buildDebitTokensSuccess()`; rejects non-record roots. Each arm rejecting the other is what makes the pair a discrimination rather than two independent checks.

   * `[ ]`   `debitForResponse.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isDebitForResponseDeps`, `isDebitForResponseParams`, `isDebitForResponsePayload`, `isDebitForResponseSuccessReturn`, `isDebitForResponseErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isDebitForResponseDeps` is a presence-of-method check, the deps being a behavior type: `debitTokens` is a function and nothing about its behavior is asserted.
      * `[ ]`   `isDebitForResponseParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — requires `jobId`, `walletId` and `projectOwnerUserId` to be strings non-empty after trim, calls the imported `isSelectedAiProvider` on `providerRow`, and calls the imported `isAiModelExtendedConfig` on `modelConfig`.
      * `[ ]`   `isDebitForResponsePayload` calls the imported `isUnifiedAIResponse` on `aiResponse`, the guard the `assembleAiResponse` node lands in that type's owning guard file.
      * `[ ]`   `isDebitForResponseSuccessReturn` requires `debited` exactly `true`; `isDebitForResponseErrorReturn` requires `error instanceof Error` and `retriable` a boolean. The two arms are mutually exclusive, so a value passes exactly one.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   RIDES HERE (owner): `_shared/utils/debitTokens.guard.ts` is created holding `isDebitTokensSuccess` and `isDebitTokensError` alone. The success guard requires a record whose `transactionRecordedSuccessfully` is exactly `true` and whose `result` is a record carrying `userMessage` and `assistantMessage`; the error guard requires `error instanceof Error` and a boolean `retriable`, and rejects a value carrying `transactionRecordedSuccessfully`. Both keep boolean contracts and throw nothing — they narrow an already-returned value.
      * `[ ]`   No guard is written here for `UnifiedAIResponse`, `AiProvidersRow`, `AiModelExtendedConfig`, `TokenWallet`, `TokenUsage` or `ChatMessageRow`; none is owned by this interface.

   * `[ ]`   `debitForResponse.test.ts`
      * `[ ]`   Deps fixtures are `buildDebitForResponseDeps({ … })`, params `buildDebitForResponseParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the `token_wallets` read the case turns on, and payload `buildDebitForResponsePayload({ … })`. A case needing a specific debit outcome declares its own production-typed `BoundDebitTokens` inside the test.
      * `[ ]`   The wallet is read by the params' id: a case asserts the recorded `token_wallets` filter is `params.walletId`, which differs from every other identifier in the arrangement.
      * `[ ]`   Read failed: a read returning a driver error returns the error arm whose error passes `isDebitForResponseWalletReadError`, carries that message, and whose `retriable` is `true`; the debit was never invoked.
      * `[ ]`   Wallet absent, wrong currency, null balance: three cases, each returning its own typed error with `retriable` `false` and no debit invoked. Arranged together so no case can pass by matching a sibling's error.
      * `[ ]`   Wallet composition: a row whose `user_id` is set and `organization_id` is `null` yields a wallet carrying `userId` and no `organizationId` key, and the mirrored row yields the mirrored wallet — asserted on the object handed to the debit.
      * `[ ]`   Usage relayed: a response carrying a full token usage yields a debit call whose `tokenUsage` is those three counts as independent literals; a response carrying none yields `null`.
      * `[ ]`   Usage malformed: a response whose `tokenUsage` is present but fails `isTokenUsage` returns the error arm whose error passes `isDebitForResponseTokenUsageError`, with no debit invoked.
      * `[ ]`   Content recorded: a response carrying content yields an assistant message whose `content` is that string; a response whose `content` is `null` yields an assistant message whose `content` is the empty string and still reaches the debit — the case that proves an unbilled empty response is impossible.
      * `[ ]`   Message linkage: the assistant message's `response_to_message_id` equals the user message's `id`, both messages carry `ai_provider_id` from the provider row and `user_id` from the owner id, and all four date members carry one identical value.
      * `[ ]`   Debit params: a case asserts `relatedEntityId` is `params.jobId`, `modelConfig` is `params.modelConfig`, `userId` is `params.projectOwnerUserId`, and the params object carries no `chatId` key.
      * `[ ]`   Debit failed: a `debitTokens` returning its error arm returns this module's error arm carrying that exact error instance and its `retriable` unchanged, proving propagation rather than re-wrapping.
      * `[ ]`   Debit succeeded: a `debitTokens` returning its success arm returns the success arm.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, which also binds `debitTokens` from its own deps before injecting it here; this node constructs nothing at a boundary.

   * `[ ]`   `debitForResponse.ts`
      * `[ ]`   One exported function, typed `DebitForResponseFn`, implementing the interaction spec in its stated order: wallet read, four wallet branches, wallet composition, usage resolution, content resolution, database-operation closure, debit, two debit branches.
      * `[ ]`   The composed wallet, the resolved usage, the serialized usage, the resolved content and the `DebitTokensParams` object are each held in one typed local; none is inferred and none is widened at its use site.
      * `[ ]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed.

   * `[ ]`   `debitForResponse.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[ ]`   `debitForResponse.integration.test.ts`
      * `[ ]`   Boundary: the Supabase client. The real `debitForResponse` runs against the real `debitTokens`, the real admin wallet service, the real `isTokenUsage`, `isSelectedAiProvider` and `isAiModelExtendedConfig`; no repo-owned function is mocked.
      * `[ ]`   Mocked: the database client only, so this test proves the chain from a wallet row through the real debit to a recorded transaction and does not prove the ledger's own constraints.
      * `[ ]`   A valid wallet row and a response carrying a full token usage yield the success arm, with the real debit recording a transaction against that wallet for that usage.
      * `[ ]`   A response whose content is `null` yields the success arm and a recorded transaction, arranged beside the populated case so neither assertion holds if the empty case were short-circuited.
      * `[ ]`   A wallet whose balance cannot cover the usage yields this module's error arm carrying the real `debitTokens` error instance unchanged, proving the propagation path against a failure the collaborator actually produced.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: the three files this node edits in `_shared/utils/` gain a guard, a guard test and four fixture symbols per return arm, and none of them imports this module.

   * `[ ]`   `requirements`
      * `[ ]`   `DebitForResponseParams` declares exactly its six members and none of them is produced by content preparation — interface test.
      * `[ ]`   The return union has exactly two arms — interface test.
      * `[ ]`   `isDebitForResponseErrorReturn` admits a plain `Error`, so a propagated debit failure is a valid error arm — guard test.
      * `[ ]`   `isDebitTokensSuccess` and `isDebitTokensError` each reject the other's arm — guard test.
      * `[ ]`   Each of the four wallet conditions returns its own typed error, with the read failure retriable and the other three not, and none reaches the debit — unit test.
      * `[ ]`   A malformed token usage returns its own typed error and does not reach the debit — unit test.
      * `[ ]`   A response with no content still reaches the debit, with the assistant message recording the empty string — unit test.
      * `[ ]`   The debit is called with `relatedEntityId` from the job id, the composed wallet, the resolved usage and no `chatId` — unit test.
      * `[ ]`   A debit failure is returned with its error instance and flag unchanged — unit test.
      * `[ ]`   The real `debitTokens` records a transaction for a valid wallet and returns its own error unchanged for an uncoverable one — integration test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[ ]`   supabase/functions/dialectic-worker/resolveContributionIdentity/resolveContributionIdentity.ts **[BE] EXECUTE-only identity resolution narrowed through `isDialecticExecuteJobPayload`, propagating its thrown diagnostic unchanged onto the error arm, with the consolidation exemption resolved through the recipe step and every read failure surfaced**

   * `[ ]`   `objective`
      * `[ ]`   The identity block inside `saveResponse.ts` reaches into the untyped job payload about twenty times, each behind an `isRecord` probe and a hand-rolled type check, and then re-proves seven members the payload guard family already proves — composing one four-hundred-character error that names all seven. It hand-derives `canonicalPathParams` member by member because `isCanonicalPathParams` checks only that `contributionType` is a string and says so in a comment, and because `isDialecticExecuteJobPayload` therefore settles for a presence check rather than calling it. Its consolidation exemption reads two recipe tables and discards both driver errors, so a transient database fault is reported as a missing `source_group` and is not retried. Three distinct refusals share one message. Every failure is an untyped `Error` with `retriable: false`.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/resolveContributionIdentity/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `ResolveContributionIdentityReturn`.
         * `[ ]`   The job's payload is narrowed once by the imported throwing `isDialecticExecuteJobPayload`, and every member is read off the narrowed value. No `isRecord` probe of the payload survives, and no member the guard family proves is re-proved here.
         * `[ ]`   `isCanonicalPathParams` checks every member of the type it narrows, and `isDialecticExecuteJobPayload` calls it, so `payload.canonicalPathParams` is a proven `CanonicalPathParams` and the member-by-member re-derivation is deleted.
         * `[ ]`   The consolidation exemption is preserved exactly: a document-related output whose `document_relationships.source_group` is explicitly `null` is allowed when the recipe step it was planned from carries a `per_model` granularity strategy, and refused otherwise. Explicit `null` and an absent member remain distinct.
         * `[ ]`   Each recipe read's driver failure returns its own typed retriable error rather than falling through to the next read or to a refusal.
         * `[ ]`   The three refusals that share one message today become three typed errors: no basis for an exemption, no recipe step in either table, and a strategy that is not `per_model`.
         * `[ ]`   `granularity_strategy` is narrowed through the imported `isGranularityStrategy`, the column being typed `string` and the value being a member of a named type.
         * `[ ]`   The success arm carries the narrowed payload plus every value it derived, so the arm that composes the upload re-derives nothing and re-narrows nothing.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node.
         * `[ ]`   The `rawProviderResponse` precondition is not carried into this module. `assembleAiResponse` composes that member unconditionally from the effective usage and the resolved finish reason, so the check guards a state this pipeline cannot produce.
         * `[ ]`   The `sourceAnchorModelSlug` log line is preserved verbatim, including its message and its three structured members.
         * `[ ]`   The `description` string is composed exactly as it is today, from the output type, the stage slug and the provider's name.
         * `[ ]`   `sourcePromptResourceId` is the payload's member or `undefined`; the empty-string initialisation is not carried forward, that member being declared `string | undefined` by the builder that consumes it.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer resolution: given an EXECUTE job and its provider, produce every value that identifies the contribution it is about to write.
      * `[ ]`   The role is correct because identity is decided once, from the job, and every consumer downstream needs the same answers — a second resolver would be a second source of truth for where a contribution lands.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not upload, persist a relationship, dispatch a render, or write a job row.
         * `[ ]`   Do not serve a COMPRESS job. This module narrows the EXECUTE arm and is called only on it.
         * `[ ]`   Do not decide whether the response is usable or complete, and do not read anything content preparation produced.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/resolveContributionIdentity` — the canonical identity of one contribution: its type, its path parameters, its document key, its continuation lineage and its source group.
      * `[ ]`   Inside boundary:
         * `[ ]`   The payload narrowing, the continuation gate, the document-key narrowing, the storage file type, the source-group resolution and its consolidation exemption, and the composed description.
         * `[ ]`   `ResolveContributionIdentityDeps`, `ResolveContributionIdentityParams`, `ResolveContributionIdentityPayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DialecticExecuteJobPayload`, `DialecticJobRow`, `AiProvidersRow`, `DocumentRelationships` and `ContributionType`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `CanonicalPathParams`, `FileType`, `ModelContributionFileTypes` and `DialecticStageSlug`, owned by `_shared/types/file_manager.types.ts`.
         * `[ ]`   `GranularityStrategy`, owned by the dialectic recipe types.
         * `[ ]`   What a recipe step means, what the upload does with these values, and where the file lands.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/types.ts` (`ILogger`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the `sourceAnchorModelSlug` line, this module's only log call.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `AiProvidersRow`, `DialecticExecuteJobPayload`, `DocumentRelationships`, `ContributionType`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the job this module resolves, the provider it names, and the narrowed payload every member is read from.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`CanonicalPathParams`, `FileType`, `ModelContributionFileTypes`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the path parameters, the document key and the storage file type this module resolves.
      * `[ ]`   Provider: `types_db.ts` (`Database`, `Json`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client and the document relationships the upload context receives.
      * `[ ]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[ ]`   Layer classification: shared test fixture surface for the database boundary.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the injected client in every params fixture and the per-case configuration of both recipe reads.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticJobRow`, `invalidateDialecticJobRow`, `buildDialecticExecuteJobPayload`, `invalidateDialecticExecuteJobPayload`), `_shared/services/file_manager.mock.ts` (`buildCanonicalPathParams`, `invalidateCanonicalPathParams`), `_shared/ai_service/ai_provider.mock.ts` (`buildMockProvider`) and `_shared/logger.mock.ts` (`MockLogger`).
         * `[ ]`   Layer classification: shared test fixture surfaces, home packages of every imported type this module fixtures.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the job, payload, path-params, provider and logger fixtures for every case, and the corruption sources for the strengthened guards' checklists.
      * `[ ]`   Confirm:
         * `[ ]`   `ResolveContributionIdentityDeps` declares exactly `logger` — the one collaborator the branch contract invokes. The database client is a per-invocation param, and every guard is called rather than injected.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From `_shared/types.ts`: the `ILogger` type only, imported with `import type`.
         * `[ ]`   From the hub and the file-manager types: the named types above only, imported with `import type`; `FileType` is imported as a value, its members being read.
         * `[ ]`   From `types_db.ts`: the `Database` and `Json` types only, imported with `import type`.

   * `[ ]`   `resolveContributionIdentity.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts the required key surface of `Parameters<ResolveContributionIdentityFn>[0]` is exactly `logger`.
      * `[ ]`   A case asserts the required key surface of `Parameters<ResolveContributionIdentityFn>[1]` is exactly `dbClient` and `providerRow`.
      * `[ ]`   A case asserts the required key surface of `Parameters<ResolveContributionIdentityFn>[2]` is exactly `job`.
      * `[ ]`   A case asserts the required key surface of `ResolveContributionIdentitySuccessReturn` is exactly `payload`, `description`, `contributionType`, `restOfCanonicalPathParams`, `documentKey`, `storageFileType`, `targetContributionId`, `isContinuationForStorage`, `continuationCount`, `sourceGroupFragment`, `documentRelationships` and `sourcePromptResourceId` — exhaustive in both directions, it is the proof the consumer re-derives nothing.
      * `[ ]`   A case asserts the required key surface of `ResolveContributionIdentityErrorReturn` is exactly `error` and `retriable`.
      * `[ ]`   A case assigns a success-typed value to `ResolveContributionIdentityReturn` and a case assigns an error-typed value to it, proving the union has exactly the two arms.
      * `[ ]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<ResolveContributionIdentityReturn>` to `ResolveContributionIdentityFn`, proving the signature is asynchronous.

   * `[ ]`   `resolveContributionIdentity.interface.ts`
      * `[ ]`   `export interface ResolveContributionIdentityDeps { logger: ILogger; }`
      * `[ ]`   `export interface ResolveContributionIdentityParams { dbClient: SupabaseClient<Database>; providerRow: AiProvidersRow; }`
      * `[ ]`   `export interface ResolveContributionIdentityPayload { job: DialecticJobRow; }` — the job whose identity is being resolved. It reaches this module already read and validated by `loadJobContext`, so the trusted form applies and the parameter is not `unknown`; its `payload` column is the untrusted value the entry narrowing proves.
      * `[ ]`   `export interface ResolveContributionIdentitySuccessReturn { payload: DialecticExecuteJobPayload; description: string; contributionType: ContributionType; restOfCanonicalPathParams: Omit<CanonicalPathParams, 'contributionType'>; documentKey: FileType; storageFileType: ModelContributionFileTypes; targetContributionId: string | undefined; isContinuationForStorage: boolean; continuationCount: number | undefined; sourceGroupFragment: string | undefined; documentRelationships: Json | null; sourcePromptResourceId: string | undefined; }` — the narrowed payload rides along so members the guard already proved are read from it rather than restated as members here.
      * `[ ]`   `export type ResolveContributionIdentityErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because one of its inhabitants is the execute guard's thrown diagnostic, propagated unchanged; every other inhabitant is an owned class extending `Error`.
      * `[ ]`   `export type ResolveContributionIdentityReturn = ResolveContributionIdentitySuccessReturn | ResolveContributionIdentityErrorReturn;` — exactly two arms.
      * `[ ]`   `export type ResolveContributionIdentityFn = (deps: ResolveContributionIdentityDeps, params: ResolveContributionIdentityParams, payload: ResolveContributionIdentityPayload) => Promise<ResolveContributionIdentityReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `ResolveContributionIdentityContinuationRelationshipsError { jobId }`, `ResolveContributionIdentityContinuationCountError { jobId }`, `ResolveContributionIdentityDocumentKeyError { jobId }`, `ResolveContributionIdentitySourceGroupError { jobId; documentKey }`, `ResolveContributionIdentityRecipeStepReadError { recipeStepId; tableName; driverMessage }`, `ResolveContributionIdentityRecipeStepNotFoundError { recipeStepId }`, `ResolveContributionIdentityConsolidationError { recipeStepId; granularityStrategy }`.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `resolveContributionIdentity.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form. `payload.job.payload` is narrowed by the imported `isDialecticExecuteJobPayload` inside a `try`; a caught `Error` returns the error arm carrying it unchanged with `retriable: false`, and a caught non-`Error` is rethrown. Every member below is read off the narrowed value; no `isRecord` probe of the payload appears anywhere in this contract.
      * `[ ]`   Description: composed from the narrowed `output_type`, the narrowed `stageSlug` and `params.providerRow.name`, in the form the source composes it.
      * `[ ]`   Path parameters: `contributionType` is the narrowed `canonicalPathParams.contributionType`, and `restOfCanonicalPathParams` is that object without it. Both are proven by the strengthened guard, so no member is re-checked and no optional member is conditionally assigned.
      * `[ ]`   Target contribution: the narrowed `target_contribution_id` when it is a non-empty string, otherwise `payload.job.target_contribution_id` when that is a non-empty string, otherwise `undefined`. `isContinuationForStorage` is true exactly when the resolved value is a non-empty string.
      * `[ ]`   Branch, condition `isContinuationForStorage` and the narrowed `document_relationships` fails `isDocumentRelationships`: return the error arm carrying `ResolveContributionIdentityContinuationRelationshipsError` built from the job id, with `retriable: false`.
      * `[ ]`   Branch, condition `isContinuationForStorage` and the narrowed `continuation_count` is absent or not greater than zero: return the error arm carrying `ResolveContributionIdentityContinuationCountError` built from the job id, with `retriable: false`. One condition, one branch — the count's absence and its value are the same requirement.
      * `[ ]`   Branch, condition the narrowed `document_key` fails `isFileType`: return the error arm carrying `ResolveContributionIdentityDocumentKeyError` built from the job id, with `retriable: false`.
      * `[ ]`   Storage file type: `FileType.ModelContributionRawJson` when the resolved document key passes `isDocumentKey`, and the narrowed `output_type` otherwise.
      * `[ ]`   Source group: read from the narrowed `document_relationships`. A non-empty string is the source group and the exemption path is not entered. The member being explicitly `null` is distinct from its being absent, and only the explicit `null` can earn an exemption.
      * `[ ]`   Branch, condition the resolved document key is not document-related, or a source group is present: no exemption is sought and the fragment is derived directly.
      * `[ ]`   Branch, condition the output is document-related, no source group is present, and the member is absent rather than explicitly `null`: return the error arm carrying `ResolveContributionIdentitySourceGroupError` built from the job id and the document key, with `retriable: false`.
      * `[ ]`   Branch, condition the member is explicitly `null` but the narrowed `planner_metadata` is absent or carries no `recipe_step_id` string: return the same `ResolveContributionIdentitySourceGroupError`. There is no recipe step to ask, so no exemption can be established.
      * `[ ]`   Clone read: `params.dbClient.from('dialectic_stage_recipe_steps').select('granularity_strategy').eq('id', recipeStepId).maybeSingle()`. A driver error returns the error arm carrying `ResolveContributionIdentityRecipeStepReadError` built from the step id, the table name and the driver's message, with `retriable: true`. A read that returned no row falls through to the template read; a read that returned one supplies the strategy and the template read does not run.
      * `[ ]`   Template read, reached only when the clone read returned no row: the same select against `dialectic_recipe_template_steps`. A driver error returns the same typed error naming that table, with `retriable: true`.
      * `[ ]`   Branch, condition neither read returned a row: return the error arm carrying `ResolveContributionIdentityRecipeStepNotFoundError` built from the step id, with `retriable: false`.
      * `[ ]`   Branch, condition the row's `granularity_strategy` fails the imported `isGranularityStrategy`, or passes it and is not `per_model`: return the error arm carrying `ResolveContributionIdentityConsolidationError` built from the step id and the value read, with `retriable: false`. The column is typed `string` and the value is a member of a named type, so the narrowing is proven rather than compared.
      * `[ ]`   Branch, condition the strategy is `per_model`: the exemption is granted and resolution continues with no source group.
      * `[ ]`   Source group fragment: `extractSourceGroupFragment` over the resolved source group, `undefined` when there is none.
      * `[ ]`   Log: when `restOfCanonicalPathParams.sourceAnchorModelSlug` is present, emit the existing line `[saveResponse] sourceAnchorModelSlug present in canonicalPathParams, will propagate to pathContext for antithesis pattern detection` with its `sourceAnchorModelSlug`, `stageSlug` and `outputType` members.
      * `[ ]`   Document relationships: the narrowed member when it passes `isJson`, and `null` when it is absent or `null`.
      * `[ ]`   Prompt provenance: `sourcePromptResourceId` is the narrowed `source_prompt_resource_id` or `undefined` when the member is absent. No empty string stands in for absence.
      * `[ ]`   Success: return the success arm carrying the narrowed payload and every resolved value above.
      * `[ ]`   Ordering and side effects: at most two reads per call, the template read only after a clone read that returned no row; zero reads on every path that does not seek an exemption; no row is written; neither `params` nor `payload` is mutated.

   * `[ ]`   `resolveContributionIdentity.mock.ts`
      * `[ ]`   `ResolveContributionIdentityDepsOverrides`, `buildResolveContributionIdentityDeps`, `ResolveContributionIdentityDepsCorruptions` and `invalidateResolveContributionIdentityDeps`; the builder's base composes `new MockLogger()`.
      * `[ ]`   `ResolveContributionIdentityParamsOverrides`, `buildResolveContributionIdentityParams`, `ResolveContributionIdentityParamsCorruptions` and `invalidateResolveContributionIdentityParams`; the builder's base client is `createMockSupabaseClient(undefined, {})` and its `providerRow` composes `buildMockProvider()`.
      * `[ ]`   `ResolveContributionIdentityPayloadOverrides`, `buildResolveContributionIdentityPayload`, `ResolveContributionIdentityPayloadCorruptions` and `invalidateResolveContributionIdentityPayload`; the builder's base composes `buildDialecticJobRow({ payload: buildDialecticExecuteJobPayload() })` so the fixture is an EXECUTE job whose payload survives the real guard.
      * `[ ]`   The four symbols for each of `ResolveContributionIdentitySuccessReturn` and `ResolveContributionIdentityErrorReturn`; the success builder composes `buildDialecticExecuteJobPayload()` and `buildCanonicalPathParams()` rather than restating either type's defaults, and the error builder composes `buildResolveContributionIdentityDocumentKeyError()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[ ]`   `mockResolveContributionIdentity: ResolveContributionIdentityFn` returning `buildResolveContributionIdentitySuccessReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `DialecticJobRow`, `DialecticExecuteJobPayload`, `CanonicalPathParams` or `AiProvidersRow` is written here; all are imported types whose fixtures live in their home packages.

   * `[ ]`   `resolveContributionIdentity.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isResolveContributionIdentityDeps`: accepts the built deps; rejects `logger` absent and non-object; rejects a non-record root.
      * `[ ]`   `isResolveContributionIdentityParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `providerRow` absent and set to the builder's output with a required member rest-destructured away; rejects a non-record root.
      * `[ ]`   `isResolveContributionIdentityPayload`: accepts the built payload; rejects `job` absent and set to `invalidateDialecticJobRow({ id: 42 })`, the case proving the row is checked through its owner's guard; rejects a non-record root.
      * `[ ]`   `isResolveContributionIdentitySuccessReturn`: accepts the built return; rejects each of the twelve members absent; rejects `payload` set to that type's invalidator output, `restOfCanonicalPathParams` missing `stageSlug`, `documentKey` outside `FileType`, `contributionType` outside `ContributionType`, and `documentRelationships` set to a non-`Json` value; accepts `targetContributionId`, `continuationCount`, `sourceGroupFragment` and `sourcePromptResourceId` each `undefined`, those being declared absent states; rejects a non-record root.
      * `[ ]`   `isResolveContributionIdentityErrorReturn`: accepts the built return; accepts one whose `error` is a plain `Error`, so a propagated guard diagnostic is admitted; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.
      * `[ ]`   RIDES HERE (owner): `type_guards.file_manager.test.ts` gains the full checklist for the strengthened `isCanonicalPathParams`, fixtures from `buildCanonicalPathParams` and `invalidateCanonicalPathParams`: accepts the valid default and valid overrides; rejects `contributionType` absent and outside `ContributionType`; rejects `stageSlug` absent and outside `DialecticStageSlug`, the two cases that prove the required members are now checked; rejects each of `sourceModelSlugs`, `sourceAnchorType`, `sourceAnchorModelSlug`, `sourceAttemptCount` and `pairedModelSlug` present but wrong-typed, and accepts each absent; rejects `null`, a primitive and an array. Its three existing cases keep their coverage.
      * `[ ]`   RIDES HERE (owner): `type_guards.dialectic.test.ts` gains cases proving `isDialecticExecuteJobPayload` throws its `canonicalPathParams` diagnostic for a payload whose `canonicalPathParams` fails the strengthened guard — one for an absent `stageSlug` and one for a `contributionType` outside the type — and its existing cases keep their coverage and their diagnostic strings.

   * `[ ]`   `resolveContributionIdentity.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isResolveContributionIdentityDeps`, `isResolveContributionIdentityParams`, `isResolveContributionIdentityPayload`, `isResolveContributionIdentitySuccessReturn`, `isResolveContributionIdentityErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isResolveContributionIdentityDeps` is a presence-of-method check, the deps being a behavior type.
      * `[ ]`   `isResolveContributionIdentityParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — and calls the imported `isSelectedAiProvider` on `providerRow`.
      * `[ ]`   `isResolveContributionIdentityPayload` calls the imported `isDialecticJobRow` on `job`.
      * `[ ]`   `isResolveContributionIdentitySuccessReturn` checks every member through the guard owned by that member's type — `isDialecticExecuteJobPayload` on `payload`, `isContributionType` on `contributionType`, `isCanonicalPathParams` on the path params rejoined with their contribution type, `isFileType` on `documentKey`, `isModelContributionFileType` on `storageFileType`, `isJson` on a non-null `documentRelationships` — and requires `description` a non-empty string, `isContinuationForStorage` a boolean, and each of `targetContributionId`, `continuationCount`, `sourceGroupFragment` and `sourcePromptResourceId` either absent or of its declared type.
      * `[ ]`   `isResolveContributionIdentityErrorReturn` requires `error instanceof Error` and `retriable` a boolean.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   RIDES HERE (owner): `type_guards.file_manager.ts` — `isCanonicalPathParams` calls `isContributionType` on `contributionType` and `isDialecticStageSlug` on `stageSlug`, both required, and checks each of the five optional members when present: `sourceModelSlugs` an array of strings, `sourceAnchorType`, `sourceAnchorModelSlug` and `pairedModelSlug` strings, `sourceAttemptCount` a number. The comment deferring those checks is deleted with the deferral.
      * `[ ]`   RIDES HERE (owner): `type_guards.dialectic.ts` — `isDialecticExecuteJobPayload` replaces its inline `isRecord(payload.canonicalPathParams) && 'contributionType' in …` presence check with a call to `isCanonicalPathParams`, keeping its existing diagnostic string. Every other member check, its legacy-property check and its allowed-key sweep are unchanged.
      * `[ ]`   No guard is written here for `DialecticJobRow`, `AiProvidersRow`, `DocumentRelationships`, `GranularityStrategy` or `FileType`; none is owned by this interface, and each already has a guard in its owner's file.

   * `[ ]`   `resolveContributionIdentity.test.ts`
      * `[ ]`   Deps fixtures are `buildResolveContributionIdentityDeps()`, params `buildResolveContributionIdentityParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the recipe reads the case turns on, and payload `buildResolveContributionIdentityPayload({ … })` overriding only the job members its case needs.
      * `[ ]`   Malformed payload: a job whose payload omits a required execute member returns the error arm carrying the guard's own thrown diagnostic, its message unchanged, with `retriable` false and no read performed.
      * `[ ]`   Resolved surface: a valid EXECUTE job yields a success arm whose `description` is composed from the output type, stage slug and provider name, whose `contributionType` and `restOfCanonicalPathParams` come from the payload's canonical params, and whose `storageFileType` and `documentKey` are the resolved values — each asserted as an independent literal.
      * `[ ]`   Path params are not re-derived: a payload whose `canonicalPathParams` carries all five optional members yields a `restOfCanonicalPathParams` carrying all five, and one carrying none yields none — the case that proves the object is taken whole rather than rebuilt member by member.
      * `[ ]`   Target precedence: a payload carrying `target_contribution_id` yields that value even when the row carries a different one; a payload without it falls to the row's; neither yields `undefined` and `isContinuationForStorage` false. All three arranged together so no case passes by matching a sibling.
      * `[ ]`   Continuation gates: a continuation whose `document_relationships` fails its guard, and one whose `continuation_count` is absent, zero and negative, each return their own typed error with `retriable` false.
      * `[ ]`   Document key: a payload whose `document_key` is not a `FileType` returns its own typed error.
      * `[ ]`   Source group present: a document-related output carrying a source group yields its fragment and performs no read.
      * `[ ]`   Source group absent: a document-related output whose `source_group` member is absent returns the source-group error and performs no read, proving absence is not the exemption path.
      * `[ ]`   No basis for exemption: an explicitly `null` source group with no `planner_metadata`, and one whose metadata carries no `recipe_step_id`, each return the source-group error and perform no read.
      * `[ ]`   Clone read failed: a `dialectic_stage_recipe_steps` read returning a driver error returns the recipe-read error naming that table with `retriable` true, and the template read never happens — the case that proves the fault is surfaced rather than falling through.
      * `[ ]`   Template fallback: a clone read returning no row and a template read returning a `per_model` row yields the exemption and a success arm; a template read returning a driver error returns the recipe-read error naming that table with `retriable` true.
      * `[ ]`   Step absent: neither read returning a row returns the not-found error with `retriable` false, distinct from both the read error and the source-group error.
      * `[ ]`   Strategy refused: a row whose `granularity_strategy` is a valid strategy other than `per_model`, and one whose value is not a strategy at all, each return the consolidation error carrying the value read.
      * `[ ]`   Exemption granted: a `per_model` row yields a success arm whose `sourceGroupFragment` is `undefined`.
      * `[ ]`   Provenance: a payload carrying `source_prompt_resource_id` yields that string, and one omitting it yields `undefined` rather than the empty string.
      * `[ ]`   Log line: a payload whose canonical params carry `sourceAnchorModelSlug` emits the line with its three members; one without emits nothing.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's consumer switches; this node constructs nothing at a boundary.

   * `[ ]`   `resolveContributionIdentity.ts`
      * `[ ]`   One exported function, typed `ResolveContributionIdentityFn`, implementing the interaction spec in its stated order: entry narrowing, description, path parameters, target resolution, continuation gates, document key, storage file type, source group and its exemption, fragment, log, relationships, provenance, success.
      * `[ ]`   Each recipe read's result is held in its own typed local within its own branch; no local carries "the step from either table" to be narrowed later, and `isRecord` is not applied twice to one value.
      * `[ ]`   The narrowed payload is bound once and every member is read from it; no `isRecord` probe of `job.payload` appears in the body.
      * `[ ]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed.

   * `[ ]`   `resolveContributionIdentity.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[ ]`   `resolveContributionIdentity.integration.test.ts`
      * `[ ]`   Boundary: the Supabase client. The real `resolveContributionIdentity` runs against the real `isDialecticExecuteJobPayload`, the real strengthened `isCanonicalPathParams`, the real `isGranularityStrategy`, `isFileType`, `isDocumentKey`, `isDocumentRelated` and `extractSourceGroupFragment`; no repo-owned function is mocked.
      * `[ ]`   Mocked: the database client only, so this test proves the chain from a stored job payload through the real guard family to a resolved identity.
      * `[ ]`   A stored payload whose `canonicalPathParams` omits `stageSlug` yields the error arm carrying the execute guard's own diagnostic — the case that proves the strengthened guard is reached through the payload guard rather than only in isolation.
      * `[ ]`   A stored payload with an explicitly `null` source group and a recipe step row whose strategy is `per_model` yields a success arm with no fragment; the same payload against a row whose strategy is anything else yields the consolidation error. Arranged together so neither assertion holds if the read were skipped.
      * `[ ]`   A valid document-related payload carrying a source group yields a fragment derived by the real extractor.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: the two guard files this node strengthens gain checks and calls only, and neither imports this module.

   * `[ ]`   `requirements`
      * `[ ]`   `ResolveContributionIdentitySuccessReturn` declares exactly its twelve members — interface test.
      * `[ ]`   The return union has exactly two arms and the error member admits a plain `Error` — interface test and guard test.
      * `[ ]`   `isCanonicalPathParams` rejects an absent `stageSlug`, a `contributionType` outside its type, and each optional member present but wrong-typed — guard test.
      * `[ ]`   `isDialecticExecuteJobPayload` throws its `canonicalPathParams` diagnostic for a payload whose path params fail the strengthened guard — guard test.
      * `[ ]`   A malformed payload returns the execute guard's diagnostic unchanged with no read performed — unit test.
      * `[ ]`   `restOfCanonicalPathParams` carries every optional member the payload carries and none it does not — unit test.
      * `[ ]`   The payload's target contribution id takes precedence over the row's, and neither yields `undefined` — unit test.
      * `[ ]`   Each continuation gate and the document-key gate return their own typed error — unit test.
      * `[ ]`   An absent source group and an explicitly null one with no recipe step both return the source-group error without reading — unit test.
      * `[ ]`   Each recipe read's driver failure returns a retriable error naming its table, and neither falls through to a refusal — unit test.
      * `[ ]`   A step absent from both tables, a non-`per_model` strategy and a value that is not a strategy each return their own typed error — unit test.
      * `[ ]`   A `per_model` strategy grants the exemption and yields no fragment — unit test.
      * `[ ]`   `sourcePromptResourceId` is `undefined` when the member is absent — unit test.
      * `[ ]`   The strengthened guard is reached through the payload guard over a stored payload — integration test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[ ]`   supabase/functions/dialectic-worker/persistContributionRelationships/persistContributionRelationships.ts **[BE] The continuation and init-and-merge branches with both `dialectic_contributions` updates, returning the row the database holds rather than mutating the one it was handed**

   * `[ ]`   `objective`
      * `[ ]`   The relationship block inside `saveResponse.ts` mutates the contribution its caller holds. Both branches assign into `contribution.document_relationships`, so the caller's object changes underneath it and no updated row is ever returned. Its post-update verifications read the object it just built rather than the row the database now holds — the init branch checks that `merged[stageSlug]` equals the contribution id three lines after assigning exactly that, so a check whose message says "after persistence" cannot fail and proves nothing about persistence. Four distinct failures share one message and one `RenderJobValidationError`, an error type named for render-job validation. Both update driver errors are reported `retriable: false`.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/persistContributionRelationships/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `PersistContributionRelationshipsReturn`.
         * `[ ]`   Neither branch writes to the contribution it was handed. The success arm carries the row selected back from `dialectic_contributions` after the write, so the returned relationships are the ones the database holds.
         * `[ ]`   Each failure returns its own typed error this module owns, with a reasoned flag: both update failures and the read-back failure are retriable, and every requirement failure is not.
         * `[ ]`   The continuation branch persists the payload's relationships and requires the payload to carry a non-empty string at the stage key.
         * `[ ]`   The init-and-merge branch keeps its `needsInit` predicate whole, including the clause that re-initialises when the stage entry names a contribution other than this one, and keeps the merge rule that copies only string-valued relationship keys.
         * `[ ]`   The explicit-`null` `source_group` case still self-anchors: a payload whose `source_group` is `null` yields a merged `source_group` equal to this contribution's own id.
         * `[ ]`   The closing postcondition stands: a document-related contribution whose stage relationship is not a non-empty string after both branches returns its own typed error.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node.
         * `[ ]`   The continuation branch does not re-test the payload's relationships with `isDocumentRelationships`. `resolveContributionIdentity` refuses a continuation whose relationships fail that guard, so this module receives them already proven and the value reaches it typed.
         * `[ ]`   No branch reads the job payload. Every value the block probes off it arrives as a param or on the payload.
         * `[ ]`   The module emits no log line and holds no logger.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is an app-layer write: given a saved contribution, record which stage it answers and which source group it belongs to.
      * `[ ]`   The role is correct because the relationship map is a column on one row, this is the only place it is written for a model contribution, and every downstream consumer — the render dispatch above all — reads it back rather than being told about it.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not upload, dispatch a render, notify, or write the job row.
         * `[ ]`   Do not mutate any object the caller passed in.
         * `[ ]`   Do not decide whether the contribution is a continuation; the caller has resolved that and passes it.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/persistContributionRelationships` — the `document_relationships` column of one `dialectic_contributions` row.
      * `[ ]`   Inside boundary:
         * `[ ]`   The two branches, the `needsInit` predicate, the merge rule, the self-anchoring source group, both writes, the read-back and the closing postcondition.
         * `[ ]`   `PersistContributionRelationshipsDeps`, `PersistContributionRelationshipsParams`, `PersistContributionRelationshipsPayload`, the success arm, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DocumentRelationships`, `DialecticContributionRow`, `ContributionType` and `RelationshipRole`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `DialecticStageSlug` and `ModelContributionFileTypes`, owned by `_shared/types/file_manager.types.ts`.
         * `[ ]`   Who reads the relationships once written, and what a render job does with them.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticContributionRow`, `DocumentRelationships`, `ContributionType`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the row this module updates and returns, the map it writes, and the key type a stage slug must satisfy to become one.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`DialecticStageSlug`, `ModelContributionFileTypes`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the stage this contribution answers and the file type the closing postcondition applies to.
      * `[ ]`   Provider: `types_db.ts` (`Database`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client.
      * `[ ]`   Provider: `_shared/supabase.mock.ts` (`createMockSupabaseClient`, `MockSupabaseDataConfig`).
         * `[ ]`   Layer classification: shared test fixture surface for the database boundary.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the injected client in every params fixture and the per-case configuration of each update and its read-back.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticContributionRow`, `invalidateDialecticContributionRow`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of the contribution row.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the contribution fixture in every case and in the success-return builder.
      * `[ ]`   Confirm:
         * `[ ]`   `PersistContributionRelationshipsDeps` declares no member. Both writes and the read-back go through the per-invocation client, and every guard is called rather than injected. The object is declared and carries its full support system so a later collaborator is added to a shape that already exists.
         * `[ ]`   No reverse dependency: nothing in `_shared`, `dialectic-service` or `saveResponse/` imports this module, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From the hub: the `DialecticContributionRow`, `DocumentRelationships` and `ContributionType` types only, imported with `import type`.
         * `[ ]`   From the file-manager types: the `DialecticStageSlug` and `ModelContributionFileTypes` types only, imported with `import type`.
         * `[ ]`   From `types_db.ts`: the `Database` type only, imported with `import type`.

   * `[ ]`   `persistContributionRelationships.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts `Parameters<PersistContributionRelationshipsFn>[0]` has no required key, proving the deps object is declared and empty rather than absent from the signature.
      * `[ ]`   A case asserts the required key surface of `Parameters<PersistContributionRelationshipsFn>[1]` is exactly `dbClient`, `stageSlug`, `fileType` and `isContinuation`.
      * `[ ]`   A case asserts the required key surface of `Parameters<PersistContributionRelationshipsFn>[2]` is exactly `contribution` and `payloadRelationships`.
      * `[ ]`   A case asserts the required key surface of `PersistContributionRelationshipsSuccessReturn` is exactly `contribution`, proving the module answers with a row rather than with nothing.
      * `[ ]`   A case asserts the required key surface of `PersistContributionRelationshipsErrorReturn` is exactly `error` and `retriable`.
      * `[ ]`   A case assigns a success-typed value to `PersistContributionRelationshipsReturn` and a case assigns an error-typed value to it, proving the union has exactly the two arms.
      * `[ ]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[ ]`   A case assigns `{ source_group: null }` to `DocumentRelationships`, proving the explicit-null form the self-anchoring branch turns on is admitted by the type.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<PersistContributionRelationshipsReturn>` to `PersistContributionRelationshipsFn`, proving the signature is asynchronous.

   * `[ ]`   `persistContributionRelationships.interface.ts`
      * `[ ]`   `export interface PersistContributionRelationshipsDeps {}` — declared with no member. Every slot of the signature is supplied whether or not this function uses it today.
      * `[ ]`   `export interface PersistContributionRelationshipsParams { dbClient: SupabaseClient<Database>; stageSlug: DialecticStageSlug; fileType: ModelContributionFileTypes; isContinuation: boolean; }`
      * `[ ]`   `export interface PersistContributionRelationshipsPayload { contribution: DialecticContributionRow; payloadRelationships: DocumentRelationships | null; }` — the row whose column is being written and the map the caller resolved from the job payload. Both reach this module already proven — the row by `file_manager`'s own return, the map by `resolveContributionIdentity`'s continuation gate — so the trusted form applies and neither parameter is `unknown`.
      * `[ ]`   `export type PersistContributionRelationshipsSuccessReturn = { contribution: DialecticContributionRow };` — the row selected back after the write, or the row as handed in when no write was required.
      * `[ ]`   `export type PersistContributionRelationshipsErrorReturn = { error: PersistContributionRelationshipsContinuationUpdateError | PersistContributionRelationshipsContinuationEntryError | PersistContributionRelationshipsStageSlugError | PersistContributionRelationshipsInitUpdateError | PersistContributionRelationshipsReadBackError | PersistContributionRelationshipsStageRelationshipError; retriable: boolean };` — the error member's union is declared here, in the owning interface, and is never composed at a use site.
      * `[ ]`   `export type PersistContributionRelationshipsReturn = PersistContributionRelationshipsSuccessReturn | PersistContributionRelationshipsErrorReturn;` — exactly two arms.
      * `[ ]`   `export type PersistContributionRelationshipsFn = (deps: PersistContributionRelationshipsDeps, params: PersistContributionRelationshipsParams, payload: PersistContributionRelationshipsPayload) => Promise<PersistContributionRelationshipsReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `PersistContributionRelationshipsContinuationUpdateError { contributionId; driverMessage }`, `PersistContributionRelationshipsContinuationEntryError { contributionId; stageSlug }`, `PersistContributionRelationshipsStageSlugError { contributionId; stageSlug }`, `PersistContributionRelationshipsInitUpdateError { contributionId; driverMessage }`, `PersistContributionRelationshipsReadBackError { contributionId; driverMessage }`, `PersistContributionRelationshipsStageRelationshipError { contributionId; stageSlug }`.
      * `[ ]`   No bound form is declared here. `dialectic-worker/createJobContext` binds this function when its consumer switches, with `dialectic-worker/index.ts` supplying the unbound implementation.

   * `[ ]`   `persistContributionRelationships.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`. Nothing in this contract reads a job payload.
      * `[ ]`   Branch, condition `params.isContinuation` and `payload.payloadRelationships` carries no non-empty string at `params.stageSlug`: return the error arm carrying `PersistContributionRelationshipsContinuationEntryError` built from the contribution id and the stage slug, with `retriable: false`. A `null` map reaches this branch as the same failure. No write occurs.
      * `[ ]`   Branch, condition `params.isContinuation` and the entry is present: `params.dbClient.from('dialectic_contributions').update({ document_relationships: payload.payloadRelationships }).eq('id', payload.contribution.id)`. A driver error returns the error arm carrying `PersistContributionRelationshipsContinuationUpdateError` built from the contribution id and the driver's message, with `retriable: true` — a write the database refused now can succeed on a later attempt.
      * `[ ]`   Init predicate, reached only when `params.isContinuation` is false: the contribution needs initialising when its `document_relationships` is not a record, or its entry at `params.stageSlug` is not a non-empty string, or that entry is not this contribution's own id. The last clause is what re-points a stage at the contribution a re-run produced, and it is part of the predicate rather than an optimisation.
      * `[ ]`   Branch, condition the predicate is false: no write occurs and the contribution is returned as handed in.
      * `[ ]`   Merge, reached only when the predicate is true: a fresh `DocumentRelationships` carrying every entry of the contribution's existing map whose key is a `ContributionType` or `source_group` and whose value is a string. A `null` value and the `isContinuation` and `turnIndex` members are not copied, the map being narrowed to string-valued relationship keys.
      * `[ ]`   Branch, condition `payload.payloadRelationships` carries `source_group` explicitly `null`: the merged `source_group` is this contribution's own id, a consolidation anchoring itself.
      * `[ ]`   Branch, condition `params.stageSlug` does not pass `isContributionType`: return the error arm carrying `PersistContributionRelationshipsStageSlugError` built from the contribution id and the stage slug, with `retriable: false`. No write occurs. A stage slug is not a relationship key until it is proven to be one.
      * `[ ]`   Merge completion: the merged entry at the proven stage key is this contribution's own id.
      * `[ ]`   Init write: `params.dbClient.from('dialectic_contributions').update({ document_relationships: merged }).eq('id', payload.contribution.id)`. A driver error returns the error arm carrying `PersistContributionRelationshipsInitUpdateError` built from the contribution id and the driver's message, with `retriable: true`.
      * `[ ]`   Read-back, reached only when a write occurred: select the `dialectic_contributions` row by id. A driver error or an absent row returns the error arm carrying `PersistContributionRelationshipsReadBackError` built from the contribution id and the driver's message, with `retriable: true`. The returned row is the one the database holds; no local object is patched to stand in for it.
      * `[ ]`   Branch, condition `params.fileType` is document-related and the resolved row's entry at `params.stageSlug` is not a non-empty string: return the error arm carrying `PersistContributionRelationshipsStageRelationshipError` built from the contribution id and the stage slug, with `retriable: false`. This reads the row that came back, which is what makes it a postcondition on persistence rather than on a value just assembled.
      * `[ ]`   Success: return the success arm carrying the resolved row.
      * `[ ]`   Ordering and side effects: at most one write per call and at most one read, the read only after a write; zero writes on every requirement failure; the contribution the caller passed is never assigned to on any path.

   * `[ ]`   `persistContributionRelationships.mock.ts`
      * `[ ]`   `PersistContributionRelationshipsDepsOverrides`, `buildPersistContributionRelationshipsDeps`, `PersistContributionRelationshipsDepsCorruptions` and `invalidatePersistContributionRelationshipsDeps`; the builder returns the empty object the type declares.
      * `[ ]`   `PersistContributionRelationshipsParamsOverrides`, `buildPersistContributionRelationshipsParams`, `PersistContributionRelationshipsParamsCorruptions` and `invalidatePersistContributionRelationshipsParams`; the builder's base client is `createMockSupabaseClient(undefined, {})`, its `stageSlug` is a slug that is also a valid `ContributionType`, and its `isContinuation` is `false`.
      * `[ ]`   `PersistContributionRelationshipsPayloadOverrides`, `buildPersistContributionRelationshipsPayload`, `PersistContributionRelationshipsPayloadCorruptions` and `invalidatePersistContributionRelationshipsPayload`; the builder's base composes `buildDialecticContributionRow()` and defaults `payloadRelationships` to `null`.
      * `[ ]`   The four symbols for each of `PersistContributionRelationshipsSuccessReturn` and `PersistContributionRelationshipsErrorReturn`; the success builder composes `buildDialecticContributionRow()` and the error builder composes `buildPersistContributionRelationshipsStageSlugError()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance — prototype intact, no spread and no cast. There is no invalidator for any instance.
      * `[ ]`   `mockPersistContributionRelationships: PersistContributionRelationshipsFn` returning `buildPersistContributionRelationshipsSuccessReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for `DialecticContributionRow` or `DocumentRelationships` is written here; both are imported types whose fixtures live in `_shared/dialectic.mock.ts`.

   * `[ ]`   `persistContributionRelationships.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isPersistContributionRelationshipsDeps`: accepts the built deps; rejects `null`, `undefined`, a primitive and an array. The type declares no member, so a record root is the whole check and the cases prove it rejects a non-record rather than accepting anything.
      * `[ ]`   `isPersistContributionRelationshipsParams`: accepts the built params; rejects `dbClient` absent and a string; rejects `stageSlug` absent and outside `DialecticStageSlug`; rejects `fileType` absent and outside `ModelContributionFileTypes`; rejects `isContinuation` absent and non-boolean; rejects a non-record root.
      * `[ ]`   `isPersistContributionRelationshipsPayload`: accepts the built payload; accepts `payloadRelationships` `null`, that being a declared state; rejects `contribution` absent and set to `invalidateDialecticContributionRow({ id: 42 })`, the case proving the row is checked through its owner's guard; rejects `payloadRelationships` set to a value failing `isDocumentRelationships`; rejects a non-record root.
      * `[ ]`   `isPersistContributionRelationshipsSuccessReturn`: accepts the built return; rejects `contribution` absent and corrupted through its owner's invalidator; rejects the error return; rejects a non-record root.
      * `[ ]`   `isPersistContributionRelationshipsErrorReturn`: accepts the built return, and accepts one carrying each of the six owned errors, proving every member of the declared union is admitted; rejects `error` absent, a plain `Error`, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[ ]`   `persistContributionRelationships.guard.ts`
      * `[ ]`   One guard per type this interface owns: `isPersistContributionRelationshipsDeps`, `isPersistContributionRelationshipsParams`, `isPersistContributionRelationshipsPayload`, `isPersistContributionRelationshipsSuccessReturn`, `isPersistContributionRelationshipsErrorReturn`, and one `instanceof` guard per owned error class.
      * `[ ]`   `isPersistContributionRelationshipsDeps` requires a record root and nothing further, which is the complete check for a type declaring no member.
      * `[ ]`   `isPersistContributionRelationshipsParams` requires `dbClient` present and passing `isRecord` — the injected client is a vendor type this repo does not own — calls the imported `isDialecticStageSlug` on `stageSlug` and `isModelContributionFileType` on `fileType`, and requires `isContinuation` a boolean.
      * `[ ]`   `isPersistContributionRelationshipsPayload` calls the imported `isDialecticContribution` on `contribution`, and requires `payloadRelationships` to be either `null` or a value passing the imported `isDocumentRelationships`.
      * `[ ]`   `isPersistContributionRelationshipsSuccessReturn` calls the same contribution guard on its one member; `isPersistContributionRelationshipsErrorReturn` requires `error` to pass one of the six owned error guards and `retriable` to be a boolean.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   No guard is written here for `DialecticContributionRow`, `DocumentRelationships`, `ContributionType`, `DialecticStageSlug` or `ModelContributionFileTypes`; none is owned by this interface, and each already has a guard in its owner's file.

   * `[ ]`   `persistContributionRelationships.test.ts`
      * `[ ]`   Deps fixtures are `buildPersistContributionRelationshipsDeps()`, params `buildPersistContributionRelationshipsParams({ dbClient })` where the client comes from `createMockSupabaseClient` configured for the update and read-back the case turns on, and payload `buildPersistContributionRelationshipsPayload({ … })`.
      * `[ ]`   The argument is never mutated: every case asserts the passed contribution's `document_relationships` is identical after the call to what it was before, and the returned row is a different object. This is asserted in the continuation case, the init case and the no-write case alike, because a mutation reintroduced on any one path is the defect returning.
      * `[ ]`   Continuation persists the payload's map: a continuation whose payload carries a non-empty stage entry writes that map and returns the row the read-back supplied, whose relationships are the read-back's and not the payload's — arranged with the two differing so a case returning the local object fails.
      * `[ ]`   Continuation entry missing: a continuation whose payload map carries no stage entry, one whose entry is an empty string, and one whose `payloadRelationships` is `null`, each return the continuation-entry error with no write attempted.
      * `[ ]`   Continuation update failed: an update returning a driver error returns the continuation-update error carrying that message with `retriable` `true`, and no read-back is attempted.
      * `[ ]`   Init not required: a non-continuation whose contribution already carries its own id at the stage key performs no write and no read, and returns the contribution as handed in.
      * `[ ]`   Init required, each clause: a contribution whose relationships are not a record, one whose stage entry is an empty string, and one whose stage entry names a different contribution id, each trigger the write — the third being the proof the re-point clause survives.
      * `[ ]`   Merge rule: an existing map carrying a string-valued contribution-type key, a `null`-valued key, a `source_group` string, and an `isContinuation` boolean yields a merged map carrying the first and third and neither of the others, plus this contribution's id at the stage key.
      * `[ ]`   Self-anchoring: a payload whose `source_group` is explicitly `null` yields a merged `source_group` equal to the contribution's own id; one whose `source_group` is a string leaves the merged value as the existing map's, arranged beside it.
      * `[ ]`   Stage slug not a contribution type: a params `stageSlug` that is a valid `DialecticStageSlug` but not a `ContributionType` returns the stage-slug error with no write attempted.
      * `[ ]`   Init update failed and read-back failed: each returns its own typed error with `retriable` `true`, and the read-back failure is distinguishable from the update failure.
      * `[ ]`   Closing postcondition: a document-related file type whose read-back row carries no non-empty stage entry returns the stage-relationship error; the same row under a non-document-related file type returns the success arm, arranged together so the gate's condition is proven rather than assumed.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, when this function's consumer switches; this node constructs nothing at a boundary.

   * `[ ]`   `persistContributionRelationships.ts`
      * `[ ]`   One exported function, typed `PersistContributionRelationshipsFn`, implementing the interaction spec in its stated order: continuation branch, init predicate, merge, stage-slug guard, init write, read-back, postcondition, success.
      * `[ ]`   The merged map is built once into a typed local and never re-tested against the condition that selected each entry; the nested re-check of the copy condition is not reproduced.
      * `[ ]`   No assignment targets `payload.contribution` or any member of it on any path.
      * `[ ]`   Every return is one of the two arms; no path falls through, no fallback expression substitutes for a stated branch, and no failure is swallowed.

   * `[ ]`   `persistContributionRelationships.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and both arm guards — through one import point.

   * `[ ]`   `persistContributionRelationships.integration.test.ts`
      * `[ ]`   Boundary: the Supabase client. The real `persistContributionRelationships` runs against the real `isDocumentRelationships`, `isContributionType`, `isDocumentRelated` and `isDialecticContribution`; no repo-owned function is mocked.
      * `[ ]`   Mocked: the database client only, so this test proves the chain from a written column to a read-back row and not the table's own constraints.
      * `[ ]`   A continuation writes the payload's map and the returned row carries what the read-back supplied — asserted by selecting the row a second time, so the claim rests on the database rather than on the function's own return.
      * `[ ]`   A non-continuation needing init writes a merged map whose stage entry is the contribution's own id, proven the same way.
      * `[ ]`   A payload whose `source_group` is explicitly `null` yields a persisted `source_group` equal to the contribution's id, arranged beside a payload carrying a string so neither assertion holds if the branch were dropped.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service` and `types_db.ts`, and exports only through its own provides.
      * `[ ]`   No cycle: none of those providers imports this module, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: no file outside this module is edited by this node.

   * `[ ]`   `requirements`
      * `[ ]`   `PersistContributionRelationshipsSuccessReturn` declares exactly `contribution`, and the union has exactly two arms — interface test.
      * `[ ]`   `DocumentRelationships` admits an explicitly `null` `source_group` — interface test.
      * `[ ]`   `isPersistContributionRelationshipsErrorReturn` admits each of the six owned errors and rejects a plain `Error` — guard test.
      * `[ ]`   The contribution passed in is unchanged after every path, and the returned row is a distinct object — unit test.
      * `[ ]`   A continuation persists the payload's map and returns the read-back row — unit test.
      * `[ ]`   A continuation with no stage entry, an empty entry, or a null map returns the continuation-entry error without writing — unit test.
      * `[ ]`   Each of the three `needsInit` clauses triggers the write, including the entry naming a different contribution — unit test.
      * `[ ]`   The merge copies string-valued relationship keys only — unit test.
      * `[ ]`   An explicitly null `source_group` self-anchors to the contribution's id — unit test and integration test.
      * `[ ]`   A stage slug that is not a `ContributionType` returns its own error without writing — unit test.
      * `[ ]`   Both update failures and the read-back failure return their own typed errors with `retriable: true`, each distinguishable — unit test.
      * `[ ]`   A document-related contribution whose read-back row carries no stage relationship returns the postcondition error, and a non-document-related one does not — unit test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

* `[ ]`   supabase/functions/dialectic-worker/finalizeContributionJob/finalizeContributionJob.ts **[BE] The RENDER dispatch, the prompt-resource back-link, notifications, continuation, final-document assembly and job-row completion, with every failure returned instead of logged and walked past**

   * `[ ]`   `objective`
      * `[ ]`   The finalization block inside `saveResponse.ts` reports success over failures it observed. A RENDER job that could not be dispatched is logged and stepped past; a prompt-resource back-link that could not be written is logged and stepped past; a continuation that could not be enqueued is logged and stepped past; and a job row that could not be marked `completed` is logged `CRITICAL` and stepped past, after which the function returns `{ status: 'completed' }` for a row still sitting in `processing`. It calls `continueJob` on its six-argument legacy shape and recognises a refused continuation by testing three conditions in one expression. It probes `document_key` off the untyped job payload three times, hard-failing each time, for a member the identity resolver has already proven. And the outcome it reports is carried by a mutable field on a local that one branch reassigns.
      * `[ ]`   Functional goals:
         * `[ ]`   A new function-folder module `dialectic-worker/finalizeContributionJob/` declares the canonical `(deps, params, payload)` shape and returns a two-arm `FinalizeContributionJobReturn`.
         * `[ ]`   Every failure this module observes is returned on its error arm and execution stops there. No branch logs a failure and continues.
         * `[ ]`   The job-row completion failure returns `FinalizeContributionJobUpdateError`, so a row that is not `completed` is never reported as completed.
         * `[ ]`   `continueJob` is called on its three-slot contract and its return is narrowed by that module's own arm guards — `isContinueJobLimitReachedReturn` for the refusal, `isContinueJobErrorReturn` for the failure — never by testing properties in one expression.
         * `[ ]`   The three outcomes this module reports are three named success flavors, not one field reassigned mid-function.
         * `[ ]`   The prompt-resource back-link is written exactly as it is written today, and its failure is returned rather than logged.
         * `[ ]`   Every value the block probes off the job payload arrives typed: the document key, the user JWT, the continuation count and the document contexts come from the narrowed payload and the resolved identity.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are not edited. The module lands beside the monolith with its own tests; the orchestrator switches to it and deletes the inline block in the relocation node.
         * `[ ]`   The back-link write stays. `dialectic_project_resources.source_contribution_id` is the join key from a resource to the contribution it corresponds to — `getAllStageProgress` fails a rendered-document row that lacks it, `listStageDocuments` keys its latest-per-contribution map on it, `getProjectResourceContent` returns it to the client, and `gatherInputsForStage` links the two tables through it. A prompt resource is written before the model call, so this is the only point at which it can learn which contribution it produced.
         * `[ ]`   Every notification keeps its event type, its payload members and its gate: the two `execute_chunk_completed` sends, the `contribution_generation_continued` send, the `dialectic_contribution_received` and `contribution_generation_complete` pair, and the `execute_completed` send.
         * `[ ]`   Both `assembleAndSaveFinalDocument` call sites keep their arguments as they stand — the limit-reached site passes the matched `ContextForDocument`, the final-chunk site passes none — and both keep the condition that the root id differs from this contribution and no render was dispatched.
         * `[ ]`   Every log line is preserved verbatim, including the two diagnostic lines around the continuation call and the closing success line.
         * `[ ]`   `retriable` is preserved wherever a condition returns a flag today. The four conditions that return nothing today carry a flag reasoned from what they are: a database write that the driver refused is retriable, and a dispatch or continuation failure the callee already typed is propagated with the flag its producer set.
         * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer job completion: given a persisted contribution, dispatch what follows from it, announce it, and close the job row.
      * `[ ]`   The role is correct because every one of these acts is a consequence of the contribution existing, and the job's final status is a single fact that one place must own.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not resolve identity, prepare content, debit, upload, or write `document_relationships`; each has its own module and this one consumes their outputs.
         * `[ ]`   Do not decide whether a continuation is warranted; that verdict arrives as a param.
         * `[ ]`   Do not serve a COMPRESS job.
         * `[ ]`   Do not edit `saveResponse.ts`, `saveResponse.interface.ts` or `saveResponse.guard.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/finalizeContributionJob` — everything that follows one persisted contribution: the render dispatch, the provenance back-link, the notifications, the continuation, the final-document assembly and the job row's terminal state.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which of those acts happen for which outcome, in what order, and what the job's final status is.
         * `[ ]`   `FinalizeContributionJobDeps`, `FinalizeContributionJobParams`, `FinalizeContributionJobPayload`, the three success flavors, the error arm, the return union, the function type, and each owned error and its constructor params.
      * `[ ]`   Outside boundary:
         * `[ ]`   `ContinueJobFn` and its arm guards, owned by `dialectic-worker/continueJob`; `EnqueueRenderJobParams` and `EnqueueRenderJobPayload`, owned by `dialectic-worker/enqueueRenderJob`.
         * `[ ]`   `IFileManager`, owned by `_shared/types/file_manager.types.ts`; `NotificationServiceType`, owned by the notification contract.
         * `[ ]`   `ModelProcessingResult`, `DialecticContributionRow`, `DialecticJobRow`, `DialecticExecuteJobPayload` and `ContextForDocument`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   What a render job renders, what a continuation does, and what the final document contains.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/types.ts` (`ILogger`) and `_shared/types/notification.service.types.ts` (`NotificationServiceType`).
         * `[ ]`   Layer classification: shared type surface and shared service contract.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the module's log lines and its five notification sends.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`IFileManager`).
         * `[ ]`   Layer classification: shared service contract, the adapter interface the file manager implements.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: `assembleAndSaveFinalDocument`, the only member this module calls on it.
      * `[ ]`   Provider: `dialectic-worker/continueJob/continueJob.provides.ts` (`BoundContinueJobFn`, `isContinueJobEnqueuedReturn`, `isContinueJobLimitReachedReturn`, `isContinueJobErrorReturn`).
         * `[ ]`   Layer classification: sibling app-layer module, owner of the continuation contract.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: spawn the successor and narrow its three outcomes. The bound form is injected because the unbound `ContinueJobFn` takes its own `ContinueJobDeps`, and holding those to pass down is another module's deps object.
      * `[ ]`   Provider: `dialectic-worker/enqueueRenderJob/enqueueRenderJob.provides.ts` (`BoundEnqueueRenderJobFn`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, `isEnqueueRenderJobSuccessReturn`).
         * `[ ]`   Layer classification: sibling app-layer module, owner of the render dispatch contract.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: dispatch the render and narrow its return.
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticJobRow`, `DialecticContributionRow`, `DialecticExecuteJobPayload`, `ModelProcessingResult`, `ContextForDocument`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: the job and contribution this module finalizes, the narrowed payload it reads, and the result it records on the row.
      * `[ ]`   Provider: `_shared/types/file_manager.types.ts` (`FileType`, `ModelContributionFileTypes`) and `_shared/types.ts` (`FinishReason`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: the document key and file types the gates turn on, and the finish reason the final-chunk branch turns on.
      * `[ ]`   Provider: `types_db.ts` (`Database`).
         * `[ ]`   Layer classification: generated database type surface.
         * `[ ]`   Direction: inbound.
         * `[ ]`   Purpose: type the injected client.
      * `[ ]`   Provider: `_shared/supabase.mock.ts`, `_shared/dialectic.mock.ts`, `_shared/logger.mock.ts`, `_shared/utils/notification.service.mock.ts`, and the `continueJob` and `enqueueRenderJob` modules' own mocks.
         * `[ ]`   Layer classification: shared and sibling test fixture surfaces, home packages of every imported type this module fixtures.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: the client, job, contribution, payload, logger, notification, continuation and render fixtures for every case. Each block calls `resetMockNotificationService` before arranging.
      * `[ ]`   Confirm:
         * `[ ]`   `FinalizeContributionJobDeps` declares exactly `logger`, `notificationService`, `fileManager`, `continueJob` and `enqueueRenderJob` — the five collaborators the branch contract invokes. The database client is a per-invocation param.
         * `[ ]`   No reverse dependency: neither sibling module imports this one, and this module imports nothing from `saveResponse/`.
      * `[ ]`   `context_slice`
         * `[ ]`   From each sibling module: its bound function type, its arm guards and the params and payload types it declares, imported through that module's `provides`.
         * `[ ]`   From `_shared` and the hub: the named types above only, imported with `import type` except `FileType`, whose members are read.

   * `[ ]`   `finalizeContributionJob.interface.test.ts`
      * `[ ]`   Typed assignments only, per the interface-test scope — typed literals and surface records, no builders and no runtime calls.
      * `[ ]`   A case asserts the required key surface of `Parameters<FinalizeContributionJobFn>[0]` is exactly the five collaborators.
      * `[ ]`   A case asserts the required key surface of `Parameters<FinalizeContributionJobFn>[1]` is exactly `dbClient`, `job`, `jobPayload`, `projectOwnerUserId`, `identity`, `needsContinuation`, `resolvedFinishReason` and `isIntermediate`.
      * `[ ]`   A case asserts the required key surface of `Parameters<FinalizeContributionJobFn>[2]` is exactly `contribution`.
      * `[ ]`   A case per success flavor asserts its required key surface: `FinalizeContributionJobCompletedReturn`, `FinalizeContributionJobNeedsContinuationReturn` and `FinalizeContributionJobLimitReachedReturn`.
      * `[ ]`   Three cases prove flavor membership by typed assignment: each flavor is assignable to `FinalizeContributionJobSuccessReturn`, and that is assignable to `FinalizeContributionJobReturn`.
      * `[ ]`   A case assigns an error-typed value to `FinalizeContributionJobReturn`, proving the union has exactly the two arms.
      * `[ ]`   A case per owned error asserts the required key surface of its constructor-params type.
      * `[ ]`   A case assigns a function literal of shape `(deps, params, payload) => Promise<FinalizeContributionJobReturn>` to `FinalizeContributionJobFn`.
      * `[ ]`   A case assigns a function literal of shape `(params, payload) => Promise<ContinueJobReturn>` to `BoundContinueJobFn`, proving the bound form drops the deps parameter.

   * `[ ]`   `finalizeContributionJob.interface.ts`
      * `[ ]`   `export interface FinalizeContributionJobDeps { logger: ILogger; notificationService: NotificationServiceType; fileManager: IFileManager; continueJob: BoundContinueJobFn; enqueueRenderJob: BoundEnqueueRenderJobFn; }`
      * `[ ]`   `export interface FinalizeContributionJobParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; jobPayload: DialecticExecuteJobPayload; projectOwnerUserId: string; identity: ResolveContributionIdentitySuccessReturn; needsContinuation: boolean; resolvedFinishReason: FinishReason; isIntermediate: boolean; }` — the identity result rides whole rather than being unpacked into a dozen members, so this module reads what the resolver proved and re-derives nothing.
      * `[ ]`   `export interface FinalizeContributionJobPayload { contribution: DialecticContributionRow; }` — the persisted contribution this module finalizes around, produced by `persistContributionRelationships` and reaching this module already proven.
      * `[ ]`   `export type FinalizeContributionJobCompletedReturn = { status: 'completed' };`, `export type FinalizeContributionJobNeedsContinuationReturn = { status: 'needs_continuation' };` and `export type FinalizeContributionJobLimitReachedReturn = { status: 'continuation_limit_reached' };` — the three outcomes the monolith derives from a reassigned field, each its own type.
      * `[ ]`   `export type FinalizeContributionJobSuccessReturn = FinalizeContributionJobCompletedReturn | FinalizeContributionJobNeedsContinuationReturn | FinalizeContributionJobLimitReachedReturn;`
      * `[ ]`   `export type FinalizeContributionJobErrorReturn = { error: Error; retriable: boolean };` — the member is typed `Error` because two of its inhabitants are the render and continuation modules' own errors, propagated unchanged; the rest are owned classes extending `Error`.
      * `[ ]`   `export type FinalizeContributionJobReturn = FinalizeContributionJobSuccessReturn | FinalizeContributionJobErrorReturn;` — exactly two arms, the flavors nested inside the success arm.
      * `[ ]`   `export type FinalizeContributionJobFn = (deps: FinalizeContributionJobDeps, params: FinalizeContributionJobParams, payload: FinalizeContributionJobPayload) => Promise<FinalizeContributionJobReturn>;`
      * `[ ]`   One constructor-params interface and one class per owned failure, each taking that single params object, holding each member as a readonly property, setting `name` to its own class name, and composing its `message` from its members: `FinalizeContributionJobUpdateError { jobId; driverMessage }`, `FinalizeContributionJobPromptLinkError { promptResourceId; contributionId; driverMessage }`, `FinalizeContributionJobRenderDispatchSkippedError { jobId; reason }`.
      * `[ ]`   RIDES HERE (owner): `continueJob.interface.ts` gains `export type BoundContinueJobFn = (params: ContinueJobParams, payload: ContinueJobPayload) => Promise<ContinueJobReturn>;` beside `ContinueJobFn`, the bound form a composing module receives.
      * `[ ]`   No bound form of this module is declared here. `dialectic-worker/createJobContext` binds it when its consumer switches.

   * `[ ]`   `finalizeContributionJob.interaction.spec`
      * `[ ]`   Entry: `deps`, `params` and `payload` are consumed in the trusted form; nothing is guarded on entry and no parameter is `unknown`. Every value the monolith probes off the job payload is read from `params.jobPayload` or `params.identity`.
      * `[ ]`   Branch, condition `params.needsContinuation` is false and `params.jobPayload.user_jwt` is absent or empty after trim: emit the existing warn line `[saveResponse] user_jwt missing from job payload; skipping render dispatch` and return the error arm carrying `FinalizeContributionJobRenderDispatchSkippedError` built from the job id and that reason, with `retriable: false`. A dispatch that cannot happen is a failure this module observed, and the assembly branches below turn on whether a render was dispatched.
      * `[ ]`   Branch, condition `params.needsContinuation` is false and the identity's stage slug does not pass `isDialecticStageSlug`: emit the existing warn line naming the stage slug and return the same error with that reason.
      * `[ ]`   Render dispatch, reached when neither skip applies and `params.needsContinuation` is false: `deps.enqueueRenderJob` with an `EnqueueRenderJobParams` carrying the job, session, stage, iteration, output type, project, owner, JWT, model, wallet and test flag exactly as the source composes them, and an `EnqueueRenderJobPayload` carrying the contribution id, the continuation verdict, the identity's document key, its stage relationship, its file type and its storage file type.
      * `[ ]`   Branch, condition the dispatch return fails `isEnqueueRenderJobSuccessReturn`: emit the existing error line `[saveResponse] Failed to dispatch RENDER job` with the error as context, and return the error arm carrying that module's own error unchanged with the flag it set.
      * `[ ]`   Render outcome: a render was dispatched when the returned `renderJobId` is not `null`. That answer gates both assembly branches below.
      * `[ ]`   Branch, condition `params.identity.sourcePromptResourceId` is a non-empty string: `params.dbClient.from('dialectic_project_resources').update({ source_contribution_id: payload.contribution.id }).eq('id', that id)`. This is the only point at which a prompt resource learns which contribution it produced. A driver error emits the existing error line with its three structured members and returns the error arm carrying `FinalizeContributionJobPromptLinkError` built from the resource id, the contribution id and the driver's message, with `retriable: true`.
      * `[ ]`   Branch, condition `params.identity.isContinuationForStorage` and the identity's file type is document-related: send `execute_chunk_completed` through `deps.notificationService.sendJobNotificationEvent`, carrying the session, stage, iteration, job id, the identity's document key as both `step_key` and `document_key`, and the model id, targeted at the owner.
      * `[ ]`   Result record: a `ModelProcessingResult` carrying the model id, the attempt count plus one, the contribution id, and a status of `needs_continuation` when a continuation is needed and `completed` otherwise. It is built once per outcome and no field of it is reassigned.
      * `[ ]`   Continuation, reached when `params.needsContinuation`: emit the existing diagnostic line naming the job, the resolved finish reason, the payload's continuation count and its `continueUntilComplete`; call `deps.continueJob` with a `ContinueJobParams` carrying the client and the owner and a `ContinueJobPayload` carrying the job and the contribution; emit the existing diagnostic line naming the result.
      * `[ ]`   Branch, condition the continuation return passes `isContinueJobErrorReturn`: emit the existing error line `[dialectic-worker] [saveResponse] Failed to enqueue continuation for job ${jobId}.` with the message, and return the error arm carrying that module's own error unchanged with the flag it set.
      * `[ ]`   Branch, condition the return passes `isContinueJobLimitReachedReturn`: emit the existing warn line; the result record's status is `continuation_limit_reached`; then the cap assembly. The root id is the contribution's own relationship entry at the identity's stage slug when that is a non-empty string; the matched context is the first entry of the payload's `context_for_documents` whose `document_key` equals the identity's document key. When the root id is present, differs from this contribution's id, and no render was dispatched, call `deps.fileManager.assembleAndSaveFinalDocument` with that root id and that matched context.
      * `[ ]`   Branch, condition the return passes `isContinueJobEnqueuedReturn`: the result record's status stands and no assembly occurs.
      * `[ ]`   Continuation notification: send `contribution_generation_continued` carrying the session, the contribution, the project, the model, a continuation number one greater than the payload's count, and the job id, targeted at the owner.
      * `[ ]`   Branch, condition `params.resolvedFinishReason` is `'stop'`: when the identity's file type is document-related, send `execute_chunk_completed` with the same members as above; then, when the contribution's relationship entry at the stage slug is a non-empty string that differs from this contribution's id and no render was dispatched, call `assembleAndSaveFinalDocument` with that root id and no context argument.
      * `[ ]`   Job completion: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'completed', results: JSON.stringify({ modelProcessingResult }), completed_at: <now>, attempt_count: <attempt plus one> }).eq('id', jobId)`. A driver error emits the existing `CRITICAL` line and returns the error arm carrying `FinalizeContributionJobUpdateError` built from the job id and the driver's message, with `retriable: true`. A row that is not `completed` is never reported as completed.
      * `[ ]`   Branch, condition `params.needsContinuation` is false: send `dialectic_contribution_received` and `contribution_generation_complete`, and — when `params.isIntermediate` is false and the file type is document-related — send `execute_completed`, each carrying the members it carries today.
      * `[ ]`   Closing log: the existing success line naming the job, the serialized result and the final status.
      * `[ ]`   Success: return the flavor matching the result record's status.
      * `[ ]`   Ordering and side effects: the render dispatch precedes the back-link, which precedes every notification; exactly one job-row write per call and it is the last write; the continuation is attempted at most once; the final document is assembled at most once; neither `params` nor `payload` is mutated.

   * `[ ]`   `finalizeContributionJob.mock.ts`
      * `[ ]`   The four symbols for each of `FinalizeContributionJobDeps`, `FinalizeContributionJobParams`, `FinalizeContributionJobPayload`, the three success flavors and the error arm; the deps builder composes `new MockLogger()`, `mockNotificationService`, this repo's file-manager mock, `mockContinueJob` and `mockEnqueueRenderJob` from their own modules, and the params builder composes `buildDialecticJobRow()`, `buildDialecticExecuteJobPayload()` and `buildResolveContributionIdentitySuccessReturn()`.
      * `[ ]`   The four symbols for each owned error's constructor-params type, plus a builder per class returning a real instance. There is no invalidator for any instance.
      * `[ ]`   `mockFinalizeContributionJob: FinalizeContributionJobFn` returning `buildFinalizeContributionJobCompletedReturn()`, typed by the production function type and taking no configuration.
      * `[ ]`   No builder or invalidator for any imported type is written here; each lives in its home package.

   * `[ ]`   `finalizeContributionJob.guard.test.ts`
      * `[ ]`   Case checklist per owned type, fixtures from this module's builders and invalidators and from the imported types' own invalidators only.
      * `[ ]`   `isFinalizeContributionJobDeps`: accepts the built deps; rejects each of the five members absent and non-function, `logger`, `notificationService` and `fileManager` absent and non-object; rejects a `notificationService` carrying no `sendJobNotificationEvent`; rejects a `fileManager` carrying no `assembleAndSaveFinalDocument`; rejects a non-record root.
      * `[ ]`   `isFinalizeContributionJobParams`: accepts the built params; rejects each of the eight members absent; rejects `job`, `jobPayload` and `identity` corrupted through their owners' invalidators; rejects `projectOwnerUserId` empty; rejects `needsContinuation` and `isIntermediate` non-boolean; rejects `resolvedFinishReason` outside `FinishReason`; rejects a non-record root.
      * `[ ]`   `isFinalizeContributionJobPayload`: accepts the built payload; rejects `contribution` absent and corrupted through its owner's invalidator; rejects a non-record root.
      * `[ ]`   One case per success flavor guard: each accepts its own flavor, rejects the other two, rejects `status` absent or any other string, and rejects a non-record root — the mutual exclusion being what lets a consumer discriminate by guard.
      * `[ ]`   `isFinalizeContributionJobErrorReturn`: accepts the built return; accepts one whose `error` is a plain `Error`, so a propagated sibling error is admitted; rejects `error` absent, a plain object and a string; rejects `retriable` absent and non-boolean; rejects a non-record root.
      * `[ ]`   One case per owned error guard: each accepts its own builder's instance and rejects a plain `Error`, a plain object carrying the same members, another owned error of this module, `null` and a primitive.

   * `[ ]`   `finalizeContributionJob.guard.ts`
      * `[ ]`   One guard per type this interface owns: deps, params, payload, the three success flavors, the error arm, and one `instanceof` guard per owned error class.
      * `[ ]`   `isFinalizeContributionJobDeps` is a presence-of-method check, the deps being a behavior type: `logger` and `fileManager` records whose called members are functions, `notificationService` a record whose `sendJobNotificationEvent`, `sendContributionGenerationContinuedEvent`, `sendContributionReceivedEvent` and `sendContributionGenerationCompleteEvent` are functions, and `continueJob` and `enqueueRenderJob` functions.
      * `[ ]`   `isFinalizeContributionJobParams` requires `dbClient` present and passing `isRecord`, calls `isDialecticJobRow` on `job`, `isDialecticExecuteJobPayload` on `jobPayload` and `isResolveContributionIdentitySuccessReturn` on `identity`, requires `projectOwnerUserId` a string non-empty after trim, `needsContinuation` and `isIntermediate` booleans, and `resolvedFinishReason` passing the imported `isFinishReason` while not being `null`.
      * `[ ]`   `isFinalizeContributionJobPayload` calls the imported `isDialecticContribution` on `contribution`.
      * `[ ]`   Each success flavor guard requires `status` to be exactly its own literal; the error guard requires `error instanceof Error` and `retriable` a boolean.
      * `[ ]`   Each owned error guard is `value instanceof <that class>` and nothing more.
      * `[ ]`   No guard is written here for any imported type; each already has a guard in its owner's file.

   * `[ ]`   `finalizeContributionJob.test.ts`
      * `[ ]`   Fixtures come from this module's builders, each overriding only what its case turns on; a case needing a specific collaborator outcome declares its own production-typed function inside the test, and each block calls `resetMockNotificationService` before arranging.
      * `[ ]`   Render dispatched: a non-continuation job with a JWT and a valid stage slug dispatches one render carrying every param and payload member as an independent literal, and the returned `renderJobId` decides the assembly gate below.
      * `[ ]`   Render skips: a missing JWT and an invalid stage slug each return the skip error carrying their own reason, each emitting its existing warn line, with no dispatch attempted.
      * `[ ]`   Render dispatch failed: a dispatch returning its error arm returns that error instance unchanged with its own flag, the existing error line is emitted, and neither the back-link nor any notification follows.
      * `[ ]`   Back-link written: an identity carrying a prompt resource id updates `dialectic_project_resources.source_contribution_id` to the contribution's id for that resource — asserted on the recorded filter and payload, with the resource id differing from every other identifier in the arrangement so a case writing the wrong row cannot pass.
      * `[ ]`   Back-link skipped: an identity whose prompt resource id is absent performs no such update.
      * `[ ]`   Back-link failed: an update returning a driver error returns the prompt-link error with `retriable` true, and no notification follows.
      * `[ ]`   Chunk notification: a continuation of a document-related output sends `execute_chunk_completed` carrying the document key as both `step_key` and `document_key`; a non-continuation and a non-document-related output each send none.
      * `[ ]`   Continuation enqueued: `continueJob` returning its enqueued arm yields the needs-continuation flavor, sends the continued notification with a continuation number one greater than the payload's count, and assembles no document.
      * `[ ]`   Continuation refused: `continueJob` returning its limit-reached arm yields the limit-reached flavor, emits the existing warn line, and assembles the final document with the matched context when the root differs and no render was dispatched — asserted on both arguments.
      * `[ ]`   Continuation failed: `continueJob` returning its error arm returns that error unchanged and reaches no notification, no assembly and no job update.
      * `[ ]`   Assembly gates: for each of the two sites, a case where the root equals the contribution id and a case where a render was dispatched each assemble nothing, arranged beside the positive case so the gate is proven rather than assumed.
      * `[ ]`   Final chunk: a `'stop'` finish reason sends the chunk notification for a document-related output and assembles with no context argument; any other reason does neither.
      * `[ ]`   Job completion: a successful update records `status: 'completed'`, the serialized result, a completion timestamp and the incremented attempt count, each asserted independently.
      * `[ ]`   Job completion failed: an update returning a driver error returns `FinalizeContributionJobUpdateError` with `retriable` true, emits the existing `CRITICAL` line, and returns no success flavor — the case that proves a row left in `processing` is never reported completed.
      * `[ ]`   Completion notifications: a non-continuation sends received and complete, and sends `execute_completed` only when the response is not intermediate and the output is document-related; each gate has its negative case.
      * `[ ]`   Status: the three outcomes each return their own flavor, and no case observes a mutated result record.
      * `[ ]`   Purity: neither the params object nor the payload object is mutated by any path.
      * `[ ]`   Every block carries the fixed-field `Contract` / `Arrange` / `Act` / `Assert` header and the inline section markers.

   * `[ ]`   `construction`
      * `[ ]`   The module exports one function and constructs no instance except its owned errors on their branches and the `ModelProcessingResult` it records. There is no factory and no partially constructed state.
      * `[ ]`   Each owned error takes exactly one typed constructor-params object; no positional form exists.
      * `[ ]`   Deps are supplied by the worker's deps factory, `dialectic-worker/createJobContext`, which also binds `continueJob` and `enqueueRenderJob` before injecting them here; this node constructs nothing at a boundary.

   * `[ ]`   `finalizeContributionJob.ts`
      * `[ ]`   One exported function, typed `FinalizeContributionJobFn`, implementing the interaction spec in its stated order: render decision, back-link, chunk notification, result record, continuation, final chunk, job completion, completion notifications, success.
      * `[ ]`   The `ModelProcessingResult` is constructed once per outcome with its final status; no field of it is reassigned after construction.
      * `[ ]`   Each collaborator return is narrowed by that module's own guard; no property is tested to discriminate an arm.
      * `[ ]`   Every return is one of the two arms and, within the success arm, exactly one named flavor; no path falls through, and no failure is logged instead of returned.

   * `[ ]`   `finalizeContributionJob.provides.ts`
      * `[ ]`   `export *` from the implementation, the interface, the guard and the mock, so a consumer and its tests reach the module — including every owned error and all four arm guards — through one import point.

   * `[ ]`   `finalizeContributionJob.integration.test.ts`
      * `[ ]`   Boundary: the Supabase client. The real `finalizeContributionJob` runs against the real `continueJob`, the real `enqueueRenderJob`, the real file manager and the real notification service; no repo-owned function is mocked.
      * `[ ]`   Mocked: the database client only, so this test proves the chain from a persisted contribution to a closed job row and the rows each collaborator wrote.
      * `[ ]`   A non-continuation job dispatches a real RENDER row, writes the back-link, closes the job row `completed`, and the prompt resource selected back carries `source_contribution_id` equal to the contribution's id — the assertion that proves the link the whole pipeline joins on is written.
      * `[ ]`   A continuation at the bound reaches the real `continueJob`'s limit-reached arm and assembles the final document, arranged beside one below the bound that enqueues a successor and assembles nothing.
      * `[ ]`   A job-row update the database refuses returns the update error and leaves the row not `completed`, proven by selecting it back.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the module imports contracts from `_shared`, `dialectic-service`, `types_db.ts` and two sibling modules' `provides`, and exports only through its own provides.
      * `[ ]`   No cycle: neither sibling module imports this one, and this module imports nothing from `saveResponse/`, which is its consumer.
      * `[ ]`   No reverse dependency: the one foreign file this node edits gains a bound function type only, and does not import this module.

   * `[ ]`   `requirements`
      * `[ ]`   The deps object declares exactly the five collaborators, and the params object exactly the eight members — interface test.
      * `[ ]`   The success arm carries three flavors and the union has exactly two arms — interface test.
      * `[ ]`   The three flavor guards are mutually exclusive — guard test.
      * `[ ]`   Each render skip returns its own reason and dispatches nothing — unit test.
      * `[ ]`   A failed render dispatch, a failed continuation and a failed job update each return an error and reach nothing below them — unit test.
      * `[ ]`   The prompt-resource back-link is written for the resolved prompt resource, skipped when there is none, and its failure returned — unit test and integration test.
      * `[ ]`   The continuation is narrowed by its module's arm guards, and each arm yields its own flavor — unit test.
      * `[ ]`   Both assembly sites keep their arguments and both gates — unit test.
      * `[ ]`   A job row the database refuses to complete never yields a success flavor — unit test and integration test.
      * `[ ]`   Every notification keeps its type, members and gate — unit test.
      * `[ ]`   `saveResponse.ts`, `saveResponse.interface.ts` and `saveResponse.guard.ts` are unchanged by this node, and every existing consumer still compiles.

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