import {
    assertEquals,
    assertExists,
    assert,
} from 'https://deno.land/std@0.190.0/testing/asserts.ts';
import type { Database } from '../types_db.ts';
import { createMockSupabaseClient } from '../_shared/supabase.mock.ts';
import { processComplexJob } from './processComplexJob.ts';
import { PlanComplexStageFn } from '../dialectic-service/dialectic.interface.ts';
import {
    buildDialecticJobRow,
    buildProcessComplexJobPayload,
    buildDialecticStageRecipeStep,
} from '../_shared/dialectic.mock.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ContextWindowError } from '../_shared/utils/errors.ts';
import { describe, it, beforeEach } from 'https://deno.land/std@0.190.0/testing/bdd.ts';
import { mockNotificationService, resetMockNotificationService } from '../_shared/utils/notification.service.mock.ts';
import { createPlanJobContext, createJobContext } from './createJobContext/createJobContext.ts';
import { buildJobContextParams } from './createJobContext/JobContext.mock.ts';
import { spy } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import { isRecord } from '../_shared/utils/type_guards.ts';

describe('processComplexJob - PLAN lifecycle notifications', () => {
    beforeEach(() => {
        resetMockNotificationService();
    });

    // Contract: when the planning pass begins, ctx.notificationService.sendJobNotificationEvent
    // is called with type 'planner_started' carrying sessionId, stageSlug, iterationNumber,
    // job_id and step_key — the five fields JobNotificationBase requires for a PLAN job.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: []; mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // planComplexStage returning one child job.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: sendJobNotificationEvent was called at least once with a payload whose
    // type is 'planner_started', sessionId matches the job's session_id, stageSlug is
    // 'thesis', iterationNumber matches the job's iteration_number, job_id matches the
    // job's id, and step_key is a non-empty string.
    it('all PLAN payloads include sessionId, stageSlug, iterationNumber, job_id, step_key', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const startedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'planner_started',
        );
        assertExists(startedCall);
        const notif = startedCall.args[0];
        if (isRecord(notif) && notif.type === 'planner_started') {
            assertEquals(notif.sessionId, payload.job.session_id);
            assertEquals(notif.stageSlug, 'thesis');
            assertEquals(notif.iterationNumber, payload.job.iteration_number);
            assertEquals(notif.job_id, payload.job.id);
            assertEquals(typeof notif.step_key, 'string');
            assert(notif.step_key.length > 0);
        }
    });

    // Contract: PLAN notifications (planner_started, planner_completed, job_failed)
    // omit modelId and document_key — those fields belong to EXECUTE and RENDER
    // payloads, not PLAN.
    // Arrange: same arrangement as the planner_started test; planComplexStage returns
    // one child job so planner_started fires.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: every sendJobNotificationEvent call's payload lacks 'modelId' and
    // 'document_key' properties.
    it('PLAN payloads do NOT include modelId or document_key', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        for (const call of mockNotificationService.sendJobNotificationEvent.calls) {
            const notif = call.args[0];
            if (isRecord(notif)) {
                assertEquals('modelId' in notif, false);
                assertEquals('document_key' in notif, false);
            }
        }
    });

    // Contract: when the planner returns no child jobs, the parent job is marked
    // completed and ctx.notificationService.sendJobNotificationEvent is called with
    // type 'planner_completed' carrying sessionId, stageSlug, iterationNumber, job_id
    // and step_key.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: []; mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children, insert and update succeed; buildJobContextParams with
    // planComplexStage returning an empty array (no child jobs).
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: sendJobNotificationEvent was called at least once with a payload whose
    // type is 'planner_completed', and the call's recipient is payload.job.user_id.
    it('emits planner_completed when PLAN job transitions to completed (planner returns no children)', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => [];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const completedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'planner_completed',
        );
        assertExists(completedCall);
        const notif = completedCall.args[0];
        if (isRecord(notif) && notif.type === 'planner_completed') {
            assertEquals(notif.sessionId, payload.job.session_id);
            assertEquals(notif.stageSlug, 'thesis');
            assertEquals(notif.iterationNumber, payload.job.iteration_number);
            assertEquals(notif.job_id, payload.job.id);
            assertEquals(typeof notif.step_key, 'string');
            assert(notif.step_key.length > 0);
        }
        assertEquals(completedCall.args[1], payload.job.user_id);
    });

    // Contract: a ContextWindowError thrown inside the planning try block is a
    // non-retriable (terminal) failure — ctx.notificationService.sendJobNotificationEvent
    // is called with type 'job_failed', and the call's recipient is payload.job.user_id.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: []; mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children; buildJobContextParams with planComplexStage throwing a
    // ContextWindowError.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: sendJobNotificationEvent was called at least once with type 'job_failed',
    // and the recipient of that call is payload.job.user_id.
    it('emits job_failed when PLAN job exhausts retries or encounters terminal error', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => {
            throw new ContextWindowError('Context window exceeded');
        };
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const failedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'job_failed',
        );
        assertExists(failedCall);
        assertEquals(failedCall.args[1], payload.job.user_id);
    });

    // Contract: the job_failed notification for a PLAN job omits modelId and
    // document_key — those fields belong to EXECUTE and RENDER payloads.
    // Arrange: same arrangement as the terminal-error test; planComplexStage throws
    // a ContextWindowError.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: the job_failed call's payload lacks 'modelId' and 'document_key'.
    it('job_failed payload for PLAN omits modelId and document_key', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => {
            throw new ContextWindowError('Context window exceeded');
        };
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const failedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'job_failed',
        );
        assertExists(failedCall);
        const notif = failedCall.args[0];
        if (isRecord(notif) && notif.type === 'job_failed') {
            assertEquals('modelId' in notif, false);
            assertEquals('document_key' in notif, false);
        }
    });

    // Contract: the job_failed notification carries an error object with a code and
    // a message — for a ContextWindowError the code is 'CONTEXT_WINDOW_ERROR' and
    // the message is the error's own message.
    // Arrange: same arrangement as the terminal-error test; planComplexStage throws
    // new ContextWindowError('Context window exceeded').
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: the job_failed call's payload carries error.code 'CONTEXT_WINDOW_ERROR'
    // and error.message 'Context window exceeded'.
    it('job_failed payload includes error code and message', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => {
            throw new ContextWindowError('Context window exceeded');
        };
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const failedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'job_failed',
        );
        assertExists(failedCall);
        const notif = failedCall.args[0];
        if (isRecord(notif) && notif.type === 'job_failed') {
            const error = notif.error;
            if (isRecord(error)) {
                assertEquals(error.code, 'CONTEXT_WINDOW_ERROR');
                assertEquals(error.message, 'Context window exceeded');
            }
        }
    });

    // Contract: every notification this function sends is addressed to
    // payload.job.user_id — the recipient read from the job row, not a retired
    // parameter.
    // Arrange: buildProcessComplexJobPayload with a job whose user_id is
    // 'notification-recipient-user'; mock the full valid stage/instance/steps path;
    // planComplexStage returns one child job so planner_started fires.
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: every sendJobNotificationEvent call's second argument (recipient) is
    // 'notification-recipient-user'.
    it('notification is sent to projectOwnerUserId', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const childJob = buildDialecticJobRow({ job_type: 'EXECUTE', parent_job_id: 'a0000002-0000-4000-a000-000000000002' });
        const planComplexStageFn: PlanComplexStageFn = async () => [childJob];
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload({
            job: { ...buildDialecticJobRow({ job_type: 'PLAN' }), user_id: 'notification-recipient-user' },
        });
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null }, insert: { data: null, error: null }, update: { data: null, error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        for (const call of mockNotificationService.sendJobNotificationEvent.calls) {
            assertEquals(call.args[1], 'notification-recipient-user');
        }
    });

    // Contract: a generic Error (not a ContextWindowError) thrown inside the planning
    // try block is a retriable failure — the runner will retry, so no job_failed
    // notification is sent. Arranged in the same file as the terminal case so the
    // gate cannot be deleted without an assertion failing.
    // Arrange: buildProcessComplexJobPayload with default stage_slug 'thesis'; mock
    // dialectic_stages returns a row with active_recipe_instance_id 'instance-1'; mock
    // dialectic_stage_recipe_instances returns a cloned instance; mock
    // dialectic_stage_recipe_steps returns one valid step with inputs_required: []; mock
    // dialectic_stage_recipe_edges returns empty; mock dialectic_generation_jobs select
    // returns empty children; buildJobContextParams with planComplexStage throwing
    // new Error('Planner failed!').
    // Act: processComplexJob(ctx, { dbClient }, { job: payload.job })
    // Assert: no sendJobNotificationEvent call has a payload with type 'job_failed'.
    it('does not emit job_failed when a retriable planning failure occurs', async () => {
        // Arrange
        const validStep = buildDialecticStageRecipeStep({ inputs_required: [] });
        if (validStep === null) throw new Error('buildDialecticStageRecipeStep returned null');
        const planComplexStageFn: PlanComplexStageFn = async () => {
            throw new Error('Planner failed!');
        };
        const planComplexStageSpy = spy(planComplexStageFn);
        const baseParams = buildJobContextParams({ planComplexStage: planComplexStageSpy });
        const root = createJobContext(baseParams);
        const ctx = createPlanJobContext(root);
        const payload = buildProcessComplexJobPayload();
        const { client } = createMockSupabaseClient(undefined, {
            genericMockResults: {
                dialectic_stages: { select: { data: [{ active_recipe_instance_id: 'instance-1' }], error: null } },
                dialectic_stage_recipe_instances: { select: { data: [{ id: 'instance-1', is_cloned: true, template_id: 'template-1', stage_id: 'stage-1', created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z', cloned_at: null }], error: null } },
                dialectic_stage_recipe_steps: { select: { data: [validStep], error: null } },
                dialectic_stage_recipe_edges: { select: { data: [], error: null } },
                dialectic_generation_jobs: { select: { data: [], error: null } },
            },
        });

        // Act
        await processComplexJob(ctx, { dbClient: client as unknown as SupabaseClient<Database> }, { job: payload.job });

        // Assert
        const failedCall = mockNotificationService.sendJobNotificationEvent.calls.find(
            (c) => isRecord(c.args[0]) && c.args[0].type === 'job_failed',
        );
        assertEquals(failedCall, undefined);
    });
});
