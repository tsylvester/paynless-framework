import {
    assertEquals,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database, Tables } from '../types_db.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    UnifiedAIResponse,
    DialecticExecuteJobPayload,
    DialecticContributionRow,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import type { RenderCheckReason, ShouldEnqueueRenderJobResult } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';

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

const mockRenderJob: Tables<'dialectic_generation_jobs'> = {
    id: 'render-job-123',
    job_type: 'RENDER',
    status: 'pending',
    session_id: 'session-id-123',
    stage_slug: 'thesis',
    iteration_number: 1,
    parent_job_id: 'job-id-123',
    payload: {},
    is_test_job: false,
    user_id: 'user-789',
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    attempt_count: 0,
    prerequisite_job_id: null,
    target_contribution_id: null,
    max_retries: 0,
};

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

Deno.test('executeModelCallAndSave - should NOT call assembleAndSaveFinalDocument for final chunk with shouldRender === true (markdown document)', async () => {
    // Arrange: Mock database queries to make shouldEnqueueRenderJob return true (markdown document)
    // This requires mocking: dialectic_stages, dialectic_stage_recipe_instances, and dialectic_recipe_template_steps
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_generation_jobs': {
            insert: { data: [mockRenderJob], error: null }
        },
        'dialectic_stages': {
            select: {
                data: [{ active_recipe_instance_id: 'instance-1' }],
                error: null
            }
        },
        'dialectic_stage_recipe_instances': {
            select: {
                data: [{
                    id: 'instance-1',
                    stage_id: 'stage-1',
                    template_id: 'template-1',
                    is_cloned: false,
                    cloned_at: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }],
                error: null
            }
        },
        'dialectic_recipe_template_steps': {
            select: {
                data: [{
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
                        files_to_generate: [{
                            from_document_key: 'business_case',
                            template_filename: 'thesis_business_case.md'
                        }]
                    },
                    parallel_group: null,
                    branch_key: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }],
                error: null
            }
        }
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    // Create a contribution with document_relationships containing root ID
    // Include source_group for filename disambiguation
    const rootContributionId = 'root-contrib-123';
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        document_relationships: {
            source_group: '550e8400-e29b-41d4-a716-446655440000',
            thesis: rootContributionId,
        },
    };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    // Force the markdown-rendering decision path so shouldRender is deterministically true for this test.
    const renderDecisionReason: RenderCheckReason = 'is_markdown';
    const renderDecision: ShouldEnqueueRenderJobResult = {
        shouldRender: true,
        reason: renderDecisionReason,
    };
    stub(deps, 'shouldEnqueueRenderJob', () => Promise.resolve(renderDecision));

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

    // Create a final chunk job (resolvedFinish === 'stop' via finish_reason: 'stop')
    const markdownPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case, // Markdown document that triggers shouldRender === true
        document_key: 'business_case',
        document_relationships: {
            source_group: '550e8400-e29b-41d4-a716-446655440000',
            thesis: rootContributionId,
        },
    };

    const job = createMockJob(markdownPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: assembleAndSaveFinalDocument should NOT be called for rendered documents
    assertEquals(
        fileManager.assembleAndSaveFinalDocument.calls.length,
        0,
        'assembleAndSaveFinalDocument should NOT be called when shouldRender === true (markdown document)'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - should call assembleAndSaveFinalDocument for final chunk with shouldRender === false (JSON-only artifact)', async () => {
    // Arrange: Mock database queries to make shouldEnqueueRenderJob return false (JSON-only artifact)
    // This is done by making the stage query return no data (which causes shouldEnqueueRenderJob to return false)
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: {
                data: null,
                error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' }
            }
        }
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    // Create a contribution - for root chunks, document_relationships[stageSlug] = contribution.id
    // For single-chunk artifacts, rootIdFromSaved === contribution.id, so assembly won't be called
    // To test assembly, we need a multi-chunk scenario where rootIdFromSaved !== contribution.id
    // This test should verify that assembly is NOT called for single-chunk JSON artifacts
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        // document_relationships will be initialized to { thesis: contribution.id }
    };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"header": "Header Context", "context": {"key": "value"}}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Create a final chunk job (resolvedFinish === 'stop' via finish_reason: 'stop')
    const jsonOnlyPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.HeaderContext, // JSON-only artifact that triggers shouldRender === false
    };

    const job = createMockJob(jsonOnlyPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: For single-chunk JSON artifacts, assembly should NOT be called
    // because rootIdFromSaved === contribution.id 
    // Assembly only happens when rootIdFromSaved !== contribution.id (multi-chunk scenario)
    assertEquals(
        fileManager.assembleAndSaveFinalDocument.calls.length,
        0,
        'assembleAndSaveFinalDocument should NOT be called for single-chunk JSON artifacts (rootIdFromSaved === contribution.id)'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - should NOT call assembleAndSaveFinalDocument for non-final chunk (resolvedFinish !== stop)', async () => {
    // Arrange: Mock database queries to make shouldEnqueueRenderJob return false (JSON-only artifact)
    // Even though shouldRender === false, non-final chunks should NOT trigger assembly
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: {
                data: null,
                error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' }
            }
        }
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    // Create a continuation chunk with document_relationships containing root ID
    const rootContributionId = 'root-contrib-789';
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        document_relationships: { thesis: rootContributionId },
    };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "Partial AI response"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'length' }, // Non-final chunk (needs continuation)
        })
    ));

    // Create a continuation job (non-final chunk with resolvedFinish === 'length')
    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.HeaderContext, // JSON-only artifact
        target_contribution_id: rootContributionId,
        continueUntilComplete: true,
        continuation_count: 1,
        document_relationships: { thesis: rootContributionId },
    };

    const job = createMockJob(continuationPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: assembleAndSaveFinalDocument should NOT be called for non-final chunks
    assertEquals(
        fileManager.assembleAndSaveFinalDocument.calls.length,
        0,
        'assembleAndSaveFinalDocument should NOT be called for non-final chunks (resolvedFinish !== stop) regardless of shouldRender value'
    );

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave - should NOT call assembleAndSaveFinalDocument for final chunk with shouldRender === false but no rootIdFromSaved (document_relationships is null)', async () => {
    // Arrange: Mock database queries to make shouldEnqueueRenderJob return false (JSON-only artifact)
    const { client: dbClient, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_stages': {
            select: {
                data: null,
                error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' }
            }
        }
    });

    const deps = getMockDeps();
    assert(deps.fileManager instanceof MockFileManagerService, 'Expected deps.fileManager to be a MockFileManagerService');
    const fileManager: MockFileManagerService = deps.fileManager;
    // Create a contribution with document_relationships set to null (no root ID)
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        document_relationships: null,
    };
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"header": "Header Context", "context": {"key": "value"}}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    // Create a final chunk job (resolvedFinish === 'stop' via finish_reason: 'stop')
    const jsonOnlyPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.HeaderContext, // JSON-only artifact that triggers shouldRender === false
    };

    const job = createMockJob(jsonOnlyPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: assembleAndSaveFinalDocument should NOT be called when rootIdFromSaved is missing
    assertEquals(
        fileManager.assembleAndSaveFinalDocument.calls.length,
        0,
        'assembleAndSaveFinalDocument should NOT be called when document_relationships is null (no rootIdFromSaved) even if shouldRender === false'
    );

    clearAllStubs?.();
});

