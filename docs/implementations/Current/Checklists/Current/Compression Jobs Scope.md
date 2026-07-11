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
order, grouped into sprints. Each sprint terminates at an integration seam where the
application builds, runs, and passes tests (new code paths may be unreachable until later
sprints) — that seam is the commit marker. Transient non-compilable states are permitted
WITHIN a sprint (the sprint is not done until it compiles); they are never permitted at a
commit. Detailed per-file workplans (interface tests → interfaces → guard tests → guards →
unit tests → implementation → integration, per workplan.instructions.md) are generated after
this plan is ratified, one node at a time.

## BASELINE
Branch `feat/compress`, cut from `development`. (The `feat/embedding` branch is abandoned
before Sprint 1; nothing in this plan depends on or preserves any of its changes. The Netlify
adapters and enqueueModelCall on the baseline are the production stream-only versions.) All
file references in this plan are against this baseline; any text lifted from earlier checklist
material must be re-validated against it.

## DESIGN DECISIONS (ratified 2026-07-09)
1. **COMPRESS job type**, analogous to RENDER: an as-needed infrastructure job, NOT part of
   recipe steps, excluded from step status and progress DTOs, never routed through
   recipe-step machinery. COMPRESS jobs NEVER trigger compression themselves (recursion guard:
   a COMPRESS call that cannot fit its model window is a hard failure, not a nested compression).
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
   intermediate work product is preserved).
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
8. **Drift is a validated invariant, not a hope**: in JSON mode, saveResponse structurally
   diffs the compressor output against the source JSON (recursive key-shape match) before
   accepting it; a mismatch fails the COMPRESS job explicitly. The validated compressed JSON
   is then rendered SYNCHRONOUSLY through the SAME document template that rendered the
   original document — the renderer is an internal service (no external API call), so the
   sync/async rule permits it — persisting a compressed markdown artifact format-identical to
   its uncompressed siblings in the payload.
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
5. The stream callback returns → `saveResponse` routes by the job row's
   `job_type='COMPRESS'`. JSON mode: structurally validate the output against the source JSON
   (carried in the payload) — mismatch fails the job explicitly — then synchronously render
   through the source document's original template into compressed markdown. Text mode:
   persist the compressed text directly. Either way: persist via fileManager as a
   `ResourceUploadContext` at the canonical path, idempotently (dedup layer 3). Wallet debit
   with real user/wallet attribution flows through the normal stream persistence machinery.
   (`netlifyResponseHandler` is untouched — a COMPRESS response is an ordinary stream
   response.)
6. Parent resumes. `compressPrompt` reduce check: a chunked victim with all chunk artifacts
   but no final artifact → concatenate in `chunk_index` order (fileManager read, synchronous);
   still over the per-victim target → spawn ONE re-compress COMPRESS child → pause again;
   else persist the concatenation as the victim's final artifact (fileManager write,
   synchronous). Rule: external model call = async job; internal DB/storage call = synchronous.
7. `gatherArtifacts` → `applyCompressionOverlay` swaps victim content (resource documents AND
   history messages) by (sourceType, sourceId) identity with the persisted CompressedContext,
   preserving id/document_key/stage_slug/type. The orchestrator never knows a swap occurred.
8. Recount. Still over → next victim (step 2). Fits → enqueue the real stream call.

**Key reuse:** `parent_job_id` + `waiting_for_children` + the completion trigger are existing
infrastructure. The entire model-call transport (enqueueModelCall → background worker →
callback → saveResponse) is the production stream path; COMPRESS adds a routing case, not a
transport.

## NODE & SPRINT RULES
- One source file per node, including its ENTIRE support system (interface tests, interfaces,
  guard tests, guards, unit tests, implementation, integration). Types/interfaces are never
  their own node — they ride with their owning source file's node.
- Type ownership is module-first: every NEW type lives in the interface file of the module
  that owns it (see TYPE OWNERSHIP under CANONICAL CONTRACTS). `dialectic.interface.ts` is a
  legacy "basket of crap" hub being refactored away — it receives ONLY the unavoidable
  extensions of things it already owns (`JobType`/`JobTypes`, the `DialecticJobPayload`
  union, `IJobProcessors`), in one touch, IMPORTING the new types from their owning modules.
  No new type is ever defined in the hub. (The legacy inline `Process*JobFn` signatures in
  the hub predate the function-folder-as-module method and are debt, not precedent.)
- Touch-once is per-epic: within this epic, all changes to a file aggregate into its single
  node — get everything together before touching it, so the file and its support system
  (interfaces, guards, tests) are updated exactly once, never incrementally. Enumerated
  exceptions, each justified: (1) `dialectic-worker/index.ts` — THREE touches (WS-R wiring;
  WS-B renderer-import repoint; WS-X removal wiring): the composition root must reflect every
  wiring phase, and aggregating any touch into another would leave an intermediate sprint
  commit non-compilable. (2) The WS-B renderer relocation (ratified 2026-07-11: the
  document_renderer monolith is decomposed into function-folder modules and the loose files
  DELETED — no facade file left behind) forces import-path-ONLY repoints in files whose
  aggregated touches land in Sprint 3, BEFORE the relocated paths exist, so the repoints
  cannot aggregate backward: `dialectic.interface.ts` (:8, second touch),
  `createJobContext/JobContext.interface.ts` (:33, second touch), and `processRenderJob.ts`
  (:5, its only touch this epic). Each is a one-line import-path edit with zero behavior
  change, compile-checked at the Sprint-4 commit. (3) `netlifyResponse/index.ts` (ratified
  2026-07-11) is WS-B's OWN composition root — it builds `EnqueueRenderJobDeps` inline
  (:45-46) for production and is where `SaveResponseDeps` is assembled (:48-61) — mirroring
  WS-R's `dialectic-worker/index.ts` pattern exactly: every WS-B node that adds a required
  dep to `EnqueueRenderJobDeps` or `SaveResponseDeps` (the `resolveTemplateFilename` node's
  consumer-swap, and `saveResponse.ts` itself) makes this file transiently non-compilable
  (permitted within the sprint); ONE dedicated capstone node, last before the Sprint-4
  commit, wires everything in exactly once. `dialectic-worker/index.integration.test.ts`
  (:148-169, the parallel test-harness wiring for the same deps) rides the SAME capstone
  node rather than getting its own — it is test infrastructure for this file, not a second
  production composition root.
- The epic ships exactly TWO migrations, each written once: an ADD migration (Sprint 1, new
  machinery) and a REMOVE migration (Sprint 5, old machinery). They are justifiably distinct —
  the removal cannot land while code still references the dropped objects, and a separate
  file lets the drop apply without resetting the dev database — versus a noisy chain of
  incremental migrations, which is what the single-migration standard forbids. types_db.ts is
  regenerated with each.
- Transient non-compilable states are allowed within a sprint and resolve in the listed node
  order; every sprint ends compiling with tests green — that is the commit.
- Integration tests are never stranded in their own node; each rides the last-written file it
  needs to run.

## SPRINT / COMMIT MAP
| Sprint | Workstreams | Commit seam (app builds + runs + tests green) |
|---|---|---|
| 1 | WS-0 Foundation | COMPRESS enum + compression template exist; no caller |
| 2 | WS-C Artifact identity | CompressedContext FileType + identity types + paths + fileManager support exist; no writer |
| 3 | WS-R Routing & spawn | COMPRESS routable & processable end-to-end; nothing creates COMPRESS jobs yet |
| 4 | WS-B Renderer decomposition + persistence | renderer decomposed into function-folder modules, monolith deleted; saveResponse routes COMPRESS outputs; no COMPRESS jobs exist yet |
| 5 | WS-D Orchestration cutover + WS-X RAG removal | Compression loop live; RAG core gone; full-chain test green |

Workplan-file split: the workplan starts as one file (`Compression Jobs.md`); split at sprint
boundaries when it approaches ~1800 lines.

---

## WS-0 — FOUNDATION (Sprint 1; gates all)
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
  compile-safe). (The RAG DROPs live in the epic's separate REMOVE migration, WS-X — see
  NODE & SPRINT RULES.)
* **COMMIT Sprint 1** — the migration is this sprint's only node; the commit step rides it.

## WS-C — ARTIFACT IDENTITY: CompressedContext (Sprint 2; depends WS-0)
Ordered BEFORE routing/spawn AND persistence: the dedup layers in `enqueueCompressJobs` and
`processCompressJob` check canonical-artifact existence, and `saveResponse` is the artifact
writer — every one of them needs the identity machinery first.
* ✏️ `supabase/functions/_shared/utils/path_constructor.ts` — canonical CompressedContext path:
  the consuming stage's `_work` subdirectory,
  `{source_basename}_compressed_for_{target_key}.md` for final artifacts and
  `{source_basename}_compressed_for_{target_key}_chunk_{i}of{n}.md` for map-reduce
  intermediates. Encodes the full identity tuple (session, consuming stage, target schema
  key, source identity via document_key/type or history identity[, chunk_index]).
  Deterministic, collision-free within a stage across multiple targets consuming the same
  source. RIDES HERE (owner): `_shared/types/file_manager.types.ts` gains
  `CompressedContext = 'compressed_context'` under ResourceFileTypes AND
  `CompressionSourceType = 'contribution' | 'resource' | 'feedback' | 'history'` (source
  identity is path/file-identity vocabulary — this is the single definition every downstream
  module imports); `type_guards.file_manager.ts` gains `isCompressedContextFileType` +
  `isCompressionSourceType` (+ tests). Support: path_constructor.test.ts.
* ✏️ `supabase/functions/_shared/utils/path_deconstructor.ts` — parse the new segments;
  round-trip with the constructor must be lossless. Support: path_deconstructor.test.ts.
* ✏️ `supabase/functions/_shared/services/file_manager.ts` — persist CompressedContext as a
  first-class resource artifact (ResourceUploadContext), locatable by
  (session, consuming stage, target key, source identity[, chunk_index]) for the dedup
  layers, compressPrompt's reduce/lookup, and applyCompressionOverlay.
  Support: file_manager tests.
* **COMMIT Sprint 2.**

## WS-R — ROUTING & SPAWN (Sprint 3; depends WS-C)
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
  Imports `CompressionSourceType` from `file_manager.types.ts` (Sprint-2 owner). Dedup
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
  `file_manager.types.ts` (Sprint-2 owner — `_shared/` code must never import from
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
  `isCompressedContextFileType` from `type_guards.file_manager.ts` (Sprint-2 owner — no type
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
  `uploadAndRegisterFile`. Its resource arm gains its consumer in WS-B. All support files:
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
  `defaultProcessors`; pass `boundEnqueueModelCall` into `createJobContext`. FIRST of the two
  enumerated index.ts touches (second: WS-X removal wiring).
* **COMMIT Sprint 3 (WS-R).**

## WS-B — RENDERER DECOMPOSITION + CALLBACK / PERSISTENCE (Sprint 4; depends WS-R)
Ratified 2026-07-11: saveResponse's COMPRESS json mode must synchronously render compressed
JSON through the source document's ORIGINAL template, but the monolithic
`document_renderer.ts` cannot be handed data — it re-reads the contributions chain and
self-persists as RenderedDocument — and its `template_filename` input is resolved only by an
inline, unexported walk in `enqueueRenderJob.ts:138-256`. Rather than duplicate either piece,
the renderer is FULLY decomposed into function-folder modules and the monolith + its loose
satellite files are DELETED (no facade file left behind as an attractive nuisance; the
`renderDocument` orchestrator survives as a proper module with its signature unchanged, so
`IDocumentRenderer` consumers re-point imports only). COPY-FIRST sequencing (the
`text_splitter` pattern): module nodes land as copies with their own focused tests while the
monolith stays untouched; the single relocation node then swaps internals, and the UNMODIFIED
~5.9k-line monolith suite — pinned to the unchanged public signature — is the regression
oracle before its cases are redistributed. Strict node order: `resolveTemplateFilename` →
`enqueueRenderJob` → `loadDocumentTemplate` → `renderStructuredDocument` →
`assembleContributionChain` → `mergeChunkContent` → `renderDocument` (relocation + deletion)
→ `saveResponse` → `netlifyResponse/index.ts` (capstone wiring, mirroring WS-R's
`dialectic-worker/index.ts`).
* 🆕 `supabase/functions/_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts` —
  full function-folder module (NOT pure: it performs the stage → active recipe instance →
  cloned-or-template steps → step by `output_type` → `outputs_required.files_to_generate` →
  entry by `from_document_key` walk against the DB, with typed failure modes), extracted as a
  COPY of the inline block at `enqueueRenderJob.ts:138-256`. Canonical repo shape
  `Fn(deps, params, payload) => Success{ templateFilename } | Error{ error, retriable }`.
  Consumed by `enqueueRenderJob` (next node) and `saveResponse`'s json-mode COMPRESS branch
  (save-time resolution from the payload's `sourceStageSlug`/`docType`/`documentKey` — chosen
  over spawn-time resolution so the ratified `DialecticCompressJobPayload` census is
  unchanged). Support: full module per the new-package rule (interface, guards, mock, tests,
  provides).
* ✏️ `supabase/functions/dialectic-worker/enqueueRenderJob/enqueueRenderJob.ts` — replace the
  inline walk (:138-256) with a call to the INJECTED `resolveTemplateFilename` dependency
  (ratified 2026-07-11: every dependency is injected via Deps, without exception — no direct
  import of a cross-module function, however deterministic; every error returned by an
  injected dependency is surfaced as the exact object it was produced as, never reconstructed
  or paraphrased into a different error class). `EnqueueRenderJobDeps` gains
  `resolveTemplateFilename: BoundResolveTemplateFilenameFn` (required, no default);
  `EnqueueRenderJobErrorReturn.error` widens to
  `RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError` and
  `isEnqueueRenderJobErrorReturn`'s `instanceof` check widens to match — a
  `TemplateResolutionError` returned by the dependency is returned by `enqueueRenderJob`
  UNCHANGED (`return templateResult;` on the error branch, not a reconstructed error).
  Making this dep required leaves `netlifyResponse/index.ts` (which builds
  `EnqueueRenderJobDeps` inline for production, :45-46) and
  `dialectic-worker/index.integration.test.ts` (:154-155, the parallel test-harness
  construction) transiently non-compilable — permitted within the sprint; resolved by the
  `netlifyResponse/index.ts` capstone node, last before commit. Behavior identical for every
  success path; existing `enqueueRenderJob.test.ts` assertions pass once every one of its
  ~38 inline `EnqueueRenderJobDeps` literals gains the new required field (mechanical, not
  optional — TypeScript will not compile otherwise). Support: enqueueRenderJob.test.ts,
  enqueueRenderJob.interface.ts, enqueueRenderJob.interface.guards.ts,
  enqueueRenderJob.interface.test.ts.
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
  parsed`), `_extra_content` plain-text path, array-join normalization. saveResponse's
  json-mode branch mirrors the content-unwrap rule (single-source case) for format-identical
  output. Support: full module.
* ✏️🗑️ `supabase/functions/_shared/services/document_renderer/renderDocument/renderDocument.ts`
  — the relocation + deletion node. Orchestrator with the UNCHANGED public signature
  `(dbClient, deps, params)` delegating to the four modules above and keeping the
  persist-as-RenderedDocument + `render_completed` notification tail (`document_renderer.ts:
  562-658`) — that tail is RENDER-flow-specific and stays in the orchestrator. The module's
  interface file re-homes `RenderDocumentParams`/`RenderDocumentResult`/`DocumentRendererDeps`/
  `IDocumentRenderer`/`ContributionRowMinimal`; its mock re-homes `createDocumentRendererMock`.
  Proof sequence INSIDE this node, in order: (1) repoint the untouched
  `document_renderer.test.ts` + `document_renderer.examples.test.ts` suites at the new module
  and run green — the regression oracle; (2) THEN redistribute: prune monolith cases now
  covered by the module nodes' own test files, retaining orchestration-level cases
  (end-to-end contract, chain-walk parity, path/notification behavior) as the module's test
  file; (3) DELETE `document_renderer.ts`, `document_renderer.interface.ts`,
  `document_renderer.mock.ts`, `document_renderer.test.ts`,
  `document_renderer.examples.test.ts`, and `verify_renderer.ts` (dev-only harness with
  hardcoded local paths — dies with the monolith); (4) repoint every importer —
  `dialectic-worker/index.ts:41` (import repoint = the composition root's SECOND enumerated
  touch), `processRenderJob.ts:5`, `dialectic.interface.ts:8`,
  `createJobContext/JobContext.interface.ts:33`, `createJobContext/JobContext.mock.ts:9`,
  `createJobContext/createJobContext.interface.test.ts:15`, `index.test.ts:36` — all
  import-path-only, enumerated under NODE & SPRINT RULES.
* ✏️ `supabase/functions/dialectic-worker/saveResponse/saveResponse.ts` — route by the job
  row's `job_type` FIRST, before the EXECUTE path's `isModelContributionFileType(output_type)`
  check (`saveResponse.ts:162`) — the COMPRESS payload census has no `output_type` and would
  be rejected there. COMPRESS → mode-aware persistence. JSON mode: structurally validate the
  compressor output against the source JSON carried in the payload (recursive key-shape
  match — every key present, same object shape; arrays may shorten, strings condense,
  nothing added or removed; mismatch = explicit job failure); resolve the SOURCE document's
  template via `resolveTemplateFilename` (payload `sourceStageSlug`/`docType`/`documentKey` —
  guaranteed present in json mode by the tightened `isDialecticCompressJobPayload`); load it
  via `loadDocumentTemplate`; render via `renderStructuredDocument` (applying
  `mergeChunkContent`'s content-unwrap rule to the single source) into compressed markdown.
  Text mode: the response text is the artifact — no renderer involvement. Either way: build a
  `ResourceUploadContext` (`fileType: FileType.CompressedContext`, canonical pathContext from
  WS-C), persist through `fileManager.uploadAndRegisterFile(context)` — the real API takes a
  single `UploadContext` argument — idempotently (dedup layer 3: an existing artifact at the
  canonical path is not an error). Wallet debit with real user/wallet attribution flows
  through the existing stream persistence machinery. Deps ADD three narrow fns —
  `resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument` (NOT
  `IDocumentRenderer`; minimal DI surface). Imports `DialecticCompressJobPayload`/
  `CompressionMode` + the payload guard from the enqueueCompressJobs module.
  `saveResponse.interface.ts` (:9/:51) picks up the widened `BuildUploadContextFn` from the
  Sprint-3 createJobContext node.
  Support: saveResponse tests (route matrix: EXECUTE→contribution unchanged, COMPRESS json→
  validated+rendered resource, COMPRESS text→resource, structural-mismatch→failure,
  existing-artifact→idempotent completion, json-mode template-identity fields missing→
  failure).
* ✏️ `supabase/functions/netlifyResponse/index.ts` — WS-B's capstone composition-root wiring
  node (mirrors WS-R's `dialectic-worker/index.ts`; this file has had no prior touch this
  epic). Resolves the transient non-compilable states left by two earlier nodes: (1) binds a
  `BoundResolveTemplateFilenameFn` closure over `adminClient` and adds it to
  `boundEnqueueRenderJob`'s `EnqueueRenderJobDeps` literal (:45-46); (2) binds the THREE new
  `saveResponse` deps (`resolveTemplateFilename`, `loadDocumentTemplate`,
  `renderStructuredDocument`) and adds them to `saveResponseDeps` (:48-61). RIDES HERE (same
  reasoning as WS-R's index.ts test-harness parity): `dialectic-worker/index.integration.test.ts`
  `buildNetlifyDeps` (:148-169) gets the identical two wiring additions — it is test
  infrastructure for this composition root, not a second production entrypoint, so it does not
  get its own node.
* **COMMIT Sprint 4.**

## WS-D — COMPRESSION ORCHESTRATION CUTOVER (Sprint 5a; depends WS-B)
Strict node order (each file depends on the previous; transient breaks resolve within the
sprint): `vector_utils` → `compressPrompt` → `applyCompressionOverlay` → `gatherArtifacts` →
`calculateAffordability` → `prepareModelJob` → `processSimpleJob`.
* ✏️ `supabase/functions/_shared/utils/vector_utils.ts` (+ interface) — single full rewrite.
  Selection becomes embedding-free: `effectiveScore = candidateTokens × (1 − relevanceWeight)`
  where candidateTokens comes from `deps.countTokens` (same tokenizer/modelConfig as the
  preflight, threaded via CompressionStrategyDeps/Params) and relevanceWeight from
  `inputsRelevance` (the existing stage-specific/general key lookup is KEPT). DELETE the
  `getEmbedding` calls, `embeddingClient` from `CompressionStrategyDeps`, the dialectic_memory
  diagnostic query, and `cosineSimilarity` (its sole remaining consumer, rag_service, is
  deleted later this sprint — transient break resolves in-sprint).
  `CompressionCandidate.sourceType` becomes `CompressionSourceType`, IMPORTED from
  `file_manager.types.ts` (Sprint-2 owner — no duplicate definition) so overlays link
  compressed artifacts back to their originals. Positional history scoring KEPT. Sort ascending; lowest
  effectiveScore = next victim. Support: vector_utils.test.ts.
* ✏️ `supabase/functions/dialectic-worker/compressPrompt/compressPrompt.ts` — full rewrite as
  a two-phase machine driven by artifact existence. Interface changes ride this node
  (compressPrompt.interface.ts is obligately part of its support system):
  `CompressPromptSuccessReturn` gains `waiting_for_children: boolean` (deferral = success);
  deps REMOVE `ragService`, `embeddingClient`, and the in-loop RAG-debit use of
  `tokenWalletService` (debits ride the stream persistence path); deps ADD
  `enqueueCompressJobs: BoundenqueueCompressJobsFn`, `fileManager`, path
  constructor/deconstructor deps; params ADD `parentJob: DialecticJobRow`; NO new union member
  in `CompressPromptReturn`. Implementation:
  **Reduce check (on entry):** any victim with all chunk artifacts but no final artifact →
  concatenate in chunk_index order (synchronous fileManager read); still over the per-victim
  target → `enqueueCompressJobs` for ONE re-compress child → parent `waiting_for_children` →
  pending SUCCESS; else persist the concatenation as the final artifact (synchronous write).
  **Select/spawn:** count tokens; over budget → sorted candidates (vector_utils), excluding
  candidates whose final artifact for this compression target exists; top victim →
  `enqueueCompressJobs` → parent `waiting_for_children` → pending SUCCESS.
  **Overlay/recount:** victims with final artifacts are swapped into the working document set
  and history (the same identity matching applyCompressionOverlay uses), recount; loop to the
  next victim or fall through to the existing window/affordability finalization when it fits.
  Also removes the dialectic_memory indexed-ids query. Support: compressPrompt.test.ts.
* ✏️ `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts`
  — load CompressedContext artifacts by canonical path (path_deconstructor dep); match targets
  by (sourceType, sourceId) — resource documents AND history messages; swap content, preserving
  id/document_key/stage_slug/type. Support: applyCompressionOverlay.test.ts.
* ✏️ `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts` — wire
  `applyCompressionOverlay` as an injected dep post-gather; add `stageSlug` param for artifact
  lookup. Support: gatherArtifacts.test.ts.
* ✏️ `supabase/functions/dialectic-worker/calculateAffordability/calculateAffordability.ts` —
  thread `parentJob` into CompressPromptParams; propagate `waiting_for_children: true` as a
  matching pending variant. Support: calculateAffordability.test.ts.
* ✏️ `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts` — propagate the
  pending variant upward (no provider lookup — the parent's own model is already in play).
  Support: prepareModelJob.test.ts.
* ✏️ `supabase/functions/dialectic-worker/processSimpleJob.ts` — supply `stageSlug` to
  gatherArtifacts; on a pending return, log and exit cleanly (parent correctly paused; no
  failure, no retry, no execute_completed notification). RIDES HERE (last-written file the
  test needs to run): the FULL-CHAIN compression integration test — real internals, only true
  external boundaries mocked (background-worker HTTP, Supabase), no repo-owned function
  mocked. Asserts, in order: (1) oversized input → no stream call enqueued; parent →
  `waiting_for_children`; pending propagates; processSimpleJob exits cleanly. (2) COMPRESS
  child row(s) with `parent_job_id = parent.id`; payload carries mode + content +
  sourceType/sourceId + targetKey + chunk_index/chunk_total + the parent's model_id. (3)
  JSON-mode child: the enqueued call carries the completed source JSON AND the target
  skeleton; the mocked callback returns compressed JSON. (4) saveResponse validates the
  compressed JSON structurally against the source, renders it through the original template,
  and persists a CompressedContext resource via `uploadAndRegisterFile` at the canonical
  `_work/{source}_compressed_for_{target}` path with real user_id/wallet_id attribution and a
  real DEBIT; a structurally-drifted mock response fails the job explicitly. (5) Trigger
  wakes the parent; the chunked case concatenates in chunk_index order and the re-compress
  branch fires only when over target. (6) gatherArtifacts → applyCompressionOverlay swaps
  victim content (identity fields unchanged); recount fits; the REAL stream call is finally
  enqueued. (7) Recursion guard: a COMPRESS job whose prompt exceeds the window hard-fails;
  it never spawns compression. (8) Reuse: a sibling parent job producing the SAME target
  finds the existing artifact, spawns nothing, and overlays it; a parent producing a
  DIFFERENT target from the same source compresses fresh.
  Support: processSimpleJob.test.ts + the integration test above.

## WS-X — RAG REMOVAL (Sprint 5b; same sprint and commit as WS-D)
WS-D severed every live reference into the RAG core; removal completes the sprint. Enumerate
every construction/DI/import site with listCodeUsages at workplan time; known sites per node.
* ✏️ DELETE `supabase/functions/_shared/services/rag_service.ts` + interface + mock + tests;
  remove IRagService from all deps contracts and construction sites. Includes the SECOND and
  FINAL `dialectic-worker/index.ts` touch (removal wiring only — see NODE & SPRINT RULES for
  why the composition root is the plan's sole double-touched file).
* ✏️ DELETE `supabase/functions/_shared/services/indexing_service.ts` + interface + mock +
  tests. `LangchainTextSplitter` already lives in its own util (WS-S copy); `EmbeddingClient`
  dies here — its consumers (rag_service, compressPrompt's old deps) are already gone; zero
  remaining imports is a deletion precondition.
* 🆕 [exempt] `supabase/migrations/<ts>_compression_jobs_remove_rag.sql` — the epic's REMOVE
  migration: `drop function if exists public.match_dialectic_chunks(...);` and
  `drop table if exists public.dialectic_memory;`. Regen types_db.ts (nothing references the
  dropped objects at this point in the sprint).
* **COMMIT Sprint 5 (WS-D + WS-X) — compression loop live, RAG core gone, full-chain test green.**

---

## CANONICAL CONTRACTS (defined ONCE here; every consuming node uses these shapes VERBATIM —
repo convention `Fn(deps, params, payload): Promise<Return>`,
`Return = SuccessReturn | ErrorReturn`, DI binding `BoundFn(params, payload)`; payload is
NEVER empty — it is the data the function operates on)

TYPE OWNERSHIP (module-first; owner file → landing node):
* `FileType.CompressedContext`, `CompressionSourceType`, `CompressionMode` (+ guards in
  `type_guards.file_manager.ts`) → `_shared/types/file_manager.types.ts`, landed by the
  Sprint-2 `path_constructor.ts` node. `CompressionMode` sits here rather than on
  `enqueueCompressJobs.interface.ts` (its otherwise-natural creator-owns-the-data home)
  because `assembleCompressionPrompt.ts` (`_shared/prompt-assembler/`) also needs it, and
  `_shared/` code must never import from `dialectic-worker/` — the type must live where every
  layer that needs it can import downward. NOTE: this re-anchors the already-written
  `enqueueCompressJobs` node — its `CompressionMode` definition and `isCompressionMode` guard
  move to the `path_constructor.ts` node; `enqueueCompressJobs.interface.ts` should import it
  instead of defining it. That node has not yet been revised to match; flag before Sprint 3 closes.
* `DialecticCompressJobPayload` (+ `isDialecticCompressJobPayload` in the module guard file)
  → `enqueueCompressJobs.interface.ts`, landed by the Sprint-3 `enqueueCompressJobs.ts` node
  (creator-owns-the-data — only this payload shape, not the shared `CompressionMode` type).
* `ProcessCompressJobFn` → `processCompressJob.interface.ts`, landed by the Sprint-3
  `processCompressJob.ts` node.
* `BoundEnqueueModelCallFn` → `enqueueModelCall.interface.ts`, landed by the Sprint-3
  `enqueueModelCall.ts` node.
* `AssembleCompressionPromptFn` shapes → `assembleCompressionPrompt.interface.ts` (its own
  node). `dialectic.interface.ts` (legacy hub) defines NOTHING new — it only extends
  `JobType`/`JobTypes`, the payload union, and `IJobProcessors` by importing from the owners,
  in its single touch (Sprint-3 `processJob.ts` node).
* `enqueueCompressJobsFn(deps, params, payload)`:
  - Deps `{ logger, textSplitter, countTokens, constructStoragePath }` (`constructStoragePath`
    is required so this function can independently re-verify dedup layer 1 — compressPrompt's
    own candidate-exclusion query is a coarser, earlier check subject to a race against
    sibling jobs; this function recomputes the victim's canonical path and re-checks)
  - Params `{ dbClient, parentJob: DialecticJobRow, sessionId, projectId, stageSlug, targetKey,
    iterationNumber, modelId, walletId, modelConfig, tokenizerDeps }`
    (`stageSlug`/`targetKey` describe the CONSUMING stage/schema — the compression target;
    `modelId`/`walletId` are the parent's own, propagated to every child; `parentJob` supplies
    `parent_job_id`, `is_test_job`, and `user_id` for the child rows)
  - Payload `{ victim: { mode: CompressionMode, content, sourceType: CompressionSourceType,
    sourceId?, documentKey?, docType?, sourceStageSlug? } }` — `sourceId`/`documentKey` are
    each optional because exactly one is required per `sourceType` (`'contribution'|'resource'`
    require `documentKey`; `'feedback'|'history'` require `sourceId`), validated as an explicit
    branch, never an OR-fallback (matches the `path_constructor.ts` rule). ADDITIONALLY
    (ratified 2026-07-11): `mode:'json'` requires `documentKey` + `docType` + `sourceStageSlug`
    — the template identity saveResponse's save-time rendering resolves against (WS-B) —
    validated as an explicit mode branch. ONE victim per call —
    incremental compression is the point; `content` is the completed source JSON in json mode,
    source text otherwise; a re-compress call passes the concatenation as a text-mode victim.
  - Return `{ createdCount } | { error, retriable }`; bound form `BoundenqueueCompressJobsFn(params, payload)`.
* `DialecticCompressJobPayload` (owned by `enqueueCompressJobs.interface.ts`, landed by the
  enqueueCompressJobs node):
  `{ job_type:'COMPRESS', sessionId, projectId, stageSlug, targetKey, iterationNumber,
  model_id (parent's), mode: CompressionMode, content, sourceType, sourceId?, documentKey?,
  docType?, sourceStageSlug?, chunk_index?, chunk_total?, walletId, user_id }` — `chunk_index`/
  `chunk_total` are optional (present only for map-reduce chunk children); `mode:'json'`
  requires `documentKey` + `docType` + `sourceStageSlug` (template identity for WS-B save-time
  rendering; enforced by `isDialecticCompressJobPayload`); `content` is the
  completed source JSON in json mode (both the compressor input and the structural validation
  baseline in saveResponse) and the source text otherwise. The exact field census is locked at
  workplan time, but ANY change re-anchors every consumer (enqueueCompressJobs,
  processCompressJob, assembleCompressionPrompt, saveResponse, guards, the full-chain test).
* `AssembleCompressionPromptFn(deps, params, payload)` — payload `{ mode, content,
  chunk_index?, chunk_total? }`. sourceType/sourceId/targetKey are deliberately ABSENT from
  this payload: rendering does not consume them, and provenance persists on the COMPRESS job
  row payload and the canonical artifact path (no over-fetching). Params carry step/stage
  context for target-schema extraction; Return `{ prompt } | { error, retriable }`.
* `CompressPromptSuccessReturn` gains `waiting_for_children: boolean`; pending variants
  propagate upward as `CalculateAffordabilityPendingReturn` → `PrepareModelJobPendingReturn`.

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
  commit step in the LAST node of a sprint; NO audit/validate/no-op steps.
- Read types_db.ts for schema truth. Do not treat the legacy RAG implementations as design
  guidance.

## APPENDIX — WORKPLAN AUTHORING NOTES (for the workplan authors; not part of the plan contract)
Much of the prior "Embedding Jobs" checklist material analyzed the same files and can be moved
and corrected instead of recreated — but it was written against the abandoned feat/embedding
baseline, so every lifted passage must be re-validated against `feat/compress`.
| Source material | Reuse |
|---|---|
| processEmbedJob node → processCompressJob | Lift structure w/ semantic swaps (+ assembleCompressionPrompt dep, window assert) |
| processJob; deriveStepStatuses; buildJobProgressDtos | Lift w/ EMBED→COMPRESS swaps |
| createEmbedJobs → enqueueCompressJobs | Structure lifts (parent linkage, hard-stop insert, dedup); the CONTRACT is new — lift NO contract text (the old node family carried divergent duplicate contracts) |
| createJobContext threading; index.ts wiring | Lift nearly verbatim |
| saveResponse | Rewrite the branch (the old dialectic_memory branch dies); the BuildUploadContextFn widening analysis lifts verbatim |
| netlifyResponseHandler node | Dropped — no touch needed |
| path_constructor/deconstructor; file_manager | Lift w/ RagContextSummary→CompressedContext swap + chunk segment (moved before persistence) |
| compressPrompt three-phase node | Rewrite (two-phase; do not lift the old phase text — it called nonexistent APIs and a mismatched RPC) |
| applyCompressionOverlay | Lift w/ swaps + history coverage |
| gatherArtifacts; processSimpleJob; calculateAffordability; prepareModelJob | Lift w/ swaps (drop all embedding-provider threading) |
| End-to-end test description | Lift assertion skeleton w/ compress seams; rides the processSimpleJob node |
Forbidden-token sweep — lifted text must contain NONE of: `EMBED`, `embedding`,
`embeddingClient`, `getEmbedding`, `dialectic_memory`, `match_dialectic_chunks`, `RagService`,
`IndexingService`, `RagContextSummary`, `rag_query`, `dimensions`, `source_contribution_id`,
`operation:'embedding'`.

Crib hazards (verified against source):
* The Embedding Jobs plan had `IJobProcessors` import `ProcessEmbedJobFn` from
  `processEmbedJob.interface.ts` AND defined the EMBED payload in `dialectic.interface.ts`.
  Do NOT lift either pattern: new module types (Fn signatures, payloads, mode, source type)
  live in their owning module interfaces; the legacy hub only gains members that import from
  the modules.
* The legacy inline `Process*JobFn` signatures in `dialectic.interface.ts` predate the
  function-folder-as-module method — they are basket-of-crap debt being refactored away, not
  a pattern to follow for new processors.

## APPENDIX — DOCUMENT_RENDERER TEST REDISTRIBUTION MAP (binds the WS-B module nodes and the
relocation node; the workplan author copies the relevant rows into each node so the
implementer is told exactly what goes where — nothing is left to implementer judgment)

Dispositions: **MOVE(module)** — the case's assertions are recreated against the module's
DIRECT API in that module node's own test file (authored at module-node time, BEFORE the
relocation node); the original monolith case is pruned by the relocation node only AFTER the
oracle run. **RETAIN** — the case survives as the relocated `renderDocument` module's test,
import repoint only (orchestration-level behavior exercised through the unchanged public
signature). Line numbers reference the current `document_renderer.test.ts` baseline.

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

Tally: 10 RETAIN (the relocated `renderDocument` module's test file), 9 MOVE
assembleContributionChain, 13 MOVE mergeChunkContent, 4 MOVE loadDocumentTemplate, 7 + 4
examples MOVE renderStructuredDocument. Every one of the 37 baseline cases is assigned; the
relocation node's prune step deletes exactly the MOVE rows and nothing else.
