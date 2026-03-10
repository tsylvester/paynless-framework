# A Production-Ready Architecture for Scalable Asynchronous Tasks

## 1. Introduction: The Challenge of Complex Background Jobs

### 1.1. The Problem Domain
Our system performs complex, multi-step AI generation processes via a `dialectic-worker`. A single high-level user request, such as "Generate the Synthesis stage," triggers a cascade of hundreds of interrelated tasks that must be planned, executed, and orchestrated.

The core architectural challenge is managing this complexity reliably. How can a worker, processing one job at a time from a queue, handle a process of arbitrary intricacy without becoming a brittle monolith of hard-coded logic?

### 1.2. The Solution: A Data-Driven, Declarative, and Robust Architecture
This document specifies a **data-driven** architecture where the worker's behavior is determined entirely by declarative data within a job's `payload` and a stage's configuration "recipe."

This design is built on three pillars:
1.  **Determinism**: Using explicit job typing and state management to ensure predictable behavior.
2.  **Robustness**: Incorporating comprehensive error handling, lifecycle management, and validation.
3.  **Extensibility**: Designing for future requirements like advanced orchestration and modular logic.

---

## 2. The End-to-End Workflow: From User Click to Job Completion

The system is split into two primary domains: the **User-Facing Controller** (API) and the **Backend Engine** (Worker).

```mermaid
graph TD
    subgraph User-Facing Controller (API Layer)
        A["User clicks 'Submit Feedback'"] --> B["API Call: /submit-stage-responses"];
        B --> C["<b>submitStageResponses.ts</b><br/>1. Saves User Feedback<br/>2. Assembles Seed Prompt for Next Stage<br/>3. Updates Session Status"];
        C --> D["User clicks 'Generate Contributions'"];
        D --> E["API Call: /generate-contributions"];
        E --> F["<b>generateContribution.ts</b><br/>1. Validates Request<br/>2. Fetches Stage Recipe<br/>3. Constructs Formal 'plan' Job Payload<br/>4. Inserts Parent Job into Queue"];
    end

    subgraph Backend Engine (Worker)
        H["Parent 'plan' Job Appears in Queue"] --> I["Worker Fetches Job"];
        I --> J["<b>processJob()</b> Router reads `payload.job_type`"];
        J -- "'plan'" --> K["Delegates to <b>processComplexJob()</b> (The Planner)"];
        K --> L["Planner executes multi-step recipe..."];
        L --> M["...which creates child 'execute' jobs."];
        M --> N["Parent Job waits for children."];
        N --> O["Orchestration Trigger increments step or completes parent."];
    end
    
    F --> H;
```

---

## 3. Core Data Structures: The Single Source of Truth

The behavior of the system is defined by the structure of the data it consumes.

### 3.1. Key Database Tables

*   **`dialectic_generation_jobs`**: The central job queue. Key columns include `id`, `payload`, `status`, and `parent_job_id`.
*   **`dialectic_stages`**: Defines the business logic for each stage. Key column is `input_artifact_rules`.
*   **`dialectic_project_resources`**: Tracks all generated artifacts (prompts, documents), giving them stable `resource_id`s.

### 3.2. The `DialecticJobPayload`: The Job's DNA

The `payload` is the cornerstone of this architecture. It is formally structured to be the single source of truth for a job's purpose and state.

```typescript
// The formal structure of the job's payload
interface DialecticJobPayload {
  // === Core Routing & Context ===
  job_type: 'plan' | 'execute';
  projectId: string;
  sessionId: string;
  stageSlug: string;
  iterationNumber: number;
  model_id: string; // The specific model this job is for

  // === State Management for 'plan' Jobs ===
  step_info?: {
    current_step: number;
    total_steps: number;
    status: 'pending' | 'in_progress' | 'awaiting_children' | 'completed' | 'failed';
  };

  // === Pointer for 'execute' Jobs ===
  prompt_resource_id?: string; // Direct pointer to the finalized prompt

  // === Robustness & Error Handling ===
  retry_context?: {
    attempt_count: number;
    max_retries: number;
    last_error?: string;
  };
  
  // === Extensibility ===
  dependency_policy?: {
    type: 'all' | 'quorum' | 'any';
    min_successful_children?: number;
  };

  // Internal context passed from the API
  user_jwt?: string;
}
```

### 3.3. The `input_artifact_rules`: The Formal Recipe

This `JSONB` field in the `dialectic_stages` table is a formal, machine-readable recipe for completing a stage. Below are two examples demonstrating a simple, single-step stage and a complex, multi-step "map-reduce" stage.

#### Example 1: Recipe for the `antithesis` Stage (Single-Step)
This is a "map" operation that takes each `thesis` contribution and generates a corresponding critique for each selected model.

```json5
// Example Recipe for the "antithesis" stage
{
  "steps": [
    {
      "step_number": 1,
      "step_name": "Generate Antithesis Critiques",
      "description": "For each contribution from the 'thesis' stage, generate a critical antithesis. This operation is performed for each selected model.",
      "granularity_strategy": "per_source_document",
      "inputs_required": [
        { "type": "contribution", "stage_slug": "thesis" }
      ],
      "output_type": "antithesis",
      "job_type_to_create": "execute"
    }
  ]
}
```

#### Example 2: Recipe for the `synthesis` Stage (Multi-Step Map-Reduce)
This complex recipe breaks down a large synthesis task to respect model context windows. It first maps thesis/antithesis pairs, then reduces the results twice.

```json5
// Example Recipe for the "synthesis" stage
{
  "steps": [
    {
      "step_number": 1,
      "step_name": "Step 1: Generate Pairwise Syntheses (Map)",
      "description": "For each Thesis, synthesize it with each of its corresponding Antitheses to create focused 'chunks'.",
      "granularity_strategy": "pairwise_by_origin", // A strategy to pair thesis T1 with antitheses A1, A2, etc. that were derived from T1
      "inputs_required": [
        { "type": "contribution", "stage_slug": "thesis" },
        { "type": "contribution", "stage_slug": "antithesis" }
      ],
      "output_type": "pairwise_synthesis_chunk",
      "job_type_to_create": "execute"
    },
    {
      "step_number": 2,
      "step_name": "Step 2: Consolidate Per-Thesis Syntheses (Reduce)",
      "description": "Combine all pairwise synthesis chunks for a given original thesis into a single synthesized document.",
      "granularity_strategy": "per_source_group", // Groups chunks by their original thesis ID
      "inputs_required": [
        { "type": "pairwise_synthesis_chunk" }
      ],
      "output_type": "reduced_synthesis",
      "job_type_to_create": "execute"
    },
    {
      "step_number": 3,
      "step_name": "Step 3: Generate Final Synthesis (Final Combination)",
      "description": "Combine all of the reduced syntheses into a final, single synthesis document for each agent.",
      "granularity_strategy": "all_to_one", // Takes all inputs and produces one output per model
      "inputs_required": [
        { "type": "reduced_synthesis" }
      ],
      "output_type": "synthesis",
      "job_type_to_create": "execute"
    }
  ]
}
```

---

## 4. The Architecture: Deterministic, Robust, and Extensible

### 4.1. Principle 1: The Deterministic Router (`processJob`)
The main `processJob` router is a simple, stable switch based on `payload.job_type`. This is the primary determinant that decouples the worker's logic from any specific business process.

### 4.2. Principle 2: The Stateful Planner (`processComplexJob`)
When a `'plan'` job arrives, the planner executes a clear algorithm:
1.  **Read State**: Inspect `payload.step_info` to identify the `current_step`.
2.  **Read Recipe**: Fetch the recipe from `input_artifact_rules` for the `current_step`.
3.  **Validate & Gather**: Validate the recipe and gather all documents specified in `inputs_required`.
4.  **Execute Granularity Strategy**: Use the `granularity_strategy` to determine how many child jobs to create and what their payloads should be.
5.  **Enqueue Children**: Enqueue the new child jobs (which can be `'plan'` or `'execute'` jobs).
6.  **Update State**: Set the parent job's `status` to `waiting_for_children` and the `step_info.status` to `awaiting_children`.

### 4.3. Principle 3: The Atomic Executor (`processSimpleJob`)
When an `'execute'` job arrives, its contract is simple: it is guaranteed to have a `prompt_resource_id`. Its sole responsibility is to fetch the prompt, call the AI model, and save the resulting contribution.

### 4.4. Principle 4: The Granularity Strategy Pattern
To avoid "stringly-typed" logic, the `granularity_strategy` field maps to a registered function in the worker. This makes the planner modular and easily testable.

```typescript
// Example of a strategy registry in the worker
const granularityStrategies = {
  'pairwise': generatePairwiseJobs,
  'per_source_group': generateGroupedJobs,
  'single': generateSingleJob,
};

function getGranularityPlanner(strategyId: string): (inputs: Artifact[]) => JobPlan[] {
    return granularityStrategies[strategyId] || generateSingleJob;
}
```

### 4.5. Principle 5: Robust Lifecycle and Orchestration
A job's lifecycle is managed explicitly through a detailed status set.

```typescript
type JobStatus = 
  | 'pending'              // Ready for worker pickup
  | 'planning'             // Being processed by the Planner
  | 'executing'            // Being processed by the Executor (AI model call)
  | 'waiting_for_children' // Parent waiting for child completion
  | 'completed'            // Fully done
  | 'failed'               // Permanently failed after retries
  | 'cancelled'            // User or system cancelled
```

Orchestration is handled by a database trigger or a scheduled function that wakes up parent jobs based on clear conditions (`all_children_complete`, `any_child_fails`, etc.) and the `dependency_policy` in the payload. Upon waking, the parent job either increments its `current_step` or transitions to `completed` or `failed`.

### 4.6. Note on Implementation: A Tiered Strategy for Context Window Management

A critical responsibility of the **Planner** and **Executor** is managing AI model context windows without losing critical information. Naive summarization is not an acceptable strategy. Instead, the worker must implement a tiered approach when preparing a prompt for a model call.

1.  **Tier 1: Full Context (Default)**
    *   **Condition:** The estimated token count of the prompt is within the target model's context window.
    *   **Action:** Send the complete, unaltered prompt. This is always the preferred method to ensure maximum fidelity.

2.  **Tier 2: Intelligent Combination (Slight Overflow)**
    *   **Condition:** The token count moderately exceeds the model's limit (e.g., by <50%).
    *   **Action:** The worker triggers a prerequisite "combination" job. This job uses a specific, high-fidelity prompt instructing a model to merge the source documents, eliminating only redundant phrasing while preserving all unique facts, arguments, and details. The resulting "losslessly compressed" text is then used for the original job.

3.  **Tier 3: Retrieval-Augmented Generation (Large Overflow)**
    *   **Condition:** The token count significantly exceeds the model's limit.
    *   **Action:** The worker leverages the planned RAG architecture. It ensures all source documents are indexed in the vector store and then uses a high-level query to retrieve the most relevant context chunks. The final prompt consists of the high-level goal and the retrieved chunks. This is used for tasks that can be solved with targeted information retrieval.

4.  **Tier 4: Graceful Failure (Impossible Tasks)**
    *   **Condition:** A task cannot be successfully executed with any of the above strategies (e.g., it requires a holistic understanding that RAG cannot provide, and combination is insufficient).
    *   **Action:** The worker must fail the job gracefully and dispatch a specific notification to the user explaining that the task could not be completed automatically due to context limitations, recommending manual intervention or breaking the problem down further.

This tiered logic is a core part of the worker's implementation and is essential for producing high-quality, reliable results in detail-sensitive domains.

## 5. Implementation Recommendations

To ensure a successful implementation, the following should be prioritized:

1.  **Recipe Validation**: Implement a robust validation layer (e.g., using Zod) that runs when stages are configured and before a job is processed. This validator should check for sequential step numbers, valid `granularity_strategy` IDs, and consistent input/output types.
2.  **Formal Job Creation in API**: Ensure the `generateContribution.ts` function constructs the full, formal `DialecticJobPayload`, including `job_type: 'plan'` and a correctly populated `step_info` object, as described in Section 2.
3.  **Comprehensive Error Recovery**: For each step, define clear error recovery strategies (e.g., `exponential_backoff` retries, `fail_parent` vs. `skip_step` escalation).
4.  **Observability**: Implement structured logging with job and trace IDs at every step. Provide tools for visualizing dependency trees and tracking the progress of long-running processes.

This architecture provides the engineering rigor required for a robust, production-ready system. It is explicit, stateful, and driven by declarative configuration, making it scalable and maintainable.
