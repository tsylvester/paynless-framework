
import { assertEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processJob } from './processJob.ts';
import { 
    DialecticJobPayload, 
    DialecticPlanJobPayload 
} from '../dialectic-service/dialectic.interface.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import { 
    createExecuteJobContext, 
    createJobContext, 
    createPlanJobContext, 
    createRenderJobContext 
} from './createJobContext.ts';
import { IJobContext } from './JobContext.interface.ts';
import { createMockJobContextParams } from './JobContext.mock.ts';

type MockJob = Database['public']['Tables']['dialectic_generation_jobs']['Row'];

// Create full IJobContext via createJobContext(mockParams)
const mockCtx: IJobContext = createJobContext(createMockJobContextParams());

// Step 6.a — Dispatch strictly by job.job_type: PLAN -> processComplexJob (ignore payload shape)
Deno.test('processJob - dispatches by job.job_type: PLAN routes to processComplexJob', async () => {
    const { processors, spies } = createMockJobProcessors();

    // Payload intentionally shaped like EXECUTE while row says PLAN to prove payload is ignored
    const executeShapedPayload: DialecticJobPayload = {
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            authToken,
        );

        const call = spies.processComplexJob.calls[0];
        assertEquals(call.args[0], mockSupabase.client, 'dbClient should be passed through unchanged');
        assertEquals(call.args[1], { ...rowJob, payload: planPayload }, 'job row should be passed through unchanged');
        assertEquals(call.args[2], 'user-id-plan', 'projectOwnerUserId should be passed through unchanged');
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
            processors,
            mockCtx,
            authToken,
        );

        const call = spies.processSimpleJob.calls[0];
        assertEquals(call.args[0], mockSupabase.client, 'dbClient should be passed through unchanged');
        assertEquals(call.args[1], { ...rowJob, payload: planShaped }, 'job row should be passed through unchanged');
        assertEquals(call.args[2], 'user-id-exec', 'projectOwnerUserId should be passed through unchanged');
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            'mock-token',
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
            processors,
            mockCtx,
            authToken,
        );

        const call = spies.processRenderJob.calls[0];
        assertEquals(call.args[0], mockSupabase.client, 'dbClient should be passed through unchanged');
        assertEquals(call.args[1], { ...rowJob, payload: planShapedPayload }, 'job row should be passed through unchanged');
        assertEquals(call.args[2], 'user-id-render', 'projectOwnerUserId should be passed through unchanged');
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
            processors,
            mockCtx,
            'mock-token',
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

// Step 51.b.iv — Context slicing: EXECUTE jobs receive IExecuteJobContext
Deno.test('processJob - slices to IExecuteJobContext for EXECUTE jobs', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticJobPayload = {
        sessionId: 'session-id-slice-execute',
        projectId: 'project-id-slice-execute',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const mockJob: MockJob = {
        id: 'job-id-slice-execute',
        user_id: 'user-id',
        session_id: 'session-id-slice-execute',
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

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );

        assertEquals(spies.processSimpleJob.calls.length, 1, 'processSimpleJob should be called');
        const call = spies.processSimpleJob.calls[0];
        const receivedCtx = call.args[3];
        const expectedCtx = createExecuteJobContext(mockCtx);
        assertEquals(receivedCtx, expectedCtx, 'EXECUTE job should receive createExecuteJobContext(ctx) result');

        if (typeof receivedCtx !== 'object' || receivedCtx === null) {
            throw new Error('Expected EXECUTE job processor to receive an object context');
        }

        // Verify EXECUTE-only fields are present
        assertEquals(Reflect.has(receivedCtx, 'ragService'), true, 'IExecuteJobContext should have ragService');
        assertEquals(Reflect.has(receivedCtx, 'promptAssembler'), true, 'IExecuteJobContext should have promptAssembler');
        assertEquals(typeof Reflect.get(receivedCtx, 'getSeedPromptForStage'), 'function', 'IExecuteJobContext should have getSeedPromptForStage');

        // Verify PLAN-only fields are absent
        assertEquals(Reflect.has(receivedCtx, 'planComplexStage'), false, 'IExecuteJobContext should NOT have planComplexStage');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 51.b.v — Context slicing: PLAN jobs receive IPlanJobContext
Deno.test('processJob - slices to IPlanJobContext for PLAN jobs', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticPlanJobPayload = {
        sessionId: 'session-id-slice-plan',
        projectId: 'project-id-slice-plan',
        stageSlug: 'antithesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const mockJob: MockJob = {
        id: 'job-id-slice-plan',
        user_id: 'user-id',
        session_id: 'session-id-slice-plan',
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
        job_type: 'PLAN',
    };

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );

        assertEquals(spies.processComplexJob.calls.length, 1, 'processComplexJob should be called');
        const call = spies.processComplexJob.calls[0];
        const receivedCtx = call.args[3];
        const expectedCtx = createPlanJobContext(mockCtx);
        assertEquals(receivedCtx, expectedCtx, 'PLAN job should receive createPlanJobContext(ctx) result');

        if (typeof receivedCtx !== 'object' || receivedCtx === null) {
            throw new Error('Expected PLAN job processor to receive an object context');
        }

        // Verify PLAN-only fields are present (minimal plan context)
        assertEquals(Reflect.has(receivedCtx, 'logger'), true, 'IPlanJobContext should have logger');
        assertEquals(typeof Reflect.get(receivedCtx, 'planComplexStage'), 'function', 'IPlanJobContext should have planComplexStage');
        assertEquals(typeof Reflect.get(receivedCtx, 'getGranularityPlanner'), 'function', 'IPlanJobContext should have getGranularityPlanner');

        // Verify EXECUTE-only fields are absent
        assertEquals(Reflect.has(receivedCtx, 'ragService'), false, 'IPlanJobContext should NOT have ragService');
        assertEquals(Reflect.has(receivedCtx, 'promptAssembler'), false, 'IPlanJobContext should NOT have promptAssembler');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// Step 51.b.vi — Context slicing: RENDER jobs receive IRenderJobContext
Deno.test('processJob - slices to IRenderJobContext for RENDER jobs', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticJobPayload = {
        sessionId: 'session-id-slice-render',
        projectId: 'project-id-slice-render',
        stageSlug: 'synthesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const mockJob: MockJob = {
        id: 'job-id-slice-render',
        user_id: 'user-id',
        session_id: 'session-id-slice-render',
        stage_slug: 'synthesis',
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
        job_type: 'RENDER',
    };

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...mockJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );

        assertEquals(spies.processRenderJob.calls.length, 1, 'processRenderJob should be called');
        const call = spies.processRenderJob.calls[0];
        const receivedCtx = call.args[3];
        const expectedCtx = createRenderJobContext(mockCtx);
        assertEquals(receivedCtx, expectedCtx, 'RENDER job should receive createRenderJobContext(ctx) result');

        if (typeof receivedCtx !== 'object' || receivedCtx === null) {
            throw new Error('Expected RENDER job processor to receive an object context');
        }

        // Verify RENDER-only fields are present
        assertEquals(Reflect.has(receivedCtx, 'logger'), true, 'IRenderJobContext should have logger');
        assertEquals(Reflect.has(receivedCtx, 'documentRenderer'), true, 'IRenderJobContext should have documentRenderer');
        assertEquals(Reflect.has(receivedCtx, 'fileManager'), true, 'IRenderJobContext should have fileManager');
        assertEquals(Reflect.has(receivedCtx, 'notificationService'), true, 'IRenderJobContext should have notificationService');

        // Verify EXECUTE/PLAN-only fields are absent
        assertEquals(Reflect.has(receivedCtx, 'ragService'), false, 'IRenderJobContext should NOT have ragService');
        assertEquals(Reflect.has(receivedCtx, 'planComplexStage'), false, 'IRenderJobContext should NOT have planComplexStage');
    } finally {
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});