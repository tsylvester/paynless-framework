[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement


## Objectives

## Expected Outcome

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure
## Chain 1: Complete Stage Recipe — Return the entire map

### Problem
`getStageRecipe.ts` filters steps at two points: (1) line 122-131 drops all steps whose `output_type` is not a `ModelContributionFileType` (removes RENDER steps with `rendered_document`), and (2) line 137-140 drops EXECUTE steps whose `output_type` is not an `OutputType` (removes intermediate EXECUTE steps with `assembled_document_json`, `pairwise_synthesis_chunk`, etc.). Edges referencing filtered-out step IDs become dangling. `dagLayout.ts:73` skips edges with missing endpoints. The FE draws an incomplete, disconnected graph.

Additionally, the FE type contract `DialecticStageRecipeStep` in `dialectic.types.ts` cannot represent the data the BE sends even today. `RecipeOutputType` is a 3-value union but the BE sends 30+ distinct `output_type` values. `RecipePromptType` is missing `'Seed'` and `'Continuation'`. `RecipeGranularity` is missing `'pairwise_by_origin'`, `'per_source_group'`, `'per_source_document_by_lineage'`, `'per_model'`. The FE type contract is broken at the API boundary and every consumer downstream inherits wrong types.

### Objective
The BE sends ALL steps and ALL edges for the active recipe instance. The FE type contract matches the BE response exactly. The FE receives and displays the complete DAG structure. No steps are dropped. No edges dangle. No type mismatches exist between BE response and FE types.

### Expected Outcome
`StageDAGProgressDialog` renders every node (PLAN, EXECUTE, RENDER, intermediate) with every edge connected. The FE type `DialecticStageRecipeStep` correctly represents every possible step the BE can send.

### Passthrough verification
- `dialectic.api.ts:fetchStageRecipe` — sorts steps by `execution_order` then `step_key`, no filtering, no type-dependent branching, passthrough confirmed, no code change required, inherits corrected types via `DialecticStageRecipe`
- `dialecticStore.ts:fetchStageRecipe` — stores recipe in `recipesByStageSlug[stageSlug]`, no filtering, no type-dependent branching, passthrough confirmed, no code change required, inherits corrected types via `DialecticStageRecipe`
- `dialecticStore.ts:ensureRecipeForActiveStage` — iterates `recipe.steps` and initializes `stepStatuses[step.step_key] = 'not_started'` for each step, already handles arbitrary steps, no code change required; with the complete recipe this correctly initializes statuses for ALL step types
- `StageDAGProgressDialog.tsx` — reads `recipe` from store, passes `recipe.steps` and `recipe.edges` to `computeDAGLayout`, colors nodes by step status, no type-dependent branching on `output_type` / `prompt_type` / `granularity_strategy`, no code change required, inherits corrected types via `DialecticStageRecipeStep`

*   `[✅]`   `supabase/functions/dialectic-service/getStageRecipe` **[BE] Return complete stage recipe without step filtering**
    *   `[✅]`   `objective`
        *   `[✅]`   Remove both output_type filter blocks so ALL steps from `dialectic_stage_recipe_steps` for the active instance are returned regardless of `output_type` or `job_type`
        *   `[✅]`   Retain the `isFileType` validation (line 117-119) — invalid output_type values are genuine data integrity errors and must still produce a 500 response
        *   `[✅]`   ALL edges from `dialectic_stage_recipe_edges` for the active instance are returned (already the case, no change needed)
        *   `[✅]`   No new defaults, fallbacks, or data healing introduced
    *   `[✅]`   `role`
        *   `[✅]`   Adapter: reads from DB, validates, produces DTO response for the API layer
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic service — stage recipe retrieval
        *   `[✅]`   Bounded context: DB recipe data → validated `StageRecipeResponse` DTO
    *   `[✅]`   `deps`
        *   `[✅]`   `dialectic.interface.ts` (domain) — provides `StageRecipeResponse`, `StageRecipeStepDto`, `ProgressRecipeEdge`, `JobType`, `PromptType`, `GranularityStrategy`, `BranchKey`, `InputRule`, `RelevanceRule`, `OutputRule` — inward dependency
        *   `[✅]`   `type_guards.dialectic.recipe.ts` (app) — provides `isInputRule`, `isRelevanceRule`, `isOutputRule` — inward dependency
        *   `[✅]`   `type_guards.common.ts` (app) — provides `isRecord` — inward dependency
        *   `[✅]`   `type_guards.file_manager.ts` (app) — provides `isFileType` (retained); `isModelContributionFileType` and `isOutputType` no longer needed — inward dependency
        *   `[✅]`   `file_manager.types.ts` (domain) — provides `FileType` (needed for widened `StageRecipeStepDto.output_type`) — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `SupabaseClient<Database>` — database reads for stages, steps, edges
        *   `[✅]`   `payload: { stageSlug: string }` — input parameter
        *   `[✅]`   Return type: `{ status: number; data?: StageRecipeResponse; error?: { message: string } }`
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   `StageRecipeStepDto.output_type`: change from `ModelContributionFileTypes` to `FileType` — with filters removed, RENDER steps (`FileType.RenderedDocument`) and any other non-`ModelContributionFileType` output types must be representable; `FileType` is already imported (line 22)
    *   `[✅]`   unit/`getStageRecipe.test.ts`
        *   `[✅]`   UPDATE "rejects invalid 'rendered_document' output_type" (line 432-493): change to assert 200 with the RENDER step INCLUDED — `rendered_document` is a valid `FileType` and must no longer be rejected
        *   `[✅]`   UPDATE "filters out EXECUTE step with backend-only 'assembled_document_json'" (line 495-609): change to assert `steps.length === 2` — BOTH the `assembled_document_json` step AND the `product_requirements` step are included
        *   `[✅]`   ADD test: RENDER step with `output_type: 'rendered_document'` and `job_type: 'RENDER'` is included in the response with correct DTO fields
        *   `[✅]`   ADD test: mixed recipe with PLAN (`header_context`), intermediate EXECUTE (`assembled_document_json`), document EXECUTE (`business_case`), and RENDER (`rendered_document`) — all four returned, sorted, all edges present
        *   `[✅]`   ADD test: step with invalid output_type (not a valid `FileType`) still returns 500
        *   `[✅]`   RETAIN all other existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   DTO construction uses `rawType` (narrowed to `FileType` by `isFileType` guard) directly, replacing removed `mappedOutputType`
        *   `[✅]`   No factory changes, no defaults, no backfilling
    *   `[✅]`   `getStageRecipe.ts`
        *   `[✅]`   Remove lines 122-132: the `!isModelContributionFileType(rawType)` filter block
        *   `[✅]`   Remove lines 134-135: the `mappedOutputType` assignment
        *   `[✅]`   Remove lines 137-140: the `jobType === "EXECUTE" && !isOutputType(mappedOutputType)` filter block
        *   `[✅]`   Line 218: change `output_type: mappedOutputType` to `output_type: rawType`
        *   `[✅]`   Remove unused imports: `ModelContributionFileTypes` (line 17), `isModelContributionFileType`, `isOutputType` (line 18) — retain `isFileType`
        *   `[✅]`   Retain: `isFileType` validation at lines 117-119, all other validation logic
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter (database → DTO)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing
    *   `[✅]`   `requirements`
        *   `[✅]`   ALL steps returned regardless of `output_type` or `job_type`
        *   `[✅]`   ALL edges returned
        *   `[✅]`   Invalid `output_type` (not `FileType`) still produces 500
        *   `[✅]`   `StageRecipeStepDto.output_type` widened to `FileType`
        *   `[✅]`   No defaults, fallbacks, or data healing

*   `[✅]`   `packages/api/src/dialectic.api.ts:fetchStageRecipe` **[API] Widen FE type contract, verify API client passes complete recipe**
    *   `[✅]`   `objective`
        *   `[✅]`   Update `dialectic.types.ts` FE type contract so `DialecticStageRecipeStep` matches the complete BE response
        *   `[✅]`   Verify `fetchStageRecipe` sorts all step types without filtering or dropping any
        *   `[✅]`   Verify the sorted response preserves edges and all step fields
    *   `[✅]`   `role`
        *   `[✅]`   Adapter: FE API boundary where BE data enters the FE type system
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic API client — recipe fetching
        *   `[✅]`   Bounded context: BE response → typed `DialecticStageRecipe` for FE consumption
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/types` (domain) — provides `DialecticStageRecipe`, `DialecticStageRecipeStep`, `RecipeOutputType`, `RecipePromptType`, `RecipeGranularity`, `RecipeJobType` — inward dependency
        *   `[✅]`   `apiClient` (adapter) — provides HTTP POST — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `stageSlug: string` — input parameter
        *   `[✅]`   Return type: `Promise<ApiResponse<DialecticStageRecipe>>`
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.types.ts`
        *   `[✅]`   `RecipeOutputType` (line 227): change from `'header_context' | 'assembled_document_json' | 'rendered_document'` to `string` — BE sends 30+ distinct `output_type` values (all `FileType` enum members); FE cannot import BE `FileType` enum; `string` is the narrowest type that correctly represents all valid values without cross-package coupling
        *   `[✅]`   `RecipePromptType` (line 226): change from `'Planner' | 'Turn'` to `'Seed' | 'Planner' | 'Turn' | 'Continuation'` — matches BE `PromptType` exactly
        *   `[✅]`   `RecipeGranularity` (line 228): change from `'all_to_one' | 'per_source_document' | 'one_to_many' | 'many_to_one'` to `'all_to_one' | 'per_source_document' | 'one_to_many' | 'many_to_one' | 'pairwise_by_origin' | 'per_source_group' | 'per_source_document_by_lineage' | 'per_model'` — adds 4 missing BE values, retains 2 existing FE values per preservation rules
        *   `[✅]`   `DialecticStageRecipeStep` (lines 252-268): no field additions or removals — fields inherit corrected types above
    *   `[✅]`   unit/`dialectic.api.test.ts` (or applicable test file)
        *   `[✅]`   ADD test: `fetchStageRecipe` receives a response containing PLAN, intermediate EXECUTE, document EXECUTE, and RENDER steps — all four steps present in returned data, sorted by `execution_order` then `step_key`
        *   `[✅]`   ADD test: response with steps using widened type values (`output_type: 'business_case'`, `prompt_type: 'Continuation'`, `granularity_strategy: 'pairwise_by_origin'`) — data passes through without transformation or loss
        *   `[✅]`   ADD test: edges array preserved intact alongside sorted steps
        *   `[✅]`   RETAIN all existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   No construction changes — API client deserializes JSON response into typed objects
    *   `[✅]`   `dialectic.api.ts`
        *   `[✅]`   No source code changes — `fetchStageRecipe` (lines 61-98) sorts steps by `execution_order` then `step_key` using `Array.sort`; does not filter, branch on, or inspect `output_type`, `prompt_type`, or `granularity_strategy`; spreads `response.data` preserving all fields including edges; verified correct for complete recipe
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter (BE response → FE typed data)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing
    *   `[✅]`   `requirements`
        *   `[✅]`   FE type contract matches BE response: `RecipeOutputType` = `string`, `RecipePromptType` = 4 values, `RecipeGranularity` = 8 values
        *   `[✅]`   `fetchStageRecipe` passes all step types through without filtering
        *   `[✅]`   Sort preserves all steps and edges
        *   `[✅]`   Tests prove complete recipe data flows through API client intact

*   `[✅]`   `packages/store/src/dialecticStore.ts:fetchStageRecipe` **[STORE] Verify store handles complete recipe for storage and step status initialization**
    *   `[✅]`   `objective`
        *   `[✅]`   Verify `fetchStageRecipe` stores the complete recipe in `recipesByStageSlug` without filtering or transformation
        *   `[✅]`   Verify `ensureRecipeForActiveStage` initializes `stepStatuses` entries for ALL step types (PLAN, intermediate EXECUTE, document EXECUTE, RENDER) when iterating `recipe.steps`
        *   `[✅]`   Verify idempotent path (existing progress entry) adds missing step keys for all step types without resetting existing values
    *   `[✅]`   `role`
        *   `[✅]`   App: state management — stores recipe data and initializes per-step progress tracking
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store — recipe storage and step status initialization
        *   `[✅]`   Bounded context: API response → `recipesByStageSlug` + `stageRunProgress[progressKey].stepStatuses`
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/types` (domain) — provides `DialecticStageRecipe`, `DialecticStageRecipeStep` — inward dependency
        *   `[✅]`   `@paynless/api` (adapter) — provides `dialectic().fetchStageRecipe()` — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `recipesByStageSlug: Record<string, DialecticStageRecipe>` — recipe storage
        *   `[✅]`   `stageRunProgress: Record<string, StageRunProgressEntry>` — per-step status tracking
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   unit/`dialecticStore.recipes.test.ts` (or applicable test file)
        *   `[✅]`   ADD test: `fetchStageRecipe` stores recipe containing PLAN, intermediate EXECUTE, document EXECUTE, and RENDER steps — all four steps present in `recipesByStageSlug[stageSlug].steps`
        *   `[✅]`   ADD test: `ensureRecipeForActiveStage` creates `stepStatuses` entries for ALL step types — verify keys for PLAN step (`step_key`), intermediate EXECUTE step, document EXECUTE step, RENDER step all exist with value `'not_started'`
        *   `[✅]`   ADD test: `ensureRecipeForActiveStage` idempotent path — existing progress entry gains new step keys for newly-visible step types without resetting existing completed/in_progress values
        *   `[✅]`   RETAIN all existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   No construction changes — store sets recipe from API response, iterates `recipe.steps` for status initialization
    *   `[✅]`   `dialecticStore.ts`
        *   `[✅]`   No source code changes — `fetchStageRecipe` (lines 2745-2757) stores `response.data` directly in `recipesByStageSlug[stageSlug]` without filtering or transformation; `ensureRecipeForActiveStage` (lines 2759-2788) iterates `recipe.steps` and initializes `stepStatuses[step.step_key] = 'not_started'` for each step; both functions handle arbitrary step types because they operate on `step_key` strings without branching on `output_type`, `prompt_type`, or `granularity_strategy`; verified correct for complete recipe
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: app (state management)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing
    *   `[✅]`   `requirements`
        *   `[✅]`   Complete recipe stored without filtering
        *   `[✅]`   Step statuses initialized for ALL step types
        *   `[✅]`   Idempotent initialization preserves existing statuses
        *   `[✅]`   Tests prove store handles complete recipe data

*   `[✅]`   `apps/web/src/components/dialectic/dagLayout` **[UI] Verify layout engine computes correct positions for complete recipe**
    *   `[✅]`   `objective`
        *   `[✅]`   Verify `computeDAGLayout` correctly positions nodes for ALL step types (PLAN, intermediate EXECUTE, document EXECUTE, RENDER)
        *   `[✅]`   Verify edges connecting all step types produce correct edge positions with no edges skipped
        *   `[✅]`   Verify line 73 guard (`if (!stepIds.has(e.from_step_id) || !stepIds.has(e.to_step_id)) continue`) is a no-op when all steps are present — no edges silently dropped
    *   `[✅]`   `role`
        *   `[✅]`   Port: pure layout computation — takes typed recipe steps and edges, returns positioned graph
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic DAG layout computation
        *   `[✅]`   Bounded context: `DAGLayoutParams` → `DAGLayoutResult`
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/types` (domain) — provides `DAGLayoutParams`, `DAGLayoutResult`, `DAGNodePosition`, `DAGEdgePosition`, `DialecticStageRecipeStep` — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `DAGLayoutParams` — steps array, edges array, node dimensions, optional viewport
        *   `[✅]`   Return type: `DAGLayoutResult` — positioned nodes, positioned edges, total dimensions
    *   `[✅]`   unit/`dagLayout.test.ts`
        *   `[✅]`   ADD test: complete recipe with PLAN step (`job_type: 'PLAN'`, `output_type: 'header_context'`, `prompt_type: 'Planner'`), intermediate EXECUTE step (`job_type: 'EXECUTE'`, `output_type: 'assembled_document_json'`, `granularity_strategy: 'per_source_document'`), document EXECUTE step (`job_type: 'EXECUTE'`, `output_type: 'business_case'`), and RENDER step (`job_type: 'RENDER'`, `output_type: 'rendered_document'`) — all four steps produce nodes at correct layer positions
        *   `[✅]`   ADD test: edges PLAN→EXECUTE→EXECUTE→RENDER all produce edge positions — `resultEdges.length` equals input edges count, no edges dropped by line 73 guard
        *   `[✅]`   ADD test: step with `prompt_type: 'Continuation'` and `granularity_strategy: 'pairwise_by_origin'` produces correctly positioned node — widened types compile and function
        *   `[✅]`   RETAIN all existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   No construction changes
    *   `[✅]`   `dagLayout.ts`
        *   `[✅]`   No source code changes — `computeDAGLayout` reads `step.id`, `step.step_key`, `step.step_name`, `step.job_type` for node construction; does not branch on `output_type`, `prompt_type`, or `granularity_strategy`; handles arbitrary step counts and edge configurations; line 73 guard is defensive against data integrity issues and becomes a no-op when all referenced steps are present; verified correct for complete recipe
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: UI (presentation utility)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing
    *   `[✅]`   `requirements`
        *   `[✅]`   All step types produce correctly positioned nodes
        *   `[✅]`   All edges between present steps produce edge positions
        *   `[✅]`   No edges silently dropped when all steps are present
        *   `[✅]`   Tests prove layout computation handles complete recipe

*   `[✅]`   `apps/web/src/components/dialectic/StageDAGProgressDialog` **[UI] Verify dialog renders complete DAG and colors all step types by status**
    *   `[✅]`   `objective`
        *   `[✅]`   Verify dialog reads complete recipe from `recipesByStageSlug[stageSlug]` and passes ALL steps and edges to `computeDAGLayout`
        *   `[✅]`   Verify `statusByStepKey` map contains entries for all step types — PLAN, intermediate EXECUTE, document EXECUTE — and each is colored by its status from `unifiedProgress.stageDetails` (RENDER is a job type, not a step type; no recipe step has job_type RENDER)
        *   `[✅]`   Verify auto-close logic (`hasRenderedCompleted`) remains correct — closes when rendered documents arrive, unaffected by presence of non-document step types
        *   `[✅]`   Verify SVG renders correct number of `<rect>` nodes and `<line>` edges for complete recipe
    *   `[✅]`   `role`
        *   `[✅]`   UI: renders the DAG visualization dialog with status-colored nodes
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic DAG progress dialog
        *   `[✅]`   Bounded context: recipe + step statuses → SVG DAG visualization
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/store` (app) — provides `useDialecticStore`, `selectUnifiedProjectProgress`, `selectStageRunProgress` — inward dependency
        *   `[✅]`   `@paynless/types` (domain) — provides `StageDAGProgressDialogProps`, `UnifiedProjectStatus`, `StageRunDocumentDescriptor`, `DAGNodePosition`, `DAGEdgePosition` — inward dependency
        *   `[✅]`   `dagLayout.ts` (port) — provides `computeDAGLayout` — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Props: `open`, `onOpenChange`, `stageSlug`, `sessionId`, `iterationNumber`
        *   `[✅]`   Store reads: `recipesByStageSlug[stageSlug]`, `selectUnifiedProjectProgress`, `selectStageRunProgress`
    *   `[✅]`   unit/`StageDAGProgressDialog.test.tsx`
        *   `[✅]`   ADD test: dialog renders with complete recipe (PLAN, intermediate EXECUTE, document EXECUTE steps with connecting edges) — verify SVG contains `<rect>` for each step and `<line>` for each edge
        *   `[✅]`   ADD test: each step type receives correct status color from `statusByStepKey` — PLAN step in_progress gets amber, EXECUTE step not_started gets gray, etc.
        *   `[✅]`   ADD test: auto-close fires when rendered document descriptor appears in `documents` — unaffected by presence of PLAN/intermediate EXECUTE steps in recipe
        *   `[✅]`   ADD test: dialog does NOT auto-close when only PLAN or EXECUTE steps are completed but no rendered document exists
        *   `[✅]`   RETAIN all existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   No construction changes
    *   `[✅]`   `StageDAGProgressDialog.tsx`
        *   `[✅]`   No source code changes — component reads `recipe` from store (line 36), passes `recipe.steps` and `recipe.edges` to `computeDAGLayout` (line 51) without filtering; builds `statusByStepKey` from `unifiedProgress.stageDetails` (lines 54-62) mapping `stepKey→status` for any step type; renders each node with `STATUS_FILL[status]` color (line 115) without branching on `output_type`, `prompt_type`, or `granularity_strategy`; auto-close (lines 64-70) checks `documents` from `stageRunProgress` which is independent of recipe step types; verified correct for complete recipe
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: UI (presentation)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing (user-visible dialog)
    *   `[✅]`   `requirements`
        *   `[✅]`   All step types rendered as SVG nodes with correct status colors
        *   `[✅]`   All edges rendered as SVG lines
        *   `[✅]`   Auto-close unaffected by non-document step types
        *   `[✅]`   Tests prove dialog renders complete DAG correctly
    *   `[✅]`   **Commit** `fix(dialectic): return and type complete stage recipe end-to-end`
        *   `[✅]`   Removed `isModelContributionFileType` filter in `getStageRecipe.ts` that dropped steps with non-ModelContribution output types
        *   `[✅]`   Removed `isOutputType` filter in `getStageRecipe.ts` that dropped intermediate EXECUTE steps
        *   `[✅]`   Widened `StageRecipeStepDto.output_type` from `ModelContributionFileTypes` to `FileType` in `dialectic.interface.ts`
        *   `[✅]`   Widened `RecipeOutputType` to `string`, `RecipePromptType` to 4 values, `RecipeGranularity` to 8 values in `dialectic.types.ts`
        *   `[✅]`   Updated BE tests to assert all step types included
        *   `[✅]`   Added FE tests across API client, store, layout engine, and dialog verifying complete recipe flows through every link in the chain

## Chain 2: Complete Stage Progress — Return all jobs and edges

### Problem
`getAllStageProgress.ts` fetches ALL jobs from `dialectic_generation_jobs` (line 187-206). `deriveStepStatuses` reduces these to one `UnifiedStageStatus` per step key, discarding individual jobs. `buildDocumentDescriptors` emits only completed RENDER jobs as document descriptors — this is correct for documents. The response type `StageProgressEntry` carries `steps: StepProgressDto[]` (flat `{stepKey, status}`) and `documents: StageDocumentDescriptorDto[]` (only completed RENDER docs). Edges are computed internally (lines 482-535) but not included in the response. Individual jobs are fetched but reduced to aggregated step statuses. The FE receives aggregated step-level statuses and rendered document descriptors only — no individual job data, no edges from the progress endpoint, no model assignments per job.

`hydrateAllStageProgressLogic` (line 1673) writes `stepStatuses[stepKey]` and rendered document descriptors. The `jobProgress` and `modelJobStatuses` fields in `StageRunProgressSnapshot` are only populated by realtime notification handlers during live execution and are lost on page refresh.

### Objective
The BE sends ALL individual jobs for each stage AND the recipe edges for each stage in the `getAllStageProgress` response. The FE receives, validates, and stores the complete job data. On page load (hydration), the store contains every job for every step so the FE knows exactly where the user is on the map, what work has been completed, and what remains. `jobProgress` and `modelJobStatuses` are derived from the hydrated jobs so they survive page refresh.

### Expected Outcome
`stageRunProgress[progressKey].jobs` contains every `JobProgressDto` for the stage. `stageRunProgress[progressKey].jobProgress` and `modelJobStatuses` are populated from the hydrated jobs, not just from realtime. Downstream consumers have a complete, correct data source for model assignments, per-job statuses, and step-level progress regardless of whether the data arrived via hydration or realtime.

### Passthrough verification
- `dialectic.api.ts:getAllStageProgress` (line 660) — posts to `dialectic-service` with `action: 'getAllStageProgress'`, deserializes JSON response typed as `GetAllStageProgressResponse`, no filtering, no transformation, no type-dependent branching, passthrough confirmed, no code change required, inherits corrected types via updated FE `StageProgressEntry` and `GetAllStageProgressResponse`
- `DialecticApiClient` interface in `dialectic.types.ts` (lines 1066-1102) — `getAllStageProgress` is implemented on the API class (line 660) but NOT declared on the `DialecticApiClient` interface; this is a pre-existing gap not introduced by or addressed by this chain fix

---

*   `[✅]`   `supabase/functions/dialectic-service/buildJobProgressDtos` **[BE] New: Extract individual job progress DTOs from raw job rows**
    *   `[✅]`   `objective`
        *   `[✅]`   Create a new function that transforms raw `DialecticJobRow[]` into `JobProgressDto[]` grouped by `stageSlug`
        *   `[✅]`   Extract `stepKey` from `payload.planner_metadata.recipe_step_id` via `stepIdToStepKey` lookup
        *   `[✅]`   Extract `modelId` from `payload.model_id`
        *   `[✅]`   Extract `documentKey` from `payload.documentKey` (null when absent)
        *   `[✅]`   Include ALL job types (PLAN, EXECUTE, RENDER) — no filtering by `job_type`
        *   `[✅]`   Include ALL job statuses (pending, processing, completed, failed, paused_nsf, superseded, retrying, waiting_for_prerequisite, waiting_for_children) — no filtering by `status`
        *   `[✅]`   No defaults, fallbacks, or data healing
    *   `[✅]`   `role`
        *   `[✅]`   Domain: pure transformation — raw DB rows → typed DTOs
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic service — job progress DTO construction
        *   `[✅]`   Bounded context: `DialecticJobRow[]` + `stepIdToStepKey` → `Map<string, JobProgressDto[]>` keyed by stageSlug
    *   `[✅]`   `deps`
        *   `[✅]`   `dialectic.interface.ts` (domain) — provides `DialecticJobRow`, `JobProgressDto`, `BuildJobProgressDtosDeps`, `BuildJobProgressDtosParams` — inward dependency
        *   `[✅]`   `type_guards.common.ts` (app) — provides `isRecord` for payload extraction — inward dependency
        *   `[✅]`   `type_guards.dialectic.ts` (app) — provides `isPlannerMetadata` for `planner_metadata` extraction — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `jobs: DialecticJobRow[]` — all raw job rows for the session/iteration
        *   `[✅]`   `stepIdToStepKey: Map<string, string>` — recipe step ID → step key mapping
        *   `[✅]`   Return type: `Map<string, JobProgressDto[]>` — keyed by `stageSlug`
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   Add `JobProgressDto` interface:
            *   `[✅]`   `id: string` — job identifier
            *   `[✅]`   `status: string` — current job status (pending, processing, completed, failed, paused_nsf, superseded, retrying, etc.)
            *   `[✅]`   `jobType: JobType | null` — PLAN, EXECUTE, or RENDER (nullable per DB schema)
            *   `[✅]`   `stepKey: string | null` — derived from `payload.planner_metadata.recipe_step_id` via `stepIdToStepKey`; null when payload lacks planner_metadata
            *   `[✅]`   `modelId: string | null` — from `payload.model_id`; null when absent (e.g. some PLAN jobs)
            *   `[✅]`   `documentKey: string | null` — from `payload.documentKey`; null when absent (e.g. PLAN jobs, some EXECUTE jobs)
            *   `[✅]`   `parentJobId: string | null` — from `parent_job_id` column
            *   `[✅]`   `createdAt: string` — ISO timestamp
            *   `[✅]`   `startedAt: string | null` — ISO timestamp or null
            *   `[✅]`   `completedAt: string | null` — ISO timestamp or null
        *   `[✅]`   Add `BuildJobProgressDtosDeps` interface (empty — pure function, no external deps)
        *   `[✅]`   Add `BuildJobProgressDtosParams` interface:
            *   `[✅]`   `jobs: DialecticJobRow[]`
            *   `[✅]`   `stepIdToStepKey: Map<string, string>`
    *   `[✅]`   unit/`buildJobProgressDtos.test.ts`
        *   `[✅]`   Test: job with complete `planner_metadata.recipe_step_id` in payload produces DTO with correct `stepKey` from `stepIdToStepKey` lookup
        *   `[✅]`   Test: job with `model_id` in payload produces DTO with correct `modelId`
        *   `[✅]`   Test: job with `documentKey` in payload produces DTO with correct `documentKey`
        *   `[✅]`   Test: job without `planner_metadata` produces DTO with `stepKey: null`
        *   `[✅]`   Test: job without `model_id` produces DTO with `modelId: null`
        *   `[✅]`   Test: job without `documentKey` produces DTO with `documentKey: null`
        *   `[✅]`   Test: PLAN job (job_type='PLAN') is included in output — not filtered
        *   `[✅]`   Test: EXECUTE job (job_type='EXECUTE') is included in output — not filtered
        *   `[✅]`   Test: RENDER job (job_type='RENDER') is included in output — not filtered
        *   `[✅]`   Test: job with status 'failed' is included — not filtered by status
        *   `[✅]`   Test: job with status 'superseded' is included — not filtered by status
        *   `[✅]`   Test: job with status 'paused_nsf' is included — not filtered by status
        *   `[✅]`   Test: multiple jobs across two `stage_slug` values are grouped correctly in the returned `Map<string, JobProgressDto[]>`
        *   `[✅]`   Test: `parentJobId` is correctly mapped from `parent_job_id` column
        *   `[✅]`   Test: `createdAt`, `startedAt`, `completedAt` are correctly mapped from DB columns
        *   `[✅]`   Test: empty jobs array produces empty map
    *   `[✅]`   `construction`
        *   `[✅]`   Each `JobProgressDto` is constructed as a complete object from extracted fields — no partial construction, no spreading raw DB rows
        *   `[✅]`   Payload field extraction uses `isRecord` and `isPlannerMetadata` guards — no casting
        *   `[✅]`   No factory changes, no defaults, no backfilling
    *   `[✅]`   `buildJobProgressDtos.ts`
        *   `[✅]`   Iterate all jobs in `params.jobs`
        *   `[✅]`   For each job: extract `stepKey` by reading `payload.planner_metadata.recipe_step_id` (guarded by `isRecord` + `isPlannerMetadata`) then looking up in `params.stepIdToStepKey`; null if extraction fails
        *   `[✅]`   For each job: extract `modelId` from `payload.model_id` (guarded by `isRecord`); null if absent
        *   `[✅]`   For each job: extract `documentKey` from `payload.documentKey` (guarded by `isRecord`); null if absent
        *   `[✅]`   Construct complete `JobProgressDto` with all fields from DB columns and extracted payload fields
        *   `[✅]`   Group into `Map<string, JobProgressDto[]>` keyed by `job.stage_slug`
        *   `[✅]`   Return the map
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain (pure transformation)
        *   `[✅]`   Dependencies inward-facing (types, guards)
        *   `[✅]`   Provides outward-facing (consumed by `getAllStageProgress`)
    *   `[✅]`   `requirements`
        *   `[✅]`   ALL jobs included regardless of `job_type` or `status`
        *   `[✅]`   `stepKey` correctly derived from payload planner_metadata via stepIdToStepKey lookup
        *   `[✅]`   `modelId` correctly extracted from payload
        *   `[✅]`   `documentKey` correctly extracted from payload
        *   `[✅]`   Jobs grouped by `stageSlug` in returned map
        *   `[✅]`   No defaults, fallbacks, or data healing
        *   `[✅]`   Tests prove every job type, every status, and every payload shape is handled

*   `[✅]`   `supabase/functions/dialectic-service/getAllStageProgress` **[BE] Return complete job data and edges in stage progress response**
    *   `[✅]`   `objective`
        *   `[✅]`   Add `jobs: JobProgressDto[]` field to `StageProgressEntry` response for each stage
        *   `[✅]`   Add `edges: ProgressRecipeEdge[]` field to `StageProgressEntry` response for each stage
        *   `[✅]`   Call `buildJobProgressDtos` (injected dependency) to produce job DTOs from fetched jobs
        *   `[✅]`   Include the per-stage edges already computed internally (lines 482-535) in the response
        *   `[✅]`   Update `GetAllStageProgressDeps` to accept `buildJobProgressDtos` as injected dependency
        *   `[✅]`   No existing fields removed or modified — additive only
    *   `[✅]`   `role`
        *   `[✅]`   Adapter: reads from DB, validates, produces DTO response for the API layer
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic service — stage progress retrieval
        *   `[✅]`   Bounded context: DB jobs + recipe structure → `GetAllStageProgressResponse` with complete job data and edges
    *   `[✅]`   `deps`
        *   `[✅]`   `dialectic.interface.ts` (domain) — provides `StageProgressEntry`, `JobProgressDto`, `ProgressRecipeEdge`, `GetAllStageProgressDeps`, `BuildJobProgressDtosDeps`, `BuildJobProgressDtosParams` — inward dependency
        *   `[✅]`   `buildJobProgressDtos.ts` (domain) — injected via `GetAllStageProgressDeps.buildJobProgressDtos` — inward dependency
        *   `[✅]`   `deriveStepStatuses.ts` (domain) — existing injected dependency, unchanged — inward dependency
        *   `[✅]`   `buildDocumentDescriptors.ts` (domain) — existing injected dependency, unchanged — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `GetAllStageProgressDeps` — add `buildJobProgressDtos` field
        *   `[✅]`   `StageProgressEntry` — add `jobs: JobProgressDto[]` and `edges: ProgressRecipeEdge[]`
        *   `[✅]`   Return type: `GetAllStageProgressResult` (unchanged shape, enriched content)
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.interface.ts`
        *   `[✅]`   Update `StageProgressEntry`: add `jobs: JobProgressDto[]` field
        *   `[✅]`   Update `StageProgressEntry`: add `edges: ProgressRecipeEdge[]` field
        *   `[✅]`   Update `GetAllStageProgressDeps`: add `buildJobProgressDtos: (deps: BuildJobProgressDtosDeps, params: BuildJobProgressDtosParams) => Map<string, JobProgressDto[]>` field
    *   `[✅]`   unit/`getAllStageProgress.test.ts`
        *   `[✅]`   ADD test: response `stages[].jobs` contains `JobProgressDto[]` with correct fields derived from raw job rows — `id`, `status`, `jobType`, `stepKey`, `modelId`, `documentKey`, `parentJobId`, `createdAt`, `startedAt`, `completedAt`
        *   `[✅]`   ADD test: `stages[].jobs` includes ALL job types (PLAN, EXECUTE, RENDER) — not just RENDER
        *   `[✅]`   ADD test: `stages[].jobs` includes jobs in ALL statuses (pending, completed, failed, paused_nsf) — not just completed
        *   `[✅]`   ADD test: response `stages[].edges` contains `ProgressRecipeEdge[]` matching the recipe edges for that stage
        *   `[✅]`   ADD test: stage with no jobs returns empty `jobs: []` array (not null, not omitted)
        *   `[✅]`   ADD test: stage with no edges returns empty `edges: []` array (not null, not omitted)
        *   `[✅]`   ADD test: existing `steps` and `documents` fields are unchanged in the response — additive only
        *   `[✅]`   UPDATE existing tests: mock `buildJobProgressDtos` in `GetAllStageProgressDeps` alongside existing mocked deps
        *   `[✅]`   RETAIN all existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   `StageProgressEntry` objects constructed with all fields including new `jobs` and `edges`
        *   `[✅]`   No partial construction, no optional fields on `StageProgressEntry`
    *   `[✅]`   `getAllStageProgress.ts`
        *   `[✅]`   Call `deps.buildJobProgressDtos({}, { jobs: jobsData, stepIdToStepKey })` once before the stage loop (follows existing `deps.buildDocumentDescriptors` pattern at line 705)
        *   `[✅]`   In the stage loop: retrieve per-stage jobs from the returned map using `stageSlug` key (follows existing `documentsByStageSlug.get(stageSlug)` pattern at line 730)
        *   `[✅]`   In the stage loop: include the already-computed `edges` array for each stage in the `StageProgressEntry` (the `edges` variable at line 752-775 is already available in scope)
        *   `[✅]`   Add `jobs: stageJobDtos` and `edges: edges` to both `StageProgressEntry` construction sites (lines 869-876 and 878-886)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter (database → DTO)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing
    *   `[✅]`   `requirements`
        *   `[✅]`   `StageProgressEntry` contains `jobs: JobProgressDto[]` for every stage
        *   `[✅]`   `StageProgressEntry` contains `edges: ProgressRecipeEdge[]` for every stage
        *   `[✅]`   `buildJobProgressDtos` injected via `GetAllStageProgressDeps`
        *   `[✅]`   Existing `steps` and `documents` fields unchanged
        *   `[✅]`   No defaults, fallbacks, or data healing
        *   `[✅]`   Tests prove complete job data and edges flow through the response

*   `[✅]`   `packages/store/src/dialecticStore.documents` **[STORE] Hydrate complete job data into FE store from progress response**
    *   `[✅]`   `objective`
        *   `[✅]`   Update FE types to match enriched BE response: add `JobProgressDto` type, add `jobs` and `edges` to FE `StageProgressEntry`, add `jobs` to `StageRunProgressSnapshot`
        *   `[✅]`   Update `hydrateAllStageProgressLogic` to store `entry.jobs` into `stageRunProgress[progressKey].jobs`
        *   `[✅]`   Derive `jobProgress` counters and `modelJobStatuses` from the hydrated jobs array so they survive page refresh (currently only populated by realtime handlers)
        *   `[✅]`   No defaults, fallbacks, or data healing
    *   `[✅]`   `role`
        *   `[✅]`   App: state management — stores complete job data from progress hydration
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store — progress hydration
        *   `[✅]`   Bounded context: API response → `stageRunProgress[progressKey].jobs`, `stageRunProgress[progressKey].jobProgress`
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/types` (domain) — provides `StageProgressEntry`, `StageRunProgressSnapshot`, `JobProgressDto`, `JobProgressEntry`, `StepJobProgress` — inward dependency
        *   `[✅]`   `@paynless/api` (adapter) — provides `dialectic().getAllStageProgress()` — inward dependency
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `stageRunProgress: Record<string, StageRunProgressSnapshot>` — job data storage
        *   `[✅]`   `StageRunProgressSnapshot.jobs: JobProgressDto[]` — new field for complete job data
        *   `[✅]`   `StageRunProgressSnapshot.jobProgress: StepJobProgress` — existing field, now populated from hydration
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.types.ts`
        *   `[✅]`   Add `JobProgressDto` interface (FE mirror of BE DTO):
            *   `[✅]`   `id: string`
            *   `[✅]`   `status: string`
            *   `[✅]`   `jobType: RecipeJobType | null`
            *   `[✅]`   `stepKey: string | null`
            *   `[✅]`   `modelId: string | null`
            *   `[✅]`   `documentKey: string | null`
            *   `[✅]`   `parentJobId: string | null`
            *   `[✅]`   `createdAt: string`
            *   `[✅]`   `startedAt: string | null`
            *   `[✅]`   `completedAt: string | null`
        *   `[✅]`   Update `StageProgressEntry` (line 1163): add `jobs: JobProgressDto[]` field
        *   `[✅]`   Update `StageProgressEntry` (line 1163): add `edges: DialecticRecipeEdge[]` field
        *   `[✅]`   Update `StageRunProgressSnapshot` (line 576): add `jobs: JobProgressDto[]` field
    *   `[✅]`   unit/`dialecticStore.documents.test.ts`
        *   `[✅]`   ADD test: `hydrateAllStageProgressLogic` stores `jobs` array from response in `stageRunProgress[progressKey].jobs` — verify all jobs present, all fields correct
        *   `[✅]`   ADD test: `hydrateAllStageProgressLogic` stores ALL job types (PLAN, EXECUTE, RENDER) — not just RENDER or completed
        *   `[✅]`   ADD test: `hydrateAllStageProgressLogic` populates `jobProgress[stepKey].totalJobs`, `completedJobs`, `inProgressJobs`, `failedJobs` derived from the hydrated jobs array for each step
        *   `[✅]`   ADD test: `hydrateAllStageProgressLogic` populates `jobProgress[stepKey].modelJobStatuses[modelId]` derived from the hydrated jobs — a model with a completed job shows `'completed'`, a model with a failed job shows `'failed'`
        *   `[✅]`   ADD test: on simulated page reload, `stageRunProgress[progressKey].jobs` is populated from hydration (not empty as it would be with realtime-only population)
        *   `[✅]`   ADD test: existing `stepStatuses` and `documents` hydration logic is unchanged — additive only
        *   `[✅]`   RETAIN all existing tests
    *   `[✅]`   `construction`
        *   `[✅]`   `StageRunProgressSnapshot` initialized with `jobs: []` (empty array, not null) when creating a new snapshot
        *   `[✅]`   `jobProgress` derived from `entry.jobs` by grouping jobs by `stepKey` and counting by status — replaces the empty-on-hydration gap
        *   `[✅]`   `modelJobStatuses` derived from `entry.jobs` by grouping jobs by `stepKey` then `modelId` — replaces the empty-on-hydration gap
    *   `[✅]`   `dialecticStore.documents.ts`
        *   `[✅]`   In `hydrateAllStageProgressLogic` stage loop (after line 1744): assign `progress.jobs = entry.jobs`
        *   `[✅]`   In `hydrateAllStageProgressLogic` stage loop: derive `jobProgress` from `entry.jobs` — for each job with a non-null `stepKey`, group by `stepKey`, count `totalJobs`, `completedJobs` (status === 'completed'), `inProgressJobs` (status in ACTIVE_STATUSES), `failedJobs` (status in FAILED_STATUSES)
        *   `[✅]`   In `hydrateAllStageProgressLogic` stage loop: derive `modelJobStatuses` from `entry.jobs` — for each job with non-null `stepKey` and non-null `modelId`, set `modelJobStatuses[modelId]` to the job's mapped status
        *   `[✅]`   Update `StageRunProgressSnapshot` initialization (line 1726-1731): add `jobs: []` to the initial snapshot construction
        *   `[✅]`   Update mock in `dialectic.api.mock.ts`: add `jobs: []` and `edges: []` to mock `StageProgressEntry` responses so existing tests compile
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: app (state management)
        *   `[✅]`   Dependencies inward-facing; provides outward-facing
    *   `[✅]`   `requirements`
        *   `[✅]`   FE `JobProgressDto` matches BE shape exactly
        *   `[✅]`   FE `StageProgressEntry` has `jobs` and `edges` fields
        *   `[✅]`   `StageRunProgressSnapshot` has `jobs` field
        *   `[✅]`   `hydrateAllStageProgressLogic` stores complete job data
        *   `[✅]`   `hydrateAllStageProgressLogic` derives `jobProgress` and `modelJobStatuses` from jobs
        *   `[✅]`   Data survives page refresh via hydration
        *   `[✅]`   Existing hydration logic for `stepStatuses` and `documents` unchanged
        *   `[✅]`   Tests prove complete job data flows through hydration into the store
    *   `[✅]`   **Commit** `fix(dialectic): return and hydrate complete job data in progress pipeline (Chain 2)`
        *   `[✅]`   Added `JobProgressDto` to BE `dialectic.interface.ts` and FE `dialectic.types.ts`
        *   `[✅]`   Added `buildJobProgressDtos.ts` — extracts individual job DTOs from raw job rows
        *   `[✅]`   Updated `StageProgressEntry` on both BE and FE with `jobs: JobProgressDto[]` and `edges: ProgressRecipeEdge[]`
        *   `[✅]`   Updated `getAllStageProgress.ts` to call `buildJobProgressDtos` and include edges in response
        *   `[✅]`   Updated `StageRunProgressSnapshot` with `jobs: JobProgressDto[]` field
        *   `[✅]`   Updated `hydrateAllStageProgressLogic` to store jobs and derive `jobProgress`/`modelJobStatuses` from hydrated jobs
        *   `[✅]`   Added BE tests for job DTO extraction and response enrichment
        *   `[✅]`   Added FE tests for job hydration and derived progress counters

*   `[✅]`   dialectic-service/buildJobProgressDtos **[BE] Add `modelName` to `JobProgressDto`, extract `model_slug` from payload**
    *   `[✅]`   `objective`
        *   `[✅]`   Add `modelName: string | null` to `JobProgressDto` so every downstream consumer receives the model's display name with no extra query
        *   `[✅]`   Extract `payload.model_slug` alongside existing `payload.model_id` extraction
    *   `[✅]`   `role`
        *   `[✅]`   Infrastructure — BE DTO construction for stage progress pipeline
    *   `[✅]`   `module`
        *   `[✅]`   dialectic-service job progress DTO builder
    *   `[✅]`   `deps`
        *   `[✅]`   `dialectic.interface.ts` — `JobProgressDto`, `BuildJobProgressDtosParams`, `BuildJobProgressDtosDeps`
        *   `[✅]`   No new dependencies introduced; `model_slug` already exists on `GenerateContributionsPayload` → `DialecticBaseJobPayload` and is written to every job payload at creation time
    *   `[✅]`   `dialectic.interface.ts`
        *   `[✅]`   Add `modelName: string | null` to `JobProgressDto` (after `modelId`)
    *   `[✅]`   `buildJobProgressDtos.test.ts`
        *   `[✅]`   Test that `modelName` is extracted from `payload.model_slug` when present
        *   `[✅]`   Test that `modelName` is `null` when `payload.model_slug` is absent
        *   `[✅]`   Update existing test fixtures to include `modelName` field
    *   `[✅]`   `buildJobProgressDtos.ts`
        *   `[✅]`   Extract `payload.model_slug` as `modelName` using same `isRecord` pattern as `model_id` extraction (line 26-27)
        *   `[✅]`   Add `modelName` to DTO construction (line 32-43)
    *   `[✅]`   `requirements`
        *   `[✅]`   `modelName` populated from `payload.model_slug` for every job that carries it
        *   `[✅]`   `modelName` is `null` when `model_slug` is absent
        *   `[✅]`   Fixture propagation: `getAllStageProgress.test.ts` and `index.test.ts` may need `modelName: null` added to `JobProgressDto` fixtures

*   `[✅]`   store/dialecticStore.selectors **[STORE] Fix `selectUnifiedProjectProgress` document counting so numerator never exceeds denominator**
    *   `[✅]`   `objective`
        *   `[✅]`   A document counts as complete only when ALL expected models have completed it
        *   `[✅]`   Use `progress.jobs` to determine expected model set per document key
        *   `[✅]`   Numerator must never exceed denominator
    *   `[✅]`   `role`
        *   `[✅]`   App — state selectors consumed by StageTabCard for progress display
    *   `[✅]`   `module`
        *   `[✅]`   dialecticStore selectors, specifically `selectUnifiedProjectProgress` lines 898-910
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/types` — `JobProgressDto`, `StageRunProgressSnapshot`, `STAGE_RUN_DOCUMENT_KEY_SEPARATOR`
        *   `[✅]`   No new dependencies; `progress.jobs` is already stored during hydration
    *   `[✅]`   types/`dialectic.types.ts`
        *   `[✅]`   Add `modelName: string | null` to `JobProgressDto` (after `modelId`, line 1169)
    *   `[✅]`   `dialecticStore.selectors.test.ts`
        *   `[✅]`   Test: 2 models both complete same document → `completedDocuments` = 1, `totalDocuments` = 1
        *   `[✅]`   Test: 2 models, only 1 completes → `completedDocuments` = 0, `totalDocuments` = 1
        *   `[✅]`   Test: 0 jobs for a document key → document not counted as complete
        *   `[✅]`   Update existing fixtures to include `modelName: null` on `JobProgressDto` objects
    *   `[✅]`   `dialecticStore.selectors.ts`
        *   `[✅]`   Replace per-descriptor counting (lines 901-910) with per-document-key grouped evaluation
        *   `[✅]`   For each valid markdown key, filter `progress.jobs` by `documentKey` to collect expected `modelId` set
        *   `[✅]`   Count document as complete only when every expected model has a `completed` descriptor in `progress.documents`
    *   `[✅]`   `requirements`
        *   `[✅]`   StageTabCard displays correct ratio (e.g. 0/1 when 1 of 2 models completes, 1/1 when both complete)
        *   `[✅]`   Fixture propagation: `dialecticStore.documents.test.ts` and `dialecticStore.test.ts` need `modelName: null` on `JobProgressDto` fixtures

*   `[✅]`   web/dialectic/StageRunChecklist **[UI] Source model IDs and names from `progress.jobs` instead of contributions**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace `contributionModelIds` loop with model IDs from `stageProgress.jobs` so failed/incomplete models appear in the checklist and redo dialog
        *   `[✅]`   Use `job.modelName` for display labels; fall back to contribution name or model catalog
    *   `[✅]`   `role`
        *   `[✅]`   UI — document checklist with per-model status and regenerate action
    *   `[✅]`   `module`
        *   `[✅]`   `computeStageRunChecklistData` in StageRunChecklist, specifically the `contributionModelIds` loop (lines 254-304)
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/types` — `JobProgressDto`, `StageRunProgressSnapshot`, `STAGE_RUN_DOCUMENT_KEY_SEPARATOR`
        *   `[✅]`   `@paynless/store` — `selectStageRunProgress`, `selectStageDocumentChecklist`
        *   `[✅]`   No new dependencies; `stageProgress.jobs` already available in store
    *   `[✅]`   `StageRunChecklist.test.tsx`
        *   `[✅]`   Test: model with failed job (no contribution) appears in `perModelLabels` with status `Failed`
        *   `[✅]`   Test: redo dialog shows correct model names from jobs data
        *   `[✅]`   Test: model that completed shows `Completed` status from document descriptor
        *   `[✅]`   Update existing test fixtures to include `jobs` array with `modelName` on `StageRunProgressSnapshot`
    *   `[✅]`   `StageRunChecklist.tsx`
        *   `[✅]`   In `computeStageRunChecklistData`: for each `documentKey`, filter `stageProgress.jobs` to collect model IDs with that `documentKey`
        *   `[✅]`   Build `perModelLabels` from jobs-derived model IDs instead of `contributionModelIds`
        *   `[✅]`   Use `job.modelName` for display name; fall back to `modelNameByModelId` (contributions) then model catalog
        *   `[✅]`   Remove dead `modelIdsByDocumentKey` and `progressDocumentKeys` variables (lines 214-243) or repurpose
    *   `[✅]`   `requirements`
        *   `[✅]`   Redo dialog shows all models assigned to produce a document, including failed ones, by display name
        *   `[✅]`   Models that never produced a contribution are visible and selectable for regeneration

*   `[✅]`   web/dialectic/GeneratedContributionCard **[UI] Replace crash-inducing throws with graceful degradation**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace `throw new Error` in `modelName` memo (line 181) with fallback to `stageRunProgress.jobs` then model catalog
        *   `[✅]`   Replace `throw new Error` in `documentCreatedAtIso` memo (line 487) with `return null` when document resource state is absent
        *   `[✅]`   Component must not crash when a model is assigned but has not yet produced output
    *   `[✅]`   `role`
        *   `[✅]`   UI — individual model document viewer with edit and feedback
    *   `[✅]`   `module`
        *   `[✅]`   GeneratedContributionCard, specifically `modelName` memo (lines 149-186) and `documentCreatedAtIso` memo (lines 465-511)
    *   `[✅]`   `deps`
        *   `[✅]`   `@paynless/store` — `selectStageRunProgress` (already imported)
        *   `[✅]`   `@paynless/types` — `JobProgressDto` (already available via `StageRunProgressSnapshot`)
        *   `[✅]`   No new dependencies
    *   `[✅]`   `GeneratedContributionCard.tsx`
        *   `[✅]`   `modelName` memo: when contribution-based lookup returns no name, search `stageRunProgress.jobs` for matching `modelId` and use `modelName`; final fallback to model catalog or truncated ID
        *   `[✅]`   `documentCreatedAtIso` memo: when `sourceContributionId` is missing and `isDraftLoading` is false, `return null` instead of throwing — the existing "RENDER job has not completed yet" alert (lines 658-667) already handles this UI state
    *   `[✅]`   `requirements`
        *   `[✅]`   Page does not crash when 2 of 3 models have completed and user focuses the document
        *   `[✅]`   Model name displays for all models, including those that have only jobs (no contributions)
        *   `[✅]`   Documents without rendered resources show the "not yet available" alert instead of crashing
    *   `[✅]`   **Commit** `fix: complete model visibility in progress tracking and document views`
        *   `[✅]`   BE: `modelName` added to `JobProgressDto`, extracted from `payload.model_slug`
        *   `[✅]`   STORE: `selectUnifiedProjectProgress` counts documents complete only when all models finish
        *   `[✅]`   UI: StageRunChecklist sources model IDs from jobs, enabling redo for failed models
        *   `[✅]`   UI: GeneratedContributionCard no longer crashes on partially-complete document sets

# ToDo

- New user sign in banner doesn't display, throws console error  
-- Chase, diagnose, fix 

- Generating spinner stays present until page refresh 
-- Needs to react to actual progress 
-- Stop the spinner when a condition changes 

- Refactor EMCAS to break apart the functions, segment out the tests
-- Move gatherArtifacts call to processSimpleJob
-- Decide where to measure & RAG

- Switch to stream-to-buffer instead of chunking
-- This lets us render the buffer in real time to show document progress 

- Build test fixtures for major function groups 
-- Provide standard mock factories and objects 
  
- Support user-provided API keys for their preferred providers 

- Regenerate existing document from user feedback & edits 

- Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
AND/OR
- Let the user pick/rate their preferred version and drop the others 

- Use a gentle color schema to differentiate model outputs visually / at a glance 

- When doc loads for the first time, position at top 

- Search across documents for key terms 

- Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

- Add optional outputs for selected stages
-- A "landing page" output for the proposal stage
--- Landing page
--- Hero banner
--- Call to action
--- Email sign up 
-- A "financial analysis" output for the "refinement" stage
--- 1/3/5 year 
--- Conservative / base / aggressive
--- IS, BS, CF 
-- A "generate next set of work" for the implementation stage 

- DynamicProgressBar uses formal names instead of friendly names
- SessionContributionsDisplayCard uses formal names instead of friendly names 
- SessionInfoCard uses formal names instead of friendly names 

- Move "Generate" button into StageRunCard left hand side where the icons are 

504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

Update/fix style_guide_markdown and domain_specific_prompt_overlays.overlay_values
- Remove numbering, indentation, categories, etc from style_guide_markdown
- Update overlay_values 