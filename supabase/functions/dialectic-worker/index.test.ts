import { assertEquals, assertExists, assert, assertStrictEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { handleJob, createDialecticWorkerDeps } from './index.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import type { IDialecticJobDeps, SeedPromptData, IContinueJobResult } from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { type AiModelExtendedConfig } from '../_shared/types.ts';
import { OpenAiAdapter } from '../_shared/ai_service/openai_adapter.ts';
import { getAiProviderAdapter } from '../_shared/ai_service/factory.ts';
import type { AiProviderAdapterInstance, ILogger } from '../_shared/types.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

const mockDeps: IDialecticJobDeps = {
    logger: new MockLogger(),
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'Mock content',
        error: null,
        finish_reason: 'stop',
    })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: new ArrayBuffer(0), error: null })),
    fileManager: new MockFileManagerService(),
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
    notificationService: new NotificationService(createMockSupabaseClient(undefined, {
        rpcResults: {
            create_notification_for_user: { data: null, error: null },
        },
    }).client as unknown as SupabaseClient<Database>),
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
};

Deno.test('handleJob - fails when job is missing user_id', async () => {
    // 1. Setup
    const { spies } = createMockJobProcessors();

    const mockJob: MockJob = {
        id: 'job-without-user-id',
        user_id: null as any, // Missing user_id - using any for test purposes
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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                update: {
                    data: [{ id: mockJob.id }]
                }
            }
        }
    });

    try {
        // 2. Execute
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, mockDeps, 'mock-token');

        // 3. Verify
        // Note: MockLogger methods are already spies, but we can't easily verify calls without extending the mock
        // Instead, we verify the database interactions which are the main concern

        // Verify job status was updated to failed
        const updateSpies = mockSupabase.spies.getLatestQueryBuilderSpies('dialectic_generation_jobs');
        assertExists(updateSpies?.update, 'Update spy should exist');
        assertEquals(updateSpies!.update.calls.length, 1, 'Job should be updated once');
        const updatePayload = updateSpies!.update.calls[0].args[0];
        assertEquals(updatePayload.status, 'failed');
        assertEquals(updatePayload.error_details.message, 'Job is missing a user_id.');
        assertExists(updatePayload.completed_at);

    } finally {
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('handleJob - fails when payload is invalid', async () => {
    // 1. Setup
    const mockLogger = new MockLogger();
    const { spies } = createMockJobProcessors();

    const mockJob: MockJob = {
        id: 'job-invalid-payload',
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'thesis',
        payload: {
            // Still invalid, but include projectId for the notification link.
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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                update: {
                    data: [{ id: mockJob.id }],
                    error: null,
                }
            }
        },
        rpcResults: {
          'create_notification_for_user': { data: null, error: null },
        },
    });

    const testDeps = {
        ...mockDeps,
        notificationService: new NotificationService(mockSupabase.client as unknown as SupabaseClient<Database>),
    };
    const internalFailSpy = spy(testDeps.notificationService, 'sendContributionGenerationFailedEvent');

    try {
        // 2. Execute
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, testDeps, 'mock-token');

        // 3. Verify - MockLogger methods are already spies, so we can check them directly
        // Note: We can't easily verify specific error calls with MockLogger without extending it
        // For now, we'll verify the database and RPC interactions

        // Verify job status was updated to failed
        const updateSpies = mockSupabase.spies.getLatestQueryBuilderSpies('dialectic_generation_jobs');
        assertExists(updateSpies?.update, 'Update spy should exist');
        assertEquals(updateSpies!.update.calls.length, 1, 'Job should be updated once');
        const updatePayload = updateSpies!.update.calls[0].args[0];
        assertEquals(updatePayload.status, 'failed');
        const errorDetailsMessage = updatePayload.error_details?.message || '';
        assertEquals(typeof errorDetailsMessage === 'string' && errorDetailsMessage.includes('Invalid payload:'), true);
        assertEquals(errorDetailsMessage, 'Invalid payload: Job payload is invalid or missing required fields.');
        assertExists(updatePayload.completed_at);

        // Verify both internal and user-facing notifications were sent
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 2, 'RPC should be called twice (internal + user-facing)');

        const internalCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'other_generation_failed');
        assertExists(internalCall, 'Internal failure event should be sent');
        const internalArgs = internalCall!.args[1];
        assertEquals(internalArgs.p_target_user_id, mockJob.user_id);
        assertEquals(internalArgs.p_is_internal_event, true);
        const internalData = internalArgs.p_notification_data;
        assert(typeof internalData === 'object' && internalData !== null, 'internal notification_data should be object');
        assertEquals(internalData.job_id, 'job-invalid-payload');
        assertEquals(internalData.sessionId, mockJob.session_id);
        assertEquals(internalData.error.code, 'VALIDATION_ERROR');

        const userFailCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'contribution_generation_failed');
        assertExists(userFailCall, 'User-facing failure notification should be sent');
        const userArgs = userFailCall!.args[1];
        assertEquals(userArgs.p_target_user_id, mockJob.user_id);
        assertEquals(userArgs.p_is_internal_event, false);
        const userData = userArgs.p_notification_data;
        assert(typeof userData === 'object' && userData !== null, 'user notification_data should be object');
        assertEquals(userData.job_id, 'job-invalid-payload');

        // Verify internal failure event emitted (RED - should fail until implemented)
        assertEquals(internalFailSpy.calls.length, 1, 'Internal failure event should be emitted once');
        const internalPayload = internalFailSpy.calls[0].args[0];
        assertEquals(internalPayload.type, 'other_generation_failed');
        assertEquals(internalPayload.sessionId, mockJob.session_id);
        assertEquals(internalPayload.job_id, mockJob.id);
        assert(typeof internalPayload.error === 'object' && internalPayload.error !== null);
        assertEquals(internalPayload.error.code, 'VALIDATION_ERROR');

    } finally {
        internalFailSpy.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('handleJob - successfully processes valid job', async () => {
    // 1. Setup
    const mockLogger = new MockLogger();
    const { spies } = createMockJobProcessors();

    const validPayload: Json = {
        job_type: 'plan',
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis',
        model_id: 'model-id',
        continueUntilComplete: false,
        step_info: { current_step: 1, total_steps: 1 },
    };

    const mockJob: MockJob = {
        id: 'job-valid',
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'thesis',
        payload: validPayload,
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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                update: {
                    data: [{ id: mockJob.id }],
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
                            processing_strategy: {
                                type: 'task_isolation',
                            }
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

    const testDeps = {
        ...mockDeps,
        notificationService: new NotificationService(mockSupabase.client as unknown as SupabaseClient<Database>),
    };

    try {
        // 2. Execute
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, testDeps, 'mock-token');

        // 3. Verify
        // Check job status was updated to processing, then to completed
        const updateSpies = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpies, 'Update spy should exist');
        assertEquals(updateSpies.callCount, 2, 'Job should be updated twice (processing, then completed)');

        // Check the first update was to 'processing'
        const firstUpdatePayload = updateSpies.callsArgs[0][0];
        assert(firstUpdatePayload && typeof firstUpdatePayload === 'object' && 'status' in firstUpdatePayload);
        assertEquals(firstUpdatePayload.status, 'processing');
        assert('started_at' in firstUpdatePayload);

        // Check the second update was to 'completed'
        const secondUpdatePayload = updateSpies.callsArgs[1][0];
        assert(secondUpdatePayload && typeof secondUpdatePayload === 'object' && 'status' in secondUpdatePayload);
        assertEquals(secondUpdatePayload.status, 'completed');
        assert('completed_at' in secondUpdatePayload);

        // Check notification was sent for job start
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 1, 'RPC should be called once for start notification');
        const startNotification = rpcSpy.calls[0];
        assertEquals(startNotification.args[0], 'create_notification_for_user');
        const notificationArgs = startNotification.args[1];
        assertEquals(notificationArgs.p_target_user_id, mockJob.user_id);
        assertEquals(notificationArgs.p_notification_type, 'contribution_generation_started');

        assert(typeof notificationArgs.p_notification_data === 'object' && notificationArgs.p_notification_data !== null, "notification_data should be an object");
        const parsedNotificationData = notificationArgs.p_notification_data;
        assertEquals(parsedNotificationData.sessionId, 'session-id');
        assertEquals(parsedNotificationData.job_id, 'job-valid');

        // Check processJob was called with correct parameters
        // Note: Since processJob is mocked via the processors, we can't directly spy on it
        // but we can verify the processors were passed correctly by checking if any of them were called
        // This would depend on the routing logic in processJob

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.planComplexStage.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('handleJob - handles exceptions during processJob execution', async () => {
    const testError = new Error('Simulated processJob error');
    const { processors, spies } = createMockJobProcessors();
    
    // Replace the real processor with one that throws an error
    processors.processComplexJob = () => Promise.reject(testError);

    const validPayload: Json = {
        job_type: 'plan', // This ensures it gets routed to a processor
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis',
        model_id: 'model-id',
        step_info: { current_step: 1, total_steps: 1 },
    };

    const mockJob: MockJob = {
        id: 'job-exception',
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'thesis',
        payload: validPayload,
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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                update: { data: [{ id: mockJob.id }], error: null }
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
                            processing_strategy: {
                                type: 'task_isolation',
                            }
                        },
                    }],
                    error: null,
                }
            }
        },
        rpcResults: {
            'create_notification_for_user': { data: null, error: null },
        },
    });

    const testDeps = {
        ...mockDeps,
        notificationService: new NotificationService(mockSupabase.client as unknown as SupabaseClient<Database>),
    };
    const internalFailSpy = spy(testDeps.notificationService, 'sendContributionGenerationFailedEvent');

    try {
        // 2. Execute
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, testDeps, 'mock-token', processors);

        // 3. Verify
        // Verify job status was updated to failed
        const updateSpies = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpies, 'Update spy should exist');
        assertEquals(updateSpies.callCount, 2, 'Should update status to processing, then to failed');
        
        const finalUpdatePayload = updateSpies.callsArgs[1][0];
        assert(finalUpdatePayload && typeof finalUpdatePayload === 'object' && 'status' in finalUpdatePayload && 'error_details' in finalUpdatePayload);

        assertEquals(finalUpdatePayload.status, 'failed', "Job status should be 'failed'");
        assert('completed_at' in finalUpdatePayload, "completed_at should be set");
        const errorDetails = finalUpdatePayload.error_details;
        assert(errorDetails && typeof errorDetails === 'object' && 'final_error' in errorDetails && typeof errorDetails.final_error === 'string' && errorDetails.final_error.includes('Simulated processJob error'), "Error details should contain the simulated error message");

        // Verify start, internal failure, and user-facing failure notifications
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 3, 'RPC should be called thrice (start, internal fail, user fail)');

        const startCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'contribution_generation_started');
        assertExists(startCall, 'Start notification should be sent');

        const internalFailCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'other_generation_failed');
        assertExists(internalFailCall, 'Internal failure event should be sent');
        const internalArgs = internalFailCall!.args[1];
        assertEquals(internalArgs.p_is_internal_event, true);
        const internalData = internalArgs.p_notification_data;
        assertEquals(internalData.job_id, mockJob.id);
        assertEquals(internalData.sessionId, mockJob.session_id);
        assertEquals(internalData.error.code, 'UNHANDLED_EXCEPTION');

        const userFailCall = rpcSpy.calls.find((c: any) => c.args[1]?.p_notification_type === 'contribution_generation_failed');
        assertExists(userFailCall, 'User-facing failure notification should be sent');
        const userArgs = userFailCall!.args[1];
        assertEquals(userArgs.p_is_internal_event, false);

        // Verify internal failure event emitted (RED - should fail until implemented)
        assertEquals(internalFailSpy.calls.length, 1, 'Internal failure event should be emitted once');
        const internalPayload = internalFailSpy.calls[0].args[0];
        assertEquals(internalPayload.type, 'other_generation_failed');
        assertEquals(internalPayload.sessionId, mockJob.session_id);
        assertEquals(internalPayload.job_id, mockJob.id);
        assert(typeof internalPayload.error === 'object' && internalPayload.error !== null);
        assertEquals(internalPayload.error.code, 'UNHANDLED_EXCEPTION');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.planComplexStage.restore();
        internalFailSpy.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('handleJob - validates payload correctly and extracts user info', async () => {
    // 1. Setup - Test the validation and extraction logic specifically
    const mockLogger = new MockLogger();
    const { spies } = createMockJobProcessors();

    const validPayload: Json = {
        job_type: 'plan',
        sessionId: 'session-id-validation',
        projectId: 'project-id-validation',
        stageSlug: 'synthesis',
        model_id: 'model-1',
        continueUntilComplete: true,
        iterationNumber: 2,
        chatId: 'chat-id',
        walletId: 'wallet-id',
        step_info: { current_step: 1, total_steps: 1 },
    };

    const mockJob: MockJob = {
        id: 'job-validation-test',
        user_id: 'user-validation',
        session_id: 'session-id-validation',
        stage_slug: 'synthesis',
        payload: validPayload,
        iteration_number: 2,
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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_generation_jobs': {
                update: {
                    data: [{ id: mockJob.id }],
                    error: null,
                }
            },
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 1,
                        slug: 'synthesis',
                        name: 'Synthesis',
                        display_name: 'Synthesis',
                        input_artifact_rules: {
                            steps: [{
                                step: 1,
                                prompt_template_name: 'test-prompt',
                                granularity_strategy: 'full_text',
                                output_type: 'test-output',
                                inputs_required: [],
                            }],
                            sources: [],
                            processing_strategy: {
                                type: 'task_isolation',
                            }
                        },
                    }],
                    error: null,
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{
                        id: 'session-id-validation',
                        project_id: 'project-id-validation',
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

    const testDeps = {
        ...mockDeps,
        notificationService: new NotificationService(mockSupabase.client as unknown as SupabaseClient<Database>),
    };

    try {
        // 2. Execute
        await handleJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, testDeps, 'mock-token');

        // 3. Verify
        // Verify the payload was validated successfully (no validation errors logged)
        // and the job proceeded to processing

        const updateSpies = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertExists(updateSpies, 'Update spy should exist');
        assertEquals(updateSpies.callCount, 2, 'Job should be updated twice (processing, then completed)');

        // Check the first update was to 'processing'
        const firstUpdatePayload = updateSpies.callsArgs[0][0];
        assert(firstUpdatePayload && typeof firstUpdatePayload === 'object' && 'status' in firstUpdatePayload);
        assertEquals(firstUpdatePayload.status, 'processing');

        // Check the second update was to 'completed'
        const secondUpdatePayload = updateSpies.callsArgs[1][0];
        assert(secondUpdatePayload && typeof secondUpdatePayload === 'object' && 'status' in secondUpdatePayload);
        assertEquals(secondUpdatePayload.status, 'completed');

        // Verify the start notification was sent with correct payload data
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 1, 'RPC should be called once');
        const notification = rpcSpy.calls[0];
        const notificationArgs = notification.args[1];

        assert(typeof notificationArgs.p_notification_data === 'object' && notificationArgs.p_notification_data !== null, "notification_data should be an object");
        const parsedNotificationData = notificationArgs.p_notification_data;
        assertEquals(parsedNotificationData.sessionId, 'session-id-validation');
        assertEquals(parsedNotificationData.job_id, 'job-validation-test');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.planComplexStage.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// --- Step 36 RED: worker deps factory exists and injects wallet service for compression path ---
Deno.test('createDialecticWorkerDeps: provides wallet and compression deps', async () => {
    // Provide a mock default embedding provider row for the factory's DB fetch
    const embeddingConfig: AiModelExtendedConfig = {
        api_identifier: 'openai-text-embedding-3-small',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
            is_chatml_model: false,
            api_identifier_for_tokenization: 'text-embedding-3-small',
        },
    };
    const mockProviderRow = {
        id: 'prov-openai-embed-1',
        api_identifier: 'openai-text-embedding-3-small',
        name: 'OpenAI Embedding',
        description: 'Mock embedding model',
        is_active: true,
        provider: 'openai',
        config: embeddingConfig,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default_embedding: true,
        is_enabled: true,
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: { data: [mockProviderRow], error: null },
            },
        },
    });

    const deps = await createDialecticWorkerDeps(client as unknown as SupabaseClient<Database>);

    // Core deps wiring
    assertExists(deps.ragService, 'ragService should be present');
    assertExists(deps.indexingService, 'indexingService should be present');
    assertExists(deps.embeddingClient, 'embeddingClient should be present');
    assertExists(deps.promptAssembler, 'promptAssembler should be present');
    assertEquals(typeof deps.countTokens, 'function');
    assertEquals(typeof deps.executeModelCallAndSave, 'function');

    // Wallet service must be injected
    assertExists(deps.tokenWalletService, 'tokenWalletService should be present');
});

Deno.test('createDialecticWorkerDeps: constructs DummyAdapter embedding client when default embedding provider is dummy', async () => {
    const dummyConfig: AiModelExtendedConfig = {
        api_identifier: 'dummy-model-v1',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: { type: 'tiktoken', tiktoken_encoding_name: 'cl100k_base' },
        context_window_tokens: 4096,
        hard_cap_output_tokens: 4096,
    };
    const dummyProviderRow = {
        id: 'prov-dummy-embed-1',
        api_identifier: 'dummy-model-v1',
        name: 'Dummy Embedding',
        description: 'Dummy embedding model',
        is_active: true,
        provider: 'dummy',
        config: dummyConfig,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default_embedding: true,
        is_enabled: true,
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: { data: [dummyProviderRow], error: null },
            },
        },
    });

    const deps = await createDialecticWorkerDeps(client as unknown as SupabaseClient<Database>);
    if (!deps.embeddingClient) throw new Error('embeddingClient was not constructed');

    // Call through to ensure the embedding client is functional and offline (DummyAdapter)
    const result = await deps.embeddingClient.getEmbedding('hello world');
    assertExists(result.embedding);
    assert(Array.isArray(result.embedding) && result.embedding.length === 3072);
    assert(typeof result.usage.total_tokens === 'number' && result.usage.total_tokens > 0);
});

// 52.b.i: When test mode routes factory to dummy, assert factory passes selected model config verbatim
Deno.test('getAiProviderAdapter (test routing): passes provider.config verbatim into DummyAdapter', async () => {
  const now = new Date().toISOString();
  const providerRow = {
    id: 'prov-openai-4o-1',
    api_identifier: 'openai-gpt-4o',
    name: 'OpenAI gpt-4o',
    description: 'Owned by: system',
    is_active: true,
    provider: 'openai',
    is_default_embedding: false,
    is_enabled: true,
    created_at: now,
    updated_at: now,
    config: {
      api_identifier: 'openai-gpt-4o',
      context_window_tokens: 128000,
      provider_max_input_tokens: 128000,
      provider_max_output_tokens: 4096,
      input_token_cost_rate: 5,
      output_token_cost_rate: 15,
      tokenization_strategy: {
        type: 'tiktoken',
        is_chatml_model: true,
        tiktoken_encoding_name: 'cl100k_base',
        api_identifier_for_tokenization: 'gpt-4o',
      },
      hard_cap_output_tokens: 4096,
    },
  };

  // Use the factory in test routing by providing the test provider map
  const logger: ILogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const adapter = getAiProviderAdapter({
    provider: providerRow as any,
    apiKey: 'sk-test',
    logger,
    providerMap: { 'dummy': (await import('../_shared/ai_service/dummy_adapter.ts')).DummyAdapter, 'openai-': (await import('../_shared/ai_service/dummy_adapter.ts')).DummyAdapter, 'anthropic-': (await import('../_shared/ai_service/dummy_adapter.ts')).DummyAdapter, 'google-': (await import('../_shared/ai_service/dummy_adapter.ts')).DummyAdapter },
  }) as AiProviderAdapterInstance | null;

  assertExists(adapter, 'Factory should return an adapter instance');

  // Probe the adapter by listing models to retrieve its internal config
  const models = await adapter!.listModels();
  assert(Array.isArray(models) && models.length === 1);
  const cfgCandidate = models[0] && typeof models[0] === 'object' ? (models[0] as { config?: unknown }).config : undefined;
  assert(!!cfgCandidate && typeof cfgCandidate === 'object', 'adapter.listModels should expose a config');
  const cfg = cfgCandidate as { [k: string]: unknown };
  assertEquals(cfg.api_identifier, providerRow.config.api_identifier);
  assertEquals(cfg.context_window_tokens, providerRow.config.context_window_tokens);
  assertEquals(cfg.provider_max_input_tokens, providerRow.config.provider_max_input_tokens);
  assertEquals(cfg.provider_max_output_tokens, providerRow.config.provider_max_output_tokens);
  assertEquals(cfg.hard_cap_output_tokens, providerRow.config.hard_cap_output_tokens);
});

Deno.test('createDialecticWorkerDeps: constructs OpenAI embedding client when default provider is openai', async () => {
    const embeddingConfig: AiModelExtendedConfig = {
        api_identifier: 'openai-text-embedding-3-small',
        input_token_cost_rate: 1,
        output_token_cost_rate: 1,
        tokenization_strategy: {
            type: 'tiktoken',
            tiktoken_encoding_name: 'cl100k_base',
            is_chatml_model: false,
            api_identifier_for_tokenization: 'text-embedding-3-small',
        },
    };
    const providerRow = {
        id: 'prov-openai-embed-2',
        api_identifier: 'openai-text-embedding-3-small',
        name: 'OpenAI Embedding',
        description: 'Mock embedding model',
        is_active: true,
        provider: 'openai',
        config: embeddingConfig,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_default_embedding: true,
        is_enabled: true,
    };

    const { client } = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'ai_providers': {
                select: { data: [providerRow], error: null },
            },
        },
    });

    // Stub OpenAI adapter network call
    const getEmbeddingStub = stub(OpenAiAdapter.prototype, 'getEmbedding', async () => ({
        embedding: [0.1, 0.2, 0.3],
        usage: { prompt_tokens: 3, total_tokens: 3 },
    }));
    try {
        const deps = await createDialecticWorkerDeps(client as unknown as SupabaseClient<Database>);
        if (!deps.embeddingClient) throw new Error('embeddingClient was not constructed');
        const res = await deps.embeddingClient.getEmbedding('x');
        assertExists(res);
        assert(Array.isArray(res.embedding));
        assertEquals(getEmbeddingStub.calls.length, 1);
    } finally {
        getEmbeddingStub.restore();
    }
});
