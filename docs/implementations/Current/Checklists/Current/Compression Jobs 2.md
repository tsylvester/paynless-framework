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

## WS-N RENDER dispatch

* `[✅]`   supabase/functions/dialectic-worker/enqueueRenderJob/`enqueueRenderJob.ts` **[BE] Replace the inline template_filename resolution walk with a call to resolveTemplateFilename, injected as a required EnqueueRenderJobDeps field — every dependency is injected, no exception for determinism or DB-boundedness — surfacing its TemplateResolutionError as the exact object returned, never reconstructed into a different error class — and add the CompressedContext-source dispatch case: the payload union widens to EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload, the payload structure BY ITSELF selects the branch (no flag, no new deps field), renderability and template identity resolve through the SAME two already-injected deps (shouldEnqueueRenderJob, resolveTemplateFilename) against the SOURCE document's coordinates, and one source-identity-keyed RENDER child row is inserted with parent_job_id = the COMPRESS job, carrying everything processRenderJob needs to build RenderCompressedContextParams**

  * `[✅]`   `objective`
    * `[✅]`   Solve two gaps in one function. First, `enqueueRenderJob.ts` carries its own copy of the four-query template-resolution walk that now also exists as the standalone `resolveTemplateFilename` module — a duplicate that drifts the moment either is edited. Second, nothing anywhere inserts the RENDER row that renders a compressed victim, so a compressed artifact has no path to markdown.
    * `[✅]`   Every dependency this function calls is INJECTED via `EnqueueRenderJobDeps`, never directly imported and invoked inline — regardless of whether the dependency is pure, deterministic, or already covered by its own tests. Every error an injected dependency returns is surfaced to this function's OWN caller as the EXACT error object produced, with its real type intact — never reconstructed from a message string into a different error class, never downgraded to a generic type.
    * `[✅]`   Functional goal, template resolution: replace the `let templateFilename` declaration, the entire try/catch walk, and the trailing defensive check with:
      1. Destructure `resolveTemplateFilename` from `deps` alongside the existing `dbClient, logger, shouldEnqueueRenderJob`.
      2. `const templateResult = await deps.resolveTemplateFilename({ dbClient }, { stageSlug, outputType, documentKey: documentKeyAsFileType });` — the injected form is the BOUND 2-arg closure (`BoundResolveTemplateFilenameFn`); the caller supplies only `params`/`payload`, never `deps`, since the closure carries its own bound deps. Reuses the same `dbClient` and the same two already-resolved locals (`stageSlug` from `params`, `documentKeyAsFileType` resolved in the pre-checks) — no new value is computed.
      3. `if ('error' in templateResult) { return templateResult; }` — the REAL `TemplateResolutionError` object, returned UNCHANGED. No reconstruction, no message-string extraction, no wrapping.
      4. Else `const { templateFilename } = templateResult;` — the same local name the removed block produced, so the `renderPayload` construction below reads it unchanged.
    * `[✅]`   `EnqueueRenderJobErrorReturn.error` widens from `RenderJobValidationError | RenderJobEnqueueError` to `RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError` — an additive union widening, not a proxy or wrapper type. `isEnqueueRenderJobErrorReturn` widens its `instanceof` check to match.
    * `[✅]`   Functional goal, COMPRESS dispatch:
      * `[✅]`   Widen the payload: `EnqueueRenderJobFn`/`BoundEnqueueRenderJobFn` accept `EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload`, discriminated ON ENTRY by the new member's owned guard `isEnqueueRenderCompressedContextPayload` — the payload structure BY ITSELF selects the branch; no flag, no new `EnqueueRenderJobDeps` field, and `EnqueueRenderJobParams` and both return types are UNCHANGED.
      * `[✅]`   `EnqueueRenderCompressedContextPayload` carries exactly the source identity `EnqueueRenderJobParams` does not already hold: `{ sourceType: CompressionSourceType; documentKey: FileType; docType: ModelContributionFileTypes; sourceStageSlug: DialecticStageSlug; targetKey: ModelContributionFileTypes }` — all five guaranteed present by `isDialecticCompressJobPayload`'s json-mode branch. NO `sourceId` and NO chunk fields: map-reduce chunks are always `mode:'text'` and text artifacts are never rendered. NO `needsContinuation`: only a complete result is ever dispatched.
      * `[✅]`   Renderability is decided HERE with the SAME injected dep the EXECUTE branch uses, against the SOURCE document's coordinates: `shouldEnqueueRenderJob({ dbClient, logger }, { outputType: payload.docType, stageSlug: payload.sourceStageSlug })` — `is_json` → `{ renderJobId: null }` (success, not error); a query-failure reason → the same `RenderJobEnqueueError`/`retriable: false` handling the EXECUTE branch already applies; only `is_markdown` proceeds. This IS the scope's "when the preserved source OutputType is renderable" check.
      * `[✅]`   Template identity resolves HERE with the SAME injected dep: `resolveTemplateFilename({ dbClient }, { stageSlug: payload.sourceStageSlug, outputType: payload.docType, documentKey: payload.documentKey })` — an error is returned as the exact object, unchanged, identical to the EXECUTE branch's pass-through.
      * `[✅]`   Define the job-row payload this branch inserts, `DialecticRenderCompressedContextJobPayload`, in `enqueueRenderJob.interface.ts` (creator-owns-the-data, the same placement `DialecticCompressJobPayload` uses in `enqueueCompressJobs.interface.ts`): `{ idempotencyKey: string; projectId: string; sessionId: string; iterationNumber: number; stageSlug: DialecticStageSlug; targetKey: ModelContributionFileTypes; sourceType: CompressionSourceType; documentKey: FileType; template_filename: string; user_jwt: string; model_id: string; walletId: string }` — the existing `renderPayload` literal with `documentIdentity`/`sourceContributionId` (contribution-chain identity, inapplicable to a resource artifact) replaced by `targetKey`/`sourceType`, and `stageSlug` = `params.stageSlug`, the CONSUMING stage whose `_work` holds the artifact. This is the exact field set `processRenderJob` needs to build `RenderCompressedContextParams` plus the job-machinery trio every RENDER row carries; the row's payload structure BY ITSELF tells `processRenderJob` which render case it is — no flag.
      * `[✅]`   Source-identity idempotency: `idempotencyKey = ` `` `${sessionId}_${iterationNumber}_${params.stageSlug}_compress_render_${payload.sourceType}_${payload.documentKey}_${sanitizeForPath(payload.targetKey)}` `` — the deterministic-key construction `enqueueCompressJobs.ts` uses, so any re-dispatch for the same compressed artifact recovers the SAME child row through the existing 23505 recovery instead of duplicating it.
      * `[✅]`   The insert, the 23505 idempotency recovery, the programmer-vs-transient error split, and the no-row-id check are the SHARED TAIL both branches flow into. The only change to that range is hoisting the literal `${jobId}_render` into one per-branch `idempotencyKey` local that the payload literal, `insertObj`, and the recovery lookup all read; the EXECUTE branch's value stays byte-identical.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   `EnqueueRenderJobParams`, `EnqueueRenderJobPayload`, and `EnqueueRenderJobReturn`'s success shape are unchanged — only `EnqueueRenderJobDeps` (one new required field) and `EnqueueRenderJobErrorReturn` (widened union) change.
      * `[✅]`   `resolveTemplateFilename` has NO default value in `EnqueueRenderJobDeps` — it is a plain interface, matching how `dbClient`/`logger`/`shouldEnqueueRenderJob` are already required with no default. Every caller constructing `EnqueueRenderJobDeps` must supply it or the file fails to compile.
      * `[✅]`   The COMPRESS-dispatch addition introduces NO `EnqueueRenderJobDeps` field — the branch runs entirely on deps this function already requires.
      * `[✅]`   No notification of any kind. This function sends none today; the dispatched row's processor decides its own notification behavior.
      * `[✅]`   `parent_job_id: jobId` is the existing insert field, unchanged — it is what lets `saveResponse` set the COMPRESS parent `waiting_for_children` and be woken by the existing child-completion trigger.
      * `[✅]`   Everything outside the replaced walk and the new branch — the pre-checks, the `renderPayload` construction, the insert and idempotency-recovery logic — is byte-identical.
      * `[✅]`   No change to `_shared/utils/errors.ts`.

  * `[✅]`   `role`
    * `[✅]`   Worker-orchestration node: the sole producer of RENDER job rows, for both the EXECUTE and the compressed-artifact cases. This is where "should this artifact be rendered, and from which template" is decided.
    * `[✅]`   Out of scope: `resolveTemplateFilename.ts` and `shouldEnqueueRenderJob`'s own internals (both called, never edited); `netlifyResponse/index.ts`'s wiring; producing or validating the compressed artifact and setting the COMPRESS parent `waiting_for_children` (`saveResponse`); consuming the inserted row and building `RenderCompressedContextParams` (`processRenderJob`); performing the render (`renderDocument`).

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/dialectic-worker/enqueueRenderJob/` — `enqueueRenderJob.ts`, `enqueueRenderJob.interface.ts`, `enqueueRenderJob.guards.ts`, `enqueueRenderJob.interface.test.ts`, `enqueueRenderJob.guard.test.ts`, `enqueueRenderJob.mock.ts`, `enqueueRenderJob.test.ts`. Nothing outside this folder is touched.

  * `[✅]`   `deps`
    * `[✅]`   `BoundResolveTemplateFilenameFn` (`_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts`, prior node) — new REQUIRED `EnqueueRenderJobDeps` field, injected, not imported.
    * `[✅]`   `TemplateResolutionError` (`_shared/utils/errors.ts`, prior node) — new import into `enqueueRenderJob.interface.ts` and `enqueueRenderJob.interface.guards.ts` for the widened union/guard.
    * `[✅]`   Confirm: no reverse dependency (the module doesn't import from `dialectic-worker/`); no lateral violation.
    * `[✅]`   `sanitizeForPath` (`_shared/utils/path_constructor.ts`) — pure, direct import for the source-identity idempotency key, imported exactly as `enqueueCompressJobs.ts` imports it.
    * `[✅]`   `CompressionSourceType` (`_shared/types/file_manager.types.ts`) — type-only import into `enqueueRenderJob.interface.ts`, joining the existing `FileType, ModelContributionFileTypes, DialecticStageSlug` import.
    * `[✅]`   `isCompressionSourceType` (`_shared/utils/type-guards/type_guards.file_manager.ts`) — imported into `enqueueRenderJob.guards.ts` for the new payload guard; reused, never re-authored.
    * `[✅]`   Confirm: no reverse dependency (the module does not import from outside `_shared/` and this folder); no lateral violation; the COMPRESS branch adds no injected dep.

  * `[✅]`   `enqueueRenderJob.interface.test.ts`
    * `[✅]`   The `'Contract: EnqueueRenderJobDeps accepts dbClient, logger, shouldEnqueueRenderJob'` test and the two `_missingDb`-style negative tests each gain `resolveTemplateFilename: <stub returning a fixed success>` in their `EnqueueRenderJobDeps` literal, plus the first test's title and assertions extend to assert `typeof deps.resolveTemplateFilename === 'function'`.
    * `[✅]`   New test: a `@ts-expect-error` compile-time check that an `EnqueueRenderJobDeps` literal omitting `resolveTemplateFilename` is rejected by the type checker — mirrors this file's existing `_missingDb`/`_missingJobId` pattern; no `isEnqueueRenderJobDeps` call, which belongs to the guard test.
    * `[✅]`   New test: `EnqueueRenderJobErrorReturn` accepts `{ error: new TemplateResolutionError('x'), retriable: false }` by direct construction and type assignment — no `isEnqueueRenderJobErrorReturn` call.
    * `[✅]`   New test: `Record<keyof EnqueueRenderCompressedContextPayload, true>` over the five keys (length 5) and `Record<keyof DialecticRenderCompressedContextJobPayload, true>` over the twelve keys (length 12) — the all-keys-present style this epic's interface tests already use.
    * `[✅]`   New test: a full `EnqueueRenderCompressedContextPayload` literal assigns to `Parameters<EnqueueRenderJobFn>[2]` and to `BoundEnqueueRenderJobFn`'s payload parameter — RED until the union widens.

  * `[✅]`   `enqueueRenderJob.interface.ts`
    * `[✅]`   Add `resolveTemplateFilename: BoundResolveTemplateFilenameFn;` to `EnqueueRenderJobDeps`, importing the type from `../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts`.
    * `[✅]`   Widen `EnqueueRenderJobErrorReturn.error` to `RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError`, importing `TemplateResolutionError` alongside the existing `RenderJobEnqueueError, RenderJobValidationError` import from `../../_shared/utils/errors.ts` (line 5).
    * `[✅]`   Add `export interface EnqueueRenderCompressedContextPayload` with the five fields named in `objective`, and `export interface DialecticRenderCompressedContextJobPayload` with the twelve fields named in `objective`; add `CompressionSourceType` to the type-only `file_manager.types.ts` import.
    * `[✅]`   Widen the payload parameter of `EnqueueRenderJobFn` and `BoundEnqueueRenderJobFn` to `EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload`; `EnqueueRenderJobDeps`, `EnqueueRenderJobParams`, `EnqueueRenderJobSuccessReturn`, and `EnqueueRenderJobErrorReturn` are unchanged.

  * `[✅]`   `enqueueRenderJob.mock.ts`
    * `[✅]`   Add `buildEnqueueRenderCompressedContextPayload(overrides?)` + `invalidateEnqueueRenderCompressedContextPayload(corruptions)` and `buildDialecticRenderCompressedContextJobPayload(overrides?)` + `invalidateDialecticRenderCompressedContextJobPayload(corruptions)`, each mirroring this file's existing defaults-plus-overrides builder/invalidator shape; payload defaults `sourceType: 'contribution'`, `documentKey: FileType.business_case`, `docType: FileType.business_case`, `sourceStageSlug: DialecticStageSlug.Thesis`, `targetKey: FileType.technical_approach` — a real cross-stage compression identity.
    * `[✅]`   `mockEnqueueRenderJob` widens its payload parameter to the union — no behavior change.

  * `[✅]`   `enqueueRenderJob.guard.test.ts`
    * `[✅]`   `isEnqueueRenderJobDeps`: assert it requires `'resolveTemplateFilename' in value` and `typeof value.resolveTemplateFilename === 'function'`, alongside the existing `shouldEnqueueRenderJob` cases.
    * `[✅]`   `isEnqueueRenderJobErrorReturn`: assert it accepts a `TemplateResolutionError` alongside `RenderJobValidationError` and `RenderJobEnqueueError`.
    * `[✅]`   `isEnqueueRenderCompressedContextPayload` accepts `buildEnqueueRenderCompressedContextPayload()` and a `sourceType: 'resource'` variant; rejects a non-record, `buildEnqueueRenderJobPayload()` (the existing member — structure alone discriminates), each of the five keys absent, `sourceType: 'feedback'` and `'history'` (text-mode sources are never rendered), `documentKey` failing `isFileType`, `docType`/`targetKey` failing `isModelContributionFileType`, and `sourceStageSlug` failing `isDialecticStageSlug`.
    * `[✅]`   `isDialecticRenderCompressedContextJobPayload` accepts `buildDialecticRenderCompressedContextJobPayload()`; rejects each of the twelve keys absent, a non-string `idempotencyKey`/`projectId`/`sessionId`/`template_filename`/`user_jwt`/`model_id`/`walletId`, a non-number `iterationNumber`, and a valid `DialecticRenderJobPayload`-shaped record (`documentIdentity`/`sourceContributionId` present, `targetKey`/`sourceType` absent) — the two row-payload shapes never cross-match.

  * `[✅]`   `enqueueRenderJob.guards.ts`
    * `[✅]`   `isEnqueueRenderJobDeps`: add `'resolveTemplateFilename' in value` to the required-key check and `typeof value.resolveTemplateFilename === 'function'` to the type check, alongside the existing `shouldEnqueueRenderJob` check.
    * `[✅]`   `isEnqueueRenderJobErrorReturn`: widen the return to `err instanceof RenderJobValidationError || err instanceof RenderJobEnqueueError || err instanceof TemplateResolutionError`, importing `TemplateResolutionError` alongside the existing errors import.
    * `[✅]`   Add `isEnqueueRenderCompressedContextPayload(value): value is EnqueueRenderCompressedContextPayload` — `isRecord`; the five keys present; `isCompressionSourceType(value.sourceType)` AND (`'contribution'` or `'resource'`), matching `isRenderCompressedContextParams`'s narrowing; `isFileType(value.documentKey)`; `isModelContributionFileType(value.docType)` and `(value.targetKey)`; `isDialecticStageSlug(value.sourceStageSlug)` — structured exactly like this file's `isEnqueueRenderJobPayload`.
    * `[✅]`   Add `isDialecticRenderCompressedContextJobPayload(value): value is DialecticRenderCompressedContextJobPayload` — twelve-key presence then per-field checks in the same style, reusing the same predicates; no new predicate is authored.

  * `[✅]`   `enqueueRenderJob.test.ts`
    * `[✅]`   Import `resolveTemplateFilename` (the real function, `_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts`) and `createResolveTemplateFilenameMock` (`resolveTemplateFilename.mock.ts`, prior node).
    * `[✅]`   Add one shared default: `const defaultResolveTemplateFilename = createResolveTemplateFilenameMock({ result: { templateFilename: 'thesis_business_case.md' } }).resolveTemplateFilename;` near the top of the file, alongside the existing `setupMockClient`/`baseParams`/`basePayload` helpers.
    * `[✅]`   Add `resolveTemplateFilename: defaultResolveTemplateFilename` to every `const deps: EnqueueRenderJobDeps = {...}` literal in this file EXCEPT the three named below — each currently omits the now-required field and the file will not compile until every one gains it. A complete edit across the file, not a representative sample.
    * `[✅]`   EXCEPTION 1 — `'template_filename extraction uses dialectic_stage_recipe_steps when instance is_cloned'`: its `deps` literal instead gets `resolveTemplateFilename: (params, payload) => resolveTemplateFilename({}, { dbClient: params.dbClient ?? dbClient }, payload)` — a closure over the REAL module bound to the same `dbClient` this test configures via `recipeChainConfig(true)` — so the test keeps proving real DB-query behavior (asserting `fromSpy` saw `dialectic_stage_recipe_steps`, not `dialectic_recipe_template_steps`) rather than a canned mock result.
    * `[✅]`   EXCEPTION 2 — `'... uses dialectic_recipe_template_steps when instance is not cloned'`: identical treatment with `recipeChainConfig(false)`.
    * `[✅]`   EXCEPTION 3 (new test) — `'enqueueRenderJob: a resolveTemplateFilename failure surfaces through enqueueRenderJob as the exact TemplateResolutionError object, untouched'`: configure `recipeChainConfig`-shaped mock data with `dialectic_stages` returning no row (the real module's stage-not-found branch), bind the REAL `resolveTemplateFilename` to that `dbClient` as in Exceptions 1 and 2, call `enqueueRenderJob`, and assert `'error' in result`, `result.error instanceof TemplateResolutionError` (NOT `RenderJobValidationError`, proving no reconstruction), and `result.error.message` matches the exact `"Failed to query stage for template_filename extraction: ..."` text `resolveTemplateFilename.test.ts` asserts for the identical fixture — the same object survives the round trip because it IS the same object.
    * `[✅]`   Do NOT add any test re-covering `resolveTemplateFilename`'s own failure branches; only the pass-through behavior is this file's concern.
    * `[✅]`   COMPRESS-dispatch happy path: `enqueueRenderJob(deps, buildEnqueueRenderJobParams(), buildEnqueueRenderCompressedContextPayload())` with `shouldEnqueueRenderJob` stubbed `{ shouldRender: true, reason: 'is_markdown' }` and `resolveTemplateFilename` stubbed `{ templateFilename: 'thesis_business_case.md' }` — assert `shouldEnqueueRenderJob` was called with `{ outputType: payload.docType, stageSlug: payload.sourceStageSlug }` (the SOURCE coordinates, not `params.outputType`/`params.stageSlug`), `resolveTemplateFilename` with the same source trio, and the insert spy saw `job_type: 'RENDER'`, `parent_job_id: params.jobId`, `stage_slug: params.stageSlug`, `idempotency_key` equal to the source-identity key from `objective`, and a `payload` passing `isDialecticRenderCompressedContextJobPayload` with `template_filename` equal to the stub's value and `stageSlug === params.stageSlug`; returns `{ renderJobId: <inserted id> }`.
    * `[✅]`   Not renderable: `shouldEnqueueRenderJob` stubbed `{ shouldRender: false, reason: 'is_json' }` → `{ renderJobId: null }`, insert never called.
    * `[✅]`   Decision-query failure: reason `'query_error'` on the compressed payload → `RenderJobEnqueueError`, `retriable: false`, insert never called — the same handling the EXECUTE branch's existing tests already prove.
    * `[✅]`   Template failure: `resolveTemplateFilename` returning a `TemplateResolutionError` on the compressed payload → the EXACT object returned (`instanceof` + message assertions, matching this file's existing pass-through test), insert never called.
    * `[✅]`   Idempotent re-dispatch: insert rejecting with code `23505` on `idempotency_key`, the recovery select returning an existing row → `{ renderJobId: <existing id> }` — proving the recovery lookup reads the source-identity key, not `${jobId}_render`.
    * `[✅]`   Discrimination: `buildEnqueueRenderJobPayload()` still drives the EXECUTE branch (`shouldEnqueueRenderJob` called with `params.outputType`/`params.stageSlug`), and a compressed payload never reads `needsContinuation`/`contributionId` — the two branches never cross.

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the exported function. Call order unchanged: pre-checks → (NEW) injected `resolveTemplateFilename` call, error passed through untouched on failure → `renderPayload` construction → insert — identical position to the block it replaces.
    * `[✅]`   COMPRESS branch order, selected on entry when `isEnqueueRenderCompressedContextPayload(payload)` (the existing body is the else path, order unchanged): renderability check via `shouldEnqueueRenderJob` (source coordinates; `is_json` or non-markdown → `{ renderJobId: null }`, query-failure → `RenderJobEnqueueError`) → `resolveTemplateFilename` (source coordinates; error passed through untouched) → build `DialecticRenderCompressedContextJobPayload` and the source-identity `idempotencyKey` → flow into the SHARED tail (payload-guard and `isJson` validation, insert, 23505 recovery, programmer-vs-transient split, row-id check, return).

  * `[✅]`   `enqueueRenderJob.ts` (Implementation)
    * `[✅]`   Add `resolveTemplateFilename` to the destructured `deps`: `const { dbClient, logger, shouldEnqueueRenderJob, resolveTemplateFilename } = deps;`.
    * `[✅]`   Delete the `let templateFilename` declaration, the entire `try { ... } catch { ... }` walk, and the final defensive check.
    * `[✅]`   Insert the four-step replacement from `objective` at the same position.
    * `[✅]`   Discriminate at entry, after the deps and params destructure: `isEnqueueRenderCompressedContextPayload(payload)` selects the new branch; the existing `payload.needsContinuation` early-return and everything below it are the else path, byte-identical except the `idempotencyKey` hoist.
    * `[✅]`   Implement the branch per `construction`: it produces its own `renderPayload` (validated with `isDialecticRenderCompressedContextJobPayload` and `isJson`, mirroring the EXECUTE branch's validation) and its own `idempotencyKey`; both branches then share the insert and recovery tail — hoist the literal `${jobId}_render` into the per-branch `idempotencyKey` local, EXECUTE value unchanged.
    * `[✅]`   New imports: `sanitizeForPath` from `../../_shared/utils/path_constructor.ts`; `isEnqueueRenderCompressedContextPayload` and `isDialecticRenderCompressedContextJobPayload` from `./enqueueRenderJob.guards.ts`; the two new types from `./enqueueRenderJob.interface.ts`.
    * `[✅]`   Nothing else in this file changes beyond the entry discrimination, the branch body, the replaced walk, and the `idempotencyKey` hoist.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: worker orchestration (RENDER spawn). Deps inward: `resolveTemplateFilename` (injected) and `sanitizeForPath` (pure, direct import from `_shared/utils`). Provides outward through `enqueueRenderJob.provides.ts`'s existing `export *` surface: `EnqueueRenderJobDeps`'s new required field and `EnqueueRenderJobErrorReturn`'s widened union to `netlifyResponse/index.ts`; `EnqueueRenderCompressedContextPayload` to `saveResponse`; `DialecticRenderCompressedContextJobPayload` and both new guards to `processRenderJob`.
    * `[✅]`   No import from outside `_shared/` and this module; no cycle.

  * `[✅]`   `requirements` (binary, observable)
    * `[✅]`   `enqueueRenderJob` produces byte-identical `renderPayload.template_filename` values to before the swap, for both cloned and non-cloned recipe instances.
    * `[✅]`   A `resolveTemplateFilename` failure surfaces through `enqueueRenderJob` as the EXACT `TemplateResolutionError` object it was produced as (`instanceof TemplateResolutionError`, not `RenderJobValidationError`), with `retriable: false`.
    * `[✅]`   `resolveTemplateFilename` is a required, injected `EnqueueRenderJobDeps` field with no default; `EnqueueRenderJobErrorReturn.error` accepts all three error classes.
    * `[✅]`   Every existing test in `enqueueRenderJob.test.ts` passes once the field addition lands; one new behavioral test is added (the pass-through proof) and the two success-path tests are rebound to the real module.
    * `[✅]`   An `EnqueueRenderCompressedContextPayload` call with a renderable source (`is_markdown`) inserts exactly one `job_type:'RENDER'` row with `parent_job_id` = the COMPRESS job id, the source-identity `idempotency_key`, and a payload passing `isDialecticRenderCompressedContextJobPayload` whose `template_filename` came from `resolveTemplateFilename` over the SOURCE coordinates.
    * `[✅]`   A non-renderable source (`is_json`) returns `{ renderJobId: null }` with no insert; a decision-query failure returns a non-retriable `RenderJobEnqueueError`; a template failure returns the exact `TemplateResolutionError` object.
    * `[✅]`   A duplicate dispatch for the same source identity recovers the existing child row id through the 23505 path instead of inserting a second row.
    * `[✅]`   Every existing EXECUTE-branch test passes unmodified, including the byte-identical `${jobId}_render` idempotency key.

* `[✅]`   supabase/functions/_shared/services/document_renderer/renderDocument/`renderDocument.ts` **[BE] Relocate the renderDocument orchestrator out of the document_renderer.ts monolith into its own function-folder module — unchanged public signature `(dbClient, deps, params)`, delegating to the four already-extracted modules for chain assembly/template loading/chunk merging/structured rendering while keeping the persist-as-RenderedDocument + render_completed notification tail verbatim — then DELETE the monolith and its loose satellite files and repoint every importer — and render the CompressedContext-source case: one canonical raw-JSON artifact in (no chain assembly), one rendered `.md` out as FileType.CompressedContext to the consuming stage's `_work` (no render_completed notification), selected by a widened params union with its own guard**

  * `[✅]`   `objective`
    * `[✅]`   Solve the monolith's remaining responsibility. `renderDocument` is now a thin orchestrator over four extracted modules (`assembleContributionChain`, `loadDocumentTemplate`, `mergeChunkContent`, `renderStructuredDocument`) plus one range no other module claims — the persist-as-`RenderedDocument` and `render_completed` notification tail. Leaving `document_renderer.ts` as a facade that merely re-exports would strand a file whose body is dead weight and an attractive nuisance for future edits, so the monolith is DELETED.
    * `[✅]`   This is NOT a pure function (DB, storage, and notification I/O throughout) — it gets the complete function-folder module: interface, mock, guard, guard test, unit test, integration test. It does NOT get `.provides.ts`. It gets BOTH a unit `.test.ts` (the orchestrator with its four siblings MOCKED — wiring, order, error-passthrough, tail) AND a persistent `.integration.test.ts` (the full monolith suite over REAL siblings, only DB/storage mocked). Its entire behavior IS a composition of four siblings across DB/storage/notification boundaries, so the chain needs a durable integration guard that a future mis-wiring cannot silently pass; the one-time oracle run proves equivalence at relocation, and the retained integration suite protects the composition thereafter.
    * `[✅]`   Functional goal: copy the signature and param destructure, and the path-context construction, persistence, and notification tail, VERBATIM; replace the four extracted ranges (chain assembly, template load, chunk merge, structured render) with calls into the four sibling modules. Public signature, `RenderDocumentParams`, and `RenderDocumentResult` are UNCHANGED — every importer continues to call `ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params)` exactly as today, so the external contract is a no-op for every consumer except the import path.
    * `[✅]`   `DocumentRendererDeps` gains THREE new fields (`assembleContributionChain: AssembleContributionChainFn`, `loadDocumentTemplate: LoadDocumentTemplateFn`, `mergeChunkContent: MergeChunkContentFn`). Injection is the only rule-compliant seam for the mandated four-siblings-MOCKED unit test: a statically-imported ES-module binding has no `stub()` seam (module namespace exports are immutable), and the three siblings' `error: Error` returns must be rethrown identity-equal per `.github/instructions/error-handling.instructions.md`, which is only assertable if the test injects a stub returning a known object reference. `renderStructuredDocument` is NOT injected — pure, total, no error arm, no identity contract — it stays the ONE direct import. Each injected sibling's sub-`Deps` is built at the call site from fields `DocumentRendererDeps` already carries: `deps.assembleContributionChain({}, ...)`, `deps.loadDocumentTemplate({ downloadFromStorage: deps.downloadFromStorage }, ...)`, `deps.mergeChunkContent({ downloadFromStorage: deps.downloadFromStorage, logger: deps.logger }, ...)`, each with its own `Params`/`Payload` constructed inline from `params`/`dbClient`/`deps`.
    * `[✅]`   Error-passthrough contract for the three Return-based calls: `renderDocument.ts` stays throw-based (unchanged `Promise<RenderDocumentResult>`, no `Return` union). Each `{ error, retriable }` returned by `assembleContributionChain`/`loadDocumentTemplate`/`mergeChunkContent` is surfaced as `throw result.error;` — the exact object, never reconstructed into a new `Error` or message. `retriable` has no home in a throw-based contract and is dropped at this boundary. `renderStructuredDocument` is a total pure function with no error path and is called directly with no error handling around it.
    * `[✅]`   The copied tail carries no error-handling defect to fix. The `uploadResult.error` branch constructs a throwable `Error` from a plain `ServiceError` DATA SHAPE returned by `fileManager.uploadAndRegisterFile` — a necessary first construction of an `Error`, not a received `Error` being discarded, so it stays as-is. The upload `catch` already rethrows the caught value unmodified. The notification `catch` logs and swallows both the fresh "missing model_id" throw and any `sendJobNotificationEvent` failure — best-effort behavior so a successfully-persisted render never fails on a notification hiccup, preserved exactly.
    * `[✅]`   `ContributionRowMinimal` re-homes to `renderDocument.interface.ts` as part of this module's public type surface, though `renderDocument.ts` never constructs a value of this type (the original does not either — it uses `DialecticContributionRow` throughout). No sibling module claims it.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   `renderDocument.ts` trusts `assembleContributionChain`'s non-empty `orderedChunks` guarantee for its own `base = orderedChunks[0]` use in the path-context and persistence tail — that module returns a fresh error before ever returning an empty array — so no redundant empty-check is added here.
      * `[✅]`   `modelSlug`, `attemptCount`, `sourceGroupFragment`, and `sourceAnchorModelSlug` are consumed directly from `assembleContributionChain`'s success return; the inline derivation they required is not reproduced here.
      * `[✅]`   Byte-encoding (`new TextEncoder().encode(rendered)`) stays this orchestrator's responsibility.
    * `[✅]`   Functional goal, COMPRESS case:
      * `[✅]`   Widen the params: `RenderDocumentFn` accepts `RenderDocumentParams | RenderCompressedContextParams`, discriminated ON ENTRY by the new member's owned guard `isRenderCompressedContextParams` — the params structure BY ITSELF selects the branch; no flag, no new deps field.
      * `[✅]`   `RenderCompressedContextParams` carries exactly the identity tuple `constructStoragePath`'s compression arm requires: `{ projectId: string; sessionId: string; iterationNumber: number; stageSlug: DialecticStageSlug; targetKey: ModelContributionFileTypes; sourceType: CompressionSourceType; documentKey: FileType; template_filename: string }` — `stageSlug` is the CONSUMING stage. NO chunk fields: map-reduce chunks are always `mode:'text'` and text artifacts are never rendered, so a compressed render is always the single, final, json-mode artifact. NO `sourceId`: json-mode sources are `'contribution'` or `'resource'`, whose path identity is `documentKey`.
      * `[✅]`   Locate the input with the same `(storage_path, file_name)` key the dedup layers use: `constructStoragePath({ projectId, fileType: FileType.CompressedContextRawJson, sessionId, iteration: iterationNumber, stageSlug, targetKey, sourceType, documentKey })` → query `dialectic_project_resources` by `(storage_path, file_name)` selecting `id, storage_bucket, storage_path, file_name` → `deps.downloadFromStorage(dbClient, row.storage_bucket, row.storage_path + '/' + row.file_name)`.
      * `[✅]`   Normalize the record exactly as `mergeChunkContent` does for one source, so the output is format-identical to an uncompressed render: `sanitizeJsonContent` (already imported) → `JSON.parse` → unwrap `isRecord(parsed.content) ? parsed.content : parsed` and delete `continuation_needed`/`stop_reason` → join non-empty string arrays with `'\n\n'`.
      * `[✅]`   Persist through shared machinery, never an inline context literal: `buildUploadContext`'s resource arm builds the `ResourceUploadContext` (`storageFileType: FileType.CompressedContext`, `contentForStorage: rendered`, `projectOwnerUserId: deps.notifyUserId`), the return is narrowed with `isResourceContext`, and `deps.fileManager.uploadAndRegisterFile` writes it — the resource upsert on `(storage_bucket, storage_path, file_name)` makes the write idempotent, and `file_manager.ts` defaults `resource_type` to `pathContext.fileType`.
      * `[✅]`   Send NO notification on this branch; return `{ pathContext, renderedBytes }` exactly like the existing case.
      * `[✅]`   The widening is compile-safe for the existing caller, which constructs the existing member; the new member's producer is `processRenderJob`, the next node.

  * `[✅]`   `role`
    * `[✅]`   The surviving orchestrator for `_shared/services/document_renderer/` — the ONE module with DB, storage, AND notification I/O in this sub-tree, composing the four pure/narrow sibling modules into the exact end-to-end behavior `document_renderer.ts` provided, and the ONLY module in this sub-tree exposed through `IDocumentRenderer`/`IJobContext.documentRenderer`.
    * `[✅]`   Out of scope: any of the four siblings' own internal logic (chain assembly, template loading, chunk merging, structured rendering) — this module calls them, it does not reimplement or re-validate their internals.
    * `[✅]`   In scope (COMPRESS): the CompressedContext-source render case — a compressed document IS the same document it always was (same `documentKey`, same template, same render pipeline) with condensed content; only the input source (one canonical raw-JSON resource instead of a contribution chain) and the destination (`FileType.CompressedContext` in the consuming stage's `_work` instead of `FileType.RenderedDocument`) differ. The case is selected by params structure via `isRenderCompressedContextParams`, persisted through `deps.fileManager`, and sends NO notification. Out of scope for this case: producing the raw artifact and checking completeness (`saveResponse`), dispatching the RENDER job (`enqueueRenderJob`), consuming the dispatched row (`processRenderJob`).

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/_shared/services/document_renderer/renderDocument/` plus FOUR deletions (`document_renderer.ts`, `.interface.ts`, `.mock.ts`, `verify_renderer.ts`) and TWO in-place renames (`document_renderer.test.ts` → `renderDocument.integration.test.ts`, `document_renderer.examples.test.ts` → `renderDocument.examples.integration.test.ts`, both repointed and retained in full).
    * `[✅]`   Inside boundary: signature and param destructure, delegation to the four sibling modules, path-context construction, persistence via `fileManager`, `render_completed` notification, and the COMPRESS-case guard.
    * `[✅]`   Outside boundary: contribution-chain querying, template DB/storage lookup, chunk download/sanitize/merge, structured-record-to-Markdown rendering — all four live in their own sibling modules; COMPRESS response persistence, completeness and continuation, and RENDER-job dispatch.

  * `[✅]`   `deps`
    * `[✅]`   `DocumentRendererDeps`: `{ downloadFromStorage; fileManager; notificationService; notifyUserId; logger; assembleContributionChain; loadDocumentTemplate; mergeChunkContent }` — provided by `processRenderJob.ts` from `IRenderJobContext`. The COMPRESS branch adds NO field: it needs only `downloadFromStorage`, `fileManager`, `logger`, `notifyUserId`, and `loadDocumentTemplate`, all already present.
    * `[✅]`   `renderStructuredDocument` is the ONE direct sibling import (pure, total); the three Return-based siblings are injected via `DocumentRendererDeps`. The COMPRESS branch adds two more pure direct imports on the same reasoning: `constructStoragePath` (`_shared/utils/path_constructor.ts`) and `buildUploadContext` (`_shared/utils/buildUploadContext/buildUploadContext.ts`).
    * `[✅]`   The params union puts a runtime discrimination at this function's entry, so the new member gets an owned guard, `isRenderCompressedContextParams`, consumed on entry here and by `processRenderJob`. `RenderDocumentParams` and `DocumentRendererDeps` remain unguarded.
    * `[✅]`   Confirm: no reverse dependency (this module imports FROM its four siblings, never the other direction); no lateral violation — it does not import from `dialectic-worker/`.

  * `[✅]`   `renderDocument.interface.test.ts` (add the new member's contract steps in this file's all-keys-present style)
    * `[✅]`   New test: `RenderCompressedContextParams` surface — `Record<keyof RenderCompressedContextParams, true>` over the eight keys named in `objective`, length 8.
    * `[✅]`   New test: a full literal (`stageSlug: DialecticStageSlug.Thesis`, `targetKey: FileType.business_case`, `sourceType: 'contribution'`, `documentKey: FileType.business_case`, `template_filename: 'thesis_business_case.md'`) type-checks and round-trips its values.
    * `[✅]`   New test: union assignability — a value of type `RenderCompressedContextParams` assigns to `Parameters<RenderDocumentFn>[2]`; RED until the interface widens.

  * `[✅]`   `renderDocument.interface.ts` (re-homing + the params-union widening)
    * `[✅]`   Re-home VERBATIM from `document_renderer.interface.ts`: `ContributionRowMinimal`, `RenderDocumentParams` (`{ projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey: FileType, sourceContributionId, template_filename }`), `RenderDocumentResult` (`{ pathContext: PathContext, renderedBytes: Uint8Array }`), `DocumentRendererDeps`, `RenderDocumentFn` (`(dbClient, deps, params) => Promise<RenderDocumentResult>`), `IDocumentRenderer` (`{ renderDocument: RenderDocumentFn }`) — zero shape changes to any of the six; only the file's own relative import paths shift for the new nesting depth.
    * `[✅]`   `DownloadedChunkText` is NOT re-homed here — it lives in `mergeChunkContent.interface.ts`, and chunk-text handling is entirely internal to that module.
    * `[✅]`   Add `export type RenderCompressedContextParams` with the eight fields named in `objective` (type-only imports `ModelContributionFileTypes` and `CompressionSourceType` join the existing `file_manager.types.ts` import); widen `RenderDocumentFn`'s params to `RenderDocumentParams | RenderCompressedContextParams` and `renderDocument`'s own signature with it; `RenderDocumentParams`, `RenderDocumentResult`, `DocumentRendererDeps`, `IDocumentRenderer`, and `ContributionRowMinimal` are unchanged.

  * `[✅]`   `renderDocument.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[✅]`   Called by: `processRenderJob.ts` via `ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params)` (unchanged call site, one call per RENDER job), itself reached from `dialectic-worker/index.ts`'s `defaultProcessors` wiring (unchanged).
    * `[✅]`   Required interaction, in order: one call to `assembleContributionChain` (one `dialectic_contributions` read), one call to `loadDocumentTemplate` (two reads + one storage download), one call to `mergeChunkContent` (N storage downloads, one per ordered chunk), one direct call to `renderStructuredDocument` (pure, no I/O), one `fileManager.uploadAndRegisterFile` write, one best-effort `notificationService.sendJobNotificationEvent` call.
    * `[✅]`   Failure modes: any `{error}` from the three Return-based calls propagates as `throw result.error` (unmodified); a `fileManager.uploadAndRegisterFile` DB-registration failure or thrown exception during upload propagates as a thrown `Error` (verbatim copy of the original's own construction, per `objective`); a missing `base.model_id` or notification-send failure is logged and swallowed, never thrown (pre-existing behavior, preserved).
    * `[✅]`   COMPRESS branch — condition: `isRenderCompressedContextParams(params)`; required interaction, in order: one `dialectic_project_resources` read (canonical-path lookup), one storage download (the raw JSON), one `deps.loadDocumentTemplate` call, one direct `renderStructuredDocument` call, one `buildUploadContext` call, one `deps.fileManager.uploadAndRegisterFile` write; NO `assembleContributionChain`, NO `mergeChunkContent`, NO notification call; outcome `{ pathContext, renderedBytes }`.
    * `[✅]`   COMPRESS-branch failure modes: a received error (resources query error, `downloadFromStorage` error, `loadDocumentTemplate`'s `{error}`) is thrown identity-equal; a missing resource row, empty download, invalid sanitization result, `JSON.parse` failure, non-record parse, or `isResourceContext` narrow failure is a fresh, thrown `Error`, matching this function's throw-based contract; an `uploadAndRegisterFile` error return throws via the same ServiceError-to-Error conversion the existing branch uses; every error short-circuits before the upload except the upload's own.

  * `[✅]`   `renderDocument.mock.ts`
    * `[✅]`   Re-home `createDocumentRendererMock` VERBATIM from `document_renderer.mock.ts` (options `{ handler?, defaultResult? }`, returns `{ renderer, calls }`, default result reflects input `params` in its `pathContext` exactly as today) — only its own import paths shift for the new nesting depth; behavior and shape unchanged.
    * `[✅]`   Add `buildRenderCompressedContextParams(overrides?)` + `invalidateRenderCompressedContextParams(corruptions)` mirroring `buildRenderDocumentParams`'s defaults-plus-overrides shape, defaulting to the interface-test literal (`Thesis`, `business_case`, `'contribution'`).

  * `[✅]`   `renderDocument.guard.test.ts` (NEW file)
    * `[✅]`   `isRenderCompressedContextParams` accepts `buildRenderCompressedContextParams()` and a `sourceType: 'resource'` variant.
    * `[✅]`   Rejects: a non-record; `buildRenderDocumentParams()` (the existing member — `targetKey`/`sourceType` absent); each of the eight keys absent (destructure-omission style); non-string `projectId`/`sessionId`/`template_filename`; non-number `iterationNumber`; `stageSlug` failing `isDialecticStageSlug`; `targetKey` failing `isModelContributionFileType`; `sourceType: 'feedback'` and `'history'` (json-mode sources only — never renderable); `documentKey` failing `isFileType`.

  * `[✅]`   `renderDocument.guard.ts` (NEW file)
    * `[✅]`   `export function isRenderCompressedContextParams(value: unknown): value is RenderCompressedContextParams` — `isRecord`; non-empty strings `projectId`/`sessionId`/`template_filename`; `iterationNumber` number; `isDialecticStageSlug(value.stageSlug)`; `isModelContributionFileType(value.targetKey)`; `isCompressionSourceType(value.sourceType)` AND (`value.sourceType === 'contribution' || value.sourceType === 'resource'`); `isFileType(value.documentKey)` — every predicate reused from `type_guards.file_manager.ts`/`type_guards.ts`, never re-authored.

  * `[✅]`   `renderDocument.test.ts` (Unit — the orchestrator's OWN wiring, four siblings MOCKED)
    * `[✅]`   Purpose: pin the orchestration contract independently of sibling behavior — the wiring, passthrough, and tail that is `renderDocument`'s entire own logic. Several assertions are only possible with mocked siblings: forcing a `loadDocumentTemplate` error object to prove exact-object passthrough needs a mock, not a contrived storage failure. Stubs the four siblings (`assembleContributionChain`, `loadDocumentTemplate`, and `mergeChunkContent` as `Fn`s returning canned `Success`/`Error` shapes; `renderStructuredDocument` as a stub pure fn) plus `fileManager` and `notificationService`.
    * `[✅]`   Asserts: (1) each sibling is called exactly once, in `construction` order, with the arguments those steps name — `assembleContributionChain` receives `{ sessionId, iterationNumber, stageSlug, documentIdentity }`; `loadDocumentTemplate` receives `{ projectId, templateFilename: params.template_filename }` and `{ downloadFromStorage }`; `mergeChunkContent` receives `{ orderedChunks }` and `{ downloadFromStorage, logger }`; `renderStructuredDocument` receives `templateText`, `mergedStructuredData`, `documentKey`. (2) Error-passthrough: when any of the three Return-based siblings returns `{ error, retriable }`, `renderDocument` throws THAT EXACT object (identity-equal, never reconstructed) and short-circuits — no later sibling and no `fileManager.uploadAndRegisterFile` call. (3) Tail on the all-success path: `fileManager.uploadAndRegisterFile` called once with the `ResourceUploadContext` and `pathContext` the persistence step builds, the delegated `modelSlug`, `attemptCount`, `sourceGroupFragment`, and `sourceAnchorModelSlug` flowing through unchanged; an `uploadAndRegisterFile` error return throws; `notificationService.sendJobNotificationEvent` fires once with the `render_completed` shape; a missing `base.model_id` or a notification-send failure is logged and swallowed, never thrown.
    * `[✅]`   Do NOT re-test in this unit tier: any sibling's internal behavior (chain ordering, dedupe, DB filter predicates, chunk-merge JSON parsing and sanitization, template-query disambiguation, per-item versus flat rendering strategy, comment stripping) — the siblings are mocked here, their internals are covered by their own unit tests, and the real composition is exercised by `renderDocument.integration.test.ts`.
    * `[✅]`   COMPRESS-branch cases (siblings mocked; `createMockSupabaseClient` seeds the `dialectic_project_resources` row; `createMockDownloadFromStorage` returns the raw compressed JSON):
      * `[✅]`   Happy path: `assembleContributionChain`/`mergeChunkContent` spies NEVER called; the resources query filters on the exact `(storage_path, file_name)` `constructStoragePath` produces for `FileType.CompressedContextRawJson`; `downloadFromStorage` called with the row's `storage_bucket` and `storage_path/file_name`; `loadDocumentTemplate` receives `{ projectId, templateFilename: params.template_filename }`; `renderStructuredDocument` receives the unwrapped, normalized record and `params.documentKey`; `uploadAndRegisterFile` called once with `pathContext.fileType === FileType.CompressedContext`, the full identity tuple, `userId === deps.notifyUserId`, `mimeType 'text/markdown'`; `sendJobNotificationEvent` NEVER called; the return matches the upload.
      * `[✅]`   Normalization: a `{ content: {...} }` body renders identically to the bare record (unwrap rule); a key holding a non-empty string array is joined with `'\n\n'` before render; `continuation_needed`/`stop_reason` never reach the renderer.
      * `[✅]`   Error cases: resources query error rethrown identity-equal; no matching row → fresh `Error` naming the canonical path; download error rethrown identity-equal; `loadDocumentTemplate` `{error}` rethrown identity-equal; unparseable/non-record body → fresh thrown `Error`; upload error return → thrown `Error` via the existing conversion; every pre-upload error short-circuits before `uploadAndRegisterFile`.

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the exported function. Sequential order, delegating in place of the four extracted ranges, tail otherwise identical to the original's order:
      1. Destructure `params` exactly as the monolith does.
      2. `const chainResult = await deps.assembleContributionChain({}, { dbClient }, { sessionId, iterationNumber, stageSlug, documentIdentity });` → `'error' in chainResult` → `throw chainResult.error;`; else destructure `{ orderedChunks, modelSlug, attemptCount, sourceGroupFragment, sourceAnchorModelSlug }`.
      3. `const templateResult = await deps.loadDocumentTemplate({ downloadFromStorage: deps.downloadFromStorage }, { dbClient }, { projectId, templateFilename: params.template_filename });` → `'error' in templateResult` → `throw templateResult.error;`; else destructure `{ templateText }`.
      4. `const mergeResult = await deps.mergeChunkContent({ downloadFromStorage: deps.downloadFromStorage, logger: deps.logger, sanitizeJsonContent }, { dbClient }, { orderedChunks });` → `'error' in mergeResult` → `throw mergeResult.error;`; else destructure `{ mergedStructuredData }`.
      5. `const rendered = renderStructuredDocument(templateText, mergedStructuredData, documentKey);` — direct call, no error path.
      6. `const renderedBytes = new TextEncoder().encode(rendered);`.
      7. `const base = orderedChunks[0];` — trusting `assembleContributionChain`'s non-empty guarantee, no re-validation. Build `pathContext` and `uploadContext` and call `deps.fileManager.uploadAndRegisterFile`, copying the monolith's persistence block verbatim except that the `base.storage_bucket`-derived locals are gone (`mergeChunkContent` handles storage internally) and the delegated `modelSlug`, `attemptCount`, `sourceGroupFragment`, and `sourceAnchorModelSlug` stand in for the original's inline-derived locals of the same names.
      8. Send the `render_completed` notification — the monolith's block verbatim, log-and-swallow preserved.
      9. `return { pathContext, renderedBytes };`.
    * `[✅]`   COMPRESS branch, selected on entry when `isRenderCompressedContextParams(params)` (the steps above are the else path):
      1. `const artifact = constructStoragePath({ projectId, fileType: FileType.CompressedContextRawJson, sessionId, iteration: iterationNumber, stageSlug, targetKey, sourceType, documentKey });` — pure direct import; its identity throws propagate on this throw-based contract.
      2. Query `dialectic_project_resources` `.select('id, storage_bucket, storage_path, file_name').eq('storage_path', artifact.storagePath).eq('file_name', artifact.fileName).maybeSingle()` → query error → `throw error;`; no row → fresh `Error` naming the canonical path.
      3. `deps.downloadFromStorage(dbClient, row.storage_bucket, row.storage_path + '/' + row.file_name)` → error → `throw error;`; no data → fresh `Error`; decode with `TextDecoder`.
      4. `sanitizeJsonContent` → invalid result → fresh `Error`; `JSON.parse` → failure or non-record → fresh `Error`; unwrap `isRecord(parsed.content) ? parsed.content : parsed`; delete `continuation_needed`/`stop_reason`; join non-empty string arrays with `'\n\n'` — the single-source mirror of `mergeChunkContent`'s unwrap and array-join rules.
      5. `deps.loadDocumentTemplate({ downloadFromStorage: deps.downloadFromStorage }, { dbClient }, { projectId, templateFilename: params.template_filename });` → `'error' in result` → `throw result.error;`.
      6. `const rendered = renderStructuredDocument(templateText, record, params.documentKey);` → `const renderedBytes = new TextEncoder().encode(rendered);`.
      7. `const context = buildUploadContext({ projectId, storageFileType: FileType.CompressedContext, sessionId, iterationNumber, stageSlug, targetKey, sourceType, documentKey, sourceId: undefined, chunkIndex: undefined, chunkTotal: undefined, contentForStorage: rendered, projectOwnerUserId: deps.notifyUserId, description: 'Compressed context for ' + stageSlug + ':' + String(targetKey) });` → narrow with `isResourceContext` (fresh `Error` on failure) → `deps.fileManager.uploadAndRegisterFile(context)` → `uploadResult.error` → throw via the same ServiceError-to-Error conversion the existing branch uses.
      8. No notification. `const pathContext: PathContext = context.pathContext;` → `return { pathContext, renderedBytes };`.

  * `[✅]`   `renderDocument.ts` (Implementation)
    * `[✅]`   Direct import: `renderStructuredDocument` only; the three Return-based siblings arrive via `deps`.
    * `[✅]`   Copy the monolith's signature, `RenderDocumentFn`-shaped export, and param destructure verbatim.
    * `[✅]`   Replace the chain-assembly range with construction step 2, the template-load range with step 3, the chunk-merge range with step 4, and the structured-render range with step 5.
    * `[✅]`   Copy the byte-encode, path-context, persist, and notify tail verbatim, with only the identifier substitutions construction step 7 names — delegated scalars in place of inline-derived ones.
    * `[✅]`   `export default { renderDocument };` — the module's existing default-export shape, preserved.
    * `[✅]`   Add the COMPRESS branch per `construction`'s branch steps, guarded on entry by `isRenderCompressedContextParams`; the existing body is the else path, unchanged. New imports: `constructStoragePath` from `../../../utils/path_constructor.ts`, `buildUploadContext` from `../../../utils/buildUploadContext/buildUploadContext.ts`, `isRecord` from `../../../utils/type_guards.ts`, `isResourceContext` from `../../../utils/type-guards/type_guards.file_manager.ts`, `isRenderCompressedContextParams` from `./renderDocument.guard.ts`; `sanitizeJsonContent` is already imported.

  * `[✅]`   `renderDocument.integration.test.ts` (chain-integration regression guard — the full monolith suite, retained permanently)
    * `[✅]`   The suite runs through `renderDocument`'s unchanged `(dbClient, deps, params)` signature with the REAL `assembleContributionChain`, `loadDocumentTemplate`, `mergeChunkContent`, and `renderStructuredDocument` underneath — only the Supabase client and `downloadFromStorage` are mocked, the two genuine external boundaries. It fails the instant an edit mis-wires the orchestrator: a wrong sibling argument, a dropped scalar, a reversed delegation — the class of defect no sibling unit test can catch. Every baseline case is retained; the siblings' own unit tests are additive part-in-isolation coverage, never a replacement.
    * `[✅]`   COMPRESS end-to-end case (real `loadDocumentTemplate`, `renderStructuredDocument`, `buildUploadContext`, and `constructStoragePath`, only DB/storage mocked, like every case above): seed the mock DB with a `dialectic_project_resources` row at the canonical raw-JSON path and route that path's download to a compressed `{ content: {...} }` body whose keys match `REAL_THESIS_BUSINESS_CASE_TEMPLATE`'s sections; call `renderDocument` with `RenderCompressedContextParams`; assert ONE upload whose `pathContext` carries the CompressedContext identity tuple (`fileType`, `targetKey`, `sourceType`, `documentKey`), whose `(storage_path, file_name)` from `constructStoragePath` end in `/_work` and `_compressed_for_<targetKey>.md`, and whose decoded body contains the compressed values under the template's section headers — format-identical to an uncompressed render of the same record; `sendJobNotificationEvent` never called.

  * `[✅]`   Deletion + rename (ride this node)
    * `[✅]`   DELETE `supabase/functions/_shared/services/document_renderer.ts`, `document_renderer.interface.ts`, `document_renderer.mock.ts`, and `supabase/functions/_shared/services/verify_renderer.ts` — only after the repointed monolith suites run green, confirming zero behavioral drift.
    * `[✅]`   RENAME, retaining every case: `document_renderer.test.ts` → `renderDocument/renderDocument.integration.test.ts` and `document_renderer.examples.test.ts` → `renderDocument/renderDocument.examples.integration.test.ts`, both repointed at the new import paths.
    * `[✅]`   Repoint the importers of the deleted files — `dialectic-worker/index.ts`, `dialectic-worker/index.test.ts`, `dialectic-service/dialectic.interface.ts`, `createJobContext/JobContext.interface.ts`, `createJobContext/JobContext.mock.ts`, `createJobContext/createJobContext.interface.test.ts` — import-path only, zero behavior change. `processRenderJob.ts` is not in this list: its repoint aggregates into its own node, next.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: shared service (I/O-boundary orchestrator). Deps inward: `DocumentRendererDeps`, provided by `dialectic-worker/index.ts`; the three Return-based siblings injected through it; `renderStructuredDocument` directly. Provides outward: `renderDocument` and `IDocumentRenderer` to `dialectic-worker/index.ts` and, transitively via `IJobContext.documentRenderer`, to `processRenderJob.ts`.
    * `[✅]`   The COMPRESS branch adds one inward DB read (`dialectic_project_resources` via the injected `dbClient`) and two pure inward imports (`constructStoragePath`, `buildUploadContext`, both `_shared/utils`); no import from `dialectic-worker/`, no cycle.

  * `[✅]`   `requirements` (binary, observable)
    * `[✅]`   Every retained monolith case passes: `renderDocument` under the delegated implementation produces byte-identical `renderedBytes` and `pathContext` to the monolith, for the full baseline fixture set.
    * `[✅]`   Any `{error}` returned by `assembleContributionChain`, `loadDocumentTemplate`, or `mergeChunkContent` is thrown as the exact received object — never reconstructed.
    * `[✅]`   `DocumentRendererDeps` carries exactly `assembleContributionChain`, `loadDocumentTemplate`, and `mergeChunkContent` beyond its original five fields and nothing more; `processRenderJob.ts`'s `rendererDeps` construction supplies them from `IRenderJobContext`.
    * `[✅]`   `document_renderer.ts`, `.interface.ts`, `.mock.ts`, and `verify_renderer.ts` no longer exist in the repository; `document_renderer.test.ts` and `document_renderer.examples.test.ts` survive as the renamed, repointed `renderDocument.integration.test.ts` and `renderDocument.examples.integration.test.ts` with the full case set retained.
    * `[✅]`   Every repointed importer resolves against the new module paths with no other line changed in any of them.
    * `[✅]`   `ContributionRowMinimal` is re-homed to `renderDocument.interface.ts` verbatim.
    * `[✅]`   Given `RenderCompressedContextParams` and a seeded canonical raw-JSON artifact, `renderDocument` persists exactly one `FileType.CompressedContext` `.md` at the canonical `_work` path, calls neither `assembleContributionChain` nor `mergeChunkContent`, sends no notification, and returns the matching `{ pathContext, renderedBytes }`.
    * `[✅]`   A second identical call upserts to the same `(storage_bucket, storage_path, file_name)` — idempotent, no duplicate row.
    * `[✅]`   `isRenderCompressedContextParams` accepts/rejects per its guard tests; a `RenderDocumentParams` value never selects the COMPRESS branch.
    * `[✅]`   Every pre-existing relocation assertion in both retained suites still passes; `processRenderJob.ts` compiles unchanged against the widened params union.

* `[✅]`   supabase/functions/dialectic-worker/`processRenderJob.ts` **[BE] Process a compressed RENDER row: discriminate the compressed job payload ahead of the contribution-shaped entry gate, project it into RenderCompressedContextParams, render through the same documentRenderer seam the contribution case uses, and complete the row with no notification of any kind**

  * `[✅]`   `objective`
    * `[✅]`   Solve the unprocessable compressed RENDER row. The entry gate rejects any payload failing `isDialecticRenderJobPayload` and throws `'Invalid payload'`; a `DialecticRenderCompressedContextJobPayload` carries `targetKey`/`sourceType` and carries neither `documentIdentity` nor `sourceContributionId`, so every row `enqueueRenderJob`'s COMPRESS branch inserts fails that gate and is written `failed`. The row is dispatchable and the render itself exists; only the processor's ability to recognise and route the row is missing.
    * `[✅]`   Functional goals:
      * `[✅]`   Select the compressed case by payload structure alone, using `isDialecticRenderCompressedContextJobPayload`, ahead of the existing gate — the row's shape is the discriminator, there is no flag.
      * `[✅]`   Build `RenderCompressedContextParams` as a direct field projection of the narrowed payload: `projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `targetKey`, `sourceType`, `documentKey`, `template_filename`. Every one of the eight is present on the row payload under the same name, so the projection is a copy with no transformation, no defaulting, and no derivation.
      * `[✅]`   Build `DocumentRendererDeps` from `ctx` exactly as the contribution case does and call `ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params)` — the same seam, the same call shape; `renderDocument`'s own params guard selects its CompressedContext branch.
      * `[✅]`   Send NO notification on any outcome of this branch — not `render_started`, not `render_chunk_completed`, not `job_failed`. COMPRESS is invisible infrastructure and the user is never told a compression artifact was rendered.
      * `[✅]`   Write this row's terminal status itself: `completed` with `completed_at` and a compression-shaped `results.pathContext`; on a thrown render error, `failed` with `completed_at` and `error_details`. The COMPRESS parent is woken by the existing child-completion trigger; this function writes nothing to the parent.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   The contribution case is untouched. Its gate, its per-field validation, its three notification sends, its `results.pathContext` projection, and its catch block all keep their current behavior and current text; the compressed branch returns before any of it is reached.
      * `[✅]`   `IRenderJobContext` gains no field. The branch consumes only members `DocumentRendererDeps` already requires.
      * `[✅]`   This node defines no type and no guard. `DialecticRenderCompressedContextJobPayload` and `isDialecticRenderCompressedContextJobPayload` belong to the `enqueueRenderJob` module; `RenderCompressedContextParams` belongs to the `renderDocument` module. Both are imported.
      * `[✅]`   The branch performs no per-field re-validation after the guard narrows the payload. The guard proves all twelve fields, so the eight the branch reads are typed and present — matching how this epic's other consumers treat a guard-narrowed payload, and keeping the deprecated `node:util` `isString`/`isNumber` predicates the contribution case uses out of the new code.
      * `[✅]`   The branch returns `void` and swallows its own render error after recording it, matching this function's existing contract; a compressed render failure is recorded on the row, never rethrown into the worker loop.

  * `[✅]`   `role`
    * `[✅]`   Application-layer job processor: the RENDER job type's single entrypoint, dispatched from `processJob`'s switch. It gains a second, parallel payload case; it is the consumer that makes a dispatched compressed row executable.
    * `[✅]`   Out of scope: inserting the row and resolving its `template_filename` (`enqueueRenderJob`); producing the `CompressedContextRawJson` artifact the render reads and setting the COMPRESS parent `waiting_for_children` (`saveResponse`); reading that artifact, normalizing it, rendering it, and persisting the `CompressedContext` markdown (`renderDocument`'s CompressedContext case); waking the parent (the existing DB completion trigger).

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/dialectic-worker/processRenderJob.ts` and its test file `processRenderJob.test.ts`. The work touches nothing else.
    * `[✅]`   Inside boundary: the payload discrimination, the params projection, the renderer call, the compression-shaped results projection, and the terminal status writes for the compressed case.
    * `[✅]`   Outside boundary: both payload shapes' own definitions and guards; the render implementation; job dispatch; notification policy for the contribution case; the parent job's status.

  * `[✅]`   `deps`
    * `[✅]`   `ctx: IRenderJobContext` (`dialectic-worker/createJobContext/JobContext.interface.ts`) — same layer, already the function's fourth argument, UNCHANGED. The branch reads `documentRenderer`, `downloadFromStorage`, `fileManager`, `notificationService`, `logger`, `assembleContributionChain`, `loadDocumentTemplate`, `mergeChunkContent` — every member `DocumentRendererDeps` requires and nothing more. `notificationService` is forwarded into `DocumentRendererDeps` because that interface requires it; `renderDocument`'s CompressedContext branch never calls it, and this function makes no notification call on the compressed branch.
    * `[✅]`   `isDialecticRenderCompressedContextJobPayload` (`dialectic-worker/enqueueRenderJob/enqueueRenderJob.guards.ts`) — sibling worker module, pure guard, DIRECT import. Direct import is correct here for the same reason the file already direct-imports `isDialecticRenderJobPayload`, `isFileType`, and `isDialecticStageSlug`: pure predicates are not injected in this codebase.
    * `[✅]`   `DialecticRenderCompressedContextJobPayload` (`dialectic-worker/enqueueRenderJob/enqueueRenderJob.interface.ts`) — type-only import.
    * `[✅]`   `RenderCompressedContextParams` (`_shared/services/document_renderer/renderDocument/renderDocument.interface.ts`) — type-only import, joining this file's existing type-only import of `RenderDocumentParams`/`DocumentRendererDeps` from the same file.
    * `[✅]`   Confirm: no reverse dependency — neither the `enqueueRenderJob` module nor the `renderDocument` module imports from this file. No lateral violation — this file already imports from `_shared/` and from sibling `dialectic-worker/` modules.

  * `[✅]`   `context_slice`
    * `[✅]`   From the narrowed payload the branch reads exactly eight fields: `projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `targetKey`, `sourceType`, `documentKey`, `template_filename`. It reads none of `idempotencyKey`, `user_jwt`, `model_id`, `walletId` — those are job-machinery fields the row carries for the queue, not render input. No over-fetching.
    * `[✅]`   From `ctx` the branch reads only the eight members named in `deps`, assembled into one `DocumentRendererDeps` literal. No hidden coupling: the branch does not reach into `ctx` for anything the renderer contract does not name.

  * `[✅]`   `processRenderJob.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[✅]`   Called by: `processJob`'s `RENDER` case, once per RENDER job row, with `(dbClient, job, projectOwnerUserId, ctx, authToken)`. The call site is unchanged by this node.
    * `[✅]`   Branch — compressed row. Condition: `isRecord(job.payload)` and `isDialecticRenderCompressedContextJobPayload(job.payload)`. Decision: that guard alone; no further predicate runs. Dependency call: one `ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params)`. Outcome: one `dialectic_generation_jobs` update setting `status: 'completed'`, `completed_at`, and `results: { pathContext: <compression projection> }`; resolves `void`. Side effects: exactly one renderer call and exactly one row update. Zero `ctx.notificationService.sendJobNotificationEvent` calls.
    * `[✅]`   Branch — contribution row. Condition: the compressed guard rejects the payload. Decision and everything after are the existing gate and existing body, unchanged, including all three notification sends.
    * `[✅]`   Failure mode — compressed row, renderer throws. Outcome: one `dialectic_generation_jobs` update setting `status: 'failed'`, `completed_at`, and `error_details` set to the thrown error's message; resolves `void`, does not rethrow; zero notification calls. A non-`Error` throw is normalized with `String(e)` for the message, matching the contribution case's own normalization.
    * `[✅]`   Failure mode — compressed row, status update itself fails. The update's error is not inspected, matching the contribution case's existing treatment of both its updates; no compensating write, no throw.
    * `[✅]`   Ordering: guard, then params projection, then renderer call, then status write. The renderer is never called before the guard narrows, and the status write never precedes the renderer.

  * `[✅]`   `processRenderJob.test.ts`
    * `[✅]`   New: `'processRenderJob - renders a compressed row through documentRenderer and marks the job completed'` — a job row whose payload is a full `DialecticRenderCompressedContextJobPayload`; assert `ctx.documentRenderer.renderDocument` is called exactly once, its third argument equals the eight-field projection with each value identical to the payload's, and the row update carries `status: 'completed'` with a `results.pathContext`.
    * `[✅]`   New: `'processRenderJob - sends no notification on any compressed-row outcome'` — run the compressed happy path and the compressed renderer-throws path in one case; assert `ctx.notificationService.sendJobNotificationEvent` has ZERO calls across both.
    * `[✅]`   New: `'processRenderJob - records a compressed-row render failure as failed with error_details and does not rethrow'` — `renderDocument` stubbed to throw a known `Error`; assert the call resolves, the row update carries `status: 'failed'` and `error_details` equal to that error's message, and no notification fires.
    * `[✅]`   New: `'processRenderJob - a compressed payload never reaches the contribution gate'` — assert the compressed row produces no `'Invalid payload'` failure and that no per-field contribution validation runs against it, by asserting the renderer was called rather than the row being written `failed`.
    * `[✅]`   New: `'processRenderJob - a contribution payload never selects the compressed branch'` — the existing contribution fixture; assert `renderDocument` receives a params object carrying `documentIdentity` and `sourceContributionId` and carrying neither `targetKey` nor `sourceType`, and that `render_started` still fires.
    * `[✅]`   Every existing case in this file passes unmodified: all 26 currently assert the contribution path, and each supplies a payload the compressed guard rejects, so none reaches the new branch.
    * `[✅]`   Do NOT re-test: `isDialecticRenderCompressedContextJobPayload`'s own accept/reject matrix (the `enqueueRenderJob` node's guard test owns it) or `renderDocument`'s CompressedContext branch behavior (the `renderDocument` node's tests own it). This file proves only that the correct branch is selected and the correct arguments cross the seam.

  * `[✅]`   `construction`
    * `[✅]`   No factory. The compressed case is an unexported module-scope async helper in this same file, `processCompressedRenderJob(dbClient, job, ctx, payload)`, invoked from a single early return at the top of `processRenderJob` — the existing body becomes the else path with no reindentation and no edit. Branch order inside the helper: build `params` from `payload`; build `rendererDeps` from `ctx`; `await ctx.documentRenderer.renderDocument(...)` inside a `try`; on success write the completed row; in `catch` normalize the error and write the failed row.
    * `[✅]`   The helper carries its own `try`/`catch` rather than sharing the existing one, because the existing catch sends the `job_failed` notification this branch must never send.

  * `[✅]`   `processRenderJob.ts` (Implementation)
    * `[✅]`   Add three imports: `isDialecticRenderCompressedContextJobPayload` from `./enqueueRenderJob/enqueueRenderJob.guards.ts`; `type DialecticRenderCompressedContextJobPayload` from `./enqueueRenderJob/enqueueRenderJob.interface.ts`; `type RenderCompressedContextParams` alongside the existing `RenderDocumentParams`/`DocumentRendererDeps` import from `../_shared/services/document_renderer/renderDocument/renderDocument.interface.ts`.
    * `[✅]`   Insert the early return immediately after `const { id: jobId } = job;` and before the existing `try`: when `isRecord(job.payload)` and `isDialecticRenderCompressedContextJobPayload(job.payload)`, `return await processCompressedRenderJob(dbClient, job, ctx, job.payload);`.
    * `[✅]`   Add the unexported `processCompressedRenderJob` helper per `construction`. Its `params` is the eight-field projection; its `rendererDeps` is the same eight-member `DocumentRendererDeps` literal the contribution path builds, with `notifyUserId: projectOwnerUserId` — so the helper takes `projectOwnerUserId` as a parameter alongside the four named above.
    * `[✅]`   Success write: `status: 'completed'`, `completed_at: new Date().toISOString()`, `results: { pathContext: { projectId, sessionId, iteration, stageSlug, fileType, documentKey, targetKey, sourceType } }` read from `renderResult.pathContext` — the compression identity tuple, in place of the contribution projection's `modelSlug`/`sourceContributionId`/`sourceAnchorModelSlug`/`sourceGroupFragment` fields, none of which a compression `pathContext` carries.
    * `[✅]`   Failure write: `status: 'failed'`, `completed_at: new Date().toISOString()`, `error_details` set to the normalized message. One `ctx.logger.error` call naming the job id and the message, matching this file's existing logging density on its own failure path.
    * `[✅]`   No other line in this file changes.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: worker orchestration (job processor). Deps inward: the `enqueueRenderJob` module's payload type and guard, the `renderDocument` module's params type, and `IRenderJobContext` — all already-landed WS-N and WS-B work. Provides outward: nothing; no module imports from this file. No cycles.

  * `[✅]`   `requirements` (binary, observable)
    * `[✅]`   A job row whose payload satisfies `isDialecticRenderCompressedContextJobPayload` results in exactly one `renderDocument` call whose params object has exactly the eight compressed keys, each value equal to the payload's field of the same name.
    * `[✅]`   That same row results in exactly one `dialectic_generation_jobs` update with `status: 'completed'` and a `results.pathContext` carrying `fileType`, `targetKey`, `sourceType`, and `documentKey`.
    * `[✅]`   `ctx.notificationService.sendJobNotificationEvent` is called zero times for a compressed row, on both the success and the renderer-throws path.
    * `[✅]`   A compressed row whose render throws is written `failed` with `error_details` equal to the thrown error's message, and the call resolves rather than rethrowing.
    * `[✅]`   Every one of this file's existing tests passes with no edit, and a contribution payload still produces `render_started`, `render_chunk_completed`, and the contribution-shaped `results.pathContext`.

* `[ ]`   supabase/functions/netlifyResponse/`index.ts` **[BE] Bind resolveTemplateFilename over the admin client and supply it to enqueueRenderJob's deps literal — WS-N's capstone composition-root node, closing the one transient non-compilable state the enqueueRenderJob node leaves open and completing the workstream**

  * `[✅]`   `objective`
    * `[✅]`   Resolve the single compilation gap the `enqueueRenderJob` node deliberately leaves open, permitted only within a workstream per NODE & SPRINT RULES: that node makes `resolveTemplateFilename: BoundResolveTemplateFilenameFn` a required, no-default field of `EnqueueRenderJobDeps`, and `boundEnqueueRenderJob`'s inline literal here supplies only `{ dbClient: adminClient, logger, shouldEnqueueRenderJob }`.
    * `[✅]`   Functional goals:
      * `[✅]`   Construct `boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) => resolveTemplateFilename({}, params, payload);` — `ResolveTemplateFilenameDeps` is `{}` per that module, and `params` carries the `dbClient` the walk uses, so the closure binds no client of its own.
      * `[✅]`   Add `resolveTemplateFilename: boundResolveTemplateFilename` to `boundEnqueueRenderJob`'s `EnqueueRenderJobDeps` literal, alongside its existing three fields.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   `saveResponseDeps` is NOT touched by this node. `saveResponse` acquires no dependency anywhere in this epic — it dispatches a RENDER job through the `enqueueRenderJob` closure this literal already supplies, and it holds no renderer dependency of any kind. This file therefore takes exactly ONE touch across the whole epic, here.
      * `[✅]`   `SaveResponseDeps` at this seam is its committed twelve-field shape, every field of which `saveResponseDeps` already supplies. Any working-tree additions of `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument` to that interface belong to the superseded inline-render approach; they are removed by the WS-P `saveResponse` node, not wired in here. The seam does not compile while they are present, so they are reverted before this node's commit.
      * `[✅]`   `netlifyResponseHandler.ts` is NOT modified — a COMPRESS response is an ordinary stream response, so the handler's routing and parsing need no COMPRESS awareness; only the `deps` it receives change shape.
      * `[✅]`   Every other line of this file is unchanged: `computeJobSig`, `adminClient`, `adminTokenWalletService`, `fileManager`, `notificationService`, `boundDebitTokens`, the `deps: NetlifyResponseDeps` object, and the trailing `serve(...)` call.

  * `[✅]`   `role`
    * `[✅]`   Composition-root wiring node for the stream-callback entrypoint, mirroring WS-R's `dialectic-worker/index.ts` node, and the LAST node of WS-N per the workstream's strict node order (`enqueueRenderJob → renderDocument → processRenderJob → netlifyResponse/index.ts`). It carries the workstream's commit.
    * `[✅]`   Out of scope: every function it wires (`resolveTemplateFilename.ts`, `enqueueRenderJob.ts`, `saveResponse.ts`); `netlifyResponseHandler.ts`'s routing logic; `dialectic-worker/index.ts`, which is a different entrypoint — the background-worker job loop — related only by sharing some shared-module imports.

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/netlifyResponse/index.ts` alone. `dialectic-worker/index.integration.test.ts`'s `buildNetlifyDeps` helper already constructs its own `boundResolveTemplateFilename` and already passes it into `boundEnqueueRenderJob`, and its `srDeps` literal already matches the committed twelve-field `SaveResponseDeps`, so the test harness needs nothing from this node and is not in its boundary.
    * `[✅]`   Inside boundary: two new imports, one new bound-closure constant, one new field on one existing deps literal.
    * `[✅]`   Outside boundary: `netlifyResponseHandler`'s request routing; every wired function's implementation; `dialectic-worker/index.ts`'s separate composition root.

  * `[✅]`   `deps`
    * `[✅]`   `resolveTemplateFilename` (`_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts`) — new value import. Shared utility, imported inward by a composition root, which is the one layer permitted to import every module it wires.
    * `[✅]`   `BoundResolveTemplateFilenameFn` (`_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts`) — new type-only import, annotating the closure constant in the same style as the existing `BoundDebitTokens`/`BoundEnqueueRenderJobFn` constants.
    * `[✅]`   Confirm: no reverse dependency — nothing imports from `netlifyResponse/index.ts`; no lateral violation.

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the module's own top-level composition. The new constant is declared in the same flat `const x: T = (params, payload) => fn({...}, params, payload);` form as the existing `boundDebitTokens` and `boundEnqueueRenderJob`, and must be declared BEFORE `boundEnqueueRenderJob` because that literal references it. No conditional logic.

  * `[✅]`   `index.ts` (Implementation)
    * `[✅]`   Add two imports alongside the existing `enqueueRenderJob`/`shouldEnqueueRenderJob` imports: `import { resolveTemplateFilename } from '../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts';` and `import type { BoundResolveTemplateFilenameFn } from '../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts';`.
    * `[✅]`   Insert `const boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) => resolveTemplateFilename({}, params, payload);` between the `boundDebitTokens` and `boundEnqueueRenderJob` declarations.
    * `[✅]`   Rewrite `boundEnqueueRenderJob`'s deps literal to `{ dbClient: adminClient, logger, shouldEnqueueRenderJob, resolveTemplateFilename: boundResolveTemplateFilename }`.
    * `[✅]`   No other line in this file changes.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: composition root (outermost application boundary, stream-callback entrypoint). Deps inward: `resolveTemplateFilename` (WS-B) and `enqueueRenderJob` (this workstream). Provides outward: nothing — this is the terminal node of WS-N's dependency graph. No cycles: it imports neither `dialectic-worker/index.ts` nor any WS-D or WS-X module.

  * `[✅]`   `requirements` (binary, observable)
    * `[✅]`   `boundEnqueueRenderJob`'s constructed `EnqueueRenderJobDeps` carries a `resolveTemplateFilename` function.
    * `[✅]`   `saveResponseDeps` is byte-identical to its pre-node form, supplying exactly the committed twelve `SaveResponseDeps` fields.
    * `[✅]`   `netlifyResponse.integration.test.ts` and `dialectic-worker/index.integration.test.ts` both pass with no edit to either file.
    * `[✅]`   The repo compiles with no transient non-compilable state remaining anywhere in WS-N.
    * `[✅]`   No change to `netlifyResponseHandler.ts`, to `serve(...)`, or to any line of this file outside the two imports, the one constant, and the one literal.

  * **Commit** `feat(dialectic): decompose the document renderer and dispatch compressed RENDER jobs`
    * `[✅]`   List structural changes: `document_renderer.ts`, `.interface.ts`, `.mock.ts`, and `verify_renderer.ts` deleted, their suites renamed into `renderDocument/` as the retained integration guard; `renderDocument` relocated into its own function-folder module and every importer repointed; `EnqueueRenderJobDeps` gains `resolveTemplateFilename`; `enqueueRenderJob.interface.ts` gains `EnqueueRenderCompressedContextPayload` and `DialecticRenderCompressedContextJobPayload` with their guards; `renderDocument.interface.ts` gains `RenderCompressedContextParams` with its guard; `processRenderJob.ts` gains its compressed-row helper; `netlifyResponse/index.ts` gains the closure above.
    * `[✅]`   List behavioral changes: `enqueueRenderJob` inserts a source-identity-keyed RENDER row for a compressed artifact and returns `{ renderJobId: null }` when the source is not renderable; `processRenderJob` renders such a row through `renderDocument`'s CompressedContext case and completes it with no notification of any kind; a `TemplateResolutionError` now surfaces from `enqueueRenderJob` as the exact object the dependency produced. Every existing RENDER and EXECUTE behavior is unchanged.
    * `[✅]`   List contract changes: `EnqueueRenderJobFn`/`BoundEnqueueRenderJobFn` accept a payload union discriminated by structure; `RenderDocumentFn` accepts a params union discriminated by structure; `EnqueueRenderJobErrorReturn.error` widens to include `TemplateResolutionError`; `IDocumentRenderer`'s public signature is unchanged despite the full internal decomposition.

## WS-I Compression source identity

* `[ ]`   supabase/functions/_shared/utils/`path_constructor.ts` **[BE] Name every compression victim by its own semantic identity instead of a truncated digest of its row id: `{documentKey}` for a contribution or resource source, `{documentKey}_feedback` for a feedback source — the document it answers, matching the existing `user_feedback` convention — and `message_{role}_{full id}` for a history source, moving feedback onto the documentKey-required arm and adding `role` to the history-required arm**

  * `[ ]`   `objective`
    * `[ ]`   The compressed-artifact filename names a feedback or history source `source_${generateShortId(sourceId)}` — the one place in this file that names a file after a hash. It discards identity that already exists (a feedback document is the user's answer to a named document and carries that document's key; a history message's id is a real id, not something to shorten), it buys no uniqueness (the full path plus `targetKey` already carry that), and it forces the deconstructor into a `^source_[0-9a-f]{8}$` carve-out (`path_deconstructor.ts:648`) that suppresses `documentKey` and cannot be read back, breaking the lossless round-trip WS-C requires.
    * `[ ]`   Worse, it collides. A step's working set routinely holds both a document and the user's feedback on that same document — Synthesis takes `business_case_critique` and its feedback; Parenthesis takes `product_requirements` and its feedback — so once feedback is keyed by `documentKey` (which it must be, to be nameable at all), the `_feedback` suffix is what keeps the two apart on one path. It is load-bearing, not decoration.
    * `[ ]`   Functional goal, required-member branch: the explicit per-`sourceType` branch keeps its shape (never an OR-fallback) and moves feedback across — `'contribution'`, `'resource'` AND `'feedback'` require `documentKey`; only `'history'` requires `sourceId`, and it additionally requires `role`. The unrecognized-`sourceType` arm still throws.
    * `[ ]`   Functional goal, `sourceBasename`: three forms, each produced INSIDE the arm that validated its members, so the ternary and both `!` non-null assertions on `documentKey`/`sourceId` are deleted rather than relocated:
      1. `'contribution'` / `'resource'` → `sanitizeForPath(documentKey)`.
      2. `'feedback'` → `` `${sanitizeForPath(documentKey)}_feedback` ``.
      3. `'history'` → `` `message_${role}_${sanitizeForPath(sourceId)}` `` — the FULL message id, never shortened. `sanitizeForPath` is a no-op over a UUID (its allow-list is `[a-z0-9_.-]`) and protects the segment against a non-UUID id; `role` is already path-safe by its own type.
    * `[ ]`   `generateShortId` leaves this branch entirely. It is NOT deleted from the file: its other call site — `shortSessionId`, the session path segment — is untouched, and `path_deconstructor.test.ts` imports it.
    * `[ ]`   RIDES HERE (owner): `PathContext` gains `role?: Messages['role']` in `_shared/types/file_manager.types.ts`, alongside the `targetKey`/`sourceType`/`sourceId`/`chunkIndex`/`chunkTotal` compression members WS-C landed there. The type is `Messages['role']` (`_shared/types.ts`) rather than a new union or `ChatMessageRole`: `applyCompressionOverlay` and `enqueueCompressJobs` read the value straight off a `Messages` object, so any narrower or duplicated union would force a cast at the producer and could drift from it.
    * `[ ]`   RIDES HERE (owner): `isCompressionHistoryRole` in `_shared/utils/type-guards/type_guards.file_manager.ts`, the single predicate for a compression history victim's role. Authored here because this is its first consumer — the value becomes a path segment, so an invalid one corrupts the canonical identity — and reused, never re-authored, by the `path_deconstructor.ts` node next.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   Every other `case` in `constructStoragePath` is byte-identical. Inside the compression branch, the `stageRootPath`/`targetKey`/`sourceType` missing-field collection, the chunk both-or-neither and range checks, `targetKeySanitized`, `chunkSuffix`, and both return shapes (`_work/raw_responses` + `_raw.json` vs `_work` + `.md`) are unchanged.
      * `[ ]`   Validation ORDER inside the history arm is `sourceId` first, then `role`, so a context missing both still reports `sourceId` and the existing throw-case assertion for it is unmoved.
      * `[ ]`   `PathContext.role` is optional and additive: no existing reader of `PathContext` is forced to change, and no caller outside the compression branch is affected.
      * `[ ]`   Paths remain deterministic and collision-free within a stage across multiple targets consuming the same source, and now across a document and its own feedback within one target.

  * `[ ]`   `role`
    * `[ ]`   Shared infrastructure utility (pure, total, no I/O): the single definition of canonical storage identity for every artifact the system persists. This node decides what a compression victim is CALLED; it decides nothing about when one is created, read, or reused.
    * `[ ]`   Out of scope: reading a compressed path back (`path_deconstructor.ts`, next node); carrying identity through a clone (`cloneProject.ts`); excluding compression artifacts from sync (`syncToGitHub.ts`); the victim payload and `DialecticCompressJobPayload` following the same identity split (`enqueueCompressJobs.ts`, last node of this workstream); every writer and reader of the artifacts themselves (`saveResponse.ts`, `applyCompressionOverlay.ts`).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `_shared/utils/path_constructor.ts` and `path_constructor.test.ts`, plus the two riders this file's work requires — `_shared/types/file_manager.types.ts` (`PathContext.role`) and `_shared/utils/type-guards/type_guards.file_manager.ts` + `type_guards.file_manager.test.ts` (`isCompressionHistoryRole`).
    * `[ ]`   Inside boundary: the naming of a compression artifact and the identity members that naming requires.
    * `[ ]`   Outside boundary: path PARSING, artifact persistence, artifact lookup, victim selection, and the COMPRESS job payload — each owned by its own node.

  * `[ ]`   `deps`
    * `[ ]`   `Messages` (`_shared/types.ts`) — new type import into `file_manager.types.ts`, added to its existing `{ ServiceError, ILogger }` import from that module, and into `type_guards.file_manager.ts`, added to its existing `{ ServiceError }` import. Both files already import from `_shared/types.ts`; no new module edge is created.
    * `[ ]`   `isCompressionHistoryRole` (`_shared/utils/type-guards/type_guards.file_manager.ts`) — new import into `path_constructor.ts`, joining the existing `isDocumentKey` import from that same module. Direct import, not injection: `path_constructor.ts` is a pure utility with no `Deps` parameter, and it already consumes `isDocumentKey` and `extractSourceGroupFragment` this way.
    * `[ ]`   `sanitizeForPath` — already defined and used in this file; no import.
    * `[ ]`   Confirm: no reverse dependency (`type_guards.file_manager.ts` does not import `path_constructor.ts`); no lateral violation — every edge points from `_shared/utils/` into `_shared/types/` and `_shared/utils/type-guards/`.

  * `[ ]`   `type_guards.file_manager.test.ts`
    * `[ ]`   New `Deno.test('Type Guard: isCompressionHistoryRole', ...)` immediately after the existing `isCompressionMode` test, in that test's exact two-step shape.
    * `[ ]`   Step 'returns true for every Messages role': `'system'`, `'user'`, `'assistant'`, `'function'`.
    * `[ ]`   Step 'returns false for invalid values': `'model'` and `'tool'` (real roles in other providers' vocabularies, not in this one), `''`, `'User'` (case), `null`, `undefined`, `123`, `{}`.

  * `[ ]`   `type_guards.file_manager.ts`
    * `[ ]`   Add `export function isCompressionHistoryRole(value: unknown): value is Messages['role']` immediately after `isCompressionMode`, in that function's exact single-expression style: `typeof value === 'string'` AND the four-way literal comparison against `'system'`, `'user'`, `'assistant'`, `'function'`.
    * `[ ]`   Add `Messages` to the existing `import { ServiceError } from '../../types.ts'`.

  * `[ ]`   `path_constructor.test.ts`
    * `[ ]`   Rewrite 'constructs path for compressed_context (history)': `sourceId = '550e8400-e29b-41d4-a716-446655440000'`, `role: 'assistant'` → `assertEquals(fileName, 'message_assistant_550e8400-e29b-41d4-a716-446655440000_compressed_for_business_case.md')`, plus `assert(fileName.includes(sourceId))` (the FULL id survives) and `assert(!fileName.startsWith('source_'))` (the digest form is gone). The `generateShortId` import stays — other steps in this file use it for `shortSessionId`.
    * `[ ]`   New step 'constructs path for compressed_context (feedback)': `sourceType: 'feedback'`, `documentKey: 'business_case_critique'`, no `sourceId` → `assertEquals(fileName, 'business_case_critique_feedback_compressed_for_business_case.md')` in `.../3_synthesis/_work`.
    * `[ ]`   New step 'a document and its own feedback never collide in one working set': the SAME `documentKey: 'business_case_critique'` and the SAME `targetKey` built once as `sourceType: 'resource'` and once as `sourceType: 'feedback'` → `assertNotEquals` on `fileName`, with the feedback name asserted to be the resource name plus the `_feedback` stem segment. This is the Synthesis case named in `objective`.
    * `[ ]`   New step 'constructs chunked path for compressed_context (history)': `role: 'user'`, `chunkIndex: 2`, `chunkTotal: 3` → `message_user_{id}_compressed_for_business_case_chunk_2of3.md`.
    * `[ ]`   New step 'constructs path for compressed_context_raw_json (history)': `role: 'assistant'` → `.../3_synthesis/_work/raw_responses` and `message_assistant_{id}_compressed_for_business_case_raw.json`.
    * `[ ]`   New step 'constructs path for compressed_context_raw_json (feedback)': `.../_work/raw_responses` and `business_case_critique_feedback_compressed_for_business_case_raw.json`.
    * `[ ]`   Extend 'compressed_context and compressed_context_raw_json share identity stem' with a feedback pair and a history pair, asserting the same stem equality the contribution pair already asserts — the `.md` and `_raw.json` artifacts of one victim must stay addressable from one identity.
    * `[ ]`   In 'throws if required context is missing for compressed_context': add `{ ...validContext, sourceType: 'feedback', documentKey: undefined, sourceId: 'some-id' }` throws matching `documentKey`; add `{ ...validContext, sourceType: 'history', sourceId, role: undefined, documentKey: undefined }` throws matching `role`. The two existing assertions — `sourceType: 'resource'` without `documentKey`, and `sourceType: 'history'` without `sourceId` — are unchanged and must still throw on the member they name, which is what pins the sourceId-before-role validation order.
    * `[ ]`   Type membership: every new and rewritten step declares its context as `const context: PathContext = { ... , role: 'assistant' }` — a direct typed assignment, which is the whole proof that `PathContext` carries `role` (this file has no separate `.interface.test.ts`, and one is not created for an existing utility).

  * `[ ]`   `file_manager.upload.test.ts`
    * `[ ]`   Blast radius, fixed HERE because no other node in this workstream touches this file and the workstream cannot commit with it red: `'uploadAndRegisterFile should register a CompressedContext resource for contribution and history sources'` builds its history `pathContext` with `sourceType` and `sourceId` only, so it throws the new missing-`role` error for both of its history cases.
    * `[ ]`   `runCase` gains a fifth parameter `role: Messages['role'] | undefined`, spread into `pathContext` as `...(role ? { role } : {})` in the same conditional-spread style the existing `documentKey`/`sourceId` parameters already use; add the `Messages` type import from `../types.ts`.
    * `[ ]`   The two `'history'` invocations pass `'assistant'`; the two `'contribution'` invocations pass `undefined`. Every assertion in the step is unchanged — it derives its expected path from `constructStoragePath` itself, so it re-pins automatically against the new naming.

  * `[ ]`   `construction`
    * `[ ]`   No factory; `constructStoragePath` is a single exported pure function. Order within the `CompressedContextRawJson`/`CompressedContext` case is unchanged and remains: collect-and-throw on missing `stageRootPath`/`targetKey`/`sourceType` → per-`sourceType` required-member validation (now also assigning `sourceBasename` inside each arm) → chunk both-or-neither and range checks → `targetKeySanitized` and `chunkSuffix` → the raw-JSON vs markdown return split.
    * `[ ]`   Known transients this node opens, both closed inside this workstream, permitted per NODE & SPRINT RULES: `path_deconstructor.test.ts`'s two history round-trip steps (they pass no `role`, and assert the `source_<8 hex>` basename) are resolved by the `path_deconstructor.ts` node, next; `enqueueCompressJobs.integration.test.ts`'s history victim reaches dedup layer 1's `constructStoragePath` call without a `role` and is resolved by the `enqueueCompressJobs.ts` node, last in this workstream. No production caller writes a compression artifact yet, so neither transient reaches runtime behavior.

  * `[ ]`   `file_manager.types.ts`
    * `[ ]`   Add `role?: Messages['role'];` to `PathContext`, adjacent to `sourceId`, commented as REQUIRED when `sourceType` is `'history'` — matching the comment style the existing `sourceType`/`sourceId`/`chunkIndex` members already carry.
    * `[ ]`   Add `Messages` to the existing `import { ServiceError, ILogger } from '../types.ts'`.

  * `[ ]`   `path_constructor.ts` (Implementation)
    * `[ ]`   Destructure `role` from `context` alongside the existing `targetKey, sourceType, sourceId, chunkIndex, chunkTotal`.
    * `[ ]`   Declare `let sourceBasename: string;` above the required-member branch and assign it inside each arm.
    * `[ ]`   Arm one, `sourceType === 'contribution' || sourceType === 'resource'`: unchanged `documentKey` throw, then `sourceBasename = sanitizeForPath(documentKey);` — the guard clause narrows `documentKey`, so no `!`.
    * `[ ]`   Arm two, NEW, `sourceType === 'feedback'`: the same `documentKey` throw text with `'feedback'` interpolated, then `` sourceBasename = `${sanitizeForPath(documentKey)}_feedback`; ``.
    * `[ ]`   Arm three, `sourceType === 'history'`: the unchanged `sourceId` throw, THEN `if (!isCompressionHistoryRole(role)) throw new Error("role is required for compressed_context sourceType 'history'.");`, then `` sourceBasename = `message_${role}_${sanitizeForPath(sourceId)}`; `` — both guards narrow, so no `!`.
    * `[ ]`   Arm four: the unrecognized-`sourceType` throw, unchanged.
    * `[ ]`   Delete the `const sourceBasename = ... ? ... : `source_${generateShortId(sourceId!)}`` ternary outright, along with its two non-null assertions.
    * `[ ]`   Add `isCompressionHistoryRole` to the existing `import { isDocumentKey } from './type-guards/type_guards.file_manager.ts'`.
    * `[ ]`   Nothing else in the file changes: `generateShortId` keeps its definition, its export, and its `shortSessionId` call site.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared infrastructure utility. Deps inward: `_shared/types/file_manager.types.ts`, `_shared/types.ts`, `_shared/utils/type-guards/type_guards.file_manager.ts`, `_shared/utils/path_utils.ts`. Provides outward: the compression naming contract to `path_deconstructor.ts`, `cloneProject.ts`, `syncToGitHub.ts`, `enqueueCompressJobs.ts`, `processCompressJob.ts`, `buildUploadContext.ts`, `renderDocument.ts`, `saveResponse.ts`, and `applyCompressionOverlay.ts`.
    * `[ ]`   No cycle: nothing this file imports imports it back.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   A `'contribution'` or `'resource'` compression context yields `{documentKey}_compressed_for_{targetKey}` — byte-identical to its pre-node value.
    * `[ ]`   A `'feedback'` compression context yields `{documentKey}_feedback_compressed_for_{targetKey}`, and a `'resource'` context with the SAME `documentKey` and `targetKey` yields a different filename.
    * `[ ]`   A `'history'` compression context yields `message_{role}_{sourceId}_compressed_for_{targetKey}` containing the full, untruncated id.
    * `[ ]`   No compression filename produced by this function begins with `source_`, and `generateShortId` is called nowhere in the compression branch.
    * `[ ]`   A `'feedback'` context without `documentKey` throws naming `documentKey`; a `'history'` context without `sourceId` throws naming `sourceId`; a `'history'` context with `sourceId` but no valid `role` throws naming `role`.
    * `[ ]`   `PathContext` accepts `role` by direct typed assignment; `isCompressionHistoryRole` returns true for exactly the four `Messages` roles.
    * `[ ]`   Every non-compression case in `path_constructor.test.ts` passes unmodified, and `file_manager.upload.test.ts` passes with only the `runCase` parameter addition.

* `[ ]`   supabase/functions/_shared/utils/`path_deconstructor.ts` **[BE] Read a compression victim's identity back out of its canonical path: delete the `source_<8 hex>` carve-out that suppresses `documentKey`, recover `documentKey` for every document-keyed form, recover `sourceType: 'feedback'` from the `_feedback` stem suffix, and recover a history victim's real untruncated `sourceId` and its `role` — so that construct → deconstruct → construct returns the byte-identical path for every source form, which is the round-trip `cloneProject` depends on**

  * `[ ]`   `objective`
    * `[ ]`   The compressed branch (`path_deconstructor.ts`, the `compressedContentPatternString` match, after the `ragSummaryPatternString` branch) captures `sourceBasename` and then discards it whenever it looks like a digest: `if (!/^source_[0-9a-f]{8}$/.test(sourceBasename)) { info.documentKey = sourceBasename; }`. Every identity member other than `targetKey`/`chunkIndex`/`chunkTotal` is therefore lost — a feedback or history artifact deconstructs to a record with no `documentKey`, no `sourceType`, no `sourceId`, and no `role`, and nothing in `DeconstructedPathInfo` can hold those last three even if the branch parsed them.
    * `[ ]`   That is a broken round-trip, not a cosmetic gap. `cloneProject.ts` deconstructs EVERY asset it clones and rebuilds a `PathContext` from the recovered members to write the copy; a `CompressedContext` or `CompressedContextRawJson` asset is a `dialectic_project_resources` row and is cloned, so it reaches `constructStoragePath` with a compression `fileType` and none of its required members. `sourceType` alone missing throws `Required context missing for compressed_context: sourceType.` This node makes the members recoverable; the node after it consumes them.
    * `[ ]`   The prior node's three naming forms are what this function must read back, and they are unambiguous by inspection: `message_{role}_{sourceId}` (history), `{documentKey}_feedback` (feedback), `{documentKey}` (contribution or resource).
    * `[ ]`   Functional goal, basename interpretation: replace the four-line carve-out with an explicit three-arm branch over `sourceBasename`, tested in this order — history, feedback, plain — each arm assigning every member its form carries and nothing else:
      1. `` const historyMatch = sourceBasename.match(/^message_([^_]+)_(.+)$/); `` and `isCompressionHistoryRole(historyMatch[1])` → `info.sourceType = 'history'`, `info.role = historyMatch[1]`, `info.sourceId = historyMatch[2]`. `documentKey` is left unset. `[^_]+` is exact for the role segment: all four `Messages` roles are single underscore-free words, so the first `_`-delimited token after the `message_` prefix IS the role and the entire remainder is the id, however many hyphens it contains. The guard call is what makes the arm safe — a basename that merely starts with `message_` but carries no real role falls through to arm three and is treated as a document key.
      2. `sourceBasename.endsWith('_feedback') && sourceBasename.length > '_feedback'.length` → `info.sourceType = 'feedback'`, `info.documentKey = sourceBasename.slice(0, -'_feedback'.length)`. The length comparison is load-bearing: a bare `_feedback` basename would otherwise yield an empty `documentKey`, which reconstructs to a different path.
      3. Otherwise → `info.sourceType = 'resource'`, `info.documentKey = sourceBasename`.
    * `[ ]`   Arm three returns `'resource'`, never `'contribution'`, and that is exact rather than a coin flip. The two share one constructor arm and one filename form, so a path cannot distinguish them — and it must not try to, because `'contribution'` is a PROVENANCE refinement that `enqueueCompressJobs` resolves from a selected `'resource'` victim's own source row, not something the path ever encoded. `'resource'` is the pre-refinement label the path actually carries, and reconstruction from it is byte-identical to reconstruction from `'contribution'` because both take the constructor's `documentKey` arm.
    * `[ ]`   Round-trip closure, stated as the property this node is judged on: for every source form and both compression FileTypes, chunked and unchunked, feeding the recovered `targetKey`/`sourceType`/`documentKey`/`sourceId`/`role`/`chunkIndex`/`chunkTotal` back into `constructStoragePath` — with the project/session/iteration/stage the caller supplies, exactly as `cloneProject` supplies the CLONE's own ids — yields byte-identical `storagePath` and `fileName`. This holds even for the degenerate case of a `'resource'` victim whose `documentKey` itself ends in `_feedback`: arm two recovers a shorter `documentKey` plus `sourceType: 'feedback'`, and the constructor's feedback arm re-appends the suffix to the identical string.
    * `[ ]`   RIDES HERE (owner): `DeconstructedPathInfo` gains `sourceType?: CompressionSourceType`, `sourceId?: string`, and `role?: Messages['role']` in `path_deconstructor.types.ts`. Without them the recovered identity has nowhere to land and the round-trip cannot be expressed, let alone asserted. All three are optional and additive, so no existing reader of the type is forced to change.
    * `[ ]`   `isCompressionHistoryRole` is IMPORTED from `type_guards.file_manager.ts`, authored by the prior node — reused, never re-authored, and never replaced by an inline four-way string comparison here.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `compressedContentPatternString` is unchanged. Group 5 is greedy `(.+)` before the single `_compressed_for_` literal, so it already captures the whole basename for all three forms; the work is entirely in how that capture is interpreted.
      * `[ ]`   The branch keeps its position in the cascade, after `ragSummaryPatternString` and before `pendingFilePatternString`. No earlier `_work` pattern can intercept the new basenames: `genericWorkFilePatternString` is the only earlier `_work/*.md` matcher and it requires an `_{digits}_` run, which none of `message_{role}_{uuid}`, `{documentKey}_feedback`, or the `_chunk_{i}of{n}` suffix contains; the raw-JSON forms live under `_work/raw_responses/`, which every earlier `raw_responses` pattern excludes by matching `{stageDir}/raw_responses/` with a `[^/]+` stage segment.
      * `[ ]`   Everything else inside the branch is byte-identical: `originalProjectId`, `shortSessionId`, `iteration`, `stageDirName`, `stageSlug`, `targetKey` from group 6, the chunk pair from groups 7/8, and the `_raw.json`-vs-`.md` `fileTypeGuess` split. `parsedFileNameFromPath` keeps its function-level default of the input `fileName`.
      * `[ ]`   Every other pattern and branch in the file is untouched, and no branch outside the compressed one ever assigns `sourceType`, `sourceId`, or `role`.
      * `[ ]`   `generateShortId` is not imported by this file and gains no call site here.

  * `[ ]`   `role`
    * `[ ]`   Shared infrastructure utility (pure, total, no I/O): the single definition of how a stored path is read back into identity. This node decides what a compression path MEANS; it decides nothing about what one is called (`path_constructor.ts`, prior node), nor when one is written, read, or reused.
    * `[ ]`   Out of scope: rebuilding a `PathContext` from the recovered members (`cloneProject.ts`, next node); excluding compression artifacts from sync (`syncToGitHub.ts`); the victim payload's identity split (`enqueueCompressJobs.ts`); the upload-context resource arm (`buildUploadContext.ts`); every reader and writer of the artifacts themselves (`saveResponse.ts`, `applyCompressionOverlay.ts`).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `_shared/utils/path_deconstructor.ts`, `_shared/utils/path_deconstructor.types.ts`, and `_shared/utils/path_deconstructor.test.ts`. Nothing else is touched.
    * `[ ]`   Inside boundary: parsing a compression artifact's path into its identity members, and the type that carries them.
    * `[ ]`   Outside boundary: path CONSTRUCTION, artifact persistence, artifact lookup, and every consumer of the recovered identity.
    * `[ ]`   This module has no `.mock.ts`, no `.guard.ts`, no `.provides.ts`, and no separate `.interface.test.ts` or `.integration.test.ts`, and this node creates none: the work adds no owned guard, no injected dependency, and no export surface. `path_deconstructor.test.ts` already imports the REAL `constructStoragePath` and drives it against the REAL `deconstructStoragePath`, so the two-module round-trip proof belongs in that existing suite rather than in a new file.
    * `[ ]`   `path_deconstructor.continuation.test.ts` and `path_deconstructor.fragment.test.ts` hold no compression case and are not edited.

  * `[ ]`   `deps`
    * `[ ]`   `isCompressionHistoryRole` (`_shared/utils/type-guards/type_guards.file_manager.ts`, prior node) — new import into `path_deconstructor.ts`. Direct import, not injection: this file is a pure utility with no `Deps` parameter and already consumes `isContributionType` (`./type_guards.ts`) exactly this way.
    * `[ ]`   `CompressionSourceType` (`_shared/types/file_manager.types.ts`) — added to the existing `import type { FileType } from '../types/file_manager.types.ts'` in `path_deconstructor.types.ts`.
    * `[ ]`   `Messages` (`_shared/types.ts`) — new type-only import into `path_deconstructor.types.ts`, for the `role` member's `Messages['role']` annotation. Same type, same reasoning, and same source module as the `PathContext.role` member the prior node landed: the producers read the value straight off a `Messages` object, so a narrower or duplicated union would force a cast and could drift.
    * `[ ]`   Confirm: no reverse dependency — `type_guards.file_manager.ts`, `file_manager.types.ts`, and `types.ts` import nothing from `path_deconstructor.ts`; every edge points from `_shared/utils/` into `_shared/types/` and `_shared/utils/type-guards/`. No lateral violation.

  * `[ ]`   `interaction.spec`
    * `[ ]`   Branch — history. Condition: the compressed pattern matched and `sourceBasename` matches `` /^message_([^_]+)_(.+)$/ ``. Decision: `isCompressionHistoryRole` over the first capture. Dependency call: `isCompressionHistoryRole`. Outcome: `info.sourceType = 'history'`, `info.role`, `info.sourceId` populated; `info.documentKey` left unset; return `info`.
    * `[ ]`   Branch — feedback. Condition: not history, and `sourceBasename` ends with `_feedback` and is longer than that suffix. Decision: suffix comparison, no guard. Dependency call: none. Outcome: `info.sourceType = 'feedback'`, `info.documentKey` = basename minus the suffix; `sourceId`/`role` left unset; return `info`.
    * `[ ]`   Branch — plain document key. Condition: neither of the above. Decision: none — this is the exhaustive else. Dependency call: none. Outcome: `info.sourceType = 'resource'`, `info.documentKey` = the whole basename; `sourceId`/`role` left unset; return `info`.
    * `[ ]`   Side effects: none — the function is pure and this branch performs no I/O. Ordering: the three arms are evaluated in the stated order and exactly one assigns; the chunk-pair and `fileTypeGuess` assignments that follow are common to all three and are unchanged.
    * `[ ]`   No arm returns `info.error`, and no arm throws: every compression path produced by `constructStoragePath` resolves to exactly one arm.

  * `[ ]`   `path_deconstructor.types.ts`
    * `[ ]`   Add `sourceType?: CompressionSourceType;` to `DeconstructedPathInfo`, adjacent to `targetKey`, commented as the recovered compression source discriminator — matching the one-line trailing-comment style every existing member carries.
    * `[ ]`   Add `sourceId?: string;` immediately after it, commented as the victim's originating row id, recovered in full for a `'history'` source.
    * `[ ]`   Add `role?: Messages['role'];` immediately after that, commented as recovered for a `'history'` source only.
    * `[ ]`   Add `CompressionSourceType` to the existing `import type { FileType } from '../types/file_manager.types.ts'`, and add `import type { Messages } from '../types.ts';`.
    * `[ ]`   `DeconstructStoragePathParams` and `DeconstructStoragePathFn` are unchanged.

  * `[ ]`   `path_deconstructor.test.ts`
    * `[ ]`   In `Deno.test('[path_deconstructor] direct - compressed_context round-trips', ...)`, add `assertEquals(info.sourceType, 'resource')`, `assertEquals(info.sourceId, undefined)`, and `assertEquals(info.role, undefined)` to both `documentKey`-sourced steps — `'round-trips documentKey-sourced final artifact'` and `'round-trips documentKey-sourced raw JSON artifact'` — and to `'round-trips chunked documentKey-sourced artifact'` and `'round-trips chunked documentKey-sourced raw JSON artifact'`. Every existing assertion in those four steps stands unchanged.
    * `[ ]`   Rewrite `'round-trips sourceId-sourced final artifact'` as a history round-trip: drop the `const sourceShortId = generateShortId(sourceId);` local, add `role: 'assistant'` to the `PathContext` literal, and assert `info.sourceType === 'history'`, `info.sourceId === sourceId` (the full untruncated id), `info.role === 'assistant'`, `info.documentKey === undefined`, and `` info.parsedFileNameFromPath === `message_assistant_${sourceId}_compressed_for_${targetKeySanitized}.md` ``. Its `targetKey`/`chunkIndex`/`chunkTotal`/`fileTypeGuess`/path assertions are unchanged.
    * `[ ]`   Rewrite `'round-trips sourceId-sourced raw JSON artifact'` identically, asserting `` info.parsedFileNameFromPath === `message_assistant_${sourceId}_compressed_for_${targetKeySanitized}_raw.json` `` and `info.fileTypeGuess === FileType.CompressedContextRawJson`.
    * `[ ]`   New step `'round-trips a feedback-sourced final artifact'`: `sourceType: 'feedback'`, `documentKey: 'business_case_critique'`, no `sourceId` → `info.sourceType === 'feedback'`, `info.documentKey === 'business_case_critique'`, `info.sourceId === undefined`, `info.role === undefined`, `` info.parsedFileNameFromPath === `business_case_critique_feedback_compressed_for_${targetKeySanitized}.md` ``.
    * `[ ]`   New step `'round-trips a feedback-sourced raw JSON artifact'`: the same identity with `fileType: FileType.CompressedContextRawJson` → the same recovered members, `storagePath` ending `_work/raw_responses`, and the `_raw.json` filename.
    * `[ ]`   New step `'round-trips a chunked history-sourced artifact'`: `role: 'user'`, `chunkIndex: 2`, `chunkTotal: 3` → the full `sourceId` and `role: 'user'` recovered alongside `chunkIndex === 2` and `chunkTotal === 3`, proving the chunk suffix does not bleed into the id.
    * `[ ]`   New step `'a document and its own feedback deconstruct to distinct identities'`: build the SAME `documentKey: 'business_case_critique'` and the SAME `targetKey` once as `sourceType: 'resource'` and once as `sourceType: 'feedback'`, deconstruct both, and assert the two recovered `sourceType` values differ while both recover `documentKey === 'business_case_critique'`. This is the Synthesis collision case the prior node's naming exists to prevent, read from the other direction.
    * `[ ]`   New step `'every source form reconstructs to the identical path'` — the losslessness proof, and the one step that pins what `cloneProject` needs. For each of six contexts (resource final, feedback final, history final, resource raw JSON, feedback raw JSON, chunked history final), call `constructStoragePath`, deconstruct the result, build a fresh `const rebuilt: PathContext` from the SUITE's own `projectId`/`sessionId`/`iteration`/`stageSlug` plus ONLY the deconstructed `fileTypeGuess`/`targetKey`/`sourceType`/`documentKey`/`sourceId`/`role`/`chunkIndex`/`chunkTotal`, call `constructStoragePath` again, and `assertEquals` both `storagePath` and `fileName` against the first call. Sourcing the project/session members from the suite rather than from `info` mirrors the real consumer exactly: `cloneProject` supplies the CLONE's ids and takes only the identity members from the deconstruction.
    * `[ ]`   Type membership: each new and rewritten step declares its context as `const context: PathContext = { ..., role: 'assistant' }` and the reconstruction step declares `const rebuilt: PathContext = { ... }` — direct typed assignments, which are the whole proof that the recovered members are assignable back into `PathContext`. `assertEquals(info.role, 'assistant')` over a value typed `Messages['role'] | undefined` is likewise the proof that `DeconstructedPathInfo` carries `role`; this file has no separate `.interface.test.ts` and one is not created for an existing utility.
    * `[ ]`   The `generateShortId` import stays: other tests in this file use it for `shortSessionId`, and the suite's own `shortSessionId` local is unchanged. No compression assertion in the file references a digest after this pass.

  * `[ ]`   `construction`
    * `[ ]`   No factory; `deconstructStoragePath` is a single exported pure function. Order within the compressed branch is unchanged and remains: capture the five path segments → `sourceBasename` from group 5 → (REPLACED) three-arm identity recovery → `targetKey` from group 6 → chunk pair from groups 7/8 → `fileTypeGuess` split → `return info`.
    * `[ ]`   This node opens no transient: `DeconstructedPathInfo`'s three new members are optional, and the two history steps in `path_deconstructor.test.ts` that the prior node left red are closed by this node's rewrites of them. The one transient still open in this workstream after this node — `enqueueCompressJobs.integration.test.ts`'s history victim reaching `constructStoragePath` with no `role` — belongs to the `enqueueCompressJobs.ts` node.

  * `[ ]`   `path_deconstructor.ts` (Implementation)
    * `[ ]`   In the compressed branch, delete `` if (!/^source_[0-9a-f]{8}$/.test(sourceBasename)) { info.documentKey = sourceBasename; } `` outright.
    * `[ ]`   In its place, arm one: `` const historyMatch = sourceBasename.match(/^message_([^_]+)_(.+)$/); `` then `if (historyMatch && isCompressionHistoryRole(historyMatch[1])) { info.sourceType = 'history'; info.role = historyMatch[1]; info.sourceId = historyMatch[2]; }` — the guard narrows `historyMatch[1]` to `Messages['role']`, so no cast and no assertion.
    * `[ ]`   Arm two: `else if (sourceBasename.endsWith('_feedback') && sourceBasename.length > '_feedback'.length) { info.sourceType = 'feedback'; info.documentKey = sourceBasename.slice(0, -'_feedback'.length); }`.
    * `[ ]`   Arm three: `else { info.sourceType = 'resource'; info.documentKey = sourceBasename; }`.
    * `[ ]`   Add `import { isCompressionHistoryRole } from './type-guards/type_guards.file_manager.ts';` alongside the existing `./type_guards.ts` import.
    * `[ ]`   Nothing else in the file changes: no pattern string, no branch order, no other branch's assignments, and no export.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared infrastructure utility. Deps inward: `_shared/types/file_manager.types.ts`, `_shared/types.ts`, `_shared/utils/type-guards/type_guards.file_manager.ts`, `_shared/utils/type_guards.ts`. Provides outward: the recovered compression identity to `cloneProject.ts` (next node) and, as an unread additive member set, to every other `deconstructStoragePath` caller.
    * `[ ]`   No cycle: nothing this file imports imports it back.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   A `'contribution'` or `'resource'` compression path recovers `documentKey` equal to the sanitized key and `sourceType: 'resource'`, with `sourceId` and `role` undefined.
    * `[ ]`   A `'feedback'` compression path recovers `sourceType: 'feedback'` and `documentKey` equal to the basename minus the `_feedback` suffix, with `sourceId` and `role` undefined.
    * `[ ]`   A `'history'` compression path recovers `sourceType: 'history'`, `sourceId` equal to the FULL untruncated source id, and `role` equal to the role segment, with `documentKey` undefined.
    * `[ ]`   For all six covered contexts — resource, feedback and history, final and raw JSON, plus a chunked history artifact — deconstructing and reconstructing yields `storagePath` and `fileName` byte-identical to the first construction.
    * `[ ]`   No compression path sets `info.error`, and no compression path causes a throw.
    * `[ ]`   A resource artifact and a feedback artifact sharing one `documentKey` and one `targetKey` deconstruct to different `sourceType` values and the same `documentKey`.
    * `[ ]`   `DeconstructedPathInfo` accepts `sourceType`, `sourceId`, and `role` by direct typed assignment, and `role` accepts exactly the four `Messages` roles.
    * `[ ]`   No branch in `path_deconstructor.ts` tests a basename against `^source_[0-9a-f]{8}$`.
    * `[ ]`   Every non-compression case in `path_deconstructor.test.ts` passes unmodified, and `path_deconstructor.continuation.test.ts` and `path_deconstructor.fragment.test.ts` pass with no edit.

## WS-P COMPRESS response persistence 

* `[ ]`   supabase/functions/_shared/utils/determineContinuation/`determineContinuation.ts` **[BE] Add the source-object completeness trigger so a COMPRESS response is judged against the source it was sent, alongside the recipe-step trigger that judges an EXECUTE response against its step's content_to_include, and make every trigger unconditional**

  * `[ ]`   `objective`
    * `[ ]`   The problem has two parts. First, a compressor is an agent completing a template, and the ratified design judges its output by the same completeness question every completed template answers — does the returned object still contain every key of the source it was sent. This function is where that question is answered, but its missing-keys trigger can only ask it of a recipe step: it reads `params.contextForDocuments` and `params.documentKey`, finds the `ContextForDocument` row whose `document_key` matches, and compares `parsedContent` against that row's `content_to_include` keys. A COMPRESS job carries neither field on its payload — `DialecticCompressJobPayload` has no `document_key` and no `context_for_documents` — so a COMPRESS response reaches this function with both `undefined`, the trigger cannot fire, and every compression, complete or not, is reported as complete. Second, two of the triggers are gated on `params.continueUntilComplete`, a member `DialecticCompressJobPayload` also does not carry, so those gates are permanently closed for compression regardless of what the comparison finds.
    * `[ ]`   Functional goals:
      * `[ ]`   `DetermineContinuationParams` gains a seventh member, `sourceObject: unknown`, carrying the parsed source object a COMPRESS job was sent (the parse of its payload's `content`).
      * `[ ]`   A second missing-keys branch fires when `sourceObject` is a record: every top-level key of `sourceObject` that is absent from `parsedContent` marks the response incomplete, yielding `shouldContinue: true`.
      * `[ ]`   The two missing-keys branches are selected by which member is populated, never by a flag or a job-type discriminator: a caller supplies `contextForDocuments`/`documentKey` or it supplies `sourceObject`. The EXECUTE call site supplies `sourceObject: undefined`; the COMPRESS call site supplies `documentKey: undefined` and `contextForDocuments: undefined`.
      * `[ ]`   Every trigger is unconditional. This function does not read `params.continueUntilComplete` — the structural-repair trigger and the recipe-step missing-keys trigger drop that conjunct, and the source-object branch is authored without it. Completeness is an invariant, not a caller preference (see the WS-P workstream note in `Compression Jobs Scope.md`).
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `continueUntilComplete` remains a member of `DetermineContinuationParams` and a required-presence check in `isDetermineContinuationParams`, so every call site compiles untouched. Removing the member, its guard check, its mocks, and the control that writes it is out of scope for this epic.
      * `[ ]`   Comparison is top-level keys only, matching the recipe-step branch's own `templateKey in parsedContent` test. No recursion into nested objects, no array-length comparison, no value inspection — a compressor is authorized to condense values and shorten arrays, so only key survival is judged.
      * `[ ]`   The finish-reason pass-through and the `continuation_needed`/`stop_reason`/`resume_cursor` inspection of `parsedContent` keep their existing conditions, order, and effect for both job types.
      * `[ ]`   The function remains pure, synchronous, total, and free of I/O; it gains no dependency and no error arm.
      * `[ ]`   `sourceObject` is a required member whose value may be `undefined` — the same shape `parsedContent` already has, and the shape `isDetermineContinuationParams` already enforces by presence alone. Callers pass `undefined`, never `null`: `isDetermineContinuationParams` admits `undefined` for optional-valued members and rejects `null`.

  * `[ ]`   `role`
    * `[ ]`   Shared pure utility (domain layer) — the single decision point for "is this agent response complete." The role is appropriate because the completeness question is identical for both job types and differs only in what the response is compared against; answering it in one total function keeps EXECUTE and COMPRESS from drifting into two divergent notions of completeness.
    * `[ ]`   Out of scope: parsing the source or the response (the caller supplies both already parsed); deciding whether to ASK for a continuation once `shouldContinue` is true (`continueJob.ts`, next node); building the continuation prompt (`assembleContinuationPrompt.ts`, later node); routing a COMPRESS response or reading its payload (`saveResponse.ts`, later node); every notion of structural drift, key ordering, value fidelity, or array contents — this function judges key survival and nothing else.

  * `[ ]`   `module`
    * Conforms to: [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   Bounded context: `supabase/functions/_shared/utils/determineContinuation/` — the completeness decision and its contract.
    * `[ ]`   Inside boundary: the params shape, the trigger set, and the boolean outcome.
    * `[ ]`   Outside boundary: job payloads and their guards, job rows, `ContextForDocument`'s own definition (imported by type only, unchanged), storage, DB, and every downstream consequence of `shouldContinue: true`.

  * `[ ]`   `deps`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md), [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   No injected dependencies, and none added: this is a pure function of one params argument with no `Deps`/`Params`/`Payload` split, matching its existing signature.
    * `[ ]`   `ContextForDocument` (`dialectic-service/dialectic.interface.ts`) — existing type-only import, unchanged, read by the recipe-step branch.
    * `[ ]`   `isRecord` (`_shared/utils/type_guards.ts` in the implementation; `_shared/utils/type-guards/type_guards.common.ts` in the guard file) — existing imports, reused by the new branch, not re-authored.
    * `[ ]`   Confirm: no reverse dependency (nothing in `_shared/utils/determineContinuation/` imports from `dialectic-worker/`); no lateral violation.

  * `[ ]`   `context_slice`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md)
    * `[ ]`   The new branch reads exactly two members: `sourceObject` and `parsedContent`. It does not read `documentKey`, `contextForDocuments`, `wasStructurallyFixed`, or `finishReasonContinue`.
    * `[ ]`   `continueUntilComplete` is read by no branch in the function.
    * `[ ]`   Confirm: no over-fetching — the caller passes the parsed source object itself rather than the payload, the job row, or the mode, none of which this function has any use for.

  * `[ ]`   `determineContinuation.interface.test.ts`
    * Conforms to: [tests#interface](../../../../agents/tests.md#interface), [composition](../../../../agents/composition.md), [types](../../../../agents/types.md), [errors-and-returns](../../../../agents/errors-and-returns.md)
    * `[ ]`   Rename `"Contract: DetermineContinuationParams requires all six fields"` to `"Contract: DetermineContinuationParams requires all seven fields"`, and add `sourceObject` to both of its existing steps' params literals — the fully-populated literal in `"all keys present with typed values"` (a record such as `{ field: '' }`) and the `undefined`-valued literal in `"documentKey and contextForDocuments may be undefined"`. Both currently omit the member and stop compiling once it is required.
    * `[ ]`   Extend `"all keys present with typed values"` with `assertEquals("sourceObject" in params, true);`, matching the per-member presence assertions already listed there.
    * `[ ]`   New step, `"sourceObject may be undefined"`: a `DetermineContinuationParams` literal with `sourceObject: undefined` type-checks and `assertEquals(params.sourceObject, undefined);`.
    * `[ ]`   New step, `"sourceObject accepts an arbitrary record"`: a literal with `sourceObject: { a: 1, b: 'x' }` type-checks — proving the member is `unknown`, not narrowed to a document shape.
    * `[ ]`   `"Contract: DetermineContinuationResult contains exactly shouldContinue"` is unchanged — the return shape does not move.

  * `[ ]`   `determineContinuation.interface.ts`
    * Conforms to: [composition](../../../../agents/composition.md), [types](../../../../agents/types.md), [errors-and-returns](../../../../agents/errors-and-returns.md)
    * `[ ]`   Add `sourceObject: unknown;` to `DetermineContinuationParams`, placed after `contextForDocuments`, with a doc comment in this interface's existing per-member style naming its provenance: the parsed source object a COMPRESS job was sent, from its payload's `content`; `undefined` for an EXECUTE job.
    * `[ ]`   Amend the interface's header comment, which enumerates the triggers as "EMCAS triggers 1 pass-through and 2–4", to name the source-object trigger alongside trigger 4 so the comment and the member set agree.
    * `[ ]`   `DetermineContinuationResult` is unchanged.

  * `[ ]`   `determineContinuation.interaction.spec` (prose; no file — this module has no literal `.interaction.spec`, matching the repo's precedent for its pure utilities)
    * Conforms to: [composition](../../../../agents/composition.md), [errors-and-returns](../../../../agents/errors-and-returns.md), [guards](../../../../agents/guards.md)
    * `[ ]`   Called by: `saveResponse.ts` via `deps.determineContinuation(...)`, once per stream response, on both the EXECUTE and COMPRESS paths. Synchronous, no side effects, no I/O, no logging.
    * `[ ]`   Branch — trigger 1 pass-through. Condition: `params.finishReasonContinue` is `true`. Decision: direct boolean read. Dependency call: none. Outcome: `{ shouldContinue: true }`; every later branch is skipped.
    * `[ ]`   Branch — trigger 2, structural repair. Condition: not yet continuing and `params.wasStructurallyFixed` is `true`. Decision: direct boolean read. Dependency call: none. Outcome: `{ shouldContinue: true }`.
    * `[ ]`   Branch — trigger 3, self-reported incompleteness. Condition: not yet continuing and `isRecord(params.parsedContent)`. Decision: `parsedContent.continuation_needed === true`, or `parsedContent.stop_reason` equal to `"continuation"` or `"token_limit"`, or `parsedContent.resume_cursor` a non-empty trimmed string. Dependency call: none. Outcome: `{ shouldContinue: true }` on any match.
    * `[ ]`   Branch — trigger 4, recipe-step missing keys. Condition: not yet continuing, `isRecord(params.parsedContent)`, `params.contextForDocuments` is an array, and `params.documentKey` is a string. Decision: locate the first `ContextForDocument` whose `document_key` equals `params.documentKey`; on a match, test each key of its `content_to_include` for membership in `parsedContent`. Dependency call: none. Outcome: `{ shouldContinue: true }` when one or more keys are absent; otherwise fall through unchanged. No match on `document_key` falls through with no comparison.
    * `[ ]`   Branch — source-object missing keys. Condition: not yet continuing, `isRecord(params.parsedContent)`, and `isRecord(params.sourceObject)`. Decision: test each top-level key of `sourceObject` for membership in `parsedContent`. Dependency call: none. Outcome: `{ shouldContinue: true }` when one or more keys are absent; otherwise fall through unchanged.
    * `[ ]`   No branch reads `params.continueUntilComplete`.
    * `[ ]`   Branch — no trigger fires. Condition: every branch above falls through. Outcome: `{ shouldContinue: false }`.
    * `[ ]`   Ordering: the branches evaluate in the order listed and each is short-circuited by an already-`true` result, so the outcome is order-independent and the function is total — every input reaches exactly one member of the return type.
    * `[ ]`   Failure modes: none. There is no error arm, nothing throws, and a `sourceObject` that is not a record (`undefined`, a string, an array, `null`) simply does not select the source-object branch.

  * `[ ]`   `determineContinuation.interface.guards.test.ts` (NEW file — the module's guards are currently unproven; this node adds the case checklist for the member it introduces, and does not retrofit checklists for the six pre-existing members)
    * Conforms to: [tests#guard](../../../../agents/tests.md#guard), [guards](../../../../agents/guards.md)
    * `[ ]`   `isDetermineContinuationParams` accepts a fully-populated params record carrying `sourceObject` as a record, and accepts the same record with `sourceObject: undefined` — presence, not value, is the requirement.
    * `[ ]`   `isDetermineContinuationParams` rejects a params record with `sourceObject` absent entirely — the no-false-positive case for this member, matching how the guard already treats `parsedContent`.
    * `[ ]`   `isDetermineContinuationParams` accepts `sourceObject` holding a string, an array, and `null` — the member is `unknown` and the guard performs no type check on it, so none of these is a rejection reason.

  * `[ ]`   `determineContinuation.interface.guards.ts`
    * Conforms to: [tests#guard](../../../../agents/tests.md#guard), [guards](../../../../agents/guards.md)
    * `[ ]`   Add a presence-only check for the new member to `isDetermineContinuationParams`, placed after the `contextForDocuments` check: `if (!("sourceObject" in value)) { return false; }` — structurally identical to the existing `parsedContent` check, with no type test, because the member is `unknown`.
    * `[ ]`   Update the guard's doc comment, which states "all six fields present with correct types", to seven.
    * `[ ]`   `isDetermineContinuationResult` is unchanged.

  * `[ ]`   `determineContinuation.test.ts`
    * Conforms to: [tests#unit](../../../../agents/tests.md#unit)
    * `[ ]`   Every existing `Deno.test` in this file constructs a full `DetermineContinuationParams` literal and stops compiling once the member is required; each gains `sourceObject: undefined`. This is the complete set of literals in the file, not a sample.
    * `[ ]`   Four cases name the flag; two invert their assertion and two are renamed. Invert `"does NOT trigger continuation from wasStructurallyFixed when continueUntilComplete is false"` to `"triggers continuation from wasStructurallyFixed regardless of continueUntilComplete"`, keeping its params literal and asserting `shouldContinue: true`. Invert `"does NOT check missing keys when continueUntilComplete is false"` to `"checks missing keys regardless of continueUntilComplete"`, keeping its params literal (a matching `contextForDocuments`/`documentKey` pair with `field` absent from `parsedContent`) and asserting `shouldContinue: true`.
    * `[ ]`   Rename `"returns shouldContinue: true when wasStructurallyFixed is true AND continueUntilComplete is true, even if finishReasonContinue is false (trigger 2)"` to drop the `AND continueUntilComplete is true` clause, and `"returns shouldContinue: true when parsed content is missing keys from contextForDocuments[].content_to_include AND continueUntilComplete is true (trigger 4)"` likewise. Both keep their params literals and assertions.
    * `[ ]`   `"does NOT check missing keys when documentKey is undefined"`, `"does NOT check missing keys when contextForDocuments is undefined"`, and `"does NOT trigger missing-keys continuation when all expected keys are present in parsed content"` keep their names, literals, and assertions — each turns on a condition other than the flag.
    * `[ ]`   New test: source-object branch fires — `parsedContent` a record missing one top-level key of a two-key `sourceObject`, `finishReasonContinue`/`wasStructurallyFixed` false, `continueUntilComplete: false`, `documentKey`/`contextForDocuments` undefined → `shouldContinue: true`.
    * `[ ]`   New test: source-object branch does not fire when every top-level key survives — `parsedContent` carrying all of `sourceObject`'s keys with condensed string values → `shouldContinue: false`.
    * `[ ]`   New test: extra keys in `parsedContent` beyond `sourceObject`'s do not fire the branch → `shouldContinue: false` — the branch tests survival of source keys, not equality of key sets.
    * `[ ]`   New test: nested divergence does not fire the branch — `sourceObject` and `parsedContent` share every top-level key, but a shared key's nested object holds fewer keys in `parsedContent` → `shouldContinue: false`, pinning the top-level-only constraint.
    * `[ ]`   New test: shortened arrays and condensed strings do not fire the branch — a shared key whose `sourceObject` value is a three-element array is a one-element array in `parsedContent`, and another whose value is a long string is a short string → `shouldContinue: false`.
    * `[ ]`   New test: a non-record `sourceObject` never selects the branch — `undefined`, a string, and an array each with a `parsedContent` record → `shouldContinue: false`.
    * `[ ]`   New test: a non-record `parsedContent` never selects the branch — `parsedContent: null` with a populated record `sourceObject` → `shouldContinue: false`.
    * `[ ]`   New test: the two missing-keys branches do not interfere — a params literal carrying BOTH a matching `contextForDocuments`/`documentKey` pair whose keys all survive AND a `sourceObject` with a missing key → `shouldContinue: true`, and the mirror case (recipe-step keys missing, `sourceObject: undefined`) → `shouldContinue: true`.
    * `[ ]`   New test: trigger 1 still short-circuits — `finishReasonContinue: true` with a `sourceObject` whose keys all survive → `shouldContinue: true`.
    * `[ ]`   Do NOT re-test: the params type shape or the guards' correctness — those belong to `determineContinuation.interface.test.ts` and `determineContinuation.interface.guards.test.ts` respectively.

  * `[ ]`   `determineContinuation.ts` (Implementation)
    * Conforms to: [composition](../../../../agents/composition.md), [dependency-injection](../../../../agents/dependency-injection.md), [types](../../../../agents/types.md), [errors-and-returns](../../../../agents/errors-and-returns.md), [guards](../../../../agents/guards.md), [logging](../../../../agents/logging.md)
    * `[ ]`   Insert the source-object branch after the existing recipe-step block and before the `const result: DetermineContinuationResult = { shouldContinue };` return, realizing the branch contract in `interaction.spec`: guard on `!shouldContinue && isRecord(parsedContent) && isRecord(params.sourceObject)`, collect the source object's absent top-level keys with the same `Object.keys(...)` / `for` / `in`-test construction the recipe-step block already uses, and set `shouldContinue = true` when the collection is non-empty.
    * `[ ]`   Drop `params.continueUntilComplete` from the trigger 2 condition, leaving `!shouldContinue && params.wasStructurallyFixed`, and from the trigger 4 condition, leaving `!shouldContinue && isRecord(parsedContent)` before the `contextForDocuments`/`documentKey` narrowing. No other change to either block.
    * `[ ]`   The trigger 1 initialization, the trigger 3 `isRecord` block, the trigger 4 lookup and key comparison, and the single return are otherwise unchanged.
    * `[ ]`   No new import: `isRecord` is already imported by this file.
    * `[ ]`   Introduce no dependency, no logging, no throw, and no early return — the function keeps its single exit.

  * `[ ]`   `directionality`
    * Conforms to: [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   Layer: shared pure utility (domain). Deps inward: a type-only import from `dialectic-service/dialectic.interface.ts` and `isRecord` from `_shared/utils/`. Provides outward: `DetermineContinuationParams`/`DetermineContinuationResult`/`determineContinuation` and the two guards, consumed by `saveResponse.ts` through `DetermineContinuationFn` on `SaveResponseDeps`. No cycles: nothing here imports from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * Conforms to: [tdd-ordering](../../../../agents/tdd-ordering.md)
    * `[ ]`   `DetermineContinuationParams` has exactly seven members, and a literal omitting `sourceObject` does not compile.
    * `[ ]`   `isDetermineContinuationParams` returns `false` for a record missing `sourceObject`, and `true` when it is present holding `undefined`, a record, a string, an array, or `null`.
    * `[ ]`   A response missing one or more top-level keys of a record `sourceObject` yields `shouldContinue: true` with `documentKey`/`contextForDocuments` undefined.
    * `[ ]`   A response retaining every top-level key of `sourceObject` yields `shouldContinue: false`, whatever its values, array lengths, nested key sets, or additional keys.
    * `[ ]`   A `sourceObject` that is not a record never changes the outcome.
    * `[ ]`   Every outcome is identical for `continueUntilComplete: true` and `continueUntilComplete: false`, across every trigger.
    * `[ ]`   The two inverted and two renamed cases in `determineContinuation.test.ts` pass; every other pre-existing case passes with its assertion unchanged once `sourceObject: undefined` is added to its params literal.

* `[ ]`   supabase/functions/dialectic-worker/`continueJob.ts` **[BE] Enqueue a continuation for a COMPRESS job whose saved output is a project resource, discriminated by payload structure, and remove the continueUntilComplete refusal so the continuation-count limit is the sole structural bound**

  * `[ ]`   `objective`
    * `[ ]`   The problem: this function enqueues the follow-up job whenever its caller has determined a response is incomplete, and every gate it applies is contribution-shaped. It requires `job.payload.output_type` to pass `isModelContributionFileType`, requires a non-empty `job.payload.user_jwt`, requires `job.payload.continueUntilComplete` to be truthy, takes `savedContribution: DialecticContributionRow` as a positional argument, writes `savedContribution.id` into `target_contribution_id` on both the payload and the row, requires the constructed payload to satisfy `isDialecticExecuteJobPayload`, demands valid `document_relationships`, and hardcodes `job_type: 'EXECUTE'` on the insert. A COMPRESS job carries no `output_type`, no `user_jwt`, no `continueUntilComplete`, and no `document_relationships`, and its saved output is a `dialectic_project_resources` row — so a COMPRESS continuation is refused at the first gate, and the continuation path the ratified design routes it through terminates here.
    * `[ ]`   Functional goals:
      * `[ ]`   The saved-output argument widens to `DialecticContributionRow | DialecticProjectResourceRow` on both `continueJob` and `ContinueJobFn`.
      * `[ ]`   A COMPRESS arm is selected by payload structure via `isDialecticCompressJobPayload(job.payload)`, and enqueues a `job_type: 'COMPRESS'` continuation row whose payload satisfies `isDialecticCompressJobPayload`.
      * `[ ]`   The `output_type`, `user_jwt`, and `document_relationships` gates and the `target_contribution_id` writes apply on the EXECUTE arm only.
      * `[ ]`   The `continueUntilComplete` refusal is deleted outright, for both arms.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   The caller has already determined that continuation is warranted; this function refuses no continuation on grounds of preference. The continuation-count limit and its `continuation_limit_reached` reason are the sole structural bound, unchanged in threshold and outcome, and applied identically to both arms.
      * `[ ]`   The COMPRESS arm writes no `user_jwt`: `enqueueModelCall` signs its event with `sig` and excludes `user_jwt` from the posted body, so a COMPRESS continuation needs none, and inventing one here would be the healing this function's EXECUTE arm explicitly forbids.
      * `[ ]`   The COMPRESS arm writes no `target_contribution_id` on the payload or the row. A COMPRESS continuation's prior output is a project resource, and `assembleContinuationPrompt` resolves it from the canonical `CompressedContextRawJson` path built out of the payload's own identity members, so no id pointer is carried.
      * `[ ]`   The EXECUTE arm's behavior is unchanged in every respect other than the deleted `continueUntilComplete` refusal: same gates, same payload pass-through and overlay order, same `canonicalPathParams` and `document_relationships` merges, same insert shape, same idempotency recovery, same log lines.
      * `[ ]`   `isContinuablePayload` admits a COMPRESS payload as written — it requires `sessionId`, `projectId`, `model_id`, `stageSlug`, and `iterationNumber`, all of which `DialecticCompressJobPayload` carries — so the entry gate is reused, not widened.

  * `[ ]`   `role`
    * `[ ]`   Worker orchestration (application layer) — the single place a continuation job row is constructed and inserted. The role is appropriate because continuation is a job-spawning act and both job types spawn the same kind of successor: a row carrying the parent's payload with the continuation counter advanced.
    * `[ ]`   Out of scope: deciding whether a response is incomplete (`determineContinuation.ts`, prior node); building the continuation prompt the successor consumes (`assembleContinuationPrompt.ts`, next node); calling this function and interpreting its result (`saveResponse.ts`, later node); persisting the compressed artifact; every notification.

  * `[ ]`   `module`
    * Conforms to: [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/continueJob.ts` — continuation-row construction and insertion.
    * `[ ]`   Inside boundary: the arm discrimination, the per-arm gates, the continuation payload overlay, the insert, and the idempotency recovery.
    * `[ ]`   Outside boundary: the payload guards' own definitions (imported, never re-authored); `dialectic_project_resources` and `dialectic_contributions` semantics beyond reading an `id`; the compression artifact's storage path; the successor job's own processing.

  * `[ ]`   `deps`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md), [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   `IContinueJobDeps` (`dialectic-service/dialectic.interface.ts`) — `{ logger }`, unchanged; no dependency is added by this node.
    * `[ ]`   `isDialecticCompressJobPayload` (`./enqueueCompressJobs/enqueueCompressJobs.guard.ts`) — new import, sibling module in the same layer, reused for arm discrimination and for validating the constructed COMPRESS payload.
    * `[ ]`   `DialecticProjectResourceRow` (`dialectic-service/dialectic.interface.ts`) — new type-only import for the widened saved-output argument.
    * `[ ]`   `isContinuablePayload`, `isDialecticExecuteJobPayload`, `isJson`, `isStringRecord`, `isRecord`, `isDocumentRelationships` (`_shared/utils/type_guards.ts`) and `isModelContributionFileType` (`_shared/utils/type-guards/type_guards.file_manager.ts`) — existing imports, unchanged.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — `enqueueCompressJobs/` is a sibling under `dialectic-worker/`, and nothing in it imports `continueJob.ts`.

  * `[ ]`   `context_slice`
    * Conforms to: [dependency-injection](../../../../agents/dependency-injection.md)
    * `[ ]`   The COMPRESS arm reads from the saved output exactly one member, `id`, for the idempotency key — the same member the EXECUTE arm reads. It reads no `document_relationships`, no `edit_version`, and no storage members off either row shape.
    * `[ ]`   The COMPRESS arm reads from `job.payload` only what it copies forward wholesale plus `continuation_count`; it does not read `mode`, `content`, `sourceType`, `documentKey`, `targetKey`, or the chunk members individually.
    * `[ ]`   Confirm: no over-fetching; the widened argument admits a resource row without the function acquiring any knowledge of resource storage.

  * `[ ]`   `createJobContext/JobContext.interface.ts` (contract edit riding this node — `ContinueJobFn` is the injected form of this function and has no separate owning module)
    * Conforms to: [composition](../../../../agents/composition.md), [types](../../../../agents/types.md), [errors-and-returns](../../../../agents/errors-and-returns.md)
    * `[ ]`   Widen `ContinueJobFn`'s fifth parameter from `savedContribution: DialecticContributionRow` to `savedOutput: DialecticContributionRow | DialecticProjectResourceRow`, adding the type-only import of `DialecticProjectResourceRow` alongside the existing `DialecticContributionRow` import.
    * `[ ]`   `IContinueJobDeps` and `IContinueJobResult` (`dialectic-service/dialectic.interface.ts`) are unchanged: the deps are still `{ logger }`, and `{ enqueued, error?, reason? }` already expresses every outcome both arms produce.
    * `[ ]`   The widening is compile-safe for `saveResponse.ts`'s existing EXECUTE call site, which passes a `DialecticContributionRow` — a member of the widened union.

  * `[ ]`   `continueJob.interaction.spec` (prose; no file — this module has no literal `.interaction.spec`, matching the repo's precedent for its worker orchestration utilities)
    * Conforms to: [composition](../../../../agents/composition.md), [errors-and-returns](../../../../agents/errors-and-returns.md), [guards](../../../../agents/guards.md)
    * `[ ]`   Called by: `saveResponse.ts` via `deps.continueJob(...)`, once per response the caller has judged incomplete, on both the EXECUTE and COMPRESS paths.
    * `[ ]`   Branch — non-continuable payload. Condition: `isContinuablePayload(job.payload)` is false. Decision: that guard. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error('Invalid or non-continuable job payload') }`. Shared by both arms, evaluated first.
    * `[ ]`   Branch — continuation limit. Condition: `(job.payload.continuation_count ?? 0)` is not below 5. Decision: numeric comparison. Dependency call: none. Outcome: `{ enqueued: false, reason: 'continuation_limit_reached' }`. Shared by both arms, evaluated before arm discrimination so the bound is identical for each.
    * `[ ]`   Branch — arm discrimination. Condition: `isDialecticCompressJobPayload(job.payload)` selects the COMPRESS arm; otherwise the EXECUTE arm. Decision: that guard alone — no job-row column, no flag.
    * `[ ]`   Branch — EXECUTE arm, missing or invalid `output_type`. Condition: `output_type` absent, not a string, or failing `isModelContributionFileType`. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error(...) }`.
    * `[ ]`   Branch — EXECUTE arm, missing `user_jwt`. Condition: `job.payload.user_jwt` absent or an empty string. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error('payload.user_jwt required') }`.
    * `[ ]`   Branch — EXECUTE arm, missing `walletId`. Condition: `job.payload.walletId` falsy. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error('Job payload is missing a valid walletId') }`.
    * `[ ]`   Branch — EXECUTE arm, missing relationships. Condition: the overlaid payload's `document_relationships` fails `isDocumentRelationships`. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error('Continuation enqueue requires valid document_relationships') }`.
    * `[ ]`   Branch — EXECUTE arm, invalid constructed payload. Condition: the constructed payload fails `isJson` or `isDialecticExecuteJobPayload`. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error(...) }`.
    * `[ ]`   Branch — COMPRESS arm, invalid constructed payload. Condition: the constructed payload fails `isJson` or `isDialecticCompressJobPayload`. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error('Failed to construct a valid continuation payload.') }`. The COMPRESS arm applies no `output_type`, `user_jwt`, `walletId`, or `document_relationships` gate — those members are not on its payload.
    * `[ ]`   Branch — insert conflict on idempotency key. Condition: the insert returns code `23505` with a message naming `idempotency_key`. Dependency call: `deps.logger.info`. Outcome: `{ enqueued: true }`. Shared by both arms.
    * `[ ]`   Branch — other insert failure. Condition: any other insert error. Dependency call: `deps.logger.error`. Outcome: `{ enqueued: false, error: Error('Failed to enqueue continuation job: ' + message) }`. Shared by both arms.
    * `[ ]`   Branch — success. Condition: the insert returns no error. Dependency call: `deps.logger.info`. Outcome: `{ enqueued: true }`. Shared by both arms.
    * `[ ]`   Side effects: exactly one `dialectic_generation_jobs` insert per call that reaches an arm's insert; no update, no delete, no notification, no storage access.
    * `[ ]`   Ordering: entry guard, then continuation limit, then arm discrimination, then that arm's gates, then payload construction, then insert. No branch falls through untyped; every one returns a member of `IContinueJobResult`.

  * `[ ]`   `continueJob.test.ts`
    * Conforms to: [tests#unit](../../../../agents/tests.md#unit)
    * `[ ]`   Rewrite `'CONTINUE_FLAG: should not enqueue when continueUntilComplete is false'` to `'CONTINUE_FLAG: enqueues when continueUntilComplete is false'`, asserting `enqueued: true` and one insert — the flag is not read.
    * `[ ]`   Rewrite `'CONTINUE_FLAG: should not enqueue when continueUntilComplete is undefined'` to `'CONTINUE_FLAG: enqueues when continueUntilComplete is absent'`, same assertions, with the member deleted from the payload as that step already does.
    * `[ ]`   Rewrite `'CONTINUATION_COUNT: should not include reason when continueUntilComplete is false'` to assert the same absent `reason` on an enqueued result, so the case continues to pin that `reason` is reserved for the limit outcome.
    * `[ ]`   Rewrite `'LOGGING: should not log continuation when continueUntilComplete is false'` to assert the continuation log line IS emitted with the flag false, matching the deleted refusal.
    * `[ ]`   Every other pre-existing step passes unmodified: none of them sets `continueUntilComplete` false, and each passes a `DialecticContributionRow` that remains a member of the widened union.
    * `[ ]`   New step: a COMPRESS job — row `job_type: 'COMPRESS'`, payload built by `enqueueCompressJobs.mock.ts`'s `DialecticCompressJobPayload` builder, saved output a `DialecticProjectResourceRow` — inserts exactly one row with `job_type: 'COMPRESS'`, `parent_job_id` equal to the parent's, `status: 'pending_continuation'`, and `idempotency_key` equal to `` `${job.id}_continue_${savedOutput.id}` ``; the result is `{ enqueued: true }`.
    * `[ ]`   New step: the inserted COMPRESS payload passes `isDialecticCompressJobPayload`, carries `continuation_count` advanced by one, preserves `mode`, `content`, `sourceType`, `targetKey`, `documentKey`, `docType`, `sourceStageSlug`, `model_id`, `walletId`, and `user_id` from the parent, and contains neither `user_jwt` nor `target_contribution_id`.
    * `[ ]`   New step: the inserted COMPRESS row's `target_contribution_id` column is `null`.
    * `[ ]`   New step: a COMPRESS job whose payload carries no `document_relationships` and no `output_type` enqueues successfully — proving neither EXECUTE gate is applied to this arm.
    * `[ ]`   New step: a COMPRESS job at `continuation_count: 5` returns `{ enqueued: false, reason: 'continuation_limit_reached' }` with no insert — the bound is identical for both arms.
    * `[ ]`   New step: a COMPRESS job whose insert rejects with code `23505` naming `idempotency_key` returns `{ enqueued: true }` with no error.
    * `[ ]`   New step: an EXECUTE job passing a `DialecticProjectResourceRow` as the saved output fails its `document_relationships` gate rather than enqueueing — the union widens the parameter without letting a resource row satisfy the contribution arm.
    * `[ ]`   Do NOT re-test: `isDialecticCompressJobPayload`'s or `isContinuablePayload`'s own correctness, each covered by its owning module's guard tests.

  * `[ ]`   `continueJob.ts` (Implementation)
    * Conforms to: [composition](../../../../agents/composition.md), [dependency-injection](../../../../agents/dependency-injection.md), [types](../../../../agents/types.md), [errors-and-returns](../../../../agents/errors-and-returns.md), [guards](../../../../agents/guards.md), [logging](../../../../agents/logging.md)
    * `[ ]`   Rename the fifth parameter to `savedOutput` and type it `DialecticContributionRow | DialecticProjectResourceRow`; update the two existing reads of it — the `target_contribution_id` writes and the idempotency key — and the two log lines naming `savedContributionId`/`contribution` to the new identifier.
    * `[ ]`   Delete the `continueUntilComplete` early return in full, together with the `underMaxContinuations` block's positioning only insofar as the limit check must now precede arm discrimination; the limit check's condition, threshold, and `continuation_limit_reached` outcome are unchanged.
    * `[ ]`   Move the arm discrimination immediately after the limit check: `isDialecticCompressJobPayload(job.payload)` selects the COMPRESS arm.
    * `[ ]`   COMPRESS arm: build the continuation payload with the same full pass-through the EXECUTE arm uses — copy every `isJson` member of `job.payload` except `is_test_job`, re-add `is_test_job: true` when the parent row carries it, set `continuation_count` to the advanced value — then set no `user_jwt`, no `target_contribution_id`, no `canonicalPathParams`, and no `document_relationships`. Validate with `isJson` then `isDialecticCompressJobPayload`. Insert with `job_type: 'COMPRESS'`, `target_contribution_id: null`, and every other insert member built exactly as the EXECUTE arm builds it, including `idempotency_key`.
    * `[ ]`   EXECUTE arm: the existing body from the `output_type` gate through the insert, unchanged except for the parameter rename.
    * `[ ]`   Extract the insert, the `23505` idempotency recovery, the other-error branch, and the success log into one shared tail both arms reach, so the two arms differ only in the payload they construct and the `job_type`/`target_contribution_id` members they set.
    * `[ ]`   New imports: `isDialecticCompressJobPayload` from `./enqueueCompressJobs/enqueueCompressJobs.guard.ts`; `DialecticProjectResourceRow` type-only from `../dialectic-service/dialectic.interface.ts`.

  * `[ ]`   `directionality`
    * Conforms to: [boundaries](../../../../agents/boundaries.md)
    * `[ ]`   Layer: worker orchestration. Deps inward: `_shared/utils/` guards, `dialectic-service/dialectic.interface.ts` types, and the sibling `enqueueCompressJobs` module's payload guard. Provides outward: `continueJob`, consumed through `ContinueJobFn` on `IJobContext` and `SaveResponseDeps`. No cycles: `enqueueCompressJobs/` does not import this file.

  * `[ ]`   `requirements` (binary, observable)
    * Conforms to: [tdd-ordering](../../../../agents/tdd-ordering.md)
    * `[ ]`   A COMPRESS job below the continuation limit inserts exactly one `job_type: 'COMPRESS'` row whose payload passes `isDialecticCompressJobPayload`, carries `continuation_count` advanced by one, and contains no `user_jwt` and no `target_contribution_id`.
    * `[ ]`   The inserted COMPRESS row's `target_contribution_id` column is `null` and its `idempotency_key` is `` `${job.id}_continue_${savedOutput.id}` ``.
    * `[ ]`   A COMPRESS job carrying no `output_type` and no `document_relationships` enqueues successfully.
    * `[ ]`   Both arms return `{ enqueued: false, reason: 'continuation_limit_reached' }` at `continuation_count: 5` with no insert.
    * `[ ]`   `continueUntilComplete` appears nowhere in `continueJob.ts`, and a job with it false or absent enqueues.
    * `[ ]`   `ContinueJobFn`'s fifth parameter accepts both row types, and `saveResponse.ts` compiles against it with no call-site change.
    * `[ ]`   Every pre-existing step in `continueJob.test.ts` other than the four flag-gated ones passes unmodified.

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/`saveResponse.ts` **[BE] Route the stream callback by the job row's job_type BEFORE the EXECUTE path's output_type gate — a COMPRESS job's response is validated (JSON-mode structural drift check), rendered through its source document's original template (JSON mode) or persisted as-is (text mode), and saved as a canonical CompressedContext resource with real wallet debit and no user-facing notifications, while the existing EXECUTE→contribution path is untouched**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing COMPRESS branch in the stream-response callback. `saveResponse.ts` today (1276 lines) is EXECUTE-only: it fetches the `dialectic_generation_jobs` row (`:129-145`), reads `job.payload.output_type` and gates it through `isModelContributionFileType` (`:154-167`) — a COMPRESS job's payload (canonical shape, `enqueueCompressJobs.interface.ts`, Sprint-3 node) carries no `output_type` at all and would be rejected there, exactly as the scope's own WS-B text states. The routing decision must happen BEFORE that gate, keyed on `job.job_type` (already available on the fetched row — `job_type: JobType`, confirmed on `DialecticJobRow`/`Tables<'dialectic_generation_jobs'>`, and `JobType` already gains `'COMPRESS'` via the Sprint-3 `processJob.ts` node's single touch to `dialectic.interface.ts`).
    * `[ ]`   Functional goal: insert `if (job.job_type === 'COMPRESS') { return await saveCompressResponse(deps, params, payload, job, dbClient); }` immediately after `const job: DialecticJobRow = jobRows[0];` (`saveResponse.ts:145`) and before the `jobPayloadUnknown`/`output_type` handling begins (`:146+`) — the EARLIEST point at which `job.job_type` is known and the LATEST point before any EXECUTE-only field is read. `saveCompressResponse` is a NEW, unexported, module-scope function in this SAME file (matching this file's own existing precedent of unexported local helpers — `readOptionalPreflightInputTokens`/`readOptionalContinuationCount`, `:74-108` — and the epic's own precedent of internal, non-exported helper functions living inside their owning node's implementation file rather than spawning a new node/file for them).
    * `[ ]`   Design rationale for a mostly-SEPARATE function rather than threading `if (isCompress)` branches through the existing 1130 lines: the scope's own framing — "route by the job row's `job_type` FIRST" — signals a clean fork, not deep interleaving. `saveCompressResponse` re-fetches its OWN `ai_providers`/`dialectic_sessions` rows and re-builds its own `aiResponse`/retry-on-error sequence (duplicating a SMALL amount of boilerplate already present in the EXECUTE path) rather than threading COMPRESS-specific state through EXECUTE-only locals (`canonicalUnknown`, `restOfCanonicalPathParams`, `document_relationships`, `contributionType`, all genuinely EXECUTE/contribution-shaped and inapplicable to a resource artifact). This keeps EXECUTE's existing 1130 lines COMPLETELY UNTOUCHED (verified: the ONLY EXECUTE-path edit this node makes is the four-line routing insertion above) and keeps `saveCompressResponse` independently readable as the COMPRESS job's own complete lifecycle.
    * `[ ]`   Shared machinery `saveCompressResponse` reuses BY DIRECT CALL to the same deps (not by refactoring the EXECUTE path into shared helpers — no such extraction is authorized by this node): `deps.retryJob` (identical call shape — generic over any `DialecticJobRow`), `deps.resolveFinishReason`, `deps.sanitizeJsonContent` (JSON mode only), `deps.debitTokens` (identical `DebitTokensParams`/`Payload` shape, identical `ChatMessageRow`-pair `databaseOperation`), `deps.fileManager.uploadAndRegisterFile` (already generic over every `ResourceFileTypes` member per the shipped Sprint-2 `file_manager.ts` behavior — no source change to `file_manager.ts` is needed, matching that already-completed node's own finding).
    * `[ ]`   COMPRESS payload narrowing: `job.payload` is validated via `isDialecticCompressJobPayload` (imported from `../enqueueCompressJobs/enqueueCompressJobs.guard.ts`, owned by the Sprint-3 `enqueueCompressJobs.ts` node — NOT redefined here) into `DialecticCompressJobPayload` (imported from `../enqueueCompressJobs/enqueueCompressJobs.interface.ts`, same node) — a validation failure here is a fresh, non-retriable `Error` (this file's own existing convention for malformed job state, matching every other `isX(...)` guard failure in this file, e.g. `:115-119`).
    * `[ ]`   Mode-based content handling (replaces EXECUTE's `isIntermediate`/continuation-aware sanitize branch, `:357-445`, entirely — COMPRESS has no intermediate-chunk or continuation concept; chunking already happened at spawn time via `enqueueCompressJobs`'s map-reduce split, and the recursion guard means a COMPRESS job's own output is never itself compressed):
      * `[ ]`   `compressPayload.mode === 'json'`: `deps.sanitizeJsonContent(aiResponse.content)` → invalid sanitization result or `JSON.parse` failure → `deps.retryJob` (SAME retry semantics as EXECUTE's own malformed-JSON branch, `:396-421`) then return `{ status: 'completed' }` (retry path, not a hard failure — matches the EXECUTE precedent exactly). On successful parse: `JSON.parse(compressPayload.content)` (the SOURCE JSON carried in the payload — this parse is of OUR OWN internally-constructed payload field, not model output, so a parse failure here is a fresh, non-retriable `Error`, not a retry candidate) → `structuralKeyShapeMatches(sourceParsed, compressedParsed)` (NEW internal helper, this node — see below) → mismatch → non-retriable `CompressionDriftError` (NEW error class, `_shared/utils/errors.ts` companion touch) — explicit job failure, per the scope's "drift is a validated invariant, not a hope." Match → resolve the SOURCE document's template: `deps.resolveTemplateFilename({ dbClient }, { stageSlug: compressPayload.sourceStageSlug, outputType: compressPayload.docType, documentKey: compressPayload.documentKey })` — the bound closure takes `(params, payload)`; all three fields are typed `DialecticStageSlug`/`ModelContributionFileTypes`/`FileType` on the payload and GUARANTEED present by `isDialecticCompressJobPayload`'s json-mode branch (no runtime fallback needed) → `'error' in result` → `return { error: result.error, retriable: result.retriable }` (surfaced verbatim, per `.github/instructions/error-handling.instructions.md`, matching this epic's established pattern) → `deps.loadDocumentTemplate({ dbClient }, { projectId: compressPayload.projectId, templateFilename: result.templateFilename })` (the bound closure carries its own `downloadFromStorage`) → error → surfaced verbatim → `deps.renderStructuredDocument(templateText, compressedParsed, compressPayload.documentKey)` (the field is already typed `FileType`; no re-narrowing) → `contentForStorage = renderedMarkdown`.
      * `[ ]`   `compressPayload.mode === 'text'`: `contentForStorage = aiResponse.content.trim()` — no sanitize, no parse, no render (per the scope: "Text mode: the response text is the artifact — no renderer involvement").
    * `[ ]`   `structuralKeyShapeMatches(source: unknown, compressed: unknown): boolean` (NEW unexported module-scope helper, grounded in the WS-0 migration node's OWN template instruction text — "Every key must be present in your output. Do not add, rename, remove, or reorder keys. Object shapes must not change. Arrays may lose low-value elements... Condense string values in place" — a concrete, testable algorithm, not a vague "structural check"):
      * `[ ]`   `source`/`compressed` both `isRecord` → `Object.keys(source).sort()` must EQUAL `Object.keys(compressed).sort()` (exact bijective key set — no add, no remove); recurse into every key's value pair.
      * `[ ]`   `source[key]` is `isRecord` → `compressed[key]` must also be `isRecord`; recurse.
      * `[ ]`   `source[key]` is an `Array` → `compressed[key]` must also be an `Array` with `length <= source[key].length` ("arrays may lose low-value elements," never gain); if `source[key][0]` is `isRecord` (object-array), every element of `compressed[key]` must be `isRecord` with a key set EQUAL to `Object.keys(source[key][0]).sort()` (the homogeneous-array assumption — this node's explicit, stated scoping decision: compression victims' arrays are homogeneous item collections, e.g. `features: [{feature_name,...}]`, matching every array shape this epic's own document-rendering fixtures use) — a heterogeneous source array is out of scope for this algorithm and is not claimed to be handled.
      * `[ ]`   `source[key]` is a `string` → `compressed[key]` must also be a `string` (any length — "condense string values in place").
      * `[ ]`   `source[key]` is a `number`/`boolean`/`null` → `compressed[key]` must be STRICTLY EQUAL (the template instructs condensing STRING values only; numbers/booleans/null are not authorized to change).
      * `[ ]`   Top-level call: both `source` and `compressed` must be `isRecord` (a COMPRESS json-mode victim's `content` is always the completed source JSON object, never a bare primitive or array, per `enqueueCompressJobs`'s own `mode:'json'` victim contract).
    * `[ ]`   Continuation-signaling finish_reason on a COMPRESS response is a HARD, NON-RETRIABLE failure, not an attempt to continue: `isDialecticContinueReason(resolvedFinish)` on a COMPRESS job → `return { error: new Error('COMPRESS job response signaled continuation; COMPRESS jobs have no continuation path — the map-reduce split at spawn time already bounds each child to fit the model window'), retriable: false }`. Grounded explicitly (not invented ad hoc): the ratified design states COMPRESS jobs "NEVER trigger compression themselves (recursion guard)" and gives COMPRESS no continuation infrastructure anywhere in the plan; treating an unexpected continuation signal as a hard failure is the only behavior consistent with that guard — inventing ad hoc continuation support for COMPRESS would be unratified scope creep.
    * `[ ]`   Wallet debit is IDENTICAL machinery to EXECUTE's (`saveResponse.ts:726-802`), reused verbatim inside `saveCompressResponse` with COMPRESS's own field sources (`relatedEntityId: job.id`, `userId: compressPayload.user_id`, `walletId: compressPayload.walletId`, `modelConfig` from the SAME `ai_providers` row lookup keyed on `compressPayload.model_id`) — per the scope's explicit "Wallet debit with real user/wallet attribution flows through the normal stream persistence machinery," this node does NOT special-case or skip the `ChatMessageRow`-pair `databaseOperation` side effect; it is part of "the machinery," unmodified.
    * `[ ]`   Persistence: build a `ResourceUploadContext` (`pathContext: { projectId: compressPayload.projectId, fileType: FileType.CompressedContext, sessionId: compressPayload.sessionId, iteration: compressPayload.iterationNumber, stageSlug: compressPayload.stageSlug, targetKey: compressPayload.targetKey, sourceType: compressPayload.sourceType, sourceId: compressPayload.sourceId, documentKey: compressPayload.documentKey, chunkIndex: compressPayload.chunk_index, chunkTotal: compressPayload.chunk_total }`, `fileContent: Buffer.from(contentForStorage)`, `mimeType: 'text/markdown'`, `sizeBytes: <encoded byte length>`, `userId: compressPayload.user_id`, `description: <victim/target description>`, `resourceTypeForDb: FileType.CompressedContext`) INLINE — matching `renderDocument.ts`'s own established inline-`ResourceUploadContext`-construction precedent (this sprint's prior node), NOT via `deps.buildUploadContext` (that function is purpose-built for `ModelContributionUploadContext`/`ContributionMetadata`, EXECUTE-only, untouched by this node). Call `deps.fileManager.uploadAndRegisterFile(uploadContext)` — the ALREADY-SHIPPED Sprint-2 resource branch upserts on `(storage_bucket, storage_path, file_name)`, so a second call to the same canonical path (dedup layer 3, per the scope) updates rather than duplicates — no special-case idempotency handling is needed in THIS node beyond checking `savedResult.error`.
    * `[ ]`   No `SaveResponseSuccessReturn.status` widening is needed: COMPRESS always returns `{ status: 'completed' }` — the existing union already covers it; COMPRESS has no `needs_continuation`/`continuation_limit_reached` concept.
    * `[ ]`   Job completion: mark the COMPRESS job's OWN row `status: 'completed'`, `completed_at`, `attempt_count: job.attempt_count + 1` — SAME update shape as EXECUTE's (`:1203-1211`) — with a COMPRESS-appropriate minimal `results` payload (`JSON.stringify({ compressedResourceId: contribution-equivalent id })`, NOT `ModelProcessingResult`, which is contribution-shaped and has no field for a resource artifact).
    * `[ ]`   NO notifications: no `sendJobNotificationEvent`, no `sendContributionReceivedEvent`, no `sendContributionGenerationCompleteEvent`. Grounded in the already-authored Sprint-3 `processCompressJob.ts` node's own explicit characterization — "No notifications (COMPRESS is invisible infrastructure)" — applied here consistently to the callback side of the SAME job.
    * `[ ]`   Cross-node dependency flag (pre-existing gap, NOT fixed by this node): `CompressionMode`/`isCompressionMode` are referenced as already-owned by the Sprint-2 `path_constructor.ts` node in three already-authored Sprint-3 nodes (`enqueueCompressJobs.ts`, and by extension `assembleCompressionPrompt.ts`/`processCompressJob.ts`), but the ACTUAL, ALREADY-SHIPPED `path_constructor.ts` node (WS-C, checked complete, code on disk) never added `CompressionMode`/`isCompressionMode` to `file_manager.types.ts`/`type_guards.file_manager.ts` — grep-verified absent from the entire `supabase/functions` tree. This node's `DialecticCompressJobPayload.mode: CompressionMode` field inherits the SAME assumption every sibling Sprint-3 node already makes (none of them re-added it either) — this is a pre-existing, epic-wide gap that blocks Sprint-3 compilation regardless of this node, not something introduced or fixable by `saveResponse.ts` alone (it does not own that type). Flagged for a small follow-up amendment to the already-completed WS-C node before Sprint 3 implementation begins; NOT actioned here.

  * `[ ]`   `role`
    * `[ ]`   Existing worker orchestration node (stream-callback persistence), gaining a second, parallel job-type branch. `saveCompressResponse` is the terminal persistence step for the COMPRESS/model-call transport this epic's Sprint-3 nodes already wired (`processCompressJob.ts` → `enqueueModelCall` → background worker → callback → THIS function).
    * `[ ]`   Out of scope: victim selection, spawn/dedup logic (`compressPrompt.ts`/`enqueueCompressJobs.ts`, Sprint 5/3), map-reduce chunk reduction (`compressPrompt.ts`'s reduce phase, Sprint 5), overlay application (`applyCompressionOverlay.ts`, Sprint 5) — this node persists ONE child's output; it does not know or care whether its victim was chunked, nor does it reassemble chunks.

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/saveResponse/` (existing) plus one companion touch, `_shared/utils/errors.ts` (new `CompressionDriftError` class only).
    * `[ ]`   Inside boundary: the `job.job_type` routing decision; the entire `saveCompressResponse` COMPRESS lifecycle (payload narrowing, provider/session fetch, aiResponse build, retry, mode-based content handling, structural validation, template resolution/load/render, wallet debit, resource persistence, job completion).
    * `[ ]`   Outside boundary: the EXECUTE path (`saveResponse.ts`'s existing ~1130 lines, untouched); `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument`'s own internals (this sprint's prior nodes — called, not reimplemented); `enqueueCompressJobs`'s dedup-layer-1/spawn logic and `DialecticCompressJobPayload`'s own definition (Sprint-3 node — imported, not redefined).

  * `[ ]`   `deps`
    * `[ ]`   `SaveResponseDeps` gains THREE new REQUIRED fields (no default — "every dependency is injected, no exception," this epic's established rule): `resolveTemplateFilename: BoundResolveTemplateFilenameFn` (imported from `../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts`), `loadDocumentTemplate: BoundLoadDocumentTemplateFn` (imported from `../../_shared/services/document_renderer/loadDocumentTemplate/loadDocumentTemplate.interface.ts`), `renderStructuredDocument: RenderStructuredDocumentFn` (imported from `../../_shared/services/document_renderer/renderStructuredDocument/renderStructuredDocument.types.ts`) — this sprint's four prior nodes, each already-authored.
    * `[ ]`   `renderStructuredDocument` is INJECTED here (unlike `renderDocument.ts`'s own direct-import choice for the same pure function) — a deliberate, DIFFERENT per-consumer DI decision: `renderDocument.integration.test.ts` proves behavior via DB/storage-mocked end-to-end oracle cases (direct-import is sufficient there), whereas `saveResponse.test.ts`'s existing suite is unit-style, per-branch, and this node's own COMPRESS route-matrix tests (below) isolate the render step by stubbing it — injection serves that isolation. `renderStructuredDocument`'s own contract (`(templateText, structuredRecord, documentKey) => string`, no `Deps`/`Params`/`Payload` split, pure) is UNCHANGED by either consumer's choice.
    * `[ ]`   `isDialecticCompressJobPayload`/`DialecticCompressJobPayload` are imported directly (not injected — they are types/pure guards, matching how `isEnqueueRenderJobSuccessReturn`/`isDialecticStageSlug` are already directly imported at `saveResponse.ts:69-72`, not injected as `Deps`).
    * `[ ]`   Confirm: no reverse dependency (this node imports FROM its four Sprint-4 siblings and Sprint-3's `enqueueCompressJobs`, never the other direction); no lateral violation (`dialectic-worker/saveResponse/` continues to import only from `_shared/` and sibling `dialectic-worker/` modules, as it already does).

  * `[ ]`   `saveResponse.interface.ts`
    * `[ ]`   `SaveResponseDeps` gains `resolveTemplateFilename: BoundResolveTemplateFilenameFn; loadDocumentTemplate: BoundLoadDocumentTemplateFn; renderStructuredDocument: RenderStructuredDocumentFn;` — three new required fields, alphabetically inserted alongside the existing eleven per this file's existing field ordering style.
    * `[ ]`   Add the three new type imports (`BoundResolveTemplateFilenameFn`, `BoundLoadDocumentTemplateFn`, `RenderStructuredDocumentFn`) at the top of the file, alongside the existing `BoundEnqueueRenderJobFn` import.
    * `[ ]`   `SaveResponseParams`/`SaveResponsePayload`/`SaveResponseSuccessReturn`/`SaveResponseErrorReturn`/`SaveResponseReturn`/`SaveResponseFn`/`SaveResponseRequestBody`/`NodeTokenUsage` are UNCHANGED — the callback's own request/response shape is identical for EXECUTE and COMPRESS (both ride the same stream transport).
    * `[ ]`   No `.interface.test.ts` change: this file has none today (confirmed — `saveResponse.interface.test.ts` exists in the directory but is untouched by this node beyond whatever new-field coverage the guard test below adds; no NEW contract shape is introduced, only new required fields on an already-tested Deps interface).

  * `[ ]`   `saveResponse.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: the Netlify stream callback (`netlifyResponse/index.ts`, unchanged call site — `netlifyResponseHandler` is untouched per the scope's own "a COMPRESS response is an ordinary stream response").
    * `[ ]`   Required interaction (COMPRESS branch): one `dialectic_generation_jobs` read (shared prefix), one `ai_providers` read, one `dialectic_sessions` read, one `token_wallets` read, one `resolveTemplateFilename` call (json mode only), one `loadDocumentTemplate` call (json mode only), one `renderStructuredDocument` call (json mode only, pure), one `debitTokens` call, one `fileManager.uploadAndRegisterFile` write, one `dialectic_generation_jobs` update (job completion) — no notification calls.
    * `[ ]`   Failure modes: `isDialecticCompressJobPayload` rejection (non-retriable); provider/session/wallet not-found (non-retriable, matching EXECUTE's existing style); empty/errored AI response or malformed json-mode content (RETRY, via `deps.retryJob`, matching EXECUTE); a continuation-signaling finish_reason (non-retriable, COMPRESS-specific hard fail); structural drift (non-retriable `CompressionDriftError`); template resolution/load failure (surfaced verbatim from the sibling module); upload failure (non-retriable, matching EXECUTE's existing upload-error style).

  * `[ ]`   `saveResponse.guard.ts`
    * `[ ]`   `isSaveResponseDeps` — add the three new keys (`resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument`) to the `keys` array and their `typeof v.<key> !== 'function'` checks, matching this file's existing per-field verification style exactly.
    * `[ ]`   `isSaveResponseParams`/`isSaveResponsePayload`/`isSaveResponseSuccessReturn`/`isSaveResponseErrorReturn`/`isSaveResponseRequestBody` are UNCHANGED (shapes unchanged, per the interface note above).
    * `[ ]`   `saveResponse.guard.test.ts` (existing file, gains cases): `isSaveResponseDeps` rejects a Deps object missing any ONE of the three new fields; accepts a fully-populated Deps object including them.

  * `[ ]`   `saveResponse.mock.ts`
    * `[ ]`   `createMockSaveResponseDeps` — add the three new fields to its `base: SaveResponseDeps` literal: `resolveTemplateFilename: async () => ({ templateFilename: 'mock_template.md' })`, `loadDocumentTemplate: async () => ({ templateText: 'mock template text' })`, `renderStructuredDocument: () => 'mock rendered markdown'` — matching this file's existing minimal-stub style for every other function field (`continueJob`/`retryJob`/`enqueueRenderJob`).
    * `[ ]`   NEW factory `createMockDialecticCompressJobPayload(overrides?: Partial<DialecticCompressJobPayload>): DialecticCompressJobPayload` — default a valid `mode:'json'` payload with `sourceType:'contribution'` and all three template-identity fields (`documentKey`, `docType`, `sourceStageSlug`) present, matching `enqueueCompressJobs.mock.ts`'s own `buildDialecticCompressJobPayload` shape (that node's mock, imported and re-used where possible rather than re-derived — if `enqueueCompressJobs.mock.ts` already exports a suitable builder by the time this node lands, THIS factory re-exports/wraps it instead of duplicating field defaults; if not yet available, this node defines its own minimal version and flags the duplication for later consolidation).
    * `[ ]`   NEW factory `createMockCompressJobRow(payloadOverrides?, rowOverrides?): DialecticJobRow` — mirrors `createMockJobRow` (`:413-448`) but with `job_type: 'COMPRESS'` and a `DialecticCompressJobPayload` (validated via `isJson`, matching `createMockJobRow`'s own precondition check at `:417-421`).
    * `[ ]`   NEW `createMockSaveResponseParamsWithQueuedCompressJob(jobPayload: DialecticCompressJobPayload, jobRowOverrides?, providerRowOverrides?)` — mirrors `createMockSaveResponseParamsWithQueuedJob` (`:452-551`) exactly (same `dialectic_generation_jobs`/`ai_providers`/`dialectic_sessions`/`token_wallets` generic mock scaffolding), substituting `createMockCompressJobRow` for `createMockJobRow`.

  * `[ ]`   `saveResponse.compress.test.ts` (NEW file — this file already has 9 test files split by concern, e.g. `saveResponse.continue.test.ts`/`saveResponse.pathContext.test.ts`/`saveResponse.rawJsonOnly.test.ts`; the COMPRESS route matrix is its own coherent concern and follows that established split rather than growing `saveResponse.test.ts` itself)
    * `[ ]`   Route matrix, per the scope's own explicit call-out for this node:
      * `[ ]`   EXECUTE job → completely unaffected: existing `saveResponse.test.ts` and siblings continue to pass UNMODIFIED (proof this node's routing insertion is a true no-op for `job.job_type !== 'COMPRESS'`).
      * `[ ]`   COMPRESS, `mode:'json'`, valid structural match → `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument` are each called exactly once with the payload's `sourceStageSlug`/`docType`/`documentKey`/`projectId`; `fileManager.uploadAndRegisterFile` is called once with `pathContext.fileType === FileType.CompressedContext` and the rendered markdown as `fileContent`; job row updates to `status:'completed'`; return `{ status: 'completed' }`; no notification service method is called (assert every notification spy has ZERO calls).
      * `[ ]`   COMPRESS, `mode:'text'` → `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument` are NEVER called (assert zero calls on each); `fileManager.uploadAndRegisterFile`'s `fileContent` equals the trimmed raw AI response text.
      * `[ ]`   COMPRESS, `mode:'json'`, structural mismatch (compressed output drops a source key) → `result.error instanceof CompressionDriftError`, `result.retriable === false`; `fileManager.uploadAndRegisterFile` is NEVER called (assert zero calls); the job row is NOT marked completed.
      * `[ ]`   COMPRESS, existing artifact at the canonical path (dedup layer 3) → `fileManager.uploadAndRegisterFile`'s upsert semantics (already proven generically by the shipped Sprint-2 `file_manager.upload.test.ts` node) mean a second call for the same canonical path returns success without a distinct code path here; assert `saveCompressResponse` returns `{ status: 'completed' }` in this case too, with no special-case branch required.
      * `[ ]`   COMPRESS, `mode:'json'`, missing one of `documentKey`/`docType`/`sourceStageSlug` on the job payload → `isDialecticCompressJobPayload` rejects it upstream (this is a guard-test case, not a `saveCompressResponse` case — included here for completeness of the route matrix, cross-referencing `enqueueCompressJobs.guard.test.ts`'s own coverage of the same invariant) → `saveCompressResponse` returns a non-retriable `Error` before any provider/session fetch.
      * `[ ]`   COMPRESS, empty/errored AI response → `deps.retryJob` is called with the SAME argument shape EXECUTE's own retry call uses (`modelId`, `api_identifier`, `error`, `processingTimeMs`); returns `{ status: 'completed' }` (retry-dispatched, not a hard failure) — mirrors `saveResponse.test.ts`'s own existing EXECUTE retry-path assertions.
      * `[ ]`   COMPRESS, continuation-signaling `finish_reason` → non-retriable `Error` naming the recursion-guard rationale; `deps.retryJob` is NOT called (this is a hard stop, not a retry).
      * `[ ]`   Wallet debit: assert `deps.debitTokens` is called once with `relatedEntityId === job.id` and the SAME `databaseOperation` shape (two `ChatMessageRow`s) as an EXECUTE call would produce, proving the shared machinery claim.
    * `[ ]`   Do NOT re-test: `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument`'s own internal correctness (each already fully covered by its own `.test.ts`, this sprint's prior nodes) — only THIS function's call sequencing and argument-passing to them.

  * `[ ]`   `construction`
    * `[ ]`   Routing insertion (existing function, `saveResponse.ts:145`, ONE new statement): fetch `job` → `if (job.job_type === 'COMPRESS') { return await saveCompressResponse(deps, params, payload, job, dbClient); }` → (existing EXECUTE logic continues unchanged below, unreachable for COMPRESS).
    * `[ ]`   `saveCompressResponse(deps, params, payload, job, dbClient)` sequential order:
      1. Narrow `job.payload` via `isDialecticCompressJobPayload` → invalid → non-retriable `Error`.
      2. Fetch `ai_providers` by `compressPayload.model_id`, `dialectic_sessions` by `compressPayload.sessionId` — SAME query/error-handling shape as EXECUTE's own (`saveResponse.ts:210-254`), not-found/error → non-retriable `Error`.
      3. Build `aiResponse: UnifiedAIResponse` from `payload` (the stream callback's `assembled_content`/`token_usage`/`finish_reason`) — SAME construction as `saveResponse.ts:263-300`.
      4. `aiResponse.error || !aiResponse.content` → `deps.retryJob(...)` → return `{ status: 'completed' }` (SAME as `:309-325`).
      5. `resolvedFinish = deps.resolveFinishReason(aiResponse)`; `resolvedFinish === 'error'` → `deps.retryJob(...)` → return `{ status: 'completed' }` (SAME as `:327-345`).
      6. `isDialecticContinueReason(resolvedFinish)` → non-retriable `Error` (COMPRESS-specific hard fail, per `objective`).
      7. Mode branch (per `objective`): json → sanitize/parse/retry-on-malformed → parse source `compressPayload.content` → `structuralKeyShapeMatches` → mismatch → non-retriable `CompressionDriftError` → resolve/load/render → `contentForStorage`; text → `contentForStorage = aiResponse.content.trim()`.
      8. Wallet debit (SAME machinery as `:726-802`, COMPRESS's own field sources).
      9. Build `ResourceUploadContext`, call `deps.fileManager.uploadAndRegisterFile` → error → non-retriable `Error` (SAME error-shape style as EXECUTE's own upload-error branch, `:840-845`).
      10. Update `dialectic_generation_jobs` row to `completed` with a COMPRESS-shaped `results` payload.
      11. Return `{ status: 'completed' }`. No notifications at any step.

  * `[ ]`   `saveResponse.ts` (Implementation)
    * `[ ]`   Insert the one-line routing branch at `:145` per `construction`.
    * `[ ]`   Add module-scope unexported `structuralKeyShapeMatches(source: unknown, compressed: unknown): boolean` per the algorithm in `objective`, using the ALREADY-IMPORTED `isRecord` (`:23`).
    * `[ ]`   Add module-scope unexported `async function saveCompressResponse(deps: SaveResponseDeps, params: SaveResponseParams, payload: SaveResponsePayload, job: DialecticJobRow, dbClient: SupabaseClient<Database>): Promise<SaveResponseReturn>` implementing `construction`'s eleven steps.
    * `[ ]`   Add the new imports: `isDialecticCompressJobPayload`, `DialecticCompressJobPayload` from `../enqueueCompressJobs/enqueueCompressJobs.guard.ts`/`.interface.ts`; `CompressionDriftError` from `../../_shared/utils/errors.ts` (alongside the already-imported `RenderJobValidationError`, `:35`).
    * `[ ]`   No change to any existing EXECUTE-path line beyond the one-line routing insertion — every line from `saveResponse.ts:146` through `:1276` is byte-for-byte unchanged.

  * `[ ]`   `saveResponse.provides.ts`
    * `[ ]`   Add `createMockDialecticCompressJobPayload`, `createMockCompressJobRow`, `createMockSaveResponseParamsWithQueuedCompressJob` to the existing mock re-export block (`:24-39`) — no NEW type exports beyond what `SaveResponseDeps` (already re-exported, now widened) already covers.

  * `[ ]`   `saveResponse.integration.test.ts` (existing file, gains ONE new bounded-subsystem case)
    * `[ ]`   Bounded subsystem: real `saveResponse`, real `structuralKeyShapeMatches`, real `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument` (not their mocks — matching this epic's "no mock repo-owned function" rule); only the Supabase client, storage, and `fileManager` are mocked (the genuine external boundaries).
    * `[ ]`   A COMPRESS job whose mocked stream response is well-formed json-mode compressed content produces a real `ResourceUploadContext` upload call with `pathContext.fileType === FileType.CompressedContext` and rendered Markdown content matching what the REAL `renderStructuredDocument` produces for the given template/data — proving the full chain (narrow → validate → resolve → load → render → persist) end to end, not mocked at any layer below the DB/storage adapters.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (stream-callback persistence, terminal node in the COMPRESS model-call transport). Deps inward: `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument` (this sprint's prior nodes), `isDialecticCompressJobPayload`/`DialecticCompressJobPayload` (Sprint-3 `enqueueCompressJobs.ts`), `FileType.CompressedContext`/`PathContext` fields (already-shipped Sprint-2 `path_constructor.ts`). Provides outward: the persisted `CompressedContext` resource artifact, consumed by `compressPrompt.ts`'s dedup/overlay logic and `applyCompressionOverlay.ts` (Sprint 5, later). No cycles: this node does not import from `dialectic-service/`'s recipe-step machinery.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Every existing EXECUTE-path test in `saveResponse.test.ts` and its 8 siblings passes UNMODIFIED after this node.
    * `[ ]`   A COMPRESS json-mode job with matching structure produces exactly one `fileManager.uploadAndRegisterFile` call with `pathContext.fileType === FileType.CompressedContext` and Markdown content from the REAL template/render pipeline.
    * `[ ]`   A COMPRESS json-mode job whose compressed output drops or adds a source key fails with `CompressionDriftError`, `retriable: false`, and NO upload call.
    * `[ ]`   A COMPRESS text-mode job persists the trimmed raw response with no template/render calls.
    * `[ ]`   A COMPRESS job never calls any `notificationService` method.
    * `[ ]`   A COMPRESS job's wallet debit uses the same `debitTokens` machinery and `ChatMessageRow`-pair side effect as an EXECUTE job.
    * `[ ]`   A continuation-signaling `finish_reason` on a COMPRESS job is a non-retriable failure, never a retry or a continuation attempt.
    * `[ ]`   `_shared/utils/errors.ts` gains exactly one new class, `CompressionDriftError`, and no other change.

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