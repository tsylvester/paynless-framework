// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts
import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import type { DialecticJobRow, DialecticPlanJobPayload, DialecticRecipeStep, SourceDocument } from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceDocumentByLineage } from './planPerSourceDocumentByLineage.ts';

Deno.test('planPerSourceDocumentByLineage', async (t) => {

    // --- Mocks Setup ---
    const getMockSourceDoc = (modelId: string | null, docId: string, sourceGroup: string | null = null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'pairwise_synthesis_chunk',
        model_id: modelId,
        model_name: `model-${modelId}-name`,
        content: `content for ${docId}`,
        user_id: 'user-id',
        stage: 'synthesis',
        iteration_number: 1,
        prompt_template_id_used: 'prompt-a',
        seed_prompt_url: null,
        edit_version: 1,
        is_latest_edit: true,
        original_model_contribution_id: null,
        raw_response_storage_path: null,
        target_contribution_id: null,
        tokens_used_input: 10,
        tokens_used_output: 10,
        processing_time_ms: 100,
        error: null,
        citations: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        file_name: `file-${docId}`,
        storage_bucket: 'bucket',
        storage_path: `path-${docId}`,
        size_bytes: 100,
        mime_type: 'text/plain',
        document_relationships: sourceGroup ? { source_group: sourceGroup } : null,
    });

    const getMockParentJob = (): DialecticJobRow & { payload: DialecticPlanJobPayload } => ({
        id: 'parent-job-id',
        created_at: new Date().toISOString(),
        status: 'in_progress',
        user_id: 'user-id',
        session_id: 'sess-id',
        iteration_number: 1,
        parent_job_id: null,
        attempt_count: 1,
        max_retries: 3,
        completed_at: null,
        error_details: null,
        prerequisite_job_id: null,
        results: null,
        stage_slug: 'synthesis',
        started_at: new Date().toISOString(),
        target_contribution_id: null,
        payload: {
            projectId: 'proj-id',
            sessionId: 'sess-id',
            stageSlug: 'synthesis', // Add the missing stageSlug
            job_type: 'plan',
            model_id: 'model-a-id',
            step_info: {
                current_step: 1,
                total_steps: 3,
            }
        },
    });

    const getMockRecipeStep = (): DialecticRecipeStep => ({
        step: 2,
        name: 'test-step',
        prompt_template_name: 'test_prompt',
        output_type: 'reduced_synthesis',
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'pairwise_synthesis_chunk' }],
    });

    await t.step('should create one job per source group, inheriting model_id from the parent job', () => {
        const sourceDocs = [
            getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'), 
            getMockSourceDoc('model-b-id', 'doc-b-id', 'group-b')
        ];
        const mockParentJob = getMockParentJob();
        const mockRecipeStep = getMockRecipeStep();

        const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'user-jwt-123');

        assertEquals(childPayloads.length, 2, "Expected exactly one child job per source document group.");
        
        const payloadForA = childPayloads.find(p => p.document_relationships?.source_group === 'group-a');
        const payloadForB = childPayloads.find(p => p.document_relationships?.source_group === 'group-b');
        
        assertExists(payloadForA, "Payload for group-a should exist.");
        assertExists(payloadForB, "Payload for group-b should exist.");

        // Assert that the model_id is inherited from the PARENT, not the source doc.
        assertEquals(payloadForA.model_id, mockParentJob.payload.model_id);
        assertEquals(payloadForB.model_id, mockParentJob.payload.model_id);
    });

    await t.step('should return an empty array when sourceDocs is empty', () => {
        const sourceDocs: SourceDocument[] = [];
        const mockParentJob = getMockParentJob();
        const mockRecipeStep = getMockRecipeStep();

        const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'user-jwt-123');

        assertEquals(childPayloads.length, 0, "Expected no child jobs when there are no source documents.");
    });

    await t.step('should create a job even if a source doc is missing a model_id, as it uses the parent model_id', () => {
        const sourceDocs = [
            getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'), 
            getMockSourceDoc(null, 'doc-c-id', 'group-c')
        ];
        const mockParentJob = getMockParentJob();
        const mockRecipeStep = getMockRecipeStep();

        const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'user-jwt-123');

        assertEquals(childPayloads.length, 2, "Expected two child jobs as there are two distinct source groups.");
        
        const payloadForA = childPayloads.find(p => p.document_relationships?.source_group === 'group-a');
        assertExists(payloadForA, "Payload for group-a should have been created.");
        assertEquals(payloadForA.model_id, mockParentJob.payload.model_id, "Model ID should be inherited from parent.");

        const payloadForC = childPayloads.find(p => p.document_relationships?.source_group === 'group-c');
        assertExists(payloadForC, "Payload for group-c should have been created.");
        assertEquals(payloadForC.model_id, mockParentJob.payload.model_id, "Model ID should be inherited from parent even if source doc model_id is null.");
    });

    await t.step('should group source documents by source_group and create one job per group', () => {
        const sourceDocs = [
            getMockSourceDoc('model-a-id', 'doc-a1-id', 'thesis-a'),
            getMockSourceDoc('model-b-id', 'doc-a2-id', 'thesis-a'),
            getMockSourceDoc('model-a-id', 'doc-b1-id', 'thesis-b'),
            getMockSourceDoc('model-b-id', 'doc-b2-id', 'thesis-b'),
        ];
        const mockParentJob = getMockParentJob();
        mockParentJob.payload.model_id = 'parent-model-id'; // Set a distinct model_id for the parent
        const mockRecipeStep = getMockRecipeStep();

        const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'user-jwt-123');

        assertEquals(childPayloads.length, 2, "FAIL: Expected exactly one child job per source_group.");
        
        const payloadForGroupA = childPayloads.find(p => p.document_relationships?.source_group === 'thesis-a');
        const payloadForGroupB = childPayloads.find(p => p.document_relationships?.source_group === 'thesis-b');
        
        assertExists(payloadForGroupA, "A payload for source_group 'thesis-a' should have been created.");
        assertExists(payloadForGroupB, "A payload for source_group 'thesis-b' should have been created.");
        
        assertEquals(payloadForGroupA.model_id, 'parent-model-id', "Child job's model_id should match the parent job's model_id.");
        
        assertExists(payloadForGroupA.inputs, "Inputs should exist for group A payload.");
        assertExists(payloadForGroupA.inputs.pairwise_synthesis_chunk_ids, "pairwise_synthesis_chunk_ids should exist for group A.");
        assert(Array.isArray(payloadForGroupA.inputs.pairwise_synthesis_chunk_ids), "inputs should be an array of IDs");
        assertEquals(payloadForGroupA.inputs.pairwise_synthesis_chunk_ids.sort(), ['doc-a1-id', 'doc-a2-id'].sort(), "Group A inputs should contain all docs from that group.");

        // Assert that stageSlug is correctly propagated
        assertExists(payloadForGroupA.stageSlug);
        assertEquals(payloadForGroupA.stageSlug, 'synthesis');
    });
});
