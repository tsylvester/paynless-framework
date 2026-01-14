// supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts
import { 
    assertEquals, 
    assertExists, 
    assert, 
    assertRejects,
    assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { FileType } from '../../../_shared/types/file_manager.types.ts';
import { 
    DialecticJobRow, 
    DialecticPlanJobPayload, 
    DialecticRecipeStep, 
    DialecticStageRecipeStep, 
    DialecticRecipeTemplateStep, 
    SourceDocument, 
    ContextForDocument,
    DialecticExecuteJobPayload,
} from '../../../dialectic-service/dialectic.interface.ts';
import { planPerSourceDocumentByLineage } from './planPerSourceDocumentByLineage.ts';
import { 
    isDialecticExecuteJobPayload, 
    isDialecticPlanJobPayload 
} from '../../../_shared/utils/type-guards/type_guards.dialectic.ts';

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
    file_name: `gpt-4_0_pairwise_synthesis_chunk.md`,
    storage_bucket: 'bucket',
    storage_path: `project-123/session_abc/iteration_1/3_synthesis/documents`,
    size_bytes: 100,
    mime_type: 'text/plain',
    document_relationships: sourceGroup ? { source_group: sourceGroup } : null,
    is_header: false,
    source_prompt_resource_id: null,
    document_key: FileType.PairwiseSynthesisChunk,
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
        stageSlug: 'synthesis',
        iterationNumber: 1,
        job_type: 'PLAN',
        model_id: 'model-a-id',
        walletId: 'wallet-default',
        user_jwt: 'user-jwt-123',
    },
    is_test_job: false,
    job_type: 'PLAN',
});

const getMockRecipeStep = (): DialecticStageRecipeStep => ({
    id: 'recipe-step-id-123',
    instance_id: 'instance-id-456',
    template_step_id: 'template-step-id-789',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    step_key: 'test-step-key-1',
    step_slug: 'test-step-slug-1',
    step_description: 'Mock description 1',
    step_name: 'test-step',
    prompt_template_id: 'tmpl-12345',
    output_type: FileType.ReducedSynthesis,
    granularity_strategy: 'per_source_document_by_lineage',
    inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
    job_type: 'EXECUTE',
    prompt_type: 'Turn',
    branch_key: null,
    parallel_group: null,
    inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
    config_override: {},
    is_skipped: false,
    object_filter: {},
    output_overrides: {},
    execution_order: 3,
    outputs_required: {
        documents: [{
            artifact_class: 'rendered_document',
            file_type: 'markdown',
            document_key: FileType.ReducedSynthesis,
            template_filename: 'reduced_synthesis.md',
        }],
        assembled_json: [],
        files_to_generate: [{
            template_filename: 'reduced_synthesis.md',
            from_document_key: FileType.ReducedSynthesis,
        }],
    },
});

Deno.test('planPerSourceDocumentByLineage', async (t) => {
    await t.step('should create one job per source group, inheriting model_id from the parent job', () => {
        const sourceDocs = [
            getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'), 
            getMockSourceDoc('model-b-id', 'doc-b-id', 'group-b')
        ];
        const mockParentJob = getMockParentJob();
        const mockRecipeStep = getMockRecipeStep();

        const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'user-jwt-123');

        assertEquals(childPayloads.length, 2, "Expected exactly one child job per source document group.");
        
        const payloadForA = childPayloads.find(p => {
            if (isDialecticExecuteJobPayload(p) && 'document_relationships' in p) {
                return p.document_relationships?.source_group === 'group-a';
            }
            return false;
        });
        const payloadForB = childPayloads.find(p => {
            if (isDialecticExecuteJobPayload(p) && 'document_relationships' in p) {
                return p.document_relationships?.source_group === 'group-b';
            }
            return false;
        });
        
        assertExists(payloadForA, "Payload for group-a should exist.");
        assertExists(payloadForB, "Payload for group-b should exist.");

        // Assert that the model_id is inherited from the PARENT, not the source doc.
        assertEquals(payloadForA.model_id, mockParentJob.payload.model_id);
        assertEquals(payloadForB.model_id, mockParentJob.payload.model_id);

        // NEW ASSERTIONS for modern contract
        if (isDialecticExecuteJobPayload(payloadForA)) {
            assertExists(payloadForA.prompt_template_id, "prompt_template_id should exist on the new payload.");
            assertEquals(payloadForA.prompt_template_id, 'tmpl-12345');
            assertEquals((payloadForA as any).prompt_template_name, undefined, "prompt_template_name should be undefined.");
            assertEquals(payloadForA.output_type, FileType.ReducedSynthesis);
        } else {
            throw new Error('Expected EXECUTE job');
        }
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
        
        const payloadForA = childPayloads.find(p => {
            if (isDialecticExecuteJobPayload(p) && 'document_relationships' in p) {
                return p.document_relationships?.source_group === 'group-a';
            }
            return false;
        });
        assertExists(payloadForA, "Payload for group-a should have been created.");
        assertEquals(payloadForA.model_id, mockParentJob.payload.model_id, "Model ID should be inherited from parent.");

        const payloadForC = childPayloads.find(p => {
            if (isDialecticExecuteJobPayload(p) && 'document_relationships' in p) {
                return p.document_relationships?.source_group === 'group-c';
            }
            return false;
        });
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
        
        const payloadForGroupA = childPayloads.find(p => {
            if (isDialecticExecuteJobPayload(p) && 'document_relationships' in p) {
                return p.document_relationships?.source_group === 'thesis-a';
            }
            return false;
        });
        const payloadForGroupB = childPayloads.find(p => {
            if (isDialecticExecuteJobPayload(p) && 'document_relationships' in p) {
                return p.document_relationships?.source_group === 'thesis-b';
            }
            return false;
        });
        
        assertExists(payloadForGroupA, "A payload for source_group 'thesis-a' should have been created.");
        assertExists(payloadForGroupB, "A payload for source_group 'thesis-b' should have been created.");
        
        assertEquals(payloadForGroupA.model_id, 'parent-model-id', "Child job's model_id should match the parent job's model_id.");
        
        if (isDialecticExecuteJobPayload(payloadForGroupA)) {
            assertExists(payloadForGroupA.inputs, "Inputs should exist for group A payload.");
            assertExists(payloadForGroupA.inputs.pairwise_synthesis_chunk_ids, "pairwise_synthesis_chunk_ids should exist for group A.");
            assert(Array.isArray(payloadForGroupA.inputs.pairwise_synthesis_chunk_ids), "inputs should be an array of IDs");
            assertEquals(payloadForGroupA.inputs.pairwise_synthesis_chunk_ids.sort(), ['doc-a1-id', 'doc-a2-id'].sort(), "Group A inputs should contain all docs from that group.");
        } else {
            throw new Error('Expected EXECUTE job');
        }

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
        file_name: `gpt-4_0_business_case.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/1_thesis/documents`,
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
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
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
        inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.business_case_critique,
                template_filename: 'business_case_critique.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'business_case_critique.md',
                from_document_key: FileType.business_case_critique,
            }],
        },
    });

    await t.step('should create a new lineage group using doc ID if source_group is missing', () => {
        // Arrange: A source document that is a 'thesis' and has no 'source_group'
        const sourceDocWithoutLineage: SourceDocument = {
            ...getMockSourceDoc('model-a-id', 'thesis-doc-1', null),
            stage: 'thesis',
            contribution_type: 'thesis',
            document_key: FileType.business_case,
            file_name: 'gpt-4_0_business_case.md',
            storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        };
        const mockParentJob = getMockParentJob();
        const mockRecipeStep = getMockRecipeStep();

        // Act: Run the planner
        const childPayloads = planPerSourceDocumentByLineage([sourceDocWithoutLineage], mockParentJob, mockRecipeStep, 'user-jwt-123');

        // Assert: It should create exactly one child job
        assertEquals(childPayloads.length, 1, "Expected one child job to be created for the document without a source group.");

        const childPayload = childPayloads[0];
        if (isDialecticExecuteJobPayload(childPayload)) {
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
        } else {
            throw new Error('Expected EXECUTE job');
        }
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
        model_name: `model-a-name`,
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
        file_name: `gpt-4_0_pairwise_synthesis_chunk.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/3_synthesis/documents`,
        size_bytes: 100,
        mime_type: 'text/plain',
        document_relationships: sourceGroup ? { source_group: sourceGroup } : null,
        is_header: false,
        source_prompt_resource_id: null,
        document_key: FileType.PairwiseSynthesisChunk,
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
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
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
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'reduced_synthesis.md',
                from_document_key: FileType.ReducedSynthesis,
            }],
        },
    };

    const lineageDoc = getMockSourceDoc(lineageDocId, 'lineage-group-a');
    const netNewDoc = getMockSourceDoc(netNewDocId, null);

    const childPayloads = planPerSourceDocumentByLineage([lineageDoc, netNewDoc], mockParentJob, mockRecipeStep, 'user-jwt-123');

    const lineagePayload = childPayloads.find((payload) => {
        if (isDialecticExecuteJobPayload(payload) && 'document_relationships' in payload) {
            return payload.document_relationships?.source_group === 'lineage-group-a';
        }
        return false;
    });
    assertExists(lineagePayload, 'Expected payload for lineage group to exist');
    assertEquals(
        lineagePayload.sourceContributionId,
        lineageDocId,
        'Lineage-backed payload must surface the originating contribution id'
    );

    const netNewPayload = childPayloads.find((payload) => {
        if (isDialecticExecuteJobPayload(payload) && 'document_relationships' in payload) {
            return payload.document_relationships?.source_group === netNewDocId;
        }
        return false;
    });
    assertExists(netNewPayload, 'Expected payload for net-new document lineage to exist');
    assertEquals(
        netNewPayload.sourceContributionId,
        null,
        'Net-new lineage payloads must omit sourceContributionId'
    );
});

Deno.test('planPerSourceDocumentByLineage includes planner_metadata with recipe_step_id in all child payloads', () => {
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
        file_name: `gpt-4_0_pairwise_synthesis_chunk.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/3_synthesis/documents`,
        size_bytes: 100,
        mime_type: 'text/plain',
        document_relationships: sourceGroup ? { source_group: sourceGroup } : null,
        is_header: false,
        source_prompt_resource_id: null,
        document_key: FileType.PairwiseSynthesisChunk,
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
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const mockRecipeStepWithId: DialecticRecipeStep = {
        id: 'recipe-step-789',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-789',
        step_key: 'test-step-key-789',
        step_slug: 'test-step-slug-789',
        step_description: 'Mock description for planner_metadata test',
        step_number: 2,
        step_name: 'test-step-789',
        prompt_template_id: 'tmpl-789',
        output_type: FileType.ReducedSynthesis,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'reduced_synthesis.md',
                from_document_key: FileType.ReducedSynthesis,
            }],
        },
    };

    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
        getMockSourceDoc('model-b-id', 'doc-b-id', 'group-b'),
    ];

    const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStepWithId, 'user-jwt-123');

    assertEquals(childPayloads.length, 2, 'Should create 2 child jobs, one for each source group');

    for (const job of childPayloads) {
        assertExists(job, 'Child job should exist');
        if (isDialecticExecuteJobPayload(job) && 'planner_metadata' in job) {
            assertExists(job.planner_metadata, 'Child job should include planner_metadata');
            if (job.planner_metadata) {
                assertEquals(
                    job.planner_metadata.recipe_step_id,
                    'recipe-step-789',
                    'planner_metadata.recipe_step_id should match the recipe step id for every child job',
                );
            }
        } else {
            throw new Error('Expected EXECUTE job with planner_metadata');
        }
    }
});

Deno.test('planPerSourceDocumentByLineage should inherit all fields from parent job payload including model_slug and user_jwt', () => {
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
        file_name: `gpt-4_0_pairwise_synthesis_chunk.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/3_synthesis/documents`,
        size_bytes: 100,
        mime_type: 'text/plain',
        document_relationships: sourceGroup ? { source_group: sourceGroup } : null,
        is_header: false,
        source_prompt_resource_id: null,
        document_key: FileType.PairwiseSynthesisChunk,
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
            model_slug: 'parent-model-slug',
            user_jwt: 'parent-jwt-token',
            walletId: 'wallet-default',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const mockRecipeStep: DialecticRecipeStep = {
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
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'reduced_synthesis.md',
                from_document_key: FileType.ReducedSynthesis,
            }],
        },
    };

    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
        getMockSourceDoc('model-b-id', 'doc-b-id', 'group-b'),
    ];

    const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, mockRecipeStep, 'user-jwt-123');

    assertEquals(childPayloads.length, 2, 'Should create 2 child jobs, one for each source group');

    for (const job of childPayloads) {
        assertExists(job, 'Child job should exist');
        assertEquals(
            job.model_slug,
            'parent-model-slug',
            'Child job should inherit model_slug from parent job payload'
        );
        assertEquals(
            job.user_jwt,
            'parent-jwt-token',
            'Child job should inherit user_jwt from parent job payload'
        );
    }
});

Deno.test('planPerSourceDocumentByLineage sets document_key in payload when recipeStep.outputs_required.documents[0].document_key is present', () => {
    const getMockSourceDoc = (modelId: string | null, docId: string, sourceGroup: string | null = null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'thesis',
        model_id: modelId,
        model_name: `model-${modelId}-name`,
        content: `content for ${docId}`,
        user_id: 'user-id',
        stage: 'thesis',
        document_key: FileType.business_case,
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
        file_name: `gpt-4_0_business_case.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/1_thesis/documents`,
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
        stage_slug: 'parenthesis',
        started_at: new Date().toISOString(),
        target_contribution_id: null,
        payload: {
            projectId: 'proj-id',
            sessionId: 'sess-id',
            stageSlug: 'parenthesis',
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const recipeStepWithDocumentKey: DialecticRecipeStep = {
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
        output_type: FileType.technical_requirements,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.technical_requirements,
                template_filename: 'technical_requirements.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'technical_requirements.md',
                from_document_key: FileType.technical_requirements,
            }],
        },
    };

    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];

    const childPayloads = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, recipeStepWithDocumentKey, 'user-jwt-123');

    assertEquals(childPayloads.length, 1, 'Should create exactly one child job');
    const job = childPayloads[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job) && 'document_key' in job) {
        assertEquals(
            job.document_key,
            FileType.technical_requirements,
            'document_key should be extracted from recipeStep.outputs_required.documents[0].document_key',
        );
    } else {
        throw new Error('Expected EXECUTE job with document_key');
    }
});

Deno.test('planPerSourceDocumentByLineage does NOT set document_key when outputs_required.documents array is empty', async () => {
    const getMockSourceDoc = (modelId: string | null, docId: string, sourceGroup: string | null = null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'thesis',
        model_id: modelId,
        model_name: `model-${modelId}-name`,
        content: `content for ${docId}`,
        user_id: 'user-id',
        stage: 'thesis',
        document_key: FileType.business_case,
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
        file_name: `gpt-4_0_business_case.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/1_thesis/documents`,
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
        stage_slug: 'parenthesis',
        started_at: new Date().toISOString(),
        target_contribution_id: null,
        payload: {
            projectId: 'proj-id',
            sessionId: 'sess-id',
            stageSlug: 'parenthesis',
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const recipeStepWithEmptyDocuments: DialecticRecipeStep = {
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
        output_type: FileType.technical_requirements,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'technical_requirements.md',
                from_document_key: FileType.technical_requirements,
            }],
        },
    };

    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, recipeStepWithEmptyDocuments, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents to have at least one entry for EXECUTE jobs',
        'Should throw error when documents array is empty for EXECUTE job',
    );
});

Deno.test('planPerSourceDocumentByLineage does NOT set document_key when outputs_required is missing documents property', async () => {
    const getMockSourceDoc = (modelId: string | null, docId: string, sourceGroup: string | null = null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'thesis',
        model_id: modelId,
        model_name: `model-${modelId}-name`,
        content: `content for ${docId}`,
        user_id: 'user-id',
        stage: 'thesis',
        document_key: FileType.business_case,
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
        file_name: `gpt-4_0_business_case.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/1_thesis/documents`,
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
        stage_slug: 'parenthesis',
        started_at: new Date().toISOString(),
        target_contribution_id: null,
        payload: {
            projectId: 'proj-id',
            sessionId: 'sess-id',
            stageSlug: 'parenthesis',
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const recipeStepWithoutDocumentsProperty = {
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
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
        outputs_required: {
            header_context_artifact: {
                type: 'header_context',
                document_key: FileType.HeaderContext,
                artifact_class: 'header_context',
                file_type: 'json',
            },
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'header_context.json',
                from_document_key: FileType.HeaderContext,
            }],
        },
    } as unknown as DialecticRecipeStep;

    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, recipeStepWithoutDocumentsProperty, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents for EXECUTE jobs, but documents is missing',
        'Should throw error when documents property is missing for EXECUTE job',
    );
});

Deno.test('planPerSourceDocumentByLineage throws error when outputs_required.documents[0] is missing document_key property', async () => {
    const getMockSourceDoc = (modelId: string | null, docId: string, sourceGroup: string | null = null): SourceDocument => ({
        id: docId,
        session_id: 'sess-id',
        contribution_type: 'thesis',
        model_id: modelId,
        model_name: `model-${modelId}-name`,
        content: `content for ${docId}`,
        user_id: 'user-id',
        stage: 'thesis',
        document_key: FileType.business_case,
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
        file_name: `gpt-4_0_business_case.md`,
        storage_bucket: 'bucket',
        storage_path: `project-123/session_abc/iteration_1/1_thesis/documents`,
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
        stage_slug: 'parenthesis',
        started_at: new Date().toISOString(),
        target_contribution_id: null,
        payload: {
            projectId: 'proj-id',
            sessionId: 'sess-id',
            stageSlug: 'parenthesis',
            iterationNumber: 1,
            job_type: 'PLAN',
            model_id: 'model-a-id',
            walletId: 'wallet-default',
            user_jwt: 'user-jwt-123',
        },
        is_test_job: false,
        job_type: 'PLAN',
    };

    const recipeStepWithoutDocumentKey = {
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
        output_type: FileType.technical_requirements,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'thesis', document_key: FileType.business_case, required: true }],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                template_filename: 'technical_requirements.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'technical_requirements.md',
                from_document_key: FileType.technical_requirements,
            }],
        },
    } as unknown as DialecticRecipeStep;

    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, recipeStepWithoutDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires recipeStep.outputs_required.documents[0].document_key but it is missing',
        'Should throw error when document_key property is missing',
    );
});

Deno.test('planPerSourceDocumentByLineage includes context_for_documents in EXECUTE job payload for PLAN recipe steps with valid context_for_documents', () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const planRecipeStep: DialecticRecipeTemplateStep = {
        id: 'recipe-step-id-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-abc',
        step_key: 'test-step-key-1',
        step_slug: 'test-step-slug-1',
        step_description: 'Mock description 1',
        step_number: 1,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'PLAN',
        prompt_type: 'Planner',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        field1: '',
                        field2: [],
                    },
                },
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, planRecipeStep, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'PLAN recipe steps should create EXECUTE child jobs, not PLAN child jobs');
    if (isDialecticExecuteJobPayload(job)) {
        assertExists(job.context_for_documents, 'EXECUTE job payload should include context_for_documents');
        assertEquals(job.context_for_documents.length, 1, 'context_for_documents should have one entry');
        assertEquals(job.context_for_documents[0].document_key, FileType.business_case, 'document_key should match');
        assertEquals(job.prompt_template_id, 'tmpl-12345', 'EXECUTE job should inherit prompt_template_id from recipe step');
        assertEquals(job.output_type, FileType.HeaderContext, 'EXECUTE job should have HeaderContext output_type');
        assertEquals(job.document_key, FileType.HeaderContext, 'EXECUTE job should have document_key from header_context_artifact');
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planPerSourceDocumentByLineage throws error for PLAN job when context_for_documents is missing', async () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const planRecipeStepWithoutContext: DialecticRecipeTemplateStep = {
        id: 'recipe-step-id-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-abc',
        step_key: 'test-step-key-1',
        step_slug: 'test-step-slug-1',
        step_description: 'Mock description 1',
        step_number: 1,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'PLAN',
        prompt_type: 'Planner',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeTemplateStep;

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, planRecipeStepWithoutContext, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires',
        'Should throw error when context_for_documents is missing for PLAN job',
    );
});

Deno.test('planPerSourceDocumentByLineage throws error for PLAN job when context_for_documents entry is missing document_key', async () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const planRecipeStepWithoutDocumentKey: DialecticRecipeTemplateStep = {
        id: 'recipe-step-id-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-abc',
        step_key: 'test-step-key-1',
        step_slug: 'test-step-slug-1',
        step_description: 'Mock description 1',
        step_number: 1,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'PLAN',
        prompt_type: 'Planner',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            context_for_documents: [
                {
                    content_to_include: {
                        field1: '',
                    },
                } as unknown as ContextForDocument,
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeTemplateStep;

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, planRecipeStepWithoutDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires',
        'Should throw error when context_for_documents entry is missing document_key',
    );
});

Deno.test('planPerSourceDocumentByLineage throws error for PLAN job when context_for_documents entry is missing content_to_include', async () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const planRecipeStepWithoutContentToInclude: DialecticRecipeTemplateStep = {
        id: 'recipe-step-id-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-abc',
        step_key: 'test-step-key-1',
        step_slug: 'test-step-slug-1',
        step_description: 'Mock description 1',
        step_number: 1,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [{ type: 'document', slug: 'synthesis', document_key: FileType.PairwiseSynthesisChunk, required: true }],
        job_type: 'PLAN',
        prompt_type: 'Planner',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [{ document_key: FileType.PairwiseSynthesisChunk, relevance: 1.0 }],
        outputs_required: {
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                } as unknown as ContextForDocument,
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
    } as unknown as DialecticRecipeTemplateStep;

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, planRecipeStepWithoutContentToInclude, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires',
        'Should throw error when context_for_documents entry is missing content_to_include',
    );
});

Deno.test('planPerSourceDocumentByLineage successfully creates payload for EXECUTE job with valid files_to_generate', () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const executeRecipeStep: DialecticStageRecipeStep = {
        ...getMockRecipeStep(),
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    from_document_key: FileType.ReducedSynthesis,
                    template_filename: 'reduced_synthesis.md',
                },
            ],
        },
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, executeRecipeStep, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'Job type should be execute');
});

Deno.test('planPerSourceDocumentByLineage throws error for EXECUTE job when files_to_generate is missing', async () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const executeRecipeStepWithoutFiles: DialecticStageRecipeStep = {
        ...getMockRecipeStep(),
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
        },
    };

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, executeRecipeStepWithoutFiles, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires',
        'Should throw error when files_to_generate is missing for EXECUTE job',
    );
});

Deno.test('planPerSourceDocumentByLineage throws error for EXECUTE job when files_to_generate entry is missing from_document_key', async () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const executeRecipeStepWithoutFromDocumentKey: DialecticStageRecipeStep = {
        ...getMockRecipeStep(),
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    template_filename: 'reduced_synthesis.md',
                } as unknown as { from_document_key: FileType; template_filename: string },
            ],
        },
    };

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, executeRecipeStepWithoutFromDocumentKey, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires',
        'Should throw error when files_to_generate entry is missing from_document_key',
    );
});

Deno.test('planPerSourceDocumentByLineage throws error for EXECUTE job when files_to_generate entry is missing template_filename', async () => {
    const sourceDocs = [
        getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
    ];
    const mockParentJob = getMockParentJob();
    const executeRecipeStepWithoutTemplateFilename: DialecticStageRecipeStep = {
        ...getMockRecipeStep(),
        job_type: 'EXECUTE',
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [
                {
                    from_document_key: FileType.ReducedSynthesis,
                } as unknown as { from_document_key: FileType; template_filename: string },
            ],
        },
    };

    await assertRejects(
        async () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, executeRecipeStepWithoutTemplateFilename, 'user-jwt-123');
        },
        Error,
        'planPerSourceDocumentByLineage requires',
        'Should throw error when files_to_generate entry is missing template_filename',
    );
});

Deno.test('planPerSourceDocumentByLineage EXECUTE branch must not set document_relationships[stageSlug] for root jobs', () => {
	const sourceDocs = [
		getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
		getMockSourceDoc('model-b-id', 'doc-b-id', 'group-b'),
	];
	const mockParentJob = getMockParentJob();
	const parentPayload = mockParentJob.payload;
	if (!parentPayload) {
		throw new Error('Test setup error: mockParentJob.payload cannot be null');
	}

	const parentJobWithStageSlug: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
		...mockParentJob,
		payload: {
			projectId: parentPayload.projectId,
			sessionId: parentPayload.sessionId,
			stageSlug: 'thesis',
			iterationNumber: parentPayload.iterationNumber,
			model_id: parentPayload.model_id,
			walletId: parentPayload.walletId,
			user_jwt: parentPayload.user_jwt,
		},
	};

	const executeRecipeStep: DialecticStageRecipeStep = {
		...getMockRecipeStep(),
		job_type: 'EXECUTE',
		outputs_required: {
			documents: [{
				artifact_class: 'rendered_document',
				file_type: 'markdown',
				document_key: FileType.business_case,
				template_filename: 'thesis_business_case.md',
			}],
			assembled_json: [],
			files_to_generate: [
				{
					from_document_key: FileType.business_case,
					template_filename: 'thesis_business_case.md',
				},
			],
		},
	};

	const childPayloads = planPerSourceDocumentByLineage(
		sourceDocs,
		parentJobWithStageSlug,
		executeRecipeStep,
		parentJobWithStageSlug.payload.user_jwt
	);

	assertEquals(childPayloads.length, 2, 'Should create one child job per source group');

	for (const payload of childPayloads) {
		assertExists(payload, 'Child job should exist');
		if (isDialecticExecuteJobPayload(payload)) {
			const executePayload: DialecticExecuteJobPayload = payload;
			assertExists(executePayload.document_relationships, 'EXECUTE job payload should include document_relationships');
			assertExists(executePayload.document_relationships?.source_group, 'document_relationships should include source_group');
			
			const groupId = executePayload.document_relationships.source_group;
			assert(
				typeof groupId === 'string' && groupId.length > 0,
				'source_group should be set to a valid groupId (lineage preserved)',
			);
			assert(
				groupId === 'group-a' || groupId === 'group-b',
				`source_group should be one of the expected group IDs (group-a or group-b), got: ${groupId}`,
			);
			
			// Assert that the stageSlug key is NOT present
			assert(
				!('thesis' in executePayload.document_relationships),
				'document_relationships[stageSlug] must be absent/undefined for root jobs (not set to groupId)',
			);
		} else {
			throw new Error('Expected EXECUTE job');
		}
	}
});

Deno.test('planPerSourceDocumentByLineage should create EXECUTE child jobs for PLAN recipe steps with header_context_artifact and context_for_documents', () => {
    const sourceDocs: SourceDocument[] = [
        {
            ...getMockSourceDoc('model-a-id', 'doc-a-id', 'group-a'),
            stage: 'thesis',
            contribution_type: 'thesis',
            document_key: FileType.business_case,
        },
        {
            ...getMockSourceDoc('model-b-id', 'doc-b-id', 'group-b'),
            stage: 'thesis',
            contribution_type: 'thesis',
            document_key: FileType.business_case,
        },
    ];
    const mockParentJob = getMockParentJob();
    const planRecipeStep: DialecticRecipeTemplateStep = {
        id: 'plan-step-prepare-proposal-review-plan',
        template_id: 'template-id-antithesis',
        step_number: 1,
        step_key: 'prepare-proposal-review-plan',
        step_slug: 'prepare-proposal-review-plan',
        step_name: 'Prepare Proposal Review Plan',
        step_description: 'Generate HeaderContext for proposal review planning',
        prompt_template_id: 'template-planner-prompt-id-antithesis',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        inputs_relevance: [{ document_key: FileType.business_case, relevance: 1.0 }],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        market_opportunity: '',
                        user_problem_validation: '',
                        competitive_analysis: '',
                    },
                },
            ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, planRecipeStep, 'user-jwt-123');
    
    assertEquals(childJobs.length, 2, 'Should create one child job per source group');
    
    for (const job of childJobs) {
        assertExists(job, 'Child job should exist');
        assertEquals(isDialecticExecuteJobPayload(job), true, 'PLAN recipe steps should create EXECUTE child jobs, not PLAN child jobs');
        if (isDialecticExecuteJobPayload(job)) {
            const executePayload: DialecticExecuteJobPayload = job;
            assertEquals(executePayload.output_type, FileType.HeaderContext, 'EXECUTE job should have HeaderContext output_type');
            assertEquals(executePayload.prompt_template_id, 'template-planner-prompt-id-antithesis', 'EXECUTE job should inherit prompt_template_id from recipe step');
            assertEquals(executePayload.document_key, FileType.HeaderContext, 'EXECUTE job should have document_key from outputs_required.header_context_artifact.document_key');
            assertExists(executePayload.context_for_documents, 'EXECUTE job should include context_for_documents from recipe step');
            assertEquals(executePayload.context_for_documents!.length, 1, 'context_for_documents should have one entry');
            assertEquals(executePayload.context_for_documents![0].document_key, FileType.business_case, 'context_for_documents document_key should match');
            assertExists(executePayload.planner_metadata, 'EXECUTE job should include planner_metadata');
            assertEquals(executePayload.planner_metadata!.recipe_step_id, 'plan-step-prepare-proposal-review-plan', 'planner_metadata.recipe_step_id should match recipe step id');
            assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
            assertExists(executePayload.inputs, 'EXECUTE job should include inputs');
        } else {
            throw new Error('Expected EXECUTE job');
        }
    }
});

Deno.test('planPerSourceDocumentByLineage extracts sourceAnchorModelSlug from most relevant thesis document filename when creating HeaderContext for antithesis stage, not from first document in group', () => {
    const mockParentJob = getMockParentJob();
    const parentPayload = mockParentJob.payload;
    if (!parentPayload) {
        throw new Error('Test setup error: mockParentJob.payload cannot be null');
    }

    const parentJobWithAntithesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...mockParentJob,
        stage_slug: 'antithesis',
        payload: {
            projectId: parentPayload.projectId,
            sessionId: parentPayload.sessionId,
            stageSlug: 'antithesis',
            iterationNumber: parentPayload.iterationNumber,
            model_id: parentPayload.model_id,
            walletId: parentPayload.walletId,
            user_jwt: parentPayload.user_jwt,
        },
    };

    // Seed prompt document (would be groupDocs[0] without relevance algorithm)
    const seedPromptDoc: SourceDocument = {
        ...getMockSourceDoc(null, 'seed-prompt-doc-id', 'thesis-group-a'),
        contribution_type: 'seed_prompt',
        file_name: null,
        stage: 'thesis',
    };

    // Thesis business_case document with highest relevance
    const thesisBusinessCaseDoc: SourceDocument = {
        ...getMockSourceDoc('model-456', 'thesis-business-case-doc-id', 'thesis-group-a'),
        contribution_type: 'thesis',
        file_name: 'gpt-4_0_business_case.md',
        stage: 'thesis',
        document_key: FileType.business_case,
    };

    // Thesis feature_spec document with lower relevance
    const thesisFeatureSpecDoc: SourceDocument = {
        ...getMockSourceDoc('model-789', 'thesis-feature-spec-doc-id', 'thesis-group-a'),
        contribution_type: 'thesis',
        file_name: 'claude-3_0_feature_spec.md',
        stage: 'thesis',
        document_key: FileType.feature_spec,
    };

    const sourceDocs: SourceDocument[] = [seedPromptDoc, thesisBusinessCaseDoc, thesisFeatureSpecDoc];

    const planRecipeStep: DialecticRecipeTemplateStep = {
        id: 'plan-step-id-antithesis-header',
        template_id: 'template-id-123',
        step_number: 1,
        step_key: 'antithesis_prepare_proposal_review_plan',
        step_slug: 'prepare-proposal-review-plan',
        step_name: 'Prepare Proposal Review Plan',
        step_description: 'Generate HeaderContext JSON for antithesis stage',
        prompt_template_id: 'template-planner-prompt-id',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.feature_spec,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
            {
                document_key: FileType.feature_spec,
                relevance: 0.9,
            },
        ],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case_critique,
                    content_to_include: {
                        notes: [],
                    },
                },
            ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, parentJobWithAntithesisStage, planRecipeStep, parentJobWithAntithesisStage.payload.user_jwt);

    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'PLAN recipe steps should create EXECUTE child jobs');
    
    if (isDialecticExecuteJobPayload(job)) {
        const executePayload: DialecticExecuteJobPayload = job;
        assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
        
        // planPerSourceDocumentByLineage should use findAnchorDocumentForHeaderContext to select the anchor based on inputs_relevance.
        // The thesis business_case document has relevance 1.0, so it should be selected as the anchor.
        // sourceAnchorModelSlug should be extracted from thesisBusinessCaseDoc filename ('gpt-4').
        assertExists(
            executePayload.canonicalPathParams.sourceAnchorModelSlug,
            'canonicalPathParams should include sourceAnchorModelSlug extracted from thesis document filename for antithesis HeaderContext'
        );
        assertEquals(
            executePayload.canonicalPathParams.sourceAnchorModelSlug,
            'gpt-4',
            'sourceAnchorModelSlug should be extracted from thesis business_case document filename (gpt-4_0_business_case.md) using relevance-based anchor selection, not from seed_prompt or first document in group'
        );
        assertEquals(
            executePayload.canonicalPathParams.stageSlug,
            'antithesis',
            'stageSlug should be antithesis (target stage)'
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planPerSourceDocumentByLineage EXECUTE branch uses relevance-selected anchor for canonical path params', () => {
    const mockParentJob = getMockParentJob();
    const parentPayload = mockParentJob.payload;
    if (!parentPayload) {
        throw new Error('Test setup error: mockParentJob.payload cannot be null');
    }

    const parentJobWithSynthesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...mockParentJob,
        stage_slug: 'synthesis',
        payload: {
            projectId: parentPayload.projectId,
            sessionId: parentPayload.sessionId,
            stageSlug: 'synthesis',
            iterationNumber: parentPayload.iterationNumber,
            model_id: parentPayload.model_id,
            walletId: parentPayload.walletId,
            user_jwt: parentPayload.user_jwt,
        },
    };

    // Seed prompt document (would be groupDocs[0] without relevance algorithm)
    const seedPromptDoc: SourceDocument = {
        ...getMockSourceDoc(null, 'seed-prompt-doc-id', 'thesis-group-b'),
        contribution_type: 'seed_prompt',
        file_name: null,
        stage: 'thesis',
        document_key: FileType.SeedPrompt,
    };

    // Thesis business_case document with highest relevance
    const thesisBusinessCaseDoc: SourceDocument = {
        ...getMockSourceDoc('model-high-rel', 'thesis-business-case-id', 'thesis-group-b'),
        contribution_type: 'thesis',
        file_name: 'high-relevance-model_0_business_case.md',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        stage: 'thesis',
        document_key: FileType.business_case,
    };

    // Thesis feature_spec document with lower relevance
    const thesisFeatureSpecDoc: SourceDocument = {
        ...getMockSourceDoc('model-low-rel', 'thesis-feature-spec-id', 'thesis-group-b'),
        contribution_type: 'thesis',
        file_name: 'low-relevance-model_0_feature_spec.md',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        stage: 'thesis',
        document_key: FileType.feature_spec,
    };

    const sourceDocs: SourceDocument[] = [seedPromptDoc, thesisFeatureSpecDoc, thesisBusinessCaseDoc];

    const executeRecipeStep: DialecticRecipeTemplateStep = {
        id: 'execute-step-id-synthesis',
        template_id: 'template-id-456',
        step_number: 2,
        step_key: 'synthesis_generate_synthesis',
        step_slug: 'generate-synthesis',
        step_name: 'Generate Synthesis',
        step_description: 'Generate synthesis document',
        prompt_template_id: 'template-executor-prompt-id',
        prompt_type: 'Turn',
        job_type: 'EXECUTE',
        output_type: FileType.Synthesis,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.feature_spec,
                required: true,
            },
        ],
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
            {
                document_key: FileType.feature_spec,
                relevance: 0.8,
            },
        ],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            documents: [
                {
                    artifact_class: 'rendered_document',
                    file_type: 'markdown',
                    document_key: FileType.Synthesis,
                    template_filename: 'synthesis.md',
                },
            ],
            files_to_generate: [
                {
                    from_document_key: FileType.Synthesis,
                    template_filename: 'synthesis.md',
                },
            ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, parentJobWithSynthesisStage, executeRecipeStep, parentJobWithSynthesisStage.payload.user_jwt);

    assertEquals(childJobs.length, 1, 'Should create exactly one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    assertEquals(isDialecticExecuteJobPayload(job), true, 'EXECUTE recipe steps should create EXECUTE child jobs');
    
    if (isDialecticExecuteJobPayload(job)) {
        const executePayload: DialecticExecuteJobPayload = job;
        assertExists(executePayload.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
        
        // EXECUTE branch should use selectAnchorSourceDocument to select the anchor based on inputs_relevance.
        // The thesis business_case document has relevance 1.0 (highest), so it should be selected as the anchor.
        // sourceAnchorModelSlug should be extracted from thesisBusinessCaseDoc filename ('high-relevance-model').
        // Currently FAILS because EXECUTE branch uses groupDocs[0] (seed_prompt or feature_spec depending on order).
        assertExists(
            executePayload.canonicalPathParams.sourceAnchorModelSlug,
            'canonicalPathParams should include sourceAnchorModelSlug extracted from highest-relevance thesis document'
        );
        assertEquals(
            executePayload.canonicalPathParams.sourceAnchorModelSlug,
            'high-relevance-model',
            'sourceAnchorModelSlug should be extracted from thesis business_case document filename (highest relevance 1.0), not from seed_prompt or first document in group'
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planPerSourceDocumentByLineage throws when recipe has no relevance metadata for required document inputs', () => {
    const mockParentJob = getMockParentJob();
    const parentPayload = mockParentJob.payload;
    if (!parentPayload) {
        throw new Error('Test setup error: mockParentJob.payload cannot be null');
    }

    const parentJobWithAntithesisStage: DialecticJobRow & { payload: DialecticPlanJobPayload } = {
        ...mockParentJob,
        stage_slug: 'antithesis',
        payload: {
            projectId: parentPayload.projectId,
            sessionId: parentPayload.sessionId,
            stageSlug: 'antithesis',
            iterationNumber: parentPayload.iterationNumber,
            model_id: parentPayload.model_id,
            walletId: parentPayload.walletId,
            user_jwt: parentPayload.user_jwt,
        },
    };

    const thesisBusinessCaseDoc: SourceDocument = {
        ...getMockSourceDoc('model-999', 'thesis-business-case-no-rel', 'thesis-group-c'),
        contribution_type: 'thesis',
        file_name: 'gpt-4_0_business_case.md',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        stage: 'thesis',
        document_key: FileType.business_case,
    };

    const thesisFeatureSpecDoc: SourceDocument = {
        ...getMockSourceDoc('model-888', 'thesis-feature-spec-no-rel', 'thesis-group-c'),
        contribution_type: 'thesis',
        file_name: 'claude-3_0_feature_spec.md',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        stage: 'thesis',
        document_key: FileType.feature_spec,
    };

    const sourceDocs: SourceDocument[] = [thesisBusinessCaseDoc, thesisFeatureSpecDoc];

    // Recipe step with document inputs but NO inputs_relevance
    const planRecipeStepNoRelevance: DialecticRecipeTemplateStep = {
        id: 'plan-step-id-no-relevance',
        template_id: 'template-id-789',
        step_number: 1,
        step_key: 'antithesis_prepare_plan_no_relevance',
        step_slug: 'prepare-plan-no-relevance',
        step_name: 'Prepare Plan Without Relevance',
        step_description: 'Test case for missing relevance metadata',
        prompt_template_id: 'template-planner-prompt-id',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.feature_spec,
                required: true,
            },
        ],
        inputs_relevance: [], // NO relevance metadata - should cause error
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        notes: [],
                    },
                },
            ],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    // Should throw error from selectAnchorSourceDocument about missing relevance score
    // Currently FAILS because planner falls back to groupDocs[0] instead of using selectAnchorSourceDocument
    assertThrows(
        () => {
            planPerSourceDocumentByLineage(sourceDocs, parentJobWithAntithesisStage, planRecipeStepNoRelevance, parentJobWithAntithesisStage.payload.user_jwt);
        },
        Error,
        'Missing relevance score',
        'Should throw error when recipe has document inputs but no relevance metadata (no fallback to ordering)'
    );
});

Deno.test('planPerSourceDocumentByLineage handles no_document_inputs_required by passing null anchor to createCanonicalPathParams', () => {
    const mockParentJob = getMockParentJob();
    Object.defineProperty(mockParentJob.payload, 'stageSlug', { value: 'thesis', configurable: true, enumerable: true, writable: true });
    Object.defineProperty(mockParentJob, 'stage_slug', { value: 'thesis', configurable: true, enumerable: true, writable: true });

    const seedPromptDoc: SourceDocument = {
        ...getMockSourceDoc(null, 'seed-prompt-doc-id', null),
        contribution_type: 'seed_prompt',
        file_name: null,
        stage: 'thesis',
        document_key: FileType.SeedPrompt,
    };

    const sourceDocs: SourceDocument[] = [seedPromptDoc];

    const planRecipeStepWithOnlySeedPrompt: DialecticRecipeTemplateStep = {
        id: 'plan-step-thesis-build-header',
        template_id: 'template-id-thesis',
        step_number: 1,
        step_key: 'thesis_build_stage_header',
        step_slug: 'thesis-build-stage-header',
        step_name: 'Build Stage Header',
        step_description: 'Generate HeaderContext for thesis stage',
        prompt_template_id: 'template-planner-prompt-id-thesis',
        prompt_type: 'Planner',
        job_type: 'PLAN',
        output_type: FileType.HeaderContext,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'seed_prompt',
                slug: 'thesis',
                required: true,
            },
        ],
        inputs_relevance: [],
        outputs_required: {
            system_materials: {
                executive_summary: '',
                input_artifacts_summary: '',
                stage_rationale: '',
            },
            header_context_artifact: {
                type: 'header_context',
                document_key: 'header_context',
                artifact_class: 'header_context',
                file_type: 'json',
            },
            context_for_documents: [
                {
                    document_key: FileType.business_case,
                    content_to_include: {
                        field1: '',
                        field2: [],
                    },
                },
            ],
            documents: [],
            assembled_json: [],
            files_to_generate: [],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        parallel_group: null,
        branch_key: null,
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, planRecipeStepWithOnlySeedPrompt, 'user-jwt-123');
    
    assertEquals(childJobs.length, 1, 'Should create one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        assertExists(job.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
        // This test will initially FAIL because planner doesn't handle SelectAnchorResult
        // After implementation, sourceAnchorModelSlug should be undefined because no anchor is passed (no_document_inputs_required)
        assertEquals(
            job.canonicalPathParams.sourceAnchorModelSlug,
            undefined,
            'sourceAnchorModelSlug should be undefined when recipe step has no document inputs'
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planPerSourceDocumentByLineage handles anchor_found by using result.document', () => {
    const mockParentJob = getMockParentJob();
    
    const thesisBusinessCaseDoc: SourceDocument = {
        ...getMockSourceDoc('model-high-rel', 'thesis-business-case-id', 'thesis-group-a'),
        contribution_type: 'thesis',
        file_name: 'gpt-4_0_business_case.md',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        stage: 'thesis',
        document_key: FileType.business_case,
    };

    const sourceDocs: SourceDocument[] = [thesisBusinessCaseDoc];

    const executeRecipeStep: DialecticRecipeStep = {
        id: 'execute-step-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-123',
        step_key: 'test-step-key',
        step_slug: 'test-step-slug',
        step_description: 'Test step',
        step_number: 1,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.ReducedSynthesis,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case,
                required: true,
            },
        ],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'reduced_synthesis.md',
                from_document_key: FileType.ReducedSynthesis,
            }],
        },
    };

    const childJobs = planPerSourceDocumentByLineage(sourceDocs, mockParentJob, executeRecipeStep, 'user-jwt-123');

    assertEquals(childJobs.length, 1, 'Should create one child job');
    const job = childJobs[0];
    assertExists(job, 'Child job should exist');
    if (isDialecticExecuteJobPayload(job)) {
        assertExists(job.canonicalPathParams, 'EXECUTE job should include canonicalPathParams');
        // This test will initially FAIL because planner doesn't handle SelectAnchorResult
        // After implementation, sourceAnchorModelSlug should match the highest-relevance document ('gpt-4')
        assertExists(
            job.canonicalPathParams.sourceAnchorModelSlug,
            'canonicalPathParams should include sourceAnchorModelSlug extracted from highest-relevance document'
        );
        assertEquals(
            job.canonicalPathParams.sourceAnchorModelSlug,
            'gpt-4',
            'sourceAnchorModelSlug should match the highest-relevance document'
        );
    } else {
        throw new Error('Expected EXECUTE job');
    }
});

Deno.test('planPerSourceDocumentByLineage throws on anchor_not_found', () => {
    const mockParentJob = getMockParentJob();
    
    // Create sourceDocs with documents that form groups, but don't match the required document_key
    const wrongDocument: SourceDocument = {
        ...getMockSourceDoc('model-a-id', 'wrong-doc-id', 'group-a'),
        contribution_type: 'thesis',
        file_name: 'gpt-4_0_feature_spec.md',
        storage_path: 'project-123/session_abc/iteration_1/1_thesis/documents',
        stage: 'thesis',
        document_key: FileType.feature_spec, // Wrong document_key - recipe requires business_case
    };

    const sourceDocs: SourceDocument[] = [wrongDocument];

    const executeRecipeStep: DialecticRecipeStep = {
        id: 'execute-step-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        template_id: 'template-id-123',
        step_key: 'test-step-key',
        step_slug: 'test-step-slug',
        step_description: 'Test step',
        step_number: 1,
        step_name: 'test-step',
        prompt_template_id: 'tmpl-12345',
        output_type: FileType.ReducedSynthesis,
        granularity_strategy: 'per_source_document_by_lineage',
        inputs_required: [
            {
                type: 'document',
                slug: 'thesis',
                document_key: FileType.business_case, // Recipe requires business_case
                required: true,
            },
        ],
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        branch_key: null,
        parallel_group: null,
        inputs_relevance: [
            {
                document_key: FileType.business_case,
                relevance: 1.0,
            },
        ],
        outputs_required: {
            documents: [{
                artifact_class: 'rendered_document',
                file_type: 'markdown',
                document_key: FileType.ReducedSynthesis,
                template_filename: 'reduced_synthesis.md',
            }],
            assembled_json: [],
            files_to_generate: [{
                template_filename: 'reduced_synthesis.md',
                from_document_key: FileType.ReducedSynthesis,
            }],
        },
    };

    // Should throw error when anchor document not found (recipe requires business_case but sourceDocs only has feature_spec)
    assertThrows(
        () => {
            planPerSourceDocumentByLineage(sourceDocs, mockParentJob, executeRecipeStep, 'user-jwt-123');
        },
        Error,
        'Anchor document not found',
        'Should throw error when anchor document not found in sourceDocs'
    );
});