# DAG Progress Computation

## Problem Statement

A DAG-based workflow system executes work through a sequence of **stages**, where each stage contains a **recipe** of **steps** connected by **edges**. The system must answer two questions for the user:

1. **The map**: What is the full structure of work required to complete this stage and this DAG?
2. **The overlay**: Where are we right now within that structure?

The user sees the full recipe laid out — every step, every dependency. The current position is highlighted. What's behind them is done. What's happening now is in progress. What's ahead is structurally defined but not yet reached. The remainder is obvious from the gap.

Progress is measured in **steps**, not jobs. A step is the atomic unit of the recipe. It is either not started, in progress, completed, or failed. Jobs are implementation details of how a step gets its work done — they are not the unit of progress.

This progress must be:
- **Structural**: derived from the recipe DAG, not from implementation details like job counts
- **Stable**: invariant to which stage the user is viewing or navigating to
- **Correct**: monotonically non-decreasing and consistent across all levels
- **Abstract**: applicable to any valid DAG, not specific to any single recipe

Progress is reported at three levels:
1. **Step status**: has this step been reached? Is it done?
2. **Stage progress**: how many of this stage's steps are done?
3. **DAG progress**: how many stages are done?

---

## Structural Definitions

### DAG

A DAG is an ordered sequence of **stages** connected by **stage transitions**. Stage transitions form a directed acyclic graph where each transition is gated by user action (e.g., submitting feedback). The DAG has a single entry point (the first stage) and a terminal stage with no outgoing transitions.

### Stage

A stage is a unit of work defined by a **recipe**. A recipe consists of:
- A set of **steps** (nodes)
- A set of **edges** (directed dependencies between steps)
- An association with a set of **models** selected by the user at stage initiation

The model set is **fixed per stage** but **mutable between stages**. Users may add, remove, or swap models when advancing from one stage to the next.

### Step

A step is an atomic unit of the recipe with the following structural properties:

| Property               | Description                                                           |
|------------------------|-----------------------------------------------------------------------|
| `step_number`          | Ordinal position in the recipe                                        |
| `parallel_group`       | Steps sharing a non-null value may execute concurrently               |
| `job_type`             | `PLAN` (orchestrates downstream work) or `EXECUTE` (produces content) |
| `granularity_strategy` | Determines how many jobs this step spawns (see below)                 |
| `output_type`          | The kind of artifact produced                                         |
| `inputs_required`      | Array of artifacts this step consumes                                 |

A step is the **unit of progress**. Whether a step spawns 1 job or 100 jobs is irrelevant to progress — the step is either done or it isn't.

### Edge

An edge is a directed dependency `(from_step, to_step)` meaning `to_step` cannot begin until `from_step` has completed. A step with no incoming edges is a **root step**. A step with no outgoing edges is a **leaf step**.

### Job

A job is a single unit of execution spawned by a step. Jobs are implementation details. Not all steps produce jobs. A step may complete without any job rows in the database. The progress system must not assume that jobs exist for a step.

**Retries** update the same job row's status. They do not create new jobs.

**Continuations** create a new sibling job when output exceeds token limits. Continuations are implementation details of completing one logical unit of work.

### RENDER Jobs

When an EXECUTE job completes and its output requires rendering into a final document, the system enqueues a **RENDER job** as a child. RENDER jobs:
- Are not defined in the recipe
- Are not part of the step/edge DAG
- Produce `rendered_document` resources in `dialectic_project_resources`
- Are spawned automatically by the execution layer

RENDER jobs represent **document availability**, not **progress**. They are tracked separately.

---

## The Map: Recipe Structure

The recipe defines the complete structure of work required to finish a stage. This is fully known before any work begins.

### Step Count

The total number of steps in a stage is `recipe.steps.length`. This is the denominator for stage progress. It is structural and fixed for the lifetime of the stage.

### Document Expectations

For user-facing reporting of "how many documents will this stage produce," the system can compute expected document counts from the recipe structure using granularity strategies and model count n. This is informational — it tells the user what they will receive when the stage completes. It is NOT the progress metric.

#### Granularity Strategies

Each step's `granularity_strategy` determines how many documents/artifacts it will produce:

| Strategy                         | Expected Count       | Output Cardinality   | Description                                                                                     |
|----------------------------------|----------------------|----------------------|-------------------------------------------------------------------------------------------------|
| `all_to_one`                     | 1                    | context-dependent    | Single unit of work regardless of model count                                                   |
| `per_model`                      | n                    | n                    | One unit per selected model                                                                     |
| `per_source_document`            | C(input_predecessor) | C(input_predecessor) | One unit per source document from the predecessor providing this step's primary input            |
| `per_source_document_by_lineage` | n × L                | n × L                | One unit per (model × lineage), where L is the lineage count from the prior stage               |
| `pairwise_by_origin`             | L × R × n            | L × R × n            | One unit per (lineage × reviewer × synthesizer)                                                 |

#### Cardinality Propagation

Output cardinality flows through the DAG. For `all_to_one` PLAN steps that fan out to `per_source_document` children, the output cardinality is n (one output per model), even though the step itself produces one unit of work.

For `per_source_document` steps, the expected count equals the output cardinality of the predecessor step providing their primary input.

#### Topological Computation

Expected counts are computed by walking the recipe DAG in topological order. This computation is used for:
- **Document availability reporting**: "this stage will produce N documents total"
- **Cardinality propagation**: downstream steps need predecessor cardinality to determine their own counts
- **Prior stage context**: computing lineage and reviewer counts for the next stage

It is NOT used as the denominator for progress.

#### Prior Stage Context

Some strategies require knowledge of the prior stage's output structure:
- `per_source_document_by_lineage`: needs L = number of lineages from the prior stage
- `pairwise_by_origin`: needs L = lineage count, R = reviewer count

The **lineage count** of a stage is the output cardinality of that stage's leaf steps.

---

## The Overlay: Current Position

The DAG walker (`processComplexJob`) knows exactly where execution stands at all times. It tracks which steps are completed, which have in-progress work, and which have failures. The progress reporter must derive the same information.

### Determining Step Status

A step's status is determined structurally from the DAG and the evidence in the database:

| Status | Condition |
|---|---|
| `completed` | The DAG walker has moved past this step. Evidence: the step's successors have been reached (have jobs), OR the step is a leaf and the stage is complete. |
| `in_progress` | The step has been reached and has active work. Evidence: jobs exist for this step with non-terminal status. |
| `failed` | The step has terminally failed work. Evidence: jobs exist for this step with terminal failure status (`failed`, `retry_loop_failed`). |
| `not_started` | The step has not been reached. Evidence: no jobs exist for this step AND its successors have not been reached. |

**Key principle**: step status is inferred from position in the DAG, not from counting jobs against an expected total. A step with zero jobs whose successors have been reached is `completed` — the DAG walker moved past it. A step with zero jobs whose successors have NOT been reached is `not_started`.

### Mapping Jobs to Steps

Jobs reference their recipe step via `payload.planner_metadata.recipe_step_id`. This maps to `stepIdToStepKey` to identify which step a job belongs to.

**The root PLAN job** (the orchestrator that enters `processComplexJob`) is NOT a recipe step. It has no `recipe_step_id`. It must be excluded from step status determination. It is the parent of all step-level work, not a step itself.

### Stage Progress

**Stage progress** = `completed_steps / total_steps`

Where:
- `total_steps` = number of steps in the recipe (structural, fixed)
- `completed_steps` = number of steps with status `completed`

A stage is **complete** when every step has status `completed` and no step has status `failed`.

### DAG Progress

**DAG progress** = `completed_stages / total_stages`

The total_stages count is known at session creation. A stage counts as completed when all its steps are complete.

Stages not yet initiated have status `not_started` with 0 completed steps out of 0 total (the recipe hasn't been evaluated yet). There is nothing to compute until the user initiates a stage.

---

## Document Availability

Separate from progress, the system reports which **rendered documents** are available for the user to view. This answers "when will I get what I want."

### Document Readiness

A document is **available** when:
1. A RENDER job with `status = 'completed'` exists for it, AND
2. A corresponding row exists in `dialectic_project_resources` with `resource_type = 'rendered_document'`

### Document Report Structure

For each stage, report:

```
documents: [
    {
        documentKey: string,      // e.g., "business_case", "product_requirements"
        modelId: string,          // which model produced it
        resourceId: string,       // dialectic_project_resources.id for fetching
        status: "available"       // only report documents that are fetchable
    }
]
```

Document availability is derived from `dialectic_project_resources`, not from job status. This is the ground truth of "what can the user read right now."

The expected document count (from granularity strategies) can be reported alongside availability to show "4 of 12 documents ready" — but this is document availability, not progress.

---

## Handling Edge Cases

### Retries

A retry updates the same job row's status. Step status does not change — the step remains `in_progress` until its work completes or terminally fails.

### Continuations

A continuation creates a new job row. This does not affect step status. The step is `in_progress` until its work completes. Continuations are invisible to the progress system.

### Terminal Failures

If a step has any terminally failed jobs, the step status is `failed`. The stage will report this step as failed. The progress report must distinguish "4 of 5 steps done, 1 failed" from "4 of 5 steps done, 1 still working."

### Steps Without Jobs

Some steps may complete without producing job rows in the database. The progress system handles this structurally: if a step's successors have been reached, the step is complete regardless of whether it has jobs. This ensures the system works for any valid DAG, not just the current recipes.

### Model Count Changes

When the user changes models between stages:
- Completed stages are unaffected
- The new stage's document expectations are computed fresh with the new model count
- Stage and DAG progress are unaffected — they count steps and stages, not jobs

---

## Progress Report Schema

The backend provides a single endpoint returning:

```
{
    dagProgress: {
        completedStages: number,
        totalStages: number
    },
    stages: [
        {
            stageSlug: string,
            status: "not_started" | "in_progress" | "completed" | "failed",
            modelCount: number | null,
            progress: {
                completedSteps: number,    // steps with status "completed"
                totalSteps: number,        // recipe step count (0 if not initiated)
                failedSteps: number        // steps with status "failed"
            },
            steps: [
                {
                    stepKey: string,
                    status: "not_started" | "in_progress" | "completed" | "failed"
                }
            ],
            documents: [
                {
                    documentKey: string,
                    modelId: string,
                    resourceId: string,
                    status: "available"
                }
            ]
        }
    ]
}
```

### Invariants

1. `stage.progress.completedSteps` == count of steps where `status == "completed"`
2. `stage.progress.totalSteps` == length of `stage.steps` array
3. `stage.progress.failedSteps` == count of steps where `status == "failed"`
4. `stage.status == "completed"` iff `completedSteps == totalSteps AND failedSteps == 0`
5. `dagProgress.completedStages` == count of stages where `status == "completed"`
6. Progress values never decrease across successive queries for the same session
7. Progress values do not change based on which stage the user is viewing

---

## Worked Example

Consider the current 5-stage dialectic with n=3 models.

### Stage Structure

| Stage | Recipe Steps | Step Count |
|---|---|---|
| Thesis | 1 PLAN + 4 EXECUTE | 5 |
| Antithesis | 1 PLAN + 6 EXECUTE | 7 |
| Synthesis | 2 PLAN + 11 EXECUTE | 13 |
| Parenthesis | 1 PLAN + 3 EXECUTE | 4 |
| Paralysis | 1 PLAN + 3 EXECUTE | 4 |

### DAG Level Progress

If the user has completed Thesis and Antithesis, is partway through Synthesis:
- DAG progress = 2/5 stages completed (40%)
- Synthesis: 6 of 13 steps completed (46%)
- Parenthesis and Paralysis: not started, 0/0

### Step-Level Detail (Synthesis, in progress)

| Step | Status |
|---|---|
| prepare-pairwise-synthesis-header | completed |
| pairwise-synthesis-business-case | completed |
| pairwise-synthesis-feature-spec | in_progress |
| pairwise-synthesis-technical-approach | not_started |
| pairwise-synthesis-success-metrics | not_started |
| synthesis-document-business-case | completed |
| synthesis-document-feature-spec | not_started |
| synthesis-document-technical-approach | not_started |
| synthesis-document-success-metrics | not_started |
| generate-final-synthesis-header | not_started |
| product-requirements | not_started |
| system-architecture | not_started |
| tech-stack | not_started |

Stage progress: 3 of 13 steps completed (23%), 1 in progress, 9 not started.

Document availability (separate): 8 of 36 expected documents available.

This is stable and structural. The user sees the full map of what's required, where they are now, and can impute the remainder from the gap. Whether a step spawns 1 job or 100 is invisible. Whether a step has jobs at all is invisible. The user sees steps.
