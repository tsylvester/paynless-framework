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

    clearAllStubs?.();
});

