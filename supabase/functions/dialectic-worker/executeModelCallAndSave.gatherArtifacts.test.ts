import {
    assertEquals,
    assertExists,
    assertRejects,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import {
    DialecticJobRow,
    DialecticExecuteJobPayload,
    ExecuteModelCallAndSaveParams,
    PromptConstructionPayload,
    DialecticContributionRow,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { CountTokensFn } from '../_shared/types/tokenizer.types.ts';
import { IExecuteJobContext } from './JobContext.interface.ts';
import { getMockDeps } from './executeModelCallAndSave.test.ts';
import { createMockDownloadFromStorage } from '../_shared/supabase_storage_utils.mock.ts';
import { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';

// Helper to create a mock job
function createMockJob(payload: DialecticExecuteJobPayload, overrides: Partial<DialecticJobRow> = {}): DialecticJobRow {
    if (!isJson(payload)) {
        throw new Error("Test payload is not valid JSON. Please check the mock payload object.");
    }
    const baseJob: DialecticJobRow = {
        id: 'job-id-123',
        session_id: 'session-id-123',
        stage_slug: 'thesis',
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
    prompt_template_id: 'test-prompt',
    inputs: {},
    output_type: FileType.business_case,
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'thesis',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    user_jwt: 'jwt.token.here',
    canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: 'thesis',
    },
    document_key: FileType.business_case,
    document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
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
    stage: 'thesis',
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
    storage_path: 'thesis/path',
    target_contribution_id: null,
    tokens_used_input: 10,
    tokens_used_output: 20,
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
};

const countTokensTen: CountTokensFn = (_deps, _payload, _modelConfig) => 10;

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
                        stage_slug: 'thesis',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        resource_type: 'rendered_document',
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
                        file_name: 'model-collect_1_business_case.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        user_id: 'user-789',
                        updated_at: new Date().toISOString(),
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

    const encodedContent = new TextEncoder().encode('Rendered document content');
    const documentContentBuffer = new ArrayBuffer(encodedContent.byteLength);
    new Uint8Array(documentContentBuffer).set(encodedContent);
    const mockDownload = createMockDownloadFromStorage({ mode: 'success', data: documentContentBuffer });
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseDeps, downloadFromStorage: mockDownload };

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                slug: 'thesis',
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
                        stage_slug: 'thesis',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        resource_type: 'rendered_document',
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
                        file_name: 'model-collect_1_business_case.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        user_id: 'user-789',
                        updated_at: new Date().toISOString(),
                    };
                    return Promise.resolve({ data: [resource], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    contributionsQueried = true;
                    const contribution = {
                        id: 'contrib-123',
                        stage: 'thesis',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
                        file_name: 'model-collect_1_business_case.md',
                    };
                    return Promise.resolve({ data: [contribution], error: null });
                },
            },
        },
    });

    const encodedContent2 = new TextEncoder().encode('Rendered document content from resources');
    const contentBuffer2 = new ArrayBuffer(encodedContent2.byteLength);
    new Uint8Array(contentBuffer2).set(encodedContent2);
    const mockDownload2 = createMockDownloadFromStorage({ mode: 'success', data: contentBuffer2 });
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseDeps2: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseDeps2, downloadFromStorage: mockDownload2 };

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                slug: 'thesis',
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

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                slug: 'thesis',
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

Deno.test('gatherArtifacts - finds required seed_prompt in dialectic_project_resources when app stores it there (target behavior)', async () => {
    // Target: app stores seed_prompt in dialectic_project_resources via fileManager.uploadAndRegisterFile(FileType.SeedPrompt).
    // Executor should query project_resources for inputsRequired type seed_prompt and find it; execution should succeed.
    const seedPromptResource = {
        id: 'resource-seed-prompt-123',
        stage_slug: 'thesis',
        project_id: 'project-abc',
        session_id: 'session-456',
        iteration_number: 1,
        resource_type: 'seed_prompt',
        created_at: new Date().toISOString(),
        storage_bucket: 'dialectic-contributions',
        storage_path: 'project-abc/session_session-456/iteration_1/thesis',
        file_name: 'seed_prompt.md',
        mime_type: 'text/markdown',
        size_bytes: 50,
        user_id: 'user-789',
        updated_at: new Date().toISOString(),
    };
    let projectResourcesQueried = false;
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
                    projectResourcesQueried = true;
                    return Promise.resolve({ data: [seedPromptResource], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    return Promise.resolve({ data: [], error: null });
                },
            },
            'dialectic_feedback': {
                select: () => {
                    return Promise.resolve({ data: [], error: null });
                },
            },
        },
    });

    const encodedSeed = new TextEncoder().encode('Seed prompt content');
    const seedBuffer = new ArrayBuffer(encodedSeed.byteLength);
    new Uint8Array(seedBuffer).set(encodedSeed);
    let seedDownloadCalled = false;
    const baseMockDownloadSeed = createMockDownloadFromStorage({ mode: 'success', data: seedBuffer });
    const mockDownloadSeed: DownloadFromStorageFn = async (supabase, bucket, path) => {
        seedDownloadCalled = true;
        return baseMockDownloadSeed(supabase, bucket, path);
    };
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseSeedDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseSeedDeps, downloadFromStorage: mockDownloadSeed };

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                type: 'seed_prompt',
                slug: 'thesis',
                document_key: FileType.SeedPrompt,
                required: true,
            },
        ],
    };

    await executeModelCallAndSave(params);

    assert(
        projectResourcesQueried,
        'Executor should query dialectic_project_resources for required seed_prompt (app stores it there)',
    );
    assert(
        seedDownloadCalled,
        'downloadFromStorage must be called to get seed_prompt content from storage — there is no content column on dialectic_project_resources',
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
                        stage: 'thesis',
                        session_id: 'session-456',
                        iteration_number: 1,
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
                        file_name: 'model-collect_1_header_context.json',
                        mime_type: 'application/json',
                        size_bytes: 200,
                        user_id: 'user-789',
                        updated_at: new Date().toISOString(),
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

    const encodedHeader = new TextEncoder().encode('Header context content');
    const headerBuffer = new ArrayBuffer(encodedHeader.byteLength);
    new Uint8Array(headerBuffer).set(encodedHeader);
    let headerDownloadCalled = false;
    const baseMockDownloadHeader = createMockDownloadFromStorage({ mode: 'success', data: headerBuffer });
    const mockDownloadHeader: DownloadFromStorageFn = async (supabase, bucket, path) => {
        headerDownloadCalled = true;
        return baseMockDownloadHeader(supabase, bucket, path);
    };
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseHeaderDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseHeaderDeps, downloadFromStorage: mockDownloadHeader };

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                slug: 'thesis',
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
    assert(
        headerDownloadCalled,
        'downloadFromStorage must be called to get header_context content from storage — there is no content column on dialectic_contributions',
    );
});

Deno.test('gatherArtifacts - queries dialectic_contributions by session_id only, never by project_id', async () => {
    const { client: dbClient, spies } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: {
                    data: [mockFullProviderData],
                    error: null,
                },
            },
            'dialectic_project_resources': {
                select: () => Promise.resolve({ data: [], error: null }),
            },
            'dialectic_contributions': {
                select: () => {
                    const contribution = {
                        id: 'header-contrib-123',
                        stage: 'thesis',
                        session_id: 'session-456',
                        iteration_number: 1,
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
                        file_name: 'model-collect_1_header_context.json',
                        mime_type: 'application/json',
                        size_bytes: 200,
                        user_id: 'user-789',
                        updated_at: new Date().toISOString(),
                    };
                    return Promise.resolve({ data: [contribution], error: null });
                },
            },
            'dialectic_feedback': {
                select: () => Promise.resolve({ data: [], error: null }),
            },
        },
    });

    const encodedHeaderCtx = new TextEncoder().encode('Header context content');
    const headerCtxBuffer = new ArrayBuffer(encodedHeaderCtx.byteLength);
    new Uint8Array(headerCtxBuffer).set(encodedHeaderCtx);
    let headerCtxDownloadCalled = false;
    const baseMockDownloadHeaderCtx = createMockDownloadFromStorage({ mode: 'success', data: headerCtxBuffer });
    const mockDownloadHeaderCtx: DownloadFromStorageFn = async (supabase, bucket, path) => {
        headerCtxDownloadCalled = true;
        return baseMockDownloadHeaderCtx(supabase, bucket, path);
    };
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseHeaderCtxDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseHeaderCtxDeps, downloadFromStorage: mockDownloadHeaderCtx };

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                slug: 'thesis',
                document_key: FileType.HeaderContext,
            },
        ],
    };

    await executeModelCallAndSave(params);

    const allContributionsSpies = spies.getAllQueryBuilderSpies('dialectic_contributions');
    assertExists(allContributionsSpies, 'At least one dialectic_contributions query should occur');
    for (const builder of allContributionsSpies) {
        if (builder.eq?.calls) {
            for (const call of builder.eq.calls) {
                const column: unknown = call.args?.[0];
                assert(
                    column !== 'project_id',
                    'dialectic_contributions has no project_id column; query by session_id only. Found .eq("project_id", ...) in gatherArtifacts contributions query.',
                );
            }
        }
    }
    assert(
        headerCtxDownloadCalled,
        'downloadFromStorage must be called to get header_context content from storage — there is no content column on dialectic_contributions',
    );
});

Deno.test('gatherArtifacts - finds required project_resource initial_user_prompt in dialectic_project_resources (target behavior)', async () => {
    // Target: generate-advisor-recommendations and similar steps require project_resource with document_key=initial_user_prompt.
    // findSourceDocuments finds it in dialectic_project_resources during planning. gatherArtifacts must also query
    // dialectic_project_resources (not dialectic_contributions) so execution succeeds.
    const initialUserPromptResource = {
        id: 'resource-initial-prompt-123',
        stage_slug: null,
        project_id: 'project-abc',
        session_id: null,
        iteration_number: null,
        resource_type: 'initial_user_prompt',
        created_at: new Date().toISOString(),
        storage_bucket: 'dialectic-contributions',
        storage_path: 'project-abc/0_seed_inputs',
        file_name: 'initial_prompt_1769983040943.md',
        mime_type: 'text/markdown',
        size_bytes: 80,
        user_id: 'user-789',
        updated_at: new Date().toISOString(),
    };
    let projectResourcesQueriedForInitialPrompt = false;
    const { client: dbClient } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: {
                    data: [mockFullProviderData],
                    error: null,
                },
            },
            'dialectic_project_resources': {
                select: () => {
                    projectResourcesQueriedForInitialPrompt = true;
                    return Promise.resolve({ data: [initialUserPromptResource], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => Promise.resolve({ data: [], error: null }),
            },
            'dialectic_feedback': {
                select: () => Promise.resolve({ data: [], error: null }),
            },
        },
    });

    const encodedPrompt = new TextEncoder().encode('Test prompt for full DAG traversal integration test');
    const promptBuffer = new ArrayBuffer(encodedPrompt.byteLength);
    new Uint8Array(promptBuffer).set(encodedPrompt);
    let promptDownloadCalled = false;
    const baseMockDownloadPrompt = createMockDownloadFromStorage({ mode: 'success', data: promptBuffer });
    const mockDownloadPrompt: DownloadFromStorageFn = async (supabase, bucket, path) => {
        promptDownloadCalled = true;
        return baseMockDownloadPrompt(supabase, bucket, path);
    };
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const basePromptDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...basePromptDeps, downloadFromStorage: mockDownloadPrompt };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({
            ...testPayload,
            stageSlug: 'paralysis',
        }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                type: 'project_resource',
                slug: 'project',
                document_key: FileType.InitialUserPrompt,
                required: true,
            },
        ],
    };

    await executeModelCallAndSave(params);

    assert(
        projectResourcesQueriedForInitialPrompt,
        'Executor should query dialectic_project_resources for required project_resource/initial_user_prompt (app stores it there, same as findSourceDocuments)',
    );
    assert(
        promptDownloadCalled,
        'downloadFromStorage must be called to get project_resource content from storage — there is no content column on dialectic_project_resources',
    );
});

Deno.test('gatherArtifacts - skips optional document input when not found in resources', async () => {
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
                    return Promise.resolve({ data: [], error: null });
                },
            },
        },
    });

    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({
            ...testPayload,
            stageSlug: 'parenthesis',
        }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                document_key: FileType.master_plan,
                required: false,
                slug: 'parenthesis',
            },
        ],
    };

    await executeModelCallAndSave(params);

    const resourcesSpies = spies.getLatestQueryBuilderSpies('dialectic_project_resources');
    assertExists(resourcesSpies?.select, 'Resources select should be called');
    assert(resourcesSpies.select.calls.length > 0, 'Resources should be queried for optional document input');
});

Deno.test('gatherArtifacts - required input with failed storage download throws, does not fall back to empty string', async () => {
    const { client: dbClient } = createMockSupabaseClient(undefined, {
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
                        id: 'resource-fail-download-123',
                        stage_slug: 'thesis',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        resource_type: 'rendered_document',
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/thesis/documents',
                        file_name: 'model-collect_1_business_case.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        user_id: 'user-789',
                        updated_at: new Date().toISOString(),
                    };
                    return Promise.resolve({ data: [resource], error: null });
                },
            },
        },
    });

    const mockDownloadFail = createMockDownloadFromStorage({ mode: 'error', error: new Error('Storage download failed: file not found') });
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseFailDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseFailDeps, downloadFromStorage: mockDownloadFail };

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
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                slug: 'thesis',
            },
        ],
    };

    await assertRejects(
        async () => {
            await executeModelCallAndSave(params);
        },
        Error,
        'Failed to download content from storage',
    );
});

Deno.test('gatherArtifacts - optional input with failed storage download skips, does not throw', async () => {
    const { client: dbClient } = createMockSupabaseClient(undefined, {
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
                        id: 'resource-optional-fail-123',
                        stage_slug: 'parenthesis',
                        project_id: 'project-abc',
                        session_id: 'session-456',
                        iteration_number: 1,
                        resource_type: 'rendered_document',
                        created_at: new Date().toISOString(),
                        storage_bucket: 'dialectic-contributions',
                        storage_path: 'project-abc/session_session-456/iteration_1/parenthesis/documents',
                        file_name: 'model-collect_1_master_plan.md',
                        mime_type: 'text/markdown',
                        size_bytes: 100,
                        user_id: 'user-789',
                        updated_at: new Date().toISOString(),
                    };
                    return Promise.resolve({ data: [resource], error: null });
                },
            },
            'dialectic_contributions': {
                select: () => {
                    return Promise.resolve({ data: [], error: null });
                },
            },
        },
    });

    const mockDownloadOptionalFail = createMockDownloadFromStorage({ mode: 'error', error: new Error('Storage download failed: file not found') });
    const fileManager = new MockFileManagerService();
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const baseOptDeps: IExecuteJobContext = getMockDeps({ fileManager, countTokens: countTokensTen });
    const deps: IExecuteJobContext = { ...baseOptDeps, downloadFromStorage: mockDownloadOptionalFail };

    const params: ExecuteModelCallAndSaveParams = {
        dbClient: dbClient as unknown as SupabaseClient<Database>,
        deps,
        authToken: 'auth-token',
        job: createMockJob({
            ...testPayload,
            stageSlug: 'parenthesis',
        }),
        projectOwnerUserId: 'user-789',
        providerDetails: mockProviderData,
        sessionData: {
            id: 'session-456',
            project_id: 'project-abc',
            session_description: 'A mock session',
            user_input_reference_url: null,
            iteration_count: 1,
            selected_models: [{ id: 'model-def', displayName: 'Mock AI' }],
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
                document_key: FileType.master_plan,
                required: false,
                slug: 'parenthesis',
            },
        ],
    };

    await executeModelCallAndSave(params);
});

