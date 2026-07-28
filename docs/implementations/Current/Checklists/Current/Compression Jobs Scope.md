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
WITHIN a workstream (it is not done until it compiles); they are never permitted at a
commit. Detailed per-file workplans (interface tests → interfaces → guard tests → guards →
unit tests → implementation → integration, per workplan.instructions.md) are generated after
this plan is completed, one node at a time.

## BASELINE
Branch `feat/compress`, cut from `development`. The Netlify adapters and enqueueModelCall on
this baseline are the production stream-only versions. All file references in this plan are
against this baseline.

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
   match_dialectic_chunks, all embeddingClient call sites. Removal is ordered so nothing
   references an asset when it is removed.

## TARGET ARCHITECTURE — end-to-end flow for an oversized model input
1. Parent EXECUTE job: `processSimpleJob` → `gatherArtifacts` (already-compressed victims are
   overlaid via `applyCompressionOverlay`) → `prepareModelJob` counts tokens. Fits → enqueue
   the stream call, done.
2. Over budget → `compressPrompt`: score candidates (resource documents + the compressible
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
   exists; assembles the compression prompt via `assembleCompressionPrompt`; asserts the
   assembled call fits the model window (hard fail otherwise — recursion guard); calls the
   bound `enqueueModelCall` with `output_type: FileType.CompressedContext` and the parent's
   model. This is the same model-call transport EXECUTE jobs use.
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
| WS-0 Foundation | — | COMPRESS enum + compression template exist; no caller |
| WS-C Artifact identity | WS-0 | CompressedContext + CompressedContextRawJson FileTypes + identity types + paths + fileManager support exist; no writer |
| WS-R Routing & spawn | WS-C | COMPRESS routable & processable end-to-end; nothing creates COMPRESS jobs yet |
| WS-B Renderer module extraction | WS-R | five renderer modules + the resource upload arm exist with their own tests; monolith and enqueueRenderJob untouched and still serving production |
| WS-N Renderer relocation + RENDER dispatch | WS-B | monolith deleted, renderer modular; compressed RENDER rows dispatchable and processable end to end; nothing dispatches one yet |
| WS-I Compression source identity | WS-N | every victim has a semantically named canonical path that round-trips losslessly; project clone carries it, GitHub sync ignores it; no writer exists yet |
| WS-P COMPRESS response persistence | WS-I | continuation path accepts a COMPRESS job; every COMPRESS prompt persists as a first-class artifact; saveResponse persists COMPRESS raw output, dispatches RENDER for a renderable source and writes the extracted artifact for a text source; no COMPRESS jobs exist yet |
| WS-D Orchestration cutover + WS-X RAG removal | WS-P | Compression loop live; RAG core gone; every production tokenizer real; full-chain test green |

Workplan-file split: `Compression Jobs.md` carries WS-0, WS-C, WS-R, WS-B and is retired;
`Compression Jobs 2.md` carries WS-N, WS-I, WS-P, WS-D, WS-X. Split further at a workstream
boundary when a file approaches ~1800 lines.

---

## WS-0 — FOUNDATION (gates all)
* 🆕 [exempt] `supabase/migrations/<ts>_compression_jobs_foundation.sql` — the epic's ADD
  migration: all new machinery in one pass.
  `alter type public.dialectic_job_type_enum add value if not exists 'COMPRESS';` and the
  seeded `system_prompts` compression-template row. The template instructs: compress the
  source while preserving every fact that could populate any field of the target schema;
  remove redundancy, examples, narrative, historical discussion, intermediate reasoning;
  preserve requirements, constraints, assumptions, accepted decisions, identifiers, user
  corrections, unresolved questions. JSON mode adds the structure contract: return EXACTLY
  the provided JSON structure — every key preserved, values condensed, arrays may shorten,
  nothing added. Text mode: output ONLY the compressed document. Placeholders: source content
  (completed JSON or text per mode), target schema, stage intent, chunk_index/chunk_total
  when chunked.
  Regen `supabase/functions/types_db.ts` (enum union + Constants array; additive,
  compile-safe). (The RAG DROPs live in the epic's separate REMOVE migration, WS-X.)
* **COMMIT WS-0** — the migration is this workstream's only node; the commit step rides it.

## WS-C — ARTIFACT IDENTITY: CompressedContext (depends WS-0)
Ordered BEFORE routing/spawn AND persistence: the dedup layers in `enqueueCompressJobs` and
`processCompressJob` check canonical-artifact existence, and `saveResponse` is the artifact
writer — every one of them needs the identity machinery first.
* ✏️ `supabase/functions/_shared/utils/path_constructor.ts` — canonical paths for BOTH
  compression artifacts, mirroring the existing `ModelContributionRawJson`-vs-`RenderedDocument`
  split: `CompressedContextRawJson` (the raw compression response `saveResponse` writes and the
  RENDER job reads) in the consuming stage's `_work/raw_responses`, and `CompressedContext` (the
  rendered markdown the RENDER job writes and the overlay consumes) in the consuming stage's
  `_work` — `{source_basename}_compressed_for_{target_key}.md` for final artifacts and
  `{source_basename}_compressed_for_{target_key}_chunk_{i}of{n}.md` for map-reduce
  intermediates. Both encode the full identity tuple (session, consuming stage, target schema
  key, source identity via document_key/type or history identity[, chunk_index]).
  Deterministic, collision-free within a stage across multiple targets consuming the same
  source. RIDES HERE (owner): `_shared/types/file_manager.types.ts` gains
  `CompressedContext = 'compressed_context'` and
  `CompressedContextRawJson = 'compressed_context_raw_json'` under ResourceFileTypes,
  `CompressionSourceType = 'contribution' | 'resource' | 'feedback' | 'history'`, and
  `CompressionMode = 'json' | 'text'` (source identity and compressor mode are shared
  vocabulary — these are the single definitions every downstream module imports);
  `type_guards.file_manager.ts` gains `isCompressedContextFileType`,
  `isCompressedContextRawJsonFileType`, `isCompressionSourceType`, and `isCompressionMode`
  (+ tests). Support: path_constructor.test.ts.
* ✏️ `supabase/functions/_shared/utils/path_deconstructor.ts` — parse the new segments for both
  path shapes; round-trip with the constructor must be lossless.
  Support: path_deconstructor.test.ts.
* ✏️ `supabase/functions/_shared/services/file_manager.ts` — persist both compression artifacts
  as first-class resource artifacts (ResourceUploadContext), locatable by
  (session, consuming stage, target key, source identity[, chunk_index]) for the dedup
  layers, compressPrompt's reduce/lookup, the RENDER job's input read, and
  applyCompressionOverlay. Support: file_manager tests.
* **COMMIT WS-C.**

## WS-R — ROUTING & SPAWN (depends WS-C)
The `job_type` splash radius plus the spawn machinery, ordered so every type is landed by its
owning module before any consumer imports it. COMPRESS is an as-needed job like RENDER: it is
dispatched by `processJob` and excluded from step accounting; it has no code path into
recipe-step machinery (task_isolator, continuation prompt assembly), so those files are NOT
touched. Strict node order: `text_splitter` → `enqueueCompressJobs` →
`assembleCompressionPrompt` → `prompt-assembler.ts` (facade wiring) → `enqueueModelCall` →
`processCompressJob` → `processJob` → `deriveStepStatuses` → `buildJobProgressDtos` →
`createJobContext` → `index.ts`.
* 🆕 `supabase/functions/_shared/utils/text_splitter.ts` — COPY of `LangchainTextSplitter`
  (currently housed in indexing_service.ts) into its own shared util node with its own tests.
  The original in indexing_service.ts is left untouched and is deleted with that file in WS-X.
  Needed for map-reduce chunking. Support: text_splitter.test.ts.
* 🆕 `supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.ts` — OWNS
  `CompressionMode` and `DialecticCompressJobPayload` (canonical contracts below) in
  `enqueueCompressJobs.interface.ts`, and `isDialecticCompressJobPayload` in its module guard
  file — creator-owns-the-data: this function decides the mode and constructs the payload.
  Imports `CompressionSourceType` from `file_manager.types.ts` (WS-C owner). Dedup
  layer 1: skips creation when the victim's canonical CompressedContext artifact for this
  compression target already exists. For contribution victims, locates the completed source
  JSON artifact (the victim's provenance) and sets `mode:'json'`; feedback/history victims
  are `mode:'text'`. Sizes victim + prompt envelope against the model window via
  `deps.countTokens`: fits → ONE child; else split (`deps.textSplitter`) → N chunk children
  (`chunk_index`, `chunk_total`, always `mode:'text'` — chunking JSON would destroy the
  structure being validated). Inserts `dialectic_generation_jobs` rows
  (`job_type='COMPRESS'`, `parent_job_id`). Insert failure = hard stop (no partial success).
  Does NOT set parent status (caller owns that).
  Support: enqueueCompressJobs.test.ts + interface + guards + mock.
* 🆕 `supabase/functions/_shared/prompt-assembler/assembleCompressionPrompt.ts` — full
  DI-compliant node. `AssembleCompressionPromptFn(deps, params, payload)`: payload is
  `{ mode, content, chunk_index?, chunk_total? }` with `CompressionMode` imported from
  `file_manager.types.ts` (WS-C owner — `_shared/` code must never import from
  `dialectic-worker/`). sourceType/sourceId/targetKey are deliberately ABSENT
  from this payload: rendering does not consume them, and provenance persists on the COMPRESS
  job row payload and the canonical artifact path (no over-fetching). Params carry
  session/stage/consuming-step context for target-schema extraction (the step's
  `outputs_required`, `dialectic.interface.ts:2121`, and/or the assembled JSON skeleton);
  deps carry dbClient/render/logger. Loads the seeded template by its unique name and renders
  the mode-appropriate compression prompt: supplies EXACTLY ONE of the `json_mode`/`text_mode`
  section variables, and `chunk_context` (+ `chunk_index`, `chunk_total`) only for chunk
  jobs. Returns Success{ prompt } | Error. Support: interface, guards, tests per
  workplan.instructions.
* ✏️ `supabase/functions/_shared/prompt-assembler/prompt-assembler.ts` — wire
  `assembleCompressionPrompt` into the `PromptAssembler` facade, matching the existing
  per-assembler pattern exactly (constructor param + private field defaulted to the real
  function, public method delegating to it) — NOT a branch in the generic `assemble()`
  dispatcher, whose `AssemblePromptOptions` shape is stage/job-centric and doesn't fit a
  COMPRESS job (no stage, no recipe step of its own). Matches the `assembleSeedPrompt`
  precedent: `startSession.ts` calls `assembler.assembleSeedPrompt(...)` directly rather than
  through `assemble()`, proving the direct-method pattern is real, not just theoretical.
  `IPromptAssembler` gains the new method; `IJobContext.promptAssembler`/
  `IPlanJobContext.promptAssembler` (already typed as `IPromptAssembler`) and the single
  composition-root instance (`index.ts:109`) need no separate edit — both pick up the new
  method transitively. Support: `prompt-assembler.mock.ts`'s `MockPromptAssembler` gains the
  method; `prompt-assembler.test.ts` gains a delegation test.
* ✏️ `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts` — align
  `output_type` validation to accept `FileType.CompressedContext` alongside model-contribution
  types (the current guard admits contribution types only), using
  `isCompressedContextFileType` from `type_guards.file_manager.ts` (WS-C owner — no type
  rider on this node). This node owns the bound-form contract (`BoundEnqueueModelCallFn`) in
  `enqueueModelCall.interface.ts`, consumed by processCompressJob and createJobContext below.
  Support: enqueueModelCall.test.ts.
* 🆕 `supabase/functions/dialectic-worker/processCompressJob/processCompressJob.ts` — full
  modern `Fn(deps, params, payload) => Promise<Return>` node, matching `enqueueCompressJobs`/
  `assembleCompressionPrompt` — NOT the legacy `(dbClient, job, projectOwnerUserId, deps,
  authToken) => Promise<void>` shape `processSimpleJob`/`processComplexJob`/`processRenderJob`
  use. `IJobProcessors` already types each of those three members with a DIFFERENT `deps`
  shape (`IJobContext`/`IPlanJobContext`/`IRenderJobContext`), so there is no uniform dispatch
  signature to match — `processJob.ts` (below) is edited regardless to add the `COMPRESS`
  case, and that case constructs whatever `Deps`/`Params`/`Payload` this function declares and
  interprets its typed `Return`, exactly as `compressPrompt.ts` (later) does for
  `enqueueCompressJobs`. OWNS `ProcessCompressJobFn` in `processCompressJob.interface.ts`
  (module-first — not `dialectic.interface.ts`'s basket). Imports `DialecticCompressJobPayload`
  + its guard from the `enqueueCompressJobs` module; payload arrives ALREADY validated by the
  caller (`processJob.ts` narrows via `isDialecticCompressJobPayload` before calling, mirroring
  how it already gates `processSimpleJob`/`processComplexJob` behind `jobIsExecuteJob`/
  `jobIsPlanJob` guards) — this function does not re-validate it. Dedup layer 2: re-check
  canonical artifact existence, returning `{ queued: false }` (success, not error) without
  spending when it already exists; else call `assembleCompressionPrompt` (bound facade
  closure); assert the assembled call fits the model window — hard, non-retriable error
  otherwise (recursion guard); call `deps.enqueueModelCall` with `output_type:
  FileType.CompressedContext` and the payload's own `model_id`, returning `{ queued: true }`.
  No notifications (COMPRESS is invisible infrastructure); does not itself mark the job
  `completed` on a successful enqueue (that happens later via `saveResponse.ts`, matching
  EXECUTE). Support: full module (interface test, interface, interaction spec, guard test,
  guard, mock, test, provides, integration test) per workplan.instructions.md's new-package rule.
* ✏️ `supabase/functions/dialectic-worker/createJobContext/createJobContext.ts` — SINGLE
  aggregated touch of `JobContext.interface.ts` and the factory: (1) thread
  `enqueueModelCall: BoundEnqueueModelCallFn` through `IJobContext` + `JobContextParams` +
  factory so processCompressJob receives the pre-bound closure; (2) widen
  `BuildUploadContextFn` (JobContext.interface.ts:148; refs :312/:365) from
  `ModelContributionUploadContext`-only to
  `ModelContributionUploadContext | ResourceUploadContext`. The widening is compile-safe for
  the existing contribution path: the storage layer already accepts the union
  (file_manager.types.ts:238/:255) and callers forward the built context to
  `uploadAndRegisterFile`. Its resource arm is implemented in WS-B. All support files:
  JobContext.guard.ts + test, JobContext.mock.ts, createJobContext.test.ts /
  .interface.test.ts / .integration.test.ts.
* ✏️ `supabase/functions/dialectic-worker/processJob.ts` — add `COMPRESS` switch case that
  narrows `job.payload` via `isDialecticCompressJobPayload`, constructs `ProcessCompressJobDeps`/
  `Params` from job context (including the bound `assembleCompressionPrompt` facade closure),
  calls `processors.processCompressJob(deps, params, payload)`, and interprets the returned
  `ProcessCompressJobReturn` (writing job-status/error handling for the error case, since this
  function's own success path does not do so for the enqueued-but-not-yet-complete case). RIDES
  HERE: the legacy hub's SINGLE touch — `dialectic.interface.ts` gains ONLY
  `JobType | 'COMPRESS'` + `JobTypes` const, the `DialecticJobPayload` union extension
  (importing `DialecticCompressJobPayload` from `enqueueCompressJobs.interface.ts`), and
  `IJobProcessors.processCompressJob` (importing `ProcessCompressJobFn` from
  `processCompressJob.interface.ts` — a DIFFERENT shape than its EXECUTE/PLAN/RENDER siblings,
  which `IJobProcessors` already accommodates). NO new type is defined in the hub — it imports
  from the owning modules. `type_guards.dialectic.ts`: update `isDialecticJobPayload` for the
  extended union + barrel re-export + tests. Update `dialectic.mock.ts`
  (`_JobProcessorsDummyImpl`, `MockJobProcessorsSpies`, `createMockJobProcessors`).
  Support: processJob.test.ts.
* ✏️ `supabase/functions/dialectic-service/deriveStepStatuses.ts` — add
  `if (job.job_type === 'COMPRESS') continue;` parallel to the existing RENDER exclusion, so
  infrastructure compression rows do not corrupt recipe-step progress counts.
  Support: deriveStepStatuses.test.ts.
* ✏️ `supabase/functions/dialectic-service/buildJobProgressDtos.ts` — same COMPRESS exclusion;
  compression rows must not surface as user-visible step progress.
  Support: buildJobProgressDtos.test.ts.


* ✏️ `supabase/functions/dialectic-worker/index.ts` — wire `processCompressJob` into
  `defaultProcessors`; pass `boundEnqueueModelCall` into `createJobContext`. This composition
  root is touched once per wiring phase it must reflect: here, again in WS-D to bind
  `applyCompressionOverlay`, and finally in WS-X for removal wiring. Aggregating any of the
  three into another would leave an intermediate commit non-compilable.
* **COMMIT WS-R.**

## WS-B — RENDERER MODULE EXTRACTION (depends WS-R)
The monolithic `document_renderer.ts` cannot be handed data: it re-reads the contributions
chain and self-persists as `RenderedDocument`, and its `template_filename` input is resolved
only by an inline, unexported walk inside `enqueueRenderJob.ts`. Its four responsibilities are
extracted into function-folder modules, and `buildUploadContext` gains the resource arm both
the relocated orchestrator and the compression callback need.

COPY-FIRST sequencing (the `text_splitter` pattern): every node here lands as a COPY
with its own focused tests while the monolith and `enqueueRenderJob` stay UNTOUCHED, so the
duplication is deliberate and dormant. Nothing here edits an existing consumer, no
`Deps` interface consumed by a composition root changes, and the production render path is
byte-identical throughout — this workstream is additive and green by construction. The relocation
that retires the duplication is WS-N.

Strict node order: `resolveTemplateFilename` → `loadDocumentTemplate` →
`renderStructuredDocument` → `assembleContributionChain` → `mergeChunkContent` →
`buildUploadContext`.
* 🆕 `supabase/functions/_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts` —
  full function-folder module (NOT pure: it performs the stage → active recipe instance →
  cloned-or-template steps → step by `output_type` → `outputs_required.files_to_generate` →
  entry by `from_document_key` walk against the DB, with typed failure modes), extracted as a
  COPY of the inline block at `enqueueRenderJob.ts:138-256`. Canonical repo shape
  `Fn(deps, params, payload) => Success{ templateFilename } | Error{ error, retriable }`.
  Consumed by `enqueueRenderJob` (WS-N), on both its EXECUTE and COMPRESS-dispatch branches.
  `enqueueRenderJob.ts` itself is NOT edited by this node — the inline block stays in place
  until WS-N.
* 🆕 `supabase/functions/_shared/services/document_renderer/loadDocumentTemplate/` — COPY of
  `document_renderer.ts:249-305`: project → `selected_domain_id` lookup,
  `dialectic_document_templates` row by (name = template_filename minus `.md`, domain_id,
  is_active), storage download, decode to string. Support: full module (DB + storage
  boundaries → mock required).
* 🆕 `supabase/functions/_shared/services/document_renderer/renderStructuredDocument/` — COPY
  of `document_renderer.ts:468-560` plus the module-level format helpers
  (`titleFromDocumentKey`, `formatValueAsMarkdown`, `formatObjectFieldsAsMarkdown`) and the
  inner helpers (`extractTemplateSectionNames`, `formatRecordForRender`,
  `stripTemplateComments`): the flat vs per-item render strategy over `renderPrompt`, comment
  stripping. PURE — template text + structured record + documentKey in, rendered string out;
  no mock (path_constructor precedent). Support: interface + tests.
* 🆕 `supabase/functions/_shared/services/document_renderer/assembleContributionChain/` —
  COPY of `document_renderer.ts:141-247`: contributions-chain query, identity filter,
  edit-preferring dedupe by file_name, root find, `target_contribution_id` chain walk,
  modelSlug/attemptCount/sourceGroupFragment/sourceAnchorModelSlug extraction. Not needed by
  compression — extracted so the deleted monolith leaves no orphaned responsibilities.
  Support: full module.
* 🆕 `supabase/functions/_shared/services/document_renderer/mergeChunkContent/` — COPY of
  `document_renderer.ts:307-466`: chunk download, Phase 1/2/3 concatenate-sanitize-parse with
  per-chunk fallback, content-unwrap merge (`isRecord(parsed.content) ? parsed.content :
  parsed`), `_extra_content` plain-text path, array-join normalization. `renderDocument`'s
  CompressedContext-source case mirrors the content-unwrap rule (single-source case) for
  format-identical output. Support: full module.
* ✏️ `supabase/functions/_shared/utils/buildUploadContext/buildUploadContext.ts` — implement
  the resource arm the WS-R `createJobContext` widening promised: params widen to
  `BuildUploadContextParams | BuildUploadContextResourceParams`, discriminated on entry by
  payload structure, returning `ModelContributionUploadContext | ResourceUploadContext`. The
  resource arm builds the compression `PathContext` (targetKey/sourceType/documentKey/sourceId/
  chunk fields) for both compression FileTypes. Consumed by `renderDocument`'s
  CompressedContext case (WS-N) and `saveResponse`'s COMPRESS tail (WS-P). The contribution arm
  is unchanged, so every existing caller compiles untouched.
  Support: buildUploadContext tests.
* **COMMIT WS-B** — five renderer modules + the resource upload arm exist with their
  own tests; the monolith and `enqueueRenderJob` are untouched and still serve production.

## WS-N — RENDERER RELOCATION + RENDER DISPATCH (depends WS-B)
The monolith is retired and the COMPRESS render path is built end to end. `renderDocument`
survives as a proper module with its signature unchanged (so `IDocumentRenderer` consumers
re-point imports only) and gains a `CompressedContext`-source case: a single file, no
contribution-chain assembly, reading the canonical `CompressedContextRawJson` artifact and
writing `CompressedContext` to `_work`, no `render_completed` notification. `enqueueRenderJob`
retires its inline walk in favour of the WS-B module and gains the COMPRESS-dispatch branch;
`processRenderJob` gains the compressed-row case. At this seam a dispatched compressed RENDER
row is fully processable — nothing dispatches one yet.

The UNMODIFIED monolith suite — pinned to the unchanged public signature — is the relocation's
regression oracle, then retained IN FULL as the module's `renderDocument.integration.test.ts`
(the durable whole-chain guard) while the WS-B module tests add part-in-isolation coverage —
additive, not a redistribution that thins the suite.

Strict node order: `enqueueRenderJob` → `renderDocument` (relocation + deletion) →
`processRenderJob` → `netlifyResponse/index.ts` (capstone wiring, mirroring WS-R's
`dialectic-worker/index.ts`).
* ✏️ `supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts` — replace the
  inline walk with a call to the INJECTED `resolveTemplateFilename` dependency, and add the
  COMPRESS-dispatch branch: the payload union widens to
  `EnqueueRenderJobPayload | EnqueueRenderCompressedContextPayload`, discriminated on entry by
  payload structure alone (no flag, no new dep); renderability and template identity resolve
  through the two already-injected deps against the SOURCE document's coordinates; one
  source-identity-keyed RENDER row is inserted with `parent_job_id` = the COMPRESS job,
  carrying what `processRenderJob` needs to build `RenderCompressedContextParams`. OWNS
  `EnqueueRenderCompressedContextPayload`, `DialecticRenderCompressedContextJobPayload`, and
  their guards. `EnqueueRenderJobDeps` gains
  `resolveTemplateFilename: BoundResolveTemplateFilenameFn` (required, no default);
  `EnqueueRenderJobErrorReturn.error` widens to
  `RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError` and
  `isEnqueueRenderJobErrorReturn`'s `instanceof` check widens to match — a
  `TemplateResolutionError` returned by the dependency is returned by `enqueueRenderJob`
  UNCHANGED (`return templateResult;` on the error branch, not a reconstructed error).
  Making this dep required leaves `netlifyResponse/index.ts` (which builds
  `EnqueueRenderJobDeps` inline for production) and
  `dialectic-worker/index.integration.test.ts` (the parallel test-harness construction)
  transiently non-compilable — permitted within the workstream; resolved by the
  `netlifyResponse/index.ts` capstone node, last before commit. Behavior identical for every
  success path; existing `enqueueRenderJob.test.ts` assertions pass once every inline
  `EnqueueRenderJobDeps` literal in the file gains the new required field (mechanical, not
  optional — TypeScript will not compile otherwise). Support: enqueueRenderJob.test.ts,
  enqueueRenderJob.interface.ts, enqueueRenderJob.guards.ts, enqueueRenderJob.guard.test.ts,
  enqueueRenderJob.mock.ts, enqueueRenderJob.interface.test.ts.
* ✏️🗑️ `supabase/functions/_shared/services/document_renderer/renderDocument/renderDocument.ts`
  — the relocation + deletion node. Orchestrator with the UNCHANGED public signature
  `(dbClient, deps, params)` delegating to the four modules above and keeping the
  persist-as-RenderedDocument + `render_completed` notification tail (`document_renderer.ts:
  562-658`) — that tail is RENDER-flow-specific and stays in the orchestrator. The module's
  interface file re-homes `RenderDocumentParams`/`RenderDocumentResult`/`DocumentRendererDeps`/
  `IDocumentRenderer`/`ContributionRowMinimal`; its mock re-homes `createDocumentRendererMock`.
  It also gains the CompressedContext-source case: params widen to
  `RenderDocumentParams | RenderCompressedContextParams`, discriminated on entry by params
  structure alone; the branch reads the canonical `CompressedContextRawJson` artifact, normalizes
  it exactly as `mergeChunkContent` does for one source, renders through the source document's
  own template, persists as `CompressedContext` to `_work`, and sends no notification.
  Proof sequence INSIDE this node, in order: (1) repoint the untouched
  `document_renderer.test.ts` + `document_renderer.examples.test.ts` suites at the new module
  and run green — the regression oracle; (2) THEN RENAME both suites in full into the module
  folder as `renderDocument.integration.test.ts` + `renderDocument.examples.integration.test.ts`,
  keeping EVERY case — the persistent whole-chain guard (real siblings, only DB/storage mocked)
  that fails the instant a future edit mis-wires the orchestrator; the siblings' own unit tests
  add part-in-isolation coverage but never replace these end-to-end cases; ALSO author a lean
  `renderDocument.test.ts` unit tier (four siblings mocked) pinning delegation / order /
  error-passthrough / persist-notify wiring; (3) DELETE ONLY `document_renderer.ts`,
  `document_renderer.interface.ts`, `document_renderer.mock.ts`, and `verify_renderer.ts`
  (dev-only harness with hardcoded local paths — dies with the monolith); the two `*.test.ts`
  suites are renamed per step 2, not deleted; (4) repoint every importer —
  `dialectic-worker/index.ts`, `dialectic.interface.ts`,
  `createJobContext/JobContext.interface.ts`, `createJobContext/JobContext.mock.ts`,
  `createJobContext/createJobContext.interface.test.ts`, `index.test.ts` — all
  import-path-only, each a one-line edit with zero behavior change. `processRenderJob.ts` is NOT in this
  list: it has its own node (next), and its import repoint aggregates there rather than
  splitting that file across two nodes.
* ✏️ `supabase/functions/dialectic-worker/processRenderJob.ts` — add the compressed-row case so
  a RENDER row dispatched by `enqueueRenderJob`'s COMPRESS branch is processable. Discriminate
  the fetched row's payload with `isDialecticRenderCompressedContextJobPayload` before the
  existing `isDialecticRenderJobPayload` gate (the compressed payload carries `targetKey`/
  `sourceType` and no `documentIdentity`/`sourceContributionId`, so it fails that gate today),
  build `RenderCompressedContextParams`, and call `renderDocument` through the same
  `ctx.documentRenderer` seam the EXECUTE case uses. This branch sends NO notification of any
  kind — not `render_started`, not `render_chunk_completed`, not `job_failed` — because COMPRESS
  is invisible infrastructure; it marks its own row completed or failed exactly as the existing
  case does. RIDES HERE: this file's import repoint onto the relocated
  `renderDocument.interface.ts` — its only touch this epic, aggregated here rather than into the
  prior node's repoint list. Support: processRenderJob tests.
* ✏️ `supabase/functions/netlifyResponse/index.ts` — WS-N's capstone composition-root wiring
  node (mirrors WS-R's `dialectic-worker/index.ts`). Binds a `BoundResolveTemplateFilenameFn`
  closure over `adminClient` and adds it to `boundEnqueueRenderJob`'s `EnqueueRenderJobDeps`
  literal, resolving the transient non-compilable state the `enqueueRenderJob` node leaves
  open. RIDES HERE (same reasoning as WS-R's index.ts test-harness parity):
  `dialectic-worker/index.integration.test.ts`'s `buildNetlifyDeps` gets the identical wiring
  addition — it is test infrastructure for this composition root, not a second production
  entrypoint, so it does not get its own node.
* **COMMIT WS-N** — monolith deleted, renderer modular, compressed RENDER rows
  dispatchable and processable end to end; nothing dispatches one yet.

## WS-I — COMPRESSION SOURCE IDENTITY (depends WS-N; gates WS-P and WS-D)
The compressed-artifact path names a feedback or history source from a truncated digest of its
row id (`source_${generateShortId(sourceId)}`), which is the one place in `path_constructor.ts`
that names a file after a hash. It discards identity that exists — a feedback document is the
user's answer to a named document and carries that document's key; a history message's id is a
real id, not something to shorten — and it buys nothing, because uniqueness is already carried
by the full path plus the target key. It also forces the deconstructor to carve out a basename
form it cannot read back, breaking the lossless round-trip WS-C requires of it.

This workstream lands decision 6's naming and identity split before anything consumes it.
`saveResponse` (WS-P) writes at these paths, and `applyCompressionOverlay` (WS-D) reads at
them, so both are blocked on it.

Strict node order: `path_constructor` → `path_deconstructor` → `cloneProject` → `enqueueCompressJobs` → `buildUploadContext`. `buildUploadContext` sits last because its resource params are sourced 1:1 from `DialecticCompressJobPayload`, so the payload census `enqueueCompressJobs` owns is its upstream definition even though there is no import edge between them. The two service files sit here because they are the only callers that
meet a compressed path without expecting one: every other `deconstructStoragePath` caller reads
`dialectic_contributions` (`findSourceDocuments`, `selectAnchorForCanonicalPathParams`,
`strategies/helpers`, `canonical_context_builder`, both planners, `assembleContributionChain`),
`file_manager` deconstructs a root contribution only, and `gatherInputsForStage` filters
`resource_type = 'rendered_document'` — none of them can receive a `_work` compression artifact.
The three new `DeconstructedPathInfo` members are optional and additive, so no reader of that
type is forced to change.
* ✏️ `supabase/functions/_shared/utils/path_constructor.ts` — the compressed branch's
  `sourceBasename` construction becomes the three forms decision 6 names: `{documentKey}` for
  `'contribution'`/`'resource'`, `{documentKey}_feedback` for `'feedback'`, and
  `message_{role}_{id}` carrying the FULL message id for `'history'`. `generateShortId` leaves
  this branch entirely (its other call site, the session path segment, is untouched). The
  required-member branch moves feedback across: `'contribution'`, `'resource'` AND `'feedback'`
  require `documentKey`; only `'history'` requires `sourceId` — still an explicit per-member
  branch, never an OR-fallback. A history victim's `role` joins the required members for that
  arm. The `_feedback` suffix is load-bearing, not decoration: a step's working set routinely
  holds both a document and the user's feedback on that same document (Synthesis takes
  `business_case_critique` and its feedback; Parenthesis takes `product_requirements` and its
  feedback), so without it the two collide on one path.
  RIDES HERE: `FileType.CompressionPrompt = 'compression_prompt'` (ResourceFileTypes, adjacent to
  the compression pair) and its own arm in `constructStoragePath`. Every prompt a COMPRESS job
  sends is an artifact of that job and has to be addressable, and no existing arm can name one:
  `TurnPrompt` requires `documentKey` and reads no compression identity at all, so a `'history'`
  victim throws for want of a documentKey, and a document victim and its own feedback collide on
  one path — the same collision the `_feedback` suffix exists to prevent, reappearing for the
  prompt. Arm: `{stageRootPath}/_work/prompts`, file name
  `{modelSlug}_{attemptCount}_{sourceBasename}_compressed_for_{targetKey}` plus the chunk suffix
  when chunked, plus `_continuation_{turnIndex}` when `isContinuation`, ending `_prompt.md`.
  Required members are `stageRootPath`, `targetKey`, `sourceType`, `modelSlug`, `attemptCount`,
  the same per-`sourceType` identity the artifact arms require, and `turnIndex` when
  `isContinuation` is true. `sourceBasename` is computed ONCE and shared by the artifact arms and
  this one, never duplicated, so a prompt is exactly as distinct as the artifact it produces.
  Consumed by `assembleCompressionPrompt` (WS-R), which persists the first-pass prompt, and by
  `assembleContinuationPrompt`'s COMPRESS branch (WS-P), which persists the continuation prompt
  at the same identity with `isContinuation: true`. Both take `modelSlug` from
  `DialecticCompressJobPayload.model_slug`, which every COMPRESS row carries because
  `enqueueCompressJobs` copies it from the parent EXECUTE payload's own `model_slug`. No
  consumer on the compression path queries `ai_providers` for a slug: the payload is handed the
  value precisely so the consumer does not have to fetch it, and a round-trip for data already
  in hand is a defect wherever it appears.
  Support: path_constructor.test.ts, type_guards.file_manager tests (`isCompressionPromptFileType`
  alongside the two existing compression FileType guards).
* ✏️ `supabase/functions/_shared/utils/path_deconstructor.ts` — restore the lossless
  round-trip WS-C requires. The `source_<8 hex>` carve-out that currently suppresses
  `documentKey` is deleted; `documentKey` is recovered for every document-identity form, the
  `_feedback` suffix recovers `sourceType: 'feedback'`, and a history path recovers its real
  `sourceId` and `role`. `DeconstructedPathInfo` gains the `sourceType`/`sourceId`/`role`
  members it lacks today — without them the round-trip cannot be expressed, let alone lossless.
  RIDES HERE: a `compressionPromptPatternString` arm for `FileType.CompressionPrompt`, and it is
  an ORDERING fix as much as a parsing one. A compression prompt lands at
  `_work/prompts/{modelSlug}_{attemptCount}_{sourceBasename}_compressed_for_{targetKey}…_prompt.md`,
  and TWO existing patterns already match that string. `turnPromptPatternString` matches it with
  `documentKey` swallowing the entire `{sourceBasename}_compressed_for_{targetKey}` stem, and
  `compressedContentPatternString` matches it with `sourceBasename` swallowing the `prompts/`
  segment and `targetKey` swallowing a trailing `_prompt`. Neither errors — each returns a
  confidently wrong identity, which `cloneProject` then writes to a wrong path inside a clone that
  reports success. The new pattern is therefore checked BEFORE both, and it recovers `targetKey`,
  the per-form source identity through the SAME three-arm basename interpretation the artifact
  branch uses, plus `modelSlug`, `attemptCount`, the chunk pair, and `isContinuation`/`turnIndex`.
  Support: path_deconstructor.test.ts (round-trip case per source form, for the artifact pair AND
  the prompt; plus a case pinning that a compression prompt does not deconstruct as a turn prompt).
* ✏️ `supabase/functions/dialectic-service/cloneProject.ts` — carry compression identity through
  the clone's deconstruct → reconstruct round-trip. This function deconstructs EVERY asset it
  clones, throws on a deconstruction error, and rebuilds a `PathContext` from the recovered
  members to write the copy. A `CompressedContext` or `CompressedContextRawJson` asset — both
  `dialectic_project_resources` rows, both swept by the unfiltered resource query, both cloned —
  hits two stops, and either one throws inside the asset loop's `try`, driving the catch's
  rollback and DELETING the partially cloned project. FIRST: `buildUploadContextForAsset`'s
  resources arm admits a closed list (`InitialUserPrompt`, `GeneralResource`, `PlannerPrompt`,
  `ProjectReadme`, `PendingFile`, `CurrentFile`, `CompleteFile`) and throws
  `Asset from resources table has unexpected fileType: compressed_context` before any path is
  constructed; the arm admits all THREE compression FileTypes — `CompressedContext`,
  `CompressedContextRawJson` and `CompressionPrompt` — each already a `ResourceFileTypes` member
  that `ResourceUploadContext` accepts, so no type changes. SECOND, reachable only once the arm
  admits the type: the `PathContext` literal carries no `targetKey` and no `sourceType`, so
  `constructStoragePath` throws `Required context missing for compressed_context`. The literal
  gains SIX members — `targetKey`, `sourceType`, `sourceId`, `role`, `chunkIndex`, `chunkTotal` —
  sourced from the deconstructed info the WS-I `path_deconstructor` node makes recoverable.
  The chunk pair is the load-bearing half: it is optional and both-or-neither, so dropping it
  does not throw — it constructs the FINAL artifact's path, so every retained map-reduce chunk
  clones on top of its victim's final artifact and on top of the other chunks, inside a clone
  that reports success. A throw loses the clone; this loses data inside a clone that looks
  healthy. This is the concrete consumer that makes the lossless round-trip load-bearing rather
  than theoretical.
  Support: cloneProject tests (a clone whose session carries a compressed artifact of each
  source form, including a chunked intermediate, round-trips to the same relative path under the
  new project id).
* ✏️ `supabase/functions/dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.ts` — the
  victim payload and `DialecticCompressJobPayload` follow the identity split: a `'feedback'`
  victim is keyed by `documentKey`, not `sourceId`, and a `'history'` victim carries `role`
  alongside `sourceId`. `isDialecticCompressJobPayload` moves the feedback arm with it and
  gains the `role` requirement on the history arm. Dedup layer 1's canonical-path recomputation
  gains role on its pathContext literal; the naming itself still comes free from the constructor.
  `DialecticCompressJobPayload` ALSO gains `continuation_count?: number` here, with its guard,
  builder and case checklist. This module never writes the member — it creates first-dispatch
  children, which carry no continuation count — but it owns the type, and one source file's
  changes may not be split across two nodes. `continueJob` (WS-P) is the member's first writer
  and `processCompressJob` (WS-P) selects continuation assembly on it, so the type must carry it
  before either is written; landing it in this node puts it one workstream ahead of both.
  `DialecticCompressJobPayload` ALSO gains a REQUIRED `model_slug: string` here, with its guard,
  builder and case checklist, and `enqueueCompressJobsParams` gains `modelSlug: string`
  alongside its existing `modelId`. Unlike `continuation_count`, this module DOES write the
  member: every child row it inserts carries the parent EXECUTE payload's own `model_slug`,
  threaded in through params exactly as `modelId` and `walletId` already are. It exists because
  a `CompressionPrompt` artifact is named `{modelSlug}_{attemptCount}_…` and both prompt
  assemblers would otherwise have to query `ai_providers` for a value the parent already holds.
  Support: enqueueCompressJobs tests, interface, guards, mock.
* ✏️ `supabase/functions/_shared/utils/buildUploadContext/buildUploadContext.ts` — the resource arm's params follow the identity split. `BuildUploadContextResourceParams` requires `documentKey` for `'contribution'`, `'resource'` AND `'feedback'`, narrows `sourceId` to `'history'` alone, and gains `role: Messages['role']` required on that same arm — an explicit per-`sourceType` branch, never an OR-fallback (matching the `path_constructor.ts` rule). Those members flow straight into the compression `PathContext` this arm builds, so the artifact lands at the canonical path `path_constructor.ts` names. This is the sole builder of the compression `ResourceUploadContext` and the only writer path a text-mode victim has: `saveResponse`'s COMPRESS tail (WS-P) persists every feedback and history artifact through it, while `renderDocument`'s CompressedContext case reaches only the `documentKey` arm, because `isRenderCompressedContextParams` narrows `sourceType` to `'contribution' | 'resource'` and a text source is never rendered. Its guards move the feedback arm with them. The contribution arm is unchanged, so every existing caller compiles untouched. Support: buildUploadContext tests, interface, guards, mock.
* **COMMIT WS-I** — every compression victim has a semantically named canonical path that round-trips losslessly; the upload-context builder that writes at those paths speaks the same identity; project clone carries it and GitHub sync ignores it; no writer of a compressed artifact exists yet, so no production behavior changes.

## WS-P — COMPRESS RESPONSE PERSISTENCE (depends WS-I)
The COMPRESS stream callback becomes a real terminal step. Decision 8 routes an incomplete
compression back through the ordinary continuation path, and decision 1 states the recursion
guard is not a continuation ban. That path is contribution-anchored end to end and is widened to
accept a COMPRESS job before `saveResponse` is allowed to send one down it: `determineContinuation`
compares the returned object against the SOURCE it was sent rather than a recipe step's
`context_for_documents`; `continueJob` accepts a job whose payload carries no `output_type` and
whose saved output is a resource rather than a contribution; `processCompressJob` routes a
continuation job to continuation assembly instead of re-compressing its source from scratch;
`assembleContinuationPrompt` anchors on a resource artifact rather than a
`target_contribution_id` chain. Only then does `saveResponse` gain its COMPRESS tail. At this
seam a COMPRESS response persists, continues when incomplete, and dispatches its render — no
COMPRESS jobs exist yet.

A COMPRESS continuation is anchored by its own payload, not by a row pointer.
`dialectic_generation_jobs.target_contribution_id` addresses `dialectic_contributions`, and a
COMPRESS job's prior output is a `dialectic_project_resources` row, so a COMPRESS continuation
row leaves that column null and carries its `continuation_count` and compression identity on the
payload. `PromptAssembler.assemble()` selects continuation assembly on a non-empty
`target_contribution_id` and is therefore not the route for a COMPRESS job; `processCompressJob`
selects it directly on `continuation_count`.

`continueUntilComplete` is not read in this workstream. Completeness is an invariant, not a
preference: a document missing a key is not a shorter document, it is an invalid one that hands
the next stage's agent a hole and gives the renderer nothing to fill. Templating and
template-match checking define completeness; the output-tokens budget defines length. A COMPRESS
job settles it outright — it has no user in the loop and carries no `continueUntilComplete` on
its payload, so any gate on that flag is permanently closed for compression.

Every completeness trigger in `determineContinuation` is therefore unconditional, and
`continueJob` refuses no continuation its caller has already determined is warranted. Runaway
continuation is bounded by the continuation-count limit and the per-response output-token
budget; neither reads this flag.

Known limitation, out of scope here: the structural-repair signal is a single boolean covering
two distinguishable causes — a repair that fixed escaping or stray backticks around complete
content, and a repair that closed a structure the stream cut short. Only the second is evidence
of an incomplete response; the first spends a model call to re-emit content already in hand. The
finish-reason and missing-keys triggers catch nearly every instance of the second, leaving a cut
landing inside the final key's value under an unreliable finish reason. Narrowing it means
teaching the sanitizer to report which repair it performed and driving continuation only on the
truncation arm — a change to the sanitizer's own contract, not to these triggers.

Out of scope: removing the `continueUntilComplete` member from the payload, its guards, its
mocks, or the control that writes it.

Strict node order: `determineContinuation` → `continueJob` → `assembleContinuationPrompt` →
`assembleCompressionPrompt` → `enqueueModelCall` → `processCompressJob` → `processJob` →
`saveResponse`. The two added producers both sit before `processCompressJob`, which consumes
them: it reads `assembleCompressionPrompt`'s changed return and calls `enqueueModelCall` with the
widened `output_type`. Neither is a WS-R change — WS-R is closed; each is a new node in this
workstream against a file that workstream built, exactly as WS-I takes new nodes against
`path_constructor.ts` and `enqueueCompressJobs.ts`. No composition-root touch:
`saveResponse` gains no dependency, the three renderer deps it sheds were never wired into
`netlifyResponse/index.ts`, and `IPromptAssembler` already declares
`assembleContinuationPrompt`, so the facade and both composition roots are untouched — the only
wiring edit is `processJob.ts`, which builds `ProcessCompressJobDeps` inline.
* ✏️ `supabase/functions/_shared/utils/determineContinuation/determineContinuation.ts` — the
  completeness comparison gains the compression case: the missing-keys check runs against the
  SOURCE object a COMPRESS job was sent (its payload's `content`), not against a recipe step's
  `contextForDocuments`, which a COMPRESS job does not carry. The two comparisons are selected
  by which member the caller populates, never by a flag or a job-type discriminator. Every
  trigger is unconditional: the finish-reason pass-through, the self-reported-incompleteness
  inspection, the structural-repair trigger, and both missing-keys comparisons.
  `DetermineContinuationParams` retains the `continueUntilComplete` member so callers compile;
  the function does not branch on it. The two cases in `determineContinuation.test.ts` that pin
  flag-gated behavior are rewritten to assert the unconditional behavior.
  Support: the module's FULL support system, because the new member is required and puts a new
  check in a guard whose cases are unproven today — `determineContinuation.interface.test.ts`
  (the seventh member's contract, by typed assignment); `determineContinuation.mock.ts` (NEW —
  the module has no mock file, and the four-symbol builder/invalidator pair is owed to each
  owned object type, `DetermineContinuationParams` and `DetermineContinuationResult`);
  `determineContinuation.interface.guards.test.ts` (NEW — the case checklist for the member
  this entry introduces, fixtures drawn from those builders and invalidators, never
  hand-rolled, and it does not retrofit checklists for the six pre-existing members);
  `determineContinuation.interface.guards.ts` (a presence-only check, the member being
  `unknown`); and `determineContinuation.test.ts`. The mock precedes the guard test that
  consumes it.
  RIDES HERE: `dialectic.mock.ts` gains `buildContextForDocument` and
  `invalidateContextForDocument`. `contextForDocuments` is `ContextForDocument[]`, an imported
  type whose builders belong to its home package and may never be hand-built or locally
  mocked, and no builder for it exists anywhere in the repo — so the mock file above cannot be
  authored without them. They ride this entry rather than taking an entry of their own: they
  exist solely so this module's builder can populate one member, and no other node in the epic
  consumes them.
* ✏️ `supabase/functions/dialectic-worker/continueJob.ts` — accept a COMPRESS job. The function
  requires `payload.output_type` passing `isModelContributionFileType`, requires
  `payload.user_jwt` and `payload.continueUntilComplete`, and takes a
  `savedContribution: DialecticContributionRow` argument — a COMPRESS payload carries none of
  those and its saved output is a `dialectic_project_resources` row. The gates and the
  saved-output argument widen to cover both shapes, discriminated by payload structure. Delete
  the early `enqueued: false` return on a falsy `continueUntilComplete`, so a caller that has
  already determined continuation is warranted is never refused here. The continuation-count
  limit and its `continuation_limit_reached` outcome are the sole structural bound, applied once
  in the shared tail both arms reach, after that arm's own gates, so a payload that fails a gate
  reports its own defect rather than the limit and the EXECUTE gate order is unmoved.
  Each arm constructs its continuation payload as a strictly typed object — a
  `DialecticExecuteJobPayload` literal on the EXECUTE arm, a `DialecticCompressJobPayload` literal
  on the COMPRESS arm — every member set explicitly from the parent payload its arm's guard has
  already narrowed, with the continuation counter advanced, and `canonicalPathParams` constructed
  as the owned type it has. The string-keyed `Json` accumulator, the key-copy loops, the
  `Object.getOwnPropertyDescriptor` reads of `user_jwt` and `is_test_job`, and the
  post-construction `isJson` re-validation go with it: each exists only to carry an object the
  type system was never given, and a guard applied afterward does not type an object that was
  built untyped. Every object this function emits is strictly typed.
  Support: continueJob tests.
* ✏️ `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt/assembleContinuationPrompt.ts`
  — anchor a COMPRESS continuation on its resource artifact. The function requires
  `target_contribution_id`, walks the `dialectic_contributions` chain to a root, feeds that root
  to `gatherContinuationInputs`, and requires `payload.model_slug`/`payload.document_key` to
  persist a `TurnPrompt` keyed on `sourceContributionId`. A COMPRESS branch, selected by payload
  structure, resolves its prior output from the canonical `CompressedContextRawJson` artifact
  built out of the payload's own compression identity, and persists its continuation prompt under
  that same identity. Its deps arrive from `processCompressJob` rather than from
  `PromptAssembler.assemble()`, so the branch reads nothing off `job.target_contribution_id`.
  `AssembleContinuationPromptDeps` today requires `project`, `session`, `stage`, `gatherContext`,
  and `assembleChunks` — recipe-stage context a COMPRESS job has none of. The deps shape
  accommodates a caller that supplies only what the COMPRESS branch reads, and the EXECUTE/PLAN
  branch continues to require every member it reads today. The EXECUTE/PLAN branch is otherwise
  unchanged. It persists through the `fileManager.uploadAndRegisterFile` call and the FileType
  switch it ALREADY owns — the switch that selects `PlannerPrompt` for a PLAN job and
  `TurnPrompt` otherwise gains a COMPRESS arm selecting `CompressionPrompt`. No second
  persistence site, and no hand-built second upload context.
  Support: assembleContinuationPrompt tests.
* ✏️ `supabase/functions/_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.ts`
  — persist the prompt it renders, as every other `IPromptAssembler` member already does. Today it
  loads its template, validates params and payload, renders through `deps.renderPromptFn` and
  returns a bare `{ prompt }`; it holds no `fileManager` and no `constructStoragePath`, and
  `processCompressJob` puts that string straight into `chatApiRequest.message` with
  `promptId: '__none__'`. A COMPRESS job's prompt is therefore the only prompt in the pipeline
  with no artifact and no provenance, and `FileType.CompressionPrompt` would have no producer.
  It persists as `CompressionPrompt` at the canonical path the WS-I `path_constructor` node
  defines, through the same `uploadAndRegisterFile` call its sibling assemblers use, and its
  success arm becomes `AssembledPrompt` (`{ promptContent, source_prompt_resource_id }`), so the
  facade method, `IPromptAssembler`, and the `Error` arm all keep the shapes the other assemblers
  have. Deps gain `fileManager` and `constructStoragePath`; params gain the `modelSlug`, sourced
  from the COMPRESS payload's own `model_slug`, which every child row carries because
  `enqueueCompressJobs` copies it from the parent. `processCompressJob` forwards that member and
  resolves no provider row for it: the payload was given the slug so that no consumer on this
  path has to fetch one.
  Support: assembleCompressionPrompt tests, interface, mock.
* ✏️ `supabase/functions/dialectic-worker/enqueueModelCall/enqueueModelCall.ts` — widen the
  `output_type` guard to accept `FileType.CompressedContextRawJson` alongside
  `FileType.CompressedContext`. The model call's output IS the raw response: `saveResponse`
  persists it as `CompressedContextRawJson` under `_work/raw_responses` and a RENDER job writes
  the `CompressedContext` markdown (decision 8), so the enqueue must declare the raw type. The
  guard admits contribution types plus `isCompressedContextFileType` only, and
  `isCompressedContextRawJsonFileType` is already exported from `type_guards.file_manager.ts`
  for it to reuse. Support: enqueueModelCall.test.ts.
 * ✏️ `supabase/functions/dialectic-worker/processCompressJob/processCompressJob.ts` — route a continuation job to continuation assembly, and carry the victim's full identity into dedup layer 2. The function calls `assembleCompressionPrompt` unconditionally, which rebuilds the original compression prompt from the payload's `content`, so a continuation job re-compresses its source from scratch and discards the partial output that caused the continuation. On `continuation_count` greater than zero the function calls `assembleContinuationPrompt` instead, passing the deps that function's COMPRESS branch requires, and enqueues the model call with the returned prompt; on zero, or absent, it calls `assembleCompressionPrompt` as it does now. The window assertion, the recursion guard, dedup layer 2, and the `output_type: FileType.CompressedContextRawJson` enqueue apply identically to both branches — a continuation call that does not fit the model window is the same hard, non-retriable failure a first call is.
 Dedup layer 2's `PathContext` literal carries `documentKey` for a `'feedback'` victim and `role` alongside `sourceId` for a `'history'` victim, sourced from `DialecticCompressJobPayload` per WS-I's identity split. The literal carries `sourceType`/`documentKey`/`sourceId` alone today, so a history victim throws inside the canonical-path construction and returns a non-retriable error before the job can spend anything. It lands here rather than in WS-I because nothing reaches it earlier: no production path dispatches a COMPRESS job until WS-D's cutover, and every payload in `processCompressJob`'s own suites is `sourceType: 'contribution'` — `'history'` appears only as an unexercised member of a test helper's parameter type. WS-P precedes WS-D, so the fix lands before the gap is reachable, and `processCompressJob` keeps one node for one file.
 `processCompressJob` gains a bound `assembleContinuationPrompt` dep alongside `assembleCompressionPrompt`.
 Support: processCompressJob tests.

* ✏️ `supabase/functions/dialectic-worker/processJob.ts` — supply the new dep. The `COMPRESS`
  case builds `ProcessCompressJobDeps` inline, binding `ctx.promptAssembler.assembleCompressionPrompt`
  into a closure; it binds `ctx.promptAssembler.assembleContinuationPrompt` the same way and adds
  it to the literal. `ctx.promptAssembler` is typed `IPromptAssembler`, which already declares the
  method, so no facade, context, or composition-root edit is required. The
  `assembleCompressionPrompt` closure additionally supplies the `fileManager` and
  `constructStoragePath` that node adds to its deps, both already on `ctx`. The `EXECUTE`, `PLAN`,
  and `RENDER` cases are unchanged.
  Support: processJob tests.
* ✏️ `supabase/functions/dialectic-worker/saveResponse/saveResponse.ts` — a COMPRESS response
  is handled through the same path an EXECUTE response takes, diverging only at the tail. Route
  on the job row's `job_type` before the EXECUTE path's `isModelContributionFileType(output_type)`
  check, since the COMPRESS payload census has no `output_type`. Parse / sanitize / retry on
  malformed or empty output (shared with EXECUTE). For a structured (`mode:'json'`) source,
  verify completeness against the source via `determineContinuation` — an incomplete result
  continues via the ordinary continuation path, it is not a failure; a `mode:'text'` source
  (feedback/history) has no key structure to verify and does not continue. This file holds the
  ONLY `determineContinuation({ ... })` literal in the repo — every other consumer holds the
  function itself — so this node supplies the required `sourceObject` member that entry adds:
  the parsed source object from the COMPRESS payload's `content` on the COMPRESS path, and
  `undefined` on the EXECUTE path, whose own `documentKey`/`contextForDocuments` comparison is
  unchanged. Both paths reach the one call site, so both populate the member explicitly. Persist the completed
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
  overlay and the dedup layers read. `saveResponse` constructs no identity of its own: it forwards the victim's identity to `buildUploadContext`'s resource arm exactly as `DialecticCompressJobPayload` carries it — `documentKey` for a contribution, resource or feedback source, `sourceId` + `role` for a history source. `saveResponse` holds NO renderer deps —
  no `resolveTemplateFilename`, no `loadDocumentTemplate`, no `renderStructuredDocument` — and
  performs no rendering, no structural drift check of its own, and no continuation hard-fail.
  Wallet debit with real user/wallet attribution flows through the existing stream persistence
  machinery. Imports `DialecticCompressJobPayload`/`CompressionMode` + the payload guard from
  the enqueueCompressJobs module, and `EnqueueRenderCompressedContextPayload` from the
  enqueueRenderJob module.
  Support: saveResponse tests (route matrix: EXECUTE→contribution unchanged; COMPRESS json
  complete→persisted CompressedContextRawJson + RENDER job dispatched and
  `waiting_for_children` set when renderable; COMPRESS json incomplete→continuation, not
  failure; COMPRESS text→raw persisted AND the extracted string persisted as CompressedContext,
  no RENDER dispatch, job completed; existing-artifact→idempotent completion; no
  notifications on any COMPRESS path).
* **COMMIT WS-P** — a COMPRESS response persists, continues when incomplete, dispatches its
  render when the source is renderable, and writes its extracted artifact directly when the
  source is text; no COMPRESS jobs exist yet.

## WS-D — COMPRESSION ORCHESTRATION CUTOVER (depends WS-P)
Strict node order: `applyCompressionOverlay`→ `gatherArtifacts` → `vector_utils` →
`compressPrompt` → `calculateAffordability` → `prepareModelJob` → `StreamChat` → `streamRewind`
→ `index.ts` → `processSimpleJob`. `applyCompressionOverlay` and `gatherArtifacts` have no
import dependency on `vector_utils`/`compressPrompt` — they depend only on WS-C machinery;
`gatherArtifacts` is the SOLE PRODUCER of `ResourceDocument.type`, which `vector_utils`
consumes, so the producer pair runs first and `vector_utils` is written against a conformant
type with no window of transient type mismatch. `calculateAffordability`/`prepareModelJob`/
`processSimpleJob` depend strictly on `compressPrompt`/`gatherArtifacts` respectively, both
landed by the time each is reached.
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
  compression candidates): the `rType === 'document'` branch (:139, rendered documents) and the
  `rType === 'project_resource'` branch (:355, user-submitted references) both → `'resource'`;
  the `rType === 'feedback'` branch (:236) stays `'feedback'`; the `rType === 'seed_prompt'`
  branch (:295, the project's original kickoff input — already transformed into a different
  object before any later model call, never a compression candidate) and the generic catch-all
  `dialectic_contributions` branch (:449, header_context and other internal pipeline artifacts)
  both → `'system'`. Support: gatherArtifacts.test.ts (assert each of the five branches emits
  the correct one of the three literals).
* ✏️ `supabase/functions/_shared/utils/vector_utils.ts` (+ interface) — single full rewrite.
  Runs after `applyCompressionOverlay`/`gatherArtifacts` so `ResourceDocument.type` already
  carries the tightened 3-member union when this node is written. Selection becomes
  embedding-free: `effectiveScore = candidateTokens × importance`,
  where candidateTokens comes from `deps.countTokens` (same tokenizer/modelConfig as the
  preflight, threaded via CompressionStrategyDeps/Params) and `importance` is the existing 0..1
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
  calls, `embeddingClient` from `CompressionStrategyDeps`, the dialectic_memory diagnostic
  query, and `cosineSimilarity` (its sole remaining consumer, rag_service, is deleted later
  in WS-X — the transient break resolves before that commit). Support: vector_utils.test.ts.
* ✏️ `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts` — full rewrite as
  a two-phase machine driven by artifact existence. Interface changes ride this node
  (compressPrompt.interface.ts is obligately part of its support system):
  `CompressPromptSuccessReturn` gains `waiting_for_children: boolean` (deferral = success);
  deps REMOVE `ragService`, `embeddingClient`, and the in-loop RAG-debit use of
  `tokenWalletService` (debits ride the stream persistence path); deps ADD
  `applyCompressionOverlay: BoundApplyCompressionOverlayFn`,
  `enqueueCompressJobs: BoundenqueueCompressJobsFn`, `fileManager`, `constructStoragePath`, and
  `downloadFromStorage` — NO deconstructor dep, for the same reason the overlay takes none;
  params ADD `parentJob: DialecticJobRow`, `projectId`, `iterationNumber`, and `targetKey`, none
  of which the current shape carries and all of which the canonical `PathContext` requires; NO
  new union member in `CompressPromptReturn`. Implementation:
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
  **Recount/finalize:** recount against the overlaid, possibly reduced working set; fall through
  to the existing window/affordability finalization when it fits, returning
  `waiting_for_children: false`. The enforced-alternation rebuild is not deleted with the RAG
  loop — it applies ONCE here, since the overlay swaps content but inserts no alternation
  fillers. Also removes the dialectic_memory indexed-ids query. Support: compressPrompt.test.ts.
* ✏️ `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts` —
  thread `parentJob`, `projectId`, `iterationNumber`, and `targetKey` into CompressPromptParams,
  adding the same four to `CalculateAffordabilityParams`; propagate `waiting_for_children: true`
  as a NEW discriminated `CalculateAffordabilityPendingReturn` variant, never a boolean bolted
  onto the Direct or Compressed shapes, with the existing guards gaining mutual exclusion
  against it. A paused `compressResult`'s `chatApiRequest`/`resolvedInputTokenCount`/
  `resourceDocuments` are NOT final and are not threaded into that return.
  RIDES HERE: this file's `tokenizerDeps` is constructed with a character-indexing `getEncoding`
  and a `text.length` `countTokensAnthropic`. It is the ruler for the preflight, for
  `finalTargetThreshold`, and — forwarded into `compressPrompt`'s payload — for `vector_utils`
  scoring and `enqueueCompressJobs`'s fit-or-chunk sizing, while `processCompressJob` measures
  the same pipeline with real tokenizers. Replace both with the real implementations
  `tokenEstimator` already uses, so the whole compression loop is measured with one ruler.
  Support: calculateAffordability.test.ts, calculateAffordability.integration.test.ts (its
  oversized case is rewritten: the RAG deps it constructs no longer exist, its `'document'`
  fixtures are invalid, and it asserts a synchronous replacement that no longer happens).
* ✏️ `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts` — thread the same
  four values into `CalculateAffordabilityParams` (all already local: the validated
  `projectId`/`iterationNumber`, `output_type` as `targetKey`, and `job` as `parentJob` — no
  provider lookup, the parent's own model is already in play), and propagate the pending variant
  upward as `PrepareModelJobPendingReturn`, returned before any `chatApiRequest` is built and
  before `enqueueModelCall` is reached. Its guards gain the same mutual exclusion.
  Support: prepareModelJob.test.ts, prepareModelJob.integration.test.ts (its oversized case is
  rewritten for the same three reasons).
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
* ✏️ `supabase/functions/dialectic-worker/processSimpleJob.ts` — supply `stageSlug` and
  `targetKey` (`resolvedRecipeStep.output_type`, already resolved above the call site) to
  gatherArtifacts; on a pending return, log and exit cleanly (parent correctly paused; no
  failure, no retry, no execute_completed notification). RIDES HERE (last-written file the
  test needs to run): the FULL-CHAIN compression integration test — real internals, only true
  external boundaries mocked (background-worker HTTP, Supabase), no repo-owned function
  mocked. Asserts, in order: (1) oversized input → no stream call enqueued; parent →
  `waiting_for_children`; pending propagates; processSimpleJob exits cleanly. (2) COMPRESS
  child row(s) with `parent_job_id = parent.id`; payload carries mode + content + targetKey +
  the source identity its own sourceType requires (documentKey for contribution/resource/
  feedback, sourceId + role for history) + chunk_index/chunk_total + the parent's model_id. (3)
  JSON-mode child: the enqueued call carries the completed source JSON AND the target
  skeleton; the mocked callback returns compressed JSON. (4) saveResponse verifies completeness
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
  enqueued. (8) Recursion guard: a COMPRESS job whose prompt exceeds the window hard-fails;
  it never spawns compression. (9) Reuse: a sibling parent job producing the SAME target
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
  migration: `drop function if exists public.match_dialectic_chunks(...);` and
  `drop table if exists public.dialectic_memory;`. Regen types_db.ts (nothing references the
  dropped objects by this point).
* **COMMIT WS-D + WS-X — compression loop live, RAG core gone, every production tokenizer real,
  full-chain test green.**

---

## CANONICAL CONTRACTS (defined ONCE here; every consuming node uses these shapes VERBATIM —
repo convention `Fn(deps, params, payload): Promise<Return>`,
`Return = SuccessReturn | ErrorReturn`, DI binding `BoundFn(params, payload)`; payload is
NEVER empty — it is the data the function operates on)

TYPE OWNERSHIP (module-first; owner file → landing node):
* `FileType.CompressedContext`, `FileType.CompressedContextRawJson`, `CompressionSourceType`, `CompressionMode` (+ guards in `type_guards.file_manager.ts`) → `_shared/types/file_manager.types.ts`, landed by the WS-C `path_constructor.ts` node. `PathContext.role: Messages['role']` and its guard `isCompressionHistoryRole` land in the same two files, by the WS-I `path_constructor.ts` node — `Messages['role']` rather than a new union or `ChatMessageRole`, because `applyCompressionOverlay` and `enqueueCompressJobs` read the value straight off a `Messages` object and any narrower or duplicated union would force a cast at the producer and could drift from it. `CompressionMode` sits here rather than on `enqueueCompressJobs.interface.ts` (its otherwise-natural creator-owns-the-data home) because `assembleCompressionPrompt.ts` (`_shared/prompt-assembler/`) also needs it, and `_shared/` code must never import from `dialectic-worker/` — the type must live where every layer that needs it can import downward. `enqueueCompressJobs.interface.ts` imports `CompressionMode` from here; it does not define it.
* `BuildUploadContextResourceParams` → `buildUploadContext.interface.ts`. Identity members are required per `sourceType`, matching `DialecticCompressJobPayload` exactly: `'contribution'|'resource'|'feedback'` require `documentKey`; `'history'` requires `sourceId` + `role`. Consumed by `saveResponse`'s COMPRESS tail and `renderDocument`'s CompressedContext case.  `CompressionMode` (+ guards in `type_guards.file_manager.ts`) →
  `_shared/types/file_manager.types.ts`, landed by the WS-C `path_constructor.ts` node.
  `CompressionMode` sits here rather than on `enqueueCompressJobs.interface.ts` (its
  otherwise-natural creator-owns-the-data home) because `assembleCompressionPrompt.ts`
  (`_shared/prompt-assembler/`) also needs it, and `_shared/` code must never import from
  `dialectic-worker/` — the type must live where every layer that needs it can import downward.
  `enqueueCompressJobs.interface.ts` imports `CompressionMode` from here; it does not define it.
* `DialecticCompressJobPayload` (+ `isDialecticCompressJobPayload` in the module guard file)
  → `enqueueCompressJobs.interface.ts`, landed by the WS-R `enqueueCompressJobs.ts` node
  (creator-owns-the-data — only this payload shape, not the shared `CompressionMode` type).
* `ProcessCompressJobFn` → `processCompressJob.interface.ts`, landed by the WS-R
  `processCompressJob.ts` node.
* `BoundEnqueueModelCallFn` → `enqueueModelCall.interface.ts`, landed by the WS-R
  `enqueueModelCall.ts` node.
* `AssembleCompressionPromptFn` shapes → `assembleCompressionPrompt.interface.ts` (its own
  node). `dialectic.interface.ts` (legacy hub) defines NOTHING new — it only extends
  `JobType`/`JobTypes`, the payload union, and `IJobProcessors` by importing from the owners,
  in its single touch (WS-R `processJob.ts` node).
* `enqueueCompressJobsFn(deps, params, payload)`:
  - Deps `{ logger, textSplitter, countTokens, constructStoragePath }` (`constructStoragePath`
    is required so this function can independently re-verify dedup layer 1 — compressPrompt's
    own candidate-exclusion query is a coarser, earlier check subject to a race against
    sibling jobs; this function recomputes the victim's canonical path and re-checks)
  - Params `{ dbClient, parentJob: DialecticJobRow, sessionId, projectId,
    stageSlug: DialecticStageSlug, targetKey: ModelContributionFileTypes,
    iterationNumber, modelId, modelSlug, walletId, modelConfig, tokenizerDeps }`
    (`stageSlug`/`targetKey` describe the CONSUMING stage/schema — the compression target;
    `modelId`/`modelSlug`/`walletId` are the parent's own, propagated to every child —
    `modelSlug` is the parent EXECUTE payload's `model_slug`, threaded through so no consumer
    of a COMPRESS row ever queries `ai_providers` for it; `parentJob` supplies
    `parent_job_id`, `is_test_job`, and `user_id` for the child rows)
  - Payload `{ victim: { mode: CompressionMode, content, sourceType: CompressionSourceType,
    sourceId?, role?, documentKey?: FileType, docType?: ModelContributionFileTypes,
    sourceStageSlug?: DialecticStageSlug } }` — `sourceId`/`role`/`documentKey` are
    each optional because which are required is fixed per `sourceType`
    (`'contribution'|'resource'|'feedback'` require `documentKey`; `'history'` requires
    `sourceId` + `role`), validated as an explicit
    branch, never an OR-fallback (matches the `path_constructor.ts` rule). ADDITIONALLY: `mode:'json'` requires `documentKey` + `docType` + `sourceStageSlug`
    — the source-document template identity the RENDER dispatch resolves against (WS-N) —
    validated as an explicit mode branch. ONE victim per call —
    incremental compression is the point; `content` is the completed source JSON in json mode,
    source text otherwise; a re-compress call passes the concatenation as a text-mode victim.
  - Return `{ createdCount } | { error, retriable }`; bound form `BoundenqueueCompressJobsFn(params, payload)`.
* `DialecticCompressJobPayload` (owned by `enqueueCompressJobs.interface.ts`, landed by the
  enqueueCompressJobs node):
  `{ job_type:'COMPRESS', sessionId, projectId, stageSlug: DialecticStageSlug,
  targetKey: ModelContributionFileTypes, iterationNumber, model_id (parent's),
  model_slug (parent's), mode: CompressionMode, content, sourceType, sourceId?, role?,
  documentKey?: FileType, docType?: ModelContributionFileTypes,
  sourceStageSlug?: DialecticStageSlug,
  chunk_index?, chunk_total?, continuation_count?, walletId, user_id }` — `model_slug` is
  REQUIRED and is the parent EXECUTE payload's own, copied onto every child: it is what
  `assembleCompressionPrompt` and `assembleContinuationPrompt` name their `CompressionPrompt`
  artifact with, and carrying it removes the only reason either would touch `ai_providers`;
  `chunk_index`/`chunk_total` are optional (present only for map-reduce chunk children); `continuation_count`
  is optional (present only on a continuation row, and the member `processCompressJob` selects
  continuation assembly on); source identity is required per `sourceType` exactly as the victim
  payload above requires it (`'contribution'|'resource'|'feedback'` → `documentKey`;
  `'history'` → `sourceId` + `role`); `mode:'json'`
  requires `documentKey` + `docType` + `sourceStageSlug` (the source-document template identity
  the WS-N RENDER dispatch resolves against; enforced by `isDialecticCompressJobPayload`);
  `content` is the completed source JSON in json mode (both the compressor input and the
  completeness-comparison baseline in saveResponse) and the source text otherwise. The exact field census is locked at
  workplan time, but ANY change re-anchors every consumer (enqueueCompressJobs,
  processCompressJob, assembleCompressionPrompt, saveResponse, guards, the full-chain test).
* `AssembleCompressionPromptFn(deps, params, payload)` — payload `{ mode, content,
  chunk_index?, chunk_total? }`. sourceType/sourceId/targetKey are deliberately ABSENT from
  this payload: prompt assembly does not consume them, and provenance persists on the COMPRESS
  job row payload and the canonical artifact path (no over-fetching). Params carry step/stage
  context for target-schema extraction; Return `{ prompt } | { error, retriable }`.
* `EnqueueRenderCompressedContextPayload` + `DialecticRenderCompressedContextJobPayload`
  (+ their guards) → `enqueueRenderJob.interface.ts` / the module guard file, landed by the
  WS-N `enqueueRenderJob.ts` node (creator-owns-the-data). The call payload carries ONLY the
  SOURCE identity `EnqueueRenderJobParams` does not already hold — `{ sourceType, documentKey,
  docType, sourceStageSlug, targetKey }`; the row payload is what `enqueueRenderJob` inserts
  after resolving `template_filename`, mirroring the existing
  `EnqueueRenderJobPayload` → `DialecticRenderJobPayload` split exactly. No `sourceId` and no
  chunk fields on either: map-reduce chunks are always `mode:'text'` and text artifacts are
  never rendered.
* `RenderCompressedContextParams` → `renderDocument.interface.ts`, landed by the WS-N
  `renderDocument.ts` node — the identity tuple `constructStoragePath`'s compression arm
  requires, plus `template_filename`. Built by `processRenderJob` from the row payload.
* `ApplyCompressionOverlayFn(deps, params, payload)` → `applyCompressionOverlay.interface.ts`,
  landed by the WS-D `applyCompressionOverlay.ts` node. Consumed by BOTH `gatherArtifacts` and
  `compressPrompt`, so the shape is fixed once here.
  - Deps `{ constructStoragePath: ConstructStoragePathFn,
    downloadFromStorage: DownloadFromStorageFn, logger: ILogger }` — no deconstructor
  - Params `{ dbClient, projectId, sessionId, iterationNumber,
    stageSlug: DialecticStageSlug, targetKey: ModelContributionFileTypes }` — `stageSlug` is the
    CONSUMING stage, `targetKey` this job's own compression target
  - Payload `{ resourceDocuments: ResourceDocuments, history: Messages[] }` — either array may
    be empty; the payload object never is
  - Return `{ resourceDocuments, history } | { error, retriable }`; bound form
    `BoundApplyCompressionOverlayFn(params, payload)`
* `DetermineContinuationParams` gains `sourceObject: unknown` — the parsed source object a
  COMPRESS job was sent, from its payload's `content`; `undefined` for an EXECUTE job. The two
  missing-keys comparisons are selected by which member the caller populates, never by a flag.
* `ContinueJobFn`'s saved-output parameter widens to
  `DialecticContributionRow | DialecticProjectResourceRow`, discriminated by payload structure.
  `IContinueJobDeps` and `IContinueJobResult` are unchanged.
* `DeconstructedPathInfo` gains `sourceType`, `sourceId`, and `role`, landed by the WS-I
  `path_deconstructor.ts` node — without them a compressed artifact's identity cannot be
  expressed on the return, and the lossless round-trip WS-C requires cannot be asserted.
* `CompressPromptSuccessReturn` gains `waiting_for_children: boolean`; pending variants
  propagate upward as distinct discriminated variants — `CalculateAffordabilityPendingReturn`
  (`{ waiting_for_children: true }`) → `PrepareModelJobPendingReturn` (`{ waiting_for_children:
  true }`) — never a boolean added to an existing success shape, and each layer's existing
  guards gain mutual exclusion against the new variant.

## CONTRACT INTEGRITY RULES
1. One canonical contract per function, defined in this plan, consumed verbatim by every node
   that references it. Divergent duplicate shapes of the same contract across nodes
   (different return keys, params, or arity between definer and consumers) are plan defects.
2. Only real APIs: every method a node calls must exist in source with that exact name and
   signature (e.g. `fileManager.uploadAndRegisterFile(context)` — there is no `uploadResource`).
   Verify against source at workplan time.
3. Every DB/RPC call in a node must match a definition that exists in this plan or in source —
   argument names, arity, and return shape included.
4. Payload is never empty; Return is always Success|Error; contract tests define what IS.

## CONSTRAINTS / RULES
- Read → Analyze → Explain → Propose → HALT. NO workplan edits, NO checklist nodes into chat
  without explicit per-turn permission.
- workplan.instructions.md: one source file per top-level node incl. ENTIRE support system;
  types/interfaces never their own node (ride with their owning file); nodes NOT numbered;
  commit step in the LAST node of a completed set of work; nothing is numbered at any level —
  not nodes, not workstreams; NO audit/validate/no-op steps.
- Read types_db.ts for schema truth. Do not treat the legacy RAG implementations as design
  guidance.

## APPENDIX — DOCUMENT_RENDERER TEST REDISTRIBUTION MAP (binds the WS-B module nodes and the
WS-N relocation node; the workplan author copies the relevant rows into each node so the
implementer is told exactly what goes where — nothing is left to implementer judgment)

Dispositions: every baseline case is kept and repointed into the persistent `renderDocument.integration.test.ts`
(real siblings, only DB/storage mocked) — the chain-level regression guard that fails the
moment a future edit mis-wires the orchestrator. The MOVE/RETAIN label records ONLY
whether a case ALSO gains direct isolation coverage; no case is deleted:
**MOVE(module)** — the case's assertions are ADDITIONALLY recreated against that module's
DIRECT API in the module node's own unit `.test.ts` (authored at module-node time, BEFORE the
relocation node) — part-in-isolation coverage, additive to (never a replacement for) the
retained integration case; the intentional duplication tests a different layer (the part in
isolation vs the part as wired by the orchestrator). **RETAIN** — pure orchestration behavior
with no sibling-level equivalent; it lives ONLY in the integration suite. Line numbers
reference the current `document_renderer.test.ts` baseline.

`Deno.test("DocumentRenderer - end-to-end contract (skeleton)")` (:104)
| t.step (line) | Disposition |
|---|---|
| can be invoked following an EXECUTE job completion with job signature (:111) | RETAIN |
| locates all relevant contribution chunks for the document (:225) | MOVE(assembleContributionChain) |
| renders chunks into markdown using a stage/file-type template (:400) | RETAIN (end-to-end spine) |
| writes the rendered markdown to storage with deterministic final-artifact path (:539) | RETAIN (persist tail) |
| issues a notification that the document has been rendered with its signature (:673) | RETAIN (notify tail) |
| idempotent and cumulative behavior (:778) | RETAIN |
| produces identical ordering via chain-walk and created_at parity (:936) | MOVE(assembleContributionChain) |
| prefers latest user-edited version over prior model chunks (:1024) | MOVE(assembleContributionChain) |
| applies DB-side filtering predicates to contributions query (:1113) | MOVE(assembleContributionChain) |
| passes the originating contribution id to FileManager (:1275) | RETAIN (persist tail) |

`Deno.test("DocumentRenderer - JSON parsing and content extraction")` (:1395)
| t.step (line) | Disposition |
|---|---|
| parses JSON content from raw_response_storage_path and extracts content field (:1401) | MOVE(mergeChunkContent) |
| renders successfully when JSON has no content wrapper and metadata fields are present (:1542) | MOVE(mergeChunkContent) |
| converts escaped newlines, quotes, and backslashes correctly (:1671) | MOVE(mergeChunkContent) |
| uses markdown content directly when content is not JSON (:1799) | MOVE(mergeChunkContent) |
| handles mixed JSON and markdown chunks correctly (:1937) | MOVE(mergeChunkContent) |
| successfully retrieves document template ... using correct schema columns (:2103) | MOVE(loadDocumentTemplate) |
| successfully retrieves correct template when multiple templates match pattern-based query (:2239) | MOVE(loadDocumentTemplate) |
| throws error when uploadAndRegisterFile returns an error (:2388) | RETAIN (persist tail) |
| renders section-based template using renderPrompt with structured JSON content (:2527) | MOVE(renderStructuredDocument) |
| successfully parses JSON content when file has trailing whitespace or newlines (:2653) | MOVE(mergeChunkContent) |

`Deno.test("DocumentRenderer - root and continuation chunk handling")` (:2790) — all three
t.steps (:2796, :2941, :3129) | MOVE(assembleContributionChain)

`Deno.test("DocumentRenderer - correctly calls FileManagerService ...")` (:3354) —
ensures uploadAndRegisterFile is called with correct data (:3360) | RETAIN (persist tail)

PathContext / fragment-extraction group (four single-step Deno.tests):
| Deno.test (line) | Disposition |
|---|---|
| PathContext includes sourceGroupFragment when base chunk has ... source_group (:3474) | RETAIN (pathContext assembly is orchestrator output; the underlying source_group→fragment extraction gains DIRECT coverage in assembleContributionChain's module tests) |
| fragment extraction handles UUID with hyphens correctly (:3589) | MOVE(assembleContributionChain) — the extraction lives in the :141-247 copy range |
| PathContext works without source_group (:3704) | RETAIN |
| fragment extraction handles missing document_relationships gracefully (:3817) | MOVE(assembleContributionChain) |

template_filename group (two single-step Deno.tests + one rider step):
| t.step (line) | Disposition |
|---|---|
| renderDocument uses params.template_filename to query dialectic_document_templates (:3941) | MOVE(loadDocumentTemplate) |
| renderDocument finds template when template_filename has .md but database name does not (:4059) | MOVE(loadDocumentTemplate) |
| accepts content as object (not stringified JSON) and populates template sections correctly (:4168) | MOVE(mergeChunkContent) — the distinctive behavior is the content-as-object unwrap; section rendering is already covered by :2527's move |

`Deno.test("DocumentRenderer - array content handling")` (:4356) — all six t.steps (:4362
per-item render, :4505 separator concatenation, :4634 flat regression, :4765 nested-array
bullets, :4904 comment stripping, :5048 tech_stack nested objects) |
MOVE(renderStructuredDocument)

`Deno.test("DocumentRenderer - concatenate then sanitize/parse pipeline")` (:5371) — all six
t.steps (:5431 two-fragment concatenate+parse, :5498 single-chunk regression guard, :5553
backtick-wrapper sanitize, :5607 per-chunk fallback merge, :5675 plain-text path, :5729
mid-string structural repair via Phase 2) | MOVE(mergeChunkContent)

`document_renderer.examples.test.ts` — `Deno.test("DocumentRenderer - multi-structure JSON
rendering patterns")` (:451), all four t.steps (:457 system_architecture flat/string-array,
:591 tech_stack mixed flat+array-of-objects, :762 product_requirements content-wrapped/SWOT/
features, :1019 feature_spec per-item) | MOVE(renderStructuredDocument) — pure
data-pattern→markdown fixtures; becomes `renderStructuredDocument`'s examples test file.

Tally: 10 RETAIN (orchestration-only — integration-suite exclusive), 9 MOVE
assembleContributionChain, 13 MOVE mergeChunkContent, 4 MOVE loadDocumentTemplate, 7 + 4
examples MOVE renderStructuredDocument. Every baseline case is RETAINED in
`renderDocument.integration.test.ts`; the MOVE rows ADDITIONALLY gain a direct isolation copy
in their sibling's unit test. There is NO prune step — the relocation node repoints and
renames the monolith suite in full, it does not delete cases from it.
