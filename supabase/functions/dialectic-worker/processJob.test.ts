
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'jsr:@std/testing@0.225.1/mock';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient, type IMockQueryBuilder } from '../_shared/supabase.mock.ts';
import { processJob } from './processJob.ts';
import { logger } from '../_shared/logger.ts';
import type { DialecticJobPayload, IDialecticJobDeps, SeedPromptData, IContinueJobResult, DialecticPlanJobPayload } from '../dialectic-service/dialectic.interface.ts';
import { MockFileManagerService } from '../_shared/services/file_manager.mock.ts';
import type { DownloadStorageResult } from '../_shared/supabase_storage_utils.ts';
import type { UnifiedAIResponse } from '../dialectic-service/dialectic.interface.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isJson } from '../_shared/utils/type_guards.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { mockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { MockRagService } from '../_shared/services/rag_service.mock.ts';
import { FileType } from '../_shared/types/file_manager.types.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];
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
    documentRenderer: { renderDocument: () => Promise.resolve({ pathContext: { projectId: '', sessionId: '', iteration: 0, stageSlug: '', documentKey: '', fileType: FileType.business_case, modelSlug: '' }, renderedBytes: new Uint8Array() }) },
};

// Step 6.a — Dispatch strictly by job.job_type: PLAN -> processComplexJob (ignore payload shape)
Deno.test('processJob - dispatches by job.job_type: PLAN routes to processComplexJob', async () => {
    const { processors, spies } = createMockJobProcessors();

    // Payload intentionally shaped like EXECUTE while row says PLAN to prove payload is ignored
    const executeShapedPayload: DialecticJobPayload = {
        job_type: 'EXECUTE',
        sessionId: 'session-id-plan-dispatch',
        projectId: 'project-id-plan-dispatch',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id-plan-dispatch',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(executeShapedPayload)) throw new Error('Test setup failed: executeShapedPayload not Json');

    const mockJob: MockJob = {
        id: 'job-id-plan-dispatch',
        user_id: 'user-id',
        session_id: 'session-id-plan-dispatch',
        stage_slug: 'thesis',
        payload: executeShapedPayload,
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

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: executeShapedPayload },
            'user-id',
            mockDeps,
            'mock-token',
            processors,
        );

        assertEquals(spies.processComplexJob.calls.length, 1, 'PLAN must dispatch to processComplexJob');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob must not be called for PLAN');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 6.a — Dispatch strictly by job.job_type: EXECUTE -> processSimpleJob (ignore payload shape)
Deno.test('processJob - dispatches by job.job_type: EXECUTE routes to processSimpleJob', async () => {
    const { processors, spies } = createMockJobProcessors();

    // Payload intentionally shaped like PLAN while row says EXECUTE to prove payload is ignored
    const planShapedPayload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-exec-dispatch',
        projectId: 'project-id-exec-dispatch',
        stageSlug: 'antithesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const mockJob: MockJob = {
        id: 'job-id-exec-dispatch',
        user_id: 'user-id',
        session_id: 'session-id-exec-dispatch',
        stage_slug: 'antithesis',
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
        job_type: 'EXECUTE',
    };

    // Provide a stage stub that would have driven legacy logic to complex, ensuring RED against new expectation
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': { select: { data: [{ id: 'stage-id-antithesis', slug: 'antithesis' }] } },
        },
    });

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: planShapedPayload },
            'user-id',
            mockDeps,
            'mock-token',
            processors,
        );

        assertEquals(spies.processSimpleJob.calls.length, 1, 'EXECUTE must dispatch to processSimpleJob');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob must not be called for EXECUTE');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 6.a — Ignore processing_strategy; PLAN must still route to processComplexJob
Deno.test('processJob - ignores processing_strategy; PLAN always routes to processComplexJob', async () => {
    const { processors, spies } = createMockJobProcessors();

    const planPayload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-ignore-strategy',
        projectId: 'project-id-ignore-strategy',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

    const mockJob: MockJob = {
        id: 'job-id-ignore-strategy',
        user_id: 'user-id',
        session_id: 'session-id-ignore-strategy',
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
        is_test_job: false,
        job_type: 'PLAN',
    };

    // Legacy code would look at input_artifact_rules.processing_strategy and route simple if unsupported
    const mockSupabase = createMockSupabaseClient(undefined, {
        genericMockResults: {
            'dialectic_stages': {
                select: { data: [{ id: 'stage-id-thesis', slug: 'thesis', input_artifact_rules: { processing_strategy: { type: 'unsupported' } } }] },
            },
        },
    });

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: planPayload },
            'user-id',
            mockDeps,
            'mock-token',
            processors,
        );

        assertEquals(spies.processComplexJob.calls.length, 1, 'PLAN must dispatch to processComplexJob even with unsupported processing_strategy');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob must not be called for PLAN');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Additional coverage: PLAN passes job and args through unchanged
Deno.test('processJob - PLAN passes job unchanged and propagates args', async () => {
    const { processors, spies } = createMockJobProcessors();

    const planPayload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-propagation-plan',
        projectId: 'project-id-propagation-plan',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

    const rowJob: MockJob = {
        id: 'job-id-propagation-plan',
        user_id: 'user-id-plan',
        session_id: 'session-id-propagation-plan',
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
        is_test_job: false,
        job_type: 'PLAN',
    };

    const mockSupabase = createMockSupabaseClient();
    const authToken = 'propagation-token-plan';

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload: planPayload },
            'user-id-plan',
            mockDeps,
            authToken,
            processors,
        );

        const call = spies.processComplexJob.calls[0];
        assertEquals(call.args[0], mockSupabase.client, 'dbClient should be passed through unchanged');
        assertEquals(call.args[1], { ...rowJob, payload: planPayload }, 'job row should be passed through unchanged');
        assertEquals(call.args[2], 'user-id-plan', 'projectOwnerUserId should be passed through unchanged');
        assertEquals(call.args[3], mockDeps, 'deps should be passed through unchanged');
        assertEquals(call.args[4], authToken, 'authToken should be passed through unchanged');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Additional coverage: EXECUTE passes job and args through unchanged
Deno.test('processJob - EXECUTE passes job unchanged and propagates args', async () => {
    const { processors, spies } = createMockJobProcessors();

    // PLAN-shaped payload even though row is EXECUTE, to prove payload is ignored
    const planShaped: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-propagation-exec',
        projectId: 'project-id-propagation-exec',
        stageSlug: 'antithesis',
        model_id: 'model-id-exec',
        walletId: 'wallet-id-exec',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planShaped)) throw new Error('Test setup failed: planShaped not Json');

    const rowJob: MockJob = {
        id: 'job-id-propagation-exec',
        user_id: 'user-id-exec',
        session_id: 'session-id-propagation-exec',
        stage_slug: 'antithesis',
        payload: planShaped,
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
    };

    const mockSupabase = createMockSupabaseClient();
    const authToken = 'propagation-token-exec';

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload: planShaped },
            'user-id-exec',
            mockDeps,
            authToken,
            processors,
        );

        const call = spies.processSimpleJob.calls[0];
        assertEquals(call.args[0], mockSupabase.client, 'dbClient should be passed through unchanged');
        assertEquals(call.args[1], { ...rowJob, payload: planShaped }, 'job row should be passed through unchanged');
        assertEquals(call.args[2], 'user-id-exec', 'projectOwnerUserId should be passed through unchanged');
        assertEquals(call.args[3], mockDeps, 'deps should be passed through unchanged');
        assertEquals(call.args[4], authToken, 'authToken should be passed through unchanged');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Additional coverage: No stage query at router (PLAN)
Deno.test('processJob - PLAN does not query dialectic_stages in router', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-no-stage-plan',
        projectId: 'project-id-no-stage-plan',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob: MockJob = {
        id: 'job-id-no-stage-plan',
        user_id: 'user-id-no-stage-plan',
        session_id: 'session-id-no-stage-plan',
        stage_slug: 'thesis',
        payload,
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

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id-no-stage-plan',
            mockDeps,
            'mock-token',
            processors,
        );

        const stageFromCalls = mockSupabase.spies.fromSpy.calls.filter((call) => call.args && call.args[0] === 'dialectic_stages');
        assertEquals(stageFromCalls.length, 0, 'router must not query dialectic_stages for PLAN dispatch');
        assertEquals(spies.processComplexJob.calls.length, 1);
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Additional coverage: No stage query at router (EXECUTE)
Deno.test('processJob - EXECUTE does not query dialectic_stages in router', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-no-stage-exec',
        projectId: 'project-id-no-stage-exec',
        stageSlug: 'antithesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob: MockJob = {
        id: 'job-id-no-stage-exec',
        user_id: 'user-id-no-stage-exec',
        session_id: 'session-id-no-stage-exec',
        stage_slug: 'antithesis',
        payload,
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
    };

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id-no-stage-exec',
            mockDeps,
            'mock-token',
            processors,
        );

        const stageFromCalls = mockSupabase.spies.fromSpy.calls.filter((call) => call.args && call.args[0] === 'dialectic_stages');
        assertEquals(stageFromCalls.length, 0, 'router must not query dialectic_stages for EXECUTE dispatch');
        assertEquals(spies.processSimpleJob.calls.length, 1);
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Error handling: null job_type should throw and not call processors
Deno.test('processJob - null job_type should throw and not dispatch', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-null-type',
        projectId: 'project-id-null-type',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob: MockJob = {
        id: 'job-id-null-type',
        user_id: 'user-id-null-type',
        session_id: 'session-id-null-type',
        stage_slug: 'thesis',
        payload,
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
        job_type: null,
    };

    const mockSupabase = createMockSupabaseClient();

    let threw = false;
    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id-null-type',
            mockDeps,
            'mock-token',
            processors,
        );
    } catch (_e) {
        threw = true;
    } finally {
        assertEquals(threw, true, 'router should throw on null job_type');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob must not be called');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob must not be called');
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Error bubbling: downstream processor errors should surface unchanged
Deno.test('processJob - bubbles errors from downstream processor', async () => {
    const { processors, spies } = createMockJobProcessors();

    // Force EXECUTE path
    const payload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-bubble',
        projectId: 'project-id-bubble',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob: MockJob = {
        id: 'job-id-bubble',
        user_id: 'user-id-bubble',
        session_id: 'session-id-bubble',
        stage_slug: 'thesis',
        payload,
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
    };

    // Make the EXECUTE processor throw
    const err = new Error('processor failed');
    const original = processors.processSimpleJob;
    processors.processSimpleJob = async () => { throw err; };

    const mockSupabase = createMockSupabaseClient();

    let threw = false;
    let message = '';
    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id-bubble',
            mockDeps,
            'mock-token',
            processors,
        );
    } catch (e) {
        threw = true;
        message = e instanceof Error ? e.message : String(e);
    } finally {
        processors.processSimpleJob = original;
        assertEquals(threw, true, 'router should bubble downstream errors');
        assertEquals(message, 'processor failed');
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 9.f — Dispatch strictly by job.job_type: RENDER -> processRenderJob (ignore payload shape)
Deno.test('processJob - dispatches by job.job_type: RENDER routes to processRenderJob', async () => {
    const { processors, spies } = createMockJobProcessors();

    // Payload intentionally shaped like PLAN to prove payload is ignored
    const planShapedPayload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-render-dispatch',
        projectId: 'project-id-render-dispatch',
        stageSlug: 'synthesis',
        model_id: 'model-id',
        walletId: 'wallet-id-render-dispatch',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const mockJob: MockJob = {
        id: 'job-id-render-dispatch',
        user_id: 'user-id',
        session_id: 'session-id-render-dispatch',
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

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload: planShapedPayload },
            'user-id',
            mockDeps,
            'mock-token',
            processors,
        );

        assertEquals(spies.processRenderJob.calls.length, 1, 'RENDER must dispatch to processRenderJob');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob must not be called for RENDER');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob must not be called for RENDER');
    } finally {
        spies.processRenderJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 9.f — Propagation: RENDER passes job and args through unchanged
Deno.test('processJob - RENDER passes job unchanged and propagates args', async () => {
    const { processors, spies } = createMockJobProcessors();

    const planShapedPayload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-render-propagation',
        projectId: 'project-id-render-propagation',
        stageSlug: 'parenthesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const rowJob: MockJob = {
        id: 'job-id-render-propagation',
        user_id: 'user-id-render',
        session_id: 'session-id-render-propagation',
        stage_slug: 'parenthesis',
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

    const mockSupabase = createMockSupabaseClient();
    const authToken = 'propagation-token-render';

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload: planShapedPayload },
            'user-id-render',
            mockDeps,
            authToken,
            processors,
        );

        const call = spies.processRenderJob.calls[0];
        assertEquals(call.args[0], mockSupabase.client, 'dbClient should be passed through unchanged');
        assertEquals(call.args[1], { ...rowJob, payload: planShapedPayload }, 'job row should be passed through unchanged');
        assertEquals(call.args[2], 'user-id-render', 'projectOwnerUserId should be passed through unchanged');
        assertEquals(call.args[3], mockDeps, 'deps should be passed through unchanged');
        assertEquals(call.args[4], authToken, 'authToken should be passed through unchanged');
    } finally {
        spies.processRenderJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 9.f — No stage queries in the router for RENDER
Deno.test('processJob - RENDER does not query dialectic_stages in router', async () => {
    const { processors, spies } = createMockJobProcessors();

    const planShapedPayload: DialecticPlanJobPayload = {
        job_type: 'PLAN',
        sessionId: 'session-id-no-stage-render',
        projectId: 'project-id-no-stage-render',
        stageSlug: 'paralysis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const rowJob: MockJob = {
        id: 'job-id-no-stage-render',
        user_id: 'user-id-no-stage-render',
        session_id: 'session-id-no-stage-render',
        stage_slug: 'paralysis',
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

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload: planShapedPayload },
            'user-id-no-stage-render',
            mockDeps,
            'mock-token',
            processors,
        );

        const stageFromCalls = mockSupabase.spies.fromSpy.calls.filter((call) => call.args && call.args[0] === 'dialectic_stages');
        assertEquals(stageFromCalls.length, 0, 'router must not query dialectic_stages for RENDER dispatch');
        assertEquals(spies.processRenderJob.calls.length, 1);
    } finally {
        spies.processRenderJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});