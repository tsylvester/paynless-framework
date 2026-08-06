
import { assert, assertEquals, assertStrictEquals } from 'https://deno.land/std@0.170.0/testing/asserts.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processJob } from './processJob.ts';
import {
    DialecticJobPayload,
    DialecticJobRow,
    DialecticPlanJobPayload
} from '../dialectic-service/dialectic.interface.ts';
import { isJson } from '../_shared/utils/type_guards.ts';
import { createMockJobProcessors } from '../_shared/dialectic.mock.ts';
import {
    createJobContext,
    createPlanJobContext,
    createRenderJobContext
} from './createJobContext/createJobContext.ts';
import { IJobContext } from './createJobContext/JobContext.interface.ts';
import { createMockJobContextParams, createMockRootContext } from './createJobContext/JobContext.mock.ts';
import { buildDialecticCompressJobPayload } from './enqueueCompressJobs/enqueueCompressJobs.mock.ts';
import { createMockJobRow } from './saveResponse/saveResponse.mock.ts';
import { ProcessCompressJobError, ProcessCompressJobReturn } from './processCompressJob/processCompressJob.interface.ts';
import { isProcessCompressJobDeps } from './processCompressJob/processCompressJob.guard.ts';
import {
    buildAssembleCompressionPromptParams,
    buildAssembleCompressionPromptPayload,
} from '../_shared/prompt-assembler/assembleCompressionPrompt/assembleCompressionPrompt.mock.ts';
import { buildIPromptAssembler } from '../_shared/prompt-assembler/prompt-assembler.mock.ts';
import type { DownloadFromStorageFn } from '../_shared/supabase_storage_utils.ts';

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(executeShapedPayload)) throw new Error('Test setup failed: executeShapedPayload not Json');

    const mockJob = createMockJobRow(executeShapedPayload, {
        id: 'job-id-plan-dispatch',
        user_id: 'user-id',
        session_id: 'session-id-plan-dispatch',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: 'PLAN',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const mockJob = createMockJobRow(planShapedPayload, {
        id: 'job-id-exec-dispatch',
        user_id: 'user-id',
        session_id: 'session-id-exec-dispatch',
        stage_slug: 'antithesis',
        status: 'pending',
        job_type: 'EXECUTE',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

    const mockJob = createMockJobRow(planPayload, {
        id: 'job-id-ignore-strategy',
        user_id: 'user-id',
        session_id: 'session-id-ignore-strategy',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: 'PLAN',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planPayload)) throw new Error('Test setup failed: planPayload not Json');

    const rowJob = createMockJobRow(planPayload, {
        id: 'job-id-propagation-plan',
        user_id: 'user-id-plan',
        session_id: 'session-id-propagation-plan',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: 'PLAN',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planShaped)) throw new Error('Test setup failed: planShaped not Json');

    const rowJob = createMockJobRow(planShaped, {
        id: 'job-id-propagation-exec',
        user_id: 'user-id-exec',
        session_id: 'session-id-propagation-exec',
        stage_slug: 'antithesis',
        status: 'pending',
        job_type: 'EXECUTE',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-no-stage-plan',
        user_id: 'user-id-no-stage-plan',
        session_id: 'session-id-no-stage-plan',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: 'PLAN',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-no-stage-exec',
        user_id: 'user-id-no-stage-exec',
        session_id: 'session-id-no-stage-exec',
        stage_slug: 'antithesis',
        status: 'pending',
        job_type: 'EXECUTE',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-null-type',
        user_id: 'user-id-null-type',
        session_id: 'session-id-null-type',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: null,
        idempotency_key: null,
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-bubble',
        user_id: 'user-id-bubble',
        session_id: 'session-id-bubble',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: 'EXECUTE',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const mockJob = createMockJobRow(planShapedPayload, {
        id: 'job-id-render-dispatch',
        user_id: 'user-id',
        session_id: 'session-id-render-dispatch',
        stage_slug: 'synthesis',
        status: 'pending',
        job_type: 'RENDER',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const rowJob = createMockJobRow(planShapedPayload, {
        id: 'job-id-render-propagation',
        user_id: 'user-id-render',
        session_id: 'session-id-render-propagation',
        stage_slug: 'parenthesis',
        status: 'pending',
        job_type: 'RENDER',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(planShapedPayload)) throw new Error('Test setup failed: planShapedPayload not Json');

    const rowJob = createMockJobRow(planShapedPayload, {
        id: 'job-id-no-stage-render',
        user_id: 'user-id-no-stage-render',
        session_id: 'session-id-no-stage-render',
        stage_slug: 'paralysis',
        status: 'pending',
        job_type: 'RENDER',
        idempotency_key: "idempotency-key-1",
    });

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

// EXECUTE jobs receive root IJobContext (prepareModelJob is bound at composition root)
Deno.test('processJob - passes root IJobContext for EXECUTE jobs', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload: DialecticJobPayload = {
        sessionId: 'session-id-slice-execute',
        projectId: 'project-id-slice-execute',
        stageSlug: 'thesis',
        model_id: 'model-id',
        walletId: 'wallet-id',
        user_jwt: 'jwt.token.here',
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const mockJob = createMockJobRow(payload, {
        id: 'job-id-slice-execute',
        user_id: 'user-id',
        session_id: 'session-id-slice-execute',
        stage_slug: 'thesis',
        status: 'pending',
        job_type: 'EXECUTE',
        idempotency_key: "idempotency-key-1",
    });

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
        const receivedCtx: IJobContext = call.args[3];
        assertStrictEquals(receivedCtx, mockCtx, 'EXECUTE job should receive the same root IJobContext reference');

        if (typeof receivedCtx !== 'object' || receivedCtx === null) {
            throw new Error('Expected EXECUTE job processor to receive an object context');
        }

        assertEquals(Reflect.has(receivedCtx, 'prepareModelJob'), true, 'IJobContext should have prepareModelJob');
        assertEquals(typeof Reflect.get(receivedCtx, 'prepareModelJob'), 'function', 'prepareModelJob should be a function');
        assertEquals(Reflect.has(receivedCtx, 'ragService'), true, 'IJobContext should have ragService');
        assertEquals(Reflect.has(receivedCtx, 'promptAssembler'), true, 'IJobContext should have promptAssembler');
        assertEquals(typeof Reflect.get(receivedCtx, 'getSeedPromptForStage'), 'function', 'IJobContext should have getSeedPromptForStage');

        assertEquals(Reflect.has(receivedCtx, 'planComplexStage'), true, 'root IJobContext includes plan utilities');
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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const mockJob = createMockJobRow(payload, {
        id: 'job-id-slice-plan',
        user_id: 'user-id',
        session_id: 'session-id-slice-plan',
        stage_slug: 'antithesis',
        status: 'pending',
        job_type: 'PLAN',
        idempotency_key: "idempotency-key-1",
    });

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
        idempotencyKey: "idempotency-key-1",
    };
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const mockJob = createMockJobRow(payload, {
        id: 'job-id-slice-render',
        user_id: 'user-id',
        session_id: 'session-id-slice-render',
        stage_slug: 'synthesis',
        status: 'pending',
        job_type: 'RENDER',
        idempotency_key: "idempotency-key-1",
    });

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

// Dispatch strictly by job.job_type: COMPRESS -> processCompressJob
Deno.test('processJob - dispatches by job.job_type: COMPRESS routes to processCompressJob', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-compress-dispatch',
        user_id: 'user-id',
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug,
        status: 'pending',
        job_type: 'COMPRESS',
        idempotency_key: 'idempotency-key-1',
    });

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );

        assertEquals(spies.processCompressJob.calls.length, 1, 'COMPRESS must dispatch to processCompressJob');
        assertEquals(spies.processSimpleJob.calls.length, 0, 'processSimpleJob must not be called for COMPRESS');
        assertEquals(spies.processComplexJob.calls.length, 0, 'processComplexJob must not be called for COMPRESS');
        assertEquals(spies.processRenderJob.calls.length, 0, 'processRenderJob must not be called for COMPRESS');
    } finally {
        spies.processCompressJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - COMPRESS throws Invalid COMPRESS payload when payload fails isDialecticCompressJobPayload', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload = buildDialecticCompressJobPayload();
    Reflect.set(payload, 'sessionId', 123);
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-compress-invalid',
        user_id: 'user-id',
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug,
        status: 'pending',
        job_type: 'COMPRESS',
        idempotency_key: 'idempotency-key-1',
    });

    const mockSupabase = createMockSupabaseClient();

    let threw = false;
    let message = '';
    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );
    } catch (e) {
        threw = true;
        message = e instanceof Error ? e.message : String(e);
    } finally {
        assertEquals(spies.processCompressJob.calls.length, 0, 'processCompressJob must not be called with invalid payload');
        spies.processCompressJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }

    assertEquals(threw, true, 'router should throw for invalid COMPRESS payload');
    assertEquals(message, 'Invalid COMPRESS payload for job job-id-compress-invalid');
});

Deno.test('processJob - COMPRESS updates job status to failed on ProcessCompressJobErrorReturn', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const errorReturn: ProcessCompressJobReturn = { error: new ProcessCompressJobError('compress failed'), retriable: false };
    processors.processCompressJob = async () => errorReturn;

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-compress-error',
        user_id: 'user-id',
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug,
        status: 'pending',
        job_type: 'COMPRESS',
        idempotency_key: 'idempotency-key-1',
    });

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );
    } finally {
        const updateResult = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertEquals(updateResult?.callCount, 1, 'processJob should update dialectic_generation_jobs once on error');
        const updateData = updateResult?.callsArgs[0][0];
        assert(updateData !== null && typeof updateData === 'object');
        assertEquals(Reflect.get(updateData, 'status'), 'failed');
        const errorDetails = Reflect.get(updateData, 'error_details');
        assert(errorDetails !== null && typeof errorDetails === 'object');
        assertEquals(Reflect.get(errorDetails, 'message'), 'compress failed');
        spies.processCompressJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

Deno.test('processJob - COMPRESS does not update dialectic_generation_jobs on success return', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const successReturn: ProcessCompressJobReturn = { queued: true };
    processors.processCompressJob = async () => successReturn;

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-compress-success',
        user_id: 'user-id',
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug,
        status: 'pending',
        job_type: 'COMPRESS',
        idempotency_key: 'idempotency-key-1',
    });

    const mockSupabase = createMockSupabaseClient();

    try {
        await processJob(
            mockSupabase.client as unknown as SupabaseClient<Database>,
            { ...rowJob, payload },
            'user-id',
            processors,
            mockCtx,
            'mock-token',
        );
    } finally {
        const updateResult = mockSupabase.spies.getHistoricQueryBuilderSpies('dialectic_generation_jobs', 'update');
        assertEquals(updateResult?.callCount, 0, 'processJob should not update dialectic_generation_jobs on success');
        spies.processCompressJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});

// COMPRESS deps literal carries all eight members; both closures route to ctx.promptAssembler with the correct deps.
Deno.test('processJob - COMPRESS deps satisfy isProcessCompressJobDeps and both closures route to ctx.promptAssembler with the correct deps', async () => {
    const { processors, spies } = createMockJobProcessors();

    const payload = buildDialecticCompressJobPayload();
    if (!isJson(payload)) throw new Error('Test setup failed: payload not Json');

    const rowJob = createMockJobRow(payload, {
        id: 'job-id-compress-deps',
        user_id: 'user-id',
        session_id: payload.sessionId,
        stage_slug: payload.stageSlug,
        status: 'pending',
        job_type: 'COMPRESS',
        idempotency_key: 'idempotency-key-1',
    });
    const jobArg: DialecticJobRow & { payload: DialecticJobPayload } = { ...rowJob, payload };

    const mockSupabase = createMockSupabaseClient();
    const dbClient = mockSupabase.client as unknown as SupabaseClient<Database>;

    // Production-typed DownloadFromStorageFn declared in the test, wrapped by the runner's spy so the
    // adapter's three-argument call is recorded at the call site (no mock configured).
    const downloadFromStorage: DownloadFromStorageFn = async (
        _supabase,
        _bucket,
        _path,
    ) => ({ data: new ArrayBuffer(0), error: null });
    const downloadFromStorageSpy = spy(downloadFromStorage);

    // Spy the two assembler methods on a fresh IPromptAssembler so the closures' routing is observable.
    const promptAssembler = buildIPromptAssembler();
    const assembleCompressionPromptSpy = spy(promptAssembler, 'assembleCompressionPrompt');
    const assembleContinuationPromptSpy = spy(promptAssembler, 'assembleContinuationPrompt');

    const caseCtx: IJobContext = createMockRootContext({
        downloadFromStorage: downloadFromStorageSpy,
        promptAssembler,
    });

    try {
        await processJob(
            dbClient,
            jobArg,
            'user-id',
            processors,
            caseCtx,
            'mock-token',
        );

        // The deps object handed to processors.processCompressJob satisfies isProcessCompressJobDeps.
        // RED until the literal carries assembleContinuationPrompt (the guard requires it).
        assertEquals(spies.processCompressJob.calls.length, 1, 'processCompressJob must be called once');
        const capturedDeps = spies.processCompressJob.calls[0].args[0];
        assert(isProcessCompressJobDeps(capturedDeps), 'compressDeps must satisfy isProcessCompressJobDeps');

        // Compression closure routes to ctx.promptAssembler.assembleCompressionPrompt with the five-member deps.
        const compressParams = buildAssembleCompressionPromptParams();
        const compressPayload = buildAssembleCompressionPromptPayload();
        await capturedDeps.assembleCompressionPrompt(compressParams, compressPayload);

        assertEquals(assembleCompressionPromptSpy.calls.length, 1, 'assembleCompressionPrompt must be called once');
        const compressCallArgs = assembleCompressionPromptSpy.calls[0].args;
        const compressDepsArg = compressCallArgs[0];
        assertStrictEquals(compressDepsArg.dbClient, dbClient, 'compression closure must pass the router dbClient');
        assertStrictEquals(compressDepsArg.logger, caseCtx.logger, 'compression closure must pass ctx.logger');
        assertStrictEquals(compressDepsArg.fileManager, caseCtx.fileManager, 'compression closure must pass ctx.fileManager');
        assertEquals(typeof compressDepsArg.constructStoragePath, 'function', 'compression closure must pass constructStoragePath');
        assertStrictEquals(compressCallArgs[1], compressParams, 'compression closure must forward params unchanged');
        assertStrictEquals(compressCallArgs[2], compressPayload, 'compression closure must forward payload unchanged');

        // Continuation closure routes to ctx.promptAssembler.assembleContinuationPrompt with the five-member deps.
        await capturedDeps.assembleContinuationPrompt(jobArg);

        assertEquals(assembleContinuationPromptSpy.calls.length, 1, 'assembleContinuationPrompt must be called once');
        const continuationDepsArg = assembleContinuationPromptSpy.calls[0].args[0];
        assertStrictEquals(continuationDepsArg.dbClient, dbClient, 'continuation closure must pass the router dbClient');
        assertStrictEquals(continuationDepsArg.fileManager, caseCtx.fileManager, 'continuation closure must pass ctx.fileManager');
        assertStrictEquals(continuationDepsArg.job, jobArg, 'continuation closure must pass the job it was given');
        assertEquals(typeof continuationDepsArg.constructStoragePath, 'function', 'continuation closure must pass constructStoragePath');

        // None of the six recipe-stage members are supplied — the COMPRESS branch reads none of them.
        assert(!('project' in continuationDepsArg), 'continuation closure must not supply project');
        assert(!('session' in continuationDepsArg), 'continuation closure must not supply session');
        assert(!('stage' in continuationDepsArg), 'continuation closure must not supply stage');
        assert(!('gatherContext' in continuationDepsArg), 'continuation closure must not supply gatherContext');
        assert(!('assembleChunks' in continuationDepsArg), 'continuation closure must not supply assembleChunks');
        assert(!('gatherContinuationInputs' in continuationDepsArg), 'continuation closure must not supply gatherContinuationInputs');

        // The downloadFromStorage adapter takes two arguments and calls ctx.downloadFromStorage with the
        // router's own dbClient prepended, followed by the bucket and path.
        assertEquals(typeof continuationDepsArg.downloadFromStorage, 'function', 'continuation closure must supply downloadFromStorage');
        await continuationDepsArg.downloadFromStorage('my-bucket', 'my/path.md');
        assertEquals(downloadFromStorageSpy.calls.length, 1, 'ctx.downloadFromStorage must be called once by the adapter');
        const dlArgs = downloadFromStorageSpy.calls[0].args;
        assertEquals(dlArgs.length, 3, 'adapter must call ctx.downloadFromStorage with three arguments');
        assertStrictEquals(dlArgs[0] as unknown as SupabaseClient<Database>, dbClient, 'adapter must prepend the router dbClient');
        assertStrictEquals(dlArgs[1], 'my-bucket', 'adapter must forward the bucket');
        assertStrictEquals(dlArgs[2], 'my/path.md', 'adapter must forward the path');
    } finally {
        assembleCompressionPromptSpy.restore();
        assembleContinuationPromptSpy.restore();
        spies.processCompressJob.restore();
        spies.processSimpleJob.restore();
        spies.processComplexJob.restore();
        spies.processRenderJob.restore();
        mockSupabase.clearAllStubs?.();
    }
});