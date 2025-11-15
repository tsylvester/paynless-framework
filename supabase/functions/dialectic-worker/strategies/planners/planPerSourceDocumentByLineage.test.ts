// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts
import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
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
        is_header: false,
        source_prompt_resource_id: null,
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
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
        },
        is_test_job: false,
        job_type: 'PLAN',
    });

    const getMockRecipeStep = (): DialecticRecipeStep => ({
        id: 'recipe-step-id-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-abc',
        step_key: 'test-step-key-1',
        step_slug: 'test-step-slug-1',
        step_description: 'Mock description 1',
        step_number: 2,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.ReducedSynthesis,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'pairwise_synthesis_chunk', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [],
        outputs_required: { documents: [], assembled_json: [], files_to_generate: [] },
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

        // NEW ASSERTIONS for modern contract
        assertExists(payloadForA.prompt_template_id, "prompt_template_id should exist on the new payload.");
        assertEquals(payloadForA.prompt_template_id, 'tmpl-12345');
        assertEquals((payloadForA as any).prompt_template_name, undefined, "prompt_template_name should be undefined.");
        assertEquals(payloadForA.output_type, FileType.ReducedSynthesis);
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

    await t.step('dynamic stage consistency: all child payloads inherit parent payload.stageSlug for each lineage group', () => {
        const sourceDocs = [
            getMockSourceDoc('model-a-id', 'doc-a1-id', 'thesis-a'),
            getMockSourceDoc('model-b-id', 'doc-a2-id', 'thesis-a'),
            getMockSourceDoc('model-a-id', 'doc-b1-id', 'thesis-b'),
            getMockSourceDoc('model-b-id', 'doc-b2-id', 'thesis-b'),
        ];
        const mockParentJob = getMockParentJob();
        const expectedStage = 'parenthesis';
        Object.defineProperty(mockParentJob, 'stage_slug', { value: expectedStage, configurable: true, enumerable: true, writable: true });
        Object.defineProperty(mockParentJob.payload, 'stageSlug', { value: expectedStage, configurable: true, enumerable: true, writable: true });

        const mockRecipeStep = getMockRecipeStep();

        const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'ignored.jwt');

        // Should have one child per group
        assertEquals(childPayloads.length, 2);

        for (const child of childPayloads) {
            assertEquals(child.stageSlug, expectedStage, 'Child payload.stageSlug must equal parent.payload.stageSlug');
        }
    });
});

Deno.test('planPerSourceDocumentByLineage should treat a doc without a source_group as the root of a new lineage', async (t) => {
    const getMockSourceDoc = (modelId: string | null, docId: string, sourceGroup: string | null = null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'thesis', // This is a root document type
        model_id: modelId,
        model_name: `model-${modelId}-name`,
        content: `content for ${docId}`,
        user_id: 'user-id',
        stage: 'thesis',
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
        is_header: false,
        source_prompt_resource_id: null,
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
        stage_slug: 'antithesis',
        started_at: new Date().toISOString(),
        target_contribution_id: null,
        payload: {
            projectId: 'proj-id',
            sessionId: 'sess-id',
            stageSlug: 'antithesis',
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
        },
        is_test_job: false,
        job_type: 'PLAN',
    });

    const getMockRecipeStep = (): DialecticRecipeStep => ({
        id: 'recipe-step-id-789',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-def',
        step_key: 'test-step-key-2',
        step_slug: 'test-step-slug-2',
        step_description: 'Mock description 2',
        step_number: 1,
        step_name: 'antithesis-step',
        prompt_template_id: 'tmpl-antithesis-54321',
        output_type: FileType.business_case_critique,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [],
        outputs_required: { documents: [], assembled_json: [], files_to_generate: [] },
    });

    await t.step('should create a new lineage group using doc ID if source_group is missing', () => {
        // Arrange: A source document that is a 'thesis' and has no 'source_group'
        const sourceDocWithoutLineage = getMockSourceDoc('model-a-id', 'thesis-doc-1', null);
        const mockParentJob = getMockParentJob();
        const mockRecipeStep = getMockRecipeStep();

        // Act: Run the planner
        const childPayloads = planPerSourceDocumentByLineage([sourceDocWithoutLineage], mockParentJob, mockRecipeStep, 'user-jwt-123');

        // Assert: It should create exactly one child job
        assertEquals(childPayloads.length, 1, "Expected one child job to be created for the document without a source group.");

        const childPayload = childPayloads[0];
        assertExists(childPayload.document_relationships, "Child payload must have document_relationships.");
        
        // Assert: The new source_group for the child job should be the ID of the source document itself.
        assertEquals(
            childPayload.document_relationships.source_group,
            sourceDocWithoutLineage.id,
            "The source_group of the new lineage should be the ID of the root document."
        );

        // Assert: The inputs for the new job should contain the ID of the source document.
        assertExists(childPayload.inputs, "Inputs should exist for the new payload.");
        assertExists(childPayload.inputs.thesis_ids, "The correct input type ('thesis_ids') should exist.");
        assertEquals(childPayload.inputs.thesis_ids, [sourceDocWithoutLineage.id]);
        
        // NEW ASSERTIONS for modern contract
        assertExists(childPayload.prompt_template_id, "prompt_template_id should exist on the new payload.");
        assertEquals(childPayload.prompt_template_id, 'tmpl-antithesis-54321');
        assertEquals((childPayload as any).prompt_template_name, undefined, "prompt_template_name should be undefined.");
        assertEquals(childPayload.output_type, FileType.business_case_critique);
    });
});

Deno.test('planPerSourceDocumentByLineage surfaces sourceContributionId for lineage documents', () => {
    const lineageDocId = 'lineage-contrib-789';
    const netNewDocId = 'net-new-doc-123';

    const getMockSourceDoc = (docId: string, sourceGroup: string | null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'pairwise_synthesis_chunk',
        model_id: 'model-a-id',
        model_name: `model-${docId}-model`,
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
        is_header: false,
        source_prompt_resource_id: null,
    });

    const mockParentJob: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
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
            stageSlug: 'synthesis',
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const mockRecipeStep: DialecticRecipeStep = {
        id: 'recipe-step-id-lineage',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-lineage',
        step_key: 'lineage-step-key',
        step_slug: 'lineage-step-slug',
        step_description: 'Lineage coverage',
        step_number: 2,
        step_name: 'lineage-step',
        prompt_template_id: 'tmpl-lineage-123',
        output_type: FileType.ReducedSynthesis,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'pairwise_synthesis_chunk', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [],
        outputs_required: { documents: [], assembled_json: [], files_to_generate: [] },
    };

    const lineageDoc = getMockSourceDoc(lineageDocId, 'lineage-group-a');
    const netNewDoc = getMockSourceDoc(netNewDocId, null);

    const childPayloads = planPerSourceDocumentByLineage([lineageDoc, netNewDoc], mockParentJob, mockRecipeStep, 'user-jwt-123');

    const lineagePayload = childPayloads.find((payload) => payload.document_relationships?.source_group === 'lineage-group-a');
    assertExists(lineagePayload, 'Expected payload for lineage group to exist');
    assertEquals(
        lineagePayload.sourceContributionId,
        lineageDocId,
        'Lineage-backed payload must surface the originating contribution id'
    );

    const netNewPayload = childPayloads.find((payload) => payload.document_relationships?.source_group === netNewDocId);
    assertExists(netNewPayload, 'Expected payload for net-new document lineage to exist');
    assertEquals(
        netNewPayload.sourceContributionId,
        null,
        'Net-new lineage payloads must omit sourceContributionId'
    );
});