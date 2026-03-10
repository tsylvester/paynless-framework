# Document Relationships Analysis: Lineage, Anchor, and Source Document

## Executive Summary

This document analyzes all five dialectic stage migrations to define the canonical logic for determining document relationships (lineage, anchor, source_document). The goal is to establish a **generic algorithm** that works for all current recipes AND any future COW (Copy-on-Write) DAG instances that users may create.

**Critical Findings:**
1.  **False Negative (Thesis EXECUTE):** Thesis EXECUTE steps (e.g., `generate_business_case`) have `header_context` inputs but **no** `document` inputs. The current logic incorrectly returns `no_document_inputs_required` because it only checks for document inputs, failing to recognize that these steps **produce** documents and therefore **require** an anchor for path construction.
2.  **False Positive (PLAN Steps):** PLAN steps (e.g., `antithesis_prepare_proposal_review_plan`) have `document` inputs but produce **no** renderable documents (only `header_context`). The current logic incorrectly returns `anchor_found`, conflating "input availability" with "anchor requirement."
3.  **Root Cause:** The `selectAnchorSourceDocument` function ignores `job_type` (PLAN vs EXECUTE) and `outputs_required` (whether documents are produced), leading to incorrect anchor decisions.

---

## 1. Definitions

### 1.1 Source Document (`document_relationships.source_document`)
- **Definition:** The ID of the first chunk/contribution that starts a multi-chunk document generation sequence.
- **Purpose:** When AI output exceeds token limits and continues across multiple API calls, `source_document` tracks the root chunk so all continuation chunks can be assembled into one complete document.
- **Set By:** The PRODUCER (executeModelCallAndSave) after successfully saving the contribution.
- **Value:** For root chunks, this equals the contribution's own ID. For continuation chunks, this equals the source_document from the previous chunk.

### 1.2 Lineage (`document_relationships.source_group`)
- **Definition:** The UUID of the root ancestor document from which all derived documents descend.
- **Purpose:** When multiple AI models generate competing proposals from the same seed, lineage tracks which "branch" of the DAG each document belongs to. This enables fan-out (multiple reviewers critique the same proposal) and fan-in (merge multiple critiques back together).
- **Set By:** Planners when creating jobs, derived from input documents.
- **Value:** Propagates from upstream documents. For initial proposals (Thesis), generated fresh. For downstream stages, inherited from the source document being processed.

### 1.3 Anchor (`document_relationships[stageSlug]`)
- **Definition:** The ID of the specific contribution that serves as the primary reference for a branch within a specific stage.
- **Purpose:** When a job needs to find its "context document" (e.g., the header_context that guides EXECUTE jobs), the anchor tells it exactly which contribution to fetch.
- **Set By:**
  - For root/first chunks: The PRODUCER (executeModelCallAndSave) sets `document_relationships[stageSlug] = contribution.id` after save.
  - For derived jobs: The PLANNER copies the anchor from the source document's relationships.
- **Key Rule:** Planners NEVER set the anchor for jobs they create. The anchor is set by the producer when the document is actually saved, ensuring it points to a real contribution ID.

---

## 2. Stage-by-Stage Analysis

### 2.1 Thesis Stage (20251006194531_thesis_stage.sql)

| Step | step_key | job_type | output_type | granularity | Document Inputs | Document Outputs | Current Behavior | Required Behavior |
|------|----------|----------|-------------|-------------|-----------------|------------------|------------------|-------------------|
| 1 | thesis_build_stage_header | PLAN | header_context | all_to_one | NONE (seed_prompt only) | NO | `no_document_inputs_required` | `no_anchor_required` |
| 2 | thesis_generate_business_case | EXECUTE | business_case | per_source_document | NONE (header_context only) | YES | `no_document_inputs_required` | `derive_from_header_context` |
| 3 | thesis_generate_feature_spec | EXECUTE | feature_spec | per_source_document | NONE (header_context only) | YES | `no_document_inputs_required` | `derive_from_header_context` |
| 4 | thesis_generate_technical_approach | EXECUTE | technical_approach | per_source_document | NONE (header_context only) | YES | `no_document_inputs_required` | `derive_from_header_context` |
| 5 | thesis_generate_success_metrics | EXECUTE | success_metrics | per_source_document | NONE (header_context only) | YES | `no_document_inputs_required` | `derive_from_header_context` |

**Thesis Anchor Logic:**
- **Step 1 (PLAN):** No document inputs. Granularity `all_to_one` implies no lineage tracking needed at this step. `no_anchor_required` is correct.
- **Steps 2-5 (EXECUTE):** These steps consume `header_context` but produce documents. They **require** an anchor for path construction. Current logic fails (`no_document_inputs_required`). Correct logic: `derive_from_header_context`.

---

### 2.2 Antithesis Stage (20251006194542_antithesis_stage.sql)

| Step | step_key | job_type | output_type | granularity | Document Inputs | Document Outputs | Current Behavior | Required Behavior |
|------|----------|----------|-------------|-------------|-----------------|------------------|------------------|-------------------|
| 1 | antithesis_prepare_proposal_review_plan | PLAN | header_context | per_source_document_by_lineage | YES (thesis docs) | NO | `anchor_found` | `anchor_found` (for lineage) |
| 2 | antithesis_generate_business_case_critique | EXECUTE | business_case_critique | per_source_document | YES (thesis docs) | YES | `anchor_found` | `anchor_found` |
| 2 | antithesis_generate_technical_feasibility_assessment | EXECUTE | technical_feasibility_assessment | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | antithesis_generate_risk_register | EXECUTE | risk_register | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | antithesis_generate_non_functional_requirements | EXECUTE | non_functional_requirements | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | antithesis_generate_dependency_map | EXECUTE | dependency_map | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | antithesis_generate_comparison_vector | EXECUTE | assembled_document_json | per_source_document | YES | YES | `anchor_found` | `anchor_found` |

**Antithesis Anchor Logic:**

**Step 1 (PLAN producing header_context):**
- **Issue:** Has document inputs (Thesis docs) but produces NO renderable documents.
- **Role of Anchor:** Since `granularity` is `per_source_document_by_lineage`, the anchor *is* actually needed here to track which lineage this header context belongs to (unlike `all_to_one` PLAN steps).
- **Correct Behavior:** `anchor_found` is acceptable here, provided the Planner uses it *only* for lineage tracking and not for path construction (since no file is rendered).

**Step 2 (EXECUTE producing documents):**
- Has document inputs. Produces documents.
- **Correct Behavior:** `anchor_found` is correct. The anchor provides the path.

---

### 2.3 Synthesis Stage (20251006194549_synthesis_stage.sql)

| Step | step_key | job_type | output_type | granularity | Document Inputs | Document Outputs | Current Behavior | Required Behavior |
|------|----------|----------|-------------|-------------|-----------------|------------------|------------------|-------------------|
| 1 | synthesis_prepare_pairwise_header | PLAN | header_context | all_to_one | YES (thesis+antithesis) | NO | `anchor_found` | `no_anchor_required` |
| 2 | synthesis_pairwise_business_case | EXECUTE | assembled_document_json | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | synthesis_pairwise_feature_spec | EXECUTE | assembled_document_json | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | synthesis_pairwise_technical_approach | EXECUTE | assembled_document_json | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 2 | synthesis_pairwise_success_metrics | EXECUTE | assembled_document_json | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 3 | synthesis_document_business_case | EXECUTE | assembled_document_json | all_to_one | YES (pairwise) | YES | `anchor_found` | `no_anchor_required` (New Lineage) |
| 3 | synthesis_document_feature_spec | EXECUTE | assembled_document_json | all_to_one | YES (pairwise) | YES | `anchor_found` | `no_anchor_required` (New Lineage) |
| 3 | synthesis_document_technical_approach | EXECUTE | assembled_document_json | all_to_one | YES (pairwise) | YES | `anchor_found` | `no_anchor_required` (New Lineage) |
| 3 | synthesis_document_success_metrics | EXECUTE | assembled_document_json | all_to_one | YES (pairwise) | YES | `anchor_found` | `no_anchor_required` (New Lineage) |
| 4 | generate_final_synthesis_header | PLAN | header_context | all_to_one | YES (synthesis docs) | NO | `anchor_found` | `no_anchor_required` |
| 5 | product_requirements | EXECUTE | product_requirements | all_to_one | YES (header_context) | YES | `anchor_found` | `anchor_found` |
| 5 | system_architecture | EXECUTE | system_architecture | all_to_one | YES | YES | `anchor_found` | `anchor_found` |
| 5 | tech_stack | EXECUTE | tech_stack | all_to_one | YES | YES | `anchor_found` | `anchor_found` |

**Synthesis Anchor Logic:**

**Steps 1 and 4 (PLAN jobs):**
- **Issue:** These are `all_to_one` strategies. They aggregate inputs.
- **Anchor Need:** They do **not** need an anchor because they don't belong to a specific lineage (they are the merge point or root of new process).
- **Correct Behavior:** `no_anchor_required`.

**Step 3 (EXECUTE all_to_one consolidation):**
- **Issue:** This merges multiple lineages into ONE output.
- **Anchor Need:** It explicitly creates a **NEW lineage**.
- **Correct Behavior:** `no_anchor_required` (forcing `source_group = null` by Planner).

**Step 5 (EXECUTE final):**
- Takes `header_context` as input. `anchor_found` is correct (derives from input context).

---

### 2.4 Parenthesis Stage (20251006194558_parenthesis_stage.sql)

| Step | step_key | job_type | output_type | granularity | Document Inputs | Document Outputs | Current Behavior | Required Behavior |
|------|----------|----------|-------------|-------------|-----------------|------------------|------------------|-------------------|
| 1 | build-planning-header | PLAN | header_context | all_to_one | YES (synthesis docs) | NO | `anchor_found` | `no_anchor_required` |
| 2 | generate-technical_requirements | EXECUTE | technical_requirements | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 3 | generate-master-plan | EXECUTE | master_plan | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 4 | generate-milestone-schema | EXECUTE | milestone_schema | per_source_document | YES | YES | `anchor_found` | `anchor_found` |

**Parenthesis Anchor Logic:**
- **Step 1:** `all_to_one` PLAN. Aggregates inputs. Should be `no_anchor_required`.
- **Steps 2-4:** Standard EXECUTE with `header_context` + doc inputs. `anchor_found` is correct.

---

### 2.5 Paralysis Stage (20251006194605_paralysis_stage.sql)

| Step | step_key | job_type | output_type | granularity | Document Inputs | Document Outputs | Current Behavior | Required Behavior |
|------|----------|----------|-------------|-------------|-----------------|------------------|------------------|-------------------|
| 1 | build-implementation-header | PLAN | header_context | all_to_one | YES (parenthesis docs) | NO | `anchor_found` | `no_anchor_required` |
| 2 | generate-actionable-checklist | EXECUTE | actionable_checklist | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 3 | generate-updated-master-plan | EXECUTE | updated_master_plan | per_source_document | YES | YES | `anchor_found` | `anchor_found` |
| 4 | generate-advisor-recommendations | EXECUTE | advisor_recommendations | per_source_document | YES | YES | `anchor_found` | `anchor_found` |

**Paralysis Anchor Logic:**
- **Step 1:** `all_to_one` PLAN. Aggregates inputs. Should be `no_anchor_required`.
- **Steps 2-4:** Standard EXECUTE. `anchor_found` is correct.

---

## 3. The Generic Algorithm

### 3.1 Decision Tree for Anchor Selection

The canonical logic for `selectAnchorSourceDocument` must be updated to consider `job_type`, `granularity_strategy`, and `outputs_required`, not just inputs.

```typescript
function selectAnchorSourceDocument(recipeStep, sourceDocs) -> SelectAnchorResult

1. Extract documentInputs from inputs_required (where type='document')
2. Check if outputs_required has documents array with renderable documents

IF job_type === 'PLAN':
   IF granularity_strategy === 'all_to_one':
      → return { status: 'no_anchor_required' }  // Aggregates all, no lineage tracking
   ELSE (per_source_document or per_source_document_by_lineage):
      IF documentInputs.length > 0:
         → select highest-relevance doc, return { status: 'anchor_found', document }
      ELSE:
         → return { status: 'no_document_inputs_required' }  // Edge case - shouldn't happen

ELSE IF job_type === 'EXECUTE':
   IF outputs_required.documents exists and has entries:
      // Step produces renderable documents - anchor REQUIRED for path construction
      IF documentInputs.length > 0:
         → select highest-relevance doc, return { status: 'anchor_found', document }
      ELSE:
         // No document inputs but produces documents (e.g., thesis EXECUTE steps)
         // Check for header_context input
         IF inputs_required has type='header_context':
            → return { status: 'derive_from_header_context' }  // NEW status
         ELSE:
            → throw error - invalid recipe configuration
   ELSE:
      // Step doesn't produce documents
      → return { status: 'no_anchor_required' }

ELSE:
   → throw error - unknown job_type
```

### 3.2 Key Invariants

1. **Planners NEVER set `document_relationships[stageSlug]` for root jobs.**
   - The producer (executeModelCallAndSave) sets this after successful save.
   - Value = the newly created contribution.id.

2. **Planners ALWAYS propagate lineage (source_group).**
   - Derived from input documents.
   - For merges (all_to_one), may create new lineage.

3. **Header_context jobs are special:**
   - They have document inputs (for context building).
   - They produce NO rendered documents.
   - Anchor selection must recognize this pattern and defer to producer.

4. **Anchor lookup uses the stage slug as key:**
   - `document_relationships.[stageSlug]` ensures that any stage can be set as the anchor. 
   - We cannot hard-code values, this is a COW DAG and a user may insert new stages as they see fit. 

5. **Source document vs Anchor:**
   - `source_document`: Tracks chunking/continuation (same document across multiple API calls)
   - `anchor` ([stageSlug]): Tracks lineage branching (same context across multiple documents in stage)

---

## 4. Summary Table: When to Set Anchor

This table maps the canonical scenarios to the required `SelectAnchorResult` and the responsible entity for setting the anchor ID.

| Scenario | Job Type | Output | Anchor Result | Lineage Source | Anchor Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Initial / Root Plan**<br>(e.g., Thesis Step 1) | PLAN | header_context | `no_anchor_required` | New / Seed | **Producer** (sets `self.id`) |
| **Derived Plan**<br>(e.g., Antithesis Step 1) | PLAN | header_context | `anchor_found` | Input Doc | **Producer** (sets `self.id`)<br>*(Planner uses input for lineage only)* |
| **First Doc in Stage**<br>(e.g., Thesis Step 2) | EXECUTE | document | `derive_from_header_context` | `header_context` | **Planner** (from `header_context`) |
| **Transformation**<br>(e.g., Antithesis Step 2) | EXECUTE | document | `anchor_found` | Input Doc | **Planner** (from Input Doc) |
| **Merge / Consolidation**<br>(e.g., Synthesis Step 3) | EXECUTE | document | `no_anchor_required` | New (`null`) | **Producer** (sets `self.id`) |

**Key Takeaway:** The **Planner** sets the anchor whenever a valid reference exists (input doc or header context). The **Producer** sets the anchor (to `self.id`) only when the Planner explicitly signals `no_anchor_required` (indicating a new lineage root) or when the Planner cannot provide one (e.g. initial step).

---

## 5. Implementation Fix Required

The `selectAnchorSourceDocument` function in `helpers.ts` must be enhanced to implement the decision tree defined in Section 3.1. This requires:

1.  **Update `SelectAnchorResult` Type:**
    Add new statuses to `dialectic.interface.ts` to handle the specific cases identified:
    ```typescript
    export type SelectAnchorResult = 
      | { status: 'no_anchor_required' }                         // PLAN with all_to_one OR EXECUTE without doc outputs
      | { status: 'anchor_found'; document: SourceDocument }     // Found anchor from doc inputs
      | { status: 'anchor_not_found'; targetSlug: string; targetDocumentKey: string } // Error
      | { status: 'derive_from_header_context' }                 // NEW: Use header_context's sourceAnchorModelSlug
      //| { status: 'no_document_inputs_required' };               // DEPRECATED - replace with more specific statuses
    ```

2.  **Update `selectAnchorSourceDocument` Function:**
    Modify the function signature to accept the full recipe context (or at least `job_type`, `granularity`, and `outputs_required`) and implement the logic from Section 3.1. It must strictly differentiate between "no anchor needed" (PLAN all_to_one) and "anchor needed but from header_context" (EXECUTE Thesis).

3.  **Update Planners:**
    Update `planComplexStage` and granularity planners to handle the new `SelectAnchorResult` statuses:
    -   **`no_anchor_required`:** Explicitly set `document_relationships.source_group = null` (forcing a new lineage/root).
    -   **`derive_from_header_context`:** Look up the `header_context` input. If it has a `source_group`, use it. If not (e.g., Seed Prompt origin), set `source_group = null`.
    -   **`anchor_found`:** Copy the anchor and lineage from the found document.

4.  **Producer Logic (executeModelCallAndSave):**
    Ensure the producer continues to self-assign the anchor (`job.document_relationships[stageSlug] = contribution.id`) when it detects that no anchor was provided by the planner, respecting the "Producer Sets Anchor" invariant for root documents.

---

## 6. Acceptance Criteria Validation

For the implementation to be considered complete, the following validations must be met:

1.  **Unit Tests (New):**
    -   `selectAnchorSourceDocument` must be tested against mocks of all 5 stage recipe steps.
    -   Verify `Thesis Step 2` returns `derive_from_header_context`.
    -   Verify `Antithesis Step 1` returns `anchor_found`.
    -   Verify `Synthesis Step 3` returns `no_anchor_required`.

2.  **Integration Tests (Existing):**
    -   **Thesis:** Verify generated documents (Business Case, etc.) have the correct `source_group` (matches their `header_context`) and `anchor` (matches the `header_context`'s ID).
    -   **Antithesis/Parenthesis/Paralysis:** Verify Step 1 (`header_context`) has a valid `source_group` derived from inputs, but its `anchor` is its own ID.
    -   **Synthesis:** Verify Step 3 documents have a **new** `source_group` (unrelated to inputs) and their `anchor` is their own ID.

3.  **System Stability:**
    -   All stages must complete execution without "Ambiguous Anchor" errors or infinite loops.
    -   Lineage tracking must correctly group documents for the "compare" views in the frontend.

This is a COW DAG. Users can add new stages, steps, and document inputs and outputs. The logic must conform to the existing stage requirements, which establishes the logical requirements for any future stages, steps, inputs, and outputs that users may set. 

---

*Generated by Claude Opus 4.5 - Mode: Reviewer*
