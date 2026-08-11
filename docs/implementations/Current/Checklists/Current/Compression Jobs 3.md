[ ] // So that find->replace will stop unrolling my damned instructions! 

# **Compression Jobs**

## Problem Statement

When an assembled model call exceeds the model's input window, the pipeline enters the legacy RAG compression loop (`compressPrompt` → `RagService` → `IndexingService` → `dialectic_memory`) and document generation fails. The RAG path is structurally unfit for this pipeline: it embeds synchronously inside Supabase (a universal block with no provenance or attribution), it retrieves session-wide with generic stage-template queries so every victim document is replaced by nearly the same snippet blob, and its output destroys the document structure downstream agents need to populate their JSON skeletons. The application generates quality documents end-to-end whenever compression does not run, and fails whenever it does.

## Objectives

* Replace RAG compression with first-class, job-driven, schema-targeted COMPRESS jobs that ride the existing stream model-call transport, per `Compression Jobs Scope.md` (same folder — the ratified scope & order this workplan implements; its CANONICAL CONTRACTS section governs every function shape in this plan).
* Make victim selection pure computation — `effectiveScore = candidateTokens × importance` (importance from `inputsRelevance` for documents, from positional `valueScore` for history) — with no embeddings anywhere; one victim per resume cycle, stopping as soon as the preflight fits.
* Persist compressed output as `CompressedContext` resource artifacts keyed by (session, consuming stage, target schema key, source identity), named `{source_basename}_compressed_for_{target_key}.md` in the consuming stage's `_work` directory; verify JSON-mode output against the source it was sent, missing keys returning through the ordinary continuation path rather than failing; accept text-mode output as valid as-is, freeform text carrying no structure to verify against, with the finish-reason continuation gate still applying so an unfinished text compression resumes rather than persisting truncated; render through the source document's original template; overlay on resume; reuse across sibling agents via three-layer opportunistic dedup.
* Remove the RAG core entirely: `rag_service`, `indexing_service`, `dialectic_memory`, `match_dialectic_chunks`, and every `embeddingClient` call site.
* Land the remaining workstreams — WS-J, WS-S, WS-D and WS-X — at the commit seams the scope's COMMIT MAP names; every seam ends compiling with tests green.

## Expected Outcome

Oversized model inputs compress incrementally until the preflight fits: the parent job pauses via `waiting_for_children`, COMPRESS children run on the production stream path with the parent's own model, artifacts persist with full provenance and real wallet attribution, sibling jobs producing the same target reuse artifacts without recompressing, and the overlay swaps compressed content invisibly to the orchestrator. No synchronous model calls remain in Supabase; no RAG code or schema remains in the repo; a full-chain integration test proves the loop end to end.

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 
* `docs/implementations/Current/Checklists/Current/Compression Jobs Scope.md` — the ratified scope-and-order plan this workplan is built from. Canonical contracts, the commit map, design decisions, and the forbidden-token sweep live there.
* `Embedding Jobs.md` and `Embedding Jobs 2.md` (same folder) — SUPERSEDED workplans retained as crib material only. They were written against the abandoned `feat/embedding` baseline; anything lifted must be re-validated against `feat/compress` and must pass the scope's forbidden-token sweep.
* Baseline branch: `feat/compress`, cut from `development`.

# Work Breakdown Structure

* **Compression Jobs Implementation**

WS-0, WS-C, WS-R, WS-B, WS-N, WS-I, and WS-P are complete and their workplan files are retired. This file carries WS-J, WS-S, WS-D and WS-X. Node order within each workstream is as specified in the scope.

## WS-J — JOB PAYLOAD & MODEL-CALL SSOT (depends WS-P; gates WS-S and WS-D)

* `[ ]`   supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.ts **[BE] Land `DialecticBaseJobPayload` and the `isDialecticBaseJobPayload` guard family, and re-base `DialecticCompressJobPayload` on it — inheriting `user_jwt`, `idempotencyKey` and `source_prompt_resource_id`, declaring no `job_type` and no `user_id`**

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

   * `[ ]`   `type_guards.dialectic.ts`
      * `[ ]`   `dialecticBaseJobPayloadAllowedKeys` is exported as the set of base member names: `sessionId`, `projectId`, `model_id`, `walletId`, `user_jwt`, `idempotencyKey`, `stageSlug`, `iterationNumber`, `continueUntilComplete`, `maxRetries`, `continuation_count`, `target_contribution_id`, `is_test_job`, `model_slug`, `maxOutputTokens`, `sourceContributionId`, `source_prompt_resource_id`.
      * `[ ]`   `isDialecticBaseJobPayload` throws per member, carrying forward verbatim the strings the two legacy guards emit — `Payload must be a non-null object.`, `Missing or invalid sessionId.`, `Missing or invalid projectId.`, `Missing or invalid model_id.`, `Missing or invalid walletId.`, `Missing or invalid user_jwt.`, `Invalid stageSlug.`, `Invalid iterationNumber.`, `Invalid continueUntilComplete.`, `Invalid maxRetries.`, `Invalid continuation_count.`, `Invalid target_contribution_id.`, `Invalid model_slug.`, `Invalid is_test_job.`, `Invalid maxOutputTokens.`, `Invalid sourceContributionId.` — and adds `Missing or invalid idempotencyKey.` and `Invalid source_prompt_resource_id.` for the two members no legacy guard checks. It runs no unknown-key sweep, a base guard having no view of an arm's own keys.
      * `[ ]`   `isDialecticExecuteJobPayload` calls it first, deletes the base member checks it now duplicates, keeps every arm-specific check and its legacy-property check, and sweeps unknown keys against `dialecticBaseJobPayloadAllowedKeys` unioned with its own arm keys.
      * `[ ]`   `isDialecticRenderJobPayload` takes the identical treatment.

   * `[ ]`   `enqueueCompressJobs.guard.test.ts`
      * `[ ]`   Every negative `isDialecticCompressJobPayload` case becomes a thrown-diagnostic assertion; every positive case stays a boolean assertion.
      * `[ ]`   The `rejects missing job_type` case is deleted, that member no longer being on the payload, and is replaced by discriminant corruptions: `mode`, `sourceType`, `content` and `targetKey` each corrupted in turn, each throwing its own diagnostic.
      * `[ ]`   New cases: a payload missing `user_jwt` throws; a payload missing `idempotencyKey` throws; a payload carrying `job_type` throws the unknown-property diagnostic; a payload carrying `user_id` throws it too.
      * `[ ]`   The existing identity cases — the per-`sourceType` `documentKey`, `sourceId` and `role` requirements, the json-mode trio, `model_slug`, `continuation_count`, the `FileType`, `ModelContributionFileTypes` and `DialecticStageSlug` member checks, and the non-record roots — keep their coverage and change only their assertion form.
      * `[ ]`   `isenqueueCompressJobsPayload`, `isenqueueCompressJobsDeps`, `isenqueueCompressJobsSuccessReturn` and `isenqueueCompressJobsErrorReturn` cases are unchanged; those guards keep their boolean contracts.
      * `[ ]`   `isenqueueCompressJobsParams` gains a case rejecting an absent or empty `userJwt`.

   * `[ ]`   `enqueueCompressJobs.guard.ts`
      * `[ ]`   `isDialecticCompressJobPayload` calls `isDialecticBaseJobPayload` first, deletes its `job_type` check and its `sessionId`, `projectId`, `model_id`, `walletId`, `user_id` and `continuation_count` checks, and keeps `stageSlug`, `iterationNumber` and `model_slug` as its own narrowing checks because it requires what the base leaves optional.
      * `[ ]`   It throws per member for `targetKey`, `mode`, `content`, `sourceType`, the per-`sourceType` identity members, the json-mode trio, `chunk_index` and `chunk_total`, each diagnostic naming the member and what it held.
      * `[ ]`   It sweeps unknown keys against `dialecticBaseJobPayloadAllowedKeys` unioned with its own arm keys, which is what makes a stray `job_type` or `user_id` a named failure rather than a silently tolerated member.
      * `[ ]`   It does not catch the base guard's throw.
      * `[ ]`   `isenqueueCompressJobsParams` gains a non-empty-string check for `userJwt` and keeps its boolean contract, that guard covering a params object assembled in trusted TypeScript rather than a payload crossing a runtime boundary.

   * `[ ]`   `enqueueCompressJobs.test.ts`
      * `[ ]`   The case asserting `isDialecticCompressJobPayload(firstRow.payload)` is `true` stands, and is now also the proof that a constructed child payload survives the base guard.
      * `[ ]`   A case asserts the inserted child payload carries `user_jwt` equal to `params.userJwt`.
      * `[ ]`   A case asserts the inserted child payload's `idempotencyKey` equals its row's `idempotency_key`, for a fitting victim and for each chunk of a split victim.
      * `[ ]`   A case asserts the inserted child payload carries neither `job_type` nor `user_id`, and that the row carries both.
      * `[ ]`   Every existing case — dedup skip, chunking, idempotency-key composition, insert failure, and the identity and mode validation branches — keeps its coverage.

   * `[ ]`   `enqueueCompressJobs.ts`
      * `[ ]`   The child payload literal carries `user_jwt: params.userJwt` and `idempotencyKey` set to this child's own key, and drops `job_type` and `user_id`.
      * `[ ]`   The idempotency key is computed once per child and used in both places it belongs — the payload member and the row column — never computed twice.
      * `[ ]`   The row literal is unchanged: it keeps `job_type: 'COMPRESS'`, `user_id` from `params.parentJob.user_id`, and `idempotency_key`.
      * `[ ]`   Every other branch, error type, retriable flag and return value is unchanged.

   * `[ ]`   `enqueueCompressJobs.integration.test.ts`
      * `[ ]`   The `row.payload.user_id` assertion is deleted; the `row.user_id` assertion beside it already proves the owner is recorded, and the payload no longer carries the member.
      * `[ ]`   Assertions are added that `row.payload.user_jwt` equals `params.userJwt` and that `row.payload.idempotencyKey` equals `row.idempotency_key`.
      * `[ ]`   An assertion is added that `row.payload` carries no `job_type` key.
      * `[ ]`   The remaining payload assertions — `model_id`, `walletId`, `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `mode`, `content`, `chunk_index`, `chunk_total`, `sourceType`, `documentKey` — and every row assertion stand unchanged.
      * `[ ]`   The suite mocks only Supabase; `constructStoragePath`, the text splitter and the token counter stay real.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this module imports the base type from `dialectic-service`, the base guard from `_shared/utils/type-guards`, and the base builder from `_shared`. It exports nothing to either.
      * `[ ]`   The hub's existing type-only import of `DialecticCompressJobPayload` for the `DialecticJobPayload` union is the one edge in the other direction; it predates this node and is unchanged by it.
      * `[ ]`   `enqueueCompressJobs.provides.ts` re-exports the interface, guard, mock and implementation with `export *`, so the re-based type and the changed guard reach consumers without an edit to that file.
      * `[ ]`   No cycle: `type_guards.dialectic.ts` imports types from the hub and never from `dialectic-worker`.

   * `[ ]`   `requirements`
      * `[ ]`   A `DialecticCompressJobPayload` value is assignable to `DialecticBaseJobPayload` — interface test.
      * `[ ]`   `job_type` and `user_id` are not members of `DialecticCompressJobPayload`, and `user_jwt` and `idempotencyKey` are required members — interface test.
      * `[ ]`   `enqueueCompressJobsParams` declares thirteen fields — interface test.
      * `[ ]`   `isDialecticBaseJobPayload` throws a distinct named diagnostic for every base member, and accepts every optional member's absence — guard test.
      * `[ ]`   `isDialecticExecuteJobPayload` and `isDialecticRenderJobPayload` emit their current diagnostic strings for every base member after delegating — guard test, unchanged cases.
      * `[ ]`   `isDialecticCompressJobPayload` throws for each of its own malformed members and for a stray `job_type` or `user_id` — guard test.
      * `[ ]`   An inserted child payload carries `user_jwt` from params and `idempotencyKey` equal to its row's `idempotency_key` — unit test and integration test.
      * `[ ]`   An inserted child payload carries neither `job_type` nor `user_id`, and its row carries both — unit test and integration test.
      * `[ ]`   Dedup skip, chunk fan-out, insert failure and every identity and mode validation branch return exactly what they return now — unit test and integration test.

* `[ ]`   supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts **[BE] Re-base `DialecticRenderCompressedContextJobPayload` on `DialecticBaseJobPayload`, narrowing `stageSlug` and `iterationNumber` to required and delegating its guard to the base guard for every inherited member; add the non-throwing `isCompressedRenderPayloadShape` selection predicate; declare the inline payload union once as `EnqueueRenderJobCallPayload`**

   * `[ ]`   `objective`
      * `[ ]`   Solve contract divergence in the RENDER dispatch path: `DialecticRenderCompressedContextJobPayload` declares its own `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id` and `walletId` rather than inheriting them, so the two compression payloads spell the same six facts twice and its guard restates six member checks the base guard makes. The function's payload parameter and its `renderPayload` local each compose a union inline at their annotation sites, so no type file declares what either accepts, and the local carries "either payload" through a body that has already branched and knows which one it holds.
      * `[ ]`   Functional goals:
         * `[ ]`   `DialecticRenderCompressedContextJobPayload` extends `DialecticBaseJobPayload`, adding `targetKey`, `sourceType`, `documentKey` and `template_filename`, and narrowing the base's optional `stageSlug` and `iterationNumber` to required because `processRenderJob` reads both to build `RenderCompressedContextParams`.
         * `[ ]`   `isDialecticRenderCompressedContextJobPayload` delegates every inherited member to `isDialecticBaseJobPayload` and throws a per-member diagnostic for the members it declares.
         * `[ ]`   `EnqueueRenderJobCallPayload` is declared once in `enqueueRenderJob.interface.ts`, and `EnqueueRenderJobFn` and `BoundEnqueueRenderJobFn` annotate their payload parameter with that name.
         * `[ ]`   `isCompressedRenderPayloadShape` is a plain boolean predicate in this module's guard file, answering whether a row's payload is the compressed form, for `processRenderJob` to select on.
         * `[ ]`   Each branch of `enqueueRenderJob` holds one concrete payload type and builds its own insert row from it; no local carries a union.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Every existing success path, error type, retriable flag, log line and idempotency key is byte-identical after the restructure; this changes which type a local holds, never what the function does.
         * `[ ]`   `isEnqueueRenderCompressedContextPayload` stays a plain boolean type predicate. The call payload is not a job payload, extends no base, and is the entry selector between this function's two branches — a throw there would raise on every ordinary contribution dispatch.
         * `[ ]`   The single insert, its `23505` idempotency recovery, and the `idempotencyKey` local that recovery reads are unchanged.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer job spawning — deciding whether a RENDER row is warranted, resolving its template, and inserting it — plus the contract producers its one implementation owns: both render payload types' contracts and every guard over them.
      * `[ ]`   The role is correct because this function is the sole creator of `DialecticRenderCompressedContextJobPayload`, so its re-basing, its guard and the selection predicate its consumer reads all belong to this file's node.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `processRenderJob.ts`; it consumes the predicate this node lands and has its own node immediately after.
         * `[ ]`   Do not change `DialecticRenderJobPayload`, which already extends the base, or `isDialecticRenderJobPayload`, which the sibling node's guard family already covers.
         * `[ ]`   Do not change render decision policy, template resolution, or notification behavior on either branch.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/enqueueRenderJob` — render-warranted decision, template resolution, row identity, and insertion, for a contribution source and for a compressed source alike.
      * `[ ]`   Inside boundary:
         * `[ ]`   Both call payload shapes and the union of them, this function being the only caller-facing entry that accepts either.
         * `[ ]`   The compressed row payload's shape and its guard, this function being its creator.
         * `[ ]`   The structural question of which form a row's payload takes, which is this module's knowledge and no consumer's.
      * `[ ]`   Outside boundary:
         * `[ ]`   `DialecticRenderJobPayload`, owned by `dialectic-service/dialectic.interface.ts`.
         * `[ ]`   `DialecticBaseJobPayload` and `isDialecticBaseJobPayload`, owned by the hub and the shared guard module.
         * `[ ]`   What a RENDER row does once inserted.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `dialectic-service/dialectic.interface.ts` (`DialecticBaseJobPayload`).
         * `[ ]`   Layer classification: service-layer contract hub.
         * `[ ]`   Direction: inbound; this module already imports `DialecticRenderJobPayload` from it, so no new direction is opened.
         * `[ ]`   Purpose: supply the root the compressed row payload extends.
      * `[ ]`   Provider: `_shared/utils/type-guards/type_guards.dialectic.ts` (`isDialecticBaseJobPayload`, `dialecticBaseJobPayloadAllowedKeys`).
         * `[ ]`   Layer classification: shared runtime boundary.
         * `[ ]`   Direction: inbound from `_shared`.
         * `[ ]`   Purpose: validate the inherited members once, and supply the base half of this guard's unknown-key sweep.
      * `[ ]`   Provider: `_shared/dialectic.mock.ts` (`buildDialecticBaseJobPayload`).
         * `[ ]`   Layer classification: shared test fixture surface, home package of the base type's builder.
         * `[ ]`   Direction: inbound, test-time only.
         * `[ ]`   Purpose: supply the base defaults this module's builder composes rather than restates.
      * `[ ]`   Confirm:
         * `[ ]`   `EnqueueRenderJobDeps` is unchanged — `dbClient`, `logger`, `shouldEnqueueRenderJob`, `resolveTemplateFilename`.
         * `[ ]`   `EnqueueRenderJobParams` is unchanged; the compressed branch continues to read `userAuthToken`, `modelId`, `walletId`, `projectId`, `sessionId`, `stageSlug` and `iterationNumber` from it.
         * `[ ]`   No reverse dependency: neither `_shared` nor `dialectic-service` gains an import of this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From the hub: the `DialecticBaseJobPayload` type only, imported with `import type`.
         * `[ ]`   From the shared guard module: the base guard predicate and the allowed-key set only.
         * `[ ]`   From the shared mock: the base builder only.

   * `[ ]`   `enqueueRenderJob.interface.test.ts`
      * `[ ]`   The `DialecticRenderCompressedContextJobPayload declares all twelve keys` case is restated rather than adjusted. It is a `Record<keyof …, true>` exhaustiveness case, and once the type extends the base, `keyof` spans every base member, so a key count proves nothing about what this payload adds. It becomes a case asserting the four members this payload declares — `targetKey`, `sourceType`, `documentKey`, `template_filename` — by typed literal.
      * `[ ]`   A case proves membership of the base by typed assignment: a `DialecticRenderCompressedContextJobPayload` value is assignable to `DialecticBaseJobPayload`.
      * `[ ]`   A case proves `stageSlug` and `iterationNumber` are required on this payload where the base declares them optional, and that the six formerly-local members — `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id`, `walletId` — are still required through inheritance.
      * `[ ]`   A case proves `EnqueueRenderJobCallPayload` is the declared payload parameter of both function types, by assigning each member type to `Parameters<EnqueueRenderJobFn>[2]` and `Parameters<BoundEnqueueRenderJobFn>[1]` through a value typed as the named union.
      * `[ ]`   The `EnqueueRenderCompressedContextPayload declares all five keys` case, the return-union case and the signature case are unchanged.

   * `[ ]`   `enqueueRenderJob.interface.ts`
      * `[ ]`   `EnqueueRenderJobCallPayload` is declared as the union of `EnqueueRenderJobPayload` and `EnqueueRenderCompressedContextPayload`, beside those two declarations; `EnqueueRenderJobFn` and `BoundEnqueueRenderJobFn` annotate their payload parameter with it and compose no union at their own annotation sites.
      * `[ ]`   `DialecticRenderCompressedContextJobPayload` becomes `extends DialecticBaseJobPayload`, importing it from `../../dialectic-service/dialectic.interface.ts` with `import type`.
      * `[ ]`   It declares `targetKey: ModelContributionFileTypes`, `sourceType: CompressionSourceType`, `documentKey: FileType` and `template_filename: string`, and redeclares `stageSlug: DialecticStageSlug` and `iterationNumber: number` solely to narrow the base's optional forms to required.
      * `[ ]`   It declares no `idempotencyKey`, no `projectId`, no `sessionId`, no `user_jwt`, no `model_id` and no `walletId`; all six are inherited.
      * `[ ]`   `EnqueueRenderJobDeps`, `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, `EnqueueRenderCompressedContextPayload` and the return union are unchanged.

   * `[ ]`   `enqueueRenderJob.interaction.spec`
      * `[ ]`   Entry selection: `isEnqueueRenderCompressedContextPayload` over the call payload chooses the compressed branch; anything else takes the contribution branch. The predicate returns a boolean and throws nothing, both call payload shapes being ordinary call data with no base.
      * `[ ]`   Compressed branch, render decision: `deps.shouldEnqueueRenderJob` over the source's `docType` and `sourceStageSlug`. A query or config failure reason → `RenderJobEnqueueError`, `retriable: false`. `is_json` → success `{ renderJobId: null }`. Any reason other than a rendering `is_markdown` → success `{ renderJobId: null }`.
      * `[ ]`   Compressed branch, template: `deps.resolveTemplateFilename` over the source's coordinates. Its `TemplateResolutionError` is returned UNCHANGED, never reconstructed.
      * `[ ]`   Compressed branch, payload: build one `DialecticRenderCompressedContextJobPayload` held in a const of that exact type — the branch knows which form it is building, so nothing here is typed as "either payload". Its `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id` and `walletId` come from `params` exactly as they do now, and are inherited members rather than locally declared ones. Failing `isDialecticRenderCompressedContextJobPayload` surfaces that guard's own per-member diagnostic; failing `isJson` → `RenderJobValidationError`, `retriable: false`.
      * `[ ]`   Contribution branch: unchanged in every particular — the continuation skip, the render decision, the documentIdentity, documentKey and contributionId validations, template resolution, and the `DialecticRenderJobPayload` construction, now held in a const of that exact type and proven by `isDialecticRenderJobPayload` and `isJson` as it is today.
      * `[ ]`   Row construction moves into each branch: each builds its own `TablesInsert<"dialectic_generation_jobs">` from its own concrete payload, carrying `job_type: 'RENDER'`, `session_id`, `stage_slug`, `iteration_number`, `parent_job_id`, `payload`, `is_test_job`, `status: 'pending'`, `user_id` and `idempotency_key`. The row type is one named type, not a union, so the local that carries it holds one type.
      * `[ ]`   Shared tail, unchanged: one insert of that row; on a `23505` conflict naming `idempotency_key`, re-select by the `idempotencyKey` local and return the recovered `{ renderJobId }`; a failed recovery or any other insert failure → `RenderJobEnqueueError` with the existing programmer-error classification and retriable flag; otherwise `{ renderJobId }` from the inserted row.
      * `[ ]`   Ordering and side effects: at most one write per call; zero writes on every early return and every error path; the `23505` re-select is the only read after the write.

   * `[ ]`   `enqueueRenderJob.mock.ts`
      * `[ ]`   `buildDialecticRenderCompressedContextJobPayload` composes `buildDialecticBaseJobPayload()` for the six inherited members and overrides only what this payload adds or narrows.
      * `[ ]`   `DialecticRenderCompressedContextJobPayloadOverrides`, `DialecticRenderCompressedContextJobPayloadCorruptions` and `invalidateDialecticRenderCompressedContextJobPayload` keep their names and shapes; both follow the re-based member set through `Partial` and `keyof`.
      * `[ ]`   `EnqueueRenderJobPayload` and `EnqueueRenderCompressedContextPayload` builders and invalidators are unchanged; the named call union is a union type and takes no builder of its own, its two members each already having one.

   * `[ ]`   `enqueueRenderJob.guard.test.ts`
      * `[ ]`   Every negative `isDialecticRenderCompressedContextJobPayload` case becomes a thrown-diagnostic assertion; the positive case stays a boolean assertion.
      * `[ ]`   Case checklist for the members this payload declares: `targetKey` absent and wrong-typed; `sourceType` absent, wrong-typed, and a valid `CompressionSourceType` outside `'contribution' | 'resource'`; `documentKey` absent and not a `FileType`; `template_filename` absent and empty; `stageSlug` and `iterationNumber` absent, proving the narrowing the base does not enforce.
      * `[ ]`   Cases proving delegation: each inherited member corrupted in turn throws the base guard's own diagnostic, unchanged and uncaught.
      * `[ ]`   Case checklist for `isCompressedRenderPayloadShape`: `true` for a built compressed row payload; `false` for a built `DialecticRenderJobPayload`, which is the discrimination the predicate exists to make; `false` for a record carrying `targetKey` without `sourceType` and for one carrying `sourceType` without `targetKey`; `false` for a record carrying both alongside `documentIdentity` or `sourceContributionId`; `false` for non-record roots. Every case asserts a boolean and none asserts a throw.
      * `[ ]`   `isEnqueueRenderJobDeps`, `isEnqueueRenderJobParams`, `isEnqueueRenderJobPayload`, `isEnqueueRenderCompressedContextPayload`, `isEnqueueRenderJobSuccessReturn` and `isEnqueueRenderJobErrorReturn` cases are unchanged; those guards keep their boolean contracts.

   * `[ ]`   `enqueueRenderJob.guards.ts`
      * `[ ]`   `isDialecticRenderCompressedContextJobPayload` calls `isDialecticBaseJobPayload` first and deletes its `idempotencyKey`, `projectId`, `sessionId`, `user_jwt`, `model_id` and `walletId` checks; it keeps `stageSlug` and `iterationNumber` as its own checks because it requires what the base leaves optional.
      * `[ ]`   It throws a per-member diagnostic for `targetKey`, `sourceType` including the `'contribution' | 'resource'` restriction, `documentKey`, `template_filename`, `stageSlug` and `iterationNumber`, each naming the member and what it held, and it does not catch the base guard's throw.
      * `[ ]`   It sweeps unknown keys against `dialecticBaseJobPayloadAllowedKeys` unioned with its own four arm keys, matching the sweep its sibling payload guards enforce.
      * `[ ]`   `isCompressedRenderPayloadShape(value: unknown): boolean` returns `true` when the value is a record carrying both `targetKey` and `sourceType` and carrying neither `documentIdentity` nor `sourceContributionId`, and `false` otherwise. It is a selection predicate, not a type predicate: it narrows nothing, throws nothing, and answers only which arm a caller should take.
      * `[ ]`   `isEnqueueRenderCompressedContextPayload` is untouched, and stays the boolean entry selector between this function's two branches.

   * `[ ]`   `enqueueRenderJob.test.ts`
      * `[ ]`   The COMPRESS-dispatch happy-path case stands, and its `isDialecticRenderCompressedContextJobPayload` assertion over the inserted payload is now also the proof that a constructed compressed payload survives the base guard.
      * `[ ]`   A case asserts the inserted compressed payload carries `user_jwt` from `params.userAuthToken`, `model_id` from `params.modelId` and `walletId` from `params.walletId` — the members that moved from local declaration to inheritance and must still be written.
      * `[ ]`   A case asserts the inserted row's `idempotency_key` equals the payload's own `idempotencyKey` on both branches, pinning that the per-branch row construction did not drift.
      * `[ ]`   Every existing case — the render-decision skips, the query-failure error, the `TemplateResolutionError` passthrough, the contribution-branch validation failures, the insert failure classification and the `23505` recovery — keeps its coverage and its assertions unchanged, and is this restructure's regression oracle.

   * `[ ]`   `enqueueRenderJob.ts`
      * `[ ]`   The `let renderPayload: DialecticRenderJobPayload | DialecticRenderCompressedContextJobPayload` local is deleted. Each branch declares its payload as a const of that branch's own concrete type and proves it with that type's own guard, as both branches already do.
      * `[ ]`   Each branch builds its own `TablesInsert<"dialectic_generation_jobs">` row from its own payload; the shared tail holds one local of that single named type and performs the one insert.
      * `[ ]`   The `idempotencyKey` local stays a plain `string`, computed per branch as it is now and read by the `23505` recovery select.
      * `[ ]`   The payload parameter is annotated `EnqueueRenderJobCallPayload`.
      * `[ ]`   Every log line, error message, error type, retriable flag, early return and success value is unchanged.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this module imports the base type from `dialectic-service`, the base guard and allowed-key set from `_shared/utils/type-guards`, and the base builder from `_shared`. It exports nothing to any of them.
      * `[ ]`   `enqueueRenderJob.provides.ts` re-exports this module's interface, guards, mock and implementation, so the named union, the re-based payload and the new predicate reach `processRenderJob` without an edit to that file.
      * `[ ]`   No cycle: the hub declares `DialecticRenderJobPayload` and imports nothing from this module.

   * `[ ]`   `requirements`
      * `[ ]`   A `DialecticRenderCompressedContextJobPayload` value is assignable to `DialecticBaseJobPayload`, and its six formerly-local members are required through inheritance — interface test.
      * `[ ]`   `stageSlug` and `iterationNumber` are required on the payload where the base declares them optional — interface test.
      * `[ ]`   Both function types declare `EnqueueRenderJobCallPayload` as their payload parameter, and each member type assigns to it — interface test.
      * `[ ]`   `isDialecticRenderCompressedContextJobPayload` throws a named diagnostic for each of its declared members and propagates the base guard's diagnostic for each inherited one — guard test.
      * `[ ]`   `isCompressedRenderPayloadShape` returns `true` for a compressed row payload and `false` for a contribution row payload, and throws on nothing — guard test.
      * `[ ]`   The inserted compressed payload carries `user_jwt`, `model_id` and `walletId` from params, and the inserted row's `idempotency_key` matches its payload's `idempotencyKey` on both branches — unit test.
      * `[ ]`   Every render-decision skip, template error passthrough, validation failure, insert failure classification and `23505` recovery returns exactly what it returns now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/processRenderJob.ts **[BE] Select the compressed-row arm with `isCompressedRenderPayloadShape` from inside the `try`, so a contribution RENDER row routes instead of raising uncaught at a selector sitting ahead of the catch; both arms narrow with their own throwing guard inside the arm**

   * `[ ]`   `objective`
      * `[ ]`   Solve an uncaught-throw path at the arm selector. This function chooses its compressed arm by calling `isDialecticRenderCompressedContextJobPayload` as a predicate, ahead of the `try` that fails the row and reports. That guard throws, so an ordinary contribution RENDER row — the row the compressed guard exists to reject — raises out of the function before any status update and before any failure notification, and the row is left in `processing` with nothing recorded. Both rows carry `job_type: 'RENDER'`, so the column cannot separate them and the selection is structural.
      * `[ ]`   Functional goals:
         * `[ ]`   The compressed arm is selected by `isCompressedRenderPayloadShape`, which returns a boolean and throws nothing.
         * `[ ]`   The selection sits inside the `try`, so a throw from either arm's narrowing guard reaches the catch that already marks the row failed.
         * `[ ]`   The compressed arm narrows with `isDialecticRenderCompressedContextJobPayload` inside the arm, where its per-member diagnostic names the member at fault instead of misrouting.
         * `[ ]`   A compressed row that fails narrowing is marked failed and sends no notification, compression being invisible infrastructure.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `processCompressedRenderJob` is unchanged: it builds `RenderCompressedContextParams` from the payload, renders through `ctx.documentRenderer`, writes its own completed or failed row, and sends no notification of any kind.
         * `[ ]`   The contribution arm is unchanged in every particular — its payload narrowing, its `render_started` and `render_chunk_completed` notifications, its `pathContext` results write, and its `job_failed` notification.
         * `[ ]`   No dependency, parameter or return type changes; this function keeps its `(dbClient, job, projectOwnerUserId, ctx, authToken) => Promise<void>` shape.
      * `[ ]`   Each goal is proven by a named case in this file's test suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer job dispatch — routing a RENDER row to the renderer and recording its outcome.
      * `[ ]`   The role is correct because this function is the only consumer that must tell the two RENDER payload forms apart, and it is the sole site of the workstream's structural-selection form.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not author `isCompressedRenderPayloadShape`; the `enqueueRenderJob` node that precedes this one owns and lands it.
         * `[ ]`   Do not change what either arm renders, what either writes, or which notifications the contribution arm sends.
         * `[ ]`   Do not add a notification to the compressed arm on any path, success or failure.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is RENDER job dispatch in `supabase/functions/dialectic-worker/processRenderJob.ts` — arm selection, params assembly per arm, renderer invocation, and row status.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which arm a RENDER row takes, and what is recorded when a row cannot be narrowed.
         * `[ ]`   Notification policy per arm.
      * `[ ]`   Outside boundary:
         * `[ ]`   Both payload shapes, their guards and the selection predicate, owned by the `enqueueRenderJob` module.
         * `[ ]`   Rendering itself, owned by `renderDocument`.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./enqueueRenderJob/enqueueRenderJob.guards.ts` (`isCompressedRenderPayloadShape`, alongside the already-imported `isDialecticRenderCompressedContextJobPayload`).
         * `[ ]`   Layer classification: sibling app-layer module, the owner of both RENDER payload contracts.
         * `[ ]`   Direction: inbound; this file already imports that guard file and the payload type it declares, so no new direction is opened.
         * `[ ]`   Purpose: answer which payload form a row carries without throwing, so the answer can be used to choose an arm.
      * `[ ]`   Confirm:
         * `[ ]`   `IRenderJobContext` is unchanged; no member is added, removed or retyped.
         * `[ ]`   No reverse dependency: the `enqueueRenderJob` module gains no import of this file.

   * `[ ]`   `processRenderJob.interaction.spec`
      * `[ ]`   Entry: the function opens its `try` immediately. Nothing that can throw runs ahead of it.
      * `[ ]`   Arm selection, inside the `try`: `isCompressedRenderPayloadShape(job.payload)` — a boolean answer over a record carrying `targetKey` and `sourceType` and carrying neither `documentIdentity` nor `sourceContributionId`. True selects the compressed arm; false falls through to the contribution arm.
      * `[ ]`   Compressed arm, narrowing: `isDialecticRenderCompressedContextJobPayload(job.payload)` narrows the payload for the arm. It throws a per-member diagnostic on any malformed member, and that throw reaches this function's catch. The narrowing is written as the file's existing idiom — a negated guard whose body throws — because that is what narrows the value for the compiler; the throwing guard means the body is structurally unreachable, exactly as the contribution arm's equivalent already is.
         * `[ ]`   Outcome: `processCompressedRenderJob` is called with the narrowed payload and returns; that helper writes its own completed or failed row and sends no notification.
      * `[ ]`   Contribution arm: unchanged — the payload narrowing, the required-value validations, `RenderDocumentParams` assembly, the `render_started` notification, the `renderDocument` call, the `render_chunk_completed` notification, and the completed-status write carrying the `pathContext` results.
      * `[ ]`   Catch: unchanged in what it records — the error is logged and the row is marked failed with `error_details`. Its `job_failed` notification block gains one condition: it is skipped when `isCompressedRenderPayloadShape(job.payload)` is true, so a compressed row that failed narrowing is recorded without notifying. The predicate is safe in a catch precisely because it throws nothing.
      * `[ ]`   Ordering and side effects: at most one row write per invocation on every path; a compressed row that reaches its arm writes only through `processCompressedRenderJob`; no notification is sent on any compressed path.

   * `[ ]`   `processRenderJob.test.ts`
      * `[ ]`   The cases that route a compressed row through `makeCompressedRenderJob` stand, and now prove selection by the predicate rather than by the guard.
      * `[ ]`   A case proves the defect is closed: a contribution RENDER row is routed to the contribution arm and completes, rather than raising at the selector. Arranged with both a contribution row and a compressed row so the assertion cannot hold if the selection were deleted.
      * `[ ]`   A case proves a compressed row whose payload is malformed — a member corrupted through `invalidateDialecticRenderCompressedContextJobPayload` — is marked `failed` with the guard's own diagnostic in `error_details`, and that `sendJobNotificationEvent` is never called for it.
      * `[ ]`   A case proves a contribution row whose payload is malformed still marks `failed` and still sends its `job_failed` notification, pinning that the skip is scoped to the compressed form.
      * `[ ]`   The compressed payload literal the suite builds is unchanged; every member it sets is still a member of the re-based type.
      * `[ ]`   Every existing contribution-path case — notifications, results write, renderer failure, and the required-value validations — keeps its coverage and its assertions.

   * `[ ]`   `processRenderJob.ts`
      * `[ ]`   The pre-`try` selector is deleted; the `try` opens the function body.
      * `[ ]`   The compressed arm is the first branch inside the `try`: select with `isCompressedRenderPayloadShape`, narrow with `isDialecticRenderCompressedContextJobPayload`, then `return await processCompressedRenderJob(dbClient, job, ctx, job.payload, projectOwnerUserId)`.
      * `[ ]`   `isCompressedRenderPayloadShape` is imported from `./enqueueRenderJob/enqueueRenderJob.guards.ts`, beside the guard already imported from it.
      * `[ ]`   The catch's `job_failed` notification block is gated so it does not fire for a compressed row; the failed-status write above it is unconditional and unchanged.
      * `[ ]`   `processCompressedRenderJob`, the contribution arm, and every log line, notification payload, status write and error message are otherwise unchanged.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file imports both payload guards and the selection predicate from the `enqueueRenderJob` module, which owns them, and exports nothing back to it.
      * `[ ]`   No cycle: `enqueueRenderJob` imports nothing from this file.

   * `[ ]`   `requirements`
      * `[ ]`   A contribution RENDER row routes to the contribution arm and completes — unit test.
      * `[ ]`   A compressed RENDER row routes to the compressed arm and completes through `processCompressedRenderJob` — unit test.
      * `[ ]`   A compressed row with a malformed payload is marked `failed` carrying the guard's per-member diagnostic, with no notification sent — unit test.
      * `[ ]`   A contribution row with a malformed payload is marked `failed` and its `job_failed` notification is sent — unit test.
      * `[ ]`   No compressed path sends a notification of any kind — unit test.

* `[ ]`   supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts **[BE] Remove `output_type` from `EnqueueModelCallParams`, from `isEnqueueModelCallParams`, and the admission gate over it — nothing names an artifact type at dispatch**

   * `[ ]`   `objective`
      * `[ ]`   Solve a parameter that names an artifact type at the moment a model call is dispatched. `EnqueueModelCallParams.output_type` is forwarded nowhere: it does not reach `AiStreamEventData`, it does not reach `payload.chatApiRequest`, and it does not reach the `dialectic_generation_jobs` update this function performs. Its only use is the entry admission gate, which rejects any `FileType` outside the contribution types, `CompressedContext` and `CompressedContextRawJson`. A COMPRESS job is spawned by an oversized input rather than by a recipe step, so it has no recipe-driven output to name, and what a response becomes is `saveResponse`'s decision, taken from the job row's `job_type` and the payload.
      * `[ ]`   Functional goals:
         * `[ ]`   `EnqueueModelCallParams` declares exactly five members — `dbClient`, `job`, `providerRow`, `userAuthToken`, `userConfig` — and no member naming an artifact type.
         * `[ ]`   `isEnqueueModelCallParams` requires and checks exactly those five members; its `isFileType` call is deleted along with the `isFileType` import.
         * `[ ]`   The admission gate at the top of `enqueueModelCall.ts` is deleted, and the `isModelContributionFileType`, `isCompressedContextFileType` and `isCompressedContextRawJsonFileType` imports go with it.
         * `[ ]`   `createMockEnqueueModelCallParams` supplies no `output_type` default, and the `FileType` import it existed for is deleted.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Every remaining branch keeps its exact error, retriable flag, log line and message; the event body, the 500 KB cap, the row status write and the POST are byte-identical. This deletes a parameter and the one gate over it, and changes nothing else the function does.
         * `[ ]`   `EnqueueModelCallDeps`, `EnqueueModelCallPayload`, `AiStreamEventData`, `AiStreamEventBody`, the return union and every guard over them are unchanged.
         * `[ ]`   The function keeps its trusted-form `(deps, params, payload)` signature; `params` is assembled in TypeScript by its caller and is not re-guarded on entry.
         * `[ ]`   `prepareModelJob.ts` and `processCompressJob.ts` each hold an `EnqueueModelCallParams` literal that still sets `output_type`, and `processCompressJob`'s two suites read that member off the captured params, so all four files are transiently non-compilable from this node until their own nodes later in this workstream. That is the permitted within-workstream transient, not a defect to repair here.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer dispatch — handing one already-assembled model call to the Netlify stream queue and marking its row `queued`.
      * `[ ]`   The role is correct because this function is the transport, and a transport that admits or rejects an artifact type is deciding a persistence question that belongs to `saveResponse`.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `prepareModelJob.ts` or `processCompressJob.ts`, or any of their suites; each file has its own node later in this workstream and each drops its `output_type` there.
         * `[ ]`   Do not touch `DialecticExecuteJobPayload.output_type` or a recipe step's `output_type`. Those are different members of different types, both of which stay; `prepareModelJob` continues to destructure the payload's own member for its own use.
         * `[ ]`   Do not add a replacement gate, flag, or artifact-type parameter anywhere in this module.
         * `[ ]`   Do not change what this function sends, what it updates, or how it classifies any failure.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/enqueueModelCall` — provider-config validation, API-key resolution, job signature, the row status write, event-body assembly and size cap, and the queue POST.
      * `[ ]`   Inside boundary:
         * `[ ]`   What a model call needs in order to be dispatched, and how a dispatch failure is classified.
         * `[ ]`   The shape of the stream event this module puts on the queue.
      * `[ ]`   Outside boundary:
         * `[ ]`   What the response becomes, which is `saveResponse`'s decision from the row's `job_type` and the payload.
         * `[ ]`   Whether the call is affordable and whether the input fits, both of which resolve in `prepareModelJob` before this function is reached.
         * `[ ]`   `FileType` and every guard over it, owned by `_shared/types/file_manager.types.ts` and `_shared/utils/type-guards/type_guards.file_manager.ts`.

   * `[ ]`   `deps`
      * `[ ]`   Removed provider: `_shared/utils/type-guards/type_guards.file_manager.ts` (`isFileType` in the guard file; `isModelContributionFileType`, `isCompressedContextFileType`, `isCompressedContextRawJsonFileType` in the implementation).
         * `[ ]`   Layer classification: shared runtime boundary.
         * `[ ]`   Direction: inbound, and closed by this node — with the gate deleted no file in this module imports from it.
         * `[ ]`   Purpose retired: admitting an artifact type at dispatch.
      * `[ ]`   Removed provider: `_shared/types/file_manager.types.ts` (`FileType`).
         * `[ ]`   Layer classification: shared type surface.
         * `[ ]`   Direction: inbound, and closed by this node in `enqueueModelCall.interface.ts`, `enqueueModelCall.mock.ts`, `enqueueModelCall.interface.test.ts`, `enqueueModelCall.guard.test.ts`, `enqueueModelCall.test.ts` and `enqueueModelCall.integration.test.ts` — the member it typed is gone from all six.
         * `[ ]`   Purpose retired: typing the deleted parameter and the fixtures that set it.
      * `[ ]`   Confirm:
         * `[ ]`   `EnqueueModelCallDeps` is unchanged — `logger`, `netlifyQueueUrl`, `netlifyApiKey`, `apiKeyForProvider`, `computeJobSig`. No dependency is added.
         * `[ ]`   The composition root is untouched: `dialectic-worker/index.ts` binds `BoundEnqueueModelCallFn` over the deps object alone and relays `params` from its caller, so nothing there names the removed member.
         * `[ ]`   No reverse dependency and no new edge in either direction; this node only removes imports.
      * `[ ]`   `context_slice`
         * `[ ]`   No new interface is required from any dependency. The slice this module takes narrows by exactly the two providers above.

   * `[ ]`   `enqueueModelCall.interface.test.ts`
      * `[ ]`   `Contract: EnqueueModelCallParams declares six fields` becomes a five-field case: `dbClient`, `job`, `providerRow`, `userAuthToken`, `userConfig`, asserting `5`. The `Record<keyof EnqueueModelCallParams, true>` form is exhaustive in both directions, so this case is the proof that `output_type` is not a member — a literal still carrying it fails to compile.
      * `[ ]`   `Contract: EnqueueModelCallParams.output_type is FileType` is deleted; the member it asserts no longer exists.
      * `[ ]`   The `FileType` import is deleted, the two cases above being its only consumers in this file.
      * `[ ]`   Every other case is unchanged — the five-key `EnqueueModelCallDeps` case, the payload case, both return-arm cases, both `AiStreamEventData` cases, the `AiStreamEventBody` case, the `BoundEnqueueModelCallFn` signature case, the `computeJobSig` cases, and all three `userConfig`/`user_config` shape cases.

   * `[ ]`   `enqueueModelCall.interface.ts`
      * `[ ]`   `EnqueueModelCallParams` drops `output_type: FileType;` and declares `dbClient`, `job`, `providerRow`, `userAuthToken` and `userConfig` only.
      * `[ ]`   The `import type { FileType } from '../../_shared/types/file_manager.types.ts';` line is deleted, that member being its only consumer in this file.
      * `[ ]`   `EnqueueModelCallDeps`, `EnqueueModelCallPayload`, `EnqueueModelCallSuccessReturn`, `EnqueueModelCallErrorReturn`, `EnqueueModelCallReturn`, `AiStreamEventData`, `AiStreamEventBody`, `EnqueueModelCallFn` and `BoundEnqueueModelCallFn` are unchanged.

   * `[ ]`   `enqueueModelCall.interaction.spec`
      * `[ ]`   Entry: the function opens on the provider-config decision. No artifact-type check precedes it, and nothing about `params` is inspected before `params.providerRow.config`.
      * `[ ]`   Provider config: `isAiModelExtendedConfig(params.providerRow.config)` false → log `enqueueModelCall: invalid providerRow.config`, return `{ error: Error('Invalid providerRow.config: does not satisfy AiModelExtendedConfig'), retriable: false }`. No dependency call, no write.
      * `[ ]`   API key: `deps.apiKeyForProvider(params.providerRow.api_identifier)` falsy → log `enqueueModelCall: missing API key for provider`, return `{ error: Error('No API key found for provider: …'), retriable: false }`. No write.
      * `[ ]`   Job owner: `params.job.user_id` absent or not a string → log `enqueueModelCall: job.user_id is missing or not a string`, return `{ error: Error('job.user_id is required to compute the job signature'), retriable: false }`. No write.
      * `[ ]`   Signature: `deps.computeJobSig(job.id, job.user_id, job.created_at)` throws → log `enqueueModelCall: computeJobSig threw`, return that error (or `new Error(String(err))`) with `retriable: false`. No write.
      * `[ ]`   Row status: `params.dbClient.from('dialectic_generation_jobs').update({ status: 'queued' }).eq('id', params.job.id)` returns an error → log `enqueueModelCall: DB update failed`, return `{ error: new Error(dbError.message), retriable: true }`. This is the first write on every path.
      * `[ ]`   Size cap: the serialized `AiStreamEventBody` exceeding 500 KB → log `enqueueModelCall: event body exceeds 500 KB size limit`, return `{ error: Error('Event body exceeds 500 KB size limit: … bytes'), retriable: false }`. The row is already `queued`; that ordering is unchanged.
      * `[ ]`   Queue POST: a non-2xx response → log `enqueueModelCall: Netlify queue returned non-2xx`, return `{ error: Error('Netlify queue returned status …'), retriable: true }`. A thrown fetch → log `enqueueModelCall: fetch threw network error`, return that error with `retriable: true`. Otherwise `{ queued: true }`.
      * `[ ]`   Event body, unchanged: `job_id`, `api_identifier`, `model_config`, `chat_api_request`, `sig`, `user_config`. It carries no artifact type before this node and carries none after, which is why deleting the parameter changes nothing on the wire.
      * `[ ]`   Ordering and side effects: at most one row write per call; zero writes on the four validation branches; the POST follows the write on every success path.

   * `[ ]`   `enqueueModelCall.mock.ts`
      * `[ ]`   `createMockEnqueueModelCallParams`'s base literal drops `output_type: FileType.HeaderContext` and supplies `dbClient`, `job`, `providerRow`, `userAuthToken` and `userConfig` only.
      * `[ ]`   The `FileType` import is deleted, that default being its only consumer in this file.
      * `[ ]`   `EnqueueModelCallParamsOverrides` and `EnqueueModelCallParamsCorruptions` keep their names and forms and follow the narrowed member set through `Partial` and `keyof`; `invalidateEnqueueModelCallParams` is unchanged.
      * `[ ]`   Every other symbol in the file keeps its name, shape and defaults — the deps, payload and both return builders and invalidators, the `AiStreamEventData`/`AiStreamEventBody` builders and invalidators, `mockEnqueueModelCallFn` and `mockBoundEnqueueModelCallFn`.

   * `[ ]`   `enqueueModelCall.guard.test.ts`
      * `[ ]`   `isEnqueueModelCallParams returns true for full mock params` stands, and is now the proof that a params object carrying no artifact type is accepted.
      * `[ ]`   The four missing-member cases — `dbClient`, `job`, `providerRow`, `userAuthToken` — each drop the `output_type: full.output_type` line from their partial literal and keep their `false` assertions; that member no longer exists on the mock they read it from.
      * `[ ]`   `isEnqueueModelCallParams returns false when output_type is missing` is deleted: absence of a member the type does not declare is not a rejection condition.
      * `[ ]`   `isEnqueueModelCallParams returns false when output_type is not a FileType` is deleted; its `invalidateEnqueueModelCallParams({ output_type: … })` corruption addresses a key outside `keyof EnqueueModelCallParams` once the member is gone.
      * `[ ]`   `isEnqueueModelCallParams accepts every model-call output type` is deleted; the admission it proves no longer exists, and no case replaces it.
      * `[ ]`   The `FileType` import is deleted, those three cases being its only consumers in this file.
      * `[ ]`   A case is added asserting `isEnqueueModelCallParams` returns `true` for a params object built by `createMockEnqueueModelCallParams` and then given a stray `output_type` key, pinning that this guard neither requires nor rejects the retired member and sweeps no unknown keys — the shape it has today for every non-payload params guard in the repo.
      * `[ ]`   Every other case is unchanged — the `isEnqueueModelCallDeps` checklist, the non-record roots for both, and the `isEnqueueModelCallPayload`, `isEnqueueModelCallSuccessReturn`, `isEnqueueModelCallErrorReturn`, `isAiStreamEventData` and `isAiStreamEventBody` checklists.

   * `[ ]`   `enqueueModelCall.guard.ts`
      * `[ ]`   `isEnqueueModelCallParams`'s `keys` array drops `"output_type"`, leaving `"dbClient"`, `"job"`, `"providerRow"`, `"userAuthToken"`, `"userConfig"`.
      * `[ ]`   The `if (!isFileType(v.output_type)) return false;` block is deleted, and the `isFileType` import with it.
      * `[ ]`   The `isRecord` checks on `dbClient`, `job`, `providerRow` and `userConfig`, and the `typeof v.userAuthToken !== "string"` check, are unchanged, as is the guard's boolean contract.
      * `[ ]`   `isEnqueueModelCallDeps`, `isEnqueueModelCallPayload`, `isEnqueueModelCallSuccessReturn`, `isEnqueueModelCallErrorReturn`, `isAiStreamEventData` and `isAiStreamEventBody` are unchanged, as are the `isRecord`, `isAiModelExtendedConfig`, `isChatApiRequest` and `isUserConfig` imports they consume.

   * `[ ]`   `enqueueModelCall.test.ts`
      * `[ ]`   `enqueueModelCall returns retriable false when output_type is invalid` is deleted; it is the gate's own case, and its assertions that neither `fetch` nor the row update ran are inseparable from the branch being removed.
      * `[ ]`   `enqueueModelCall accepts FileType.CompressedContext and proceeds to fetch` and `enqueueModelCall accepts FileType.CompressedContextRawJson and proceeds to fetch` are deleted. Both prove admission through a gate that no longer exists; with no artifact type in the params there is no compression-specific admission left to assert, and the happy-path case already proves a well-formed call reaches `fetch` and writes `status: 'queued'`.
      * `[ ]`   The `FileType` import is deleted, those three cases being its only consumers in this file.
      * `[ ]`   Every other case is unchanged and is this node's regression oracle — the happy path and its row-update assertions, the invalid-provider-config, missing-API-key, missing-`job.user_id`, `computeJobSig`-throw, DB-update-failure, oversize-body, non-2xx and fetch-throw cases, the `sig` and `user_config` event-body assertions, and every `retriable` classification.

   * `[ ]`   `enqueueModelCall.ts`
      * `[ ]`   The opening `if (!isModelContributionFileType(params.output_type) && !isCompressedContextFileType(params.output_type) && !isCompressedContextRawJsonFileType(params.output_type))` block — its `deps.logger.error('enqueueModelCall: invalid output_type', …)` call and its `Invalid output_type: …` return — is deleted in full.
      * `[ ]`   The `isCompressedContextFileType`, `isCompressedContextRawJsonFileType` and `isModelContributionFileType` import block is deleted; the `isAiModelExtendedConfig` import stays and is the first check the function now performs.
      * `[ ]`   `NETLIFY_MAX_EVENT_BYTES`, the API-key resolution, the `job.user_id` check, the `computeJobSig` call, the row update, the `AiStreamEventData`/`AiStreamEventBody` construction, the size cap, the POST and every error return are unchanged.

   * `[ ]`   `enqueueModelCall.integration.test.ts`
      * `[ ]`   All three `EnqueueModelCallParams` literals drop their `output_type: FileType.HeaderContext` line; each keeps `dbClient`, `job`, `providerRow`, `userAuthToken` and `userConfig` exactly as it sets them now.
      * `[ ]`   The `FileType` import is deleted, those three literals being its only consumers in this file.
      * `[ ]`   Every assertion is unchanged — the queued row status, the event body written to the stubbed `fetch`, the authorization header, and the failure classifications. The suite continues to mock only the Supabase client and `fetch`.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward and this node only removes edges: the module drops its imports of `FileType` and of four `type_guards.file_manager.ts` predicates, and adds none.
      * `[ ]`   `enqueueModelCall.provides.ts` needs no edit: it re-exports `EnqueueModelCallParams` and every guard by name, and no exported name changes.
      * `[ ]`   No cycle: neither `_shared` nor `dialectic-service` imports this module, and the composition root imports it in the one existing direction.

   * `[ ]`   `requirements`
      * `[ ]`   `EnqueueModelCallParams` declares five members and `output_type` is not among them — interface test.
      * `[ ]`   `isEnqueueModelCallParams` returns `true` for a five-member params object and for one carrying a stray `output_type`, and `false` when any of the five is absent — guard test.
      * `[ ]`   No input causes `enqueueModelCall` to return an `Invalid output_type` error, that branch no longer existing — proven by its absence from the implementation and by the deletion of the case that asserted it.
      * `[ ]`   A well-formed call reaches `fetch` and writes `status: 'queued'` regardless of what the response will later be persisted as — unit test happy path, integration test.
      * `[ ]`   Every invalid-provider-config, missing-API-key, missing-`job.user_id`, signature-throw, DB-failure, oversize-body, non-2xx and fetch-throw path returns exactly the error and `retriable` flag it returns now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts **[BE] Carry the victim scorer as an injected collaborator on `CompressPromptDeps` rather than as data on `CompressPromptPayload`**

   * `[ ]`   `objective`
      * `[ ]`   Solve a collaborator relayed as data. `compressionStrategy: ICompressionStrategy` is a member of `CompressPromptPayload`, so a function is threaded from `processSimpleJob`'s `PrepareModelJobPayload` literal, through `prepareModelJob`, through `calculateAffordability`, into `compressPrompt` — three contracts declaring a member none of them calls, to reach the one function that does. A scoring function is a collaborator: it is supplied where dependencies are supplied, and payload carries the data the function operates on.
      * `[ ]`   Functional goals:
         * `[ ]`   `CompressPromptDeps` declares `compressionStrategy: ICompressionStrategy` alongside `logger`, `ragService`, `embeddingClient`, `tokenWalletService` and `countTokens`.
         * `[ ]`   `CompressPromptPayload` declares `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `chatApiRequest` and `tokenizerDeps`, and no scorer.
         * `[ ]`   `isCompressPromptDeps` requires the scorer and rejects its absence and a non-function value; `isCompressPromptPayload` checks no scorer and accepts a payload without one.
         * `[ ]`   `buildCompressPromptDeps` resolves the scorer from its overrides against the file's existing `defaultCompressionStrategy`; `buildCompressPromptPayload` resolves and returns no scorer.
         * `[ ]`   The body's single `payload.compressionStrategy(...)` call reads `deps.compressionStrategy(...)` and is otherwise identical, arguments included.
         * `[ ]`   `compressPrompt.mock.ts` carries the four symbols owed to each owned object type — `CompressPromptDeps`, `CompressPromptParams`, `CompressPromptPayload`, `CompressPromptSuccessReturn`, `CompressPromptErrorReturn` — and a function mock for each owned function type, `CompressPromptFn` and `BoundCompressPromptFn`. Overrides types are `Partial<T>`, corruption types are `{ [K in keyof T]?: unknown }`, every builder takes one optional overrides object, and every property has a default.
         * `[ ]`   The configurable harness `createCompressPromptMock` is deleted with its `CreateCompressPromptMockOptions` options bag and its `CompressPromptMockCall` recording type, as is the `buildBoundCompressPromptFn` closure factory. A test needing a specific outcome declares its own production-typed function composed from builders.
         * `[ ]`   `buildTokenizerDeps` is deleted in favour of `buildCountTokensDeps` from `_shared/utils/tokenizer_utils.mock.ts` — `CountTokensDeps` is an imported type whose home package already carries the compliant four-symbol set, so this file duplicates it.
         * `[ ]`   `describeCompressPromptReturnForTestFailure` moves into `compressPrompt.test.ts`, its only consumer. Its type is invented rather than named by the interface, so it is not a mock of this interface and does not live in the mock file.
         * `[ ]`   `compressPrompt.provides.ts` exports the resulting surface: the retired symbols leave it, the new builders, invalidators and function mocks join it.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   This node settles the contract. Nothing about candidate scoring, RAG retrieval, the debit, the token loop or any return changes; the existing unit and integration suites are its regression oracle, and WS-D rewrites this body against a contract that is already right.
         * `[ ]`   `buildResourceDocument` and `buildChatApiRequest` stay in this file. `ResourceDocument` and `ChatApiRequest` are owned by `_shared/types.ts`, which exports no builder for either — searched by return-type invariant across `supabase/functions`, the only hits being this file and two local test helpers — so relocating them is an edit to a second source file and belongs to a node of its own. They are used as they stand and no second copy is written beside them.
         * `[ ]`   Four files outside this module consume symbols this node retires and go transiently non-compilable: `prepareModelJob.test.ts` and `prepareModelJob.integration.test.ts` on `createCompressPromptMock` and `buildBoundCompressPromptFn`, and `createJobContext/JobContext.mock.ts` and `createJobContext/createJobContext.test.ts` on `buildCompressPromptParams`'s changed signature. Each is a support file of a later node in this workstream — `prepareModelJob` and `createJobContext` respectively — and none is edited here.
         * `[ ]`   `CompressPromptParams`, `CompressPromptSuccessReturn`, `CompressPromptErrorReturn`, the return union, `CompressPromptFn` and `BoundCompressPromptFn` are unchanged. The function keeps its `(deps, params, payload)` shape and its trusted-form payload.
         * `[ ]`   `ICompressionStrategy`, `CompressionStrategyDeps`, `CompressionStrategyParams` and `CompressionStrategyPayload` are owned by `_shared/utils/vector_utils.interface.ts` and are not touched; this node moves a member, it does not retype the collaborator.
         * `[ ]`   Two `CompressPromptDeps` literals go non-compilable at this node — the `boundCompressPrompt` closure in `dialectic-worker/index.ts` and the one in `createJobContext.ts`'s `createPrepareModelJobContext` slicer — as do the relay declarations in `calculateAffordability`, `prepareModelJob` and `processSimpleJob`. None is edited here.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test or unit test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer orchestration of prompt compression, and the contract it declares for the collaborators it calls.
      * `[ ]`   The role is correct because this function is the only caller of the scorer, so the slot the scorer occupies is this interface's to declare.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `calculateAffordability`, `prepareModelJob` or `processSimpleJob`; each drops the relayed member in its own node later in this workstream.
         * `[ ]`   Do not edit `dialectic-worker/index.ts`; the composition root binds the scorer in this workstream's last node.
         * `[ ]`   Do not edit `_shared/utils/vector_utils.ts` or its interface; the scorer's own contract and its embedding-free rewrite are WS-D's.
         * `[ ]`   Do not rewrite the body, the candidate loop, the debit or any error. Repoint the one read and nothing else.
         * `[ ]`   Do not relocate `buildResourceDocument` or `buildChatApiRequest` into `_shared`, and do not write a second copy of either anywhere. Their types belong to another module, and moving them is that module's node.
         * `[ ]`   Do not edit `prepareModelJob`'s or `createJobContext`'s suites to absorb the retired mock symbols; each is closed by its own node later in this workstream.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/compressPrompt` — making an over-budget working set fit, and the contract for every collaborator that work requires.
      * `[ ]`   Inside boundary:
         * `[ ]`   Which collaborators this function needs and in which slot each is supplied.
         * `[ ]`   The data the function operates on: the documents, the history, the user prompt, the request and the tokenizer deps.
      * `[ ]`   Outside boundary:
         * `[ ]`   How victims are scored, owned by `_shared/utils/vector_utils.ts`.
         * `[ ]`   Which concrete scorer is supplied, decided at the composition root.
         * `[ ]`   Whether compression is warranted at all, decided by `prepareModelJob`.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`).
         * `[ ]`   Layer classification: shared utility contract.
         * `[ ]`   Direction: inbound; `compressPrompt.interface.ts` and `compressPrompt.mock.ts` already import this type for the payload member, so the edge exists and no new direction is opened — the member changes slot, the import does not move.
         * `[ ]`   Purpose: type the injected victim scorer.
      * `[ ]`   Confirm:
         * `[ ]`   `CompressPromptDeps`'s other five members — `logger`, `ragService`, `embeddingClient`, `tokenWalletService`, `countTokens` — and their providers are unchanged.
         * `[ ]`   The scorer is invoked with `{ dbClient: params.dbClient, embeddingClient: deps.embeddingClient, logger: deps.logger }`, `{ inputsRelevance: params.inputsRelevance }` and `{ documents, history, currentUserPrompt }` exactly as it is today. Where its own arguments come from does not change because the function itself moved slot.
         * `[ ]`   No reverse dependency: `_shared` gains no import of this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From `vector_utils.interface.ts`: the `ICompressionStrategy` type only, already imported with `import type`.

   * `[ ]`   `compressPrompt.interface.test.ts`
      * `[ ]`   A case proves the scorer is a member of `CompressPromptDeps` by typed assignment: a `CompressPromptDeps` literal built from `buildCompressPromptDeps()` assigns to `CompressPromptDeps["compressionStrategy"]`, and an `ICompressionStrategy` value assigns to that member type.
      * `[ ]`   A case proves the deps surface by exhaustive key record: `Record<keyof CompressPromptDeps, true>` over `logger`, `ragService`, `embeddingClient`, `tokenWalletService`, `countTokens`, `compressionStrategy`, asserting six.
      * `[ ]`   A case proves the payload surface the same way: `Record<keyof CompressPromptPayload, true>` over `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `chatApiRequest`, `tokenizerDeps`, asserting five. Being exhaustive in both directions, this case is the proof the scorer is no longer a payload member.
      * `[ ]`   The thirteen existing cases each drop the `createCompressPromptMock` round trip that harness's deletion retires. Each keeps its name and its contract, and asserts the same shape directly on the value it already builds: the success cases assert `chatApiRequest`, `resolvedInputTokenCount` and `resourceDocuments` on a `buildCompressPromptSuccessReturn(...)` value, and the error cases assert the message, `retriable` and the absence of `chatApiRequest` on a `buildCompressPromptErrorReturn(...)` value, `ContextWindowError` membership included where they assert it now. Configuring a mock to return a value and then asserting the value it was handed proves the fixture, not the contract; the assertions were never about the call, so removing the call costs no coverage.
      * `[ ]`   `buildCompressPromptParams` is called with an overrides object rather than a positional `dbClient`, following its new signature; the `DbClient(...)` cast is passed as the `dbClient` override where a case configures its own client, and omitted where the default serves.

   * `[ ]`   `compressPrompt.interface.ts`
      * `[ ]`   `CompressPromptDeps` gains `compressionStrategy: ICompressionStrategy;`.
      * `[ ]`   `CompressPromptPayload` drops `compressionStrategy: ICompressionStrategy;` and declares its five data members only.
      * `[ ]`   The `import type { ICompressionStrategy } from "../../_shared/utils/vector_utils.interface.ts";` line stays; the member it types is now on `CompressPromptDeps`.
      * `[ ]`   `CompressPromptParams`, both return arms, the return union, `CompressPromptFn` and `BoundCompressPromptFn` are unchanged.

   * `[ ]`   `compressPrompt.interaction.spec`
      * `[ ]`   Only the scorer's supply changes. Every condition, decision, dependency call and outcome below the scorer call is unchanged, and this spec restates the branch that moves rather than the whole body, which WS-D rewrites.
      * `[ ]`   Entry, unchanged: any `payload.resourceDocuments` entry missing `document_key`, `type` or `stage_slug` → `{ error: Error('Compression requires document identity: document_key, type, and stage_slug must be present.'), retriable: false }`, before any dependency call.
      * `[ ]`   Model config, unchanged: a non-finite `context_window_tokens` → `{ error: Error('context_window_tokens is not defined'), retriable: false }`; an undefined `provider_max_input_tokens` → `{ error: Error('Provider max input tokens is not defined'), retriable: false }`.
      * `[ ]`   Candidate acquisition, the branch this node changes: the dependency called is `deps.compressionStrategy`, not `payload.compressionStrategy`. It is awaited once, with the same three arguments it receives today, and its result spreads into the `CompressionCandidate[]` local exactly as now. The count is logged through `deps.logger.info` with the existing message.
      * `[ ]`   Ordering and side effects: the scorer is still called exactly once, after the identity and model-config validations and before the `dialectic_memory` indexed-id read, so nothing about call order or the number of calls changes.

   * `[ ]`   `compressPrompt.mock.ts`
      * `[ ]`   Five owned object types, four symbols each, production-named: `CompressPromptDepsOverrides` / `buildCompressPromptDeps` / `CompressPromptDepsCorruptions` / `invalidateCompressPromptDeps`, and the same quartet for `CompressPromptParams`, `CompressPromptPayload`, `CompressPromptSuccessReturn` and `CompressPromptErrorReturn`. Every overrides type is `Partial<T>`; every corruption type is `{ [K in keyof T]?: unknown }`; every invalidator returns `unknown` as `{ ...buildX(), ...corruptions }`.
      * `[ ]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. The hand-written per-member `overrides?.x !== undefined ? overrides.x : default` chains and the hand-written overrides types go with that form.
      * `[ ]`   `buildCompressPromptDeps` defaults `logger` to `new MockLogger()`, `ragService` to `new MockRagService()`, `embeddingClient` to `new EmbeddingClient(mockOpenAiAdapter)`, `tokenWalletService` to `createMockAdminTokenWalletService().instance`, `countTokens` to `createMockCountTokens()`, and `compressionStrategy` to the module-level `defaultCompressionStrategy` — the same defaults the file supplies today, plus the member this node moves in. `defaultCompressionStrategy` keeps its name, position and `async () => []` body; only its consumer changes.
      * `[ ]`   `buildCompressPromptParams(overrides?: CompressPromptParamsOverrides)` loses its positional `dbClient` parameter and defaults that member to a client from `createMockSupabaseClient`, exactly as `createMockEnqueueModelCallParams` does for the same slot. Its other thirteen defaults are the values it supplies today. A caller with a configured client passes it as the `dbClient` override.
      * `[ ]`   `buildCompressPromptPayload` composes nested builders rather than restating their shapes: `resourceDocuments` from `buildResourceDocument()`, `chatApiRequest` from `buildChatApiRequest(...)`, `tokenizerDeps` from `buildCountTokensDeps()`, `conversationHistory` `[]`, `currentUserPrompt` its existing default. It returns no `compressionStrategy`.
      * `[ ]`   `buildCompressPromptSuccessReturn(overrides?)` stops requiring a full value: it defaults `chatApiRequest` and `resourceDocuments` from those same nested builders and `resolvedInputTokenCount` to a fixed number. `buildCompressPromptErrorReturn(overrides?)` stops taking positional arguments and defaults `error` to `new Error("mock-compress-prompt-error")` and `retriable` to `false`.
      * `[ ]`   Two function mocks, one per owned function type: `mockCompressPrompt: CompressPromptFn` and `mockBoundCompressPrompt: BoundCompressPromptFn`, each returning `buildCompressPromptSuccessReturn()`, with identical signatures, no extra parameters, no options, and no call recording.
      * `[ ]`   Deleted: `createCompressPromptMock`, `CreateCompressPromptMockOptions`, `CompressPromptMockCall` and `buildBoundCompressPromptFn`. The first is a harness bundle with an options bag and a `calls` array, the last a parameterized closure factory; a test needing another outcome declares its own `BoundCompressPromptFn` composed from builders, and records calls with the runner's spy at the call site.
      * `[ ]`   Deleted: `buildTokenizerDeps`. Its consumers import `buildCountTokensDeps` from `_shared/utils/tokenizer_utils.mock.ts`, which already exports the compliant quartet for `CountTokensDeps`; this file's `createMockCountTokens` import from that same module proves the edge exists.
      * `[ ]`   Moved out: `describeCompressPromptReturnForTestFailure`, into `compressPrompt.test.ts` unchanged.
      * `[ ]`   Retained as they stand: `buildResourceDocument` and `buildChatApiRequest`, whose types this interface does not own, and `DbClient`, the cast helper for the external Supabase client that `types.md`'s external-client carve-out admits.

   * `[ ]`   `compressPrompt.guard.test.ts`
      * `[ ]`   `isCompressPromptDeps accepts valid deps and rejects invalid deps` gains two cases: a deps object carrying the other five members and no `compressionStrategy` returns `false`; one carrying `compressionStrategy: "not-a-function"` returns `false`. Its existing valid, null, undefined, `{}`, missing-`countTokens` and non-function-`countTokens` assertions stand.
      * `[ ]`   `isCompressPromptPayload accepts valid payload and rejects invalid payload` drops `compressionStrategy: valid.compressionStrategy` from its partial literal — that member is no longer on the built payload it reads it from — and keeps its `tokenizerDeps: "not-deps"` rejection.
      * `[ ]`   A case is added asserting `isCompressPromptPayload` returns `true` for a payload carrying no scorer, which is the load-bearing proof that the payload guard stopped requiring it.
      * `[ ]`   Every negative fixture in the file is drawn from this module's invalidators rather than hand-assembled from a built value's members: `invalidateCompressPromptDeps({ countTokens: "not-a-function" })`, `invalidateCompressPromptDeps({ compressionStrategy: "not-a-function" })`, `invalidateCompressPromptParams({ walletBalance: "not-a-number" })`, `invalidateCompressPromptParams({ inputsRelevance: "not-an-array" })`, `invalidateCompressPromptPayload({ tokenizerDeps: "not-deps" })`, and the two return invalidators for their existing wrong-typed cases. Missing-member cases keep the rest-destructure form over a built value. Every assertion and every rejected condition stands; only where the fixture comes from changes.
      * `[ ]`   `isBoundCompressPromptFn accepts async functions and rejects non-functions` takes `mockBoundCompressPrompt` as its positive fixture in place of the deleted harness's return; its five negative assertions are unchanged.
      * `[ ]`   `buildCompressPromptParams` is called with an overrides object rather than a positional `dbClient`, per its new signature.
      * `[ ]`   `isCompressPromptParams`, `isCompressPromptSuccessReturn` and `isCompressPromptErrorReturn` keep every case and every asserted outcome.

   * `[ ]`   `compressPrompt.guard.ts`
      * `[ ]`   `isCompressPromptDeps` gains `if (!("compressionStrategy" in value) || typeof value.compressionStrategy !== "function") return false;`, appended after the `countTokens` check, in the file's existing form.
      * `[ ]`   `isCompressPromptPayload` deletes that same check; its `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `chatApiRequest` and `tokenizerDeps` checks are unchanged.
      * `[ ]`   Every guard keeps its boolean contract; no guard throws, these covering objects assembled in trusted TypeScript.
      * `[ ]`   `isCompressPromptParams`, `isCompressPromptSuccessReturn`, `isCompressPromptErrorReturn` and `isBoundCompressPromptFn` are unchanged.

   * `[ ]`   `compressPrompt.test.ts`
      * `[ ]`   Every case that passes a scorer moves that one override from its `buildCompressPromptPayload({ … })` call to its `buildCompressPromptDeps({ … })` call, keeping the same local (`strategy`, `oneCandidateStrategy`, `anchorStrategy`, `mockCompressionStrategy`, `capturingCompressionStrategy`, `orderedStrategy`, `wrapperStrategy`) and changing nothing else about the case. Every case that passes none is untouched, its default now arriving from the deps builder.
      * `[ ]`   `forwards inputsRelevance to compressionStrategy params and rag getContextForModel` and `forwards empty inputsRelevance as [] to compressionStrategy params and rag getContextForModel` keep their capturing strategies and every assertion: `inputsRelevance` still reaches the scorer from `params`, which is the point of the pair, and moving the function's slot must not move where its arguments come from.
      * `[ ]`   `wrapper compressionStrategy exposes non-decreasing effectiveScore candidate list` keeps its wrapper and its ordering assertions.
      * `[ ]`   `describeCompressPromptReturnForTestFailure` is declared in this file, verbatim from the mock, and its import from `compressPrompt.mock.ts` is dropped; every call site that passes it as an assertion message is unchanged.
      * `[ ]`   `buildTokenizerDeps()` calls become `buildCountTokensDeps()`, imported from `_shared/utils/tokenizer_utils.mock.ts`. The two builders return the same shape — a character-index `getEncoding`, a length-based `countTokensAnthropic` and a logger — so no count in any case changes.
      * `[ ]`   `buildCompressPromptParams(DbClient(client), { … })` calls become `buildCompressPromptParams({ dbClient: DbClient(client), … })`, per the builder's new signature. Each case keeps the exact overrides it sets today.
      * `[ ]`   Every assertion in the file is unchanged — the ContextWindowError branches, the single-compression replacement, the debit idempotency key, the indexed-candidate skip and the resolved-count arithmetic. This suite is the node's regression oracle: a scorer supplied through a different slot must produce byte-identical outcomes.

   * `[ ]`   `compressPrompt.ts`
      * `[ ]`   The `...await payload.compressionStrategy(` line becomes `...await deps.compressionStrategy(`. Its three arguments, the spread into the `CompressionCandidate[]` local and the `deps.logger.info` line beneath it are unchanged.
      * `[ ]`   No other line of the function changes: not the identity loop, the model-config validations, the token counts, the `dialectic_memory` read, the candidate loop, the RAG calls, the debit, the post-loop window checks or any return.

   * `[ ]`   `compressPrompt.provides.ts`
      * `[ ]`   The value export list drops `buildBoundCompressPromptFn`, `buildTokenizerDeps`, `createCompressPromptMock` and `describeCompressPromptReturnForTestFailure`, and gains `invalidateCompressPromptDeps`, `invalidateCompressPromptParams`, `invalidateCompressPromptPayload`, `invalidateCompressPromptSuccessReturn`, `invalidateCompressPromptErrorReturn`, `mockCompressPrompt` and `mockBoundCompressPrompt`.
      * `[ ]`   The type export list drops `CompressPromptMockCall` and `CreateCompressPromptMockOptions`, keeps the three overrides types, and gains `CompressPromptSuccessReturnOverrides`, `CompressPromptErrorReturnOverrides` and the five corruption types.
      * `[ ]`   `buildChatApiRequest`, `buildResourceDocument`, `DbClient`, the five builders, every interface type and every guard keep their exports; consumers reach this module's mock through this file, so the mock surface it publishes is the surface they get.

   * `[ ]`   `compressPrompt.integration.test.ts`
      * `[ ]`   All three cases move their `compressionStrategy` local from the payload construction to the deps construction; each keeps its `const compressionStrategy: ICompressionStrategy = async () => [candidate];` declaration and its candidate.
      * `[ ]`   `buildTokenizerDeps` is replaced by `buildCountTokensDeps` from `_shared/utils/tokenizer_utils.mock.ts`, and the import from `compressPrompt.mock.ts` that existed only for it is dropped.
      * `[ ]`   Every assertion is unchanged, and the suite keeps mocking only Supabase and the RAG boundary.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this module imports `ICompressionStrategy` from `_shared/utils/vector_utils.interface.ts` and `buildCountTokensDeps` from `_shared/utils/tokenizer_utils.mock.ts`, and exports nothing back to either.
      * `[ ]`   `compressPrompt.provides.ts` is edited by this node, the mock surface being part of the module's public surface: a consumer's tests import this module's official mock rather than hand-rolling a double, so a symbol that leaves the mock leaves the barrel with it.
      * `[ ]`   No cycle: `vector_utils` and `tokenizer_utils` import nothing from `dialectic-worker`.

   * `[ ]`   `requirements`
      * `[ ]`   `compressionStrategy` is a member of `CompressPromptDeps` and not of `CompressPromptPayload` — interface test, both exhaustive key records.
      * `[ ]`   `isCompressPromptDeps` rejects deps missing the scorer and deps whose scorer is not a function — guard test.
      * `[ ]`   `isCompressPromptPayload` accepts a payload carrying no scorer — guard test.
      * `[ ]`   The scorer is called once, with `params.inputsRelevance` and the working documents, history and user prompt, when supplied through deps — unit test, the two `inputsRelevance` forwarding cases.
      * `[ ]`   Every owned object type has a builder returning a valid production object from one optional `Partial<T>` overrides argument, and an invalidator returning `unknown` — guard test, whose every negative fixture is drawn from those invalidators and whose every positive fixture is drawn from those builders.
      * `[ ]`   Each owned function type has a function mock that is that type exactly, with no options bag, no factory parameter and no call recording — guard test, `isBoundCompressPromptFn` over `mockBoundCompressPrompt`.
      * `[ ]`   `compressPrompt.provides.ts` exports every symbol the mock file now owns and none it retired — proven by the module's own suites compiling against the barrel.
      * `[ ]`   Every existing compression outcome — candidate skip, single-document replacement, debit idempotency, each `ContextWindowError` branch and each NSF branch — returns exactly what it returns now — unit test and integration test, existing cases unchanged.

* `[ ]`   supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts **[BE] Separate affordability from compression: no `compressPrompt` dep, no `compressionStrategy` payload member, no pending or compressed return flavor**

   * `[ ]`   `objective`
      * `[ ]`   Solve a function that answers two questions and owns a side effect. `calculateAffordability` decides whether a request is affordable and what the output cap is, and then — on the oversized branch — calls `compressPrompt`, waits for it, and reports its result as a `wasCompressed: true` flavor of its own return. Compression is a different responsibility: it spends a wallet, spawns jobs and rewrites a working set, none of which a verdict function does. The caller cannot decide what an over-budget request warrants, because the decision has already been taken inside the callee, which is why the recursion guard a COMPRESS job needs has nowhere to live.
      * `[ ]`   Functional goals:
         * `[ ]`   `CalculateAffordabilityDeps` declares `logger`, `countTokens` and `getMaxOutputTokens`, and no `compressPrompt`.
         * `[ ]`   `CalculateAffordabilityPayload` declares `resourceDocuments`, `conversationHistory`, `currentUserPrompt` and `systemInstruction` — the four values the token count reads — and neither `compressionStrategy` nor `chatApiRequest`.
         * `[ ]`   `CalculateAffordabilityParams` declares `jobId`, `walletBalance`, `extendedModelConfig`, `inputRate`, `outputRate` and `userConfig`, and drops `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance`, every one of which exists solely to be relayed into `CompressPromptParams`.
         * `[ ]`   The return has exactly two arms. `CalculateAffordabilitySuccessReturn` is declared as the union of `CalculateAffordabilityWithinBudgetReturn` (`overBudget: false`, `maxOutputTokens`, `resolvedInputTokenCount`) and `CalculateAffordabilityOverBudgetReturn` (`overBudget: true`, `resolvedInputTokenCount`, `finalTargetThreshold`, `balanceAfterCompression`); `CalculateAffordabilityReturn` is `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn`. `wasCompressed`, `CalculateAffordabilityDirectReturn` and `CalculateAffordabilityCompressedReturn` are gone.
         * `[ ]`   The over-budget arm carries the sizing this function's solver computes — `finalTargetThreshold` and `balanceAfterCompression` — because `CompressPromptParams` requires both and no other function computes them.
         * `[ ]`   The function performs no dependency call other than `deps.countTokens` and `deps.getMaxOutputTokens`, and causes no side effect on any branch.
         * `[ ]`   `calculateAffordability.mock.ts` carries the four symbols owed to each owned object type and one function mock per owned function type, in the forms `mocks.md` prescribes.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Every affordability verdict this function reaches today it reaches unchanged: the same token count, the same solver, the same cost estimates, the same rationality thresholds, the same NSF and `ContextWindowError` messages and the same `retriable` flags. Only the compression call, the members that fed it and the flavor that reported it leave.
         * `[ ]`   `UserConfig`, `TierOutputCapTokens`, `GetMaxOutputTokensFn`, `isUserConfig`, `isTierOutputCapTokens` and `isGetMaxOutputTokensFn` are unchanged. `isUserConfig`'s relocation is WS-D's.
         * `[ ]`   The inline `tokenizerDeps` this function builds for `deps.countTokens` is unchanged; replacing it with the real tokenizer is WS-D's.
         * `[ ]`   The function keeps its `(deps, params, payload)` shape and its trusted-form payload; nothing here is guarded on entry.
         * `[ ]`   Consumers outside this module go transiently non-compilable and are not edited here: `prepareModelJob.ts` builds the retired params and payload members and narrows the retired flavors, `prepareModelJob.test.ts` and `prepareModelJob.integration.test.ts` build the retired return builders, `createJobContext.ts` and `dialectic-worker/index.ts` pass `compressPrompt` into this function's deps, and `JobContext.mock.ts` and `createJobContext.test.ts` build an unbound `calculateAffordability` that invokes `deps.compressPrompt`. Each is a support file of the `prepareModelJob` or `createJobContext` node later in this workstream.
      * `[ ]`   Each goal is proven by a named case in this node's interface test, guard test, unit test or integration test.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer computation: given a working set and a wallet balance, report whether the request fits and is affordable, what output cap it may claim, and — when it does not fit — the input size a compression pass must reach and the balance that survives it.
      * `[ ]`   The role is correct because a verdict is a value, not an action. A function that returns a verdict can be called by an EXECUTE job and a COMPRESS job alike, which is what lets `prepareModelJob` place decision one's recursion guard on the job row's `job_type` instead of on which collaborator it withheld.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not call, import or type `compressPrompt` anywhere in this module.
         * `[ ]`   Do not edit `prepareModelJob.ts` or its suites; the branch that consumes the over-budget arm and calls `compressPrompt` is its own node, immediately after this one.
         * `[ ]`   Do not edit `createJobContext.ts`, `dialectic-worker/index.ts`, `JobContext.mock.ts` or `createJobContext.test.ts`; the deps literals that stop carrying `compressPrompt` belong to the `createJobContext` and composition-root nodes.
         * `[ ]`   Do not change the solver, the cost arithmetic, the rationality thresholds or any error message. This node moves a responsibility out; it does not re-derive what stays.
         * `[ ]`   Do not add a pending, deferred or queued flavor. This function spawns nothing, so it has nothing to report as pending; `PrepareModelJobPendingReturn` is the caller's.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/calculateAffordability` — preflight token counting, output-cap resolution, cost estimation against a wallet balance, and the input-size target a working set must reach to fit.
      * `[ ]`   Inside boundary:
         * `[ ]`   Whether a request fits the window and is affordable, and at what output cap.
         * `[ ]`   The per-request sizing arithmetic: the solver, the compression cost estimate and the balance that survives it.
      * `[ ]`   Outside boundary:
         * `[ ]`   What an over-budget request warrants — compression for an EXECUTE job, a hard failure for a COMPRESS job — which is `prepareModelJob`'s decision from the job row's `job_type`.
         * `[ ]`   How a working set is made smaller, owned by `compressPrompt`.
         * `[ ]`   The wallet read and the job row, both of which reach this function as plain values.

   * `[ ]`   `deps`
      * `[ ]`   Removed provider: `compressPrompt` (`BoundCompressPromptFn` from `../compressPrompt/compressPrompt.interface.ts`, and `isCompressPromptErrorReturn` plus `CompressPromptParams`/`CompressPromptPayload` in the implementation).
         * `[ ]`   Layer classification: sibling app-layer module.
         * `[ ]`   Direction: inbound, and closed by this node — no file in this module imports from `compressPrompt` afterwards, and the mock's `buildBoundCompressPromptFn` import goes with it.
         * `[ ]`   Purpose retired: making the working set fit, which the caller now composes.
      * `[ ]`   Removed provider: `_shared/utils/vector_utils.interface.ts` (`ICompressionStrategy`), in both the interface and the mock; and `npm:@supabase/supabase-js@2` + `types_db.ts`'s `Database` for the `dbClient` params member, in the interface, the guard and the mock.
         * `[ ]`   Layer classification: shared type surface and external client type.
         * `[ ]`   Direction: inbound, and closed by this node with the members they typed.
         * `[ ]`   Purpose retired: relaying a scorer and a database handle to a callee this function no longer has.
      * `[ ]`   Confirm:
         * `[ ]`   The three surviving deps — `logger`, `countTokens`, `getMaxOutputTokens` — keep their types and providers: `ILogger` from `_shared/types.ts`, `CountTokensFn` from `_shared/types/tokenizer.types.ts`, and `GetMaxOutputTokensFn` declared in this interface and implemented by `_shared/utils/affordability_utils.ts`.
         * `[ ]`   No dependency is added, and no reverse dependency exists: neither `compressPrompt` nor `_shared` imports this module.
      * `[ ]`   `context_slice`
         * `[ ]`   From each surviving provider: the one function type it supplies, nothing wider.

   * `[ ]`   `calculateAffordability.interface.test.ts`
      * `[ ]`   A case proves the deps surface exhaustively: `Record<keyof CalculateAffordabilityDeps, true>` over `logger`, `countTokens`, `getMaxOutputTokens`, asserting three. Exhaustive in both directions, it is the proof `compressPrompt` is not a dep.
      * `[ ]`   A case proves the params surface the same way over `jobId`, `walletBalance`, `extendedModelConfig`, `inputRate`, `outputRate`, `userConfig`, asserting six.
      * `[ ]`   A case proves the payload surface the same way over `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `systemInstruction`, asserting four.
      * `[ ]`   A case proves the two-arm return by typed assignment: a `CalculateAffordabilityWithinBudgetReturn` value and a `CalculateAffordabilityOverBudgetReturn` value each assign to `CalculateAffordabilitySuccessReturn`, that assigns to `CalculateAffordabilityReturn`, and a `CalculateAffordabilityErrorReturn` value assigns to `CalculateAffordabilityReturn` — membership transitive, the flavors nested inside the success arm rather than beside it.
      * `[ ]`   A case proves each flavor's members by typed literal: `overBudget: false` with `maxOutputTokens` and `resolvedInputTokenCount`; `overBudget: true` with `resolvedInputTokenCount`, `finalTargetThreshold` and `balanceAfterCompression`.
      * `[ ]`   A case proves `CalculateAffordabilityFn` and `BoundCalculateAffordabilityFn` accept the narrowed deps, params and payload types and return `Promise<CalculateAffordabilityReturn>`.
      * `[ ]`   Every existing case that names `wasCompressed`, `CalculateAffordabilityDirectReturn`, `CalculateAffordabilityCompressedReturn`, `compressPrompt`, `compressionStrategy`, `chatApiRequest` or a retired params member is restated against the surfaces above; the `UserConfig`, `TierOutputCapTokens` and `GetMaxOutputTokensFn` cases are unchanged.

   * `[ ]`   `calculateAffordability.interface.ts`
      * `[ ]`   `CalculateAffordabilityDeps` drops `compressPrompt`, and the `BoundCompressPromptFn` import with it.
      * `[ ]`   `CalculateAffordabilityParams` drops `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance`, and the `SupabaseClient`, `Database` and `RelevanceRule` imports those members required.
      * `[ ]`   `CalculateAffordabilityPayload` drops `compressionStrategy` and `chatApiRequest`, and the `ICompressionStrategy` and `ChatApiRequest` imports with them.
      * `[ ]`   `CalculateAffordabilityDirectReturn` and `CalculateAffordabilityCompressedReturn` are replaced by `CalculateAffordabilityWithinBudgetReturn { overBudget: false; maxOutputTokens: number; resolvedInputTokenCount: number }` and `CalculateAffordabilityOverBudgetReturn { overBudget: true; resolvedInputTokenCount: number; finalTargetThreshold: number; balanceAfterCompression: number }`, and `ResourceDocuments` remains imported for the payload alone.
      * `[ ]`   `CalculateAffordabilitySuccessReturn` is declared as the union of those two, and `CalculateAffordabilityReturn` becomes `CalculateAffordabilitySuccessReturn | CalculateAffordabilityErrorReturn` — the named two-arm form, with the flavors inside the success arm.
      * `[ ]`   `CalculateAffordabilityErrorReturn`, `UserConfig`, `TierOutputCapTokens`, `GetMaxOutputTokensFn`, `CalculateAffordabilityFn` and `BoundCalculateAffordabilityFn` keep their declarations.

   * `[ ]`   `calculateAffordability.interaction.spec`
      * `[ ]`   Entry: build the inline `tokenizerDeps`, filter `payload.conversationHistory` of `function`-role messages, narrow with `isApiChatMessage` and drop null content, assemble the `CountableChatPayload` from `payload.systemInstruction`, `payload.currentUserPrompt`, those messages and `payload.resourceDocuments`, and call `deps.countTokens` once. This is the only count the function takes.
      * `[ ]`   `extendedModelConfig.context_window_tokens` not a number → `{ error: Error("context_window_tokens is not defined"), retriable: false }`.
      * `[ ]`   Within-window branch, selected by `initialTokenCount <= context_window_tokens`, unchanged in every decision: `deps.getMaxOutputTokens(walletBalance, initialTokenCount, config, logger, 0, params.userConfig.tier_output_cap_tokens)` negative → `Insufficient funds to cover the input prompt cost.`, `retriable: false`; `provider_max_input_tokens` not a number → `provider_max_input_tokens is not defined`; `allowedInput <= 0` → `ContextWindowError("No input window remains after reserving output budget (…) and safety buffer (32).")`; `initialTokenCount > allowedInput` → `ContextWindowError("Initial input tokens (…) exceed allowed input (…) after reserving output budget.")`; estimated total cost over balance → `Insufficient funds: estimated total cost (…) exceeds wallet balance (…).`. Otherwise the outcome is `{ overBudget: false, maxOutputTokens: plannedMaxOutputTokens, resolvedInputTokenCount: initialTokenCount }`.
      * `[ ]`   Over-window branch, entered when the count exceeds the window: the rate validations (`isValidInputTokenCostRate`, `isValidOutputTokenCostRate`), the embeddings-inclusive NSF check, the eighty-percent rationality check, the `provider_max_input_tokens` check, the `solveTargetForBalance` solver, the `balanceAfterCompression` positivity check, the feasible-target check, the total-estimated-cost check and the second rationality check all run exactly as they run now and return exactly the errors they return now, with the same messages and `retriable: false`.
      * `[ ]`   Over-window outcome: `{ overBudget: true, resolvedInputTokenCount: initialTokenCount, finalTargetThreshold, balanceAfterCompression }` — the two solver results the caller needs to build `CompressPromptParams`. No dependency beyond `deps.getMaxOutputTokens` is called on this branch, and nothing is spent, written or spawned.
      * `[ ]`   Deleted from this branch: the per-document identity loop over `payload.resourceDocuments` and the `inputsRelevance is required` gate. Both are preconditions of the compression call this node removes, and `compressPrompt` enforces the identity rule at its own entry, so keeping either would reject a request for a member no branch here reads.
      * `[ ]`   The `deps.logger.info` line on this branch is kept and its trailing clause states the verdict this function now returns rather than an attempt it no longer makes; the token count, the limit and the job id it reports are unchanged.
      * `[ ]`   Ordering and side effects: one `deps.countTokens` call, `deps.getMaxOutputTokens` called as the branches already call it, no other dependency call, no write, no wallet debit, no job insert, on any path.

   * `[ ]`   `calculateAffordability.mock.ts`
      * `[ ]`   Six owned object types, four symbols each, production-named: `CalculateAffordabilityDeps`, `CalculateAffordabilityParams`, `CalculateAffordabilityPayload`, `CalculateAffordabilityWithinBudgetReturn`, `CalculateAffordabilityOverBudgetReturn`, `CalculateAffordabilityErrorReturn` — `…Overrides` as `Partial<T>`, `build…`, `…Corruptions` as `{ [K in keyof T]?: unknown }`, `invalidate…` returning `unknown` as `{ ...buildX(), ...corruptions }`. `UserConfigOverrides`, `buildUserConfig`, `UserConfigCorruptions` and `invalidateUserConfig` already hold that form and are unchanged.
      * `[ ]`   Every builder takes one optional overrides object and returns `overrides ? { ...base, ...overrides } : base`, with a default for every property. `buildCalculateAffordabilityParams` loses its positional `dbClient` parameter along with the member itself, and its remaining six defaults are the values it supplies today.
      * `[ ]`   `buildCalculateAffordabilityDeps` defaults `logger` to `new MockLogger()`, `countTokens` to `createMockCountTokens()` and `getMaxOutputTokens` to the real `getMaxOutputTokens` from `_shared/utils/affordability_utils.ts`, as it does now, and supplies no `compressPrompt`. The `buildBoundCompressPromptFn`, `BoundCompressPromptFn` and `ICompressionStrategy` imports and the module-level `defaultCompressionStrategy` are deleted.
      * `[ ]`   `buildCalculateAffordabilityPayload` composes `buildResourceDocument()` for its documents and defaults `conversationHistory` to `[]`, `currentUserPrompt` and `systemInstruction` to their existing strings; it returns no `compressionStrategy` and no `chatApiRequest`, and the `buildChatApiRequest` import goes with them.
      * `[ ]`   `buildCalculateAffordabilityWithinBudgetReturn` and `buildCalculateAffordabilityOverBudgetReturn` replace `buildCalculateAffordabilityDirectReturn` and `buildCalculateAffordabilityCompressedReturn`, each taking one optional overrides object with a default for every member; `buildCalculateAffordabilityErrorReturn` stops taking positional arguments and defaults `error` to `new Error("mock-calculate-affordability-error")` and `retriable` to `false`.
      * `[ ]`   Three function mocks, one per owned function type: `mockCalculateAffordability: CalculateAffordabilityFn` and `mockBoundCalculateAffordability: BoundCalculateAffordabilityFn`, each returning `buildCalculateAffordabilityWithinBudgetReturn()`, and `mockGetMaxOutputTokens: GetMaxOutputTokensFn` returning `0` — identical signatures, no extra parameters, no options, no recording.
      * `[ ]`   Deleted: `buildMockCalculateAffordabilityFn` and `buildMockBoundCalculateAffordabilityFn` with their overload signatures, `MockCalculateAffordabilityFnOptions`, `MockBoundCalculateAffordabilityFnOptions`, `isMockCalculateAffordabilityFnOptions`, `isMockBoundCalculateAffordabilityFnOptions` and `buildMockGetMaxOutputTokens`. Each is a parameterized factory or an options bag; a test needing another outcome declares its own production-typed function composed from these builders.

   * `[ ]`   `calculateAffordability.guard.test.ts`
      * `[ ]`   `isCalculateAffordabilityDeps` case checklist, fixtures from the builder and invalidator: accepts a full deps object; rejects each of `logger`, `countTokens`, `getMaxOutputTokens` absent and each present-but-wrong-typed; rejects non-record roots. The `rejects deps missing getMaxOutputTokens` and `non-function getMaxOutputTokens` cases stand, restated against the invalidator. A case asserts a deps object carrying no `compressPrompt` is accepted, which is the proof the dep is retired.
      * `[ ]`   `isCalculateAffordabilityParams` case checklist over the six surviving members, absent and wrong-typed each, fixtures from `invalidateCalculateAffordabilityParams`; the four `userConfig` cases stand. A case asserts params carrying none of the seven retired members are accepted.
      * `[ ]`   `isCalculateAffordabilityPayload` case checklist over the four surviving members; a case asserts a payload carrying neither `compressionStrategy` nor `chatApiRequest` is accepted.
      * `[ ]`   `isCalculateAffordabilityDirectReturn` and `isCalculateAffordabilityCompressedReturn` cases become `isCalculateAffordabilityWithinBudgetReturn` and `isCalculateAffordabilityOverBudgetReturn` case checklists: each accepts its own built flavor, rejects the other flavor, rejects a built error return, rejects each of its members absent and wrong-typed through its invalidator, and rejects non-record roots.
      * `[ ]`   `isCalculateAffordabilityErrorReturn` keeps its cases, its exclusion assertions restated against the new flavor members — an error return carrying `overBudget`, `maxOutputTokens`, `finalTargetThreshold` or `balanceAfterCompression` is rejected.
      * `[ ]`   `isBoundCalculateAffordabilityFn` takes `mockBoundCalculateAffordability` as its positive fixture; `isCalculateAffordabilityFn` takes `mockCalculateAffordability`; `isGetMaxOutputTokensFn` takes `mockGetMaxOutputTokens`. Their negative assertions are unchanged.
      * `[ ]`   The `isTierOutputCapTokens` and `isUserConfig` checklists are unchanged.

   * `[ ]`   `calculateAffordability.guard.ts`
      * `[ ]`   `isCalculateAffordabilityDeps` deletes its `compressPrompt` check and keeps the other three.
      * `[ ]`   `isCalculateAffordabilityParams` deletes its `dbClient`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `isContinuationFlowInitial` and `inputsRelevance` checks and keeps `jobId`, `walletBalance`, `extendedModelConfig`, `inputRate`, `outputRate` and `userConfig`.
      * `[ ]`   `isCalculateAffordabilityPayload` deletes its `compressionStrategy` and `chatApiRequest` checks and keeps the other four.
      * `[ ]`   `isCalculateAffordabilityDirectReturn` and `isCalculateAffordabilityCompressedReturn` become `isCalculateAffordabilityWithinBudgetReturn` and `isCalculateAffordabilityOverBudgetReturn`, each discriminating on its own `overBudget` literal, checking the numeric type of each of its members, and rejecting a value carrying `error` or `retriable` or the other flavor's distinguishing member.
      * `[ ]`   `isCalculateAffordabilityErrorReturn` keeps its `error` and `retriable` checks, and its exclusion list becomes `overBudget`, `maxOutputTokens`, `resolvedInputTokenCount`, `finalTargetThreshold` and `balanceAfterCompression`.
      * `[ ]`   Every guard keeps its boolean contract; none throws. `isTierOutputCapTokens`, `isUserConfig`, `isGetMaxOutputTokensFn`, `isCalculateAffordabilityFn` and `isBoundCalculateAffordabilityFn` are unchanged.

   * `[ ]`   `calculateAffordability.test.ts`
      * `[ ]`   Every case constructs its deps through `buildCalculateAffordabilityDeps` without a `compressPrompt` override, its params through `buildCalculateAffordabilityParams` with an overrides object and no `DbClient(...)` first argument, and its payload without `compressionStrategy` or `chatApiRequest`.
      * `[ ]`   The within-window cases — `Non-oversized adequate balance`, `Non-oversized NSF`, `Non-oversized allowedInput <= 0`, `maxOutputTokens is SSOT cap 400`, `non-oversized NSF when estimated cost exceeds wallet`, `final ChatApiRequest.max_tokens_to_generate equals SSOT(final input)`, both `tier_output_cap_tokens` forwarding cases and `invokes deps.getMaxOutputTokens at least once` — keep every arrangement and every assertion, with `isCalculateAffordabilityDirectReturn` restated as `isCalculateAffordabilityWithinBudgetReturn`. The `calls.length === 0` assertions that read the retired compress mock are deleted, the collaborator they watched no longer being reachable from this function.
      * `[ ]`   `Oversized: compressPrompt called with finalTargetThreshold, balanceAfterCompression, walletBalance; compressed return on success` becomes an over-budget verdict case: the same oversized arrangement, asserting `isCalculateAffordabilityOverBudgetReturn`, that `finalTargetThreshold` and `balanceAfterCompression` carry the values the case asserts today at the compress call, and that `resolvedInputTokenCount` is the initial count. Its title states the verdict rather than the call.
      * `[ ]`   `Oversized: compressPrompt error propagated; error return` is deleted: there is no collaborator to propagate from, and no other case's coverage depends on it.
      * `[ ]`   Every oversized error case — NSF including embeddings, both eighty-percent rationality cases, `balanceAfterCompression <= 0`, infeasible solver target, total estimated cost exceeds balance — keeps its arrangement, its error type, its message assertion and its `retriable` flag. The two whose titles end `compressPrompt not called` keep their error assertions and lose that clause and its spy.
      * `[ ]`   Cases are added for the two branches this node deletes, proving the removals are behavioral and not silent: an oversized request whose documents carry no `document_key`, `type` or `stage_slug` returns the over-budget verdict rather than an identity error; an oversized request whose params carry no `inputsRelevance` returns the over-budget verdict rather than an `inputsRelevance is required` error.
      * `[ ]`   A case asserts the function calls `deps.countTokens` exactly once and reaches no other collaborator on the over-budget path, spy applied at the call site.

   * `[ ]`   `calculateAffordability.ts`
      * `[ ]`   The `compressParams` and `compressPayload` literals, the `await deps.compressPrompt(...)` call, the `isCompressPromptErrorReturn` branch and the `wasCompressed: true` success construction are deleted, with the `isCompressPromptErrorReturn`, `CompressPromptParams` and `CompressPromptPayload` imports.
      * `[ ]`   The over-window branch ends by returning `{ overBudget: true, resolvedInputTokenCount: initialTokenCount, finalTargetThreshold, balanceAfterCompression }`, typed as `CalculateAffordabilityOverBudgetReturn`.
      * `[ ]`   The within-window branch's return becomes `{ overBudget: false, maxOutputTokens: plannedMaxOutputTokens, resolvedInputTokenCount: initialTokenCount }`, typed as `CalculateAffordabilityWithinBudgetReturn`.
      * `[ ]`   The document-identity loop and the `inputsRelevance is required` gate are deleted, along with the `inputsRelevance` local they produced.
      * `[ ]`   The `deps.logger.info` line keeps its job id, token count and limit and states the over-budget verdict in place of `Attempting compression.`
      * `[ ]`   Everything else is unchanged: the `tokenizerDeps` literal, the message filtering, the single `deps.countTokens` call, both `context_window_tokens` checks, every `getMaxOutputTokens` call and its arguments, `getAllowedInputFor`, `solveTargetForBalance`, every cost and rationality computation, and every error type, message and `retriable` flag.
      * `[ ]`   The unreachable `maxTokens === undefined` block that follows the within-window return is left exactly as it stands; removing dead code is not this node's work.

   * `[ ]`   `calculateAffordability.integration.test.ts`
      * `[ ]`   The three non-oversized cases — direct return with real config and real `countTokens`, NSF, and the binding `tierOutputCapTokens=32768` cap — keep every arrangement and assertion, with `isCalculateAffordabilityDirectReturn` restated as `isCalculateAffordabilityWithinBudgetReturn`. Their `BoundCompressPromptFn` locals that throw when called are deleted along with the dep they guarded.
      * `[ ]`   The `oversized path with real compressPrompt` block, which wires the real `compressPrompt` with `MockRagService` and a real `EmbeddingClient` through this function's deps, is replaced by an over-budget verdict case over the same real config, real `countTokens` and real project fixture: an oversized working set returns `isCalculateAffordabilityOverBudgetReturn` carrying a `finalTargetThreshold` at or below the window and a positive `balanceAfterCompression`, and no RAG or wallet collaborator is constructed at all.
      * `[ ]`   The provider-to-consumer chain that block proved — affordability verdict through real compression to a rewritten working set — is `prepareModelJob`'s to prove once it composes the two, and its node carries the integration test that does so. This suite keeps only what crosses this function's own boundary.
      * `[ ]`   The suite continues to mock only Supabase, and the `compressPrompt`, `CompressPromptDeps`, `MockRagService` and embedding imports are deleted.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward and this node only removes edges: the module drops its imports of `compressPrompt`'s interface, guard and mock, of `ICompressionStrategy`, of `RelevanceRule`, and of the Supabase client types, and adds none.
      * `[ ]`   `calculateAffordability.provides.ts` re-exports this module's implementation, interface, guard and mock with `export *` and `export type *`, so the renamed flavors, the new guards and the new mock symbols reach consumers without an edit to that file, and the retired ones leave it the moment they leave their source.
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
      * `[ ]`   Every owned object type has a `Partial<T>`-overrides builder and an `unknown`-returning invalidator, and each owned function type has a function mock that is that type exactly — guard test, whose fixtures are drawn from them.

* `[ ]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts **[BE] Become the single model-call dispatcher: narrow with the base guard, compose `calculateAffordability` with `compressPrompt`, branch the recursion guard on the row's `job_type`, drop `sessionData`/`authToken`, and write `source_prompt_resource_id` onto the job payload before enqueue**

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
         * `[ ]`   `'EXECUTE'` → build `CompressPromptParams` from the job row and the affordability arm — `dbClient`, `jobId`, `projectOwnerUserId`, `sessionId`, `stageSlug`, `walletId`, `extendedModelConfig`, `inputsRelevance` from `payload.inputsRelevance`, `inputRate`, `outputRate`, `isContinuationFlowInitial`, and `finalTargetThreshold`, `balanceAfterCompression`, `walletBalance` — and `CompressPromptPayload` from `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, the base `ChatApiRequest` and the tokenizer deps this function constructs for the call. Call `deps.compressPrompt` once.
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
      * `[ ]`   The over-budget path adds the `job_type` branch, the `CompressPromptParams` and `CompressPromptPayload` literals, the tokenizer-deps literal those payloads require, the single `deps.compressPrompt` call, the `isCompressPromptErrorReturn` propagation and the `{ waiting_for_children: true }` return, plus the non-retriable recursion-guard error on the COMPRESS arm.
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

* `[ ]`   supabase/functions/dialectic-worker/processSimpleJob.ts **[BE] Drop `compressionStrategy` from its `PrepareModelJobPayload` literal and `sessionData`/`authToken` from its `PrepareModelJobParams` literal, and narrow the dispatcher's deferral instead of reporting it as an executed job**

   * `[ ]`   `objective`
      * `[ ]`   Solve the origin of a relay and the last unnarrowed return. This function is the sole production construction site of `PrepareModelJobPayload.compressionStrategy` and of `PrepareModelJobParams.sessionData` and `authToken` — a collaborator and two values threaded through functions that never read them — so none of the three can leave its contract while this file supplies it. It is also the dispatcher's only caller, and it treats every non-error result alike: it asserts a success shape and sends `execute_completed`. With the dispatcher now reporting a deferral as well as a dispatch, that path would announce a completed execution for a job that enqueued no model call.
      * `[ ]`   Functional goals:
         * `[ ]`   The `PrepareModelJobParams` literal carries `dbClient`, `job`, `projectOwnerUserId` and `providerRow` only.
         * `[ ]`   The `PrepareModelJobPayload` literal carries `promptConstructionPayload`, `inputsRelevance` and `inputsRequired` only, and the `getSortedCompressionCandidates` import is deleted with the member it supplied.
         * `[ ]`   A deferral is narrowed with `isPrepareModelJobPendingReturn` and returns from the function without sending any notification and without writing any row status; the parent is already `waiting_for_children` and the completion trigger resumes it.
         * `[ ]`   A dispatch is narrowed with `isPrepareModelJobQueuedReturn` before the `execute_completed` notification, and any other shape still raises `prepareModelJob returned an invalid result shape`.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `sessionData` stays in this function and keeps every use it has — the assembler options, the iteration number it supplies to `gatherArtifacts` and to the notification. What ends is passing it onward.
         * `[ ]`   Every other behavior is unchanged: the stage and recipe resolution, the initial-prompt resolution, the continuation routing, the `gatherArtifacts` call, the `promptConstructionPayload` construction, the error branch with its `ContextWindowError` and `PrepareModelJobExecutionError` handling, and every notification the catch sends.
         * `[ ]`   The function keeps its `(dbClient, job, projectOwnerUserId, ctx, authToken)` signature, which `processJob` calls positionally. `authToken` becomes unused in the body and is renamed `_authToken` in place, the repo's convention for a deliberately unused parameter, so the file lints clean without touching a second file.
         * `[ ]`   `gatherArtifacts`'s params, the compression overlay and the full-chain compression integration test are WS-D's and are not touched here.
      * `[ ]`   Each goal is proven by a named case in this file's unit or integration suite.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer orchestration of one EXECUTE job: resolve the stage and its recipe step, assemble the prompt, gather the artifacts, hand the result to the dispatcher, and report what the dispatcher did.
      * `[ ]`   The role is correct because this function owns the job's lifecycle reporting. Whether a job executed, deferred or failed is its statement to make, and it can only make it correctly by narrowing every arm the dispatcher returns.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not decide affordability, compress anything, or read a compression artifact; the dispatcher composes those and reports one outcome.
         * `[ ]`   Do not set `waiting_for_children` or any row status on the deferral path; `compressPrompt` sets the parent's status, and the completion trigger resumes it.
         * `[ ]`   Do not change `processJob.ts` or this function's signature; the unused parameter is handled in place.
         * `[ ]`   Do not touch `gatherArtifacts`'s call site, the overlay, or the tokenizer; those are WS-D's.

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
      * `[ ]`   Confirm:
         * `[ ]`   `ctx` is unchanged: no member is added, removed or retyped, and `IJobContext.prepareModelJob` keeps its declared type.
         * `[ ]`   No reverse dependency: `prepareModelJob` imports nothing from this file.
      * `[ ]`   `context_slice`
         * `[ ]`   From the dispatcher's module: the three return guards and `PrepareModelJobExecutionError` only.

   * `[ ]`   `processSimpleJob.interaction.spec`
      * `[ ]`   Only the dispatch tail changes. Every branch above it — stage and recipe resolution, provider details, initial-prompt resolution, continuation routing, `gatherArtifacts` and its error throw, `promptConstructionPayload` construction — keeps its condition, its dependency call and its outcome.
      * `[ ]`   Dispatcher call: `ctx.prepareModelJob(prepareParams, preparePayload)` with the narrowed literals. The result is held as `unknown` and narrowed by guard, as it is today.
      * `[ ]`   Error arm, unchanged: `isPrepareModelJobErrorReturn` true → a `ContextWindowError` is rethrown as itself, and anything else is rethrown as `PrepareModelJobExecutionError` carrying the message, the `retriable` flag and the cause, for the catch to classify.
      * `[ ]`   Deferral arm: `isPrepareModelJobPendingReturn` true → return. No `execute_completed` event, no other notification, no row write. The job row is already `waiting_for_children`, set by `compressPrompt` when it spawned the children, and the DB completion trigger wakes this job when they finish.
      * `[ ]`   Dispatch arm: `isPrepareModelJobQueuedReturn` true → send `execute_completed` through `ctx.notificationService.sendJobNotificationEvent` with the session, stage, job id, step key, model id, iteration number and document key it sends today, when `projectOwnerUserId` is present.
      * `[ ]`   Neither guard true → throw `prepareModelJob returned an invalid result shape`, reaching the catch as it does now.
      * `[ ]`   Catch, unchanged: `PrepareModelJobExecutionError` unwrapping, the `ContextWindowError` row failure and its three notifications, and every other failure path.
      * `[ ]`   Ordering and side effects: exactly one dispatcher call per invocation; at most one notification on the success paths and none on the deferral; the deferral writes nothing.

   * `[ ]`   `processSimpleJob.test.ts`
      * `[ ]`   Every case's `PrepareModelJobParams` literal drops `authToken` and `sessionData`, and every `PrepareModelJobPayload` literal drops `compressionStrategy`; each keeps the rest of its arrangement and all of its assertions.
      * `[ ]`   New case: a dispatcher returning `{ waiting_for_children: true }` leaves the function without calling `ctx.notificationService.sendJobNotificationEvent` at all and without writing `dialectic_generation_jobs`. Arranged alongside a queued case in the same file so the assertion cannot hold if the branch were deleted.
      * `[ ]`   New case: a dispatcher returning `{ queued: true }` sends exactly one `execute_completed` event carrying the session, stage, job id, step key, model id, iteration number and document key it carries today.
      * `[ ]`   The existing invalid-shape case stands, asserting the same thrown message for a result that is neither arm.
      * `[ ]`   Every existing case — the error propagation, the `ContextWindowError` path with its row update and three notifications, the gather failure, the continuation routing and the assembler paths — keeps its coverage and its assertions unchanged.

   * `[ ]`   `processSimpleJob.ts`
      * `[ ]`   The `PrepareModelJobParams` literal drops `authToken` and `sessionData`; the `PrepareModelJobPayload` literal drops `compressionStrategy`; the `getSortedCompressionCandidates` import is deleted.
      * `[ ]`   The `authToken` parameter is renamed `_authToken` in the function signature, its last use having left the body.
      * `[ ]`   The `isPrepareModelJobSuccessReturn` check is replaced by the two arm guards: `isPrepareModelJobPendingReturn` returns from the function, `isPrepareModelJobQueuedReturn` gates the notification block, and the invalid-shape throw follows both. The `isPrepareModelJobSuccessReturn` import is replaced by the two arm guards' imports.
      * `[ ]`   Nothing else in the file changes: every other statement, log line, notification, row write and error path is left exactly as it stands.

   * `[ ]`   `processSimpleJob.integration.test.ts`
      * `[ ]`   Its `PrepareModelJobParams` and `PrepareModelJobPayload` constructions drop the same three members, and its `isEnqueueModelCallParams` assertions over the captured dispatcher arguments stand.
      * `[ ]`   A case proves the deferral end to end at this boundary: with the real dispatcher and a real `calculateAffordability` over an oversized working set, this function returns having sent no notification and written no row status, while a within-budget working set reaches the queue and notifies.

   * `[ ]`   `dialectic-worker/index.test.ts`
      * `[ ]`   Its parallel `PrepareModelJobParams` literal drops `authToken` and `sessionData` and its `PrepareModelJobPayload` literal drops `compressionStrategy`, with the `getSortedCompressionCandidates` import deleted if no other construction in the file uses it. This is test infrastructure for the same contract, not a second production caller, so it takes no node of its own.
      * `[ ]`   Its `prepareModelJobSpy` call-count assertion for the EXECUTE path is unchanged.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: this file imports the dispatcher's guards and error class from the module that owns them, and drops its import of the concrete scorer; it exports nothing to either.
      * `[ ]`   No cycle: `prepareModelJob` and `vector_utils` import nothing from this file.
      * `[ ]`   The composition root remains the only place a concrete collaborator is chosen; after this node no orchestrator names one.

   * `[ ]`   `requirements`
      * `[ ]`   The dispatcher receives params carrying neither `authToken` nor `sessionData`, and a payload carrying no `compressionStrategy` — unit test and integration test, captured-argument assertions.
      * `[ ]`   A deferral sends no notification and writes no row status — unit test and integration test.
      * `[ ]`   A dispatch sends exactly one `execute_completed` event carrying the fields it carries today — unit test.
      * `[ ]`   A result that is neither arm raises `prepareModelJob returned an invalid result shape` — unit test, existing case.
      * `[ ]`   Every error, `ContextWindowError`, gather-failure and continuation path behaves exactly as it does now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/_shared/prompt-assembler/prompt-assembler.ts **[BE] Return `AssembledPrompt | AssembleContinuationPromptErrorReturn` from `BoundAssembleContinuationPromptFn` and the `IPromptAssembler` method it fronts, so both prompt members agree**

   * `[ ]`   `objective`
      * `[ ]`   Solve a facade whose two prompt members disagree on how failure travels. `assembleCompressionPrompt` returns `AssembleCompressionPromptReturn`, a `Success | Error` union its caller narrows. `assembleContinuationPrompt` returns `Promise<AssembledPrompt>` and signals every failure by throwing, so a caller holding the facade has no arm to narrow — `processCompressJob` must wrap one call in a `try` and narrow the other, over the same object, for the same kind of work.
      * `[ ]`   Functional goals:
         * `[ ]`   `AssembleContinuationPromptError` and `AssembleContinuationPromptErrorReturn { error: AssembleContinuationPromptError; retriable: boolean }` are declared in `prompt-assembler.interface.ts`, beside `AssembleContinuationPromptDeps`, in the shape `assembleCompressionPrompt.interface.ts` already uses for its own arm.
         * `[ ]`   `AssembleContinuationPromptReturn` is declared as `AssembledPrompt | AssembleContinuationPromptErrorReturn`, and `BoundAssembleContinuationPromptFn` returns `Promise<AssembleContinuationPromptReturn>`.
         * `[ ]`   `IPromptAssembler.assembleContinuationPrompt` returns `Promise<AssembleContinuationPromptReturn>`, and the `PromptAssembler` method, its private field and its constructor parameter carry that same return.
         * `[ ]`   `isAssembleContinuationPromptErrorReturn` is authored in this module's guard surface so every caller narrows the arm by guard rather than by property probing.
         * `[ ]`   `assemble()` keeps `Promise<AssembledPrompt>`: it narrows the continuation member's return and throws the error arm's `error`, so its own callers see exactly the failure they see today.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `assembleContinuationPrompt.ts` is not edited here. Its body still throws and still returns `AssembledPrompt`, which is assignable to the widened union, so this node compiles against an untouched implementation.
         * `[ ]`   `assembleSeedPrompt`, `assemblePlannerPrompt`, `assembleTurnPrompt` and `assembleCompressionPrompt` keep their signatures, their private fields and their constructor defaults.
         * `[ ]`   `assemble()`'s routing is unchanged: the `target_contribution_id` branch, the `PLAN` branch, the turn branch and the seed branch each select as they do now and pass the same deps.
         * `[ ]`   `AssembledPrompt` itself is unchanged, so every other member and every consumer of that type is untouched.
      * `[ ]`   Each goal is proven by a named case in this module's test suite or its guard cases.

   * `[ ]`   `role`
      * `[ ]`   Node role is app-layer facade: one object fronting five prompt assemblers, each delegating to an injected function with the composition root's default behind it.
      * `[ ]`   The role is correct because a facade's job is to present one surface. Two members doing the same kind of work must report failure the same way, or every caller has to know which is which.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not edit `assembleContinuationPrompt.ts`. Converting its throws into the error arm is that file's own node, immediately after this one.
         * `[ ]`   Do not change `assemble()`'s signature, its branch selection, or the deps any branch passes.
         * `[ ]`   Do not change `AssembledPrompt`, `AssemblePromptOptions`, or any other assembler's contract.
         * `[ ]`   Do not edit `processCompressJob.ts`; it narrows this union in its own node later in this workstream.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/prompt-assembler` — the facade, the contracts its members expose, and the routing that selects one of them.
      * `[ ]`   Inside boundary:
         * `[ ]`   What each facade member returns and how a caller learns it failed.
         * `[ ]`   Which assembler a set of options routes to.
      * `[ ]`   Outside boundary:
         * `[ ]`   How any assembler builds its prompt, owned by that assembler's own module.
         * `[ ]`   Which branch a COMPRESS job takes inside the continuation assembler, owned by that file's node.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./assembleContinuationPrompt/assembleContinuationPrompt.ts` (the default `assembleContinuationPrompt`).
         * `[ ]`   Layer classification: sibling module inside this bounded context.
         * `[ ]`   Direction: inbound, already present as the constructor default — unchanged by this node, since a function returning `AssembledPrompt` satisfies the widened return.
         * `[ ]`   Purpose: assemble a continuation prompt, injected so a test can substitute one.
      * `[ ]`   Confirm:
         * `[ ]`   No dependency is added or removed; the constructor's parameter list keeps its order and its optionality, and only the continuation parameter's declared return widens.
         * `[ ]`   No reverse dependency: `assembleContinuationPrompt.ts` imports its types from `prompt-assembler.interface.ts` and the facade imports the function, which is the existing direction.
      * `[ ]`   `context_slice`
         * `[ ]`   From each assembler module: its function and its declared types only, as now.

   * `[ ]`   `prompt-assembler.interface.ts`
      * `[ ]`   `AssembleContinuationPromptError` is declared as `Error`, and `AssembleContinuationPromptErrorReturn` as `{ error: AssembleContinuationPromptError; retriable: boolean }` — the member names and shape `AssembleCompressionPromptErrorReturn` already carries, so the facade's two prompt members report failure identically.
      * `[ ]`   `AssembleContinuationPromptReturn` is declared as `AssembledPrompt | AssembleContinuationPromptErrorReturn`, beside `AssembleContinuationPromptDeps`, which this file already owns.
      * `[ ]`   `BoundAssembleContinuationPromptFn` becomes `(job: DialecticJobRow) => Promise<AssembleContinuationPromptReturn>`.
      * `[ ]`   `IPromptAssembler.assembleContinuationPrompt` returns `Promise<AssembleContinuationPromptReturn>`; its four sibling members and `assemble()` keep their declared returns.
      * `[ ]`   `AssembledPrompt`, `AssemblePromptOptions` and every context type in this file are unchanged.

   * `[ ]`   `prompt-assembler.interaction.spec`
      * `[ ]`   Only two behaviors change: what the continuation member's declared return admits, and how `assemble()` treats it. Every other branch keeps its condition, its delegation and its outcome.
      * `[ ]`   `assembleContinuationPrompt(deps)` → delegate to `this.assembleContinuationPromptFn(deps)` and return its value unchanged, either arm. The facade adds no inspection, no logging and no rewrapping — a delegating member returns what it was given.
      * `[ ]`   `assemble(options)` continuation branch, selected when `options.job` is present and `options.job.target_contribution_id` is a non-empty string: call `this.assembleContinuationPrompt` with the deps literal it passes today, then narrow. `isAssembleContinuationPromptErrorReturn` true → throw that arm's `error`. Otherwise → return the `AssembledPrompt`. Throwing here preserves `assemble()`'s existing contract exactly: the same `Error` reaches the same caller by the same path it does today, because the callee threw it then and hands it back now.
      * `[ ]`   `assemble()`'s three other branches — `PLAN` to `assemblePlannerPrompt`, otherwise `assembleTurnPrompt`, and no job to `assembleSeedPrompt` — are unchanged in selection, deps and outcome.
      * `[ ]`   Ordering and side effects: exactly one assembler call per `assemble()` invocation, as now; the facade performs no read, no write and no notification on any path.

   * `[ ]`   `prompt-assembler.mock.ts`
      * `[ ]`   `mockAssembleContinuationPrompt` is retyped `(deps: AssembleContinuationPromptDeps) => Promise<AssembleContinuationPromptReturn>` and keeps returning `MOCK_ASSEMBLED_CONTINUATION_PROMPT`, the success arm being what a mock returns.
      * `[ ]`   `AssembleContinuationPromptErrorReturn` gains the four symbols owed to an owned object type: `AssembleContinuationPromptErrorReturnOverrides` as `Partial<T>`, `buildAssembleContinuationPromptErrorReturn` defaulting `error` to `new Error("mock-assemble-continuation-prompt-error")` and `retriable` to `false`, `AssembleContinuationPromptErrorReturnCorruptions`, and `invalidateAssembleContinuationPromptErrorReturn`.
      * `[ ]`   `MockPromptAssembler`'s `assembleContinuationPrompt` member follows the retyped mock, so a consumer's test can hand the facade either arm.
      * `[ ]`   `MOCK_ASSEMBLED_CONTINUATION_PROMPT`, `buildAssembledPrompt`, `invalidateAssembledPrompt` and every other symbol in the file keep their names, shapes and defaults.

   * `[ ]`   `prompt-assembler.guard.test.ts`
      * `[ ]`   Case checklist for `isAssembleContinuationPromptErrorReturn`, fixtures from the builder and invalidator above: `true` for a built error return; `false` for `buildAssembledPrompt()`, which is the discrimination the guard exists to make; `false` for each of `error` and `retriable` absent and wrong-typed; `false` for non-record roots.
      * `[ ]`   The file is created by this node if it does not exist, carrying these cases only; no other guard in this module is retrofitted.

   * `[ ]`   `prompt-assembler.guard.ts`
      * `[ ]`   `isAssembleContinuationPromptErrorReturn(value: unknown): value is AssembleContinuationPromptErrorReturn` checks a record root, `error instanceof Error`, and `typeof retriable === "boolean"`, and rejects a value carrying `promptContent` or `source_prompt_resource_id` so the success arm can never satisfy it.
      * `[ ]`   It keeps a boolean contract and throws nothing; it is the arm-narrowing guard `assemble()` and every downstream caller uses.
      * `[ ]`   The file is created by this node if it does not exist and holds this guard alone.

   * `[ ]`   `prompt-assembler.test.ts`
      * `[ ]`   `assembleContinuationPrompt should call the injected function` stands: the injected function returns the success arm and the member returns it unchanged.
      * `[ ]`   A case is added proving the member relays the error arm unchanged: an injected function returning `buildAssembleContinuationPromptErrorReturn()` produces that exact value from `assembler.assembleContinuationPrompt(deps)`, with the same `error` identity and `retriable` flag, and no throw.
      * `[ ]`   A case is added proving `assemble()` narrows: with an injected continuation function returning the error arm, `assemble()` rejects with that arm's own `error` instance — the same failure the caller sees today.
      * `[ ]`   The three routing cases — delegation on `target_contribution_id`, delegation regardless of job type, and no delegation when it is null — keep their arrangements and assertions, and the `gatherContinuationInputs` constructor-wiring case is unchanged.
      * `[ ]`   Every seed, planner, turn and compression case is unchanged.

   * `[ ]`   `prompt-assembler.ts`
      * `[ ]`   The `assembleContinuationPromptFn` private field and its constructor parameter are retyped `(deps: AssembleContinuationPromptDeps) => Promise<AssembleContinuationPromptReturn>`; the constructor default stays `assembleContinuationPrompt`.
      * `[ ]`   The `assembleContinuationPrompt` method returns `Promise<AssembleContinuationPromptReturn>` and still returns `this.assembleContinuationPromptFn(deps)` directly.
      * `[ ]`   `assemble()`'s continuation branch awaits the member, narrows with `isAssembleContinuationPromptErrorReturn`, throws that arm's `error`, and otherwise returns the success arm. Its deps literal, its branch condition and its three sibling branches are unchanged.
      * `[ ]`   The `SB_CONTENT_STORAGE_BUCKET` constructor check, `resolveSourceContributionId`, `normalizeContributionId` and every other member are unchanged.

   * `[ ]`   `directionality`
      * `[ ]`   Deps face inward: the facade imports each assembler and the types they use; `assembleContinuationPrompt.ts` imports its types from this module's interface file, which is where the new error type joins them.
      * `[ ]`   No cycle: the new type sits in the file both sides already import from, so no edge is added in either direction.
      * `[ ]`   This module has no `provides` barrel; consumers import the facade, its interface and its mock directly, and the new guard file joins that surface by the same route.

   * `[ ]`   `requirements`
      * `[ ]`   `IPromptAssembler.assembleContinuationPrompt` and `BoundAssembleContinuationPromptFn` both return `Promise<AssembleContinuationPromptReturn>`, and an `AssembleContinuationPromptErrorReturn` value is assignable to it — unit test, typed assignment.
      * `[ ]`   The facade member relays either arm unchanged — unit test.
      * `[ ]`   `assemble()` still returns `Promise<AssembledPrompt>` and rejects with the error arm's own `Error` instance when the continuation assembler reports failure — unit test.
      * `[ ]`   `isAssembleContinuationPromptErrorReturn` accepts the error arm and rejects an `AssembledPrompt` — guard test.
      * `[ ]`   Every routing decision and every other member's contract is exactly what it is now — unit test, existing cases unchanged.

* `[ ]`   supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.ts **[BE] Select the COMPRESS branch on the job row's `job_type` and narrow `job.payload` with the throwing guard inside that arm, so an EXECUTE continuation routes to the contribution branch instead of raising at the selector**

* `[ ]`   supabase/functions/dialectic-worker/continueJob.ts **[BE] Make `IContinueJobResult` a discriminated union with enqueued, continuation-limit and error arms; select both arms on the job row's `job_type`, each narrowing its own payload inside its own arm; its COMPRESS payload literal carries no `job_type`**

* `[ ]`   supabase/functions/dialectic-worker/processCompressJob/processCompressJob.ts **[BE] Compose a `PromptConstructionPayload` from the assembled prompt and call `prepareModelJob`; own no part of the model call, and narrow both assembly unions before use**

* `[ ]`   supabase/functions/dialectic-worker/processJob.ts **[BE] Let the throwing payload guard's per-member diagnostic propagate in place of the hand-thrown `Invalid COMPRESS payload for job …`, and rebuild the `ProcessCompressJobDeps` literal this file is the sole construction site of, now that the model call moves into `prepareModelJob`**

* `[✅]`   supabase/migrations/20260804163845_compression_prompt_provenance.sql **[DB] Add `dialectic_project_resources.source_prompt_resource_id` with its self-referencing FK, mirroring the `dialectic_contributions` column; regenerate `types_db.ts`**

* `[ ]`   supabase/functions/_shared/services/file_manager.ts **[BE] Write `source_prompt_resource_id` on both artifact-table inserts under one column name; `ResourceUploadContext` gains `sourcePromptResourceId`**

* `[ ]`   supabase/functions/_shared/utils/buildUploadContext/buildUploadContext.ts **[BE] Set `sourcePromptResourceId` on the resource arm's `ResourceUploadContext`, from the same-named member on `BuildUploadContextResourceParams`**

* `[ ]`   supabase/functions/dialectic-worker/createJobContext/createJobContext.ts **[BE] Build the bound `compressPrompt` closure in the context factory: `IJobContext` and `JobContextParams` gain `compressionStrategy: ICompressionStrategy`, and `createPrepareModelJobContext` supplies it from `root`**

* `[ ]`   supabase/functions/dialectic-worker/index.ts **[BE] Supply the victim scorer as a root collaborator on the `createJobContext` params and consume the factory-built `compressPrompt` closure instead of constructing a second one inline**

## WS-S — saveResponse DECOMPOSITION + COMPRESS RESPONSE PERSISTENCE (depends WS-J; gates WS-D)

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/assembleAiResponse/assembleAiResponse.ts **[BE] Pure `UnifiedAIResponse` assembly — token-usage synthesis, finish-reason narrowing, raw-provider composition, and caller-supplied `processingTimeMs`**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/loadJobContext/loadJobContext.ts **[BE] The job, provider and session reads with the base-payload member census, returning the job row, provider row, validated config and owner id**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/prepareResponseContent/prepareResponseContent.ts **[BE] The retry conditions, the sanitize → parse sequence, and the repo's only `determineContinuation` call — owning `sourceObject`, and passing a text-mode response through unparsed**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/debitForResponse/debitForResponse.ts **[BE] The wallet read, validations and `debitTokens` call, hoisted ahead of every decision that can still reject the job, so the ledger matches the invoice**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/resolveContributionIdentity/resolveContributionIdentity.ts **[BE] EXECUTE-only identity resolution narrowed through `isDialecticExecuteJobPayload`, propagating its thrown diagnostic unchanged onto the error arm**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/persistContributionRelationships/persistContributionRelationships.ts **[BE] The continuation and init-and-merge branches with both `dialectic_contributions` updates, returning the updated contribution row rather than mutating one**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/finalizeContributionJob/finalizeContributionJob.ts **[BE] The RENDER dispatch, notifications, continuation, final-document assembly and job-row completion, with `FinalizeContributionJobUpdateError` and no prompt-resource back-link**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveContributionResponse/saveContributionResponse.ts **[BE] The EXECUTE arm composing identity resolution, the contribution upload, relationship persistence and finalization**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveCompressedResponse/saveCompressedResponse.ts **[BE] The COMPRESS arm: a continuation gate on `shouldContinue` alone for both modes, idempotent `CompressedContextRawJson` persistence, a RENDER dispatch plus `waiting_for_children` for a renderable source, and the extracted `CompressedContext` write for a text source**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/saveResponse.ts **[BE] The relocation node: a thin orchestrator routing on the row's `job_type` with `SaveResponseDeps` unchanged, `SaveResponseSuccessReturn['status']` gaining `waiting_for_children`, and the monolith body deleted**

## WS-D — COMPRESSION ORCHESTRATION CUTOVER (depends WS-S)

* `[ ]`   supabase/functions/dialectic-worker/retryJob/retryJob.ts **[BE] Canonicalize the retry dispatcher as a function-folder module whose success arm carries the notified and unnotified flavors and whose error arm carries `RetryJobUpdateError`, so neither failure mode is lost**

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/prepareResponseContent/prepareResponseContent.ts **[BE] Narrow the canonical `retryJob` union at the repo's single retry call site, carrying a notification error onward to the orchestrator**

* `[ ]`   supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts **[BE] Forward canonical-path lookup per candidate, swapping compressed content into resource documents and history messages without mutating inputs and without a deconstructor dep**

* `[ ]`   supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts **[BE] Inject `applyCompressionOverlay` post-gather with the `stageSlug` and `targetKey` its lookup requires, and tighten `ResourceDocument.type` to `'resource' | 'feedback' | 'system'` across all five push sites**

* `[ ]`   supabase/functions/_shared/utils/vector_utils.ts **[BE] Embedding-free selection: `effectiveScore = candidateTokens × importance`, system-typed documents excluded from the candidate pool, and `getEmbedding`/`embeddingClient`/`cosineSimilarity` deleted**

* `[ ]`   supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts **[BE] Full rewrite as an artifact-existence-driven machine: overlay on entry, reduce check for chunked victims, select and spawn ONE victim with a pending success, recount and return the working set when it fits**

* `[ ]`   supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts **[BE] Real `tokenizerDeps`, so one ruler measures the preflight, the per-victim target, scoring and chunk sizing; `isUserConfig` authored once in the owner's guard file and exported from its provides**

* `[ ]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts **[BE] Thread `parentJob`, `projectId`, `iterationNumber` and `targetKey` into `CompressPromptParams` on the EXECUTE branch, and propagate the deferral as `PrepareModelJobPendingReturn`**

* `[ ]`   supabase/functions/chat/streamChat/StreamChat.ts **[BE] Replace the character-indexing `getEncoding` and `text.length` `countTokensAnthropic` with the real implementations behind `tokensRequiredForStreaming`**

* `[ ]`   supabase/functions/chat/streamRewind/streamRewind.ts **[BE] The same replacement behind `tokensRequiredForRewind`, after which no production source constructs a character-indexing tokenizer**

* `[ ]`   supabase/functions/dialectic-worker/index.ts **[BE] Bind `applyCompressionOverlay` and add it to `boundGatherArtifacts`'s deps at the worker composition root**

* `[ ]`   supabase/functions/netlifyResponse/index.ts **[BE] Rebuild the `retryJob` member of the inline `SaveResponseDeps` literal to the canonical form, closing the transient the `retryJob` node opens on this file**

* `[ ]`   supabase/functions/dialectic-worker/processSimpleJob.ts **[BE] Supply `stageSlug` and `targetKey` to `gatherArtifacts`, exit cleanly on a pending return, narrow the canonical `retryJob` return at its single call site, and carry the full-chain compression integration test**

## WS-X — RAG REMOVAL (shares WS-D's commit)

WS-D severed every live functional reference into the RAG core; this closes it out by deleting it. No full nodes — deletions and reference cleanup only.

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