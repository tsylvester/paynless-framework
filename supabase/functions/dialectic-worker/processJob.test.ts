
import { assertEquals, assertExists } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processJob } from './processJob.ts';
import { logger } from '../_shared/logger.ts';
import type { DialecticJobPayload, ProcessSimpleJobDeps, SeedPromptData, IContinueJobResult, DialecticPlanJobPayload } from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isDialecticCombinationJobPayload, isJson } from '../_shared/utils/type_guards.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
const mockDeps: ProcessSimpleJobDeps = {
    logger,
    callUnifiedAIModel: spy(async (): Promise<UnifiedAIResponse> => ({
        content: 'Happy path AI content',
        error: null,
        finish_reason: 'stop',
    })),
    downloadFromStorage: spy(async (): Promise<DownloadStorageResult> => ({ data: new ArrayBuffer(0), error: null })),
    fileManager: new MockFileManagerService(),
    getExtensionFromMimeType: spy(() => '.md'),
    randomUUID: spy(() => 'mock-uuid-happy'),
    deleteFromStorage: spy(async () => await Promise.resolve({ error: null })),
    getSeedPromptForStage: spy(async (): Promise<SeedPromptData> => ({
        content: 'Happy path AI content',
        fullPath: 'happy/path/ai/content.md',
        bucket: 'happy-path-ai-content',
        path: 'happy/path/ai/content.md',
        fileName: 'happy-path-ai-content.md',
    })),
    continueJob: spy(async (): Promise<IContinueJobResult> => ({
        enqueued: true,
        error: undefined,
    })),
    retryJob: spy(async (): Promise<{ error?: Error }> => ({ error: undefined })),
    notificationService: mockNotificationService,
    executeModelCallAndSave: spy(async (): Promise<void> => { /* dummy */ }),
};

Deno.test('processJob - routes to processCombinationJob for combine job type', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-combine-route';
    const mockPayload: Json = {
        sessionId: 'session-id-combine',
        projectId: 'project-id-combine',
        stageSlug: 'synthesis',
        model_id: 'model-id-combine',
        job_type: 'combine',
        prompt_template_name: 'test-template',
        inputs: {
            document_ids: ['doc1', 'doc2'],
        },
    };

    if (!isDialecticCombinationJobPayload(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid DialecticCombinationJobPayload');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id-combine',
        session_id: 'session-id-combine',
        stage_slug: 'synthesis',
        payload: mockPayload,
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

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: mockPayload },
            'user-id-combine',
            mockDeps,
            'mock-token',
            processors
        );

        assertEquals(spies.processCombinationJob.calls.length, 1, 'processCombinationJob should be called once');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob should not be called');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob should not be called');

    } finally {
        spies.processCombinationJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});


Deno.test('processJob - routes to processSimpleJob for simple stages', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-simple-route';
    const mockPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis', // A simple stage
        model_id: 'model-id',
        continueUntilComplete: false,
    };
    
    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'thesis',
        payload: mockPayload,
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
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-thesis',
                        slug: 'thesis',
                        display_name: 'Thesis',
                        input_artifact_rules: null,
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{ id: 'session-id' }]
                }
            }
        }
    });

    try {
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id', mockDeps, 'mock-token', processors);

        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob should not be called');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - routes to processComplexJob for complex stages', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-complex-route';
    const mockPayload: DialecticPlanJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-complex',
        projectId: 'project-id-complex',
        stageSlug: 'antithesis', // A complex stage
        model_id: 'model-id-complex',
    };

    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id-complex',
        session_id: 'session-id-complex',
        stage_slug: 'antithesis',
        payload: mockPayload,
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
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-antithesis',
                        slug: 'antithesis',
                        input_artifact_rules: {
                            processing_strategy: {
                                type: 'task_isolation'
                            }
                        },
                    }]
                }
            },
            'dialectic_sessions': {
                select: {
                    data: [{ id: 'session-id-complex' }]
                }
            }
        }
    });

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id-complex', mockDeps, 'mock-token', processors);

        // 3. Assert
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob should not be called');
        assertEquals(spies.processComplexJob.calls.length, 1, 'processComplexJob should be called once');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - throws error when stage not found', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-stage-not-found';
    const mockPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'nonexistent-stage',
        model_id: 'model-id',
    };
    
    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'nonexistent-stage',
        payload: mockPayload,
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
            'dialectic_stages': {
                select: {
                    data: null, // No stage found
                    error: { message: 'No rows found', name: 'PostgrestError' }
                }
            }
        }
    });

    try {
        // 2. Execute & Assert
        let threwError = false;
        let errorMessage = '';
        try {
            await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id', mockDeps, 'mock-token', processors);
        } catch (error) {
            threwError = true;
            errorMessage = error instanceof Error ? error.message : String(error);
        }

        assertEquals(threwError, true, 'Should throw an error when stage is not found');
        assertEquals(errorMessage, "Stage with slug 'nonexistent-stage' not found.");
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob should not be called');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob should not be called');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - routes to simple processor for unsupported processing strategy', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-unsupported-strategy';
    const mockPayload: DialecticPlanJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis', // Use a valid slug
        model_id: 'model-id',
    };
    
    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'thesis',
        payload: mockPayload,
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
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-custom',
                        slug: 'thesis',
                        display_name: 'Thesis',
                        input_artifact_rules: {
                            processing_strategy: {
                                type: 'unsupported_strategy' // Not 'task_isolation'
                            }
                        },
                    }]
                }
            }
        }
    });

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id', mockDeps, 'mock-token', processors);
        
        // 3. Assert
        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called for unsupported strategy');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob should not be called');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - verifies correct parameters passed to processSimpleJob', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-verify-params';
    const mockPayload: DialecticPlanJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-params',
        projectId: 'project-id-params',
        stageSlug: 'thesis',
        model_id: 'model-id-1',
        iterationNumber: 1,
        continueUntilComplete: true,
    };
    
    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id-params',
        session_id: 'session-id-params',
        stage_slug: 'thesis',
        payload: mockPayload,
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
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-thesis',
                        slug: 'thesis',
                        display_name: 'Thesis',
                        input_artifact_rules: null, // Simple stage
                    }]
                }
            }
        }
    });

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id-params', mockDeps, 'mock-token-params', processors);

        // 3. Assert
        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once');
        
        const call = spies.processSimpleJob.calls[0];
        assertEquals(call.args.length, 5, 'processSimpleJob should be called with 5 arguments');
        
        // Verify the parameters passed to processSimpleJob
        const transformedPayload = {
            job_type: 'execute',
            model_id: mockPayload.model_id,
            sessionId: mockPayload.sessionId,
            projectId: mockPayload.projectId,
            stageSlug: mockPayload.stageSlug,
            iterationNumber: mockPayload.iterationNumber,
            walletId: undefined,
            continueUntilComplete: mockPayload.continueUntilComplete,
            maxRetries: undefined,
            continuation_count: undefined,
            target_contribution_id: undefined,
            step_info: mockPayload.step_info,
            prompt_template_name: 'default_seed_prompt',
            output_type: 'thesis',
            inputs: {},
        };
        const expectedJob = { ...mockJob, payload: transformedPayload };

        assertEquals(call.args[1], expectedJob, 'Second argument should be the transformed job object');
        assertEquals(call.args[2], 'user-id-params', 'Third argument should be projectOwnerUserId');
        assertEquals(call.args[3], mockDeps, 'Fourth argument should be deps');
        assertEquals(call.args[4], 'mock-token-params', 'Fifth argument should be authToken');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - verifies correct parameters passed to processComplexJob', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-verify-complex-params';
    const mockPayload: DialecticPlanJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-complex-params',
        projectId: 'project-id-complex-params',
        stageSlug: 'antithesis',
        model_id: 'model-id-complex',
    };
    
    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id-complex-params',
        session_id: 'session-id-complex-params',
        stage_slug: 'antithesis',
        payload: mockPayload,
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
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-antithesis',
                        slug: 'antithesis',
                        input_artifact_rules: {
                            processing_strategy: {
                                type: 'task_isolation'
                            }
                        },
                    }]
                }
            }
        }
    });

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id-complex-params', mockDeps, 'mock-token-complex', processors);

        // 3. Assert
        assertEquals(spies.processComplexJob.calls.length, 1, 'processComplexJob should be called once');
        
        const call = spies.processComplexJob.calls[0];
        assertEquals(call.args.length, 4, 'processComplexJob should be called with 4 arguments');
        
        // Verify the parameters passed to processComplexJob
        assertEquals(call.args[1], { ...mockJob, payload: mockPayload }, 'Second argument should be the job object and its payload');
        assertEquals(call.args[2], 'user-id-complex-params', 'Third argument should be projectOwnerUserId');
        
        // Verify that complexDeps contains the expected properties
        const complexDeps = call.args[3];
        assertExists(complexDeps.logger, 'complexDeps should have logger');
        assertExists(complexDeps.planComplexStage, 'complexDeps should have planComplexStage');
        assertExists(complexDeps.promptAssembler, 'complexDeps should have promptAssembler');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});
