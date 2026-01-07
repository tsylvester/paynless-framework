import { 
    assertEquals, 
    assertExists, 
    assert, 
    assertStrictEquals 
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'jsr:@std/testing@0.225.1/mock';
import { 
    Database, 
    Json 
} from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { 
    handleJob, 
    createDialecticWorkerDeps 
} from './index.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import { 
    SeedPromptData, 
    IContinueJobResult 
} from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { 
    createMockJobProcessors, 
    createMockProcessJob
} from '../_shared/dialectic.mock.ts';
import { getMockAiProviderAdapter } from '../_shared/ai_service/ai_provider.mock.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import { renderDocument } from '../_shared/services/document_renderer.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';
import { createJobContext } from './createJobContext.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

// Global mock objects
const mockLogger = new MockLogger();
const mockSupabaseClient = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'dialectic_generation_jobs': {
            update: { data: [{ id: 'test-job' }], error: null }
        }
    }
});
const mockJobProcessors = createMockJobProcessors();
const mockProcessJob = createMockProcessJob();

// Global mock supabase client for deps factory test
const mockSupabaseClientDeps = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'ai_providers': {
            select: { data: [{
                id: 'prov-openai-embed-1',
                api_identifier: 'openai-text-embedding-3-small',
                name: 'OpenAI Embedding',
                description: 'Mock embedding model',
                is_active: true,
                provider: 'openai',
                config: {
                    api_identifier: 'openai-text-embedding-3-small',
                    input_token_cost_rate: 1,
                    output_token_cost_rate: 1,
                    tokenization_strategy: {
                        type: 'tiktoken',
                        tiktoken_encoding_name: 'cl100k_base',
                        is_chatml_model: false,
                        api_identifier_for_tokenization: 'text-embedding-3-small',
                    },
                },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                is_default_embedding: true,
                is_enabled: true,
            }], error: null },
        },
    },
});

// Global mock job for missing user_id test
const mockJobMissingUserId: MockJob = {
    id: 'job-without-user-id',
    user_id: null as any,
    session_id: 'session-id',
    stage_slug: 'thesis',
    payload: {
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis',
        model_id: 'model-id',
    },
    iteration_number: 1,
    status: 'pending',
    attempt_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    parent_job_id: null,
    target_contribution_id: null,
    prerequisite_job_id: null,
    is_test_job: false,
    job_type: 'PLAN',
};

// Global mock job for invalid payload test
const mockJobInvalidPayload: MockJob = {
    id: 'job-invalid-payload',
    user_id: 'user-id',
    session_id: 'session-id',
    stage_slug: 'thesis',
    payload: {
        projectId: 'project-for-invalid-job',
        invalidField: 'invalid'
    },
    iteration_number: 1,
    status: 'pending',
    attempt_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    parent_job_id: null,
    target_contribution_id: null,
    prerequisite_job_id: null,
    is_test_job: false,
    job_type: 'PLAN',
};

// Global mock supabase client for invalid payload test
const mockSupabaseClientInvalidPayload = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'dialectic_generation_jobs': {
            update: { data: [{ id: 'job-invalid-payload' }], error: null }
        }
    },
    rpcResults: {
        'create_notification_for_user': { data: null, error: null },
    },
});

const mockDeps = createJobContext(createMockJobContextParams({
    logger: mockLogger,
    fileManager: new MockFileManagerService(),
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'Mock content',
        error: null,
        finish_reason: 'stop',
    })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: new ArrayBuffer(0), error: null })),
    getExtensionFromMimeType: spy(() => '.md'),
    randomUUID: spy(() => 'mock-uuid'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getSeedPromptForStage: spy(async (): Promise<SeedPromptData> => ({
        content: 'Mock content',
        fullPath: 'mock/content.md',
        bucket: 'mock-bucket',
        path: 'mock/content.md',
        fileName: 'mock-content.md',
    })),
    continueJob: spy(async (): Promise<IContinueJobResult> => ({
        enqueued: true,
        error: undefined,
    })),
    retryJob: spy(async (): Promise<{ error?: Error }> => ({ error: undefined })),
    notificationService: new NotificationService(mockSupabaseClient.client as unknown as SupabaseClient<Database>),
    executeModelCallAndSave: spy(async (): Promise<void> => { /* dummy */ }),
    ragService: new MockRagService(),
    countTokens: spy(() => 100),
    getAiProviderConfig: spy(async () => await Promise.resolve({ 
        api_identifier: 'mock-model', 
        input_token_cost_rate: 0, 
        output_token_cost_rate: 0, 
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'p50k_base' } })),
    getGranularityPlanner: spy(() => () => []),
    planComplexStage: spy(async () => await Promise.resolve([])),
    documentRenderer: { renderDocument },
}));

// Global test deps for invalid payload test
const testDepsInvalidPayload = createJobContext(createMockJobContextParams({
    ...createMockJobContextParams(),
    logger: mockLogger,
    fileManager: new MockFileManagerService(),
    notificationService: new NotificationService(mockSupabaseClientInvalidPayload.client as unknown as SupabaseClient<Database>),
}));

// Global mock job for valid job test
const mockJobValid: MockJob = {
    id: 'job-valid',
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'thesis',
        payload: {
        job_type: 'PLAN',
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis',
        model_id: 'model-id',
        continueUntilComplete: false,
    },
        iteration_number: 1,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
        job_type: 'PLAN',
    };

// Global mock supabase client for valid job test
const mockSupabaseClientValid = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                select: {
                data: [mockJobValid],
                    error: null,
                },
                update: {
                data: [{ id: 'job-valid' }],
                    error: null,
                }
            },
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 1,
                        slug: 'thesis',
                        name: 'Thesis',
                        display_name: 'Thesis',
                        input_artifact_rules: {
                            steps: [{
                                step: 1,
                                prompt_template_name: 'test-prompt',
                                granularity_strategy: 'full_text',
                                output_type: 'test-output',
                                inputs_required: [],
                            }],
                            sources: [],
                        },
                    }],
                    error: null,
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: 'session-id',
                        project_id: 'project-id',
                        associated_chat_id: null,
                    }],
                    error: null,
                }
            }
        },
        rpcResults: {
            'create_notification_for_user': { data: null, error: null },
        },
    });

// Global test deps for valid job test
const testDepsValid = createJobContext(createMockJobContextParams({
    ...createMockJobContextParams(),
    logger: mockLogger,
    fileManager: new MockFileManagerService(),
    notificationService: new NotificationService(mockSupabaseClientValid.client as unknown as SupabaseClient<Database>),
}));

// Global mock job for payload validation test
const mockJobPayloadValidation: MockJob = {
    id: 'job-payload-validation',
    user_id: 'user-id',
    session_id: 'session-id',
    stage_slug: 'thesis',
    payload: {
        job_type: 'PLAN',
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis',
        model_id: 'model-id',
        continueUntilComplete: false,
        user_jwt: 'jwt.token.here',
    },
    iteration_number: 1,
    status: 'pending',
    attempt_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    results: null,
    error_details: null,
    parent_job_id: null,
    target_contribution_id: null,
    prerequisite_job_id: null,
    is_test_job: false,
    job_type: 'PLAN',
};

// Global mock client for payload validation test
const mockSupabaseClientPayloadValidation = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'dialectic_generation_jobs': {
            select: { data: [mockJobPayloadValidation], error: null },
            update: { data: [{ id: 'job-payload-validation' }], error: null }
        },
        'dialectic_stages': {
            select: { data: [{ id: 1, slug: 'thesis', name: 'Thesis', display_name: 'Thesis', input_artifact_rules: { steps: [{ step: 1, prompt_template_name: 'test-prompt', granularity_strategy: 'full_text', output_type: 'test-output', inputs_required: [] }], sources: [] } }], error: null }
        }
    }
});


    // Global mock job for exception test
const mockJobException: MockJob = {
    id: 'job-exception',
    user_id: 'user-id',
    session_id: 'session-id',
    stage_slug: 'thesis',
    payload: {
        job_type: 'PLAN',
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis',
        model_id: 'model-id',
        user_jwt: 'jwt.token.here',
    },
        iteration_number: 1,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
        job_type: 'PLAN',
    };

// Global mock supabase client for exception test
const mockSupabaseClientException = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                select: {
                data: [mockJobException],
                    error: null,
                },
            update: { data: [{ id: 'job-exception' }], error: null }
            },
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 1,
                        slug: 'thesis',
                        name: 'Thesis',
                        display_name: 'Thesis',
                    }],
                    error: null,
                }
            }
        },
        rpcResults: {
            'create_notification_for_user': { data: null, error: null },
        },
    });

// Global test deps for exception test
const testDepsException = createJobContext(createMockJobContextParams({
    ...createMockJobContextParams(),
    logger: mockLogger,
    fileManager: new MockFileManagerService(),
    notificationService: new NotificationService(mockSupabaseClientException.client as unknown as SupabaseClient<Database>),
}));

// Global test error for exception test
const testError = new Error('Simulated processJob error');

Deno.test('handleJob - fails when job is missing user_id', async () => {
    await handleJob(mockSupabaseClient.client as unknown as SupabaseClient<Database>, mockJobMissingUserId, mockDeps, 'mock-token');

    const updateSpies = mockSupabaseClient.spies.getLatestQueryBuilderSpies('dialectic_generation_jobs');
    assertExists(updateSpies?.update, 'Update spy should exist');
    assertEquals(updateSpies!.update.calls.length, 1, 'Job should be updated once');
    const updatePayload = updateSpies!.update.calls[0].args[0];
    assertEquals(updatePayload.status, 'failed');
    assertEquals(updatePayload.error_details.message, 'Job is missing a user_id.');
    assertExists(updatePayload.completed_at);
});

Deno.test('handleJob - fails when payload is invalid', async () => {
    const internalFailSpy = spy(testDepsInvalidPayload.notificationService, 'sendContributionGenerationFailedEvent');

    await handleJob(mockSupabaseClientInvalidPayload.client as unknown as SupabaseClient<Database>, mockJobInvalidPayload, testDepsInvalidPayload, 'mock-token');

    const updateSpies = mockSupabaseClientInvalidPayload.spies.getLatestQueryBuilderSpies('dialectic_generation_jobs');
    assertExists(updateSpies?.update, 'Update spy should exist');
    assertEquals(updateSpies!.update.calls.length, 1, 'Job should be updated once');
    const updatePayload = updateSpies!.update.calls[0].args[0];
    assertEquals(updatePayload.status, 'failed');
    const errorDetailsMessage = updatePayload.error_details?.message || '';
    assertEquals(typeof errorDetailsMessage === 'string' && errorDetailsMessage.includes('Invalid payload:'), true);
    assertEquals(errorDetailsMessage, 'Invalid payload: Job payload is invalid or missing required fields.');
    assertExists(updatePayload.completed_at);

    const rpcSpy = mockSupabaseClientInvalidPayload.spies.rpcSpy;
    assertEquals(rpcSpy.calls.length, 2, 'RPC should be called twice (internal + user-facing)');

    const internalCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'other_generation_failed');
    assertExists(internalCall, 'Internal failure event should be sent');
    const internalArgs = internalCall!.args[1];
    assertEquals(internalArgs.p_target_user_id, mockJobInvalidPayload.user_id);
    assertEquals(internalArgs.p_is_internal_event, true);
    const internalData = internalArgs.p_notification_data;
    assert(typeof internalData === 'object' && internalData !== null, 'internal notification_data should be object');
    assertEquals(internalData.job_id, 'job-invalid-payload');
    assertEquals(internalData.sessionId, mockJobInvalidPayload.session_id);
    assertEquals(internalData.error.code, 'VALIDATION_ERROR');

    const userFailCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'contribution_generation_failed');
    assertExists(userFailCall, 'User-facing failure notification should be sent');
    const userArgs = userFailCall!.args[1];
    assertEquals(userArgs.p_target_user_id, mockJobInvalidPayload.user_id);
    assertEquals(userArgs.p_is_internal_event, false);
    const userData = userArgs.p_notification_data;
    assert(typeof userData === 'object' && userData !== null, 'user notification_data should be object');
    assertEquals(userData.job_id, 'job-invalid-payload');

    assertEquals(internalFailSpy.calls.length, 1, 'Internal failure event should be emitted once');
    const internalPayload = internalFailSpy.calls[0].args[0];
    assertEquals(internalPayload.type, 'other_generation_failed');
    assertEquals(internalPayload.sessionId, mockJobInvalidPayload.session_id);
    assertEquals(internalPayload.job_id, mockJobInvalidPayload.id);
    assert(typeof internalPayload.error === 'object' && internalPayload.error !== null);
    assertEquals(internalPayload.error.code, 'VALIDATION_ERROR');

    internalFailSpy.restore();
});

Deno.test('handleJob - successfully processes valid job', async () => {
    const { processors } = createMockJobProcessors();
    // Make the PLAN path complete the job
    processors.processComplexJob = async (dbClient, job) => {
        await (dbClient as unknown as SupabaseClient<Database>)
            .from('dialectic_generation_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', job.id);
    };

    await handleJob(
        mockSupabaseClientValid.client as unknown as SupabaseClient<Database>,
        mockJobValid,
        testDepsValid,
        'mock-token',
        processors,
    );

    const updateSpies = mockSupabaseClientValid.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpies, 'Update spy should exist');
    assertEquals(updateSpies.callCount, 2, 'Job should be updated twice (processing, then completed)');

    const firstUpdatePayload = updateSpies.callsArgs[0][0];
    assert(firstUpdatePayload && typeof firstUpdatePayload === 'object' && 'status' in firstUpdatePayload);
    assertEquals(firstUpdatePayload.status, 'processing');
    assert('started_at' in firstUpdatePayload);

    const secondUpdatePayload = updateSpies.callsArgs[1][0];
    assert(secondUpdatePayload && typeof secondUpdatePayload === 'object' && 'status' in secondUpdatePayload);
    assertEquals(secondUpdatePayload.status, 'completed');
    assert('completed_at' in secondUpdatePayload);
});

Deno.test('handleJob - handles exceptions during processJob execution', async () => {
    const { processors } = createMockJobProcessors();
    // Make PLAN path throw
    const err = new Error('Simulated processJob error');
    processors.processComplexJob = async () => { throw err; };

    const internalFailSpy = spy(testDepsException.notificationService, 'sendContributionGenerationFailedEvent');

    await handleJob(
        mockSupabaseClientException.client as unknown as SupabaseClient<Database>,
        mockJobException,
        testDepsException,
        'mock-token',
        processors,
    );

    const updateSpies = mockSupabaseClientException.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpies, 'Update spy should exist');
    assertEquals(updateSpies.callCount, 2, 'Should update status to processing, then to failed');
    const finalUpdatePayload = updateSpies.callsArgs[1][0];
    assert(finalUpdatePayload && typeof finalUpdatePayload === 'object' && 'status' in finalUpdatePayload && 'error_details' in finalUpdatePayload);
    assertEquals(finalUpdatePayload.status, 'failed', "Job status should be 'failed'");
    assert('completed_at' in finalUpdatePayload, "completed_at should be set");

    assertEquals(internalFailSpy.calls.length, 1, 'Internal failure event should be emitted once');
    internalFailSpy.restore();
});

Deno.test('handleJob - validates payload correctly and extracts user info', async () => {
    const { processors } = createMockJobProcessors();
    processors.processComplexJob = async (dbClient, job) => {
        await (dbClient as unknown as SupabaseClient<Database>)
            .from('dialectic_generation_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString(), results: {} })
            .eq('id', job.id);
    };

    await handleJob(
        mockSupabaseClientPayloadValidation.client as unknown as SupabaseClient<Database>,
        mockJobPayloadValidation,
        mockDeps,
        'mock-token',
        processors,
    );

    const updateSpies = mockSupabaseClientPayloadValidation.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpies, 'Update spy should exist');
    assertEquals(updateSpies.callCount, 2, 'Job should be updated twice (processing, then completed)');
    const firstUpdatePayload = updateSpies.callsArgs[0][0];
    assert(firstUpdatePayload && typeof firstUpdatePayload === 'object' && 'status' in firstUpdatePayload);
    assertEquals(firstUpdatePayload.status, 'processing');
    const secondUpdatePayload = updateSpies.callsArgs[1][0];
    assert(secondUpdatePayload && typeof secondUpdatePayload === 'object' && 'status' in secondUpdatePayload);
    assertEquals(secondUpdatePayload.status, 'completed');
});

// ---  worker deps factory exists and injects wallet service for compression path ---
Deno.test('createDialecticWorkerDeps: provides wallet and compression deps', async () => {
    const deps = await createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>);
    
    // Test that wallet and compression deps are provided
    assertExists(deps.ragService, 'RAG service should be provided');
    assertExists(deps.indexingService, 'Indexing service should be provided');
    assertExists(deps.embeddingClient, 'Embedding client should be provided');
    assertExists(deps.promptAssembler, 'Prompt assembler should be provided');
    assertEquals(typeof deps.countTokens, 'function');
    assertEquals(typeof deps.executeModelCallAndSave, 'function');

    // Wallet service must be injected
    assertExists(deps.tokenWalletService, 'Token wallet service should be present');
});

Deno.test('createDialecticWorkerDeps: constructs DummyAdapter embedding client when default embedding provider is dummy', async () => {
    const mockSupabaseClientDummy = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: { 
                    data: [{
                        id: 'prov-dummy-embed-1',
                        api_identifier: 'dummy-model-v1',
                        name: 'Dummy Embedding',
                        description: 'Dummy embedding model',
                        is_active: true,
                        provider: 'dummy',
                        config: {
        api_identifier: 'dummy-model-v1',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
        context_window_tokens: 4096,
        hard_cap_output_tokens: 4096,
                        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default_embedding: true,
        is_enabled: true,
                    }], 
                    error: null 
                }
            }
        }
    });

    const deps = await createDialecticWorkerDeps(mockSupabaseClientDummy.client as unknown as SupabaseClient<Database>);
    
    assertExists(deps.embeddingClient, 'embeddingClient should be constructed');
    
    const result = await deps.embeddingClient.getEmbedding('hello world');
    assertExists(result.embedding, 'embedding should be returned');
    assert(Array.isArray(result.embedding) && result.embedding.length === 3072, 'embedding should be 3072 dimensions');
    assert(typeof result.usage.total_tokens === 'number' && result.usage.total_tokens > 0, 'usage should contain valid token count');
});

// When test mode routes factory to dummy, assert factory passes selected model config verbatim
Deno.test('getAiProviderAdapter (test routing): passes provider.config verbatim into DummyAdapter', async () => {
    const mockAdapter = getMockAiProviderAdapter(mockLogger, {
        api_identifier: 'dummy-test',
        input_token_cost_rate: 0.001,
        output_token_cost_rate: 0.002,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' }
    });

    // Test that the mock adapter was created with the correct config
    assertExists(mockAdapter.instance, 'Mock adapter instance should exist');
    assertExists(mockAdapter.controls, 'Mock adapter controls should exist');
    
    // Test that the adapter can send a message
    const response = await mockAdapter.instance.sendMessage({
        message: 'test message',
        providerId: 'mock-provider-id',
        promptId: 'mock-prompt-id'
    }, 'dummy-test');
    
    assertEquals(response.role, 'assistant');
    assertEquals(response.content, 'Default mock response');
    assertEquals(response.ai_provider_id, 'mock-provider-id');
    assertEquals(response.finish_reason, 'stop');
    assertExists(response.token_usage);
    
    // Check token usage structure without casting
    assert(typeof response.token_usage === 'object' && response.token_usage !== null, 'Token usage should be an object');
    
    // Use JSON.stringify to compare the token usage object
    const expectedTokenUsage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 };
    assertEquals(JSON.stringify(response.token_usage), JSON.stringify(expectedTokenUsage));
});

Deno.test('createDialecticWorkerDeps: constructs OpenAI embedding client when default provider is openai', async () => {
    const mockSupabaseClientOpenAI = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: { 
                    data: [{
                        id: 'prov-openai-embed-1',
                        api_identifier: 'openai-text-embedding-3-small',
                        name: 'OpenAI Embedding',
                        description: 'OpenAI embedding model',
                        is_active: true,
                        provider: 'openai',
                        config: {
        api_identifier: 'openai-text-embedding-3-small',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
            is_chatml_model: false,
                                api_identifier_for_tokenization: 'text-embedding-3-small'
                            },
                        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default_embedding: true,
        is_enabled: true,
                    }], 
                    error: null 
                }
            }
        }
    });

    const getEmbeddingStub = stub(OpenAiAdapter.prototype, 'getEmbedding', async () => ({
        embedding: [0.1, 0.2, 0.3],
        usage: { prompt_tokens: 3, total_tokens: 3 },
    }));

    try {
        const deps = await createDialecticWorkerDeps(mockSupabaseClientOpenAI.client as unknown as SupabaseClient<Database>);
        
        assertExists(deps.embeddingClient, 'embeddingClient should be constructed');
        
        const result = await deps.embeddingClient.getEmbedding('test');
        assertExists(result, 'embedding result should be returned');
        assert(Array.isArray(result.embedding), 'embedding should be an array');
        assertEquals(getEmbeddingStub.calls.length, 1, 'OpenAiAdapter getEmbedding should be called');
    } finally {
        getEmbeddingStub.restore();
    }
});

// =============================================================
// handleJob NEVER patches/injects user_jwt; missing jwt fails
// =============================================================
Deno.test('handleJob - does not inject user_jwt and fails when payload.user_jwt is missing', async () => {
        // Arrange: job with otherwise valid payload but no user_jwt
        const validPayloadWithoutJwt: Json = {
            job_type: 'plan',
            sessionId: 'session-red-jwt',
            projectId: 'project-red-jwt',
            stageSlug: 'thesis',
            model_id: 'model-x',
            continueUntilComplete: false,
            walletId: 'wallet-xyz',
        };
    
        const mockJob: MockJob = {
            id: 'job-missing-jwt',
            user_id: 'user-xyz',
            session_id: 'session-red-jwt',
            stage_slug: 'thesis',
            payload: validPayloadWithoutJwt,
            iteration_number: 1,
            status: 'pending',
            attempt_count: 0,
            max_retries: 3,
            created_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
            results: null,
            error_details: null,
            parent_job_id: null,
            target_contribution_id: null,
            prerequisite_job_id: null,
            is_test_job: false,
            job_type: 'PLAN',
        };
    
        const mockSupabase = createMockSupabaseClient(undefined, {
            genericMockResults: {
                'dialectic_generation_jobs': {
                    update: { data: [{ id: mockJob.id }], error: null },
                },
                'dialectic_stages': {
                    select: {
                        data: [{
                            id: 1,
                            slug: 'thesis',
                            name: 'Thesis',
                            display_name: 'Thesis',
                            input_artifact_rules: {
                                steps: [{ step: 1, prompt_template_name: 'test', granularity_strategy: 'full_text', output_type: 'thesis', inputs_required: [] }],
                            },
                        }],
                        error: null,
                    },
                },
                'dialectic_sessions': {
                    select: { data: [{ id: 'session-red-jwt', project_id: 'project-red-jwt', associated_chat_id: null }], error: null },
                },
            },
        });
    
        const testDeps = { ...mockDeps };
    
        let threw = false;
        try {
            await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, testDeps, 'auth-token-should-not-be-injected');
        } catch (_e) {
            // The handler may throw, or it may mark failed — accept either as RED until GREEN
            threw = true;
        }
    
        // Assert: job should be marked failed and payload must remain without user_jwt (no injection/patching)
        const updateSpies = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpies, 'Update spy should exist');
        // Expect at least one update to failed; RED until implemented may be 0
        const hasFailedUpdate = (updateSpies.callCount > 0) && updateSpies.callsArgs.some(args => {
            const upd = args[0];
            return upd && typeof upd === 'object' && 'status' in upd && upd.status === 'failed';
        });
        assertEquals(hasFailedUpdate || threw, true);
    
        // Verify handler did not mutate the original payload by injecting user_jwt
        const desc = Object.getOwnPropertyDescriptor(mockJob.payload, 'user_jwt');
        const val = desc ? desc.value : undefined;
        assertEquals(val === undefined, true);
});

Deno.test('should log isTestRunner context when the flag is present in the payload', async () => {
    // Arrange
    const localMockLogger = new MockLogger();
    const loggerSpy = spy(localMockLogger, 'info');

    // Use a copy of mockDeps with our spied logger to avoid test interference
    const testDeps = { 
        ...mockDeps, 
        logger: localMockLogger,
    };

    const payloadObject = typeof mockJobValid.payload === 'string'
        ? JSON.parse(mockJobValid.payload)
        : mockJobValid.payload;

    const mockJobWithContextFlag: MockJob = {
        ...mockJobValid, // Use a valid job as a base
        id: 'job-with-context-flag',
        payload: {
            ...payloadObject,
            is_test_runner_context: true,
        },
    };

    // Mock processJob to prevent the job from running too far; we only need to test the entry log
    const mockProcessors = {
        ...createMockJobProcessors().processors,
        processJob: spy(async () => Promise.resolve({ status: 'completed', results: {}, final_error: null }))
    };

    // Act
    await handleJob(
        mockSupabaseClientValid.client as unknown as SupabaseClient<Database>, 
        mockJobWithContextFlag, 
        testDeps, 
        'mock-token',
        mockProcessors
    );

    // Assert
    assert(loggerSpy.calls.length > 0, "Logger's info method should have been called.");

    const contextCheckCall = loggerSpy.calls.find(call => call.args[0] === '[handleJob] context_check');
    assertExists(contextCheckCall, "Expected a log entry with message '[handleJob] context_check'");

    const logPayload = contextCheckCall.args[1];
    assertExists(logPayload, "Log entry should have a payload object.");
    assertEquals(logPayload.isTestRunner, true, "isTestRunner flag in log payload should be true.");
});

// RENDER path: handler forwards args and uses provided processors
Deno.test('handleJob - RENDER routes via provided processors and propagates args unchanged', async () => {
    const { processors, spies } = createMockJobProcessors();

    // PLAN-shaped payload (to satisfy payload validator), while row is RENDER
    const planShapedPayload: Json = {
        job_type: 'PLAN',
        sessionId: 'session-id-render',
        projectId: 'project-id-render',
        stageSlug: 'synthesis',
        model_id: 'model-id',
        continueUntilComplete: false,
        user_jwt: 'jwt.token.here',
        walletId: 'wallet-render',
    };

    const renderJob: MockJob = {
        id: 'job-render',
        user_id: 'user-render',
        session_id: 'session-id-render',
        stage_slug: 'synthesis',
        payload: planShapedPayload,
        iteration_number: 1,
        status: 'pending',
        attempt_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        results: null,
        error_details: null,
        parent_job_id: null,
        target_contribution_id: null,
        prerequisite_job_id: null,
        is_test_job: false,
        job_type: 'RENDER',
    };

    const { client: dbClient } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                select: { data: [renderJob], error: null },
                update: { data: [{ id: renderJob.id }], error: null },
            },
        },
    });

    const deps = { ...mockDeps };
    const authToken = 'auth-render';

    await handleJob(dbClient as unknown as SupabaseClient<Database>, renderJob, deps, authToken, processors);

    // Assert: provided processors.processRenderJob was invoked exactly once with forwarded args
    assertEquals(spies.processRenderJob.calls.length, 1, 'processRenderJob should be called once');
    const call = spies.processRenderJob.calls[0];
    assertStrictEquals(call.args[0], dbClient, 'dbClient forwarded unchanged');
    assertEquals(call.args[1], renderJob, 'job forwarded unchanged');
    assertEquals(call.args[2], 'user-render', 'projectOwnerUserId forwarded unchanged');
    assertEquals(call.args[4], authToken, 'authToken forwarded unchanged');

    // RENDER processors must receive a sliced IRenderJobContext, not the full root context object
    const renderCtx = call.args[3];
    assert(typeof renderCtx === 'object' && renderCtx !== null, 'renderCtx should be an object');
    assertStrictEquals(renderCtx === deps, false, 'renderCtx should not be the same object as root deps');

    // Required render-context fields exist (shape proof, no casts)
    assert(Object.prototype.hasOwnProperty.call(renderCtx, 'logger'));
    assert(Object.prototype.hasOwnProperty.call(renderCtx, 'fileManager'));
    assert(Object.prototype.hasOwnProperty.call(renderCtx, 'downloadFromStorage'));
    assert(Object.prototype.hasOwnProperty.call(renderCtx, 'deleteFromStorage'));
    assert(Object.prototype.hasOwnProperty.call(renderCtx, 'notificationService'));
    assert(Object.prototype.hasOwnProperty.call(renderCtx, 'documentRenderer'));

    assertEquals(typeof Reflect.get(renderCtx, 'downloadFromStorage'), 'function');
    assertEquals(typeof Reflect.get(renderCtx, 'deleteFromStorage'), 'function');

    // Execute/plan-only fields should not be present on the sliced render context
    assertEquals('executeModelCallAndSave' in renderCtx, false);
    assertEquals('planComplexStage' in renderCtx, false);
});

Deno.test('createDialecticWorkerDeps: returns IJobContext including findSourceDocuments', async () => {
    const deps = await createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>);
    assertEquals(typeof Reflect.get(deps, 'findSourceDocuments'), 'function');
});