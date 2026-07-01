[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* `.github/instructions/*.instructions.md` for repo standards and requirements.
* `.cursor/commands/*.prompt.md` for task-specific direction. 

# Work Breakdown Structure

* **Embedding Jobs Implementation** 

* `[ ]`   supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts **[BE] Apply compression overlay to gathered artifacts by matching target_document_id from persisted RagContextSummary resource_description and swapping content in memory while preserving canonical source identity**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing consume-point for persisted RagContextSummary artifacts: after gatherArtifacts assembles the canonical document list, compression summaries have no function that reads them and replaces the relevant artifact content in memory before the model call is built.
      * `[ ]`   Functional goals:
         * `[ ]`   Query `dialectic_project_resources` for `resource_type = FileType.RagContextSummary` rows scoped to the current `sessionId`, `iterationNumber`, and `stageSlug`.
         * `[ ]`   For each compression row, guard and parse `resource_description` as `RagContextSummaryResourceDescription` to extract `target_document_id` and `source_fingerprint`.
         * `[ ]`   Match each compression row to an artifact in `payload.artifacts` by `artifact.id === target_document_id`; if no match, log warn and skip.
         * `[ ]`   Compute SHA-256 hex fingerprint of the matched artifact's current `content` (UTF-8 encoded) and compare to stored `source_fingerprint`; log a stale warning and skip the row when they do not match.
         * `[ ]`   For fresh matches, call `downloadFromStorage` with the compression row's `storage_bucket`, `storage_path`, and `file_name`; decode the returned `ArrayBuffer` as UTF-8 and replace only the `content` field on the matching artifact using a spread (`{ ...artifact, content: decoded }`).
         * `[ ]`   Return the full artifact array with all fresh overlays applied in-memory.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   DB query errors return retriable error; storage download errors for a matched fresh row return retriable error.
         * `[ ]`   Invalid or missing `resource_description` shape produces a warn log and skips the row — it is never a hard error return.
         * `[ ]`   Stale fingerprint mismatch produces a warn log and skips the row — it is never a hard error return.
         * `[ ]`   No artifact identity field (`id`, `document_key`, `stage_slug`, `type`) may be mutated at any step.
         * `[ ]`   No changes to `gatherArtifacts.ts`, `processComplexJob.ts`, or any Workstream C source file are made in this node.
      * `[ ]`   Each goal is atomic and testable through interface, guard, and unit coverage within this module.

   * `[ ]`   `role`
      * `[ ]`   Node role is the canonical in-memory overlay consumer for compression artifacts in the dialectic-worker domain.
      * `[ ]`   This role is correct because `applyCompressionOverlay.ts` is the first source file that implements the identity-safe content swap and is the direct producer consumed by `gatherArtifacts.ts` in the next Workstream D node.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not implement the `gatherArtifacts` caller integration in this node; that belongs to the `gatherArtifacts.ts` node.
         * `[ ]`   Do not implement compression artifact production or storage write; that belongs to Workstream C.
         * `[ ]`   Do not implement the job graph prerequisite state or parent-resume orchestration; that belongs to `processComplexJob.ts`.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/applyCompressionOverlay` and its immediate support files.
      * `[ ]`   Inside boundary:
         * `[ ]`   compression row DB query and `resource_description` parsing.
         * `[ ]`   SHA-256 fingerprint computation and freshness comparison.
         * `[ ]`   storage download and in-memory content replacement.
         * `[ ]`   interface, guard, mock, test, and provides for this function only.
      * `[ ]`   Outside boundary:
         * `[ ]`   `gatherArtifacts` rule-based artifact query loop.
         * `[ ]`   compression artifact write and DB registration (`file_manager.ts`, `compressPrompt.ts`).
         * `[ ]`   job graph orchestration and parent-resume state machine.
         * `[ ]`   `RagContextSummaryResourceDescription` type definition and `isRagContextSummaryResourceDescription` guard (defined in `file_manager.types.ts` and `type_guards.file_manager.ts` respectively — Workstream C producers).

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../../_shared/types.ts` — `ILogger`, `ResourceDocument`, `ResourceDocuments`.
         * `[ ]`   Layer classification: shared domain type producer.
         * `[ ]`   Direction: consumed by interface, implementation, and guards.
         * `[ ]`   Purpose: define the artifact shape that this function reads and replaces content on.
      * `[ ]`   Provider: `../../_shared/supabase_storage_utils.ts` — `DownloadFromStorageFn`.
         * `[ ]`   Layer classification: shared storage utility type producer.
         * `[ ]`   Direction: consumed by interface and implementation as an injected dep.
         * `[ ]`   Purpose: download compression artifact content bytes from Supabase storage.
      * `[ ]`   Provider: `../../dialectic-service/dialectic.interface.ts` — `DialecticProjectResourceRow`.
         * `[ ]`   Layer classification: shared DB row type producer.
         * `[ ]`   Direction: consumed by implementation and mock.
         * `[ ]`   Purpose: type the compression resource rows returned from the DB query.
      * `[ ]`   Provider: `../../_shared/types/file_manager.types.ts` — `FileType`, `RagContextSummaryResourceDescription`.
         * `[ ]`   Layer classification: shared domain type producer (introduced in Workstream C file_manager.ts node).
         * `[ ]`   Direction: consumed by implementation for `resource_type` filtering and `resource_description` shape access.
         * `[ ]`   Purpose: identify rag summary rows by `FileType.RagContextSummary` constant and access structured compression metadata fields.
      * `[ ]`   Provider: `../../_shared/utils/type-guards/type_guards.file_manager.ts` — `isRagContextSummaryResourceDescription`.
         * `[ ]`   Layer classification: shared runtime guard producer (introduced in Workstream C file_manager.ts node).
         * `[ ]`   Direction: consumed by implementation at runtime to narrow `resource_description` JSON.
         * `[ ]`   Purpose: reject rows with invalid or incomplete compression metadata before accessing typed fields.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from this function into `gatherArtifacts.ts` or `processComplexJob.ts`.
         * `[ ]`   No lateral layer violations with Workstream B callback/persistence modules.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `SupabaseClient.from('dialectic_project_resources').select('id,resource_type,resource_description,storage_bucket,storage_path,file_name').eq('resource_type', FileType.RagContextSummary).eq('session_id', sessionId).eq('iteration_number', iterationNumber).eq('stage_slug', stageSlug)` — select only required columns.
         * `[ ]`   `downloadFromStorage(bucket, storagePath, fileName)` returning `ArrayBuffer` on success, error value on failure — same shape used by `gatherArtifacts.ts`.
         * `[ ]`   `crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))` for fingerprint computation — no external dep required, available in Deno runtime.
         * `[ ]`   `logger.warn(msg, context)` for stale/skip events; `logger.info(msg, context)` for successful overlay events; `logger.error(msg, context)` for DB/download failure events.
      * `[ ]`   Injection shape: `ApplyCompressionOverlayDeps = { logger: ILogger; downloadFromStorage: DownloadFromStorageFn }`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated DB columns or tables.
         * `[ ]`   No hidden coupling to enqueue, saveResponse, netlifyResponse, or Workstream C internal modules.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.interface.test.ts`
      * `[ ]`   Valid `ApplyCompressionOverlayDeps`: object with logger and function `downloadFromStorage` satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayParams`: object with non-empty `projectId`, `sessionId`, `stageSlug`, numeric `iterationNumber`, and Supabase client shape satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayPayload`: object with array of `ResourceDocument`-shaped artifacts satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayPayload`: empty `artifacts` array satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlaySuccessReturn`: object with `artifacts` array and no `error` or `retriable` fields satisfies type.
      * `[ ]`   Valid `ApplyCompressionOverlayErrorReturn`: object with `error: Error` instance and `retriable: boolean` and no `artifacts` field satisfies type.
      * `[ ]`   Invalid params: missing `stageSlug` rejected by type contract fixture.
      * `[ ]`   Invalid params: non-string `projectId` rejected by type contract fixture.
      * `[ ]`   Invalid payload: non-array `artifacts` rejected by type contract fixture.
      * `[ ]`   Invalid payload: artifact element missing `id` rejected by type contract fixture.
      * `[ ]`   Mock function from `createApplyCompressionOverlayMock` returns `ApplyCompressionOverlayReturn`-typed value for both success and error option shapes.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.interface.ts`
      * `[ ]`   Import `ILogger`, `ResourceDocuments` from `../../_shared/types.ts`.
      * `[ ]`   Import `DownloadFromStorageFn` from `../../_shared/supabase_storage_utils.ts`.
      * `[ ]`   Import `SupabaseClient` from `npm:@supabase/supabase-js@2`.
      * `[ ]`   Import `Database` from `../../types_db.ts`.
      * `[ ]`   Define `ApplyCompressionOverlayDeps`:
         * `[ ]`   `logger: ILogger`
         * `[ ]`   `downloadFromStorage: DownloadFromStorageFn`
      * `[ ]`   Define `ApplyCompressionOverlayParams`:
         * `[ ]`   `dbClient: SupabaseClient<Database>`
         * `[ ]`   `projectId: string`
         * `[ ]`   `sessionId: string`
         * `[ ]`   `iterationNumber: number`
         * `[ ]`   `stageSlug: string`
      * `[ ]`   Define `ApplyCompressionOverlayPayload`:
         * `[ ]`   `artifacts: Required<ResourceDocuments[number]>[]`
      * `[ ]`   Define `ApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   `artifacts: Required<ResourceDocuments[number]>[]`
      * `[ ]`   Define `ApplyCompressionOverlayErrorReturn`:
         * `[ ]`   `error: Error`
         * `[ ]`   `retriable: boolean`
      * `[ ]`   Define `ApplyCompressionOverlayReturn = ApplyCompressionOverlaySuccessReturn | ApplyCompressionOverlayErrorReturn`.
      * `[ ]`   Define `ApplyCompressionOverlayFn = (deps: ApplyCompressionOverlayDeps, params: ApplyCompressionOverlayParams, payload: ApplyCompressionOverlayPayload) => Promise<ApplyCompressionOverlayReturn>`.
      * `[ ]`   Define `BoundApplyCompressionOverlayFn = (params: ApplyCompressionOverlayParams, payload: ApplyCompressionOverlayPayload) => Promise<ApplyCompressionOverlayReturn>`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.interaction.spec`
      * `[ ]`   Entry: receive `deps`, `params`, `payload`.
      * `[ ]`   Step 1 — DB query: call `params.dbClient.from('dialectic_project_resources').select('id,resource_type,resource_description,storage_bucket,storage_path,file_name').eq('resource_type', FileType.RagContextSummary).eq('session_id', params.sessionId).eq('iteration_number', params.iterationNumber).eq('stage_slug', params.stageSlug)`.
      * `[ ]`   Failure mode 1: DB query returns error → log error and return `{ error: new Error(dbError.message), retriable: true }`.
      * `[ ]`   Branch 1 — empty rows: return `{ artifacts: payload.artifacts }` unchanged (success).
      * `[ ]`   Branch 2 — rows present: build mutable working copy `const overlaid = [...payload.artifacts]`; iterate each compression row.
      * `[ ]`   For each row:
         * `[ ]`   Guard `row.resource_description` with `isRagContextSummaryResourceDescription`; failure: log warn with `row.id` and `continue`.
         * `[ ]`   Find index `idx` in `overlaid` where `overlaid[idx].id === desc.target_document_id`; if `idx === -1`, log warn with `target_document_id` and `continue`.
         * `[ ]`   Compute fingerprint: `await computeFingerprint(overlaid[idx].content)` using SHA-256 hex of UTF-8 encoded content.
         * `[ ]`   Compare computed hex to `desc.source_fingerprint`; mismatch: log warn with `target_document_id`, `expected`, `actual` and `continue`.
         * `[ ]`   Call `deps.downloadFromStorage(row.storage_bucket, row.storage_path, row.file_name)`.
         * `[ ]`   Failure mode 2: download error → log error and return `{ error: downloadError, retriable: true }`.
         * `[ ]`   Decode `ArrayBuffer` with `new TextDecoder().decode(arrayBuffer)`.
         * `[ ]`   Replace: `overlaid[idx] = { ...overlaid[idx], content: decodedText }`.
         * `[ ]`   Log info with `target_document_id` and `row.file_name`.
      * `[ ]`   Return `{ artifacts: overlaid }`.
      * `[ ]`   Ordering invariant: `id`, `document_key`, `stage_slug`, and `type` must not be mutated or dropped at any step; only `content` changes.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.guard.test.ts`
      * `[ ]`   `isApplyCompressionOverlayDeps`:
         * `[ ]`   accept valid deps with logger shape (`info`, `warn`, `error` functions) and function `downloadFromStorage`.
         * `[ ]`   reject missing `logger`.
         * `[ ]`   reject `logger` missing `warn` function.
         * `[ ]`   reject non-function `downloadFromStorage`.
         * `[ ]`   reject null and non-object inputs.
      * `[ ]`   `isApplyCompressionOverlayParams`:
         * `[ ]`   accept valid params with `dbClient` having `from` function, non-empty `projectId`, `sessionId`, `stageSlug`, and numeric `iterationNumber`.
         * `[ ]`   reject empty string `projectId`.
         * `[ ]`   reject empty string `sessionId`.
         * `[ ]`   reject empty string `stageSlug`.
         * `[ ]`   reject non-number `iterationNumber` (string `'1'` rejected, boolean `false` rejected).
         * `[ ]`   reject missing `dbClient`.
         * `[ ]`   reject `dbClient` without `from` function.
      * `[ ]`   `isApplyCompressionOverlayPayload`:
         * `[ ]`   accept payload with an `artifacts` array (any elements).
         * `[ ]`   accept payload with empty `artifacts` array.
         * `[ ]`   reject non-array `artifacts`.
         * `[ ]`   reject null and non-object inputs.
      * `[ ]`   `isApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   accept `{ artifacts: [] }`.
         * `[ ]`   accept `{ artifacts: [validArtifact] }`.
         * `[ ]`   reject object containing both `artifacts` and `error` fields.
         * `[ ]`   reject object missing `artifacts`.
      * `[ ]`   `isApplyCompressionOverlayErrorReturn`:
         * `[ ]`   accept `{ error: new Error('msg'), retriable: false }`.
         * `[ ]`   accept `{ error: new Error('msg'), retriable: true }`.
         * `[ ]`   reject object with `artifacts` field present.
         * `[ ]`   reject object where `error` is not an Error instance.
         * `[ ]`   reject object where `retriable` is not a boolean.
         * `[ ]`   reject null and non-object inputs.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.guard.ts`
      * `[ ]`   Import `isRecord` from `../../_shared/utils/type-guards/type_guards.common.ts`.
      * `[ ]`   Import types from `./applyCompressionOverlay.interface.ts`.
      * `[ ]`   `isApplyCompressionOverlayDeps(value: unknown): value is ApplyCompressionOverlayDeps`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `logger` member has `info`, `warn`, `error` function properties.
         * `[ ]`   `typeof value.downloadFromStorage === 'function'`.
      * `[ ]`   `isApplyCompressionOverlayParams(value: unknown): value is ApplyCompressionOverlayParams`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `projectId`, `sessionId`, `stageSlug` are non-empty strings.
         * `[ ]`   `typeof value.iterationNumber === 'number'`.
         * `[ ]`   `dbClient` has `from` function (consistent with `isGatherArtifactsParams` pattern).
      * `[ ]`   `isApplyCompressionOverlayPayload(value: unknown): value is ApplyCompressionOverlayPayload`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `'artifacts' in value && Array.isArray(value.artifacts)`.
      * `[ ]`   `isApplyCompressionOverlaySuccessReturn(value: unknown): value is ApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `'artifacts' in value && Array.isArray(value.artifacts)`.
         * `[ ]`   `!('error' in value) && !('retriable' in value)`.
      * `[ ]`   `isApplyCompressionOverlayErrorReturn(value: unknown): value is ApplyCompressionOverlayErrorReturn`:
         * `[ ]`   `isRecord(value)`.
         * `[ ]`   `'error' in value && value.error instanceof Error`.
         * `[ ]`   `'retriable' in value && typeof value.retriable === 'boolean'`.
         * `[ ]`   `!('artifacts' in value)`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.mock.ts`
      * `[ ]`   Import `MockLogger` from `../../_shared/logger.mock.ts`.
      * `[ ]`   Import `createMockDownloadFromStorage` from `../../_shared/supabase_storage_utils.mock.ts`.
      * `[ ]`   Import `FileType`, `RagContextSummaryResourceDescription` from `../../_shared/types/file_manager.types.ts`.
      * `[ ]`   Import `DialecticProjectResourceRow` from `../../dialectic-service/dialectic.interface.ts`.
      * `[ ]`   Import all interface types and `ResourceDocuments` from interface file and `../../_shared/types.ts`.
      * `[ ]`   Export `ApplyCompressionOverlayMockCall = { deps: ApplyCompressionOverlayDeps; params: ApplyCompressionOverlayParams; payload: ApplyCompressionOverlayPayload }`.
      * `[ ]`   Export `CreateApplyCompressionOverlayMockOptions = { handler?: ApplyCompressionOverlayFn; result?: ApplyCompressionOverlayReturn; successArtifacts?: Required<ResourceDocuments[number]>[]; error?: Error; retriable?: boolean }`.
      * `[ ]`   Export `buildApplyCompressionOverlayDeps(overrides?: Partial<ApplyCompressionOverlayDeps>): ApplyCompressionOverlayDeps`:
         * `[ ]`   Default `logger`: `new MockLogger()`.
         * `[ ]`   Default `downloadFromStorage`: `createMockDownloadFromStorage({ mode: 'success', data: new TextEncoder().encode('compressed-content').buffer })`.
      * `[ ]`   Export `buildApplyCompressionOverlayParams(dbClient: SupabaseClient<Database>, overrides?: Partial<ApplyCompressionOverlayParams>): ApplyCompressionOverlayParams`:
         * `[ ]`   Defaults: `projectId: 'project-abc'`, `sessionId: 'session-456'`, `iterationNumber: 1`, `stageSlug: 'thesis'`.
      * `[ ]`   Export `buildApplyCompressionOverlayPayload(artifacts?: Required<ResourceDocuments[number]>[]): ApplyCompressionOverlayPayload`:
         * `[ ]`   Default `artifacts`: one element `{ id: 'artifact-1', content: 'original-content', document_key: FileType.business_case, stage_slug: 'thesis', type: 'rendered_document' }`.
      * `[ ]`   Export `buildApplyCompressionOverlaySuccessReturn(artifacts?: Required<ResourceDocuments[number]>[]): ApplyCompressionOverlaySuccessReturn`:
         * `[ ]`   Default: `{ artifacts: [{ id: 'artifact-1', content: 'compressed-content', document_key: FileType.business_case, stage_slug: 'thesis', type: 'rendered_document' }] }`.
      * `[ ]`   Export `buildApplyCompressionOverlayErrorReturn(error?: Error, retriable?: boolean): ApplyCompressionOverlayErrorReturn`:
         * `[ ]`   Defaults: `error: new Error('applyCompressionOverlay failed')`, `retriable: false`.
      * `[ ]`   Export `buildRagContextSummaryResourceDescription(overrides?: Partial<RagContextSummaryResourceDescription>): RagContextSummaryResourceDescription`:
         * `[ ]`   Defaults: `target_document_id: 'artifact-1'`, `source_document_id: 'source-doc-1'`, `source_fingerprint: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'` (fixed 64-char hex placeholder — tests requiring a real fingerprint match must compute SHA-256 of their chosen `content` and supply it as an override), `compression_attempt_id: 'attempt-1'`, `producer_model_slug: 'gpt-4'`.
      * `[ ]`   Export `buildCompressionResourceRow(overrides?: Partial<DialecticProjectResourceRow>): DialecticProjectResourceRow`:
         * `[ ]`   Defaults: `id: 'comp-resource-1'`, `project_id: 'project-abc'`, `session_id: 'session-456'`, `iteration_number: 1`, `stage_slug: 'thesis'`, `resource_type: FileType.RagContextSummary`, `resource_description: buildRagContextSummaryResourceDescription() as unknown as Json`, `storage_bucket: 'dialectic-contributions'`, `storage_path: 'project-abc/session_session-456/iteration_1/1_thesis/_work'`, `file_name: 'gpt-4_compressing_business_case_for_artifact-1_rag_summary.txt'`, `mime_type: 'text/plain'`, `size_bytes: 500`, `user_id: 'user-1'`, `source_contribution_id: null`, `created_at: new Date().toISOString()`, `updated_at: new Date().toISOString()`.
      * `[ ]`   Export `createApplyCompressionOverlayMock(options?: CreateApplyCompressionOverlayMockOptions): { applyCompressionOverlay: ApplyCompressionOverlayFn; calls: ApplyCompressionOverlayMockCall[] }`:
         * `[ ]`   Records each call in `calls` array.
         * `[ ]`   If `options.handler` provided, delegates to it.
         * `[ ]`   If `options.result` provided, returns it.
         * `[ ]`   If `options.error` provided, returns `buildApplyCompressionOverlayErrorReturn(options.error, options.retriable)`.
         * `[ ]`   Default: returns `buildApplyCompressionOverlaySuccessReturn(options?.successArtifacts)`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.test.ts`
      * `[ ]`   All tests: use `buildApplyCompressionOverlayDeps`, `buildApplyCompressionOverlayParams`, `buildApplyCompressionOverlayPayload`, `buildCompressionResourceRow`, `buildRagContextSummaryResourceDescription` from mock file; mock Supabase client from `createMockSupabaseClient` in `../../_shared/supabase.mock.ts`.
      * `[ ]`   Test: DB returns empty rows → `isApplyCompressionOverlaySuccessReturn(result)` true; `result.artifacts` content identical to input payload artifacts.
      * `[ ]`   Test: DB query error → `isApplyCompressionOverlayErrorReturn(result)` true; `result.retriable` is `true`.
      * `[ ]`   Test: one compression row with `target_document_id: 'artifact-1'`, `source_fingerprint` set to actual SHA-256 hex of `'original-content'`, `downloadFromStorage` returning `new TextEncoder().encode('compressed-text').buffer` → success return; `result.artifacts[0].content === 'compressed-text'`; `result.artifacts[0].id === 'artifact-1'`; `result.artifacts[0].document_key`, `stage_slug`, `type` unchanged.
      * `[ ]`   Test: one compression row with `source_fingerprint` that does not match SHA-256 of artifact `content` → success return; `result.artifacts[0].content === 'original-content'` (unchanged); `MockLogger.warn` called once.
      * `[ ]`   Test: one compression row with `target_document_id` not present in payload artifacts → success return; artifact list unchanged; `MockLogger.warn` called once.
      * `[ ]`   Test: one compression row with `resource_description: null` → success return; artifact list unchanged; `MockLogger.warn` called once.
      * `[ ]`   Test: one fresh-matching compression row, `downloadFromStorage` returns error → `isApplyCompressionOverlayErrorReturn(result)` true; `result.retriable` is `true`.
      * `[ ]`   Test: two compression rows — first with matching fresh fingerprint, second with stale fingerprint → `result.artifacts[0].content` replaced with download text; `result.artifacts[1]` (or artifact matching second row's target) unchanged; one warn log for stale row; success return.
      * `[ ]`   Test: empty payload `artifacts` array with one compression row → no match; `result.artifacts` is empty array; `MockLogger.warn` called once; success return.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.ts`
      * `[ ]`   Import `FileType`, `RagContextSummaryResourceDescription` from `../../_shared/types/file_manager.types.ts`.
      * `[ ]`   Import `isRagContextSummaryResourceDescription` from `../../_shared/utils/type-guards/type_guards.file_manager.ts`.
      * `[ ]`   Import `ApplyCompressionOverlayFn`, `ApplyCompressionOverlayErrorReturn`, `ApplyCompressionOverlaySuccessReturn` from `./applyCompressionOverlay.interface.ts`.
      * `[ ]`   Define private `async function computeFingerprint(content: string): Promise<string>`:
         * `[ ]`   `const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))`.
         * `[ ]`   `return Array.from(new Uint8Array(hashBytes)).map(b => b.toString(16).padStart(2, '0')).join('')`.
      * `[ ]`   Export `const applyCompressionOverlay: ApplyCompressionOverlayFn = async (deps, params, payload) => { ... }`:
         * `[ ]`   Destructure `logger`, `downloadFromStorage` from `deps`.
         * `[ ]`   Destructure `dbClient`, `sessionId`, `iterationNumber`, `stageSlug` from `params`.
         * `[ ]`   `const { data: compressionRows, error: dbError } = await dbClient.from('dialectic_project_resources').select('id,resource_type,resource_description,storage_bucket,storage_path,file_name').eq('resource_type', FileType.RagContextSummary).eq('session_id', sessionId).eq('iteration_number', iterationNumber).eq('stage_slug', stageSlug)`.
         * `[ ]`   On `dbError`: `logger.error('applyCompressionOverlay: DB query failed', { error: dbError.message })`; return `{ error: new Error(dbError.message), retriable: true }`.
         * `[ ]`   On `!compressionRows || compressionRows.length === 0`: return `{ artifacts: payload.artifacts }`.
         * `[ ]`   `const overlaid = [...payload.artifacts]`.
         * `[ ]`   For each `row` in `compressionRows`:
            * `[ ]`   `if (!isRagContextSummaryResourceDescription(row.resource_description)) { logger.warn('applyCompressionOverlay: invalid resource_description, skipping', { rowId: row.id }); continue; }`.
            * `[ ]`   `const desc: RagContextSummaryResourceDescription = row.resource_description`.
            * `[ ]`   `const idx = overlaid.findIndex(a => a.id === desc.target_document_id)`.
            * `[ ]`   `if (idx === -1) { logger.warn('applyCompressionOverlay: no artifact match, skipping', { target_document_id: desc.target_document_id }); continue; }`.
            * `[ ]`   `const computedFingerprint = await computeFingerprint(overlaid[idx].content)`.
            * `[ ]`   `if (computedFingerprint !== desc.source_fingerprint) { logger.warn('applyCompressionOverlay: stale artifact, skipping overlay', { target_document_id: desc.target_document_id, expected: desc.source_fingerprint, actual: computedFingerprint }); continue; }`.
            * `[ ]`   `const downloadResult = await downloadFromStorage(row.storage_bucket, row.storage_path, row.file_name)`.
            * `[ ]`   On download error: `logger.error('applyCompressionOverlay: download failed', { file_name: row.file_name })`; return `{ error: downloadResult.error, retriable: true }`.
            * `[ ]`   `const decodedText = new TextDecoder().decode(downloadResult.data)`.
            * `[ ]`   `overlaid[idx] = { ...overlaid[idx], content: decodedText }`.
            * `[ ]`   `logger.info('applyCompressionOverlay: overlay applied', { target_document_id: desc.target_document_id, file_name: row.file_name })`.
         * `[ ]`   Return `{ artifacts: overlaid }`.

   * `[ ]`   `supabase/functions/dialectic-worker/applyCompressionOverlay/applyCompressionOverlay.provides.ts`
      * `[ ]`   `export { applyCompressionOverlay } from './applyCompressionOverlay.ts'`.
      * `[ ]`   `export type { ApplyCompressionOverlayDeps, ApplyCompressionOverlayParams, ApplyCompressionOverlayPayload, ApplyCompressionOverlayFn, ApplyCompressionOverlaySuccessReturn, ApplyCompressionOverlayErrorReturn, ApplyCompressionOverlayReturn, BoundApplyCompressionOverlayFn } from './applyCompressionOverlay.interface.ts'`.
      * `[ ]`   `export { isApplyCompressionOverlayDeps, isApplyCompressionOverlayParams, isApplyCompressionOverlayPayload, isApplyCompressionOverlaySuccessReturn, isApplyCompressionOverlayErrorReturn } from './applyCompressionOverlay.guard.ts'`.
      * `[ ]`   `export type { ApplyCompressionOverlayMockCall, CreateApplyCompressionOverlayMockOptions } from './applyCompressionOverlay.mock.ts'`.
      * `[ ]`   `export { buildApplyCompressionOverlayDeps, buildApplyCompressionOverlayParams, buildApplyCompressionOverlayPayload, buildApplyCompressionOverlaySuccessReturn, buildApplyCompressionOverlayErrorReturn, buildRagContextSummaryResourceDescription, buildCompressionResourceRow, createApplyCompressionOverlayMock } from './applyCompressionOverlay.mock.ts'`.

   * `[ ]`   `construction`
      * `[ ]`   `applyCompressionOverlay` is a stateless exported constant function (no class, no closure state) bound over `ApplyCompressionOverlayDeps`.
      * `[ ]`   No partial construction path is introduced.
      * `[ ]`   At the DI boundary, caller constructs and injects `logger` and `downloadFromStorage` into `deps`; `dbClient` is passed per-call in `params`, consistent with the `gatherArtifacts` DI pattern.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker domain — intermediate orchestration function between Workstream C storage-layer producers and the `gatherArtifacts` consumer.
      * `[ ]`   Dependencies remain inward-facing: shared types, guards, storage utility, and DB row types from lower layers.
      * `[ ]`   Outbound interface is `ApplyCompressionOverlayFn` and `BoundApplyCompressionOverlayFn` exported via `provides.ts`.
      * `[ ]`   No cycles introduced with `gatherArtifacts.ts`, `processComplexJob.ts`, `compressPrompt.ts`, or any Workstream C module.

   * `[ ]`   `requirements`
      * `[ ]`   `applyCompressionOverlay` correctly overlays compression content for all fresh-matching artifacts and leaves stale, unmatched, or invalid-description rows untouched.
      * `[ ]`   Canonical artifact identity (`id`, `document_key`, `stage_slug`, `type`) is immutable through the entire overlay lifecycle; only `content` is replaced.
      * `[ ]`   DB query errors and download errors return retriable errors; description guard failures and fingerprint mismatches produce only warn logs and skip behavior.
      * `[ ]`   All unit tests covering happy path, stale skip, no-match skip, invalid-description skip, DB error, download error, and multi-row scenarios pass.
      * `[ ]`   Integration test for the `applyCompressionOverlay → gatherArtifacts` chain belongs to `gatherArtifacts.ts`, which is the consumer that closes the chain.
      * `[ ]`   Node scope remains limited to `applyCompressionOverlay.ts` and its immediate support files; no other source file is modified in this node.

* `[ ]`   supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts **[BE] Wire applyCompressionOverlay into post-gather pipeline by adding dep and stageSlug param; call overlay after dedup step and propagate its return**

   * `[ ]`   `objective`
      * `[ ]`   Solve the missing call site for `applyCompressionOverlay`: the function exists as of the prior node but is never invoked — `gatherArtifacts` currently returns `{ artifacts: Array.from(uniqueById.values()) }` directly, meaning persisted `RagContextSummary` compression artifacts are gathered from the DB (by `applyCompressionOverlay` in a future call) but the in-memory content swap is never applied before the artifact list reaches the model job.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `applyCompressionOverlay: ApplyCompressionOverlayFn` to `GatherArtifactsDeps`.
         * `[ ]`   Add `stageSlug: string` to `GatherArtifactsParams`.
         * `[ ]`   Destructure `stageSlug` from `params` in the `gatherArtifacts` implementation alongside the existing `dbClient`, `projectId`, `sessionId`, `iterationNumber` destructuring.
         * `[ ]`   After the `uniqueById` dedup step, assign `const dedupedArtifacts = Array.from(uniqueById.values())` and call `await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts })`.
         * `[ ]`   If the overlay result satisfies `isApplyCompressionOverlayErrorReturn`, return the overlay result directly (error + retriable propagated as-is).
         * `[ ]`   Otherwise return `{ artifacts: overlayResult.artifacts }` as the success return.
         * `[ ]`   Update `isGatherArtifactsDeps` to require `typeof value.applyCompressionOverlay === 'function'`.
         * `[ ]`   Update `isGatherArtifactsParams` to require `stageSlug` is a non-empty string.
         * `[ ]`   Update `buildGatherArtifactsDeps` default to include `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay`.
         * `[ ]`   Update `buildGatherArtifactsParams` default to include `stageSlug: 'thesis'`.
         * `[ ]`   Update all existing integration tests in `gatherArtifacts.integration.test.ts` to supply the new `applyCompressionOverlay` dep (via updated `buildGatherArtifactsDeps`) and `stageSlug` param (via updated `buildGatherArtifactsParams`); no existing assertions change.
         * `[ ]`   Add a new integration test proving `applyCompressionOverlay → gatherArtifacts` chain operates end-to-end with real implementations of both functions.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   All existing gather loop logic, rule-type branches, dedup step, error paths, and success returns are unchanged.
         * `[ ]`   `stageSlug` is required; an empty string is rejected by the guard.
         * `[ ]`   The overlay call uses the deps already held by `gatherArtifacts` (`deps.logger`, `deps.downloadFromStorage`) — no new deps are introduced beyond `applyCompressionOverlay` itself.
         * `[ ]`   No changes to `applyCompressionOverlay.ts` or any Workstream C source file are made in this node.
         * `[ ]`   Call sites (`processSimpleJob.ts`, `index.ts`) are separate nodes and are not modified here.
      * `[ ]`   Each goal is atomic and testable through updated interface, guard, unit, and integration coverage within this module.

   * `[ ]`   `role`
      * `[ ]`   Node role is modification of the existing `gatherArtifacts` pipeline to consume `applyCompressionOverlay` as the final step before returning the artifact list.
      * `[ ]`   This role is correct because `gatherArtifacts.ts` owns the artifact assembly pipeline and is the natural call site for the overlay: it holds `dbClient`, `sessionId`, `iterationNumber`, `stageSlug`, and `downloadFromStorage` — all required by `applyCompressionOverlay` — without any additional fetching.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not update `processSimpleJob.ts` or `index.ts` call sites in this node; those are separate nodes.
         * `[ ]`   Do not modify `applyCompressionOverlay.ts` or any of its support files.
         * `[ ]`   Do not change the gather rule loop, dedup logic, or existing error return paths.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/gatherArtifacts/` and the immediately imported new dep `applyCompressionOverlay.provides.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   `gatherArtifacts.interface.ts` — new fields on `GatherArtifactsDeps` and `GatherArtifactsParams`.
         * `[ ]`   `gatherArtifacts.guard.ts` — updated guards for new fields.
         * `[ ]`   `gatherArtifacts.mock.ts` — updated builders with new field defaults.
         * `[ ]`   `gatherArtifacts.interface.test.ts`, `gatherArtifacts.guard.test.ts`, `gatherArtifacts.test.ts` — updated and new tests.
         * `[ ]`   `gatherArtifacts.ts` — destructure `stageSlug`; call `applyCompressionOverlay` after dedup.
         * `[ ]`   `gatherArtifacts.integration.test.ts` — updated existing tests + new chain integration test.
      * `[ ]`   Outside boundary:
         * `[ ]`   `applyCompressionOverlay.ts` and its support files — consumed as an opaque dep.
         * `[ ]`   `processSimpleJob.ts` and `index.ts` call site updates — separate nodes.
         * `[ ]`   `gatherArtifacts.provides.ts` — no changes required; all added exports already flow through existing re-export lines.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `../applyCompressionOverlay/applyCompressionOverlay.provides.ts` — `ApplyCompressionOverlayFn`, `isApplyCompressionOverlayErrorReturn`, `createApplyCompressionOverlayMock`.
         * `[ ]`   Layer classification: dialectic-worker peer utility producer (introduced in prior Workstream D node).
         * `[ ]`   Direction: consumed by `gatherArtifacts.interface.ts` (type), `gatherArtifacts.ts` (invocation + error check), `gatherArtifacts.mock.ts` (default dep builder).
         * `[ ]`   Purpose: type the new `GatherArtifactsDeps.applyCompressionOverlay` field; guard-check its return before propagating; supply a default mock in `buildGatherArtifactsDeps`.
      * `[ ]`   Confirm:
         * `[ ]`   All existing deps (`ILogger`, `ResourceDocuments`, `DownloadFromStorageFn`, `PickLatestFn`, `InputRule`, `SupabaseClient<Database>`) remain unchanged.
         * `[ ]`   No reverse dependency from this function into `processSimpleJob.ts` or `index.ts`.
         * `[ ]`   No lateral layer violations with Workstream B or C modules.

   * `[ ]`   `context_slice`
      * `[ ]`   The overlay call is inserted between the existing dedup step and the final success return:
         * `[ ]`   `const dedupedArtifacts = Array.from(uniqueById.values())` (replaces the inline `Array.from` on the return line).
         * `[ ]`   `const overlayResult = await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts })`.
         * `[ ]`   `if (isApplyCompressionOverlayErrorReturn(overlayResult)) { return overlayResult; }`.
         * `[ ]`   `return { artifacts: overlayResult.artifacts }`.
      * `[ ]`   `stageSlug` is destructured from `params` alongside the existing four fields.
      * `[ ]`   The early-exit path `if (rules.length === 0) { return { artifacts: [] }; }` remains before the overlay call — the overlay is never invoked for empty rule sets.
      * `[ ]`   Confirm:
         * `[ ]`   No new DB queries are introduced in `gatherArtifacts.ts`; the compression row query is entirely inside `applyCompressionOverlay`.
         * `[ ]`   No new imports from `_shared` or Supabase are required; `isApplyCompressionOverlayErrorReturn` is imported from `applyCompressionOverlay.provides.ts`.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.interface.test.ts`
      * `[ ]`   Existing tests pass without change once `buildGatherArtifactsDeps` and `buildGatherArtifactsParams` are updated.
      * `[ ]`   Add: valid `GatherArtifactsDeps` with `applyCompressionOverlay` function satisfies type.
      * `[ ]`   Add: `GatherArtifactsDeps` missing `applyCompressionOverlay` rejected by type contract fixture.
      * `[ ]`   Add: valid `GatherArtifactsParams` with non-empty `stageSlug` satisfies type.
      * `[ ]`   Add: `GatherArtifactsParams` missing `stageSlug` rejected by type contract fixture.
      * `[ ]`   Add: `GatherArtifactsParams` with empty string `stageSlug` rejected by type contract fixture.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.interface.ts`
      * `[ ]`   Add import: `ApplyCompressionOverlayFn` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   Add to `GatherArtifactsDeps`: `applyCompressionOverlay: ApplyCompressionOverlayFn`.
      * `[ ]`   Add to `GatherArtifactsParams`: `stageSlug: string`.
      * `[ ]`   All other types (`GatherArtifactsPayload`, `GatherArtifactsSuccessReturn`, `GatherArtifactsErrorReturn`, `GatherArtifactsReturn`, `GatherArtifactsFn`, `BoundGatherArtifactsFn`) are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.interaction.spec`
      * `[ ]`   Entry: receive `deps`, `params`, `payload`.
      * `[ ]`   If `payload.inputsRequired` is empty or falsy: return `{ artifacts: [] }` immediately — overlay is never called.
      * `[ ]`   Rule-based gather loop over `payload.inputsRequired` (unchanged): for each rule, query the appropriate table, filter rows, pick latest, download content, push to `gathered`.
      * `[ ]`   Dedup: `const uniqueById = new Map(); for (const a of gathered) { if (!uniqueById.has(a.id)) uniqueById.set(a.id, a); }`.
      * `[ ]`   `const dedupedArtifacts = Array.from(uniqueById.values())`.
      * `[ ]`   Call overlay: `const overlayResult = await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts })`.
      * `[ ]`   Failure mode — overlay error: `if (isApplyCompressionOverlayErrorReturn(overlayResult)) return overlayResult` — propagates `{ error, retriable }` as-is.
      * `[ ]`   Success: return `{ artifacts: overlayResult.artifacts }`.
      * `[ ]`   Ordering invariant: artifact identity fields (`id`, `document_key`, `stage_slug`, `type`) from the gather loop are preserved through the overlay; only `content` may be mutated by `applyCompressionOverlay`.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.guard.test.ts`
      * `[ ]`   `isGatherArtifactsDeps` — add:
         * `[ ]`   accept valid deps that now include a function `applyCompressionOverlay`.
         * `[ ]`   reject deps missing `applyCompressionOverlay`.
         * `[ ]`   reject deps where `applyCompressionOverlay` is not a function (e.g. `null`, `'string'`).
      * `[ ]`   `isGatherArtifactsParams` — add:
         * `[ ]`   accept valid params with non-empty `stageSlug`.
         * `[ ]`   reject params missing `stageSlug`.
         * `[ ]`   reject params with empty string `stageSlug`.
      * `[ ]`   All existing guard tests for `isGatherArtifactsPayload`, `isGatherArtifactsSuccessReturn`, `isGatherArtifactsErrorReturn` remain unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.guard.ts`
      * `[ ]`   In `isGatherArtifactsDeps`: add check `!('applyCompressionOverlay' in value) || typeof value.applyCompressionOverlay !== 'function'` → return false.
      * `[ ]`   In `isGatherArtifactsParams`: add check `!('stageSlug' in value) || typeof value.stageSlug !== 'string' || value.stageSlug === ''` → return false.
      * `[ ]`   All other guard functions (`isGatherArtifactsPayload`, `isGatherArtifactsSuccessReturn`, `isGatherArtifactsErrorReturn`) are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.mock.ts`
      * `[ ]`   Add import: `createApplyCompressionOverlayMock` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   In `buildGatherArtifactsDeps`: add `applyCompressionOverlay: createApplyCompressionOverlayMock().applyCompressionOverlay` to the base object.
      * `[ ]`   In `buildGatherArtifactsParams`: add `stageSlug: 'thesis'` to the base object.
      * `[ ]`   All other exported builders and factories (`buildDocumentRule`, `buildFeedbackRule`, `buildSeedPromptRule`, `buildProjectResourceRule`, `buildHeaderContextRule`, `buildDialecticProjectResourceRow`, `buildDialecticFeedbackRow`, `buildDialecticContributionRow`, `buildGatherArtifact`, `buildGatherArtifactsSuccessReturn`, `buildGatherArtifactsErrorReturn`, `buildSelectResult`, `buildSelectHandler`, `createGatherArtifactsMock`) are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.test.ts`
      * `[ ]`   Existing tests: no changes required — `buildGatherArtifactsDeps` and `buildGatherArtifactsParams` now include the new fields by default, so all existing tests acquire the new fields transparently.
      * `[ ]`   Add test: empty `inputsRequired` → `applyCompressionOverlay` is NOT called; result is success with empty artifacts. Use `createApplyCompressionOverlayMock()` and assert `calls.length === 0`.
      * `[ ]`   Add test: gather loop succeeds with one artifact → `applyCompressionOverlay` is called once; assert `calls[0].payload.artifacts.length === 1` and `calls[0].payload.artifacts[0].id` matches the gathered artifact's id.
      * `[ ]`   Add test: `applyCompressionOverlay` returns `{ error: new Error('overlay'), retriable: true }` → `gatherArtifacts` returns that error return directly; `isGatherArtifactsErrorReturn(result)` is true; `result.retriable` is true.
      * `[ ]`   Add test: `applyCompressionOverlay` returns success with modified artifacts → `gatherArtifacts` returns `{ artifacts: modifiedArtifacts }`.
      * `[ ]`   All new tests use `buildGatherArtifactsDeps` with `applyCompressionOverlay` overridden to a controlled mock where needed; mock DB client from `createMockSupabaseClient`.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.ts`
      * `[ ]`   Add import: `isApplyCompressionOverlayErrorReturn` from `../applyCompressionOverlay/applyCompressionOverlay.provides.ts`.
      * `[ ]`   In the `gatherArtifacts` function body, extend the `params` destructuring to include `stageSlug`: `const { dbClient, projectId, sessionId, iterationNumber, stageSlug } = params`.
      * `[ ]`   Replace the current final success block:
         * `[ ]`   Before (current): `const success: GatherArtifactsSuccessReturn = { artifacts: Array.from(uniqueById.values()) }; return success;`
         * `[ ]`   After: `const dedupedArtifacts = Array.from(uniqueById.values()); const overlayResult = await deps.applyCompressionOverlay({ logger: deps.logger, downloadFromStorage: deps.downloadFromStorage }, { dbClient, projectId, sessionId, iterationNumber, stageSlug }, { artifacts: dedupedArtifacts }); if (isApplyCompressionOverlayErrorReturn(overlayResult)) { return overlayResult; } return { artifacts: overlayResult.artifacts };`
      * `[ ]`   All other lines in `gatherArtifacts.ts` are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/gatherArtifacts/gatherArtifacts.integration.test.ts`
      * `[ ]`   Update all existing `Deno.test` blocks: `buildGatherArtifactsDeps` already supplies `applyCompressionOverlay` by default; `buildGatherArtifactsParams` already supplies `stageSlug: 'thesis'` by default — verify all existing calls use the builder functions and require no manual change; if any test constructs `deps` or `params` literals, update them to include the new fields.
      * `[ ]`   Add integration test `"integration: applyCompressionOverlay → gatherArtifacts: no compression rows → artifacts pass through unchanged"`:
         * `[ ]`   Construct `deps` using `buildGatherArtifactsDeps` but override `applyCompressionOverlay` with the real imported `applyCompressionOverlay` function from `../applyCompressionOverlay/applyCompressionOverlay.ts`.
         * `[ ]`   Configure mock DB to return `[buildDialecticProjectResourceRow({ id: 'int-passthrough-1' })]` for `dialectic_project_resources` queries.
         * `[ ]`   Configure `downloadFromStorage` to return `toArrayBuffer('document-content')`.
         * `[ ]`   Call real `gatherArtifacts` with `buildGatherArtifactsParams(dbClient)` and `buildGatherArtifactsPayload([buildDocumentRule()])`.
         * `[ ]`   Assert `isGatherArtifactsSuccessReturn(result)` is true.
         * `[ ]`   Assert `result.artifacts[0].id === 'int-passthrough-1'` and `result.artifacts[0].content === 'document-content'` — content unchanged because the DB returns `resource_description: null` on the compression query, causing `isRagContextSummaryResourceDescription` to reject all rows and `applyCompressionOverlay` to return the artifacts unmodified.
      * `[ ]`   Add integration test `"integration: applyCompressionOverlay → gatherArtifacts: overlay error propagates as retriable"`:
         * `[ ]`   Construct `deps` using `buildGatherArtifactsDeps` but override `applyCompressionOverlay` with a stub that returns `{ error: new Error('overlay DB error'), retriable: true }`.
         * `[ ]`   Configure mock DB to return document rows for the gather loop query.
         * `[ ]`   Call real `gatherArtifacts`.
         * `[ ]`   Assert `isGatherArtifactsErrorReturn(result)` is true; `result.retriable` is true; `result.error.message === 'overlay DB error'`.

   * `[ ]`   `construction`
      * `[ ]`   `gatherArtifacts` remains a stateless exported constant function with no new closure state introduced.
      * `[ ]`   `applyCompressionOverlay` is injected at the DI construction boundary (by `index.ts` in the `boundGatherArtifacts` closure — a separate node); within `gatherArtifacts.ts` it is treated as an opaque async function.
      * `[ ]`   No partial construction path is introduced.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is dialectic-worker domain — `gatherArtifacts` remains an intermediate orchestration function; adding the overlay call does not change its layer position.
      * `[ ]`   `applyCompressionOverlay` is a peer dialectic-worker utility; importing it from its provides module does not introduce a cross-layer violation.
      * `[ ]`   No new cycles: `applyCompressionOverlay` does not import from `gatherArtifacts`, so the dependency is strictly one-directional.
      * `[ ]`   Outbound interface (`GatherArtifactsFn`, `BoundGatherArtifactsFn`) is unchanged in shape — callers only observe an additional `applyCompressionOverlay` field in deps and `stageSlug` field in params.

   * `[ ]`   `requirements`
      * `[ ]`   `GatherArtifactsDeps.applyCompressionOverlay: ApplyCompressionOverlayFn` and `GatherArtifactsParams.stageSlug: string` are present and required by the updated interface.
      * `[ ]`   `isGatherArtifactsDeps` rejects objects missing `applyCompressionOverlay` or where it is not a function.
      * `[ ]`   `isGatherArtifactsParams` rejects objects missing `stageSlug` or where it is an empty string.
      * `[ ]`   `buildGatherArtifactsDeps()` and `buildGatherArtifactsParams(dbClient)` supply the new fields by default, keeping all existing tests GREEN without modification.
      * `[ ]`   `applyCompressionOverlay` is called exactly once per `gatherArtifacts` invocation when `inputsRequired` is non-empty; it is never called when `inputsRequired` is empty.
      * `[ ]`   An error return from `applyCompressionOverlay` is propagated directly as `GatherArtifactsErrorReturn` with the overlay's `retriable` flag preserved.
      * `[ ]`   Integration test for `applyCompressionOverlay → gatherArtifacts` is located in this node. Integration test for `gatherArtifacts → processSimpleJob` chain belongs in `processSimpleJob.ts`.
      * `[ ]`   Node scope is limited to `gatherArtifacts/` module files; `processSimpleJob.ts` and `index.ts` call site updates are separate nodes.

* `[ ]`   supabase/functions/dialectic-worker/processSimpleJob.ts **[BE] Supply stageSlug in gatherArtifacts call params and update integration test gatherArtifacts closures to satisfy updated GatherArtifactsDeps**

   * `[ ]`   `objective`
      * `[ ]`   Solve the compile-time type error introduced when `GatherArtifactsParams` gained `stageSlug: string` in the prior node: the `ctx.gatherArtifacts(...)` call in `processSimpleJob.ts` at line ~304 passes `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count }` without `stageSlug`, which will now fail type-checking. Simultaneously, the two `boundGather` closures in `processSimpleJob.integration.test.ts` that manually construct `GatherArtifactsDeps` omit `applyCompressionOverlay`, which also became required in the prior node.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `stageSlug` to the params object in the `ctx.gatherArtifacts(...)` call so it reads `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count, stageSlug }`.
         * `[ ]`   In `processSimpleJob.integration.test.ts`, update both `boundGather` closures that construct `GatherArtifactsDeps` literals to add `applyCompressionOverlay` set to the real imported `applyCompressionOverlay` function.
         * `[ ]`   Add a unit test in `processSimpleJob.test.ts` that asserts `stageSlug` is present and equal to the job payload's `stageSlug` value in the params object received by the `gatherArtifacts` stub.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `stageSlug` is already destructured from `job.payload` at the top of the `processSimpleJob` try block (line 43); no new variable declaration is required.
         * `[ ]`   All existing assertions in `processSimpleJob.test.ts` and `processSimpleJob.integration.test.ts` remain unchanged.
         * `[ ]`   No changes to `processSimpleJob.ts` beyond the single-field addition to the params object literal.
         * `[ ]`   No changes to `gatherArtifacts/` module files, `index.ts`, or any other source file.
      * `[ ]`   Each goal is atomic and testable through the updated unit tests and integration tests in this node.

   * `[ ]`   `role`
      * `[ ]`   Node role is call-site update — satisfies the updated `GatherArtifactsParams` contract introduced in `gatherArtifacts.ts`.
      * `[ ]`   This role is correct because `processSimpleJob.ts` owns the only call to `ctx.gatherArtifacts` in the simple-job execution path and is the direct consumer of the `BoundGatherArtifactsFn` interface.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify the `gatherArtifacts` interface, guard, mock, or implementation in this node.
         * `[ ]`   Do not update `index.ts` DI wiring in this node; that is the next node.
         * `[ ]`   Do not modify any logic in `processSimpleJob.ts` beyond the single params addition.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/dialectic-worker/processSimpleJob.ts`, `processSimpleJob.test.ts`, and `processSimpleJob.integration.test.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   The `ctx.gatherArtifacts(...)` params literal in `processSimpleJob.ts`.
         * `[ ]`   The `gatherArtifacts` stub call assertions in `processSimpleJob.test.ts`.
         * `[ ]`   The two `boundGather` deps objects in `processSimpleJob.integration.test.ts`.
      * `[ ]`   Outside boundary:
         * `[ ]`   `gatherArtifacts/` module — the interface change was made in the prior node; this node only satisfies it.
         * `[ ]`   `index.ts` DI wiring — separate node.
         * `[ ]`   `applyCompressionOverlay/` module — the real function is imported and injected into the `boundGather` closure; its internal deps are supplied by `gatherArtifacts` at call time.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `./gatherArtifacts/gatherArtifacts.provides.ts` — already imported in `processSimpleJob.ts`; no new symbols added.
      * `[ ]`   Provider: `./applyCompressionOverlay/applyCompressionOverlay.ts` — `applyCompressionOverlay` (real implementation).
         * `[ ]`   Layer classification: dialectic-worker peer utility producer.
         * `[ ]`   Direction: consumed by `processSimpleJob.integration.test.ts` only, injected directly into the `boundGather` deps literal.
         * `[ ]`   Purpose: supply the real `applyCompressionOverlay` function so the integration test exercises the assembled chain — `applyCompressionOverlay → gatherArtifacts → processSimpleJob` — with real implementations. The mock DB returns document rows with `resource_description: null` for the compression-row query, causing `isRagContextSummaryResourceDescription` to reject all rows and the overlay to pass artifacts through unchanged; the real function produces the correct no-op result from real logic, not a canned mock return.
      * `[ ]`   Confirm:
         * `[ ]`   No new imports in `processSimpleJob.ts`; `stageSlug` is already in scope.
         * `[ ]`   No reverse dependency cycles introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   The only change in `processSimpleJob.ts` is at the `ctx.gatherArtifacts` call site (~line 304):
         * `[ ]`   Before: `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count }`
         * `[ ]`   After: `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count, stageSlug }`
      * `[ ]`   `stageSlug` is already destructured from `job.payload` earlier in the same try block: `const { stageSlug, projectId, model_id, sessionId } = job.payload`.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching; no new DB queries.
         * `[ ]`   No hidden coupling to any new modules.

   * `[ ]`   `supabase/functions/dialectic-worker/processSimpleJob.test.ts`
      * `[ ]`   Existing tests: all pass without modification — they stub `ctx.gatherArtifacts` entirely and do not inspect the params object structure.
      * `[ ]`   Add test `"processSimpleJob — gatherArtifacts params include stageSlug from job payload"`:
         * `[ ]`   Construct `rootCtx` with `mockDeps()`.
         * `[ ]`   Stub `rootCtx.gatherArtifacts` with a spy that returns `{ artifacts: [] }`.
         * `[ ]`   Call `processSimpleJob(dbClient, mockJob({ payload: mockPayload }), 'user-789', rootCtx, 'auth-token')`.
         * `[ ]`   Assert `gatherStub.calls.length === 1`.
         * `[ ]`   Assert `gatherStub.calls[0].args[0].stageSlug === mockPayload.stageSlug` — the stub receives the params object as its first argument; verify it includes `stageSlug` equal to the job payload's stage slug.

   * `[ ]`   `supabase/functions/dialectic-worker/processSimpleJob.ts`
      * `[ ]`   Locate the `ctx.gatherArtifacts(...)` call (~line 304). The current params object is: `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count }`.
      * `[ ]`   Add `stageSlug` so the params object reads: `{ dbClient, projectId, sessionId, iterationNumber: sessionData.iteration_count, stageSlug }`.
      * `[ ]`   All other lines in `processSimpleJob.ts` are unchanged.

   * `[ ]`   `supabase/functions/dialectic-worker/processSimpleJob.integration.test.ts`
      * `[ ]`   Add import: `applyCompressionOverlay` from `./applyCompressionOverlay/applyCompressionOverlay.ts`.
      * `[ ]`   Locate the first `boundGather` closure (~line 246) that constructs a `GatherArtifactsDeps` literal with `{ logger: baseParams.logger, pickLatest: baseParams.pickLatest, downloadFromStorage: baseParams.downloadFromStorage }`. Add `applyCompressionOverlay` (the real function) to this object.
      * `[ ]`   Locate the second `boundGather` closure (~line 1049) that constructs a `GatherArtifactsDeps` literal with `{ logger, pickLatest, downloadFromStorage }`. Add `applyCompressionOverlay` (the real function) to this object.
      * `[ ]`   All existing test assertions in `processSimpleJob.integration.test.ts` remain unchanged; the real `applyCompressionOverlay` is a no-op pass-through here because the mock DB returns rows without `RagContextSummary` resource descriptions.

   * `[ ]`   `construction`
      * `[ ]`   No new construction patterns — `stageSlug` is a value already in scope at the call site.
      * `[ ]`   No partial construction path is introduced.

   * `[ ]`   `directionality`
      * `[ ]`   `processSimpleJob.ts` layer position is unchanged — it remains a job-execution orchestrator that delegates to `ctx.gatherArtifacts`.
      * `[ ]`   The addition of `applyCompressionOverlay` import in the integration test file does not introduce a production-code coupling; test files may import from any sibling module.
      * `[ ]`   No new cycles introduced.

   * `[ ]`   `requirements`
      * `[ ]`   `processSimpleJob.ts` compiles without type error after `GatherArtifactsParams.stageSlug` is required.
      * `[ ]`   The new unit test asserts `gatherStub.calls[0].args[0].stageSlug === mockPayload.stageSlug`, proving `stageSlug` is forwarded from job payload to the `gatherArtifacts` call.
      * `[ ]`   Both `boundGather` closures in `processSimpleJob.integration.test.ts` satisfy the updated `GatherArtifactsDeps` shape using the real `applyCompressionOverlay` implementation; all existing integration test assertions remain GREEN.
      * `[ ]`   Integration tests in `processSimpleJob.integration.test.ts` exercise the full `applyCompressionOverlay → gatherArtifacts → processSimpleJob` chain with real implementations of all three functions; the real overlay runs against mock DB rows that produce a no-op pass-through, proving the chain is correctly assembled without requiring a contrived compression scenario.
      * `[ ]`   Node scope is limited to `processSimpleJob.ts`, `processSimpleJob.test.ts`, and `processSimpleJob.integration.test.ts`; no other source file is modified in this node.

   * `[ ]`   **Commit** `feat(dialectic-worker): wire applyCompressionOverlay into simple-job gather pipeline with canonical identity preservation`
      * `[ ]`   Structural changes:
         * `[ ]`   New `applyCompressionOverlay` module with full support system (interface, guard, mock, test, provides) establishes the in-memory overlay consume point for persisted RagContextSummary artifacts.
         * `[ ]`   `GatherArtifactsDeps` gains required `applyCompressionOverlay: ApplyCompressionOverlayFn` field.
         * `[ ]`   `GatherArtifactsParams` gains required `stageSlug: string` field.
         * `[ ]`   `processSimpleJob.ts` gatherArtifacts call site extended with `stageSlug` from job payload.
      * `[ ]`   Behavioral changes:
         * `[ ]`   After the dedup step in `gatherArtifacts`, compression summaries from `dialectic_project_resources` are queried, SHA-256 fingerprint-checked against the live artifact content, and fresh matches replace artifact `content` in memory before the model job is built.
         * `[ ]`   Stale fingerprints, unmatched `target_document_id`, and invalid `resource_description` produce warn logs and skip — never hard errors.
         * `[ ]`   DB query and storage download errors from the overlay path propagate as retriable errors through the `gatherArtifacts` return.
         * `[ ]`   No artifact identity field (`id`, `document_key`, `stage_slug`, `type`) is mutated at any step; only `content` is replaced.
      * `[ ]`   Contract changes:
         * `[ ]`   `GatherArtifactsDeps.applyCompressionOverlay: ApplyCompressionOverlayFn` is now required; existing callers must supply it via DI closure (see `index.ts` node).
         * `[ ]`   `GatherArtifactsParams.stageSlug: string` is now required; existing callers must supply it at each call site.
         * `[ ]`   `ApplyCompressionOverlayFn` / `BoundApplyCompressionOverlayFn` and discriminated `ApplyCompressionOverlayReturn` are exported from `applyCompressionOverlay.provides.ts`.

* `[ ]`   supabase/functions/_shared/services/indexing_service.ts **[BE] Normalize embedding execution contract: add embeddingModelApiIdentifier as explicit parameter to IEmbeddingClient.getEmbedding and IIndexingService.indexDocument, and key debit idempotency on model slug**

   * `[ ]`   `objective`
      * `[ ]`   Functional goals:
         * `[ ]`   Update `IEmbeddingClient.getEmbedding` from `getEmbedding(text: string): Promise<EmbeddingResponse>` to `getEmbedding(text: string, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>` so every call site explicitly declares which model is being used.
         * `[ ]`   Add `EmbeddingFn` type alias: `export type EmbeddingFn = (text: string, embeddingModelApiIdentifier: string) => Promise<EmbeddingResponse>;`
         * `[ ]`   Update `IIndexingService.indexDocument` to add `embeddingModelApiIdentifier: string` as its fifth parameter: `indexDocument(sessionId: string, sourceContributionId: string, documentContent: string, metadata: Record<string, unknown>, embeddingModelApiIdentifier: string): Promise<IndexDocumentResult>;`
         * `[ ]`   Update `EmbeddingClient.getEmbedding` to accept `(text: string, _embeddingModelApiIdentifier: string)` — body unchanged, adapter call remains `this.adapter.getEmbedding(text)`.
         * `[ ]`   Update `IndexingService.indexDocument` to accept `embeddingModelApiIdentifier: string` as its fifth parameter.
         * `[ ]`   In `IndexingService.indexDocument`, change `chunks.map((chunk) => this.embeddingClient.getEmbedding(chunk))` to `chunks.map((chunk) => this.embeddingClient.getEmbedding(chunk, embeddingModelApiIdentifier))`.
         * `[ ]`   In `IndexingService.indexDocument`, change the debit `idempotencyKey` from `` `embed:${sessionId}:${sourceContributionId}:${i + 1}` `` to `` `embed:${sessionId}:${sourceContributionId}:${embeddingModelApiIdentifier}:${i + 1}` ``.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   Model slug resolution stays in `prepareModelJob.ts` (Workstream C). No DB query for `is_default_embedding` is added to any of the three Workstream E service files.
         * `[ ]`   `IIndexingService.indexDocument` signature change is a compile-time-visible contract update; downstream callers (`rag_service.ts` in Node 3) update their call sites in their own Workstream E nodes.
         * `[ ]`   No changes to `vector_utils.ts`, `rag_service.ts`, or `_shared/types.ts` in this node.

   * `[ ]`   `role`
      * `[ ]`   Shared infrastructure service boundary — sets the normalized embedding execution contract (explicit model identifier at every call site) consumed by `vector_utils.ts` (Workstream E node 2) and `rag_service.ts` (Workstream E node 3).
      * `[ ]`   Out-of-scope: `vector_utils.ts` and `rag_service.ts` call sites; `AiProviderAdapterInstance.getEmbedding` in `_shared/types.ts`; model slug DB resolution (that responsibility stays in `prepareModelJob.ts`).

   * `[ ]`   `module`
      * `[ ]`   Bounded context: `indexing_service.ts`, `indexing_service.interface.ts`, `indexing_service.mock.ts`, `indexing_service.test.ts`.
      * `[ ]`   Outside boundary: `vector_utils.ts`, `rag_service.ts`, Netlify adapter space, `prepareModelJob.ts`.

   * `[ ]`   `deps`
      * `[ ]`   `supabase/functions/_shared/types.ts` — `AiProviderAdapterInstance`, `EmbeddingResponse` — `AiProviderAdapterInstance.getEmbedding?(text: string): Promise<EmbeddingResponse>` is the underlying adapter method; its signature is not changed in this node.
      * `[ ]`   `supabase/functions/_shared/utils/errors.ts` — `IndexingError` — thrown by `EmbeddingClient.getEmbedding` on adapter failure; no new throw paths in this node.
      * `[ ]`   `supabase/functions/_shared/services/tokenwallet/admin/adminTokenWalletService.interface.ts` — `IAdminTokenWalletService` — unchanged dep; `recordTransaction` debit key format is updated.

   * `[ ]`   `context_slice`
      * `[ ]`   `AiProviderAdapterInstance.getEmbedding(text: string): Promise<EmbeddingResponse>` — signature unchanged; `EmbeddingClient` calls it with `text` only.
      * `[ ]`   `IndexingService` constructor signature is unchanged: `(supabaseClient, logger, textSplitter, embeddingClient, tokenWalletService)`.
      * `[ ]`   Callers of `indexDocument` (currently only `rag_service.ts`) must supply `embeddingModelApiIdentifier` — that update is in Workstream E Node 3.

   * `[ ]`   `supabase/functions/_shared/services/indexing_service.interface.ts`
      * `[ ]`   Change `getEmbedding(text: string): Promise<EmbeddingResponse>` to `getEmbedding(text: string, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>` inside `IEmbeddingClient`.
      * `[ ]`   Add `export type EmbeddingFn = (text: string, embeddingModelApiIdentifier: string) => Promise<EmbeddingResponse>;` after the `IEmbeddingClient` interface.
      * `[ ]`   Change `indexDocument(sessionId: string, sourceContributionId: string, documentContent: string, metadata: Record<string, unknown>): Promise<IndexDocumentResult>` to `indexDocument(sessionId: string, sourceContributionId: string, documentContent: string, metadata: Record<string, unknown>, embeddingModelApiIdentifier: string): Promise<IndexDocumentResult>` inside `IIndexingService`.
      * `[ ]`   No other changes.

   * `[ ]`   `supabase/functions/_shared/services/indexing_service.mock.ts`
      * `[ ]`   Change `getEmbedding: async (_text: string) => ({` to `getEmbedding: async (_text: string, _embeddingModelApiIdentifier: string) => ({` in the `mockEmbeddingClient` inside the `MockIndexingService` constructor.
      * `[ ]`   Change the `override indexDocument = (_sessionId: string, _sourceContributionId: string, _documentContent: string, _metadata: Record<string, unknown>)` signature in `MockIndexingService` to add `_embeddingModelApiIdentifier: string` as a fifth parameter.
      * `[ ]`   No other changes.

   * `[ ]`   `supabase/functions/_shared/services/indexing_service.test.ts`
      * `[ ]`   Add `IndexingError` to imports: `import { IndexingError } from '../utils/errors.ts';`.
      * `[ ]`   Add `resolveDefaultEmbeddingModelApiIdentifier` — **this function does not exist and is not being created in this node**; no import needed. The resolver stays in `prepareModelJob.ts`.
      * `[ ]`   In test `'IndexingService should process and index a document successfully'`: pass `'text-embedding-3-small'` as the fifth argument to every `service.indexDocument(...)` call in the test body.
      * `[ ]`   In test `'IndexingService uses DummyAdapter embeddings (deterministic vector, non-zero usage, persisted length 3072)'`: pass `'text-embedding-3-small'` as the fifth argument to every `service.indexDocument(...)` call.
      * `[ ]`   In test `'IndexingService guard: returns error when embedding dimension != 3072 (no insert)'`: pass `'text-embedding-3-small'` as the fifth argument to the `service.indexDocument(...)` call; update `WrongDimEmbeddingClient.getEmbedding(text: string)` to `getEmbedding(text: string, _embeddingModelApiIdentifier: string)`.
      * `[ ]`   In test `'IndexingService bills embeddings 1:1 per chunk with idempotent keys'`: pass `'text-embedding-3-small'` as the fifth argument to the `service.indexDocument(...)` call; update `expectedKeys` from `new Set([\`embed:${sessionId}:${contributionId}:1\`, \`embed:${sessionId}:${contributionId}:2\`])` to `new Set([\`embed:${sessionId}:${contributionId}:text-embedding-3-small:1\`, \`embed:${sessionId}:${contributionId}:text-embedding-3-small:2\`])`.
      * `[ ]`   No new tests for model-slug resolution — that behavior lives in `prepareModelJob.ts`. The new parameter is exercised by the existing billing test's updated `expectedKeys` assertion.

   * `[ ]`   `supabase/functions/_shared/services/indexing_service.ts`
      * `[ ]`   Change `async getEmbedding(text: string): Promise<EmbeddingResponse>` to `async getEmbedding(text: string, _embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>` in the `EmbeddingClient` class — body unchanged.
      * `[ ]`   Change the `indexDocument` method signature from `async indexDocument(sessionId: string, sourceContributionId: string, documentContent: string, metadata: Record<string, unknown>)` to `async indexDocument(sessionId: string, sourceContributionId: string, documentContent: string, metadata: Record<string, unknown>, embeddingModelApiIdentifier: string)`.
      * `[ ]`   Change `chunks.map((chunk) => this.embeddingClient.getEmbedding(chunk))` to `chunks.map((chunk) => this.embeddingClient.getEmbedding(chunk, embeddingModelApiIdentifier))`.
      * `[ ]`   Change `const idempotencyKey = \`embed:${sessionId}:${sourceContributionId}:${i + 1}\`` to `const idempotencyKey = \`embed:${sessionId}:${sourceContributionId}:${embeddingModelApiIdentifier}:${i + 1}\``.
      * `[ ]`   No other changes to `indexing_service.ts`.

   * `[ ]`   `construction`
      * `[ ]`   `IndexingService` constructor is unchanged.
      * `[ ]`   `EmbeddingClient` constructor is unchanged.
      * `[ ]`   `embeddingModelApiIdentifier` is a per-call parameter, not a constructor dep; callers supply it at each `indexDocument` invocation.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared infrastructure service.
      * `[ ]`   Updated outward contract: `IEmbeddingClient.getEmbedding` and `IIndexingService.indexDocument` both gain `embeddingModelApiIdentifier` as an explicit parameter.
      * `[ ]`   Downstream consumers `vector_utils.ts` and `rag_service.ts` update their call sites in their own Workstream E nodes.
      * `[ ]`   Cross-node impact (not in this node's scope — reported as discoveries):
         * `[ ]`   `compressPrompt.ts` (Embedding Jobs.md, Workstream C node 4): must pass `embeddingModelApiIdentifier: params.embeddingModelSlug` in `CompressionStrategyParams` when calling the compression strategy — required by `vector_utils.ts` Node 2 change.
         * `[ ]`   `index.ts` (Embedding Jobs.md, Workstream C node 7): must pass `embeddingModelApiIdentifier` (from the already-extracted `api_identifier` of the `ai_providers` query) when constructing `RagService` — required by `rag_service.ts` Node 3 change.

   * `[ ]`   `requirements`
      * `[ ]`   `IEmbeddingClient.getEmbedding` requires explicit `embeddingModelApiIdentifier: string` as its second parameter — all mock and production implementations updated.
      * `[ ]`   `IIndexingService.indexDocument` requires `embeddingModelApiIdentifier: string` as its fifth parameter — mock and production updated.
      * `[ ]`   Debit idempotency key format is `embed:${sessionId}:${sourceContributionId}:${embeddingModelApiIdentifier}:${i+1}` — changing the default provider changes debit keys on next call without code change.
      * `[ ]`   No DB query is added to any of the three Workstream E service files; model slug resolution stays at `prepareModelJob.ts`.
      * `[ ]`   All four existing `indexDocument` tests pass after adding `'text-embedding-3-small'` as the fifth argument; billing test `expectedKeys` updated to include slug; no other existing assertions changed.
      * `[ ]`   Node scope: `indexing_service.ts` and its three existing support files only — no new files created.

* `[ ]`   supabase/functions/_shared/utils/vector_utils.ts **[BE] Thread embeddingModelApiIdentifier through scoreResourceDocuments and getSortedCompressionCandidates to satisfy updated IEmbeddingClient two-arg contract**

   * `[ ]`   `objective`
      * `[ ]`   Solve the call-site mismatch introduced when `IEmbeddingClient.getEmbedding` gained `embeddingModelApiIdentifier: string` as its second parameter in the prior `indexing_service.ts` node: `scoreResourceDocuments` calls `deps.embeddingClient.getEmbedding(text)` with one argument at two sites, and `getSortedCompressionCandidates` passes no model identifier through to those call sites.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `embeddingModelApiIdentifier: string` as a required field on `CompressionStrategyParams` in `vector_utils.interface.ts`.
         * `[ ]`   Add `embeddingModelApiIdentifier: string` as a fourth parameter to `scoreResourceDocuments` and update both `getEmbedding` call sites within it to forward the identifier.
         * `[ ]`   Destructure `embeddingModelApiIdentifier` from `params` inside `getSortedCompressionCandidates` and pass it as the fourth argument when calling `scoreResourceDocuments`.
         * `[ ]`   Update `mockEmbeddingClient.getEmbedding` in `vector_utils.test.ts` to `(text: string, _embeddingModelApiIdentifier: string)` to satisfy the updated `IEmbeddingClient` interface.
         * `[ ]`   Add `'text-embedding-3-small'` as the fourth argument to every `scoreResourceDocuments(...)` call in `vector_utils.test.ts` (two call sites).
         * `[ ]`   Add `embeddingModelApiIdentifier: 'text-embedding-3-small'` to the params object of every `compressionStrategy(deps, params, payload)` call in `vector_utils.test.ts` (six call sites: three with `{}`, two with `{ inputsRelevance }`, one in the role-aware test).
         * `[ ]`   Create `vector_utils.integration.test.ts` to prove the `IEmbeddingClient (new two-arg contract) → getSortedCompressionCandidates → ICompressionStrategy boundary` chain with a capturing mock.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   `scoreHistory`, `cosineSimilarity`, `dotProduct`, and `magnitude` are pure functions with no embedding client calls; they remain entirely unchanged.
         * `[ ]`   `vector_utils.mock.ts` `mockCompressionStrategy = async () => []` ignores params entirely; no change required.
         * `[ ]`   `rag_service.ts` calls `this.deps.embeddingClient.getEmbedding(text)` with one arg at multiple sites; those are addressed in the `rag_service.ts` Workstream E Node 3 — do not touch `rag_service.ts` in this node.
         * `[ ]`   `compressPrompt.ts` (Workstream C node 4) is the production caller of `ICompressionStrategy`; it must supply `embeddingModelApiIdentifier` in `CompressionStrategyParams` — this cross-node impact was already flagged in the `indexing_service.ts` discovery notes; no change to `compressPrompt.ts` in this node.
         * `[ ]`   No `vector_utils.guard.ts`, `vector_utils.provides.ts`, or guard test file exist and none are introduced; this is an existing-file modification, not namespace alignment.
      * `[ ]`   Each goal is atomic and testable through updated interface, updated unit tests, and the new integration test file.

   * `[ ]`   `role`
      * `[ ]`   Node role is shared utility function update — consumes the updated `IEmbeddingClient` contract from `indexing_service.ts` and exposes the updated `ICompressionStrategy` boundary to `compressPrompt.ts`.
      * `[ ]`   This role is correct because `vector_utils.ts` is the second Workstream E source file: it consumes the embedding client contract changed in node 1 and provides the compression strategy type consumed downstream.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify `rag_service.ts` embedding client calls; those belong to Workstream E Node 3.
         * `[ ]`   Do not modify `compressPrompt.ts`; that belongs to Workstream C Node 4.
         * `[ ]`   Do not introduce a `provides.ts`, `guard.ts`, or `guard.test.ts` file; this is an existing-file modification and no such files exist in this module.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/utils/vector_utils.ts` and its immediate support files: `vector_utils.interface.ts`, `vector_utils.test.ts`, `vector_utils.mock.ts`, and the new `vector_utils.integration.test.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   `CompressionStrategyParams` type change.
         * `[ ]`   `scoreResourceDocuments` signature and internal `getEmbedding` call sites.
         * `[ ]`   `getSortedCompressionCandidates` params destructuring and `scoreResourceDocuments` call.
         * `[ ]`   All unit test call sites in `vector_utils.test.ts`.
         * `[ ]`   Integration test proving model identifier propagation.
      * `[ ]`   Outside boundary:
         * `[ ]`   `rag_service.ts` `performAdvancedRetrieval` embedding client calls.
         * `[ ]`   `compressPrompt.ts` `ICompressionStrategy` invocation site.
         * `[ ]`   `IEmbeddingClient` interface definition (defined in `indexing_service.interface.ts`, changed in prior node).

   * `[ ]`   `deps`
      * `[ ]`   Provider: `supabase/functions/_shared/services/indexing_service.interface.ts` — `IEmbeddingClient`.
         * `[ ]`   Layer classification: shared infrastructure service interface producer.
         * `[ ]`   Direction: consumed by `CompressionStrategyDeps.embeddingClient` and by `scoreResourceDocuments` call sites.
         * `[ ]`   Purpose: defines the two-arg `getEmbedding(text, embeddingModelApiIdentifier)` contract that `vector_utils.ts` must now satisfy at its call sites.
      * `[ ]`   Provider: `../../dialectic-service/dialectic.interface.ts` — `RelevanceRule`.
         * `[ ]`   Layer classification: domain type producer.
         * `[ ]`   Direction: consumed by `CompressionStrategyParams.inputsRelevance` — unchanged.
         * `[ ]`   Purpose: type the relevance weight matrix; unchanged in this node.
      * `[ ]`   Provider: `../types.ts` — `ILogger`, `Messages`, `ResourceDocuments`, `ResourceDocument`.
         * `[ ]`   Layer classification: shared domain type producer.
         * `[ ]`   Direction: consumed by interface and implementation — unchanged.
         * `[ ]`   Purpose: types for compression candidates, history, and document shapes.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from `vector_utils.ts` into `rag_service.ts` or `compressPrompt.ts`.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `IEmbeddingClient.getEmbedding(text: string, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>` — the only changed surface consumed by `vector_utils.ts`.
         * `[ ]`   `CompressionStrategyDeps.dbClient` and `CompressionStrategyDeps.logger` remain unchanged.
      * `[ ]`   `CompressionStrategyParams` gains one required field; all other fields are unchanged.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated types or interfaces.
         * `[ ]`   No hidden coupling to enqueue, callback, or worker boundary types.

   * `[ ]`   `supabase/functions/_shared/utils/vector_utils.interface.test.ts`
      * `[ ]`   This file does not exist and is not created; `vector_utils.interface.ts` is a plain type file with no existing test. Per the rule that "types files (interfaces, enums) are exempt from RED/GREEN testing requirements," no interface test file is required for this node.

   * `[ ]`   `supabase/functions/_shared/utils/vector_utils.interface.ts`
      * `[ ]`   In `CompressionStrategyParams`, add `embeddingModelApiIdentifier: string` as a required field (not optional) immediately after `inputsRelevance?: RelevanceRule[]`.
      * `[ ]`   All other interfaces (`CompressionStrategyDeps`, `CompressionStrategyPayload`, `ICompressionStrategy`) are unchanged.

   * `[ ]`   `supabase/functions/_shared/utils/vector_utils.interaction.spec`
      * `[ ]`   This file does not exist; `vector_utils.ts` is an existing file with no interaction spec. Not created in this node per existing-file modification rule.

   * `[ ]`   `supabase/functions/_shared/utils/vector_utils.test.ts`
      * `[ ]`   Update `mockEmbeddingClient` definition:
         * `[ ]`   Change `getEmbedding: async (text: string): Promise<EmbeddingResponse> => {` to `getEmbedding: async (text: string, _embeddingModelApiIdentifier: string): Promise<EmbeddingResponse> => {`.
         * `[ ]`   Body of `getEmbedding` (vector branching logic) is unchanged.
      * `[ ]`   Update both `scoreResourceDocuments` call sites:
         * `[ ]`   In test `"scoreResourceDocuments"` → step `"should return an empty array if no documents are provided"`: change `scoreResourceDocuments(compressionDeps, [], currentUserPrompt)` to `scoreResourceDocuments(compressionDeps, [], currentUserPrompt, 'text-embedding-3-small')`.
         * `[ ]`   In test `"scoreResourceDocuments"` → step `"should score documents based on cosine similarity"`: change `scoreResourceDocuments(compressionDeps, documents, currentUserPrompt)` to `scoreResourceDocuments(compressionDeps, documents, currentUserPrompt, 'text-embedding-3-small')`.
      * `[ ]`   Update every `compressionStrategy(deps, params, payload)` params object to include `embeddingModelApiIdentifier: 'text-embedding-3-small'`:
         * `[ ]`   In test `"getSortedCompressionCandidates"` → step `"should combine and sort candidates from both sources"`: change params argument `{}` to `{ embeddingModelApiIdentifier: 'text-embedding-3-small' }`.
         * `[ ]`   In test `"getSortedCompressionCandidates"` → step `"returns indexed document candidates (no exclusion by prior indexing)"`: change params `{}` to `{ embeddingModelApiIdentifier: 'text-embedding-3-small' }`.
         * `[ ]`   In test `"getSortedCompressionCandidates"` → step `"keeps candidates even if already indexed (no exclusion by prior indexing)"`: change params `{}` to `{ embeddingModelApiIdentifier: 'text-embedding-3-small' }`.
         * `[ ]`   In test `"getSortedCompressionCandidates - role-aware anchors preserved; non-anchored early messages are candidates"`: change params `{}` to `{ embeddingModelApiIdentifier: 'text-embedding-3-small' }`.
         * `[ ]`   In test `"getSortedCompressionCandidates - blended scoring ranks higher-matrix doc later on similarity ties"`: change params `{ inputsRelevance }` to `{ inputsRelevance, embeddingModelApiIdentifier: 'text-embedding-3-small' }`.
         * `[ ]`   In test `"getSortedCompressionCandidates - matrix priority protects high-priority doc on similarity ties"`: change params `{ inputsRelevance }` to `{ inputsRelevance, embeddingModelApiIdentifier: 'text-embedding-3-small' }`.
      * `[ ]`   All existing test assertions (`assertEquals`, `assert`, `assertAlmostEquals`) remain unchanged; no assertion logic is altered.

   * `[ ]`   `supabase/functions/_shared/utils/vector_utils.ts`
      * `[ ]`   Update `scoreResourceDocuments` function signature: add `embeddingModelApiIdentifier: string` as the fourth parameter — full updated signature: `export async function scoreResourceDocuments(deps: CompressionStrategyDeps, documents: ResourceDocuments, currentUserPrompt: string, embeddingModelApiIdentifier: string): Promise<CompressionCandidate[]>`.
      * `[ ]`   Inside `scoreResourceDocuments`, update the prompt embedding call: change `const promptEmbeddingResponse = await deps.embeddingClient.getEmbedding(currentUserPrompt)` to `const promptEmbeddingResponse = await deps.embeddingClient.getEmbedding(currentUserPrompt, embeddingModelApiIdentifier)`.
      * `[ ]`   Inside `scoreResourceDocuments`, update the document embedding call inside the `for` loop: change `const docEmbeddingResponse = await deps.embeddingClient.getEmbedding(doc.content)` to `const docEmbeddingResponse = await deps.embeddingClient.getEmbedding(doc.content, embeddingModelApiIdentifier)`.
      * `[ ]`   Inside `getSortedCompressionCandidates`, extend the params destructuring block: change `const inputsRelevance: CompressionStrategyParams['inputsRelevance'] = params.inputsRelevance` to add `const embeddingModelApiIdentifier: string = params.embeddingModelApiIdentifier` on the following line (keep existing destructuring style intact).
      * `[ ]`   Inside `getSortedCompressionCandidates`, update the `scoreResourceDocuments` call: change `const documentCandidates = await scoreResourceDocuments(deps, documents, currentUserPrompt)` to `const documentCandidates = await scoreResourceDocuments(deps, documents, currentUserPrompt, embeddingModelApiIdentifier)`.
      * `[ ]`   All other lines in `vector_utils.ts` — `scoreHistory`, `getSortedCompressionCandidates` matrix logic, `cosineSimilarity`, `dotProduct`, `magnitude`, the diagnostic DB query, and the `console.log` debug block — are unchanged.

   * `[ ]`   `construction`
      * `[ ]`   `scoreResourceDocuments` and `getSortedCompressionCandidates` are stateless exported functions; no constructor or factory is involved.
      * `[ ]`   `embeddingModelApiIdentifier` is a per-call parameter supplied by the caller (`compressPrompt.ts`) at each invocation; it is not stored in any closure or module-level state.
      * `[ ]`   No partial construction path is introduced.

   * `[ ]`   `supabase/functions/_shared/utils/vector_utils.integration.test.ts`
      * `[ ]`   Import `getSortedCompressionCandidates`, `scoreResourceDocuments` from `./vector_utils.ts`.
      * `[ ]`   Import `CompressionStrategyDeps`, `CompressionStrategyParams`, `CompressionStrategyPayload` from `./vector_utils.interface.ts`.
      * `[ ]`   Import `IEmbeddingClient`, `EmbeddingResponse` from `../services/indexing_service.interface.ts`.
      * `[ ]`   Import `ResourceDocuments`, `Messages` from `../types.ts`.
      * `[ ]`   Import `createMockSupabaseClient` from `../supabase.mock.ts`.
      * `[ ]`   Import `SupabaseClient` from `npm:@supabase/supabase-js@2`.
      * `[ ]`   Import `Database` from `../../types_db.ts`.
      * `[ ]`   Import `assertEquals`, `assert` from `https://deno.land/std@0.224.0/assert/mod.ts`.
      * `[ ]`   Integration test `"integration: embeddingModelApiIdentifier flows from CompressionStrategyParams into IEmbeddingClient.getEmbedding calls"`:
         * `[ ]`   Define `capturedIdentifiers: string[] = []`.
         * `[ ]`   Define `capturingEmbeddingClient: IEmbeddingClient` with `getEmbedding: async (text: string, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse> => { capturedIdentifiers.push(embeddingModelApiIdentifier); return { embedding: [0.5, 0.5, 0.5], usage: { prompt_tokens: text.length, total_tokens: text.length } }; }`.
         * `[ ]`   Construct `{ client: dbClient }` from `createMockSupabaseClient('user-1', { genericMockResults: { dialectic_memory: { select: { data: [], error: null } } } })`.
         * `[ ]`   Build `deps: CompressionStrategyDeps = { dbClient: dbClient as unknown as SupabaseClient<Database>, embeddingClient: capturingEmbeddingClient }`.
         * `[ ]`   Build `params: CompressionStrategyParams = { embeddingModelApiIdentifier: 'integration-model-id' }`.
         * `[ ]`   Build `payload: CompressionStrategyPayload = { documents: [{ id: 'doc-1', content: 'doc content', document_key: 'business_case', stage_slug: 'thesis', type: 'document' }], history: [], currentUserPrompt: 'test prompt' }`.
         * `[ ]`   Call `await getSortedCompressionCandidates(deps, params, payload)`.
         * `[ ]`   Assert `capturedIdentifiers.length > 0` — the client was called at least once.
         * `[ ]`   Assert every entry in `capturedIdentifiers` equals `'integration-model-id'` — the identifier from params was forwarded to every `getEmbedding` invocation without substitution.
      * `[ ]`   Integration test `"integration: scoreResourceDocuments forwards embeddingModelApiIdentifier to each getEmbedding call per document"`:
         * `[ ]`   Define `perCallIdentifiers: string[] = []` and a capturing client that records the identifier on each call and returns `{ embedding: [1, 0, 0], usage: { prompt_tokens: 5, total_tokens: 5 } }`.
         * `[ ]`   Construct `deps` with `capturingEmbeddingClient` and no `dbClient` needed (function does not call DB).
         * `[ ]`   Define two documents: `[{ id: 'a', content: 'alpha', document_key: 'business_case', stage_slug: 'thesis', type: 'document' }, { id: 'b', content: 'beta', document_key: 'feature_spec', stage_slug: 'thesis', type: 'document' }]`.
         * `[ ]`   Call `await scoreResourceDocuments(deps, documents, 'user prompt', 'score-model-x')`.
         * `[ ]`   Assert `perCallIdentifiers.length === 3` — one call for the prompt plus one per document.
         * `[ ]`   Assert every entry in `perCallIdentifiers` equals `'score-model-x'`.
      * `[ ]`   Integration test `"integration: getSortedCompressionCandidates returns ICompressionStrategy-typed result through updated IEmbeddingClient boundary"`:
         * `[ ]`   Construct deps with a simple mock client that returns deterministic embeddings for any input with the new two-arg signature.
         * `[ ]`   Call `getSortedCompressionCandidates` cast as `ICompressionStrategy` and assert result is an array (boundary contract is satisfied).
         * `[ ]`   Assert `result.every(c => typeof c.id === 'string' && typeof c.effectiveScore === 'number')` — candidate shape is correct through the boundary.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared utility — intermediate between `IEmbeddingClient` infrastructure contract (inward) and `ICompressionStrategy` domain contract (outward).
      * `[ ]`   Dependencies remain inward-facing: `indexing_service.interface.ts` contract, shared domain types, Supabase client.
      * `[ ]`   Outward API is `ICompressionStrategy` — `getSortedCompressionCandidates` satisfies this type; `compressPrompt.ts` is the declared consumer.
      * `[ ]`   Cross-node impact (not in this node's scope — reported as discoveries):
         * `[ ]`   `compressPrompt.ts` (Embedding Jobs.md, Workstream C node 4): the call site that invokes `ICompressionStrategy` must supply `embeddingModelApiIdentifier: string` in `CompressionStrategyParams`. This was already flagged as a discovery in the `indexing_service.ts` node.
         * `[ ]`   `rag_service.ts` (Workstream E Node 3): `performAdvancedRetrieval` calls `this.deps.embeddingClient.getEmbedding(text)` with one arg at four sites; those breaks are fixed in Workstream E Node 3.
      * `[ ]`   No cycles introduced with `rag_service.ts`, `compressPrompt.ts`, or any Workstream C module.

   * `[ ]`   `requirements`
      * `[ ]`   `CompressionStrategyParams.embeddingModelApiIdentifier: string` is present and required; callers must supply it.
      * `[ ]`   `scoreResourceDocuments` accepts `embeddingModelApiIdentifier` as its fourth parameter and forwards it to both `IEmbeddingClient.getEmbedding` call sites within the function.
      * `[ ]`   `getSortedCompressionCandidates` destructures `embeddingModelApiIdentifier` from `params` and passes it as the fourth argument to `scoreResourceDocuments`.
      * `[ ]`   All six `compressionStrategy(...)` call sites in `vector_utils.test.ts` supply `embeddingModelApiIdentifier: 'text-embedding-3-small'` in params; both `scoreResourceDocuments(...)` call sites supply `'text-embedding-3-small'` as the fourth argument.
      * `[ ]`   `mockEmbeddingClient.getEmbedding` in `vector_utils.test.ts` satisfies the updated `IEmbeddingClient` two-arg signature.
      * `[ ]`   All existing `vector_utils.test.ts` assertions remain GREEN with no changes to assertion logic.
      * `[ ]`   Integration test `vector_utils.integration.test.ts` proves that `embeddingModelApiIdentifier` from `CompressionStrategyParams` is forwarded to every `IEmbeddingClient.getEmbedding` invocation, satisfying the producer (`indexing_service.ts` IEmbeddingClient contract) → implementation (`vector_utils.ts`) → consumer (`ICompressionStrategy` boundary) chain.
      * `[ ]`   `scoreHistory`, `cosineSimilarity`, and all unaffected functions in `vector_utils.ts` remain byte-for-byte unchanged.
      * `[ ]`   Node scope is limited to `vector_utils.ts`, `vector_utils.interface.ts`, `vector_utils.test.ts`, and the new `vector_utils.integration.test.ts`; no other source file is modified in this node.

* `[ ]`   supabase/functions/_shared/services/rag_service.ts **[BE] Thread embeddingModelApiIdentifier through getContextForModel into indexDocument and getEmbedding call sites; update debit idempotency keys to include model slug**

   * `[ ]`   `objective`
      * `[ ]`   Solve four single-arg call-site mismatches introduced by prior Workstream E nodes: `indexDocument` gained a 5th `embeddingModelApiIdentifier` parameter and `IEmbeddingClient.getEmbedding` gained a 2nd `embeddingModelApiIdentifier` parameter, but `rag_service.ts` still calls both with the original argument counts, breaking type-checking.
      * `[ ]`   Functional goals:
         * `[ ]`   Add `embeddingModelApiIdentifier: string` as the sixth parameter to `IRagService.getContextForModel` in `rag_service.interface.ts`.
         * `[ ]`   Add `_embeddingModelApiIdentifier: string` as the sixth parameter to `MockRagService.getContextForModel` in `rag_service.mock.ts` (ignored, body unchanged).
         * `[ ]`   Add `embeddingModelApiIdentifier: string` as the sixth parameter to `RagService.getContextForModel` in `rag_service.ts` and thread it into the three internal call sites: `this.deps.indexingService.indexDocument(...)` as the 5th arg, `this.deps.embeddingClient.getEmbedding(queries[0], ...)` as the 2nd arg, and `this.deps.embeddingClient.getEmbedding(queryText, ...)` as the 2nd arg inside the retrieval loop.
         * `[ ]`   Update the two RAG query debit idempotency keys from `` `rag:query:${sessionId}:${stageSlug}:<N>` `` to `` `rag:query:${sessionId}:${stageSlug}:${embeddingModelApiIdentifier}:<N>` `` so the debit key changes when the embedding model changes, consistent with the `indexing_service.ts` node's pattern.
         * `[ ]`   Add `'text-embedding-3-small'` as the sixth argument to all fourteen `service.getContextForModel(...)` call sites in `rag_service.test.ts`.
         * `[ ]`   Update `WrongDimEmbeddingClient.getEmbedding` in `rag_service.test.ts` from `async getEmbedding(text: string)` to `async getEmbedding(text: string, _embeddingModelApiIdentifier: string)` to satisfy the updated `IEmbeddingClient` interface.
         * `[ ]`   Add `_embeddingModelApiIdentifier: string` as the fifth parameter to the two `stub` callbacks in `rag_service.test.ts` that explicitly name their parameters.
         * `[ ]`   Create `rag_service.integration.test.ts` to prove the `IEmbeddingClient (2-arg) + IIndexingService (5-arg) → RagService.getContextForModel (6-arg)` assembled chain with capturing mocks.
      * `[ ]`   Non-functional constraints:
         * `[ ]`   No changes to `ensureDocumentsAreIndexed`, `performAdvancedRetrieval`, `performMmrSelection`, or `_retry` logic beyond the specific call-site argument additions.
         * `[ ]`   The pre-existing duplicate idempotency key between the primary query debit (key `...:1`) and the first loop iteration (qi=0, key `...:1`) is not introduced by this node and is not fixed in this node; only the model-slug segment is added.
         * `[ ]`   All 14 existing `service.getContextForModel` assertions in `rag_service.test.ts` remain logically identical; only the call signatures change.
         * `[ ]`   No changes to `rag_service.ts` beyond the six identified lines.
         * `[ ]`   No changes to `vector_utils.ts`, `indexing_service.ts`, or any Workstream C source file in this node.
      * `[ ]`   Each goal is atomic and testable through updated interface, mock, unit tests, and the new integration test file.

   * `[ ]`   `role`
      * `[ ]`   Node role is the final Workstream E call-site update — consumes the updated `IEmbeddingClient` and `IIndexingService` contracts from `indexing_service.ts` (node 1) and completes embedding path normalization across the three Workstream E source files.
      * `[ ]`   This role is correct because `rag_service.ts` is the last Workstream E source file: it invokes both `indexDocument` and `getEmbedding` directly and is the only remaining file with old single-arg call sites after `indexing_service.ts` and `vector_utils.ts` nodes.
      * `[ ]`   Out-of-scope responsibilities:
         * `[ ]`   Do not modify `vector_utils.ts`, `indexing_service.ts`, or any `_shared` type files.
         * `[ ]`   Do not fix the pre-existing duplicate debit key issue for qi=0.
         * `[ ]`   Do not alter retrieval logic, MMR selection, retry behavior, or context assembly.

   * `[ ]`   `module`
      * `[ ]`   Bounded context is `supabase/functions/_shared/services/rag_service.ts` and its immediate support files: `rag_service.interface.ts`, `rag_service.mock.ts`, `rag_service.test.ts`, and the new `rag_service.integration.test.ts`.
      * `[ ]`   Inside boundary:
         * `[ ]`   `IRagService.getContextForModel` signature.
         * `[ ]`   `RagService.getContextForModel` params and three internal call sites.
         * `[ ]`   Two debit idempotency key format strings.
         * `[ ]`   All unit test call sites and the `WrongDimEmbeddingClient` class.
         * `[ ]`   Integration test proving model identifier propagation.
      * `[ ]`   Outside boundary:
         * `[ ]`   `IEmbeddingClient` interface definition (in `indexing_service.interface.ts`).
         * `[ ]`   `IIndexingService.indexDocument` interface definition (in `indexing_service.interface.ts`).
         * `[ ]`   Callers of `IRagService.getContextForModel` — e.g., `prepareModelJob.ts` — are in a separate workstream and are not modified here.

   * `[ ]`   `deps`
      * `[ ]`   Provider: `supabase/functions/_shared/services/indexing_service.interface.ts` — `IEmbeddingClient`, `IIndexingService`.
         * `[ ]`   Layer classification: shared infrastructure service interface producer.
         * `[ ]`   Direction: consumed by `IRagServiceDependencies` and by the three `RagService` call sites.
         * `[ ]`   Purpose: `IEmbeddingClient.getEmbedding(text, embeddingModelApiIdentifier)` and `IIndexingService.indexDocument(..., embeddingModelApiIdentifier)` now require the model identifier at every call site.
      * `[ ]`   Provider: `supabase/functions/_shared/services/rag_service.interface.ts` — `IRagServiceDependencies`, `IRagService`.
         * `[ ]`   Layer classification: local service contract producer.
         * `[ ]`   Direction: consumed by `RagService` implementation and all callers.
         * `[ ]`   Purpose: surface the new `embeddingModelApiIdentifier` parameter to `getContextForModel` callers.
      * `[ ]`   Confirm:
         * `[ ]`   No reverse dependency from `rag_service.ts` into `vector_utils.ts` or `indexing_service.ts`.
         * `[ ]`   No lateral layer violations introduced.

   * `[ ]`   `context_slice`
      * `[ ]`   Minimal dependency interfaces required:
         * `[ ]`   `IEmbeddingClient.getEmbedding(text: string, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse>`.
         * `[ ]`   `IIndexingService.indexDocument(sessionId, sourceContributionId, documentContent, metadata, embeddingModelApiIdentifier): Promise<IndexDocumentResult>`.
      * `[ ]`   `IRagServiceDependencies` constructor shape is unchanged; `embeddingModelApiIdentifier` is a per-call parameter on `getContextForModel`, not a construction dep.
      * `[ ]`   Confirm:
         * `[ ]`   No over-fetching of unrelated types.
         * `[ ]`   No hidden coupling to enqueue, callback, or worker boundary types.

   * `[ ]`   `supabase/functions/_shared/services/rag_service.interface.ts`
      * `[ ]`   In `IRagService.getContextForModel`, add `embeddingModelApiIdentifier: string` as the sixth parameter, after `inputsRelevance: RelevanceRule[]`.
      * `[ ]`   Full updated signature: `getContextForModel(sourceDocuments: IRagSourceDocument[], modelConfig: AiModelExtendedConfig, sessionId: string, stageSlug: string, inputsRelevance: RelevanceRule[], embeddingModelApiIdentifier: string): Promise<IRagContextResult>`.
      * `[ ]`   All other interfaces (`IRagServiceDependencies`, `IRagSourceDocument`, `IRagContextResult`) are unchanged.

   * `[ ]`   `supabase/functions/_shared/services/rag_service.mock.ts`
      * `[ ]`   In `MockRagService.getContextForModel`, add `_embeddingModelApiIdentifier: string` as the sixth parameter after `_inputsRelevance: RelevanceRule[]`.
      * `[ ]`   Body of `getContextForModel` is unchanged.
      * `[ ]`   `MockRagServiceConfig` interface and all other `MockRagService` methods are unchanged.

   * `[ ]`   `supabase/functions/_shared/services/rag_service.test.ts`
      * `[ ]`   Update `WrongDimEmbeddingClient` class definition: change `async getEmbedding(text: string)` to `async getEmbedding(text: string, _embeddingModelApiIdentifier: string)`. Body unchanged.
      * `[ ]`   Add `'text-embedding-3-small'` as the sixth argument to every `service.getContextForModel(...)` call. The fourteen call sites and their enclosing test names are:
         * `[ ]`   In `describe('Just-in-Time Indexing')` → `it('should call IndexingService for documents that are not yet indexed')`: add `'text-embedding-3-small'` after `sampleInputsRelevance`.
         * `[ ]`   In `describe('Just-in-Time Indexing')` → `it('should NOT call IndexingService if all documents are already indexed')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Advanced Retrieval')` → `it('should generate multiple queries, call embedding client for each, call RPC, and assemble a final context')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Advanced Retrieval')` → `it('bills 1:1 for query embeddings via token wallet')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Advanced Retrieval')` → `it('should correctly select diverse documents using MMR')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Advanced Retrieval')` → `it('should return a message if no relevant chunks are found')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Signature enforcement')` → `it('accepts empty inputsRelevance array')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Resiliency and Retries')` → `it('should retry a failed database select and succeed on the second attempt')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Resiliency and Retries')` → `it('should permanently fail if database select consistently fails')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Resiliency and Retries')` → `it('should retry a failed indexing call for one document and succeed overall')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Resiliency and Retries')` → `it('should permanently fail if one document consistently fails to index')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In `describe('Financial Tracking')` → `it('should return the total tokens used for indexing new documents')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In standalone `Deno.test('RagService issues RPC with 3072-d query embedding and returns non-empty context')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
         * `[ ]`   In standalone `Deno.test('RagService guard: rejects when query embedding dim != 3072 and does not call RPC')`: add `'text-embedding-3-small'` after `emptyInputsRelevance`.
      * `[ ]`   Update the two `stub` callbacks that name their parameters:
         * `[ ]`   In `it('should retry a failed indexing call for one document and succeed overall')`: change `stub(deps.indexingService, 'indexDocument', (sessionId, sourceContributionId, documentContent, metadata) => {` to `stub(deps.indexingService, 'indexDocument', (sessionId, sourceContributionId, documentContent, metadata, _embeddingModelApiIdentifier: string) => {`. Body unchanged.
         * `[ ]`   In `it('should permanently fail if one document consistently fails to index')`: change `stub(deps.indexingService, 'indexDocument', (sessionId, sourceContributionId, documentContent, metadata) => {` to `stub(deps.indexingService, 'indexDocument', (sessionId, sourceContributionId, documentContent, metadata, _embeddingModelApiIdentifier: string) => {`. Body unchanged.
      * `[ ]`   All existing assertions (`assertEquals`, `assertExists`, `assert`) remain logically unchanged; no assertion values are altered.

   * `[ ]`   `supabase/functions/_shared/services/rag_service.ts`
      * `[ ]`   Add `embeddingModelApiIdentifier: string` as the sixth parameter to `getContextForModel`: change `public async getContextForModel(sourceDocuments: IRagSourceDocument[], _modelConfig: AiModelExtendedConfig, sessionId: string, stageSlug: string, inputsRelevance: RelevanceRule[])` to `public async getContextForModel(sourceDocuments: IRagSourceDocument[], _modelConfig: AiModelExtendedConfig, sessionId: string, stageSlug: string, inputsRelevance: RelevanceRule[], embeddingModelApiIdentifier: string)`.
      * `[ ]`   Pass `embeddingModelApiIdentifier` down to `ensureDocumentsAreIndexed`: `ensureDocumentsAreIndexed` is a private method; add `embeddingModelApiIdentifier: string` as a third parameter to its signature and update the call site in `getContextForModel` from `await this.ensureDocumentsAreIndexed(sourceDocuments, sessionId)` to `await this.ensureDocumentsAreIndexed(sourceDocuments, sessionId, embeddingModelApiIdentifier)`.
      * `[ ]`   Inside `ensureDocumentsAreIndexed`, update the `indexDocument` call: change `await this.deps.indexingService.indexDocument(sessionId, doc.id, doc.content, {})` to `await this.deps.indexingService.indexDocument(sessionId, doc.id, doc.content, {}, embeddingModelApiIdentifier)`.
      * `[ ]`   Pass `embeddingModelApiIdentifier` down to `performAdvancedRetrieval`: add `embeddingModelApiIdentifier: string` as a third parameter to its private signature and update the call site in `getContextForModel` from `await this.performAdvancedRetrieval(sessionId, stageSlug)` to `await this.performAdvancedRetrieval(sessionId, stageSlug, embeddingModelApiIdentifier)`.
      * `[ ]`   Inside `performAdvancedRetrieval`, update the primary query embedding call: change `const { embedding: primaryQueryEmbedding, usage: primaryUsage } = await this.deps.embeddingClient.getEmbedding(queries[0])` to `const { embedding: primaryQueryEmbedding, usage: primaryUsage } = await this.deps.embeddingClient.getEmbedding(queries[0], embeddingModelApiIdentifier)`.
      * `[ ]`   Inside `performAdvancedRetrieval`, update the loop query embedding call: change `const { embedding, usage } = await this.deps.embeddingClient.getEmbedding(queryText)` to `const { embedding, usage } = await this.deps.embeddingClient.getEmbedding(queryText, embeddingModelApiIdentifier)`.
      * `[ ]`   Inside `performAdvancedRetrieval`, update the primary query debit idempotency key: change `` idempotencyKey: `rag:query:${sessionId}:${stageSlug}:1` `` to `` idempotencyKey: `rag:query:${sessionId}:${stageSlug}:${embeddingModelApiIdentifier}:1` ``.
      * `[ ]`   Inside `performAdvancedRetrieval`, update the loop debit idempotency key: change `` idempotencyKey: `rag:query:${sessionId}:${stageSlug}:${qi + 1}` `` to `` idempotencyKey: `rag:query:${sessionId}:${stageSlug}:${embeddingModelApiIdentifier}:${qi + 1}` ``.
      * `[ ]`   All other lines in `rag_service.ts` — `_retry`, `performMmrSelection`, MMR loop, chunk assembly, guard checks — are unchanged.

   * `[ ]`   `construction`
      * `[ ]`   `RagService` constructor is unchanged; `IRagServiceDependencies` is unchanged.
      * `[ ]`   `embeddingModelApiIdentifier` is a per-call parameter on `getContextForModel`; it is threaded into private methods as a regular argument and does not persist in instance state.
      * `[ ]`   No partial construction path is introduced.

   * `[ ]`   `supabase/functions/_shared/services/rag_service.integration.test.ts`
      * `[ ]`   Import `RagService` from `./rag_service.ts`.
      * `[ ]`   Import `IRagServiceDependencies`, `IRagSourceDocument` from `./rag_service.interface.ts`.
      * `[ ]`   Import `IEmbeddingClient`, `IIndexingService`, `IndexDocumentResult` from `./indexing_service.interface.ts`.
      * `[ ]`   Import `EmbeddingResponse` from `../types.ts`.
      * `[ ]`   Import `createMockSupabaseClient` from `../supabase.mock.ts`.
      * `[ ]`   Import `MockLogger` from `../logger.mock.ts`.
      * `[ ]`   Import `SupabaseClient` from `npm:@supabase/supabase-js@2`.
      * `[ ]`   Import `Database` from `../../types_db.ts`.
      * `[ ]`   Import `assertEquals`, `assert` from `https://deno.land/std@0.224.0/assert/mod.ts`.
      * `[ ]`   Import `RelevanceRule` from `../../dialectic-service/dialectic.interface.ts`.
      * `[ ]`   Integration test `"integration: embeddingModelApiIdentifier is forwarded to IIndexingService.indexDocument on every JIT indexing call"`:
         * `[ ]`   Define `capturedIndexDocModelIds: string[] = []`.
         * `[ ]`   Define `capturingIndexingService: IIndexingService` with `indexDocument: async (_sid, _cid, _content, _meta, embeddingModelApiIdentifier: string): Promise<IndexDocumentResult> => { capturedIndexDocModelIds.push(embeddingModelApiIdentifier); return { success: true, tokensUsed: 5 }; }`.
         * `[ ]`   Define `fixedEmbeddingClient: IEmbeddingClient` with `getEmbedding: async (_text, _modelId): Promise<EmbeddingResponse> => ({ embedding: Array(3072).fill(0.01), usage: { prompt_tokens: 4, total_tokens: 4 } })`.
         * `[ ]`   Build `{ client: dbClient }` from `createMockSupabaseClient(undefined, { genericMockResults: { dialectic_memory: { select: { data: [], error: null } } }, rpcResults: { match_dialectic_chunks: { data: [], error: null } } })`.
         * `[ ]`   Construct `deps: IRagServiceDependencies` with `dbClient`, `logger: new MockLogger()`, `indexingService: capturingIndexingService`, `embeddingClient: fixedEmbeddingClient`.
         * `[ ]`   Build `docs: IRagSourceDocument[] = [{ id: 'int-doc-1', content: 'content one' }, { id: 'int-doc-2', content: 'content two' }]`.
         * `[ ]`   Call `await new RagService(deps).getContextForModel(docs, { api_identifier: 'model-x', input_token_cost_rate: 1, output_token_cost_rate: 1, tokenization_strategy: { type: 'none' }, provider_max_input_tokens: 8192 }, 'int-session', 'thesis', [], 'index-model-slug')`.
         * `[ ]`   Assert `capturedIndexDocModelIds.length === 2` — both unindexed documents were indexed.
         * `[ ]`   Assert `capturedIndexDocModelIds.every(id => id === 'index-model-slug')` — the model identifier from `getContextForModel` was passed unchanged to every `indexDocument` call.
      * `[ ]`   Integration test `"integration: embeddingModelApiIdentifier is forwarded to IEmbeddingClient.getEmbedding on every retrieval query"`:
         * `[ ]`   Define `capturedEmbedModelIds: string[] = []`.
         * `[ ]`   Define `capturingEmbeddingClient: IEmbeddingClient` with `getEmbedding: async (_text, embeddingModelApiIdentifier: string): Promise<EmbeddingResponse> => { capturedEmbedModelIds.push(embeddingModelApiIdentifier); return { embedding: Array(3072).fill(0.01), usage: { prompt_tokens: 3, total_tokens: 3 } }; }`.
         * `[ ]`   Build `{ client: dbClient }` from `createMockSupabaseClient(undefined, { genericMockResults: { dialectic_memory: { select: { data: [], error: null } } }, rpcResults: { match_dialectic_chunks: { data: [], error: null } } })`.
         * `[ ]`   Build `noopIndexingService: IIndexingService` with `indexDocument: async () => ({ success: true, tokensUsed: 0 })`.
         * `[ ]`   Construct `deps: IRagServiceDependencies` with `dbClient`, `logger: new MockLogger()`, `indexingService: noopIndexingService`, `embeddingClient: capturingEmbeddingClient`.
         * `[ ]`   Call `await new RagService(deps).getContextForModel([], { api_identifier: 'model-y', input_token_cost_rate: 1, output_token_cost_rate: 1, tokenization_strategy: { type: 'none' }, provider_max_input_tokens: 8192 }, 'int-session-2', 'synthesis', [], 'embed-model-slug')`.
         * `[ ]`   Assert `capturedEmbedModelIds.length >= 1` — the embedding client was called at least once for retrieval queries.
         * `[ ]`   Assert `capturedEmbedModelIds.every(id => id === 'embed-model-slug')` — the model identifier was forwarded unchanged to every `getEmbedding` call.
      * `[ ]`   Integration test `"integration: RagService.getContextForModel satisfies IRagService boundary with updated 6-arg signature"`:
         * `[ ]`   Construct minimal `RagService` with fixed embedding client and noop indexing service.
         * `[ ]`   Cast it as `import type { IRagService } from './rag_service.interface.ts'` to assert the class satisfies the updated interface at the call site level.
         * `[ ]`   Call the boundary method with the new 6-arg signature and assert `typeof result.context === 'string' || result.error instanceof Error` — either a valid context or a typed error is produced; the chain does not throw unhandled exceptions.

   * `[ ]`   `directionality`
      * `[ ]`   Node layer is shared infrastructure service — `rag_service.ts` consumes `IEmbeddingClient` and `IIndexingService` contracts and exposes `IRagService` to orchestration callers.
      * `[ ]`   Dependencies remain inward-facing: `indexing_service.interface.ts` contracts, Supabase client, logger, token wallet.
      * `[ ]`   Outward API is `IRagService.getContextForModel` with the new 6th parameter; callers (e.g., `prepareModelJob.ts`) must supply `embeddingModelApiIdentifier`.
      * `[ ]`   Cross-node impact (not in this node's scope — reported as discovery): any caller of `IRagService.getContextForModel` must add `embeddingModelApiIdentifier` as the 6th argument. The primary caller is `prepareModelJob.ts` (Workstream C). That call site update is out of scope for Workstream E and belongs in a `prepareModelJob.ts` fixup node or Workstream C node if not already addressed.
      * `[ ]`   No cycles introduced with `vector_utils.ts`, `indexing_service.ts`, or any Workstream C module.

   * `[ ]`   `requirements`
      * `[ ]`   `IRagService.getContextForModel` requires `embeddingModelApiIdentifier: string` as its sixth parameter; `MockRagService` satisfies the updated interface.
      * `[ ]`   `RagService.getContextForModel` threads `embeddingModelApiIdentifier` into `ensureDocumentsAreIndexed` → `indexDocument` (5th arg) and `performAdvancedRetrieval` → `getEmbedding` (2nd arg) at both call sites.
      * `[ ]`   RAG query debit idempotency keys include `embeddingModelApiIdentifier` as a segment, ensuring distinct debit keys per model.
      * `[ ]`   All fourteen `service.getContextForModel(...)` call sites in `rag_service.test.ts` compile with the updated 6-arg signature; all existing assertions remain GREEN.
      * `[ ]`   `WrongDimEmbeddingClient` and the two `stub` callbacks with named parameters compile against the updated interfaces.
      * `[ ]`   Integration test `rag_service.integration.test.ts` proves that `embeddingModelApiIdentifier` is forwarded end-to-end from `getContextForModel` to both `IIndexingService.indexDocument` and `IEmbeddingClient.getEmbedding`, satisfying the Workstream E producer→consumer chain.
      * `[ ]`   Node scope is limited to `rag_service.ts`, `rag_service.interface.ts`, `rag_service.mock.ts`, `rag_service.test.ts`, and the new `rag_service.integration.test.ts`; no other source file is modified in this node.

   * `[ ]`   **Commit** `feat(supabase-shared): complete embedding path normalization — explicit model identifier at all indexing, embedding, and RAG call sites`
      * `[ ]`   Structural changes:
         * `[ ]`   Workstream D: `applyCompressionOverlay.ts` (new function) wired into `gatherArtifacts.ts` pipeline via `stageSlug` param and `applyCompressionOverlay` dep; `processSimpleJob.ts` call site updated.
         * `[ ]`   Workstream E: `IEmbeddingClient.getEmbedding`, `IIndexingService.indexDocument`, `ICompressionStrategy` params (`CompressionStrategyParams`), and `IRagService.getContextForModel` all gain an explicit `embeddingModelApiIdentifier` parameter; all internal call sites and test suites updated.
      * `[ ]`   Behavioral changes:
         * `[ ]`   Compression artifact overlay is applied in-memory after artifact gather, swapping content for fresh-fingerprint matches while preserving canonical identity fields.
         * `[ ]`   Embedding model identifier is explicit at every embedding and indexing call boundary; no embedding call defaults to an implicit model.
         * `[ ]`   RAG query debit idempotency keys now include the model slug, ensuring distinct billing records when the embedding model changes.
      * `[ ]`   Contract changes:
         * `[ ]`   `GatherArtifactsDeps.applyCompressionOverlay` and `GatherArtifactsParams.stageSlug` are newly required fields.
         * `[ ]`   `CompressionStrategyParams.embeddingModelApiIdentifier: string`, `IEmbeddingClient.getEmbedding` 2-arg, `IIndexingService.indexDocument` 5-arg, and `IRagService.getContextForModel` 6-arg are all breaking contract changes for existing call sites outside Workstream E scope.

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