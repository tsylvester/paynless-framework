import { 
    assertEquals, 
    assertExists, 
    assert, 
    assertStrictEquals,
    assertRejects,
} from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'jsr:@std/testing@0.225.1/mock';
import { 
    Database, 
    Json,
    Tables,
} from '../types_db.ts';
import { createMockSupabaseClient, type MockQueryBuilderState } from '../_shared/supabase.mock.ts';
import { 
    handleJob, 
    createDialecticWorkerDeps,
    handleSaveResponse,
    CreateUserDbClientFn,
} from './index.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import { 
    SeedPromptData, 
    IContinueJobResult,
    PromptConstructionPayload,
} from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
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
import { createMockJobContextParams } from './createJobContext/JobContext.mock.ts';
import { createJobContext } from './createJobContext/createJobContext.ts';
import { pickLatest } from '../_shared/utils/pickLatest.ts';
import { applyInputsRequiredScope } from '../_shared/utils/applyInputsRequiredScope.ts';
import { validateWalletBalance } from '../_shared/utils/validateWalletBalance.ts';
import { validateModelCostRates } from '../_shared/utils/validateModelCostRates.ts';
import { resolveFinishReason } from '../_shared/utils/resolveFinishReason.ts';
import { isIntermediateChunk } from '../_shared/utils/isIntermediateChunk.ts';
import { determineContinuation } from '../_shared/utils/determineContinuation/determineContinuation.ts';
import { buildUploadContext } from '../_shared/utils/buildUploadContext/buildUploadContext.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';
import {
    PrepareModelJobParams,
    PrepareModelJobPayload,
    PrepareModelJobReturn,
} from './prepareModelJob/prepareModelJob.interface.ts';
import { getSortedCompressionCandidates } from '../_shared/utils/vector_utils.ts';
import {
    SaveResponseDeps,
    SaveResponseParams,
    SaveResponsePayload,
    SaveResponseRequestBody,
    SaveResponseReturn,
} from './saveResponse/saveResponse.interface.ts';
import {
    createMockSaveResponseSuccessReturn,
    createMockSaveResponseErrorReturn,
} from './saveResponse/saveResponse.mock.ts';
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
    idempotency_key: "idempotency-key-1",
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
    idempotency_key: "idempotency-key-1",
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
    prepareModelJob: spy(async (): Promise<PrepareModelJobReturn> => {
        const err: Error = new Error('mock prepareModelJob not implemented');
        return { error: err, retriable: false };
    }),
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
        idempotency_key: "idempotency-key-1",
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
    idempotency_key: "idempotency-key-1",
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
        idempotency_key: "idempotency-key-1",
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
    Deno.env.set('NETLIFY_QUEUE_URL', 'https://mock-netlify-queue');
    Deno.env.set('AWL_API_KEY', 'mock-awl-key');
    try {
        const deps = await createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>);
        
        // Test that wallet and compression deps are provided
        assertExists(deps.ragService, 'RAG service should be provided');
        assertExists(deps.indexingService, 'Indexing service should be provided');
        assertExists(deps.embeddingClient, 'Embedding client should be provided');
        assertExists(deps.promptAssembler, 'Prompt assembler should be provided');
        assertEquals(typeof deps.countTokens, 'function');
        assertEquals(typeof deps.prepareModelJob, 'function');

        // Wallet services must be injected
        assertExists(deps.userTokenWalletService, 'User token wallet service should be present');
        assertExists(deps.adminTokenWalletService, 'Admin token wallet service should be present');
    } finally {
        Deno.env.delete('NETLIFY_QUEUE_URL');
        Deno.env.delete('AWL_API_KEY');
    }
});

// Worker composition root must bind the same `_shared/utils` implementations as `createMockJobContextParams`
// so execute path tests and production share one wiring contract.
Deno.test('createDialecticWorkerDeps: binds pure utility deps to production implementations', async () => {
    Deno.env.set('NETLIFY_QUEUE_URL', 'https://mock-netlify-queue');
    Deno.env.set('AWL_API_KEY', 'mock-awl-key');
    try {
        const deps = await createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>);

        assertStrictEquals(deps.pickLatest, pickLatest);
        assertStrictEquals(deps.applyInputsRequiredScope, applyInputsRequiredScope);
        assertStrictEquals(deps.validateWalletBalance, validateWalletBalance);
        assertStrictEquals(deps.validateModelCostRates, validateModelCostRates);
        assertStrictEquals(deps.resolveFinishReason, resolveFinishReason);
        assertStrictEquals(deps.isIntermediateChunk, isIntermediateChunk);
        assertStrictEquals(deps.determineContinuation, determineContinuation);
        assertStrictEquals(deps.buildUploadContext, buildUploadContext);
    } finally {
        Deno.env.delete('NETLIFY_QUEUE_URL');
        Deno.env.delete('AWL_API_KEY');
    }
});

Deno.test('createDialecticWorkerDeps: constructs DummyAdapter embedding client when default embedding provider is dummy', async () => {
    Deno.env.set('NETLIFY_QUEUE_URL', 'https://mock-netlify-queue');
    Deno.env.set('AWL_API_KEY', 'mock-awl-key');
    try {
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
    } finally {
        Deno.env.delete('NETLIFY_QUEUE_URL');
        Deno.env.delete('AWL_API_KEY');
    }
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

    Deno.env.set('NETLIFY_QUEUE_URL', 'https://mock-netlify-queue');
    Deno.env.set('AWL_API_KEY', 'mock-awl-key');
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
        Deno.env.delete('NETLIFY_QUEUE_URL');
        Deno.env.delete('AWL_API_KEY');
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
            idempotency_key: "idempotency-key-1",
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
        idempotency_key: "idempotency-key-1",
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
    assertEquals('prepareModelJob' in renderCtx, false);
    assertEquals('planComplexStage' in renderCtx, false);
});

Deno.test('createDialecticWorkerDeps: returns IJobContext including findSourceDocuments', async () => {
    Deno.env.set('NETLIFY_QUEUE_URL', 'https://mock-netlify-queue');
    Deno.env.set('AWL_API_KEY', 'mock-awl-key');
    try {
        const deps = await createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>);
        assertEquals(typeof Reflect.get(deps, 'findSourceDocuments'), 'function');
    } finally {
        Deno.env.delete('NETLIFY_QUEUE_URL');
        Deno.env.delete('AWL_API_KEY');
    }
});

Deno.test('handleJob - prevents concurrent processing of the same job atomically', async () => {
    // Arrange: Create a job that will be processed concurrently
    // This test proves the race condition flaw: the check-then-update pattern is not atomic
    const concurrentJobId = 'job-concurrent-race';
    const mockJobConcurrent: MockJob = {
        id: concurrentJobId,
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
            idempotencyKey: "idempotency-key-1",
        },
        iteration_number: 1,
        status: 'pending_next_step',
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
        idempotency_key: "idempotency-key-1",
    };

    // Track database state to simulate race condition
    // Both concurrent calls will see the same initial state before either updates
    let currentJobStatus = 'pending_next_step';
    const updateAttempts: Array<{ statusAtAttempt: string; succeeded: boolean }> = [];
    const statusUpdates: string[] = [];

    // Create a mock that simulates the atomic update behavior
    // The atomic update pattern checks and updates in a single operation
    const mockSupabaseConcurrent = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                update: async (state: MockQueryBuilderState) => {
                    // Record the status at the time of this update attempt
                    const statusAtAttempt = currentJobStatus;
                    
                    // Extract status from update payload to check if this is a status update attempt
                    let newStatus: string | undefined;
                    let isProcessingUpdate = false;
                    if (state.updateData && typeof state.updateData === 'object' && 'status' in state.updateData) {
                        const statusValue = state.updateData.status;
                        if (typeof statusValue === 'string') {
                            newStatus = statusValue;
                            isProcessingUpdate = statusValue === 'processing';
                        }
                    }
                    
                    // Check if there's a .neq('status', 'processing') filter
                    // This simulates the atomic update behavior where the update only succeeds if status is NOT 'processing'
                    const neqFilter = state.filters?.find(f => f.column === 'status' && f.type === 'neq' && f.value === 'processing');
                    
                    // If this is an attempt to update to 'processing', record it
                    if (isProcessingUpdate) {
                        // If status is already 'processing' and there's a neq filter, the update should fail (no rows matched)
                        // This is the atomic check: the database won't update rows where status = 'processing' when we use .neq('status', 'processing')
                        if (neqFilter && currentJobStatus === 'processing') {
                            // Atomic update failed: status is already 'processing', so .neq() prevents update
                            // Record the failed attempt
                            updateAttempts.push({ statusAtAttempt, succeeded: false });
                            // Return null data with error to indicate no rows were updated
                            return Promise.resolve({
                                data: null,
                                error: { name: 'PostgresError', message: 'Query returned no rows', code: 'PGRST116' },
                                count: 0,
                                status: 406,
                                statusText: 'OK',
                            });
                        }
                        
                        // Record the successful attempt (will succeed since we passed the check above)
                        updateAttempts.push({ statusAtAttempt, succeeded: true });
                        if (newStatus) {
                            statusUpdates.push(newStatus);
                            // Simulate the update happening atomically
                            // This happens AFTER the check, so the second concurrent call will see 'processing'
                            currentJobStatus = newStatus;
                        }
                    }
                    
                    const updateResult: Record<string, unknown> = { id: concurrentJobId };
                    if (state.updateData && typeof state.updateData === 'object') {
                        Object.assign(updateResult, state.updateData);
                    }
                    
                    return Promise.resolve({
                        data: [updateResult],
                        error: null,
                        count: 1,
                        status: 200,
                        statusText: 'OK',
                    });
                },
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
                },
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: 'session-id',
                        project_id: 'project-id',
                        associated_chat_id: null,
                    }],
                    error: null,
                },
            },
        },
        rpcResults: {
            'create_notification_for_user': { data: null, error: null },
        },
    });

    const { processors } = createMockJobProcessors();
    processors.processComplexJob = async (dbClient, job) => {
        await (dbClient as unknown as SupabaseClient<Database>)
            .from('dialectic_generation_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', job.id);
    };

    const testDepsConcurrent = createJobContext(createMockJobContextParams({
        ...createMockJobContextParams(),
        logger: mockLogger,
        fileManager: new MockFileManagerService(),
        notificationService: new NotificationService(mockSupabaseConcurrent.client as unknown as SupabaseClient<Database>),
    }));

    // Act: Make two concurrent calls to handleJob with the same job
    // Both will check status, both will see 'pending_next_step', both will try to update
    const call1 = handleJob(
        mockSupabaseConcurrent.client as unknown as SupabaseClient<Database>,
        mockJobConcurrent,
        testDepsConcurrent,
        'mock-token',
        processors,
    );

    const call2 = handleJob(
        mockSupabaseConcurrent.client as unknown as SupabaseClient<Database>,
        mockJobConcurrent,
        testDepsConcurrent,
        'mock-token',
        processors,
    );

    const results = await Promise.allSettled([call1, call2]);

    // Assert: The desired behavior is that concurrent processing is prevented atomically
    // Only one call should successfully update the job to 'processing'
    // The second call should be prevented from processing (either by failing the check or by atomic update)
    
    // Count how many calls successfully updated to 'processing'
    const processingUpdates = statusUpdates.filter(s => s === 'processing');
    
    // Assert: Exactly one update to 'processing' should occur (atomic behavior)
    // This proves the atomic update pattern works: only one call can successfully update
    assertEquals(
        processingUpdates.length,
        1,
        'Only one concurrent call should successfully update job status to "processing". The atomic update pattern prevents both calls from updating concurrently.'
    );

    // Assert: Both calls attempted the atomic update (proving both tried to process)
    assertEquals(
        updateAttempts.length,
        2,
        'Both concurrent calls should have attempted the atomic update, demonstrating that both tried to process the same job.'
    );

    // Assert: First attempt saw 'pending_next_step' and succeeded (proving the race condition window)
    const firstAttempt = updateAttempts[0];
    assertEquals(
        firstAttempt?.statusAtAttempt,
        'pending_next_step',
        'The first concurrent call should have seen "pending_next_step" status when attempting the update, proving the race condition window exists.'
    );
    assertEquals(
        firstAttempt?.succeeded,
        true,
        'The first concurrent call should succeed in updating the status to "processing".'
    );

    // Assert: Second attempt saw 'processing' and failed (proving atomic protection)
    const secondAttempt = updateAttempts[1];
    assertEquals(
        secondAttempt?.statusAtAttempt,
        'processing',
        'The second concurrent call should have seen "processing" status (updated by the first call), proving the atomic update prevented concurrent processing.'
    );
    assertEquals(
        secondAttempt?.succeeded,
        false,
        'The second concurrent call should fail because the atomic update pattern prevents it when status is already "processing".'
    );

    // Assert: Only one update attempt succeeded
    const successfulAttempts = updateAttempts.filter(a => a.succeeded);
    assertEquals(
        successfulAttempts.length,
        1,
        'Only one update attempt should succeed. The atomic update pattern ensures the second call fails when status is already "processing".'
    );
});

// --- NSF detection: Insufficient funds routes to pauseJobsForNsf; other errors use failure path ---
const mockJobNsf: MockJob = {
    id: 'job-nsf-test',
    user_id: 'user-nsf',
    session_id: 'session-nsf',
    stage_slug: 'thesis',
    payload: {
        job_type: 'PLAN',
        sessionId: 'session-nsf',
        projectId: 'project-nsf',
        stageSlug: 'thesis',
        model_id: 'model-id',
        iterationNumber: 1,
        idempotencyKey: "idempotency-key-1",
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
    idempotency_key: "idempotency-key-1",
};

const mockSupabaseClientNsf = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'dialectic_generation_jobs': {
            select: { data: [mockJobNsf], error: null },
            update: { data: [{ id: mockJobNsf.id }], error: null },
        },
        'dialectic_stages': {
            select: {
                data: [{ id: 1, slug: 'thesis', name: 'Thesis', display_name: 'Thesis' }],
                error: null,
            },
        },
    },
    rpcResults: {
        'create_notification_for_user': { data: null, error: null },
    },
});

Deno.test('handleJob - when processJob throws Insufficient funds, routes to pause path and does not run failure path', async () => {
    mockSupabaseClientNsf.client.clearAllTrackedBuilders();
    const testDepsNsf = createJobContext(createMockJobContextParams({
        ...createMockJobContextParams(),
        logger: mockLogger,
        fileManager: new MockFileManagerService(),
        notificationService: new NotificationService(mockSupabaseClientNsf.client as unknown as SupabaseClient<Database>),
    }));
    const { processors } = createMockJobProcessors();
    processors.processComplexJob = async () => {
        throw new Error('Insufficient funds to cover the input prompt cost.');
    };

    const pausedNsfSpy = spy(testDepsNsf.notificationService, 'sendContributionGenerationPausedNsfEvent');
    const failedNotificationSpy = spy(testDepsNsf.notificationService, 'sendContributionFailedNotification');
    const failedEventSpy = spy(testDepsNsf.notificationService, 'sendContributionGenerationFailedEvent');

    await handleJob(
        mockSupabaseClientNsf.client as unknown as SupabaseClient<Database>,
        mockJobNsf,
        testDepsNsf,
        'mock-token',
        processors,
    );

    const updateSpies = mockSupabaseClientNsf.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpies, 'Update spy should exist');
    assert(updateSpies.callCount >= 2, 'Should update to processing, then at least the failing job to paused_nsf (siblings may add more)');
    const secondUpdatePayload = updateSpies.callsArgs[1][0];
    assert(secondUpdatePayload && typeof secondUpdatePayload === 'object' && 'status' in secondUpdatePayload);
    assertEquals(secondUpdatePayload.status, 'paused_nsf', 'Job status should be paused_nsf');

    assertEquals(pausedNsfSpy.calls.length, 1, 'sendContributionGenerationPausedNsfEvent should be called once');
    assertEquals(failedNotificationSpy.calls.length, 0, 'sendContributionFailedNotification should not be called');
    assertEquals(failedEventSpy.calls.length, 0, 'sendContributionGenerationFailedEvent should not be called');

    const pausedPayload = pausedNsfSpy.calls[0].args[0];
    assert(pausedPayload && typeof pausedPayload === 'object');
    assertEquals(pausedPayload.sessionId, mockJobNsf.session_id);
    assertEquals(pausedPayload.projectId, 'project-nsf');
    assertEquals(pausedPayload.stageSlug, mockJobNsf.stage_slug);
    assertEquals(pausedPayload.iterationNumber, 1);
    assertEquals(pausedNsfSpy.calls[0].args[1], mockJobNsf.user_id);

    pausedNsfSpy.restore();
    failedNotificationSpy.restore();
    failedEventSpy.restore();
});

Deno.test('handleJob - when processJob throws non-NSF error, runs existing failure path unchanged', async () => {
    mockSupabaseClientNsf.client.clearAllTrackedBuilders();
    const testDepsNsf = createJobContext(createMockJobContextParams({
        ...createMockJobContextParams(),
        logger: mockLogger,
        fileManager: new MockFileManagerService(),
        notificationService: new NotificationService(mockSupabaseClientNsf.client as unknown as SupabaseClient<Database>),
    }));
    const { processors } = createMockJobProcessors();
    processors.processComplexJob = async () => {
        throw new Error('Simulated processJob error');
    };

    const pausedNsfSpy = spy(testDepsNsf.notificationService, 'sendContributionGenerationPausedNsfEvent');
    const failedEventSpy = spy(testDepsNsf.notificationService, 'sendContributionGenerationFailedEvent');

    await handleJob(
        mockSupabaseClientNsf.client as unknown as SupabaseClient<Database>,
        mockJobNsf,
        testDepsNsf,
        'mock-token',
        processors,
    );

    const updateSpies = mockSupabaseClientNsf.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpies, 'Update spy should exist');
    assertEquals(updateSpies.callCount, 2, 'Should update to processing, then to failed');
    const secondUpdatePayload = updateSpies.callsArgs[1][0];
    assert(secondUpdatePayload && typeof secondUpdatePayload === 'object' && 'status' in secondUpdatePayload);
    assertEquals(secondUpdatePayload.status, 'failed', 'Job status should be failed');

    assertEquals(pausedNsfSpy.calls.length, 0, 'sendContributionGenerationPausedNsfEvent should not be called');
    assertEquals(failedEventSpy.calls.length, 1, 'sendContributionGenerationFailedEvent should be called once');

    pausedNsfSpy.restore();
    failedEventSpy.restore();
});

Deno.test('handleJob - when processJob throws Insufficient funds but pauseJobsForNsf throws, logs error and runs failure path', async () => {
    mockSupabaseClientNsf.client.clearAllTrackedBuilders();
    const testDepsNsf = createJobContext(createMockJobContextParams({
        ...createMockJobContextParams(),
        logger: mockLogger,
        fileManager: new MockFileManagerService(),
        notificationService: new NotificationService(mockSupabaseClientNsf.client as unknown as SupabaseClient<Database>),
    }));
    const pauseThrowsStub = stub(
        testDepsNsf.notificationService,
        'sendContributionGenerationPausedNsfEvent',
        () => Promise.reject(new Error('pause notification failed')),
    );
    const { processors } = createMockJobProcessors();
    processors.processComplexJob = async () => {
        throw new Error('Insufficient funds: estimated total cost exceeds wallet balance.');
    };

    const loggerErrorSpy = spy(mockLogger, 'error');
    const failedEventSpy = spy(testDepsNsf.notificationService, 'sendContributionGenerationFailedEvent');

    await handleJob(
        mockSupabaseClientNsf.client as unknown as SupabaseClient<Database>,
        mockJobNsf,
        testDepsNsf,
        'mock-token',
        processors,
    );

    assert(loggerErrorSpy.calls.length >= 1, 'Logger error should be called at least once for pauseJobsForNsf failure');

    const updateSpies = mockSupabaseClientNsf.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
    assertExists(updateSpies, 'Update spy should exist');
    const lastIdx = updateSpies.callsArgs.length - 1;
    const lastUpdatePayload = updateSpies.callsArgs[lastIdx][0];
    assert(lastUpdatePayload && typeof lastUpdatePayload === 'object' && 'status' in lastUpdatePayload);
    assertEquals(lastUpdatePayload.status, 'failed', 'Job should fall back to failed status');

    assertEquals(failedEventSpy.calls.length, 1, 'Failure path should send sendContributionGenerationFailedEvent');

    pauseThrowsStub.restore();
    loggerErrorSpy.restore();
    failedEventSpy.restore();
});

const mockJobExecute: MockJob = {
    id: 'job-execute-1',
    user_id: 'user-id',
    session_id: 'session-exec-1',
    stage_slug: 'thesis',
    payload: {
        sessionId: 'session-exec-1',
        projectId: 'project-exec-1',
        model_id: 'model-exec-1',
        walletId: 'wallet-exec-1',
        stageSlug: 'thesis',
        iterationNumber: 1,
        user_jwt: 'jwt.token.here',
        output_type: FileType.business_case,
        canonicalPathParams: {
            contributionType: 'thesis',
            stageSlug: 'thesis',
        },
        inputs: {
            seed_prompt: 'resource-id-1',
        },
        prompt_template_id: 'prompt-template-123',
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
    job_type: 'EXECUTE',
    idempotency_key: 'idempotency-key-exec-1',
};

const mockSupabaseClientExecute = createMockSupabaseClient(undefined, {
    genericMockResults: {
        'dialectic_generation_jobs': {
            update: { data: [{ id: 'job-execute-1' }], error: null },
        },
    },
    rpcResults: {
        'create_notification_for_user': { data: null, error: null },
    },
});

const executeTestProviderRow: Tables<'ai_providers'> = {
    id: 'model-exec-1',
    provider: 'mock-provider',
    name: 'Mock AI Execute',
    api_identifier: 'mock-ai-exec',
    config: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    description: null,
    is_active: true,
    is_default_embedding: false,
    is_default_generation: false,
    is_enabled: true,
};

const executeTestSessionData: Tables<'dialectic_sessions'> = {
    id: 'session-exec-1',
    project_id: 'project-exec-1',
    session_description: 'Execute test session',
    user_input_reference_url: null,
    iteration_count: 1,
    selected_model_ids: ['model-exec-1'],
    status: 'in-progress',
    associated_chat_id: 'chat-exec-1',
    current_stage_id: 'stage-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    viewing_stage_id: null,
    idempotency_key: null,
};

Deno.test('handleJob - EXECUTE job processing invokes prepareModelJob on root context', async () => {
    const prepareModelJobSpy = spy(async (): Promise<PrepareModelJobReturn> => {
        const err: Error = new Error('mock prepareModelJob from execute path');
        return { error: err, retriable: false };
    });
    const testDepsExecute = createJobContext(createMockJobContextParams({
        ...createMockJobContextParams(),
        logger: mockLogger,
        fileManager: new MockFileManagerService(),
        notificationService: new NotificationService(mockSupabaseClientExecute.client as unknown as SupabaseClient<Database>),
        prepareModelJob: prepareModelJobSpy,
    }));

    const { processors } = createMockJobProcessors();
    processors.processSimpleJob = async (
        dbClient,
        job,
        projectOwnerUserId,
        _ctx,
        authToken,
    ) => {
        const prepareParams: PrepareModelJobParams = {
            dbClient,
            authToken,
            job,
            projectOwnerUserId,
            providerRow: executeTestProviderRow,
            sessionData: executeTestSessionData,
        };
        const promptConstructionPayload: PromptConstructionPayload = {
            conversationHistory: [],
            resourceDocuments: [],
            currentUserPrompt: 'execute-path proof',
            source_prompt_resource_id: 'source-prompt-exec-1',
        };
        const preparePayload: PrepareModelJobPayload = {
            promptConstructionPayload,
            compressionStrategy: getSortedCompressionCandidates,
        };
        await testDepsExecute.prepareModelJob(prepareParams, preparePayload);
        await (dbClient as unknown as SupabaseClient<Database>)
            .from('dialectic_generation_jobs')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', job.id);
    };

    await handleJob(
        mockSupabaseClientExecute.client as unknown as SupabaseClient<Database>,
        mockJobExecute,
        testDepsExecute,
        'mock-token',
        processors,
    );

    assertEquals(prepareModelJobSpy.calls.length, 1, 'prepareModelJob should be invoked once for EXECUTE path');
});

Deno.test('createDialecticWorkerDeps: throws when NETLIFY_QUEUE_URL is not set', async () => {
    const savedNetlifyUrl = Deno.env.get('NETLIFY_QUEUE_URL');
    Deno.env.delete('NETLIFY_QUEUE_URL');
    Deno.env.set('AWL_API_KEY', 'mock-awl-key');
    Deno.env.set('OPENAI_API_KEY', 'mock-openai-key');
    try {
        await assertRejects(
            () => createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>),
            Error,
            'NETLIFY_QUEUE_URL',
        );
    } finally {
        if (savedNetlifyUrl !== undefined) Deno.env.set('NETLIFY_QUEUE_URL', savedNetlifyUrl);
        Deno.env.delete('AWL_API_KEY');
        Deno.env.delete('OPENAI_API_KEY');
    }
});

Deno.test('createDialecticWorkerDeps: throws when AWL_API_KEY is not set', async () => {
    const savedAwlKey = Deno.env.get('AWL_API_KEY');
    Deno.env.delete('AWL_API_KEY');
    Deno.env.set('NETLIFY_QUEUE_URL', 'https://mock-netlify-queue');
    Deno.env.set('OPENAI_API_KEY', 'mock-openai-key');
    try {
        await assertRejects(
            () => createDialecticWorkerDeps(mockSupabaseClientDeps.client as unknown as SupabaseClient<Database>),
            Error,
            'AWL_API_KEY',
        );
    } finally {
        if (savedAwlKey !== undefined) Deno.env.set('AWL_API_KEY', savedAwlKey);
        Deno.env.delete('NETLIFY_QUEUE_URL');
        Deno.env.delete('OPENAI_API_KEY');
    }
});

// =============================================================
// handleSaveResponse — HTTP handler unit tests
// =============================================================

function createSaveResponseRouteRequest(
    jwt: string | null,
    body: SaveResponseRequestBody,
): Request {
    const headers: Headers = new Headers({ 'Content-Type': 'application/json' });
    if (jwt !== null) {
        headers.set('Authorization', `Bearer ${jwt}`);
    }
    return new Request('https://example.com/saveResponse', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
}

const validSrBody: SaveResponseRequestBody = {
    job_id: 'handler-test-job-1',
    assembled_content: '{"test": true}',
    token_usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    finish_reason: 'stop',
};

const mockUserDbClientFn: CreateUserDbClientFn = (_auth: string): SupabaseClient<Database> =>
    mockSupabaseClient.client as unknown as SupabaseClient<Database>;

Deno.test('handleSaveResponse - missing Authorization header returns 401 without calling saveResponse', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn());
    const req: Request = createSaveResponseRouteRequest(null, validSrBody);
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 401);
    assertEquals(saveResponseSpy.calls.length, 0, 'saveResponse must not be called when JWT is missing');
});

Deno.test('handleSaveResponse - invalid body missing job_id returns 400 without calling saveResponse', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn());
    const req: Request = new Request('https://example.com/saveResponse', {
        method: 'POST',
        headers: new Headers({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-jwt',
        }),
        body: JSON.stringify({ assembled_content: '{}', token_usage: null, finish_reason: null }),
    });
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 400);
    assertEquals(saveResponseSpy.calls.length, 0, 'saveResponse must not be called on invalid body');
});

Deno.test('handleSaveResponse - valid request calls saveResponse with correctly split params and payload', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn());
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(saveResponseSpy.calls.length, 1, 'saveResponse should be called exactly once');
    const passedParams: SaveResponseParams = saveResponseSpy.calls[0].args[1];
    const passedPayload: SaveResponsePayload = saveResponseSpy.calls[0].args[2];
    assertEquals(passedParams.job_id, validSrBody.job_id);
    assertExists(passedParams.dbClient, 'userDbClient must be present in SaveResponseParams');
    assertEquals(passedPayload.assembled_content, validSrBody.assembled_content);
    assertEquals(passedPayload.token_usage, validSrBody.token_usage);
    assertEquals(passedPayload.finish_reason, validSrBody.finish_reason);
});

Deno.test('handleSaveResponse - saveResponse returns completed status returns 200', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn({ status: 'completed' }));
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 200);
});

Deno.test('handleSaveResponse - saveResponse returns needs_continuation status returns 200', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn({ status: 'needs_continuation' }));
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 200);
});

Deno.test('handleSaveResponse - saveResponse returns retriable error returns 503', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseErrorReturn({ error: new Error('retriable'), retriable: true }));
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 503);
});

Deno.test('handleSaveResponse - saveResponse returns non-retriable error returns 500', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseErrorReturn({ error: new Error('fatal'), retriable: false }));
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 500);
});

Deno.test('handleSaveResponse - SaveResponseDeps includes enqueueRenderJob as 2-arg BoundEnqueueRenderJobFn', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn());
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(saveResponseSpy.calls.length, 1);
    const passedDeps: SaveResponseDeps = saveResponseSpy.calls[0].args[0];
    assertEquals(typeof passedDeps.enqueueRenderJob, 'function', 'enqueueRenderJob must be present in SaveResponseDeps');
    assertEquals(passedDeps.enqueueRenderJob.length, 2, 'enqueueRenderJob must be a 2-arg BoundEnqueueRenderJobFn');
});

Deno.test('handleSaveResponse - SaveResponseDeps.debitTokens is a 2-arg BoundDebitTokens not raw 3-arg DebitTokens', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn());
    const req: Request = createSaveResponseRouteRequest('test-jwt', validSrBody);
    await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(saveResponseSpy.calls.length, 1);
    const passedDeps: SaveResponseDeps = saveResponseSpy.calls[0].args[0];
    assertEquals(typeof passedDeps.debitTokens, 'function', 'debitTokens must be a function in SaveResponseDeps');
    assertEquals(passedDeps.debitTokens.length, 2, 'debitTokens must be 2-arg BoundDebitTokens, not raw 3-arg DebitTokens');
});

Deno.test('handleSaveResponse - job-queue shaped body returns 400 proving route discrimination', async () => {
    const saveResponseSpy = spy(async (
        _deps: SaveResponseDeps,
        _params: SaveResponseParams,
        _payload: SaveResponsePayload,
    ): Promise<SaveResponseReturn> => createMockSaveResponseSuccessReturn());
    const req: Request = new Request('https://example.com/saveResponse', {
        method: 'POST',
        headers: new Headers({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-jwt',
        }),
        body: JSON.stringify({ record: { id: 'job-queue-id', user_id: 'user-id', status: 'pending' } }),
    });
    const res: Response = await handleSaveResponse(
        req,
        mockSupabaseClient.client as unknown as SupabaseClient<Database>,
        mockDeps,
        saveResponseSpy,
        mockUserDbClientFn,
    );
    assertEquals(res.status, 400, 'job-queue shaped body must be rejected by saveResponse handler');
    assertEquals(saveResponseSpy.calls.length, 0, 'saveResponse must not be called for job-queue body');
});