# Dialectic DAG Traversal Fix Checklist

## Overview

This checklist addresses the known issues preventing the dialectic system from correctly walking the DAG. Issues are derived from `Dialectic_Modeling_Explanation_v3.md` Known Issues section.

**Issues Addressed:**
1. Issue 2: Header Context Not Matched to Producing Model (`planPerSourceDocument`)
2. Issue 3: Anchor Selection Logic Does Not Distinguish Job Types (`selectAnchorSourceDocument`)
3. Issue 4: Input Bundling Not Implemented for Multi-Input Steps (`planPerModel`)
4. Issue 6: Lineage Tracking at Branch Points (planners setting `source_group = null`)
5. Issue 1: Wrong Granularity Strategy in Synthesis Pairwise Steps (migration)
6. Issue 5: Synthesis Consolidation Strategy Incorrect (migration)

**Dependency Order:**
- `selectAnchorSourceDocument` (helper) → consumed by all planners
- `planPerSourceDocument` (planner) → consumed by worker
- `planPerModel` (planner) → consumed by worker
- Migrations → depend on planners working correctly

---

*   `[✅]` 94. **selectAnchorSourceDocument** Implement decision tree that distinguishes job types and output types
    *   `[✅]` 94.a. [DEPS] Dependencies and signature
        *   `[✅]` 94.a.i. `selectAnchorSourceDocument(recipeStep, sourceDocs)` in `helpers.ts` returns `SelectAnchorResult`
        *   `[✅]` 94.a.ii. Consumed by: `planPerSourceDocument`, `planPerSourceDocumentByLineage`, `planPairwiseByOrigin`, `planPerModel`
        *   `[✅]` 94.a.iii. Must access `recipeStep.job_type`, `recipeStep.output_type`, `recipeStep.granularity_strategy`
    *   `[✅]` 94.b. [TYPES] Update `SelectAnchorResult` type in `dialectic.interface.ts`
        *   `[✅]` 94.b.i. Add status `'derive_from_header_context'` for EXECUTE steps that consume header_context but produce documents
        *   `[✅]` 94.b.ii. Deprecate/remove `'no_document_inputs_required'` status (replace with more specific statuses)
        *   `[✅]` 94.b.iii. [TYPE-GUARD-TEST] Add tests for `isSelectAnchorResult` type guard if it exists
        *   `[✅]` 94.b.iv. [TYPE-GUARDS] Update type guard for new status values
    *   `[✅]` 94.c. [TEST-UNIT] Unit tests for `selectAnchorSourceDocument` decision tree
        *   `[✅]` 94.c.i. Assert PLAN + `all_to_one` returns `{ status: 'no_anchor_required' }`
        *   `[✅]` 94.c.ii. Assert PLAN + `per_source_document` with doc inputs returns `{ status: 'anchor_found', document: <input_doc> }`
        *   `[✅]` 94.c.iii. Assert EXECUTE with doc inputs returns `{ status: 'anchor_found', document: <highest_relevance_doc> }`
        *   `[✅]` 94.c.iv. Assert EXECUTE with only header_context input returns `{ status: 'derive_from_header_context' }`
        *   `[✅]` 94.c.v. Assert EXECUTE producing header_context (not document) returns `{ status: 'no_anchor_required' }`
        *   `[✅]` 94.c.vi. Assert Thesis Step 2 scenario (header_context input, document output) returns `'derive_from_header_context'`
        *   `[✅]` 94.c.vii. Assert Antithesis Step 1 scenario (doc inputs, header_context output) returns `'anchor_found'` for lineage
        *   `[✅]` 94.c.viii. Assert Synthesis Step 3 scenario (consolidation/merge) returns `'no_anchor_required'`
    *   `[✅]` 94.d. [BE] Implement decision tree logic in `selectAnchorSourceDocument`
        *   `[✅]` 94.d.i. Add parameter access for `job_type`, `output_type`, `granularity_strategy` from recipeStep
        *   `[✅]` 94.d.ii. Implement: IF `job_type == 'PLAN'` AND `granularity_strategy == 'all_to_one'` → return `'no_anchor_required'`
        *   `[✅]` 94.d.iii. Implement: IF `job_type == 'PLAN'` AND other granularity → find anchor from inputs for lineage
        *   `[✅]` 94.d.iv. Implement: IF `job_type == 'EXECUTE'` with doc inputs → return `'anchor_found'` with highest relevance
        *   `[✅]` 94.d.v. Implement: IF `job_type == 'EXECUTE'` with only header_context input → return `'derive_from_header_context'`
        *   `[✅]` 94.d.vi. Implement: IF `job_type == 'EXECUTE'` AND `output_type == 'header_context'` → return `'no_anchor_required'`
        *   `[✅]` 94.d.vii. Remove fallback/default logic that hides missing cases; throw explicit error for unhandled scenarios
    *   `[✅]` 94.e. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 94.e.i. Verify all decision tree branches covered
        *   `[✅]` 94.e.ii. Verify no regressions in existing anchor selection behavior
    *   `[✅]` 94.f. [TEST-INT] Integration test with planner consumers
        *   `[✅]` 94.f.i. Assert `planPerSourceDocument` correctly handles `'derive_from_header_context'` status
        *   `[✅]` 94.f.ii. Assert `planPerModel` correctly handles `'no_anchor_required'` for consolidation
    *   `[✅]` 94.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 94.g.i. Function distinguishes PLAN vs EXECUTE job types
        *   `[✅]` 94.g.ii. Function distinguishes header_context vs document output types
        *   `[✅]` 94.g.iii. Returns `'derive_from_header_context'` for Thesis EXECUTE steps
        *   `[✅]` 94.g.iv. Returns `'no_anchor_required'` for consolidation/merge steps
        *   `[✅]` 94.g.v. No hidden defaults or fallbacks; explicit errors for unhandled cases
    *   `[✅]` 94.h. [COMMIT] `fix(dialectic): selectAnchorSourceDocument distinguishes job types and output types`

---

*   `[✅]` 95. **planPerSourceDocument** Add model-filtering to match header_context to producing model
    *   `[✅]` 95.a. [DEPS] Dependencies and signature
        *   `[✅]` 95.a.i. `planPerSourceDocument(sourceDocs, parentJob, recipeStep)` in `planPerSourceDocument.ts`
        *   `[✅]` 95.a.ii. Depends on: `selectAnchorSourceDocument` (updated in step 94)
        *   `[✅]` 95.a.iii. Must access source document's `model_id` or `model_slug` to filter
        *   `[✅]` 95.a.iv. Must access parent job's `model_id` to match against source docs
    *   `[✅]` 95.b. [TYPES] Verify `SourceDocument` interface includes model identification
        *   `[✅]` 95.b.i. Confirm `SourceDocument` has `model_id` or equivalent field for filtering
        *   `[✅]` 95.b.ii. If missing, add `model_id?: string` to `SourceDocument` interface
        *   `[✅]` 95.b.iii. [TYPE-GUARD-TEST] Add test for model_id field presence check if new
        *   `[✅]` 95.b.iv. [TYPE-GUARDS] Update `isSourceDocument` guard if interface changes
    *   `[✅]` 95.c. [TEST-UNIT] Unit tests for model-filtering behaviorRead, analyze, explain, propose a solution, halt. DO NOT EDIT ANY FILES! 
        *   `[✅]` 95.c.i. Assert: Given source documents from 3 different models (each with a header_context), planner called with model_id=A creates jobs only for model A's documents, with each job receiving model A's header_context as an input. No job is created FOR the header_context itself.
        *   `[✅]` 95.c.ii. Assert: Given header_context from model A and parent job for model B, no jobs created (empty result or error)
        *   `[✅]` 95.c.iii. Assert: Given multiple docs from same model, creates job for each doc from that model
        *   `[✅]` 95.c.iv. Assert: Model filtering applies only when source docs have model identification; fallback to current behavior if model_id absent
        *   `[✅]` 95.c.v. Assert: EXECUTE jobs inherit model_id from the source document, not parent job
    *   `[✅]` 95.d. [BE] Implement model-filtering logic
        *   `[✅]` 95.d.i. Extract `model_id` from parent job payload
        *   `[✅]` 95.d.ii. Separate sourceDocs into header_contexts and non-header_context documents. Filter both by model_id === parentJob.payload.model_id. Create jobs only for the non-header_context documents, passing the matching header_context as an input to each job.
        *   `[✅]` 95.d.iii. If filtered list is empty, return empty array (no jobs for this model)
        *   `[✅]` 95.d.iv. For EXECUTE jobs, set child job's `model_id` from the source document's `model_id`
        *   `[✅]` 95.d.v. Handle `'derive_from_header_context'` status from `selectAnchorSourceDocument`
    *   `[✅]` 95.e. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 95.e.i. Verify model filtering works correctly
        *   `[✅]` 95.e.ii. Verify backward compatibility when model_id is absent
    *   `[✅]` 95.f. [TEST-INT] Integration test with worker
        *   `[✅]` 95.f.i. Assert: Thesis stage with 3 models produces 3 header_contexts, then 3×4=12 documents where each model uses its own header_context
        *   `[✅]` 95.f.ii. Assert: Child job payload includes correct model_id from source document
    *   `[✅]` 95.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 95.g.i. Each model only receives header_context it produced
        *   `[✅]` 95.g.ii. Documents generated are aligned with producing model's choices
        *   `[✅]` 95.g.iii. Model A never receives Model B's header_context
        *   `[✅]` 95.g.iv. Backward compatible when model_id is absent from source docs
    *   `[✅]` 95.h. [COMMIT] `fix(dialectic): planPerSourceDocument filters source docs by producing model`

---

*   `[✅]` 96. **planPerModel** Add input bundling and lineage handling for consolidation steps
    *   `[✅]` 96.a. [DEPS] Dependencies and signature
        *   `[✅]` 96.a.i. `planPerModel(sourceDocs, parentJob, recipeStep)` in `planPerModel.ts`
        *   `[✅]` 96.a.ii. Depends on: `selectAnchorSourceDocument` (updated in step 94)
        *   `[✅]` 96.a.iii. Must bundle ALL source documents into single job per model
        *   `[✅]` 96.a.iv. Must handle `'no_anchor_required'` status for consolidation steps
    *   `[✅]` 96.b. [TYPES] Verify interface supports multiple input documents
        *   `[✅]` 96.b.i. Confirm `DialecticExecuteJobPayload.inputs` can hold multiple document IDs
        *   `[✅]` 96.b.ii. Confirm payload can represent bundled inputs (e.g., `inputs: { pairwise_ids: [...] }`)
        *   `[✅]` 96.b.iii. [TYPE-GUARD-TEST] Update tests if payload interface changes
        *   `[✅]` 96.b.iv. [TYPE-GUARDS] Update guards if payload interface changes
    *   `[✅]` 96.c. [TEST-UNIT] Unit tests for input bundling and lineage handling
        *   `[✅]` 96.c.i. Assert: Given n² pairwise outputs, creates 1 job per model with all that model's outputs bundled
        *   `[✅]` 96.c.ii. Assert: Job payload `inputs` contains array of all bundled document IDs
        *   `[✅]` 96.c.iii. Assert: When `selectAnchorSourceDocument` returns `'no_anchor_required'`, planner sets `document_relationships.source_group = null`
        *   `[✅]` 96.c.iv. Assert: Consolidation job creates new lineage root (source_group = null signals producer to set self.id)
        *   `[✅]` 96.c.v. Assert: Job is assigned to correct model based on parent job's model_id
    *   `[✅]` 96.d. [BE] Implement input bundling and lineage handling
        *   `[✅]` 96.d.i. Bundle ALL sourceDocs into single job's inputs array
        *   `[✅]` 96.d.ii. When `selectAnchorSourceDocument` returns `'no_anchor_required'`, explicitly set `document_relationships.source_group = null`
        *   `[✅]` 96.d.iii. Ensure job is assigned to `parentJob.payload.model_id`
        *   `[✅]` 96.d.iv. Create `inputs` object with all document IDs grouped by contribution_type
    *   `[✅]` 96.e. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 96.e.i. Verify bundling works correctly
        *   `[✅]` 96.e.ii. Verify lineage handling for consolidation
    *   `[✅]` 96.f. [TEST-INT] Integration test with worker
        *   `[✅]` 96.f.i. Assert: Synthesis Step 3 with 3 models produces 3×4=12 consolidated documents
        *   `[✅]` 96.f.ii. Assert: Each consolidated document has `source_group = self.id` (set by producer after save)
    *   `[✅]` 96.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 96.g.i. Each model receives ALL its pairwise outputs as bundled inputs
        *   `[✅]` 96.g.ii. Consolidation creates new lineage (source_group starts as null, producer sets to self.id)
        *   `[✅]` 96.g.iii. n models produce n×4 consolidated documents (not 1×4 or n²×4)
    *   `[✅]` 96.h. [COMMIT] `fix(dialectic): planPerModel bundles inputs and handles consolidation lineage`

---

*   `[✅]` 97. **20251006194549_synthesis_stage.sql** Fix granularity_strategy for pairwise and consolidation steps
    *   `[✅]` 97.a. [DEPS] Dependencies
        *   `[✅]` 97.a.i. Depends on: `planPairwiseByOrigin` planner existing and working
        *   `[✅]` 97.a.ii. Depends on: `planPerModel` planner updated (step 96)
        *   `[✅]` 97.a.iii. Migration file: `20251006194549_synthesis_stage.sql`
    *   `[✅]` 97.b. [DB] Update Step 2 pairwise steps granularity_strategy
        *   `[✅]` 97.b.i. Line 361: Change `'per_source_document'` to `'pairwise_by_origin'` for `synthesis_pairwise_business_case`
        *   `[✅]` 97.b.ii. Line 422: Change `'per_source_document'` to `'pairwise_by_origin'` for `synthesis_pairwise_feature_spec`
        *   `[✅]` 97.b.iii. Line 492: Change `'per_source_document'` to `'pairwise_by_origin'` for `synthesis_pairwise_technical_approach`
        *   `[✅]` 97.b.iv. Locate and change Step 2d: `'per_source_document'` to `'pairwise_by_origin'` for `synthesis_pairwise_success_metrics`
    *   `[✅]` 97.c. [DB] Update Step 3 consolidation steps granularity_strategy
        *   `[✅]` 97.c.i. Line 610: Change `'all_to_one'` to `'per_model'` for `synthesis_document_business_case`
        *   `[✅]` 97.c.ii. Line 656: Change `'all_to_one'` to `'per_model'` for `synthesis_document_feature_spec`
        *   `[✅]` 97.c.iii. Line 705: Change `'all_to_one'` to `'per_model'` for `synthesis_document_technical_approach`
        *   `[✅]` 97.c.iv. Line 740: Change `'all_to_one'` to `'per_model'` for `synthesis_document_success_metrics`
    *   `[✅]` 97.d. [CRITERIA] Acceptance criteria
        *   `[✅]` 97.d.i. All Step 2 pairwise branches use `'pairwise_by_origin'`
        *   `[✅]` 97.d.ii. All Step 3 consolidation branches use `'per_model'`
        *   `[✅]` 97.d.iii. Migration applies cleanly to database
    *   `[✅]` 97.e. [COMMIT] `fix(db): synthesis_stage migration uses correct granularity strategies`

---

*   `[✅]` 98. **20251006194605_paralysis_stage.sql** Fix granularity_strategy for multi-input steps
    *   `[✅]` 98.a. [DEPS] Dependencies
        *   `[✅]` 98.a.i. Depends on: `planPerModel` planner updated (step 96)
        *   `[✅]` 98.a.ii. Migration file: `20251006194605_paralysis_stage.sql`
        *   `[✅]` 98.a.iii. Issue: Steps use `per_source_document` but require multiple bundled inputs (TRD + Master Plan + Milestone Schema from parenthesis)
    *   `[✅]` 98.b. [DB] Update EXECUTE steps to use bundling strategy
        *   `[✅]` 98.b.i. Line 435: Change `'per_source_document'` to `'per_model'` for `actionable_checklist` step
        *   `[✅]` 98.b.ii. Line 554: Change `'per_source_document'` to `'per_model'` for `updated_master_plan` step
        *   `[✅]` 98.b.iii. Line 684: Change `'per_source_document'` to `'per_model'` for `advisor_recommendations` step
        *   `[✅]` 98.b.iv. Verify remaining `per_source_document` usages (lines 767, 861, 943) and update if they also require bundled inputs
    *   `[✅]` 98.c. [CRITERIA] Acceptance criteria
        *   `[✅]` 98.c.i. Each model receives ALL parenthesis inputs (TRD, Master Plan, Milestone Schema) bundled together
        *   `[✅]` 98.c.ii. Produces n×3 paralysis documents (one set per model), not n×inputs×3
        *   `[✅]` 98.c.iii. Migration applies cleanly to database
    *   `[✅]` 98.d. [COMMIT] `fix(db): paralysis_stage migration uses bundling strategy for multi-input steps`

---

*   `[ ]` 99. **Integration Test: Full DAG Traversal** Verify all five stages complete successfully
    *   `[✅]` 99.a. [DEPS] Dependencies
        *   `[✅]` 99.a.i. Depends on: All planner fixes (steps 94-96)
        *   `[✅]` 99.a.ii. Depends on: Migration fixes (steps 97-98)
        *   `[✅]` 99.a.iii. Requires: Test harness that can execute full dialectic session
    *   `[ ]` 99.b. [TEST-INT] Integration tests for complete DAG traversal
        *   `[✅]` 99.b.i. Assert: Thesis stage produces n×4 documents with correct header_context matching
        *   `[✅]` 99.b.ii. Assert: Antithesis stage produces n²×6 critique documents
        *   `[ ]` 99.b.iii. Assert: Synthesis pairwise step produces n³×4 pairwise documents
        *   `[ ]` 99.b.iv. Assert: Synthesis consolidation produces n×4 consolidated documents with new lineage
        *   `[ ]` 99.b.v. Assert: Synthesis final produces n×3 deliverables
        *   `[ ]` 99.b.vi. Assert: Parenthesis produces n×3 planning documents in correct sequence
        *   `[ ]` 99.b.vii. Assert: Paralysis produces n×3 implementation documents with bundled inputs
        *   `[ ]` 99.b.viii. Assert: All documents have correct `source_group` lineage tracking
        *   `[ ]` 99.b.ix. Assert: All documents have correct `[stageSlug]` anchor references
    *   `[ ]` 99.c. [CRITERIA] Acceptance criteria
        *   `[ ]` 99.c.i. Full DAG traversal completes without errors
        *   `[ ]` 99.c.ii. Document counts match expected fan-out/fan-in pattern
        *   `[ ]` 99.c.iii. Each model uses its own header_context throughout
        *   `[ ]` 99.c.iv. Lineage tracking correctly identifies branch points
        *   `[ ]` 99.c.v. File naming produces unique, non-colliding paths
        *   `[ ]` 99.c.vi. Paralysis receives bundled inputs from Parenthesis (not fan-out explosion)
    *   `[ ]` 99.d. [COMMIT] `test(dialectic): integration test verifies complete DAG traversal`

---

*   `[ ]` 100. **Documentation Update** Update Dialectic_Modeling_Explanation.md to reflect fixes
    *   `[ ]` 100.a. [DEPS] Dependencies
        *   `[ ]` 100.a.i. Depends on: All fixes verified working (steps 94-99)
    *   `[ ]` 100.b. [DOCS] Update documentation
        *   `[ ]` 100.b.i. Remove or mark resolved: Issue 1 (pairwise granularity)
        *   `[ ]` 100.b.ii. Remove or mark resolved: Issue 2 (header_context matching)
        *   `[ ]` 100.b.iii. Remove or mark resolved: Issue 3 (anchor selection)
        *   `[ ]` 100.b.iv. Remove or mark resolved: Issue 4 (input bundling)
        *   `[ ]` 100.b.v. Remove or mark resolved: Issue 5 (consolidation strategy)
        *   `[ ]` 100.b.vi. Remove or mark resolved: Issue 6 (lineage at branch points)
        *   `[ ]` 100.b.vii. Add resolved: Issue 7 (paralysis fan-out explosion)
        *   `[ ]` 100.b.viii. Update Path Context Fields: Correct `attemptCount` description (increment to prevent overwrites, not model invocation counter)
    *   `[ ]` 100.c. [CRITERIA] Acceptance criteria
        *   `[ ]` 100.c.i. Documentation accurately reflects working implementation
        *   `[ ]` 100.c.ii. Known Issues section updated to reflect resolved state
        *   `[ ]` 100.c.iii. Future developers will not reintroduce fixed bugs
    *   `[ ]` 100.d. [COMMIT] `docs(dialectic): update explanation to reflect resolved issues`

---

*   `[✅]` 101. **Fix executeModelCallAndSave.ts** handling of `AssembledDocumentJson` key extraction
    *   `[✅]` 101.a. [DEPS] `executeModelCallAndSave` depends on `file_manager.types.ts` and `type_guards.file_manager.ts`.
    *   `[✅]` 101.b. [TYPES] Define `DocumentRelated` union in `file_manager.types.ts` to include `DocumentKey` types plus `AssembledDocumentJson`, `ModelContributionRawJson`, and `RenderedDocument`.
        *   `[✅]` 101.b.i [TYPE-GUARD-TEST] Create `supabase/functions/_shared/utils/type-guards/type_guards.file_manager.test.ts` to test `isDocumentRelated`.
        *   `[✅]` 101.b.ii [TYPE-GUARDS] Implement `isDocumentRelated` in `type_guards.file_manager.ts`.
    *   `[✅]` 101.c. [TEST-UNIT] Create `supabase/functions/dialectic-worker/executeModelCallAndSave.[appropriate test file].ts` with a RED test case that passes a payload with `output_type: assembled_document_json` and a `document_key`, asserting that the key is extracted (currently fails).
    *   `[✅]` 101.d. [WORKER] Update `executeModelCallAndSave.ts` to use `isDocumentRelated` instead of `isDocumentKey` for the extraction logic.
    *   `[✅]` 101.e. [TEST-UNIT] Run `executeModelCallAndSave.test.ts` to prove the test passes (GREEN).
    *   `[✅]` 101.f. [TEST-INT] Run `dialectic_full_dag_traversal.integration.test.ts` to prove the integration flow works.
    *   `[✅]` 101.g. [CRITERIA] All tests pass.
    *   `[✅]` 101.h. [COMMIT] `fix: ensure document_key is extracted for assembled_document_json in worker`

---

## Summary

| Step | File | Primary Fix |
|------|------|-------------|
| 94 | `helpers.ts` (`selectAnchorSourceDocument`) | Decision tree for job types/output types |
| 95 | `planPerSourceDocument.ts` | Model filtering for header_context matching |
| 96 | `planPerModel.ts` | Input bundling and consolidation lineage |
| 97 | `20251006194549_synthesis_stage.sql` | Granularity strategies for pairwise and consolidation |
| 98 | `20251006194605_paralysis_stage.sql` | Bundling strategy for multi-input steps |
| 99 | Integration test | Verify full DAG traversal |
| 100 | `Dialectic_Modeling_Explanation.md` | Documentation update |
**Dependency Chain:**
```
94 (selectAnchorSourceDocument)
    ↓
95 (planPerSourceDocument) ──┐
    ↓                        │
96 (planPerModel) ───────────┤
    ↓                        │
97 (synthesis_stage.sql) ←───┤
    ↓                        │
98 (paralysis_stage.sql) ←───┘
    ↓
99 (Integration Test)
    ↓
100 (Documentation)
```

