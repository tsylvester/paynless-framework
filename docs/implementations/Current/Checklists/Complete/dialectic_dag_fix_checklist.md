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
    *   `[✅]` 95.c. [TEST-UNIT] Unit tests for model-filtering behavior
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

*   `[✅]` 99. **Integration Test: Full DAG Traversal** Verify all five stages complete successfully
    *   `[✅]` 99.a. [DEPS] Dependencies
        *   `[✅]` 99.a.i. Depends on: All planner fixes (steps 94-96)
        *   `[✅]` 99.a.ii. Depends on: Migration fixes (steps 97-98)
        *   `[✅]` 99.a.iii. Requires: Test harness that can execute full dialectic session
    *   `[✅]` 99.b. [TEST-INT] Integration tests for complete DAG traversal
        *   `[✅]` 99.b.i. Assert: Thesis stage produces n×4 documents with correct header_context matching
        *   `[✅]` 99.b.ii. Assert: Antithesis stage produces n²×6 critique documents
        *   `[✅]` 99.b.iii. Assert: Synthesis pairwise step produces n³×4 pairwise documents
        *   `[✅]` 99.b.iv. Assert: Synthesis consolidation produces n×4 consolidated documents with new lineage
        *   `[✅]` 99.b.v. Assert: Synthesis final produces n×3 deliverables
        *   `[✅]` 99.b.vi. Assert: Parenthesis produces n×3 planning documents in correct sequence
        *   `[✅]` 99.b.vii. Assert: Paralysis produces n×3 implementation documents with bundled inputs
        *   `[✅]` 99.b.viii. Assert: All documents have correct `source_group` lineage tracking
        *   `[✅]` 99.b.ix. Assert: All documents have correct `[stageSlug]` anchor references
    *   `[✅]` 99.c. [CRITERIA] Acceptance criteria
        *   `[✅]` 99.c.i. Full DAG traversal completes without errors
        *   `[✅]` 99.c.ii. Document counts match expected fan-out/fan-in pattern
        *   `[✅]` 99.c.iii. Each model uses its own header_context throughout
        *   `[✅]` 99.c.iv. Lineage tracking correctly identifies branch points
        *   `[✅]` 99.c.v. File naming produces unique, non-colliding paths
        *   `[✅]` 99.c.vi. Paralysis receives bundled inputs from Parenthesis (not fan-out explosion)
    *   `[✅]` 99.d. [COMMIT] `test(dialectic): integration test verifies complete DAG traversal`

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

*   `[🚧]` 102. **assembleTurnPrompt.ts** Fix DI violations and use injected dependencies
    *   `[✅]` 102.a. [DEPS] Dependencies and signature
        *   `[✅]` 102.a.i. `assembleTurnPrompt(deps: AssembleTurnPromptDeps, params: AssembleTurnPromptParams)` in `assembleTurnPrompt.ts`
        *   `[✅]` 102.a.ii. Deps interface (line 21-27): `dbClient`, `fileManager`, `gatherContext`, `render`, `downloadFromStorage`
        *   `[✅]` 102.a.iii. Params interface (line 29-35): `job`, `project`, `session`, `stage`, `sourceContributionId`
        *   `[✅]` 102.a.iv. `RenderFn` signature expects `(renderPromptFn, stage, context: DynamicContextVariables, userProjectOverlayValues)`
    *   `[✅]` 102.b. [TYPES] Verify existing types are sufficient
        *   `[✅]` 102.b.i. `AssembleTurnPromptDeps` already defined at line 21-27
        *   `[✅]` 102.b.ii. `AssembleTurnPromptParams` already defined at line 29-35
        *   `[✅]` 102.b.iii. `DynamicContextVariables` already defined at line 115-127
        *   `[✅]` 102.b.iv. `RenderFn` already defined at line 14-19
    *   `[🚫]` 102.c. [TEST-UNIT] Existing test at `assembleTurnPrompt.rendering.test.ts` proves the flaw (RED state)
        *   `[🚫]` 102.c.i. Test passes `render` and `gatherContext` as DI deps (lines 466-472)
        *   `[🚫]` 102.c.ii. Test expects `EXPECTED_RENDERED_CONTENT` with filled placeholders (lines 288-299)
        *   `[🚫]` 102.c.iii. Current implementation ignores DI deps, causing test to fail
        *   `[✅]` 102.c.div. **Not an obligation of assembleTurnPrompt!** Unit test for `render.ts` provided in `render.test.ts` suite. 
    *   `[✅]` 102.d. [BE] Fix `assembleTurnPrompt` to use injected dependencies
        *   `[✅]` 102.d.i. Update function signature from `({ dbClient, fileManager, job, ... })` to `(deps, params)` pattern
        *   `[✅]` 102.d.ii. Replace direct `downloadFromStorage()` calls with `deps.downloadFromStorage()`
        *   `[✅]` 102.d.iii. Call `deps.gatherContext()` to build proper `DynamicContextVariables`
        *   `[✅]` 102.d.iv. Replace direct `renderPrompt()` call with `deps.render(renderPrompt, stage, dynamicContext, project.user_domain_overlay_values)`
        *   `[✅]` 102.d.v. Remove direct imports of `downloadFromStorage` and `renderPrompt`
    *   `[🚫]` 102.e. [TEST-UNIT] Rerun `assembleTurnPrompt.rendering.test.ts` and verify GREEN state
        *   `[🚫]` 102.e.i. Assert rendered prompt includes `role` value
        *   `[🚫]` 102.e.ii. Assert rendered prompt includes `style_guide_markdown` value
        *   `[🚫]` 102.e.iii. Assert rendered prompt includes `header_context` JSON
        *   `[🚫]` 102.e.iv. Assert `result.promptContent` equals `EXPECTED_RENDERED_CONTENT`
        *   `[✅]` 102.e.v. **Not an obligation of assembleTurnPrompt!** Unit test for `render.ts` provided in `render.test.ts` suite. 
    *   `[✅]` 102.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 102.f.i. Function signature matches `(deps: AssembleTurnPromptDeps, params: AssembleTurnPromptParams)`
        *   `[✅]` 102.f.ii. All storage downloads use `deps.downloadFromStorage`
        *   `[✅]` 102.f.iii. Context gathering uses `deps.gatherContext`
        *   `[✅]` 102.f.iv. Rendering uses `deps.render` with proper overlay layering
        *   `[🚫]` 102.f.v. No direct imports of functions that should be injected
        *   `[✅]` 102.f.vi. `RenderFn` expects `renderPromptFn` as a param so the function is imported to be supplied to the `deps.render` call. 
        *   `[✅]` 102.f.vii. Correcting `RenderFn` DI construction out of scope for this step. 
    *   `[✅]` 102.g. [COMMIT] `fix(be): assembleTurnPrompt uses DI for downloadFromStorage, gatherContext, and render`


*   `[✅]` 103. **selectAnchorForCanonicalPathParams** Select anchor document for canonical path params based on relevance
    *   `[✅]` 103.a. [DEPS] Dependencies and signature
        *   `[✅]` 103.a.i. `selectAnchorForCanonicalPathParams(recipeStep: DialecticRecipeStep, sourceDocs: SourceDocument[])` in `helpers.ts` returns `SourceDocument | null`
        *   `[✅]` 103.a.ii. Consumed by: `planAllToOne` (step 104)
        *   `[✅]` 103.a.iii. Must access `recipeStep.inputs_required` to extract document-type input rules
        *   `[✅]` 103.a.iv. Must access `recipeStep.inputs_relevance` to build relevance map for document keys
        *   `[✅]` 103.a.v. Must use `deconstructStoragePath` to extract `document_key` from source document filenames
        *   `[✅]` 103.a.vi. Must match source documents by `stage` and `document_key` against `inputs_required` rules
    *   `[✅]` 103.b. [TYPES] Verify existing types are sufficient
        *   `[✅]` 103.b.i. `SourceDocument` interface already includes `stage`, `file_name`, `storage_path` fields
        *   `[✅]` 103.b.ii. `DialecticRecipeStep` interface already includes `inputs_required` and `inputs_relevance` arrays
        *   `[✅]` 103.b.iii. `deconstructStoragePath` utility already exists in `path_deconstructor.ts` and returns `documentKey` field
    *   `[✅]` 103.c. [TEST-UNIT] Unit tests for `selectAnchorForCanonicalPathParams` in `helpers.test.ts`
        *   `[✅]` 103.c.i. Assert: Given recipe step with `inputs_required` containing business_case (relevance 1.0) and feature_spec (relevance 0.9), and sourceDocs with matching documents, returns business_case document (highest relevance)
        *   `[✅]` 103.c.ii. Assert: Given recipe step with empty `inputs_relevance` array, returns `null` (no relevance metadata available)
        *   `[✅]` 103.c.iii. Assert: Given recipe step with no document inputs in `inputs_required`, returns `null`
        *   `[✅]` 103.c.iv. Assert: Given recipe step with document input but no matching source document (stage mismatch), returns `null`
        *   `[✅]` 103.c.v. Assert: Given recipe step with document input but no matching source document (document_key mismatch), returns `null`
        *   `[✅]` 103.c.vi. Assert: Given multiple document inputs with identical highest relevance, throws error with message indicating ambiguous selection
        *   `[✅]` 103.c.vii. Assert: Extracts `document_key` from source document filename using `deconstructStoragePath` for matching logic
        *   `[✅]` 103.c.viii. Assert: Matches source documents by both `stage` and extracted `document_key` from filename
    *   `[✅]` 103.d. [BE] Implement `selectAnchorForCanonicalPathParams` in `helpers.ts`
        *   `[✅]` 103.d.i. Extract document-type inputs from `recipeStep.inputs_required` array (filter for `type === 'document'`)
        *   `[✅]` 103.d.ii. If no document inputs found, return `null`
        *   `[✅]` 103.d.iii. Build relevance map from `recipeStep.inputs_relevance` array (map `document_key` to `relevance` number)
        *   `[✅]` 103.d.iv. If `inputs_relevance` is empty or undefined, return `null`
        *   `[✅]` 103.d.v. Find highest-relevance document input by iterating through document inputs and comparing relevance scores
        *   `[✅]` 103.d.vi. If multiple inputs have identical highest relevance, throw error with message listing tied document keys
        *   `[✅]` 103.d.vii. Extract `targetSlug` and `targetDocumentKey` from highest-relevance input rule
        *   `[✅]` 103.d.viii. Iterate through `sourceDocs` to find matching document
        *   `[✅]` 103.d.ix. For each source document, extract `document_key` from filename using `deconstructStoragePath({ storageDir: doc.storage_path, fileName: doc.file_name })`
        *   `[✅]` 103.d.x. Match source document where `doc.stage === targetSlug` AND extracted `document_key === targetDocumentKey`
        *   `[✅]` 103.d.xi. Return matched `SourceDocument` or `null` if no match found
    *   `[✅]` 103.e. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 103.e.i. Verify anchor selection works correctly for recipe steps with relevance metadata
        *   `[✅]` 103.e.ii. Verify returns `null` when no relevance metadata or no matching documents
        *   `[✅]` 103.e.iii. Verify error thrown for ambiguous relevance scores
        *   `[✅]` 103.e.iv. Verify document_key extraction from filename works correctly
    *   `[✅]` 103.f. [TEST-INT] Integration test with `planAllToOne` consumer
        *   `[✅]` 103.f.i. Assert: `planAllToOne` can call `selectAnchorForCanonicalPathParams` and receive anchor document for canonical path params
        *   `[✅]` 103.f.ii. Assert: When `selectAnchorForCanonicalPathParams` returns `null`, `planAllToOne` handles it correctly (passes `null` to `createCanonicalPathParams`)
    *   `[✅]` 103.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 103.g.i. Function selects highest-relevance document from `inputs_relevance` metadata
        *   `[✅]` 103.g.ii. Function extracts `document_key` from source document filenames for matching
        *   `[✅]` 103.g.iii. Function matches source documents by both `stage` and `document_key`
        *   `[✅]` 103.g.iv. Function returns `null` when no relevance metadata or no matching documents
        *   `[✅]` 103.g.v. Function throws error for ambiguous relevance scores (no silent fallback)
    *   `[✅]` 103.h. [COMMIT] `feat(dialectic): add selectAnchorForCanonicalPathParams helper for relevance-based anchor selection`

*   `[✅]` 104. **planAllToOne** Use `selectAnchorForCanonicalPathParams` for canonical path params when lineage anchor not required
    *   `[✅]` 104.a. [DEPS] Dependencies and signature
        *   `[✅]` 104.a.i. `planAllToOne(sourceDocs, parentJob, recipeStep, _authToken)` in `planAllToOne.ts` returns `DialecticExecuteJobPayload[]`
        *   `[✅]` 104.a.ii. Depends on: `selectAnchorForCanonicalPathParams` (step 103)
        *   `[✅]` 104.a.iii. Depends on: `selectAnchorSourceDocument` (existing, for lineage anchor selection)
        *   `[✅]` 104.a.iv. Depends on: `createCanonicalPathParams` (existing, for building canonical path params)
        *   `[✅]` 104.a.v. Must handle PLAN branch (lines 52-168) and EXECUTE branch (lines 171-303)
    *   `[✅]` 104.b. [TYPES] Verify existing types are sufficient
        *   `[✅]` 104.b.i. `DialecticRecipeStep` interface already includes `inputs_relevance` array
        *   `[✅]` 104.b.ii. `SelectAnchorResult` type already includes `status: 'no_anchor_required'` variant
        *   `[✅]` 104.b.iii. `SourceDocument` type already compatible with `selectAnchorForCanonicalPathParams` return type
    *   `[✅]` 104.c. [TEST-UNIT] Unit tests for `planAllToOne` PLAN branch canonical path params in `planAllToOne.test.ts`
        *   `[✅]` 104.c.i. Assert: Given PLAN job with `all_to_one`, `inputs_relevance` with business_case relevance 1.0, and thesis document with filename `gpt-4_0_business_case.md`, `canonicalPathParams.sourceAnchorModelSlug` equals `'gpt-4'` (extracted from filename)
        *   `[✅]` 104.c.ii. Assert: Given PLAN job with `all_to_one` and empty `inputs_relevance`, `canonicalPathParams.sourceAnchorModelSlug` is `undefined` (no anchor available)
        *   `[✅]` 104.c.iii. Assert: Given PLAN job with `all_to_one`, seed_prompt as first sourceDoc, and thesis documents with relevance scores, selects highest-relevance thesis document (not seed_prompt) for canonical path params
        *   `[✅]` 104.c.iv. Assert: Given PLAN job with `all_to_one` and multiple thesis documents with different relevance scores, selects document with highest relevance (1.0) for canonical path params
        *   `[✅]` 104.c.v. Assert: Given PLAN job with `all_to_one` and `inputs_relevance` but no matching source documents, `canonicalPathParams.sourceAnchorModelSlug` is `undefined`
    *   `[✅]` 104.d. [TEST-UNIT] Unit tests for `planAllToOne` EXECUTE branch canonical path params in `planAllToOne.test.ts`
        *   `[✅]` 104.d.i. Assert: Given EXECUTE job with document inputs and `inputs_relevance`, `canonicalPathParams.sourceAnchorModelSlug` is extracted from highest-relevance document filename
        *   `[✅]` 104.d.ii. Assert: Given EXECUTE job with `per_model` granularity (consolidation) and `inputs_relevance`, `canonicalPathParams.sourceAnchorModelSlug` is extracted from highest-relevance document filename
        *   `[✅]` 104.d.iii. Assert: Given EXECUTE job with empty `inputs_relevance`, `canonicalPathParams.sourceAnchorModelSlug` is `undefined`
    *   `[✅]` 104.e. [TEST-UNIT] Unit test for error handling when relevance metadata missing in `planAllToOne.test.ts`
        *   `[✅]` 104.e.i. Assert: Given PLAN job with `all_to_one`, document inputs in `inputs_required`, but empty `inputs_relevance` array, throws error (no silent fallback to ordering heuristic)
    *   `[✅]` 104.f. [BE] Update `planAllToOne` PLAN branch to use `selectAnchorForCanonicalPathParams`
        *   `[✅]` 104.f.i. After calling `selectAnchorSourceDocument` (line 125), check if `anchorResult.status === 'no_anchor_required'`
        *   `[✅]` 104.f.ii. When `anchorResult.status === 'no_anchor_required'` AND `recipeStep.inputs_relevance` exists and has entries, call `selectAnchorForCanonicalPathParams(recipeStep, sourceDocs)`
        *   `[✅]` 104.f.iii. Use returned anchor document (or `null`) as `anchorForCanonicalPathParams` for `createCanonicalPathParams` call (line 153)
        *   `[✅]` 104.f.iv. Preserve existing behavior: `document_relationships.source_group` still uses `anchorDocument.id` (first sourceDoc, line 34) for lineage
        *   `[✅]` 104.f.v. Preserve existing behavior: `sourceContributionId` still uses `anchorDocument.id` (line 149) for lineage tracking
    *   `[✅]` 104.g. [BE] Update `planAllToOne` EXECUTE branch to use `selectAnchorForCanonicalPathParams`
        *   `[✅]` 104.g.i. After calling `selectAnchorSourceDocument` (line 262), check if `anchorResult.status === 'no_anchor_required'`
        *   `[✅]` 104.g.ii. When `anchorResult.status === 'no_anchor_required'` AND `recipeStep.inputs_relevance` exists and has entries, call `selectAnchorForCanonicalPathParams(recipeStep, sourceDocs)`
        *   `[✅]` 104.g.iii. Use returned anchor document (or `null`) as `anchorForCanonicalPathParams` for `createCanonicalPathParams` call (line 289)
        *   `[✅]` 104.g.iv. Preserve existing behavior: `document_relationships.source_group` still uses `anchorDocument.id` (line 293) for lineage
        *   `[✅]` 104.g.v. Preserve existing behavior: `sourceContributionId` still uses `anchorDocument.id` (line 285) for lineage tracking
    *   `[✅]` 104.h. [BE] Add error handling for missing relevance metadata in `planAllToOne`
        *   `[✅]` 104.h.i. When `anchorResult.status === 'no_anchor_required'` AND document inputs exist in `inputs_required` BUT `inputs_relevance` is empty or undefined, throw error indicating missing relevance metadata
        *   `[✅]` 104.h.ii. Error message should indicate that recipe has document inputs but no relevance metadata (no fallback to ordering)
    *   `[✅]` 104.i. [TEST-UNIT] Rerun `planAllToOne.test.ts` and verify all tests pass
        *   `[✅]` 104.i.i. Verify "planAllToOne extracts sourceAnchorModelSlug from thesis document filename when creating HeaderContext for antithesis stage, not from seed_prompt" test passes (line 1110)
        *   `[✅]` 104.i.ii. Verify "planAllToOne PLAN branch uses relevance-selected anchor for canonical path params" test passes (line 1346)
        *   `[✅]` 104.i.iii. Verify "planAllToOne throws when recipe lacks relevance metadata" test passes (line 1766)
        *   `[✅]` 104.i.iv. Verify no regressions in existing `planAllToOne` behavior
    *   `[✅]` 104.j. [TEST-INT] Integration test with canonical path params
        *   `[✅]` 104.j.i. Assert: PLAN job with `all_to_one` creates EXECUTE job with `canonicalPathParams.sourceAnchorModelSlug` extracted from highest-relevance source document filename
        *   `[✅]` 104.j.ii. Assert: EXECUTE job with `per_model` creates job with `canonicalPathParams.sourceAnchorModelSlug` extracted from highest-relevance source document filename
        *   `[✅]` 104.j.iii. Assert: File paths generated using `canonicalPathParams` correctly include model slug from anchor document
    *   `[✅]` 104.k. [CRITERIA] Acceptance criteria
        *   `[✅]` 104.k.i. `planAllToOne` selects anchor document for canonical path params based on `inputs_relevance` even when lineage anchor is not required
        *   `[✅]` 104.k.ii. `sourceAnchorModelSlug` is extracted from highest-relevance document filename, not from seed_prompt or first document
        *   `[✅]` 104.k.iii. When `inputs_relevance` is empty but document inputs exist, function throws error (no silent fallback)
        *   `[✅]` 104.k.iv. Lineage tracking (`source_group`, `sourceContributionId`) remains unchanged and uses first sourceDoc or anchorDocument
        *   `[✅]` 104.k.v. Canonical path params anchor selection is independent of lineage anchor selection
    *   `[✅]` 104.l. [COMMIT] `fix(dialectic): planAllToOne selects anchor for canonical path params when lineage anchor not required`

*   `[ ]` 105. **processComplexJob** Schedule jobs with waiting_for_prerequisite for steps with missing intra-stage dependencies
    *   `[✅]` 105.a. [DEPS] Dependencies and signature
        *   `[✅]` 105.a.i. `processComplexJob(dbClient, job, projectOwnerUserId, ctx, authToken)` in `processComplexJob.ts` returns `Promise<void>`
        *   `[✅]` 105.a.ii. Uses existing `ctx.planComplexStage` function (no signature changes required)
        *   `[✅]` 105.a.iii. Must access `stepIdToStep` Map to find prerequisite-producing steps by matching `output_type` to missing `document_key`
        *   `[✅]` 105.a.iv. Must access `filteredReadySteps` to identify steps that will be planned in this batch
        *   `[✅]` 105.a.v. Must access `completedStepSlugs` Set to identify already-completed prerequisite steps
        *   `[✅]` 105.a.vi. Must call `ctx.findSourceDocuments` to verify prerequisite availability and catch errors for missing inputs
        *   `[✅]` 105.a.vii. Must find prerequisite-producing job ID from `childJobs` array (after planning) by matching `planner_metadata.recipe_step_id` to prerequisite step ID
    *   `[✅]` 105.b. [TYPES] Verify existing types support status and prerequisite_job_id
        *   `[✅]` 105.b.i. Confirm `DialecticJobRow` interface includes `status` field with `'waiting_for_prerequisite'` as valid value
        *   `[✅]` 105.b.ii. Confirm `DialecticJobRow` interface includes `prerequisite_job_id` field (UUID or null)
        *   `[✅]` 105.b.iii. Confirm `DialecticJobRow` objects can be modified after creation (mutable status and prerequisite_job_id fields)
    *   `[✅]` 105.c. [TEST-UNIT] Unit tests for prerequisite step identification and job modification
        *   `[✅]` 105.c.i. Assert: Given step with missing intra-stage dependency (e.g., `generate-master-plan` missing `technical_requirements`), identifies prerequisite-producing step in `stepIdToStep` where `output_type === 'technical_requirements'`
        *   `[✅]` 105.c.ii. Assert: Given a completed prerequisite step, throws an error if its output document is not found (fail loud)
        *   `[✅]` 105.c.iii. Assert: Given prerequisite step is in `filteredReadySteps`, verifies prerequisite will be planned in this batch and schedules job with `waiting_for_prerequisite` status
        *   `[✅]` 105.c.iv. Assert: Given step with missing intra-stage dependency but prerequisite step not found in recipe, throws error (cannot schedule safely)
        *   `[✅]` 105.c.v. Assert: After planning prerequisite step, finds prerequisite job ID from `childJobs` array by matching `planner_metadata.recipe_step_id` to prerequisite step ID
        *   `[✅]` 105.c.vi. Assert: Waiting jobs created by `planComplexStage` are modified to have `status: 'waiting_for_prerequisite'` and `prerequisite_job_id` set before insertion
        *   `[✅]` 105.c.vii. Assert: Steps with available inputs are still planned normally with `status: 'pending'`
    *   `[✅]` 105.d. [BE] Implement prerequisite step identification and job modification in processComplexJob
        *   `[✅]` 105.d.i. Create separate list `stepsWithPrerequisiteDeps` for steps with missing intra-stage dependencies that have verifiable prerequisites
        *   `[✅]` 105.d.ii. In catch block (line 398), extract missing `document_key` from error message or by identifying which input rule failed
        *   `[✅]` 105.d.iii. Search `stepIdToStep` Map to find prerequisite-producing step where `output_type === missing_document_key`
        *   `[✅]` 105.d.iv. Verify prerequisite step exists in recipe instance (throw error if not found - cannot schedule safely)
        *   `[✅]` 105.d.v. Verify prerequisite step is in `filteredReadySteps` (will be available)
        *   `[✅]` 105.d.vi. If verified, add step to `stepsWithPrerequisiteDeps` instead of filtering out completely
        *   `[✅]` 105.d.vii. After planning `stepsWithAvailableInputs` (line 431), get `childJobs` array from `plannedChildrenArrays.flat()`
        *   `[✅]` 105.d.viii. For each step in `stepsWithPrerequisiteDeps`, call `planComplexStage` to get waiting job objects
        *   `[✅]` 105.d.ix. For each waiting job, find prerequisite-producing job ID from `childJobs` array by matching `planner_metadata.recipe_step_id` to prerequisite step ID
        *   `[✅]` 105.d.x. Modify waiting job objects: set `status: 'waiting_for_prerequisite'` and `prerequisite_job_id: prerequisiteJobId`
        *   `[✅]` 105.d.xi. Add modified waiting jobs to `childJobs` array before insertion (line 467)
    *   `[✅]` 105.e. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 105.e.i. Verify steps with missing intra-stage deps are scheduled with `waiting_for_prerequisite` status (not filtered out)
        *   `[✅]` 105.e.ii. Verify waiting jobs have correct `status: 'waiting_for_prerequisite'` and `prerequisite_job_id` set before insertion
        *   `[✅]` 105.e.iii. Verify no regressions in existing `processComplexJob` behavior for steps with available inputs
    *   `[ ]` 105.f. [TEST-INT] Integration test with handle_job_completion transition
        *   `[ ]` 105.f.i. Assert: When prerequisite job completes, `handle_job_completion` transitions waiting job from `waiting_for_prerequisite` to `pending`
        *   `[ ]` 105.f.ii. Assert: Parenthesis stage with `generate-technical_requirements` completing triggers `generate-master-plan` job to transition from `waiting_for_prerequisite` to `pending`
        *   `[ ]` 105.f.iii. Assert: Parent PLAN job can complete properly once all child jobs (including waiting ones) are scheduled
    *   `[✅]` 105.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 105.g.i. Steps with missing intra-stage dependencies are scheduled with `waiting_for_prerequisite` status instead of being filtered out
        *   `[✅]` 105.g.ii. Jobs with `waiting_for_prerequisite` have `prerequisite_job_id` set to the prerequisite-producing job ID
        *   `[✅]` 105.g.iii. When prerequisite job completes, `handle_job_completion` automatically transitions waiting job to `pending`
        *   `[✅]` 105.g.iv. Parent PLAN job can complete properly once all child jobs (including waiting ones) are scheduled
        *   `[✅]` 105.g.v. No steps are permanently skipped due to intra-stage dependencies
        *   `[✅]` 105.g.vi. No function signature changes required - uses existing `planComplexStage` as-is
    *   `[✅]` 105.h. [COMMIT] `fix(dialectic): schedule jobs with waiting_for_prerequisite for intra-stage dependencies`

*   `[✅]` 106. **processComplexJob** Create skeleton PLAN jobs for steps with missing intra-stage prerequisites; handle deferred planning when skeleton returns
    *   `[✅]` 106.a. [DEPS] Dependencies and signature
        *   `[✅]` 106.a.i. `processComplexJob(dbClient, job, projectOwnerUserId, ctx, authToken)` in `processComplexJob.ts` returns `Promise<void>`
        *   `[✅]` 106.a.ii. Current bug: lines 535-542 call `ctx.planComplexStage` for steps in `stepsWithPrerequisiteDeps`, but `planComplexStage` calls `findSourceDocuments` which throws when prerequisite documents don't exist yet
        *   `[✅]` 106.a.iii. Fix: Create skeleton PLAN job with `waiting_for_prerequisite` status; when it returns after prereq completes, call `planComplexStage` then
        *   `[✅]` 106.a.iv. Skeleton jobs must include: `status: 'waiting_for_prerequisite'`, `prerequisite_job_id`, `job_type: 'PLAN'`, `planner_metadata.recipe_step_id`
        *   `[✅]` 106.a.v. Must inherit payload fields from parent job: `projectId`, `sessionId`, `stageSlug`, `iterationNumber`, `model_id`, `user_jwt`, `walletId`
        *   `[✅]` 106.a.vi. Detection: `job.prerequisite_job_id !== null` at start of `processComplexJob` indicates deferred single-step planning
    *   `[✅]` 106.b. [TEST-UNIT] Unit tests for skeleton PLAN job creation in `processComplexJob.intraStageDependency.test.ts`
        *   `[✅]` 106.b.i. Assert: `planComplexStage` is NOT called for steps in `stepsWithPrerequisiteDeps` during initial processing
        *   `[✅]` 106.b.ii. Assert: Skeleton PLAN job is created with `status: 'waiting_for_prerequisite'` and `job_type: 'PLAN'`
        *   `[✅]` 106.b.iii. Assert: Skeleton job has `prerequisite_job_id` set to the prerequisite-producing job ID
        *   `[✅]` 106.b.iv. Assert: Skeleton job has `planner_metadata.recipe_step_id` set to the step ID
        *   `[✅]` 106.b.v. Assert: Skeleton job inherits required payload fields from parent job
    *   `[✅]` 106.c. [TEST-UNIT] Unit tests for deferred planning when skeleton PLAN job returns
        *   `[✅]` 106.c.i. Assert: When `job.prerequisite_job_id !== null`, detects deferred single-step planning
        *   `[✅]` 106.c.ii. Assert: Fetches recipe step using `planner_metadata.recipe_step_id`
        *   `[✅]` 106.c.iii. Assert: Calls `findSourceDocuments` for the deferred step (now succeeds since prereq exists)
        *   `[✅]` 106.c.iv. Assert: Calls `planComplexStage` for the deferred step
        *   `[✅]` 106.c.v. Assert: Inserts resulting EXECUTE job(s) with `pending` status
    *   `[✅]` 106.d. [BE] Implement skeleton PLAN job creation in `processComplexJob.ts`
        *   `[✅]` 106.d.i. Remove `planComplexStage` call for steps in `stepsWithPrerequisiteDeps` (lines 535-542)
        *   `[✅]` 106.d.ii. Build skeleton PLAN job object with: `id: crypto.randomUUID()`, `status: 'waiting_for_prerequisite'`, `job_type: 'PLAN'`
        *   `[✅]` 106.d.iii. Set `prerequisite_job_id` to the ID of the prerequisite-producing job from `childJobs` array
        *   `[✅]` 106.d.iv. Set `payload.planner_metadata: { recipe_step_id: step.id }`
        *   `[✅]` 106.d.v. Inherit payload fields: `projectId`, `sessionId`, `stageSlug`, `iterationNumber`, `model_id`, `user_jwt`, `walletId`
        *   `[✅]` 106.d.vi. Add skeleton PLAN job to `childJobs` array before insertion
    *   `[✅]` 106.e. [BE] Implement deferred planning handler at start of `processComplexJob.ts`
        *   `[✅]` 106.e.i. Add early check: if `job.prerequisite_job_id !== null`, enter deferred planning block
        *   `[✅]` 106.e.ii. Fetch recipe step from database using `job.payload.planner_metadata.recipe_step_id`
        *   `[✅]` 106.e.iii. Call `findSourceDocuments` for the recipe step (prereq document now exists)
        *   `[✅]` 106.e.iv. Call `planComplexStage` for the recipe step to create EXECUTE job(s)
        *   `[✅]` 106.e.v. Insert resulting EXECUTE jobs with `pending` status
        *   `[✅]` 106.e.vi. Mark current skeleton PLAN job as `completed` and return early
    *   `[✅]` 106.f. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 106.f.i. Verify `planComplexStage` is not called for steps with missing prerequisites during initial processing
        *   `[✅]` 106.f.ii. Verify skeleton PLAN jobs have correct structure and payload
        *   `[✅]` 106.f.iii. Verify deferred planning handler correctly processes returned skeleton jobs
        *   `[✅]` 106.f.iv. Verify no regressions in existing `processComplexJob` behavior
    *   `[✅]` 106.g. [TEST-INT] Integration test with prerequisite completion flow
        *   `[✅]` 106.g.i. Assert: Skeleton PLAN job is inserted with `waiting_for_prerequisite` status
        *   `[✅]` 106.g.ii. Assert: When prerequisite EXECUTE job completes, skeleton PLAN job transitions to `pending`
        *   `[✅]` 106.g.iii. Assert: Skeleton PLAN job returns through `processComplexJob` and creates EXECUTE jobs
        *   `[✅]` 106.g.iv. Assert: Parenthesis stage completes with `generate-master-plan` executing after `generate-technical_requirements`
    *   `[✅]` 106.h. [CRITERIA] Acceptance criteria
        *   `[✅]` 106.h.i. `planComplexStage` is never called for steps with missing intra-stage prerequisites during initial processing
        *   `[✅]` 106.h.ii. Skeleton PLAN jobs are created with `waiting_for_prerequisite` status
        *   `[✅]` 106.h.iii. `prerequisite_job_id !== null` detection routes skeleton jobs to deferred planning handler
        *   `[✅]` 106.h.iv. Deferred planning calls `findSourceDocuments` and `planComplexStage` when prereq is complete
        *   `[✅]` 106.h.v. No `findSourceDocuments` errors for steps with missing prerequisites
        *   `[✅]` 106.h.vi. All changes contained within `processComplexJob.ts` - no changes to `processSimpleJob.ts`
    *   `[✅]` 106.i. [COMMIT] `fix(dialectic): processComplexJob creates skeleton PLAN jobs and handles deferred planning`

*   `[ ]` 107. **processComplexJob** Eliminate duplicate deferred planning by introducing a dedicated `DialecticSkeletonJobPayload` (required `step_info`, required `planner_metadata`) so skeleton PLAN jobs complete cleanly and Parenthesis produces exactly n×3 documents
    *   `[✅]` 107.a. [DEPS] Dependencies and target behavior
        *   `[✅]` 107.a.i. `processComplexJob(dbClient, job, projectOwnerUserId, ctx, authToken)` in `supabase/functions/dialectic-worker/processComplexJob.ts` creates skeleton PLAN jobs for missing intra-stage prerequisites, and later performs deferred planning when the skeleton returns.
        *   `[✅]` 107.a.ii. The DB trigger `handle_job_completion()` uses `payload.step_info.current_step` and `payload.step_info.total_steps` to decide whether a parent job becomes `completed` or wakes as `pending_next_step` (see `supabase/migrations/20260109165706_state_machine_fix.sql`).
        *   `[✅]` 107.a.iii. Target state: skeleton PLAN jobs are **single-step** (`step_info.current_step=1`, `step_info.total_steps=1`) so after their child jobs finish they can be marked `completed` instead of re-woken, preventing duplicate planning and storage collisions.
        *   `[✅]` 107.a.iv. Integration target: `supabase/integration_tests/services/dialectic_full_dag_traversal.integration.test.ts` step `99.b.vi` must observe **exactly** `n×3` Parenthesis planning documents (for `n=3`, exactly 9; not 21).
    *   `[✅]` 107.b. [TYPES] Add a dedicated skeleton payload type with required keys (no casts, no inline types)
        *   `[✅]` 107.b.i. In `supabase/functions/dialectic-service/dialectic.interface.ts`, introduce `DialecticSkeletonJobPayload` with required fields needed to construct a complete skeleton PLAN job payload, including:
        *   `[✅]` 107.b.ii Required job identity fields used by the worker: `projectId`, `sessionId`, `model_id`, `walletId`, `user_jwt`, `stageSlug`, `iterationNumber`.
        *   `[✅]` 107.b.iii Required skeleton-specific fields `planner_metadata` & `step_info`.
        *   `[✅]` 107.b.iv. Update the `DialecticJobPayload` union type in `dialectic.interface.ts` to include `DialecticSkeletonJobPayload` so it can be validated and carried through the system without casts.
        *   `[✅]` 107.b.v. Update `DialecticPlanJobPayload` in `dialectic.interface.ts` so `planner_metadata` is no longer present there (the skeleton payload owns it), and ensure any production usage sites that require `planner_metadata.recipe_step_id` are updated to depend on the correct payload type instead.
        *   `[✅]` 107.b.vi. [TYPE-GUARD-TEST] In `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.test.ts`, add tests proving:
            *   `[✅]` 107.b.vi.A `isDialecticSkeletonJobPayload` returns true only when `step_info` is present and `planner_metadata.recipe_step_id` is a non-empty string.
            *   `[✅]` 107.b.vi.B `isDialecticPlanJobPayload` rejects payloads that include `planner_metadata` (since it is no longer part of that payload type).
        *   `[✅]` 107.b.vii. [TYPE-GUARDS] In `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.ts`, implement `isDialecticSkeletonJobPayload` and update `isDialecticPlanJobPayload` to match the new contract.
    *   `[✅]` 107.c. [TEST-UNIT] Update unit test to assert the target skeleton payload contract
        *   `[✅]` 107.c.i. In `supabase/functions/dialectic-worker/processComplexJob.intraStageDependency.test.ts`, assert the inserted skeleton PLAN job payload satisfies `isDialecticSkeletonJobPayload`, and that `payload.step_info.current_step === 1` and `payload.step_info.total_steps === 1`.
    *   `[✅]` 107.d. [BE] Update skeleton PLAN job creation to use the new payload type (no casts)
        *   `[✅]` 107.d.i. In `supabase/functions/dialectic-worker/processComplexJob.ts`, construct `DialecticSkeletonJobPayload` using explicitly typed intermediates (e.g. a `DialecticStepInfo` object and `DialecticStepPlannerMetadataWithRecipeStepId` object).
        *   `[✅]` 107.d.ii. Ensure `stageSlug` and `iterationNumber` are set explicitly and reliably (prefer DB row columns; fail loudly if missing), so the skeleton payload is complete without optional defaults.
        *   `[✅]` 107.d.iii. Ensure `payload.step_info` is set to `{ current_step: 1, total_steps: 1 }` for every skeleton PLAN job.
        *   `[✅]` 107.d.iv. Ensure the worker’s payload validation accepts skeleton PLAN jobs and continues to validate non-skeleton PLAN jobs without weakening typing.
    *   `[✅]` 107.e. [TEST-UNIT] Rerun and expand tests proving the fix
        *   `[✅]` 107.e.i. Verify `processComplexJob.intraStageDependency.test.ts` passes and no other unit tests regress.
    *   `[ ]` 107.f. [TEST-INT] Prove Parenthesis no longer duplicates work
        *   `[ ]` 107.f.i. Run `supabase/integration_tests/services/dialectic_full_dag_traversal.integration.test.ts` and confirm step `99.b.vi` passes with exactly `n×3` Parenthesis documents (for `n=3`, exactly 9).
    *   `[ ]` 107.g. [CRITERIA] Acceptance criteria
        *   `[ ]` 107.g.i. Skeleton PLAN job payloads are strictly typed as `DialecticSkeletonJobPayload` and include required `step_info` and required `planner_metadata.recipe_step_id`.
        *   `[ ]` 107.g.ii. Parenthesis integration test step `99.b.vi` produces exactly the expected number of rendered Parenthesis documents (no duplicates).
        *   `[ ]` 107.g.iii. No casts (`as`/`any`) and no inline types introduced; all new types live in `dialectic.interface.ts` and are enforced by type guards.
    *   `[ ]` 107.h. [COMMIT] `fix(dialectic): make skeleton plan payload explicit to prevent duplicate deferred planning`

*   `[✅]` 108. **resolveNextBlocker** Create helper function to dynamically resolve the job that will produce a required artifact
    *   `[✅]` 108.a. [DEPS] Dependencies and signature
        *   `[✅]` 108.a.i. Code standards:
            *   `[✅]` 108.a.i.A Function signature MUST be `(deps, params)` with both objects explicitly typed
            *   `[✅]` 108.a.i.B All dependencies MUST be injected via `deps` (no direct imports for side-effectful collaborators)
            *   `[✅]` 108.a.i.C Return type MUST be explicitly annotated
        *   `[✅]` 108.a.ii. `resolveNextBlocker(deps: ResolveNextBlockerDeps, params: ResolveNextBlockerParams): Promise<ResolveNextBlockerResult | null>` in `supabase/functions/dialectic-worker/resolveNextBlocker.ts`
            *   `ResolveNextBlockerResult = { id: string; job_type: string; status: string }`
            *   `ResolveNextBlockerDeps` MUST include: `dbClient`, `logger` (and any recipe-step lookup dependency if needed for PLAN matching)
            *   `ResolveNextBlockerParams` MUST include: `projectId`, `sessionId`, `stageSlug`, `iterationNumber`, `modelSlug`, `requiredArtifactIdentity`
        *   `[✅]` 108.a.ii. Consumed by: `processComplexJob` deferred planning handler (step 109)
        *   `[✅]` 108.a.iii. Requires: Supabase client to query `dialectic_generation_jobs` table
        *   `[✅]` 108.a.iv. Required artifact identity MUST be *PathContext-inspired*, but it is NOT the same as `PathContext`.
            *   Rationale: `PathContext` is for constructing concrete storage paths and requires fields like `fileType` / `attemptCount` for documents, and it uses `modelSlug` (stable) rather than `modelId` (may change across sync runs).
            *   Define a separate `RequiredArtifactIdentity` that carries only what we reliably know at scheduling time (and what is stable/idempotent).
            *   Minimum required fields MUST include: `projectId`, `sessionId`, `stageSlug`, `iterationNumber`, `modelSlug`, `documentKey`.
            *   If additional disambiguation is needed (e.g. parallel lineage branches), add `branchKey`, `parallelGroup`, and/or `sourceGroupFragment` consistent with your path semantics.
            *   If you must persist it, persist as JSON (`results.required_artifact_identity`) — never a colon-delimited string.
        *   `[✅]` 108.a.v. Resolution priority: RENDER jobs > EXECUTE jobs > PLAN jobs (closer to artifact = higher priority)
        *   `[✅]` 108.a.vi. Scope MUST be model-safe and project-safe:
            *   Filter by `session_id`, `stage_slug`, `iteration_number`, AND stable model identity (`modelSlug` in payload/canonicalPathParams/pathContext) so Model A never blocks Model B.
            *   If existing job queries elsewhere are scoped to `project_id`, this helper MUST be too (prefer DB column; otherwise filter by `payload.projectId`).
        *   `[✅]` 108.a.vii. Matching logic MUST align to real payload contracts (no generic heuristics):
            *   RENDER: match the artifact/documentKey the render job will publish (prefer a dedicated render payload field; otherwise derive from canonical path params / render metadata used by your renderer).
            *   EXECUTE: match `payload.output_type` (preferred) or `payload.canonicalPathParams.contributionType` (fallback) against `documentKey`.
            *   PLAN: match `payload.planner_metadata.recipe_step_id` → recipe step `output_type === documentKey`.
    *   `[✅]` 108.b. [TYPES] Verify existing types are sufficient
        *   `[✅]` 108.b.i. Confirm `DialecticJobRow` interface in `dialectic.interface.ts` includes `id`, `job_type`, `status`, `payload` fields for querying
        *   `[✅]` 108.b.ii. Introduce explicit types local to the worker module (no inline types in call sites):
            *   `ResolveNextBlockerDeps`
            *   `ResolveNextBlockerParams`
            *   `ResolveNextBlockerResult`
            *   `RequiredArtifactIdentity` (PathContext-inspired; includes stable `modelSlug`)
    *   `[✅]` 108.c. [TEST-UNIT] Unit tests for `resolveNextBlocker` in `supabase/functions/dialectic-worker/resolveNextBlocker.test.ts`
        *   `[✅]` 108.c.i. Assert: Given pending RENDER job for model C producing `master_plan` and `requiredArtifactKey` scoped to model C, returns that RENDER job (and never returns model A/B jobs)
        *   `[✅]` 108.c.ii. Assert: Given pending EXECUTE job (no RENDER) for model C producing `master_plan`, returns that EXECUTE job
        *   `[✅]` 108.c.iii. Assert: Given pending PLAN job (no EXECUTE, no RENDER) with recipe step producing `master_plan`, returns that PLAN job
        *   `[✅]` 108.c.iv. Assert: Given both pending RENDER and EXECUTE jobs for same artifact, returns RENDER job (higher priority)
        *   `[✅]` 108.c.v. Assert: Given completed RENDER job (not in-progress), does NOT return it; continues to check EXECUTE/PLAN
        *   `[✅]` 108.c.vi. Assert: Given no jobs producing the required artifact, returns `null`
        *   `[✅]` 108.c.vii. Assert: Given `requiredArtifactKey === null` or empty string, returns `null` without querying
        *   `[✅]` 108.c.viii. Assert: Correctly parses `"{projectId}:{sessionId}:{stageSlug}:{iterationNumber}:{modelId}:{artifactClass}:{documentKey}"` to extract all fields for scoping + matching
        *   `[✅]` 108.c.ix. Assert: Jobs with `status` in `['pending', 'processing', 'retrying', 'waiting_for_children', 'waiting_for_prerequisite']` are considered in-progress blockers
    *   `[✅]` 108.d. [BE] Implement `resolveNextBlocker` in `supabase/functions/dialectic-worker/resolveNextBlocker.ts`
        *   `[✅]` 108.d.i. Accept a typed `requiredArtifactIdentity` object (PathContext-shaped) and avoid string parsing
        *   `[✅]` 108.d.ii. Return `null` early if identity is missing required fields (project/session/stage/iteration/modelSlug/documentKey)
        *   `[✅]` 108.d.iii. Define `inProgressStatuses` array: `['pending', 'processing', 'retrying', 'waiting_for_children', 'waiting_for_prerequisite']`
        *   `[✅]` 108.d.iv. Query RENDER jobs: `SELECT id, job_type, status, payload FROM dialectic_generation_jobs WHERE session_id = ? AND stage_slug = ? AND iteration_number = ? AND job_type = 'RENDER' AND status IN (inProgressStatuses)` (and ALSO scope to `project_id` if available). Filter results by `modelSlug` from payload.
        *   `[✅]` 108.d.v. Filter RENDER results by `payloadProducesDocumentKey(payload, documentKey)`; if match found, return it
        *   `[✅]` 108.d.vi. Query EXECUTE jobs: same WHERE clause but `job_type = 'EXECUTE'`
        *   `[✅]` 108.d.vii. Filter EXECUTE results by `payloadProducesDocumentKey(payload, documentKey)`; if match found, return it
        *   `[✅]` 108.d.viii. Query PLAN jobs: same WHERE clause but `job_type = 'PLAN'`
        *   `[✅]` 108.d.ix. Filter PLAN results by `payloadProducesDocumentKey(payload, documentKey)` (check `planner_metadata.recipe_step_id` maps to step with `output_type === documentKey`); if match found, return it
        *   `[✅]` 108.d.x. If no matches at any level, return `null`
        *   `[✅]` 108.d.xi. Implement helper `jobProducesDocumentKey(job, documentKey, artifactClass)` with job_type-specific matching:
            *   RENDER: match what the render job will write (MUST align to renderer payload contract)
            *   EXECUTE: match `payload.output_type` (preferred), fallback to `payload.canonicalPathParams?.contributionType`
            *   PLAN: match `payload.planner_metadata.recipe_step_id` → recipe step `output_type`
    *   `[✅]` 108.e. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 108.e.i. Verify RENDER > EXECUTE > PLAN priority ordering
        *   `[✅]` 108.e.ii. Verify in-progress status filtering works correctly
        *   `[✅]` 108.e.iii. Verify artifact key parsing handles edge cases
    *   `[✅]` 108.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 108.f.i. Function returns the job closest to producing the required artifact (RENDER preferred over EXECUTE preferred over PLAN)
        *   `[✅]` 108.f.ii. Function only returns jobs that are in-progress (not completed or failed)
        *   `[✅]` 108.f.iii. Function uses PathContext-inspired identity (stable `modelSlug`) and enforces model-safe + project-safe scoping
        *   `[✅]` 108.f.iv. Function returns `null` when no producing job exists
        *   `[✅]` 108.f.v. Function is pure DB query + filter logic; no side effects
    *   `[✅]` 108.g. [COMMIT] `feat(dialectic): add resolveNextBlocker helper for artifact-driven prerequisite resolution`

*   `[✅]` 109. **processComplexJob** Implement artifact-driven prerequisite resolution with idempotent re-wait logic
    *   `[✅]` 109.a. [DEPS] Dependencies and signature
        *   `[✅]` 109.a.i. `processComplexJob(dbClient, job, projectOwnerUserId, ctx, authToken)` in `supabase/functions/dialectic-worker/processComplexJob.ts` already exists
        *   `[✅]` 109.a.ii. Depends on: `resolveNextBlocker` (step 108) for dynamic blocker resolution
        *   `[✅]` 109.a.iii. Uses existing `results` JSONB column to store a PathContext-shaped `required_artifact_identity` on skeleton jobs (no schema change required)
        *   `[✅]` 109.a.iv. Skeleton job creation (lines 716-766) must store `required_artifact_identity` in `results` field (typed object, not a string)
        *   `[✅]` 109.a.v. Deferred planning handler (lines 170-261) must read `required_artifact_identity` from `job.results` and use `resolveNextBlocker` to find next blocker
        *   `[✅]` 109.a.vi. Current hack at lines 191-215 (check for pending RENDER child) is replaced by general `resolveNextBlocker` call
    *   `[✅]` 109.b. [TYPES] No new types required
        *   `[✅]` 109.b.i. `results` column is `Json | null` which accepts `{ required_artifact_identity: RequiredArtifactIdentity }`
        *   `[✅]` 109.b.ii. `isRecord` type guard from `type_guards.ts` can validate `job.results` shape; add/extend a guard if needed for `RequiredArtifactIdentity`
    *   `[✅]` 109.c. [TEST-UNIT] Unit tests for skeleton job creation storing `required_artifact_key` in `supabase/functions/dialectic-worker/processComplexJob.intraStageDependency.test.ts`
        *   `[✅]` 109.c.i. Assert: Skeleton PLAN job `results` field contains `{ required_artifact_identity: { ... } }` with PathContext-shaped identity
        *   `[✅]` 109.c.ii. Assert: `required_artifact_identity` includes `projectId`, `sessionId`, `stageSlug`, `iterationNumber`, `modelSlug`, and `documentKey` for the missing input
        *   `[✅]` 109.c.iii. Assert: Skeleton job still has `prerequisite_job_id` set to current best-guess job (backward compatible)
    *   `[✅]` 109.d. [TEST-UNIT] Unit tests for deferred planning idempotent re-wait behavior in `supabase/functions/dialectic-worker/processComplexJob.intraStageDependency.test.ts`
        *   `[✅]` 109.d.i. Assert: When skeleton job wakes and `findSourceDocuments` succeeds, proceeds to plan (existing behavior preserved)
        *   `[✅]` 109.d.ii. Assert: When skeleton job wakes and `findSourceDocuments` throws, calls `resolveNextBlocker` with `job.results.required_artifact_identity`
        *   `[✅]` 109.d.iii. Assert: When `resolveNextBlocker` returns a different job ID than `job.prerequisite_job_id`, updates job to `waiting_for_prerequisite` with new `prerequisite_job_id` and returns early
        *   `[✅]` 109.d.iv. Assert: When `resolveNextBlocker` returns `null`, throws the original `findSourceDocuments` error (real error condition)
        *   `[✅]` 109.d.v. Assert: When `resolveNextBlocker` returns the same job ID as current `prerequisite_job_id`, throws the original error (already waiting on correct job, still not ready)
        *   `[✅]` 109.d.vi. Assert: Re-chaining logs informative message: `"Re-chaining job {id} to wait for {nextBlocker.id} (type: {nextBlocker.job_type})"`
    *   `[✅]` 109.e. [BE] Update skeleton PLAN job creation in `processComplexJob.ts` (lines 716-766)
        *   `[✅]` 109.e.i. After line 760 where `skeletonPlanJob` is constructed, set `results: { required_artifact_identity: <PathContext-shaped identity> }`
        *   `[✅]` 109.e.ii. Ensure `missingDocumentKey` variable (from line 520-534) is in scope for skeleton creation block
        *   `[✅]` 109.e.iii. Verify `results` field passes `isJson` check (line 739)
    *   `[✅]` 109.f. [BE] Update deferred planning handler in `processComplexJob.ts` (lines 170-261) to use artifact-driven resolution
        *   `[✅]` 109.f.i. Remove lines 191-215 (the current RENDER-checking hack)
        *   `[✅]` 109.f.ii. After fetching recipe step (line 186), extract `requiredArtifactIdentity` from `job.results` (PathContext-shaped object); validate shape before use
        *   `[✅]` 109.f.iii. Wrap `findSourceDocuments` call (lines 217-222) in try/catch block
        *   `[✅]` 109.f.iv. In catch block: call `const nextBlocker = await resolveNextBlocker(deps, { projectId, sessionId, stageSlug, iterationNumber, modelSlug, requiredArtifactIdentity });`
        *   `[✅]` 109.f.v. If `nextBlocker !== null && nextBlocker.id !== job.prerequisite_job_id`: log re-chain message, update job to `waiting_for_prerequisite` with `prerequisite_job_id: nextBlocker.id`, return early
        *   `[✅]` 109.f.vi. Otherwise (nextBlocker is null or same as current): re-throw the original `findSourceDocuments` error
        *   `[✅]` 109.f.vii. Add import for `resolveNextBlocker` at top of file
    *   `[✅]` 109.g. [TEST-UNIT] Rerun and verify all unit tests pass
        *   `[✅]` 109.g.i. Verify skeleton job creation stores `required_artifact_key`
        *   `[✅]` 109.g.ii. Verify deferred planning handler correctly re-chains when artifact not ready
        *   `[✅]` 109.g.iii. Verify no regressions in existing `processComplexJob` behavior
    *   `[✅]` 109.h. [TEST-INT] Integration test proving artifact-driven resolution works across multiple wake cycles
        *   `[✅]` 109.h.i. Assert: Skeleton job waiting on PLAN job, PLAN completes, skeleton wakes, artifact still not ready (EXECUTE running), skeleton re-chains to EXECUTE job
        *   `[✅]` 109.h.ii. Assert: Skeleton re-chains from EXECUTE to RENDER when EXECUTE completes but RENDER is pending
        *   `[✅]` 109.h.iii. Assert: After RENDER completes, skeleton wakes and successfully proceeds to plan
        *   `[✅]` 109.h.iv. Assert: Parenthesis stage with `generate-milestone-schema` waiting on `master_plan` artifact successfully completes after RENDER job finishes
        *   `[✅]` 109.h.v. Add test to `supabase/integration_tests/services/handle_job_completion.integration.test.ts` or create new `artifact_driven_prereq.integration.test.ts`
    *   `[✅]` 109.i. [CRITERIA] Acceptance criteria
        *   `[✅]` 109.i.i. Skeleton jobs store `required_artifact_key` in `results` column (no schema migration required)
        *   `[✅]` 109.i.ii. Deferred planning handler never throws `findSourceDocuments` error when artifact is simply not ready yet
        *   `[✅]` 109.i.iii. Jobs correctly re-chain through PLAN → EXECUTE → RENDER until artifact exists
        *   `[✅]` 109.i.iv. Waking is idempotent: same job can wake multiple times and re-wait without error
        *   `[✅]` 109.i.v. Arbitrary-length dependency chains work without special-casing (supports N levels deep)
        *   `[✅]` 109.i.vi. When artifact truly cannot be produced (no producing job exists), original error is thrown
        *   `[✅]` 109.i.vii. Backward compatible: existing `prerequisite_job_id` field still used, just dynamically updated
    *   `[✅]` 109.j. [COMMIT] `fix(dialectic): implement artifact-driven prerequisite resolution with idempotent re-wait`