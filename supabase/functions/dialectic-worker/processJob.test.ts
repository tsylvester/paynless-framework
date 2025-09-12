
import { assertEquals, assertExists } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processJob } from './processJob.ts';
import { logger } from '../_shared/logger.ts';
import type { DialecticJobPayload, IDialecticJobDeps, SeedPromptData, IContinueJobResult, DialecticPlanJobPayload } from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isJson, isRecord } from '../_shared/utils/type_guards.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
type PlanWithJwt = DialecticPlanJobPayload & { user_jwt: string };
const mockDeps: IDialecticJobDeps = {
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
        walletId: 'wallet-id-simple',
        user_jwt: 'jwt.token.here',
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


// plan→execute simple transform preserves dynamic stage consistency
Deno.test('processJob - simple transform preserves dynamic stage consistency (row.stage_slug === payload.stageSlug)', async () => {
	const { processors, spies } = createMockJobProcessors();

	// Arrange a non-thesis simple stage; make DB and row agree with payload.stageSlug
	const expectedStage = 'parenthesis';
	const planPayload: DialecticJobPayload = {
		job_type: 'plan',
		step_info: { current_step: 1, total_steps: 1 },
		sessionId: 'session-id-stage-consistency',
		projectId: 'project-id-stage-consistency',
		stageSlug: expectedStage,
		model_id: 'model-id-stage-consistency',
		walletId: 'wallet-id-stage-consistency',
		user_jwt: 'jwt.token.here',
	};
	if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

	const mockJob: MockJob = {
		id: 'job-id-stage-consistency',
		user_id: 'user-id-stage-consistency',
		session_id: 'session-id-stage-consistency',
		stage_slug: expectedStage,
		payload: planPayload,
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
					data: [{ id: 'stage-id-parenthesis', slug: expectedStage, display_name: 'Parenthesis', input_artifact_rules: null }],
				},
			},
			'dialectic_sessions': { select: { data: [{ id: 'session-id-stage-consistency' }] } },
		},
	});

	try {
		await processJob(
			mockSupabase.client as unknown as SupabaseClient<Database>,
			{ ...mockJob, payload: planPayload },
			'user-id-stage-consistency',
			mockDeps,
			'mock-token',
			processors,
		);

		// Assert we transformed and delegated once
		assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once');

		// Grab the transformed job passed to processSimpleJob
		const transformedJob = spies.processSimpleJob.calls[0].args[1];
		const transformedPayload = transformedJob.payload;

		// Assert row.stage_slug === payload.stageSlug and both equal the expected dynamic stage
		assertEquals(transformedJob.stage_slug, expectedStage, 'row.stage_slug should equal expected stage');
		assertEquals(
			typeof transformedPayload.stageSlug === 'string' ? transformedPayload.stageSlug : undefined,
			expectedStage,
			'payload.stageSlug should equal expected stage',
		);
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
    const mockPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-complex',
        projectId: 'project-id-complex',
        stageSlug: 'antithesis', // A complex stage
        model_id: 'model-id-complex',
        walletId: 'wallet-id-complex',
        user_jwt: 'jwt.token.here',
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
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
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
    const mockPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id',
        projectId: 'project-id',
        stageSlug: 'thesis', // Use a valid slug
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
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
    const mockPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-params',
        projectId: 'project-id-params',
        stageSlug: 'thesis',
        model_id: 'model-id-1',
        iterationNumber: 1,
        continueUntilComplete: true,
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
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
            walletId: mockPayload.walletId,
            continueUntilComplete: mockPayload.continueUntilComplete,
            maxRetries: undefined,
            continuation_count: undefined,
            target_contribution_id: undefined,
            step_info: mockPayload.step_info,
            output_type: 'thesis',
            inputs: {},
            canonicalPathParams: {
                contributionType: 'thesis',
            },
            user_jwt: 'jwt.token.here',
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
        walletId: 'wallet-id-complex',
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
        assertEquals(call.args.length, 5, 'processComplexJob should be called with 5 arguments');
        
        // Verify the parameters passed to processComplexJob
        assertEquals(call.args[1], { ...mockJob, payload: mockPayload }, 'Second argument should be the job object and its payload');
        assertEquals(call.args[2], 'user-id-complex-params', 'Third argument should be projectOwnerUserId');
        assertEquals(call.args[3], mockDeps, 'Fourth argument should be the unified deps object');
        
        // Verify that complexDeps contains the expected properties
        const passedDeps = call.args[3];
        assertExists(passedDeps.logger, 'deps should have logger');
        assertExists(passedDeps.planComplexStage, 'deps should have planComplexStage');
        assertExists(passedDeps.ragService, 'deps should have ragService');
        assertExists(passedDeps.fileManager, 'deps should have fileManager');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - simple plan→execute should NOT set prompt_template_name', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-no-prompt-template-name';
    const simplePlanPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-simple',
        projectId: 'project-id-simple',
        stageSlug: 'thesis',
        model_id: 'model-id-simple',
        iterationNumber: 1,
        continueUntilComplete: false,
        walletId: 'wallet-id-simple',
        user_jwt: 'jwt.token.here',
    };

    if (!isJson(simplePlanPayload)) {
        throw new Error('Test setup failed: simplePlanPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id-simple',
        session_id: 'session-id-simple',
        stage_slug: 'thesis',
        payload: simplePlanPayload,
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
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: simplePlanPayload },
            'user-id-simple',
            mockDeps,
            'mock-token-simple',
            processors,
        );

        // Ensure simple processor was called
        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once for simple stage');

        // Inspect transformed execute payload
        const transformedPayload = spies.processSimpleJob.calls[0].args[1].payload as Record<string, unknown>;

        // RED assertions: field should be absent/undefined and must not be 'default_seed_prompt'
        assertEquals('prompt_template_name' in transformedPayload, false, "prompt_template_name should not be present for simple plan→execute");
        // If present due to bug, ensure it's not 'default_seed_prompt'
        if ('prompt_template_name' in transformedPayload) {
            assertEquals(transformedPayload.prompt_template_name, undefined, "prompt_template_name should be undefined for simple plan→execute");
        }

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('should clear target_contribution_id when transforming a simple plan job', async () => {
    // 1. Setup
    const { processors, spies } = createMockJobProcessors();

    const mockJobId = 'job-id-simple-transform-clear';
    const mockPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-simple-transform',
        projectId: 'project-id-simple-transform',
        stageSlug: 'parenthesis', // A simple stage that follows a complex one
        model_id: 'model-id-1',
        iterationNumber: 1,
        // THIS IS THE CRITICAL PART: the plan job has a target from the previous stage
        target_contribution_id: 'synthesis-doc-uuid', 
        walletId: 'wallet-id-simple-transform',
        user_jwt: 'jwt.token.here',
        };

    if (!isJson(mockPayload)) {
        throw new Error('Test setup failed: mockPayload is not a valid Json');
    }

    const mockJob: MockJob = {
        id: mockJobId,
        user_id: 'user-id-transform',
        session_id: 'session-id-simple-transform',
        stage_slug: 'parenthesis',
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
        target_contribution_id: 'synthesis-doc-uuid', // Also on the job row
        prerequisite_job_id: null,
    };

    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: {
                    data: [{
                        id: 'stage-id-parenthesis',
                        slug: 'parenthesis',
                        display_name: 'Parenthesis',
                        input_artifact_rules: null, // Simple stage
                    }]
                }
            }
        }
    });

    try {
        // 2. Execute
        await processJob(mockSupabase.client as unknown as SupabaseClient<Database>, { ...mockJob, payload: mockPayload }, 'user-id-transform', mockDeps, 'mock-token', processors);

        // 3. Assert
        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once');
        
        const call = spies.processSimpleJob.calls[0];
        const transformedJobPayload = call.args[1].payload;

        // The core assertion: the target_contribution_id should be cleared for the new 'execute' job.
        assertEquals(transformedJobPayload.target_contribution_id, undefined, 'target_contribution_id should be cleared for the transformed execute job');

    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});


// =============================================================
// processJob (plan → execute transform)
// =============================================================
Deno.test('processJob - plan→execute transform preserves payload.user_jwt', async () => {
    const { processors, spies } = createMockJobProcessors();

    const planPayload: DialecticJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-preserve',
        projectId: 'project-id-preserve',
        stageSlug: 'thesis',
        model_id: 'model-id-preserve',
        walletId: 'wallet-id-preserve',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

    const mockJob: MockJob = {
        id: 'job-id-preserve',
        user_id: 'user-id-preserve',
        session_id: 'session-id-preserve',
        stage_slug: 'thesis',
        payload: planPayload,
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
            'dialectic_stages': { select: { data: [{ id: 'stage-id-thesis', slug: 'thesis', display_name: 'Thesis', input_artifact_rules: null }] } },
            'dialectic_sessions': { select: { data: [{ id: 'session-id-preserve' }] } },
        }
    });

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: planPayload },
            'user-id-preserve',
            mockDeps,
            'mock-token',
            processors,
        );

        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called once');
        const transformed = spies.processSimpleJob.calls[0].args[1];
        const p = transformed && transformed.payload;
        let preserved = false;
        let value = '';
        if (isRecord(p) && 'user_jwt' in p) {
            const v = p['user_jwt'];
            if (typeof v === 'string' && v.length > 0) { preserved = true; value = v; }
        }
        assertEquals(preserved, true);
        assertEquals(value, 'jwt.token.here');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - missing payload.user_jwt in plan job fails before transform', async () => {
    const { processors, spies } = createMockJobProcessors();

    const planPayload: DialecticPlanJobPayload = {
        job_type: 'plan',
        step_info: { current_step: 1, total_steps: 1 },
        sessionId: 'session-id-missing',
        projectId: 'project-id-missing',
        stageSlug: 'thesis',
        model_id: 'model-id-missing',
        walletId: 'wallet-id-missing',
        // user_jwt intentionally omitted
    };
    if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

    const mockJob: MockJob = {
        id: 'job-id-missing',
        user_id: 'user-id-missing',
        session_id: 'session-id-missing',
        stage_slug: 'thesis',
        payload: planPayload,
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
            'dialectic_stages': { select: { data: [{ id: 'stage-id-thesis', slug: 'thesis', display_name: 'Thesis', input_artifact_rules: null }] } },
            'dialectic_sessions': { select: { data: [{ id: 'session-id-missing' }] } },
        }
    });

    let threw = false;
    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: planPayload },
            'user-id-missing',
            mockDeps,
            'mock-token',
            processors,
        );
    } catch (_e) {
        threw = true;
    } finally {
        // Assert transform not called
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob must not be called when jwt is missing');
        assertEquals(threw, true);
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});
