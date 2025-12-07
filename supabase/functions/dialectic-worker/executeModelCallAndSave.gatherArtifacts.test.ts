import {
    assertEquals,
    assertExists,
    assertRejects,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { logger } from '../_shared/logger.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type {
    DialecticJobRow,
    DialecticExecuteJobPayload,
    ExecuteModelCallAndSaveParams,
    IDialecticJobDeps,
    PromptConstructionPayload,
    DialecticContributionRow,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { createMockTokenWalletService } from '../_shared/services/tokenWalletService.mock.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import type { NotificationServiceType } from '../_shared/types/notification.service.types.ts';

// Helper to create a mock job
function createMockJob(payload: DialecticExecuteJobPayload, overrides: Partial<DialecticJobRow> = {}): DialecticJobRow {
    if (!isJson(payload)) {
        throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
    }
    const baseJob: DialecticJobRow = {
        id: 'job-id-123',
        session_id: 'session-id-123',
        stage_slug: 'test-stage',
        iteration_number: 1,
        status: 'pending',
        user_id: 'user-id-123',
        attempt_count: 0,
        completed_at: null,
        created_at: new Date().toISOString(),
        error_details: null,
        max_retries: 3,
        parent_job_id: null,
        prerequisite_job_id: null,
        results: null,
        started_at: null,
        target_contribution_id: null,
        payload: payload,
        is_test_job: false,
        job_type: 'EXECUTE',
        ...overrides,
    };
    return baseJob;
}

const testPayload: DialecticExecuteJobPayload = {
    job_type: 'execute',
    prompt_template_id: 'test-prompt',
    inputs: {},
    output_type: FileType.business_case,
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'test-stage',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    user_jwt: 'jwt.token.here',
    canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: 'test-stage',
    },
    document_key: FileType.business_case,
};

const mockProviderData = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
};

const mockFullProviderData = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
    created_at: new Date().toISOString(),
    config: {
        tokenization_strategy: { type: 'rough_char_count' },
        context_window_tokens: 10000,
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
    },
    description: null,
    is_active: true,
    is_enabled: true,
    is_default_embedding: false,
    updated_at: new Date().toISOString(),
};

const mockContribution: DialecticContributionRow = {
    id: 'contrib-123',
    session_id: 'session-456',
    stage: 'test-stage',
    iteration_number: 1,
    model_id: 'model-def',
    edit_version: 1,
    is_latest_edit: true,
    citations: null,
    contribution_type: 'model_contribution_main',
    created_at: new Date().toISOString(),
    error: null,
    file_name: 'test.txt',
    mime_type: 'text/plain',
    model_name: 'Mock AI',
    original_model_contribution_id: null,
    processing_time_ms: 100,
    prompt_template_id_used: null,
    raw_response_storage_path: null,
    seed_prompt_url: null,
    size_bytes: 100,
    storage_bucket: 'test-bucket',
    storage_path: 'test/path',
    target_contribution_id: null,
    tokens_used_input: 10,
    tokens_used_output: 20,
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
};

function getMockDeps(): IDialecticJobDeps {
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    return {
        logger,
        fileManager,
        notificationService: mockNotificationService,
        tokenWalletService: createMockTokenWalletService({ getBalance: () => Promise.resolve('1000000') }).instance,
        countTokens,
        callUnifiedAIModel: async () => ({
            content: '{"test": "response"}',
            inputTokens: 10,
            outputTokens: 20,
            processingTimeMs: 100,
            finish_reason: 'stop',
            rawProviderResponse: {},
        }),
        retryJob: async () => ({}),
        continueJob: async () => ({ enqueued: false }),
        ragService: new MockRagService(),
        getExtensionFromMimeType: () => '.txt',
        getSeedPromptForStage: async () => ({ content: 'Seed prompt content', fullPath: 'test/path/seed.txt', bucket: 'test-bucket', path: 'test/path', fileName: 'seed.txt' }),
        downloadFromStorage: async () => ({ data: new ArrayBuffer(100), error: null }),
        randomUUID: () => '123',
        deleteFromStorage: async () => ({ error: null }),
        executeModelCallAndSave: async () => {},
        embeddingClient: { getEmbedding: async () => ({ embedding: [], usage: { prompt_tokens: 0, total_tokens: 0 } }) },
        documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.RenderedDocument, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
    };
}

Deno.test('gatherArtifacts - queries resources first and finds rendered document, does not query contributions', async () => {
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: {
                    data: [mockFullProviderData],
                    error: null,
                },
            },
            'dialectic_project_resources': {
                select: () => {
                    const resource = {
                        id: 'resource-123',
                        content: 'Rendered document content',
                        stage_slug: 'test-stage',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        resource_type: 'rendered_document',
                        created_at: new Date().toISOString(),
                        storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                        file_name: 'model-collect_1_business_case.md',
                    };
                    return Promise.resolve({ data: [resource], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    throw new Error('Contributions should not be queried when resources are found');
                },
            },
        },
    });

    const deps = getMockDeps();
    deps.countTokens = () => 10;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_ids: ['model-def'],
            status: 'in-progress',
            associated_chat_id: 'chat-789',
            current_stage_id: 'stage-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        promptConstructionPayload: {
            systemInstruction: undefined,
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'Test prompt',
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [
            {
                type: 'document',
                document_key: FileType.business_case,
                required: true,
                slug: 'test-stage',
            },
        ],
    };

    await executeModelCallAndSave(params);

    const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    assertExists(resourcesSpies?.select, 'Resources select should be called');
    assert(resourcesSpies.select.calls.length > 0, 'Resources should be queried');

    const contributionsSpies = spies.getLatestQueryBuilderSpies('dialectic_contributions');
    if (contributionsSpies?.select) {
        assertEquals(
            contributionsSpies.select.calls.length,
            0,
            'Contributions should NOT be queried when resources are found',
        );
    }
});

Deno.test('gatherArtifacts - prefers resources over contributions when both exist, returns only resource', async () => {
    let contributionsQueried = false;
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: {
                    data: [mockFullProviderData],
                    error: null,
                },
            },
            'dialectic_project_resources': {
                select: () => {
                    const resource = {
                        id: 'resource-123',
                        content: 'Rendered document content from resources',
                        stage_slug: 'test-stage',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        resource_type: 'rendered_document',
                        created_at: new Date().toISOString(),
                        storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                        file_name: 'model-collect_1_business_case.md',
                    };
                    return Promise.resolve({ data: [resource], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    contributionsQueried = true;
                    const contribution = {
                        id: 'contrib-123',
                        content: 'Raw chunk content from contributions',
                        stage: 'test-stage',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        created_at: new Date().toISOString(),
                        storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                        file_name: 'model-collect_1_business_case.md',
                    };
                    return Promise.resolve({ data: [contribution], error: null });
                },
            },
        },
    });

    const deps = getMockDeps();
    deps.countTokens = () => 10;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_ids: ['model-def'],
            status: 'in-progress',
            associated_chat_id: 'chat-789',
            current_stage_id: 'stage-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        promptConstructionPayload: {
            systemInstruction: undefined,
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'Test prompt',
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [
            {
                type: 'document',
                document_key: FileType.business_case,
                required: true,
                slug: 'test-stage',
            },
        ],
    };

    await executeModelCallAndSave(params);

    const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    assertExists(resourcesSpies?.select, 'Resources select should be called');
    assert(resourcesSpies.select.calls.length > 0, 'Resources should be queried first');

    assert(
        !contributionsQueried,
        'Contributions should NOT be queried when resources are found (resources take precedence)',
    );
});

Deno.test('gatherArtifacts - throws error when required rendered document not found in resources, does not query contributions', async () => {
    let contributionsQueried = false;
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: {
                    data: [mockFullProviderData],
                    error: null,
                },
            },
            'dialectic_project_resources': {
                select: () => {
                    return Promise.resolve({ data: [], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    contributionsQueried = true;
                    return Promise.resolve({ data: [], error: null });
                },
            },
        },
    });

    const deps = getMockDeps();
    deps.countTokens = () => 10;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_ids: ['model-def'],
            status: 'in-progress',
            associated_chat_id: 'chat-789',
            current_stage_id: 'stage-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        promptConstructionPayload: {
            systemInstruction: undefined,
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'Test prompt',
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [
            {
                type: 'document',
                document_key: FileType.business_case,
                required: true,
                slug: 'test-stage',
            },
        ],
    };

    await assertRejects(
        async () => {
            await executeModelCallAndSave(params);
        },
        Error,
        'Required rendered document',
    );

    const allResourcesSpies = spies.getAllQueryBuilderSpies('dialectic_project_resources');
    assertExists(allResourcesSpies, 'Resources query builders should exist');
    assert(allResourcesSpies.length > 0, 'At least one resources query builder should exist');
    const resourcesSpies = allResourcesSpies[allResourcesSpies.length - 1];
    assertExists(resourcesSpies?.select, 'Resources select should be called');
    assert(resourcesSpies.select.calls.length > 0, 'Resources should be queried first');

    assert(
        !contributionsQueried,
        'Contributions should NOT be queried when resources are not found (finished documents must be in resources, not contributions)',
    );
});

Deno.test('gatherArtifacts - continues to query contributions for intermediate artifacts (non-document inputs)', async () => {
    let contributionsQueried = false;
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: {
                    data: [mockFullProviderData],
                    error: null,
                },
            },
            'dialectic_project_resources': {
                select: () => {
                    return Promise.resolve({ data: [], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    contributionsQueried = true;
                    const contribution = {
                        id: 'header-contrib-123',
                        content: 'Header context content',
                        stage: 'test-stage',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        created_at: new Date().toISOString(),
                        storage_path: 'project-abc/session_session-456/iteration_1/test-stage/documents',
                        file_name: 'model-collect_1_header_context.json',
                    };
                    return Promise.resolve({ data: [contribution], error: null });
                },
            },
            'dialectic_feedback': {
                select: () => {
                    return Promise.resolve({ data: [], error: null });
                },
            },
        },
    });

    const deps = getMockDeps();
    deps.countTokens = () => 10;

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob(testPayload),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_model_ids: ['model-def'],
            status: 'in-progress',
            associated_chat_id: 'chat-789',
            current_stage_id: 'stage-1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
        promptConstructionPayload: {
            systemInstruction: undefined,
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'Test prompt',
        },
        compressionStrategy: getSortedCompressionCandidates,
        inputsRelevance: [],
        inputsRequired: [
            {
                type: 'header_context',
                slug: 'test-stage',
                document_key: FileType.HeaderContext,
            },
        ],
    };

    await executeModelCallAndSave(params);

    assert(
        contributionsQueried,
        'Contributions should be queried for intermediate artifacts like header_context',
    );

    const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    if (resourcesSpies?.select) {
        assertEquals(
            resourcesSpies.select.calls.length,
            0,
            'Resources should NOT be queried for intermediate artifacts (header_context is stored in contributions)',
        );
    }
});

