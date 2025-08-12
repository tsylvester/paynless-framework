import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy, stub } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { handleJob } from './index.ts';
import * as processJobModule from './processJob.ts';
import { MockLogger } from '../_shared/logger.mock.ts';
import type { IDialecticJobDeps, SeedPromptData, IContinueJobResult } from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { NotificationService } from '../_shared/utils/notification.service.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { FactoryDependencies } from '../_shared/types.ts';

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

        // Verify notification was sent - use existing rpcSpy from mock
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 1, 'RPC should be called once for notification');
        const rpcCall = rpcSpy.calls[0];
        assertEquals(rpcCall.args[0], 'create_notification_for_user');
        const rpcArgs = rpcCall.args[1];
        assertEquals(rpcArgs.p_target_user_id, mockJob.user_id);
        assertEquals(rpcArgs.p_notification_type, 'contribution_generation_failed');
        
        // Ensure notification_data is a valid JSON object
        assert(typeof rpcArgs.p_notification_data === 'object' && rpcArgs.p_notification_data !== null, "notification_data should be a valid object");
        
        const notificationData = rpcArgs.p_notification_data;
        assertEquals(notificationData.job_id, 'job-invalid-payload');

    } finally {
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

        // Verify failure notification was sent
        const rpcSpy = mockSupabase.spies.rpcSpy;
        assertEquals(rpcSpy.calls.length, 2, 'RPC should be called twice (start and fail)');
        const failureNotification = rpcSpy.calls[1];
        assertEquals(failureNotification.args[0], 'create_notification_for_user');
        assertEquals(failureNotification.args[1].p_notification_type, 'contribution_generation_failed');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.planComplexStage.restore();
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
