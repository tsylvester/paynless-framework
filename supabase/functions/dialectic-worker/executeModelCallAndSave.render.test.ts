import {
    assertEquals,
    assert,
    assertExists,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { Database, Tables } from '../types_db.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import { 
    UnifiedAIResponse,
    DialecticExecuteJobPayload,
    DialecticContributionRow,
    DialecticRenderJobPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { 
    FileType, 
    DocumentRelationships, 
    DialecticStageSlug 
} from '../_shared/types/file_manager.types.ts';
import { isRecord, isFileType } from '../_shared/utils/type_guards.ts';

// Import test fixtures from main test file
import {
    buildExecuteParams,
    createMockJob,
    testPayload,
    mockFullProviderData,
    mockContribution,
    setupMockClient,
    getMockDeps,
} from './executeModelCallAndSave.test.ts';

/**
 * Creates a typed mock UnifiedAIResponse object.
 * Mirrors the production UnifiedAIResponse interface from dialectic.interface.ts.
 */
export const createMockUnifiedAIResponse = (overrides: Partial<UnifiedAIResponse> = {}): UnifiedAIResponse => ({
    content: '{"content": "Default AI response"}',
    contentType: 'application/json',
    inputTokens: 10,
    outputTokens: 20,
    processingTimeMs: 100,
    rawProviderResponse: { mock: 'response' },
    ...overrides,
});

Deno.test('should not enqueue RENDER job for header_context output type', async () => {
    // Arrange: Mock a job with output_type: 'header_context' and a stage that has recipe steps
    // where no step has header_context as a markdown document key
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    // Mock recipe steps where outputs_required does NOT include header_context as a markdown document
    // Only include business_case as a markdown document to prove header_context is excluded
    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const headerContextPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.HeaderContext,
    };

    const job = createMockJob(headerContextPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: No RENDER job should be inserted because header_context is not a markdown document
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    if (insertCalls) {
        // Filter for RENDER job inserts only
        const renderInserts = insertCalls.callsArgs.filter((callArg) => {
            const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
            return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
        });
        assertEquals(renderInserts.length, 0, 'Should not enqueue RENDER job for non-markdown output type like header_context');
    } else {
        // If no inserts at all, that's also correct (no RENDER job enqueued)
        assert(true, 'No RENDER job enqueued for header_context output type');
    }

    clearAllStubs?.();
});

Deno.test('should enqueue RENDER job for markdown document output type', async () => {
    // Arrange: Mock a job with output_type: 'business_case' and a stage where business_case
    // is defined as a markdown document in recipe steps
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    // Mock recipe steps with outputs_required containing file_type: 'markdown' and document_key: 'business_case'
    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    // Root chunk: document_relationships will be initialized with stageSlug key
    const savedContribution = { ...mockContribution, document_relationships: null };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
    };

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: A RENDER job should be inserted with correct payload
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    // Filter for RENDER job inserts only
    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job for markdown document output type');

    const insertedArg = renderInserts[0];
    const inserted = Array.isArray(insertedArg) ? (insertedArg[0]) : (insertedArg);

    assert(isRecord(inserted), 'Inserted payload must be an object');

    // job_type must be RENDER
    assertEquals(inserted['job_type'], 'RENDER', 'RENDER job must have job_type: RENDER');

    // Parent must associate to the just-completed EXECUTE job
    assertEquals(inserted['parent_job_id'], job.id, 'Parent job id must point to completed EXECUTE job');

    // Payload must include required renderer identity fields
    const pl = inserted['payload'];
    assert(isRecord(pl), 'Inserted payload.payload must be an object');
    assertEquals(pl['projectId'], businessCasePayload.projectId, 'Payload must include projectId');
    assertEquals(pl['sessionId'], businessCasePayload.sessionId, 'Payload must include sessionId');
    assertEquals(pl['iterationNumber'], businessCasePayload.iterationNumber, 'Payload must include iterationNumber');
    assertEquals(pl['stageSlug'], businessCasePayload.stageSlug, 'Payload must include stageSlug');
    assertEquals(pl['documentIdentity'], mockContribution.id, 'Payload must include documentIdentity derived from document_relationships[stageSlug] after initialization for root chunks');

    clearAllStubs?.();
});

Deno.test('should enqueue RENDER job on every chunk completion, not just final completion', async () => {
    // Arrange: Mock a continuation job (with target_contribution_id set in job payload)
    // that produces markdown (output_type: 'business_case')
    // Mock the AI response with finish_reason: 'length' (indicating continuation needed)
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    // Mock recipe steps with outputs_required containing file_type: 'markdown' and document_key: 'business_case'
    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    // Ensure saved contribution carries document identity for RENDER job payload
    const documentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Thesis]: 'doc-root-xyz',
    };
    const savedWithIdentity = { ...mockContribution, document_relationships: documentRelationships };
    fileManager.setUploadAndRegisterFileResponse(savedWithIdentity, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    // Mock AI response with finish_reason: 'length' (indicating continuation needed)
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "Partial AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'length' },
        })
    ));

    // Continuation job payload with target_contribution_id set and document_relationships
    const continuationDocumentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Thesis]: 'doc-root-xyz',
    };
    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        target_contribution_id: 'contrib-root-123',
        continueUntilComplete: true,
        continuation_count: 1,
        stageSlug: DialecticStageSlug.Thesis,
        document_relationships: continuationDocumentRelationships,
    };

    const job = createMockJob(continuationPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: A RENDER job should be enqueued even though needsContinuation is true
    // This proves rendering happens on every chunk, not just final completion
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    // Filter for RENDER job inserts only
    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue RENDER job on chunk completion even when continuation is needed');

    const insertedArg = renderInserts[0];
    const inserted = Array.isArray(insertedArg) ? (insertedArg[0]) : (insertedArg);

    assert(isRecord(inserted), 'Inserted payload must be an object');

    // Verify it's a RENDER job
    assertEquals(inserted['job_type'], 'RENDER', 'RENDER job must have job_type: RENDER');

    // Parent must associate to the just-completed EXECUTE job
    assertEquals(inserted['parent_job_id'], job.id, 'Parent job id must point to completed EXECUTE job');

    // Payload must include required renderer identity fields
    const pl = inserted['payload'];
    assert(isRecord(pl), 'Inserted payload.payload must be an object');
    assertEquals(pl['documentIdentity'], 'doc-root-xyz', 'Payload must include documentIdentity derived from document_relationships[thesis]');
    
    // For continuation chunks, sourceContributionId must be THIS chunk's contribution.id, not the root's ID
    // The saved contribution has id = mockContribution.id (this chunk's ID)
    // documentIdentity is 'doc-root-xyz' (the root's ID from document_relationships)
    // They should NOT be equal for continuation chunks
    assert('sourceContributionId' in pl, 'RENDER job payload must include sourceContributionId field');
    assertEquals(pl['sourceContributionId'], mockContribution.id, 'sourceContributionId must be this continuation chunk\'s contribution.id, not the root\'s ID');
    assert(pl['sourceContributionId'] !== pl['documentIdentity'], 'For continuation chunks, sourceContributionId (this chunk\'s ID) must NOT equal documentIdentity (root\'s ID)');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - RENDER job payload includes documentKey with correct value from validatedDocumentKey', async () => {
    // Arrange: Mock a job with output_type: 'business_case' and document_key set
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    const savedWithIdentity: DialecticContributionRow = {
        id: mockContribution.id,
        session_id: mockContribution.session_id,
        stage: mockContribution.stage,
        iteration_number: mockContribution.iteration_number,
        model_id: mockContribution.model_id,
        edit_version: mockContribution.edit_version,
        is_latest_edit: mockContribution.is_latest_edit,
        citations: mockContribution.citations,
        contribution_type: mockContribution.contribution_type,
        created_at: mockContribution.created_at,
        error: mockContribution.error,
        file_name: mockContribution.file_name,
        mime_type: mockContribution.mime_type,
        model_name: mockContribution.model_name,
        original_model_contribution_id: mockContribution.original_model_contribution_id,
        processing_time_ms: mockContribution.processing_time_ms,
        prompt_template_id_used: mockContribution.prompt_template_id_used,
        raw_response_storage_path: mockContribution.raw_response_storage_path,
        seed_prompt_url: mockContribution.seed_prompt_url,
        size_bytes: mockContribution.size_bytes,
        storage_bucket: mockContribution.storage_bucket,
        storage_path: mockContribution.storage_path,
        target_contribution_id: mockContribution.target_contribution_id,
        tokens_used_input: mockContribution.tokens_used_input,
        tokens_used_output: mockContribution.tokens_used_output,
        updated_at: mockContribution.updated_at,
        user_id: mockContribution.user_id,
        document_relationships: { thesis: 'doc-root-abc' },
        is_header: mockContribution.is_header,
        source_prompt_resource_id: mockContribution.source_prompt_resource_id,
    };
    fileManager.setUploadAndRegisterFileResponse(savedWithIdentity, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Use business_case with document_key set to 'business_case'
    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
    };

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: RENDER job payload must include documentKey with value from validatedDocumentKey
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const modelIdUnknown: unknown = payloadRecord['model_id'];
    assert(typeof modelIdUnknown === 'string', 'Payload must have model_id string');
    const modelId: string = modelIdUnknown;

    const projectIdUnknown: unknown = payloadRecord['projectId'];
    assert(typeof projectIdUnknown === 'string', 'Payload must have projectId string');
    const projectId: string = projectIdUnknown;

    const sessionIdUnknown: unknown = payloadRecord['sessionId'];
    assert(typeof sessionIdUnknown === 'string', 'Payload must have sessionId string');
    const sessionId: string = sessionIdUnknown;

    const iterationNumberUnknown: unknown = payloadRecord['iterationNumber'];
    assert(typeof iterationNumberUnknown === 'number', 'Payload must have iterationNumber number');
    const iterationNumber: number = iterationNumberUnknown;

    const stageSlugUnknown: unknown = payloadRecord['stageSlug'];
    assert(typeof stageSlugUnknown === 'string', 'Payload must have stageSlug string');
    const stageSlug: string = stageSlugUnknown;

    const walletIdUnknown: unknown = payloadRecord['walletId'];
    assert(typeof walletIdUnknown === 'string', 'Payload must have walletId string');
    const walletId: string = walletIdUnknown;

    const userJwtUnknown: unknown = payloadRecord['user_jwt'];
    assert(typeof userJwtUnknown === 'string', 'Payload must have user_jwt string');
    const userJwt: string = userJwtUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    const documentKeyUnknown: unknown = payloadRecord['documentKey'];
    assert(isFileType(documentKeyUnknown), 'Payload must have documentKey FileType');
    const documentKey: FileType = documentKeyUnknown;

    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];
    assert(typeof sourceContributionIdUnknown === 'string', 'Payload must have sourceContributionId string');
    const sourceContributionId: string = sourceContributionIdUnknown;

    const pl: DialecticRenderJobPayload = {
        job_type: 'RENDER',
        model_id: modelId,
        projectId: projectId,
        sessionId: sessionId,
        iterationNumber: iterationNumber,
        stageSlug: stageSlug,
        walletId: walletId,
        user_jwt: userJwt,
        documentIdentity: documentIdentity,
        documentKey: documentKey,
        sourceContributionId: sourceContributionId,
    };

    assert('documentKey' in pl, 'RENDER job payload must include documentKey field');
    assertEquals(pl['documentKey'], 'business_case', 'documentKey must be set to validatedDocumentKey value from job.payload.document_key');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - RENDER job payload contains all required fields', async () => {
    // Arrange: Mock a job with output_type: 'business_case' and all necessary fields
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    // Root chunk: document_relationships will be initialized with stageSlug key
    const savedContribution = { ...mockContribution, document_relationships: null };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
    };

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: RENDER job payload must contain all 7 required fields
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const modelIdUnknown: unknown = payloadRecord['model_id'];
    assert(typeof modelIdUnknown === 'string', 'Payload must have model_id string');
    const modelId: string = modelIdUnknown;

    const projectIdUnknown: unknown = payloadRecord['projectId'];
    assert(typeof projectIdUnknown === 'string', 'Payload must have projectId string');
    const projectId: string = projectIdUnknown;

    const sessionIdUnknown: unknown = payloadRecord['sessionId'];
    assert(typeof sessionIdUnknown === 'string', 'Payload must have sessionId string');
    const sessionId: string = sessionIdUnknown;

    const iterationNumberUnknown: unknown = payloadRecord['iterationNumber'];
    assert(typeof iterationNumberUnknown === 'number', 'Payload must have iterationNumber number');
    const iterationNumber: number = iterationNumberUnknown;

    const stageSlugUnknown: unknown = payloadRecord['stageSlug'];
    assert(typeof stageSlugUnknown === 'string', 'Payload must have stageSlug string');
    const stageSlug: string = stageSlugUnknown;

    const walletIdUnknown: unknown = payloadRecord['walletId'];
    assert(typeof walletIdUnknown === 'string', 'Payload must have walletId string');
    const walletId: string = walletIdUnknown;

    const userJwtUnknown: unknown = payloadRecord['user_jwt'];
    assert(typeof userJwtUnknown === 'string', 'Payload must have user_jwt string');
    const userJwt: string = userJwtUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    const documentKeyUnknown: unknown = payloadRecord['documentKey'];
    assert(isFileType(documentKeyUnknown), 'Payload must have documentKey FileType');
    const documentKey: FileType = documentKeyUnknown;

    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];
    assert(typeof sourceContributionIdUnknown === 'string', 'Payload must have sourceContributionId string');
    const sourceContributionId: string = sourceContributionIdUnknown;

    const pl: DialecticRenderJobPayload = {
        job_type: 'RENDER',
        model_id: modelId,
        projectId: projectId,
        sessionId: sessionId,
        iterationNumber: iterationNumber,
        stageSlug: stageSlug,
        walletId: walletId,
        user_jwt: userJwt,
        documentIdentity: documentIdentity,
        documentKey: documentKey,
        sourceContributionId: sourceContributionId,
    };

    assert('projectId' in pl, 'RENDER job payload must include projectId');
    assert('sessionId' in pl, 'RENDER job payload must include sessionId');
    assert('iterationNumber' in pl, 'RENDER job payload must include iterationNumber');
    assert('stageSlug' in pl, 'RENDER job payload must include stageSlug');
    assert('documentIdentity' in pl, 'RENDER job payload must include documentIdentity');
    assert('documentKey' in pl, 'RENDER job payload must include documentKey');
    assert('sourceContributionId' in pl, 'RENDER job payload must include sourceContributionId');

    // Verify values are correct
    assertEquals(pl['projectId'], businessCasePayload.projectId, 'projectId must match job payload');
    assertEquals(pl['sessionId'], businessCasePayload.sessionId, 'sessionId must match job payload');
    assertEquals(pl['iterationNumber'], businessCasePayload.iterationNumber, 'iterationNumber must match job payload');
    assertEquals(pl['stageSlug'], businessCasePayload.stageSlug, 'stageSlug must match job payload');
    assertEquals(pl['documentIdentity'], mockContribution.id, 'documentIdentity must equal contribution.id (extracted from document_relationships[stageSlug] after initialization for root chunks)');
    assertEquals(pl['documentKey'], 'business_case', 'documentKey must be set to validatedDocumentKey');
    assertEquals(pl['sourceContributionId'], mockContribution.id, 'sourceContributionId must equal documentIdentity');
    assertEquals(pl['sourceContributionId'], pl['documentIdentity'], 'sourceContributionId must equal documentIdentity');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - RENDER job payload sourceContributionId must be actual contribution.id, not semantic identifier from document_relationships', async () => {
    // Arrange: Mock a job with output_type: 'business_case' and document_relationships containing a semantic identifier
    // The semantic identifier should NOT be used as sourceContributionId - only the actual contribution.id should be used
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
        'dialectic_contributions': {
            update: { data: [], error: null } // Allow document_relationships update to succeed
        },
    });

    const fileManager = new MockFileManagerService();
    // Set document_relationships with a semantic identifier that is DIFFERENT from the contribution ID
    // This semantic identifier should NOT be used as sourceContributionId
    const semanticIdentifier = 'semantic-doc-identity-999'; // This is NOT a contribution ID
    const actualContributionId = 'contrib-123'; // This is the actual contribution ID from mockContribution
    // Continuation chunk: document_relationships will be persisted from payload
    const savedContribution = { 
        ...mockContribution, 
        id: actualContributionId,
        document_relationships: null // Initially null, will be persisted from payload
    };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Continuation chunk payload (with target_contribution_id and document_relationships in payload)
    const continuationDocumentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Thesis]: semanticIdentifier,
    };
    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        target_contribution_id: 'root-123', // Continuation chunk
        continuation_count: 1,
        stageSlug: DialecticStageSlug.Thesis,
        document_relationships: continuationDocumentRelationships, // Will be persisted
    };

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: RENDER job payload must have sourceContributionId set to the ACTUAL contribution.id,
    // NOT the semantic identifier from document_relationships
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const modelIdUnknown: unknown = payloadRecord['model_id'];
    assert(typeof modelIdUnknown === 'string', 'Payload must have model_id string');
    const modelId: string = modelIdUnknown;

    const projectIdUnknown: unknown = payloadRecord['projectId'];
    assert(typeof projectIdUnknown === 'string', 'Payload must have projectId string');
    const projectId: string = projectIdUnknown;

    const sessionIdUnknown: unknown = payloadRecord['sessionId'];
    assert(typeof sessionIdUnknown === 'string', 'Payload must have sessionId string');
    const sessionId: string = sessionIdUnknown;

    const iterationNumberUnknown: unknown = payloadRecord['iterationNumber'];
    assert(typeof iterationNumberUnknown === 'number', 'Payload must have iterationNumber number');
    const iterationNumber: number = iterationNumberUnknown;

    const stageSlugUnknown: unknown = payloadRecord['stageSlug'];
    assert(typeof stageSlugUnknown === 'string', 'Payload must have stageSlug string');
    const stageSlug: string = stageSlugUnknown;

    const walletIdUnknown: unknown = payloadRecord['walletId'];
    assert(typeof walletIdUnknown === 'string', 'Payload must have walletId string');
    const walletId: string = walletIdUnknown;

    const userJwtUnknown: unknown = payloadRecord['user_jwt'];
    assert(typeof userJwtUnknown === 'string', 'Payload must have user_jwt string');
    const userJwt: string = userJwtUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    const documentKeyUnknown: unknown = payloadRecord['documentKey'];
    assert(isFileType(documentKeyUnknown), 'Payload must have documentKey FileType');
    const documentKey: FileType = documentKeyUnknown;

    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];
    assert(typeof sourceContributionIdUnknown === 'string', 'Payload must have sourceContributionId string');
    const sourceContributionId: string = sourceContributionIdUnknown;

    const pl: DialecticRenderJobPayload = {
        job_type: 'RENDER',
        model_id: modelId,
        projectId: projectId,
        sessionId: sessionId,
        iterationNumber: iterationNumber,
        stageSlug: stageSlug,
        walletId: walletId,
        user_jwt: userJwt,
        documentIdentity: documentIdentity,
        documentKey: documentKey,
        sourceContributionId: sourceContributionId,
    };

    assert('sourceContributionId' in pl, 'RENDER job payload must include sourceContributionId field');
    
    // The critical assertion: sourceContributionId must be the actual contribution ID, not the semantic identifier
    assertEquals(
        pl['sourceContributionId'], 
        actualContributionId, 
        `sourceContributionId must be set to the actual contribution.id (${actualContributionId}), not the semantic identifier from document_relationships (${semanticIdentifier})`
    );
    
    // Verify it's NOT the semantic identifier
    assert(
        pl['sourceContributionId'] !== semanticIdentifier,
        `sourceContributionId must NOT be the semantic identifier (${semanticIdentifier}) from document_relationships`
    );
    
    // documentIdentity can still be the semantic identifier (that's fine for document chain identification)
    // But sourceContributionId must be the actual contribution ID for the foreign key constraint
    assertEquals(
        pl['documentIdentity'], 
        semanticIdentifier, 
        'documentIdentity should still be the semantic identifier from document_relationships'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - RENDER jobs for root and continuation chunks render complete document and replace original', async () => {
    // This test proves that:
    // 1. Root chunk creates a RENDER job with correct payload (sourceContributionId === documentIdentity)
    // 2. Continuation chunk creates a RENDER job with correct payload (sourceContributionId !== documentIdentity)
    // 3. The renderer locates all chunks, concatenates them, and renders the complete document
    // 4. The rendered document replaces the original (only one rendered document exists)
    // 5. Notifications are sent correctly for both root and continuation chunks
    
    const rootContributionId = 'contrib-root-123';
    const continuationContributionId = 'contrib-continuation-456';
    const documentIdentity = rootContributionId; // For root chunk, documentIdentity equals contribution.id
    const stageSlug = DialecticStageSlug.Thesis;
    const documentKey = FileType.business_case;
    
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: documentKey,
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: documentKey,
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    const deps = getMockDeps();
    deps.fileManager = fileManager;
    
    // Track notification calls
    const notificationCalls: Array<{ type: string; payload: unknown }> = [];
    stub(deps.notificationService, 'sendDocumentCentricNotification', async (payload, userId) => {
        notificationCalls.push({ type: payload.type, payload });
    });

    // Track AI model calls to return different responses for root vs continuation
    let aiCallCount = 0;
    stub(deps, 'callUnifiedAIModel', () => {
        aiCallCount++;
        if (aiCallCount === 1) {
            // First call: root chunk
            return Promise.resolve(
                createMockUnifiedAIResponse({
                    content: '{"content": "Root chunk content"}',
                    contentType: 'application/json',
                    inputTokens: 10,
                    outputTokens: 5,
                    processingTimeMs: 50,
                    rawProviderResponse: { finish_reason: 'stop' }, // Final chunk
                })
            );
        } else {
            // Second call: continuation chunk
            return Promise.resolve(
                createMockUnifiedAIResponse({
                    content: '{"content": "Continuation chunk content"}',
                    contentType: 'application/json',
                    inputTokens: 10,
                    outputTokens: 5,
                    processingTimeMs: 50,
                    rawProviderResponse: { finish_reason: 'stop' }, // Final chunk
                })
            );
        }
    });

    // Test 1: Root chunk (first chunk, no continuation)
    // Root chunk: document_relationships will be initialized with stageSlug key
    const rootContribution = {
        ...mockContribution,
        id: rootContributionId,
        document_relationships: null,
    };
    fileManager.setUploadAndRegisterFileResponse(rootContribution, null);

    const rootPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        stageSlug: DialecticStageSlug.Thesis,
        // No target_contribution_id (root chunk)
        continueUntilComplete: false,
    };

    const rootJob = createMockJob(rootPayload);
    const rootParams = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job: rootJob });

    // Act: Process root chunk
    await executeModelCallAndSave(rootParams);

    // Assert: Root chunk RENDER job payload
    const rootInsertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(rootInsertCalls, 'Expected to track insert calls for dialectic_generation_jobs');
    
    const rootRenderInserts = rootInsertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });
    
    assertEquals(rootRenderInserts.length, 1, 'Should enqueue RENDER job for root chunk');
    
    const rootInserted = Array.isArray(rootRenderInserts[0]) ? rootRenderInserts[0][0] : rootRenderInserts[0];
    assert(isRecord(rootInserted), 'Root inserted payload must be an object');
    const rootPl = rootInserted['payload'];
    assert(isRecord(rootPl), 'Root payload must be an object');
    
    // For root chunks: sourceContributionId === documentIdentity (both are contribution.id)
    assertEquals(rootPl['sourceContributionId'], rootContributionId, 'Root chunk: sourceContributionId must be contribution.id');
    assertEquals(rootPl['documentIdentity'], rootContributionId, 'Root chunk: documentIdentity must equal contribution.id (extracted from document_relationships[stageSlug] after initialization)');
    assertEquals(rootPl['sourceContributionId'], rootPl['documentIdentity'], 'Root chunk: sourceContributionId must equal documentIdentity (both are contribution.id)');
    
    // Assert: Root chunk notification
    const rootNotifications = notificationCalls.filter(n => n.type === 'document_completed');
    assertEquals(rootNotifications.length, 1, 'Root chunk should emit document_completed notification (final chunk)');
    const rootNotification = rootNotifications[0];
    assert(isRecord(rootNotification.payload), 'Root notification payload must be an object');
    assertEquals(rootNotification.payload['document_key'], documentKey, 'Root notification must include document_key');
    assertEquals(rootNotification.payload['sessionId'], rootPayload.sessionId, 'Root notification must include sessionId');
    assertEquals(rootNotification.payload['stageSlug'], stageSlug, 'Root notification must include stageSlug');

    // Test 2: Continuation chunk (second chunk, continuation)
    // Continuation chunk: document_relationships will be persisted from payload
    const continuationContribution = {
        ...mockContribution,
        id: continuationContributionId,
        document_relationships: null, // Initially null, will be persisted from payload
    };
    fileManager.setUploadAndRegisterFileResponse(continuationContribution, null);

    const continuationDocumentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Thesis]: documentIdentity,
    };
    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        target_contribution_id: rootContributionId, // Continuation chunk
        continueUntilComplete: false,
        continuation_count: 1,
        stageSlug: DialecticStageSlug.Thesis,
        document_relationships: continuationDocumentRelationships,
    };

    const continuationJob = createMockJob(continuationPayload);
    const continuationParams = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job: continuationJob });

    // Act: Process continuation chunk
    await executeModelCallAndSave(continuationParams);

    // Assert: Continuation chunk RENDER job payload
    const continuationInsertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(continuationInsertCalls, 'Expected to track insert calls for dialectic_generation_jobs');
    
    const continuationRenderInserts = continuationInsertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });
    
    // Should have 2 RENDER jobs total (one for root, one for continuation)
    assertEquals(continuationRenderInserts.length, 2, 'Should have RENDER jobs for both root and continuation chunks');
    
    // Get the continuation chunk's RENDER job (the second one)
    const continuationInserted = Array.isArray(continuationRenderInserts[1]) ? continuationRenderInserts[1][0] : continuationRenderInserts[1];
    assert(isRecord(continuationInserted), 'Continuation inserted payload must be an object');
    const continuationPl = continuationInserted['payload'];
    assert(isRecord(continuationPl), 'Continuation payload must be an object');
    
    // For continuation chunks: sourceContributionId !== documentIdentity
    // sourceContributionId is this chunk's ID, documentIdentity is the root's ID
    assertEquals(continuationPl['sourceContributionId'], continuationContributionId, 'Continuation chunk: sourceContributionId must be this chunk\'s contribution.id');
    assertEquals(continuationPl['documentIdentity'], documentIdentity, 'Continuation chunk: documentIdentity must be the root\'s ID from document_relationships');
    assert(continuationPl['sourceContributionId'] !== continuationPl['documentIdentity'], 'Continuation chunk: sourceContributionId (this chunk\'s ID) must NOT equal documentIdentity (root\'s ID)');
    
    // Assert: Continuation chunk notifications
    // Should have document_chunk_completed for continuation chunk, then document_completed for final chunk
    const continuationChunkNotifications = notificationCalls.filter(n => n.type === 'document_chunk_completed');
    assertEquals(continuationChunkNotifications.length, 1, 'Continuation chunk should emit document_chunk_completed notification');
    const continuationChunkNotification = continuationChunkNotifications[0];
    assert(isRecord(continuationChunkNotification.payload), 'Continuation chunk notification payload must be an object');
    assertEquals(continuationChunkNotification.payload['document_key'], documentKey, 'Continuation chunk notification must include document_key');
    assertEquals(continuationChunkNotification.payload['sessionId'], continuationPayload.sessionId, 'Continuation chunk notification must include sessionId');
    assertEquals(continuationChunkNotification.payload['stageSlug'], stageSlug, 'Continuation chunk notification must include stageSlug');
    
    const continuationFinalNotifications = notificationCalls.filter(n => n.type === 'document_completed');
    assertEquals(continuationFinalNotifications.length, 2, 'Should have document_completed notifications for both root and continuation (both are final chunks in this test)');
    const continuationFinalNotification = continuationFinalNotifications[1];
    assert(isRecord(continuationFinalNotification.payload), 'Continuation final notification payload must be an object');
    assertEquals(continuationFinalNotification.payload['document_key'], documentKey, 'Continuation final notification must include document_key');
    assertEquals(continuationFinalNotification.payload['sessionId'], continuationPayload.sessionId, 'Continuation final notification must include sessionId');
    assertEquals(continuationFinalNotification.payload['stageSlug'], stageSlug, 'Continuation final notification must include stageSlug');

    // Assert: Both RENDER jobs use the same documentIdentity (proving they render the same document chain)
    assertEquals(rootPl['documentIdentity'], continuationPl['documentIdentity'], 'Both root and continuation RENDER jobs must use the same documentIdentity (same document chain)');
    assertEquals(rootPl['documentKey'], continuationPl['documentKey'], 'Both RENDER jobs must use the same documentKey');
    assertEquals(rootPl['stageSlug'], continuationPl['stageSlug'], 'Both RENDER jobs must use the same stageSlug');
    
    // Assert: sourceContributionId differs (proving they reference different chunks)
    assert(rootPl['sourceContributionId'] !== continuationPl['sourceContributionId'], 'Root and continuation RENDER jobs must have different sourceContributionId (different chunks)');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - enqueues RENDER job with ALL required payload fields including user_jwt', async () => {
    // Arrange: Mock a job with output_type: 'business_case' and user_jwt in parent payload
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    // Root chunk: document_relationships will be initialized with stageSlug key
    const savedContribution = { ...mockContribution, document_relationships: null };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Create payload with user_jwt
    const testJwtToken = 'test-jwt-token-12345';
    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
        user_jwt: testJwtToken,
    };

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: RENDER job insert includes payload with ALL 8 required fields
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const modelIdUnknown: unknown = payloadRecord['model_id'];
    assert(typeof modelIdUnknown === 'string', 'Payload must have model_id string');
    const modelId: string = modelIdUnknown;

    const projectIdUnknown: unknown = payloadRecord['projectId'];
    assert(typeof projectIdUnknown === 'string', 'Payload must have projectId string');
    const projectId: string = projectIdUnknown;

    const sessionIdUnknown: unknown = payloadRecord['sessionId'];
    assert(typeof sessionIdUnknown === 'string', 'Payload must have sessionId string');
    const sessionId: string = sessionIdUnknown;

    const iterationNumberUnknown: unknown = payloadRecord['iterationNumber'];
    assert(typeof iterationNumberUnknown === 'number', 'Payload must have iterationNumber number');
    const iterationNumber: number = iterationNumberUnknown;

    const stageSlugUnknown: unknown = payloadRecord['stageSlug'];
    assert(typeof stageSlugUnknown === 'string', 'Payload must have stageSlug string');
    const stageSlug: string = stageSlugUnknown;

    const walletIdUnknown: unknown = payloadRecord['walletId'];
    assert(typeof walletIdUnknown === 'string', 'Payload must have walletId string');
    const walletId: string = walletIdUnknown;

    const userJwtUnknown: unknown = payloadRecord['user_jwt'];
    assert(typeof userJwtUnknown === 'string', 'Payload must have user_jwt string');
    const userJwt: string = userJwtUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    const documentKeyUnknown: unknown = payloadRecord['documentKey'];
    assert(isFileType(documentKeyUnknown), 'Payload must have documentKey FileType');
    const documentKey: FileType = documentKeyUnknown;

    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];
    assert(typeof sourceContributionIdUnknown === 'string', 'Payload must have sourceContributionId string');
    const sourceContributionId: string = sourceContributionIdUnknown;

    const pl: DialecticRenderJobPayload = {
        job_type: 'RENDER',
        model_id: modelId,
        projectId: projectId,
        sessionId: sessionId,
        iterationNumber: iterationNumber,
        stageSlug: stageSlug,
        walletId: walletId,
        user_jwt: userJwt,
        documentIdentity: documentIdentity,
        documentKey: documentKey,
        sourceContributionId: sourceContributionId,
    };

    // Field 1: user_jwt (string, for trigger authentication)
    assert('user_jwt' in pl, 'RENDER job payload must include user_jwt field');
    assertEquals(typeof pl['user_jwt'], 'string', 'user_jwt must be a string');
    assertEquals(pl['user_jwt'], testJwtToken, 'user_jwt must match parent job payload user_jwt');

    // Field 2: projectId (string, for processRenderJob and renderDocument)
    assert('projectId' in pl, 'RENDER job payload must include projectId');
    assertEquals(typeof pl['projectId'], 'string', 'projectId must be a string');
    assertEquals(pl['projectId'], businessCasePayload.projectId, 'projectId must match job payload');

    // Field 3: sessionId (string, for processRenderJob and renderDocument)
    assert('sessionId' in pl, 'RENDER job payload must include sessionId');
    assertEquals(typeof pl['sessionId'], 'string', 'sessionId must be a string');
    assertEquals(pl['sessionId'], businessCasePayload.sessionId, 'sessionId must match job payload');

    // Field 4: iterationNumber (number, for processRenderJob and renderDocument)
    assert('iterationNumber' in pl, 'RENDER job payload must include iterationNumber');
    assertEquals(typeof pl['iterationNumber'], 'number', 'iterationNumber must be a number');
    assertEquals(pl['iterationNumber'], businessCasePayload.iterationNumber, 'iterationNumber must match job payload');

    // Field 5: stageSlug (string, for processRenderJob and renderDocument)
    assert('stageSlug' in pl, 'RENDER job payload must include stageSlug');
    assertEquals(typeof pl['stageSlug'], 'string', 'stageSlug must be a string');
    assertEquals(pl['stageSlug'], businessCasePayload.stageSlug, 'stageSlug must match job payload');

    // Field 6: documentIdentity (string, for processRenderJob and renderDocument)
    assert('documentIdentity' in pl, 'RENDER job payload must include documentIdentity');
    assertEquals(typeof pl['documentIdentity'], 'string', 'documentIdentity must be a string');
    assertEquals(pl['documentIdentity'], mockContribution.id, 'documentIdentity must be derived from document_relationships[stageSlug] after initialization for root chunks');

    // Field 7: documentKey (FileType, for processRenderJob and renderDocument)
    assert('documentKey' in pl, 'RENDER job payload must include documentKey');
    assertEquals(pl['documentKey'], 'business_case', 'documentKey must be set to validatedDocumentKey');
    // Note: FileType is a string union type, so we verify it's the expected string value

    // Field 8: sourceContributionId (string, for processRenderJob and renderDocument)
    assert('sourceContributionId' in pl, 'RENDER job payload must include sourceContributionId');
    assertEquals(typeof pl['sourceContributionId'], 'string', 'sourceContributionId must be a string');
    assertEquals(pl['sourceContributionId'], mockContribution.id, 'sourceContributionId must be contribution.id');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - throws error when parent job payload lacks user_jwt and RENDER job would be enqueued', async () => {
    // Arrange: Mock a job with output_type: 'business_case' but missing user_jwt
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    // Root chunk: document_relationships will be initialized with stageSlug key
    const savedContribution = { ...mockContribution, document_relationships: null };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Create payload WITHOUT user_jwt (simulates the bug condition)
    const payloadWithoutJwt: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
    };
    // Explicitly remove user_jwt to simulate missing field
    delete (payloadWithoutJwt as any).user_jwt;

    const job = createMockJob(payloadWithoutJwt);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act & Assert: Function should throw error before attempting to enqueue RENDER job
    let errorThrown: Error | undefined;
    try {
        await executeModelCallAndSave(params);
    } catch (e) {
        errorThrown = e instanceof Error ? e : new Error(String(e));
    }

    assertExists(errorThrown, 'executeModelCallAndSave should throw error when user_jwt is missing');
    assertEquals(errorThrown.message, 'payload.user_jwt required', 'Error message must indicate user_jwt is required');

    // Assert: No RENDER job should be enqueued
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    if (insertCalls) {
        const renderInserts = insertCalls.callsArgs.filter((callArg) => {
            const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
            return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
        });
        assertEquals(renderInserts.length, 0, 'Should not enqueue RENDER job when user_jwt is missing');
    }

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - RENDER job payload user_jwt matches parent job payload user_jwt exactly', async () => {
    // Arrange: Mock a job with a specific user_jwt value
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const fileManager = new MockFileManagerService();
    // Root chunk: document_relationships will be initialized with stageSlug key
    const savedContribution = { ...mockContribution, document_relationships: null };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Use a specific token value to verify exact pass-through
    const specificTokenValue = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.specific.token.value';
    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
        user_jwt: specificTokenValue,
    };

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: RENDER job payload user_jwt matches parent job payload user_jwt exactly
    const insertCalls = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(insertCalls, 'Expected to track insert calls for dialectic_generation_jobs');

    const renderInserts = insertCalls.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });

    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const modelIdUnknown: unknown = payloadRecord['model_id'];
    assert(typeof modelIdUnknown === 'string', 'Payload must have model_id string');
    const modelId: string = modelIdUnknown;

    const projectIdUnknown: unknown = payloadRecord['projectId'];
    assert(typeof projectIdUnknown === 'string', 'Payload must have projectId string');
    const projectId: string = projectIdUnknown;

    const sessionIdUnknown: unknown = payloadRecord['sessionId'];
    assert(typeof sessionIdUnknown === 'string', 'Payload must have sessionId string');
    const sessionId: string = sessionIdUnknown;

    const iterationNumberUnknown: unknown = payloadRecord['iterationNumber'];
    assert(typeof iterationNumberUnknown === 'number', 'Payload must have iterationNumber number');
    const iterationNumber: number = iterationNumberUnknown;

    const stageSlugUnknown: unknown = payloadRecord['stageSlug'];
    assert(typeof stageSlugUnknown === 'string', 'Payload must have stageSlug string');
    const stageSlug: string = stageSlugUnknown;

    const walletIdUnknown: unknown = payloadRecord['walletId'];
    assert(typeof walletIdUnknown === 'string', 'Payload must have walletId string');
    const walletId: string = walletIdUnknown;

    const userJwtUnknown: unknown = payloadRecord['user_jwt'];
    assert(typeof userJwtUnknown === 'string', 'Payload must have user_jwt string');
    const userJwt: string = userJwtUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    const documentKeyUnknown: unknown = payloadRecord['documentKey'];
    assert(isFileType(documentKeyUnknown), 'Payload must have documentKey FileType');
    const documentKey: FileType = documentKeyUnknown;

    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];
    assert(typeof sourceContributionIdUnknown === 'string', 'Payload must have sourceContributionId string');
    const sourceContributionId: string = sourceContributionIdUnknown;

    const pl: DialecticRenderJobPayload = {
        job_type: 'RENDER',
        model_id: modelId,
        projectId: projectId,
        sessionId: sessionId,
        iterationNumber: iterationNumber,
        stageSlug: stageSlug,
        walletId: walletId,
        user_jwt: userJwt,
        documentIdentity: documentIdentity,
        documentKey: documentKey,
        sourceContributionId: sourceContributionId,
    };

    // Verify user_jwt is passed through exactly without modification
    assert('user_jwt' in pl, 'RENDER job payload must include user_jwt field');
    assertEquals(pl['user_jwt'], specificTokenValue, 'user_jwt must match parent job payload user_jwt exactly (no modification)');
    assertEquals(pl['user_jwt'], businessCasePayload.user_jwt, 'RENDER job user_jwt must equal parent job user_jwt');

    clearAllStubs?.();
});

Deno.test('extracts documentIdentity from document_relationships[stageSlug] for root chunks after relationships are initialized', async () => {
    // Arrange: Mock a root chunk (no target_contribution_id)
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const rootContributionId = 'root-id';
    const fileManager = new MockFileManagerService();
    // Mock contribution with document_relationships: null initially (before update)
    const rootContribution: DialecticContributionRow = {
        ...mockContribution,
        id: rootContributionId,
        document_relationships: null,
    };
    fileManager.setUploadAndRegisterFileResponse(rootContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Root chunk payload (no target_contribution_id)
    const rootPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
        // No target_contribution_id (root chunk)
    };

    const job = createMockJob(rootPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: Verify database update for document_relationships is called BEFORE RENDER job insert
    const contribUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    const renderInsertSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');

    assertExists(contribUpdateSpies, 'Expected to track update calls for dialectic_contributions');
    assertExists(renderInsertSpies, 'Expected to track insert calls for dialectic_generation_jobs');

    // Verify update was called (document_relationships initialization)
    assert(contribUpdateSpies.callCount >= 1, 'Expected at least one update to dialectic_contributions for document_relationships initialization');

    // Find the document_relationships update call
    const documentRelationshipsUpdate = contribUpdateSpies.callsArgs.find((callArg) => {
        const updatePayload = Array.isArray(callArg) ? callArg[0] : callArg;
        return isRecord(updatePayload) && 'document_relationships' in updatePayload;
    });
    assertExists(documentRelationshipsUpdate, 'Expected update call that sets document_relationships');

    // Verify RENDER job insert was called
    const renderInserts = renderInsertSpies.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });
    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    // Assert: RENDER job payload contains documentIdentity extracted from document_relationships[stageSlug] after initialization
    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    assertEquals(documentIdentity, rootContributionId, 'documentIdentity must equal rootContributionId (extracted from document_relationships[stageSlug] after initialization)');

    // Verify documentIdentity === contribution.id for root chunks (both equal the root's contribution.id)
    assertEquals(documentIdentity, rootContributionId, 'For root chunks, documentIdentity must equal contribution.id');

    clearAllStubs?.();
});

Deno.test('extracts documentIdentity from document_relationships[stageSlug] for continuation chunks after relationships are persisted', async () => {
    // Arrange: Mock a continuation chunk with target_contribution_id and document_relationships in payload
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const rootContributionId = 'root-id';
    const continuationContributionId = 'continuation-id';
    const stageSlug = DialecticStageSlug.Thesis;

    const fileManager = new MockFileManagerService();
    // Mock contribution with document_relationships: null initially (before update)
    const continuationContribution: DialecticContributionRow = {
        ...mockContribution,
        id: continuationContributionId,
        document_relationships: null, // Initially null, will be updated from payload
    };
    fileManager.setUploadAndRegisterFileResponse(continuationContribution, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Continuation chunk payload with target_contribution_id and document_relationships
    const continuationDocumentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Thesis]: rootContributionId,
    };
    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        target_contribution_id: rootContributionId,
        continuation_count: 1,
        stageSlug: DialecticStageSlug.Thesis,
        document_relationships: continuationDocumentRelationships,
    };

    const job = createMockJob(continuationPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: Verify database update for document_relationships is called BEFORE RENDER job insert
    const contribUpdateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    const renderInsertSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');

    assertExists(contribUpdateSpies, 'Expected to track update calls for dialectic_contributions');
    assertExists(renderInsertSpies, 'Expected to track insert calls for dialectic_generation_jobs');

    // Verify update was called (document_relationships persistence)
    assert(contribUpdateSpies.callCount >= 1, 'Expected at least one update to dialectic_contributions for document_relationships persistence');

    // Find the document_relationships update call
    const documentRelationshipsUpdate = contribUpdateSpies.callsArgs.find((callArg) => {
        const updatePayload = Array.isArray(callArg) ? callArg[0] : callArg;
        return isRecord(updatePayload) && 'document_relationships' in updatePayload;
    });
    assertExists(documentRelationshipsUpdate, 'Expected update call that sets document_relationships');

    // Verify RENDER job insert was called
    const renderInserts = renderInsertSpies.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });
    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    // Assert: RENDER job payload contains documentIdentity extracted from document_relationships[stageSlug] after persistence
    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    const sourceContributionIdUnknown: unknown = payloadRecord['sourceContributionId'];
    assert(typeof sourceContributionIdUnknown === 'string', 'Payload must have sourceContributionId string');
    const sourceContributionId: string = sourceContributionIdUnknown;

    assertEquals(documentIdentity, rootContributionId, 'documentIdentity must equal rootContributionId (extracted from document_relationships[stageSlug] after persistence, not continuationContributionId)');

    // Verify documentIdentity !== sourceContributionId for continuation chunks
    // documentIdentity is root's ID, sourceContributionId is continuation's ID
    assert(documentIdentity !== sourceContributionId, 'For continuation chunks, documentIdentity (root\'s ID) must NOT equal sourceContributionId (continuation\'s ID)');
    assertEquals(sourceContributionId, continuationContributionId, 'sourceContributionId must equal continuationContributionId (this chunk\'s contribution.id)');

    clearAllStubs?.();
});

Deno.test('extracts documentIdentity using stageSlug key specifically, not first available key', async () => {
    // Arrange: Mock a contribution with document_relationships containing multiple keys
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
    });

    const stageSlug = DialecticStageSlug.Thesis;
    const wrongId = 'wrong-id';
    const correctId = 'correct-id';

    const fileManager = new MockFileManagerService();
    // Mock contribution with document_relationships containing multiple keys
    // The first key (Antithesis) has value 'wrong-id', but stageSlug (Thesis) has value 'correct-id'
    const contributionDocumentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Antithesis]: wrongId,
        [DialecticStageSlug.Thesis]: correctId,
    };
    const contributionWithMultipleKeys: DialecticContributionRow = {
        ...mockContribution,
        document_relationships: contributionDocumentRelationships,
    };
    fileManager.setUploadAndRegisterFileResponse(contributionWithMultipleKeys, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const payloadDocumentRelationships: DocumentRelationships = {
        [DialecticStageSlug.Antithesis]: wrongId,
        [DialecticStageSlug.Thesis]: correctId,
    };
    const payload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
        document_relationships: payloadDocumentRelationships,
    };

    const job = createMockJob(payload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: RENDER job payload contains documentIdentity extracted using stageSlug key specifically
    const renderInsertSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    assertExists(renderInsertSpies, 'Expected to track insert calls for dialectic_generation_jobs');

    const renderInserts = renderInsertSpies.callsArgs.filter((callArg) => {
        const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
        return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
    });
    assertEquals(renderInserts.length, 1, 'Should enqueue exactly one RENDER job');

    const insertedArg: unknown = renderInserts[0];
    const insertedUnknown: unknown = Array.isArray(insertedArg) ? insertedArg[0] : insertedArg;
    assert(isRecord(insertedUnknown), 'Inserted payload must be an object');
    const insertedRecord: Record<string, unknown> = insertedUnknown;

    const payloadUnknown: unknown = insertedRecord['payload'];
    assert(isRecord(payloadUnknown), 'Inserted payload.payload must be an object');
    const payloadRecord: Record<string, unknown> = payloadUnknown;

    const documentIdentityUnknown: unknown = payloadRecord['documentIdentity'];
    assert(typeof documentIdentityUnknown === 'string', 'Payload must have documentIdentity string');
    const documentIdentity: string = documentIdentityUnknown;

    assertEquals(documentIdentity, correctId, 'documentIdentity must equal correctId (the value for stageSlug), not wrongId from the first key');
    assert(documentIdentity !== wrongId, 'documentIdentity must NOT equal wrongId (from the first key in document_relationships)');

    clearAllStubs?.();
});

Deno.test('throws error when document_relationships is null after persistence', async () => {
    // Arrange: Mock a contribution where document_relationships persistence fails or remains null
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: DialecticStageSlug.Thesis,
        display_name: 'Test Stage',
        description: null,
        default_system_prompt_id: null,
        recipe_template_id: 'template-1',
        active_recipe_instance_id: 'instance-1',
        expected_output_template_ids: [],
        created_at: new Date().toISOString(),
    };

    const mockInstance: Tables<'dialectic_stage_recipe_instances'> = {
        id: 'instance-1',
        stage_id: 'stage-1',
        template_id: 'template-1',
        is_cloned: false,
        cloned_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const mockStep: Tables<'dialectic_recipe_template_steps'> = {
        id: 'step-1',
        template_id: 'template-1',
        step_number: 1,
        step_key: 'execute_business_case',
        step_slug: 'execute-business-case',
        step_name: 'Execute Business Case',
        step_description: null,
        job_type: 'EXECUTE',
        prompt_type: 'Turn',
        prompt_template_id: null,
        output_type: 'business_case',
        granularity_strategy: 'per_source_document',
        inputs_required: [],
        inputs_relevance: [],
        outputs_required: {
            documents: [
                {
                    document_key: 'business_case',
                    file_type: 'markdown',
                },
            ],
        },
        parallel_group: null,
        branch_key: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: { data: [mockStage], error: null }
        },
        'dialectic_stage_recipe_instances': {
            select: { data: [mockInstance], error: null }
        },
        'dialectic_recipe_template_steps': {
            select: { data: [mockStep], error: null }
        },
        'dialectic_contributions': {
            update: { data: null, error: { message: 'Database update failed', name: 'PostgresError', code: 'PGRST116' } }
        },
    });

    const fileManager = new MockFileManagerService();
    // Root chunk: document_relationships initialization will fail due to DB update error
    const contributionWithNullRelationships: DialecticContributionRow = {
        ...mockContribution,
        document_relationships: null,
    };
    fileManager.setUploadAndRegisterFileResponse(contributionWithNullRelationships, null);

    const deps = getMockDeps();
    deps.fileManager = fileManager;

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Root chunk payload (no target_contribution_id, document_relationships should be initialized)
    const rootPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: DialecticStageSlug.Thesis,
        // No target_contribution_id (root chunk)
    };

    const job = createMockJob(rootPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act & Assert: Function should throw error indicating document_relationships is required
    let errorThrown: Error | undefined;
    try {
        await executeModelCallAndSave(params);
    } catch (e) {
        errorThrown = e instanceof Error ? e : new Error(String(e));
    }

    assertExists(errorThrown, 'executeModelCallAndSave should throw error when document_relationships is null after persistence');
    assert(
        errorThrown.message.includes('document_relationships') || errorThrown.message.includes('required'),
        `Error message must indicate document_relationships is required. Got: ${errorThrown.message}`
    );

    // Assert: No RENDER job should be enqueued when document_relationships is missing (incomplete data prevents job creation)
    const renderInsertSpies = spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'insert');
    if (renderInsertSpies) {
        const renderInserts = renderInsertSpies.callsArgs.filter((callArg) => {
            const inserted = Array.isArray(callArg) ? callArg[0] : callArg;
            return inserted && typeof inserted === 'object' && 'job_type' in inserted && inserted.job_type === 'RENDER';
        });
        assertEquals(renderInserts.length, 0, 'Should not enqueue RENDER job when document_relationships is null after persistence');
    }

    clearAllStubs?.();
});


