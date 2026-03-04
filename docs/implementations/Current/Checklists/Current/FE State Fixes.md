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

# ToDo

- New user sign in banner doesn't display, throws console error  
-- Chase, diagnose, fix 

- Generating spinner stays present until page refresh 
-- Needs to react to actual progress 
-- Stop the spinner when a condition changes 

- Checklist does not correctly find documents when multiple agents are chosen 

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

- The full UX flow (catch NSF notification → redirect to payment portal → catch return → enable Resume) is a known future requirement but is NOT in scope for this node. This node implements the button states and resume action only. The notification-to-portal redirect flow will be a separate checklist item.

504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

Legal numbering in prompt 
- Remove 
- Impairs finding keys for rendering

DAG SVG maps on document keys, not on steps
- Doesn't show non-document steps
- Doesn't link steps correctly 

StageTabCard 
- denominator based on absolute document count
- numerator on relative document count
- both should be absolute

StageRunChecklist redo model ID problem 
- Doesn't show redo for the exact target case that needs it
- Computes models from model response list, documentModelIds
- But a model that didn't reply isn't in the response list 
- The contributionModelIds value is dynamic so it may not match what was requested 
- If you key off of documentModelIds you can't list the doc you need
- If you key off contributionModelIds you might have the wrong model
-- This also makes redo available inappropriately for every stage 
- You "could" compare the models from other documents but there's no guarantee the model you need finished any document
- Core problem: FE doesn't know which models were "supposed" to produce documents, so it doesn't know which one hasn't to ask for a redo 

User error when generation is partially complete and they renavigate during processing 
Error: [selectUnifiedProjectProgress] Progress required for stage: thesis
at selectUnifiedProjectProgress (http://localhost:5173/@fs/Users/wes/Sites/paynless-framework/packages/store/src/dialecticStore.selectors.ts:603:13)
at http://localhost:5173/src/components/dialectic/StageTabCard.tsx:238:33
at memoizedSelector (http://localhost:5173/node_modules/.vite/deps/zustand.js?v=002239bd:114:32)
at http://localhost:5173/node_modules/.vite/deps/zustand.js?v=002239bd:134:24
at updateSyncExternalStore (http://localhost:5173/node_modules/.vite/deps/chunk-LZYMYQ3D.js?v=002239bd:18796:30)
at Object.useSyncExternalStore (http://localhost:5173/node_modules/.vite/deps/chunk-LZYMYQ3D.js?v=002239bd:19659:22)
at useSyncExternalStore (http://localhost:5173/node_modules/.vite/deps/chunk-DXHSK7E4.js?v=002239bd:1405:29)
at exports.useSyncExternalStoreWithSelector (http://localhost:5173/node_modules/.vite/deps/zustand.js?v=002239bd:143:21)
at useStore (http://localhost:5173/node_modules/.vite/deps/zustand.js?v=002239bd:220:17)
at useBoundStore (http://localhost:5173/node_modules/.vite/deps/zustand.js?v=002239bd:237:51)

GeneratedContributionCard throws missing lastRenderedSourceId when 
- multiple models are called to build documents 
- Some but not all have returned a document
- The user tries to focus on the partially complete set of documents
- The model that hasn't returned yet doesn't have lastRenderedSourceId, so entire thing throws
- Sub an empty object in this case.  