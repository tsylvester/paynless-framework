
import { assertEquals, assertExists } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database, Json } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processJob } from './processJob.ts';
import { logger } from '../_shared/logger.ts';
import type { GenerateContributionsDeps, GenerateContributionsPayload } from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { validatePayload } from '../_shared/utils/type_guards.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

Deno.test('processJob - routes to processSimpleJob for simple stages', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-simple-route';
    const mockPayload: Json = {
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis', // A simple stage
        selectedModelIds: ['model-id'],
        continueUntilComplete: false,
    };
    const validatedPayload = validatePayload(mockPayload);

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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-thesis',
                        slug: 'thesis',
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

    const mockDeps: GenerateContributionsDeps = {
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
    };

    try {
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, validatedPayload, 'user-id', mockDeps, 'mock-token', processors);

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
    const mockPayload: Json = {
        sessionId: 'session-id-complex',
        projectId: 'project-id-complex',
        stageSlug: 'antithesis', // A complex stage
        selectedModelIds: ['model-id-complex'],
    };
    const validatedPayload = validatePayload(mockPayload);

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

    const mockDeps = {
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
    };

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, validatedPayload, 'user-id-complex', mockDeps, 'mock-token', processors);

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
    const mockPayload: Json = {
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'nonexistent-stage',
        selectedModelIds: ['model-id'],
    };
    const validatedPayload = validatePayload(mockPayload);

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

    const mockDeps: GenerateContributionsDeps = {
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
    };

    try {
        // 2. Execute & Assert
        let threwError = false;
        let errorMessage = '';
        try {
            await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, validatedPayload, 'user-id', mockDeps, 'mock-token', processors);
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

Deno.test('processJob - throws error for unsupported processing strategy', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-unsupported-strategy';
    const mockPayload: Json = {
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'custom-stage',
        selectedModelIds: ['model-id'],
    };
    const validatedPayload = validatePayload(mockPayload);

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id',
        session_id: 'session-id',
        stage_slug: 'custom-stage',
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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-custom',
                        slug: 'custom-stage',
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

    const mockDeps: GenerateContributionsDeps = {
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
    };

    try {
        // 2. Execute & Assert
        let threwError = false;
        let errorMessage = '';
        try {
            await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, validatedPayload, 'user-id', mockDeps, 'mock-token', processors);
        } catch (error) {
            threwError = true;
            errorMessage = error instanceof Error ? error.message : String(error);
        }

        assertEquals(threwError, true, 'Should throw an error for unsupported processing strategy');
        assertEquals(errorMessage, 'Unsupported processing strategy encountered: unsupported_strategy');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob should not be called');
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
    const mockPayload: Json = {
        sessionId: 'session-id-params',
        projectId: 'project-id-params',
        stageSlug: 'thesis',
        selectedModelIds: ['model-id-1', 'model-id-2'],
        continueUntilComplete: true,
    };
    const validatedPayload = validatePayload(mockPayload);

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
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-thesis',
                        slug: 'thesis',
                        input_artifact_rules: null, // Simple stage
                    }]
                }
            }
        }
    });

    const mockDeps: GenerateContributionsDeps = {
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
    };

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, validatedPayload, 'user-id-params', mockDeps, 'mock-token-params', processors);

        // 3. Assert
        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once');
        
        const call = spies.processSimpleJob.calls[0];
        assertEquals(call.args.length, 6, 'processSimpleJob should be called with 6 arguments');
        
        // Verify the parameters passed to processSimpleJob
        assertEquals(call.args[1], mockJob, 'Second argument should be the job object');
        assertEquals(call.args[2], validatedPayload, 'Third argument should be the validated payload');
        assertEquals(call.args[3], 'user-id-params', 'Fourth argument should be projectOwnerUserId');
        assertEquals(call.args[4], mockDeps, 'Fifth argument should be deps');
        assertEquals(call.args[5], 'mock-token-params', 'Sixth argument should be authToken');

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
    const mockPayload: Json = {
        sessionId: 'session-id-complex-params',
        projectId: 'project-id-complex-params',
        stageSlug: 'antithesis',
        selectedModelIds: ['model-id-complex'],
    };
    const validatedPayload = validatePayload(mockPayload);

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

    const mockDeps: GenerateContributionsDeps = {
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
    };

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, mockJob, validatedPayload, 'user-id-complex-params', mockDeps, 'mock-token-complex', processors);

        // 3. Assert
        assertEquals(spies.processComplexJob.calls.length, 1, 'processComplexJob should be called once');
        
        const call = spies.processComplexJob.calls[0];
        assertEquals(call.args.length, 5, 'processComplexJob should be called with 5 arguments');
        
        // Verify the parameters passed to processComplexJob
        assertEquals(call.args[1], mockJob, 'Second argument should be the job object');
        assertEquals(call.args[2], validatedPayload, 'Third argument should be the validated payload');
        assertEquals(call.args[3], 'user-id-complex-params', 'Fourth argument should be projectOwnerUserId');
        
        // Verify that complexDeps contains the expected properties
        const complexDeps = call.args[4];
        assertExists(complexDeps.logger, 'complexDeps should have logger');
        assertExists(complexDeps.planComplexStage, 'complexDeps should have planComplexStage');
        assertExists(complexDeps.promptAssembler, 'complexDeps should have promptAssembler');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});
