# Plan: Compression Jobs (Scope & Order)

## TL;DR
Prompt compression becomes a first-class, job-driven, schema-targeted process. When a model
call's input exceeds the model's window, the worker selects ONE victim by
`token size × (1 − inputsRelevance weight)` (pure computation, zero model calls), spawns a
COMPRESS child job that runs on the existing stream model-call path using the parent job's own
model, persists the compressed output as a first-class resource artifact, overlays it on
resume, recounts, and repeats until the preflight fits. The legacy RAG compression core
(rag_service, indexing_service, dialectic_memory, match_dialectic_chunks, embeddingClient) is
removed: its retrieval was structurally unfit for this pipeline (generic stage-template
queries, session-wide rather than victim-scoped matching, all victims converging to the same
snippet blob), and a compressor given the next step's output schema preserves exactly the
information the next agent needs.

This document is the scope-and-order plan: per-file summary tickets in strict build-dependency
order, grouped into workstreams. Each workstream terminates at an integration seam where the
application builds, runs, and passes tests (new code paths may be unreachable until a later
workstream) — that seam is the commit marker. Transient non-compilable states are permitted
WITHIN a workstream (it is not done until it compiles). 

## DESIGN DECISIONS
1. **COMPRESS job type**, analogous to RENDER: an as-needed infrastructure job, NOT part of
   recipe steps, excluded from step status and progress DTOs, never routed through
   recipe-step machinery. COMPRESS jobs NEVER trigger compression themselves (recursion guard:
   a COMPRESS call whose INPUT cannot fit its model window is a hard failure, not a nested
   compression). The recursion guard bounds INPUT-window fit only; it is not a continuation
   ban — a COMPRESS response whose OUTPUT is incomplete continues through the ordinary
   continuation path, like any other agent response (see decision 8).
2. **Parent job's own model** performs compression — `model_id` is already in the parent
   payload; no provider lookup, no new provider flag. This is a spawning convenience only:
   persisted artifacts are model-agnostic, and reuse never considers which model compressed
   them.
3. **Victim selection is pure computation**: `candidate tokens × (1 − inputsRelevance weight)`.
   No embeddings anywhere. One victim per resume cycle; stop as soon as the preflight fits.
4. **Map-reduce for oversized victims** (victim + compressor prompt exceeds the model window):
   split via text splitter → N chunk-COMPRESS children → reduce = concatenate in `chunk_index`
   order → ONE re-compress pass only if the concatenation still exceeds the per-victim target
   (bounded: every pass strictly shrinks its input). Note: because every document is itself a
   model output capped by per-response output-token limits, and model input windows exceed
   output windows, a single victim exceeding a compression call's input window is nearly
   unreachable — map-reduce and the decision-1 hard-fail guard are defensive layers, not
   expected flows.
5. **History messages** compress through the same COMPRESS mechanism as documents.
6. **New FileType** `FileType.CompressedContext = 'compressed_context'` (ResourceFileTypes),
   persisted via fileManager as a `ResourceUploadContext`. Canonical identity =
   (session, consuming stage, TARGET schema key, source identity[, chunk_index]). Compression
   targets a SPECIFIC schema: one stage may consume the same source document to produce
   several schemas (I, J, K), so the target key is part of identity — an artifact compressed
   for Schema_I is never served to a job producing Schema_J. Naming: artifacts are never
   user-facing and live in the consuming stage's `_work` subdirectory as
   `{source_basename}_compressed_for_{target_key}.md`; map-reduce intermediates as
   `{source_basename}_compressed_for_{target_key}_chunk_{i}of{n}.md`, retained (all
   intermediate work product is preserved). `{source_basename}` is the source's own
   semantic identity, never a digest: `{document_key}` for a contribution or resource
   victim; `{document_key}_feedback` for a feedback victim — the document it answers,
   matching the existing `user_feedback` convention, and the suffix is what keeps a
   document and its own feedback distinct inside one working set; `message_{role}_{id}`
   carrying the FULL message id for a history victim, a conversational turn being the one
   source with no semantic identity of its own, so its id is its identity. No stage slug
   enters the basename: document keys are already unique to their producing stage, and the
   consuming stage is the path root. Identity members follow the same split — contribution,
   resource AND feedback are keyed by `documentKey`; only history is keyed by `sourceId`.
7. **The compression prompt is produced by the prompt-assembler service** from a seeded
   `system_prompts` template (resolved by its unique name — COMPRESS jobs are not recipe steps
   and have no `prompt_template_id`), in one of two modes:
   **JSON mode** (victims that originated as skeleton-completed JSON, i.e. model
   contributions): the compressor receives the COMPLETED SOURCE JSON plus the target skeleton;
   contract: return EXACTLY the source structure — every key preserved, values condensed,
   arrays may shorten, nothing added — preserving facts relevant to the target schema.
   **Text mode** (user feedback documents, history messages, and ALL map-reduce chunks —
   chunking JSON would destroy the structure being validated): source text plus the target
   skeleton; freeform compressed text out (there is no structure to drift from).
8. **Completeness is verified against the source.** A compressor is an agent completing a
   template, so its output is validated by the same completeness check every completed template
   uses — the missing-keys comparison in `determineContinuation` (does the returned object still
   contain every key of the source it was sent?). An incomplete result is not a failure: the
   missing keys return to the agent via the ordinary continuation path, exactly as for any agent
   response. Only the survival of the SOURCE keys is verified — that is what governs
   renderability; compression-against-target is subjective and is not judged. Rendering is a
   job, never a synchronous step: a completed compressed response is persisted as
   `CompressedContextRawJson`, and — if its preserved source OutputType is renderable — a RENDER
   job reads that raw artifact and writes the `CompressedContext` markdown (single file, no user
   notification) format-identical to its uncompressed siblings. Both FileTypes route to the
   consuming stage's `_work`, never the user-facing finished directory.
   A text-mode victim has no template to render against — it is freeform user input, and the
   compressor condenses it against its own judgement of what the next step's template will
   need — so it is never rendered and never dispatches a RENDER job. Its compressed string is
   extracted from the raw response and persisted as `CompressedContext` by the same
   `saveResponse` call that writes the raw artifact: an internal storage write, not a
   transform, and therefore synchronous by the same rule that makes the reduce concatenation
   synchronous. Every compression victim therefore ends with a `CompressedContext` artifact at
   its canonical path, which is the single artifact the overlay and all three dedup layers
   look for — there is no second FileType to fall back to anywhere.
9. **Compress once per target, reuse across agents** — three-layer opportunistic dedup:
   `enqueueCompressJobs` skips when the canonical artifact exists; `processCompressJob`
   re-checks existence immediately before enqueuing the model call and completes without
   spending when it appeared in the meantime; `saveResponse` writes idempotently to the
   canonical path. Truly simultaneous in-flight duplicates may rarely double-spend one
   compression call — accepted; no locking machinery.
10. **RAG core removed in this effort**: rag_service, indexing_service, dialectic_memory,
   match_dialectic_chunks, all embeddingClient call sites, and the pluggable-strategy seam in
   `vector_utils.interface.ts` — `ICompressionStrategy`, `CompressionStrategyDeps`,
   `CompressionStrategyParams`, `CompressionStrategyPayload`. That seam exists to make retrieval
   swappable, and nothing is swapped once victim selection is pure computation: what survives is
   the scorer itself, `getSortedCompressionCandidates`, under the canonical contract below.
   Removal is ordered so nothing references an asset when it is removed.

## TARGET ARCHITECTURE — end-to-end flow for an oversized model input
1. Parent EXECUTE job: `processSimpleJob` → `gatherArtifacts` (already-compressed victims are
   overlaid via `applyCompressionOverlay`) → `prepareModelJob` counts tokens and asks
   `calculateAffordability`. Fits and affordable → enqueue the stream call, done.
2. Over budget → `prepareModelJob` branches on the job row's `job_type`; an EXECUTE job calls
   `compressPrompt`: score candidates (resource documents + the compressible
   history window) by `tokens × (1 − relevanceWeight)`; exclude candidates whose
   CompressedContext artifact for THIS compression target already exists; select the ONE
   victim with the lowest score.
3. `enqueueCompressJobs`: dedup layer 1 — skip if the canonical artifact exists (a sibling
   agent's job already compressed this source for this target). For contribution victims,
   locate the completed source JSON artifact and set `mode:'json'`; feedback/history victims
   are `mode:'text'`. Victim + prompt envelope fits the model window → ONE COMPRESS child;
   else split → N chunk children (`chunk_index`/`chunk_total`, always `mode:'text'`). Insert
   `dialectic_generation_jobs` rows (`job_type='COMPRESS'`, `parent_job_id` = parent). Insert
   failure = hard stop. The CALLER (`compressPrompt`) then sets the parent
   `status='waiting_for_children'` and returns a pending SUCCESS
   (`waiting_for_children: true`) — the existing DB completion trigger wakes the parent when
   all children finish. Deferral is success, not error.
4. `processCompressJob` (per child): validates `DialecticCompressJobPayload`; dedup layer 2 —
   re-checks canonical artifact existence and completes without spending when it already
   exists; assembles the prompt via `assembleCompressionPrompt`, or via
   `assembleContinuationPrompt` when the payload carries a continuation count; then calls
   `prepareModelJob` with that prompt and the parent's model. `prepareModelJob` resolves the tier
   cap, reads the wallet and asks affordability exactly as it does for an EXECUTE job, and its
   `job_type` branch is the recursion guard: a COMPRESS job over budget hard-fails rather than
   compressing. Nothing names an artifact type at dispatch. This is not merely the same model-call
   transport an EXECUTE job uses — it is the same function.
5. The stream callback returns → `saveResponse` handles a COMPRESS response through the same
   path an EXECUTE response takes, diverging only at the tail. Parse / sanitize / retry on
   malformed or empty output; verify completeness against the source via
   `determineContinuation` (incomplete → continue via the ordinary continuation path, NOT a
   failure); on a complete result persist via fileManager using the source's own upload-context
   arm with `fileType: CompressedContextRawJson` at the canonical `_work/raw_responses` path,
   idempotently (dedup layer 3); if the preserved source OutputType is renderable, dispatch a
   RENDER job (source-identity keyed), and set the COMPRESS job `waiting_for_children` to await
   that RENDER child (the existing completion trigger wakes it, and then the parent, once the
   render finishes); if it is a text-mode victim, extract the compressed string from the raw
   response and persist it as `CompressedContext` through the same upload-context arm, dispatch
   no RENDER job, and complete the COMPRESS job. `saveResponse` holds no renderer dependency —
   it never resolves a template, loads one, or renders. No
   user-facing notifications. Wallet debit with real user/wallet attribution flows through the
   normal stream persistence machinery. (`netlifyResponseHandler` is untouched — a COMPRESS
   response is an ordinary stream response.)
6. Parent resumes. `compressPrompt` reduce check: a chunked victim with all chunk artifacts
   but no final artifact → concatenate in `chunk_index` order (fileManager read, synchronous);
   still over the per-victim target → spawn ONE re-compress COMPRESS child → pause again;
   else persist the concatenation as the victim's final artifact (fileManager write,
   synchronous). Rule: external model call = async job; a transform such as rendering is also a
   job; only an internal DB/storage call — like this reduce concatenation — is synchronous.
7. `gatherArtifacts` → `applyCompressionOverlay` swaps victim content (resource documents AND
   history messages) with the persisted CompressedContext, preserving
   id/document_key/stage_slug/type. Lookup is FORWARD: each candidate already carries its own
   identity, so the overlay builds that candidate's canonical path with `constructStoragePath`
   (`documentKey` for a resource or feedback candidate, `sourceId` for a history message) and
   does one existence read — the same direction dedup layer 1 uses. Nothing is reverse-parsed
   from a stored path. The orchestrator never knows a swap occurred.
8. Recount. Still over → next victim (step 2). Fits → enqueue the real stream call.

**Key reuse:** `parent_job_id` + `waiting_for_children` + the completion trigger are existing
infrastructure. The entire model-call transport (enqueueModelCall → background worker →
callback → saveResponse) is the production stream path; COMPRESS adds a routing case, not a
transport.

## COMMIT MAP
Each workstream terminates at a seam where the application builds, runs, and passes tests, and
that seam is its commit. Workstreams are addressed by name and by what they depend on, never by
ordinal.

| Workstream | Depends on | Commit seam (app builds + runs + tests green) |
|---|---|---|
| WS-J Job payload & model-call SSOT | WS-P | every job payload inherits one base with one guard family; one function dispatches every model call; the prompt's resource id is recorded once, on the job row and on both artifact tables |
| WS-S saveResponse decomposition + COMPRESS persistence | WS-J | saveResponse is a thin orchestrator over nine modules with `SaveResponseDeps` unchanged; a COMPRESS response persists, continues when incomplete, dispatches its render for a renderable source and writes its extracted artifact for a text source; the repo compiles again; no COMPRESS jobs exist yet |
| WS-D Orchestration cutover + WS-X RAG removal | WS-S | Compression loop live; RAG core gone; `retryJob` canonical and surfacing both its failures; every production tokenizer real; full-chain test green |

Workplan-file split: `Compression Jobs.md` carries WS-0, WS-C, WS-R, WS-B and is retired;
`Compression Jobs 2.md` carries WS-N, WS-I and WS-P through `processCompressJob`;
`Compression Jobs 3.md` carries the remainder of WS-P, then WS-J, WS-S, WS-D and WS-X. Split further at
a workstream boundary when a file approaches ~1800 lines.

---

## WS-J — JOB PAYLOAD & MODEL-CALL SSOT (depends WS-P; gates WS-S and WS-D)
Every job payload inherits `DialecticBaseJobPayload`, and one guard family validates them:
`isDialecticBaseJobPayload` holds the base member checks and the base allowed-key set, and each
arm's guard delegates to it and declares only its own members. No payload redeclares a base member,
and no payload carries a fact the job row already owns — `job_type` is the row's column, which
`processJob`, `deriveStepStatuses` and `buildJobProgressDtos` read, and the owner is the row's
`user_id`. What a payload does carry is `user_jwt`: it is what moves a call across the Supabase
gateway and is derivable from nothing else.

A guard names the member at fault. `isDialecticBaseJobPayload` throws a per-member diagnostic, as `isDialecticExecuteJobPayload` and `isDialecticRenderJobPayload` already do, and every arm guard that delegates to it throws on the same terms — `isDialecticCompressJobPayload`, and `isProcessCompressJobPayload` which delegates to that in turn. A bare `false` from a twenty-member payload tells a developer only that something was wrong; the diagnostic tells them which member and what it held, which is the whole reason the two legacy payload guards were written that way and is the standard COMPRESS aligns to.

A throwing guard cannot select a branch, so no branch is selected by one. Where a job row is in hand and its `job_type` separates the arms, the arm is selected by that column — the one record of a job's type, already read by `processJob`, `deriveStepStatuses` and `buildJobProgressDtos` — and the payload guard narrows inside the arm that selection chose. That is the shape the WS-S `saveResponse` orchestrator takes: discriminate on `job_type`, then narrow. Where no row exists to consult and only a call payload or a params object is in hand, the arm is selected by structure — `enqueueRenderJob` over its call payload, `renderDocument` over its params. Where a row is in hand but two arms share one `job_type` — a contribution RENDER row and a compressed RENDER row are both `'RENDER'`, so the column separates nothing — the arm is selected by a NAMED, non-throwing structural predicate owned by the payload's own module, and the throwing guard narrows inside the arm it chose; `processRenderJob` is the one site of this form. A selection predicate answers a question and returns a boolean; a guard proves a type and throws. The two are never the same symbol, and the three rules partition by what the caller holds and by whether the column separates the arms — none is an exception to another.

One function dispatches every model call. `prepareModelJob` narrows the job payload with the base
guard, reads only base members, and is the sole construction site of `EnqueueModelCallParams`. Every
model call the repo makes therefore resolves the same tier cap from `user_subscriptions`, reads the
same wallet balance, and passes the same affordability preflight. Nothing names an artifact type at
dispatch: `output_type` is a recipe product and a COMPRESS job has no recipe, so
`EnqueueModelCallParams` carries no `output_type` and no admission gate over one. What a response
becomes is `saveResponse`'s decision, taken from the job row's `job_type` and the payload.

Affordability and compression are separate responsibilities. `calculateAffordability` answers whether
a request is affordable and what the output cap is, and causes no side effect; `compressPrompt` makes
an over-budget working set fit; `prepareModelJob` composes the two. On over budget it branches on the
job row's `job_type` — the authoritative record of what a job is — so an EXECUTE job compresses and
returns pending while a COMPRESS job takes decision 1's recursion guard. The guard is selected by a
fact the row already carries, never by withholding a collaborator.

The prompt's resource id is recorded once. `DialecticBaseJobPayload` owns
`source_prompt_resource_id`; `prepareModelJob` writes it onto the job row's own payload after
assembly and before the enqueue, and omits it from `ChatApiRequest`, because the thread it belongs
to is internal to the repo and the provider can do nothing with it. `saveResponse` reads it back off
the narrowed payload where the response re-enters the boundary, and both `dialectic_contributions`
and `dialectic_project_resources` record it in one column of one name, so a produced row of either
kind names the prompt that produced it.

Every function this workstream touches returns a discriminated `Success | Error` union. No failure
reaches a caller as an optional property on a bag.

Strict node order: `enqueueCompressJobs` → `enqueueRenderJob` → `processRenderJob` → `enqueueModelCall` → `calculateAffordability` → `prepareModelJob` → `processSimpleJob` → `prompt-assembler` → `assembleContinuationPrompt` → `continueJob` → `processCompressJob` → `processJob` → compression-prompt-provenance migration → `file_manager` → `buildUploadContext` → `createJobContext` → `index.ts`. The payload family lands first because every guard and every consumer below reads it, and because the guards it makes throwing are what force the three selector nodes that follow; `processRenderJob` follows `enqueueRenderJob` immediately because that node lands both the throwing row-payload guard and the selection predicate this one consumes, and the interval between them is the one window in which a contribution RENDER row would raise at the selector; `enqueueModelCall` precedes the sites that construct its params; `calculateAffordability` precedes `prepareModelJob` because the dispatcher composes it; `processSimpleJob` follows `prepareModelJob` because it stops supplying a member that function stops declaring; `prompt-assembler` precedes `assembleContinuationPrompt` because that node lands the union this one's implementation returns, and both precede `processCompressJob`, which narrows it; `processJob` follows `processCompressJob` because that node changes the deps shape `processJob` is the sole construction site of, so the file takes one node carrying both that alignment and its own guard narrowing; and the migration and its two writers close the workstream because the column must exist before the type that carries it, and the type before the arm that sets it.
* ✏️ `supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.ts` — the payload
  family's landing node: this is the first source file whose own type is expressed as an extension of
  the base, so the base and its guard ride here.
  RIDES HERE (owner): `dialectic-service/dialectic.interface.ts` — `DialecticBaseJobPayload` gains
  `source_prompt_resource_id?: string`, the member every payload inherits and none redeclares, and
  `DialecticSimpleJobPayload` carries no `job_type`.
  `_shared/utils/type-guards/type_guards.dialectic.ts` — `isDialecticBaseJobPayload` holds the base
  member checks and the base allowed-key set; `isDialecticExecuteJobPayload` and
  `isDialecticRenderJobPayload` each delegate to it and declare only their own arm's members and
  arm-specific allowed keys, so a base member is stated in one place and admitted in one place.
  `_shared/dialectic.mock.ts` — the payload builders compose a base builder.
  This file's own type: `DialecticCompressJobPayload extends DialecticBaseJobPayload` and declares
  only what is its own — `targetKey`, `mode`, `content`, `sourceType`, `sourceId`, `role`,
  `documentKey`, `docType`, `sourceStageSlug`, `chunk_index`, `chunk_total` — narrowing `stageSlug`
  and `iterationNumber` from the base's optional forms to required. It carries no `job_type`: the
  row's column is the one record of a job's type, and its two sibling payloads carry none either. It
  carries no `user_id`: the row's `user_id` column holds the owner, written here from
  `parentJob.user_id`. It inherits `user_jwt` and `idempotencyKey`, both required — this function
  threads the parent EXECUTE payload's own jwt onto every child exactly as it threads `model_slug`,
  and writes the idempotency key onto the child payload as well as the child row.
  `isDialecticCompressJobPayload` delegates to `isDialecticBaseJobPayload`, which checks every
  inherited member including `source_prompt_resource_id`; it restates no base member of its own,
  discriminates on `mode`/`sourceType`/`content`/`targetKey` as its siblings discriminate on their
  own required members, and enforces the same strict unknown-key sweep its two siblings enforce.
  `enqueueCompressJobsParams` gains `userJwt`.
  Both guards throw a per-member diagnostic rather than returning `false`, per the workstream rule
  above. `isDialecticBaseJobPayload` owns the diagnostics for the base members and keeps the exact
  strings the two legacy guards already emit — `Missing or invalid walletId.`, `Invalid stageSlug.`
  and the rest — so the cases asserting them in `type_guards.dialectic.test.ts` and, through
  `processRenderJob`'s error surface, in `processRenderJob.test.ts` pass unchanged; the delegating
  guards let the throw propagate rather than catching it. `isDialecticCompressJobPayload` adds
  diagnostics of its own for the members it declares, each naming the member and what it held.
  Support: enqueueCompressJobs tests, interface, guards, mock; `type_guards.dialectic` tests for the
  base guard and both delegating guards; `dialectic.mock.ts` builders. The compress guard's case
  checklist asserts thrown diagnostics rather than `false` and corrupts a real discriminant —
  `mode`, `sourceType`, `content`, `targetKey` — in place of the retired `job_type` case, that member
  no longer being on the payload. Its positive cases stay boolean assertions.
* ✏️ `supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts` —
  `DialecticRenderCompressedContextJobPayload extends DialecticBaseJobPayload`, adding only
  `targetKey`, `sourceType`, `documentKey` and `template_filename` and narrowing the base's optional
  `stageSlug` and `iterationNumber` to required, which `processRenderJob` reads to build
  `RenderCompressedContextParams`. The base keeps both optional, and `GenerateContributionsPayload`
  keeps them optional beneath it: that payload is assembled before a stage or an iteration exists, so
  requiring them at the root would be false. Requiring them is each arm's business, and both
  compression payloads do it. Its guard delegates to `isDialecticBaseJobPayload` for every base
  member and therefore throws. Both compression payloads then name the authentication member
  identically, `user_jwt`, from one declaration.
  RIDES HERE: a named, non-throwing selection predicate in this module's guard file, for
  `processRenderJob`'s node below — it answers whether a row's payload is the compressed form by the
  structural facts that separate them, `targetKey` and `sourceType` present with `documentIdentity`
  and `sourceContributionId` absent, and it returns a plain boolean rather than a type predicate,
  narrowing being the throwing guard's job inside the arm the predicate selects. Named
  `isCompressedRenderPayloadShape`, matching the `isLoggerShape`/`isSupabaseClientShape` vocabulary
  this repo already uses for a shallow structural check.
  RIDES HERE: the payload union `EnqueueRenderJobFn` and `BoundEnqueueRenderJobFn` compose inline at
  their annotation sites — `EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload` — is
  declared once in `enqueueRenderJob.interface.ts` as `EnqueueRenderJobCallPayload` and both function
  types annotate with that name. The union exists only because a COMPRESS job dispatches a render, so
  it is this epic's to correct rather than a bystander's, and it is corrected in the one node that
  already opens the file.
  RIDES HERE: the same defect in the body. The `renderPayload` local is annotated
  `DialecticRenderJobPayload | DialecticRenderCompressedContextJobPayload`, carrying "either payload"
  through a function that has already branched and knows which one it holds. It is deleted: each
  branch declares its payload as a const of that branch's own concrete type, proven by that type's own
  guard exactly as both branches already prove it, and each branch builds its own
  `TablesInsert<"dialectic_generation_jobs">` row — one named type, not a union — which the shared
  tail inserts. The `idempotencyKey` local is a plain `string` in both branches and is untouched,
  including the `23505` recovery select that reads it, and every log line, error message, error type,
  retriable flag, early return and success value is unchanged: this changes which type a local holds,
  never what the function does. The existing suite is the restructure's regression oracle.
  `isEnqueueRenderCompressedContextPayload` STAYS a plain boolean type predicate and is untouched.
  The workstream's throwing rule governs job payload guards, and a call payload is not a job payload —
  it extends no base, crosses no queue, and this predicate is the entry selector between the
  function's two branches, so a throw there would raise on every ordinary contribution dispatch. It is
  the same selector-versus-validator distinction the determinant rule above draws, appearing inside a
  function rather than across one.
  Support: enqueueRenderJob tests, interface, interface test, guards, guard test, mock.
* ✏️ `supabase/functions/dialectic-worker/processRenderJob.ts` — select the compressed-row arm with
  `isCompressedRenderPayloadShape` instead of `isDialecticRenderCompressedContextJobPayload`. That
  guard throws once the payload above re-bases, and it currently sits at the selector AHEAD of the
  function's `try`, so an ordinary contribution RENDER row — which the compressed guard exists to
  reject — would raise uncaught, before any status update and before any failure notification. Both
  rows carry `job_type: 'RENDER'`, so the column separates nothing here and the selection is
  structural, per the workstream rule above.
  The selection moves INSIDE the `try`, beside the contribution gate it partners: a throw from either
  arm's guard then reaches the catch that already fails the row and reports, rather than escaping the
  function. Inside the compressed arm the throwing
  `isDialecticRenderCompressedContextJobPayload` narrows the payload and its diagnostic names the
  member at fault; inside the contribution arm `isDialecticRenderJobPayload` does the same, as it
  already does. `processCompressedRenderJob` and the contribution path are otherwise unchanged, and
  the compressed arm still sends no notification of any kind.
  Support: processRenderJob tests, whose cases asserting the compressed selector are restated against
  the predicate, and whose contribution cases gain one pinning that a contribution row is routed to
  the contribution arm rather than raising at the selector.
* ✏️ `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts` — this function takes
  no `output_type`. `EnqueueModelCallParams` declares no such member, `isEnqueueModelCallParams`
  checks none, and the admission gate over it is deleted. The member names an artifact type that this
  function forwards nowhere — not into the stream event, not into the request, not onto a row — while
  a COMPRESS job, spawned by an oversized input rather than by a recipe, has no recipe-driven output
  to name. What a response becomes is `saveResponse`'s decision, taken from the job row's `job_type`
  and the payload. Every other member and every branch is unchanged.
  Support: enqueueModelCall tests, interface, interface test, guard, guard test, mock.
* ✏️ `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts` —
  this function answers one question: is the request affordable, and what is the output cap. It holds
  no `compressPrompt` dep, takes no `compressionStrategy` in its payload, and carries no `Compressed`
  flavor on its return. Compression is a different responsibility; a function that decides
  affordability causes no side effect and spawns no job. It reports its verdict and the resolved
  input token count, and the caller decides what an over-budget request warrants.
  Support: calculateAffordability tests, interface, guards, mock.
* ✏️ `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts` — the single dispatcher
  for every model call. It narrows `job.payload` with `isDialecticBaseJobPayload`, every member it
  reads being a base member. `PrepareModelJobParams` declares neither `sessionData` nor `authToken`,
  and `isPrepareModelJobParams` checks for neither. This function names neither identifier anywhere,
  so neither is forwarded to any callee and no downstream consumer exists. Once `processCompressJob`
  is a caller, a required `sessionData: DialecticSessionRow` would oblige the COMPRESS arm to read
  `dialectic_sessions` — a query it has no other reason to make — purely to fill a slot no branch
  reads; the auth token that function does hold is already on its own params.
  It composes affordability and compression rather than letting one own the other: `compressPrompt`
  moves into this function's deps, and on an over-budget verdict it branches on the job row's
  `job_type` — an EXECUTE job calls `compressPrompt` and returns the pending variant, and a COMPRESS
  job takes decision 1's recursion guard. Nothing passed to `enqueueModelCall` names an artifact
  type.
  The prompt-provenance write lands here and only here: after affordability resolves and before
  `enqueueModelCall`, this function writes `source_prompt_resource_id` from
  `promptConstructionPayload` onto the job row's own payload, and omits it from `ChatApiRequest`. A
  failed write returns the error arm.
  Support: prepareModelJob tests, interface, interface test, guards, guard test, mock, integration
  test, inputsRequired test.
* ✏️ `supabase/functions/dialectic-worker/processSimpleJob.ts` — its `PrepareModelJobParams` literal
  carries neither `sessionData` nor `authToken`. It is the sole production construction site of the
  two params members that reach no branch, so neither can leave its
  contract while this file supplies it. `sessionData` remains in this function for its own use; what
  ends is passing it onward. Nothing else in this file changes here; its compression edits and its
  full-chain test are WS-D's.
  Support: processSimpleJob tests; `dialectic-worker/index.test.ts`, whose parallel
  `PrepareModelJobParams` construction is test infrastructure for this same contract.
* ✏️ `supabase/functions/_shared/prompt-assembler/prompt-assembler.ts` —
  `BoundAssembleContinuationPromptFn` and the `IPromptAssembler` method it fronts return
  `AssembledPrompt | AssembleContinuationPromptErrorReturn`, so a continuation assembly failure is a
  value the caller narrows rather than an exception it cannot catch. `assembleCompressionPrompt`
  already returns its union; this makes the facade's two prompt members agree.
  Support: prompt-assembler tests, interface, mock; assembleContinuationPrompt tests and interface.
* ✏️ `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.ts`
  — the COMPRESS branch is selected by the job row's `job_type`, not by calling
  `isDialecticCompressJobPayload` as a predicate. That call is a branch selector today, and the guard
  throws as of the `enqueueCompressJobs` node above, so an EXECUTE continuation — the ordinary case
  that must fall through to the contribution branch — would raise instead of routing. The row carries
  the answer already: `job.job_type === 'COMPRESS'` selects the branch, and the guard narrows
  `job.payload` inside it, which is the only place a throw is a diagnostic rather than a
  misclassification. The contribution branch narrows with `isDialecticExecuteJobPayload` inside its
  own arm on the same terms. The branch's body — resolving its prior output from the canonical
  `CompressedContextRawJson` artifact and persisting its continuation prompt as `CompressionPrompt`
  at that same identity — is unchanged from the WS-P node that built it, and this function's return
  is the union its interface declares as of the `prompt-assembler` node above.
  That union is produced here, not merely declared: every failure this function reports leaves as
  `AssembleContinuationPromptErrorReturn` rather than as a throw. Its two dozen `PRECONDITION_FAILED`
  and artifact-read failures each become the error arm carrying the same message and a `retriable`
  flag, and the payload guard's per-member diagnostic — thrown inside the arm the row's `job_type`
  already selected — is caught at this function's own boundary and returned on that arm too. A caller
  narrows one union and catches nothing; a function that returns a union for some failures and throws
  for others obliges every caller to do both, which is the defect the facade's alignment removes.
  Support: assembleContinuationPrompt tests, whose case asserting that a payload rejected by
  `isDialecticCompressJobPayload` takes the contribution branch is restated against the row column:
  a row whose `job_type` is not `COMPRESS` takes the contribution branch, and a COMPRESS row whose
  payload fails the guard surfaces the guard's diagnostic rather than silently taking the other
  branch.
* ✏️ `supabase/functions/dialectic-worker/continueJob.ts` — `IContinueJobResult` is a discriminated
  union with named arms — enqueued, refused for the continuation limit, and error — so every caller
  narrows a discriminant rather than testing optional properties for presence. Its COMPRESS arm's
  payload literal carries no `job_type`; the row it inserts carries `job_type: 'COMPRESS'`, that
  column being the one record of a job's type.
  Which arm the function takes is read from that same column on the job it was handed. The two arms
  are selected by `job.job_type`, and each narrows its own payload inside its own arm —
  `isDialecticCompressJobPayload` on the COMPRESS arm, `isDialecticExecuteJobPayload` on the EXECUTE
  arm. Both guards throw as of the `enqueueCompressJobs` node above, so neither can answer which arm
  a job takes; the column answers it without a predicate, and the guards do what they are for, which
  is to say precisely which member of an already-identified payload is malformed.
  Support: continueJob tests; `createJobContext/JobContext.interface.ts` for the return type.
  `saveResponse`'s narrowing of the new union is WS-S's `finalizeContributionJob` node.
* ✏️ `supabase/functions/dialectic-worker/processCompressJob/processCompressJob.ts` — this function
  owns dedup layer 2, consuming-step and target-schema resolution, and the choice between compression
  and continuation assembly. It owns no part of the model call: it composes a
  `PromptConstructionPayload` from the assembled prompt and calls `prepareModelJob`, which is what
  makes the recursion guard, the tier cap, the wallet balance read and the affordability preflight
  identical to those of every other model call in the repo. It
  constructs no `ChatApiRequest`, no `EnqueueModelCallParams` and no `UserConfig`, validates no provider
  config, extracts no context window, counts no preflight tokens, and writes no job-row payload update.
  It resolves its own `ai_providers` row from the payload's `model_id` and passes it to the dispatcher
  as `providerRow`, exactly as `processSimpleJob` does on the EXECUTE path: which provider a job runs
  against is the orchestrator's to resolve on both paths, and `PrepareModelJobParams` declares that
  member for both callers. What leaves this function is the model-call work over that row — the
  `isAiModelExtendedConfig` validation, the input and output window extraction, and the bespoke budget
  subtraction the dispatcher's `job_type` recursion guard replaces. Both assembly
  branches narrow their returned union before use.
  `isProcessCompressJobPayload` is `isDialecticCompressJobPayload` under another name — it returns
  that call directly — so it throws as of the `enqueueCompressJobs` node above. That is correct for
  it: `processJob` has already selected the COMPRESS arm from the row's `job_type` before this
  function is reached, so a payload failing here is a malformed COMPRESS payload, not a
  differently-typed one, and the diagnostic names the member. Its two cases asserting `false` for a
  non-record root become thrown-diagnostic assertions.
  Support: processCompressJob tests, interface, guards, mock, integration test.
* ✏️ `supabase/functions/dialectic-worker/processJob.ts` — the file's one node in this workstream,
  carrying both of the changes that reach it. Its `COMPRESS` case already selects on the row's
  `job_type` — the `switch` is over that column — so the arm selection is unchanged and is the
  pattern the two selector nodes above adopt. What changes is the narrowing inside the arm: the
  `isDialecticCompressJobPayload` call throws as of the `enqueueCompressJobs` node, so the
  hand-thrown `Invalid COMPRESS payload for job ${jobId}` that follows a `false` return is deleted
  and the guard's own per-member diagnostic propagates in its place — strictly more precise, and the
  reason the guard was made to throw. `processJob.test.ts`'s case asserting that string asserts the
  guard's diagnostic instead.
  It ALSO rebuilds the `ProcessCompressJobDeps` literal it constructs inline, which is that type's
  sole construction site: the `processCompressJob` node above moves the model call into
  `prepareModelJob`, so the literal drops `enqueueModelCall`, `countTokens`, `getEncoding`,
  `countTokensAnthropic` and the `isKnownTiktokenEncoding` closure around `rawGetEncoding`, and
  carries what that function's new deps declare. Both edits land in this one node because they are
  the file's only two touches in this workstream, which is why the node sits after
  `processCompressJob` rather than immediately after the guard change.
  The `EXECUTE`, `PLAN` and `RENDER` cases are unchanged.
  Support: processJob tests.
* 🆕 [exempt] `supabase/migrations/<ts>_compression_prompt_provenance.sql` — `dialectic_project_resources`
  gains `source_prompt_resource_id UUID` with
  `ADD CONSTRAINT fk_project_resources_source_prompt_resource_id FOREIGN KEY
  (source_prompt_resource_id) REFERENCES public.dialectic_project_resources(id)`, mirroring the
  column and constraint `20250922165259_document_centric_generation.sql` adds to
  `dialectic_contributions`. The FK is self-referencing because a prompt IS a
  `dialectic_project_resources` row — `TurnPrompt`, `PlannerPrompt` and `CompressionPrompt` are all
  `ResourceFileTypes`. A compression artifact is itself a resource row, which `source_contribution_id`
  cannot address, so both artifact tables carry the same column under the same name and a produced
  row of either kind names the prompt that produced it through one column of one name. Nullable and
  additive: every existing resource row keeps a null. Regen `supabase/functions/types_db.ts`
  (additive column plus one relationship entry; compile-safe).
* ✏️ `supabase/functions/_shared/services/file_manager.ts` — one node, both provenance writes. The
  `TablesInsert<'dialectic_contributions'>` literal carries
  `source_prompt_resource_id: meta.source_prompt_resource_id ?? null`, so the column
  `20250922165259_document_centric_generation.sql` adds has the writer that makes a contribution name
  the `TurnPrompt` that produced it. The `TablesInsert<'dialectic_project_resources'>` literal
  carries `source_prompt_resource_id: resourceContext.sourcePromptResourceId ?? null`, beside the
  `source_contribution_id` line that reads its own provenance member the same way. One column name,
  one spelling, both artifact tables.
  RIDES HERE (owner): `ResourceUploadContext` gains `sourcePromptResourceId?: string` in
  `_shared/types/file_manager.types.ts`, adjacent to `resourceTypeForDb` and
  `resourceDescriptionForDb`. It is an upload-context member rather than a `PathContext` member
  because that is where the contribution path carries it —
  `contributionMetadata.source_prompt_resource_id` — and because it addresses nothing about the path.
  The member is optional, so every existing `ResourceUploadContext` construction compiles unchanged.
  Support: file_manager tests (a resource upload carrying the member registers it and one omitting it
  registers null; a contribution upload carrying it registers it and one omitting it registers null).
* ✏️ `supabase/functions/_shared/utils/buildUploadContext/buildUploadContext.ts` — the resource arm
  sets `sourcePromptResourceId` on the `ResourceUploadContext` it returns, from a
  `sourcePromptResourceId: string | undefined` member on `BuildUploadContextResourceParams` — the
  same member name, the same type and the same optionality the contribution params declare for
  `BuildUploadContextParams`, whose arm feeds `contributionMetadata.source_prompt_resource_id`. One
  builder, two arms, one spelling.
  This is a second node against this file, after the WS-I node that lands its identity split, for the
  same reason `path_constructor` and `enqueueCompressJobs` take one node per workstream: the member
  does not exist until the migration above lands.
  Support: buildUploadContext tests, interface, guards, mock.
* ✏️ `supabase/functions/dialectic-worker/createJobContext/createJobContext.ts` — `IJobContext` and
  `JobContextParams` carry no compression member. The victim scorer is `compressPrompt`'s own dep,
  bound where that closure is built, and the WS-D `createJobContext` node lands it from an
  implementation `JobContextParams` carries; a scorer on `IJobContext` would be carried by every job
  type and used by none that does not compress.
  `IPrepareModelJobContext` gains `compressPrompt: BoundCompressPromptFn`, because
  `PrepareModelJobDeps` declares that member and a slice that cannot furnish what its one consumer
  declares is not a slice.
  This factory also becomes the sole assembler of that consumer's deps. `createPrepareModelJobContext`
  has no production caller today: `dialectic-worker/index.ts` hand-builds `boundCompressPrompt`,
  `boundCalculateAffordability` and the `PrepareModelJobDeps` literal inside a per-invocation closure
  out of a dozen captured locals, so the graph is constructed twice, in two shapes, and the factory
  written to construct it is reached only by its own suites. `JobContextParams` therefore stops
  carrying a pre-bound `prepareModelJob` closure and carries `prepareModelJobFn` beside the
  `compressPromptFn` and `calculateAffordabilityFn` it already takes, and `createJobContext` composes
  `IJobContext.prepareModelJob` by calling `createPrepareModelJobContext` for the slice and binding the
  implementation to it. Deps are assembled where every other dep in this repo is assembled, once, and
  every contract change in this workstream lands in one place instead of two.
  Support: `JobContext.interface.ts`, `JobContext.guard.ts` + `JobContext.guard.test.ts`,
  `JobContext.mock.ts`, `createJobContext.test.ts`,
  `createJobContext.interface.test.ts`, `createJobContext.integration.test.ts`.
* ✏️ `supabase/functions/dialectic-worker/index.ts` — the root supplies and composes nothing. It
  supplies `prepareModelJobFn` as an unbound
  implementation on the `createJobContext` params, and deletes the `boundCompressPrompt` and
  `boundCalculateAffordability` closures and the inline `PrepareModelJobDeps` literal it builds inside
  its `prepareModelJob` member. Constructing a deps object at a call site is the inversion of injecting
  at the boundary, and it is what let the two constructions of that graph drift apart; after this the
  factory holds the only one. Support: `index.test.ts`, whose parallel construction is test
  infrastructure for this same wiring.
* **COMMIT WS-J** — every job payload inherits one base validated by one guard family; affordability
  and compression are separate functions composed by one dispatcher, so one tier cap, one wallet check
  and one affordability preflight govern compression and contribution alike, and nothing names an
  artifact type at dispatch; the prompt's resource id is written once onto the job row and recorded in
  one column on both artifact tables; every touched function returns a discriminated union. No
  COMPRESS jobs exist yet.

## WS-S — saveResponse DECOMPOSITION + COMPRESS RESPONSE PERSISTENCE (depends WS-J; gates WS-D)
`saveResponse.ts` is a thin orchestrator over function-folder modules, not one body carrying every
responsibility in a straight line. The COMPRESS tail is a module beside the contribution one rather
than a branch inside it, so the two persistence models are never interleaved in one function.

The cut follows the axis the data flow already has. A SHARED FRONT HALF — job and provider
resolution, response assembly, debit, content preparation — is job-type agnostic and serves both
arms, in that order: the debit precedes content preparation because the spend it records precedes
everything this function can still decide. A CONTRIBUTION BACK HALF — canonical identity, upload, `document_relationships` persistence,
render dispatch, notifications, continuation, final status — is anchored on `dialectic_contributions`
end to end and is what a COMPRESS response has no use for. `saveResponse.ts` ends as a thin
orchestrator with its public signature UNCHANGED: guard, load context, route on `job.job_type`,
call one arm, return what that arm returns.

`SaveResponseDeps` DOES NOT CHANGE, and that is this workstream's load-bearing decision. The
sub-modules are internal siblings of one function, not external collaborators, so the orchestrator
imports them directly and slices its existing deps into each one's narrower typed `Deps` at the call
site — the treatment `createPlanJobContext`/`createRenderJobContext` already give `processJob`.
Injecting them instead would add nine members to a contract that fifteen files outside the module
depend on — `netlifyResponse/index.ts` with its handler, interface, mock, guard, guard test,
interface test and integration test; `createJobContext`'s `ISaveResponseContext`, factory, guard,
guard test and two suites; and `dialectic-worker/index.integration.test.ts` — and would need a
composition-root capstone node exactly like the one WS-N needed for `resolveTemplateFilename`. Every
one of those files stays shut. The accepted cost: the orchestrator's unit tier cannot stub a sibling
to force its error branch, and drives those branches through the shared deps it forwards, which is
where the observable effects already are.

COPY-FIRST sequencing (the WS-B pattern): every module lands as a COPY with its own tests while
`saveResponse.ts` stays untouched, so the duplication is deliberate and dormant, and the single
relocation node at the end retires it. The seven existing suites — `saveResponse.test.ts`,
`.continue`, `.notifications`, `.pathContext`, `.rawJsonOnly`, `.planValidation` and
`.assembleDocument` — are the relocation's regression oracle, pinned to the unchanged public
signature, then retained IN FULL as the orchestrator's integration tier while the module tests add
part-in-isolation coverage. No case is deleted.

The repo does not compile until this workstream's last node: the monolith's `determineContinuation`
literal lacks the member WS-P made required, and that literal dies with the body the relocation
deletes. Every module below is authored and tested against its own copy, so the break blocks nothing
in between.

These requirements cut across the workstream's modules. The `dialectic_sessions` read is an
existence check and selects `id`. `processingTimeMs` is a parameter the caller supplies. The wallet
debit runs as soon as the response is assembled, ahead of every decision that can still reject the
job. `projectOwnerUserId` is `job.user_id`. The continuation-count check carries one message and two
conditions, absent and not greater than zero. The identity block narrows the job payload once,
through the payload's owning guard, and reads typed members thereafter.
`persistContributionRelationships` returns the updated contribution row. `shouldRender` is computed
and consumed inside one module. Every failure carries its own message, naming the condition that
produced it and the identifiers needed to act on it; no message serves two conditions. No failure is
logged and then abandoned: every error a module observes is RETURNED on its error arm — propagated
unchanged when its producer already typed it, and as a new typed error the module owns when the
failure is its own — and execution stops at the failure rather than running the work below it. A
module that logs an error and continues is defective however the monolith behaved.

Strict node order: `assembleAiResponse` → `loadJobContext` → `prepareResponseContent` →
`debitForResponse` → `resolveContributionIdentity` → `persistContributionRelationships` →
`finalizeContributionJob` → `saveContributionResponse` → `saveCompressedResponse` → `saveResponse`.
The four shared modules come first because both arms consume them; the three contribution modules
before the arm that composes them; both arms before the orchestrator that routes to them. Every one
is a function-folder module under `dialectic-worker/`, canonical shape
`Fn(deps, params, payload) => Success | Error`, with the full support system per the new-package
rule.
* 🆕 `supabase/functions/dialectic-worker/assembleAiResponse/assembleAiResponse.ts` —
  PURE, no deps and no I/O: the `UnifiedAIResponse` assembly. Trims `assembled_content` to null when
  empty, takes the stream's `token_usage` when present and synthesizes one from the payload's
  preflight input tokens plus the completion's character count when it is not, narrows
  `finish_reason` through `isFinishReason` with `unknown` as its fallback, and composes
  `rawProviderResponse`. `processingTimeMs` is a parameter the caller supplies, so the value reported
  is the interval actually measured. No mock (the `path_constructor` precedent).
  Support: interface + tests.
* 🆕 `supabase/functions/dialectic-worker/loadJobContext/loadJobContext.ts` — the
  `dialectic_generation_jobs` read with its not-found and non-record failures, the payload member
  census and its six validations (`iterationNumber`, `stageSlug`, `sessionId`, `model_id`,
  `walletId`, `projectId` — every one a `DialecticBaseJobPayload` member, so both arms carry them by
  inheritance rather than by two payload types happening to spell them alike), the `ai_providers`
  read with `isSelectedAiProvider` and `isAiModelExtendedConfig`, the `dialectic_sessions` existence
  read, and `projectOwnerUserId`/`attempt_count`. It narrows the payload with
  `isDialecticBaseJobPayload` and no further: the arm-specific members differ and the orchestrator is
  what discriminates.
  Returns the job row, the provider row, the validated config and the owner id.
  Support: full module (three DB boundaries → mock required).
* 🆕 `supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.ts`
  — the empty-or-error retry, the error-finish-reason retry, `resolveFinishReason`,
  `isIntermediateChunk`, the intermediate passthrough, the sanitize → parse → retry sequence, and the
  repo's ONLY `determineContinuation` call. OWNS the `sourceObject` member WS-P made required,
  supplied per arm: the object parsed from a COMPRESS payload's own `content`, `undefined` for an
  EXECUTE job. A `mode:'text'` COMPRESS response takes neither sanitize nor parse — its content is
  freeform prose, `JSON.parse` would fail every attempt to the retry cap, and there is no structure
  to drift from — so its content passes through verbatim and no completeness check runs. Four
  conditions dispatch a retry — an empty or errored response, an `'error'` finish reason, a
  sanitization result its own guard rejects, and a `JSON.parse` throw — and all four share ONE
  success flavor, distinct from the intermediate and prepared flavors and carrying no content members at
  all, so a caller can neither read a retried outcome as storable content nor mistake it for
  completion.
  It is authored against `retryJob`'s contract as WS-S receives it: that function returns
  `Promise<{ error?: Error }>`, so this module reads that value and
  returns its own error arm when a dispatch failed rather than reporting a retry that did not
  happen. WS-D canonicalizes that contract and gives this module a follow-up node to narrow the
  union; do not anticipate it here — the union does not exist until WS-D, and WS-S must commit
  green without it.
  Support: full module.
* 🆕 `supabase/functions/dialectic-worker/debitForResponse/debitForResponse.ts` — the
  `token_wallets` read, the currency and balance validations, the `TokenWallet` construction, the
  `DebitTokensParams` literal with its two-`ChatMessageRow` `databaseOperation` closure, and the
  `debitTokens` call. HOISTED to immediately after `assembleAiResponse`, ahead of
  `prepareResponseContent` and ahead of the routing, because `saveResponse` runs on the stream
  CALLBACK: by the time any line of it executes the provider has already generated the response and
  the tokens are already consumed, so the debit is bookkeeping for money spent, never authorization
  for money about to be. The hoist is what puts every paid-for call into the ledger: no return below
  it can exit having spent money the wallet never recorded — not the `loadJobContext`
  failures, not the EXECUTE identity validations, and least of all the retry paths, each of
  which dispatches another model call, so a job that exhausts `max_retries`
  makes `max_retries + 1` calls and debits nothing. The hoist is what makes the ledger match the
  invoice. Its `databaseOperation` closure records `aiResponse.content` as the model emitted it,
  not the sanitized `contentForStorage` — a chat message is a transient record of what was said,
  nothing is gained by storing the repaired version, and that substitution removes the closure's
  only dependency on `prepareResponseContent`, which is what frees the debit to move at all.
  Residual, and not fixable by ordering: `loadJobContext`'s own failures cannot debit, because
  attributing a spend needs the wallet id, the provider row and the model config that those reads
  are what failed to produce. Support: full module.
* 🆕 `supabase/functions/dialectic-worker/resolveContributionIdentity/resolveContributionIdentity.ts`
  — EXECUTE-only identity resolution. It NARROWS `job.payload` with the owning
  `isDialecticExecuteJobPayload` rather than re-checking `canonicalPathParams` by hand: the member is
  REQUIRED on `DialecticExecuteJobPayload` in `dialectic.interface.ts` and checked by that guard in
  `type_guards.dialectic.ts`, so a hand-rolled `isRecord` test on the callback is a weaker second
  copy of a check the type makes at authoring time and the enqueue path makes at dispatch — the
  inlined-foreign-structure substitute.
  Narrowing is still required because the row returns from the database as `Json`; what is retired
  is treating that narrowing as the validation gate. `isDialecticExecuteJobPayload` THROWS by
  design rather than returning false, so that the failure names the exact member at fault —
  `Missing or invalid canonicalPathParams.` — where a boolean would report only that something in a
  twenty-member payload was wrong. The call is therefore wrapped, and the thrown error is
  propagated into this module's error arm UNCHANGED, never re-worded: it is a typed diagnostic from
  the payload's owning guard, and it is strictly more precise than the
  `job.payload.canonicalPathParams is required` string a hand-rolled check produces. No
  caller writes the boolean form. It then performs the
  `restOfCanonicalPathParams` assembly, `targetContributionId` resolution from payload then row and
  the `isContinuationForStorage` it implies, the continuation-count validation trio, the
  `rawProviderResponse` check, the document-related required-values sweep with its single composed
  message, `storageFileType` selection, `source_group` resolution including the two recipe-step reads
  that admit the `per_model` consolidation exception, `sourceGroupFragment`, and `document_key`.
  Support: full module.
* 🆕 `supabase/functions/dialectic-worker/persistContributionRelationships/persistContributionRelationships.ts`
  — the continuation branch, the init-and-merge branch, both `dialectic_contributions` updates, the
  four `RenderJobValidationError` validations, and the `stageRelationshipForStage` extraction.
  RETURNS the updated contribution row rather than mutating one in place, because a mutation later
  code depends on cannot cross a module boundary. Support: full module.
* 🆕 `supabase/functions/dialectic-worker/finalizeContributionJob/finalizeContributionJob.ts`
  — the RENDER dispatch and the `shouldRender` it yields, the chunk notification, the
  `ModelProcessingResult`, the continuation call with its limit-reached cap assembly
  and continued notification, the final-chunk notification and `assembleAndSaveFinalDocument`, the
  job-row update, and the three completion notifications. It carries no prompt-resource back-link.
  Provenance runs one way: `prepareModelJob` writes `source_prompt_resource_id` onto the job payload
  and `file_manager` records it on the produced row, so a contribution names the `TurnPrompt` that
  produced it through `dialectic_contributions.source_prompt_resource_id`. Updating the prompt
  resource's own `source_contribution_id` in the opposite direction is a second method for one fact,
  and this module writes exactly one row and touches exactly one table.
  Every failure this tail observes reaches the error arm, per the cross-cutting rule
  above: the RENDER dispatch's error and `continueJob`'s error propagate UNCHANGED, and a failed
  completion update returns a `FinalizeContributionJobUpdateError` this module owns — so a job whose
  completion was never recorded stops reporting `completed`. RIDES HERE (owner): that class in
  `_shared/utils/errors.ts`, beside `RenderJobValidationError`, holding the job id, the attempted
  status and the driver's message AS DATA rather than interpolated, exactly as the WS-D `retryJob`
  node shapes `RetryJobUpdateError`. Support: full module.
* 🆕 `supabase/functions/dialectic-worker/saveContributionResponse/saveContributionResponse.ts`
  — the EXECUTE arm: composes `resolveContributionIdentity`, the contribution upload
  (`buildUploadContext`'s contribution arm, `isModelContributionContext`, `uploadAndRegisterFile`,
  `isDialecticContribution`), `persistContributionRelationships` and `finalizeContributionJob`, and
  returns the `SaveResponseReturn` the orchestrator passes straight through. Support: full module.
* 🆕 `supabase/functions/dialectic-worker/saveCompressedResponse/saveCompressedResponse.ts`
  — the COMPRESS arm, reached with the payload already narrowed by the orchestrator and the content
  already prepared. A structured (`mode:'json'`) source was verified against the source it was sent —
  an incomplete result continues via the ordinary continuation path, it is not a failure; a
  `mode:'text'` source (feedback/history) has no key structure to verify, so no completeness
  comparison runs for it — but a text victim continues on the same terms every other response does
  when the model signals it did not finish. Absent a structural check, that signal is the finish
  reason, which `prepareResponseContent` carries through for a text victim exactly as for a
  structured one; an unfinished text compression resumes rather than persisting truncated. The
  continuation gate is therefore evaluated for BOTH modes and sits ahead of the two-arm tail below:
  a response that is still owed more never reaches its persistence arm. The completeness
  judgement itself is `prepareResponseContent`'s, made before this module is reached; this arm
  consumes its result. The continuation gate is `shouldContinue` alone: the EXECUTE path conjoins it
  with `continueUntilComplete`, a COMPRESS payload carries no such member, and that conjunction would
  close decision 8's continuation permanently. Persist the completed
  compressed response as `FileType.CompressedContextRawJson` through the source's own
  upload-context arm (`buildUploadContext`'s resource arm) at the canonical
  `_work/raw_responses` path from WS-C, via `fileManager.uploadAndRegisterFile(context)`,
  idempotently (dedup layer 3: an existing artifact at the canonical path is not an error).
  The tail then takes one of two arms, per decision 8. Renderable json-mode source: dispatch a
  RENDER job keyed on the source identity via the already-injected `enqueueRenderJob` dep and
  set the COMPRESS job `waiting_for_children` to await that child. Text-mode source: extract the
  compressed string from the raw response and persist it as `FileType.CompressedContext` through
  the same resource arm at the canonical `_work` path, dispatch no RENDER job, and complete the
  job — a freeform victim has no template to render against, so there is nothing to transform.
  Both arms leave a `CompressedContext` artifact at the canonical path, which is what the
  overlay and the dedup layers read. `saveResponse` constructs no identity of its own: it forwards the victim's identity to `buildUploadContext`'s resource arm exactly as `DialecticCompressJobPayload` carries it — `documentKey` for a contribution, resource or feedback source, `sourceId` + `role` for a history source. It forwards `sourcePromptResourceId` on that same call, read as a typed member off the narrowed payload, so both compression artifacts record the `CompressionPrompt` that produced them in the column a contribution records its `TurnPrompt` in. The contribution-side back-link — updating the prompt resource's own `source_contribution_id` — does not run on the COMPRESS path: that column references `dialectic_contributions` and a compression artifact is a resource, so writing it would violate its foreign key. It does not run on the contribution path either, where `finalizeContributionJob` drops it as a second method for one fact. Provenance runs one way on both arms, and no back-link is written anywhere in WS-S. `saveResponse` holds NO renderer deps —
  no `resolveTemplateFilename`, no `loadDocumentTemplate`, no `renderStructuredDocument` — and
  performs no rendering, no structural drift check of its own, and no continuation hard-fail.
  Wallet debit with real user/wallet attribution flows through the existing stream persistence
  machinery. Imports `DialecticCompressJobPayload`/`CompressionMode` + the payload guard from
  the enqueueCompressJobs module, and `EnqueueRenderCompressedContextPayload` from the
  enqueueRenderJob module.
  Support: full module (COMPRESS json complete→persisted CompressedContextRawJson + RENDER job
  dispatched and `waiting_for_children` set when renderable; COMPRESS json incomplete→continuation,
  not failure; COMPRESS text→raw persisted AND the extracted string persisted as CompressedContext,
  no RENDER dispatch, job completed; existing-artifact→idempotent completion; no notifications, no
  back-link and no `assembleAndSaveFinalDocument` on any path).
* ✏️🗑️ `supabase/functions/dialectic-worker/saveResponse.ts` — the relocation node.
  The body becomes an orchestrator with the UNCHANGED public signature `(deps, params, payload)`:
  guard params and payload, call `loadJobContext`, call `assembleAiResponse`, call
  `debitForResponse`, call `prepareResponseContent`, then discriminate on the job row's `job_type`
  and call `saveCompressedResponse` with a payload narrowed by `isDialecticCompressJobPayload` or
  `saveContributionResponse` with one gated by the `isModelContributionFileType(output_type)`
  check, and return what that arm returns. The `job_type` discrimination sits ahead of the
  contribution gate because the COMPRESS payload census has no `output_type`. Each sibling's deps
  are sliced from the unchanged `SaveResponseDeps` at its call site; nothing is added to that
  contract and no composition root is touched. RIDES HERE: `SaveResponseSuccessReturn['status']`
  gains `waiting_for_children` — a COMPRESS job awaiting its render child is neither completed nor
  continuing — and `saveResponse.guard.ts`'s allowed-status list admits it;
  `netlifyResponseHandler.ts` tests `'status' in result` and echoes the string without enumerating
  the members, so no consumer is edited. Proof sequence INSIDE this node, in order: (1) repoint the
  seven untouched suites at the orchestrator and run green — the regression oracle; (2) THEN retain
  them in full as `saveResponse.integration.test.ts`, keeping EVERY case, and ALSO author a lean
  `saveResponse.test.ts` unit tier pinning routing, delegation order and error passthrough; (3)
  DELETE the monolith body, which is what finally supplies the `sourceObject` WS-P left unsupplied
  and returns the repo to compiling.
* **COMMIT WS-S** — `saveResponse` is a thin orchestrator over nine modules with `SaveResponseDeps`
  unchanged and every composition root untouched; a COMPRESS response persists, continues when
  incomplete, dispatches its render when the source is renderable, and writes its extracted artifact
  directly when the source is text; the repo compiles and every suite is green. No COMPRESS jobs
  exist yet.

## WS-D — COMPRESSION ORCHESTRATION CUTOVER (depends WS-S)
Strict node order: `retryJob` → `prepareResponseContent` → `applyCompressionOverlay`→
`gatherArtifacts` → `vector_utils` →
`compressPrompt` → `calculateAffordability` → `prepareModelJob` → `createJobContext` →
`StreamChat` → `streamRewind`
→ `index.ts` → `netlifyResponse/index.ts` → `processSimpleJob`. `applyCompressionOverlay` and `gatherArtifacts` have no
import dependency on `vector_utils`/`compressPrompt` — they depend only on WS-C machinery;
`gatherArtifacts` is the SOLE PRODUCER of `ResourceDocument.type`, which `vector_utils`
consumes, so the producer pair runs first and `vector_utils` is written against a conformant
type with no window of transient type mismatch. `calculateAffordability`/`prepareModelJob`/
`processSimpleJob` depend strictly on `compressPrompt`/`gatherArtifacts` respectively, both
landed by the time each is reached. `createJobContext` follows `compressPrompt` because it binds
that function's deps, and precedes `index.ts`, which supplies the implementation it binds.

`retryJob` and its one caller-side follow-up open this workstream although neither is compression
work. They sit here, and not in WS-S, because this is the only ordering that touches
`processSimpleJob.ts` once. Four of the five production `retryJob` call sites live inside the
`saveResponse.ts` monolith, which WS-S collapses into `prepareResponseContent`'s single private
retry helper and then deletes; landing the contract change after that collapse narrows ONE call
site instead of four and never edits the monolith, which does not compile and is scheduled for
deletion regardless. The fifth is `processSimpleJob.ts`, whose only WS-D node — the last one —
absorbs its narrowing alongside its compression edit, so the full-chain integration test that
node carries is written once, against the final retry contract. Placing the change at the head of
WS-S instead would force either a second `processSimpleJob` node in a workstream that otherwise
never opens that file, or a `processSimpleJob` left non-compiling across the WS-S seam, which
contradicts that seam. The worker-side wiring rides the `index.ts` node this workstream already
takes; only `netlifyResponse/index.ts` needs a node of its own.
* ✏️🗑️ `supabase/functions/dialectic-worker/retryJob/retryJob.ts` — canonicalize the retry
  dispatcher so that neither of its failure modes is lost. It is a function-folder module taking
  `Fn(deps, params, payload)`: deps are `IRetryJobDeps` (`logger`, `notificationService`), which
  `RetryJobFn` imports rather than re-declaring inline; params carry
  `dbClient`, `job`, `currentAttempt` and `projectOwnerUserId`; payload carries
  `failedAttempts: FailedAttemptError[]`, the data the dispatch operates on. The return becomes two
  arms whose success arm has two flavors, so each failure reaches whoever can resolve it: a row
  updated and notified is one flavor; a row updated whose notification threw is a SUCCESS flavor
  carrying that error unchanged, because the state change stands and the caller must proceed while
  the error still reaches a boundary a test can assert and an operator can see; a row NOT updated
  is the error arm, carrying a new `RetryJobUpdateError` this module owns — declared in
  `_shared/utils/errors.ts` beside `RenderJobValidationError`, holding the job id, the attempted
  status and the driver's message AS DATA rather than interpolated — with `retriable: true`,
  because a failed DB update is a transport failure and whether to re-dispatch is the caller's
  decision, not this function's. A notification failure whose caught value is not an `Error` yields
  a `RetryJobNotificationError` naming the value received; a caught `Error` is propagated
  unchanged. Blast radius, enumerated: `RetryJobFn` in `createJobContext/JobContext.interface.ts`
  (shape and return, plus pointing its inline deps at `IRetryJobDeps`); `JobContext.mock.ts`,
  `createJobContext.ts` and its interface/guard/unit/integration suites; `saveResponse.interface.ts`,
  `.guard.ts`, `.mock.ts` and their suites, whose deps member is typed but never called;
  `dialectic-worker/index.ts`, which is edited by this workstream's own `index.ts` node rather than
  here; `index.test.ts` and `index.integration.test.ts`; the `retryJob.mock.ts` WS-S creates, which
  moves into the new module folder and takes the canonical shape; and `retryJob.test.ts`, whose
  update-failure and notification-failure cases assert the old bag and become arm assertions, plus
  a new case pinning the carried notification error. `processSimpleJob.ts` and
  `netlifyResponse/index.ts` are NOT edited here: each has its own node below, and both are
  transiently non-compilable until they are reached — permitted within a workstream.
  Support: full module (interface test, interface, guard test, guard, mock, tests, provides).
* ✏️ `supabase/functions/dialectic-worker/prepareResponseContent/prepareResponseContent.ts`
  — narrow the new union at the repo's now-single retry call site. WS-S authors this module against
  the old contract, surfacing the discarded `{ error?: Error }` as its own error arm; with the
  contract canonicalized, its private retry helper discriminates three outcomes instead of testing
  one optional property: both success flavors yield its `retried` flavor, which gains a member
  carrying the notification error when one came back so it travels to the orchestrator rather than
  dying at the seam, and the error arm propagates `RetryJobUpdateError` unchanged. This is a second
  node against a file WS-S created, for the reason `path_constructor` and `enqueueCompressJobs`
  take one node per workstream: the contract it narrows does not exist until the node above lands,
  and WS-S must commit green without it. Support: prepareResponseContent tests.
* ✏️ `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts`
  — swap already-compressed victim content into the working set: resource documents AND history
  messages. Lookup is FORWARD, per TARGET ARCHITECTURE step 7. Every candidate already carries
  its own identity, so for each one the function builds that candidate's canonical
  `FileType.CompressedContext` path with the injected `constructStoragePath` — `documentKey` for
  a `'resource'` candidate, `documentKey` for a `'feedback'` candidate (the `_feedback` suffix
  is applied by the constructor, not here), `sourceId` + `role` for a history message — and does
  one `dialectic_project_resources` existence read on `(storage_path, file_name)`. A miss is the
  common, expected case and is not an error: leave the candidate untouched. A hit downloads the
  artifact and returns a NEW object with `content` replaced, preserving
  id/document_key/stage_slug/type (documents) and id/role/name (messages); inputs are never
  mutated in place. `'system'`-typed documents and id-less history messages are never looked up
  — neither can ever have an artifact. This function takes NO `path_deconstructor` dependency:
  deconstruction runs path → identity, which is the wrong direction for a function whose input
  already holds the identity, and would require enumerating and reverse-parsing the stage's
  `_work` directory to answer a question forward construction answers with one read.
  A query failure, or a row that exists whose download fails, is a real inconsistency —
  `{ error, retriable: false }`, never a silent fall-through to stale content. Zero writes on
  every path. Support: applyCompressionOverlay.test.ts.
* ✏️ `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts` — the sole
  producer of `ResourceDocument.type`, so its type-alignment work lands before any consumer
  assumes a conformant value. Wire `applyCompressionOverlay` as an injected dep post-gather, and
  add BOTH params its lookup identity requires: `stageSlug` (the CONSUMING stage whose `_work`
  holds the artifacts) and `targetKey` (this job's own compression target). `targetKey` is a
  required `constructStoragePath` input and this function is the overlay's only caller, so the
  pair cannot run without it. Both values are already available at the `processSimpleJob` call
  site — `stageSlug` off `job.payload`, `targetKey` from `resolvedRecipeStep.output_type` — so
  neither costs a lookup. Tighten `ResourceDocument.type` (owned in
  `_shared/types.ts`, riding here as gatherArtifacts's support-file edit) from a loose `string`
  to a new 3-member union `'resource' | 'feedback' | 'system'` — `'contribution'` is never a
  valid `ResourceDocument.type` value (it is resolved later, from a selected `'resource'`
  victim's own provenance, by `enqueueCompressJobs`); `'history'` only applies to `Messages`,
  never `ResourceDocument`. Remap all five push sites per the taxonomy (agent-rendered
  documents and user-submitted resources are both text objects for compression purposes;
  header_context/seed_prompt are required model-call inclusions but system objects, never
  compression candidates): the `rType === 'document'` branch (rendered documents) and the
  `rType === 'project_resource'` branch (user-submitted references) both → `'resource'`;
  the `rType === 'feedback'` branch stays `'feedback'`; the `rType === 'seed_prompt'`
  branch (the project's original kickoff input — already transformed into a different
  object before any later model call, never a compression candidate) and the generic catch-all
  `dialectic_contributions` branch (header_context and other internal pipeline artifacts)
  both → `'system'`. Support: gatherArtifacts.test.ts (assert each of the five branches emits
  the correct one of the three literals).
* ✏️ `supabase/functions/_shared/utils/vector_utils.ts` (+ interface) — single full rewrite.
  Runs after `applyCompressionOverlay`/`gatherArtifacts` so `ResourceDocument.type` already
  carries the tightened 3-member union when this node is written. Selection becomes
  embedding-free: `effectiveScore = candidateTokens × importance`,
  where candidateTokens comes from `deps.countTokens` (same tokenizer/modelConfig as the
  preflight, threaded via the scorer's own deps and params) and `importance` is the existing 0..1
  preservation-priority value — from the `inputsRelevance` stage-specific/general key lookup
  (KEPT) for document candidates, and from `scoreHistory`'s existing positional `valueScore`
  (KEPT: 0=oldest/least-preserved, 1=newest/most-preserved) for history candidates. `effectiveScore = tokens × importance` is the form that reproduces
  the pre-rewrite selection order for both the document-matrix case and the position-anchored
  history case. Sort ascending; lowest effectiveScore = next victim (unimportant + large =
  compress first; important + small = preserve). Only `ResourceDocument`s with
  `type !== 'system'` are scored — `scoreResourceDocuments` filters system-typed artifacts
  (header_context, seed_prompt) out of the candidate pool entirely; they are required prompt
  inclusions but structurally never compressible. `CompressionCandidate.sourceType` becomes
  `CompressionSourceType`, narrowed directly from `ResourceDocument.type`'s `'resource' |
  'feedback'` (`'system'` never reaches a candidate; `'contribution'` is never assigned here —
  only later, by `enqueueCompressJobs`, from a `'resource'` victim's provenance), IMPORTED from
  `file_manager.types.ts` (WS-C owner — no duplicate definition). DELETE the `getEmbedding`
  calls, the dialectic_memory diagnostic query, and `cosineSimilarity` (its sole remaining
  consumer, rag_service, is deleted later in WS-X — the transient break resolves before that
  commit). This node also lands the scorer's canonical contract: `ICompressionStrategy`,
  `CompressionStrategyDeps`, `CompressionStrategyParams` and `CompressionStrategyPayload` retire
  with the rest of the RAG core per decision 10, replaced by `GetSortedCompressionCandidatesFn`
  and its Deps/Params/Payload/Return exactly as CANONICAL CONTRACTS states them — deps
  `{ countTokens, logger }`, both required, with no `embeddingClient` and no `dbClient`; params
  required rather than optional; no `currentUserPrompt` on the payload; and a
  `{ candidates } | { error, retriable }` return in place of the bare array. `CompressionCandidate`
  is declared in `vector_utils.interface.ts` rather than in `vector_utils.ts`, so the contract no
  longer imports a type from the implementation it describes.
  Support: vector_utils.test.ts, vector_utils.interface.test.ts.
* ✏️ `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts` — full rewrite as
  a two-phase machine driven by artifact existence. Interface changes ride this node
  (compressPrompt.interface.ts is obligately part of its support system):
  `CompressPromptSuccessReturn` gains `waiting_for_children: boolean` (deferral = success);
  deps REMOVE `ragService`, `embeddingClient`, and the in-loop RAG-debit use of
  `tokenWalletService` (debits ride the stream persistence path); deps ADD
  `applyCompressionOverlay: BoundApplyCompressionOverlayFn`,
  `enqueueCompressJobs: BoundenqueueCompressJobsFn`, `fileManager`, `constructStoragePath`,
  `downloadFromStorage`, and
  `getSortedCompressionCandidates: BoundGetSortedCompressionCandidatesFn` — NO deconstructor dep,
  for the same reason the overlay takes none; payload DROPS `compressionStrategy`, a scoring
  function being a collaborator supplied at the boundary rather than data relayed through the
  functions in between, and DROPS `currentUserPrompt`, which nothing embeds once selection is
  `tokens × importance`; the scorer is invoked from deps and its `Success | Error` return is
  narrowed at the call site;
  params ADD `parentJob: DialecticJobRow`, `projectId`, `iterationNumber`, and `targetKey`, all of
  which the canonical `PathContext` requires and all of which `prepareModelJob`, its only caller,
  supplies directly; NO new union member in `CompressPromptReturn`. Implementation:
  **Overlay (on entry):** call `deps.applyCompressionOverlay` over the payload's resource
  documents and conversation history and work from what it returns. The identity matching is
  NOT reimplemented here — that function is the one definition of it, and a second copy would
  diverge.
  **Reduce check:** any victim with all chunk artifacts but no final artifact →
  concatenate in chunk_index order (synchronous fileManager read); still over the per-victim
  target → `enqueueCompressJobs` for ONE re-compress child → parent `waiting_for_children` →
  pending SUCCESS; else persist the concatenation as the final `CompressedContext` artifact
  (synchronous write) and continue without returning, so several chunked victims can finalize in
  one pass.
  **Select/spawn:** count tokens; over budget → sorted candidates (vector_utils), excluding candidates whose final artifact for this compression target exists; top victim → `enqueueCompressJobs` → parent `waiting_for_children` → pending SUCCESS. At most one child per call, per decision 3. The victim's identity is mapped per its own `sourceType`, per WS-I's split: a `'resource'` or `'feedback'` candidate passes `documentKey` (with `sourceStageSlug` for a `'resource'`), a `'history'` candidate passes `sourceId` + `role`.
  **Recount/finalize:** recount against the overlaid, possibly reduced working set and return that
  working set with `waiting_for_children: false` when it fits. Affordability is not judged here —
  `prepareModelJob` composes this function with `calculateAffordability` and asks that question
  itself. The enforced-alternation rebuild is not deleted with the RAG
  loop — it applies ONCE here, since the overlay swaps content but inserts no alternation
  fillers. Also removes the dialectic_memory indexed-ids query. Support: compressPrompt.test.ts.
* ✏️ `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts` —
  this workstream's business with this file is measurement and guard ownership. Its shape, and its
  separation from compression, are settled by the WS-J node: it carries no compression identity, no
  `compressPrompt` dep and no pending variant.
  RIDES HERE: this file's `tokenizerDeps` are the real implementations `tokenEstimator` uses, not a
  character-indexing `getEncoding` and a `text.length` `countTokensAnthropic`. They are the ruler for
  the preflight, for `finalTargetThreshold`, and — forwarded into `compressPrompt`'s payload — for
  `vector_utils` scoring and `enqueueCompressJobs`'s fit-or-chunk sizing, so every measurement in the
  compression loop comes from one ruler.
  RIDES HERE (owner): `isUserConfig` in `calculateAffordability.guard.ts`, added to
  `calculateAffordability.provides.ts`, with its case checklist in
  `calculateAffordability.guard.test.ts`. `UserConfig` is declared in
  `calculateAffordability.interface.ts` and its own guard file exports no guard for it, so every
  consumer that needs one inlines the type's structure instead: `isCalculateAffordabilityParams`
  hand-checks `userConfig.tier_output_cap_tokens` against number-or-null, and
  `enqueueModelCall.guard.ts`'s `isAiStreamEventData` carries a byte-identical copy of that same
  test for `user_config`. Two copies of one type's definition, neither of them owned by the type,
  and both free to drift from `TierOutputCapTokens` the moment the tier column changes. The guard
  is authored ONCE, here, in the owner's guard file; `isCalculateAffordabilityParams` replaces its
  inline pair with a call to it, and the WS-P `enqueueModelCall.ts` node's `isAiStreamEventData`
  calls it in place of its own copy. That WS-P node lands first and leaves an unresolved import
  until this node lands the guard — an accepted transient: no production path reaches either
  guard before this workstream's cutover, so nothing can run the code that does not compile.
  Support: calculateAffordability.test.ts, calculateAffordability.guard.ts,
  calculateAffordability.guard.test.ts, calculateAffordability.provides.ts,
  calculateAffordability.integration.test.ts (its
  oversized case is rewritten: the RAG deps it constructs no longer exist, its `'document'`
  fixtures are invalid, and it asserts a synchronous replacement that no longer happens).
* ✏️ `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts` — thread the four
  identity values into `CompressPromptParams`, on the one branch that calls it: the validated
  `projectId`/`iterationNumber`, `job` as `parentJob`, and the EXECUTE payload's own `output_type` as
  `targetKey`, the compression target being the schema this job produces. That branch narrows the
  payload to `DialecticExecuteJobPayload` to read `output_type`, holding one concrete guarded type
  inside the branch; the COMPRESS branch never reaches `compressPrompt` and needs none of the four.
  `PrepareModelJobPayload` carries no `compressionStrategy`: the scorer is `compressPrompt`'s own
  dep as of the node above, so no collaborator is relayed through this function as data.
  Propagate `compressPrompt`'s pending result upward as `PrepareModelJobPendingReturn`, returned
  before any `chatApiRequest` is built and before `enqueueModelCall` is reached. Its guards gain
  mutual exclusion against that variant.
  Support: prepareModelJob.test.ts, prepareModelJob.integration.test.ts (its oversized case is
  rewritten for the same three reasons).
* ✏️ `supabase/functions/dialectic-worker/createJobContext/createJobContext.ts` — the factory binds
  the victim scorer into the `boundCompressPrompt` closure, the node above having made it that
  function's dep. `JobContextParams` gains `getSortedCompressionCandidatesFn` beside the
  `compressPromptFn`, `calculateAffordabilityFn` and `prepareModelJobFn` it already carries — an
  unbound implementation supplied by the composition root, and NOT a member of `IJobContext`, which
  every job type carries and no job type that does not compress would read. The factory imports no
  concrete scorer: a factory that reaches for an implementation is the composition root doing its
  own wiring one layer too deep.
  Support: `JobContext.interface.ts`, `JobContext.guard.ts` + `JobContext.guard.test.ts`,
  `JobContext.mock.ts`, `createJobContext.test.ts`, `createJobContext.interface.test.ts`,
  `createJobContext.integration.test.ts`.
* ✏️ `supabase/functions/chat/streamChat/StreamChat.ts` — the same `tokenizerDeps` defect at its
  twin site: a character-indexing `getEncoding` and a `text.length` `countTokensAnthropic`,
  consumed to compute `tokensRequiredForStreaming`. On every tiktoken- or anthropic-strategy
  model the streaming preflight reads high and misclassifies affordable requests as
  unaffordable. Replace both with the real implementations, textually identical to the
  `calculateAffordability` construction. Nothing else in the file changes — the shape of
  `CountTokensDeps` and every call site are untouched; only the injected implementations become
  real. Chain-independent of the compression cutover (nothing in the dialectic worker imports
  StreamChat), included here because the epic does not ship with known-broken token accounting.
  Support: streamChat tests (a fixed string on a `cl100k_base` fixture counts real tokens, not
  characters; any fixture whose expectations were derived from char-count arithmetic is
  recomputed against the real count rather than re-stubbed).
* ✏️ `supabase/functions/chat/streamRewind/streamRewind.ts` — the third and last site, identical
  in defect and fix, consumed to compute `tokensRequiredForRewind` over the rewind prompt.
  After this node no production source constructs a character-indexing `getEncoding` or a
  `text.length` `countTokensAnthropic`; `dummy_adapter.ts`'s copies are a deliberate
  deterministic test double and stay. Support: streamRewind tests, same treatment.
* ✏️ `supabase/functions/dialectic-worker/index.ts` — bind `applyCompressionOverlay` and add it
  to `boundGatherArtifacts`'s deps. `gatherArtifacts`'s widened `Deps` has exactly one
  construction site and this is it, so without this the composition root does not compile and
  the full-chain test has no working `ctx.gatherArtifacts`. `logger`, `downloadFromStorage`, and
  `constructStoragePath` are all already in scope at that point; no new service, no new env var.
  It ALSO supplies `getSortedCompressionCandidatesFn` on the `createJobContext` params — the
  implementation the node above binds into `boundCompressPrompt`.
* ✏️ `supabase/functions/netlifyResponse/index.ts` — rebuild the `retryJob` member of the
  `SaveResponseDeps` literal this composition root constructs inline, to the canonical form the
  `retryJob` node declares. It closes the transient that node opens on this file, mirroring the
  capstone `netlifyResponse/index.ts` node WS-N takes to close `resolveTemplateFilename`'s required
  dep. It is the only composition root this improvement needs a node for: the worker root is
  edited by the `index.ts` node above. No other member of the literal changes, and no compression
  wiring is added here.
* ✏️ `supabase/functions/dialectic-worker/processSimpleJob.ts` — supply `stageSlug` and
  `targetKey` (`resolvedRecipeStep.output_type`, already resolved above the call site) to
  gatherArtifacts; its `PrepareModelJobPayload` literal carries no `compressionStrategy`, that
  member having left the payload with the `compressPrompt` node above; on a pending return, log and
  exit cleanly (parent correctly paused; no
  failure, no retry, no execute_completed notification). ALSO narrows the canonical `retryJob`
  return at this file's single call site, in the catch-path retry branch: the error arm does NOT
  `return` — a retry that could not be scheduled would leave the row in
  `processing` with nothing reported, so it takes the final-failure path already written below it,
  and the unnotified success flavor proceeds while logging the error it carries. Both edits land in
  this one node because they are the file's only two touches in the epic and it is the file's one
  node in this workstream. RIDES HERE (last-written file the
  test needs to run): the FULL-CHAIN compression integration test — real internals, only true
  external boundaries mocked (background-worker HTTP, Supabase), no repo-owned function
  mocked. Asserts, in order: (1) oversized input → no stream call enqueued; parent →
  `waiting_for_children`; pending propagates; processSimpleJob exits cleanly. (2) COMPRESS
  child row(s) with `parent_job_id = parent.id`; payload carries mode + content + targetKey +
  the source identity its own sourceType requires (documentKey for contribution/resource/
  feedback, sourceId + role for history) + chunk_index/chunk_total + the parent's model_id,
  model_slug, user_jwt and idempotencyKey, and NO job_type and NO user_id — the row records the
  job's type and its owner. (3) JSON-mode child: `prepareModelJob` builds the enqueued call, which
  carries the completed source JSON AND the target skeleton, the tier-capped output limit, and a
  wallet balance and affordability preflight; the mocked callback returns compressed JSON. (4) saveResponse verifies completeness
  against the source via `determineContinuation` — an incomplete result continues, it does not
  fail — and on a complete result persists a CompressedContextRawJson resource via
  `uploadAndRegisterFile` at the canonical `_work/raw_responses` path with real
  user_id/wallet_id attribution and a real DEBIT, dispatches a RENDER job, and sets the COMPRESS
  job `waiting_for_children`; saveResponse itself renders nothing. (5) `processRenderJob` runs
  the dispatched row through `renderDocument`'s CompressedContext case, writing the
  `_work/{source}_compressed_for_{target}` markdown through the source document's own template
  with no notification of any kind; the completion trigger then wakes the COMPRESS job and, in
  turn, the parent. (5a) A text-mode victim (a feedback document, and a history message) takes
  the other tail: raw artifact persisted, the extracted compressed string persisted as
  `CompressedContext` at the semantic canonical path (`{document_key}_feedback_compressed_for_…`
  and `message_{role}_{id}_compressed_for_…`), NO RENDER job dispatched, and the COMPRESS job
  completed rather than set `waiting_for_children`. (6) The chunked case concatenates in
  chunk_index order and the re-compress
  branch fires only when over target. (7) gatherArtifacts → applyCompressionOverlay swaps
  victim content (identity fields unchanged); recount fits; the REAL stream call is finally
  enqueued. (8) Recursion guard: `prepareModelJob` branches on the row's `job_type`, so a COMPRESS
  job whose prompt exceeds the window hard-fails non-retriably; it never spawns compression. (9) Reuse: a sibling parent job producing the SAME target
  finds the existing artifact, spawns nothing, and overlays it; a parent producing a
  DIFFERENT target from the same source compresses fresh.
  Support: processSimpleJob.test.ts + the integration test above.

## WS-X — RAG REMOVAL (shares WS-D's commit)
WS-D severed every live reference into the RAG core; removal closes it out. Enumerate
every construction/DI/import site with listCodeUsages at workplan time; known sites per node.
* ✏️ DELETE `supabase/functions/_shared/services/rag_service.ts` + interface + mock + tests;
  remove IRagService from all deps contracts and construction sites. Includes the final
  `dialectic-worker/index.ts` touch (removal wiring only).
* ✏️ DELETE `supabase/functions/_shared/services/indexing_service.ts` + interface + mock +
  tests. `LangchainTextSplitter` lives in its own util (the WS-R `text_splitter` copy);
  `EmbeddingClient` dies here — WS-D severs its consumers (rag_service, compressPrompt's RAG
  deps); zero remaining imports is a deletion precondition.
* 🆕 [exempt] `supabase/migrations/<ts>_compression_jobs_remove_rag.sql` — the epic's REMOVE
  migration, dropping what the RAG core leaves behind once nothing references it:
  `drop function if exists public.match_dialectic_chunks(...);` and
  `drop table if exists public.dialectic_memory;`. Regen types_db.ts (nothing references the
  dropped objects by this point).
* **COMMIT WS-D + WS-X — compression loop live, RAG core gone, every production tokenizer real,
  full-chain test green.**
