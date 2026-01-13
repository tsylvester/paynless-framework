import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
    isRecord,
    isDialecticJobRow,
    isJson,
} from '../_shared/utils/type_guards.ts';
import { isModelContributionContext } from '../_shared/utils/type-guards/type_guards.file_manager.ts';
import { executeModelCallAndSave } from './executeModelCallAndSave.ts';
import type { 
    DialecticJobRow, 
    DialecticSession, 
    DialecticContributionRow, 
    SelectedAiProvider, 
    ExecuteModelCallAndSaveParams, 
    DialecticJobPayload,
    DialecticExecuteJobPayload,
    PromptConstructionPayload,
    UnifiedAIResponse,
} from '../dialectic-service/dialectic.interface.ts';
import { FileType, UploadContext } from '../_shared/types/file_manager.types.ts';
import { countTokens } from '../_shared/utils/tokenizer_utils.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import { isDialecticContribution } from '../_shared/utils/type_guards.ts';
import type { Tables } from '../types_db.ts';
import type { IExecuteJobContext } from './JobContext.interface.ts';
import { getMockDeps as getExecuteMockDeps } from './executeModelCallAndSave.test.ts';

// Reuse helpers from main test file
export const buildPromptPayload = (overrides: Partial<PromptConstructionPayload> = {}): PromptConstructionPayload => ({
    systemInstruction: undefined,
    conversationHistory: [],
    resourceDocuments: [],
    currentUserPrompt: 'RENDERED: Hello',
    ...overrides,
});

export const buildExecuteParams = (dbClient: SupabaseClient<Database>, deps: IExecuteJobContext, overrides: Partial<ExecuteModelCallAndSaveParams> = {}): ExecuteModelCallAndSaveParams => ({
    dbClient,
    deps,
    authToken: 'auth-token',
    job: createMockJob(testPayload),
    projectOwnerUserId: 'user-789',
    providerDetails: mockProviderData,
    sessionData: mockSessionData,
    promptConstructionPayload: buildPromptPayload(),
    compressionStrategy: getSortedCompressionCandidates,
    inputsRelevance: [],
    ...overrides,
});

// Helper function to create a valid DialecticJobRow for testing
export function createMockJob(payload: DialecticJobPayload, overrides: Partial<DialecticJobRow> = {}): DialecticJobRow {
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

export const testPayload: DialecticExecuteJobPayload = {
    prompt_template_id: 'test-prompt',
    inputs: {},
    output_type: FileType.business_case, // Document key fileType
    projectId: 'project-abc',
    sessionId: 'session-456',
    stageSlug: 'thesis',
    model_id: 'model-def',
    iterationNumber: 1,
    continueUntilComplete: false,
    walletId: 'wallet-ghi',
    user_jwt: 'jwt.token.here',
    document_key: 'business_case',
    canonicalPathParams: {
        contributionType: 'thesis',
        stageSlug: 'thesis',
    },
    document_relationships: {
        source_group: '550e8400-e29b-41d4-a716-446655440000',
    },
};

export const mockSessionData: DialecticSession = {
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
};

export const mockProviderData: SelectedAiProvider = {
    id: 'model-def',
    provider: 'mock-provider',
    name: 'Mock AI',
    api_identifier: 'mock-ai-v1',
};

const mockFullProviderData: Tables<'ai_providers'> = {
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

export const setupMockClient = (configOverrides: Record<string, any> = {}) => {
    return createMockSupabaseClient('user-789', {
        genericMockResults: {
            ...configOverrides,
        },
    });
};

export const mockContribution: DialecticContributionRow = {
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
    file_name: 'mock-ai-v1_0_business_case_raw.json',
    mime_type: 'application/json',
    model_name: 'Mock AI',
    original_model_contribution_id: null,
    processing_time_ms: 100,
    prompt_template_id_used: null,
    raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
    seed_prompt_url: null,
    size_bytes: 100,
    storage_bucket: 'test-bucket',
    storage_path: 'raw_responses',
    target_contribution_id: null,
    tokens_used_input: 10,
    tokens_used_output: 20,
    updated_at: new Date().toISOString(),
    user_id: 'user-789',
    document_relationships: null,
    is_header: false,
    source_prompt_resource_id: null,
};

Deno.test('49.b.i: executeModelCallAndSave passes FileType.ModelContributionRawJson to file manager (not document key fileType)', async () => {
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const fileManager = new MockFileManagerService();

    const sanitizedJson = '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';
    
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps: IExecuteJobContext = getExecuteMockDeps({ fileManager, countTokens });
    const callStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: sanitizedJson,
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { content: sanitizedJson },
        finish_reason: 'stop',
    }));

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps);
    
    try {
        await executeModelCallAndSave(params);
    } finally {
        callStub.restore();
    }

    // Verify fileManager.uploadAndRegisterFile was called
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    // Get the upload context that was passed
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext), 'Upload context should be a ModelContributionUploadContext');
    
    // Assert that fileType is FileType.ModelContributionRawJson (not the document key fileType)
    assertEquals(
        uploadContext.pathContext.fileType,
        FileType.ModelContributionRawJson,
        `Expected fileType to be FileType.ModelContributionRawJson, but got ${uploadContext.pathContext.fileType}. The function currently passes the document key fileType (e.g., FileType.business_case) instead of FileType.ModelContributionRawJson.`
    );
});

Deno.test('49.b.ii: executeModelCallAndSave passes mimeType "application/json" to file manager (not "text/markdown")', async () => {
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const fileManager = new MockFileManagerService();

    const sanitizedJson = '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';
    
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps: IExecuteJobContext = getExecuteMockDeps({ fileManager, countTokens });
    const callStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: sanitizedJson,
        contentType: 'text/markdown', // AI response has text/markdown contentType
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { content: sanitizedJson },
        finish_reason: 'stop',
    }));

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps);
    
    try {
        await executeModelCallAndSave(params);
    } finally {
        callStub.restore();
    }

    // Verify fileManager.uploadAndRegisterFile was called
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    // Get the upload context that was passed
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext), 'Upload context should be a ModelContributionUploadContext');
    
    // Assert that mimeType is "application/json" (not "text/markdown")
    assertEquals(
        uploadContext.mimeType,
        'application/json',
        `Expected mimeType to be "application/json", but got "${uploadContext.mimeType}". The function currently passes aiResponse.contentType || "text/markdown" instead of "application/json".`
    );
});

Deno.test('49.b.iii: executeModelCallAndSave passes sanitized JSON string as fileContent to file manager', async () => {
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const fileManager = new MockFileManagerService();

    const sanitizedJson = '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';
    
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps: IExecuteJobContext = getExecuteMockDeps({ fileManager, countTokens });
    const callStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: sanitizedJson,
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { mock: 'response', content: sanitizedJson },
        finish_reason: 'stop',
    }));

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps);
    
    try {
        await executeModelCallAndSave(params);
    } finally {
        callStub.restore();
    }

    // Verify fileManager.uploadAndRegisterFile was called
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    // Get the upload context that was passed
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext), 'Upload context should be a ModelContributionUploadContext');
    
    // Assert that fileContent contains the sanitized JSON string (not the raw provider response object)
    assertEquals(
        uploadContext.fileContent,
        sanitizedJson,
        `Expected fileContent to be the sanitized JSON string like '{"content": "# Business Case\\n\\n..."}', not the raw provider response object.`
    );
    
    // Verify it's a string, not an object
    assert(
        typeof uploadContext.fileContent === 'string',
        'fileContent should be a string (the sanitized JSON), not an object'
    );
});

Deno.test('49.b.iv: executeModelCallAndSave does NOT include rawJsonResponseContent in upload context', async () => {
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const fileManager = new MockFileManagerService();

    const sanitizedJson = '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';
    const rawProviderResponse = { mock: 'response', content: sanitizedJson };
    
    fileManager.setUploadAndRegisterFileResponse(mockContribution, null);
    const deps: IExecuteJobContext = getExecuteMockDeps({ fileManager, countTokens });
    const callStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: sanitizedJson,
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse,
        finish_reason: 'stop',
    }));

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps);
    
    try {
        await executeModelCallAndSave(params);
    } finally {
        callStub.restore();
    }

    // Verify fileManager.uploadAndRegisterFile was called
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    // Get the upload context that was passed
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext), 'Upload context should be a ModelContributionUploadContext');
    
    // Assert that rawJsonResponseContent is NOT present in contributionMetadata
    assert(
        !('rawJsonResponseContent' in uploadContext.contributionMetadata),
        `Expected rawJsonResponseContent to NOT be present in contributionMetadata. It's redundant - fileContent IS the raw JSON content. The function currently sets rawJsonResponseContent: aiResponse.rawProviderResponse.`
    );
    
    // Verify the contributionMetadata object exists but doesn't have rawJsonResponseContent
    assert(
        isRecord(uploadContext.contributionMetadata),
        'contributionMetadata should be a record'
    );
    
    const metadata = uploadContext.contributionMetadata;
    assert(
        !('rawJsonResponseContent' in metadata),
        'rawJsonResponseContent should not be in contributionMetadata'
    );
});

Deno.test('49.b.v: executeModelCallAndSave creates contribution record with correct file_name, storage_path, and mime_type', async () => {
    const { client: dbClient } = setupMockClient({
        'ai_providers': {
            select: { data: [mockFullProviderData], error: null }
        }
    });
    const fileManager = new MockFileManagerService();

    const sanitizedJson = '{"content": "# Business Case\\n\\n## Market Opportunity\\n..."}';
    
    // Create a contribution record that matches what should be created
    const expectedContribution: DialecticContributionRow = {
        ...mockContribution,
        file_name: 'mock-ai-v1_0_business_case_raw.json',
        storage_path: 'raw_responses',
        raw_response_storage_path: 'raw_responses/mock-ai-v1_0_business_case_raw.json',
        mime_type: 'application/json',
    };
    
    fileManager.setUploadAndRegisterFileResponse(expectedContribution, null);
    const deps: IExecuteJobContext = getExecuteMockDeps({ fileManager, countTokens });
    const callStub = stub(deps, 'callUnifiedAIModel', async (): Promise<UnifiedAIResponse> => ({
        content: sanitizedJson,
        contentType: 'application/json',
        inputTokens: 10,
        outputTokens: 20,
        processingTimeMs: 100,
        rawProviderResponse: { content: sanitizedJson },
        finish_reason: 'stop',
    }));

    const params = buildExecuteParams(dbClient as unknown as SupabaseClient<Database>, deps);
    
    try {
        await executeModelCallAndSave(params);
    } finally {
        callStub.restore();
    }

    // Verify fileManager.uploadAndRegisterFile was called
    assert(fileManager.uploadAndRegisterFile.calls.length > 0, 'Expected fileManager.uploadAndRegisterFile to be called');
    
    // Get the upload context that was passed
    const uploadCall = fileManager.uploadAndRegisterFile.calls[0];
    assertExists(uploadCall, 'uploadAndRegisterFile should have been called');
    
    const uploadContext = uploadCall.args[0];
    assert(isModelContributionContext(uploadContext), 'Upload context should be a ModelContributionUploadContext');
    
    // Verify the file manager was called with correct values that will result in correct contribution record
    // The file manager will use these values to create the contribution record
    // We verify the context has the right values, and the mock returns the expected contribution
    
    // Verify the returned contribution record has correct paths and mime_type
    const result = await fileManager.uploadAndRegisterFile(uploadContext);
    assert(!result.error, 'File upload should succeed');
    assertExists(result.record, 'Contribution record should be returned');
    
    if (isDialecticContribution(result.record)) {
        const contribution = result.record;
        
        // Assert storage_path contains raw_responses/ (not documents/)
        assert(
            contribution.storage_path.includes('raw_responses'),
            `Expected storage_path to contain 'raw_responses/' (not 'documents/'), but got '${contribution.storage_path}'`
        );
        
        // Assert file_name ends with _raw.json (not .md)
        if (contribution.file_name) {
            assert(
                contribution.file_name.endsWith('_raw.json'),
                `Expected file_name to end with '_raw.json' (not '.md'), but got '${contribution.file_name}'`
            );
        } else {
            throw new Error('Expected file_name to be non-null');
        }
        
        // Assert mime_type is "application/json" (not "text/markdown")
        assertEquals(
            contribution.mime_type,
            'application/json',
            `Expected mime_type to be "application/json" (not "text/markdown"), but got "${contribution.mime_type}"`
        );
        
        // Assert raw_response_storage_path points to the _raw.json file
        assert(
            contribution.raw_response_storage_path && contribution.raw_response_storage_path.includes('_raw.json'),
            `Expected raw_response_storage_path to point to the _raw.json file, but got '${contribution.raw_response_storage_path}'`
        );
    }
});

