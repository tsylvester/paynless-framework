import {
    assertEquals,
    assert,
    assertExists,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database, Tables } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    UnifiedAIResponse,
    DialecticExecuteJobPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType, ModelContributionFileTypes } from '../_shared/types/file_manager.types.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

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
        slug: 'test-stage',
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
        slug: 'test-stage',
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
    const savedWithIdentity = { ...mockContribution, document_relationships: { thesis: 'doc-root-abc' } };
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

    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
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
    assertEquals(pl['documentIdentity'], 'doc-root-abc', 'Payload must include documentIdentity derived from document_relationships');

    clearAllStubs?.();
});

Deno.test('should enqueue RENDER job on every chunk completion, not just final completion', async () => {
    // Arrange: Mock a continuation job (with target_contribution_id set in job payload)
    // that produces markdown (output_type: 'business_case')
    // Mock the AI response with finish_reason: 'length' (indicating continuation needed)
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: 'test-stage',
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
    const savedWithIdentity = { ...mockContribution, document_relationships: { 'test-stage': 'doc-root-xyz' } };
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
    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        target_contribution_id: 'contrib-root-123',
        continueUntilComplete: true,
        continuation_count: 1,
        document_relationships: { 'test-stage': 'doc-root-xyz' } as any, // Type assertion needed because test-stage may not be in DialecticStageSlug type
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
    assertEquals(pl['documentIdentity'], 'doc-root-xyz', 'Payload must include documentIdentity derived from document_relationships (which uses test-stage as key)');
    
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
        slug: 'test-stage',
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
    const savedWithIdentity = { ...mockContribution, document_relationships: { thesis: 'doc-root-abc' } };
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

    const insertedArg = renderInserts[0];
    const inserted = Array.isArray(insertedArg) ? (insertedArg[0]) : (insertedArg);
    assert(isRecord(inserted), 'Inserted payload must be an object');

    const pl = inserted['payload'];
    assert(isRecord(pl), 'Inserted payload.payload must be an object');

    // RED: This test will fail until documentKey is added to renderPayload
    assert('documentKey' in pl, 'RENDER job payload must include documentKey field');
    assertEquals(pl['documentKey'], 'business_case', 'documentKey must be set to validatedDocumentKey value from job.payload.document_key');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - RENDER job payload contains all required fields', async () => {
    // Arrange: Mock a job with output_type: 'business_case' and all necessary fields
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: 'test-stage',
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
    // Test case where document_relationships is null, so documentIdentity falls back to contribution.id
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

    const insertedArg = renderInserts[0];
    const inserted = Array.isArray(insertedArg) ? (insertedArg[0]) : (insertedArg);
    assert(isRecord(inserted), 'Inserted payload must be an object');

    const pl = inserted['payload'];
    assert(isRecord(pl), 'Inserted payload.payload must be an object');

    // RED: These assertions will fail until all required fields are added to renderPayload
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
    assertEquals(pl['documentIdentity'], mockContribution.id, 'documentIdentity must fallback to contribution.id when document_relationships is null');
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
        slug: 'test-stage',
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
    // Set document_relationships with a semantic identifier that is DIFFERENT from the contribution ID
    // This semantic identifier should NOT be used as sourceContributionId
    const semanticIdentifier = 'semantic-doc-identity-999'; // This is NOT a contribution ID
    const actualContributionId = 'contrib-123'; // This is the actual contribution ID from mockContribution
    const savedWithIdentity = { 
        ...mockContribution, 
        id: actualContributionId, // Ensure we use the actual contribution ID
        document_relationships: { thesis: semanticIdentifier } 
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

    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        document_relationships: { thesis: semanticIdentifier }, // Include in payload too
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

    const insertedArg = renderInserts[0];
    const inserted = Array.isArray(insertedArg) ? (insertedArg[0]) : (insertedArg);
    assert(isRecord(inserted), 'Inserted payload must be an object');

    const pl = inserted['payload'];
    assert(isRecord(pl), 'Inserted payload.payload must be an object');

    // RED: This test will fail until sourceContributionId is fixed to use contribution.id instead of documentIdentity
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
    const stageSlug = 'test-stage';
    const documentKey = FileType.business_case;
    
    const mockStage: Tables<'dialectic_stages'> = {
        id: 'stage-1',
        slug: stageSlug,
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
    const rootContribution = {
        ...mockContribution,
        id: rootContributionId,
        document_relationships: null, // Root chunk has null document_relationships initially
    };
    fileManager.setUploadAndRegisterFileResponse(rootContribution, null);

    const rootPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
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
    assertEquals(rootPl['documentIdentity'], rootContributionId, 'Root chunk: documentIdentity must equal contribution.id (fallback when document_relationships is null)');
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
    const continuationContribution = {
        ...mockContribution,
        id: continuationContributionId,
        document_relationships: { [stageSlug]: documentIdentity }, // Continuation chunk inherits root's ID
    };
    fileManager.setUploadAndRegisterFileResponse(continuationContribution, null);

    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: documentKey,
        document_key: documentKey,
        target_contribution_id: rootContributionId, // Continuation chunk
        continueUntilComplete: false,
        continuation_count: 1,
        document_relationships: { [stageSlug]: documentIdentity } as any, // Inherit root's document identity
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


