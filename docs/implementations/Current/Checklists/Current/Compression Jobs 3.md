[ ] // So that find->replace will stop unrolling my damned instructions! 

# **Compression Jobs**

## Problem Statement

When an assembled model call exceeds the model's input window, the pipeline enters the legacy RAG compression loop (`compressPrompt` → `RagService` → `IndexingService` → `dialectic_memory`) and document generation fails. The RAG path is structurally unfit for this pipeline: it embeds synchronously inside Supabase (a universal block with no provenance or attribution), it retrieves session-wide with generic stage-template queries so every victim document is replaced by nearly the same snippet blob, and its output destroys the document structure downstream agents need to populate their JSON skeletons. The application generates quality documents end-to-end whenever compression does not run, and fails whenever it does.

## Objectives

* Replace RAG compression with first-class, job-driven, schema-targeted COMPRESS jobs that ride the existing stream model-call transport, per `Compression Jobs Scope.md` (same folder — the ratified scope & order this workplan implements; its CANONICAL CONTRACTS section governs every function shape in this plan).
* Make victim selection pure computation — `effectiveScore = candidateTokens × importance` (importance from `inputsRelevance` for documents, from positional `valueScore` for history) — with no embeddings anywhere; one victim per resume cycle, stopping as soon as the preflight fits.
* Persist compressed output as `CompressedContext` resource artifacts keyed by (session, consuming stage, target schema key, source identity), named `{source_basename}_compressed_for_{target_key}.md` in the consuming stage's `_work` directory; validate JSON-mode output structurally against the source (drift is a validated invariant); render through the source document's original template; overlay on resume; reuse across sibling agents via three-layer opportunistic dedup.
* Remove the RAG core entirely: `rag_service`, `indexing_service`, `dialectic_memory`, `match_dialectic_chunks`, and every `embeddingClient` call site.
* Land the work in five sprints with commit seams per the scope's SPRINT / COMMIT MAP; every sprint ends compiling with tests green.

## Expected Outcome

Oversized model inputs compress incrementally until the preflight fits: the parent job pauses via `waiting_for_children`, COMPRESS children run on the production stream path with the parent's own model, artifacts persist with full provenance and real wallet attribution, sibling jobs producing the same target reuse artifacts without recompressing, and the overlay swaps compressed content invisibly to the orchestrator. No synchronous model calls remain in Supabase; no RAG code or schema remains in the repo; a full-chain integration test proves the loop end to end.

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 
* `docs/implementations/Current/Checklists/Current/Compression Jobs Scope.md` — the ratified scope-and-order plan this workplan is built from. Canonical contracts, sprint/commit map, design decisions, and the forbidden-token sweep live there.
* `Embedding Jobs.md` and `Embedding Jobs 2.md` (same folder) — SUPERSEDED workplans retained as crib material only. They were written against the abandoned `feat/embedding` baseline; anything lifted must be re-validated against `feat/compress` and must pass the scope's forbidden-token sweep.
* Baseline branch: `feat/compress`, cut from `development`.

# Work Breakdown Structure

* **Compression Jobs Implementation**

## WS-P COMPRESS response persistence 

* `[ ]`   supabase/functions/dialectic-worker/`processJob.ts` **[BE] Complete the COMPRESS case's dependency literal: bind the continuation assembler into the eighth member `ProcessCompressJobDeps` now declares, and give the compression-assembler closure the `fileManager` and `constructStoragePath` that assembler now requires**

  * `[ ]`   `objective`
    * `[ ]`   The first problem is that this router's `COMPRESS` case is the only production construction site of `ProcessCompressJobDeps`, and that type now has eight members. The WS-P `processCompressJob.ts` node adds `assembleContinuationPrompt: BoundAssembleContinuationPromptFn` so a continuation job routes to continuation assembly instead of re-compressing its source from scratch, and the `compressDeps` literal here still supplies seven. Every other construction of that type lives inside the `processCompressJob` module's own mock, unit suite and integration suite, each owned by that node — this file is the entire production blast radius, and it is the transient that node declares and this one closes.
    * `[ ]`   The second problem is the compression closure. It constructs `AssembleCompressionPromptDeps` as `{ dbClient, renderPromptFn, logger }`, and the WS-P `assembleCompressionPrompt.ts` node makes that type five members: `fileManager` and `constructStoragePath` are required there because that function now persists the prompt it renders as a `CompressionPrompt` artifact at the victim's canonical path. Both values are already in hand at this call site — `ctx.fileManager` reaches `IJobContext` through `IRenderJobContext`'s `IFileContext`, and `constructStoragePath` is already imported by this file and already handed to `compressDeps` — so neither costs a new context member, a new import or a lookup.
    * `[ ]`   Functional goal, compression closure: `boundAssembleCompressionPrompt` passes `fileManager: ctx.fileManager` and `constructStoragePath` alongside the three members it passes today, and returns the assembler's `AssembleCompressionPromptReturn` unchanged. Its parameters stay `(assembleParams, assemblePayload)`, forwarded verbatim.
    * `[ ]`   Functional goal, continuation closure: a new `boundAssembleContinuationPrompt`, typed `BoundAssembleContinuationPromptFn`, takes the job and calls `ctx.promptAssembler.assembleContinuationPrompt` with `dbClient`, `fileManager: ctx.fileManager`, that `job`, `constructStoragePath`, and the `downloadFromStorage` adapter below, returning the `AssembledPrompt` unchanged. `IPromptAssembler` already declares the method and `PromptAssembler` already delegates straight to the implementation, so the closure reaches the assembler through the seam every other prompt already uses.
    * `[ ]`   Functional goal, the adapter: `AssembleContinuationPromptDeps.downloadFromStorage` is `(bucket, path) => Promise<DownloadStorageResult>`, while `ctx.downloadFromStorage` is `DownloadFromStorageFn`, `(supabase, bucket, path) => Promise<DownloadStorageResult>`. The closure therefore supplies `(bucket, path) => ctx.downloadFromStorage(dbClient, bucket, path)`, closing over the client this function was handed. `PromptAssembler`'s constructor performs the identical adaptation for its own `downloadFromStorageFn` before passing it to this same assembler, so the form is this package's existing one and not a second convention.
    * `[ ]`   Functional goal, the six absent members: the closure supplies none of `project`, `session`, `stage`, `gatherContext`, `assembleChunks`, `gatherContinuationInputs`. The WS-P `assembleContinuationPrompt.ts` node makes all six optional precisely because its COMPRESS branch reads none of them, and this router holds no recipe-stage context for a COMPRESS row — supplying one would mean inventing it. The five-member literal is the exact shape that node's interface test proves by typed assignment.
    * `[ ]`   Functional goal, the deps literal: `compressDeps` gains `assembleContinuationPrompt: boundAssembleContinuationPrompt`, declared immediately after `assembleCompressionPrompt`, so the two assemblers read as the pair `ProcessCompressJobDeps` declares them.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No `IJobContext` member, no `JobContextParams` member, no `IPromptAssembler` method, no `PromptAssembler` method and no composition root is edited. `ctx.promptAssembler` is typed `IPromptAssembler`, which already declares both assembler methods; `fileManager` and `downloadFromStorage` are already `IFileContext` members that `IJobContext` inherits through `IRenderJobContext`; and `createJobContext` already carries all three onto the root context. Both closures are built entirely from what this function already receives.
      * `[ ]`   The `EXECUTE`, `PLAN`, `RENDER` and `default` cases are untouched, including the `jobIsExecuteJob`/`jobIsPlanJob` narrowing helpers, the `createPlanJobContext`/`createRenderJobContext` slicing, every log line and every throw message.
      * `[ ]`   Everything else in the `COMPRESS` case is untouched: the `isDialecticCompressJobPayload` narrowing and its `Invalid COMPRESS payload for job …` throw, the `DialecticCompressJobPayload` binding, the `ProcessCompressJobParams` literal, the tokenizer members of `compressDeps` and their `isKnownTiktokenEncoding` narrowing, the `isProcessCompressJobErrorReturn` branch, its `TablesUpdate<'dialectic_generation_jobs'>` status-and-error update, and its rethrow of an update error.
      * `[ ]`   Neither closure is invoked by this function, neither is wrapped in a try/catch here, and neither transforms a return. This file constructs two callables and hands them over; an assembler failure is reported by `processCompressJob` through its own typed return.

  * `[ ]`   `role`
    * `[ ]`   Application-layer router: the worker's single dispatch point, turning one job row into one processor call with the dependencies that processor declares. The role is appropriate because the COMPRESS case is a composition seam — it is where a `ctx`-held collaborator becomes the bound closure a module-shaped function requires, exactly as it already is for `assembleCompressionPrompt`.
    * `[ ]`   Out of scope: choosing between the two assemblers (`processCompressJob.ts` selects on `continuation_count`); what either assembler reads, renders or persists; validating the COMPRESS payload beyond the guard call this function already makes; marking a job `completed` on a successful enqueue (`saveResponse.ts`); and the shape of `ProcessCompressJobDeps` itself, which `processCompressJob.interface.ts` owns.

  * `[ ]`   `module`
    * Conforms to: [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   Bounded context: `dialectic-worker/processJob.ts` and its sole support file `dialectic-worker/processJob.test.ts`. Both exist.
    * `[ ]`   No rider outside those two files. Every type and guard this node consumes is landed by an earlier node: `BoundAssembleContinuationPromptFn` and the optional recipe-stage members by the WS-P `assembleContinuationPrompt.ts` node; the widened `AssembleCompressionPromptDeps` by the WS-P `assembleCompressionPrompt.ts` node; the eighth `ProcessCompressJobDeps` member by the WS-P `processCompressJob.ts` node.
    * `[ ]`   This file has no `.interface.ts`, `.guard.ts`, `.mock.ts` or `.provides.ts` and none is created here: it declares no type, owns no guard, and every symbol it names belongs to a module it dispatches to. Creating any of them would retrofit a functioning router for a reason this node's work does not require.
    * `[ ]`   Inside boundary: what dependencies the COMPRESS case constructs and from which `ctx` members. Outside boundary: what those dependencies do when called, and every other case in the switch.

  * `[ ]`   `deps`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md), [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   `BoundAssembleContinuationPromptFn` (`_shared/prompt-assembler/prompt-assembler.interface.ts`) — new type-only import, the one import this node adds. Landed by the WS-P `assembleContinuationPrompt.ts` node, which owns that file; this node consumes it and declares it not.
    * `[ ]`   `BoundAssembleCompressionPromptFn`, `renderPrompt`, `constructStoragePath`, `ProcessCompressJobDeps`, `ProcessCompressJobParams`, `isProcessCompressJobErrorReturn`, `isDialecticCompressJobPayload`, `DialecticCompressJobPayload`, `TablesUpdate`, `countTokensAnthropic`, `rawGetEncoding`, `isKnownTiktokenEncoding`, `IJobContext`, `IPlanJobContext`, `IRenderJobContext` — all already imported by this file and unchanged.
    * `[ ]`   `ctx.fileManager` and `ctx.downloadFromStorage` — existing `IFileContext` members reached through `IJobContext`, read here for the first time by this file. Neither is added to any interface, and no adapter is imported: `downloadFromStorage` is injected on the context, and the arity adaptation is written at this seam because the seam is what differs.
    * `[ ]`   `ctx.promptAssembler` — existing `IJobContext` member, already read by this file for the compression closure and now read once more for the continuation closure.
    * `[ ]`   Type guards are not injected and none is added: `isDialecticCompressJobPayload` is called exactly where it is called today.
    * `[ ]`   Confirm: every edge runs `dialectic-worker/` → `_shared/`, and `_shared/prompt-assembler/` imports nothing from this file. No reverse dependency, no lateral violation, no cycle.

  * `[ ]`   `context_slice`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md)
    * `[ ]`   From `ctx` the COMPRESS case reads, for the work this node adds: `fileManager` and `downloadFromStorage`. It already reads `logger`, `promptAssembler`, `enqueueModelCall` and `countTokens`.
    * `[ ]`   From its own arguments it reads `dbClient`, `job`, `projectOwnerUserId` and `authToken` exactly as it does today; the continuation closure's own `job` parameter is what varies per invocation and is the only value it does not close over.
    * `[ ]`   Confirm: no over-fetching and no fetching at all. This node adds no query, no row read and no service construction — every value both closures need is already on the context or already an argument.

  * `[ ]`   `processJob.interaction.spec` (prose; no file — this directory declares no literal `.interaction.spec`, matching its siblings)
    * Conforms to: [composition](../../../../agents/composition.md), [errors-and-returns](../../../../agents/errors-and-returns.md), [guards](../../../../agents/guards.md)
    * `[ ]`   Called by: the worker's job handler, once per job row. Asynchronous, returning `void`; on the COMPRESS path its only side effect is the one job-row update the error branch already performs.
    * `[ ]`   Branch — routing. Condition: `job.job_type`. Decision: the existing switch. Outcomes for `EXECUTE`, `PLAN`, `RENDER` and `default` are exactly today's, unchanged in every respect.
    * `[ ]`   Branch — COMPRESS payload narrowing. Condition: `isDialecticCompressJobPayload(job.payload)` is false. Outcome: throws `Invalid COMPRESS payload for job ${jobId}`. Unchanged, and still evaluated before any dependency is constructed.
    * `[ ]`   Branch — compression closure construction. Decision: none. Dependency call on invocation by `processCompressJob`: `ctx.promptAssembler.assembleCompressionPrompt` with `{ dbClient, renderPromptFn: renderPrompt, logger: ctx.logger, fileManager: ctx.fileManager, constructStoragePath }` and the caller's own params and payload forwarded verbatim. Outcome: the `AssembleCompressionPromptReturn` returned unchanged, both arms.
    * `[ ]`   Branch — continuation closure construction. Decision: none. Dependency call on invocation: `ctx.promptAssembler.assembleContinuationPrompt` with `{ dbClient, fileManager: ctx.fileManager, job, downloadFromStorage: (bucket, path) => ctx.downloadFromStorage(dbClient, bucket, path), constructStoragePath }` — five members, the six optional recipe-stage members deliberately absent. Outcome: the `AssembledPrompt` returned unchanged.
    * `[ ]`   Branch — deps and params literals. Decision: none. Outcome: a `ProcessCompressJobDeps` carrying eight members — the two closures above plus `enqueueModelCall`, `countTokens`, `getEncoding`, `countTokensAnthropic`, `constructStoragePath` and `logger`, each unchanged — and today's `ProcessCompressJobParams`.
    * `[ ]`   Branch — dispatch. Dependency call: `processors.processCompressJob(compressDeps, compressParams, compressPayload)`. Outcome: its `ProcessCompressJobReturn`, consumed by the branch below.
    * `[ ]`   Branch — error return. Condition: `isProcessCompressJobErrorReturn(result)`. Dependency call: one `dialectic_generation_jobs` update setting `status: 'failed'` and `error_details` from the returned `error.message` and `retriable`. Outcome on update error: the update error is thrown. On the success return: no write, no notification, and a plain return. All unchanged.
    * `[ ]`   Side effects and ordering: the payload guard precedes both closure declarations, both closures precede the deps literal, the deps literal precedes the dispatch, and the dispatch precedes the error branch. Neither closure is invoked before the dispatch, so no assembler runs inside this function.
    * `[ ]`   Failure modes: this function adds no try/catch and swallows nothing. An assembler failure reaches `processCompressJob` as that assembler's own error arm, and a throw from either closure propagates out of this function exactly as a throw from any other case does.

  * `[ ]`   `processJob.test.ts`
    * Conforms to: [tests#unit](../../../../agents/tests.md#unit), [errors-and-returns](../../../../agents/errors-and-returns.md), [composition](../../../../agents/composition.md)
    * `[ ]`   The four existing COMPRESS cases and every `EXECUTE`/`PLAN`/`RENDER`/`null`-type case keep their assertions unmodified: they route through `createMockJobProcessors` and never inspect the deps literal, and the shared `mockCtx` is already a full `createJobContext(createMockJobContextParams())` whose `promptAssembler` is a `MockPromptAssembler` and whose `fileManager` is a `MockFileManagerService`, so both closures construct with no fixture work.
    * `[ ]`   New: the deps object `processors.processCompressJob` receives satisfies `isProcessCompressJobDeps` — captured off the existing `spies.processCompressJob` call args and narrowed by the module's own guard, imported from `./processCompressJob/processCompressJob.guard.ts`. That guard requires `assembleContinuationPrompt` after the WS-P `processCompressJob.ts` node, so this case is the omission proof at the construction site and is RED until the literal carries the member.
    * `[ ]`   New: invoking the captured `deps.assembleCompressionPrompt` with `buildAssembleCompressionPromptParams()` and `buildAssembleCompressionPromptPayload()` (the assembler module's own builders) calls `MockPromptAssembler`'s `assembleCompressionPrompt` spy exactly once, and that call's first argument carries `dbClient` strictly equal to the client passed to `processJob`, `logger` strictly equal to `mockCtx.logger`, `fileManager` strictly equal to `mockCtx.fileManager`, and a `constructStoragePath` function; its second and third arguments are the params and payload passed to the closure, unchanged.
    * `[ ]`   New: invoking the captured `deps.assembleContinuationPrompt` with the test's own job row calls `MockPromptAssembler`'s `assembleContinuationPrompt` spy exactly once, and that call's deps argument carries `dbClient`, `fileManager` strictly equal to `mockCtx.fileManager`, `job` strictly equal to the row passed in, and a `constructStoragePath` function.
    * `[ ]`   New: that same deps argument carries none of `project`, `session`, `stage`, `gatherContext`, `assembleChunks`, `gatherContinuationInputs` — asserted per member with an `in` check, because the COMPRESS branch reads none of them and a router that supplied one would be inventing recipe-stage context for a COMPRESS row.
    * `[ ]`   New: the `downloadFromStorage` that deps argument carries is the two-argument adapter — invoke it with a bucket and a path and assert the context's own `downloadFromStorage` received three arguments, the first strictly equal to the `dbClient` passed to `processJob` and the second and third the bucket and path given. The context for this case is built by `createMockRootContext({ downloadFromStorage: <a production-typed `DownloadFromStorageFn` declared in the test and wrapped by the runner's spy> })`, so the recording is applied at the call site and no mock is configured.
    * `[ ]`   Do NOT re-test: either assembler's own behavior, `processCompressJob`'s branch selection, `constructStoragePath`'s naming, or `isDialecticCompressJobPayload`'s checklist — each belongs to its own module's tests.

  * `[ ]`   `construction`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md), [composition](../../../../agents/composition.md)
    * `[ ]`   No factory. `processJob` stays one exported async function with its existing five-argument legacy signature, which this node does not touch.
    * `[ ]`   Both closures are declared inside the `COMPRESS` case body, above the `compressDeps` literal, in the same flat `const x: T = (…) => ctx.promptAssembler.method({ … });` form the existing compression closure already uses. No partially constructed dependency exists: every member of both literals is set explicitly at declaration.

  * `[ ]`   `processJob.ts` (Implementation)
    * Conforms to: [composition](../../../../agents/composition.md), [dependency-injection](../../../../agents/dependency-injection.md), [types](../../../../agents/types.md), [errors-and-returns](../../../../agents/errors-and-returns.md), [guards](../../../../agents/guards.md), [logging](../../../../agents/logging.md)
    * `[ ]`   Add the type-only import of `BoundAssembleContinuationPromptFn` from `../_shared/prompt-assembler/prompt-assembler.interface.ts`, beside the existing `BoundAssembleCompressionPromptFn` import.
    * `[ ]`   In `boundAssembleCompressionPrompt`'s deps literal, add `fileManager: ctx.fileManager` and `constructStoragePath` to the three members already there. Nothing else in that closure moves.
    * `[ ]`   Declare `boundAssembleContinuationPrompt` immediately below it, typed `BoundAssembleContinuationPromptFn`, taking the job and calling `ctx.promptAssembler.assembleContinuationPrompt` with the five-member literal named in the branch contract, its `downloadFromStorage` the two-argument arrow closing over `dbClient`.
    * `[ ]`   Add `assembleContinuationPrompt: boundAssembleContinuationPrompt` to `compressDeps`, immediately after `assembleCompressionPrompt`.
    * `[ ]`   Nothing else in the file changes: no `console` call, no logging removed, no default value introduced, no cast, and no member of either literal left to a fallback.

  * `[ ]`   `directionality`
    * Conforms to: [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   Layer: application-layer worker router. Deps inward: `_shared/prompt-assembler/`, `_shared/utils/path_constructor.ts`, `_shared/utils/type-guards/`, the `processCompressJob`, `enqueueCompressJobs`, `enqueueModelCall` and `createJobContext` module interfaces, and `types_db.ts`. Provides outward: nothing — this file is imported by the worker entrypoint and exports only `processJob`.
    * `[ ]`   No cycle: `_shared/prompt-assembler/` imports nothing from `dialectic-worker/processJob.ts`, and `processCompressJob` imports this file not at all.
    * `[ ]`   This node closes the transient the WS-P `processCompressJob.ts` node declares. No transient of its own remains open: after it, every `ProcessCompressJobDeps` and `AssembleCompressionPromptDeps` construction site in the repo — this one, and the `processCompressJob` and `assembleCompressionPrompt` modules' own mocks and suites — carries every member its type requires.

  * `[ ]`   `requirements` (binary, observable)
    * Conforms to: [tdd-ordering](../../../../agents/tdd-ordering.md)
    * `[ ]`   The deps object handed to `processors.processCompressJob` satisfies `isProcessCompressJobDeps` and carries all eight members.
    * `[ ]`   The compression closure calls `ctx.promptAssembler.assembleCompressionPrompt` with a deps object carrying `dbClient`, `renderPromptFn`, `logger`, `fileManager` and `constructStoragePath`, and forwards its params and payload unchanged.
    * `[ ]`   The continuation closure calls `ctx.promptAssembler.assembleContinuationPrompt` with a deps object carrying exactly `dbClient`, `fileManager`, the job it was given, `downloadFromStorage` and `constructStoragePath`, and none of the six recipe-stage members.
    * `[ ]`   The `downloadFromStorage` that closure supplies takes two arguments and calls `ctx.downloadFromStorage` with the router's own `dbClient` followed by that bucket and path.
    * `[ ]`   `processJob.ts` adds exactly one import, declares no type, and edits no file outside itself and `processJob.test.ts`.
    * `[ ]`   Every pre-existing `EXECUTE`, `PLAN`, `RENDER`, `null`-type and COMPRESS case in `processJob.test.ts` passes with its assertions unmodified.

## WS-D — COMPRESSION ORCHESTRATION CUTOVER (depends WS-P)

* `[ ]`   supabase/functions/dialectic-worker/applyCompressionOverlay/`applyCompressionOverlay.ts` **[BE] Swap already-compressed victim content (resource documents and history messages) into the working document set by canonical-path existence check, so a resumed job's re-gather reflects prior compression without ever re-triggering it**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing overlay step in the TARGET ARCHITECTURE's step 7 (`Compression Jobs Scope.md`): after a COMPRESS child completes and the parent job's DB completion trigger wakes it, the resumed job re-gathers its artifacts — but the resource documents and history messages it re-gathers are still the ORIGINAL, uncompressed content. This node swaps in the persisted `CompressedContext` artifact wherever one exists for the current (session, consuming stage, target key, source identity) tuple, so `compressPrompt`'s recount sees the compressed size instead of looping forever on the same victim.
    * `[ ]`   Functional goals:
      * `[ ]`   For each `ResourceDocument` in `payload.resourceDocuments` whose `type` is `'resource'` or `'feedback'` (any other value — today's pre-alignment `'document'`/`'seed_prompt'`/`'project_resource'`/generic-catch-all strings, or the post-alignment `'system'` the `gatherArtifacts` node introduces — is skipped outright: it can never have a `CompressedContext` artifact, since `enqueueCompressJobs` only ever spawns COMPRESS children for scored candidates, and scored candidates are exactly `'resource'`/`'feedback'`), construct the canonical lookup identity: `sourceType: 'resource', documentKey: doc.document_key` for `'resource'`; `sourceType: 'feedback', sourceId: doc.id` for `'feedback'` (per `Compression Jobs Scope.md`'s WS-C identity rule — `'feedback'`/`'history'` key by `sourceId`, never `documentKey`, even though a feedback `ResourceDocument` also carries a `document_key` field).
      * `[ ]`   For each `Messages` entry in `payload.history` whose `id` is a non-empty string (entries without an id — e.g. `compressPrompt`'s synthetic `"Please continue."`/empty-assistant alternation-fillers — are skipped: they were never original candidates and can never have an artifact), construct `sourceType: 'history', sourceId: message.id`.
      * `[ ]`   For every candidate identity built above, call `deps.constructStoragePath({ projectId: params.projectId, fileType: FileType.CompressedContext, sessionId: params.sessionId, iteration: params.iterationNumber, stageSlug: params.stageSlug, targetKey: params.targetKey, sourceType, documentKey?, sourceId? })` (the `FileType.CompressedContext` branch, `path_constructor.ts:303-337`, already validates the `sourceType`/`documentKey`/`sourceId` pairing) to get `{ storagePath, fileName }`.
      * `[ ]`   Query `params.dbClient.from('dialectic_project_resources').select('storage_bucket, storage_path, file_name').eq('storage_path', storagePath).eq('file_name', fileName).maybeSingle()`. `storage_path` + `file_name` alone are sufficient to identify the row without also filtering `storage_bucket`: the table's own unique constraint is `(storage_bucket, storage_path, file_name)` (`file_manager.ts:420`, `:401-415`'s `recordData`), but every environment writes through exactly one `SB_CONTENT_STORAGE_BUCKET`, so no second row can share this `(storage_path, file_name)` pair under a different bucket in practice — mirrors the file_manager's own reliance on this same triple for its `upsert`'s `onConflict`.
      * `[ ]`   No row (`data === null`, `error === null`): NOT compressed yet — leave this candidate's content unchanged and continue to the next candidate. This is the expected, common case (most calls to this function find nothing to overlay) — never an error.
      * `[ ]`   Row found: call `deps.downloadFromStorage(params.dbClient, row.storage_bucket, \`${row.storage_path}/${row.file_name}\`)` (the exact `(supabase, bucket, path)` signature and full-path convention `gatherArtifacts.ts:118-122` already uses with the SAME `DownloadFromStorageFn`). Decode `result.data` (`ArrayBuffer`) via `new TextDecoder().decode(...)`, matching `gatherArtifacts.ts:133`'s own decode line.
      * `[ ]`   Build a NEW `ResourceDocument`/`Messages` object — `{ ...original, content: decodedText }` — preserving `id`/`document_key`/`stage_slug`/`type` (for `ResourceDocument`) or `id`/`role`/`name` (for `Messages`) unchanged; never mutate the input array elements in place.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   A `dbClient` query error (the `.maybeSingle()` call itself failing) is a genuine, unexpected failure — return `{ error, retriable: false }` immediately, surfacing the real Postgrest error, not a paraphrase.
      * `[ ]`   A DB row existing but `downloadFromStorage` failing (or returning `data: null`) is a storage/DB inconsistency, not a "not yet compressed" case — return `{ error, retriable: false }` (per `[[feedback_no_skip_broken_data]]`: never silently proceed with stale content when the system's own bookkeeping says a compressed artifact should be there).
      * `[ ]`   This function performs NO writes of any kind (no upload, no job-status update, no notification) — it is a pure read-and-swap step; `enqueueCompressJobs`/`saveResponse` own all writes to `CompressedContext` artifacts.
      * `[ ]`   `payload.resourceDocuments`/`payload.history` MAY individually be empty arrays (valid, common on a job's first pass before any compression has occurred) — the payload object itself is never empty per the repo's `Fn(deps, params, payload)` convention, but its array fields are not required to be non-empty.

  * `[ ]`   `role`
    * `[ ]`   New package; full module structure applies per `workplan.instructions.md`'s new-package rule.
    * `[ ]`   Out of scope: selecting WHICH candidate is the next victim (`vector_utils.ts`, next node); spawning COMPRESS children (`enqueueCompressJobs.ts`, already-written WS-R node); persisting the `CompressedContext` artifact in the first place (`saveResponse.ts`, already-written WS-B node); wiring this function as `gatherArtifacts`'s injected dep (that is the `gatherArtifacts.ts` node, next).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/applyCompressionOverlay/` — given a working set of resource documents and history messages plus a compression-target identity, returns the same shapes with any already-compressed candidates' content swapped in.

  * `[ ]`   `deps`
    * `[ ]`   `constructStoragePath: ConstructStoragePathFn` (`path_constructor.types.ts`, already-written Sprint-2 node) — pure utility, injected for test substitutability per the same treatment already established for it in the `enqueueCompressJobs.ts`/`processCompressJob.ts` nodes; no mock needed (deterministic).
    * `[ ]`   `downloadFromStorage: DownloadFromStorageFn` (`_shared/supabase_storage_utils.ts`, pre-existing) — the SAME function `gatherArtifacts.ts` already uses; a storage-boundary dep, mocked in unit tests.
    * `[ ]`   `logger: ILogger`.
    * `[ ]`   Confirm: no reverse dependency (does not import `gatherArtifacts.ts`/`compressPrompt.ts`/`vector_utils.ts`); no lateral violation. NOTE (corrects the scope's original ticket text): this node does NOT depend on `deconstructStoragePath` — `path_deconstructor.ts`'s `CompressedContext` branch (`path_deconstructor.ts:639-658`) recovers `documentKey`/`targetKey`/`chunkIndex` from a stored path but has no `sourceId`/`sourceType` fields in `DeconstructedPathInfo` at all (an 8-char short hash is not reversible to the original UUID), so reverse-parsing an arbitrary stored path could never recover a `'feedback'`/`'history'` candidate's exact identity. Every candidate this function needs to check ALREADY carries its own identity directly (`ResourceDocument.id`/`.document_key`/`.type`, `Messages.id`) — forward construction via `constructStoragePath` (the same direction `enqueueCompressJobs`'s own dedup-layer-1 check uses) plus a DB existence read is the correct and sufficient approach; no reverse parsing is needed anywhere in this function.

  * `[ ]`   `applyCompressionOverlay.interface.test.ts`
    * `[ ]`   Valid/invalid cases for `isApplyCompressionOverlayDeps`/`Params`/`Payload`/`Return`, mirroring the shape-testing style already used in `enqueueCompressJobs.interface.test.ts`.
    * `[ ]`   `ApplyCompressionOverlaySuccessReturn { resourceDocuments; history }` and `ApplyCompressionOverlayErrorReturn { error; retriable }` never co-occur.

  * `[ ]`   `applyCompressionOverlay.interface.ts`
    * `[ ]`   Define `ApplyCompressionOverlayDeps { constructStoragePath: ConstructStoragePathFn; downloadFromStorage: DownloadFromStorageFn; logger: ILogger }`.
    * `[ ]`   Define `ApplyCompressionOverlayParams { dbClient: SupabaseClient<Database>; projectId: string; sessionId: string; iterationNumber: number; stageSlug: string; targetKey: string }` — `stageSlug` is the CONSUMING stage (whose `_work` directory holds the artifacts being checked); `targetKey` is this job's own compression target schema key.
    * `[ ]`   Define `ApplyCompressionOverlayPayload { resourceDocuments: ResourceDocuments; history: Messages[] }`.
    * `[ ]`   Define `ApplyCompressionOverlaySuccessReturn { resourceDocuments: ResourceDocuments; history: Messages[] }`, `ApplyCompressionOverlayErrorReturn { error: Error; retriable: boolean }`, `ApplyCompressionOverlayReturn = SuccessReturn | ErrorReturn`.
    * `[ ]`   Define `ApplyCompressionOverlayFn(deps, params, payload) => Promise<ApplyCompressionOverlayReturn>` and `BoundApplyCompressionOverlayFn(params, payload) => Promise<ApplyCompressionOverlayReturn>`.

  * `[ ]`   `applyCompressionOverlay.interaction.spec` (prose; no file, matching this directory's established precedent from `processCompressJob.ts`)
    * `[ ]`   Called by: `gatherArtifacts.ts` (next node), as an injected dep invoked once per gather, after the raw artifact gather completes and before returning to its own caller.
    * `[ ]`   Required interactions: for each eligible candidate (resource/feedback document, or history message with an id), one `constructStoragePath` call, one `dialectic_project_resources` existence read, and — only on a hit — one `downloadFromStorage` call. Zero writes on any path.
    * `[ ]`   Failure modes: existence-query failure (not retriable — surfaced as-is); row-exists-but-download-fails (not retriable — data/DB inconsistency).

  * `[ ]`   `applyCompressionOverlay.guard.test.ts` / `applyCompressionOverlay.guard.ts`
    * `[ ]`   `isApplyCompressionOverlayDeps`/`Params`/`Payload`/`SuccessReturn`/`ErrorReturn`, structured exactly like `enqueueCompressJobs`'s own guard file (required-key presence, then per-field checks; mutual exclusion for the two Return variants).

  * `[ ]`   `applyCompressionOverlay.mock.ts`
    * `[ ]`   `createApplyCompressionOverlayMock(options?: { result?; handler? })` returning `{ applyCompressionOverlay, calls }`, structured exactly like `createProcessCompressJobMock`; default fallback echoes `payload.resourceDocuments`/`payload.history` unchanged (no overlay found).
    * `[ ]`   Trusted Factories: `buildApplyCompressionOverlayDeps(overrides?)` (default `constructStoragePath` real, `downloadFromStorage` a stub returning `{ data: null, error: new Error('not found') }`), `buildApplyCompressionOverlayParams(overrides?)`, `buildApplyCompressionOverlayPayload(overrides?)`.

  * `[ ]`   `applyCompressionOverlay.test.ts`
    * `[ ]`   A `'resource'`-typed document with no matching `dialectic_project_resources` row is returned unchanged; `downloadFromStorage` never called.
    * `[ ]`   A `'resource'`-typed document WITH a matching row has its `content` replaced with the decoded download result; `id`/`document_key`/`stage_slug`/`type` unchanged.
    * `[ ]`   A `'feedback'`-typed document is looked up by `sourceId: doc.id` (not `documentKey`), and overlaid the same way on a hit.
    * `[ ]`   A history message with a matching artifact is looked up by `sourceId: message.id`; overlaid the same way; `role`/`name` unchanged.
    * `[ ]`   A `'system'`-typed document (and, pre-alignment, a `'document'`/`'seed_prompt'`/`'project_resource'`-typed one) is never looked up — no `constructStoragePath`/query/download call for it at all.
    * `[ ]`   A history message with no `id` is never looked up.
    * `[ ]`   Existence-query error → `{ error, retriable: false }`; no further candidates processed.
    * `[ ]`   Row exists but `downloadFromStorage` errors → `{ error, retriable: false }`.
    * `[ ]`   Empty `resourceDocuments`/`history` arrays → success return with both arrays empty; no queries made.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Per-candidate: build identity → construct path → existence read → (miss: continue) | (hit: download → replace content). Documents processed before history, in array order, matching this directory's established iteration style (`vector_utils.ts`'s own document-then-history ordering).

  * `[ ]`   `applyCompressionOverlay.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`/`construction`.

  * `[ ]`   `applyCompressionOverlay.provides.ts`
    * `[ ]`   Re-export `applyCompressionOverlay`, all interface types, all guards, all mock builders.

  * `[ ]`   `applyCompressionOverlay.integration.test.ts`
    * `[ ]`   Bounded subsystem: real `applyCompressionOverlay`, real `constructStoragePath`; only Supabase (`dbClient`) and `downloadFromStorage` are mocked.
    * `[ ]`   A pre-seeded `dialectic_project_resources` row at the exact canonical path (built via the SAME `constructStoragePath` call this function uses, proving no path-construction drift between test setup and implementation) is found and overlaid onto its matching resource-document candidate.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration helper (pure read-and-swap step, no job-state ownership). Deps inward: `path_constructor.ts` (Sprint-2), `supabase_storage_utils.ts` (pre-existing) — no lateral or reverse dependency. Provides outward: consumed by `gatherArtifacts.ts` (next node) as an injected dep.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   A candidate with an existing canonical `CompressedContext` artifact has its content replaced with the artifact's decoded text; every other field on that candidate is unchanged.
    * `[ ]`   A candidate with no existing artifact is returned byte-for-byte unchanged.
    * `[ ]`   `'system'`-typed documents and id-less history messages are never queried.
    * `[ ]`   Any existence-query or download failure returns `{ error, retriable: false }` — this function never silently proceeds with stale content when its own dependencies report inconsistent state.
    * `[ ]`   This function performs zero writes (no storage upload, no DB write, no notification) on any path.

* `[ ]`   supabase/functions/dialectic-worker/gatherArtifacts/`gatherArtifacts.ts` **[BE] Align `ResourceDocument.type` to a real 3-member union instead of a loose `string`, and wire `applyCompressionOverlay` as a post-gather injected dep so a resumed job's re-gather reflects prior compression**

  * `[ ]`   `objective`
    * `[ ]`   Solve two coupled gaps: (1) `_shared/types.ts`'s `ResourceDocument.type: string` admits any string, so `vector_utils.ts` (next node) cannot safely narrow it to `CompressionSourceType` without a runtime map — the loose typing is what forced the map/no-map question this epic already resolved (ratified 2026-07-11: no map, real union instead); (2) `gatherArtifacts.ts` never applies the compression overlay described in `Compression Jobs Scope.md`'s TARGET ARCHITECTURE step 7, so a job resumed after its COMPRESS children finish still re-gathers the ORIGINAL, uncompressed content.
    * `[ ]`   Functional goals:
      * `[ ]`   RIDES HERE (type edit — `gatherArtifacts.ts` is the first and only function this epic that both PRODUCES `ResourceDocument.type` values and DEMANDS they be narrowed): `_shared/types.ts` gains `export type ResourceDocumentType = 'resource' | 'feedback' | 'system';` immediately above `ResourceDocument`, and `ResourceDocument.type` (`types.ts:168`) narrows from `string` to `ResourceDocumentType`. Per the ratified taxonomy: `'resource'` covers BOTH a rendered document (agent-generated) and a project resource (user-supplied text object) — they are both just text content for compression purposes; `'feedback'` is the user's written response to a rendered document; `'system'` covers internal/required-but-never-compressible artifacts (header_context and other pipeline-internal objects fetched via the generic `dialectic_contributions` catch-all, and the project's original seed prompt, which is transformed into a different object before any later model call and never appears as a compression candidate).
      * `[ ]`   RIDES HERE (the guard `ResourceDocument.type` demands): `_shared/utils/type-guards/type_guards.chat.ts` gains `export function isResourceDocumentType(value: unknown): value is ResourceDocumentType { return value === 'resource' || value === 'feedback' || value === 'system'; }`, imported alongside the existing `ResourceDocument` import (`type_guards.chat.ts:13`) by adding `ResourceDocumentType` to that same `from "../../types.ts"` import. The EXISTING `isResourceDocument` (`type_guards.chat.ts:222-231`) tightens its own `type` check from `typeof obj.type === 'string'` to `isResourceDocumentType(obj.type)` — its four other field checks (`id`/`content`/`document_key`/`stage_slug`) are unchanged.
      * `[ ]`   Remap all FIVE `gathered.push({...})` sites in `gatherArtifacts.ts` to the new vocabulary (the RULE-type vocabulary read via `rule.type`/`rType` — `'document'`/`'feedback'`/`'seed_prompt'`/`'project_resource'`/arbitrary contribution-family strings like `'header_context'` — is UNCHANGED; only the ARTIFACT's own pushed `type:` field changes):
        * `[ ]`   `rType === "document"` branch (`gatherArtifacts.ts:139`): `type: "document"` → `type: 'resource'`.
        * `[ ]`   `rType === "feedback"` branch (`gatherArtifacts.ts:236`): `type: "feedback"` stays `type: 'feedback'` (no change — already a valid member).
        * `[ ]`   `rType === "seed_prompt"` branch (`gatherArtifacts.ts:295`): `type: "seed_prompt"` → `type: 'system'`.
        * `[ ]`   `rType === "project_resource"` branch (`gatherArtifacts.ts:355`): `type: "project_resource"` → `type: 'resource'`.
        * `[ ]`   The generic catch-all branch (`gatherArtifacts.ts:444-450`, `header_context` and any other non-document/feedback/seed_prompt rule type queried against `dialectic_contributions`): `type: rType` (previously echoing whatever the RULE's own type string was — `'header_context'`, `'contribution'`, etc.) → the FIXED literal `type: 'system'`, regardless of which rule type triggered the branch.
      * `[ ]`   Wire `applyCompressionOverlay` as a POST-GATHER step: after the existing dedup-by-id block (`gatherArtifacts.ts:464-469`) builds the deduplicated artifact list, call `await deps.applyCompressionOverlay({ dbClient, projectId, sessionId, iterationNumber, stageSlug: params.stageSlug, targetKey: params.targetKey }, { resourceDocuments: Array.from(uniqueById.values()), history: [] })` — `history: []` because `gatherArtifacts` has no conversation-history input of its own (`processSimpleJob.ts` assembles `conversationHistory` separately, never through `gatherArtifacts`); the returned `.history` is therefore always `[]` too and is discarded. Narrow the result via `isApplyCompressionOverlayErrorReturn` (imported from `../applyCompressionOverlay/applyCompressionOverlay.guard.ts`): on error, `return toErrorReturn(overlayResult.error);` (reusing this file's existing local `toErrorReturn` helper, `gatherArtifacts.ts:15-20`); on success, `return { artifacts: overlayResult.resourceDocuments };` in place of the current `const success: GatherArtifactsSuccessReturn = { artifacts: Array.from(uniqueById.values()) }; return success;` tail.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No change to any of the FIVE gather branches' query logic, `pickLatest` selection, or `downloadFromStorage` calls — only the pushed `type:` literal changes per branch.
      * `[ ]`   `compressPrompt.ts:23` and `calculateAffordability.ts:162`'s existing `typeof doc.type === "string" && doc.type !== ""` checks are unaffected by the narrowing — a `ResourceDocumentType` value still satisfies `typeof ... === 'string'`; neither file is touched by this node.
      * `[ ]`   `_shared/prompt-assembler/gatherInputsForStage.ts`'s `AssemblerSourceDocument.type` (`prompt-assembler.interface.ts:172`, typed as `InputRule['type']`) is a SEPARATE, independently-defined type unrelated to `ResourceDocument.type` — confirmed by source read; not touched by this node.

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — per `workplan.instructions.md`, does not adopt the full new-package template; only the delta above plus its support system.
    * `[ ]`   Out of scope: `vector_utils.ts`'s own consumption of the narrowed type (next node); `compressPrompt.ts`'s history-side overlay logic (a LATER node's own inline matching, not a call to `applyCompressionOverlay` — that function has exactly one caller, this one); `processSimpleJob.ts`'s own call-site update to pass `stageSlug`/`targetKey` into the now-widened `GatherArtifactsParams` (the LAST node of this sprint; the gap is a transient non-compilable state at that one call site, permitted within the sprint).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/gatherArtifacts/` plus its two support-file riders (`_shared/types.ts`'s `ResourceDocument`/`ResourceDocumentType`, `_shared/utils/type-guards/type_guards.chat.ts`'s `isResourceDocument`/`isResourceDocumentType`) — both riders exist only to serve this function's demand for a real union.

  * `[ ]`   `deps`
    * `[ ]`   `applyCompressionOverlay: BoundApplyCompressionOverlayFn` (`../applyCompressionOverlay/applyCompressionOverlay.interface.ts`, prior node) — new `GatherArtifactsDeps` field.
    * `[ ]`   Confirm: no reverse dependency (`applyCompressionOverlay.ts` does not import `gatherArtifacts.ts`); no lateral violation.

  * `[ ]`   `gatherArtifacts.interface.ts`
    * `[ ]`   `GatherArtifactsDeps` gains `applyCompressionOverlay: BoundApplyCompressionOverlayFn` (new import from the prior node's interface file).
    * `[ ]`   `GatherArtifactsParams` gains `stageSlug: string` (the ticket's originally-scoped addition — the CONSUMING stage whose `_work` directory is checked) and `targetKey: string` (this job's own compression-target schema key — REQUIRED for `applyCompressionOverlay`'s identity but omitted from the scope's terser ticket text; both values are already available at the `processSimpleJob.ts` call site — `stageSlug` is already destructured from `job.payload` there, `targetKey` is `resolvedRecipeStep.output_type` — so no new lookup is needed when that later node wires them in). No change to `GatherArtifactsPayload`/`GatherArtifactsSuccessReturn`/`GatherArtifactsErrorReturn`.

  * `[ ]`   `type_guards.chat.test.ts`
    * `[ ]`   New `Deno.test('Type Guard: isResourceDocumentType', ...)`: `true` for `'resource'`, `'feedback'`, `'system'`; `false` for `'document'`, `'rendered_document'`, `''`, `undefined`, `123`, `null`.
    * `[ ]`   `isResourceDocument`'s existing valid-fixture literal `type: 'rendered_document'` (`type_guards.chat.test.ts:455, 465, 469, 477, 478`) becomes `type: 'resource'` throughout, so each existing step continues to isolate exactly the ONE field it claims to test (document_key/stage_slug/type presence) rather than incidentally also depending on a now-invalid `type` value.
    * `[ ]`   New step: `'should return false if type is not a valid ResourceDocumentType'` — `assert(!isResourceDocument({ id: 'doc-1', content: 'Hello', document_key: 'key', stage_slug: 'thesis', type: 'rendered_document' }));` (the now-invalid literal, repurposed as the dedicated negative case for this exact condition).

  * `[ ]`   `gatherArtifacts.guard.ts`
    * `[ ]`   `isGatherArtifactsDeps` gains `if (!("applyCompressionOverlay" in value) || typeof value.applyCompressionOverlay !== "function") return false;`, alongside the existing `pickLatest`/`downloadFromStorage` checks.
    * `[ ]`   `isGatherArtifactsParams` gains `if (!("stageSlug" in value) || typeof value.stageSlug !== "string" || value.stageSlug === "") return false;` and the same shape for `targetKey`, alongside the existing `projectId`/`sessionId` checks.

  * `[ ]`   `gatherArtifacts.guard.test.ts`
    * `[ ]`   New valid/invalid cases for `applyCompressionOverlay` (missing, non-function) mirroring the existing `pickLatest`/`downloadFromStorage` cases; new valid/invalid cases for `stageSlug`/`targetKey` (missing, empty string) mirroring the existing `projectId`/`sessionId` cases.

  * `[ ]`   `gatherArtifacts.mock.ts`
    * `[ ]`   `buildGatherArtifactsDeps` gains `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` in its `base` object (new import from `../applyCompressionOverlay/applyCompressionOverlay.mock.ts`) — the prior node's default mock behavior (echo `payload.resourceDocuments`/`payload.history` unchanged, no artifact ever found) is the correct default here too: most `gatherArtifacts` tests are not exercising compression at all.
    * `[ ]`   `buildGatherArtifactsParams` gains `stageSlug: "thesis", targetKey: FileType.business_case` in its `base` object — consistent with this file's existing "thesis"-stage fixture convention (`buildDocumentRule`/`buildDialecticProjectResourceRow` already default to `"thesis"`).
    * `[ ]`   `buildGatherArtifact`'s default `type: "document"` (`gatherArtifacts.mock.ts:265`) becomes `type: "resource"`.

  * `[ ]`   `gatherArtifacts.test.ts`
    * `[ ]`   Existing assertion `assertEquals(result.artifacts[0].type, "document")` (line 55, document rule) becomes `assertEquals(result.artifacts[0].type, "resource")`.
    * `[ ]`   Existing assertion `assertEquals(result.artifacts[0].type, "feedback")` (line 82) is unchanged.
    * `[ ]`   New test: `applyCompressionOverlay` is called once, after the gather+dedup step, with `payload.resourceDocuments` equal to the deduplicated artifact list and `payload.history` equal to `[]`; its returned `resourceDocuments` become `result.artifacts` (assert via a spy-style dep built with `buildGatherArtifactsDeps({ applyCompressionOverlay: <records-calls-and-returns-a-content-swapped-copy> })`).
    * `[ ]`   New test: `applyCompressionOverlay` returning an error return propagates as this function's own `GatherArtifactsErrorReturn` with the same `error`/`retriable`.

  * `[ ]`   `gatherArtifacts.interface.test.ts`
    * `[ ]`   Line 68's assertion (via `buildGatherArtifact()`'s default) becomes `assertEquals(result.artifacts[0].type, "resource")`.

  * `[ ]`   `gatherArtifacts.integration.test.ts`
    * `[ ]`   All FOUR inline `deps` object literals (`:45-52`, `:80-87`, `:117-124`, `:183-190` — this file constructs `GatherArtifactsDeps` by hand rather than via `buildGatherArtifactsDeps`) gain `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` (new import from `../applyCompressionOverlay/applyCompressionOverlay.mock.ts`) — a STUB, not the real `applyCompressionOverlay`: this file's mocked `dbClient` uses `createMockSupabaseClient`'s generic-result-by-TABLE-NAME harness (`buildSelectHandler`), which cannot distinguish the artifact-gather's own `dialectic_project_resources`/`dialectic_contributions` queries from a REAL `applyCompressionOverlay`'s separate existence-check query against the SAME tables by different `.eq()` filters — using the stub avoids the real overlay's query spuriously matching this file's already-configured canned rows. The genuine end-to-end proof of `gatherArtifacts` → `applyCompressionOverlay` → real Supabase rides the full-chain test at the `processSimpleJob.ts` node (last in this sprint), per `Compression Jobs Scope.md`'s own established assertion list.
    * `[ ]`   Line 60 (`"integration: document rule..."`) assertion becomes `assertEquals(result.artifacts[0].type, "resource")`.
    * `[ ]`   Line 95 (`"integration: feedback rule..."`) assertion is unchanged (`"feedback"`).
    * `[ ]`   Line 132 (`"integration: seed_prompt..."`) assertion becomes `assertEquals(seedResult.artifacts[0].type, "system")`.
    * `[ ]`   Line 163 (`"...project_resource rules..."`) assertion becomes `assertEquals(projectResult.artifacts[0].type, "resource")`.
    * `[ ]`   Line 201 (`"integration: header_context and contribution rules..."`, first sub-case) assertion becomes `assertEquals(headerResult.artifacts[0].type, "system")`.
    * `[ ]`   Line 217 (same test, second sub-case, `type: "contribution"` rule override) assertion becomes `assertEquals(contributionResult.artifacts[0].type, "system")` — proving the catch-all branch's fixed `'system'` literal does NOT vary with the triggering rule's own type string.

  * `[ ]`   `construction`
    * `[ ]`   No change to the function's overall control flow shape — the per-rule gather loop and dedup-by-id block are unchanged; the single new step is the `applyCompressionOverlay` call inserted between dedup and return.

  * `[ ]`   `gatherArtifacts.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (per-job artifact gathering). Deps inward: `applyCompressionOverlay.ts` (prior node), `_shared/types.ts`/`type_guards.chat.ts` (support riders, this node). Provides outward: `GatherArtifactsFn`'s widened `Params`/`Deps` shape to `processSimpleJob.ts` (last node this sprint, which must supply `stageSlug`/`targetKey`/`applyCompressionOverlay` at its call site — transiently non-compilable there until that node lands, permitted within the sprint); the narrowed `ResourceDocument.type` to `vector_utils.ts` (next node).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `ResourceDocument.type` is `'resource' | 'feedback' | 'system'`; `isResourceDocumentType` accepts exactly those three values and rejects everything else, including the pre-alignment literals (`'document'`, `'seed_prompt'`, `'project_resource'`, `'header_context'`, `'contribution'`, `'rendered_document'`).
    * `[ ]`   Each of the five gather branches pushes the correct one of the three literals, independent of the triggering rule's own `type` string for the catch-all branch.
    * `[ ]`   `gatherArtifacts`'s returned `artifacts` reflect `applyCompressionOverlay`'s output; an overlay error surfaces as `GatherArtifactsErrorReturn`.
    * `[ ]`   Every existing test in `compressPrompt.ts`/`calculateAffordability.ts` and their test files continues to pass unmodified — neither file is touched by this node.

* `[ ]`   supabase/functions/_shared/utils/`vector_utils.ts` **[BE] Single full rewrite: embedding-free victim scoring — effectiveScore = candidateTokens × importance — replacing cosine-similarity scoring and the dialectic_memory diagnostic query**

  * `[ ]`   `objective`
    * `[ ]`   Solve victim selection without embeddings, per `Compression Jobs Scope.md` Design Decision #3: `effectiveScore = candidateTokens × importance`, where `importance` is the SAME 0..1 preservation-priority value the pre-rewrite code already resolved (matrix relevance for documents, position for history) — CORRECTED from the scope draft's originally-stated `tokens × (1 − relevanceWeight)` form, which inverted victim priority (already ratified in the `Compression Jobs Scope.md` edit preceding this node).
    * `[ ]`   Functional goals:
      * `[ ]`   DELETE `dotProduct`, `magnitude`, `cosineSimilarity`, and the `IEmbeddingClient` import (`services/indexing_service.interface.ts`) entirely — this file's sole other consumer, `rag_service.ts`, is deleted later this sprint (WS-X); the transient import break in `rag_service.ts` resolves in-sprint per NODE & SPRINT RULES.
      * `[ ]`   `CompressionCandidate.sourceType` becomes `CompressionSourceType` (imported from `file_manager.types.ts`, Sprint-2 owner), replacing the literal `'history' | 'document'` union.
      * `[ ]`   `scoreResourceDocuments` rewrites to a PURE, synchronous function: `scoreResourceDocuments(documents: ResourceDocuments): CompressionCandidate[]` (no `deps`, no `currentUserPrompt` — both are gone; embeddings are gone and nothing else in this function needs them). For each document at its original array index `i`: skip entirely if `doc.type === 'system'` (per `gatherArtifacts.ts`'s alignment — `'system'` artifacts can never be compression candidates); otherwise push `{ id: doc.id, content: doc.content, sourceType: doc.type, originalIndex: i, valueScore: 0, effectiveScore: 0 }` — `sourceType: doc.type` type-checks directly, since TypeScript narrows `doc.type` to `'resource' | 'feedback'` after the `'system'` early-`continue`, both valid `CompressionSourceType` members. `valueScore`/`effectiveScore` are placeholders — `getSortedCompressionCandidates` (below) resolves both from `inputsRelevance` and token counts; this function no longer has enough information (no `inputsRelevance`, no `countTokens`) to compute them itself.
      * `[ ]`   `scoreHistory` is UNCHANGED — no embedding dependency existed here before, and none is added now. Its `sourceType: 'history'` literal still type-checks against the widened `CompressionSourceType` field with no code change.
      * `[ ]`   `getSortedCompressionCandidates` rewrites its body (signature `(deps, params, payload) => Promise<CompressionCandidate[]>` is UNCHANGED, still the `ICompressionStrategy` shape):
        * `[ ]`   `documentCandidates = scoreResourceDocuments(payload.documents)`; `historyCandidates = scoreHistory(payload.history)`.
        * `[ ]`   Build `relevanceMap` from `params.inputsRelevance` EXACTLY as today — `key = rule.slug ? \`${rule.type}:${rule.document_key}:${rule.slug}\` : \`${rule.type}:${rule.document_key}\`;` `relevanceMap[key] = Math.max(relevanceMap[key] ?? 0, Math.max(0, Math.min(1, rule.relevance)))`. This is now SAFE to keep unchanged: `RelevanceRule.type` becomes a REQUIRED field this same node (below), guaranteed non-`undefined` for every real row once migration `20260712162753_add_type_to_recipes.sql` (already written, out-of-band) lands — the pre-existing `` `${undefined}:...` `` key-corruption bug this migration fixes at the DATA layer needs NO corresponding workaround in this function; the original type-prefixed key structure was always correct, only the seed data feeding it was incomplete.
        * `[ ]`   Per document candidate: look up its original doc via `payload.documents[candidate.originalIndex]` (index-based, not `.find(id)` — unambiguous even under duplicate ids). Resolve `importance`: if `!inputsRelevance || inputsRelevance.length === 0` → `0`; else if `!doc.document_key` → `0` (defensive; `document_key` is a non-optional `ResourceDocument` field so this is normally unreachable, kept for the same "don't guess on missing identity" reason the pre-rewrite code had it); else try `` `${doc.type}:${doc.document_key}:${doc.stage_slug}` `` (only when `doc.stage_slug` is truthy) then `` `${doc.type}:${doc.document_key}` ``, first hit wins, default `0`. Compute `tokens = deps.countTokens(params.tokenizerDeps, { resourceDocuments: [{ id: doc.id, content: doc.content }] }, params.modelConfig)`. Set `candidate.valueScore = importance; candidate.effectiveScore = tokens * importance`.
        * `[ ]`   Per history candidate: `importance = candidate.valueScore` (already the positional value `scoreHistory` computed — 0=oldest/least-preserved, 1=newest/most-preserved; UNCHANGED, "positional history scoring KEPT"). Compute `tokens = deps.countTokens(params.tokenizerDeps, { messages: [payload.history[candidate.originalIndex]] }, params.modelConfig)`. Set `candidate.effectiveScore = tokens * importance` (`valueScore` already equals `importance`, no reassignment needed).
        * `[ ]`   Combine both candidate arrays, sort ascending by `effectiveScore` (lowest = next victim: unimportant + large = compress first; important + small = preserve). Return the sorted array.
        * `[ ]`   Replace the deleted `dialectic_memory` diagnostic query (and its `deps.logger?.warn` non-fatal handling) with nothing — it served no selection purpose even before this rewrite (explicitly "diagnostic-only," never excluding candidates); its removal changes no observable behavior.
        * `[ ]`   Replace the raw `console.log('[DEBUG] ...')` dump with `deps.logger?.info('[getSortedCompressionCandidates] sorted candidates', { candidates: sorted.map(c => ({ id: c.id, sourceType: c.sourceType, valueScore: c.valueScore, effectiveScore: c.effectiveScore })) })` — gives the already-present optional `logger` dep an actual purpose instead of a raw console call.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `dbClient`/`embeddingClient` are REMOVED from `CompressionStrategyDeps` entirely (their only use — the `dialectic_memory` query and `getEmbedding` calls — is deleted); `currentUserPrompt` is REMOVED from `CompressionStrategyPayload` entirely (its only use — embedding the prompt for cosine similarity — is deleted). `compressPrompt.ts`'s own node (next) must stop passing both when it constructs this call.
      * `[ ]`   RIDES HERE (type edit — `vector_utils.ts` is the function that DEMANDS `RelevanceRule.type` be reliably present, now that `relevanceMap` keys on it unconditionally): `dialectic-service/dialectic.interface.ts`'s `RelevanceRule.type` (`:2000-2008`) narrows from `type?: string` to a REQUIRED `type: ResourceDocumentType` — add `ResourceDocumentType` to the file's existing `from "../_shared/types.ts"` import block (`:27-44`; no new import statement, just one more named import). This is the SAME vocabulary `ResourceDocument.type` uses (`gatherArtifacts.ts`'s node) — a relevance rule and the artifact it targets are classified identically for exactly the same reason.
      * `[ ]`   RIDES HERE (the guard `RelevanceRule.type` demands): `_shared/utils/type-guards/type_guards.dialectic.recipe.ts`'s `isRelevanceRule` (`:124-138`) tightens its `type` check from `if ('type' in obj && typeof obj.type !== 'string') return false;` (optional, loosely-typed) to `if (!('type' in obj) || !isResourceDocumentType(obj.type)) return false;` (required, `type_guards.chat.ts`'s guard, new import) — mutual, cross-file consistency with `isResourceDocument`'s own tightening in the `gatherArtifacts.ts` node.
      * `[ ]`   `_shared/utils/type-guards/type_guards.dialectic.recipe.test.ts`'s `isRelevanceRule` describe block (`:239-269`): the valid fixture's `type: 'document'` (`:242`) becomes `type: 'resource'`; the step `'should return true for a valid rule where the optional \`type\` is omitted'` (`:260-264`) INVERTS to `'should return false if type is omitted'` (asserting `false`, since `type` is no longer optional); NEW step `'should return false if type is not a valid ResourceDocumentType'` using `{ ...validRelevanceRule, type: 'document' }` (now-invalid) as the negative fixture.
      * `[ ]`   `_shared/utils/vector_utils.mock.ts` needs NO change: `mockCompressionStrategy: ICompressionStrategy = async () => []` is structurally compatible with any `Deps`/`Params` shape `ICompressionStrategy` declares — TypeScript does not require an implementation to name every parameter the interface type provides.
      * `[ ]`   `getStageRecipe.ts:135`'s `isRelevanceRule(item)` call is unaffected — every real DB row satisfies the tightened guard once migration `20260712162753_add_type_to_recipes.sql` lands (already written); no code change needed in that file.

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus its support system.
    * `[ ]`   Out of scope: `compressPrompt.ts`'s own consumption of the narrowed `CompressionStrategyDeps`/`Params`/`Payload` (next node, must stop passing `dbClient`/`embeddingClient`/`currentUserPrompt`); `enqueueCompressJobs.ts`'s dedup-layer-1 path lookup logic (already-written, unrelated).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/utils/vector_utils.ts` plus its two support-file riders (`dialectic.interface.ts`'s `RelevanceRule.type`, `type_guards.dialectic.recipe.ts`'s `isRelevanceRule`) — both riders exist only because this function now unconditionally relies on `rule.type` being present.

  * `[ ]`   `deps`
    * `[ ]`   `countTokens: CountTokensFn` (`tokenizer.types.ts`) — NEW, replaces `embeddingClient`.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation. `ResourceDocumentType`/`isResourceDocumentType` (`gatherArtifacts.ts`'s node, prior) are consumed, not redefined.

  * `[ ]`   `vector_utils.interface.ts`
    * `[ ]`   `CompressionStrategyDeps` becomes `{ countTokens: CountTokensFn; logger?: ILogger }` — REMOVES `dbClient: SupabaseClient<Database>` and `embeddingClient?: IEmbeddingClient`; drops the now-unused `SupabaseClient`/`Database`/`IEmbeddingClient` imports.
    * `[ ]`   `CompressionStrategyParams` becomes `{ inputsRelevance?: RelevanceRule[]; modelConfig: AiModelExtendedConfig; tokenizerDeps: CountTokensDeps }` — ADDS `modelConfig`/`tokenizerDeps` (new imports: `AiModelExtendedConfig` from `../types.ts`, `CountTokensDeps`/`CountTokensFn` from `../types/tokenizer.types.ts`).
    * `[ ]`   `CompressionStrategyPayload` becomes `{ documents: ResourceDocuments; history: Messages[] }` — REMOVES `currentUserPrompt: string`.
    * `[ ]`   `ICompressionStrategy`'s call signature is unchanged (`(deps, params, payload) => Promise<CompressionCandidate[]>`); only the shapes it references change.

  * `[ ]`   `vector_utils.test.ts`
    * `[ ]`   DELETE all ten `cosineSimilarity` `Deno.test` blocks (the function is gone).
    * `[ ]`   `scoreResourceDocuments` tests rewrite to the new pure signature: a `'system'`-typed document is excluded from the returned candidates entirely; a `'resource'`-typed and a `'feedback'`-typed document both produce a candidate with `sourceType` equal to their own `type`, `valueScore: 0`, `effectiveScore: 0` (unresolved placeholders — this function alone does not compute importance); `originalIndex` matches each document's position in the input array, including when a `'system'` document is skipped (i.e., indices are NOT renumbered after filtering).
    * `[ ]`   `scoreHistory` tests (`:171-204`, `:373-409`, `:411-439`) are UNCHANGED — no rewrite, no assertions touched.
    * `[ ]`   `getSortedCompressionCandidates` tests rewrite entirely, replacing all embedding-fixture-based cases (`:206-323`, `:442-505`, `:507-567`, `:569-627`) with token/importance-based ones, using a deterministic `countTokens` stub (e.g. `(_, payload) => (payload.resourceDocuments?.[0]?.content ?? payload.messages?.[0]?.content ?? '').length` — content length as a token proxy, avoiding a real tokenizer dependency in unit tests):
      * `[ ]`   Two documents with IDENTICAL content (same token count) and different `inputsRelevance` weights (via `document_key`) sort with the LOWER-relevance document first (ascending effectiveScore) — replaces the old "matrix priority protects high-priority doc on similarity ties" case, same assertion INTENT (importance protects, not tokens, when tokens are equal), new mechanism.
      * `[ ]`   A document with NO matching `inputsRelevance` rule defaults to `importance: 0`, sorting first regardless of content length — replaces the old "missing identity skips matrix" case (drop the `document_key: ''`/`type: ''` fixture variant entirely: `ResourceDocument.type` is now a strict union and cannot structurally hold `''`; keep only the "no matching rule" variant, which needs no malformed fixture).
      * `[ ]`   A stage-specific `inputsRelevance` rule (`type` + `document_key` + `slug` all present) is preferred over a general rule (`type` + `document_key`, no `slug`) for the same document — replaces the old "general rule sorts before stage-specific" case, verifying the TIERED lookup order is preserved.
      * `[ ]`   A history candidate and a document candidate combine correctly: the history candidate's `effectiveScore` equals `tokens(content) × valueScore` (positional), independent of any `inputsRelevance` entry (history is never subject to the matrix).
      * `[ ]`   `deps.countTokens` is called once per eligible candidate (never for `'system'`-typed documents, since those never become candidates) with `params.tokenizerDeps`/`params.modelConfig` passed through unchanged.
      * `[ ]`   Sort order is verified ascending by `effectiveScore` across a mixed set of document and history candidates.
    * `[ ]`   Remove the `mockEmbeddingClient` fixture and every import it required (`IEmbeddingClient`, `EmbeddingResponse`) — no test in this file uses embeddings anymore.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported functions. `scoreResourceDocuments`/`scoreHistory` are pure, independent shapers; `getSortedCompressionCandidates` calls both, resolves `importance`/`tokens`/`effectiveScore` per candidate, then sorts — no other control-flow change.

  * `[ ]`   `vector_utils.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared utility (pure scoring + one injected tokenizer call). Deps inward: `file_manager.types.ts` (`CompressionSourceType`, Sprint-2), `tokenizer.types.ts` (pre-existing), `gatherArtifacts.ts`'s `ResourceDocument.type` alignment (prior node). Provides outward: `getSortedCompressionCandidates`/`ICompressionStrategy` to `compressPrompt.ts` (next node).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   No embedding call, `dbClient`, or `dialectic_memory` reference remains anywhere in `vector_utils.ts`.
    * `[ ]`   `effectiveScore = tokens × importance` for every candidate; ascending sort; lowest-importance/largest-token candidates are selected first.
    * `[ ]`   `'system'`-typed documents never produce a candidate and never trigger a `countTokens` call.
    * `[ ]`   `RelevanceRule.type` is required and validated against the same three-member vocabulary `ResourceDocument.type` uses; `isRelevanceRule` rejects any rule missing `type` or carrying a value outside it.
    * `[ ]`   `rag_service.ts`'s now-broken `cosineSimilarity` import is the ONLY consumer left dangling by this node's deletions — resolved when WS-X deletes that file later this sprint.

* `[ ]`   supabase/functions/dialectic-worker/compressPrompt/`compressPrompt.ts` **[BE] Full rewrite: replace the synchronous RAG compression loop with a two-phase machine (reduce-on-entry, select/spawn-or-finalize) driven entirely by artifact existence**

  * `[ ]`   `objective`
    * `[ ]`   Solve the removal of the legacy synchronous RAG compression loop (`deps.ragService.getContextForModel` called in-line, debited via `deps.tokenWalletService` inside the loop) and replace it with the job-driven COMPRESS architecture (`Compression Jobs Scope.md` TARGET ARCHITECTURE steps 1-8): overlay already-finished victims, reduce any chunked victim whose children have all completed, and — only if still over budget — spawn exactly ONE new COMPRESS child and pause, never spending a model call synchronously inside this function again.
    * `[ ]`   Functional goals:
      * `[ ]`   **Phase 0 — overlay.** Call `deps.applyCompressionOverlay` (WS-D's first node, already written) with `{ dbClient: params.dbClient, projectId: params.projectId, sessionId: params.sessionId, iterationNumber: params.iterationNumber, stageSlug: params.stageSlug, targetKey: params.targetKey }` and `{ resourceDocuments: payload.resourceDocuments, history: payload.conversationHistory }`. On `isApplyCompressionOverlayErrorReturn` → `{ error, retriable: overlayResult.retriable }`. Otherwise replace the WORKING `resourceDocuments`/`workingHistory` with `overlayResult.resourceDocuments`/`overlayResult.history` — this is not reimplemented inline; `applyCompressionOverlay` IS the identity-matching logic, called directly (not duplicated) — CORRECTING the scope draft's original framing that this node reimplements "the same identity matching applyCompressionOverlay uses" as separate logic; now that `applyCompressionOverlay` exists as a clean, injectable function, calling it is strictly better than a second, divergence-prone copy of the same matching rules.
      * `[ ]`   **Phase 1 — reduce check (chunked victims).** Query `params.dbClient.from('dialectic_generation_jobs').select('id, status, payload').eq('parent_job_id', params.parentJob.id).eq('job_type', 'COMPRESS')`. Group the rows by victim identity (`payload.sourceType`, and `payload.sourceType === 'feedback' || payload.sourceType === 'history' ? payload.sourceId : payload.documentKey`), keeping only groups where every row has `payload.chunk_total` set (chunked victims) and `payload.chunk_index` values `1..chunk_total` are ALL present among rows with `status === 'completed'`. For each such group with NO existing final artifact (checked via `deps.constructStoragePath` building the FINAL — no `chunkIndex`/`chunkTotal` — path, then a `dialectic_project_resources` existence read by `(storage_path, file_name)`, mirroring `applyCompressionOverlay`'s own existence-check pattern exactly): download each chunk artifact's content in `chunk_index` order via `deps.downloadFromStorage` (chunk paths built the same way, WITH `chunkIndex`/`chunkTotal` set) and concatenate. If `deps.countTokens(payload.tokenizerDeps, { message: concatenation }, params.extendedModelConfig)` exceeds `params.extendedModelConfig.provider_max_input_tokens` minus the same 32-token safety buffer used elsewhere in this file (the "per-victim target" — can a SINGLE compression call actually process this concatenation) → call `deps.enqueueCompressJobs` with the concatenation as ONE fresh text-mode victim (a re-compress pass; every pass strictly shrinks its input per Design Decision #4, so this cannot recurse unboundedly), update the parent job row `status:'waiting_for_children'`, and return `{ chatApiRequest: payload.chatApiRequest, resolvedInputTokenCount: currentTokenCount, resourceDocuments, waiting_for_children: true }` (pending SUCCESS — deferral is success, not error). Otherwise persist the concatenation as the FINAL artifact via `deps.fileManager.uploadAndRegisterFile` (a `ResourceUploadContext`, `fileType: FileType.CompressedContext`, the same final `PathContext` just existence-checked) — a synchronous DB/storage write, not a job — and continue to Phase 2 WITHOUT returning (this iteration may reduce more than one chunked victim before re-checking the budget).
      * `[ ]`   **Phase 2 — select/spawn.** Recompute `currentTokenCount` via `deps.countTokens` over the (now overlay-and-reduce-updated) `chatApiRequest`. While `currentTokenCount > params.finalTargetThreshold`: call `payload.compressionStrategy` with `{ countTokens: deps.countTokens, logger: deps.logger }`, `{ inputsRelevance: params.inputsRelevance, modelConfig: params.extendedModelConfig, tokenizerDeps: payload.tokenizerDeps }`, `{ documents: resourceDocuments, history: workingHistory }` (the NARROWED `vector_utils.ts` contract from the prior node — NO `dbClient`, NO `currentUserPrompt`). If the returned candidate list is empty, `break` (nothing left to compress; fall through to Phase 3, which will fail its own budget check if still over). Otherwise take `candidates[0]` (lowest `effectiveScore`) as the victim. Map it to `enqueueCompressJobs`'s victim payload: `sourceType: victim.sourceType`; for `'resource'` — `documentKey: resourceDocuments[victim.originalIndex].document_key`, `sourceStageSlug: resourceDocuments[victim.originalIndex].stage_slug`; for `'feedback'`/`'history'` — `sourceId: victim.id`; `content: victim.content`; `mode: 'text'` in every case (compressPrompt never determines JSON-mode provenance itself — `enqueueCompressJobs` upgrades a `'resource'` victim to `mode:'json'`/`sourceType:'contribution'` internally when it locates a completed source JSON artifact for that `documentKey`, per its own already-specified ticket). Call `deps.enqueueCompressJobs`; on error, return `{ error, retriable }`; on success, update the parent job row `status:'waiting_for_children'` and return `{ chatApiRequest: payload.chatApiRequest, resolvedInputTokenCount: currentTokenCount, resourceDocuments, waiting_for_children: true }`.
      * `[ ]`   **Phase 3 — finalization.** UNCHANGED from the current implementation except for the removed RAG loop and the added `waiting_for_children: false`: the existing `getMaxOutputTokens`/`allowedInputPost`/cost-check tail (lines `253-364` of the current file) runs against the (overlaid, possibly reduced, no-longer-over-budget) `resourceDocuments`/`workingHistory`, producing the final `chatApiRequest`/`resolvedInputTokenCount`. Return `{ chatApiRequest: chatApiRequestOut, resolvedInputTokenCount: finalTokenCountAfterCompression, resourceDocuments, waiting_for_children: false }`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   DELETE the entire in-loop RAG block (current lines `125-251`: the `candidates`/`indexedIds` dialectic_memory query, the `while` loop's `deps.ragService.getContextForModel` call, the in-loop `deps.tokenWalletService.recordTransaction` debit, the enforced-alternation `enforcedHistory`/`loopAssembledMessages` rebuild INSIDE the loop). The enforced-alternation rebuild (`"Please continue."`/empty-assistant insertion) is NOT deleted outright — it still applies ONCE, in Phase 3, to the overlay/reduce-updated `workingHistory` before final `chatApiRequest` assembly, since `applyCompressionOverlay` swaps CONTENT but never inserts synthetic alternation fillers.
      * `[ ]`   The identity-validation block at the top (current lines `21-33`: every `resourceDocument` must have non-empty `document_key`/`type`/`stage_slug`) is UNCHANGED — still valid and still useful defensively, though now largely redundant with `ResourceDocument.type` being a required, non-optional union.
      * `[ ]`   No new `CompressPromptReturn` union member — `waiting_for_children: boolean` is a field on the EXISTING `CompressPromptSuccessReturn`, present (`true` or `false`) on every success path, never a new variant. Callers (`calculateAffordability.ts`, next node) must check this field before treating `chatApiRequest`/`resolvedInputTokenCount` as final.
      * `[ ]`   Wallet debits for COMPRESS spend flow through the NORMAL stream-persistence path (`saveResponse.ts`, already-written WS-B node) once the child's model call actually completes — NOT through this function. This function never calls `tokenWalletService` for compression spend at all (the field is removed from `CompressPromptDeps` entirely).

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus its support system (its `.interface.ts` is obligately part of this node per `workplan.instructions.md`).
    * `[ ]`   Out of scope: `enqueueCompressJobs.ts`'s own dedup/chunk-splitting/provenance-detection logic (WS-R, already specified); `applyCompressionOverlay.ts`'s own matching logic (prior node, called not reimplemented); `saveResponse.ts`'s persistence of compressed artifacts (WS-B, already specified); `calculateAffordability.ts`'s propagation of the pending variant (next node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/compressPrompt/` — the per-EXECUTE-job compression orchestration: overlay, reduce, select-and-spawn-or-finalize.

  * `[ ]`   `deps`
    * `[ ]`   `applyCompressionOverlay: BoundApplyCompressionOverlayFn` (prior node) — NEW.
    * `[ ]`   `enqueueCompressJobs: BoundEnqueueCompressJobsFn` (`enqueueCompressJobs.interface.ts`, WS-R, already specified) — NEW.
    * `[ ]`   `fileManager: IFileManager` (`file_manager.types.ts`, pre-existing) — NEW, for the reduce phase's final-artifact write.
    * `[ ]`   `constructStoragePath: ConstructStoragePathFn` (`path_constructor.types.ts`, Sprint-2) — NEW, for the reduce phase's existence checks and chunk-path construction.
    * `[ ]`   `downloadFromStorage: DownloadFromStorageFn` (`supabase_storage_utils.ts`, pre-existing) — NEW, for the reduce phase's chunk reads.
    * `[ ]`   `countTokens: CountTokensFn` — UNCHANGED, already present.
    * `[ ]`   `logger: ILogger` — UNCHANGED, already present.
    * `[ ]`   REMOVE `ragService: IRagService`, `embeddingClient: IEmbeddingClient`, `tokenWalletService: IAdminTokenWalletService` entirely — their sole uses (the RAG call, embedding-based scoring already removed from `vector_utils.ts`, the in-loop debit) are all deleted.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `compressPrompt.interface.ts`
    * `[ ]`   `CompressPromptDeps` per the `deps` list above (add five, remove three).
    * `[ ]`   `CompressPromptParams` gains `projectId: string`, `iterationNumber: number`, `targetKey: string` (all needed for `PathContext` construction in Phase 0/1, and none currently present — the current shape has `sessionId`/`stageSlug` but no `projectId`/`iterationNumber`/`targetKey` at all) and `parentJob: DialecticJobRow` (needed for `parent_job_id` filtering in Phase 1 and the job-status write in Phases 1/2; imported from `dialectic.interface.ts`).
    * `[ ]`   `CompressPromptPayload` is UNCHANGED (`compressionStrategy`, `resourceDocuments`, `conversationHistory`, `currentUserPrompt`, `chatApiRequest`, `tokenizerDeps` all still needed — `currentUserPrompt` is still consumed by Phase 3's message assembly, even though `vector_utils.ts` no longer needs it).
    * `[ ]`   `CompressPromptSuccessReturn` gains `waiting_for_children: boolean`.
    * `[ ]`   `CompressPromptErrorReturn`/`CompressPromptReturn`/`CompressPromptFn`/`BoundCompressPromptFn` are UNCHANGED in shape.

  * `[ ]`   `compressPrompt.guard.ts` / `compressPrompt.guard.test.ts`
    * `[ ]`   `isCompressPromptDeps` drops the `ragService`/`embeddingClient`/`tokenWalletService` checks, adds checks for `applyCompressionOverlay`/`enqueueCompressJobs`/`fileManager`/`constructStoragePath`/`downloadFromStorage` (function/object presence, matching this file's existing per-field check style).
    * `[ ]`   `isCompressPromptParams` adds checks for `projectId`/`iterationNumber`/`targetKey` (non-empty string / number) and `parentJob` (object presence — delegates to an existing `DialecticJobRow` shape check if one is already imported here, otherwise a minimal `isRecord` + `id` string check).
    * `[ ]`   `isCompressPromptSuccessReturn` adds a check that `waiting_for_children` is present and boolean.
    * `[ ]`   Corresponding valid/invalid test cases added to `compressPrompt.guard.test.ts` for every field above, mirroring this file's existing per-field style.

  * `[ ]`   `compressPrompt.mock.ts`
    * `[ ]`   `buildCompressPromptDeps` drops the three removed fields' default stubs, adds default stubs for the five new deps (`applyCompressionOverlay`/`enqueueCompressJobs` default to their own modules' mock factories — `createApplyCompressionOverlayMock().applyCompressionOverlay`, an `enqueueCompressJobs` mock per its own WS-R node — `fileManager` a minimal stub whose `uploadAndRegisterFile` resolves success, `constructStoragePath` the REAL function, `downloadFromStorage` a stub resolving empty success).
    * `[ ]`   `buildCompressPromptParams` gains defaults for `projectId`/`iterationNumber`/`targetKey`/`parentJob` (a minimal valid `DialecticJobRow`-shaped stub).
    * `[ ]`   `buildCompressPromptSuccessReturn` gains a `waiting_for_children` default (`false`, matching the "finalized" case as the more common default for existing callers that don't care about the pending path).

  * `[ ]`   `compressPrompt.test.ts`
    * `[ ]`   Phase 0: `applyCompressionOverlay` is called once per invocation with the RAW `payload.resourceDocuments`/`payload.conversationHistory`; its returned (possibly content-swapped) documents/history are what Phase 2's `compressionStrategy` call receives — NOT the raw payload values.
    * `[ ]`   Phase 0 error: `applyCompressionOverlay` returning an error propagates as this function's own `CompressPromptErrorReturn` with the same `error`/`retriable`; no further phase runs.
    * `[ ]`   Phase 1 (reduce, needs finalizing): a chunked victim (mocked `dialectic_generation_jobs` rows: `chunk_total: 2`, both `status:'completed'`, no matching final-artifact row) has its chunks downloaded in `chunk_index` order, concatenated, and persisted via `fileManager.uploadAndRegisterFile` with a `CompressedContext` `ResourceUploadContext`; `enqueueCompressJobs` is NOT called for this victim; the function proceeds to Phase 2 (not an early return) when the concatenation fits the per-victim target.
    * `[ ]`   Phase 1 (reduce, still oversized): the SAME setup but with `deps.countTokens` stubbed to report the concatenation over the per-victim target → `enqueueCompressJobs` is called ONCE with the concatenation as a `mode:'text'` victim; `fileManager.uploadAndRegisterFile` is NOT called for this victim; parent job status is updated to `'waiting_for_children'`; return has `waiting_for_children: true`.
    * `[ ]`   Phase 1 skip: a chunked victim with an EXISTING final-artifact row (already reduced by a prior cycle, or by a sibling) is left alone — no download, no `enqueueCompressJobs`, no `fileManager` write.
    * `[ ]`   Phase 2 happy path (spawn): over budget, `compressionStrategy` returns one or more candidates → the lowest-`effectiveScore` candidate is mapped correctly for each `sourceType` (`'resource'` → `documentKey`/`sourceStageSlug` from the matching `resourceDocuments` entry; `'feedback'`/`'history'` → `sourceId`); `enqueueCompressJobs` is called with `mode:'text'`; parent job status updated; return has `waiting_for_children: true`.
    * `[ ]`   Phase 2 empty candidates: `compressionStrategy` returns `[]` while still over budget → the loop exits WITHOUT calling `enqueueCompressJobs`; Phase 3 runs and (since still over budget) fails its own existing `ContextWindowError` check.
    * `[ ]`   Phase 3 (fits without any spawn): overlay alone brings the prompt under `finalTargetThreshold` → no `enqueueCompressJobs` call at all; return has `waiting_for_children: false` and the SAME finalized `chatApiRequest`/cost-check behavior the pre-rewrite tests already asserted (assert those pre-existing cases continue to pass with `waiting_for_children: false` added to their expected return shape).
    * `[ ]`   No test in this file constructs a real `IRagService`/`IEmbeddingClient`/`IAdminTokenWalletService` fixture anymore — every such fixture and import is removed.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Phase order is fixed: overlay → reduce (loop until no chunked victim needs reducing) → select/spawn (single victim, single spawn, single return) → finalize. Reduce may run its DB-write sub-loop multiple times in one call (finalizing several chunked victims) before Phase 2 ever executes; Phase 2 spawns AT MOST one child per call (one victim per resume cycle, per Design Decision #3).

  * `[ ]`   `compressPrompt.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `compressPrompt.integration.test.ts`
    * `[ ]`   Bounded subsystem: real `compressPrompt`, real `applyCompressionOverlay`, real `vector_utils.getSortedCompressionCandidates`, real `constructStoragePath`; `enqueueCompressJobs`/`fileManager`/`downloadFromStorage` and Supabase are mocked. Proves the three phases compose correctly against real scoring and real overlay-matching, without spending a real model call — the full end-to-end proof with a REAL `enqueueCompressJobs`/`saveResponse` chain rides `processSimpleJob.ts`'s node (last in this sprint), per `Compression Jobs Scope.md`'s own established assertion list.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (per-job compression cutover). Deps inward: `applyCompressionOverlay.ts` (prior node), `vector_utils.ts` (prior node, via `payload.compressionStrategy`), `enqueueCompressJobs.ts`/`file_manager.ts`/`path_constructor.ts`/`supabase_storage_utils.ts` (pre-existing or already-specified). Provides outward: the widened `CompressPromptReturn` (`waiting_for_children`) to `calculateAffordability.ts` (next node).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   No line of this file calls `ragService`, `embeddingClient`, or `tokenWalletService` for compression spend.
    * `[ ]`   A chunked victim with all children completed and no final artifact is reduced (finalized or re-compressed) before Phase 2 ever scores candidates.
    * `[ ]`   At most one COMPRESS child is spawned per call to this function.
    * `[ ]`   `waiting_for_children` is `true` on every pending return (Phase 1 re-compress, Phase 2 spawn) and `false` only on the fully-finalized Phase 3 return.
    * `[ ]`   Every existing Phase-3-equivalent assertion (safety buffer, cost checks, `ContextWindowError` conditions) from the pre-rewrite test suite continues to hold, with `waiting_for_children: false` added to the expected shape.

* `[ ]`   supabase/functions/dialectic-worker/calculateAffordability/`calculateAffordability.ts` **[BE] Thread `projectId`/`iterationNumber`/`targetKey`/`parentJob` into `CompressPromptParams`, and propagate `compressPrompt`'s `waiting_for_children` as a new discriminated `CalculateAffordabilityPendingReturn` variant**

  * `[ ]`   `objective`
    * `[ ]`   Solve two gaps `compressPrompt.ts`'s rewrite (prior node) leaves at this call site: (1) `CompressPromptParams` now REQUIRES `projectId`/`iterationNumber`/`targetKey`/`parentJob`, none of which `CalculateAffordabilityParams` carries today (`calculateAffordability.ts:321-336` constructs `compressParams` from only `dbClient`/`jobId`/`projectOwnerUserId`/`sessionId`/`stageSlug`/`walletId`/`extendedModelConfig`/`inputsRelevance`/`inputRate`/`outputRate`/`isContinuationFlowInitial`/`finalTargetThreshold`/`balanceAfterCompression`/`walletBalance` — a compile break until this node supplies the four missing fields); (2) `compressPrompt`'s `CompressPromptSuccessReturn` now always carries `waiting_for_children: boolean`, but this file's only two return shapes (`CalculateAffordabilityDirectReturn`/`CompressedReturn`) have no field for it and no branch that reads it (`calculateAffordability.ts:356-362` unconditionally builds a `CompressedReturn`, which would be WRONG when the job has actually paused rather than finished).
    * `[ ]`   Functional goals:
      * `[ ]`   Add `projectId: params.projectId, iterationNumber: params.iterationNumber, targetKey: params.targetKey, parentJob: params.parentJob,` to the `compressParams: CompressPromptParams` literal (`calculateAffordability.ts:321-336`), alongside the existing fields.
      * `[ ]`   After the existing `isCompressPromptErrorReturn(compressResult)` check (`:349-354`, UNCHANGED — an error is still an error regardless of `waiting_for_children`), branch on `compressResult.waiting_for_children`: `true` → return `{ waiting_for_children: true }` (the NEW `CalculateAffordabilityPendingReturn` variant, below) — `chatApiRequest`/`resolvedInputTokenCount`/`resourceDocuments` from a paused `compressResult` are NOT final and are deliberately NOT threaded into this return; `false` → return the EXISTING `CalculateAffordabilityCompressedReturn` shape UNCHANGED (`wasCompressed: true, chatApiRequest: compressResult.chatApiRequest, resolvedInputTokenCount: compressResult.resolvedInputTokenCount, resourceDocuments: compressResult.resourceDocuments`).
      * `[ ]`   REPLACE the `tokenizerDeps` stub at `calculateAffordability.ts:33-39` with REAL implementations: `getEncoding` wraps `npm:js-tiktoken@1.0.7`'s real `getEncoding` behind the `TiktokenEncoding` narrowing pattern of `tokenEstimator/index.ts:31-53`, adapted to return `{ encode: (input: string) => number[] }` per `CountTokensDeps["getEncoding"]`; `countTokensAnthropic` is `npm:@anthropic-ai/tokenizer@0.0.4`'s `countTokens`; `logger: deps.logger` unchanged (both packages already imported by `tokenEstimator/index.ts:12-21` and present in `deno.lock`). The current stub indexes CHARACTERS as tokens (`encode: (input) => Array.from(input ?? "", (_ch, index) => index)`, `countTokensAnthropic: (text) => text.length`), so on every tiktoken/anthropic-strategy model this file's preflight oversize detection, `finalTargetThreshold` math, and the `tokenizerDeps` it forwards into `compressPrompt`'s payload (and thence `vector_utils` scoring and `enqueueCompressJobs` fit-or-chunk sizing) all overcount ~4× — over-detecting oversize, over-chunking victims, and over-compressing — while `processCompressJob` (WP1) measures the SAME pipeline with real tokenizers. One ruler for the whole pipeline; the construction here is textually identical to the one the WP1 `processJob.ts` node specifies for `ProcessCompressJobDeps`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `CalculateAffordabilityDirectReturn`/`CalculateAffordabilityCompressedReturn` are UNCHANGED shapes — `waiting_for_children` is NOT bolted onto either as an extra field; its absence on both already implies "not pending," matching how `CalculateAffordabilityDirectReturn` has never carried a `wasCompressed:true`-only field either. A genuinely new, third variant is used instead, per `Compression Jobs Scope.md`'s CANONICAL CONTRACTS note: "pending variants propagate upward as `CalculateAffordabilityPendingReturn` → `PrepareModelJobPendingReturn`" — a distinct discriminated variant, not a boolean bolted onto an existing one, so `prepareModelJob.ts` (a LATER node) can branch on it with the same three-way discriminated-union clarity this file already has for `Direct`/`Compressed`/`Error`.
      * `[ ]`   No other line in the "oversized, over budget" branch (`calculateAffordability.ts:142-320`: `maxTokensLimit`, `inputsRelevance` presence check, identity validation, cost-rate validation, `solveTargetForBalance`, `balanceAfterCompression`, `finalTargetThreshold`, all pre-compression affordability math) changes — this node touches only the `tokenizerDeps` construction (`:33-39`), the `compressParams` construction, and the post-call branch. `CountTokensDeps`'s shape and every `deps.countTokens` call site in this file are unchanged — only the injected implementations become real.

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus its support system.
    * `[ ]`   Out of scope: `compressPrompt.ts`'s own three-phase implementation (prior node, unchanged by this node); `prepareModelJob.ts`'s own propagation of the pending variant upward (next node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/calculateAffordability/` — the pre-flight affordability check and its `compressPrompt` hand-off.

  * `[ ]`   `deps`
    * `[ ]`   No new deps — `compressPrompt: BoundCompressPromptFn` is unchanged (still the SAME field; only the shape it accepts/returns changed, in the prior node).
    * `[ ]`   `DialecticJobRow` (`dialectic.interface.ts`, pre-existing) — new import, added to the existing `RelevanceRule` import from that file.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `calculateAffordability.interface.ts`
    * `[ ]`   `CalculateAffordabilityParams` gains `projectId: string; iterationNumber: number; targetKey: string; parentJob: DialecticJobRow;` (add `DialecticJobRow` to the existing `from "../../dialectic-service/dialectic.interface.ts"` import alongside `RelevanceRule`).
    * `[ ]`   NEW `export interface CalculateAffordabilityPendingReturn { waiting_for_children: true; }` — minimal, matching `ProcessCompressJobSuccessReturn`'s established "deferral is success" minimalism.
    * `[ ]`   `CalculateAffordabilityReturn` becomes `(CalculateAffordabilityDirectReturn | CalculateAffordabilityCompressedReturn | CalculateAffordabilityPendingReturn) | CalculateAffordabilityErrorReturn`.
    * `[ ]`   `CalculateAffordabilityDirectReturn`/`CalculateAffordabilityCompressedReturn`/`CalculateAffordabilityErrorReturn`/`CalculateAffordabilityDeps`/`CalculateAffordabilityPayload`/`CalculateAffordabilityFn`/`BoundCalculateAffordabilityFn` are UNCHANGED.

  * `[ ]`   `calculateAffordability.guard.ts` / `calculateAffordability.guard.test.ts`
    * `[ ]`   `isCalculateAffordabilityParams` gains checks for `projectId`/`targetKey` (non-empty string), `iterationNumber` (number), `parentJob` (object presence — `isRecord(value.parentJob) && typeof value.parentJob.id === 'string'`, matching this guard's existing minimal-shape style rather than importing a full `DialecticJobRow` guard).
    * `[ ]`   NEW `isCalculateAffordabilityPendingReturn(value): value is CalculateAffordabilityPendingReturn` — `isRecord(value) && value.waiting_for_children === true && !('wasCompressed' in value) && !('error' in value)`.
    * `[ ]`   `isCalculateAffordabilityDirectReturn`/`isCalculateAffordabilityCompressedReturn` EACH gain `if ("waiting_for_children" in value) return false;`, restoring mutual exclusion against the new variant (mirroring how each already excludes the OTHER two variants' distinguishing fields).
    * `[ ]`   New valid/invalid test cases in `calculateAffordability.guard.test.ts` for every field/guard above, mirroring this file's existing per-field style; a case asserting `isCalculateAffordabilityDirectReturn`/`isCalculateAffordabilityCompressedReturn` both reject a value carrying `waiting_for_children`.

  * `[ ]`   `calculateAffordability.mock.ts`
    * `[ ]`   `CalculateAffordabilityParamsOverrides` gains `projectId?: string; iterationNumber?: number; targetKey?: string; parentJob?: DialecticJobRow;`.
    * `[ ]`   `buildCalculateAffordabilityParams` gains defaults (`projectId: "contract-project-id"`, `iterationNumber: 1`, `targetKey: FileType.business_case` or an equally-inert placeholder, `parentJob:` a minimal valid stub — reuse an existing `DialecticJobRow` mock builder if the codebase already has one for another node's tests, else an inline minimal object with `id`/`job_type: 'EXECUTE'`) in its `base` object.
    * `[ ]`   NEW `buildCalculateAffordabilityPendingReturn(): CalculateAffordabilityPendingReturn { return { waiting_for_children: true }; }`, mirroring `buildCalculateAffordabilityDirectReturn`/`buildCalculateAffordabilityCompressedReturn`'s existing factory style.

  * `[ ]`   `calculateAffordability.test.ts`
    * `[ ]`   Every existing test continues to pass unmodified — none currently asserts on `compressParams`'s exact field set (grep-confirmed: no test captures/inspects the `CompressPromptParams` this file constructs), and none currently exercises the `wasCompressed: true` (oversized→compressed) branch at all (grep-confirmed: no `wasCompressed` assertion exists in this unit-test file today — only the integration test below exercises that path).
    * `[ ]`   NEW test: oversized path where the mocked `compressPrompt` returns `{ ...CompressPromptSuccessReturn fields..., waiting_for_children: true }` → `calculateAffordability` returns `{ waiting_for_children: true }` (verified via `isCalculateAffordabilityPendingReturn`), NOT a `CompressedReturn`.
    * `[ ]`   NEW test: oversized path where the mocked `compressPrompt` returns `waiting_for_children: false` → `calculateAffordability` returns the EXISTING `CompressedReturn` shape (`wasCompressed: true`, no `waiting_for_children` field).
    * `[ ]`   NEW test: the `compressParams` passed to the mocked `deps.compressPrompt` include `projectId`/`iterationNumber`/`targetKey`/`parentJob` equal to the corresponding `params` fields (a capturing mock, verifying the new pass-through wiring this node adds).
    * `[ ]`   NEW test (stub is gone): with the REAL `countTokens` injected as `deps.countTokens` and a tiktoken-strategy (`cl100k_base`) model config fixture, the preflight count this function computes for a fixed known string equals js-tiktoken's REAL token count for that string and does NOT equal its character length — observable proof the `:33-39` character-count stub was replaced, asserted through behavior rather than internals.

  * `[ ]`   `calculateAffordability.integration.test.ts`
    * `[ ]`   The existing `"oversized prompt → real compressPrompt → compressed return with RAG replacement"` test (`:333-436`) is REWRITTEN, not merely patched: it currently constructs a real `CompressPromptDeps` with `ragService: mockRag, embeddingClient` (both REMOVED fields — this test does not compile against the prior node's rewrite), uses `sourceType: "document"` on its `CompressionCandidate` fixture (invalid — must be `'resource'`), and asserts a synchronously-replaced `resourceDocuments[0].content` (`"INTEGRATION_RAG_REPLACEMENT_BODY"`, a behavior that no longer exists — compression is job-driven, never synchronous). The rewritten test: real `calculateAffordability` → real `compressPrompt` → real `applyCompressionOverlay` → real `vector_utils.getSortedCompressionCandidates`; `enqueueCompressJobs`/`fileManager`/`downloadFromStorage` are mocked (matching `compressPrompt.integration.test.ts`'s own established boundary, prior node) and Supabase is mocked with NO existing `CompressedContext` rows (so the overlay finds nothing and the reduce phase has nothing to reduce). Asserts: `isCalculateAffordabilityPendingReturn(result)` is `true`; the mocked `enqueueCompressJobs` was called exactly once, with a victim payload whose `content` matches the oversized document's content and `sourceType: 'resource'`; the parent job row's `status` was updated to `'waiting_for_children'`.
    * `[ ]`   The test's own `resourceDocuments` fixture (`:344-352`) updates `type: "document"` to `type: "resource"` (`ResourceDocument.type`, `gatherArtifacts.ts`'s node) and its `document_key: FileType.HeaderContext` to a real resource document key (e.g. `FileType.business_case` — `HeaderContext` is `'system'`-typed post-alignment and would never become a compression candidate, defeating the test's own oversized-path setup).
    * `[ ]`   Every other existing test in this file (`"NSF (non-oversized) → error return"`, the tier-cap binding test, and any non-oversized case whose `compressPrompt` stub throws "must not be called") is UNCHANGED — none of them reach the oversized branch this node touches.
    * `[ ]`   The rewritten test's own expected-count computations use ONE ruler with production: either compute expectations with the SAME real tokenizer construction this node installs, or pin the model fixture to a `rough_char_count` tokenization strategy (where `getEncoding` is never invoked and stub-vs-real is moot) — the existing stub fixtures at `calculateAffordability.integration.test.ts:152-158`/`:544-550` must not silently compute char-count expectations against real-token production counts.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Control flow is UNCHANGED except the widened `compressParams` literal and the three-way branch (error / pending / compressed) replacing the prior two-way branch (error / compressed) after the `deps.compressPrompt` call.

  * `[ ]`   `calculateAffordability.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (pre-flight affordability + compression hand-off). Deps inward: `compressPrompt.ts` (prior node, via the unchanged `compressPrompt` dep field). Provides outward: the widened `CalculateAffordabilityReturn` (three success variants + error) to `prepareModelJob.ts` (next node).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `compressParams` always includes `projectId`/`iterationNumber`/`targetKey`/`parentJob` sourced from this function's own `params`.
    * `[ ]`   `compressResult.waiting_for_children === true` produces `{ waiting_for_children: true }` and NEVER a `CompressedReturn`; `false` produces the unchanged `CompressedReturn` shape and NEVER carries `waiting_for_children`.
    * `[ ]`   `isCalculateAffordabilityDirectReturn`/`isCalculateAffordabilityCompressedReturn`/`isCalculateAffordabilityPendingReturn` are mutually exclusive for every value each guard is asked to classify.
    * `[ ]`   For a tiktoken-strategy model, this file's preflight token count for a fixed string equals js-tiktoken's real count, not its character length; no line of this file constructs a fake `getEncoding` or `countTokensAnthropic`.
    * `[ ]`   Every pre-existing non-oversized (`Direct`) and error-path test continues to pass unmodified.

* `[ ]`   supabase/functions/chat/streamChat/`StreamChat.ts` **[BE] Replace the character-count tokenizerDeps stub with real js-tiktoken/@anthropic-ai tokenizer implementations — the twin of the calculateAffordability stub fix, landed in the same sprint so no known measurement defect ships with the epic**

  * `[ ]`   `objective`
    * `[ ]`   Solve the same defect the prior node fixes in `calculateAffordability.ts`, at its twin site: `StreamChat.ts:144-150` constructs `tokenizerDeps: CountTokensDeps` with a fake `getEncoding` (`encode: (input) => Array.from(input).map((_, i) => i)` — one "token" per character) and a fake `countTokensAnthropic` (`text.length`), consumed at `StreamChat.ts:176` to compute `tokensRequiredForStreaming`. For every tiktoken/anthropic-strategy model, the streaming preflight count reads ~4× high — misclassifying affordable requests as unaffordable. This node is chain-independent of the WS-D compression cutover (nothing in the dialectic worker imports StreamChat) but rides the same sprint by direction: both known stub sites are corrected before the epic ships.
    * `[ ]`   Functional goal: replace the `:144-150` construction with REAL implementations — textually identical to the construction the prior node installs in `calculateAffordability.ts` and the WP1 `processJob.ts` node installs for `ProcessCompressJobDeps`: `getEncoding` wrapping `npm:js-tiktoken@1.0.7`'s real `getEncoding` behind the `TiktokenEncoding` narrowing pattern of `tokenEstimator/index.ts:31-53` (adapted to return `{ encode: (input: string) => number[] }` per `CountTokensDeps["getEncoding"]`); `countTokensAnthropic` from `npm:@anthropic-ai/tokenizer@0.0.4`'s `countTokens`; `logger: logger` unchanged.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No other line of `StreamChat.ts` changes: the `countTokensFn` call at `:176-181`, its payload construction, and every downstream affordability decision consume the same `CountTokensDeps` shape — only the injected implementations become real.
      * `[ ]`   `CountTokensDeps`/`CountTokensFn` (`tokenizer.types.ts`) are unchanged; no interface, guard, or mock file in this module changes shape — `streamChat.interface.ts`/`streamChat.guard.ts`/`streamChat.mock.ts` are untouched unless a mock fixture hardcodes the stub's char-count arithmetic (verified at implementation time by running the module's tests; any such fixture updates its expected values to the real count, not by re-stubbing production).
    * `[ ]`   THIS node is deliberately minimal-scope (existing-file edit, two-constant swap in one construction) — the third known twin, `streamRewind.ts:162-168`, is NOT covered here: one source file per node; it takes its own identical node if directed.

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus test updates. Out of scope: `streamRewind.ts` (own node if directed); `dummy_adapter.ts` (deliberate deterministic test double, not a defect site); any change to `countTokens` itself.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/chat/streamChat/` — the streaming chat entrypoint's preflight token accounting.

  * `[ ]`   `deps`
    * `[ ]`   `npm:js-tiktoken@1.0.7` (`getEncoding`, `TiktokenEncoding`) and `npm:@anthropic-ai/tokenizer@0.0.4` (`countTokens`) — the same two imports `tokenEstimator/index.ts:12-21` already uses; both in `deno.lock`; direct imports in this file (tokenizers are pure computation, not injected services — matching how this file already constructs `tokenizerDeps` locally rather than receiving it).
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `streamChat.test.ts`
    * `[ ]`   NEW test: with a tiktoken-strategy (`cl100k_base`) model config fixture and a fixed known message, `tokensRequiredForStreaming` (observable via the affordability branch taken, or via a capturing `countTokensFn` if the suite already injects one) equals js-tiktoken's REAL token count for the payload and does NOT equal its character length.
    * `[ ]`   Every existing test in `streamChat.test.ts`/`streamChat.integration.test.ts` continues to pass; any fixture whose expected values were derived from char-count arithmetic is updated to real-count expectations (fixtures pinned to `rough_char_count`-strategy model configs are unaffected — that strategy never calls `getEncoding`).

  * `[ ]`   `StreamChat.ts` (Implementation)
    * `[ ]`   Add the two npm imports; replace exactly `:144-150`'s two fake fields with the real adapter and real Anthropic counter as specified in the functional goal; `logger: logger` stays. Nothing else in the file is touched.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   For a tiktoken-strategy model, `StreamChat`'s preflight count for a fixed string equals js-tiktoken's real count, not its character length.
    * `[ ]`   No line of `StreamChat.ts` constructs a fake `getEncoding` or `countTokensAnthropic`.
    * `[ ]`   `streamChat.interface.ts`/`streamChat.guard.ts`/`streamChat.provides.ts` are unmodified.

* `[ ]`   supabase/functions/chat/streamRewind/`streamRewind.ts` **[BE] Replace the character-count tokenizerDeps stub with real js-tiktoken/@anthropic-ai tokenizer implementations — third and final known stub site, closing the census before the epic ships**

  * `[ ]`   `objective`
    * `[ ]`   Solve the same defect the prior two nodes fix, at the last known production site: `streamRewind.ts:162-168` constructs `tokenizerDeps: CountTokensDeps` with the identical fake `getEncoding` (`encode: (input) => Array.from(input).map((_, i) => i)`) and fake `countTokensAnthropic` (`text.length`), consumed at `streamRewind.ts:183-192` to compute `tokensRequiredForRewind` over the rewind prompt (system instruction + user message + history + resource documents). For every tiktoken/anthropic-strategy model the rewind preflight reads ~4× high, misclassifying affordable rewinds as unaffordable. With this node, zero known fake-tokenizer sites remain in production source (`dummy_adapter.ts`'s five copies are a deliberate deterministic test double, excluded by decision).
    * `[ ]`   Functional goal: replace the `:162-168` construction with REAL implementations — textually identical to the prior two nodes and the WP1 `processJob.ts` construction: `getEncoding` wrapping `npm:js-tiktoken@1.0.7`'s real `getEncoding` behind the `TiktokenEncoding` narrowing pattern of `tokenEstimator/index.ts:31-53` (adapted to return `{ encode: (input: string) => number[] }` per `CountTokensDeps["getEncoding"]`); `countTokensAnthropic` from `npm:@anthropic-ai/tokenizer@0.0.4`'s `countTokens`; `logger: logger` unchanged.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No other line of `streamRewind.ts` changes: the `countTokensFn` call at `:183-192`, its payload construction, the `modelConfig` null-check preceding it, and every downstream affordability decision consume the same `CountTokensDeps` shape — only the injected implementations become real.
      * `[ ]`   `CountTokensDeps`/`CountTokensFn` (`tokenizer.types.ts`) are unchanged; `streamRewind.interface.ts`/`streamRewind.guard.ts`/`streamRewind.mock.ts`/`streamRewind.provides.ts` are untouched unless a mock/test fixture hardcodes char-count arithmetic (verified at implementation time by running the module's tests; any such fixture updates its expected values to the real count, not by re-stubbing production).

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus test updates. Out of scope: `StreamChat.ts`/`calculateAffordability.ts` (prior nodes); `countTokens` itself; `dummy_adapter.ts`.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/chat/streamRewind/` — the rewind entrypoint's preflight token accounting.

  * `[ ]`   `deps`
    * `[ ]`   `npm:js-tiktoken@1.0.7` (`getEncoding`, `TiktokenEncoding`) and `npm:@anthropic-ai/tokenizer@0.0.4` (`countTokens`) — the same two imports `tokenEstimator/index.ts:12-21` already uses; both in `deno.lock`; direct imports in this file (pure computation, not injected services — matching how this file already constructs `tokenizerDeps` locally).
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `streamRewind.test.ts`
    * `[ ]`   NEW test: with a tiktoken-strategy (`cl100k_base`) model config fixture and a fixed known rewind payload, `tokensRequiredForRewind` (observable via the affordability branch taken, or via a capturing `countTokensFn` if the suite already injects one) equals js-tiktoken's REAL token count for the payload and does NOT equal its character length.
    * `[ ]`   Every existing test in `streamRewind.test.ts`/`streamRewind.integration.test.ts` continues to pass; any fixture whose expected values were derived from char-count arithmetic updates to real-count expectations (fixtures pinned to `rough_char_count`-strategy model configs are unaffected — that strategy never calls `getEncoding`).

  * `[ ]`   `streamRewind.ts` (Implementation)
    * `[ ]`   Add the two npm imports; replace exactly `:162-168`'s two fake fields with the real adapter and real Anthropic counter as specified in the functional goal; `logger: logger` stays. Nothing else in the file is touched.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   For a tiktoken-strategy model, `streamRewind`'s preflight count for a fixed string equals js-tiktoken's real count, not its character length.
    * `[ ]`   No line of `streamRewind.ts` constructs a fake `getEncoding` or `countTokensAnthropic`.
    * `[ ]`   `streamRewind.interface.ts`/`streamRewind.guard.ts`/`streamRewind.provides.ts` are unmodified.
    * `[ ]`   After this node, a repo-wide search of production source (tests/mocks and `dummy_adapter.ts` excluded) finds zero constructions of a character-indexing `getEncoding` or a `text.length` `countTokensAnthropic`.

* `[ ]`   supabase/functions/dialectic-worker/prepareModelJob/`prepareModelJob.ts` **[BE] Thread `projectId`/`iterationNumber`/`targetKey`/`parentJob` into `CalculateAffordabilityParams`, and propagate `calculateAffordability`'s pending variant as a new `PrepareModelJobPendingReturn` — no provider lookup, the parent's own model is already in play**

  * `[ ]`   `objective`
    * `[ ]`   Solve the same two-part gap `calculateAffordability.ts`'s node (prior) leaves at THIS call site: (1) `CalculateAffordabilityParams` now REQUIRES `projectId`/`iterationNumber`/`targetKey`/`parentJob`, none of which the `affordParams` literal (`prepareModelJob.ts:271-285`) supplies today; (2) `calculateAffordability` can now return a THIRD success variant (`CalculateAffordabilityPendingReturn`) that the current two-way `isCalculateAffordabilityCompressedReturn`/else branch (`:305-314`) does not recognize — it would fall into the `else` branch and be treated as an ordinary (uncompressed) `Direct` return, wrongly building a `chatApiRequest` from stale pre-compression data and proceeding to enqueue a real model call for a job that is actually waiting on COMPRESS children.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `projectId: projectIdRaw, iterationNumber: iterationNumberRaw, targetKey: output_type, parentJob: job,` to the `affordParams: CalculateAffordabilityParams` literal (`:271-285`). All four values are ALREADY available locally with no new lookup: `projectIdRaw`/`iterationNumberRaw` are already validated (non-empty string / positive number) by the existing guard blocks at `:170-177`/`:161-168` and narrowed by TypeScript control flow for the rest of the function; `output_type` is already destructured from `job.payload` at `:132` — it IS this job's own target output schema key, the exact same concept `gatherArtifacts.ts`'s/`compressPrompt.ts`'s nodes call `targetKey`; `job` is already `params.job`, exactly the `DialecticJobRow` `parentJob` expects (this EXECUTE job IS the parent from any COMPRESS child's perspective — "no provider lookup" per this node's own ticket text: the parent's own already-resolved `providerRow`/`extendedModelConfig` is what compression reuses, nothing new to fetch).
      * `[ ]`   Insert a NEW branch between the existing `isCalculateAffordabilityErrorReturn` check (`:298-300`, UNCHANGED) and the existing `isCalculateAffordabilityCompressedReturn`/else branch (`:305-314`): `if (isCalculateAffordabilityPendingReturn(affordResult)) { deps.logger.info('[prepareModelJob] Compression in progress; deferring model call', { jobId }); return { waiting_for_children: true }; }` — returned BEFORE any `chatApiRequest` is built and BEFORE `deps.enqueueModelCall` is ever reached.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `PrepareModelJobSuccessReturn` (`{ queued: true }`) is UNCHANGED — `waiting_for_children` is a NEW, separate variant (`PrepareModelJobPendingReturn`), never a field bolted onto `SuccessReturn`, mirroring `CalculateAffordabilityPendingReturn`'s own design in the prior node (a discriminated third variant, not a boolean on an existing one).
      * `[ ]`   No other line in this function changes — the tier-cap query, `isDialecticExecuteJobPayload` narrowing, `applyInputsRequiredScope` call, wallet balance/cost-rate validation, `baseChatApiRequest` construction, and the POST-affordability `enqueueModelCall` call (for the Direct/Compressed cases) are all UNCHANGED.

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus its support system.
    * `[ ]`   Out of scope: `calculateAffordability.ts`'s own three-way branch (prior node, unchanged by this node); `processSimpleJob.ts`'s own handling of a `PrepareModelJobPendingReturn` from `ctx.prepareModelJob` (a LATER node — "on a pending return, log and exit cleanly", per `Compression Jobs Scope.md`'s own processSimpleJob ticket).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/prepareModelJob/` — payload validation, affordability hand-off, and the final `enqueueModelCall` dispatch for one EXECUTE job.

  * `[ ]`   `deps`
    * `[ ]`   No new deps — `calculateAffordability: BoundCalculateAffordabilityFn` is unchanged (same field; only the shape it returns changed, in the prior node).
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `prepareModelJob.interface.ts`
    * `[ ]`   NEW `export interface PrepareModelJobPendingReturn { waiting_for_children: true; }`.
    * `[ ]`   `PrepareModelJobReturn` becomes `PrepareModelJobSuccessReturn | PrepareModelJobPendingReturn | PrepareModelJobErrorReturn`.
    * `[ ]`   `PrepareModelJobSuccessReturn`/`PrepareModelJobErrorReturn`/`PrepareModelJobDeps`/`PrepareModelJobParams`/`PrepareModelJobPayload`/`PrepareModelJobFn`/`PrepareModelJobExecutionError` are UNCHANGED — `PrepareModelJobParams` needs no new field (`job` already carries what `parentJob` needs downstream).

  * `[ ]`   `prepareModelJob.guard.ts` / `prepareModelJob.guard.test.ts`
    * `[ ]`   NEW `isPrepareModelJobPendingReturn(value): value is PrepareModelJobPendingReturn` — `isRecord(value) && value.waiting_for_children === true && !('queued' in value) && !('error' in value)`.
    * `[ ]`   `isPrepareModelJobSuccessReturn` gains `if ("waiting_for_children" in value) return false;`; `isPrepareModelJobErrorReturn` gains the same, restoring three-way mutual exclusion (mirroring `calculateAffordability.guard.ts`'s equivalent additions in the prior node).
    * `[ ]`   New valid/invalid test cases in `prepareModelJob.guard.test.ts` for the new guard and the two widened ones, mirroring this file's existing per-field style.

  * `[ ]`   `prepareModelJob.mock.ts`
    * `[ ]`   NEW `mockPrepareModelJobPendingReturn(): PrepareModelJobPendingReturn { return { waiting_for_children: true }; }`, mirroring `mockPrepareModelJobSuccessReturn`/`mockPrepareModelJobErrorReturn`'s existing factory style.
    * `[ ]`   No change to `mockPrepareModelJobDeps`/`mockPrepareModelJobParams`/`mockPrepareModelJobPayload` — none gain a new field (the four new `affordParams` values are all sourced from EXISTING `params.job`/`job.payload` fields, not new `PrepareModelJobParams` fields).

  * `[ ]`   `prepareModelJob.test.ts`
    * `[ ]`   NEW test: `deps.calculateAffordability` mocked (via `buildCalculateAffordabilityPendingReturn()`, prior node's mock) to return the pending variant → `prepareModelJob` returns `{ waiting_for_children: true }` (verified via `isPrepareModelJobPendingReturn`); `deps.enqueueModelCall` is NEVER called.
    * `[ ]`   NEW test: the `affordParams` passed to a capturing `deps.calculateAffordability` mock include `projectId`/`iterationNumber`/`targetKey`/`parentJob` equal to `job.payload.projectId`/`job.payload.iterationNumber`/`job.payload.output_type`/`job` respectively.
    * `[ ]`   Every existing test (Direct path, Compressed path, error paths) continues to pass unmodified — none currently mocks a return shape that would satisfy `isCalculateAffordabilityPendingReturn` (grep-confirmed: no existing fixture carries a `waiting_for_children` field).

  * `[ ]`   `prepareModelJob.integration.test.ts`
    * `[ ]`   The existing oversized-compression test (`:280-470`-ish, exact name TBD at implementation — the one calling `buildBoundCompressPromptFn({ ragService: mockRag, countTokens, tokenWalletService: adminTokenWalletService })` and asserting `isPrepareModelJobSuccessReturn(result)`/`enqueueModelCallSpy.calls.length === 1`) is REWRITTEN, not patched: `buildBoundCompressPromptFn` no longer accepts `ragService`/`tokenWalletService` (both REMOVED from `CompressPromptDeps` two nodes ago); its `resourceDoc.type: "document"` and `compressionStrategy`'s synthesized `sourceType: "document"` are both invalid post-alignment (`ResourceDocument.type`/`CompressionSourceType` no longer have a `'document'` member); and it asserts the OLD synchronous-replacement completion (`enqueueModelCallSpy.calls.length === 1`), a behavior that no longer exists. The rewritten test: real `prepareModelJob` → real `calculateAffordability` → real `compressPrompt` → real `applyCompressionOverlay` → real `vector_utils.getSortedCompressionCandidates`; `enqueueCompressJobs`/`fileManager`/`downloadFromStorage` mocked (matching `compressPrompt.integration.test.ts`'s own established boundary) and Supabase mocked with no existing `CompressedContext` rows. Asserts: `isPrepareModelJobPendingReturn(result)` is `true`; `enqueueModelCallSpy.calls.length === 0` (the model call is NEVER reached — this is the behavioral inverse of the deleted assertion); the mocked `enqueueCompressJobs` was called exactly once for the oversized `business_case` document.
    * `[ ]`   The test's `resourceDoc` fixture (`type: "document"`) becomes `type: "resource"`; its inline `compressionStrategy`'s `sourceType: "document"` becomes `sourceType: "resource"` (or the test switches to importing the REAL `vector_utils.getSortedCompressionCandidates` instead of hand-rolling a strategy, consistent with the "real vector_utils" boundary this node's other integration tests already use).
    * `[ ]`   Every other existing test in this file (non-oversized paths, error paths) is UNCHANGED — none of them reach the branch this node touches.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Control flow is UNCHANGED except the widened `affordParams` literal and the new pending-check branch inserted between the existing error check and the existing Compressed/Direct branch.

  * `[ ]`   `prepareModelJob.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (per-job preparation + dispatch). Deps inward: `calculateAffordability.ts` (prior node, via the unchanged `calculateAffordability` dep field). Provides outward: the widened `PrepareModelJobReturn` (`PrepareModelJobPendingReturn`) to `processSimpleJob.ts` (last node this sprint), which must handle it by logging and exiting cleanly rather than treating it as either success or failure.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `affordParams` always includes `projectId`/`iterationNumber`/`targetKey`/`parentJob` sourced from this function's own validated locals — no new DB lookup.
    * `[ ]`   A pending `affordResult` produces `{ waiting_for_children: true }` and calls `deps.enqueueModelCall` ZERO times.
    * `[ ]`   `isPrepareModelJobSuccessReturn`/`isPrepareModelJobPendingReturn`/`isPrepareModelJobErrorReturn` are mutually exclusive for every value each guard is asked to classify.
    * `[ ]`   Every pre-existing Direct/Compressed/error-path test continues to pass unmodified.

* `[ ]`   supabase/functions/dialectic-worker/`index.ts` **[BE] Bind `applyCompressionOverlay` into `boundGatherArtifacts` — a required wiring gap missed when `gatherArtifacts.ts`'s Deps were widened, corrected before `processSimpleJob.ts`'s full-chain test needs it**

  * `[ ]`   `objective`
    * `[ ]`   Solve a real, missed requirement: `gatherArtifacts.ts`'s node widened `GatherArtifactsDeps` to require `applyCompressionOverlay: BoundApplyCompressionOverlayFn`, but the only place `gatherArtifacts` is ever bound into a callable (`index.ts:111-112`, `boundGatherArtifacts`) still constructs its Deps as `{ logger, pickLatest, downloadFromStorage }` — three fields, missing the fourth. This was not planned for when the original three-touch count for this file was ratified; it is a gap being fixed, not a foreseen design. Left unfixed, `boundGatherArtifacts` does not compile, and `processSimpleJob.ts`'s full-chain integration test (next node) would have no real, working `ctx.gatherArtifacts` to call.
    * `[ ]`   Functional goals:
      * `[ ]`   Import `applyCompressionOverlay` from `./applyCompressionOverlay/applyCompressionOverlay.ts` and `BoundApplyCompressionOverlayFn` from `./applyCompressionOverlay/applyCompressionOverlay.interface.ts`.
      * `[ ]`   Insert `const boundApplyCompressionOverlay: BoundApplyCompressionOverlayFn = (params, payload) => applyCompressionOverlay({ logger, constructStoragePath, downloadFromStorage }, params, payload);` immediately before the existing `boundGatherArtifacts` declaration (`index.ts:111`) — `logger`/`downloadFromStorage` are already in scope at this point in the file (already consumed by the existing `boundGatherArtifacts` literal one line below); `constructStoragePath` is already imported and in scope (`index.ts:23`, already used to construct `fileManager` at `:91`). No new environment variable, no new service instantiation.
      * `[ ]`   Edit the existing `boundGatherArtifacts` literal (`:111-112`) to `gatherArtifacts({ logger, pickLatest, downloadFromStorage, applyCompressionOverlay: boundApplyCompressionOverlay }, params, payload);` — one added field, nothing else in the literal changes.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No other line in this file changes — `embeddingClient`/`textSplitter`/`indexingService`/`ragService` (`:99-108`, all doomed for WS-X removal) are untouched by this node; `documentRenderer`, `netlifyQueueUrl`/`netlifyApiKey`, and every other bound closure in this file are untouched.
      * `[ ]`   No test-harness companion needs updating: grep-confirmed neither `index.test.ts` nor `index.integration.test.ts` constructs its own parallel `gatherArtifacts`/`boundGatherArtifacts` closure (unlike the WS-B capstone's `buildNetlifyDeps`, which DID need parity edits) — this wiring has no second construction site anywhere in the test suite.

  * `[ ]`   `role`
    * `[ ]`   Composition-root wiring node — the FOURTH enumerated touch to this file this epic (corrected in `Compression Jobs Scope.md`'s NODE & SPRINT RULES alongside this node), landing after `prepareModelJob.ts` and before `processSimpleJob.ts` specifically so the full-chain test has a genuinely working `ctx.gatherArtifacts` to call.
    * `[ ]`   Out of scope: any change to `applyCompressionOverlay.ts`'s own implementation (already-written node); any change to `gatherArtifacts.ts`'s own implementation (already-written node); the WS-X removal touch to this same file (later, separate).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: the single `boundApplyCompressionOverlay`/`boundGatherArtifacts` wiring pair in `dialectic-worker/index.ts`'s composition-root body.

  * `[ ]`   `deps`
    * `[ ]`   `applyCompressionOverlay`/`BoundApplyCompressionOverlayFn` (prior node) — new imports.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this file already sits at the top of its own dependency graph as the composition root.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the module's own top-level composition. The new bound closure is declared in the same flat `const x: T = (params, payload) => fn({...}, params, payload);` style as the existing `boundGatherArtifacts`/`boundDebitTokens`, with no conditional logic.

  * `[ ]`   `index.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: composition root (application boundary, outermost layer, background-worker entrypoint). Deps inward: `applyCompressionOverlay.ts`, `gatherArtifacts.ts` (both prior nodes). Provides outward: a genuinely working `ctx.gatherArtifacts` to every EXECUTE job this worker processes, including `processSimpleJob.ts`'s full-chain test (next node).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `boundGatherArtifacts`'s constructed `GatherArtifactsDeps` includes a real, callable `applyCompressionOverlay`.
    * `[ ]`   The repo compiles with no transient non-compilable state remaining anywhere in WS-D's `gatherArtifacts`/`index.ts` wiring.
    * `[ ]`   No other line of `index.ts` changes.

* `[ ]`   supabase/functions/dialectic-worker/`processSimpleJob.ts` **[BE] Supply `stageSlug`/`targetKey` to `gatherArtifacts`, handle a pending return from `prepareModelJob` by exiting cleanly, and host the full-chain compression integration test that proves the entire WS-D cutover works end to end**

  * `[ ]`   `objective`
    * `[ ]`   Solve the last two call-site gaps left open by this sprint's chain of nodes: (1) `ctx.gatherArtifacts`'s call (`processSimpleJob.ts:304-307`) still passes only `{ dbClient, projectId, sessionId, iterationNumber }` — `GatherArtifactsParams` has required `stageSlug`/`targetKey` since `gatherArtifacts.ts`'s node, making this call site transiently non-compilable until now; (2) `ctx.prepareModelJob`'s result (`:341-357`) is narrowed only by `isPrepareModelJobErrorReturn`/`isPrepareModelJobSuccessReturn` — a `PrepareModelJobPendingReturn` (new since `prepareModelJob.ts`'s node) would fall through the `!isPrepareModelJobSuccessReturn(prepareResult)` check and throw `'prepareModelJob returned an invalid result shape'`, treating a correctly-paused job as a crash.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `stageSlug` (already destructured from `job.payload` at `:42-47`, no new lookup) and `targetKey: resolvedRecipeStep.output_type` (`resolvedRecipeStep` already resolved at `:156-214`, well before this call site — the SAME value `notificationDocumentKey` is already assigned from at `:217`) to the `ctx.gatherArtifacts` params literal (`:304-307`).
      * `[ ]`   Insert a NEW branch between the existing `isPrepareModelJobErrorReturn(prepareResult)` check (`:343-353`, UNCHANGED) and the existing `!isPrepareModelJobSuccessReturn(prepareResult)` guard (`:355-357`): `if (isPrepareModelJobPendingReturn(prepareResult)) { ctx.logger.info(\`[dialectic-worker] [processSimpleJob] Job ${jobId} is waiting on COMPRESS children; exiting cleanly.\`, { jobId }); return; }` — a clean early return: no `execute_completed` notification (the job has not completed), no job-status write (per `Compression Jobs Scope.md`'s TARGET ARCHITECTURE step 3, `compressPrompt`/`enqueueCompressJobs` already wrote `status:'waiting_for_children'` on the job row several call-frames down before this ever returns), no retry, no failure of any kind — a paused job is not an error.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No other line in the `try` block changes — session/provider/project/stage lookups, recipe-step resolution, prompt assembly, continuation routing, and the `execute_completed` notification path for the genuine success case are all UNCHANGED.
      * `[ ]`   The `catch` block (`:372` onward — `ContextWindowError` handling, immediate-failure classification, retry logic) is UNCHANGED: a pending return is never thrown, so it can never reach this block through the new code path; it remains reachable only for genuine errors, exactly as before.

  * `[ ]`   `role`
    * `[ ]`   Existing-file edit — does not adopt the full new-package template; only the delta above plus its support system.
    * `[ ]`   Out of scope: `gatherArtifacts.ts`'s/`prepareModelJob.ts`'s own implementations (prior nodes, unchanged); `index.ts`'s composition-root wiring (prior node, unchanged); any change to the recipe-step resolution logic this function already performs.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/processSimpleJob.ts` — the per-EXECUTE-job orchestration entrypoint: gather, assemble, prepare, dispatch, notify.

  * `[ ]`   `deps`
    * `[ ]`   `isPrepareModelJobPendingReturn` (`prepareModelJob.guard.ts`, prior node) — new import, added alongside the existing `isPrepareModelJobErrorReturn`/`isPrepareModelJobSuccessReturn` import (`:15-17`).
    * `[ ]`   Confirm: no reverse dependency; no lateral violation.

  * `[ ]`   `processSimpleJob.test.ts`
    * `[ ]`   NEW test: the `GatherArtifactsParams` a capturing `ctx.gatherArtifacts` mock receives include `stageSlug` equal to `job.payload.stageSlug` and `targetKey` equal to `resolvedRecipeStep.output_type` for the test's own fixture recipe step.
    * `[ ]`   NEW test: `ctx.prepareModelJob` mocked to return a pending return (`{ waiting_for_children: true }`) → `processSimpleJob` returns (does not throw); `ctx.notificationService.sendJobNotificationEvent` is NEVER called with `type: 'execute_completed'`; no `dialectic_generation_jobs` update is issued by this function for the pending case (mocked `dbClient` receives no `.update()` call from `processSimpleJob` itself on this path).
    * `[ ]`   Every existing test (happy path, continuation path, every error/retry classification) continues to pass unmodified — none of them currently construct a `prepareModelJob` mock result satisfying `isPrepareModelJobPendingReturn` (grep-confirmed: no existing fixture in this file carries a `waiting_for_children` field).

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Control flow is UNCHANGED except the widened `gatherArtifacts` params literal and the new pending-check branch inserted between the existing error check and the existing "invalid result shape" guard.

  * `[ ]`   `processSimpleJob.ts` (Implementation)
    * `[ ]`   Implements the functional goals in the order given in `objective`.

  * `[ ]`   `processSimpleJob.integration.test.ts` (RIDES HERE — the full-chain compression integration test, per `Compression Jobs Scope.md`'s own established assertion list, reproduced verbatim below since it was ratified before this node was written and every dependency it names now exists as a specified — largely already-implemented — node)
    * `[ ]`   Bounded subsystem: real internals throughout — real `processSimpleJob`, `prepareModelJob`, `calculateAffordability`, `compressPrompt`, `vector_utils`, `applyCompressionOverlay`, `gatherArtifacts`, `enqueueCompressJobs`, `processCompressJob`, `assembleCompressionPrompt`, `saveResponse`, `enqueueModelCall`; only TRUE external boundaries are mocked — the background-worker HTTP POST (Netlify) and Supabase itself (via the repo's real mock Supabase client, not a hand-rolled stub). No repo-owned function is mocked.
    * `[ ]`   Asserts, in order:
      1. An oversized model-call input → no stream call is enqueued for the parent; the parent job row is updated to `status:'waiting_for_children'`; the pending return propagates all the way up through `calculateAffordability` → `prepareModelJob` → `processSimpleJob`, which exits cleanly (no throw, no failure notification).
      2. One or more COMPRESS child job row(s) exist with `parent_job_id = parent.id`; each child's `payload` carries `mode`, `content`, `sourceType`/`sourceId`(or `documentKey`), `targetKey`, and — for chunked victims — `chunk_index`/`chunk_total`; every child's `model_id` equals the PARENT's own `model_id` (no separate provider lookup).
      3. For a JSON-mode child (a `'resource'` victim whose provenance resolves to a completed source JSON contribution): the enqueued model call's prompt carries the completed source JSON AND the target schema; the mocked stream callback returns compressed JSON.
      4. `saveResponse` structurally validates the compressed JSON against the source (every key present, same shape), renders it through the SAME template that rendered the original document, and persists a `CompressedContext` resource via `uploadAndRegisterFile` at the canonical `_work/{source}_compressed_for_{target}` path with real `user_id`/`wallet_id` attribution and a real wallet DEBIT; a deliberately structurally-drifted mock response instead fails that COMPRESS job explicitly (never silently accepted).
      5. The DB completion trigger wakes the parent job; for a chunked victim, `compressPrompt`'s reduce phase concatenates chunk content in `chunk_index` order and the re-compress branch fires ONLY when the concatenation still exceeds the per-victim target.
      6. On resume, `gatherArtifacts` → `applyCompressionOverlay` swaps the victim's content (its `id`/`document_key`/`stage_slug`/`type` unchanged); the recount fits; the REAL stream call for the parent's own original request is finally enqueued.
      7. Recursion guard: a COMPRESS job whose own assembled prompt exceeds the model window hard-fails explicitly; it NEVER spawns a nested compression of any kind.
      8. Reuse: a sibling parent job producing the SAME compression target (same source, same `targetKey`) finds the already-persisted artifact and spawns NOTHING, overlaying it directly; a parent producing a DIFFERENT target from the SAME source compresses fresh (no cross-target artifact reuse, per the canonical identity tuple `(session, consuming stage, target key, source identity)`).
    * `[ ]`   This is the LAST node of Sprint 5a — but does NOT carry a `Commit` step: per the SPRINT / COMMIT MAP, Sprint 5's single commit ("compression loop live, RAG core gone, full-chain test green") covers WS-D AND WS-X together; the commit rides the last node of WS-X (RAG removal, not yet planned), not this one.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (top-level per-job entrypoint). Deps inward: every node in this epic's WS-C/WS-R/WS-B/WS-D chain (`applyCompressionOverlay.ts`, `gatherArtifacts.ts`, `vector_utils.ts`, `compressPrompt.ts`, `calculateAffordability.ts`, `prepareModelJob.ts`, `index.ts`'s capstone wiring — all prior nodes — plus the already-specified WS-R/WS-B modules). Provides outward: nothing further within WS-D — this is the terminal node of the sprint's dependency graph.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `ctx.gatherArtifacts` always receives `stageSlug`/`targetKey` matching the current job's own payload/recipe step.
    * `[ ]`   A pending `prepareModelJob` result causes `processSimpleJob` to return cleanly with zero notifications and zero job-status writes of its own.
    * `[ ]`   The full-chain integration test's eight assertions all pass with no repo-owned function mocked.
    * `[ ]`   Every pre-existing happy-path/continuation/error-classification test in `processSimpleJob.test.ts` continues to pass unmodified.

## WS-X — RAG REMOVAL (same sprint and commit as WS-D)

WS-D severed every live functional reference into the RAG core; this closes out the sprint by deleting it. No full nodes — deletions and reference cleanup only.

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
  * Structural: `COMPRESS` job type + compression prompt template (Sprint 1); `CompressedContext` artifact identity + path support (Sprint 2); COMPRESS routing, spawn, and dedup machinery (Sprint 3); renderer decomposition + COMPRESS persistence (Sprint 4); compression orchestration cutover in `gatherArtifacts`/`compressPrompt`/`calculateAffordability`/`prepareModelJob`/`processSimpleJob` (Sprint 5a); `rag_service`/`indexing_service`/`dialectic_memory`/`match_dialectic_chunks` deleted (Sprint 5b).
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