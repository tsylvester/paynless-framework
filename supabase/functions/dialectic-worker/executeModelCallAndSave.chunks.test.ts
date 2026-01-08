import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { 
    Database, 
    Tables 
} from '../types_db.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import { 
    DialecticExecuteJobPayload,
    DialecticContributionRow,
    DocumentRelationships,
} from '../dialectic-service/dialectic.interface.ts';
import { 
    FileType, 
    DialecticStageSlug,
} from '../_shared/types/file_manager.types.ts';
import { 
    isRecord, 
    isDocumentRelationships 
} from '../_shared/utils/type_guards.ts';
import { ShouldEnqueueRenderJobResult } from '../_shared/types/shouldEnqueueRenderJob.interface.ts';

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

// Import createMockUnifiedAIResponse from render test file
import { createMockUnifiedAIResponse, stubShouldEnqueueRenderJobForMarkdown } from './executeModelCallAndSave.render.test.ts';

// Mock render job for RENDER job insert mocks
const mockRenderJob: Tables<'dialectic_generation_jobs'> = {
    id: 'render-job-123',
    job_type: 'RENDER',
    status: 'pending',
    session_id: 'session-id-123',
    stage_slug: DialecticStageSlug.Thesis,
    iteration_number: 1,
    parent_job_id: 'job-id-123',
    payload: {},
    is_test_job: false,
    user_id: 'user-id-123',
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
 * Stubs shouldEnqueueRenderJob to return JSON path (shouldRender: false, reason: 'is_json').
 * Returns the stub object so it can be restored if needed.
 */
function stubShouldEnqueueRenderJobForJson(deps: { shouldEnqueueRenderJob: unknown }) {
    return stub(deps, 'shouldEnqueueRenderJob', (): Promise<ShouldEnqueueRenderJobResult> => Promise.resolve({
        shouldRender: false,
        reason: 'is_json',
    }));
}

Deno.test('executeModelCallAndSave enforces document_relationships[stageSlug] = contribution.id for JSON-only root chunks', async () => {
    // Arrange: Create an EXECUTE job with output_type: 'header_context' (JSON-only artifact)
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
    const invalidStageValue = 'some-anchor-id';
    const newContributionId = 'new-contribution-id';
    const sourceGroupId = 'source-group-anchor-id';

    // Job payload with document_relationships containing invalid stageSlug value (simulating planner-set invalid value)
    const headerContextPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.HeaderContext,
        stageSlug: stageSlug,
        document_relationships: {
            source_group: sourceGroupId,
            [stageSlug]: invalidStageValue, // Invalid value that should be corrected
        },
    };

    // Mock contribution that will be returned by uploadAndRegisterFile
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        id: newContributionId,
        document_relationships: {
            source_group: sourceGroupId,
            [stageSlug]: invalidStageValue, // Initial invalid value
        },
    };

    const { client: dbClient, spies, clearAllStubs } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        },
        'dialectic_contributions': {
            update: { data: [], error: null } // Allow document_relationships update to succeed
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps({ fileManager });

    // Stub shouldEnqueueRenderJob to return JSON path (shouldRender: false for header_context)
    stubShouldEnqueueRenderJobForJson(deps);

    // Stub callUnifiedAIModel to return valid JSON response
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"header": "context data"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const job = createMockJob(headerContextPayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: Database update should occur with document_relationships[stageSlug] === newContributionId (corrected value)
    const updateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    assertExists(updateSpies, 'Expected to track update calls for dialectic_contributions');
    assertEquals(updateSpies.callCount, 1, 'Should update dialectic_contributions exactly once');

    const updateCalls = updateSpies.callsArgs;
    assertEquals(updateCalls.length, 1, 'Should have exactly one update call');
    
    assert(Array.isArray(updateCalls[0]), 'Update call should have array structure');
    const [updatePayload] = updateCalls[0];
    assert(isRecord(updatePayload), 'Update payload must be an object');

    const documentRelationshipsUnknown: unknown = updatePayload['document_relationships'];
    assert(isDocumentRelationships(documentRelationshipsUnknown), 'Update payload must have document_relationships');
    const documentRelationships: DocumentRelationships = documentRelationshipsUnknown;

    // Assert: document_relationships[stageSlug] should be corrected to newContributionId
    const stageValueUnknown: unknown = documentRelationships[stageSlug];
    assert(typeof stageValueUnknown === 'string', `document_relationships[${stageSlug}] should be a string`);
    const stageValue: string = stageValueUnknown;
    assertEquals(stageValue, newContributionId, `document_relationships[${stageSlug}] should equal new-contribution-id (corrected value, not the invalid planner value)`);

    // Assert: source_group should be preserved
    const sourceGroupUnknown: unknown = documentRelationships.source_group;
    assert(typeof sourceGroupUnknown === 'string', 'source_group should be preserved as a string');
    const sourceGroup: string = sourceGroupUnknown;
    assertEquals(sourceGroup, sourceGroupId, 'source_group should be preserved');

    // The update call proves that the in-memory contribution.document_relationships was updated
    // since the database update reflects the corrected value
    assertEquals(stageValue, newContributionId, 'In-memory contribution.document_relationships[stageSlug] should equal contribution.id');

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave enforces document_relationships[stageSlug] = contribution.id for document root chunks even when planner sets invalid value', async () => {
    // Arrange: Create an EXECUTE job with output_type: 'business_case' (markdown document)
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
    const invalidStageValue = 'some-anchor-id';
    const newContributionId = 'new-contribution-id';
    const sourceGroupId = 'source-group-anchor-id';

    // Job payload with document_relationships containing invalid stageSlug value (simulating planner-set invalid value)
    const businessCasePayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: stageSlug,
        document_relationships: {
            source_group: sourceGroupId,
            [stageSlug]: invalidStageValue, // Invalid value that should be corrected
        },
    };

    // Mock contribution that will be returned by uploadAndRegisterFile
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        id: newContributionId,
        document_relationships: {
            source_group: sourceGroupId,
            [stageSlug]: invalidStageValue, // Initial invalid value
        },
    };

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
        'dialectic_generation_jobs': {
            insert: { data: [mockRenderJob], error: null } // Allow RENDER job insert to succeed
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps({ fileManager });

    // Stub shouldEnqueueRenderJob to return markdown path
    stubShouldEnqueueRenderJobForMarkdown(deps);

    // Stub callUnifiedAIModel to return valid JSON response
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "Business case content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const job = createMockJob(businessCasePayload);
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: Database update should occur with document_relationships[stageSlug] === newContributionId (corrected value, not the invalid planner value)
    const updateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    assertExists(updateSpies, 'Expected to track update calls for dialectic_contributions');
    assertEquals(updateSpies.callCount, 1, 'Should update dialectic_contributions exactly once');

    const updateCalls = updateSpies.callsArgs;
    assertEquals(updateCalls.length, 1, 'Should have exactly one update call');
    
    assert(Array.isArray(updateCalls[0]), 'Update call should have array structure');
    const [updatePayload] = updateCalls[0];
    assert(isRecord(updatePayload), 'Update payload must be an object');

    const documentRelationshipsUnknown: unknown = updatePayload['document_relationships'];
    assert(isDocumentRelationships(documentRelationshipsUnknown), 'Update payload must have document_relationships');
    const documentRelationships: DocumentRelationships = documentRelationshipsUnknown;

    // Assert: document_relationships[stageSlug] should be corrected to newContributionId (not the invalid value)
    const stageValueUnknown: unknown = documentRelationships[stageSlug];
    assert(typeof stageValueUnknown === 'string', `document_relationships[${stageSlug}] should be a string`);
    const stageValue: string = stageValueUnknown;
    assertEquals(stageValue, newContributionId, `document_relationships[${stageSlug}] should equal new-contribution-id (corrected value, not the invalid planner value ${invalidStageValue})`);
    assert(stageValue !== invalidStageValue, `document_relationships[${stageSlug}] should NOT equal the invalid planner value`);

    clearAllStubs?.();
});

Deno.test('executeModelCallAndSave does not overwrite document_relationships[stageSlug] for continuation chunks', async () => {
    // Arrange: Create a continuation EXECUTE job with target_contribution_id and document_relationships in payload
    const stageSlug: DialecticStageSlug = DialecticStageSlug.Thesis;
    const rootContributionId = 'root-contribution-id';
    const continuationContributionId = 'continuation-contribution-id';
    const targetContributionId = rootContributionId;

    // Job payload with target_contribution_id and document_relationships containing root contribution id
    const continuationPayload: DialecticExecuteJobPayload = {
        ...testPayload,
        output_type: FileType.business_case,
        document_key: 'business_case',
        stageSlug: stageSlug,
        target_contribution_id: targetContributionId,
        continuation_count: 1,
        document_relationships: {
            [stageSlug]: rootContributionId, // Root contribution id from payload
        },
    };

    // Mock contribution that will be returned by uploadAndRegisterFile
    const savedContribution: DialecticContributionRow = {
        ...mockContribution,
        id: continuationContributionId,
        target_contribution_id: targetContributionId,
        document_relationships: {
            [stageSlug]: rootContributionId, // Root contribution id should be preserved
        },
    };

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
            update: { data: [], error: null } // Allow document_relationships update to succeed (should preserve root id)
        },
        'dialectic_generation_jobs': {
            insert: { data: [mockRenderJob], error: null } // Allow RENDER job insert to succeed
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(savedContribution, null);

    const deps = getMockDeps({ fileManager });

    // Stub shouldEnqueueRenderJob to return markdown path
    stubShouldEnqueueRenderJobForMarkdown(deps);

    // Stub callUnifiedAIModel to return valid JSON response
    stub(deps, 'callUnifiedAIModel', () => Promise.resolve(
        createMockUnifiedAIResponse({
            content: '{"content": "Continuation content"}',
            contentType: 'application/json',
            inputTokens: 10,
            outputTokens: 5,
            processingTimeMs: 50,
            rawProviderResponse: { finish_reason: 'stop' },
        })
    ));

    const job = createMockJob(continuationPayload, {
        target_contribution_id: targetContributionId,
    });
    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps, { job });

    // Act
    await executeModelCallAndSave(params);

    // Assert: Database update should occur with document_relationships[stageSlug] remaining as rootContributionId (not overwritten to continuation's id)
    const updateSpies = spies.getHistoricQueryBuilderSpies('dialectic_contributions', 'update');
    assertExists(updateSpies, 'Expected to track update calls for dialectic_contributions');
    // Continuation chunks should update document_relationships to persist the payload value
    assertEquals(updateSpies.callCount, 1, 'Should update dialectic_contributions exactly once for continuation chunk');

    const updateCalls = updateSpies.callsArgs;
    assertEquals(updateCalls.length, 1, 'Should have exactly one update call');
    
    assert(Array.isArray(updateCalls[0]), 'Update call should have array structure');
    const [updatePayload] = updateCalls[0];
    assert(isRecord(updatePayload), 'Update payload must be an object');

    const documentRelationshipsUnknown: unknown = updatePayload['document_relationships'];
    assert(isDocumentRelationships(documentRelationshipsUnknown), 'Update payload must have document_relationships');
    const documentRelationships: DocumentRelationships = documentRelationshipsUnknown;

    // Assert: document_relationships[stageSlug] should remain as rootContributionId (not overwritten to continuationContributionId)
    const stageValueUnknown: unknown = documentRelationships[stageSlug];
    assert(typeof stageValueUnknown === 'string', `document_relationships[${stageSlug}] should be a string`);
    const stageValue: string = stageValueUnknown;
    assertEquals(stageValue, rootContributionId, `document_relationships[${stageSlug}] should remain root-contribution-id (not overwritten to continuation's id)`);
    assert(stageValue !== continuationContributionId, `document_relationships[${stageSlug}] should NOT be overwritten to continuation's contribution id`);

    clearAllStubs?.();
});
