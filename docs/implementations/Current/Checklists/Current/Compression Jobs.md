[ ] // So that find->replace will stop unrolling my damned instructions! 

# **Compression Jobs**

## Problem Statement

When an assembled model call exceeds the model's input window, the pipeline enters the legacy RAG compression loop (`compressPrompt` → `RagService` → `IndexingService` → `dialectic_memory`) and document generation fails. The RAG path is structurally unfit for this pipeline: it embeds synchronously inside Supabase (a universal block with no provenance or attribution), it retrieves session-wide with generic stage-template queries so every victim document is replaced by nearly the same snippet blob, and its output destroys the document structure downstream agents need to populate their JSON skeletons. The application generates quality documents end-to-end whenever compression does not run, and fails whenever it does.

## Objectives

* Replace RAG compression with first-class, job-driven, schema-targeted COMPRESS jobs that ride the existing stream model-call transport, per `Compression Jobs Scope.md` (same folder — the ratified scope & order this workplan implements; its CANONICAL CONTRACTS section governs every function shape in this plan).
* Make victim selection pure computation — `candidate tokens × (1 − inputsRelevance weight)` — with no embeddings anywhere; one victim per resume cycle, stopping as soon as the preflight fits.
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

## WS-0 — FOUNDATION (Sprint 1)

* `[✅]`   supabase/migrations/`<ts>_compression_jobs_foundation.sql` **[DB] Establish the compression-jobs foundation: add the COMPRESS job type and seed the mode-aware compression prompt template**

  * `[✅]`   `objective`
    * `[✅]`   Solve two foundational gaps that block job-driven compression: (a) there is no `COMPRESS` job type to route compression work — `public.dialectic_job_type_enum` is `"PLAN" | "EXECUTE" | "RENDER"` (types_db.ts:2704 union, :2831 const array); and (b) there is no compression prompt template for the prompt-assembler to load — COMPRESS jobs are not recipe steps and have no `recipe_step.prompt_template_id`, so the template must be resolvable by its unique `system_prompts.name`.
    * `[✅]`   Functional goals:
      * `[✅]`   Add `COMPRESS` to `public.dialectic_job_type_enum`.
      * `[✅]`   Seed ONE `public.system_prompts` row, `name = 'compression_context_v1'`, whose `prompt_text` is the mode-aware compression template (full body in the `[migration].sql` section below).
      * `[✅]`   Regenerate `supabase/functions/types_db.ts` as the single schema-truth source.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   Additive only: this is the epic's ADD migration. No DROP of any object; the RAG drops (`dialectic_memory`, `match_dialectic_chunks`) live exclusively in the epic's separate REMOVE migration (WS-X, Sprint 5).
      * `[✅]`   The enum value is added but NOT used inside this migration, so `ALTER TYPE ... ADD VALUE` is safe in the migration transaction.
      * `[✅]`   Idempotent re-run: `add value if not exists` + `ON CONFLICT (name) DO UPDATE` (the seed convention already used by `20251006194531_thesis_stage.sql`, which also evidences the unique constraint on `system_prompts.name`).
      * `[✅]`   The types_db.ts regeneration is compile-safe: the enum union gains a value, and no existing switch or guard references it yet (guards that enumerate PLAN/EXECUTE/RENDER are extended in their own WS-R nodes).

  * `[✅]`   `role`
    * `[✅]`   Infrastructure schema + seed-data node. It provides the routing enum value and the template content that every downstream compression node (assembler, worker routing, spawn, persistence, orchestration) depends on.
    * `[✅]`   Out of scope (each its own node): `assembleCompressionPrompt.ts` (the template's consumer; Sprint-3 node); `FileType.CompressedContext` + `CompressionSourceType` (Sprint-2 `path_constructor.ts` node); `CompressionMode` + `DialecticCompressJobPayload` + guards (Sprint-3 `enqueueCompressJobs.ts` node); `ProcessCompressJobFn` (Sprint-3 `processCompressJob.ts` node); all application code.

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `public.dialectic_job_type_enum` and one `public.system_prompts` row only.
    * `[✅]`   Inside boundary: the enum value set; the compression template row's identity (`name`), body (`prompt_text`), and flags.
    * `[✅]`   Outside boundary: all TypeScript code; `dialectic_document_templates` (the compression template carries its body in `prompt_text` directly — `document_template_id` stays `null`, unlike stage turn prompts which point at a document template); every RAG schema object (untouched until the WS-X REMOVE migration).

  * `[✅]`   `deps`
    * `[✅]`   `public.dialectic_job_type_enum` (existing type) — extended in place.
    * `[✅]`   `public.system_prompts` (existing table; columns per types_db.ts:2032 — `id, name, prompt_text, description, is_active, user_selectable, version, document_template_id, created_at, updated_at`; unique on `name`) — receives the seed row.
    * `[✅]`   `gen_random_uuid()` (existing) — seed row id.
    * `[✅]`   Confirm: no reverse dependency; nothing existing references a `COMPRESS` value or the new row.

  * `[✅]`   `construction`
    * `[✅]`   Statement order inside the single migration:
      * `[✅]`   `alter type public.dialectic_job_type_enum add value if not exists 'COMPRESS';` (value added, NOT used in this migration).
      * `[✅]`   `INSERT INTO public.system_prompts (id, name, prompt_text, is_active, version, description, user_selectable, document_template_id) VALUES (gen_random_uuid(), 'compression_context_v1', <template body below>, true, 1, 'Mode-aware compression prompt template for COMPRESS jobs: preserves target-schema-relevant facts; JSON mode enforces exact-structure return', false, null) ON CONFLICT (name) DO UPDATE SET prompt_text = EXCLUDED.prompt_text, is_active = EXCLUDED.is_active, version = EXCLUDED.version, description = EXCLUDED.description, user_selectable = EXCLUDED.user_selectable, document_template_id = EXCLUDED.document_template_id;`
    * `[✅]`   No partially-migrated state: both statements in one migration transaction.

  * `[✅]`   `[migration].sql` (implementation = the SQL body)
    * `[✅]`   Perform the enum add + seed insert in the order above.
    * `[✅]`   `prompt_text` is EXACTLY the following template body. Syntax is the repo's real renderer syntax: `{{variable}}` substitution and `{{#section:key}}...{{/section:key}}` conditional sections that are kept when the variable `key` is supplied and stripped entirely when it is absent (prompt-renderer.ts:80–88). `{{outputs_required}}` reuses the variable name `render.ts` already injects from `recipeStep.outputs_required` (render.ts:34, :71):

      ```
      You are compressing a source that is context for a downstream agent. That agent will use the compressed result, alongside other documents, to populate the target schema below. Your output must preserve every fact that could contribute to any field of the target schema.

      {{#section:json_mode}}
      The source is a completed JSON structure. Return EXACTLY the same JSON structure with its values compressed:
      - Every key must be present in your output. Do not add, rename, remove, or reorder keys.
      - Object shapes must not change.
      - Arrays may lose low-value elements; keep every element that could contribute to the target schema.
      - Condense string values in place.
      Return ONLY the compressed JSON.
      {{/section:json_mode}}
      {{#section:text_mode}}
      The source is a document. Return ONLY the compressed document text.
      {{/section:text_mode}}

      Remove: duplicated information, examples, narrative, historical discussion, intermediate reasoning.
      Preserve: requirements, constraints, assumptions, accepted decisions, identifiers, user corrections, unresolved questions.

      Stage intent: {{stage_intent}}

      Target schema (what the downstream agent must populate):
      {{outputs_required}}

      {{#section:chunk_context}}
      The source is chunk {{chunk_index}} of {{chunk_total}} of a larger document. Compress this chunk on its own terms; do not attempt to summarize the whole document.
      {{/section:chunk_context}}

      Source:
      {{source_content}}
      ```
    * `[✅]`   Consumer contract (binds the Sprint-3 `assembleCompressionPrompt.ts` node): `assembleCompressionPrompt.ts` supplies EXACTLY ONE of the `json_mode` / `text_mode` section variables per render, so the renderer keeps one mode block and strips the other; it supplies `chunk_context` (+ `chunk_index`, `chunk_total`) only for map-reduce chunk jobs; it always supplies `source_content`, `stage_intent`, and `outputs_required`.
    * `[✅]`   Regenerate `supabase/functions/types_db.ts` (generated file, exempt from tests):
      * `[✅]`   `Enums.dialectic_job_type_enum` union (types_db.ts:2704) gains `"COMPRESS"`.
      * `[✅]`   `Constants.public.Enums.dialectic_job_type_enum` runtime array (types_db.ts:2831) gains `"COMPRESS"`.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: infrastructure/persistence + seed data (lowest producer). Provides outward: the enum value (consumed by WS-R routing and all job rows) and the template row (consumed by `assembleCompressionPrompt`). No inward code deps; no cycles.

  * `[✅]`   `requirements` (binary, observable)
    * `[✅]`   `dialectic_job_type_enum` includes `COMPRESS` in the database and in both the regenerated types_db.ts union and const array.
    * `[✅]`   `system_prompts` contains exactly one row with `name = 'compression_context_v1'`, `is_active = true`, `user_selectable = false`, `version = 1`, `document_template_id IS NULL`, and non-null `prompt_text` containing `{{source_content}}`, `{{outputs_required}}`, `{{stage_intent}}`, and the three `{{#section:...}}` blocks (`json_mode`, `text_mode`, `chunk_context`).
    * `[✅]`   Re-running the migration changes nothing (idempotent add + upsert).
    * `[✅]`   No RAG schema object (`dialectic_memory`, `match_dialectic_chunks`) is created, altered, or dropped by this migration.
    * `[✅]`   The repo compiles unchanged after types_db.ts regeneration.

  * `[✅]`   **Commit** `feat(db): add COMPRESS job type and seed compression prompt template`
    * `[✅]`   Structural: `dialectic_job_type_enum` gains `COMPRESS`; `system_prompts` gains `compression_context_v1`; `types_db.ts` regenerated.
    * `[✅]`   Behavioral: none — no code path consumes the enum value or the template yet.
    * `[✅]`   Contract: types_db enum union + const array extended; additive only.

## WS-C — ARTIFACT IDENTITY: CompressedContext (Sprint 2)

* `[✅]`   supabase/functions/_shared/utils/`path_constructor.ts` **[BE] Add the canonical CompressedContext storage path (final and map-reduce-chunk forms), and own the new FileType member, CompressionSourceType union, and CompressionMode union every downstream compression node imports**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing deterministic storage location for a COMPRESS job's persisted output. `constructStoragePath` (`path_constructor.ts:52-505`) has a `switch (fileType)` case for every existing artifact kind, but no case exists for a compressed-victim artifact; there is also no `FileType` member, no `PathContext` fields, and no `CompressionSourceType` union to describe one. Per `Compression Jobs Scope.md`'s TYPE OWNERSHIP block, this node is the OWNER of `FileType.CompressedContext`, `CompressionSourceType`, AND `CompressionMode` — every later node (`enqueueCompressJobs`, `assembleCompressionPrompt`, `processCompressJob`, `saveResponse`, `vector_utils`, `compressPrompt`, `applyCompressionOverlay`) imports all three from here rather than redeclaring them.
    * `[✅]`   Functional goals:
      * `[✅]`   Add `CompressedContext = 'compressed_context'` to the `FileType` enum (`file_manager.types.ts:28-92`) and to the `ResourceFileTypes` union (`file_manager.types.ts:221-236`) — a CompressedContext artifact is persisted via `fileManager.uploadAndRegisterFile` as a `ResourceUploadContext` (WS-B, later sprint), exactly like `RagContextSummary` is today.
      * `[✅]`   Define `CompressionSourceType = 'contribution' | 'resource' | 'feedback' | 'history'` in `file_manager.types.ts`, matching the union literally named in `Compression Jobs Scope.md`'s WS-D `vector_utils.ts` decision (`CompressionCandidate.sourceType` becomes this exact type, imported, not redefined).
      * `[✅]`   CORRECTIVE ADDITION (discovered during the Sprint-4 `saveResponse.ts` node's authoring; this node was originally checked complete without it — see the re-anchoring note in `Compression Jobs Scope.md`'s APPENDIX, "this re-anchors the already-written `enqueueCompressJobs` node... flag before Sprint 3 closes," which was only half-actioned: `enqueueCompressJobs.ts`'s own node text was updated to import `CompressionMode` from here, but this node was never actually revised to define it): define `export type CompressionMode = 'json' | 'text';` in `file_manager.types.ts`, immediately after `CompressionSourceType`. Grounded in the WS-0 migration node's own already-shipped compression template (`{{#section:json_mode}}`/`{{#section:text_mode}}`) and in every already-authored Sprint-3/4 node's literal usage (`enqueueCompressJobsPayload.victim.mode: CompressionMode`, `DialecticCompressJobPayload.mode: CompressionMode`, `saveResponse.ts`'s `compressPayload.mode === 'json' | 'text'` branch) — the value set is closed and already load-bearing across four other nodes; this is the ONE place none of them may define it, per the module-first rule (`_shared/` code, specifically `assembleCompressionPrompt.ts`, must never import from `dialectic-worker/`, so the type cannot live in `enqueueCompressJobs.interface.ts`). Add `isCompressionMode(value: unknown): value is CompressionMode` to `type_guards.file_manager.ts`, mirroring `isCompressionSourceType`'s exact shape (`typeof value === 'string' && (value === 'json' || value === 'text')`) — already-authored Sprint-3 nodes (`enqueueCompressJobs.guard.ts`'s `isDialecticCompressJobPayload`) import and use this guard without redefining it.
      * `[✅]`   Add five new OPTIONAL fields to `PathContext` (`file_manager.types.ts:110-135`): `targetKey?: string` (the compression target schema/document key), `sourceType?: CompressionSourceType` (the explicit discriminator: `'contribution'|'resource'` REQUIRE `documentKey`; `'feedback'|'history'` REQUIRE `sourceId` — see the new case's validation below), `sourceId?: string` (the victim's originating row id, REQUIRED when `sourceType` is `'feedback'`/`'history'`; deliberately a NEW field, not a reuse of the existing `sourceContributionId?: string | null` field at `file_manager.types.ts:129`, since `sourceContributionId` is contribution-specific by name and is not read anywhere inside `constructStoragePath` today), `chunkIndex?: number`, `chunkTotal?: number` (map-reduce chunk lineage; both-or-neither, mirroring the existing `isContinuation`/`turnIndex` paired-presence validation already used by the `TurnPrompt` and `HeaderContext` cases at `path_constructor.ts:204-208` and `:280-284`). `CompressionMode` is NOT added to `PathContext` — `constructStoragePath`'s `CompressedContext` case has no use for the compressor's input/output mode; path identity is (session, consuming stage, target schema key, source identity[, chunk_index]) only, per the scope's own canonical identity definition, and does not vary by mode.
      * `[✅]`   Add `case FileType.CompressedContext:` to `constructStoragePath`'s switch, placed immediately after the existing `case FileType.RagContextSummary:` (`path_constructor.ts:289-296`) — the closest existing analog: both are machine-only, `_work`-directory, single-document compression-output artifacts. Storage path: `${stageRootPath}/_work` (identical directory choice to `RagContextSummary`). Filename: `{source_basename}_compressed_for_{sanitizeForPath(targetKey)}.md` for the final artifact, or `..._chunk_{chunkIndex}of{chunkTotal}.md` for a map-reduce intermediate. `source_basename` is computed by an explicit branch on `sourceType`: `'contribution'|'resource'` → `sanitizeForPath(documentKey)` (the same basename source `RenderedDocument`/`AssembledDocumentJson` already use); `'feedback'|'history'` → `source_${generateShortId(sourceId)}`. Each branch uses only the field it explicitly requires (validated below), using the file's own existing `sanitizeForPath` (`path_constructor.ts:18-20`) and `generateShortId` (`path_constructor.ts:28-30`) helpers — no new helper functions.
      * `[✅]`   Add `isCompressedContextFileType(value: unknown): value is FileType.CompressedContext` and `isCompressionSourceType(value: unknown): value is CompressionSourceType` to `type_guards.file_manager.ts`, per `Compression Jobs Scope.md`'s WS-C node text naming both guards explicitly. These are boundary guards for DOWNSTREAM consumers (e.g. `enqueueCompressJobs`'s dedup check narrowing a stored `FileType` value; `saveResponse`'s mode-aware routing narrowing a job payload's `sourceType`) — `constructStoragePath` itself dispatches on `FileType.CompressedContext` via the native `switch` statement exactly like every one of its 30+ existing cases (none of which call `isResourceFileType`/`isFileType` internally either), so the new guards are NOT called from inside the new switch case; they are defined here because this node owns the types they discriminate. `isCompressionMode` (added by the CORRECTIVE ADDITION above) is the third such boundary guard, same reasoning.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   All five new `PathContext` fields are optional — no existing `FileType` case's required-field validation changes; the file must continue to compile and every existing test in `path_constructor.test.ts`, `path_constructor.fragment.test.ts`, and `path_constructor.continuation.test.ts` must continue to pass unmodified.
      * `[✅]`   `CompressedContext` is NOT added to `DOCUMENT_KEY_MAP` (`type_guards.file_manager.ts:185-213`) or treated as a `DocumentKey` — like `RagContextSummary`, it is a `ResourceFileTypes` member with its own bespoke validation in its switch case, not a per-document contribution artifact gated by the `isDocumentKey(fileType)` block at the top of `constructStoragePath` (`path_constructor.ts:78-108`).
      * `[✅]`   Required fields are validated per explicit branch, never substituted: missing `stageRootPath` components (`projectId`/`sessionId`/`iteration`/`stageSlug`), a missing `targetKey`, or a missing `sourceType` are unconditional thrown errors; given `sourceType`, a missing `documentKey` (for `'contribution'`/`'resource'`) or a missing `sourceId` (for `'feedback'`/`'history'`) is ALSO a thrown error even when the other field happens to be present — there is no case where one field substitutes for the other.
      * `[✅]`   Exactly one of `chunkIndex`/`chunkTotal` present (not both, not neither) is an explicit thrown error, mirroring the file's existing `isContinuation`/`turnIndex` paired-validation precedent.
      * `[✅]`   `chunkIndex >= 1` and `chunkTotal >= chunkIndex` when chunk fields are present — grounded in the Sprint-1 migration node's own compression template prose ("The source is chunk `{{chunk_index}}` of `{{chunk_total}}`"), which is 1-based human-readable chunk numbering, not 0-based.
      * `[✅]`   Append one entry to the "Utility Artifacts" section of `path_constructor.readme.md` (`path_constructor.readme.md:146-151`, immediately following the existing `RagContextSummary` entry) documenting the `CompressedContext` primitive and one corresponding file-tree line under the `_work/` example (`path_constructor.readme.md:65-72`) — this readme is the authoritative human-readable naming-scheme document this exact case implements against, and it already documents `RagContextSummary` as the direct precedent this case supersedes in kind.

  * `[✅]`   `role`
    * `[✅]`   Node role: canonical path-construction implementation and the OWNING node for `FileType.CompressedContext`, `CompressionSourceType`, AND `CompressionMode`, per `Compression Jobs Scope.md`'s TYPE OWNERSHIP block. This role is correct because `path_constructor.ts` is where every other artifact's canonical path already lives, and per the module-first rule, a type belongs in the interface/types file of the module that owns it — path/file identity is exactly what `file_manager.types.ts` (this module's types file) already exists to describe. `CompressionMode` rides here rather than on `enqueueCompressJobs.interface.ts` (its otherwise-natural creator-owns-the-data home) for the identical reason `CompressionSourceType` does: `assembleCompressionPrompt.ts` (`_shared/prompt-assembler/`) also needs it, and `_shared/` code must never import from `dialectic-worker/`.
    * `[✅]`   Out-of-scope responsibilities (each its own later node, per `Compression Jobs Scope.md`'s Sprint 2/3 node list):
      * `[✅]`   Parsing a `CompressedContext` path back into its identity tuple (`path_deconstructor.ts`, next node this sprint).
      * `[✅]`   Persisting the artifact via `fileManager.uploadAndRegisterFile` (`file_manager.ts`, this sprint, after `path_deconstructor.ts`).
      * `[✅]`   Defining `DialecticCompressJobPayload` (owned by `enqueueCompressJobs.interface.ts`, Sprint 3, per TYPE OWNERSHIP) — `CompressionMode` itself is NOT out of scope here; it is IN scope per the corrective addition above (the original out-of-scope framing incorrectly grouped it with `DialecticCompressJobPayload`, which is what caused the gap this edit fixes).
      * `[✅]`   Any job creation, routing, or model-call logic.

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/_shared/utils/path_constructor.ts` (canonical path construction) and its two direct type/guard dependencies, `_shared/types/file_manager.types.ts` and `_shared/utils/type-guards/type_guards.file_manager.ts`.
    * `[✅]`   Inside boundary: the `FileType.CompressedContext` enum member, the `CompressionSourceType` union, the `CompressionMode` union, the five new `PathContext` fields, the new switch case's directory/filename derivation, the three new type guards.
    * `[✅]`   Outside boundary: path parsing, file upload/registration, job payload shapes, model-call logic, DB access of any kind (this file has none today and gains none here).

  * `[✅]`   `deps`
    * `[✅]`   No injected dependencies. `constructStoragePath` is (and remains) a pure, synchronous function of its single `PathContext` argument — it has no `Deps`/`Params`/`Payload` split and no DI construction, consistent with every one of its existing 30+ cases. `sanitizeForPath`, `generateShortId`, and `mapStageSlugToDirName` are existing private helpers within the same file, already used by other cases; `isDocumentKey` is already imported from `./type-guards/type_guards.file_manager.ts` (`path_constructor.ts:2`) and needs no change for this case (`CompressedContext` is not a `DocumentKey`).
    * `[✅]`   Confirm: no reverse dependency (nothing existing references `FileType.CompressedContext`, `CompressionSourceType`, or `CompressionMode`); no lateral violation (this node does not import from `dialectic-worker/` or any other module).

  * `[✅]`   `context_slice`
    * `[✅]`   From `PathContext`: the new case reads exactly `projectId`, `sessionId`, `iteration`, `stageSlug` (via the existing `stageRootPath` computation, unchanged), `targetKey`, `sourceType`, `documentKey`, `sourceId`, `chunkIndex`, `chunkTotal` — no other existing `PathContext` field (e.g. `modelSlug`, `attemptCount`, `contributionType`) is read by this case, matching the `RagContextSummary` case's precedent of using only the subset of context fields it actually needs. `CompressionMode` is defined by this node but is deliberately NOT read by this case (see `objective`'s functional goals).
    * `[✅]`   Confirm: no over-fetching; no hidden coupling to `ModelContributionUploadContext`/`UserFeedbackUploadContext`-specific fields.

  * `[✅]`   `path_constructor.types.ts` (plays this file's Contract Definition + Structural Boundary role; there is no `path_constructor.interface.ts`/`path_constructor.interface.test.ts` in this codebase — `ConstructStoragePathFn` in `path_constructor.types.ts` is the existing, single-member contract file, and it needs no change: its signature `(context: PathContext) => ConstructedPath` (`path_constructor.types.ts:4`) is unchanged by this node, since `PathContext` and `ConstructedPath` are both referenced by type only and gain fields/cases, not a different shape. No new interface file is created.)
    * `[✅]`   No implementation details beyond confirming the existing `ConstructStoragePathFn` type continues to compile against the widened `PathContext`.

  * `[✅]`   `file_manager.types.ts` (companion type-owner edit riding this node, per TYPE OWNERSHIP)
    * `[✅]`   Add `CompressedContext = 'compressed_context',` to the `FileType` enum (`file_manager.types.ts:28-92`), placed alongside `RagContextSummary` for readability (both are "utility" artifacts).
    * `[✅]`   Add `export type CompressionSourceType = 'contribution' | 'resource' | 'feedback' | 'history';` immediately after the `FileType` enum closes.
    * `[✅]`   Add `export type CompressionMode = 'json' | 'text';` immediately after `CompressionSourceType` (CORRECTIVE ADDITION — see `objective`).
    * `[✅]`   Add `FileType.CompressedContext` to the `ResourceFileTypes` union (`file_manager.types.ts:221-236`).
    * `[✅]`   Add the five new optional fields (`targetKey?: string; sourceType?: CompressionSourceType; sourceId?: string; chunkIndex?: number; chunkTotal?: number;`) to the `PathContext` interface (`file_manager.types.ts:110-135`), each with a one-line comment naming its purpose, matching this interface's existing per-field comment style. `CompressionMode` is NOT added as a `PathContext` field (see `context_slice`).

  * `[✅]`   `constructStoragePath.interaction.spec` (prose; no file — matches the repo's existing precedent of no literal `.interaction.spec` file for this function)
    * `[✅]`   Called by (this sprint and later): `file_manager.ts` (this sprint, next-but-one node) when persisting a `CompressedContext` resource; `path_deconstructor.ts` is the read-side counterpart (parses the paths this case produces, not a caller of this function). `CompressionMode`/`isCompressionMode` are called by `enqueueCompressJobs.guard.ts`, `assembleCompressionPrompt.ts`, and `saveResponse.ts` (Sprint 3/4 nodes) — none of which call `constructStoragePath` for this purpose; they import the TYPE/GUARD directly from `file_manager.types.ts`/`type_guards.file_manager.ts`.
    * `[✅]`   Required interaction: given a `PathContext` with `fileType: FileType.CompressedContext` and valid required fields, return `{ storagePath, fileName }` with no side effects (this function has never had side effects; it remains a pure computation).
    * `[✅]`   Failure modes: missing `stageRootPath` components, missing `targetKey`, missing `sourceType`, a `sourceType`-required field missing for its branch (`documentKey` for `'contribution'`/`'resource'`; `sourceId` for `'feedback'`/`'history'`), or exactly one of `chunkIndex`/`chunkTotal` present — each throws a distinct `Error` with a message naming the missing/invalid field(s), matching every other case's throw style.
    * `[✅]`   No ordering/temporal constraints — pure, synchronous, deterministic.

  * `[✅]`   `type_guards.file_manager.guard.test.ts` (real file: `type_guards.file_manager.test.ts` — this module has no separate `.guard.test.ts` file; its existing single test file plays this role, per the actual repo layout)
    * `[✅]`   `isCompressedContextFileType` accepts `FileType.CompressedContext` / `'compressed_context'`; rejects every other `FileType` value, `null`, `undefined`, a number, and an arbitrary string.
    * `[✅]`   `isCompressionSourceType` accepts each of `'contribution'`, `'resource'`, `'feedback'`, `'history'`; rejects any other string, `null`, `undefined`, a number.
    * `[✅]`   `isCompressionMode` accepts `'json'` and `'text'`; rejects any other string, `null`, `undefined`, a number (CORRECTIVE ADDITION — see `objective`).
    * `[✅]`   `isResourceFileType(FileType.CompressedContext)` returns `true` (the existing `RESOURCE_FILE_TYPES_MAP` gains the new key; this proves the map was updated, not just a new standalone function).
    * `[✅]`   `isFileType('compressed_context')` returns `true` (the existing `Object.values(FileType)` iteration in `isFileType`, `type_guards.file_manager.ts:99-109`, needs no code change — only the enum needs the new member — but this test proves that structurally).

  * `[✅]`   `type_guards.file_manager.ts` (real file playing the Enforcement/guard.ts role)
    * `[✅]`   Add `[FileType.CompressedContext]: true` to `RESOURCE_FILE_TYPES_MAP` (`type_guards.file_manager.ts:64-79`).
    * `[✅]`   Implement `isCompressedContextFileType(value: unknown): value is FileType.CompressedContext` — `typeof value === 'string' && value === FileType.CompressedContext`, mirroring this file's existing single-value guard style (no existing single-`FileType`-member guard currently exists in this file to copy verbatim, so this is a new minimal pattern consistent with `isFileType`'s equality-based check at `type_guards.file_manager.ts:99-109`).
    * `[✅]`   Implement `isCompressionSourceType(value: unknown): value is CompressionSourceType` — `typeof value === 'string' && (value === 'contribution' || value === 'resource' || value === 'feedback' || value === 'history')`.
    * `[✅]`   Implement `isCompressionMode(value: unknown): value is CompressionMode` — `typeof value === 'string' && (value === 'json' || value === 'text')` (CORRECTIVE ADDITION — see `objective`; already-authored Sprint-3 nodes, e.g. `enqueueCompressJobs.guard.ts`'s `isDialecticCompressJobPayload`, import this guard by name and require it to exist here).
    * `[✅]`   Import `CompressionSourceType` AND `CompressionMode` alongside the existing `FileType`/`CanonicalPathParams`/etc. import block (`type_guards.file_manager.ts:2-13`) from `'../../types/file_manager.types.ts'`.

  * `[✅]`   `path_constructor.mock.ts` — NONE. No mock file exists for this function today and none is created here: `constructStoragePath` is pure and deterministic (no I/O, no injected services to simulate), and its existing 30+ cases have never required one; downstream nodes call the real function directly in their own tests, consistent with the repo's rule against mocking repo-owned pure functions.

  * `[✅]`   `path_constructor.test.ts` (Behavioral Verification)
    * `[✅]`   Given `documentKey` present (contribution/resource victim), no chunk fields: returns `storagePath` ending in `/_work` and `fileName` equal to `${sanitizeForPath(documentKey)}_compressed_for_${sanitizeForPath(targetKey)}.md`, mirroring the existing `RagContextSummary` test's exact assertion style (`path_constructor.test.ts:868-872`).
    * `[✅]`   Given `sourceType: 'history'` (or `'feedback'`), `sourceId` present, `documentKey` absent: `fileName` begins with `source_${generateShortId(sourceId)}_compressed_for_...`.
    * `[✅]`   Given `sourceType: 'contribution'` (or `'resource'`) with `documentKey` MISSING — even when `sourceId` is also supplied: throws.
    * `[✅]`   Given `sourceType: 'history'` (or `'feedback'`) with `sourceId` MISSING — even when `documentKey` is also supplied: throws.
    * `[✅]`   Given `chunkIndex`/`chunkTotal` both present: `fileName` ends in `_chunk_{chunkIndex}of{chunkTotal}.md` instead of `.md`.
    * `[✅]`   Given `chunkIndex` present without `chunkTotal` (and vice versa): throws, matching the message asserted in the requirements below.
    * `[✅]`   Given missing `targetKey` or missing `sourceType`: throws a distinct, specific `Error` for each case, using `assertThrows` exactly as the existing "should throw errors for missing context" block does (`path_constructor.test.ts:875-897`).
    * `[✅]`   Given a `stageSlug` outside `mapStageSlugToDirName`'s known cases (e.g. `'synthesis'`, matching the `RagContextSummary` test's stage choice): `storagePath` still resolves via the existing `stageRootPath` computation, proving no new stage-mapping logic was needed.
    * `[✅]`   Do NOT re-test: `sanitizeForPath`, `generateShortId`, or `mapStageSlugToDirName`'s own correctness (already covered by this file's existing tests) — only this case's use of them.
    * `[✅]`   `path_constructor.fragment.test.ts` and `path_constructor.continuation.test.ts` are NOT modified — `CompressedContext` has no `sourceGroupFragment` or `isContinuation`/`turnIndex` semantics (chunk lineage is a distinct, unrelated concept expressed via the new `chunkIndex`/`chunkTotal` fields), so neither file's scenarios apply to this case.

  * `[✅]`   `construction`
    * `[✅]`   No factory/constructor entrypoint — `constructStoragePath` is called directly with a `PathContext` literal, as it already is by every existing caller.
    * `[✅]`   No partially constructed instances possible (pure function).
    * `[✅]`   Initialization order inside the new case: validate `stageRootPath`/`targetKey`/`sourceType` first (unconditional), then branch on `sourceType` to validate its ONE required identity field (`documentKey` or `sourceId`), then validate chunk-field pairing and chunk-number bounds, THEN compute `source_basename` from the already-validated branch, THEN compute the final filename — no computation happens before its preconditions are confirmed, matching the file's existing top-to-bottom validate-then-compute pattern. `CompressionMode`/`isCompressionMode` require no construction/initialization order of their own — a type alias and a stateless equality-check guard, added to `file_manager.types.ts`/`type_guards.file_manager.ts` alongside `CompressionSourceType`/`isCompressionSourceType`.

  * `[✅]`   `path_constructor.ts` (Implementation)
    * `[✅]`   Add `targetKey, sourceType, sourceId, chunkIndex, chunkTotal` to the destructuring assignment at the top of `constructStoragePath` (`path_constructor.ts:53-75`), alongside the existing destructured fields.
    * `[✅]`   Insert `case FileType.CompressedContext:` immediately after the existing `case FileType.RagContextSummary:` block (`path_constructor.ts:289-296`) and before the "All Model Contributions" `case` block (`path_constructor.ts:298-299`):
      * `[✅]`   Throw if `!stageRootPath || !targetKey || !sourceType`, naming which is missing in the message.
      * `[✅]`   Branch on `sourceType`: `'contribution'`/`'resource'` → throw if `!documentKey` (naming `documentKey` as required for this `sourceType`); `'feedback'`/`'history'` → throw if `!sourceId` (naming `sourceId` as required for this `sourceType`); any other value → throw naming the unrecognized `sourceType`, mirroring the outer switch's own `default` case (`path_constructor.ts:495-503`).
      * `[✅]`   Throw if exactly one of `chunkIndex`/`chunkTotal` is `!== undefined`, with a message naming both fields.
      * `[✅]`   Throw if `chunkIndex !== undefined && (chunkIndex < 1 || chunkTotal === undefined || chunkTotal < chunkIndex)`.
      * `[✅]`   Compute `source_basename` from the branch validated above: `'contribution'`/`'resource'` → `sanitizeForPath(documentKey!)`; `'feedback'`/`'history'` → `\`source_${generateShortId(sourceId!)}\`.
      * `[✅]`   Compute `const targetKeySanitized = sanitizeForPath(targetKey);`.
      * `[✅]`   Compute `const chunkSuffix = chunkIndex !== undefined ? \`_chunk_${chunkIndex}of${chunkTotal}\` : '';`.
      * `[✅]`   Return `{ storagePath: \`${stageRootPath}/_work\`, fileName: \`${sourceBasename}_compressed_for_${targetKeySanitized}${chunkSuffix}.md\` }`.
    * `[✅]`   `file_manager.types.ts`: add `export type CompressionMode = 'json' | 'text';` immediately after `CompressionSourceType` (CORRECTIVE ADDITION).
    * `[✅]`   `type_guards.file_manager.ts`: add `isCompressionMode(value: unknown): value is CompressionMode` alongside `isCompressionSourceType`, importing `CompressionMode` in the same import statement (CORRECTIVE ADDITION).
    * `[✅]`   Must not: alter the behavior, output, or validation of any existing `case` block; must not add a network/DB call (this file has none and gains none).
    * `[✅]`   Each requirement above maps 1:1 to a code path exercised by `path_constructor.test.ts`/`type_guards.file_manager.test.ts`.

  * `[✅]`   `path_constructor.provides.ts` — NONE. No `.provides.ts` file exists for this utility; consumers already import `constructStoragePath`, `ConstructedPath`, `sanitizeForPath`, and `generateShortId` directly from `path_constructor.ts`, and `PathContext`/`FileType`/`CompressionSourceType`/`CompressionMode` directly from `file_manager.types.ts`. This node changes none of those import paths.

  * `[✅]`   `path_constructor.integration.test.ts` — NONE at this node. This pure function has no external boundary to integrate across; the round-trip proof (construct → deconstruct → same identity) is the explicit responsibility of the NEXT node, `path_deconstructor.ts` (which asserts losslessness against paths this node's cases produce), and the real upload-path proof is the responsibility of the `file_manager.ts` node after it. No existing `FileType` case in this file has its own integration test file, so none is introduced here.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: shared utility (lowest producer in this sprint). Deps are inward-facing (none external; only its own file's existing private helpers). Provides outward-facing: `FileType.CompressedContext`, `CompressionSourceType`, `CompressionMode`, the five new `PathContext` fields, and the new switch case are the foundation every later Sprint 2/3/4 node imports or targets — including, per the CORRECTIVE ADDITION, `enqueueCompressJobs.ts`, `assembleCompressionPrompt.ts`, `processCompressJob.ts`, and `saveResponse.ts`, each of which already assumes `CompressionMode`/`isCompressionMode` exist here.
    * `[✅]`   No cycles: this node does not import from `dialectic-worker/`, `dialectic-service/`, or any node that will consume it.

  * `[✅]`   `requirements` (binary, observable)
    * `[✅]`   `constructStoragePath({ ...validContext, fileType: FileType.CompressedContext, targetKey, sourceType, documentKey })` returns `storagePath` ending in `/_work` and `fileName` equal to `${sanitizeForPath(documentKey)}_compressed_for_${sanitizeForPath(targetKey)}.md`.
    * `[✅]`   `constructStoragePath({ ...validContext, fileType: FileType.CompressedContext, targetKey, sourceType: 'history', sourceId })` (no `documentKey`) returns a `fileName` beginning `source_${generateShortId(sourceId)}_compressed_for_`.
    * `[✅]`   Supplying `chunkIndex`/`chunkTotal` appends `_chunk_{chunkIndex}of{chunkTotal}` before the `.md` extension; omitting both omits the suffix entirely.
    * `[✅]`   Missing `targetKey`, missing `sourceType`, a `'contribution'`/`'resource'` call missing `documentKey`, a `'feedback'`/`'history'` call missing `sourceId`, or exactly one of `chunkIndex`/`chunkTotal` each throw a distinct, specific `Error` — supplying the OTHER identity field never substitutes for the one the `sourceType` requires.
    * `[✅]`   `isCompressedContextFileType`, `isCompressionSourceType`, and `isCompressionMode` correctly accept/reject per their guard tests; `isResourceFileType(FileType.CompressedContext)` returns `true`.
    * `[✅]`   `CompressionMode = 'json' | 'text'` and `isCompressionMode` exist in `file_manager.types.ts`/`type_guards.file_manager.ts` and are importable by `enqueueCompressJobs.ts`, `assembleCompressionPrompt.ts`, `processCompressJob.ts`, and `saveResponse.ts` without any of those nodes redefining them (CORRECTIVE ADDITION — the requirement this entire edit exists to satisfy).
    * `[✅]`   Every existing test in `path_constructor.test.ts`, `path_constructor.fragment.test.ts`, `path_constructor.continuation.test.ts`, and `type_guards.file_manager.test.ts` continues to pass unmodified.
    * `[✅]`   The repo compiles with the widened `PathContext`/`FileType`/`ResourceFileTypes` types.

* `[✅]`   supabase/functions/_shared/utils/`path_deconstructor.ts` **[BE] Parse a CompressedContext storage path (final and chunk forms) back into its identity fields, losslessly round-tripping the path_constructor.ts case**

  * `[✅]`   `objective`
    * `[✅]`   Add the missing regex case in `deconstructStoragePath` (`path_deconstructor.ts:17-876`) for paths produced by the `path_constructor.ts` `FileType.CompressedContext` case: `{projectId}/session_{shortSessionId}/iteration_{iteration}/{stageDirName}/_work/{sourceBasename}_compressed_for_{targetKey}[_chunk_{chunkIndex}of{chunkTotal}].md`.
    * `[✅]`   Extract `targetKey`, `chunkIndex`, `chunkTotal`, and `documentKey` so the parsed identity matches what `path_constructor.ts` was given. `sourceBasename` is exactly one of the two shapes `path_constructor.ts` can produce (per its explicit `sourceType` branch): a sanitized `documentKey`, or `source_{8hex}`; recognizing which shape is present is a closed, exhaustive classification, not an inference.
    * `[✅]`   Set `fileTypeGuess = FileType.CompressedContext` unconditionally — unlike `RenderedDocument`/`HeaderContext`, no other `FileType` shares this filename shape, so there is no documentKey-based override to perform.

  * `[✅]`   `deps`
    * `[✅]`   No injected dependencies (pure function, unchanged). Uses the existing `mapDirNameToStageSlug` helper already in this file; no new imports beyond `FileType`, already imported at `path_deconstructor.ts:1`.

  * `[✅]`   `path_deconstructor.types.ts`
    * `[✅]`   Add `targetKey?: string; chunkIndex?: number; chunkTotal?: number;` to `DeconstructedPathInfo` (`path_deconstructor.types.ts:3-27`).

  * `[✅]`   `deconstructStoragePath.interaction.spec` (prose; no file, matching this file's existing precedent)
    * `[✅]`   Called by: `file_manager.ts` and `compressPrompt.ts`'s reduce/lookup path (later nodes) when locating an existing `CompressedContext` artifact by its stored path.
    * `[✅]`   Input → output: a matching path returns `info` with `fileTypeGuess: FileType.CompressedContext` and the fields above populated; a non-matching path falls through to later patterns or the existing unmatched-path `error` assignment (`path_deconstructor.ts:874`) unchanged.

  * `[✅]`   `path_deconstructor.test.ts`
    * `[✅]`   Round-trips every `path_constructor.test.ts` `CompressedContext` case added in the prior node: the `documentKey`-sourced final artifact, the `sourceId`-sourced final artifact, and the chunked form — asserting `stageSlug`, `documentKey` (or its absence for the `sourceId`-sourced form), `targetKey`, `chunkIndex`, `chunkTotal`, and `fileTypeGuess` each match the values the path was constructed from.
    * `[✅]`   A path with no chunk suffix leaves `chunkIndex`/`chunkTotal` `undefined`.

  * `[✅]`   `construction`
    * `[✅]`   Insert the new regex string and its match block immediately after the existing (first, reachable) `ragSummaryPatternString` block (`path_deconstructor.ts:623-636`) and before the `Pending`/`Current`/`Complete` block (`path_deconstructor.ts:638`) — grouping it with the other `_work`-directory utility-artifact patterns and ahead of the generic `_work` catch-alls (`genericWorkFilePatternString`, `genericIntermediateFilePatternString`), consistent with this file's existing specific-before-generic ordering.

  * `[✅]`   `path_deconstructor.ts` (Implementation)
    * `[✅]`   Add `const compressedContentPatternString = "^([^/]+)/session_([^/]+)/iteration_(\\d+)/([^/]+)/_work/(.+)_compressed_for_(.+?)(?:_chunk_(\\d+)of(\\d+))?\\.md$";` alongside the other pattern-string declarations (`path_deconstructor.ts:58`, next to `ragSummaryPatternString`).
    * `[✅]`   Add the match block at the placement above:
      * `[✅]`   `matches = fullPath.match(new RegExp(compressedContentPatternString));`
      * `[✅]`   On match: set `originalProjectId`, `shortSessionId`, `iteration` (parsed), `stageDirName`/`stageSlug` (via `mapDirNameToStageSlug`) exactly as every other block does.
      * `[✅]`   `const sourceBasename = matches[5];` — exactly one of the two shapes `path_constructor.ts` can produce: if it matches `/^source_[0-9a-f]{8}$/` it is the `'feedback'`/`'history'` shape and `documentKey` is left unset; otherwise it is the `'contribution'`/`'resource'` shape and `info.documentKey = sourceBasename`.
      * `[✅]`   `info.targetKey = matches[6];`
      * `[✅]`   `if (matches[7]) { info.chunkIndex = parseInt(matches[7], 10); info.chunkTotal = parseInt(matches[8], 10); }`
      * `[✅]`   `info.fileTypeGuess = FileType.CompressedContext;`
      * `[✅]`   `return info;`

  * `[✅]`   `directionality`
    * `[✅]`   Layer: shared utility, read-side counterpart to the `path_constructor.ts` node. Provides `targetKey`/`chunkIndex`/`chunkTotal`/`documentKey`/`fileTypeGuess` outward to `file_manager.ts` and `compressPrompt.ts` (later nodes); no new inward deps.

  * `[✅]`   `requirements`
    * `[✅]`   A path built by `path_constructor.ts`'s `CompressedContext` case with `documentKey` deconstructs to the same `documentKey`, `targetKey`, and `fileTypeGuess: FileType.CompressedContext`.
    * `[✅]`   A path built with `sourceId` (no `documentKey`) deconstructs with `documentKey` left `undefined`.
    * `[✅]`   A chunked path deconstructs `chunkIndex`/`chunkTotal` as numbers matching what was constructed; a non-chunked path leaves both `undefined`.
    * `[✅]`   Every existing test in `path_deconstructor.test.ts`, `path_deconstructor.fragment.test.ts`, and `path_deconstructor.continuation.test.ts` continues to pass unmodified.

* `[✅]`   supabase/functions/_shared/services/`file_manager.upload.test.ts` **[TEST-INT] Prove uploadAndRegisterFile persists a CompressedContext ResourceUploadContext correctly — no source change to file_manager.ts is required**

  * `[✅]`   `objective`
    * `[✅]`   `uploadAndRegisterFile`'s resource branch (`file_manager.ts:386-429`) already handles every `ResourceFileTypes` member generically — it builds `resource_type`/`resource_description` from `pathContext.fileType` and upserts into `dialectic_project_resources` on `(storage_bucket, storage_path, file_name)`, with no per-`FileType` branching. `isResourceContext` (`type_guards.file_manager.ts:35-62`) already routes any `pathContext.fileType` for which `isResourceFileType` (`type_guards.file_manager.ts:81-86`) returns `true` into this branch. The `path_constructor.ts` node in this sprint already added `FileType.CompressedContext` to `RESOURCE_FILE_TYPES_MAP`, and its `constructStoragePath` case already throws before any DB write if `sessionId`/`iteration`/`stageSlug`/`targetKey`/`sourceType`/(`documentKey`or`sourceId`) are incomplete. Together these mean a `CompressedContext` `ResourceUploadContext` already persists correctly through the existing code — this node proves it with a test, per the same contract already proven for `SeedPrompt`/`PlannerPrompt`/`RenderedDocument` (`file_manager.upload.test.ts:295-332`, `:3217+`).
    * `[✅]`   No new lookup method is added: `compressPrompt.ts`'s later reduce/lookup locates an artifact by recomputing its expected path via `constructStoragePath` and querying the same `(storage_bucket, storage_path, file_name)` key the upsert already uses — that call site belongs to the `compressPrompt.ts` node, not this one.

  * `[✅]`   `file_manager.upload.test.ts` (Behavioral Verification)
    * `[✅]`   New `t.step`, modeled on the existing `SeedPrompt` case (`file_manager.upload.test.ts:295-332`): build a `ResourceUploadContext` with `pathContext: { projectId, sessionId, iteration, stageSlug, fileType: FileType.CompressedContext, targetKey, sourceType: 'contribution', documentKey }`, call `uploadAndRegisterFile`, assert `error === null` and the record exists.
    * `[✅]`   Compute `expectedPathParts = constructStoragePath(context.pathContext)` before the call (matching the `ProjectExportZip` test's pattern, `file_manager.upload.test.ts:352-353`) and assert `insertData.storage_path === expectedPathParts.storagePath` and `insertData.file_name === expectedPathParts.fileName` from the `dialectic_project_resources` upsert spy.
    * `[✅]`   Assert `insertData.resource_type === FileType.CompressedContext` (no `resourceTypeForDb` override supplied), `insertData.session_id === sessionId`, `insertData.stage_slug === stageSlug`, `insertData.iteration_number === iteration`.
    * `[✅]`   Assert the upsert call's `onConflict` option is `'storage_bucket,storage_path,file_name'` (`file_manager.upload.test.ts:390-392`), proving a second write to the same identity updates rather than duplicates.
    * `[✅]`   Repeat with `sourceType: 'history'`, `sourceId` (no `documentKey`), proving the same generic path also persists the other `path_constructor.ts` branch correctly.

  * `[✅]`   `requirements`
    * `[✅]`   A `CompressedContext` `ResourceUploadContext` upserts into `dialectic_project_resources` with `resource_type`, `storage_path`, and `file_name` matching `constructStoragePath`'s output, for both the `documentKey`-sourced and `sourceId`-sourced identity branches.
    * `[✅]`   `file_manager.ts` is unmodified by this node.

## WS-R — ROUTING & SPAWN (Sprint 3; depends WS-C)

* `[✅]`   supabase/functions/_shared/utils/`text_splitter.ts` **[BE] Copy LangchainTextSplitter out of indexing_service.ts into its own shared module for map-reduce chunking**

  * `[✅]`   `objective`
    * `[✅]`   Give `enqueueCompressJobs` (next node) a `textSplitter` dependency that doesn't require importing `indexing_service.ts` (deleted in WS-X). Copy `LangchainTextSplitter` (`indexing_service.ts:10-23`) and `ITextSplitter` (`indexing_service.interface.ts:33-35`) into a new, self-contained module; the originals in `indexing_service.ts`/`indexing_service.interface.ts` are left untouched and deleted with that file in WS-X.
    * `[✅]`   No mock file: `RecursiveCharacterTextSplitter` is local, deterministic text processing with no external call; consumers inject the real `LangchainTextSplitter` in their tests, and any test-only stub belongs to the consumer's own mock file (`enqueueCompressJobs.mock.ts`), not here.

  * `[✅]`   `text_splitter.interface.ts`
    * `[✅]`   Define `export interface ITextSplitter { splitText(text: string): Promise<string[]>; }`, identical to `indexing_service.interface.ts:33-35`.

  * `[✅]`   `text_splitter.test.ts` (Behavioral Verification)
    * `[✅]`   No existing test exercises `LangchainTextSplitter`'s real chunking behavior — `indexing_service.test.ts:20,34` only spies on a hand-rolled `ITextSplitter` mock — so these are new tests, not a lift.
    * `[✅]`   Default construction (`new LangchainTextSplitter()`): text longer than 1000 characters splits into multiple chunks; adjacent chunks overlap, consistent with `chunkSize: 1000`/`chunkOverlap: 200`.
    * `[✅]`   Text shorter than `chunkSize` returns a single chunk equal to the input.
    * `[✅]`   Custom `{ chunkSize, chunkOverlap }` options are honored (a small `chunkSize` on a fixed-length input produces a predictable chunk count).
    * `[✅]`   Empty string input returns whatever `RecursiveCharacterTextSplitter.splitText('')` actually returns — assert against its real behavior, not an assumption.

  * `[✅]`   `text_splitter.ts` (Implementation)
    * `[✅]`   `import { RecursiveCharacterTextSplitter } from 'npm:@langchain/textsplitters';` — identical, unpinned specifier already resolved in `supabase/deno.lock` and `supabase/functions/deno.lock`.
    * `[✅]`   `import type { ITextSplitter } from './text_splitter.interface.ts';`
    * `[✅]`   Copy the `LangchainTextSplitter` class verbatim from `indexing_service.ts:10-23`: constructor `(options?: { chunkSize?: number; chunkOverlap?: number })` defaulting to `chunkSize: 1000, chunkOverlap: 200`; `splitText(text)` delegates to the wrapped splitter. No behavior change.

  * `[✅]`   `requirements`
    * `[✅]`   `new LangchainTextSplitter().splitText(text)` and `new LangchainTextSplitter({ chunkSize, chunkOverlap }).splitText(text)` behave identically to the existing `indexing_service.ts` class for the same inputs.
    * `[✅]`   `indexing_service.ts` and `indexing_service.interface.ts` are unmodified by this node.
    * `[✅]`   `text_splitter.ts`/`text_splitter.interface.ts` import nothing from `dialectic-worker/` or any node that will consume them.

* `[✅]`   supabase/functions/dialectic-worker/enqueueCompressJobs/`enqueueCompressJobs.ts` **[BE] Spawn one or more COMPRESS child jobs for a single compression victim, deduplicating against the canonical CompressedContext artifact and splitting into map-reduce chunks only when the victim doesn't fit the model window**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing spawn step between victim selection (future `compressPrompt.ts`) and COMPRESS job execution (future `processCompressJob.ts`): given ONE selected victim, decide whether it fits the parent model's window as a single COMPRESS child or must be map-reduce-chunked, re-verify (dedup layer 1) that its canonical artifact doesn't already exist, and insert the child row(s) atomically.
    * `[✅]`   Functional goals:
      * `[✅]`   Own `DialecticCompressJobPayload` (canonical shape in `Compression Jobs Scope.md`'s CANONICAL CONTRACTS) in `enqueueCompressJobs.interface.ts`, and `isDialecticCompressJobPayload` in this node's own guard file — creator-owns-the-data, per the module-first rule (`dialectic.interface.ts` gains NOTHING new; `processJob.ts`, WS-R, imports it from here). `CompressionMode` is imported from `_shared/types/file_manager.types.ts` (owned by the `path_constructor.ts` node, not here) — `assembleCompressionPrompt.ts` in `_shared/prompt-assembler/` also needs it, and `_shared/` code must never import from `dialectic-worker/`, so the type lives where every layer can import it downward.
      * `[✅]`   Validate `payload.victim` by EXPLICIT branch on `sourceType`, never an OR/fallback: `'contribution'|'resource'` require `documentKey`; `'feedback'|'history'` require `sourceId`; an unrecognized `sourceType` throws — mirroring the same rule already applied in the `path_constructor.ts` node. ADDITIONALLY, by explicit branch on `mode`: `mode:'json'` requires `documentKey` + `docType` + `sourceStageSlug` — the source document's template identity, which `saveResponse`'s json-mode save-time rendering resolves against (WS-B, per the ratified 2026-07-11 canonical-contract amendment); `mode:'text'` requires none of `docType`/`sourceStageSlug`.
      * `[✅]`   Dedup layer 1: recompute the victim's canonical FINAL-artifact path via `deps.constructStoragePath` (the `FileType.CompressedContext` case, no chunk fields) and query `dialectic_project_resources` by `(storage_path, file_name)`; if a row exists, return `{ createdCount: 0 }` without inserting anything — this is success, not error, and is a re-verification of a check `compressPrompt.ts` (later node) already performed once, guarding the race window between selection and spawn.
      * `[✅]`   Size the victim: `deps.countTokens` against `params.tokenizerDeps`/`params.modelConfig` on the RAW victim content (a `{ message: content }` `CountableChatPayload` — not the assembled compression prompt, which doesn't exist yet); compare against `params.modelConfig.provider_max_input_tokens` minus a fixed 500-token template-overhead reserve minus the existing 32-token safety buffer (`compressPrompt.ts`'s own established constant). Fits → ONE child, `mode` as given. Exceeds → split via `deps.textSplitter.splitText(content)` → one child PER CHUNK, each forced to `mode: 'text'` with `chunk_index`/`chunk_total` (1-based) set — chunking JSON would destroy the structure `saveResponse` (later node) validates, so a chunked json-mode victim's pieces are always text-mode, per the ratified design.
      * `[✅]`   Build a deterministic `idempotency_key` per child: `${parentJob.id}_compress_${sourceType}_${documentKey ?? sourceId}_${sanitizeForPath(targetKey)}`, with `_chunk_${chunk_index}of${chunk_total}` appended for chunk children — guards against duplicate child rows on a re-invocation, independent of the artifact-existence check above.
      * `[✅]`   Insert all child row(s) in ONE batch `.insert([...])` call — the ratified "no partial success" rule is satisfied structurally by a single multi-row insert statement (atomic in Postgres), not by per-row recovery logic.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   Does NOT set `parentJob.status`; the caller (`compressPrompt.ts`) owns transitioning the parent to `waiting_for_children` after this function returns.
      * `[✅]`   Unlike `enqueueRenderJob.ts` (`enqueueRenderJob.ts:313-343`), a duplicate-`idempotency_key` insert error (Postgres `23505`) is NOT recovered by looking up the existing row — it is treated as any other insert failure: a hard, non-retriable stop. This is a deliberate divergence: the pre-insert existence check above is expected to catch the ordinary "already compressed" case, and under the `parent_job_id`/`waiting_for_children` gating this function is not re-entered for the same victim until all its prior children finish, so collision recovery is not load-bearing here.
      * `[✅]`   Payload is never empty: `content` must be a non-empty string; an empty victim is a validation error, not silently accepted.

  * `[✅]`   `enqueueCompressJobs.interface.test.ts`
    * `[✅]`   Imports ONLY `assertEquals` and this node's own exports from `./enqueueCompressJobs.interface.ts` — no import of `CompressionMode`/`CompressionSourceType`, no `.guard.ts`, no `.mock.ts`, no `SupabaseClient`/`Database`, matching the `enqueueModelCall.interface.test.ts`/`listDomains.interface.test.ts` precedent.
    * `[✅]`   `Record<keyof enqueueCompressJobsDeps, true>` surface check declares exactly `logger`/`textSplitter`/`countTokens`/`constructStoragePath` (4 keys).
    * `[✅]`   `Record<keyof enqueueCompressJobsParams, true>` surface check declares exactly the 11 documented fields.
    * `[✅]`   A minimal `enqueueCompressJobsPayload` literal type-checks, using `enqueueCompressJobsPayload["victim"]["mode"]`/`["sourceType"]` indexed-access to type each field's literal value — no import of `CompressionMode`/`CompressionSourceType` needed to construct it.
    * `[✅]`   `enqueueCompressJobsSuccessReturn { createdCount: number }` and `enqueueCompressJobsErrorReturn { error: CompressJobValidationError | CompressJobEnqueueError; retriable: boolean }` each type-check individually; a `enqueueCompressJobsReturn`-typed value constructed from each is assignable, proving the union — no runtime accept/reject logic, no `isDialecticCompressJobPayload` call (that belongs to `enqueueCompressJobs.guard.test.ts`).
    * `[✅]`   `enqueueCompressJobsFn`/`BoundenqueueCompressJobsFn` signature check: a locally-declared stub function assignable to each type, called once, return value's `typeof` asserted.

  * `[✅]`   `enqueueCompressJobs.interface.ts`
    * `[✅]`   Define `export interface DialecticCompressJobPayload` exactly per the canonical shape in `Compression Jobs Scope.md` (field census above), using the imported `CompressionMode` for its `mode` field.
    * `[✅]`   Define `enqueueCompressJobsDeps { logger: ILogger; textSplitter: ITextSplitter; countTokens: CountTokensFn; constructStoragePath: ConstructStoragePathFn; }`, importing `ITextSplitter` from `../../_shared/utils/text_splitter.interface.ts`, `CountTokensFn`/`CountTokensDeps` from `../../_shared/types/tokenizer.types.ts`, `ConstructStoragePathFn` from `../../_shared/utils/path_constructor.types.ts`.
    * `[✅]`   Define `enqueueCompressJobsParams { dbClient: SupabaseClient<Database>; parentJob: DialecticJobRow; sessionId: string; projectId: string; stageSlug: string; targetKey: string; iterationNumber: number; modelId: string; walletId: string; modelConfig: AiModelExtendedConfig; tokenizerDeps: CountTokensDeps; }`.
    * `[✅]`   Define `enqueueCompressJobsPayload { victim: { mode: CompressionMode; content: string; sourceType: CompressionSourceType; sourceId?: string; documentKey?: string; docType?: string; sourceStageSlug?: string; } }`, importing `CompressionMode` AND `CompressionSourceType` together from `../../_shared/types/file_manager.types.ts` — neither is defined in this file.
    * `[✅]`   Define `CompressJobValidationError` and `CompressJobEnqueueError`.
    * `[✅]`   Define `enqueueCompressJobsSuccessReturn { createdCount: number }`, `enqueueCompressJobsErrorReturn { error: CompressJobValidationError | CompressJobEnqueueError; retriable: boolean }`, `enqueueCompressJobsReturn = SuccessReturn | ErrorReturn`.
    * `[✅]`   Define `enqueueCompressJobsFn(deps, params, payload) => Promise<enqueueCompressJobsReturn>` and `BoundenqueueCompressJobsFn(params, payload) => Promise<enqueueCompressJobsReturn>`.

  * `[✅]`   `enqueueCompressJobs.interaction.spec` (prose; no file, matching `enqueueRenderJob`'s precedent of no literal `.interaction.spec`)
    * `[✅]`   Called by: `compressPrompt.ts` (later node), once per selected victim.
    * `[✅]`   Required interactions: one `dialectic_project_resources` existence read; when not found, one `dialectic_generation_jobs` batch insert. No writes when the artifact already exists.
    * `[✅]`   Failure modes: validation errors (non-retriable), existence-check query failure (retriable — a transient DB read failure, not treated as "proceed as if missing"), insert failure (non-retriable, per the no-recovery divergence above).

  * `[✅]`   `enqueueCompressJobs.guard.test.ts`
    * `[✅]`   `isDialecticCompressJobPayload` accepts a fully-populated payload for each `sourceType` branch; rejects one missing its branch-required field, an unrecognized `sourceType`, and a payload missing `job_type:'COMPRESS'`.
    * `[✅]`   `isDialecticCompressJobPayload` enforces the json-mode invariant: rejects a `mode:'json'` payload missing any of `documentKey`/`docType`/`sourceStageSlug`; accepts a `mode:'text'` payload without `docType`/`sourceStageSlug`.
    * `[✅]`   `isenqueueCompressJobsDeps`/`isenqueueCompressJobsParams`/`isenqueueCompressJobsPayload` mirror `isEnqueueRenderJobDeps`/`isEnqueueRenderJobParams`/`isEnqueueRenderJobPayload`'s exact structure (`enqueueRenderJob.interface.guards.ts:48-134`): required-key presence, then per-field type/shape checks.
    * `[✅]`   `isenqueueCompressJobsSuccessReturn`/`isenqueueCompressJobsErrorReturn` mirror `isEnqueueRenderJobSuccessReturn`/`isEnqueueRenderJobErrorReturn`'s mutual-exclusion pattern (`enqueueRenderJob.interface.guards.ts:177-203`).

  * `[✅]`   `enqueueCompressJobs.guard.ts`
    * `[✅]`   Implement `isDialecticCompressJobPayload` using `isCompressionSourceType`/`isCompressionMode` (both imported from `type_guards.file_manager.ts`, `path_constructor.ts` node — neither is defined here) plus the explicit per-branch required-field check, plus the explicit `mode` branch: `mode:'json'` requires `documentKey`, `docType`, and `sourceStageSlug` (never an OR-fallback).
    * `[✅]`   Implement `isenqueueCompressJobsDeps`/`Params`/`Payload`/`SuccessReturn`/`ErrorReturn`, structured exactly like `enqueueRenderJob.interface.guards.ts`.

  * `[✅]`   `enqueueCompressJobs.mock.ts`
    * `[✅]`   `createenqueueCompressJobsMock(options?: { result?, handler? })` returning `{ enqueueCompressJobs, calls }`, structured exactly like `createEnqueueRenderJobMock` (`enqueueRenderJob.mock.ts:23-49`); default fallback result `{ createdCount: 0 }`.
    * `[✅]`   Trusted Factories: `buildenqueueCompressJobsParams(overrides?)`, `buildenqueueCompressJobsPayload(overrides?)` (default a valid `'contribution'`+`documentKey` victim; overridable to the `'history'`+`sourceId` branch), `buildDialecticCompressJobPayload(overrides?)`.

  * `[✅]`   `enqueueCompressJobs.test.ts`
    * `[✅]`   Existence check finds a row → `{ createdCount: 0 }`; no insert call made (assert the insert spy was never invoked).
    * `[✅]`   Existence check errors → `{ error, retriable: true }`; no insert attempted.
    * `[✅]`   Victim under the token budget → one row inserted, `job_type:'COMPRESS'`, `parent_job_id: parentJob.id`, `payload.chunk_index`/`chunk_total` both `undefined`.
    * `[✅]`   Victim over the token budget → `deps.textSplitter.splitText` is called; N rows inserted, each with `chunk_index`/`chunk_total` set and `payload.mode === 'text'` even when the original victim was `mode:'json'`.
    * `[✅]`   Insert failure (including a simulated `23505`) → `{ error, retriable: false }`; no lookup/recovery query is issued (assert no second `select` call follows the failed insert).
    * `[✅]`   Each child's `idempotency_key` matches the documented derivation; two calls for the same victim produce the same key.

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the exported function. Validate victim (explicit branch) → existence check → size/split → build payload(s) + idempotency key(s) → single batch insert — no DB write happens before validation and the existence check both pass.

  * `[✅]`   `enqueueCompressJobs.ts` (Implementation)
    * `[✅]`   Implements the objective's functional goals in the order given in `construction`, using `params.dbClient`, `TablesInsert<'dialectic_generation_jobs'>[]` for the batch insert, and `sanitizeForPath` (imported from `../../_shared/utils/path_constructor.ts`) for the idempotency-key's `targetKey` segment.

  * `[✅]`   `enqueueCompressJobs.provides.ts`
    * `[✅]`   Re-export `enqueueCompressJobs`, all interface types, all guards, and all mock builders.

  * `[✅]`   `enqueueCompressJobs.integration.test.ts`
    * `[✅]`   Bounded subsystem: real `enqueueCompressJobs`, real `constructStoragePath`, real `LangchainTextSplitter`, real `countTokens` with a real `modelConfig` and real tokenizer deps; only the Supabase client is mocked (external boundary).
    * `[✅]`   Dedup path identity: the existence query's `storage_path`/`file_name` filter values equal `constructStoragePath`'s CompressedContext FINAL-artifact output exactly, for BOTH the `documentKey`-sourced and `sourceId`-sourced branches; a preloaded row at exactly that path → `{ createdCount: 0 }`, no insert; a row at the CHUNK path for the same identity does NOT satisfy the final check.
    * `[✅]`   Spawn→consume contract: every inserted row's `payload` passes the real `isDialecticCompressJobPayload` — the fitting `mode:'json'` single child (json invariant intact), the fitting `mode:'text'` child, and every forced-text chunk child of a json victim.
    * `[✅]`   Budget boundary with the real tokenizer: content tokenizing just under `provider_max_input_tokens − 500 − 32` → one child, mode preserved; just over → N chunk children.
    * `[✅]`   Chunk coverage/order (corrected from "reassembled content reproduces the original": the real splitter overlaps and trims, so lossless concat is not its contract): chunks appear in source order, every chunk is a substring of the source, and their union covers it — no span of the source is absent from all chunks; `chunk_index` is 1-based and dense through `chunk_total`.
    * `[✅]`   Downstream row fields: each inserted row carries `user_id`/`is_test_job` from `parentJob` and `session_id`/`stage_slug`/`iteration_number` from params — the fields the completion trigger and saveResponse attribution depend on.  
  
  * `[✅]`   `directionality`
    * `[✅]`   Layer: worker orchestration (spawn). Deps inward: `text_splitter.ts`, `path_constructor.ts`'s `constructStoragePath`/`sanitizeForPath`, `tokenizer.types.ts`'s `countTokens` shape, `file_manager.types.ts`'s `CompressionSourceType`/`CompressionMode`/guards — all Sprint 1–2 nodes; this node imports `CompressionMode`, it does not provide it. Provides outward: `DialecticCompressJobPayload` to every remaining Sprint-3 node and to `saveResponse`/`compressPrompt` (Sprints 4–5).

  * `[✅]`   `requirements`
    * `[✅]`   A victim whose artifact already exists produces no insert and `{ createdCount: 0 }`.
    * `[✅]`   A victim under budget produces exactly one COMPRESS child row with no chunk fields.
    * `[✅]`   A victim over budget produces N chunk rows, all `mode:'text'`, with correct `chunk_index`/`chunk_total`.
    * `[✅]`   A `sourceType` branch missing its required field throws, regardless of whether the other identity field is present.
    * `[✅]`   Insert failure never triggers idempotency-key-collision recovery.

* `[✅]`   supabase/functions/_shared/prompt-assembler/`assembleCompressionPrompt.ts` **[BE] Assemble the mode-aware compression prompt for a COMPRESS job by loading the seeded template and rendering it against the victim content and the consuming step's target schema**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing link between a COMPRESS job's raw inputs (victim content, its mode, chunk lineage) and a renderable model prompt. COMPRESS jobs are not recipe steps — they carry no `recipe_step.prompt_template_id` and no `stage` of their own — so nothing in the existing prompt-assembler family (`assembleSeedPrompt`, `assemblePlannerPrompt`, `assembleTurnPrompt`, `assembleContinuationPrompt`, all keyed on `StageContext`/`recipe_step.prompt_template_id`) can produce this prompt.
    * `[✅]`   Functional goals:
      * `[✅]`   Load the single seeded `system_prompts` row by its unique `name` (`'compression_context_v1'`, seeded by the Sprint-1 migration node) — not by `prompt_template_id`, since COMPRESS jobs have none.
      * `[✅]`   Render in exactly one of two modes per call, driven by `payload.mode` (`CompressionMode`, imported from `file_manager.types.ts` — owned there, not redefined here, per the corrected TYPE OWNERSHIP): `'json'` keeps the template's `json_mode` section and strips `text_mode`; `'text'` does the inverse.
      * `[✅]`   Inject the CONSUMING step's target schema (`params.consumingStep.outputs_required`, `dialectic.interface.ts:174/193`) and stage intent (`params.consumingStep.step_description`, `types_db.ts:1235`) into the rendered prompt so the compressor preserves exactly what the next agent needs.
      * `[✅]`   Render the `chunk_context` section only when both `payload.chunk_index` and `payload.chunk_total` are supplied (map-reduce chunk jobs), and omit both chunk placeholders otherwise.
      * `[✅]`   Return `{ prompt: string }` on success; return a typed `{ error: Error; retriable: boolean }` on every precondition failure — never throw past the function boundary (DI-boundary function per `composition.instructions.md`, unlike the lower-level `renderPrompt` it calls, which is a pure synchronous string transform).
    * `[✅]`   Non-functional constraints:
      * `[✅]`   No network/model call in this function — it only queries `system_prompts` and performs local string templating; the compression model call is `processCompressJob`'s responsibility (next node).
      * `[✅]`   No fallbacks: a missing/empty `step_description`, a missing/empty/non-JSON-compatible `outputs_required`, an empty `content`, or (in `json` mode) a `content` string that fails `JSON.parse` are explicit precondition failures, not silently defaulted or skipped.
      * `[✅]`   Do NOT use `RenderFn`/`RenderPromptFunctionType` (`prompt-assembler.interface.ts:17-22, 158-163`) — both are shape-locked to `DynamicContextVariables` (`prompt-assembler.interface.ts:123-135`), which REQUIRES `user_objective`/`domain`/`context_description`/`original_user_request`/`recipeStep` — fields a compression prompt has no reason to supply and no correct values for. Depend directly on the real `renderPrompt` (`prompt-renderer.ts:57-62`, signature `(basePromptText: string, dynamicContextVariables: Record<string, unknown>, systemDefaultOverlayValues?: Json | null, userProjectOverlayValues?: Json | null) => string`) via a FRESH dep type this node defines to match that real signature — do not force-fit the wrong-shaped existing alias.
      * `[✅]`   Each goal is atomic and testable through interface, guard, mock, unit, and integration coverage within this node's scope.

  * `[✅]`   `role`
    * `[✅]`   Node role is prompt-assembly implementation and complete immediate support system for `assembleCompressionPrompt.ts`, a new sibling to `assembleSeedPrompt.ts`/`assemblePlannerPrompt.ts`/`assembleTurnPrompt.ts` in `_shared/prompt-assembler/`.
    * `[✅]`   Out-of-scope responsibilities:
      * `[✅]`   Do not call `enqueueModelCall` or make any model/network call (that is `processCompressJob.ts`, next node).
      * `[✅]`   Do not decide chunking, victim selection, or mode (that is `enqueueCompressJobs.ts`/`compressPrompt.ts`, already-written or later nodes) — this function only renders what it is told.
      * `[✅]`   Do not validate or persist the compressor's OUTPUT (structural JSON-drift validation is `saveResponse.ts`'s responsibility, Sprint 4).

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `_shared/prompt-assembler/` — prompt construction from typed inputs to a rendered string.
    * `[✅]`   Inside boundary: template lookup by name, mode-section selection, target-schema/stage-intent injection, chunk-context injection, delegation to `renderPrompt` for substitution.
    * `[✅]`   Outside boundary: job persistence, model invocation, response persistence, victim selection, chunking.

  * `[✅]`   `deps`
    * `[✅]`   Provider: `SupabaseClient<Database>` (`npm:@supabase/supabase-js@2`) — same pattern as every sibling assembler (e.g. `AssembleSeedPromptDeps.dbClient`, `prompt-assembler.interface.ts:70`). Purpose: read the seeded `system_prompts` row.
    * `[✅]`   Provider: the real `renderPrompt` (`prompt-renderer.ts:57`), typed via a fresh `RenderCompressionPromptFn` this node defines locally (matching `renderPrompt`'s actual general signature — see the non-functional constraint above) — NOT `RenderPromptFunctionType`.
    * `[✅]`   Provider: `ILogger` (`_shared/types.ts`) — structured logging on precondition failure, matching every sibling assembler's `logger` dep.
    * `[✅]`   Confirm: no reverse dependency; no lateral violation — this node does not import from `dialectic-worker/` (its `CompressionMode` dependency is satisfied from `_shared/types/file_manager.types.ts`, not from `enqueueCompressJobs.interface.ts`).

  * `[✅]`   `assembleCompressionPrompt.interface.test.ts`
    * `[✅]`   Imports ONLY `assertEquals` and this node's own exports from `./assembleCompressionPrompt.interface.ts` — no import of `CompressionMode`, no `SupabaseClient`/`Database`, no `DialecticStageRecipeStep`; all such types are referenced via indexed access on this file's own exported types, matching the `enqueueModelCall.interface.test.ts` precedent. (The DB-query/rendering/retriable-flag behavior these old bullets described belongs to `assembleCompressionPrompt.test.ts`, the behavioral-verification file — not here.)
    * `[✅]`   `Record<keyof AssembleCompressionPromptDeps, true>` surface check declares exactly `dbClient`/`renderPromptFn`/`logger` (3 keys).
    * `[✅]`   `AssembleCompressionPromptDeps["renderPromptFn"]` indexed-access typed stub (returning a fixed string) is assignable to that field, proving the signature without importing `RenderCompressionPromptFn` — it's already exported from this same file, imported directly instead.
    * `[✅]`   `AssembleCompressionPromptParams` surface check: `Record<keyof AssembleCompressionPromptParams, true>` declares exactly `consumingStep`.
    * `[✅]`   `AssembleCompressionPromptPayload` type-checks with `mode` typed via `AssembleCompressionPromptPayload["mode"]` indexed-access (no `CompressionMode` import); a second literal omits `chunk_index`/`chunk_total` to prove they're optional.
    * `[✅]`   `AssembleCompressionPromptSuccessReturn { prompt: string }` and `AssembleCompressionPromptErrorReturn { error: Error; retriable: boolean }` each type-check individually; a `AssembleCompressionPromptReturn`-typed value constructed from each is assignable, proving the union.
    * `[✅]`   `AssembleCompressionPromptFn`/`BoundAssembleCompressionPromptFn` signature check: a locally-declared stub function assignable to each type.

  * `[✅]`   `assembleCompressionPrompt.interface.ts`
    * `[✅]`   Define `RenderCompressionPromptFn = (basePromptText: string, dynamicContextVariables: Record<string, unknown>, systemDefaultOverlayValues?: Json | null, userProjectOverlayValues?: Json | null) => string`.
    * `[✅]`   Define `AssembleCompressionPromptDeps { dbClient: SupabaseClient<Database>; renderPromptFn: RenderCompressionPromptFn; logger: ILogger }`.
    * `[✅]`   Define `export interface CompressionTargetStep { outputs_required: OutputRule; step_description: string | null }` — the minimal slice this function actually consumes (its own `context_slice` declares exactly these two fields; no over-fetching). Both consuming-step row shapes the caller can encounter (`dialectic_stage_recipe_steps` for cloned instances, `dialectic_recipe_template_steps` for template-backed instances — the two branches of `enqueueRenderJob.ts:168-196`'s established lookup) satisfy this slice after Json narrowing; the earlier `DialecticStageRecipeStep` typing was over-specified and would structurally reject the template-branch row.
    * `[✅]`   Define `AssembleCompressionPromptParams { consumingStep: CompressionTargetStep }`.
    * `[✅]`   Define `AssembleCompressionPromptPayload { mode: CompressionMode; content: string; chunk_index?: number; chunk_total?: number }`, importing `CompressionMode` from `../types/file_manager.types.ts` — matches the corrected canonical contract in `Compression Jobs Scope.md` exactly (`sourceType`/`sourceId`/`targetKey` are deliberately absent: rendering doesn't consume them, and provenance persists on the job row and the artifact path).
    * `[✅]`   Define `AssembleCompressionPromptSuccessReturn { prompt: string }`, `AssembleCompressionPromptErrorReturn { error: Error; retriable: boolean }`, `AssembleCompressionPromptReturn = SuccessReturn | ErrorReturn`.
    * `[✅]`   Define `AssembleCompressionPromptFn(deps, params, payload) => Promise<AssembleCompressionPromptReturn>` and `BoundAssembleCompressionPromptFn(params, payload) => Promise<AssembleCompressionPromptReturn>`.

  * `[✅]`   `assembleCompressionPrompt.interaction.spec` (prose; no file, matching this directory's `gatherContinuationInputs` precedent of no literal `.interaction.spec` file)
    * `[✅]`   Called by: `processCompressJob.ts` (next node) — one call per COMPRESS job; `params.consumingStep` sourced from the CONSUMING stage's recipe step row (not the COMPRESS job's own row, which has none): the caller performs the three-query lookup and narrows the resulting row (cloned-instance step row or template step row — both satisfy `CompressionTargetStep`) into the slice; `payload` built from the job's `DialecticCompressJobPayload`.
    * `[✅]`   Required interaction: exactly one `system_prompts` read; exactly one `renderPromptFn` call; no writes anywhere.
    * `[✅]`   Failure modes: template-not-found (retriable), any missing/invalid step or payload precondition (not retriable — retrying without a data/code change fails identically).

  * `[✅]`   `assembleCompressionPrompt.guard.test.ts`
    * `[✅]`   `isAssembleCompressionPromptDeps` accepts a full valid deps object; rejects missing `dbClient`, missing/non-function `renderPromptFn`, missing `logger`.
    * `[✅]`   `isAssembleCompressionPromptParams` accepts a valid `{ consumingStep }`; rejects a `consumingStep` missing `outputs_required` or `step_description` keys.
    * `[✅]`   `isAssembleCompressionPromptPayload` accepts a valid payload in both modes; rejects an invalid `mode` (via `isCompressionMode`, imported from `type_guards.file_manager.ts`), missing `content`, and a payload with only one of `chunk_index`/`chunk_total`.
    * `[✅]`   `isAssembleCompressionPromptSuccessReturn`/`isAssembleCompressionPromptErrorReturn` reject a value carrying both `prompt` and `error`.

  * `[✅]`   `assembleCompressionPrompt.guard.ts`
    * `[✅]`   Implement `isAssembleCompressionPromptDeps` using `isRecord` (`type_guards.common.ts`) then checking `dbClient` is a record, `renderPromptFn` is a function, `logger` is a record — mirroring `isEnqueueRenderJobDeps`'s structure (`enqueueRenderJob.interface.guards.ts:48-65`).
    * `[✅]`   Implement `isAssembleCompressionPromptParams` checking `consumingStep` is a record containing `outputs_required` and `step_description` keys.
    * `[✅]`   Implement `isAssembleCompressionPromptPayload` checking `mode` via `isCompressionMode` (imported, not redefined), `content` is a string, and — when either `chunk_index` or `chunk_total` is present — both are present and are numbers.
    * `[✅]`   Implement `isAssembleCompressionPromptSuccessReturn`/`isAssembleCompressionPromptErrorReturn` mirroring `isEnqueueRenderJobSuccessReturn`/`isEnqueueRenderJobErrorReturn`'s mutual-exclusion pattern (`enqueueRenderJob.interface.guards.ts:177-203`).

  * `[✅]`   `assembleCompressionPrompt.mock.ts`
    * `[✅]`   `buildCompressionTargetStep(overrides?)` — Trusted Factory producing a full valid `CompressionTargetStep` (non-empty `step_description`, non-empty `outputs_required`), overridable to `null`/empty for failure-path tests.
    * `[✅]`   `buildAssembleCompressionPromptDeps(overrides?)` — default `dbClient` from `createMockSupabaseClient` pre-seeded so the `system_prompts` lookup by `name = 'compression_context_v1'` resolves to a realistic template fixture (the actual seeded template body, not a placeholder string); default `renderPromptFn` is the REAL `renderPrompt` from `../prompt-renderer.ts` (repo-owned pure function — not mocked, per the repo's no-mock-repo-owned-functions rule already applied to `LangchainTextSplitter`); default `logger` from `_shared/logger.mock.ts`.
    * `[✅]`   `buildAssembleCompressionPromptParams(overrides?)`, `buildAssembleCompressionPromptPayload(overrides?)` (default `mode:'text'`; overridable to `mode:'json'` with a valid JSON-stringified fixture).
    * `[✅]`   `createAssembleCompressionPromptMock(options: { handler?; result? })` returning `{ assembleCompressionPrompt, calls }`, structured exactly like `createEnqueueRenderJobMock` (`enqueueRenderJob.mock.ts:23-49`).
    * `[✅]`   `buildBoundAssembleCompressionPromptFn(depsOverrides?)` — binds the REAL implementation for `processCompressJob`'s own integration test.

  * `[✅]`   `assembleCompressionPrompt.test.ts`
    * `[✅]`   Using the real implementation + real `renderPrompt` + mock `dbClient`: `mode:'json'` renders the JSON-mode block and strips text-mode; `mode:'text'` the inverse.
    * `[✅]`   `outputs_required` content actually appears (stringified) in `prompt`; `step_description` appears at the `stage_intent` position — proving injection, not just that the call succeeds.
    * `[✅]`   Chunk fields render the chunk-context block with both numbers; omitting both renders neither the block nor raw `{{chunk_index}}`/`{{chunk_total}}` tokens.
    * `[✅]`   Each precondition failure listed in the interface test produces its documented `retriable` value.
    * `[✅]`   Do NOT re-test: `renderPrompt`'s own substitution correctness (`prompt-renderer.test.ts`, already existing) or guard correctness.

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the exported function — pure over its deps/params/payload. `system_prompts` read happens before local precondition validation that doesn't gate the read itself; template-not-found short-circuits first.

  * `[✅]`   `assembleCompressionPrompt.ts` (Implementation)
    * `[✅]`   Query `deps.dbClient.from("system_prompts").select("prompt_text").eq("name", "compression_context_v1").single()`, mirroring `assembleTurnPrompt.ts`'s existing `system_prompts` lookup pattern with `name` substituted for `id`. Query error or empty `prompt_text` → `{ error: new Error(...), retriable: true }`.
    * `[✅]`   Validate `params.consumingStep.step_description` is a non-empty string; validate `params.consumingStep.outputs_required` is JSON-compatible (`isJson`, `_shared/utils/type_guards.ts`) and non-empty; validate `payload.content` is a non-empty string — each failure returns `{ error, retriable: false }`.
    * `[✅]`   If `payload.mode === 'json'`: `JSON.parse(payload.content)` in a try/catch → catch returns `{ error, retriable: false }`; the STRING `payload.content` (not the parsed value) is what gets templated.
    * `[✅]`   Validate `chunk_index`/`chunk_total`: exactly one `!== undefined` → `{ error, retriable: false }`.
    * `[✅]`   Build `dynamicContextVariables: Record<string, unknown>`: `source_content: payload.content`, `outputs_required: params.consumingStep.outputs_required`, `stage_intent: params.consumingStep.step_description`; when `mode === 'json'` set `json_mode: 'true'`, else set `text_mode: 'true'` (never both — omitting the other key strips its section per `prompt-renderer.ts:82-90`); when both chunk fields present set `chunk_context: 'true'`, `chunk_index`, `chunk_total`.
    * `[✅]`   `const prompt = deps.renderPromptFn(template.prompt_text, dynamicContextVariables, null, null);` — no overlay args (compression prompts are not stage/domain-overlaid).
    * `[✅]`   Return `{ prompt }`.

  * `[✅]`   `assembleCompressionPrompt.provides.ts`
    * `[✅]`   Re-export `assembleCompressionPrompt`, all interface types, all guards, and all mock builders.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: application/service (prompt assembly). Deps inward: Supabase adapter, `renderPrompt` (pure), logger, `CompressionMode` from `file_manager.types.ts` — no import from `dialectic-worker/`. Provides outward: consumed by the `PromptAssembler` facade (next node, as its constructor default) and, through it, by `processCompressJob.ts` (later node) — not called directly by any worker code.

  * `[✅]`   `requirements`
    * `[✅]`   Given a valid `text`-mode call, `prompt` contains the text-mode instruction and not the JSON-mode instruction; the reverse for `json`-mode.
    * `[✅]`   Given chunk fields, `prompt` contains the chunk-context sentence and both numbers; given neither, it contains neither the sentence nor a raw token.
    * `[✅]`   Every documented precondition failure returns its specific typed error — never throws, never returns a mixed shape.
    * `[✅]`   This node does not import from `dialectic-worker/`.

* `[✅]`   supabase/functions/_shared/prompt-assembler/`prompt-assembler.ts` **[BE] Wire assembleCompressionPrompt into the PromptAssembler facade as a direct method, matching the assembleSeedPrompt precedent — not a branch in the generic assemble() dispatcher**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing facade surface for compression prompts. `PromptAssembler` (`prompt-assembler.ts:41-281`) implements `IPromptAssembler` (`prompt-assembler.interface.ts:90-105`), and every existing assembler (`assembleSeedPrompt`, `assemblePlannerPrompt`, `assembleTurnPrompt`, `assembleContinuationPrompt`) has a constructor-injected fn reference, a private field, and a public facade method delegating to it — `assembleCompressionPrompt` has none of these. `IJobContext`/`IPlanJobContext` (`JobContext.interface.ts:314,343`) type their `promptAssembler` field as `IPromptAssembler`, and the single production instance is built once at the composition root (`dialectic-worker/index.ts:109`, `new PromptAssembler(adminClient, fileManager)`) and threaded through job context — so `processCompressJob.ts` (later node), which receives `ctx.promptAssembler` like every other processor, cannot call `assembleCompressionPrompt` at all until this facade exposes it.
    * `[✅]`   Functional goals:
      * `[✅]`   Add a constructor parameter `assembleCompressionPromptFn?: AssembleCompressionPromptFn` defaulted to the real `assembleCompressionPrompt` (mirroring every existing constructor param at `prompt-assembler.ts:61-64`, e.g. `assembleTurnPromptFn?: ... ; this.assembleTurnPromptFn = assembleTurnPromptFn || assembleTurnPrompt;` at lines 63/76).
      * `[✅]`   Add a private field `assembleCompressionPromptFn` and a public method `assembleCompressionPrompt(deps: AssembleCompressionPromptDeps, params: AssembleCompressionPromptParams, payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn>` that delegates to it verbatim, mirroring `assembleTurnPrompt`'s exact delegation shape (`prompt-assembler.ts:170-175`).
      * `[✅]`   Add the same method signature to `IPromptAssembler` (`prompt-assembler.interface.ts:90-105`).
      * `[✅]`   Do NOT add a branch to `assemble(options: AssemblePromptOptions)` (`prompt-assembler.ts:90-156`): its dispatch is keyed on `options.job.target_contribution_id`/`options.stage.recipe_step.job_type`, and a COMPRESS job has no stage or recipe step of its own (established in the `assembleCompressionPrompt.ts` node's own objective) — routing it through `AssemblePromptOptions` would require redefining that shape for every other job kind. `startSession.ts:349,384` already proves the alternative — calling `assembler.assembleSeedPrompt({...})` directly, bypassing `assemble()` — is a real, exercised production pattern, not a theoretical one; `assembleCompressionPrompt` follows that same direct-call precedent.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   `createJobContext.ts`, `JobContext.interface.ts`, and `index.ts` are NOT touched: `IJobContext.promptAssembler`/`IPlanJobContext.promptAssembler` are already typed as `IPromptAssembler`, and the one composition-root instance (`index.ts:109`) picks up the new method the moment the class implements it — no separate wiring edit needed anywhere downstream.
      * `[✅]`   No change to any existing constructor param's position or default — the new param is appended after the last existing one (`gatherContinuationInputsFn`, `prompt-assembler.ts:68`) so no existing call site (`new PromptAssembler(adminClient, fileManager)` at `index.ts:109`, and any equivalent in `startSession.ts`) breaks from a reordered positional argument.

  * `[✅]`   `prompt-assembler.interface.ts`
    * `[✅]`   Add `assembleCompressionPrompt(deps: AssembleCompressionPromptDeps, params: AssembleCompressionPromptParams, payload: AssembleCompressionPromptPayload): Promise<AssembleCompressionPromptReturn>;` to `IPromptAssembler` (`prompt-assembler.interface.ts:90-105`), importing the three types from `./assembleCompressionPrompt.interface.ts`.

  * `[✅]`   `prompt-assembler.interaction.spec` (prose; no file, matching this directory's established precedent)
    * `[✅]`   Called by: `processCompressJob.ts` (later node) via `ctx.promptAssembler.assembleCompressionPrompt(deps, params, payload)`, exactly as `startSession.ts` calls `assembler.assembleSeedPrompt(...)`.
    * `[✅]`   Required interaction: pure delegation — one call to the injected `assembleCompressionPromptFn`, no additional logic, no additional dependency use.
    * `[✅]`   Failure modes: none introduced by this node — whatever `assembleCompressionPrompt` itself returns passes through unchanged.

  * `[✅]`   `prompt-assembler.mock.ts`
    * `[✅]`   Extend `MockPromptAssembler` (`prompt-assembler.mock.ts:17`) with an `assembleCompressionPrompt` method, mirroring however the class currently overrides/exposes the other four assemblers for test doubles.

  * `[✅]`   `prompt-assembler.test.ts`
    * `[✅]`   Constructing `PromptAssembler` with an injected `assembleCompressionPromptFn` stub and calling `.assembleCompressionPrompt(deps, params, payload)` invokes the stub with the exact same `deps`/`params`/`payload` and returns its result unchanged (pure delegation, matching the existing `assembleTurnPrompt`/`assembleSeedPrompt` delegation tests already in this file).
    * `[✅]`   Constructing `PromptAssembler` with NO override calls the real `assembleCompressionPrompt` (proving the default wiring, matching how the existing constructor defaults are proven).
    * `[✅]`   `assemble(options)` is unmodified: existing continuation/PLAN/turn/seed routing tests in this file continue to pass unchanged, and no new test asserts a COMPRESS branch in `assemble()` (there isn't one).

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the class constructor itself. The new parameter is appended last in the parameter list; the private field assignment and default fallback follow the exact same line-order pattern as every existing assembler field in the constructor body (`prompt-assembler.ts:70-87`).

  * `[✅]`   `prompt-assembler.ts` (Implementation)
    * `[✅]`   Import `assembleCompressionPrompt` from `./assembleCompressionPrompt.ts` and its `Deps`/`Params`/`Payload`/`Return`/`Fn` types from `./assembleCompressionPrompt.interface.ts`.
    * `[✅]`   Add the constructor parameter, private field, default assignment, and public delegating method exactly as specified in `objective`/`construction` above.

  * `[✅]`   `prompt-assembler.provides.ts` — NONE. No `.provides.ts` file exists for this facade today (`PromptAssembler` and `IPromptAssembler` are imported directly from `prompt-assembler.ts`/`prompt-assembler.interface.ts` by every existing consumer, e.g. `dialectic-worker/index.ts:27`, `startSession.ts:9,14-15`); this node changes none of those import paths.

  * `[✅]`   `prompt-assembler.integration.test.ts` — NONE at this node. This is a pure delegation wire-up with no new external boundary; the real end-to-end proof (facade → `processCompressJob` → real model call) belongs to the full-chain integration test riding the `processSimpleJob` node (Sprint 5), not this one.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: application/service facade. Deps inward: `assembleCompressionPrompt.ts` (this sprint, prior node). Provides outward: `IPromptAssembler.assembleCompressionPrompt` to `processCompressJob.ts` (later node) via the existing `ctx.promptAssembler` injection path — no new injection surface required.

  * `[✅]`   `requirements`
    * `[✅]`   `IPromptAssembler` and `PromptAssembler` both expose `assembleCompressionPrompt` with an identical signature.
    * `[✅]`   Calling the facade method with no constructor override invokes the real `assembleCompressionPrompt` and returns its result unchanged.
    * `[✅]`   `assemble()`'s existing routing behavior (continuation/PLAN/turn/seed) is unmodified; no COMPRESS branch exists in it.
    * `[✅]`   `createJobContext.ts`, `JobContext.interface.ts`, and `index.ts` are unmodified by this node.

* `[✅]`   supabase/functions/dialectic-worker/enqueueModelCall/`enqueueModelCall.ts` **[BE] Accept FileType.CompressedContext as a valid output_type alongside model-contribution types, so a COMPRESS job's stream call is not rejected by the enqueue guard**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing output-type acceptance for COMPRESS jobs. `enqueueModelCall` (`enqueueModelCall.ts:21-27`) rejects any `params.output_type` that fails `isModelContributionFileType`, returning `{ error: new Error('Invalid output_type: ...'), retriable: false }`. `processCompressJob` (next node) will call this same function with `output_type: FileType.CompressedContext` — a `ResourceFileTypes` member, not a `ModelContributionFileTypes` member — and be rejected exactly like the existing "invalid output_type" test case (`enqueueModelCall.test.ts:133-156`) unless the guard is widened.
    * `[✅]`   Functional goal: widen the check at `enqueueModelCall.ts:21` from `isModelContributionFileType(params.output_type)` to `isModelContributionFileType(params.output_type) || isCompressedContextFileType(params.output_type)`, importing `isCompressedContextFileType` from `type_guards.file_manager.ts` (owned by the `path_constructor.ts` node, not defined here).
    * `[✅]`   Non-functional constraints:
      * `[✅]`   `EnqueueModelCallParams.output_type` stays typed as plain `string` (`enqueueModelCall.interface.ts:25`) — unchanged. It is already unconstrained at the type level and enforced entirely by this runtime guard; widening the guard, not the type, is the minimal correct change.
      * `[✅]`   No other line in this function changes: the DB status update, `computeJobSig`, event body construction, size check, and Netlify POST are all output-type-agnostic already and require no edits.
      * `[✅]`   `enqueueModelCall.guard.ts`'s `isEnqueueModelCallParams` (`enqueueModelCall.guard.ts:49-88`) already validates `output_type` as `typeof v.output_type !== "string"` only — it does not enumerate specific FileTypes, so it requires no change.

  * `[✅]`   `enqueueModelCall.test.ts`
    * `[✅]`   New case, modeled directly on the existing "returns retriable false when output_type is invalid" test (`enqueueModelCall.test.ts:133-156`): `output_type: FileType.CompressedContext` proceeds past the guard — asserts the function does NOT return early with the invalid-output_type error (reaches the DB update / fetch stub instead of `fetchStub.calls.length === 0`).
    * `[✅]`   Existing invalid-`output_type` test (`enqueueModelCall.test.ts:133-156`) is unmodified and continues to pass — `FileType.CompressedContext` is the ONLY newly-accepted value; an arbitrary invalid string is still rejected.

  * `[✅]`   `enqueueModelCall.ts` (Implementation)
    * `[✅]`   Add `isCompressedContextFileType` to the existing `type_guards.file_manager.ts` import (`enqueueModelCall.ts:3`).
    * `[✅]`   Change line 21's condition to `if (!isModelContributionFileType(params.output_type) && !isCompressedContextFileType(params.output_type)) { ... }`, preserving the exact same error object/logging/return shape.

  * `[✅]`   `requirements`
    * `[✅]`   `enqueueModelCall` with `output_type: FileType.CompressedContext` proceeds past the output-type guard and completes normally.
    * `[✅]`   `enqueueModelCall` with an arbitrary invalid string still returns `{ error, retriable: false }` without calling `fetch`.
    * `[✅]`   `EnqueueModelCallParams`/`EnqueueModelCallDeps`/`EnqueueModelCallPayload`/`EnqueueModelCallReturn` and `enqueueModelCall.guard.ts` are unmodified by this node.

* `[✅]`   supabase/functions/dialectic-worker/`processCompressJob.ts` **[BE] Process a COMPRESS job: validate its payload, skip if already compressed (dedup layer 2), assemble the compression prompt, enforce the recursion guard, and enqueue the stream call**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing processing step for `job_type='COMPRESS'` rows created by `enqueueCompressJobs.ts`: validate the victim, skip spending if already compressed (dedup layer 2), assemble the compression prompt via the facade, enforce the recursion guard, and enqueue the stream call.
    * `[✅]`   This is a full modern `Fn(deps, params, payload) => Promise<Return>` node, matching `enqueueCompressJobs`/`assembleCompressionPrompt` exactly — NOT the legacy `(dbClient, job, projectOwnerUserId, deps, authToken) => Promise<void>` shape `processSimpleJob`/`processComplexJob`/`processRenderJob` use. That legacy shape is not a constraint this node must satisfy: `IJobProcessors` already types each member with a DIFFERENT `deps` shape (`IJobContext`/`IPlanJobContext`/`IRenderJobContext` respectively), so there is no uniform dispatch signature to match in the first place, and `processJob.ts`'s switch (later node) is being edited to add the `COMPRESS` case regardless — its new case constructs whatever `Deps`/`Params`/`Payload` this function declares and interprets the typed `Return`, exactly as `enqueueCompressJobs.ts`'s own caller (`compressPrompt.ts`, later node) will do for it. Matching an existing sibling's incomplete legacy shape was the earlier mistake in this node; it is not repeated.
    * `[✅]`   Functional goals:
      * `[✅]`   Dedup layer 2: recompute the victim's canonical FINAL-artifact path via `deps.constructStoragePath` (the `FileType.CompressedContext` case) from `params`/`payload` fields (`projectId`, `sessionId`, `iterationNumber`, `stageSlug`, `targetKey`, `sourceType`, `documentKey`/`sourceId` — the same fields `enqueueCompressJobs`'s own dedup-layer-1 check uses) and query `dialectic_project_resources` by `(storage_path, file_name)` via `params.dbClient`. If found: mark the job row `status:'completed'` (updating `dialectic_generation_jobs` by `params.job.id`) and return `{ queued: false }` — no model call spent, mirroring `enqueueCompressJobs`'s own "success, not error" framing for its dedup layer.
      * `[✅]`   Look up the `ai_providers` row for `payload.model_id` and validate its `config` via `isAiModelExtendedConfig` — identical validation to `enqueueModelCall.ts:29-36` — for use both in the recursion-guard sizing check below and as `EnqueueModelCallParams.providerRow`. THEN validate the two config fields this function consumes, which are OPTIONAL on `AiModelExtendedConfig` (`types.ts:450-451`) and therefore not guaranteed by the guard alone: `config.provider_max_input_tokens === undefined` → `{ error, retriable: false }` (the same explicit check `compressPrompt.ts:50-56` already performs before using this field); `config.provider_max_output_tokens === undefined` → `{ error, retriable: false }`. Query failure → `{ error, retriable: true }`; invalid config or either missing field → `{ error, retriable: false }`.
      * `[✅]`   Call `deps.assembleCompressionPrompt(assembleParams, assemblePayload)` — the pre-bound facade closure (see `deps` below) — with `assemblePayload: { mode: payload.mode, content: payload.content, chunk_index: payload.chunk_index, chunk_total: payload.chunk_total }` and `assembleParams.consumingStep: CompressionTargetStep` resolved via the SAME three-query sequence `enqueueRenderJob.ts:139-209` already uses for the identical need (the COMPRESS job's own row has no recipe step of its own): `dialectic_stages` by `slug = payload.stageSlug` → `active_recipe_instance_id` (missing → non-retriable error) → `dialectic_stage_recipe_instances` by that id → branch on `instance.is_cloned`: `true` → `dialectic_stage_recipe_steps` by `instance_id`; `false` → `dialectic_recipe_template_steps` by `template_id` → find the step where `output_type === payload.targetKey` (the same `output_type` matching `enqueueRenderJob.ts:198-203` uses; no match → non-retriable error) → narrow the found row's `outputs_required`/`step_description` into the `CompressionTargetStep` slice (both branch row shapes satisfy it). A returned error becomes this function's own `{ error, retriable }` — never retried into another compression.
      * `[✅]`   Recursion guard: size the ASSEMBLED prompt — `deps.countTokens(tokenizerDeps, { message: prompt }, providerRow.config)` — against the Step-2-validated `provider_max_input_tokens` minus the same 32-token safety buffer established in `compressPrompt.ts`/`enqueueCompressJobs.ts`. The `CountTokensDeps` argument is assembled from this function's OWN flat deps — `{ getEncoding: deps.getEncoding, countTokensAnthropic: deps.countTokensAnthropic, logger: deps.logger }` — with REAL tokenizer capabilities injected by the caller (`processCompressJob.interface.ts:15-16` already declares both fields, indexed-access-typed off `CountTokensDeps`). The inline stub at `calculateAffordability.ts:33-39` is a placeholder defect in existing code, NOT precedent: its fake `getEncoding` indexes characters, so copying it would compare a character count against a token budget. If the assembled prompt STILL exceeds the budget: `{ error: new ProcessCompressJobError(...), retriable: false }` (this module's OWN error class, owned by `processCompressJob.interface.ts` — not `enqueueCompressJobs`' module errors) — this IS the recursion guard (design decision 1: "a COMPRESS call that cannot fit its model window is a hard failure, not a nested compression"). Nearly unreachable per the ratified design; a defensive assertion, not an expected branch. Retain this exact count in a local — it is passed verbatim as `EnqueueModelCallPayload.preflightInputTokens` below (it is definitionally the preflight input token count of this call; no second computation, no other source).
      * `[✅]`   Build `ChatApiRequest { message: prompt, providerId: payload.model_id, promptId: '__none__', max_tokens_to_generate: providerRow.config.provider_max_output_tokens }` (`message`/`providerId`/`promptId` are the only REQUIRED fields, `types.ts:204-207`; `promptId: '__none__'` is the documented literal for "no system_prompts template applies" — the compression prompt is already a fully-assembled instruction string) and call `deps.enqueueModelCall(enqueueParams, enqueuePayload)` with `enqueueParams { dbClient: params.dbClient, job: params.job, providerRow, userAuthToken: params.authToken, output_type: FileType.CompressedContext, userConfig: { tier_output_cap_tokens: null } }` — `job` is the FULL `DialecticJobRow` from params, which `enqueueModelCall` requires for `computeJobSig(job.id, job.user_id, job.created_at)` and its own `status:'queued'` update; `userConfig` matches the exact fixture shape at `enqueueModelCall.test.ts:149` (COMPRESS is infrastructure, not subject to user tier output caps) — and `enqueuePayload { chatApiRequest, preflightInputTokens: <the retained recursion-guard count> }`. Its return propagates: success → `{ queued: true }`; error → this function's own `{ error, retriable }`.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   On a successful `enqueueModelCall` call, this function does NOT ALSO mark the job row `status:'completed'` — `enqueueModelCall.ts:66-69` already sets `status:'queued'` internally before posting to Netlify, and actual completion happens later via the async callback path (`saveResponse.ts`, Sprint 4), exactly matching how `processSimpleJob.ts` never writes `status:'completed'` after its own enqueue (confirmed by its absence anywhere in that file).
      * `[✅]`   No notifications are sent by this node — COMPRESS is invisible infrastructure per design decision 1 and the already-written `deriveStepStatuses`/`buildJobProgressDtos` exclusions; users are never meant to see compression progress. This diverges from `processRenderJob.ts`'s `render_started`/`render_chunk_completed`/`job_failed` events, which are correct for RENDER (user-visible output) but not for COMPRESS.
      * `[✅]`   Payload is never empty and is never re-validated here: `payload: DialecticCompressJobPayload` arrives already narrowed — the CALLER (`processJob.ts`, later node) performs the `isDialecticCompressJobPayload` narrowing before invoking this function, mirroring how `processJob.ts` already gates `processSimpleJob`/`processComplexJob` behind `jobIsExecuteJob`/`jobIsPlanJob` guards today.

  * `[✅]`   `role`
    * `[✅]`   New package; full module structure applies per `workplan.instructions.md`'s new-package rule — no structural omissions modeled on an existing sibling's incomplete shape.
    * `[✅]`   Out of scope: constructing this function's `Deps`/`Params` from job-context/queue state (that is `processJob.ts`'s job, later node); DB status semantics for job KINDS other than COMPRESS; recipe-step machinery (COMPRESS has none of its own).

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/dialectic-worker/processCompressJob/` — orchestrates one COMPRESS job's dedup check, prompt assembly, recursion guard, and stream-call enqueue.

  * `[✅]`   `deps`
    * `[✅]`   `assembleCompressionPrompt: BoundAssembleCompressionPromptFn` — pre-bound closure over the facade (`(params, payload) => ctx.promptAssembler.assembleCompressionPrompt(innerDeps, params, payload)`), constructed by `processJob.ts`/`createJobContext.ts` (later nodes), mirroring how `boundEnqueueModelCall` is already constructed today (`index.ts:145-146`). Minimal DI surface: this function depends on the narrow bound closure, not the whole `IPromptAssembler` facade.
    * `[✅]`   `enqueueModelCall: BoundEnqueueModelCallFn` (already exists, `enqueueModelCall.interface.ts:67-70`).
    * `[✅]`   `countTokens: CountTokensFn` (`tokenizer.types.ts`).
    * `[✅]`   `getEncoding: CountTokensDeps["getEncoding"]` and `countTokensAnthropic: CountTokensDeps["countTokensAnthropic"]` — two FLAT dep fields, indexed-access-typed off the canonical `CountTokensDeps` (`tokenizer.types.ts`) so they cannot drift from the tokenizer contract; NOT a nested `tokenizerDeps` bundle (every Deps interface in this epic is flat, and a bundle would carry a second `logger` alongside `deps.logger`). The function assembles the `CountTokensDeps` argument for `deps.countTokens` as `{ getEncoding: deps.getEncoding, countTokensAnthropic: deps.countTokensAnthropic, logger: deps.logger }`. The caller supplies REAL implementations: `getEncoding` wrapping `npm:js-tiktoken@1.0.7`'s real `getEncoding` (the `TiktokenEncoding` narrowing pattern of `tokenEstimator/index.ts:31-53`, adapted to return `{ encode: (input: string) => number[] }`), `countTokensAnthropic` from `npm:@anthropic-ai/tokenizer@0.0.4`'s `countTokens`. The inline stub at `calculateAffordability.ts:33-39` (character-indexing fake `getEncoding`, `text.length` fake Anthropic counter) is NOT precedent — it is a placeholder defect in existing code; copying it would make the recursion guard compare a CHARACTER count against a TOKEN budget for every tiktoken/anthropic-strategy model, hard-failing jobs that fit and shipping a wrong `preflightInputTokens`.
    * `[✅]`   `constructStoragePath: ConstructStoragePathFn` (`path_constructor.types.ts`) — same non-DI-eligible-but-still-injected treatment already established for it in the `enqueueCompressJobs.ts` node (pure utility, injected for test substitutability, no mock needed since it's deterministic).
    * `[✅]`   `logger: ILogger`.
    * `[✅]`   Confirm: no reverse dependency; no lateral violation.

  * `[✅]`   `processCompressJob.interface.test.ts`
    * `[✅]`   Imports ONLY `assertEquals` and this node's own exports from `./processCompressJob.interface.ts` — no `.guard.ts` import, no `isProcessCompressJobDeps`/`Params`/`Payload`/`Return` calls (those belong to `processCompressJob.guard.test.ts`), no `SupabaseClient`/`Database`/`BoundAssembleCompressionPromptFn`/`BoundEnqueueModelCallFn` imports; each is referenced via `keyof`/indexed access on this file's own exported types, matching the `enqueueModelCall.interface.test.ts` shape-testing style.
    * `[✅]`   `Record<keyof ProcessCompressJobDeps, true>` surface check declares exactly `assembleCompressionPrompt`/`enqueueModelCall`/`countTokens`/`getEncoding`/`countTokensAnthropic`/`constructStoragePath`/`logger` (7 keys).
    * `[✅]`   `Record<keyof ProcessCompressJobParams, true>` surface check declares exactly `dbClient`/`job`/`projectOwnerUserId`/`authToken` (4 keys).
    * `[✅]`   `ProcessCompressJobPayload` (the `DialecticCompressJobPayload` alias) type-checks using only this file's own re-exported type — no re-import from `enqueueCompressJobs.interface.ts`.
    * `[✅]`   `ProcessCompressJobSuccessReturn { queued: boolean }` and `ProcessCompressJobErrorReturn { error: Error; retriable: boolean }` each type-check individually; a `ProcessCompressJobReturn`-typed value constructed from each is assignable, proving the union.
    * `[✅]`   `ProcessCompressJobFn`/`BoundProcessCompressJobFn` signature check: a locally-declared stub function assignable to each type.

  * `[✅]`   `processCompressJob.interface.ts`
    * `[✅]`   Define `ProcessCompressJobDeps { assembleCompressionPrompt: BoundAssembleCompressionPromptFn; enqueueModelCall: BoundEnqueueModelCallFn; countTokens: CountTokensFn; getEncoding: CountTokensDeps["getEncoding"]; countTokensAnthropic: CountTokensDeps["countTokensAnthropic"]; constructStoragePath: ConstructStoragePathFn; logger: ILogger }` — the two tokenizer fields indexed-access-typed off `CountTokensDeps` (`tokenizer.types.ts`), flat, not a nested bundle.
    * `[✅]`   Define `ProcessCompressJobParams { dbClient: SupabaseClient<Database>; job: DialecticJobRow; projectOwnerUserId: string; authToken: string }` — the FULL job row, not a bare id: the caller (`processJob.ts`) already holds the row from queue dispatch, and `EnqueueModelCallParams.job` requires it (`enqueueModelCall.interface.ts:22`) for `computeJobSig(job.id, job.user_id, job.created_at)` and its internal `status:'queued'` update; re-fetching a row the caller possesses would be a second read plus a can't-happen failure branch. The dedup-hit status write also keys on `params.job.id`. This function never reads `dialectic_generation_jobs`.
    * `[✅]`   Define `ProcessCompressJobPayload = DialecticCompressJobPayload` (imported from the `enqueueCompressJobs` module — not redefined).
    * `[✅]`   Define `export class ProcessCompressJobError extends Error` (constructor sets `this.name = "ProcessCompressJobError"`), mirroring the module-owned error pattern `enqueueCompressJobs.interface.ts:64-76` established — this module's OWN failure constructions (dedup-query failure, provider lookup/config, step lookup/narrowing, recursion guard, caught utility throws) use this class; errors PROPAGATED from `assembleCompressionPrompt`/`enqueueModelCall` pass through unwrapped in their original classes. No import from `_shared/utils/errors.ts` (the CompressJob error classes do not live there) and no import of a sibling module's error classes.
    * `[✅]`   Define `ProcessCompressJobSuccessReturn { queued: boolean }` (`false` = dedup hit, nothing spent; `true` = model call enqueued), `ProcessCompressJobErrorReturn { error: Error; retriable: boolean }` (`Error`-typed because it carries both this module's `ProcessCompressJobError` and pass-through sibling errors), `ProcessCompressJobReturn = SuccessReturn | ErrorReturn`.
    * `[✅]`   Define `ProcessCompressJobFn(deps, params, payload) => Promise<ProcessCompressJobReturn>` and `BoundProcessCompressJobFn(params, payload) => Promise<ProcessCompressJobReturn>`.

  * `[✅]`   `processCompressJob.interaction.spec` (prose; no file, matching this directory's established precedent)
    * `[✅]`   Called by: `processJob.ts`'s `COMPRESS` case (later node), after narrowing `job.payload` via `isDialecticCompressJobPayload` and constructing `Deps`/`Params` from job context.
    * `[✅]`   Required interactions: one dedup-existence read; on a miss, one `ai_providers` read, the three-query consuming-step lookup (`dialectic_stages` → `dialectic_stage_recipe_instances` → `dialectic_stage_recipe_steps` OR `dialectic_recipe_template_steps` per `is_cloned`), one `assembleCompressionPrompt` call, one `enqueueModelCall` call; on a hit, one `dialectic_generation_jobs` status write and nothing else. Never a `dialectic_generation_jobs` read — the job row arrives in `params.job`.
    * `[✅]`   Failure modes: dedup-query failure (retriable), provider-lookup/invalid-config (query failure retriable, invalid config not), consuming-step lookup (query failure retriable; missing stage/instance/step or no `output_type === targetKey` match not retriable), assembly failure (as returned), recursion-guard budget failure (not retriable), enqueue failure (as returned).

  * `[✅]`   `processCompressJob.guard.test.ts` / `processCompressJob.guard.ts`
    * `[✅]`   `isProcessCompressJobDeps`/`Params`/`Payload`/`SuccessReturn`/`ErrorReturn`, structured exactly like `enqueueCompressJobs`'s own guard file (required-key presence, then per-field checks; mutual exclusion for the two Return variants).

  * `[✅]`   `processCompressJob.mock.ts`
    * `[✅]`   Trusted Factories: `buildProcessCompressJobDeps(overrides?)` (default `assembleCompressionPrompt`/`enqueueModelCall` from their own mock factories, `constructStoragePath` real, `countTokens` a simple deterministic stub, `getEncoding`/`countTokensAnthropic` deterministic function stubs satisfying `CountTokensDeps["getEncoding"]`/`["countTokensAnthropic"]` — present-and-callable is what the deps guard checks; the stubbed `countTokens` is what unit tests actually count with, and the REAL tokenizer pair is exercised in `processCompressJob.integration.test.ts`), `buildProcessCompressJobParams(overrides?)` (default `job` a full valid `DialecticJobRow` with `job_type:'COMPRESS'` — a complete row, no partials), `buildDialecticCompressJobPayload(overrides?)` (reuse/extend the one already defined in `enqueueCompressJobs.mock.ts` rather than duplicating).

  * `[✅]`   `processCompressJob.test.ts`
    * `[✅]`   Mock DB configuration per scenario uses `createMockSupabaseClient` `genericMockResults` for exactly the tables the interaction spec names: `dialectic_project_resources` (dedup read), `ai_providers` (provider `.single()`), `dialectic_stages`/`dialectic_stage_recipe_instances`/`dialectic_stage_recipe_steps` or `dialectic_recipe_template_steps` (consuming-step lookup), `dialectic_generation_jobs` (dedup-hit status write only).
    * `[✅]`   Dedup hit (`dialectic_project_resources` select returns a row) → `dialectic_generation_jobs` update called with `status:'completed'` and `.eq('id', params.job.id)`; `{ queued: false }`; `assembleCompressionPrompt`/`enqueueModelCall` never called; `ai_providers` and the step-lookup tables never queried.
    * `[✅]`   `ai_providers` lookup failure → `{ error, retriable: true }`; invalid `config` → `{ error, retriable: false }`; a config missing `provider_max_input_tokens` or missing `provider_max_output_tokens` (otherwise valid) → `{ error, retriable: false }`; no step lookup, no assembler/enqueue call in any of these cases.
    * `[✅]`   Consuming-step lookup: `dialectic_stages` row missing `active_recipe_instance_id` → `{ error, retriable: false }`; no step matching `output_type === payload.targetKey` → `{ error, retriable: false }`; both with no assembler/enqueue call.
    * `[✅]`   Consuming-step lookup happy variants: `is_cloned: true` resolves the step from `dialectic_stage_recipe_steps`; `is_cloned: false` resolves it from `dialectic_recipe_template_steps` — in both, `assembleCompressionPrompt` receives a `consumingStep` whose `outputs_required`/`step_description` equal the mocked step row's values.
    * `[✅]`   `assembleCompressionPrompt` returns an error → that error propagates as this function's own `{ error, retriable }`; `enqueueModelCall` never called.
    * `[✅]`   Assembled prompt exceeds the budget (`countTokens` stub returns an over-budget count) → `{ error, retriable: false }`; `enqueueModelCall` never called; no `dialectic_generation_jobs` insert of any kind (proves no nested compression).
    * `[✅]`   Happy path: dedup miss, valid provider, successful assembly, prompt within budget → `enqueueModelCall` called once with `enqueueParams.job` reference-equal to `params.job`, `output_type: FileType.CompressedContext`, `chatApiRequest.message` equal to the assembled prompt, and `enqueuePayload.preflightInputTokens` equal to the `countTokens` stub's returned count; `{ queued: true }`; no `dialectic_generation_jobs` update to `'completed'` by this function.
    * `[✅]`   No notification-service calls on any path.

  * `[✅]`   `construction`
    * `[✅]`   No factory beyond the exported function. Dedup check → provider lookup/validation → consuming-step lookup (three-query sequence) → assemble prompt → recursion-guard size check (count retained for `preflightInputTokens`) → build `ChatApiRequest` → `enqueueModelCall` — no DB write happens before the dedup check resolves.

  * `[✅]`   `processCompressJob.ts` (Implementation)
    * `[✅]`   Imports: `FileType` from `_shared/types/file_manager.types.ts`; `isAiModelExtendedConfig` from `type_guards.chat.ts`; `isRecord`/`isJson` from `type_guards.common.ts`; `CompressionTargetStep` from `assembleCompressionPrompt.interface.ts`; `ChatApiRequest` from `_shared/types.ts`; this node's own interface types including `ProcessCompressJobError` (owned by `processCompressJob.interface.ts` — NOT `_shared/utils/errors.ts`, which contains no CompressJob error classes, and NOT `enqueueCompressJobs.interface.ts`, whose error classes belong to that module's own return union). No other imports.
    * `[✅]`   The function NEVER throws past its boundary: every failure path returns the typed `ProcessCompressJobErrorReturn`; a throw from a called utility (e.g. `deps.constructStoragePath` on an identity defect) is caught and returned as `{ error, retriable: false }` — a validated payload makes that a programmer error, not a runtime branch.
    * `[✅]`   Step 1 — dedup layer 2: build `PathContext { projectId: payload.projectId, fileType: FileType.CompressedContext, sessionId: payload.sessionId, iteration: payload.iterationNumber, stageSlug: payload.stageSlug, targetKey: payload.targetKey, sourceType: payload.sourceType, documentKey: payload.documentKey, sourceId: payload.sourceId }` (no chunk fields — the FINAL artifact) → `deps.constructStoragePath` → `params.dbClient.from('dialectic_project_resources').select('id').eq('storage_path', storagePath).eq('file_name', fileName).maybeSingle()`. Query error → `{ error, retriable: true }`. Row found → `params.dbClient.from('dialectic_generation_jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', params.job.id)` (update error → `{ error, retriable: true }`) → return `{ queued: false }`.
    * `[✅]`   Step 2 — provider: `.from('ai_providers').select('*').eq('id', payload.model_id).single()`. Error/no row → `{ error, retriable: true }`; `!isAiModelExtendedConfig(row.config)` → `{ error, retriable: false }`. Then bind the two consumed fields, both OPTIONAL on `AiModelExtendedConfig` (`types.ts:450-451`): `if (config.provider_max_input_tokens === undefined)` → `{ error, retriable: false }` (mirrors `compressPrompt.ts:50-56`); `if (config.provider_max_output_tokens === undefined)` → `{ error, retriable: false }`; `const maxInputTokens: number = config.provider_max_input_tokens; const maxOutputTokens: number = config.provider_max_output_tokens;` — Steps 5–6 use ONLY these validated locals.
    * `[✅]`   Step 3 — consuming step: the three-query sequence exactly as specified in the functional goals (stages → instance → `is_cloned`-branched steps read → find `output_type === payload.targetKey`); each query error → `{ error, retriable: true }`; missing `active_recipe_instance_id`/instance/steps/matching step → `{ error, retriable: false }`. Narrow the found row: `isJson(row.outputs_required)` + non-empty record, `step_description` string-or-null → `const consumingStep: CompressionTargetStep = { outputs_required, step_description }`; narrowing failure → `{ error, retriable: false }`.
    * `[✅]`   Step 4 — assemble: `const assembled = await deps.assembleCompressionPrompt({ consumingStep }, { mode: payload.mode, content: payload.content, chunk_index: payload.chunk_index, chunk_total: payload.chunk_total });` — `'error' in assembled` → return `{ error: assembled.error, retriable: assembled.retriable }`.
    * `[✅]`   Step 5 — recursion guard: `const tokenizerDeps: CountTokensDeps = { getEncoding: deps.getEncoding, countTokensAnthropic: deps.countTokensAnthropic, logger: deps.logger };` (assembled from this function's own flat deps — REAL tokenizer capabilities injected by the caller; NEVER the `calculateAffordability.ts:33-39` character-count stub); `const preflightInputTokens = deps.countTokens(tokenizerDeps, { message: assembled.prompt }, providerConfig);` `if (preflightInputTokens > maxInputTokens - 32)` (the Step-2 validated local) → return `{ error: new ProcessCompressJobError(<message naming the count and the budget>), retriable: false }`.
    * `[✅]`   Step 6 — enqueue: `const chatApiRequest: ChatApiRequest = { message: assembled.prompt, providerId: payload.model_id, promptId: '__none__', max_tokens_to_generate: maxOutputTokens };` (the Step-2 validated local) → `const enqueued = await deps.enqueueModelCall({ dbClient: params.dbClient, job: params.job, providerRow, userAuthToken: params.authToken, output_type: FileType.CompressedContext, userConfig: { tier_output_cap_tokens: null } }, { chatApiRequest, preflightInputTokens });` — `'error' in enqueued` → return `{ error: enqueued.error, retriable: enqueued.retriable }`; else return `{ queued: true }`.
    * `[✅]`   Must not: call any notification service; read `dialectic_generation_jobs`; write any job status other than Step 1's dedup-hit `completed` update; re-validate `payload` (arrives narrowed by the caller); compute a second token count for `preflightInputTokens` (Step 5's count is the only source).
    * `[✅]`   Each Step above maps 1:1 to a `processCompressJob.test.ts` scenario (dedup hit; provider failure/invalid config; step-lookup failures and both `is_cloned` happy variants; assembly error; recursion guard; happy path).

  * `[✅]`   `processCompressJob.provides.ts`
    * `[✅]`   Re-export `processCompressJob`, all interface types, all guards, all mock builders.

  * `[✅]`   `processCompressJob.integration.test.ts`
    * `[✅]`   Purpose and boundary: prove the ENTIRE call stack written since the Sprint-2 commit integrates, producer to sink — real `enqueueCompressJobs` spawns the COMPRESS child row(s), and the CAPTURED inserted row's payload (NEVER a hand-built payload fixture: hand-building proves each module agrees with the spec's prose, not that the modules agree with each other) is what real `processCompressJob` consumes, through the real assembler and the real `enqueueModelCall` to the captured Netlify POST. The queue hop between insert and process is simulated by carrying the captured row across — exactly what the dispatcher will do. NOT in this boundary: `processJob` dispatch and the `dialectic.interface.ts` union extension (later nodes).
    * `[✅]`   Bounded subsystem — real internals: real `enqueueCompressJobs` (real `LangchainTextSplitter`, real `constructStoragePath`, real `countTokens` with the real tokenizer pair); real `processCompressJob`; `deps.assembleCompressionPrompt` from `buildBoundAssembleCompressionPromptFn` (`assembleCompressionPrompt.mock.ts` — binds the REAL implementation with the REAL `renderPrompt`; a real `PromptAssembler` instance is NOT constructed: the facade method is pure delegation already proven in `prompt-assembler.test.ts`, and the class constructor throws without `SB_CONTENT_STORAGE_BUCKET`, `prompt-assembler.ts:83-87`); real `constructStoragePath`; real `countTokens` with REAL `deps.getEncoding`/`deps.countTokensAnthropic` (js-tiktoken/@anthropic-ai, per this node's deps).
    * `[✅]`   Mocked boundary — stated completely: the shared mock Supabase client (seeded per scenario: `dialectic_project_resources` empty for the dedup miss; `dialectic_generation_jobs` insert capture for the spawn step and update permitted for `enqueueModelCall`'s internal `status:'queued'` write; `ai_providers` row whose config carries valid `provider_max_input_tokens`/`provider_max_output_tokens` and a tiktoken-strategy tokenization; `dialectic_stages`/`dialectic_stage_recipe_instances`/step rows; a `system_prompts` row whose `prompt_text` is the EXACT Sprint-1 migration template body, not a paraphrase); a stubbed global `fetch` for the Netlify POST; `mockComputeJobSig` and a test `apiKeyForProvider` returning a fixed key — the same boundary `enqueueModelCall.integration.test.ts` already establishes for running the REAL `enqueueModelCall`.
    * `[✅]`   `deps.enqueueModelCall` is a CAPTURING bound closure: it records each `(params, payload)` invocation, then delegates to the REAL `enqueueModelCall` built over the mocked boundary above. The capture is REQUIRED, not a convenience: `enqueueModelCall` never serializes `preflightInputTokens` into the posted event body (`enqueueModelCall.ts:79-91` — `eventData` carries `job_id`/`api_identifier`/`model_config`/`chat_api_request`/`sig`/`user_config` only), so the field is unobservable through the fetch stub alone.
    * `[✅]`   Spawn→process seam (dedup miss, unchunked json victim): real `enqueueCompressJobs` called with a contribution victim under budget → exactly one captured `dialectic_generation_jobs` insert whose `payload` passes the REAL `isDialecticCompressJobPayload`; THAT captured payload (plus a job row carrying it) is fed to real `processCompressJob` → the captured `payload.chatApiRequest.message` contains the victim `content` AND the stringified `outputs_required` from the seeded step row (real template, really rendered, json-mode instruction text present, text-mode absent); the captured `payload.preflightInputTokens` equals an independently computed `countTokens({ getEncoding, countTokensAnthropic, logger }, { message: <captured prompt> }, config)` using the SAME real tokenizer pair; the captured `params.job` is reference-equal to the fed job row and `params.output_type` is `FileType.CompressedContext`; the fetch stub's posted body's `chat_api_request.message` equals the captured prompt (proving the real `enqueueModelCall` ran end-to-end behind the capture); the function returns `{ queued: true }`.
    * `[✅]`   Dedup coherence across layers (the three-layer design's core claim, provable only in this seam test): ONE seeded `dialectic_project_resources` row at EXACTLY the path the real `constructStoragePath` yields for the victim's FINAL artifact satisfies BOTH layers — layer 1: `enqueueCompressJobs` returns `{ createdCount: 0 }` with no insert; layer 2: `processCompressJob` given the same identity returns `{ queued: false }`, marks the job `completed`, and never calls the assembler or posts to Netlify. The single shared row proves both layers derive the identical canonical path from the same identity.
    * `[✅]`   Chunked seam (map-reduce): an over-budget victim → the real splitter yields N>1 captured chunk rows (every one `mode:'text'` even though the victim was json; `chunk_index` 1-based and dense through `chunk_total`); ONE captured chunk payload fed through the full stack produces a posted prompt containing the chunk-context instruction text with that chunk's real `chunk_index`/`chunk_total` values substituted.
    * `[✅]`   Both `is_cloned` branches, through the full chain: two scenarios differing ONLY in the seeded `dialectic_stage_recipe_instances.is_cloned` value and which steps table carries the matching row (`dialectic_stage_recipe_steps` vs `dialectic_recipe_template_steps`); each runs spawn→process→POST and produces a rendered prompt containing that scenario's seeded `outputs_required`/`step_description` values.

  * `[✅]`   `directionality`
    * `[✅]`   Layer: worker orchestration (per-job processing). Deps inward: `assembleCompressionPrompt.ts` (via the facade), `enqueueModelCall.ts`, `path_constructor.ts`, `tokenizer.types.ts` — all prior nodes. Provides outward: consumed by `processJob.ts`'s `COMPRESS` case (later node), which constructs this function's `Deps`/`Params` from job context and interprets its `Return`.

  * `[✅]`   `requirements`
    * `[✅]`   A COMPRESS job whose artifact already exists returns `{ queued: false }` with zero model-call spend.
    * `[✅]`   A COMPRESS job whose assembled prompt exceeds the model's window returns a non-retriable error and spawns no nested job of any kind.
    * `[✅]`   A successful run calls `enqueueModelCall` with `output_type: FileType.CompressedContext`, `enqueueParams.job === params.job`, and `preflightInputTokens` equal to the recursion-guard `countTokens` count, and returns `{ queued: true }`; this function does not independently mark the job `completed`.
    * `[✅]`   This function never reads `dialectic_generation_jobs` — the job row arrives via `params.job`.
    * `[✅]`   No notification events are sent by this node.

* `[ ]`   supabase/functions/dialectic-worker/createJobContext/`createJobContext.ts` **[BE] Thread a pre-bound enqueueModelCall closure through IJobContext/JobContextParams so processJob.ts can hand processCompressJob a working ProcessCompressJobDeps, and widen BuildUploadContextFn to admit ResourceUploadContext for its future WS-B resource-artifact consumer**

  * `[✅]`   `objective`
    * `[✅]`   Solve the missing composition-root wiring `processJob.ts`'s COMPRESS case (next node) needs. `ProcessCompressJobDeps` (already defined by the `processCompressJob.ts` node, `Compression Jobs.md:622-628`) requires a real `enqueueModelCall: BoundEnqueueModelCallFn`. Today the only place a working `BoundEnqueueModelCallFn` is ever constructed is the single inline closure at `index.ts:145-150` (`boundEnqueueModelCall`), which closes over `netlifyQueueUrl`/`netlifyApiKey`/`apiKeyForProvider`/`computeJobSig` — none of which are reachable from `processJob.ts`, and `IJobContext` (`JobContext.interface.ts:290-321`) has no `enqueueModelCall` field today. Without this node, `processJob.ts` cannot produce a real `ProcessCompressJobDeps` at all. (This dependency was originally mis-sequenced: the ratified Scope listed `createJobContext` after `processJob`/`deriveStepStatuses`/`buildJobProgressDtos`; it has been corrected to land immediately after `processCompressJob` and before `processJob`, since `processJob` is the consumer and `deriveStepStatuses`/`buildJobProgressDtos` have no dependency on this node either way.)
    * `[✅]`   Functional goals:
      * `[✅]`   Add `readonly enqueueModelCall: BoundEnqueueModelCallFn;` to `IJobContext` (`JobContext.interface.ts:290-321`) and to `JobContextParams` (`JobContext.interface.ts:328-368`) — `BoundEnqueueModelCallFn` is already imported at `JobContext.interface.ts:45` (used today only by `IPrepareModelJobContext.enqueueModelCall`), so no new import is needed for this half of the change.
      * `[✅]`   Widen `BuildUploadContextFn`'s return type (`JobContext.interface.ts:148-150`) from `ModelContributionUploadContext` to `ModelContributionUploadContext | ResourceUploadContext`, adding `ResourceUploadContext` to the existing `file_manager.types.ts` import at `JobContext.interface.ts:4` (currently imports only `IFileManager, ModelContributionUploadContext` from that module). This is a type-only widening: `buildUploadContext.ts`'s own implementation and `BuildUploadContextParams` are unchanged by this node (they stay contribution-only) — the union only exists so a future resource-producing caller can be typed against the same field without changing its declared shape twice. The widening is compile-safe today: `uploadAndRegisterFile` already accepts `ResourceUploadContext` as part of `UploadContext` (`file_manager.types.ts:255`, `:263`), and no existing caller's usage of `buildUploadContext`'s current (contribution-only) return value changes.
      * `[✅]`   `createJobContext()`'s factory body (`createJobContext.ts:25-83`) copies `params.enqueueModelCall` into the constructed `IJobContext` object, alongside the existing `gatherArtifacts`/`prepareModelJob` copy lines.
    * `[✅]`   Non-functional constraints:
      * `[✅]`   `createPrepareModelJobContext` (`createJobContext.ts:98-141`) is UNCHANGED: it already receives its own `boundEnqueueModelCall` as an explicit constructor-style argument from its own caller, independent of whether `IJobContext` carries a root-level `enqueueModelCall` field — this node does not rewire that slicer to source from `root.enqueueModelCall` instead, since the scope names only two changes for this node (thread the field; widen `BuildUploadContextFn`) and rewiring the slicer is not one of them.
      * `[✅]`   `createPlanJobContext`, `createRenderJobContext`, `createSaveResponseContext` (`createJobContext.ts:150-209`) are UNCHANGED — none of those slices include `enqueueModelCall` or `buildUploadContext` today and none gain them here.
      * `[✅]`   `index.ts` is NOT touched by this node: `createDialecticWorkerDeps`'s call to `createJobContext({...})` (`index.ts:152-223`) does not yet pass `enqueueModelCall`, so the repo is transiently non-compilable between this node and the later `index.ts` node — permitted within a sprint per NODE & SPRINT RULES, resolved by that later node in the same Sprint 3 commit.
      * `[✅]`   No other `IJobContext`/`JobContextParams` field changes; no behavior change to any existing field.

  * `[✅]`   `role`
    * `[✅]`   Composition-root plumbing: this node is the ONLY place `IJobContext` gains a new field this sprint. Out of scope: constructing `ProcessCompressJobDeps` itself (that is `processJob.ts`, next node); wiring `boundEnqueueModelCall` into `createJobContext(...)`'s call site (that is the `index.ts` node, last in this sprint); any change to `buildUploadContext.ts`'s implementation or `BuildUploadContextParams` (unchanged — WS-B's resource-arm consumer is out of scope here).

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `supabase/functions/dialectic-worker/createJobContext/` — the root `IJobContext`/`JobContextParams` type definitions, the `createJobContext` factory, its slicers, and their guard/mock/test support.
    * `[✅]`   Inside boundary: the new `enqueueModelCall` field on `IJobContext`/`JobContextParams`; the widened `BuildUploadContextFn` return type; the factory's copy of the new field; guard/mock/test updates for both.
    * `[✅]`   Outside boundary: `enqueueModelCall.ts`'s own implementation (Sprint-3, already-written node); `processCompressJob.ts`'s own deps shape (already-written node, unchanged by this node); `index.ts`'s wiring (later node).

  * `[✅]`   `deps`
    * `[✅]`   `BoundEnqueueModelCallFn` (`enqueueModelCall.interface.ts`, already-written Sprint-3 node) — already imported by `JobContext.interface.ts`; no new import.
    * `[✅]`   `ResourceUploadContext` (`file_manager.types.ts:255`, Sprint-2 owner) — new import added to `JobContext.interface.ts`'s existing `file_manager.types.ts` import.
    * `[✅]`   Confirm: no reverse dependency (this node does not import from `processJob.ts`/`processCompressJob.ts`); no lateral violation.

  * `[ ]`   `JobContext.guard.test.ts`
    * `[ ]`   `isIJobContext` returns `true` for a fully-valid context including a real `enqueueModelCall` function (covered by extending the existing top-of-describe valid-context fixture at `JobContext.guard.test.ts:337-341` to include `enqueueModelCall`, mirroring how `computeJobSig`/`getMaxOutputTokens`/`debitTokens` are already included there).
    * `[ ]`   `isIJobContext` returns `false` when `enqueueModelCall` is absent from an otherwise-valid context — new test mirroring the existing missing-field pattern at `JobContext.guard.test.ts:344-398` (build the valid context, delete the one field, assert `false`).
    * `[ ]`   `isIJobContext` returns `false` when `enqueueModelCall` is present but not a function (e.g. `undefined`/a non-function value), matching the same type-check style already used for `debitTokens`/`resolveFinishReason` in that describe block.

  * `[ ]`   `JobContext.guard.ts`
    * `[ ]`   Add `'enqueueModelCall' in value && typeof value.enqueueModelCall === 'function' &&` to `isIJobContext`'s conjunction (`JobContext.guard.ts:147-179`), placed alongside the existing `'prepareModelJob' in value && typeof value.prepareModelJob === 'function'` check.
    * `[ ]`   No other guard function changes: `isIPrepareModelJobContext` already checks its OWN `enqueueModelCall` field independently (`JobContext.guard.ts:96-111`) and is unrelated to this change; `isIPlanJobContext`/`isIRenderJobContext`/`isISaveResponseContext` are untouched.

  * `[ ]`   `JobContext.mock.ts`
    * `[ ]`   `createMockJobContextParams()` (`JobContext.mock.ts:160-259`): add `enqueueModelCall: createMockBoundEnqueueModelCall(),` to `baseParams`, reusing the mock factory that already exists at `JobContext.mock.ts:66-71` (today only consumed by `buildIPrepareModelJobContext`) — no new mock function is defined.
    * `[ ]`   `buildIJobContext()` (`JobContext.mock.ts:265-304`): add `enqueueModelCall: params.enqueueModelCall,` to the returned object, alongside the existing `gatherArtifacts: params.gatherArtifacts,` line.
    * `[ ]`   `buildIPrepareModelJobContext` (`JobContext.mock.ts:339-353`) is UNCHANGED — it already supplies its own `enqueueModelCall: createMockBoundEnqueueModelCall()` independent of the root context.

  * `[ ]`   `createJobContext.interface.test.ts`
    * `[ ]`   The `'JobContextParams and IJobContext'` describe block (`createJobContext.interface.test.ts:207-339+`): add `enqueueModelCall: enqueueModelCall,` (a locally-declared `BoundEnqueueModelCallFn` stub, matching the existing `IPrepareModelJobContext` test's stub pattern at lines 150-153) to the `params: JobContextParams` object literal, and `enqueueModelCall: params.enqueueModelCall,` to the mapped `job: IJobContext` object literal; assert `typeof job.enqueueModelCall === 'function'` and `job.enqueueModelCall === params.enqueueModelCall` (reference equality, matching how every other field in that test is asserted to flow through unchanged).
    * `[ ]`   No change to the `'IPrepareModelJobContext'` describe block (`createJobContext.interface.test.ts:145-174`) — its `enqueueModelCall` usage is already correct and unrelated to the new root-level field.

  * `[ ]`   `createJobContext.test.ts`
    * `[ ]`   New test: `createJobContext(params)` with a real/stub `enqueueModelCall` in `params` returns an `IJobContext` whose `.enqueueModelCall` is reference-equal to `params.enqueueModelCall` — mirroring the existing pattern for `gatherArtifacts`/`prepareModelJob` pass-through assertions already in this file (per `createJobContext.test.ts:66-117`'s established style of asserting `isIJobContext(result)` and specific field identity).
    * `[ ]`   `isIJobContext(createJobContext(createMockJobContextParams()))` is `true` (updated fixture from the `JobContext.mock.ts` change above flows through automatically — no new fixture-construction code needed in this file).
    * `[ ]`   Existing tests in this file (including the `createPrepareModelJobContext`/`createPlanJobContext`/`createRenderJobContext`/`createSaveResponseContext` describe blocks) continue to pass unmodified — none of those slicers changed.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond `createJobContext(params)` itself. The new field is copied in the same flat object-literal style as every existing field — no conditional logic, no default fallback (matching `JobContextParams`'s "all fields required" contract stated in its own doc comment, `JobContext.interface.ts:324-327`).

  * `[ ]`   `createJobContext.ts` (Implementation)
    * `[ ]`   Add `enqueueModelCall: params.enqueueModelCall,` to the object returned by `createJobContext()` (`createJobContext.ts:25-83`), placed alongside the existing `gatherArtifacts: params.gatherArtifacts,` line.
    * `[ ]`   No change to `createPrepareModelJobContext`, `createPlanJobContext`, `createRenderJobContext`, or `createSaveResponseContext`.

  * `[ ]`   `createJobContext.integration.test.ts`
    * `[ ]`   No new integration test at this node: the real end-to-end proof that `ctx.enqueueModelCall` reaches a COMPRESS job and completes a real Netlify enqueue belongs to the full-chain integration test riding the `processSimpleJob` node (Sprint 5, per the Scope's WS-D description), not this composition-root plumbing node. Existing integration tests in this file (the `IPrepareModelJobContext`/Phase-1-chain scenarios at `createJobContext.integration.test.ts:88-354`) are unmodified — they already construct their own `boundEnqueueModelCall` independent of the root context and are unaffected by the new `IJobContext.enqueueModelCall` field.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: composition-root plumbing (application boundary). Deps inward: `enqueueModelCall.interface.ts` (already-written Sprint-3 node), `file_manager.types.ts` (Sprint-2 owner) — no new lateral or reverse dependency. Provides outward: `IJobContext.enqueueModelCall` to `processJob.ts` (next node), which reads it to construct `ProcessCompressJobDeps` for `processors.processCompressJob(...)`; the widened `BuildUploadContextFn` to `saveResponse.ts`'s future resource-artifact path (WS-B, Sprint 4).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `IJobContext` and `JobContextParams` both declare `enqueueModelCall: BoundEnqueueModelCallFn`.
    * `[ ]`   `createJobContext(params).enqueueModelCall === params.enqueueModelCall` for any valid `params`.
    * `[ ]`   `isIJobContext` returns `false` for an otherwise-valid context missing `enqueueModelCall`, and `true` once it is present as a function.
    * `[ ]`   `BuildUploadContextFn`'s declared return type is `ModelContributionUploadContext | ResourceUploadContext`; `buildUploadContext.ts`'s implementation and `BuildUploadContextParams` are unchanged.
    * `[ ]`   `createPrepareModelJobContext`, `createPlanJobContext`, `createRenderJobContext`, `createSaveResponseContext`, and every existing test in `JobContext.guard.test.ts`, `createJobContext.test.ts`, `createJobContext.interface.test.ts`, and `createJobContext.integration.test.ts` not named above continue to pass unmodified.
    * `[ ]`   `index.ts` is unmodified by this node (its corresponding wiring lands in the dedicated `index.ts` node later this sprint).

* `[ ]`   supabase/functions/dialectic-worker/`processJob.ts` **[BE] Route COMPRESS jobs to processCompressJob via a new switch case, narrowing the payload with isDialecticCompressJobPayload and writing the job's own failed status when processCompressJob returns an error — the legacy hub's single touch for JobType/JobTypes, the DialecticJobPayload union, and IJobProcessors**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing dispatch path for `job_type='COMPRESS'` rows. `processJob` (`processJob.ts:29-72`) currently routes strictly by `job.job_type` via a `switch` with cases for `'EXECUTE'`, `'PLAN'`, `'RENDER'`, and a `default` that throws `Unsupported or null job_type for job ${jobId}` — `'COMPRESS'` falls into `default` today and would throw. Now that `ctx.enqueueModelCall: BoundEnqueueModelCallFn` exists on `IJobContext` (prior node), this function can construct a real `ProcessCompressJobDeps` and dispatch to `processors.processCompressJob`.
    * `[ ]`   Functional goals:
      * `[ ]`   Add a `case 'COMPRESS':` block that narrows `job.payload` via the real `isDialecticCompressJobPayload` (imported from `enqueueCompressJobs.guard.ts`, the Sprint-3 `enqueueCompressJobs.ts` node's own module guard file) — a DIFFERENT narrowing style than the existing `jobIsExecuteJob`/`jobIsPlanJob` local functions (`processJob.ts:17-27`), which only assert `job.job_type === '...'` as a trivial type predicate and never validate payload shape at runtime. `isDialecticCompressJobPayload` is consumed here as a boolean-returning type predicate (`payload is DialecticCompressJobPayload`), matching the control-flow shape already established for `jobIsExecuteJob`/`jobIsPlanJob` (`if (guard(job)) { ... } else { throw ... }`) — NOT the throw-on-invalid style of `isDialecticExecuteJobPayload`/`isDialecticRenderJobPayload` (`type_guards.dialectic.ts:977`, `:1264`), since a throwing guard could not be used as a plain `if` condition the way this case needs.
      * `[ ]`   On a successful narrow, construct `ProcessCompressJobDeps` (already defined by the `processCompressJob.ts` node) entirely from values already available to `processJob` — no new parameter is added to `processJob`'s own signature:
        * `[ ]`   `enqueueModelCall: ctx.enqueueModelCall` (the field just threaded onto `IJobContext` by the prior node).
        * `[ ]`   `countTokens: ctx.countTokens` (already an `IJobContext` raw field).
        * `[ ]`   `getEncoding`/`countTokensAnthropic` — REAL implementations built here: `getEncoding` wraps `npm:js-tiktoken@1.0.7`'s `getEncoding` with the `TiktokenEncoding` narrowing pattern of `tokenEstimator/index.ts:31-53`, adapted to return `{ encode: (input: string) => number[] }` per `CountTokensDeps["getEncoding"]`; `countTokensAnthropic` is `npm:@anthropic-ai/tokenizer@0.0.4`'s `countTokens` (the same two imports `tokenEstimator/index.ts:12-21` already uses; both packages already in `deno.lock`). NOT the `calculateAffordability.ts:33-39` character-count stub — that placeholder is a defect, not precedent.
        * `[ ]`   `constructStoragePath` imported directly from `_shared/utils/path_constructor.ts` — a pure, dependency-free utility, not sourced from `ctx` (matching the established treatment of this same function as a direct import at `index.ts:23` and in the `enqueueCompressJobs.ts`/`processCompressJob.ts` nodes' own deps).
        * `[ ]`   `logger: ctx.logger`.
        * `[ ]`   `assembleCompressionPrompt: BoundAssembleCompressionPromptFn` built INLINE as `(params, payload) => ctx.promptAssembler.assembleCompressionPrompt({ dbClient, renderPromptFn: renderPrompt, logger: ctx.logger }, params, payload)` — `dbClient` is already a `processJob` parameter; `renderPrompt` is the real function imported directly from `_shared/prompt-renderer.ts:57`; `ctx.promptAssembler` already exposes `.assembleCompressionPrompt` after the earlier `prompt-assembler.ts` node. This mirrors exactly how `boundEnqueueModelCall` itself is built inline from raw deps at `index.ts:145-150` — no `IJobContext` change is needed for this half.
      * `[ ]`   Construct `ProcessCompressJobParams { dbClient, job, projectOwnerUserId, authToken }` — all four values are already parameters of `processJob` itself; no new lookup. The FULL `job` row is passed (not a bare id): `processCompressJob` forwards it verbatim to `enqueueModelCall` as `EnqueueModelCallParams.job` and keys its dedup-hit status write on `job.id`.
      * `[ ]`   Call `const result = await processors.processCompressJob(deps, params, job.payload);` (`job.payload` is now `DialecticCompressJobPayload` after the narrow) and interpret `ProcessCompressJobReturn` via `isProcessCompressJobErrorReturn` (imported from `processCompressJob.guard.ts`, the Sprint-3 `processCompressJob.ts` node's own guard file):
        * [ ]   On error: write `dialectic_generation_jobs` directly — `status:'failed'`, `completed_at: new Date().toISOString()`, `error_details: { message: result.error.message, retriable: result.retriable }` — via `dbClient.from('dialectic_generation_jobs').update(...).eq('id', jobId)`, then `return`. This is a deliberate divergence from `EXECUTE`/`PLAN`/`RENDER`: those cases call `void`-returning processors that throw on failure, letting `handleJob`'s outer `catch` (`index.ts:418-474`) perform the failed-status write AND send user-facing failure notifications. `processCompressJob` returns a typed `Return` instead of throwing, and `processJob.ts` — not `handleJob` — is the only remaining place able to see that `Return`, so it performs the write directly rather than re-throwing to trigger the generic (user-facing) failure path.
        * `[ ]`   On success (`{ queued: true }` or a dedup-hit `{ queued: false }`): do nothing further and `return`. No job-status write here — `enqueueModelCall` already sets `status:'queued'` internally on a real enqueue, and `processCompressJob`'s own dedup-hit branch already sets `status:'completed'` itself (per that node's own written requirements) — writing anything here would be redundant/racy.
      * `[ ]`   Deliberately do NOT call any `ctx.notificationService` method on either branch: COMPRESS is invisible infrastructure (already established by the `processCompressJob.ts` node — "No notifications... COMPRESS is invisible infrastructure"), and because this case never throws, `handleJob`'s outer catch (which sends `sendContributionFailedNotification`/`sendContributionGenerationFailedEvent`) is never invoked for a COMPRESS job either — consistent, not an oversight.
    * `[ ]`   RIDES HERE — the legacy hub's SINGLE touch this epic (`dialectic-service/dialectic.interface.ts`), since this is the first and only node that needs `JobType` to include `'COMPRESS'`:
      * `[ ]`   `JobType` (`dialectic.interface.ts:129`) becomes `"PLAN" | "EXECUTE" | "RENDER" | "COMPRESS"`; `JobTypes` (`dialectic.interface.ts:130`) gains `"COMPRESS"`.
      * `[ ]`   `DialecticJobPayload` (`dialectic.interface.ts:1409-1413`) gains `| DialecticCompressJobPayload`, importing the type from `../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.interface.ts` — matching the existing cross-reference precedent already in this file (`IJobContext`/`IPlanJobContext`/`IRenderJobContext` are already imported from `../dialectic-worker/createJobContext/JobContext.interface.ts` at `dialectic.interface.ts:49-53`). NO new type is defined in this file — only imported.
      * `[ ]`   `IJobProcessors` (`dialectic.interface.ts:114-119`) gains `processCompressJob: ProcessCompressJobFn;`, importing `ProcessCompressJobFn` from `../dialectic-worker/processCompressJob/processCompressJob.interface.ts` — a DIFFERENT `(deps, params, payload) => Promise<Return>` shape than its `processSimpleJob`/`processComplexJob`/`processRenderJob` siblings' legacy `(dbClient, job, projectOwnerUserId, deps, authToken) => Promise<void>` shape; `IJobProcessors` already types each of those three members with a different `deps` shape (`IJobContext`/`IPlanJobContext`/`IRenderJobContext` respectively) so this is not a new kind of heterogeneity, just one more member.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `deriveStepStatuses.ts`/`buildJobProgressDtos.ts` (next two nodes) depend on this node's `JobType` extension but are NOT touched here — they are separate, already-scoped nodes.
      * `[ ]`   `index.ts` is NOT touched by this node: `defaultProcessors` (`index.ts:275-288`) does not yet have a `processCompressJob` member, so `IJobProcessors` (now requiring one) makes `index.ts` transiently non-compilable until its own dedicated node (last in this sprint) wires it in — permitted within a sprint per NODE & SPRINT RULES, resolved before the Sprint 3 commit.
      * `[ ]`   `jobIsExecuteJob`/`jobIsPlanJob` (`processJob.ts:17-27`) and the existing `'EXECUTE'`/`'PLAN'`/`'RENDER'` cases are unchanged.

  * `[ ]`   `role`
    * `[ ]`   `processJob.ts` remains the strict job-type router; this node adds one more case following the router's existing narrow-then-delegate pattern. Out of scope: any change to `processCompressJob.ts`'s own internal logic (already-written node); any change to `enqueueCompressJobs.ts`, `assembleCompressionPrompt.ts`, or `enqueueModelCall.ts` (already-written nodes); `deriveStepStatuses.ts`/`buildJobProgressDtos.ts`/`index.ts` (separate, later nodes).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/processJob.ts` plus its one legacy-hub companion edit (`dialectic-service/dialectic.interface.ts`) and that hub's own guard/mock/test satellites (`type_guards.dialectic.ts`, `dialectic.mock.ts`).
    * `[ ]`   Inside boundary: the `COMPRESS` switch case; the `JobType`/`JobTypes`/`DialecticJobPayload`/`IJobProcessors` extensions (imports only, per TYPE OWNERSHIP); the corresponding guard/mock/test updates.
    * `[ ]`   Outside boundary: `processCompressJob.ts`'s internals; `createJobContext.ts` (already done); `index.ts`'s `defaultProcessors` wiring.

  * `[ ]`   `deps`
    * `[ ]`   `isDialecticCompressJobPayload`, `DialecticCompressJobPayload` (`enqueueCompressJobs.interface.ts`/`enqueueCompressJobs.guard.ts`, already-written Sprint-3 node).
    * `[ ]`   `ProcessCompressJobDeps`, `ProcessCompressJobParams`, `ProcessCompressJobReturn`, `isProcessCompressJobErrorReturn` (`processCompressJob.interface.ts`/`processCompressJob.guard.ts`, already-written Sprint-3 node).
    * `[ ]`   `BoundAssembleCompressionPromptFn` (`assembleCompressionPrompt.interface.ts`, already-written Sprint-3 node).
    * `[ ]`   `renderPrompt` (`_shared/prompt-renderer.ts:57`, existing pure function) and `constructStoragePath` (`_shared/utils/path_constructor.ts`, existing pure function) — both imported directly, not injected via `ctx`.
    * `[ ]`   `ctx.enqueueModelCall`, `ctx.countTokens`, `ctx.logger`, `ctx.promptAssembler` (all pre-existing or newly-threaded `IJobContext` raw fields — no new field added by this node).
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — `processJob.ts` already sits above every module it now imports from.

  * `[ ]`   `type_guards.dialectic.ts`
    * `[ ]`   `isDialecticJobPayload` (`type_guards.dialectic.ts:1051-1096`): its return-type predicate widens to the extended `DialecticJobPayload` union automatically (no signature edit needed — the predicate names the type, not its members). Verified no runtime-logic change is required for it to correctly ACCEPT a valid `DialecticCompressJobPayload`: the function's required-field check (`hasSessionId && hasProjectId && (hasModelId || hasSelectedModels)`) is already satisfied by a `DialecticCompressJobPayload` (which always carries `sessionId`, `projectId`, `model_id`), and it carries no `is_test_job` key (the one key this function unconditionally rejects, `type_guards.dialectic.ts:1056-1058`) — so no COMPRESS-specific branch is added to this function's logic.
    * `[ ]`   Extend the `allowedKeys` list (`type_guards.dialectic.ts:1082-1086`) to include the `DialecticCompressJobPayload`-specific keys not already covered by the other three union members: `job_type`, `targetKey`, `mode`, `content`, `sourceType`, `sourceId`, `documentKey` (already present), `docType`, `sourceStageSlug`, `chunk_index`, `chunk_total`. This list is enumerative documentation only today (the unknown-key loop at `type_guards.dialectic.ts:1088-1093` is inert — its `return false` is commented out) but is kept complete and accurate as the union grows, matching this file's own comment about the loop's intent.
    * `[ ]`   The barrel re-export of `isDialecticJobPayload` from `_shared/utils/type_guards.ts:18` requires no edit — the exported name and signature are unchanged.
    * `[ ]`   Add tests to `type_guards.dialectic.test.ts` (existing file): `isDialecticJobPayload` returns `true` for a fully-populated, valid `DialecticCompressJobPayload` fixture; existing EXECUTE/PLAN/RENDER-shaped test cases in that file continue to pass unmodified.

  * `[ ]`   `dialectic.mock.ts`
    * `[ ]`   `_JobProcessorsDummyImpl` (`dialectic.mock.ts:161-170`): add `processCompressJob = async (..._args: any[]): Promise<ProcessCompressJobReturn> => ({ queued: false });` (importing `ProcessCompressJobReturn` from `processCompressJob.interface.ts`) — matching this class's existing `deno-lint-ignore no-explicit-any` catch-all-args style, but with a real, typed return value rather than `Promise<void>` since `ProcessCompressJobFn`'s return type is `Promise<ProcessCompressJobReturn>`, not `Promise<void>`.
    * `[ ]`   `MockJobProcessorsSpies` (`dialectic.mock.ts:173-178`): add `processCompressJob: Spy<_JobProcessorsDummyImpl, Parameters<typeof _JobProcessorsDummyImpl.prototype.processCompressJob>, ReturnType<typeof _JobProcessorsDummyImpl.prototype.processCompressJob>>;`.
    * `[ ]`   `createMockJobProcessors()` (`dialectic.mock.ts:181-198`): add `processCompressJob: spy(dummyInstance, "processCompressJob"),` to the `spies` object literal.

  * `[ ]`   `processJob.test.ts`
    * `[ ]`   New test mirroring the existing `'processJob - dispatches by job.job_type: PLAN routes to processComplexJob'`/`'... EXECUTE routes to processSimpleJob'` pattern (`processJob.test.ts:27-84`, `:87-...`): a `mockJob` with `job_type: 'COMPRESS'` and a valid `DialecticCompressJobPayload` dispatches to `processors.processCompressJob` exactly once; `processSimpleJob`/`processComplexJob`/`processRenderJob` are never called.
    * `[ ]`   A `mockJob` with `job_type: 'COMPRESS'` but a payload that fails `isDialecticCompressJobPayload` (e.g. missing `targetKey`) throws `Unsupported or null job_type for job ${jobId}` and never calls `processors.processCompressJob`.
    * `[ ]`   When the injected `processors.processCompressJob` mock resolves to a `ProcessCompressJobErrorReturn`, `processJob` writes `dialectic_generation_jobs.status = 'failed'` (asserted via the mock Supabase client's captured update call) with `error_details` containing the returned error's message, and does not throw.
    * `[ ]`   When the injected mock resolves to `{ queued: true }` or `{ queued: false }`, `processJob` performs no `dialectic_generation_jobs` update itself (asserted via the mock Supabase client's update-call count) and does not throw.
    * `[ ]`   Existing PLAN/EXECUTE/RENDER dispatch tests in this file continue to pass unmodified.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported `processJob` function. Within the new case: narrow payload → build `ProcessCompressJobDeps`/`ProcessCompressJobParams` → call `processors.processCompressJob` → branch on the typed `Return` → (error: write failed status; success: no-op) → `return`. No DB write happens before the narrow succeeds.

  * `[ ]`   `processJob.ts` (Implementation)
    * `[ ]`   Add imports: `isDialecticCompressJobPayload` + `DialecticCompressJobPayload` from `./enqueueCompressJobs/enqueueCompressJobs.interface.ts`/`.guard.ts`; `ProcessCompressJobDeps`, `ProcessCompressJobParams`, `ProcessCompressJobReturn` from `./processCompressJob/processCompressJob.interface.ts`; `isProcessCompressJobErrorReturn` from `./processCompressJob/processCompressJob.guard.ts`; `BoundAssembleCompressionPromptFn` from `../_shared/prompt-assembler/assembleCompressionPrompt.interface.ts`; `renderPrompt` from `../_shared/prompt-renderer.ts`; `constructStoragePath` from `../_shared/utils/path_constructor.ts`.
    * `[ ]`   Add `case 'COMPRESS': { ... }` to the `switch (job.job_type)` block (`processJob.ts:42-71`), placed after the existing `'RENDER'` case and before `default`, implementing exactly the functional goals and construction order above.
    * `[ ]`   No change to `jobIsExecuteJob`, `jobIsPlanJob`, or the `'EXECUTE'`/`'PLAN'`/`'RENDER'`/`default` cases.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (top-level router). Deps inward: `enqueueCompressJobs.ts`, `processCompressJob.ts`, `assembleCompressionPrompt.ts` (via the facade), `enqueueModelCall.ts`, `createJobContext.ts` — all already-written Sprint-3 nodes. Provides outward: nothing new (this is the dispatcher, not a producer); `dialectic.interface.ts`'s widened `JobType`/`DialecticJobPayload`/`IJobProcessors` are consumed next by `deriveStepStatuses.ts`/`buildJobProgressDtos.ts` (next nodes) and `index.ts` (last node this sprint).

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   A `job_type: 'COMPRESS'` row with a valid `DialecticCompressJobPayload` dispatches to `processors.processCompressJob` exactly once, with `Deps`/`Params` built as specified, and no other processor is called.
    * `[ ]`   A `job_type: 'COMPRESS'` row whose payload fails `isDialecticCompressJobPayload` throws `Unsupported or null job_type for job ${jobId}` and calls no processor.
    * `[ ]`   A `ProcessCompressJobErrorReturn` result writes `status:'failed'` with `error_details` to the job's own row and returns normally (no throw, no notification call).
    * `[ ]`   A `ProcessCompressJobSuccessReturn` result (either `queued` value) writes nothing further and returns normally.
    * `[ ]`   `JobType`/`JobTypes` include `'COMPRESS'`; `DialecticJobPayload` includes `DialecticCompressJobPayload`; `IJobProcessors` includes `processCompressJob`; no new type is DEFINED (only imported) in `dialectic.interface.ts`.
    * `[ ]`   `isDialecticJobPayload` returns `true` for a valid `DialecticCompressJobPayload` fixture; every existing test in `processJob.test.ts` and `type_guards.dialectic.test.ts` not named above continues to pass unmodified.
    * `[ ]`   `index.ts` is unmodified by this node (its `defaultProcessors`/`createJobContext(...)` wiring for COMPRESS lands in the dedicated `index.ts` node later this sprint).

* `[ ]`   supabase/functions/dialectic-service/`deriveStepStatuses.ts` **[BE] Exclude COMPRESS jobs from step-status attribution, parallel to the existing RENDER exclusion, so infrastructure compression rows never corrupt recipe-step progress counts**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing exclusion for `job_type='COMPRESS'` rows. `deriveStepStatuses` (`deriveStepStatuses.ts:34-127`) attributes each `dialectic_generation_jobs` row to a recipe step (via `getRecipeStepIdFromPayload` → `stepIdToStepKey`) to compute `in_progress`/`completed`/`failed`/`paused_nsf`/`paused_user`/`not_started` per step. It already excludes `RENDER` rows unconditionally (`deriveStepStatuses.ts:55`, `if (job.job_type === "RENDER") continue;`) because RENDER is as-needed infrastructure with no recipe-step identity of its own. COMPRESS is the same kind of job (design decision 1: "an as-needed infrastructure job, NOT part of recipe steps... excluded from step status and progress DTOs") — without this exclusion, a COMPRESS child row whose payload happens to satisfy `getRecipeStepIdFromPayload` (it never legitimately would, since `DialecticCompressJobPayload` carries no `planner_metadata.recipe_step_id`) would otherwise risk being counted; the exclusion makes that explicit and unconditional rather than relying on payload shape happening not to match.
    * `[ ]`   Functional goal: add `if (job.job_type === "COMPRESS") continue;` to the same `for (const job of jobs)` loop (`deriveStepStatuses.ts:54-74`), placed immediately after the existing `if (job.job_type === "RENDER") continue;` line (`deriveStepStatuses.ts:55`) and before the `target_contribution_id`/`SUPERSEDED_STATUSES` checks — same placement pattern, same one-line unconditional `continue`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No change to `getRecipeStepIdFromPayload`, `ACTIVE_STATUSES`/`FAILED_STATUSES`/`PAUSED_NSF_STATUSES`/`PAUSED_USER_STATUSES`/`SUPERSEDED_STATUSES`, the successor-map construction, or the per-step status-resolution logic (`deriveStepStatuses.ts:88-124`) — this is a single added early-`continue` line, nothing else in the function changes.
      * `[ ]`   `DeriveStepStatusesDeps`/`DeriveStepStatusesParams`/`DeriveStepStatusesResult` (`dialectic.interface.ts:656-665`) are unchanged: `params.jobs: DialecticJobRow[]` already types `job_type` from the regenerated `types_db.ts` enum (Sprint-1 WS-0 migration already added `'COMPRESS'` to `dialectic_job_type_enum`), so no interface or type-guard edit is needed for this node to compile against a `'COMPRESS'`-typed row.

  * `[ ]`   `role`
    * `[ ]`   Progress-computation implementation node; the entire change is internal to `deriveStepStatuses`'s single per-job loop. Out of scope: `buildJobProgressDtos.ts` (next node, same exclusion at a different layer); any change to how COMPRESS jobs are created, routed, or persisted (already-written nodes).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-service/deriveStepStatuses.ts` and its existing test file only.
    * `[ ]`   Inside boundary: the one new `continue` line.
    * `[ ]`   Outside boundary: `dialectic.interface.ts` (no edit needed here), `buildJobProgressDtos.ts` (separate node), any DB query that supplies `params.jobs`.

  * `[ ]`   `deps`
    * `[ ]`   None new. `DeriveStepStatusesDeps` is already `{}` (`dialectic.interface.ts:656`) and stays empty.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this node touches only its own file and its own test file.

  * `[ ]`   `deriveStepStatuses.test.ts`
    * `[ ]`   Widen the local `job()` test helper's `payload` parameter type (`deriveStepStatuses.test.ts:24-28`) from `DialecticExecuteJobPayload | DialecticPlanJobPayload | DialecticRenderJobPayload` to also include `DialecticCompressJobPayload` (imported from `../dialectic-worker/enqueueCompressJobs/enqueueCompressJobs.interface.ts`, matching how `DialecticRenderJobPayload` is already imported from `./dialectic.interface.ts` at the top of this file), so a COMPRESS-shaped payload can be constructed with the existing helper rather than a bespoke row literal.
    * `[ ]`   New test, mirroring `'RENDER jobs excluded from step attribution'` (`deriveStepStatuses.test.ts:236-259`) exactly: build a minimal valid `DialecticCompressJobPayload` fixture (`job_type:'COMPRESS'`, `sessionId`, `projectId`, `stageSlug`, `targetKey`, `iterationNumber`, `model_id`, `mode:'text'`, `content`, `sourceType:'resource'`, `documentKey`, `walletId`, `user_id`), one `EXECUTE` step with no jobs of its own, one `job("compress-1", "COMPRESS", "completed", compressPayload, null)` row, and assert `deriveStepStatuses(deps, params).get(<stepKey>)` is `"not_started"` — proving the COMPRESS row contributes no evidence to any step.
    * `[ ]`   Existing `'RENDER jobs excluded from step attribution'`, `'continuation jobs ... excluded'`, and every other existing test in this file continue to pass unmodified.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function; no change to construction order — the new `continue` is the first check inside the existing loop body's `RENDER`-then-`target_contribution_id`-then-`SUPERSEDED_STATUSES` sequence, immediately following the `RENDER` check it mirrors.

  * `[ ]`   `deriveStepStatuses.ts` (Implementation)
    * `[ ]`   Add `if (job.job_type === "COMPRESS") continue;` immediately after line 55 (`if (job.job_type === "RENDER") continue;`), inside the `for (const job of jobs)` loop (`deriveStepStatuses.ts:54`).
    * `[ ]`   No other line in this file changes.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: application/service (progress computation), a pure function of its `params`. Deps inward: none new. Provides outward: unchanged — this exclusion only affects what evidence the loop collects, not `deriveStepStatuses`'s callers or return shape.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   A `COMPRESS`-type job row contributes no evidence to `stepKeyToHasActive`/`Completed`/`Failed`/`PausedNsf`/`PausedUser` for any step, regardless of its `status` or `target_contribution_id`.
    * `[ ]`   A step with only a `COMPRESS` job attributed to it (hypothetically, via a matching `recipe_step_id`) resolves to `"not_started"` (or `"completed"` if reached by a successor with real evidence), never `"in_progress"`/`"completed"` from the COMPRESS row itself.
    * `[ ]`   Every existing test in `deriveStepStatuses.test.ts` continues to pass unmodified.
    * `[ ]`   No change to `dialectic.interface.ts`, `getRecipeStepIdFromPayload`, or any status-set constant.

* `[ ]`   supabase/functions/dialectic-service/`buildJobProgressDtos.ts` **[BE] Exclude COMPRESS jobs from the user-visible job-progress DTO map, so compression rows never surface as step progress**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing exclusion for `job_type='COMPRESS'` rows. `buildJobProgressDtos` (`buildJobProgressDtos.ts:9-56`) builds a `JobProgressDto` for EVERY row in `params.jobs` unconditionally — unlike `deriveStepStatuses.ts`, this function has NO existing `job_type` filter of any kind today (not even for `RENDER`; RENDER rows currently DO produce a `JobProgressDto`, since render progress is itself user-visible via `render_started`/`render_chunk_completed` notifications). COMPRESS is different: design decision 1 states COMPRESS is "excluded from step status and progress DTOs" — it is invisible infrastructure with no user-facing progress signal at all (no notifications are ever sent for it, per the already-written `processCompressJob.ts`/`processJob.ts` nodes). Without this exclusion, every COMPRESS child job spawned by `enqueueCompressJobs` would produce a `JobProgressDto` entry under its stage's slug, leaking infrastructure rows into a DTO map callers assume represents only user-visible step/document progress.
    * `[ ]`   Functional goal: add `if (job.job_type === "COMPRESS") continue;` as the FIRST statement inside the `for (const job of params.jobs)` loop (`buildJobProgressDtos.ts:15`), before any `payload`/`stepKey`/`modelId` derivation — this is the first `job_type` filter this function has ever had, introduced specifically and only for COMPRESS; it does not add a parallel `RENDER` exclusion (out of scope — RENDER rows continue to produce DTOs exactly as they do today).
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No change to the `stepKey`/`modelId`/`modelName`/`documentKey` derivation logic (`buildJobProgressDtos.ts:18-33`), the `dto` construction (`buildJobProgressDtos.ts:35-47`), or the per-`stage_slug` grouping (`buildJobProgressDtos.ts:49-52`) — one added early `continue`, nothing else changes.
      * `[ ]`   `BuildJobProgressDtosDeps`/`BuildJobProgressDtosParams`/`JobProgressDto` (`dialectic.interface.ts:985-1004`) are unchanged: `JobProgressDto.jobType: JobType | null` already types against the app-level `JobType` widened to include `'COMPRESS'` by the `processJob.ts` node, and `params.jobs: DialecticJobRow[]` already types `job_type` from the regenerated `types_db.ts` enum (Sprint-1 WS-0 migration) — no interface edit needed for this node to compile.

  * `[ ]`   `role`
    * `[ ]`   Progress-DTO-building implementation node; the entire change is one added line inside this function's single loop. Out of scope: `deriveStepStatuses.ts` (prior node, same exclusion concept at a different layer — step-status computation, not DTO listing); adding a `RENDER` exclusion to this function (not requested by the scope; RENDER progress is intentionally user-visible).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-service/buildJobProgressDtos.ts` and its existing test file only.
    * `[ ]`   Inside boundary: the one new `continue` line.
    * `[ ]`   Outside boundary: `dialectic.interface.ts` (no edit needed), `deriveStepStatuses.ts` (separate, already-done node), whatever caller consumes the returned `Map<string, JobProgressDto[]>`.

  * `[ ]`   `deps`
    * `[ ]`   None new. `BuildJobProgressDtosDeps` is already `{}` (`dialectic.interface.ts:999`) and stays empty.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this node touches only its own file and its own test file.

  * `[ ]`   `buildJobProgressDtos.test.ts`
    * `[ ]`   New test, using the existing `jobRow(id, job_type, status, payload, overrides?)` helper (`buildJobProgressDtos.test.ts:15-51`, which already accepts `payload: Json` directly with no per-job-type union to widen): build a minimal `Json`-valid COMPRESS-shaped payload object (`{ job_type: "COMPRESS", sessionId, projectId, stageSlug, targetKey, iterationNumber, model_id, mode: "text", content, sourceType: "resource", documentKey, walletId, user_id }`), call `jobRow("compress-1", "COMPRESS", "completed", compressPayload)`, and assert `buildJobProgressDtos(deps, { jobs: [thatRow], stepIdToStepKey: new Map() }).size === 0` (no stage-slug entry at all, since the COMPRESS row is the only job and it is skipped before ever reaching the `stage_slug` grouping step).
    * `[ ]`   New test: a job list containing ONE `EXECUTE` row and ONE `COMPRESS` row under the same `stage_slug` produces a result whose entry for that slug contains exactly one `JobProgressDto` (the `EXECUTE` one), proving the COMPRESS row is skipped without disturbing sibling rows' grouping.
    * `[ ]`   Existing test(s) in this file (including the `'job with complete planner_metadata.recipe_step_id...'` case at `buildJobProgressDtos.test.ts:56-...`) continue to pass unmodified — in particular, no existing `RENDER`-row test is added or changed by this node.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function; the new `continue` is the first statement in the loop body, before `payload`/`stepKey`/`modelId`/`modelName`/`documentKey` are computed for that row.

  * `[ ]`   `buildJobProgressDtos.ts` (Implementation)
    * `[ ]`   Add `if (job.job_type === "COMPRESS") continue;` as the first line inside `for (const job of params.jobs) { ... }` (`buildJobProgressDtos.ts:15`), before `const payload: unknown = job.payload;`.
    * `[ ]`   No other line in this file changes.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: application/service (DTO projection), a pure function of its `params`. Deps inward: none new. Provides outward: unchanged — this exclusion only changes which rows are ever considered, not the returned `Map`'s shape or any consumer's contract.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   A `COMPRESS`-type job row produces no `JobProgressDto` entry anywhere in the returned `Map`, regardless of its `status`, `payload` shape, or `stage_slug`.
    * `[ ]`   A mixed job list's non-COMPRESS rows (including `RENDER`) are grouped and projected exactly as they are today — unaffected by this change.
    * `[ ]`   Every existing test in `buildJobProgressDtos.test.ts` continues to pass unmodified.
    * `[ ]`   No change to `dialectic.interface.ts` or any derivation/grouping logic in this file besides the one added `continue`.

* `[ ]`   supabase/functions/dialectic-worker/`index.ts` **[BE] Wire processCompressJob into defaultProcessors and pass boundEnqueueModelCall into createJobContext — the composition root's FIRST of its two enumerated touches this epic, resolving the transient non-compilable states left by createJobContext.ts and processJob.ts, and closing out Sprint 3 (WS-R)**

  * `[ ]`   `objective`
    * `[ ]`   Resolve the two compilation gaps deliberately left open by the two prior nodes, both permitted only "within a sprint" per NODE & SPRINT RULES:
      * `[ ]`   `createJobContext.ts`'s node widened `JobContextParams` to require `enqueueModelCall: BoundEnqueueModelCallFn`, but `createDialecticWorkerDeps`'s call `createJobContext({...})` (`index.ts:152-223`) does not yet pass it, even though `boundEnqueueModelCall` is already constructed at `index.ts:145-150` and used today only inline inside the `prepareModelJob:` closure (`index.ts:191-209`).
      * `[ ]`   `processJob.ts`'s node widened `IJobProcessors` to require `processCompressJob: ProcessCompressJobFn`, but `defaultProcessors` (`index.ts:275-288`) does not yet have a `processCompressJob` member.
    * `[ ]`   Functional goals:
      * `[ ]`   Add `enqueueModelCall: boundEnqueueModelCall,` to the object literal passed to `createJobContext({...})` (`index.ts:152-223`), placed alongside the existing `gatherArtifacts: boundGatherArtifacts,` line (`index.ts:221`) — `boundEnqueueModelCall` is the SAME closure already used by `prepareModelJob:`'s inline deps (`index.ts:204`); this node does not construct a second one, it reuses the existing local variable.
      * `[ ]`   Import the real `processCompressJob` from `./processCompressJob/processCompressJob.ts` and add `processCompressJob: processCompressJob,` to `defaultProcessors` (`index.ts:275-288`) as a DIRECT function reference — NOT a wrapping closure like `processSimpleJob`/`processComplexJob`/`processRenderJob`'s members (`index.ts:276-287`), which ignore their own `ctx`/ctx-slice argument and instead close over the outer `deps`/`planCtx`/`renderCtx` because those three legacy processors need the FULL `IJobContext`/slice built once at `createDialecticWorkerDeps` time. `processCompressJob`'s modern `(deps, params, payload) => Promise<Return>` shape is different: `processJob.ts`'s `COMPRESS` case (already-written node) already constructs a FULLY-POPULATED `ProcessCompressJobDeps`/`Params` itself (using `ctx.enqueueModelCall`/`ctx.countTokens`/`ctx.logger`/`ctx.promptAssembler`, all now real) and passes them straight into `processors.processCompressJob(deps, params, payload)` — so the real function can be assigned directly with no wrapping, matching `ProcessCompressJobFn`'s exact type.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No other line in `createDialecticWorkerDeps` or `defaultProcessors` changes — `processSimpleJob`/`processComplexJob`/`planComplexStage`/`processRenderJob`'s wiring (`index.ts:276-287`) is untouched, and every other field already passed to `createJobContext({...})` is untouched.
      * `[ ]`   This is the FIRST of the two enumerated `index.ts` touches for this epic (per NODE & SPRINT RULES); the second (RAG-core removal wiring) lands in WS-X, Sprint 5, touching this same file again — not duplicated or anticipated here.
      * `[ ]`   No change to `serve(...)`'s HTTP handler body or to `handleJob`'s own logic (`index.ts:268-475`) — `handleJob` already accepts an optional `testProcessors` override and already calls `processJob(adminClient, validatedJob, projectOwnerUserId, effectiveProcessors, deps, authToken)` unconditionally for every `job_type`, including `'COMPRESS'`, once `isDialecticJobPayload` (already updated by the `processJob.ts` node) admits a `DialecticCompressJobPayload`.

  * `[ ]`   `role`
    * `[ ]`   Composition-root wiring node — the LAST node in Sprint 3 (WS-R), per the corrected strict node order (`text_splitter → enqueueCompressJobs → assembleCompressionPrompt → prompt-assembler.ts → enqueueModelCall → processCompressJob → createJobContext → processJob → deriveStepStatuses → buildJobProgressDtos → index.ts`). Out of scope: any change to the functions being wired (`processCompressJob.ts`, `createJobContext.ts`, `processJob.ts` — all already-written, unchanged nodes); the RAG-removal wiring (WS-X, Sprint 5, this file's second touch).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/index.ts` — the composition root's `createDialecticWorkerDeps` factory and `handleJob`'s `defaultProcessors` construction.
    * `[ ]`   Inside boundary: the one new import, the one new `createJobContext(...)` argument line, the one new `defaultProcessors` member.
    * `[ ]`   Outside boundary: `serve(...)`'s request handling; `handleJob`'s validation/claim/notification/failure logic; every wired-in function's own implementation.

  * `[ ]`   `deps`
    * `[ ]`   `processCompressJob` (`processCompressJob.ts`, already-written Sprint-3 node) — new import.
    * `[ ]`   `boundEnqueueModelCall` (already exists at `index.ts:145-150`) — reused, not reconstructed.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — `index.ts` already sits at the top of the dependency graph (the composition root); it is the only file allowed to import every module it wires.

  * `[ ]`   `index.test.ts`
    * `[ ]`   New test `'createDialecticWorkerDeps: wires enqueueModelCall as a function on the returned context'`, mirroring the existing `'createDialecticWorkerDeps: wires computeJobSig as a function on the returned context'` test (`index.test.ts:1619-1633`) exactly: set the same three/four env vars, call `createDialecticWorkerDeps(...)`, assert `typeof deps.enqueueModelCall === 'function'`, restore env vars in `finally`.
    * `[ ]`   New test `'handleJob - COMPRESS routes via provided processors and propagates args unchanged'`, mirroring `'handleJob - RENDER routes via provided processors and propagates args unchanged'` (`index.test.ts:909-988`) in STRUCTURE but adapted to `processCompressJob`'s `(deps, params, payload)` shape rather than the legacy `(dbClient, job, projectOwnerUserId, ctx, authToken)` shape: build a valid `DialecticCompressJobPayload`-shaped `Json` payload and a `MockJob` row with `job_type: 'COMPRESS'`; call `handleJob(dbClient, compressJob, deps, authToken, processors)` with `processors` from `createMockJobProcessors()` (unmodified, using its dummy `processCompressJob`); assert `spies.processCompressJob.calls.length === 1`; assert `call.args[2]` (the forwarded payload) deep-equals the job's own payload; assert `call.args[0]` (the `ProcessCompressJobDeps` `processJob.ts` built) has `enqueueModelCall`/`countTokens`/`constructStoragePath`/`logger`/`assembleCompressionPrompt` all present as functions; assert `call.args[1]` (`ProcessCompressJobParams`) has `dbClient` strictly equal to the passed-in client, `jobId` equal to the job's `id`, `projectOwnerUserId` equal to the job's `user_id`, and `authToken` equal to the passed-in token.
    * `[ ]`   No test exercises the REAL (non-injected) `defaultProcessors.processCompressJob` end-to-end in this node — every existing test in this file that proves `handleJob` dispatch behavior does so via an explicitly-injected `testProcessors` (confirmed against every current test in `index.test.ts`: none construct `defaultProcessors` directly), and the real end-to-end proof of `defaultProcessors.processCompressJob` → `processCompressJob` → `enqueueModelCall` → Netlify belongs to the full-chain integration test riding the `processSimpleJob` node (Sprint 5, per the Scope's WS-D description) — consistent with this file's own established testing convention, not a gap introduced by this node.
    * `[ ]`   Every existing test in `index.test.ts` continues to pass unmodified — in particular, the compile-time proof that `defaultProcessors: IJobProcessors` (`index.ts:275`) still type-checks now that `IJobProcessors` requires `processCompressJob` is exercised by every existing test in this file that imports and calls `handleJob`/`createDialecticWorkerDeps`, since the file would fail to compile otherwise.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond `createDialecticWorkerDeps` itself. The new `createJobContext(...)` argument is added in the same flat-object style as every existing argument; the new `defaultProcessors` member is added in the same flat-object style as its three siblings, with no conditional logic.

  * `[ ]`   `index.ts` (Implementation)
    * `[ ]`   Add `import { processCompressJob } from './processCompressJob/processCompressJob.ts';` alongside the existing processor imports (near `import { processRenderJob } from './processRenderJob.ts';`, `index.ts:39`).
    * `[ ]`   Add `enqueueModelCall: boundEnqueueModelCall,` to the object literal passed to `createJobContext({...})`, placed alongside `gatherArtifacts: boundGatherArtifacts,` (`index.ts:221`).
    * `[ ]`   Add `processCompressJob: processCompressJob,` to `defaultProcessors` (`index.ts:275-288`), placed after the existing `processRenderJob: async (...) => {...},` member.
    * `[ ]`   No other line in this file changes.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: composition root (application boundary, outermost layer). Deps inward: every Sprint-3 node (`enqueueCompressJobs.ts`, `assembleCompressionPrompt.ts`/`prompt-assembler.ts`, `enqueueModelCall.ts`, `processCompressJob.ts`, `createJobContext.ts`, `processJob.ts`, `deriveStepStatuses.ts`, `buildJobProgressDtos.ts`). Provides outward: nothing — this is the terminal node of the dependency graph; no later node imports from `index.ts`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `createDialecticWorkerDeps(...)` returns a context whose `.enqueueModelCall` is a function, reference-equal to the same `boundEnqueueModelCall` used by `prepareModelJob`'s inline deps.
    * `[ ]`   `defaultProcessors.processCompressJob` is the real, imported `processCompressJob` function (not a wrapping closure).
    * `[ ]`   A `job_type: 'COMPRESS'` row dispatched through `handleJob` with externally-provided `processors` reaches `processors.processCompressJob` exactly once, carrying a fully-populated `ProcessCompressJobDeps`/`Params` and the job's own payload, unchanged.
    * `[ ]`   Every existing test in `index.test.ts` continues to pass unmodified; the repo compiles with no transient-non-compilable state remaining.
    * `[ ]`   No change to `serve(...)` or to any line of `handleJob` outside what is listed above.

  * `[ ]`   **Commit** `feat(worker): route COMPRESS jobs end-to-end through processJob/processCompressJob`
    * `[ ]`   Structural: `dialectic_job_type_enum`/`JobType`/`JobTypes` include `COMPRESS`; `DialecticJobPayload` includes `DialecticCompressJobPayload`; `IJobProcessors` includes `processCompressJob`; `IJobContext`/`JobContextParams` include `enqueueModelCall`; `BuildUploadContextFn` admits `ResourceUploadContext`; `FileType.CompressedContext`/`CompressionSourceType`/`CompressionMode` and their guards, path-constructor/deconstructor cases, and `fileManager` persistence support exist.
    * `[ ]`   Behavioral: a `COMPRESS` job row is routed by `processJob` to `processCompressJob`, which dedups against the canonical `CompressedContext` artifact, assembles a mode-aware compression prompt via the seeded `compression_context_v1` template, enforces the recursion guard, and enqueues the parent's own model via the production stream-call transport (`enqueueModelCall`) — end to end, compiling, with every unit/interface/guard/integration test in this sprint's nodes green. `deriveStepStatuses`/`buildJobProgressDtos` exclude COMPRESS rows from user-visible step/progress data.
    * `[ ]`   Contract: NO caller yet creates a `COMPRESS` job (`enqueueCompressJobs` has no caller until `compressPrompt.ts`'s rewrite, WS-D/Sprint 5) and NO code path yet persists a `CompressedContext` artifact from a real model response (`saveResponse.ts`'s COMPRESS routing is WS-B/Sprint 4) — this sprint's commit seam is "COMPRESS routable & processable end-to-end; nothing creates COMPRESS jobs yet," exactly as declared in the Scope's SPRINT/COMMIT MAP for Sprint 3.

## WS-B — RENDERER DECOMPOSITION + CALLBACK / PERSISTENCE (Sprint 4; depends WS-R)

* `[ ]`   supabase/functions/_shared/utils/resolveTemplateFilename/`resolveTemplateFilename.ts` **[BE] Extract the template_filename resolution walk out of enqueueRenderJob.ts into its own function-folder module, as a verbatim COPY (original left untouched), so both enqueueRenderJob (next node) and saveResponse's json-mode COMPRESS branch (later WS-B node) can resolve a document's template identity without duplicating a four-query DB walk**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing standalone access to template-identity resolution. The walk (stage → active recipe instance → cloned-or-template steps → step by `output_type` → `outputs_required.files_to_generate` entry by `from_document_key` → `template_filename`) exists ONLY as a private, unexported block inline in `enqueueRenderJob.ts:138-263`, reachable exclusively through the full `enqueueRenderJob` call (which also does RENDER-specific decision/insert work no COMPRESS caller needs). `saveResponse.ts`'s json-mode COMPRESS branch (WS-B, later node) needs the identical resolution for a compression victim's SOURCE document, from the payload's `sourceStageSlug`/`docType`/`documentKey` fields — duplicating the walk inline in `saveResponse.ts` would create two DB-query implementations of the same lookup that drift the moment one is edited.
    * `[ ]`   This is NOT a pure function (ratified 2026-07-11: it is not exempt from the full module treatment) — it performs four sequential DB reads with branching and typed failure modes, so it gets the complete function-folder module: interface, guards, mock, tests, provides.
    * `[ ]`   Functional goal: copy `enqueueRenderJob.ts:138-263` VERBATIM into this new module, generalizing only the THREE identifiers the block reads from its enclosing scope (`stageSlug`, `outputType`, `documentKeyAsFileType`) into typed `payload` fields (`stageSlug: string`, `outputType: string`, `documentKey: string` — widened from the original's `DialecticStageSlug`/`ModelContributionFileTypes`/`FileType` types to plain `string`, since the DB comparisons at `enqueueRenderJob.ts:202` (`step.output_type === outputType`) and `:229` (`entry.from_document_key === documentKeyAsFileType`) are plain string equality and the module must serve a COMPRESS caller whose `docType`/`documentKey` payload fields are typed `string`, not `FileType`). Every query, every branch condition, every error MESSAGE STRING copies unchanged — only the error CLASS changes (see below) and the wrapping function signature changes (standalone `Fn(deps, params, payload)` instead of inline code inside `enqueueRenderJob`'s larger function body).
    * `[ ]`   Error class: define `TemplateResolutionError extends Error` in `_shared/utils/errors.ts` (creator-owns-the-data; alongside the file's existing ungrouped domain errors — `ContextWindowError`, `IndexingError`, `RagServiceError`, `RenderJobValidationError`, `RenderJobEnqueueError` — same flat-file precedent), replacing the original block's `RenderJobValidationError` uses — `RenderJobValidationError` is RENDER-scoped by name and semantically wrong for a COMPRESS caller. Verified safe: NONE of the four `instanceof RenderJobValidationError` assertions in `enqueueRenderJob.test.ts` (lines 586, 619, 1582, 1613) test a failure originating in this block — all four test the `documentKey`/`stageRelationshipForStage` pre-checks at `enqueueRenderJob.ts:96-133`, which are NOT part of this extraction and are NOT touched by it. No existing test asserts on this block's specific failure paths at all (confirmed by grep — only the two success-path tests at `enqueueRenderJob.test.ts:626`/`:658` touch this block, and neither checks an error type).
    * `[ ]`   FOUR source defects in this range, per `.github/instructions/error-handling.instructions.md` ("Errors are never converted, coerced, or otherwise modified"; "You get an error, you pass the error along") — the original (`enqueueRenderJob.ts:145-149`, `:162-166`, `:176-180`/`:189-193`, `:246-256`) conflates a RECEIVED DB error (`stageError`/`instanceError`/`stepErr`) with a separate, genuinely-fresh "no row found" condition into ONE throw per site, embedding only the received error's `.message` into a brand-new `RenderJobValidationError` and discarding the original object; a fifth site (the outer `catch` at `:246-256`) does the same to ANY unexpected exception bubbling out of the try block. FIXED by this node (not perpetuated) — each site SPLITS into two branches:
      1. Stage query (`:145-149`): `stageError` present → `return { error: stageError, retriable: false };` (the exact received error, unmodified — NOT a `TemplateResolutionError`); else `!stageData` (no error, no row) → fresh `TemplateResolutionError("Stage '${stageSlug}' not found")`.
      2. Recipe-instance query (`:162-166`): `instanceError` present → `return { error: instanceError, retriable: false };`; else `!instance` → fresh `TemplateResolutionError("Recipe instance '${stageData.active_recipe_instance_id}' not found")`.
      3. Recipe-steps query, both `is_cloned` branches (`:176-180`, `:189-193`): `stepErr` present → `return { error: stepErr, retriable: false };`; else `!stepRows || stepRows.length === 0` (no error, empty result) → fresh `TemplateResolutionError("No cloned recipe steps found for instance '${instance.id}'")` / `TemplateResolutionError("No template recipe steps found for template '${instance.template_id}'")` (message varies by branch, as the original's already did).
      4. Outer catch (`:246-256`): an error already `instanceof TemplateResolutionError` (i.e. one of the branches above, or one of the fresh-validation branches 5-9/11 below) returns as-is (this part of the original was ALREADY correct — `if (error instanceof RenderJobValidationError) { return { error, retriable: false }; }`); any OTHER caught exception is currently reformatted into a `wrapped` `RenderJobValidationError` embedding `error.message` — FIXED to `return { error: error instanceof Error ? error : new Error(String(error)), retriable: false };`, surfacing the unexpected exception exactly as thrown, never reformatted.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `enqueueRenderJob.ts` is NOT modified by this node — it still contains its own inline copy of the walk (including its four unfixed defects, which stay in place there); the swap to consume this module happens in the NEXT node (`enqueueRenderJob.ts`), which is what proves this module's behavior matches via the untouched `enqueueRenderJob.test.ts` suite continuing to pass unmodified once wired in.
      * `[ ]`   Every failure path returns `retriable: false`, matching the original block's uniform choice — no failure path in the original block ever returns/implies retriable, and this extraction preserves that exactly rather than reconsidering retriability.
      * `[ ]`   No logging: the original block (`enqueueRenderJob.ts:138-263`) contains zero `logger.*` calls — this module adds none, matching exactly (the four fixes above change WHICH error object is returned, not whether anything is logged).

  * `[ ]`   `role`
    * `[ ]`   New shared utility module (`_shared/utils/`, alongside `shouldEnqueueRenderJob`) — DB-backed template-identity resolution, callable independent of RENDER-specific decision/insert logic.
    * `[ ]`   Out of scope: `shouldEnqueueRenderJob`'s render-vs-skip decision; RENDER payload construction or job insertion (both stay in `enqueueRenderJob.ts`); the `documentKey`/`stageRelationshipForStage`/`contributionId` pre-checks (`enqueueRenderJob.ts:96-133`, RENDER-specific, not touched).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/utils/resolveTemplateFilename/` plus its one companion touch, `_shared/utils/errors.ts` (new error class only).
    * `[ ]`   Inside boundary: the four-query walk, its branch conditions, its typed failure modes.
    * `[ ]`   Outside boundary: RENDER decision-making, RENDER payload/insert, any COMPRESS-specific logic (this module is COMPRESS-agnostic — it takes generic `stageSlug`/`outputType`/`documentKey` strings and knows nothing about compression).

  * `[ ]`   `deps`
    * `[ ]`   None external — `SupabaseClient<Database>` arrives via `params.dbClient` (module-Params-carries-dbClient convention, matching `enqueueCompressJobs`/`processCompressJob`'s established Sprint-3 pattern, not the older `enqueueRenderJob.ts`-style `Deps.dbClient`).
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this is a `_shared/utils/` module with no import from `dialectic-worker/`.

  * `[ ]`   `resolveTemplateFilename.interface.test.ts`
    * `[ ]`   Valid: a payload with non-empty `stageSlug`/`outputType`/`documentKey` and a `params.dbClient` type-checks.
    * `[ ]`   `ResolveTemplateFilenameSuccessReturn { templateFilename: string }` and `ResolveTemplateFilenameErrorReturn { error: Error; retriable: boolean }` never co-occur.

  * `[ ]`   `resolveTemplateFilename.interface.ts`
    * `[ ]`   `export interface ResolveTemplateFilenameDeps {}` (empty — matches the established `DeriveStepStatusesDeps {}`/`BuildJobProgressDtosDeps {}` precedent; this walk needs no injected service, only the DB client).
    * `[ ]`   `export interface ResolveTemplateFilenameParams { dbClient: SupabaseClient<Database>; }`.
    * `[ ]`   `export interface ResolveTemplateFilenamePayload { stageSlug: string; outputType: string; documentKey: string; }` — the three identifiers the copied walk reads, generalized to `string` (see objective).
    * `[ ]`   `export type ResolveTemplateFilenameSuccessReturn = { templateFilename: string };`.
    * `[ ]`   `export type ResolveTemplateFilenameErrorReturn = { error: Error; retriable: boolean };` — typed as plain `Error`, NOT `TemplateResolutionError`, because three of the DB-query branches (stage/instance/steps) return the RECEIVED error unmodified, which is not guaranteed to be a `TemplateResolutionError` instance; `TemplateResolutionError extends Error` so the fresh-validation branches still satisfy this type. Imports `TemplateResolutionError` from `../../utils/errors.ts` (relative to the module folder) for the fresh-validation branches only.
    * `[ ]`   `export type ResolveTemplateFilenameReturn = ResolveTemplateFilenameSuccessReturn | ResolveTemplateFilenameErrorReturn;`.
    * `[ ]`   `export type ResolveTemplateFilenameFn = (deps: ResolveTemplateFilenameDeps, params: ResolveTemplateFilenameParams, payload: ResolveTemplateFilenamePayload) => Promise<ResolveTemplateFilenameReturn>;` and `export type BoundResolveTemplateFilenameFn = (params: ResolveTemplateFilenameParams, payload: ResolveTemplateFilenamePayload) => Promise<ResolveTemplateFilenameReturn>;`.

  * `[ ]`   `resolveTemplateFilename.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: `enqueueRenderJob.ts` (next node, one call replacing its inline walk) and `saveResponse.ts`'s json-mode COMPRESS branch (WS-B, later node).
    * `[ ]`   Required interaction: up to four sequential reads (`dialectic_stages` → `dialectic_stage_recipe_instances` → `dialectic_stage_recipe_steps` OR `dialectic_recipe_template_steps`, chosen by `instance.is_cloned`) — no writes, ever.
    * `[ ]`   Failure modes: any of the failure branches enumerated in `construction` below — all `retriable: false`; three are received-error passthroughs (returned unmodified, not `TemplateResolutionError` instances), the rest are fresh `TemplateResolutionError`s produced at their point of detection.

  * `[ ]`   `resolveTemplateFilename.guard.test.ts` / `resolveTemplateFilename.guard.ts`
    * `[ ]`   `isResolveTemplateFilenameParams` accepts `{ dbClient: <object> }`; rejects a non-object `dbClient`.
    * `[ ]`   `isResolveTemplateFilenamePayload` accepts a payload with all three non-empty string fields; rejects any missing or empty (`''`) field.
    * `[ ]`   `isResolveTemplateFilenameSuccessReturn`/`isResolveTemplateFilenameErrorReturn` mirror the mutual-exclusion pattern already established by `isEnqueueRenderJobSuccessReturn`/`ErrorReturn` (`enqueueRenderJob.interface.guards.ts:177-203`).

  * `[ ]`   `resolveTemplateFilename.mock.ts`
    * `[ ]`   `createResolveTemplateFilenameMock(options?: { result?; handler? })` returning `{ resolveTemplateFilename, calls }`, structured exactly like `createEnqueueRenderJobMock` (`enqueueRenderJob.mock.ts:23-49`); default fallback result `{ templateFilename: 'mock_template.md' }`.
    * `[ ]`   Trusted Factories: `buildResolveTemplateFilenameParams(overrides?)` (default `dbClient` from `createMockSupabaseClient`), `buildResolveTemplateFilenamePayload(overrides?)` (default `{ stageSlug: 'thesis', outputType: 'business_case', documentKey: 'business_case' }`).
    * `[ ]`   COPY the recipe-chain DB fixtures from `enqueueRenderJob.test.ts:73-202` verbatim as this module's own reusable test fixtures (they are shaped exactly for this walk's four tables and nothing else): `mockStageRow` (:73-84), `mockInstanceRow(isCloned)` (:86-96), `mockTemplateStepRow()` (:98-127), `mockClonedStepRow()` (:129-158), and `recipeChainConfig(isCloned)` (:186-202) — export these from `resolveTemplateFilename.mock.ts` rather than re-deriving them, so `enqueueRenderJob.test.ts` (next node) can import them back from here instead of keeping its own copy.

  * `[ ]`   `resolveTemplateFilename.test.ts`
    * `[ ]`   Success, cloned instance: COPY the setup from `enqueueRenderJob.test.ts:625-655` (`recipeChainConfig(true)`), call `resolveTemplateFilename({}, { dbClient }, { stageSlug: 'thesis', outputType: 'business_case', documentKey: 'business_case' })` directly (not through `enqueueRenderJob`), assert `result.templateFilename === 'thesis_business_case.md'` and that the query spy's table calls include `dialectic_stage_recipe_steps` and exclude `dialectic_recipe_template_steps` — same assertion shape as the original, adapted to call the module directly.
    * `[ ]`   Success, non-cloned instance: same pattern from `enqueueRenderJob.test.ts:657-687` (`recipeChainConfig(false)`), asserting the inverse table-call set.
    * `[ ]`   One test per distinct fresh-validation failure branch (2, 5-9, 11 — six of the eleven listed in `construction`), each asserting `'error' in result`, `result.error instanceof TemplateResolutionError`, `result.retriable === false`, and the EXACT error message string.
    * `[ ]`   One test per received-error passthrough branch (1, 3, 4 — stage/instance/steps query error): mock `dbClient` returning a specific `PostgrestError`-shaped error object for that query, asserting `result.error` is REFERENCE-EQUAL to that exact object (NOT `instanceof TemplateResolutionError`, NOT a reconstructed message).
    * `[ ]`   One test for the outer-catch FIX (branch 10): a step deep inside the try block throws an unexpected non-`TemplateResolutionError` exception (e.g. a `TypeError` from malformed step data), asserting `result.error` is REFERENCE-EQUAL to that exact thrown object, not a `wrapped` `TemplateResolutionError`.
    * `[ ]`   Do NOT re-test: `shouldEnqueueRenderJob`'s decision logic, RENDER payload construction, or job insertion — none of that lives here.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Sequential validate-then-query order, IDENTICAL to the original block's order (copy preserves order exactly):
      1. Query `dialectic_stages` by `slug = payload.stageSlug` → `stageError` present → `return { error: stageError, retriable: false }` (FIX — received error surfaced unmodified, not embedded in a new message); else `!stageData` → fresh `TemplateResolutionError("Stage '${stageSlug}' not found")`.
      2. `stageData.active_recipe_instance_id` falsy → fresh `TemplateResolutionError("Stage '${stageSlug}' has no active recipe instance")`.
      3. Query `dialectic_stage_recipe_instances` by `id = active_recipe_instance_id` → `instanceError` present → `return { error: instanceError, retriable: false }` (FIX); else `!instance` → fresh `TemplateResolutionError("Recipe instance '${stageData.active_recipe_instance_id}' not found")`.
      4. Branch on `instance.is_cloned`: `true` → query `dialectic_stage_recipe_steps` by `instance_id`; `false` → query `dialectic_recipe_template_steps` by `template_id` → `stepErr` present → `return { error: stepErr, retriable: false }` (FIX); else `!stepRows || stepRows.length === 0` → fresh `TemplateResolutionError("No cloned recipe steps found for instance '${instance.id}'")` / `TemplateResolutionError("No template recipe steps found for template '${instance.template_id}'")` (message varies by branch, as the original's already did).
      5. Find step where `step.output_type === payload.outputType` → none → fresh `TemplateResolutionError("No recipe step found with output_type '${outputType}' for stage '${stageSlug}'")`.
      6. `matchingStep.outputs_required` missing/invalid → fresh `TemplateResolutionError("Recipe step with output_type '${outputType}' has missing or invalid outputs_required")`.
      7. `outputsRequired.files_to_generate` not a non-empty array → fresh `TemplateResolutionError("Recipe step with output_type '${outputType}' has missing or empty files_to_generate array")`.
      8. Find entry where `entry.from_document_key === payload.documentKey` → none → fresh `TemplateResolutionError("No files_to_generate entry found with from_document_key '${documentKey}' in recipe step with output_type '${outputType}'")`.
      9. `entry.template_filename` not a non-empty string → fresh `TemplateResolutionError("template_filename is missing or invalid in files_to_generate entry for from_document_key '${documentKey}'")`.
      10. Any other thrown exception inside the try block, not already a `TemplateResolutionError`: `error instanceof TemplateResolutionError` → return it as-is (already correct in the original); otherwise → `return { error: error instanceof Error ? error : new Error(String(error)), retriable: false }` (FIX — surfaced exactly as thrown, no longer reformatted into a `wrapped` message).
      11. Final defensive check (preserved from the original's belt-and-suspenders redundancy at `enqueueRenderJob.ts:258-263`): `templateFilename` falsy/empty after the try/catch → fresh `TemplateResolutionError("template_filename must be a non-empty string")`.
      12. Success → `{ templateFilename: templateFilename.trim() }`.

  * `[ ]`   `resolveTemplateFilename.ts` (Implementation)
    * `[ ]`   COPY `enqueueRenderJob.ts:138-256` (the full try block) verbatim into the function body, with these MECHANICAL substitutions only: `stageSlug` → `payload.stageSlug`; `outputType` → `payload.outputType`; `documentKeyAsFileType` → `payload.documentKey`; `dbClient` → `params.dbClient`; every GENUINELY-FRESH `RenderJobValidationError` construction (branches 2, 5-9, 11) → `TemplateResolutionError` (message strings unchanged); every early `return { error: ..., retriable: false }` stays a `return` of the module's own `ResolveTemplateFilenameErrorReturn` shape.
    * `[ ]`   FOUR NON-MECHANICAL fixes, per `objective`'s source-defect analysis (NOT verbatim copies): the stage/instance/steps query-error branches (1, 3, 4) split into a received-error passthrough (`return { error: stageError/instanceError/stepErr, retriable: false };`, no `TemplateResolutionError` involved) and a separate fresh not-found `TemplateResolutionError`; the outer catch's `wrapped` reformatting becomes `return { error: error instanceof Error ? error : new Error(String(error)), retriable: false };`.
    * `[ ]`   COPY `enqueueRenderJob.ts:258-263` (the final defensive check) verbatim with the same substitutions.
    * `[ ]`   On full success: `return { templateFilename };`.
    * `[ ]`   No other logic — this function does nothing `enqueueRenderJob.ts:138-263` didn't already do, beyond the four named error-handling fixes.

  * `[ ]`   `resolveTemplateFilename.provides.ts`
    * `[ ]`   Re-export `resolveTemplateFilename`, all interface types, all guards, and all mock builders (including the copied `recipeChainConfig`/`mockStageRow`/etc. fixtures).

  * `[ ]`   `resolveTemplateFilename.integration.test.ts`
    * `[ ]`   Bounded subsystem: real `resolveTemplateFilename`; only the Supabase client is mocked (external boundary) — same bounded-subsystem style as `enqueueCompressJobs.integration.test.ts`.
    * `[ ]`   Given the full `recipeChainConfig(false)` fixture (non-cloned instance) and a payload matching `mockTemplateStepRow()`'s `output_type`/`from_document_key`, returns the exact `template_filename` from the fixture's `files_to_generate` entry — proving the whole real walk end to end against real fixture data, not mocked at any layer below Supabase.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared utility (DB-backed lookup). Deps inward: none beyond the Supabase client type. Provides outward: `resolveTemplateFilename`/`BoundResolveTemplateFilenameFn` to `enqueueRenderJob.ts` (next node) and, later, `saveResponse.ts` (WS-B). No cycles: this module does not import from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Given `recipeChainConfig(true)` and a matching payload, returns `{ templateFilename: 'thesis_business_case.md' }` querying `dialectic_stage_recipe_steps` (not `dialectic_recipe_template_steps`); given `recipeChainConfig(false)`, the inverse table.
    * `[ ]`   Each of the six fresh-validation failure branches returns `{ error: TemplateResolutionError(<exact copied message>), retriable: false }`; each of the three DB-query-error branches and the outer-catch unexpected-exception branch return the RECEIVED/CAUGHT error object unmodified (`retriable: false`, but NOT reconstructed into `TemplateResolutionError` or any other new object) — per `.github/instructions/error-handling.instructions.md`.
    * `[ ]`   `enqueueRenderJob.ts` is NOT modified by this node (its own four unfixed defects stay in place there); `enqueueRenderJob.test.ts` is NOT modified by this node; both are the next node's responsibility.
    * `[ ]`   `_shared/utils/errors.ts` gains exactly one new class, `TemplateResolutionError`, and no other change.

* `[ ]`   supabase/functions/dialectic-worker/enqueueRenderJob/`enqueueRenderJob.ts` **[BE] Replace the inline template_filename resolution walk with a call to resolveTemplateFilename, injected as a required EnqueueRenderJobDeps field — every dependency is injected, no exception for determinism or DB-boundedness — surfacing its TemplateResolutionError as the exact object returned, never reconstructed into a different error class**

  * `[ ]`   `objective`
    * `[ ]`   Solve the duplication the prior node deliberately left in place: `enqueueRenderJob.ts:138-263` still contains its own copy of the four-query template-resolution walk, now that the SAME logic also exists as the standalone `resolveTemplateFilename` module. This node removes the duplicate by delegating to the module — the only node in this pair permitted to modify `enqueueRenderJob.ts` (the prior node explicitly did not, per its own stated non-functional constraint).
    * `[ ]`   RATIFIED RULE (absolute, no exceptions): every dependency this function calls is INJECTED via `EnqueueRenderJobDeps`, never directly imported and invoked inline — regardless of whether the dependency is pure, deterministic, or already has its own test coverage. Every error an injected dependency returns is surfaced to this function's OWN caller as the EXACT error object produced, with its real type intact — never reconstructed from a message string into a different error class, and never silently downgraded to a generic type.
    * `[ ]`   Functional goal: replace the ENTIRE block `enqueueRenderJob.ts:136-263` (`let templateFilename: string | undefined = undefined;` through the final defensive check) with:
      1. Destructure `resolveTemplateFilename` from `deps` alongside the existing `dbClient, logger, shouldEnqueueRenderJob` (`enqueueRenderJob.ts:31`).
      2. `const templateResult = await deps.resolveTemplateFilename({ dbClient }, { stageSlug, outputType, documentKey: documentKeyAsFileType });` — `resolveTemplateFilename`'s injected form is the BOUND 2-arg closure (`BoundResolveTemplateFilenameFn`), matching how `IPrepareModelJobContext.enqueueModelCall`/every other bound closure in this epic is called — the caller supplies only `params`/`payload`, never `deps`, since the closure already carries its own bound deps from wherever it was constructed. Reuses the SAME `dbClient` (`deps.dbClient`) and the SAME two already-resolved local values (`stageSlug` from `params`, `documentKeyAsFileType` resolved earlier at `:126`) — no new value is computed.
      3. `if ('error' in templateResult) { return templateResult; }` — the REAL `TemplateResolutionError` object, exactly as `resolveTemplateFilename` produced it, returned UNCHANGED. No `new RenderJobValidationError(...)` reconstruction, no message-string extraction, no wrapping.
      4. Else: `const { templateFilename } = templateResult;` — same local name the removed block produced, so the `renderPayload` construction after `:263` (`:265-278`, which reads `templateFilename`) needs no change.
    * `[ ]`   `EnqueueRenderJobErrorReturn.error` (`enqueueRenderJob.interface.ts`) widens from `RenderJobValidationError | RenderJobEnqueueError` to `RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError` — an ADDITIVE union widening (the same pattern this epic already used for `DialecticJobPayload`, `IJobProcessors`, `BuildUploadContextFn`), not a proxy/wrapper type. `isEnqueueRenderJobErrorReturn` (`enqueueRenderJob.interface.guards.ts:191-203`) widens its `instanceof` check to match: `err instanceof RenderJobValidationError || err instanceof RenderJobEnqueueError || err instanceof TemplateResolutionError`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `EnqueueRenderJobParams`/`EnqueueRenderJobPayload`/`EnqueueRenderJobReturn`'s success shape are unchanged — only `EnqueueRenderJobDeps` (new required field) and `EnqueueRenderJobErrorReturn` (widened union) change.
      * `[ ]`   `resolveTemplateFilename` has NO default value in `EnqueueRenderJobDeps` — it is a plain interface (not a class with constructor defaults), matching how `dbClient`/`logger`/`shouldEnqueueRenderJob` are already required with no default. Every caller that constructs `EnqueueRenderJobDeps` MUST now supply it, or the file fails to compile.
      * `[ ]`   This makes `netlifyResponse/index.ts:45-46` (production; builds `EnqueueRenderJobDeps` inline for `boundEnqueueRenderJob`) and `dialectic-worker/index.integration.test.ts:154-155` (the parallel test-harness construction) transiently non-compilable — PERMITTED within the sprint per NODE & SPRINT RULES; NOT fixed by this node (one file per node — `netlifyResponse/index.ts` is a different source file and gets its own dedicated capstone node, mirroring WS-R's `dialectic-worker/index.ts`, last before the Sprint-4 commit).
      * `[ ]`   Everything outside `:136-263` — the pre-checks (`:46-133`), the `renderPayload` construction (`:265-292`), the insert + idempotency-recovery logic (`:294-...`) — is BYTE-IDENTICAL, unchanged.
      * `[ ]`   No change to `_shared/utils/errors.ts` in this node (the prior node already added `TemplateResolutionError`).

  * `[ ]`   `role`
    * `[ ]`   Consumer-side wiring node for the `resolveTemplateFilename` module; the SECOND half of the extraction pair (module-copy node, then this consumer-swap node).
    * `[ ]`   Out of scope: any change to `resolveTemplateFilename.ts` itself (already-written, unchanged); RENDER decision logic (`shouldEnqueueRenderJob`, untouched); job insertion/idempotency recovery (untouched); `netlifyResponse/index.ts`'s wiring (deferred to its own capstone node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/dialectic-worker/enqueueRenderJob/` — `enqueueRenderJob.ts`, `enqueueRenderJob.interface.ts`, `enqueueRenderJob.interface.guards.ts`, and their test files.

  * `[ ]`   `deps`
    * `[ ]`   `BoundResolveTemplateFilenameFn` (`_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts`, prior node) — new REQUIRED `EnqueueRenderJobDeps` field, injected, not imported.
    * `[ ]`   `TemplateResolutionError` (`_shared/utils/errors.ts`, prior node) — new import into `enqueueRenderJob.interface.ts` and `enqueueRenderJob.interface.guards.ts` for the widened union/guard.
    * `[ ]`   Confirm: no reverse dependency (the module doesn't import from `dialectic-worker/`); no lateral violation.

  * `[ ]`   `enqueueRenderJob.interface.ts`
    * `[ ]`   Add `resolveTemplateFilename: BoundResolveTemplateFilenameFn;` to `EnqueueRenderJobDeps`, importing the type from `../../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts`.
    * `[ ]`   Widen `EnqueueRenderJobErrorReturn.error` to `RenderJobValidationError | RenderJobEnqueueError | TemplateResolutionError`, importing `TemplateResolutionError` alongside the existing `RenderJobEnqueueError, RenderJobValidationError` import from `../../_shared/utils/errors.ts` (line 5).

  * `[ ]`   `enqueueRenderJob.interface.guards.ts`
    * `[ ]`   `isEnqueueRenderJobDeps` (:48-65): add `'resolveTemplateFilename' in value` to the required-key check and `typeof value.resolveTemplateFilename === 'function'` to the type check, alongside the existing `shouldEnqueueRenderJob` check.
    * `[ ]`   `isEnqueueRenderJobErrorReturn` (:191-203): widen line 202's `return` to `err instanceof RenderJobValidationError || err instanceof RenderJobEnqueueError || err instanceof TemplateResolutionError`, importing `TemplateResolutionError` alongside the existing errors import (line 6).

  * `[ ]`   `enqueueRenderJob.interface.test.ts`
    * `[ ]`   The `'Contract: EnqueueRenderJobDeps accepts dbClient, logger, shouldEnqueueRenderJob'` test (:21-45) and the two `_missingDb`-style negative tests (:164, :221) each gain `resolveTemplateFilename: <stub returning a fixed success>` in their `EnqueueRenderJobDeps` literal, plus the first test's title/assertions extend to also assert `typeof deps.resolveTemplateFilename === 'function'`.
    * `[ ]`   New test: a `@ts-expect-error`-style compile-time check that an `EnqueueRenderJobDeps` literal omitting `resolveTemplateFilename` is rejected by the type checker — mirrors this file's existing `_missingDb`/`_missingJobId` pattern (:202-240); no `isEnqueueRenderJobDeps` call (that belongs to `enqueueRenderJob.interface.guards.test.ts` or equivalent guard-test file, not here).
    * `[ ]`   New test: `EnqueueRenderJobErrorReturn` accepts `{ error: new TemplateResolutionError('x'), retriable: false }` by direct construction and type assignment — no `isEnqueueRenderJobErrorReturn` call.

  * `[ ]`   `enqueueRenderJob.test.ts`
    * `[ ]`   Import `resolveTemplateFilename` (the real function, `_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts`) and `createResolveTemplateFilenameMock` (`resolveTemplateFilename.mock.ts`, prior node).
    * `[ ]`   Add one shared default: `const defaultResolveTemplateFilename = createResolveTemplateFilenameMock({ result: { templateFilename: 'thesis_business_case.md' } }).resolveTemplateFilename;` near the top of the file, alongside the existing `setupMockClient`/`baseParams`/`basePayload` helpers.
    * `[ ]`   MECHANICAL: add `resolveTemplateFilename: defaultResolveTemplateFilename` to every `const deps: EnqueueRenderJobDeps = {...}` literal in this file (there are ~38) EXCEPT the three named below — every one of these currently omits the now-required field and the file will not compile until each gains it. This is a real, complete edit across the file, not a representative sample.
    * `[ ]`   EXCEPTION 1 — `'template_filename extraction uses dialectic_stage_recipe_steps when instance is_cloned'` (:625-655): its `deps` literal instead gets `resolveTemplateFilename: (params, payload) => resolveTemplateFilename({}, { dbClient: params.dbClient ?? dbClient }, payload)` — i.e. a closure over the REAL module bound to the SAME `dbClient` this test already configures via `recipeChainConfig(true)` — so the test continues to prove real DB-query behavior (asserting `fromSpy` saw `dialectic_stage_recipe_steps`, not `dialectic_recipe_template_steps`) rather than a canned mock result.
    * `[ ]`   EXCEPTION 2 — `'... uses dialectic_recipe_template_steps when instance is not cloned'` (:657-687): identical treatment with `recipeChainConfig(false)`.
    * `[ ]`   EXCEPTION 3 (NEW test) — `'enqueueRenderJob: a resolveTemplateFilename failure surfaces through enqueueRenderJob as the exact TemplateResolutionError object, untouched'`: configure `recipeChainConfig`-shaped mock data with `dialectic_stages` returning no row (the real module's stage-not-found branch), bind the REAL `resolveTemplateFilename` to that `dbClient` the same way as Exceptions 1/2, call `enqueueRenderJob`, and assert `'error' in result`, `result.error instanceof TemplateResolutionError` (NOT `RenderJobValidationError` — proving no reconstruction happened), and `result.error.message` matches the exact `"Failed to query stage for template_filename extraction: ..."` text `resolveTemplateFilename.test.ts` (prior node) asserts for the identical fixture — proving the SAME error object's message survives the round trip, because it IS the same object, not a copy.
    * `[ ]`   Do NOT add: any test re-covering the ten failure branches' own internals (already covered by `resolveTemplateFilename.test.ts`) — only the pass-through behavior is new here.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Call order unchanged: pre-checks → (NEW) injected `resolveTemplateFilename` call, error passed through untouched on failure → `renderPayload` construction → insert — identical position to the block it replaces.

  * `[ ]`   `enqueueRenderJob.ts` (Implementation)
    * `[ ]`   Add `resolveTemplateFilename` to the destructured `deps` at `enqueueRenderJob.ts:31` (`const { dbClient, logger, shouldEnqueueRenderJob, resolveTemplateFilename } = deps;`).
    * `[ ]`   Delete `enqueueRenderJob.ts:136-263` in full (the `let templateFilename` declaration, the entire `try { ... } catch { ... }`, and the final defensive check).
    * `[ ]`   Insert the four-step replacement from `objective` at the same position.
    * `[ ]`   No other line in this file changes.

  * `[ ]`   `enqueueRenderJob.provides.ts` — NONE. No change: this file's re-exports are unaffected (it never exported the removed block's internals).

  * `[ ]`   `enqueueRenderJob.integration.test.ts` — NONE new at this node. The real end-to-end proof of `enqueueRenderJob` → `resolveTemplateFilename` → real DB walk already exists as this file's own test suite (Exceptions 1/2 above, now binding the real module) plus `resolveTemplateFilename.integration.test.ts` (prior node).

  * `[ ]`   `directionality`
    * `[ ]`   Layer: worker orchestration (RENDER spawn). Deps inward: `resolveTemplateFilename.ts` (prior node, injected). Provides outward: `EnqueueRenderJobDeps`'s new required field and `EnqueueRenderJobErrorReturn`'s widened union to every future caller that constructs these — currently `netlifyResponse/index.ts` (capstone node) and `index.integration.test.ts`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `enqueueRenderJob` produces byte-identical `renderPayload.template_filename` values to before the swap, for both cloned and non-cloned recipe instances.
    * `[ ]`   A `resolveTemplateFilename` failure surfaces through `enqueueRenderJob` as the EXACT `TemplateResolutionError` object it was produced as (`instanceof TemplateResolutionError`, not `RenderJobValidationError`), with `retriable: false`.
    * `[ ]`   `resolveTemplateFilename` is a required, injected `EnqueueRenderJobDeps` field with no default; `EnqueueRenderJobErrorReturn.error` accepts all three error classes.
    * `[ ]`   Every existing test in `enqueueRenderJob.test.ts` continues to pass once the mechanical field addition lands; exactly one new behavioral test is added (the pass-through proof) plus the two success-path tests are rebound to the real module.
    * `[ ]`   `netlifyResponse/index.ts` and `index.integration.test.ts` are unmodified by this node (their fix is the dedicated capstone node).

* `[ ]`   supabase/functions/_shared/services/document_renderer/loadDocumentTemplate/`loadDocumentTemplate.ts` **[BE] Extract the template-loading walk (project domain lookup → dialectic_document_templates row → storage download → decode) out of document_renderer.ts into its own function-folder module, as a verbatim COPY (original left untouched), so the relocated renderDocument orchestrator and saveResponse's json-mode COMPRESS branch can load a document's template independently of contribution-chain assembly**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing standalone access to template loading. The walk (project → `selected_domain_id` → `dialectic_document_templates` row by unique `name`/`domain_id`/`is_active` → storage download → decode) exists ONLY as a private inline block in `document_renderer.ts:249-305`, reachable exclusively through the full `renderDocument` call, which also does contribution-chain assembly (`:141-247`), structured rendering (`:468-560`), and persistence (`:562-658`) that neither `saveResponse.ts`'s json-mode COMPRESS branch (WS-B, later node) nor the relocated `renderDocument` orchestrator (WS-B, later node) should have to invoke just to load one template. `saveResponse.ts` needs this for a compression victim's SOURCE document's template, resolved from the payload's `sourceStageSlug`/`docType`/`documentKey` fields via `resolveTemplateFilename` (already-written node) into a `template_filename`, then loaded here — duplicating the walk inline would create two DB+storage implementations of the same lookup that drift the moment one is edited.
    * `[ ]`   This is NOT a pure function (DB + storage boundary) — it gets the complete function-folder module: interface, guards, mock, tests, provides, per the scope's explicit "mock required" call-out for this node.
    * `[ ]`   Functional goal: copy `document_renderer.ts:249-305` VERBATIM into this new module, generalizing the TWO identifiers the block reads from its enclosing scope (`projectId`, `params.template_filename`) into typed `payload` fields (`projectId: string`, `templateFilename: string`). `dbClient` moves from the enclosing function's first argument to `params.dbClient` (module-Params-carries-dbClient convention, matching `resolveTemplateFilename`/`enqueueCompressJobs`/`processCompressJob`); `deps.downloadFromStorage` stays a `Deps` field exactly as it already is in `DocumentRendererDeps` today. Every query, every branch condition, and every error MESSAGE STRING copies unchanged where the identifiers it needs are available to this module; the ONE explicit divergence (see below) is the `stage`/`document` segment of the "No template mapping found" message, which this module cannot reproduce verbatim because `stageSlug`/`documentKey` are not part of its payload (the scope's field census for this node is `projectId`/`templateFilename` only — no stage or document-key identifiers).
    * `[ ]`   Explicit, flagged divergence from "verbatim": `document_renderer.ts:286`'s message reads `` `No template mapping found for stage='${stage}' document='${docKey}' name='${templateNameForQuery}' (from template_filename='${params.template_filename}') domain_id='${projectData.selected_domain_id}': ${...}` ``. This module's copy DROPS the `stage='${stage}' document='${docKey}' ` segment (those identifiers do not exist in `LoadDocumentTemplatePayload`) and keeps the rest verbatim: `` `No template mapping found for name='${templateNameForQuery}' (from template_filename='${templateFilename}') domain_id='${domainId}': ${...}` ``. This is the only wording change in the entire copy; it is a removal of unavailable context, not a rewording of available context.
    * `[ ]`   Error class: define `TemplateLoadError extends Error` in `_shared/utils/errors.ts` (creator-owns-the-data; alongside the file's existing ungrouped domain errors — `ContextWindowError`, `IndexingError`, `RagServiceError`, `NotImplementedError`, `RenderJobValidationError`, `RenderJobEnqueueError`, `TemplateResolutionError` — same flat-file precedent), used for the GENUINELY FRESH validation branches only (see next bullet) — a plain `Error` gives no consumer (`saveResponse.ts`, later) a way to distinguish this module's own fresh failures from any other thrown error.
    * `[ ]`   THREE source defects in this range, per `.github/instructions/error-handling.instructions.md` ("Errors are never converted, coerced, or otherwise modified"; "You get an error, you pass the error along") — the original (`document_renderer.ts:263-265`, `:285-287`, `:302-304`) embeds a RECEIVED error's `.message` into a brand-new `Error`, discarding the original object, and (in one case) conflates that received error with a separate fresh "not found" condition in one throw. FIXED by this node (not perpetuated) — each site returns the received error unmodified when one exists, and only produces a fresh `TemplateLoadError` for the genuinely-new condition:
      1. Project query (`:257-265`): `projectError` present → `return { error: projectError, retriable: false }` (the exact received error, unmodified — NOT a `TemplateLoadError`); else (no error, just no matching row — `!projectData`, distinct from the already-fresh `!projectData?.selected_domain_id` branch 2) is not reachable here since `.maybeSingle()` with no row yields `projectData: null` which branch 2's own falsy check already covers, so no additional split is needed for this query beyond the error/no-error branch.
      2. Template-row query (`:277-287`): `templateErr` present → `return { error: templateErr, retriable: false }`; else `!templateRow` (no error, no matching row) → fresh `TemplateLoadError("No template mapping found for name='${templateNameForQuery}' (from template_filename='${payload.templateFilename}') domain_id='${projectData.selected_domain_id}')")` — the two conditions the original conflated into one message with a ternary are now two distinct branches, neither reconstructing the other's error.
      3. Storage download (`:297-304`): `templateDownloadErr` present → `return { error: templateDownloadErr, retriable: false }`; else `!templateData` (no error, no data) → fresh `TemplateLoadError("No data returned downloading template '${fullTemplatePath}' from bucket '${templateBucket}'")`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `document_renderer.ts` is NOT modified by this node — it still contains its own inline copy of the walk (including its three unfixed defects, which stay in place there); the swap to consume this module happens in the `renderDocument` relocation node (later, WS-B), which is what proves this module's behavior matches via the (until-then-untouched) `document_renderer.test.ts` suite.
      * `[ ]`   Every failure path returns `retriable: false`, matching the original block's uniform choice — the original throws a plain `Error` on every branch with no retriable concept at all, and (per the `resolveTemplateFilename` node's own established reasoning, directly on point here) this extraction preserves that exactly rather than reconsidering retriability mid-copy.
      * `[ ]`   No logging: the original block (`document_renderer.ts:249-305`) contains zero `logger.*` calls — this module adds none, matching exactly.
      * `[ ]`   This module returns ONLY the decoded template text (`{ templateText: string }`) — it does not return the template row's `storage_bucket`/`storage_path`/`file_name`/`id`, none of which any documented consumer (`renderDocument` orchestrator, `saveResponse.ts`) needs after the string is in hand.

  * `[ ]`   `role`
    * `[ ]`   New shared-service module (`_shared/services/document_renderer/`, sibling-to-be for `renderStructuredDocument`/`assembleContributionChain`/`mergeChunkContent`, this sprint's later nodes) — DB+storage-backed template loading, callable independent of contribution-chain assembly, structured rendering, or persistence.
    * `[ ]`   Out of scope (each its own node, this sprint): contribution-chain assembly (`assembleContributionChain`); flat/per-item structured rendering (`renderStructuredDocument`, next node — consumes this module's `templateText` output as a plain string parameter, does not call this module itself); persistence and the `render_completed` notification tail (`renderDocument` orchestrator, later node); any COMPRESS-specific logic (this module is compression-agnostic — it takes a generic `projectId`/`templateFilename` and knows nothing about compression; `saveResponse.ts`'s COMPRESS branch, later node, is a CONSUMER of this module, not defined by it).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/services/document_renderer/loadDocumentTemplate/` plus its one companion touch, `_shared/utils/errors.ts` (new error class only).
    * `[ ]`   Inside boundary: the project→domain_id lookup, the template-row query by unique `name`/`domain_id`/`is_active`, the storage download, the decode-to-string.
    * `[ ]`   Outside boundary: contribution-chain walking, structured-record rendering, persistence/notification, any COMPRESS-specific logic.

  * `[ ]`   `deps`
    * `[ ]`   `downloadFromStorage: DownloadFromStorageFn` (`_shared/supabase_storage_utils.ts`) — the storage-read external boundary; identical dependency shape to `DocumentRendererDeps.downloadFromStorage` today (`document_renderer.interface.ts:51`).
    * `[ ]`   `SupabaseClient<Database>` arrives via `params.dbClient` — no `dbClient` on `Deps` (matches the `resolveTemplateFilename`/`enqueueCompressJobs`/`processCompressJob` Params-carries-dbClient convention already established this epic).
    * `[ ]`   Confirm: no reverse dependency (nothing existing references this module); no lateral violation (this node does not import from `dialectic-worker/`).

  * `[ ]`   `loadDocumentTemplate.interface.test.ts`
    * `[ ]`   Valid: a payload with non-empty `projectId`/`templateFilename` and a `params.dbClient` type-checks.
    * `[ ]`   `LoadDocumentTemplateSuccessReturn { templateText: string }` and `LoadDocumentTemplateErrorReturn { error: Error; retriable: boolean }` never co-occur.

  * `[ ]`   `loadDocumentTemplate.interface.ts`
    * `[ ]`   `export interface LoadDocumentTemplateDeps { downloadFromStorage: DownloadFromStorageFn }`, importing `DownloadFromStorageFn` from `../../../supabase_storage_utils.ts`.
    * `[ ]`   `export interface LoadDocumentTemplateParams { dbClient: SupabaseClient<Database>; }`, importing `Database` from `../../../../types_db.ts` and `SupabaseClient` from `npm:@supabase/supabase-js@2`.
    * `[ ]`   `export interface LoadDocumentTemplatePayload { projectId: string; templateFilename: string; }` — the two identifiers the copied walk reads (see objective).
    * `[ ]`   `export type LoadDocumentTemplateSuccessReturn = { templateText: string };`.
    * `[ ]`   `export type LoadDocumentTemplateErrorReturn = { error: Error; retriable: boolean };` — typed as plain `Error`, NOT `TemplateLoadError`, because the project-query/template-query/storage-download branches return the RECEIVED error unmodified, which is not guaranteed to be a `TemplateLoadError` instance; `TemplateLoadError extends Error` so the fresh-validation branches still satisfy this type. Imports `TemplateLoadError` from `../../../utils/errors.ts` (relative to the module folder) for the fresh-validation branches only.
    * `[ ]`   `export type LoadDocumentTemplateReturn = LoadDocumentTemplateSuccessReturn | LoadDocumentTemplateErrorReturn;`.
    * `[ ]`   `export type LoadDocumentTemplateFn = (deps: LoadDocumentTemplateDeps, params: LoadDocumentTemplateParams, payload: LoadDocumentTemplatePayload) => Promise<LoadDocumentTemplateReturn>;` and `export type BoundLoadDocumentTemplateFn = (params: LoadDocumentTemplateParams, payload: LoadDocumentTemplatePayload) => Promise<LoadDocumentTemplateReturn>;`.

  * `[ ]`   `loadDocumentTemplate.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: the relocated `renderDocument` orchestrator (WS-B, later node — one call, its output string fed into `renderStructuredDocument`) and `saveResponse.ts`'s json-mode COMPRESS branch (WS-B, later node — resolving `templateFilename` from the payload's `sourceStageSlug`/`docType`/`documentKey` via `resolveTemplateFilename` first).
    * `[ ]`   Required interaction: two sequential reads (`dialectic_projects` then `dialectic_document_templates`), one storage download — no writes, ever.
    * `[ ]`   Failure modes: the five distinct failure branches enumerated in `construction` below — all `retriable: false`.

  * `[ ]`   `loadDocumentTemplate.guard.test.ts` / `loadDocumentTemplate.guard.ts`
    * `[ ]`   `isLoadDocumentTemplateParams` accepts `{ dbClient: <object> }`; rejects a non-object `dbClient`.
    * `[ ]`   `isLoadDocumentTemplatePayload` accepts a payload with both non-empty string fields; rejects any missing or empty (`''`) field.
    * `[ ]`   `isLoadDocumentTemplateSuccessReturn`/`isLoadDocumentTemplateErrorReturn` mirror the mutual-exclusion pattern already established by `isEnqueueRenderJobSuccessReturn`/`ErrorReturn` (`enqueueRenderJob.interface.guards.ts:177-203`).

  * `[ ]`   `loadDocumentTemplate.mock.ts`
    * `[ ]`   `createLoadDocumentTemplateMock(options?: { result?; handler? })` returning `{ loadDocumentTemplate, calls }`, structured exactly like `createResolveTemplateFilenameMock`; default fallback result `{ templateText: 'mock template text' }`.
    * `[ ]`   Trusted Factories: `buildLoadDocumentTemplateParams(overrides?)` (default `dbClient` from `createMockSupabaseClient`), `buildLoadDocumentTemplatePayload(overrides?)` (default `{ projectId: 'project_123', templateFilename: 'thesis_business_case.md' }`).
    * `[ ]`   COPY the template fixtures from `document_renderer.test.ts` verbatim as this module's own reusable test fixtures (shaped exactly for this walk's two tables): the `REAL_THESIS_BUSINESS_CASE_TEMPLATE` string constant (`document_renderer.test.ts:16-79`), a `mockProjectRow(domainId)` builder (matching the `{ id, selected_domain_id }` shape used at `:2171-2173`/`:2327-2329`), and a `mockDocumentTemplateRow(overrides?)` builder (matching the `Database['public']['Tables']['dialectic_document_templates']['Row']` shape used at `:2153-2164`/`:2296-2320`) — export these from `loadDocumentTemplate.mock.ts` rather than re-deriving them, so `document_renderer.test.ts` (consumed by the later relocation node) can import them back from here instead of keeping its own copies.

  * `[ ]`   `loadDocumentTemplate.test.ts`
    * `[ ]`   Success, single matching template: COPY the setup from `document_renderer.test.ts:2103-2237` (`templateRecord` fixture, the `dialectic_projects`/`dialectic_document_templates` mock results, the storage-download stub keyed on `thesis_business_case.md`), call `loadDocumentTemplate({ downloadFromStorage }, { dbClient }, { projectId: 'project_123', templateFilename: 'thesis_business_case.md' })` directly (not through `renderDocument`), assert `result.templateText === REAL_THESIS_BUSINESS_CASE_TEMPLATE` and that the query spy's table calls include `dialectic_projects` and `dialectic_document_templates`.
    * `[ ]`   Success, unique-name disambiguation: COPY the setup from `document_renderer.test.ts:2239-2386` (two templates in storage — a `dialectic_document_templates` row and a differently-named prompt-template fixture — where only the unique `name` match is returned by the query), asserting the resolved `templateText` is the one from the document-template's storage path, not the prompt-template's — proving the query keys on unique `name`, not a pattern match.
    * `[ ]`   One test per each of the two genuinely-fresh failure branches (2, 5), each asserting `'error' in result`, `result.error instanceof TemplateLoadError`, `result.retriable === false`, and the exact (branch-4's fresh half carries the flagged divergence) error message string.
    * `[ ]`   One test per received-error passthrough branch (1, 4, 6 — project/template query error, storage download error): mock the dependency returning a specific error object for that call, asserting `result.error` is REFERENCE-EQUAL to that exact object (NOT `instanceof TemplateLoadError`, NOT a reconstructed message).
    * `[ ]`   Do NOT re-test: contribution-chain assembly, structured rendering, or persistence — none of that lives here.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Sequential validate-then-query order, IDENTICAL to the original block's order (copy preserves order exactly):
      1. Query `dialectic_projects` by `id = payload.projectId`, `select('selected_domain_id')`, `.maybeSingle()` → `projectError` present → `return { error: projectError, retriable: false }` (FIX — received error surfaced unmodified, not embedded in a new message).
      2. `!projectData?.selected_domain_id` (covers both "no row" and "row present but field falsy" — no error involved) → fresh `TemplateLoadError("Project '${payload.projectId}' does not have a selected_domain_id. Template lookup requires domain_id.")`.
      3. Strip a trailing `.md` from `payload.templateFilename` to get `templateNameForQuery` (unchanged logic from `document_renderer.ts:273-275`).
      4. Query `dialectic_document_templates` by `name = templateNameForQuery`, `domain_id = projectData.selected_domain_id`, `is_active = true`, `.maybeSingle()` → `templateErr` present → `return { error: templateErr, retriable: false }` (FIX); else `!templateRow` (no error, no matching row) → fresh `TemplateLoadError("No template mapping found for name='${templateNameForQuery}' (from template_filename='${payload.templateFilename}') domain_id='${projectData.selected_domain_id}')")` (this also carries the already-flagged divergence: no `stage=`/`document=` segment — see objective; the two conditions the original conflated with a ternary are now two distinct branches).
      5. `templateRow.storage_bucket`/`storage_path`/`file_name` any falsy → fresh `TemplateLoadError("Invalid template row: ${JSON.stringify(templateRow)}")`.
      6. `deps.downloadFromStorage(params.dbClient, templateBucket, fullTemplatePath)` → `templateDownloadErr` present → `return { error: templateDownloadErr, retriable: false }` (FIX); else `!templateData` (no error, no data) → fresh `TemplateLoadError("No data returned downloading template '${fullTemplatePath}' from bucket '${templateBucket}'")`.
      7. Success → decode via `new TextDecoder().decode(templateData)`, return `{ templateText }`.

  * `[ ]`   `loadDocumentTemplate.ts` (Implementation)
    * `[ ]`   COPY `document_renderer.ts:249-305` verbatim into the function body, with these MECHANICAL substitutions only: `projectId` → `payload.projectId`; `params.template_filename` → `payload.templateFilename`; the enclosing function's `dbClient` argument → `params.dbClient`; `deps.downloadFromStorage` unchanged; the GENUINELY FRESH `new Error(...)` constructions (branches 2, 5) → `new TemplateLoadError(...)` (message strings unchanged); the block's local `stage`/`docKey` consts (`document_renderer.ts:253-254`) are DROPPED (not copied) — they existed only to populate the message segment this module cannot reproduce.
    * `[ ]`   THREE NON-MECHANICAL fixes, per `objective`'s source-defect analysis (NOT verbatim copies): the project-query, template-query, and storage-download branches (1, 4, 6) each split into a received-error passthrough (`return { error: projectError/templateErr/templateDownloadErr, retriable: false };`, no `TemplateLoadError` involved) and a separate fresh not-found/no-data `TemplateLoadError`.
    * `[ ]`   On success: `return { templateText: template };` (`template` = the decoded string, `document_renderer.ts:305`) instead of falling through into Phase 1 chunk downloads (`:307+`), which are `renderDocument`'s own responsibility, not this module's.
    * `[ ]`   No other logic — this function does nothing `document_renderer.ts:249-305` didn't already do, beyond the dropped `stage`/`docKey` message context and the three named error-handling fixes.

  * `[ ]`   `loadDocumentTemplate.provides.ts`
    * `[ ]`   Re-export `loadDocumentTemplate`, all interface types, all guards, and all mock builders (including the copied `REAL_THESIS_BUSINESS_CASE_TEMPLATE`/`mockProjectRow`/`mockDocumentTemplateRow` fixtures).

  * `[ ]`   `loadDocumentTemplate.integration.test.ts`
    * `[ ]`   Bounded subsystem: real `loadDocumentTemplate`; the Supabase client AND `downloadFromStorage` are both mocked (the two genuine external boundaries — DB and storage).
    * `[ ]`   Given a `dialectic_projects` row with a `selected_domain_id` and a matching active `dialectic_document_templates` row, a real call resolves the exact `templateText` the storage mock serves for that row's `storage_bucket`/`storage_path`/`file_name` — proving the whole real walk end to end, not mocked at any layer below the DB/storage adapters.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared service (DB+storage-backed lookup). Deps inward: none beyond the Supabase client type and `DownloadFromStorageFn`. Provides outward: `loadDocumentTemplate`/`BoundLoadDocumentTemplateFn` to the relocated `renderDocument` orchestrator and to `saveResponse.ts`'s json-mode COMPRESS branch (both later WS-B nodes) — NOT to `renderStructuredDocument` (next node), which only consumes an already-loaded template string, not this module. No cycles: this module does not import from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Given a project with a `selected_domain_id` and a matching active template row, returns `{ templateText }` equal to the decoded storage content.
    * `[ ]`   Given multiple templates in storage where only one matches the unique `name`, returns that one — disambiguation is by unique `name`, not a pattern match.
    * `[ ]`   The two genuinely-fresh failure branches (2, 5) return `{ error: TemplateLoadError(<message>), retriable: false }`, branch 4's fresh half correctly omitting the `stage=`/`document=` segment per the flagged divergence; the three received-error branches (1, 4, 6) return the RECEIVED error object unmodified (`retriable: false`, but NOT reconstructed into `TemplateLoadError` or any other new object) — per `.github/instructions/error-handling.instructions.md`.
    * `[ ]`   `document_renderer.ts` is NOT modified by this node (its own three unfixed defects stay in place there); `document_renderer.test.ts` is NOT modified by this node — both remain the `renderDocument` relocation node's responsibility (later, WS-B).
    * `[ ]`   `_shared/utils/errors.ts` gains exactly one new class, `TemplateLoadError`, and no other change.

* `[ ]`   supabase/functions/_shared/services/document_renderer/renderStructuredDocument/`renderStructuredDocument.ts` **[BE] Extract the flat-vs-per-item structured-record rendering strategy (plus its format helpers and comment stripping) out of document_renderer.ts into its own PURE function-folder module, as a verbatim COPY (original left untouched)**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing standalone access to structured-record rendering. The strategy (extract template `{{#section:NAME}}` names → decide flat vs per-item rendering → render via `renderPrompt` → strip template comments) exists ONLY as an inline block in `document_renderer.ts:468-560`, plus three inner helper functions defined in that same range (`stripTemplateComments`, `extractTemplateSectionNames`, `formatRecordForRender`) and three module-level format helpers used by it (`titleFromDocumentKey`, `formatValueAsMarkdown`, `formatObjectFieldsAsMarkdown`, `document_renderer.ts:22-112`) — all reachable only through the full `renderDocument` call, which also does contribution-chain assembly (`:141-247`), template loading (`:249-305`, extracted to its own module by the prior node), the chunk-merge pipeline (`:307-466`), and persistence (`:562-658`).
    * `[ ]`   This IS a pure function (template text + an already-merged structured record + a document key in, a rendered string out) — per the ratified scope, it gets the REDUCED module treatment the `path_constructor.ts` node established: a types file + tests, no `Deps`/`Params`/`Payload`/`Return` DI split, no guard file, no mock file, no provides file, no integration test — because there is no I/O boundary and no injected dependency to guard, mock, or integrate against.
    * `[ ]`   Functional goal: copy `document_renderer.ts:468-560` (the strategy + its three inner helpers) and `document_renderer.ts:22-112` (`titleFromDocumentKey`, `formatValueAsMarkdown`, `formatObjectFieldsAsMarkdown`) VERBATIM into this new module as a single exported function taking exactly the three inputs the scope names: `templateText: string`, `structuredRecord: Record<string, unknown>` (the caller's already-merged data — `mergeChunkContent`, a later node this sprint, owns producing it; this module never merges or sanitizes), `documentKey: FileType`. Returns the rendered `string` (NOT `Uint8Array` — byte-encoding stays the orchestrator's job, `document_renderer.ts:562`).
    * `[ ]`   Explicit scope boundary: the "convert array values to strings for renderPrompt" loop at `document_renderer.ts:456-466` is NOT copied here — it belongs to `mergeChunkContent` (later node this sprint; scope's own `mergeChunkContent` node text names this exact range as its "array-join normalization" responsibility). This module's `structuredRecord` input arrives already normalized.
    * `[ ]`   Explicit, flagged behavior drop: `document_renderer.ts:530-534`'s `deps.logger?.info?.('[renderDocument] Using per-item rendering strategy', {...})` diagnostic call is DROPPED, not preserved — a pure function with no `Deps` has nothing to log through. No existing test asserts on this log call (confirmed: none of the array-content test steps check `logger` spy calls), so nothing observable is lost.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `document_renderer.ts` is NOT modified by this node — copy-first sequencing; the swap happens in the `renderDocument` relocation node (later, WS-B), proven via the then-still-untouched `document_renderer.test.ts`/`document_renderer.examples.test.ts` suites.
      * `[ ]`   `renderPrompt` (`_shared/prompt-renderer.ts`) is imported DIRECTLY, not injected — matching `document_renderer.ts:16`'s own existing direct-import style for this exact call today (this is a copy of existing behavior, not a redesign into the DI convention other, I/O-boundary nodes this sprint use).
      * `[ ]`   No new validation is added: the original block performs none beyond what's already there (e.g. it does not check `structuredRecord` is non-empty or `templateText` is non-empty) — this copy preserves that exactly; a total function over its documented input shapes, not a validating one.

  * `[ ]`   `role`
    * `[ ]`   New shared-service module (`_shared/services/document_renderer/`, sibling to `loadDocumentTemplate` and the later `assembleContributionChain`/`mergeChunkContent` nodes) — pure structured-record-to-Markdown rendering, callable independent of template loading, chain assembly, chunk merging, or persistence.
    * `[ ]`   Out of scope: template loading (`loadDocumentTemplate`, already-written node — this module receives `templateText` as a plain string parameter, it does not load one); contribution-chain assembly; the chunk download/sanitize/merge/array-join pipeline (`mergeChunkContent`, later node — this module receives `structuredRecord` already merged and normalized); persistence and the `render_completed` notification tail (`renderDocument` orchestrator, later node).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/services/document_renderer/renderStructuredDocument/` only — no companion touch to any other file (unlike the prior two nodes, this one adds no new error class; the original block never throws).
    * `[ ]`   Inside boundary: template-section-name extraction, the flat-vs-per-item rendering decision, per-item join with `'\n\n---\n\n'`, `formatRecordForRender`/`formatValueAsMarkdown`/`formatObjectFieldsAsMarkdown`/`titleFromDocumentKey`, comment stripping.
    * `[ ]`   Outside boundary: template loading, chain assembly, chunk merging/sanitization/array-join, persistence, notifications, any COMPRESS-specific logic.

  * `[ ]`   `deps`
    * `[ ]`   NONE. This function takes exactly three plain arguments (`templateText`, `structuredRecord`, `documentKey`) — no `Deps` object, matching the `path_constructor.ts`/`ConstructStoragePathFn` precedent (`(context: PathContext) => ConstructedPath`, no DI split) rather than this sprint's `Fn(deps, params, payload)` I/O-boundary convention.
    * `[ ]`   `renderPrompt` (`_shared/prompt-renderer.ts`) and `isRecord` (`_shared/utils/type_guards.ts`) are imported directly as pure, deterministic helpers — not injected, matching the original file's own import style for both.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this node does not import from `dialectic-worker/`.

  * `[ ]`   `context_slice`
    * `[ ]`   From its three inputs, the function reads: every `{{#section:NAME}}` name in `templateText`; every own-enumerable key and value of `structuredRecord` (recursively, for nested objects/arrays); `documentKey` (stringified once, for the per-item `title` field via `titleFromDocumentKey`). Nothing else — no DB, no storage, no other `RenderDocumentParams` field.
    * `[ ]`   Confirm: no over-fetching; no hidden coupling to `RenderDocumentParams`, `DocumentRendererDeps`, or any other module's shape.

  * `[ ]`   `renderStructuredDocument.types.ts` (plays this module's Contract Definition + Structural Boundary role; matches the `path_constructor.types.ts` precedent of a single-member contract file rather than a separate `.interface.ts`/`.interface.test.ts` pair, since there is no `Deps`/`Params`/`Payload`/`Return` shape to define)
    * `[ ]`   `export type RenderStructuredDocumentFn = (templateText: string, structuredRecord: Record<string, unknown>, documentKey: FileType) => string;`, importing `FileType` from `../../../types/file_manager.types.ts`.

  * `[ ]`   `renderStructuredDocument.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: the relocated `renderDocument` orchestrator (WS-B, later node — one call per document, its `templateText` argument sourced from `loadDocumentTemplate`, its `structuredRecord` argument sourced from `mergeChunkContent`).
    * `[ ]`   Required interaction: none beyond a single, synchronous, in-process call to `renderPrompt` — no DB, no storage, no network.
    * `[ ]`   Failure modes: none of its own — a total function over its documented input shapes; any failure the original block could exhibit (e.g. `renderPrompt` throwing on malformed template syntax) is `renderPrompt`'s own existing, already-tested failure surface, unchanged by this extraction.

  * `[ ]`   `renderStructuredDocument.guard.test.ts` / `renderStructuredDocument.guard.ts` — NONE. There is no `Deps`/`Params`/`Payload`/`Return` shape to guard: the function's three arguments are plain `string`/`Record<string, unknown>`/`FileType` values type-checked by the compiler at every call site, exactly like `constructStoragePath`'s single `PathContext` argument has no runtime guard of its own inside `path_constructor.ts`.

  * `[ ]`   `renderStructuredDocument.mock.ts` — NONE. No mock file exists for this function and none is created here: it is pure and deterministic (no I/O, no injected service to simulate), matching the scope's own explicit "no mock (path_constructor precedent)" call-out; consumers (the later `renderDocument` orchestrator node) call the real function directly in their own tests.

  * `[ ]`   `renderStructuredDocument.test.ts` (Behavioral Verification)
    * `[ ]`   Section-based flat rendering with omitted-section removal: COPY the fixture from `document_renderer.test.ts:2527-2651` (`REAL_THESIS_BUSINESS_CASE_TEMPLATE`, `structuredData` with `competitive_analysis` intentionally omitted), call `renderStructuredDocument(REAL_THESIS_BUSINESS_CASE_TEMPLATE, structuredData, FileType.business_case)` directly, assert the result equals `renderPrompt(REAL_THESIS_BUSINESS_CASE_TEMPLATE, structuredData)` exactly (the original test's own assertion, `:2647-2648`) and that omitted-section tags are absent.
    * `[ ]`   Per-item rendering: COPY the fixture from `document_renderer.test.ts:4362-4503` (`FEATURE_SPEC_TEMPLATE`, `arrayContent.features` — two feature objects whose fields overlap the template's section names), call directly with `structuredRecord: arrayContent`, assert the result contains both features' names/objectives, each rendered through a separate `renderPrompt` pass and joined.
    * `[ ]`   Separator concatenation: COPY the fixture from `document_renderer.test.ts:4505` onward (two-feature array, same template family), assert the joined output contains the `'\n\n---\n\n'` separator exactly once between the two rendered items.
    * `[ ]`   Flat-rendering regression guard: COPY the fixture from `document_renderer.test.ts:4634` (a data shape where NO per-item conditions hold — e.g. `topLevelMatchCount > 0` or no single array-of-objects key), asserting the flat path is taken, not per-item (regression guard against the strategy misfiring).
    * `[ ]`   Nested-array bullet formatting: COPY the fixture from `document_renderer.test.ts:4765` (a field whose value is an array of strings nested inside an object field), asserting `formatObjectFieldsAsMarkdown`'s bullet-list branch renders each string as a `- item` line.
    * `[ ]`   Comment stripping: COPY the fixture from `document_renderer.test.ts:4904` (a template containing an `<!-- Template: ... -->` comment), asserting the final rendered output has the comment removed via `stripTemplateComments`.
    * `[ ]`   Tech-stack nested objects: COPY the fixture from `document_renderer.test.ts:5048` (nested object fields within an array-of-objects item), asserting `formatObjectFieldsAsMarkdown`'s indented sub-field branch renders correctly.
    * `[ ]`   `titleFromDocumentKey`, `formatValueAsMarkdown`, `formatObjectFieldsAsMarkdown`, `formatRecordForRender`, `extractTemplateSectionNames`, and `stripTemplateComments` are internal, unexported implementation details of `renderStructuredDocument.ts` — none gets its own test file; each is exercised entirely through the public function's cases above (the per-item/nested-array/tech-stack cases already exercise every one of `formatObjectFieldsAsMarkdown`'s branches; the flat/section case exercises `titleFromDocumentKey`/`extractTemplateSectionNames`; the comment-stripping case exercises `stripTemplateComments`).
    * `[ ]`   Do NOT re-test: `renderPrompt`'s own substitution correctness (already covered by `prompt-renderer.test.ts`) — only this function's strategy selection and formatting.

  * `[ ]`   `renderStructuredDocument.examples.test.ts` (Behavioral Verification — becomes this module's examples test file, per the redistribution-map appendix's disposition for `document_renderer.examples.test.ts`)
    * `[ ]`   COPY all four `t.step`s from `document_renderer.examples.test.ts`'s `"DocumentRenderer - multi-structure JSON rendering patterns"` (:451) as direct calls to `renderStructuredDocument`, one per fixture family: `system_architecture` flat/string-array data (:457), `tech_stack` mixed flat+array-of-objects data (:591), `product_requirements` content-wrapped/SWOT/features data (:762), `feature_spec` per-item data (:1019) — each asserting the rendered Markdown matches the pattern-specific expectations already asserted in the original file, called directly instead of through `renderDocument`.
    * `[ ]`   These are pure data-pattern→Markdown fixtures with no DB/storage setup to strip — the COPY is a direct call-site swap (`renderDocument(dbClient, deps, params)` → `renderStructuredDocument(templateText, structuredRecord, documentKey)`), not a re-derivation.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Order, IDENTICAL to the original block's order (copy preserves order exactly):
      1. `extractTemplateSectionNames(templateText)` → `templateSections: Set<string>`.
      2. `dataKeys = Object.keys(structuredRecord)`; `topLevelMatchCount = dataKeys.filter(k => templateSections.has(k)).length`.
      3. `topLevelMatchCount === 0` → check for exactly one top-level key whose value is a non-empty array of records (`arrayOfObjectsKeys`); if exactly one AND at least one of its items' own keys matches a template section name → per-item rendering: for each item, build a fresh `Record<string, unknown>` copy of the item's own-enumerable keys, `renderPrompt(templateText, formatRecordForRender(itemRecord, documentKey))` per item, join all results with `'\n\n---\n\n'`. Otherwise (zero or >1 array-of-objects keys, or no item field matches) → flat rendering: `renderPrompt(templateText, formatRecordForRender(structuredRecord, documentKey))`.
      4. `topLevelMatchCount > 0` → flat rendering (same call as the flat branch above).
      5. `stripTemplateComments(rendered)` → return the final string.

  * `[ ]`   `renderStructuredDocument.ts` (Implementation)
    * `[ ]`   COPY `document_renderer.ts:468-560` verbatim, with these MECHANICAL substitutions only: the enclosing function's `template`/`mergedStructuredData`/`documentKey` locals → the new function's `templateText`/`structuredRecord`/`documentKey` parameters; DROP the `deps.logger?.info?.(...)` call at `:530-534` (see objective); the function returns `rendered` (the stripped string) instead of falling through to byte-encoding (`:562`) and path/persistence logic (`:564+`), which stay with the orchestrator.
    * `[ ]`   COPY `document_renderer.ts:22-112` (`titleFromDocumentKey`, `formatValueAsMarkdown`, `formatObjectFieldsAsMarkdown`) verbatim as module-scope (unexported) helper functions in this same file.
    * `[ ]`   COPY the three inner helpers (`stripTemplateComments`, `extractTemplateSectionNames`, `formatRecordForRender`, `document_renderer.ts:469-497`) verbatim, either as nested functions inside `renderStructuredDocument` (matching the original's nesting) or as module-scope unexported helpers alongside the three above — either is behavior-identical; pick module-scope for consistency with the other three copied helpers.
    * `[ ]`   No other logic — this function does nothing `document_renderer.ts:468-560` didn't already do, minus the dropped logger call.

  * `[ ]`   `renderStructuredDocument.provides.ts` — NONE. This module has exactly one planned consumer this sprint (the relocated `renderDocument` orchestrator, later node), which imports `renderStructuredDocument` directly from `renderStructuredDocument.ts` — mirroring how `renderPrompt`, the pure function this module itself wraps, has no `.provides.ts` and is imported directly by every caller. An indirection layer for a single, same-sprint consumer is unwarranted.

  * `[ ]`   `renderStructuredDocument.integration.test.ts` — NONE. This pure function has no external boundary (no DB, no storage, no network) to integrate across — it operates only on in-memory arguments and delegates to the already-tested pure `renderPrompt`, matching `path_constructor.ts`'s own reasoning for omitting an integration test.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared service (pure rendering). Deps inward: `renderPrompt`/`isRecord` (pure, directly imported), `FileType` (`file_manager.types.ts`). Provides outward: `renderStructuredDocument`/`RenderStructuredDocumentFn` to the relocated `renderDocument` orchestrator (later WS-B node) only. No cycles: this module does not import from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Given `REAL_THESIS_BUSINESS_CASE_TEMPLATE` and a structured record omitting one section, the result equals `renderPrompt(templateText, structuredRecord)` exactly, with the omitted section's tags absent.
    * `[ ]`   Given a record with exactly one top-level array-of-objects key whose items' fields match template sections, the result renders the template once per item, joined by `'\n\n---\n\n'`.
    * `[ ]`   Given a record where no per-item condition holds, the result renders flat (single `renderPrompt` call over the whole record) — proven as a regression guard, not merely the per-item case's absence.
    * `[ ]`   Nested array-of-strings and array-of-objects fields render as bulleted/indented Markdown per `formatObjectFieldsAsMarkdown`'s existing rules; template comments are stripped from the final output.
    * `[ ]`   All four `document_renderer.examples.test.ts` data-pattern cases (system_architecture, tech_stack, product_requirements, feature_spec) produce identical Markdown when called directly versus through the original `renderDocument` pipeline.
    * `[ ]`   `document_renderer.ts`, `document_renderer.test.ts`, and `document_renderer.examples.test.ts` are NOT modified by this node — all three remain the `renderDocument` relocation node's responsibility (later, WS-B).
    * `[ ]`   No new error class, no new dependency, no DB/storage access is introduced by this node.

* `[ ]`   supabase/functions/_shared/services/document_renderer/assembleContributionChain/`assembleContributionChain.ts` **[BE] Extract the contribution-chain query, identity filter, edit-preferring dedupe, root find, target_contribution_id chain walk, and modelSlug/attemptCount/sourceGroupFragment/sourceAnchorModelSlug extraction out of document_renderer.ts into its own function-folder module, as a verbatim COPY (original left untouched) — not needed by compression, extracted so the deleted monolith leaves no orphaned responsibilities**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing standalone access to contribution-chain assembly. The walk (query `dialectic_contributions` by session/iteration/document-identity → filter to the exact document → dedupe by `file_name` preferring user edits → find the `target_contribution_id === null` root → walk the chain forward → parse `modelSlug`/`attemptCount` from the base chunk's storage path → extract `sourceGroupFragment`/`sourceAnchorModelSlug`) exists ONLY as a private inline block in `document_renderer.ts:141-247`, reachable exclusively through the full `renderDocument` call, which also does template loading (`:249-305`, already extracted), the chunk-merge pipeline (`:307-466`), structured rendering (`:468-560`, already extracted), and persistence (`:562-658`).
    * `[ ]`   This module is NOT needed by compression (COMPRESS victims are resource documents/history messages/feedback, not multi-chunk contribution chains) — it is extracted purely so the deleted monolith (`renderDocument` relocation node, later this sprint) leaves no orphaned responsibility behind, per the scope's own explicit statement for this node.
    * `[ ]`   This is NOT a pure function (DB boundary — one `dialectic_contributions` query) — it gets the complete function-folder module (interface, guards, mock, tests, provides, integration test) per the scope's explicit "Support: full module" call-out for this node.
    * `[ ]`   Functional goal: copy `document_renderer.ts:141-247` VERBATIM into this new module, generalizing the FOUR identifiers the block reads from its enclosing scope (`sessionId`, `iterationNumber`, `stageSlug`, `documentIdentity`) into typed `payload` fields of the SAME names (no renaming needed — these are already generic, non-RENDER-specific identifiers, unlike `resolveTemplateFilename`'s `stageSlug`/`outputType`/`documentKey` generalization). `dbClient` moves from the enclosing function's first argument to `params.dbClient`. Every query, every branch condition, and every error MESSAGE STRING copies unchanged — this block throws plain `Error`s with no external-context dependency the way `loadDocumentTemplate`'s one message did, so there is no analogous flagged wording divergence here.
    * `[ ]`   Error class: define `ContributionChainAssemblyError extends Error` in `_shared/utils/errors.ts` (creator-owns-the-data; alongside `ContextWindowError`, `IndexingError`, `RagServiceError`, `NotImplementedError`, `RenderJobValidationError`, `RenderJobEnqueueError`, `TemplateResolutionError`, `TemplateLoadError` — same flat-file precedent), used for the seven GENUINELY FRESH validation branches (2-8) — none of these receives an existing error object; each is a first detection at its exact point of failure.
    * `[ ]`   ONE source defect in this range, per `.github/instructions/error-handling.instructions.md` ("Errors are never converted, coerced, or otherwise modified"; "You get an error, you pass the error along"): the `dialectic_contributions` query error branch (`document_renderer.ts:152-154`) discards the ACTUAL received `selectError` entirely and throws a static, unrelated string (`"Failed to query contributions for rendering"`) — worse than embedding its message, it doesn't reference `selectError` at all. FIXED by this node — `selectError` present → `return { error: selectError, retriable: false }` (the exact received error, unmodified — NOT a `ContributionChainAssemblyError`).
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `document_renderer.ts` is NOT modified by this node — copy-first sequencing (including its one unfixed defect, which stays in place there); the swap happens in the `renderDocument` relocation node (later, WS-B), proven via the then-still-untouched `document_renderer.test.ts` suite.
      * `[ ]`   Every failure path returns `retriable: false`, matching the original block's uniform choice and this sprint's established local precedent (`resolveTemplateFilename`, `loadDocumentTemplate`) of preserving a copy's original no-retriable-concept behavior exactly rather than reconsidering it mid-copy.
      * `[ ]`   No logging: the original block (`document_renderer.ts:141-247`) contains zero `logger.*` calls — this module adds none.
      * `[ ]`   `deconstructStoragePath` (`_shared/utils/path_deconstructor.ts`), `extractSourceGroupFragment` (`_shared/utils/path_utils.ts`), and `isRecord` (`_shared/utils/type_guards.ts`) are imported DIRECTLY, not injected — matching `document_renderer.ts`'s own existing direct-import style for all three today (this is a copy of existing behavior, not a redesign into the `Deps` convention).
      * `[ ]`   This module returns the ordered chunk array itself PLUS the four derived scalars (`modelSlug`, `attemptCount`, `sourceGroupFragment`, `sourceAnchorModelSlug`) — every value the original block computes in this range — since the relocated `renderDocument` orchestrator (later node) needs the chunk list for `mergeChunkContent` and needs all four scalars for its own `PathContext` construction (`document_renderer.ts:564+`, unchanged, out of scope here).

  * `[ ]`   `role`
    * `[ ]`   New shared-service module (`_shared/services/document_renderer/`, sibling to `loadDocumentTemplate`/`renderStructuredDocument`) — DB-backed contribution-chain resolution, callable independent of template loading, chunk merging, structured rendering, or persistence.
    * `[ ]`   Out of scope: template loading (`loadDocumentTemplate`, already-written node); the chunk download/sanitize/merge/array-join pipeline (`mergeChunkContent`, later node — this module returns WHICH chunks and in what order, not their downloaded/parsed content); structured-record rendering (`renderStructuredDocument`, already-written node); persistence and the `render_completed` notification tail (`renderDocument` orchestrator, later node); any COMPRESS-specific logic (this module is compression-agnostic and, per its own objective, not consumed by compression at all).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/services/document_renderer/assembleContributionChain/` plus its one companion touch, `_shared/utils/errors.ts` (new error class only).
    * `[ ]`   Inside boundary: the `dialectic_contributions` query, the identity filter, the edit-preferring dedupe, the root find, the chain walk, the `modelSlug`/`attemptCount`/`sourceGroupFragment`/`sourceAnchorModelSlug` extraction.
    * `[ ]`   Outside boundary: chunk content download/sanitize/merge, structured rendering, persistence/notification, any COMPRESS-specific logic.

  * `[ ]`   `deps`
    * `[ ]`   NONE beyond the Supabase client type. `deconstructStoragePath`/`extractSourceGroupFragment`/`isRecord` are pure, deterministic helpers imported directly (see objective) — not `Deps` fields.
    * `[ ]`   `SupabaseClient<Database>` arrives via `params.dbClient` — matches the `resolveTemplateFilename`/`loadDocumentTemplate`/`enqueueCompressJobs`/`processCompressJob` Params-carries-dbClient convention already established this epic.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this node does not import from `dialectic-worker/`.

  * `[ ]`   `assembleContributionChain.interface.test.ts`
    * `[ ]`   Valid: a payload with non-empty `sessionId`/`stageSlug`/`documentIdentity` and a numeric `iterationNumber`, plus a `params.dbClient`, type-checks.
    * `[ ]`   `AssembleContributionChainSuccessReturn { orderedChunks, modelSlug, attemptCount, sourceGroupFragment, sourceAnchorModelSlug }` and `AssembleContributionChainErrorReturn { error: Error; retriable: boolean }` never co-occur.

  * `[ ]`   `assembleContributionChain.interface.ts`
    * `[ ]`   `export interface AssembleContributionChainDeps {}` (empty — matches the established `ResolveTemplateFilenameDeps {}`/`DeriveStepStatusesDeps {}` precedent; this walk needs no injected service, only the DB client).
    * `[ ]`   `export interface AssembleContributionChainParams { dbClient: SupabaseClient<Database>; }`, importing `Database` from `../../../../types_db.ts` and `SupabaseClient` from `npm:@supabase/supabase-js@2`.
    * `[ ]`   `export interface AssembleContributionChainPayload { sessionId: string; iterationNumber: number; stageSlug: string; documentIdentity: string; }` — the four identifiers the copied walk reads (see objective).
    * `[ ]`   `export type AssembleContributionChainSuccessReturn = { orderedChunks: DialecticContributionRow[]; modelSlug: string; attemptCount: number; sourceGroupFragment: string | undefined; sourceAnchorModelSlug: string | undefined };`, importing `DialecticContributionRow` from `../../../../dialectic-service/dialectic.interface.ts` (the same type the original block's `.returns<DialecticContributionRow[]>()` already uses — not a new type).
    * `[ ]`   `export type AssembleContributionChainErrorReturn = { error: Error; retriable: boolean };` — typed as plain `Error`, NOT `ContributionChainAssemblyError`, because the `dialectic_contributions` query-error branch returns the RECEIVED error unmodified, which is not guaranteed to be a `ContributionChainAssemblyError` instance; `ContributionChainAssemblyError extends Error` so the seven fresh-validation branches still satisfy this type. Imports `ContributionChainAssemblyError` from `../../../utils/errors.ts` for the fresh-validation branches only.
    * `[ ]`   `export type AssembleContributionChainReturn = AssembleContributionChainSuccessReturn | AssembleContributionChainErrorReturn;`.
    * `[ ]`   `export type AssembleContributionChainFn = (deps: AssembleContributionChainDeps, params: AssembleContributionChainParams, payload: AssembleContributionChainPayload) => Promise<AssembleContributionChainReturn>;` and `export type BoundAssembleContributionChainFn = (params: AssembleContributionChainParams, payload: AssembleContributionChainPayload) => Promise<AssembleContributionChainReturn>;`.

  * `[ ]`   `assembleContributionChain.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: the relocated `renderDocument` orchestrator (WS-B, later node — one call, its `orderedChunks` output fed into `mergeChunkContent`, its four scalars fed into the orchestrator's own `PathContext` construction).
    * `[ ]`   Required interaction: exactly one `dialectic_contributions` read — no writes, ever.
    * `[ ]`   Failure modes: the eight distinct failure branches enumerated in `construction` below — all `retriable: false`; one (the query error) is a received-error passthrough, the other seven are fresh `ContributionChainAssemblyError`s.

  * `[ ]`   `assembleContributionChain.guard.test.ts` / `assembleContributionChain.guard.ts`
    * `[ ]`   `isAssembleContributionChainParams` accepts `{ dbClient: <object> }`; rejects a non-object `dbClient`.
    * `[ ]`   `isAssembleContributionChainPayload` accepts a payload with non-empty `sessionId`/`stageSlug`/`documentIdentity` strings and a numeric `iterationNumber`; rejects any missing/empty string field or a non-numeric `iterationNumber`.
    * `[ ]`   `isAssembleContributionChainSuccessReturn`/`isAssembleContributionChainErrorReturn` mirror the mutual-exclusion pattern already established by `isEnqueueRenderJobSuccessReturn`/`ErrorReturn` (`enqueueRenderJob.interface.guards.ts:177-203`).

  * `[ ]`   `assembleContributionChain.mock.ts`
    * `[ ]`   `createAssembleContributionChainMock(options?: { result?; handler? })` returning `{ assembleContributionChain, calls }`, structured exactly like `createResolveTemplateFilenameMock`; default fallback result a single-chunk `orderedChunks` with `modelSlug: 'mock-model'`, `attemptCount: 0`, `sourceGroupFragment: undefined`, `sourceAnchorModelSlug: undefined`.
    * `[ ]`   Trusted Factories: `buildAssembleContributionChainParams(overrides?)` (default `dbClient` from `createMockSupabaseClient`), `buildAssembleContributionChainPayload(overrides?)` (default `{ sessionId: 'session_abc', iterationNumber: 1, stageSlug: 'thesis', documentIdentity: 'root-id-1' }`).
    * `[ ]`   NEW Trusted Factory `buildContributionRow(overrides?: Partial<Database['public']['Tables']['dialectic_contributions']['Row']>)` matching the full row shape repeated as an inline ~30-field object literal dozens of times throughout `document_renderer.test.ts` (`id`/`session_id`/`stage`/`iteration_number`/`storage_bucket`/`storage_path`/`file_name`/`raw_response_storage_path`/`mime_type`/`document_relationships`/`created_at`/`updated_at`/`target_contribution_id`/`edit_version`/`is_latest_edit`/`user_id`/`contribution_type`/`citations`/`error`/`is_header`/`original_model_contribution_id`/`processing_time_ms`/`prompt_template_id_used`/`seed_prompt_url`/`size_bytes`/`source_prompt_resource_id`/`tokens_used_input`/`tokens_used_output`/`model_id`/`model_name`), defaulted to a valid root row and overridable per test — this is a NEW factory (none of `document_renderer.test.ts`'s existing fixtures is already factored into a reusable builder), deduplicating that repeated literal for every test case below.

  * `[ ]`   `assembleContributionChain.test.ts`
    * `[ ]`   Ordering and exclusion: COPY the fixture from `document_renderer.test.ts:225-331` (root chunk + a later-`edit_version` chunk + an unrelated document with a different `document_relationships` root id), call `assembleContributionChain({}, { dbClient }, { sessionId, iterationNumber: 1, stageSlug, documentIdentity: rootId })` directly, assert `orderedChunks` contains exactly the two related chunks in `edit_version`-then-`created_at` order and excludes the unrelated row.
    * `[ ]`   Chain-walk ordering (X1→X2→X3): COPY the fixture from `document_renderer.test.ts:936-1022` (three chunks linked root→c1→c2 via `target_contribution_id`, out of DB-return order), asserting `orderedChunks` resolves to `[root, c1, c2]` by walking the chain, not by DB return order or `created_at` alone.
    * `[ ]`   Edit-preference dedupe: COPY the fixture from `document_renderer.test.ts:1024-1111` (a model chunk plus a same-`file_name` user edit with `original_model_contribution_id` set and `is_latest_edit: true`, arriving LATER by `created_at`), asserting `orderedChunks` contains only the edit row for that `file_name`, not the model chunk.
    * `[ ]`   DB-side filtering predicates: COPY the fixture and query-spy assertions from `document_renderer.test.ts:1113-1263` directly against `assembleContributionChain` (not through `renderDocument`): asserts the `dialectic_contributions` query issues `eq('session_id', sessionId)`, `eq('iteration_number', iterationNumber)`, and `contains('document_relationships', { [stageSlug]: documentIdentity })`.
    * `[ ]`   Root-chunk resolution (`sourceContributionId === documentIdentity` case, `document_renderer.test.ts:2796-2939`): a single chunk with `target_contribution_id: null` and matching `document_relationships[stageSlug]` resolves as `orderedChunks[0]` — recreated WITHOUT the original test's `pathContext.sourceContributionId` assertions, which are orchestrator-level output this module has no `sourceContributionId` input to produce (that param is never part of this module's payload).
    * `[ ]`   Continuation-chunk resolution (`document_renderer.test.ts:2941-3127`, `:3129-3358`): given a chain where the chunk that triggered the render differs from the true root, `assembleContributionChain` resolves the chain by `documentIdentity` (via `document_relationships[stageSlug] === documentIdentity` and `target_contribution_id === null`) — proving the module ignores which specific chunk id triggered the call entirely, since `sourceContributionId`/the triggering chunk id is not part of its payload at all.
    * `[ ]`   Fragment extraction, UUID with hyphens: COPY the fixture from `document_renderer.test.ts:3595-3639` (`document_relationships.source_group = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"`), asserting `sourceGroupFragment === "a1b2c3d4"` (the first hyphen-delimited segment).
    * `[ ]`   Fragment extraction, missing `source_group`: COPY the fixture from `document_renderer.test.ts:3823-3867` (`document_relationships: { thesis: rootId }` with no `source_group` key), asserting `sourceGroupFragment === undefined` and that no error is thrown accessing the missing property.
    * `[ ]`   One test per each of the seven genuinely-fresh failure branches (2-8) enumerated in `construction`, each asserting `'error' in result`, `result.error instanceof ContributionChainAssemblyError`, `result.retriable === false`, and the exact copied error message string (noting the two `"Invalid file name type"` branches share identical text at different code sites — both are tested, not collapsed into one case).
    * `[ ]`   One test for the received-error passthrough branch (1 — `dialectic_contributions` query error): mock `dbClient` returning a specific error object, asserting `result.error` is REFERENCE-EQUAL to that exact object (NOT `instanceof ContributionChainAssemblyError`, NOT the discarded static string the original threw).
    * `[ ]`   Do NOT re-test: chunk content download/sanitize/merge, structured rendering, or persistence — none of that lives here.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Sequential validate-then-query order, IDENTICAL to the original block's order (copy preserves order exactly):
      1. Query `dialectic_contributions` by `session_id = payload.sessionId`, `iteration_number = payload.iterationNumber`, `contains('document_relationships', { [payload.stageSlug]: payload.documentIdentity })`, ordered `edit_version` ascending then `created_at` ascending → `selectError` present → `return { error: selectError, retriable: false }` (FIX — received error surfaced unmodified; the original discarded it entirely for an unrelated static string).
      2. `rows.length === 0` → fresh `ContributionChainAssemblyError("No contribution chunks found for requested document")`.
      3. Filter to `matchingChunks` where `document_relationships[payload.stageSlug] === payload.documentIdentity` → empty → fresh `ContributionChainAssemblyError("No matching contribution chunks found for requested document")`.
      4. Dedupe `matchingChunks` by `file_name` (preferring a chunk with `original_model_contribution_id` set, or the current latest-edit over a non-edit) → any row with a non-string `file_name` → fresh `ContributionChainAssemblyError("Invalid file name type")`.
      5. Find `rootChunk` = the deduped chunk with `document_relationships[payload.stageSlug] === payload.documentIdentity` AND `target_contribution_id === null` → none → fresh `ContributionChainAssemblyError("No root contribution found for document identity ${payload.documentIdentity}")`.
      6. Walk `target_contribution_id` links forward from `rootChunk` into `orderedChunks`, breaking silently on a broken chain link (preserved exactly — not fixed) → `orderedChunks.length === 0` → fresh `ContributionChainAssemblyError("No ordered chunks found for document chain")`.
      7. `base = orderedChunks[0]`; non-string `base.file_name` → fresh `ContributionChainAssemblyError("Invalid file name type")` (same message text as branch 4, different site — preserved as-is, not deduplicated).
      8. `deconstructStoragePath({ storageDir: base.storage_path, fileName: base.file_name })` → `!info.modelSlug || typeof info.attemptCount !== 'number'` → fresh `ContributionChainAssemblyError("Unable to parse model slug and attempt count from path")`.
      9. Success → extract `sourceGroup = isRecord(base.document_relationships) && typeof base.document_relationships.source_group === 'string' ? base.document_relationships.source_group : undefined`; `sourceGroupFragment = extractSourceGroupFragment(sourceGroup)`; `sourceAnchorModelSlug = info.sourceAnchorModelSlug`; return `{ orderedChunks, modelSlug: info.modelSlug, attemptCount: info.attemptCount, sourceGroupFragment, sourceAnchorModelSlug }`.

  * `[ ]`   `assembleContributionChain.ts` (Implementation)
    * `[ ]`   COPY `document_renderer.ts:141-247` verbatim into the function body, with these MECHANICAL substitutions only: `sessionId` → `payload.sessionId`; `iterationNumber` → `payload.iterationNumber`; `stageSlug` → `payload.stageSlug`; `documentIdentity` → `payload.documentIdentity`; the enclosing function's `dbClient` argument → `params.dbClient`; the seven GENUINELY FRESH `new Error(...)` constructions (branches 2-8) → `new ContributionChainAssemblyError(...)` (message strings unchanged).
    * `[ ]`   ONE NON-MECHANICAL fix, per `objective`'s source-defect analysis (NOT a verbatim copy): branch 1's `selectError` check returns `{ error: selectError, retriable: false }` directly instead of discarding it for the original's static `"Failed to query contributions for rendering"` string.
    * `[ ]`   On success: `return { orderedChunks: uniqueChunks, modelSlug, attemptCount, sourceGroupFragment, sourceAnchorModelSlug };` instead of falling through into Phase 1 chunk downloads (`document_renderer.ts:307+`), which are `mergeChunkContent`'s responsibility, not this module's.
    * `[ ]`   No other logic — this function does nothing `document_renderer.ts:141-247` didn't already do, beyond the throw-to-Return conversion and the one named error-handling fix.

  * `[ ]`   `assembleContributionChain.provides.ts`
    * `[ ]`   Re-export `assembleContributionChain`, all interface types, all guards, and all mock builders (including the new `buildContributionRow` fixture factory).

  * `[ ]`   `assembleContributionChain.integration.test.ts`
    * `[ ]`   Bounded subsystem: real `assembleContributionChain`; only the Supabase client is mocked (external boundary) — same bounded-subsystem style as `enqueueCompressJobs.integration.test.ts`/`resolveTemplateFilename.integration.test.ts`.
    * `[ ]`   Given a full three-chunk chain (root→edit→continuation, out of DB-return order, one chunk carrying `document_relationships.source_group`), a real call resolves `orderedChunks` in chain-walk order with the correct `modelSlug`/`attemptCount`/`sourceGroupFragment`/`sourceAnchorModelSlug` — proving the whole real walk end to end, not mocked at any layer below the Supabase adapter.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared service (DB-backed lookup). Deps inward: `deconstructStoragePath`/`extractSourceGroupFragment`/`isRecord` (pure, directly imported), `DialecticContributionRow` (`dialectic-service/dialectic.interface.ts`). Provides outward: `assembleContributionChain`/`BoundAssembleContributionChainFn` to the relocated `renderDocument` orchestrator (later WS-B node) only — not to `mergeChunkContent` or `renderStructuredDocument`, which receive already-resolved chunks/records as plain parameters. No cycles: this module does not import from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Given a document's contribution rows plus an unrelated document's rows in the same session/iteration, `orderedChunks` contains only the related rows, ordered by the chain walk (not DB-return order or `created_at` alone).
    * `[ ]`   Given a model chunk and a later same-`file_name` user edit, `orderedChunks` contains only the edit.
    * `[ ]`   The `dialectic_contributions` query issues `eq('session_id', ...)`, `eq('iteration_number', ...)`, and `contains('document_relationships', { [stageSlug]: documentIdentity })`.
    * `[ ]`   Chain resolution keys ONLY on `payload.documentIdentity` (via `document_relationships`/`target_contribution_id === null`) — never on any "triggering chunk id," which this module's payload does not carry.
    * `[ ]`   `sourceGroupFragment` extracts the first hyphen-delimited segment of a UUID `source_group` and is `undefined` (never throws) when `source_group` is absent.
    * `[ ]`   Each of the seven genuinely-fresh failure branches returns `{ error: ContributionChainAssemblyError(<message>), retriable: false }`, including both same-text `"Invalid file name type"` branches at their distinct sites; the one received-error branch (the `dialectic_contributions` query) returns `selectError` unmodified (`retriable: false`, but NOT reconstructed into `ContributionChainAssemblyError` or any static string) — per `.github/instructions/error-handling.instructions.md`.
    * `[ ]`   `document_renderer.ts` is NOT modified by this node (its one unfixed defect stays in place there); `document_renderer.test.ts` is NOT modified by this node — both remain the `renderDocument` relocation node's responsibility (later, WS-B).
    * `[ ]`   `_shared/utils/errors.ts` gains exactly one new class, `ContributionChainAssemblyError`, and no other change.

* `[ ]`   supabase/functions/_shared/services/document_renderer/mergeChunkContent/`mergeChunkContent.ts` **[BE] Extract the chunk-download + Phase 1/2/3 concatenate-sanitize-parse-with-per-chunk-fallback pipeline (content-unwrap merge, `_extra_content` plain-text path, array-join normalization) out of document_renderer.ts into its own function-folder module, as a verbatim COPY (original left untouched)**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing standalone access to chunk-content merging. The pipeline (download every chunk's raw text → try a concatenated sanitize/parse first, for continuation fragments split mid-JSON across chunks → fall back to per-chunk sanitize/parse, for independently-complete chunks or plain-text content → content-unwrap each parsed object via `isRecord(parsed.content) ? parsed.content : parsed` → merge string fields with `'\n\n'` join on key collision → normalize any remaining array-of-strings fields to a single joined string) exists ONLY as a private inline block in `document_renderer.ts:307-466`, plus the module-scope `downloadText` helper it calls (`:114-124`), reachable exclusively through the full `renderDocument` call, which also does contribution-chain assembly (`:141-247`, already extracted), template loading (`:249-305`, already extracted), and structured rendering (`:468-560`, already extracted).
    * `[ ]`   This is NOT a pure function (storage-download boundary, multiple calls per chunk) — it gets the complete function-folder module (interface, guards, mock, tests, provides, integration test) per the scope's explicit "Support: full module" call-out for this node.
    * `[ ]`   Functional goal: copy `document_renderer.ts:307-466` (the full Phase 1/2/3 pipeline, its nested `mergeParsedIntoMerged` helper at `:332-347`, and the array-join normalization loop at `:456-466`) PLUS `document_renderer.ts:114-124` (`downloadText`) VERBATIM into this new module. The block's `contentBucket` (originally `base.storage_bucket` where `base = uniqueChunks[0]`, computed in the now-already-extracted `assembleContributionChain` range) is re-derived here as `payload.orderedChunks[0].storage_bucket` — `assembleContributionChain`'s own contract guarantees `orderedChunks` is non-empty (it errors before returning otherwise), so this module trusts that invariant rather than re-validating it.
    * `[ ]`   Unlike `loadDocumentTemplate`/`assembleContributionChain`, this block's `deps.logger?.info?.(...)`/`deps.logger?.warn?.(...)` calls (five sites: `:322-329` DEBUG raw-text-length, `:369-380` Phase 2 sanitized/extracted, `:416-424`/`:426-430` Phase 3 per-chunk sanitized/extracted, `:447-450` `_extra_content` non-array-normalize warning) are KEPT, not dropped — this is a genuine `Deps`-boundary module (unlike the PURE `renderStructuredDocument`), so `logger: ILogger` is a real injected dependency, and these are substantive per-chunk diagnostics for a fallback-heavy pipeline, not a single droppable diagnostic.
    * `[ ]`   Error-return conversion for the three GENUINELY FRESH validation sites (`:316` missing `file_name`, `:398` invalid sanitization result, `:413` parsed-non-object) — none of these receives an existing error object to preserve; each is a first detection of a specific condition at its exact point of failure, so `throw new Error(<message>)` becomes `return { error: new ChunkMergeError(<same message>), retriable: false }` (converting this function into the Return-based DI-boundary convention this sprint's other extracted modules already use), with no rule conflict — `_shared/utils/errors.ts`-precedent domain classes are for errors PRODUCED here, not errors RECEIVED and re-labeled.
    * `[ ]`   TWO source defects in this range, per `.github/instructions/error-handling.instructions.md` ("Errors are never converted, coerced, or otherwise modified"; "Errors are NEVER SWALLOWED"; "Every error is surfaced, every single time"; "You get an error, you pass the error along") — both are FIXED by this node, not perpetuated:
      1. Phase 3's `JSON.parse` catch (`:401-411`) catches the real parse exception `e` and DISCARDS it, constructing a brand-new `Error` whose message merely embeds `e.message` inside reformatted text (`chunkId`/`rawJsonPath`/chunk-id-list context). This is a rewrite of a received error, forbidden outright. FIX: `return { error: e instanceof Error ? e : new Error(String(e)), retriable: false };` — the caught error surfaces exactly as JSON.parse produced it (in practice always a real `SyntaxError`/`Error`; the `instanceof` branch is a TS narrowing formality, not a conversion path this code ever actually takes). The `chunkId`/`rawJsonPath`/chunk-id-list context the original message carried is NOT lost — it moves to a `deps.logger?.error?.('[mergeChunkContent] Phase 3 JSON.parse failed', { chunkId: d.chunkId, rawJsonPath: d.rawJsonPath, chunkIds, paths, error: e instanceof Error ? e.message : String(e) })` call immediately before the `return`, so the operator still gets full context through the correct channel (logging) without the returned error object itself being modified.
      2. Phase 2's catch (`:382-384`, `catch (_) { /* Fall through to Phase 3 */ }`) discards the concatenated-parse failure with NO surfacing anywhere — a straightforward swallow. FIX: `catch (phase2Error) { deps.logger?.warn?.('[mergeChunkContent] Phase 2 concatenated parse failed, falling back to Phase 3', { error: phase2Error instanceof Error ? phase2Error.message : String(phase2Error) }); }` — the error is surfaced (logged) even though the function does not fail outright here, since Phase 3 is a legitimate fallback strategy that may still succeed; "surfaced" is satisfied by logging, not by aborting a recoverable attempt.
    * `[ ]`   The ONE genuinely propagated (not locally produced) failure mode — `downloadText`'s `if (error) throw error;` (`:121`) propagating `downloadFromStorage`'s own `Error` — is caught at its one call site (`:319`) and returned AS-IS: `{ error: caughtError, retriable: false }`, the exact object `downloadFromStorage` produced, never reconstructed into `ChunkMergeError`. This was already correct in the source (the original doesn't reformat this one) and stays correct here.
    * `[ ]`   Error class: define `ChunkMergeError extends Error` in `_shared/utils/errors.ts` (alongside `ContextWindowError`, `IndexingError`, `RagServiceError`, `NotImplementedError`, `RenderJobValidationError`, `RenderJobEnqueueError`, `TemplateResolutionError`, `TemplateLoadError`, `ContributionChainAssemblyError` — same flat-file precedent), used for the four locally-thrown message sites only (not for the propagated storage error, per above).
    * `[ ]`   Forward-looking consumer note (not this node's scope): `saveResponse.ts`'s json-mode COMPRESS branch (WS-B, later node) mirrors this module's content-unwrap rule (`isRecord(parsed.content) ? parsed.content : parsed`) for its single-source case, per the scope's own cross-reference — that node reads this module's implementation for the rule, it does not call this module.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `document_renderer.ts` is NOT modified by this node — copy-first sequencing; the swap happens in the `renderDocument` relocation node (later, WS-B), proven via the then-still-untouched `document_renderer.test.ts` suite.
      * `[ ]`   `sanitizeJsonContent`/`isJsonSanitizationResult`/`JsonSanitizationResult` (`_shared/utils/jsonSanitizer/`) and `isRecord` (`_shared/utils/type_guards.ts`) are imported DIRECTLY, not injected — matching `document_renderer.ts`'s own existing direct-import style for all of them.
      * `[ ]`   `downloadFromStorage` IS injected (`Deps`, per the established `loadDocumentTemplate` precedent for this exact same storage-read boundary) — unlike the pure helpers above, it is genuine I/O.
      * `[ ]`   `DownloadedChunkText` (currently defined in `document_renderer.interface.ts:44-48`) RE-HOMES to `mergeChunkContent.interface.ts` — this module is its only real consumer going forward (it is not referenced by `RenderDocumentParams`/`RenderDocumentResult`, so the `renderDocument` relocation node's own re-homing list, which the scope names as `RenderDocumentParams`/`RenderDocumentResult`/`DocumentRendererDeps`/`IDocumentRenderer`/`ContributionRowMinimal`, correctly does NOT include it).

  * `[ ]`   `role`
    * `[ ]`   New shared-service module (`_shared/services/document_renderer/`, sibling to `loadDocumentTemplate`/`renderStructuredDocument`/`assembleContributionChain`) — storage-backed chunk download and JSON/text merge, callable independent of chain assembly, template loading, structured rendering, or persistence.
    * `[ ]`   Out of scope: contribution-chain assembly (`assembleContributionChain`, already-written node — this module receives `orderedChunks` as a plain parameter, it does not query or order them); template loading (`loadDocumentTemplate`, already-written node); structured-record rendering (`renderStructuredDocument`, already-written node — this module produces the `structuredRecord` input THAT function consumes); persistence and the `render_completed` notification tail (`renderDocument` orchestrator, later node); `saveResponse.ts`'s COMPRESS content-unwrap handling (mirrors this module's rule, does not call it).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/services/document_renderer/mergeChunkContent/` plus its one companion touch, `_shared/utils/errors.ts` (new error class only).
    * `[ ]`   Inside boundary: per-chunk storage download, the Phase 1/2/3 concatenate-sanitize-parse-with-fallback strategy, content-unwrap merge, `_extra_content` accumulation, array-join normalization.
    * `[ ]`   Outside boundary: chain assembly/ordering, template loading, structured-record rendering, persistence/notification, any COMPRESS-specific logic.

  * `[ ]`   `deps`
    * `[ ]`   `downloadFromStorage: DownloadFromStorageFn` (`_shared/supabase_storage_utils.ts`) — the storage-read external boundary; identical dependency shape to `DocumentRendererDeps.downloadFromStorage` and `loadDocumentTemplate`'s own dependency today.
    * `[ ]`   `logger: ILogger` (`_shared/types.ts`) — the five diagnostic log sites listed in `objective`.
    * `[ ]`   `SupabaseClient<Database>` arrives via `params.dbClient` (used only as `downloadText`'s/`downloadFromStorage`'s storage-client argument — this module issues no DB query) — matches the Params-carries-dbClient convention already established this epic.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — this node does not import from `dialectic-worker/`.

  * `[ ]`   `mergeChunkContent.interface.test.ts`
    * `[ ]`   Valid: a payload with a non-empty `orderedChunks` array type-checks.
    * `[ ]`   `MergeChunkContentSuccessReturn { mergedStructuredData: Record<string, unknown> }` and `MergeChunkContentErrorReturn { error: Error; retriable: boolean }` never co-occur.

  * `[ ]`   `mergeChunkContent.interface.ts`
    * `[ ]`   `export type DownloadedChunkText = { chunkId: string; text: string; rawJsonPath: string; };` — RE-HOMED from `document_renderer.interface.ts:44-48` (see objective); the original definition there is left in place until the `renderDocument` relocation node removes the whole file.
    * `[ ]`   `export interface MergeChunkContentDeps { downloadFromStorage: DownloadFromStorageFn; logger: ILogger; }`, importing `DownloadFromStorageFn` from `../../../supabase_storage_utils.ts` and `ILogger` from `../../../types.ts`.
    * `[ ]`   `export interface MergeChunkContentParams { dbClient: SupabaseClient<Database>; }`, importing `Database` from `../../../../types_db.ts` and `SupabaseClient` from `npm:@supabase/supabase-js@2`.
    * `[ ]`   `export interface MergeChunkContentPayload { orderedChunks: DialecticContributionRow[]; }`, importing `DialecticContributionRow` from `../../../../dialectic-service/dialectic.interface.ts` (the same type `assembleContributionChain.interface.ts` already uses — not redefined).
    * `[ ]`   `export type MergeChunkContentSuccessReturn = { mergedStructuredData: Record<string, unknown> };`.
    * `[ ]`   `export type MergeChunkContentErrorReturn = { error: Error; retriable: boolean };` — typed as plain `Error`, NOT `ChunkMergeError`, because one failure mode (the propagated storage-download error) is deliberately NOT a `ChunkMergeError` instance (see objective); `ChunkMergeError extends Error` so this widened type still accepts it.
    * `[ ]`   `export type MergeChunkContentReturn = MergeChunkContentSuccessReturn | MergeChunkContentErrorReturn;`.
    * `[ ]`   `export type MergeChunkContentFn = (deps: MergeChunkContentDeps, params: MergeChunkContentParams, payload: MergeChunkContentPayload) => Promise<MergeChunkContentReturn>;` and `export type BoundMergeChunkContentFn = (params: MergeChunkContentParams, payload: MergeChunkContentPayload) => Promise<MergeChunkContentReturn>;`.

  * `[ ]`   `mergeChunkContent.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: the relocated `renderDocument` orchestrator (WS-B, later node — one call per document, its `orderedChunks` argument sourced from `assembleContributionChain`, its `mergedStructuredData` output fed into `renderStructuredDocument`).
    * `[ ]`   Required interaction: one storage download per chunk in `orderedChunks` (via `downloadFromStorage`) — no DB reads, no writes.
    * `[ ]`   Failure modes: the four locally-thrown branches (missing `file_name`, invalid sanitization result, JSON parse failure, parsed-non-object) enumerated in `construction` below, all `retriable: false`; plus the one propagated storage-download error, returned unmodified.

  * `[ ]`   `mergeChunkContent.guard.test.ts` / `mergeChunkContent.guard.ts`
    * `[ ]`   `isMergeChunkContentParams` accepts `{ dbClient: <object> }`; rejects a non-object `dbClient`.
    * `[ ]`   `isMergeChunkContentPayload` accepts a payload with a non-empty `orderedChunks` array; rejects an empty array or a non-array value.
    * `[ ]`   `isMergeChunkContentSuccessReturn`/`isMergeChunkContentErrorReturn` mirror the mutual-exclusion pattern already established by `isEnqueueRenderJobSuccessReturn`/`ErrorReturn` (`enqueueRenderJob.interface.guards.ts:177-203`).

  * `[ ]`   `mergeChunkContent.mock.ts`
    * `[ ]`   `createMergeChunkContentMock(options?: { result?; handler? })` returning `{ mergeChunkContent, calls }`, structured exactly like `createResolveTemplateFilenameMock`; default fallback result `{ mergedStructuredData: {} }`.
    * `[ ]`   Trusted Factories: `buildMergeChunkContentDeps(overrides?)` (default `downloadFromStorage` a deterministic in-memory stub keyed by path, `logger` from `_shared/logger.mock.ts`), `buildMergeChunkContentParams(overrides?)` (default `dbClient` from `createMockSupabaseClient`), `buildMergeChunkContentPayload(overrides?)` (default a single chunk using `assembleContributionChain.mock.ts`'s `buildContributionRow`, reused rather than re-derived).

  * `[ ]`   `mergeChunkContent.test.ts`
    * `[ ]`   Content-object extraction: COPY the fixture from `document_renderer.test.ts:1401` ("parses JSON content from raw_response_storage_path and extracts content field"), call `mergeChunkContent(deps, { dbClient }, { orderedChunks: [chunk] })` directly, assert `mergedStructuredData` equals the unwrapped `content` object.
    * `[ ]`   No-content-wrapper case: COPY the fixture from `:1542` ("renders successfully when JSON has no content wrapper and metadata fields are present"), asserting the content-unwrap rule's `else` branch (`parsed` used directly) merges correctly when there is no `.content` key, ignoring sibling metadata fields.
    * `[ ]`   Escape-sequence correctness: COPY the fixture from `:1671` ("converts escaped newlines, quotes, and backslashes correctly"), asserting sanitized/parsed string values preserve real newlines/quotes/backslashes rather than literal escape sequences.
    * `[ ]`   Plain-markdown path: COPY the fixture from `:1799` ("uses markdown content directly when content is not JSON"), asserting a non-JSON-looking chunk (fails the `startsWith('{'/'[')` check) is routed to the `_extra_content` accumulation, not JSON parsing.
    * `[ ]`   Mixed JSON+markdown chunks: COPY the fixture from `:1937` ("handles mixed JSON and markdown chunks correctly"), asserting per-chunk Phase 3 fallback correctly routes each chunk (JSON-parsed vs `_extra_content`-accumulated) independently when the concatenated Phase 2 attempt doesn't apply.
    * `[ ]`   Trailing-whitespace tolerance: COPY the fixture from `:2653` ("successfully parses JSON content when file has trailing whitespace or newlines"), asserting `trimmedText`-based detection (not raw `text`) correctly classifies a JSON chunk with leading/trailing whitespace.
    * `[ ]`   Content-as-object (not stringified) input: COPY the fixture from `:4168` ("accepts content as object (not stringified JSON) and populates template sections correctly"), asserting the content-unwrap rule handles a chunk whose downloaded text, once parsed, already has `content` as a live object (not a JSON string requiring a second parse) — the distinctive behavior singled out by the redistribution-map appendix for this case.
    * `[ ]`   Two-fragment concatenate+parse (Phase 2 primary path): COPY the fixture from `:5431` ("two chunks as JSON fragments are concatenated, sanitized, and parsed into a single merged object"), asserting `tryConcatenatedParse` fires (both chunks JSON-like), the concatenation parses as one object, and Phase 3 is never reached (assert no per-chunk sanitize call, or an equivalent phase2Success proof).
    * `[ ]`   Single-chunk regression guard: COPY the fixture from `:5498` ("single chunk with complete JSON still works (regression guard)"), asserting a single complete JSON chunk still merges correctly through the concatenated-parse path (guards against a two-chunk-only regression).
    * `[ ]`   Backtick-wrapper sanitize: COPY the fixture from `:5553` ("concatenated result with backtick wrappers is sanitized correctly before parse"), asserting `sanitizeJsonContent` strips a Markdown code-fence wrapper before `JSON.parse`.
    * `[ ]`   Per-chunk fallback merge: COPY the fixture from `:5607` ("multiple chunks each complete JSON objects use fallback per-chunk sanitize/parse and merge"), asserting that when the CONCATENATED parse fails (each chunk independently complete, concatenation invalid), Phase 3 falls back to parsing and merging each chunk on its own.
    * `[ ]`   Plain-text path (multi-chunk): COPY the fixture from `:5675` ("non-JSON chunks (plain text not starting with { or [) are handled by plain-text path"), asserting multiple non-JSON chunks accumulate into `_extra_content` as an array, joined by `'\n\n'` after the array-join normalization step.
    * `[ ]`   Mid-string structural repair via Phase 2: COPY the fixture from `:5729`, asserting a concatenation that requires `sanitizeJsonContent`'s structural-fix path (not just whitespace/fence stripping) still succeeds through Phase 2.
    * `[ ]`   One test per each of the three genuinely-fresh failure branches (missing `file_name`; invalid sanitization result; parsed-non-object) enumerated in `construction`, each asserting `'error' in result`, `result.error instanceof ChunkMergeError`, `result.retriable === false`, and the exact copied error message string.
    * `[ ]`   One test for the propagated storage-download error: `deps.downloadFromStorage` resolves with a non-null `error`, asserting the returned `result.error` is REFERENCE-EQUAL to that exact error object (not a `ChunkMergeError`, not a reconstructed message).
    * `[ ]`   One test for the FIXED Phase 3 JSON.parse failure: a chunk whose sanitized text is JSON-like but fails `JSON.parse`, asserting `result.error` is REFERENCE-EQUAL to the actual thrown `SyntaxError`/`Error` (NOT a `ChunkMergeError`, NOT a reformatted message) and that `deps.logger.error` was called with the `chunkId`/`rawJsonPath` context.
    * `[ ]`   One test for the FIXED Phase 2 swallow: a concatenation that fails `JSON.parse`, asserting `deps.logger.warn` is called with the caught error (proving it is no longer silently discarded) AND that the function still falls through to a successful Phase 3 resolution when the individual chunks parse independently.
    * `[ ]`   Do NOT re-test: `sanitizeJsonContent`'s own sanitization correctness (`jsonSanitizer.test.ts`, already existing), chain assembly, template loading, or structured rendering — none of that lives here.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Sequential order, IDENTICAL to the original block's order (copy preserves order exactly):
      1. `contentBucket = payload.orderedChunks[0].storage_bucket` (trusting `assembleContributionChain`'s non-empty guarantee — no re-validation).
      2. Phase 1: for each `chunk` in `payload.orderedChunks`: non-string/empty `chunk.file_name` → `return { error: new ChunkMergeError("Contribution ${chunk.id} is missing file_name"), retriable: false }`; else build `rawJsonPath`, `await downloadText(params.dbClient, deps.downloadFromStorage, contentBucket, rawJsonPath)` inside a try/catch — catch → `return { error: caughtError, retriable: false }` (verbatim, not reconstructed); log DEBUG raw-text-length via `deps.logger?.info?.(...)`; push `{ chunkId, text, rawJsonPath }` to `downloadedChunks`.
      3. Compute `allJsonLike`/`firstChunkJsonLike`/`tryConcatenatedParse` exactly as the original.
      4. Phase 2 (if `tryConcatenatedParse`): concatenate all chunk texts, `sanitizeJsonContent`, if valid try `JSON.parse` → on success `mergeParsedIntoMerged(mergedStructuredData, parsed)`, `phase2Success = true`, log via `deps.logger?.info?.(...)` (sanitized + extracted); on parse exception, catch, log the caught error via `deps.logger?.warn?.(...)` (FIX — the original silently discarded it; see objective), and fall through to Phase 3 (`phase2Success` stays `false`; no error return — Phase 3 may still succeed).
      5. Phase 3 (if `!phase2Success`): for each downloaded chunk: JSON-like (`trimmedText` starts with `{`/`[`) → `sanitizeJsonContent`; invalid result → `return { error: new ChunkMergeError("Failed to parse JSON content: invalid sanitization result (chunk IDs: ...; paths: ...)"), retriable: false }`; `JSON.parse` throws → catch as `e`, log full context (`chunkId`/`rawJsonPath`/chunk-id-list) via `deps.logger?.error?.(...)`, then `return { error: e instanceof Error ? e : new Error(String(e)), retriable: false }` (FIX — the original discarded `e` and threw a reformatted message; see objective — this returns `e` itself, unmodified); parsed non-object → `return { error: new ChunkMergeError("Parsed JSON is not an object for contribution ${d.chunkId}"), retriable: false }`; else `mergeParsedIntoMerged` + log (sanitized + extracted). NOT JSON-like → accumulate into `mergedStructuredData['_extra_content']` (array append; non-array current value normalized to `[serialized, d.text]` with a `deps.logger?.warn?.(...)` call).
      6. Array-join normalization: for each key in `mergedStructuredData` whose value is a non-empty array of strings, join with `'\n\n'`.
      7. Success → `return { mergedStructuredData };`.

  * `[ ]`   `mergeChunkContent.ts` (Implementation)
    * `[ ]`   COPY `document_renderer.ts:114-124` (`downloadText`) verbatim as a module-scope (unexported) helper, unchanged in shape (still throws internally — its throw is caught at the one call site, per `construction`).
    * `[ ]`   COPY `document_renderer.ts:332-347` (`mergeParsedIntoMerged`) verbatim as a module-scope (unexported) helper.
    * `[ ]`   COPY `document_renderer.ts:307-331`, `:349-466` verbatim into the exported function body, with these MECHANICAL substitutions only: `uniqueChunks` → `payload.orderedChunks`; `base.storage_bucket` → `payload.orderedChunks[0].storage_bucket`; `dbClient` → `params.dbClient`; `deps.downloadFromStorage`/`deps.logger` unchanged (both now real `Deps` fields, not renamed); the three GENUINELY FRESH `throw new Error(...)` sites (`:316`, `:398`, `:413`) → `return { error: new ChunkMergeError(...), retriable: false }` (message strings unchanged); the `downloadText` call wrapped in try/catch per `construction` step 2 (error returned verbatim).
    * `[ ]`   TWO NON-MECHANICAL fixes, per `objective`'s source-defect analysis (NOT verbatim copies): Phase 2's `catch (_) { /* Fall through to Phase 3 */ }` (`:382-384`) becomes `catch (phase2Error) { deps.logger?.warn?.(...); }` — logs the previously-swallowed error, still falls through; Phase 3's `catch (e) { ...; throw new Error(<reformatted message>); }` (`:401-411`) becomes `catch (e) { deps.logger?.error?.(...); return { error: e instanceof Error ? e : new Error(String(e)), retriable: false }; }` — surfaces `e` unmodified instead of discarding it into a reformatted message.
    * `[ ]`   No other logic — this function does nothing `document_renderer.ts:114-124`/`:307-466` didn't already do, beyond the throw-to-Return conversion and the two named error-handling fixes.

  * `[ ]`   `mergeChunkContent.provides.ts`
    * `[ ]`   Re-export `mergeChunkContent`, all interface types (including the re-homed `DownloadedChunkText`), all guards, and all mock builders.

  * `[ ]`   `mergeChunkContent.integration.test.ts`
    * `[ ]`   Bounded subsystem: real `mergeChunkContent`; only `downloadFromStorage` is mocked (the one external boundary — no DB query in this module despite `dbClient` being present in `Params`).
    * `[ ]`   Given a two-chunk continuation split mid-JSON across chunks, a real call resolves `mergedStructuredData` via the Phase 2 concatenated path; given the same two chunks each independently valid JSON, a real call resolves via the Phase 3 per-chunk fallback — proving both real strategies end to end, not mocked at any layer below the storage adapter.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared service (storage-backed merge). Deps inward: `downloadFromStorage`/`logger` (injected), `sanitizeJsonContent`/`isJsonSanitizationResult`/`isRecord` (pure, directly imported), `DialecticContributionRow` (`dialectic-service/dialectic.interface.ts`). Provides outward: `mergeChunkContent`/`BoundMergeChunkContentFn` and the re-homed `DownloadedChunkText` to the relocated `renderDocument` orchestrator (later WS-B node) only. No cycles: this module does not import from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Given chunks whose concatenation parses as one JSON object (continuation split), `mergedStructuredData` merges via Phase 2 and Phase 3 is never invoked.
    * `[ ]`   Given chunks each independently valid JSON where the concatenation is invalid, `mergedStructuredData` merges via per-chunk Phase 3 fallback.
    * `[ ]`   Given a chunk whose parsed object has a `.content` field, the unwrapped `content` object is what's merged; given no `.content` field, the parsed object itself is merged.
    * `[ ]`   Non-JSON-looking chunks accumulate into `_extra_content`, joined by `'\n\n'` after array-join normalization; a non-array pre-existing `_extra_content` value is normalized, with a warning logged.
    * `[ ]`   Each of the three genuinely-fresh failure branches returns `{ error: ChunkMergeError(<message>), retriable: false }`; the propagated storage-download error AND the Phase 3 JSON.parse error both return unmodified (`retriable: false`, but NOT reconstructed into `ChunkMergeError` or any other new object) — no error received from an external call or a caught exception is ever converted, coerced, or re-labeled, per `.github/instructions/error-handling.instructions.md`.
    * `[ ]`   Phase 2's concatenated-parse failure is logged (`deps.logger.warn`) rather than silently discarded, even though it does not itself cause the function to fail — "surfaced" is satisfied by logging when a legitimate fallback strategy follows.
    * `[ ]`   `document_renderer.ts` is NOT modified by this node; `document_renderer.test.ts` is NOT modified by this node — both remain the `renderDocument` relocation node's responsibility (later, WS-B).
    * `[ ]`   `_shared/utils/errors.ts` gains exactly one new class, `ChunkMergeError`, and no other change; `document_renderer.interface.ts`'s existing `DownloadedChunkText` definition is left in place (removed only when the relocation node deletes the whole file).

* `[ ]`   supabase/functions/_shared/services/document_renderer/renderDocument/`renderDocument.ts` **[BE] Relocate the renderDocument orchestrator out of the document_renderer.ts monolith into its own function-folder module — unchanged public signature `(dbClient, deps, params)`, delegating to the four already-extracted modules for chain assembly/template loading/chunk merging/structured rendering while keeping the persist-as-RenderedDocument + render_completed notification tail verbatim — then DELETE the monolith and its loose satellite files and repoint every importer**

  * `[ ]`   `objective`
    * `[ ]`   Solve the monolith's remaining responsibility: `renderDocument` (`document_renderer.ts:126-661`) is now a thin orchestrator over four already-extracted modules (`assembleContributionChain`, `loadDocumentTemplate`, `mergeChunkContent`, `renderStructuredDocument`, all four prior nodes this sprint) plus one range no other node claims — the persist-as-`RenderedDocument` + `render_completed` notification tail (`:562-658`). Leaving the monolith as a facade that merely re-exports would strand a 665-line file whose body is now 90% dead weight and an attractive nuisance for future edits; per the scope's own ratified decision (2026-07-11) the monolith is DELETED, not kept as a facade.
    * `[ ]`   This is NOT a pure function (DB, storage, and notification I/O throughout) — it gets the complete function-folder module: interface, mock, tests. It does NOT get `.guard.ts`/`.guard.test.ts` (see `deps`) or `.provides.ts`/`.integration.test.ts` (see those sections below) — each omission is a reasoned call, not an oversight, exactly as `renderStructuredDocument`'s node reasoned through its own omissions.
    * `[ ]`   Functional goal: copy `document_renderer.ts:126-140` (signature + param destructure) and `:562-658` (path-context construction, persistence, notification) VERBATIM, and replace the four already-extracted ranges (`:141-247` chain assembly, `:249-305` template load, `:307-466` chunk merge, `:468-560` structured render) with calls into the four sibling modules this sprint already produced. Public signature, `RenderDocumentParams`, and `RenderDocumentResult` are UNCHANGED — every one of the 7 importers this node repoints (see below) continues to call `ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params)` exactly as today (verified against `processRenderJob.ts:92-116`, `index.ts:41,110,188`), so this node's entire external contract is a no-op for every consumer except the import path.
    * `[ ]`   Critical design constraint, verified against the ratified plan: `DocumentRendererDeps` (re-homed unchanged below) gains ZERO new fields. `processRenderJob.ts` is enumerated under NODE & SPRINT RULES exception (2) as "a one-line import-path edit with zero behavior change" — its `rendererDeps` object literal (`processRenderJob.ts:92-98`, `{ downloadFromStorage, fileManager, notificationService, notifyUserId, logger }`) is NOT touched by this node. This is only possible because the three non-pure sibling modules this orchestrator now calls need nothing `DocumentRendererDeps` doesn't already carry: `assembleContributionChain`'s own `Deps` is `{}` (empty, per its node); `loadDocumentTemplate`'s `Deps` is `{ downloadFromStorage }`, satisfied by `deps.downloadFromStorage`; `mergeChunkContent`'s `Deps` is `{ downloadFromStorage, logger }`, satisfied by `deps.downloadFromStorage`/`deps.logger`. Therefore all four sibling modules (including `renderStructuredDocument`, which takes no `Deps` at all) are imported DIRECTLY by `renderDocument.ts` — matching `renderStructuredDocument`'s own already-established direct-import precedent, extended here to all four for this ONE orchestrator's internal use — with their own `Params`/`Payload` objects constructed inline from `params`/`dbClient`/`deps` at each call site. This is a per-consumer DI decision, not a redefinition of the sibling modules' own contracts: `saveResponse.ts` (a later, different node) will inject bound closures for a different subset of these same modules for its own reasons; that does not affect this node's direct-import choice.
    * `[ ]`   Error-passthrough contract for the three Return-based calls: `renderDocument.ts` itself stays throw-based (unchanged `Promise<RenderDocumentResult>`, no `Return` union) — per `.github/instructions/error-handling.instructions.md`, each `{ error, retriable }` returned by `assembleContributionChain`/`loadDocumentTemplate`/`mergeChunkContent` is surfaced as `throw result.error;` (the exact object, never reconstructed into a new `Error` or message); `retriable` has no home in a throw-based contract and is intentionally dropped at this boundary — informational metadata for `Return`-based callers, not applicable here. `renderStructuredDocument` is a total pure function (no error path) and is called directly with no error handling around it, matching its own node's "a total function over its documented input shapes" characterization.
    * `[ ]`   Verbatim-tail finding (grounded by direct inspection, not assumed): unlike its four siblings, this node's copied tail (`:562-658`) contains NO genuinely-fresh error-handling defect requiring a fix. The `uploadResult.error` branch (`:606-623`) constructs a throwable `Error` from a plain `ServiceError` DATA SHAPE (`{message, code?, details?}`) returned by `fileManager.uploadAndRegisterFile` — this is not a received `Error` instance being discarded/reformatted (the class of violation the four sibling nodes fixed), it is a necessary construction of the first `Error` object at this point, so it stays as-is. The upload `catch` (`:629-632`) already rethrows the caught value unmodified (`throw e;` after logging) — already compliant. The notification `catch` (`:655-657`) already logs-and-swallows both the fresh "missing model_id" validation throw and any `sendJobNotificationEvent` failure, with NO rethrow — this is pre-existing best-effort behavior (a successfully-persisted render must not fail on a notification hiccup) that the scope's own framing ("that tail is RENDER-flow-specific and stays in the orchestrator") places outside this node's authorized scope to change; it is preserved exactly, not fixed.
    * `[ ]`   `ContributionRowMinimal` re-homes to `renderDocument.interface.ts` per the scope's explicit type census (`RenderDocumentParams`/`RenderDocumentResult`/`DocumentRendererDeps`/`IDocumentRenderer`/`ContributionRowMinimal`) even though `renderDocument.ts` itself never constructs a value of this type (the original `document_renderer.ts` doesn't either — it uses `DialecticContributionRow` throughout). Its only current consumers are `document_renderer.test.ts:7` (import only, never instantiated in a fixture — grep-verified) and `verify_renderer.ts:9,28` (the dev-only harness, deleted by this node). It is re-homed anyway because the scope names it as part of this module's public type surface and no other sibling module claims it; it costs nothing to carry forward and breaks nothing to drop its sole non-deleted importer's now-dead import (handled by the `document_renderer.test.ts` redistribution below, which drops the unused import rather than carrying it into `renderDocument.test.ts`).
    * `[ ]`   Non-functional constraints:
      * `[ ]`   `mergeChunkContent`'s own `MergeChunkContentPayload.orderedChunks` re-derives `contentBucket` from `orderedChunks[0].storage_bucket` internally and trusts `assembleContributionChain`'s non-empty guarantee (per that node's own stated reasoning) — `renderDocument.ts` inherits the SAME trust for its own `base = orderedChunks[0]` use in the path-context/persistence tail: `assembleContributionChain`'s construction step 6 already returns a fresh error before ever returning an empty `orderedChunks`, so no redundant empty-check is added here.
      * `[ ]`   `modelSlug`/`attemptCount`/`sourceGroupFragment`/`sourceAnchorModelSlug` are consumed directly from `assembleContributionChain`'s success return — the original inline derivation this data required (`document_renderer.ts:229-247`, `deconstructStoragePath` + `extractSourceGroupFragment`) is NOT reproduced in `renderDocument.ts`; it already happened inside the sibling module.
      * `[ ]`   Byte-encoding (`document_renderer.ts:562`, `new TextEncoder().encode(rendered)`) stays the orchestrator's own responsibility, per `renderStructuredDocument`'s node explicitly deferring it here.

  * `[ ]`   `role`
    * `[ ]`   The surviving orchestrator for `_shared/services/document_renderer/` — the ONE module with DB, storage, AND notification I/O in this sub-tree, composing the four pure/narrow sibling modules into the exact end-to-end behavior `document_renderer.ts` provided, and the ONLY module in this sub-tree exposed through `IDocumentRenderer`/`IJobContext.documentRenderer`.
    * `[ ]`   Out of scope: any of the four siblings' own internal logic (chain assembly, template loading, chunk merging, structured rendering) — this module calls them, it does not reimplement or re-validate their internals; any COMPRESS-specific logic (this module has no COMPRESS awareness — `saveResponse.ts`'s COMPRESS branch, a later node, calls `loadDocumentTemplate`/`renderStructuredDocument` directly, not through this orchestrator).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/_shared/services/document_renderer/renderDocument/` (new) plus SIX deletions (`document_renderer.ts`, `.interface.ts`, `.mock.ts`, `.test.ts`, `.examples.test.ts`, `verify_renderer.ts`) plus SEVEN one-line importer repoints (`dialectic-worker/index.ts:41`, `dialectic-worker/index.test.ts:36`, `dialectic-worker/processRenderJob.ts:5`, `dialectic-service/dialectic.interface.ts:8`, `dialectic-worker/createJobContext/JobContext.interface.ts:33`, `dialectic-worker/createJobContext/JobContext.mock.ts:9`, `dialectic-worker/createJobContext/createJobContext.interface.test.ts:15`) — all thirteen touches are this ONE node's responsibility per NODE & SPRINT RULES' enumerated exceptions (the composition root's second touch this epic at `index.ts`; `processRenderJob.ts`'s only touch this epic; `dialectic.interface.ts`'s second touch this epic; `JobContext.interface.ts`'s second touch this epic).
    * `[ ]`   Inside boundary: signature/param destructure, delegation to the four sibling modules, path-context construction, persistence via `fileManager`, `render_completed` notification.
    * `[ ]`   Outside boundary: contribution-chain querying, template DB/storage lookup, chunk download/sanitize/merge, structured-record-to-Markdown rendering (all four already live in their own sibling modules); any COMPRESS-specific logic.

  * `[ ]`   `deps`
    * `[ ]`   `DocumentRendererDeps` (re-homed unchanged): `{ downloadFromStorage: DownloadFromStorageFn; fileManager: IFileManager; notificationService: NotificationServiceType; notifyUserId: string; logger: ILogger; }` — provider: `dialectic-worker/index.ts` (composition root, unchanged construction site). No new field (see `objective`).
    * `[ ]`   `assembleContributionChain`/`loadDocumentTemplate`/`mergeChunkContent`/`renderStructuredDocument` are imported DIRECTLY from their sibling modules (this sprint's four prior nodes), not injected — matching `renderStructuredDocument`'s own established direct-import reasoning, extended here for the other three because their own `Deps` shapes are fully satisfiable from `DocumentRendererDeps` fields already in hand (see `objective`).
    * `[ ]`   No `.guard.ts`/`.guard.test.ts`: `RenderDocumentParams`/`DocumentRendererDeps` never had runtime guards in the original (`document_renderer.interface.ts` has no guard companion — confirmed, no such file exists on disk) and this relocation changes neither shape nor call-site validation; inventing a guard file for a pre-existing, unchanged, unguarded contract would be aligning an EXISTING file to a standard beyond what the "edit existing files" rule authorizes.
    * `[ ]`   Confirm: no reverse dependency (this module imports FROM its four siblings, never the other direction); no lateral violation — `_shared/services/document_renderer/renderDocument/` does not import from `dialectic-worker/`.

  * `[ ]`   `renderDocument.interface.ts` (re-homing; no companion `.interface.test.ts` — see below)
    * `[ ]`   Re-home VERBATIM from `document_renderer.interface.ts`: `ContributionRowMinimal`, `RenderDocumentParams` (`{ projectId, sessionId, iterationNumber, stageSlug, documentIdentity, documentKey: FileType, sourceContributionId, template_filename }`), `RenderDocumentResult` (`{ pathContext: PathContext, renderedBytes: Uint8Array }`), `DocumentRendererDeps`, `RenderDocumentFn` (`(dbClient, deps, params) => Promise<RenderDocumentResult>`), `IDocumentRenderer` (`{ renderDocument: RenderDocumentFn }`) — zero shape changes to any of the six; only the file's own relative import paths shift for the new nesting depth (e.g. `../../../types/file_manager.types.ts` → `../../../../types/file_manager.types.ts`, `../../../../dialectic-service/dialectic.interface.ts` → `../../../../../dialectic-service/dialectic.interface.ts`, matching this sprint's established two-levels-deeper convention for `document_renderer/<module>/` nesting).
    * `[ ]`   `DownloadedChunkText` is NOT re-homed here — it already re-homed to `mergeChunkContent.interface.ts` in the prior node; `document_renderer.interface.ts`'s copy is deleted along with the rest of that file, with no replacement needed in this module (this module has no remaining consumer of that type — chunk-text handling is entirely internal to `mergeChunkContent` now).
    * `[ ]`   No `.interface.test.ts`: every re-homed type is an EXACT, zero-change copy of an already-relied-upon shape (verified against all 7 current importers' usage) — there is no new `SuccessReturn`/`ErrorReturn` union to assert mutual exclusion over (this module stays throw-based, unlike its four `Return`-based siblings), so there is nothing for a contract test to newly assert.

  * `[ ]`   `renderDocument.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: `processRenderJob.ts` via `ctx.documentRenderer.renderDocument(dbClient, rendererDeps, params)` (unchanged call site, one call per RENDER job), itself reached from `dialectic-worker/index.ts`'s `defaultProcessors` wiring (unchanged).
    * `[ ]`   Required interaction, in order: one call to `assembleContributionChain` (one `dialectic_contributions` read), one call to `loadDocumentTemplate` (two reads + one storage download), one call to `mergeChunkContent` (N storage downloads, one per ordered chunk), one direct call to `renderStructuredDocument` (pure, no I/O), one `fileManager.uploadAndRegisterFile` write, one best-effort `notificationService.sendJobNotificationEvent` call.
    * `[ ]`   Failure modes: any `{error}` from the three Return-based calls propagates as `throw result.error` (unmodified); a `fileManager.uploadAndRegisterFile` DB-registration failure or thrown exception during upload propagates as a thrown `Error` (verbatim copy of the original's own construction, per `objective`); a missing `base.model_id` or notification-send failure is logged and swallowed, never thrown (pre-existing behavior, preserved).

  * `[ ]`   `renderDocument.mock.ts`
    * `[ ]`   Re-home `createDocumentRendererMock` VERBATIM from `document_renderer.mock.ts` (options `{ handler?, defaultResult? }`, returns `{ renderer, calls }`, default result reflects input `params` in its `pathContext` exactly as today) — only its own import paths shift for the new nesting depth; behavior and shape unchanged.

  * `[ ]`   `renderDocument.test.ts` (Behavioral Verification — becomes this module's test file per the redistribution-map appendix's RETAIN disposition; also serves as this module's bounded-subsystem/integration proof, see below)
    * `[ ]`   PROOF SEQUENCE, in order (binds this node to the redistribution-map appendix):
      1. FIRST, repoint the untouched `document_renderer.test.ts` + `document_renderer.examples.test.ts` at the new `renderDocument`/sibling-module import paths and run green — the regression oracle proving the relocation changed nothing observable, exactly as the appendix specifies.
      2. THEN redistribute: the 9 MOVE(assembleContributionChain), 13 MOVE(mergeChunkContent), 4 MOVE(loadDocumentTemplate), and 7+4-examples MOVE(renderStructuredDocument) cases are ALREADY authored as those four modules' own `.test.ts`/`.examples.test.ts` files (this sprint's four prior nodes) — this node PRUNES exactly those rows from `document_renderer.test.ts`/`.examples.test.ts` and nothing else, per the appendix's own closing tally (37 cases, all assigned).
      3. The 10 RETAIN rows become THIS file's cases, import-repointed and re-wired to call the relocated `renderDocument` (still through its full `(dbClient, deps, params)` signature — these are orchestration-level, not unit, cases) with the REAL `assembleContributionChain`/`loadDocumentTemplate`/`mergeChunkContent` implementations running underneath (not their mocks) — only the Supabase client and `downloadFromStorage` are mocked, the two genuine external boundaries. This makes `renderDocument.test.ts` ALSO this module's bounded-integration suite by construction (it was already this shape in the original monolith test — a real end-to-end pipeline over a mocked DB/storage layer), so NO separate `.integration.test.ts` is created (matching `renderStructuredDocument`'s own "no redundant test tier" reasoning, applied here to the DB/storage-boundary case instead of the no-boundary case).
      4. THEN delete `document_renderer.ts`, `.interface.ts`, `.mock.ts`, `.test.ts`, `.examples.test.ts`, `verify_renderer.ts`.
      5. THEN repoint the 7 importers (see `construction`/`renderDocument.ts` below — no, see the dedicated bullet group after `renderDocument.ts`).
    * `[ ]`   RETAIN case 1 — "can be invoked following an EXECUTE job completion with job signature" (`document_renderer.test.ts:111-223`): single root contribution (`gpt-4o-mini_0_business_case_raw.json`, `document_relationships: { thesis: rootId }`), storage mock routes the raw-JSON path to `{ content: { executive_summary, market_opportunity } }` and every other path to `REAL_THESIS_BUSINESS_CASE_TEMPLATE` (this fixture constant now imported from `loadDocumentTemplate.mock.ts`, not redefined here), `MockFileManagerService` returns a mock file record; call `renderDocument(dbClient, { downloadFromStorage, fileManager, notificationService: mockNotificationService, notifyUserId: 'user_123', logger }, params)` and assert `result.pathContext`/`result.renderedBytes` are present, the decoded Markdown contains both section headers and their content, and the storage download spy was called.
    * `[ ]`   RETAIN case 2 — "renders chunks into markdown using a stage/file-type template" (`:400-537`): two chunks (root + one `target_contribution_id`-linked continuation, `edit_version` 1 then 2), each downloading to a distinct `{ content: {...} }` JSON body; asserts the rendered Markdown contains both chunks' `executive_summary` values IN ORDER (`indexOf` comparison) — proving the orchestrator's delegation to `assembleContributionChain` (ordering) → `mergeChunkContent` (merge) → `renderStructuredDocument` (render) preserves chain order end to end.
    * `[ ]`   RETAIN case 3 — "writes the rendered markdown to storage with deterministic final-artifact path" (`:539-671`): asserts `fileManager.uploadAndRegisterFile` is called exactly once with a `pathContext` whose `projectId`/`sessionId`/`iteration`/`stageSlug`/`documentKey`/`modelSlug` match the input params/derived chain data, and that the uploaded body (handling `string`/`Blob`/`ArrayBuffer`/Buffer-like `fileContent`) contains the expected chunk body text.
    * `[ ]`   RETAIN case 4 — "issues a notification that the document has been rendered with its signature" (`:673-776`): asserts `notificationService.sendJobNotificationEvent` is called exactly once with `type: 'render_completed'`, `sessionId`/`stageSlug`/`iterationNumber`/`document_key` matching input, `job_id === 'render-' + documentIdentity`, `modelId` equal to the base chunk's `model_id` UUID (not an api_identifier), a string `latestRenderedResourceId` equal to the mocked upload's returned record id, and the notified `userId` equal to the base chunk's `user_id`.
    * `[ ]`   RETAIN case 5 — "idempotent and cumulative behavior" (`:778+`): same inputs twice → identical output and identical final path; adding a continuation chunk → output includes the new body appended, path unchanged — proving determinism survives the delegation split.
    * `[ ]`   RETAIN case 6 — "passes the originating contribution id to FileManager" (`:1275+`): single-chunk fixture; asserts the `pathContext.sourceContributionId` / uploaded content reflects the source chunk correctly through the full delegated pipeline.
    * `[ ]`   RETAIN case 7 — "throws error when uploadAndRegisterFile returns an error" (`:2388+`): `fileManager` mock returns `{ record: null, error: <ServiceError> }`; asserts `renderDocument` THROWS (not silently ignores) — proving the verbatim-copied `:606-623` branch still converts a `ServiceError` return into a thrown `Error` after relocation.
    * `[ ]`   RETAIN case 8 — "ensures uploadAndRegisterFile is called with correct data" (`:3360-3471`): asserts the upload call's context passes `isResourceContext`, `pathContext.sourceContributionId === rootId`, `resourceTypeForDb === FileType.RenderedDocument`, and the uploaded `fileContent` (a `Uint8Array`) decodes to include the rendered content — proving the full `ResourceUploadContext` shape survives delegation unchanged.
    * `[ ]`   RETAIN case 9 — "PathContext includes sourceGroupFragment when base chunk has document_relationships.source_group" (`:3480-3701`): asserts `uploadArgs.pathContext.sourceGroupFragment` equals the expected fragment — proving `assembleContributionChain`'s `sourceGroupFragment` return flows through the orchestrator into the persisted `pathContext` unchanged.
    * `[ ]`   RETAIN case 10 — "PathContext works without source_group" (`:3710-3814`): asserts `uploadArgs.pathContext.sourceGroupFragment === undefined` when the base chunk's `document_relationships` carries no `source_group` — the `undefined` branch of the same flow-through as case 9.
    * `[ ]`   Local test helper `createMockFileRecord` (`document_renderer.test.ts:82-102`, a `dialectic_project_resources` row builder) is COPIED verbatim into `renderDocument.test.ts` (it is a test-local helper in the original, not exported from any module — no sibling module owns it); `REAL_THESIS_BUSINESS_CASE_TEMPLATE` is IMPORTED from `loadDocumentTemplate.mock.ts` (re-homed there by that node) rather than redefined; `MockFileManagerService` continues to import from the untouched sibling `_shared/services/file_manager.mock.ts` (now `../../file_manager.mock.ts` from the new nesting depth); `mockNotificationService`/`resetMockNotificationService`, `logger`, `downloadFromStorage`, `isResourceContext` all continue to import from their existing, untouched locations (paths adjusted two levels deeper).
    * `[ ]`   Do NOT re-test: any MOVE-disposition case (chain ordering/dedupe/DB-filter-predicates, chunk-merge JSON parsing/sanitization, template-query disambiguation, per-item/flat rendering strategy, comment stripping) — each already has direct, focused coverage in its owning sibling module's own `.test.ts`, authored in this sprint's four prior nodes.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the exported function. Sequential order, delegating in place of the four extracted ranges, tail otherwise identical to the original's order:
      1. Destructure `params` exactly as `document_renderer.ts:131-139` does.
      2. `const chainResult = await assembleContributionChain({}, { dbClient }, { sessionId, iterationNumber, stageSlug, documentIdentity });` → `'error' in chainResult` → `throw chainResult.error;`; else destructure `{ orderedChunks, modelSlug, attemptCount, sourceGroupFragment, sourceAnchorModelSlug }`.
      3. `const templateResult = await loadDocumentTemplate({ downloadFromStorage: deps.downloadFromStorage }, { dbClient }, { projectId, templateFilename: params.template_filename });` → `'error' in templateResult` → `throw templateResult.error;`; else destructure `{ templateText }`.
      4. `const mergeResult = await mergeChunkContent({ downloadFromStorage: deps.downloadFromStorage, logger: deps.logger }, { dbClient }, { orderedChunks });` → `'error' in mergeResult` → `throw mergeResult.error;`; else destructure `{ mergedStructuredData }`.
      5. `const rendered = renderStructuredDocument(templateText, mergedStructuredData, documentKey);` (direct call, no error path — pure function).
      6. `const renderedBytes = new TextEncoder().encode(rendered);` (COPY `document_renderer.ts:562` verbatim).
      7. `const base = orderedChunks[0];` (trusting `assembleContributionChain`'s non-empty guarantee — no re-validation, per `objective`); build `pathContext`/`uploadContext` and call `deps.fileManager.uploadAndRegisterFile` — COPY `document_renderer.ts:564-633` verbatim, substituting `base.storage_bucket`-derived locals with nothing (no longer needed — `mergeChunkContent` handled storage internally) and using the delegated `modelSlug`/`attemptCount`/`sourceGroupFragment`/`sourceAnchorModelSlug` in place of the original's inline-derived locals of the same names.
      8. Send the `render_completed` notification — COPY `document_renderer.ts:635-658` verbatim, unchanged (log-and-swallow preserved, per `objective`).
      9. `return { pathContext, renderedBytes };`.

  * `[ ]`   `renderDocument.ts` (Implementation)
    * `[ ]`   Direct imports (not injected): `assembleContributionChain` from `../assembleContributionChain/assembleContributionChain.ts`, `loadDocumentTemplate` from `../loadDocumentTemplate/loadDocumentTemplate.ts`, `mergeChunkContent` from `../mergeChunkContent/mergeChunkContent.ts`, `renderStructuredDocument` from `../renderStructuredDocument/renderStructuredDocument.ts` (all four sibling modules from this sprint's prior nodes, all four already exist by the time this node runs per the scope's strict node order).
    * `[ ]`   COPY `document_renderer.ts:126-140` (signature, `RenderDocumentFn`-shaped export, param destructure) verbatim.
    * `[ ]`   REPLACE `document_renderer.ts:141-247` (chain assembly) with construction step 2 above.
    * `[ ]`   REPLACE `document_renderer.ts:249-305` (template load) with construction step 3 above.
    * `[ ]`   REPLACE `document_renderer.ts:307-466` (chunk merge) with construction step 4 above.
    * `[ ]`   REPLACE `document_renderer.ts:468-560` (structured render) with construction step 5 above.
    * `[ ]`   COPY `document_renderer.ts:562-658` (byte-encode, path-context, persist, notify) verbatim, with ONLY the identifier substitutions construction step 7 names (delegated scalars in place of inline-derived ones) — no other change, per the `objective`'s verbatim-tail finding.
    * `[ ]`   `export default { renderDocument };` (COPY `document_renderer.ts:663` verbatim — the module's existing default-export shape, still relied on nowhere obviously beyond convention, preserved as-is since changing it is outside this node's scope).
    * `[ ]`   No other logic — this function does nothing `document_renderer.ts:126-661` didn't already do, now composed from five pieces (four sibling calls + the unchanged tail) instead of one inline body.

  * `[ ]`   Deletion (rides this node — not a separate node, per NODE & SPRINT RULES)
    * `[ ]`   DELETE `supabase/functions/_shared/services/document_renderer.ts`, `document_renderer.interface.ts`, `document_renderer.mock.ts`, `document_renderer.test.ts`, `document_renderer.examples.test.ts`, `supabase/functions/_shared/services/verify_renderer.ts` — only after the proof sequence in `renderDocument.test.ts` above (oracle run, then redistribute/prune, then delete) confirms zero behavioral drift.

  * `[ ]`   Importer repoints (ride this node — import-path-only, zero behavior change, per NODE & SPRINT RULES enumerated exceptions)
    * `[ ]`   `dialectic-worker/index.ts:41` — `import { renderDocument } from '../_shared/services/document_renderer.ts';` → `import { renderDocument } from '../_shared/services/document_renderer/renderDocument/renderDocument.ts';` (composition root's SECOND enumerated touch this epic; `:110`'s `const documentRenderer = { renderDocument };` and `:188`'s wiring into `IJobContext` are UNCHANGED — the imported symbol's name and shape are identical).
    * `[ ]`   `dialectic-worker/index.test.ts:36` — same import, same new path.
    * `[ ]`   `dialectic-worker/processRenderJob.ts:5` — `import { RenderDocumentParams, DocumentRendererDeps } from '../_shared/services/document_renderer.interface.ts';` → `.../document_renderer/renderDocument/renderDocument.interface.ts` (its only touch this epic; `:92-116`'s `rendererDeps` construction and `ctx.documentRenderer.renderDocument(...)` call are UNCHANGED).
    * `[ ]`   `dialectic-service/dialectic.interface.ts:8` — `import type { IDocumentRenderer } from "../_shared/services/document_renderer.interface.ts";` → new path (its SECOND touch this epic, after Sprint 3's `processJob.ts` node; no other line in this file changes here).
    * `[ ]`   `dialectic-worker/createJobContext/JobContext.interface.ts:33` — `import { IDocumentRenderer } from '../../_shared/services/document_renderer.interface.ts';` → new path (its SECOND touch this epic, after Sprint 3's `createJobContext.ts` node; `:261`/`:351`'s `readonly documentRenderer: IDocumentRenderer;` fields are UNCHANGED — same imported type, same shape).
    * `[ ]`   `dialectic-worker/createJobContext/JobContext.mock.ts:9` — `import { createDocumentRendererMock } from '../../_shared/services/document_renderer.mock.ts';` → `.../document_renderer/renderDocument/renderDocument.mock.ts`.
    * `[ ]`   `dialectic-worker/createJobContext/createJobContext.interface.test.ts:15` — same import, same new path.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: shared service (I/O-boundary orchestrator). Deps inward: `DocumentRendererDeps` (unchanged, provided by `dialectic-worker/index.ts`), direct imports of `assembleContributionChain`/`loadDocumentTemplate`/`mergeChunkContent`/`renderStructuredDocument` (this sprint's four prior nodes). Provides outward: `renderDocument`/`IDocumentRenderer` to `dialectic-worker/index.ts` (composition root) and, transitively via `IJobContext.documentRenderer`, to `processRenderJob.ts`. No cycles: this module does not import from `dialectic-worker/`.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   Given any of the 10 RETAIN fixtures, `renderDocument` under the new delegated implementation produces byte-identical `renderedBytes`/`pathContext` to the pre-relocation monolith (proven by the oracle-then-redistribute proof sequence).
    * `[ ]`   Any `{error}` returned by `assembleContributionChain`/`loadDocumentTemplate`/`mergeChunkContent` is thrown as the exact received object — never reconstructed, per `.github/instructions/error-handling.instructions.md`.
    * `[ ]`   `DocumentRendererDeps` carries zero new fields; `processRenderJob.ts`'s `rendererDeps` construction (`:92-98`) is byte-for-byte unchanged except its one import line.
    * `[ ]`   `document_renderer.ts`, `.interface.ts`, `.mock.ts`, `.test.ts`, `.examples.test.ts`, and `verify_renderer.ts` no longer exist in the repository after this node.
    * `[ ]`   All 7 enumerated importers resolve against the new module paths with no other line changed in any of them.
    * `[ ]`   `ContributionRowMinimal` is re-homed to `renderDocument.interface.ts` verbatim, unused internally, carried forward per the scope's type census.

* `[ ]`   supabase/functions/dialectic-worker/saveResponse/`saveResponse.ts` **[BE] Route the stream callback by the job row's job_type BEFORE the EXECUTE path's output_type gate — a COMPRESS job's response is validated (JSON-mode structural drift check), rendered through its source document's original template (JSON mode) or persisted as-is (text mode), and saved as a canonical CompressedContext resource with real wallet debit and no user-facing notifications, while the existing EXECUTE→contribution path is untouched**

  * `[ ]`   `objective`
    * `[ ]`   Solve the missing COMPRESS branch in the stream-response callback. `saveResponse.ts` today (1276 lines) is EXECUTE-only: it fetches the `dialectic_generation_jobs` row (`:129-145`), reads `job.payload.output_type` and gates it through `isModelContributionFileType` (`:154-167`) — a COMPRESS job's payload (canonical shape, `enqueueCompressJobs.interface.ts`, Sprint-3 node) carries no `output_type` at all and would be rejected there, exactly as the scope's own WS-B text states. The routing decision must happen BEFORE that gate, keyed on `job.job_type` (already available on the fetched row — `job_type: JobType`, confirmed on `DialecticJobRow`/`Tables<'dialectic_generation_jobs'>`, and `JobType` already gains `'COMPRESS'` via the Sprint-3 `processJob.ts` node's single touch to `dialectic.interface.ts`).
    * `[ ]`   Functional goal: insert `if (job.job_type === 'COMPRESS') { return await saveCompressResponse(deps, params, payload, job, dbClient); }` immediately after `const job: DialecticJobRow = jobRows[0];` (`saveResponse.ts:145`) and before the `jobPayloadUnknown`/`output_type` handling begins (`:146+`) — the EARLIEST point at which `job.job_type` is known and the LATEST point before any EXECUTE-only field is read. `saveCompressResponse` is a NEW, unexported, module-scope function in this SAME file (matching this file's own existing precedent of unexported local helpers — `readOptionalPreflightInputTokens`/`readOptionalContinuationCount`, `:74-108` — and the epic's own precedent of internal, non-exported helper functions living inside their owning node's implementation file rather than spawning a new node/file for them).
    * `[ ]`   Design rationale for a mostly-SEPARATE function rather than threading `if (isCompress)` branches through the existing 1130 lines: the scope's own framing — "route by the job row's `job_type` FIRST" — signals a clean fork, not deep interleaving. `saveCompressResponse` re-fetches its OWN `ai_providers`/`dialectic_sessions` rows and re-builds its own `aiResponse`/retry-on-error sequence (duplicating a SMALL amount of boilerplate already present in the EXECUTE path) rather than threading COMPRESS-specific state through EXECUTE-only locals (`canonicalUnknown`, `restOfCanonicalPathParams`, `document_relationships`, `contributionType`, all genuinely EXECUTE/contribution-shaped and inapplicable to a resource artifact). This keeps EXECUTE's existing 1130 lines COMPLETELY UNTOUCHED (verified: the ONLY EXECUTE-path edit this node makes is the four-line routing insertion above) and keeps `saveCompressResponse` independently readable as the COMPRESS job's own complete lifecycle.
    * `[ ]`   Shared machinery `saveCompressResponse` reuses BY DIRECT CALL to the same deps (not by refactoring the EXECUTE path into shared helpers — no such extraction is authorized by this node): `deps.retryJob` (identical call shape — generic over any `DialecticJobRow`), `deps.resolveFinishReason`, `deps.sanitizeJsonContent` (JSON mode only), `deps.debitTokens` (identical `DebitTokensParams`/`Payload` shape, identical `ChatMessageRow`-pair `databaseOperation`), `deps.fileManager.uploadAndRegisterFile` (already generic over every `ResourceFileTypes` member per the shipped Sprint-2 `file_manager.ts` behavior — no source change to `file_manager.ts` is needed, matching that already-completed node's own finding).
    * `[ ]`   COMPRESS payload narrowing: `job.payload` is validated via `isDialecticCompressJobPayload` (imported from `../enqueueCompressJobs/enqueueCompressJobs.guard.ts`, owned by the Sprint-3 `enqueueCompressJobs.ts` node — NOT redefined here) into `DialecticCompressJobPayload` (imported from `../enqueueCompressJobs/enqueueCompressJobs.interface.ts`, same node) — a validation failure here is a fresh, non-retriable `Error` (this file's own existing convention for malformed job state, matching every other `isX(...)` guard failure in this file, e.g. `:115-119`).
    * `[ ]`   Mode-based content handling (replaces EXECUTE's `isIntermediate`/continuation-aware sanitize branch, `:357-445`, entirely — COMPRESS has no intermediate-chunk or continuation concept; chunking already happened at spawn time via `enqueueCompressJobs`'s map-reduce split, and the recursion guard means a COMPRESS job's own output is never itself compressed):
      * `[ ]`   `compressPayload.mode === 'json'`: `deps.sanitizeJsonContent(aiResponse.content)` → invalid sanitization result or `JSON.parse` failure → `deps.retryJob` (SAME retry semantics as EXECUTE's own malformed-JSON branch, `:396-421`) then return `{ status: 'completed' }` (retry path, not a hard failure — matches the EXECUTE precedent exactly). On successful parse: `JSON.parse(compressPayload.content)` (the SOURCE JSON carried in the payload — this parse is of OUR OWN internally-constructed payload field, not model output, so a parse failure here is a fresh, non-retriable `Error`, not a retry candidate) → `structuralKeyShapeMatches(sourceParsed, compressedParsed)` (NEW internal helper, this node — see below) → mismatch → non-retriable `CompressionDriftError` (NEW error class, `_shared/utils/errors.ts` companion touch) — explicit job failure, per the scope's "drift is a validated invariant, not a hope." Match → resolve the SOURCE document's template: `deps.resolveTemplateFilename({}, { dbClient }, { stageSlug: compressPayload.sourceStageSlug, outputType: compressPayload.docType, documentKey: compressPayload.documentKey })` (all three GUARANTEED present by the tightened `isDialecticCompressJobPayload`'s json-mode branch, per the already-ratified canonical-contract amendment — no runtime fallback needed) → `'error' in result` → `return { error: result.error, retriable: result.retriable }` (surfaced verbatim, per `.github/instructions/error-handling.instructions.md`, matching this epic's established pattern) → `deps.loadDocumentTemplate({ downloadFromStorage: deps.downloadFromStorage }, { dbClient }, { projectId: compressPayload.projectId, templateFilename: result.templateFilename })` → error → surfaced verbatim → `deps.renderStructuredDocument(templateText, compressedParsed, documentKeyAsFileType)` (`documentKeyAsFileType` = `compressPayload.documentKey` narrowed via the ALREADY-IMPORTED `isFileType` guard, `:31`/`:993` precedent; not a `FileType` → non-retriable `Error`) → `contentForStorage = renderedMarkdown`.
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
    * `[ ]`   `renderStructuredDocument` is INJECTED here (unlike `renderDocument.ts`'s own direct-import choice for the same pure function) — a deliberate, DIFFERENT per-consumer DI decision: `renderDocument.test.ts` proves behavior via DB/storage-mocked end-to-end oracle cases (direct-import is sufficient there), whereas `saveResponse.test.ts`'s existing suite is unit-style, per-branch, and this node's own COMPRESS route-matrix tests (below) isolate the render step by stubbing it — injection serves that isolation. `renderStructuredDocument`'s own contract (`(templateText, structuredRecord, documentKey) => string`, no `Deps`/`Params`/`Payload` split, pure) is UNCHANGED by either consumer's choice.
    * `[ ]`   `downloadFromStorage: DownloadFromStorageFn` is a NEW required field on `SaveResponseDeps` — `loadDocumentTemplate` needs it and `saveResponse.ts` has never had a `downloadFromStorage` dep before (EXECUTE never downloads anything; it only uploads). Imported from `../../_shared/supabase_storage_utils.ts`, matching every other consumer's existing import of the same type.
    * `[ ]`   `isDialecticCompressJobPayload`/`DialecticCompressJobPayload` are imported directly (not injected — they are types/pure guards, matching how `isEnqueueRenderJobSuccessReturn`/`isDialecticStageSlug` are already directly imported at `saveResponse.ts:69-72`, not injected as `Deps`).
    * `[ ]`   Confirm: no reverse dependency (this node imports FROM its four Sprint-4 siblings and Sprint-3's `enqueueCompressJobs`, never the other direction); no lateral violation (`dialectic-worker/saveResponse/` continues to import only from `_shared/` and sibling `dialectic-worker/` modules, as it already does).

  * `[ ]`   `saveResponse.interface.ts`
    * `[ ]`   `SaveResponseDeps` (`:42-55`) gains `resolveTemplateFilename: BoundResolveTemplateFilenameFn; loadDocumentTemplate: BoundLoadDocumentTemplateFn; renderStructuredDocument: RenderStructuredDocumentFn; downloadFromStorage: DownloadFromStorageFn;` — four new required fields, alphabetically inserted alongside the existing eleven per this file's existing field ordering style.
    * `[ ]`   Add the four new type imports (`BoundResolveTemplateFilenameFn`, `BoundLoadDocumentTemplateFn`, `RenderStructuredDocumentFn`, `DownloadFromStorageFn`) at the top of the file, alongside the existing `BoundEnqueueRenderJobFn` import (`:16`).
    * `[ ]`   `SaveResponseParams`/`SaveResponsePayload`/`SaveResponseSuccessReturn`/`SaveResponseErrorReturn`/`SaveResponseReturn`/`SaveResponseFn`/`SaveResponseRequestBody`/`NodeTokenUsage` are UNCHANGED — the callback's own request/response shape is identical for EXECUTE and COMPRESS (both ride the same stream transport).
    * `[ ]`   No `.interface.test.ts` change: this file has none today (confirmed — `saveResponse.interface.test.ts` exists in the directory but is untouched by this node beyond whatever new-field coverage the guard test below adds; no NEW contract shape is introduced, only new required fields on an already-tested Deps interface).

  * `[ ]`   `saveResponse.interaction.spec` (prose; no file, matching this epic's established no-literal-`.interaction.spec` precedent)
    * `[ ]`   Called by: the Netlify stream callback (`netlifyResponse/index.ts`, unchanged call site — `netlifyResponseHandler` is untouched per the scope's own "a COMPRESS response is an ordinary stream response").
    * `[ ]`   Required interaction (COMPRESS branch): one `dialectic_generation_jobs` read (shared prefix), one `ai_providers` read, one `dialectic_sessions` read, one `token_wallets` read, one `resolveTemplateFilename` call (json mode only), one `loadDocumentTemplate` call (json mode only), one `renderStructuredDocument` call (json mode only, pure), one `debitTokens` call, one `fileManager.uploadAndRegisterFile` write, one `dialectic_generation_jobs` update (job completion) — no notification calls.
    * `[ ]`   Failure modes: `isDialecticCompressJobPayload` rejection (non-retriable); provider/session/wallet not-found (non-retriable, matching EXECUTE's existing style); empty/errored AI response or malformed json-mode content (RETRY, via `deps.retryJob`, matching EXECUTE); a continuation-signaling finish_reason (non-retriable, COMPRESS-specific hard fail); structural drift (non-retriable `CompressionDriftError`); template resolution/load failure (surfaced verbatim from the sibling module); upload failure (non-retriable, matching EXECUTE's existing upload-error style).

  * `[ ]`   `saveResponse.guard.ts`
    * `[ ]`   `isSaveResponseDeps` (`:99-172`) — add the four new keys (`resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument`, `downloadFromStorage`) to the `keys` array (`:103-116`) and their `typeof v.<key> !== 'function'` checks (`:144-170` pattern), matching this file's existing per-field verification style exactly.
    * `[ ]`   `isSaveResponseParams`/`isSaveResponsePayload`/`isSaveResponseSuccessReturn`/`isSaveResponseErrorReturn`/`isSaveResponseRequestBody` are UNCHANGED (shapes unchanged, per the interface note above).
    * `[ ]`   `saveResponse.guard.test.ts` (existing file, gains cases): `isSaveResponseDeps` rejects a Deps object missing any ONE of the four new fields; accepts a fully-populated Deps object including them.

  * `[ ]`   `saveResponse.mock.ts`
    * `[ ]`   `createMockSaveResponseDeps` (`:135-191`) — add the four new fields to its `base: SaveResponseDeps` literal: `resolveTemplateFilename: async () => ({ templateFilename: 'mock_template.md' })`, `loadDocumentTemplate: async () => ({ templateText: 'mock template text' })`, `renderStructuredDocument: () => 'mock rendered markdown'`, `downloadFromStorage: async () => ({ data: new ArrayBuffer(0), error: null })` — matching this file's existing minimal-stub style for every other function field (`continueJob`/`retryJob`/`enqueueRenderJob`, `:143-185`).
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

  * `[ ]`   `_shared/utils/errors.ts` (companion touch)
    * `[ ]`   Add `export class CompressionDriftError extends Error { constructor(message: string) { super(message); this.name = 'CompressionDriftError'; } }`, identical shape to the file's existing six classes (`:1-42`), appended after `RenderJobEnqueueError` (`:37-42`).

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

* `[ ]`   supabase/functions/netlifyResponse/`index.ts` **[BE] Wire the four new saveResponse deps and the one new enqueueRenderJob dep — WS-B's capstone composition-root node, resolving the transient non-compilable states left by the enqueueRenderJob.ts and saveResponse.ts nodes and closing out Sprint 4 (WS-B)**

  * `[ ]`   `objective`
    * `[ ]`   Resolve the compilation gaps deliberately left open by two prior WS-B nodes, both permitted only "within a sprint" per NODE & SPRINT RULES:
      * `[ ]`   `enqueueRenderJob.ts`'s node widened `EnqueueRenderJobDeps` to require `resolveTemplateFilename: BoundResolveTemplateFilenameFn`, but `boundEnqueueRenderJob`'s inline `EnqueueRenderJobDeps` literal (`index.ts:45-46`, `{ dbClient: adminClient, logger, shouldEnqueueRenderJob }`) does not yet supply it.
      * `[ ]`   `saveResponse.ts`'s node widened `SaveResponseDeps` to require FOUR new fields — `resolveTemplateFilename: BoundResolveTemplateFilenameFn`, `loadDocumentTemplate: BoundLoadDocumentTemplateFn`, `renderStructuredDocument: RenderStructuredDocumentFn`, AND `downloadFromStorage: DownloadFromStorageFn` — but `saveResponseDeps`'s inline literal (`index.ts:48-61`) does not yet supply any of them. NOTE (cross-node refinement): `Compression Jobs Scope.md`'s original WS-B text for this node named only THREE new `saveResponse` deps (`resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument`); the already-authored `saveResponse.ts` node (more detailed, and authoritative over the coarser scope-level text per this epic's own "detailed per-file workplans... generated after this plan is ratified" framing) discovered a FOURTH: `loadDocumentTemplate`'s own `Deps` requires `downloadFromStorage`, and `SaveResponseDeps` had no such field before (EXECUTE never downloads anything). This node wires all four, not three.
    * `[ ]`   Functional goals:
      * `[ ]`   Construct ONE `boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) => resolveTemplateFilename({}, params, payload);` (`ResolveTemplateFilenameDeps` is `{}`, per that node) and REUSE it at BOTH consumption sites — `boundEnqueueRenderJob`'s `EnqueueRenderJobDeps` literal AND `saveResponseDeps`'s literal — rather than constructing two separately-instantiated closures that could drift; both consumers need the identical `(params, payload) => Promise<ResolveTemplateFilenameReturn>` shape and there is no reason for two objects.
      * `[ ]`   Construct `boundLoadDocumentTemplate: BoundLoadDocumentTemplateFn = (params, payload) => loadDocumentTemplate({ downloadFromStorage }, params, payload);` (`LoadDocumentTemplateDeps` is `{ downloadFromStorage }`, per that node) and assign it to `saveResponseDeps.loadDocumentTemplate`.
      * `[ ]`   Assign `renderStructuredDocument` (the real, pure function — no `Deps`/`Params`/binding, per that node's own established direct-call contract) DIRECTLY to `saveResponseDeps.renderStructuredDocument`.
      * `[ ]`   Assign `downloadFromStorage` (the real function, `_shared/supabase_storage_utils.ts` — already imported by other Sprint-3/4 composition points, e.g. the OLD `document_renderer.test.ts`; NEW to this file) DIRECTLY to `saveResponseDeps.downloadFromStorage`.
      * `[ ]`   Add `resolveTemplateFilename: boundResolveTemplateFilename,` to `boundEnqueueRenderJob`'s `EnqueueRenderJobDeps` literal (`index.ts:46`), alongside the existing `dbClient: adminClient, logger, shouldEnqueueRenderJob`.
    * `[ ]`   Non-functional constraints:
      * `[ ]`   No other line in this file changes — `computeJobSig`, `adminClient`, `adminTokenWalletService`, `fileManager`, `notificationService`, `boundDebitTokens`, the `deps: NetlifyResponseDeps` object, and the trailing `serve(...)` call are all UNCHANGED.
      * `[ ]`   `netlifyResponseHandler.ts` is NOT modified by this node — per the scope's own framing, "a COMPRESS response is an ordinary stream response," the handler's routing/parsing logic needs no COMPRESS awareness; only the `deps` it receives change shape.
      * `[ ]`   `netlifyResponse.integration.test.ts` needs NO change: it already constructs its `saveResponseDeps` via `createMockSaveResponseDeps()` (`saveResponse.mock.ts`, already widened with working stubs for all four new fields by the `saveResponse.ts` node), so it compiles and passes unmodified once that node lands — grep-verified this file never constructs a raw `EnqueueRenderJobDeps`/`SaveResponseDeps` object literal of its own.

  * `[ ]`   `role`
    * `[ ]`   Composition-root wiring node — WS-B's OWN composition root (mirrors WS-R's `dialectic-worker/index.ts` node exactly), and the LAST node in Sprint 4 per the scope's strict node order (`resolveTemplateFilename → enqueueRenderJob → loadDocumentTemplate → renderStructuredDocument → assembleContributionChain → mergeChunkContent → renderDocument → saveResponse → netlifyResponse/index.ts`). This file has had NO prior touch this epic (confirmed: no `document_renderer`/`CompressedContext`/compression-related string appears anywhere in `netlifyResponse/index.ts` today).
    * `[ ]`   Out of scope: any change to the four functions being wired (`resolveTemplateFilename.ts`, `loadDocumentTemplate.ts`, `renderStructuredDocument.ts`, `enqueueRenderJob.ts`, `saveResponse.ts` — all already-written, unchanged nodes); `netlifyResponseHandler.ts`'s own routing logic; `dialectic-worker/index.ts`'s composition root (a DIFFERENT entrypoint — the background-worker job-processing loop — not touched by or related to this node beyond sharing some of the same underlying shared-module imports).

  * `[ ]`   `module`
    * `[ ]`   Bounded context: `supabase/functions/netlifyResponse/index.ts` (production composition root) plus its ONE companion touch, `supabase/functions/dialectic-worker/index.integration.test.ts`'s `buildNetlifyDeps` helper (`:148-178`) — test infrastructure for THIS composition root (it exists specifically to exercise `netlifyResponseHandler`/`saveResponse` end-to-end without a live Netlify process), not a second production entrypoint, per the scope's own explicit "it is test infrastructure for this composition root... it does not get its own node."
    * `[ ]`   Inside boundary: the two new imports (`resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument`, `downloadFromStorage`, and their two type imports), the two new bound-closure constants, the one new `EnqueueRenderJobDeps` field, the four new `SaveResponseDeps` fields — in BOTH files.
    * `[ ]`   Outside boundary: `netlifyResponseHandler`'s request routing; every wired-in function's own implementation; `dialectic-worker/index.ts`'s own, separate composition root.

  * `[ ]`   `deps`
    * `[ ]`   `resolveTemplateFilename`/`BoundResolveTemplateFilenameFn` (`_shared/utils/resolveTemplateFilename/`, this sprint's first node) — new imports.
    * `[ ]`   `loadDocumentTemplate`/`BoundLoadDocumentTemplateFn` (`_shared/services/document_renderer/loadDocumentTemplate/`, this sprint's third node) — new imports.
    * `[ ]`   `renderStructuredDocument`/`RenderStructuredDocumentFn` (`_shared/services/document_renderer/renderStructuredDocument/`, this sprint's fourth node) — new imports.
    * `[ ]`   `downloadFromStorage`/`DownloadFromStorageFn` (`_shared/supabase_storage_utils.ts`, pre-existing, never previously imported by this file) — new import.
    * `[ ]`   Confirm: no reverse dependency; no lateral violation — `netlifyResponse/index.ts` already sits at the top of ITS OWN dependency graph (a composition root); it is the only file allowed to import every module it wires for the stream-callback entrypoint.

  * `[ ]`   `dialectic-worker/index.integration.test.ts` (`buildNetlifyDeps`, riding this node — test-harness parity, not a second production entrypoint)
    * `[ ]`   Add the identical `boundResolveTemplateFilename`/`boundLoadDocumentTemplate` construction (same imports, same shape) inside `buildNetlifyDeps` (`:148-178`), alongside its existing `boundEnqueueRenderJob` construction (`:154-155`).
    * `[ ]`   Add `resolveTemplateFilename: boundResolveTemplateFilename,` to `boundEnqueueRenderJob`'s deps literal (`:155`).
    * `[ ]`   Add all four new fields (`resolveTemplateFilename: boundResolveTemplateFilename, loadDocumentTemplate: boundLoadDocumentTemplate, renderStructuredDocument, downloadFromStorage`) to the `srDeps: SaveResponseDeps` literal (`:157-171`) — placed BEFORE the `...saveResponseDepsOverrides` spread (`:170`) so individual tests can still override any of them, matching this literal's own existing convention for every other field.
    * `[ ]`   No other line in this file changes — every existing test in this file (the COMPRESS-unrelated EXECUTE-path assertions this file already carries) continues to pass unmodified, since `buildNetlifyDeps`'s four new fields are additive and every existing call site already goes through `buildNetlifyDeps(...)`, not a raw literal.

  * `[ ]`   `construction`
    * `[ ]`   No factory beyond the module's own top-level composition. The two new bound-closure constants are declared in the same flat `const x: T = (params, payload) => fn({...}, params, payload);` style as the existing `boundDebitTokens`/`boundEnqueueRenderJob` (`index.ts:42-46`); the new `EnqueueRenderJobDeps`/`SaveResponseDeps` fields are added to their existing object literals in the same flat style as every existing field, with no conditional logic.

  * `[ ]`   `index.ts` (Implementation)
    * `[ ]`   Add four new imports alongside the existing `enqueueRenderJob`/`shouldEnqueueRenderJob`/`saveResponse` imports (`index.ts:20-24`): `import { resolveTemplateFilename } from '../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.ts';`, `import type { BoundResolveTemplateFilenameFn } from '../_shared/utils/resolveTemplateFilename/resolveTemplateFilename.interface.ts';`, `import { loadDocumentTemplate } from '../_shared/services/document_renderer/loadDocumentTemplate/loadDocumentTemplate.ts';`, `import type { BoundLoadDocumentTemplateFn } from '../_shared/services/document_renderer/loadDocumentTemplate/loadDocumentTemplate.interface.ts';`, `import { renderStructuredDocument } from '../_shared/services/document_renderer/renderStructuredDocument/renderStructuredDocument.ts';`, `import { downloadFromStorage } from '../_shared/supabase_storage_utils.ts';`.
    * `[ ]`   Insert `const boundResolveTemplateFilename: BoundResolveTemplateFilenameFn = (params, payload) => resolveTemplateFilename({}, params, payload);` and `const boundLoadDocumentTemplate: BoundLoadDocumentTemplateFn = (params, payload) => loadDocumentTemplate({ downloadFromStorage }, params, payload);` immediately after the existing `boundEnqueueRenderJob` declaration (`index.ts:45-46`).
    * `[ ]`   Edit `boundEnqueueRenderJob`'s own literal (`index.ts:46`) to `enqueueRenderJob({ dbClient: adminClient, logger, shouldEnqueueRenderJob, resolveTemplateFilename: boundResolveTemplateFilename }, params, payload);`.
    * `[ ]`   Add four fields to the `saveResponseDeps: SaveResponseDeps` literal (`index.ts:48-61`): `resolveTemplateFilename: boundResolveTemplateFilename, loadDocumentTemplate: boundLoadDocumentTemplate, renderStructuredDocument, downloadFromStorage,` — placed alongside the existing `buildUploadContext`/`sanitizeJsonContent` fields, matching this literal's existing flat ordering.
    * `[ ]`   No other line in this file changes.

  * `[ ]`   `directionality`
    * `[ ]`   Layer: composition root (application boundary, outermost layer, stream-callback entrypoint). Deps inward: every Sprint-4 node (`resolveTemplateFilename.ts`, `enqueueRenderJob.ts`, `loadDocumentTemplate.ts`, `renderStructuredDocument.ts`, `saveResponse.ts`). Provides outward: nothing — this is the terminal node of WS-B's dependency graph; no later node imports from `netlifyResponse/index.ts`.
    * `[ ]`   No cycles: this node does not import from `dialectic-worker/index.ts`'s own composition root, nor from any WS-D/WS-X (Sprint 5) module.

  * `[ ]`   `requirements` (binary, observable)
    * `[ ]`   `boundEnqueueRenderJob`'s constructed `EnqueueRenderJobDeps` includes a `resolveTemplateFilename` function, reference-equal to the SAME `boundResolveTemplateFilename` used by `saveResponseDeps`.
    * `[ ]`   `saveResponseDeps` includes all four new fields (`resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument`, `downloadFromStorage`) as functions.
    * `[ ]`   `dialectic-worker/index.integration.test.ts`'s `buildNetlifyDeps` produces the identical four-field/one-field wiring, and every existing test in that file continues to pass unmodified.
    * `[ ]`   `netlifyResponse.integration.test.ts` continues to pass unmodified with no edit required.
    * `[ ]`   The repo compiles with no transient-non-compilable state remaining anywhere in WS-B — this is the node that closes out Sprint 4.
    * `[ ]`   No change to `netlifyResponseHandler.ts`, `serve(...)`, or any line of `netlifyResponse/index.ts` outside what is listed above.

  * **COMMIT Sprint 4.**
    * `[ ]`   List structural changes: `EnqueueRenderJobDeps` gains `resolveTemplateFilename`; `SaveResponseDeps` gains `resolveTemplateFilename`/`loadDocumentTemplate`/`renderStructuredDocument`/`downloadFromStorage`; `document_renderer.ts`/`.interface.ts`/`.mock.ts`/`.test.ts`/`.examples.test.ts`/`verify_renderer.ts` deleted; `_shared/services/document_renderer/` function-folder tree (`resolveTemplateFilename`, `loadDocumentTemplate`, `renderStructuredDocument`, `assembleContributionChain`, `mergeChunkContent`, `renderDocument`) created; `saveResponse.ts` gains COMPRESS routing; `netlifyResponse/index.ts` gains the composition wiring above.
    * `[ ]`   List behavioral changes: a COMPRESS job's stream response is now validated (JSON-mode structural drift check), rendered through its source document's template (JSON mode) or persisted as-is (text mode), and saved as a `CompressedContext` resource with real wallet debit and no notifications; EVERY existing RENDER/EXECUTE behavior is unchanged (proven by every pre-existing test in every touched file passing unmodified).
    * `[ ]`   List contract changes: `FileType.CompressedContext`/`CompressionSourceType`/`CompressionMode` (Sprint 2, corrected) are now consumed end-to-end; `ResourceUploadContext`'s resource branch persists a new artifact kind with no `file_manager.ts` source change; `IDocumentRenderer`'s public signature is UNCHANGED despite its full internal decomposition.

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