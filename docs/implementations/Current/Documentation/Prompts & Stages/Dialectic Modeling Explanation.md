# Dialectic Modeling Explanation

## Overview

This application is an automated project planner implemented as a Copy-on-Write (COW) Directed Acyclic Graph (DAG). It transforms a user's plain-language objective into a comprehensive, actionable work plan through a multi-stage document generation process called a "dialectic."

The system distributes work across one or more AI agents (models), each producing their own versions of documents. These documents are iteratively refined through stages that correspond to idea generation, criticism, improvement, planning, and implementation—mirroring typical FAANG software development workflows.

### Design Philosophy

The application is built around a specific five-stage dialectic, but the architecture is intentionally recipe-driven and dynamic to support future extensibility:

- **User-customizable DAGs**: Users will eventually be able to modify steps, stages, inputs, and outputs
- **Domain expansion**: While currently focused on software development, the system is designed to support arbitrary work planning domains
- **Recipe-driven execution**: Instead of hard-coding a specific sequence of events, the system walks the DAG based on recipe definitions, enabling flexibility

The current dialectic implementation serves as a template to define the requirements and constraints that must apply to arbitrary user-input DAG configurations.

---

## Core Concepts

### Project, Session, and Iteration

- **Project**: Created when a user inputs a new objective. The objective is stored as `original_user_request` in `dialectic_project_resources`.
- **Session**: A single pass through all five dialectic stages for a project.
- **Iteration**: Within a session, each stage can be iterated based on user feedback before advancing to the next stage.

### The Five Dialectic Stages

| Stage | Slug | Purpose | Outputs |
|-------|------|---------|---------|
| **Thesis** | `thesis` | Generate initial proposals from the user's objective | Business Case, Feature Spec, Technical Approach, Success Metrics |
| **Antithesis** | `antithesis` | Critique and challenge each proposal | Business Case Critique, Feasibility Assessment, Risk Register, NFRs, Dependency Map, Comparison Vector |
| **Synthesis** | `synthesis` | Combine proposals and critiques into refined documents | Product Requirements Document, System Architecture, Tech Stack |
| **Parenthesis** | `parenthesis` | Formalize into a detailed, executable plan | Technical Requirements, Master Plan, Milestone Schema |
| **Paralysis** | `paralysis` | Finalize into production-ready implementation details | Actionable Checklist, Updated Master Plan, Advisor Recommendations |

---

## Document Relationships

Understanding how documents relate to each other is critical for the planners to correctly locate inputs and for the file system to produce unique, traceable paths.

### Three Key Relationship Concepts

#### 1. Source Document (`document_relationships.source_document`)

- **Definition**: The ID of the first chunk/contribution that starts a multi-chunk document generation sequence.
- **Purpose**: When AI output exceeds token limits and continues across multiple API calls, `source_document` tracks the root chunk so all continuation chunks can be assembled into one complete document.
- **Set By**: The PRODUCER (executeModelCallAndSave) after successfully saving the contribution.
- **Value**: For root chunks, equals the contribution's own ID. For continuation chunks, equals the source_document from the previous chunk.

#### 2. Lineage / Source Group (`document_relationships.source_group`)

- **Definition**: The UUID of the root ancestor document from which all derived documents descend.
- **Purpose**: When multiple AI models generate competing proposals from the same seed, lineage tracks which "branch" of the DAG each document belongs to. This enables fan-out (multiple reviewers critique the same proposal) and fan-in (merge multiple critiques back together).
- **Set By**: Planners when creating jobs, derived from input documents.
- **Value**: 
  - For initial proposals (Thesis): Generated fresh (new lineage root)
  - For downstream stages: Inherited from the source document being processed
  - For merge/consolidation steps: New lineage created (null from planner, then set to self.id by producer)

#### 3. Anchor (`document_relationships[stageSlug]`)

- **Definition**: The ID of the specific contribution that serves as the primary reference for a branch within a specific stage.
- **Purpose**: When a job needs to find its "context document" (e.g., the header_context that guides EXECUTE jobs), the anchor tells it exactly which contribution to fetch.
- **Set By**:
  - For root/first chunks: The PRODUCER sets `document_relationships[stageSlug] = contribution.id` after save
  - For derived jobs: The PLANNER copies the anchor from the source document's relationships
- **Key Rule**: Planners NEVER set the anchor for jobs they create when the step creates a new lineage. The anchor is set by the producer when the document is actually saved, ensuring it points to a real contribution ID.

### Linked-List History Model

Documents only need to trace back to the **last branch** (the immediately preceding stage), not the entire history. Each document carries:
- Its own `source_group` (lineage)
- Its own `[stageSlug]` anchor for the current stage
- Reference to the previous stage's anchor

This creates a linked-list structure where any document can trace its full lineage by following the chain of stage anchors backward.

---

## File System Structure

### Complete Path Structure

```
{project_id}/
  session_{session_id}/
    iteration_{n}/
      {stage}/
        seed_prompt.md
        _work/
          prompts/
            {model_slug}_{attempt}_{stage}_planner_prompt.md
            {model_slug}_{attempt}_{stage}_{document_key}_prompt.md
            {model_slug}_{attempt}_{stage}_{document_key}_continuation_{c}_prompt.md
          context/
            {model_slug}_{attempt}_{sourceGroupFragment}_header_context.json
          assembled_json/
            {model_slug}_{attempt}_{document_key}_{sourceGroupFragment}.json
            {model_slug}_{attempt}_{document_key}_{lineage_key}_{match_key}.json  # pairwise
        raw_responses/
          {model_slug}_{attempt}_{stage}_{document_key}_{sourceGroupFragment}_raw.json
          {model_slug}_{attempt}_{stage}_{document_key}_continuation_{c}_raw.json
        documents/
          {model_slug}_{attempt}_{stage}_{document_key}_{sourceGroupFragment}.md
        user_feedback/
          {model_slug}_{attempt}_{document_key}_{sourceGroupFragment}_feedback.md
```

### Path Context Fields

| Field | Description | Example |
|-------|-------------|---------|
| `projectId` | UUID of the project | `a1b2c3d4-...` |
| `sessionId` | UUID of the session | `e5f6g7h8-...` |
| `iteration` | Iteration number within session | `1`, `2`, `3` |
| `stageSlug` | Stage identifier | `thesis`, `antithesis`, `synthesis` |
| `modelSlug` | Sanitized model identifier | `claude_35_sonnet`, `gpt_4o` |
| `attemptCount` | Model invocation counter within stage | `1`, `2` (when same model used multiple times) |
| `documentKey` | Document type identifier | `business_case`, `feature_spec` |
| `sourceGroupFragment` | First 8 chars of source_group UUID (sanitized) | `a1b2c3d4` |
| `lineage_key` | Original model that created root document | `claude_35_sonnet` |
| `match_key` | Reviewer model for pairwise outputs | `gpt_4o` |

### Source Group Fragment

The `sourceGroupFragment` is critical for disambiguation when:
- The same model processes multiple source document groups in parallel
- Multiple lineages exist within the same stage

**Extraction**: Take first 8 characters of `document_relationships.source_group` UUID after removing hyphens, convert to lowercase.

**Fragment positions in filenames**:
- Simple patterns (non-antithesis): Fragment appears after `documentKey`
- Antithesis patterns: Fragment appears between `sourceAnchorModelSlug` and `attemptCount`
- Pairwise patterns: Use `lineage_key` and `match_key` instead

---

## Architecture

### Recipe System

Each stage is defined by a **recipe** stored in `dialectic_recipe_templates`. A recipe specifies:

- **Steps**: Ordered operations that execute sequentially or in parallel
- **Edges**: DAG edges defining dependencies between steps (stored in `dialectic_recipe_template_edges`)
- **Inputs/Outputs**: What each step consumes and produces

### Recipe Steps

| Field | Description |
|-------|-------------|
| `step_number` | Execution order |
| `parallel_group` | Steps with same group number execute concurrently |
| `branch_key` | Identifies which document this step produces |
| `job_type` | `PLAN` (orchestrates) or `EXECUTE` (generates content) |
| `prompt_type` | `Planner` or `Turn` |
| `granularity_strategy` | How to fan out work |
| `inputs_required` | Array of input artifacts needed |
| `inputs_relevance` | Relevance weights for prioritizing inputs |
| `outputs_required` | Schema defining what the step produces |
| `output_type` | What kind of artifact is produced (e.g., `header_context`, `rendered_document`, `assembled_document_json`) |

### Granularity Strategies (Planners)

Planners determine how work fans out across models and documents:

| Strategy | File | Description | Creates N Jobs Where... |
|----------|------|-------------|------------------------|
| `all_to_one` | `planAllToOne.ts` | Single job with all inputs bundled | N = 1 |
| `per_model` | `planPerModel.ts` | One job per model | N = number of models |
| `per_source_document` | `planPerSourceDocument.ts` | One job per source document | N = number of source docs |
| `per_source_group` | `planPerSourceGroup.ts` | One job per group of related documents | N = number of distinct source_groups |
| `pairwise_by_origin` | `planPairwiseByOrigin.ts` | One job per thesis-antithesis pair | N = thesis docs × antithesis reviewers |

### Critical: Planner Selection by Step Type

| Step Pattern | Granularity | Bundling Behavior |
|--------------|-------------|-------------------|
| Initial header (all inputs → one header_context) | `all_to_one` | All inputs bundled into single job |
| Per-lineage header (one header per lineage) | `per_source_document` | One job per source lineage |
| Document generation from header | `per_source_document` | One job per header_context |
| Pairwise synthesis (thesis + critique) | `pairwise_by_origin` | One job per thesis-critique pair |
| Consolidation (N inputs → 1 output per model) | `per_model` or `all_to_one` | All related inputs bundled |

---

## Prompt Types

### 1. Seed Prompt

- **Purpose**: Bootstrap a stage by assembling all context needed for the planner
- **Generated**: Once per stage, per session, per iteration
- **NOT sent to AI**: Consumed internally to build the planner prompt
- **Artifact**: `{stage}/seed_prompt.md`

### 2. Planner Prompt

- **Purpose**: Generate a `HeaderContext` that orchestrates all downstream document generation
- **When Used**: First step of each stage (`job_type = 'PLAN'`, `prompt_type = 'Planner'`)
- **Outputs**: `HeaderContext` JSON
- **Artifact**: `{stage}/_work/prompts/{model_slug}_{n}_planner_prompt.md`

### 3. Turn Prompt

- **Purpose**: Generate actual document content
- **When Used**: After planner completes (`job_type = 'EXECUTE'`, `prompt_type = 'Turn'`)
- **Artifact**: `{stage}/_work/prompts/{model_slug}_{n}_{document_key}_prompt.md`

### 4. Continuation Prompt

- **Purpose**: Complete truncated or failed responses
- **When Used**: When model output exceeds token limits or encounters errors
- **Artifact**: `{stage}/_work/prompts/{model_slug}_{n}_{document_key}_continuation_{c}_prompt.md`

---

## Job System

### Job Types

- **PLAN**: Executes a planner prompt, produces `HeaderContext`, enqueues child EXECUTE jobs
- **EXECUTE**: Executes a turn prompt, produces document content

### Job Flow Within a Stage

```
1. Stage starts → Seed prompt assembled and saved
2. PLAN job dispatched → Planner runs → HeaderContext saved
3. Planner determines child jobs based on granularity_strategy
4. EXECUTE jobs dispatched with correct input bundles
5. Each EXECUTE job → Turn prompt sent to model → Document saved
6. All EXECUTE jobs complete → Stage marked complete
7. User provides feedback → Next stage marked pending
```

---

## Stage-by-Stage Execution

### Document Count Formula

Given **n** models participating in the dialectic:

| Stage | Step | Documents Generated | Explanation |
|-------|------|---------------------|-------------|
| Thesis | Step 1 | n | n header_contexts (one per model) |
| Thesis | Step 2 | n × 4 | Each model generates 4 documents |
| Antithesis | Step 1 | n² | Each model reviews each thesis proposal (n × n) |
| Antithesis | Step 2 | n² × 6 | 6 critique documents per header_context |
| Synthesis | Step 1 | n | n header_contexts for pairwise planning |
| Synthesis | Step 2 | n³ × 4 | Pairwise: each model synthesizes each pair (n² pairs × n models × 4 doc types) |
| Synthesis | Step 3 | n × 4 | Consolidation: each model produces 4 consolidated docs |
| Synthesis | Step 4 | n | n header_contexts for final deliverables |
| Synthesis | Step 5 | n × 3 | Each model produces 3 final deliverables |
| Parenthesis | Step 1 | n | n header_contexts |
| Parenthesis | Steps 2-4 | n × 3 | Each model produces 3 planning documents (sequential) |
| Paralysis | Step 1 | n | n header_contexts |
| Paralysis | Steps 2-4 | n × 3 | Each model produces 3 implementation documents |

### Fan-Out/Fan-In Pattern

```
Thesis: n
   ↓ (each of n models reviews each of n proposals)
Antithesis: n²
   ↓ (each of n models does pairwise synthesis on n² pairs)
Synthesis Pairwise: n³
   ↓ (each model consolidates its n² pairwise results)
Synthesis Consolidated: n
   ↓
Parenthesis: n
   ↓
Paralysis: n
```

---

### Thesis Stage (Recipe: `thesis_v1`)

**Input**: Seed prompt containing user objective

| Step | Name | Job Type | Output Type | Granularity | Parallelism |
|------|------|----------|-------------|-------------|-------------|
| 1 | `build-stage-header` | PLAN | header_context | `all_to_one` | - |
| 2a | `generate-business-case` | EXECUTE | business_case | `per_source_document` | parallel |
| 2b | `generate-feature-spec` | EXECUTE | feature_spec | `per_source_document` | parallel |
| 2c | `generate-technical-approach` | EXECUTE | technical_approach | `per_source_document` | parallel |
| 2d | `generate-success-metrics` | EXECUTE | success_metrics | `per_source_document` | parallel |

**Anchor Logic**:
- Step 1: No anchor required (creates new lineage from seed)
- Steps 2a-2d: Derive anchor from header_context

---

### Antithesis Stage (Recipe: `antithesis_v1`)

**Input**: All thesis documents + user feedback on thesis

| Step | Name | Job Type | Output Type | Granularity | Parallelism |
|------|------|----------|-------------|-------------|-------------|
| 1 | `prepare-proposal-review-plan` | PLAN | header_context | `per_source_document` | per-lineage |
| 2a | `generate-business-case-critique` | EXECUTE | business_case_critique | `per_source_document` | parallel |
| 2b | `generate-feasibility-assessment` | EXECUTE | technical_feasibility_assessment | `per_source_document` | parallel |
| 2c | `generate-risk-register` | EXECUTE | risk_register | `per_source_document` | parallel |
| 2d | `generate-nfr` | EXECUTE | non_functional_requirements | `per_source_document` | parallel |
| 2e | `generate-dependency-map` | EXECUTE | dependency_map | `per_source_document` | parallel |
| 2f | `generate-comparison-vector` | EXECUTE | comparison_vector | `per_source_document` | parallel |

**Key Point**: Step 1 produces n² header_contexts (one per thesis proposal per reviewing model).

---

### Synthesis Stage (Recipe: `synthesis_v1`)

**Input**: All thesis documents + all antithesis critiques + user feedback

| Step | Name | Job Type | Output Type | Granularity | Parallelism |
|------|------|----------|-------------|-------------|-------------|
| 1 | `prepare-pairwise-synthesis-header` | PLAN | header_context | `all_to_one` | - |
| 2a | `pairwise-synthesis-business-case` | EXECUTE | assembled_document_json | **`pairwise_by_origin`** | parallel |
| 2b | `pairwise-synthesis-feature-spec` | EXECUTE | assembled_document_json | **`pairwise_by_origin`** | parallel |
| 2c | `pairwise-synthesis-technical-approach` | EXECUTE | assembled_document_json | **`pairwise_by_origin`** | parallel |
| 2d | `pairwise-synthesis-success-metrics` | EXECUTE | assembled_document_json | **`pairwise_by_origin`** | parallel |
| 3a | `document-synthesis-business-case` | EXECUTE | assembled_document_json | `all_to_one` | parallel |
| 3b | `document-synthesis-feature-spec` | EXECUTE | assembled_document_json | `all_to_one` | parallel |
| 3c | `document-synthesis-technical-approach` | EXECUTE | assembled_document_json | `all_to_one` | parallel |
| 3d | `document-synthesis-success-metrics` | EXECUTE | assembled_document_json | `all_to_one` | parallel |
| 4 | `prepare-final-synthesis-header` | PLAN | header_context | `all_to_one` | - |
| 5a | `generate-product-requirements` | EXECUTE | product_requirements | `all_to_one` | parallel |
| 5b | `generate-system-architecture` | EXECUTE | system_architecture | `all_to_one` | parallel |
| 5c | `generate-tech-stack` | EXECUTE | tech_stack | `all_to_one` | parallel |

**Critical**: Step 2 MUST use `pairwise_by_origin` to correctly create thesis-antithesis pairs.

**Anchor Logic**:
- Steps 1, 4: No anchor required
- Step 2: Anchor from input documents (pairwise pairing)
- Step 3: No anchor required (creates new lineage - consolidation is a merge point)
- Step 5: Anchor from final header_context

---

### Parenthesis Stage (Recipe: `parenthesis_v1`)

**Input**: Synthesis deliverables + user feedback

| Step | Name | Job Type | Output Type | Granularity | Parallelism |
|------|------|----------|-------------|-------------|-------------|
| 1 | `build-planning-header` | PLAN | header_context | `all_to_one` | - |
| 2 | `generate-technical-requirements` | EXECUTE | technical_requirements | `per_source_document` | - |
| 3 | `generate-master-plan` | EXECUTE | master_plan | `per_source_document` | after Step 2 |
| 4 | `generate-milestone-schema` | EXECUTE | milestone_schema | `per_source_document` | after Step 3 |

**Sequential**: TRD → Master Plan → Milestone Schema (each depends on the previous).

---

### Paralysis Stage (Recipe: `paralysis_v1`)

**Input**: Parenthesis documents + user feedback

| Step | Name | Job Type | Output Type | Granularity | Parallelism |
|------|------|----------|-------------|-------------|-------------|
| 1 | `build-implementation-header` | PLAN | header_context | `all_to_one` | - |
| 2 | `generate-actionable-checklist` | EXECUTE | actionable_checklist | `per_source_document` | parallel |
| 3 | `generate-updated-master-plan` | EXECUTE | updated_master_plan | `per_source_document` | parallel |
| 4 | `generate-advisor-recommendations` | EXECUTE | advisor_recommendations | `per_source_document` | after 2,3 |

---

## Anchor Selection Logic

The `selectAnchorSourceDocument` function must implement this decision tree:

```
IF job_type == 'PLAN':
    IF granularity_strategy == 'all_to_one':
        → return { status: 'no_anchor_required' }
    ELSE:
        → Find anchor from input documents for lineage tracking
        → return { status: 'anchor_found', document: <input_doc> }

ELSE IF job_type == 'EXECUTE':
    IF has document inputs with matching relevance:
        → return { status: 'anchor_found', document: <highest_relevance_doc> }
    ELSE IF has header_context input:
        → return { status: 'derive_from_header_context' }
    ELSE IF output_type is NOT a document (e.g., header_context):
        → return { status: 'no_anchor_required' }
    ELSE:
        → throw error: cannot determine anchor
```

### Key Invariants

1. **Planners NEVER set `document_relationships[stageSlug]` for root jobs.** The producer sets this after successful save.

2. **Planners ALWAYS propagate lineage (source_group).** Derived from input documents. For merges, may create new lineage.

3. **Header_context jobs are special**: They may have document inputs (for context) but produce NO rendered documents.

4. **Anchor lookup uses stage slug as key**: `document_relationships[stageSlug]` - cannot be hard-coded since users may add custom stages.

5. **Source document vs Anchor**:
   - `source_document`: Tracks chunking/continuation
   - `anchor` ([stageSlug]): Tracks lineage branching

---

## Summary

The dialectic system transforms user objectives into actionable implementation plans through:

1. **Multi-agent diversity**: Multiple models generate competing proposals
2. **Structured criticism**: Systematic evaluation of each proposal
3. **Intelligent synthesis**: Combination of best elements via fan-out/fan-in
4. **Detailed planning**: Formalization into executable milestones
5. **Implementation readiness**: Production-ready checklists

The recipe-driven architecture enables future extensibility while the document relationship system (lineage, anchor, source_document) ensures planners can correctly locate inputs at each step. 