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

*   `[ ]` 99. **Integration Test: Full DAG Traversal** Verify all five stages complete successfully
    *   `[✅]` 99.a. [DEPS] Dependencies
        *   `[✅]` 99.a.i. Depends on: All planner fixes (steps 94-96)
        *   `[✅]` 99.a.ii. Depends on: Migration fixes (steps 97-98)
        *   `[✅]` 99.a.iii. Requires: Test harness that can execute full dialectic session
    *   `[ ]` 99.b. [TEST-INT] Integration tests for complete DAG traversal
        *   `[✅]` 99.b.i. Assert: Thesis stage produces n×4 documents with correct header_context matching
        *   `[✅]` 99.b.ii. Assert: Antithesis stage produces n²×6 critique documents
        *   `[✅]` 99.b.iii. Assert: Synthesis pairwise step produces n³×4 pairwise documents
        *   `[✅]` 99.b.iv. Assert: Synthesis consolidation produces n×4 consolidated documents with new lineage
        *   `[✅]` 99.b.v. Assert: Synthesis final produces n×3 deliverables
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

*   `[✅]` 105. **path_constructor.ts** Add diagnostic logging for path construction to investigate collisions
    *   `[✅]` 105.a. [DEPS] Dependencies and signature
        *   `[✅]` 105.a.i. `constructStoragePath` in `path_constructor.ts` receives `PathContext` with `sourceGroupFragment`
        *   `[✅]` 105.a.ii. Function constructs filename pattern: `${modelSlug}_${attemptCount}_${documentKey}${fragmentSegment}_assembled.json`
        *   `[✅]` 105.a.iii. `fragmentSegment` is derived from `sourceGroupFragment` (first 8 chars of `source_group` UUID)
        *   `[✅]` 105.a.iv. Logging must capture all path components to identify collision root cause
    *   `[✅]` 105.b. [TYPES] Verify existing types are sufficient
        *   `[✅]` 105.b.i. `PathContext` interface includes `sourceGroupFragment?: string`
        *   `[✅]` 105.b.ii. `ConstructedPath` interface includes `fileName: string`
        *   `[✅]` 105.b.iii. No type changes required for diagnostic logging
    *   `[✅]` 105.c. [TEST-UNIT] Unit tests for diagnostic logging behavior
        *   `[✅]` 105.c.i. Assert: Logs all path components: modelSlug, attemptCount, documentKey, sourceGroupFragment, final fileName for `assembled_document_json`
        *   `[✅]` 105.c.ii. Assert: Logs when `sourceGroupFragment` is missing vs present for document file types
        *   `[✅]` 105.c.iii. Assert: Logs extraction of `sourceGroupFragment` from `source_group` UUID (first 8 chars after sanitization)
        *   `[✅]` 105.c.iv. Assert: Logs collision risk: when same path components would produce identical filename
    *   `[✅]` 105.d. [BE] Add diagnostic logging to `constructStoragePath` for `assembled_document_json`
        *   `[✅]` 105.d.i. Log all path components: modelSlug, attemptCount, documentKey, sourceGroupFragment, final fileName
        *   `[✅]` 105.d.ii. Log when `sourceGroupFragment` is missing vs present for document file types
        *   `[✅]` 105.d.iii. Log extraction of `sourceGroupFragment` from `source_group` UUID (first 8 chars after sanitization)
        *   `[✅]` 105.d.iv. Log collision risk: when same path components would produce identical filename
    *   `[✅]` 105.e. [TEST-UNIT] Rerun and verify path construction logging
        *   `[✅]` 105.e.i. Verify logs show all path components for each constructed path
        *   `[✅]` 105.e.ii. Verify logs identify when `sourceGroupFragment` is missing
        *   `[✅]` 105.e.iii. Verify logs show extraction logic for `sourceGroupFragment`
    *   `[✅]` 105.f. [TEST-INT] Integration test to trace path construction through synthesis pairwise step
        *   `[✅]` 105.f.i. Run synthesis pairwise step and capture all path construction logs
        *   `[✅]` 105.f.ii. Group constructed paths by filename to identify collisions
        *   `[✅]` 105.f.iii. For each collision, compare path components to identify which component(s) are identical
        *   `[✅]` 105.f.iv. Map collisions back to `source_group` values to confirm collision root cause
    *   `[✅]` 105.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 105.g.i. Diagnostic logs reveal all path components for every constructed path
        *   `[✅]` 105.g.ii. Diagnostic logs identify which path components are identical in collisions
        *   `[✅]` 105.g.iii. Diagnostic logs confirm whether `sourceGroupFragment` uniqueness is sufficient for path uniqueness
        *   `[✅]` 105.g.iv. Investigation provides sufficient data to design fix for path collision handling
    *   `[✅]` 105.h. [COMMIT] `feat(dialectic): add diagnostic logging to path construction for collision investigation`

*   `[ ]` 106. **planPairwiseByOrigin.ts** Add diagnostic logging and fix source_group assignment to ensure uniqueness and presence
    *   `[ ]` 106.a. [DEPS] Dependencies and signature
        *   `[ ]` 106.a.i. `planPairwiseByOrigin` in `planPairwiseByOrigin.ts` receives `sourceDocs`, `parentJob`, `recipeStep`
        *   `[ ]` 106.a.ii. Function creates jobs with `document_relationships.source_group` set from source document groups
        *   `[ ]` 106.a.iii. Must trace how `source_group` is determined for each pairwise document job
        *   `[ ]` 106.a.iv. Must ensure each unique (model, pair) combination gets distinct `source_group` UUID
        *   `[ ]` 106.a.v. Must ensure all pairwise jobs have non-null `source_group` (no missing assignments)
    *   `[ ]` 106.b. [TYPES] Verify types support unique source_group assignment
        *   `[ ]` 106.b.i. `DialecticExecuteJobPayload.document_relationships.source_group` accepts UUID string
        *   `[ ]` 106.b.ii. May need to add helper to generate unique `source_group` UUIDs per job
        *   `[ ]` 106.b.iii. [TYPE-GUARD-TEST] Update tests if new helper functions added
        *   `[ ]` 106.b.iv. [TYPE-GUARDS] Update guards if payload structure changes
    *   `[ ]` 106.c. [TEST-UNIT] Unit tests for diagnostic logging and unique source_group assignment
        *   `[ ]` 106.c.i. Assert: Logs source document grouping logic: how documents are grouped into pairs
        *   `[ ]` 106.c.ii. Assert: Logs `source_group` assignment for each created job: which source document(s) determine the `source_group`
        *   `[ ]` 106.c.iii. Assert: Logs job creation details: model ID, document_key, source document IDs, assigned `source_group` UUID
        *   `[ ]` 106.c.iv. Assert: Given n² antithesis documents (n models × n proposals), creates n³ pairwise jobs (n models × n² pairs)
        *   `[ ]` 106.c.v. Assert: Each pairwise job has unique `source_group` value (no collisions)
        *   `[ ]` 106.c.vi. Assert: Each (model, pair) combination gets distinct `source_group` UUID
        *   `[ ]` 106.c.vii. Assert: All pairwise jobs have non-null `source_group` (no missing assignments)
    *   `[ ]` 106.d. [BE] Add diagnostic logging to `planPairwiseByOrigin`
        *   `[ ]` 106.d.i. Log source document grouping logic: how documents are grouped into pairs
        *   `[ ]` 106.d.ii. Log `source_group` assignment for each created job: which source document(s) determine the `source_group`
        *   `[ ]` 106.d.iii. Log job creation details: model ID, document_key, source document IDs, assigned `source_group` UUID
        *   `[ ]` 106.d.iv. Log when `source_group` is set to `null` vs a UUID value, and the reasoning
    *   `[ ]` 106.e. [BE] Fix source_group assignment logic in `planPairwiseByOrigin`
        *   `[ ]` 106.e.i. Revise `source_group` assignment to ensure uniqueness per (model, pair) combination based on investigation findings
        *   `[ ]` 106.e.ii. Generate new UUID for each pairwise job's `source_group` if current logic produces collisions
        *   `[ ]` 106.e.iii. Preserve lineage tracking: ensure `source_group` correctly identifies source document group
        *   `[ ]` 106.e.iv. Ensure all pairwise jobs have non-null `source_group` (fix missing `source_group` validation errors)
    *   `[ ]` 106.f. [TEST-UNIT] Rerun and verify source_group uniqueness and presence
        *   `[ ]` 106.f.i. Verify logs show how each pairwise job gets its `source_group`
        *   `[ ]` 106.f.ii. Verify all pairwise jobs have unique `source_group` values
        *   `[ ]` 106.f.iii. Verify no missing `source_group` assignments
        *   `[ ]` 106.f.iv. Verify lineage tracking still works correctly
    *   `[ ]` 106.g. [TEST-INT] Integration test to verify fix
        *   `[ ]` 106.g.i. Run synthesis pairwise step and capture planner logs
        *   `[ ]` 106.g.ii. Assert: Synthesis pairwise step produces 108 documents with 108 unique paths (no collisions)
        *   `[ ]` 106.g.iii. Assert: All pairwise jobs have `source_group` assigned (no validation errors)
        *   `[ ]` 106.g.iv. Assert: Path construction produces unique filenames for all 108 documents
        *   `[ ]` 106.g.v. Assert: Integration test `99.b.iii` passes (n³×4 pairwise documents created successfully)
    *   `[ ]` 106.h. [CRITERIA] Acceptance criteria
        *   `[ ]` 106.h.i. Diagnostic logs reveal how `source_group` is assigned for pairwise synthesis jobs
        *   `[ ]` 106.h.ii. Each pairwise synthesis job has unique `source_group` UUID
        *   `[ ]` 106.h.iii. No pairwise jobs have missing `source_group` (validation errors resolved)
        *   `[ ]` 106.h.iv. Path construction produces unique filenames for all pairwise documents
        *   `[ ]` 106.h.v. Lineage tracking remains correct (source_group identifies source document group)
    *   `[ ]` 106.i. [COMMIT] `fix(dialectic): ensure unique source_group assignment for pairwise synthesis documents`

---

*   `[ ]` 107. **executeModelCallAndSave.ts** Add diagnostic logging and improve path collision handling and source_group validation
    *   `[ ]` 107.a. [DEPS] Dependencies and signature
        *   `[ ]` 107.a.i. `executeModelCallAndSave` in `executeModelCallAndSave.ts` receives `job` parameter with `payload.document_relationships`
        *   `[ ]` 107.a.ii. Function calls `constructStoragePath` with `sourceGroupFragment` extracted from `job.payload.document_relationships?.source_group`
        *   `[ ]` 107.a.iii. Function handles storage upload failures with collision detection
        *   `[ ]` 107.a.iv. Depends on: Fix from step 106 ensuring `source_group` is always present and unique
    *   `[ ]` 107.b. [TYPES] Verify types support improved error handling
        *   `[ ]` 107.b.i. `DialecticJobRow.payload.document_relationships.source_group` type supports UUID string
        *   `[ ]` 107.b.ii. May need error types for collision reporting
        *   `[ ]` 107.b.iii. [TYPE-GUARD-TEST] Update tests if error types added
        *   `[ ]` 107.b.iv. [TYPE-GUARDS] Update guards if error handling types change
    *   `[ ]` 107.c. [TEST-UNIT] Unit tests for diagnostic logging and improved collision handling
        *   `[ ]` 107.c.i. Assert: When `source_group` is present, log includes `source_group` UUID, extracted `sourceGroupFragment`, and constructed path
        *   `[ ]` 107.c.ii. Assert: When `source_group` is missing for document outputs, log includes error context (job ID, model ID, document_key, output_type)
        *   `[ ]` 107.c.iii. Assert: When storage upload fails with 409 collision, log includes existing file metadata (if queryable) and new file's `source_group` for comparison
        *   `[ ]` 107.c.iv. Assert: Error message includes both `source_group` values for comparison when collision occurs
        *   `[ ]` 107.c.v. Assert: Error message includes full job context when `source_group` is missing
    *   `[ ]` 107.d. [BE] Add diagnostic logging to `executeModelCallAndSave`
        *   `[ ]` 107.d.i. Log `source_group` value when extracting `sourceGroupFragment` (line ~1248), including job ID, model ID, document_key
        *   `[ ]` 107.d.ii. Log extracted `sourceGroupFragment` value and constructed path before upload attempt
        *   `[ ]` 107.d.iii. When `source_group` is missing for document outputs, log full job context (job ID, payload structure, output_type, document_key)
        *   `[ ]` 107.d.iv. When storage upload fails with 409 collision, log collision details: existing path (if queryable), new path, both `source_group` values for comparison
        *   `[ ]` 107.d.v. Log constructed path components (modelSlug, attemptCount, documentKey, sourceGroupFragment) separately for debugging
    *   `[ ]` 107.e. [BE] Improve collision handling and validation in `executeModelCallAndSave`
        *   `[ ]` 107.e.i. Enhance 409 collision error message to include existing file's `source_group` (if queryable) and new file's `source_group` for comparison
        *   `[ ]` 107.e.ii. Enhance missing `source_group` validation error to include full job context (job ID, model ID, document_key, output_type, payload structure)
        *   `[ ]` 107.e.iii. After step 106 fix, verify no jobs reach missing `source_group` validation (should be caught earlier in planner)
        *   `[ ]` 107.e.iv. Consider adding pre-upload path existence check if collisions persist after step 106 fix
    *   `[ ]` 107.f. [TEST-UNIT] Rerun and verify diagnostic logging and improved error handling
        *   `[ ]` 107.f.i. Verify logs capture `source_group` assignment for all document outputs
        *   `[ ]` 107.f.ii. Verify logs capture collision details when 409 errors occur
        *   `[ ]` 107.f.iii. Verify logs capture missing `source_group` context for validation errors
        *   `[ ]` 107.f.iv. Verify collision errors include diagnostic information
        *   `[ ]` 107.f.v. Verify validation errors include full context
    *   `[ ]` 107.g. [TEST-INT] Integration test to verify end-to-end fix
        *   `[ ]` 107.g.i. Run synthesis pairwise step and capture logs showing `source_group` values for all 108 expected documents
        *   `[ ]` 107.g.ii. Assert: Synthesis pairwise step completes without path collisions (all 108 documents upload successfully)
        *   `[ ]` 107.g.iii. Assert: No jobs fail with missing `source_group` validation error
        *   `[ ]` 107.g.iv. Assert: Integration test `99.b.iii` passes (n³×4 pairwise documents created successfully)
    *   `[ ]` 107.h. [CRITERIA] Acceptance criteria
        *   `[ ]` 107.h.i. Diagnostic logs capture `source_group` assignment for every document output job
        *   `[ ]` 107.h.ii. Diagnostic logs capture full path construction details (all components)
        *   `[ ]` 107.h.iii. Path collisions are resolved (all 108 pairwise documents have unique paths)
        *   `[ ]` 107.h.iv. Missing `source_group` validation errors are resolved (all jobs have `source_group` assigned)
        *   `[ ]` 107.h.v. Error messages provide sufficient diagnostic information if issues persist
    *   `[ ]` 107.i. [COMMIT] `fix(dialectic): improve path collision handling and source_group validation errors`

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
| 101 | `executeModelCallAndSave.ts` | Document key extraction for assembled_document_json |
| 102 | `assembleTurnPrompt.ts` | DI violations and dependency injection |
| 103 | `helpers.ts` (`selectAnchorForCanonicalPathParams`) | Relevance-based anchor selection |
| 104 | `planAllToOne.ts` | Canonical path params anchor selection |
| 105 | `path_constructor.ts` | Diagnostic logging for path construction |
| 106 | `planPairwiseByOrigin.ts` | Diagnostic logging and fix source_group assignment |
| 107 | `executeModelCallAndSave.ts` | Diagnostic logging and improve collision handling |
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
    ↓
105 (path_constructor logging)
    ↓
106 (planPairwiseByOrigin fix)
    ↓
107 (executeModelCallAndSave fix)
```

