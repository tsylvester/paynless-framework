[ ] // So that find->replace will stop unrolling my damned instructions! 

# **DAG Progress Computation — Prelaunch Fixes**

## Problem Statement

The dialectic system's progress reporting uses job-count-based computation (observed jobs / expected jobs) which is fragile, model-dependent, and violates the structural invariants defined in the DAG Progress Computation spec. Progress must be step-based: `completedSteps / totalSteps` per stage, `completedStages / totalStages` for the DAG. Step status must be derived structurally from DAG position and job evidence, not from counting jobs against expected totals. The user needs to see where they are in the process — what's done, what's happening now, and what's ahead — measured in steps, not jobs.

## Objectives

1. Derive step status structurally from DAG position and job evidence per the DAG Progress Computation spec
2. Replace job-count progress with step-count progress: `completedSteps / totalSteps` per stage, `completedStages / totalStages` for the DAG
3. Report document availability separately from progress
4. Deliver spec-compliant `{ dagProgress, stages }` response from the backend
5. Update frontend to consume and display step-based progress

## Expected Outcome

The user sees per-stage progress as `completedSteps / totalSteps` and per-DAG progress as `completedStages / totalStages`. Each step shows a status (`not_started`, `in_progress`, `completed`, `failed`). Document availability is reported separately. Progress is structural, stable, correct, and abstract per the seven invariants in the spec.


# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

*   `[✅]`   `[BE]` dialectic-service/topologicalSortSteps **Topological sort for recipe DAG steps**
    *   `[✅]`   `objective`
        *   `[✅]`   Accept arrays of recipe steps and edges; return steps in topological order
        *   `[✅]`   Every step in the output must appear after all of its predecessors as defined by edges
        *   `[✅]`   Detect and reject cycles with a descriptive error
        *   `[✅]`   Handle disconnected components (parallel groups with no edges between them)
        *   `[✅]`   Work for any recipe topology (thesis 5 steps through synthesis 13 steps and arbitrary user DAGs)
    *   `[✅]`   `role`
        *   `[✅]`   Domain utility — pure computation, no I/O, no DB access
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress computation — step ordering
        *   `[✅]`   Bounded to recipe step arrays and edge arrays; no awareness of jobs, sessions, or database
    *   `[✅]`   `deps`
        *   `[✅]`   DI mandatory: function accepts injected Deps (no external services — Deps type may be empty)
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `(deps: TopologicalSortStepsDeps, params: TopologicalSortStepsParams)` — Deps and Params defined and passed explicitly
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   dialectic-service/`dialectic.interface.ts`
        *   `[✅]`   `ProgressRecipeStep`: `{ id: string; step_key: string; job_type: JobType; granularity_strategy: GranularityStrategy }`
        *   `[✅]`   `ProgressRecipeEdge`: `{ from_step_id: string; to_step_id: string }`
        *   `[✅]`   `TopologicalSortStepsDeps`: empty interface (no external dependencies; DI shape required)
        *   `[✅]`   `TopologicalSortStepsParams`: `{ steps: ProgressRecipeStep[]; edges: ProgressRecipeEdge[] }`
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
        *   `[✅]`   Contract: `ProgressRecipeStep` requires `id`, `step_key`, `job_type`, `granularity_strategy` as non-empty strings of correct literal types
        *   `[✅]`   Contract: `ProgressRecipeEdge` requires `from_step_id` and `to_step_id` as non-empty strings
        *   `[✅]`   Negative: rejects objects missing any required field
        *   `[✅]`   Negative: rejects objects with wrong types for fields
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
        *   `[✅]`   `isProgressRecipeStep`: validates all four fields present with correct types
        *   `[✅]`   `isProgressRecipeEdge`: validates `from_step_id` and `to_step_id` present as non-empty strings
    *   `[✅]`   dialectic-service/`topologicalSortSteps.test.ts`
        *   `[✅]`   All tests call `topologicalSortSteps(deps, params)` with typed Deps and Params (e.g. `deps: TopologicalSortStepsDeps`, `params: { steps, edges }`)
        *   `[✅]`   Linear chain A→B→C returns [A, B, C]
        *   `[✅]`   Diamond A→B, A→C, B→D, C→D returns A first and D last with B, C between
        *   `[✅]`   Single node with no edges returns [node]
        *   `[✅]`   Parallel groups with no inter-group edges returns all nodes in a valid order
        *   `[✅]`   Cycle A→B→A throws descriptive error
        *   `[✅]`   Empty steps array returns empty array
        *   `[✅]`   Edge references step id not in steps array throws error
        *   `[✅]`   Real thesis recipe shape (1 PLAN → 4 parallel EXECUTE) returns PLAN first
        *   `[✅]`   Real parenthesis recipe shape (PLAN → sequential EXECUTE chain) returns correct linear order
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `topologicalSortSteps(deps: TopologicalSortStepsDeps, params: TopologicalSortStepsParams): ProgressRecipeStep[]` — Deps, Params, Returns defined per DI pattern
        *   `[✅]`   Pure implementation: read only from `params.steps` and `params.edges`; no use of deps in body (Deps shape still required)
        *   `[✅]`   Prohibited: construction inside a loop or conditional — always call at phase boundary
    *   `[✅]`   dialectic-service/`topologicalSortSteps.ts`
        *   `[✅]`   Build adjacency list and in-degree map from `params.edges`
        *   `[✅]`   Validate all edge endpoints exist in `params.steps`
        *   `[✅]`   Initialize queue with zero-in-degree steps
        *   `[✅]`   Process queue: emit step, decrement successors' in-degree, enqueue at zero
        *   `[✅]`   After queue exhaustion, if emitted count < total steps, throw cycle error with remaining step ids
        *   `[✅]`   Return emitted steps array in topological order
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `topologicalSortSteps` function
        *   `[✅]`   Semantic guarantee: output satisfies all edge constraints (∀ edge (u,v): index(u) < index(v))
        *   `[✅]`   Stability guarantee: deterministic for identical inputs
    *   `[✅]`   dialectic-service/`topologicalSortSteps.mock.ts`
        *   `[✅]`   Not required — pure function, cheap to call directly in consumer tests
    *   `[✅]`   dialectic-service/`topologicalSortSteps.integration.test.ts`
        *   `[✅]`   Not required — no I/O or external dependencies
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain
        *   `[✅]`   All dependencies inward-facing (none)
        *   `[✅]`   Provides outward to: `computeExpectedCounts` (document availability computation)
    *   `[✅]`   `requirements`
        *   `[✅]`   Output satisfies ∀ edge (u,v): index(u) < index(v)
        *   `[✅]`   Cycles detected and rejected with descriptive error
        *   `[✅]`   Handles all existing recipe topologies and arbitrary future DAGs
        *   `[✅]`   No side effects, no mutations to input arrays

*   `[✅]`   `[BE]` dialectic-service/deriveStepStatuses **Determine step status from DAG structure and job evidence — THE core progress function**
    *   `[✅]`   `objective`
        *   `[✅]`   For each recipe step, determine its status: `not_started`, `in_progress`, `completed`, or `failed`
        *   `[✅]`   Status is structural — derived from the step's position in the DAG and evidence of work, not from counting jobs against expected totals
        *   `[✅]`   Must work for any valid DAG, including steps that complete without producing job rows
        *   `[✅]`   A step with zero jobs whose successors have been reached is `completed` — the DAG walker moved past it
        *   `[✅]`   A step with zero jobs whose successors have NOT been reached is `not_started`
        *   `[✅]`   This function is THE core of progress computation — it is the single source of truth for step status, and all progress metrics (`completedSteps`, `failedSteps`, stage status) are derived solely from its output
        *   `[✅]`   The algorithm mirrors `processComplexJob`'s tracking logic: that function builds `completedStepSlugs`, `stepsWithInProgressJobs`, `stepsWithFailedJobs` sets, and constructs predecessor/successor maps from edges to determine readiness — `deriveStepStatuses` reconstructs the same structural understanding from the database state
    *   `[✅]`   `role`
        *   `[✅]`   Domain utility — pure computation, no I/O, no DB access
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress computation — step status derivation
        *   `[✅]`   Bounded to recipe step/edge arrays, job arrays, and step key mappings; no awareness of sessions, DB, response shapes, granularity strategies, or model counts
    *   `[✅]`   `deps`
        *   `[✅]`   DI mandatory: function accepts injected Deps (no external services — Deps type may be empty)
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `(deps: DeriveStepStatusesDeps, params: DeriveStepStatusesParams)` — Deps and Params defined and passed explicitly
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   dialectic-service/`dialectic.interface.ts`
        *   `[✅]`   `DeriveStepStatusesDeps`: empty interface (no external dependencies; DI shape required)
        *   `[✅]`   `DeriveStepStatusesParams`: `{ steps: ProgressRecipeStep[]; edges: ProgressRecipeEdge[]; jobs: DialecticJobRow[]; stepIdToStepKey: Map<string, string> }`
        *   `[✅]`   `DeriveStepStatusesResult`: `Map<string, UnifiedStageStatus>` — maps step_key to status
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
        *   `[✅]`   No new type guard tests — result is a Map, validated by callers
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
        *   `[✅]`   No new type guards
    *   `[✅]`   dialectic-service/`deriveStepStatuses.test.ts`
        *   `[✅]`   All tests call `deriveStepStatuses(deps, params)` with typed Deps and Params
        *   `[✅]`   Step with completed jobs (no active, no failed) → status `completed`
        *   `[✅]`   Step with active jobs (pending, processing, retrying, waiting_for_prerequisite, waiting_for_children) → status `in_progress`
        *   `[✅]`   Step with failed/retry_loop_failed jobs and no active jobs → status `failed`
        *   `[✅]`   Step with both active and failed jobs → status `in_progress` (active work takes precedence over terminal failures)
        *   `[✅]`   Step with no jobs whose successors have been reached (have jobs) → status `completed` (DAG walker moved past it)
        *   `[✅]`   Step with no jobs whose successors have NOT been reached → status `not_started`
        *   `[✅]`   Leaf step with no jobs → status `not_started`
        *   `[✅]`   Root PLAN job (no recipe_step_id) excluded from step attribution
        *   `[✅]`   RENDER jobs excluded from step attribution
        *   `[✅]`   Continuation jobs (non-null target_contribution_id) excluded from step attribution
        *   `[✅]`   Works for arbitrary valid DAG topologies (linear, fan-out, fan-in, diamond, disconnected parallel groups)
        *   `[✅]`   Status is independent of granularity strategy and model count — changing models does not change step status
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `deriveStepStatuses(deps: DeriveStepStatusesDeps, params: DeriveStepStatusesParams): DeriveStepStatusesResult` — Deps, Params, Returns defined per DI pattern
        *   `[✅]`   Pure implementation: read only from params; no use of deps in body (Deps shape still required)
    *   `[✅]`   dialectic-service/`deriveStepStatuses.ts`
        *   `[✅]`   Map jobs to recipe steps via `payload.planner_metadata.recipe_step_id` → `stepIdToStepKey`
        *   `[✅]`   Exclude root PLAN jobs (no recipe_step_id), RENDER jobs (`job_type === 'RENDER'`), continuation jobs (`target_contribution_id` is non-null)
        *   `[✅]`   For each recipe step, classify attributed job evidence into three sets: `has_active` (pending/processing/retrying/waiting_for_prerequisite/waiting_for_children), `has_completed`, `has_failed` (failed/retry_loop_failed)
        *   `[✅]`   Build successor map from edges: for each edge `(from_step_id, to_step_id)`, record `to_step_id` as a successor of `from_step_id`
        *   `[✅]`   For steps with job evidence, determine status by priority: `in_progress` if `has_active`; `failed` if `has_failed` and not `has_active`; `completed` if `has_completed` and not `has_active` and not `has_failed`
        *   `[✅]`   For steps with no job evidence: check if any successor step HAS been reached (has any attributed jobs) → if yes, this step is `completed`; if no, this step is `not_started`
        *   `[✅]`   Return `Map<string, UnifiedStageStatus>`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `deriveStepStatuses` function
        *   `[✅]`   Semantic guarantee: status is structurally derived, works for any valid DAG
        *   `[✅]`   Semantic guarantee: does not assume all steps have jobs
        *   `[✅]`   Semantic guarantee: does not depend on granularity strategy, model count, or expected job counts
        *   `[✅]`   Stability guarantee: deterministic for identical inputs
    *   `[✅]`   dialectic-service/`deriveStepStatuses.mock.ts`
        *   `[✅]`   Not required — pure function, cheap to call directly in consumer tests
    *   `[✅]`   dialectic-service/`deriveStepStatuses.integration.test.ts`
        *   `[✅]`   Not required — no I/O or external dependencies
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain
        *   `[✅]`   All dependencies inward-facing (none)
        *   `[✅]`   Provides outward to: `getAllStageProgress` (step status for progress computation — this is the single source of truth for all progress metrics)
    *   `[✅]`   `requirements`
        *   `[✅]`   Step status derived from DAG position and job evidence, never from job counts vs expected counts
        *   `[✅]`   Steps without jobs handled correctly (inferred from successor reachability)
        *   `[✅]`   RENDER jobs, continuation jobs, root PLAN jobs excluded from step attribution
        *   `[✅]`   Works for any valid DAG topology, not just existing recipes
        *   `[✅]`   Status priority: `in_progress` > `failed` > `completed` (active work takes precedence over failures; failures take precedence over partial completion)

*   `[✅]`   `[BE]` dialectic-service/buildDocumentDescriptors **Build document availability descriptors from RENDER jobs and resources**
    *   `[✅]`   `objective`
        *   `[✅]`   Produce document availability descriptors from completed RENDER jobs cross-referenced with `dialectic_project_resources`
        *   `[✅]`   Document availability is a separate concern from progress computation per the spec
        *   `[✅]`   Group descriptors by `stageSlug` for inclusion in the per-stage response
        *   `[✅]`   Derive `stepKey` from RENDER job's parent EXECUTE job's `planner_metadata.recipe_step_id`
    *   `[✅]`   `role`
        *   `[✅]`   Domain utility — pure computation over pre-fetched job and resource arrays
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress computation — document availability reporting
        *   `[✅]`   Bounded to RENDER job rows, resource rows, and step key mappings
    *   `[✅]`   `deps`
        *   `[✅]`   DI mandatory: function accepts injected Deps (no external services — Deps type may be empty)
        *   `[✅]`   Uses existing `StageDocumentDescriptorDto` from `dialectic.interface.ts`
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `(deps: BuildDocumentDescriptorsDeps, params: BuildDocumentDescriptorsParams)` — Deps and Params defined and passed explicitly
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   dialectic-service/`dialectic.interface.ts`
        *   `[✅]`   `BuildDocumentDescriptorsDeps`: empty interface (no external dependencies; DI shape required)
        *   `[✅]`   `BuildDocumentDescriptorsParams`: `{ jobs: DialecticJobRow[]; resourceIdBySourceContributionId: Map<string, string>; stepIdToStepKey: Map<string, string>; jobIdToJob: Map<string, DialecticJobRow> }`
        *   `[✅]`   Uses existing `StageDocumentDescriptorDto`, `DialecticJobRow`, `DialecticProjectResourceRow`
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
        *   `[✅]`   No new type guard tests — uses existing types
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
        *   `[✅]`   No new type guards
    *   `[✅]`   dialectic-service/`buildDocumentDescriptors.test.ts`
        *   `[✅]`   All tests call `buildDocumentDescriptors(deps, params)` with typed Deps and Params
        *   `[✅]`   Completed RENDER job with matching resource → produces descriptor with `documentKey`, `modelId`, `jobId`, `latestRenderedResourceId`, `status: "completed"`
        *   `[✅]`   Non-completed RENDER job → skipped, no descriptor produced
        *   `[✅]`   RENDER job whose `sourceContributionId` has no matching resource → produces error
        *   `[✅]`   `stepKey` derived from parent EXECUTE job's `planner_metadata.recipe_step_id` via `stepIdToStepKey`
        *   `[✅]`   Multiple completed RENDER jobs across stages → descriptors grouped by `stageSlug`
        *   `[✅]`   Empty RENDER job array → returns empty map
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `buildDocumentDescriptors(deps: BuildDocumentDescriptorsDeps, params: BuildDocumentDescriptorsParams): Map<string, StageDocumentDescriptorDto[]>` — Deps, Params, Returns defined per DI pattern
        *   `[✅]`   Pure implementation: read only from `params.jobs`, `params.resourceIdBySourceContributionId`, `params.stepIdToStepKey`, `params.jobIdToJob`; no use of deps in body
    *   `[✅]`   dialectic-service/`buildDocumentDescriptors.ts`
        *   `[✅]`   Filter `params.jobs` to `job_type === 'RENDER'` and `status === 'completed'`
        *   `[✅]`   For each completed RENDER job: extract `documentKey` and `sourceContributionId` from payload
        *   `[✅]`   Look up `latestRenderedResourceId` from `params.resourceIdBySourceContributionId`
        *   `[✅]`   Derive `stepKey` from parent job's `planner_metadata.recipe_step_id` via `params.stepIdToStepKey` and `params.jobIdToJob`
        *   `[✅]`   Construct `StageDocumentDescriptorDto` and group by `stageSlug`
        *   `[✅]`   Return `Map<stageSlug, StageDocumentDescriptorDto[]>`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `buildDocumentDescriptors` function
        *   `[✅]`   Semantic guarantee: only completed, fetchable documents reported
    *   `[✅]`   dialectic-service/`buildDocumentDescriptors.mock.ts`
        *   `[✅]`   Not required — pure function
    *   `[✅]`   dialectic-service/`buildDocumentDescriptors.integration.test.ts`
        *   `[✅]`   Not required — no I/O
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain
        *   `[✅]`   All dependencies inward-facing (none)
        *   `[✅]`   Provides outward to: `getAllStageProgress` (document availability — separate from progress)
    *   `[✅]`   `requirements`
        *   `[✅]`   Document descriptors are strictly separate from progress — RENDER jobs NEVER feed into progress counts
        *   `[✅]`   Only `status: "completed"` RENDER jobs with matching resources produce descriptors

*   `[✅]`   `[BE]` dialectic-service/computeExpectedCounts **Compute expected document counts from recipe structure — document availability ONLY, not progress**
    *   `[✅]`   `objective`
        *   `[✅]`   Walk recipe steps in topological order computing expected job count per step from `granularity_strategy` and model count `n`
        *   `[✅]`   Propagate output cardinality through DAG edges so downstream `per_source_document` steps derive their expected count from predecessor cardinality
        *   `[✅]`   Handle `all_to_one`, `per_model`, `per_source_document`, `per_source_document_by_lineage`, `pairwise_by_origin` strategies per DAG Progress Computation spec
        *   `[✅]`   For `all_to_one` PLAN steps: infer output cardinality as `n` when downstream steps use `per_source_document`, else `1`
        *   `[✅]`   For `pairwise_by_origin`: compute `L × R × n` using prior stage context
        *   `[✅]`   For `per_source_document_by_lineage`: compute `n × L` using prior stage context
        *   `[✅]`   Return both `expected` (count per step_key) and `cardinality` (output cardinality per step_id) maps
    *   `[✅]`   `role`
        *   `[✅]`   Domain utility — pure computation, deterministic, no I/O
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress computation — expected document count derivation from recipe structure
        *   `[✅]`   This function computes DOCUMENT COUNTS for document availability reporting (e.g. "4 of 12 documents ready"). It is NEVER used as a denominator for step-based progress. The progress denominator is simply `recipe.steps.length`.
        *   `[✅]`   Bounded to recipe step/edge arrays, model count, and prior stage context
    *   `[✅]`   `deps`
        *   `[✅]`   DI mandatory: function accepts injected Deps including `topologicalSortSteps` — domain — inward
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `(deps: ComputeExpectedCountsDeps, params: ComputeExpectedCountsParams)` — Deps and Params defined and passed explicitly
        *   `[✅]`   Deps provides `topologicalSortSteps`; no direct import of `topologicalSortSteps` in implementation
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   dialectic-service/`dialectic.interface.ts`
        *   `[✅]`   `PriorStageContext`: `{ lineageCount: number; reviewerCount: number }`
        *   `[✅]`   `ExpectedCountsResult`: `{ expected: Map<string, number>; cardinality: Map<string, number> }`
        *   `[✅]`   `ComputeExpectedCountsDeps`: `{ topologicalSortSteps: (deps: TopologicalSortStepsDeps, params: TopologicalSortStepsParams) => ProgressRecipeStep[] }`
        *   `[✅]`   `ComputeExpectedCountsParams`: `{ steps: ProgressRecipeStep[]; edges: ProgressRecipeEdge[]; n: number; priorStageContext?: PriorStageContext }`
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
        *   `[✅]`   Contract: `PriorStageContext` requires `lineageCount` and `reviewerCount` as finite non-negative numbers
        *   `[✅]`   Negative: rejects missing fields, negative numbers, non-numeric values
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
        *   `[✅]`   `isPriorStageContext`: validates `lineageCount` and `reviewerCount` are finite non-negative numbers
    *   `[✅]`   dialectic-service/`computeExpectedCounts.test.ts`
        *   `[✅]`   All tests call `computeExpectedCounts(deps, params)` with typed Deps (e.g. `topologicalSortSteps` injected) and Params
        *   `[✅]`   Thesis n=2: PLAN `all_to_one` → expected=1, cardinality=2; four EXECUTE `per_source_document` → expected=2 each; total=9
        *   `[✅]`   Thesis n=3: PLAN expected=1, cardinality=3; four EXECUTE expected=3 each; total=13
        *   `[✅]`   Antithesis n=2: PLAN `per_source_document` with predecessor cardinality=2 → expected=2; six EXECUTE `per_source_document` → expected=2 each; total=14
        *   `[✅]`   Synthesis n=2 with L=2, R=2: `pairwise_by_origin` steps → expected=L×R×n=8 each; `all_to_one` consolidation → expected=1 each
        *   `[✅]`   `per_source_document_by_lineage` with n=3, L=2 → expected=6
        *   `[✅]`   `all_to_one` PLAN with no `per_source_document` children → cardinality=1
        *   `[✅]`   `all_to_one` PLAN with `per_source_document` children → cardinality=n
        *   `[✅]`   Edge case: `per_source_document` step with no predecessor via edges throws error
        *   `[✅]`   Parenthesis n=3: expected total = 3n+1 = 10
        *   `[✅]`   Paralysis n=3: expected total = 3n+1 = 10
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `computeExpectedCounts(deps: ComputeExpectedCountsDeps, params: ComputeExpectedCountsParams): ExpectedCountsResult` — Deps, Params, Returns defined per DI pattern
        *   `[✅]`   `params.priorStageContext` optional — only required for stages using `pairwise_by_origin` or `per_source_document_by_lineage`
        *   `[✅]`   No factory, no deferred initialization
    *   `[✅]`   dialectic-service/`computeExpectedCounts.ts`
        *   `[✅]`   Call `deps.topologicalSortSteps({}, { steps: params.steps, edges: params.edges })` to get ordered steps
        *   `[✅]`   Initialize `expected: Map<string, number>` and `cardinality: Map<string, number>`
        *   `[✅]`   For each sorted step, switch on `granularity_strategy`; use `params.n` and `params.priorStageContext` where needed
        *   `[✅]`   `all_to_one`: expected=1; cardinality=`hasPsdChildren(step, params.edges, params.steps) ? params.n : 1`
        *   `[✅]`   `per_model`: expected=params.n; cardinality=params.n
        *   `[✅]`   `per_source_document`: predecessor = `findPrimaryInputPredecessor(step, params.edges)`; c = cardinality[predecessor.id]; expected=c; cardinality=c
        *   `[✅]`   `pairwise_by_origin`: expected = L × R × params.n; cardinality = same (L, R from params.priorStageContext)
        *   `[✅]`   `per_source_document_by_lineage`: expected = params.n × L; cardinality = same (L from params.priorStageContext)
        *   `[✅]`   Local helper `hasPsdChildren`: check outgoing edges from step for any successor with `per_source_document` strategy
        *   `[✅]`   Local helper `findPrimaryInputPredecessor`: find the step that provides this step's input via incoming edge
        *   `[✅]`   Return `{ expected, cardinality }`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `computeExpectedCounts` function
        *   `[✅]`   Semantic guarantee: `expected[stepKey]` equals the spec's deterministic job count for that step
        *   `[✅]`   Semantic guarantee: `cardinality[stepId]` equals the output document count flowing to downstream edges
        *   `[✅]`   Stability guarantee: same recipe + same n + same priorStageContext → same result
    *   `[✅]`   dialectic-service/`computeExpectedCounts.mock.ts`
        *   `[✅]`   Not required — pure function, cheap to call directly in tests
    *   `[✅]`   dialectic-service/`computeExpectedCounts.integration.test.ts`
        *   `[✅]`   `topologicalSortSteps` → `computeExpectedCounts` with real thesis recipe steps and edges → validates total matches spec worked example (4n+1 for thesis)
        *   `[✅]`   `topologicalSortSteps` → `computeExpectedCounts` with real synthesis recipe steps and edges and prior stage context → validates total matches spec (4n³+4n+5)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain
        *   `[✅]`   Dependencies inward-facing: `topologicalSortSteps` (same layer)
        *   `[✅]`   Provides outward to: `getAllStageProgress` (cardinality propagation for `priorStageContext` and document availability ONLY — never used as progress denominator)
    *   `[✅]`   `requirements`
        *   `[✅]`   Must match DAG Progress Computation spec worked example exactly for all 5 stages at n=3
        *   `[✅]`   Expected counts are deterministic functions of recipe structure, n, and prior stage context
        *   `[✅]`   No observation of job rows — structure only
        *   `[✅]`   Abstract: works for any recipe DAG following the structural ruleset

*   `[🚫]`   `[BE]` dialectic-service/countObservedCompletions **DELETED — replaced by `deriveStepStatuses`**
    *   `[🚫]`   This function counted completed/failed JOBS per step. Step-based progress derives step STATUS from DAG structure and job evidence, not from tallying job counts. All files (`countObservedCompletions.ts`, `countObservedCompletions.test.ts`) are deleted. All associated types (`ObservedCounts`, `CountObservedCompletionsDeps`, `CountObservedCompletionsParams`) and guards (`isObservedCounts`) are removed from `dialectic.interface.ts` and `type_guards.dialectic.ts`.

*   `[✅]`   `[BE]` dialectic-service/getAllStageProgress **Refactor to step-based structural progress computation**
    *   `[✅]`   `objective`
        *   `[✅]`   Replace observation-based progress (counting observed jobs as both numerator and denominator) with structural step-based progress
        *   `[✅]`   Add recipe edge loading (cloned `dialectic_stage_recipe_edges` and template `dialectic_recipe_template_edges`) mirroring existing step-loading dual path
        *   `[✅]`   Add model count `n` loading from `dialectic_sessions.selected_models` for the session
        *   `[✅]`   Add total stages count from `dialectic_stage_transitions` for DAG-level progress
        *   `[✅]`   Return spec-compliant response with `dagProgress` envelope, per-stage `progress: { completedSteps, totalSteps, failedSteps }`, per-step status (`{ stepKey, status }` only — no per-step job counts), `modelCount`, and `documents`
        *   `[✅]`   Include stages not yet started (progress `0/0`, status `not_started`) in the response
        *   `[✅]`   Remove `jobProgress` / `StepJobProgress` / `totalJobs` / `inProgressJobs` / `modelJobStatuses` from response
        *   `[✅]`   Remove `__job:` prefix key system
    *   `[✅]`   `role`
        *   `[✅]`   Application service — orchestrator with DB queries and delegated computation
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress computation — main entry point
        *   `[✅]`   Bounded to dialectic session progress; queries DB, delegates computation to domain functions, assembles response
    *   `[✅]`   `deps`
        *   `[✅]`   DI mandatory: function accepts injected Deps including all dependencies below
        *   `[✅]`   `deriveStepStatuses` — domain — inward — injected via Deps — determines step status from DAG structure and job evidence; this is THE progress computation; all progress metrics are derived from its output
        *   `[✅]`   `computeExpectedCounts` — domain — inward — injected via Deps — used for `priorStageContext` derivation and document availability ONLY, never as progress denominator
        *   `[✅]`   `buildDocumentDescriptors` — domain — inward — injected via Deps — document availability
        *   `[✅]`   `SupabaseClient<Database>` — infrastructure — inward via Deps — DB queries
        *   `[✅]`   `User` — infrastructure — inward via Deps — authorization
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `(deps: GetAllStageProgressDeps, params: GetAllStageProgressParams)` — Deps and Params defined and passed explicitly
        *   `[✅]`   Deps provides `deriveStepStatuses`, `computeExpectedCounts`, `buildDocumentDescriptors`, `dbClient`, `user`; no direct import of domain functions in implementation
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   dialectic-service/`dialectic.interface.ts`
        *   `[✅]`   `GetAllStageProgressParams`: `{ payload: GetAllStageProgressPayload }` (or retain existing if already defined)
        *   `[✅]`   `DagProgressDto`: `{ completedStages: number; totalStages: number }`
        *   `[✅]`   `StepProgressDto`: `{ stepKey: string; status: UnifiedStageStatus }` — status ONLY, no job counts, no per-step progress field
        *   `[✅]`   Update `StageProgressEntry` to: `{ stageSlug: string; status: UnifiedStageStatus; modelCount: number | null; progress: { completedSteps: number; totalSteps: number; failedSteps: number }; steps: StepProgressDto[]; documents: StageDocumentDescriptorDto[] }` — note field names are `completedSteps`, `totalSteps`, `failedSteps` (not `completed`, `total`, `failed`)
        *   `[✅]`   Update `GetAllStageProgressResponse` to: `{ dagProgress: DagProgressDto; stages: StageProgressEntry[] }`
        *   `[✅]`   Remove `JobProgressEntry`, `StepJobProgress`, `JobProgressStatus` (no longer part of the response)
        *   `[✅]`   `GetAllStageProgressDeps`: include `deriveStepStatuses` (typed as `(deps: DeriveStepStatusesDeps, params: DeriveStepStatusesParams) => DeriveStepStatusesResult`); remove `countObservedCompletions`; retain `computeExpectedCounts` and `buildDocumentDescriptors`
        *   `[✅]`   Remove `ObservedCounts`, `CountObservedCompletionsDeps`, `CountObservedCompletionsParams` (replaced by `DeriveStepStatusesDeps`, `DeriveStepStatusesParams`, `DeriveStepStatusesResult` defined in deriveStepStatuses node)
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
        *   `[✅]`   Contract: `DagProgressDto` requires `completedStages` and `totalStages` as finite non-negative integers
        *   `[✅]`   Contract: `StepProgressDto` requires `stepKey` as non-empty string, `status` as valid `UnifiedStageStatus` — no job-count fields
        *   `[✅]`   Contract: updated `StageProgressEntry` requires `stageSlug`, `status`, `modelCount`, `progress: { completedSteps, totalSteps, failedSteps }`, `steps`, `documents`
        *   `[✅]`   Contract: updated `GetAllStageProgressResponse` requires `dagProgress` and `stages` array
        *   `[✅]`   Negative: rejects old response shape (plain array without `dagProgress`)
    *   `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
        *   `[✅]`   `isDagProgressDto`: validates `completedStages` and `totalStages`
        *   `[✅]`   `isStepProgressDto`: validates `stepKey` as non-empty string and `status` as valid `UnifiedStageStatus` — no job-count progress fields
        *   `[✅]`   Update `isStageProgressEntry` guard: validates `progress` has `completedSteps`, `totalSteps`, `failedSteps` as finite non-negative integers
        *   `[✅]`   `isGetAllStageProgressResponse`: validates `dagProgress` and `stages` array
        *   `[✅]`   Remove `isObservedCounts` guard (type deleted with `countObservedCompletions`)
    *   `[✅]`   dialectic-service/`getAllStageProgress.test.ts`
        *   `[✅]`   All tests call `getAllStageProgress(deps, params)` with typed Deps (domain functions + dbClient + user injected) and Params
        *   `[✅]`   Response contains `dagProgress: { completedStages, totalStages }` envelope
        *   `[✅]`   Response contains `stages` array with entries for every stage in the process template (including `not_started`)
        *   `[✅]`   Each stage has `modelCount: n` (or `null` for not-started stages)
        *   `[✅]`   Each stage has `progress: { completedSteps, totalSteps, failedSteps }` where `totalSteps` = `recipe.steps.length` (structural step count, NOT sum of expected job counts from `computeExpectedCounts`)
        *   `[✅]`   Each stage has `steps` array with `{ stepKey, status }` per step — no per-step job counts, no `progress` field on `StepProgressDto`
        *   `[✅]`   RENDER jobs excluded from step status derivation (appear only in `documents`)
        *   `[✅]`   Continuation jobs excluded from step status derivation
        *   `[✅]`   `dagProgress.completedStages` = count of stages where `status === 'completed'`
        *   `[✅]`   Stage `status` derivation: `completed` iff `completedSteps === totalSteps && failedSteps === 0`; `failed` if `failedSteps > 0`; `in_progress` if any step is `in_progress` or `completed` but stage not fully done; `not_started` if no steps reached
        *   `[✅]`   Invariant: `stage.progress.completedSteps` == count of steps in `stage.steps` where `status === 'completed'`
        *   `[✅]`   Invariant: `stage.progress.totalSteps` == `stage.steps.length` == recipe step count for that stage
        *   `[✅]`   Invariant: `stage.progress.failedSteps` == count of steps in `stage.steps` where `status === 'failed'`
        *   `[✅]`   Spec invariant: progress never decreases across successive calls
        *   `[✅]`   Edge loading: cloned instances query `dialectic_stage_recipe_edges`, template instances query `dialectic_recipe_template_edges`
        *   `[✅]`   Model count loaded from `dialectic_sessions.selected_models.length`
        *   `[✅]`   Total stages loaded from `dialectic_stage_transitions` for the session's process template
        *   `[✅]`   Progress is independent of model count: changing `n` changes document expectations but NOT step progress (`totalSteps` stays the same, step statuses stay the same)
        *   `[✅]`   Progress is independent of granularity strategy: a step with `per_model` and a step with `all_to_one` are each one step toward `completedSteps` regardless of how many jobs they spawn
        *   `[✅]`   Step with zero jobs whose successors have been reached → status `completed` (structural inference from DAG position)
        *   `[✅]`   Randomized DAG test: generate valid DAGs from structural rules (steps, edges satisfying DAG constraints, arbitrary granularity strategies), assign random job evidence, verify `completedSteps` == count of `completed` status, `totalSteps` == `steps.length`, `failedSteps` == count of `failed` 
        *   `[✅]`   Progress calculates correctly for every stage in the existing DAG
        *   `[✅]`   Progress calculates correctly for any valid DAG topology (including steps with no jobs)
        *   `[✅]`   The test randomly generates valid DAGs from the DAG rules and existing granularity strategies, and correctly reports progress against the generated DAGs
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `getAllStageProgress(deps: GetAllStageProgressDeps, params: GetAllStageProgressParams): Promise<GetAllStageProgressResult>` — Deps, Params, Returns defined per DI pattern
        *   `[✅]`   Called from dialectic-service handler; handler constructs Deps (domain functions + deps.dbClient + deps.user) and Params from request, then calls `getAllStageProgress(deps, params)`
    *   `[✅]`   dialectic-service/`getAllStageProgress.ts`
        *   `[✅]`   **Keep**: input validation using `params.payload`, job/stage/instance/step loading using `deps.dbClient`; build `stepIdToStepKey` maps
        *   `[✅]`   **Keep**: load recipe edges from `dialectic_stage_recipe_edges` (cloned) and `dialectic_recipe_template_edges` (template) via `deps.dbClient`
        *   `[✅]`   **Keep**: query `dialectic_sessions` for `selected_models` via `deps.dbClient` to derive model count `n`
        *   `[✅]`   **Keep**: query `dialectic_stage_transitions` for `totalStages`
        *   `[✅]`   **Keep**: call `deps.buildDocumentDescriptors` for document availability
        *   `[✅]`   **PROGRESS FLOW** (step-based, structural — this is the core change):
        *   `[✅]`   Per stage in the stage loop: filter `jobsData` to jobs for this stage's `stage_slug` → `stageJobs`
        *   `[✅]`   Per stage: call `deps.deriveStepStatuses({}, { steps, edges, jobs: stageJobs, stepIdToStepKey })` → `Map<stepKey, UnifiedStageStatus>`
        *   `[✅]`   Per stage: `totalSteps` = `steps.length` (structural, from recipe — NOT from `computeExpectedCounts`)
        *   `[✅]`   Per stage: `completedSteps` = count of steps where status == `completed`
        *   `[✅]`   Per stage: `failedSteps` = count of steps where status == `failed`
        *   `[✅]`   Per stage: build `StepProgressDto[]` from `deriveStepStatuses` result: `{ stepKey, status }` per step — no job counts
        *   `[✅]`   Per stage: derive stage status from step status counts: `completed` iff `completedSteps == totalSteps && failedSteps == 0`; `failed` if `failedSteps > 0`; `in_progress` if any step `completed` or `in_progress` but stage not fully done; `not_started` if no steps reached
        *   `[✅]`   **DOCUMENT FLOW** (separate concern, uses `computeExpectedCounts` for cardinality — NOT for progress):
        *   `[✅]`   Per stage: call `deps.computeExpectedCounts` for cardinality propagation and `priorStageContext` derivation
        *   `[✅]`   `computeExpectedCounts` results are used ONLY for: (a) deriving `priorStageContext` (lineage count from leaf step cardinality) for downstream stages, (b) document availability counts if needed — NEVER for step status or progress denominators
        *   `[✅]`   **ASSEMBLY**:
        *   `[✅]`   Per stage: assemble `StageProgressEntry` with `progress: { completedSteps, totalSteps, failedSteps }`, `steps: StepProgressDto[]`, `documents: StageDocumentDescriptorDto[]`
        *   `[✅]`   Derive `dagProgress: { completedStages, totalStages }` from assembled stages
        *   `[✅]`   Wrap in `{ dagProgress, stages }` envelope
        *   `[✅]`   **DELETE** (from current implementation):
        *   `[✅]`   Remove entire `jobProgress: StepJobProgress` accumulation pattern
        *   `[✅]`   Remove `__job:` prefix key system
        *   `[✅]`   Remove `inProgressJobs` / `totalJobs` / `modelJobStatuses` tracking
        *   `[✅]`   Remove `isPerModel` branching
        *   `[✅]`   Remove RENDER job progress counting
        *   `[✅]`   Remove the step status derivation loop that compares `observed.completed` vs `expectedResult.expected` (lines 806-838 in current implementation) — replaced by `deriveStepStatuses` call
        *   `[✅]`   Remove the call to `deps.countObservedCompletions` — replaced by `deps.deriveStepStatuses`
        *   `[✅]`   Remove per-step `progress: { completed, total, failed }` from `StepProgressDto` construction — `StepProgressDto` is `{ stepKey, status }` only
        *   `[✅]`   Move RENDER→descriptor logic to `buildDocumentDescriptors`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `getAllStageProgress` function
        *   `[✅]`   Semantic guarantee: response matches DAG Progress Computation spec schema exactly
        *   `[✅]`   Semantic guarantee: progress is view-independent (same result regardless of which stage the user is looking at)
        *   `[✅]`   Stability guarantee: progress is monotonically non-decreasing across successive calls for same session
    *   `[✅]`   dialectic-service/`getAllStageProgress.mock.ts`
        *   `[✅]`   Mock returns a valid `GetAllStageProgressResult` with spec-compliant response shape
        *   `[✅]`   Configurable stage count, per-stage `completedSteps`/`totalSteps`/`failedSteps` values
        *   `[✅]`   Per-step status configurable via `steps: StepProgressDto[]` — no per-step job counts in mock
    *   `[✅]`   dialectic-service/`getAllStageProgress.integration.test.ts`
        *   `[✅]`   Orchestration: DB client returns job/stage/step/edge/resource data for the existing loaded DAG stages; verify `deriveStepStatuses`, `computeExpectedCounts`, and `buildDocumentDescriptors` are composed correctly
        *   `[✅]`   Verify response structure matches spec for a multi-stage scenario with 1 completed, 1 in-progress, 1 not-started
        *   `[✅]`   Verify RENDER jobs appear in `documents` but NOT in step statuses
        *   `[✅]`   Verify continuation jobs do NOT affect step statuses
        *   `[✅]`   Verify steps with no jobs but reached successors show as `completed`
        *   `[✅]`   Verify progress is step-based: `completedSteps` / `totalSteps`, not job sums
        *   `[✅]`   Verify `totalSteps` == `recipe.steps.length`, NOT sum of expected job counts
        *   `[✅]`   Verify progress does not change when model count `n` changes (step statuses are model-independent)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application
        *   `[✅]`   Dependencies inward-facing: `deriveStepStatuses` (step status — THE progress computation), `computeExpectedCounts` (cardinality/document counts — NOT progress), `buildDocumentDescriptors` (document availability) — all domain; `SupabaseClient` (infrastructure via adapter)
        *   `[✅]`   Provides outward to: dialectic-service HTTP handler (API layer)
    *   `[✅]`   `requirements`
        *   `[✅]`   Response matches DAG Progress Computation spec `Progress Report Schema` exactly
        *   `[✅]`   All seven spec invariants satisfied (`completedSteps` == count of completed, `totalSteps` == `steps.length`, `failedSteps` == count of failed, stage status derived from step counts, `dagProgress` counts, monotonicity, view-independence)
        *   `[✅]`   Progress unit is STEPS — `totalSteps` = recipe step count, `completedSteps` = steps with status `completed`
        *   `[✅]`   Step status derived structurally by `deriveStepStatuses` from DAG position and job evidence, not from counting jobs against expected totals
        *   `[✅]`   Steps without jobs handled correctly (inferred from successor reachability by `deriveStepStatuses`)
        *   `[✅]`   RENDER jobs tracked separately as document availability, never in step status
        *   `[✅]`   Continuation jobs excluded from step status derivation
        *   `[✅]`   Stages not yet initiated reported as `not_started` with `progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }`
        *   `[✅]`   `modelCount` reported per stage (`null` for not-started)
        *   `[✅]`   Works for any valid DAG topology, not just the existing recipes
        *   `[✅]`   Function stays under 600 lines after refactoring

*   `[✅]`   `[COMMIT]` **refactor dialectic-service/getAllStageProgress step-based DAG progress computation**
    *   `[✅]`   New file: `deriveStepStatuses.ts` + `deriveStepStatuses.test.ts` — step status derivation from DAG structure and job evidence
    *   `[✅]`   Removed: `countObservedCompletions.ts` + `countObservedCompletions.test.ts` — replaced by `deriveStepStatuses`
    *   `[✅]`   Modified: `getAllStageProgress.ts` — replaced job-counting progress with step-status-based progress; composes `deriveStepStatuses` instead of `countObservedCompletions`; progress flow uses `totalSteps = steps.length` and counts steps by status; document flow remains via `computeExpectedCounts` + `buildDocumentDescriptors`
    *   `[✅]`   Modified: `getAllStageProgress.test.ts` — new/updated tests for spec compliance (step counts, not job sums; structural invariants; model-independence)
    *   `[✅]`   Modified: `getAllStageProgress.mock.ts` — updated for new response shape with `completedSteps`/`totalSteps`/`failedSteps` and `StepProgressDto` without job counts
    *   `[✅]`   Modified: `dialectic.interface.ts` — new types `DeriveStepStatusesDeps`, `DeriveStepStatusesParams`, `DeriveStepStatusesResult`; updated `StepProgressDto` (`{ stepKey, status }` only), `StageProgressEntry` (progress is `{ completedSteps, totalSteps, failedSteps }`), `GetAllStageProgressDeps` (includes `deriveStepStatuses`, removes `countObservedCompletions`); removed `ObservedCounts`, `CountObservedCompletionsDeps`, `CountObservedCompletionsParams`
    *   `[✅]`   Modified: `type_guards.dialectic.ts` + `type_guards.dialectic.progress.test.ts` — new guard `isStepProgressDto`; updated `isStageProgressEntry` for `completedSteps`/`totalSteps`/`failedSteps`; removed `isObservedCounts`
    *   `[✅]`   Existing files unchanged: `topologicalSortSteps.ts`, `computeExpectedCounts.ts`, `buildDocumentDescriptors.ts` and their tests

*   `[✅]`   `[BE]` dialectic-service/getStageRecipe **Add edge data to recipe response**
    *   `[✅]`   `objective`
        *   `[✅]`   Extend `getStageRecipe` to query `dialectic_stage_recipe_edges` for the active recipe instance and include edges in the response
        *   `[✅]`   The frontend needs edge data to render DAG visualizations; currently `getStageRecipe` returns only steps
    *   `[✅]`   `role`
        *   `[✅]`   Backend API endpoint — recipe data producer
    *   `[✅]`   `module`
        *   `[✅]`   dialectic-service — recipe endpoint
        *   `[✅]`   Bounded to querying recipe instance data and returning a DTO; no job processing or progress computation
    *   `[✅]`   `deps`
        *   `[✅]`   `dialectic_stage_recipe_edges` table — database — infrastructure — edge rows for cloned recipe instances
        *   `[✅]`   `ProgressRecipeEdge` type from `dialectic.interface.ts` — domain — inward — `{ from_step_id: string; to_step_id: string }`
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From database: `dialectic_stage_recipe_edges` rows filtered by `instance_id`
        *   `[✅]`   Injection shape: function receives `dbClient: SupabaseClient<Database>` (existing pattern)
        *   `[✅]`   Confirm no concrete imports from frontend packages
    *   `[✅]`   supabase/functions/dialectic-service/`dialectic.interface.ts`
        *   `[✅]`   Update `StageRecipeResponse` (line 219) to add `edges: ProgressRecipeEdge[]` — currently `{ stageSlug: string; instanceId: string; steps: StageRecipeStepDto[] }`, becomes `{ stageSlug: string; instanceId: string; steps: StageRecipeStepDto[]; edges: ProgressRecipeEdge[] }`
        *   `[✅]`   `ProgressRecipeEdge` already exists at line 525 as `{ from_step_id: string; to_step_id: string }` — no change needed to that type
    *   `[✅]`   supabase/functions/dialectic-service/`getStageRecipe.test.ts`
        *   `[✅]`   Test: successful response includes `edges` array with correct `from_step_id` and `to_step_id` values matching the queried `dialectic_stage_recipe_edges` rows
        *   `[✅]`   Test: when no edges exist for the instance, `edges` is an empty array `[]`
        *   `[✅]`   Test: existing step normalization and validation behavior unchanged
        *   `[✅]`   Test: edge rows with missing `from_step_id` or `to_step_id` are handled (either filtered or cause error)
    *   `[✅]`   `construction`
        *   `[✅]`   Signature unchanged: `getStageRecipe(payload: { stageSlug: string }, dbClient: SupabaseClient<Database>)`
        *   `[✅]`   After querying steps (existing line 45-56), add a query for `dialectic_stage_recipe_edges` filtered by `instance_id`, selecting `from_step_id` and `to_step_id`
        *   `[✅]`   Map rows to `ProgressRecipeEdge[]`
        *   `[✅]`   Include `edges` in the `StageRecipeResponse` object (line 210-214)
    *   `[✅]`   supabase/functions/dialectic-service/`getStageRecipe.ts`
        *   `[✅]`   After step query (line 45-56), add: query `dialectic_stage_recipe_edges` table with `.select('from_step_id, to_step_id').eq('instance_id', instanceId)`
        *   `[✅]`   Validate each edge row has non-empty string `from_step_id` and `to_step_id`
        *   `[✅]`   Map validated rows to `ProgressRecipeEdge[]`
        *   `[✅]`   Update response construction (line 210-214) from `{ stageSlug, instanceId, steps: normalized }` to `{ stageSlug, instanceId, steps: normalized, edges }`
    *   `[✅]`   `provides`
        *   `[✅]`   `getStageRecipe` endpoint now returns `{ stageSlug, instanceId, steps, edges }`
        *   `[✅]`   Semantic guarantee: `edges` faithfully reflects `dialectic_stage_recipe_edges` for the active instance
        *   `[✅]`   Stability: empty `edges` array when no edges exist (never undefined)
    *   `[✅]`   supabase/functions/dialectic-service/`getStageRecipe.mock.ts`
        *   `[✅]`   Not required — function is tested directly with mocked Supabase client
    *   `[✅]`   supabase/functions/dialectic-service/`getStageRecipe.integration.test.ts`
        *   `[✅]`   Not required — integration tested via existing index.test.ts dispatch
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: infrastructure (backend edge function)
        *   `[✅]`   Dependencies inward-facing: database tables, `dialectic.interface.ts` types
        *   `[✅]`   Provides outward to: `@paynless/api` dialectic adapter → `fetchStageRecipe` store action
    *   `[✅]`   `requirements`
        *   `[✅]`   `edges` array present in every `getStageRecipe` response
        *   `[✅]`   No regression in step data returned by the endpoint
        *   `[✅]`   Edge query uses same `instanceId` as step query for consistency
    *   `[✅]`   **Commit** `fix(be) dialectic-service/getStageRecipe add edge data to recipe response`
        *   `[✅]`   Modified: `supabase/functions/dialectic-service/dialectic.interface.ts` — `StageRecipeResponse` gains `edges: ProgressRecipeEdge[]`
        *   `[✅]`   Modified: `supabase/functions/dialectic-service/getStageRecipe.ts` — queries `dialectic_stage_recipe_edges`, includes edges in response
        *   `[✅]`   Modified: `supabase/functions/dialectic-service/getStageRecipe.test.ts` — tests for edge inclusion

*   `[✅]`   `[STORE]` packages/store/src/dialecticStore.documents **Consume new `getAllStageProgress` response envelope**
    *   `[✅]`   `objective`
        *   `[✅]`   Update `hydrateAllStageProgressLogic` to destructure `{ dagProgress, stages }` from the backend response instead of treating it as a flat array
        *   `[✅]`   Map the new per-stage `progress: { completedSteps, totalSteps, failedSteps }` and `steps: StepProgressDto[]` into `StageRunProgressSnapshot`
        *   `[✅]`   Add `progress` field to `StageRunProgressSnapshot` for step-based progress alongside existing `jobProgress` (which notification handlers still write to)
        *   `[✅]`   Update `hydrateStageProgressLogic` snapshot initialization to include `progress` field
        *   `[✅]`   Preserve existing document descriptor mapping unchanged
    *   `[✅]`   `role`
        *   `[✅]`   State management — store logic processing API response into UI-consumable state
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store — progress hydration logic
        *   `[✅]`   Bounded to response parsing and state mapping; API calls are in `@paynless/api`
    *   `[✅]`   `deps`
        *   `[✅]`   `getAllStageProgress` backend — API response producer — outward — returns `{ dagProgress: DagProgressDto; stages: StageProgressEntry[] }`
        *   `[✅]`   `@paynless/api` dialectic adapter — adapter — inward — `dialecticApi.getAllStageProgress(payload)` call signature
        *   `[✅]`   `isStageRenderedDocumentChecklistEntry` from `@paynless/utils` (line 122 of `packages/utils/src/type_guards.ts`) — utility — inward — document validation
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From API: `response.data` typed as `GetAllStageProgressResponse` — now `{ dagProgress: DagProgressDto; stages: StageProgressEntry[] }`
        *   `[✅]`   From existing: `isStepStatus` local guard (line 79 of `dialecticStore.documents.ts`)
        *   `[✅]`   Confirm no concrete imports from backend `supabase/functions/`
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   Add `DagProgressDto`: `{ completedStages: number; totalStages: number }` — frontend equivalent of backend `DagProgressDto` (backend `dialectic.interface.ts` line 678)
        *   `[✅]`   Add `StepProgressDto`: `{ stepKey: string; status: UnifiedProjectStatus }` — frontend equivalent using `UnifiedProjectStatus` (not backend `UnifiedStageStatus`; values are identical: `'not_started' | 'in_progress' | 'completed' | 'failed'`)
        *   `[✅]`   Replace `StageProgressEntry` (currently at line 1036: `{ stageSlug, documents: StageDocumentChecklistEntry[], stepStatuses: Record<string, string>, stageStatus: UnifiedProjectStatus, jobProgress: StepJobProgress }`) with new shape: `{ stageSlug: string; status: UnifiedProjectStatus; modelCount: number | null; progress: { completedSteps: number; totalSteps: number; failedSteps: number }; steps: StepProgressDto[]; documents: StageDocumentChecklistEntry[] }`
        *   `[✅]`   Replace `GetAllStageProgressResponse` (currently at line 1044: `StageProgressEntry[]`) with: `{ dagProgress: DagProgressDto; stages: StageProgressEntry[] }`
        *   `[✅]`   Add `progress: { completedSteps: number; totalSteps: number; failedSteps: number }` to `StageRunProgressSnapshot` (currently at line 489: `{ stepStatuses, documents, jobProgress }`) — keep `jobProgress: StepJobProgress` for backward compatibility with notification handlers (`handlePlannerStartedLogic`, `handleExecuteStartedLogic`, etc. in same file)
        *   `[✅]`   Keep `JobProgressEntry` and `StepJobProgress` types — still used by `StageRunProgressSnapshot.jobProgress` and notification handlers
    *   `[✅]`   packages/utils/src/`type_guards.test.ts`
        *   `[✅]`   Contract: `DagProgressDto` requires `completedStages` and `totalStages` as numbers
        *   `[✅]`   Contract: `StepProgressDto` requires `stepKey` as non-empty string and `status` as valid `UnifiedProjectStatus`
        *   `[✅]`   Contract: new `StageProgressEntry` requires `stageSlug`, `status`, `modelCount`, `progress`, `steps`, `documents`
        *   `[✅]`   Contract: `GetAllStageProgressResponse` requires `dagProgress` object and `stages` array
    *   `[✅]`   packages/utils/src/`type_guards.ts`
        *   `[✅]`   Guard `isDagProgressDto`: validates `completedStages` and `totalStages` are numbers
        *   `[✅]`   Guard `isStepProgressDto`: validates `stepKey` is non-empty string and `status` is valid `UnifiedProjectStatus`
        *   `[✅]`   Guard `isGetAllStageProgressResponse`: validates object has `dagProgress` (passes `isDagProgressDto`) and `stages` (is array)
        *   `[✅]`   Existing `isStageRenderedDocumentChecklistEntry` (line 122) unchanged
    *   `[✅]`   packages/store/src/`dialecticStore.documents.test.ts`
        *   `[✅]`   Update `hydrateAllStageProgressLogic` tests (describe block at line 166) to provide new response shape: `{ dagProgress: { completedStages, totalStages }, stages: [{ stageSlug, status, modelCount, progress: { completedSteps, totalSteps, failedSteps }, steps: [{ stepKey, status }], documents: [...] }] }`
        *   `[✅]`   Test: `stepStatuses` populated by mapping `entry.steps[].stepKey → entry.steps[].status`
        *   `[✅]`   Test: `progress` field stored from `entry.progress` — `{ completedSteps, totalSteps, failedSteps }`
        *   `[✅]`   Test: documents still validated with `isStageRenderedDocumentChecklistEntry` and mapped to `StageRunDocumentDescriptor`
        *   `[✅]`   Test: `jobProgress` initialized as `{}` (not populated from response — notification handlers populate it separately)
        *   `[✅]`   Test: empty `stages` array → early return, no state mutation
        *   `[✅]`   Test: snapshot initialization includes `progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }`
        *   `[✅]`   Update `hydrateStageProgressLogic` tests to verify snapshot initialization includes `progress` field
        *   `[✅]`   Existing notification handler tests (`handlePlannerStartedLogic` at line 3738, `handleExecuteStartedLogic` at line 3803, etc.) that construct snapshots with `jobProgress` must also include `progress` field in their setup
    *   `[✅]`   `construction`
        *   `[✅]`   Signature unchanged: `hydrateAllStageProgressLogic(set, payload: GetAllStageProgressPayload): Promise<void>`
        *   `[✅]`   Destructure response: `const { dagProgress, stages } = response.data` (replaces `const entries = response.data`)
        *   `[✅]`   Guard check: replace `response.data.length === 0` (line 1708) with `stages.length === 0`
        *   `[✅]`   Iterate `stages` instead of `entries`
    *   `[✅]`   packages/store/src/`dialecticStore.documents.ts`
        *   `[✅]`   In `hydrateAllStageProgressLogic` (line 1687): destructure `{ dagProgress, stages }` from `response.data`; replace `response.data.length === 0` with `stages.length === 0`; replace `const entries = response.data` with iteration over `stages`
        *   `[✅]`   Replace `entry.jobProgress` mapping (lines 1745-1748) with: map `entry.steps` array to `progress.stepStatuses` as `{ [step.stepKey]: step.status }` for each `StepProgressDto` in `entry.steps`
        *   `[✅]`   Replace `entry.stepStatuses` mapping (lines 1750-1754) — no longer needed as a separate field; step statuses now come from `entry.steps` mapped above
        *   `[✅]`   Add: store `entry.progress` as `progress.progress = { completedSteps: entry.progress.completedSteps, totalSteps: entry.progress.totalSteps, failedSteps: entry.progress.failedSteps }`
        *   `[✅]`   Keep document mapping (lines 1756-1775) unchanged — `entry.documents` is still `StageDocumentChecklistEntry[]` validated with `isStageRenderedDocumentChecklistEntry`
        *   `[✅]`   Update snapshot initialization (line 1740-1744) from `{ documents: {}, stepStatuses: {}, jobProgress: {} }` to `{ documents: {}, stepStatuses: {}, jobProgress: {}, progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 } }`
        *   `[✅]`   In `hydrateStageProgressLogic` (line 1637): update snapshot initialization from `{ documents: {}, stepStatuses: {}, jobProgress: {} }` to `{ documents: {}, stepStatuses: {}, jobProgress: {}, progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 } }`
    *   `[✅]`   `provides`
        *   `[✅]`   Store action: `hydrateAllStageProgress` — consumes new response envelope
        *   `[✅]`   Store state: `stageRunProgress[key].progress` — `{ completedSteps, totalSteps, failedSteps }`
        *   `[✅]`   Store state: `stageRunProgress[key].stepStatuses` — populated from `StepProgressDto[]`
        *   `[✅]`   Store state: `stageRunProgress[key].documents` — unchanged
        *   `[✅]`   Store state: `stageRunProgress[key].jobProgress` — preserved for notification handler compatibility, initialized empty
        *   `[✅]`   Semantic guarantee: UI components see stable, non-regressing step-based progress values
    *   `[✅]`   apps/web/src/mocks/`dialecticStore.mock.ts`
        *   `[✅]`   Update any snapshot construction in mock initial state to include `progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }`
        *   `[✅]`   Mock delegates to `hydrateAllStageProgressLogic` directly (existing pattern) — behavior updates automatically
    *   `[✅]`   packages/store/src/`dialecticStore.documents.integration.test.ts`
        *   `[✅]`   Existing integration tests updated to provide new response shape if they call `hydrateAllStageProgress`
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application (store)
        *   `[✅]`   Dependencies inward-facing: `@paynless/api` (adapter), `@paynless/types` (domain types), `@paynless/utils` (guards)
        *   `[✅]`   Provides outward to: `selectUnifiedProjectProgress` selector, UI components via store state
    *   `[✅]`   `requirements`
        *   `[✅]`   `hydrateAllStageProgressLogic` correctly destructures `{ dagProgress, stages }` envelope
        *   `[✅]`   `stageRunProgress[key].progress` reflects backend-computed step counts
        *   `[✅]`   `stageRunProgress[key].stepStatuses` populated from `StepProgressDto[]` step status values
        *   `[✅]`   Document descriptor mapping unchanged — no regression
        *   `[✅]`   Notification handlers (`handlePlannerStartedLogic`, `handleExecuteStartedLogic`, etc.) continue to write to `jobProgress` without error
        *   `[✅]`   `useStageRunProgressHydration` hook (at `apps/web/src/hooks/useStageRunProgressHydration.ts`) continues to function — calls `hydrateAllStageProgress` with same payload shape

*   `[✅]`   `[STORE]` packages/store/src/dialecticStore.selectors **Step-based progress computation in `selectUnifiedProjectProgress`**
    *   `[✅]`   `objective`
        *   `[✅]`   Refactor `selectUnifiedProjectProgress` to derive progress from `stepStatuses` (step-based) instead of `jobProgress` (job-based)
        *   `[✅]`   Simplify `StepProgressDetail` to contain only `stepKey`, `stepName`, `status` — remove job count fields (`totalJobs`, `completedJobs`, `inProgressJobs`, `failedJobs`, `stepPercentage`)
        *   `[✅]`   Compute `stagePercentage` as `(completedSteps / totalSteps) * 100` derived from counting step statuses, not averaging job percentages
    *   `[✅]`   `role`
        *   `[✅]`   State management — selector computing derived progress view from store state
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store — selectors
        *   `[✅]`   Bounded to reading `DialecticStateValues` and returning computed views; no mutations
    *   `[✅]`   `deps`
        *   `[✅]`   `StageRunProgressSnapshot` from `@paynless/types` — domain — inward — now includes `progress` and `stepStatuses`
        *   `[✅]`   `selectStageRunProgress` selector (line 634 of same file) — same module — inward — returns snapshot
        *   `[✅]`   `recipesByStageSlug` store state — same module — inward — recipe steps for step names
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From store state: `state.recipesByStageSlug[stageSlug].steps` — step metadata (step_key, step_name)
        *   `[✅]`   From store state: `selectStageRunProgress(state, sessionId, stageSlug, iterationNumber)` — returns `StageRunProgressSnapshot` with `stepStatuses` and `progress`
        *   `[✅]`   Confirm no concrete imports from backend
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   Update `StepProgressDetail` (currently at line 498: `{ stepKey, stepName, totalJobs, completedJobs, inProgressJobs, failedJobs, stepPercentage, status }`) to: `{ stepKey: string; stepName: string; status: UnifiedProjectStatus }` — remove all job count fields and `stepPercentage`
        *   `[✅]`   Update `StageProgressDetail` (currently at line 509: `{ stageSlug, totalSteps, completedSteps, stagePercentage, stepsDetail, stageStatus }`) to add `failedSteps: number` — becomes `{ stageSlug: string; totalSteps: number; completedSteps: number; failedSteps: number; stagePercentage: number; stepsDetail: StepProgressDetail[]; stageStatus: UnifiedProjectStatus }`
    *   `[✅]`   packages/store/src/`dialecticStore.selectors.test.ts`
        *   `[✅]`   Update `selectUnifiedProjectProgress` tests to construct `StageRunProgressSnapshot` with `stepStatuses` and `progress` instead of `jobProgress`
        *   `[✅]`   Test: per-step status read from `stepStatuses[stepKey]` — not computed from job counts
        *   `[✅]`   Test: `completedSteps` = count of steps with `status === 'completed'` in `stepStatuses`
        *   `[✅]`   Test: `failedSteps` = count of steps with `status === 'failed'` in `stepStatuses`
        *   `[✅]`   Test: `totalSteps` = number of recipe steps for that stage
        *   `[✅]`   Test: `stagePercentage` = `(completedSteps / totalSteps) * 100`
        *   `[✅]`   Test: `stageStatus` derived from step statuses: any `failed` → `failed`, any `in_progress` → `in_progress`, all `completed` → `completed`, else `not_started`
        *   `[✅]`   Test: `StepProgressDetail` contains only `{ stepKey, stepName, status }` — no job count fields
        *   `[✅]`   Test: `StageProgressDetail` contains `failedSteps`
    *   `[✅]`   `construction`
        *   `[✅]`   Signature unchanged: `selectUnifiedProjectProgress(state: DialecticStateValues, sessionId: string): UnifiedProjectProgress`
        *   `[✅]`   Replace `jobEntry = progress?.jobProgress?.[stepKey]` lookup (line 853) with `stepStatus = progress?.stepStatuses?.[stepKey] ?? 'not_started'`
        *   `[✅]`   Remove all job count computation (lines 869-877) and job-based status derivation (lines 879-888)
        *   `[✅]`   Step status read directly from `stepStatuses`; percentage is binary (100 if completed, 0 otherwise) or use stored `progress` counts
    *   `[✅]`   packages/store/src/`dialecticStore.selectors.ts`
        *   `[✅]`   In `selectUnifiedProjectProgress` (line 805): replace the per-step loop body (lines 851-904) — instead of reading `jobProgress[stepKey]` and computing from job counts, read `progress?.stepStatuses?.[stepKey]` directly for status
        *   `[✅]`   Build `StepProgressDetail` as `{ stepKey, stepName: step.step_name, status: stepStatus }` — no job counts
        *   `[✅]`   Compute stage-level `completedSteps` by counting steps with `status === 'completed'`
        *   `[✅]`   Compute stage-level `failedSteps` by counting steps with `status === 'failed'`
        *   `[✅]`   Compute `stagePercentage` as `totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0`
        *   `[✅]`   Derive `stageStatus`: any step `failed` → `failed`, any step `in_progress` → `in_progress`, all steps `completed` → `completed`, else `not_started`
        *   `[✅]`   Build `StageProgressDetail` with `{ stageSlug, totalSteps, completedSteps, failedSteps, stagePercentage, stepsDetail, stageStatus }`
        *   `[✅]`   `completedStagesCount`, `overallPercentage`, `projectStatus` aggregation logic (lines 921-934) unchanged in structure, just uses new stage-level values
    *   `[✅]`   `provides`
        *   `[✅]`   `selectUnifiedProjectProgress` — returns step-based `UnifiedProjectProgress`
        *   `[✅]`   Semantic guarantee: progress values are structural (step-count-based), not model-dependent (job-count-based)
        *   `[✅]`   Semantic guarantee: `StepProgressDetail` no longer exposes job internals to UI
    *   `[✅]`   packages/store/src/`dialecticStore.selectors.mock.ts`
        *   `[✅]`   Not a separate file — selector mocked via `vi.fn()` in `apps/web/src/mocks/dialecticStore.mock.ts`; callers set return values per-test; no change needed
    *   `[✅]`   packages/store/src/`dialecticStore.selectors.integration.test.ts`
        *   `[✅]`   Not required — selector is pure function tested via unit tests
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application (store selector)
        *   `[✅]`   Dependencies inward-facing: `@paynless/types` (domain types), `dialecticStore.selectors.ts` same-module selectors
        *   `[✅]`   Provides outward to: `StageDAGProgressDialog`, `StageTabCard`, `DynamicProgressBar`, and other UI components consuming `UnifiedProjectProgress`
    *   `[✅]`   `requirements`
        *   `[✅]`   `selectUnifiedProjectProgress` returns step-count-based progress — no job count fields in output
        *   `[✅]`   `StepProgressDetail` contains only `{ stepKey, stepName, status }` — existing UI consumers that read job counts must be identified and updated (discovery if needed)
        *   `[✅]`   `stagePercentage` computed from step completion ratio, not job completion ratio
        *   `[✅]`   No regression in `overallPercentage` or `projectStatus` aggregation logic
    *   `[✅]`   **Commit** `feat(store) packages/store + packages/types adapt frontend to step-based DAG progress`
        *   `[✅]`   Modified: `packages/types/src/dialectic.types.ts` — added `DagProgressDto`, `StepProgressDto`; replaced `StageProgressEntry`, `GetAllStageProgressResponse`; added `progress` to `StageRunProgressSnapshot`; updated `StepProgressDetail`, `StageProgressDetail`
        *   `[✅]`   Modified: `packages/utils/src/type_guards.ts` — added `isDagProgressDto`, `isStepProgressDto`, `isGetAllStageProgressResponse`
        *   `[✅]`   Modified: `packages/utils/src/type_guards.test.ts` — guard contract tests
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.documents.ts` — `hydrateAllStageProgressLogic` consumes `{ dagProgress, stages }` envelope; `hydrateStageProgressLogic` snapshot init includes `progress`
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.documents.test.ts` — tests for new response shape
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.selectors.ts` — `selectUnifiedProjectProgress` uses `stepStatuses` not `jobProgress`
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.selectors.test.ts` — tests for step-based progress
        *   `[✅]`   Modified: `apps/web/src/mocks/dialecticStore.mock.ts` — snapshot init includes `progress`

*   `[✅]`   `[STORE]` packages/store/src/dialecticStore **Store recipe edges from `fetchStageRecipe` and initialize `progress` in `ensureRecipeForActiveStage`**
    *   `[✅]`   `objective`
        *   `[✅]`   Update `DialecticStageRecipe` type to include `edges` so that recipe data stored from `fetchStageRecipe` includes edge information from the backend (added in prior BE node)
        *   `[✅]`   Update `ensureRecipeForActiveStage` (line 2631) to initialize snapshots with the `progress` field added to `StageRunProgressSnapshot` in the prior node
        *   `[✅]`   No code change needed in `fetchStageRecipe` action itself — it already does `state.recipesByStageSlug[stageSlug] = response.data!` (line 2623) which stores the full response including edges
    *   `[✅]`   `role`
        *   `[✅]`   State management — recipe hydration and snapshot initialization
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store — recipe storage and progress snapshot creation
        *   `[✅]`   Bounded to storing API response data and initializing snapshot state
    *   `[✅]`   `deps`
        *   `[✅]`   `getStageRecipe` backend endpoint (updated in prior BE node) — API response producer — outward — now returns `{ stageSlug, instanceId, steps, edges }`
        *   `[✅]`   `@paynless/api` dialectic adapter — adapter — inward — `dialecticApi.fetchStageRecipe(stageSlug)` returns `ApiResponse<DialecticStageRecipe>`; type change flows through automatically
        *   `[✅]`   `DialecticStageRecipe` from `@paynless/types` — domain — inward
        *   `[✅]`   `StageRunProgressSnapshot` from `@paynless/types` — domain — inward — now requires `progress`
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From API: `response.data` typed as `DialecticStageRecipe` — now includes `edges: DialecticRecipeEdge[]`
        *   `[✅]`   From store: `state.recipesByStageSlug`, `state.stageRunProgress`
        *   `[✅]`   Confirm no concrete imports from backend
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   Add `DialecticRecipeEdge`: `{ from_step_id: string; to_step_id: string }` — frontend equivalent of backend `ProgressRecipeEdge` (backend `dialectic.interface.ts` line 525)
        *   `[✅]`   Update `DialecticStageRecipe` (currently at line 236: `{ stageSlug, instanceId, steps }`) to add `edges: DialecticRecipeEdge[]` — becomes `{ stageSlug: string; instanceId: string; steps: DialecticStageRecipeStep[]; edges: DialecticRecipeEdge[] }`
    *   `[✅]`   packages/utils/src/`type_guards.test.ts`
        *   `[✅]`   Contract: `DialecticRecipeEdge` requires `from_step_id` and `to_step_id` as non-empty strings
    *   `[✅]`   packages/utils/src/`type_guards.ts`
        *   `[✅]`   Guard `isDialecticRecipeEdge`: validates `from_step_id` and `to_step_id` are non-empty strings
    *   `[✅]`   packages/store/src/`dialecticStore.recipes.test.ts`
        *   `[✅]`   Update `fetchStageRecipe` tests (describe block at line 83) to include `edges` in mock response data
        *   `[✅]`   Test: `recipesByStageSlug[stageSlug].edges` populated with edge array from response
        *   `[✅]`   Test: existing step storage unchanged
    *   `[✅]`   packages/store/src/`dialecticStore.test.ts`
        *   `[✅]`   Update `ensureRecipeForActiveStage` tests to verify new snapshot includes `progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }`
        *   `[✅]`   Existing `ensureRecipeForActiveStage` tests that construct snapshots with `{ documents: {}, stepStatuses: {...}, jobProgress: {} }` must add `progress` field
    *   `[✅]`   `construction`
        *   `[✅]`   `fetchStageRecipe` (line 2618): no code change — `state.recipesByStageSlug[stageSlug] = response.data!` already stores full response; type change makes `edges` available automatically
        *   `[✅]`   `ensureRecipeForActiveStage` (line 2631): update snapshot initialization (line 2644-2648) from `{ documents: {}, stepStatuses, jobProgress: {} }` to `{ documents: {}, stepStatuses, jobProgress: {}, progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 } }`
    *   `[✅]`   packages/store/src/`dialecticStore.ts`
        *   `[✅]`   In `ensureRecipeForActiveStage` (line 2644): update snapshot initialization to include `progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }`
        *   `[✅]`   `fetchStageRecipe` (line 2618): no code change needed — verify type propagation
    *   `[✅]`   `provides`
        *   `[✅]`   Store state: `recipesByStageSlug[slug].edges` — `DialecticRecipeEdge[]` — available for DAG layout computation
        *   `[✅]`   Store state: `stageRunProgress[key]` snapshots initialized with `progress` field
        *   `[✅]`   Semantic guarantee: edges match backend recipe structure; snapshot initialization consistent with updated `StageRunProgressSnapshot`
    *   `[✅]`   apps/web/src/mocks/`dialecticStore.mock.ts`
        *   `[✅]`   Update any mock recipe data construction to include `edges: []` default
        *   `[✅]`   Verify mock `ensureRecipeForActiveStage` snapshot initialization includes `progress`
    *   `[✅]`   packages/store/src/`dialecticStore.integration.test.ts`
        *   `[✅]`   Verify `fetchStageRecipe` → `recipesByStageSlug[slug].edges` populated in integration context
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application (store)
        *   `[✅]`   Dependencies inward-facing: `@paynless/api` (adapter), `@paynless/types` (domain types)
        *   `[✅]`   Provides outward to: `computeDAGLayout` (domain utility), `StageDAGProgressDialog` (UI component)
    *   `[✅]`   `requirements`
        *   `[✅]`   `recipesByStageSlug[slug].edges` available for any hydrated stage
        *   `[✅]`   `ensureRecipeForActiveStage` creates snapshots compatible with updated `StageRunProgressSnapshot`
        *   `[✅]`   No regression in existing recipe step storage or snapshot initialization
        *   `[✅]`   `useStageRunProgressHydration` hook continues to function — calls `fetchStageRecipe` and `ensureRecipeForActiveStage` with same signatures
    *   `[✅]`   **Commit** `feat(store) packages/store + packages/types add recipe edges and progress snapshot init`
        *   `[✅]`   Modified: `packages/types/src/dialectic.types.ts` — added `DialecticRecipeEdge`, updated `DialecticStageRecipe` with `edges`
        *   `[✅]`   Modified: `packages/utils/src/type_guards.ts` — added `isDialecticRecipeEdge`
        *   `[✅]`   Modified: `packages/utils/src/type_guards.test.ts` — guard contract test
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.ts` — `ensureRecipeForActiveStage` snapshot init includes `progress`
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.recipes.test.ts` — tests for edge storage
        *   `[✅]`   Modified: `packages/store/src/dialecticStore.test.ts` — tests for snapshot init with `progress`

*   `[✅]`   `[UI]` apps/web/src/components/dialectic/dagLayout **Compute layered node positions from recipe steps and edges**
    *   `[✅]`   `objective`
        *   `[✅]`   Accept recipe steps and edges; compute (x, y) positions for each step node arranged in topological layers
        *   `[✅]`   Steps at the same topological depth occupy the same column (left-to-right flow) or row (top-to-bottom flow)
        *   `[✅]`   Return node positions and edge connection coordinates suitable for SVG rendering
        *   `[✅]`   Pure computation — no React, no DOM, no side effects
        *   `[✅]`   Layout reacts to window size; when optional viewport is provided, scale layout to fit the user's viewport and prefer the largest dimension (wide screens → horizontal layout, tall screens → vertical layout)
    *   `[✅]`   `role`
        *   `[✅]`   Domain utility — pure layout computation for DAG visualization
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress popup — layout engine
        *   `[✅]`   Bounded to recipe step arrays and edge arrays; no awareness of store, DOM, or React
    *   `[✅]`   `deps`
        *   `[✅]`   `DialecticStageRecipeStep` type from `@paynless/types` — domain — inward
        *   `[✅]`   `DialecticRecipeEdge` type from `@paynless/types` — domain — inward
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `(params: DAGLayoutParams): DAGLayoutResult` — pure function, no Deps object needed (no external services)
        *   `[✅]`   Params: `{ steps: DialecticStageRecipeStep[]; edges: DialecticRecipeEdge[] }`; optional `viewport?: DAGViewport` for viewport-driven orientation and scale-to-fit
        *   `[✅]`   Confirm no concrete imports from store or UI layers
    *   `[✅]`   packages/types/src/`dialectic.types.ts` (DAG layout types live in types workspace)
        *   `[✅]`   `DAGLayoutParams`: `{ steps: DialecticStageRecipeStep[]; edges: DialecticRecipeEdge[]; viewport?: DAGViewport }`
        *   `[✅]`   `DAGViewport`: `{ width: number; height: number }` — for viewport-driven layout
        *   `[✅]`   `DAGLayoutOrientation`: `'horizontal' | 'vertical'` — for result orientation
        *   `[✅]`   `DAGNodePosition`: `{ stepKey: string; stepName: string; jobType: RecipeJobType; x: number; y: number; layer: number }`
        *   `[✅]`   `DAGEdgePosition`: `{ fromStepKey: string; toStepKey: string; fromX: number; fromY: number; toX: number; toY: number }`
        *   `[✅]`   `DAGLayoutResult`: `{ nodes: DAGNodePosition[]; edges: DAGEdgePosition[]; width: number; height: number; orientation?: DAGLayoutOrientation }` —  `orientation` set when viewport provided
    *   `[✅]`   apps/web/src/components/dialectic/`dagLayout.test.ts`
        *   `[✅]`   Single node, no edges → one node at origin, no edge positions, width/height equal to single node dimensions
        *   `[✅]`   Linear chain A→B→C → three nodes in successive layers, two edges connecting them
        *   `[✅]`   Fan-out PLAN→(EXEC1, EXEC2, EXEC3) → PLAN in layer 0, three EXECs in layer 1 stacked vertically
        *   `[✅]`   Diamond A→B, A→C, B→D, C→D → A layer 0, B/C layer 1, D layer 2
        *   `[✅]`   All node positions have non-negative x and y
        *   `[✅]`   Nodes in the same layer share the same x coordinate
        *   `[✅]`   No two nodes overlap (distinct y within same layer)
        *   `[✅]`   Edge `fromX`/`fromY` and `toX`/`toY` match their respective node positions
        *   `[✅]`   Empty steps array → empty nodes, empty edges, zero width/height
        *   `[✅]`   **Added (viewport):** Wide viewport (width > height) → `orientation === 'horizontal'`, layers vary along x
        *   `[✅]`   **Added (viewport):** Tall viewport (height > width) → `orientation === 'vertical'`, layers vary along y
        *   `[✅]`   **Added (viewport):** With viewport provided, result scales to fit (result width/height and all node/edge coords within viewport)
        *   `[✅]`   **Added (viewport):** Same graph with wide vs tall viewport yields different orientation (layout reacts to window size)
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `computeDAGLayout(params: DAGLayoutParams): DAGLayoutResult`; params may include optional `viewport`
        *   `[✅]`   Pure function — no state, no side effects, no DOM access
        *   `[✅]`   Prohibited: construction inside a React component render — call in `useMemo` only
    *   `[✅]`   apps/web/src/components/dialectic/`dagLayout.ts`
        *   `[✅]`   Build adjacency list and in-degree map from `params.edges`
        *   `[✅]`   Assign each step to a topological layer (longest-path-from-root depth assignment)
        *   `[✅]`   Within each layer, assign vertical positions (evenly spaced)
        *   `[✅]`   Compute (x, y) for each node: x = layer * horizontalSpacing, y = indexInLayer * verticalSpacing (horizontal mode); when viewport present and vertical, use y for layer and x for index-in-layer
        *   `[✅]`   Compute edge connection points from source node right edge to target node left edge
        *   `[✅]`   Compute overall width and height from max layer and max nodes-in-layer
        *   `[✅]`   Return `{ nodes, edges, width, height }`; when `params.viewport` provided, also set `orientation` and scale positions to fit viewport
        *   `[✅]`   **Added (viewport):** When `params.viewport` present: set `orientation` to `'horizontal'` if viewport.width >= viewport.height, else `'vertical'`; scale layout so result fits within viewport (result.width <= viewport.width, result.height <= viewport.height; all node and edge coordinates within bounds)
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `computeDAGLayout` function
        *   `[✅]`   Exported types (from `@paynless/types`): `DAGLayoutParams`, `DAGViewport`, `DAGLayoutOrientation`, `DAGNodePosition`, `DAGEdgePosition`, `DAGLayoutResult`
        *   `[✅]`   Semantic guarantee: nodes in topological order, no overlaps, edges connect correct nodes
        *   `[✅]`   **Added:** When viewport provided: layout scales to fit viewport; orientation prefers largest dimension (wide → horizontal, tall → vertical)
        *   `[✅]`   Stability guarantee: deterministic for identical inputs
    *   `[✅]`   apps/web/src/components/dialectic/`dagLayout.mock.ts`
        *   `[✅]`   Not required — pure function, cheap to call directly in consumer tests
    *   `[✅]`   apps/web/src/components/dialectic/`dagLayout.integration.test.ts`
        *   `[✅]`   Not required — no I/O or external dependencies
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: domain (pure computation)
        *   `[✅]`   Dependencies inward-facing: `@paynless/types` (type definitions only)
        *   `[✅]`   Provides outward to: `StageDAGProgressDialog` component
    *   `[✅]`   `requirements`
        *   `[✅]`   Handles all existing recipe topologies (thesis 5-step fan-out, synthesis 13-step complex DAG, parenthesis 4-step linear)
        *   `[✅]`   Layout fits within reasonable SVG viewport (scrollable if necessary)
        *   `[✅]`   **Added:** Layout reacts to window size; scales to fit user viewport when viewport provided; wide screens get horizontal layout, tall screens get vertical layout (prefer largest dimension)
        *   `[✅]`   No external graph library dependency

*   `[✅]`   `[UI]` apps/web/src/components/dialectic/StageDAGProgressDialog **DAG progress popup with live node status overlay**
    *   `[✅]`   `objective`
        *   `[✅]`   Render a Dialog (shadcn) containing an SVG visualization of the active stage's recipe DAG
        *   `[✅]`   Each DAG node represents a recipe step, colored by status: grey (`not_started`), amber-pulse (`in_progress`), green (`completed`), red (`failed`)
        *   `[✅]`   Edges rendered as lines/arrows between connected nodes
        *   `[✅]`   Node colors update reactively as notifications flow through the store and `stageRunProgress` updates
        *   `[✅]`   Dialog auto-closes when the first rendered document arrives for this stage (first `StageRunDocumentDescriptor` with `descriptorType === 'rendered'` and `status === 'completed'`)
        *   `[✅]`   Dialog can be manually dismissed at any time
        *   `[✅]`   Each node displays `step_name` label — no per-step job count badge (progress is step-based, not job-based)
    *   `[✅]`   `role`
        *   `[✅]`   UI component — presentation and reactivity
    *   `[✅]`   `module`
        *   `[✅]`   DAG progress popup — dialog with SVG DAG rendering
        *   `[✅]`   Bounded to reading store state and rendering; no API calls, no store mutations
    *   `[✅]`   `deps`
        *   `[✅]`   `computeDAGLayout` from `apps/web/src/components/dialectic/dagLayout.ts` — domain — inward — layout computation
        *   `[✅]`   `useDialecticStore` from `@paynless/store` — store — inward — reactive state access
        *   `[✅]`   `selectUnifiedProjectProgress` from `@paynless/store` (at `packages/store/src/dialecticStore.selectors.ts` line 805) — store — inward — per-step status (now step-based, no job counts)
        *   `[✅]`   `selectStageRunProgress` from `@paynless/store` (at `packages/store/src/dialecticStore.selectors.ts` line 634) — store — inward — document descriptors for auto-close
        *   `[✅]`   `recipesByStageSlug` store state — store — inward — recipe steps and edges
        *   `[✅]`   shadcn `Dialog` component from `@/components/ui/dialog` — UI library — inward
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From store: `state.recipesByStageSlug[stageSlug]` → `{ steps: DialecticStageRecipeStep[], edges: DialecticRecipeEdge[] }`
        *   `[✅]`   From store: `selectUnifiedProjectProgress(state, sessionId)` → `stageDetails[].stepsDetail[]` — each `StepProgressDetail` has `{ stepKey, stepName, status }` (no job counts after prior selector refactor)
        *   `[✅]`   From store: `selectStageRunProgress(state, sessionId, stageSlug, iterationNumber)` → `StageRunProgressSnapshot.documents`
        *   `[✅]`   Props: `open: boolean; onOpenChange: (open: boolean) => void; stageSlug: string; sessionId: string; iterationNumber: number`
        *   `[✅]`   Confirm no concrete imports from backend layers
    *   `[✅]`   apps/web/src/components/dialectic/`StageDAGProgressDialog.types.ts`
        *   `[✅]`   `StageDAGProgressDialogProps`: `{ open: boolean; onOpenChange: (open: boolean) => void; stageSlug: string; sessionId: string; iterationNumber: number }`
    *   `[✅]`   apps/web/src/components/dialectic/`StageDAGProgressDialog.test.tsx`
        *   `[✅]`   Renders Dialog when `open` is true; does not render content when `open` is false
        *   `[✅]`   Renders an SVG element containing node rects for each step in the recipe
        *   `[✅]`   Renders edge lines between connected nodes
        *   `[✅]`   Node for a `not_started` step has grey fill
        *   `[✅]`   Node for a `completed` step has green fill
        *   `[✅]`   Node for a `failed` step has red fill
        *   `[✅]`   Node for an `in_progress` step has amber fill with pulse animation class
        *   `[✅]`   Each node displays `step_name` text label
        *   `[✅]`   Auto-close: when `stageRunProgress` documents include a `rendered` + `completed` descriptor, `onOpenChange(false)` is called
        *   `[✅]`   Manual dismiss: clicking close button calls `onOpenChange(false)`
        *   `[✅]`   Empty recipe (no steps) → Dialog body shows "No recipe data available"
    *   `[✅]`   `construction`
        *   `[✅]`   Signature: `StageDAGProgressDialog: React.FC<StageDAGProgressDialogProps>`
        *   `[✅]`   Layout computed via `useMemo(() => computeDAGLayout({ steps, edges }), [steps, edges])`
        *   `[✅]`   Status derived via `useDialecticStore(state => selectUnifiedProjectProgress(state, sessionId))` — find matching `stageDetails` entry by `stageSlug`, then map `stepsDetail[].stepKey → stepsDetail[].status`
        *   `[✅]`   Auto-close via `useEffect` watching `selectStageRunProgress(state, sessionId, stageSlug, iterationNumber).documents`
        *   `[✅]`   Prohibited: direct API calls, store mutations, or layout computation outside `useMemo`
    *   `[✅]`   apps/web/src/components/dialectic/`StageDAGProgressDialog.tsx`
        *   `[✅]`   Read recipe from `useDialecticStore(state => state.recipesByStageSlug[stageSlug])`
        *   `[✅]`   Compute layout: `const layout = useMemo(() => computeDAGLayout({ steps: recipe.steps, edges: recipe.edges }), [recipe])`
        *   `[✅]`   Read step progress: subscribe to `selectUnifiedProjectProgress` and find matching `stageDetails` entry by `stageSlug`
        *   `[✅]`   Build status map: `Map<stepKey, UnifiedProjectStatus>` from `stepsDetail[].stepKey → stepsDetail[].status` — status only, no job counts
        *   `[✅]`   Render `<Dialog open={open} onOpenChange={onOpenChange}>` with `<DialogContent>`
        *   `[✅]`   Render `<svg viewBox="..." width={layout.width} height={layout.height}>`
        *   `[✅]`   For each `layout.edges`: render `<line>` or `<path>` with arrow marker
        *   `[✅]`   For each `layout.nodes`: render `<rect>` with fill color from status map, `<text>` for step_name
        *   `[✅]`   Color mapping: `not_started` → `#9ca3af` (grey), `in_progress` → `#f59e0b` (amber), `completed` → `#10b981` (green), `failed` → `#ef4444` (red)
        *   `[✅]`   Auto-close `useEffect`: watch `selectStageRunProgress(state, sessionId, stageSlug, iterationNumber).documents`; when any entry has `descriptorType === 'rendered'` and `status === 'completed'`, call `onOpenChange(false)`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported symbol: `StageDAGProgressDialog` component
        *   `[✅]`   Semantic guarantee: node colors reflect real-time store state
        *   `[✅]`   Semantic guarantee: auto-closes on first rendered document arrival
    *   `[✅]`   apps/web/src/components/dialectic/`StageDAGProgressDialog.mock.tsx`
        *   `[✅]`   Mock renders `data-testid="stage-dag-progress-dialog"` div with `open` prop for consumer tests
    *   `[✅]`   apps/web/src/components/dialectic/`StageDAGProgressDialog.integration.test.tsx`
        *   `[✅]`   Store seeded with recipe (steps + edges) and `stageRunProgress` → Dialog renders correct node count and colors
        *   `[✅]`   Store `stageRunProgress` updated mid-render → node color transitions from grey to green
        *   `[✅]`   Store `stageRunProgress.documents` gains a `rendered`+`completed` entry → Dialog auto-closes
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: UI (presentation)
        *   `[✅]`   Dependencies inward-facing: `computeDAGLayout` (domain), `useDialecticStore` (store), shadcn `Dialog` (UI library)
        *   `[✅]`   Provides outward to: `GenerateContributionButton` (consumer)
    *   `[✅]`   `requirements`
        *   `[✅]`   DAG visualization is readable for recipes from 4 steps (parenthesis) to 13 steps (synthesis)
        *   `[✅]`   Node status updates are reactive — no polling, no manual refresh
        *   `[✅]`   Auto-close fires on first rendered document, not on first completed job
        *   `[✅]`   Manual dismiss available at all times
        *   `[✅]`   No external graph visualization library

*   `[✅]`   `[UI]` apps/web/src/components/dialectic/GenerateContributionButton **Integrate DAG progress popup on generate action**
    *   `[✅]`   `objective`
        *   `[✅]`   Open the `StageDAGProgressDialog` when the user clicks "Generate {Stage}"
        *   `[✅]`   Dialog opens immediately alongside the `generateContributions` call
        *   `[✅]`   Dialog closes automatically when first rendered document arrives (handled by `StageDAGProgressDialog` auto-close)
        *   `[✅]`   No change to existing generation logic or button disabled states
    *   `[✅]`   `role`
        *   `[✅]`   UI component — wiring existing button to new dialog
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic generation UI — button and dialog coordination
        *   `[✅]`   Bounded to local state management (dialog open/close) and existing store interactions
    *   `[✅]`   `deps`
        *   `[✅]`   `StageDAGProgressDialog` from `apps/web/src/components/dialectic/StageDAGProgressDialog.tsx` — UI — same layer — imported component
        *   `[✅]`   Existing `useDialecticStore` from `@paynless/store` — store — inward
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From store: `activeContextSessionId`, via `selectActiveStage(store)` → `activeStage.slug`, via `selectSessionById(store, activeContextSessionId)` → `activeSession.iteration_count`
        *   `[✅]`   Local state: `useState<boolean>` for dialog open/close
        *   `[✅]`   Confirm no new concrete imports from backend layers
    *   `[✅]`   apps/web/src/components/dialectic/`GenerateContributionButton.test.tsx` (existing file at `apps/web/src/components/dialectic/GenerateContributionButton.test.tsx`, 614 lines, new tests appended)
        *   `[✅]`   Clicking generate button opens DAG progress dialog (`data-testid="stage-dag-progress-dialog"` appears)
        *   `[✅]`   Dialog receives correct `stageSlug`, `sessionId`, `iterationNumber` props
        *   `[✅]`   Dialog `onOpenChange(false)` closes the dialog (no longer visible in DOM)
        *   `[✅]`   Existing 18 button behavior tests unaffected (disabled states, text labels, generation call, wallet checks)
    *   `[✅]`   `construction`
        *   `[✅]`   Local state: `const [dagDialogOpen, setDagDialogOpen] = useState(false)`
        *   `[✅]`   In existing `handleClick` function (line 100): add `setDagDialogOpen(true)` after the toast (line 112), before `generateContributions` call (line 115)
        *   `[✅]`   Render `<StageDAGProgressDialog>` as sibling to `<Button>` in return JSX (line 152-168), passing local state props
    *   `[✅]`   apps/web/src/components/dialectic/`GenerateContributionButton.tsx` (existing file, 169 lines)
        *   `[✅]`   Add import: `import { StageDAGProgressDialog } from './StageDAGProgressDialog';`
        *   `[✅]`   Add `useState` import (already imported from React via line 1)
        *   `[✅]`   Add state: `const [dagDialogOpen, setDagDialogOpen] = useState(false)` inside component body
        *   `[✅]`   In `handleClick` (line 100): add `setDagDialogOpen(true)` after toast.success (line 112), before the try/catch block (line 114)
        *   `[✅]`   In return JSX: render `<StageDAGProgressDialog open={dagDialogOpen} onOpenChange={setDagDialogOpen} stageSlug={activeStage.slug} sessionId={activeContextSessionId} iterationNumber={activeSession.iteration_count} />` as sibling to `<Button>`, wrapped in a fragment `<>...</>` if needed
    *   `[✅]`   `provides`
        *   `[✅]`   Updated `GenerateContributionButton` component — now opens DAG popup on generate
        *   `[✅]`   Semantic guarantee: popup visible from button click until first document arrives
    *   `[✅]`   apps/web/src/components/dialectic/`GenerateContributionButton.mock.tsx`
        *   `[✅]`   Not required — no mock exists currently; dialog is internal concern
    *   `[✅]`   apps/web/src/components/dialectic/`GenerateContributionButton.integration.test.tsx`
        *   `[✅]`   Click generate → dialog opens → store gets `stageRunProgress` update with rendered document → dialog auto-closes
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: UI (presentation)
        *   `[✅]`   Dependencies inward-facing: `StageDAGProgressDialog` (same layer), `useDialecticStore` (store)
        *   `[✅]`   Provides outward to: user interaction (top-level page via `SessionInfoCard` which imports this component)
    *   `[✅]`   `requirements`
        *   `[✅]`   No regression in existing generate button behavior (18 existing tests pass)
        *   `[✅]`   Dialog opens synchronously with generation start
        *   `[✅]`   Dialog auto-closes on first rendered document (delegated to `StageDAGProgressDialog`)
        *   `[✅]`   Dialog manually dismissable at any time
    *   `[✅]`   **Commit** `feat(ui) apps/web DAG progress popup on stage generation`
        *   `[✅]`   New file: `apps/web/src/components/dialectic/dagLayout.types.ts` — layout types
        *   `[✅]`   New file: `apps/web/src/components/dialectic/dagLayout.ts` — pure DAG layout computation
        *   `[✅]`   New file: `apps/web/src/components/dialectic/dagLayout.test.ts` — layout tests
        *   `[✅]`   New file: `apps/web/src/components/dialectic/StageDAGProgressDialog.types.ts` — dialog props type
        *   `[✅]`   New file: `apps/web/src/components/dialectic/StageDAGProgressDialog.tsx` — dialog with SVG DAG and live status
        *   `[✅]`   New file: `apps/web/src/components/dialectic/StageDAGProgressDialog.test.tsx` — dialog unit tests
        *   `[✅]`   New file: `apps/web/src/components/dialectic/StageDAGProgressDialog.mock.tsx` — mock for consumer tests
        *   `[✅]`   Modified: `apps/web/src/components/dialectic/GenerateContributionButton.tsx` — wired dialog to generate action
        *   `[✅]`   Modified: `apps/web/src/components/dialectic/GenerateContributionButton.test.tsx` — tests for dialog integration

*   `[✅]`   `[STORE]` packages/store/src/`dialecticStore.documents.ts` **Fix hydration logic to throw on failure instead of silently returning**
    *   `[✅]`   `objective`
        *   `[✅]`   `hydrateStageProgressLogic` must throw when the API returns an error, when validation fails, or when response data is null/undefined — not silently return
        *   `[✅]`   `hydrateAllStageProgressLogic` must throw when the API returns an error, when validation fails, when stages array is unexpectedly empty, or when step data is absent — not silently return
        *   `[✅]`   Remove every silent `return` that hides a failure condition
        *   `[✅]`   Every error path must throw with a descriptive message identifying the function, the failure condition, and the relevant payload keys
    *   `[✅]`   `role`
        *   `[✅]`   Application — store logic, async I/O via API client
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store document/progress hydration
        *   `[✅]`   Bounded to hydration logic functions; does not change SSE event handlers or document content logic
    *   `[✅]`   `deps`
        *   `[✅]`   `api.dialectic().listStageDocuments` — adapter layer, API client — provides document list for stage hydration
        *   `[✅]`   `api.dialectic().getAllStageProgress` — adapter layer, API client — provides step statuses, progress counts, and documents for all stages
        *   `[✅]`   `isStageRenderedDocumentChecklistEntry` — utility type guard — validates response shape
        *   `[✅]`   No new dependencies introduced
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: `set` function from zustand immer, `payload` typed as `ListStageDocumentsPayload` or `GetAllStageProgressPayload`
        *   `[✅]`   No change to injection shape
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   No type changes required for this node — functions continue to return `Promise<void>` and throw on failure
    *   `[✅]`   unit/packages/store/src/`dialecticStore.documents.test.ts`
        *   `[✅]`   Test: `hydrateStageProgressLogic` throws when API returns error response
        *   `[✅]`   Test: `hydrateStageProgressLogic` throws when API returns null data
        *   `[✅]`   Test: `hydrateStageProgressLogic` throws when document validation fails (invalid entries)
        *   `[✅]`   Test: `hydrateAllStageProgressLogic` throws when API returns error response
        *   `[✅]`   Test: `hydrateAllStageProgressLogic` throws when API returns undefined data
        *   `[✅]`   Test: `hydrateAllStageProgressLogic` throws when document validation fails (invalid entries)
        *   `[✅]`   Test: `hydrateAllStageProgressLogic` throws when stages array is empty and that is unexpected
        *   `[✅]`   Existing passing tests for success paths remain GREEN
    *   `[✅]`   `construction`
        *   `[✅]`   Signature unchanged: `hydrateStageProgressLogic(set, payload): Promise<void>` — throws on failure
        *   `[✅]`   Signature unchanged: `hydrateAllStageProgressLogic(set, payload): Promise<void>` — throws on failure
        *   `[✅]`   Callers must catch thrown errors — the store actions in `dialecticStore.ts` are the callers
    *   `[✅]`   packages/store/src/`dialecticStore.documents.ts`
        *   `[✅]`   `hydrateStageProgressLogic`: replace every silent `return` on error/validation-failure with `throw new Error('[hydrateStageProgress] <descriptive message>')`
        *   `[✅]`   `hydrateAllStageProgressLogic`: replace every silent `return` on error/validation-failure with `throw new Error('[hydrateAllStageProgress] <descriptive message>')`
        *   `[✅]`   Remove the `catch (err: unknown)` blocks that convert errors to logs and silently return — let errors propagate
        *   `[✅]`   Keep the `set()` calls on the success path unchanged
    *   `[✅]`   `provides`
        *   `[✅]`   Exported: `hydrateStageProgressLogic`, `hydrateAllStageProgressLogic` — same exports, changed contract (now throws on failure)
        *   `[✅]`   Semantic guarantee: on successful return, `stageRunProgress[key]` is populated with valid step statuses, progress counts, and documents
        *   `[✅]`   Semantic guarantee: on failure, throws with descriptive error — caller is responsible for handling
    *   `[✅]`   packages/store/src/`dialecticStore.documents.mock.ts`
        *   `[✅]`   No mock changes — these functions are tested directly, not through mocks
    *   `[✅]`   integration/packages/store/src/`dialecticStore.documents.integration.test.ts`
        *   `[✅]`   Not required — integration coverage is provided by the hydration hook integration test (Node 4)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application (store logic)
        *   `[✅]`   All dependencies inward-facing (API adapter, type guards)
        *   `[✅]`   Provides outward to: `dialecticStore.ts` store actions
    *   `[✅]`   `requirements`
        *   `[✅]`   Every failure path throws with a descriptive error message
        *   `[✅]`   No silent returns on error conditions
        *   `[✅]`   Success path behavior unchanged — same state mutations on valid data
        *   `[✅]`   Existing success-path tests remain GREEN

*   `[✅]`   `[STORE]` packages/store/src/`dialecticStore.ts` **Fix fetchStageRecipe, ensureRecipeForActiveStage; add hydration status tracking**
    *   `[✅]`   `objective`
        *   `[✅]`   `fetchStageRecipe` must surface errors instead of swallowing them in a catch block — throw on API failure
        *   `[✅]`   `ensureRecipeForActiveStage` must throw when recipe is missing instead of silently returning — a missing recipe is a prerequisite failure, not a no-op
        *   `[✅]`   `hydrateAllStageProgress` store action must catch errors from logic function, set hydration status to `failed` in store, and log the error — not silently swallow
        *   `[✅]`   `hydrateStageProgress` store action must catch errors from logic function, set hydration status to `failed` in store, and log the error — not silently swallow
        *   `[✅]`   Add `progressHydrationStatus` to store state so consumers can observe hydration success/failure
        *   `[✅]`   Add `progressHydrationError` to store state so consumers can observe the error message
    *   `[✅]`   `role`
        *   `[✅]`   Application — zustand store actions, state management
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store — recipe fetching, progress hydration orchestration, hydration status tracking
        *   `[✅]`   Bounded to store actions and state; does not change hydration logic functions in `dialecticStore.documents.ts`
    *   `[✅]`   `deps`
        *   `[✅]`   `hydrateStageProgressLogic` — from `dialecticStore.documents.ts` — now throws on failure (Node 1 must be complete)
        *   `[✅]`   `hydrateAllStageProgressLogic` — from `dialecticStore.documents.ts` — now throws on failure (Node 1 must be complete)
        *   `[✅]`   `api.dialectic().fetchStageRecipe` — adapter layer, API client
        *   `[✅]`   No new external dependencies introduced
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection shape: zustand `set`/`get` from store creation
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   Add to `DialecticStateValues`: `progressHydrationStatus: Record<string, 'idle' | 'pending' | 'success' | 'failed'>` — keyed by `${sessionId}:${iterationNumber}`
        *   `[✅]`   Add to `DialecticStateValues`: `progressHydrationError: Record<string, string>` — keyed by `${sessionId}:${iterationNumber}`, only present when status is `failed`
        *   `[✅]`   Add to `DialecticStore`: `resetProgressHydrationStatus: (runKey: string) => void` — allows hook to clear failed status for retry
    *   `[✅]`   _No type guard changes required — new fields are simple record types_
    *   `[✅]`   unit/packages/store/src/`dialecticStore.test.ts`
        *   `[✅]`   Test: `fetchStageRecipe` throws when API returns error response
        *   `[✅]`   Test: `fetchStageRecipe` throws when API returns null data
        *   `[✅]`   Test: `fetchStageRecipe` sets recipe in store on success (existing behavior, verify GREEN)
        *   `[✅]`   Test: `ensureRecipeForActiveStage` throws when recipe is not in store
        *   `[✅]`   Test: `ensureRecipeForActiveStage` initializes progress snapshot when recipe exists (existing behavior, verify GREEN)
        *   `[✅]`   Test: `hydrateAllStageProgress` sets `progressHydrationStatus[runKey]` to `pending` before calling logic
        *   `[✅]`   Test: `hydrateAllStageProgress` sets `progressHydrationStatus[runKey]` to `success` when logic completes without throwing
        *   `[✅]`   Test: `hydrateAllStageProgress` sets `progressHydrationStatus[runKey]` to `failed` and `progressHydrationError[runKey]` to error message when logic throws
        *   `[✅]`   Test: `hydrateStageProgress` sets `progressHydrationStatus[progressKey]` to `pending` before calling logic
        *   `[✅]`   Test: `hydrateStageProgress` sets `progressHydrationStatus[progressKey]` to `success` when logic completes without throwing
        *   `[✅]`   Test: `hydrateStageProgress` sets `progressHydrationStatus[progressKey]` to `failed` and error when logic throws
        *   `[✅]`   Test: `resetProgressHydrationStatus` clears status and error for the given key
        *   `[✅]`   Test: `initialDialecticStateValues` includes `progressHydrationStatus: {}` and `progressHydrationError: {}`
    *   `[✅]`   `construction`
        *   `[✅]`   `fetchStageRecipe(stageSlug: string): Promise<void>` — removes catch-swallow, throws on API error
        *   `[✅]`   `ensureRecipeForActiveStage(sessionId, stageSlug, iterationNumber): Promise<void>` — throws when recipe missing
        *   `[✅]`   `hydrateAllStageProgress(payload): Promise<void>` — sets hydration status, catches logic errors and sets failed status
        *   `[✅]`   `hydrateStageProgress(payload): Promise<void>` — sets hydration status, catches logic errors and sets failed status
        *   `[✅]`   `resetProgressHydrationStatus(runKey): void` — clears status and error
        *   `[✅]`   Add `progressHydrationStatus: {}` and `progressHydrationError: {}` to `initialDialecticStateValues`
    *   `[✅]`   packages/store/src/`dialecticStore.ts`
        *   `[✅]`   `fetchStageRecipe`: remove the `catch (_e: unknown) {}` block — let API errors propagate as thrown errors
        *   `[✅]`   `ensureRecipeForActiveStage`: replace the silent `return` when `!recipe` with `throw new Error('[ensureRecipeForActiveStage] Recipe not loaded for stage: ${stageSlug} — fetchStageRecipe must succeed before calling this function')`
        *   `[✅]`   `hydrateAllStageProgress`: wrap logic call in try/catch — set `progressHydrationStatus[runKey] = 'pending'` before, `'success'` after, `'failed'` on catch; set `progressHydrationError[runKey]` on catch; log error on catch
        *   `[✅]`   `hydrateStageProgress`: same pattern as above with progressKey
        *   `[✅]`   Add `resetProgressHydrationStatus` action: clears `progressHydrationStatus[runKey]` and `progressHydrationError[runKey]`
        *   `[✅]`   Add new fields to `initialDialecticStateValues`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported: `useDialecticStore` — unchanged export, new state fields and actions available
        *   `[✅]`   Semantic guarantee: `fetchStageRecipe` either populates `recipesByStageSlug[slug]` or throws
        *   `[✅]`   Semantic guarantee: `ensureRecipeForActiveStage` either initializes progress snapshot or throws
        *   `[✅]`   Semantic guarantee: `hydrateAllStageProgress` sets `progressHydrationStatus` to `success` or `failed` — never leaves it ambiguous
        *   `[✅]`   Stability guarantee: existing SSE event handlers unchanged
    *   `[✅]`   apps/web/src/mocks/`dialecticStore.mock.ts`
        *   `[✅]`   Add `progressHydrationStatus: {}` and `progressHydrationError: {}` to mock initial state
        *   `[✅]`   Add `resetProgressHydrationStatus: vi.fn()` to mock store actions
    *   `[✅]`   integration/packages/store/src/`dialecticStore.integration.test.ts`
        *   `[✅]`   Not required — integration coverage is provided by the hydration hook integration test (Node 4)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application (store)
        *   `[✅]`   Dependencies inward: `dialecticStore.documents.ts` (logic), API adapter
        *   `[✅]`   Provides outward to: selectors, hydration hook, UI components
    *   `[✅]`   `requirements`
        *   `[✅]`   No error is silently swallowed — every failure is either thrown or stored in `progressHydrationStatus`/`progressHydrationError`
        *   `[✅]`   Hydration status is observable in the store for every run key
        *   `[✅]`   Existing success-path behavior unchanged
        *   `[✅]`   Mock updated to include new state fields

*   `[✅]`   `[STORE]` packages/store/src/`dialecticStore.selectors.ts` **Fix selectUnifiedProjectProgress to use backend progress counts and demand valid data**
    *   `[✅]`   `objective`
        *   `[✅]`   `selectUnifiedProjectProgress` must use `progress.progress.totalSteps`, `progress.progress.completedSteps`, `progress.progress.failedSteps` from the backend-provided data in `stageRunProgress` — not recompute from recipes
        *   `[✅]`   `selectUnifiedProjectProgress` must enumerate steps from `progress.stepStatuses` keys when recipes are not yet loaded — the backend provides the step keys and statuses
        *   `[✅]`   `selectUnifiedProjectProgress` must report `hydrationReady: boolean` — false when required data (process template, progress snapshots) is missing
        *   `[✅]`   `selectRecipeSteps` must not return `EMPTY_RECIPE_STEPS` as a fallback — it must return an explicit empty indicator or the selector must check for recipe absence directly
        *   `[✅]`   Remove `EMPTY_RECIPE_STEPS` constant — it exists solely to enable the fallback pattern
        *   `[✅]`   Document counts: `totalDocumentsForStage` and `completedDocumentsForStage` must also work without recipes — derive from `progress.documents` entries when recipes unavailable
    *   `[✅]`   `role`
        *   `[✅]`   Application — derived state selectors
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic store selectors — progress computation
        *   `[✅]`   Bounded to selector functions; does not change store actions or state shape (except adding `hydrationReady` to return type)
    *   `[✅]`   `deps`
        *   `[✅]`   `DialecticStateValues` — store state — provides `stageRunProgress`, `recipesByStageSlug`, `currentProcessTemplate`
        *   `[✅]`   `selectStageRunProgress` — sibling selector — provides progress snapshot for a stage
        *   `[✅]`   No new dependencies introduced
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Input: `DialecticStateValues` (full state slice) and `sessionId: string`
        *   `[✅]`   No change to injection shape
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   Add `hydrationReady: boolean` to `UnifiedProjectProgress` interface
    *   `[✅]`   _No type guard changes required — `hydrationReady` is a simple boolean_
    *   `[✅]`   unit/packages/store/src/`dialecticStore.selectors.documents.test.ts`
        *   `[✅]`   Test: `selectUnifiedProjectProgress` returns `hydrationReady: false` when `currentProcessTemplate` is null
        *   `[✅]`   Test: `selectUnifiedProjectProgress` returns `hydrationReady: false` when `stageRunProgress` has no entries for the session
        *   `[✅]`   Test: `selectUnifiedProjectProgress` returns `hydrationReady: true` when process template and progress snapshots are present
        *   `[✅]`   Test: `selectUnifiedProjectProgress` uses `progress.progress.totalSteps` from backend, not `recipe.steps.length`
        *   `[✅]`   Test: `selectUnifiedProjectProgress` uses `progress.progress.completedSteps` from backend, not recomputed count
        *   `[✅]`   Test: `selectUnifiedProjectProgress` uses `progress.progress.failedSteps` from backend, not recomputed count
        *   `[✅]`   Test: `selectUnifiedProjectProgress` enumerates steps from `progress.stepStatuses` keys when recipe is not loaded
        *   `[✅]`   Test: `selectUnifiedProjectProgress` uses recipe step names when recipe IS loaded (enrichment, not dependency)
        *   `[✅]`   Test: `selectUnifiedProjectProgress` computes `completedDocumentsForStage` from `progress.documents` entries without requiring `validMarkdownKeys` when recipe is absent
        *   `[✅]`   Test: `selectUnifiedProjectProgress` computes `totalDocumentsForStage` from `progress.documents` entry count when recipe is absent
        *   `[✅]`   Existing passing tests for success paths with recipes present remain GREEN
    *   `[✅]`   `construction`
        *   `[✅]`   Signature unchanged: `selectUnifiedProjectProgress(state, sessionId): UnifiedProjectProgress` — return type gains `hydrationReady`
        *   `[✅]`   `selectRecipeSteps`: remove `EMPTY_RECIPE_STEPS` fallback — return `undefined` when recipe is absent, or remove this helper entirely and inline the check
    *   `[✅]`   packages/store/src/`dialecticStore.selectors.ts`
        *   `[✅]`   `selectUnifiedProjectProgress`: for each stage, read `progress.progress.totalSteps`, `.completedSteps`, `.failedSteps` from `selectStageRunProgress` — these are the backend-computed values
        *   `[✅]`   `selectUnifiedProjectProgress`: enumerate `stepsDetail` from `progress.stepStatuses` keys — use recipe step names when available, use step key as name when recipe absent
        *   `[✅]`   `selectUnifiedProjectProgress`: compute `totalDocumentsForStage` from `validMarkdownKeys.size` when recipe available, from `Object.keys(progress.documents).length` when recipe absent
        *   `[✅]`   `selectUnifiedProjectProgress`: compute `completedDocumentsForStage` from `progress.documents` entries with `status === 'completed'` — same logic, but works without `validMarkdownKeys` filter when recipe absent
        *   `[✅]`   `selectUnifiedProjectProgress`: set `hydrationReady` to `true` only when `currentProcessTemplate` is non-null AND at least one `stageRunProgress` entry exists for the session
        *   `[✅]`   Remove `EMPTY_RECIPE_STEPS` constant
        *   `[✅]`   `selectRecipeSteps`: return `undefined` when recipe absent (or remove entirely)
    *   `[✅]`   `provides`
        *   `[✅]`   Exported: `selectUnifiedProjectProgress` — same export, return type now includes `hydrationReady`
        *   `[✅]`   Semantic guarantee: progress counts reflect backend truth, not frontend recipe enumeration
        *   `[✅]`   Semantic guarantee: `hydrationReady === false` means the selector does not have enough data to report accurate progress — UI must not render fake zeros
        *   `[✅]`   Stability guarantee: when recipes are loaded, step detail includes step names (enriched); when recipes are absent, step detail uses step keys as names (degraded but truthful)
    *   `[✅]`   _No mock changes required — selectors are pure functions, not mocked_
    *   `[✅]`   integration/packages/store/src/`dialecticStore.selectors.integration.test.ts`
        *   `[✅]`   Not required — integration coverage is provided by the hydration hook integration test (Node 4)
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application (derived state)
        *   `[✅]`   Dependencies inward: store state types
        *   `[✅]`   Provides outward to: UI components (`DynamicProgressBar`, `StageTabCard`, `StageDAGProgressDialog`, `SessionInfoCard`, `SubmitResponsesButton`)
    *   `[✅]`   `requirements`
        *   `[✅]`   Progress counts come from backend data, not recipe enumeration
        *   `[✅]`   No fallback to empty array or zero when data is absent — `hydrationReady: false` signals the gap
        *   `[✅]`   Step detail works with or without recipes — uses step keys as fallback names, not empty array
        *   `[✅]`   Document counts work with or without recipe-derived `validMarkdownKeys`
        *   `[✅]`   All consumers of `UnifiedProjectProgress` must handle `hydrationReady: false` (addressed in UI node or as separate follow-up)

*   `[✅]`   `[UI]` apps/web/src/hooks/`useStageRunProgressHydration.ts` **Fix execution ordering, replace ref guard with store-based status, support retry**
    *   `[✅]`   `objective`
        *   `[✅]`   Remove `hasHydratedAllStagesRef` — replace with store-based `progressHydrationStatus` read from `useDialecticStore`
        *   `[✅]`   Remove `isFetchingRef` — replace with store-based status check
        *   `[✅]`   Guarantee execution ordering: `fetchStageRecipe` must succeed (verified) before `ensureRecipeForActiveStage`, which must succeed before `hydrateAllStageProgress`
        *   `[✅]`   On failure of any step: do NOT mark hydration complete — leave status as `failed` so retry can occur
        *   `[✅]`   Support retry: when `progressHydrationStatus` is `failed`, allow re-triggering hydration (e.g., on re-render, on user action, or after a delay)
        *   `[✅]`   Log errors explicitly — the user (developer) must see what failed and why
    *   `[✅]`   `role`
        *   `[✅]`   UI — React hook, orchestrates hydration lifecycle
    *   `[✅]`   `module`
        *   `[✅]`   Dialectic progress hydration hook
        *   `[✅]`   Bounded to the hook file; does not change store actions, selectors, or logic functions
    *   `[✅]`   `deps`
        *   `[✅]`   `useDialecticStore` — store — provides `fetchStageRecipe`, `ensureRecipeForActiveStage`, `hydrateAllStageProgress`, `hydrateStageProgress`, `resetProgressHydrationStatus`, `progressHydrationStatus`, `recipesByStageSlug`
        *   `[✅]`   `useAuthStore` — store — provides `user`
        *   `[✅]`   `selectSortedStages` — selector — provides sorted stage list
        *   `[✅]`   Node 1 (dialecticStore.documents.ts) must be complete — logic functions throw on failure
        *   `[✅]`   Node 2 (dialecticStore.ts) must be complete — store actions set hydration status, fetchStageRecipe throws
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Hook reads from stores via selectors; no DI injection
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   packages/types/src/`dialectic.types.ts`
        *   `[✅]`   No type changes required for this node — all required types were added in Nodes 2 and 3
    *   `[✅]`   _No type guard changes required_
    *   `[✅]`   unit/apps/web/src/hooks/`useStageRunProgressHydration.test.tsx`
        *   `[✅]`   Test: hook does not attempt hydration when `user` is null
        *   `[✅]`   Test: hook does not attempt hydration when `activeContextSessionId` is null
        *   `[✅]`   Test: hook does not attempt hydration when `activeSessionDetail` is null
        *   `[✅]`   Test: hook does not attempt hydration when `sortedStages` is empty
        *   `[✅]`   Test: hook calls `fetchStageRecipe` for all sorted stages before calling `ensureRecipeForActiveStage`
        *   `[✅]`   Test: hook verifies `recipesByStageSlug` has entries for all stages after `fetchStageRecipe` completes — if any are missing, does not proceed and logs error
        *   `[✅]`   Test: hook calls `ensureRecipeForActiveStage` for all stages with loaded recipes before calling `hydrateAllStageProgress`
        *   `[✅]`   Test: hook calls `hydrateAllStageProgress` only after recipes and progress snapshots are initialized
        *   `[✅]`   Test: hook reads `progressHydrationStatus[runKey]` from store — does not use a ref
        *   `[✅]`   Test: hook does not re-trigger hydration when `progressHydrationStatus[runKey]` is `success`
        *   `[✅]`   Test: hook re-triggers hydration when `progressHydrationStatus[runKey]` is `failed`
        *   `[✅]`   Test: hook re-triggers hydration when `progressHydrationStatus[runKey]` is `idle` (never attempted)
        *   `[✅]`   Test: when `fetchStageRecipe` throws, hook logs the error and does not proceed to `ensureRecipeForActiveStage`
        *   `[✅]`   Test: when `ensureRecipeForActiveStage` throws, hook logs the error and does not proceed to `hydrateAllStageProgress`
        *   `[✅]`   Test: per-stage effect (Effect 2) also respects ordering and error handling
        *   `[✅]`   Existing tests updated to reflect removal of ref-based guards
    *   `[✅]`   `construction`
        *   `[✅]`   Signature unchanged: `useStageRunProgressHydration(): void`
        *   `[✅]`   Remove `hasHydratedAllStagesRef` — replaced by `progressHydrationStatus` from store
        *   `[✅]`   Remove `isFetchingRef` — replaced by `progressHydrationStatus` check
        *   `[✅]`   Hydration sequence: `fetchStageRecipe` (all) → verify recipes loaded → `ensureRecipeForActiveStage` (all) → `hydrateAllStageProgress` → verify status is `success`
        *   `[✅]`   On any step failure: log error, stop sequence — store action already sets `failed` status
    *   `[✅]`   apps/web/src/hooks/`useStageRunProgressHydration.ts`
        *   `[✅]`   Remove `hasHydratedAllStagesRef` and `isFetchingRef`
        *   `[✅]`   Read `progressHydrationStatus` from `useDialecticStore`
        *   `[✅]`   Read `recipesByStageSlug` from `useDialecticStore`
        *   `[✅]`   Effect 1 (hydrate all): compute `runKey` from `sessionId:iterationNumber`; check `progressHydrationStatus[runKey]`; if `success`, skip; if `pending`, skip; if `idle` or `failed`, proceed
        *   `[✅]`   Effect 1: wrap `fetchStageRecipe` calls in try/catch — on catch, log error and return (store already set failed status for recipe fetch... actually no, fetchStageRecipe throws but the store doesn't catch it in the action — it propagates. So the hook must catch.)
        *   `[✅]`   WAIT — re-evaluate: `fetchStageRecipe` in Node 2 removes the catch block and lets errors propagate. The store action itself throws. The hook must catch this throw. When it catches, it should log and stop the sequence. The `progressHydrationStatus` for recipe fetch is not tracked (only hydrate actions track it). The hook should handle recipe fetch failure by logging and not proceeding.
        *   `[✅]`   Effect 1: after `fetchStageRecipe` completes for all stages, verify `recipesByStageSlug` has entries for every stage — if any are missing, log which stages failed and return
        *   `[✅]`   Effect 1: call `ensureRecipeForActiveStage` for each stage — wrapped in try/catch (it now throws if recipe missing, but we just verified they're all present, so this should not throw; catch is defensive)
        *   `[✅]`   Effect 1: call `hydrateAllStageProgress` — this sets `progressHydrationStatus` to pending/success/failed internally
        *   `[✅]`   Effect 2 (per-stage): same ordering guarantees — verify recipe exists, ensure progress snapshot, hydrate stage
        *   `[✅]`   Effect 2: check `progressHydrationStatus` for the stage key — skip if `success` or `pending`
    *   `[✅]`   `provides`
        *   `[✅]`   Exported: `useStageRunProgressHydration` — same export, same signature
        *   `[✅]`   Semantic guarantee: hydration either succeeds (progress data in store, status `success`) or fails visibly (status `failed`, error logged)
        *   `[✅]`   Semantic guarantee: no one-shot lockout — failed hydrations can be retried
        *   `[✅]`   Stability guarantee: does not re-trigger hydration when status is `success`
    *   `[✅]`   apps/web/src/mocks/`dialecticStore.mock.ts`
        *   `[✅]`   Verify mock includes `progressHydrationStatus` and `progressHydrationError` and `resetProgressHydrationStatus` (added in Node 2)
    *   `[✅]`   integration/apps/web/src/hooks/`useStageRunProgressHydration.integration.test.tsx`
        *   `[✅]`   Test: full hydration pipeline from hook → store actions → selectors produces correct `selectUnifiedProjectProgress` output after reload
        *   `[✅]`   Test: when API returns valid progress data, `selectUnifiedProjectProgress` returns `hydrationReady: true` with correct step counts and document counts
        *   `[✅]`   Test: when recipe fetch fails for a stage, hydration does not proceed, status reflects failure
        *   `[✅]`   Test: after failed hydration, re-triggering the hook retries and succeeds when the API is available
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: UI (React hook)
        *   `[✅]`   Dependencies inward: store actions and selectors
        *   `[✅]`   Provides outward to: `App.tsx`, `SessionContributionsDisplayCard.tsx` (callers of the hook)
    *   `[✅]`   `requirements`
        *   `[✅]`   No refs for hydration state — all state in the store
        *   `[✅]`   No silent error swallowing — every failure logged and reflected in store status
        *   `[✅]`   Execution ordering guaranteed — each step verified before the next begins
        *   `[✅]`   Retry on failure — failed hydrations are not permanently locked out
        *   `[✅]`   Successful hydration is idempotent — does not re-trigger when status is `success`
    *   `[✅]`   **Commit** `fix(store,ui) packages/store + apps/web fix progress hydration pipeline to throw on failure, track hydration status, guarantee execution ordering, and use backend progress counts`
        *   `[✅]`   Node 1: `dialecticStore.documents.ts` — hydration logic throws on failure instead of silently returning
        *   `[✅]`   Node 2: `dialecticStore.ts` + `dialectic.types.ts` — fetchStageRecipe throws, ensureRecipeForActiveStage throws, store actions track hydration status
        *   `[✅]`   Node 3: `dialecticStore.selectors.ts` + `dialectic.types.ts` — selector uses backend progress counts, reports `hydrationReady`
        *   `[✅]`   Node 4: `useStageRunProgressHydration.ts` — ref guards replaced with store status, execution ordering guaranteed, retry supported

*   `[✅]`   `[STORE]` packages/store/notificationStore **Handle execute lifecycle events and relax planner_started validation**
    *   `[✅]`   `objective`
        *   `[✅]`   Add `case` branches for `execute_started`, `execute_chunk_completed`, `execute_completed` so these events reach `_handleDialecticLifecycleEvent`
        *   `[✅]`   Relax `planner_started` validation to make `document_key` and `modelId` optional, matching backend payload (PLAN jobs intentionally omit these)
        *   `[✅]`   Preserve all existing case branches and their validation logic
    *   `[✅]`   `role`
        *   `[✅]`   Application — notification ingestion and routing to dialectic store
    *   `[✅]`   `module`
        *   `[✅]`   Notification store — internal event dispatch
        *   `[✅]`   Bounded to the `handleIncomingNotification` switch statement
    *   `[✅]`   `deps`
        *   `[✅]`   `isDialecticLifecycleEventType` from `@paynless/utils` — domain utility — inward dependency
        *   `[✅]`   `ExecuteStartedPayload`, `ExecuteChunkCompletedPayload`, `ExecuteCompletedPayload`, `PlannerStartedPayload` from `@paynless/types` — domain types — inward dependency
        *   `[✅]`   `_handleDialecticLifecycleEvent` from `useDialecticStore` — application — lateral dependency (existing, unchanged)
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   Injection via Zustand store — no changes to store shape
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   interface/`dialectic.types.ts`
        *   `[✅]`   `PlannerStartedPayload` — override `document_key` and `modelId` as optional (do not change base `DocumentLifecyclePayload` — other consumers need them required)
        *   `[✅]`   `ExecuteStartedPayload`, `ExecuteChunkCompletedPayload`, `ExecuteCompletedPayload` — verify already defined, no changes needed
    *   `[✅]`   interface/tests/`type_guards.dialectic.test.ts`
        *   `[✅]`   Contract: `isDialecticLifecycleEventType('execute_started')` returns `true`
        *   `[✅]`   Contract: `isDialecticLifecycleEventType('execute_chunk_completed')` returns `true`
        *   `[✅]`   Contract: `isDialecticLifecycleEventType('execute_completed')` returns `true`
        *   `[✅]`   Confirm existing contracts for `planner_started`, `document_*`, `render_completed`, `job_failed`, `contribution_*`, `dialectic_contribution_*` unchanged
    *   `[✅]`   interface/guards/`type_guards.ts`
        *   `[✅]`   Add `execute_started`, `execute_chunk_completed`, `execute_completed` to the string comparison block in `isDialecticLifecycleEventType`
    *   `[✅]`   unit/`notificationStore.test.ts`
        *   `[✅]`   Test: `execute_started` notification with valid data dispatches to `_handleDialecticLifecycleEvent`
        *   `[✅]`   Test: `execute_chunk_completed` notification with valid data dispatches to `_handleDialecticLifecycleEvent`
        *   `[✅]`   Test: `execute_completed` notification with valid data (including optional `latestRenderedResourceId`) dispatches to `_handleDialecticLifecycleEvent`
        *   `[✅]`   Test: `planner_started` notification **without** `document_key` and `modelId` dispatches successfully
        *   `[✅]`   Test: `planner_started` notification **with** `document_key` and `modelId` still dispatches successfully
        *   `[✅]`   Confirm all existing notification tests unchanged
    *   `[✅]`   `construction`
        *   `[✅]`   No new functions — additions are `case` branches within existing `handleIncomingNotification`
        *   `[✅]`   Validation pattern: match existing case style (check required fields with `typeof`, assign optional fields conditionally)
    *   `[✅]`   `notificationStore.ts`
        *   `[✅]`   Add `case 'execute_started'` — validate `sessionId`, `stageSlug`, `iterationNumber`, `job_id`, `modelId` required; `document_key`, `step_key` optional
        *   `[✅]`   Add `case 'execute_chunk_completed'` — same as `execute_started` plus optional `isFinalChunk`, `continuationNumber`
        *   `[✅]`   Add `case 'execute_completed'` — same as `execute_started` plus optional `latestRenderedResourceId`
        *   `[✅]`   Modify `case 'planner_started'` — make `document_key` and `modelId` optional (conditional `typeof` assignment like `step_key` already does)
    *   `[✅]`   provides/`notificationStore.provides.ts`
        *   `[✅]`   Not applicable — `useNotificationStore` is the existing Zustand export, unchanged
    *   `[✅]`   `notificationStore.mock.ts`
        *   `[✅]`   Not required — no new exported surface; existing mock (if any) unchanged
    *   `[✅]`   integration/`notificationStore.integration.test.ts`
        *   `[✅]`   Not required — changes are internal routing logic, covered by unit tests
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: application
        *   `[✅]`   All dependencies inward-facing (types, utils)
        *   `[✅]`   Provides outward to: UI components via Zustand subscription
    *   `[✅]`   `requirements`
        *   `[✅]`   `execute_started`, `execute_chunk_completed`, `execute_completed` events reach `_handleDialecticLifecycleEvent`
        *   `[✅]`   `planner_started` events from backend (without `document_key`/`modelId`) no longer produce the "data payload did not match" warning
        *   `[✅]`   All existing event types continue to work unchanged
        *   `[✅]`   DAG popup receives progress updates for both plan and execute phases
    *   `[✅]`   **Commit** `fix(store) packages/utils + packages/store add execute lifecycle event handling and relax planner_started validation to match backend payloads`
        *   `[✅]`   `dialectic.types.ts` — updated `PlannerStartedPayload` to allow optional `document_key`/`modelId`
        *   `[✅]`   `type_guards.ts` — added execute event types to `isDialecticLifecycleEventType`
        *   `[✅]`   `type_guards.dialectic.test.ts` — added contracts for execute event types
        *   `[✅]`   `notificationStore.ts` — added execute case branches, relaxed planner_started validation
        *   `[✅]`   `notificationStore.test.ts` — added tests for execute events and planner_started without document_key/modelId

*   `[✅]` supabase/functions/dialectic-worker/`executeModelCallAndSave` **[BE] Gate RENDER job enqueue behind continuation completion**
    *   `[✅]` `objective`
        *   `[✅]` Prevent RENDER jobs from being enqueued for intermediate continuation chunks that contain incomplete JSON fragments
        *   `[✅]` RENDER jobs must only be enqueued when `needsContinuation` is false (i.e., the current chunk is the final chunk in the continuation chain, or the response completed without needing continuation)
        *   `[✅]` Preserve existing behavior for non-continuation responses (single-chunk responses that complete with `finish_reason: 'stop'` must still enqueue RENDER jobs immediately)
    *   `[✅]` `role`
        *   `[✅]` Infrastructure — orchestrator function that coordinates AI model calls, response storage, continuation dispatch, and downstream job enqueue
    *   `[✅]` `module`
        *   `[✅]` Dialectic worker pipeline: the RENDER job enqueue section (lines ~1504–1751) currently runs unconditionally after every chunk save
        *   `[✅]` The fix wraps the RENDER job enqueue block in a `!needsContinuation` guard so it only fires on the terminal chunk
    *   `[✅]` `deps`
        *   `[✅]` `needsContinuation` (local boolean, already computed at line 1789) — must be moved or duplicated earlier in the function, before the RENDER enqueue block at line 1504
        *   `[✅]` `shouldContinue` (local boolean, line 1102) — already available at the RENDER enqueue site
        *   `[✅]` `job.payload.continueUntilComplete` (payload field) — already available
        *   `[✅]` No new external dependencies introduced
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Requires `shouldContinue` and `job.payload.continueUntilComplete` to compute `needsContinuation` earlier in the function
        *   `[✅]` No new injection shape needed — uses existing local variables
        *   `[✅]` Confirm no concrete imports from higher or lateral layers
    *   `[✅]` unit/`executeModelCallAndSave.render.test.ts`
        *   `[✅]` Test: when `shouldContinue` is true and `continueUntilComplete` is true (`needsContinuation` = true), no RENDER job is inserted into `dialectic_generation_jobs`
        *   `[✅]` Test: when `shouldContinue` is false (final chunk, `finish_reason: 'stop'`), RENDER job IS enqueued as before
        *   `[✅]` Test: when `continueUntilComplete` is false (no continuation opted in), RENDER job IS enqueued as before even if `shouldContinue` would be true
        *   `[✅]` Test: single-chunk non-continuation response still enqueues RENDER job (regression guard)
    *   `[✅]` `construction`
        *   `[✅]` Move computation of `needsContinuation` (currently at line 1789: `job.payload.continueUntilComplete && shouldContinue`) to immediately after the sanitize/parse decision block (after line 1178), so it is available before the RENDER enqueue section
        *   `[✅]` Keep the existing `needsContinuation` reference at line 1789 working (use the same variable)
        *   `[✅]` No new objects or factories required
    *   `[✅]` `executeModelCallAndSave.ts`
        *   `[✅]` Move `const needsContinuation = job.payload.continueUntilComplete && shouldContinue;` from line 1789 to after line 1178 (after the sanitize/parse/content-level-continuation-flag block completes)
        *   `[✅]` Wrap the RENDER job enqueue block (lines ~1504–1751, starting at `const { shouldRender, reason, details } = ...`) inside `if (!needsContinuation) { ... }`
        *   `[✅]` Remove the duplicate `needsContinuation` declaration at the old location (line 1789) and reference the earlier variable
        *   `[✅]` Preserve all existing RENDER enqueue logic, error handling, and logging unchanged inside the guard
    *   `[✅]` `requirements`
        *   `[✅]` Intermediate continuation chunks (chunks 1..N-1) must NOT trigger a RENDER job
        *   `[✅]` The final chunk (or a single non-continuation chunk) MUST trigger a RENDER job for markdown outputs, exactly as before
        *   `[✅]` `assembleAndSaveFinalDocument` path (line 1861, gated by `isFinalChunk && !shouldRender`) must remain unaffected
        *   `[✅]` Continuation dispatch (`continueJob` call at line 1806) must remain unaffected
        *   `[✅]` All existing tests in `executeModelCallAndSave.render.test.ts` and `executeModelCallAndSave.continue.test.ts` must continue to pass

*   `[✅]` supabase/functions/_shared/services/`renderDocument` **[BE] Concatenate continuation chunks before sanitize/parse in renderDocument**
    *   `[✅]` `objective`
        *   `[✅]` Change `renderDocument` to concatenate all ordered chunk text content first, then run the concatenated result through `sanitizeJsonContent` → `isJsonSanitizationResult` → `JSON.parse` — the same sanitize/parse pipeline used in `executeModelCallAndSave` — instead of calling `JSON.parse` on each chunk individually
        *   `[✅]` This is a defensive-depth fix: even if a RENDER job somehow runs against incomplete chunks, the parse strategy must handle fragment-based continuations where individual chunks are not valid JSON
        *   `[✅]` All finished content — single-chunk or multi-chunk — must be judged by one sanitization/validation standard
    *   `[✅]` `role`
        *   `[✅]` Infrastructure — document rendering service that assembles raw model contributions into rendered markdown documents using templates
    *   `[✅]` `module`
        *   `[✅]` The chunk iteration loop in `renderDocument` (lines ~308–374 in `document_renderer.ts`) currently downloads each chunk, checks if it starts with `{`, and calls `JSON.parse(text)` on each chunk individually
        *   `[✅]` The fix changes this to: download all chunks, attempt concatenated sanitize/parse first (normal path for continuation fragments), then if that fails attempt per-chunk sanitize/parse (normal path for independently-complete chunks), then throw if neither method produces a valid result
    *   `[✅]` `deps`
        *   `[✅]` `downloadText` (internal helper, already used at line 314) — no change
        *   `[✅]` `sanitizeJsonContent` from `../utils/jsonSanitizer.ts` — **new import** required
        *   `[✅]` `isJsonSanitizationResult` from `../utils/type_guards.ts` — **new import** required
        *   `[✅]` `JsonSanitizationResult` from `../types/jsonSanitizer.interface.ts` — **new import** required for typing the sanitization result
        *   `[✅]` `isRecord` (type guard, already imported) — no change
        *   `[✅]` No new external dependencies introduced
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Requires the ordered chunk list (`uniqueChunks`) and `downloadText` function — both already in scope
        *   `[✅]` `sanitizeJsonContent` is a pure function in `_shared/utils/` — same layer, inward-facing dependency
        *   `[✅]` No new injection shape needed
        *   `[✅]` Confirm no concrete imports from higher or lateral layers
    *   `[✅]` unit/`document_renderer.test.ts`
        *   `[✅]` Test: two chunks whose individual text are JSON fragments (e.g., `{"content": "hello ` and `world"}`) are concatenated, sanitized, and parsed successfully into a single object
        *   `[✅]` Test: single chunk with complete JSON still works (regression guard)
        *   `[✅]` Test: concatenated result with backtick wrappers (e.g., chunk 1 starts with `` ```json ``) is sanitized correctly before parse
        *   `[✅]` Test: multiple chunks that are each independently complete JSON objects — concatenated parse fails, per-chunk sanitize/parse succeeds and results are merged
        *   `[✅]` Test: non-JSON chunks (plain text not starting with `{` or `[`) are still handled by the existing plain-text path
        *   `[✅]` Test: when both concatenated and per-chunk sanitize/parse fail, error is thrown with chunk IDs, storage paths, and parse error details
    *   `[✅]` `construction`
        *   `[✅]` No new objects or factories required
        *   `[✅]` The concatenation buffer is a local `string` variable initialized to `""`
    *   `[✅]` `document_renderer.ts`
        *   `[✅]` Add imports: `sanitizeJsonContent` from `../utils/jsonSanitizer.ts`, `isJsonSanitizationResult` from `../utils/type_guards.ts`, `JsonSanitizationResult` from `../types/jsonSanitizer.interface.ts`
        *   `[✅]` Replace the per-chunk download-and-parse loop (lines ~308–374) with a three-phase approach:
            *   `[✅]` Phase 1 (download): iterate over `uniqueChunks`, download each chunk's text via `downloadText`, and accumulate into an ordered array of `{ chunkId: string, text: string, rawJsonPath: string }` tuples
            *   `[✅]` Phase 2 (concatenated sanitize/parse — normal path for continuation fragments): if ALL trimmed texts start with `{` or `[` (JSON-like), concatenate them in order and run the concatenated result through `sanitizeJsonContent(concatenated)` → validate with `isJsonSanitizationResult` → `JSON.parse(sanitizationResult.sanitized)` → extract structured data from the parsed object as before
            *   `[✅]` Phase 3 (per-chunk sanitize/parse — normal path for independently-complete chunks): if Phase 2 did not produce a valid parsed object (concatenated parse threw, or not all chunks were JSON-like), process each chunk individually through `sanitizeJsonContent(chunk.text)` → `isJsonSanitizationResult` → `JSON.parse(sanitizationResult.sanitized)`, merge per-chunk results using the existing structured data merge logic (`content` envelope unwrap, key merging)
            *   `[✅]` If neither Phase 2 nor Phase 3 produces a valid parsed object, throw with chunk IDs, storage paths, sanitization details, and parse error
            *   `[✅]` Non-JSON chunks (plain text) continue through the existing `_extra_content` path unchanged
        *   `[✅]` Preserve all existing structured data extraction logic (`content` envelope unwrap, `continuation_needed`/`stop_reason` stripping, key merging)
        *   `[✅]` Preserve all existing logging; add logging for sanitization events (wasSanitized, wasStructurallyFixed, hasDuplicateKeys) consistent with `executeModelCallAndSave`'s logging pattern
    *   `[✅]` `requirements`
        *   `[✅]` Continuation chunks that are individual JSON fragments must be parseable when concatenated and sanitized in chain order
        *   `[✅]` Independently-complete chunks must be parseable via per-chunk sanitize/parse and merged
        *   `[✅]` The sanitize/parse pipeline for both methods must be the same as `executeModelCallAndSave`: `sanitizeJsonContent` → `isJsonSanitizationResult` → `JSON.parse`
        *   `[✅]` Single-chunk documents must render identically to current behavior
        *   `[✅]` Non-JSON content (plain markdown text) must continue through the plain-text rendering path
        *   `[✅]` If no method produces a valid parsed object, the error must propagate with actionable diagnostics including chunk IDs and storage paths
        *   `[✅]` All existing tests in `document_renderer.test.ts` and `document_renderer.examples.test.ts` must continue to pass

*   `[✅]` supabase/functions/_shared/services/`assembleAndSaveFinalDocument` **[BE] Concatenate continuation chunks before sanitize/parse in assembleAndSaveFinalDocument**
    *   `[✅]` `objective`
        *   `[✅]` Change `assembleAndSaveFinalDocument` to concatenate all ordered chunk text content first, then run the concatenated result through `sanitizeJsonContent` → `isJsonSanitizationResult` → `JSON.parse` — the same sanitize/parse pipeline used in `executeModelCallAndSave` — instead of calling `JSON.parse` on each chunk individually
        *   `[✅]` This is a defensive-depth fix for the JSON assembly path (non-rendered JSON-only artifacts): individual continuation chunks are fragments of a single JSON object and are not independently parseable
        *   `[✅]` All finished content — single-chunk or multi-chunk — must be judged by one sanitization/validation standard
    *   `[✅]` `role`
        *   `[✅]` Infrastructure — file management service method that assembles continuation chain chunks into a single final JSON document for storage
    *   `[✅]` `module`
        *   `[✅]` The chunk download-and-parse loop in `assembleAndSaveFinalDocument` (lines ~620–651 in `file_manager.ts`) currently downloads each chunk, calls `JSON.parse(textContent)` on each chunk individually, validates each is a record, then deep-merges them
        *   `[✅]` The fix changes this to: download all chunks, attempt concatenated sanitize/parse first (normal path for continuation fragments), then if that fails attempt per-chunk sanitize/parse with merge (normal path for independently-complete chunks), then throw if neither method produces a valid result
    *   `[✅]` `deps`
        *   `[✅]` `this.supabase.storage.from().download()` — already used, no change
        *   `[✅]` `sanitizeJsonContent` from `../utils/jsonSanitizer.ts` — **new import** required
        *   `[✅]` `isJsonSanitizationResult` from `../utils/type_guards.ts` — **new import** required
        *   `[✅]` `JsonSanitizationResult` from `../types/jsonSanitizer.interface.ts` — **new import** required for typing the sanitization result
        *   `[✅]` `isRecord` (type guard, already imported) — called on the final parsed result regardless of which method succeeded
        *   `[✅]` No new external dependencies introduced
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` Requires the ordered chunk list (`orderedChunks`) and Supabase storage client — both already in scope
        *   `[✅]` `sanitizeJsonContent` is a pure function in `_shared/utils/` — same layer, inward-facing dependency
        *   `[✅]` No new injection shape needed
        *   `[✅]` Confirm no concrete imports from higher or lateral layers
    *   `[✅]` unit/`file_manager.assemble.test.ts`
        *   `[✅]` Test: two chunks whose individual text are JSON fragments (e.g., `{"key": "val` and `ue", "key2": "v2"}`) are concatenated, sanitized, and parsed successfully
        *   `[✅]` Test: single-chunk assembly still works (regression guard — concatenation of one string is the same string)
        *   `[✅]` Test: concatenated result with backtick wrappers is sanitized correctly before parse
        *   `[✅]` Test: multiple independently-complete chunks — concatenated parse fails, per-chunk sanitize/parse succeeds and results are deep-merged
        *   `[✅]` Test: error message when both concatenated and per-chunk sanitize/parse fail includes all chunk IDs, storage paths, and parse error details
        *   `[✅]` Test: the parsed result must be validated as a record via `isRecord` (existing behavior preserved)
        *   `[✅]` Test: when sanitization result fails `isJsonSanitizationResult`, error is thrown with diagnostic info
    *   `[✅]` `construction`
        *   `[✅]` No new objects or factories required
        *   `[✅]` The concatenation buffer is a local `string` variable
    *   `[✅]` `file_manager.ts` / `assembleAndSaveFinalDocument`
        *   `[✅]` Add imports: `sanitizeJsonContent` from `../utils/jsonSanitizer.ts`, `isJsonSanitizationResult` from `../utils/type_guards.ts`, `JsonSanitizationResult` from `../types/jsonSanitizer.interface.ts`
        *   `[✅]` Replace the per-chunk download-parse-validate loop (lines ~620–651) with a three-phase approach:
            *   `[✅]` Phase 1 (download): iterate over `orderedChunks`, download each chunk's content via storage, decode to text, and accumulate text strings in order (with chunk ID and storage path for diagnostics)
            *   `[✅]` Phase 2 (concatenated sanitize/parse — normal path for continuation fragments): concatenate all text strings in order, run through `sanitizeJsonContent(concatenated)` → validate with `isJsonSanitizationResult` → `JSON.parse(sanitizationResult.sanitized)`, validate result is a record via `isRecord`
            *   `[✅]` Phase 3 (per-chunk sanitize/parse — normal path for independently-complete chunks): if Phase 2 did not produce a valid parsed record, process each chunk individually through `sanitizeJsonContent(chunkText)` → `isJsonSanitizationResult` → `JSON.parse(sanitizationResult.sanitized)` → validate each is a record via `isRecord`, then deep-merge using the existing merge logic
            *   `[✅]` If neither Phase 2 nor Phase 3 produces a valid parsed record, throw with chunk IDs, storage paths, sanitization details, and parse error
        *   `[✅]` Add logging for sanitization events (wasSanitized, wasStructurallyFixed, hasDuplicateKeys) consistent with `executeModelCallAndSave`'s logging pattern
        *   `[✅]` Preserve all existing error handling beyond sanitize/parse: if storage download fails, throw as before
        *   `[✅]` Preserve the existing upload-to-assembled-path logic and `is_latest_edit` flag management unchanged
    *   `[✅]` `requirements`
        *   `[✅]` Continuation chunks that are individual JSON fragments must be parseable when concatenated and sanitized in chain order
        *   `[✅]` Independently-complete chunks must be parseable via per-chunk sanitize/parse and deep-merged
        *   `[✅]` The sanitize/parse pipeline for both methods must be the same as `executeModelCallAndSave`: `sanitizeJsonContent` → `isJsonSanitizationResult` → `JSON.parse`
        *   `[✅]` Single-chunk assembly must produce identical output to current behavior
        *   `[✅]` If no method produces a valid parsed record, the error must propagate with actionable diagnostics including chunk IDs, storage paths, and parse error details
        *   `[✅]` All existing tests in `file_manager.assemble.test.ts` must continue to pass
        *   `[✅]` The `shouldRender` guard (lines 708–724) that prevents this method from being called on rendered documents must remain unchanged
    *   `[✅]` **Commit** `fix(be) supabase/functions gate RENDER enqueue behind continuation completion and concatenate continuation chunks before sanitize/parse in renderDocument and assembleAndSaveFinalDocument`
        *   `[✅]` `executeModelCallAndSave.ts`: moved `needsContinuation` computation earlier; wrapped RENDER enqueue block in `!needsContinuation` guard
        *   `[✅]` `document_renderer.ts`: replaced per-chunk JSON.parse with concatenated sanitize/parse then per-chunk sanitize/parse strategy for continuation chunk support
        *   `[✅]` `file_manager.ts` / `assembleAndSaveFinalDocument`: replaced per-chunk JSON.parse with concatenated sanitize/parse then per-chunk sanitize/parse strategy for continuation chunk support
        *   `[✅]` Updated tests in `executeModelCallAndSave.render.test.ts`, `document_renderer.test.ts`, and `file_manager.assemble.test.ts`

# ToDo

    - Regenerate individual specific documents on demand without regenerating inputs or other sibling documents 
    -- User reports that a single document failed and they liked the other documents, but had to regenerate the entire stage
    -- User requests option to only regenerate the exact document that failed
    -- Initial investigation shows this should be possible, all the deps are met, we just need a means to dispatch a job for only the exact document that errored or otherwise wasn't produced so that the user does't have to rerun the entire stage to get a single document
    -- Added bonus, this lets users "roll the dice" to get a different/better/alternative version of an existing document if they want to try again 
    -- FOR CONSIDERATION: This is a powerful feature but implies a branch in the work
    --- User generates stage, all succeeds
    --- User advances stages, decides they want to fix an oversight in a prior stage
    --- User regenerates a prior document
    --- Now subsequent documents derived from the original are invalid
    --- Is this a true branch/iteration, or do we highlight the downstream products so that those can be regenerated from the new input that was produced? 
    --- If we "only" highlight downstream products, all downstream products are invalid, because the header_context used to generate them would be invalid 
    --- PROPOSED: Implement regeneration prior to stage advancement, disable regeneration for documents who have downstream documents, set up future sprint for branching/iteration to support hints to regenerate downstream documents if a user regenerates upstream documents
    --- BLOCKER: Some stages are fundamentally dependent on all prior outputs, like synthesis, and the entire stage needs to be rerun if thesis/antithesis documents are regenerated

    - Set baseline values for each stage "Generate" action and encourage users to top up their account if they are at risk of NSF
    -- Pause the work mid-stream if NSF and encourage user to top up to continue 

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